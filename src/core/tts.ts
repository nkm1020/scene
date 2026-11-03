// Client for the Qwen3-TTS service (Modal in production, local server in dev).
// The service contract lives in tts/modal_app.py.

import { Agent, fetch as undiciFetch } from "undici";
import { ttsCost, type Ledger, globalLedger } from "./ledger";

// Node's fetch gives up after 300 s without response headers; a laptop TTS server can take longer.
let localAgent: Agent | null = null;

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

/** A local (laptop) TTS server is slow and serial: one request at a time, long timeout. */
export function ttsIsLocal(): boolean {
  return /\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(ttsEndpoint() ?? "");
}
export function ttsConcurrency(): number {
  return Number(process.env.TTS_CONCURRENCY ?? (ttsIsLocal() ? 1 : 3));
}
function ttsTimeoutMs(): number {
  return Number(process.env.TTS_TIMEOUT_MS ?? (ttsIsLocal() ? 600_000 : 90_000));
}

/**
 * Preset voices (Qwen3-TTS CustomVoice speakers) per language. Chosen by reading samples back with
 * Voice Transcribe on Nov 3: a Korean-native voice reading English garbles it (and the read-back check rejects it),
 * so each preset maps to a native speaker of the line's language where one exists.
 */
export const PRESETS: Record<string, { ko: string; en: string }> = {
  female_a: { ko: "sohee", en: "vivian" },
  female_b: { ko: "sohee", en: "serena" },
  male: { ko: "sohee", en: "ryan" },
  male_b: { ko: "sohee", en: "aiden" },
};

export function presetFor(key: string | null | undefined, language: "ko" | "en" = "en"): string {
  const p = PRESETS[key ?? ""] ?? PRESETS.female_a;
  return p[language];
}

const EMOJI = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]/gu;
const KEEP_CAPS = new Set(["OK", "AM", "PM", "TV", "ID", "UK", "US", "AI"]);

/** What the voice is asked to say: emoji removed (unspeakable), shouted words lowercased (not spelled out). */
export function ttsText(text: string): string {
  return text
    .replace(EMOJI, "")
    .replace(/\b[A-Z]{2,}\b/g, (w) => (KEEP_CAPS.has(w) ? w : w.toLowerCase()))
    .replace(/\s+/g, " ")
    .trim();
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
  // Use undici's own fetch with the long-timeout agent for a local server (matching versions), global fetch otherwise.
  const doFetch: typeof fetch = ttsIsLocal() ? (undiciFetch as unknown as typeof fetch) : fetch;
  const res = await doFetch(`${base}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TTS_TOKEN ?? ""}` },
    body: JSON.stringify({ text: ttsText(text), language: opts.language ?? "auto", voice, ...(opts.seed != null ? { seed: opts.seed } : {}), ...(opts.speed ? { speed: opts.speed } : {}) }),
    signal: AbortSignal.timeout(ttsTimeoutMs()),
    ...(ttsIsLocal() ? { dispatcher: (localAgent ??= new Agent({ headersTimeout: 0, bodyTimeout: 0 })) } : {}),
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
