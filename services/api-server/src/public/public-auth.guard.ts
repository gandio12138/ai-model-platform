import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import jwt from "jsonwebtoken";
import { DatabaseService } from "../database/database.service.js";

export interface PublicRequestUser {
  id: string;
  email: string | null;
  phone: string | null;
  userType: string;
  accountType: "customer";
  tenantId?: string | null;
  projectId?: string | null;
  tenantCustomerId?: string | null;
}

@Injectable()
export class PublicAuthGuard implements CanActivate {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }

    let payload: {
      sub: string;
      email?: string;
      tenant_id?: string;
      project_id?: string;
      tenant_customer_id?: string;
    };
    try {
      payload = jwt.verify(
        header.slice("Bearer ".length),
        process.env.JWT_SECRET ?? "local-dev-jwt-secret"
      ) as {
        sub: string;
        email?: string;
        tenant_id?: string;
        project_id?: string;
        tenant_customer_id?: string;
      };
    } catch {
      throw new UnauthorizedException("Invalid bearer token");
    }
    if (!payload.sub) {
      throw new UnauthorizedException("Invalid bearer token");
    }

    const { rows } = await this.db.query<{
      id: string;
      email: string | null;
      phone: string | null;
      user_type: string;
      account_type: "admin" | "tenant" | "customer";
    }>(
      `select id,
              email,
              phone,
              user_type,
              case
                when user_type = 'admin' then 'admin'
                when user_type = 'tenant' then 'tenant'
                else 'customer'
              end as account_type
         from users
        where id = $1
          and status = 'active'`,
      [payload.sub]
    );

    const user = rows[0];
    if (!user) {
      throw new UnauthorizedException("User not found or inactive");
    }
    if (user.account_type !== "customer") {
      throw new ForbiddenException("Management accounts cannot access customer checkout APIs");
    }

    req.user = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      userType: user.user_type,
      accountType: "customer",
      tenantId: payload.tenant_id ?? null,
      projectId: payload.project_id ?? null,
      tenantCustomerId: payload.tenant_customer_id ?? null
    } satisfies PublicRequestUser;
    return true;
  }
}
