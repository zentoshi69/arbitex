import {
  encodeFunctionData,
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
import { estimateV2LiquidityUsd } from "./liquidity-estimator.js";

// ── ABIs ──────────────────────────────────────────────────────────────────────

const FACTORY_ABI = parseAbi([
  "function getPair(address tokenA, address tokenB, bool stable) external view returns (address pair)",
]);

const PAIR_ABI = parseAbi([
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function stable() external view returns (bool)",
  "function totalSupply() external view returns (uint256)",
]);

const ERC20_META_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

const ROUTER_ABI = parseAbi([
  "function getAmountsOut(uint256 amountIn, (address from, address to, bool stable)[] routes) external view returns (uint256[] amounts)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, (address from, address to, bool stable)[] routes, address to, uint256 deadline) external returns (uint256[] amounts)",
]);

// ── Config ────────────────────────────────────────────────────────────────────

export type SolidlyV2Config = {
  venueId: string;
  venueName?: string;
  protocol?: string;
  chainId: number;
  factoryAddress: Address;
  routerAddress: Address;
};

// ── Adapter ───────────────────────────────────────────────────────────────────

export class SolidlyV2Adapter implements IDexAdapter {
  readonly venueId: string;
  readonly venueName: string;
  readonly chainId: number;
  readonly protocol: string;

  private pairCache = new Map<string, NormalizedPool>();
  private tokenMetaCache = new Map<string, { symbol: string; decimals: number }>();

  constructor(
    private readonly client: PublicClient,
    private readonly cfg: SolidlyV2Config,
  ) {
    this.venueId = cfg.venueId;
    this.venueName = cfg.venueName ?? "Solidly V2";
    this.protocol = cfg.protocol ?? "solidly_v2";
    this.chainId = cfg.chainId;
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

  async getPools(tokens?: Address[]): Promise<NormalizedPool[]> {
    if (!tokens || tokens.length < 2) return [];
    const pools: NormalizedPool[] = [];

    for (let i = 0; i < tokens.length - 1; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        const tokenA = tokens[i] as ViemAddress;
        const tokenB = tokens[j] as ViemAddress;

        for (const isStable of [false, true]) {
          try {
            const pairAddress = await this.client.readContract({
              address: this.cfg.factoryAddress as ViemAddress,
              abi: FACTORY_ABI,
              functionName: "getPair",
              args: [tokenA, tokenB, isStable],
            });

            if (
              pairAddress === "0x0000000000000000000000000000000000000000"
            )
              continue;

            const [reserves, token0, token1] = await this.client.multicall({
              contracts: [
                {
                  address: pairAddress,
                  abi: PAIR_ABI,
                  functionName: "getReserves",
                },
                {
                  address: pairAddress,
                  abi: PAIR_ABI,
                  functionName: "token0",
                },
                {
                  address: pairAddress,
                  abi: PAIR_ABI,
                  functionName: "token1",
                },
              ],
              allowFailure: false,
            });

            const [reserve0, reserve1] = reserves as [bigint, bigint, number];
            const t0Addr = (token0 as string).toLowerCase() as Address;
            const t1Addr = (token1 as string).toLowerCase() as Address;

            const [t0Meta, t1Meta] = await Promise.all([
              this.resolveTokenMeta(t0Addr as ViemAddress),
              this.resolveTokenMeta(t1Addr as ViemAddress),
            ]);

            const r0 = Number(reserve0);
            const r1 = Number(reserve1);

            const adj0 = r0 / 10 ** t0Meta.decimals;
            const adj1 = r1 / 10 ** t1Meta.decimals;
            const price0Per1 = adj1 > 0 ? adj0 / adj1 : 0;
            const price1Per0 = adj0 > 0 ? adj1 / adj0 : 0;
            const liquidityUsd = estimateV2LiquidityUsd(
              reserve0, reserve1, t0Meta.decimals, t1Meta.decimals, t0Meta.symbol, t1Meta.symbol
            );

            const feeBps = isStable ? 2 : 30;

            const pool: NormalizedPool = {
              poolId: pairAddress.toLowerCase(),
              venueId: this.venueId,
              venueName: this.venueName,
              chainId: this.chainId,
              token0: t0Addr,
              token1: t1Addr,
              token0Symbol: t0Meta.symbol,
              token1Symbol: t1Meta.symbol,
              token0Decimals: t0Meta.decimals,
              token1Decimals: t1Meta.decimals,
              feeBps,
              liquidityUsd,
              price0Per1,
              price1Per0,
              lastUpdated: new Date(),
            };

            pools.push(pool);
            const cacheKey = `${tokenA}-${tokenB}-${isStable}`;
            this.pairCache.set(cacheKey, pool);
          } catch {
            // Pair doesn't exist or call failed
          }
        }
      }
    }

    return pools;
  }

  async getQuote(params: QuoteParams): Promise<QuoteResult> {
    const isStable = await this.resolveStable(
      params.tokenIn as ViemAddress,
      params.tokenOut as ViemAddress,
    );

    try {
      const routes = [
        {
          from: params.tokenIn as ViemAddress,
          to: params.tokenOut as ViemAddress,
          stable: isStable,
        },
      ];

      const amounts = await this.client.readContract({
        address: this.cfg.routerAddress as ViemAddress,
        abi: ROUTER_ABI,
        functionName: "getAmountsOut",
        args: [BigInt(params.amountIn), routes],
      });

      const amountOut = (amounts as bigint[])[1] ?? 0n;
      const amountIn = BigInt(params.amountIn);
      const amountOutMin =
        (amountOut * BigInt(10_000 - params.slippageBps)) / 10_000n;

      const feeBps = isStable ? 2n : 30n;
      const feePaid = (amountIn * feeBps) / 10_000n;

      const priceImpactBps = Math.min(
        500,
        Number((amountIn * 10_000n) / (amountIn * 1000n)),
      );

      return {
        amountOut: amountOut.toString(),
        amountOutMin: amountOutMin.toString(),
        priceImpactBps,
        gasEstimate: "200000",
        feePaid: feePaid.toString(),
        route: [params.tokenIn, params.tokenOut],
      };
    } catch (err) {
      throw new ArbitexError(
        ErrorCode.ADAPTER_ERROR,
        `SolidlyV2 quote failed: ${String(err)}`,
        { params },
      );
    }
  }

  async buildSwapCalldata(params: SwapParams): Promise<SwapCalldata> {
    const isStable = await this.resolveStable(
      params.tokenIn as ViemAddress,
      params.tokenOut as ViemAddress,
    );

    const routes = [
      {
        from: params.tokenIn as ViemAddress,
        to: params.tokenOut as ViemAddress,
        stable: isStable,
      },
    ];

    const data = encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: "swapExactTokensForTokens",
      args: [
        BigInt(params.amountIn),
        BigInt(params.amountOutMin),
        routes,
        params.recipient as ViemAddress,
        BigInt(params.deadline),
      ],
    });

    const gasEstimate = await this.client
      .estimateGas({
        to: this.cfg.routerAddress as ViemAddress,
        data,
        account: params.recipient as ViemAddress,
      })
      .catch(() => 250_000n);

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
    const code = await this.client.getCode({ address: token as ViemAddress });
    return code !== undefined && code !== "0x";
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    try {
      await this.client.readContract({
        address: this.cfg.factoryAddress as ViemAddress,
        abi: parseAbi(["function allPairsLength() view returns (uint256)"]),
        functionName: "allPairsLength",
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, detail: String(err) };
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async resolveStable(
    tokenA: ViemAddress,
    tokenB: ViemAddress,
  ): Promise<boolean> {
    // Try volatile first (more common for arb), then stable
    for (const stable of [false, true]) {
      try {
        const pair = await this.client.readContract({
          address: this.cfg.factoryAddress as ViemAddress,
          abi: FACTORY_ABI,
          functionName: "getPair",
          args: [tokenA, tokenB, stable],
        });
        if (pair !== "0x0000000000000000000000000000000000000000") {
          return stable;
        }
      } catch {
        // continue
      }
    }
    return false;
  }
}
