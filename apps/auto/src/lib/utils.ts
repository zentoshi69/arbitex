import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtUsd(n: number, digits = 2) {
  if (!Number.isFinite(n)) return "$0.00";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(digits)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(digits)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(digits)}K`;
  return `$${n.toFixed(digits)}`;
}

export function fmtNum(n: number, digits = 0) {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(digits || 2)}B`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(digits || 2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(digits || 1)}K`;
  return n.toFixed(digits);
}

export function shortAddr(addr: string, len = 4) {
  if (!addr) return "";
  if (addr.length <= len * 2 + 3) return addr;
  return `${addr.slice(0, len)}…${addr.slice(-len)}`;
}
