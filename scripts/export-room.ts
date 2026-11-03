// Export any room as a self-contained replay.html (+ receipt.json): personas, audio and directions inline.
//   npx tsx scripts/export-room.ts <roomId> [outDir]
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildReplayHtml, dataUrl } from "../src/core/export";
import type { PerformItem } from "../src/stage/engine";

const roomId = process.argv[2];
const outDir = process.argv[3] ?? "out";
if (!roomId) throw new Error("usage: export-room.ts <roomId> [outDir]");
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function fetchData(url: string | null): Promise<string | null> {
  if (!url) return null;
  const r = await fetch(url);
  if (!r.ok) return null;
  return dataUrl(Buffer.from(await r.arrayBuffer()), r.headers.get("content-type") ?? "application/octet-stream");
}

const { data: room } = await db.from("rooms").select("*").eq("id", roomId).single().throwOnError();
const { data: members } = await db.from("members").select("*").eq("room_id", roomId).order("created_at").throwOnError();
const { data: messages } = await db.from("messages").select("*").eq("room_id", roomId).order("seq").throwOnError();
const { data: renders } = await db.from("renders").select("*").eq("room_id", roomId).throwOnError();
const { data: ledger } = await db.from("ledger").select("*").eq("room_id", roomId).throwOnError();
const byId = new Map((renders ?? []).map((r: any) => [r.message_id, r]));

const stageMembers = await Promise.all(
  (members ?? []).map(async (m: any) => ({ id: m.id, name: m.name, personaUrl: await fetchData(m.persona_url), awayUrl: await fetchData(m.persona_away_url), present: false })),
);
const items: PerformItem[] = [];
for (const m of messages ?? []) {
  const r: any = byId.get(m.id);
  items.push({
    messageId: m.id,
    memberId: m.member_id,
    text: m.text,
    emotion: r?.emotion ?? "neutral",
    gesture: r?.gesture ?? "none",
    camera: r?.camera ?? "room",
    pauseMs: r?.pause_ms ?? 300,
    status: !r || r.status === "pending" ? "captions_only" : r.status,
    audioUrl: r?.status === "verified" ? await fetchData(r.audio_url) : null,
    envelope: r?.envelope ?? [],
    durationMs: r?.duration_ms ?? 0,
    flags: r?.flags ?? [],
  });
}
const byModel: Record<string, { calls: number; usd: number; ms: number }> = {};
let usd = 0;
for (const e of ledger ?? []) {
  usd += Number(e.usd);
  (byModel[e.model] ??= { calls: 0, usd: 0, ms: 0 }).calls++;
  byModel[e.model].usd += Number(e.usd);
  byModel[e.model].ms += e.ms;
}
const summary = { calls: ledger?.length ?? 0, usd, byModel };
const sources = new Set((renders ?? []).map((r: any) => r.direction_source));
mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, "replay.html"),
  await buildReplayHtml({ room: room.name, members: stageMembers, items, director: { source: [...sources].join("+") || "rules", attempts: 0, log: [], flags: [] }, receipt: summary }),
);
writeFileSync(
  path.join(outDir, "receipt.json"),
  JSON.stringify(
    {
      room: room.name,
      exportedAt: new Date().toISOString(),
      summary,
      messages: (messages ?? []).map((m: any) => {
        const r: any = byId.get(m.id);
        return { seq: m.seq, sender: members!.find((x: any) => x.id === m.member_id)?.name, text: m.text, direction: r && { emotion: r.emotion, gesture: r.gesture, camera: r.camera, pause_ms: r.pause_ms, source: r.direction_source }, voice: r && { status: r.status, similarity: r.similarity, heard: r.heard, attempts: r.attempts, flags: r.flags } };
      }),
      ledger,
    },
    null,
    2,
  ),
);
console.log(`exported ${roomId}: ${items.length} lines, ${items.filter((i) => i.audioUrl).length} with verified audio → ${outDir}/replay.html`);
