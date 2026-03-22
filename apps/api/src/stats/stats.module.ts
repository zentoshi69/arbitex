import { Controller, Get, UseGuards, Module, Injectable } from "@nestjs/common";
import { prisma } from "@arbitex/db";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.module.js";

@Injectable()
export class StatsService {
  async getVolume24h() {
    const since = new Date(Date.now() - 24 * 3600_000);
    const [tradeCount, notionals] = await Promise.all([
      prisma.execution.count({
        where: { state: "LANDED", confirmedAt: { gte: since } },
      }),
      prisma.execution.findMany({
        where: { state: "LANDED", confirmedAt: { gte: since } },
        select: {
          opportunity: { select: { tradeSizeUsd: true } },
        },
      }),
    ]);
    const volume24hUsd = notionals.reduce(
      (s, e) => s + Number(e.opportunity?.tradeSizeUsd ?? 0),
      0
    );
    return {
      volume24hUsd: Math.round(volume24hUsd * 100) / 100,
      tradeCount,
    };
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
