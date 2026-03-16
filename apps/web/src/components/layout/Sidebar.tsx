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

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/opportunities", label: "Opportunities", icon: Zap },
  { href: "/executions", label: "Executions", icon: PlayCircle },
  { href: "/tokens", label: "Tokens", icon: Coins },
  { href: "/pools", label: "Pools", icon: Droplets },
  { href: "/risk", label: "Risk Controls", icon: ShieldAlert },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/audit", label: "Audit Log", icon: FileText },
  { href: "/health", label: "System Health", icon: Activity },
];

export function Sidebar() {
  const pathname = usePathname();
  const { anyActive } = useKillSwitchStatus();

  return (
    <aside className="flex flex-col w-56 min-h-screen bg-slate-900 border-r border-slate-800 flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-slate-800">
        <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-white text-lg tracking-tight">ArbitEx</span>
        <span className="ml-auto text-[10px] text-slate-500 font-mono">v1.0</span>
      </div>

      {/* Kill switch warning */}
      {anyActive && (
        <div className="mx-3 mt-3 flex items-center gap-2 px-3 py-2 rounded bg-red-950 border border-red-800">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          <span className="text-xs text-red-400 font-medium">Kill switch active</span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-blue-600/20 text-blue-400 font-medium"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
              {href === "/risk" && anyActive && (
                <span className="ml-auto w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-4 py-3 border-t border-slate-800">
        <p className="text-[10px] text-slate-600 font-mono">OPERATOR USE ONLY</p>
      </div>
    </aside>
  );
}
