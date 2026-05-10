import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function TerminalShell({
  module,
  title,
  description,
  accent = "green",
  children,
  ascii,
}: {
  module: string;
  title: string;
  description: string;
  accent?: "green" | "purple" | "cyan" | "pink" | "amber";
  children: ReactNode;
  ascii?: string;
}) {
  const colorMap: Record<string, string> = {
    green: "text-sol-green",
    purple: "text-sol-purple",
    cyan: "text-sol-cyan",
    pink: "text-sol-pink",
    amber: "text-terminal-amber",
  };
  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <div className={cn("font-mono text-[11px] uppercase tracking-[0.3em]", colorMap[accent])}>
            <span className="text-sol-purple">▸</span> {module}
          </div>
          <h1 className="mt-2 font-display text-4xl md:text-5xl tracking-tight">
            {title.split("//")[0]}
            {title.includes("//") && <span className="text-grad">//{title.split("//")[1]}</span>}
          </h1>
          <p className="mt-3 max-w-2xl font-mono text-sm text-terminal-dim leading-relaxed">{description}</p>
        </div>
        {ascii && (
          <pre className={cn("ascii hidden md:block text-[10px] leading-tight opacity-70", colorMap[accent])}>
            {ascii}
          </pre>
        )}
      </div>

      <div className="mt-8">{children}</div>
    </div>
  );
}
