import { TOKEN } from "@/lib/mock";

export function TaxFlow() {
  return (
    <div className="panel rounded p-6 md:p-8 relative overflow-hidden">
      <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-sol-green/15 blur-3xl" />
      <div className="absolute -left-10 -bottom-10 h-48 w-48 rounded-full bg-sol-purple/20 blur-3xl" />

      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-sol-green mb-2">
        <span className="text-sol-purple">▸</span> on-chain tax flow
      </div>
      <div className="font-display text-2xl md:text-3xl tracking-tight">
        Every transfer feeds the <span className="text-grad">organism</span>.
      </div>
      <p className="mt-2 font-mono text-sm text-terminal-dim max-w-2xl">
        The SPL Token-2022 transfer-fee extension siphons {TOKEN.taxBps / 100}% from each move.
        Half is auto-swapped and locked in a withdraw-less PDA. The other half compounds the
        AUTO/SOL liquidity pool.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-[1fr_auto_1fr]">
        <Box
          title="TRANSFER"
          accent="text-sol-cyan"
          dot="bg-sol-cyan"
          lines={[
            "wallet_a → wallet_b",
            "amount: 10,000 $AUTO",
            "fee: 500 $AUTO (5%)",
          ]}
        />
        <div className="hidden md:flex flex-col items-center justify-center text-sol-green text-3xl font-mono">
          <span className="animate-pulse">▶</span>
          <span className="text-[10px] text-terminal-dim mt-2">harvest</span>
        </div>
        <div className="grid gap-3">
          <Box
            title="50% RESERVE"
            accent="text-sol-green"
            dot="bg-sol-green"
            highlight="border-sol-green/40"
            lines={[
              "swap SOL → $AUTO via Jupiter",
              "send → reserve PDA (sealed)",
              "withdraw_authority = None",
              "→ permanent buyback ▲",
            ]}
          />
          <Box
            title="50% LP"
            accent="text-sol-pink"
            dot="bg-sol-pink"
            highlight="border-sol-pink/40"
            lines={[
              "pair: AUTO/SOL on Raydium",
              "auto-compound LP fees",
              "tighten range every 6m",
              "→ deeper liquidity ▲",
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function Box({
  title,
  accent,
  dot,
  lines,
  highlight,
}: {
  title: string;
  accent: string;
  dot: string;
  lines: string[];
  highlight?: string;
}) {
  return (
    <div className={`rounded border bg-bg-card/60 p-4 font-mono text-xs ${highlight ?? "border-sol-purple/25"}`}>
      <div className={`flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] ${accent}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dot} animate-pulse`} />
        {title}
      </div>
      <ul className="mt-3 space-y-1.5 text-white/80">
        {lines.map((l) => (
          <li key={l} className="flex gap-2">
            <span className="text-sol-green">›</span>
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
