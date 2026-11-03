import { authMember, db, jsonError } from "@/server/db";
export const runtime = "nodejs";

// Delete my persona and/or voice. Takes effect immediately: I become the default persona / preset voice.
export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const { member, secrets } = await authMember(body.memberId, body.secret);
    const what = body.what === "persona" || body.what === "voice" ? body.what : "all";
    if (what !== "voice" && member.persona_url) {
      const path = String(member.persona_url).split("/personas/")[1];
      if (path) await db().storage.from("personas").remove([decodeURIComponent(path)]);
      await db().from("members").update({ persona_url: null, persona_spec: null }).eq("id", member.id);
    }
    if (what !== "persona" && secrets.voice_path) {
      await db().storage.from("voices").remove([secrets.voice_path]);
      await db().from("member_secrets").update({ voice_path: null, voice_text: null }).eq("member_id", member.id);
      await db().from("members").update({ enrolled_voice: false }).eq("id", member.id);
    }
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
