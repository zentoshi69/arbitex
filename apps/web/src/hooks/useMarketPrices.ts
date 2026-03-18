"use client";

import { useQuery } from "@tanstack/react-query";

const BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

export function useMarketPrices(params: { pangolinVenueId?: string; blackholeVenueId?: string }) {
  return useQuery({
    queryKey: ["market-prices", params.pangolinVenueId, params.blackholeVenueId],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params.pangolinVenueId) qs.set("pangolinVenueId", params.pangolinVenueId);
      if (params.blackholeVenueId) qs.set("blackholeVenueId", params.blackholeVenueId);
      const res = await fetch(`${BASE}/api/v1/market/prices?${qs.toString()}`);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${body}`);
      }
      return res.json();
    },
    refetchInterval: 5_000,
  });
}

