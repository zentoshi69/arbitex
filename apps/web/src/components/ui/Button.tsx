"use client";

import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: React.ReactNode;
  children: React.ReactNode;
};

export function Button({
  variant = "ghost",
  icon,
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-[2px] font-styrene text-[11px] uppercase tracking-[0.08em] transition-[background-color,border-color,color] duration-[0.12s]",
        variant === "primary" &&
          "border-0 bg-[var(--red)] px-4 text-white hover:opacity-90",
        variant === "ghost" &&
          "border border-[var(--border2)] bg-transparent px-4 text-[var(--grey1)] hover:border-[var(--grey2)] hover:text-[var(--offwhite)]",
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
