import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { AdminService } from "./admin.service.js";

@Injectable()
export class ProviderModelSyncScheduler implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly admin: AdminService
  ) {}

  onModuleInit() {
    if (process.env.MODEL_SYNC_SCHEDULER_ENABLED === "false") return;
    const intervalMs = this.intervalMs();
    const initialDelayMs = this.initialDelayMs(intervalMs);
    this.timer = setInterval(() => {
      void this.syncAllProviders("scheduled_interval");
    }, intervalMs);
    this.timer.unref?.();
    if (process.env.MODEL_SYNC_RUN_ON_STARTUP === "true") {
      setTimeout(() => void this.syncAllProviders("startup"), initialDelayMs).unref?.();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async syncAllProviders(trigger: "scheduled_interval" | "startup") {
    if (this.running) return;
    this.running = true;
    try {
      const actorId = await this.findSystemActorId();
      if (!actorId) {
        console.warn("[provider-model-sync] skipped: no active admin user for audit actor");
        return;
      }
      const { rows } = await this.db.query<{
        id: string;
        provider_type: string;
        region: string | null;
        metadata: Record<string, unknown> | null;
        credential_id: string | null;
        credential_type: string | null;
      }>(
        `select p.id,
                p.provider_type,
                p.region,
                p.metadata,
                pc.id as credential_id,
                pc.credential_type
           from providers p
           left join lateral (
             select id
               from provider_credentials
              where provider_id = p.id
                and status = 'active'
              order by created_at desc
              limit 1
           ) pc on true
          where p.status = 'active'
            and p.provider_type in ('aws_bedrock', 'google_vertex_ai', 'vertex_ai', 'google_vertex')
          order by p.created_at asc`
      );
      for (const provider of rows) {
        try {
          await this.admin.syncProviderModels(
            provider.id,
            this.buildSyncBody(provider, trigger),
            { id: actorId, permissions: ["provider.sync_models"], user_type: "admin" },
            { id: actorId, ip: "127.0.0.1", userAgent: `provider-model-sync/${trigger}` }
          );
        } catch (error) {
          console.warn(
            `[provider-model-sync] provider ${provider.id} failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  private buildSyncBody(
    provider: {
      provider_type: string;
      region: string | null;
      metadata: Record<string, unknown> | null;
      credential_id: string | null;
      credential_type: string | null;
    },
    trigger: string
  ) {
    const providerType = String(provider.provider_type ?? "").toLowerCase();
    const metadata = provider.metadata ?? {};
    const body: Record<string, unknown> = {
      reason: `automatic provider model sync: ${trigger}`
    };
    if (providerType === "aws_bedrock") {
      body.aws_region = provider.region || metadata.aws_region || "us-east-1";
      if (provider.credential_id && String(provider.credential_type ?? "").toLowerCase() === "iam_access_key") {
        body.credential_id = provider.credential_id;
      }
    }
    if (["google_vertex_ai", "vertex_ai", "google_vertex"].includes(providerType)) {
      if (provider.credential_id) body.credential_id = provider.credential_id;
      body.gcp_project_id = metadata.gcp_project_id ?? metadata.project_id ?? process.env.GCP_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT;
      body.vertex_regions = metadata.vertex_regions ?? metadata.regions;
    }
    return body;
  }

  private async findSystemActorId() {
    const { rows } = await this.db.query<{ id: string }>(
      `select id
         from users
        where user_type = 'admin'
          and status = 'active'
        order by created_at asc
        limit 1`
    );
    return rows[0]?.id ?? null;
  }

  private intervalMs() {
    const hours = Number(process.env.MODEL_SYNC_INTERVAL_HOURS ?? 24);
    const safeHours = Number.isFinite(hours) && hours >= 1 ? hours : 24;
    return Math.floor(safeHours * 60 * 60 * 1000);
  }

  private initialDelayMs(intervalMs: number) {
    const minutes = Number(process.env.MODEL_SYNC_STARTUP_DELAY_MINUTES ?? 10);
    const safeMinutes = Number.isFinite(minutes) && minutes >= 0 ? minutes : 10;
    return Math.min(Math.floor(safeMinutes * 60 * 1000), intervalMs);
  }
}
