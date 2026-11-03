import { Ledger } from "@/core/ledger";
import { createFigureBase } from "@/core/figure";
import { phraseMask, maskPng } from "@/core/lookbook";
import { authMember, db, saveLedger, jsonError, HttpError } from "@/server/db";
import { assertDailySpend, assertRoomOp } from "@/server/quota";
import { storePose, saveLook } from "@/server/figures";
export const runtime = "nodejs";
export const maxDuration = 300;

const clean = (v: unknown) => String(v ?? "").replace(/[^\p{L}\p{N} ,'-]/gu, "").trim().slice(0, 40);

// Your figure: Muse Image draws a clay figurine → SAM 3.1 masks it (and finds its face, which the lookbook keeps)
// → SAM 3D lifts it to a mesh. You dress it next (/api/figure/options, /pick, /say); /api/figure/done makes the
// expressions and stop-motion frames from the finished look.
export async function POST(req: Request) {
  const ledger = new Ledger();
  let roomId: string | null = null;
  try {
    const body = await req.json();
    const { member } = await authMember(body.memberId, body.secret);
    roomId = member.room_id;
    await assertDailySpend();
    await assertRoomOp(member.room_id, "figure.draw", 12);
    const spec = { name: member.name, hair: clean(body.hair), outfit: clean(body.outfit), vibe: clean(body.vibe) };
    if (!spec.hair || !spec.outfit || !spec.vibe) throw new HttpError(400, "pick hair, outfit and vibe");
    const t0 = Date.now();
    const stamp = Date.now();
    await db().from("members").update({ figure: null, figure_status: "drawing", persona_spec: spec }).eq("id", member.id);
    const base = await createFigureBase(spec, { ledger });
    const neutral = await storePose(member.id, member.room_id, stamp, base);
    // the lookbook starts here: this face is the one every later change keeps (SAM 3.1 finds it once)
    const face = await phraseMask(base.image, "face", { ledger });
    await Promise.all([
      saveLook(member.room_id, member.id, "original.png", base.image),
      saveLook(member.room_id, member.id, "current.png", base.image),
      saveLook(member.room_id, member.id, "face.png", await maskPng(face.alpha, face.width, face.height)),
    ]);
    await db().from("members").update({ figure_status: "dressing" }).eq("id", member.id);
    const s = ledger.summary();
    return Response.json({ neutral, ms: Date.now() - t0, usd: s.usd, threeD: !!base.glb, error3d: base.error ?? null });
  } catch (e) {
    return jsonError(e);
  } finally {
    await saveLedger(ledger, roomId);
  }
}
