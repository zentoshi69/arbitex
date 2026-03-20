"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionHeader, KpiCard, Skeleton, EmptyState, StateBadge } from "@/components/ui";

export default function TradingBrainPage() {
  const regimeQ = useQuery({
    queryKey: ["regime"],
    queryFn: () => api.regime.current(),
    refetchInterval: 30_000,
  });

  const pnlQ = useQuery({
    queryKey: ["pnl-summary"],
    queryFn: () => api.pnl.summary(),
    refetchInterval: 15_000,
  });

  const oppsQ = useQuery({
    queryKey: ["opportunities-recent"],
    queryFn: () => api.opportunities.list({ limit: 10, page: 1 }),
    refetchInterval: 5_000,
  });

  const regime = regimeQ.data;
  const pnl = pnlQ.data;
  const opps = oppsQ.data?.items ?? [];

  const algoColor: Record<string, string> = {
    HALTED: "text-red-400",
    PASSIVE: "text-yellow-400",
    AGGRESSIVE: "text-emerald-400",
    TWAP: "text-blue-400",
  };

  return (
    <div className="space-y-6 max-w-[1400px]">
      <SectionHeader
        title="Trading Brain"
        description="Real-time decision engine: regime classification, opportunity pipeline, and execution rationale"
      />

      {/* Regime + KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {regimeQ.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <div className="ax-panel p-4">
              <p className="text-[9px] text-[var(--ax-muted)] font-medium uppercase tracking-[0.14em]">Regime</p>
              <p className="text-xl font-bold mt-1 font-mono text-[var(--ax-white)]">
                {regime?.regime ?? "—"}
              </p>
              <p className={`text-xs mt-1 ${algoColor[regime?.config?.algorithm] ?? "text-slate-400"}`}>
                {regime?.config?.algorithm ?? "—"} · {regime?.config?.priority ?? "—"}
              </p>
            </div>
            <KpiCard
              label="Size Multiplier"
              value={regime?.config?.sizeMultiplier != null ? `${(regime.config.sizeMultiplier * 100).toFixed(0)}%` : "—"}
              sub={`Hurdle: ${regime?.config?.hurdleBps ?? "—"} bps`}
            />
            <KpiCard
              label="Today PnL"
              value={pnl ? `$${pnl.today.pnlUsd.toFixed(2)}` : "—"}
              sub={pnl ? `${pnl.today.tradeCount} trades` : undefined}
              trend={pnl?.today.pnlUsd > 0 ? "up" : pnl?.today.pnlUsd < 0 ? "down" : "neutral"}
            />
            <KpiCard
              label="Success Rate (30d)"
              value={pnl ? `${pnl.successRate}%` : "—"}
              sub={pnl ? `${pnl.month.tradeCount} trades` : undefined}
              trend={pnl?.successRate >= 90 ? "up" : pnl?.successRate >= 70 ? "neutral" : "down"}
            />
          </>
        )}
      </div>

      {/* Regime Signals */}
      {regime?.signals && (
        <div className="ax-panel p-4 space-y-3">
          <h3 className="text-xs font-semibold text-[var(--offwhite)] uppercase tracking-wider">Regime Signals</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Object.entries(regime.signals).map(([key, val]) => (
              <div key={key} className="bg-[rgba(255,255,255,0.02)] rounded p-3">
                <p className="text-[9px] text-[var(--grey2)] uppercase tracking-wide">{key.replace(/([A-Z])/g, " $1").trim()}</p>
                <p className="text-sm font-mono text-[var(--offwhite)] mt-1">{String(val)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Regime Description */}
      {regime?.config?.description && (
        <div className="ax-panel p-4 border-l-2 border-[var(--ax-red)]">
          <p className="text-sm text-[var(--offwhite)]">{regime.config.description}</p>
        </div>
      )}

      {/* Recent Opportunity Pipeline */}
      <div className="ax-panel p-4 space-y-3">
        <h3 className="text-xs font-semibold text-[var(--offwhite)] uppercase tracking-wider">
          Recent Opportunities
        </h3>
        {oppsQ.isLoading ? (
          <Skeleton className="h-40" />
        ) : opps.length === 0 ? (
          <EmptyState message="No opportunities detected yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[9px] text-[var(--grey2)] uppercase tracking-wider border-b border-[var(--border)]">
                  <th className="text-left py-2 px-2">Pair</th>
                  <th className="text-left py-2 px-2">Buy → Sell</th>
                  <th className="text-right py-2 px-2">Spread</th>
                  <th className="text-right py-2 px-2">Net Profit</th>
                  <th className="text-center py-2 px-2">State</th>
                  <th className="text-right py-2 px-2">Age</th>
                </tr>
              </thead>
              <tbody>
                {opps.map((o: any) => {
                  const age = Math.round((Date.now() - new Date(o.detectedAt).getTime()) / 1000);
                  return (
                    <tr key={o.id} className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)]">
                      <td className="py-2 px-2 font-mono text-[var(--offwhite)]">
                        {o.tokenInSymbol}/{o.tokenOutSymbol}
                      </td>
                      <td className="py-2 px-2 text-[var(--grey1)]">
                        {o.buyVenueName} → {o.sellVenueName}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-[var(--grey1)]">
                        ${Number(o.grossSpreadUsd).toFixed(4)}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <span className={`font-mono font-semibold ${Number(o.netProfitUsd) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          ${Number(o.netProfitUsd).toFixed(4)}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center"><StateBadge state={o.state} /></td>
                      <td className="py-2 px-2 text-right font-mono text-[var(--grey2)] text-xs">
                        {age < 60 ? `${age}s` : `${Math.round(age / 60)}m`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
