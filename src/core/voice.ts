// Two fixed checkpoints around voice:
//  verifyEnrollment: a voice reference is stored only if the person actually read the three sentences shown (≥0.8).
//  renderVoice: every synthesized line is transcribed back and compared with the message (≥0.85) before it may play.
//               Up to 3 synthesis attempts; then the line plays as captions only, flagged voice_unverified.

import { transcribe } from "./meta";
import { synthesize, voiceForPreset, type Voice } from "./tts";
import { similarity, isSilent, guessLanguage } from "./text";
import { toVtWav, silenceRatio, durationMs, decodeWav, rmsEnvelope } from "./wav";
import type { Ledger } from "./ledger";

export const ENROLL_MIN_SIM = 0.8;
export const ROUNDTRIP_MIN_SIM = 0.85;
export const MAX_SYNTH_ATTEMPTS = 3;

export interface EnrollmentCheck {
  ok: boolean;
  similarity: number;
  heard: string;
  durationMs: number;
  silence: number;
  reasons: string[];
  wav: Buffer; // normalized 24 kHz mono s16, store only if ok
}

export async function verifyEnrollment(audio: Buffer, sentences: string[], opts: { ledger?: Ledger } = {}): Promise<EnrollmentCheck> {
  const { wav, durationMs: dur, pcm } = toVtWav(audio);
  const silence = silenceRatio(pcm);
  const reasons: string[] = [];
  if (dur < 6000) reasons.push(`too short (${(dur / 1000).toFixed(1)} s, need 6–20 s)`);
  if (dur > 20000) reasons.push(`too long (${(dur / 1000).toFixed(1)} s, need 6–20 s)`);
  if (silence >= 0.4) reasons.push(`too much silence (${Math.round(silence * 100)}%)`);
  let heard = "";
  let sim = 0;
  if (dur >= 1000) {
    const t = await transcribe(wav, { op: "enroll.readback", ledger: opts.ledger });
    heard = t.transcript;
    sim = similarity(sentences.join(" "), heard);
    if (sim < ENROLL_MIN_SIM) reasons.push(`read-back mismatch (${sim.toFixed(2)} < ${ENROLL_MIN_SIM})`);
  }
  return { ok: reasons.length === 0, similarity: sim, heard, durationMs: dur, silence, reasons, wav };
}

export interface RenderAttempt {
  attempt: number;
  heard: string;
  similarity: number;
  ok: boolean;
  ttsMs: number;
  vtMs: number;
  error?: string;
}

export interface VoiceRender {
  status: "verified" | "captions_only" | "silent";
  wav: Buffer | null;
  durationMs: number;
  envelope: number[];
  attempts: RenderAttempt[];
  similarity: number;
  heard: string;
  flags: string[];
}

/** Synthesize `text` in `voice`, read it back, and only return audio that matches. */
export type VoiceSpec = Voice | { presetKey: string };

export async function renderVoice(
  text: string,
  spec: VoiceSpec | null,
  opts: { ledger?: Ledger; forceFirstFail?: boolean; mood?: string } = {},
): Promise<VoiceRender> {
  if (isSilent(text)) return { status: "silent", wav: null, durationMs: 0, envelope: [], attempts: [], similarity: 1, heard: "", flags: ["emoji_only"] };
  if (!spec) return { status: "captions_only", wav: null, durationMs: 0, envelope: [], attempts: [], similarity: 0, heard: "", flags: ["voice_disabled"] };
  const language = guessLanguage(text);
  const voice: Voice = "presetKey" in spec ? voiceForPreset(spec.presetKey, language) : spec;
  const attempts: RenderAttempt[] = [];
  for (let attempt = 1; attempt <= MAX_SYNTH_ATTEMPTS; attempt++) {
    const seed = 1000 + attempt * 7919;
    const speed = attempt === 1 ? undefined : 0.95;
    let ttsMs = 0, vtMs = 0;
    try {
      const tts = await synthesize(text, voice, { language, seed, speed, mood: opts.mood, ledger: opts.ledger, op: "message.tts" });
      ttsMs = tts.ms;
      const norm = toVtWav(tts.wav);
      const t = await transcribe(norm.wav, { op: "message.readback", ledger: opts.ledger });
      vtMs = t.ms;
      let sim = similarity(text, t.transcript);
      if (opts.forceFirstFail && attempt === 1) sim = Math.min(sim, 0.5); // demo/test hook only
      const ok = sim >= ROUNDTRIP_MIN_SIM;
      attempts.push({ attempt, heard: t.transcript, similarity: sim, ok, ttsMs, vtMs });
      if (ok) {
        const pcm = decodeWav(tts.wav);
        return { status: "verified", wav: tts.wav, durationMs: durationMs(pcm), envelope: rmsEnvelope(pcm, 30), attempts, similarity: sim, heard: t.transcript, flags: attempt > 1 ? ["resynthesized"] : [] };
      }
    } catch (err) {
      attempts.push({ attempt, heard: "", similarity: 0, ok: false, ttsMs, vtMs, error: (err as Error).message.slice(0, 200) });
    }
  }
  const best = attempts.reduce((a, b) => (b.similarity > a.similarity ? b : a), attempts[0]);
  return { status: "captions_only", wav: null, durationMs: 0, envelope: [], attempts, similarity: best?.similarity ?? 0, heard: best?.heard ?? "", flags: ["voice_unverified"] };
}


