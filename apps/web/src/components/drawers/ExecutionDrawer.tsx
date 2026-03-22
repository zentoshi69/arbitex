"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { useWs } from "@/components/layout/Providers";
import { StateBadge, ProfitCell, AddressCell, Skeleton } from "@/components/ui";
import { X, PlayCircle, ExternalLink, Clock, Fuel, Hash } from "lucide-react";
import { txExplorerUrl } from "@/lib/explorer";

type Props = {
  executionId: string;
  onClose: () => void;
};

const LIFECYCLE: string[] = [
  "PENDING", "SIMULATING", "SIGNING", "SUBMITTED", "CONFIRMING", "LANDED",
];

function LifecycleBar({ currentState }: { currentState: string }) {
  const isFailed = currentState === "FAILED" || currentState === "CANCELLED";
  const currentIdx = LIFECYCLE.indexOf(currentState);

  return (
    <div className="flex items-center gap-1">
      {LIFECYCLE.map((step, idx) => {
        const done = !isFailed && currentIdx > idx;
        const active = !isFailed && currentIdx === idx;
        const future = isFailed || currentIdx < idx;
        return (
          <div key={step} className="flex items-center gap-1 flex-1 min-w-0">
            <div className="flex-1 flex flex-col items-center gap-1">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                done ? "bg-emerald-500" :
                active ? "bg-slate-300 ring-2 ring-slate-300/25" :
                isFailed && idx === currentIdx ? "bg-red-500" :
                "bg-slate-700"
              }`} />
              <span className={`text-[9px] font-mono leading-none ${
                done ? "text-emerald-500" : active ? "text-slate-200" : "text-slate-600"
              }`}>
                {step.slice(0, 4)}
              </span>
            </div>
            {idx < LIFECYCLE.length - 1 && (
              <div className={`h-px flex-1 mb-3 ${done ? "bg-emerald-700" : "bg-slate-800"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ExecutionDrawer({ executionId, onClose }: Props) {
  const { on } = useWs();

  const { data: exec, isLoading, refetch } = useQuery({
    queryKey: ["execution", executionId],
    queryFn: () => api.executions.get(executionId),
    refetchInterval: 3_000,
  });

  useEffect(() => {
    const off = on("execution:update", (data) => {
      if (data.id === executionId) refetch();
    });
    return off;
  }, [on, executionId, refetch]);

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={onClose} />
      <div
        className="fixed right-0 top-0 h-full w-[520px] z-50 overflow-y-auto"
        style={{ background: "var(--ax-bg-panel)", borderLeft: "1px solid var(--ax-border)" }}
      >

        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 sticky top-0"
          style={{ borderBottom: "1px solid var(--ax-border)", background: "var(--ax-bg-panel)" }}
        >
          <div className="flex items-center gap-2">
            <PlayCircle className="w-4 h-4 text-emerald-400" />
            <h2 className="font-semibold text-white text-sm">Execution Detail</h2>
            {exec && <StateBadge state={exec.state} />}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : exec ? (
          <div className="p-5 space-y-6">

            {/* ID */}
            <p className="text-[11px] text-slate-500 font-mono">{exec.id}</p>

            {/* Lifecycle */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Lifecycle
              </h3>
              <LifecycleBar currentState={exec.state} />
              {(exec.state === "FAILED" || exec.state === "CANCELLED") && exec.failureReason && (
                <div className="mt-3 px-3 py-2 bg-red-950/50 border border-red-900 rounded-lg">
                  <p className="text-xs font-semibold text-red-400 mb-1">
                    {exec.failureCode ?? "FAILED"}
                  </p>
                  <p className="text-xs text-red-300 font-mono break-all">{exec.failureReason}</p>
                </div>
              )}
            </div>

            {/* Trade */}
            {exec.opportunity && (
              <div
                className="rounded-[2px] p-4 space-y-2 border"
                style={{ background: "rgba(255,255,255,0.03)", borderColor: "var(--ax-border)" }}
              >
                <p className="text-lg font-bold text-white">
                  {exec.opportunity.tokenInSymbol} → {exec.opportunity.tokenOutSymbol}
                </p>
                <p className="text-xs text-slate-400">
                  {exec.opportunity.buyVenueName} → {exec.opportunity.sellVenueName}
                </p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-slate-400">Expected PnL</span>
                  <ProfitCell value={Number(exec.opportunity.netProfitUsd)} />
                </div>
                {exec.pnlUsd !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Realized PnL (net)</span>
                    <ProfitCell value={Number(exec.pnlUsd)} />
                  </div>
                )}
                <p className="text-[10px] text-slate-500 pt-2 leading-relaxed">
                  PnL = token round-trip vs. size you put in, minus gas (see Gas Cost). On Snowtrace, <strong>Value</strong> is
                  native AVAX only — open the tx → <strong>ERC-20</strong> token transfers for real swap notionals.
                </p>
              </div>
            )}

            {/* Transaction details */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Transaction
              </h3>
              <div className="space-y-2">
                {[
                  {
                    icon: Hash,
                    label: "Tx Hash",
                    value: exec.txHash ? (
                      <a
                        href={txExplorerUrl(exec.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[var(--ax-dim)] hover:text-[var(--ax-off-white)] font-mono text-xs"
                      >
                        {exec.txHash.slice(0, 18)}…
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : <span className="text-slate-600 text-xs">Pending</span>,
                  },
                  {
                    icon: Hash,
                    label: "Block",
                    value: <span className="font-mono text-xs text-slate-300">{exec.blockNumber ?? "—"}</span>,
                  },
                  {
                    icon: Hash,
                    label: "Wallet",
                    value: <AddressCell address={exec.walletAddress} />,
                  },
                  {
                    icon: Fuel,
                    label: "Gas Used",
                    value: <span className="font-mono text-xs text-slate-300">
                      {exec.gasUsed ? Number(exec.gasUsed).toLocaleString() : "—"}
                    </span>,
                  },
                  {
                    icon: Fuel,
                    label: "Gas Cost",
                    value: <span className="font-mono text-xs text-slate-300">
                      {exec.gasCostUsd !== null ? `$${Number(exec.gasCostUsd).toFixed(6)}` : "—"}
                    </span>,
                  },
                  {
                    icon: Clock,
                    label: "Submitted",
                    value: <span className="text-xs text-slate-400">
                      {exec.submittedAt ? new Date(exec.submittedAt).toLocaleString() : "—"}
                    </span>,
                  },
                  {
                    icon: Clock,
                    label: "Confirmed",
                    value: <span className="text-xs text-slate-400">
                      {exec.confirmedAt ? new Date(exec.confirmedAt).toLocaleString() : "—"}
                    </span>,
                  },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-3 h-3 text-slate-600" />
                      <span className="text-xs text-slate-400">{label}</span>
                    </div>
                    {value}
                  </div>
                ))}
              </div>
            </div>

            {/* Raw transactions */}
            {exec.transactions?.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Raw Transactions ({exec.transactions.length})
                </h3>
                <div className="space-y-2">
                  {exec.transactions.map((tx: any, i: number) => (
                    <div
                      key={tx.id}
                      className="rounded-[2px] px-3 py-2 space-y-1 border"
                      style={{ background: "rgba(255,255,255,0.03)", borderColor: "var(--ax-border)" }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono text-slate-400">Nonce {tx.nonce}</span>
                        <span className="text-[11px] text-slate-500">
                          {new Date(tx.submittedAt).toLocaleTimeString()}
                        </span>
                      </div>
                      {tx.bundleHash && (
                        <p className="text-[10px] font-mono text-slate-500 truncate">
                          Bundle: {tx.bundleHash}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Route steps */}
            {exec.opportunity?.routes?.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Route Steps
                </h3>
                <div className="space-y-2">
                  {exec.opportunity.routes.map((r: any) => (
                    <div key={r.id} className="flex items-center gap-2 text-xs">
                      <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400">
                        {r.stepIndex + 1}
                      </span>
                      <span className="text-slate-300">{r.tokenIn.slice(0, 6)}…</span>
                      <span className="text-slate-600">→</span>
                      <span className="text-slate-300">{r.tokenOut.slice(0, 6)}…</span>
                      <span className="text-slate-500">via</span>
                      <span className="text-[var(--ax-off-white)]">{r.venueName}</span>
                      <span className="ml-auto text-slate-500 font-mono">{r.feeBps} bps</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Retry count */}
            {exec.retryCount > 0 && (
              <div className="flex items-center justify-between px-3 py-2 bg-amber-950/30 border border-amber-900/50 rounded-lg">
                <span className="text-xs text-amber-400">Retry attempts</span>
                <span className="text-xs font-bold font-mono text-amber-300">{exec.retryCount}</span>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
