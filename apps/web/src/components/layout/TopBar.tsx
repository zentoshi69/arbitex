"use client";

import { useSystemHealth } from "@/hooks/useSystemHealth";
import { useGasPrice } from "@/hooks/useGasPrice";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { WalletPanel } from "@/components/wallet/WalletPanel";
import { SnakeGame } from "./SnakeGame";

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
  const { health } = useSystemHealth();
  const { gasPriceGwei } = useGasPrice();
  const utcTime = useUtcTime();

  const statusDisplay =
    health?.status === "healthy"
      ? "ONLINE"
      : health?.status === "degraded"
        ? "DEGRADED"
        : health?.status === "down"
          ? "ERROR"
          : "CONNECTING";

  const statusColor =
    statusDisplay === "CONNECTING" ? "text-[var(--red)]" : "text-[var(--offwhite)]";

  return (
    <header className="relative flex h-[44px] flex-shrink-0 items-stretch border-b border-[var(--border)] bg-[var(--black)]">
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-px"
        style={{ background: "linear-gradient(90deg, var(--red) 0%, transparent 60%)" }}
      />

      {/* Snake game fills the available space */}
      <div className="flex-1 overflow-hidden">
        <SnakeGame />
      </div>

      <div className="flex h-full items-stretch">
        <div className="flex min-w-[94px] flex-col justify-center border-l border-[var(--border)] px-3">
          <div className="font-mono text-[7px] uppercase tracking-[0.1em] text-[var(--grey2)]">
            Status
          </div>
          <div className={cn("font-mono text-[11px]", statusColor)}>
            {statusDisplay}
          </div>
        </div>

        <div className="flex min-w-[84px] flex-col justify-center border-l border-[var(--border)] px-3">
          <div className="font-mono text-[7px] uppercase tracking-[0.1em] text-[var(--grey2)]">
            Gas (Gwei)
          </div>
          <div className="font-mono text-[11px] text-[var(--offwhite)]">
            {gasPriceGwei != null ? `${gasPriceGwei.toFixed(1)} nAVAX` : "— nAVAX"}
          </div>
        </div>

        <div className="flex min-w-[176px] flex-col justify-center border-l border-[var(--border)] px-3">
          <div className="font-mono text-[7px] uppercase tracking-[0.1em] text-[var(--grey2)]">
            UTC
          </div>
          <div className="font-mono text-[11px] text-[var(--offwhite)]">
            {utcTime || "—"}
          </div>
        </div>

        <WalletPanel />
      </div>
    </header>
  );
}
