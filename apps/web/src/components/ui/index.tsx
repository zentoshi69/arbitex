import { cn } from "@/lib/utils";
import type { OpportunityState, ExecutionState, RiskSeverity } from "@arbitex/shared-types";

// ── State Badge ───────────────────────────────────────────────────────────────
const OPP_STATE_STYLES: Record<string, string> = {
  DETECTED:    "bg-[rgba(232,65,66,0.08)] text-[var(--ax-off-white)] border border-[rgba(232,65,66,0.25)]",
  QUOTED:      "bg-[rgba(255,255,255,0.04)] text-[var(--ax-off-white)] border border-[var(--ax-border)]",
  SIMULATED:   "bg-[rgba(255,255,255,0.04)] text-[var(--ax-off-white)] border border-[var(--ax-border)]",
  APPROVED:    "bg-[rgba(74,222,128,0.08)] text-[#9FF5C0] border border-[rgba(74,222,128,0.25)]",
  SUBMITTED:   "bg-[rgba(245,158,11,0.06)] text-[#FCD34D] border border-[rgba(245,158,11,0.2)]",
  LANDED:      "bg-[rgba(74,222,128,0.10)] text-[#B7F7D0] border border-[rgba(74,222,128,0.25)]",
  FAILED_TX:   "bg-[rgba(232,65,66,0.10)] text-[#FF6B6B] border border-[rgba(232,65,66,0.3)]",
  FAILED_SIM:  "bg-[rgba(232,65,66,0.10)] text-[#FF6B6B] border border-[rgba(232,65,66,0.3)]",
  EXPIRED:     "bg-[rgba(255,255,255,0.03)] text-[var(--ax-dim)] border border-[var(--ax-border)]",
  BLOCKED:     "bg-[rgba(232,65,66,0.08)] text-[#FF6B6B] border border-[rgba(232,65,66,0.25)]",
  PENDING:     "bg-[rgba(255,255,255,0.03)] text-[var(--ax-off-white)] border border-[var(--ax-border)]",
  SIMULATING:  "bg-[rgba(255,255,255,0.04)] text-[var(--ax-off-white)] border border-[var(--ax-border)]",
  SIGNING:     "bg-[rgba(245,158,11,0.06)] text-[#FCD34D] border border-[rgba(245,158,11,0.2)]",
  CONFIRMING:  "bg-[rgba(245,158,11,0.06)] text-[#FCD34D] border border-[rgba(245,158,11,0.2)]",
  FAILED:      "bg-[rgba(232,65,66,0.10)] text-[#FF6B6B] border border-[rgba(232,65,66,0.3)]",
  CANCELLED:   "bg-[rgba(255,255,255,0.03)] text-[var(--ax-dim)] border border-[var(--ax-border)]",
};

const SEVERITY_STYLES: Record<string, string> = {
  INFO:     "bg-[rgba(255,255,255,0.04)] text-[var(--ax-off-white)]",
  WARNING:  "bg-[rgba(245,158,11,0.06)] text-[#FCD34D]",
  HIGH:     "bg-[rgba(232,65,66,0.08)] text-[#FF6B6B]",
  CRITICAL: "bg-[rgba(232,65,66,0.12)] text-[#FF6B6B] animate-pulse",
};

export function StateBadge({ state }: { state: string }) {
  const style = OPP_STATE_STYLES[state] ?? "bg-[rgba(255,255,255,0.04)] text-[var(--ax-dim)] border border-[var(--ax-border)]";
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
  const style = SEVERITY_STYLES[severity] ?? "bg-[rgba(255,255,255,0.04)] text-[var(--ax-dim)]";
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
    <div className="ax-panel p-4">
      <p className="text-[9px] text-[var(--ax-muted)] font-medium uppercase tracking-[0.14em]">{label}</p>
      <p className={cn("text-2xl font-bold mt-1 font-mono text-[var(--ax-white)]", accent ?? "")}>
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
    <span className="font-mono text-xs text-[var(--ax-dim)]" title={address}>
      {address.slice(0, 6)}…{address.slice(-4)}
    </span>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded", className)} style={{ background: "rgba(255,255,255,0.06)" }} />
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-12 px-6 text-center">
      <div className="mx-auto w-8 h-8 opacity-20 relative">
        <div className="absolute inset-x-0 top-1/2 h-px bg-[var(--ax-white)]" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--ax-white)]" />
      </div>
      <div className="mt-3 text-sm text-[var(--ax-muted)]">{message}</div>
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
    <div className="flex items-start justify-between mb-6 pb-4 border-b border-[var(--ax-border)] relative">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.03em] text-[var(--ax-white)]">{title}</h1>
        {description && <p className="text-[11px] text-[var(--ax-dim)] mt-1">{description}</p>}
      </div>
      {action && <div>{action}</div>}
      <span className="absolute -bottom-px left-0 h-px w-[60px]" style={{ background: "var(--ax-red)" }} />
    </div>
  );
}
