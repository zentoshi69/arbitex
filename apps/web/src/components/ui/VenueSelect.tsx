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
      <span className="mb-1.5 block font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--grey2)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "flex w-full items-center justify-between rounded-[2px] border border-[var(--border2)] bg-[var(--black)] px-3 py-2.5 text-[12px] text-[var(--offwhite)]",
          "hover:border-[var(--grey2)] focus:border-[var(--red)] focus:outline-none focus:ring-0",
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
        <span className="mt-2 block text-[9.5px] text-[var(--grey2)]">
          {chainLabel}
        </span>
      )}
    </label>
  );
}
