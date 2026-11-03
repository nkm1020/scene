// Client for the Qwen3-TTS service (Modal in production, local server in dev).
// The service contract lives in tts/modal_app.py.

import { ttsCost, type Ledger, globalLedger } from "./ledger";

export type Voice = { preset: string } | { ref_audio_b64: string; ref_text: string };

export interface TtsResult {
  wav: Buffer;
  durationMs: number;
  genMs: number;
  ms: number;
}

export function ttsEndpoint(): string | null {
  const url = process.env.TTS_URL || process.env.TTS_LOCAL_URL;
  return url ? url.replace(/\/$/, "") : null;
}

/** Default preset voices (Qwen3-TTS CustomVoice). */
export const PRESETS = {
  female_a: "sohee",
  female_b: "serena",
  male: "ryan",
} as const;

export function presetFor(key: string | null | undefined): string {
  return (PRESETS as Record<string, string>)[key ?? ""] ?? key ?? PRESETS.female_a;
}

export async function synthesize(
  text: string,
  voice: Voice,
  opts: { language?: "ko" | "en" | "auto"; seed?: number; speed?: number; ledger?: Ledger; op?: string } = {},
): Promise<TtsResult> {
  const base = ttsEndpoint();
  if (!base) throw new Error("TTS_URL is not set (voice synthesis disabled)");
  const ledger = opts.ledger ?? globalLedger;
  const t0 = performance.now();
  const res = await fetch(`${base}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TTS_TOKEN ?? ""}` },
    body: JSON.stringify({ text, language: opts.language ?? "auto", voice, ...(opts.seed != null ? { seed: opts.seed } : {}), ...(opts.speed ? { speed: opts.speed } : {}) }),
    signal: AbortSignal.timeout(180_000),
  });
  const ms = Math.round(performance.now() - t0);
  if (!res.ok) {
    ledger.add({ model: "qwen3-tts", op: opts.op ?? "tts.synthesize", ms, usd: 0, ok: false, note: `HTTP ${res.status}` });
    throw new Error(`tts failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  const wav = Buffer.from(await res.arrayBuffer());
  const durationMs = Number(res.headers.get("x-duration-ms") ?? 0);
  const genMs = Number(res.headers.get("x-gen-ms") ?? ms);
  ledger.add({ model: "qwen3-tts", op: opts.op ?? "tts.synthesize", ms, usd: ttsCost(genMs), ok: true, audioMs: durationMs, note: "voice" in voice ? undefined : "preset" in voice ? voice.preset : "clone" });
  return { wav, durationMs, genMs, ms };
}
