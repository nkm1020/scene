"use client";
export interface Creds { memberId: string; secret: string }
const key = (room: string) => `scene:${room}`;
export function loadCreds(room: string): Creds | null {
  try { return JSON.parse(localStorage.getItem(key(room)) ?? "null"); } catch { return null; }
}
export function saveCreds(room: string, c: Creds) {
  try { localStorage.setItem(key(room), JSON.stringify(c)); } catch {}
}
export function lastSeen(room: string): number {
  try { return Number(localStorage.getItem(`${key(room)}:seen`) ?? 0); } catch { return 0; }
}
export function setLastSeen(room: string, seq: number) {
  try { localStorage.setItem(`${key(room)}:seen`, String(seq)); } catch {}
}
export async function api<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "Content-Type": "application/json", ...(init?.headers ?? {}) } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}
