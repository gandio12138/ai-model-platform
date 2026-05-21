const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const TOKEN_KEY = "checkout_token";
const USER_KEY = "checkout_user";

export interface CheckoutContextParams extends Record<string, string | undefined> {
  tenant_code?: string;
  tenant_id?: string;
  project_code?: string;
  project_id?: string;
  platform?: string;
}

export interface PaymentProduct {
  id: string;
  product_code: string;
  display_name: string;
  display_description?: string | null;
  badge?: string | null;
  product_type: string;
  face_value_amount: number;
  bonus_amount: number;
  sale_amount: number;
  currency: string;
  features: string[];
  valid_days?: number | null;
  payment_methods: string[];
}

export interface PaymentMethod {
  channel_code: string;
  channel_type: string;
  display_name: string;
  platform: string;
  payment_method: string;
  settlement_mode: string;
  fee_rate_bps?: number | null;
}

export interface Wallet {
  id: string;
  currency: string;
  cash_balance: number;
  bonus_balance: number;
  frozen_balance: number;
  credit_limit: number;
  available_balance: number;
  status: string;
}

export interface WalletLedgerItem {
  id: string;
  event_type: string;
  direction: "credit" | "debit" | "freeze" | "unfreeze";
  balance_type: "cash" | "bonus" | "frozen" | "credit";
  amount: number;
  currency: string;
  balance_after?: number | null;
  related_type?: string | null;
  related_id?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface ModelInfo {
  id: string;
  model_code: string;
  display_name: string;
  family?: string | null;
  modality: string[];
  max_context_tokens?: number | null;
  default_max_output_tokens?: number | null;
  capabilities: {
    stream: boolean;
    tools: boolean;
    json_mode: boolean;
  };
  limits: {
    rpm?: number | null;
    tpm?: number | null;
    daily_budget?: number | null;
    monthly_budget?: number | null;
  };
  enabled_features: string[];
  price?: {
    version: string;
    currency: string;
    mode: string;
    input_per_1k?: number | null;
    output_per_1k?: number | null;
  } | null;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  masked_key: string;
  status: string;
  model_whitelist: string[];
  ip_whitelist: string[];
  limits: {
    rpm?: number | null;
    tpm?: number | null;
    daily_budget?: number | null;
    monthly_budget?: number | null;
  };
  expires_at?: string | null;
  last_used_at?: string | null;
  created_at: string;
  revoked_at?: string | null;
}

export interface UsageLogItem {
  id: string;
  request_id: string;
  source: string;
  model_code: string;
  status: string;
  stream: boolean;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_amount: number;
  currency: string;
  latency_ms?: number | null;
  finish_reason?: string | null;
  error_code?: string | null;
  created_at: string;
}

export interface UsageSummary {
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  avg_latency_ms: number;
  rpm: number;
  tpm: number;
  trend: Array<{
    day: string;
    requests: number;
    tokens: number;
    cost: number;
  }>;
}

export interface ReferralSummary {
  invite_code: string;
  invited_customers: number;
  pending_commission: number;
  available_commission: number;
  withdrawn_commission: number;
  currency: string;
}

export interface AppRelease {
  id: string;
  platform: "ios" | "android";
  distribution_channel: string;
  version: string;
  build_number?: number | null;
  release_status: string;
  min_supported_version?: string | null;
  force_update: boolean;
  download_url?: string | null;
  changelog?: string | null;
  published_at?: string | null;
}

export interface SiteConfigPayload {
  tenant: BootstrapPayload["tenant"];
  project: BootstrapPayload["project"];
  platform: string;
  site_config: {
    branding: {
      site_name: string;
      logo_url?: string | null;
      slogan?: string | null;
      hero_title: string;
      hero_subtitle: string;
      footer_text?: string | null;
      icp_text?: string | null;
    };
    navigation: Array<{ key: string; label: string; href?: string; visible: boolean }>;
    announcements: Array<{ title: string; content: string; level: "info" | "warning" | "success"; visible: boolean; start_at?: string; end_at?: string }>;
    faq: Array<{ question: string; answer: string; sort_order: number; visible: boolean }>;
    support: { email?: string | null; work_time?: string | null; telegram?: string | null; discord?: string | null };
    legal: { terms_url?: string | null; privacy_url?: string | null; ai_disclaimer_url?: string | null };
  };
  app_download: {
    enabled: boolean;
    show_on_web_home: boolean;
    show_on_console: boolean;
    show_on_payment_success: boolean;
    title: string;
    subtitle?: string | null;
    ios: {
      enabled: boolean;
      app_store_url?: string | null;
      testflight_url?: string | null;
      download_url?: string | null;
      version?: string | null;
      min_supported_version?: string | null;
      release_notes?: string | null;
    };
    android: {
      enabled: boolean;
      apk_url?: string | null;
      official_url?: string | null;
      markets?: Array<{ channel: string; name: string; url: string; enabled: boolean }>;
      version?: string | null;
      min_supported_version?: string | null;
      release_notes?: string | null;
    };
    qr_code_url?: string | null;
    release_notes?: string | null;
    releases?: AppRelease[];
  };
  web_payment_entry: {
    enabled: boolean;
    url?: string | null;
    show_on_web: boolean;
  };
  feature_flags: Record<string, unknown>;
}

export interface CommissionRecord {
  id: string;
  source_user_id?: string | null;
  source_email?: string | null;
  payment_order_id?: string | null;
  commission_base_amount: number;
  commission_rate: number;
  commission_amount: number;
  currency: string;
  status: string;
  frozen_until?: string | null;
  created_at: string;
}

export interface BootstrapPayload {
  tenant: {
    id: string;
    tenant_code: string;
    name: string;
    tenant_type?: string;
    billing_mode?: string;
    current_plan_code?: string | null;
  };
  project: { id: string; project_code: string; name: string; platform: string } | null;
  platform: string;
  products: PaymentProduct[];
  payment_methods: PaymentMethod[];
  app_releases?: AppRelease[];
}

export interface SessionPayload {
  token: string;
  user: { id: string; email: string; phone?: string | null; userType?: string; accountType: string };
  tenant: BootstrapPayload["tenant"];
  project: BootstrapPayload["project"];
  platform: string;
  wallet: Wallet;
}

export interface PaymentOrder {
  id: string;
  order_no: string;
  status: string;
  platform: string;
  payment_method: string;
  checkout_channel: string;
  amount: number;
  currency: string;
  product: {
    id: string;
    product_code: string;
    name: string;
    product_type: string;
    face_value_amount: number;
    bonus_amount: number;
    sale_amount: number;
  };
  payment_action?: {
    type: string;
    status?: string;
    title?: string;
    provider?: string;
    qr_content?: string;
    expires_at?: string;
    url?: string;
    order_no?: string;
    instructions?: string[];
    account?: Record<string, unknown>;
  };
  paid_at?: string | null;
  fulfilled_at?: string | null;
  created_at: string;
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getSessionUser() {
  const value = localStorage.getItem(USER_KEY);
  return value ? JSON.parse(value) : null;
}

export function setSession(payload: SessionPayload) {
  localStorage.setItem(TOKEN_KEY, payload.token);
  localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
}

export function updateSessionUser(user: SessionPayload["user"]) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function toQuery(params: Record<string, unknown>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });
  return search.toString();
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    clearSession();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export function checkoutContextFromUrl(): CheckoutContextParams {
  const search = new URLSearchParams(location.search);
  return {
    tenant_code: search.get("tenant_code") ?? "platform_default_tenant",
    tenant_id: search.get("tenant_id") ?? undefined,
    project_code: search.get("project_code") ?? "web-checkout",
    project_id: search.get("project_id") ?? undefined,
    platform: search.get("platform") ?? "web"
  };
}
