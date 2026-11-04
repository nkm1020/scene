import { db, hashSecret, newSecret, jsonError, HttpError } from "@/server/db";
import { authProfile, seatProfile } from "@/server/profiles";
export const runtime = "nodejs";

const PRESETS = ["female_a", "female_b", "male", "male_b"];

// Sit down at a room. With a profile, the seat carries your figure and voice and shares your key.
// Without one (the CLI and old links), a bare member with a name and a preset voice.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    if (body.profileId) {
      const { profile } = await authProfile(body.profileId, body.secret);
      const member = await seatProfile(id, profile.id);
      return Response.json({ member, secret: body.secret });
    }
    const name = String(body.name ?? "").trim().slice(0, 24);
    if (!name) throw new HttpError(400, "name is required");
    const preset = PRESETS.includes(body.preset) ? body.preset : "female_a";
    const { data: room } = await db().from("rooms").select("id").eq("id", id).maybeSingle();
    if (!room) throw new HttpError(404, "room not found");
    const { count } = await db().from("members").select("id", { count: "exact", head: true }).eq("room_id", id);
    if ((count ?? 0) >= 6) throw new HttpError(409, "this room is full (max 6)");
    const { data: member, error } = await db().from("members").insert({ room_id: id, name, preset }).select("*").single();
    if (error) throw error;
    const secret = newSecret();
    await db().from("member_secrets").insert({ member_id: member.id, secret_hash: hashSecret(secret) }).throwOnError();
    return Response.json({ member, secret });
  } catch (e) {
    return jsonError(e);
  }
}
