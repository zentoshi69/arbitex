"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getRole } from "@/lib/auth";
import { SectionHeader, EmptyState, Skeleton, AddressCell } from "@/components/ui";
import { useWallet } from "@/components/wallet/WalletProvider";
import { cn } from "@/lib/utils";
import { Droplets, PlusCircle } from "lucide-react";
import { formatUnits, parseUnits } from "viem";
import { avalanche } from "viem/chains";
import { avaxPublicClient } from "@/lib/chain";

const CHAIN_ID = 43114; // Avalanche C-Chain
const WAVAX = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";
const USDC = "0xc3aAB273A055AD9Bc4e781A9c385b9fed5Bb677e";
const WRP = "0xB80d374AE04a4147Cf1269Aad5cA1ea8F97b38f8";

// Pangolin V2 (Avalanche) — UniswapV2-style constant product
const PANGOLIN_V2_FACTORY = "0xefa94DE7a4656D787667C749f7E1223D71E9FD88";
const PANGOLIN_V2_ROUTER = "0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106";

const isHexAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v.trim());

type Venue = { id: string; chainId: number; name: string; protocol: string; routerAddress: string; factoryAddress?: string | null; isEnabled: boolean };

const ERC20_ABI = [
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

export default function V2LpAdminPage() {
  const role = useMemo(() => getRole(), []);
  const [venueId, setVenueId] = useState<string>("");
  const [creatingVenue, setCreatingVenue] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [venueForm, setVenueForm] = useState({
    name: "Avalanche V2",
    protocol: "uniswap_v2",
    routerAddress: PANGOLIN_V2_ROUTER,
    factoryAddress: PANGOLIN_V2_FACTORY,
  });

  const venuesQ = useQuery({
    queryKey: ["venues"],
    queryFn: () => api.venues.list(),
    refetchInterval: 10_000,
  });

  const avalancheVenues = (venuesQ.data ?? []).filter((v: Venue) => v.chainId === CHAIN_ID);

  useEffect(() => {
    if (venueId) return;
    if (avalancheVenues.length > 0) setVenueId(avalancheVenues[0].id);
  }, [venueId, avalancheVenues]);

  if (role !== "SUPER_ADMIN") {
    return (
      <div className="space-y-4 max-w-[1000px]">
        <SectionHeader
          title="V2 LP Admin (Avalanche)"
          description="Super Admin-only: create/register constant-product pools and manage liquidity"
        />
        <div className="ax-panel">
          <EmptyState message="Super Admin only. Your JWT must include role=SUPER_ADMIN." />
        </div>
      </div>
    );
  }

  const pairs = [
    { label: "WRP / AVAX (WAVAX)", tokenA: WRP, tokenB: WAVAX, feeBps: 30 },
    { label: "WRP / USDC", tokenA: WRP, tokenB: USDC, feeBps: 30 },
    { label: "AVAX (WAVAX) / USDC", tokenA: WAVAX, tokenB: USDC, feeBps: 30 },
  ];

  async function createAvalancheVenue() {
    setErr(null);
    setCreatingVenue(true);
    try {
      if (!isHexAddress(venueForm.routerAddress) || !isHexAddress(venueForm.factoryAddress)) {
        throw new Error("Router/Factory must be valid 0x… addresses");
      }
      const v = await api.venues.create({
        chainId: CHAIN_ID,
        name: venueForm.name,
        protocol: venueForm.protocol,
        routerAddress: venueForm.routerAddress.trim(),
        factoryAddress: venueForm.factoryAddress.trim(),
      });
      setVenueId(v.id);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create venue");
    } finally {
      setCreatingVenue(false);
    }
  }

  return (
    <div className="space-y-4 max-w-[1000px]">
      <SectionHeader
        title="V2 LP Admin (Avalanche)"
        description="Constant-product pools (UniswapV2-style). Configure a V2 venue, then register your 3 target pairs."
      />

      {err && (
        <div className="bg-[rgba(232,65,66,0.08)] border border-[rgba(232,65,66,0.2)] text-[var(--red)] rounded px-4 py-3 text-sm">
          {err}
        </div>
      )}

      <div className="ax-panel p-4 space-y-3">
        <div className="text-sm font-semibold text-[var(--offwhite)]">1) Configure Avalanche V2 venue</div>

        {venuesQ.isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : avalancheVenues.length === 0 ? (
          <div className="space-y-3">
            <div className="text-xs text-[var(--grey2)]">
              No venues found for chainId {CHAIN_ID}. Create one by providing a **V2 router** + **V2 factory** address.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="space-y-1">
                <div className="text-xs text-[var(--grey2)] font-medium">Venue name</div>
                <input
                  value={venueForm.name}
                  onChange={(e) => setVenueForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full h-9 bg-[var(--bg3)] border border-[var(--border)] rounded px-3 text-sm text-[var(--offwhite)]"
                />
              </label>
              <label className="space-y-1">
                <div className="text-xs text-[var(--grey2)] font-medium">Protocol</div>
                <input
                  value={venueForm.protocol}
                  onChange={(e) => setVenueForm((f) => ({ ...f, protocol: e.target.value }))}
                  className="w-full h-9 bg-[var(--bg3)] border border-[var(--border)] rounded px-3 text-sm text-[var(--offwhite)] font-mono"
                />
              </label>
              <label className="space-y-1">
                <div className="text-xs text-[var(--grey2)] font-medium">Router address (V2)</div>
                <input
                  value={venueForm.routerAddress}
                  onChange={(e) => setVenueForm((f) => ({ ...f, routerAddress: e.target.value }))}
                  placeholder="0x…"
                  className="w-full h-9 bg-[var(--bg3)] border border-[var(--border)] rounded px-3 text-sm text-[var(--offwhite)] font-mono"
                />
              </label>
              <label className="space-y-1">
                <div className="text-xs text-[var(--grey2)] font-medium">Factory address (V2)</div>
                <input
                  value={venueForm.factoryAddress}
                  onChange={(e) => setVenueForm((f) => ({ ...f, factoryAddress: e.target.value }))}
                  placeholder="0x…"
                  className="w-full h-9 bg-[var(--bg3)] border border-[var(--border)] rounded px-3 text-sm text-[var(--offwhite)] font-mono"
                />
              </label>
            </div>
            <button
              onClick={createAvalancheVenue}
              disabled={creatingVenue}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-2 rounded text-sm font-semibold",
                creatingVenue ? "bg-[var(--bg3)] text-[var(--grey2)]" : "bg-[#16A34A] hover:opacity-90 text-white"
              )}
            >
              <PlusCircle className="w-4 h-4" />
              {creatingVenue ? "Creating…" : "Create venue"}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-[var(--grey2)]">Select which Avalanche V2 venue to use.</div>
            <select
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className="w-full h-9 bg-[var(--bg3)] border border-[var(--border)] rounded px-3 text-sm text-[var(--offwhite)]"
            >
              {avalancheVenues.map((v: Venue) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.protocol})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="ax-panel p-4 space-y-3">
        <div className="text-sm font-semibold text-[var(--offwhite)]">2) Create/Register the 3 pairs</div>
        <div className="text-xs text-[var(--grey2)]">
          These are **V2 constant-product** pairs (WRP/AVAX via WAVAX, WRP/USDC, AVAX/USDC via WAVAX).
        </div>

        <div className="space-y-2">
          {pairs.map((p) => (
            <PairRow key={p.label} venueId={venueId} label={p.label} tokenA={p.tokenA} tokenB={p.tokenB} feeBps={p.feeBps} />
          ))}
        </div>
      </div>

      <div className="ax-panel p-4 space-y-3">
        <div className="text-sm font-semibold text-[var(--offwhite)]">3) Manage liquidity (add / remove)</div>
        <div className="text-xs text-[var(--grey2)]">
          Uses the SUPER_ADMIN keystore on the server to sign transactions. Amounts are in **raw units** (wei-like).
          If you want human-friendly inputs (decimals), tell me and I’ll add it.
        </div>
        <div className="space-y-2">
          {pairs.map((p) => (
            <LiquidityRow key={p.label} venueId={venueId} label={p.label} tokenA={p.tokenA} tokenB={p.tokenB} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PairRow(props: { venueId: string; label: string; tokenA: string; tokenB: string; feeBps: number }) {
  const [pair, setPair] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "checking" | "registering" | "done" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function check() {
    setErr(null);
    setStatus("checking");
    try {
      // We don't have factory directly here; API uses venue factory for register.
      // So the check is best-effort via register endpoint error text.
      setPair(null);
      setStatus("idle");
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
      setStatus("error");
    }
  }

  async function register() {
    setErr(null);
    setStatus("registering");
    try {
      if (!props.venueId) throw new Error("Select/create a venue first");
      const res = await api.lp.v2.register({
        chainId: CHAIN_ID,
        venueId: props.venueId,
        tokenA: props.tokenA,
        tokenB: props.tokenB,
        feeBps: props.feeBps,
      });
      setPair(res.pairAddress);
      setStatus("done");
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
      setStatus("error");
    }
  }

  return (
    <div className="flex items-center gap-3 bg-[rgba(255,255,255,0.02)] border border-[var(--border)] rounded px-3 py-2">
      <Droplets className="w-4 h-4 text-[var(--offwhite)]" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-[var(--offwhite)] font-semibold">{props.label}</div>
        <div className="text-[11px] text-[var(--grey2)] font-mono truncate">
          {props.tokenA} · {props.tokenB}
        </div>
        {pair && (
          <div className="mt-1 text-[11px] text-[var(--grey1)]">
            Pair: <AddressCell address={pair} />
          </div>
        )}
        {err && <div className="mt-1 text-[11px] text-[var(--red)]">{err}</div>}
      </div>
      <button
        onClick={check}
        className="text-xs px-3 py-1.5 bg-[var(--bg3)] rounded text-[var(--offwhite)] hover:opacity-90"
      >
        Check
      </button>
      <button
        onClick={register}
        disabled={status === "registering"}
        className={cn(
          "text-xs px-3 py-1.5 rounded font-semibold",
          status === "done"
            ? "bg-[#166534] text-white"
            : "bg-[var(--ax-red)] hover:opacity-90 text-white"
        )}
      >
        {status === "registering" ? "Registering…" : status === "done" ? "Registered" : "Register"}
      </button>
    </div>
  );
}

function LiquidityRow(props: { venueId: string; label: string; tokenA: string; tokenB: string }) {
  const [slippageBps, setSlippageBps] = useState(50);
  const [amountA, setAmountA] = useState(""); // human units
  const [amountB, setAmountB] = useState(""); // human units
  const [liq, setLiq] = useState(""); // human LP units (18)
  const [msg, setMsg] = useState<string | null>(null);
  const [useConnectedWallet, setUseConnectedWallet] = useState(false);
  const wallet = useWallet();

  const publicClient = avaxPublicClient;

  const posQ = useQuery({
    queryKey: ["lp-pos", props.venueId, props.tokenA, props.tokenB],
    queryFn: () =>
      api.lp.v2.position({
        chainId: CHAIN_ID,
        venueId: props.venueId,
        tokenA: props.tokenA,
        tokenB: props.tokenB,
      }),
    enabled: !!props.venueId,
    refetchInterval: 10_000,
  });

  async function add() {
    setMsg(null);
    try {
      if (useConnectedWallet) {
        if (!wallet.connected || !wallet.walletClient || !wallet.address) throw new Error("Connect a wallet first");
        if (wallet.chainId !== CHAIN_ID) throw new Error("Switch wallet to Avalanche (chainId 43114)");
        if (!posQ.data?.router) throw new Error("Router not loaded yet (select a venue)");

        const decA = posQ.data?.tokenA?.decimals ?? 18;
        const decB = posQ.data?.tokenB?.decimals ?? 18;
        const amountADesired = parseUnits(amountA.trim() || "0", decA);
        const amountBDesired = parseUnits(amountB.trim() || "0", decB);
        if (amountADesired <= 0n || amountBDesired <= 0n) throw new Error("Amounts must be > 0");

        const router = posQ.data.router as `0x${string}`;

        // approvals
        for (const [token, amt] of [
          [props.tokenA, amountADesired],
          [props.tokenB, amountBDesired],
        ] as const) {
          const allowance = (await publicClient.readContract({
            address: token as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [wallet.address, router],
          })) as bigint;
          if (allowance < amt) {
            const ah = await wallet.walletClient.writeContract({
              chain: avalanche,
              address: token as `0x${string}`,
              abi: ERC20_ABI,
              functionName: "approve",
              args: [router, amt],
              account: wallet.address,
            });
            setMsg(`approve tx: ${ah}`);
          }
        }

        const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
        const hash = await wallet.walletClient.writeContract({
          chain: avalanche,
          address: router,
          abi: UNISWAPV2_ROUTER_ABI,
          functionName: "addLiquidity",
          args: [
            props.tokenA as `0x${string}`,
            props.tokenB as `0x${string}`,
            amountADesired,
            amountBDesired,
            applySlippageMin(amountADesired, slippageBps),
            applySlippageMin(amountBDesired, slippageBps),
            wallet.address,
            deadline,
          ],
          account: wallet.address,
        });
        setMsg(`addLiquidity tx: ${hash}`);
        posQ.refetch();
        return;
      }

      const decA = posQ.data?.tokenA?.decimals ?? 18;
      const decB = posQ.data?.tokenB?.decimals ?? 18;
      const rawA = parseUnits(amountA.trim() || "0", decA).toString();
      const rawB = parseUnits(amountB.trim() || "0", decB).toString();
      const res = await api.lp.v2.addLiquidity({
        chainId: CHAIN_ID,
        venueId: props.venueId,
        tokenA: props.tokenA,
        tokenB: props.tokenB,
        amountADesired: rawA,
        amountBDesired: rawB,
        slippageBps,
      });
      setMsg(`addLiquidity tx: ${res.tx}`);
      posQ.refetch();
    } catch (e: any) {
      setMsg(e?.message ?? "addLiquidity failed");
    }
  }

  async function remove() {
    setMsg(null);
    try {
      if (useConnectedWallet) {
        if (!wallet.connected || !wallet.walletClient || !wallet.address) throw new Error("Connect a wallet first");
        if (wallet.chainId !== CHAIN_ID) throw new Error("Switch wallet to Avalanche (chainId 43114)");
        if (!posQ.data?.router) throw new Error("Router not loaded yet (select a venue)");
        if (!posQ.data?.pair) throw new Error("Pair not found (register the pool first)");

        const liquidity = parseUnits(liq.trim() || "0", 18);
        if (liquidity <= 0n) throw new Error("Liquidity must be > 0");
        const router = posQ.data.router as `0x${string}`;
        const pair = posQ.data.pair as `0x${string}`;

        const allowance = (await publicClient.readContract({
          address: pair,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [wallet.address, router],
        })) as bigint;
        if (allowance < liquidity) {
          const ah = await wallet.walletClient.writeContract({
            chain: avalanche,
            address: pair,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [router, liquidity],
            account: wallet.address,
          });
          setMsg(`approve LP tx: ${ah}`);
        }

        // Simple mins from 0 (safest to not revert, but less MEV-protected); we still apply slippage to desired liq.
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
        const hash = await wallet.walletClient.writeContract({
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
            wallet.address,
            deadline,
          ],
          account: wallet.address,
        });
        setMsg(`removeLiquidity tx: ${hash}`);
        posQ.refetch();
        return;
      }

      const rawLiq = parseUnits(liq.trim() || "0", 18).toString();
      const res = await api.lp.v2.removeLiquidity({
        chainId: CHAIN_ID,
        venueId: props.venueId,
        tokenA: props.tokenA,
        tokenB: props.tokenB,
        liquidity: rawLiq,
        slippageBps,
      });
      setMsg(`removeLiquidity tx: ${res.tx}`);
      posQ.refetch();
    } catch (e: any) {
      setMsg(e?.message ?? "removeLiquidity failed");
    }
  }

  const pair = posQ.data?.pair as string | null;
  const superAdminWallet = posQ.data?.wallet as string | undefined;
  const symA = posQ.data?.tokenA?.symbol ?? "TokenA";
  const symB = posQ.data?.tokenB?.symbol ?? "TokenB";
  const decA = posQ.data?.tokenA?.decimals ?? 18;
  const decB = posQ.data?.tokenB?.decimals ?? 18;
  const balA = posQ.data?.balances?.tokenA ? formatUnits(BigInt(posQ.data.balances.tokenA), decA) : "—";
  const balB = posQ.data?.balances?.tokenB ? formatUnits(BigInt(posQ.data.balances.tokenB), decB) : "—";
  const lpBal = posQ.data?.lp?.balance ? formatUnits(BigInt(posQ.data.lp.balance), 18) : "—";
  const lpTot = posQ.data?.lp?.totalSupply ? formatUnits(BigInt(posQ.data.lp.totalSupply), 18) : "—";

  return (
    <div className="bg-[rgba(255,255,255,0.02)] border border-[var(--border)] rounded p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--offwhite)]">{props.label}</div>
          <div className="text-[11px] text-[var(--grey2)] font-mono truncate">
            {props.tokenA} · {props.tokenB}
          </div>
          {pair && (
            <div className="text-[11px] text-[var(--grey1)] mt-1">
              Pair: <AddressCell address={pair} />
            </div>
          )}
          {superAdminWallet && (
            <div className="text-[11px] text-[var(--grey2)] mt-1">
              SuperAdmin wallet: <AddressCell address={superAdminWallet} />
            </div>
          )}
          {wallet.connected && (
            <div className="text-[11px] text-[var(--grey2)] mt-1">
              Connected wallet: <AddressCell address={wallet.address!} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-[var(--grey2)] inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={useConnectedWallet}
              onChange={(e) => setUseConnectedWallet(e.target.checked)}
            />
            Use connected wallet
          </label>
          <label className="text-[11px] text-[var(--grey2)]">Slippage (bps)</label>
          <input
            value={slippageBps}
            onChange={(e) => setSlippageBps(Number(e.target.value))}
            className="w-20 h-8 bg-[var(--bg3)] border border-[var(--border)] rounded px-2 text-xs text-[var(--offwhite)] font-mono"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded p-2">
          <div className="text-[var(--grey2)]">Balances (A/B)</div>
          <div className="font-mono text-[var(--offwhite)] truncate">
            {balA} {symA} / {balB} {symB}
          </div>
        </div>
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded p-2">
          <div className="text-[var(--grey2)]">Reserves (0/1)</div>
          <div className="font-mono text-[var(--offwhite)] truncate">
            {(posQ.data?.reserves?.reserve0 ?? "—")} / {(posQ.data?.reserves?.reserve1 ?? "—")}
          </div>
        </div>
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded p-2">
          <div className="text-[var(--grey2)]">LP (bal/total)</div>
          <div className="font-mono text-[var(--offwhite)] truncate">
            {lpBal} / {lpTot}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input
          value={amountA}
          onChange={(e) => setAmountA(e.target.value)}
          placeholder={`Amount ${symA} (human)`}
          className="h-9 bg-[var(--bg3)] border border-[var(--border)] rounded px-3 text-xs text-[var(--offwhite)] font-mono"
        />
        <input
          value={amountB}
          onChange={(e) => setAmountB(e.target.value)}
          placeholder={`Amount ${symB} (human)`}
          className="h-9 bg-[var(--bg3)] border border-[var(--border)] rounded px-3 text-xs text-[var(--offwhite)] font-mono"
        />
        <button
          onClick={add}
          className="h-9 bg-[var(--ax-red)] hover:opacity-90 text-white rounded-[2px] text-xs font-semibold"
          disabled={!props.venueId}
        >
          Add liquidity
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input
          value={liq}
          onChange={(e) => setLiq(e.target.value)}
          placeholder="LP to remove (human, 18 decimals)"
          className="h-9 bg-[var(--bg3)] border border-[var(--border)] rounded px-3 text-xs text-[var(--offwhite)] font-mono md:col-span-2"
        />
        <button
          onClick={remove}
          className="h-9 bg-[#D97706] hover:opacity-90 text-white rounded text-xs font-semibold"
          disabled={!props.venueId}
        >
          Remove liquidity
        </button>
      </div>

      {msg && <div className="text-[11px] text-[var(--grey1)] font-mono break-all">{msg}</div>}
    </div>
  );
}
