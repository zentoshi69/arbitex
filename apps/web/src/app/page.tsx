"use client";

import { useQuery } from "@tanstack/react-query";
import { PerspectiveTunnel } from "@/components/layout/PerspectiveTunnel";
import { PixelColumn } from "@/components/layout/PixelColumn";
import { useWallet } from "@/components/wallet/WalletProvider";
import { api } from "@/lib/api";
import { Wallet } from "lucide-react";

type CoinGeckoSimplePrice = Record<string, { usd?: number; usd_24h_change?: number }>;

function HeroChip({
  label,
  value,
  change,
  tone = "neutral",
}: {
  label: string;
  value: string;
  change: string;
  tone?: "up" | "down" | "neutral";
}) {
  return (
    <div className="min-w-[152px] border border-[var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-[9px]">
      <div className="mb-[5px] font-mono text-[7.5px] uppercase tracking-[0.12em] text-[var(--grey2)]">
        {label}
      </div>
      <div className="font-mono text-[15px] font-medium text-[var(--offwhite)]">{value}</div>
      <div
        className={`mt-0.5 font-mono text-[8.5px] ${
          tone === "up"
            ? "text-[#4DD68C]"
            : tone === "down"
              ? "text-[var(--red)]"
              : "text-[var(--grey2)]"
        }`}
      >
        {change}
      </div>
    </div>
  );
}

function CornerBrackets() {
  return (
    <>
      <span className="absolute left-0 top-0 h-[14px] w-[14px] border-l-[1.5px] border-t-[1.5px] border-[rgba(232,65,66,0.6)]" />
      <span className="absolute right-0 top-0 h-[14px] w-[14px] border-r-[1.5px] border-t-[1.5px] border-[rgba(232,65,66,0.6)]" />
      <span className="absolute bottom-0 left-0 h-[14px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-[rgba(232,65,66,0.6)]" />
      <span className="absolute bottom-0 right-0 h-[14px] w-[14px] border-b-[1.5px] border-r-[1.5px] border-[rgba(232,65,66,0.6)]" />
    </>
  );
}

export default function OverviewPage() {
  const wallet = useWallet();

  const cgQ = useQuery({
    queryKey: ["ui", "coingecko", "avax-btc"],
    queryFn: async () => {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=avalanche-2&vs_currencies=usd&include_24hr_change=true"
      );
      if (!res.ok) throw new Error(`CoinGecko failed ${res.status}`);
      return (await res.json()) as CoinGeckoSimplePrice;
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  const marketQ = useQuery({
    queryKey: ["ui", "market-tokens-overview"],
    queryFn: () => api.market.tokenPrices(),
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 2,
  });

  const avaxUsd = marketQ.data?.tokens?.AVAX?.usd ?? cgQ.data?.["avalanche-2"]?.usd ?? null;
  const avaxChange = marketQ.data?.tokens?.AVAX?.change24h ?? cgQ.data?.["avalanche-2"]?.usd_24h_change ?? null;
  const wrpUsd = marketQ.data?.tokens?.WRP?.usd ?? null;
  const wrpChange = marketQ.data?.tokens?.WRP?.change24h ?? null;

  const formatUsd = (v: number | null, digits = 2) =>
    v !== null && Number.isFinite(v) ? `$${v.toFixed(digits)}` : "—";

  const formatChange = (v: number | null): string => {
    if (v === null || !Number.isFinite(v)) return "pending";
    return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
  };

  const toneFor = (v: number | null): "up" | "down" | "neutral" =>
    v === null ? "neutral" : v >= 0 ? "up" : "down";

  const chips = [
    {
      label: "AVAX/USD",
      value: formatUsd(avaxUsd),
      change: avaxChange !== null ? formatChange(avaxChange) : (marketQ.isFetching ? "updating..." : "live"),
      tone: toneFor(avaxChange),
    },
    {
      label: "WARP/USD",
      value: formatUsd(wrpUsd, 4),
      change: wrpChange !== null ? formatChange(wrpChange) : "pending",
      tone: toneFor(wrpChange),
    },
    {
      label: "Net Edge",
      value: "+24.3 bps",
      change: "+6.2%",
      tone: "up" as const,
    },
    {
      label: "Mock PnL",
      value: "$0.00",
      change: "0.00%",
      tone: "neutral" as const,
    },
  ];

  return (
    <div
      className="relative h-full min-h-[640px] overflow-hidden bg-[var(--bg)] after:pointer-events-none after:absolute after:inset-0 after:z-[2] after:content-['']"
      style={{ margin: "-24px" }}
    >
      <PerspectiveTunnel />
      <div
        className="pointer-events-none absolute inset-0 z-[2]"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(8,8,6,0) 0%, rgba(8,8,6,0.85) 100%)",
        }}
      />

      <div className="relative z-[5] flex h-full flex-col">
        <div className="relative flex-1">
          <div className="absolute left-1/2 top-1/2 w-[min(1040px,calc(100%-88px))] -translate-x-1/2 -translate-y-1/2 px-3">
            <div className="flex items-center justify-center gap-4">
              <span className="h-px w-[40px] bg-[var(--red)]" />
              <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--red)]">
                Avalanche C-Chain · Pangolin V2 · Trader Joe V1
              </span>
              <span className="h-px w-[40px] bg-[var(--red)]" />
            </div>

            <div className="relative mt-6 px-10 py-7">
              <CornerBrackets />

              <div className="font-styrene text-[clamp(48px,6.5vw,82px)] font-black uppercase leading-none tracking-[-0.04em] text-[var(--offwhite)]">
                Cross-Dex
              </div>
              <div className="font-styrene text-[clamp(48px,6.5vw,82px)] font-black uppercase leading-none tracking-[-0.04em] text-[var(--red)]">
                Arbitrage
              </div>

              <div className="mt-5 font-mono text-[10px] uppercase leading-[1.8] tracking-[0.14em] text-[var(--grey2)]">
                Real-time spread mapping, route arbitration, and shadow execution telemetry for avalanche market structure.
              </div>

              <div className="mt-4 flex items-center gap-4">
                <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--offwhite)]">
                  <span className="text-[var(--grey2)]">[</span>
                  <span className="h-[6px] w-[6px] rounded-full bg-[var(--red)] [animation:pulse_1.4s_ease-in-out_infinite]" />
                  <span className="text-[var(--red)]">Shadow Mode Active</span>
                  <span className="text-[var(--grey2)]">]</span>
                </div>

                {!wallet.connected && (
                  <button
                    onClick={() => wallet.connect().catch(() => {})}
                    className="flex items-center gap-2 border border-[var(--border)] bg-[rgba(232,65,66,0.08)] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--red)] transition-colors hover:bg-[rgba(232,65,66,0.15)]"
                  >
                    <Wallet className="h-3 w-3" />
                    Connect Wallet
                  </button>
                )}

                {wallet.connected && (
                  <div className="flex items-center gap-2 border border-[var(--border)] bg-[rgba(77,214,140,0.06)] px-3 py-1.5 font-mono text-[9px] text-[#4DD68C]">
                    <span className="h-[5px] w-[5px] rounded-full bg-[#4DD68C]" />
                    {wallet.address?.slice(0, 6)}…{wallet.address?.slice(-4)}
                  </div>
                )}
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {chips.map((chip) => (
                  <HeroChip
                    key={chip.label}
                    label={chip.label}
                    value={chip.value}
                    change={chip.change}
                    tone={chip.tone}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-[7] flex h-[28px] items-center gap-5 border-t border-[var(--border)] bg-[var(--bg)] px-5 font-mono text-[8.5px] uppercase tracking-[0.07em] text-[var(--grey2)]">
          <div className="text-[var(--red)]">● CONNECTING</div>
          <div>
            MOCK_EXECUTION = <span className="text-[var(--offwhite)]">true</span>
          </div>
          <div>
            EXECUTION_ENABLED = <span className="text-[var(--offwhite)]">false</span>
          </div>
          <div className="flex-1" />
          <div>
            Chain <span className="text-[var(--offwhite)]">43114</span>
          </div>
          <div className="text-[#4DD68C]">Phase A Shadow Mode</div>
        </div>
      </div>

      <PixelColumn />
    </div>
  );
}
