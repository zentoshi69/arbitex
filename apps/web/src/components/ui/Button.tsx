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
        "inline-flex items-center justify-center gap-2 rounded-[2px] font-sans text-[11px] font-medium tracking-[0.02em] transition-[background-color,border-color,color] duration-[0.12s]",
        variant === "primary" &&
          "bg-red text-white px-3 py-1.5 hover:bg-[#c93334] border-0",
        variant === "ghost" &&
          "bg-transparent text-dim border border-border-hi px-3 py-1.5 hover:text-white hover:border-muted",
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
