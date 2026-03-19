"use client";

import { cn } from "@/lib/utils";

type PanelProps = {
  children: React.ReactNode;
  className?: string;
};

export function Panel({ children, className }: PanelProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[2px] border border-[var(--border)] bg-[var(--bg2)]",
        className
      )}
    >
      <div
        className="absolute left-0 right-0 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, #E84142 0%, transparent 45%)",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

type PanelHeaderProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function PanelHeader({
  icon,
  title,
  description,
  action,
}: PanelHeaderProps) {
  return (
    <div className="flex items-start justify-between border-b border-[var(--border)] px-4 py-3">
      <div className="flex items-start gap-2">
        {icon && (
          <span className="mt-0.5 text-[var(--red)] [&>svg]:h-3.5 [&>svg]:w-3.5">
            {icon}
          </span>
        )}
        <div>
          <h3 className="font-styrene text-[28px] font-black leading-none tracking-[-0.03em] text-[var(--offwhite)]">
            {title}
          </h3>
          {description && (
            <p className="mt-1 text-[10px] text-[var(--grey2)]">{description}</p>
          )}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
