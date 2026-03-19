import { SetMetadata, createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { UserRole } from "@arbitex/shared-types";

export const ROLES_KEY = "roles";
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
export const Public = () => SetMetadata("isPublic", true);

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
