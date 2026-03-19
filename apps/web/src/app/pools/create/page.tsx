"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getRole } from "@/lib/auth";
import { SectionHeader, EmptyState, Skeleton, AddressCell } from "@/components/ui";
import { PlusCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const isHexAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v.trim());

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

  const canSubmit =
    role === "ADMIN" &&
    form.venueId &&
    isHexAddress(form.poolAddress) &&
    isHexAddress(form.token0Address) &&
    isHexAddress(form.token1Address) &&
    Number.isFinite(form.feeBps);

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
      const created = await api.pools.create({
        venueId: form.venueId,
        poolAddress: form.poolAddress.trim(),
        token0Address: form.token0Address.trim(),
        token1Address: form.token1Address.trim(),
        feeBps: Number(form.feeBps),
      });
      setSubmitState("done");
      setLookupResult({ kind: "pool", pool: created, pools: [], token: null });
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
        description="Admin-only: register a pool so the system can snapshot and trade it"
        action={
          <button
            onClick={submit}
            disabled={!canSubmit || submitState === "submitting"}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-2 rounded text-sm font-semibold",
              canSubmit ? "bg-[var(--ax-red)] hover:opacity-90 text-white" : "bg-[var(--bg3)] text-[var(--grey2)] cursor-not-allowed"
            )}
          >
            <PlusCircle className="w-4 h-4" />
            {submitState === "submitting" ? "Creating…" : "Create pool"}
          </button>
        }
      />

      {submitError && (
        <div className="bg-[rgba(232,65,66,0.08)] border border-[rgba(232,65,66,0.2)] text-[var(--red)] rounded px-4 py-3 text-sm">
          {submitError}
        </div>
      )}

      <div className="ax-panel p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-xs text-[var(--grey2)] font-medium">Venue</div>
            {venuesQ.isLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <select
                value={form.venueId}
                onChange={(e) => setForm((f) => ({ ...f, venueId: e.target.value }))}
                className="w-full h-9 ax-field px-3 text-sm"
              >
                {(venuesQ.data ?? []).map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.protocol}) — chain {v.chain?.chainId}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="space-y-1">
            <div className="text-xs text-[var(--grey2)] font-medium">Fee (bps)</div>
            <input
              type="number"
              value={form.feeBps}
              onChange={(e) => setForm((f) => ({ ...f, feeBps: Number(e.target.value) }))}
              className="w-full h-9 ax-field px-3 text-sm"
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <div className="text-xs text-[var(--grey2)] font-medium">Pool address</div>
            <input
              value={form.poolAddress}
              onChange={(e) => setForm((f) => ({ ...f, poolAddress: e.target.value }))}
              placeholder="0x…"
              className="w-full h-9 ax-field px-3 text-sm font-mono"
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs text-[var(--grey2)] font-medium">Token0 address</div>
            <input
              value={form.token0Address}
              onChange={(e) => setForm((f) => ({ ...f, token0Address: e.target.value }))}
              placeholder="0x…"
              className="w-full h-9 ax-field px-3 text-sm font-mono"
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs text-[var(--grey2)] font-medium">Token1 address</div>
            <input
              value={form.token1Address}
              onChange={(e) => setForm((f) => ({ ...f, token1Address: e.target.value }))}
              placeholder="0x…"
              className="w-full h-9 ax-field px-3 text-sm font-mono"
            />
          </label>
        </div>
      </div>

      <div className="ax-panel p-4 space-y-3">
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
            Tip: token addresses will return the token metadata + pools that include it (if already registered).
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

