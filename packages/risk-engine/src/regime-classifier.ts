import { MarketRegime } from "@arbitex/shared-types";
import type { RegimeConfig } from "@arbitex/shared-types";
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
  [MarketRegime.NORMAL]: {
    regime: MarketRegime.NORMAL as any,
    sizeMultiplier: 1.0,
    hurdleBps: 15,
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

    const [recentExecs, recentOpps, dexData] = await Promise.all([
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
      this.fetchDexScreenerSignals(),
    ]);

    type ExecRow = { state: string; pnlUsd: number | null };
    type OppRow = { netProfitBps: number | null; grossSpreadUsd: number | null; tradeSizeUsd: number | null };

    const totalExecs = recentExecs.length;
    const failedExecs = recentExecs.filter(
      (e: ExecRow) => e.state === "FAILED",
    ).length;
    const landedExecs = recentExecs.filter(
      (e: ExecRow) => e.state === "LANDED",
    ).length;
    const failRatePercent =
      totalExecs > 0 ? (failedExecs / totalExecs) * 100 : 0;
    const winRate =
      totalExecs > 0 ? (landedExecs / totalExecs) * 100 : 50;

    const spreads = recentOpps.map((o: OppRow) => Number(o.netProfitBps));
    const spreadMeanBps =
      spreads.length > 0
        ? spreads.reduce((a: number, b: number) => a + b, 0) / spreads.length
        : 0;

    const grossSpreads = recentOpps.map((o: OppRow) => Number(o.grossSpreadUsd));
    const variance =
      grossSpreads.length > 1
        ? grossSpreads.reduce((sum: number, v: number) => {
            const mean =
              grossSpreads.reduce((a: number, b: number) => a + b, 0) / grossSpreads.length;
            return sum + (v - mean) ** 2;
          }, 0) / grossSpreads.length
        : 0;
    const volatility24h = Math.sqrt(variance);

    // Use DexScreener liquidity for LP depth score instead of heuristic
    const lpDepthScore = dexData.totalLiquidityUsd > 100_000
      ? 100
      : dexData.totalLiquidityUsd > 50_000
        ? 75
        : dexData.totalLiquidityUsd > 20_000
          ? 50
          : dexData.totalLiquidityUsd > 5_000
            ? 30
            : 10;

    const pnls = recentExecs
      .filter((e: ExecRow) => e.pnlUsd !== null)
      .map((e: ExecRow) => Number(e.pnlUsd));
    const pnlTrend =
      pnls.length >= 3
        ? pnls.slice(-3).reduce((a: number, b: number) => a + b, 0) / 3
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
