const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";

export interface ApiList<T = any> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function getToken() {
  return localStorage.getItem("admin_token");
}

export function setSession(token: string, user: unknown) {
  localStorage.setItem("admin_token", token);
  localStorage.setItem("admin_user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
}

export function getSessionUser() {
  const value = localStorage.getItem("admin_user");
  return value ? JSON.parse(value) : null;
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
    location.href = "/login";
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json();
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

