import { z } from "zod";
import { AddressSchema, BigIntStringSchema } from "./index.js";

// ── V3 Pool State ────────────────────────────────────────────────────────────

export const V3PoolStateSchema = z.object({
  poolAddress: AddressSchema,
  token0: AddressSchema,
  token1: AddressSchema,
  token0Symbol: z.string(),
  token1Symbol: z.string(),
  token0Decimals: z.number(),
  token1Decimals: z.number(),
  fee: z.number(),
  sqrtPriceX96: BigIntStringSchema,
  tick: z.number(),
  liquidity: BigIntStringSchema,
  tickSpacing: z.number(),
  venueId: z.string(),
  venueName: z.string(),
  chainId: z.number(),
  timestamp: z.number(),
});
export type V3PoolState = z.infer<typeof V3PoolStateSchema>;

// ── Tick Data ────────────────────────────────────────────────────────────────

export interface TickData {
  tick: number;
  liquidityNet: bigint;
  liquidityGross: bigint;
  initialized: boolean;
}

export interface TickBitmapWord {
  wordIndex: number;
  bitmap: bigint;
}

// ── LP Band Types ────────────────────────────────────────────────────────────

export const LPBandSchema = z.object({
  tickLower: z.number(),
  tickUpper: z.number(),
  liquidityNet: z.string(),
  liquidityGross: z.string(),
  cumulativeLiquidity: z.string(),
  priceRange: z.object({
    lower: z.number(),
    upper: z.number(),
  }),
  isGapZone: z.boolean(),
  isThinZone: z.boolean(),
  isCliffPoint: z.boolean(),
  capacityUsd: z.number(),
});
export type LPBand = z.infer<typeof LPBandSchema>;

export const LPBandProfileSchema = z.object({
  poolAddress: z.string(),
  venueName: z.string(),
  currentTick: z.number(),
  currentPrice: z.number(),
  tickSpacing: z.number(),
  totalPositions: z.number(),
  totalLiquidityUsd: z.number(),
  bands: z.array(LPBandSchema),
  gapZones: z.array(
    z.object({
      tickLower: z.number(),
      tickUpper: z.number(),
      priceLower: z.number(),
      priceUpper: z.number(),
    })
  ),
  cliffPoints: z.array(
    z.object({
      tick: z.number(),
      price: z.number(),
      liquidityDropPct: z.number(),
    })
  ),
  safeTradeEnvelope: z.object({
    maxSizeToken0: z.string(),
    maxSizeToken1: z.string(),
    maxSizeUsd: z.number(),
    firstCliffTick: z.number().nullable(),
    firstGapTick: z.number().nullable(),
  }),
  averageLiquidity: z.string(),
  concentrationScore: z.number(),
  builtAt: z.number(),
});
export type LPBandProfile = z.infer<typeof LPBandProfileSchema>;

// ── V3 Simulation Types ──────────────────────────────────────────────────────

export const V3SimulationStepSchema = z.object({
  tickBefore: z.number(),
  tickAfter: z.number(),
  sqrtPriceBefore: z.string(),
  sqrtPriceAfter: z.string(),
  amountInConsumed: z.string(),
  amountOutProduced: z.string(),
  feeAmount: z.string(),
  liquidityAtTick: z.string(),
  crossedTick: z.boolean(),
});
export type V3SimulationStep = z.infer<typeof V3SimulationStepSchema>;

export const V3TradeSimulationSchema = z.object({
  tokenIn: AddressSchema,
  tokenOut: AddressSchema,
  amountIn: z.string(),
  amountOut: z.string(),
  effectivePrice: z.number(),
  priceImpactBps: z.number(),
  feesPaid: z.string(),
  ticksCrossed: z.number(),
  gasEstimate: z.number(),
  steps: z.array(V3SimulationStepSchema),
  hitGapZone: z.boolean(),
  hitCliff: z.boolean(),
  abortReason: z.string().nullable(),
});
export type V3TradeSimulation = z.infer<typeof V3TradeSimulationSchema>;

// ── Optimal Sizing ───────────────────────────────────────────────────────────

export const OptimalSizeResultSchema = z.object({
  optimalAmountIn: z.string(),
  optimalSizeUsd: z.number(),
  netProfitUsd: z.number(),
  netProfitBps: z.number(),
  iterations: z.number(),
  converged: z.boolean(),
  buySimulation: V3TradeSimulationSchema,
  sellSimulation: V3TradeSimulationSchema,
});
export type OptimalSizeResult = z.infer<typeof OptimalSizeResultSchema>;

// ── Market Regime ────────────────────────────────────────────────────────────

export const MarketRegime = {
  SAFE_MODE: "SAFE_MODE",
  GAP_RISK: "GAP_RISK",
  LP_THIN: "LP_THIN",
  INV_STRESS: "INV_STRESS",
  HIGH_VOL: "HIGH_VOL",
  RANGE_MR: "RANGE_MR",
  TREND_UP: "TREND_UP",
  STRETCH_UP: "STRETCH_UP",
  TREND_DOWN: "TREND_DOWN",
  CHOP: "CHOP",
  WRP_RESILIENT: "WRP_RESILIENT",
  WRP_BREAKDOWN: "WRP_BREAKDOWN",
  NORMAL: "NORMAL",
} as const;
export type MarketRegime = (typeof MarketRegime)[keyof typeof MarketRegime];

export const RegimeConfigSchema = z.object({
  regime: z.nativeEnum(MarketRegime as any),
  sizeMultiplier: z.number(),
  hurdleBps: z.number(),
  algorithm: z.enum(["HALTED", "PASSIVE", "AGGRESSIVE", "TWAP"]),
  priority: z.enum(["HIGHEST", "HIGH", "MED", "BASE"]),
  description: z.string(),
});
export type RegimeConfig = z.infer<typeof RegimeConfigSchema>;

// ── Explanation Payload (7 sections) ─────────────────────────────────────────

export const ExplanationPayloadSchema = z.object({
  marketInputs: z.object({
    buyPoolPrice: z.number(),
    sellPoolPrice: z.number(),
    spreadBps: z.number(),
    buyVenue: z.string(),
    sellVenue: z.string(),
    buyPoolLiquidityUsd: z.number(),
    sellPoolLiquidityUsd: z.number(),
    timestamp: z.number(),
  }),
  regimeClassification: z.object({
    regime: z.nativeEnum(MarketRegime as any),
    sizeMultiplier: z.number(),
    hurdleBps: z.number(),
    algorithm: z.string(),
  }),
  decisionRationale: z.object({
    action: z.enum(["EXECUTE", "BLOCK", "SKIP"]),
    reason: z.string(),
    confidenceScore: z.number(),
  }),
  routeSelection: z.object({
    buyPool: z.string(),
    sellPool: z.string(),
    tokenPath: z.array(z.string()),
    isFlashArb: z.boolean(),
  }),
  costBreakdown: z.object({
    grossSpreadUsd: z.number(),
    buyFeeUsd: z.number(),
    sellFeeUsd: z.number(),
    buySlippageUsd: z.number(),
    sellSlippageUsd: z.number(),
    gasCostUsd: z.number(),
    netProfitUsd: z.number(),
  }),
  thresholdChecks: z.array(
    z.object({
      rule: z.string(),
      passed: z.boolean(),
      required: z.string(),
      actual: z.string(),
    })
  ),
  compositeConfidence: z.object({
    score: z.number(),
    factors: z.record(z.number()),
  }),
});
export type ExplanationPayload = z.infer<typeof ExplanationPayloadSchema>;

// ── Fair Value ───────────────────────────────────────────────────────────────

export const FairValueSourceSchema = z.object({
  name: z.string(),
  method: z.string(),
  priceUsd: z.number().nullable(),
  weight: z.number(),
  confidence: z.number(),
  stale: z.boolean(),
  lastUpdated: z.number(),
});
export type FairValueSource = z.infer<typeof FairValueSourceSchema>;

export const FairValueEstimateSchema = z.object({
  token: z.string(),
  compositeUsd: z.number(),
  sources: z.array(FairValueSourceSchema),
  divergenceAlertActive: z.boolean(),
  maxDivergencePct: z.number(),
  updatedAt: z.number(),
});
export type FairValueEstimate = z.infer<typeof FairValueEstimateSchema>;

// ── Conversion State Machine (4 states) ─────────────────────────────────────

export const ConversionState = {
  STATE_A: "STATE_A",
  STATE_B: "STATE_B",
  STATE_C: "STATE_C",
  STATE_D: "STATE_D",
} as const;
export type ConversionState =
  (typeof ConversionState)[keyof typeof ConversionState];

export const ConversionStateConfigSchema = z.object({
  state: z.nativeEnum(ConversionState as any),
  label: z.string(),
  tacticalAction: z.string(),
  coreAction: z.string(),
  rotation: z.string(),
  urgency: z.enum(["LOW", "MEDIUM", "HIGH"]),
  maxDeployOrTrimPct: z.number(),
});
export type ConversionStateConfig = z.infer<typeof ConversionStateConfigSchema>;

// ── Accumulation State ──────────────────────────────────────────────────────

export const AccumulationStateSchema = z.object({
  totalWRPUnits: z.number(),
  coreWRPUnits: z.number(),
  tacticalWRPUnits: z.number(),
  arbSleeveLiquidityUsd: z.number(),

  wrpUnitsGainedToday: z.number(),
  wrpUnitsGainedAllTime: z.number(),
  wrpUnitsLostToRotation: z.number(),

  coreSleeveAllocationPct: z.number(),
  tacticalSleeveAllocationPct: z.number(),
  arbSleeveAllocationPct: z.number(),

  maxTacticalSleeveUsd: z.number(),
  maxSingleConversionUsd: z.number(),

  updatedAt: z.number(),
});
export type AccumulationState = z.infer<typeof AccumulationStateSchema>;

// ── Conversion Costs ────────────────────────────────────────────────────────

export const ConversionCostsSchema = z.object({
  feesUsd: z.number(),
  slippageUsd: z.number(),
  gasUsd: z.number(),
  uncertaintyBuffer: z.number(),
  totalCostUsd: z.number(),
  totalCostInWRPUnits: z.number(),
});
export type ConversionCosts = z.infer<typeof ConversionCostsSchema>;

// ── Arb Profit Routing ──────────────────────────────────────────────────────

export const ArbProfitRoutingSchema = z.object({
  pendingUsdForWRPConversion: z.number(),
  autoConvertThreshold: z.number(),
  autoConvertEnabled: z.boolean(),
  lastRoutingAt: z.number(),
});
export type ArbProfitRouting = z.infer<typeof ArbProfitRoutingSchema>;

// ── Market Signals (fed to scoring model) ───────────────────────────────────

export const MarketSignalsSchema = z.object({
  btc1hReturn: z.number(),
  btc4hReturn: z.number(),
  btc24hReturn: z.number(),
  btcEMASlope: z.number(),
  btcRealizedVolatility: z.number(),
  btcAbove21EMA: z.boolean(),
  btcAbove55EMA: z.boolean(),

  wrpAvaxRatio: z.number(),
  wrpAvaxRatioTrend: z.number(),
  wrpBtcRatio: z.number(),
  wrpBtcRatioTrend: z.number(),
  wrpAbove21EMA: z.boolean(),
  wrpVWAPDeviation: z.number(),
  wrpZScore: z.number(),

  wrpRelativeVolume: z.number(),
  avaxRelativeVolume: z.number(),

  wrpTrendQuality: z.number(),
  wrpPullbackQuality: z.number(),

  wrpLiquidityScore: z.number(),
  slippageEstimate: z.number(),

  wrpPriceUsd: z.number().optional(),
  avaxPriceUsd: z.number().optional(),
  lpDepthUsd: z.number().optional(),
});
export type MarketSignals = z.infer<typeof MarketSignalsSchema>;

// ── Conversion Decision ─────────────────────────────────────────────────────

export const ConversionDirection = {
  AVAX_TO_WRP: "AVAX_TO_WRP",
  WRP_TO_AVAX: "WRP_TO_AVAX",
  NO_TRADE: "NO_TRADE",
} as const;
export type ConversionDirection =
  (typeof ConversionDirection)[keyof typeof ConversionDirection];

export const ConversionDecisionSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  direction: z.nativeEnum(ConversionDirection as any),
  conversionState: z.nativeEnum(ConversionState as any),

  scoreWRP: z.number(),
  scoreAVAX: z.number(),
  scoreDelta: z.number(),
  hurdleBps: z.number(),
  passedHurdle: z.boolean(),

  currentWRPUnits: z.number(),
  expectedWRPUnitsAfterCosts: z.number(),
  expectedUnitGain: z.number(),
  unitGainThreshold: z.number(),
  passedUnitTest: z.boolean(),

  proposedSizeUsd: z.number(),
  proposedSizeWRPUnits: z.number(),

  costs: ConversionCostsSchema,

  approved: z.boolean(),
  blockedReasons: z.array(z.string()),

  signals: MarketSignalsSchema.optional(),
});
export type ConversionDecision = z.infer<typeof ConversionDecisionSchema>;

// ── Extended Regime Config (with conversion flags) ──────────────────────────

export const ExtendedRegimeConfigSchema = z.object({
  state: z.nativeEnum(MarketRegime as any),
  conversionAllowed: z.boolean(),
  arbAllowed: z.boolean(),
  maxTacticalSleeveMultiplier: z.number(),
  edgeHurdleMultiplier: z.number(),
  wrpUnitGainThresholdMultiplier: z.number(),
  description: z.string(),
  suggestedAction: z.string(),
});
export type ExtendedRegimeConfig = z.infer<typeof ExtendedRegimeConfigSchema>;

// ── WRP Unit Impact (for explanation payloads) ──────────────────────────────

export const WRPUnitImpactSchema = z.object({
  currentWRPUnits: z.number(),
  expectedWRPUnitsAfter: z.number(),
  expectedUnitGain: z.number(),
  unitGainThreshold: z.number(),
  passedUnitTest: z.boolean(),
});
export type WRPUnitImpact = z.infer<typeof WRPUnitImpactSchema>;
