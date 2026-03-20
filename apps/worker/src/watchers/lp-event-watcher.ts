/**
 * LP Event Watcher — monitors Mint/Burn events on V3 pools.
 *
 * When liquidity changes are detected, triggers a re-read of
 * the affected pool's tick data and LP band profile rebuild.
 */

import type { ArbitexPublicClient } from "@arbitex/chain";
import { pino } from "pino";
import { parseAbiItem, type Log } from "viem";

const logger = pino({ name: "lp-event-watcher" });

const MINT_EVENT = parseAbiItem(
  "event Mint(address sender, address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)"
);

const BURN_EVENT = parseAbiItem(
  "event Burn(address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)"
);

export interface LPEventCallback {
  (event: {
    pool: string;
    type: "mint" | "burn";
    tickLower: number;
    tickUpper: number;
    amount: bigint;
    blockNumber: bigint;
    txHash: string;
  }): void;
}

export interface WatcherHandle {
  stop: () => void;
}

/**
 * Start watching Mint/Burn events on a set of V3 pool addresses.
 * Calls `onEvent` for each liquidity change detected.
 *
 * Uses polling (not WebSocket) for compatibility with HTTP RPC endpoints.
 */
export function watchLPEvents(
  client: ArbitexPublicClient,
  poolAddresses: `0x${string}`[],
  onEvent: LPEventCallback,
  pollIntervalMs = 4_000
): WatcherHandle {
  if (poolAddresses.length === 0) {
    logger.warn("No pool addresses provided to LP event watcher");
    return { stop: () => {} };
  }

  let lastBlock = 0n;
  let running = true;

  async function poll() {
    if (!running) return;

    try {
      const currentBlock = await client.getBlockNumber();
      if (lastBlock === 0n) {
        lastBlock = currentBlock - 10n;
      }

      if (currentBlock <= lastBlock) return;

      const fromBlock = lastBlock + 1n;
      const toBlock = currentBlock;

      const [mintLogs, burnLogs] = await Promise.all([
        client.getLogs({
          address: poolAddresses,
          event: MINT_EVENT,
          fromBlock,
          toBlock,
        }).catch((): Log[] => []),
        client.getLogs({
          address: poolAddresses,
          event: BURN_EVENT,
          fromBlock,
          toBlock,
        }).catch((): Log[] => []),
      ]);

      for (const log of mintLogs) {
        const args = (log as any).args;
        if (!args) continue;
        onEvent({
          pool: log.address,
          type: "mint",
          tickLower: Number(args.tickLower),
          tickUpper: Number(args.tickUpper),
          amount: BigInt(args.amount ?? 0),
          blockNumber: log.blockNumber ?? 0n,
          txHash: log.transactionHash ?? "",
        });
      }

      for (const log of burnLogs) {
        const args = (log as any).args;
        if (!args) continue;
        onEvent({
          pool: log.address,
          type: "burn",
          tickLower: Number(args.tickLower),
          tickUpper: Number(args.tickUpper),
          amount: BigInt(args.amount ?? 0),
          blockNumber: log.blockNumber ?? 0n,
          txHash: log.transactionHash ?? "",
        });
      }

      const total = mintLogs.length + burnLogs.length;
      if (total > 0) {
        logger.info(
          { mints: mintLogs.length, burns: burnLogs.length, fromBlock: Number(fromBlock), toBlock: Number(toBlock) },
          "LP events detected"
        );
      }

      lastBlock = toBlock;
    } catch (err) {
      logger.error({ err }, "LP event poll failed");
    }
  }

  const interval = setInterval(poll, pollIntervalMs);
  poll();

  return {
    stop: () => {
      running = false;
      clearInterval(interval);
      logger.info("LP event watcher stopped");
    },
  };
}
