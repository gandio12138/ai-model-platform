import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";

export interface AuditActor {
  id: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async record(input: {
    actor?: AuditActor;
    action: string;
    targetType: string;
    targetId: string;
    beforeValue?: unknown;
    afterValue?: unknown;
    reason?: string;
  }) {
    await this.db.query(
      `insert into audit_logs
        (actor_user_id, action, target_type, target_id, before_value, after_value, ip, user_agent, approval_no)
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)`,
      [
        input.actor?.id ?? null,
        input.action,
        input.targetType,
        input.targetId,
        JSON.stringify(input.beforeValue ?? null),
        JSON.stringify(input.afterValue ?? null),
        input.actor?.ip ?? null,
        input.actor?.userAgent ?? null,
        input.reason ?? null
      ]
    );
  }
}
