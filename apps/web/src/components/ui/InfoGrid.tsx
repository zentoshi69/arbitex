"use client";

import { cn } from "@/lib/utils";

type InfoGridItem = [label: string, value: string | React.ReactNode];

type InfoGridProps = {
  items: InfoGridItem[];
  className?: string;
};

export function InfoGrid({ items, className }: InfoGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px bg-[var(--border)]",
        className
      )}
    >
      {items.map(([label, value], i) => (
        <div
          key={i}
          className="bg-[var(--bg2)] px-4 py-3"
        >
          <p className="mb-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--grey2)]">
            {label}
          </p>
          <div className="font-mono text-[11.5px] font-medium text-[var(--offwhite)]">
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}
