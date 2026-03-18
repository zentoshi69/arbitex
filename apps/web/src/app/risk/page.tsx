"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useWs } from "@/components/layout/Providers";
import { SectionHeader, SeverityBadge, Skeleton } from "@/components/ui";
import { ShieldAlert, ToggleLeft, ToggleRight, Save, AlertTriangle } from "lucide-react";

// ── Risk parameter form ───────────────────────────────────────────────────────
function RiskConfigForm({ config }: { config: Record<string, number> }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(config);
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: Record<string, number>) => api.risk.updateConfig(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["risk", "config"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const FIELDS: Array<{
    key: keyof typeof form;
    label: string;
    description: string;
    unit: string;
    min: number;
    step: number;
  }> = [
    { key: "minNetProfitUsd", label: "Min Net Profit", description: "Minimum net profit to execute a trade", unit: "$", min: 0.01, step: 0.5 },
    { key: "maxTradeSizeUsd", label: "Max Trade Size", description: "Maximum USD per single trade", unit: "$", min: 100, step: 100 },
    { key: "maxTokenExposureUsd", label: "Max Token Exposure", description: "Max simultaneous exposure per token", unit: "$", min: 1000, step: 1000 },
    { key: "minPoolLiquidityUsd", label: "Min Pool Liquidity", description: "Minimum pool TVL to trade against", unit: "$", min: 10000, step: 10000 },
    { key: "maxGasGwei", label: "Max Gas Price", description: "Gas price ceiling — pause if exceeded", unit: "Gwei", min: 10, step: 5 },
    { key: "maxFailedTxPerHour", label: "Max Failed TX/Hour", description: "Auto-triggers global kill if exceeded", unit: "tx/hr", min: 1, step: 1 },
    { key: "maxSlippageBps", label: "Max Slippage", description: "Maximum tolerated slippage per DEX", unit: "bps", min: 5, step: 5 },
    { key: "tokenCooldownSeconds", label: "Token Cooldown", description: "Cooldown period after token anomaly", unit: "sec", min: 30, step: 30 },
  ];

  return (
    <div className="ax-panel">
      <div className="px-5 py-4 border-b border-[var(--ax-border)]">
        <h2 className="text-sm font-semibold text-white">Risk Parameters</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Changes take effect immediately on next evaluation. All changes are audited.
        </p>
      </div>
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        {FIELDS.map(({ key, label, description, unit, min, step }) => (
          <div key={key} className="space-y-1">
            <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
              {label}
              <span className="text-slate-500 font-normal text-[11px]">{unit}</span>
            </label>
            <input
              type="number"
              value={form[key] ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, [key]: parseFloat(e.target.value) }))
              }
              min={min}
              step={step}
              className="w-full ax-field px-3 py-1.5 text-sm font-mono"
            />
            <p className="text-[11px] text-slate-500">{description}</p>
          </div>
        ))}
      </div>
      <div className="px-5 py-4 border-t border-[var(--ax-border)] flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Requires ADMIN role. Change is logged to audit trail.
        </p>
        <button
          onClick={() => mutation.mutate(form as any)}
          disabled={mutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--ax-red)] hover:opacity-90 disabled:opacity-60 rounded-[2px] text-sm font-medium text-white transition-colors"
        >
          <Save className="w-3.5 h-3.5" />
          {mutation.isPending ? "Saving…" : saved ? "Saved ✓" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

// ── Kill switch panel ─────────────────────────────────────────────────────────
function KillSwitchPanel({ switches }: { switches: Record<string, boolean> }) {
  const qc = useQueryClient();
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ key, active }: { key: string; active: boolean }) =>
      api.risk.setKillSwitch(key, active, active ? "Manual activation from dashboard" : undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["risk", "kill-switches"] }),
  });

  const SWITCH_LABELS: Record<string, { label: string; description: string; danger: boolean }> = {
    GLOBAL: { label: "Global Kill Switch", description: "Halts ALL detection and execution immediately", danger: true },
    CHAIN_1: { label: "Ethereum Mainnet", description: "Halts all activity on chain 1", danger: false },
    CHAIN_8453: { label: "Base Network", description: "Halts all activity on Base", danger: false },
    CHAIN_42161: { label: "Arbitrum One", description: "Halts all activity on Arbitrum", danger: false },
  };

  return (
    <div className="ax-panel">
      <div className="px-5 py-4 border-b border-[var(--ax-border)]">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-400" />
          Kill Switches
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Instant halts — take effect on next evaluation cycle.
        </p>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--ax-border)" }}>
        {Object.entries(switches).map(([key, active]) => {
          const meta = SWITCH_LABELS[key] ?? { label: key, description: "", danger: false };
          return (
            <div
              key={key}
              className={`flex items-center justify-between px-5 py-4 ${
                active ? "bg-red-950/30" : ""
              }`}
            >
              <div>
                <p className={`text-sm font-medium ${active ? "text-red-300" : "text-slate-200"}`}>
                  {meta.label}
                  {active && (
                    <span className="ml-2 text-[10px] font-bold text-red-400 bg-red-900/60 px-1.5 py-0.5 rounded">
                      ACTIVE
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>
              </div>
              <button
                onClick={() => {
                  if (!active && meta.danger) {
                    setConfirmKey(key);
                  } else {
                    mutation.mutate({ key, active: !active });
                  }
                }}
                disabled={mutation.isPending}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  active
                    ? "bg-emerald-800 hover:bg-emerald-700 text-emerald-200"
                    : meta.danger
                      ? "bg-red-900 hover:bg-red-800 text-red-200"
                      : "bg-orange-900 hover:bg-orange-800 text-orange-200"
                }`}
              >
                {active ? (
                  <><ToggleRight className="w-3.5 h-3.5" /> Deactivate</>
                ) : (
                  <><ToggleLeft className="w-3.5 h-3.5" /> Activate</>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Confirm modal for GLOBAL kill */}
      {confirmKey && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/70">
          <div className="ax-panel p-6 w-96 shadow-2xl" style={{ borderColor: "rgba(232,65,66,0.35)" }}>
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-400" />
              <h3 className="text-lg font-bold text-white">Activate Global Kill Switch?</h3>
            </div>
            <p className="text-sm text-slate-300 mb-6">
              This will immediately halt ALL opportunity detection and execution across
              all chains. Confirm this action — it will be logged to the audit trail.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmKey(null)}
                className="flex-1 py-2 ax-btn text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  mutation.mutate({ key: confirmKey, active: true });
                  setConfirmKey(null);
                }}
                className="flex-1 py-2 ax-btn-primary text-sm font-bold transition-colors"
              >
                Activate Kill Switch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Risk events feed ──────────────────────────────────────────────────────────
function RiskEventsFeed() {
  const { on } = useWs();
  const qc = useQueryClient();
  const { data: events, isLoading } = useQuery({
    queryKey: ["risk", "events"],
    queryFn: () => api.risk.events(),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const off = on("risk:alert", () =>
      qc.invalidateQueries({ queryKey: ["risk", "events"] })
    );
    return off;
  }, [on, qc]);

  return (
    <div className="ax-panel">
      <div className="px-5 py-4 border-b border-[var(--ax-border)]">
        <h2 className="text-sm font-semibold text-white">Recent Risk Events</h2>
      </div>
      <div className="divide-y max-h-80 overflow-y-auto" style={{ borderColor: "rgba(30,30,28,0.6)" }}>
        {isLoading && <div className="p-4"><Skeleton className="h-8" /></div>}
        {!isLoading && (!events || events.length === 0) && (
          <p className="text-center text-slate-500 text-xs py-8">No risk events</p>
        )}
        {events?.map((evt: any) => (
          <div key={evt.id} className="flex items-start gap-3 px-4 py-3">
            <SeverityBadge severity={evt.severity} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono text-slate-300">{evt.eventType}</p>
              {evt.token && (
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Token: {evt.token.symbol} ({evt.token.address.slice(0, 10)}…)
                </p>
              )}
            </div>
            <span className="text-[11px] text-slate-500 font-mono flex-shrink-0">
              {new Date(evt.createdAt).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RiskPage() {
  const { data: riskConfig, isLoading: configLoading } = useQuery({
    queryKey: ["risk", "config"],
    queryFn: () => api.risk.config(),
  });

  const { data: killSwitches, isLoading: ksLoading } = useQuery({
    queryKey: ["risk", "kill-switches"],
    queryFn: () => api.risk.killSwitches(),
    refetchInterval: 5_000,
  });

  return (
    <div className="space-y-6 max-w-[1200px]">
      <SectionHeader
        title="Risk Controls"
        description="Configure limits, kill switches, and monitor risk events"
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {configLoading ? (
            <Skeleton className="h-96" />
          ) : riskConfig ? (
            <RiskConfigForm config={riskConfig} />
          ) : null}
          <RiskEventsFeed />
        </div>
        <div>
          {ksLoading ? (
            <Skeleton className="h-64" />
          ) : killSwitches ? (
            <KillSwitchPanel switches={killSwitches} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
