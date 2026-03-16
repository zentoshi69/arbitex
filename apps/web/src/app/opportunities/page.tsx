"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useWs } from "@/components/layout/Providers";
import {
  StateBadge,
  ProfitCell,
  SectionHeader,
  EmptyState,
  Skeleton,
} from "@/components/ui";
import { OpportunityDrawer } from "@/components/drawers/OpportunityDrawer";
import { Search, Filter } from "lucide-react";

const STATES = [
  "ALL", "DETECTED", "QUOTED", "SIMULATED", "APPROVED",
  "SUBMITTED", "LANDED", "FAILED_TX", "FAILED_SIM", "EXPIRED", "BLOCKED",
];

export default function OpportunitiesPage() {
  const { on } = useWs();
  const [page, setPage] = useState(1);
  const [stateFilter, setStateFilter] = useState("ALL");
  const [minProfit, setMinProfit] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["opportunities", page, stateFilter, minProfit],
    queryFn: () =>
      api.opportunities.list({
        page,
        limit: 25,
        ...(stateFilter !== "ALL" ? { state: stateFilter } : {}),
        ...(minProfit ? { minProfit: parseFloat(minProfit) } : {}),
      }),
    refetchInterval: 5_000,
  });

  // Live updates
  useEffect(() => {
    const off1 = on("opportunity:new", () => refetch());
    const off2 = on("opportunity:update", () => refetch());
    return () => { off1(); off2(); };
  }, [on, refetch]);

  const items = (data?.items ?? []).filter((o: any) =>
    search
      ? `${o.tokenInSymbol}${o.tokenOutSymbol}${o.buyVenueName}${o.sellVenueName}`
          .toLowerCase()
          .includes(search.toLowerCase())
      : true
  );

  return (
    <div className="space-y-4 max-w-[1400px]">
      <SectionHeader
        title="Opportunities"
        description="All detected arbitrage opportunities"
      />

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search tokens, venues…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-600 w-48"
          />
        </div>

        <div className="flex items-center gap-1">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          <select
            value={stateFilter}
            onChange={(e) => { setStateFilter(e.target.value); setPage(1); }}
            className="bg-slate-800 border border-slate-700 rounded text-sm text-slate-300 px-2 py-1.5 focus:outline-none focus:border-blue-600"
          >
            {STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <input
          type="number"
          placeholder="Min profit ($)"
          value={minProfit}
          onChange={(e) => { setMinProfit(e.target.value); setPage(1); }}
          className="bg-slate-800 border border-slate-700 rounded text-sm text-slate-300 px-2 py-1.5 focus:outline-none focus:border-blue-600 w-32"
        />

        <span className="ml-auto text-xs text-slate-500">
          {data?.pagination.total ?? 0} total
        </span>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className="text-left">Pair</th>
                <th className="text-left">Routes</th>
                <th className="text-right">Trade Size</th>
                <th className="text-right">Gross Spread</th>
                <th className="text-right">Net Profit</th>
                <th className="text-right">Net BPS</th>
                <th className="text-left">State</th>
                <th className="text-left">Detected</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j}><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))}

              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState message="No opportunities match filters" />
                  </td>
                </tr>
              )}

              {items.map((opp: any) => (
                <tr
                  key={opp.id}
                  onClick={() => setSelectedId(opp.id)}
                  className="cursor-pointer"
                >
                  <td>
                    <span className="font-semibold text-slate-200">
                      {opp.tokenInSymbol} / {opp.tokenOutSymbol}
                    </span>
                  </td>
                  <td>
                    <span className="text-xs text-slate-400">
                      {opp.buyVenueName} → {opp.sellVenueName}
                    </span>
                  </td>
                  <td className="text-right font-mono text-sm text-slate-300">
                    ${Number(opp.tradeSizeUsd).toFixed(0)}
                  </td>
                  <td className="text-right font-mono text-sm text-slate-300">
                    ${Number(opp.grossSpreadUsd).toFixed(4)}
                  </td>
                  <td className="text-right">
                    <ProfitCell value={Number(opp.netProfitUsd)} />
                  </td>
                  <td className="text-right font-mono text-xs text-slate-400">
                    {Number(opp.netProfitBps).toFixed(2)}
                  </td>
                  <td><StateBadge state={opp.state} /></td>
                  <td className="text-xs text-slate-500 font-mono">
                    {new Date(opp.detectedAt).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-xs px-3 py-1.5 bg-slate-800 rounded disabled:opacity-40 hover:bg-slate-700 text-slate-300"
            >
              ← Prev
            </button>
            <span className="text-xs text-slate-500">
              Page {page} of {data.pagination.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
              disabled={page === data.pagination.totalPages}
              className="text-xs px-3 py-1.5 bg-slate-800 rounded disabled:opacity-40 hover:bg-slate-700 text-slate-300"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selectedId && (
        <OpportunityDrawer
          opportunityId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
