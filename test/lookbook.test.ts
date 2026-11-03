import { describe, expect, it } from "vitest";
import { LOOKBOOK, validateSaid } from "../src/core/lookbook";

describe("lookbook", () => {
  it("has six options for each part", () => {
    for (const part of ["hair", "outfit", "extra"]) expect(LOOKBOOK.filter((o) => o.part === part)).toHaveLength(6);
  });
  it("validateSaid keeps one short plain change", () => {
    expect(validateSaid({ part: "extra", change: " add a red knit  beanie ", overFace: "hat" })).toEqual({ part: "extra", change: "add a red knit beanie", overFace: "hat" });
    expect(validateSaid({ part: "hair", change: "the hair is curly and green", overFace: null })).toEqual({ part: "hair", change: "the hair is curly and green", overFace: null });
  });
  it("validateSaid refuses refusals, brands, text and junk", () => {
    expect(validateSaid({ part: "none", change: "x", overFace: null })).toBeNull();
    expect(validateSaid({ part: "outfit", change: "the top is a hoodie with a Nike logo", overFace: null })).toBeNull();
    expect(validateSaid({ part: "outfit", change: "the top says hello in big letters", overFace: null })).toBeNull();
    expect(validateSaid({ part: "hair", change: "a".repeat(120), overFace: null })).toBeNull();
    expect(validateSaid(null)).toBeNull();
  });
});
