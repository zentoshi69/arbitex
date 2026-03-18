import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
} from "@nestjs/common";
import { Module, Injectable } from "@nestjs/common";
import { IsInt, IsString, Min, Max } from "class-validator";
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

class CreatePoolDto {
  @IsString()
  venueId!: string;

  @IsString()
  poolAddress!: string;

  @IsString()
  token0Address!: string;

  @IsString()
  token1Address!: string;

  @IsInt()
  @Min(0)
  @Max(10_000)
  feeBps!: number;
}

@Injectable()
export class PoolsService {
  private readonly client = createChainClient({
    rpcUrl: config.ETHEREUM_RPC_URL,
    chainId: config.CHAIN_ID,
  });

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

  async resolveAddress(address: string) {
    const addr = address.trim();
    if (!isHexAddress(addr)) {
      throw new BadRequestException("Invalid contract address");
    }

    const token = await prisma.token.findFirst({
      where: { chainId: config.CHAIN_ID, address: { equals: addr, mode: "insensitive" } },
    });

    const pool = await prisma.pool.findFirst({
      where: { poolAddress: { equals: addr, mode: "insensitive" } },
      include: {
        venue: { select: { id: true, name: true, protocol: true } },
        token0: { select: { id: true, symbol: true, address: true, decimals: true } },
        token1: { select: { id: true, symbol: true, address: true, decimals: true } },
      },
    });

    let pools: any[] = [];
    if (token) {
      pools = await prisma.pool.findMany({
        where: {
          OR: [
            { token0: { address: { equals: addr, mode: "insensitive" } } },
            { token1: { address: { equals: addr, mode: "insensitive" } } },
          ],
        },
        take: 50,
        orderBy: { createdAt: "desc" },
        include: {
          venue: { select: { id: true, name: true, protocol: true } },
          token0: { select: { symbol: true, address: true, decimals: true } },
          token1: { select: { symbol: true, address: true, decimals: true } },
        },
      });
    }

    // If token not in DB, try chain metadata so UI can display something useful.
    let tokenResolved: any = token;
    let tokenSource: "db" | "chain" | "unknown" = token ? "db" : "unknown";
    if (!token) {
      const tokenAddress = addr as `0x${string}`;
      const [name, symbol, decimals] = await Promise.all([
        this.client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "name" }).catch(() => null),
        this.client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "symbol" }).catch(() => null),
        this.client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "decimals" }).catch(() => null),
      ]);
      if (name && symbol && decimals !== null) {
        tokenResolved = {
          chainId: config.CHAIN_ID,
          address: addr,
          name,
          symbol,
          decimals: Number(decimals),
        };
        tokenSource = "chain";
      }
    }

    const kind = pool ? "pool" : tokenResolved ? "token" : "unknown";
    return { kind, address: addr, token: tokenResolved ? { source: tokenSource, data: tokenResolved } : null, pool, pools };
  }

  private async upsertToken(address: string) {
    const addr = address.trim();
    const existing = await prisma.token.findFirst({
      where: { chainId: config.CHAIN_ID, address: { equals: addr, mode: "insensitive" } },
    });
    if (existing) return existing;

    const tokenAddress = addr as `0x${string}`;
    const [name, symbol, decimals] = await Promise.all([
      this.client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "name" }),
      this.client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "symbol" }),
      this.client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "decimals" }),
    ]);

    return prisma.token.create({
      data: {
        chainId: config.CHAIN_ID,
        address: addr,
        name,
        symbol,
        decimals: Number(decimals),
      },
    });
  }

  async createPool(dto: CreatePoolDto, actor: string) {
    const poolAddress = dto.poolAddress.trim();
    const token0Address = dto.token0Address.trim();
    const token1Address = dto.token1Address.trim();
    if (![poolAddress, token0Address, token1Address].every(isHexAddress)) {
      throw new BadRequestException("Invalid address in request");
    }

    const venue = await prisma.venue.findUnique({ where: { id: dto.venueId } });
    if (!venue) throw new BadRequestException("Unknown venueId");

    const [token0, token1] = await Promise.all([
      this.upsertToken(token0Address),
      this.upsertToken(token1Address),
    ]);

    const created = await prisma.pool.upsert({
      where: {
        venueId_token0Id_token1Id_feeBps: {
          venueId: venue.id,
          token0Id: token0.id,
          token1Id: token1.id,
          feeBps: dto.feeBps,
        },
      },
      update: {
        poolAddress,
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        venueId: venue.id,
        token0Id: token0.id,
        token1Id: token1.id,
        poolAddress,
        feeBps: dto.feeBps,
        isActive: true,
      },
      include: {
        venue: { select: { id: true, name: true, protocol: true } },
        token0: { select: { symbol: true, address: true, decimals: true } },
        token1: { select: { symbol: true, address: true, decimals: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "POOL_CREATED_OR_UPDATED",
        actor,
        entityType: "pool",
        entityId: created.id,
        diff: { poolAddress, feeBps: dto.feeBps, venueId: venue.id },
      },
    });

    return created;
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

  @Get("resolve")
  resolve(@Query("address") address?: string) {
    if (!address) throw new BadRequestException("Missing address");
    return this.svc.resolveAddress(address);
  }

  @Post()
  @Roles("ADMIN")
  create(@Body() dto: CreatePoolDto, @CurrentUser() user: JwtPayload) {
    return this.svc.createPool(dto, user.sub);
  }
}

@Module({
  controllers: [PoolsController],
  providers: [PoolsService],
})
export class PoolsModule {}
