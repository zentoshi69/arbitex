import type { MarketSignals } from "@arbitex/shared-types";

/**
 * Score how favorable WRP is to hold/accumulate right now.
 * Returns -100 to +100. Positive = favor WRP.
 */
export function scoreWRP(signals: MarketSignals): number {
  let score = 0;

  score += signals.wrpAvaxRatioTrend * 20;
  score += signals.wrpTrendQuality * 15;
  score += signals.wrpPullbackQuality * 10;
  score += signals.btcAbove21EMA ? 8 : -8;
  score += signals.wrpAbove21EMA ? 10 : -10;
  score += (signals.wrpRelativeVolume - 1) * 5;

  score -= signals.wrpZScore * 8;
  score -= signals.btcRealizedVolatility * 0.5;
  score -= signals.slippageEstimate * 200;

  return Math.max(-100, Math.min(100, score));
}

/**
 * Score how favorable AVAX is as a tactical hold vs WRP.
 * Returns -100 to +100. Positive = AVAX better right now.
 */
export function scoreAVAX(signals: MarketSignals): number {
  let score = 0;

  score += signals.btcAbove21EMA ? 10 : 5;
  score += signals.avaxRelativeVolume * 3;
  score -= signals.wrpAvaxRatioTrend * 15;
  score += signals.btcRealizedVolatility * 0.3;
  score -= signals.wrpAbove21EMA ? 8 : 0;

  return Math.max(-100, Math.min(100, score));
}
