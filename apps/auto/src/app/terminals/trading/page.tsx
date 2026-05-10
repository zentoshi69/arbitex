import { TerminalShell } from "@/components/TerminalShell";
import { Terminal, Line } from "@/components/Terminal";
import { Stat } from "@/components/Stat";
import { Sparkline } from "@/components/Sparkline";
import { TRADING_LOG } from "@/lib/mock";
import { fmtNum, fmtUsd } from "@/lib/utils";

const equityCurve = [
  100, 102, 101, 104, 109, 112, 110, 116, 121, 119, 124, 130, 134, 142, 138, 144, 152, 158, 161, 167, 174, 180, 188, 195,
];

const STRATEGIES = [
  { name: "GRID-AUTO/SOL", risk: "LOW", capital: "12,000", live: true, daily: 0.42 },
  { name: "MOM-CROSS-15m", risk: "MED", capital: "8,500", live: true, daily: 1.18 },
  { name: "REV-Z-1h", risk: "MED", capital: "5,200", live: true, daily: 0.74 },
  { name: "CARRY-PYTH", risk: "LOW", capital: "9,800", live: true, daily: 0.31 },
  { name: "BREAKOUT-VWAP", risk: "HIGH", capital: "3,100", live: false, daily: 0 },
];

const ORDERBOOK_BID = [
  { px: 0.01337, sz: 12_482 },
  { px: 0.01336, sz: 18_204 },
  { px: 0.01335, sz: 24_011 },
  { px: 0.01334, sz: 41_002 },
  { px: 0.01333, sz: 88_440 },
];
const ORDERBOOK_ASK = [
  { px: 0.01338, sz: 11_002 },
  { px: 0.01339, sz: 19_800 },
  { px: 0.0134, sz: 26_440 },
  { px: 0.01341, sz: 37_980 },
  { px: 0.01342, sz: 71_220 },
];

export default function TradingTerminal() {
  return (
    <TerminalShell
      module="auto/trader"
      title="AUTO//TRADER"
      accent="green"
      description="Multi-strategy execution stack. Routes through Jupiter for best-of-N. Risk-checked. MEV-aware. Connected to your $AUTO subscription."
      ascii={`   _____ ____  ___    ____  ___________
  /__  // __ \\/   |  / __ \\/ ____/ __ \\
    / // /_/ / /| | / / / / __/ / /_/ /
   / // _, _/ ___ |/ /_/ / /___/ _, _/
  /_//_/ |_/_/  |_/_____/_____/_/ |_|`}
    >
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-6">
        <Stat label="24h PnL" value="+$4,812" hint="net of fees + tax" accent="green" />
        <Stat label="Win Rate" value="71.4%" hint="last 240 trades" accent="cyan" />
        <Stat label="Active Bots" value="4 / 5" hint="1 paused by risk" accent="purple" />
        <Stat label="Capital Deployed" value={fmtUsd(38_600)} hint="across strategies" accent="pink" />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Terminal title="auto://trader.live" subtitle="execution log" accent="green" className="lg:col-span-8" height="420px">
          <Line>
            <span className="text-white">tail </span>
            <span className="text-terminal-dim">--follow trader.log</span>
          </Line>
          {TRADING_LOG.map((row, i) => (
            <div key={i} className="grid grid-cols-[60px_60px_100px_80px_90px_70px_1fr] gap-2 py-0.5">
              <span className="text-terminal-dim">{row.t}</span>
              <span
                className={
                  row.side === "BUY"
                    ? "text-sol-green"
                    : row.side === "SELL"
                    ? "text-sol-pink"
                    : "text-terminal-amber"
                }
              >
                {row.side}
              </span>
              <span className="text-white">{row.pair}</span>
              <span className="text-terminal-dim text-right">{fmtNum(row.size)}</span>
              <span className="text-white text-right">{row.px.toFixed(5)}</span>
              <span className={row.pnl.startsWith("+") ? "text-sol-green text-right" : "text-terminal-dim text-right"}>
                {row.pnl}
              </span>
              <span className="text-terminal-dim">{row.note}</span>
            </div>
          ))}
          <Line>
            <span className="text-white">_</span>
            <span className="inline-block w-2 h-4 bg-sol-green align-middle animate-blink ml-1" />
          </Line>
        </Terminal>

        <div className="lg:col-span-4 grid gap-5">
          <Terminal title="auto://equity" subtitle="cumulative" accent="cyan" height="180px">
            <div className="flex items-end justify-between">
              <div>
                <div className="font-mono text-[10px] text-terminal-dim uppercase tracking-[0.18em]">
                  +95.0% all-time
                </div>
                <div className="font-display text-3xl text-sol-cyan glow-text-green">$48,124</div>
              </div>
              <Sparkline values={equityCurve} color="#22d3ee" width={170} height={64} />
            </div>
            <Line prompt="◆" promptColor="text-sol-cyan">
              max DD <span className="text-sol-pink">-3.8%</span>
            </Line>
            <Line prompt="◆" promptColor="text-sol-cyan">
              sharpe <span className="text-sol-green">2.84</span>
            </Line>
            <Line prompt="◆" promptColor="text-sol-cyan">
              sortino <span className="text-sol-green">4.11</span>
            </Line>
          </Terminal>

          <Terminal title="auto://orderbook" subtitle="AUTO/SOL" accent="purple" height="220px">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <div className="text-sol-pink mb-1">ASK</div>
                {ORDERBOOK_ASK.map((r) => (
                  <div key={r.px} className="flex justify-between border-b border-sol-pink/10">
                    <span className="text-sol-pink">{r.px.toFixed(5)}</span>
                    <span className="text-terminal-dim">{fmtNum(r.sz)}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-sol-green mb-1">BID</div>
                {ORDERBOOK_BID.map((r) => (
                  <div key={r.px} className="flex justify-between border-b border-sol-green/10">
                    <span className="text-sol-green">{r.px.toFixed(5)}</span>
                    <span className="text-terminal-dim">{fmtNum(r.sz)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2 text-center text-[10px] text-terminal-dim">
              spread <span className="text-white">0.00001</span> · imbalance{" "}
              <span className="text-sol-green">+18%</span>
            </div>
          </Terminal>
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Terminal title="auto://strategies" subtitle="deployments" accent="pink">
          <div className="grid grid-cols-[1fr_60px_90px_60px_60px] gap-2 text-[11px] text-terminal-dim border-b border-sol-purple/15 pb-1">
            <span>Strategy</span>
            <span>Risk</span>
            <span className="text-right">Capital</span>
            <span className="text-right">Daily%</span>
            <span className="text-right">State</span>
          </div>
          {STRATEGIES.map((s) => (
            <div key={s.name} className="grid grid-cols-[1fr_60px_90px_60px_60px] gap-2 text-[12px] py-1">
              <span className="text-white">{s.name}</span>
              <span
                className={
                  s.risk === "LOW"
                    ? "text-sol-green"
                    : s.risk === "MED"
                    ? "text-terminal-amber"
                    : "text-sol-pink"
                }
              >
                {s.risk}
              </span>
              <span className="text-right text-terminal-dim">{s.capital}</span>
              <span className={"text-right " + (s.daily > 0 ? "text-sol-green" : "text-terminal-dim")}>
                {s.daily.toFixed(2)}%
              </span>
              <span className={"text-right " + (s.live ? "text-sol-green" : "text-terminal-amber")}>
                {s.live ? "LIVE" : "PAUSE"}
              </span>
            </div>
          ))}
        </Terminal>

        <Terminal title="auto://risk" subtitle="circuit breakers" accent="amber">
          <Line prompt="◆" promptColor="text-terminal-amber">
            <span className="text-white">max_drawdown_d:</span> <span className="text-sol-green">5.0%</span>{" "}
            <span className="text-terminal-dim">(now 0.8%)</span>
          </Line>
          <Line prompt="◆" promptColor="text-terminal-amber">
            <span className="text-white">max_slippage:</span> <span className="text-sol-green">30 bps</span>
          </Line>
          <Line prompt="◆" promptColor="text-terminal-amber">
            <span className="text-white">max_concurrent_legs:</span> <span className="text-sol-green">8</span>
          </Line>
          <Line prompt="◆" promptColor="text-terminal-amber">
            <span className="text-white">jito_tip_lamports:</span> <span className="text-sol-green">12,000</span>
          </Line>
          <Line prompt="◆" promptColor="text-terminal-amber">
            <span className="text-white">price_oracle:</span> <span className="text-sol-green">Pyth + Switchboard</span>
          </Line>
          <Line prompt="◆" promptColor="text-terminal-amber">
            <span className="text-white">kill_switch:</span> <span className="text-sol-green">ARMED</span>
          </Line>
          <Line prompt="◆" promptColor="text-terminal-amber">
            <span className="text-white">tax_aware_routing:</span> <span className="text-sol-green">ON</span>
          </Line>
        </Terminal>
      </div>
    </TerminalShell>
  );
}
