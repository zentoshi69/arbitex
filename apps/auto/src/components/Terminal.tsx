import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface TerminalProps {
  title?: string;
  subtitle?: string;
  status?: string;
  accent?: "green" | "purple" | "cyan" | "pink" | "amber";
  children: ReactNode;
  className?: string;
  height?: string;
}

const accentMap = {
  green: { dot: "bg-sol-green", text: "text-sol-green", border: "border-sol-green/40" },
  purple: { dot: "bg-sol-purple", text: "text-sol-purple", border: "border-sol-purple/40" },
  cyan: { dot: "bg-sol-cyan", text: "text-sol-cyan", border: "border-sol-cyan/40" },
  pink: { dot: "bg-sol-pink", text: "text-sol-pink", border: "border-sol-pink/40" },
  amber: { dot: "bg-terminal-amber", text: "text-terminal-amber", border: "border-terminal-amber/40" },
};

export function Terminal({
  title = "auto://terminal",
  subtitle,
  status = "ONLINE",
  accent = "green",
  children,
  className,
  height,
}: TerminalProps) {
  const a = accentMap[accent];
  return (
    <div className={cn("panel panel-glow crt rounded relative", className)}>
      <div className={cn("flex items-center justify-between border-b px-4 py-2", a.border)}>
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em]">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-terminal-red/80 shadow-[0_0_8px_#ff3860]" />
            <span className="h-2.5 w-2.5 rounded-full bg-terminal-amber/80 shadow-[0_0_8px_#ffb000]" />
            <span className={cn("h-2.5 w-2.5 rounded-full shadow-[0_0_8px_#00ff9f]", a.dot)} />
          </span>
          <span className="text-white/80">{title}</span>
          {subtitle && <span className="text-terminal-dim">— {subtitle}</span>}
        </div>
        <div className={cn("flex items-center gap-2 font-mono text-[10px]", a.text)}>
          <span className={cn("h-1.5 w-1.5 rounded-full animate-pulse", a.dot)} />
          {status}
        </div>
      </div>
      <div
        className="relative font-mono text-[12.5px] leading-relaxed text-white/85 p-4 term-scroll overflow-auto"
        style={height ? { height } : undefined}
      >
        <div className="scanline" />
        {children}
      </div>
    </div>
  );
}

export function Cursor() {
  return <span className="inline-block w-2 h-4 bg-sol-green align-middle animate-blink ml-0.5" />;
}

export function Line({
  prompt = "$",
  promptColor = "text-sol-green",
  children,
  className,
}: {
  prompt?: string;
  promptColor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-2 animate-boot", className)}>
      <span className={cn("select-none", promptColor)}>{prompt}</span>
      <span className="flex-1">{children}</span>
    </div>
  );
}
