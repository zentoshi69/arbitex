"use client";

import { useState, useMemo } from "react";
import { useWallet, isCoreRdns, type DiscoveredWallet } from "./WalletProvider";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { avaxPublicClient } from "@/lib/chain";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import {
  Wallet,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  Unplug,
  Zap,
  AlertTriangle,
} from "lucide-react";

const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const TOKENS = {
  WAVAX: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
  WRP: "0xeF282B38D1ceAB52134CA2cc653a569435744687",
  USDC: "0xA7D7079b0FEAD91F3e65f86E8915Cb59c1a4C664",
} as const;

const INSTALL_LINKS: Record<string, string> = {
  core: "https://core.app/",
  metamask: "https://metamask.io/download/",
  trust: "https://trustwallet.com/browser-extension",
  phantom: "https://phantom.app/download",
};

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function BalanceBar({
  label,
  symbol,
  amount,
  usdValue,
  pct,
  color,
}: {
  label: string;
  symbol: string;
  amount: string;
  usdValue: string | null;
  pct: number;
  color: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: color }}
          />
          <span className="font-styrene text-[11px] text-[var(--offwhite)]">
            {label}
          </span>
        </div>
        <div className="text-right">
          <span className="font-mono text-[11px] text-[var(--offwhite)]">
            {amount}
          </span>
          <span className="ml-1.5 font-mono text-[9px] text-[var(--grey2)]">
            {symbol}
          </span>
        </div>
      </div>
      <div className="relative h-[4px] w-full rounded-full bg-[var(--bg)]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.max(2, pct)}%`, background: color }}
        />
      </div>
      {usdValue && (
        <div className="text-right font-mono text-[9px] text-[var(--grey2)]">
          ≈ {usdValue}
        </div>
      )}
    </div>
  );
}

function WalletIcon({ wallet, size = 20 }: { wallet: DiscoveredWallet; size?: number }) {
  if (wallet.info.icon) {
    return (
      <img
        src={wallet.info.icon}
        alt=""
        width={size}
        height={size}
        className="rounded-[3px]"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-[3px] bg-[var(--grey3)] font-mono text-[9px] text-[var(--grey1)]"
      style={{ width: size, height: size }}
    >
      {wallet.info.name.charAt(0).toUpperCase()}
    </div>
  );
}

export function WalletPanel() {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [copied, setCopied] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);

  const publicClient = avaxPublicClient;

  const balancesQ = useQuery({
    queryKey: ["wallet-balances", wallet.address],
    enabled: wallet.connected && !!wallet.address,
    refetchInterval: 15_000,
    staleTime: 10_000,
    queryFn: async () => {
      const addr = wallet.address as `0x${string}`;
      const [avaxBal, wrpBal, usdcBal] = await Promise.all([
        publicClient.getBalance({ address: addr }),
        publicClient.readContract({
          address: TOKENS.WRP as `0x${string}`,
          abi: ERC20_BALANCE_ABI,
          functionName: "balanceOf",
          args: [addr],
        }),
        publicClient.readContract({
          address: TOKENS.USDC as `0x${string}`,
          abi: ERC20_BALANCE_ABI,
          functionName: "balanceOf",
          args: [addr],
        }),
      ]);
      return {
        avax: Number(formatUnits(avaxBal, 18)),
        wrp: Number(formatUnits(wrpBal as bigint, 18)),
        usdc: Number(formatUnits(usdcBal as bigint, 6)),
      };
    },
  });

  const pricesQ = useQuery({
    queryKey: ["ui", "market-tokens-wallet"],
    queryFn: () => api.market.tokenPrices(),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const avaxPrice = pricesQ.data?.tokens?.AVAX?.usd ?? null;
  const wrpPrice = pricesQ.data?.tokens?.WRP?.usd ?? null;
  const bals = balancesQ.data;
  const avaxUsd = bals && avaxPrice ? bals.avax * avaxPrice : null;
  const wrpUsd = bals && wrpPrice ? bals.wrp * wrpPrice : null;
  const usdcUsd = bals?.usdc ?? null;
  const totalUsd = (avaxUsd ?? 0) + (wrpUsd ?? 0) + (usdcUsd ?? 0);
  const pctAvax = totalUsd > 0 ? ((avaxUsd ?? 0) / totalUsd) * 100 : 33;
  const pctWrp = totalUsd > 0 ? ((wrpUsd ?? 0) / totalUsd) * 100 : 33;
  const pctUsdc = totalUsd > 0 ? ((usdcUsd ?? 0) / totalUsd) * 100 : 33;

  const copyAddress = () => {
    if (wallet.address) {
      navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleConnect = async (w: DiscoveredWallet) => {
    setConnecting(w.info.uuid);
    try {
      await wallet.connect(w);
      setShowPicker(false);
    } catch {
      /* user rejected */
    } finally {
      setConnecting(null);
    }
  };

  const isWrongChain = wallet.connected && wallet.chainId !== 43114;

  return (
    <div className="relative flex h-full items-stretch">
      {/* ── Main button ──────────────────────────────────────────────────── */}
      <button
        onClick={() => {
          if (!wallet.connected) {
            setShowPicker((v) => !v);
            setOpen(false);
          } else {
            setOpen((v) => !v);
            setShowPicker(false);
          }
        }}
        className={cn(
          "flex items-center gap-2 border-l border-[var(--border)] px-4 transition-colors",
          wallet.connected
            ? "hover:bg-[rgba(255,255,255,0.03)]"
            : "hover:bg-[rgba(232,65,66,0.06)]"
        )}
      >
        {wallet.connected ? (
          <>
            <span
              className="h-[6px] w-[6px] rounded-full"
              style={{
                background: isWrongChain ? "#F59E0B" : "#4DD68C",
                boxShadow: isWrongChain
                  ? "0 0 8px rgba(245,158,11,0.4)"
                  : "0 0 8px rgba(77,214,140,0.4)",
              }}
            />
            <span className="font-mono text-[10px] text-[var(--offwhite)]">
              {shortAddr(wallet.address!)}
            </span>
            <ChevronDown
              className={cn(
                "h-3 w-3 text-[var(--grey2)] transition-transform",
                open && "rotate-180"
              )}
            />
          </>
        ) : (
          <>
            <Wallet className="h-3.5 w-3.5 text-[var(--red)]" />
            <span className="font-styrene text-[10px] uppercase tracking-[0.08em] text-[var(--red)]">
              Connect
            </span>
          </>
        )}
      </button>

      {/* ── Wallet picker (disconnected) ─────────────────────────────────── */}
      {showPicker && !wallet.connected && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowPicker(false)}
          />
          <div
            className="absolute right-0 top-full z-50 mt-1 w-[300px] border border-[var(--border)] bg-[var(--bg2)] shadow-2xl"
            style={{
              boxShadow:
                "0 24px 80px rgba(0,0,0,0.5), 0 0 1px rgba(232,65,66,0.3)",
            }}
          >
            <div className="absolute left-0 right-0 top-0 h-px bg-[var(--red)] opacity-50" />

            <div className="border-b border-[var(--border)] px-4 py-3">
              <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--grey2)]">
                Select Wallet
              </span>
            </div>

            {wallet.wallets.length > 0 ? (
              <div className="p-2">
                {wallet.wallets.map((w) => (
                  <button
                    key={w.info.uuid}
                    onClick={() => handleConnect(w)}
                    disabled={connecting !== null}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[2px] px-3 py-2.5 transition-colors",
                      "hover:bg-[rgba(255,255,255,0.04)]",
                      connecting === w.info.uuid && "opacity-60"
                    )}
                  >
                    <WalletIcon wallet={w} />
                    <span className="font-styrene text-[12px] text-[var(--offwhite)]">
                      {w.info.name}
                    </span>
                    {isCoreRdns(w.info.rdns) && (
                      <span className="ml-auto rounded-[2px] bg-[rgba(232,65,66,0.1)] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--red)]">
                        Recommended
                      </span>
                    )}
                    {connecting === w.info.uuid && (
                      <span className="ml-auto font-mono text-[9px] text-[var(--grey1)]">
                        Connecting…
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-4">
                <div className="flex items-center gap-2 text-[var(--grey1)]">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="font-styrene text-[11px]">
                    No wallets detected
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {[
                    { label: "Core (Avalanche)", url: INSTALL_LINKS.core },
                    { label: "MetaMask", url: INSTALL_LINKS.metamask },
                    { label: "Trust Wallet", url: INSTALL_LINKS.trust },
                    { label: "Phantom", url: INSTALL_LINKS.phantom },
                  ].map((item) => (
                    <a
                      key={item.label}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-[2px] px-3 py-2 font-mono text-[10px] text-[var(--grey1)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--offwhite)]"
                    >
                      <span>Install {item.label}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Connected dropdown ────────────────────────────────────────────── */}
      {open && wallet.connected && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 top-full z-50 mt-1 w-[340px] border border-[var(--border)] bg-[var(--bg2)] shadow-2xl"
            style={{
              boxShadow:
                "0 24px 80px rgba(0,0,0,0.5), 0 0 1px rgba(232,65,66,0.3)",
            }}
          >
            {/* Header */}
            <div className="relative border-b border-[var(--border)] p-4">
              <div className="absolute left-0 right-0 top-0 h-px bg-[var(--red)] opacity-50" />
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="font-mono text-[7.5px] uppercase tracking-[0.16em] text-[var(--grey2)]">
                      Connected
                    </div>
                    {wallet.activeWallet && (
                      <span className="font-mono text-[8px] text-[var(--grey1)]">
                        via {wallet.activeWallet.info.name}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="font-mono text-[13px] font-medium text-[var(--offwhite)]">
                      {shortAddr(wallet.address!)}
                    </span>
                    <button
                      onClick={copyAddress}
                      className="text-[var(--grey2)] transition-colors hover:text-[var(--offwhite)]"
                    >
                      {copied ? (
                        <Check className="h-3 w-3 text-[#4DD68C]" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                    <a
                      href={`https://snowtrace.io/address/${wallet.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--grey2)] transition-colors hover:text-[var(--offwhite)]"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-[5px] w-[5px] rounded-full"
                      style={{
                        background: isWrongChain ? "#F59E0B" : "#4DD68C",
                      }}
                    />
                    <span className="font-mono text-[9px] text-[var(--grey1)]">
                      {isWrongChain ? "Wrong Chain" : "Avalanche"}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[9px] text-[var(--grey2)]">
                    Chain {wallet.chainId}
                  </div>
                </div>
              </div>

              {isWrongChain && (
                <button
                  onClick={() => wallet.switchToAvalanche().catch(() => {})}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-[2px] bg-[rgba(245,158,11,0.12)] py-2 font-mono text-[10px] text-[#F59E0B] transition-colors hover:bg-[rgba(245,158,11,0.2)]"
                >
                  <Zap className="h-3 w-3" /> Switch to Avalanche C-Chain
                </button>
              )}
            </div>

            {/* Portfolio value */}
            <div className="border-b border-[var(--border)] px-4 py-3">
              <div className="font-mono text-[7.5px] uppercase tracking-[0.16em] text-[var(--grey2)]">
                Portfolio Value
              </div>
              <div className="mt-1 font-mono text-[22px] font-medium text-[var(--offwhite)]">
                {totalUsd > 0
                  ? `$${totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  : "—"}
              </div>
              {totalUsd > 0 && (
                <div className="mt-2.5 flex h-[6px] gap-[2px] overflow-hidden rounded-full">
                  <div
                    className="rounded-l-full transition-all duration-500"
                    style={{ width: `${pctAvax}%`, background: "#E84142" }}
                  />
                  <div
                    className="transition-all duration-500"
                    style={{ width: `${pctWrp}%`, background: "#4DD68C" }}
                  />
                  <div
                    className="rounded-r-full transition-all duration-500"
                    style={{ width: `${pctUsdc}%`, background: "#3B82F6" }}
                  />
                </div>
              )}
            </div>

            {/* Balances */}
            <div className="space-y-4 p-4">
              <BalanceBar
                label="AVAX"
                symbol="AVAX"
                amount={bals ? bals.avax.toFixed(4) : "—"}
                usdValue={avaxUsd ? `$${avaxUsd.toFixed(2)}` : null}
                pct={pctAvax}
                color="#E84142"
              />
              <BalanceBar
                label="WARP"
                symbol="WRP"
                amount={
                  bals
                    ? bals.wrp.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })
                    : "—"
                }
                usdValue={wrpUsd ? `$${wrpUsd.toFixed(2)}` : null}
                pct={pctWrp}
                color="#4DD68C"
              />
              <BalanceBar
                label="USDC"
                symbol="USDC"
                amount={bals ? bals.usdc.toFixed(2) : "—"}
                usdValue={usdcUsd ? `$${usdcUsd.toFixed(2)}` : null}
                pct={pctUsdc}
                color="#3B82F6"
              />
            </div>

            {/* Footer */}
            <div className="border-t border-[var(--border)] px-4 py-3">
              <button
                onClick={() => {
                  wallet.disconnect();
                  setOpen(false);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-[2px] border border-[var(--border)] bg-[rgba(255,255,255,0.02)] py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--grey1)] transition-colors hover:border-[var(--red)] hover:text-[var(--red)]"
              >
                <Unplug className="h-3 w-3" /> Disconnect
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
