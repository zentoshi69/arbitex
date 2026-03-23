import { MarketRegime } from "@arbitex/shared-types";
import type { RegimeConfig, ExtendedRegimeConfig } from "@arbitex/shared-types";
import type { PrismaClient } from "@arbitex/db";
import { dexScreenerFeed } from "@arbitex/dex-adapters";

export const REGIME_CONFIGS: Record<string, RegimeConfig> = {
  [MarketRegime.SAFE_MODE]: {
    regime: MarketRegime.SAFE_MODE as any,
    sizeMultiplier: 0,
    hurdleBps: 9999,
    algorithm: "HALTED",
    priority: "HIGHEST",
    description: "All execution halted — kill switch or critical failure",
  },
  [MarketRegime.GAP_RISK]: {
    regime: MarketRegime.GAP_RISK as any,
    sizeMultiplier: 0.25,
    hurdleBps: 100,
    algorithm: "PASSIVE",
    priority: "HIGH",
    description: "Liquidity gaps detected — reduce size, raise hurdle",
  },
  [MarketRegime.LP_THIN]: {
    regime: MarketRegime.LP_THIN as any,
    sizeMultiplier: 0.5,
    hurdleBps: 75,
    algorithm: "PASSIVE",
    priority: "HIGH",
    description: "Thin LP depth — smaller trades, higher profit threshold",
  },
  [MarketRegime.INV_STRESS]: {
    regime: MarketRegime.INV_STRESS as any,
    sizeMultiplier: 0,
    hurdleBps: 9999,
    algorithm: "HALTED",
    priority: "HIGHEST",
    description: "Inventory stress — too much token exposure, halt new trades",
  },
  [MarketRegime.HIGH_VOL]: {
    regime: MarketRegime.HIGH_VOL as any,
    sizeMultiplier: 0.75,
    hurdleBps: 40,
    algorithm: "AGGRESSIVE",
    priority: "MED",
    description: "High volatility — more opportunities, wider spreads",
  },
  [MarketRegime.RANGE_MR]: {
    regime: MarketRegime.RANGE_MR as any,
    sizeMultiplier: 1.0,
    hurdleBps: 20,
    algorithm: "AGGRESSIVE",
    priority: "BASE",
    description: "Range-bound mean-reversion — optimal conditions for arb",
  },
  [MarketRegime.TREND_UP]: {
    regime: MarketRegime.TREND_UP as any,
    sizeMultiplier: 0.75,
    hurdleBps: 35,
    algorithm: "TWAP",
    priority: "MED",
    description: "Trending up — directional bias, use TWAP sizing",
  },
  [MarketRegime.TREND_DOWN]: {
    regime: MarketRegime.TREND_DOWN as any,
    sizeMultiplier: 0.75,
    hurdleBps: 35,
    algorithm: "TWAP",
    priority: "MED",
    description: "Trending down — directional bias, use TWAP sizing",
  },
  [MarketRegime.STRETCH_UP]: {
    regime: MarketRegime.STRETCH_UP as any,
    sizeMultiplier: 0.7,
    hurdleBps: 45,
    algorithm: "PASSIVE",
    priority: "MED",
    description: "Uptrend but statistically overextended — raise hurdle, reduce size",
  },
  [MarketRegime.CHOP]: {
    regime: MarketRegime.CHOP as any,
    sizeMultiplier: 0.5,
    hurdleBps: 50,
    algorithm: "PASSIVE",
    priority: "MED",
    description: "Directionless price action — arb only, no conversions",
  },
  [MarketRegime.WRP_RESILIENT]: {
    regime: MarketRegime.WRP_RESILIENT as any,
    sizeMultiplier: 0.8,
    hurdleBps: 30,
    algorithm: "AGGRESSIVE",
    priority: "BASE",
    description: "BTC weak but WRP decoupling positively — slight edge discount",
  },
  [MarketRegime.WRP_BREAKDOWN]: {
    regime: MarketRegime.WRP_BREAKDOWN as any,
    sizeMultiplier: 0.4,
    hurdleBps: 60,
    algorithm: "PASSIVE",
    priority: "HIGH",
    description: "WRP underperforming its own trend — rotate tactical to AVAX",
  },
  [MarketRegime.NORMAL]: {
    regime: MarketRegime.NORMAL as any,
    sizeMultiplier: 1.0,
    hurdleBps: 15,
    algorithm: "AGGRESSIVE",
    priority: "BASE",
    description: "Normal market conditions — standard execution",
  },
};

/**
 * Extended regime configs with conversion/arb flags for the Conversion Engine.
 * Maps every MarketRegime to its execution posture.
 */
export const EXTENDED_REGIME_CONFIGS: Record<string, ExtendedRegimeConfig> = {
  [MarketRegime.SAFE_MODE]: {
    state: MarketRegime.SAFE_MODE as any,
    conversionAllowed: false,
    arbAllowed: false,
    maxTacticalSleeveMultiplier: 0,
    edgeHurdleMultiplier: 999,
    wrpUnitGainThresholdMultiplier: 999,
    description: "System-wide halt. All tactical activity suspended.",
    suggestedAction: "No trades. No conversions. Investigate cause.",
  },
  [MarketRegime.GAP_RISK]: {
    state: MarketRegime.GAP_RISK as any,
    conversionAllowed: false,
    arbAllowed: false,
    maxTacticalSleeveMultiplier: 0,
    edgeHurdleMultiplier: 999,
    wrpUnitGainThresholdMultiplier: 999,
    description: "Gap zone detected near current price.",
    suggestedAction: "No execution. Gap zone creates undefined slippage.",
  },
  [MarketRegime.LP_THIN]: {
    state: MarketRegime.LP_THIN as any,
    conversionAllowed: false,
    arbAllowed: false,
    maxTacticalSleeveMultiplier: 0,
    edgeHurdleMultiplier: 999,
    wrpUnitGainThresholdMultiplier: 999,
    description: "V3 pool liquidity dangerously thin.",
    suggestedAction: "No arb. LP coverage insufficient for safe execution.",
  },
  [MarketRegime.INV_STRESS]: {
    state: MarketRegime.INV_STRESS as any,
    conversionAllowed: false,
    arbAllowed: false,
    maxTacticalSleeveMultiplier: 0,
    edgeHurdleMultiplier: 999,
    wrpUnitGainThresholdMultiplier: 999,
    description: "Inventory stress — too much exposure.",
    suggestedAction: "Halt all. Reduce inventory before resuming.",
  },
  [MarketRegime.TREND_UP]: {
    state: MarketRegime.TREND_UP as any,
    conversionAllowed: true,
    arbAllowed: true,
    maxTacticalSleeveMultiplier: 1.0,
    edgeHurdleMultiplier: 1.0,
    wrpUnitGainThresholdMultiplier: 1.0,
    description: "BTC trending up, WRP participating normally.",
    suggestedAction: "Full operations. Accumulate on pullbacks.",
  },
  [MarketRegime.STRETCH_UP]: {
    state: MarketRegime.STRETCH_UP as any,
    conversionAllowed: true,
    arbAllowed: true,
    maxTacticalSleeveMultiplier: 0.7,
    edgeHurdleMultiplier: 1.3,
    wrpUnitGainThresholdMultiplier: 1.2,
    description: "Uptrend but statistically overextended.",
    suggestedAction: "Cautious. Trim tactical WRP. Higher bars to convert.",
  },
  [MarketRegime.TREND_DOWN]: {
    state: MarketRegime.TREND_DOWN as any,
    conversionAllowed: true,
    arbAllowed: true,
    maxTacticalSleeveMultiplier: 0.3,
    edgeHurdleMultiplier: 2.0,
    wrpUnitGainThresholdMultiplier: 2.0,
    description: "BTC selling. Broad market risk-off.",
    suggestedAction: "Defensive. Reduce tactical. Core WRP untouched.",
  },
  [MarketRegime.CHOP]: {
    state: MarketRegime.CHOP as any,
    conversionAllowed: false,
    arbAllowed: true,
    maxTacticalSleeveMultiplier: 0.5,
    edgeHurdleMultiplier: 1.5,
    wrpUnitGainThresholdMultiplier: 1.5,
    description: "Directionless price action.",
    suggestedAction: "No conversions. Arb only. Wait for clarity.",
  },
  [MarketRegime.WRP_RESILIENT]: {
    state: MarketRegime.WRP_RESILIENT as any,
    conversionAllowed: true,
    arbAllowed: true,
    maxTacticalSleeveMultiplier: 0.8,
    edgeHurdleMultiplier: 0.9,
    wrpUnitGainThresholdMultiplier: 0.9,
    description: "BTC weak but WRP decoupling positively.",
    suggestedAction: "Hold or carefully add WRP. Possible catch-up.",
  },
  [MarketRegime.WRP_BREAKDOWN]: {
    state: MarketRegime.WRP_BREAKDOWN as any,
    conversionAllowed: true,
    arbAllowed: true,
    maxTacticalSleeveMultiplier: 0.4,
    edgeHurdleMultiplier: 1.8,
    wrpUnitGainThresholdMultiplier: 1.8,
    description: "WRP underperforming its own trend structure.",
    suggestedAction: "Rotate tactical to AVAX. Wait for structure repair.",
  },
  [MarketRegime.HIGH_VOL]: {
    state: MarketRegime.HIGH_VOL as any,
    conversionAllowed: true,
    arbAllowed: true,
    maxTacticalSleeveMultiplier: 0.5,
    edgeHurdleMultiplier: 1.5,
    wrpUnitGainThresholdMultiplier: 1.5,
    description: "High volatility — more arb opportunities.",
    suggestedAction: "Arb aggressively. Conversions with caution.",
  },
  [MarketRegime.RANGE_MR]: {
    state: MarketRegime.RANGE_MR as any,
    conversionAllowed: true,
    arbAllowed: true,
    maxTacticalSleeveMultiplier: 1.0,
    edgeHurdleMultiplier: 1.0,
    wrpUnitGainThresholdMultiplier: 1.0,
    description: "Range-bound mean-reversion — optimal arb conditions.",
    suggestedAction: "Full operations. Best conditions for arb.",
  },
  [MarketRegime.NORMAL]: {
    state: MarketRegime.NORMAL as any,
    conversionAllowed: true,
    arbAllowed: true,
    maxTacticalSleeveMultiplier: 1.0,
    edgeHurdleMultiplier: 1.0,
    wrpUnitGainThresholdMultiplier: 1.0,
    description: "Normal market conditions.",
    suggestedAction: "Standard operations.",
  },
};

export interface RegimeSignals {
  volatility24h: number;
  spreadMeanBps: number;
  failRatePercent: number;
  lpDepthScore: number;
  trendDirection: "up" | "down" | "neutral";
  dexScreenerVolume24h: number;
  dexScreenerLiquidityUsd: number;
  winRate: number;
}

export interface RegimeSnapshot {
  regime: string;
  config: RegimeConfig;
  signals: RegimeSignals;
  classifiedAt: number;
}

export class RegimeClassifier {
  private lastSnapshot: RegimeSnapshot | null = null;
  private lastClassifiedAt = 0;
  private readonly refreshMs: number;
  private trackedTokens: string[] = [];

  constructor(
    private readonly db: PrismaClient,
    refreshMs = 30_000,
  ) {
    this.refreshMs = refreshMs;
  }

  setTrackedTokens(tokens: string[]): void {
    this.trackedTokens = tokens;
  }

  async classify(): Promise<RegimeSnapshot> {
    if (
      this.lastSnapshot &&
      Date.now() - this.lastClassifiedAt < this.refreshMs
    ) {
      return this.lastSnapshot;
    }

    const signals = await this.computeSignals();
    const regime = this.determineRegime(signals);
    const regimeConfig =
      REGIME_CONFIGS[regime] ?? REGIME_CONFIGS[MarketRegime.NORMAL]!;

    const snapshot: RegimeSnapshot = {
      regime,
      config: regimeConfig,
      signals,
      classifiedAt: Date.now(),
    };

    this.lastSnapshot = snapshot;
    this.lastClassifiedAt = Date.now();
    return snapshot;
  }

  getConfigs(): Record<string, RegimeConfig> {
    return REGIME_CONFIGS;
  }

  private async computeSignals(): Promise<RegimeSignals> {
    const now = Date.now();
    const h1 = new Date(now - 3600_000);

    const execQuery = this.db.execution.findMany({
      where: { createdAt: { gte: h1 } },
      select: { state: true, pnlUsd: true },
    });
    const oppQuery = this.db.opportunity.findMany({
      where: { detectedAt: { gte: h1 } },
      select: {
        netProfitBps: true,
        grossSpreadUsd: true,
        tradeSizeUsd: true,
      },
    });
    const dexQuery = this.fetchDexScreenerSignals();

    const [recentExecsRaw, recentOppsRaw, dexData] = await Promise.all([execQuery, oppQuery, dexQuery]);

    interface ExecRow { state: string; pnlUsd: number | null }
    interface OppRow { netProfitBps: number | null; grossSpreadUsd: number | null; tradeSizeUsd: number | null }

    const recentExecs: ExecRow[] = recentExecsRaw.map((e: any) => ({
      state: String(e.state),
      pnlUsd: e.pnlUsd != null ? Number(e.pnlUsd) : null,
    }));
    const recentOpps: OppRow[] = recentOppsRaw.map((o: any) => ({
      netProfitBps: o.netProfitBps != null ? Number(o.netProfitBps) : null,
      grossSpreadUsd: o.grossSpreadUsd != null ? Number(o.grossSpreadUsd) : null,
      tradeSizeUsd: o.tradeSizeUsd != null ? Number(o.tradeSizeUsd) : null,
    }));

    const totalExecs = recentExecs.length;
    const failedExecs = recentExecs.filter((e) => e.state === "FAILED").length;
    const landedExecs = recentExecs.filter((e) => e.state === "LANDED").length;
    const failRatePercent =
      totalExecs > 0 ? (failedExecs / totalExecs) * 100 : 0;
    const winRate =
      totalExecs > 0 ? (landedExecs / totalExecs) * 100 : 50;

    const spreads: number[] = recentOpps.map((o) => o.netProfitBps ?? 0);
    const spreadMeanBps =
      spreads.length > 0
        ? spreads.reduce((a, b) => a + b, 0) / spreads.length
        : 0;

    const grossSpreads: number[] = recentOpps.map((o) => o.grossSpreadUsd ?? 0);
    const grossMean = grossSpreads.length > 0
      ? grossSpreads.reduce((a, b) => a + b, 0) / grossSpreads.length
      : 0;
    const variance =
      grossSpreads.length > 1
        ? grossSpreads.reduce((sum, v) => sum + (v - grossMean) ** 2, 0) / grossSpreads.length
        : 0;
    const volatility24h = Math.sqrt(variance);

    const lpDepthScore = dexData.totalLiquidityUsd > 100_000
      ? 100
      : dexData.totalLiquidityUsd > 50_000
        ? 75
        : dexData.totalLiquidityUsd > 20_000
          ? 50
          : dexData.totalLiquidityUsd > 5_000
            ? 30
            : 10;

    const pnls: number[] = [];
    for (const e of recentExecs) {
      if (e.pnlUsd !== null) pnls.push(e.pnlUsd);
    }
    const pnlTrend =
      pnls.length >= 3
        ? pnls.slice(-3).reduce((a, b) => a + b, 0) / 3
        : 0;
    const trendDirection: "up" | "down" | "neutral" =
      pnlTrend > 1 ? "up" : pnlTrend < -1 ? "down" : "neutral";

    return {
      volatility24h: Math.round(volatility24h * 100) / 100,
      spreadMeanBps: Math.round(spreadMeanBps * 100) / 100,
      failRatePercent: Math.round(failRatePercent * 100) / 100,
      lpDepthScore: Math.round(lpDepthScore * 100) / 100,
      trendDirection,
      dexScreenerVolume24h: dexData.totalVolume24h,
      dexScreenerLiquidityUsd: dexData.totalLiquidityUsd,
      winRate: Math.round(winRate * 100) / 100,
    };
  }

  private async fetchDexScreenerSignals(): Promise<{
    totalVolume24h: number;
    totalLiquidityUsd: number;
  }> {
    try {
      let totalVolume = 0;
      let totalLiquidity = 0;
      for (const token of this.trackedTokens) {
        const pairs = await dexScreenerFeed.getTokenPairs(token);
        for (const pair of pairs) {
          if (pair.chainId === "avalanche") {
            totalVolume += pair.volume24h;
            totalLiquidity += pair.liquidityUsd;
          }
        }
      }
      return { totalVolume24h: totalVolume, totalLiquidityUsd: totalLiquidity };
    } catch {
      return { totalVolume24h: 0, totalLiquidityUsd: 0 };
    }
  }

  private determineRegime(signals: RegimeSignals): string {
    if (signals.failRatePercent > 80) return MarketRegime.SAFE_MODE;

    // Use DexScreener LP for better depth assessment
    if (signals.dexScreenerLiquidityUsd > 0 && signals.dexScreenerLiquidityUsd < 2_000) {
      return MarketRegime.LP_THIN;
    }
    if (signals.lpDepthScore < 10) return MarketRegime.LP_THIN;

    if (signals.failRatePercent > 50) return MarketRegime.INV_STRESS;

    // High volume + high volatility = aggressive opportunity
    if (signals.volatility24h > 50 && signals.dexScreenerVolume24h > 5_000) {
      return MarketRegime.HIGH_VOL;
    }
    if (signals.volatility24h > 50) return MarketRegime.HIGH_VOL;

    if (signals.dexScreenerLiquidityUsd > 0 && signals.dexScreenerLiquidityUsd < 10_000) {
      return MarketRegime.GAP_RISK;
    }
    if (signals.lpDepthScore < 25) return MarketRegime.GAP_RISK;

    if (signals.trendDirection === "up" && signals.spreadMeanBps > 15)
      return MarketRegime.TREND_UP;
    if (signals.trendDirection === "down" && signals.spreadMeanBps > 15)
      return MarketRegime.TREND_DOWN;
    if (signals.spreadMeanBps > 10 && signals.volatility24h < 20)
      return MarketRegime.RANGE_MR;
    return MarketRegime.NORMAL;
  }
}
