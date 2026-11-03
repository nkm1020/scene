import { authMember, jsonError, HttpError } from "@/server/db";
import { addDemoFriend } from "@/server/friends";
import { DEMO_FRIENDS } from "@/core/friends";
export const runtime = "nodejs";

export async function GET() {
  return Response.json({ friends: DEMO_FRIENDS.map(({ id, name, persona }) => ({ id, name, persona })) });
}

// Seat a demo friend (played by Muse Spark) at your table.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { member } = await authMember(body.memberId, body.secret);
    if (member.room_id !== id) throw new HttpError(403, "not a member of this room");
    return Response.json({ member: await addDemoFriend(id, String(body.friend ?? "")) });
  } catch (e) {
    return jsonError(e);
  }
}
