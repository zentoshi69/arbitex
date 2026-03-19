import type { Redis } from "ioredis";
import type {
  RiskConfig,
  RiskDecision,
  NormalizedPool,
  ProfitBreakdown,
  Address,
  TokenFlag,
} from "@arbitex/shared-types";
import { RiskSeverity } from "@arbitex/shared-types";
import type { PrismaClient } from "@arbitex/db";

export type RiskEvaluationInput = {
  opportunityId: string;
  tokenIn: Address;
  tokenOut: Address;
  tradeSizeUsd: number;
  netProfitUsd: number;
  grossSpreadUsd: number;
  buyPool: NormalizedPool;
  sellPool: NormalizedPool;
  gasGwei: number;
  chainId: number;
  profitBreakdown: ProfitBreakdown;
};

type RuleResult = {
  rule: string;
  passed: boolean;
  detail?: string;
};

// Redis key helpers
const FAILED_TX_KEY = (chainId: number) =>
  `arbitex:risk:failed_tx:${chainId}`;
const TOKEN_EXPOSURE_KEY = (token: string) =>
  `arbitex:risk:exposure:${token.toLowerCase()}`;
const TOKEN_COOLDOWN_KEY = (token: string) =>
  `arbitex:risk:cooldown:${token.toLowerCase()}`;
const KILL_SWITCH_KEY = (key: string) =>
  `arbitex:risk:kill:${key.toUpperCase()}`;

export class RiskEngine {
  constructor(
    private readonly redis: Redis,
    private readonly db: PrismaClient,
    private readonly config: RiskConfig
  ) {}

  /**
   * Evaluate all risk rules for an opportunity.
   * Returns approved:false with reasons on first critical failure.
   * All rules are evaluated for observability (not short-circuit).
   */
  async evaluate(input: RiskEvaluationInput): Promise<RiskDecision> {
    const results: RuleResult[] = [];

    // Run all rules — never short-circuit; collect all results
    const [
      killSwitchResult,
      tradeSizeResult,
      minProfitResult,
      gasResult,
      tokenInResult,
      tokenOutResult,
      tokenInCooldownResult,
      tokenOutCooldownResult,
      buyPoolLiquidityResult,
      sellPoolLiquidityResult,
      failedTxRateResult,
      exposureResult,
    ] = await Promise.all([
      this.checkKillSwitch(input.chainId),
      this.checkTradeSize(input.tradeSizeUsd),
      this.checkMinProfit(input.netProfitUsd),
      this.checkGasPrice(input.gasGwei),
      this.checkTokenFlags(input.tokenIn),
      this.checkTokenFlags(input.tokenOut),
      this.checkTokenCooldown(input.tokenIn),
      this.checkTokenCooldown(input.tokenOut),
      this.checkPoolLiquidity(input.buyPool),
      this.checkPoolLiquidity(input.sellPool),
      this.checkFailedTxRate(input.chainId),
      this.checkTokenExposure(input.tokenIn, input.tradeSizeUsd),
    ]);

    results.push(
      killSwitchResult,
      tradeSizeResult,
      minProfitResult,
      gasResult,
      tokenInResult,
      tokenOutResult,
      tokenInCooldownResult,
      tokenOutCooldownResult,
      buyPoolLiquidityResult,
      sellPoolLiquidityResult,
      failedTxRateResult,
      exposureResult
    );

    const rejectionReasons = results
      .filter((r) => !r.passed)
      .map((r) => `[${r.rule}] ${r.detail ?? "rule failed"}`);

    return {
      approved: rejectionReasons.length === 0,
      rejectionReasons,
      checkedRules: results,
      evaluatedAt: new Date(),
    };
  }

  // ── Rules ──────────────────────────────────────────────────────────────────

  private async checkKillSwitch(chainId: number): Promise<RuleResult> {
    const globalKill = await this.redis.get(KILL_SWITCH_KEY("GLOBAL"));
    if (globalKill === "1") {
      return { rule: "KILL_SWITCH_GLOBAL", passed: false, detail: "Global kill switch is active" };
    }
    const chainKill = await this.redis.get(KILL_SWITCH_KEY(`CHAIN_${chainId}`));
    if (chainKill === "1") {
      return { rule: "KILL_SWITCH_CHAIN", passed: false, detail: `Chain ${chainId} kill switch is active` };
    }
    return { rule: "KILL_SWITCH", passed: true };
  }

  private checkTradeSize(tradeSizeUsd: number): RuleResult {
    const passed = tradeSizeUsd <= this.config.maxTradeSizeUsd;
    return {
      rule: "MAX_TRADE_SIZE",
      passed,
      ...(passed
        ? {}
        : {
            detail: `Trade size $${tradeSizeUsd.toFixed(2)} exceeds max $${this.config.maxTradeSizeUsd}`,
          }),
    };
  }

  private checkMinProfit(netProfitUsd: number): RuleResult {
    const passed = netProfitUsd >= this.config.minNetProfitUsd;
    return {
      rule: "MIN_NET_PROFIT",
      passed,
      ...(passed
        ? {}
        : {
            detail: `Net profit $${netProfitUsd.toFixed(4)} below minimum $${this.config.minNetProfitUsd}`,
          }),
    };
  }

  private checkGasPrice(gasGwei: number): RuleResult {
    const passed = gasGwei <= this.config.maxGasGwei;
    return {
      rule: "MAX_GAS_PRICE",
      passed,
      ...(passed
        ? {}
        : {
            detail: `Gas price ${gasGwei} Gwei exceeds max ${this.config.maxGasGwei} Gwei`,
          }),
    };
  }

  private async checkTokenFlags(tokenAddress: Address): Promise<RuleResult> {
    const token = await this.db.token.findFirst({
      where: {
        address: { equals: tokenAddress, mode: "insensitive" },
      },
      select: { flags: true, symbol: true },
    });

    if (!token) {
      return { rule: `TOKEN_FLAGS(${tokenAddress})`, passed: true, detail: "Token not in registry — allowing" };
    }

    const blockedFlags: TokenFlag[] = [
      "FEE_ON_TRANSFER",
      "HONEYPOT_SUSPICION",
      "PAUSED_TRANSFERS",
      "BLACKLISTED",
    ];

    const activeBlockedFlags = token.flags.filter((f: string) =>
      blockedFlags.includes(f as TokenFlag)
    );

    if (activeBlockedFlags.length > 0) {
      return {
        rule: `TOKEN_FLAGS(${token.symbol})`,
        passed: false,
        detail: `Token has blocked flags: ${activeBlockedFlags.join(", ")}`,
      };
    }

    return { rule: `TOKEN_FLAGS(${token.symbol})`, passed: true };
  }

  private async checkTokenCooldown(tokenAddress: Address): Promise<RuleResult> {
    const cooldown = await this.redis.get(TOKEN_COOLDOWN_KEY(tokenAddress));
    if (cooldown === "1") {
      return {
        rule: `TOKEN_COOLDOWN(${tokenAddress})`,
        passed: false,
        detail: `Token ${tokenAddress} is in cooldown period`,
      };
    }
    return { rule: `TOKEN_COOLDOWN(${tokenAddress})`, passed: true };
  }

  private checkPoolLiquidity(pool: NormalizedPool): RuleResult {
    const passed = pool.liquidityUsd >= this.config.minPoolLiquidityUsd;
    return {
      rule: `POOL_LIQUIDITY(${pool.poolId.slice(-8)})`,
      passed,
      ...(passed
        ? {}
        : {
            detail: `Pool liquidity $${pool.liquidityUsd.toFixed(0)} below minimum $${this.config.minPoolLiquidityUsd}`,
          }),
    };
  }

  private async checkFailedTxRate(chainId: number): Promise<RuleResult> {
    const count = await this.redis.get(FAILED_TX_KEY(chainId));
    const failedCount = count ? parseInt(count, 10) : 0;
    const passed = failedCount < this.config.maxFailedTxPerHour;
    return {
      rule: "FAILED_TX_RATE",
      passed,
      ...(passed
        ? {}
        : {
            detail: `Failed tx rate ${failedCount}/hr exceeds max ${this.config.maxFailedTxPerHour}/hr — auto-kill triggered`,
          }),
    };
  }

  private async checkTokenExposure(
    tokenAddress: Address,
    tradeSizeUsd: number
  ): Promise<RuleResult> {
    const current = await this.redis.get(TOKEN_EXPOSURE_KEY(tokenAddress));
    const currentExposure = current ? parseFloat(current) : 0;
    const totalExposure = currentExposure + tradeSizeUsd;
    const passed = totalExposure <= this.config.maxTokenExposureUsd;
    return {
      rule: `TOKEN_EXPOSURE(${tokenAddress.slice(0, 8)})`,
      passed,
      ...(passed
        ? {}
        : {
            detail: `Token exposure $${totalExposure.toFixed(2)} would exceed max $${this.config.maxTokenExposureUsd}`,
          }),
    };
  }

  // ── State Mutations ────────────────────────────────────────────────────────

  async recordFailedTx(chainId: number): Promise<void> {
    const key = FAILED_TX_KEY(chainId);
    const newCount = await this.redis.incr(key);
    await this.redis.expire(key, 3600); // rolling 1h window

    // Auto-trigger global kill if threshold exceeded
    if (newCount >= this.config.maxFailedTxPerHour) {
      await this.activateKillSwitch("GLOBAL", "system", "Auto-kill: failed tx rate exceeded");
    }
  }

  async recordSuccessfulTx(chainId: number): Promise<void> {
    // Decrement failure counter on success (rolling window)
    const key = FAILED_TX_KEY(chainId);
    await this.redis.decr(key);
  }

  async activateKillSwitch(
    key: string,
    actor: string,
    reason: string
  ): Promise<void> {
    await this.redis.set(KILL_SWITCH_KEY(key), "1");
    // Persist to DB for audit
    await this.db.riskEvent.create({
      data: {
        eventType: "KILL_SWITCH_ACTIVATED",
        severity: RiskSeverity.CRITICAL,
        details: { key, actor, reason },
      },
    });
    await this.db.auditLog.create({
      data: {
        action: "KILL_SWITCH_ACTIVATED",
        actor,
        entityType: "kill_switch",
        entityId: key,
        diff: { after: { active: true }, reason },
      },
    });
  }

  async deactivateKillSwitch(key: string, actor: string): Promise<void> {
    await this.redis.del(KILL_SWITCH_KEY(key));
    await this.db.auditLog.create({
      data: {
        action: "KILL_SWITCH_DEACTIVATED",
        actor,
        entityType: "kill_switch",
        entityId: key,
        diff: { after: { active: false } },
      },
    });
  }

  async setTokenCooldown(tokenAddress: Address): Promise<void> {
    await this.redis.set(
      TOKEN_COOLDOWN_KEY(tokenAddress),
      "1",
      "EX",
      this.config.tokenCooldownSeconds
    );
  }

  async getKillSwitchStates(): Promise<Record<string, boolean>> {
    const keys = ["GLOBAL", "CHAIN_1", "CHAIN_8453", "CHAIN_42161"];
    const values = await Promise.all(
      keys.map((k) => this.redis.get(KILL_SWITCH_KEY(k)))
    );
    return Object.fromEntries(keys.map((k, i) => [k, values[i] === "1"]));
  }
}
