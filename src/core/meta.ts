// Thin client for Meta's Model API (https://api.meta.ai/v1).
// Four models: muse-spark-1.3, muse-image-1.0, sam-3.1, muse-voice-transcribe-1.0.
// All calls use the Standard tier model IDs (never "-contributor").

import OpenAI from "openai";
import {
  parseImageStream,
  recordsOfKind,
  decodeMaskToRaster,
  type ResponsesEvent,
} from "@meta-sam/parser";
import { Ledger, globalLedger, sparkCost, vtCost, PRICE } from "./ledger";

export const META_BASE = process.env.META_BASE_URL ?? "https://api.meta.ai/v1";
export const MODELS = {
  spark: "muse-spark-1.3",
  image: "muse-image-1.0",
  sam: "sam-3.1",
  transcribe: "muse-voice-transcribe-1.0",
} as const;

export class MetaError extends Error {
  constructor(
    public status: number,
    public body: string,
    public op: string,
  ) {
    super(`${op} failed: HTTP ${status} ${body.slice(0, 400)}`);
  }
}

function key(): string {
  const k = process.env.META_API_KEY;
  if (!k) throw new Error("META_API_KEY is not set. Copy .env.example to .env and add your key.");
  return k;
}

let _client: OpenAI | null = null;
export function client(): OpenAI {
  _client ??= new OpenAI({ apiKey: key(), baseURL: META_BASE, maxRetries: 2, timeout: 120_000 });
  return _client;
}

// ───────────────────────────── Muse Image ─────────────────────────────

export interface GeneratedImage {
  bytes: Buffer;
  format: "png" | "webp" | "jpeg";
  ms: number;
}

export async function generateImage(
  prompt: string,
  opts: { size?: string; format?: "png" | "webp" | "jpeg"; op?: string; ledger?: Ledger } = {},
): Promise<GeneratedImage> {
  const ledger = opts.ledger ?? globalLedger;
  const format = opts.format ?? "png";
  const t0 = performance.now();
  const res = await fetch(`${META_BASE}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELS.image,
      prompt,
      n: 1,
      ...(opts.size ? { size: opts.size } : {}),
      output_format: format,
      response_format: "b64_json",
    }),
  });
  const ms = Math.round(performance.now() - t0);
  const text = await res.text();
  if (!res.ok) {
    ledger.add({ model: "muse-image-1.0", op: opts.op ?? "image.generate", ms, usd: 0, ok: false, note: `HTTP ${res.status}` });
    throw new MetaError(res.status, text, "image.generate");
  }
  const json = JSON.parse(text) as { data: { b64_json: string }[]; usage?: { input_tokens: number; output_tokens: number } };
  ledger.add({
    model: "muse-image-1.0",
    op: opts.op ?? "image.generate",
    ms,
    usd: PRICE.imagePerImage,
    ok: true,
    inputTokens: json.usage?.input_tokens,
    outputTokens: json.usage?.output_tokens,
  });
  return { bytes: Buffer.from(json.data[0].b64_json, "base64"), format, ms };
}

// ───────────────────────────── SAM 3.1 ─────────────────────────────

export interface SamMask {
  objectId: string;
  /** Half-open bounds in source pixels. */
  bounds: { left: number; top: number; right: number; bottom: number };
  width: number; // raster width (= right-left)
  height: number; // raster height (= bottom-top)
  raster: Uint8Array; // row-major 0/1, width*height
}

export interface SamResult {
  masks: SamMask[];
  ms: number;
}

/** Segment every instance of one noun phrase in one image. */
export async function segment(
  image: Buffer,
  mime: string,
  phrase: string,
  opts: { op?: string; ledger?: Ledger } = {},
): Promise<SamResult> {
  const ledger = opts.ledger ?? globalLedger;
  const t0 = performance.now();
  const dataUrl = `data:${mime};base64,${image.toString("base64")}`;
  let ok = false;
  try {
    const stream = (await client().responses.create({
      model: MODELS.sam,
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: phrase },
            { type: "input_image", image_url: dataUrl, detail: "auto" },
          ],
        },
      ],
      stream: true,
    } as any)) as unknown as AsyncIterable<ResponsesEvent>;
    const parsed = parseImageStream(stream);
    for await (const _ of parsed) {
      /* drain snapshots */
    }
    const result = await parsed.finalResult;
    const masks: SamMask[] = [];
    for (const rec of recordsOfKind(result.records, "mask")) {
      const r: any = rec;
      const raster = decodeMaskToRaster(r.mask);
      const b = r.bounds as SamMask["bounds"];
      masks.push({
        objectId: String(r.objectId),
        bounds: { left: b.left, top: b.top, right: b.right, bottom: b.bottom },
        width: r.mask.width,
        height: r.mask.height,
        raster,
      });
    }
    ok = true;
    return { masks, ms: Math.round(performance.now() - t0) };
  } finally {
    ledger.add({
      model: "sam-3.1",
      op: opts.op ?? "sam.segment",
      ms: Math.round(performance.now() - t0),
      usd: ok ? PRICE.samPerImage : 0,
      ok,
      note: phrase,
    });
  }
}

// ───────────────────────────── Voice Transcribe ─────────────────────────────

export interface Transcript {
  transcript: string;
  audioDurationMs: number;
  ms: number;
}

/** Batch transcription. Audio must be RIFF/WAVE mono s16 at 16 kHz or 24 kHz. */
export async function transcribe(
  wav: Buffer,
  opts: { languageBias?: string[]; keywords?: string[]; op?: string; ledger?: Ledger } = {},
): Promise<Transcript> {
  const ledger = opts.ledger ?? globalLedger;
  const t0 = performance.now();
  const form = new FormData();
  form.append(
    "request",
    new Blob(
      [
        JSON.stringify({
          model: MODELS.transcribe,
          audioEncoding: "WAV",
          mode: "PUSH_TO_TALK",
          ...(opts.languageBias?.length ? { languageBias: opts.languageBias } : {}),
          ...(opts.keywords?.length ? { keywords: opts.keywords } : {}),
        }),
      ],
      { type: "application/json" },
    ),
  );
  form.append("audio", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "audio.wav");
  const res = await fetch(`${META_BASE}/asr/transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, Accept: "application/json" },
    body: form,
  });
  const ms = Math.round(performance.now() - t0);
  const text = await res.text();
  if (!res.ok) {
    ledger.add({ model: "muse-voice-transcribe-1.0", op: opts.op ?? "vt.transcribe", ms, usd: 0, ok: false, note: `HTTP ${res.status}` });
    throw new MetaError(res.status, text, "vt.transcribe");
  }
  const json = JSON.parse(text) as { transcript: string; audioDurationMs: number };
  ledger.add({
    model: "muse-voice-transcribe-1.0",
    op: opts.op ?? "vt.transcribe",
    ms,
    usd: vtCost(json.audioDurationMs ?? 0),
    ok: true,
    audioMs: json.audioDurationMs,
  });
  return { transcript: json.transcript ?? "", audioDurationMs: json.audioDurationMs ?? 0, ms };
}

// ───────────────────────────── Muse Spark ─────────────────────────────

export interface SparkJsonResult<T> {
  data: T | null;
  raw: string;
  ms: number;
  usage: { input: number; output: number; reasoning: number };
  finishReason?: string;
}

/** Chat completion with a strict JSON schema. Returns parsed JSON (or null if unparseable). */
export async function sparkJSON<T = unknown>(
  messages: { role: "system" | "developer" | "user" | "assistant"; content: string }[],
  schema: { name: string; schema: Record<string, unknown> },
  opts: { reasoningEffort?: "minimal" | "low" | "medium" | "high"; maxTokens?: number; op?: string; ledger?: Ledger; strict?: boolean } = {},
): Promise<SparkJsonResult<T>> {
  const ledger = opts.ledger ?? globalLedger;
  const t0 = performance.now();
  let res: any;
  try {
    res = await client().chat.completions.create({
      model: MODELS.spark,
      messages,
      response_format: { type: "json_schema", json_schema: { name: schema.name, schema: schema.schema, strict: opts.strict ?? true } },
      reasoning_effort: opts.reasoningEffort ?? "low",
      max_completion_tokens: opts.maxTokens ?? 4000,
    } as any);
  } catch (err: any) {
    ledger.add({ model: "muse-spark-1.3", op: opts.op ?? "spark.json", ms: Math.round(performance.now() - t0), usd: 0, ok: false, note: String(err?.status ?? err?.message) });
    throw err;
  }
  const ms = Math.round(performance.now() - t0);
  const raw: string = res.choices?.[0]?.message?.content ?? "";
  const input = res.usage?.prompt_tokens ?? 0;
  const output = res.usage?.completion_tokens ?? 0;
  const reasoning = res.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
  let data: T | null = null;
  try {
    data = JSON.parse(raw) as T;
  } catch {
    data = null;
  }
  ledger.add({
    model: "muse-spark-1.3",
    op: opts.op ?? "spark.json",
    ms,
    usd: sparkCost(input, output),
    ok: data !== null,
    inputTokens: input,
    outputTokens: output,
    reasoningTokens: reasoning,
  });
  return { data, raw, ms, usage: { input, output, reasoning }, finishReason: res.choices?.[0]?.finish_reason };
}
