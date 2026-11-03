// Text normalization and similarity used by the round-trip and enrollment checks.
import { spokenVariants } from "./numbers";

const EMOJI = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]/gu;

/** Lowercase, NFKC, drop whitespace, punctuation and emoji. Keeps letters (any script) and digits. */
export function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(EMOJI, "")
    .replace(/\bokay\b|\bo\.k\./g, "ok") // spelling variants that sound identical
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function levenshtein(a: string, b: string): number {
  const A = [...a], B = [...b];
  if (!A.length) return B.length;
  if (!B.length) return A.length;
  let prev = Array.from({ length: B.length + 1 }, (_, j) => j);
  for (let i = 1; i <= A.length; i++) {
    const cur = [i];
    for (let j = 1; j <= B.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[B.length];
}

/**
 * Read-back score in [0,1] = 1 − character error rate against the expected text (normalized).
 * Strict on purpose: "ok so" heard as "약 그" must fail. Digits may be spoken as words, so the
 * expected text is also tried with numbers spelled out (7시 → 일곱 시, 7pm → seven pm); the best score wins.
 */
export function similarity(expected: string, heard: string): number {
  const b = normalize(heard);
  let best = 0;
  for (const candidate of [expected, ...spokenVariants(expected)]) {
    const a = normalize(candidate);
    const n = [...a].length;
    if (n === 0) return [...b].length === 0 ? 1 : 0;
    best = Math.max(best, Math.max(0, 1 - levenshtein(a, b) / n));
  }
  return best;
}

/** True when the message has nothing to speak (emoji or punctuation only). */
export function isSilent(text: string): boolean {
  return normalize(text).length === 0;
}

/** Rough language guess for TTS: Hangul present → ko, else en. */
export function guessLanguage(text: string): "ko" | "en" {
  return /[ㄱ-ㆎ가-힣]/.test(text) ? "ko" : "en";
}
