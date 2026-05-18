import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { DatabaseService } from "../database/database.service.js";

@Injectable()
export class AuthService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async login(email: string, password: string) {
    const { rows } = await this.db.query<{
      id: string;
      email: string;
      password_hash: string;
      roles: string[];
      permissions: string[];
    }>(
      `select u.id,
              u.email,
              u.password_hash,
              coalesce(array_agg(distinct r.code) filter (where r.code is not null), '{}') as roles,
              coalesce(array_agg(distinct p.code) filter (where p.code is not null), '{}') as permissions
         from users u
         left join user_roles ur on ur.user_id = u.id
         left join roles r on r.id = ur.role_id
         left join role_permissions rp on rp.role_id = r.id
         left join permissions p on p.id = rp.permission_id
        where u.email = $1 and u.status = 'active'
        group by u.id`,
      [email]
    );
    const user = rows[0];
    if (!user?.password_hash) {
      throw new UnauthorizedException("Invalid email or password");
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email },
      process.env.JWT_SECRET ?? "local-dev-jwt-secret",
      { expiresIn: "8h" }
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        roles: user.roles,
        permissions: user.permissions
      }
    };
  }
}
