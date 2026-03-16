"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { StateBadge, ProfitCell, AddressCell, Skeleton } from "@/components/ui";
import { X, Zap, ExternalLink } from "lucide-react";

type Props = {
  opportunityId: string;
  onClose: () => void;
};

export function OpportunityDrawer({ opportunityId, onClose }: Props) {
  const { data: opp, isLoading } = useQuery({
    queryKey: ["opportunity", opportunityId],
    queryFn: () => api.opportunities.get(opportunityId),
    refetchInterval: 3_000,
  });

  const handleSimulate = async () => {
    await api.opportunities.simulate(opportunityId);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[520px] bg-slate-900 border-l border-slate-800 z-50 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-slate-900">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-400" />
            <h2 className="font-semibold text-white text-sm">Opportunity Detail</h2>
            {opp && <StateBadge state={opp.state} />}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : opp ? (
          <div className="p-5 space-y-6">
            {/* ID + timestamps */}
            <div className="space-y-1">
              <p className="text-[11px] text-slate-500 font-mono">{opp.id}</p>
              <p className="text-xs text-slate-400">
                Detected: {new Date(opp.detectedAt).toLocaleString()}
                {opp.expiresAt && (
                  <> · Expires: {new Date(opp.expiresAt).toLocaleString()}</>
                )}
              </p>
            </div>

            {/* Token pair */}
            <div className="bg-slate-800/60 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold text-white">
                    {opp.tokenInSymbol} → {opp.tokenOutSymbol}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <AddressCell address={opp.tokenInAddress} />
                    <span className="text-slate-600">→</span>
                    <AddressCell address={opp.tokenOutAddress} />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">Net Profit</p>
                  <ProfitCell value={opp.netProfitUsd} />
                </div>
              </div>
            </div>

            {/* Route visualization */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Route
              </h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="px-2 py-1 bg-slate-800 rounded text-slate-300 font-mono text-xs">
                    BUY
                  </span>
                  <span className="text-slate-300">{opp.tokenInSymbol}</span>
                  <span className="text-slate-500">→</span>
                  <span className="text-slate-300">{opp.tokenOutSymbol}</span>
                  <span className="text-slate-500">on</span>
                  <span className="text-blue-400 font-medium">{opp.buyVenueName}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="px-2 py-1 bg-slate-800 rounded text-slate-300 font-mono text-xs">
                    SELL
                  </span>
                  <span className="text-slate-300">{opp.tokenOutSymbol}</span>
                  <span className="text-slate-500">→</span>
                  <span className="text-slate-300">{opp.tokenInSymbol}</span>
                  <span className="text-slate-500">on</span>
                  <span className="text-blue-400 font-medium">{opp.sellVenueName}</span>
                </div>
              </div>
            </div>

            {/* Profit waterfall */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Profit Breakdown
              </h3>
              <div className="space-y-1.5">
                {[
                  { label: "Gross Spread", value: opp.grossSpreadUsd, color: "text-emerald-400" },
                  { label: "− Gas Cost", value: -opp.gasEstimateUsd, color: "text-red-400" },
                  { label: "− Venue Fees", value: -opp.venueFeesUsd, color: "text-red-400" },
                  { label: "− Slippage Buffer", value: -opp.slippageBufferUsd, color: "text-red-400" },
                  { label: "− Failure Buffer", value: -opp.failureBufferUsd, color: "text-red-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">{label}</span>
                    <span className={`font-mono font-medium ${color}`}>
                      ${Math.abs(value).toFixed(4)}
                    </span>
                  </div>
                ))}
                <div className="border-t border-slate-700 pt-1.5 flex items-center justify-between text-sm font-bold">
                  <span className="text-white">= Net Profit</span>
                  <ProfitCell value={opp.netProfitUsd} />
                </div>
                <p className="text-right text-xs text-slate-500 font-mono">
                  {Number(opp.netProfitBps).toFixed(2)} bps
                </p>
              </div>
            </div>

            {/* Risk decision */}
            {opp.riskDecision && (
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Risk Decision
                </h3>
                <div className={`rounded-lg p-3 ${
                  opp.riskDecision.approved
                    ? "bg-emerald-950/60 border border-emerald-900"
                    : "bg-red-950/60 border border-red-900"
                }`}>
                  <p className={`text-sm font-bold ${
                    opp.riskDecision.approved ? "text-emerald-400" : "text-red-400"
                  }`}>
                    {opp.riskDecision.approved ? "✓ APPROVED" : "✗ BLOCKED"}
                  </p>
                  {opp.riskDecision.rejectionReasons?.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {opp.riskDecision.rejectionReasons.map((r: string, i: number) => (
                        <li key={i} className="text-xs text-red-300 font-mono">{r}</li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2 space-y-1">
                    {opp.riskDecision.checkedRules?.map((rule: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <span className={rule.passed ? "text-emerald-500" : "text-red-500"}>
                          {rule.passed ? "✓" : "✗"}
                        </span>
                        <span className="text-slate-400 font-mono">{rule.rule}</span>
                        {rule.detail && (
                          <span className="text-slate-500 truncate">{rule.detail}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Linked execution */}
            {opp.execution && (
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Execution
                </h3>
                <div className="bg-slate-800/60 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">State</span>
                    <StateBadge state={opp.execution.state} />
                  </div>
                  {opp.execution.txHash && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Tx Hash</span>
                      <a
                        href={`https://etherscan.io/tx/${opp.execution.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-400 font-mono hover:text-blue-300"
                      >
                        {opp.execution.txHash.slice(0, 14)}…
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                  {opp.execution.pnlUsd !== null && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Realized PnL</span>
                      <ProfitCell value={opp.execution.pnlUsd} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              {["DETECTED", "QUOTED", "SIMULATED"].includes(opp.state) && (
                <button
                  onClick={handleSimulate}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium text-white transition-colors"
                >
                  Run Dry-Run Simulation
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
