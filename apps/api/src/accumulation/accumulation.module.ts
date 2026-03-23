import {
  Controller,
  Get,
  Patch,
  Body,
  Module,
  Injectable,
  UseGuards,
} from "@nestjs/common";
import { prisma } from "@arbitex/db";
import { AccumulationEngine } from "@arbitex/accumulation-engine";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.module.js";

@Injectable()
export class AccumulationService {
  private readonly engine = new AccumulationEngine(prisma);

  async getState() {
    return this.engine.getState();
  }

  async getRouting() {
    return this.engine.getRouting();
  }

  async updateSleeves(body: {
    coreAllocationPct: number;
    tacticalAllocationPct: number;
    arbAllocationPct: number;
  }) {
    return this.engine.updateSleeves(
      body.coreAllocationPct,
      body.tacticalAllocationPct,
      body.arbAllocationPct,
    );
  }

  async getDashboard() {
    const [state, routing] = await Promise.all([
      this.engine.getState(),
      this.engine.getRouting(),
    ]);

    const recentLogs = await prisma.auditLog.findMany({
      where: { action: { startsWith: "WRP_UNIT_" } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        action: true,
        diff: true,
        createdAt: true,
      },
    });

    return { state, routing, recentActivity: recentLogs };
  }
}

@Controller("accumulation")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccumulationController {
  constructor(private readonly svc: AccumulationService) {}

  @Get()
  dashboard() {
    return this.svc.getDashboard();
  }

  @Get("state")
  state() {
    return this.svc.getState();
  }

  @Get("routing")
  routing() {
    return this.svc.getRouting();
  }

  @Patch("sleeves")
  updateSleeves(
    @Body()
    body: {
      coreAllocationPct: number;
      tacticalAllocationPct: number;
      arbAllocationPct: number;
    },
  ) {
    return this.svc.updateSleeves(body);
  }
}

@Module({
  controllers: [AccumulationController],
  providers: [AccumulationService],
  exports: [AccumulationService],
})
export class AccumulationModule {}
