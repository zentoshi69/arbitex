"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionHeader, KpiCard, Skeleton, EmptyState } from "@/components/ui";
import { fmt, num } from "@/lib/utils";

const REGIME_COLORS: Record<string, string> = {
  SAFE_MODE: "bg-red-500/20 text-red-400 border-red-500/30",
  GAP_RISK: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  LP_THIN: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  INV_STRESS: "bg-red-500/20 text-red-400 border-red-500/30",
  HIGH_VOL: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  RANGE_MR: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  TREND_UP: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  TREND_DOWN: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  NORMAL: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

export default function RegimePage() {
  const regimeQ = useQuery({
    queryKey: ["regime-current"],
    queryFn: () => api.regime.current(),
    refetchInterval: 30_000,
  });

  const configsQ = useQuery({
    queryKey: ["regime-configs"],
    queryFn: () => api.regime.configs(),
  });

  const current = regimeQ.data;
  const configs = configsQ.data ?? {};

  return (
    <div className="space-y-6 max-w-[1400px]">
      <SectionHeader
        title="Market Regime"
        description="Automated market classification — adjusts trade sizing, hurdle rates, and algorithm selection in real-time"
      />

      {/* Current Regime Hero */}
      {regimeQ.isLoading ? (
        <Skeleton className="h-36" />
      ) : current ? (
        <div className="ax-panel p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[9px] text-[var(--grey2)] uppercase tracking-wider">Current Regime</p>
              <div className="flex items-center gap-3 mt-2">
                <span className={`text-2xl font-bold font-mono px-4 py-1.5 rounded border ${REGIME_COLORS[current.regime] ?? "bg-[rgba(255,255,255,0.05)] text-[var(--offwhite)]"}`}>
                  {current.regime}
                </span>
              </div>
              <p className="text-sm text-[var(--grey1)] mt-2">{current.config?.description}</p>
            </div>
            <div className="text-right text-xs text-[var(--grey2)]">
              Classified {new Date(current.classifiedAt).toLocaleTimeString()}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Size Multiplier"
              value={`${fmt(num(current.config?.sizeMultiplier) * 100, 0)}%`}
              sub={current.config?.sizeMultiplier === 0 ? "HALTED" : undefined}
              trend={num(current.config?.sizeMultiplier) >= 0.75 ? "up" : num(current.config?.sizeMultiplier) > 0 ? "neutral" : "down"}
            />
            <KpiCard
              label="Hurdle Rate"
              value={`${current.config?.hurdleBps ?? "—"} bps`}
              sub="Min profit threshold"
            />
            <KpiCard
              label="Algorithm"
              value={current.config?.algorithm ?? "—"}
              sub={`Priority: ${current.config?.priority ?? "—"}`}
            />
            <KpiCard
              label="Fail Rate"
              value={`${fmt(current.signals?.failRatePercent, 1)}%`}
              sub={`Vol: ${fmt(current.signals?.volatility24h, 1)}`}
              trend={num(current.signals?.failRatePercent) < 20 ? "up" : num(current.signals?.failRatePercent) < 50 ? "neutral" : "down"}
            />
          </div>
        </div>
      ) : regimeQ.isError ? (
        <EmptyState message="Failed to load regime data — check API connection" />
      ) : (
        <EmptyState message="Regime classifier not available" />
      )}

      {/* Signals Detail */}
      {current?.signals && (
        <div className="ax-panel p-4 space-y-3">
          <h3 className="text-xs font-semibold text-[var(--offwhite)] uppercase tracking-wider">Signal Inputs</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SignalCard label="Volatility (24h)" value={fmt(current.signals.volatility24h)} />
            <SignalCard label="Spread Mean (bps)" value={fmt(current.signals.spreadMeanBps)} />
            <SignalCard label="Fail Rate (%)" value={fmt(current.signals.failRatePercent, 1)} />
            <SignalCard label="LP Depth Score" value={fmt(current.signals.lpDepthScore, 1)} />
            <SignalCard label="Trend Direction" value={current.signals.trendDirection ?? "—"} />
          </div>
        </div>
      )}

      {/* All Regime Configs */}
      <div className="ax-panel p-4 space-y-3">
        <h3 className="text-xs font-semibold text-[var(--offwhite)] uppercase tracking-wider">All Regime Configurations</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[9px] text-[var(--grey2)] uppercase tracking-wider border-b border-[var(--border)]">
                <th className="text-left py-2 px-2">Regime</th>
                <th className="text-right py-2 px-2">Size Mult</th>
                <th className="text-right py-2 px-2">Hurdle</th>
                <th className="text-center py-2 px-2">Algorithm</th>
                <th className="text-center py-2 px-2">Priority</th>
                <th className="text-left py-2 px-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(configs).map((c: any) => {
                const isActive = current?.regime === c.regime;
                return (
                  <tr
                    key={c.regime}
                    className={`border-b border-[rgba(255,255,255,0.03)] ${isActive ? "bg-[rgba(232,65,66,0.05)]" : ""}`}
                  >
                    <td className="py-2 px-2">
                      <span className={`font-mono font-semibold text-xs px-2 py-0.5 rounded border ${REGIME_COLORS[c.regime] ?? ""}`}>
                        {c.regime}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-[var(--offwhite)]">
                      {fmt(num(c.sizeMultiplier) * 100, 0)}%
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-[var(--offwhite)]">{c.hurdleBps ?? "—"}</td>
                    <td className="py-2 px-2 text-center font-mono text-[var(--grey1)]">{c.algorithm}</td>
                    <td className="py-2 px-2 text-center font-mono text-[var(--grey1)]">{c.priority}</td>
                    <td className="py-2 px-2 text-[var(--grey1)] text-xs">{c.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SignalCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[rgba(255,255,255,0.02)] rounded p-3">
      <p className="text-[9px] text-[var(--grey2)] uppercase tracking-wide">{label}</p>
      <p className="text-base font-mono font-bold text-[var(--offwhite)] mt-1">{value}</p>
    </div>
  );
}
