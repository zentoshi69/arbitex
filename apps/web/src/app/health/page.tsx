"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionHeader, Skeleton } from "@/components/ui";
import { CheckCircle, XCircle, AlertCircle, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

function StatusDot({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold",
      status === "up" || status === "healthy"
        ? "bg-emerald-900/50 text-emerald-400"
        : status === "slow" || status === "degraded"
          ? "bg-amber-900/50 text-amber-400"
          : "bg-red-900/50 text-red-400"
    )}>
      {status === "up" || status === "healthy" ? (
        <CheckCircle className="w-3 h-3" />
      ) : status === "slow" || status === "degraded" ? (
        <AlertCircle className="w-3 h-3" />
      ) : (
        <XCircle className="w-3 h-3" />
      )}
      {status.toUpperCase()}
    </span>
  );
}

export default function HealthPage() {
  const { data: health, isLoading } = useQuery({
    queryKey: ["health"],
    queryFn: () => api.health(),
    refetchInterval: 10_000,
  });

  return (
    <div className="space-y-6 max-w-[1000px]">
      <SectionHeader
        title="System Health"
        description="Real-time service status and infrastructure metrics"
      />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : health ? (
        <div className="space-y-6">
          {/* Overall status */}
          <div className={cn(
            "flex items-center gap-4 px-6 py-4 rounded-xl border",
            health.status === "healthy"
              ? "bg-emerald-950/40 border-emerald-900"
              : health.status === "degraded"
                ? "bg-amber-950/40 border-amber-900"
                : "bg-red-950/40 border-red-900"
          )}>
            <Activity className="w-8 h-8 text-current opacity-60" />
            <div>
              <p className="text-lg font-bold text-white">
                System {health.status.charAt(0).toUpperCase() + health.status.slice(1)}
              </p>
              <p className="text-sm text-slate-400">
                Uptime: {Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m
                · Checked: {new Date(health.checkedAt).toLocaleTimeString()}
              </p>
            </div>
            <div className="ml-auto">
              <StatusDot status={health.status} />
            </div>
          </div>

          {/* Service grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: "Database (PostgreSQL)", status: health.database, detail: "Primary data store" },
              { label: "Cache (Redis)", status: health.redis, detail: "Queue backend + state cache" },
              { label: "Ethereum RPC", status: health.rpc, detail: "Chain interaction layer" },
            ].map(({ label, status, detail }) => (
              <div key={label} className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-slate-200">{label}</p>
                  <StatusDot status={status} />
                </div>
                <p className="text-xs text-slate-500">{detail}</p>
              </div>
            ))}
          </div>

          {/* Kill switches */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">Kill Switch States</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(health.killSwitches).map(([key, active]) => (
                <div
                  key={key}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-lg border",
                    active as boolean
                      ? "bg-red-950/40 border-red-800"
                      : "bg-slate-800/40 border-slate-700"
                  )}
                >
                  <span className="text-xs font-mono text-slate-300">{key}</span>
                  <span className={cn(
                    "text-[10px] font-bold",
                    active as boolean ? "text-red-400" : "text-slate-500"
                  )}>
                    {active ? "ON" : "OFF"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Queue depths */}
          {Object.keys(health.workerQueueDepths).length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-slate-200 mb-3">Worker Queue Depths</h3>
              <div className="space-y-2">
                {Object.entries(health.workerQueueDepths).map(([queue, depth]) => (
                  <div key={queue} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-400 w-48">{queue}</span>
                    <div className="flex-1 bg-slate-800 rounded-full h-2">
                      <div
                        className={cn(
                          "h-2 rounded-full transition-all",
                          (depth as number) > 100
                            ? "bg-red-500"
                            : (depth as number) > 50
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                        )}
                        style={{ width: `${Math.min(100, ((depth as number) / 200) * 100)}%` }}
                      />
                    </div>
                    <span className={cn(
                      "text-xs font-mono w-8 text-right",
                      (depth as number) > 100 ? "text-red-400" : "text-slate-400"
                    )}>
                      {depth as number}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-16 text-slate-500">
          Unable to fetch health status
        </div>
      )}
    </div>
  );
}
