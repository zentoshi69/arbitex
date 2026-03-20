"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { isTokenValid } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existing = localStorage.getItem("arbitex_token");
    if (isTokenValid(existing)) {
      router.replace("/");
    } else if (existing) {
      localStorage.removeItem("arbitex_token");
    }
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? `HTTP ${res.status}`);
      if (!body.token) throw new Error("Missing token in login response");

      localStorage.setItem("arbitex_token", body.token);
      router.replace("/");
      window.location.reload();
    } catch (err: any) {
      setError(err?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm -mt-20">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center"
            style={{
              background: "#E84142",
              clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
            }}
          >
            <Shield className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-[-0.03em] text-white">
            ArbitEx
          </span>
        </div>

        <div className="ax-panel p-6">
          <h1 className="text-sm font-semibold text-white">Operator Login</h1>
          <p className="text-[10px] text-dim mt-1">
            Enter the operator password to access the dashboard.
          </p>

          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-medium uppercase tracking-[0.12em] text-muted">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 ax-field text-sm"
                placeholder="••••••••"
                autoFocus
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="text-xs text-red-300 bg-red/8 border border-red/25 rounded-[2px] px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || password.length < 4}
              className="w-full py-2 ax-btn-primary text-sm font-semibold"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-[9px] text-muted mt-4 tracking-[0.04em]">
          Operator use only — activity is audited
        </p>
      </div>
    </div>
  );
}
