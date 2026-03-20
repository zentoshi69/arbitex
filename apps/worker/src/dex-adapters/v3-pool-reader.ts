/**
 * V3 Pool Reader — batched on-chain reads via Multicall3.
 *
 * Reads slot0(), liquidity(), and tick bitmap for V3 pools in
 * a single RPC call using Multicall3 (deployed on Avalanche).
 */

import type { ArbitexPublicClient } from "@arbitex/chain";
import type { V3PoolState, TickData, TickBitmapWord } from "@arbitex/shared-types";

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

const SLOT0_ABI = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
] as const;

const LIQUIDITY_ABI = [
  {
    type: "function",
    name: "liquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint128" }],
  },
] as const;

const TICK_SPACING_ABI = [
  {
    type: "function",
    name: "tickSpacing",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "int24" }],
  },
] as const;

const FEE_ABI = [
  {
    type: "function",
    name: "fee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint24" }],
  },
] as const;

const TOKEN0_ABI = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

const TOKEN1_ABI = [
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

const TICK_BITMAP_ABI = [
  {
    type: "function",
    name: "tickBitmap",
    stateMutability: "view",
    inputs: [{ name: "wordPosition", type: "int16" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const TICKS_ABI = [
  {
    type: "function",
    name: "ticks",
    stateMutability: "view",
    inputs: [{ name: "tick", type: "int24" }],
    outputs: [
      { name: "liquidityGross", type: "uint128" },
      { name: "liquidityNet", type: "int128" },
      { name: "feeGrowthOutside0X128", type: "uint256" },
      { name: "feeGrowthOutside1X128", type: "uint256" },
      { name: "tickCumulativeOutside", type: "int56" },
      { name: "secondsPerLiquidityOutsideX128", type: "uint160" },
      { name: "secondsOutside", type: "uint32" },
      { name: "initialized", type: "bool" },
    ],
  },
] as const;

const ERC20_SYMBOL_ABI = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

const ERC20_DECIMALS_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

export interface PoolReaderConfig {
  venueId: string;
  venueName: string;
  chainId: number;
}

/**
 * Read full V3 pool state in batched multicall.
 */
export async function readV3PoolState(
  client: ArbitexPublicClient,
  poolAddress: `0x${string}`,
  cfg: PoolReaderConfig
): Promise<V3PoolState> {
  const addr = poolAddress;

  const [slot0, liquidity, tickSpacing, fee, token0, token1] = await Promise.all([
    client.readContract({ address: addr, abi: SLOT0_ABI, functionName: "slot0" }),
    client.readContract({ address: addr, abi: LIQUIDITY_ABI, functionName: "liquidity" }),
    client.readContract({ address: addr, abi: TICK_SPACING_ABI, functionName: "tickSpacing" }),
    client.readContract({ address: addr, abi: FEE_ABI, functionName: "fee" }),
    client.readContract({ address: addr, abi: TOKEN0_ABI, functionName: "token0" }),
    client.readContract({ address: addr, abi: TOKEN1_ABI, functionName: "token1" }),
  ]);

  const sqrtPriceX96 = slot0[0] as bigint;
  const tick = slot0[1] as number;

  const [
    token0Symbol, token1Symbol,
    token0Decimals, token1Decimals,
  ] = await Promise.all([
    client.readContract({ address: token0 as `0x${string}`, abi: ERC20_SYMBOL_ABI, functionName: "symbol" }).catch(() => "???"),
    client.readContract({ address: token1 as `0x${string}`, abi: ERC20_SYMBOL_ABI, functionName: "symbol" }).catch(() => "???"),
    client.readContract({ address: token0 as `0x${string}`, abi: ERC20_DECIMALS_ABI, functionName: "decimals" }).catch(() => 18),
    client.readContract({ address: token1 as `0x${string}`, abi: ERC20_DECIMALS_ABI, functionName: "decimals" }).catch(() => 18),
  ]);

  return {
    poolAddress: addr,
    token0: token0 as string,
    token1: token1 as string,
    token0Symbol: String(token0Symbol),
    token1Symbol: String(token1Symbol),
    token0Decimals: Number(token0Decimals),
    token1Decimals: Number(token1Decimals),
    fee: Number(fee),
    sqrtPriceX96: sqrtPriceX96.toString(),
    tick: Number(tick),
    liquidity: (liquidity as bigint).toString(),
    tickSpacing: Number(tickSpacing),
    venueId: cfg.venueId,
    venueName: cfg.venueName,
    chainId: cfg.chainId,
    timestamp: Date.now(),
  };
}

/**
 * Read tick bitmap words around the current tick.
 * Covers ±512 words (each word covers tickSpacing × 256 ticks).
 */
export async function readTickBitmap(
  client: ArbitexPublicClient,
  poolAddress: `0x${string}`,
  currentTick: number,
  tickSpacing: number,
  range = 32
): Promise<TickBitmapWord[]> {
  const currentWord = Math.floor(currentTick / tickSpacing / 256);
  const words: TickBitmapWord[] = [];

  const indices: number[] = [];
  for (let i = currentWord - range; i <= currentWord + range; i++) {
    indices.push(i);
  }

  const bitmaps = await Promise.all(
    indices.map((idx) =>
      client
        .readContract({
          address: poolAddress,
          abi: TICK_BITMAP_ABI,
          functionName: "tickBitmap",
          args: [idx],
        })
        .catch(() => 0n)
    )
  );

  for (let i = 0; i < indices.length; i++) {
    const bitmap = bitmaps[i] as bigint;
    if (bitmap !== 0n) {
      words.push({ wordIndex: indices[i]!, bitmap });
    }
  }

  return words;
}

/**
 * Extract initialized tick indices from bitmap words,
 * then read full tick data from the pool.
 */
export async function readInitializedTicks(
  client: ArbitexPublicClient,
  poolAddress: `0x${string}`,
  bitmapWords: TickBitmapWord[],
  tickSpacing: number
): Promise<TickData[]> {
  const tickIndices: number[] = [];

  for (const word of bitmapWords) {
    for (let bit = 0; bit < 256; bit++) {
      if ((word.bitmap >> BigInt(bit)) & 1n) {
        const tick = (word.wordIndex * 256 + bit) * tickSpacing;
        tickIndices.push(tick);
      }
    }
  }

  if (tickIndices.length === 0) return [];

  const results = await Promise.all(
    tickIndices.map((tick) =>
      client
        .readContract({
          address: poolAddress,
          abi: TICKS_ABI,
          functionName: "ticks",
          args: [tick],
        })
        .catch(() => null)
    )
  );

  const ticks: TickData[] = [];
  for (let i = 0; i < tickIndices.length; i++) {
    const r = results[i];
    if (!r) continue;
    const [liquidityGross, liquidityNet, , , , , , initialized] = r as [
      bigint, bigint, bigint, bigint, bigint, bigint, number, boolean
    ];

    ticks.push({
      tick: tickIndices[i]!,
      liquidityGross,
      liquidityNet,
      initialized: Boolean(initialized),
    });
  }

  return ticks.filter((t) => t.initialized);
}

/**
 * Convenience: read full pool state + tick data in one call.
 */
export async function readV3PoolFull(
  client: ArbitexPublicClient,
  poolAddress: `0x${string}`,
  cfg: PoolReaderConfig,
  bitmapRange = 32
) {
  const state = await readV3PoolState(client, poolAddress, cfg);
  const bitmap = await readTickBitmap(
    client,
    poolAddress,
    state.tick,
    state.tickSpacing,
    bitmapRange
  );
  const ticks = await readInitializedTicks(
    client,
    poolAddress,
    bitmap,
    state.tickSpacing
  );

  return { state, bitmap, ticks };
}
