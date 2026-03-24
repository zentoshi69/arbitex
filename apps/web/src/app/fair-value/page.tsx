"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionHeader, KpiCard, Skeleton, EmptyState } from "@/components/ui";

export default function FairValuePage() {
  const fvQ = useQuery({
    queryKey: ["fair-value"],
    queryFn: () => api.fairValue.all(),
    refetchInterval: 15_000,
  });

  const estimates = fvQ.data ?? [];

  return (
    <div className="space-y-6 max-w-[1400px]">
      <SectionHeader
        title="Fair Value"
        description="Multi-source price aggregation with divergence detection — CoinGecko, on-chain DEX reserves, and DB snapshots"
      />

      {fvQ.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : estimates.length === 0 ? (
        <EmptyState message="No fair value estimates available. Check API connection." />
      ) : (
        <>
          {/* KPI summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {estimates.map((e: any) => (
              <KpiCard
                key={e.token}
                label={e.token}
                value={e.compositeUsd > 0 ? `$${e.compositeUsd.toFixed(e.compositeUsd < 1 ? 6 : 2)}` : "—"}
                sub={`${e.sources.length} sources`}
                trend={e.divergenceAlertActive ? "down" : "up"}
              />
            ))}
          </div>

          {/* Per-token details */}
          {estimates.map((est: any) => (
            <TokenFairValue key={est.token} estimate={est} />
          ))}
        </>
      )}
    </div>
  );
}

function TokenFairValue({ estimate }: { estimate: any }) {
  const isDiverging = estimate.divergenceAlertActive;

  return (
    <div className={`ax-panel p-4 space-y-3 ${isDiverging ? "border-l-2 border-yellow-500" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-[var(--offwhite)]">{estimate.token}</h3>
          <span className="text-lg font-mono font-bold text-[var(--offwhite)]">
            ${estimate.compositeUsd > 0 ? estimate.compositeUsd.toFixed(estimate.compositeUsd < 1 ? 6 : 2) : "—"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isDiverging && (
            <span className="text-xs px-2 py-0.5 rounded bg-[rgba(245,158,11,0.1)] text-yellow-400 border border-[rgba(245,158,11,0.3)] font-semibold">
              DIVERGENCE {estimate.maxDivergencePct.toFixed(1)}%
            </span>
          )}
          <span className="text-xs text-[var(--grey2)]">
            {new Date(estimate.updatedAt).toLocaleTimeString()}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[9px] text-[var(--grey2)] uppercase tracking-wider border-b border-[var(--border)]">
              <th className="text-left py-2 px-2">Source</th>
              <th className="text-left py-2 px-2">Method</th>
              <th className="text-right py-2 px-2">Price</th>
              <th className="text-right py-2 px-2">Weight</th>
              <th className="text-right py-2 px-2">Confidence</th>
              <th className="text-center py-2 px-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(estimate.sources ?? []).map((s: any, i: number) => {
              const devPct = estimate.compositeUsd > 0 && s.priceUsd
                ? Math.abs(s.priceUsd - estimate.compositeUsd) / estimate.compositeUsd * 100
                : 0;
              return (
                <tr key={i} className="border-b border-[rgba(255,255,255,0.03)]">
                  <td className="py-2 px-2 text-[var(--offwhite)]">{s.name}</td>
                  <td className="py-2 px-2 text-[var(--grey1)] font-mono text-xs">{s.method}</td>
                  <td className="py-2 px-2 text-right font-mono text-[var(--offwhite)]">
                    {s.priceUsd != null ? `$${s.priceUsd.toFixed(s.priceUsd < 1 ? 6 : 4)}` : "—"}
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-[var(--grey1)]">{s.weight}</td>
                  <td className="py-2 px-2 text-right font-mono text-[var(--grey1)]">{s.confidence != null ? `${(s.confidence * 100).toFixed(0)}%` : "—"}</td>
                  <td className="py-2 px-2 text-center">
                    {s.stale ? (
                      <span className="text-yellow-400 text-xs">STALE</span>
                    ) : devPct > 5 ? (
                      <span className="text-red-400 text-xs">DEV {devPct.toFixed(1)}%</span>
                    ) : (
                      <span className="text-emerald-400 text-xs">OK</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
