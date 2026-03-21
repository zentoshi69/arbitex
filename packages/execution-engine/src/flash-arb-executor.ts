/**
 * FlashArb Executor — builds and submits flash-loan arbitrage
 * transactions to the FlashArb smart contract.
 *
 * Supports both V2-style and V3-style DEX legs. Uses Aave V3
 * flash loans on Avalanche for zero-capital arbitrage.
 */

import {
  type PublicClient,
  encodeFunctionData,
  parseAbi,
  type Hex,
} from "viem";
import type { Redis } from "ioredis";
import type {
  NormalizedPool,
  ProfitBreakdown,
  RouteStep,
  Address,
} from "@arbitex/shared-types";
import {
  ExecutionState,
  ErrorCode,
  ArbitexError,
} from "@arbitex/shared-types";
import type { WalletAbstraction, NonceManager } from "@arbitex/chain";

// ── ABI fragments ────────────────────────────────────────────────────────────

const FLASH_ARB_ABI = parseAbi([
  "function executeArb(address asset, uint256 amount, (uint8 dexType, address router, address tokenIn, address tokenOut, uint24 fee, uint256 amountOutMin, address[] v2Path) buyLeg, (uint8 dexType, address router, address tokenIn, address tokenOut, uint24 fee, uint256 amountOutMin, address[] v2Path) sellLeg) external",
  "function owner() view returns (address)",
  "event ArbExecuted(address indexed asset, uint256 borrowed, uint256 profit, address buyRouter, address sellRouter)",
]);

const ARB_EXECUTED_TOPIC =
  "0x" as const; // filled by parseAbi event selector

enum DexType {
  V2 = 0,
  V3 = 1,
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface FlashArbConfig {
  flashArbAddress: `0x${string}`;
  aavePoolProvider: `0x${string}`;
}

export interface FlashArbInput {
  opportunityId: string;
  fingerprint: string;
  asset: Address;
  assetDecimals: number;
  amount: string;
  buyStep: RouteStep;
  sellStep: RouteStep;
  buyRouterAddress: `0x${string}`;
  sellRouterAddress: `0x${string}`;
  buyPool: NormalizedPool;
  sellPool: NormalizedPool;
  profitBreakdown: ProfitBreakdown;
  nativeTokenPriceUsd: number;
  mockExecution?: boolean;
}

interface SwapLegTuple {
  dexType: number;
  router: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  fee: number;
  amountOutMin: bigint;
  v2Path: `0x${string}`[];
}

type ExecutionRecord = { id: string };

interface ExecutionDb {
  execution: {
    create(args: { data: Record<string, unknown> }): Promise<ExecutionRecord>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<unknown>;
  };
  transaction: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

// ── Executor ─────────────────────────────────────────────────────────────────

export class FlashArbExecutor {
  constructor(
    private readonly wallet: WalletAbstraction,
    private readonly client: PublicClient,
    private readonly nonceManager: NonceManager,
    private readonly db: ExecutionDb,
    private readonly redis: Redis,
    private readonly cfg: FlashArbConfig
  ) {}

  /**
   * Verify the FlashArb contract is deployed and owned by our wallet.
   */
  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const owner = await this.client.readContract({
        address: this.cfg.flashArbAddress,
        abi: FLASH_ARB_ABI,
        functionName: "owner",
      });
      const isOwner =
        (owner as string).toLowerCase() === this.wallet.address.toLowerCase();
      return isOwner
        ? { ok: true }
        : { ok: false, detail: `Owner mismatch: ${owner}` };
    } catch (err) {
      return { ok: false, detail: `Contract unreachable: ${err}` };
    }
  }

  /**
   * Execute a flash-loan arbitrage trade.
   */
  async execute(input: FlashArbInput): Promise<{
    executionId: string;
    txHash: string | null;
    profit: string | null;
    state: string;
  }> {
    const executionId = await this.createRecord(input.opportunityId);

    try {
      // ── 1. Dedup ───────────────────────────────────────────────────────
      const dedupKey = `arbitex:flash:dedup:${input.fingerprint}`;
      const acquired = await this.redis.set(dedupKey, "1", "EX", 15, "NX");
      if (acquired === null) {
        await this.fail(executionId, "Duplicate flash arb in 15s window", ErrorCode.DUPLICATE_OPPORTUNITY);
        return { executionId, txHash: null, profit: null, state: ExecutionState.FAILED };
      }

      // ── 2. Build swap legs ─────────────────────────────────────────────
      await this.updateState(executionId, ExecutionState.SIMULATING);

      const buyLeg = this.buildSwapLeg(input.buyStep, input.buyPool, input.buyRouterAddress);
      const sellLeg = this.buildSwapLeg(input.sellStep, input.sellPool, input.sellRouterAddress);

      // ── 3. Encode calldata ─────────────────────────────────────────────
      const calldata = encodeFunctionData({
        abi: FLASH_ARB_ABI,
        functionName: "executeArb",
        args: [
          input.asset as `0x${string}`,
          BigInt(input.amount),
          buyLeg,
          sellLeg,
        ],
      });

      // ── 4. Simulate ────────────────────────────────────────────────────
      try {
        await this.client.estimateGas({
          account: this.wallet.address,
          to: this.cfg.flashArbAddress,
          data: calldata,
        });
      } catch (simErr) {
        await this.fail(
          executionId,
          `Flash arb simulation reverted: ${simErr}`,
          ErrorCode.SIMULATION_FAILED
        );
        return { executionId, txHash: null, profit: null, state: ExecutionState.FAILED };
      }

      // ── 5. Mock path ──────────────────────────────────────────────────
      if (input.mockExecution) {
        const mockHash = `0x${"fa".repeat(32)}`;
        await this.updateState(executionId, ExecutionState.LANDED);
        await this.db.execution.update({
          where: { id: executionId },
          data: {
            txHash: mockHash,
            pnlUsd: input.profitBreakdown.netProfitUsd,
            confirmedAt: new Date(),
          },
        });
        return {
          executionId,
          txHash: mockHash,
          profit: input.profitBreakdown.netProfitUsd.toFixed(4),
          state: ExecutionState.LANDED,
        };
      }

      // ── 6. Submit transaction ──────────────────────────────────────────
      await this.updateState(executionId, ExecutionState.SIGNING);
      const { nonce, release } = await this.nonceManager.acquireNonce(
        this.wallet.address
      );

      let txHash: string;
      try {
        const gasPrice = await this.client.getGasPrice();
        const priorityPrice = (gasPrice * 115n) / 100n;

        const gasEstimate = await this.client.estimateGas({
          account: this.wallet.address,
          to: this.cfg.flashArbAddress,
          data: calldata,
        });

        txHash = await this.wallet.sendTransaction({
          to: this.cfg.flashArbAddress,
          data: calldata,
          value: 0n,
          gas: (gasEstimate * 130n) / 100n,
          gasPrice: priorityPrice,
          nonce,
        }) as string;

        await this.db.execution.update({
          where: { id: executionId },
          data: { txHash, submittedAt: new Date() },
        });
        await this.db.transaction.create({
          data: { executionId, nonce, rawTx: txHash, submittedAt: new Date() },
        });
        await release();
      } catch (err) {
        await release().catch(() => {});
        await this.fail(
          executionId,
          `Flash arb tx submission failed: ${err}`,
          ErrorCode.TX_SUBMISSION_FAILED
        );
        return { executionId, txHash: null, profit: null, state: ExecutionState.FAILED };
      }

      // ── 7. Wait for confirmation ──────────────────────────────────────
      await this.updateState(executionId, ExecutionState.CONFIRMING);
      const receipt = await this.client.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
        timeout: 45_000,
        confirmations: 1,
      });

      if (receipt.status !== "success") {
        await this.fail(
          executionId,
          `Flash arb reverted on-chain: ${txHash}`,
          ErrorCode.TX_REVERTED
        );
        return { executionId, txHash, profit: null, state: ExecutionState.FAILED };
      }

      // ── 8. Parse profit from ArbExecuted event ────────────────────────
      let profitRaw = 0n;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === this.cfg.flashArbAddress.toLowerCase()) {
          try {
            if (log.data.length >= 130) {
              profitRaw = BigInt("0x" + log.data.slice(66, 130));
            }
          } catch {
            // skip unparseable logs
          }
        }
      }

      // Convert raw profit (in asset's native decimals) to USD
      const assetDecimals = input.assetDecimals || 18;
      const profitInAssetUnits = Number(profitRaw) / 10 ** assetDecimals;
      // Derive a rough asset price from the opportunity's trade size and amount
      const assetAmountBorrowed = Number(BigInt(input.amount)) / 10 ** assetDecimals;
      const assetPriceUsd =
        assetAmountBorrowed > 0
          ? input.profitBreakdown.grossSpreadUsd / ((Math.abs(input.buyPool.price0Per1 - input.sellPool.price0Per1) / input.buyPool.price0Per1) || 1) / assetAmountBorrowed
          : 1;
      const actualPnlUsd = profitInAssetUnits * assetPriceUsd;

      // Convert gas cost from native token (AVAX) to USD
      const gasCostWei =
        receipt.gasUsed * (receipt.effectiveGasPrice ?? 0n);
      const gasCostNative = Number(gasCostWei) / 1e18;
      const gasCostUsd = gasCostNative * input.nativeTokenPriceUsd;

      await this.updateState(executionId, ExecutionState.LANDED);
      await this.db.execution.update({
        where: { id: executionId },
        data: {
          blockNumber: Number(receipt.blockNumber),
          gasUsed: receipt.gasUsed.toString(),
          gasCostUsd,
          pnlUsd: actualPnlUsd,
          confirmedAt: new Date(),
        },
      });

      return {
        executionId,
        txHash,
        profit: actualPnlUsd.toFixed(4),
        state: ExecutionState.LANDED,
      };
    } catch (err) {
      await this.fail(executionId, String(err), ErrorCode.TX_SUBMISSION_FAILED);
      return { executionId, txHash: null, profit: null, state: ExecutionState.FAILED };
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private buildSwapLeg(
    step: RouteStep,
    pool: NormalizedPool,
    routerAddress: `0x${string}`
  ): SwapLegTuple {
    const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
    if (
      !routerAddress ||
      routerAddress === "0x" ||
      routerAddress === ZERO_ADDR
    ) {
      throw new ArbitexError(
        ErrorCode.SIMULATION_FAILED,
        `Invalid router address "${routerAddress}" for venue ${step.venueName} — aborting to prevent gas burn`
      );
    }

    const rawAmountOut = BigInt(step.amountOut ?? "0");
    const amountOutMin = (rawAmountOut * 95n) / 100n; // 5% max slippage
    if (amountOutMin === 0n) {
      throw new ArbitexError(
        ErrorCode.SIMULATION_FAILED,
        `Zero amountOutMin for ${step.tokenIn}→${step.tokenOut} — refusing to swap with no slippage protection`
      );
    }

    const isV3 =
      pool.sqrtPriceX96 !== undefined && pool.sqrtPriceX96 !== null;

    if (isV3) {
      return {
        dexType: DexType.V3,
        router: routerAddress,
        tokenIn: step.tokenIn as `0x${string}`,
        tokenOut: step.tokenOut as `0x${string}`,
        fee: pool.feeBps * 100,
        amountOutMin,
        v2Path: [],
      };
    }

    return {
      dexType: DexType.V2,
      router: routerAddress,
      tokenIn: step.tokenIn as `0x${string}`,
      tokenOut: step.tokenOut as `0x${string}`,
      fee: 0,
      amountOutMin,
      v2Path: [step.tokenIn as `0x${string}`, step.tokenOut as `0x${string}`],
    };
  }

  private async createRecord(opportunityId: string): Promise<string> {
    const rec = await this.db.execution.create({
      data: {
        opportunityId,
        state: ExecutionState.PENDING,
        walletAddress: this.wallet.address,
        isFlashArb: true,
      },
    });
    return rec.id;
  }

  private async updateState(id: string, state: string): Promise<void> {
    await this.db.execution.update({
      where: { id },
      data: { state, updatedAt: new Date() },
    });
  }

  private async fail(
    id: string,
    reason: string,
    code: ErrorCode
  ): Promise<void> {
    await this.db.execution.update({
      where: { id },
      data: {
        state: ExecutionState.FAILED,
        failureReason: reason,
        failureCode: code,
        updatedAt: new Date(),
      },
    });
  }
}
