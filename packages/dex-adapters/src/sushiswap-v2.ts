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
  "function getPair(address tokenA, address tokenB) external view returns (address pair)",
]);

const PAIR_ABI = parseAbi([
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function totalSupply() external view returns (uint256)",
]);

const ERC20_META_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
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
  private pairAddressCache = new Map<string, ViemAddress>();
  private tokenMetaCache = new Map<string, { symbol: string; decimals: number }>();

  private pairCacheKey(a: string, b: string): string {
    const [lo, hi] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
    return `${lo}:${hi}`;
  }

  constructor(
    private readonly client: PublicClient,
    private readonly cfg: SushiSwapV2Config = SUSHISWAP_V2_MAINNET
  ) {
    this.venueId = cfg.venueId;
    this.venueName = cfg.venueName ?? "SushiSwap V2";
    this.protocol = cfg.protocol ?? "sushiswap_v2";
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

    type PairLookup = { tokenA: ViemAddress; tokenB: ViemAddress; key: string };
    const uncached: PairLookup[] = [];
    const knownPairs: ViemAddress[] = [];

    for (let i = 0; i < tokens.length - 1; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        const tokenA = tokens[i] as ViemAddress;
        const tokenB = tokens[j] as ViemAddress;
        const key = this.pairCacheKey(tokenA, tokenB);
        const cached = this.pairAddressCache.get(key);
        if (cached) {
          knownPairs.push(cached);
        } else {
          uncached.push({ tokenA, tokenB, key });
        }
      }
    }

    if (uncached.length > 0) {
      const BATCH = 20;
      for (let b = 0; b < uncached.length; b += BATCH) {
        const batch = uncached.slice(b, b + BATCH);
        const results = await this.client.multicall({
          contracts: batch.map((l) => ({
            address: this.cfg.factoryAddress as ViemAddress,
            abi: FACTORY_ABI,
            functionName: "getPair" as const,
            args: [l.tokenA, l.tokenB] as const,
          })),
          allowFailure: true,
        });
        for (let k = 0; k < batch.length; k++) {
          const r = results[k]!;
          if (r.status !== "success") continue;
          const addr = r.result as ViemAddress;
          if (!addr || addr === "0x0000000000000000000000000000000000000000") continue;
          this.pairAddressCache.set(batch[k]!.key, addr);
          knownPairs.push(addr);
        }
      }
    }

    const BATCH_STATE = 8;
    for (let b = 0; b < knownPairs.length; b += BATCH_STATE) {
      const batch = knownPairs.slice(b, b + BATCH_STATE);
      const contracts = batch.flatMap((addr) => [
        { address: addr, abi: PAIR_ABI, functionName: "getReserves" as const },
        { address: addr, abi: PAIR_ABI, functionName: "token0" as const },
        { address: addr, abi: PAIR_ABI, functionName: "token1" as const },
      ]);
      try {
        const stateResults = await this.client.multicall({ contracts, allowFailure: true });
        for (let k = 0; k < batch.length; k++) {
          const base = k * 3;
          const resR = stateResults[base];
          const t0R = stateResults[base + 1];
          const t1R = stateResults[base + 2];
          if (resR?.status !== "success" || t0R?.status !== "success" || t1R?.status !== "success") continue;

          const [reserve0, reserve1] = resR.result as [bigint, bigint, number];
          const t0Addr = (t0R.result as string).toLowerCase() as Address;
          const t1Addr = (t1R.result as string).toLowerCase() as Address;

          const [t0Meta, t1Meta] = await Promise.all([
            this.resolveTokenMeta(t0Addr as ViemAddress),
            this.resolveTokenMeta(t1Addr as ViemAddress),
          ]);

          const adj0 = Number(reserve0) / 10 ** t0Meta.decimals;
          const adj1 = Number(reserve1) / 10 ** t1Meta.decimals;
          const price0Per1 = adj1 > 0 ? adj0 / adj1 : 0;
          const price1Per0 = adj0 > 0 ? adj1 / adj0 : 0;

          const liquidityUsd = estimateV2LiquidityUsd(
            reserve0, reserve1, t0Meta.decimals, t1Meta.decimals, t0Meta.symbol, t1Meta.symbol
          );

          const pool: NormalizedPool = {
            poolId: batch[k]!.toLowerCase(),
            venueId: this.venueId,
            venueName: this.venueName,
            chainId: this.chainId,
            token0: t0Addr,
            token1: t1Addr,
            token0Symbol: t0Meta.symbol,
            token1Symbol: t1Meta.symbol,
            token0Decimals: t0Meta.decimals,
            token1Decimals: t1Meta.decimals,
            feeBps: 30,
            liquidityUsd,
            price0Per1,
            price1Per0,
            lastUpdated: new Date(),
          };

          pools.push(pool);
          this.pairCache.set(`${t0Addr}-${t1Addr}`, pool);
          this.pairCache.set(`${t1Addr}-${t0Addr}`, pool);
        }
      } catch {
        // Batch failed — skip
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
