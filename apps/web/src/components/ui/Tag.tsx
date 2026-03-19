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
        "inline-flex items-center px-1.5 py-0.5 rounded-[2px] text-[8.5px] font-medium tracking-[0.07em] uppercase",
        variant === "gray" &&
          "bg-white/5 text-muted border border-border",
        variant === "red" &&
          "bg-red-dim text-red border border-red/20",
        className
      )}
    >
      {children}
    </span>
  );
}
