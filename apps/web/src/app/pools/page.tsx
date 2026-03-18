"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SectionHeader, EmptyState, Skeleton, AddressCell } from "@/components/ui";
import { Search, Droplets } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const isHexAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v.trim());

async function fetchPools(params: { page: number; search: string }) {
  const token = typeof window !== "undefined" ? localStorage.getItem("arbitex_token") : null;
  const qs = new URLSearchParams({ page: String(params.page), limit: "30" });
  const res = await fetch(`${BASE}/api/v1/pools?${qs}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return res.json();
}

function LiquidityBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden w-24">
        <div
          className={cn(
            "h-full rounded-full",
            value > 1_000_000 ? "bg-emerald-500" : value > 100_000 ? "bg-slate-400" : "bg-slate-600"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-slate-400 w-20 text-right">
        ${value >= 1_000_000
          ? `${(value / 1_000_000).toFixed(2)}M`
          : value >= 1_000
            ? `${(value / 1_000).toFixed(1)}K`
            : value.toFixed(0)}
      </span>
    </div>
  );
}

function SnapshotAge({ lastUpdated }: { lastUpdated: string | null }) {
  if (!lastUpdated) return <span className="text-xs text-slate-600">—</span>;
  const ageSecs = (Date.now() - new Date(lastUpdated).getTime()) / 1000;
  const color = ageSecs < 5 ? "text-emerald-400" : ageSecs < 30 ? "text-amber-400" : "text-red-400";
  const label = ageSecs < 60 ? `${ageSecs.toFixed(0)}s ago` : `${(ageSecs / 60).toFixed(1)}m ago`;
  return <span className={`text-xs font-mono ${color}`}>{label}</span>;
}

export default function PoolsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [resolved, setResolved] = useState<any>(null);
  const [resolving, setResolving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["pools", page],
    queryFn: () => fetchPools({ page, search }),
    refetchInterval: 5_000,
  });

  const items = (data?.items ?? []).filter((p: any) =>
    search
      ? `${p.token0?.symbol} ${p.token1?.symbol} ${p.venue?.name} ${p.poolAddress}`
          .toLowerCase()
          .includes(search.toLowerCase())
      : true
  );

  const maxLiquidity = Math.max(...items.map((p: any) => Number(p.snapshots?.[0]?.liquidityUsd ?? 0)), 1);

  return (
    <div className="space-y-4 max-w-[1400px]">
      <SectionHeader
        title="Pools"
        description="Live pool state — sorted by liquidity"
      />

      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Filter by pair, venue… or paste 0x… to resolve"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!isHexAddress(e.target.value)) setResolved(null);
            }}
            onKeyDown={async (e) => {
              if (e.key !== "Enter") return;
              const v = (e.currentTarget.value ?? "").trim();
              if (!isHexAddress(v)) return;
              setResolving(true);
              try {
                const r = await api.pools.resolve(v);
                setResolved(r);
              } finally {
                setResolving(false);
              }
            }}
            className="pl-8 pr-3 py-1.5 ax-field text-sm w-52"
          />
        </div>
        {resolving && <span className="text-xs text-slate-500">Resolving…</span>}
        <span className="ml-auto text-xs text-slate-500">{data?.pagination?.total ?? 0} pools</span>
      </div>

      {resolved && (
        <div className="ax-panel p-4 text-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-slate-300">
              Resolved: <span className="font-semibold">{resolved.kind}</span>
            </div>
            <AddressCell address={resolved.address} />
          </div>
          {resolved.token?.data && (
            <div className="text-slate-200">
              Token ({resolved.token.source}):{" "}
              <span className="font-semibold">{resolved.token.data.symbol}</span>{" "}
              <span className="text-slate-400">({resolved.token.data.decimals} decimals)</span>
            </div>
          )}
          {resolved.pool && (
            <div className="text-slate-200">
              Pool:{" "}
              <span className="font-semibold">
                {resolved.pool.token0?.symbol ?? "?"} / {resolved.pool.token1?.symbol ?? "?"}
              </span>{" "}
              <span className="text-slate-400">
                · {resolved.pool.venue?.name ?? "—"} · {resolved.pool.feeBps} bps
              </span>
            </div>
          )}
          {(resolved.pools?.length ?? 0) > 0 && (
            <div className="text-xs text-slate-400">
              {resolved.pools.length} associated pools found in DB.
            </div>
          )}
        </div>
      )}

      <div className="ax-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className="text-left">Pair</th>
                <th className="text-left">Venue</th>
                <th className="text-right">Fee</th>
                <th className="text-left w-52">Liquidity (USD)</th>
                <th className="text-right">Price</th>
                <th className="text-left">Last Snapshot</th>
                <th className="text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                  <td key={j}><Skeleton className="h-4 w-full" /></td>
                ))}</tr>
              ))}
              {!isLoading && items.length === 0 && (
                <tr><td colSpan={7}><EmptyState message="No pools found" /></td></tr>
              )}
              {items.map((pool: any) => {
                const snap = pool.snapshots?.[0];
                const liq = snap ? Number(snap.liquidityUsd) : 0;
                return (
                  <tr key={pool.id}>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <Droplets className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                        <span className="font-semibold text-slate-200 text-sm">
                          {pool.token0?.symbol ?? "?"} / {pool.token1?.symbol ?? "?"}
                        </span>
                      </div>
                      <AddressCell address={pool.poolAddress} />
                    </td>
                    <td>
                      <span className="text-sm text-slate-300">{pool.venue?.name ?? "—"}</span>
                    </td>
                    <td className="text-right font-mono text-xs text-slate-400">
                      {pool.feeBps} bps
                    </td>
                    <td>
                      <LiquidityBar value={liq} max={maxLiquidity} />
                    </td>
                    <td className="text-right font-mono text-xs text-slate-300">
                      {snap ? Number(snap.price0Per1).toFixed(6) : "—"}
                    </td>
                    <td>
                      <SnapshotAge lastUpdated={snap?.timestamp ?? null} />
                    </td>
                    <td>
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${
                        pool.isActive ? "text-emerald-400" : "text-slate-500"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${pool.isActive ? "bg-emerald-400" : "bg-slate-600"}`} />
                        {pool.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {data?.pagination?.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--ax-border)]">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="text-xs px-3 py-1.5 ax-btn">
              ← Prev
            </button>
            <span className="text-xs text-slate-500">Page {page} / {data.pagination.totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))} disabled={page === data.pagination.totalPages}
              className="text-xs px-3 py-1.5 ax-btn">
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
