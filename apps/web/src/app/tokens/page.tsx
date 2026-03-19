"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { SectionHeader, EmptyState, Skeleton, AddressCell } from "@/components/ui";
import { Search, Shield, ShieldOff, RefreshCw, ToggleLeft, ToggleRight } from "lucide-react";

const ALL_FLAGS = [
  "FEE_ON_TRANSFER",
  "REBASING",
  "HONEYPOT_SUSPICION",
  "PAUSED_TRANSFERS",
  "BLACKLISTED",
];

const FLAG_COLORS: Record<string, string> = {
  FEE_ON_TRANSFER:   "bg-[rgba(249,115,22,0.08)] text-[#F97316] border-[rgba(249,115,22,0.2)]",
  REBASING:          "bg-[rgba(255,255,255,0.03)] text-[var(--offwhite)] border border-[var(--border)]",
  HONEYPOT_SUSPICION:"bg-[rgba(232,65,66,0.08)] text-[var(--red)] border-[rgba(232,65,66,0.2)]",
  PAUSED_TRANSFERS:  "bg-[rgba(245,158,11,0.08)] text-[#F59E0B] border-[rgba(245,158,11,0.2)]",
  BLACKLISTED:       "bg-[rgba(232,65,66,0.08)] text-[var(--red)] border-[rgba(232,65,66,0.2)]",
};

function FlagBadge({ flag }: { flag: string }) {
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-semibold font-mono ${FLAG_COLORS[flag] ?? "bg-[var(--bg3)] text-[var(--grey1)] border-[var(--border)]"}`}>
      {flag.replace(/_/g, " ")}
    </span>
  );
}

function FlagEditor({ token, onClose }: { token: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [flags, setFlags] = useState<string[]>(token.flags ?? []);

  const mutation = useMutation({
    mutationFn: (newFlags: string[]) => api.tokens.updateFlags(token.id, newFlags),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tokens"] });
      onClose();
    },
  });

  const toggle = (flag: string) => {
    setFlags((prev) =>
      prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag]
    );
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/70">
      <div className="ax-panel p-6 w-[420px] shadow-2xl">
        <h3 className="font-semibold text-[var(--offwhite)] mb-1">Edit Token Flags</h3>
        <p className="text-xs text-[var(--grey1)] mb-4">
          <span className="font-semibold text-[var(--offwhite)]">{token.symbol}</span>
          {" · "}
          <AddressCell address={token.address} />
        </p>
        <div className="space-y-2 mb-6">
          {ALL_FLAGS.map((flag) => (
            <label
              key={flag}
              className="flex items-center gap-3 px-3 py-2.5 rounded-[2px] cursor-pointer transition-colors border hover:opacity-90"
              style={{ background: "rgba(255,255,255,0.03)", borderColor: "var(--ax-border)" }}
            >
              <input
                type="checkbox"
                checked={flags.includes(flag)}
                onChange={() => toggle(flag)}
                className="w-4 h-4 rounded border-[var(--border)] bg-[var(--bg3)] text-[var(--offwhite)] focus:ring-[var(--grey2)] focus:ring-offset-0"
              />
              <div className="flex-1">
                <FlagBadge flag={flag} />
                <p className="text-[11px] text-[var(--grey2)] mt-0.5">
                  {flag === "FEE_ON_TRANSFER" && "Token deducts fee on each transfer — breaks arb math"}
                  {flag === "REBASING" && "Supply changes dynamically — unpredictable balances"}
                  {flag === "HONEYPOT_SUSPICION" && "Sell simulation failed — cannot exit position"}
                  {flag === "PAUSED_TRANSFERS" && "transferFrom() currently reverted — frozen token"}
                  {flag === "BLACKLISTED" && "Manually blacklisted by operator — never trade"}
                </p>
              </div>
            </label>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 ax-btn text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate(flags)}
            disabled={mutation.isPending}
            className="flex-1 py-2 ax-btn-primary disabled:opacity-60 text-sm font-medium transition-colors"
          >
            {mutation.isPending ? "Saving…" : "Save Flags"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TokensPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editingToken, setEditingToken] = useState<any | null>(null);

  const { data: tokens, isLoading } = useQuery({
    queryKey: ["tokens"],
    queryFn: () => api.tokens.list(),
    refetchInterval: 30_000,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      api.tokens.toggle(id, isEnabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tokens"] }),
  });

  const items = (tokens?.items ?? tokens ?? []).filter((t: any) =>
    search
      ? `${t.symbol} ${t.name} ${t.address}`.toLowerCase().includes(search.toLowerCase())
      : true
  );

  return (
    <div className="space-y-4 max-w-[1200px]">
      <SectionHeader
        title="Tokens"
        description="Token registry with screening flags and enable/disable controls"
      />

      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--grey2)]" />
          <input
            type="text"
            placeholder="Search symbol, address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 ax-field text-sm w-52"
          />
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["tokens"] })}
          className="flex items-center gap-1.5 px-3 py-1.5 ax-btn text-xs transition-colors"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
        <span className="ml-auto text-xs text-[var(--grey2)]">{items.length} tokens</span>
      </div>

      <div className="ax-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className="text-left">Token</th>
                <th className="text-left">Address</th>
                <th className="text-right">Decimals</th>
                <th className="text-left">Flags</th>
                <th className="text-left">Last Screened</th>
                <th className="text-left">Status</th>
                <th className="text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                  <td key={j}><Skeleton className="h-4 w-full" /></td>
                ))}</tr>
              ))}
              {!isLoading && items.length === 0 && (
                <tr><td colSpan={7}><EmptyState message="No tokens in registry" /></td></tr>
              )}
              {items.map((token: any) => (
                <tr key={token.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[var(--bg3)] flex items-center justify-center text-[10px] font-bold text-[var(--offwhite)]">
                        {token.symbol?.slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[var(--offwhite)]">{token.symbol}</p>
                        <p className="text-[11px] text-[var(--grey2)]">{token.name}</p>
                      </div>
                    </div>
                  </td>
                  <td><AddressCell address={token.address} /></td>
                  <td className="text-right font-mono text-sm text-[var(--grey1)]">{token.decimals}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {token.flags?.length > 0
                        ? token.flags.map((f: string) => <FlagBadge key={f} flag={f} />)
                        : <span className="text-xs text-[var(--grey3)]">none</span>
                      }
                    </div>
                  </td>
                  <td className="text-xs text-[var(--grey2)] font-mono">
                    {token.lastScreened
                      ? new Date(token.lastScreened).toLocaleDateString()
                      : "never"}
                  </td>
                  <td>
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${
                      token.isEnabled ? "text-[#4DD68C]" : "text-[var(--red)]"
                    }`}>
                      {token.isEnabled
                        ? <><Shield className="w-3 h-3" /> Active</>
                        : <><ShieldOff className="w-3 h-3" /> Disabled</>
                      }
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          toggleMutation.mutate({
                            id: token.id,
                            isEnabled: !token.isEnabled,
                          })
                        }
                        disabled={toggleMutation.isPending}
                        className={`flex items-center gap-1 text-xs px-2 py-1 rounded-[2px] transition-colors ${
                          token.isEnabled
                            ? "bg-[rgba(232,65,66,0.08)] text-[var(--grey1)] hover:text-[var(--red)]"
                            : "bg-[rgba(77,214,140,0.08)] text-[#4DD68C]"
                        }`}
                      >
                        {token.isEnabled ? (
                          <><ToggleRight className="w-3 h-3" /> Disable</>
                        ) : (
                          <><ToggleLeft className="w-3 h-3" /> Enable</>
                        )}
                      </button>
                      <button
                        onClick={() => setEditingToken(token)}
                        className="text-xs px-2.5 py-1 ax-btn transition-colors"
                      >
                        Flags
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingToken && (
        <FlagEditor token={editingToken} onClose={() => setEditingToken(null)} />
      )}
    </div>
  );
}
