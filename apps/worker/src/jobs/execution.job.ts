import type { Job } from "bullmq";
import type { PrismaClient } from "@arbitex/db";
import type { RiskEngine } from "@arbitex/risk-engine";
import type { AdapterRegistry } from "@arbitex/dex-adapters";
import type { RiskConfig } from "@arbitex/shared-types";
import type { ArbitexPublicClient } from "@arbitex/chain";
import { NonceManager, loadWalletFromKeystore, createMockWallet } from "@arbitex/chain";
import { ExecutionEngine, RouteSimulator, FlashArbExecutor } from "@arbitex/execution-engine";
import type { Redis } from "ioredis";
import { config, getRpcConfig } from "@arbitex/config";
import { pino } from "pino";

const logger = pino();

const AVAX_PRICE_FALLBACK_USD = 25;

type JobDeps = {
  chainClient: ArbitexPublicClient;
  registry: AdapterRegistry;
  riskEngine: RiskEngine;
  prisma: PrismaClient;
  connection: Redis;
  riskConfig: RiskConfig;
  mockExecution: boolean;
};

async function fetchNativeTokenPriceUsd(redis: Redis): Promise<number> {
  try {
    const cached = await redis.get("arbitex:price:avax_usd");
    if (cached) return parseFloat(cached);
  } catch { /* fall through */ }
  return AVAX_PRICE_FALLBACK_USD;
}

export async function processExecutionJob(
  job: Job,
  deps: JobDeps
): Promise<void> {
  const { opportunityId, candidate } = job.data;
  const { chainClient, registry, prisma, connection, riskConfig, mockExecution } = deps;

  logger.info({ opportunityId, jobId: job.id }, "Execution job started");

  const wallet = mockExecution
    ? createMockWallet("0x1234567890123456789012345678901234567890")
    : await loadWalletFromKeystore({
        keystorePath: config.EXECUTION_WALLET_KEYSTORE_PATH!,
        keystorePassword: config.EXECUTION_WALLET_KEYSTORE_PASS!,
        rpcUrl: getRpcConfig(config.CHAIN_ID).rpcUrl,
        chainId: config.CHAIN_ID,
      });

  const nonceManager = new NonceManager(connection, chainClient);
  const adapterMap = new Map(
    registry.getAll().map((a) => [a.venueId, a])
  );

  const nativeTokenPriceUsd = await fetchNativeTokenPriceUsd(connection);

  const useFlashArb =
    candidate.isFlashArb === true && !!config.FLASH_ARB_ADDRESS;

  try {
    if (useFlashArb) {
      // ── Look up router addresses from DB ─────────────────────────────
      const [buyVenue, sellVenue] = await Promise.all([
        prisma.venue.findFirst({
          where: { name: { contains: candidate.buyPool.venueId } },
          select: { routerAddress: true },
        }),
        prisma.venue.findFirst({
          where: { name: { contains: candidate.sellPool.venueId } },
          select: { routerAddress: true },
        }),
      ]);

      if (!buyVenue?.routerAddress || !sellVenue?.routerAddress) {
        logger.error(
          { buyVenue: candidate.buyPool.venueId, sellVenue: candidate.sellPool.venueId },
          "Cannot resolve router addresses from DB — aborting flash arb"
        );
        return;
      }

      const flashExecutor = new FlashArbExecutor(
        wallet,
        chainClient as any,
        nonceManager,
        prisma,
        connection,
        {
          flashArbAddress: config.FLASH_ARB_ADDRESS as `0x${string}`,
          aavePoolProvider: config.AAVE_POOL_PROVIDER as `0x${string}`,
        }
      );

      const routes = candidate.routes;
      const result = await flashExecutor.execute({
        opportunityId,
        fingerprint: candidate.fingerprint,
        asset: routes[0].tokenIn,
        assetDecimals: candidate.buyPool.token0Decimals ?? 18,
        amount: routes[0].amountIn,
        buyStep: routes[0],
        sellStep: routes[1],
        buyRouterAddress: buyVenue.routerAddress as `0x${string}`,
        sellRouterAddress: sellVenue.routerAddress as `0x${string}`,
        buyPool: candidate.buyPool,
        sellPool: candidate.sellPool,
        profitBreakdown: candidate.profitBreakdown,
        nativeTokenPriceUsd,
        mockExecution,
      });

      logger.info(
        { opportunityId, txHash: result.txHash, profit: result.profit, state: result.state },
        "Flash arb execution completed"
      );
    } else {
      // ── Standard two-leg path ──────────────────────────────────────────
      const simulator = new RouteSimulator(chainClient as any, adapterMap);
      const engine = new ExecutionEngine(
        wallet,
        chainClient as any,
        nonceManager,
        simulator,
        prisma,
        connection
      );

      await engine.execute({
        opportunityId,
        fingerprint: candidate.fingerprint,
        routes: candidate.routes,
        buyPool: candidate.buyPool,
        sellPool: candidate.sellPool,
        profitBreakdown: candidate.profitBreakdown,
        adapters: adapterMap,
        riskConfig,
        nativeTokenPriceUsd,
        tradeSizeUsd: candidate.tradeSizeUsd ?? 5000,
        mockExecution,
      });
    }

    await deps.riskEngine.recordSuccessfulTx(candidate.buyPool.chainId);
    logger.info({ opportunityId, flashArb: useFlashArb }, "Execution completed");
  } catch (err) {
    await deps.riskEngine.recordFailedTx(candidate.buyPool.chainId);
    logger.error({ opportunityId, err }, "Execution failed");
    throw err;
  }
}
