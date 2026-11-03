// Re-render lines whose voice failed the read-back check (status captions_only, flag voice_unverified).
// Earlier rejected attempts are kept in the attempts history (they are the evidence the check works).
//   npx tsx scripts/rerender.ts <roomId>
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { Ledger } from "../src/core/ledger";
import { renderVoice } from "../src/core/voice";

const roomId = process.argv[2];
if (!roomId) throw new Error("usage: rerender.ts <roomId>");
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ledger = new Ledger();
const { data: rows } = await db.from("renders").select("*, messages(text, member_id, members(preset))").eq("room_id", roomId).eq("status", "captions_only").throwOnError();
for (const r of rows ?? []) {
  if (!(r.flags ?? []).includes("voice_unverified") && !(r.flags ?? []).includes("render_error")) continue;
  const msg: any = r.messages;
  const out = await renderVoice(msg.text, { presetKey: msg.members?.preset ?? "female_a" }, { ledger });
  const prior = (r.attempts ?? []) as any[];
  const attempts = [...prior, ...out.attempts.map((a) => ({ ...a, attempt: prior.length + a.attempt }))];
  let audio_url: string | null = null;
  if (out.wav) {
    const path = `${roomId}/${r.message_id}.wav`;
    await db.storage.from("renders").upload(path, out.wav, { contentType: "audio/wav", upsert: true });
    audio_url = db.storage.from("renders").getPublicUrl(path).data.publicUrl;
  }
  await db
    .from("renders")
    .update({ status: out.status, audio_url, duration_ms: out.durationMs || null, envelope: out.envelope, similarity: out.similarity, heard: out.heard, attempts, flags: out.status === "verified" ? ["resynthesized"] : out.flags, updated_at: new Date().toISOString() })
    .eq("message_id", r.message_id)
    .throwOnError();
  console.log(`"${msg.text}" → ${out.status} [${attempts.map((a: any) => Number(a.similarity).toFixed(2)).join("→")}]`);
}
await db.from("ledger").insert(ledger.entries.map((e) => ({ room_id: roomId, model: e.model, op: e.op, ms: e.ms, usd: e.usd, ok: e.ok, input_tokens: e.inputTokens ?? null, output_tokens: e.outputTokens ?? null, reasoning_tokens: e.reasoningTokens ?? null, audio_ms: e.audioMs ?? null, note: e.note ?? null, at: e.at })));
console.log(JSON.stringify(ledger.summary()));
