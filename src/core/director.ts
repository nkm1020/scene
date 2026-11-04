// Replay director. Spark 1.3 directs a whole missed segment in one call.
// It returns per-message stage directions only: the schema has no text field,
// so the model has no channel to change what anyone said. validate_directions()
// is called on every Spark output before it is used (fixed checkpoint).
// After 3 failed attempts we fall back to the deterministic rule table.

import { sparkJSON } from "./meta";
import type { Ledger } from "./ledger";

export * from "./rules";
import { EMOTIONS, GESTURES, CAMERAS, POSES, LOOKS, ruleDirections, type ChatMessage, type Direction, type ValidationError, type RosterMember } from "./rules";

export const MAX_SEGMENT = 40;
export const MAX_ATTEMPTS = 3;
const ALLOWED_KEYS = new Set(["message_id", "to", "emotion", "gesture", "camera", "pause_ms", "reactions"]);
const REACTION_KEYS = new Set(["member_id", "pose", "look"]);

// ───────────────────────── validator (fixed checkpoint) ─────────────────────────

export function validateDirections(
  messages: ChatMessage[],
  output: unknown,
  roster: RosterMember[] = [],
): { ok: boolean; errors: ValidationError[]; directions: Direction[] } {
  const errors: ValidationError[] = [];
  const ids = messages.map((m) => m.id);
  const senderOf = new Map(messages.map((m) => [m.id, m.sender_id]));
  const memberIds = new Set(roster.map((r) => r.member_id));
  if (messages.length > MAX_SEGMENT) {
    errors.push({ code: "D3", message: `segment has ${messages.length} messages, max ${MAX_SEGMENT}`, fix_hint: "split the segment" });
  }
  const root = output as any;
  if (!root || typeof root !== "object" || !Array.isArray(root.directions)) {
    errors.push({ code: "SCHEMA", message: "output must be an object with a directions array", fix_hint: 'return {"directions":[...]}' });
    return { ok: false, errors, directions: [] };
  }
  for (const k of Object.keys(root)) {
    if (k !== "directions") errors.push({ code: "D4", message: `unexpected top-level key "${k}"`, fix_hint: "only the directions array is allowed" });
  }
  const dirs = root.directions as any[];
  // D4: no extra keys anywhere (no text channel)
  dirs.forEach((d) => {
    if (!d || typeof d !== "object") return;
    for (const k of Object.keys(d)) {
      if (!ALLOWED_KEYS.has(k)) errors.push({ code: "D4", message_id: d.message_id, message: `forbidden key "${k}" (directions carry no text)`, fix_hint: `remove "${k}"; only ${[...ALLOWED_KEYS].join(", ")}` });
    }
    for (const r of Array.isArray(d.reactions) ? d.reactions : []) {
      if (!r || typeof r !== "object") continue;
      for (const k of Object.keys(r)) {
        if (!REACTION_KEYS.has(k)) errors.push({ code: "D4", message_id: d.message_id, message: `forbidden reaction key "${k}"`, fix_hint: "reactions carry member_id, pose, look only" });
      }
    }
  });
  // D1: one-to-one, same order
  const got = dirs.map((d) => d?.message_id);
  const seen = new Map<string, number>();
  got.forEach((id) => seen.set(id, (seen.get(id) ?? 0) + 1));
  for (const id of ids) {
    const c = seen.get(id) ?? 0;
    if (c === 0) errors.push({ code: "D1", message_id: id, message: `missing direction for ${id}`, fix_hint: "add exactly one direction per message" });
    if (c > 1) errors.push({ code: "D1", message_id: id, message: `duplicate direction for ${id}`, fix_hint: "one direction per message" });
  }
  for (const id of got) {
    if (!ids.includes(id)) errors.push({ code: "D1", message_id: id, message: `unknown message_id ${id}`, fix_hint: "use only the given ids" });
  }
  const filtered = got.filter((id) => ids.includes(id));
  const expectedOrder = ids.filter((id) => filtered.includes(id));
  if (filtered.join("|") !== expectedOrder.join("|")) {
    errors.push({ code: "D1", message: "directions are not in the original message order", fix_hint: "keep the original order" });
  }
  // D2: enums and ranges
  dirs.forEach((d) => {
    if (!d || typeof d !== "object") return;
    if (!EMOTIONS.includes(d.emotion)) errors.push({ code: "D2", message_id: d.message_id, message: `emotion "${d.emotion}" not allowed`, fix_hint: EMOTIONS.join("|") });
    if (!GESTURES.includes(d.gesture)) errors.push({ code: "D2", message_id: d.message_id, message: `gesture "${d.gesture}" not allowed`, fix_hint: GESTURES.join("|") });
    if (!CAMERAS.includes(d.camera)) errors.push({ code: "D2", message_id: d.message_id, message: `camera "${d.camera}" not allowed`, fix_hint: CAMERAS.join("|") });
    if (!Number.isInteger(d.pause_ms) || d.pause_ms < 0 || d.pause_ms > 1500) errors.push({ code: "D2", message_id: d.message_id, message: `pause_ms ${d.pause_ms} out of range`, fix_hint: "integer 0..1500" });
    // to: the whole table, or someone at it who is not the speaker
    if (d.to !== undefined && d.to !== "all") {
      if (typeof d.to !== "string" || (roster.length && !memberIds.has(d.to))) errors.push({ code: "D2", message_id: d.message_id, message: `to "${d.to}" is not at the table`, fix_hint: `"all" or a roster member_id` });
      else if (d.to === senderOf.get(d.message_id)) errors.push({ code: "D2", message_id: d.message_id, message: "a speaker cannot talk to themself", fix_hint: `"all" or another member_id` });
    }
  });
  // D5: reactions name real listeners (not the speaker), once each, with allowed pose/look
  dirs.forEach((d) => {
    if (!d || typeof d !== "object" || d.reactions === undefined) return;
    if (!Array.isArray(d.reactions)) {
      errors.push({ code: "D5", message_id: d.message_id, message: "reactions must be an array", fix_hint: "[] or a list of {member_id, pose, look}" });
      return;
    }
    const speaker = senderOf.get(d.message_id);
    const once = new Set<string>();
    for (const r of d.reactions) {
      if (!r || typeof r !== "object") continue;
      if (roster.length && !memberIds.has(r.member_id)) errors.push({ code: "D5", message_id: d.message_id, message: `reaction for unknown member ${r.member_id}`, fix_hint: "use roster member_ids" });
      if (r.member_id === speaker) errors.push({ code: "D5", message_id: d.message_id, message: "the speaker cannot react to their own line", fix_hint: "react with listeners only" });
      if (once.has(r.member_id)) errors.push({ code: "D5", message_id: d.message_id, message: `two reactions for ${r.member_id}`, fix_hint: "one reaction per listener" });
      once.add(r.member_id);
      if (!POSES.includes(r.pose)) errors.push({ code: "D5", message_id: d.message_id, message: `pose "${r.pose}" not allowed`, fix_hint: POSES.join("|") });
      if (!LOOKS.includes(r.look)) errors.push({ code: "D5", message_id: d.message_id, message: `look "${r.look}" not allowed`, fix_hint: LOOKS.join("|") });
    }
  });
  const ok = errors.length === 0;
  return { ok, errors, directions: ok ? (dirs as Direction[]) : [] };
}

// ───────────────────────── Spark director ─────────────────────────

/** JSON schema for Spark's structured output. No field can hold text; member ids are an enum of the roster. */
export function directionsSchema(roster: RosterMember[]) {
  const reaction = {
    type: "object",
    additionalProperties: false,
    required: ["member_id", "pose", "look"],
    properties: {
      member_id: roster.length ? { type: "string", enum: roster.map((r) => r.member_id) } : { type: "string" },
      pose: { type: "string", enum: [...POSES] },
      look: { type: "string", enum: [...LOOKS] },
    },
  };
  return {
    name: "scene_directions",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["directions"],
      properties: {
        directions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["message_id", "to", "emotion", "gesture", "camera", "pause_ms", "reactions"],
            properties: {
              message_id: { type: "string" },
              to: roster.length ? { type: "string", enum: [...roster.map((r) => r.member_id), "all"] } : { type: "string" },
              emotion: { type: "string", enum: [...EMOTIONS] },
              gesture: { type: "string", enum: [...GESTURES] },
              camera: { type: "string", enum: [...CAMERAS] },
              pause_ms: { type: "integer", minimum: 0, maximum: 1500 },
              reactions: { type: "array", items: reaction },
            },
          },
        },
      },
    },
  };
}
export const DIRECTIONS_SCHEMA = directionsSchema([]);

const SYSTEM = `You are the stage director for Scene. Friends in a group chat are clay figurines on a table; each figurine performs its owner's messages aloud.
You receive the roster (who is at the table, and who is connected right now) and a missed segment of the chat.
For EVERY message, in the original order, direct the whole table:
- to: who the speaker is talking to, so the figures look at the right person: the member_id of the one they answer, ask, tease or name, or "all" when it is for the whole table. Read the thread: most lines answer someone. Never the speaker.
- emotion of the speaker: one of ${EMOTIONS.join(", ")}. Read the whole conversation: irony, running jokes, who is teasing whom.
- gesture of the speaker: one of ${GESTURES.join(", ")}
- camera: "close" for punchlines, reveals and strong reactions; otherwise "room"
- pause_ms: silence BEFORE this message (0-1500). Longer pauses for comic timing and awkward silences.
- reactions: listeners (never the speaker) whose reaction differs from the default, with their pose (${POSES.join(", ")}) and where they look (${LOOKS.join(", ")}).
  Defaults (omit these): a connected member listens with "neutral" looking at the speaker; a member who is not connected keeps dozing ("away", "down").
  Wake a dozing member only when the line is about them, addressed to them, or would obviously wake them.
  React to what the line means to that person (the one being kept out of a secret is confused; the one in on the joke laughs). Most lines need one or two reactions, not all.
You never write, quote, translate, summarize or change any message text. Output only ids and the fields above.`;

export interface DirectorRun {
  directions: Direction[];
  source: "spark" | "rules";
  attempts: number;
  log: { attempt: number; ok: boolean; errors: ValidationError[]; ms: number; inputTokens: number; outputTokens: number; reasoningTokens: number }[];
  flags: string[];
}

export async function directSegment(
  messages: ChatMessage[],
  opts: { ledger?: Ledger; reasoningEffort?: "minimal" | "low" | "medium"; roster?: RosterMember[]; tamper?: (out: any, attempt: number) => any } = {},
): Promise<DirectorRun> {
  const roster = opts.roster ?? [];
  const log: DirectorRun["log"] = [];
  if (messages.length === 0) return { directions: [], source: "rules", attempts: 0, log, flags: [] };
  if (messages.length > MAX_SEGMENT) {
    const runs: DirectorRun[] = [];
    for (let i = 0; i < messages.length; i += MAX_SEGMENT) runs.push(await directSegment(messages.slice(i, i + MAX_SEGMENT), opts));
    return {
      directions: runs.flatMap((r) => r.directions),
      source: runs.every((r) => r.source === "spark") ? "spark" : "rules",
      attempts: runs.reduce((a, r) => a + r.attempts, 0),
      log: runs.flatMap((r) => r.log),
      flags: runs.flatMap((r) => r.flags),
    };
  }
  const transcript = messages.map((m) => ({ message_id: m.id, sender: roster.find((r) => r.member_id === m.sender_id)?.name ?? m.sender_name ?? m.sender_id, sender_id: m.sender_id, text: m.text }));
  const chat: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: JSON.stringify({ roster, messages: transcript }) },
  ];
  const schema = directionsSchema(roster);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let out: any = null;
    let ms = 0, inputTokens = 0, outputTokens = 0, reasoningTokens = 0;
    try {
      const r = await sparkJSON(chat as any, schema as any, { reasoningEffort: opts.reasoningEffort ?? "low", maxTokens: 8000, op: "director.spark", ledger: opts.ledger });
      out = r.data;
      ms = r.ms;
      inputTokens = r.usage.input;
      outputTokens = r.usage.output;
      reasoningTokens = r.usage.reasoning;
    } catch (err) {
      log.push({ attempt, ok: false, errors: [{ code: "SCHEMA", message: `spark call failed: ${(err as Error).message.slice(0, 200)}`, fix_hint: "retry" }], ms, inputTokens, outputTokens, reasoningTokens });
      continue;
    }
    if (opts.tamper) out = opts.tamper(out, attempt);
    const v = validateDirections(messages, out, roster);
    log.push({ attempt, ok: v.ok, errors: v.errors, ms, inputTokens, outputTokens, reasoningTokens });
    if (v.ok) return { directions: v.directions, source: "spark", attempts: attempt, log, flags: [] };
    chat.push({ role: "assistant", content: JSON.stringify(out) });
    chat.push({ role: "user", content: `Your output failed validation. Fix every error and return the full directions again.\n${JSON.stringify(v.errors)}` });
  }
  return { directions: ruleDirections(messages, roster), source: "rules", attempts: MAX_ATTEMPTS, log, flags: ["director_fallback"] };
}
