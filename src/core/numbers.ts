// Spell out digits the way a voice would read them, so "7시" can match "일곱 시" and "7pm" can match "seven pm".
// Used only to build an alternative expected text for the read-back comparison (the message itself never changes).

const EN_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

export function enNumber(n: number): string {
  if (n < 20) return EN_ONES[n];
  if (n < 100) return EN_TENS[Math.floor(n / 10)] + (n % 10 ? " " + EN_ONES[n % 10] : "");
  if (n < 1000) return EN_ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + enNumber(n % 100) : "");
  if (n < 1_000_000) return enNumber(Math.floor(n / 1000)) + " thousand" + (n % 1000 ? " " + enNumber(n % 1000) : "");
  return String(n);
}

const KO_DIGIT = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
/** Sino-Korean reading (칠, 이십삼, 백오). */
export function koSino(n: number): string {
  if (n === 0) return "영";
  const units = ["", "십", "백", "천"];
  let out = "";
  const big = [[100_000_000, "억"], [10_000, "만"]] as const;
  for (const [v, name] of big) {
    if (n >= v) {
      out += koSino(Math.floor(n / v)) + name;
      n %= v;
    }
  }
  const digits = String(n).padStart(4, "0").split("").map(Number);
  digits.forEach((d, i) => {
    const u = units[3 - i];
    if (!d) return;
    out += (d === 1 && u ? "" : KO_DIGIT[d]) + u;
  });
  return out;
}

const KO_NATIVE_ONES = ["", "하나", "둘", "셋", "넷", "다섯", "여섯", "일곱", "여덟", "아홉"];
const KO_NATIVE_ONES_ADN = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉"];
const KO_NATIVE_TENS = ["", "열", "스물", "서른", "마흔", "쉰", "예순", "일흔", "여든", "아흔"];
/** Native Korean reading before counters (한 시, 일곱 시, 두 개, 스무 살). */
export function koNative(n: number): string | null {
  if (n < 1 || n > 99) return null;
  const t = Math.floor(n / 10), o = n % 10;
  if (n === 20) return "스무";
  return KO_NATIVE_TENS[t] + KO_NATIVE_ONES_ADN[o];
}

const NATIVE_COUNTERS = /^(시|개|명|살|번째|번|마리|잔|병|권|장|달)/;

/** All plausible spoken forms of the text with digits spelled out (Korean native/Sino, English). */
export function spokenVariants(text: string): string[] {
  if (!/\d/.test(text)) return [];
  const out = new Set<string>();
  // English
  out.add(text.replace(/\d+/g, (d) => " " + enNumber(Number(d)) + " "));
  // Korean: native before counters, Sino elsewhere
  out.add(
    text.replace(/\d+/g, (d, offset: number, whole: string) => {
      const n = Number(d);
      const after = whole.slice(offset + d.length);
      const native = NATIVE_COUNTERS.test(after.trimStart()) ? koNative(n) : null;
      return native ?? koSino(n);
    }),
  );
  out.add(text.replace(/\d+/g, (d) => koSino(Number(d))));
  return [...out];
}
