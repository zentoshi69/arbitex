# `$AUTO` — Solana program

The on-chain half of **$AUTO // Automated Automations**.

## What this program does

* Wraps an SPL **Token-2022** mint with the **transfer-fee extension**.
* Hard-codes a **5.00 %** transfer tax (500 bps).
* Provides a permissionless `harvest_to_treasury` crank that:
  1. Harvests withheld fees from holder accounts into the mint.
  2. Withdraws them into a buffer account owned by the program.
  3. Splits the buffer **50 / 50** between:
     * a **sealed buyback reserve** (PDA — the program does not implement
       any instruction that can transfer tokens out of it), and
     * an **LP vault** that can only be drained via `compound_lp`,
       which deposits into the AUTO/SOL pool through a **pinned**
       AMM router and **burns** the LP tokens it receives.

## What this program intentionally does **not** do

| Missing instruction | Why |
| --- | --- |
| `withdraw_from_reserve` | Reserve must grow forever. No path out. |
| `change_split` / `change_fee` | Authorities renounced at init. |
| `set_amm_router` | Router pinned at init. No swap-target rug. |
| `pause` | No human in the hot path. |
| `upgrade` | Program authority is closed on deploy. |

## Key constants

```rust
TOTAL_SUPPLY        = 1_000_000_000_000_000_000  // 1B * 10^9
DECIMALS            = 9
TRANSFER_FEE_BPS    = 500       // 5.00%
RESERVE_SPLIT_BPS   = 5_000     // 50.00%
LP_SPLIT_BPS        = 5_000     // 50.00%
```

The split invariant is enforced **at compile time**:

```rust
const _: () = assert!(RESERVE_SPLIT_BPS + LP_SPLIT_BPS == 10_000);
```

## Layout

```
contracts/solana/
├── Anchor.toml
├── Cargo.toml
└── programs/
    └── auto-token/
        ├── Cargo.toml
        └── src/
            └── lib.rs        # the program
```

## Build / test (locally)

```bash
cd contracts/solana
anchor build
anchor test
```

> The `compound_lp` instruction calls into a pinned AMM router program.
> The router CPI signature is fixed in `amm_router_cpi::add_liquidity_and_lock`;
> swap routing for the buyback half lives in that router program, not
> here, to keep this program's discretion at zero.

## Deploy checklist

- [ ] Pre-create the mint with the transfer-fee extension and
      `withdraw_withheld_authority = treasury PDA`.
- [ ] Run `initialize_token` (renounces all authorities).
- [ ] Run `initialize_treasury` (creates reserve + LP vault PDAs,
      pins AMM router).
- [ ] Move 60% of supply into the AUTO/SOL pool, burn LP receipt.
- [ ] Move 15% of supply into the sealed reserve.
- [ ] Move 8% of supply into the airdrop merkle distributor.
- [ ] Move 12% of supply into the time-locked treasury PDA (separate program).
- [ ] Move 5% of supply into the DAO PDA.
- [ ] Set program upgrade authority to **None** (`solana program set-upgrade-authority --final`).
- [ ] Verify on-chain that all four authorities (mint, freeze, fee-config,
      program-upgrade) are `None`.
- [ ] Publish the on-chain account addresses.

## Security model

* **No upgrade path.** The program is non-upgradeable post-deploy.
* **No team key.** Every instruction is permissionless or PDA-signed.
* **No discretion.** The router is pinned. The split is constant.
* **Fail-safe split.** Integer-rounding goes to the LP slice, never
  to the reserve, so the reserve is always **≤** its theoretical share.

## License

MIT
