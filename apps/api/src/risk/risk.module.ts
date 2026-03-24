import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from "@nestjs/common";
import { Module, Injectable } from "@nestjs/common";
import { IsString, IsNumber, IsPositive, IsOptional, IsBoolean } from "class-validator";
import { prisma } from "@arbitex/db";
import { RiskConfigSchema } from "@arbitex/shared-types";
import type { RiskConfig } from "@arbitex/shared-types";
import { RiskEngine } from "@arbitex/risk-engine";
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from "../auth/auth.module.js";
import type { JwtPayload } from "../auth/auth.module.js";
import RedisModule, { Redis as RedisClient } from "ioredis";
import { config } from "@arbitex/config";

const RedisCtor: new (...args: any[]) => RedisClient =
  ((RedisModule as any).default ?? (RedisModule as any)) as any;

// ── DTOs ──────────────────────────────────────────────────────────────────────
class UpdateRiskConfigDto {
  @IsOptional() @IsNumber() @IsPositive() baseTradeSizeUsd?: number;
  @IsOptional() @IsNumber() @IsPositive() maxTradeSizeUsd?: number;
  @IsOptional() @IsNumber() @IsPositive() minNetProfitUsd?: number;
  @IsOptional() @IsNumber() @IsPositive() maxGasGwei?: number;
  @IsOptional() @IsNumber() @IsPositive() minPoolLiquidityUsd?: number;
  @IsOptional() @IsNumber() @IsPositive() maxFailedTxPerHour?: number;
  @IsOptional() @IsNumber() @IsPositive() maxSlippageBps?: number;
  @IsOptional() @IsNumber() @IsPositive() maxTokenExposureUsd?: number;
  @IsOptional() @IsNumber() @IsPositive() tokenCooldownSeconds?: number;
  @IsOptional() @IsNumber() failureBufferFactor?: number;
  @IsOptional() @IsNumber() slippageBufferFactor?: number;
}

class KillSwitchDto {
  @IsBoolean() active!: boolean;
  @IsOptional() @IsString() reason?: string;
}

// ── Service ───────────────────────────────────────────────────────────────────
@Injectable()
export class RiskService {
  private readonly redis: RedisClient;
  private readonly riskEngine: RiskEngine;

  constructor() {
    this.redis = new RedisCtor(config.REDIS_URL);
    // RiskConfig loaded from DB overrides or defaults
    this.riskEngine = new RiskEngine(
      this.redis,
      prisma,
      RiskConfigSchema.parse({
        baseTradeSizeUsd: config.DEFAULT_MAX_TRADE_SIZE_USD,
        maxTradeSizeUsd: config.DEFAULT_MAX_TRADE_SIZE_USD,
        minNetProfitUsd: config.DEFAULT_MIN_NET_PROFIT_USD,
        maxGasGwei: config.DEFAULT_MAX_GAS_GWEI,
        minPoolLiquidityUsd: config.DEFAULT_MIN_POOL_LIQUIDITY_USD,
      })
    );
  }

  async getConfig(): Promise<RiskConfig> {
    const overrides = await prisma.configOverride.findMany();
    const base = RiskConfigSchema.parse({
      baseTradeSizeUsd: config.DEFAULT_MAX_TRADE_SIZE_USD,
      maxTradeSizeUsd: config.DEFAULT_MAX_TRADE_SIZE_USD,
      minNetProfitUsd: config.DEFAULT_MIN_NET_PROFIT_USD,
      maxGasGwei: config.DEFAULT_MAX_GAS_GWEI,
      minPoolLiquidityUsd: config.DEFAULT_MIN_POOL_LIQUIDITY_USD,
    });
    const overrideMap = Object.fromEntries(
      overrides.map((o) => [o.key, JSON.parse(o.value)])
    );
    return RiskConfigSchema.parse({ ...base, ...overrideMap });
  }

  async updateConfig(
    updates: Partial<RiskConfig>,
    actor: string,
    ipAddress?: string
  ): Promise<RiskConfig> {
    const current = await this.getConfig();

    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      await prisma.configOverride.upsert({
        where: { key },
        create: { key, value: JSON.stringify(value), updatedBy: actor },
        update: { value: JSON.stringify(value), updatedBy: actor },
      });
    }

    await prisma.auditLog.create({
      data: {
        action: "RISK_CONFIG_UPDATED",
        actor,
        entityType: "risk_config",
        entityId: "global",
        diff: { before: current, after: { ...current, ...updates } },
        ipAddress: ipAddress ?? null,
      },
    });

    return this.getConfig();
  }

  async getKillSwitches() {
    return this.riskEngine.getKillSwitchStates();
  }

  async setKillSwitch(
    key: string,
    active: boolean,
    actor: string,
    reason?: string
  ) {
    if (active) {
      await this.riskEngine.activateKillSwitch(key, actor, reason ?? "Manual activation");
    } else {
      await this.riskEngine.deactivateKillSwitch(key, actor);
    }
    return { key, active };
  }

  async getRecentRiskEvents(limit = 50) {
    return prisma.riskEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { token: { select: { symbol: true, address: true } } },
    });
  }
}

// ── Controller ────────────────────────────────────────────────────────────────
@Controller("risk")
@UseGuards(JwtAuthGuard, RolesGuard)
export class RiskController {
  constructor(private readonly svc: RiskService) {}

  @Get("config")
  getConfig() {
    return this.svc.getConfig();
  }

  @Patch("config")
  @Roles("ADMIN")
  updateConfig(
    @Body() dto: UpdateRiskConfigDto,
    @CurrentUser() user: JwtPayload,
    @Request() req: any
  ) {
    return this.svc.updateConfig(dto as any, user.sub, req.ip);
  }

  @Get("kill-switches")
  getKillSwitches() {
    return this.svc.getKillSwitches();
  }

  @Post("kill-switches/:key")
  @Roles("ADMIN")
  setKillSwitch(
    @Param("key") key: string,
    @Body() dto: KillSwitchDto,
    @CurrentUser() user: JwtPayload
  ) {
    return this.svc.setKillSwitch(key, dto.active, user.sub, dto.reason);
  }

  @Get("events")
  getRiskEvents() {
    return this.svc.getRecentRiskEvents();
  }
}

// ── Module ────────────────────────────────────────────────────────────────────
@Module({
  controllers: [RiskController],
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
