import "dotenv/config";
import { directSegment } from "../src/core/director";
import { SEED_MESSAGES } from "../src/core/seed";
import { globalLedger } from "../src/core/ledger";
const effort = (process.argv[2] ?? "low") as any;
const run = await directSegment(SEED_MESSAGES, { ledger: globalLedger, reasoningEffort: effort });
console.log(JSON.stringify({ effort, source: run.source, attempts: run.attempts, log: run.log, flags: run.flags }));
for (const d of run.directions) console.log(d.message_id, d.emotion, d.gesture, d.camera, d.pause_ms, "|", SEED_MESSAGES.find((m) => m.id === d.message_id)!.text);
console.log(JSON.stringify(globalLedger.summary()));
