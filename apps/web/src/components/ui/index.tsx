import { cn } from "@/lib/utils";
import type { OpportunityState, ExecutionState, RiskSeverity } from "@arbitex/shared-types";

// ── State Badge ───────────────────────────────────────────────────────────────
const OPP_STATE_STYLES: Record<string, string> = {
  DETECTED:    "bg-blue-900/40 text-blue-300 border border-blue-800",
  QUOTED:      "bg-cyan-900/40 text-cyan-300 border border-cyan-800",
  SIMULATED:   "bg-violet-900/40 text-violet-300 border border-violet-800",
  APPROVED:    "bg-emerald-900/40 text-emerald-300 border border-emerald-800",
  SUBMITTED:   "bg-amber-900/40 text-amber-300 border border-amber-800",
  LANDED:      "bg-emerald-900/60 text-emerald-200 border border-emerald-700",
  FAILED_TX:   "bg-red-900/40 text-red-300 border border-red-800",
  FAILED_SIM:  "bg-red-900/40 text-red-300 border border-red-800",
  EXPIRED:     "bg-slate-800 text-slate-400 border border-slate-700",
  BLOCKED:     "bg-orange-900/40 text-orange-300 border border-orange-800",
  PENDING:     "bg-slate-800 text-slate-300 border border-slate-700",
  SIMULATING:  "bg-violet-900/40 text-violet-300 border border-violet-800",
  SIGNING:     "bg-amber-900/40 text-amber-300 border border-amber-800",
  CONFIRMING:  "bg-amber-900/40 text-amber-300 border border-amber-800",
  FAILED:      "bg-red-900/40 text-red-300 border border-red-800",
  CANCELLED:   "bg-slate-800 text-slate-400 border border-slate-700",
};

const SEVERITY_STYLES: Record<string, string> = {
  INFO:     "bg-blue-900/40 text-blue-300",
  WARNING:  "bg-amber-900/40 text-amber-300",
  HIGH:     "bg-orange-900/40 text-orange-300",
  CRITICAL: "bg-red-900/60 text-red-200 animate-pulse",
};

export function StateBadge({ state }: { state: string }) {
  const style = OPP_STATE_STYLES[state] ?? "bg-slate-800 text-slate-400";
  const isLive = state === "SUBMITTED" || state === "CONFIRMING";
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold font-mono",
      style
    )}>
      {isLive && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80 badge-live" />}
      {state}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const style = SEVERITY_STYLES[severity] ?? "bg-slate-800 text-slate-400";
  return (
    <span className={cn("inline-flex px-2 py-0.5 rounded text-[11px] font-bold", style)}>
      {severity}
    </span>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
type KpiCardProps = {
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "neutral";
  accent?: string;
};

export function KpiCard({ label, value, sub, trend, accent }: KpiCardProps) {
  const trendColor =
    trend === "up" ? "text-emerald-400" :
    trend === "down" ? "text-red-400" : "text-slate-400";

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{label}</p>
      <p className={cn("text-2xl font-bold mt-1 font-mono", accent ?? "text-white")}>
        {value}
      </p>
      {sub && (
        <p className={cn("text-xs mt-1", trendColor)}>{sub}</p>
      )}
    </div>
  );
}

// ── Profit display ────────────────────────────────────────────────────────────
export function ProfitCell({ value }: { value: number }) {
  const isPos = value >= 0;
  return (
    <span className={cn("font-mono font-semibold text-sm", isPos ? "text-emerald-400" : "text-red-400")}>
      {isPos ? "+" : ""}{value.toFixed(4)} USD
    </span>
  );
}

// ── Address display ────────────────────────────────────────────────────────────
export function AddressCell({ address }: { address: string }) {
  return (
    <span className="font-mono text-xs text-slate-400" title={address}>
      {address.slice(0, 6)}…{address.slice(-4)}
    </span>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse bg-slate-800 rounded", className)} />
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-slate-500 text-sm">
      {message}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-lg font-semibold text-white">{title}</h1>
        {description && <p className="text-sm text-slate-400 mt-0.5">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
