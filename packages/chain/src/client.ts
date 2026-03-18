import {
  createPublicClient,
  createWalletClient,
  http,
  webSocket,
  type PublicClient,
  type Transport,
  type Chain,
} from "viem";
import { mainnet, arbitrum, base, avalanche } from "viem/chains";

const CHAIN_MAP: Record<number, Chain> = {
  1: mainnet,
  43114: avalanche,
  42161: arbitrum,
  8453: base,
};

export type RpcConfig = {
  rpcUrl: string;
  archiveRpcUrl?: string;
  chainId: number;
};

export type ArbitexPublicClient = PublicClient<Transport, Chain>;

/**
 * Create a viem public client for the given chain.
 * Uses HTTP transport; swap to webSocket for subscriptions if needed.
 */
export function createChainClient(cfg: RpcConfig): ArbitexPublicClient {
  const chain = CHAIN_MAP[cfg.chainId];
  if (!chain) {
    throw new Error(`Unsupported chainId: ${cfg.chainId}`);
  }

  return createPublicClient({
    chain,
    transport: http(cfg.rpcUrl, {
      retryCount: 3,
      retryDelay: 500,
      timeout: 10_000,
    }),
    batch: {
      multicall: { batchSize: 1_024, wait: 16 },
    },
  }) as ArbitexPublicClient;
}

/**
 * Create an archive-enabled client for eth_call simulations.
 * Falls back to regular RPC if archive not configured.
 */
export function createArchiveClient(cfg: RpcConfig): ArbitexPublicClient {
  const rpcUrl = cfg.archiveRpcUrl ?? cfg.rpcUrl;
  return createChainClient({ ...cfg, rpcUrl });
}

export function getChain(chainId: number): Chain {
  const chain = CHAIN_MAP[chainId];
  if (!chain) throw new Error(`Unsupported chainId: ${chainId}`);
  return chain;
}

export { mainnet, arbitrum, base };
