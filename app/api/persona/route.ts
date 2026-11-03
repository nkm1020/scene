import { Ledger } from "@/core/ledger";
import { createPersona } from "@/core/persona";
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
    const path = `${member.room_id}/${member.id}-${Date.now()}.png`;
    const { error } = await db().storage.from("personas").upload(path, p.png, { contentType: "image/png", upsert: true });
    if (error) throw error;
    const url = publicUrl("personas", path);
    await db().from("members").update({ persona_url: url, persona_spec: spec }).eq("id", member.id).throwOnError();
    const s = ledger.summary();
    return Response.json({ personaUrl: url, ms: Date.now() - t0, usd: s.usd, calls: s.calls, phrase: p.phrase, coverage: p.maskCoverage, flags: p.flags });
  } catch (e) {
    return jsonError(e);
  } finally {
    await saveLedger(ledger, roomId);
  }
}
