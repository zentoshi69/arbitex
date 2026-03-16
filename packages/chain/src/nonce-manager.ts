import type { Redis } from "ioredis";
import type { ArbitexPublicClient } from "./client.js";

const LOCK_TTL_MS = 30_000;
const NONCE_KEY = (address: string) =>
  `arbitex:nonce:${address.toLowerCase()}`;
const LOCK_KEY = (address: string) =>
  `arbitex:nonce_lock:${address.toLowerCase()}`;

/**
 * Redis-backed nonce manager with pessimistic locking.
 *
 * Ensures sequential nonces even when multiple execution jobs run concurrently.
 * Uses SETNX-style locking to prevent race conditions.
 */
export class NonceManager {
  constructor(
    private readonly redis: Redis,
    private readonly client: ArbitexPublicClient
  ) {}

  /**
   * Acquire the next nonce for the given address.
   * Blocks until lock is acquired (up to timeoutMs).
   * Returns { nonce, release } — caller MUST call release() after tx submission.
   */
  async acquireNonce(
    address: `0x${string}`,
    timeoutMs = 15_000
  ): Promise<{ nonce: number; release: () => Promise<void> }> {
    const lockKey = LOCK_KEY(address);
    const nonceKey = NONCE_KEY(address);
    const lockId = `${Date.now()}-${Math.random()}`;
    const deadline = Date.now() + timeoutMs;

    // Spin-wait for lock
    while (Date.now() < deadline) {
      const acquired = await this.redis.set(lockKey, lockId, "PX", LOCK_TTL_MS, "NX");
      if (acquired === "OK") break;
      await new Promise((r) => setTimeout(r, 50));
    }
    if (Date.now() >= deadline) {
      throw new Error(`Nonce lock timeout for ${address}`);
    }

    // Get current nonce — prefer local cache, fallback to RPC
    let nonce: number;
    const cached = await this.redis.get(nonceKey);
    if (cached !== null) {
      nonce = parseInt(cached, 10);
    } else {
      nonce = await this.client.getTransactionCount({ address, blockTag: "pending" });
    }

    const release = async () => {
      // Increment nonce in cache after successful submission
      await this.redis.set(nonceKey, String(nonce + 1), "EX", 3600);
      // Release lock only if we still own it
      const current = await this.redis.get(lockKey);
      if (current === lockId) {
        await this.redis.del(lockKey);
      }
    };

    return { nonce, release };
  }

  /**
   * Force-sync nonce from chain. Call after confirmed tx or on startup.
   */
  async syncNonce(address: `0x${string}`): Promise<void> {
    const onChainNonce = await this.client.getTransactionCount({
      address,
      blockTag: "pending",
    });
    await this.redis.set(NONCE_KEY(address), String(onChainNonce), "EX", 3600);
  }

  /**
   * Increment without acquiring lock — use only after confirmed failure/drop.
   */
  async resetNonce(address: `0x${string}`): Promise<void> {
    await this.syncNonce(address);
  }
}
