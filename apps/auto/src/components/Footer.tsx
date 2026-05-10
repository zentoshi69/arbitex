import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-sol-purple/20 bg-bg-panel/60">
      <div className="mx-auto max-w-7xl px-6 py-10 grid gap-8 md:grid-cols-4">
        <div>
          <div className="font-display text-grad text-2xl tracking-[0.2em]">$AUTO</div>
          <p className="mt-3 font-mono text-xs text-terminal-dim leading-relaxed">
            The first fully autonomous liquidity organism. Tax 5% — split 50/50 between a
            permanent buyback reserve (PDA, no withdraw) and the AUTO/SOL LP pool.
          </p>
        </div>
        <div>
          <div className="font-mono text-xs text-sol-green uppercase tracking-widest mb-3">Terminals</div>
          <ul className="space-y-1.5 font-mono text-sm text-terminal-dim">
            <li><Link href="/terminals/trading" className="hover:text-white">// trader</Link></li>
            <li><Link href="/terminals/amm" className="hover:text-white">// amm</Link></li>
            <li><Link href="/terminals/promotions" className="hover:text-white">// promo</Link></li>
            <li><Link href="/terminals/airdrop" className="hover:text-white">// airdrop</Link></li>
            <li><Link href="/terminals/reminders" className="hover:text-white">// reminders</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-mono text-xs text-sol-green uppercase tracking-widest mb-3">Protocol</div>
          <ul className="space-y-1.5 font-mono text-sm text-terminal-dim">
            <li><Link href="/tokenomics" className="hover:text-white">// tokenomics</Link></li>
            <li><Link href="/manifesto" className="hover:text-white">// manifesto</Link></li>
            <li><a href="#contract" className="hover:text-white">// contract</a></li>
            <li><a href="#audit" className="hover:text-white">// audit</a></li>
          </ul>
        </div>
        <div>
          <div className="font-mono text-xs text-sol-green uppercase tracking-widest mb-3">Channels</div>
          <ul className="space-y-1.5 font-mono text-sm text-terminal-dim">
            <li><a className="hover:text-white" href="#">// x.com/autoautomations</a></li>
            <li><a className="hover:text-white" href="#">// t.me/autoautomations</a></li>
            <li><a className="hover:text-white" href="#">// discord/autoautomations</a></li>
            <li><a className="hover:text-white" href="#">// github/autoautomations</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-sol-purple/15 px-6 py-4 font-mono text-[11px] text-terminal-dim flex flex-col md:flex-row items-center justify-between gap-2">
        <span>$AUTO is a utility token. No promises of profit. Verify the program ID before interacting.</span>
        <span className="text-sol-green">SYSTEM://AUTOMATING.AUTOMATIONS — UPTIME 100%</span>
      </div>
    </footer>
  );
}
