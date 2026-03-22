import { Controller, Get, UseGuards, Module, Injectable } from "@nestjs/common";
import { prisma } from "@arbitex/db";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.module.js";

@Injectable()
export class StatsService {
  async getVolume24h() {
    const since = new Date(Date.now() - 24 * 3600_000);
    const result = await prisma.execution.aggregate({
      _sum: { pnlUsd: true },
      _count: { id: true },
      where: {
        state: "LANDED",
        confirmedAt: { gte: since },
      },
    });
    const tradeCount = result._count.id;
    const avgSizeUsd = 500;
    return {
      volume24hUsd: tradeCount * avgSizeUsd + Number(result._sum.pnlUsd ?? 0),
      tradeCount,
    };
  }

  async getFeesTotal() {
    const result = await prisma.execution.aggregate({
      _sum: { pnlUsd: true, gasCostUsd: true },
      _count: { id: true },
      where: { state: "LANDED" },
    });
    const grossPnl = Number(result._sum.pnlUsd ?? 0);
    const gasCost = Number(result._sum.gasCostUsd ?? 0);
    return {
      feesTotalUsd: Math.max(0, grossPnl - gasCost),
      grossPnlUsd: grossPnl,
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
