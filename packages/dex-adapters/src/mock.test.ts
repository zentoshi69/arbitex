import { describe, it, expect } from "vitest";
import { MockDexAdapter } from "../src/mock.js";

describe("MockDexAdapter", () => {
  const pool = MockDexAdapter.makePool({
    token0: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    token1: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    venueId: "mock-v1",
    price0Per1: 2000,
    price1Per0: 0.0005,
  });

  const adapter = new MockDexAdapter("mock-v1", "Mock DEX", 1, [pool]);

  it("returns configured pools", async () => {
    const pools = await adapter.getPools();
    expect(pools).toHaveLength(1);
    expect(pools[0]?.token0).toBe("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
    expect(pools[0]?.price0Per1).toBe(2000);
  });

  it("always returns a fresh lastUpdated timestamp", async () => {
    const before = new Date();
    const pools = await adapter.getPools();
    const after = new Date();
    expect(pools[0]?.lastUpdated.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(pools[0]?.lastUpdated.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("returns quote with default 0.2% multiplier", async () => {
    const quote = await adapter.getQuote({
      poolId: pool.poolId,
      tokenIn: pool.token0,
      tokenOut: pool.token1,
      amountIn: "1000000000",
      slippageBps: 50,
    });
    const expected = BigInt(Math.floor(1000000000 * 1.002));
    expect(BigInt(quote.amountOut)).toBe(expected);
  });

  it("respects slippage in amountOutMin", async () => {
    const quote = await adapter.getQuote({
      poolId: pool.poolId,
      tokenIn: pool.token0,
      tokenOut: pool.token1,
      amountIn: "10000",
      slippageBps: 100, // 1%
    });
    const amountOut = BigInt(quote.amountOut);
    const amountOutMin = BigInt(quote.amountOutMin);
    // min should be 99% of out
    expect(amountOutMin).toBe((amountOut * 9900n) / 10_000n);
  });

  it("throws when shouldFailQuote is true", async () => {
    const failingAdapter = new MockDexAdapter("fail", "Fail", 1, [], 1, true);
    await expect(
      failingAdapter.getQuote({
        poolId: "x",
        tokenIn: pool.token0,
        tokenOut: pool.token1,
        amountIn: "1000",
        slippageBps: 50,
      })
    ).rejects.toThrow("Mock: quote intentionally failed");
  });

  it("supports all tokens by default (empty allowlist)", async () => {
    expect(
      await adapter.supportsToken("0x1234567890123456789012345678901234567890")
    ).toBe(true);
  });

  it("rejects unsupported tokens when allowlist is set", async () => {
    const restricted = new MockDexAdapter(
      "restricted",
      "Restricted",
      1,
      [],
      1,
      false,
      new Set(["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"])
    );
    expect(
      await restricted.supportsToken("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
    ).toBe(false);
    expect(
      await restricted.supportsToken("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    ).toBe(true);
  });

  it("health check always returns ok", async () => {
    const health = await adapter.healthCheck();
    expect(health.ok).toBe(true);
  });

  it("buildSwapCalldata returns valid structure", async () => {
    const calldata = await adapter.buildSwapCalldata({
      poolId: pool.poolId,
      tokenIn: pool.token0,
      tokenOut: pool.token1,
      amountIn: "1000000",
      amountOutMin: "999000",
      recipient: "0x1234567890123456789012345678901234567890",
      deadline: Math.floor(Date.now() / 1000) + 60,
      slippageBps: 50,
    });
    expect(calldata.to).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(calldata.data).toMatch(/^0x/);
    expect(calldata.value).toBe("0");
    expect(Number(calldata.gasEstimate)).toBeGreaterThan(0);
  });
});
