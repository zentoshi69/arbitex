import { Worker, Queue, type Job } from "bullmq";
import IORedis from "ioredis";
import { pino } from "pino";
import { config, getPrimaryRpcConfig } from "@arbitex/config";
import { prisma } from "@arbitex/db";
import { createChainClient } from "@arbitex/chain";
import { UniswapV3Adapter, SushiSwapV2Adapter, SolidlyV2Adapter, AlgebraV1Adapter, MockDexAdapter, AdapterRegistry, dexScreenerFeed, setAvaxPriceUsd } from "@arbitex/dex-adapters";
import { OpportunityEngine } from "@arbitex/opportunity-engine";
import { RiskEngine, RegimeClassifier } from "@arbitex/risk-engine";
import { ExecutionEngine, RouteSimulator } from "@arbitex/execution-engine";
import { AccumulationEngine } from "@arbitex/accumulation-engine";
import { ConversionEngine, fetchMarketSignals, buildExplanation } from "@arbitex/conversion-engine";
import { EXTENDED_REGIME_CONFIGS } from "@arbitex/risk-engine";
import { RiskConfigSchema, OpportunityState, ExecutionState } from "@arbitex/shared-types";
import { processOpportunityJob } from "./jobs/opportunity.job.js";
import { processExecutionJob } from "./jobs/execution.job.js";
import { processBalanceSyncJob } from "./jobs/balance-sync.job.js";
import { processLiquidityScanJob } from "./jobs/liquidity-scan.job.js";
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
  liquidityScan: new Queue("liquidity-scan", { connection }),
  audit: new Queue("audit", { connection }),
  conversion: new Queue("conversion-eval", { connection }),
};

// ── Chain client (multi-RPC with automatic failover + latency ranking) ───────
const primaryRpc = getPrimaryRpcConfig();
const chainClient = createChainClient({
  rpcUrl: primaryRpc.rpcUrl,
  ...(primaryRpc.archiveRpcUrl ? { archiveRpcUrl: primaryRpc.archiveRpcUrl } : {}),
  ...(primaryRpc.wssUrl ? { wssUrl: primaryRpc.wssUrl } : {}),
  chainId: config.CHAIN_ID,
});

// ── Load tracked + base-pair tokens from DB ──────────────────────────────────
const BASE_PAIR_SYMBOLS = ["WAVAX", "USDC", "USDC.e", "USDT"];

async function loadTargetTokens(): Promise<string[]> {
  const [tracked, basePairs] = await Promise.all([
    prisma.token.findMany({
      where: { chainId: config.CHAIN_ID, isTracked: true },
      select: { address: true },
    }),
    prisma.token.findMany({
      where: { chainId: config.CHAIN_ID, isEnabled: true, symbol: { in: BASE_PAIR_SYMBOLS } },
      select: { address: true },
    }),
  ]);
  const all = new Set([
    ...tracked.map((t: { address: string }) => t.address.toLowerCase()),
    ...basePairs.map((t: { address: string }) => t.address.toLowerCase()),
  ]);
  return Array.from(all);
}

// ── Fetch native token price from CoinGecko ──────────────────────────────────
let cachedNativePrice = { usd: 10, fetchedAt: 0 };

async function fetchNativeTokenPriceUsd(): Promise<number> {
  if (Date.now() - cachedNativePrice.fetchedAt < 60_000) return cachedNativePrice.usd;

  // Try DexScreener first (faster, no rate limiting)
  try {
    const wavaxAddr = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";
    const price = await dexScreenerFeed.getTokenPrice(wavaxAddr);
    if (price && price > 0) {
      cachedNativePrice = { usd: price, fetchedAt: Date.now() };
      setAvaxPriceUsd(price);
      await publishNativePrice(price);
      return price;
    }
  } catch { /* fallback to CoinGecko */ }

  try {
    const id = config.CHAIN_ID === 43114 ? "avalanche-2" : "ethereum";
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
    if (res.ok) {
      const data = (await res.json()) as Record<string, any>;
      const price = data[id]?.usd;
      if (typeof price === "number" && price > 0) {
        cachedNativePrice = { usd: price, fetchedAt: Date.now() };
        setAvaxPriceUsd(price);
        await publishNativePrice(price);
        return price;
      }
    }
  } catch { /* use cached */ }
  return cachedNativePrice.usd;
}

async function publishNativePrice(price: number): Promise<void> {
  try {
    await connection.set("arbitex:price:avax_usd", price.toString(), "EX", 120);
  } catch { /* non-critical */ }
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
      registry.register(
        UniswapV3Adapter.fromVenue(chainClient as any, {
          id: venue.id,
          name: venue.name,
          chainId: venue.chainId,
          factoryAddress: venue.factoryAddress,
          routerAddress: venue.routerAddress,
        })
      );
      logger.info({ venue: venue.name, chainId: venue.chainId }, "Registered UniswapV3 adapter");
    } else if (venue.protocol === "solidly_v2") {
      registry.register(
        new SolidlyV2Adapter(chainClient as any, {
          venueId: venue.id,
          venueName: venue.name,
          protocol: venue.protocol,
          chainId: venue.chainId,
          factoryAddress: venue.factoryAddress,
          routerAddress: venue.routerAddress,
        })
      );
      logger.info({ venue: venue.name, chainId: venue.chainId }, "Registered SolidlyV2 adapter");
    } else if (venue.protocol === "algebra_v1") {
      const knownPools = await prisma.pool.findMany({
        where: { venueId: venue.id, isActive: true },
        select: { poolAddress: true },
      });
      registry.register(
        AlgebraV1Adapter.fromVenue(
          chainClient as any,
          {
            id: venue.id,
            name: venue.name,
            chainId: venue.chainId,
            factoryAddress: venue.factoryAddress,
            routerAddress: venue.routerAddress,
          },
          knownPools.map((p: { poolAddress: string }) => p.poolAddress),
        )
      );
      logger.info({ venue: venue.name, chainId: venue.chainId, pools: knownPools.length }, "Registered AlgebraV1 adapter");
    }
  }

  if (registry.getAll().length === 0) {
    if (config.NODE_ENV === "production") {
      logger.error("No adapters registered from DB in production — refusing to use mock adapters. Check venue/pool seed data and RPC connectivity.");
    } else {
      logger.warn("No adapters registered from DB — falling back to mock adapters (dev only)");
      const mockPoolA = MockDexAdapter.makePool({
        token0: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
        token1: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
        token0Symbol: "USDC",
        token1Symbol: "WAVAX",
        token0Decimals: 6,
        token1Decimals: 18,
        venueId: "mock-pangolin",
        venueName: "Pangolin",
        chainId: 43114,
        price0Per1: 10.0,
        price1Per0: 0.1,
        feeBps: 30,
        liquidityUsd: 500_000,
      });
      const mockPoolB = MockDexAdapter.makePool({
        token0: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
        token1: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
        token0Symbol: "USDC",
        token1Symbol: "WAVAX",
        token0Decimals: 6,
        token1Decimals: 18,
        venueId: "mock-traderjoe",
        venueName: "Trader Joe",
        chainId: 43114,
        price0Per1: 10.15,
        price1Per0: 0.0985,
        feeBps: 30,
        liquidityUsd: 500_000,
      });
      const mockPoolC = MockDexAdapter.makePool({
        token0: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
        token1: "0xef282b38d1ceab52134ca2cc653a569435744687",
        token0Symbol: "USDC",
        token1Symbol: "WRP",
        token0Decimals: 6,
        token1Decimals: 18,
        venueId: "mock-pangolin",
        venueName: "Pangolin",
        chainId: 43114,
        price0Per1: 0.042,
        price1Per0: 23.81,
        feeBps: 30,
        liquidityUsd: 200_000,
      });
      const mockPoolD = MockDexAdapter.makePool({
        token0: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
        token1: "0xef282b38d1ceab52134ca2cc653a569435744687",
        token0Symbol: "USDC",
        token1Symbol: "WRP",
        token0Decimals: 6,
        token1Decimals: 18,
        venueId: "mock-traderjoe",
        venueName: "Trader Joe",
        chainId: 43114,
        price0Per1: 0.0435,
        price1Per0: 22.99,
        feeBps: 30,
        liquidityUsd: 200_000,
      });
      registry.register(new MockDexAdapter("mock-pangolin", "Pangolin", 43114, [mockPoolA, mockPoolC]));
      registry.register(new MockDexAdapter("mock-traderjoe", "Trader Joe", 43114, [mockPoolB, mockPoolD]));
    }
  }
}

// ── Risk engine ───────────────────────────────────────────────────────────────
const defaultRiskConfig = RiskConfigSchema.parse({
  baseTradeSizeUsd: config.DEFAULT_MAX_TRADE_SIZE_USD,
  maxTradeSizeUsd: config.DEFAULT_MAX_TRADE_SIZE_USD,
  minNetProfitUsd: config.DEFAULT_MIN_NET_PROFIT_USD,
  maxGasGwei: config.DEFAULT_MAX_GAS_GWEI,
  minPoolLiquidityUsd: Math.min(config.DEFAULT_MIN_POOL_LIQUIDITY_USD, 5_000),
});

async function loadLiveRiskConfig() {
  try {
    const overrides = await prisma.configOverride.findMany();
    const overrideMap = Object.fromEntries(
      overrides
        .filter((o: { key: string; value: string }) => !o.key.startsWith("execution_wallet"))
        .map((o: { key: string; value: string }) => [o.key, JSON.parse(o.value)])
    );
    return RiskConfigSchema.parse({ ...defaultRiskConfig, ...overrideMap });
  } catch (err) {
    logger.warn({ err }, "Failed to load live risk config, using defaults");
    return defaultRiskConfig;
  }
}

const riskEngine = new RiskEngine(connection, prisma, defaultRiskConfig);
const regimeClassifier = new RegimeClassifier(prisma);

// ── Accumulation + Conversion engines ────────────────────────────────────
const accumulationEngine = new AccumulationEngine(prisma);
const conversionEngine = new ConversionEngine(prisma, accumulationEngine);

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

// ── Target tokens loaded dynamically each refresh cycle ──────────────────────

// ── V3 pool state cache ──────────────────────────────────────────────────────
import type { V3PoolState, TickData } from "@arbitex/shared-types";

const v3PoolCache = new Map<string, { state: V3PoolState; ticks: TickData[]; ts: number }>();
let lpWatcherHandle: WatcherHandle | null = null;

async function refreshV3PoolStates() {
  const v3Venues = await prisma.venue.findMany({
    where: { chainId: config.CHAIN_ID, isEnabled: true, protocol: { in: ["uniswap_v3", "algebra_v1"] } },
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

// Pool refresh → opportunity scoring (regime-aware)
const POOL_REFRESH_TIMEOUT_MS = 120_000;

const poolRefreshWorker = new Worker(
  "pool-refresh",
  async (job: Job) => {
    const start = Date.now();
    logger.info({ jobId: job.id }, "pool-refresh start");

    const refreshJob = async () => {
      const nativePriceUsd = await fetchNativeTokenPriceUsd();
      const targetTokens = await loadTargetTokens();

      regimeClassifier.setTrackedTokens(targetTokens);
      const regime = await regimeClassifier.classify();
      const { sizeMultiplier, algorithm } = regime.config;

      if (algorithm === "HALTED") {
        logger.info({ regime: regime.regime, signals: regime.signals }, "Regime HALTED — skipping opportunity scan");
        return;
      }

      const liveConfig = await loadLiveRiskConfig();
      riskEngine.updateConfig(liveConfig);

      const adjustedTradeSize = liveConfig.baseTradeSizeUsd * sizeMultiplier;
      const { hurdleBps } = regime.config;
      const hurdleMinProfitUsd = (hurdleBps / 10_000) * adjustedTradeSize;
      const adjustedMinProfit = Math.max(liveConfig.minNetProfitUsd, hurdleMinProfitUsd);

      const adjustedRiskConfig = {
        ...liveConfig,
        minNetProfitUsd: adjustedMinProfit,
        maxTradeSizeUsd: adjustedTradeSize,
      };

      const candidates = await opportunityEngine.scanForOpportunities({
        targetTokens,
        tradeSizeUsd: adjustedTradeSize,
        ethPriceUsd: nativePriceUsd,
        riskConfig: adjustedRiskConfig,
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
      logger.info(
        {
          count: candidates.length,
          v3Pools: v3PoolCache.size,
          regime: regime.regime,
          sizeMultiplier,
          dexScreenerLiq: regime.signals.dexScreenerLiquidityUsd,
          dexScreenerVol: regime.signals.dexScreenerVolume24h,
          winRate: regime.signals.winRate,
          topConfidence: candidates[0]?.confidenceScore?.toFixed(2) ?? "N/A",
          elapsed: Date.now() - start,
        },
        "Opportunities queued (Trading Brain V2)",
      );
    };

    try {
      await Promise.race([
        refreshJob(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("pool-refresh timeout")), POOL_REFRESH_TIMEOUT_MS),
        ),
      ]);
    } catch (err: any) {
      logger.warn({ err: err?.message, elapsed: Date.now() - start }, "pool-refresh cycle incomplete");
    }
  },
  workerOpts
);

// Opportunity scoring → risk check → execution queue
const opportunityScoreWorker = new Worker(
  "opportunity-score",
  async (job: Job) => {
    const liveRisk = await loadLiveRiskConfig();
    await processOpportunityJob(job, { riskEngine, prisma, queues, riskConfig: liveRisk, chainClient });
  },
  { ...workerOpts, concurrency: 5 }
);

// Execution worker — concurrency 1 to prevent nonce conflicts
const executionWorker = new Worker(
  "execution",
  async (job: Job) => {
    const liveRisk = await loadLiveRiskConfig();
    await processExecutionJob(job, {
      chainClient,
      registry,
      riskEngine,
      prisma,
      connection,
      riskConfig: liveRisk,
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

// Liquidity scan — long-running, lower concurrency
const liquidityScanWorker = new Worker(
  "liquidity-scan",
  async (job: Job) => {
    await processLiquidityScanJob(job, {
      chainClient: chainClient as any,
      prisma,
      chainId: config.CHAIN_ID,
    });
  },
  { ...workerOpts, concurrency: 1, limiter: { max: 1, duration: 5000 } }
);

// ── Conversion evaluation worker ─────────────────────────────────────────────
const conversionWorker = new Worker(
  "conversion-eval",
  async (job: Job) => {
    logger.info({ jobId: job.id }, "Conversion evaluation start");

    const regime = await regimeClassifier.classify();
    const extConfig = EXTENDED_REGIME_CONFIGS[regime.regime];

    const signals = await fetchMarketSignals();
    const decision = await conversionEngine.evaluate(
      signals,
      extConfig,
      signals.wrpPriceUsd ?? 0.0061,
    );

    const explanation = buildExplanation(decision, signals);

    logger.info(
      {
        direction: decision.direction,
        state: decision.conversionState,
        approved: decision.approved,
        scoreWRP: decision.scoreWRP.toFixed(1),
        scoreAVAX: decision.scoreAVAX.toFixed(1),
        scoreDelta: decision.scoreDelta.toFixed(1),
        proposedSizeUsd: decision.proposedSizeUsd.toFixed(2),
        blockedReasons: decision.blockedReasons,
      },
      "Conversion decision produced",
    );

    await Promise.all([
      prisma.configOverride.upsert({
        where: { key: "conversion_latest_decision" },
        update: { value: JSON.stringify(decision) },
        create: { key: "conversion_latest_decision", value: JSON.stringify(decision), updatedBy: "system:worker" },
      }),
      prisma.configOverride.upsert({
        where: { key: "conversion_latest_explanation" },
        update: { value: JSON.stringify(explanation) },
        create: { key: "conversion_latest_explanation", value: JSON.stringify(explanation), updatedBy: "system:worker" },
      }),
      prisma.configOverride.upsert({
        where: { key: "market_signals_latest" },
        update: { value: JSON.stringify(signals) },
        create: { key: "market_signals_latest", value: JSON.stringify(signals), updatedBy: "system:worker" },
      }),
    ]);
  },
  { ...workerOpts, concurrency: 1 },
);

// ── Operation state helpers ──────────────────────────────────────────────────
const KILL_SWITCH_KEY = "arbitex:risk:kill:GLOBAL";
let lastKnownKillState = true; // assume paused until we check

async function isOperationActive(): Promise<boolean> {
  const val = await connection.get(KILL_SWITCH_KEY);
  return val !== "1";
}

// ── Liquidity map scheduler (60 min, pause-aware, refresh-on-activate) ───────
const LIQUIDITY_REFRESH_INTERVAL = 60 * 60_000; // 60 minutes
let liquidityRefreshTimer: ReturnType<typeof setInterval> | null = null;

async function triggerLiquidityScan(reason: string, mode: "full" | "quick" = "quick") {
  logger.info({ reason, mode }, "Triggering liquidity map scan");
  await queues.liquidityScan.add(
    "scan",
    { reason, mode },
    { jobId: `liq-${Date.now()}`, removeOnComplete: 5, removeOnFail: false, attempts: 1 },
  );
}

async function startLiquidityScheduler() {
  const active = await isOperationActive();
  lastKnownKillState = !active;

  if (active) {
    // Full scan when no maps exist yet; quick refresh otherwise
    const existingCount = await prisma.liquidityMap.count();
    const startupMode = existingCount > 0 ? "quick" : "full";
    await triggerLiquidityScan("startup", startupMode);
  } else {
    logger.info("Operation paused at startup — skipping initial liquidity scan");
  }

  // Poll every 30 s: detect activation transitions and 60-min refresh cycles
  liquidityRefreshTimer = setInterval(async () => {
    try {
      const active = await isOperationActive();
      const wasKilled = lastKnownKillState;
      lastKnownKillState = !active;

      if (!active) return;

      // Paused → active transition: full scan for guaranteed consistency
      if (wasKilled) {
        logger.info("Operation activated — triggering full liquidity refresh");
        await triggerLiquidityScan("activation", "full");
        return;
      }

      // Regular 60-min quick refresh cycle
      const lastRefresh = await prisma.liquidityMap.findFirst({
        orderBy: { refreshedAt: "desc" },
        select: { refreshedAt: true },
      });

      const sinceLastRefresh = lastRefresh
        ? Date.now() - lastRefresh.refreshedAt.getTime()
        : Infinity;

      if (sinceLastRefresh >= LIQUIDITY_REFRESH_INTERVAL) {
        await triggerLiquidityScan("scheduled-60min", "quick");
      }
    } catch (err) {
      logger.error({ err }, "Liquidity scheduler tick failed");
    }
  }, 30_000);
}

// ── Cron schedulers ───────────────────────────────────────────────────────────
async function startSchedulers() {
  // Pool refresh every 10 seconds
  await queues.poolRefresh.add(
    "refresh-all",
    {},
    { repeat: { every: 50_000 }, removeOnComplete: 10, removeOnFail: false }
  );

  // Balance sync every 60 seconds
  await queues.balanceSync.add(
    "sync",
    {},
    { repeat: { every: 60_000 }, removeOnComplete: 5, removeOnFail: false }
  );

  // Conversion evaluation every 60 seconds
  await queues.conversion.add(
    "evaluate",
    {},
    { repeat: { every: 60_000 }, removeOnComplete: 10, removeOnFail: false }
  );

  // Liquidity map scheduler (60 min, pause-aware)
  await startLiquidityScheduler();

  // Opportunity cleanup every 10 minutes — expire stale opportunities older than 5 min
  setInterval(async () => {
    const fiveMinAgo = new Date(Date.now() - 300_000);
    await prisma.opportunity.updateMany({
      where: {
        state: { in: [OpportunityState.DETECTED, OpportunityState.QUOTED] },
        detectedAt: { lt: fiveMinAgo },
      },
      data: { state: OpportunityState.EXPIRED },
    });
  }, 600_000);
}

// ── Error handling ────────────────────────────────────────────────────────────
for (const [name, worker] of [
  ["pool-refresh", poolRefreshWorker],
  ["opportunity-score", opportunityScoreWorker],
  ["execution", executionWorker],
  ["balance-sync", balanceSyncWorker],
  ["liquidity-scan", liquidityScanWorker],
  ["conversion-eval", conversionWorker],
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

  try {
    await Promise.race([
      refreshV3PoolStates(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("V3 pool refresh timed out")), 30_000)),
    ]);
    startLPWatcher();
  } catch (err) {
    logger.warn({ err }, "V3 pool initial refresh failed — continuing without cached V3 state");
  }

  await startSchedulers();
  logger.info({ v3Pools: v3PoolCache.size }, "Worker started — opportunity engine running");

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received — shutting down workers");
    lpWatcherHandle?.stop();
    if (liquidityRefreshTimer) clearInterval(liquidityRefreshTimer);
    await Promise.allSettled([
      poolRefreshWorker.close(),
      opportunityScoreWorker.close(),
      executionWorker.close(),
      balanceSyncWorker.close(),
      liquidityScanWorker.close(),
      conversionWorker.close(),
    ]);
    await prisma.$disconnect();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error(err, "Worker fatal error");
  process.exit(1);
});
