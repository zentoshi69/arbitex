"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWs } from "@/components/layout/Providers";
import {
  KpiCard,
  StateBadge,
  ProfitCell,
  Skeleton,
  SectionHeader,
} from "@/components/ui";
import { PnlChart } from "@/components/charts/PnlChart";
import { AlertTriangle, TrendingUp, Zap, Activity } from "lucide-react";
import Link from "next/link";

export default function OverviewPage() {
  const { on } = useWs();
  const [liveOppCount, setLiveOppCount] = useState<number | null>(null);

  const { data: pnl, isLoading: pnlLoading } = useQuery({
    queryKey: ["pnl", "summary"],
    queryFn: () => api.pnl.summary(),
    refetchInterval: 30_000,
  });

  const { data: timeseries } = useQuery({
    queryKey: ["pnl", "timeseries"],
    queryFn: () => api.pnl.timeseries(30),
    refetchInterval: 60_000,
  });

  const { data: opps, refetch: refetchOpps } = useQuery({
    queryKey: ["opportunities", "live"],
    queryFn: () =>
      api.opportunities.list({ state: "APPROVED", limit: 10, page: 1 }),
    refetchInterval: 5_000,
  });

  const { data: executions } = useQuery({
    queryKey: ["executions", "recent"],
    queryFn: () => api.executions.list({ limit: 8, page: 1 }),
    refetchInterval: 10_000,
  });

  const { data: killSwitches } = useQuery({
    queryKey: ["risk", "kill-switches"],
    queryFn: () => api.risk.killSwitches(),
    refetchInterval: 10_000,
  });

  // Live opportunity count via WebSocket
  useEffect(() => {
    const off = on("opportunity:new", () => {
      setLiveOppCount((c) => (c ?? 0) + 1);
      refetchOpps();
    });
    return off;
  }, [on, refetchOpps]);

  const anyKillActive = killSwitches
    ? Object.values(killSwitches).some(Boolean)
    : false;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <SectionHeader
        title="Overview"
        description="Live system status and performance summary"
      />

      {/* Kill switch alert */}
      {anyKillActive && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-950 border border-red-800">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-300">Kill Switch Active</p>
            <p className="text-xs text-red-400 mt-0.5">
              Opportunity detection and execution are paused.{" "}
              <Link href="/risk" className="underline hover:text-red-300">
                Manage in Risk Controls →
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {pnlLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))
        ) : (
          <>
            <KpiCard
              label="Today's PnL"
              value={`$${pnl?.today.pnlUsd?.toFixed(2) ?? "0.00"}`}
              sub={`${pnl?.today.tradeCount ?? 0} trades`}
              trend={pnl?.today.pnlUsd >= 0 ? "up" : "down"}
              accent={pnl?.today.pnlUsd >= 0 ? "text-emerald-400" : "text-red-400"}
            />
            <KpiCard
              label="7-Day PnL"
              value={`$${pnl?.week.pnlUsd?.toFixed(2) ?? "0.00"}`}
              sub={`${pnl?.week.tradeCount ?? 0} trades`}
              trend={pnl?.week.pnlUsd >= 0 ? "up" : "down"}
            />
            <KpiCard
              label="Success Rate (30d)"
              value={`${pnl?.successRate?.toFixed(1) ?? "—"}%`}
              sub="Landed / Total"
              trend={
                pnl?.successRate > 90
                  ? "up"
                  : pnl?.successRate < 70
                    ? "down"
                    : "neutral"
              }
            />
            <KpiCard
              label="All-Time PnL"
              value={`$${pnl?.allTime.pnlUsd?.toFixed(2) ?? "0.00"}`}
              sub={`${pnl?.allTime.tradeCount ?? 0} total trades`}
            />
          </>
        )}
      </div>

      {/* PnL Chart */}
      <div className="ax-panel p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[var(--ax-dim)]" />
            30-Day Cumulative PnL
          </h2>
        </div>
        <PnlChart data={timeseries ?? []} height={200} />
      </div>

      {/* Live opportunities + Recent executions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Opportunities */}
        <div className="ax-panel">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--ax-border)]">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-[var(--ax-dim)]" />
              Live Opportunities
              {liveOppCount !== null && liveOppCount > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--ax-border)" }}
                >
                  +{liveOppCount}
                </span>
              )}
            </h2>
            <Link
              href="/opportunities"
              className="text-xs text-[var(--ax-dim)] hover:text-[var(--ax-off-white)]"
            >
              View all →
            </Link>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--ax-border)" }}>
            {opps?.items?.length === 0 && (
              <p className="text-center text-slate-500 text-xs py-8">
                No active opportunities
              </p>
            )}
            {opps?.items?.map((opp: any) => (
              <Link
                key={opp.id}
                href={`/opportunities/${opp.id}`}
                className="flex items-center justify-between px-4 py-2.5 transition-colors"
                style={{ background: "transparent" }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-200">
                    {opp.tokenInSymbol} → {opp.tokenOutSymbol}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {opp.buyVenueName} → {opp.sellVenueName}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                  <ProfitCell value={opp.netProfitUsd} />
                  <StateBadge state={opp.state} />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent executions */}
        <div className="ax-panel">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--ax-border)]">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Recent Executions
            </h2>
            <Link
              href="/executions"
              className="text-xs text-[var(--ax-dim)] hover:text-[var(--ax-off-white)]"
            >
              View all →
            </Link>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--ax-border)" }}>
            {executions?.items?.map((exec: any) => (
              <Link
                key={exec.id}
                href={`/executions/${exec.id}`}
                className="flex items-center justify-between px-4 py-2.5 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-200">
                    {exec.opportunity?.tokenInSymbol} → {exec.opportunity?.tokenOutSymbol}
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                    {exec.txHash
                      ? `${exec.txHash.slice(0, 10)}…`
                      : exec.state}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                  {exec.pnlUsd !== null && <ProfitCell value={exec.pnlUsd} />}
                  <StateBadge state={exec.state} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
