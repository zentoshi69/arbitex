/**
 * Liquidity Scan Job — BullMQ processor.
 *
 * Builds and refreshes per-pool liquidity maps by scanning on-chain events.
 *
 * For V3 pools with a known NonfungiblePositionManager, uses the preferred
 * IncreaseLiquidity / DecreaseLiquidity event approach with per-tokenId
 * position fetching. Otherwise falls back to pool-level Mint/Burn events.
 *
 * Modes (passed via job.data.mode):
 *   "full"  — pool creation block → current (first build or post-pause recovery)
 *   "quick" — last 500k blocks, merge into cached map (incremental)
 *
 * When no existing map is found for a pool, "full" is forced regardless.
 */

import type { Job } from "bullmq";
import type { PrismaClient } from "@arbitex/db";
import type { PublicClient } from "viem";
import { buildLiquidityMap } from "@arbitex/opportunity-engine";
import type {
  PoolScanTarget,
  LiquidityMapData,
  ScanMode,
} from "@arbitex/opportunity-engine";
import { pino } from "pino";

const log = pino({ name: "liquidity-scan-job" });

const PROTOCOL_TO_POOL_TYPE: Record<string, "v2" | "v3" | "solidly_v2"> = {
  uniswap_v2: "v2",
  sushiswap_v2: "v2",
  uniswap_v3: "v3",
  algebra_v1: "v3",
  solidly_v2: "solidly_v2",
};

export interface LiquidityScanContext {
  chainClient: PublicClient;
  prisma: PrismaClient;
  chainId: number;
}

export async function processLiquidityScanJob(
  job: Job,
  ctx: LiquidityScanContext,
): Promise<void> {
  const requestedMode: ScanMode = (job.data as any)?.mode ?? "quick";

  const pools = await ctx.prisma.pool.findMany({
    where: {
      isActive: true,
      venue: { chainId: ctx.chainId, isEnabled: true },
    },
    include: {
      venue: {
        select: {
          id: true,
          name: true,
          protocol: true,
          chainId: true,
          factoryAddress: true,
        },
      },
      token0: { select: { symbol: true } },
      token1: { select: { symbol: true } },
    },
  });

  if (pools.length === 0) {
    log.info("No active pools to scan");
    return;
  }

  log.info(
    { poolCount: pools.length, mode: requestedMode },
    "Starting liquidity map scan/refresh",
  );

  let scanned = 0;
  let errors = 0;
  let skipped = 0;

  const PLACEHOLDER_RE = /^0x0{38,}[0-9a-fA-F]{1,2}$/;

  for (const pool of pools) {
    if (PLACEHOLDER_RE.test(pool.poolAddress)) {
      skipped++;
      continue;
    }

    const poolType = PROTOCOL_TO_POOL_TYPE[pool.venue.protocol];
    if (!poolType) {
      log.warn(
        { pool: pool.poolAddress, protocol: pool.venue.protocol },
        "Unknown protocol — skipping",
      );
      skipped++;
      continue;
    }

    try {
      const existing = await ctx.prisma.liquidityMap.findUnique({
        where: { poolId: pool.id },
      });

      const effectiveMode: ScanMode = existing ? requestedMode : "full";

      const target: PoolScanTarget = {
        poolId: pool.id,
        poolAddress: pool.poolAddress,
        poolType,
        chainId: pool.venue.chainId,
        factoryAddress: pool.venue.factoryAddress ?? undefined,
      };

      const existingData = existing?.data as LiquidityMapData | undefined;
      const existingScanToBlock =
        existing?.scanToBlock != null
          ? BigInt(existing.scanToBlock)
          : undefined;

      const result = await buildLiquidityMap(
        ctx.chainClient as any,
        target,
        effectiveMode,
        existingData,
        existingScanToBlock,
      );

      const posCount =
        result.data.type === "v3"
          ? Object.keys(result.data.positions).length
          : (result.data as any).positions?.length ?? 0;

      await ctx.prisma.liquidityMap.upsert({
        where: { poolId: pool.id },
        create: {
          poolId: pool.id,
          poolAddress: pool.poolAddress.toLowerCase(),
          poolType,
          chainId: pool.venue.chainId,
          data: result.data as any,
          scanFromBlock: result.fromBlock,
          scanToBlock: result.toBlock,
          eventCount: result.eventCount,
          builtAt: new Date(),
          refreshedAt: new Date(),
        },
        update: {
          data: result.data as any,
          scanToBlock: result.toBlock,
          eventCount: { increment: result.eventCount },
          refreshedAt: new Date(),
        },
      });

      scanned++;
      const pair = `${pool.token0.symbol}/${pool.token1.symbol}`;
      log.info(
        {
          pool: pair,
          venue: pool.venue.name,
          type: poolType,
          mode: effectiveMode,
          events: result.eventCount,
          positions: posCount,
          ticks:
            poolType === "v3"
              ? Object.keys((result.data as any)?.ticks ?? {}).length
              : undefined,
          fromBlock: Number(result.fromBlock),
          toBlock: Number(result.toBlock),
        },
        "Liquidity map updated",
      );
    } catch (err) {
      errors++;
      log.error(
        { pool: pool.poolAddress, err },
        "Liquidity scan failed for pool",
      );
    }
  }

  log.info(
    { scanned, errors, skipped, total: pools.length, mode: requestedMode },
    "Liquidity scan complete",
  );
}
