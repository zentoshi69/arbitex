import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Stat({
  label,
  value,
  hint,
  accent = "green",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: "green" | "purple" | "cyan" | "pink" | "amber";
  className?: string;
}) {
  const map: Record<string, string> = {
    green: "text-sol-green",
    purple: "text-sol-purple",
    cyan: "text-sol-cyan",
    pink: "text-sol-pink",
    amber: "text-terminal-amber",
  };
  return (
    <div className={cn("panel rounded p-4 relative overflow-hidden", className)}>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-terminal-dim">{label}</div>
      <div className={cn("mt-1 font-display text-2xl tracking-tight", map[accent])}>{value}</div>
      {hint && <div className="mt-1 font-mono text-[10px] text-terminal-dim/80">{hint}</div>}
      <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full blur-2xl opacity-30 bg-sol-purple" />
    </div>
  );
}
