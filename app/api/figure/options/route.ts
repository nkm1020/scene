import { Ledger } from "@/core/ledger";
import { LOOKBOOK, readMask, renderLook, type LookPart } from "@/core/lookbook";
import { authMember, saveLedger, jsonError, HttpError } from "@/server/db";
import { assertDailySpend, assertRoomOp } from "@/server/quota";
import { loadLook, saveLook } from "@/server/figures";
export const runtime = "nodejs";
export const maxDuration = 120;

// Six options for one part, rendered on your own figure by Muse Image with your face locked back on.
// Streams one JSON line per option as it lands, so the grid fills in as Muse works.
export async function POST(req: Request) {
  const ledger = new Ledger();
  try {
    const body = await req.json();
    const { member } = await authMember(body.memberId, body.secret);
    const part = body.part as LookPart;
    const options = LOOKBOOK.filter((o) => o.part === part);
    if (!options.length) throw new HttpError(400, "unknown part");
    await assertDailySpend();
    await assertRoomOp(member.room_id, "look.edit", 90);
    const [current, original, faceMask] = await Promise.all(["current.png", "original.png", "face.png"].map((n) => loadLook(member.room_id, member.id, n)));
    const face = (await readMask(faceMask)).alpha;
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(ctl) {
        await Promise.all(
          options.map(async (o) => {
            try {
              const r = await renderLook(current, original, face, o.change, o.overFace, { ledger });
              await saveLook(member.room_id, member.id, `opt-${o.id}.png`, r.png);
              const tile = await saveLook(member.room_id, member.id, `opt-${o.id}.webp`, r.tile, "image/webp");
              ctl.enqueue(enc.encode(JSON.stringify({ id: o.id, label: o.label, tile }) + "\n"));
            } catch (e) {
              ctl.enqueue(enc.encode(JSON.stringify({ id: o.id, label: o.label, error: String((e as Error).message).slice(0, 120) }) + "\n"));
            }
          }),
        );
        const s = ledger.summary();
        ctl.enqueue(enc.encode(JSON.stringify({ done: true, usd: s.usd, calls: s.calls }) + "\n"));
        ctl.close();
        await saveLedger(ledger, member.room_id);
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
  } catch (e) {
    await saveLedger(ledger, null);
    return jsonError(e);
  }
}
