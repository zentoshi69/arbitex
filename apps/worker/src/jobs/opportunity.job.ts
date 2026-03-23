import type { Job } from "bullmq";
import type { PrismaClient } from "@arbitex/db";
import type { RiskEngine } from "@arbitex/risk-engine";
import type { OpportunityCandidate } from "@arbitex/opportunity-engine";
import type { RiskConfig } from "@arbitex/shared-types";
import { OpportunityState } from "@arbitex/shared-types";
import type { ArbitexPublicClient } from "@arbitex/chain";
import type { queues } from "../index.js";
import { pino } from "pino";

const logger = pino();

const MAX_USD = 9_999_999_999_999; // fits Decimal(20,4)
const MAX_BPS = 999_999;           // fits Decimal(10,4)

function clampUsd(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-MAX_USD, Math.min(MAX_USD, v));
}

function clampBps(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-MAX_BPS, Math.min(MAX_BPS, v));
}

type JobDeps = {
  riskEngine: RiskEngine;
  prisma: PrismaClient;
  queues: typeof queues;
  riskConfig: RiskConfig;
  chainClient: ArbitexPublicClient;
};

export async function processOpportunityJob(
  job: Job,
  deps: JobDeps
): Promise<void> {
  const candidate = job.data as OpportunityCandidate;
  const { riskEngine, prisma, queues: q, riskConfig } = deps;

  // Check for existing opportunity with same fingerprint in this window
  const existing = await prisma.opportunity.findFirst({
    where: {
      fingerprint: candidate.fingerprint,
      state: {
        notIn: [
          OpportunityState.EXPIRED,
          OpportunityState.BLOCKED,
          OpportunityState.FAILED_TX,
        ],
      },
    },
  });

  if (existing) {
    logger.debug({ fingerprint: candidate.fingerprint }, "Duplicate opportunity skipped");
    return;
  }

  // Reject candidates with unreasonable spread (>1000% of trade size)
  if (
    !Number.isFinite(candidate.profitBreakdown.grossSpreadUsd) ||
    Math.abs(candidate.profitBreakdown.grossSpreadUsd) > candidate.tradeSizeUsd * 10
  ) {
    logger.warn(
      { grossSpreadUsd: candidate.profitBreakdown.grossSpreadUsd, tradeSizeUsd: candidate.tradeSizeUsd },
      "Rejecting candidate with unreasonable spread"
    );
    return;
  }

  // Create opportunity record
  const opp = await prisma.opportunity.create({
    data: {
      state: OpportunityState.DETECTED,
      tokenId: candidate.tokenId ?? null,
      tokenInAddress: candidate.tokenIn,
      tokenOutAddress: candidate.tokenOut,
      tokenInSymbol: candidate.tokenInSymbol || "?",
      tokenOutSymbol: candidate.tokenOutSymbol || "?",
      tradeSizeUsd: clampUsd(candidate.tradeSizeUsd),
      grossSpreadUsd: clampUsd(candidate.profitBreakdown.grossSpreadUsd),
      gasEstimateUsd: clampUsd(candidate.profitBreakdown.gasEstimateUsd),
      venueFeesUsd: clampUsd(candidate.profitBreakdown.venueFeesUsd),
      slippageBufferUsd: clampUsd(candidate.profitBreakdown.slippageBufferUsd),
      failureBufferUsd: clampUsd(candidate.profitBreakdown.failureBufferUsd),
      netProfitUsd: clampUsd(candidate.profitBreakdown.netProfitUsd),
      netProfitBps: clampBps(candidate.profitBreakdown.netProfitBps),
      buyVenueId: await resolveVenueId(prisma, candidate.buyPool.venueId),
      sellVenueId: await resolveVenueId(prisma, candidate.sellPool.venueId),
      buyVenueName: candidate.buyPool.venueName,
      sellVenueName: candidate.sellPool.venueName,
      fingerprint: candidate.fingerprint,
      expiresAt: new Date(Date.now() + 300_000),
    },
  });

  // Create route steps — resolve on-chain pool address to DB UUID
  const routeData = [];
  for (const r of candidate.routes) {
    const dbPoolId = await resolvePoolId(prisma, r.poolId);
    const dbVenueId = await resolveVenueId(prisma, r.venueId);
    if (!dbPoolId) {
      logger.warn({ poolAddress: r.poolId }, "Pool not found in DB, skipping route step");
      continue;
    }
    routeData.push({
      opportunityId: opp.id,
      stepIndex: r.stepIndex,
      poolId: dbPoolId,
      venueId: dbVenueId,
      venueName: r.venueName,
      tokenIn: r.tokenIn,
      tokenOut: r.tokenOut,
      amountIn: r.amountIn,
      amountOut: r.amountOut,
      feeBps: r.feeBps,
    });
  }
  if (routeData.length > 0) {
    await prisma.opportunityRoute.createMany({ data: routeData });
  }

  logger.info(
    { opportunityId: opp.id, netProfitUsd: clampUsd(candidate.profitBreakdown.netProfitUsd) },
    "Opportunity detected"
  );

  // ── Risk evaluation ────────────────────────────────────────────────────────
  let gasGwei = 25; // fallback for Avalanche C-Chain
  try {
    const gasPriceWei = await deps.chainClient.getGasPrice();
    gasGwei = Number(gasPriceWei / 1_000_000_000n);
  } catch (err) {
    logger.warn({ err }, "Failed to fetch live gas price, using fallback");
  }

  const riskDecision = await riskEngine.evaluate({
    opportunityId: opp.id,
    tokenIn: candidate.tokenIn,
    tokenOut: candidate.tokenOut,
    tradeSizeUsd: candidate.tradeSizeUsd,
    netProfitUsd: candidate.profitBreakdown.netProfitUsd,
    grossSpreadUsd: candidate.profitBreakdown.grossSpreadUsd,
    buyPool: candidate.buyPool,
    sellPool: candidate.sellPool,
    gasGwei,
    chainId: candidate.buyPool.chainId,
    profitBreakdown: candidate.profitBreakdown,
  });

  if (!riskDecision.approved) {
    await prisma.opportunity.update({
      where: { id: opp.id },
      data: {
        state: OpportunityState.BLOCKED,
        riskDecision: riskDecision as any,
      },
    });
    logger.info(
      { opportunityId: opp.id, reasons: riskDecision.rejectionReasons },
      "Opportunity blocked by risk engine"
    );
    return;
  }

  // ── Approved → queue for execution ────────────────────────────────────────
  await prisma.opportunity.update({
    where: { id: opp.id },
    data: {
      state: OpportunityState.APPROVED,
      riskDecision: riskDecision as any,
    },
  });

  await q.execution.add(
    "execute",
    { opportunityId: opp.id, candidate },
    {
      jobId: `exec-${opp.id}`,
      priority: 1,
      attempts: 2,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 200,
      removeOnFail: false,
    }
  );

  logger.info({ opportunityId: opp.id }, "Opportunity approved and queued for execution");
}

async function resolveVenueId(
  prisma: PrismaClient,
  venueId: string
): Promise<string> {
  // venueId from adapters is already the DB UUID
  const byId = await prisma.venue.findUnique({ where: { id: venueId } });
  if (byId) return byId.id;

  // Fallback: try matching by name (for mock adapters or legacy data)
  const byName = await prisma.venue.findFirst({
    where: { name: { equals: venueId, mode: "insensitive" } },
  });
  return byName?.id ?? venueId;
}

async function resolvePoolId(
  prisma: PrismaClient,
  poolAddress: string
): Promise<string | null> {
  const pool = await prisma.pool.findFirst({
    where: { poolAddress: { equals: poolAddress, mode: "insensitive" } },
    select: { id: true },
  });
  return pool?.id ?? null;
}
