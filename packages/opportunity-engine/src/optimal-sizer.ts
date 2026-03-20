/**
 * Optimal Trade Sizer — ternary search for profit-maximizing trade size.
 *
 * For a given buy-pool / sell-pool pair, finds the amountIn that maximizes:
 *   net_profit = sell_amountOut - buy_amountIn - fees - gas
 *
 * Uses ternary search (50-60 iterations, <10ms) on the profit function
 * which is unimodal for V3 pools within the safe trade envelope.
 */

import type { V3TradeSimulation, OptimalSizeResult } from "@arbitex/shared-types";
import { simulateV3Trade, type SimulatorPoolState, type SimulatorTickMap } from "./v3-simulator.js";

export interface OptimalSizerConfig {
  minAmountIn: bigint;
  maxAmountIn: bigint;
  gasCostPerSwapUsd: number;
  tokenInDecimals: number;
  tokenOutDecimals: number;
  tokenInPriceUsd: number;
  tokenOutPriceUsd: number;
  maxIterations?: number;
  convergenceThreshold?: bigint;
}

export interface OptimalSizerPools {
  buyPool: SimulatorPoolState;
  buyTickMap: SimulatorTickMap;
  buyToken0: string;
  sellPool: SimulatorPoolState;
  sellTickMap: SimulatorTickMap;
  sellToken0: string;
  tokenIn: string;
  tokenOut: string;
}

interface ProfitAtSize {
  amountIn: bigint;
  buySimulation: V3TradeSimulation;
  sellSimulation: V3TradeSimulation;
  netProfitUsd: number;
}

/**
 * Find the trade size that maximizes net profit using ternary search.
 *
 * The profit function f(amountIn) is:
 *   f = (sellOut × tokenOutPrice) - (amountIn × tokenInPrice) - 2 × gasCost
 *
 * This is unimodal: profit rises as spread is captured, then falls
 * as price impact grows. Ternary search finds the peak.
 */
export function findOptimalTradeSize(
  pools: OptimalSizerPools,
  config: OptimalSizerConfig
): OptimalSizeResult {
  const maxIter = config.maxIterations ?? 60;
  const threshold = config.convergenceThreshold ?? 1n;

  let lo = config.minAmountIn;
  let hi = config.maxAmountIn;
  let iterations = 0;
  let bestResult: ProfitAtSize | null = null;

  while (lo + threshold < hi && iterations < maxIter) {
    iterations++;

    const third = (hi - lo) / 3n;
    const m1 = lo + third;
    const m2 = hi - third;

    const r1 = evaluateProfit(pools, config, m1);
    const r2 = evaluateProfit(pools, config, m2);

    if (r1.netProfitUsd < r2.netProfitUsd) {
      lo = m1;
      if (!bestResult || r2.netProfitUsd > bestResult.netProfitUsd) {
        bestResult = r2;
      }
    } else {
      hi = m2;
      if (!bestResult || r1.netProfitUsd > bestResult.netProfitUsd) {
        bestResult = r1;
      }
    }
  }

  if (!bestResult) {
    bestResult = evaluateProfit(pools, config, lo);
  }

  const optimalSizeUsd =
    (Number(bestResult.amountIn) / 10 ** config.tokenInDecimals) *
    config.tokenInPriceUsd;

  const netProfitBps =
    optimalSizeUsd > 0
      ? (bestResult.netProfitUsd / optimalSizeUsd) * 10_000
      : 0;

  return {
    optimalAmountIn: bestResult.amountIn.toString(),
    optimalSizeUsd: Math.round(optimalSizeUsd * 100) / 100,
    netProfitUsd: Math.round(bestResult.netProfitUsd * 10000) / 10000,
    netProfitBps: Math.round(netProfitBps * 100) / 100,
    iterations,
    converged: hi - lo <= threshold,
    buySimulation: bestResult.buySimulation,
    sellSimulation: bestResult.sellSimulation,
  };
}

function evaluateProfit(
  pools: OptimalSizerPools,
  config: OptimalSizerConfig,
  amountIn: bigint
): ProfitAtSize {
  if (amountIn <= 0n) {
    return zeroProfitResult(amountIn, pools);
  }

  const buySim = simulateV3Trade(
    pools.buyPool,
    pools.buyTickMap,
    pools.tokenIn,
    pools.tokenOut,
    amountIn,
    pools.buyToken0
  );

  if (buySim.hitGapZone || buySim.abortReason) {
    return zeroProfitResult(amountIn, pools, buySim);
  }

  const buyAmountOut = BigInt(buySim.amountOut);
  if (buyAmountOut <= 0n) {
    return zeroProfitResult(amountIn, pools, buySim);
  }

  const sellSim = simulateV3Trade(
    pools.sellPool,
    pools.sellTickMap,
    pools.tokenOut,
    pools.tokenIn,
    buyAmountOut,
    pools.sellToken0
  );

  const sellAmountOut = BigInt(sellSim.amountOut);

  const inputUsd =
    (Number(amountIn) / 10 ** config.tokenInDecimals) * config.tokenInPriceUsd;
  const outputUsd =
    (Number(sellAmountOut) / 10 ** config.tokenInDecimals) * config.tokenInPriceUsd;

  const totalGasCostUsd = 2 * config.gasCostPerSwapUsd;
  const netProfitUsd = outputUsd - inputUsd - totalGasCostUsd;

  return {
    amountIn,
    buySimulation: buySim,
    sellSimulation: sellSim,
    netProfitUsd,
  };
}

function zeroProfitResult(
  amountIn: bigint,
  pools: OptimalSizerPools,
  buySim?: V3TradeSimulation
): ProfitAtSize {
  const emptySim: V3TradeSimulation = {
    tokenIn: pools.tokenIn,
    tokenOut: pools.tokenOut,
    amountIn: amountIn.toString(),
    amountOut: "0",
    effectivePrice: 0,
    priceImpactBps: 0,
    feesPaid: "0",
    ticksCrossed: 0,
    gasEstimate: 0,
    steps: [],
    hitGapZone: false,
    hitCliff: false,
    abortReason: null,
  };

  return {
    amountIn,
    buySimulation: buySim ?? emptySim,
    sellSimulation: emptySim,
    netProfitUsd: -Infinity,
  };
}
