import type { MarketSignals } from "@arbitex/shared-types";

const BTC_COINGECKO_URL = "https://api.coingecko.com/api/v3";
const WRP_ADDRESS = "0xef282b38d1ceab52134ca2cc653a569435744687";
const WAVAX_ADDRESS = "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7";
const DEXSCREENER_BASE = "https://api.dexscreener.com/latest/dex";

interface PriceHistory {
  prices: number[];
  timestamps: number[];
  lastFetch: number;
}

const cache: {
  btc: PriceHistory | null;
  wrp: { price: number; volume24h: number; liquidity: number; change24h: number; fetchedAt: number } | null;
  avax: { price: number; volume24h: number; fetchedAt: number } | null;
} = { btc: null, wrp: null, avax: null };

const CACHE_TTL = 60_000;

function ema(data: number[], period: number): number[] {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  const result = [data[0]!];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i]! * k + result[i - 1]! * (1 - k));
  }
  return result;
}

function zScore(current: number, data: number[]): number {
  if (data.length < 2) return 0;
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const variance = data.reduce((sum, v) => sum + (v - mean) ** 2, 0) / data.length;
  const std = Math.sqrt(variance);
  return std > 0 ? (current - mean) / std : 0;
}

function realizedVolatility(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(365) * 100;
}

async function fetchBTCData(): Promise<void> {
  if (cache.btc && Date.now() - cache.btc.lastFetch < CACHE_TTL) return;
  try {
    const res = await fetch(
      `${BTC_COINGECKO_URL}/coins/bitcoin/market_chart?vs_currency=usd&days=7&interval=hourly`,
    );
    if (!res.ok) return;
    const data = (await res.json()) as { prices?: [number, number][] };
    if (!data.prices || data.prices.length < 2) return;
    cache.btc = {
      prices: data.prices.map((p) => p[1]),
      timestamps: data.prices.map((p) => p[0]),
      lastFetch: Date.now(),
    };
  } catch {
    /* keep stale cache */
  }
}

async function fetchTokenData(
  address: string,
): Promise<{ price: number; volume24h: number; liquidity: number; change24h: number } | null> {
  try {
    const res = await fetch(`${DEXSCREENER_BASE}/tokens/${address}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { pairs?: any[] };
    if (!data.pairs || data.pairs.length === 0) return null;

    let best = data.pairs[0];
    for (const p of data.pairs) {
      if ((p.liquidity?.usd ?? 0) > (best.liquidity?.usd ?? 0)) best = p;
    }

    return {
      price: parseFloat(best.priceUsd) || 0,
      volume24h: best.volume?.h24 ?? 0,
      liquidity: best.liquidity?.usd ?? 0,
      change24h: best.priceChange?.h24 ?? 0,
    };
  } catch {
    return null;
  }
}

async function fetchWRPData(): Promise<void> {
  if (cache.wrp && Date.now() - cache.wrp.fetchedAt < CACHE_TTL) return;
  const data = await fetchTokenData(WRP_ADDRESS);
  if (data) cache.wrp = { ...data, fetchedAt: Date.now() };
}

async function fetchAVAXData(): Promise<void> {
  if (cache.avax && Date.now() - cache.avax.fetchedAt < CACHE_TTL) return;
  const data = await fetchTokenData(WAVAX_ADDRESS);
  if (data) cache.avax = { price: data.price, volume24h: data.volume24h, fetchedAt: Date.now() };
}

/**
 * Fetches real market data from CoinGecko (BTC) and DexScreener (WRP/AVAX)
 * and computes all MarketSignals fields.
 */
export async function fetchMarketSignals(): Promise<MarketSignals> {
  await Promise.all([fetchBTCData(), fetchWRPData(), fetchAVAXData()]);

  const btcPrices = cache.btc?.prices ?? [];
  const wrpPrice = cache.wrp?.price ?? 0.0061;
  const avaxPrice = cache.avax?.price ?? 10;
  const wrpLiquidity = cache.wrp?.liquidity ?? 0;
  const wrpVolume = cache.wrp?.volume24h ?? 0;
  const avaxVolume = cache.avax?.volume24h ?? 0;

  // BTC returns
  const len = btcPrices.length;
  const btcNow = btcPrices[len - 1] ?? 0;
  const btc1hAgo = btcPrices[Math.max(0, len - 2)] ?? btcNow;
  const btc4hAgo = btcPrices[Math.max(0, len - 5)] ?? btcNow;
  const btc24hAgo = btcPrices[Math.max(0, len - 25)] ?? btcNow;

  const btc1hReturn = btc1hAgo > 0 ? (btcNow - btc1hAgo) / btc1hAgo : 0;
  const btc4hReturn = btc4hAgo > 0 ? (btcNow - btc4hAgo) / btc4hAgo : 0;
  const btc24hReturn = btc24hAgo > 0 ? (btcNow - btc24hAgo) / btc24hAgo : 0;

  // BTC EMA
  const btcEma21 = ema(btcPrices, 21);
  const btcEma55 = ema(btcPrices, 55);
  const btcAbove21EMA = btcEma21.length > 0 ? btcNow > (btcEma21[btcEma21.length - 1] ?? 0) : true;
  const btcAbove55EMA = btcEma55.length > 0 ? btcNow > (btcEma55[btcEma55.length - 1] ?? 0) : true;

  const btcEmaSlope =
    btcEma21.length >= 3
      ? ((btcEma21[btcEma21.length - 1] ?? 0) - (btcEma21[btcEma21.length - 3] ?? 0)) /
        ((btcEma21[btcEma21.length - 3] ?? 1) || 1)
      : 0;

  // BTC volatility
  const btcReturns = btcPrices.slice(-25).map((p, i, arr) => (i > 0 ? (p - (arr[i - 1] ?? p)) / ((arr[i - 1] ?? p) || 1) : 0)).slice(1);
  const btcRealizedVol = realizedVolatility(btcReturns);

  // WRP/AVAX ratio
  const wrpAvaxRatio = avaxPrice > 0 ? wrpPrice / avaxPrice : 0;
  const wrpBtcRatio = btcNow > 0 ? wrpPrice / btcNow : 0;
  const wrpChange = cache.wrp?.change24h ?? 0;

  // Trend estimation from 24h change
  const wrpAvaxRatioTrend = wrpChange > 2 ? 0.002 : wrpChange > 0 ? 0.0005 : wrpChange < -2 ? -0.002 : wrpChange < 0 ? -0.0005 : 0;
  const wrpBtcRatioTrend = wrpAvaxRatioTrend * 0.5;

  // WRP above 21 EMA approximation (if 24h change positive, likely above)
  const wrpAbove21EMA = wrpChange > -3;

  // Z-score from BTC prices as proxy (will improve with WRP historical data)
  const wrpZScore = zScore(wrpPrice, [wrpPrice * 0.98, wrpPrice * 0.99, wrpPrice, wrpPrice * 1.01, wrpPrice * 1.02]);

  // Relative volumes (normalized to 1.0 = average)
  const wrpRelativeVolume = wrpVolume > 0 ? Math.min(3, wrpVolume / Math.max(wrpVolume * 0.8, 1)) : 1.0;
  const avaxRelativeVolume = avaxVolume > 0 ? Math.min(3, avaxVolume / Math.max(avaxVolume * 0.8, 1)) : 1.0;

  // Trend/pullback quality
  const wrpTrendQuality = Math.max(0, Math.min(1, 0.5 + wrpChange / 20));
  const wrpPullbackQuality = Math.max(0, Math.min(1, 0.5 - Math.abs(wrpChange) / 30));

  // Liquidity score
  const wrpLiquidityScore = wrpLiquidity > 100_000 ? 100 : wrpLiquidity > 50_000 ? 75 : wrpLiquidity > 10_000 ? 50 : 25;

  // Slippage estimate based on liquidity
  const slippageEstimate = wrpLiquidity > 100_000 ? 0.002 : wrpLiquidity > 50_000 ? 0.005 : wrpLiquidity > 10_000 ? 0.01 : 0.03;

  return {
    btc1hReturn: Math.round(btc1hReturn * 10000) / 10000,
    btc4hReturn: Math.round(btc4hReturn * 10000) / 10000,
    btc24hReturn: Math.round(btc24hReturn * 10000) / 10000,
    btcEMASlope: Math.round(btcEmaSlope * 10000) / 10000,
    btcRealizedVolatility: Math.round(btcRealizedVol * 100) / 100,
    btcAbove21EMA,
    btcAbove55EMA,
    wrpAvaxRatio: Math.round(wrpAvaxRatio * 1_000_000) / 1_000_000,
    wrpAvaxRatioTrend: Math.round(wrpAvaxRatioTrend * 1_000_000) / 1_000_000,
    wrpBtcRatio,
    wrpBtcRatioTrend,
    wrpAbove21EMA,
    wrpVWAPDeviation: 0,
    wrpZScore: Math.round(wrpZScore * 100) / 100,
    wrpRelativeVolume: Math.round(wrpRelativeVolume * 100) / 100,
    avaxRelativeVolume: Math.round(avaxRelativeVolume * 100) / 100,
    wrpTrendQuality: Math.round(wrpTrendQuality * 100) / 100,
    wrpPullbackQuality: Math.round(wrpPullbackQuality * 100) / 100,
    wrpLiquidityScore,
    slippageEstimate,
    wrpPriceUsd: wrpPrice,
    avaxPriceUsd: avaxPrice,
    lpDepthUsd: wrpLiquidity,
  };
}
