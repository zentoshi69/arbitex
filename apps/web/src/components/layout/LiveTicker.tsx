"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useWrpPrice } from "@/hooks/useWrpPrice";

type CoinGeckoSimplePrice = Record<string, { usd?: number; usd_24h_change?: number }>;

function formatUsd(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: digits })}`;
}

function formatChange(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function PriceCell({
  label,
  price,
  change,
  border = true,
}: {
  label: string;
  price: string;
  change: string;
  border?: boolean;
}) {
  const tone = change.startsWith("+")
    ? "up"
    : change.startsWith("-")
      ? "down"
      : "neutral";

  return (
    <div
      className={cn(
        "flex h-full flex-col justify-center px-7",
        border && "border-r border-[var(--border)]"
      )}
    >
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--grey2)]">
        {label}
      </span>
      <div className="mt-1 flex items-baseline gap-2.5">
        <span className="font-mono text-[26px] font-medium leading-none text-[var(--offwhite)]">
          {price}
        </span>
        {change && (
          <span
            className={cn(
              "font-mono text-[11px]",
              tone === "up" && "text-[#4DD68C]",
              tone === "down" && "text-[var(--red)]",
              tone === "neutral" && "text-[var(--grey2)]"
            )}
          >
            {change}
          </span>
        )}
      </div>
    </div>
  );
}

export function LiveTicker() {
  const cgQ = useQuery({
    queryKey: ["ui", "coingecko", "avax-btc"],
    queryFn: async () => {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,avalanche-2&vs_currencies=usd&include_24hr_change=true"
      );
      if (!res.ok) throw new Error(`CoinGecko request failed: ${res.status}`);
      return (await res.json()) as CoinGeckoSimplePrice;
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  const marketQ = useQuery({
    queryKey: ["ui", "market-tokens"],
    queryFn: () => api.market.tokenPrices(),
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 2,
  });

  const wrpQ = useWrpPrice();

  const btcUsd = cgQ.data?.bitcoin?.usd ?? null;
  const btcChange = cgQ.data?.bitcoin?.usd_24h_change ?? null;
  const avaxUsd =
    marketQ.data?.tokens?.AVAX?.usd ??
    cgQ.data?.["avalanche-2"]?.usd ??
    null;
  const avaxChange =
    marketQ.data?.tokens?.AVAX?.change24h ??
    cgQ.data?.["avalanche-2"]?.usd_24h_change ??
    null;

  // WRP price: prefer API → then on-chain WRP/USDC → then derive from on-chain WRP/AVAX × AVAX/USD
  const apiWrpUsd = marketQ.data?.tokens?.WRP?.usd ?? null;
  const onchainWrpUsd = wrpQ.data?.wrpUsd ?? null;
  const derivedWrpUsd =
    wrpQ.data?.avaxPerWrp && avaxUsd
      ? wrpQ.data.avaxPerWrp * avaxUsd
      : null;
  const wrpUsd = apiWrpUsd ?? onchainWrpUsd ?? derivedWrpUsd;

  const wrpChange = marketQ.data?.tokens?.WRP?.change24h ?? null;

  // WRP/AVAX ratio: prefer on-chain direct ratio, else derive from USD prices
  const wrpPerAvax =
    wrpQ.data?.wrpPerAvax ??
    (avaxUsd && wrpUsd && wrpUsd > 0 ? avaxUsd / wrpUsd : null);

  return (
    <div className="relative flex h-[80px] flex-shrink-0 items-stretch overflow-hidden border-b border-[var(--border)] bg-[var(--black)]">
      <PriceCell
        label="BTC"
        price={formatUsd(btcUsd, 0)}
        change={formatChange(btcChange)}
      />
      <PriceCell
        label="AVAX"
        price={formatUsd(avaxUsd, 2)}
        change={formatChange(avaxChange)}
      />
      <PriceCell
        label="WRP"
        price={formatUsd(wrpUsd, 4)}
        change={formatChange(wrpChange)}
      />
      <PriceCell
        label="WRP / AVAX"
        price={wrpPerAvax !== null ? wrpPerAvax.toFixed(2) : "—"}
        change=""
        border={false}
      />
    </div>
  );
}
