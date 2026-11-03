// End-to-end check of the web clone path with a stand-in recording (a preset voice reading the Korean enrollment
// sentences). Real users record themselves in the browser; this only exercises the server path.
import "dotenv/config";
import { ENROLL_SENTENCES } from "../src/core/seed";
const BASE = "http://localhost:3000";
const j = async (r: Response) => { const d = await r.json(); if (!r.ok) throw new Error(JSON.stringify(d)); return d; };
const { roomId } = await j(await fetch(`${BASE}/api/rooms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "clone path test" }) }));
const { member, secret } = await j(await fetch(`${BASE}/api/rooms/${roomId}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Kim", preset: "male" }) }));
console.log("room", roomId, "member", member.id);
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
// Stand-in recording: macOS "Yuna" reads the three Korean enrollment sentences.
execFileSync("say", ["-v", "Yuna", "-o", "/tmp/scene-enroll.aiff", ENROLL_SENTENCES.ko.join(" ")]);
execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", "/tmp/scene-enroll.aiff", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", "/tmp/scene-enroll.wav"]);
const wavBytes = readFileSync("/tmp/scene-enroll.wav");
const rec = { wav: wavBytes, durationMs: Math.round(((wavBytes.length - 44) / 48000) * 1000) };
console.log("stand-in recording", rec.durationMs, "ms");
const fd = new FormData();
fd.append("memberId", member.id); fd.append("secret", secret); fd.append("lang", "ko");
fd.append("audio", new Blob([new Uint8Array(rec.wav)], { type: "audio/wav" }), "enroll.wav");
const enroll = await j(await fetch(`${BASE}/api/voice`, { method: "POST", body: fd }));
console.log("enrollment", JSON.stringify(enroll));
if (!enroll.ok) process.exit(1);
const { message } = await j(await fetch(`${BASE}/api/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId: member.id, secret, text: "제이한테는 비밀" }) }));
for (let i = 0; i < 120; i++) {
  const s = await j(await fetch(`${BASE}/api/rooms/${roomId}`));
  const r = s.renders.find((x: any) => x.message_id === message.id);
  if (r && r.status !== "pending") {
    console.log("render", r.status, r.similarity, JSON.stringify((r.attempts ?? []).map((a: any) => [a.similarity, a.heard])));
    break;
  }
  await new Promise((res) => setTimeout(res, 5000));
}
const receipt = await j(await fetch(`${BASE}/api/rooms/${roomId}/receipt`));
console.log("receipt", JSON.stringify(receipt.byOp));
