"use client";
// Your profile on this device: one key for every room you sit in (no account, no email).
export interface Profile {
  profileId: string;
  secret: string;
}
const KEY = "scene:profile";
export function loadProfile(): Profile | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}
export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}
/** The last frame you saw in each room, for unread counts. */
export function seenMap(): Record<string, number> {
  const out: Record<string, number> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      const m = /^scene:(.+):seen$/.exec(k);
      if (m) out[m[1]] = Number(localStorage.getItem(k) ?? 0);
    }
  } catch {}
  return out;
}
