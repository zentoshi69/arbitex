import {
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

export type AlgebraV1Config = {
  venueId: string;
  chainId: number;
  factoryAddress: Address;
  routerAddress: Address;
  /** Known pool addresses — Algebra has 1 pool per pair with dynamic fees, so we track them explicitly */
  knownPools: Address[];
};

export class AlgebraV1Adapter implements IDexAdapter {
  readonly venueId: string;
  readonly venueName: string;
  readonly chainId: number;
  readonly protocol = "algebra_v1";

  private tokenMetaCache = new Map<string, { symbol: string; decimals: number }>();

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
          liquidityUsd: 0,
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
    throw new ArbitexError(ErrorCode.ADAPTER_ERROR, "Algebra quote not yet implemented", { params });
  }

  async buildSwapCalldata(params: SwapParams): Promise<SwapCalldata> {
    throw new ArbitexError(ErrorCode.ADAPTER_ERROR, "Algebra swap not yet implemented", { params });
  }

  async estimateGas(_calldata: SwapCalldata, _from: Address): Promise<bigint> {
    return 350_000n;
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
