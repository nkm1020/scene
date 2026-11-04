// After a missed segment plays, Muse Spark sums it up for the friend who missed it: a headline and up to three points.
// validateSummary is the fixed checkpoint: the shape and lengths, no links, and every quote must be words someone
// actually sent (it says what you said, nothing else). Three tries with the errors fed back, else no summary.

import { sparkJSON } from "./meta";
import type { Ledger } from "./ledger";

export interface ChatSummary {
  headline: string;
  points: string[];
}

export const SUMMARY_SCHEMA = {
  name: "chat_summary",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["headline", "points"],
    properties: {
      headline: { type: "string" },
      points: { type: "array", items: { type: "string" } },
    },
  },
};

const QUOTE = /["“”«»「」『』]([^"“”«»「」『』]{2,})["“”«»「」『』]/g;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function validateSummary(raw: unknown, messages: { text: string }[]): { ok: boolean; errors: string[]; summary: ChatSummary | null } {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["U1 not an object"], summary: null };
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(o)) if (k !== "headline" && k !== "points") errors.push(`U1 unexpected key "${k}"`);
  const headline = typeof o.headline === "string" ? o.headline.trim() : "";
  const points = Array.isArray(o.points) ? o.points.filter((p): p is string => typeof p === "string").map((p) => p.trim()).filter(Boolean) : [];
  if (!headline) errors.push("U1 headline is missing");
  if ([...headline].length > 80) errors.push(`U2 headline is ${[...headline].length} characters, max 80`);
  if (points.length < 1 || points.length > 3) errors.push(`U2 ${points.length} points, need 1 to 3`);
  for (const p of points) if ([...p].length > 120) errors.push(`U2 a point is ${[...p].length} characters, max 120`);
  const all = [headline, ...points].join("\n");
  if (/https?:\/\/|www\./i.test(all)) errors.push("U3 links are not allowed");
  const said = norm(messages.map((m) => m.text).join("\n"));
  for (const m of all.matchAll(QUOTE)) if (!said.includes(norm(m[1]))) errors.push(`U4 quote "${m[1]}" is not something anyone sent`);
  if (errors.length) return { ok: false, errors, summary: null };
  return { ok: true, errors, summary: { headline, points } };
}

const PROMPT = `You catch a friend up on the group chat they missed. Write in the language most of the messages are in.
Give a headline (one short sentence) and one to three short points: who wants what, what was decided, what is still open.
Use the friends' names. Only say what the messages say; never invent plans, feelings or facts.
Mostly use your own short words; quote at most one line, and then exactly, in double quotes.`;

export async function summarizeSegment(lines: { name: string; text: string }[], opts: { ledger?: Ledger } = {}) {
  const log: { ok: boolean; errors: string[]; ms: number }[] = [];
  const chat = lines.map((l) => `${l.name}: ${l.text}`).join("\n");
  let feedback = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await sparkJSON(
      [
        { role: "system", content: PROMPT },
        { role: "user", content: `The chat:\n${chat}${feedback}` },
      ],
      SUMMARY_SCHEMA,
      { reasoningEffort: "minimal", maxTokens: 2000, op: "summary.spark", ledger: opts.ledger },
    );
    const check = validateSummary(res.data, lines);
    log.push({ ok: check.ok, errors: check.errors, ms: res.ms });
    if (check.ok) return { summary: check.summary, log };
    feedback = `\n\nYour last answer failed these checks, fix them: ${check.errors.join("; ")}`;
  }
  return { summary: null, log };
}
