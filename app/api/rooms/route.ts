import { db, newRoomId, jsonError, HttpError } from "@/server/db";
import { forkDemoRoom } from "@/server/rooms";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.demo) return Response.json({ roomId: await forkDemoRoom() });
    const name = String(body.name ?? "").trim().slice(0, 40) || "Our room";
    const id = newRoomId();
    const { error } = await db().from("rooms").insert({ id, name });
    if (error) throw new HttpError(500, error.message);
    return Response.json({ roomId: id });
  } catch (e) {
    return jsonError(e);
  }
}
