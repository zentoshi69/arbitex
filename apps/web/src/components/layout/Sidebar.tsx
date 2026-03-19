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
  Shield,
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

  const statusColor =
    health?.status === "healthy"
      ? "text-[#4ADE80]"
      : "text-red";

  return (
    <aside className="ax-sidebar flex w-[216px] min-h-screen flex-shrink-0 flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2.5 border-b border-border px-[18px] py-[18px] pb-[14px]">
        <div
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center"
          style={{
            background: "#E84142",
            clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
          }}
        >
          <Shield className="h-3 w-3 text-white" />
        </div>
        <span className="text-base font-bold tracking-[-0.03em] text-white">
          ArbitEx
        </span>
        <span className="ml-auto font-mono text-[8.5px] text-muted">v1.0</span>
      </div>

      {/* Connection status */}
      <div className="flex items-center gap-2 border-b border-border px-[18px] py-[9px]">
        <span
          className={cn(
            "h-[5px] w-[5px] rounded-full",
            health?.status === "healthy" ? "bg-[#4ADE80]" : "bg-red ax-throb"
          )}
          style={{
            boxShadow:
              health?.status === "healthy"
                ? "0 0 6px rgba(74,222,128,0.7)"
                : "0 0 6px #E84142",
          }}
        />
        <span
          className={cn(
            "text-[9px] font-medium uppercase tracking-[0.1em]",
            statusColor
          )}
        >
          {statusText}
        </span>
      </div>

      {/* Kill switch warning */}
      {anyActive && (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-[2px] border border-red/25 bg-red/8 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-red-400" />
          <span className="text-xs font-medium text-red-400">Kill switch active</span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <div className="flex items-center gap-2 px-2.5 pb-1.5 pt-3">
          <span className="text-[8.5px] font-medium uppercase tracking-[0.14em] text-muted">
            Platform
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {role === "ADMIN" && (
          <Link
            href="/pools/create"
            className={cn(
              "relative flex items-center gap-2.5 rounded-[2px] px-2.5 py-[7px] text-[12.5px] transition-colors duration-[0.12s] mb-0.5",
              pathname.startsWith("/pools/create")
                ? "bg-red-dim font-medium text-white"
                : "text-dim hover:bg-bg-hover hover:text-white"
            )}
          >
            {pathname.startsWith("/pools/create") && (
              <span
                className="absolute left-0 top-1/2 h-[14px] w-0.5 -translate-y-1/2 rounded-r"
                style={{ background: "#E84142" }}
              />
            )}
            <Droplets className="h-4 w-4 flex-shrink-0" />
            Create Pool
            <span className="ml-auto font-mono text-[8px] text-muted">ADMIN</span>
          </Link>
        )}

        {role === "SUPER_ADMIN" && (
          <Link
            href="/lp/v2"
            className={cn(
              "relative flex items-center gap-2.5 rounded-[2px] px-2.5 py-[7px] text-[12.5px] transition-colors duration-[0.12s] mb-0.5",
              pathname.startsWith("/lp/v2")
                ? "bg-red-dim font-medium text-white"
                : "text-dim hover:bg-bg-hover hover:text-white"
            )}
          >
            {pathname.startsWith("/lp/v2") && (
              <span
                className="absolute left-0 top-1/2 h-[14px] w-0.5 -translate-y-1/2 rounded-r"
                style={{ background: "#E84142" }}
              />
            )}
            <Droplets className="h-4 w-4 flex-shrink-0" />
            V2 LP Admin
            <span className="ml-auto font-mono text-[8px] text-muted">SUPER</span>
          </Link>
        )}

        {NAV_ITEMS.slice(0, 7).map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex items-center gap-2.5 rounded-[2px] px-2.5 py-[7px] text-[12.5px] transition-colors duration-[0.12s]",
                active
                  ? "bg-red-dim font-medium text-white"
                  : "text-dim hover:bg-bg-hover hover:text-white"
              )}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 h-[14px] w-0.5 -translate-y-1/2 rounded-r"
                  style={{ background: "#E84142" }}
                />
              )}
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
              {href === "/risk" && anyActive && (
                <span className="ml-auto h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
              )}
            </Link>
          );
        })}

        <div className="flex items-center gap-2 px-2.5 pb-1.5 pt-4">
          <span className="text-[8.5px] font-medium uppercase tracking-[0.14em] text-muted">
            System
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {NAV_ITEMS.slice(7).map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex items-center gap-2.5 rounded-[2px] px-2.5 py-[7px] text-[12.5px] transition-colors duration-[0.12s]",
                active
                  ? "bg-red-dim font-medium text-white"
                  : "text-dim hover:bg-bg-hover hover:text-white"
              )}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 h-[14px] w-0.5 -translate-y-1/2 rounded-r"
                  style={{ background: "#E84142" }}
                />
              )}
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
              {href === "/settings" && (
                <span className="ml-auto font-mono text-[8px] text-muted tracking-wider">
                  ⌘,
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-[18px] py-3">
        <p className="text-[8.5px] font-medium uppercase tracking-[0.12em] text-muted">
          Operator
        </p>
        <div className="mt-1 flex items-center gap-1 font-mono text-[9.5px] text-dim">
          <span
            className="h-1 w-1 rounded-full"
            style={{ background: "#E84142" }}
          />
          {role}
        </div>
      </div>
    </aside>
  );
}
