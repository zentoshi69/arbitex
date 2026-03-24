import {
  Controller,
  Get,
  Param,
  Module,
  Injectable,
  UseGuards,
} from "@nestjs/common";
import { prisma } from "@arbitex/db";
import { config } from "@arbitex/config";
import { RegimeClassifier, REGIME_CONFIGS } from "@arbitex/risk-engine";
import type { RegimeSnapshot } from "@arbitex/risk-engine";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.module.js";

const BASE_PAIR_SYMBOLS = ["WAVAX", "USDC", "USDC.e", "USDT"];

@Injectable()
export class RegimeService {
  private readonly classifier = new RegimeClassifier(prisma);

  private async loadTrackedTokens(): Promise<string[]> {
    const [tracked, basePairs] = await Promise.all([
      prisma.token.findMany({
        where: { chainId: config.CHAIN_ID, isTracked: true },
        select: { address: true },
      }),
      prisma.token.findMany({
        where: { chainId: config.CHAIN_ID, isEnabled: true, symbol: { in: BASE_PAIR_SYMBOLS } },
        select: { address: true },
      }),
    ]);
    return [...new Set([...tracked, ...basePairs].map((t) => t.address))];
  }

  async classify(): Promise<RegimeSnapshot> {
    const tokens = await this.loadTrackedTokens();
    this.classifier.setTrackedTokens(tokens);
    return this.classifier.classify();
  }

  getConfigs() {
    return REGIME_CONFIGS;
  }

  async liquidityMaps() {
    const maps = await prisma.liquidityMap.findMany({
      include: {
        pool: {
          include: {
            venue: { select: { name: true, protocol: true } },
            token0: { select: { symbol: true } },
            token1: { select: { symbol: true } },
          },
        },
      },
      orderBy: { refreshedAt: "desc" },
    });

    return maps.map((m) => {
      const data = m.data as any;
      const isV3 = m.poolType === "v3";
      const positions = data?.positions;

      // V3 positions stored as Record<tokenId, entry>; V2 as array
      const positionCount = isV3
        ? Object.keys(positions ?? {}).length
        : Array.isArray(positions)
          ? positions.length
          : 0;

      return {
        poolId: m.poolId,
        poolAddress: m.poolAddress,
        pair: `${m.pool.token0.symbol}/${m.pool.token1.symbol}`,
        venue: m.pool.venue.name,
        protocol: m.pool.venue.protocol,
        poolType: m.poolType,
        scanFromBlock: Number(m.scanFromBlock),
        scanToBlock: Number(m.scanToBlock),
        eventCount: m.eventCount,
        builtAt: m.builtAt,
        refreshedAt: m.refreshedAt,
        positionCount,
        tickCount: isV3 ? Object.keys(data?.ticks ?? {}).length : null,
        nftManagerUsed: data?.nftManagerUsed ?? false,
      };
    });
  }

  async liquidityMapByPool(poolId: string) {
    const map = await prisma.liquidityMap.findUnique({
      where: { poolId },
      include: {
        pool: {
          include: {
            venue: { select: { name: true, protocol: true } },
            token0: { select: { symbol: true, decimals: true } },
            token1: { select: { symbol: true, decimals: true } },
          },
        },
      },
    });
    if (!map) return null;
    return {
      ...map,
      scanFromBlock: Number(map.scanFromBlock),
      scanToBlock: Number(map.scanToBlock),
    };
  }

  private venueCache: { data: any; ts: number } | null = null;

  async venueBreakdown() {
    if (this.venueCache && Date.now() - this.venueCache.ts < 15_000) {
      return this.venueCache.data;
    }

    const h1 = new Date(Date.now() - 3600_000);

    const [venues, pools, recentOpps] = await Promise.all([
      prisma.venue.findMany({
        where: { isEnabled: true },
        select: { id: true, name: true, protocol: true, chainId: true },
      }),
      prisma.pool.findMany({
        where: { isActive: true },
        include: {
          venue: { select: { id: true, name: true } },
          token0: { select: { symbol: true } },
          token1: { select: { symbol: true } },
          snapshots: { orderBy: { timestamp: "desc" }, take: 1, select: { liquidityUsd: true, timestamp: true } },
        },
      }),
      prisma.opportunity.count({ where: { detectedAt: { gte: h1 } } }).then(async (total) => {
        if (total > 5000) {
          return prisma.opportunity.findMany({
            where: { detectedAt: { gte: h1 } },
            select: { buyVenueId: true, sellVenueId: true, netProfitBps: true },
            take: 2000,
            orderBy: { detectedAt: "desc" },
          });
        }
        return prisma.opportunity.findMany({
          where: { detectedAt: { gte: h1 } },
          select: { buyVenueId: true, sellVenueId: true, netProfitBps: true },
        });
      }),
    ]);

    const poolsByVenue = new Map<string, typeof pools>();
    for (const p of pools) {
      const vid = p.venue.id;
      if (!poolsByVenue.has(vid)) poolsByVenue.set(vid, []);
      poolsByVenue.get(vid)!.push(p);
    }

    const oppsByVenue = new Map<string, { count: number; totalBps: number }>();
    for (const o of recentOpps) {
      for (const vid of [o.buyVenueId, o.sellVenueId]) {
        const entry = oppsByVenue.get(vid) ?? { count: 0, totalBps: 0 };
        entry.count++;
        entry.totalBps += Number(o.netProfitBps);
        oppsByVenue.set(vid, entry);
      }
    }

    const data = venues.map((v) => {
      const venuePools = poolsByVenue.get(v.id) ?? [];
      const totalLiquidity = venuePools.reduce(
        (sum, p) => sum + Number(p.snapshots[0]?.liquidityUsd ?? 0), 0,
      );
      const freshPools = venuePools.filter((p) => {
        const snap = p.snapshots[0];
        return snap && Date.now() - new Date(snap.timestamp).getTime() < 60_000;
      }).length;

      const opp = oppsByVenue.get(v.id) ?? { count: 0, totalBps: 0 };

      return {
        venueId: v.id,
        venueName: v.name,
        protocol: v.protocol,
        chainId: v.chainId,
        poolCount: venuePools.length,
        activePools: freshPools,
        totalLiquidityUsd: Math.round(totalLiquidity * 100) / 100,
        opportunityCount1h: opp.count,
        avgSpreadBps1h: opp.count > 0 ? Math.round(opp.totalBps / opp.count * 100) / 100 : 0,
        pools: venuePools.slice(0, 20).map((p) => ({
          pair: `${p.token0.symbol}/${p.token1.symbol}`,
          liquidityUsd: Number(p.snapshots[0]?.liquidityUsd ?? 0),
          lastUpdate: p.snapshots[0]?.timestamp ?? null,
        })),
      };
    });

    this.venueCache = { data, ts: Date.now() };
    return data;
  }
}

@Controller("regime")
@UseGuards(JwtAuthGuard, RolesGuard)
export class RegimeController {
  constructor(private readonly svc: RegimeService) {}

  @Get()
  async current() {
    return this.svc.classify();
  }

  @Get("configs")
  configs() {
    return this.svc.getConfigs();
  }

  @Get("venues")
  venueBreakdown() {
    return this.svc.venueBreakdown();
  }

  @Get("liquidity-maps")
  liquidityMaps() {
    return this.svc.liquidityMaps();
  }

  @Get("liquidity-maps/:poolId")
  liquidityMap(@Param("poolId") poolId: string) {
    return this.svc.liquidityMapByPool(poolId);
  }
}

@Module({
  controllers: [RegimeController],
  providers: [RegimeService],
  exports: [RegimeService],
})
export class RegimeModule {}
