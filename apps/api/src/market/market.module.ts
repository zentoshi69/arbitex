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

function raceTimeout<T>(p: Promise<T>, ms: number, label = "rpc"): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms),
    ),
  ]);
}

type TokenPriceCache = {
  updatedAt: string;
  tokens: Record<string, { usd: number | null; source: string; change24h: number | null }>;
};

let _priceCache: TokenPriceCache | null = null;
let _priceCacheAt = 0;
const CACHE_TTL_MS = 30_000;
const STALE_TTL_MS = 300_000;

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

  async tokenPrices(): Promise<TokenPriceCache> {
    const now = Date.now();
    if (_priceCache && now - _priceCacheAt < CACHE_TTL_MS) {
      return _priceCache;
    }

    try {
      const fresh = await raceTimeout(this.fetchTokenPricesFast(), 8_000, "tokenPrices");
      _priceCache = fresh;
      _priceCacheAt = Date.now();
      return fresh;
    } catch (e) {
      log.warn(`tokenPrices fetch failed: ${e}`);
      if (_priceCache && now - _priceCacheAt < STALE_TTL_MS) {
        return _priceCache;
      }
      return {
        updatedAt: new Date().toISOString(),
        tokens: {
          WRP: { usd: null, source: "error", change24h: null },
          AVAX: { usd: null, source: "error", change24h: null },
        },
      };
    }
  }

  private async fetchTokenPricesFast(): Promise<TokenPriceCache> {
    const tokens: TokenPriceCache["tokens"] = {
      WRP: { usd: null, source: "none", change24h: null },
      AVAX: { usd: null, source: "none", change24h: null },
      BTC: { usd: null, source: "none", change24h: null },
    };

    const [cgResult, dexResult] = await Promise.allSettled([
      this.fetchCoinGeckoPrices(),
      this.fetchDexScreenerWrp(),
    ]);

    if (cgResult.status === "fulfilled" && cgResult.value) {
      const cg = cgResult.value;
      if (cg.btcUsd) tokens.BTC = { usd: cg.btcUsd, source: "coingecko", change24h: cg.btcChange ?? null };
      if (cg.avaxUsd) tokens.AVAX = { usd: cg.avaxUsd, source: "coingecko", change24h: cg.avaxChange ?? null };
    }

    if (dexResult.status === "fulfilled" && dexResult.value) {
      const dx = dexResult.value;
      if (dx.wrpUsd) tokens.WRP = { usd: dx.wrpUsd, source: `dexscreener:${dx.source}`, change24h: dx.change24h ?? null };
      if (dx.avaxUsd && !tokens.AVAX!.usd) tokens.AVAX = { usd: dx.avaxUsd, source: "dexscreener", change24h: null };
    }

    if (!tokens.WRP!.usd || !tokens.AVAX!.usd) {
      try {
        const onChain = await raceTimeout(this.fetchOnChainPrices(), 5_000, "onchain");
        if (onChain.wrpUsd && !tokens.WRP!.usd) tokens.WRP = { usd: onChain.wrpUsd, source: onChain.wrpSource, change24h: null };
        if (onChain.avaxUsd && !tokens.AVAX!.usd) tokens.AVAX = { usd: onChain.avaxUsd, source: onChain.avaxSource, change24h: null };
      } catch (e) {
        log.debug(`On-chain fallback failed: ${e}`);
      }
    }

    return { updatedAt: new Date().toISOString(), tokens };
  }

  private async fetchCoinGeckoPrices(): Promise<{
    btcUsd: number | null; btcChange: number | null;
    avaxUsd: number | null; avaxChange: number | null;
  } | null> {
    const res = await raceTimeout(
      fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,avalanche-2&vs_currencies=usd&include_24hr_change=true"),
      5_000, "coingecko",
    );
    if (!res.ok) return null;
    const cg = (await res.json()) as Record<string, any>;
    return {
      btcUsd: cg.bitcoin?.usd ?? null,
      btcChange: cg.bitcoin?.usd_24h_change ?? null,
      avaxUsd: cg["avalanche-2"]?.usd ?? null,
      avaxChange: cg["avalanche-2"]?.usd_24h_change ?? null,
    };
  }

  private async fetchDexScreenerWrp(): Promise<{
    wrpUsd: number | null; avaxUsd: number | null; source: string; change24h: number | null;
  } | null> {
    const res = await raceTimeout(
      fetch(`https://api.dexscreener.com/latest/dex/tokens/${WRP_TOKEN}`),
      5_000, "dexscreener",
    );
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const pairs = data?.pairs;
    if (!Array.isArray(pairs) || pairs.length === 0) return null;

    const best = pairs
      .filter((p: any) => p.chainId === "avalanche" && p.priceUsd)
      .sort((a: any, b: any) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))[0];
    if (!best) return null;

    const wrpUsd = parseFloat(best.priceUsd);
    const change24h = best.priceChange?.h24 != null ? parseFloat(best.priceChange.h24) : null;

    let avaxUsd: number | null = null;
    if (best.quoteToken?.symbol?.toUpperCase() === "WAVAX" && best.priceNative) {
      const nativePrice = parseFloat(best.priceNative);
      if (nativePrice > 0 && wrpUsd > 0) avaxUsd = wrpUsd / nativePrice;
    }

    return { wrpUsd, avaxUsd, source: best.dexId ?? "unknown", change24h };
  }

  private async fetchOnChainPrices(): Promise<{
    wrpUsd: number | null; wrpSource: string;
    avaxUsd: number | null; avaxSource: string;
  }> {
    let wrpUsd: number | null = null;
    let wrpSource = "none";
    let avaxUsd: number | null = null;
    let avaxSource = "none";

    for (const fac of KNOWN_FACTORIES) {
      if (avaxUsd) break;
      try {
        const pair = await raceTimeout(this.getPairAddress(43114, fac.addr, WAVAX_TOKEN, USDC_TOKEN), 3_000, "getPair");
        if (!pair || String(pair).toLowerCase() === ZERO) continue;
        const data = await raceTimeout(this.priceFromPair(43114, String(pair)), 3_000, "priceFromPair");
        const price = this.pickUsdQuoteFromPair(data, "WAVAX");
        if (price && price > 0) { avaxUsd = price; avaxSource = `on-chain:${fac.name}`; }
      } catch { /* skip */ }
    }

    try {
      const data = await raceTimeout(this.priceFromPair(43114, BLACKHOLE_POOL_WRP_USDC), 3_000, "blackhole");
      const price = this.pickUsdQuoteFromPair(data, "WRP");
      if (price && price > 0) { wrpUsd = price; wrpSource = "on-chain:Blackhole"; }
    } catch { /* skip */ }

    if (!wrpUsd && avaxUsd) {
      for (const fac of KNOWN_FACTORIES) {
        try {
          const pair = await raceTimeout(this.getPairAddress(43114, fac.addr, WRP_TOKEN, WAVAX_TOKEN), 3_000, "getPair");
          if (!pair || String(pair).toLowerCase() === ZERO) continue;
          const data = await raceTimeout(this.priceFromPair(43114, String(pair)), 3_000, "priceFromPair");
          const s0 = String(data.symbol0).toUpperCase();
          const s1 = String(data.symbol1).toUpperCase();
          let avaxPerWrp: number | null = null;
          if (isWavaxSymbol(s0) && isWrpSymbol(s1)) avaxPerWrp = Number(data.price0Per1);
          else if (isWrpSymbol(s0) && isWavaxSymbol(s1)) avaxPerWrp = Number(data.price1Per0);
          if (avaxPerWrp && Number.isFinite(avaxPerWrp) && avaxPerWrp > 0) {
            wrpUsd = avaxPerWrp * avaxUsd;
            wrpSource = `on-chain:${fac.name} (via AVAX)`;
            break;
          }
        } catch { /* skip */ }
      }
    }

    return { wrpUsd, wrpSource, avaxUsd, avaxSource };
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

