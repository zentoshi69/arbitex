import { Controller, Get } from "@nestjs/common";
import { Module, Injectable } from "@nestjs/common";
import { prisma } from "@arbitex/db";
import { Public } from "../auth/auth.module.js";

@Injectable()
export class MetricsService {
  async getPrometheusMetrics(): Promise<string> {
    const [
      opportunityCount,
      executionStats,
      totalGasSpent,
      totalPnl,
      riskRejections,
    ] = await Promise.all([
      prisma.opportunity.count(),
      prisma.execution.groupBy({
        by: ["state"],
        _count: { id: true },
      }),
      prisma.execution.aggregate({ _sum: { gasCostUsd: true } }),
      prisma.execution.aggregate({
        _sum: { pnlUsd: true },
        where: { state: "LANDED" },
      }),
      prisma.riskEvent.count({
        where: { eventType: { contains: "REJECTED" } },
      }),
    ]);

    const execByState = Object.fromEntries(
      executionStats.map((s) => [s.state, s._count.id])
    );

    const lines = [
      "# HELP arbitex_opportunities_total Total opportunities detected",
      "# TYPE arbitex_opportunities_total counter",
      `arbitex_opportunities_total ${opportunityCount}`,
      "",
      "# HELP arbitex_executions_by_state Execution counts by state",
      "# TYPE arbitex_executions_by_state gauge",
      ...Object.entries(execByState).map(
        ([state, count]) =>
          `arbitex_executions_by_state{state="${state}"} ${count}`
      ),
      "",
      "# HELP arbitex_gas_spent_usd_total Total USD spent on gas",
      "# TYPE arbitex_gas_spent_usd_total counter",
      `arbitex_gas_spent_usd_total ${Number(totalGasSpent._sum.gasCostUsd ?? 0).toFixed(4)}`,
      "",
      "# HELP arbitex_pnl_realized_usd_total Total realized PnL USD",
      "# TYPE arbitex_pnl_realized_usd_total counter",
      `arbitex_pnl_realized_usd_total ${Number(totalPnl._sum.pnlUsd ?? 0).toFixed(4)}`,
      "",
      "# HELP arbitex_risk_rejections_total Total risk engine rejections",
      "# TYPE arbitex_risk_rejections_total counter",
      `arbitex_risk_rejections_total ${riskRejections}`,
      "",
      `# EOF`,
    ];

    return lines.join("\n");
  }
}

@Controller()
export class MetricsController {
  constructor(private readonly svc: MetricsService) {}

  @Get("metrics")
  @Public()
  async metrics() {
    return this.svc.getPrometheusMetrics();
  }
}

@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {}
