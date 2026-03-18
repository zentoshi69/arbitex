import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  SetMetadata,
  createParamDecorator,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Module } from "@nestjs/common";
import * as jose from "jose";
import { config } from "@arbitex/config";
import type { UserRole } from "@arbitex/shared-types";
import { AuthController } from "./auth.controller.js";

// ── Metadata keys ─────────────────────────────────────────────────────────────
export const ROLES_KEY = "roles";
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
export const Public = () => SetMetadata("isPublic", true);

// ── Current user decorator ────────────────────────────────────────────────────
export type JwtPayload = {
  sub: string;
  role: UserRole;
  email?: string;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as JwtPayload;
  }
);

// ── JWT Guard ─────────────────────────────────────────────────────────────────
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly secret: Uint8Array;

  constructor(private readonly reflector: Reflector) {
    this.secret = new TextEncoder().encode(config.JWT_SECRET);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>("isPublic", [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const request = ctx.switchToHttp().getRequest();
    const authHeader = request.headers["authorization"] as string | undefined;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing authorization header");
    }

    const token = authHeader.slice(7);

    try {
      const { payload } = await jose.jwtVerify(token, this.secret, {
        algorithms: ["HS256"],
      });
      request.user = payload as JwtPayload;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }

    return true;
  }
}

// ── Role Guard ────────────────────────────────────────────────────────────────
const ROLE_HIERARCHY: Record<UserRole, number> = {
  VIEWER: 0,
  OPERATOR: 1,
  ADMIN: 2,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()]
    );
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;
    if (!user) throw new ForbiddenException("No user context");

    const userLevel = ROLE_HIERARCHY[user.role] ?? -1;
    const minRequired = Math.min(
      ...requiredRoles.map((r) => ROLE_HIERARCHY[r] ?? 999)
    );

    if (userLevel < minRequired) {
      throw new ForbiddenException(
        `Role '${user.role}' insufficient. Required: ${requiredRoles.join(" | ")}`
      );
    }

    return true;
  }
}

// ── Auth Module ───────────────────────────────────────────────────────────────
@Module({
  providers: [JwtAuthGuard, RolesGuard],
  controllers: [AuthController],
  exports: [JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
