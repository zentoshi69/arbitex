import { describe, it, expect } from "vitest";
import {
  computeProfitBreakdown,
  buildOpportunityFingerprint,
} from "../src/index.js";

describe("computeProfitBreakdown — edge cases", () => {
  const baseParams = {
    grossSpreadUsd: 100,
    gasUnits: 300_000n,
    gasPriceGwei: 30n,
    ethPriceUsd: 2000,
    buyFeeBps: 30,
    sellFeeBps: 30,
    tradeSizeUsd: 10_000,
    slippageBufferFactor: 0.005,
    failureBufferFactor: 0.1,
    failureGasEstimateUsd: 18,
  };

  it("all components are non-negative", () => {
    const result = computeProfitBreakdown(baseParams);
    expect(result.gasEstimateUsd).toBeGreaterThan(0);
    expect(result.venueFeesUsd).toBeGreaterThan(0);
    expect(result.slippageBufferUsd).toBeGreaterThan(0);
    expect(result.failureBufferUsd).toBeGreaterThanOrEqual(0);
  });

  it("net = gross - gas - fees - slippage - failure", () => {
    const r = computeProfitBreakdown(baseParams);
    const expected =
      r.grossSpreadUsd -
      r.gasEstimateUsd -
      r.venueFeesUsd -
      r.slippageBufferUsd -
      r.failureBufferUsd;
    expect(r.netProfitUsd).toBeCloseTo(expected, 6);
  });

  it("zero fee tiers produce zero venue fees", () => {
    const result = computeProfitBreakdown({
      ...baseParams,
      buyFeeBps: 0,
      sellFeeBps: 0,
    });
    expect(result.venueFeesUsd).toBe(0);
  });

  it("gas scales linearly with gas units", () => {
    const r1 = computeProfitBreakdown({ ...baseParams, gasUnits: 100_000n });
    const r2 = computeProfitBreakdown({ ...baseParams, gasUnits: 200_000n });
    expect(r2.gasEstimateUsd).toBeCloseTo(r1.gasEstimateUsd * 2, 4);
  });

  it("gas scales linearly with gas price", () => {
    const r1 = computeProfitBreakdown({ ...baseParams, gasPriceGwei: 20n });
    const r2 = computeProfitBreakdown({ ...baseParams, gasPriceGwei: 40n });
    expect(r2.gasEstimateUsd).toBeCloseTo(r1.gasEstimateUsd * 2, 4);
  });

  it("slippage buffer is proportional to trade size", () => {
    const r1 = computeProfitBreakdown({ ...baseParams, tradeSizeUsd: 5000 });
    const r2 = computeProfitBreakdown({ ...baseParams, tradeSizeUsd: 10000 });
    expect(r2.slippageBufferUsd).toBeCloseTo(r1.slippageBufferUsd * 2, 4);
  });

  it("netProfitBps equals (netProfitUsd / tradeSizeUsd) * 10000", () => {
    const r = computeProfitBreakdown(baseParams);
    const expectedBps = (r.netProfitUsd / baseParams.tradeSizeUsd) * 10_000;
    expect(r.netProfitBps).toBeCloseTo(expectedBps, 6);
  });
});

describe("buildOpportunityFingerprint — properties", () => {
  const tokenA = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as any;
  const tokenB = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as any;

  it("produces a 64-char hex SHA-256", () => {
    const fp = buildOpportunityFingerprint(tokenA, tokenB, "uni-v3", "sushi-v2", 1000);
    expect(fp).toHaveLength(64);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is case-insensitive on token addresses", () => {
    const fp1 = buildOpportunityFingerprint(tokenA.toLowerCase() as any, tokenB, "uni", "sushi", 500);
    const fp2 = buildOpportunityFingerprint(tokenA.toUpperCase() as any, tokenB, "uni", "sushi", 500);
    expect(fp1).toBe(fp2);
  });

  it("differs when venues are swapped", () => {
    const fp1 = buildOpportunityFingerprint(tokenA, tokenB, "uni", "sushi", 1000);
    const fp2 = buildOpportunityFingerprint(tokenA, tokenB, "sushi", "uni", 1000);
    expect(fp1).not.toBe(fp2);
  });

  it("same bucket for trade sizes within $100", () => {
    // Both 1000 and 1050 fall in the same $100 bucket
    const fp1 = buildOpportunityFingerprint(tokenA, tokenB, "uni", "sushi", 1000);
    const fp2 = buildOpportunityFingerprint(tokenA, tokenB, "uni", "sushi", 1050);
    expect(fp1).toBe(fp2);
  });

  it("differs across $100 bucket boundaries", () => {
    const fp1 = buildOpportunityFingerprint(tokenA, tokenB, "uni", "sushi", 1000);
    const fp2 = buildOpportunityFingerprint(tokenA, tokenB, "uni", "sushi", 1100);
    expect(fp1).not.toBe(fp2);
  });
});
