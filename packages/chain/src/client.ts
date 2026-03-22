import {
  createPublicClient,
  fallback,
  http,
  webSocket,
  type PublicClient,
  type Transport,
  type Chain,
} from "viem";
import { mainnet, arbitrum, base, avalanche, bsc, polygon } from "viem/chains";

const CHAIN_MAP: Record<number, Chain> = {
  1: mainnet,
  56: bsc,
  137: polygon,
  42161: arbitrum,
  8453: base,
  43114: avalanche,
};

/** Default HTTP fallbacks for Avalanche C-Chain when using multi-RPC (after primary + `rpcUrls`). */
export const DEFAULT_AVAX_HTTP_RPCS: readonly string[] = [
  "https://avalanche.drpc.org",
  "https://avalanche.publicnode.com",
  "https://api.avax.network/ext/bc/C/rpc",
] as const;

const HTTP_TRANSPORT_OPTS = {
  retryCount: 3,
  retryDelay: 500,
  timeout: 10_000,
} as const;

const FALLBACK_TRANSPORT_OPTS = {
  rank: true as const,
  retryCount: 3,
  retryDelay: 500,
};

const WSS_TRANSPORT_OPTS = {
  retryCount: 3,
  retryDelay: 500,
  timeout: 10_000,
} as const;

export type RpcConfig = {
  rpcUrl: string;
  /** Additional fallback URLs (tried after `rpcUrl`). */
  rpcUrls?: string[];
  wssUrl?: string;
  archiveRpcUrl?: string;
  chainId: number;
};

export type ArbitexPublicClient = PublicClient<Transport, Chain>;

function uniqueUrls(urls: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const t = u?.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Resolves ordered HTTP endpoints: primary, then `rpcUrls`, then chain defaults (Avalanche). */
export function resolveHttpRpcUrls(cfg: RpcConfig): string[] {
  const urls: string[] = [cfg.rpcUrl];
  if (cfg.rpcUrls?.length) urls.push(...cfg.rpcUrls);
  if (cfg.chainId === 43114) urls.push(...DEFAULT_AVAX_HTTP_RPCS);
  return uniqueUrls(urls);
}

function createHttpTransports(urls: readonly string[]) {
  return urls.map((url) => http(url, HTTP_TRANSPORT_OPTS));
}

function createFallbackHttpTransport(urls: string[]) {
  if (urls.length === 0) {
    throw new Error("At least one RPC URL is required");
  }
  if (urls.length === 1) {
    return http(urls[0], HTTP_TRANSPORT_OPTS);
  }
  return fallback(createHttpTransports(urls), FALLBACK_TRANSPORT_OPTS);
}

/**
 * Multi-RPC public client: `viem` `fallback` transport with automatic failover and
 * latency/stability-based ranking (`rank: true`).
 */
export function createMultiRpcClient(cfg: RpcConfig): ArbitexPublicClient {
  const chain = CHAIN_MAP[cfg.chainId];
  if (!chain) {
    throw new Error(`Unsupported chainId: ${cfg.chainId}`);
  }

  const urls = resolveHttpRpcUrls(cfg);
  const transport = createFallbackHttpTransport(urls);

  return createPublicClient({
    chain,
    transport,
    batch: {
      multicall: { batchSize: 1_024, wait: 16 },
    },
  }) as ArbitexPublicClient;
}

/**
 * Create a viem public client for the given chain.
 * Uses HTTP with multi-RPC + failover when multiple URLs resolve (including Avalanche defaults).
 */
export function createChainClient(cfg: RpcConfig): ArbitexPublicClient {
  return createMultiRpcClient(cfg);
}

/**
 * Create an archive-enabled client for eth_call simulations.
 * Uses `archiveRpcUrl` first when set, then the same fallbacks as `createMultiRpcClient`.
 */
export function createArchiveClient(cfg: RpcConfig): ArbitexPublicClient {
  if (!cfg.archiveRpcUrl) {
    return createMultiRpcClient(cfg);
  }
  const urls = uniqueUrls([
    cfg.archiveRpcUrl,
    cfg.rpcUrl,
    ...(cfg.rpcUrls ?? []),
    ...(cfg.chainId === 43114 ? [...DEFAULT_AVAX_HTTP_RPCS] : []),
  ]);
  return createMultiRpcClient({ ...cfg, rpcUrl: urls[0]!, rpcUrls: urls.slice(1) });
}

/**
 * WebSocket public client for subscriptions (`watchBlocks`, logs, etc.).
 */
export function createWssClient(cfg: RpcConfig): ArbitexPublicClient {
  if (!cfg.wssUrl?.trim()) {
    throw new Error("createWssClient requires RpcConfig.wssUrl");
  }
  const chain = CHAIN_MAP[cfg.chainId];
  if (!chain) {
    throw new Error(`Unsupported chainId: ${cfg.chainId}`);
  }

  return createPublicClient({
    chain,
    transport: webSocket(cfg.wssUrl.trim(), WSS_TRANSPORT_OPTS),
    batch: {
      multicall: { batchSize: 1_024, wait: 16 },
    },
  }) as ArbitexPublicClient;
}

export function getChain(chainId: number): Chain {
  const chain = CHAIN_MAP[chainId];
  if (!chain) throw new Error(`Unsupported chainId: ${chainId}`);
  return chain;
}

export { mainnet, arbitrum, base };
