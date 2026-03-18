import { Controller, Get, Module, Injectable, BadRequestException, Query } from "@nestjs/common";
import { createChainClient } from "@arbitex/chain";
import { config } from "@arbitex/config";
import { prisma } from "@arbitex/db";
import { Public } from "../auth/auth.module.js";

const isHexAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v.trim());
const ZERO = "0x0000000000000000000000000000000000000000";

function toFixedDecimalString(value: bigint, decimals: number): string {
  const d = BigInt(decimals);
  const base = 10n ** d;
  const sign = value < 0n ? "-" : "";
  const v = value < 0n ? -value : value;
  const whole = v / base;
  const frac = v % base;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracStr.length ? `${sign}${whole.toString()}.${fracStr}` : `${sign}${whole.toString()}`;
}

const UNISWAPV2_PAIR_ABI = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }] },
] as const;

const UNISWAPV2_FACTORY_ABI = [
  {
    type: "function",
    name: "getPair",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "address" }],
  },
] as const;

const ERC20_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

@Injectable()
class MarketService {
  private clientForChain(chainId: number) {
    if (chainId === 43114) {
      if (!config.AVALANCHE_RPC_URL) throw new BadRequestException("Missing AVALANCHE_RPC_URL");
      return createChainClient({ rpcUrl: config.AVALANCHE_RPC_URL, chainId });
    }
    // default: ethereum
    return createChainClient({ rpcUrl: config.ETHEREUM_RPC_URL, chainId: chainId || 1 });
  }

  async priceFromPair(chainId: number, pairAddress: string) {
    if (!isHexAddress(pairAddress)) throw new BadRequestException("Invalid pair address");
    const client = this.clientForChain(chainId);
    const pair = pairAddress as `0x${string}`;

    const [token0, token1, reserves] = await Promise.all([
      client.readContract({ address: pair, abi: UNISWAPV2_PAIR_ABI, functionName: "token0" }),
      client.readContract({ address: pair, abi: UNISWAPV2_PAIR_ABI, functionName: "token1" }),
      client.readContract({ address: pair, abi: UNISWAPV2_PAIR_ABI, functionName: "getReserves" }),
    ]);
    const [r0, r1] = reserves as readonly [bigint, bigint, number];

    const [dec0Raw, dec1Raw, sym0, sym1] = await Promise.all([
      client.readContract({ address: token0 as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" }).catch(() => 18),
      client.readContract({ address: token1 as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" }).catch(() => 18),
      client.readContract({ address: token0 as `0x${string}`, abi: ERC20_ABI, functionName: "symbol" }).catch(() => "T0"),
      client.readContract({ address: token1 as `0x${string}`, abi: ERC20_ABI, functionName: "symbol" }).catch(() => "T1"),
    ]);
    const dec0 = Number(dec0Raw);
    const dec1 = Number(dec1Raw);

    // Return prices as fixed-point strings (18 decimals) to avoid float errors.
    // token1 per token0: (r1/10^dec1)/(r0/10^dec0) = r1*10^dec0 / (r0*10^dec1)
    const scale = 18;
    const price1Per0_x = r0 === 0n ? null : (r1 * 10n ** BigInt(dec0 + scale)) / (r0 * 10n ** BigInt(dec1));
    const price0Per1_x = r1 === 0n ? null : (r0 * 10n ** BigInt(dec1 + scale)) / (r1 * 10n ** BigInt(dec0));

    return {
      pair: pairAddress,
      token0: String(token0),
      token1: String(token1),
      symbol0: String(sym0),
      symbol1: String(sym1),
      reserve0: r0.toString(),
      reserve1: r1.toString(),
      price0Per1: price0Per1_x === null ? null : toFixedDecimalString(price0Per1_x, scale), // token0 per token1
      price1Per0: price1Per0_x === null ? null : toFixedDecimalString(price1Per0_x, scale), // token1 per token0
    };
  }

  private async getPairAddress(chainId: number, factory: string, tokenA: string, tokenB: string) {
    const client = this.clientForChain(chainId);
    const pair = (await client.readContract({
      address: factory as `0x${string}`,
      abi: UNISWAPV2_FACTORY_ABI,
      functionName: "getPair",
      args: [tokenA as `0x${string}`, tokenB as `0x${string}`],
    })) as string;
    return pair;
  }

  async prices(params: {
    chainId: number;
    venueIds: string[];
    wrp: string;
    usdc: string;
    wavax: string;
  }) {
    const venues = await prisma.venue.findMany({
      where: { id: { in: params.venueIds } },
      select: { id: true, name: true, protocol: true, chainId: true, factoryAddress: true },
    });

    const venueById = new Map(venues.map((v) => [v.id, v]));
    const wanted = [
      { label: "AVAX/USDC", tokenA: params.wavax, tokenB: params.usdc },
      { label: "WRP/USDC", tokenA: params.wrp, tokenB: params.usdc },
      { label: "WRP/AVAX", tokenA: params.wrp, tokenB: params.wavax },
    ];

    const out: any[] = [];
    for (const venueId of params.venueIds) {
      const v = venueById.get(venueId);
      if (!v) {
        for (const w of wanted) out.push({ label: `${w.label} (${venueId})`, ok: false, error: "Unknown venueId", data: null });
        continue;
      }
      if (v.chainId !== params.chainId) {
        for (const w of wanted) out.push({ label: `${w.label} (${v.name})`, ok: false, error: `Venue chainId mismatch (${v.chainId})`, data: null });
        continue;
      }
      if (!v.factoryAddress || !isHexAddress(v.factoryAddress)) {
        for (const w of wanted) out.push({ label: `${w.label} (${v.name})`, ok: false, error: "Venue missing factoryAddress", data: null });
        continue;
      }

      for (const w of wanted) {
        const pair = await this.getPairAddress(params.chainId, v.factoryAddress, w.tokenA, w.tokenB).catch((e) => ({ error: String(e) }));
        if ((pair as any).error) {
          out.push({ label: `${w.label} (${v.name})`, ok: false, error: (pair as any).error, data: null });
          continue;
        }
        if (!pair || String(pair).toLowerCase() === ZERO) {
          out.push({ label: `${w.label} (${v.name})`, ok: false, error: "Pair not found on factory", data: null });
          continue;
        }
        const data = await this.priceFromPair(params.chainId, String(pair)).catch((e) => ({ error: String(e) }));
        if ((data as any).error) {
          out.push({ label: `${w.label} (${v.name})`, ok: false, error: (data as any).error, data: null });
        } else {
          out.push({ label: `${w.label} (${v.name})`, ok: true, data: { ...data, venue: { id: v.id, name: v.name, protocol: v.protocol } } });
        }
      }
    }

    // USDC is treated as $1 (display-only convenience)
    out.push({ label: "USDC/USD", ok: true, data: { price1Per0: "1", symbol0: "USDC", symbol1: "USD" } });
    return {
      updatedAt: new Date().toISOString(),
      items: out,
      meta: {
        chainId: params.chainId,
        venueIds: params.venueIds,
        venueCount: params.venueIds.length,
        avalancheRpcConfigured: params.chainId === 43114 ? Boolean(config.AVALANCHE_RPC_URL) : true,
      },
    };
  }
}

@Controller("market")
export class MarketController {
  constructor(private readonly svc: MarketService) {}

  @Get("prices")
  @Public()
  prices(
    @Query("pangolinVenueId") pangolinVenueId: string | undefined,
    @Query("blackholeVenueId") blackholeVenueId: string | undefined,
    @Query("traderjoeVenueId") traderjoeVenueId: string | undefined,
    @Query("uniswapVenueId") uniswapVenueId: string | undefined
  ) {
    // Hardcoded token addresses for now (your project tokens)
    const venueIds = [pangolinVenueId, blackholeVenueId, traderjoeVenueId, uniswapVenueId].filter(Boolean) as string[];
    return this.svc.prices({
      chainId: 43114,
      venueIds,
      wrp: "0xB80d374AE04a4147Cf1269Aad5cA1ea8F97b38f8",
      usdc: "0xc3aAB273A055AD9Bc4e781A9c385b9fed5Bb677e",
      wavax: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
    });
  }
}

@Module({
  controllers: [MarketController],
  providers: [MarketService],
})
export class MarketModule {}

