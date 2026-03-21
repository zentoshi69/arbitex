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

  // ── Avalanche Chain ─────────────────────────────────────────────────────────
  const avalanche = await prisma.chain.upsert({
    where: { chainId: 43114 },
    create: {
      chainId: 43114,
      name: "Avalanche C-Chain",
      shortName: "avax",
      rpcUrl: process.env["AVALANCHE_RPC_URL"] ?? "https://api.avax.network/ext/bc/C/rpc",
      isEnabled: true,
    },
    update: {},
  });
  console.log(`  ✓ Chain: ${avalanche.name}`);

  // ── Avalanche Venues ────────────────────────────────────────────────────────
  const pangolin = await prisma.venue.upsert({
    where: { chainId_name: { chainId: 43114, name: "Pangolin" } },
    create: {
      chainId: 43114,
      name: "Pangolin",
      protocol: "uniswap_v2",
      routerAddress: "0xe54ca86531e17ef3616d22ca28b0d458b6c89106",
      factoryAddress: "0xefa94de7a4656d787667c749f7e1223d71e9fd88",
      isEnabled: true,
    },
    update: {
      protocol: "uniswap_v2",
      routerAddress: "0xe54ca86531e17ef3616d22ca28b0d458b6c89106",
      factoryAddress: "0xefa94de7a4656d787667c749f7e1223d71e9fd88",
      isEnabled: true,
    },
  });

  const traderJoe = await prisma.venue.upsert({
    where: { chainId_name: { chainId: 43114, name: "TraderJoe" } },
    create: {
      chainId: 43114,
      name: "TraderJoe",
      protocol: "uniswap_v2",
      routerAddress: "0x60ae616a2155ee3d9a68541ba4544862310933d4",
      factoryAddress: "0x9ad6c38be94206ca50bb0d90783181662f0cfa10",
      isEnabled: true,
    },
    update: {
      protocol: "uniswap_v2",
      routerAddress: "0x60ae616a2155ee3d9a68541ba4544862310933d4",
      factoryAddress: "0x9ad6c38be94206ca50bb0d90783181662f0cfa10",
      isEnabled: true,
    },
  });

  const blackholeV2 = await prisma.venue.upsert({
    where: { chainId_name: { chainId: 43114, name: "Blackhole V2" } },
    create: {
      chainId: 43114,
      name: "Blackhole V2",
      protocol: "solidly_v2",
      routerAddress: "0xCaD684775d7879E63f5d319dAcC8086EeCC01B01",
      factoryAddress: "0xFe926062Fb99ca5653080d6c14fE945aD68C265c",
      isEnabled: true,
    },
    update: {
      protocol: "solidly_v2",
      routerAddress: "0xCaD684775d7879E63f5d319dAcC8086EeCC01B01",
      factoryAddress: "0xFe926062Fb99ca5653080d6c14fE945aD68C265c",
      isEnabled: true,
    },
  });

  console.log(`  ✓ Avalanche Venues: Pangolin, TraderJoe, Blackhole V2`);

  // ── Tokens ─────────────────────────────────────────────────────────────────
  const ethTokenDefs = [
    { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", name: "Wrapped Ether", decimals: 18 },
    { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", name: "USD Coin", decimals: 6 },
    { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", symbol: "DAI", name: "Dai Stablecoin", decimals: 18 },
    { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", name: "Tether USD", decimals: 6 },
    { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", symbol: "WBTC", name: "Wrapped BTC", decimals: 8 },
  ];

  for (const t of ethTokenDefs) {
    await prisma.token.upsert({
      where: { chainId_address: { chainId: 1, address: t.address } },
      create: { ...t, chainId: 1, flags: [], isEnabled: true },
      update: {},
    });
  }
  console.log(`  ✓ Ethereum Tokens: ${ethTokenDefs.map((t) => t.symbol).join(", ")}`);

  // ── Avalanche Tokens ────────────────────────────────────────────────────────
  const avaxTokenDefs = [
    { address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", symbol: "WAVAX", name: "Wrapped AVAX", decimals: 18 },
    { address: "0xeF282B38D1ceAB52134CA2cc653a569435744687", symbol: "WRP", name: "WarpChain Token", decimals: 18 },
    { address: "0xA7D7079b0FEAD91F3e65f86E8915Cb59c1a4C664", symbol: "USDC.e", name: "USD Coin (Bridged)", decimals: 6 },
    { address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", symbol: "USDC", name: "USD Coin (Native)", decimals: 6 },
    { address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", symbol: "USDT", name: "Tether USD (Avalanche)", decimals: 6 },
  ];

  const avaxTokens: Record<string, { id: string }> = {};
  for (const t of avaxTokenDefs) {
    const token = await prisma.token.upsert({
      where: { chainId_address: { chainId: 43114, address: t.address } },
      create: { ...t, chainId: 43114, flags: [], isEnabled: true },
      update: { symbol: t.symbol, name: t.name, decimals: t.decimals, isEnabled: true },
    });
    avaxTokens[t.symbol] = token;
  }
  console.log(`  ✓ Avalanche Tokens: ${avaxTokenDefs.map((t) => t.symbol).join(", ")}`);

  // ── Avalanche Pools ─────────────────────────────────────────────────────────
  const poolDefs = [
    // Pangolin V2 pools
    { venue: pangolin, token0: "WAVAX",  token1: "USDC.e", address: "0xbd918Ed441767fe7924e99F6a0E0B568ac1970D9", feeBps: 30 },
    // TraderJoe V2 pools
    { venue: traderJoe, token0: "WAVAX", token1: "USDC.e", address: "0xA389f9430876455C36478DeEa9769B7Ca4E3DDB1", feeBps: 30 },
    // Blackhole V2 pools (Solidly-style — real on-chain addresses)
    { venue: blackholeV2, token0: "USDC", token1: "WRP",   address: "0xc26847bfa980A72c82e924899A989c47b088d7da", feeBps: 30 },
    { venue: blackholeV2, token0: "WAVAX", token1: "USDC",  address: "0xa02ec3ba8d17887567672b2cdcaf525534636ea0", feeBps: 30 },
  ];

  for (const p of poolDefs) {
    const t0 = avaxTokens[p.token0];
    const t1 = avaxTokens[p.token1];
    if (!t0 || !t1) continue;
    await prisma.pool.upsert({
      where: { venueId_token0Id_token1Id_feeBps: { venueId: p.venue.id, token0Id: t0.id, token1Id: t1.id, feeBps: p.feeBps } },
      create: { venueId: p.venue.id, token0Id: t0.id, token1Id: t1.id, poolAddress: p.address, feeBps: p.feeBps, isActive: true },
      update: { poolAddress: p.address, isActive: true },
    });
  }
  console.log(`  ✓ Avalanche Pools: ${poolDefs.length} pools seeded`);

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
