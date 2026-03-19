"use client";

import { cn } from "@/lib/utils";

type AlertVariant = "amber" | "red";

type AlertProps = {
  variant?: AlertVariant;
  icon?: React.ReactNode;
  title?: string;
  children: React.ReactNode;
  className?: string;
};

export function Alert({
  variant = "amber",
  icon,
  title,
  children,
  className,
}: AlertProps) {
  return (
    <div
      className={cn(
        "relative flex gap-3 rounded-[2px] px-4 py-3",
        variant === "amber" && [
          "border border-[var(--border)] bg-[rgba(255,255,255,0.03)]",
          "before:absolute before:bottom-0 before:left-0 before:top-0 before:w-0.5 before:bg-[#FCD34D] before:content-['']",
        ],
        variant === "red" && [
          "border border-[rgba(232,65,66,0.24)] bg-[rgba(232,65,66,0.08)]",
          "before:absolute before:bottom-0 before:left-0 before:top-0 before:w-0.5 before:bg-[var(--red)] before:content-['']",
        ],
        className
      )}
    >
      {icon && (
        <span
          className={cn(
            "flex-shrink-0",
              variant === "amber" && "text-[#FCD34D]",
              variant === "red" && "text-[var(--red)]"
          )}
        >
          {icon}
        </span>
      )}
      <div>
        {title && (
          <p
            className={cn(
              "mb-1.5 text-[11.5px] font-semibold tracking-[0.01em]",
              variant === "amber" && "text-[#FCD34D]",
              variant === "red" && "text-[var(--red)]"
            )}
          >
            {title}
          </p>
        )}
        <div className="text-[10.5px] leading-[1.65] text-[var(--grey1)] [&_code]:rounded-[2px] [&_code]:bg-white/6 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[10px] [&_code]:text-[var(--offwhite)]">
          {children}
        </div>
      </div>
    </div>
  );
}
