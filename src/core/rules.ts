// Deterministic rule table for live messages (0 ms, no model) and the shared direction vocabulary.
// Kept free of any model client so it can ship to the browser.

export const EMOTIONS = ["neutral", "happy", "surprised", "angry", "sad", "laughing"] as const;
export const GESTURES = ["none", "lean_in", "step_back", "shake", "nod"] as const;
export const CAMERAS = ["room", "close"] as const;
/** Listener poses: any emotion, or "away" (dozing: not following the conversation). */
export const POSES = [...EMOTIONS, "away"] as const;
export const LOOKS = ["speaker", "camera", "down"] as const;
export type Emotion = (typeof EMOTIONS)[number];
export type Gesture = (typeof GESTURES)[number];
export type Camera = (typeof CAMERAS)[number];
export type Pose = (typeof POSES)[number];
export type Look = (typeof LOOKS)[number];

export interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name?: string;
  text: string;
}

/** Who is in the room. `present` = connected right now (absent members doze unless something wakes them). */
export interface RosterMember {
  member_id: string;
  name: string;
  present: boolean;
}

export interface Reaction {
  member_id: string;
  pose: Pose;
  look: Look;
}

export interface Direction {
  message_id: string;
  /** who the speaker is talking to: a member_id (you included), or "all" for the whole table */
  to?: string;
  emotion: Emotion;
  gesture: Gesture;
  camera: Camera;
  pause_ms: number;
  reactions?: Reaction[];
}

export interface ValidationError {
  code: "D1" | "D2" | "D3" | "D4" | "D5" | "SCHEMA";
  message_id?: string;
  message: string;
  fix_hint: string;
}

const mentions = (text: string, name: string) => name.length >= 2 && new RegExp(`(^|[^\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "iu").test(text);

/** Said to someone by name: "Jay, …", "…, Jay?", "@Jay", "민아야" (a name only mentioned, as in "don't tell Jay", is not). */
const addressed = (text: string, name: string) => {
  if (name.length < 2) return false;
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*@?${n}(?![\\p{L}])\\s*[,!?:~]|^\\s*@?${n}\\s*$|[,，]\\s*${n}\\s*[?!.~]*\\s*$|@${n}(?![\\p{L}])|${n}(아|야)(?![\\p{L}])`, "iu").test(text);
};

// ───────────────────────── rule table (live path, 0 ms, no model) ─────────────────────────

/**
 * Who a line is said to, without a model: someone it calls by name; else whoever spoke just before (a group chat
 * mostly answers the line above); a second line in a row goes to the same person as the first; else the whole table.
 */
export function ruleAddressee(m: ChatMessage, roster: RosterMember[], prev?: { sender_id: string; to?: string } | null): string {
  const named = roster.find((r) => r.member_id !== m.sender_id && addressed(m.text, r.name));
  if (named) return named.member_id;
  if (prev && prev.sender_id !== m.sender_id) return prev.sender_id;
  if (prev && prev.sender_id === m.sender_id && prev.to) return prev.to;
  return "all";
}

export function ruleDirection(m: ChatMessage, roster: RosterMember[] = [], prev?: { sender_id: string; to?: string } | null): Direction {
  const t = m.text.trim();
  const letters = t.replace(/[^A-Za-z]/g, "");
  const upperRatio = letters.length >= 4 ? letters.replace(/[^A-Z]/g, "").length / letters.length : 0;
  let emotion: Emotion = "neutral";
  let gesture: Gesture = "none";
  const shoutedWords = (t.match(/\b[A-Z]{2,}\b/g) ?? []).filter((w) => w !== "OK" && w !== "PM" && w !== "AM").length;
  if (/(ㅋㅋ|lol|lmao|😂|🤣|haha)/i.test(t)) emotion = "laughing";
  else if (upperRatio >= 0.6 || shoutedWords >= 2 || /!!!|😡|🤬/.test(t)) emotion = "angry";
  else if (/!!|!\?|\?!|😮|😱/.test(t)) emotion = "surprised";
  else if (/\.\.\.|…|ㅠ|ㅜ|😢|😭/.test(t)) emotion = "sad";
  else if (/(ㅎㅎ|😊|❤️|🥰|🎂|🎉)/.test(t)) emotion = "happy";
  if (/\?\s*$/.test(t)) gesture = "lean_in";
  else if (emotion === "angry") gesture = "shake";
  else if (emotion === "laughing") gesture = "nod";
  const punct = (t.match(/[.!?…,]/g) ?? []).length;
  const pause_ms = Math.min(1200, 300 + 150 * punct);
  // Listeners: present ones look at the speaker; absent ones keep dozing unless they are named.
  const reactions: Reaction[] = roster
    .filter((r) => r.member_id !== m.sender_id)
    .map((r) => {
      const named = mentions(t, r.name);
      if (!r.present && !named) return { member_id: r.member_id, pose: "away" as const, look: "down" as const };
      return { member_id: r.member_id, pose: named ? ("surprised" as const) : emotion === "laughing" ? ("happy" as const) : ("neutral" as const), look: "speaker" as const };
    });
  const to = roster.length ? ruleAddressee(m, roster, prev) : "all";
  return { message_id: m.id, to, emotion, gesture, camera: emotion === "surprised" || emotion === "angry" ? "close" : "room", pause_ms, reactions };
}

export function ruleDirections(messages: ChatMessage[], roster: RosterMember[] = []): Direction[] {
  const out: Direction[] = [];
  messages.forEach((m, i) => out.push(ruleDirection(m, roster, i ? { sender_id: messages[i - 1].sender_id, to: out[i - 1].to } : null)));
  return out;
}
