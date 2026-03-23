import type { ConversionDecision, MarketSignals } from "@arbitex/shared-types";
import type { TriggerResult } from "./triggers.js";
import {
  evaluateAvaxToWrpTriggers,
  evaluateWrpToAvaxTriggers,
  evaluateNoTradeConditions,
} from "./triggers.js";
import { classifyConversionState, CONVERSION_STATE_CONFIGS } from "./state-machine.js";
import { scoreWRP, scoreAVAX } from "./signal-scorer.js";

export interface ExplanationSection {
  title: string;
  status: "pass" | "fail" | "neutral" | "info";
  summary: string;
  details: string[];
}

export interface ExplanationPayload {
  timestamp: number;
  direction: string;
  approved: boolean;
  sections: ExplanationSection[];
}

/**
 * Builds a 7-section human-readable explanation for a conversion decision.
 *
 * Sections:
 * 1. Market Regime — what state are we in and what does it mean
 * 2. Signal Scores — WRP vs AVAX scoring breakdown
 * 3. Conversion State — A/B/C/D classification and its implications
 * 4. Trigger Evaluation — which triggers passed/failed
 * 5. WRP Unit Gate — did the proposed trade improve unit count
 * 6. Cost Analysis — fees, slippage, gas, uncertainty
 * 7. Final Verdict — approved, blocked, or no-trade with rationale
 */
export function buildExplanation(
  decision: ConversionDecision,
  signals: MarketSignals,
): ExplanationPayload {
  const sections: ExplanationSection[] = [];

  // 1. Market Regime
  sections.push({
    title: "Market Regime",
    status: "info",
    summary: `BTC is ${signals.btcAbove21EMA ? "above" : "below"} the 21 EMA with ${signals.btcRealizedVolatility.toFixed(1)}% realized vol`,
    details: [
      `BTC 1h return: ${(signals.btc1hReturn * 100).toFixed(2)}%`,
      `BTC 4h return: ${(signals.btc4hReturn * 100).toFixed(2)}%`,
      `BTC 24h return: ${(signals.btc24hReturn * 100).toFixed(2)}%`,
      `BTC EMA slope: ${signals.btcEMASlope.toFixed(4)}`,
      `BTC above 21 EMA: ${signals.btcAbove21EMA ? "YES" : "NO"}`,
      `BTC above 55 EMA: ${signals.btcAbove55EMA ? "YES" : "NO"}`,
      `Realized volatility: ${signals.btcRealizedVolatility.toFixed(1)}%`,
    ],
  });

  // 2. Signal Scores
  const wrpScore = scoreWRP(signals);
  const avaxScore = scoreAVAX(signals);
  const scoreDelta = Math.abs(wrpScore - avaxScore);
  const favors = wrpScore > avaxScore ? "WRP" : "AVAX";

  sections.push({
    title: "Signal Scores",
    status: scoreDelta >= 15 ? "pass" : scoreDelta >= 8 ? "neutral" : "fail",
    summary: `WRP ${wrpScore.toFixed(1)} vs AVAX ${avaxScore.toFixed(1)} — delta ${scoreDelta.toFixed(1)} favors ${favors}`,
    details: [
      `WRP score: ${wrpScore.toFixed(1)} (range -100 to +100)`,
      `AVAX score: ${avaxScore.toFixed(1)} (range -100 to +100)`,
      `Score delta: ${scoreDelta.toFixed(1)}`,
      `Hurdle: ${decision.hurdleBps.toFixed(1)}`,
      `Passed hurdle: ${decision.passedHurdle ? "YES" : "NO"}`,
      `WRP/AVAX ratio: ${signals.wrpAvaxRatio.toFixed(6)}`,
      `WRP/AVAX ratio trend: ${signals.wrpAvaxRatioTrend.toFixed(6)}`,
    ],
  });

  // 3. Conversion State
  const { state: convState, config: convConfig } = classifyConversionState(signals);
  const stateDescriptions: Record<string, string> = {
    STATE_A: "BTC uptrend, WRP lagging — accumulate WRP on pullbacks",
    STATE_B: "BTC uptrend, WRP overextended — trim tactical WRP to AVAX",
    STATE_C: "BTC weak, WRP resilient — hold WRP, no rotation",
    STATE_D: "BTC weak, WRP weaker — defensive, rotate to AVAX",
  };

  const shortLabel = convState.replace("STATE_", "");

  sections.push({
    title: "Conversion State",
    status: convState === "STATE_A" ? "pass" : convState === "STATE_D" ? "fail" : "neutral",
    summary: `State ${shortLabel}: ${stateDescriptions[convState] ?? "Unknown state"}`,
    details: [
      `State: ${convState} (${convConfig.label})`,
      `Tactical action: ${convConfig.tacticalAction}`,
      `Core action: ${convConfig.coreAction}`,
      `Rotation: ${convConfig.rotation}`,
      `Urgency: ${convConfig.urgency}`,
      `Max deploy/trim: ${(convConfig.maxDeployOrTrimPct * 100).toFixed(0)}%`,
      `WRP above 21 EMA: ${signals.wrpAbove21EMA ? "YES" : "NO"}`,
      `BTC above 21 EMA: ${signals.btcAbove21EMA ? "YES" : "NO"}`,
    ],
  });

  // 4. Trigger Evaluation
  const isAvaxToWrp = wrpScore > avaxScore;
  const triggers: TriggerResult[] = isAvaxToWrp
    ? evaluateAvaxToWrpTriggers(signals)
    : evaluateWrpToAvaxTriggers(signals);
  const passedCount = triggers.filter((t) => t.passed).length;

  sections.push({
    title: "Trigger Evaluation",
    status: passedCount >= 3 ? "pass" : passedCount >= 2 ? "neutral" : "fail",
    summary: `${passedCount}/${triggers.length} triggers passed (need 3)`,
    details: triggers.map(
      (t) => `${t.passed ? "PASS" : "FAIL"} ${t.condition}: ${t.detail}`,
    ),
  });

  // 5. WRP Unit Gate
  sections.push({
    title: "WRP Unit Gate",
    status: decision.passedUnitTest ? "pass" : "fail",
    summary: decision.passedUnitTest
      ? `Trade would add ${decision.expectedUnitGain.toFixed(2)} WRP units`
      : `Trade would not improve WRP unit count (gain: ${decision.expectedUnitGain.toFixed(2)})`,
    details: [
      `Current WRP units: ${decision.currentWRPUnits.toFixed(2)}`,
      `Expected after costs: ${decision.expectedWRPUnitsAfterCosts.toFixed(2)}`,
      `Expected gain: ${decision.expectedUnitGain.toFixed(2)}`,
      `Threshold: ${decision.unitGainThreshold.toFixed(2)}`,
      `Proposed size: $${decision.proposedSizeUsd.toFixed(2)} (${decision.proposedSizeWRPUnits.toFixed(1)} units)`,
    ],
  });

  // 6. Cost Analysis
  const costs = decision.costs;
  sections.push({
    title: "Cost Analysis",
    status: costs.totalCostUsd < decision.proposedSizeUsd * 0.02 ? "pass" : "fail",
    summary: `Total estimated cost: $${costs.totalCostUsd.toFixed(4)} (${costs.totalCostInWRPUnits.toFixed(2)} WRP units)`,
    details: [
      `DEX fees: $${costs.feesUsd.toFixed(4)}`,
      `Slippage: $${costs.slippageUsd.toFixed(4)}`,
      `Gas: $${costs.gasUsd.toFixed(4)}`,
      `Uncertainty buffer: $${costs.uncertaintyBuffer.toFixed(4)}`,
      `Total: $${costs.totalCostUsd.toFixed(4)}`,
      `As WRP units: ${costs.totalCostInWRPUnits.toFixed(2)}`,
      `Cost as % of trade: ${decision.proposedSizeUsd > 0 ? ((costs.totalCostUsd / decision.proposedSizeUsd) * 100).toFixed(2) : "0"}%`,
    ],
  });

  // 7. Final Verdict
  sections.push({
    title: "Final Verdict",
    status: decision.approved ? "pass" : "fail",
    summary: decision.approved
      ? `APPROVED: ${decision.direction} for $${decision.proposedSizeUsd.toFixed(2)}`
      : decision.blockedReasons.length > 0
        ? `BLOCKED: ${decision.blockedReasons.length} reason(s)`
        : "NO TRADE: conditions not met",
    details: decision.approved
      ? [
          `Direction: ${decision.direction}`,
          `Size: $${decision.proposedSizeUsd.toFixed(2)}`,
          `Expected unit gain: +${decision.expectedUnitGain.toFixed(2)}`,
          "Human confirmation required before execution",
        ]
      : decision.blockedReasons.map((r, i) => `${i + 1}. ${r}`),
  });

  return {
    timestamp: decision.timestamp,
    direction: decision.direction as string,
    approved: decision.approved,
    sections,
  };
}
