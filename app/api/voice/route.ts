import { Ledger } from "@/core/ledger";
import { verifyEnrollment } from "@/core/voice";
import { ENROLL_SENTENCES } from "@/core/seed";
import { authMember, db, saveLedger, jsonError, HttpError } from "@/server/db";
import { assertDailySpend, assertRoomOp } from "@/server/quota";
export const runtime = "nodejs";
export const maxDuration = 60;

// Voice enrollment: stored only if Voice Transcribe confirms the person read the sentences shown (≥0.8).
export async function POST(req: Request) {
  const ledger = new Ledger();
  let roomId: string | null = null;
  try {
    const form = await req.formData();
    const { member } = await authMember(String(form.get("memberId")), String(form.get("secret")));
    roomId = member.room_id;
    await assertDailySpend();
    await assertRoomOp(member.room_id, "enroll.readback", 30);
    const lang = form.get("lang") === "ko" ? "ko" : "en";
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) throw new HttpError(400, "audio is required");
    if (audio.size > 4_000_000) throw new HttpError(413, "recording too large");
    const sentences = ENROLL_SENTENCES[lang];
    const check = await verifyEnrollment(Buffer.from(await audio.arrayBuffer()), sentences, { ledger });
    if (check.ok) {
      const path = `${member.id}.wav`;
      const { error } = await db().storage.from("voices").upload(path, check.wav, { contentType: "audio/wav", upsert: true });
      if (error) throw error;
      await db().from("member_secrets").update({ voice_path: path, voice_text: sentences.join(" ") }).eq("member_id", member.id).throwOnError();
      await db().from("members").update({ enrolled_voice: true }).eq("id", member.id).throwOnError();
    }
    return Response.json({ ok: check.ok, similarity: check.similarity, heard: check.heard, durationMs: check.durationMs, silence: check.silence, reasons: check.reasons, usd: ledger.summary().usd });
  } catch (e) {
    return jsonError(e);
  } finally {
    await saveLedger(ledger, roomId);
  }
}
