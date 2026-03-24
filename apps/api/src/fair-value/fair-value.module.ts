import {
  Controller,
  Get,
  Query,
  Module,
  Injectable,
  Logger,
  UseGuards,
} from "@nestjs/common";
import { prisma } from "@arbitex/db";
import { config } from "@arbitex/config";
import { createChainClient } from "@arbitex/chain";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.module.js";
import type { FairValueEstimate, FairValueSource } from "@arbitex/shared-types";

const log = new Logger("FairValueService");

const KNOWN_TOKENS: Record<string, { address: string; decimals: number; cgId?: string }> = {
  AVAX:  { address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", decimals: 18, cgId: "avalanche-2" },
  WRP:   { address: "0xeF282B38D1ceAB52134CA2cc653a569435744687", decimals: 18 },
  USDC:  { address: "0xA7D7079b0FEAD91F3e65f86E8915Cb59c1a4C664", decimals: 6, cgId: "usd-coin" },
  USDT:  { address: "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", decimals: 6, cgId: "tether" },
};

const UNISWAPV2_PAIR_ABI = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }] },
] as const;

const UNISWAPV2_FACTORY_ABI = [
  { type: "function", name: "getPair", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "address" }] },
] as const;

const ERC20_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

function raceTimeout<T>(p: Promise<T>, ms: number, label = "op"): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${label} timeout (${ms}ms)`)), ms)),
  ]);
}

@Injectable()
export class FairValueService {
  private cache = new Map<string, { estimate: FairValueEstimate; ts: number }>();
  private readonly CACHE_TTL = 30_000;

  async getEstimate(symbol: string): Promise<FairValueEstimate> {
    const key = symbol.toUpperCase();
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL) return cached.estimate;

    const sources = await this.fetchSources(key);
    const validSources = sources.filter((s) => s.priceUsd !== null && !s.stale);

    let compositeUsd = 0;
    let totalWeight = 0;
    for (const s of validSources) {
      compositeUsd += s.priceUsd! * s.weight;
      totalWeight += s.weight;
    }
    compositeUsd = totalWeight > 0 ? compositeUsd / totalWeight : 0;

    let maxDivergencePct = 0;
    for (const s of validSources) {
      if (compositeUsd > 0 && s.priceUsd !== null) {
        const div = Math.abs(s.priceUsd - compositeUsd) / compositeUsd * 100;
        if (div > maxDivergencePct) maxDivergencePct = div;
      }
    }

    const estimate: FairValueEstimate = {
      token: key,
      compositeUsd,
      sources,
      divergenceAlertActive: maxDivergencePct > 5,
      maxDivergencePct: Math.round(maxDivergencePct * 100) / 100,
      updatedAt: Date.now(),
    };

    this.cache.set(key, { estimate, ts: Date.now() });
    return estimate;
  }

  async getAllEstimates(): Promise<FairValueEstimate[]> {
    const emptyEstimate = (token: string): FairValueEstimate => ({
      token,
      compositeUsd: 0,
      sources: [],
      divergenceAlertActive: false,
      maxDivergencePct: 0,
      updatedAt: Date.now(),
    });

    return Promise.all(
      Object.keys(KNOWN_TOKENS).map(async (sym) => {
        try {
          return await raceTimeout(this.getEstimate(sym), 6_000, `estimate:${sym}`);
        } catch (e) {
          log.warn(`Fair value ${sym} timeout/error: ${e}`);
          const cached = this.cache.get(sym);
          return cached?.estimate ?? emptyEstimate(sym);
        }
      })
    );
  }

  private async fetchSources(symbol: string): Promise<FairValueSource[]> {
    const [cgSource, dexSource, dbSource] = await Promise.all([
      this.fetchCoinGecko(symbol).catch(() => null),
      this.fetchDexScreener(symbol).catch(() => null),
      this.fetchDbSnapshot(symbol).catch(() => null),
    ]);

    const sources: FairValueSource[] = [];
    if (cgSource) sources.push(cgSource);
    if (dexSource) sources.push(dexSource);
    if (dbSource) sources.push(dbSource);
    return sources;
  }

  private async fetchDexScreener(symbol: string): Promise<FairValueSource | null> {
    const info = KNOWN_TOKENS[symbol];
    if (!info || info.cgId) return null;

    try {
      const result = await raceTimeout(
        (async () => {
          const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${info.address}`);
          if (!res.ok) return null;
          const data = (await res.json()) as any;
          const pairs = data?.pairs;
          if (!Array.isArray(pairs) || pairs.length === 0) return null;

          const best = pairs.sort((a: any, b: any) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
          const price = parseFloat(best.priceUsd);
          if (!Number.isFinite(price) || price <= 0) return null;

          return {
            name: "DexScreener",
            method: "api" as const,
            priceUsd: price,
            weight: 1.5,
            confidence: 0.85,
            stale: false,
            lastUpdated: Date.now(),
          } satisfies FairValueSource;
        })(),
        4_000,
        `dexscreener:${symbol}`,
      );
      return result;
    } catch {
      return null;
    }
  }

  private cgPriceCache: Record<string, number> = {};
  private cgCacheAt = 0;

  private async fetchCoinGecko(symbol: string): Promise<FairValueSource | null> {
    const info = KNOWN_TOKENS[symbol];
    if (!info?.cgId) return null;

    if (Date.now() - this.cgCacheAt > 20_000) {
      try {
        const allIds = Object.values(KNOWN_TOKENS)
          .filter((t) => t.cgId)
          .map((t) => t.cgId!)
          .join(",");
        const res = await raceTimeout(
          fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${allIds}&vs_currencies=usd`),
          4_000,
          "coingecko-batch",
        );
        if (res.ok) {
          const data = (await res.json()) as Record<string, any>;
          for (const [cgId, vals] of Object.entries(data)) {
            if (typeof vals?.usd === "number") this.cgPriceCache[cgId] = vals.usd;
          }
          this.cgCacheAt = Date.now();
        }
      } catch {
        /* CoinGecko unavailable, use stale cache */
      }
    }

    const price = this.cgPriceCache[info.cgId];
    if (typeof price !== "number" || price <= 0) return null;

    return {
      name: "CoinGecko",
      method: "api",
      priceUsd: price,
      weight: 2,
      confidence: 0.95,
      stale: Date.now() - this.cgCacheAt > 60_000,
      lastUpdated: this.cgCacheAt,
    };
  }

  private async fetchOnChainPrices(symbol: string): Promise<FairValueSource[]> {
    const info = KNOWN_TOKENS[symbol];
    if (!info) return [];
    if (!config.AVALANCHE_RPC_URL) return [];

    const client = createChainClient({ rpcUrl: config.AVALANCHE_RPC_URL, chainId: 43114 });
    const sources: FairValueSource[] = [];

    const venues = await prisma.venue.findMany({
      where: { chainId: 43114, isEnabled: true },
      select: { id: true, name: true, factoryAddress: true },
    });

    const usdcAddr = KNOWN_TOKENS.USDC!.address as `0x${string}`;

    const venueResults = await Promise.allSettled(
      venues
        .filter((v) => v.factoryAddress)
        .map(async (venue) => {
          const pair = (await raceTimeout(client.readContract({
            address: venue.factoryAddress as `0x${string}`,
            abi: UNISWAPV2_FACTORY_ABI,
            functionName: "getPair",
            args: [info.address as `0x${string}`, usdcAddr],
          }), 3_000, `getPair:${venue.name}`)) as string;

          if (!pair || pair.toLowerCase() === ZERO_ADDR) return null;

          const [token0, reserves] = await raceTimeout(Promise.all([
            client.readContract({ address: pair as `0x${string}`, abi: UNISWAPV2_PAIR_ABI, functionName: "token0" }),
            client.readContract({ address: pair as `0x${string}`, abi: UNISWAPV2_PAIR_ABI, functionName: "getReserves" }),
          ]), 3_000, `reserves:${venue.name}`);

          const [r0, r1] = reserves as readonly [bigint, bigint, number];
          if (r0 === 0n || r1 === 0n) return null;

          const isToken0 = (token0 as string).toLowerCase() === info.address.toLowerCase();
          const tokenReserve = isToken0 ? r0 : r1;
          const usdcReserve = isToken0 ? r1 : r0;

          const price = Number(usdcReserve) / 10 ** 6 / (Number(tokenReserve) / 10 ** info.decimals);
          if (!Number.isFinite(price) || price <= 0) return null;

          return {
            name: `${venue.name} (on-chain)`,
            method: "dex-reserve" as const,
            priceUsd: price,
            weight: 1,
            confidence: 0.8,
            stale: false,
            lastUpdated: Date.now(),
          } satisfies FairValueSource;
        })
    );

    for (const r of venueResults) {
      if (r.status === "fulfilled" && r.value) sources.push(r.value);
    }

    return sources;
  }

  private async fetchDbSnapshot(symbol: string): Promise<FairValueSource | null> {
    const info = KNOWN_TOKENS[symbol];
    if (!info) return null;

    return raceTimeout(
      (async () => {
        const token = await prisma.token.findFirst({
          where: { address: { equals: info.address, mode: "insensitive" }, chainId: 43114 },
          select: { id: true },
        });
        if (!token) return null;

        const usdcTokens = await prisma.token.findMany({
          where: { chainId: 43114, symbol: { contains: "USDC", mode: "insensitive" } },
          select: { id: true },
        });
        const usdcIds = usdcTokens.map((t) => t.id);
        if (usdcIds.length === 0) return null;

        const pool = await prisma.pool.findFirst({
          where: {
            isActive: true,
            OR: [
              { token0Id: token.id, token1Id: { in: usdcIds } },
              { token1Id: token.id, token0Id: { in: usdcIds } },
            ],
          },
          include: {
            snapshots: { orderBy: { timestamp: "desc" }, take: 1 },
            token0: { select: { address: true } },
            token1: { select: { address: true } },
          },
        });

        if (!pool) return null;
        const snap = pool.snapshots[0];
        if (!snap) return null;

        const age = Date.now() - snap.timestamp.getTime();
        if (age > 300_000) return null;

        const isToken0 = pool.token0.address.toLowerCase() === info.address.toLowerCase();
        const price = isToken0 ? Number(snap.price0Per1) : Number(snap.price1Per0);
        if (!Number.isFinite(price) || price <= 0) return null;

        return {
          name: "DB Snapshot",
          method: "pool-snapshot" as const,
          priceUsd: price,
          weight: 0.5,
          confidence: 0.6,
          stale: age > 60_000,
          lastUpdated: snap.timestamp.getTime(),
        } satisfies FairValueSource;
      })(),
      3_000,
      `dbSnapshot:${symbol}`,
    ).catch(() => null);
  }
}

@Controller("fair-value")
@UseGuards(JwtAuthGuard, RolesGuard)
export class FairValueController {
  constructor(private readonly svc: FairValueService) {}

  @Get()
  async getAll() {
    return this.svc.getAllEstimates();
  }

  @Get("token")
  async getToken(@Query("symbol") symbol: string) {
    if (!symbol) return { error: "symbol query param required" };
    return this.svc.getEstimate(symbol);
  }
}

@Module({
  controllers: [FairValueController],
  providers: [FairValueService],
  exports: [FairValueService],
})
export class FairValueModule {}
