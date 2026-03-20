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
    const gasBreakdown = await this.getGasBreakdown(30);
    return { today, week, month, allTime, successRate, gasBreakdown };
  }

  async getTimeseries(days = 30) {
    const since = new Date(Date.now() - days * 86400_000);
    const rows = await prisma.$queryRaw<
      Array<{ date: Date; pnl: number; trades: number; gas_cost: number }>
    >`
      SELECT
        DATE_TRUNC('day', confirmed_at) AS date,
        SUM(pnl_usd)::float             AS pnl,
        COUNT(*)::int                   AS trades,
        COALESCE(SUM(gas_cost_usd)::float, 0) AS gas_cost
      FROM executions
      WHERE state = 'LANDED'
        AND confirmed_at >= ${since}
      GROUP BY DATE_TRUNC('day', confirmed_at)
      ORDER BY date ASC
    `;

    let cumulative = 0;
    return rows.map((r) => {
      cumulative += r.pnl;
      return { ...r, cumulativePnl: Math.round(cumulative * 100) / 100 };
    });
  }

  async getCumulative() {
    const result = await prisma.execution.aggregate({
      _sum: { pnlUsd: true, gasCostUsd: true },
      _count: { id: true },
      where: { state: "LANDED" },
    });
    return {
      totalPnlUsd: Number(result._sum.pnlUsd ?? 0),
      totalGasCostUsd: Number(result._sum.gasCostUsd ?? 0),
      netAfterGasUsd: Number(result._sum.pnlUsd ?? 0) - Number(result._sum.gasCostUsd ?? 0),
      tradeCount: result._count.id,
    };
  }

  async getByVenue(days = 30) {
    const since = new Date(Date.now() - days * 86400_000);
    const rows = await prisma.$queryRaw<
      Array<{ venue: string; pnl: number; trades: number; gas_cost: number }>
    >`
      SELECT
        o.buy_venue_name AS venue,
        SUM(e.pnl_usd)::float AS pnl,
        COUNT(*)::int AS trades,
        COALESCE(SUM(e.gas_cost_usd)::float, 0) AS gas_cost
      FROM executions e
      JOIN opportunities o ON o.id = e.opportunity_id
      WHERE e.state = 'LANDED'
        AND e.confirmed_at >= ${since}
      GROUP BY o.buy_venue_name
      ORDER BY pnl DESC
    `;
    return rows;
  }

  private async getPnlForPeriod(days: number) {
    const since = new Date(Date.now() - days * 86400_000);
    const result = await prisma.execution.aggregate({
      _sum: { pnlUsd: true, gasCostUsd: true },
      _count: { id: true },
      where: { state: "LANDED", confirmedAt: { gte: since } },
    });
    return {
      pnlUsd: Number(result._sum.pnlUsd ?? 0),
      gasCostUsd: Number(result._sum.gasCostUsd ?? 0),
      tradeCount: result._count.id,
    };
  }

  private async getGasBreakdown(days: number) {
    const since = new Date(Date.now() - days * 86400_000);
    const landed = await prisma.execution.findMany({
      where: { state: "LANDED", confirmedAt: { gte: since } },
      select: { gasUsed: true, gasCostUsd: true },
    });

    const gasCosts = landed
      .map((e) => Number(e.gasCostUsd ?? 0))
      .filter((v) => v > 0);

    return {
      totalGasUsd: gasCosts.reduce((a, b) => a + b, 0),
      avgGasUsd: gasCosts.length > 0
        ? gasCosts.reduce((a, b) => a + b, 0) / gasCosts.length
        : 0,
      maxGasUsd: gasCosts.length > 0 ? Math.max(...gasCosts) : 0,
      tradeCount: gasCosts.length,
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

  @Get("cumulative")
  cumulative() {
    return this.svc.getCumulative();
  }

  @Get("by-venue")
  byVenue(@Query("days", new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.svc.getByVenue(days);
  }
}

@Module({
  controllers: [PnlController],
  providers: [PnlService],
  exports: [PnlService],
})
export class PnlModule {}
