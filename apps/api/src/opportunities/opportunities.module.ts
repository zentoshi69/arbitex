import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Module, Injectable } from "@nestjs/common";
import { prisma } from "@arbitex/db";
import { paginatedResponse } from "@arbitex/shared-types";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.module.js";

// ── Service ───────────────────────────────────────────────────────────────────
@Injectable()
export class OpportunitiesService {
  async list(params: {
    page: number;
    limit: number;
    state?: string;
    minProfit?: number;
    tokenId?: string;
  }) {
    const where: any = {};
    if (params.state) where.state = params.state;
    if (params.minProfit !== undefined) {
      where.netProfitUsd = { gte: params.minProfit };
    }
    if (params.tokenId) where.tokenId = params.tokenId;

    const [items, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        orderBy: { detectedAt: "desc" },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        select: {
          id: true,
          state: true,
          tokenInSymbol: true,
          tokenOutSymbol: true,
          tokenInAddress: true,
          tokenOutAddress: true,
          tradeSizeUsd: true,
          grossSpreadUsd: true,
          netProfitUsd: true,
          netProfitBps: true,
          buyVenueName: true,
          sellVenueName: true,
          detectedAt: true,
          expiresAt: true,
        },
      }),
      prisma.opportunity.count({ where }),
    ]);

    return paginatedResponse(
      items.map((o) => ({
        ...o,
        tradeSizeUsd: Number(o.tradeSizeUsd),
        grossSpreadUsd: Number(o.grossSpreadUsd),
        netProfitUsd: Number(o.netProfitUsd),
        netProfitBps: Number(o.netProfitBps),
      })),
      total,
      params.page,
      params.limit
    );
  }

  async getById(id: string) {
    const opp = await prisma.opportunity.findUniqueOrThrow({
      where: { id },
      include: {
        routes: { orderBy: { stepIndex: "asc" } },
        execution: true,
      },
    });
    return {
      ...opp,
      tradeSizeUsd: Number(opp.tradeSizeUsd),
      grossSpreadUsd: Number(opp.grossSpreadUsd),
      netProfitUsd: Number(opp.netProfitUsd),
      netProfitBps: Number(opp.netProfitBps),
    };
  }

  async triggerDryRunSimulation(id: string) {
    // Enqueue dry-run job — returns job id
    const opp = await prisma.opportunity.findUniqueOrThrow({ where: { id } });
    // In real impl: enqueue BullMQ simulate job
    return { jobId: `dryrun-${id}`, status: "queued", opportunityId: id };
  }
}

// ── Controller ────────────────────────────────────────────────────────────────
@Controller("opportunities")
@UseGuards(JwtAuthGuard, RolesGuard)
export class OpportunitiesController {
  constructor(private readonly svc: OpportunitiesService) {}

  @Get()
  list(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(25), ParseIntPipe) limit: number,
    @Query("state") state?: string,
    @Query("minProfit") minProfitStr?: string,
    @Query("tokenId") tokenId?: string
  ) {
    const minProfit = minProfitStr ? parseFloat(minProfitStr) : undefined;
    return this.svc.list({
      page,
      limit,
      ...(state ? { state } : {}),
      ...(minProfit !== undefined ? { minProfit } : {}),
      ...(tokenId ? { tokenId } : {}),
    });
  }

  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string) {
    return this.svc.getById(id);
  }

  @Post(":id/simulate")
  @HttpCode(HttpStatus.ACCEPTED)
  simulate(@Param("id", ParseUUIDPipe) id: string) {
    return this.svc.triggerDryRunSimulation(id);
  }
}

// ── Module ────────────────────────────────────────────────────────────────────
@Module({
  controllers: [OpportunitiesController],
  providers: [OpportunitiesService],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}
