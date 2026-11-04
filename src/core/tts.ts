// Text to speech. Meta has no TTS, so speaking is an external, replaceable piece: the self-hosted Qwen3-TTS service
// (Modal or a local server; contract in tts/modal_app.py; clones a registered voice), or OpenAI gpt-4o-mini-tts
// (preset voices, told the line's mood). Whichever speaks, Voice Transcribe reads every line back before it plays.

import { Agent, fetch as undiciFetch } from "undici";
import { ttsCost, PRICE, type Ledger, globalLedger } from "./ledger";
import { encodeWav, durationMs as pcmMs } from "./wav";

// Node's fetch gives up after 300 s without response headers; a laptop TTS server can take longer.
let localAgent: Agent | null = null;

export type Voice = { preset: string } | { ref_audio_b64: string; ref_text: string } | { openai: string };

export interface TtsResult {
  wav: Buffer;
  durationMs: number;
  genMs: number;
  ms: number;
}

export type TtsProvider = "qwen" | "openai";

/** Who speaks: TTS_PROVIDER if set, else the Qwen service when its URL is set, else OpenAI when a key is set. */
export function ttsProvider(): TtsProvider | null {
  const want = process.env.TTS_PROVIDER;
  if (want === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (want === "qwen" && ttsEndpoint()) return "qwen";
  if (ttsEndpoint()) return "qwen";
  return process.env.OPENAI_API_KEY ? "openai" : null;
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

/** The same four presets as OpenAI voices (these speak Korean and English alike). */
export const OPENAI_PRESETS: Record<string, string> = { female_a: "coral", female_b: "nova", male: "ash", male_b: "verse" };

/** A preset voice from whichever provider is speaking. */
export function voiceForPreset(key: string | null | undefined, language: "ko" | "en" = "en"): Voice {
  if (ttsProvider() === "openai") return { openai: OPENAI_PRESETS[key ?? ""] ?? OPENAI_PRESETS.female_a };
  return { preset: presetFor(key, language) };
}

const MOOD: Record<string, string> = {
  neutral: "relaxed",
  happy: "cheerful",
  laughing: "amused, close to laughing",
  surprised: "surprised",
  angry: "annoyed",
  sad: "a little down",
};

/** OpenAI gpt-4o-mini-tts: a preset voice, told how the line feels (the staging's expression), never what to say. */
async function openaiSpeech(text: string, voice: string, mood: string | undefined, opts: { ledger: Ledger; op?: string }): Promise<TtsResult> {
  const t0 = performance.now();
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice,
      input: ttsText(text),
      instructions: `A short line in a casual group chat between close friends, said ${MOOD[mood ?? "neutral"] ?? MOOD.neutral}. Say exactly the words given and nothing else.`,
      response_format: "pcm", // 24 kHz mono s16le; wrapped as WAV here
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const ms = Math.round(performance.now() - t0);
  if (!res.ok) {
    opts.ledger.add({ model: "gpt-4o-mini-tts", op: opts.op ?? "tts.synthesize", ms, usd: 0, ok: false, note: `HTTP ${res.status}` });
    throw new Error(`openai tts failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  const raw = Buffer.from(await res.arrayBuffer());
  const samples = new Float32Array(raw.length >> 1);
  for (let i = 0; i < samples.length; i++) samples[i] = raw.readInt16LE(i * 2) / 32768;
  const pcm = { sampleRate: 24000, samples };
  const wav = encodeWav(pcm);
  const durationMs = pcmMs(pcm);
  opts.ledger.add({ model: "gpt-4o-mini-tts", op: opts.op ?? "tts.synthesize", ms, usd: (durationMs / 60_000) * PRICE.openaiTtsPerMinute, ok: true, audioMs: durationMs, note: voice });
  return { wav, durationMs, genMs: ms, ms };
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
  opts: { language?: "ko" | "en" | "auto"; seed?: number; speed?: number; mood?: string; ledger?: Ledger; op?: string } = {},
): Promise<TtsResult> {
  if ("openai" in voice) return openaiSpeech(text, voice.openai, opts.mood, { ledger: opts.ledger ?? globalLedger, op: opts.op });
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
