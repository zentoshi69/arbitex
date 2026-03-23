"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionHeader, KpiCard, Skeleton, EmptyState } from "@/components/ui";

const SLEEVE_COLORS = {
  core: "#4DD68C",
  tactical: "#E84142",
  arb: "#FBBF24",
};

export default function AccumulationPage() {
  const dashQ = useQuery({
    queryKey: ["accumulation-dashboard"],
    queryFn: () => api.accumulation.dashboard(),
    refetchInterval: 15_000,
  });

  const { state, routing, recentActivity } = dashQ.data ?? {};

  return (
    <div className="space-y-6 max-w-[1400px]">
      <SectionHeader
        title="Accumulation Engine"
        description="WRP unit inventory management — tracks capital across core, tactical, and arb sleeves"
      />

      {dashQ.isLoading ? (
        <Skeleton className="h-48" />
      ) : state ? (
        <>
          {/* WRP Unit Inventory */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Total WRP Units"
              value={state.totalWRPUnits.toFixed(2)}
              sub={`+${state.wrpUnitsGainedAllTime.toFixed(2)} all-time`}
              trend="up"
            />
            <KpiCard
              label="Core Sleeve"
              value={state.coreWRPUnits.toFixed(2)}
              sub={`${(state.coreSleeveAllocationPct * 100).toFixed(0)}% allocation`}
              accent="text-[#4DD68C]"
            />
            <KpiCard
              label="Tactical Sleeve"
              value={state.tacticalWRPUnits.toFixed(2)}
              sub={`${(state.tacticalSleeveAllocationPct * 100).toFixed(0)}% allocation`}
              accent="text-[#E84142]"
            />
            <KpiCard
              label="Arb Sleeve Liquidity"
              value={`$${state.arbSleeveLiquidityUsd.toFixed(2)}`}
              sub={`${(state.arbSleeveAllocationPct * 100).toFixed(0)}% allocation`}
              accent="text-[#FBBF24]"
            />
          </div>

          {/* Sleeve Visualization */}
          <div className="ax-panel p-6 space-y-4">
            <h3 className="text-xs font-semibold text-[var(--offwhite)] uppercase tracking-wider">
              Capital Allocation
            </h3>
            <div className="flex h-8 rounded overflow-hidden">
              <div
                className="flex items-center justify-center text-[10px] font-mono font-bold text-black transition-all"
                style={{
                  width: `${state.coreSleeveAllocationPct * 100}%`,
                  backgroundColor: SLEEVE_COLORS.core,
                  minWidth: "40px",
                }}
              >
                CORE {(state.coreSleeveAllocationPct * 100).toFixed(0)}%
              </div>
              <div
                className="flex items-center justify-center text-[10px] font-mono font-bold text-white transition-all"
                style={{
                  width: `${state.tacticalSleeveAllocationPct * 100}%`,
                  backgroundColor: SLEEVE_COLORS.tactical,
                  minWidth: "40px",
                }}
              >
                TACTICAL {(state.tacticalSleeveAllocationPct * 100).toFixed(0)}%
              </div>
              <div
                className="flex items-center justify-center text-[10px] font-mono font-bold text-black transition-all"
                style={{
                  width: `${state.arbSleeveAllocationPct * 100}%`,
                  backgroundColor: SLEEVE_COLORS.arb,
                  minWidth: "40px",
                }}
              >
                ARB {(state.arbSleeveAllocationPct * 100).toFixed(0)}%
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center text-[10px] text-[var(--grey2)]">
              <div>
                <span className="inline-block h-2 w-2 rounded-full mr-1" style={{ backgroundColor: SLEEVE_COLORS.core }} />
                Core — Long-term WRP hold (never sold)
              </div>
              <div>
                <span className="inline-block h-2 w-2 rounded-full mr-1" style={{ backgroundColor: SLEEVE_COLORS.tactical }} />
                Tactical — Rotation between WRP/AVAX
              </div>
              <div>
                <span className="inline-block h-2 w-2 rounded-full mr-1" style={{ backgroundColor: SLEEVE_COLORS.arb }} />
                Arb — Execution capital (profits pipe to WRP)
              </div>
            </div>
          </div>

          {/* Performance Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Units Gained Today"
              value={`+${state.wrpUnitsGainedToday.toFixed(2)}`}
              trend="up"
            />
            <KpiCard
              label="Units Gained All-Time"
              value={`+${state.wrpUnitsGainedAllTime.toFixed(2)}`}
              trend="up"
            />
            <KpiCard
              label="Units Lost to Rotation"
              value={state.wrpUnitsLostToRotation.toFixed(2)}
              trend={state.wrpUnitsLostToRotation > 0 ? "down" : "neutral"}
            />
            <KpiCard
              label="Max Single Conversion"
              value={`$${state.maxSingleConversionUsd.toFixed(0)}`}
              sub={`Tactical max: $${state.maxTacticalSleeveUsd.toFixed(0)}`}
            />
          </div>

          {/* Arb Profit Routing */}
          {routing && (
            <div className="ax-panel p-4 space-y-3">
              <h3 className="text-xs font-semibold text-[var(--offwhite)] uppercase tracking-wider">
                Arb Profit → WRP Pipeline
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <InfoCell
                  label="Pending Conversion"
                  value={`$${routing.pendingUsdForWRPConversion.toFixed(2)}`}
                />
                <InfoCell
                  label="Auto-Convert Threshold"
                  value={`$${routing.autoConvertThreshold.toFixed(0)}`}
                />
                <InfoCell
                  label="Auto-Convert"
                  value={routing.autoConvertEnabled ? "ENABLED" : "DISABLED"}
                  color={routing.autoConvertEnabled ? "#4DD68C" : "var(--grey2)"}
                />
                <InfoCell
                  label="Last Routed"
                  value={
                    routing.lastRoutingAt > 0
                      ? new Date(routing.lastRoutingAt).toLocaleTimeString()
                      : "Never"
                  }
                />
              </div>
            </div>
          )}

          {/* Recent Activity */}
          {recentActivity && recentActivity.length > 0 && (
            <div className="ax-panel p-4 space-y-3">
              <h3 className="text-xs font-semibold text-[var(--offwhite)] uppercase tracking-wider">
                Recent Activity
              </h3>
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {recentActivity.map((log: any) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 py-2 border-b border-[rgba(255,255,255,0.03)] last:border-0"
                  >
                    <span className="text-[10px] font-mono text-[var(--grey3)] min-w-[70px]">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                    <span className="text-xs text-[var(--grey1)]">
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <EmptyState message="Accumulation engine not initialized yet — waiting for first data cycle" />
      )}
    </div>
  );
}

function InfoCell({
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
