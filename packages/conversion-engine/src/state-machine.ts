import {
  ConversionState,
  type ConversionStateConfig,
  type MarketSignals,
} from "@arbitex/shared-types";

export const CONVERSION_STATE_CONFIGS: Record<
  ConversionState,
  ConversionStateConfig
> = {
  [ConversionState.STATE_A]: {
    state: ConversionState.STATE_A as any,
    label: "BTC uptrend, WRP lagging, structure intact",
    tacticalAction: "ACCUMULATE_WRP_ON_PULLBACKS",
    coreAction: "HOLD",
    rotation: "AVAX_TO_WRP_ON_CONFIRMATION",
    urgency: "LOW",
    maxDeployOrTrimPct: 0.8,
  },
  [ConversionState.STATE_B]: {
    state: ConversionState.STATE_B as any,
    label: "BTC uptrend, WRP locally overextended",
    tacticalAction: "TRIM_TACTICAL_WRP_TO_AVAX",
    coreAction: "HOLD_UNTOUCHED",
    rotation: "WRP_TO_AVAX",
    urgency: "MEDIUM",
    maxDeployOrTrimPct: 0.3,
  },
  [ConversionState.STATE_C]: {
    state: ConversionState.STATE_C as any,
    label: "BTC weak, WRP relatively resilient",
    tacticalAction: "HOLD_OR_ADD_WRP",
    coreAction: "HOLD",
    rotation: "NONE",
    urgency: "LOW",
    maxDeployOrTrimPct: 0.2,
  },
  [ConversionState.STATE_D]: {
    state: ConversionState.STATE_D as any,
    label: "BTC weak, WRP weaker than market",
    tacticalAction: "ROTATE_TACTICAL_TO_AVAX",
    coreAction: "HOLD_UNTOUCHED",
    rotation: "WRP_TO_AVAX",
    urgency: "HIGH",
    maxDeployOrTrimPct: 0.6,
  },
};

/**
 * Classify the market into one of 4 conversion states.
 *
 * STATE_A: BTC up + WRP lagging   → accumulate WRP
 * STATE_B: BTC up + WRP stretched → trim to AVAX
 * STATE_C: BTC weak + WRP strong  → hold WRP
 * STATE_D: BTC weak + WRP weaker  → rotate to AVAX
 */
export function classifyConversionState(
  signals: MarketSignals,
): { state: ConversionState; config: ConversionStateConfig } {
  const btcUp = signals.btcAbove21EMA && signals.btcEMASlope > 0;
  const wrpStretched = signals.wrpZScore > 1.5;
  const wrpResilient =
    signals.wrpAvaxRatioTrend > 0 && signals.wrpAbove21EMA;

  let state: ConversionState;

  if (btcUp && !wrpStretched) {
    state = ConversionState.STATE_A;
  } else if (btcUp && wrpStretched) {
    state = ConversionState.STATE_B;
  } else if (!btcUp && wrpResilient) {
    state = ConversionState.STATE_C;
  } else {
    state = ConversionState.STATE_D;
  }

  return { state, config: CONVERSION_STATE_CONFIGS[state] };
}
