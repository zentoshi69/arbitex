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
    updateFlags: (id: string, flags: string[]) =>
      apiFetch<any>(`/tokens/${id}/flags`, {
        method: "PATCH",
        body: JSON.stringify({ flags }),
      }),
  },

  // Venues
  venues: {
    list: () => apiFetch<any>("/venues"),
    update: (id: string, data: { isEnabled: boolean }) =>
      apiFetch<any>(`/venues/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },

  // Health
  health: () => fetch(`${BASE}/health`).then((r) => r.json()),
};
