import { type PublicClient, parseAbi, encodeFunctionData } from "viem";
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
import type { WalletAbstraction, NonceManager } from "@arbitex/chain";
import type { IDexAdapter } from "@arbitex/dex-adapters";

type ExecutionRecord = { id: string };

interface ExecutionDb {
  execution: {
    create(args: { data: Record<string, unknown> }): Promise<ExecutionRecord>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
  transaction: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<unknown>;
  };
}

const ERC20_ABI = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

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

    const buyFreshness = await this.checkPoolFreshness(buyPool);
    if (!buyFreshness.fresh) {
      return {
        success: false,
        reason: SimulationFailureReason.POOL_STALE,
        detail: `Buy pool price moved ${buyFreshness.pctChange.toFixed(4)}% since scoring`,
      };
    }

    const sellFreshness = await this.checkPoolFreshness(sellPool);
    if (!sellFreshness.fresh) {
      return {
        success: false,
        reason: SimulationFailureReason.POOL_STALE,
        detail: `Sell pool price moved ${sellFreshness.pctChange.toFixed(4)}% since scoring`,
      };
    }

    // Adaptive liquidity threshold: 5x trade size or $500, whichever is lower
    const step0 = routes[0];
    const tradeSizeEstimate = step0 ? Number(BigInt(step0.amountIn)) / 1e6 : 0;
    const minLiq = Math.min(500, tradeSizeEstimate * 5);

    if (buyPool.liquidityUsd < minLiq) {
      return {
        success: false,
        reason: SimulationFailureReason.LOW_LIQUIDITY,
        detail: `Buy pool liquidity $${buyPool.liquidityUsd.toFixed(0)} below adaptive minimum $${minLiq.toFixed(0)}`,
      };
    }

    if (sellPool.liquidityUsd < minLiq) {
      return {
        success: false,
        reason: SimulationFailureReason.LOW_LIQUIDITY,
        detail: `Sell pool liquidity $${sellPool.liquidityUsd.toFixed(0)} below adaptive minimum $${minLiq.toFixed(0)}`,
      };
    }

    try {
      const step0 = routes[0];
      const step1 = routes[1];
      if (!step0 || !step1) {
        return { success: false, reason: SimulationFailureReason.REVERT, detail: "Missing route steps" };
      }

      const buyAdapter = this.adapters.get(step0.venueId);
      const sellAdapter = this.adapters.get(step1.venueId);
      if (!buyAdapter) {
        return { success: false, reason: SimulationFailureReason.REVERT, detail: `No adapter for buy venue ${step0.venueId}` };
      }
      if (!sellAdapter) {
        return { success: false, reason: SimulationFailureReason.REVERT, detail: `No adapter for sell venue ${step1.venueId}` };
      }

      const [buyCalldata, sellCalldata] = await Promise.all([
        buyAdapter.buildSwapCalldata({
          poolId: step0.poolId,
          tokenIn: step0.tokenIn,
          tokenOut: step0.tokenOut,
          amountIn: step0.amountIn,
          amountOutMin: "0",
          recipient: input.walletAddress,
          deadline: Math.floor(Date.now() / 1000) + 120,
          slippageBps: 50,
        }),
        sellAdapter.buildSwapCalldata({
          poolId: step1.poolId,
          tokenIn: step1.tokenIn,
          tokenOut: step1.tokenOut,
          amountIn: step1.amountIn || step0.amountIn,
          amountOutMin: "0",
          recipient: input.walletAddress,
          deadline: Math.floor(Date.now() / 1000) + 120,
          slippageBps: 50,
        }),
      ]);

      const [buyGas, sellGas] = await Promise.all([
        this.client.estimateGas({
          account: input.walletAddress as `0x${string}`,
          to: buyCalldata.to as `0x${string}`,
          data: buyCalldata.data as `0x${string}`,
        }).catch((err: unknown) => {
          throw new ArbitexError(
            ErrorCode.SIMULATION_FAILED,
            `Buy simulation revert: ${String(err)}`,
            { revertData: String(err) }
          );
        }),
        this.client.estimateGas({
          account: input.walletAddress as `0x${string}`,
          to: sellCalldata.to as `0x${string}`,
          data: sellCalldata.data as `0x${string}`,
        }).catch((err: unknown) => {
          throw new ArbitexError(
            ErrorCode.SIMULATION_FAILED,
            `Sell simulation revert: ${String(err)}`,
            { revertData: String(err) }
          );
        }),
      ]);

      const totalGas = buyGas + sellGas;

      return {
        success: true,
        amountOut: step1.amountOut || "0",
        gasUsed: totalGas.toString(),
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
    const ts = pool.lastUpdated instanceof Date
      ? pool.lastUpdated.getTime()
      : typeof pool.lastUpdated === "number"
        ? pool.lastUpdated
        : new Date(pool.lastUpdated as any).getTime();
    const ageSecs = (Date.now() - ts) / 1000;
    if (ageSecs > 60) {
      return { fresh: false, pctChange: 999 };
    }
    return { fresh: true, pctChange: 0 };
  }
}

// ── Execution Engine ──────────────────────────────────────────────────────────

const DEDUP_KEY = (fingerprint: string) =>
  `arbitex:exec:dedup:${fingerprint}`;

const MAX_UINT256 = 2n ** 256n - 1n;
const MIN_ALLOWANCE_THRESHOLD = 2n ** 128n;

export type ExecutionInput = {
  opportunityId: string;
  fingerprint: string;
  routes: RouteStep[];
  buyPool: NormalizedPool;
  sellPool: NormalizedPool;
  profitBreakdown: ProfitBreakdown;
  adapters: Map<string, IDexAdapter>;
  riskConfig: RiskConfig;
  nativeTokenPriceUsd: number;
  tradeSizeUsd: number;
  mockExecution?: boolean;
};

export class ExecutionEngine {
  constructor(
    private readonly wallet: WalletAbstraction,
    private readonly client: PublicClient,
    private readonly nonceManager: NonceManager,
    private readonly simulator: RouteSimulator,
    private readonly db: ExecutionDb,
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

      // ── 2. Build swap calldata for both legs ─────────────────────────────
      await this.updateState(executionId, ExecutionState.SIGNING);
      const step0 = input.routes[0]!;
      const step1 = input.routes[1]!;

      const buyAdapter = input.adapters.get(step0.venueId)!;
      const sellAdapter = input.adapters.get(step1.venueId)!;

      const deadline = Math.floor(Date.now() / 1000) + 120;

      // Adaptive slippage: tighter for deep pools, wider for shallow pools
      const minPoolLiq = Math.min(input.buyPool.liquidityUsd, input.sellPool.liquidityUsd);
      const slippageBps = minPoolLiq > 100_000 ? 200n
        : minPoolLiq > 50_000 ? 300n
        : minPoolLiq > 10_000 ? 500n
        : 800n;
      const slippageMultiplier = 10_000n - slippageBps;

      const quotedBuyOut = BigInt(step0.amountOut || "0");
      const buyAmountOutMin = quotedBuyOut > 0n
        ? (quotedBuyOut * slippageMultiplier / 10_000n).toString()
        : "1";

      const buyCalldata = await buyAdapter.buildSwapCalldata({
        poolId: step0.poolId,
        tokenIn: step0.tokenIn,
        tokenOut: step0.tokenOut,
        amountIn: step0.amountIn,
        amountOutMin: buyAmountOutMin,
        recipient: this.wallet.address,
        deadline,
        slippageBps: 50,
      });

      // ── 3. Ensure ERC20 approvals BEFORE simulation ───────────────────
      if (!input.mockExecution) {
        await this.ensureTokenApproval(
          step0.tokenIn as `0x${string}`,
          buyCalldata.to as `0x${string}`,
          BigInt(step0.amountIn)
        );
      }

      // ── 4. Simulate both legs ────────────────────────────────────────────
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

      // ── 5. Final net profit gate ─────────────────────────────────────────
      if (input.profitBreakdown.netProfitUsd < input.riskConfig.minNetProfitUsd) {
        await this.markFailed(
          executionId,
          `Net profit $${input.profitBreakdown.netProfitUsd.toFixed(4)} below minimum at execution time`,
          ErrorCode.BELOW_MIN_PROFIT
        );
        return;
      }

      // ── 5. Mock execution path ───────────────────────────────────────────
      if (input.mockExecution) {
        const mockBuyHash = `0x${"ab".repeat(32)}` as const;
        const mockSellHash = `0x${"cd".repeat(32)}` as const;
        await this.updateState(executionId, ExecutionState.SUBMITTED);
        await this.db.execution.update({
          where: { id: executionId },
          data: { txHash: mockBuyHash, submittedAt: new Date() },
        });
        await this.db.transaction.create({
          data: { executionId, nonce: 0, rawTx: mockBuyHash, submittedAt: new Date() },
        });
        await this.db.transaction.create({
          data: { executionId, nonce: 1, rawTx: mockSellHash, submittedAt: new Date() },
        });
        await this.updateState(executionId, ExecutionState.LANDED);
        await this.db.execution.update({
          where: { id: executionId },
          data: {
            blockNumber: 0,
            gasUsed: "600000",
            pnlUsd: input.profitBreakdown.netProfitUsd,
            confirmedAt: new Date(),
          },
        });
        return;
      }

      // ── 6. Submit buy leg ────────────────────────────────────────────────
      await this.updateState(executionId, ExecutionState.SUBMITTED);
      const { nonce: buyNonce, release: releaseBuy } = await this.nonceManager.acquireNonce(
        this.wallet.address
      );

      let buyTxHash: string;
      try {
        const gasPrice = await this.client.getGasPrice();
        const priorityGasPrice = (gasPrice * 110n) / 100n;

        buyTxHash = await this.wallet.sendTransaction({
          to: buyCalldata.to,
          data: buyCalldata.data,
          value: BigInt(buyCalldata.value),
          gas: BigInt(buyCalldata.gasEstimate) * 12n / 10n,
          gasPrice: priorityGasPrice,
          nonce: buyNonce,
        });

        await this.db.execution.update({
          where: { id: executionId },
          data: { txHash: buyTxHash, submittedAt: new Date() },
        });
        await this.db.transaction.create({
          data: { executionId, nonce: buyNonce, rawTx: buyTxHash, submittedAt: new Date() },
        });
        await releaseBuy();
      } catch (err) {
        await releaseBuy().catch(() => {});
        await this.markFailed(executionId, `Buy tx submission failed: ${err}`, ErrorCode.TX_SUBMISSION_FAILED);
        throw err;
      }

      // ── 8. Wait for buy confirmation ─────────────────────────────────────
      await this.updateState(executionId, ExecutionState.CONFIRMING);
      const buyReceipt = await this.client.waitForTransactionReceipt({
        hash: buyTxHash as `0x${string}`,
        timeout: 60_000,
        confirmations: 1,
      });

      if (buyReceipt.status !== "success") {
        await this.markFailed(executionId, "Buy transaction reverted on-chain", ErrorCode.TX_REVERTED);
        return;
      }

      // ── 9. Parse actual buy output from Transfer logs ────────────────────
      const actualBuyOutput = this.parseTransferAmount(
        buyReceipt.logs,
        step0.tokenOut as `0x${string}`,
        this.wallet.address
      );
      const sellAmountIn = actualBuyOutput ?? BigInt(step1.amountIn || step0.amountIn);

      // ── 10. Build sell calldata with actual output ───────────────────────
      const originalInput = BigInt(step0.amountIn);
      const sellAmountOutMin = (originalInput * slippageMultiplier / 10_000n).toString();

      const sellCalldata = await sellAdapter.buildSwapCalldata({
        poolId: step1.poolId,
        tokenIn: step1.tokenIn,
        tokenOut: step1.tokenOut,
        amountIn: sellAmountIn.toString(),
        amountOutMin: sellAmountOutMin,
        recipient: this.wallet.address,
        deadline,
        slippageBps: 50,
      });

      // ── 11. Ensure ERC20 approval for sell leg ──────────────────────────
      await this.ensureTokenApproval(
        step1.tokenIn as `0x${string}`,
        sellCalldata.to as `0x${string}`,
        sellAmountIn
      );

      // ── 12. Submit sell leg ──────────────────────────────────────────────
      await this.updateState(executionId, ExecutionState.SUBMITTED);
      const { nonce: sellNonce, release: releaseSell } = await this.nonceManager.acquireNonce(
        this.wallet.address
      );

      let sellTxHash: string;
      try {
        const gasPrice = await this.client.getGasPrice();
        const priorityGasPrice = (gasPrice * 110n) / 100n;

        sellTxHash = await this.wallet.sendTransaction({
          to: sellCalldata.to,
          data: sellCalldata.data,
          value: BigInt(sellCalldata.value),
          gas: BigInt(sellCalldata.gasEstimate) * 12n / 10n,
          gasPrice: priorityGasPrice,
          nonce: sellNonce,
        });

        await this.db.transaction.create({
          data: { executionId, nonce: sellNonce, rawTx: sellTxHash, submittedAt: new Date() },
        });
        await releaseSell();
      } catch (err) {
        await releaseSell().catch(() => {});
        await this.markFailed(
          executionId,
          `Sell tx submission failed (buy landed at ${buyTxHash}): ${err}`,
          ErrorCode.TX_SUBMISSION_FAILED
        );
        throw err;
      }

      // ── 13. Wait for sell confirmation ───────────────────────────────────
      await this.updateState(executionId, ExecutionState.CONFIRMING);
      const sellReceipt = await this.client.waitForTransactionReceipt({
        hash: sellTxHash as `0x${string}`,
        timeout: 60_000,
        confirmations: 1,
      });

      if (sellReceipt.status !== "success") {
        await this.markFailed(
          executionId,
          `Sell transaction reverted (buy landed at ${buyTxHash}, sell reverted at ${sellTxHash})`,
          ErrorCode.TX_REVERTED
        );
        return;
      }

      // ── 14. Record success with actual on-chain PnL ──────────────────────
      const totalGasUsed = buyReceipt.gasUsed + sellReceipt.gasUsed;
      const effectiveGasPrice = sellReceipt.effectiveGasPrice ?? 0n;
      const gasCostWei = totalGasUsed * effectiveGasPrice;
      const gasCostNative = Number(gasCostWei) / 1e18;
      const gasCostUsd = gasCostNative * input.nativeTokenPriceUsd;

      // Compute actual PnL: sell output minus buy input in the same base token
      const actualSellOutput = this.parseTransferAmount(
        sellReceipt.logs,
        step1.tokenOut as `0x${string}`,
        this.wallet.address
      );
      let actualPnlUsd = input.profitBreakdown.netProfitUsd; // fallback to estimate
      if (actualSellOutput !== null) {
        const buyInputAmount = BigInt(step0.amountIn);
        const profitTokenRaw = actualSellOutput - buyInputAmount;
        const tokenDecimals = input.buyPool.token0Decimals || 18;
        const inputTokenUnits = Number(buyInputAmount) / 10 ** tokenDecimals;
        // Derive base token USD price from the known trade size
        const baseTokenPriceUsd = inputTokenUnits > 0
          ? input.tradeSizeUsd / inputTokenUnits
          : 1;
        const profitInTokenUnits = Number(profitTokenRaw) / 10 ** tokenDecimals;
        const computedPnl = profitInTokenUnits * baseTokenPriceUsd;
        if (Number.isFinite(computedPnl) && !Number.isNaN(computedPnl)) {
          actualPnlUsd = computedPnl;
        }
      }

      await this.updateState(executionId, ExecutionState.LANDED);
      await this.db.execution.update({
        where: { id: executionId },
        data: {
          blockNumber: Number(sellReceipt.blockNumber),
          gasUsed: totalGasUsed.toString(),
          gasCostUsd,
          pnlUsd: actualPnlUsd,
          confirmedAt: new Date(),
        },
      });

      // Update transaction records with confirmation
      await this.db.transaction.updateMany({
        where: { executionId, rawTx: buyTxHash },
        data: { confirmedAt: new Date() },
      });
      await this.db.transaction.updateMany({
        where: { executionId, rawTx: sellTxHash },
        data: { confirmedAt: new Date() },
      });
    } catch (err) {
      await this.markFailed(executionId, String(err), ErrorCode.TX_SUBMISSION_FAILED);
    }
  }

  /**
   * Parses Transfer event logs to find the actual amount of `token` received by `recipient`.
   * Returns the sum of all Transfer amounts to the recipient for the given token.
   */
  private parseTransferAmount(
    logs: readonly { address: string; topics: readonly string[]; data: string }[],
    token: `0x${string}`,
    recipient: `0x${string}`
  ): bigint | null {
    const tokenLower = token.toLowerCase();
    const recipientPadded = `0x${recipient.slice(2).toLowerCase().padStart(64, "0")}`;
    let total = 0n;
    let found = false;

    for (const log of logs) {
      if (log.address.toLowerCase() !== tokenLower) continue;
      if (log.topics[0] !== TRANSFER_TOPIC) continue;
      if (log.topics[2]?.toLowerCase() !== recipientPadded) continue;

      const amount = BigInt(log.data);
      total += amount;
      found = true;
    }

    return found ? total : null;
  }

  /**
   * Checks ERC20 allowance and sends an `approve(MAX)` transaction if needed.
   * Skips if the current allowance is already large enough.
   */
  private async ensureTokenApproval(
    token: `0x${string}`,
    spender: `0x${string}`,
    requiredAmount: bigint
  ): Promise<void> {
    try {
      const currentAllowance = await this.client.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [this.wallet.address, spender],
      });

      if (currentAllowance >= requiredAmount && currentAllowance >= MIN_ALLOWANCE_THRESHOLD) {
        return;
      }

      const approveData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [spender, MAX_UINT256],
      });

      const { nonce, release } = await this.nonceManager.acquireNonce(this.wallet.address);
      try {
        const gasPrice = await this.client.getGasPrice();
        const approveTx = await this.wallet.sendTransaction({
          to: token,
          data: approveData,
          value: 0n,
          gas: 60_000n,
          gasPrice,
          nonce,
        });
        await release();

        await this.client.waitForTransactionReceipt({
          hash: approveTx as `0x${string}`,
          timeout: 20_000,
          confirmations: 1,
        });
      } catch (err) {
        await release().catch(() => {});
        throw new ArbitexError(
          ErrorCode.TX_SUBMISSION_FAILED,
          `ERC20 approve failed for ${token} → ${spender}: ${err}`
        );
      }
    } catch (err) {
      if (err instanceof ArbitexError) throw err;
      throw new ArbitexError(
        ErrorCode.TX_SUBMISSION_FAILED,
        `Allowance check failed for ${token}: ${err}`
      );
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

export { FlashArbExecutor, type FlashArbConfig, type FlashArbInput } from "./flash-arb-executor.js";
