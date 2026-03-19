"use client";

import { cn } from "@/lib/utils";

type VenueOption = {
  id: string | number;
  name: string;
  protocol?: string;
};

type VenueSelectProps = {
  label: string;
  value: string;
  options: VenueOption[];
  onChange: (value: string) => void;
  chainLabel?: string;
  className?: string;
};

export function VenueSelect({
  label,
  value,
  options,
  onChange,
  chainLabel = "Avalanche",
  className,
}: VenueSelectProps) {
  const selected = options.find((o) => String(o.id) === value);
  const displayValue = selected
    ? `${selected.name} (${selected.protocol ?? "—"})`
    : "Select…";

  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[9.5px] font-medium uppercase tracking-[0.1em] text-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "flex w-full items-center justify-between rounded-[2px] border border-border-hi bg-bg px-2.5 py-2 text-[12px] text-dim",
          "hover:border-muted focus:border-red focus:outline-none focus:ring-0",
          "transition-colors duration-[0.12s]"
        )}
      >
        <option value="">Select…</option>
        {options.map((opt) => (
          <option key={opt.id} value={String(opt.id)}>
            {opt.name} ({opt.protocol ?? "—"})
          </option>
        ))}
      </select>
      {chainLabel && (
        <span className="mt-2 block text-[9.5px] text-muted">
          {chainLabel}
        </span>
      )}
    </label>
  );
}
