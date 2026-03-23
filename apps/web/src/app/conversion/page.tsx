"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionHeader, KpiCard, Skeleton, EmptyState } from "@/components/ui";

const STATE_COLORS: Record<string, string> = {
  A: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  B: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  C: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  D: "bg-red-500/20 text-red-400 border-red-500/30",
};

const DIRECTION_LABELS: Record<string, { label: string; color: string }> = {
  AVAX_TO_WRP: { label: "AVAX → WRP", color: "#4DD68C" },
  WRP_TO_AVAX: { label: "WRP → AVAX", color: "#E84142" },
  NO_TRADE: { label: "NO TRADE", color: "var(--grey2)" },
};

export default function ConversionPage() {
  const dashQ = useQuery({
    queryKey: ["conversion-dashboard"],
    queryFn: () => api.conversion.dashboard(),
    refetchInterval: 15_000,
  });

  const { latestDecision: d, recentDecisions, extendedRegimeConfigs } =
    dashQ.data ?? {};

  return (
    <div className="space-y-6 max-w-[1400px]">
      <SectionHeader
        title="Conversion Engine"
        description="WRP/AVAX tactical rotation — evaluates market signals, scores assets, and produces trade or no-trade decisions"
      />

      {dashQ.isLoading ? (
        <Skeleton className="h-48" />
      ) : d ? (
        <>
          {/* Decision Hero */}
          <div className="ax-panel p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[9px] text-[var(--grey2)] uppercase tracking-wider">
                  Latest Decision
                </p>
                <div className="flex items-center gap-4 mt-2">
                  <span
                    className="text-3xl font-bold font-mono"
                    style={{
                      color:
                        DIRECTION_LABELS[d.direction]?.color ?? "var(--offwhite)",
                    }}
                  >
                    {DIRECTION_LABELS[d.direction]?.label ?? d.direction}
                  </span>
                  <span
                    className={`text-sm font-mono font-bold px-3 py-1 rounded border ${STATE_COLORS[d.conversionState] ?? "bg-[rgba(255,255,255,0.05)] text-[var(--offwhite)]"}`}
                  >
                    State {d.conversionState}
                  </span>
                  <span
                    className={`text-sm font-mono font-bold px-3 py-1 rounded ${d.approved ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/10 text-red-400"}`}
                  >
                    {d.approved ? "APPROVED" : "BLOCKED"}
                  </span>
                </div>
              </div>
              <div className="text-right text-xs text-[var(--grey2)]">
                {new Date(d.timestamp).toLocaleTimeString()}
              </div>
            </div>

            {/* Score Gauges */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              <KpiCard
                label="WRP Score"
                value={d.scoreWRP.toFixed(1)}
                sub="Favor accumulating WRP"
                trend={d.scoreWRP > 0 ? "up" : "down"}
              />
              <KpiCard
                label="AVAX Score"
                value={d.scoreAVAX.toFixed(1)}
                sub="Favor holding AVAX"
                trend={d.scoreAVAX > 0 ? "up" : "down"}
              />
              <KpiCard
                label="Score Delta"
                value={d.scoreDelta.toFixed(1)}
                sub={`Hurdle: ${d.hurdleBps.toFixed(1)}`}
                trend={d.passedHurdle ? "up" : "down"}
              />
              <KpiCard
                label="Proposed Size"
                value={`$${d.proposedSizeUsd.toFixed(2)}`}
                sub={`${d.proposedSizeWRPUnits.toFixed(1)} WRP units`}
              />
            </div>
          </div>

          {/* WRP Unit Test */}
          <div className="ax-panel p-4 space-y-3">
            <h3 className="text-xs font-semibold text-[var(--offwhite)] uppercase tracking-wider">
              WRP Unit Gate
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SignalCell
                label="Current WRP Units"
                value={d.currentWRPUnits.toFixed(2)}
              />
              <SignalCell
                label="Expected After Costs"
                value={d.expectedWRPUnitsAfterCosts.toFixed(2)}
                color={
                  d.expectedUnitGain > 0 ? "#4DD68C" : "#E84142"
                }
              />
              <SignalCell
                label="Expected Gain"
                value={`${d.expectedUnitGain > 0 ? "+" : ""}${d.expectedUnitGain.toFixed(2)}`}
                color={d.expectedUnitGain > 0 ? "#4DD68C" : "#E84142"}
              />
              <SignalCell
                label="Unit Test"
                value={d.passedUnitTest ? "PASSED" : "FAILED"}
                color={d.passedUnitTest ? "#4DD68C" : "#E84142"}
              />
            </div>
          </div>

          {/* Costs Breakdown */}
          {d.costs && (
            <div className="ax-panel p-4 space-y-3">
              <h3 className="text-xs font-semibold text-[var(--offwhite)] uppercase tracking-wider">
                Cost Estimation
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <SignalCell
                  label="Fees"
                  value={`$${d.costs.feesUsd.toFixed(4)}`}
                />
                <SignalCell
                  label="Slippage"
                  value={`$${d.costs.slippageUsd.toFixed(4)}`}
                />
                <SignalCell
                  label="Gas"
                  value={`$${d.costs.gasUsd.toFixed(4)}`}
                />
                <SignalCell
                  label="Uncertainty Buffer"
                  value={`$${d.costs.uncertaintyBuffer.toFixed(4)}`}
                />
                <SignalCell
                  label="Total Cost"
                  value={`$${d.costs.totalCostUsd.toFixed(4)}`}
                  color="#E84142"
                />
              </div>
            </div>
          )}

          {/* Blocked Reasons */}
          {d.blockedReasons && d.blockedReasons.length > 0 && (
            <div className="ax-panel p-4 space-y-3">
              <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider">
                Blocked Reasons
              </h3>
              <ul className="space-y-1">
                {d.blockedReasons.map((reason: string, i: number) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-[var(--grey1)]"
                  >
                    <span className="text-red-400 mt-0.5">×</span>
                    <span className="font-mono text-xs">{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Market Signals */}
          {d.signals && (
            <div className="ax-panel p-4 space-y-3">
              <h3 className="text-xs font-semibold text-[var(--offwhite)] uppercase tracking-wider">
                Market Signals
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <SignalCell
                  label="WRP Price"
                  value={`$${d.signals.wrpPriceUsd.toFixed(4)}`}
                />
                <SignalCell
                  label="AVAX Price"
                  value={`$${d.signals.avaxPriceUsd.toFixed(2)}`}
                />
                <SignalCell
                  label="BTC Above 21 EMA"
                  value={d.signals.btcAbove21EMA ? "YES" : "NO"}
                  color={d.signals.btcAbove21EMA ? "#4DD68C" : "#E84142"}
                />
                <SignalCell
                  label="WRP Above 21 EMA"
                  value={d.signals.wrpAbove21EMA ? "YES" : "NO"}
                  color={d.signals.wrpAbove21EMA ? "#4DD68C" : "#E84142"}
                />
                <SignalCell
                  label="WRP/AVAX Ratio Trend"
                  value={d.signals.wrpAvaxRatioTrend.toFixed(3)}
                />
                <SignalCell
                  label="WRP Z-Score"
                  value={d.signals.wrpZScore.toFixed(2)}
                />
                <SignalCell
                  label="Slippage Est."
                  value={`${(d.signals.slippageEstimate * 100).toFixed(2)}%`}
                />
                <SignalCell
                  label="LP Depth"
                  value={`$${d.signals.lpDepthUsd?.toLocaleString() ?? "—"}`}
                />
              </div>
            </div>
          )}

          {/* Decision History */}
          {recentDecisions && recentDecisions.length > 0 && (
            <div className="ax-panel p-4 space-y-3">
              <h3 className="text-xs font-semibold text-[var(--offwhite)] uppercase tracking-wider">
                Decision History
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[9px] text-[var(--grey2)] uppercase tracking-wider border-b border-[var(--border)]">
                      <th className="text-left py-2 px-2">Time</th>
                      <th className="text-left py-2 px-2">Level</th>
                      <th className="text-left py-2 px-2">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDecisions.map((log: any) => {
                      const payload = log.payload as any;
                      return (
                        <tr
                          key={log.id}
                          className="border-b border-[rgba(255,255,255,0.03)]"
                        >
                          <td className="py-2 px-2 text-[10px] font-mono text-[var(--grey3)]">
                            {new Date(log.createdAt).toLocaleTimeString()}
                          </td>
                          <td className="py-2 px-2">
                            <span
                              className={`text-[10px] font-mono font-bold ${log.level === "INFO" ? "text-emerald-400" : "text-yellow-400"}`}
                            >
                              {log.level}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-xs text-[var(--grey1)] font-mono">
                            {log.message}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Extended Regime Configs */}
          {extendedRegimeConfigs && (
            <div className="ax-panel p-4 space-y-3">
              <h3 className="text-xs font-semibold text-[var(--offwhite)] uppercase tracking-wider">
                Regime → Conversion Policy
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[9px] text-[var(--grey2)] uppercase tracking-wider border-b border-[var(--border)]">
                      <th className="text-left py-2 px-2">Regime</th>
                      <th className="text-center py-2 px-2">Conv. Allowed</th>
                      <th className="text-center py-2 px-2">Arb Allowed</th>
                      <th className="text-right py-2 px-2">Hurdle Mult</th>
                      <th className="text-right py-2 px-2">Tactical Mult</th>
                      <th className="text-left py-2 px-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(extendedRegimeConfigs).map((c: any) => (
                      <tr
                        key={c.state}
                        className="border-b border-[rgba(255,255,255,0.03)]"
                      >
                        <td className="py-2 px-2 font-mono font-semibold text-xs text-[var(--offwhite)]">
                          {c.state}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span
                            className={`text-xs font-mono font-bold ${c.conversionAllowed ? "text-emerald-400" : "text-red-400"}`}
                          >
                            {c.conversionAllowed ? "YES" : "NO"}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span
                            className={`text-xs font-mono font-bold ${c.arbAllowed ? "text-emerald-400" : "text-red-400"}`}
                          >
                            {c.arbAllowed ? "YES" : "NO"}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-[var(--offwhite)]">
                          {c.edgeHurdleMultiplier.toFixed(1)}x
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-[var(--offwhite)]">
                          {c.maxTacticalSleeveMultiplier.toFixed(1)}x
                        </td>
                        <td className="py-2 px-2 text-xs text-[var(--grey1)]">
                          {c.suggestedAction}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <EmptyState message="No conversion decisions yet — engine evaluates every 60 seconds" />
      )}
    </div>
  );
}

function SignalCell({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-[rgba(255,255,255,0.02)] rounded p-3">
      <p className="text-[9px] text-[var(--grey2)] uppercase tracking-wide">
        {label}
      </p>
      <p
        className="text-base font-mono font-bold mt-1"
        style={{ color: color ?? "var(--offwhite)" }}
      >
        {value}
      </p>
    </div>
  );
}
