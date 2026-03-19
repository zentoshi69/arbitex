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
        <h1 className="text-[20px] font-bold tracking-[-0.03em] text-white">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-[10.5px] tracking-[0.01em] text-dim">
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
