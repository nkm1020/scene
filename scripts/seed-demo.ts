// Seed (or refresh) the demo template room in Supabase. Each visitor to "Open the demo room" gets a private copy.
//   npx tsx scripts/seed-demo.ts            personas from public/seed, Spark directions, voices if TTS is configured
//   npx tsx scripts/seed-demo.ts --no-voice captions only
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { Ledger } from "../src/core/ledger";
import { SEED_MEMBERS, SEED_MESSAGES } from "../src/core/seed";
import { directSegment } from "../src/core/director";
import { renderVoice } from "../src/core/voice";
import { ttsProvider } from "../src/core/tts";

const TPL = "demo-template";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const voiceOn = !process.argv.includes("--no-voice") && !!ttsProvider();
const ledger = new Ledger();

await db.from("rooms").delete().eq("id", TPL);
await db.from("rooms").insert({ id: TPL, name: "wrong chat", is_demo: true }).throwOnError();
const ids = new Map<string, string>();
for (const m of SEED_MEMBERS) {
  const path = `${TPL}/${m.id}.webp`;
  await db.storage.from("personas").upload(path, readFileSync(`public/seed/${m.id}.webp`), { contentType: "image/webp", upsert: true });
  const url = db.storage.from("personas").getPublicUrl(path).data.publicUrl;
  const awayPath = `${TPL}/${m.id}-away.webp`;
  await db.storage.from("personas").upload(awayPath, readFileSync(`public/seed/${m.id}-away.webp`), { contentType: "image/webp", upsert: true });
  const awayUrl = db.storage.from("personas").getPublicUrl(awayPath).data.publicUrl;
  const { data } = await db.from("members").insert({ room_id: TPL, name: m.name, persona_url: url, persona_away_url: awayUrl, preset: m.preset, is_seed: true, persona_spec: { hair: m.hair, outfit: m.outfit, vibe: m.vibe } }).select("id").single().throwOnError();
  ids.set(m.id, data!.id);
}
const msgIds = new Map<string, string>();
for (const msg of SEED_MESSAGES) {
  const { data } = await db.from("messages").insert({ room_id: TPL, member_id: ids.get(msg.sender_id)!, text: msg.text }).select("id").single().throwOnError();
  msgIds.set(msg.id, data!.id);
}
console.log("room + members + messages ok; directing with Spark…");
const run = await directSegment(SEED_MESSAGES, { ledger });
console.log("director", run.source, run.log.map((l) => (l.ok ? "✓" : "✗")).join(""));
for (const msg of SEED_MESSAGES) {
  const d = run.directions.find((x) => x.message_id === msg.id)!;
  const member = SEED_MEMBERS.find((m) => m.id === msg.sender_id)!;
  const r = await renderVoice(msg.text, voiceOn ? { presetKey: member.preset } : null, { ledger });
  let audio_url: string | null = null;
  if (r.wav) {
    const path = `${TPL}/${msg.id}.wav`;
    await db.storage.from("renders").upload(path, r.wav, { contentType: "audio/wav", upsert: true });
    audio_url = db.storage.from("renders").getPublicUrl(path).data.publicUrl;
  }
  await db
    .from("renders")
    .insert({
      message_id: msgIds.get(msg.id)!,
      room_id: TPL,
      status: r.status,
      audio_url,
      duration_ms: r.durationMs || null,
      envelope: r.envelope,
      similarity: r.similarity,
      heard: r.heard,
      attempts: r.attempts,
      flags: r.flags,
      emotion: d.emotion,
      gesture: d.gesture,
      camera: d.camera,
      pause_ms: d.pause_ms,
      direction_source: run.source,
    })
    .throwOnError();
  console.log(msg.id, r.status, r.attempts.map((a) => a.similarity.toFixed(2)).join("→"));
}
// Keep the seeding cost on the room's receipt.
await db.from("ledger").insert(
  ledger.entries.map((e) => ({ room_id: TPL, model: e.model, op: e.op, ms: e.ms, usd: e.usd, ok: e.ok, input_tokens: e.inputTokens ?? null, output_tokens: e.outputTokens ?? null, reasoning_tokens: e.reasoningTokens ?? null, audio_ms: e.audioMs ?? null, note: e.note ?? null, at: e.at })),
);
console.log(JSON.stringify(ledger.summary()));
