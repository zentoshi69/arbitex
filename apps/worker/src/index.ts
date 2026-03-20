import { Worker, Queue, type Job } from "bullmq";
import IORedis from "ioredis";
import { pino } from "pino";
import { config, getPrimaryRpcConfig } from "@arbitex/config";
import { prisma } from "@arbitex/db";
import { createChainClient } from "@arbitex/chain";
import { UniswapV3Adapter, SushiSwapV2Adapter, MockDexAdapter, AdapterRegistry } from "@arbitex/dex-adapters";
import { OpportunityEngine } from "@arbitex/opportunity-engine";
import { RiskEngine } from "@arbitex/risk-engine";
import { ExecutionEngine, RouteSimulator } from "@arbitex/execution-engine";
import { RiskConfigSchema, OpportunityState, ExecutionState } from "@arbitex/shared-types";
import { processOpportunityJob } from "./jobs/opportunity.job.js";
import { processExecutionJob } from "./jobs/execution.job.js";
import { processBalanceSyncJob } from "./jobs/balance-sync.job.js";
import { readV3PoolFull } from "./dex-adapters/v3-pool-reader.js";
import { watchLPEvents, type WatcherHandle } from "./watchers/lp-event-watcher.js";

const logger = pino({ level: config.LOG_LEVEL });

// ── Redis connection ──────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const connection: any = new (IORedis as any).default(config.REDIS_URL, {
  maxRetriesPerRequest: null,
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
  ...(primaryRpc.archiveRpcUrl ? { archiveRpcUrl: primaryRpc.archiveRpcUrl } : {}),
  chainId: config.CHAIN_ID,
});

// ── Avalanche token addresses ─────────────────────────────────────────────────
const AVAX_TOKENS = {
  WAVAX: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
  WRP:   "0xef282b38d1ceab52134ca2cc653a569435744687",
  USDC:  "0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664",
  USDT:  "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7",
} as const;

// ── Fetch native token price from CoinGecko ──────────────────────────────────
let cachedNativePrice = { usd: 10, fetchedAt: 0 };

async function fetchNativeTokenPriceUsd(): Promise<number> {
  if (Date.now() - cachedNativePrice.fetchedAt < 60_000) return cachedNativePrice.usd;
  try {
    const id = config.CHAIN_ID === 43114 ? "avalanche-2" : "ethereum";
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
    if (res.ok) {
      const data = (await res.json()) as Record<string, any>;
      const price = data[id]?.usd;
      if (typeof price === "number" && price > 0) {
        cachedNativePrice = { usd: price, fetchedAt: Date.now() };
        return price;
      }
    }
  } catch { /* use cached */ }
  return cachedNativePrice.usd;
}

// ── Adapter registry ──────────────────────────────────────────────────────────
const registry = new AdapterRegistry();

async function registerAdapters() {
  const venues = await prisma.venue.findMany({
    where: { chainId: config.CHAIN_ID, isEnabled: true },
  });

  for (const venue of venues) {
    if (!venue.factoryAddress || !venue.routerAddress) continue;

    if (venue.protocol === "uniswap_v2") {
      registry.register(
        new SushiSwapV2Adapter(chainClient as any, {
          venueId: venue.id,
          venueName: venue.name,
          protocol: venue.protocol,
          chainId: venue.chainId,
          factoryAddress: venue.factoryAddress,
          routerAddress: venue.routerAddress,
        })
      );
      logger.info({ venue: venue.name, chainId: venue.chainId }, "Registered UniswapV2 adapter");
    } else if (venue.protocol === "uniswap_v3") {
      registry.register(new UniswapV3Adapter(chainClient as any));
      logger.info({ venue: venue.name, chainId: venue.chainId }, "Registered UniswapV3 adapter");
    }
  }

  if (registry.getAll().length === 0) {
    logger.warn("No adapters registered from DB — falling back to mock adapters");
    const mockPoolA = MockDexAdapter.makePool({
      token0: AVAX_TOKENS.USDC,
      token1: AVAX_TOKENS.WAVAX,
      venueId: "mock-pangolin",
      price0Per1: 10.0,
      price1Per0: 0.1,
    });
    const mockPoolB = MockDexAdapter.makePool({
      token0: AVAX_TOKENS.USDC,
      token1: AVAX_TOKENS.WAVAX,
      venueId: "mock-traderjoe",
      price0Per1: 10.05,
      price1Per0: 0.0995,
    });
    registry.register(new MockDexAdapter("mock-pangolin", "Pangolin (Mock)", 43114, [mockPoolA]));
    registry.register(new MockDexAdapter("mock-traderjoe", "TraderJoe (Mock)", 43114, [mockPoolB]));
  }
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

// ── Target tokens for the configured chain ───────────────────────────────────
const targetTokens = config.CHAIN_ID === 43114
  ? [AVAX_TOKENS.WAVAX, AVAX_TOKENS.WRP, AVAX_TOKENS.USDC, AVAX_TOKENS.USDT]
  : [
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
      "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
      "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
    ];

// ── V3 pool state cache ──────────────────────────────────────────────────────
import type { V3PoolState, TickData } from "@arbitex/shared-types";

const v3PoolCache = new Map<string, { state: V3PoolState; ticks: TickData[]; ts: number }>();
let lpWatcherHandle: WatcherHandle | null = null;

async function refreshV3PoolStates() {
  const v3Venues = await prisma.venue.findMany({
    where: { chainId: config.CHAIN_ID, isEnabled: true, protocol: "uniswap_v3" },
    include: { pools: { where: { isActive: true }, take: 50 } },
  });

  for (const venue of v3Venues) {
    for (const pool of venue.pools) {
      try {
        const result = await readV3PoolFull(
          chainClient,
          pool.poolAddress as `0x${string}`,
          { venueId: venue.id, venueName: venue.name, chainId: venue.chainId }
        );
        v3PoolCache.set(pool.poolAddress.toLowerCase(), {
          state: result.state,
          ticks: result.ticks,
          ts: Date.now(),
        });
      } catch (err) {
        logger.warn({ pool: pool.poolAddress, err }, "V3 pool read failed");
      }
    }
  }
  logger.debug({ count: v3PoolCache.size }, "V3 pool states refreshed");
}

function startLPWatcher() {
  const poolAddrs = Array.from(v3PoolCache.keys()) as `0x${string}`[];
  if (poolAddrs.length === 0) return;

  lpWatcherHandle?.stop();
  lpWatcherHandle = watchLPEvents(
    chainClient,
    poolAddrs,
    (evt) => {
      logger.info(
        { pool: evt.pool, type: evt.type, tickLower: evt.tickLower, tickUpper: evt.tickUpper },
        "LP event detected — marking pool stale"
      );
      v3PoolCache.delete(evt.pool.toLowerCase());
    },
    4_000
  );
  logger.info({ pools: poolAddrs.length }, "LP event watcher started");
}

// Pool refresh → opportunity scoring
const poolRefreshWorker = new Worker(
  "pool-refresh",
  async (job: Job) => {
    logger.debug({ jobId: job.id }, "pool-refresh start");

    await refreshV3PoolStates();

    const nativePriceUsd = await fetchNativeTokenPriceUsd();
    const candidates = await opportunityEngine.scanForOpportunities({
      targetTokens,
      tradeSizeUsd: config.DEFAULT_MAX_TRADE_SIZE_USD,
      ethPriceUsd: nativePriceUsd,
      riskConfig,
    });

    for (const candidate of candidates) {
      await queues.opportunityScore.add(
        "score",
        candidate,
        {
          jobId: `opp-${candidate.fingerprint}`,
          removeOnComplete: 100,
          removeOnFail: false,
          attempts: 1,
        }
      );
    }
    logger.info({ count: candidates.length, v3Pools: v3PoolCache.size }, "Opportunities queued");
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

  await registerAdapters();
  opportunityEngine.updateAdapters(registry.getAll());

  await refreshV3PoolStates();
  startLPWatcher();

  await startSchedulers();
  logger.info({ v3Pools: v3PoolCache.size }, "Worker started — opportunity engine running");

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received — shutting down workers");
    lpWatcherHandle?.stop();
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
