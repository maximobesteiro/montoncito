export const DEFAULT_SERVER_URL = "http://localhost:3001";

export function getServerUrl(): string {
  return process.env.NEXT_PUBLIC_SERVER_URL || DEFAULT_SERVER_URL;
}

const CLIENT_ID_STORAGE_KEY = "montoncito:clientId";

export function getOrCreateClientId(): string {
  if (typeof window === "undefined") {
    // Should only be used client-side (WaitingRoom is a client component).
    throw new Error("getOrCreateClientId must be called in the browser");
  }
  const existing = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (existing) return existing;

  const id = crypto.randomUUID();
  window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, id);
  return id;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { clientId?: string }
): Promise<T> {
  const url = new URL(path, getServerUrl());
  const clientId = init?.clientId;

  const headers = new Headers(init?.headers);
  if (clientId) headers.set("x-client-id", clientId);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");

  const res = await fetch(url.toString(), { ...init, headers });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${bodyText}`);
  }
  return (await res.json()) as T;
}


