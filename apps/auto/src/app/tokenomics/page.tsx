import { SectionHeader } from "@/components/SectionHeader";
import { Stat } from "@/components/Stat";
import { Terminal, Line } from "@/components/Terminal";
import { TaxFlow } from "@/components/TaxFlow";
import { EMISSION_SCHEDULE, SUPPLY, TOKEN } from "@/lib/mock";
import { fmtNum } from "@/lib/utils";

export default function TokenomicsPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-16">
      <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-sol-green mb-3">
        <span className="text-sol-purple">▸</span> /tokenomics
      </div>
      <h1 className="font-display text-4xl md:text-6xl tracking-tight">
        $AUTO <span className="text-grad">Tokenomics</span>
      </h1>
      <p className="mt-3 font-mono text-sm text-terminal-dim max-w-2xl">
        A fixed-supply Solana SPL Token-2022 with a transfer fee that powers an
        autonomous reserve and liquidity engine. Designed by the AI. Verified by the chain.
      </p>

      <div className="mt-10 grid gap-4 grid-cols-2 md:grid-cols-4">
        <Stat label="Total Supply" value={fmtNum(TOKEN.totalSupply)} hint="hard cap · no mint" accent="green" />
        <Stat label="Decimals" value={String(TOKEN.decimals)} accent="purple" />
        <Stat label="Transfer Fee" value={`${TOKEN.taxBps / 100}%`} hint="harvested every transfer" accent="cyan" />
        <Stat label="Tax Split" value="50 / 50" hint="reserve · lp" accent="pink" />
      </div>

      <div className="mt-16">
        <SectionHeader
          eyebrow="DISTRIBUTION"
          title={<>Where the supply <span className="text-grad">begins</span>.</>}
          description="No private sale. No team allocation that vests faster than the public. The biggest single bucket goes straight into the open AUTO/SOL pool."
        />
        <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
          <SupplyChart />
          <SupplyTable />
        </div>
      </div>

      <div className="mt-20">
        <SectionHeader
          eyebrow="MECHANISM"
          title={<>The <span className="text-grad">tax</span> is the protocol.</>}
        />
        <TaxFlow />
      </div>

      <div className="mt-20">
        <SectionHeader
          eyebrow="EMISSION"
          title={<>Schedule, on-chain.</>}
          description="The mint authority is renounced at T+0. Future allocations come exclusively from pre-allocated, time-locked PDAs."
        />
        <Terminal title="auto://emission.log" subtitle="immutable schedule" accent="amber" height="320px">
          <Line>
            <span className="text-white">cat </span>
            <span className="text-terminal-dim">emission.log</span>
          </Line>
          {EMISSION_SCHEDULE.map((row, i) => (
            <Line prompt="◆" promptColor="text-terminal-amber" key={i}>
              <span className="text-white w-44 inline-block">{row.phase}</span>
              <span className="text-sol-green">{row.supplyPct}%</span>{" "}
              <span className="text-terminal-dim">@ {row.when}</span>
            </Line>
          ))}
          <Line prompt="◆" promptColor="text-terminal-amber">
            <span className="text-sol-pink">renounce</span>{" "}
            <span className="text-terminal-dim">mint_authority = None · freeze_authority = None</span>
          </Line>
        </Terminal>
      </div>

      <div className="mt-20 grid gap-6 md:grid-cols-2">
        <div className="panel rounded p-6">
          <h3 className="font-display text-2xl text-sol-green">Why a transfer fee?</h3>
          <p className="mt-3 font-mono text-sm text-terminal-dim leading-relaxed">
            Solana SPL Token-2022 lets the fee live in the mint itself, not in a custom router.
            That means: every wallet, every DEX, every aggregator collects the tax automatically.
            No way to bypass. No need to fork Jupiter.
          </p>
        </div>
        <div className="panel rounded p-6">
          <h3 className="font-display text-2xl text-sol-pink">Why a sealed reserve?</h3>
          <p className="mt-3 font-mono text-sm text-terminal-dim leading-relaxed">
            Treasuries that can sell, do sell. The buyback PDA owns its tokens, but the on-chain
            program never exposes a transfer-out instruction. The reserve is mathematically
            constrained to grow.
          </p>
        </div>
      </div>
    </div>
  );
}

function SupplyChart() {
  // build conic-gradient string
  let acc = 0;
  const stops = SUPPLY.map((s) => {
    const start = acc;
    acc += s.pct;
    return `${s.color} ${start}% ${acc}%`;
  }).join(", ");

  return (
    <div className="panel rounded p-6 relative overflow-hidden">
      <div className="absolute -top-10 -right-10 h-44 w-44 rounded-full bg-sol-purple/20 blur-3xl" />
      <div className="flex items-center justify-center py-2">
        <div className="relative h-64 w-64">
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: `conic-gradient(${stops})` }}
          />
          <div className="absolute inset-6 rounded-full bg-bg-card border border-sol-purple/30 flex items-center justify-center flex-col">
            <div className="font-mono text-[10px] text-terminal-dim uppercase tracking-[0.18em]">supply</div>
            <div className="font-display text-2xl text-grad">1.0B</div>
            <div className="font-mono text-[10px] text-terminal-dim">$AUTO</div>
          </div>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {SUPPLY.map((s) => (
          <div key={s.label} className="flex items-center gap-2 font-mono text-xs">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: s.color, boxShadow: `0 0 10px ${s.color}` }}
            />
            <span className="text-white/80 flex-1">{s.label}</span>
            <span className="text-terminal-dim">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SupplyTable() {
  return (
    <Terminal title="auto://supply.toml" accent="purple" height="auto">
      {SUPPLY.map((s) => (
        <Line prompt="▸" promptColor="text-sol-purple" key={s.label}>
          <span className="text-white inline-block w-44">{s.label}</span>
          <span className="text-sol-green">{s.pct}%</span>{" "}
          <span className="text-terminal-dim">
            ({fmtNum((TOKEN.totalSupply * s.pct) / 100)} $AUTO)
          </span>
        </Line>
      ))}
      <div className="mt-3 border-t border-sol-purple/20 pt-3 font-mono text-[11px] text-terminal-dim">
        <div>
          <span className="text-sol-green">▸ liquidity:</span> 60% paired against SOL into the
          AUTO/SOL pool. LP tokens burned at launch.
        </div>
        <div className="mt-1">
          <span className="text-sol-cyan">▸ reserve:</span> 15% pre-loaded into the buyback PDA.
          Grows as transfer fees compound.
        </div>
        <div className="mt-1">
          <span className="text-sol-pink">▸ airdrops:</span> 8% across 2 seasons via
          Merkle-distributed claims (T+7d, T+45d).
        </div>
      </div>
    </Terminal>
  );
}
