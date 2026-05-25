import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigResolutionService } from "./config-resolution.service.js";

function createService(input: {
  configs?: Record<string, unknown>;
  policy?: Record<string, unknown> | null;
  paymentChannels?: Array<Record<string, unknown>>;
  appReleases?: Array<Record<string, unknown>>;
}) {
  const db = {
    async query(sql: string, params: unknown[] = []) {
      if (sql.includes("from tenants")) {
        return {
          rows: [
            {
              id: "tenant_1",
              tenant_code: "platform_default_tenant",
              name: "默认租户",
              tenant_type: "platform_default",
              billing_mode: "prepaid",
              current_plan_code: "starter"
            }
          ]
        };
      }
      if (sql.includes("from tenant_projects")) {
        return {
          rows: [
            {
              id: "project_1",
              tenant_id: "tenant_1",
              project_code: "web-checkout",
              name: "Web 收银台",
              project_type: "web_checkout",
              platform: params.includes("ios") ? "ios" : params.includes("android") ? "android" : "web",
              payment_policy: {}
            }
          ]
        };
      }
      if (sql.includes("from configs")) {
        return {
          rows: [{ published_value: input.configs?.[String(params[0])] ?? null }]
        };
      }
      if (sql.includes("from distribution_policies")) {
        return { rows: input.policy ? [input.policy] : [] };
      }
      if (sql.includes("from payment_channels")) {
        return { rows: input.paymentChannels ?? [] };
      }
      if (sql.includes("from app_releases")) {
        return { rows: input.appReleases ?? [] };
      }
      return { rows: [] };
    }
  };
  return new ConfigResolutionService(db as any);
}

describe("ConfigResolutionService", () => {
  it("resolves site config and respects disabled app download", async () => {
    const service = createService({
      configs: {
        site_config: {
          branding: {
            site_name: "oToken",
            hero_title: "后台配置标题",
            hero_subtitle: "后台配置副标题"
          }
        },
        app_download: {
          enabled: false,
          show_on_web_home: false,
          show_on_console: false,
          show_on_payment_success: false
        }
      },
      appReleases: [
        {
          id: "release_1",
          platform: "ios",
          distribution_channel: "testflight",
          version: "1.0.0",
          build_number: 1,
          release_status: "published",
          min_supported_version: "1.0.0",
          force_update: false,
          download_url: "https://example.com/ios",
          changelog: "test",
          file_size_bytes: null,
          checksum_sha256: null,
          published_at: "2026-05-21T00:00:00.000Z",
          metadata: {}
        }
      ]
    });

    const payload = await service.resolveSiteConfig({ platform: "web" });

    assert.equal(payload.site_config.branding.hero_title, "后台配置标题");
    assert.equal(payload.app_download.enabled, false);
    assert.equal(payload.app_download.show_on_web_home, false);
  });

  it("resolves app config with platform payment rules", async () => {
    const service = createService({
      configs: {
        web_payment_entry: {
          enabled: true,
          url: "https://pay.example.com",
          show_in_ios_app: true,
          show_in_android_app: true
        }
      },
      policy: {
        legal_approved: false,
        review_mode: false,
        show_web_payment_link: true,
        allowed_payment_methods: ["apple_iap", "alipay_app"]
      },
      paymentChannels: [
        {
          channel_code: "iap",
          channel_type: "apple_iap",
          display_name: "Apple IAP",
          platform: "ios",
          payment_method: "apple_iap",
          settlement_mode: "app_store_collected",
          fee_rate_bps: 3000,
          sort_order: 1,
          config: {}
        },
        {
          channel_code: "alipay",
          channel_type: "android_unified_checkout",
          display_name: "支付宝",
          platform: "ios",
          payment_method: "alipay_app",
          settlement_mode: "platform_collected",
          fee_rate_bps: 60,
          sort_order: 2,
          config: {}
        }
      ]
    });

    const payload = await service.resolveAppConfig({ platform: "ios", distribution_channel: "testflight" });

    assert.deepEqual(payload.available_payment_methods, ["apple_iap"]);
    assert.equal(payload.ios_iap_enabled, true);
    assert.equal(payload.show_web_payment_link, false);
  });
});
