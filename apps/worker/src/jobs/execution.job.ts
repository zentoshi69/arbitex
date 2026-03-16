import type { Job } from "bullmq";
import type { PrismaClient } from "@arbitex/db";
import type { RiskEngine } from "@arbitex/risk-engine";
import type { AdapterRegistry } from "@arbitex/dex-adapters";
import type { RiskConfig } from "@arbitex/shared-types";
import type { ArbitexPublicClient } from "@arbitex/chain";
import { NonceManager, loadWalletFromKeystore, createMockWallet } from "@arbitex/chain";
import { ExecutionEngine, RouteSimulator } from "@arbitex/execution-engine";
import type Redis from "ioredis";
import { config } from "@arbitex/config";
import { pino } from "pino";

const logger = pino();

type JobDeps = {
  chainClient: ArbitexPublicClient;
  registry: AdapterRegistry;
  riskEngine: RiskEngine;
  prisma: PrismaClient;
  connection: Redis;
  riskConfig: RiskConfig;
  mockExecution: boolean;
};

export async function processExecutionJob(
  job: Job,
  deps: JobDeps
): Promise<void> {
  const { opportunityId, candidate } = job.data;
  const { chainClient, registry, prisma, connection, riskConfig, mockExecution } = deps;

  logger.info({ opportunityId, jobId: job.id }, "Execution job started");

  // Load wallet
  const wallet = mockExecution
    ? createMockWallet("0x1234567890123456789012345678901234567890")
    : await loadWalletFromKeystore({
        keystorePath: config.EXECUTION_WALLET_KEYSTORE_PATH!,
        keystorePassword: config.EXECUTION_WALLET_KEYSTORE_PASS!,
        rpcUrl: config.ETHEREUM_RPC_URL,
        chainId: config.CHAIN_ID,
      });

  const nonceManager = new NonceManager(connection, chainClient);
  const adapterMap = new Map(
    registry.getAll().map((a) => [a.venueId, a])
  );
  const simulator = new RouteSimulator(chainClient as any, adapterMap);

  const engine = new ExecutionEngine(
    wallet,
    chainClient as any,
    nonceManager,
    simulator,
    prisma,
    connection
  );

  try {
    await engine.execute({
      opportunityId,
      fingerprint: candidate.fingerprint,
      routes: candidate.routes,
      buyPool: candidate.buyPool,
      sellPool: candidate.sellPool,
      profitBreakdown: candidate.profitBreakdown,
      adapters: adapterMap,
      riskConfig,
      mockExecution,
    });

    // Record success for risk metrics
    await deps.riskEngine.recordSuccessfulTx(candidate.buyPool.chainId);
    logger.info({ opportunityId }, "Execution completed");
  } catch (err) {
    // Record failure for risk metrics
    await deps.riskEngine.recordFailedTx(candidate.buyPool.chainId);
    logger.error({ opportunityId, err }, "Execution failed");
    throw err; // BullMQ will handle retry
  }
}
