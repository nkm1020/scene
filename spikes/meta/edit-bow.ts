import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { segment } from "../../src/core/meta";
import { unionAlpha, applyAlpha } from "../../src/core/persona";
const name = process.argv[2] ?? "Sam";
const src = readFileSync(`spikes/meta/${name}-source.png`);
const t0 = Date.now();
const res = await fetch("https://api.meta.ai/v1/images/edits", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.META_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "muse-image-1.0",
    prompt: "Same character, same art style, same outfit, same framing and plain light gray background. Only change the pose: head bowed forward and tilted down toward the table, eyes closed, dozing. Keep the thick outline and flat cel shading.",
    images: [{ image_url: `data:image/png;base64,${src.toString("base64")}` }],
    output_format: "png",
  }),
});
const j: any = await res.json();
console.log(res.status, Date.now() - t0, "ms", j.error ?? "", j.usage ?? "");
if (!res.ok) process.exit(1);
const img = Buffer.from(j.data[0].b64_json, "base64");
writeFileSync(`spikes/meta/${name}-bow-source.png`, img);
const { width: W, height: H } = await sharp(img).metadata();
const seg = await segment(img, "image/png", "person");
const out = await applyAlpha(img, await unionAlpha(seg.masks, W!, H!), W!, H!);
writeFileSync(`spikes/meta/${name}-bow.png`, out.png!);
console.log("bow", W, H, "coverage", out.coverage.toFixed(3), "total", Date.now() - t0, "ms");
