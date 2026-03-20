const BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("arbitex_token")
      : null;

  const res = await fetch(`${BASE}/api/v1${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("arbitex_token");
      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ── Typed API methods ─────────────────────────────────────────────────────────

export const api = {
  // Opportunities
  opportunities: {
    list: (params?: Record<string, string | number>) => {
      const qs = params
        ? "?" + new URLSearchParams(params as Record<string, string>).toString()
        : "";
      return apiFetch<any>(`/opportunities${qs}`);
    },
    get: (id: string) => apiFetch<any>(`/opportunities/${id}`),
    simulate: (id: string) =>
      apiFetch<any>(`/opportunities/${id}/simulate`, { method: "POST" }),
  },

  // Executions
  executions: {
    list: (params?: Record<string, string | number>) => {
      const qs = params
        ? "?" + new URLSearchParams(params as Record<string, string>).toString()
        : "";
      return apiFetch<any>(`/executions${qs}`);
    },
    get: (id: string) => apiFetch<any>(`/executions/${id}`),
  },

  // PnL
  pnl: {
    summary: () => apiFetch<any>("/pnl/summary"),
    timeseries: (days?: number) =>
      apiFetch<any>(`/pnl/timeseries${days ? `?days=${days}` : ""}`),
    cumulative: () => apiFetch<any>("/pnl/cumulative"),
    byVenue: (days?: number) =>
      apiFetch<any>(`/pnl/by-venue${days ? `?days=${days}` : ""}`),
  },

  // Fair Value
  fairValue: {
    all: () => apiFetch<any>("/fair-value"),
    token: (symbol: string) => apiFetch<any>(`/fair-value/token?symbol=${symbol}`),
  },

  // Market Regime
  regime: {
    current: () => apiFetch<any>("/regime"),
    configs: () => apiFetch<any>("/regime/configs"),
  },

  // Risk
  risk: {
    config: () => apiFetch<any>("/risk/config"),
    updateConfig: (data: Record<string, number>) =>
      apiFetch<any>("/risk/config", { method: "PATCH", body: JSON.stringify(data) }),
    killSwitches: () => apiFetch<any>("/risk/kill-switches"),
    setKillSwitch: (key: string, active: boolean, reason?: string) =>
      apiFetch<any>(`/risk/kill-switches/${key}`, {
        method: "POST",
        body: JSON.stringify({ active, reason }),
      }),
    events: () => apiFetch<any>("/risk/events"),
  },

  // Tokens
  tokens: {
    list: () => apiFetch<any>("/tokens"),
    resolve: (address: string) =>
      apiFetch<any>(`/tokens/resolve?${new URLSearchParams({ address })}`),
    toggle: (id: string, isEnabled: boolean) =>
      apiFetch<any>(`/tokens/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isEnabled }),
      }),
    updateFlags: (id: string, flags: string[]) =>
      apiFetch<any>(`/tokens/${id}/flags`, {
        method: "PATCH",
        body: JSON.stringify({ flags }),
      }),
  },

  // Pools
  pools: {
    list: (params?: Record<string, string | number>) => {
      const qs = params
        ? "?" + new URLSearchParams(params as Record<string, string>).toString()
        : "";
      return apiFetch<any>(`/pools${qs}`);
    },
    resolve: (address: string) =>
      apiFetch<any>(`/pools/resolve?${new URLSearchParams({ address })}`),
    create: (data: {
      venueId: string;
      poolAddress: string;
      token0Address: string;
      token1Address: string;
      feeBps: number;
    }) =>
      apiFetch<any>("/pools", { method: "POST", body: JSON.stringify(data) }),
  },

  // Venues
  venues: {
    list: () => apiFetch<any>("/venues"),
    update: (id: string, data: { isEnabled: boolean }) =>
      apiFetch<any>(`/venues/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    create: (data: {
      chainId: number;
      name: string;
      protocol: string;
      routerAddress: string;
      factoryAddress?: string;
    }) =>
      apiFetch<any>("/venues", { method: "POST", body: JSON.stringify({ ...data, chainId: String(data.chainId) }) }),
  },

  lp: {
    v2: {
      getPair: (factory: string, tokenA: string, tokenB: string) =>
        apiFetch<any>(`/lp/v2/pair?${new URLSearchParams({ factory, tokenA, tokenB })}`),
      register: (data: { chainId: number; venueId: string; tokenA: string; tokenB: string; feeBps: number }) =>
        apiFetch<any>("/lp/v2/register", { method: "POST", body: JSON.stringify(data) }),
      position: (params: { chainId: number; venueId: string; tokenA: string; tokenB: string }) =>
        apiFetch<any>(
          `/lp/v2/position?${new URLSearchParams({
            chainId: String(params.chainId),
            venueId: params.venueId,
            tokenA: params.tokenA,
            tokenB: params.tokenB,
          })}`
        ),
      addLiquidity: (data: {
        chainId: number;
        venueId: string;
        tokenA: string;
        tokenB: string;
        amountADesired: string;
        amountBDesired: string;
        slippageBps: number;
      }) => apiFetch<any>("/lp/v2/add-liquidity", { method: "POST", body: JSON.stringify(data) }),
      removeLiquidity: (data: {
        chainId: number;
        venueId: string;
        tokenA: string;
        tokenB: string;
        liquidity: string;
        slippageBps: number;
      }) => apiFetch<any>("/lp/v2/remove-liquidity", { method: "POST", body: JSON.stringify(data) }),
    },
  },

  // Market
  market: {
    prices: (params?: { pangolinVenueId?: string; blackholeVenueId?: string }) => {
      const qs = new URLSearchParams();
      if (params?.pangolinVenueId) qs.set("pangolinVenueId", params.pangolinVenueId);
      if (params?.blackholeVenueId) qs.set("blackholeVenueId", params.blackholeVenueId);
      const q = qs.toString();
      return apiFetch<any>(`/market/prices${q ? `?${q}` : ""}`);
    },
    tokenPrices: () => apiFetch<{
      updatedAt: string;
      tokens: Record<string, { usd: number | null; source: string; change24h: number | null }>;
    }>("/market/tokens"),
  },

  // Health
  health: () => fetch(`${BASE}/health`).then((r) => r.json()),
};
