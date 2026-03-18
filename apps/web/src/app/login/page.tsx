"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? `HTTP ${res.status}`);

      localStorage.setItem("arbitex_token", body.token);
      router.replace("/");
      // Ensure WS provider reconnects with token
      window.location.reload();
    } catch (err: any) {
      setError(err?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h1 className="text-lg font-semibold text-white">ArbitEx Operator Login</h1>
        <p className="text-xs text-slate-400 mt-1">
          Enter the operator password to access the dashboard.
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-slate-950 border border-slate-800 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-600/60"
              placeholder="••••••••"
              autoFocus
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="text-xs text-red-300 bg-red-950/40 border border-red-900/50 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || password.length < 8}
            className="w-full py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm font-semibold transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-[11px] text-slate-500 mt-4">
          This system is for operator use only. Activity is audited.
        </p>
      </div>
    </div>
  );
}

