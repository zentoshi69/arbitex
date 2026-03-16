import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useKillSwitchStatus() {
  const { data } = useQuery<Record<string, boolean>>({
    queryKey: ["risk", "kill-switches"],
    queryFn: () => api.risk.killSwitches(),
    refetchInterval: 10_000,
    staleTime: 8_000,
    initialData: {},
  });

  const anyActive = data ? Object.values(data).some(Boolean) : false;
  const globalActive = data?.["GLOBAL"] ?? false;

  return { switches: data ?? {}, anyActive, globalActive };
}
