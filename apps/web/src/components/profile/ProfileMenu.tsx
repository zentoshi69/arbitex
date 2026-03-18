"use client";

import { useMemo, useState } from "react";
import { useWallet } from "@/components/wallet/WalletProvider";
import { getRole } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { createPublicClient, formatUnits, http } from "viem";
import { avalanche } from "viem/chains";
import { useQuery } from "@tanstack/react-query";

const CHAIN_ID = 43114;
const WAVAX = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";
const WRP = "0xB80d374AE04a4147Cf1269Aad5cA1ea8F97b38f8";
const USDC = "0xc3aAB273A055AD9Bc4e781A9c385b9fed5Bb677e";

const UNISWAPV2_FACTORY_ABI = [
  { type: "function", name: "getPair", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "address" }] },
] as const;

const UNISWAPV2_PAIR_ABI = [
  { type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

function parseAllowlist(): Set<string> {
  const raw = process.env["NEXT_PUBLIC_PROFILE_ALLOWLIST"] ?? "";
  const items = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set(items);
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function ProfileMenu() {
  const wallet = useWallet();
  const role = useMemo(() => getRole(), []);
  const allowlist = useMemo(() => parseAllowlist(), []);
  const [open, setOpen] = useState(false);

  const allowed =
    wallet.connected &&
    !!wallet.address &&
    allowlist.size > 0 &&
    allowlist.has(wallet.address.toLowerCase());

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: avalanche,
        transport: http("https://api.avax.network/ext/bc/C/rpc"),
      }),
    []
  );

  const statsQ = useQuery({
    queryKey: ["profile-stats", wallet.address],
    enabled: allowed && wallet.chainId === CHAIN_ID,
    refetchInterval: 15_000,
    queryFn: async () => {
      // Uses Pangolin/venue selection indirectly; for now we estimate from the common pairs assuming
      // the venue factories are configured in DB and used elsewhere. This is a lightweight on-chain snapshot:
      // Find LP positions on the pair contracts via factories saved in localStorage (from TopBar venue selection).
      const factories = [
        localStorage.getItem("arbitex_venue_blackhole_v2_factory") ?? "",
        localStorage.getItem("arbitex_venue_pangolin_v2_factory") ?? "",
      ].filter((x) => /^0x[a-fA-F0-9]{40}$/.test(x));

      if (factories.length === 0) {
        return { pools: 0, injectedUsd: null as number | null, lp: [] as any[] };
      }

      const addr = wallet.address!;
      const out: any[] = [];

      // try each factory until we find a pair
      async function resolvePair(tokenA: string, tokenB: string) {
        for (const f of factories) {
          const pair = (await publicClient.readContract({
            address: f as `0x${string}`,
            abi: UNISWAPV2_FACTORY_ABI,
            functionName: "getPair",
            args: [tokenA as `0x${string}`, tokenB as `0x${string}`],
          })) as string;
          if (pair && pair !== "0x0000000000000000000000000000000000000000") return pair;
        }
        return null;
      }

      const pairs = [
        { name: "WRP/USDC", a: WRP, b: USDC },
        { name: "WRP/AVAX", a: WRP, b: WAVAX },
      ];

      let injectedUsd = 0;
      let pools = 0;

      for (const p of pairs) {
        const pair = await resolvePair(p.a, p.b);
        if (!pair) continue;

        const [reserves, ts, bal] = await Promise.all([
          publicClient.readContract({ address: pair as `0x${string}`, abi: UNISWAPV2_PAIR_ABI, functionName: "getReserves" }),
          publicClient.readContract({ address: pair as `0x${string}`, abi: UNISWAPV2_PAIR_ABI, functionName: "totalSupply" }),
          publicClient.readContract({ address: pair as `0x${string}`, abi: UNISWAPV2_PAIR_ABI, functionName: "balanceOf", args: [addr] }),
        ]);
        const [r0, r1] = reserves as readonly [bigint, bigint, number];
        const totalSupply = ts as bigint;
        const lpBal = bal as bigint;
        if (lpBal <= 0n || totalSupply <= 0n) continue;

        pools += 1;

        // rough “injected” estimate: your pro-rata reserves. We can only provide a meaningful USD
        // estimate if USDC is on one side; otherwise we leave it null.
        const shareBps = Number((lpBal * 10_000n) / totalSupply);
        const my0 = (lpBal * r0) / totalSupply;
        const my1 = (lpBal * r1) / totalSupply;

        let usd = null as number | null;
        if (p.name === "WRP/USDC") {
          // assume tokenB is USDC with 6 decimals; token0/1 ordering unknown, so we can’t safely compute here
          // without reading token0/token1. Keep as null; still show LP balance and share.
          usd = null;
        }

        out.push({ name: p.name, pair, lpBal: lpBal.toString(), shareBps, injectedUsd: usd });
      }

      return { pools, injectedUsd: Number.isFinite(injectedUsd) ? injectedUsd : null, lp: out };
    },
  });

  if (!allowed) return null;

  const avatarText = (wallet.address ?? "0x").slice(2, 4).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-[30px] w-[30px] rounded-full border border-[var(--ax-border-hi)] flex items-center justify-center"
        style={{ background: "rgba(255,255,255,0.03)" }}
        title="Profile"
      >
        <span className="text-[10px] font-mono text-[var(--ax-off-white)]">{avatarText}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[320px] ax-panel p-4 z-50"
          role="menu"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[9px] tracking-[0.14em] uppercase text-[var(--ax-muted)]">Operator</div>
              <div className="mt-1 text-sm font-semibold text-[var(--ax-white)]">{shortAddr(wallet.address!)}</div>
              <div className="mt-1 text-[11px] text-[var(--ax-dim)] font-mono">{role ?? "—"}</div>
            </div>
            <span
              className="px-2 py-1 rounded-[2px] border text-[10px] font-mono tracking-wider"
              style={{ borderColor: "rgba(232,65,66,0.35)", color: "var(--ax-off-white)", background: "rgba(232,65,66,0.08)" }}
            >
              WARP CLIENT
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Info label="Pools injected" value={statsQ.data?.pools ?? "—"} />
            <Info label="Fees earned" value={"—"} dimNote="coming soon" />
            <Info label="LP injected (USD)" value={"—"} dimNote="estimate" />
            <Info label="Access" value="Allowlisted" />
          </div>

          <div className="mt-3 text-[10px] text-[var(--ax-muted)]">
            Restricted access: only allowlisted wallets can view this profile.
          </div>
        </div>
      )}
    </div>
  );
}

function Info(props: { label: string; value: any; dimNote?: string }) {
  return (
    <div className="rounded-[2px] p-3 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "var(--ax-border)" }}>
      <div className="text-[9px] tracking-[0.12em] uppercase text-[var(--ax-muted)]">{props.label}</div>
      <div className="mt-1 font-mono text-[11px] font-medium text-[var(--ax-off-white)]">
        {String(props.value)}
        {props.dimNote ? <span className="ml-2 text-[10px] text-[var(--ax-muted)]">{props.dimNote}</span> : null}
      </div>
    </div>
  );
}

