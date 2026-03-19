"use client";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "relative mb-5 flex items-start justify-between border-b border-border pb-4",
        "after:absolute after:bottom-[-1px] after:left-0 after:h-px after:w-[52px] after:bg-red after:content-['']",
        className
      )}
    >
      <div>
        <h1 className="font-styrene text-[38px] font-black leading-none tracking-[-0.03em] text-[var(--offwhite)]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-[10.5px] tracking-[0.01em] text-[var(--grey2)]">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
