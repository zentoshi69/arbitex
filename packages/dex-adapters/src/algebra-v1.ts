import {
  parseAbi,
  encodeFunctionData,
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

const ALGEBRA_POOL_ABI = parseAbi([
  "function globalState() external view returns (uint160 price, int24 tick, uint16 lastFee, uint8 pluginConfig, uint16 communityFee, bool unlocked)",
  "function liquidity() external view returns (uint128)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function tickSpacing() external view returns (int24)",
]);

const ERC20_META_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

const ALGEBRA_ROUTER_ABI = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice)) external payable returns (uint256 amountOut)",
]);

const ALGEBRA_QUOTER_ABI = parseAbi([
  "function quoteExactInputSingle(address tokenIn, address tokenOut, uint256 amountIn, uint160 limitSqrtPrice) external returns (uint256 amountOut, uint16 fee)",
]);

export type AlgebraV1Config = {
  venueId: string;
  chainId: number;
  factoryAddress: Address;
  routerAddress: Address;
  quoterAddress?: Address;
  /** Known pool addresses — Algebra has 1 pool per pair with dynamic fees, so we track them explicitly */
  knownPools: Address[];
};

export class AlgebraV1Adapter implements IDexAdapter {
  readonly venueId: string;
  readonly venueName: string;
  readonly chainId: number;
  readonly protocol = "algebra_v1";

  private tokenMetaCache = new Map<string, { symbol: string; decimals: number }>();
  private poolPairMap = new Map<string, Address>();

  constructor(
    private readonly client: PublicClient,
    private readonly cfg: AlgebraV1Config,
    venueName?: string,
  ) {
    this.venueId = cfg.venueId;
    this.chainId = cfg.chainId;
    this.venueName = venueName ?? "Algebra V1";
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

  static fromVenue(
    client: PublicClient,
    venue: { id: string; name: string; chainId: number; factoryAddress: string; routerAddress: string },
    knownPools: Address[],
  ): AlgebraV1Adapter {
    return new AlgebraV1Adapter(
      client,
      {
        venueId: venue.id,
        chainId: venue.chainId,
        factoryAddress: venue.factoryAddress,
        routerAddress: venue.routerAddress,
        knownPools,
      },
      venue.name,
    );
  }

  async getPools(_tokens?: Address[]): Promise<NormalizedPool[]> {
    const pools: NormalizedPool[] = [];

    for (const poolAddress of this.cfg.knownPools) {
      try {
        const [globalState, liquidity, token0, token1, tickSpacing] =
          await this.client.multicall({
            contracts: [
              { address: poolAddress as ViemAddress, abi: ALGEBRA_POOL_ABI, functionName: "globalState" },
              { address: poolAddress as ViemAddress, abi: ALGEBRA_POOL_ABI, functionName: "liquidity" },
              { address: poolAddress as ViemAddress, abi: ALGEBRA_POOL_ABI, functionName: "token0" },
              { address: poolAddress as ViemAddress, abi: ALGEBRA_POOL_ABI, functionName: "token1" },
              { address: poolAddress as ViemAddress, abi: ALGEBRA_POOL_ABI, functionName: "tickSpacing" },
            ],
            allowFailure: false,
          });

        const [sqrtPrice, tick, lastFee] = globalState as [bigint, number, number, number, number, boolean];
        const t0Addr = (token0 as string).toLowerCase() as Address;
        const t1Addr = (token1 as string).toLowerCase() as Address;
        const [t0Meta, t1Meta] = await Promise.all([
          this.resolveTokenMeta(t0Addr as ViemAddress),
          this.resolveTokenMeta(t1Addr as ViemAddress),
        ]);

        const price0Per1 = this.sqrtPriceX96ToPrice(sqrtPrice, t0Meta.decimals, t1Meta.decimals);
        const liq = liquidity as bigint;
        const liquidityUsd = estimateV3LiquidityUsd(
          liq, sqrtPrice, t0Meta.decimals, t1Meta.decimals, t0Meta.symbol, t1Meta.symbol
        );

        const pairKey = [t0Addr, t1Addr].sort().join("-");
        this.poolPairMap.set(pairKey, poolAddress.toLowerCase() as Address);

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
          feeBps: Math.round(lastFee / 100),
          liquidityUsd,
          price0Per1,
          price1Per0: price0Per1 > 0 ? 1 / price0Per1 : 0,
          sqrtPriceX96: sqrtPrice.toString(),
          tick: Number(tick),
          lastUpdated: new Date(),
        });
      } catch {
        // Pool not readable — skip
      }
    }

    return pools;
  }

  async getQuote(params: QuoteParams): Promise<QuoteResult> {
    const amountIn = BigInt(params.amountIn);
    if (amountIn === 0n) {
      throw new ArbitexError(ErrorCode.ADAPTER_ERROR, "Zero amountIn", { params });
    }

    try {
      const quoterAddr = this.cfg.quoterAddress ?? this.cfg.routerAddress;
      const result = await this.client.simulateContract({
        address: quoterAddr as ViemAddress,
        abi: ALGEBRA_QUOTER_ABI,
        functionName: "quoteExactInputSingle",
        args: [
          params.tokenIn as ViemAddress,
          params.tokenOut as ViemAddress,
          amountIn,
          0n,
        ],
      });

      const [amountOut, fee] = result.result as [bigint, number];
      const amountOutMin = (amountOut * BigInt(10_000 - params.slippageBps)) / 10_000n;
      const feeBps = Math.round(Number(fee) / 100);
      const feePaid = (amountIn * BigInt(feeBps)) / 10_000n;
      const priceImpactBps = amountOut > 0n
        ? Math.min(500, Math.abs(Number((amountIn * 10_000n) / amountOut) - 10_000))
        : 0;

      return {
        amountOut: amountOut.toString(),
        amountOutMin: amountOutMin.toString(),
        priceImpactBps,
        gasEstimate: "350000",
        feePaid: feePaid.toString(),
        route: [params.tokenIn, params.tokenOut],
      };
    } catch (quoterErr) {
      // Fallback: estimate from pool sqrtPrice (less accurate but functional)
      try {
        const poolAddr = this.findPoolForPair(params.tokenIn, params.tokenOut);
        if (!poolAddr) {
          throw new ArbitexError(ErrorCode.ADAPTER_ERROR, "No pool found for pair");
        }

        const [globalState, token0] = await this.client.multicall({
          contracts: [
            { address: poolAddr as ViemAddress, abi: ALGEBRA_POOL_ABI, functionName: "globalState" },
            { address: poolAddr as ViemAddress, abi: ALGEBRA_POOL_ABI, functionName: "token0" },
          ],
          allowFailure: false,
        });

        const [sqrtPrice, , lastFee] = globalState as [bigint, number, number, number, number, boolean];
        const t0 = (token0 as string).toLowerCase();
        const isToken0In = params.tokenIn.toLowerCase() === t0;
        const [t0Meta, t1Meta] = await Promise.all([
          this.resolveTokenMeta(params.tokenIn as ViemAddress),
          this.resolveTokenMeta(params.tokenOut as ViemAddress),
        ]);

        const decIn = isToken0In ? t0Meta.decimals : t1Meta.decimals;
        const decOut = isToken0In ? t1Meta.decimals : t0Meta.decimals;
        const price = this.sqrtPriceX96ToPrice(sqrtPrice, t0Meta.decimals, t1Meta.decimals);
        const effectivePrice = isToken0In ? price : (price > 0 ? 1 / price : 0);
        const inputFloat = Number(amountIn) / 10 ** decIn;
        const outputFloat = inputFloat * effectivePrice;
        const amountOut = BigInt(Math.floor(outputFloat * 10 ** decOut));
        const feeBps = Math.round(lastFee / 100);
        const afterFeeOut = amountOut * BigInt(10_000 - feeBps) / 10_000n;
        const amountOutMin = (afterFeeOut * BigInt(10_000 - params.slippageBps)) / 10_000n;

        return {
          amountOut: afterFeeOut.toString(),
          amountOutMin: amountOutMin.toString(),
          priceImpactBps: 50,
          gasEstimate: "350000",
          feePaid: (amountIn * BigInt(feeBps) / 10_000n).toString(),
          route: [params.tokenIn, params.tokenOut],
        };
      } catch {
        throw new ArbitexError(
          ErrorCode.ADAPTER_ERROR,
          `Algebra V1 quote failed: ${String(quoterErr)}`,
          { params },
        );
      }
    }
  }

  async buildSwapCalldata(params: SwapParams): Promise<SwapCalldata> {
    const data = encodeFunctionData({
      abi: ALGEBRA_ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: params.tokenIn as ViemAddress,
          tokenOut: params.tokenOut as ViemAddress,
          recipient: params.recipient as ViemAddress,
          deadline: BigInt(params.deadline),
          amountIn: BigInt(params.amountIn),
          amountOutMinimum: BigInt(params.amountOutMin),
          limitSqrtPrice: 0n,
        },
      ],
    });

    return {
      to: this.cfg.routerAddress,
      data,
      value: "0",
      gasEstimate: "350000",
    };
  }

  async estimateGas(calldata: SwapCalldata, from: Address): Promise<bigint> {
    try {
      return await this.client.estimateGas({
        account: from as ViemAddress,
        to: calldata.to as ViemAddress,
        data: calldata.data as `0x${string}`,
      });
    } catch {
      return 350_000n;
    }
  }

  private findPoolForPair(tokenIn: Address, tokenOut: Address): Address | null {
    const key = [tokenIn.toLowerCase(), tokenOut.toLowerCase()].sort().join("-");
    return this.poolPairMap.get(key) ?? this.cfg.knownPools[0] ?? null;
  }

  async supportsToken(token: Address): Promise<boolean> {
    const code = await this.client.getCode({ address: token as ViemAddress });
    return code !== undefined && code !== "0x";
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    try {
      if (this.cfg.knownPools.length === 0) return { ok: false, detail: "No known pools" };
      await this.client.readContract({
        address: this.cfg.knownPools[0] as ViemAddress,
        abi: ALGEBRA_POOL_ABI,
        functionName: "liquidity",
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, detail: String(err) };
    }
  }

  private sqrtPriceX96ToPrice(sqrtPriceX96: bigint, decimals0: number, decimals1: number): number {
    if (sqrtPriceX96 === 0n) return 0;
    const Q96 = 2n ** 96n;
    const rawPrice = Number((sqrtPriceX96 * sqrtPriceX96) / Q96) / Number(Q96);
    const decimalAdj = 10 ** (decimals0 - decimals1);
    return rawPrice * decimalAdj;
  }
}
