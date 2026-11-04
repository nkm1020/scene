import { describe, it, expect } from "vitest";
import { validateDirections, ruleDirection, ruleDirections, ruleAddressee, directSegment, MAX_SEGMENT } from "../src/core/director";
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

describe("reactions (D5)", () => {
  const roster = [
    { member_id: "sam", name: "Sam", present: true },
    { member_id: "mina", name: "Mina", present: true },
    { member_id: "jay", name: "Jay", present: false },
  ];
  const three = SEED_MESSAGES.slice(0, 3); // sam, mina, sam
  const base = () => ({
    directions: three.map((m) => ({
      message_id: m.id,
      emotion: "neutral",
      gesture: "none",
      camera: "room",
      pause_ms: 300,
      reactions: roster.filter((r) => r.member_id !== m.sender_id).map((r) => ({ member_id: r.member_id, pose: "neutral", look: "speaker" })),
    })),
  });
  it("accepts reactions from listeners", () => {
    expect(validateDirections(three, base(), roster).ok).toBe(true);
  });
  it("rejects the speaker reacting, unknown members, duplicates, bad poses and text in reactions", () => {
    const o: any = base();
    o.directions[0].reactions.push({ member_id: "sam", pose: "happy", look: "camera" });
    o.directions[1].reactions.push({ member_id: "ghost", pose: "happy", look: "camera" });
    o.directions[2].reactions[0].pose = "dancing";
    o.directions[2].reactions[1].text = "Jay says hi";
    const codes = validateDirections(three, o, roster).errors.map((e) => e.code);
    expect(codes.filter((c) => c === "D5").length).toBeGreaterThanOrEqual(3);
    expect(codes).toContain("D4");
  });
  it("rule table: absent members doze unless named", () => {
    const d = ruleDirection({ id: "x", sender_id: "sam", text: "DO NOT tell Jay" }, roster);
    expect(d.reactions?.find((r) => r.member_id === "jay")).toEqual({ member_id: "jay", pose: "surprised", look: "speaker" });
    const d2 = ruleDirection({ id: "y", sender_id: "sam", text: "everyone hide in the kitchen" }, roster);
    expect(d2.reactions?.find((r) => r.member_id === "jay")?.pose).toBe("away");
    expect(d2.reactions?.find((r) => r.member_id === "mina")?.look).toBe("speaker");
  });
});

describe("who a line is said to (to)", () => {
  const roster = [
    { member_id: "sam", name: "Sam", present: true },
    { member_id: "mina", name: "Mina", present: true },
    { member_id: "jay", name: "Jay", present: false },
  ];
  const three = SEED_MESSAGES.slice(0, 3);
  const dirs = (to: (string | undefined)[]) => ({
    directions: three.map((m, i) => ({ message_id: m.id, ...(to[i] === undefined ? {} : { to: to[i] }), emotion: "neutral", gesture: "none", camera: "room", pause_ms: 300 })),
  });
  it("accepts the whole table or someone else at it", () => {
    expect(validateDirections(three, dirs(["all", "sam", "mina"]), roster).ok).toBe(true);
  });
  it("D2: rejects talking to yourself or to someone not at the table", () => {
    const errs = validateDirections(three, dirs(["sam", "ghost", "all"]), roster).errors;
    expect(errs.filter((e) => e.code === "D2").length).toBe(2);
  });
  it("rule table: called by name, else whoever spoke before, else everyone", () => {
    expect(ruleAddressee({ id: "a", sender_id: "sam", text: "Jay, you coming?" }, roster, null)).toBe("jay");
    expect(ruleAddressee({ id: "b", sender_id: "sam", text: "you coming, Mina?" }, roster, { sender_id: "jay" })).toBe("mina");
    expect(ruleAddressee({ id: "c", sender_id: "sam", text: "DO NOT tell Jay" }, roster, { sender_id: "mina" })).toBe("mina");
    expect(ruleAddressee({ id: "d", sender_id: "sam", text: "and bring candles" }, roster, { sender_id: "sam", to: "jay" })).toBe("jay");
    expect(ruleAddressee({ id: "e", sender_id: "sam", text: "hi all" }, roster, null)).toBe("all");
    const seq = ruleDirections(SEED_MESSAGES, roster).map((d) => d.to);
    expect(seq.slice(0, 4)).toEqual(["all", "sam", "mina", "sam"]);
    expect(validateDirections(SEED_MESSAGES, { directions: ruleDirections(SEED_MESSAGES, roster) }, roster).ok).toBe(true);
  });
});
