import { Ledger } from "@/core/ledger";
import { after } from "next/server";
import { createPersona, createAwayPose } from "@/core/persona";
import { authMember, db, publicUrl, saveLedger, jsonError, HttpError } from "@/server/db";
export const runtime = "nodejs";
export const maxDuration = 90;

const clean = (v: unknown) => String(v ?? "").replace(/[^\p{L}\p{N} ,'-]/gu, "").trim().slice(0, 40);

export async function POST(req: Request) {
  const ledger = new Ledger();
  let roomId: string | null = null;
  try {
    const body = await req.json();
    const { member } = await authMember(body.memberId, body.secret);
    roomId = member.room_id;
    const spec = { name: member.name, hair: clean(body.hair), outfit: clean(body.outfit), vibe: clean(body.vibe) };
    if (!spec.hair || !spec.outfit || !spec.vibe) throw new HttpError(400, "pick hair, outfit and vibe");
    const t0 = Date.now();
    const p = await createPersona(spec, { ledger });
    const path = `${member.room_id}/${member.id}-${Date.now()}.webp`;
    const { error } = await db().storage.from("personas").upload(path, p.png, { contentType: "image/webp", upsert: true });
    if (error) throw error;
    const url = publicUrl("personas", path);
    await db().from("members").update({ persona_url: url, persona_away_url: null, persona_spec: spec }).eq("id", member.id).throwOnError();
    // Presence posture (head bowed) is made after the response: Muse Image edit of the same source + SAM 3.1.
    after(async () => {
      const awayLedger = new Ledger();
      try {
        const away = await createAwayPose(p.sourceImage, { ledger: awayLedger });
        const awayPath = path.replace(/\.webp$/, "-away.webp");
        await db().storage.from("personas").upload(awayPath, away.png, { contentType: "image/webp", upsert: true });
        const { data: cur } = await db().from("members").select("persona_url").eq("id", member.id).single();
        if (cur?.persona_url === url) await db().from("members").update({ persona_away_url: publicUrl("personas", awayPath) }).eq("id", member.id);
      } catch (err) {
        console.error("away pose failed", err);
      } finally {
        await saveLedger(awayLedger, member.room_id);
      }
    });
    const s = ledger.summary();
    return Response.json({ personaUrl: url, ms: Date.now() - t0, usd: s.usd, calls: s.calls, phrase: p.phrase, coverage: p.maskCoverage, flags: p.flags });
  } catch (e) {
    return jsonError(e);
  } finally {
    await saveLedger(ledger, roomId);
  }
}
