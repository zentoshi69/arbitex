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

  constructor(
    adapters: IDexAdapter[],
    private readonly db: PrismaClient,
    private readonly client: ArbitexPublicClient
  ) {
    this.adapters = adapters;
  }

  updateAdapters(adapters: IDexAdapter[]): void {
    this.adapters = adapters;
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

    const pools = Array.from(this.poolCache.values());

    // Group pools by token pair (normalized order)
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

      const profitBreakdown = computeProfitBreakdown({
        grossSpreadUsd,
        gasUnits: 350_000n, // estimated for 2-leg arb
        gasPriceGwei,
        ethPriceUsd: cfg.ethPriceUsd,
        buyFeeBps: buyPool.feeBps,
        sellFeeBps: sellPool.feeBps,
        tradeSizeUsd,
        slippageBufferFactor: cfg.riskConfig.slippageBufferFactor,
        failureBufferFactor: cfg.riskConfig.failureBufferFactor,
        failureGasEstimateUsd:
          (Number(350_000n * gasPriceGwei) / 1e9) * cfg.ethPriceUsd,
      });

      if (profitBreakdown.netProfitUsd < cfg.riskConfig.minNetProfitUsd) {
        return null;
      }

      const tokenIn = buyPool.token0;
      const tokenOut = buyPool.token1;
      const fingerprint = buildOpportunityFingerprint(
        tokenIn,
        tokenOut,
        buyPool.venueId,
        sellPool.venueId,
        tradeSizeUsd
      );

      // Estimate amountIn in token0 units (simplified)
      const amountIn = BigInt(Math.floor(tradeSizeUsd * 1e6)).toString();

      const routes: RouteStep[] = [
        {
          stepIndex: 0,
          poolId: buyPool.poolId,
          venueId: buyPool.venueId,
          venueName: buyPool.venueName,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut: "0", // filled by simulator
          feeBps: buyPool.feeBps,
        },
        {
          stepIndex: 1,
          poolId: sellPool.poolId,
          venueId: sellPool.venueId,
          venueName: sellPool.venueName,
          tokenIn: tokenOut,
          tokenOut: tokenIn,
          amountIn: "0", // output of step 0
          amountOut: "0",
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
        buyQuoteAmountOut: "0",
        sellQuoteAmountOut: "0",
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
