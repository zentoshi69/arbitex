import { NextRequest, NextResponse } from "next/server";
import * as jose from "jose";

const PASSWORDS = (process.env["OPERATOR_PASSWORD"] ?? "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

const JWT_SECRET = process.env["JWT_SECRET"] ?? "";
const JWT_EXPIRY = process.env["JWT_EXPIRY"] ?? "24h";

const BACKEND_URL =
  process.env["INTERNAL_API_URL"] ??
  process.env["NEXT_PUBLIC_API_URL"] ??
  "http://localhost:3001";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const password = typeof body?.password === "string" ? body.password.trim() : "";

    if (!password) {
      return NextResponse.json({ message: "Password is required" }, { status: 400 });
    }

    if (PASSWORDS.length > 0 && JWT_SECRET) {
      if (!PASSWORDS.includes(password)) {
        return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
      }

      const secret = new TextEncoder().encode(JWT_SECRET);
      const token = await new jose.SignJWT({ sub: "operator", role: "ADMIN" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(JWT_EXPIRY)
        .sign(secret);

      return NextResponse.json({ token, expiresIn: JWT_EXPIRY });
    }

    const apiRes = await fetch(`${BACKEND_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    const apiBody = await apiRes.json().catch(() => ({ message: "API unreachable" }));
    return NextResponse.json(apiBody, { status: apiRes.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
