import Link from "next/link";
import { Terminal, Line } from "./Terminal";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-sol-purple/15">
      {/* Backdrop */}
      <div className="absolute inset-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[640px] w-[1100px] rounded-full bg-sol-purple/30 blur-3xl opacity-60" />
        <div className="absolute -bottom-40 left-1/4 h-[420px] w-[720px] rounded-full bg-sol-green/20 blur-3xl opacity-60" />
        <div className="absolute -bottom-20 right-1/4 h-[420px] w-[720px] rounded-full bg-sol-pink/20 blur-3xl opacity-50" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 py-20 md:py-28">
        <div className="flex flex-col items-center text-center">
          <div className="font-mono text-[11px] tracking-[0.45em] text-sol-green/90 mb-6">
            <span className="text-sol-pink">FULLY AUTOMATED.</span>{" "}
            <span className="text-white/60">ZERO EMOTIONS.</span>{" "}
            <span className="text-sol-magenta">MAXIMUM EXTRACTION.</span>
          </div>

          <h1 className="font-display tracking-tight">
            <span className="block text-[18vw] md:text-[180px] leading-[0.85] text-grad animate-glow-pulse">
              $AUTO
            </span>
          </h1>

          <div className="mt-2 font-mono text-[13px] md:text-base tracking-[0.35em] text-sol-cyan">
            AUTOMATED&nbsp;&nbsp;AUTOMATIONS
          </div>

          <p className="mt-5 max-w-2xl font-mono text-sm md:text-base text-terminal-dim leading-relaxed">
            ◇ The first fully autonomous liquidity organism on Solana. Trading bots, AMM
            vaults, promotion raids, airdrop graphs, and wallet reminders — every primitive,
            running by itself, forever.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="#launch" className="btn-neon">
              Launch Terminals →
            </Link>
            <Link href="/tokenomics" className="btn-neon btn-neon-ghost">
              Read Tokenomics
            </Link>
            <a href="#contract" className="btn-neon btn-neon-ghost">
              ◎ Solana Contract
            </a>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 font-mono text-[11px] uppercase tracking-[0.18em]">
            <Pill className="text-sol-green" dot="bg-sol-green" label="BUILT ON SOLANA ◎" />
            <Pill className="text-sol-purple" dot="bg-sol-purple" label="SPL TOKEN-2022" />
            <Pill className="text-sol-cyan" dot="bg-sol-cyan" label="TAX 5% ▸ 50/50 RESERVE-LP" />
            <Pill className="text-sol-pink" dot="bg-sol-pink" label="RESERVE NEVER SELLS" />
          </div>
        </div>

        {/* Mock terminal showcase */}
        <div className="mt-16 grid gap-5 md:grid-cols-12">
          <Terminal
            title="auto://liquidity-organism"
            subtitle="root@solana"
            accent="green"
            className="md:col-span-7"
            height="280px"
          >
            <Line>
              <span className="text-white">boot </span>
              <span className="text-terminal-dim">--node mainnet-beta --program AutoTreasury…1111</span>
            </Line>
            <Line prompt=">" promptColor="text-terminal-dim">
              <span className="text-sol-cyan">[ok]</span> mint loaded · supply 1,000,000,000 · decimals 9
            </Line>
            <Line prompt=">" promptColor="text-terminal-dim">
              <span className="text-sol-cyan">[ok]</span> transfer-fee extension active · 5.00% → split 50 / 50
            </Line>
            <Line prompt=">" promptColor="text-terminal-dim">
              <span className="text-sol-green">[reserve]</span> PDA locked · withdraw_authority = None
            </Line>
            <Line prompt=">" promptColor="text-terminal-dim">
              <span className="text-sol-green">[buyback]</span> AUTO/SOL · slot 287_104_882 · +12,442 $AUTO accumulated
            </Line>
            <Line prompt=">" promptColor="text-terminal-dim">
              <span className="text-sol-pink">[lp]</span> auto-compounded fees → +SOL 18.34 / +$AUTO 1,448
            </Line>
            <Line prompt=">" promptColor="text-terminal-dim">
              <span className="text-terminal-amber">[automations]</span> 5 modules online · bots:4_812 · vaults:128
            </Line>
            <Line>
              <span className="text-white">tail </span>
              <span className="text-terminal-dim">--follow auto.log</span>
              <span className="inline-block w-2 h-4 bg-sol-green align-middle animate-blink ml-2" />
            </Line>
          </Terminal>

          <Terminal
            title="auto://reserve"
            subtitle="permanent buyback"
            accent="cyan"
            className="md:col-span-5"
            height="280px"
          >
            <pre className="ascii text-sol-purple/70 text-[10px] leading-tight">{`
   ┌──────────────────────────────────┐
   │  RESERVE  /  NO_WITHDRAW  /  PDA │
   └──────────────────────────────────┘
`}</pre>
            <Line prompt="◆" promptColor="text-sol-cyan">
              tax in : <span className="text-sol-green">+ 312.41 $AUTO</span>
            </Line>
            <Line prompt="◆" promptColor="text-sol-cyan">
              split  : <span className="text-white">156.20</span> reserve / <span className="text-white">156.21</span> lp
            </Line>
            <Line prompt="◆" promptColor="text-sol-cyan">
              swap   : <span className="text-sol-green">SOL → $AUTO</span> via Jupiter
            </Line>
            <Line prompt="◆" promptColor="text-sol-cyan">
              ack    : <span className="text-sol-green">+1,184 $AUTO</span> bought back
            </Line>
            <Line prompt="◆" promptColor="text-sol-cyan">
              reserve: <span className="text-terminal-amber">147,002,418 $AUTO</span> · sealed
            </Line>
            <Line prompt="◆" promptColor="text-sol-cyan">
              sell   : <span className="text-terminal-red">DENIED — instruction not implemented</span>
            </Line>
            <div className="mt-2 font-mono text-[10px] text-terminal-dim">
              The buyback PDA has no <span className="text-white">withdraw</span> instruction. Reserve grows monotonically.
            </div>
          </Terminal>
        </div>
      </div>
    </section>
  );
}

function Pill({ className, dot, label }: { className: string; dot: string; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot} animate-pulse`} />
      {label}
    </span>
  );
}
