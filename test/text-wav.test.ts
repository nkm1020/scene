import { describe, it, expect } from "vitest";
import { similarity, normalize, isSilent, guessLanguage } from "../src/core/text";
import { encodeWav, decodeWav, resample, silenceRatio, toVtWav, rmsEnvelope } from "../src/core/wav";

describe("read-back comparison", () => {
  it("ignores case, spacing, punctuation and emoji", () => {
    expect(normalize("OK, Friday 7pm! 🎂")).toBe("okfriday7pm");
    expect(similarity("ok Friday 7pm. everyone hide in the kitchen", "okay Friday 7 PM everyone hide in the kitchen.")).toBeGreaterThan(0.85);
  });
  it("passes Korean read-backs with number words and fails different sentences", () => {
    expect(similarity("야 금요일 7시 다 모여", "야 금요일 일곱 시 다 모여")).toBeGreaterThan(0.85);
    expect(similarity("야 금요일 7시 다 모여", "야 금요일 7시 다 모여")).toBe(1);
    expect(similarity("7월에 보자", "칠월에 보자")).toBeGreaterThan(0.85);
    expect(similarity("ok Friday 7pm", "okay Friday seven PM")).toBeGreaterThan(0.85);
    expect(similarity("제이한테는 비밀", "제이한테 다 말해")).toBeLessThan(0.85);
    expect(similarity("wrong chat", "this is the only chat we have")).toBeLessThan(0.6);
  });
  it("fails garbled read-backs (accented preset reading English)", () => {
    // Real case from Nov 3: a Korean-native preset read an English line; Voice Transcribe code-switched.
    expect(similarity("ok so who is bringing the cake lol", "약 그 So who's bringing the cake으로..")).toBeLessThan(0.85);
    expect(similarity("ok so who is bringing the cake lol", "ok so who's bringing the cake lol")).toBeGreaterThan(0.85);
  });
  it("documents a known limit: a one-letter negation can pass", () => {
    expect(similarity("you can't bring your own cake", "you can bring your own cake")).toBeGreaterThan(0.85);
  });
  it("detects emoji-only messages and language", () => {
    expect(isSilent("🎂🎂🎂")).toBe(true);
    expect(isSilent("...")).toBe(true);
    expect(isSilent("hi")).toBe(false);
    expect(guessLanguage("케이크는 누가 사?")).toBe("ko");
    expect(guessLanguage("watch me")).toBe("en");
  });
});

describe("wav helpers", () => {
  const tone = (rate: number, ms: number, amp = 0.5) => {
    const n = Math.round((rate * ms) / 1000);
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) s[i] = amp * Math.sin((2 * Math.PI * 440 * i) / rate);
    return { sampleRate: rate, samples: s };
  };
  it("round-trips encode/decode and resamples to 24 kHz", () => {
    const wav = encodeWav(tone(44100, 500));
    const back = decodeWav(wav);
    expect(back.sampleRate).toBe(44100);
    const { durationMs, pcm } = toVtWav(wav);
    expect(pcm.sampleRate).toBe(24000);
    expect(Math.abs(durationMs - 500)).toBeLessThan(5);
    expect(resample(back, 16000).samples.length).toBe(8000);
  });
  it("measures silence and builds an envelope", () => {
    const quiet = { sampleRate: 24000, samples: new Float32Array(24000) };
    expect(silenceRatio(quiet)).toBe(1);
    expect(silenceRatio(tone(24000, 1000))).toBe(0);
    const env = rmsEnvelope(tone(24000, 1000), 30);
    expect(env.length).toBe(30);
    expect(Math.max(...env)).toBe(1);
  });
});
