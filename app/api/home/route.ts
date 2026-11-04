import { db, jsonError } from "@/server/db";
import { authProfile, ensureDemoRoom, listFriends, myRooms } from "@/server/profiles";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Everything the home screen shows, in one call: you, your chats (with unread counts) and your friends.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { profile } = await authProfile(body.profileId, body.secret);
    await ensureDemoRoom(profile.id);
    const seen = body.seen && typeof body.seen === "object" ? body.seen : {};
    const [rooms, friends, { data: home }] = await Promise.all([
      myRooms(profile.id, seen),
      listFriends(profile.id),
      db().from("rooms").select("set").eq("id", profile.room_id).single(),
    ]);
    const { id, name, persona_url, figure, figure_status, enrolled_voice, preset, friend_code, room_id } = profile;
    return Response.json({ profile: { id, name, persona_url, figure, figure_status, enrolled_voice, preset, friend_code, home_room: room_id, set: home?.set ?? null }, rooms, ...friends });
  } catch (e) {
    return jsonError(e);
  }
}
