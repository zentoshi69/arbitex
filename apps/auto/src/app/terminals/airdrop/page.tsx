import { TerminalShell } from "@/components/TerminalShell";
import { Terminal, Line } from "@/components/Terminal";
import { Stat } from "@/components/Stat";
import { AIRDROP_TIERS } from "@/lib/mock";
import { fmtNum } from "@/lib/utils";

const REFERRAL_TREE = [
  { addr: "wallet:5K9…r1Pq", level: 0, ref: 12, earned: 4_200 },
  { addr: "wallet:Bk2…0Lww", level: 1, ref: 8, earned: 1_400 },
  { addr: "wallet:Hu7…44Ax", level: 1, ref: 4, earned: 720 },
  { addr: "wallet:Tz3…91Cm", level: 2, ref: 22, earned: 3_320 },
  { addr: "wallet:Q9R…s7Tn", level: 2, ref: 5, earned: 480 },
  { addr: "wallet:Pn4…2bZk", level: 2, ref: 14, earned: 2_140 },
  { addr: "wallet:1aB…dD2c", level: 3, ref: 3, earned: 90 },
];

export default function AirdropTerminal() {
  return (
    <TerminalShell
      module="auto/airdrop"
      title="AUTO//DROP"
      accent="purple"
      description="Self-propagating airdrop and referral graph. Merkle-distributed claims execute on-chain. Referrers earn from a sealed pool — never from the recipient."
      ascii={`     ┌─┐  ┌─┐  ┌─┐
     │•│  │•│  │•│
   ┌─┴─┴──┴─┴──┴─┴─┐
   │  AUTO//DROP   │
   └───────────────┘`}
    >
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-6">
        <Stat label="Pool Size" value={`${fmtNum(80_000_000)} $AUTO`} hint="8% of supply" accent="purple" />
        <Stat label="Eligible Wallets" value={fmtNum(48_204)} accent="cyan" />
        <Stat label="Claimed" value="32.4%" hint="cliffs at T+45d" accent="green" />
        <Stat label="Referral Multiplier" value="×1.25" hint="up to 3 levels deep" accent="pink" />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Terminal title="auto://tiers" subtitle="merkle distribution" accent="purple" className="lg:col-span-8">
          <div className="grid grid-cols-[1fr_1.4fr_120px_120px] gap-2 text-[11px] text-terminal-dim border-b border-sol-purple/15 pb-1">
            <span>Tier</span>
            <span>Criteria</span>
            <span className="text-right">Reward</span>
            <span className="text-right">Claimed</span>
          </div>
          {AIRDROP_TIERS.map((t) => (
            <div
              key={t.tier}
              className="grid grid-cols-[1fr_1.4fr_120px_120px] gap-2 text-[12.5px] py-1.5 border-b border-sol-purple/10"
            >
              <span className="text-white">{t.tier}</span>
              <span className="text-terminal-dim">{t.criteria}</span>
              <span className="text-right text-sol-green">{fmtNum(t.reward)} $AUTO</span>
              <span className="text-right text-sol-cyan">{fmtNum(t.claimed)}</span>
            </div>
          ))}
          <div className="mt-3 font-mono text-[11px] text-terminal-dim">
            <span className="text-sol-green">▸</span> snapshot: rolling, taken at slot 287_104_882{" "}
            <span className="text-white">·</span> proof: keccak256 merkle{" "}
            <span className="text-white">·</span> claim: 1 tx, no signature
          </div>
        </Terminal>

        <Terminal title="auto://referral.tree" subtitle="L0 → L3" accent="pink" className="lg:col-span-4">
          {REFERRAL_TREE.map((r, i) => (
            <div key={i} className="font-mono text-[12px] py-0.5">
              <span className="text-terminal-dim">{"│ ".repeat(r.level)}</span>
              <span className="text-sol-pink">{r.level === 0 ? "★ " : "├─ "}</span>
              <span className="text-white">{r.addr}</span>{" "}
              <span className="text-terminal-dim">refs:</span>{" "}
              <span className="text-sol-cyan">{r.ref}</span>{" "}
              <span className="text-terminal-dim">/ +</span>
              <span className="text-sol-green">{fmtNum(r.earned)}</span>
              <span className="text-terminal-dim"> $AUTO</span>
            </div>
          ))}
          <div className="mt-3 text-[11px] text-terminal-dim">
            <span className="text-sol-green">payouts</span> from sealed referral PDA · never deducted
            from referee.
          </div>
        </Terminal>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Terminal title="auto://claim" subtitle="how it works" accent="green">
          <Line prompt="01" promptColor="text-sol-green">
            wallet generates a referral code via the program (deterministic PDA).
          </Line>
          <Line prompt="02" promptColor="text-sol-green">
            referee claims with a merkle proof + the code as remaining-account.
          </Line>
          <Line prompt="03" promptColor="text-sol-green">
            program emits AirdropClaimed + ReferralCredited events; both are logged on-chain.
          </Line>
          <Line prompt="04" promptColor="text-sol-green">
            referrer rewards stream from a separate referral PDA capped at the season budget.
          </Line>
          <Line prompt="05" promptColor="text-sol-green">
            no double-claim: a per-wallet bitmap tracks claimed indices.
          </Line>
        </Terminal>

        <Terminal title="auto://anti-sybil" subtitle="filters" accent="amber">
          <Line prompt="◆" promptColor="text-terminal-amber">
            min wallet age:{" "}
            <span className="text-sol-green">30 epochs</span>
          </Line>
          <Line prompt="◆" promptColor="text-terminal-amber">
            min on-chain activity:{" "}
            <span className="text-sol-green">25 swaps via Jupiter</span>
          </Line>
          <Line prompt="◆" promptColor="text-terminal-amber">
            cluster detection:{" "}
            <span className="text-sol-green">graph mod ≥ 0.4 → reduce reward 80%</span>
          </Line>
          <Line prompt="◆" promptColor="text-terminal-amber">
            referral self-loop:{" "}
            <span className="text-sol-pink">DENY at program level</span>
          </Line>
          <Line prompt="◆" promptColor="text-terminal-amber">
            multi-claim:{" "}
            <span className="text-sol-pink">DENY by bitmap PDA</span>
          </Line>
        </Terminal>
      </div>
    </TerminalShell>
  );
}
