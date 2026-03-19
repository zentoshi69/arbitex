import {
  Controller,
  Get,
  Post,
  Patch,
  BadRequestException,
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
import { createChainClient } from "@arbitex/chain";
import { config } from "@arbitex/config";

const isHexAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v);

const ERC20_ABI = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

// ── DTOs ──────────────────────────────────────────────────────────────────────
class UpdateTokenFlagsDto {
  @IsArray()
  @IsString({ each: true })
  flags!: string[];
}

class UpdateTokenDto {
  @IsBoolean()
  isEnabled!: boolean;
}

class UpdateVenueDto {
  @IsBoolean()
  isEnabled!: boolean;
}

class CreateVenueDto {
  @IsString()
  name!: string;

  @IsString()
  protocol!: string;

  @IsString()
  routerAddress!: string;

  @IsOptional()
  @IsString()
  factoryAddress?: string;

  @IsOptional()
  @IsString()
  chainId?: string;
}

// ── Tokens ────────────────────────────────────────────────────────────────────
@Injectable()
export class TokensService {
  private readonly client = createChainClient({
    rpcUrl: config.ETHEREUM_RPC_URL ?? "",
    chainId: config.CHAIN_ID,
  });

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

  async resolveByAddress(address: string, chainId?: number) {
    const addr = address.trim();
    if (!isHexAddress(addr)) {
      throw new BadRequestException("Invalid contract address");
    }

    const existing = await prisma.token.findFirst({
      where: {
        chainId: chainId ?? config.CHAIN_ID,
        address: { equals: addr, mode: "insensitive" },
      },
    });

    if (existing) {
      return { source: "db", token: existing };
    }

    // Not in DB — attempt on-chain ERC20 metadata lookup
    const tokenAddress = addr as `0x${string}`;
    const [name, symbol, decimals] = await Promise.all([
      this.client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "name" }).catch(() => null),
      this.client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "symbol" }).catch(() => null),
      this.client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "decimals" }).catch(() => null),
    ]);

    if (!name || !symbol || decimals === null) {
      return { source: "unknown", token: null };
    }

    return {
      source: "chain",
      token: {
        chainId: chainId ?? config.CHAIN_ID,
        address: addr,
        name,
        symbol,
        decimals: Number(decimals),
      },
    };
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
        ipAddress: ipAddress ?? null,
      },
    });

    return updated;
  }

  async toggleEnabled(
    id: string,
    isEnabled: boolean,
    actor: string,
    ipAddress?: string
  ) {
    const current = await prisma.token.findUniqueOrThrow({ where: { id } });

    const updated = await prisma.token.update({
      where: { id },
      data: { isEnabled, updatedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        action: "TOKEN_FLAGS_UPDATED",
        actor,
        entityType: "token",
        entityId: id,
        diff: {
          before: { isEnabled: current.isEnabled },
          after: { isEnabled },
        },
        ipAddress: ipAddress ?? null,
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
    return this.svc.list({ page, limit, ...(search ? { search } : {}) });
  }

  @Get("resolve")
  resolve(@Query("address") address?: string, @Query("chainId") chainId?: string) {
    if (!address) throw new BadRequestException("Missing address");
    const parsedChainId = chainId ? Number(chainId) : undefined;
    return this.svc.resolveByAddress(address, parsedChainId);
  }

  @Patch(":id")
  @Roles("ADMIN")
  toggle(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateTokenDto,
    @CurrentUser() user: JwtPayload
  ) {
    return this.svc.toggleEnabled(id, dto.isEnabled, user.sub);
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
        ipAddress: ipAddress ?? null,
      },
    });

    return updated;
  }

  async create(
    data: {
      chainId: number;
      name: string;
      protocol: string;
      routerAddress: string;
      factoryAddress?: string | null;
    },
    actor: string
  ) {
    const created = await prisma.venue.create({
      data: {
        chainId: data.chainId,
        name: data.name,
        protocol: data.protocol,
        routerAddress: data.routerAddress,
        factoryAddress: data.factoryAddress ?? null,
        isEnabled: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "VENUE_CREATED",
        actor,
        entityType: "venue",
        entityId: created.id,
        diff: data,
        ipAddress: null,
      },
    });

    return created;
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

  @Post()
  @Roles("SUPER_ADMIN")
  create(@Body() dto: CreateVenueDto, @CurrentUser() user: JwtPayload) {
    const chainId = dto.chainId ? Number(dto.chainId) : 1;
    return this.svc.create(
      {
        chainId,
        name: dto.name,
        protocol: dto.protocol,
        routerAddress: dto.routerAddress,
        factoryAddress: dto.factoryAddress ?? null,
      },
      user.sub
    );
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
