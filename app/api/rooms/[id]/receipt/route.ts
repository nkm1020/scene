import { db, jsonError } from "@/server/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { data, error } = await db().from("ledger").select("model, op, ms, usd, ok, input_tokens, output_tokens, reasoning_tokens, audio_ms").eq("room_id", id).limit(5000);
    if (error) throw error;
    const byModel: Record<string, { calls: number; usd: number; ms: number }> = {};
    const byOp: Record<string, { calls: number; usd: number; ms: number; p50?: number }> = {};
    const opMs: Record<string, number[]> = {};
    let usd = 0;
    for (const e of data ?? []) {
      usd += Number(e.usd);
      (byModel[e.model] ??= { calls: 0, usd: 0, ms: 0 }).calls++;
      byModel[e.model].usd += Number(e.usd);
      byModel[e.model].ms += e.ms;
      (byOp[e.op] ??= { calls: 0, usd: 0, ms: 0 }).calls++;
      byOp[e.op].usd += Number(e.usd);
      byOp[e.op].ms += e.ms;
      (opMs[e.op] ??= []).push(e.ms);
    }
    for (const [op, arr] of Object.entries(opMs)) {
      arr.sort((a, b) => a - b);
      byOp[op].p50 = arr[Math.floor(arr.length / 2)];
    }
    return Response.json({ calls: data?.length ?? 0, usd, byModel, byOp });
  } catch (e) {
    return jsonError(e);
  }
}
