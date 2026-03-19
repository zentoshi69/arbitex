import { Body, Controller, HttpCode, HttpStatus, Post, UnauthorizedException } from "@nestjs/common";
import { IsString, MinLength } from "class-validator";
import { Public } from "./auth.decorators.js";
import { config } from "@arbitex/config";
import * as jose from "jose";
import bcrypt from "bcryptjs";

class LoginDto {
  @IsString()
  @MinLength(8)
  password!: string;
}

@Controller("auth")
export class AuthController {
  @Post("login")
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    const configuredHash = process.env["OPERATOR_PASSWORD_HASH"];
    const configuredPassword = process.env["OPERATOR_PASSWORD"];

    if (!configuredHash && !configuredPassword) {
      throw new UnauthorizedException("Login is not configured");
    }

    const ok = configuredHash
      ? await bcrypt.compare(dto.password, configuredHash)
      : dto.password === configuredPassword;

    if (!ok) throw new UnauthorizedException("Invalid credentials");

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

