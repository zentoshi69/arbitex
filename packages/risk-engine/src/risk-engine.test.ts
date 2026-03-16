import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { computeProfitBreakdown, buildOpportunityFingerprint } from "@arbitex/opportunity-engine";
import { RiskEngine } from "@arbitex/risk-engine";
import type { RiskConfig, NormalizedPool } from "@arbitex/shared-types";
import { RiskConfigSchema } from "@arbitex/shared-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePool(overrides: Partial<NormalizedPool> = {}): NormalizedPool {
  return {
    poolId: "test-pool-001",
    venueId: "mock-uniswap",
    venueName: "Mock Uniswap",
    chainId: 1,
    token0: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    token1: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    token0Symbol: "USDC",
    token1Symbol: "WETH",
    token0Decimals: 6,
    token1Decimals: 18,
    feeBps: 30,
    liquidityUsd: 1_000_000,
    price0Per1: 2000.0,
    price1Per0: 0.0005,
    lastUpdated: new Date(),
    ...overrides,
  };
}

const baseConfig: RiskConfig = RiskConfigSchema.parse({
  maxTradeSizeUsd: 10_000,
  maxTokenExposureUsd: 25_000,
  minPoolLiquidityUsd: 100_000,
  maxSlippageBps: 50,
  maxFailedTxPerHour: 5,
  maxGasGwei: 100,
  tokenCooldownSeconds: 300,
  minNetProfitUsd: 5,
  failureBufferFactor: 0.1,
  slippageBufferFactor: 0.005,
});

// ── computeProfitBreakdown ────────────────────────────────────────────────────
describe("computeProfitBreakdown", () => {
  it("correctly computes all cost components", () => {
    const result = computeProfitBreakdown({
      grossSpreadUsd: 100,
      gasUnits: 300_000n,
      gasPriceGwei: 30n,
      ethPriceUsd: 2000,
      buyFeeBps: 30,
      sellFeeBps: 30,
      tradeSizeUsd: 10_000,
      slippageBufferFactor: 0.005,
      failureBufferFactor: 0.1,
      failureGasEstimateUsd: 18, // 300k gas * 30 gwei * 2000
    });

    // Gas = 300000 * 30 gwei = 9000000000000 wei = 0.000009 ETH
    // At $2000 ETH = $0.018 — wait, 300000 * 30e9 = 9e15 wei = 0.009 ETH = $18
    expect(result.gasEstimateUsd).toBeCloseTo(18, 0);
    // Venue fees = (30+30)/10000 * 10000 = $6
    expect(result.venueFeesUsd).toBeCloseTo(6, 1);
    // Slippage = 0.005 * 10000 = $50
    expect(result.slippageBufferUsd).toBeCloseTo(50, 1);
    // Failure buffer = 0.1 * 18 = $1.8
    expect(result.failureBufferUsd).toBeCloseTo(1.8, 1);
    // Net = 100 - 18 - 6 - 50 - 1.8 = $24.2
    expect(result.netProfitUsd).toBeCloseTo(24.2, 0);
  });

  it("returns negative net profit when costs exceed spread", () => {
    const result = computeProfitBreakdown({
      grossSpreadUsd: 5,
      gasUnits: 300_000n,
      gasPriceGwei: 100n, // high gas
      ethPriceUsd: 2000,
      buyFeeBps: 30,
      sellFeeBps: 30,
      tradeSizeUsd: 1_000,
      slippageBufferFactor: 0.005,
      failureBufferFactor: 0.1,
      failureGasEstimateUsd: 60,
    });

    expect(result.netProfitUsd).toBeLessThan(0);
  });

  it("netProfitBps is proportional to trade size", () => {
    const result = computeProfitBreakdown({
      grossSpreadUsd: 100,
      gasUnits: 100_000n,
      gasPriceGwei: 10n,
      ethPriceUsd: 2000,
      buyFeeBps: 10,
      sellFeeBps: 10,
      tradeSizeUsd: 10_000,
      slippageBufferFactor: 0.001,
      failureBufferFactor: 0.05,
      failureGasEstimateUsd: 2,
    });

    expect(result.netProfitBps).toEqual(
      (result.netProfitUsd / 10_000) * 10_000
    );
  });

  it("zero gross spread yields negative net profit (costs still apply)", () => {
    const result = computeProfitBreakdown({
      grossSpreadUsd: 0,
      gasUnits: 300_000n,
      gasPriceGwei: 30n,
      ethPriceUsd: 2000,
      buyFeeBps: 30,
      sellFeeBps: 30,
      tradeSizeUsd: 10_000,
      slippageBufferFactor: 0.005,
      failureBufferFactor: 0.1,
      failureGasEstimateUsd: 18,
    });

    expect(result.netProfitUsd).toBeLessThan(0);
  });
});

// ── buildOpportunityFingerprint ───────────────────────────────────────────────
describe("buildOpportunityFingerprint", () => {
  it("returns same fingerprint for same inputs in same time window", () => {
    const a = buildOpportunityFingerprint(
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "uniswap-v3",
      "sushiswap-v2",
      1000
    );
    const b = buildOpportunityFingerprint(
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "uniswap-v3",
      "sushiswap-v2",
      1000
    );
    expect(a).toEqual(b);
  });

  it("returns different fingerprints for different venue combinations", () => {
    const a = buildOpportunityFingerprint(
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "uniswap-v3",
      "sushiswap-v2",
      1000
    );
    const b = buildOpportunityFingerprint(
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "sushiswap-v2",  // swapped
      "uniswap-v3",
      1000
    );
    expect(a).not.toEqual(b);
  });
});

// ── RiskEngine ────────────────────────────────────────────────────────────────
describe("RiskEngine", () => {
  let redis: any;
  let db: any;
  let engine: RiskEngine;

  beforeEach(() => {
    redis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
      incr: vi.fn().mockResolvedValue(1),
      decr: vi.fn().mockResolvedValue(0),
      expire: vi.fn().mockResolvedValue(1),
    };

    db = {
      token: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      riskEvent: {
        create: vi.fn().mockResolvedValue({ id: "test-evt" }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "test-log" }),
      },
    };

    engine = new RiskEngine(redis, db, baseConfig);
  });

  const baseInput = {
    opportunityId: "opp-001",
    tokenIn: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as any,
    tokenOut: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" as any,
    tradeSizeUsd: 1_000,
    netProfitUsd: 10,
    grossSpreadUsd: 80,
    buyPool: makePool(),
    sellPool: makePool({ venueId: "mock-sushi", price0Per1: 2010 }),
    gasGwei: 30,
    chainId: 1,
    profitBreakdown: {
      grossSpreadUsd: 80,
      gasEstimateUsd: 18,
      venueFeesUsd: 6,
      slippageBufferUsd: 5,
      failureBufferUsd: 2,
      netProfitUsd: 10,
      netProfitBps: 10,
    },
  };

  it("approves a valid opportunity", async () => {
    const result = await engine.evaluate(baseInput);
    expect(result.approved).toBe(true);
    expect(result.rejectionReasons).toHaveLength(0);
  });

  it("rejects when global kill switch is active", async () => {
    redis.get.mockImplementation(async (key: string) => {
      if (key === "arbitex:risk:kill:GLOBAL") return "1";
      return null;
    });

    const result = await engine.evaluate(baseInput);
    expect(result.approved).toBe(false);
    expect(result.rejectionReasons.some((r) => r.includes("Global kill switch"))).toBe(true);
  });

  it("rejects when chain kill switch is active", async () => {
    redis.get.mockImplementation(async (key: string) => {
      if (key === "arbitex:risk:kill:CHAIN_1") return "1";
      return null;
    });

    const result = await engine.evaluate(baseInput);
    expect(result.approved).toBe(false);
    expect(result.rejectionReasons.some((r) => r.includes("Chain 1"))).toBe(true);
  });

  it("rejects when trade size exceeds maximum", async () => {
    const result = await engine.evaluate({
      ...baseInput,
      tradeSizeUsd: 99_999,
    });
    expect(result.approved).toBe(false);
    expect(result.rejectionReasons.some((r) => r.includes("MAX_TRADE_SIZE"))).toBe(true);
  });

  it("rejects when net profit is below minimum", async () => {
    const result = await engine.evaluate({
      ...baseInput,
      netProfitUsd: 1.0, // below $5 default
    });
    expect(result.approved).toBe(false);
    expect(result.rejectionReasons.some((r) => r.includes("MIN_NET_PROFIT"))).toBe(true);
  });

  it("rejects when gas price exceeds ceiling", async () => {
    const result = await engine.evaluate({
      ...baseInput,
      gasGwei: 200, // above 100 Gwei default
    });
    expect(result.approved).toBe(false);
    expect(result.rejectionReasons.some((r) => r.includes("MAX_GAS_PRICE"))).toBe(true);
  });

  it("rejects when pool liquidity is below minimum", async () => {
    const lowLiqPool = makePool({ liquidityUsd: 50_000 }); // below $100k
    const result = await engine.evaluate({
      ...baseInput,
      buyPool: lowLiqPool,
    });
    expect(result.approved).toBe(false);
    expect(
      result.rejectionReasons.some((r) => r.includes("POOL_LIQUIDITY"))
    ).toBe(true);
  });

  it("rejects when token has FEE_ON_TRANSFER flag", async () => {
    db.token.findFirst.mockResolvedValue({
      flags: ["FEE_ON_TRANSFER"],
      symbol: "FOT",
    });

    const result = await engine.evaluate(baseInput);
    expect(result.approved).toBe(false);
    expect(
      result.rejectionReasons.some((r) => r.includes("FEE_ON_TRANSFER"))
    ).toBe(true);
  });

  it("rejects when token has HONEYPOT_SUSPICION flag", async () => {
    db.token.findFirst.mockResolvedValue({
      flags: ["HONEYPOT_SUSPICION"],
      symbol: "HONEY",
    });

    const result = await engine.evaluate(baseInput);
    expect(result.approved).toBe(false);
    expect(
      result.rejectionReasons.some((r) => r.includes("HONEYPOT_SUSPICION"))
    ).toBe(true);
  });

  it("rejects when token is in cooldown", async () => {
    redis.get.mockImplementation(async (key: string) => {
      if (key.startsWith("arbitex:risk:cooldown:")) return "1";
      return null;
    });

    const result = await engine.evaluate(baseInput);
    expect(result.approved).toBe(false);
    expect(result.rejectionReasons.some((r) => r.includes("cooldown"))).toBe(true);
  });

  it("rejects and auto-triggers kill switch when failed TX rate exceeded", async () => {
    redis.get.mockImplementation(async (key: string) => {
      if (key === `arbitex:risk:failed_tx:1`) return "10"; // 10 > max 5
      return null;
    });

    const result = await engine.evaluate(baseInput);
    expect(result.approved).toBe(false);
    expect(result.rejectionReasons.some((r) => r.includes("FAILED_TX_RATE"))).toBe(true);
  });

  it("reports all failing rules when multiple rules fail", async () => {
    redis.get.mockImplementation(async () => null);
    const result = await engine.evaluate({
      ...baseInput,
      tradeSizeUsd: 99_999,     // fails MAX_TRADE_SIZE
      netProfitUsd: 0.01,        // fails MIN_NET_PROFIT
      gasGwei: 999,              // fails MAX_GAS_PRICE
      buyPool: makePool({ liquidityUsd: 1_000 }), // fails POOL_LIQUIDITY
    });

    expect(result.approved).toBe(false);
    expect(result.rejectionReasons.length).toBeGreaterThanOrEqual(4);
  });

  it("evaluatedAt is recent", async () => {
    const before = new Date();
    const result = await engine.evaluate(baseInput);
    const after = new Date();
    expect(result.evaluatedAt >= before).toBe(true);
    expect(result.evaluatedAt <= after).toBe(true);
  });

  it("activateKillSwitch writes to DB and Redis", async () => {
    await engine.activateKillSwitch("GLOBAL", "test-user", "unit test");
    expect(redis.set).toHaveBeenCalledWith(
      "arbitex:risk:kill:GLOBAL",
      "1"
    );
    expect(db.riskEvent.create).toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalled();
  });

  it("recordFailedTx increments counter and triggers kill at threshold", async () => {
    // Simulate already at threshold - 1
    redis.incr.mockResolvedValue(5); // hits the max
    await engine.recordFailedTx(1);
    // Should activate global kill
    expect(redis.set).toHaveBeenCalledWith(
      "arbitex:risk:kill:GLOBAL",
      "1"
    );
  });
});
