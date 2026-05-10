import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/tokenomics", label: "Tokenomics" },
  { href: "/terminals/trading", label: "Trader" },
  { href: "/terminals/amm", label: "AMM" },
  { href: "/terminals/promotions", label: "Promo" },
  { href: "/terminals/airdrop", label: "Airdrop" },
  { href: "/terminals/reminders", label: "Reminders" },
  { href: "/manifesto", label: "Manifesto" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-sol-purple/20 bg-bg/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link href="/" className="group flex items-center gap-2">
          <div className="relative h-7 w-7">
            <div className="absolute inset-0 rounded-sm bg-auto-grad blur-md opacity-70 group-hover:opacity-100 transition" />
            <div className="relative flex h-7 w-7 items-center justify-center rounded-sm bg-bg-card border border-sol-purple/60 font-mono text-[10px] font-bold text-sol-green">
              $A
            </div>
          </div>
          <span className="font-display text-lg tracking-[0.18em] text-grad">$AUTO</span>
          <span className="hidden md:inline font-mono text-[10px] text-terminal-dim ml-2">
            //automated-automations
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-1 font-mono text-xs uppercase">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="px-3 py-1.5 rounded-sm text-terminal-dim hover:text-sol-green hover:bg-sol-purple/10 transition"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a
            href="#launch"
            className="btn-neon text-xs"
          >
            Connect
          </a>
        </div>
      </div>
      <Marquee />
    </header>
  );
}

function Marquee() {
  const items = [
    "FULLY AUTOMATED",
    "ZERO EMOTIONS",
    "MAXIMUM EXTRACTION",
    "BUYBACK ▲",
    "RESERVE LOCKED ✕ NEVER SELLS",
    "SOLANA ◎",
    "TAX 5% → 50% RESERVE / 50% LP",
    "AUTO//TRADER ONLINE",
    "AUTO//AMM ONLINE",
    "AUTO//PROMO ONLINE",
    "AUTO//DROP ONLINE",
    "AUTO//REMIND ONLINE",
  ];
  const doubled = [...items, ...items];
  return (
    <div className="overflow-hidden border-t border-sol-purple/15 bg-bg-panel/60">
      <div className="flex whitespace-nowrap animate-marquee">
        {doubled.map((t, i) => (
          <span
            key={i}
            className="font-mono text-[11px] tracking-[0.22em] px-6 py-1 text-terminal-dim"
          >
            <span className="text-sol-green">●</span> {t}
          </span>
        ))}
      </div>
    </div>
  );
}
