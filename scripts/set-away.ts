// One-off: attach the seed away poses to the demo template members (by name).
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
for (const id of ["sam", "mina", "jay"]) {
  const path = `demo-template/${id}-away.png`;
  await db.storage.from("personas").upload(path, readFileSync(`public/seed/${id}-away.png`), { contentType: "image/png", upsert: true });
  const url = db.storage.from("personas").getPublicUrl(path).data.publicUrl;
  const name = id[0].toUpperCase() + id.slice(1);
  const { error, count } = await db.from("members").update({ persona_away_url: url }, { count: "exact" }).eq("room_id", process.argv[2] ?? "demo-template").eq("name", name);
  console.log(name, error?.message ?? "ok", count);
}
