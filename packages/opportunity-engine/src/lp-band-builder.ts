/**
 * LP Band Builder — constructs the liquidity profile for a V3 pool.
 *
 * Reads initialized tick data and builds:
 *  - Band map (liquidity per tick range)
 *  - Gap zones (zero liquidity regions)
 *  - Cliff points (>50% liquidity drop)
 *  - Safe trade envelope (max size before hitting cliff/gap)
 */

import type { TickData, LPBand, LPBandProfile } from "@arbitex/shared-types";
import {
  sqrtPriceX96ToPrice,
  tickToPrice,
  tickToSqrtPriceX96,
  getAmount0Delta,
  getAmount1Delta,
} from "./v3-math.js";

export interface LPBandBuilderInput {
  poolAddress: string;
  venueName: string;
  token0Decimals: number;
  token1Decimals: number;
  currentTick: number;
  currentSqrtPriceX96: bigint;
  tickSpacing: number;
  ticks: TickData[];
  token0PriceUsd: number;
  token1PriceUsd: number;
}

const THIN_ZONE_THRESHOLD = 0.2;  // below 20% of average = thin
const CLIFF_DROP_THRESHOLD = 0.5; // >50% drop = cliff

export function buildLPBandProfile(input: LPBandBuilderInput): LPBandProfile {
  const {
    poolAddress,
    venueName,
    token0Decimals,
    token1Decimals,
    currentTick,
    currentSqrtPriceX96,
    tickSpacing,
    ticks,
    token0PriceUsd,
    token1PriceUsd,
  } = input;

  const initializedTicks = ticks
    .filter((t) => t.initialized)
    .sort((a, b) => a.tick - b.tick);

  const currentPrice = sqrtPriceX96ToPrice(currentSqrtPriceX96, token0Decimals, token1Decimals);

  if (initializedTicks.length === 0) {
    return emptyProfile(poolAddress, venueName, currentTick, currentPrice, tickSpacing);
  }

  const bands: LPBand[] = [];
  let cumulativeLiquidity = 0n;
  const gapZones: LPBandProfile["gapZones"] = [];
  const cliffPoints: LPBandProfile["cliffPoints"] = [];

  for (let i = 0; i < initializedTicks.length - 1; i++) {
    const lower = initializedTicks[i]!;
    const upper = initializedTicks[i + 1]!;

    cumulativeLiquidity += lower.liquidityNet;

    const priceLower = tickToPrice(lower.tick, token0Decimals, token1Decimals);
    const priceUpper = tickToPrice(upper.tick, token0Decimals, token1Decimals);

    const isGap = cumulativeLiquidity <= 0n;

    const capacityUsd = isGap
      ? 0
      : estimateBandCapacityUsd(
          lower.tick,
          upper.tick,
          cumulativeLiquidity,
          token0Decimals,
          token1Decimals,
          token0PriceUsd,
          token1PriceUsd
        );

    bands.push({
      tickLower: lower.tick,
      tickUpper: upper.tick,
      liquidityNet: lower.liquidityNet.toString(),
      liquidityGross: lower.liquidityGross.toString(),
      cumulativeLiquidity: cumulativeLiquidity.toString(),
      priceRange: { lower: priceLower, upper: priceUpper },
      isGapZone: isGap,
      isThinZone: false,
      isCliffPoint: false,
      capacityUsd,
    });

    if (isGap) {
      gapZones.push({
        tickLower: lower.tick,
        tickUpper: upper.tick,
        priceLower,
        priceUpper,
      });
    }
  }

  const liquidities = bands
    .filter((b) => !b.isGapZone)
    .map((b) => BigInt(b.cumulativeLiquidity));

  const avgLiquidity =
    liquidities.length > 0
      ? liquidities.reduce((a, b) => a + b, 0n) / BigInt(liquidities.length)
      : 0n;

  for (const band of bands) {
    if (band.isGapZone) continue;
    const liq = BigInt(band.cumulativeLiquidity);
    if (avgLiquidity > 0n && Number(liq) < Number(avgLiquidity) * THIN_ZONE_THRESHOLD) {
      band.isThinZone = true;
    }
  }

  for (let i = 1; i < bands.length; i++) {
    const prev = BigInt(bands[i - 1]!.cumulativeLiquidity);
    const curr = BigInt(bands[i]!.cumulativeLiquidity);
    if (prev > 0n && curr > 0n) {
      const dropPct = 1 - Number(curr) / Number(prev);
      if (dropPct > CLIFF_DROP_THRESHOLD) {
        bands[i]!.isCliffPoint = true;
        cliffPoints.push({
          tick: bands[i]!.tickLower,
          price: bands[i]!.priceRange.lower,
          liquidityDropPct: Math.round(dropPct * 100),
        });
      }
    }
  }

  const safeTradeEnvelope = computeSafeEnvelope(
    bands,
    currentTick,
    token0Decimals,
    token1Decimals,
    token0PriceUsd,
    token1PriceUsd
  );

  const totalLiquidityUsd = bands.reduce((sum, b) => sum + b.capacityUsd, 0);

  const activeBands = bands.filter(
    (b) => !b.isGapZone && BigInt(b.cumulativeLiquidity) > 0n
  );
  const totalTickRange =
    initializedTicks.length > 1
      ? initializedTicks[initializedTicks.length - 1]!.tick - initializedTicks[0]!.tick
      : 1;
  const activeTickRange = activeBands.reduce(
    (sum, b) => sum + (b.tickUpper - b.tickLower),
    0
  );
  const concentrationScore =
    totalTickRange > 0 ? Math.min(1, activeTickRange / totalTickRange) : 0;

  return {
    poolAddress,
    venueName,
    currentTick,
    currentPrice,
    tickSpacing,
    totalPositions: initializedTicks.length,
    totalLiquidityUsd,
    bands,
    gapZones,
    cliffPoints,
    safeTradeEnvelope,
    averageLiquidity: avgLiquidity.toString(),
    concentrationScore: Math.round(concentrationScore * 100) / 100,
    builtAt: Date.now(),
  };
}

function computeSafeEnvelope(
  bands: LPBand[],
  currentTick: number,
  token0Decimals: number,
  token1Decimals: number,
  token0PriceUsd: number,
  token1PriceUsd: number
): LPBandProfile["safeTradeEnvelope"] {
  let firstCliffTick: number | null = null;
  let firstGapTick: number | null = null;
  let maxSizeToken0 = 0n;
  let maxSizeToken1 = 0n;

  const currentBandIdx = bands.findIndex(
    (b) => b.tickLower <= currentTick && b.tickUpper > currentTick
  );

  if (currentBandIdx >= 0) {
    for (let i = currentBandIdx; i < bands.length; i++) {
      const band = bands[i]!;
      if (band.isGapZone) {
        firstGapTick ??= band.tickLower;
        break;
      }
      if (band.isCliffPoint) {
        firstCliffTick ??= band.tickLower;
        break;
      }
      const liq = BigInt(band.cumulativeLiquidity);
      if (liq <= 0n) break;

      const sqrtLower = tickToSqrtPriceX96(band.tickLower);
      const sqrtUpper = tickToSqrtPriceX96(band.tickUpper);
      maxSizeToken0 += getAmount0Delta(sqrtLower, sqrtUpper, liq, false);
      maxSizeToken1 += getAmount1Delta(sqrtLower, sqrtUpper, liq, false);
    }
  }

  const t0Usd = (Number(maxSizeToken0) / 10 ** token0Decimals) * token0PriceUsd;
  const t1Usd = (Number(maxSizeToken1) / 10 ** token1Decimals) * token1PriceUsd;
  const maxSizeUsd = Math.min(t0Usd, t1Usd);

  return {
    maxSizeToken0: maxSizeToken0.toString(),
    maxSizeToken1: maxSizeToken1.toString(),
    maxSizeUsd: Math.round(maxSizeUsd * 100) / 100,
    firstCliffTick,
    firstGapTick,
  };
}

function estimateBandCapacityUsd(
  tickLower: number,
  tickUpper: number,
  liquidity: bigint,
  token0Decimals: number,
  token1Decimals: number,
  token0PriceUsd: number,
  token1PriceUsd: number
): number {
  if (liquidity <= 0n) return 0;

  const sqrtLower = tickToSqrtPriceX96(tickLower);
  const sqrtUpper = tickToSqrtPriceX96(tickUpper);

  const amount0 = getAmount0Delta(sqrtLower, sqrtUpper, liquidity, false);
  const amount1 = getAmount1Delta(sqrtLower, sqrtUpper, liquidity, false);

  const usd0 = (Number(amount0) / 10 ** token0Decimals) * token0PriceUsd;
  const usd1 = (Number(amount1) / 10 ** token1Decimals) * token1PriceUsd;

  return usd0 + usd1;
}

function emptyProfile(
  poolAddress: string,
  venueName: string,
  currentTick: number,
  currentPrice: number,
  tickSpacing: number
): LPBandProfile {
  return {
    poolAddress,
    venueName,
    currentTick,
    currentPrice,
    tickSpacing,
    totalPositions: 0,
    totalLiquidityUsd: 0,
    bands: [],
    gapZones: [],
    cliffPoints: [],
    safeTradeEnvelope: {
      maxSizeToken0: "0",
      maxSizeToken1: "0",
      maxSizeUsd: 0,
      firstCliffTick: null,
      firstGapTick: null,
    },
    averageLiquidity: "0",
    concentrationScore: 0,
    builtAt: Date.now(),
  };
}
