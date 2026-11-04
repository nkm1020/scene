import { describe, it, expect } from "vitest";
import { validateSummary } from "../src/core/summary";

const msgs = [{ text: "DO NOT tell Jay" }, { text: "I'm bringing the cake" }, { text: "watch me" }];

describe("validateSummary (Spark's catch-up after a replay)", () => {
  it("passes a short summary with an exact quote", () => {
    const r = validateSummary({ headline: "Jay found out about his own party", points: ['Sam said "DO NOT tell Jay" in the wrong chat', "Jay says he is bringing the cake"] }, msgs);
    expect(r.ok).toBe(true);
  });
  it("rejects a quote nobody sent", () => {
    const r = validateSummary({ headline: "Party plans", points: ['Mina said "I hate cake"'] }, msgs);
    expect(r.errors.some((e) => e.startsWith("U4"))).toBe(true);
  });
  it("rejects extra keys, links, too many points and long lines", () => {
    const r = validateSummary({ headline: "x".repeat(81), points: ["a", "b", "c", "see https://x.y"], mood: "fun" }, msgs);
    const codes = r.errors.map((e) => e.slice(0, 2));
    expect(codes).toEqual(expect.arrayContaining(["U1", "U2", "U3"]));
  });
});
