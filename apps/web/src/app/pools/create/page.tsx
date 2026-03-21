"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getRole } from "@/lib/auth";
import { SectionHeader, EmptyState, Skeleton, AddressCell } from "@/components/ui";
import { PlusCircle, Search, Zap, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const isHexAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v.trim());

type DiscoverResult = {
  found: boolean;
  poolAddress: string | null;
  error?: string;
  venue?: { id: string; name: string; protocol: string };
  token0?: { symbol: string; name: string; decimals: number; address: string } | null;
  token1?: { symbol: string; name: string; decimals: number; address: string } | null;
  feeBps?: number;
};

export default function PoolCreatePage() {
  const role = useMemo(() => getRole(), []);

  const [form, setForm] = useState({
    venueId: "",
    poolAddress: "",
    token0Address: "",
    token1Address: "",
    feeBps: 30,
  });

  const [lookup, setLookup] = useState("");
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [discoverState, setDiscoverState] = useState<"idle" | "loading" | "found" | "not-found" | "error">("idle");
  const [discoverResult, setDiscoverResult] = useState<DiscoverResult | null>(null);

  const venuesQ = useQuery({
    queryKey: ["venues"],
    queryFn: () => api.venues.list(),
  });

  useEffect(() => {
    if (!venuesQ.data?.length) return;
    if (!form.venueId) {
      setForm((f) => ({ ...f, venueId: venuesQ.data[0].id }));
    }
  }, [venuesQ.data, form.venueId]);

  const selectedVenue = useMemo(() => {
    if (!venuesQ.data?.length) return null;
    return venuesQ.data.find((v: any) => v.id === form.venueId) ?? null;
  }, [venuesQ.data, form.venueId]);

  const canDiscover =
    form.venueId &&
    isHexAddress(form.token0Address) &&
    isHexAddress(form.token1Address) &&
    form.token0Address.trim().toLowerCase() !== form.token1Address.trim().toLowerCase();

  const canSubmit =
    role === "ADMIN" &&
    form.venueId &&
    isHexAddress(form.poolAddress) &&
    isHexAddress(form.token0Address) &&
    isHexAddress(form.token1Address) &&
    Number.isFinite(form.feeBps);

  const discover = useCallback(async () => {
    if (!canDiscover) return;
    setDiscoverState("loading");
    setDiscoverResult(null);
    try {
      const res = await api.pools.discover({
        venueId: form.venueId,
        token0Address: form.token0Address.trim(),
        token1Address: form.token1Address.trim(),
        feeBps: Number(form.feeBps),
      });
      setDiscoverResult(res);
      if (res.found && res.poolAddress) {
        setForm((f) => ({ ...f, poolAddress: res.poolAddress }));
        setDiscoverState("found");
      } else {
        setDiscoverState("not-found");
      }
    } catch (e: any) {
      setDiscoverResult({ found: false, poolAddress: null, error: e?.message ?? "Discovery failed" });
      setDiscoverState("error");
    }
  }, [canDiscover, form.venueId, form.token0Address, form.token1Address, form.feeBps]);

  async function runLookup(address: string) {
    const a = address.trim();
    if (!isHexAddress(a)) {
      setLookupResult(null);
      return;
    }
    const res = await api.pools.resolve(a);
    setLookupResult(res);
  }

  async function submit() {
    setSubmitState("submitting");
    setSubmitError(null);
    try {
      await api.pools.create({
        venueId: form.venueId,
        poolAddress: form.poolAddress.trim(),
        token0Address: form.token0Address.trim(),
        token1Address: form.token1Address.trim(),
        feeBps: Number(form.feeBps),
      });
      setSubmitState("done");
    } catch (e: any) {
      setSubmitState("error");
      setSubmitError(e?.message ?? "Failed to create pool");
    }
  }

  if (role !== "ADMIN") {
    return (
      <div className="space-y-4 max-w-[900px]">
        <SectionHeader
          title="Create Pool"
          description="Admin-only: create pools in the DB registry"
        />
        <div className="ax-panel">
          <EmptyState message="Admin only. Your JWT must include role=ADMIN." />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-[900px]">
      <SectionHeader
        title="Create Pool"
        description="Register an on-chain liquidity pool so ArbitEx can monitor and trade it"
        action={
          <button
            onClick={submit}
            disabled={!canSubmit || submitState === "submitting"}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-2 rounded text-sm font-semibold transition-colors",
              canSubmit ? "bg-[var(--ax-red)] hover:opacity-90 text-white" : "bg-[var(--bg3)] text-[var(--grey2)] cursor-not-allowed"
            )}
          >
            <PlusCircle className="w-4 h-4" />
            {submitState === "submitting" ? "Creating…" : "Create Pool"}
          </button>
        }
      />

      {submitState === "done" && (
        <div className="bg-[rgba(77,214,140,0.08)] border border-[rgba(77,214,140,0.2)] text-[#4dd68c] rounded px-4 py-3 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          Pool registered successfully. The worker will begin monitoring it on the next scan cycle.
        </div>
      )}

      {submitError && (
        <div className="bg-[rgba(232,65,66,0.08)] border border-[rgba(232,65,66,0.2)] text-[var(--red)] rounded px-4 py-3 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {submitError}
        </div>
      )}

      {/* ── Step 1: Select venue ──────────────────────────────────────────── */}
      <div className="ax-panel p-4 space-y-3">
        <div className="text-xs font-semibold text-[var(--grey1)] uppercase tracking-wider">Step 1 — Select venue & fee</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-xs text-[var(--grey2)] font-medium relative group inline-flex items-center gap-1 cursor-help">
              Venue
              <span className="inline-block w-3.5 h-3.5 rounded-full border border-[var(--grey2)] text-[10px] leading-[13px] text-center">?</span>
              <div className="absolute bottom-full left-0 mb-2 w-72 p-3 rounded bg-[var(--bg2)] border border-[var(--border)] text-xs text-[var(--offwhite)] leading-relaxed opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 shadow-lg">
                <strong className="text-[var(--ax-red)]">Venue</strong> is a DEX (Decentralized Exchange) where the pool lives — for example <em>Pangolin</em>, <em>Trader Joe</em>, or <em>SushiSwap</em>. Each venue has its own smart contract factory and router. ArbitEx monitors price differences <em>between</em> venues to find arbitrage opportunities.
              </div>
            </div>
            {venuesQ.isLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <select
                value={form.venueId}
                onChange={(e) => {
                  setForm((f) => ({ ...f, venueId: e.target.value, poolAddress: "" }));
                  setDiscoverState("idle");
                  setDiscoverResult(null);
                }}
                className="w-full h-9 ax-field px-3 text-sm"
              >
                {(venuesQ.data ?? []).map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.protocol})
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="space-y-1">
            <div className="text-xs text-[var(--grey2)] font-medium relative group inline-flex items-center gap-1 cursor-help">
              Fee tier (bps)
              <span className="inline-block w-3.5 h-3.5 rounded-full border border-[var(--grey2)] text-[10px] leading-[13px] text-center">?</span>
              <div className="absolute bottom-full left-0 mb-2 w-64 p-3 rounded bg-[var(--bg2)] border border-[var(--border)] text-xs text-[var(--offwhite)] leading-relaxed opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 shadow-lg">
                Common fee tiers: <strong>5</strong> (0.05%), <strong>30</strong> (0.3%), <strong>100</strong> (1%). V2 DEXs typically use 30 bps.
              </div>
            </div>
            {selectedVenue?.protocol?.includes("v3") ? (
              <select
                value={form.feeBps}
                onChange={(e) => {
                  setForm((f) => ({ ...f, feeBps: Number(e.target.value), poolAddress: "" }));
                  setDiscoverState("idle");
                }}
                className="w-full h-9 ax-field px-3 text-sm"
              >
                <option value={5}>5 bps (0.05%)</option>
                <option value={30}>30 bps (0.3%)</option>
                <option value={100}>100 bps (1%)</option>
              </select>
            ) : (
              <input
                type="number"
                value={form.feeBps}
                onChange={(e) => setForm((f) => ({ ...f, feeBps: Number(e.target.value), poolAddress: "" }))}
                className="w-full h-9 ax-field px-3 text-sm"
              />
            )}
          </label>
        </div>
      </div>

      {/* ── Step 2: Token addresses ───────────────────────────────────────── */}
      <div className="ax-panel p-4 space-y-3">
        <div className="text-xs font-semibold text-[var(--grey1)] uppercase tracking-wider">Step 2 — Token addresses</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-xs text-[var(--grey2)] font-medium">Token 0 address</div>
            <input
              value={form.token0Address}
              onChange={(e) => {
                setForm((f) => ({ ...f, token0Address: e.target.value, poolAddress: "" }));
                setDiscoverState("idle");
              }}
              placeholder="0x…"
              className="w-full h-9 ax-field px-3 text-sm font-mono"
            />
            {discoverResult?.token0 && (
              <div className="text-[10px] text-[var(--grey1)]">
                {discoverResult.token0.symbol} — {discoverResult.token0.name} ({discoverResult.token0.decimals} dec)
              </div>
            )}
          </label>

          <label className="space-y-1">
            <div className="text-xs text-[var(--grey2)] font-medium">Token 1 address</div>
            <input
              value={form.token1Address}
              onChange={(e) => {
                setForm((f) => ({ ...f, token1Address: e.target.value, poolAddress: "" }));
                setDiscoverState("idle");
              }}
              placeholder="0x…"
              className="w-full h-9 ax-field px-3 text-sm font-mono"
            />
            {discoverResult?.token1 && (
              <div className="text-[10px] text-[var(--grey1)]">
                {discoverResult.token1.symbol} — {discoverResult.token1.name} ({discoverResult.token1.decimals} dec)
              </div>
            )}
          </label>
        </div>

        <button
          onClick={discover}
          disabled={!canDiscover || discoverState === "loading"}
          className={cn(
            "inline-flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors",
            canDiscover
              ? "bg-[var(--bg3)] hover:bg-[var(--border)] text-[var(--offwhite)]"
              : "bg-[var(--bg3)] text-[var(--grey3)] cursor-not-allowed"
          )}
        >
          {discoverState === "loading" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Zap className="w-4 h-4" />
          )}
          Discover pool on-chain
        </button>

        {discoverState === "found" && discoverResult?.poolAddress && (
          <div className="bg-[rgba(77,214,140,0.06)] border border-[rgba(77,214,140,0.15)] rounded px-3 py-2 text-sm flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#4dd68c] mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-[#4dd68c] font-medium">Pool found!</div>
              <div className="text-xs font-mono text-[var(--grey1)] mt-0.5">{discoverResult.poolAddress}</div>
              <div className="text-[10px] text-[var(--grey2)] mt-1">
                {discoverResult.token0?.symbol ?? "?"} / {discoverResult.token1?.symbol ?? "?"} on {discoverResult.venue?.name}
              </div>
            </div>
          </div>
        )}

        {discoverState === "not-found" && (
          <div className="bg-[rgba(232,65,66,0.06)] border border-[rgba(232,65,66,0.15)] rounded px-3 py-2 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-[var(--red)] mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-[var(--red)] font-medium">Pool not found</div>
              <div className="text-xs text-[var(--grey2)] mt-0.5">{discoverResult?.error ?? "No pool exists for this token pair and fee on the selected venue."}</div>
              <div className="text-[10px] text-[var(--grey2)] mt-1">You can still enter a pool address manually below if you know it.</div>
            </div>
          </div>
        )}

        {discoverState === "error" && (
          <div className="bg-[rgba(232,65,66,0.06)] border border-[rgba(232,65,66,0.15)] rounded px-3 py-2 text-sm text-[var(--red)]">
            {discoverResult?.error ?? "Discovery failed"}
          </div>
        )}
      </div>

      {/* ── Step 3: Pool address (auto-filled or manual) ──────────────────── */}
      <div className="ax-panel p-4 space-y-3">
        <div className="text-xs font-semibold text-[var(--grey1)] uppercase tracking-wider">Step 3 — Pool contract address</div>
        <label className="space-y-1">
          <div className="text-xs text-[var(--grey2)] font-medium">
            {discoverState === "found" ? "Auto-discovered — verified on-chain" : "Enter or discover above"}
          </div>
          <input
            value={form.poolAddress}
            onChange={(e) => setForm((f) => ({ ...f, poolAddress: e.target.value }))}
            placeholder="0x…"
            className={cn(
              "w-full h-9 ax-field px-3 text-sm font-mono",
              discoverState === "found" && "border-[rgba(77,214,140,0.3)]"
            )}
          />
        </label>
      </div>

      {/* ── Resolve tool ──────────────────────────────────────────────────── */}
      <div className="ax-panel p-4 space-y-3">
        <div className="text-xs font-semibold text-[var(--grey1)] uppercase tracking-wider">Lookup tool</div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--grey2)]" />
            <input
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runLookup(lookup);
              }}
              placeholder="Paste a token or pool contract address to resolve…"
              className="w-full pl-8 pr-3 py-2 ax-field text-sm font-mono"
            />
          </div>
          <button
            onClick={() => runLookup(lookup)}
            className="px-3 py-2 ax-field text-sm text-[var(--offwhite)] hover:opacity-90"
          >
            Resolve
          </button>
        </div>

        {!lookupResult && (
          <div className="text-xs text-[var(--grey2)]">
            Tip: token addresses will return metadata + pools that include it (if already registered).
          </div>
        )}

        {lookupResult && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <div className="text-[var(--offwhite)]">
                Result: <span className="font-semibold">{lookupResult.kind}</span>
              </div>
              <AddressCell address={lookupResult.address} />
            </div>

            {lookupResult.token?.data && (
              <div className="rounded-[2px] p-3 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "var(--ax-border)" }}>
                <div className="text-xs text-[var(--grey2)] mb-1">Token ({lookupResult.token.source})</div>
                <div className="font-semibold text-[var(--offwhite)]">
                  {lookupResult.token.data.symbol} — {lookupResult.token.data.name}
                </div>
                <div className="text-xs text-[var(--grey1)] font-mono">
                  {lookupResult.token.data.address} · decimals {lookupResult.token.data.decimals}
                </div>
              </div>
            )}

            {lookupResult.pool && (
              <div className="rounded-[2px] p-3 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "var(--ax-border)" }}>
                <div className="text-xs text-[var(--grey2)] mb-1">Pool</div>
                <div className="font-semibold text-[var(--offwhite)]">
                  {lookupResult.pool.token0?.symbol ?? "?"} / {lookupResult.pool.token1?.symbol ?? "?"} · {lookupResult.pool.venue?.name ?? "—"} · {lookupResult.pool.feeBps} bps
                </div>
                <div className="text-xs text-[var(--grey1)] font-mono">{lookupResult.pool.poolAddress}</div>
              </div>
            )}

            {(lookupResult.pools?.length ?? 0) > 0 && (
              <div className="bg-[rgba(255,255,255,0.02)] border border-[var(--border)] rounded p-3">
                <div className="text-xs text-[var(--grey2)] mb-2">Associated pools</div>
                <div className="space-y-1">
                  {lookupResult.pools.slice(0, 10).map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between text-xs">
                      <span className="text-[var(--offwhite)]">
                        {p.token0?.symbol} / {p.token1?.symbol} · {p.venue?.name} · {p.feeBps} bps
                      </span>
                      <span className="text-[var(--grey2)] font-mono">{p.poolAddress.slice(0, 6)}…{p.poolAddress.slice(-4)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
