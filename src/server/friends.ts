import "server-only";
import { Ledger } from "@/core/ledger";
import { CAST_ASLEEP } from "@/core/cast";
import { DEMO_FRIENDS, proposeReplies } from "@/core/friends";
import { db, HttpError, saveLedger } from "./db";
import { DEMO_TEMPLATE } from "./rooms";
import { renderMessage } from "./render";
import { assertDailySpend } from "./quota";

/** Seat a demo friend in a room: the seeded figure and preset voice from the demo template. */
export async function addDemoFriend(roomId: string, friendId: string) {
  const friend = DEMO_FRIENDS.find((f) => f.id === friendId);
  if (!friend) throw new HttpError(400, "unknown friend");
  const { data: members } = await db().from("members").select("id, name").eq("room_id", roomId);
  if ((members ?? []).some((m) => m.name === friend.name)) throw new HttpError(409, `${friend.name} is already here`);
  if ((members ?? []).length >= 6) throw new HttpError(409, "this room is full (max 6)");
  const { data: tpl } = await db().from("members").select("persona_url, persona_away_url, figure, figure_status, preset").eq("room_id", DEMO_TEMPLATE).eq("name", friend.name).maybeSingle();
  if (!tpl) throw new HttpError(503, "demo friends are not seeded yet");
  const { data: member, error } = await db()
    .from("members")
    .insert({ room_id: roomId, name: friend.name, persona_url: tpl.persona_url, persona_away_url: tpl.persona_away_url, figure: tpl.figure, figure_status: tpl.figure_status, preset: tpl.preset, is_seed: true })
    .select("*")
    .single();
  if (error) throw error;
  return member;
}

/** After a person posts, the demo friends at the table may answer (Spark proposes, validateReplies decides). */
export async function replyAsFriends(msg: { room_id: string; member_id: string }) {
  const { data: members } = await db().from("members").select("id, name, is_seed").eq("room_id", msg.room_id);
  const bots = (members ?? []).filter((m) => m.is_seed && !CAST_ASLEEP.has(m.name));
  const present = DEMO_FRIENDS.filter((f) => bots.some((b) => b.name === f.name));
  if (!present.length || bots.some((b) => b.id === msg.member_id)) return; // friends never answer friends
  try {
    await assertDailySpend();
  } catch {
    return;
  }
  const { data: recent } = await db().from("messages").select("member_id, text").eq("room_id", msg.room_id).order("seq", { ascending: false }).limit(12);
  const names = new Map((members ?? []).map((m) => [m.id, m.name]));
  const history = (recent ?? []).reverse().map((m) => ({ name: names.get(m.member_id) ?? "someone", text: m.text }));
  const ledger = new Ledger();
  try {
    const replies = await proposeReplies(history, present, { ledger });
    for (const r of replies) {
      await new Promise((res) => setTimeout(res, 1200));
      const bot = bots.find((b) => b.name === present.find((f) => f.id === r.friend)!.name)!;
      const { data: row, error } = await db().from("messages").insert({ room_id: msg.room_id, member_id: bot.id, text: r.text }).select("*").single();
      if (error) throw error;
      await renderMessage(row);
    }
  } catch (err) {
    console.error("friend reply failed", err);
  } finally {
    await saveLedger(ledger, msg.room_id);
  }
}
