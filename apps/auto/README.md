# `@arbitex/auto` — $AUTO // Automated Automations

The marketing + utility site for the **$AUTO** Solana token: tokenomics,
manifesto, and five live-feel automation terminals.

```
http://localhost:3100/                  Landing
http://localhost:3100/tokenomics        Supply, emission, tax flow
http://localhost:3100/manifesto         Manifesto
http://localhost:3100/terminals/trading      Auto trading bots
http://localhost:3100/terminals/amm          Concentrated-liquidity vaults
http://localhost:3100/terminals/promotions   Raids, bounties, alpha drops
http://localhost:3100/terminals/airdrop      Merkle airdrop + referral graph
http://localhost:3100/terminals/reminders    Wallet-bound triggers
```

## Run locally

```bash
pnpm install
pnpm --filter @arbitex/auto dev
```

The app is a self-contained Next.js 15 / Tailwind 3 build. It does not
depend on the rest of the arbitex stack and runs independently on
port `3100`.

## Tokenomics ($AUTO)

| Field | Value |
| --- | --- |
| Chain | Solana |
| Standard | SPL Token-2022 (Transfer Fee Extension) |
| Total supply | 1,000,000,000 |
| Decimals | 9 |
| Transfer tax | **5.00 %** |
| Tax split | **50 % → Buyback Reserve / 50 % → LP** |
| Reserve withdraw | **does not exist on-chain** (PDA, sealed) |
| Mint authority | renounced |
| Freeze authority | renounced |
| Fee config authority | renounced |
| Program upgrade authority | closed at deploy |

Full Anchor source: [`/contracts/solana/programs/auto-token/src/lib.rs`](../../contracts/solana/programs/auto-token/src/lib.rs)

## Visual system

| Token | Hex | Use |
| --- | --- | --- |
| `sol-green` | `#14F195` | success, reserve, primary CTA |
| `sol-purple` | `#9945FF` | brand, treasury, frames |
| `sol-cyan` | `#22d3ee` | LP, AMM, info |
| `sol-pink` | `#ff2bd6` | promo, IL hedge, accent |
| `terminal-amber` | `#ffb000` | warnings, risk |
| `terminal-red` | `#ff3860` | denied, errors |
| `bg` | `#05030a` | base canvas |

Fonts: **Orbitron** (display), **JetBrains Mono** (terminals), **Inter** (body).

## Stack

- Next.js 15 (App Router, RSC)
- Tailwind 3 with a custom `auto-grad` gradient + neon shadow utilities
- Zero client-side state — every page is server-rendered with deterministic mock data
- No external API calls (yet) — wire to your indexer when ready
