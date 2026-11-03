import { Ledger } from "@/core/ledger";
import { planSaid, readMask, renderLook } from "@/core/lookbook";
import { authMember, saveLedger, jsonError, HttpError } from "@/server/db";
import { assertDailySpend, assertRoomOp } from "@/server/quota";
import { loadLook, saveLook } from "@/server/figures";
export const runtime = "nodejs";
export const maxDuration = 90;

// Say what to change ("빨간 비니 씌워줘"): Spark turns it into one edit, validateSaid checks it,
// Muse Image makes it on your figure, and your face is locked back on.
export async function POST(req: Request) {
  const ledger = new Ledger();
  let roomId: string | null = null;
  try {
    const body = await req.json();
    const { member } = await authMember(body.memberId, body.secret);
    roomId = member.room_id;
    const words = String(body.text ?? "").trim();
    if (!words) throw new HttpError(400, "say what to change");
    await assertDailySpend();
    await assertRoomOp(member.room_id, "look.edit", 90);
    const plan = await planSaid(words, { ledger });
    if (!plan) throw new HttpError(422, "Couldn't turn that into a change of hair, top or an extra. Try “a red beanie” or “curly green hair”.");
    const [current, original, faceMask] = await Promise.all(["current.png", "original.png", "face.png"].map((n) => loadLook(member.room_id, member.id, n)));
    const r = await renderLook(current, original, (await readMask(faceMask)).alpha, plan.change, plan.overFace ?? undefined, { ledger });
    await saveLook(member.room_id, member.id, "opt-say.png", r.png);
    const tile = await saveLook(member.room_id, member.id, "opt-say.webp", r.tile, "image/webp");
    return Response.json({ id: "say", label: plan.change, part: plan.part, tile, usd: ledger.summary().usd });
  } catch (e) {
    return jsonError(e);
  } finally {
    await saveLedger(ledger, roomId);
  }
}
