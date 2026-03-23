import { randomUUID } from "crypto";
import type { PrismaClient } from "@arbitex/db";
import type {
  MarketSignals,
  ConversionDecision,
  ConversionCosts,
  ExtendedRegimeConfig,
  MarketRegime,
} from "@arbitex/shared-types";
import { ConversionDirection, ConversionState } from "@arbitex/shared-types";
import { AccumulationEngine } from "@arbitex/accumulation-engine";
import { scoreWRP, scoreAVAX } from "./signal-scorer.js";
import { classifyConversionState, CONVERSION_STATE_CONFIGS } from "./state-machine.js";
import {
  evaluateAvaxToWrpTriggers,
  evaluateWrpToAvaxTriggers,
  evaluateNoTradeConditions,
} from "./triggers.js";

export { scoreWRP, scoreAVAX } from "./signal-scorer.js";
export { classifyConversionState, CONVERSION_STATE_CONFIGS } from "./state-machine.js";
export {
  evaluateAvaxToWrpTriggers,
  evaluateWrpToAvaxTriggers,
  evaluateNoTradeConditions,
} from "./triggers.js";
export { fetchMarketSignals } from "./signal-provider.js";
export { buildExplanation, type ExplanationPayload } from "./explainability.js";

const DEFAULT_HURDLE_SCORE = 15;
const DEFAULT_MIN_UNIT_GAIN_PCT = 0.02;
const DEFAULT_MIN_TIME_BETWEEN_MS = 300_000;
const REQUIRED_TRIGGER_COUNT = 3;

export interface ConversionEngineConfig {
  hurdleScore: number;
  minUnitGainPct: number;
  minTimeBetweenMs: number;
  maxSingleConversionUsd: number;
}

const DEFAULT_CONFIG: ConversionEngineConfig = {
  hurdleScore: DEFAULT_HURDLE_SCORE,
  minUnitGainPct: DEFAULT_MIN_UNIT_GAIN_PCT,
  minTimeBetweenMs: DEFAULT_MIN_TIME_BETWEEN_MS,
  maxSingleConversionUsd: 1_000,
};

/**
 * The Conversion Engine is the heart of the WRP/AVAX rotation strategy.
 * SEPARATE from the Arbitrage Engine — they must never be merged.
 *
 * Produces ConversionDecision: trade, no-trade, or blocked.
 * No-trade is a first-class, valid, and desirable output.
 */
export class ConversionEngine {
  private config: ConversionEngineConfig;
  private lastConversionAt = 0;

  constructor(
    private readonly db: PrismaClient,
    private readonly accumulation: AccumulationEngine,
    config?: Partial<ConversionEngineConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  updateConfig(partial: Partial<ConversionEngineConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  /**
   * Evaluate market signals and produce a conversion decision.
   *
   * This is the primary entry point. It runs the full pipeline:
   * 1. Classify conversion state (A/B/C/D)
   * 2. Score WRP vs AVAX
   * 3. Check triggers
   * 4. Evaluate WRP unit gain
   * 5. Check no-trade conditions
   * 6. Produce approved decision, or explicit no-trade with rationale
   */
  async evaluate(
    signals: MarketSignals,
    regimeConfig?: ExtendedRegimeConfig,
    wrpPriceUsd = 0.0061,
  ): Promise<ConversionDecision> {
    const id = randomUUID();
    const now = Date.now();
    const accState = await this.accumulation.getState();

    // 1. Conversion state
    const { state: convState, config: convStateConfig } =
      classifyConversionState(signals);

    // 2. Score
    const wrpScore = scoreWRP(signals);
    const avaxScore = scoreAVAX(signals);
    const scoreDelta = Math.abs(wrpScore - avaxScore);

    // Direction based on scores
    const rawDirection =
      wrpScore > avaxScore
        ? ConversionDirection.AVAX_TO_WRP
        : ConversionDirection.WRP_TO_AVAX;

    // Apply regime hurdle multiplier
    const hurdleMultiplier = regimeConfig?.edgeHurdleMultiplier ?? 1.0;
    const effectiveHurdle = this.config.hurdleScore * hurdleMultiplier;
    const passedHurdle = scoreDelta >= effectiveHurdle;

    // 3. Trigger evaluation
    const triggers =
      rawDirection === ConversionDirection.AVAX_TO_WRP
        ? evaluateAvaxToWrpTriggers(signals)
        : evaluateWrpToAvaxTriggers(signals);
    const triggersPassedCount = triggers.filter((t) => t.passed).length;
    const triggersOk = triggersPassedCount >= REQUIRED_TRIGGER_COUNT;

    // 4. Sizing
    const maxSizeMultiplier = convStateConfig.maxDeployOrTrimPct;
    const tacticalSleeveUsd =
      accState.tacticalWRPUnits * wrpPriceUsd;
    const proposedSizeUsd = Math.min(
      tacticalSleeveUsd * maxSizeMultiplier,
      this.config.maxSingleConversionUsd,
      regimeConfig
        ? this.config.maxSingleConversionUsd *
          (regimeConfig.maxTacticalSleeveMultiplier ?? 1.0)
        : this.config.maxSingleConversionUsd,
    );
    const proposedSizeWRPUnits =
      wrpPriceUsd > 0 ? proposedSizeUsd / wrpPriceUsd : 0;

    // 5. Cost estimation (conservative)
    const costs: ConversionCosts = {
      feesUsd: proposedSizeUsd * 0.003,
      slippageUsd: signals.slippageEstimate * proposedSizeUsd,
      gasUsd: 0.15,
      uncertaintyBuffer: proposedSizeUsd * 0.005,
      totalCostUsd: 0,
      totalCostInWRPUnits: 0,
    };
    costs.totalCostUsd =
      costs.feesUsd + costs.slippageUsd + costs.gasUsd + costs.uncertaintyBuffer;
    costs.totalCostInWRPUnits =
      wrpPriceUsd > 0 ? costs.totalCostUsd / wrpPriceUsd : 0;

    // 6. WRP unit evaluation
    const expectedReentryUnits = accState.totalWRPUnits + proposedSizeWRPUnits;
    const unitEval = this.accumulation.evaluateConversionForWRPUnits(
      accState.totalWRPUnits,
      proposedSizeUsd,
      expectedReentryUnits,
      costs,
      this.config.minUnitGainPct *
        (regimeConfig?.wrpUnitGainThresholdMultiplier ?? 1.0),
    );

    // 7. No-trade conditions
    const msSinceLast = now - this.lastConversionAt;
    const noTradeChecks = evaluateNoTradeConditions(
      signals,
      scoreDelta,
      effectiveHurdle,
      unitEval.approved,
      msSinceLast,
      this.config.minTimeBetweenMs,
    );
    const activeNoTrade = noTradeChecks.filter((c) => c.active);

    // 8. Regime block
    const regimeBlocked = regimeConfig && !regimeConfig.conversionAllowed;

    // 9. Final decision
    const blockedReasons: string[] = [];
    if (regimeBlocked)
      blockedReasons.push(
        `Regime ${regimeConfig!.state} does not allow conversions`,
      );
    if (!passedHurdle)
      blockedReasons.push(
        `Score delta ${scoreDelta.toFixed(1)} < hurdle ${effectiveHurdle.toFixed(1)}`,
      );
    if (!triggersOk)
      blockedReasons.push(
        `Only ${triggersPassedCount}/${REQUIRED_TRIGGER_COUNT} triggers passed`,
      );
    if (!unitEval.approved) blockedReasons.push(unitEval.rationale);
    for (const nt of activeNoTrade)
      blockedReasons.push(`${nt.condition}: ${nt.detail}`);

    const approved = blockedReasons.length === 0 && proposedSizeUsd > 0;
    const direction = approved ? rawDirection : ConversionDirection.NO_TRADE;

    if (approved) this.lastConversionAt = now;

    const decision: ConversionDecision = {
      id,
      timestamp: now,
      direction: direction as any,
      conversionState: convState as any,
      scoreWRP: wrpScore,
      scoreAVAX: avaxScore,
      scoreDelta,
      hurdleBps: effectiveHurdle,
      passedHurdle,
      currentWRPUnits: accState.totalWRPUnits,
      expectedWRPUnitsAfterCosts:
        accState.totalWRPUnits + unitEval.expectedUnitGain,
      expectedUnitGain: unitEval.expectedUnitGain,
      unitGainThreshold:
        accState.totalWRPUnits * this.config.minUnitGainPct,
      passedUnitTest: unitEval.approved,
      proposedSizeUsd,
      proposedSizeWRPUnits,
      costs,
      approved,
      blockedReasons,
      signals,
    };

    await this.logDecision(decision);
    return decision;
  }

  private async logDecision(decision: ConversionDecision): Promise<void> {
    try {
      const label =
        decision.direction === ConversionDirection.NO_TRADE
          ? "NO_TRADE"
          : decision.direction;
      await this.db.auditLog.create({
        data: {
          action: `CONVERSION_${decision.approved ? "APPROVED" : "BLOCKED"}`,
          actor: "system:conversion-engine",
          entityType: "conversion",
          entityId: decision.id,
          diff: {
            direction: decision.direction,
            state: decision.conversionState,
            approved: decision.approved,
            scoreWRP: decision.scoreWRP,
            scoreAVAX: decision.scoreAVAX,
            scoreDelta: decision.scoreDelta,
            blockedReasons: decision.blockedReasons,
            proposedSizeUsd: decision.proposedSizeUsd,
            expectedUnitGain: decision.expectedUnitGain,
          } as any,
        },
      });
    } catch {
      // non-critical — don't crash on audit log failure
    }
  }
}
