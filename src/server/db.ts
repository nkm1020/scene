import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import type { Ledger } from "@/core/ledger";

let _db: SupabaseClient | null = null;
export function db(): SupabaseClient {
  if (_db) return _db;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the web app");
  _db = createClient(url, key, { auth: { persistSession: false } });
  return _db;
}

export const hashSecret = (s: string) => createHash("sha256").update(s).digest("hex");
export const newSecret = () => randomBytes(24).toString("base64url");
export const newRoomId = () => randomBytes(6).toString("base64url").replace(/[-_]/g, "x").toLowerCase();

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Verify a member's secret. Returns the member row. */
export async function authMember(memberId: string | null | undefined, secret: string | null | undefined) {
  if (!memberId || !secret) throw new HttpError(401, "missing member credentials");
  const { data, error } = await db().from("member_secrets").select("member_id, secret_hash, voice_path, voice_text").eq("member_id", memberId).maybeSingle();
  if (error) throw error;
  if (!data || data.secret_hash !== hashSecret(secret)) throw new HttpError(401, "invalid member credentials");
  const { data: member, error: e2 } = await db().from("members").select("*").eq("id", memberId).single();
  if (e2) throw e2;
  return { member, secrets: data };
}

export async function saveLedger(ledger: Ledger, roomId: string | null) {
  if (!ledger.entries.length) return;
  const rows = ledger.entries.map((e) => ({
    room_id: roomId,
    model: e.model,
    op: e.op,
    ms: e.ms,
    usd: e.usd,
    ok: e.ok,
    input_tokens: e.inputTokens ?? null,
    output_tokens: e.outputTokens ?? null,
    reasoning_tokens: e.reasoningTokens ?? null,
    audio_ms: e.audioMs ?? null,
    note: e.note ?? null,
    at: e.at,
  }));
  const { error } = await db().from("ledger").insert(rows);
  if (error) console.error("ledger insert failed", error.message);
}

export function publicUrl(bucket: string, path: string): string {
  return db().storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export function jsonError(err: unknown) {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof Error ? err.message : String(err);
  if (status >= 500) console.error(err);
  return Response.json({ error: message }, { status });
}
