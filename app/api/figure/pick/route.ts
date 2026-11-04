import { Ledger } from "@/core/ledger";
import { maskFigure } from "@/core/figure";
import { LOOKBOOK } from "@/core/lookbook";
import { authMember, db, saveLedger, jsonError, HttpError } from "@/server/db";
import { loadLook, saveLook, storePose, updateFigure } from "@/server/figures";
export const runtime = "nodejs";
export const maxDuration = 60;

// Wear an option: it becomes your current look and your neutral figure (SAM 3.1 cuts it out).
export async function POST(req: Request) {
  const ledger = new Ledger();
  let roomId: string | null = null;
  try {
    const body = await req.json();
    const { member } = await authMember(body.memberId, body.secret);
    roomId = member.room_id;
    const id = String(body.id ?? "");
    if (id !== "say" && !LOOKBOOK.some((o) => o.id === id)) throw new HttpError(400, "unknown option");
    const png = await loadLook(member.room_id, member.id, `opt-${id}.png`);
    await saveLook(member.room_id, member.id, "current.png", png);
    const m = await maskFigure(png, { ledger, op: "look.mask" });
    // the old expressions belong to the old look: start the figure over from this neutral
    await updateFigure(member.id, { figure: null, figure_status: "dressing" });
    const neutral = await storePose(member.id, member.room_id, Date.now(), { pose: "neutral", image: png, cutout: m.cutout, mask: m.mask, glb: null, coverage: m.coverage });
    return Response.json({ neutral });
  } catch (e) {
    return jsonError(e);
  } finally {
    await saveLedger(ledger, roomId);
  }
}
