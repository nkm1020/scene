import { describe, expect, it } from "vitest";
import { validateReplies } from "../src/core/friends";

describe("validateReplies (demo friends)", () => {
  const present = ["sam", "mina"];
  it("keeps short lines from present friends, at most two, one each", () => {
    const r = validateReplies({ replies: [{ friend: "sam", text: " ok  7pm " }, { friend: "sam", text: "again" }, { friend: "mina", text: "🎂" }, { friend: "mina", text: "x" }] }, present, "hi");
    expect(r).toEqual([{ friend: "sam", text: "ok 7pm" }, { friend: "mina", text: "🎂" }]);
  });
  it("drops absent friends, links, overlong lines and echoes", () => {
    const long = "a".repeat(161);
    const r = validateReplies({ replies: [{ friend: "jay", text: "zzz" }, { friend: "sam", text: "see https://x.y" }, { friend: "mina", text: long }, { friend: "sam", text: "HI" }] }, present, "hi");
    expect(r).toEqual([]);
  });
  it("treats malformed output as no replies", () => {
    expect(validateReplies(null, present, "hi")).toEqual([]);
    expect(validateReplies({ replies: "nope" }, present, "hi")).toEqual([]);
  });
});
