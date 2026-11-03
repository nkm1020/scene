// Build out/stage-preview.html from seed personas + rule-table directions (no API calls).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { buildReplayHtml, dataUrl } from "../src/core/export";
import { SEED_MEMBERS, SEED_MESSAGES } from "../src/core/seed";
import { ruleDirections } from "../src/core/director";
import { isSilent } from "../src/core/text";
const members = SEED_MEMBERS.map((m, i) => ({ id: m.id, name: m.name, personaUrl: dataUrl(readFileSync(`public/seed/${m.id}.webp`), "image/webp"), awayUrl: dataUrl(readFileSync(`public/seed/${m.id}-away.webp`), "image/webp"), present: i !== 2 }));
const dirs = ruleDirections(SEED_MESSAGES);
const items = SEED_MESSAGES.map((m, i) => ({ messageId: m.id, memberId: m.sender_id, text: m.text, ...dirs[i], pauseMs: dirs[i].pause_ms, status: isSilent(m.text) ? ("silent" as const) : ("captions_only" as const), flags: ["voice_disabled"] }));
mkdirSync("out", { recursive: true });
writeFileSync("out/stage-preview.html", await buildReplayHtml({ room: "wrong chat", members, items: items as any, director: { source: "rules", attempts: 0, log: [], flags: ["preview"] }, receipt: null }));
console.log("ok out/stage-preview.html");
