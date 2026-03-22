"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionHeader, KpiCard, Skeleton, EmptyState, StateBadge } from "@/components/ui";
import { useTokenContext } from "@/contexts/TokenContext";

function fmtUsd(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtBps(v: number) {
  return `${v.toFixed(1)} bps`;
}

function confidenceColor(score: number): string {
  if (score >= 0.7) return "text-emerald-400";
  if (score >= 0.4) return "text-yellow-400";
  return "text-red-400";
}

function confidenceBar(score: number): string {
  if (score >= 0.7) return "bg-emerald-400";
  if (score >= 0.4) return "bg-yellow-400";
  return "bg-red-400";
}

export default function TradingBrainPage() {
  const { activeTokenId, isAll } = useTokenContext();
  const regimeQ = useQuery({
    queryKey: ["regime"],
    queryFn: () => api.regime.current(),
    refetchInterval: 10_000,
  });

  const venueQ = useQuery({
    queryKey: ["regime-venues"],
    queryFn: () => api.regime.venues(),
    refetchInterval: 10_000,
  });

  const pnlQ = useQuery({
    queryKey: ["pnl-summary"],
    queryFn: () => api.pnl.summary(),
    refetchInterval: 15_000,
  });

  const oppsQ = useQuery({
    queryKey: ["opportunities-recent", activeTokenId],
    queryFn: () => api.opportunities.list({
      limit: 15,
      page: 1,
      ...(!isAll ? { tokenId: activeTokenId } : {}),
    }),
    refetchInterval: 5_000,
  });

  const liqQ = useQuery({
    queryKey: ["liquidity-maps"],
    queryFn: () => api.regime.liquidityMaps(),
    refetchInterval: 60_000,
  });

  const regime = regimeQ.data;
  const pnl = pnlQ.data;
  const opps = oppsQ.data?.items ?? [];
  const venues: any[] = venueQ.data ?? [];
  const liqMaps: any[] = liqQ.data ?? [];

  const algoColor: Record<string, string> = {
    HALTED: "text-red-400",
    PASSIVE: "text-yellow-400",
    AGGRESSIVE: "text-emerald-400",
    TWAP: "text-blue-400",
  };

  const protocolLabel: Record<string, string> = {
    solidly_v2: "Solidly V2",
    uniswap_v2: "Uniswap V2",
    uniswap_v3: "Uniswap V3",
    algebra_v1: "Algebra CLMM",
  };

  const signals = regime?.signals as any;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <SectionHeader
        title="Trading Brain V2"
        description="Dynamic sizing · DexScreener-powered liquidity · Price impact modeling · Confidence scoring"
      />

      {/* Regime + Core KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {regimeQ.isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <div className="ax-panel p-4">
              <p className="text-[9px] text-[var(--ax-muted)] font-medium uppercase tracking-[0.14em]">Regime</p>
              <p className="text-xl font-bold mt-1 font-mono text-[var(--ax-white)]">
                {regime?.regime ?? "—"}
              </p>
              <p className={`text-xs mt-1 ${algoColor[regime?.config?.algorithm] ?? "text-slate-400"}`}>
                {regime?.config?.algorithm ?? "—"} · {regime?.config?.priority ?? "—"}
              </p>
            </div>
            <KpiCard
              label="Size Multiplier"
              value={regime?.config?.sizeMultiplier != null ? `${(regime.config.sizeMultiplier * 100).toFixed(0)}%` : "—"}
              sub={`Hurdle: ${regime?.config?.hurdleBps ?? "—"} bps`}
            />
            <KpiCard
              label="Win Rate"
              value={signals?.winRate != null ? `${signals.winRate.toFixed(0)}%` : "—"}
              sub={`Fail: ${signals?.failRatePercent?.toFixed(0) ?? "—"}%`}
              trend={signals?.winRate >= 70 ? "up" : signals?.winRate >= 40 ? "neutral" : "down"}
            />
            <KpiCard
              label="Today PnL"
              value={pnl ? `$${pnl.today.pnlUsd.toFixed(2)}` : "—"}
              sub={pnl ? `${pnl.today.tradeCount} trades` : undefined}
              trend={pnl?.today.pnlUsd > 0 ? "up" : pnl?.today.pnlUsd < 0 ? "down" : "neutral"}
            />
            <KpiCard
              label="DexScreener LP"
              value={signals?.dexScreenerLiquidityUsd != null ? fmtUsd(signals.dexScreenerLiquidityUsd) : "—"}
              sub={signals?.dexScreenerVolume24h != null ? `Vol: ${fmtUsd(signals.dexScreenerVolume24h)}` : undefined}
            />
          </>
        )}
      </div>

      {/* Brain Signals Dashboard */}
      {signals && (
        <div className="ax-panel p-4 space-y-3">
          <h3 className="text-xs font-semibold text-[var(--offwhite)] uppercase tracking-wider">Brain Signals</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SignalCard
              label="LP Depth Score"
              value={signals.lpDepthScore?.toFixed(0)}
              max={100}
              color={signals.lpDepthScore >= 50 ? "#4DD68C" : signals.lpDepthScore >= 25 ? "#F59E0B" : "#EF4444"}
            />
            <SignalCard
              label="Volatility (1h)"
              value={signals.volatility24h?.toFixed(2)}
              max={100}
              color={signals.volatility24h < 20 ? "#4DD68C" : signals.volatility24h < 50 ? "#F59E0B" : "#EF4444"}
            />
            <SignalCard
              label="Mean Spread"
              value={fmtBps(signals.spreadMeanBps ?? 0)}
              max={200}
              rawValue={signals.spreadMeanBps}
              color={signals.spreadMeanBps > 10 ? "#4DD68C" : signals.spreadMeanBps > 5 ? "#F59E0B" : "#EF4444"}
            />
            <SignalCard
              label="Trend"
              value={signals.trendDirection ?? "neutral"}
              color={signals.trendDirection === "up" ? "#4DD68C" : signals.trendDirection === "down" ? "#EF4444" : "#64748B"}
            />
          </div>
        </div>
      )}

      {/* Regime Description */}
      {regime?.config?.description && (
        <div className="ax-panel p-4 border-l-2 border-[var(--ax-red)]">
          <p className="text-sm text-[var(--offwhite)]">{regime.config.description}</p>
        </div>
      )}

      {/* Venue Intelligence */}
      <div className="ax-panel p-4 space-y-3">
        <h3 className="text-xs font-semibold text-[var(--offwhite)] uppercase tracking-wider">
          Venue Intelligence
        </h3>
        {venueQ.isLoading ? (
          <Skeleton className="h-32" />
        ) : venues.length === 0 ? (
          <EmptyState message="No venues configured" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {venues.map((v: any) => (
              <div key={v.venueId} className="bg-[rgba(255,255,255,0.02)] rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--offwhite)]">{v.venueName}</p>
                    <p className="text-[9px] text-[var(--grey2)] uppercase">
                      {protocolLabel[v.protocol] ?? v.protocol}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold ${
                    v.activePools > 0 ? "text-[#4DD68C]" : "text-[var(--grey2)]"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${v.activePools > 0 ? "bg-[#4DD68C]" : "bg-[var(--grey2)]"}`} />
                    {v.activePools}/{v.poolCount} live
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[9px] text-[var(--grey2)] uppercase">Liquidity</p>
                    <p className="text-sm font-mono text-[var(--offwhite)]">{fmtUsd(v.totalLiquidityUsd)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-[var(--grey2)] uppercase">Opps (1h)</p>
                    <p className="text-sm font-mono text-[var(--offwhite)]">{v.opportunityCount1h}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-[var(--grey2)] uppercase">Avg Spread</p>
                    <p className="text-sm font-mono text-[var(--offwhite)]">
                      {v.avgSpreadBps1h > 0 ? fmtBps(v.avgSpreadBps1h) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] text-[var(--grey2)] uppercase">Pools</p>
                    <p className="text-sm font-mono text-[var(--offwhite)]">{v.poolCount}</p>
                  </div>
                </div>

                {v.pools?.length > 0 && (
                  <div className="border-t border-[rgba(255,255,255,0.05)] pt-2 space-y-1">
                    {v.pools.map((p: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="font-mono text-[var(--grey1)]">{p.pair}</span>
                        <span className="font-mono text-[var(--grey2)]">
                          {p.liquidityUsd > 0 ? fmtUsd(p.liquidityUsd) : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Liquidity Maps */}
      <div className="ax-panel p-4 space-y-3">
        <h3 className="text-xs font-semibold text-[var(--offwhite)] uppercase tracking-wider">
          Liquidity Maps
        </h3>
        {liqQ.isLoading ? (
          <Skeleton className="h-24" />
        ) : liqMaps.length === 0 ? (
          <EmptyState message="No liquidity maps built yet — first scan runs on startup" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[9px] text-[var(--grey2)] uppercase tracking-wider border-b border-[var(--border)]">
                  <th className="text-left py-2 px-2">Pool</th>
                  <th className="text-left py-2 px-2">Venue</th>
                  <th className="text-left py-2 px-2">Type</th>
                  <th className="text-left py-2 px-2">Method</th>
                  <th className="text-right py-2 px-2">Positions</th>
                  <th className="text-right py-2 px-2">Ticks</th>
                  <th className="text-right py-2 px-2">Events</th>
                  <th className="text-right py-2 px-2">Block Range</th>
                  <th className="text-right py-2 px-2">Last Refresh</th>
                </tr>
              </thead>
              <tbody>
                {liqMaps.map((m: any) => {
                  const refreshAge = Math.round((Date.now() - new Date(m.refreshedAt).getTime()) / 60_000);
                  const refreshColor = refreshAge < 70 ? "text-[#4DD68C]" : refreshAge < 180 ? "text-[#F59E0B]" : "text-[var(--red)]";
                  return (
                    <tr key={m.poolId} className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)]">
                      <td className="py-2 px-2 font-mono font-semibold text-[var(--offwhite)]">{m.pair}</td>
                      <td className="py-2 px-2 text-[var(--grey1)]">{m.venue}</td>
                      <td className="py-2 px-2 text-xs text-[var(--grey2)] uppercase">{m.poolType}</td>
                      <td className="py-2 px-2">
                        {m.nftManagerUsed ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[rgba(77,214,140,0.12)] text-[#4DD68C]">
                            NFT
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.05)] text-[var(--grey2)]">
                            Pool
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-[var(--offwhite)]">{m.positionCount}</td>
                      <td className="py-2 px-2 text-right font-mono text-[var(--grey1)]">{m.tickCount ?? "—"}</td>
                      <td className="py-2 px-2 text-right font-mono text-[var(--grey1)]">{m.eventCount.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right font-mono text-[var(--grey2)] text-xs">
                        {m.scanFromBlock.toLocaleString()}→{m.scanToBlock.toLocaleString()}
                      </td>
                      <td className={`py-2 px-2 text-right font-mono text-xs ${refreshColor}`}>
                        {refreshAge < 60 ? `${refreshAge}m ago` : `${(refreshAge / 60).toFixed(1)}h ago`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Opportunity Pipeline with Confidence */}
      <div className="ax-panel p-4 space-y-3">
        <h3 className="text-xs font-semibold text-[var(--offwhite)] uppercase tracking-wider">
          Opportunity Pipeline
        </h3>
        {oppsQ.isLoading ? (
          <Skeleton className="h-40" />
        ) : opps.length === 0 ? (
          <EmptyState message="No opportunities detected yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[9px] text-[var(--grey2)] uppercase tracking-wider border-b border-[var(--border)]">
                  <th className="text-left py-2 px-2">Pair</th>
                  <th className="text-left py-2 px-2">Buy → Sell</th>
                  <th className="text-right py-2 px-2">Size</th>
                  <th className="text-right py-2 px-2">Spread</th>
                  <th className="text-right py-2 px-2">Net Profit</th>
                  <th className="text-center py-2 px-2">Confidence</th>
                  <th className="text-center py-2 px-2">State</th>
                  <th className="text-right py-2 px-2">Age</th>
                </tr>
              </thead>
              <tbody>
                {opps.map((o: any) => {
                  const age = Math.round((Date.now() - new Date(o.detectedAt).getTime()) / 1000);
                  const conf = o.confidenceScore ?? 0;
                  return (
                    <tr key={o.id} className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)]">
                      <td className="py-2 px-2 font-mono text-[var(--offwhite)]">
                        {o.tokenInSymbol}/{o.tokenOutSymbol}
                      </td>
                      <td className="py-2 px-2 text-[var(--grey1)] text-xs">
                        {o.buyVenueName} → {o.sellVenueName}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-[var(--grey2)] text-xs">
                        {fmtUsd(Number(o.tradeSizeUsd ?? 0))}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-[var(--grey1)]">
                        ${Number(o.grossSpreadUsd).toFixed(4)}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <span className={`font-mono font-semibold ${Number(o.netProfitUsd) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          ${Number(o.netProfitUsd).toFixed(4)}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center">
                        {conf > 0 ? (
                          <div className="flex items-center gap-1.5 justify-center">
                            <div className="w-12 h-1.5 rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
                              <div
                                className={`h-full rounded-full ${confidenceBar(conf)}`}
                                style={{ width: `${Math.min(conf * 100, 100)}%` }}
                              />
                            </div>
                            <span className={`text-xs font-mono ${confidenceColor(conf)}`}>
                              {(conf * 100).toFixed(0)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--grey2)]">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center"><StateBadge state={o.state} /></td>
                      <td className="py-2 px-2 text-right font-mono text-[var(--grey2)] text-xs">
                        {age < 60 ? `${age}s` : `${Math.round(age / 60)}m`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SignalCard({
  label,
  value,
  max,
  rawValue,
  color,
}: {
  label: string;
  value: string | number;
  max?: number;
  rawValue?: number;
  color: string;
}) {
  const barPct = max ? Math.min(100, ((rawValue ?? (typeof value === "number" ? value : 0)) / max) * 100) : 0;
  return (
    <div className="bg-[rgba(255,255,255,0.02)] rounded p-3">
      <p className="text-[9px] text-[var(--grey2)] uppercase tracking-wide">{label}</p>
      <p className="text-sm font-mono mt-1" style={{ color }}>{String(value)}</p>
      {max != null && (
        <div className="w-full h-1 rounded-full bg-[rgba(255,255,255,0.06)] mt-2 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${barPct}%`, backgroundColor: color }}
          />
        </div>
      )}
    </div>
  );
}
