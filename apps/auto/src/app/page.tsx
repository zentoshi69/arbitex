import { Hero } from "@/components/Hero";
import { Stat } from "@/components/Stat";
import { SectionHeader } from "@/components/SectionHeader";
import { AutomationGrid } from "@/components/AutomationGrid";
import { TaxFlow } from "@/components/TaxFlow";
import { Terminal, Line } from "@/components/Terminal";
import { Sparkline } from "@/components/Sparkline";
import { SOCIAL_PROOF, TICKER, TOKEN } from "@/lib/mock";
import { fmtNum, fmtUsd } from "@/lib/utils";
import Link from "next/link";

const reservePoints = [120, 134, 142, 156, 168, 178, 199, 212, 230, 248, 263, 281, 295, 314, 339, 358];
const lpDepth = [800, 812, 824, 855, 878, 902, 941, 985, 1024, 1080, 1145, 1220, 1280, 1348, 1422, 1510];

export default function Page() {
  return (
    <>
      <Hero />

      {/* Stat strip */}
      <section id="launch" className="border-b border-sol-purple/15 bg-bg-panel/40">
        <div className="mx-auto max-w-7xl px-6 py-10 grid gap-4 grid-cols-2 md:grid-cols-4">
          {SOCIAL_PROOF.map((s, i) => (
            <Stat
              key={s.metric}
              label={s.metric}
              value={
                s.metric.toLowerCase().includes("usd") ? fmtUsd(s.value) : fmtNum(s.value)
              }
              accent={(["green", "cyan", "purple", "pink"] as const)[i % 4]}
              hint="last 24h · live oracle"
            />
          ))}
        </div>
      </section>

      {/* Automations */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <SectionHeader
          eyebrow="MODULES"
          title={
            <>
              The terminals where <span className="text-grad">automations live</span>.
            </>
          }
          description="Each module is a self-contained on-chain robot you can subscribe to with $AUTO. They start when you tell them to. They never stop until you tell them to."
        />
        <AutomationGrid />
      </section>

      {/* Tax flow */}
      <section className="mx-auto max-w-7xl px-6 pb-20" id="tax">
        <SectionHeader
          eyebrow="MECHANISM"
          title={
            <>
              5% tax. Split <span className="text-grad">50 / 50</span>. Reserve never sells.
            </>
          }
          description="No team multisig can drain the reserve. The PDA does not implement a withdraw instruction — the program literally cannot send from it."
        >
          <Link href="/tokenomics" className="btn-neon btn-neon-ghost text-xs">
            Full Tokenomics →
          </Link>
        </SectionHeader>
        <TaxFlow />
      </section>

      {/* Live ticker + chart panel */}
      <section className="mx-auto max-w-7xl px-6 pb-20">
        <SectionHeader
          eyebrow="LIVE"
          title="Reserve grows. LP deepens. Forever."
          description="Two metrics that only move in one direction. The third is the price chart — that one's up to the market."
        />
        <div className="grid gap-5 md:grid-cols-2">
          <Terminal title="auto://reserve" subtitle="cumulative $AUTO bought-back" accent="green">
            <div className="flex items-end justify-between mb-3">
              <div>
                <div className="font-mono text-[10px] text-terminal-dim uppercase tracking-[0.18em]">
                  Reserve balance
                </div>
                <div className="font-display text-3xl text-sol-green glow-text-green">147.0M $AUTO</div>
              </div>
              <Sparkline values={reservePoints} color="#14F195" width={220} height={64} />
            </div>
            <Line>
              <span className="text-white">cat </span>
              <span className="text-terminal-dim">reserve.balance --tail</span>
            </Line>
            {reservePoints.slice(-5).map((v, i) => (
              <Line prompt="◇" promptColor="text-sol-green" key={i}>
                <span className="text-terminal-dim">slot 287_104_{800 + i * 12}</span>{" "}
                <span className="text-white">+{v} $AUTO</span>{" "}
                <span className="text-sol-green">→ reserve</span>
              </Line>
            ))}
          </Terminal>

          <Terminal title="auto://lp-depth" subtitle="AUTO/SOL pool" accent="pink">
            <div className="flex items-end justify-between mb-3">
              <div>
                <div className="font-mono text-[10px] text-terminal-dim uppercase tracking-[0.18em]">
                  LP TVL
                </div>
                <div className="font-display text-3xl text-sol-pink glow-text-pink">$4.81M</div>
              </div>
              <Sparkline values={lpDepth} color="#ff2bd6" width={220} height={64} />
            </div>
            <Line prompt="◆" promptColor="text-sol-pink">
              <span className="text-white">range</span>{" "}
              <span className="text-terminal-dim">0.0118 — 0.0162 $/AUTO · ±18%</span>
            </Line>
            <Line prompt="◆" promptColor="text-sol-pink">
              <span className="text-white">fees(24h)</span>{" "}
              <span className="text-sol-green">+ 12,418 $AUTO</span>{" "}
              <span className="text-terminal-dim">/ + 19.4 SOL</span>
            </Line>
            <Line prompt="◆" promptColor="text-sol-pink">
              <span className="text-white">compound</span>{" "}
              <span className="text-terminal-dim">→ next harvest in 4m 12s</span>
            </Line>
            <Line prompt="◆" promptColor="text-sol-pink">
              <span className="text-white">lock</span>{" "}
              <span className="text-sol-green">LP tokens burned · ∞</span>
            </Line>
          </Terminal>
        </div>
      </section>

      {/* Contract block */}
      <section id="contract" className="mx-auto max-w-7xl px-6 pb-20">
        <SectionHeader
          eyebrow="CONTRACT"
          title={
            <>
              Built on <span className="text-grad">Solana</span> · SPL Token-2022.
            </>
          }
          description="The mint, the buyback PDA, and the harvester program are immutable after launch. The full Anchor source ships in this repo."
        />
        <div className="grid gap-5 md:grid-cols-2">
          <Terminal title="auto://mint" subtitle="spl-token-2022" accent="purple">
            <KV k="symbol" v={TOKEN.symbol} />
            <KV k="standard" v={TOKEN.standard} />
            <KV k="decimals" v={String(TOKEN.decimals)} />
            <KV k="supply" v={fmtNum(TOKEN.totalSupply)} />
            <KV k="transfer-fee" v={`${TOKEN.taxBps / 100}% (${TOKEN.taxBps} bps)`} accent="text-sol-green" />
            <KV k="freeze-auth" v="None (renounced)" accent="text-terminal-amber" />
            <KV k="mint-auth" v="None (renounced post-launch)" accent="text-terminal-amber" />
            <KV k="mint" v={TOKEN.mint} mono />
          </Terminal>
          <Terminal title="auto://program" subtitle="anchor::auto_treasury" accent="cyan">
            <KV k="program_id" v={TOKEN.programId} mono />
            <KV k="treasury_pda" v={TOKEN.treasury} mono />
            <KV k="lp_vault_pda" v={TOKEN.lpVault} mono />
            <KV k="instructions" v="initialize · harvest · compound_lp · buyback" />
            <KV k="reserve_withdraw" v="NOT IMPLEMENTED (by design)" accent="text-sol-pink" />
            <KV k="upgradeable" v="false (program authority closed)" accent="text-sol-green" />
            <KV k="audit" v="open · /audit · bounty 50,000 $AUTO" />
          </Terminal>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="panel panel-glow rounded p-10 md:p-16 relative overflow-hidden text-center">
          <div className="absolute inset-0 bg-auto-grad opacity-[0.08]" />
          <div className="relative">
            <div className="font-mono text-[11px] uppercase tracking-[0.4em] text-sol-green">
              ◇ start the organism
            </div>
            <h3 className="mt-4 font-display text-3xl md:text-5xl text-grad">Automate Everything.</h3>
            <p className="mt-3 max-w-xl mx-auto font-mono text-sm text-terminal-dim">
              Pick a terminal. Hold $AUTO. Walk away. The robots have it.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/terminals/trading" className="btn-neon">
                ▸ Trader
              </Link>
              <Link href="/terminals/amm" className="btn-neon">
                ▸ AMM
              </Link>
              <Link href="/terminals/promotions" className="btn-neon">
                ▸ Promo
              </Link>
              <Link href="/terminals/airdrop" className="btn-neon">
                ▸ Airdrop
              </Link>
              <Link href="/terminals/reminders" className="btn-neon">
                ▸ Reminders
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function KV({
  k,
  v,
  mono = false,
  accent,
}: {
  k: string;
  v: string;
  mono?: boolean;
  accent?: string;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-1 border-b border-sol-purple/10 last:border-0">
      <span className="text-terminal-dim font-mono text-[11px] uppercase tracking-wider">{k}</span>
      <span className={`${mono ? "font-mono text-[11px] break-all" : "text-sm"} ${accent ?? "text-white"}`}>
        {v}
      </span>
    </div>
  );
}
