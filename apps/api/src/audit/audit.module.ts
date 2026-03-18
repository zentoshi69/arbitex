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
export class AuditService {
  async list(params: {
    page: number;
    limit: number;
    action?: string;
    actor?: string;
    entityType?: string;
    entityId?: string;
  }) {
    const where: any = {};
    if (params.action) where.action = params.action;
    if (params.actor) where.actor = params.actor;
    if (params.entityType) where.entityType = params.entityType;
    if (params.entityId) where.entityId = params.entityId;

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return paginatedResponse(items, total, params.page, params.limit);
  }

  async getActions(): Promise<string[]> {
    const results = await prisma.auditLog.findMany({
      select: { action: true },
      distinct: ["action"],
      orderBy: { action: "asc" },
    });
    return results.map((r) => r.action);
  }
}

@Controller("audit")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly svc: AuditService) {}

  @Get()
  list(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query("action") action?: string,
    @Query("actor") actor?: string,
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string
  ) {
    return this.svc.list({
      page,
      limit,
      ...(action ? { action } : {}),
      ...(actor ? { actor } : {}),
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
    });
  }

  @Get("actions")
  getActions() {
    return this.svc.getActions();
  }
}

@Module({
  controllers: [AuditController],
  providers: [AuditService],
})
export class AuditModule {}
