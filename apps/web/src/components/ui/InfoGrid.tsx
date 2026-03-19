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
        "grid grid-cols-2 gap-px bg-border",
        className
      )}
    >
      {items.map(([label, value], i) => (
        <div
          key={i}
          className="bg-bg-card px-4 py-3"
        >
          <p className="mb-1.5 text-[8.5px] font-medium uppercase tracking-[0.08em] text-muted">
            {label}
          </p>
          <div className="font-mono text-[11.5px] font-medium text-white">
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}
