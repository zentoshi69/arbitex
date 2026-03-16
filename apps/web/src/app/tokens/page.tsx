"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { SectionHeader, EmptyState, Skeleton, AddressCell } from "@/components/ui";
import { Search, Shield, ShieldOff, RefreshCw } from "lucide-react";

const ALL_FLAGS = [
  "FEE_ON_TRANSFER",
  "REBASING",
  "HONEYPOT_SUSPICION",
  "PAUSED_TRANSFERS",
  "BLACKLISTED",
];

const FLAG_COLORS: Record<string, string> = {
  FEE_ON_TRANSFER:   "bg-orange-900/40 text-orange-300 border-orange-800",
  REBASING:          "bg-blue-900/40 text-blue-300 border-blue-800",
  HONEYPOT_SUSPICION:"bg-red-900/60 text-red-200 border-red-700",
  PAUSED_TRANSFERS:  "bg-amber-900/40 text-amber-300 border-amber-800",
  BLACKLISTED:       "bg-red-950 text-red-400 border-red-900",
};

function FlagBadge({ flag }: { flag: string }) {
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-semibold font-mono ${FLAG_COLORS[flag] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
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
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-[420px] shadow-2xl">
        <h3 className="font-semibold text-white mb-1">Edit Token Flags</h3>
        <p className="text-xs text-slate-400 mb-4">
          <span className="font-semibold text-slate-200">{token.symbol}</span>
          {" · "}
          <AddressCell address={token.address} />
        </p>
        <div className="space-y-2 mb-6">
          {ALL_FLAGS.map((flag) => (
            <label
              key={flag}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-800/60 cursor-pointer hover:bg-slate-800 transition-colors"
            >
              <input
                type="checkbox"
                checked={flags.includes(flag)}
                onChange={() => toggle(flag)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
              />
              <div className="flex-1">
                <FlagBadge flag={flag} />
                <p className="text-[11px] text-slate-500 mt-0.5">
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
            className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm text-slate-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate(flags)}
            disabled={mutation.isPending}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 rounded text-sm font-medium text-white transition-colors"
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
      api.tokens.updateFlags(id, []),
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
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search symbol, address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-600 w-52"
          />
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["tokens"] })}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs text-slate-300 transition-colors"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
        <span className="ml-auto text-xs text-slate-500">{items.length} tokens</span>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
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
                      <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300">
                        {token.symbol?.slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-200">{token.symbol}</p>
                        <p className="text-[11px] text-slate-500">{token.name}</p>
                      </div>
                    </div>
                  </td>
                  <td><AddressCell address={token.address} /></td>
                  <td className="text-right font-mono text-sm text-slate-400">{token.decimals}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {token.flags?.length > 0
                        ? token.flags.map((f: string) => <FlagBadge key={f} flag={f} />)
                        : <span className="text-xs text-slate-600">none</span>
                      }
                    </div>
                  </td>
                  <td className="text-xs text-slate-500 font-mono">
                    {token.lastScreened
                      ? new Date(token.lastScreened).toLocaleDateString()
                      : "never"}
                  </td>
                  <td>
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${
                      token.isEnabled ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {token.isEnabled
                        ? <><Shield className="w-3 h-3" /> Active</>
                        : <><ShieldOff className="w-3 h-3" /> Disabled</>
                      }
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => setEditingToken(token)}
                      className="text-xs px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-300 transition-colors"
                    >
                      Edit Flags
                    </button>
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
