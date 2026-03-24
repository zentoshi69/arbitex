/**
 * Seed script — run with: pnpm db:seed
 * Populates reference data for local development (Avalanche C-Chain focused).
 *
 * ALL pool addresses below are verified on-chain via factory getPair / getPool.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding ArbitEx database…");

  // ── Chains ─────────────────────────────────────────────────────────────────
  await prisma.chain.upsert({
    where: { chainId: 1 },
    create: {
      chainId: 1,
      name: "Ethereum Mainnet",
      shortName: "eth",
      rpcUrl: process.env["ETHEREUM_RPC_URL"] ?? "https://eth-mainnet.g.alchemy.com/v2/demo",
      isEnabled: false,
    },
    update: {},
  });

  const avalanche = await prisma.chain.upsert({
    where: { chainId: 43114 },
    create: {
      chainId: 43114,
      name: "Avalanche C-Chain",
      shortName: "AVAX",
      rpcUrl: process.env["AVALANCHE_RPC_URL"] ?? "https://dark-practical-theorem.avalanche-mainnet.quiknode.pro/f5e3d1af2e5937c54596182fce5715cd9becd177/ext/bc/C/rpc/",
      isEnabled: true,
    },
    update: {},
  });
  console.log(`  Chain: ${avalanche.name}`);

  // ── Tokens (Avalanche) ─────────────────────────────────────────────────────
  const avaxTokenDefs: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    isTracked?: boolean;
    accentColor?: string;
  }[] = [
    { address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", symbol: "WAVAX",  name: "Wrapped AVAX",            decimals: 18 },
    { address: "0xeF282B38D1ceAB52134CA2cc653a569435744687", symbol: "WRP",    name: "WarpChain Token",          decimals: 18, isTracked: true, accentColor: "E84142" },
    { address: "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd", symbol: "JOE",    name: "JOE Token",               decimals: 18 },
    { address: "0x60781C2586D68229fde47564546784ab3fACA982", symbol: "PNG",    name: "Pangolin",                decimals: 18 },
    { address: "0xA7D7079b0FEAD91F3e65f86E8915Cb59c1a4C664", symbol: "USDC.e", name: "USD Coin (Bridged)",      decimals: 6 },
    { address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", symbol: "USDC",   name: "USD Coin (Native)",       decimals: 6 },
    { address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", symbol: "USDT",   name: "Tether USD",              decimals: 6 },
    { address: "0x152b9d0FdC40C096DE345C84db0f23b45702CA71", symbol: "BTC.b",  name: "Bitcoin (Bridged)",       decimals: 8 },
    { address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB", symbol: "WETH.e", name: "Wrapped Ether (Bridged)", decimals: 18 },
  ];

  const tokenMap: Record<string, { id: string }> = {};
  for (const t of avaxTokenDefs) {
    const token = await prisma.token.upsert({
      where: { chainId_address: { chainId: 43114, address: t.address } },
      create: { ...t, chainId: 43114, flags: [], isEnabled: true, isTracked: t.isTracked ?? false, accentColor: t.accentColor ?? null },
      update: { symbol: t.symbol, name: t.name, decimals: t.decimals, isEnabled: true, isTracked: t.isTracked ?? false, accentColor: t.accentColor ?? null },
    });
    tokenMap[t.symbol] = token;
  }
  console.log(`  Tokens: ${avaxTokenDefs.map((t) => t.symbol).join(", ")}`);

  // ── Tokens (Ethereum — for wallet balance mock only) ───────────────────────
  const ethTokenDefs = [
    { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", name: "Wrapped Ether", decimals: 18 },
    { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", name: "USD Coin",      decimals: 6 },
  ];
  for (const t of ethTokenDefs) {
    await prisma.token.upsert({
      where: { chainId_address: { chainId: 1, address: t.address } },
      create: { ...t, chainId: 1, flags: [], isEnabled: true },
      update: {},
    });
  }

  // ── Venues (Avalanche) ─────────────────────────────────────────────────────
  const pangolin = await prisma.venue.upsert({
    where: { chainId_name: { chainId: 43114, name: "Pangolin" } },
    create: {
      chainId: 43114,
      name: "Pangolin",
      protocol: "uniswap_v2",
      routerAddress: "0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106",
      factoryAddress: "0xefa94DE7a4656D787667C749f7E1223D71E9FD88",
      isEnabled: true,
    },
    update: {
      protocol: "uniswap_v2",
      routerAddress: "0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106",
      factoryAddress: "0xefa94DE7a4656D787667C749f7E1223D71E9FD88",
      isEnabled: true,
    },
  });

  const traderJoe = await prisma.venue.upsert({
    where: { chainId_name: { chainId: 43114, name: "TraderJoe" } },
    create: {
      chainId: 43114,
      name: "TraderJoe",
      protocol: "uniswap_v2",
      routerAddress: "0x60aE616a2155Ee3d9A68541Ba4544862310933d4",
      factoryAddress: "0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10",
      isEnabled: true,
    },
    update: {
      protocol: "uniswap_v2",
      routerAddress: "0x60aE616a2155Ee3d9A68541Ba4544862310933d4",
      factoryAddress: "0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10",
      isEnabled: true,
    },
  });

  const sushiSwap = await prisma.venue.upsert({
    where: { chainId_name: { chainId: 43114, name: "SushiSwap" } },
    create: {
      chainId: 43114,
      name: "SushiSwap",
      protocol: "uniswap_v2",
      routerAddress: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
      factoryAddress: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
      isEnabled: true,
    },
    update: {
      protocol: "uniswap_v2",
      routerAddress: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
      factoryAddress: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
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

  // Correct factory: 0x740b…baD (NOT baF — verified via NFT manager factory() call)
  const uniV3Avax = await prisma.venue.upsert({
    where: { chainId_name: { chainId: 43114, name: "Uniswap V3 (Avalanche)" } },
    create: {
      chainId: 43114,
      name: "Uniswap V3 (Avalanche)",
      protocol: "uniswap_v3",
      routerAddress: "0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE",
      factoryAddress: "0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD",
      isEnabled: true,
    },
    update: {
      protocol: "uniswap_v3",
      routerAddress: "0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE",
      factoryAddress: "0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD",
      isEnabled: true,
    },
  });

  // Blackhole V3 / Algebra Integral CLMM — factory verified via pool.factory() on-chain
  const blackholeV3 = await prisma.venue.upsert({
    where: { chainId_name: { chainId: 43114, name: "Blackhole V3" } },
    create: {
      chainId: 43114,
      name: "Blackhole V3",
      protocol: "algebra_v1",
      routerAddress: "0xAA23611badAFB62D37E7295A682D21960ac85A90",
      factoryAddress: "0x512eb749541B7cf294be882D636218c84a5e9E5F",
      isEnabled: true,
    },
    update: {
      protocol: "algebra_v1",
      routerAddress: "0xAA23611badAFB62D37E7295A682D21960ac85A90",
      factoryAddress: "0x512eb749541B7cf294be882D636218c84a5e9E5F",
      isEnabled: true,
    },
  });

  console.log(`  Venues: Pangolin, TraderJoe, SushiSwap, Blackhole V2, Blackhole V3, Uniswap V3 (Avalanche)`);

  // ── Pools (Avalanche) ──────────────────────────────────────────────────────
  // Every address below was verified on-chain via factory.getPair / factory.getPool.
  const poolDefs: {
    venue: { id: string };
    token0: string;
    token1: string;
    address: string;
    feeBps: number;
  }[] = [
    // ─── Pangolin V2 (verified via factory.getPair) ───
    { venue: pangolin, token0: "WAVAX",  token1: "USDC.e", address: "0xbd918Ed441767fe7924e99F6a0E0B568ac1970D9", feeBps: 30 },
    { venue: pangolin, token0: "WAVAX",  token1: "USDC",   address: "0x0e0100Ab771E9288e0Aa97e11557E6654C3a9665", feeBps: 30 },
    { venue: pangolin, token0: "WAVAX",  token1: "USDT",   address: "0xe3bA3d5e3F98eefF5e9EDdD5Bd20E476202770da", feeBps: 30 },
    { venue: pangolin, token0: "USDC",   token1: "USDC.e", address: "0x8a9c36BC3CEd5ECce703A4dA8032218Dfe72fE86", feeBps: 30 },
    { venue: pangolin, token0: "USDC",   token1: "USDT",   address: "0xe7dAC04261A167846DD8e5B677F4d335C86a6a9d", feeBps: 30 },
    { venue: pangolin, token0: "USDT",   token1: "USDC.e", address: "0xD0E665a16550f59d535dF6Cd929ec0AB0f40684F", feeBps: 30 },

    // ─── TraderJoe V1 (verified via factory.getPair) ───
    { venue: traderJoe, token0: "WAVAX", token1: "USDC",   address: "0xf4003F4efBE8691B60249E6afbD307aBE7758adb", feeBps: 30 },
    { venue: traderJoe, token0: "WAVAX", token1: "USDC.e", address: "0xA389f9430876455C36478DeEa9769B7Ca4E3DDB1", feeBps: 30 },
    { venue: traderJoe, token0: "WAVAX", token1: "USDT",   address: "0xbb4646a764358ee93c2a9c4a147d5aDEd527ab73", feeBps: 30 },
    { venue: traderJoe, token0: "USDC",  token1: "USDC.e", address: "0x2A8A315e82F85D1f0658C5D66A452Bbdd9356783", feeBps: 30 },
    { venue: traderJoe, token0: "USDC",  token1: "USDT",   address: "0x8D5dB5D48F5C46A4263DC46112B5d2e3c5626423", feeBps: 30 },
    { venue: traderJoe, token0: "USDT",  token1: "USDC.e", address: "0x498b0515D1dad468373C9888D24C9D5FB5cAFFb2", feeBps: 30 },

    // ─── SushiSwap V2 (verified via factory.getPair) ───
    { venue: sushiSwap, token0: "WAVAX", token1: "USDC",   address: "0x6539bF462F73fF9497054bA261C195DA8639ED61", feeBps: 30 },
    { venue: sushiSwap, token0: "WAVAX", token1: "USDC.e", address: "0x4ed65dAB34d5FD4b1eb384432027CE47E90E1185", feeBps: 30 },
    { venue: sushiSwap, token0: "WAVAX", token1: "USDT",   address: "0x7e5E4b677c2a682B6d2e95Ae3ec07ae1Ea7D3aB5", feeBps: 30 },
    { venue: sushiSwap, token0: "USDC",  token1: "USDC.e", address: "0xc82c535Ac8a665b8a2c1A414A8bb0A3Cc7923c77", feeBps: 30 },
    { venue: sushiSwap, token0: "USDC",  token1: "USDT",   address: "0xff0996e73859c25b84D19ca70A40d8213eA79157", feeBps: 30 },
    { venue: sushiSwap, token0: "USDT",  token1: "USDC.e", address: "0xBa565678826Ca3bBaA616071385dfEb83F80E71F", feeBps: 30 },

    // ─── Blackhole V2 / Solidly (verified via factory.getPair + getCode) ───
    { venue: blackholeV2, token0: "USDC",  token1: "WRP",    address: "0xc26847bfa980A72c82e924899A989c47b088d7da", feeBps: 30 },

    // ─── Blackhole V3 / Algebra CLMM (verified via pool.factory() on-chain) ───
    { venue: blackholeV3, token0: "WAVAX", token1: "USDC",   address: "0xa02ec3ba8d17887567672b2cdcaf525534636ea0", feeBps: 5 },
    { venue: blackholeV3, token0: "WAVAX", token1: "USDC",   address: "0x41100c6d2c6920b10d12cd8d59c8a9aa2ef56fc7", feeBps: 5 },
    { venue: blackholeV3, token0: "USDC",  token1: "WRP",    address: "0xa4c81fb39ebf487cbd97e8b1c066c9fc04488c00", feeBps: 500 },

    // ─── JOE cross-venue pools (verified via factory.getPair) ───
    { venue: pangolin,  token0: "JOE",   token1: "WAVAX",  address: "0x134Ad631337E8Bf7E01bA641fB650070a2e0efa8", feeBps: 30 },
    { venue: traderJoe, token0: "JOE",   token1: "WAVAX",  address: "0x454E67025631C065d3cFAD6d71E6892f74487a15", feeBps: 30 },
    { venue: sushiSwap, token0: "JOE",   token1: "WAVAX",  address: "0xb73c30C2741B8C62730B58B10CeAa55bdDdA7327", feeBps: 30 },
    { venue: pangolin,  token0: "JOE",   token1: "USDC",   address: "0x20aFA79976BaA1A23f3c13bC2588236489fF46b5", feeBps: 30 },
    { venue: traderJoe, token0: "JOE",   token1: "USDC",   address: "0x3bc40d4307cD946157447CD55d70ee7495bA6140", feeBps: 30 },

    // ─── PNG cross-venue pools (verified via factory.getPair) ───
    { venue: pangolin,  token0: "PNG",   token1: "WAVAX",  address: "0xd7538cABBf8605BdE1f4901B47B8D42c61DE0367", feeBps: 30 },
    { venue: traderJoe, token0: "PNG",   token1: "WAVAX",  address: "0x3dAF1C6268362214eBB064647555438c6f365F96", feeBps: 30 },
    { venue: sushiSwap, token0: "PNG",   token1: "WAVAX",  address: "0xa1708efD71E516A2D0Ebd7eC8D877C02d4d2De6d", feeBps: 30 },
    { venue: pangolin,  token0: "PNG",   token1: "USDC",   address: "0x1784B2ff6841d46163fBf817b3FEb98A0E163E0f", feeBps: 30 },

    // ─── Uniswap V3 Avalanche (verified via factory.getPool) ───
    { venue: uniV3Avax, token0: "WAVAX", token1: "USDC",   address: "0xfAe3f424a0a47706811521E3ee268f00cFb5c45E", feeBps: 5 },
    { venue: uniV3Avax, token0: "WAVAX", token1: "USDC",   address: "0x0E663593657B064e1baE76d28625Df5D0eBd4421", feeBps: 30 },
    { venue: uniV3Avax, token0: "WAVAX", token1: "USDC.e", address: "0x9D8CA527B75DC7b5506704c07D0A9e355559540F", feeBps: 5 },
    { venue: uniV3Avax, token0: "WAVAX", token1: "USDT",   address: "0x78b58A7E21b08f1FCeB8d6AE9a235ABB900b5716", feeBps: 5 },
    { venue: uniV3Avax, token0: "USDC",  token1: "USDC.e", address: "0x01C7c6066ec10b1CD4821E13B9Fb063680fFA083", feeBps: 1 },
    { venue: uniV3Avax, token0: "USDC",  token1: "USDT",   address: "0x804226cA4EDb38e7eF56D16d16E92dc3223347A0", feeBps: 1 },
  ];

  for (const p of poolDefs) {
    const t0 = tokenMap[p.token0];
    const t1 = tokenMap[p.token1];
    if (!t0 || !t1) {
      console.warn(`  SKIP pool ${p.token0}/${p.token1}: token not found`);
      continue;
    }
    await prisma.pool.upsert({
      where: { venueId_token0Id_token1Id_feeBps: { venueId: p.venue.id, token0Id: t0.id, token1Id: t1.id, feeBps: p.feeBps } },
      create: { venueId: p.venue.id, token0Id: t0.id, token1Id: t1.id, poolAddress: p.address, feeBps: p.feeBps, isActive: true },
      update: { poolAddress: p.address, isActive: true },
    });
  }
  console.log(`  Pools: ${poolDefs.length} pools seeded (all verified on-chain)`);

  // ── Mock wallet balance ────────────────────────────────────────────────────
  const MOCK_WALLET = "0x1234567890123456789012345678901234567890";
  const weth = await prisma.token.findFirst({ where: { chainId: 1, symbol: "WETH" } });
  const usdc = await prisma.token.findFirst({ where: { chainId: 1, symbol: "USDC" } });

  if (weth) {
    await prisma.walletBalance.upsert({
      where: { walletAddress_tokenId: { walletAddress: MOCK_WALLET, tokenId: weth.id } },
      create: { walletAddress: MOCK_WALLET, tokenId: weth.id, balanceWei: "10000000000000000000", usdValue: 20000 },
      update: {},
    });
  }
  if (usdc) {
    await prisma.walletBalance.upsert({
      where: { walletAddress_tokenId: { walletAddress: MOCK_WALLET, tokenId: usdc.id } },
      create: { walletAddress: MOCK_WALLET, tokenId: usdc.id, balanceWei: "50000000000", usdValue: 50000 },
      update: {},
    });
  }
  console.log(`  Wallet balances seeded`);

  // ── Config overrides ───────────────────────────────────────────────────────
  const defaults = [
    { key: "baseTradeSizeUsd", value: "500" },
    { key: "maxTradeSizeUsd", value: "1000" },
    { key: "minNetProfitUsd", value: "0.5" },
    { key: "maxGasGwei", value: "100" },
    { key: "minPoolLiquidityUsd", value: "1000" },
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
  console.log(`  Risk config defaults seeded`);

  console.log("\nSeed complete!");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
