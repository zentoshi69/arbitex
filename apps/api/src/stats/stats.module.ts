import { Controller, Get, UseGuards, Module, Injectable } from "@nestjs/common";
import { prisma } from "@arbitex/db";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.module.js";

@Injectable()
export class StatsService {
  private volumeCache: { data: any; ts: number } | null = null;
  private readonly VOLUME_CACHE_TTL = 30_000;

  async getVolume24h() {
    if (this.volumeCache && Date.now() - this.volumeCache.ts < this.VOLUME_CACHE_TTL) {
      return this.volumeCache.data;
    }

    const since = new Date(Date.now() - 24 * 3600_000);
    const rows = await prisma.$queryRaw<Array<{ trade_count: bigint; volume_usd: number }>>`
      SELECT COUNT(*)::bigint AS trade_count,
             COALESCE(SUM(o.trade_size_usd), 0) AS volume_usd
      FROM executions e
      JOIN opportunities o ON o.id = e.opportunity_id
      WHERE e.state = 'LANDED' AND e.confirmed_at >= ${since}
    `;
    const row = rows[0] ?? { trade_count: 0n, volume_usd: 0 };
    const data = {
      volume24hUsd: Math.round(Number(row.volume_usd) * 100) / 100,
      tradeCount: Number(row.trade_count),
    };
    this.volumeCache = { data, ts: Date.now() };
    return data;
  }

  async getFeesTotal() {
    const result = await prisma.execution.aggregate({
      _sum: { pnlUsd: true, gasCostUsd: true },
      _count: { id: true },
      where: { state: "LANDED" },
    });
    const netPnl = Number(result._sum.pnlUsd ?? 0);
    const gasCost = Number(result._sum.gasCostUsd ?? 0);
    return {
      /** Net realized profit already includes gas effect in pnl_usd settlement. */
      feesTotalUsd: Math.max(0, netPnl),
      grossPnlUsd: netPnl + gasCost,
      gasCostUsd: gasCost,
      tradeCount: result._count.id,
    };
  }
}

@Controller("stats")
@UseGuards(JwtAuthGuard, RolesGuard)
export class StatsController {
  constructor(private readonly svc: StatsService) {}

  @Get("volume-24h")
  volume24h() {
    return this.svc.getVolume24h();
  }

  @Get("fees-total")
  feesTotal() {
    return this.svc.getFeesTotal();
  }
}

@Module({
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
