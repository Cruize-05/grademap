import { supabase } from "./supabase.ts";

const API_BASE = import.meta.env["VITE_API_BASE_URL"] ?? "http://localhost:4000";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await getAuthHeaders()),
  };

  const fetchInit: RequestInit = { method, headers };
  if (body !== undefined) fetchInit.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, fetchInit);

  const json = await res.json();

  if (!res.ok) {
    const err = (json as { error?: { message?: string } }).error;
    throw new Error(err?.message ?? `HTTP ${res.status}`);
  }

  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
};
