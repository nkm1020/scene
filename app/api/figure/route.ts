import { after } from "next/server";
import { Ledger } from "@/core/ledger";
import { createFigureBase, createFigurePoses } from "@/core/figure";
import { authMember, db, saveLedger, jsonError, HttpError } from "@/server/db";
import { assertDailySpend, assertRoomOp } from "@/server/quota";
import { storePose } from "@/server/figures";
export const runtime = "nodejs";
export const maxDuration = 300;

const clean = (v: unknown) => String(v ?? "").replace(/[^\p{L}\p{N} ,'-]/gu, "").trim().slice(0, 40);

// Your figure: Muse Image draws a clay figurine → SAM 3.1 masks it → SAM 3D lifts it to a mesh.
// The neutral figure comes back in this response; the six expressions are made after it.
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
    await db().from("members").update({ figure_status: "posing" }).eq("id", member.id);
    after(async () => {
      const poseLedger = new Ledger();
      try {
        await createFigurePoses(base.image, { ledger: poseLedger, onPose: async (a) => { await storePose(member.id, member.room_id, stamp, a); } });
        await db().from("members").update({ figure_status: "ready" }).eq("id", member.id);
      } catch (e) {
        console.error("poses failed", e);
        await db().from("members").update({ figure_status: "ready" }).eq("id", member.id);
      } finally {
        await saveLedger(poseLedger, member.room_id);
      }
    });
    const s = ledger.summary();
    return Response.json({ neutral, ms: Date.now() - t0, usd: s.usd, threeD: !!base.glb, error3d: base.error ?? null });
  } catch (e) {
    return jsonError(e);
  } finally {
    await saveLedger(ledger, roomId);
  }
}
