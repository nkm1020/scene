// Demo friends: for a judge who opens a room alone. Each is a seed figure with a preset voice, played by Muse Spark.
// Spark only proposes replies; validateReplies decides what gets posted.
import type { Ledger } from "./ledger";
import { sparkJSON } from "./meta";

export interface DemoFriend {
  id: string;
  name: string;
  persona: string;
}

export const DEMO_FRIENDS: DemoFriend[] = [
  { id: "sam", name: "Sam", persona: "The planner. Types fast in short bursts, uses caps when stressed, is secretly organizing Jay's surprise party and keeps everyone on schedule." },
  { id: "mina", name: "Mina", persona: "Warm and teasing. Bakes, loves emoji, laughs at Sam's panic, always offers to bring food." },
  { id: "jay", name: "Jay", persona: "Deadpan and a little oblivious. Naps a lot, suspects everyone is hiding something, answers with one dry line." },
];

export interface FriendReply {
  friend: string;
  text: string;
}

const MAX_REPLIES = 2;
const MAX_CHARS = 160;

/** Deterministic gate on Spark's proposal: known present friends only, short plain lines, nothing echoed back. */
export function validateReplies(raw: unknown, present: string[], lastText: string): FriendReply[] {
  const list = Array.isArray((raw as any)?.replies) ? (raw as any).replies : [];
  const out: FriendReply[] = [];
  for (const r of list) {
    if (out.length >= MAX_REPLIES) break;
    const friend = String(r?.friend ?? "");
    const text = String(r?.text ?? "").replace(/\s+/g, " ").trim();
    if (!present.includes(friend) || out.some((o) => o.friend === friend)) continue;
    if (!text || [...text].length > MAX_CHARS || /https?:\/\//i.test(text)) continue;
    if (text.toLowerCase() === lastText.trim().toLowerCase()) continue;
    out.push({ friend, text });
  }
  return out;
}

/** Ask Spark how the present demo friends answer the latest messages. Zero replies is a valid answer. */
export async function proposeReplies(
  history: { name: string; text: string }[],
  present: DemoFriend[],
  opts: { ledger?: Ledger } = {},
): Promise<FriendReply[]> {
  if (!present.length || !history.length) return [];
  const ids = present.map((f) => f.id);
  const system = [
    "You play friends in a small group chat. Reply as they would text: casual, short (under 120 characters), in the language of the latest message.",
    "Not everyone answers every message. Reply with zero, one or two lines. Never speak for anyone not listed. No links, no hashtags.",
    "Friends:",
    ...present.map((f) => `- ${f.id} (${f.name}): ${f.persona}`),
  ].join("\n");
  const chat = history.map((m) => `${m.name}: ${m.text}`).join("\n");
  const res = await sparkJSON<{ replies: FriendReply[] }>(
    [
      { role: "system", content: system },
      { role: "user", content: `Chat so far (latest last):\n${chat}\n\nHow do the friends reply?` },
    ],
    {
      name: "friend_replies",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["replies"],
        properties: {
          replies: {
            type: "array",
            maxItems: MAX_REPLIES,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["friend", "text"],
              properties: { friend: { type: "string", enum: ids }, text: { type: "string" } },
            },
          },
        },
      },
    },
    { reasoningEffort: "minimal", maxTokens: 2000, op: "friends.reply", ledger: opts.ledger },
  );
  return validateReplies(res.data, ids, history.at(-1)!.text);
}
