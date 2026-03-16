import {
  Controller,
  Get,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from "@nestjs/common";
import { Module, Injectable } from "@nestjs/common";
import { prisma } from "@arbitex/db";
import { paginatedResponse } from "@arbitex/shared-types";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.module.js";

@Injectable()
export class PoolsService {
  async list(params: { page: number; limit: number }) {
    const [items, total] = await Promise.all([
      prisma.pool.findMany({
        orderBy: { createdAt: "desc" },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        include: {
          venue: { select: { name: true, protocol: true } },
          token0: { select: { symbol: true, address: true, decimals: true } },
          token1: { select: { symbol: true, address: true, decimals: true } },
          snapshots: {
            orderBy: { timestamp: "desc" },
            take: 1,
            select: {
              price0Per1: true,
              price1Per0: true,
              liquidityUsd: true,
              timestamp: true,
            },
          },
        },
      }),
      prisma.pool.count(),
    ]);

    return paginatedResponse(
      items.map((p) => ({
        ...p,
        snapshots: p.snapshots.map((s) => ({
          ...s,
          price0Per1: Number(s.price0Per1),
          price1Per0: Number(s.price1Per0),
          liquidityUsd: Number(s.liquidityUsd),
        })),
      })),
      total,
      params.page,
      params.limit
    );
  }
}

@Controller("pools")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PoolsController {
  constructor(private readonly svc: PoolsService) {}

  @Get()
  list(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(30), ParseIntPipe) limit: number
  ) {
    return this.svc.list({ page, limit });
  }
}

@Module({
  controllers: [PoolsController],
  providers: [PoolsService],
})
export class PoolsModule {}
