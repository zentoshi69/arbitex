/**
 * DB Seed — bootstraps reference data for Avalanche C-Chain.
 *
 * Run: npx tsx packages/db/prisma/seed.ts
 * Or:  pnpm --filter @arbitex/db seed
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding ArbitEx database...");

  // ── Chain ────────────────────────────────────────────────────────────────
  const avax = await prisma.chain.upsert({
    where: { chainId: 43114 },
    update: {},
    create: {
      chainId: 43114,
      name: "Avalanche C-Chain",
      shortName: "AVAX",
      rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
      isEnabled: true,
    },
  });
  console.log(`  Chain: ${avax.name} (${avax.chainId})`);

  // ── Tokens ───────────────────────────────────────────────────────────────
  const tokens = [
    {
      chainId: 43114,
      address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
      symbol: "WAVAX",
      name: "Wrapped AVAX",
      decimals: 18,
    },
    {
      chainId: 43114,
      address: "0xeF282B38D1ceAB52134CA2cc653a569435744687",
      symbol: "WRP",
      name: "WARP Token",
      decimals: 18,
    },
    {
      chainId: 43114,
      address: "0xA7D7079b0FEAD91F3e65f86E8915Cb59c1a4C664",
      symbol: "USDC.e",
      name: "USD Coin (Bridged)",
      decimals: 6,
    },
    {
      chainId: 43114,
      address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
      symbol: "USDC",
      name: "USD Coin (Native)",
      decimals: 6,
    },
    {
      chainId: 43114,
      address: "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7",
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
    },
    {
      chainId: 43114,
      address: "0x152b9d0FdC40C096DE345C84db0f23b45702CA71",
      symbol: "BTC.b",
      name: "Bitcoin (Bridged)",
      decimals: 8,
    },
    {
      chainId: 43114,
      address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB",
      symbol: "WETH.e",
      name: "Wrapped Ether (Bridged)",
      decimals: 18,
    },
  ];

  const tokenMap = new Map<string, string>();
  for (const t of tokens) {
    const token = await prisma.token.upsert({
      where: {
        chainId_address: { chainId: t.chainId, address: t.address },
      },
      update: { symbol: t.symbol, name: t.name, decimals: t.decimals },
      create: t,
    });
    tokenMap.set(t.symbol, token.id);
    console.log(`  Token: ${t.symbol} (${t.address.slice(0, 10)}…)`);
  }

  // ── Venues ───────────────────────────────────────────────────────────────
  const venues = [
    {
      chainId: 43114,
      name: "Pangolin",
      protocol: "uniswap_v2",
      routerAddress: "0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106",
      factoryAddress: "0xefa94DE7a4656D787667C749f7E1223D71E9FD88",
    },
    {
      chainId: 43114,
      name: "Trader Joe",
      protocol: "uniswap_v2",
      routerAddress: "0x60aE616a2155Ee3d9A68541Ba4544862310933d4",
      factoryAddress: "0x9Ad6C38BE94206cA50bb0d90783181834C294Ff3",
    },
    {
      chainId: 43114,
      name: "SushiSwap",
      protocol: "uniswap_v2",
      routerAddress: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
      factoryAddress: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
    },
    {
      chainId: 43114,
      name: "Trader Joe V2.1",
      protocol: "uniswap_v3",
      routerAddress: "0xb4315e873dBcf96Ffd0acd8EA43f689D8c20fB30",
      factoryAddress: "0x8e42f2F4101563bF679975178e880FD87d3eFd4e",
    },
    {
      chainId: 43114,
      name: "Uniswap V3 (Avalanche)",
      protocol: "uniswap_v3",
      routerAddress: "0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE",
      factoryAddress: "0x740b1c1de25031C31FF4fC9A62f554A55cdC1baF",
    },
  ];

  const venueMap = new Map<string, string>();
  for (const v of venues) {
    const venue = await prisma.venue.upsert({
      where: {
        chainId_name: { chainId: v.chainId, name: v.name },
      },
      update: {
        routerAddress: v.routerAddress,
        factoryAddress: v.factoryAddress,
        protocol: v.protocol,
      },
      create: v,
    });
    venueMap.set(v.name, venue.id);
    console.log(`  Venue: ${v.name} (${v.protocol})`);
  }

  // ── Pools ────────────────────────────────────────────────────────────────
  const wavaxId = tokenMap.get("WAVAX")!;
  const wrpId = tokenMap.get("WRP")!;
  const usdceId = tokenMap.get("USDC.e")!;
  const usdcId = tokenMap.get("USDC")!;
  const usdtId = tokenMap.get("USDT")!;

  const pools = [
    {
      venueName: "Pangolin",
      poolAddress: "0x0000000000000000000000000000000000000001",
      token0Id: wavaxId,
      token1Id: usdceId,
      feeBps: 30,
      label: "WAVAX/USDC.e (Pangolin)",
    },
    {
      venueName: "Trader Joe",
      poolAddress: "0x0000000000000000000000000000000000000002",
      token0Id: wavaxId,
      token1Id: usdceId,
      feeBps: 30,
      label: "WAVAX/USDC.e (TraderJoe)",
    },
    {
      venueName: "Pangolin",
      poolAddress: "0x0000000000000000000000000000000000000003",
      token0Id: wrpId,
      token1Id: wavaxId,
      feeBps: 30,
      label: "WRP/WAVAX (Pangolin)",
    },
    {
      venueName: "Trader Joe",
      poolAddress: "0x0000000000000000000000000000000000000004",
      token0Id: wrpId,
      token1Id: wavaxId,
      feeBps: 30,
      label: "WRP/WAVAX (TraderJoe)",
    },
    {
      venueName: "Pangolin",
      poolAddress: "0x0000000000000000000000000000000000000005",
      token0Id: wrpId,
      token1Id: usdceId,
      feeBps: 30,
      label: "WRP/USDC.e (Pangolin)",
    },
    {
      venueName: "SushiSwap",
      poolAddress: "0x0000000000000000000000000000000000000006",
      token0Id: wavaxId,
      token1Id: usdceId,
      feeBps: 30,
      label: "WAVAX/USDC.e (SushiSwap)",
    },
  ];

  for (const p of pools) {
    const venueId = venueMap.get(p.venueName);
    if (!venueId) {
      console.warn(`  ⚠ Venue not found: ${p.venueName}`);
      continue;
    }

    await prisma.pool.upsert({
      where: {
        venueId_token0Id_token1Id_feeBps: {
          venueId,
          token0Id: p.token0Id,
          token1Id: p.token1Id,
          feeBps: p.feeBps,
        },
      },
      update: { poolAddress: p.poolAddress },
      create: {
        venueId,
        token0Id: p.token0Id,
        token1Id: p.token1Id,
        poolAddress: p.poolAddress,
        feeBps: p.feeBps,
        isActive: true,
      },
    });
    console.log(`  Pool: ${p.label}`);
  }

  console.log("\nSeed complete.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
