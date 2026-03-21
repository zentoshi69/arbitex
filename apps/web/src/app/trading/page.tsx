"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { SectionHeader, Skeleton } from "@/components/ui";
import {
  Play,
  Square,
  Wallet,
  Settings2,
  Save,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  TrendingUp,
  Shield,
  Zap,
} from "lucide-react";

// ── Trading Status Banner ─────────────────────────────────────────────────────
function TradingBanner({
  status,
  onToggle,
}: {
  status: any;
  onToggle: () => void;
}) {
  const active = status.tradingEnabled && !status.mockExecution;
  const isMock = status.tradingEnabled && status.mockExecution;

  return (
    <div
      className={`ax-panel overflow-hidden ${
        active
          ? "ring-1 ring-emerald-500/30"
          : isMock
            ? "ring-1 ring-amber-500/30"
            : ""
      }`}
    >
      <div
        className={`px-6 py-5 flex items-center justify-between ${
          active
            ? "bg-[rgba(74,222,128,0.06)]"
            : isMock
              ? "bg-[rgba(245,158,11,0.06)]"
              : "bg-[rgba(232,65,66,0.04)]"
        }`}
      >
        <div className="flex items-center gap-4">
          <div
            className={`w-3 h-3 rounded-full ${
              active
                ? "bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]"
                : isMock
                  ? "bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse"
                  : "bg-red-400/60"
            }`}
          />
          <div>
            <h2
              className={`text-lg font-bold ${
                active
                  ? "text-emerald-400"
                  : isMock
                    ? "text-amber-400"
                    : "text-red-400"
              }`}
            >
              {active
                ? "TRADING ACTIVE"
                : isMock
                  ? "MOCK MODE"
                  : "TRADING STOPPED"}
            </h2>
            <p className="text-xs text-[var(--grey1)] mt-0.5">
              {active
                ? "Live execution enabled — trades are being submitted on-chain"
                : isMock
                  ? "Mock execution — opportunities detected but no real trades"
                  : "Global kill switch is active — no detection or execution"}
            </p>
          </div>
        </div>
        <button
          onClick={onToggle}
          className={`flex items-center gap-2 px-5 py-2.5 rounded text-sm font-bold transition-all ${
            status.tradingEnabled
              ? "bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30"
              : "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30"
          }`}
        >
          {status.tradingEnabled ? (
            <>
              <Square className="w-4 h-4" /> Stop Trading
            </>
          ) : (
            <>
              <Play className="w-4 h-4" /> Start Trading
            </>
          )}
        </button>
      </div>

      {/* Quick stats row */}
      <div className="px-6 py-3 flex items-center gap-6 border-t border-[var(--ax-border)] text-xs">
        <span className="flex items-center gap-1.5 text-[var(--grey1)]">
          <Shield className="w-3 h-3" />
          Wallet:{" "}
          {status.walletConfigured ? (
            <span className="text-emerald-400 font-mono">
              {status.walletAddress?.slice(0, 6)}...
              {status.walletAddress?.slice(-4)}
            </span>
          ) : (
            <span className="text-red-400">Not configured</span>
          )}
        </span>
        <span className="flex items-center gap-1.5 text-[var(--grey1)]">
          <Zap className="w-3 h-3" />
          Base size:{" "}
          <span className="text-white font-mono">
            ${status.riskConfig?.baseTradeSizeUsd?.toLocaleString()}
          </span>
        </span>
        <span className="flex items-center gap-1.5 text-[var(--grey1)]">
          <TrendingUp className="w-3 h-3" />
          24h executions:{" "}
          <span className="text-white font-mono">
            {status.recentExecutions24h}
          </span>
        </span>
      </div>
    </div>
  );
}

// ── Wallet Card ───────────────────────────────────────────────────────────────
function WalletCard({ status }: { status: any }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [pk, setPk] = useState("");
  const [showKey, setShowKey] = useState(false);

  const setWalletMut = useMutation({
    mutationFn: (key: string) => api.trading.setWallet(key),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trading", "status"] });
      setPk("");
      setShowForm(false);
    },
  });

  const removeMut = useMutation({
    mutationFn: () => api.trading.removeWallet(),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["trading", "status"] }),
  });

  return (
    <div className="ax-panel">
      <div className="px-5 py-4 border-b border-[var(--ax-border)] flex items-center gap-2">
        <Wallet className="w-4 h-4 text-[var(--grey1)]" />
        <h2 className="text-sm font-semibold text-white">Execution Wallet</h2>
      </div>
      <div className="p-5 space-y-4">
        {status.walletConfigured ? (
          <>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-emerald-400 font-medium">
                Connected
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--grey2)]">Address</span>
                <span className="text-xs font-mono text-[var(--offwhite)]">
                  {status.walletAddress}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--grey2)]">
                  AVAX Balance
                </span>
                <span className="text-xs font-mono text-[var(--offwhite)]">
                  {status.walletBalanceAvax !== null
                    ? `${status.walletBalanceAvax.toFixed(4)} AVAX`
                    : "—"}
                </span>
              </div>
            </div>
            {status.walletBalanceAvax !== null &&
              status.walletBalanceAvax < 0.1 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-[rgba(245,158,11,0.08)] rounded text-xs text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  Low balance — fund wallet to cover gas fees
                </div>
              )}
            <button
              onClick={() => removeMut.mutate()}
              disabled={removeMut.isPending}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Remove wallet
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-400/60" />
              <span className="text-sm text-[var(--grey1)]">
                No wallet configured
              </span>
            </div>
            <p className="text-xs text-[var(--grey2)]">
              Configure a wallet to enable live trading. You can paste a private
              key here or set{" "}
              <code className="text-[var(--offwhite)]">
                EXECUTION_WALLET_PRIVATE_KEY
              </code>{" "}
              in your server <code>.env</code> for maximum security.
            </p>
            {!showForm ? (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--ax-red)] hover:opacity-90 rounded-[2px] text-sm font-medium text-white transition-colors"
              >
                <Wallet className="w-3.5 h-3.5" />
                Configure Wallet
              </button>
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    value={pk}
                    onChange={(e) => setPk(e.target.value)}
                    placeholder="0x... private key"
                    className="w-full ax-field px-3 py-2 text-sm font-mono pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--grey2)] hover:text-white transition-colors"
                  >
                    {showKey ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {setWalletMut.isError && (
                  <p className="text-xs text-red-400">
                    {(setWalletMut.error as Error).message}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => setWalletMut.mutate(pk)}
                    disabled={!pk || setWalletMut.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 rounded text-sm font-medium transition-colors disabled:opacity-40"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {setWalletMut.isPending ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => {
                      setShowForm(false);
                      setPk("");
                    }}
                    className="px-4 py-2 text-sm text-[var(--grey1)] hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Trade Parameters Form ─────────────────────────────────────────────────────
function TradeParamsForm({ config }: { config: Record<string, number> }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(config);
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: Record<string, number>) => api.risk.updateConfig(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trading", "status"] });
      qc.invalidateQueries({ queryKey: ["risk", "config"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const FIELDS: Array<{
    key: string;
    label: string;
    description: string;
    unit: string;
    min: number;
    step: number;
  }> = [
    {
      key: "baseTradeSizeUsd",
      label: "Base Trade Size",
      description:
        "Trade size before regime adjustment (multiplied by regime sizeMultiplier)",
      unit: "$",
      min: 10,
      step: 100,
    },
    {
      key: "minNetProfitUsd",
      label: "Min Net Profit",
      description: "Minimum net profit to execute a trade",
      unit: "$",
      min: 0.01,
      step: 0.5,
    },
    {
      key: "maxTradeSizeUsd",
      label: "Max Trade Size (cap)",
      description: "Absolute maximum USD per single trade",
      unit: "$",
      min: 100,
      step: 100,
    },
    {
      key: "minPoolLiquidityUsd",
      label: "Min Pool Liquidity",
      description: "Minimum pool TVL to trade against",
      unit: "$",
      min: 1000,
      step: 5000,
    },
    {
      key: "maxGasGwei",
      label: "Max Gas Price",
      description: "Gas price ceiling — pause if exceeded",
      unit: "Gwei",
      min: 10,
      step: 5,
    },
    {
      key: "maxSlippageBps",
      label: "Max Slippage",
      description: "Maximum tolerated slippage per DEX",
      unit: "bps",
      min: 5,
      step: 5,
    },
  ];

  return (
    <div className="ax-panel">
      <div className="px-5 py-4 border-b border-[var(--ax-border)] flex items-center gap-2">
        <Settings2 className="w-4 h-4 text-[var(--grey1)]" />
        <h2 className="text-sm font-semibold text-white">Trade Parameters</h2>
      </div>
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        {FIELDS.map(({ key, label, description, unit, min, step }) => (
          <div key={key} className="space-y-1">
            <label className="text-xs font-medium text-[var(--offwhite)] flex items-center justify-between">
              {label}
              <span className="text-[var(--grey2)] font-normal text-[11px]">
                {unit}
              </span>
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
            <p className="text-[11px] text-[var(--grey2)]">{description}</p>
          </div>
        ))}
      </div>
      <div className="px-5 py-4 border-t border-[var(--ax-border)] flex items-center justify-between">
        <p className="text-xs text-[var(--grey2)]">
          Changes take effect on the next scan cycle (seconds).
        </p>
        <button
          onClick={() => mutation.mutate(form as any)}
          disabled={mutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--ax-red)] hover:opacity-90 disabled:opacity-60 rounded-[2px] text-sm font-medium text-white transition-colors"
        >
          <Save className="w-3.5 h-3.5" />
          {mutation.isPending ? "Saving..." : saved ? "Saved" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

// ── Regime Info ───────────────────────────────────────────────────────────────
function RegimeInfo({ riskConfig }: { riskConfig: any }) {
  const { data: regime } = useQuery({
    queryKey: ["regime"],
    queryFn: () => api.regime.current(),
    refetchInterval: 10_000,
  });

  if (!regime) return null;

  const sizeMultiplier = regime.config?.sizeMultiplier ?? 1;
  const hurdleBps = regime.config?.hurdleBps ?? 0;
  const adjustedSize = (riskConfig?.baseTradeSizeUsd ?? 5000) * sizeMultiplier;
  const adjustedMinProfit = (hurdleBps / 10_000) * adjustedSize;

  return (
    <div className="ax-panel">
      <div className="px-5 py-4 border-b border-[var(--ax-border)]">
        <h2 className="text-sm font-semibold text-white">
          Live Regime Adjustments
        </h2>
        <p className="text-xs text-[var(--grey1)] mt-0.5">
          The regime classifier automatically adjusts trade parameters based on
          market conditions.
        </p>
      </div>
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--grey2)]">Current Regime</span>
          <span
            className={`text-xs font-bold font-mono ${
              regime.regime === "LOW_VOL"
                ? "text-emerald-400"
                : regime.regime === "NORMAL"
                  ? "text-blue-400"
                  : regime.regime === "HIGH_VOL"
                    ? "text-amber-400"
                    : "text-red-400"
            }`}
          >
            {regime.regime}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--grey2)]">Size Multiplier</span>
          <span className="text-xs font-mono text-[var(--offwhite)]">
            {sizeMultiplier}x
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--grey2)]">Hurdle</span>
          <span className="text-xs font-mono text-[var(--offwhite)]">
            {hurdleBps} bps
          </span>
        </div>
        <div className="h-px bg-[var(--ax-border)]" />
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--grey2)] font-medium">
            Effective Trade Size
          </span>
          <span className="text-sm font-bold font-mono text-white">
            ${adjustedSize.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--grey2)] font-medium">
            Effective Min Profit
          </span>
          <span className="text-sm font-bold font-mono text-white">
            ${adjustedMinProfit.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Confirm Modal ────────────────────────────────────────────────────────────
function ConfirmModal({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/70">
      <div
        className="ax-panel p-6 w-[420px] shadow-2xl"
        style={{
          borderColor: danger
            ? "rgba(232,65,66,0.35)"
            : "rgba(74,222,128,0.35)",
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle
            className={`w-6 h-6 ${danger ? "text-[var(--red)]" : "text-emerald-400"}`}
          />
          <h3 className="text-lg font-bold text-white">{title}</h3>
        </div>
        <p className="text-sm text-[var(--offwhite)] mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 ax-btn text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2 text-sm font-bold rounded transition-colors ${
              danger
                ? "bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30"
                : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TradingPage() {
  const qc = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<
    "start" | "stop" | null
  >(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ["trading", "status"],
    queryFn: () => api.trading.status(),
    refetchInterval: 5_000,
  });

  const killMut = useMutation({
    mutationFn: ({ active }: { active: boolean }) =>
      api.risk.setKillSwitch(
        "GLOBAL",
        active,
        active ? "Trading stopped from dashboard" : "Trading started from dashboard"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trading", "status"] });
      qc.invalidateQueries({ queryKey: ["risk", "kill-switches"] });
    },
  });

  const handleToggle = () => {
    if (status?.tradingEnabled) {
      setConfirmAction("stop");
    } else {
      if (!status?.walletConfigured && !status?.mockExecution) {
        setConfirmAction("start");
      } else {
        setConfirmAction("start");
      }
    }
  };

  const executeToggle = () => {
    if (confirmAction === "stop") {
      killMut.mutate({ active: true });
    } else {
      killMut.mutate({ active: false });
    }
    setConfirmAction(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-[1200px]">
        <SectionHeader
          title="Trading"
          description="Control live trading, configure parameters, and manage your execution wallet"
        />
        <Skeleton className="h-32" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64" />
          <div className="lg:col-span-2">
            <Skeleton className="h-96" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      <SectionHeader
        title="Trading"
        description="Control live trading, configure parameters, and manage your execution wallet"
      />

      {status && (
        <TradingBanner status={status} onToggle={handleToggle} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          {status && <WalletCard status={status} />}
          {status && <RegimeInfo riskConfig={status.riskConfig} />}
        </div>
        <div className="lg:col-span-2">
          {status?.riskConfig && (
            <TradeParamsForm config={status.riskConfig} />
          )}
        </div>
      </div>

      {/* Confirm modals */}
      {confirmAction === "stop" && (
        <ConfirmModal
          title="Stop Trading?"
          message="This will activate the global kill switch and immediately halt all opportunity detection and execution. You can restart at any time."
          confirmLabel="Stop Trading"
          danger={true}
          onConfirm={executeToggle}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {confirmAction === "start" && (
        <ConfirmModal
          title="Start Trading?"
          message={
            !status?.walletConfigured && !status?.mockExecution
              ? "No wallet is configured. Trading will start in detection-only mode. Configure a wallet to enable live execution."
              : status?.mockExecution
                ? "Mock execution is enabled. Opportunities will be detected and simulated but NOT executed on-chain. Set MOCK_EXECUTION=false in your server env for live trades."
                : "This will deactivate the global kill switch and begin live trading. Real transactions will be submitted on-chain."
          }
          confirmLabel="Start Trading"
          danger={false}
          onConfirm={executeToggle}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
