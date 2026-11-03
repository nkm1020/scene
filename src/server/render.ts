import "server-only";
import { Ledger } from "@/core/ledger";
import { ruleDirection } from "@/core/director";
import { renderVoice } from "@/core/voice";
import { presetFor, ttsEndpoint, type Voice } from "@/core/tts";
import { db, publicUrl, saveLedger } from "./db";

/** Voice for a member: enrolled reference (private bucket) or preset. Null when TTS is off. */
export async function memberVoice(memberId: string): Promise<Voice | null> {
  if (!ttsEndpoint()) return null;
  const { data: m } = await db().from("members").select("preset, enrolled_voice").eq("id", memberId).single();
  if (m?.enrolled_voice) {
    const { data: s } = await db().from("member_secrets").select("voice_path, voice_text").eq("member_id", memberId).single();
    if (s?.voice_path && s.voice_text) {
      const { data: blob } = await db().storage.from("voices").download(s.voice_path);
      if (blob) return { ref_audio_b64: Buffer.from(await blob.arrayBuffer()).toString("base64"), ref_text: s.voice_text };
    }
  }
  return { preset: presetFor(m?.preset) };
}

/**
 * Render one message once for the whole room: rule-table direction (live), voice + read-back check,
 * upload audio, upsert the render row (Realtime notifies every member).
 */
export async function renderMessage(msg: { id: string; room_id: string; member_id: string; text: string }) {
  const ledger = new Ledger();
  const d = ruleDirection({ id: msg.id, sender_id: msg.member_id, text: msg.text });
  await db().from("renders").upsert({ message_id: msg.id, room_id: msg.room_id, status: "pending", emotion: d.emotion, gesture: d.gesture, camera: d.camera, pause_ms: d.pause_ms, direction_source: "rules" });
  try {
    const voice = await memberVoice(msg.member_id);
    const r = await renderVoice(msg.text, voice, { ledger });
    let audio_url: string | null = null;
    if (r.wav) {
      const path = `${msg.room_id}/${msg.id}.wav`;
      const { error } = await db().storage.from("renders").upload(path, r.wav, { contentType: "audio/wav", upsert: true });
      if (error) throw error;
      audio_url = publicUrl("renders", path);
    }
    await db()
      .from("renders")
      .update({
        status: r.status,
        audio_url,
        duration_ms: r.durationMs || null,
        envelope: r.envelope,
        similarity: r.similarity,
        heard: r.heard,
        attempts: r.attempts,
        flags: r.flags,
        updated_at: new Date().toISOString(),
      })
      .eq("message_id", msg.id);
  } catch (err) {
    console.error("render failed", err);
    await db().from("renders").update({ status: "captions_only", flags: ["render_error"], updated_at: new Date().toISOString() }).eq("message_id", msg.id);
  } finally {
    await saveLedger(ledger, msg.room_id);
  }
}
