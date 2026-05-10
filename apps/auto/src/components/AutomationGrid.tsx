import Link from "next/link";
import { AUTOMATIONS } from "@/lib/mock";
import { ArrowUpRight } from "lucide-react";

const accentMap: Record<string, { ring: string; text: string; glow: string; chip: string }> = {
  "sol-green": {
    ring: "hover:border-sol-green/60",
    text: "text-sol-green",
    glow: "group-hover:shadow-neon-green",
    chip: "bg-sol-green/15 text-sol-green border-sol-green/30",
  },
  "sol-cyan": {
    ring: "hover:border-sol-cyan/60",
    text: "text-sol-cyan",
    glow: "group-hover:shadow-neon-cyan",
    chip: "bg-sol-cyan/15 text-sol-cyan border-sol-cyan/30",
  },
  "sol-pink": {
    ring: "hover:border-sol-pink/60",
    text: "text-sol-pink",
    glow: "group-hover:shadow-neon-pink",
    chip: "bg-sol-pink/15 text-sol-pink border-sol-pink/30",
  },
  "sol-purple": {
    ring: "hover:border-sol-purple/60",
    text: "text-sol-purple",
    glow: "group-hover:shadow-neon-purple",
    chip: "bg-sol-purple/15 text-sol-purple border-sol-purple/30",
  },
  "sol-magenta": {
    ring: "hover:border-sol-pink/60",
    text: "text-sol-pink",
    glow: "group-hover:shadow-neon-pink",
    chip: "bg-sol-pink/15 text-sol-pink border-sol-pink/30",
  },
};

export function AutomationGrid() {
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {AUTOMATIONS.map((a) => {
        const c = accentMap[a.color] || accentMap["sol-green"];
        return (
          <Link
            key={a.slug}
            href={`/terminals/${a.slug}`}
            className={`panel rounded p-6 transition-all duration-200 group ${c.ring} ${c.glow}`}
          >
            <div className="flex items-start justify-between">
              <div className={`font-mono text-[11px] uppercase tracking-[0.22em] ${c.text}`}>
                <span className="text-terminal-dim">module:</span> {a.slug}
              </div>
              <ArrowUpRight className={`h-4 w-4 ${c.text} opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform`} />
            </div>
            <div className={`mt-4 font-display text-2xl tracking-wider ${c.text}`}>{a.name}</div>
            <div className="mt-1 font-mono text-xs text-terminal-dim/90">{a.tagline}</div>
            <p className="mt-4 text-sm text-white/75 leading-relaxed">{a.description}</p>
            <div className="mt-5 flex items-center gap-2 font-mono text-[10px]">
              <span className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 ${c.chip}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                ONLINE
              </span>
              <span className="text-terminal-dim">slot 287_104_882</span>
            </div>
          </Link>
        );
      })}
      <PingCard />
    </div>
  );
}

function PingCard() {
  return (
    <div className="panel rounded p-6 flex flex-col justify-between border-dashed border-sol-purple/30">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-terminal-amber">
          module: <span className="text-sol-green">tbd</span>
        </div>
        <div className="mt-4 font-display text-2xl tracking-wider text-grad">AUTO//???</div>
        <div className="mt-1 font-mono text-xs text-terminal-dim/90">
          The next automation is decided by the DAO of automations.
        </div>
      </div>
      <div className="mt-5 font-mono text-[10px] text-terminal-dim">
        <span className="text-sol-green">▸</span> propose at <span className="text-white">/manifesto</span>
      </div>
    </div>
  );
}
