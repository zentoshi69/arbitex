"use client";

import { useSystemHealth } from "@/hooks/useSystemHealth";
import { useGasPrice } from "@/hooks/useGasPrice";
import { useMarketPrices } from "@/hooks/useMarketPrices";
import { useDexVenueIds } from "@/hooks/useDexVenueIds";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, Fuel, Settings } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/components/wallet/WalletProvider";
import { ProfileMenu } from "@/components/profile/ProfileMenu";

type CoinGeckoSimplePrice = Record<string, { usd?: number; usd_24h_change?: number }>;

export function TopBar() {
  const { health } = useSystemHealth();
  const { gasPriceGwei } = useGasPrice();
  const { pangolinVenueId, blackholeVenueId, save } = useDexVenueIds();
  const [showSettings, setShowSettings] = useState(false);
  const wallet = useWallet();
  const prevRef = useRef<{ btc?: number; avax?: number; wrp?: number }>({});

  const venuesQ = useQuery({
    queryKey: ["venues-topbar"],
    queryFn: () => api.venues.list(),
    refetchInterval: 30_000,
  });

  const avaxVenues = useMemo(
    () => (venuesQ.data ?? []).filter((v: any) => v.chainId === 43114),
    [venuesQ.data]
  );

  const pricesQ = useMarketPrices({
    pangolinVenueId: pangolinVenueId || undefined,
    blackholeVenueId: blackholeVenueId || undefined,
  });
  const prices = pricesQ.data;

  const cgQ = useQuery({
    queryKey: ["coingecko", "btc-avax"],
    queryFn: async () => {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,avalanche-2&vs_currencies=usd&include_24hr_change=true"
      );
      return (await res.json()) as CoinGeckoSimplePrice;
    },
    refetchInterval: 10_000,
  });

  const statusColor =
    health?.status === "healthy"
      ? "text-emerald-400"
      : health?.status === "degraded"
        ? "text-amber-400"
        : "text-red-400";

  const wrpUsd = useMemo(() => {
    const items = (prices?.items ?? []) as any[];
    const wrpUsdc =
      items.find((it) => String(it.label).toUpperCase().includes("WRP/USDC")) ??
      items.find((it) => String(it.label).toUpperCase().includes("USDC/WRP"));
    const raw = wrpUsdc?.ok ? Number(wrpUsdc?.data?.price1Per0 ?? "0") : 0;
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }, [prices?.items]);

  const wrpPriceError = useMemo(() => {
    const items = (prices?.items ?? []) as any[];
    const wrpUsdc =
      items.find((it) => String(it.label).toUpperCase().includes("WRP/USDC")) ??
      items.find((it) => String(it.label).toUpperCase().includes("USDC/WRP"));
    return wrpUsdc && !wrpUsdc.ok ? String(wrpUsdc.error ?? "Unknown error") : null;
  }, [prices?.items]);

  const live = useMemo(() => {
    const btc = cgQ.data?.bitcoin?.usd ?? null;
    const avax = cgQ.data?.["avalanche-2"]?.usd ?? null;
    const wrp = wrpUsd;

    const pctFromPrev = (key: "btc" | "avax" | "wrp", v: number | null) => {
      if (v === null) return null;
      const prev = prevRef.current[key];
      if (!prev || !Number.isFinite(prev) || prev <= 0) return null;
      return ((v - prev) / prev) * 100;
    };

    const btcPct = pctFromPrev("btc", btc);
    const avaxPct = pctFromPrev("avax", avax);
    const wrpPct = pctFromPrev("wrp", wrp);

    if (btc !== null) prevRef.current.btc = btc;
    if (avax !== null) prevRef.current.avax = avax;
    if (wrp !== null) prevRef.current.wrp = wrp;

    return {
      btc: { usd: btc, pct: btcPct },
      avax: { usd: avax, pct: avaxPct },
      wrp: { usd: wrp, pct: wrpPct },
    };
  }, [cgQ.data, wrpUsd]);

  const fmtUsd = (v: number | null) =>
    v === null ? "—" : `$${v.toLocaleString(undefined, { maximumFractionDigits: v >= 100 ? 2 : 6 })}`;
  const fmtPct = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`);
  const pctClass = (v: number | null) =>
    v === null ? "text-[var(--ax-muted)]" : v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-[var(--ax-dim)]";

  return (
    <header className="flex flex-col flex-shrink-0">
      {/* Fixed live prices (no sliding) */}
      <div className="ax-ticker">
        <div className="h-[38px] px-6 flex items-center gap-6" aria-label="Live prices">
          {([
            { k: "BTC", v: live.btc.usd, pct: live.btc.pct },
            { k: "AVAX", v: live.avax.usd, pct: live.avax.pct },
            { k: "WRP", v: live.wrp.usd, pct: live.wrp.pct },
          ] as const).map((it) => (
            <div key={it.k} className="flex items-baseline gap-3">
              <span className="text-[9px] tracking-[0.14em] uppercase text-[var(--ax-muted)]">
                {it.k}
              </span>
              <span className="font-mono text-[11px] text-[var(--ax-white)] font-medium">
                {fmtUsd(it.v)}
              </span>
              <span className={cn("font-mono text-[11px] font-medium", pctClass(it.pct))}>
                {fmtPct(it.pct)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {showSettings && (
        <div
          className="px-6 py-3 border-b border-[var(--ax-border)]"
          style={{ background: "rgba(255,255,255,0.02)" }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1">
              <div className="text-[11px] text-slate-500 font-medium">Pangolin V2 venue (Avalanche)</div>
              <select
                value={pangolinVenueId}
                onChange={(e) => save({ pangolinVenueId: e.target.value, blackholeVenueId })}
                className="w-full h-9 ax-field px-3 text-sm"
              >
                <option value="">Select…</option>
                {avaxVenues.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.protocol})
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <div className="text-[11px] text-slate-500 font-medium">Blackhole V2 venue (Avalanche)</div>
              <select
                value={blackholeVenueId}
                onChange={(e) => save({ pangolinVenueId, blackholeVenueId: e.target.value })}
                className="w-full h-9 ax-field px-3 text-sm"
              >
                <option value="">Select…</option>
                {avaxVenues.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.protocol})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="text-[11px] text-slate-600 mt-2">
            Prices show once the **three pools are registered** under these venues.
          </div>

          {pricesQ.isError && (
            <p className="text-[11px] text-slate-500 mt-2">
              Prices fetch failed: {String((pricesQ.error as any)?.message ?? pricesQ.error)}
            </p>
          )}

          {!pricesQ.isError && prices?.meta?.venueCount === 0 && (
            <p className="text-[11px] text-slate-500 mt-2">
              No venue IDs selected (localStorage keys are empty). Select venues first.
            </p>
          )}

          {!pricesQ.isError && wrpPriceError && (
            <p className="text-[11px] text-slate-500 mt-2">
              WRP/USDC not available: {wrpPriceError}
            </p>
          )}
        </div>
      )}

      {/* Topbar (redesign style) */}
      <div className="ax-topbar h-[46px] flex items-center px-6">
        <div className="text-[10px] tracking-[0.12em] uppercase text-[var(--ax-muted)] flex items-center gap-2">
          <span>ArbitEx</span>
          <span className="text-[var(--ax-border-hi)]">/</span>
          <span className="text-[var(--ax-white)] font-medium">
            {typeof window !== "undefined" ? window.location.pathname.replace("/", "") || "overview" : "overview"}
          </span>
        </div>

        <div className="ml-auto flex items-stretch">
          <button
            onClick={() => setShowSettings((s) => !s)}
            className="h-[46px] px-4 border-l border-[var(--ax-border)] text-[10px] tracking-[0.12em] uppercase text-[var(--ax-muted)] hover:text-[var(--ax-white)] inline-flex items-center gap-2"
            title="Select venues for live prices"
          >
            <Settings className="w-3.5 h-3.5" />
            Venues
          </button>

          <div className="h-[46px] px-4 border-l border-[var(--ax-border)] flex flex-col justify-center gap-0.5">
            <div className="text-[8px] tracking-[0.12em] uppercase text-[var(--ax-muted)]">Status</div>
            <div className={cn("font-mono text-[11px] font-medium", statusColor)}>
              {health?.status?.toUpperCase() ?? "CONNECTING"}
            </div>
          </div>

          <div className="h-[46px] px-4 border-l border-[var(--ax-border)] flex flex-col justify-center gap-0.5">
            <div className="text-[8px] tracking-[0.12em] uppercase text-[var(--ax-muted)]">Queue</div>
            <div className="font-mono text-[11px] font-medium text-[var(--ax-white)]">
              {Object.values(health?.workerQueueDepths ?? {}).reduce((a, b) => a + b, 0)}
            </div>
          </div>

          <div className="h-[46px] px-4 border-l border-[var(--ax-border)] flex items-center gap-3">
            {wallet.available ? (
              wallet.connected ? (
                <button
                  onClick={() => wallet.switchToAvalanche().catch(() => {})}
                  className={cn(
                    "px-2 py-1 rounded-[2px] border text-[10px] font-mono tracking-wider",
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
                  className="px-2 py-1 rounded-[2px] border border-[var(--ax-border-hi)] text-[10px] tracking-wider text-[var(--ax-dim)] hover:text-[var(--ax-white)]"
                >
                  Connect
                </button>
              )
            ) : (
              <span className="text-[10px] text-[var(--ax-muted)]">No wallet</span>
            )}

            <ProfileMenu />

            <div className="text-[10px] tracking-[0.1em] uppercase font-medium text-[var(--ax-white)] inline-flex items-center gap-2">
              <span
                className="w-[5px] h-[5px] rounded-full"
                style={{ background: "var(--ax-red)", boxShadow: "0 0 8px rgba(232,65,66,0.8)" }}
              />
              OPERATOR
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
