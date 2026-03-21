import {
  encodeFunctionData,
  decodeFunctionResult,
  parseAbi,
  type PublicClient,
  type Address as ViemAddress,
} from "viem";
import type { IDexAdapter } from "./interface.js";
import type {
  NormalizedPool,
  QuoteParams,
  QuoteResult,
  SwapParams,
  SwapCalldata,
  Address,
} from "@arbitex/shared-types";
import { ArbitexError, ErrorCode } from "@arbitex/shared-types";
import { estimateV3LiquidityUsd } from "./liquidity-estimator.js";

// ── ABIs (minimal) ────────────────────────────────────────────────────────────

const FACTORY_ABI = parseAbi([
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
]);

const POOL_ABI = parseAbi([
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() external view returns (uint128)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function fee() external view returns (uint24)",
]);

const ERC20_META_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

const QUOTER_V2_ABI = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

const ROUTER_ABI = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
]);

// ── Config ────────────────────────────────────────────────────────────────────

export type UniswapV3Config = {
  venueId: string;
  chainId: number;
  factoryAddress: Address;
  quoterV2Address: Address;
  routerAddress: Address;
  // Fee tiers to scan: 500 (0.05%), 3000 (0.3%), 10000 (1%)
  feeTiers: number[];
};

const UNISWAP_V3_MAINNET: UniswapV3Config = {
  venueId: "uniswap-v3-mainnet",
  chainId: 1,
  factoryAddress: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  quoterV2Address: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  routerAddress: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
  feeTiers: [500, 3000, 10000],
};

const UNISWAP_V3_AVALANCHE: UniswapV3Config = {
  venueId: "uniswap-v3-avalanche",
  chainId: 43114,
  factoryAddress: "0x740b1c1de25031C31FF4fC9A62f554A55cdC1baF",
  quoterV2Address: "0xbe0F5544EC67e9B3b2D979aaA43f18Fd87E6257F",
  routerAddress: "0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE",
  feeTiers: [500, 3000, 10000],
};

const TRADERJOE_V2_1_AVALANCHE: UniswapV3Config = {
  venueId: "traderjoe-v2.1-avalanche",
  chainId: 43114,
  factoryAddress: "0x8e42f2F4101563bF679975178e880FD87d3eFd4e",
  quoterV2Address: "0xd76019A16606FDa4651f636D9751f500Ed776250",
  routerAddress: "0xb4315e873dBcf96Ffd0acd8EA43f689D8c20fB30",
  feeTiers: [500, 2500, 10000],
};

const V3_CONFIGS_BY_CHAIN: Record<number, UniswapV3Config[]> = {
  1: [UNISWAP_V3_MAINNET],
  43114: [UNISWAP_V3_AVALANCHE, TRADERJOE_V2_1_AVALANCHE],
};

// ── Adapter ───────────────────────────────────────────────────────────────────

export class UniswapV3Adapter implements IDexAdapter {
  readonly venueId: string;
  readonly venueName: string;
  readonly chainId: number;
  readonly protocol = "uniswap_v3";

  private tokenMetaCache = new Map<string, { symbol: string; decimals: number }>();

  constructor(
    private readonly client: PublicClient,
    private readonly cfg: UniswapV3Config = UNISWAP_V3_MAINNET,
    venueName?: string,
  ) {
    this.venueId = cfg.venueId;
    this.chainId = cfg.chainId;
    this.venueName = venueName ?? "Uniswap V3";
  }

  private async resolveTokenMeta(addr: ViemAddress): Promise<{ symbol: string; decimals: number }> {
    const key = addr.toLowerCase();
    const cached = this.tokenMetaCache.get(key);
    if (cached) return cached;
    try {
      const [symbol, decimals] = await this.client.multicall({
        contracts: [
          { address: addr, abi: ERC20_META_ABI, functionName: "symbol" },
          { address: addr, abi: ERC20_META_ABI, functionName: "decimals" },
        ],
        allowFailure: false,
      });
      const meta = { symbol: symbol as string, decimals: Number(decimals) };
      this.tokenMetaCache.set(key, meta);
      return meta;
    } catch {
      return { symbol: "???", decimals: 18 };
    }
  }

  /**
   * Create an adapter from a DB venue record.
   * Matches factory address to known presets, or builds a config from the venue data.
   */
  static fromVenue(
    client: PublicClient,
    venue: { id: string; name: string; chainId: number; factoryAddress: string; routerAddress: string },
  ): UniswapV3Adapter {
    const presets = V3_CONFIGS_BY_CHAIN[venue.chainId] ?? [];
    const match = presets.find(
      (p) => p.factoryAddress.toLowerCase() === venue.factoryAddress.toLowerCase(),
    );

    if (match) {
      return new UniswapV3Adapter(client, { ...match, venueId: venue.id }, venue.name);
    }

    return new UniswapV3Adapter(
      client,
      {
        venueId: venue.id,
        chainId: venue.chainId,
        factoryAddress: venue.factoryAddress,
        quoterV2Address: venue.routerAddress,
        routerAddress: venue.routerAddress,
        feeTiers: [500, 3000, 10000],
      },
      venue.name,
    );
  }

  async getPools(tokens?: Address[]): Promise<NormalizedPool[]> {
    if (!tokens || tokens.length < 2) return [];

    const pools: NormalizedPool[] = [];

    // Build all token pairs
    for (let i = 0; i < tokens.length - 1; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        const tokenA = tokens[i] as ViemAddress;
        const tokenB = tokens[j] as ViemAddress;

        for (const fee of this.cfg.feeTiers) {
          try {
            const poolAddress = await this.client.readContract({
              address: this.cfg.factoryAddress as ViemAddress,
              abi: FACTORY_ABI,
              functionName: "getPool",
              args: [tokenA, tokenB, fee],
            });

            if (poolAddress === "0x0000000000000000000000000000000000000000") {
              continue;
            }

            const [slot0, liquidity, token0, token1] =
              await this.client.multicall({
                contracts: [
                  { address: poolAddress, abi: POOL_ABI, functionName: "slot0" },
                  { address: poolAddress, abi: POOL_ABI, functionName: "liquidity" },
                  { address: poolAddress, abi: POOL_ABI, functionName: "token0" },
                  { address: poolAddress, abi: POOL_ABI, functionName: "token1" },
                ],
                allowFailure: false,
              });

            const sqrtPrice = BigInt((slot0 as any)[0]);
            const liq = liquidity as bigint;
            const price0Per1 = this.sqrtPriceX96ToPrice(sqrtPrice);

            const t0Addr = (token0 as string).toLowerCase() as Address;
            const t1Addr = (token1 as string).toLowerCase() as Address;
            const [t0Meta, t1Meta] = await Promise.all([
              this.resolveTokenMeta(t0Addr as ViemAddress),
              this.resolveTokenMeta(t1Addr as ViemAddress),
            ]);

            const liquidityUsd = estimateV3LiquidityUsd(
              liq, sqrtPrice, t0Meta.decimals, t1Meta.decimals, t0Meta.symbol, t1Meta.symbol
            );

            pools.push({
              poolId: poolAddress.toLowerCase(),
              venueId: this.venueId,
              venueName: this.venueName,
              chainId: this.chainId,
              token0: t0Addr,
              token1: t1Addr,
              token0Symbol: t0Meta.symbol,
              token1Symbol: t1Meta.symbol,
              token0Decimals: t0Meta.decimals,
              token1Decimals: t1Meta.decimals,
              feeBps: fee / 100,
              liquidityUsd,
              price0Per1,
              price1Per0: price0Per1 > 0 ? 1 / price0Per1 : 0,
              sqrtPriceX96: sqrtPrice.toString(),
              tick: Number((slot0 as any)[1]),
              lastUpdated: new Date(),
            });
          } catch {
            // Pool not found or error — skip
          }
        }
      }
    }

    return pools;
  }

  async getQuote(params: QuoteParams): Promise<QuoteResult> {
    // Find matching pool to get fee
    const feeTier = await this.resolveFeeTier(
      params.tokenIn as ViemAddress,
      params.tokenOut as ViemAddress
    );

    try {
      const result = await this.client.simulateContract({
        address: this.cfg.quoterV2Address as ViemAddress,
        abi: QUOTER_V2_ABI,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn: params.tokenIn as ViemAddress,
            tokenOut: params.tokenOut as ViemAddress,
            amountIn: BigInt(params.amountIn),
            fee: feeTier,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });

      const [amountOut, , , gasEstimate] = result.result as [
        bigint,
        bigint,
        number,
        bigint,
      ];
      const amountOutMin =
        (amountOut * BigInt(10_000 - params.slippageBps)) / 10_000n;
      const priceImpactBps = this.estimatePriceImpact(
        BigInt(params.amountIn),
        amountOut
      );

      return {
        amountOut: amountOut.toString(),
        amountOutMin: amountOutMin.toString(),
        priceImpactBps,
        gasEstimate: gasEstimate.toString(),
        feePaid: ((amountOut * BigInt(feeTier)) / 1_000_000n).toString(),
        route: [params.tokenIn, params.tokenOut],
      };
    } catch (err: unknown) {
      throw new ArbitexError(
        ErrorCode.ADAPTER_ERROR,
        `UniswapV3 quote failed: ${String(err)}`,
        { params }
      );
    }
  }

  async buildSwapCalldata(params: SwapParams): Promise<SwapCalldata> {
    const feeTier = await this.resolveFeeTier(
      params.tokenIn as ViemAddress,
      params.tokenOut as ViemAddress
    );

    const data = encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: params.tokenIn as ViemAddress,
          tokenOut: params.tokenOut as ViemAddress,
          fee: feeTier,
          recipient: params.recipient as ViemAddress,
          amountIn: BigInt(params.amountIn),
          amountOutMinimum: BigInt(params.amountOutMin),
          sqrtPriceLimitX96: 0n,
        },
      ],
    });

    const gasEstimate = await this.client.estimateGas({
      to: this.cfg.routerAddress as ViemAddress,
      data,
      account: params.recipient as ViemAddress,
    }).catch(() => 300_000n); // fallback estimate

    return {
      to: this.cfg.routerAddress,
      data,
      value: "0",
      gasEstimate: gasEstimate.toString(),
    };
  }

  async estimateGas(calldata: SwapCalldata, from: Address): Promise<bigint> {
    return this.client.estimateGas({
      to: calldata.to as ViemAddress,
      data: calldata.data as `0x${string}`,
      account: from as ViemAddress,
    });
  }

  async supportsToken(token: Address): Promise<boolean> {
    // Check token has non-zero code (is a contract)
    const code = await this.client.getCode({ address: token as ViemAddress });
    return code !== undefined && code !== "0x";
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    try {
      await this.client.readContract({
        address: this.cfg.factoryAddress as ViemAddress,
        abi: parseAbi(["function owner() view returns (address)"]),
        functionName: "owner",
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, detail: String(err) };
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private sqrtPriceX96ToPrice(sqrtPriceX96: bigint): number {
    if (sqrtPriceX96 === 0n) return 0;
    // price = (sqrtPriceX96 / 2^96)^2
    const Q96 = 2n ** 96n;
    const price =
      Number((sqrtPriceX96 * sqrtPriceX96) / Q96) / Number(Q96);
    return price;
  }

  private estimatePriceImpact(amountIn: bigint, amountOut: bigint): number {
    // Simplified; production should use tick math
    if (amountIn === 0n) return 0;
    return Math.min(100, Number((amountIn - amountOut) * 10_000n / amountIn));
  }

  private async resolveFeeTier(
    tokenA: ViemAddress,
    tokenB: ViemAddress
  ): Promise<number> {
    // Find the fee tier with most liquidity — try 3000 first as default
    for (const fee of [3000, 500, 10000]) {
      const pool = await this.client.readContract({
        address: this.cfg.factoryAddress as ViemAddress,
        abi: FACTORY_ABI,
        functionName: "getPool",
        args: [tokenA, tokenB, fee],
      });
      if (pool !== "0x0000000000000000000000000000000000000000") {
        return fee;
      }
    }
    return 3000; // default
  }
}

export { UNISWAP_V3_MAINNET, UNISWAP_V3_AVALANCHE, TRADERJOE_V2_1_AVALANCHE, V3_CONFIGS_BY_CHAIN };
