import { jsonError, HttpError } from "@/server/db";
import { answerFriend, authProfile, createGroup, requestFriend, seatFriend } from "@/server/profiles";
export const runtime = "nodejs";

// Friends: ask by code, answer a request (yes opens a 1:1 room), start a group, or seat a friend at a room.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { profile } = await authProfile(body.profileId, body.secret);
    switch (body.action) {
      case "request":
        return Response.json(await requestFriend(profile.id, body.code));
      case "answer":
        return Response.json(await answerFriend(profile.id, String(body.requestId), !!body.accept));
      case "group":
        return Response.json({ roomId: await createGroup(profile.id, body.name, body.friends) });
      case "seat":
        return Response.json({ member: await seatFriend(String(body.roomId), profile.id, String(body.friendId)) });
      default:
        throw new HttpError(400, "unknown action");
    }
  } catch (e) {
    return jsonError(e);
  }
}
