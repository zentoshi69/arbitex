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

  // Create opportunity record
  const opp = await prisma.opportunity.create({
    data: {
      state: OpportunityState.DETECTED,
      tokenInAddress: candidate.tokenIn,
      tokenOutAddress: candidate.tokenOut,
      tokenInSymbol: candidate.tokenInSymbol || "?",
      tokenOutSymbol: candidate.tokenOutSymbol || "?",
      tradeSizeUsd: candidate.tradeSizeUsd,
      grossSpreadUsd: candidate.profitBreakdown.grossSpreadUsd,
      gasEstimateUsd: candidate.profitBreakdown.gasEstimateUsd,
      venueFeesUsd: candidate.profitBreakdown.venueFeesUsd,
      slippageBufferUsd: candidate.profitBreakdown.slippageBufferUsd,
      failureBufferUsd: candidate.profitBreakdown.failureBufferUsd,
      netProfitUsd: candidate.profitBreakdown.netProfitUsd,
      netProfitBps: candidate.profitBreakdown.netProfitBps,
      buyVenueId: await resolveVenueId(prisma, candidate.buyPool.venueId),
      sellVenueId: await resolveVenueId(prisma, candidate.sellPool.venueId),
      buyVenueName: candidate.buyPool.venueName,
      sellVenueName: candidate.sellPool.venueName,
      fingerprint: candidate.fingerprint,
      expiresAt: new Date(Date.now() + 300_000),
    },
  });

  // Create route steps
  await prisma.opportunityRoute.createMany({
    data: candidate.routes.map((r) => ({
      opportunityId: opp.id,
      stepIndex: r.stepIndex,
      poolId: opp.buyVenueId, // simplified — use actual pool id in production
      venueId: opp.buyVenueId,
      venueName: r.venueName,
      tokenIn: r.tokenIn,
      tokenOut: r.tokenOut,
      amountIn: r.amountIn,
      amountOut: r.amountOut,
      feeBps: r.feeBps,
    })),
  });

  logger.info(
    { opportunityId: opp.id, netProfitUsd: candidate.profitBreakdown.netProfitUsd },
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
  const venue = await prisma.venue.findFirst({
    where: { name: { contains: venueId } },
  });
  // Return a placeholder UUID if venue not seeded — in production, always seed venues
  return venue?.id ?? "00000000-0000-0000-0000-000000000000";
}
