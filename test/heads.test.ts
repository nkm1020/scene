import { describe, it, expect } from "vitest";
import { solidHead } from "../src/core/heads";

describe("replacement heads", () => {
  it("makes hair and face one solid head: gaps closed, holes filled, specks dropped", () => {
    const w = 60, h = 60;
    const m = new Uint8Array(w * h);
    const disc = (cx: number, cy: number, r: number, v: number) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) m[y * w + x] = v;
    };
    disc(30, 30, 20, 255); // the head
    disc(30, 30, 6, 0); // a hole where SAM missed an eye
    m[2 * w + 2] = 255; // a speck far away
    const out = solidHead(m, w, h, 2);
    expect(out[30 * w + 30]).toBe(255);
    expect(out[2 * w + 2]).toBe(0);
    expect(out[30 * w + 5]).toBe(0);
  });
});
