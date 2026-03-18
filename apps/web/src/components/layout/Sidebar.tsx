"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Zap,
  PlayCircle,
  Coins,
  Droplets,
  ShieldAlert,
  Settings,
  FileText,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useKillSwitchStatus } from "@/hooks/useKillSwitchStatus";
import { getRole } from "@/lib/auth";
import { useSystemHealth } from "@/hooks/useSystemHealth";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/opportunities", label: "Opportunities", icon: Zap },
  { href: "/executions", label: "Executions", icon: PlayCircle },
  { href: "/tokens", label: "Tokens", icon: Coins },
  { href: "/pools", label: "Pools", icon: Droplets },
  { href: "/lp", label: "Liquidity", icon: Droplets },
  { href: "/risk", label: "Risk Controls", icon: ShieldAlert },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/audit", label: "Audit Log", icon: FileText },
  { href: "/health", label: "System Health", icon: Activity },
];

export function Sidebar() {
  const pathname = usePathname();
  const { anyActive } = useKillSwitchStatus();
  const role = getRole();
  const { health } = useSystemHealth();

  const statusText =
    health?.status === "healthy"
      ? "Connected"
      : health?.status === "degraded"
        ? "Degraded"
        : health?.status === "down"
          ? "Down"
          : "Connecting";

  const statusClass =
    health?.status === "healthy"
      ? "text-emerald-300"
      : health?.status === "degraded"
        ? "text-amber-300"
        : "text-[var(--ax-red)]";

  return (
    <aside className="ax-sidebar flex flex-col w-[216px] min-h-screen flex-shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 pb-4 border-b border-[var(--ax-border)] flex items-center gap-2.5">
        <div
          className="w-[30px] h-[30px] flex items-center justify-center flex-shrink-0"
          style={{
            background: "var(--ax-red)",
            clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
          }}
        >
          <Zap className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-[17px] font-bold tracking-tight text-[var(--ax-white)]">ArbitEx</span>
        <span className="ml-auto text-[9px] text-[var(--ax-muted)] font-mono tracking-wider">v1.0</span>
      </div>

      {/* Status */}
      <div className="px-5 py-2.5 border-b border-[var(--ax-border)] flex items-center gap-2">
        <span
          className="w-[5px] h-[5px] rounded-full"
          style={{
            background: health?.status === "healthy" ? "#4ADE80" : "var(--ax-red)",
            boxShadow: `0 0 8px ${health?.status === "healthy" ? "rgba(74,222,128,0.7)" : "rgba(232,65,66,0.8)"}`,
          }}
        />
        <span className={cn("text-[9.5px] font-medium tracking-[0.14em] uppercase", statusClass)}>
          {statusText}
        </span>
      </div>

      {/* Kill switch warning */}
      {anyActive && (
        <div className="mx-3 mt-3 flex items-center gap-2 px-3 py-2 rounded bg-[rgba(232,65,66,0.08)] border border-[rgba(232,65,66,0.25)]">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          <span className="text-xs text-red-400 font-medium">Kill switch active</span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-2 overflow-y-auto">
        <div className="px-2 pt-3 pb-1 text-[8.5px] font-medium tracking-[0.14em] uppercase text-[var(--ax-muted)] flex items-center gap-2">
          Platform
          <span className="flex-1 h-px bg-[var(--ax-border)]" />
        </div>

        {role === "ADMIN" && (
          <Link
            href="/pools/create"
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-[3px] text-[12.5px] transition-colors mb-2",
              pathname.startsWith("/pools/create")
                ? "bg-[var(--ax-red-dim)] text-[var(--ax-white)] font-medium"
                : "text-[var(--ax-dim)] hover:text-[var(--ax-white)] hover:bg-[var(--ax-bg-hover)]"
            )}
          >
            <Droplets className="w-4 h-4 flex-shrink-0" />
            Create Pool
            <span className="ml-auto text-[10px] font-mono text-[var(--ax-muted)]">ADMIN</span>
          </Link>
        )}

        {role === "SUPER_ADMIN" && (
          <Link
            href="/lp/v2"
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-[3px] text-[12.5px] transition-colors mb-2",
              pathname.startsWith("/lp/v2")
                ? "bg-[var(--ax-red-dim)] text-[var(--ax-white)] font-medium"
                : "text-[var(--ax-dim)] hover:text-[var(--ax-white)] hover:bg-[var(--ax-bg-hover)]"
            )}
          >
            <Droplets className="w-4 h-4 flex-shrink-0" />
            V2 LP Admin
            <span className="ml-auto text-[10px] font-mono text-[var(--ax-muted)]">SUPER</span>
          </Link>
        )}

        {NAV_ITEMS.slice(0, 7).map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-[3px] text-[12.5px] transition-colors relative",
                active
                  ? "bg-[var(--ax-red-dim)] text-[var(--ax-white)] font-medium"
                  : "text-[var(--ax-dim)] hover:text-[var(--ax-white)] hover:bg-[var(--ax-bg-hover)]"
              )}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-r"
                  style={{ background: "var(--ax-red)" }}
                />
              )}
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
              {href === "/risk" && anyActive && (
                <span className="ml-auto w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
              )}
            </Link>
          );
        })}

        <div className="px-2 pt-4 pb-1 text-[8.5px] font-medium tracking-[0.14em] uppercase text-[var(--ax-muted)] flex items-center gap-2">
          System
          <span className="flex-1 h-px bg-[var(--ax-border)]" />
        </div>

        {NAV_ITEMS.slice(7).map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-[3px] text-[12.5px] transition-colors relative",
                active
                  ? "bg-[var(--ax-red-dim)] text-[var(--ax-white)] font-medium"
                  : "text-[var(--ax-dim)] hover:text-[var(--ax-white)] hover:bg-[var(--ax-bg-hover)]"
              )}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-r"
                  style={{ background: "var(--ax-red)" }}
                />
              )}
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
              {href === "/settings" && (
                <span className="ml-auto text-[8px] font-mono text-[var(--ax-muted)] tracking-wider">⌘,</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-5 py-3 border-t border-[var(--ax-border)]">
        <p className="text-[8.5px] text-[var(--ax-muted)] font-medium tracking-[0.14em] uppercase">Operator</p>
        <div className="mt-1 text-[9.5px] text-[var(--ax-dim)] font-mono flex items-center gap-2">
          <span className="w-1 h-1 rounded-full" style={{ background: "var(--ax-red)" }} />
          {role}
        </div>
      </div>
    </aside>
  );
}
