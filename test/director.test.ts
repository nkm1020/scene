import { describe, it, expect } from "vitest";
import { validateDirections, ruleDirection, ruleDirections, directSegment, MAX_SEGMENT } from "../src/core/director";
import { SEED_MESSAGES } from "../src/core/seed";

const msgs = SEED_MESSAGES.slice(0, 3);
const good = () => ({
  directions: msgs.map((m) => ({ message_id: m.id, emotion: "neutral", gesture: "none", camera: "room", pause_ms: 300 })),
});

describe("validate_directions", () => {
  it("accepts one valid direction per message in order", () => {
    const v = validateDirections(msgs, good());
    expect(v.ok).toBe(true);
    expect(v.directions).toHaveLength(3);
  });
  it("D4: rejects any text channel", () => {
    const out: any = good();
    out.directions[1].text = "I never said that";
    const v = validateDirections(msgs, out);
    expect(v.ok).toBe(false);
    expect(v.errors.map((e) => e.code)).toContain("D4");
    expect(v.directions).toHaveLength(0);
  });
  it("D4: rejects extra top-level keys", () => {
    const v = validateDirections(msgs, { ...good(), summary: "they planned a party" });
    expect(v.errors.some((e) => e.code === "D4")).toBe(true);
  });
  it("D1: rejects missing, duplicate, unknown and reordered ids", () => {
    const missing: any = good();
    missing.directions.pop();
    expect(validateDirections(msgs, missing).errors.some((e) => e.code === "D1")).toBe(true);
    const dup: any = good();
    dup.directions[2] = { ...dup.directions[0] };
    expect(validateDirections(msgs, dup).errors.some((e) => e.code === "D1")).toBe(true);
    const unknown: any = good();
    unknown.directions[0].message_id = "m99";
    expect(validateDirections(msgs, unknown).errors.some((e) => e.code === "D1")).toBe(true);
    const swapped: any = good();
    swapped.directions.reverse();
    expect(validateDirections(msgs, swapped).errors.some((e) => e.message.includes("order"))).toBe(true);
  });
  it("D2: rejects values outside the enums and ranges", () => {
    const out: any = good();
    out.directions[0].emotion = "furious";
    out.directions[1].pause_ms = 5000;
    out.directions[2].camera = "drone";
    const codes = validateDirections(msgs, out).errors.map((e) => e.code);
    expect(codes.filter((c) => c === "D2")).toHaveLength(3);
  });
  it("D3: flags oversized segments", () => {
    const many = Array.from({ length: MAX_SEGMENT + 1 }, (_, i) => ({ id: `x${i}`, sender_id: "a", text: "hi" }));
    const out = { directions: many.map((m) => ({ message_id: m.id, emotion: "neutral", gesture: "none", camera: "room", pause_ms: 0 })) };
    expect(validateDirections(many, out).errors.some((e) => e.code === "D3")).toBe(true);
  });
  it("rejects non-object output", () => {
    expect(validateDirections(msgs, null).ok).toBe(false);
    expect(validateDirections(msgs, { directions: "nope" }).ok).toBe(false);
  });
});

describe("rule table (live path)", () => {
  it("maps punctuation and emoji to emotions", () => {
    const d = (text: string) => ruleDirection({ id: "x", sender_id: "a", text });
    expect(d("DO NOT tell Jay").emotion).toBe("angry");
    expect(d("ㅋㅋㅋㅋ").emotion).toBe("laughing");
    expect(d("lol").emotion).toBe("laughing");
    expect(d("...").emotion).toBe("sad");
    expect(d("what?!").emotion).toBe("surprised");
    expect(d("I'll bring the cake 🎂").emotion).toBe("happy");
    expect(d("surprise?").gesture).toBe("lean_in");
    expect(d("ok").emotion).toBe("neutral");
  });
  it("keeps pauses within 300..1200 ms and always validates", () => {
    const dirs = ruleDirections(SEED_MESSAGES);
    for (const x of dirs) expect(x.pause_ms).toBeGreaterThanOrEqual(300), expect(x.pause_ms).toBeLessThanOrEqual(1200);
    expect(validateDirections(SEED_MESSAGES, { directions: dirs }).ok).toBe(true);
  });
});

describe("director fallback", () => {
  it("falls back to the rule table after 3 invalid outputs (no network: tamper every attempt)", async () => {
    // directSegment calls Spark; without a key the call throws, which also counts as a failed attempt.
    const prev = process.env.META_API_KEY;
    delete process.env.META_API_KEY;
    const run = await directSegment(msgs, {});
    process.env.META_API_KEY = prev;
    expect(run.source).toBe("rules");
    expect(run.flags).toContain("director_fallback");
    expect(run.log).toHaveLength(3);
    expect(validateDirections(msgs, { directions: run.directions }).ok).toBe(true);
  });
});
