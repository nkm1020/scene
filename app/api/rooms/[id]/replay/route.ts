import { Ledger } from "@/core/ledger";
import { directSegment, MAX_SEGMENT } from "@/core/director";
import { db, saveLedger, jsonError } from "@/server/db";
import { assertDailySpend, assertRoomOp } from "@/server/quota";
import { renderMessage } from "@/server/render";
export const runtime = "nodejs";
export const maxDuration = 120;

// Missed segment → Muse Spark directs it in one call → validate_directions → stored per message.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ledger = new Ledger();
  const { id } = await params;
  try {
    await assertDailySpend();
    await assertRoomOp(id, "director.spark", 60);
    const body = await req.json().catch(() => ({}));
    const afterSeq = Number(body.afterSeq ?? 0);
    const { data: msgs, error } = await db()
      .from("messages")
      .select("id, member_id, seq, text, members(name)")
      .eq("room_id", id)
      .gt("seq", afterSeq)
      .order("seq", { ascending: false })
      .limit(MAX_SEGMENT);
    if (error) throw error;
    const segment = (msgs ?? []).reverse();
    if (!segment.length) return Response.json({ directions: [], log: [], source: "none" });
    // Make sure every message has a render (voice + read-back) before the show.
    // Messages with no render row get rendered now; renders already in progress are awaited (no double synthesis).
    const ids = segment.map((m) => m.id);
    const { data: existing } = await db().from("renders").select("message_id, status").in("message_id", ids);
    const known = new Set((existing ?? []).map((r) => r.message_id));
    const missing = segment.filter((m) => !known.has(m.id));
    const renderAll = (async () => {
      await Promise.all(missing.map((m) => renderMessage({ id: m.id, room_id: id, member_id: m.member_id, text: m.text })));
      for (let i = 0; i < 60; i++) {
        const { count } = await db().from("renders").select("message_id", { count: "exact", head: true }).in("message_id", ids).eq("status", "pending");
        if (!count) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
    })();
    const run = await directSegment(
      segment.map((m: any) => ({ id: m.id, sender_id: m.member_id, sender_name: m.members?.name, text: m.text })),
      { ledger, reasoningEffort: "minimal" },
    );
    await Promise.all(
      run.directions.map((d) =>
        db().from("renders").update({ emotion: d.emotion, gesture: d.gesture, camera: d.camera, pause_ms: d.pause_ms, direction_source: run.source }).eq("message_id", d.message_id),
      ),
    );
    await renderAll;
    return Response.json({ directions: run.directions, log: run.log, source: run.source, flags: run.flags, usd: ledger.summary().usd });
  } catch (e) {
    return jsonError(e);
  } finally {
    await saveLedger(ledger, id);
  }
}
