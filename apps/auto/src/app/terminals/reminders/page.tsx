import { TerminalShell } from "@/components/TerminalShell";
import { Terminal, Line } from "@/components/Terminal";
import { Stat } from "@/components/Stat";
import { REMINDER_TEMPLATES } from "@/lib/mock";

export default function RemindersTerminal() {
  return (
    <TerminalShell
      module="auto/remind"
      title="AUTO//REMIND"
      accent="cyan"
      description="Wallet-bound triggers for unlocks, vesting, governance votes, low-balance, and price thresholds. Delivered via webhook, email, Telegram, Discord, or on-chain log."
      ascii={`   ⏰  AUTO//REMIND  ⏰
  ┌──────────────────┐
  │ on(EVENT) → SEND │
  └──────────────────┘`}
    >
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-6">
        <Stat label="Active Triggers" value="14,288" accent="cyan" />
        <Stat label="Wallets Subscribed" value="12,416" accent="green" />
        <Stat label="Notifications / day" value="48,201" accent="purple" />
        <Stat label="Avg Latency" value="2.4s" hint="block-to-channel" accent="pink" />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Terminal title="auto://triggers" subtitle="DSL" accent="cyan" className="lg:col-span-7">
          <pre className="ascii text-[12.5px] text-white/85 leading-snug">{`reminder "AUTO unlock alert" {
  trigger = on cliff(wallet: $me, mint: $AUTO)
  send    = telegram($me.tg)
  body    = "your $AUTO cliff just hit. {amount} unlocked."
}

reminder "Price flag" {
  trigger = px(AUTO/USDC) >= 0.05
  cool    = 30m
  send    = webhook("https://hooks.you/auto-flag")
}

reminder "Validator epoch end" {
  trigger = epoch_end(validator: $v)
  send    = discord($me.dc)
}

reminder "SOL low" {
  trigger = sol_balance($me) < 0.1
  send    = email($me.email)
  body    = "wallet running low on SOL — top up before tx fail."
}`}</pre>
        </Terminal>

        <Terminal title="auto://templates" subtitle="one-click" accent="purple" className="lg:col-span-5">
          {REMINDER_TEMPLATES.map((r) => (
            <div
              key={r.name}
              className="flex items-center justify-between gap-2 py-1.5 border-b border-sol-purple/10"
            >
              <div>
                <div className="text-white text-sm">{r.name}</div>
                <div className="text-[11px] text-terminal-dim font-mono">{r.trigger}</div>
              </div>
              <div className="font-mono text-[10px] text-sol-cyan uppercase border border-sol-cyan/30 rounded px-2 py-0.5">
                via {r.channel}
              </div>
            </div>
          ))}
        </Terminal>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Terminal title="auto://feed" subtitle="last 8 events" accent="green" height="280px">
          {[
            { t: "00:00:01", e: "px(AUTO/USDC) ≥ 0.05", w: "5K9…r1Pq", c: "telegram", s: "ok" },
            { t: "00:00:04", e: "cliff(WIF)", w: "Bk2…0Lww", c: "discord", s: "ok" },
            { t: "00:00:09", e: "sol_balance < 0.1", w: "Hu7…44Ax", c: "email", s: "ok" },
            { t: "00:00:14", e: "new_proposal(MNDE)", w: "Tz3…91Cm", c: "webhook", s: "ok" },
            { t: "00:00:21", e: "epoch_end(validator)", w: "Q9R…s7Tn", c: "telegram", s: "ok" },
            { t: "00:00:28", e: "px(JUP/USDC) ≤ 0.85", w: "Pn4…2bZk", c: "discord", s: "ok" },
            { t: "00:00:33", e: "vest_unlock(JTO)", w: "1aB…dD2c", c: "telegram", s: "rate-limit" },
            { t: "00:00:39", e: "px(AUTO/USDC) ≥ 0.05", w: "TyJ…8fEr", c: "webhook", s: "ok" },
          ].map((r, i) => (
            <div key={i} className="grid grid-cols-[60px_1fr_80px_70px_70px] gap-2 text-[11.5px] py-0.5">
              <span className="text-terminal-dim">{r.t}</span>
              <span className="text-white truncate">{r.e}</span>
              <span className="text-terminal-dim font-mono truncate">{r.w}</span>
              <span className="text-sol-cyan">{r.c}</span>
              <span className={r.s === "ok" ? "text-sol-green" : "text-terminal-amber"}>{r.s}</span>
            </div>
          ))}
        </Terminal>

        <Terminal title="auto://channels" subtitle="delivery" accent="amber">
          <Line prompt="◆" promptColor="text-terminal-amber">
            <span className="text-white">telegram:</span> bot @auto_reminder_bot · /auth tg
          </Line>
          <Line prompt="◆" promptColor="text-terminal-amber">
            <span className="text-white">discord:</span> /link discord · DM-only by default
          </Line>
          <Line prompt="◆" promptColor="text-terminal-amber">
            <span className="text-white">email:</span> SES-backed · DKIM · ENS-resolvable
          </Line>
          <Line prompt="◆" promptColor="text-terminal-amber">
            <span className="text-white">webhook:</span> POST JSON · HMAC-SHA256 signed
          </Line>
          <Line prompt="◆" promptColor="text-terminal-amber">
            <span className="text-white">on-chain log:</span> emit_cpi from program · for indexers
          </Line>
          <Line prompt="◆" promptColor="text-terminal-amber">
            <span className="text-white">cost:</span> 1 $AUTO / 1,000 reminders, prepaid
          </Line>
        </Terminal>
      </div>
    </TerminalShell>
  );
}
