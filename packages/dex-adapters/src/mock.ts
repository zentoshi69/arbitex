import type { IDexAdapter } from "./interface.js";
import type {
  NormalizedPool,
  QuoteParams,
  QuoteResult,
  SwapParams,
  SwapCalldata,
  Address,
} from "@arbitex/shared-types";

/**
 * Fully deterministic mock adapter for unit and integration tests.
 * Configure pools and quotes at construction time.
 */
export class MockDexAdapter implements IDexAdapter {
  readonly protocol = "mock";

  constructor(
    readonly venueId: string,
    readonly venueName: string,
    readonly chainId: number,
    private readonly mockPools: NormalizedPool[] = [],
    private readonly quoteMultiplier: number = 1.002, // 0.2% above input
    private readonly shouldFailQuote: boolean = false,
    private readonly supportedTokens: Set<string> = new Set()
  ) {}

  async getPools(_tokens?: Address[]): Promise<NormalizedPool[]> {
    return this.mockPools.map((p) => ({ ...p, lastUpdated: new Date() }));
  }

  async getQuote(params: QuoteParams): Promise<QuoteResult> {
    if (this.shouldFailQuote) {
      throw new Error("Mock: quote intentionally failed");
    }
    const amountIn = BigInt(params.amountIn);
    const amountOut =
      (amountIn * BigInt(Math.floor(this.quoteMultiplier * 10_000))) / 10_000n;
    const amountOutMin =
      (amountOut * BigInt(10_000 - params.slippageBps)) / 10_000n;

    return {
      amountOut: amountOut.toString(),
      amountOutMin: amountOutMin.toString(),
      priceImpactBps: 5,
      gasEstimate: "150000",
      feePaid: (amountIn / 1000n).toString(),
      route: [params.tokenIn, params.tokenOut],
    };
  }

  async buildSwapCalldata(params: SwapParams): Promise<SwapCalldata> {
    return {
      to: "0x1234567890123456789012345678901234567890",
      data: "0xdeadbeef",
      value: "0",
      gasEstimate: "200000",
    };
  }

  async estimateGas(_calldata: SwapCalldata, _from: Address): Promise<bigint> {
    return 200_000n;
  }

  async supportsToken(token: Address): Promise<boolean> {
    if (this.supportedTokens.size === 0) return true; // all supported by default
    return this.supportedTokens.has(token.toLowerCase());
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: true, detail: "Mock adapter always healthy" };
  }

  /** Test helper: create a pool snapshot with specified price */
  static makePool(
    overrides: Partial<NormalizedPool> & {
      token0: Address;
      token1: Address;
      venueId: string;
    }
  ): NormalizedPool {
    return {
      poolId: `mock-${overrides.venueId}-${overrides.token0}-${overrides.token1}`,
      venueName: "Mock DEX",
      chainId: 1,
      token0Symbol: "TKA",
      token1Symbol: "TKB",
      token0Decimals: 18,
      token1Decimals: 18,
      feeBps: 30,
      liquidityUsd: 1_000_000,
      price0Per1: 1.0,
      price1Per0: 1.0,
      lastUpdated: new Date(),
      ...overrides,
    };
  }
}
