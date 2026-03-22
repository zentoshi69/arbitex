import { Controller, Get, Module, Injectable, BadRequestException, Query, Logger, UseGuards } from "@nestjs/common";
import { createChainClient } from "@arbitex/chain";
import { config } from "@arbitex/config";
import { prisma } from "@arbitex/db";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.module.js";

const log = new Logger("MarketService");

const isHexAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v.trim());
const ZERO = "0x0000000000000000000000000000000000000000";
const asViemAddress = (v: string) => v.toLowerCase() as `0x${string}`;
const WRP_TOKEN = "0xeF282B38D1ceAB52134CA2cc653a569435744687";
const WAVAX_TOKEN = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";
const USDC_TOKEN = "0xA7D7079b0FEAD91F3e65f86E8915Cb59c1a4C664";
const USDC_NATIVE = "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E";
const BLACKHOLE_POOL_WRP_USDC = "0xc26847bfa980A72c82e924899A989c47b088d7da";
const isWrpSymbol = (s: string) => ["WRP", "WARP"].includes(s.toUpperCase());
const isWavaxSymbol = (s: string) => ["WAVAX", "AVAX"].includes(s.toUpperCase());

const KNOWN_FACTORIES = [
  { addr: "0x9Ad6C38BE94206cA50bb0d90783181834C294Ff3", name: "TraderJoe" },
  { addr: "0xefa94DE7a4656D787667C749f7E1223D71E9FD88", name: "Pangolin" },
];

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
  private pickUsdQuoteFromPair(
    data: { symbol0: string; symbol1: string; price0Per1: string | null; price1Per0: string | null },
    targetSymbol: string
  ): number | null {
    const s0 = String(data.symbol0).toUpperCase();
    const s1 = String(data.symbol1).toUpperCase();
    const usdcLike = (s: string) => s === "USDC" || s === "USDC.E";
    const matchTarget = (s: string) => {
      const t = targetSymbol.toUpperCase();
      if (s === t) return true;
      if ((t === "WRP" || t === "WARP" || t === "WAVAX") && isWrpSymbol(s) && (t === "WRP" || t === "WARP")) return true;
      if (t === "WAVAX" && s === "WAVAX") return true;
      return false;
    };

    if (matchTarget(s1) && usdcLike(s0)) {
      const p = Number(data.price0Per1);
      return Number.isFinite(p) && p > 0 ? p : null;
    }
    if (matchTarget(s0) && usdcLike(s1)) {
      const p = Number(data.price1Per0);
      return Number.isFinite(p) && p > 0 ? p : null;
    }
    return null;
  }

  private clientForChain(chainId: number) {
    if (chainId === 43114) {
      if (!config.AVALANCHE_RPC_URL) throw new BadRequestException("Missing AVALANCHE_RPC_URL");
      return createChainClient({ rpcUrl: config.AVALANCHE_RPC_URL, chainId });
    }
    // default: ethereum
    return createChainClient({ rpcUrl: config.ETHEREUM_RPC_URL ?? "", chainId: chainId || 1 });
  }

  async priceFromPair(chainId: number, pairAddress: string) {
    if (!isHexAddress(pairAddress)) throw new BadRequestException("Invalid pair address");
    const client = this.clientForChain(chainId);
    const pair = asViemAddress(pairAddress);

    const [token0, token1, reserves] = await Promise.all([
      client.readContract({ address: pair, abi: UNISWAPV2_PAIR_ABI, functionName: "token0" }),
      client.readContract({ address: pair, abi: UNISWAPV2_PAIR_ABI, functionName: "token1" }),
      client.readContract({ address: pair, abi: UNISWAPV2_PAIR_ABI, functionName: "getReserves" }),
    ]);
    const [r0, r1] = reserves as readonly [bigint, bigint, number];

    const [dec0Raw, dec1Raw, sym0, sym1] = await Promise.all([
      client.readContract({ address: asViemAddress(String(token0)), abi: ERC20_ABI, functionName: "decimals" }).catch(() => 18),
      client.readContract({ address: asViemAddress(String(token1)), abi: ERC20_ABI, functionName: "decimals" }).catch(() => 18),
      client.readContract({ address: asViemAddress(String(token0)), abi: ERC20_ABI, functionName: "symbol" }).catch(() => "T0"),
      client.readContract({ address: asViemAddress(String(token1)), abi: ERC20_ABI, functionName: "symbol" }).catch(() => "T1"),
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
      address: asViemAddress(factory),
      abi: UNISWAPV2_FACTORY_ABI,
      functionName: "getPair",
      args: [asViemAddress(tokenA), asViemAddress(tokenB)],
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

  async tokenPrices(): Promise<{
    updatedAt: string;
    tokens: Record<string, { usd: number | null; source: string; change24h: number | null }>;
  }> {
    const tokens: Record<string, { usd: number | null; source: string; change24h: number | null }> = {
      WRP: { usd: null, source: "none", change24h: null },
      AVAX: { usd: null, source: "none", change24h: null },
    };

    // Try on-chain WRP/USDC price from any enabled Avalanche venue
    try {
      const avaxVenues = await prisma.venue.findMany({
        where: { chainId: 43114, isEnabled: true },
        select: { id: true, factoryAddress: true, name: true },
      });
      const wrp = WRP_TOKEN;
      const usdc = USDC_TOKEN;
      const wavax = WAVAX_TOKEN;

      for (const v of avaxVenues) {
        if (!v.factoryAddress || !isHexAddress(v.factoryAddress)) continue;
        try {
          const pair = await this.getPairAddress(43114, v.factoryAddress, wrp, usdc);
          if (!pair || String(pair).toLowerCase() === ZERO) continue;
          const data = await this.priceFromPair(43114, String(pair));
          log.debug(`WRP venue ${v.name} pair symbols: ${data.symbol0}/${data.symbol1}`);
          const price = this.pickUsdQuoteFromPair(data, "WRP");
          if (price !== null && price > 0) {
            tokens.WRP = { usd: price, source: `on-chain:${v.name}`, change24h: null };
            break;
          }
        } catch (e) {
          log.debug(`WRP venue ${v.name} failed: ${e}`);
        }
      }

      if (!tokens.WRP?.usd) {
        try {
          const data = await this.priceFromPair(43114, BLACKHOLE_POOL_WRP_USDC);
          log.debug(`Blackhole pool symbols: ${data.symbol0}/${data.symbol1}, p0Per1=${data.price0Per1}, p1Per0=${data.price1Per0}`);
          const price = this.pickUsdQuoteFromPair(data, "WRP");
          if (price !== null && price > 0) {
            tokens.WRP = { usd: price, source: "on-chain:Blackhole", change24h: null };
          } else {
            log.warn(`Blackhole WRP/USDC pool returned no usable price (symbols: ${data.symbol0}/${data.symbol1})`);
          }
        } catch (e) {
          log.warn(`Blackhole WRP/USDC fallback failed: ${e}`);
        }
      }

      // AVAX/USDC on-chain
      for (const v of avaxVenues) {
        if (!v.factoryAddress || !isHexAddress(v.factoryAddress)) continue;
        try {
          const pair = await this.getPairAddress(43114, v.factoryAddress, wavax, usdc);
          if (!pair || String(pair).toLowerCase() === ZERO) continue;
          const data = await this.priceFromPair(43114, String(pair));
          const price = this.pickUsdQuoteFromPair(data, "WAVAX");
          if (price !== null && price > 0) {
            tokens.AVAX = { usd: price, source: `on-chain:${v.name}`, change24h: null };
            break;
          }
        } catch (e) {
          log.debug(`AVAX venue failed: ${e}`);
        }
      }
    } catch (e) {
      log.warn(`On-chain pricing failed, falling through to CoinGecko: ${e}`);
    }

    // CoinGecko fallback for AVAX (and reference data)
    try {
      const cgRes = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=avalanche-2&vs_currencies=usd&include_24hr_change=true"
      );
      if (cgRes.ok) {
        const cg = (await cgRes.json()) as Record<string, any>;
        const avaxCg = cg["avalanche-2"];
        if (avaxCg?.usd && (!tokens.AVAX?.usd || tokens.AVAX.source === "none")) {
          tokens.AVAX = { usd: avaxCg.usd, source: "coingecko", change24h: avaxCg.usd_24h_change ?? null };
        }
        if (tokens.AVAX?.usd && avaxCg?.usd_24h_change != null && tokens.AVAX.change24h === null) {
          tokens.AVAX.change24h = avaxCg.usd_24h_change;
        }
      }
    } catch { /* CoinGecko unavailable */ }

    // WRP/WAVAX fallback — derive WRP USD via (AVAX per WRP) × AVAX/USD
    if (!tokens.WRP?.usd && tokens.AVAX?.usd) {
      for (const fac of KNOWN_FACTORIES) {
        try {
          const pair = await this.getPairAddress(43114, fac.addr, WRP_TOKEN, WAVAX_TOKEN);
          if (!pair || String(pair).toLowerCase() === ZERO) continue;
          const data = await this.priceFromPair(43114, String(pair));
          const s0 = String(data.symbol0).toUpperCase();
          const s1 = String(data.symbol1).toUpperCase();
          log.debug(`WRP/WAVAX ${fac.name}: ${s0}/${s1}, p0Per1=${data.price0Per1}, p1Per0=${data.price1Per0}`);

          let avaxPerWrp: number | null = null;
          if (isWavaxSymbol(s0) && isWrpSymbol(s1)) {
            avaxPerWrp = Number(data.price0Per1);
          } else if (isWrpSymbol(s0) && isWavaxSymbol(s1)) {
            avaxPerWrp = Number(data.price1Per0);
          }

          if (avaxPerWrp && Number.isFinite(avaxPerWrp) && avaxPerWrp > 0) {
            const wrpUsd = avaxPerWrp * tokens.AVAX.usd!;
            tokens.WRP = { usd: wrpUsd, source: `on-chain:${fac.name} (via AVAX)`, change24h: null };
            log.debug(`WRP price via ${fac.name}: ${avaxPerWrp} AVAX × $${tokens.AVAX.usd} = $${wrpUsd.toFixed(6)}`);
            break;
          }
        } catch (e) {
          log.debug(`WRP/WAVAX ${fac.name} failed: ${e}`);
        }
      }
    }

    // WRP/native-USDC fallback (native USDC at 0xB97…)
    if (!tokens.WRP?.usd) {
      for (const fac of KNOWN_FACTORIES) {
        try {
          const pair = await this.getPairAddress(43114, fac.addr, WRP_TOKEN, USDC_NATIVE);
          if (!pair || String(pair).toLowerCase() === ZERO) continue;
          const data = await this.priceFromPair(43114, String(pair));
          const price = this.pickUsdQuoteFromPair(data, "WRP");
          if (price !== null && price > 0) {
            tokens.WRP = { usd: price, source: `on-chain:${fac.name} (native USDC)`, change24h: null };
            break;
          }
        } catch (e) {
          log.debug(`WRP/native-USDC ${fac.name} failed: ${e}`);
        }
      }
    }

    return { updatedAt: new Date().toISOString(), tokens };
  }
}

@Controller("market")
@UseGuards(JwtAuthGuard, RolesGuard)
export class MarketController {
  constructor(private readonly svc: MarketService) {}

  @Get("prices")
  async prices(
    @Query("pangolinVenueId") pangolinVenueId: string | undefined,
    @Query("blackholeVenueId") blackholeVenueId: string | undefined,
    @Query("traderjoeVenueId") traderjoeVenueId: string | undefined,
    @Query("uniswapVenueId") uniswapVenueId: string | undefined
  ) {
    let venueIds = [pangolinVenueId, blackholeVenueId, traderjoeVenueId, uniswapVenueId].filter(Boolean) as string[];

    if (venueIds.length === 0) {
      const avaxVenues = await prisma.venue.findMany({
        where: { chainId: 43114, isEnabled: true },
        select: { id: true },
      });
      venueIds = avaxVenues.map((v) => v.id);
    }

    return this.svc.prices({
      chainId: 43114,
      venueIds,
      wrp: WRP_TOKEN,
      usdc: USDC_TOKEN,
      wavax: WAVAX_TOKEN,
    });
  }

  @Get("tokens")
  async tokenPrices() {
    return this.svc.tokenPrices();
  }
}

@Module({
  controllers: [MarketController],
  providers: [MarketService],
})
export class MarketModule {}

