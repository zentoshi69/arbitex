import { TerminalShell } from "@/components/TerminalShell";
import { Terminal, Line } from "@/components/Terminal";
import { Stat } from "@/components/Stat";
import { PROMO_CAMPAIGNS } from "@/lib/mock";
import { fmtNum } from "@/lib/utils";

export default function PromoTerminal() {
  return (
    <TerminalShell
      module="auto/promo"
      title="AUTO//PROMO"
      accent="pink"
      description="Schedule raids, throttle alpha drops, gate bounties by on-chain criteria, and pay claims atomically. Native bridges to X, Telegram, Discord, GitHub."
      ascii={`  ╔══════════════════╗
  ║   PROMO  ENGINE  ║
  ║  pay-on-action.  ║
  ╚══════════════════╝`}
    >
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-6">
        <Stat label="Active Campaigns" value="3" hint="1 full" accent="pink" />
        <Stat label="Tasks Completed (24h)" value={fmtNum(1_402)} accent="green" />
        <Stat label="$AUTO Paid Out" value={fmtNum(38_400)} hint="atomic on-chain" accent="purple" />
        <Stat label="Bot-Filter Catch Rate" value="98.3%" hint="signal-bound" accent="cyan" />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Terminal title="auto://campaigns" subtitle="live & queued" accent="pink" className="lg:col-span-8">
          <div className="grid grid-cols-[140px_90px_120px_90px_70px_90px] gap-2 text-[11px] text-terminal-dim border-b border-sol-purple/15 pb-1">
            <span>ID</span>
            <span>Platform</span>
            <span className="text-right">Reward</span>
            <span className="text-right">Filled</span>
            <span className="text-right">Cap</span>
            <span className="text-right">State</span>
          </div>
          {PROMO_CAMPAIGNS.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-[140px_90px_120px_90px_70px_90px] gap-2 text-[12.5px] py-1.5 border-b border-sol-purple/10"
            >
              <span className="text-white font-mono">{c.id}</span>
              <span className="text-sol-cyan">{c.platform}</span>
              <span className="text-right text-sol-green">{c.reward}</span>
              <span className="text-right text-white">{fmtNum(c.filled)}</span>
              <span className="text-right text-terminal-dim">{fmtNum(c.cap)}</span>
              <span
                className={
                  "text-right " + (c.status === "LIVE" ? "text-sol-green" : "text-terminal-amber")
                }
              >
                {c.status}
              </span>
            </div>
          ))}
        </Terminal>

        <Terminal title="auto://promo.feed" subtitle="task stream" accent="cyan" className="lg:col-span-4">
          {[
            { t: "00:00:01", a: "task", w: "9F8…aA21", c: "X RT @autoautomations", p: "+5 $AUTO" },
            { t: "00:00:04", a: "task", w: "Hu3…2P8d", c: "X reply with $AUTO", p: "+5 $AUTO" },
            { t: "00:00:09", a: "filter", w: "kK1…fL00", c: "rejected: bot heuristic", p: "—" },
            { t: "00:00:12", a: "task", w: "Pq7…X09k", c: "TG join + react", p: "+2 $AUTO" },
            { t: "00:00:19", a: "task", w: "M2v…91Z2", c: "GH PR closed: bug-fix", p: "+1,200 $AUTO" },
            { t: "00:00:24", a: "task", w: "8w0…b64C", c: "DC voice 5m", p: "+1.6 $AUTO" },
            { t: "00:00:31", a: "filter", w: "1aB…99qq", c: "duplicate ip", p: "—" },
            { t: "00:00:39", a: "task", w: "TyJ…8fEr", c: "X meme tier-A", p: "+50 $AUTO" },
          ].map((r, i) => (
            <div key={i} className="grid grid-cols-[60px_50px_70px_1fr_70px] gap-1 text-[11.5px] py-0.5">
              <span className="text-terminal-dim">{r.t}</span>
              <span className={r.a === "filter" ? "text-terminal-amber" : "text-sol-cyan"}>{r.a}</span>
              <span className="text-white font-mono truncate">{r.w}</span>
              <span className="text-terminal-dim truncate">{r.c}</span>
              <span className="text-sol-green text-right">{r.p}</span>
            </div>
          ))}
        </Terminal>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Terminal title="auto://create-campaign" subtitle="dsl" accent="green">
          <pre className="ascii text-[12px] text-white/85 leading-snug">{`campaign "AUTO-MEME-S2" {
  platform   = "x"
  task       = "post(meme: tag(@autoautomations))"
  filter     = wallet.holds("$AUTO") >= 1_000
            && account.age_days >= 30
            && bot_score < 0.20
  reward     = 50 $AUTO
  cap        = 1_000
  payout     = atomic_on_verify
  expires    = 7d
  duplicates = block(by: wallet | ip)
}`}</pre>
        </Terminal>

        <Terminal title="auto://anti-abuse" subtitle="filters" accent="amber">
          <Line prompt="◆" promptColor="text-terminal-amber">
            <span className="text-white">bot_score:</span> Pyth-anchored signal of farmed accounts
          </Line>
          <Line prompt="◆" promptColor="text-terminal-amber">
            <span className="text-white">wallet_holds:</span> on-chain $AUTO balance gate
          </Line>
          <Line prompt="◆" promptColor="text-terminal-amber">
            <span className="text-white">age_gate:</span> wallet + social account age
          </Line>
          <Line prompt="◆" promptColor="text-terminal-amber">
            <span className="text-white">dedupe:</span> by wallet · ip · device fingerprint
          </Line>
          <Line prompt="◆" promptColor="text-terminal-amber">
            <span className="text-white">payout:</span> atomic on verify, no manual approve
          </Line>
          <Line prompt="◆" promptColor="text-terminal-amber">
            <span className="text-white">budget:</span> capped per campaign · no overspend
          </Line>
        </Terminal>
      </div>
    </TerminalShell>
  );
}
