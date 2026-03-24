"use client";

import { useSystemHealth } from "@/hooks/useSystemHealth";
import { useGasPrice } from "@/hooks/useGasPrice";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { WalletPanel } from "@/components/wallet/WalletPanel";
import { SnakeGame } from "./SnakeGame";
import { api } from "@/lib/api";

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

function useUptime(running: boolean) {
  const [started] = useState(() => Date.now());
  const [display, setDisplay] = useState("");
  useEffect(() => {
    if (!running) { setDisplay(""); return; }
    const tick = () => {
      const diff = Math.floor((Date.now() - started) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      setDisplay(h > 0 ? `${h}h ${m}m uptime` : `${m}m uptime`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [running, started]);
  return display;
}

function TradingButton() {
  const qc = useQueryClient();
  const { data: status } = useQuery({
    queryKey: ["trading", "status"],
    queryFn: () => api.trading.status(),
    refetchInterval: 5_000,
    retry: false,
  });

  const isRunning = status?.tradingEnabled === true;
  const uptime = useUptime(isRunning);

  const toggle = useMutation({
    mutationFn: () =>
      api.risk.setKillSwitch("GLOBAL", !isRunning, isRunning ? "Stopped from UI" : "Started from UI"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trading", "status"] });
      qc.invalidateQueries({ queryKey: ["risk"] });
    },
  });

  return (
    <button
      onClick={() => toggle.mutate()}
      disabled={toggle.isPending}
      className={cn(
        "flex flex-col items-center justify-center border-l border-[var(--border)] px-4 transition-colors",
        isRunning
          ? "bg-[rgba(232,65,66,0.08)] hover:bg-[rgba(232,65,66,0.14)]"
          : "bg-[rgba(77,214,140,0.06)] hover:bg-[rgba(77,214,140,0.12)]"
      )}
    >
      <span
        className="font-mono text-[10px] uppercase tracking-[0.08em]"
        style={{ color: isRunning ? "#E84142" : "#4DD68C" }}
      >
        {toggle.isPending ? "…" : isRunning ? "■ STOP TRADING" : "▶ START TRADING"}
      </span>
      {isRunning && uptime && (
        <span className="font-mono text-[7.5px] text-[var(--grey2)]">{uptime}</span>
      )}
    </button>
  );
}

export function TopBar() {
  const { health } = useSystemHealth();
  const { gasPriceGwei } = useGasPrice();
  const utcTime = useUtcTime();

  const statusDisplay =
    health?.status === "healthy"
      ? "ONLINE"
      : health?.status === "degraded"
        ? "ONLINE"
        : health?.status === "down"
          ? "ERROR"
          : "CONNECTING";

  const statusColor =
    statusDisplay === "ONLINE"
      ? "#4DD68C"
      : statusDisplay === "CONNECTING"
        ? "#F59E0B"
        : "#E84142";

  return (
    <header className="relative flex h-[44px] flex-shrink-0 items-stretch border-b border-[var(--border)] bg-[var(--black)]">
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-px"
        style={{ background: "linear-gradient(90deg, var(--red) 0%, transparent 60%)" }}
      />

      <div className="flex-1 overflow-hidden">
        <SnakeGame />
      </div>

      <div className="flex h-full items-stretch">
        <div className="flex min-w-[94px] flex-col justify-center border-l border-[var(--border)] px-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--grey1)]">
            Status
          </div>
          <div className="font-mono text-[11px]" style={{ color: statusColor }}>
            {statusDisplay}
          </div>
        </div>

        <div className="flex min-w-[84px] flex-col justify-center border-l border-[var(--border)] px-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--grey1)]">
            Gas
          </div>
          <div className="font-mono text-[11px] text-[var(--offwhite)]">
            {gasPriceGwei != null && gasPriceGwei > 0 ? `${gasPriceGwei.toFixed(1)} Gwei` : "—"}
          </div>
        </div>

        <div className="flex min-w-[176px] flex-col justify-center border-l border-[var(--border)] px-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--grey1)]">
            UTC
          </div>
          <div className="font-mono text-[11px] text-[var(--offwhite)]">
            {utcTime || "—"}
          </div>
        </div>

        <TradingButton />
        <WalletPanel />
      </div>
    </header>
  );
}
