"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionHeader, KpiCard, Skeleton, EmptyState } from "@/components/ui";

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  pass: { bg: "rgba(77,214,140,0.10)", text: "#4DD68C", border: "rgba(77,214,140,0.25)" },
  fail: { bg: "rgba(232,65,66,0.10)", text: "#E84142", border: "rgba(232,65,66,0.25)" },
  neutral: { bg: "rgba(251,191,36,0.10)", text: "#FBBF24", border: "rgba(251,191,36,0.25)" },
  info: { bg: "rgba(96,165,250,0.10)", text: "#60A5FA", border: "rgba(96,165,250,0.25)" },
};

const STATUS_ICON: Record<string, string> = {
  pass: "\u2713",
  fail: "\u2717",
  neutral: "\u25CB",
  info: "\u2139",
};

interface ExplanationSection {
  title: string;
  status: string;
  summary: string;
  details: string[];
}

export default function ExplainabilityPage() {
  const dashQ = useQuery({
    queryKey: ["conversion-dashboard"],
    queryFn: () => api.conversion.dashboard(),
    refetchInterval: 15_000,
  });

  const explanation = dashQ.data?.explanation as {
    timestamp: number;
    direction: string;
    approved: boolean;
    sections: ExplanationSection[];
  } | null | undefined;

  const signals = dashQ.data?.signals;
  const decision = dashQ.data?.latestDecision;

  return (
    <div className="space-y-6 p-6">
      <SectionHeader
        title="Explainability"
        subtitle="7-section breakdown of every conversion decision — human-readable, auditable, transparent"
      />

      {dashQ.isLoading && <Skeleton className="h-64" />}

      {!dashQ.isLoading && !explanation && (
        <EmptyState message="No explanation available yet. Waiting for first conversion evaluation cycle." />
      )}

      {explanation && (
        <>
          {/* Header KPIs */}
          <div className="grid grid-cols-4 gap-4">
            <KpiCard
              label="Direction"
              value={
                explanation.direction === "AVAX_TO_WRP"
                  ? "AVAX \u2192 WRP"
                  : explanation.direction === "WRP_TO_AVAX"
                    ? "WRP \u2192 AVAX"
                    : "NO TRADE"
              }
              valueColor={
                explanation.direction === "AVAX_TO_WRP"
                  ? "#4DD68C"
                  : explanation.direction === "WRP_TO_AVAX"
                    ? "#E84142"
                    : "var(--grey2)"
              }
            />
            <KpiCard
              label="Verdict"
              value={explanation.approved ? "APPROVED" : "BLOCKED"}
              valueColor={explanation.approved ? "#4DD68C" : "#E84142"}
            />
            <KpiCard
              label="Sections"
              value={`${explanation.sections.filter((s) => s.status === "pass").length}/${explanation.sections.length} pass`}
              valueColor="var(--offwhite)"
            />
            <KpiCard
              label="Evaluated"
              value={new Date(explanation.timestamp).toLocaleTimeString()}
              valueColor="var(--grey1)"
            />
          </div>

          {/* Explanation Sections */}
          <div className="space-y-4">
            {explanation.sections.map((section, idx) => {
              const style = STATUS_STYLES[section.status] ?? STATUS_STYLES.info;
              const icon = STATUS_ICON[section.status] ?? "?";

              return (
                <div
                  key={idx}
                  className="rounded-lg border p-4"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: style.border,
                  }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                      style={{
                        backgroundColor: style.bg,
                        color: style.text,
                        border: `1px solid ${style.border}`,
                      }}
                    >
                      {icon}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--grey3)]">
                          {idx + 1}/7
                        </span>
                        <h3 className="text-sm font-semibold text-[var(--offwhite)]">
                          {section.title}
                        </h3>
                      </div>
                      <p className="mt-0.5 text-xs" style={{ color: style.text }}>
                        {section.summary}
                      </p>
                    </div>
                    <span
                      className="rounded px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider"
                      style={{
                        backgroundColor: style.bg,
                        color: style.text,
                        border: `1px solid ${style.border}`,
                      }}
                    >
                      {section.status}
                    </span>
                  </div>

                  <div className="space-y-1 pl-10">
                    {section.details.map((detail, di) => (
                      <p
                        key={di}
                        className="font-mono text-[11px] text-[var(--grey1)]"
                      >
                        {detail}
                      </p>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Live Market Signals */}
          {signals && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <h3 className="mb-3 font-mono text-[10px] uppercase tracking-widest text-[var(--grey3)]">
                Live Market Signals
              </h3>
              <div className="grid grid-cols-3 gap-x-6 gap-y-2">
                <SignalRow label="BTC 1h Return" value={`${((signals.btc1hReturn ?? 0) * 100).toFixed(2)}%`} />
                <SignalRow label="BTC 4h Return" value={`${((signals.btc4hReturn ?? 0) * 100).toFixed(2)}%`} />
                <SignalRow label="BTC 24h Return" value={`${((signals.btc24hReturn ?? 0) * 100).toFixed(2)}%`} />
                <SignalRow label="BTC EMA Slope" value={(signals.btcEMASlope ?? 0).toFixed(4)} />
                <SignalRow label="BTC Vol" value={`${(signals.btcRealizedVolatility ?? 0).toFixed(1)}%`} />
                <SignalRow label="BTC Above 21 EMA" value={signals.btcAbove21EMA ? "YES" : "NO"} color={signals.btcAbove21EMA ? "#4DD68C" : "#E84142"} />
                <SignalRow label="WRP Price" value={`$${(signals.wrpPriceUsd ?? 0).toFixed(6)}`} />
                <SignalRow label="AVAX Price" value={`$${(signals.avaxPriceUsd ?? 0).toFixed(2)}`} />
                <SignalRow label="WRP/AVAX Ratio" value={(signals.wrpAvaxRatio ?? 0).toFixed(6)} />
                <SignalRow label="Ratio Trend" value={(signals.wrpAvaxRatioTrend ?? 0).toFixed(6)} color={(signals.wrpAvaxRatioTrend ?? 0) > 0 ? "#4DD68C" : "#E84142"} />
                <SignalRow label="WRP Z-Score" value={(signals.wrpZScore ?? 0).toFixed(2)} />
                <SignalRow label="WRP Rel. Volume" value={`${(signals.wrpRelativeVolume ?? 0).toFixed(2)}x`} />
                <SignalRow label="Liquidity Score" value={String(signals.wrpLiquidityScore ?? 0)} />
                <SignalRow label="LP Depth" value={`$${((signals.lpDepthUsd ?? 0) / 1000).toFixed(1)}k`} />
                <SignalRow label="Slippage Est." value={`${((signals.slippageEstimate ?? 0) * 100).toFixed(2)}%`} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SignalRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[10px] text-[var(--grey2)]">{label}</span>
      <span
        className="font-mono text-[11px] font-medium"
        style={{ color: color ?? "var(--offwhite)" }}
      >
        {value}
      </span>
    </div>
  );
}
