import { describe, it, expect } from "vitest";
import { koSino, koNative, enNumber, spokenVariants } from "../src/core/numbers";
describe("number reading", () => {
  it("reads Korean numbers", () => {
    expect(koSino(7)).toBe("칠");
    expect(koSino(23)).toBe("이십삼");
    expect(koSino(105)).toBe("백오");
    expect(koSino(2026)).toBe("이천이십육");
    expect(koNative(7)).toBe("일곱");
    expect(koNative(1)).toBe("한");
    expect(koNative(20)).toBe("스무");
  });
  it("reads English numbers", () => {
    expect(enNumber(7)).toBe("seven");
    expect(enNumber(42)).toBe("forty two");
    expect(enNumber(2026)).toBe("two thousand twenty six");
  });
  it("builds spoken variants only when digits exist", () => {
    expect(spokenVariants("hello")).toEqual([]);
    expect(spokenVariants("7시").some((v) => v.includes("일곱"))).toBe(true);
    expect(spokenVariants("7월").some((v) => v.includes("칠"))).toBe(true);
  });
});
