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

// ───────────────────────── rule table (live path, 0 ms, no model) ─────────────────────────

export function ruleDirection(m: ChatMessage, roster: RosterMember[] = []): Direction {
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
  return { message_id: m.id, emotion, gesture, camera: emotion === "surprised" || emotion === "angry" ? "close" : "room", pause_ms, reactions };
}

export function ruleDirections(messages: ChatMessage[], roster: RosterMember[] = []): Direction[] {
  return messages.map((m) => ruleDirection(m, roster));
}
