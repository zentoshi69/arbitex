import { TerminalShell } from "@/components/TerminalShell";
import { Terminal, Line } from "@/components/Terminal";
import { Stat } from "@/components/Stat";
import { Sparkline } from "@/components/Sparkline";
import { AMM_VAULTS } from "@/lib/mock";
import { fmtUsd } from "@/lib/utils";

const tvlCurve = [4.2, 4.3, 4.5, 4.4, 4.7, 4.9, 5.0, 5.2, 5.4, 5.7, 5.9, 6.1, 6.4, 6.6, 6.9, 7.1];

export default function AmmTerminal() {
  return (
    <TerminalShell
      module="auto/amm"
      title="AUTO//AMM"
      accent="cyan"
      description="Concentrated liquidity vaults that auto-rebalance, harvest fees, and compound back into LP. Set range bias and exit guards. Set and forget."
      ascii={`     /\\\\        ,    ,
    /  \\\\   __/_\\__/_\\__
   /----\\\\__\\        /
  /      \\\\        \\\\__
 /________\\\\         \\\\
   AUTO//AMM`}
    >
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-6">
        <Stat label="TVL Managed" value={fmtUsd(23_162_000)} hint="across 4 vaults" accent="cyan" />
        <Stat label="Avg APR" value="158.7%" hint="incl. compound" accent="green" />
        <Stat label="Harvests / day" value="412" hint="auto-cron" accent="purple" />
        <Stat label="IL Hedged" value="92.4%" hint="oracle-bounded" accent="pink" />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Terminal title="auto://vaults" subtitle="positions" accent="cyan" className="lg:col-span-8">
          <div className="grid grid-cols-[1fr_120px_80px_80px_120px] gap-2 text-[11px] text-terminal-dim border-b border-sol-purple/15 pb-1">
            <span>Pair</span>
            <span className="text-right">TVL</span>
            <span className="text-right">APR</span>
            <span className="text-right">Range</span>
            <span className="text-right">Harvest</span>
          </div>
          {AMM_VAULTS.map((v) => (
            <div
              key={v.pair}
              className="grid grid-cols-[1fr_120px_80px_80px_120px] gap-2 text-[12.5px] py-1.5 border-b border-sol-purple/10"
            >
              <span className="text-white font-mono">{v.pair}</span>
              <span className="text-right text-sol-cyan">{fmtUsd(v.tvl)}</span>
              <span className="text-right text-sol-green">{v.apr.toFixed(1)}%</span>
              <span className="text-right text-terminal-dim">{v.range}</span>
              <span className="text-right text-terminal-dim">{v.harvest}</span>
            </div>
          ))}
          <div className="mt-3 font-mono text-[11px] text-terminal-dim flex flex-wrap gap-x-6 gap-y-1">
            <span>
              <span className="text-sol-green">▸</span> auto-rebalance: <span className="text-white">on price drift &gt; 6%</span>
            </span>
            <span>
              <span className="text-sol-green">▸</span> exit-guard: <span className="text-white">px deviation &gt; 25% vs Pyth</span>
            </span>
            <span>
              <span className="text-sol-green">▸</span> compound: <span className="text-white">100% of fees back to LP</span>
            </span>
          </div>
        </Terminal>

        <div className="lg:col-span-4 grid gap-5">
          <Terminal title="auto://tvl" subtitle="curve" accent="green" height="180px">
            <div className="flex items-end justify-between">
              <div>
                <div className="font-mono text-[10px] text-terminal-dim uppercase tracking-[0.18em]">
                  TVL last 16d
                </div>
                <div className="font-display text-3xl text-sol-green glow-text-green">$23.16M</div>
              </div>
              <Sparkline values={tvlCurve} color="#14F195" width={170} height={64} />
            </div>
          </Terminal>
          <Terminal title="auto://il-hedge" subtitle="impermanent loss" accent="pink" height="180px">
            <Line prompt="◆" promptColor="text-sol-pink">
              <span className="text-white">model:</span> oracle-bounded delta-neutral
            </Line>
            <Line prompt="◆" promptColor="text-sol-pink">
              <span className="text-white">hedge_dex:</span> Drift / Mango v4
            </Line>
            <Line prompt="◆" promptColor="text-sol-pink">
              <span className="text-white">cover:</span> <span className="text-sol-green">92.4%</span> of IL exposure
            </Line>
            <Line prompt="◆" promptColor="text-sol-pink">
              <span className="text-white">cost:</span> 22 bps / day on hedged notional
            </Line>
          </Terminal>
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Terminal title="auto://harvest.cron" subtitle="recent runs" accent="purple">
          {[
            { t: "00:04:18", v: "AUTO/SOL", n: "+1,442 $AUTO / +0.31 SOL" },
            { t: "00:04:42", v: "AUTO/USDC", n: "+612 $AUTO / +18.40 USDC" },
            { t: "00:05:08", v: "JUP/SOL", n: "+9.4 JUP / +0.12 SOL" },
            { t: "00:05:31", v: "SOL/USDC", n: "+0.94 SOL / +124.10 USDC" },
            { t: "00:06:00", v: "AUTO/SOL", n: "+1,388 $AUTO / +0.29 SOL" },
          ].map((row, i) => (
            <Line key={i} prompt="▸" promptColor="text-sol-purple">
              <span className="text-terminal-dim">[{row.t}]</span>{" "}
              <span className="text-white">{row.v}</span>{" "}
              <span className="text-sol-green">{row.n}</span>{" "}
              <span className="text-terminal-dim">→ compounded</span>
            </Line>
          ))}
        </Terminal>

        <Terminal title="auto://amm.config" subtitle="public constants" accent="amber">
          <Line prompt="$" promptColor="text-terminal-amber">
            <span className="text-white">range_bias_default:</span>{" "}
            <span className="text-sol-green">0.85</span> <span className="text-terminal-dim">(narrower than baseline)</span>
          </Line>
          <Line prompt="$" promptColor="text-terminal-amber">
            <span className="text-white">harvest_min_yield_bps:</span> <span className="text-sol-green">15</span>
          </Line>
          <Line prompt="$" promptColor="text-terminal-amber">
            <span className="text-white">rebalance_cooldown:</span> <span className="text-sol-green">120s</span>
          </Line>
          <Line prompt="$" promptColor="text-terminal-amber">
            <span className="text-white">max_swap_size_bps:</span> <span className="text-sol-green">50</span>{" "}
            <span className="text-terminal-dim">of pool depth</span>
          </Line>
          <Line prompt="$" promptColor="text-terminal-amber">
            <span className="text-white">protocol_fee:</span> <span className="text-sol-green">0%</span>{" "}
            <span className="text-terminal-dim">(100% to LP)</span>
          </Line>
        </Terminal>
      </div>
    </TerminalShell>
  );
}
