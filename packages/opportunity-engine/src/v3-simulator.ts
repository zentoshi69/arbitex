/**
 * Tick-by-tick V3 trade simulator.
 * Walks through initialized ticks exactly as the on-chain swap would,
 * producing per-step breakdowns and detecting gap zones / cliffs.
 */

import type { TickData, V3TradeSimulation, V3SimulationStep } from "@arbitex/shared-types";
import {
  computeSwapStep,
  tickToSqrtPriceX96,
  sqrtPriceX96ToPrice,
  MIN_SQRT_RATIO,
  MAX_SQRT_RATIO,
} from "./v3-math.js";

export interface SimulatorPoolState {
  sqrtPriceX96: bigint;
  tick: number;
  liquidity: bigint;
  tickSpacing: number;
  fee: number;            // in ppm (e.g. 3000 = 0.30%)
  token0Decimals: number;
  token1Decimals: number;
}

export interface SimulatorTickMap {
  getNextInitializedTick(tick: number, zeroForOne: boolean): TickData | null;
}

const MAX_STEPS = 500;
const BASE_GAS_PER_SWAP = 130_000;
const GAS_PER_TICK_CROSS = 25_000;

/**
 * Simulate an exact-input swap through a V3 pool.
 *
 * @param pool      Current pool state (sqrtPrice, tick, liquidity, fee)
 * @param tickMap   Provider of initialized ticks (from on-chain bitmap)
 * @param tokenIn   Address of input token
 * @param tokenOut  Address of output token
 * @param amountIn  Exact amount of tokenIn (in raw units, as bigint)
 * @param token0    Address of pool's token0 (to determine swap direction)
 */
export function simulateV3Trade(
  pool: SimulatorPoolState,
  tickMap: SimulatorTickMap,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  token0: string
): V3TradeSimulation {
  const zeroForOne = tokenIn.toLowerCase() === token0.toLowerCase();

  let sqrtPriceX96 = pool.sqrtPriceX96;
  let tick = pool.tick;
  let liquidity = pool.liquidity;
  let amountRemaining = amountIn;
  let totalAmountOut = 0n;
  let totalFees = 0n;
  let ticksCrossed = 0;
  let hitGapZone = false;
  let hitCliff = false;
  let abortReason: string | null = null;

  const steps: V3SimulationStep[] = [];
  const startLiquidity = liquidity;

  for (let i = 0; i < MAX_STEPS && amountRemaining > 0n; i++) {
    const sqrtPriceBefore = sqrtPriceX96;
    const tickBefore = tick;

    const nextTick = tickMap.getNextInitializedTick(tick, zeroForOne);

    if (!nextTick) {
      hitGapZone = true;
      abortReason = "HIT_GAP_ZONE";
      break;
    }

    if (liquidity === 0n) {
      hitGapZone = true;
      abortReason = "ZERO_LIQUIDITY_AT_TICK";
      break;
    }

    const sqrtPriceTargetX96 = tickToSqrtPriceX96(nextTick.tick);

    const sqrtPriceLimitX96 = zeroForOne
      ? (sqrtPriceTargetX96 < MIN_SQRT_RATIO + 1n ? MIN_SQRT_RATIO + 1n : sqrtPriceTargetX96)
      : (sqrtPriceTargetX96 > MAX_SQRT_RATIO - 1n ? MAX_SQRT_RATIO - 1n : sqrtPriceTargetX96);

    const step = computeSwapStep(
      sqrtPriceX96,
      sqrtPriceLimitX96,
      liquidity,
      amountRemaining,
      pool.fee
    );

    amountRemaining -= step.amountIn + step.feeAmount;
    totalAmountOut += step.amountOut;
    totalFees += step.feeAmount;

    sqrtPriceX96 = step.sqrtPriceNextX96;

    const crossedTick = step.sqrtPriceNextX96 === sqrtPriceLimitX96;

    if (crossedTick) {
      const liquidityBefore = liquidity;
      liquidity = zeroForOne
        ? liquidity - nextTick.liquidityNet
        : liquidity + nextTick.liquidityNet;

      tick = zeroForOne ? nextTick.tick - 1 : nextTick.tick;
      ticksCrossed++;

      if (liquidity === 0n) {
        hitGapZone = true;
        abortReason = "LIQUIDITY_EXHAUSTED_AT_TICK";
      }

      if (
        liquidityBefore > 0n &&
        liquidity > 0n &&
        Number(liquidity) < Number(liquidityBefore) * 0.5
      ) {
        hitCliff = true;
      }
    } else {
      tick = getSqrtPriceTick(sqrtPriceX96);
    }

    steps.push({
      tickBefore,
      tickAfter: tick,
      sqrtPriceBefore: sqrtPriceBefore.toString(),
      sqrtPriceAfter: sqrtPriceX96.toString(),
      amountInConsumed: step.amountIn.toString(),
      amountOutProduced: step.amountOut.toString(),
      feeAmount: step.feeAmount.toString(),
      liquidityAtTick: liquidity.toString(),
      crossedTick,
    });

    if (abortReason) break;
  }

  if (!abortReason && amountRemaining > 0n) {
    abortReason = "AMOUNT_REMAINING_AFTER_MAX_STEPS";
  }

  const priceBefore = sqrtPriceX96ToPrice(
    pool.sqrtPriceX96,
    pool.token0Decimals,
    pool.token1Decimals
  );
  const priceAfter = sqrtPriceX96ToPrice(
    sqrtPriceX96,
    pool.token0Decimals,
    pool.token1Decimals
  );
  const effectivePrice =
    amountIn > amountRemaining
      ? Number(totalAmountOut) / Number(amountIn - amountRemaining)
      : 0;

  const priceImpactBps =
    priceBefore > 0
      ? Math.round(Math.abs((priceAfter - priceBefore) / priceBefore) * 10_000)
      : 0;

  const gasEstimate = BASE_GAS_PER_SWAP + ticksCrossed * GAS_PER_TICK_CROSS;

  return {
    tokenIn,
    tokenOut,
    amountIn: amountIn.toString(),
    amountOut: totalAmountOut.toString(),
    effectivePrice,
    priceImpactBps,
    feesPaid: totalFees.toString(),
    ticksCrossed,
    gasEstimate,
    steps,
    hitGapZone,
    hitCliff,
    abortReason,
  };
}

function getSqrtPriceTick(sqrtPriceX96: bigint): number {
  const price = Number(sqrtPriceX96) / Number(1n << 96n);
  return Math.floor(Math.log(price * price) / Math.log(1.0001));
}

/**
 * In-memory tick map built from an array of TickData.
 * Used for simulation when tick data has been fetched from chain.
 */
export class ArrayTickMap implements SimulatorTickMap {
  private ticks: TickData[];

  constructor(ticks: TickData[]) {
    this.ticks = ticks
      .filter((t) => t.initialized)
      .sort((a, b) => a.tick - b.tick);
  }

  getNextInitializedTick(tick: number, zeroForOne: boolean): TickData | null {
    if (zeroForOne) {
      for (let i = this.ticks.length - 1; i >= 0; i--) {
        if (this.ticks[i]!.tick <= tick) return this.ticks[i]!;
      }
      return null;
    } else {
      for (let i = 0; i < this.ticks.length; i++) {
        if (this.ticks[i]!.tick > tick) return this.ticks[i]!;
      }
      return null;
    }
  }
}
