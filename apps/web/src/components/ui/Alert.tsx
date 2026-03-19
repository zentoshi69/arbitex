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
          "border border-amber-500/20 bg-amber-500/5",
          "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-amber-500 before:content-['']",
        ],
        variant === "red" && [
          "border border-red/25 bg-red/6",
          "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-red before:content-['']",
        ],
        className
      )}
    >
      {icon && (
        <span
          className={cn(
            "flex-shrink-0",
            variant === "amber" && "text-amber-300",
            variant === "red" && "text-[#FF6B6B]"
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
              variant === "amber" && "text-amber-300",
              variant === "red" && "text-[#FF6B6B]"
            )}
          >
            {title}
          </p>
        )}
        <div className="text-[10.5px] leading-[1.65] text-dim [&_code]:rounded-[2px] [&_code]:bg-white/6 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[10px] [&_code]:text-off-white">
          {children}
        </div>
      </div>
    </div>
  );
}
