// Deterministic mock data — no randomness during render so SSR + CSR stay in sync.

export const TOKEN = {
  name: "AUTO",
  symbol: "$AUTO",
  chain: "Solana",
  standard: "SPL Token-2022 (Transfer Fee Extension)",
  totalSupply: 1_000_000_000,
  decimals: 9,
  taxBps: 500, // 5.00%
  taxSplit: { buybackReserve: 50, lp: 50 },
  mint: "AUToBkBkBkBkBkBkBkBkBkBkBkBkBkBkBkBkBkBkBkBk",
  treasury: "TrSyAuToReServeNeverSelLsXxXxXxXxXxXxXxXxXx",
  lpVault: "LPv1AuToLiquidityPooLAUtoSoLXxXxXxXxXxXxXxXx",
  programId: "AutoTreasuryProg11111111111111111111111111111",
};

export const SUPPLY = [
  { label: "Public Liquidity", pct: 60, color: "#14F195" },
  { label: "Buyback Reserve", pct: 15, color: "#22d3ee" },
  { label: "Automation Treasury", pct: 12, color: "#9945FF" },
  { label: "Airdrops & Referrals", pct: 8, color: "#ff2bd6" },
  { label: "Builders / DAO", pct: 5, color: "#ffb000" },
];

export const EMISSION_SCHEDULE = [
  { phase: "Genesis Mint", supplyPct: 100, when: "Block 0" },
  { phase: "LP Lock", supplyPct: 60, when: "T+0" },
  { phase: "Reserve Lock (PDA, no withdraw)", supplyPct: 15, when: "T+0" },
  { phase: "Treasury vesting cliff", supplyPct: 12, when: "T+30d" },
  { phase: "Airdrop S1", supplyPct: 4, when: "T+7d" },
  { phase: "Airdrop S2", supplyPct: 4, when: "T+45d" },
];

export const AUTOMATIONS = [
  {
    slug: "trading",
    name: "AUTO//TRADER",
    tagline: "Multi-strategy trading bots, fully autonomous.",
    color: "sol-green",
    description:
      "Grid, momentum, and mean-reversion strategies executing 24/7 across Jupiter, Orca, Raydium and Meteora. Risk-checked, MEV-aware, and gas-rebated.",
  },
  {
    slug: "amm",
    name: "AUTO//AMM",
    tagline: "Automated market maker with rebalancing vaults.",
    color: "sol-cyan",
    description:
      "Concentrated-liquidity vaults that auto-rebalance ranges, harvest fees, and compound back into LP. Set range bias, harvest cadence, and exit guards.",
  },
  {
    slug: "promotions",
    name: "AUTO//PROMO",
    tagline: "Automated promotions, raids and bounties.",
    color: "sol-pink",
    description:
      "Schedule raids, throttle alpha drops, gate bounties by on-chain criteria and pay claims atomically. Native bridges to X, Telegram, and Discord webhooks.",
  },
  {
    slug: "airdrop",
    name: "AUTO//DROP",
    tagline: "Self-propagating airdrop & referral graph.",
    color: "sol-purple",
    description:
      "Merkle-distributed airdrops with multi-tier referral tracking. Claims execute on-chain; referrers earn from a sealed pool, never from the recipient.",
  },
  {
    slug: "reminders",
    name: "AUTO//REMIND",
    tagline: "Programmable wallet reminders & alerts.",
    color: "sol-magenta",
    description:
      "Wallet-bound triggers for unlocks, vesting, governance votes, low-balance, and price thresholds. Delivered via webhook, email, Telegram, or on-chain log.",
  },
] as const;

export const TICKER = [
  { sym: "AUTO", price: 0.01337, chg: 999.42 },
  { sym: "SOL", price: 184.21, chg: 2.34 },
  { sym: "JUP", price: 0.94, chg: -1.12 },
  { sym: "JTO", price: 3.41, chg: 4.02 },
  { sym: "BONK", price: 0.0000241, chg: 6.18 },
  { sym: "WIF", price: 2.13, chg: -2.4 },
  { sym: "PYTH", price: 0.42, chg: 0.91 },
  { sym: "RAY", price: 5.81, chg: 1.74 },
];

export const TRADING_LOG = [
  { t: "00:00:01", side: "BUY", pair: "AUTO/SOL", size: 12_400, px: 0.01331, pnl: "+0.00", note: "grid-lvl-3" },
  { t: "00:00:04", side: "SELL", pair: "AUTO/SOL", size: 12_400, px: 0.01342, pnl: "+13.64", note: "tp-step" },
  { t: "00:00:08", side: "BUY", pair: "JUP/USDC", size: 4_812, px: 0.9381, pnl: "+0.00", note: "mom-cross" },
  { t: "00:00:13", side: "SELL", pair: "JUP/USDC", size: 4_812, px: 0.9462, pnl: "+38.97", note: "trail-stop" },
  { t: "00:00:21", side: "BUY", pair: "JTO/USDC", size: 800, px: 3.398, pnl: "+0.00", note: "rev-z" },
  { t: "00:00:28", side: "SELL", pair: "JTO/USDC", size: 800, px: 3.421, pnl: "+18.40", note: "z-exit" },
  { t: "00:00:34", side: "BUY", pair: "AUTO/SOL", size: 22_000, px: 0.01338, pnl: "+0.00", note: "vol-spike" },
  { t: "00:00:41", side: "SELL", pair: "AUTO/SOL", size: 22_000, px: 0.01355, pnl: "+37.40", note: "pop-fade" },
  { t: "00:00:49", side: "REJECT", pair: "WIF/USDC", size: 1_200, px: 2.131, pnl: "—", note: "risk:slip>30bps" },
  { t: "00:00:55", side: "BUY", pair: "PYTH/USDC", size: 9_400, px: 0.4194, pnl: "+0.00", note: "carry-roll" },
];

export const AMM_VAULTS = [
  { pair: "AUTO/SOL", tvl: 4_812_000, apr: 312.4, range: "±18%", harvest: "every 6m" },
  { pair: "AUTO/USDC", tvl: 2_140_000, apr: 184.2, range: "±12%", harvest: "every 9m" },
  { pair: "SOL/USDC", tvl: 12_900_000, apr: 41.7, range: "±4%", harvest: "every 30s" },
  { pair: "JUP/SOL", tvl: 3_310_000, apr: 92.1, range: "±9%", harvest: "every 3m" },
];

export const PROMO_CAMPAIGNS = [
  { id: "AUTO-RAID-014", platform: "X", reward: "1,200 $AUTO", filled: 87, cap: 250, status: "LIVE" },
  { id: "AUTO-TG-007", platform: "Telegram", reward: "500 $AUTO", filled: 250, cap: 250, status: "FULL" },
  { id: "AUTO-DC-022", platform: "Discord", reward: "800 $AUTO", filled: 41, cap: 500, status: "LIVE" },
  { id: "AUTO-BNTY-031", platform: "GitHub", reward: "12,000 $AUTO", filled: 3, cap: 10, status: "LIVE" },
];

export const AIRDROP_TIERS = [
  { tier: "T1 - Seed Holder", criteria: "≥ 1,000 $AUTO held 30d", reward: 5_000, claimed: 412 },
  { tier: "T2 - LP Provider", criteria: "≥ $500 LP for 14d", reward: 3_500, claimed: 1_188 },
  { tier: "T3 - Trader", criteria: "≥ 25 swaps via Jupiter", reward: 2_000, claimed: 4_421 },
  { tier: "T4 - Referrer", criteria: "1+ activated referral", reward: 1_500, claimed: 9_103 },
];

export const REMINDER_TEMPLATES = [
  { name: "Vesting Unlock", trigger: "on cliff(<wallet>, <mint>)", channel: "telegram" },
  { name: "Price Alert", trigger: "px(AUTO/USDC) ≥ 0.05", channel: "webhook" },
  { name: "Governance Vote", trigger: "new_proposal(realm)", channel: "email" },
  { name: "Low SOL Balance", trigger: "sol_balance(<wallet>) < 0.1", channel: "telegram" },
  { name: "Stake Epoch End", trigger: "epoch_end(<validator>)", channel: "discord" },
];

export const SOCIAL_PROOF = [
  { metric: "Bots Deployed", value: 4_812 },
  { metric: "Wallets Automated", value: 91_204 },
  { metric: "Auto-Buybacks Executed", value: 18_443 },
  { metric: "Reserve Locked (USD)", value: 6_240_000 },
];
