import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  ParseUUIDPipe,
} from "@nestjs/common";
import { Module, Injectable } from "@nestjs/common";
import { prisma } from "@arbitex/db";
import { paginatedResponse } from "@arbitex/shared-types";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.module.js";

// ── Executions ────────────────────────────────────────────────────────────────
@Injectable()
export class ExecutionsService {
  async list(params: { page: number; limit: number; state?: string }) {
    const where: any = {};
    if (params.state) where.state = params.state;

    const [items, total] = await Promise.all([
      prisma.execution.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        include: {
          opportunity: {
            select: {
              tokenInSymbol: true,
              tokenOutSymbol: true,
              buyVenueName: true,
              sellVenueName: true,
              netProfitUsd: true,
            },
          },
        },
      }),
      prisma.execution.count({ where }),
    ]);

    return paginatedResponse(
      items.map((e) => ({
        ...e,
        gasCostUsd: e.gasCostUsd ? Number(e.gasCostUsd) : null,
        pnlUsd: e.pnlUsd ? Number(e.pnlUsd) : null,
      })),
      total,
      params.page,
      params.limit
    );
  }

  async getById(id: string) {
    const exec = await prisma.execution.findUniqueOrThrow({
      where: { id },
      include: {
        opportunity: { include: { routes: true } },
        transactions: { orderBy: { submittedAt: "asc" } },
      },
    });
    return {
      ...exec,
      gasCostUsd: exec.gasCostUsd ? Number(exec.gasCostUsd) : null,
      pnlUsd: exec.pnlUsd ? Number(exec.pnlUsd) : null,
    };
  }
}

@Controller("executions")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExecutionsController {
  constructor(private readonly svc: ExecutionsService) {}

  @Get()
  list(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(25), ParseIntPipe) limit: number,
    @Query("state") state?: string
  ) {
    return this.svc.list({ page, limit, ...(state ? { state } : {}) });
  }

  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string) {
    return this.svc.getById(id);
  }
}

@Module({
  controllers: [ExecutionsController],
  providers: [ExecutionsService],
})
export class ExecutionsModule {}

// ── PnL ───────────────────────────────────────────────────────────────────────
@Injectable()
export class PnlService {
  async getSummary() {
    const [today, week, month, allTime] = await Promise.all([
      this.getPnlForPeriod(1),
      this.getPnlForPeriod(7),
      this.getPnlForPeriod(30),
      this.getPnlForPeriod(36500),
    ]);
    const successRate = await this.getSuccessRate(30);
    return { today, week, month, allTime, successRate };
  }

  async getTimeseries(days = 30) {
    const since = new Date(Date.now() - days * 86400_000);
    const rows = await prisma.$queryRaw<
      Array<{ date: Date; pnl: number; trades: number }>
    >`
      SELECT
        DATE_TRUNC('day', confirmed_at) AS date,
        SUM(pnl_usd)::float             AS pnl,
        COUNT(*)::int                   AS trades
      FROM executions
      WHERE state = 'LANDED'
        AND confirmed_at >= ${since}
      GROUP BY DATE_TRUNC('day', confirmed_at)
      ORDER BY date ASC
    `;
    return rows;
  }

  private async getPnlForPeriod(days: number) {
    const since = new Date(Date.now() - days * 86400_000);
    const result = await prisma.execution.aggregate({
      _sum: { pnlUsd: true },
      _count: { id: true },
      where: { state: "LANDED", confirmedAt: { gte: since } },
    });
    return {
      pnlUsd: Number(result._sum.pnlUsd ?? 0),
      tradeCount: result._count.id,
    };
  }

  private async getSuccessRate(days: number) {
    const since = new Date(Date.now() - days * 86400_000);
    const [landed, failed] = await Promise.all([
      prisma.execution.count({ where: { state: "LANDED", createdAt: { gte: since } } }),
      prisma.execution.count({ where: { state: "FAILED", createdAt: { gte: since } } }),
    ]);
    const total = landed + failed;
    return total === 0 ? 100 : Math.round((landed / total) * 10000) / 100;
  }
}

@Controller("pnl")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PnlController {
  constructor(private readonly svc: PnlService) {}

  @Get("summary")
  summary() {
    return this.svc.getSummary();
  }

  @Get("timeseries")
  timeseries(@Query("days", new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.svc.getTimeseries(days);
  }
}

@Module({
  controllers: [PnlController],
  providers: [PnlService],
})
export class PnlModule {}
