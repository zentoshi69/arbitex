"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useDexVenueIds } from "@/hooks/useDexVenueIds";
import { SectionHeader, EmptyState, AddressCell } from "@/components/ui";
import { cn } from "@/lib/utils";
import { createPublicClient, formatUnits, http, parseUnits } from "viem";
import { avalanche } from "viem/chains";

const CHAIN_ID = 43114;
const WAVAX = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";
const WRP = "0xB80d374AE04a4147Cf1269Aad5cA1ea8F97b38f8";
const USDC = "0xc3aAB273A055AD9Bc4e781A9c385b9fed5Bb677e";

const UNISWAPV2_FACTORY_ABI = [
  { type: "function", name: "getPair", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "address" }] },
] as const;

const UNISWAPV2_PAIR_ABI = [
  { type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }] },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const ERC20_ABI = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

const UNISWAPV2_ROUTER_ABI = [
  {
    type: "function",
    name: "addLiquidity",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "tokenA" },
      { type: "address", name: "tokenB" },
      { type: "uint256", name: "amountADesired" },
      { type: "uint256", name: "amountBDesired" },
      { type: "uint256", name: "amountAMin" },
      { type: "uint256", name: "amountBMin" },
      { type: "address", name: "to" },
      { type: "uint256", name: "deadline" },
    ],
    outputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
  },
  {
    type: "function",
    name: "removeLiquidity",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "tokenA" },
      { type: "address", name: "tokenB" },
      { type: "uint256", name: "liquidity" },
      { type: "uint256", name: "amountAMin" },
      { type: "uint256", name: "amountBMin" },
      { type: "address", name: "to" },
      { type: "uint256", name: "deadline" },
    ],
    outputs: [{ type: "uint256" }, { type: "uint256" }],
  },
] as const;

function applySlippageMin(amount: bigint, bps: number) {
  const b = BigInt(Math.max(0, Math.min(10_000, bps)));
  return (amount * (10_000n - b)) / 10_000n;
}

function isHexAddress(v: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(v.trim());
}

type Venue = { id: string; chainId: number; name: string; protocol: string; routerAddress: string; factoryAddress?: string | null };

export default function LpPage() {
  const wallet = useWallet();
  const { pangolinVenueId, blackholeVenueId } = useDexVenueIds();

  const venuesQ = useQuery({
    queryKey: ["venues-lp-page"],
    queryFn: () => api.venues.list(),
    refetchInterval: 60_000,
  });

  const venueById = useMemo(() => {
    const m = new Map<string, Venue>();
    for (const v of venuesQ.data ?? []) m.set(v.id, v);
    return m;
  }, [venuesQ.data]);

  const pangolin = pangolinVenueId ? venueById.get(pangolinVenueId) : undefined;
  const blackhole = blackholeVenueId ? venueById.get(blackholeVenueId) : undefined;

  return (
    <div className="space-y-4 max-w-[1100px]">
      <SectionHeader
        title="Liquidity (V2)"
        description="Add/remove LP from WRP/AVAX and WRP/USDC using your connected wallet."
        action={
          wallet.available && !wallet.connected ? (
            <button
              onClick={() => wallet.connect().catch(() => {})}
              className="px-3 py-2 rounded-[2px] bg-[var(--ax-red)] hover:opacity-90 text-white text-sm font-semibold"
            >
              Connect wallet
            </button>
          ) : null
        }
      />

      {!wallet.available && (
        <div className="ax-panel">
          <EmptyState message="No browser wallet detected. Install MetaMask (or another EIP-1193 wallet) to add/remove liquidity." />
        </div>
      )}

      {wallet.available && !wallet.connected && (
        <div className="ax-panel p-4 flex items-center justify-between gap-4">
          <div className="text-sm text-[var(--ax-dim)]">
            Connect your wallet to manage LP.
          </div>
        </div>
      )}

      {wallet.connected && wallet.chainId !== CHAIN_ID && (
        <div className="ax-panel px-4 py-3 text-sm flex items-center justify-between gap-4" style={{ background: "rgba(232,65,66,0.08)", borderColor: "rgba(232,65,66,0.25)" }}>
          <div className="text-[var(--ax-off-white)]">Switch your wallet to Avalanche C-Chain (43114) to use LP actions.</div>
          <button
            onClick={() => wallet.switchToAvalanche().catch(() => {})}
            className="px-3 py-2 rounded-[2px] bg-[var(--ax-red)] hover:opacity-90 text-white text-sm font-semibold"
          >
            Switch network
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        <PoolCard
          label="WRP / AVAX (WAVAX)"
          venue={blackhole ?? pangolin}
          hint={blackhole ? "Using Blackhole venue" : "Using Pangolin venue (fallback — set Blackhole venue in TopBar ▸ Venues)"}
          tokenA={WRP}
          tokenB={WAVAX}
        />
        <PoolCard
          label="WRP / USDC"
          venue={pangolin}
          hint={pangolin ? "Using Pangolin venue" : "Set Pangolin venue in TopBar ▸ Venues"}
          tokenA={WRP}
          tokenB={USDC}
        />
      </div>
    </div>
  );
}

function PoolCard(props: { label: string; hint: string; venue?: Venue; tokenA: string; tokenB: string }) {
  const wallet = useWallet();
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [slippageBps, setSlippageBps] = useState(50);
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [liq, setLiq] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: avalanche,
        transport: http("https://api.avax.network/ext/bc/C/rpc"),
      }),
    []
  );

  const infoQ = useQuery({
    queryKey: ["lp-card", props.venue?.id, props.tokenA, props.tokenB, wallet.address],
    enabled: !!props.venue?.factoryAddress && !!props.venue?.routerAddress && isHexAddress(props.venue.factoryAddress!) && wallet.connected,
    refetchInterval: 10_000,
    queryFn: async () => {
      const factory = props.venue!.factoryAddress as `0x${string}`;
      const router = props.venue!.routerAddress as `0x${string}`;
      const pair = (await publicClient.readContract({
        address: factory,
        abi: UNISWAPV2_FACTORY_ABI,
        functionName: "getPair",
        args: [props.tokenA as `0x${string}`, props.tokenB as `0x${string}`],
      })) as string;

      if (!pair || pair === "0x0000000000000000000000000000000000000000") {
        return { factory, router, pair: null as string | null };
      }

      const [token0, token1, reserves, totalSupply, lpBal] = await Promise.all([
        publicClient.readContract({ address: pair as `0x${string}`, abi: UNISWAPV2_PAIR_ABI, functionName: "token0" }),
        publicClient.readContract({ address: pair as `0x${string}`, abi: UNISWAPV2_PAIR_ABI, functionName: "token1" }),
        publicClient.readContract({ address: pair as `0x${string}`, abi: UNISWAPV2_PAIR_ABI, functionName: "getReserves" }),
        publicClient.readContract({ address: pair as `0x${string}`, abi: UNISWAPV2_PAIR_ABI, functionName: "totalSupply" }),
        publicClient.readContract({ address: pair as `0x${string}`, abi: UNISWAPV2_PAIR_ABI, functionName: "balanceOf", args: [wallet.address!] }),
      ]);
      const [r0, r1] = reserves as readonly [bigint, bigint, number];

      const [symA, decA, symB, decB, balA, balB] = await Promise.all([
        publicClient.readContract({ address: props.tokenA as `0x${string}`, abi: ERC20_ABI, functionName: "symbol" }).catch(() => "A"),
        publicClient.readContract({ address: props.tokenA as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" }).catch(() => 18),
        publicClient.readContract({ address: props.tokenB as `0x${string}`, abi: ERC20_ABI, functionName: "symbol" }).catch(() => "B"),
        publicClient.readContract({ address: props.tokenB as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" }).catch(() => 18),
        publicClient.readContract({ address: props.tokenA as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf", args: [wallet.address!] }).catch(() => 0n),
        publicClient.readContract({ address: props.tokenB as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf", args: [wallet.address!] }).catch(() => 0n),
      ]);

      return {
        factory,
        router,
        pair,
        token0: String(token0),
        token1: String(token1),
        reserves: { reserve0: r0.toString(), reserve1: r1.toString() },
        lp: { balance: (lpBal as bigint).toString(), totalSupply: (totalSupply as bigint).toString() },
        tokenA: { symbol: String(symA), decimals: Number(decA) },
        tokenB: { symbol: String(symB), decimals: Number(decB) },
        balances: { tokenA: (balA as bigint).toString(), tokenB: (balB as bigint).toString() },
      };
    },
  });

  async function ensureApprove(token: `0x${string}`, spender: `0x${string}`, amount: bigint) {
    if (!wallet.walletClient || !wallet.address) throw new Error("Wallet not connected");
    const allowance = (await publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [wallet.address, spender],
    })) as bigint;
    if (allowance >= amount) return null;
    return wallet.walletClient.writeContract({
      chain: avalanche,
      address: token,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, amount],
      account: wallet.address,
    });
  }

  async function onAdd() {
    setMsg(null);
    try {
      if (!wallet.connected || wallet.chainId !== CHAIN_ID) throw new Error("Connect wallet on Avalanche");
      const router = infoQ.data?.router as `0x${string}` | undefined;
      if (!router) throw new Error("Missing router (select venue)");
      const decA = infoQ.data?.tokenA?.decimals ?? 18;
      const decB = infoQ.data?.tokenB?.decimals ?? 18;
      const a = parseUnits(amountA.trim() || "0", decA);
      const b = parseUnits(amountB.trim() || "0", decB);
      if (a <= 0n || b <= 0n) throw new Error("Amounts must be > 0");

      const apA = await ensureApprove(props.tokenA as `0x${string}`, router, a);
      if (apA) setMsg(`approve tx: ${apA}`);
      const apB = await ensureApprove(props.tokenB as `0x${string}`, router, b);
      if (apB) setMsg(`approve tx: ${apB}`);

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
      const tx = await wallet.walletClient!.writeContract({
        chain: avalanche,
        address: router,
        abi: UNISWAPV2_ROUTER_ABI,
        functionName: "addLiquidity",
        args: [
          props.tokenA as `0x${string}`,
          props.tokenB as `0x${string}`,
          a,
          b,
          applySlippageMin(a, slippageBps),
          applySlippageMin(b, slippageBps),
          wallet.address!,
          deadline,
        ],
        account: wallet.address!,
      });
      setMsg(`addLiquidity tx: ${tx}`);
      infoQ.refetch();
    } catch (e: any) {
      setMsg(e?.message ?? "Add failed");
    }
  }

  async function onRemove() {
    setMsg(null);
    try {
      if (!wallet.connected || wallet.chainId !== CHAIN_ID) throw new Error("Connect wallet on Avalanche");
      const router = infoQ.data?.router as `0x${string}` | undefined;
      const pair = infoQ.data?.pair as `0x${string}` | undefined;
      if (!router) throw new Error("Missing router (select venue)");
      if (!pair) throw new Error("Pair not found");

      const liquidity = parseUnits(liq.trim() || "0", 18);
      if (liquidity <= 0n) throw new Error("LP amount must be > 0");

      const ap = await ensureApprove(pair, router, liquidity);
      if (ap) setMsg(`approve LP tx: ${ap}`);

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
      const tx = await wallet.walletClient!.writeContract({
        chain: avalanche,
        address: router,
        abi: UNISWAPV2_ROUTER_ABI,
        functionName: "removeLiquidity",
        args: [
          props.tokenA as `0x${string}`,
          props.tokenB as `0x${string}`,
          liquidity,
          0n,
          0n,
          wallet.address!,
          deadline,
        ],
        account: wallet.address!,
      });
      setMsg(`removeLiquidity tx: ${tx}`);
      infoQ.refetch();
    } catch (e: any) {
      setMsg(e?.message ?? "Remove failed");
    }
  }

  const symA = infoQ.data?.tokenA?.symbol ?? "TokenA";
  const symB = infoQ.data?.tokenB?.symbol ?? "TokenB";
  const decA = infoQ.data?.tokenA?.decimals ?? 18;
  const decB = infoQ.data?.tokenB?.decimals ?? 18;
  const balA = infoQ.data?.balances?.tokenA ? formatUnits(BigInt(infoQ.data.balances.tokenA), decA) : "—";
  const balB = infoQ.data?.balances?.tokenB ? formatUnits(BigInt(infoQ.data.balances.tokenB), decB) : "—";
  const lpBal = infoQ.data?.lp?.balance ? formatUnits(BigInt(infoQ.data.lp.balance), 18) : "—";

  return (
    <div className="ax-panel p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--ax-white)]">{props.label}</div>
          <div className="text-[11px] text-[var(--ax-muted)] mt-1">{props.hint}</div>
          <div className="text-[11px] text-[var(--ax-muted)] font-mono truncate mt-1">
            {props.tokenA} · {props.tokenB}
          </div>
          {infoQ.data?.pair && (
            <div className="text-[11px] text-[var(--ax-dim)] mt-1">
              Pair: <AddressCell address={infoQ.data.pair} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode("add")}
            className={cn(
              "px-3 py-1.5 rounded-[2px] text-xs font-semibold border",
              mode === "add"
                ? "bg-[var(--ax-red)] text-white border-[rgba(232,65,66,0.6)]"
                : "bg-transparent text-[var(--ax-dim)] border-[var(--ax-border-hi)] hover:text-[var(--ax-white)]"
            )}
          >
            Add
          </button>
          <button
            onClick={() => setMode("remove")}
            className={cn(
              "px-3 py-1.5 rounded-[2px] text-xs font-semibold border",
              mode === "remove"
                ? "bg-[var(--ax-red)] text-white border-[rgba(232,65,66,0.6)]"
                : "bg-transparent text-[var(--ax-dim)] border-[var(--ax-border-hi)] hover:text-[var(--ax-white)]"
            )}
          >
            Remove
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        <div className="rounded-[2px] p-3 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "var(--ax-border)" }}>
          <div className="text-[9px] tracking-[0.12em] uppercase text-[var(--ax-muted)]">Wallet balances</div>
          <div className="font-mono text-[var(--ax-off-white)] truncate mt-1">
            {balA} {symA} / {balB} {symB}
          </div>
        </div>
        <div className="rounded-[2px] p-3 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "var(--ax-border)" }}>
          <div className="text-[9px] tracking-[0.12em] uppercase text-[var(--ax-muted)]">Reserves (raw)</div>
          <div className="font-mono text-[var(--ax-off-white)] truncate mt-1">
            {(infoQ.data?.reserves?.reserve0 ?? "—")} / {(infoQ.data?.reserves?.reserve1 ?? "—")}
          </div>
        </div>
        <div className="rounded-[2px] p-3 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "var(--ax-border)" }}>
          <div className="text-[9px] tracking-[0.12em] uppercase text-[var(--ax-muted)]">Your LP balance</div>
          <div className="font-mono text-[var(--ax-off-white)] truncate mt-1">{lpBal}</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-[9px] tracking-[0.12em] uppercase text-[var(--ax-muted)]">Slippage (bps)</label>
          <input
            value={slippageBps}
            onChange={(e) => setSlippageBps(Number(e.target.value))}
            className="w-24 h-8 rounded-[2px] px-2 text-xs font-mono"
            style={{ background: "var(--ax-bg)", border: "1px solid var(--ax-border-hi)", color: "var(--ax-off-white)" }}
          />
        </div>
        {!props.venue?.factoryAddress || !props.venue?.routerAddress ? (
          <div className="text-[11px] text-[var(--ax-muted)]">Missing venue config.</div>
        ) : null}
      </div>

      {mode === "add" ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            value={amountA}
            onChange={(e) => setAmountA(e.target.value)}
            placeholder={`Amount ${symA}`}
            className="h-9 rounded-[2px] px-3 text-xs font-mono"
            style={{ background: "var(--ax-bg)", border: "1px solid var(--ax-border-hi)", color: "var(--ax-off-white)" }}
          />
          <input
            value={amountB}
            onChange={(e) => setAmountB(e.target.value)}
            placeholder={`Amount ${symB}`}
            className="h-9 rounded-[2px] px-3 text-xs font-mono"
            style={{ background: "var(--ax-bg)", border: "1px solid var(--ax-border-hi)", color: "var(--ax-off-white)" }}
          />
          <button
            onClick={onAdd}
            className="h-9 bg-[var(--ax-red)] hover:opacity-90 text-white rounded-[2px] text-xs font-semibold disabled:opacity-50"
            disabled={!wallet.connected || wallet.chainId !== CHAIN_ID || !props.venue?.routerAddress}
          >
            Add liquidity
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            value={liq}
            onChange={(e) => setLiq(e.target.value)}
            placeholder="LP to remove (18 decimals)"
            className="h-9 rounded-[2px] px-3 text-xs font-mono md:col-span-2"
            style={{ background: "var(--ax-bg)", border: "1px solid var(--ax-border-hi)", color: "var(--ax-off-white)" }}
          />
          <button
            onClick={onRemove}
            className="h-9 bg-[var(--ax-red)] hover:opacity-90 text-white rounded-[2px] text-xs font-semibold disabled:opacity-50"
            disabled={!wallet.connected || wallet.chainId !== CHAIN_ID || !props.venue?.routerAddress}
          >
            Remove liquidity
          </button>
        </div>
      )}

      {msg && <div className="text-[11px] text-[var(--ax-dim)] font-mono break-all">{msg}</div>}
    </div>
  );
}

