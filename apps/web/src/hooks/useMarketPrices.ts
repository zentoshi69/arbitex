"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useMarketPrices(params?: { pangolinVenueId?: string; blackholeVenueId?: string }) {
  return useQuery({
    queryKey: ["market-prices", params?.pangolinVenueId, params?.blackholeVenueId],
    queryFn: () => api.market.prices(params),
    refetchInterval: 5_000,
  });
}

export function useTokenPrices() {
  return useQuery({
    queryKey: ["market-token-prices"],
    queryFn: () => api.market.tokenPrices(),
    refetchInterval: 8_000,
    staleTime: 6_000,
  });
}
