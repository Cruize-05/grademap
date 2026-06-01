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

/**
 * Fetches a binary endpoint (e.g. a PDF) with the caller's auth token and
 * triggers a browser download. Throws with the server's error message on
 * non-2xx so callers can surface it.
 */
async function download(path: string, filename: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: await getAuthHeaders(),
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const json = (await res.json()) as { error?: { message?: string } };
      message = json.error?.message ?? message;
    } catch {
      /* response was not JSON */
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
  download,
};
