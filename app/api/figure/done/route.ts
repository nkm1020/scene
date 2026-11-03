import { after } from "next/server";
import { Ledger } from "@/core/ledger";
import { authMember, saveLedger, jsonError } from "@/server/db";
import { assertDailySpend } from "@/server/quota";
import { loadLook, makeExpressions } from "@/server/figures";
export const runtime = "nodejs";
export const maxDuration = 300;

// Finished dressing: make the expressions and stop-motion frames from this look, in the background.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { member } = await authMember(body.memberId, body.secret);
    await assertDailySpend();
    const current = await loadLook(member.room_id, member.id, "current.png");
    after(async () => {
      const ledger = new Ledger();
      await makeExpressions(member.id, member.room_id, current, Date.now(), ledger);
      await saveLedger(ledger, member.room_id);
    });
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
