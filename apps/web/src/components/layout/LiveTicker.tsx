"use client";

import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTokenPrices, useMarketPrices } from "@/hooks/useMarketPrices";
import { cn } from "@/lib/utils";

type CoinGeckoSimplePrice = Record<string, { usd?: number; usd_24h_change?: number }>;

export function LiveTicker() {
  const prevRef = useRef<Record<string, number>>({});

  const tokenPricesQ = useTokenPrices();
  const pricesQ = useMarketPrices();

  const cgQ = useQuery({
    queryKey: ["coingecko", "btc-avax"],
    queryFn: async () => {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,avalanche-2&vs_currencies=usd&include_24hr_change=true"
      );
      return (await res.json()) as CoinGeckoSimplePrice;
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const wrpUsd = useMemo(() => {
    const tp = tokenPricesQ.data?.tokens?.WRP;
    if (tp?.usd && tp.usd > 0) return tp.usd;

    const items = (pricesQ.data?.items ?? []) as any[];
    const wrpUsdc =
      items.find((it: any) => String(it.label).toUpperCase().includes("WRP/USDC")) ??
      items.find((it: any) => String(it.label).toUpperCase().includes("USDC/WRP"));
    const raw = wrpUsdc?.ok ? Number(wrpUsdc?.data?.price1Per0 ?? "0") : 0;
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }, [tokenPricesQ.data, pricesQ.data]);

  const avaxUsd = useMemo(() => {
    const tp = tokenPricesQ.data?.tokens?.AVAX;
    if (tp?.usd && tp.usd > 0) return { price: tp.usd, change: tp.change24h };

    const cg = cgQ.data?.["avalanche-2"];
    if (cg?.usd) return { price: cg.usd, change: cg.usd_24h_change ?? null };

    return { price: null as number | null, change: null as number | null };
  }, [tokenPricesQ.data, cgQ.data]);

  const tickerItems = useMemo(() => {
    const btc = cgQ.data?.bitcoin?.usd ?? null;
    const btcChange = cgQ.data?.bitcoin?.usd_24h_change ?? null;
    const avax = avaxUsd.price;
    const avaxChange = avaxUsd.change;
    const wrp = wrpUsd;

    const pctFromPrev = (key: string, v: number | null) => {
      if (v === null) return null;
      const prev = prevRef.current[key];
      if (!prev || !Number.isFinite(prev) || prev <= 0) return null;
      return ((v - prev) / prev) * 100;
    };

    const wrpPct = pctFromPrev("wrp", wrp);
    if (btc !== null) prevRef.current.btc = btc;
    if (avax !== null) prevRef.current.avax = avax;
    if (wrp !== null) prevRef.current.wrp = wrp;

    const fmtUsd = (v: number | null) =>
      v === null
        ? "—"
        : `$${v.toLocaleString(undefined, { maximumFractionDigits: v >= 100 ? 2 : v >= 1 ? 4 : 6 })}`;
    const fmtPct = (v: number | null) =>
      v === null ? "" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

    return [
      { label: "BTC", value: fmtUsd(btc), pct: btcChange, fmtPct: fmtPct(btcChange) },
      { label: "AVAX", value: fmtUsd(avax), pct: avaxChange, fmtPct: fmtPct(avaxChange) },
      { label: "WRP", value: fmtUsd(wrp), pct: wrpPct, fmtPct: fmtPct(wrpPct) },
    ];
  }, [cgQ.data, avaxUsd, wrpUsd]);

  const items = [...tickerItems, ...tickerItems];

  return (
    <div className="relative h-[22px] overflow-hidden border-b border-border bg-bg-panel">
      <div
        className="pointer-events-none absolute left-0 top-0 z-[1] h-full w-[30px]"
        style={{ background: "linear-gradient(90deg, var(--bg-panel) 0%, transparent 100%)" }}
      />
      <div
        className="pointer-events-none absolute right-0 top-0 z-[1] h-full w-[30px]"
        style={{ background: "linear-gradient(270deg, var(--bg-panel) 0%, transparent 100%)" }}
      />

      <div
        className="inline-flex h-[22px] items-center whitespace-nowrap will-change-transform"
        style={{ animation: "ax-ticker 30s linear infinite" }}
      >
        {items.map((it, i) => (
          <div
            key={i}
            className="flex items-center gap-2 border-r border-border px-[18px] font-mono text-[9px] tracking-[0.04em]"
          >
            <span className="text-muted">{it.label}</span>
            <span className="text-white">{it.value}</span>
            {it.fmtPct && (
              <span
                className={cn(
                  it.pct !== null && it.pct > 0 && "text-[#4ADE80]",
                  it.pct !== null && it.pct < 0 && "text-red",
                  it.pct === null && "text-muted"
                )}
              >
                {it.fmtPct}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
