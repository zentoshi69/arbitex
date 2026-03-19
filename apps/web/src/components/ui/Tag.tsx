"use client";

import { cn } from "@/lib/utils";

type TagVariant = "gray" | "red";

type TagProps = {
  variant?: TagVariant;
  children: React.ReactNode;
  className?: string;
};

export function Tag({ variant = "gray", children, className }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[2px] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em]",
        variant === "gray" &&
          "border border-[var(--border)] bg-[rgba(255,255,255,0.03)] text-[var(--grey2)]",
        variant === "red" &&
          "border border-[rgba(232,65,66,0.24)] bg-[rgba(232,65,66,0.08)] text-[var(--red)]",
        className
      )}
    >
      {children}
    </span>
  );
}
