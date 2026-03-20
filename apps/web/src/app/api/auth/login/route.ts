import { NextRequest, NextResponse } from "next/server";
import * as jose from "jose";

const PASSWORDS = (process.env["OPERATOR_PASSWORD"] ?? "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

const JWT_SECRET = process.env["JWT_SECRET"] ?? "";
const JWT_EXPIRY = process.env["JWT_EXPIRY"] ?? "24h";

const INTERNAL_API_URL =
  process.env["INTERNAL_API_URL"] ?? "http://api:3001";

export async function POST(req: NextRequest) {
  try {
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

      if (!PASSWORDS.includes(password)) {
        console.error("[login] Password mismatch (local validation)");
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

      console.log("[login] Local auth succeeded, JWT issued");
      return NextResponse.json({ token, expiresIn: JWT_EXPIRY });
    }

    // ── Path B: proxy to NestJS API (fallback when OPERATOR_PASSWORD unset) ──
    console.log(
      `[login] No OPERATOR_PASSWORD configured, proxying to ${INTERNAL_API_URL}/api/v1/auth/login`,
    );

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
