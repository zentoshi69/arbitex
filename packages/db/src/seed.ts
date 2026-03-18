/**
 * Seed script — run with: pnpm db:seed
 * Populates reference data for local development.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding ArbitEx database…");

  // ── Chains ─────────────────────────────────────────────────────────────────
  const ethereum = await prisma.chain.upsert({
    where: { chainId: 1 },
    create: {
      chainId: 1,
      name: "Ethereum Mainnet",
      shortName: "eth",
      rpcUrl: process.env["ETHEREUM_RPC_URL"] ?? process.env["AVALANCHE_RPC_URL"] ?? "https://eth-mainnet.g.alchemy.com/v2/demo",
      isEnabled: true,
    },
    update: {},
  });
  console.log(`  ✓ Chain: ${ethereum.name}`);

  // ── Venues ─────────────────────────────────────────────────────────────────
  const uniswapV3 = await prisma.venue.upsert({
    where: { chainId_name: { chainId: 1, name: "Uniswap V3" } },
    create: {
      chainId: 1,
      name: "Uniswap V3",
      protocol: "uniswap_v3",
      routerAddress: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
      factoryAddress: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      isEnabled: true,
    },
    update: {},
  });

  const sushiswap = await prisma.venue.upsert({
    where: { chainId_name: { chainId: 1, name: "SushiSwap V2" } },
    create: {
      chainId: 1,
      name: "SushiSwap V2",
      protocol: "sushiswap_v2",
      routerAddress: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
      factoryAddress: "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac",
      isEnabled: true,
    },
    update: {},
  });
  console.log(`  ✓ Venues: Uniswap V3, SushiSwap V2`);

  // ── Tokens ─────────────────────────────────────────────────────────────────
  const tokenDefs = [
    {
      address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      symbol: "WETH",
      name: "Wrapped Ether",
      decimals: 18,
    },
    {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
    },
    {
      address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      symbol: "DAI",
      name: "Dai Stablecoin",
      decimals: 18,
    },
    {
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
    },
    {
      address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      symbol: "WBTC",
      name: "Wrapped BTC",
      decimals: 8,
    },
  ];

  for (const t of tokenDefs) {
    await prisma.token.upsert({
      where: { chainId_address: { chainId: 1, address: t.address } },
      create: { ...t, chainId: 1, flags: [], isEnabled: true },
      update: {},
    });
  }
  console.log(`  ✓ Tokens: ${tokenDefs.map((t) => t.symbol).join(", ")}`);

  // ── Mock wallet balance entry ───────────────────────────────────────────────
  const weth = await prisma.token.findFirst({
    where: { chainId: 1, symbol: "WETH" },
  });
  const usdc = await prisma.token.findFirst({
    where: { chainId: 1, symbol: "USDC" },
  });

  const MOCK_WALLET = "0x1234567890123456789012345678901234567890";

  if (weth) {
    await prisma.walletBalance.upsert({
      where: { walletAddress_tokenId: { walletAddress: MOCK_WALLET, tokenId: weth.id } },
      create: {
        walletAddress: MOCK_WALLET,
        tokenId: weth.id,
        balanceWei: "10000000000000000000", // 10 WETH
        usdValue: 20000,
      },
      update: {},
    });
  }
  if (usdc) {
    await prisma.walletBalance.upsert({
      where: { walletAddress_tokenId: { walletAddress: MOCK_WALLET, tokenId: usdc.id } },
      create: {
        walletAddress: MOCK_WALLET,
        tokenId: usdc.id,
        balanceWei: "50000000000", // 50,000 USDC (6 decimals)
        usdValue: 50000,
      },
      update: {},
    });
  }
  console.log(`  ✓ Wallet balances seeded for ${MOCK_WALLET}`);

  // ── Config overrides (default risk params) ─────────────────────────────────
  const defaults = [
    { key: "maxTradeSizeUsd", value: "1000" },
    { key: "minNetProfitUsd", value: "5" },
    { key: "maxGasGwei", value: "100" },
    { key: "minPoolLiquidityUsd", value: "100000" },
    { key: "maxFailedTxPerHour", value: "5" },
    { key: "maxSlippageBps", value: "50" },
    { key: "maxTokenExposureUsd", value: "25000" },
    { key: "tokenCooldownSeconds", value: "300" },
  ];

  for (const cfg of defaults) {
    await prisma.configOverride.upsert({
      where: { key: cfg.key },
      create: { key: cfg.key, value: cfg.value, updatedBy: "seed" },
      update: {},
    });
  }
  console.log(`  ✓ Risk config defaults seeded`);

  console.log("\n✅ Seed complete!");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
