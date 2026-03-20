"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionHeader, Skeleton, EmptyState, AddressCell } from "@/components/ui";
import { LPBandChart } from "@/components/charts/LPBandChart";

export default function V3PoolsPage() {
  const poolsQ = useQuery({
    queryKey: ["pools-v3"],
    queryFn: () => api.pools.list({ limit: 50 }),
    refetchInterval: 15_000,
  });

  const pools = (poolsQ.data?.items ?? []).filter(
    (p: any) => p.venue?.protocol === "uniswap_v3"
  );

  return (
    <div className="space-y-6 max-w-[1400px]">
      <SectionHeader
        title="V3 Pools"
        description="Uniswap V3-style concentrated liquidity pools — live tick data, sqrtPrice, and LP band visualization"
      />

      {poolsQ.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : pools.length === 0 ? (
        <EmptyState message="No V3 pools registered. Add pools with protocol 'uniswap_v3' in the Pools page." />
      ) : (
        <div className="space-y-4">
          {pools.map((pool: any) => (
            <V3PoolCard key={pool.id} pool={pool} />
          ))}
        </div>
      )}
    </div>
  );
}

function V3PoolCard({ pool }: { pool: any }) {
  const latestSnap = pool.snapshots?.[0];
  const sqrtPrice = latestSnap?.sqrtPriceX96;
  const tick = latestSnap?.tick;
  const liqUsd = latestSnap ? Number(latestSnap.liquidityUsd) : null;

  return (
    <div className="ax-panel p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-[var(--offwhite)]">
            {pool.token0?.symbol ?? "?"} / {pool.token1?.symbol ?? "?"}
          </h3>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-[rgba(232,65,66,0.08)] text-[var(--ax-red)] border border-[rgba(232,65,66,0.2)]">
            {pool.feeBps} bps
          </span>
          <span className="text-xs text-[var(--grey2)]">{pool.venue?.name}</span>
        </div>
        <AddressCell address={pool.poolAddress} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <InfoCell label="Current Tick" value={tick != null ? String(tick) : "—"} />
        <InfoCell label="sqrtPriceX96" value={sqrtPrice ? `${String(sqrtPrice).slice(0, 12)}…` : "—"} />
        <InfoCell label="Liquidity (USD)" value={liqUsd != null ? `$${liqUsd.toLocaleString()}` : "—"} />
        <InfoCell
          label="Last Updated"
          value={latestSnap ? new Date(latestSnap.timestamp).toLocaleTimeString() : "—"}
        />
      </div>

      <LPBandChart poolAddress={pool.poolAddress} />
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[rgba(255,255,255,0.02)] rounded p-3">
      <p className="text-[9px] text-[var(--grey2)] uppercase tracking-wide">{label}</p>
      <p className="text-sm font-mono text-[var(--offwhite)] mt-1 truncate" title={value}>{value}</p>
    </div>
  );
}
