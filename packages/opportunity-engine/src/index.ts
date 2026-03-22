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
import type { PrismaClient } from "@arbitex/db";
import type { ArbitexPublicClient } from "@arbitex/chain";

export * from "./v3-math.js";
export * from "./v3-simulator.js";
export * from "./lp-band-builder.js";
export * from "./optimal-sizer.js";
export * from "./liquidity-scanner.js";

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
};

export type PoolIndexerConfig = {
  targetTokens: Address[];
  tradeSizeUsd: number;
  ethPriceUsd: number;
  riskConfig: RiskConfig;
};

/**
 * Computes net profitability using the canonical formula:
 *
 * net_profit = gross_spread - gas_cost - venue_fees - slippage_buffer - failure_buffer
 */
export function computeProfitBreakdown(params: {
  grossSpreadUsd: number;
  gasUnits: bigint;
  gasPriceGwei: bigint;
  ethPriceUsd: number;
  buyFeeBps: number;
  sellFeeBps: number;
  tradeSizeUsd: number;
  slippageBufferFactor: number;
  failureBufferFactor: number;
  failureGasEstimateUsd: number;
}): ProfitBreakdown {
  const gasEth =
    Number(params.gasUnits * params.gasPriceGwei) / 1e9;
  const gasEstimateUsd = gasEth * params.ethPriceUsd;

  const venueFeesUsd =
    ((params.buyFeeBps + params.sellFeeBps) / 10_000) * params.tradeSizeUsd;

  const slippageBufferUsd = params.slippageBufferFactor * params.tradeSizeUsd;

  const failureBufferUsd =
    params.failureBufferFactor * params.failureGasEstimateUsd;

  const netProfitUsd =
    params.grossSpreadUsd -
    gasEstimateUsd -
    venueFeesUsd -
    slippageBufferUsd -
    failureBufferUsd;

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

/**
 * Generate a stable fingerprint for deduplication.
 * Same token pair + same venues + same size bucket = same fingerprint (10s window).
 */
export function buildOpportunityFingerprint(
  tokenIn: Address,
  tokenOut: Address,
  buyVenueId: string,
  sellVenueId: string,
  tradeSizeUsd: number
): string {
  const windowBucket = Math.floor(Date.now() / 10_000); // 10s buckets
  const sizeBucket = Math.floor(tradeSizeUsd / 100); // $100 buckets
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

export class OpportunityEngine {
  private poolCache = new Map<string, NormalizedPool>();
  private dbPoolIdCache = new Map<string, string | null>();
  private adapters: IDexAdapter[];
  private adapterByVenue = new Map<string, IDexAdapter>();

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

  /**
   * Refresh all pools from all adapters and return detected candidates.
   */
  async scanForOpportunities(
    cfg: PoolIndexerConfig
  ): Promise<OpportunityCandidate[]> {
    // 1. Refresh pool state from all adapters
    await this.refreshPools(cfg.targetTokens);

    // 2. Load tracked tokens for tagging
    const trackedTokens = await this.db.token.findMany({
      where: { isTracked: true },
      select: { id: true, address: true, symbol: true },
    });
    const trackedByAddr = new Map(
      trackedTokens.map((t) => [t.address.toLowerCase(), { id: t.id, symbol: t.symbol }])
    );

    // 3. Build all cross-venue pairs for same token pair
    const candidates = this.findCrossVenuePairs(cfg.targetTokens);

    // 4. Score each candidate
    const gasPriceWei = await this.client.getGasPrice();
    const gasPriceGwei = gasPriceWei / 1_000_000_000n;

    const scored: OpportunityCandidate[] = [];

    for (const { buyPool, sellPool } of candidates) {
      const candidate = await this.scoreCandidate(
        buyPool,
        sellPool,
        gasPriceGwei,
        cfg
      );
      if (candidate && candidate.profitBreakdown.netProfitUsd >= cfg.riskConfig.minNetProfitUsd) {
        const tracked =
          trackedByAddr.get(candidate.tokenIn.toLowerCase()) ??
          trackedByAddr.get(candidate.tokenOut.toLowerCase());
        if (tracked) {
          candidate.tokenId = tracked.id;
          candidate.tokenSymbol = tracked.symbol;
        }
        scored.push(candidate);
      }
    }

    // Sort by net profit descending
    return scored.sort(
      (a, b) => b.profitBreakdown.netProfitUsd - a.profitBreakdown.netProfitUsd
    );
  }

  async refreshPools(targetTokens: Address[]): Promise<void> {
    await Promise.allSettled(
      this.adapters.map(async (adapter) => {
        try {
          const pools = await adapter.getPools(targetTokens);
          for (const pool of pools) {
            this.poolCache.set(pool.poolId, pool);
          }

          // Persist snapshots to DB
          const now = new Date();
          for (const pool of pools) {
            const dbPoolId = await this.resolveDbPoolId(pool);
            if (!dbPoolId) continue;
            await this.db.poolSnapshot.create({
              data: {
                poolId: dbPoolId,
                price0Per1: pool.price0Per1,
                price1Per0: pool.price1Per0,
                liquidityUsd: pool.liquidityUsd,
                sqrtPriceX96: pool.sqrtPriceX96 ?? null,
                tick: pool.tick ?? null,
                timestamp: now,
              },
            }).catch(() => {}); // non-fatal
          }
        } catch (err) {
          console.warn(`Adapter ${adapter.venueId} refresh failed:`, err);
        }
      })
    );
  }

  private findCrossVenuePairs(
    tokens: Address[]
  ): Array<{ buyPool: NormalizedPool; sellPool: NormalizedPool }> {
    const pairs: Array<{ buyPool: NormalizedPool; sellPool: NormalizedPool }> = [];

    const MIN_POOL_LIQUIDITY = 1_000;
    const pools = Array.from(this.poolCache.values())
      .filter((p) => p.liquidityUsd >= MIN_POOL_LIQUIDITY);

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

    // For each pair that has pools on multiple venues, generate buy/sell combos
    for (const [, pairPools] of byPair) {
      if (pairPools.length < 2) continue;
      for (let i = 0; i < pairPools.length; i++) {
        for (let j = 0; j < pairPools.length; j++) {
          if (i === j) continue;
          const buyPool = pairPools[i]!;
          const sellPool = pairPools[j]!;
          // Only add if price difference exists (buy cheap, sell expensive)
          if (buyPool.price0Per1 < sellPool.price0Per1 * 0.999) {
            pairs.push({ buyPool, sellPool });
          }
        }
      }
    }

    return pairs;
  }

  private async scoreCandidate(
    buyPool: NormalizedPool,
    sellPool: NormalizedPool,
    gasPriceGwei: bigint,
    cfg: PoolIndexerConfig
  ): Promise<OpportunityCandidate | null> {
    try {
      const tradeSizeUsd = cfg.tradeSizeUsd;

      // Gross spread: percentage price difference applied to trade size
      const priceDiff = Math.abs(sellPool.price0Per1 - buyPool.price0Per1);
      if (buyPool.price0Per1 <= 0 || !Number.isFinite(buyPool.price0Per1)) return null;
      const spreadFraction = priceDiff / buyPool.price0Per1;
      if (!Number.isFinite(spreadFraction) || spreadFraction > 10) return null;
      const grossSpreadUsd = spreadFraction * tradeSizeUsd;

      if (grossSpreadUsd <= 0) return null;

      const gasUnits = 500_000n;
      const profitBreakdown = computeProfitBreakdown({
        grossSpreadUsd,
        gasUnits,
        gasPriceGwei,
        ethPriceUsd: cfg.ethPriceUsd,
        buyFeeBps: buyPool.feeBps,
        sellFeeBps: sellPool.feeBps,
        tradeSizeUsd,
        slippageBufferFactor: cfg.riskConfig.slippageBufferFactor,
        failureBufferFactor: cfg.riskConfig.failureBufferFactor,
        failureGasEstimateUsd:
          (Number(gasUnits * gasPriceGwei) / 1e9) * cfg.ethPriceUsd,
      });

      if (profitBreakdown.netProfitUsd < cfg.riskConfig.minNetProfitUsd) {
        return null;
      }

      const tokenIn = buyPool.token0;
      const tokenOut = buyPool.token1;

      // Compute amountIn using ACTUAL token decimals and price
      // price0Per1 = how much token1 per 1 token0
      // To convert USD to token0: we need token0's USD price
      // If token1 is a stablecoin, price0Per1 ≈ token0's USD value
      // Otherwise use ethPriceUsd (native token price) as best guess
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

      // Try to get real quotes from adapters
      let buyQuoteAmountOut = "0";
      let sellQuoteAmountOut = "0";
      let step0AmountOut = "0";
      let step1AmountIn = "0";
      let step1AmountOut = "0";

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

          // Recompute actual profit from quotes
          const inputTokens = Number(amountInRaw) / 10 ** buyPool.token0Decimals;
          const outputTokens = Number(BigInt(sellQuote.amountOut)) / 10 ** buyPool.token0Decimals;
          const actualGrossUsd = (outputTokens - inputTokens) *
            (tradeSizeUsd / inputTokens);

          if (actualGrossUsd <= profitBreakdown.gasEstimateUsd) return null;
        } catch {
          // Quote failed — use price-based estimate (less accurate)
        }
      }

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

    // Auto-register pool discovered on-chain
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
