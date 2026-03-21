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
import { config, getRpcConfig } from "@arbitex/config";

const isHexAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v);

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const ERC20_ABI = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

const V2_FACTORY_ABI = [
  {
    type: "function",
    name: "getPair",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "address" }],
  },
] as const;

const V3_FACTORY_ABI = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }],
    outputs: [{ type: "address" }],
  },
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

class DiscoverPoolDto {
  @IsString()
  venueId!: string;

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
    rpcUrl: getRpcConfig(config.CHAIN_ID).rpcUrl,
    chainId: config.CHAIN_ID,
  });

  async list(params: { page: number; limit: number; tokenId?: string }) {
    const where: any = {};
    if (params.tokenId) {
      where.OR = [{ token0Id: params.tokenId }, { token1Id: params.tokenId }];
    }
    const [items, total] = await Promise.all([
      prisma.pool.findMany({
        where,
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
      prisma.pool.count({ where }),
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

    let tokenResolved: any = token;
    let tokenSource: "db" | "chain" | "unknown" = token ? "db" : "unknown";
    if (!token) {
      tokenResolved = await this.readTokenMetadata(addr);
      if (tokenResolved) tokenSource = "chain";
    }

    const kind = pool ? "pool" : tokenResolved ? "token" : "unknown";
    return { kind, address: addr, token: tokenResolved ? { source: tokenSource, data: tokenResolved } : null, pool, pools };
  }

  async discoverPool(dto: DiscoverPoolDto) {
    const { venueId, token0Address, token1Address, feeBps } = dto;

    if (!isHexAddress(token0Address) || !isHexAddress(token1Address)) {
      throw new BadRequestException("Invalid token address");
    }

    const venue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) throw new BadRequestException("Unknown venueId");
    if (!venue.factoryAddress) throw new BadRequestException("Venue has no factory address");

    const factory = venue.factoryAddress as `0x${string}`;
    const t0 = token0Address as `0x${string}`;
    const t1 = token1Address as `0x${string}`;
    const isV3 = venue.protocol.includes("v3");

    let poolAddress: string | null = null;

    try {
      if (isV3) {
        const feeUnits = feeBps * 100; // bps → V3 fee units (30 bps = 3000)
        const result = await this.client.readContract({
          address: factory,
          abi: V3_FACTORY_ABI,
          functionName: "getPool",
          args: [t0, t1, feeUnits],
        });
        poolAddress = result as string;
      } else {
        const result = await this.client.readContract({
          address: factory,
          abi: V2_FACTORY_ABI,
          functionName: "getPair",
          args: [t0, t1],
        });
        poolAddress = result as string;
      }
    } catch (err) {
      return { found: false, poolAddress: null, error: `Factory query failed: ${err}` };
    }

    if (!poolAddress || poolAddress === ZERO_ADDRESS) {
      return { found: false, poolAddress: null, error: "Pool does not exist on this venue for the given tokens/fee" };
    }

    // Also resolve token metadata for convenience
    const [token0Meta, token1Meta] = await Promise.all([
      this.resolveTokenMeta(token0Address),
      this.resolveTokenMeta(token1Address),
    ]);

    return {
      found: true,
      poolAddress,
      venue: { id: venue.id, name: venue.name, protocol: venue.protocol },
      token0: token0Meta,
      token1: token1Meta,
      feeBps,
    };
  }

  private async readTokenMetadata(address: string) {
    const addr = address as `0x${string}`;
    try {
      const [name, symbol, decimals] = await Promise.all([
        this.client.readContract({ address: addr, abi: ERC20_ABI, functionName: "name" }),
        this.client.readContract({ address: addr, abi: ERC20_ABI, functionName: "symbol" }),
        this.client.readContract({ address: addr, abi: ERC20_ABI, functionName: "decimals" }),
      ]);
      if (name && symbol && decimals !== null) {
        return { chainId: config.CHAIN_ID, address, name, symbol, decimals: Number(decimals) };
      }
    } catch {
      // not an ERC20 or unreachable
    }
    return null;
  }

  private async resolveTokenMeta(address: string) {
    const existing = await prisma.token.findFirst({
      where: { chainId: config.CHAIN_ID, address: { equals: address, mode: "insensitive" } },
      select: { symbol: true, name: true, decimals: true, address: true },
    });
    if (existing) return existing;
    return this.readTokenMetadata(address);
  }

  private async upsertToken(address: string) {
    const addr = address.trim();
    const existing = await prisma.token.findFirst({
      where: { chainId: config.CHAIN_ID, address: { equals: addr, mode: "insensitive" } },
    });
    if (existing) return existing;

    const meta = await this.readTokenMetadata(addr);
    if (!meta) throw new BadRequestException(`Cannot read ERC20 metadata for ${addr} — is it a valid token on chain ${config.CHAIN_ID}?`);

    return prisma.token.create({
      data: {
        chainId: config.CHAIN_ID,
        address: addr,
        name: meta.name,
        symbol: meta.symbol,
        decimals: meta.decimals,
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
    @Query("limit", new DefaultValuePipe(30), ParseIntPipe) limit: number,
    @Query("tokenId") tokenId?: string
  ) {
    return this.svc.list({ page, limit, ...(tokenId ? { tokenId } : {}) });
  }

  @Get("resolve")
  resolve(@Query("address") address?: string) {
    if (!address) throw new BadRequestException("Missing address");
    return this.svc.resolveAddress(address);
  }

  @Post("discover")
  @Roles("ADMIN")
  discover(@Body() dto: DiscoverPoolDto) {
    return this.svc.discoverPool(dto);
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
