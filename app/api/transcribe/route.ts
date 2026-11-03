import { Ledger } from "@/core/ledger";
import { transcribe } from "@/core/meta";
import { toVtWav } from "@/core/wav";
import { authMember, saveLedger, jsonError, HttpError } from "@/server/db";
export const runtime = "nodejs";
export const maxDuration = 30;

// Hold-to-talk: audio → Voice Transcribe → text. The audio is discarded after transcription.
export async function POST(req: Request) {
  const ledger = new Ledger();
  let roomId: string | null = null;
  try {
    const form = await req.formData();
    const { member } = await authMember(String(form.get("memberId")), String(form.get("secret")));
    roomId = member.room_id;
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) throw new HttpError(400, "audio is required");
    if (audio.size > 3_000_000) throw new HttpError(413, "recording too long (max ~60 s)");
    const { wav, durationMs } = toVtWav(Buffer.from(await audio.arrayBuffer()));
    if (durationMs < 300) throw new HttpError(400, "recording too short");
    const t = await transcribe(wav, { op: "message.transcribe", ledger });
    return Response.json({ text: t.transcript.trim(), ms: t.ms, audioMs: t.audioDurationMs });
  } catch (e) {
    return jsonError(e);
  } finally {
    await saveLedger(ledger, roomId);
  }
}
