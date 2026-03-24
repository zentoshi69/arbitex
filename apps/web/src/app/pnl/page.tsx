"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { SectionHeader, KpiCard, Skeleton, EmptyState } from "@/components/ui";
import { fmt, fmtUsd, num } from "@/lib/utils";

export default function PnlPage() {
  const [days, setDays] = useState(30);

  const summaryQ = useQuery({
    queryKey: ["pnl-summary"],
    queryFn: () => api.pnl.summary(),
    refetchInterval: 15_000,
  });

  const cumulativeQ = useQuery({
    queryKey: ["pnl-cumulative"],
    queryFn: () => api.pnl.cumulative(),
    refetchInterval: 15_000,
  });

  const timeseriesQ = useQuery({
    queryKey: ["pnl-timeseries", days],
    queryFn: () => api.pnl.timeseries(days),
    refetchInterval: 30_000,
  });

  const venueQ = useQuery({
    queryKey: ["pnl-venue", days],
    queryFn: () => api.pnl.byVenue(days),
    refetchInterval: 30_000,
  });

  const s = summaryQ.data;
  const cum = cumulativeQ.data;
  const ts = timeseriesQ.data ?? [];
  const venues = venueQ.data ?? [];

  return (
    <div className="space-y-6 max-w-[1400px]">
      <SectionHeader
        title="Profit & Loss"
        description="Realized PnL is net of gas (token round-trip minus AVAX gas). Explorer “Value” is native AVAX only — use token transfers on Snowtrace to verify notionals."
        action={
          <div className="flex gap-1">
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-xs font-mono rounded ${days === d ? "bg-[var(--ax-red)] text-white" : "bg-[rgba(255,255,255,0.04)] text-[var(--grey1)] hover:bg-[rgba(255,255,255,0.08)]"}`}
              >
                {d}d
              </button>
            ))}
          </div>
        }
      />

      {/* Summary KPIs */}
      {summaryQ.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : s ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard
            label="Today"
            value={fmtUsd(s.today?.pnlUsd)}
            sub={`${s.today?.tradeCount ?? 0} trades`}
            trend={num(s.today?.pnlUsd) > 0 ? "up" : num(s.today?.pnlUsd) < 0 ? "down" : "neutral"}
          />
          <KpiCard
            label="7 Day"
            value={fmtUsd(s.week?.pnlUsd)}
            sub={`${s.week?.tradeCount ?? 0} trades`}
            trend={num(s.week?.pnlUsd) > 0 ? "up" : "down"}
          />
          <KpiCard
            label="30 Day"
            value={fmtUsd(s.month?.pnlUsd)}
            sub={`Gas: ${fmtUsd(s.month?.gasCostUsd)}`}
            trend={num(s.month?.pnlUsd) > 0 ? "up" : "down"}
          />
          <KpiCard
            label="All Time"
            value={fmtUsd(s.allTime?.pnlUsd)}
            sub={`${s.allTime?.tradeCount ?? 0} trades`}
            trend={num(s.allTime?.pnlUsd) > 0 ? "up" : "down"}
          />
          <KpiCard
            label="Success Rate"
            value={`${fmt(s.successRate, 0)}%`}
            sub="Last 30 days"
            trend={num(s.successRate) >= 90 ? "up" : num(s.successRate) >= 70 ? "neutral" : "down"}
          />
        </div>
      ) : null}

      {/* Cumulative + Gas */}
      {cum && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KpiCard
            label="Realized PnL (net)"
            value={fmtUsd(cum.totalPnlUsd)}
            sub="Token arb − gas (settlement)"
            trend={num(cum.totalPnlUsd) > 0 ? "up" : "down"}
          />
          <KpiCard label="Total Gas" value={fmtUsd(cum.totalGasCostUsd)} sub="All time AVAX→USD" />
          <KpiCard label="Landed trades" value={String(cum.tradeCount)} />
        </div>
      )}

      {/* Gas Breakdown */}
      {s?.gasBreakdown && (
        <div className="ax-panel p-4 space-y-3">
          <h3 className="text-xs font-semibold text-[var(--offwhite)] uppercase tracking-wider">Gas Breakdown (30d)</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <InfoBlock label="Total Gas" value={fmtUsd(s.gasBreakdown.totalGasUsd)} />
            <InfoBlock label="Avg Gas / Trade" value={fmtUsd(s.gasBreakdown.avgGasUsd, 4)} />
            <InfoBlock label="Max Gas" value={fmtUsd(s.gasBreakdown.maxGasUsd, 4)} />
            <InfoBlock label="Trades w/ Gas" value={String(s.gasBreakdown.tradeCount)} />
          </div>
        </div>
      )}

      {/* Timeseries (text table) */}
      <div className="ax-panel p-4 space-y-3">
        <h3 className="text-xs font-semibold text-[var(--offwhite)] uppercase tracking-wider">Daily PnL ({days}d)</h3>
        {timeseriesQ.isLoading ? (
          <Skeleton className="h-48" />
        ) : ts.length === 0 ? (
          <EmptyState message="No trades in this period" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[9px] text-[var(--grey2)] uppercase tracking-wider border-b border-[var(--border)]">
                  <th className="text-left py-2 px-2">Date</th>
                  <th className="text-right py-2 px-2">PnL</th>
                  <th className="text-right py-2 px-2">Gas</th>
                  <th className="text-right py-2 px-2">Trades</th>
                  <th className="text-right py-2 px-2">Cumulative</th>
                </tr>
              </thead>
              <tbody>
                {ts.map((r: any, i: number) => (
                  <tr key={i} className="border-b border-[rgba(255,255,255,0.03)]">
                    <td className="py-2 px-2 text-[var(--offwhite)] font-mono text-xs">
                      {new Date(r.date).toLocaleDateString()}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">
                      <span className={num(r.pnl) >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {num(r.pnl) >= 0 ? "+" : ""}{fmt(r.pnl)}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-[var(--grey1)]">
                      ${(r.gas_cost ?? 0).toFixed(4)}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-[var(--grey1)]">{r.trades}</td>
                    <td className="py-2 px-2 text-right font-mono">
                      <span className={r.cumulativePnl >= 0 ? "text-emerald-400" : "text-red-400"}>
                        ${r.cumulativePnl?.toFixed(2) ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Per-Venue */}
      <div className="ax-panel p-4 space-y-3">
        <h3 className="text-xs font-semibold text-[var(--offwhite)] uppercase tracking-wider">PnL by Venue ({days}d)</h3>
        {venueQ.isLoading ? (
          <Skeleton className="h-32" />
        ) : venues.length === 0 ? (
          <EmptyState message="No venue data" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[9px] text-[var(--grey2)] uppercase tracking-wider border-b border-[var(--border)]">
                  <th className="text-left py-2 px-2">Venue</th>
                  <th className="text-right py-2 px-2">PnL</th>
                  <th className="text-right py-2 px-2">Gas</th>
                  <th className="text-right py-2 px-2">Trades</th>
                  <th className="text-right py-2 px-2">Avg PnL / Trade</th>
                </tr>
              </thead>
              <tbody>
                {venues.map((v: any, i: number) => (
                  <tr key={i} className="border-b border-[rgba(255,255,255,0.03)]">
                    <td className="py-2 px-2 text-[var(--offwhite)] font-semibold">{v.venue}</td>
                    <td className="py-2 px-2 text-right font-mono">
                      <span className={num(v.pnl) >= 0 ? "text-emerald-400" : "text-red-400"}>
                        ${fmt(v.pnl)}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-[var(--grey1)]">${(v.gas_cost ?? 0).toFixed(4)}</td>
                    <td className="py-2 px-2 text-right font-mono text-[var(--grey1)]">{v.trades}</td>
                    <td className="py-2 px-2 text-right font-mono text-[var(--grey1)]">
                      ${v.trades > 0 ? fmt(num(v.pnl) / v.trades, 4) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[rgba(255,255,255,0.02)] rounded p-3">
      <p className="text-[9px] text-[var(--grey2)] uppercase tracking-wide">{label}</p>
      <p className="text-sm font-mono text-[var(--offwhite)] mt-1">{value}</p>
    </div>
  );
}
