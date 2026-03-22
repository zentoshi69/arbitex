import pino, { type Logger } from "pino";

const DEFAULT_BASE_URL = "https://api.dexscreener.com/latest/dex";
const DEFAULT_CACHE_TTL_MS = 15_000;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_FETCH_CONCURRENCY = 6;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeAddr(address: string): string {
  return address.trim().toLowerCase();
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/** Raw pair object from DexScreener `tokens/{addr}` response. */
interface RawDexPair {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string; symbol?: string; name?: string };
  quoteToken?: { address?: string; symbol?: string; name?: string };
  priceNative?: string | number;
  priceUsd?: string | number;
  txns?: { h24?: { buys?: number; sells?: number } };
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  pairCreatedAt?: number;
}

export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; symbol: string; name: string };
  quoteToken: { address: string; symbol: string; name: string };
  priceUsd: number;
  priceNative: number;
  liquidityUsd: number;
  volume24h: number;
  priceChange24h: number;
  txns24h: { buys: number; sells: number };
  fdv: number;
  pairCreatedAt: number;
}

export interface DexScreenerFeedOptions {
  /** Time-to-live for cached token pair lists (default 15_000 ms). */
  cacheTtlMs?: number;
  /** Base URL without trailing slash (default DexScreener latest dex API). */
  baseUrl?: string;
  maxRetries?: number;
  baseDelayMs?: number;
  /** Parallel token requests in `refreshAll` (default 6). */
  fetchConcurrency?: number;
  logger?: Logger;
}

interface TokenCacheEntry {
  pairs: DexScreenerPair[];
  expiresAt: number;
}

function mapRawPair(raw: RawDexPair): DexScreenerPair | null {
  const pairAddress = raw.pairAddress;
  const chainId = raw.chainId;
  const dexId = raw.dexId;
  if (!pairAddress || !chainId || !dexId) {
    return null;
  }

  const bt = raw.baseToken;
  const qt = raw.quoteToken;
  if (
    !bt?.address ||
    !qt?.address ||
    bt.symbol === undefined ||
    qt.symbol === undefined ||
    bt.name === undefined ||
    qt.name === undefined
  ) {
    return null;
  }

  const txnsH24 = raw.txns?.h24;
  const priceChange = raw.priceChange;
  const liquidityUsd = toFiniteNumber(raw.liquidity?.usd, 0);

  return {
    chainId,
    dexId,
    pairAddress,
    baseToken: {
      address: bt.address,
      symbol: String(bt.symbol),
      name: String(bt.name),
    },
    quoteToken: {
      address: qt.address,
      symbol: String(qt.symbol),
      name: String(qt.name),
    },
    priceUsd: toFiniteNumber(raw.priceUsd, 0),
    priceNative: toFiniteNumber(raw.priceNative, 0),
    liquidityUsd,
    volume24h: toFiniteNumber(raw.volume?.h24, 0),
    priceChange24h:
      priceChange && typeof priceChange === "object" && "h24" in priceChange
        ? toFiniteNumber(priceChange.h24, 0)
        : 0,
    txns24h: {
      buys: txnsH24?.buys ?? 0,
      sells: txnsH24?.sells ?? 0,
    },
    fdv: toFiniteNumber(raw.fdv, 0),
    pairCreatedAt:
      raw.pairCreatedAt !== undefined && Number.isFinite(raw.pairCreatedAt)
        ? raw.pairCreatedAt
        : 0,
  };
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  const limit = Math.max(1, concurrency);
  let i = 0;

  async function worker(): Promise<void> {
    while (i < items.length) {
      const idx = i;
      i += 1;
      const item = items[idx];
      if (item !== undefined) {
        await fn(item);
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
}

export class DexScreenerFeed {
  private readonly baseUrl: string;
  private readonly cacheTtlMs: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly fetchConcurrency: number;
  private readonly log: Logger;

  private readonly tokenCache = new Map<string, TokenCacheEntry>();
  private readonly pairByAddress = new Map<string, DexScreenerPair>();
  /** Serializes network/cache work per token to avoid races between refresh and reads. */
  private readonly tokenChain = new Map<string, Promise<unknown>>();

  constructor(options: DexScreenerFeedOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.fetchConcurrency = options.fetchConcurrency ?? DEFAULT_FETCH_CONCURRENCY;
    this.log =
      options.logger ??
      pino({
        name: "DexScreenerFeed",
        level: process.env["LOG_LEVEL"] ?? "info",
      });
  }

  private async runForToken<T>(normalized: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tokenChain.get(normalized) ?? Promise.resolve();
    const execution = prev.then(() => fn());
    this.tokenChain.set(normalized, execution.catch(() => undefined));
    return execution;
  }

  private mergePairsIntoIndex(pairs: DexScreenerPair[]): void {
    for (const p of pairs) {
      this.pairByAddress.set(normalizeAddr(p.pairAddress), p);
    }
  }

  private cacheTokenPairs(normalized: string, pairs: DexScreenerPair[]): void {
    this.tokenCache.set(normalized, {
      pairs,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
    this.mergePairsIntoIndex(pairs);
  }

  private getCachedPairs(normalized: string): DexScreenerPair[] | null {
    const entry = this.tokenCache.get(normalized);
    if (!entry) {
      return null;
    }
    if (Date.now() >= entry.expiresAt) {
      this.tokenCache.delete(normalized);
      return null;
    }
    return entry.pairs;
  }

  private async fetchJson(url: string): Promise<unknown> {
    let attempt = 0;
    let delay = this.baseDelayMs;

    while (attempt <= this.maxRetries) {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });

      if (res.ok) {
        return (await res.json()) as unknown;
      }

      const retryAfter = res.headers.get("retry-after");
      const parsedRetryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : NaN;

      if (res.status === 429 || res.status >= 500) {
        if (attempt >= this.maxRetries) {
          const body = await res.text();
          this.log.error(
            { url, status: res.status, body: body.slice(0, 500) },
            "DexScreener request failed after retries",
          );
          throw new Error(`DexScreener HTTP ${res.status} for ${url}`);
        }

        const waitMs = Number.isFinite(parsedRetryMs) ? parsedRetryMs : delay;
        this.log.warn(
          { url, status: res.status, attempt, waitMs },
          "DexScreener rate limit or server error; backing off",
        );
        await res.text().catch(() => undefined);
        await sleep(waitMs);
        delay *= 2;
        attempt += 1;
        continue;
      }

      const errBody = await res.text();
      this.log.error(
        { url, status: res.status, body: errBody.slice(0, 500) },
        "DexScreener request error",
      );
      throw new Error(`DexScreener HTTP ${res.status} for ${url}`);
    }

    throw new Error(`DexScreener unreachable: ${url}`);
  }

  private parseTokenResponse(data: unknown): DexScreenerPair[] {
    if (!data || typeof data !== "object") {
      return [];
    }
    const pairsRaw = (data as { pairs?: unknown }).pairs;
    if (!Array.isArray(pairsRaw)) {
      return [];
    }

    const out: DexScreenerPair[] = [];
    for (const item of pairsRaw) {
      if (item && typeof item === "object") {
        const mapped = mapRawPair(item as RawDexPair);
        if (mapped) {
          out.push(mapped);
        }
      }
    }
    return out;
  }

  /** Internal: fetch pairs for a token and update caches (and pair index). */
  private async loadTokenPairs(normalized: string): Promise<DexScreenerPair[]> {
    const url = `${this.baseUrl}/tokens/${encodeURIComponent(normalized)}`;
    this.log.debug({ url }, "DexScreener fetch token pairs");

    const json = await this.fetchJson(url);
    const pairs = this.parseTokenResponse(json);
    this.cacheTokenPairs(normalized, pairs);
    return pairs;
  }

  /**
   * Returns cached pairs when TTL-valid; otherwise fetches from the API (serialized per token).
   */
  async getTokenPairs(tokenAddress: string): Promise<DexScreenerPair[]> {
    const normalized = normalizeAddr(tokenAddress);
    return this.runForToken(normalized, async () => {
      const cached = this.getCachedPairs(normalized);
      if (cached) {
        return cached;
      }
      return this.loadTokenPairs(normalized);
    });
  }

  /**
   * Liquidity (USD) for a pair address from cached DexScreener data.
   * Returns `0` if the pair has not been seen in any loaded token response.
   */
  async getPoolLiquidity(pairAddress: string): Promise<number> {
    const p = this.pairByAddress.get(normalizeAddr(pairAddress));
    return p?.liquidityUsd ?? 0;
  }

  /**
   * USD price from the highest-liquidity pair for this token, or `null` if none.
   */
  async getTokenPrice(tokenAddress: string): Promise<number | null> {
    const pairs = await this.getTokenPairs(tokenAddress);
    if (pairs.length === 0) {
      return null;
    }
    let best = pairs[0];
    if (!best) {
      return null;
    }
    for (const p of pairs) {
      if (p.liquidityUsd > best.liquidityUsd) {
        best = p;
      }
    }
    return best.priceUsd;
  }

  /**
   * Forces a refresh for all given token addresses (batch), bypassing TTL.
   */
  async refreshAll(tokenAddresses: string[]): Promise<void> {
    const unique = [...new Set(tokenAddresses.map(normalizeAddr))];
    if (unique.length === 0) {
      return;
    }

    await runWithConcurrency(unique, this.fetchConcurrency, async (addr) => {
      await this.runForToken(addr, async () => {
        this.tokenCache.delete(addr);
        return this.loadTokenPairs(addr);
      });
    });
  }

  /**
   * Looks up a pair by contract address across data loaded via token fetches
   * and `refreshAll`. Returns `null` if this pair was never returned by the API in a cached load.
   */
  async getPairByAddress(pairAddress: string): Promise<DexScreenerPair | null> {
    return this.pairByAddress.get(normalizeAddr(pairAddress)) ?? null;
  }
}

/** Shared default instance (15s cache TTL unless configured via `new DexScreenerFeed`). */
export const dexScreenerFeed = new DexScreenerFeed();
