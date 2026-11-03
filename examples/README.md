# Examples (no setup needed)

- `demo-room/replay.html` — the seed group chat ("wrong chat", 3 friends, 12 messages) exported from the demo room: personas and their away poses (Muse Image + SAM 3.1), Spark 1.3 directions, and every spoken line that passed the Voice Transcribe read-back check, all inline. Open it in any browser; no network needed. Add `?glasses` for the display-lens view.
- `demo-room/receipt.json` — per message: the direction, every synthesis attempt with what Voice Transcribe heard and its score, and the cost ledger.

Regenerate with `npx tsx scripts/export-room.ts demo-template examples/demo-room` (needs the Supabase keys), or run the whole pipeline yourself with `npm run demo`.
