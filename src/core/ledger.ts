// Cost and latency receipt. Every Meta or TTS call is recorded here.
// Prices: dev.meta.ai model pages (Nov 2026).

export type Model =
  | "muse-spark-1.3"
  | "muse-image-1.0"
  | "sam-3.1"
  | "muse-voice-transcribe-1.0"
  | "sam-3d-objects"
  | "qwen3-tts"
  | "gpt-4o-mini-tts";

export interface LedgerEntry {
  model: Model;
  op: string; // e.g. "persona.generate", "voice.roundtrip"
  ms: number;
  usd: number;
  ok: boolean;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  audioMs?: number;
  note?: string;
  at: string;
}

export const PRICE = {
  sparkInPerM: 1.25,
  sparkOutPerM: 4.25,
  imagePerImage: 0.01,
  samPerImage: 2.5 / 1000,
  vtPerHour: 0.18,
  // Meta SAM 3D Objects, hosted by fal.ai (fal-ai/sam-3/3d-objects): $0.02 per reconstruction.
  sam3dPerObject: 0.02,
  // Modal L4 ≈ $0.80/h; billed per GPU-second of generation.
  ttsGpuPerHour: 0.8,
  // OpenAI gpt-4o-mini-tts: about $0.015 per minute of speech (text in + audio out).
  openaiTtsPerMinute: 0.015,
} as const;

export function sparkCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * PRICE.sparkInPerM + outputTokens * PRICE.sparkOutPerM) / 1e6;
}
export function vtCost(audioMs: number): number {
  return (audioMs / 3_600_000) * PRICE.vtPerHour;
}
export function ttsCost(genMs: number): number {
  return (genMs / 3_600_000) * PRICE.ttsGpuPerHour;
}

export class Ledger {
  entries: LedgerEntry[] = [];
  add(e: Omit<LedgerEntry, "at">): LedgerEntry {
    const full = { ...e, at: new Date().toISOString() };
    this.entries.push(full);
    return full;
  }
  merge(other: Ledger) {
    this.entries.push(...other.entries);
  }
  summary() {
    const byModel: Record<string, { calls: number; usd: number; ms: number }> = {};
    const byOp: Record<string, { calls: number; usd: number; ms: number }> = {};
    let usd = 0;
    for (const e of this.entries) {
      usd += e.usd;
      for (const [map, key] of [
        [byModel, e.model],
        [byOp, e.op],
      ] as const) {
        map[key] ??= { calls: 0, usd: 0, ms: 0 };
        map[key].calls++;
        map[key].usd += e.usd;
        map[key].ms += e.ms;
      }
    }
    return { calls: this.entries.length, usd, byModel, byOp };
  }
}

/** Process-wide default ledger (CLI and server routes may pass their own). */
export const globalLedger = new Ledger();
