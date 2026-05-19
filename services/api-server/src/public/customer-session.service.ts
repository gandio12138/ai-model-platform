import { BadRequestException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { DatabaseService } from "../database/database.service.js";

export interface CustomerTokenContext {
  tenant?: { id: string } | null;
  project?: { id: string } | null;
  tenant_customer?: { id: string } | null;
}

export interface CustomerTokenUser {
  id: string;
  email?: string | null;
  phone?: string | null;
}

@Injectable()
export class CustomerSessionService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  signAccessToken(user: CustomerTokenUser, context: CustomerTokenContext = {}) {
    const options: SignOptions = {
      expiresIn: (process.env.CUSTOMER_ACCESS_TOKEN_TTL ?? "8h") as SignOptions["expiresIn"]
    };
    return jwt.sign(
      {
        sub: user.id,
        email: user.email ?? undefined,
        account_type: "customer",
        tenant_id: context.tenant?.id,
        project_id: context.project?.id,
        tenant_customer_id: context.tenant_customer?.id
      },
      process.env.JWT_SECRET ?? "local-dev-jwt-secret",
      options
    );
  }

  async createRefreshToken(
    user: CustomerTokenUser,
    context: CustomerTokenContext = {},
    metadata: Record<string, unknown> = {}
  ) {
    const token = `rt_${randomBytes(32).toString("base64url")}`;
    const tokenHash = this.hashToken(token);
    const ttlDays = Math.max(Number(process.env.CUSTOMER_REFRESH_TOKEN_DAYS ?? 30), 1);
    await this.db.query(
      `insert into refresh_tokens
        (user_id, tenant_id, project_id, tenant_customer_id, token_hash, device_id,
         user_agent, ip_address, expires_at, metadata)
       values
        ($1, $2, $3, $4, $5, $6, $7, $8, now() + ($9::text || ' days')::interval, $10::jsonb)`,
      [
        user.id,
        context.tenant?.id ?? null,
        context.project?.id ?? null,
        context.tenant_customer?.id ?? null,
        tokenHash,
        stringOrNull(metadata.device_id),
        stringOrNull(metadata.user_agent),
        stringOrNull(metadata.ip_address),
        ttlDays,
        JSON.stringify(metadata)
      ]
    );
    return token;
  }

  async createTokenPair(
    user: CustomerTokenUser,
    context: CustomerTokenContext = {},
    metadata: Record<string, unknown> = {}
  ) {
    const accessToken = this.signAccessToken(user, context);
    const refreshToken = await this.createRefreshToken(user, context, metadata);
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: "Bearer",
      expires_in: 8 * 60 * 60
    };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new BadRequestException("refresh_token is required");
    }
    const tokenHash = this.hashToken(refreshToken);
    const { rows } = await this.db.query<{
      id: string;
      user_id: string;
      tenant_id: string | null;
      project_id: string | null;
      tenant_customer_id: string | null;
      email: string | null;
      phone: string | null;
      user_type: string;
    }>(
      `select rt.id,
              rt.user_id,
              rt.tenant_id,
              rt.project_id,
              rt.tenant_customer_id,
              u.email,
              u.phone,
              u.user_type
         from refresh_tokens rt
         join users u on u.id = rt.user_id
        where rt.token_hash = $1
          and rt.status = 'active'
          and rt.revoked_at is null
          and rt.expires_at > now()
          and u.status = 'active'`,
      [tokenHash]
    );
    const session = rows[0];
    if (!session || session.user_type === "admin" || session.user_type === "tenant") {
      throw new UnauthorizedException("Invalid refresh token");
    }
    await this.db.query(`update refresh_tokens set last_used_at = now() where id = $1`, [session.id]);
    const accessToken = this.signAccessToken(
      { id: session.user_id, email: session.email, phone: session.phone },
      {
        tenant: session.tenant_id ? { id: session.tenant_id } : null,
        project: session.project_id ? { id: session.project_id } : null,
        tenant_customer: session.tenant_customer_id ? { id: session.tenant_customer_id } : null
      }
    );
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token: accessToken,
      token_type: "Bearer",
      expires_in: 8 * 60 * 60
    };
  }

  async revoke(refreshToken: string) {
    if (!refreshToken) return { ok: true };
    await this.db.query(
      `update refresh_tokens
          set status = 'revoked',
              revoked_at = now()
        where token_hash = $1
          and status = 'active'`,
      [this.hashToken(refreshToken)]
    );
    return { ok: true };
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }
}

function stringOrNull(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}
