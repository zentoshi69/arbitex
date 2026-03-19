"use client";

import { useSystemHealth } from "@/hooks/useSystemHealth";
import { useGasPrice } from "@/hooks/useGasPrice";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getRole } from "@/lib/auth";
import { useWallet } from "@/components/wallet/WalletProvider";
import { ProfileMenu } from "@/components/profile/ProfileMenu";
import { useState, useEffect } from "react";

const BREADCRUMB_MAP: Record<string, string> = {
  "": "Overview",
  opportunities: "Opportunities",
  executions: "Executions",
  tokens: "Tokens",
  pools: "Pools",
  lp: "Liquidity",
  risk: "Risk Controls",
  settings: "Settings",
  audit: "Audit Log",
  health: "System Health",
};

function useUtcTime() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now
          .toISOString()
          .replace("T", " ")
          .slice(0, 19)
          .replace(/-/g, "/")
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export function TopBar() {
  const pathname = usePathname();
  const role = getRole();
  const { health } = useSystemHealth();
  const { gasPriceGwei } = useGasPrice();
  const wallet = useWallet();
  const utcTime = useUtcTime();

  const segment = pathname.replace(/^\//, "") || "";
  const pageName = BREADCRUMB_MAP[segment.split("/")[0]] ?? (segment || "Overview");

  const statusDisplay =
    health?.status === "healthy"
      ? "CONNECTED"
      : health?.status === "degraded"
        ? "DEGRADED"
        : health?.status === "down"
          ? "ERROR"
          : "CONNECTING";

  const statusColor =
    health?.status === "healthy"
      ? "text-[#4ADE80]"
      : statusDisplay === "CONNECTING" || statusDisplay === "ERROR"
        ? "text-red"
        : "text-amber-400";

  return (
    <header className="ax-topbar flex h-11 flex-shrink-0 items-center px-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[9.5px] uppercase tracking-[0.1em] text-muted">
        <span>ArbitEx</span>
        <span className="text-border-hi">/</span>
        <span className="font-medium text-white">{pageName}</span>
      </div>

      {/* Right: metrics + wallet + role */}
      <div className="ml-auto flex items-stretch">
        {/* Status */}
        <div className="flex flex-col justify-center border-l border-border px-3">
          <div className="text-[7.5px] uppercase tracking-[0.1em] text-muted">
            Status
          </div>
          <div className={cn("font-mono text-[10.5px] font-medium", statusColor)}>
            {statusDisplay}
          </div>
        </div>

        {/* Gas */}
        <div className="flex flex-col justify-center border-l border-border px-3">
          <div className="text-[7.5px] uppercase tracking-[0.1em] text-muted">
            Gas (Gwei)
          </div>
          <div className="font-mono text-[10.5px] font-medium text-white">
            {gasPriceGwei != null ? gasPriceGwei.toFixed(1) : "—"}
          </div>
        </div>

        {/* Block # — no API, show placeholder */}
        <div className="flex flex-col justify-center border-l border-border px-3">
          <div className="text-[7.5px] uppercase tracking-[0.1em] text-muted">
            Block #
          </div>
          <div className="font-mono text-[10.5px] font-medium text-white">—</div>
        </div>

        {/* UTC Time */}
        <div className="flex flex-col justify-center border-l border-border px-3">
          <div className="text-[7.5px] uppercase tracking-[0.1em] text-muted">
            UTC Time
          </div>
          <div className="font-mono text-[10.5px] font-medium text-white">
            {utcTime || "—"}
          </div>
        </div>

        {/* Wallet + Profile */}
        <div className="flex items-center gap-3 border-l border-border pl-3">
          {wallet.available ? (
            wallet.connected ? (
              <button
                onClick={() => wallet.switchToAvalanche().catch(() => {})}
                className={cn(
                  "rounded-[2px] border px-2 py-0.5 font-mono text-[10px] tracking-wider",
                  wallet.chainId === 43114
                    ? "border-emerald-700/60 text-emerald-300"
                    : "border-amber-700/60 text-amber-300"
                )}
                title="Switch wallet to Avalanche C-Chain"
              >
                {wallet.address?.slice(0, 6)}…{wallet.address?.slice(-4)}
              </button>
            ) : (
              <button
                onClick={() => wallet.connect().catch(() => {})}
                className="rounded-[2px] border border-border-hi px-2 py-0.5 text-[10px] tracking-wider text-dim transition-colors duration-[0.12s] hover:text-white"
              >
                Connect
              </button>
            )
          ) : (
            <span className="text-[10px] text-muted">No wallet</span>
          )}

          <ProfileMenu />

          {/* Role chip */}
          <div className="flex items-center gap-2 rounded-[2px] border border-border-hi px-2 py-0.5">
            <span
              className="h-[5px] w-[5px] rounded-full bg-red"
              style={{ boxShadow: "0 0 8px #E84142" }}
            />
            <span className="text-[9.5px] font-medium uppercase tracking-[0.1em] text-dim">
              {role}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
