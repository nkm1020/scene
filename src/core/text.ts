// Text normalization and similarity used by the round-trip and enrollment checks.

const EMOJI = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]/gu;

/** Lowercase, NFKC, drop whitespace, punctuation and emoji. Keeps letters (any script) and digits. */
export function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(EMOJI, "")
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

/** Similarity in [0,1] on normalized text: (|a|+|b|-dist)/(|a|+|b|). 1 = identical. */
export function similarity(expected: string, heard: string): number {
  const a = normalize(expected), b = normalize(heard);
  const total = [...a].length + [...b].length;
  if (total === 0) return 1;
  return (total - levenshtein(a, b)) / total;
}

/** True when the message has nothing to speak (emoji or punctuation only). */
export function isSilent(text: string): boolean {
  return normalize(text).length === 0;
}

/** Rough language guess for TTS: Hangul present → ko, else en. */
export function guessLanguage(text: string): "ko" | "en" {
  return /[ㄱ-ㆎ가-힣]/.test(text) ? "ko" : "en";
}
