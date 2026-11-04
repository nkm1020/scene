import { describe, it, expect } from "vitest";
import { validateSetSpec, setPartPrompt, SET_THEMES } from "../src/core/sets";

const ok = { place: "a beach hut at sunset", wall: "pale blue painted planks", front: "a round window showing the sea", left: "a shelf of shells", right: "a hanging lantern", back: "a wooden door", floor: "sandy wooden boards", tabletop: "a round driftwood tabletop" };

describe("validateSetSpec (said rooms: the plan Spark returns before Muse Image draws anything)", () => {
  it("passes a plain spec", () => {
    const r = validateSetSpec(ok);
    expect(r.ok).toBe(true);
    expect(r.spec?.place).toBe("a beach hut at sunset");
  });
  it("rejects extra keys and missing fields", () => {
    const r = validateSetSpec({ ...ok, text: "hello", floor: undefined });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/S1 unexpected key "text"/);
    expect(r.errors.join(" ")).toMatch(/S1 "floor" is missing/);
  });
  it("rejects people and writing on the walls", () => {
    const r = validateSetSpec({ ...ok, front: "a poster with words on it", left: "a portrait of a woman" });
    expect(r.ok).toBe(false);
    expect(r.errors.filter((e) => e.startsWith("S3"))).toHaveLength(2);
  });
  it("rejects overlong and non-English fields", () => {
    const r = validateSetSpec({ ...ok, wall: "x".repeat(221), floor: "나무 바닥" });
    expect(r.errors.some((e) => e.startsWith("S2"))).toBe(true);
    expect(r.errors.some((e) => e.startsWith("S4"))).toBe(true);
  });
  it("ready-made themes pass their own check and make six prompts", () => {
    for (const t of Object.values(SET_THEMES)) expect(validateSetSpec(t.spec).ok).toBe(true);
    expect(setPartPrompt(SET_THEMES.cafe.spec, "wall-left").size).toBe("2048x1024");
    expect(setPartPrompt(SET_THEMES.cafe.spec, "floor").prompt).toMatch(/checkerboard/);
  });
});
