import "server-only";
import { db, HttpError } from "./db";

/** Daily spend guard for the public demo: keeps the whole app under the Meta Billing spend limit. */
export const DAILY_USD_CAP = Number(process.env.SCENE_DAILY_USD_CAP ?? 15);

const since = (hours: number) => new Date(Date.now() - hours * 3600 * 1000).toISOString();

export async function assertDailySpend() {
  const { data } = await db().from("ledger").select("usd").gte("at", since(24)).limit(20000);
  const usd = (data ?? []).reduce((a, r) => a + Number(r.usd), 0);
  if (usd >= DAILY_USD_CAP) throw new HttpError(429, "Scene reached today's demo budget. Messages still work as captions; try voices and personas again tomorrow.");
}

/** Per-room limit on an operation, counted from the receipt ledger. */
export async function assertRoomOp(roomId: string, op: string, max: number, hours = 24) {
  const { count } = await db().from("ledger").select("id", { count: "exact", head: true }).eq("room_id", roomId).eq("op", op).gte("at", since(hours));
  if ((count ?? 0) >= max) throw new HttpError(429, `this room reached today's limit for ${op.split(".")[0]} (${max})`);
}
