import { after } from "next/server";
import { authMember, db, jsonError, HttpError } from "@/server/db";
import { assertRoomQuota } from "@/server/rooms";
import { renderMessage } from "@/server/render";
export const runtime = "nodejs";
export const maxDuration = 120;

// Messages are stored as text. The voice is rendered once, after the response, and shared by the room.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { member } = await authMember(body.memberId, body.secret);
    const text = String(body.text ?? "").trim();
    if (!text) throw new HttpError(400, "empty message");
    if ([...text].length > 280) throw new HttpError(400, "message too long (max 280)");
    await assertRoomQuota(member.room_id);
    const { data: msg, error } = await db().from("messages").insert({ room_id: member.room_id, member_id: member.id, text }).select("*").single();
    if (error) throw error;
    after(() => renderMessage(msg));
    return Response.json({ message: msg });
  } catch (e) {
    return jsonError(e);
  }
}
