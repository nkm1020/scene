// Seed room "wrong chat" (PLAN 8.2). Sam is the enrolled user; Mina and Jay are presets.
import type { ChatMessage } from "./director";
import type { PersonaSpec } from "./persona";

export const SEED_MEMBERS: (PersonaSpec & { id: string; preset: string })[] = [
  { id: "sam", name: "Sam", hair: "short messy black hair", outfit: "an oversized green hoodie", vibe: "cheerful", preset: "male" },
  { id: "mina", name: "Mina", hair: "long wavy brown hair with bangs", outfit: "a yellow cardigan", vibe: "playful", preset: "female_a" },
  { id: "jay", name: "Jay", hair: "short bleached blond hair", outfit: "a denim jacket", vibe: "smug", preset: "female_b" },
];

const raw: [string, string][] = [
  ["sam", "ok Friday 7pm. everyone hide in the kitchen"],
  ["mina", "I'll bring the cake 🎂"],
  ["sam", "DO NOT tell Jay"],
  ["jay", "tell me what"],
  ["mina", "..."],
  ["sam", "wrong chat"],
  ["jay", "this is the only chat we have"],
  ["mina", "surprise?"],
  ["jay", "I'm bringing the cake"],
  ["sam", "you can't bring your own cake"],
  ["jay", "watch me"],
  ["mina", "🎂🎂🎂"],
];

export const SEED_MESSAGES: ChatMessage[] = raw.map(([sender_id, text], i) => ({
  id: `m${String(i + 1).padStart(2, "0")}`,
  sender_id,
  sender_name: SEED_MEMBERS.find((m) => m.id === sender_id)!.name,
  text,
}));

export const KOREAN_LIVE = ["야 금요일 7시 다 모여", "케이크는 누가 사?", "제이한테는 비밀"];

export const ENROLL_SENTENCES = {
  en: ["The quick brown fox jumps over the lazy dog.", "I'll meet you at the corner cafe at seven.", "Scene says what I said, and nothing else."],
  ko: ["오늘 저녁에 같이 밥 먹을래?", "금요일 일곱 시에 카페 앞에서 만나.", "내가 한 말만 내 목소리로 전해 줘."],
};
