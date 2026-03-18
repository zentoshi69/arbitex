import { Controller, Get } from "@nestjs/common";
import { Module, Injectable } from "@nestjs/common";
import { prisma } from "@arbitex/db";
import RedisModule, { Redis as RedisClient } from "ioredis";
import { config } from "@arbitex/config";
import { createChainClient } from "@arbitex/chain";
import type { SystemHealth } from "@arbitex/shared-types";
import { Public } from "../auth/auth.module.js";

const RedisCtor: new (...args: any[]) => RedisClient =
  ((RedisModule as any).default ?? (RedisModule as any)) as any;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => {
      clearTimeout(id);
      resolve(v);
    }).catch((e) => {
      clearTimeout(id);
      reject(e);
    });
  });
}

@Injectable()
export class HealthService {
  private readonly redis: RedisClient = new RedisCtor(config.REDIS_URL);
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
      await withTimeout(this.redis.ping(), 500);
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
      await withTimeout(client.getBlockNumber(), 1500);
      const latency = Date.now() - start;
      return latency > 2000 ? "slow" : "up";
    } catch {
      return "down";
    }
  }

  private async getQueueDepths(): Promise<Record<string, number>> {
    try {
      const keys = await withTimeout(this.redis.keys("bull:*:waiting"), 700);
      const depths: Record<string, number> = {};
      for (const key of keys) {
        const queueName = key.split(":")[1] ?? key;
        const depth = await withTimeout(this.redis.llen(key), 700);
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
      keys.map((k) =>
        withTimeout(this.redis.get(`arbitex:risk:kill:${k}`), 700).catch(() => null)
      )
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
