import { MarketRegime } from "@arbitex/shared-types";
import type { RegimeConfig } from "@arbitex/shared-types";
import type { PrismaClient } from "@arbitex/db";

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
    sizeMultiplier: 0.5,
    hurdleBps: 60,
    algorithm: "AGGRESSIVE",
    priority: "MED",
    description: "High volatility — more opportunities but higher risk",
  },
  [MarketRegime.RANGE_MR]: {
    regime: MarketRegime.RANGE_MR as any,
    sizeMultiplier: 1.0,
    hurdleBps: 30,
    algorithm: "AGGRESSIVE",
    priority: "BASE",
    description: "Range-bound mean-reversion — optimal conditions for arb",
  },
  [MarketRegime.TREND_UP]: {
    regime: MarketRegime.TREND_UP as any,
    sizeMultiplier: 0.75,
    hurdleBps: 40,
    algorithm: "TWAP",
    priority: "MED",
    description: "Trending up — directional bias, use TWAP sizing",
  },
  [MarketRegime.TREND_DOWN]: {
    regime: MarketRegime.TREND_DOWN as any,
    sizeMultiplier: 0.75,
    hurdleBps: 40,
    algorithm: "TWAP",
    priority: "MED",
    description: "Trending down — directional bias, use TWAP sizing",
  },
  [MarketRegime.NORMAL]: {
    regime: MarketRegime.NORMAL as any,
    sizeMultiplier: 1.0,
    hurdleBps: 25,
    algorithm: "AGGRESSIVE",
    priority: "BASE",
    description: "Normal market conditions — standard execution",
  },
};

export interface RegimeSignals {
  volatility24h: number;
  spreadMeanBps: number;
  failRatePercent: number;
  lpDepthScore: number;
  trendDirection: "up" | "down" | "neutral";
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

  constructor(
    private readonly db: PrismaClient,
    refreshMs = 30_000,
  ) {
    this.refreshMs = refreshMs;
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

    const [recentExecs, recentOpps] = await Promise.all([
      this.db.execution.findMany({
        where: { createdAt: { gte: h1 } },
        select: { state: true, pnlUsd: true },
      }),
      this.db.opportunity.findMany({
        where: { detectedAt: { gte: h1 } },
        select: {
          netProfitBps: true,
          grossSpreadUsd: true,
          tradeSizeUsd: true,
        },
      }),
    ]);

    const totalExecs = recentExecs.length;
    const failedExecs = recentExecs.filter(
      (e) => e.state === "FAILED",
    ).length;
    const failRatePercent =
      totalExecs > 0 ? (failedExecs / totalExecs) * 100 : 0;

    const spreads = recentOpps.map((o) => Number(o.netProfitBps));
    const spreadMeanBps =
      spreads.length > 0
        ? spreads.reduce((a, b) => a + b, 0) / spreads.length
        : 0;

    const grossSpreads = recentOpps.map((o) => Number(o.grossSpreadUsd));
    const variance =
      grossSpreads.length > 1
        ? grossSpreads.reduce((sum, v) => {
            const mean =
              grossSpreads.reduce((a, b) => a + b, 0) / grossSpreads.length;
            return sum + (v - mean) ** 2;
          }, 0) / grossSpreads.length
        : 0;
    const volatility24h = Math.sqrt(variance);

    const tradeSizes = recentOpps.map((o) => Number(o.tradeSizeUsd));
    const avgTradeSize =
      tradeSizes.length > 0
        ? tradeSizes.reduce((a, b) => a + b, 0) / tradeSizes.length
        : 0;
    const lpDepthScore =
      avgTradeSize > 0 ? Math.min(100, avgTradeSize / 10) : 50;

    const pnls = recentExecs
      .filter((e) => e.pnlUsd !== null)
      .map((e) => Number(e.pnlUsd));
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
    };
  }

  private determineRegime(signals: RegimeSignals): string {
    if (signals.failRatePercent > 80) return MarketRegime.SAFE_MODE;
    if (signals.lpDepthScore < 10) return MarketRegime.LP_THIN;
    if (signals.failRatePercent > 50) return MarketRegime.INV_STRESS;
    if (signals.volatility24h > 50) return MarketRegime.HIGH_VOL;
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
