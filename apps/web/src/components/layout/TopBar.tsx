"use client";

import { useSystemHealth } from "@/hooks/useSystemHealth";
import { useGasPrice } from "@/hooks/useGasPrice";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, Fuel } from "lucide-react";

export function TopBar() {
  const { health } = useSystemHealth();
  const { gasPriceGwei } = useGasPrice();

  const statusColor =
    health?.status === "healthy"
      ? "text-emerald-400"
      : health?.status === "degraded"
        ? "text-amber-400"
        : "text-red-400";

  return (
    <header className="flex items-center justify-between h-12 px-6 bg-slate-900 border-b border-slate-800 flex-shrink-0">
      <div className="flex items-center gap-6 text-xs text-slate-400">
        {/* System status */}
        <div className={cn("flex items-center gap-1.5 font-medium", statusColor)}>
          {health?.status === "healthy" ? (
            <Wifi className="w-3.5 h-3.5" />
          ) : (
            <WifiOff className="w-3.5 h-3.5" />
          )}
          {health?.status?.toUpperCase() ?? "CONNECTING"}
        </div>

        {/* Gas price */}
        {gasPriceGwei !== null && (
          <div className={cn(
            "flex items-center gap-1.5",
            gasPriceGwei > 80 ? "text-amber-400" : gasPriceGwei > 50 ? "text-yellow-400" : "text-slate-400"
          )}>
            <Fuel className="w-3.5 h-3.5" />
            <span className="font-mono">{gasPriceGwei} Gwei</span>
          </div>
        )}

        {/* Queue depths */}
        {health && Object.entries(health.workerQueueDepths).map(([q, depth]) => (
          <span key={q} className="font-mono">
            {q}: <span className={depth > 50 ? "text-amber-400" : "text-slate-300"}>{depth}</span>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="font-mono">{new Date().toISOString().slice(0, 19)}Z</span>
        <span className="text-slate-700">|</span>
        <span className="text-slate-600 font-mono">OPERATOR</span>
      </div>
    </header>
  );
}
