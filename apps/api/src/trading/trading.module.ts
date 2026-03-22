import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { Module, Injectable } from "@nestjs/common";
import { IsString, IsNotEmpty } from "class-validator";
import { prisma } from "@arbitex/db";
import { RiskConfigSchema } from "@arbitex/shared-types";
import { RiskEngine } from "@arbitex/risk-engine";
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from "../auth/auth.module.js";
import type { JwtPayload } from "../auth/auth.module.js";
import RedisModule, { Redis as RedisClient } from "ioredis";
import { config, getRpcConfig } from "@arbitex/config";
import { createChainClient, deriveAddressFromPrivateKey } from "@arbitex/chain";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const RedisCtor: new (...args: any[]) => RedisClient =
  ((RedisModule as any).default ?? (RedisModule as any)) as any;

const ENCRYPTION_ALGO = "aes-256-gcm";

function encryptValue(plaintext: string): string {
  const keyBuf = Buffer.alloc(32);
  Buffer.from(config.JWT_SECRET, "utf-8").copy(keyBuf);
  const iv = randomBytes(16);
  const cipher = createCipheriv(ENCRYPTION_ALGO, keyBuf, iv);
  const encrypted = cipher.update(plaintext, "utf-8", "hex") + cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return JSON.stringify({ iv: iv.toString("hex"), tag, data: encrypted });
}

function decryptValue(encrypted: string): string {
  const { iv, tag, data } = JSON.parse(encrypted);
  const keyBuf = Buffer.alloc(32);
  Buffer.from(config.JWT_SECRET, "utf-8").copy(keyBuf);
  const decipher = createDecipheriv(ENCRYPTION_ALGO, keyBuf, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return decipher.update(data, "hex", "utf-8") + decipher.final("utf-8");
}

class SetWalletDto {
  @IsString() @IsNotEmpty() privateKey!: string;
}

@Injectable()
export class TradingService {
  private readonly redis: RedisClient;
  private readonly riskEngine: RiskEngine;

  constructor() {
    this.redis = new RedisCtor(config.REDIS_URL);
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

  async getStatus() {
    const killSwitches = await this.riskEngine.getKillSwitchStates();
    const tradingEnabled = !killSwitches.GLOBAL;

    const overrides = await prisma.configOverride.findMany();
    const overrideMap = Object.fromEntries(
      overrides
        .filter((o) => !o.key.startsWith("execution_wallet"))
        .map((o) => [o.key, JSON.parse(o.value)])
    );
    const riskConfig = RiskConfigSchema.parse({
      baseTradeSizeUsd: config.DEFAULT_MAX_TRADE_SIZE_USD,
      maxTradeSizeUsd: config.DEFAULT_MAX_TRADE_SIZE_USD,
      minNetProfitUsd: config.DEFAULT_MIN_NET_PROFIT_USD,
      maxGasGwei: config.DEFAULT_MAX_GAS_GWEI,
      minPoolLiquidityUsd: config.DEFAULT_MIN_POOL_LIQUIDITY_USD,
      ...overrideMap,
    });

    const walletInfo = await this.getWalletInfo();

    const recentExecCount = await prisma.execution.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });

    return {
      tradingEnabled,
      mockExecution: config.MOCK_EXECUTION,
      walletConfigured: walletInfo.configured,
      walletAddress: walletInfo.address,
      walletBalanceAvax: walletInfo.balance,
      riskConfig,
      killSwitches,
      recentExecutions24h: recentExecCount,
    };
  }

  async getWalletInfo(): Promise<{ configured: boolean; address: string | null; balance: number | null }> {
    let address: string | null = null;

    if (config.EXECUTION_WALLET_PRIVATE_KEY) {
      try {
        address = deriveAddressFromPrivateKey(config.EXECUTION_WALLET_PRIVATE_KEY as `0x${string}`);
      } catch { /* invalid key */ }
    }

    if (!address) {
      const dbKey = await prisma.configOverride.findUnique({ where: { key: "execution_wallet_key" } });
      if (dbKey) {
        try {
          const pk = decryptValue(dbKey.value) as `0x${string}`;
          address = deriveAddressFromPrivateKey(pk);
        } catch { /* invalid stored key */ }
      }
    }

    if (!address) {
      return { configured: false, address: null, balance: null };
    }

    let balance: number | null = null;
    try {
      const rpc = getRpcConfig(config.CHAIN_ID);
      const client = createChainClient({ rpcUrl: rpc.rpcUrl, chainId: config.CHAIN_ID });
      const balancePromise = client.getBalance({ address: address as `0x${string}` });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 5000)
      );
      const raw = await Promise.race([balancePromise, timeoutPromise]);
      balance = Number(raw) / 1e18;
    } catch { /* RPC error or timeout */ }

    return { configured: true, address, balance };
  }

  async setWallet(privateKey: string, actor: string): Promise<{ address: string }> {
    const normalized = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;

    let address: string;
    try {
      address = deriveAddressFromPrivateKey(normalized as `0x${string}`);
    } catch {
      throw new BadRequestException("Invalid private key");
    }

    const encrypted = encryptValue(normalized);
    await prisma.configOverride.upsert({
      where: { key: "execution_wallet_key" },
      create: { key: "execution_wallet_key", value: encrypted, updatedBy: actor },
      update: { value: encrypted, updatedBy: actor },
    });

    await prisma.auditLog.create({
      data: {
        action: "WALLET_CONFIGURED",
        actor,
        entityType: "trading",
        entityId: "wallet",
        diff: { address },
      },
    });

    return { address };
  }

  async removeWallet(actor: string): Promise<void> {
    await prisma.configOverride.deleteMany({ where: { key: "execution_wallet_key" } });

    await prisma.auditLog.create({
      data: {
        action: "WALLET_REMOVED",
        actor,
        entityType: "trading",
        entityId: "wallet",
        diff: {},
      },
    });
  }
}

@Controller("trading")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TradingController {
  constructor(private readonly svc: TradingService) {}

  @Get("status")
  getStatus() {
    return this.svc.getStatus();
  }

  @Post("wallet")
  @Roles("ADMIN")
  setWallet(@Body() dto: SetWalletDto, @CurrentUser() user: JwtPayload) {
    return this.svc.setWallet(dto.privateKey, user.sub);
  }

  @Delete("wallet")
  @Roles("ADMIN")
  removeWallet(@CurrentUser() user: JwtPayload) {
    return this.svc.removeWallet(user.sub);
  }
}

@Module({
  controllers: [TradingController],
  providers: [TradingService],
  exports: [TradingService],
})
export class TradingModule {}
