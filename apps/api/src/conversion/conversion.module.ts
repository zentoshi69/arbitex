import {
  Controller,
  Get,
  Module,
  Injectable,
  UseGuards,
  Query,
} from "@nestjs/common";
import { prisma } from "@arbitex/db";
import { EXTENDED_REGIME_CONFIGS } from "@arbitex/risk-engine";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.module.js";

@Injectable()
export class ConversionService {
  async getLatestDecision() {
    const row = await prisma.configOverride.findUnique({
      where: { key: "conversion_latest_decision" },
    });
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return null;
    }
  }

  async getDecisionHistory(limit = 50) {
    const logs = await prisma.auditLog.findMany({
      where: { action: { startsWith: "CONVERSION_" } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        action: true,
        diff: true,
        createdAt: true,
      },
    });
    return logs;
  }

  getExtendedRegimeConfigs() {
    return EXTENDED_REGIME_CONFIGS;
  }

  async getLatestExplanation() {
    const row = await prisma.configOverride.findUnique({
      where: { key: "conversion_latest_explanation" },
    });
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return null;
    }
  }

  async getLatestSignals() {
    const row = await prisma.configOverride.findUnique({
      where: { key: "market_signals_latest" },
    });
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return null;
    }
  }

  async getDashboard() {
    const [latest, history, explanation, signals] = await Promise.all([
      this.getLatestDecision(),
      this.getDecisionHistory(20),
      this.getLatestExplanation(),
      this.getLatestSignals(),
    ]);

    return {
      latestDecision: latest,
      recentDecisions: history,
      extendedRegimeConfigs: EXTENDED_REGIME_CONFIGS,
      explanation,
      signals,
    };
  }
}

@Controller("conversion")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConversionController {
  constructor(private readonly svc: ConversionService) {}

  @Get()
  dashboard() {
    return this.svc.getDashboard();
  }

  @Get("latest")
  latest() {
    return this.svc.getLatestDecision();
  }

  @Get("history")
  history(@Query("limit") limit?: string) {
    return this.svc.getDecisionHistory(limit ? parseInt(limit, 10) : 50);
  }

  @Get("regime-configs")
  regimeConfigs() {
    return this.svc.getExtendedRegimeConfigs();
  }

  @Get("explanation")
  explanation() {
    return this.svc.getLatestExplanation();
  }

  @Get("signals")
  signals() {
    return this.svc.getLatestSignals();
  }
}

@Module({
  controllers: [ConversionController],
  providers: [ConversionService],
  exports: [ConversionService],
})
export class ConversionModule {}
