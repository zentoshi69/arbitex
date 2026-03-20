"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getRole } from "@/lib/auth";
import { useWallet } from "@/components/wallet/WalletProvider";

const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/executions", label: "Executions" },
  { href: "/pnl", label: "PnL" },
  { href: "/trading-brain", label: "Trading Brain" },
  { href: "/fair-value", label: "Fair Value" },
  { href: "/regime", label: "Market Regime" },
  { href: "/v3-pools", label: "V3 Pools" },
  { href: "/tokens", label: "Tokens" },
  { href: "/pools", label: "Pools" },
  { href: "/lp", label: "Liquidity" },
  { href: "/risk", label: "Risk Controls" },
  { href: "/settings", label: "Settings" },
  { href: "/audit", label: "Audit Log" },
  { href: "/health", label: "System Health", superAdminOnly: true },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const role = getRole();
  const wallet = useWallet();
  const operatorAddress = wallet.address ?? (role ? `ROLE:${role}` : "—");

  return (
    <aside
      className="relative flex w-[216px] min-h-screen flex-shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)]"
      style={{
        boxShadow: "inset -1px 0 0 0 transparent",
      }}
    >
      <div className="absolute left-0 right-0 top-0 h-px bg-[var(--red)]" />
      <div
        className="pointer-events-none absolute bottom-0 right-0 top-0 w-px"
        style={{
          background:
            "linear-gradient(180deg, var(--red) 0%, transparent 35%)",
        }}
      />

      <div className="flex h-[52px] items-center gap-[10px] border-b border-[var(--border)] px-[18px]">
        <div
          className="h-[28px] w-[28px] flex-shrink-0"
          style={{
            background: "var(--red)",
            clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
          }}
        />
        <span className="font-styrene text-lg font-black tracking-tight text-[var(--offwhite)]">
          ArbitEx
        </span>
        <span className="ml-auto font-mono text-[8px] text-[var(--grey3)]">v2.0</span>
      </div>

      <div className="flex h-[34px] items-center gap-2 border-b border-[var(--border)] px-[18px]">
        <span
          className="h-[6px] w-[6px] rounded-full bg-[var(--red)]"
          style={{
            animation: "pulse 1.4s infinite ease-in-out",
            boxShadow: "0 0 10px var(--red-glow)",
          }}
        />
        <span className="font-mono text-[8.5px] uppercase tracking-[0.22em] text-[var(--red)]">
          CONNECTING
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        <div className="flex items-center gap-2 px-[18px] pb-2 pt-3">
          <span className="font-mono text-[7.5px] uppercase tracking-[0.18em] text-[var(--grey3)]">
            Platform
          </span>
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>

        {role === "ADMIN" && (
          <Link
            href="/pools/create"
            className={cn(
              "relative block px-[18px] py-[7px] font-styrene text-[12.5px] font-normal tracking-[-0.01em] transition-colors",
              pathname.startsWith("/pools/create")
                ? "bg-[rgba(232,65,66,0.08)] font-medium text-[var(--offwhite)]"
                : "text-[var(--grey1)] hover:bg-[rgba(255,255,255,0.03)] hover:text-[var(--offwhite)]"
            )}
          >
            {pathname.startsWith("/pools/create") && (
              <span
                className="absolute left-0 top-1/2 h-[16px] w-[2px] -translate-y-1/2 rounded-r-[1px] bg-[var(--red)]"
              />
            )}
            Create Pool
          </Link>
        )}

        {role === "SUPER_ADMIN" && (
          <Link
            href="/lp/v2"
            className={cn(
              "relative block px-[18px] py-[7px] font-styrene text-[12.5px] font-normal tracking-[-0.01em] transition-colors",
              pathname.startsWith("/lp/v2")
                ? "bg-[rgba(232,65,66,0.08)] font-medium text-[var(--offwhite)]"
                : "text-[var(--grey1)] hover:bg-[rgba(255,255,255,0.03)] hover:text-[var(--offwhite)]"
            )}
          >
            {pathname.startsWith("/lp/v2") && (
              <span
                className="absolute left-0 top-1/2 h-[16px] w-[2px] -translate-y-1/2 rounded-r-[1px] bg-[var(--red)]"
              />
            )}
            V2 LP Admin
          </Link>
        )}

        {NAV_ITEMS.slice(0, 11).map(({ href, label }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative block px-[18px] py-[7px] font-styrene text-[12.5px] font-normal tracking-[-0.01em] transition-colors",
                active
                  ? "bg-[rgba(232,65,66,0.08)] font-medium text-[var(--offwhite)]"
                  : "text-[var(--grey1)] hover:bg-[rgba(255,255,255,0.03)] hover:text-[var(--offwhite)]"
              )}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 h-[16px] w-[2px] -translate-y-1/2 rounded-r-[1px] bg-[var(--red)]"
                />
              )}
              {label}
            </Link>
          );
        })}

        <div className="flex items-center gap-2 px-[18px] pb-2 pt-4">
          <span className="font-mono text-[7.5px] uppercase tracking-[0.18em] text-[var(--grey3)]">
            System
          </span>
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>

        {NAV_ITEMS.slice(11)
          .filter((item) => !("superAdminOnly" in item && item.superAdminOnly) || role === "SUPER_ADMIN")
          .map(({ href, label }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          const showSettingsKbd = href === "/settings";
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative block px-[18px] py-[7px] font-styrene text-[12.5px] font-normal tracking-[-0.01em] transition-colors",
                active
                  ? "bg-[rgba(232,65,66,0.08)] font-medium text-[var(--offwhite)]"
                  : "text-[var(--grey1)] hover:bg-[rgba(255,255,255,0.03)] hover:text-[var(--offwhite)]"
              )}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 h-[16px] w-[2px] -translate-y-1/2 rounded-r-[1px] bg-[var(--red)]"
                />
              )}
              {label}
              {showSettingsKbd && (
                <span className="ml-auto font-mono text-[8px] tracking-[0.08em] text-[var(--grey3)]">
                  ⌘,
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--border)] px-[18px] py-3">
        <p className="font-mono text-[7.5px] uppercase tracking-[0.18em] text-[var(--grey2)]">
          Operator
        </p>
        <div className="mt-1 flex items-center gap-[6px] font-mono text-[9.5px] text-[var(--grey1)]">
          <span className="h-1 w-1 rounded-full bg-[var(--red)]" />
          <span className="truncate">{operatorAddress}</span>
        </div>
      </div>
    </aside>
  );
}
