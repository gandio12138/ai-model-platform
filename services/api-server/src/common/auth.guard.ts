import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import jwt from "jsonwebtoken";
import { DatabaseService } from "../database/database.service.js";
import { PERMISSIONS_KEY } from "./permissions.decorator.js";

export interface AdminRequestUser {
  id: string;
  email: string;
  userType: string;
  accountType: "admin" | "tenant" | "customer";
  roles: string[];
  permissions: string[];
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(Reflector) private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }

    let payload: { sub: string; email: string };
    try {
      payload = jwt.verify(
        header.slice("Bearer ".length),
        process.env.JWT_SECRET ?? "local-dev-jwt-secret"
      ) as { sub: string; email: string };
    } catch {
      throw new UnauthorizedException("Invalid bearer token");
    }
    if (!payload.sub) {
      throw new UnauthorizedException("Invalid bearer token");
    }

    const { rows } = await this.db.query<{
      id: string;
      email: string;
      user_type: string;
      account_type: "admin" | "tenant" | "customer";
      roles: string[];
      permissions: string[];
    }>(
      `select u.id,
              u.email,
              u.user_type,
              case
                when u.user_type = 'admin' then 'admin'
                when u.user_type = 'tenant' then 'tenant'
                else 'customer'
              end as account_type,
              coalesce(array_agg(distinct r.code) filter (where r.code is not null), '{}') as roles,
              coalesce(array_agg(distinct p.code) filter (where p.code is not null), '{}') as permissions
         from users u
         left join user_roles ur on ur.user_id = u.id
         left join roles r on r.id = ur.role_id
         left join role_permissions rp on rp.role_id = r.id
         left join permissions p on p.id = rp.permission_id
        where u.id = $1 and u.status = 'active'
        group by u.id`,
      [payload.sub]
    );

    if (!rows[0]) {
      throw new UnauthorizedException("User not found or inactive");
    }
    if (rows[0].account_type === "customer") {
      throw new ForbiddenException("Customer accounts cannot access the management console");
    }

    req.user = {
      id: rows[0].id,
      email: rows[0].email,
      userType: rows[0].user_type,
      accountType: rows[0].account_type,
      roles: rows[0].roles,
      permissions: rows[0].permissions
    } satisfies AdminRequestUser;

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (required?.length) {
      const granted = new Set(rows[0].permissions);
      const allowed = required.every((permission) => granted.has(permission));
      if (!allowed) {
        throw new ForbiddenException("Permission denied");
      }
    }

    return true;
  }
}
