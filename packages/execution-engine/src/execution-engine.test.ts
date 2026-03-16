import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExecutionEngine, RouteSimulator } from "../src/index.js";
import type { RiskConfig } from "@arbitex/shared-types";
import { RiskConfigSchema, SimulationFailureReason } from "@arbitex/shared-types";
import { MockDexAdapter } from "@arbitex/dex-adapters";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_WALLET_ADDR = "0x1234567890123456789012345678901234567890" as const;

const riskConfig: RiskConfig = RiskConfigSchema.parse({
  maxTradeSizeUsd: 10_000,
  minNetProfitUsd: 5,
  maxGasGwei: 100,
  minPoolLiquidityUsd: 100_000,
  maxFailedTxPerHour: 5,
  maxSlippageBps: 50,
  maxTokenExposureUsd: 25_000,
  tokenCooldownSeconds: 300,
});

const mockPool = MockDexAdapter.makePool({
  token0: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  token1: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  venueId: "mock-uni",
  price0Per1: 2000,
  price1Per0: 0.0005,
  liquidityUsd: 2_000_000,
});

const baseRoutes = [
  {
    stepIndex: 0,
    poolId: mockPool.poolId,
    venueId: "mock-uni",
    venueName: "Mock Uniswap",
    tokenIn: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as any,
    tokenOut: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" as any,
    amountIn: "1000000000",
    amountOut: "500000000000000000",
    feeBps: 30,
  },
  {
    stepIndex: 1,
    poolId: "mock-sushi-pool",
    venueId: "mock-sushi",
    venueName: "Mock SushiSwap",
    tokenIn: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" as any,
    tokenOut: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as any,
    amountIn: "500000000000000000",
    amountOut: "1010000000",
    feeBps: 30,
  },
];

const profitBreakdown = {
  grossSpreadUsd: 50,
  gasEstimateUsd: 18,
  venueFeesUsd: 6,
  slippageBufferUsd: 5,
  failureBufferUsd: 2,
  netProfitUsd: 19,
  netProfitBps: 19,
};

function makeMocks() {
  const redis = {
    set: vi.fn().mockResolvedValue("OK"),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
    decr: vi.fn().mockResolvedValue(0),
    expire: vi.fn().mockResolvedValue(1),
    keys: vi.fn().mockResolvedValue([]),
  };

  const db = {
    execution: {
      create: vi.fn().mockResolvedValue({ id: "exec-001" }),
      update: vi.fn().mockResolvedValue({ id: "exec-001" }),
      findUniqueOrThrow: vi.fn(),
    },
    transaction: {
      create: vi.fn().mockResolvedValue({ id: "tx-001" }),
    },
  };

  const wallet = {
    address: MOCK_WALLET_ADDR,
    signTransaction: vi.fn().mockResolvedValue("0x" + "ab".repeat(32)),
    sendTransaction: vi.fn().mockResolvedValue("0x" + "cd".repeat(32)),
    client: {} as any,
  };

  const client = {
    getGasPrice: vi.fn().mockResolvedValue(30_000_000_000n), // 30 Gwei
    estimateGas: vi.fn().mockResolvedValue(300_000n),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({
      status: "success",
      blockNumber: 20_000_000n,
      gasUsed: 280_000n,
    }),
  };

  const nonceManager = {
    acquireNonce: vi.fn().mockResolvedValue({
      nonce: 42,
      release: vi.fn().mockResolvedValue(undefined),
    }),
    syncNonce: vi.fn().mockResolvedValue(undefined),
    resetNonce: vi.fn().mockResolvedValue(undefined),
  };

  const uniAdapter = new MockDexAdapter("mock-uni", "Mock Uniswap", 1, [mockPool]);
  const sushiAdapter = new MockDexAdapter("mock-sushi", "Mock SushiSwap", 1, []);
  const adapterMap = new Map([
    ["mock-uni", uniAdapter],
    ["mock-sushi", sushiAdapter],
  ]);

  const simulator = new RouteSimulator(client as any, adapterMap);

  const engine = new ExecutionEngine(
    wallet as any,
    client as any,
    nonceManager as any,
    simulator,
    db as any,
    redis as any
  );

  return { redis, db, wallet, client, nonceManager, adapterMap, simulator, engine };
}

// ── RouteSimulator ────────────────────────────────────────────────────────────

describe("RouteSimulator", () => {
  it("returns success for fresh pool with sufficient liquidity", async () => {
    const { simulator } = makeMocks();
    const result = await simulator.simulate({
      routes: baseRoutes,
      buyPool: mockPool,
      sellPool: { ...mockPool, venueId: "mock-sushi" },
      walletAddress: MOCK_WALLET_ADDR,
    });
    expect(result.success).toBe(true);
  });

  it("returns POOL_STALE for old pool snapshot", async () => {
    const { simulator } = makeMocks();
    const stalePool = {
      ...mockPool,
      lastUpdated: new Date(Date.now() - 60_000), // 60s old
    };
    const result = await simulator.simulate({
      routes: baseRoutes,
      buyPool: stalePool,
      sellPool: { ...mockPool, venueId: "mock-sushi" },
      walletAddress: MOCK_WALLET_ADDR,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe(SimulationFailureReason.POOL_STALE);
    }
  });

  it("returns REVERT when estimateGas throws", async () => {
    const { adapterMap } = makeMocks();
    const revertingClient = {
      getGasPrice: vi.fn().mockResolvedValue(30_000_000_000n),
      estimateGas: vi.fn().mockRejectedValue(new Error("execution reverted: insufficient output")),
    };
    const sim = new RouteSimulator(revertingClient as any, adapterMap);
    const result = await sim.simulate({
      routes: baseRoutes,
      buyPool: mockPool,
      sellPool: { ...mockPool, venueId: "mock-sushi" },
      walletAddress: MOCK_WALLET_ADDR,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe(SimulationFailureReason.REVERT);
      expect(result.detail).toContain("insufficient output");
    }
  });
});

// ── ExecutionEngine ───────────────────────────────────────────────────────────

describe("ExecutionEngine", () => {
  it("mock execution completes without submitting to chain", async () => {
    const { engine, db, wallet, adapterMap } = makeMocks();
    await engine.execute({
      opportunityId: "opp-001",
      fingerprint: "a".repeat(64),
      routes: baseRoutes,
      buyPool: mockPool,
      sellPool: { ...mockPool, venueId: "mock-sushi" },
      profitBreakdown,
      adapters: adapterMap,
      riskConfig,
      mockExecution: true,
    });

    // Should have created + updated execution record
    expect(db.execution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ opportunityId: "opp-001" }),
      })
    );
    // Should NOT have called sendTransaction in mock mode
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
    // Should have updated to LANDED
    const updateCalls = db.execution.update.mock.calls.map((c: any) => c[0].data.state);
    expect(updateCalls).toContain("LANDED");
  });

  it("aborts on duplicate fingerprint within dedup window", async () => {
    const { engine, db, redis, adapterMap } = makeMocks();
    // Simulate dedup key already set (returns null for NX set)
    redis.set.mockImplementation(async (key: string, val: string, ...args: any[]) => {
      if (key.startsWith("arbitex:exec:dedup:")) return null; // already exists
      return "OK";
    });

    await engine.execute({
      opportunityId: "opp-dup",
      fingerprint: "b".repeat(64),
      routes: baseRoutes,
      buyPool: mockPool,
      sellPool: { ...mockPool, venueId: "mock-sushi" },
      profitBreakdown,
      adapters: adapterMap,
      riskConfig,
      mockExecution: true,
    });

    // Should mark as FAILED with duplicate reason
    const failUpdate = db.execution.update.mock.calls.find(
      (c: any) => c[0].data.state === "FAILED"
    );
    expect(failUpdate).toBeDefined();
    expect(failUpdate[0].data.failureCode).toBe("DUPLICATE_OPPORTUNITY");
  });

  it("aborts when net profit is below minimum at execution time", async () => {
    const { engine, db, adapterMap } = makeMocks();

    await engine.execute({
      opportunityId: "opp-low-profit",
      fingerprint: "c".repeat(64),
      routes: baseRoutes,
      buyPool: mockPool,
      sellPool: { ...mockPool, venueId: "mock-sushi" },
      profitBreakdown: {
        ...profitBreakdown,
        netProfitUsd: 1.0, // below $5 minimum
      },
      adapters: adapterMap,
      riskConfig,
      mockExecution: true,
    });

    // Find the FAILED state update
    const failUpdate = db.execution.update.mock.calls.find(
      (c: any) => c[0].data.state === "FAILED"
    );
    expect(failUpdate).toBeDefined();
    expect(failUpdate[0].data.failureCode).toBe("BELOW_MIN_PROFIT");
  });

  it("creates execution record before any other operation", async () => {
    const { engine, db, adapterMap } = makeMocks();
    const callOrder: string[] = [];
    db.execution.create.mockImplementation(async () => {
      callOrder.push("create");
      return { id: "exec-order-test" };
    });
    db.execution.update.mockImplementation(async () => {
      callOrder.push("update");
      return { id: "exec-order-test" };
    });

    await engine.execute({
      opportunityId: "opp-order",
      fingerprint: "d".repeat(64),
      routes: baseRoutes,
      buyPool: mockPool,
      sellPool: { ...mockPool, venueId: "mock-sushi" },
      profitBreakdown,
      adapters: adapterMap,
      riskConfig,
      mockExecution: true,
    });

    expect(callOrder[0]).toBe("create");
  });

  it("transitions through correct lifecycle states in mock mode", async () => {
    const { engine, db, adapterMap } = makeMocks();
    const states: string[] = [];
    db.execution.update.mockImplementation(async (args: any) => {
      if (args.data.state) states.push(args.data.state);
      return { id: "exec-lifecycle" };
    });

    await engine.execute({
      opportunityId: "opp-lifecycle",
      fingerprint: "e".repeat(64),
      routes: baseRoutes,
      buyPool: mockPool,
      sellPool: { ...mockPool, venueId: "mock-sushi" },
      profitBreakdown,
      adapters: adapterMap,
      riskConfig,
      mockExecution: true,
    });

    expect(states).toContain("SIMULATING");
    expect(states).toContain("SIGNING");
    expect(states).toContain("SUBMITTED");
    expect(states).toContain("LANDED");
    // Order: SIMULATING → SIGNING → SUBMITTED → LANDED
    const simIdx = states.indexOf("SIMULATING");
    const landedIdx = states.indexOf("LANDED");
    expect(simIdx).toBeLessThan(landedIdx);
  });
});
