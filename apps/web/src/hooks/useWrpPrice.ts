"use client";

import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http } from "viem";
import { avalanche } from "viem/chains";

const WRP = "0xeF282B38D1ceAB52134CA2cc653a569435744687" as const;
const WAVAX = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7" as const;
const BLACKHOLE_PAIR = "0xc26847bfa980A72c82e924899A989c47b088d7da" as const;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

const FACTORIES = [
  { addr: "0x9Ad6C38BE94206cA50bb0d90783181834C294Ff3" as `0x${string}`, name: "TraderJoe" },
  { addr: "0xefa94DE7a4656D787667C749f7E1223D71E9FD88" as `0x${string}`, name: "Pangolin" },
];

const FACTORY_ABI = [
  {
    type: "function",
    name: "getPair",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "address" }],
  },
] as const;

const PAIR_ABI = [
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }],
  },
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

const publicClient = createPublicClient({
  chain: avalanche,
  transport: http("https://api.avax.network/ext/bc/C/rpc"),
});

export type WrpPriceData = {
  avaxPerWrp: number | null;
  wrpPerAvax: number | null;
  wrpUsd: number | null;
  source: string;
};

async function fetchWrpPrice(): Promise<WrpPriceData> {
  const errors: string[] = [];

  for (const fac of FACTORIES) {
    try {
      const pair = await publicClient.readContract({
        address: fac.addr,
        abi: FACTORY_ABI,
        functionName: "getPair",
        args: [WRP, WAVAX],
      });

      if (!pair || pair === ZERO_ADDR) {
        errors.push(`${fac.name}: no pair`);
        continue;
      }

      const [token0, reserves] = await Promise.all([
        publicClient.readContract({ address: pair, abi: PAIR_ABI, functionName: "token0" }),
        publicClient.readContract({ address: pair, abi: PAIR_ABI, functionName: "getReserves" }),
      ]);

      const [r0, r1] = reserves;
      if (r0 === 0n || r1 === 0n) {
        errors.push(`${fac.name}: zero reserves`);
        continue;
      }

      const isWrpToken0 = token0.toLowerCase() === WRP.toLowerCase();
      const wrpR = Number(isWrpToken0 ? r0 : r1);
      const avaxR = Number(isWrpToken0 ? r1 : r0);

      return {
        avaxPerWrp: avaxR / wrpR,
        wrpPerAvax: wrpR / avaxR,
        wrpUsd: null,
        source: fac.name,
      };
    } catch (e) {
      errors.push(`${fac.name}: ${e instanceof Error ? e.message : "unknown"}`);
      continue;
    }
  }

  try {
    const [token0, reserves] = await Promise.all([
      publicClient.readContract({ address: BLACKHOLE_PAIR, abi: PAIR_ABI, functionName: "token0" }),
      publicClient.readContract({ address: BLACKHOLE_PAIR, abi: PAIR_ABI, functionName: "getReserves" }),
    ]);
    const [r0, r1] = reserves;
    if (r0 > 0n && r1 > 0n) {
      const isWrpToken0 = token0.toLowerCase() === WRP.toLowerCase();
      const wrpAmount = Number(isWrpToken0 ? r0 : r1) / 1e18;
      const usdcAmount = Number(isWrpToken0 ? r1 : r0) / 1e6;

      if (wrpAmount > 0 && usdcAmount > 0) {
        return {
          avaxPerWrp: null,
          wrpPerAvax: null,
          wrpUsd: usdcAmount / wrpAmount,
          source: "Blackhole",
        };
      }
      errors.push("Blackhole: zero amounts after conversion");
    } else {
      errors.push("Blackhole: zero reserves");
    }
  } catch (e) {
    errors.push(`Blackhole: ${e instanceof Error ? e.message : "unknown"}`);
  }

  if (errors.length > 0) {
    console.warn("[useWrpPrice] All sources failed:", errors.join("; "));
  }

  return { avaxPerWrp: null, wrpPerAvax: null, wrpUsd: null, source: "none" };
}

export function useWrpPrice() {
  return useQuery({
    queryKey: ["wrp-price-onchain"],
    queryFn: fetchWrpPrice,
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  });
}
