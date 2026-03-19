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

// ── ABIs ──────────────────────────────────────────────────────────────────────

const FACTORY_ABI = parseAbi([
  "function getPair(address tokenA, address tokenB) external view returns (address pair)",
]);

const PAIR_ABI = parseAbi([
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function totalSupply() external view returns (uint256)",
]);

const ROUTER_ABI = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
]);

// ── Config ────────────────────────────────────────────────────────────────────

export type SushiSwapV2Config = {
  venueId: string;
  venueName?: string;
  protocol?: string;
  chainId: number;
  factoryAddress: Address;
  routerAddress: Address;
};

const SUSHISWAP_V2_MAINNET: SushiSwapV2Config = {
  venueId: "sushiswap-v2-mainnet",
  chainId: 1,
  factoryAddress: "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac",
  routerAddress: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
};

// ── Adapter ───────────────────────────────────────────────────────────────────

export class SushiSwapV2Adapter implements IDexAdapter {
  readonly venueId: string;
  readonly venueName: string;
  readonly chainId: number;
  readonly protocol: string;

  private pairCache = new Map<string, NormalizedPool>();

  constructor(
    private readonly client: PublicClient,
    private readonly cfg: SushiSwapV2Config = SUSHISWAP_V2_MAINNET
  ) {
    this.venueId = cfg.venueId;
    this.venueName = cfg.venueName ?? "SushiSwap V2";
    this.protocol = cfg.protocol ?? "sushiswap_v2";
    this.chainId = cfg.chainId;
  }

  async getPools(tokens?: Address[]): Promise<NormalizedPool[]> {
    if (!tokens || tokens.length < 2) return [];
    const pools: NormalizedPool[] = [];

    for (let i = 0; i < tokens.length - 1; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        const tokenA = tokens[i] as ViemAddress;
        const tokenB = tokens[j] as ViemAddress;

        try {
          const pairAddress = await this.client.readContract({
            address: this.cfg.factoryAddress as ViemAddress,
            abi: FACTORY_ABI,
            functionName: "getPair",
            args: [tokenA, tokenB],
          });

          if (pairAddress === "0x0000000000000000000000000000000000000000") continue;

          const [reserves, token0, token1] = await this.client.multicall({
            contracts: [
              { address: pairAddress, abi: PAIR_ABI, functionName: "getReserves" },
              { address: pairAddress, abi: PAIR_ABI, functionName: "token0" },
              { address: pairAddress, abi: PAIR_ABI, functionName: "token1" },
            ],
            allowFailure: false,
          });

          const [reserve0, reserve1] = reserves as [bigint, bigint, number];
          const r0 = Number(reserve0);
          const r1 = Number(reserve1);

          // Constant product price: price of token1 in token0 = reserve0/reserve1
          const price0Per1 = r1 > 0 ? r0 / r1 : 0;
          const price1Per0 = r0 > 0 ? r1 / r0 : 0;

          // Approximate liquidity (simplified — production: use USD oracle prices)
          const liquidityUsd = Math.sqrt(r0 * r1) / 1e12;

          const pool: NormalizedPool = {
            poolId: `${this.venueId}-${pairAddress.toLowerCase()}`,
            venueId: this.venueId,
            venueName: this.venueName,
            chainId: this.chainId,
            token0: (token0 as string).toLowerCase() as Address,
            token1: (token1 as string).toLowerCase() as Address,
            token0Symbol: "",
            token1Symbol: "",
            token0Decimals: 18,
            token1Decimals: 18,
            feeBps: 30, // SushiSwap fixed 0.3% fee
            liquidityUsd,
            price0Per1,
            price1Per0,
            lastUpdated: new Date(),
          };

          pools.push(pool);
          this.pairCache.set(`${tokenA}-${tokenB}`, pool);
          this.pairCache.set(`${tokenB}-${tokenA}`, pool);
        } catch {
          // Pair doesn't exist or call failed
        }
      }
    }

    return pools;
  }

  async getQuote(params: QuoteParams): Promise<QuoteResult> {
    try {
      const path = [params.tokenIn as ViemAddress, params.tokenOut as ViemAddress];
      const amounts = await this.client.readContract({
        address: this.cfg.routerAddress as ViemAddress,
        abi: ROUTER_ABI,
        functionName: "getAmountsOut",
        args: [BigInt(params.amountIn), path],
      });

      const amountOut = (amounts as bigint[])[1] ?? 0n;
      const amountIn = BigInt(params.amountIn);
      const amountOutMin =
        (amountOut * BigInt(10_000 - params.slippageBps)) / 10_000n;

      // SushiSwap fee is 0.3% of amountIn
      const feePaid = (amountIn * 30n) / 10_000n;

      // Price impact: simplified — (amountIn / reserve0) * 10000
      const priceImpactBps = Math.min(
        500,
        Number((amountIn * 10_000n) / (amountIn * 1000n))
      );

      return {
        amountOut: amountOut.toString(),
        amountOutMin: amountOutMin.toString(),
        priceImpactBps,
        gasEstimate: "180000", // SushiSwap V2 typical gas
        feePaid: feePaid.toString(),
        route: [params.tokenIn, params.tokenOut],
      };
    } catch (err) {
      throw new ArbitexError(
        ErrorCode.ADAPTER_ERROR,
        `SushiSwap quote failed: ${String(err)}`,
        { params }
      );
    }
  }

  async buildSwapCalldata(params: SwapParams): Promise<SwapCalldata> {
    const path = [params.tokenIn as ViemAddress, params.tokenOut as ViemAddress];
    const data = encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: "swapExactTokensForTokens",
      args: [
        BigInt(params.amountIn),
        BigInt(params.amountOutMin),
        path,
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
      .catch(() => 200_000n);

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
        abi: parseAbi(["function feeTo() view returns (address)"]),
        functionName: "feeTo",
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, detail: String(err) };
    }
  }
}

export { SUSHISWAP_V2_MAINNET };
