import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Safely format a numeric value, returning fallback for null/undefined/NaN */
export function fmt(v: unknown, digits = 2, fallback = "—"): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : fallback;
}

/** fmt prefixed with $ */
export function fmtUsd(v: unknown, digits = 2, fallback = "—"): string {
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(digits)}` : fallback;
}

/** Safe number coercion */
export function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
