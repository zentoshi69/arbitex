import { Body, Controller, HttpCode, HttpStatus, Post, UnauthorizedException } from "@nestjs/common";
import { IsString, MinLength } from "class-validator";
import { Public } from "./auth.decorators.js";
import { config } from "@arbitex/config";
import * as jose from "jose";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "node:crypto";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

class LoginDto {
  @IsString()
  @MinLength(4)
  password!: string;
}

@Controller("auth")
export class AuthController {
  @Post("login")
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    const hashEnv = process.env["OPERATOR_PASSWORD_HASH"] ?? "";
    const plainEnv = process.env["OPERATOR_PASSWORD"] ?? "";
    const hashesEnv = process.env["OPERATOR_PASSWORD_HASHES"] ?? "";

    const hashes = [hashEnv, ...hashesEnv.split(",")]
      .map((h) => h.trim())
      .filter((h) => h.length > 10);

    const plains = plainEnv
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    if (hashes.length === 0 && plains.length === 0) {
      throw new UnauthorizedException("Login is not configured");
    }

    let matched = false;
    for (const hash of hashes) {
      if (await bcrypt.compare(dto.password, hash)) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      matched = plains.some((stored) => safeCompare(dto.password, stored));
    }

    if (!matched) throw new UnauthorizedException("Invalid credentials");

    const secret = new TextEncoder().encode(config.JWT_SECRET);

    const token = await new jose.SignJWT({
      sub: "operator",
      role: "ADMIN",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(config.JWT_EXPIRY)
      .sign(secret);

    return { token, expiresIn: config.JWT_EXPIRY };
  }
}

