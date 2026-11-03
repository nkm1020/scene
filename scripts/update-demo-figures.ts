// Attach the seed figures (images, and meshes when present) to the demo template members, and re-direct the
// template's messages with the roster so every line carries Spark's listener reactions. Voices are left as they are.
//   npx tsx scripts/update-demo-figures.ts [--no-direct]
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { FIGURE_POSES } from "../src/core/figure";
import { directSegment } from "../src/core/director";
import { Ledger } from "../src/core/ledger";

const TPL = "demo-template";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const pub = (p: string) => db.storage.from("figures").getPublicUrl(p).data.publicUrl;
const ledger = new Ledger();

const { data: members } = await db.from("members").select("id, name").eq("room_id", TPL).throwOnError();
const stamp = Date.now().toString(36); // new paths each run: public URLs are cached
for (const m of members ?? []) {
  const id = m.name.toLowerCase();
  const figure: Record<string, { img: string; glb: string | null }> = {};
  for (const pose of FIGURE_POSES) {
    const dir = `public/seed/figures/${id}`;
    if (!existsSync(`${dir}/${pose}.webp`)) continue;
    const base = `${TPL}/${id}/${stamp}/${pose}`;
    await db.storage.from("figures").upload(`${base}.webp`, readFileSync(`${dir}/${pose}.webp`), { contentType: "image/webp", upsert: true });
    let glb: string | null = null;
    if (existsSync(`${dir}/${pose}.glb`)) {
      await db.storage.from("figures").upload(`${base}.glb`, readFileSync(`${dir}/${pose}.glb`), { contentType: "model/gltf-binary", upsert: true });
      glb = pub(`${base}.glb`);
    }
    figure[pose] = { img: pub(`${base}.webp`), glb };
  }
  await db.from("members").update({ figure, figure_status: "ready", persona_url: figure.neutral?.img ?? null, persona_away_url: figure.away?.img ?? null }).eq("id", m.id).throwOnError();
  console.log(m.name, Object.keys(figure).length, "poses,", Object.values(figure).filter((f) => f.glb).length, "meshes");
}

if (!process.argv.includes("--no-direct")) {
  const { data: msgs } = await db.from("messages").select("id, member_id, text, seq").eq("room_id", TPL).order("seq").throwOnError();
  const roster = (members ?? []).map((m) => ({ member_id: m.id, name: m.name, present: m.name !== "Jay" }));
  const run = await directSegment((msgs ?? []).map((x) => ({ id: x.id, sender_id: x.member_id, text: x.text })), { ledger, roster, reasoningEffort: "low" });
  console.log("director", run.source, run.log.map((l) => `${l.ok ? "✓" : "✗"} ${l.ms}ms`).join(" "));
  for (const d of run.directions) {
    await db.from("renders").update({ emotion: d.emotion, gesture: d.gesture, camera: d.camera, pause_ms: d.pause_ms, reactions: d.reactions ?? null, direction_source: run.source }).eq("message_id", d.message_id).throwOnError();
  }
  await db.from("ledger").insert(ledger.entries.map((e) => ({ room_id: TPL, model: e.model, op: e.op, ms: e.ms, usd: e.usd, ok: e.ok, input_tokens: e.inputTokens ?? null, output_tokens: e.outputTokens ?? null, reasoning_tokens: e.reasoningTokens ?? null, at: e.at })));
}
