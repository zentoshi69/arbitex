import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function SectionHeader({
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10", className)}>
      <div className="max-w-2xl">
        {eyebrow && (
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-sol-green mb-3">
            <span className="text-sol-purple">▸</span> {eyebrow}
          </div>
        )}
        <h2 className="font-display text-3xl md:text-4xl tracking-tight text-white">{title}</h2>
        {description && (
          <p className="mt-3 text-terminal-dim leading-relaxed font-mono text-sm max-w-xl">{description}</p>
        )}
      </div>
      {children && <div className="flex items-end gap-3">{children}</div>}
    </div>
  );
}
