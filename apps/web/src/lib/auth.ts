export type JwtPayload = {
  sub?: string;
  role?: "VIEWER" | "OPERATOR" | "ADMIN" | "SUPER_ADMIN";
  email?: string;
  exp?: number;
};

function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return typeof window !== "undefined"
    ? atob(padded)
    : Buffer.from(padded, "base64").toString("utf8");
}

export function getJwtPayload(token: string | null): JwtPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = base64UrlDecode(parts[1]!);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function getRole(): JwtPayload["role"] | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("arbitex_token");
  return getJwtPayload(token)?.role ?? null;
}

export function isTokenValid(token: string | null): boolean {
  const payload = getJwtPayload(token);
  if (!payload) return false;
  if (!payload.exp) return true;
  const nowSec = Math.floor(Date.now() / 1000);
  return payload.exp > nowSec + 10;
}

