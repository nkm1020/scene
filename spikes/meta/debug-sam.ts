import "dotenv/config";
import { readFileSync } from "node:fs";
import sharp from "sharp";
const img = readFileSync("spikes/meta/Sam-source.png");
const m = await sharp(img).metadata();
console.log("source", m.width, m.height, m.format);
const res = await fetch("https://api.meta.ai/v1/responses", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.META_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "sam-3.1", input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "person" }, { type: "input_image", image_url: `data:image/png;base64,${img.toString("base64")}` }] }] }),
});
const j: any = await res.json();
const txt = JSON.stringify(j);
const out = j.output?.flatMap((o: any) => o.content ?? []).map((c: any) => c.text).join("") ?? "";
console.log(res.status, out.replace(/data=([0-9]+,[0-9]+,.)[^|]*/g, "data=$1…").slice(0, 600));
console.log(Object.keys(j), j.usage);
