import { Worker, Queue, QueueScheduler, type Job } from "bullmq";
import IORedis from "ioredis";
import { pino } from "pino";
import { config, getPrimaryRpcConfig } from "@arbitex/config";
import { prisma } from "@arbitex/db";
import { createChainClient } from "@arbitex/chain";
import { UniswapV3Adapter, MockDexAdapter, AdapterRegistry } from "@arbitex/dex-adapters";
import { OpportunityEngine } from "@arbitex/opportunity-engine";
import { RiskEngine } from "@arbitex/risk-engine";
import { ExecutionEngine, RouteSimulator } from "@arbitex/execution-engine";
import { RiskConfigSchema, OpportunityState, ExecutionState } from "@arbitex/shared-types";
import { processOpportunityJob } from "./jobs/opportunity.job.js";
import { processExecutionJob } from "./jobs/execution.job.js";
import { processBalanceSyncJob } from "./jobs/balance-sync.job.js";

const logger = pino({ level: config.LOG_LEVEL });

// ── Redis connection ──────────────────────────────────────────────────────────
const connection = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
});

// ── Queue definitions ─────────────────────────────────────────────────────────
export const queues = {
  poolRefresh: new Queue("pool-refresh", { connection }),
  opportunityScore: new Queue("opportunity-score", { connection }),
  execution: new Queue("execution", { connection }),
  balanceSync: new Queue("balance-sync", { connection }),
  audit: new Queue("audit", { connection }),
};

// ── Chain client ──────────────────────────────────────────────────────────────
const primaryRpc = getPrimaryRpcConfig();
const chainClient = createChainClient({
  rpcUrl: primaryRpc.rpcUrl,
  archiveRpcUrl: primaryRpc.archiveRpcUrl,
  chainId: config.CHAIN_ID,
});

// ── Adapter registry ──────────────────────────────────────────────────────────
const registry = new AdapterRegistry();

if (config.NODE_ENV === "production") {
  registry.register(new UniswapV3Adapter(chainClient as any));
  // Add SushiSwap etc.
} else {
  // Dev/test: use mock adapters with divergent prices to generate opportunities
  const mockPoolA = MockDexAdapter.makePool({
    token0: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
    token1: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
    venueId: "mock-uniswap",
    price0Per1: 2000.0,
    price1Per0: 0.0005,
  });
  const mockPoolB = MockDexAdapter.makePool({
    token0: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    token1: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    venueId: "mock-sushi",
    price0Per1: 2010.0, // 0.5% higher — creates arb opportunity
    price1Per0: 0.000497,
  });

  registry.register(
    new MockDexAdapter("mock-uniswap", "Uniswap V3 (Mock)", 1, [mockPoolA])
  );
  registry.register(
    new MockDexAdapter("mock-sushi", "SushiSwap (Mock)", 1, [mockPoolB])
  );
}

// ── Risk engine ───────────────────────────────────────────────────────────────
const riskConfig = RiskConfigSchema.parse({
  maxTradeSizeUsd: config.DEFAULT_MAX_TRADE_SIZE_USD,
  minNetProfitUsd: config.DEFAULT_MIN_NET_PROFIT_USD,
  maxGasGwei: config.DEFAULT_MAX_GAS_GWEI,
  minPoolLiquidityUsd: config.DEFAULT_MIN_POOL_LIQUIDITY_USD,
});

const riskEngine = new RiskEngine(connection, prisma, riskConfig);

// ── Opportunity engine ────────────────────────────────────────────────────────
const opportunityEngine = new OpportunityEngine(
  registry.getAll(),
  prisma,
  chainClient
);

// ── Workers ───────────────────────────────────────────────────────────────────
const workerOpts = {
  connection,
  concurrency: 1,
  limiter: { max: 10, duration: 1000 },
};

// Pool refresh → opportunity scoring
const poolRefreshWorker = new Worker(
  "pool-refresh",
  async (job: Job) => {
    logger.debug({ jobId: job.id }, "pool-refresh start");
    const candidates = await opportunityEngine.scanForOpportunities({
      targetTokens: [
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
      ],
      tradeSizeUsd: config.DEFAULT_MAX_TRADE_SIZE_USD,
      ethPriceUsd: 2000, // TODO: fetch from oracle
      riskConfig,
    });

    for (const candidate of candidates) {
      await queues.opportunityScore.add(
        "score",
        candidate,
        {
          jobId: `opp-${candidate.fingerprint}`, // dedup
          removeOnComplete: 100,
          removeOnFail: false,
          attempts: 1,
        }
      );
    }
    logger.info({ count: candidates.length }, "Opportunities queued");
  },
  workerOpts
);

// Opportunity scoring → risk check → execution queue
const opportunityScoreWorker = new Worker(
  "opportunity-score",
  async (job: Job) => {
    await processOpportunityJob(job, { riskEngine, prisma, queues, riskConfig });
  },
  { ...workerOpts, concurrency: 5 }
);

// Execution worker — concurrency 1 to prevent nonce conflicts
const executionWorker = new Worker(
  "execution",
  async (job: Job) => {
    await processExecutionJob(job, {
      chainClient,
      registry,
      riskEngine,
      prisma,
      connection,
      riskConfig,
      mockExecution: config.MOCK_EXECUTION,
    });
  },
  { ...workerOpts, concurrency: 1 }
);

// Balance sync
const balanceSyncWorker = new Worker(
  "balance-sync",
  async (job: Job) => {
    await processBalanceSyncJob(job, { chainClient, prisma });
  },
  workerOpts
);

// ── Cron schedulers ───────────────────────────────────────────────────────────
async function startSchedulers() {
  // Pool refresh every 2 seconds
  await queues.poolRefresh.add(
    "refresh-all",
    {},
    { repeat: { every: 2_000 }, removeOnComplete: 10, removeOnFail: false }
  );

  // Balance sync every 60 seconds
  await queues.balanceSync.add(
    "sync",
    {},
    { repeat: { every: 60_000 }, removeOnComplete: 5, removeOnFail: false }
  );

  // Opportunity cleanup every 5 minutes
  setInterval(async () => {
    const thirtySecsAgo = new Date(Date.now() - 30_000);
    await prisma.opportunity.updateMany({
      where: {
        state: { in: [OpportunityState.DETECTED, OpportunityState.QUOTED] },
        detectedAt: { lt: thirtySecsAgo },
      },
      data: { state: OpportunityState.EXPIRED },
    });
  }, 300_000);
}

// ── Error handling ────────────────────────────────────────────────────────────
for (const [name, worker] of [
  ["pool-refresh", poolRefreshWorker],
  ["opportunity-score", opportunityScoreWorker],
  ["execution", executionWorker],
  ["balance-sync", balanceSyncWorker],
] as const) {
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, queue: name, err }, "Job failed");
  });
  worker.on("error", (err) => {
    logger.error({ queue: name, err }, "Worker error");
  });
}

// ── Startup ───────────────────────────────────────────────────────────────────
async function main() {
  await prisma.$connect();
  logger.info("Database connected");

  await startSchedulers();
  logger.info("Worker started — opportunity engine running");

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received — shutting down workers");
    await Promise.allSettled([
      poolRefreshWorker.close(),
      opportunityScoreWorker.close(),
      executionWorker.close(),
      balanceSyncWorker.close(),
    ]);
    await prisma.$disconnect();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error(err, "Worker fatal error");
  process.exit(1);
});
