import { NextRequest, NextResponse } from "next/server";
import * as jose from "jose";
import { timingSafeEqual } from "node:crypto";

const PASSWORDS = (process.env["OPERATOR_PASSWORD"] ?? "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

const JWT_SECRET = process.env["JWT_SECRET"] ?? "";
const JWT_EXPIRY = process.env["JWT_EXPIRY"] ?? "30d";

const INTERNAL_API_URL =
  process.env["INTERNAL_API_URL"] ?? "http://api:3001";

// ── In-memory sliding-window rate limiter ────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_ATTEMPTS = 5;

const attempts = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  let timestamps = attempts.get(ip) ?? [];
  timestamps = timestamps.filter((t) => t > windowStart);
  attempts.set(ip, timestamps);

  if (timestamps.length >= RATE_LIMIT_MAX_ATTEMPTS) {
    return true;
  }

  timestamps.push(now);
  return false;
}

// Periodic cleanup to prevent unbounded memory growth
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [ip, timestamps] of attempts) {
    const filtered = timestamps.filter((t) => t > cutoff);
    if (filtered.length === 0) attempts.delete(ip);
    else attempts.set(ip, filtered);
  }
}, RATE_LIMIT_WINDOW_MS);

// ── Timing-safe password comparison ──────────────────────────────────────────
function safePasswordMatch(input: string, stored: string): boolean {
  const a = Buffer.from(input, "utf8");
  const b = Buffer.from(stored, "utf8");
  if (a.length !== b.length) {
    // Compare against self to burn the same time as a real comparison,
    // preventing length-based timing leaks.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  try {
    // ── Rate limiting ─────────────────────────────────────────────────────
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { message: "Too many login attempts. Try again in 1 minute." },
        { status: 429 },
      );
    }

    const body = await req.json().catch(() => null);
    const password =
      typeof body?.password === "string" ? body.password.trim() : "";

    if (!password) {
      return NextResponse.json(
        { message: "Password is required" },
        { status: 400 },
      );
    }

    // ── Path A: local password check (preferred in production) ──
    if (PASSWORDS.length > 0) {
      if (!JWT_SECRET) {
        console.error(
          "[login] OPERATOR_PASSWORD is set but JWT_SECRET is missing — cannot sign token",
        );
        return NextResponse.json(
          { message: "Server misconfiguration: JWT_SECRET not set" },
          { status: 500 },
        );
      }

      const matched = PASSWORDS.some((stored) =>
        safePasswordMatch(password, stored)
      );

      if (!matched) {
        return NextResponse.json(
          { message: "Invalid credentials" },
          { status: 401 },
        );
      }

      const secret = new TextEncoder().encode(JWT_SECRET);
      const token = await new jose.SignJWT({ sub: "operator", role: "ADMIN" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(JWT_EXPIRY)
        .sign(secret);

      return NextResponse.json({ token, expiresIn: JWT_EXPIRY });
    }

    // ── Path B: proxy to NestJS API (fallback when OPERATOR_PASSWORD unset) ──
    let apiRes: Response;
    try {
      apiRes = await fetch(`${INTERNAL_API_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
    } catch (fetchErr) {
      console.error("[login] Failed to reach NestJS API:", fetchErr);
      return NextResponse.json(
        { message: `Cannot reach API at ${INTERNAL_API_URL}` },
        { status: 502 },
      );
    }

    const apiBody = await apiRes
      .json()
      .catch(() => ({ message: "Invalid JSON from API" }));

    if (!apiRes.ok) {
      console.error(`[login] API returned ${apiRes.status}:`, apiBody);
    }

    return NextResponse.json(apiBody, { status: apiRes.status });
  } catch (e) {
    console.error("[login] Unexpected error:", e);
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
