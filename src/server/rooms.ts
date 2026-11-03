import "server-only";
import { db, newRoomId, HttpError } from "./db";

export const DEMO_TEMPLATE = "demo-template";
export const ROOM_DAILY_MESSAGES = 200;

export async function getRoomState(roomId: string) {
  const [{ data: room }, { data: members }, { data: messages }, { data: renders }] = await Promise.all([
    db().from("rooms").select("*").eq("id", roomId).maybeSingle(),
    db().from("members").select("id, room_id, name, persona_url, enrolled_voice, preset, is_seed, created_at").eq("room_id", roomId).order("created_at"),
    db().from("messages").select("id, room_id, member_id, seq, text, created_at").eq("room_id", roomId).order("seq", { ascending: false }).limit(200),
    db().from("renders").select("*").eq("room_id", roomId),
  ]);
  if (!room) throw new HttpError(404, "room not found");
  return { room, members: members ?? [], messages: (messages ?? []).reverse(), renders: renders ?? [] };
}

/** Each visitor to /r/demo gets a private copy of the seeded room (members, messages, renders reuse the same media URLs). */
export async function forkDemoRoom(): Promise<string> {
  const tpl = await getRoomState(DEMO_TEMPLATE).catch(() => null);
  if (!tpl) throw new HttpError(503, "demo room is not seeded yet");
  const id = `demo-${newRoomId()}`;
  await db().from("rooms").insert({ id, name: tpl.room.name, is_demo: true }).throwOnError();
  // Batch inserts (3 round trips instead of ~30): rows come back in insertion order.
  const { data: newMembers, error: em } = await db()
    .from("members")
    .insert(tpl.members.map((m: any) => ({ room_id: id, name: m.name, persona_url: m.persona_url, enrolled_voice: false, preset: m.preset, is_seed: true })))
    .select("id");
  if (em) throw em;
  const idMap = new Map<string, string>(tpl.members.map((m: any, i: number) => [m.id, newMembers![i].id]));
  const { data: newMsgs, error: eg } = await db()
    .from("messages")
    .insert(tpl.messages.map((msg: any) => ({ room_id: id, member_id: idMap.get(msg.member_id)!, text: msg.text })))
    .select("id");
  if (eg) throw eg;
  const msgMap = new Map<string, string>(tpl.messages.map((msg: any, i: number) => [msg.id, newMsgs![i].id]));
  const rows = tpl.renders
    .filter((r: any) => msgMap.has(r.message_id))
    .map((r: any) => ({ ...r, message_id: msgMap.get(r.message_id)!, room_id: id, updated_at: new Date().toISOString() }));
  if (rows.length) await db().from("renders").insert(rows).throwOnError();
  return id;
}

export async function assertRoomQuota(roomId: string) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db().from("messages").select("id", { count: "exact", head: true }).eq("room_id", roomId).gte("created_at", since);
  if ((count ?? 0) >= ROOM_DAILY_MESSAGES) throw new HttpError(429, `this room reached today's limit (${ROOM_DAILY_MESSAGES} messages)`);
}
