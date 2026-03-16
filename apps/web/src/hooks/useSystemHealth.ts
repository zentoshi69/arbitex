// hooks/useSystemHealth.ts
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { useWs } from "@/components/layout/Providers";
import type { SystemHealth } from "@arbitex/shared-types";

export function useSystemHealth() {
  const { on } = useWs();
  const query = useQuery<SystemHealth>({
    queryKey: ["health"],
    queryFn: () => api.health(),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  useEffect(() => {
    const off = on("system:health", (data) => {
      query.refetch();
    });
    return off;
  }, [on, query]);

  return { health: query.data, isLoading: query.isLoading };
}
