// =====================================================================
//  $AUTO — Automated Automations
//
//  Solana SPL Token-2022 program implementing the AUTO tokenomics:
//
//   • Fixed supply 1,000,000,000 (decimals = 9)
//   • Transfer-fee extension: 5.00% (500 bps) on every transfer
//   • Mint authority + freeze authority renounced post-init
//   • Withheld fees harvested from holder accounts on demand
//   • Harvested fees split 50 / 50:
//        ─ 50% → BUYBACK_RESERVE (program-owned PDA)
//             • PDA token account, owner = program
//             • NO instruction in this program transfers tokens out
//             • The reserve is mathematically sealed: it can only grow
//        ─ 50% → LP_VAULT (program-owned PDA, deposit-only)
//             • Used by an off-chain compounder to top up AUTO/SOL LP
//             • Top-up call CPIs into the AMM and burns the LP receipt
//
//  This program intentionally does NOT expose:
//     • mint_to (mint authority is None after initialize)
//     • set_transfer_fee (fee config authority is None after initialize)
//     • withdraw_from_reserve (the reserve is permanent)
//     • upgrade (the program is set to non-upgradeable on deploy)
//
//  Public instructions:
//     initialize_token         — one-time, creates mint, mints supply,
//                                renounces all authorities
//     initialize_treasury      — one-time, creates reserve + lp vault
//     harvest_to_treasury      — anyone can call; collects withheld
//                                fees from holder accounts into the
//                                mint, then withdraws into a temporary
//                                "buffer" account, then splits 50/50
//                                into reserve + lp_vault
//     compound_lp              — anyone can call; CPIs into the
//                                AMM router with the lp_vault balance
//                                and burns the resulting LP token
//                                (router is configured, not arbitrary)
//
//  Anyone can crank harvest/compound. There is no privileged caller.
// =====================================================================

use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount};

declare_id!("AutoTreasuryProg11111111111111111111111111111");

// ----- Constants ----------------------------------------------------

pub const TOTAL_SUPPLY: u64 = 1_000_000_000_000_000_000; // 1B * 10^9
pub const DECIMALS: u8 = 9;
pub const TRANSFER_FEE_BPS: u16 = 500; // 5.00%
pub const MAX_FEE: u64 = u64::MAX;     // no per-tx cap; fee scales

pub const RESERVE_SPLIT_BPS: u16 = 5_000; // 50.00% to reserve
pub const LP_SPLIT_BPS: u16 = 5_000;      // 50.00% to LP vault
// Invariant enforced at compile time: must sum to 10_000.
const _: () = assert!(RESERVE_SPLIT_BPS + LP_SPLIT_BPS == 10_000);

pub const SEED_TREASURY: &[u8] = b"auto.treasury";
pub const SEED_RESERVE:  &[u8] = b"auto.reserve.v1";   // PDA, sealed
pub const SEED_LP_VAULT: &[u8] = b"auto.lp_vault.v1";  // PDA, deposit-only externally
pub const SEED_BUFFER:   &[u8] = b"auto.fee_buffer.v1";

// =====================================================================

#[program]
pub mod auto_token {
    use super::*;

    /// Initialize the $AUTO mint with the transfer-fee extension and
    /// renounce all authorities. After this returns successfully:
    ///   - mint authority = None
    ///   - freeze authority = None
    ///   - transfer fee config authority = None
    ///   - withdraw withheld authority = treasury PDA (so harvest works)
    pub fn initialize_token(ctx: Context<InitializeToken>, _bump: u8) -> Result<()> {
        let mint_info = ctx.accounts.mint.to_account_info();
        require_keys_eq!(mint_info.owner.clone(), token_2022::ID, AutoError::WrongTokenProgram);

        // Mint must already be created with extensions:
        //   - TransferFeeConfig { fee_basis_points: 500, maximum_fee: u64::MAX,
        //                        transfer_fee_config_authority: None,
        //                        withdraw_withheld_authority: Some(treasury_pda) }
        // We assert the on-chain configuration matches what we expect,
        // and then mint the entire supply to the treasury initial-bag
        // account in a single CPI. The mint authority is renounced
        // immediately after.

        // 1. Sanity check the mint extensions are configured correctly.
        verify_transfer_fee_config(
            &mint_info,
            TRANSFER_FEE_BPS,
            ctx.accounts.treasury.key(),
        )?;

        // 2. Mint full supply to the launch_bag (this is the account
        //    that will be split into LP seed, reserve seed, airdrops,
        //    builders).
        token_2022::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_2022::MintTo {
                    mint: mint_info.clone(),
                    to: ctx.accounts.launch_bag.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
            ),
            TOTAL_SUPPLY,
        )?;

        // 3. Renounce mint authority + freeze authority. After this,
        //    no further $AUTO can ever be created.
        token_2022::set_authority(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_2022::SetAuthority {
                    current_authority: ctx.accounts.mint_authority.to_account_info(),
                    account_or_mint: mint_info.clone(),
                },
            ),
            anchor_spl::token_2022::spl_token_2022::instruction::AuthorityType::MintTokens,
            None,
        )?;
        token_2022::set_authority(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_2022::SetAuthority {
                    current_authority: ctx.accounts.freeze_authority.to_account_info(),
                    account_or_mint: mint_info.clone(),
                },
            ),
            anchor_spl::token_2022::spl_token_2022::instruction::AuthorityType::FreezeAccount,
            None,
        )?;

        // 4. Renounce the transfer fee config authority. The 5% rate
        //    is now permanent.
        token_2022::set_authority(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_2022::SetAuthority {
                    current_authority: ctx.accounts.fee_config_authority.to_account_info(),
                    account_or_mint: mint_info.clone(),
                },
            ),
            anchor_spl::token_2022::spl_token_2022::instruction::AuthorityType::TransferFeeConfig,
            None,
        )?;

        emit!(TokenInitialized {
            mint: ctx.accounts.mint.key(),
            supply: TOTAL_SUPPLY,
            transfer_fee_bps: TRANSFER_FEE_BPS,
            treasury: ctx.accounts.treasury.key(),
        });

        Ok(())
    }

    /// Initialize the treasury PDA, the (sealed) reserve token account,
    /// and the LP vault. This is callable exactly once — Anchor's
    /// `init` constraint enforces it.
    pub fn initialize_treasury(ctx: Context<InitializeTreasury>) -> Result<()> {
        let treasury = &mut ctx.accounts.treasury;
        treasury.bump = ctx.bumps.treasury;
        treasury.mint = ctx.accounts.mint.key();
        treasury.reserve = ctx.accounts.reserve.key();
        treasury.lp_vault = ctx.accounts.lp_vault.key();
        treasury.amm_router = ctx.accounts.amm_router.key();
        treasury.total_harvested = 0;
        treasury.total_to_reserve = 0;
        treasury.total_to_lp = 0;
        treasury.total_compounded = 0;
        treasury.created_at = Clock::get()?.unix_timestamp;

        emit!(TreasuryInitialized {
            treasury: treasury.key(),
            reserve: treasury.reserve,
            lp_vault: treasury.lp_vault,
        });
        Ok(())
    }

    /// Crank: collect withheld fees from one or more holder accounts
    /// into the mint, then withdraw them into the fee buffer, and
    /// finally split 50% to the sealed reserve and 50% to the LP vault.
    ///
    /// The caller passes the holder accounts as remaining_accounts.
    /// Anyone can call this. There is no caller-priority.
    pub fn harvest_to_treasury<'info>(
        ctx: Context<'_, '_, 'info, 'info, HarvestToTreasury<'info>>,
    ) -> Result<()> {
        let treasury_seeds: &[&[u8]] = &[SEED_TREASURY, &[ctx.accounts.treasury.bump]];
        let signer = &[treasury_seeds];

        // 1. Harvest withheld fees from the holder accounts into the mint.
        let holder_accounts: Vec<AccountInfo<'info>> = ctx.remaining_accounts.to_vec();
        if !holder_accounts.is_empty() {
            anchor_spl::token_2022_extensions::transfer_fee::harvest_withheld_tokens_to_mint(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    anchor_spl::token_2022_extensions::transfer_fee::HarvestWithheldTokensToMint {
                        token_program_id: ctx.accounts.token_program.to_account_info(),
                        mint: ctx.accounts.mint.to_account_info(),
                    },
                )
                .with_remaining_accounts(holder_accounts),
            )?;
        }

        // 2. Withdraw withheld from mint into the fee buffer.
        anchor_spl::token_2022_extensions::transfer_fee::withdraw_withheld_tokens_from_mint(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token_2022_extensions::transfer_fee::WithdrawWithheldTokensFromMint {
                    token_program_id: ctx.accounts.token_program.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    destination: ctx.accounts.fee_buffer.to_account_info(),
                    authority: ctx.accounts.treasury.to_account_info(),
                },
                signer,
            ),
        )?;

        // 3. Re-read the buffer balance to know the harvested amount.
        let buffer_data = ctx.accounts.fee_buffer.to_account_info();
        let buffer = TokenAccount::try_deserialize(&mut &buffer_data.try_borrow_data()?[..])?;
        let harvested = buffer.amount;
        require!(harvested > 0, AutoError::NothingToHarvest);

        // 4. Split — integer math, with the LP slice absorbing rounding
        //    to keep the reserve "≤ exact split" forever.
        let to_reserve: u64 = checked_pct(harvested, RESERVE_SPLIT_BPS)?;
        let to_lp: u64 = harvested
            .checked_sub(to_reserve)
            .ok_or(AutoError::MathOverflow)?;

        // 5. Transfer reserve slice into the SEALED reserve PDA.
        token_2022::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token_2022::TransferChecked {
                    from: ctx.accounts.fee_buffer.to_account_info(),
                    to: ctx.accounts.reserve.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.treasury.to_account_info(),
                },
                signer,
            ),
            to_reserve,
            DECIMALS,
        )?;

        // 6. Transfer LP slice into the LP vault.
        token_2022::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token_2022::TransferChecked {
                    from: ctx.accounts.fee_buffer.to_account_info(),
                    to: ctx.accounts.lp_vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.treasury.to_account_info(),
                },
                signer,
            ),
            to_lp,
            DECIMALS,
        )?;

        // 7. Bookkeeping.
        let t = &mut ctx.accounts.treasury;
        t.total_harvested = t.total_harvested.saturating_add(harvested);
        t.total_to_reserve = t.total_to_reserve.saturating_add(to_reserve);
        t.total_to_lp = t.total_to_lp.saturating_add(to_lp);

        emit!(HarvestExecuted {
            harvested,
            to_reserve,
            to_lp,
            slot: Clock::get()?.slot,
        });
        Ok(())
    }

    /// Crank: take the LP-vault balance and add liquidity to the
    /// AUTO/SOL pool through a whitelisted AMM router. Receives LP
    /// tokens and immediately BURNS them so liquidity is locked.
    ///
    /// The router program is fixed at treasury-init time. Anyone can
    /// call this. No discretion.
    pub fn compound_lp(ctx: Context<CompoundLp>, min_sol_in: u64, min_lp_out: u64) -> Result<()> {
        let amount = ctx.accounts.lp_vault.amount;
        require!(amount > 0, AutoError::NothingToCompound);
        require_keys_eq!(
            ctx.accounts.amm_router.key(),
            ctx.accounts.treasury.amm_router,
            AutoError::WrongRouter,
        );

        // The router is responsible for: half the AUTO is swapped to
        // SOL, the other half is paired with that SOL into the LP, and
        // the resulting LP token is sent to the lp_token_burn_account.
        // After this CPI returns, we burn the LP tokens unconditionally.
        //
        // The router-CPI implementation lives in a separate program;
        // this contract intentionally does not include arbitrary CPI
        // surface — `amm_router` is pinned in the treasury account.

        amm_router_cpi::add_liquidity_and_lock(
            &ctx.accounts.amm_router,
            &ctx.accounts.lp_vault,
            &ctx.accounts.lp_token_burn_account,
            ctx.accounts.treasury.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            amount,
            min_sol_in,
            min_lp_out,
            &[&[SEED_TREASURY, &[ctx.accounts.treasury.bump]]],
        )?;

        // Burn LP tokens received → liquidity is permanent.
        let lp_amount = ctx.accounts.lp_token_burn_account.amount;
        if lp_amount > 0 {
            token_2022::burn(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    token_2022::Burn {
                        mint: ctx.accounts.lp_mint.to_account_info(),
                        from: ctx.accounts.lp_token_burn_account.to_account_info(),
                        authority: ctx.accounts.treasury.to_account_info(),
                    },
                    &[&[SEED_TREASURY, &[ctx.accounts.treasury.bump]]],
                ),
                lp_amount,
            )?;
        }

        let t = &mut ctx.accounts.treasury;
        t.total_compounded = t.total_compounded.saturating_add(amount);

        emit!(LpCompounded {
            auto_in: amount,
            lp_burned: lp_amount,
            slot: Clock::get()?.slot,
        });

        Ok(())
    }

    // -----------------------------------------------------------------
    //  NOT IMPLEMENTED — left here as documentation of what is missing
    //  by design. Any attempt to add these in a future deploy would
    //  also fail because the program is set non-upgradeable.
    //
    //  pub fn withdraw_from_reserve(...)  — DOES NOT EXIST
    //  pub fn change_split(...)           — DOES NOT EXIST
    //  pub fn set_amm_router(...)         — DOES NOT EXIST
    //  pub fn pause(...)                  — DOES NOT EXIST
    // -----------------------------------------------------------------
}

// ----- Accounts -----------------------------------------------------

#[derive(Accounts)]
pub struct InitializeToken<'info> {
    /// SPL Token-2022 mint, pre-created with the transfer-fee extension.
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// One-time mint authority (signer); will be renounced inside the ix.
    #[account(mut)]
    pub mint_authority: Signer<'info>,

    /// One-time freeze authority (signer); will be renounced inside the ix.
    pub freeze_authority: Signer<'info>,

    /// One-time fee-config authority (signer); will be renounced inside the ix.
    pub fee_config_authority: Signer<'info>,

    /// Account that receives the entire initial supply (becomes the
    /// "launch bag" — ops will then move into LP, reserve, airdrops).
    #[account(mut)]
    pub launch_bag: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: PDA used as withdraw-withheld authority + reserve owner.
    #[account(seeds = [SEED_TREASURY], bump)]
    pub treasury: AccountInfo<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct InitializeTreasury<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + Treasury::SPACE,
        seeds = [SEED_TREASURY],
        bump,
    )]
    pub treasury: Account<'info, Treasury>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// Sealed reserve token account. Owner = treasury PDA.
    #[account(
        init,
        payer = payer,
        seeds = [SEED_RESERVE],
        bump,
        token::mint = mint,
        token::authority = treasury,
        token::token_program = token_program,
    )]
    pub reserve: InterfaceAccount<'info, TokenAccount>,

    /// LP vault (deposit-only externally; can only be drained via
    /// `compound_lp` which routes into the AMM and burns LP tokens).
    #[account(
        init,
        payer = payer,
        seeds = [SEED_LP_VAULT],
        bump,
        token::mint = mint,
        token::authority = treasury,
        token::token_program = token_program,
    )]
    pub lp_vault: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: pinned AMM router program ID, stored in treasury.
    pub amm_router: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct HarvestToTreasury<'info> {
    #[account(mut, seeds = [SEED_TREASURY], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,

    #[account(mut, address = treasury.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// Temporary fee buffer owned by treasury — created on first call.
    #[account(
        init_if_needed,
        payer = cranker,
        seeds = [SEED_BUFFER],
        bump,
        token::mint = mint,
        token::authority = treasury,
        token::token_program = token_program,
    )]
    pub fee_buffer: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, address = treasury.reserve)]
    pub reserve: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, address = treasury.lp_vault)]
    pub lp_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub cranker: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CompoundLp<'info> {
    #[account(mut, seeds = [SEED_TREASURY], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,

    #[account(mut, address = treasury.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut, address = treasury.lp_vault)]
    pub lp_vault: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: pinned router (= treasury.amm_router).
    pub amm_router: AccountInfo<'info>,

    /// LP mint of the AUTO/SOL pool.
    #[account(mut)]
    pub lp_mint: InterfaceAccount<'info, Mint>,

    /// Token account that receives LP tokens from the router and is
    /// then immediately burned.
    #[account(mut, token::mint = lp_mint, token::authority = treasury)]
    pub lp_token_burn_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

// ----- State --------------------------------------------------------

#[account]
pub struct Treasury {
    pub bump: u8,
    pub mint: Pubkey,
    pub reserve: Pubkey,
    pub lp_vault: Pubkey,
    pub amm_router: Pubkey,
    pub total_harvested: u128,
    pub total_to_reserve: u128,
    pub total_to_lp: u128,
    pub total_compounded: u128,
    pub created_at: i64,
}

impl Treasury {
    pub const SPACE: usize = 1 + 32 * 4 + 16 * 4 + 8;
}

// ----- Events -------------------------------------------------------

#[event]
pub struct TokenInitialized {
    pub mint: Pubkey,
    pub supply: u64,
    pub transfer_fee_bps: u16,
    pub treasury: Pubkey,
}

#[event]
pub struct TreasuryInitialized {
    pub treasury: Pubkey,
    pub reserve: Pubkey,
    pub lp_vault: Pubkey,
}

#[event]
pub struct HarvestExecuted {
    pub harvested: u64,
    pub to_reserve: u64,
    pub to_lp: u64,
    pub slot: u64,
}

#[event]
pub struct LpCompounded {
    pub auto_in: u64,
    pub lp_burned: u64,
    pub slot: u64,
}

// ----- Errors -------------------------------------------------------

#[error_code]
pub enum AutoError {
    #[msg("token account is not owned by the SPL Token-2022 program")]
    WrongTokenProgram,
    #[msg("transfer fee config does not match expected $AUTO parameters")]
    BadTransferFeeConfig,
    #[msg("nothing to harvest yet")]
    NothingToHarvest,
    #[msg("nothing to compound yet")]
    NothingToCompound,
    #[msg("amm router does not match the one pinned at init time")]
    WrongRouter,
    #[msg("integer overflow")]
    MathOverflow,
}

// ----- Helpers ------------------------------------------------------

fn checked_pct(amount: u64, bps: u16) -> Result<u64> {
    let v = (amount as u128)
        .checked_mul(bps as u128)
        .ok_or(AutoError::MathOverflow)?
        / 10_000u128;
    u64::try_from(v).map_err(|_| AutoError::MathOverflow.into())
}

/// Asserts that the mint is configured with:
///   * transfer fee = `expected_bps`
///   * transfer-fee-config authority = None
///   * withdraw-withheld authority = `expected_withdraw_authority`
fn verify_transfer_fee_config(
    mint_info: &AccountInfo,
    expected_bps: u16,
    expected_withdraw_authority: Pubkey,
) -> Result<()> {
    use anchor_spl::token_2022::spl_token_2022::extension::{
        transfer_fee::TransferFeeConfig, BaseStateWithExtensions, StateWithExtensions,
    };
    let data = mint_info.try_borrow_data()?;
    let state = StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&data)
        .map_err(|_| AutoError::BadTransferFeeConfig)?;
    let fee = state
        .get_extension::<TransferFeeConfig>()
        .map_err(|_| AutoError::BadTransferFeeConfig)?;

    let new_rate: u16 = fee.newer_transfer_fee.transfer_fee_basis_points.into();
    require!(new_rate == expected_bps, AutoError::BadTransferFeeConfig);

    let cfg_auth: Option<Pubkey> = fee.transfer_fee_config_authority.into();
    require!(cfg_auth.is_none(), AutoError::BadTransferFeeConfig);

    let wd_auth: Option<Pubkey> = fee.withdraw_withheld_authority.into();
    require!(
        wd_auth == Some(expected_withdraw_authority),
        AutoError::BadTransferFeeConfig
    );
    Ok(())
}

// ----- AMM router CPI shim ------------------------------------------
//
// The compound_lp instruction calls into a pinned external program
// (the AUTO/SOL Raydium-CLMM or Meteora compounder). The interface is
// minimal and lives here so that `compound_lp` has zero discretion.

mod amm_router_cpi {
    use super::*;

    #[allow(clippy::too_many_arguments)]
    pub fn add_liquidity_and_lock<'info>(
        _router: &AccountInfo<'info>,
        _lp_vault: &InterfaceAccount<'info, TokenAccount>,
        _lp_burn_account: &InterfaceAccount<'info, TokenAccount>,
        _treasury: AccountInfo<'info>,
        _token_program: AccountInfo<'info>,
        _amount_in: u64,
        _min_sol_in: u64,
        _min_lp_out: u64,
        _signer_seeds: &[&[&[u8]]],
    ) -> Result<()> {
        // Implementation intentionally elided in this snapshot — the
        // router program owns the swap-half/add-LP/return-LP logic.
        // The call signature is fixed: amount_in is taken from
        // lp_vault, LP tokens are minted into lp_burn_account, and
        // this program then burns them in `compound_lp`.
        Ok(())
    }
}
