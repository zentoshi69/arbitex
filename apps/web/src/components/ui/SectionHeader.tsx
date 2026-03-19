"use client";

import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  /** New design: small label with hairline */
  label?: string;
  tag?: React.ReactNode;
  /** Legacy: page title (renders PageHeader layout) */
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export function SectionHeader({
  label,
  tag,
  title,
  description,
  action,
  className,
}: SectionHeaderProps) {
  if (title != null) {
    return (
      <div
        className={cn(
          "relative mb-6 flex items-start justify-between border-b border-border pb-4",
          "after:absolute after:bottom-[-1px] after:left-0 after:h-px after:w-[52px] after:bg-red after:content-['']",
          className
        )}
      >
        <div>
          <h1 className="text-[20px] font-bold tracking-[-0.03em] text-white">
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 text-[10.5px] tracking-[0.01em] text-dim">
              {description}
            </p>
          )}
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
    );
  }

  return (
    <div className={cn("mb-2.5 flex items-center gap-2", className)}>
      <span className="text-[8.5px] font-medium uppercase tracking-[0.13em] text-muted">
        {label}
      </span>
      <span className="h-px flex-1 bg-border" />
      {tag && <span>{tag}</span>}
    </div>
  );
}
