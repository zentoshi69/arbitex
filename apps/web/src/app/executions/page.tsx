"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useWs } from "@/components/layout/Providers";
import {
  StateBadge,
  ProfitCell,
  SectionHeader,
  EmptyState,
  Skeleton,
  AddressCell,
} from "@/components/ui";
import { ExecutionDrawer } from "@/components/drawers/ExecutionDrawer";
import { Search, ExternalLink } from "lucide-react";

const STATES = ["ALL", "PENDING", "SIMULATING", "SIGNING", "SUBMITTED", "CONFIRMING", "LANDED", "FAILED", "CANCELLED"];

export default function ExecutionsPage() {
  const { on } = useWs();
  const [page, setPage] = useState(1);
  const [stateFilter, setStateFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["executions", page, stateFilter],
    queryFn: () =>
      api.executions.list({
        page,
        limit: 25,
        ...(stateFilter !== "ALL" ? { state: stateFilter } : {}),
      }),
    refetchInterval: 5_000,
  });

  useEffect(() => {
    const off = on("execution:update", () => refetch());
    return off;
  }, [on, refetch]);

  const items = (data?.items ?? []).filter((e: any) =>
    search
      ? [e.txHash ?? "", e.opportunity?.tokenInSymbol ?? "", e.opportunity?.tokenOutSymbol ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())
      : true
  );

  const totalLanded = data?.items?.filter((e: any) => e.state === "LANDED").length ?? 0;
  const totalPnl = data?.items
    ?.filter((e: any) => e.pnlUsd !== null)
    .reduce((sum: number, e: any) => sum + Number(e.pnlUsd), 0) ?? 0;

  return (
    <div className="space-y-4 max-w-[1400px]">
      <SectionHeader
        title="Executions"
        description="Full execution history with transaction details"
      />

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Showing", value: `${data?.pagination?.total ?? 0} records` },
          { label: "Landed (page)", value: `${totalLanded} trades` },
          { label: "PnL (page)", value: `$${totalPnl.toFixed(4)}`, color: totalPnl >= 0 ? "text-emerald-400" : "text-red-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="ax-panel px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs text-slate-500">{label}</span>
            <span className={`text-sm font-mono font-semibold ${color ?? "text-slate-200"}`}>{value}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search tx hash, tokens…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 ax-field text-sm w-52"
          />
        </div>
        <select
          value={stateFilter}
          onChange={(e) => { setStateFilter(e.target.value); setPage(1); }}
          className="ax-field text-sm text-slate-200 px-2 py-1.5"
        >
          {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="ax-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className="text-left">Pair</th>
                <th className="text-left">Tx Hash</th>
                <th className="text-left">Wallet</th>
                <th className="text-right">Block</th>
                <th className="text-right">Gas Used</th>
                <th className="text-right">Gas Cost</th>
                <th className="text-right">PnL</th>
                <th className="text-left">State</th>
                <th className="text-left">Time</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j}><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))}

              {!isLoading && items.length === 0 && (
                <tr><td colSpan={9}><EmptyState message="No executions match filters" /></td></tr>
              )}

              {items.map((exec: any) => (
                <tr
                  key={exec.id}
                  onClick={() => setSelectedId(exec.id)}
                  className="cursor-pointer"
                >
                  <td>
                    <span className="font-semibold text-slate-200 text-sm">
                      {exec.opportunity?.tokenInSymbol ?? "?"} / {exec.opportunity?.tokenOutSymbol ?? "?"}
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {exec.opportunity?.buyVenueName} → {exec.opportunity?.sellVenueName}
                    </p>
                  </td>
                  <td>
                    {exec.txHash ? (
                      <a
                        href={`https://etherscan.io/tx/${exec.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-xs font-mono text-[var(--ax-dim)] hover:text-[var(--ax-off-white)]"
                      >
                        {exec.txHash.slice(0, 12)}…
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                  <td><AddressCell address={exec.walletAddress} /></td>
                  <td className="text-right font-mono text-xs text-slate-400">
                    {exec.blockNumber ?? "—"}
                  </td>
                  <td className="text-right font-mono text-xs text-slate-400">
                    {exec.gasUsed ? Number(exec.gasUsed).toLocaleString() : "—"}
                  </td>
                  <td className="text-right font-mono text-xs text-slate-400">
                    {exec.gasCostUsd !== null ? `$${Number(exec.gasCostUsd).toFixed(4)}` : "—"}
                  </td>
                  <td className="text-right">
                    {exec.pnlUsd !== null ? (
                      <ProfitCell value={Number(exec.pnlUsd)} />
                    ) : (
                      <span className="text-slate-600 text-xs">—</span>
                    )}
                  </td>
                  <td><StateBadge state={exec.state} /></td>
                  <td className="text-xs text-slate-500 font-mono">
                    {new Date(exec.createdAt).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data && data.pagination?.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--ax-border)]">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-xs px-3 py-1.5 ax-btn"
            >← Prev</button>
            <span className="text-xs text-slate-500">
              Page {page} of {data.pagination.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
              disabled={page === data.pagination.totalPages}
              className="text-xs px-3 py-1.5 ax-btn"
            >Next →</button>
          </div>
        )}
      </div>

      {selectedId && (
        <ExecutionDrawer executionId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
