// npm run demo — reproduce Scene end to end with one key.
//   seed room "wrong chat" → personas (Muse Image + SAM 3.1) → optional voice enrollment (Voice Transcribe read-back)
//   → Spark 1.3 directs the missed segment (validate_directions) → Qwen3-TTS + Voice Transcribe round trip per line
//   → out/replay.html (self-contained) + out/receipt.json
//
// Flags:
//   --voice none            skip TTS (captions + SFX); Meta models still run
//   --reuse-personas        use the committed seed personas instead of generating new ones
//   --enroll <wav>          enroll Sam's voice from a recording of the three enrollment sentences
//   --inject-text           validator demo: inject a "text" field into Spark's first output (must be rejected, D4)
//   --effort low|medium     Spark reasoning effort (default low)

import "dotenv/config";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { Ledger } from "../src/core/ledger";
import { createPersona, createAwayPose } from "../src/core/persona";
import { directSegment, type Direction } from "../src/core/director";
import { renderVoice, verifyEnrollment, type VoiceRender, type VoiceSpec } from "../src/core/voice";
import { ttsEndpoint, ttsConcurrency, type Voice } from "../src/core/tts";
import { SEED_MEMBERS, SEED_MESSAGES, ENROLL_SENTENCES } from "../src/core/seed";
import { buildReplayHtml, dataUrl } from "../src/core/export";
import type { PerformItem } from "../src/stage/engine";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const OUT = "out";
const ledger = new Ledger();
const log = (...a: unknown[]) => console.log(...a);
const t0 = Date.now();

async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

async function main() {
  if (!process.env.META_API_KEY) {
    console.error("META_API_KEY is missing. cp .env.example .env and add your key from dev.meta.ai.");
    process.exit(1);
  }
  mkdirSync(path.join(OUT, "audio"), { recursive: true });
  mkdirSync(path.join(OUT, "personas"), { recursive: true });

  const voiceOn = !flag("voice") || opt("voice") !== "none";
  const tts = voiceOn ? ttsEndpoint() : null;
  log(`Scene demo · room "wrong chat" · ${SEED_MESSAGES.length} missed messages · voice: ${tts ? "Qwen3-TTS " + tts : "off (captions)"}`);

  // 1) Personas
  log("\n[1/4] Personas: Muse Image draws, SAM 3.1 cuts out; Muse Image edits an away pose (head bowed) for presence");
  const personas = await pool(SEED_MEMBERS, 3, async (m) => {
    const file = path.join(OUT, "personas", `${m.id}.webp`);
    if (flag("reuse-personas") && existsSync(`public/seed/${m.id}.webp`)) {
      log(`  ${m.name}: reused public/seed/${m.id}.webp`);
      return { png: readFileSync(`public/seed/${m.id}.webp`), away: existsSync(`public/seed/${m.id}-away.webp`) ? readFileSync(`public/seed/${m.id}-away.webp`) : null };
    }
    const p = await createPersona(m, { ledger });
    writeFileSync(file, p.png);
    const away = await createAwayPose(p.sourceImage, { ledger }).catch((e) => (log(`  ${m.name}: away pose failed (${e.message}); CSS tilt fallback`), null));
    if (away) writeFileSync(path.join(OUT, "personas", `${m.id}-away.webp`), away.png);
    log(`  ${m.name}: "${m.hair}, ${m.outfit}, ${m.vibe}" → ${p.width}×${p.height}, SAM "${p.phrase}", mask ${(p.maskCoverage * 100).toFixed(0)}%${away ? ", away pose ✓" : ""}${p.flags.length ? " " + p.flags.join(",") : ""}`);
    return { png: p.png, away: away?.png ?? null };
  });

  // 2) Voice enrollment (optional, Sam only — you can only enroll your own voice)
  const voices = new Map<string, Voice>();
  const enrollPath = opt("enroll") ?? (existsSync("examples/voices/sam-enroll.wav") ? "examples/voices/sam-enroll.wav" : undefined);
  let enrollment: unknown = null;
  if (tts && enrollPath) {
    log(`\n[2/4] Voice enrollment: Voice Transcribe checks the reading (${enrollPath})`);
    // The sentences shown to the reader live next to the recording (one per line); default: English set.
    const txtPath = enrollPath.replace(/\.wav$/, ".txt");
    const shown = existsSync(txtPath) ? readFileSync(txtPath, "utf8").trim().split("\n").filter(Boolean) : ENROLL_SENTENCES.en;
    const check = await verifyEnrollment(readFileSync(enrollPath), shown, { ledger });
    enrollment = { ok: check.ok, similarity: check.similarity, heard: check.heard, durationMs: check.durationMs, silence: check.silence, reasons: check.reasons };
    log(`  read-back ${check.similarity.toFixed(2)} (need ≥0.80), ${(check.durationMs / 1000).toFixed(1)} s, silence ${(check.silence * 100).toFixed(0)}% → ${check.ok ? "ENROLLED" : "rejected: " + check.reasons.join("; ")}`);
    if (check.ok) voices.set("sam", { ref_audio_b64: check.wav.toString("base64"), ref_text: shown.join(" ") });
  } else {
    log(`\n[2/4] Voice enrollment: skipped (${tts ? "no --enroll recording" : "voice off"}); unenrolled members use preset voices`);
  }

  // 3) Director
  log(`\n[3/4] Director: Muse Spark 1.3 directs ${SEED_MESSAGES.length} lines in one call, validate_directions checks every output`);
  const run = await directSegment(SEED_MESSAGES, {
    ledger,
    reasoningEffort: (opt("effort") as any) ?? "low",
    tamper: flag("inject-text")
      ? (out, attempt) => {
          if (attempt === 1 && out?.directions?.[5]) out.directions[5].text = "never mind, it's nothing";
          return out;
        }
      : undefined,
  });
  for (const l of run.log) {
    log(`  attempt ${l.attempt}: ${l.ok ? "validate_directions ✓" : "✗ " + l.errors.map((e) => `${e.code} ${e.message}`).join("; ")} (${l.ms} ms, ${l.inputTokens}→${l.outputTokens} tok, reasoning ${l.reasoningTokens})`);
  }
  log(`  source: ${run.source}${run.flags.length ? " (" + run.flags.join(",") + ")" : ""}`);
  const dirById = new Map<string, Direction>(run.directions.map((d) => [d.message_id, d]));

  // 4) Voices with round trip
  log(`\n[4/4] Voices: synthesize → Voice Transcribe reads it back → plays only if ≥0.85 match`);
  const renders: VoiceRender[] = await pool(SEED_MESSAGES, ttsConcurrency(), async (m) => {
    const member = SEED_MEMBERS.find((x) => x.id === m.sender_id)!;
    const voice: VoiceSpec | null = tts ? voices.get(m.sender_id) ?? { presetKey: member.preset } : null;
    const r = await renderVoice(m.text, voice, { ledger });
    if (r.wav) writeFileSync(path.join(OUT, "audio", `${m.id}.wav`), r.wav);
    const tries = r.attempts.map((a) => `${a.similarity.toFixed(2)}${a.ok ? "✓" : "✗"}`).join(" → ");
    log(`  ${m.id} ${member.name.padEnd(4)} "${m.text}" → ${r.status}${tries ? " [" + tries + "]" : ""}${r.flags.length ? " " + r.flags.join(",") : ""}`);
    return r;
  });

  // Export
  const items: PerformItem[] = SEED_MESSAGES.map((m, i) => {
    const d = dirById.get(m.id)!;
    const r = renders[i];
    return {
      messageId: m.id,
      memberId: m.sender_id,
      text: m.text,
      emotion: d.emotion,
      gesture: d.gesture,
      camera: d.camera,
      pauseMs: d.pause_ms,
      status: r.status,
      audioUrl: r.wav ? dataUrl(r.wav, "audio/wav") : null,
      envelope: r.envelope,
      durationMs: r.durationMs,
      flags: r.flags,
      readback: r.attempts.map((a) => ({ score: a.similarity, heard: a.heard || a.error || "" })),
    };
  });
  const summary = ledger.summary();
  const members = SEED_MEMBERS.map((m, i) => ({
    id: m.id,
    name: m.name,
    personaUrl: dataUrl(personas[i].png, "image/webp"),
    awayUrl: personas[i].away ? dataUrl(personas[i].away!, "image/webp") : null,
    present: m.id !== "jay", // Jay is away in the seed room: bowed until he performs a line
  }));
  const receipt = {
    room: "wrong chat",
    generatedAt: new Date().toISOString(),
    wallMs: Date.now() - t0,
    models: { director: "muse-spark-1.3", persona: ["muse-image-1.0", "sam-3.1"], readback: "muse-voice-transcribe-1.0", voice: tts ? "Qwen3-TTS (Apache 2.0, self-hosted, external)" : "off" },
    summary,
    perMessageUsd: summary.usd / SEED_MESSAGES.length,
    enrollment,
    director: { source: run.source, attempts: run.attempts, flags: run.flags, log: run.log },
    messages: SEED_MESSAGES.map((m, i) => ({
      id: m.id,
      sender: m.sender_id,
      text: m.text,
      direction: dirById.get(m.id),
      voice: { status: renders[i].status, similarity: renders[i].similarity, heard: renders[i].heard, attempts: renders[i].attempts, flags: renders[i].flags },
    })),
    entries: ledger.entries,
  };
  writeFileSync(path.join(OUT, "receipt.json"), JSON.stringify(receipt, null, 2));
  writeFileSync(path.join(OUT, "replay.html"), await buildReplayHtml({ room: "wrong chat", members, items, director: { source: run.source, attempts: run.attempts, log: run.log, flags: run.flags }, receipt: summary }));

  log(`\nReceipt: ${summary.calls} calls, $${summary.usd.toFixed(4)} total, $${receipt.perMessageUsd.toFixed(5)} per message, ${(receipt.wallMs / 1000).toFixed(1)} s wall`);
  for (const [model, v] of Object.entries(summary.byModel)) log(`  ${model.padEnd(26)} ${String(v.calls).padStart(3)} calls  $${v.usd.toFixed(4)}  ${(v.ms / 1000).toFixed(1)} s`);
  log(`\nWrote ${OUT}/replay.html and ${OUT}/receipt.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
