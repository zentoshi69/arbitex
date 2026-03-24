import { createHash } from "crypto";
import type {
  NormalizedPool,
  ProfitBreakdown,
  RouteStep,
  Address,
  RiskConfig,
} from "@arbitex/shared-types";
import { OpportunityState } from "@arbitex/shared-types";
import type { IDexAdapter } from "@arbitex/dex-adapters";
import { dexScreenerFeed, type DexScreenerPair } from "@arbitex/dex-adapters";
import type { PrismaClient } from "@arbitex/db";
import type { ArbitexPublicClient } from "@arbitex/chain";

export * from "./v3-math.js";
export * from "./v3-simulator.js";
export * from "./lp-band-builder.js";
export * from "./optimal-sizer.js";
export * from "./liquidity-scanner.js";

// ── Confidence Scoring Weights ───────────────────────────────────────────────

const CONFIDENCE_WEIGHTS = {
  spreadToGas: 0.25,
  liquidityDepth: 0.20,
  volumeActivity: 0.15,
  priceImpact: 0.20,
  poolFreshness: 0.10,
  quoteReliability: 0.10,
} as const;

const MIN_DEAD_POOL_LP_USD = 100;
const MAX_TRADE_PCT_OF_TVL = 0.02;
const MIN_TRADE_SIZE_USD = 5;
const MAX_PRICE_IMPACT_VS_SPREAD = 0.5;

export type OpportunityCandidate = {
  id: string;
  fingerprint: string;
  tokenIn: Address;
  tokenOut: Address;
  tokenInSymbol: string;
  tokenOutSymbol: string;
  tokenId?: string;
  tokenSymbol?: string;
  tradeSizeUsd: number;
  buyPool: NormalizedPool;
  sellPool: NormalizedPool;
  buyQuoteAmountOut: string;
  sellQuoteAmountOut: string;
  profitBreakdown: ProfitBreakdown;
  routes: RouteStep[];
  confidenceScore: number;
  priceImpactBps: number;
  dexScreenerLiquidity: { buy: number; sell: number };
};

export type PoolIndexerConfig = {
  targetTokens: Address[];
  tradeSizeUsd: number;
  ethPriceUsd: number;
  riskConfig: RiskConfig;
};

export function computeProfitBreakdown(params: {
  grossSpreadUsd: number;
  gasUnits: bigint;
  gasPriceWei: bigint;
  ethPriceUsd: number;
  buyFeeBps: number;
  sellFeeBps: number;
  tradeSizeUsd: number;
  slippageBufferFactor: number;
  failureBufferFactor: number;
  failureGasEstimateUsd: number;
  priceImpactUsd?: number;
}): ProfitBreakdown {
  const gasEth =
    Number(params.gasUnits * params.gasPriceWei) / 1e18;
  const gasEstimateUsd = gasEth * params.ethPriceUsd;

  const venueFeesUsd =
    ((params.buyFeeBps + params.sellFeeBps) / 10_000) * params.tradeSizeUsd;

  const slippageBufferUsd = params.slippageBufferFactor * params.tradeSizeUsd;

  const failureBufferUsd =
    params.failureBufferFactor * params.failureGasEstimateUsd;

  const priceImpactUsd = params.priceImpactUsd ?? 0;

  const netProfitUsd =
    params.grossSpreadUsd -
    gasEstimateUsd -
    venueFeesUsd -
    slippageBufferUsd -
    failureBufferUsd -
    priceImpactUsd;

  const netProfitBps =
    params.tradeSizeUsd > 0
      ? (netProfitUsd / params.tradeSizeUsd) * 10_000
      : 0;

  return {
    grossSpreadUsd: params.grossSpreadUsd,
    gasEstimateUsd,
    venueFeesUsd,
    slippageBufferUsd,
    failureBufferUsd,
    netProfitUsd,
    netProfitBps,
  };
}

export function buildOpportunityFingerprint(
  tokenIn: Address,
  tokenOut: Address,
  buyVenueId: string,
  sellVenueId: string,
  tradeSizeUsd: number
): string {
  const windowBucket = Math.floor(Date.now() / 10_000);
  const sizeBucket = Math.floor(tradeSizeUsd / 100);
  const payload = [
    tokenIn.toLowerCase(),
    tokenOut.toLowerCase(),
    buyVenueId,
    sellVenueId,
    String(sizeBucket),
    String(windowBucket),
  ].join(":");
  return createHash("sha256").update(payload).digest("hex");
}

// ── Price Impact Estimation ──────────────────────────────────────────────────

function estimateV2PriceImpact(tradeSizeUsd: number, poolLiquidityUsd: number): number {
  if (poolLiquidityUsd <= 0) return 1;
  return tradeSizeUsd / (2 * poolLiquidityUsd);
}

function estimateV3PriceImpact(
  tradeSizeUsd: number,
  poolLiquidityUsd: number,
  _feeBps: number
): number {
  if (poolLiquidityUsd <= 0) return 1;
  return tradeSizeUsd / (3 * poolLiquidityUsd);
}

function estimatePriceImpact(
  tradeSizeUsd: number,
  pool: NormalizedPool
): number {
  const isV3 = pool.sqrtPriceX96 !== undefined && pool.sqrtPriceX96 !== null;
  return isV3
    ? estimateV3PriceImpact(tradeSizeUsd, pool.liquidityUsd, pool.feeBps)
    : estimateV2PriceImpact(tradeSizeUsd, pool.liquidityUsd);
}

// ── Dynamic Trade Sizing ─────────────────────────────────────────────────────

function computeOptimalTradeSize(
  buyPool: NormalizedPool,
  sellPool: NormalizedPool,
  maxTradeSizeUsd: number,
  spreadFraction: number,
): number {
  const smallerPoolTvl = Math.min(buyPool.liquidityUsd, sellPool.liquidityUsd);
  const tvlCappedSize = smallerPoolTvl * MAX_TRADE_PCT_OF_TVL;

  // Kelly-inspired: larger trades when spread is larger relative to risk
  const kellyFraction = Math.min(0.5, spreadFraction * 5);
  const kellySizeUsd = smallerPoolTvl * kellyFraction * MAX_TRADE_PCT_OF_TVL;

  const dynamicSize = Math.max(kellySizeUsd, MIN_TRADE_SIZE_USD);
  return Math.min(dynamicSize, tvlCappedSize, maxTradeSizeUsd);
}

// ── Confidence Scoring ───────────────────────────────────────────────────────

function computeConfidenceScore(params: {
  grossSpreadUsd: number;
  gasEstimateUsd: number;
  buyPoolLiqUsd: number;
  sellPoolLiqUsd: number;
  volume24h: number;
  priceImpactFraction: number;
  spreadFraction: number;
  poolAgeSecs: number;
  quotesSucceeded: boolean;
}): number {
  // Spread-to-gas ratio (higher = better)
  const spreadGasRatio = params.gasEstimateUsd > 0
    ? Math.min(1, (params.grossSpreadUsd / params.gasEstimateUsd - 1) / 4)
    : 0;

  // Liquidity depth (min of both pools, normalized)
  const minLiq = Math.min(params.buyPoolLiqUsd, params.sellPoolLiqUsd);
  const liqScore = Math.min(1, minLiq / 50_000);

  // Volume activity from DexScreener
  const volScore = Math.min(1, params.volume24h / 10_000);

  // Price impact (lower = better)
  const impactScore = params.spreadFraction > 0
    ? Math.max(0, 1 - (params.priceImpactFraction / params.spreadFraction))
    : 0;

  // Pool freshness (newer = better)
  const freshnessScore = Math.max(0, 1 - params.poolAgeSecs / 60);

  // Quote reliability
  const quoteScore = params.quotesSucceeded ? 1 : 0.3;

  return (
    CONFIDENCE_WEIGHTS.spreadToGas * spreadGasRatio +
    CONFIDENCE_WEIGHTS.liquidityDepth * liqScore +
    CONFIDENCE_WEIGHTS.volumeActivity * volScore +
    CONFIDENCE_WEIGHTS.priceImpact * impactScore +
    CONFIDENCE_WEIGHTS.poolFreshness * freshnessScore +
    CONFIDENCE_WEIGHTS.quoteReliability * quoteScore
  );
}

// ── Main Engine ──────────────────────────────────────────────────────────────

export class OpportunityEngine {
  private poolCache = new Map<string, NormalizedPool>();
  private dbPoolIdCache = new Map<string, string | null>();
  private adapters: IDexAdapter[];
  private adapterByVenue = new Map<string, IDexAdapter>();
  private dexScreenerPairCache = new Map<string, DexScreenerPair>();

  constructor(
    adapters: IDexAdapter[],
    private readonly db: PrismaClient,
    private readonly client: ArbitexPublicClient
  ) {
    this.adapters = adapters;
    for (const a of adapters) this.adapterByVenue.set(a.venueId, a);
  }

  updateAdapters(adapters: IDexAdapter[]): void {
    this.adapters = adapters;
    this.adapterByVenue.clear();
    for (const a of adapters) this.adapterByVenue.set(a.venueId, a);
  }

  async refreshDexScreenerData(targetTokens: Address[]): Promise<void> {
    try {
      await dexScreenerFeed.refreshAll(targetTokens);
      for (const token of targetTokens) {
        const pairs = await dexScreenerFeed.getTokenPairs(token);
        for (const pair of pairs) {
          if (pair.chainId === "avalanche") {
            this.dexScreenerPairCache.set(pair.pairAddress.toLowerCase(), pair);
          }
        }
      }
    } catch {
      // DexScreener down — continue with on-chain data only
    }
  }

  getDexScreenerLiquidity(poolAddress: string): number {
    const pair = this.dexScreenerPairCache.get(poolAddress.toLowerCase());
    return pair?.liquidityUsd ?? 0;
  }

  getDexScreenerVolume(poolAddress: string): number {
    const pair = this.dexScreenerPairCache.get(poolAddress.toLowerCase());
    return pair?.volume24h ?? 0;
  }

  async scanForOpportunities(
    cfg: PoolIndexerConfig
  ): Promise<OpportunityCandidate[]> {
    await Promise.all([
      this.refreshPools(cfg.targetTokens),
      this.refreshDexScreenerData(cfg.targetTokens),
    ]);

    const trackedTokens = await this.db.token.findMany({
      where: { isTracked: true },
      select: { id: true, address: true, symbol: true },
    });
    const trackedByAddr = new Map<string, { id: string; symbol: string }>(
      trackedTokens.map((t: { id: string; address: string; symbol: string }) => [t.address.toLowerCase(), { id: t.id, symbol: t.symbol }])
    );

    const poolsBefore = this.poolCache.size;
    this.killDeadPools();
    const poolsAfter = this.poolCache.size;

    const candidates = this.findCrossVenuePairs(cfg.targetTokens);

    if (candidates.length === 0) {
      const pools = Array.from(this.poolCache.values());
      const byPair = new Map<string, Array<{ venue: string; price: number; liq: number }>>();
      for (const p of pools) {
        const key = [p.token0Symbol, p.token1Symbol].sort().join("/");
        const arr = byPair.get(key) ?? [];
        arr.push({ venue: p.venueName, price: p.price0Per1, liq: p.liquidityUsd });
        byPair.set(key, arr);
      }
      const pairSummary: Record<string, any> = {};
      for (const [pair, venues] of byPair) {
        if (venues.length >= 2) {
          const prices = venues.map((v) => v.price);
          const maxP = Math.max(...prices);
          const minP = Math.min(...prices);
          const spreadBps = minP > 0 ? Math.round(((maxP - minP) / minP) * 10_000) : 0;
          pairSummary[pair] = { venues: venues.length, spreadBps, details: venues.map((v) => `${v.venue}=${v.price.toPrecision(6)}/$${Math.round(v.liq)}`) };
        }
      }
      console.log(JSON.stringify({
        level: 30,
        msg: "OPP_DEBUG: No cross-venue pairs found",
        poolsBefore,
        poolsAfter,
        totalPools: pools.length,
        multiVenuePairs: Object.keys(pairSummary).length,
        pairSummary,
        tradeSize: cfg.tradeSizeUsd,
        hurdleBps: Math.round((cfg.riskConfig.minNetProfitUsd / cfg.tradeSizeUsd) * 10_000),
      }));
    }

    const gasPriceWei = await this.client.getGasPrice();

    const scored: OpportunityCandidate[] = [];
    let rejectReasons: Record<string, number> = {};

    for (const { buyPool, sellPool } of candidates) {
      const candidate = await this.scoreCandidate(
        buyPool,
        sellPool,
        gasPriceWei,
        cfg
      );
      if (!candidate) {
        const key = `${buyPool.venueName}→${sellPool.venueName}:${buyPool.token0Symbol}/${buyPool.token1Symbol}`;
        rejectReasons[key] = (rejectReasons[key] ?? 0) + 1;
        continue;
      }
      if (candidate.profitBreakdown.grossSpreadUsd <= 0) {
        const key = `noSpread:${buyPool.venueName}→${sellPool.venueName}:${buyPool.token0Symbol}/${buyPool.token1Symbol}`;
        rejectReasons[key] = (rejectReasons[key] ?? 0) + 1;
        continue;
      }
      const tracked =
        trackedByAddr.get(candidate.tokenIn.toLowerCase()) ??
        trackedByAddr.get(candidate.tokenOut.toLowerCase());
      if (tracked) {
        candidate.tokenId = tracked.id;
        candidate.tokenSymbol = tracked.symbol;
      }
      scored.push(candidate);
    }

    if (scored.length === 0 && candidates.length > 0) {
      console.log(JSON.stringify({
        level: 30,
        msg: "OPP_DEBUG: All candidates rejected",
        crossVenuePairs: candidates.length,
        poolsInCache: this.poolCache.size,
        tradeSize: cfg.tradeSizeUsd,
        minProfit: cfg.riskConfig.minNetProfitUsd,
        rejectReasons,
      }));
    }

    return scored.sort(
      (a, b) => {
        const confDiff = b.confidenceScore - a.confidenceScore;
        if (Math.abs(confDiff) > 0.1) return confDiff;
        return b.profitBreakdown.netProfitUsd - a.profitBreakdown.netProfitUsd;
      }
    );
  }

  private killDeadPools(): void {
    for (const [poolId, pool] of this.poolCache) {
      const dexLiq = this.getDexScreenerLiquidity(poolId);
      const effectiveLiq = dexLiq > 0 ? dexLiq : pool.liquidityUsd;
      if (effectiveLiq < MIN_DEAD_POOL_LP_USD) {
        this.poolCache.delete(poolId);
      }
    }
  }

  async refreshPools(targetTokens: Address[]): Promise<void> {
    await Promise.allSettled(
      this.adapters.map(async (adapter) => {
        try {
          const pools = await adapter.getPools(targetTokens);
          for (const pool of pools) {
            const dexLiq = this.getDexScreenerLiquidity(pool.poolId);
            if (dexLiq > 0) {
              pool.liquidityUsd = dexLiq;
            }
            this.poolCache.set(pool.poolId, pool);
          }

          // Fire-and-forget snapshot writes — analytics only, must not block the scan
          const now = new Date();
          void Promise.allSettled(
            pools.map(async (pool) => {
              const dbPoolId = await this.resolveDbPoolId(pool);
              if (!dbPoolId) return;
              const p0 = Math.abs(pool.price0Per1);
              const p1 = Math.abs(pool.price1Per0);
              if (!Number.isFinite(p0) || !Number.isFinite(p1) || p0 > 1e17 || p1 > 1e17) return;
              await this.db.poolSnapshot.create({
                data: {
                  poolId: dbPoolId,
                  price0Per1: p0,
                  price1Per0: p1,
                  liquidityUsd: Math.min(pool.liquidityUsd, 1e15),
                  sqrtPriceX96: pool.sqrtPriceX96 ? String(pool.sqrtPriceX96) : null,
                  tick: pool.tick ?? null,
                  timestamp: now,
                },
              }).catch(() => {});
            })
          );
        } catch (err) {
          console.warn(`Adapter ${adapter.venueId} refresh failed:`, err);
        }
      })
    );
  }

  private findCrossVenuePairs(
    _tokens: Address[]
  ): Array<{ buyPool: NormalizedPool; sellPool: NormalizedPool }> {
    const pairs: Array<{ buyPool: NormalizedPool; sellPool: NormalizedPool }> = [];

    const pools = Array.from(this.poolCache.values())
      .filter((p) => p.liquidityUsd >= MIN_DEAD_POOL_LP_USD);

    const byPair = new Map<string, NormalizedPool[]>();
    for (const pool of pools) {
      const key = [pool.token0, pool.token1]
        .map((t) => t.toLowerCase())
        .sort()
        .join("-");
      const existing = byPair.get(key) ?? [];
      existing.push(pool);
      byPair.set(key, existing);
    }

    for (const [, pairPools] of byPair) {
      if (pairPools.length < 2) continue;
      for (let i = 0; i < pairPools.length; i++) {
        for (let j = 0; j < pairPools.length; j++) {
          if (i === j) continue;
          const buyPool = pairPools[i]!;
          const sellPool = pairPools[j]!;
          if (buyPool.price0Per1 < sellPool.price0Per1 * 0.999) {
            pairs.push({ buyPool, sellPool });
          }
        }
      }
    }

    return pairs;
  }

  private _debugCounter = 0;

  private async scoreCandidate(
    buyPool: NormalizedPool,
    sellPool: NormalizedPool,
    gasPriceWei: bigint,
    cfg: PoolIndexerConfig
  ): Promise<OpportunityCandidate | null> {
    try {
      const shouldLog = this._debugCounter++ % 50 === 0;
      const label = `${buyPool.venueName}→${sellPool.venueName} ${buyPool.token0Symbol}/${buyPool.token1Symbol}`;

      const priceDiff = Math.abs(sellPool.price0Per1 - buyPool.price0Per1);
      if (buyPool.price0Per1 <= 0 || !Number.isFinite(buyPool.price0Per1)) return null;
      const spreadFraction = priceDiff / buyPool.price0Per1;
      if (!Number.isFinite(spreadFraction) || spreadFraction > 10) return null;

      const dynamicTradeSize = computeOptimalTradeSize(
        buyPool,
        sellPool,
        cfg.tradeSizeUsd,
        spreadFraction
      );

      if (dynamicTradeSize < MIN_TRADE_SIZE_USD) {
        if (shouldLog) console.log(JSON.stringify({ level: 20, msg: "SCORE_REJECT", label, reason: "tradeSize<min", tradeSize: dynamicTradeSize }));
        return null;
      }

      const tradeSizeUsd = dynamicTradeSize;
      const grossSpreadUsd = spreadFraction * tradeSizeUsd;

      if (grossSpreadUsd <= 0) return null;

      const buyImpact = estimatePriceImpact(tradeSizeUsd, buyPool);
      const sellImpact = estimatePriceImpact(tradeSizeUsd, sellPool);
      const totalImpactFraction = buyImpact + sellImpact;
      const priceImpactUsd = totalImpactFraction * tradeSizeUsd;

      if (priceImpactUsd > grossSpreadUsd * MAX_PRICE_IMPACT_VS_SPREAD) {
        if (shouldLog) console.log(JSON.stringify({ level: 20, msg: "SCORE_REJECT", label, reason: "priceImpact", impactUsd: +priceImpactUsd.toFixed(4), spreadUsd: +grossSpreadUsd.toFixed(4), spreadBps: +(spreadFraction * 10000).toFixed(1), tradeSize: +tradeSizeUsd.toFixed(2) }));
        return null;
      }

      const gasUnits = 500_000n;
      const gasFailureUsd = (Number(gasUnits * gasPriceWei) / 1e18) * cfg.ethPriceUsd;

      const profitBreakdown = computeProfitBreakdown({
        grossSpreadUsd,
        gasUnits,
        gasPriceWei,
        ethPriceUsd: cfg.ethPriceUsd,
        buyFeeBps: buyPool.feeBps,
        sellFeeBps: sellPool.feeBps,
        tradeSizeUsd,
        slippageBufferFactor: cfg.riskConfig.slippageBufferFactor,
        failureBufferFactor: cfg.riskConfig.failureBufferFactor,
        failureGasEstimateUsd: gasFailureUsd,
        priceImpactUsd,
      });

      if (profitBreakdown.netProfitUsd < -1) {
        return null;
      }

      const tokenIn = buyPool.token0;
      const tokenOut = buyPool.token1;

      const STABLES = ["USDC", "USDC.e", "USDT", "DAI", "BUSD"];
      const isToken1Stable = STABLES.includes(buyPool.token1Symbol);
      const token0PriceUsd = isToken1Stable
        ? buyPool.price0Per1
        : (buyPool.token0Symbol === "WAVAX" || buyPool.token0Symbol === "AVAX")
          ? cfg.ethPriceUsd
          : buyPool.price0Per1 > 0 ? buyPool.price0Per1 : 1;
      const token0Amount = tradeSizeUsd / Math.max(token0PriceUsd, 0.000001);
      const amountInRaw = BigInt(Math.floor(token0Amount * 10 ** buyPool.token0Decimals));
      const amountIn = amountInRaw.toString();

      let buyQuoteAmountOut = "0";
      let sellQuoteAmountOut = "0";
      let step0AmountOut = "0";
      let step1AmountIn = "0";
      let step1AmountOut = "0";
      let quotesSucceeded = false;

      const buyAdapter = this.adapterByVenue.get(buyPool.venueId);
      const sellAdapter = this.adapterByVenue.get(sellPool.venueId);

      if (buyAdapter && sellAdapter) {
        try {
          const buyQuote = await buyAdapter.getQuote({
            poolId: buyPool.poolId,
            tokenIn,
            tokenOut,
            amountIn,
            slippageBps: 50,
          });
          buyQuoteAmountOut = buyQuote.amountOut;
          step0AmountOut = buyQuote.amountOut;
          step1AmountIn = buyQuote.amountOut;

          const sellQuote = await sellAdapter.getQuote({
            poolId: sellPool.poolId,
            tokenIn: tokenOut,
            tokenOut: tokenIn,
            amountIn: buyQuote.amountOut,
            slippageBps: 50,
          });
          sellQuoteAmountOut = sellQuote.amountOut;
          step1AmountOut = sellQuote.amountOut;
          quotesSucceeded = true;

          const inputTokens = Number(amountInRaw) / 10 ** buyPool.token0Decimals;
          const outputTokens = Number(BigInt(sellQuote.amountOut)) / 10 ** buyPool.token0Decimals;
          const actualGrossUsd = (outputTokens - inputTokens) *
            (tradeSizeUsd / inputTokens);

          if (actualGrossUsd <= profitBreakdown.gasEstimateUsd) return null;
        } catch {
          // Quote failed — use price-based estimate
        }
      }

      // DexScreener liquidity data for this pool pair
      const dexBuyLiq = this.getDexScreenerLiquidity(buyPool.poolId);
      const dexSellLiq = this.getDexScreenerLiquidity(sellPool.poolId);
      const dexVolume = Math.max(
        this.getDexScreenerVolume(buyPool.poolId),
        this.getDexScreenerVolume(sellPool.poolId)
      );

      // Pool age
      const now = Date.now();
      const buyTs = buyPool.lastUpdated instanceof Date
        ? buyPool.lastUpdated.getTime()
        : typeof buyPool.lastUpdated === "number"
          ? buyPool.lastUpdated
          : new Date(buyPool.lastUpdated as any).getTime();
      const poolAgeSecs = (now - buyTs) / 1000;

      const confidenceScore = computeConfidenceScore({
        grossSpreadUsd,
        gasEstimateUsd: profitBreakdown.gasEstimateUsd,
        buyPoolLiqUsd: dexBuyLiq > 0 ? dexBuyLiq : buyPool.liquidityUsd,
        sellPoolLiqUsd: dexSellLiq > 0 ? dexSellLiq : sellPool.liquidityUsd,
        volume24h: dexVolume,
        priceImpactFraction: totalImpactFraction,
        spreadFraction,
        poolAgeSecs,
        quotesSucceeded,
      });

      const priceImpactBps = Math.round(totalImpactFraction * 10_000);

      const fingerprint = buildOpportunityFingerprint(
        tokenIn,
        tokenOut,
        buyPool.venueId,
        sellPool.venueId,
        tradeSizeUsd
      );

      const routes: RouteStep[] = [
        {
          stepIndex: 0,
          poolId: buyPool.poolId,
          venueId: buyPool.venueId,
          venueName: buyPool.venueName,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut: step0AmountOut,
          feeBps: buyPool.feeBps,
        },
        {
          stepIndex: 1,
          poolId: sellPool.poolId,
          venueId: sellPool.venueId,
          venueName: sellPool.venueName,
          tokenIn: tokenOut,
          tokenOut: tokenIn,
          amountIn: step1AmountIn,
          amountOut: step1AmountOut,
          feeBps: sellPool.feeBps,
        },
      ];

      return {
        id: `${fingerprint.slice(0, 16)}-${Date.now()}`,
        fingerprint,
        tokenIn,
        tokenOut,
        tokenInSymbol: buyPool.token0Symbol,
        tokenOutSymbol: buyPool.token1Symbol,
        tradeSizeUsd,
        buyPool,
        sellPool,
        buyQuoteAmountOut,
        sellQuoteAmountOut,
        profitBreakdown,
        routes,
        confidenceScore,
        priceImpactBps,
        dexScreenerLiquidity: { buy: dexBuyLiq, sell: dexSellLiq },
      };
    } catch {
      return null;
    }
  }

  private async resolveDbPoolId(pool: NormalizedPool): Promise<string | null> {
    const cacheKey = pool.poolId.toLowerCase();
    if (this.dbPoolIdCache.has(cacheKey)) return this.dbPoolIdCache.get(cacheKey)!;

    const existing = await this.db.pool.findFirst({
      where: { poolAddress: { equals: pool.poolId, mode: "insensitive" } },
    });
    if (existing) {
      this.dbPoolIdCache.set(cacheKey, existing.id);
      return existing.id;
    }

    const id = await this.autoRegisterPool(pool);
    this.dbPoolIdCache.set(cacheKey, id);
    return id;
  }

  private async autoRegisterPool(pool: NormalizedPool): Promise<string | null> {
    try {
      const [token0, token1] = await Promise.all([
        this.resolveOrCreateToken(pool.token0, pool.token0Symbol, pool.token0Decimals, pool.chainId),
        this.resolveOrCreateToken(pool.token1, pool.token1Symbol, pool.token1Decimals, pool.chainId),
      ]);
      if (!token0 || !token1) return null;

      const venue = await this.db.venue.findFirst({ where: { id: pool.venueId } });
      if (!venue) return null;

      const created = await this.db.pool.upsert({
        where: {
          venueId_token0Id_token1Id_feeBps: {
            venueId: venue.id,
            token0Id: token0.id,
            token1Id: token1.id,
            feeBps: pool.feeBps,
          },
        },
        update: { poolAddress: pool.poolId, isActive: true },
        create: {
          venueId: venue.id,
          token0Id: token0.id,
          token1Id: token1.id,
          poolAddress: pool.poolId,
          feeBps: pool.feeBps,
          isActive: true,
        },
      });
      return created.id;
    } catch {
      return null;
    }
  }

  private async resolveOrCreateToken(
    address: Address,
    symbol: string,
    decimals: number,
    chainId: number,
  ): Promise<{ id: string } | null> {
    try {
      const existing = await this.db.token.findFirst({
        where: { chainId, address: { equals: address, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing) return existing;

      return await this.db.token.create({
        data: {
          chainId,
          address,
          symbol: symbol || "???",
          name: symbol || "Unknown",
          decimals,
          flags: [],
          isEnabled: true,
        },
        select: { id: true },
      });
    } catch {
      return null;
    }
  }
}
