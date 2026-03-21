/**
 * Liquidity Scanner — Production CLAMM liquidity map builder.
 *
 * V3 pools (preferred):
 *   Queries IncreaseLiquidity / DecreaseLiquidity events on the
 *   NonfungiblePositionManager, batch-fetches positions(tokenId) on-chain,
 *   filters by target pool, drops zero-liquidity positions, and aggregates
 *   a tick-level map usable by v3 swap simulation (walk ticks, apply fee).
 *
 *   Falls back to pool-level Mint/Burn events when no known NFT manager
 *   exists for the pool's factory.
 *
 * V2 / Solidly pools:
 *   Reserves via Sync events + LP holder balances via Transfer events.
 *
 * Scan modes:
 *   "full"  — from pool creation block to latest (first build or recovery)
 *   "quick" — last 500 000 blocks, merge into cached map (incremental)
 */

import { parseAbi, parseAbiItem, getAddress } from "viem";
import type { PublicClient } from "viem";
import { pino } from "pino";

const log = pino({ name: "liquidity-scanner" });

// ── Constants ─────────────────────────────────────────────────────────────────

const BLOCK_CHUNK = 10_000;
const REFRESH_BLOCK_RANGE = 500_000n;
const DEFAULT_FULL_SCAN_RANGE = 1_000_000n;
const MULTICALL_BATCH = 80;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const PLACEHOLDER_RE = /^0x0{38,}[0-9a-fA-F]{1,2}$/;

/** Factory address (lowercase) → NonfungiblePositionManager */
const FACTORY_TO_NFT_MANAGER: Record<string, `0x${string}`> = {
  // Ethereum mainnet
  "0x1f98431c8ad98523631ae4a59f267346ea31f984": "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  // Avalanche C-Chain (factory ends in baD — verified via nftManager.factory())
  "0x740b1c1de25031c31ff4fc9a62f554a55cdc1bad": "0x655C406EBFa14EE2006250925e54ec43AD184f8B",
};

export function resolveNftManager(factoryAddress: string | undefined): `0x${string}` | undefined {
  if (!factoryAddress) return undefined;
  return FACTORY_TO_NFT_MANAGER[factoryAddress.toLowerCase()];
}

// ── ABIs ──────────────────────────────────────────────────────────────────────

const INCREASE_LIQUIDITY = parseAbiItem(
  "event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
);
const DECREASE_LIQUIDITY = parseAbiItem(
  "event DecreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
);

const POSITIONS_ABI = parseAbi([
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
]);

const POOL_META_ABI = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
]);

const V3_MINT = parseAbiItem(
  "event Mint(address sender, address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)",
);
const V3_BURN = parseAbiItem(
  "event Burn(address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)",
);

const V2_SYNC = parseAbiItem("event Sync(uint112 reserve0, uint112 reserve1)");
const V2_MINT = parseAbiItem("event Mint(address indexed sender, uint256 amount0, uint256 amount1)");
const V2_BURN = parseAbiItem(
  "event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)",
);
const V2_TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface V3TickEntry {
  liquidityNet: string;
  liquidityGross: string;
}

export interface V3PositionEntry {
  tokenId: string;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
}

export interface V3LiquidityMapData {
  type: "v3";
  ticks: Record<string, V3TickEntry>;
  /** Keyed by tokenId (NFT manager) or owner-tickLower-tickUpper (fallback) */
  positions: Record<string, V3PositionEntry>;
  poolFee: number;
  token0: string;
  token1: string;
  nftManagerUsed: boolean;
  totalEvents: number;
}

export interface V2PositionEntry {
  provider: string;
  lpBalance: string;
}

export interface V2LiquidityMapData {
  type: "v2" | "solidly_v2";
  reserve0: string;
  reserve1: string;
  positions: V2PositionEntry[];
  mintCount: number;
  burnCount: number;
  totalEvents: number;
}

export type LiquidityMapData = V3LiquidityMapData | V2LiquidityMapData;

export interface ScanResult {
  data: LiquidityMapData;
  fromBlock: bigint;
  toBlock: bigint;
  eventCount: number;
}

export type ScanMode = "full" | "quick";

export interface PoolScanTarget {
  poolId: string;
  poolAddress: string;
  poolType: "v2" | "v3" | "solidly_v2";
  chainId: number;
  factoryAddress?: string | undefined;
  creationBlock?: bigint | undefined;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function scanInChunks<T>(
  client: PublicClient,
  address: `0x${string}`,
  event: ReturnType<typeof parseAbiItem>,
  fromBlock: bigint,
  toBlock: bigint,
  mapper: (log: any) => T | null,
): Promise<T[]> {
  const results: T[] = [];
  let cursor = fromBlock;

  while (cursor <= toBlock) {
    const end =
      cursor + BigInt(BLOCK_CHUNK) - 1n > toBlock
        ? toBlock
        : cursor + BigInt(BLOCK_CHUNK) - 1n;

    try {
      const logs = await client.getLogs({
        address,
        event: event as any,
        fromBlock: cursor,
        toBlock: end,
      });
      for (const l of logs) {
        const mapped = mapper(l);
        if (mapped) results.push(mapped);
      }
    } catch {
      log.warn(
        { address, from: Number(cursor), to: Number(end) },
        "getLogs chunk failed — skipping",
      );
    }

    cursor = end + 1n;
  }

  return results;
}

/** Aggregate tick-level liquidity from a position set. */
function buildTickMap(
  positions: Record<string, V3PositionEntry>,
): Record<string, V3TickEntry> {
  const ticks = new Map<string, { net: bigint; gross: bigint }>();

  for (const pos of Object.values(positions)) {
    const liq = BigInt(pos.liquidity);
    if (liq === 0n) continue;

    const lower = String(pos.tickLower);
    const upper = String(pos.tickUpper);

    const lo = ticks.get(lower) ?? { net: 0n, gross: 0n };
    lo.net += liq;
    lo.gross += liq;
    ticks.set(lower, lo);

    const hi = ticks.get(upper) ?? { net: 0n, gross: 0n };
    hi.net -= liq;
    hi.gross += liq;
    ticks.set(upper, hi);
  }

  const out: Record<string, V3TickEntry> = {};
  for (const [tick, v] of ticks) {
    if (v.gross !== 0n) {
      out[tick] = {
        liquidityNet: v.net.toString(),
        liquidityGross: v.gross.toString(),
      };
    }
  }
  return out;
}

// ── Batch position fetch via multicall ────────────────────────────────────────

interface RawPosition {
  token0: string;
  token1: string;
  fee: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
}

async function batchFetchPositions(
  client: PublicClient,
  nftManager: `0x${string}`,
  tokenIds: bigint[],
): Promise<Map<string, RawPosition>> {
  const out = new Map<string, RawPosition>();

  for (let i = 0; i < tokenIds.length; i += MULTICALL_BATCH) {
    const batch = tokenIds.slice(i, i + MULTICALL_BATCH);
    try {
      const res = await client.multicall({
        contracts: batch.map((id) => ({
          address: nftManager,
          abi: POSITIONS_ABI,
          functionName: "positions" as const,
          args: [id] as const,
        })),
        allowFailure: true,
      });

      for (let j = 0; j < res.length; j++) {
        const r = res[j]!;
        if (r.status !== "success" || !r.result) continue;
        const v = r.result as unknown as readonly [
          bigint, string, string, string, number, number, number, bigint,
          bigint, bigint, bigint, bigint,
        ];
        out.set(batch[j]!.toString(), {
          token0: String(v[2]).toLowerCase(),
          token1: String(v[3]).toLowerCase(),
          fee: Number(v[4]),
          tickLower: Number(v[5]),
          tickUpper: Number(v[6]),
          liquidity: BigInt(v[7]),
        });
      }
    } catch {
      for (const id of batch) {
        try {
          const r = await client.readContract({
            address: nftManager,
            abi: POSITIONS_ABI,
            functionName: "positions",
            args: [id],
          });
          const v = r as any;
          out.set(id.toString(), {
            token0: String(v[2]).toLowerCase(),
            token1: String(v[3]).toLowerCase(),
            fee: Number(v[4]),
            tickLower: Number(v[5]),
            tickUpper: Number(v[6]),
            liquidity: BigInt(v[7]),
          });
        } catch {
          /* position may have been burned completely */
        }
      }
    }
  }

  return out;
}

// ── V3: NonfungiblePositionManager scanner ────────────────────────────────────

async function scanV3ViaNFTManager(
  client: PublicClient,
  nftManager: `0x${string}`,
  poolToken0: string,
  poolToken1: string,
  poolFee: number,
  fromBlock: bigint,
  toBlock: bigint,
  existingData?: V3LiquidityMapData,
): Promise<ScanResult> {
  const mapper = (l: any) =>
    l.args ? { tokenId: BigInt(l.args.tokenId) } : null;

  const [increases, decreases] = await Promise.all([
    scanInChunks(
      client,
      nftManager,
      INCREASE_LIQUIDITY,
      fromBlock,
      toBlock,
      mapper,
    ),
    scanInChunks(
      client,
      nftManager,
      DECREASE_LIQUIDITY,
      fromBlock,
      toBlock,
      mapper,
    ),
  ]);

  const eventCount = increases.length + decreases.length;

  const seenIds = new Set<bigint>();
  for (const e of increases) seenIds.add(e.tokenId);
  for (const e of decreases) seenIds.add(e.tokenId);

  log.info(
    {
      events: eventCount,
      uniqueIds: seenIds.size,
      blocks: Number(toBlock - fromBlock),
    },
    "NFT manager events scanned",
  );

  const onChain = await batchFetchPositions(client, nftManager, [...seenIds]);

  // Keep cached positions for tokenIds NOT seen in this event window (saves RPC)
  const posMap: Record<string, V3PositionEntry> = {};
  if (existingData?.positions) {
    for (const [id, pos] of Object.entries(existingData.positions)) {
      if (!seenIds.has(BigInt(id))) {
        posMap[id] = pos;
      }
    }
  }

  // Merge freshly fetched positions that belong to our target pool
  const t0 = poolToken0.toLowerCase();
  const t1 = poolToken1.toLowerCase();

  for (const [idStr, raw] of onChain) {
    const matchesPool =
      raw.token0 === t0 && raw.token1 === t1 && raw.fee === poolFee;

    if (matchesPool && raw.liquidity > 0n) {
      posMap[idStr] = {
        tokenId: idStr,
        tickLower: raw.tickLower,
        tickUpper: raw.tickUpper,
        liquidity: raw.liquidity.toString(),
      };
    } else {
      delete posMap[idStr];
    }
  }

  return {
    data: {
      type: "v3",
      ticks: buildTickMap(posMap),
      positions: posMap,
      poolFee,
      token0: t0,
      token1: t1,
      nftManagerUsed: true,
      totalEvents: (existingData?.totalEvents ?? 0) + eventCount,
    },
    fromBlock,
    toBlock,
    eventCount,
  };
}

// ── V3: Pool-level Mint/Burn fallback ─────────────────────────────────────────

async function scanV3PoolDirect(
  client: PublicClient,
  poolAddress: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
  existingData?: V3LiquidityMapData,
): Promise<ScanResult> {
  const posMap: Record<
    string,
    { owner: string; tL: number; tU: number; liq: bigint }
  > = {};

  if (existingData?.positions) {
    for (const [key, pos] of Object.entries(existingData.positions)) {
      posMap[key] = {
        owner: key,
        tL: pos.tickLower,
        tU: pos.tickUpper,
        liq: BigInt(pos.liquidity),
      };
    }
  }

  let eventCount = 0;

  const mints = await scanInChunks(
    client,
    poolAddress,
    V3_MINT,
    fromBlock,
    toBlock,
    (l: any) => {
      const a = l.args;
      return a
        ? {
            owner: String(a.owner),
            tL: Number(a.tickLower),
            tU: Number(a.tickUpper),
            amount: BigInt(a.amount ?? 0),
          }
        : null;
    },
  );

  for (const e of mints) {
    eventCount++;
    const key = `${e.owner}-${e.tL}-${e.tU}`;
    const cur = posMap[key];
    posMap[key] = {
      owner: e.owner,
      tL: e.tL,
      tU: e.tU,
      liq: (cur?.liq ?? 0n) + e.amount,
    };
  }

  const burns = await scanInChunks(
    client,
    poolAddress,
    V3_BURN,
    fromBlock,
    toBlock,
    (l: any) => {
      const a = l.args;
      return a
        ? {
            owner: String(a.owner),
            tL: Number(a.tickLower),
            tU: Number(a.tickUpper),
            amount: BigInt(a.amount ?? 0),
          }
        : null;
    },
  );

  for (const e of burns) {
    eventCount++;
    const key = `${e.owner}-${e.tL}-${e.tU}`;
    const cur = posMap[key];
    if (cur) {
      const newLiq = cur.liq - e.amount;
      if (newLiq <= 0n) delete posMap[key];
      else posMap[key] = { ...cur, liq: newLiq };
    }
  }

  const positions: Record<string, V3PositionEntry> = {};
  for (const [key, p] of Object.entries(posMap)) {
    if (p.liq > 0n) {
      positions[key] = {
        tokenId: key,
        tickLower: p.tL,
        tickUpper: p.tU,
        liquidity: p.liq.toString(),
      };
    }
  }

  return {
    data: {
      type: "v3",
      ticks: buildTickMap(positions),
      positions,
      poolFee: 0,
      token0: "",
      token1: "",
      nftManagerUsed: false,
      totalEvents: (existingData?.totalEvents ?? 0) + eventCount,
    },
    fromBlock,
    toBlock,
    eventCount,
  };
}

// ── V2 / Solidly Scanner ─────────────────────────────────────────────────────

export async function scanV2Pool(
  client: PublicClient,
  poolAddress: `0x${string}`,
  poolType: "v2" | "solidly_v2",
  fromBlock: bigint,
  toBlock: bigint,
  existingData?: V2LiquidityMapData,
): Promise<ScanResult> {
  const balances = new Map<string, bigint>();
  let reserve0 = 0n;
  let reserve1 = 0n;
  let mintCount = existingData?.mintCount ?? 0;
  let burnCount = existingData?.burnCount ?? 0;
  let eventCount = 0;

  if (existingData) {
    reserve0 = BigInt(existingData.reserve0);
    reserve1 = BigInt(existingData.reserve1);
    for (const pos of existingData.positions) {
      balances.set(pos.provider.toLowerCase(), BigInt(pos.lpBalance));
    }
  }

  const syncEvents = await scanInChunks(
    client,
    poolAddress,
    V2_SYNC,
    fromBlock,
    toBlock,
    (l: any) => {
      const a = l.args;
      return a
        ? { reserve0: BigInt(a.reserve0 ?? 0), reserve1: BigInt(a.reserve1 ?? 0) }
        : null;
    },
  );
  eventCount += syncEvents.length;
  if (syncEvents.length > 0) {
    const last = syncEvents[syncEvents.length - 1]!;
    reserve0 = last.reserve0;
    reserve1 = last.reserve1;
  }

  const mints = await scanInChunks(
    client,
    poolAddress,
    V2_MINT,
    fromBlock,
    toBlock,
    (l: any) => (l.args ? {} : null),
  );
  eventCount += mints.length;
  mintCount += mints.length;

  const burns = await scanInChunks(
    client,
    poolAddress,
    V2_BURN,
    fromBlock,
    toBlock,
    (l: any) => (l.args ? {} : null),
  );
  eventCount += burns.length;
  burnCount += burns.length;

  const transfers = await scanInChunks(
    client,
    poolAddress,
    V2_TRANSFER,
    fromBlock,
    toBlock,
    (l: any) => {
      const a = l.args;
      return a
        ? { from: String(a.from), to: String(a.to), value: BigInt(a.value ?? 0) }
        : null;
    },
  );
  eventCount += transfers.length;

  for (const t of transfers) {
    const from = t.from.toLowerCase();
    const to = t.to.toLowerCase();
    if (from !== ZERO_ADDR) {
      const cur = balances.get(from) ?? 0n;
      const next = cur - t.value;
      if (next <= 0n) balances.delete(from);
      else balances.set(from, next);
    }
    if (to !== ZERO_ADDR) {
      balances.set(to, (balances.get(to) ?? 0n) + t.value);
    }
  }

  const positions: V2PositionEntry[] = [...balances.entries()]
    .filter(([, b]) => b > 0n)
    .sort((a, b) => (b[1] > a[1] ? 1 : -1))
    .map(([provider, lpBalance]) => ({
      provider,
      lpBalance: lpBalance.toString(),
    }));

  return {
    data: {
      type: poolType,
      reserve0: reserve0.toString(),
      reserve1: reserve1.toString(),
      positions,
      mintCount,
      burnCount,
      totalEvents: (existingData?.totalEvents ?? 0) + eventCount,
    },
    fromBlock,
    toBlock,
    eventCount,
  };
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export async function buildLiquidityMap(
  client: PublicClient,
  target: PoolScanTarget,
  mode: ScanMode,
  existingData?: LiquidityMapData,
  existingScanToBlock?: bigint,
): Promise<ScanResult> {
  const rawAddr = target.poolAddress.toLowerCase();

  if (PLACEHOLDER_RE.test(rawAddr)) {
    log.warn({ pool: target.poolAddress }, "Skipping pool with placeholder address");
    const empty: V2LiquidityMapData = {
      type: "v2",
      reserve0: "0",
      reserve1: "0",
      positions: [],
      mintCount: 0,
      burnCount: 0,
      totalEvents: 0,
    };
    return { data: empty, fromBlock: 0n, toBlock: 0n, eventCount: 0 };
  }

  const addr = getAddress(target.poolAddress) as `0x${string}`;
  const currentBlock = await client.getBlockNumber();

  let fromBlock: bigint;
  if (mode === "quick" && existingScanToBlock && existingScanToBlock > 0n) {
    const refreshFrom = currentBlock - REFRESH_BLOCK_RANGE;
    fromBlock =
      refreshFrom > existingScanToBlock
        ? existingScanToBlock + 1n
        : refreshFrom;
  } else {
    fromBlock = target.creationBlock ?? currentBlock - DEFAULT_FULL_SCAN_RANGE;
    if (fromBlock < 0n) fromBlock = 0n;
  }

  log.info(
    {
      pool: target.poolAddress,
      type: target.poolType,
      mode,
      fromBlock: Number(fromBlock),
      toBlock: Number(currentBlock),
      blocks: Number(currentBlock - fromBlock),
    },
    "Starting liquidity scan",
  );

  if (target.poolType === "v3") {
    const nftMgr = resolveNftManager(target.factoryAddress);

    if (nftMgr) {
      try {
        const results = await client.multicall({
          contracts: [
            { address: addr, abi: POOL_META_ABI, functionName: "token0" },
            { address: addr, abi: POOL_META_ABI, functionName: "token1" },
            { address: addr, abi: POOL_META_ABI, functionName: "fee" },
          ] as const,
          allowFailure: false,
        });

        const token0 = String(results[0]).toLowerCase();
        const token1 = String(results[1]).toLowerCase();
        const fee = Number(results[2]);

        return await scanV3ViaNFTManager(
          client,
          nftMgr,
          token0,
          token1,
          fee,
          fromBlock,
          currentBlock,
          existingData as V3LiquidityMapData | undefined,
        );
      } catch (err) {
        log.warn(
          { pool: target.poolAddress, err },
          "NFT manager scan failed — falling back to pool-level Mint/Burn",
        );
      }
    }

    return scanV3PoolDirect(
      client,
      addr,
      fromBlock,
      currentBlock,
      existingData as V3LiquidityMapData | undefined,
    );
  }

  return scanV2Pool(
    client,
    addr,
    target.poolType === "solidly_v2" ? "solidly_v2" : "v2",
    fromBlock,
    currentBlock,
    existingData as V2LiquidityMapData | undefined,
  );
}

export { REFRESH_BLOCK_RANGE, DEFAULT_FULL_SCAN_RANGE, FACTORY_TO_NFT_MANAGER };
