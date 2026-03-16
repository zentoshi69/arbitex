// hooks/useGasPrice.ts
import { useQuery } from "@tanstack/react-query";

async function fetchGasPrice(): Promise<number> {
  const BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";
  const token = typeof window !== "undefined" ? localStorage.getItem("arbitex_token") : null;
  const res = await fetch(`${BASE}/api/v1/chain/gas-price`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.gasPriceGwei ?? 0;
}

export function useGasPrice() {
  const { data } = useQuery<number>({
    queryKey: ["gas-price"],
    queryFn: fetchGasPrice,
    refetchInterval: 10_000,
    staleTime: 8_000,
    initialData: null as any,
  });
  return { gasPriceGwei: data };
}
