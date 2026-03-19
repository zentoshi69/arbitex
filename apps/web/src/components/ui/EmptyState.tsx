"use client";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  message: string;
  hint?: React.ReactNode;
  className?: string;
};

export function EmptyState({ message, hint, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 py-9 px-4 text-center",
        className
      )}
    >
      <div className="relative h-7 w-7 opacity-[0.18]">
        <span className="absolute left-1/2 top-0 block h-full w-px -translate-x-1/2 bg-white" />
        <span className="absolute left-0 top-1/2 block h-px w-full -translate-y-1/2 bg-white" />
      </div>
      <p className="text-[11.5px] text-muted">{message}</p>
      {hint && (
        <p className="text-[9.5px] text-muted/60 [&_code]:rounded [&_code]:bg-white/6 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[9.5px]">
          {hint}
        </p>
      )}
    </div>
  );
}
