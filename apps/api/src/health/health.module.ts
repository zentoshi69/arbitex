import { Controller, Get } from "@nestjs/common";
import { Module, Injectable } from "@nestjs/common";
import { prisma } from "@arbitex/db";
import Redis from "ioredis";
import { config } from "@arbitex/config";
import { createChainClient } from "@arbitex/chain";
import type { SystemHealth } from "@arbitex/shared-types";
import { Public } from "../auth/auth.module.js";

@Injectable()
export class HealthService {
  private readonly redis = new Redis(config.REDIS_URL);
  private readonly startTime = Date.now();

  async check(): Promise<SystemHealth> {
    const [db, redis, rpc] = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkRpc(),
    ]);

    const dbStatus = db.status === "fulfilled" ? db.value : "down";
    const redisStatus = redis.status === "fulfilled" ? redis.value : "down";
    const rpcStatus = rpc.status === "fulfilled" ? rpc.value : "down";

    const killSwitches = await this.getKillSwitches();

    const status =
      dbStatus === "down" || redisStatus === "down"
        ? "down"
        : rpcStatus === "down"
          ? "degraded"
          : "healthy";

    return {
      status,
      database: dbStatus as "up" | "down",
      redis: redisStatus as "up" | "down",
      rpc: rpcStatus as "up" | "down" | "slow",
      workerQueueDepths: await this.getQueueDepths(),
      killSwitches,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checkedAt: new Date(),
    };
  }

  private async checkDatabase(): Promise<"up" | "down"> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return "up";
    } catch {
      return "down";
    }
  }

  private async checkRedis(): Promise<"up" | "down"> {
    try {
      await this.redis.ping();
      return "up";
    } catch {
      return "down";
    }
  }

  private async checkRpc(): Promise<"up" | "down" | "slow"> {
    try {
      const client = createChainClient({
        rpcUrl: config.ETHEREUM_RPC_URL,
        chainId: config.CHAIN_ID,
      });
      const start = Date.now();
      await client.getBlockNumber();
      const latency = Date.now() - start;
      return latency > 2000 ? "slow" : "up";
    } catch {
      return "down";
    }
  }

  private async getQueueDepths(): Promise<Record<string, number>> {
    try {
      const keys = await this.redis.keys("bull:*:waiting");
      const depths: Record<string, number> = {};
      for (const key of keys) {
        const queueName = key.split(":")[1] ?? key;
        const depth = await this.redis.llen(key);
        depths[queueName] = depth;
      }
      return depths;
    } catch {
      return {};
    }
  }

  private async getKillSwitches(): Promise<Record<string, boolean>> {
    const keys = ["GLOBAL", "CHAIN_1"];
    const values = await Promise.all(
      keys.map((k) => this.redis.get(`arbitex:risk:kill:${k}`))
    );
    return Object.fromEntries(keys.map((k, i) => [k, values[i] === "1"]));
  }
}

@Controller()
export class HealthController {
  constructor(private readonly svc: HealthService) {}

  @Get("health")
  @Public()
  check() {
    return this.svc.check();
  }
}

@Module({
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
