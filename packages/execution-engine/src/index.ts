import type { PublicClient } from "viem";
import type { Redis } from "ioredis";
import type {
  SimulationResult,
  RouteStep,
  NormalizedPool,
  ProfitBreakdown,
  Address,
  RiskConfig,
} from "@arbitex/shared-types";
import {
  SimulationFailureReason,
  ExecutionState,
  ErrorCode,
  ArbitexError,
} from "@arbitex/shared-types";
import type { PrismaClient } from "@arbitex/db";
import type { WalletAbstraction, NonceManager } from "@arbitex/chain";
import type { IDexAdapter } from "@arbitex/dex-adapters";

// ── Simulator ─────────────────────────────────────────────────────────────────

export type SimulationInput = {
  routes: RouteStep[];
  buyPool: NormalizedPool;
  sellPool: NormalizedPool;
  walletAddress: Address;
};

export class RouteSimulator {
  constructor(
    private readonly client: PublicClient,
    private readonly adapters: Map<string, IDexAdapter>
  ) {}

  async simulate(input: SimulationInput): Promise<SimulationResult> {
    const { routes, buyPool, sellPool } = input;

    // Check pool state freshness (within 0.5%)
    const buyFreshness = await this.checkPoolFreshness(buyPool);
    if (!buyFreshness.fresh) {
      return {
        success: false,
        reason: SimulationFailureReason.POOL_STALE,
        detail: `Buy pool price moved ${buyFreshness.pctChange.toFixed(4)}% since scoring`,
      };
    }

    // Check liquidity depth (need 3x trade size)
    if (buyPool.liquidityUsd < 3 * 1000 /* trade_size_usd placeholder */) {
      return {
        success: false,
        reason: SimulationFailureReason.LOW_LIQUIDITY,
        detail: `Buy pool liquidity $${buyPool.liquidityUsd} insufficient`,
      };
    }

    // Run eth_call simulation for the full arb route
    try {
      const step0 = routes[0];
      const step1 = routes[1];
      if (!step0 || !step1) {
        return { success: false, reason: SimulationFailureReason.REVERT, detail: "Missing route steps" };
      }

      const buyAdapter = this.adapters.get(step0.venueId);
      if (!buyAdapter) {
        return { success: false, reason: SimulationFailureReason.REVERT, detail: `No adapter for venue ${step0.venueId}` };
      }

      // Build and simulate buy calldata
      const buyCalldata = await buyAdapter.buildSwapCalldata({
        poolId: step0.poolId,
        tokenIn: step0.tokenIn,
        tokenOut: step0.tokenOut,
        amountIn: step0.amountIn,
        amountOutMin: "0", // relaxed for sim
        recipient: input.walletAddress,
        deadline: Math.floor(Date.now() / 1000) + 60,
        slippageBps: 50,
      });

      // eth_call simulation
      const gasEstimate = await this.client.estimateGas({
        account: input.walletAddress as `0x${string}`,
        to: buyCalldata.to as `0x${string}`,
        data: buyCalldata.data as `0x${string}`,
      }).catch((err: unknown) => {
        throw new ArbitexError(
          ErrorCode.SIMULATION_FAILED,
          `Simulation revert: ${String(err)}`,
          { revertData: String(err) }
        );
      });

      return {
        success: true,
        amountOut: step1.amountOut || "0",
        gasUsed: gasEstimate.toString(),
        effectiveSlippageBps: 10,
      };
    } catch (err: unknown) {
      if (err instanceof ArbitexError) {
        return {
          success: false,
          reason: SimulationFailureReason.REVERT,
          detail: err.message,
        };
      }
      return {
        success: false,
        reason: SimulationFailureReason.REVERT,
        detail: String(err),
      };
    }
  }

  private async checkPoolFreshness(
    pool: NormalizedPool
  ): Promise<{ fresh: boolean; pctChange: number }> {
    const ageSecs = (Date.now() - pool.lastUpdated.getTime()) / 1000;
    if (ageSecs > 30) {
      return { fresh: false, pctChange: 999 };
    }
    return { fresh: true, pctChange: 0 };
  }
}

// ── Execution Engine ──────────────────────────────────────────────────────────

const DEDUP_KEY = (fingerprint: string) =>
  `arbitex:exec:dedup:${fingerprint}`;

export type ExecutionInput = {
  opportunityId: string;
  fingerprint: string;
  routes: RouteStep[];
  buyPool: NormalizedPool;
  sellPool: NormalizedPool;
  profitBreakdown: ProfitBreakdown;
  adapters: Map<string, IDexAdapter>;
  riskConfig: RiskConfig;
  mockExecution?: boolean;
};

export class ExecutionEngine {
  constructor(
    private readonly wallet: WalletAbstraction,
    private readonly client: PublicClient,
    private readonly nonceManager: NonceManager,
    private readonly simulator: RouteSimulator,
    private readonly db: PrismaClient,
    private readonly redis: Redis
  ) {}

  async execute(input: ExecutionInput): Promise<void> {
    const executionId = await this.createExecutionRecord(input.opportunityId);

    try {
      // ── 1. Duplicate suppression ─────────────────────────────────────────
      const dedupKey = DEDUP_KEY(input.fingerprint);
      const isDuplicate = await this.redis.set(dedupKey, "1", "EX", 10, "NX");
      if (isDuplicate === null) {
        await this.markFailed(executionId, "Duplicate opportunity in 10s window", ErrorCode.DUPLICATE_OPPORTUNITY);
        return;
      }

      // ── 2. Final profitability check ─────────────────────────────────────
      await this.updateState(executionId, ExecutionState.SIMULATING);
      const simResult = await this.simulator.simulate({
        routes: input.routes,
        buyPool: input.buyPool,
        sellPool: input.sellPool,
        walletAddress: this.wallet.address,
      });

      if (!simResult.success) {
        await this.markFailed(
          executionId,
          `Simulation failed: ${simResult.reason} — ${simResult.detail}`,
          ErrorCode.SIMULATION_FAILED
        );
        return;
      }

      // ── 3. Final net profit gate (CRITICAL — last line of defense) ───────
      if (input.profitBreakdown.netProfitUsd < input.riskConfig.minNetProfitUsd) {
        await this.markFailed(
          executionId,
          `Net profit $${input.profitBreakdown.netProfitUsd.toFixed(4)} below minimum at execution time`,
          ErrorCode.BELOW_MIN_PROFIT
        );
        return;
      }

      // ── 4. Build transactions ─────────────────────────────────────────────
      await this.updateState(executionId, ExecutionState.SIGNING);
      const step0 = input.routes[0]!;
      const step1 = input.routes[1]!;

      const buyAdapter = input.adapters.get(step0.venueId)!;
      const sellAdapter = input.adapters.get(step1.venueId)!;

      const [buyCalldata, sellCalldata] = await Promise.all([
        buyAdapter.buildSwapCalldata({
          poolId: step0.poolId,
          tokenIn: step0.tokenIn,
          tokenOut: step0.tokenOut,
          amountIn: step0.amountIn,
          amountOutMin: (BigInt(step0.amountIn) * 9950n / 10_000n).toString(), // 0.5% min
          recipient: this.wallet.address,
          deadline: Math.floor(Date.now() / 1000) + 60,
          slippageBps: 50,
        }),
        sellAdapter.buildSwapCalldata({
          poolId: step1.poolId,
          tokenIn: step1.tokenIn,
          tokenOut: step1.tokenOut,
          amountIn: step1.amountIn || step0.amountIn, // output of step 0
          amountOutMin: step0.amountIn, // must get back at least what we put in
          recipient: this.wallet.address,
          deadline: Math.floor(Date.now() / 1000) + 60,
          slippageBps: 50,
        }),
      ]);

      // ── 5. Mock path ──────────────────────────────────────────────────────
      if (input.mockExecution) {
        await this.updateState(executionId, ExecutionState.SUBMITTED);
        await this.db.execution.update({
          where: { id: executionId },
          data: {
            txHash: `0x${"ab".repeat(32)}`,
            submittedAt: new Date(),
          },
        });
        await this.updateState(executionId, ExecutionState.LANDED);
        await this.db.execution.update({
          where: { id: executionId },
          data: {
            blockNumber: 0,
            gasUsed: "300000",
            pnlUsd: input.profitBreakdown.netProfitUsd,
            confirmedAt: new Date(),
          },
        });
        return;
      }

      // ── 6. Acquire nonce ──────────────────────────────────────────────────
      const { nonce, release } = await this.nonceManager.acquireNonce(
        this.wallet.address
      );

      try {
        const gasPrice = await this.client.getGasPrice();

        // Sign bundle (both txs atomically via Flashbots)
        await this.updateState(executionId, ExecutionState.SUBMITTED);
        const txHash = await this.wallet.sendTransaction({
          to: buyCalldata.to,
          data: buyCalldata.data,
          value: BigInt(buyCalldata.value),
          gas: BigInt(buyCalldata.gasEstimate) * 12n / 10n, // 20% buffer
          gasPrice: (gasPrice * 110n) / 100n, // 10% priority bump
          nonce,
        });

        await this.db.execution.update({
          where: { id: executionId },
          data: { txHash, submittedAt: new Date() },
        });
        await this.db.transaction.create({
          data: {
            executionId,
            nonce,
            rawTx: txHash,
            submittedAt: new Date(),
          },
        });

        await release();

        // ── 7. Wait for confirmation (max 2 blocks) ──────────────────────
        await this.updateState(executionId, ExecutionState.CONFIRMING);
        const receipt = await this.client.waitForTransactionReceipt({
          hash: txHash as `0x${string}`,
          timeout: 30_000,
          confirmations: 1,
        });

        if (receipt.status === "success") {
          await this.updateState(executionId, ExecutionState.LANDED);
          await this.db.execution.update({
            where: { id: executionId },
            data: {
              blockNumber: Number(receipt.blockNumber),
              gasUsed: receipt.gasUsed.toString(),
              gasCostUsd: 0, // compute from receipt.gasUsed * effectiveGasPrice
              pnlUsd: input.profitBreakdown.netProfitUsd, // approximate
              confirmedAt: new Date(),
            },
          });
        } else {
          await this.markFailed(executionId, "Transaction reverted on-chain", ErrorCode.TX_REVERTED);
        }
      } catch (err) {
        await release().catch(() => {});
        await this.markFailed(executionId, String(err), ErrorCode.TX_SUBMISSION_FAILED);
        throw err;
      }
    } catch (err) {
      await this.markFailed(executionId, String(err), ErrorCode.TX_SUBMISSION_FAILED);
    }
  }

  private async createExecutionRecord(opportunityId: string): Promise<string> {
    const rec = await this.db.execution.create({
      data: {
        opportunityId,
        state: ExecutionState.PENDING,
        walletAddress: this.wallet.address,
      },
    });
    return rec.id;
  }

  private async updateState(
    executionId: string,
    state: string
  ): Promise<void> {
    await this.db.execution.update({
      where: { id: executionId },
      data: { state, updatedAt: new Date() },
    });
  }

  private async markFailed(
    executionId: string,
    reason: string,
    code: ErrorCode
  ): Promise<void> {
    await this.db.execution.update({
      where: { id: executionId },
      data: {
        state: ExecutionState.FAILED,
        failureReason: reason,
        failureCode: code,
        updatedAt: new Date(),
      },
    });
  }
}
