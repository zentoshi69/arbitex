import type { MarketSignals } from "@arbitex/shared-types";

export type TriggerCondition = string;

export interface TriggerResult {
  condition: TriggerCondition;
  passed: boolean;
  detail: string;
}

export function evaluateAvaxToWrpTriggers(
  signals: MarketSignals,
): TriggerResult[] {
  return [
    {
      condition: "btc_regime_not_risk_off",
      passed: signals.btcAbove21EMA || signals.btcEMASlope > -0.01,
      detail: `BTC above 21EMA: ${signals.btcAbove21EMA}, slope: ${signals.btcEMASlope.toFixed(4)}`,
    },
    {
      condition: "wrp_avax_ratio_stabilized_or_rising",
      passed: signals.wrpAvaxRatioTrend >= 0,
      detail: `WRP/AVAX trend: ${signals.wrpAvaxRatioTrend.toFixed(6)}`,
    },
    {
      condition: "wrp_reclaimed_21ema",
      passed: signals.wrpAbove21EMA,
      detail: `WRP above 21EMA: ${signals.wrpAbove21EMA}`,
    },
    {
      condition: "volume_confirms_breakout",
      passed: signals.wrpRelativeVolume > 1.2,
      detail: `Relative volume: ${signals.wrpRelativeVolume.toFixed(2)}x`,
    },
    {
      condition: "relative_strength_improving",
      passed: signals.wrpAvaxRatioTrend > 0.001,
      detail: `Ratio trend: ${signals.wrpAvaxRatioTrend.toFixed(6)}`,
    },
    {
      condition: "not_overextended",
      passed: signals.wrpZScore < 1.5,
      detail: `Z-score: ${signals.wrpZScore.toFixed(2)}`,
    },
  ];
}

export function evaluateWrpToAvaxTriggers(
  signals: MarketSignals,
): TriggerResult[] {
  return [
    {
      condition: "wrp_statistically_stretched",
      passed: signals.wrpZScore > 1.5,
      detail: `Z-score: ${signals.wrpZScore.toFixed(2)} (>1.5 = stretched)`,
    },
    {
      condition: "wrp_avax_relative_strength_rolling_over",
      passed: signals.wrpAvaxRatioTrend < -0.001,
      detail: `Ratio trend: ${signals.wrpAvaxRatioTrend.toFixed(6)}`,
    },
    {
      condition: "btc_regime_weakening",
      passed: !signals.btcAbove21EMA || signals.btcEMASlope < 0,
      detail: `BTC above 21EMA: ${signals.btcAbove21EMA}, slope: ${signals.btcEMASlope.toFixed(4)}`,
    },
    {
      condition: "wrp_lost_short_term_support",
      passed: !signals.wrpAbove21EMA,
      detail: `WRP above 21EMA: ${signals.wrpAbove21EMA}`,
    },
    {
      condition: "volume_distribution_detected",
      passed: signals.wrpRelativeVolume > 1.5 && signals.wrpAvaxRatioTrend < 0,
      detail: `High volume + falling ratio → distribution`,
    },
  ];
}

const NO_TRADE_CONDITIONS = [
  "regime_mixed_or_unclear",
  "signal_quality_below_threshold",
  "relative_strength_flat",
  "costs_consume_edge",
  "uncertainty_too_high",
  "conversion_would_not_improve_wrp_units",
  "insufficient_time_since_last_conversion",
] as const;

export function evaluateNoTradeConditions(
  signals: MarketSignals,
  scoreDelta: number,
  hurdle: number,
  passedUnitTest: boolean,
  msSinceLastConversion: number,
  minTimeBetweenMs = 300_000,
): { condition: string; active: boolean; detail: string }[] {
  return [
    {
      condition: NO_TRADE_CONDITIONS[0],
      active: Math.abs(signals.btcEMASlope) < 0.005 && Math.abs(signals.wrpAvaxRatioTrend) < 0.0005,
      detail: "Both BTC and WRP/AVAX signals are flat — regime unclear",
    },
    {
      condition: NO_TRADE_CONDITIONS[1],
      active: signals.wrpTrendQuality < 0.3 && signals.wrpPullbackQuality < 0.3,
      detail: `Trend quality ${signals.wrpTrendQuality.toFixed(2)}, pullback quality ${signals.wrpPullbackQuality.toFixed(2)}`,
    },
    {
      condition: NO_TRADE_CONDITIONS[2],
      active: Math.abs(signals.wrpAvaxRatioTrend) < 0.0002,
      detail: `Ratio trend ${signals.wrpAvaxRatioTrend.toFixed(6)} — too flat for directional trade`,
    },
    {
      condition: NO_TRADE_CONDITIONS[3],
      active: scoreDelta < hurdle,
      detail: `Score delta ${scoreDelta.toFixed(1)} < hurdle ${hurdle}`,
    },
    {
      condition: NO_TRADE_CONDITIONS[4],
      active: signals.btcRealizedVolatility > 80,
      detail: `BTC realized vol ${signals.btcRealizedVolatility.toFixed(1)}% — too uncertain`,
    },
    {
      condition: NO_TRADE_CONDITIONS[5],
      active: !passedUnitTest,
      detail: "Conversion would not improve WRP unit count after costs",
    },
    {
      condition: NO_TRADE_CONDITIONS[6],
      active: msSinceLastConversion < minTimeBetweenMs,
      detail: `${((minTimeBetweenMs - msSinceLastConversion) / 1000).toFixed(0)}s cooldown remaining`,
    },
  ];
}
