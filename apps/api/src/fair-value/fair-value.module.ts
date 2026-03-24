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
  USDC:  { address: "0xA7D7079b0FEAD91F3e65f86E8915Cb59c1a4C664", decimals: 6 },
  USDT:  { address: "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", decimals: 6 },
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
    return raceTimeout(
      Promise.all(
        Object.keys(KNOWN_TOKENS).map((sym) => this.getEstimate(sym))
      ),
      8_000,
      "getAllEstimates",
    ).catch((e) => {
      log.warn(`getAllEstimates fallback to cache: ${e}`);
      const results: FairValueEstimate[] = [];
      for (const sym of Object.keys(KNOWN_TOKENS)) {
        const cached = this.cache.get(sym);
        if (cached) results.push(cached.estimate);
      }
      return results;
    });
  }

  private async fetchSources(symbol: string): Promise<FairValueSource[]> {
    const sources: FairValueSource[] = [];

    const cgSource = await this.fetchCoinGecko(symbol);
    if (cgSource) sources.push(cgSource);

    const onChainSources = await this.fetchOnChainPrices(symbol);
    sources.push(...onChainSources);

    const dbSource = await this.fetchDbSnapshot(symbol);
    if (dbSource) sources.push(dbSource);

    return sources;
  }

  private async fetchCoinGecko(symbol: string): Promise<FairValueSource | null> {
    const info = KNOWN_TOKENS[symbol];
    if (!info?.cgId) return null;

    try {
      const res = await raceTimeout(fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${info.cgId}&vs_currencies=usd`
      ), 5_000, "coingecko");
      if (!res.ok) return null;
      const data = (await res.json()) as Record<string, any>;
      const price = data[info.cgId]?.usd;
      if (typeof price !== "number" || price <= 0) return null;

      return {
        name: "CoinGecko",
        method: "api",
        priceUsd: price,
        weight: 2,
        confidence: 0.95,
        stale: false,
        lastUpdated: Date.now(),
      };
    } catch {
      return null;
    }
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

    for (const venue of venues) {
      if (!venue.factoryAddress) continue;
      try {
        const pair = (await raceTimeout(client.readContract({
          address: venue.factoryAddress as `0x${string}`,
          abi: UNISWAPV2_FACTORY_ABI,
          functionName: "getPair",
          args: [info.address as `0x${string}`, usdcAddr],
        }), 3_000, `getPair:${venue.name}`)) as string;

        if (!pair || pair.toLowerCase() === ZERO_ADDR) continue;

        const [token0, reserves] = await raceTimeout(Promise.all([
          client.readContract({ address: pair as `0x${string}`, abi: UNISWAPV2_PAIR_ABI, functionName: "token0" }),
          client.readContract({ address: pair as `0x${string}`, abi: UNISWAPV2_PAIR_ABI, functionName: "getReserves" }),
        ]), 3_000, `reserves:${venue.name}`);

        const [r0, r1] = reserves as readonly [bigint, bigint, number];
        if (r0 === 0n || r1 === 0n) continue;

        const isToken0 = (token0 as string).toLowerCase() === info.address.toLowerCase();
        const tokenReserve = isToken0 ? r0 : r1;
        const usdcReserve = isToken0 ? r1 : r0;

        const price = Number(usdcReserve) / 10 ** 6 / (Number(tokenReserve) / 10 ** info.decimals);
        if (!Number.isFinite(price) || price <= 0) continue;

        sources.push({
          name: `${venue.name} (on-chain)`,
          method: "dex-reserve",
          priceUsd: price,
          weight: 1,
          confidence: 0.8,
          stale: false,
          lastUpdated: Date.now(),
        });
      } catch (e) {
        log.debug(`On-chain ${symbol} from ${venue.name} failed: ${e}`);
      }
    }

    return sources;
  }

  private async fetchDbSnapshot(symbol: string): Promise<FairValueSource | null> {
    const info = KNOWN_TOKENS[symbol];
    if (!info) return null;

    try {
      const token = await prisma.token.findFirst({
        where: { address: { equals: info.address, mode: "insensitive" }, chainId: 43114 },
      });
      if (!token) return null;

      const pools = await prisma.pool.findMany({
        where: {
          OR: [{ token0Id: token.id }, { token1Id: token.id }],
          isActive: true,
        },
        include: {
          snapshots: { orderBy: { timestamp: "desc" }, take: 1 },
          token0: true,
          token1: true,
        },
      });

      for (const pool of pools) {
        const snap = pool.snapshots[0];
        if (!snap) continue;

        const age = Date.now() - snap.timestamp.getTime();
        if (age > 300_000) continue;

        const isToken0 = pool.token0.address.toLowerCase() === info.address.toLowerCase();
        const otherToken = isToken0 ? pool.token1 : pool.token0;
        const isUsdcPair = otherToken.symbol.toUpperCase().includes("USDC");
        if (!isUsdcPair) continue;

        const price = isToken0 ? Number(snap.price0Per1) : Number(snap.price1Per0);
        if (!Number.isFinite(price) || price <= 0) continue;

        return {
          name: "DB Snapshot",
          method: "pool-snapshot",
          priceUsd: price,
          weight: 0.5,
          confidence: 0.6,
          stale: age > 60_000,
          lastUpdated: snap.timestamp.getTime(),
        };
      }
    } catch (e) {
      log.debug(`DB snapshot for ${symbol} failed: ${e}`);
    }

    return null;
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
