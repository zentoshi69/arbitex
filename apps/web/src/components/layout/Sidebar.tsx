"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { getRole } from "@/lib/auth";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { useTokenContext } from "@/contexts/TokenContext";
import { api } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/trading", label: "Trading" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/executions", label: "Executions" },
  { href: "/pnl", label: "PnL" },
  { href: "/trading-brain", label: "Trading Brain" },
  { href: "/fair-value", label: "Fair Value" },
  { href: "/regime", label: "Market Regime" },
  { href: "/v3-pools", label: "V3 Pools" },
  { href: "/tokens", label: "Tokens" },
  { href: "/pools", label: "Pools" },
  { href: "/risk", label: "Risk Controls" },
  { href: "/settings", label: "Settings" },
  { href: "/audit", label: "Audit Log" },
  { href: "/health", label: "System Health", superAdminOnly: true },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const role = getRole();
  const wallet = useWallet();
  const { health } = useSystemHealth();
  const { activeTokenId, setActiveTokenId, trackedTokens, isAll } = useTokenContext();
  const operatorAddress = wallet.address ?? (role ? `ROLE:${role}` : "—");

  const { data: tradingStatus } = useQuery({
    queryKey: ["trading", "status"],
    queryFn: () => api.trading.status(),
    refetchInterval: 10_000,
    retry: false,
  });

  const isConnected = health?.status === "healthy" || health?.status === "degraded";
  const statusColor = isConnected ? "#4DD68C" : "var(--red)";
  const statusLabel = isConnected ? "CONNECTED" : "CONNECTING";

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

      <div className="flex h-[64px] items-center gap-[10px] border-b border-[var(--border)] px-[18px]">
        <img src="/logo.png" alt="arbitex" className="h-[42px] w-auto flex-shrink-0" />
        <span className="ml-auto font-mono text-[8px] text-[var(--grey3)]">v2.0</span>
      </div>

      <div className="flex h-[28px] items-center gap-2 border-b border-[var(--border)] px-[18px]">
        <span
          className="h-[6px] w-[6px] rounded-full"
          style={{
            backgroundColor: statusColor,
            animation: isConnected ? "none" : "pulse 1.4s infinite ease-in-out",
            boxShadow: isConnected ? `0 0 8px ${statusColor}` : "0 0 10px var(--red-glow)",
          }}
        />
        <span
          className="font-mono text-[8.5px] uppercase tracking-[0.22em]"
          style={{ color: statusColor }}
        >
          {statusLabel}
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {/* ── Token Universe ─────────────────────────────────── */}
        <div className="flex items-center gap-2 px-[18px] pb-1 pt-3">
          <span className="font-mono text-[7.5px] uppercase tracking-[0.18em] text-[var(--grey3)]">
            Token Universe
          </span>
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>

        <button
          onClick={() => setActiveTokenId("ALL")}
          className={cn(
            "relative flex w-full items-center gap-2 px-[18px] py-[5px] text-left font-styrene text-[12px] transition-colors",
            isAll
              ? "bg-[rgba(232,65,66,0.08)] font-medium text-[var(--offwhite)]"
              : "text-[var(--grey1)] hover:bg-[rgba(255,255,255,0.03)] hover:text-[var(--offwhite)]"
          )}
        >
          {isAll && (
            <span className="absolute left-0 top-1/2 h-[14px] w-[2px] -translate-y-1/2 rounded-r-[1px] bg-[var(--red)]" />
          )}
          <span className="h-[7px] w-[7px] rounded-full bg-[var(--grey2)]" />
          ALL
        </button>

        {trackedTokens.map((token) => {
          const active = activeTokenId === token.id;
          const color = token.accentColor ? `#${token.accentColor}` : "var(--grey1)";
          return (
            <button
              key={token.id}
              onClick={() => setActiveTokenId(token.id)}
              className={cn(
                "relative flex w-full items-center gap-2 px-[18px] py-[5px] text-left font-styrene text-[12px] transition-colors",
                active
                  ? "bg-[rgba(255,255,255,0.05)] font-medium text-[var(--offwhite)]"
                  : "text-[var(--grey1)] hover:bg-[rgba(255,255,255,0.03)] hover:text-[var(--offwhite)]"
              )}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 h-[14px] w-[2px] -translate-y-1/2 rounded-r-[1px]"
                  style={{ backgroundColor: color }}
                />
              )}
              <span
                className="h-[7px] w-[7px] rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="flex-1 truncate">{token.symbol}</span>
              <span className="font-mono text-[8px] text-[var(--grey3)]">
                {token.poolCount}p
              </span>
            </button>
          );
        })}

        {/* ── Platform ───────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-[18px] pb-2 pt-3">
          <span className="font-mono text-[7.5px] uppercase tracking-[0.18em] text-[var(--grey3)]">
            Platform
          </span>
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>

        {NAV_ITEMS.slice(0, 11).map(({ href, label }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          const isTrading = href === "/trading";
          const tradingActive = tradingStatus?.tradingEnabled && !tradingStatus?.mockExecution;
          const tradingMock = tradingStatus?.tradingEnabled && tradingStatus?.mockExecution;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex items-center gap-2 px-[18px] py-[7px] font-styrene text-[12.5px] font-normal tracking-[-0.01em] transition-colors",
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
              {isTrading && (
                <span
                  className={cn(
                    "ml-auto h-[6px] w-[6px] rounded-full flex-shrink-0",
                    tradingActive ? "bg-emerald-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]"
                      : tradingMock ? "bg-amber-400 animate-pulse"
                      : "bg-red-400/50"
                  )}
                />
              )}
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
