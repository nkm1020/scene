import { Ledger } from "@/core/ledger";
import { SET_THEMES, drawSet, planSet } from "@/core/sets";
import { authMember, db, publicUrl, saveLedger, jsonError, HttpError } from "@/server/db";
import { assertDailySpend, assertRoomOp } from "@/server/quota";
export const runtime = "nodejs";
export const maxDuration = 120;

// Dress the room: rename it, pick a ready-made set, or say one. A said set is planned by Spark (validateSetSpec checks
// it before anything is drawn) and painted by Muse Image, six surfaces in parallel. Everyone at the table sees it change.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ledger = new Ledger();
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const { member } = await authMember(body.memberId, body.secret);
    if (member.room_id !== id) throw new HttpError(403, "you are not in this room");
    if (typeof body.name === "string" && body.name.trim()) {
      await db().from("rooms").update({ name: body.name.trim().slice(0, 40) }).eq("id", id).throwOnError();
      return Response.json({ ok: true });
    }
    if (typeof body.theme === "string") {
      if (!SET_THEMES[body.theme]) throw new HttpError(400, "unknown theme");
      await db().from("rooms").update({ set: { theme: body.theme } }).eq("id", id).throwOnError();
      return Response.json({ set: { theme: body.theme } });
    }
    const said = String(body.said ?? "").trim().slice(0, 200);
    if (!said) throw new HttpError(400, "say what the room looks like");
    await assertDailySpend();
    await assertRoomOp(id, "set.plan", 8);
    const t0 = Date.now();
    const plan = await planSet(said, { ledger });
    if (!plan.spec) throw new HttpError(422, `Spark's plan did not pass the checks: ${plan.log.at(-1)?.errors.join("; ")}`);
    const parts = await drawSet(plan.spec, { ledger });
    const stamp = Date.now().toString(36);
    const urls: Record<string, string> = {};
    await Promise.all(
      Object.entries(parts).map(async ([part, buf]) => {
        const path = `sets/${id}/${stamp}/${part}.webp`;
        const { error } = await db().storage.from("figures").upload(path, buf, { contentType: "image/webp", upsert: true });
        if (error) throw error;
        urls[part] = publicUrl("figures", path);
      }),
    );
    const set = { said, spec: plan.spec, urls };
    await db().from("rooms").update({ set }).eq("id", id).throwOnError();
    return Response.json({ set, plan: plan.log, ms: Date.now() - t0, usd: ledger.summary().usd });
  } catch (e) {
    return jsonError(e);
  } finally {
    await saveLedger(ledger, id);
  }
}
