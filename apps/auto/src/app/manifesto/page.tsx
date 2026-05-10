import { Terminal, Line } from "@/components/Terminal";

export default function ManifestoPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-sol-green mb-3">
        <span className="text-sol-purple">▸</span> /manifesto
      </div>
      <h1 className="font-display text-4xl md:text-6xl tracking-tight">
        Automate <span className="text-grad">Everything</span>.
      </h1>

      <div className="mt-8 panel rounded p-8 md:p-10 space-y-6 font-mono text-[14px] leading-relaxed text-white/85">
        <p>
          <span className="text-sol-green">$ </span>
          We do not believe humans should manage liquidity. Humans sleep, panic, fade,
          and revenge-trade. Robots do not.
        </p>
        <p>
          <span className="text-sol-green">$ </span>
          $AUTO is a coordinated colony of small autonomous programs. Each one does
          one job. Each one runs forever. Together they form a liquidity organism
          that grows in the only directions tokenomics allows it to grow:
          <span className="text-sol-pink"> reserve up</span>,{" "}
          <span className="text-sol-cyan">LP up</span>.
        </p>
        <p>
          <span className="text-sol-green">$ </span>
          The reserve cannot be drained. The protocol cannot be upgraded.
          The team cannot mint more. There is no insider tier. There is no revenue line that
          isn't reinvested into the colony.
        </p>
        <p>
          <span className="text-sol-green">$ </span>
          What you can do: hold $AUTO, deploy a terminal, propose a new automation,
          claim an airdrop, or just watch the reserve number go up. All of these
          are equivalent forms of participation.
        </p>
        <p className="text-sol-green glow-text-green">
          $ The first fully autonomous liquidity organism. Make liquidity a verb.
        </p>
      </div>

      <div className="mt-12">
        <Terminal title="auto://principles" accent="purple">
          <Line prompt="01" promptColor="text-sol-purple">no team multisig can move the reserve.</Line>
          <Line prompt="02" promptColor="text-sol-purple">no upgradeable program. ship once, run forever.</Line>
          <Line prompt="03" promptColor="text-sol-purple">no private allocation cheaper than the public price.</Line>
          <Line prompt="04" promptColor="text-sol-purple">no automation that targets users adversarially.</Line>
          <Line prompt="05" promptColor="text-sol-purple">no off-chain trust. every action verifiable on Solana.</Line>
          <Line prompt="06" promptColor="text-sol-purple">no humans in the hot path.</Line>
        </Terminal>
      </div>
    </div>
  );
}
