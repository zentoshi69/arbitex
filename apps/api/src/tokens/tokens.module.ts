import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from "@nestjs/common";
import { Module, Injectable } from "@nestjs/common";
import { IsArray, IsString, IsBoolean, IsOptional } from "class-validator";
import { prisma } from "@arbitex/db";
import { paginatedResponse } from "@arbitex/shared-types";
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from "../auth/auth.module.js";
import type { JwtPayload } from "../auth/auth.module.js";

// ── DTOs ──────────────────────────────────────────────────────────────────────
class UpdateTokenFlagsDto {
  @IsArray()
  @IsString({ each: true })
  flags!: string[];
}

class UpdateVenueDto {
  @IsBoolean()
  isEnabled!: boolean;
}

// ── Tokens ────────────────────────────────────────────────────────────────────
@Injectable()
export class TokensService {
  async list(params: { page: number; limit: number; search?: string }) {
    const where: any = params.search
      ? {
          OR: [
            { symbol: { contains: params.search, mode: "insensitive" } },
            { name: { contains: params.search, mode: "insensitive" } },
            { address: { contains: params.search, mode: "insensitive" } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.token.findMany({
        where,
        orderBy: { symbol: "asc" },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.token.count({ where }),
    ]);

    return paginatedResponse(items, total, params.page, params.limit);
  }

  async updateFlags(
    id: string,
    flags: string[],
    actor: string,
    ipAddress?: string
  ) {
    const current = await prisma.token.findUniqueOrThrow({ where: { id } });

    const updated = await prisma.token.update({
      where: { id },
      data: { flags, updatedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        action: "TOKEN_FLAGS_UPDATED",
        actor,
        entityType: "token",
        entityId: id,
        diff: { before: { flags: current.flags }, after: { flags } },
        ipAddress,
      },
    });

    return updated;
  }
}

@Controller("tokens")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TokensController {
  constructor(private readonly svc: TokensService) {}

  @Get()
  list(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query("search") search?: string
  ) {
    return this.svc.list({ page, limit, search });
  }

  @Patch(":id/flags")
  @Roles("ADMIN")
  updateFlags(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateTokenFlagsDto,
    @CurrentUser() user: JwtPayload,
    @Query("ip") ip?: string
  ) {
    return this.svc.updateFlags(id, dto.flags, user.sub, ip);
  }
}

// ── Venues ────────────────────────────────────────────────────────────────────
@Injectable()
export class VenuesService {
  async list() {
    return prisma.venue.findMany({
      orderBy: { name: "asc" },
      include: { chain: { select: { name: true, chainId: true } } },
    });
  }

  async update(
    id: string,
    data: { isEnabled: boolean },
    actor: string,
    ipAddress?: string
  ) {
    const current = await prisma.venue.findUniqueOrThrow({ where: { id } });
    const updated = await prisma.venue.update({ where: { id }, data });

    await prisma.auditLog.create({
      data: {
        action: data.isEnabled ? "VENUE_ENABLED" : "VENUE_DISABLED",
        actor,
        entityType: "venue",
        entityId: id,
        diff: {
          before: { isEnabled: current.isEnabled },
          after: { isEnabled: data.isEnabled },
        },
        ipAddress,
      },
    });

    return updated;
  }
}

@Controller("venues")
@UseGuards(JwtAuthGuard, RolesGuard)
export class VenuesController {
  constructor(private readonly svc: VenuesService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Patch(":id")
  @Roles("ADMIN")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateVenueDto,
    @CurrentUser() user: JwtPayload
  ) {
    return this.svc.update(id, dto, user.sub);
  }
}

// ── Modules ───────────────────────────────────────────────────────────────────
@Module({
  controllers: [TokensController],
  providers: [TokensService],
})
export class TokensModule {}

@Module({
  controllers: [VenuesController],
  providers: [VenuesService],
})
export class VenuesModule {}
