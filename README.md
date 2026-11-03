> **Disclosure.** I prototyped this idea before the hackathon: *Scene* ([github.com/nkm1020/UJHS-Ambition-for-Korea](https://github.com/nkm1020/UJHS-Ambition-for-Korea), created Oct 24, 2026 — a 3D motion-engine prototype with r3f avatars and a voice-clone experiment). That repository stays public. **This repository was created on Nov 3, 2026 and reuses none of its code or assets.** Everything here — the figure pipeline (Muse Image, SAM 3.1, SAM 3D), the Spark director and its validator, the Voice Transcribe checks, the 3D table stage, the chat backend and the web app — was written Nov 3–5, 2026. What carried over is the idea: chat performed by your friends in their own voices.

# Scene: your group chat, performed

Your friends stand on the table as little clay figures. When a message arrives, its sender walks to the front and says it in their own voice; everyone else at the table reacts. Missed the chat? Press play and the table acts it out, directed by **Muse Spark**. Every spoken line is listened to by **Muse Voice Transcribe** and only plays if it matches the message: **it says what you said, nothing else.**

Theme: **Build for Your World** · Track: Indie Developer · Meta AI Developer Hackathon 2026

<!-- DEMO-LINKS -->

## Where Meta's models are the product

Turn the external voice off and Scene still works: the figures, the performance and the checks are all Meta models.

| What you see | Made by |
|---|---|
| **Your figure.** Three words become a clay figurine, then six more versions of the same figurine: happy, laughing, surprised, annoyed, sad, dozing. | **Muse Image** sculpts the figurine and edits it into each expression (same character). **SAM 3.1** masks the figurine in every image. **SAM 3D Objects** lifts each masked image into a mesh that stands on the table. |
| **The performance.** Who speaks how; who laughs, who looks down, who wakes up when their name comes up; where the camera goes; how long the pause before the punchline is. | **Muse Spark 1.3** reads the whole missed segment and directs every figure on every line, in one call. Its output has no field that can hold words. |
| **Talking.** Hold to talk; your words become the message. | **Muse Voice Transcribe**. |
| **The guarantee.** A line plays in a voice only if it says exactly the message. | **Muse Voice Transcribe** listens to every synthesized line and compares it with the message. |
| **Consent.** Only your own voice can be registered. | **Muse Voice Transcribe** checks that you read the three sentences shown. |

External pieces, each replaceable: **Qwen3-TTS** (Apache 2.0, self-hosted) speaks the lines, because Meta has no text-to-speech; **fal.ai** hosts Meta's SAM 3D Objects; **Supabase** stores rooms and syncs them.

## Try it in 60 seconds (no login)

```bash
git clone <this repo> && cd scene
cp .env.example .env          # add META_API_KEY (dev.meta.ai, Standard tier). FAL_KEY adds 3D meshes, TTS_URL adds voices.
npm install
npm test                      # validators, rule table, read-back comparator, number reading, WAV helpers: 0 API calls
npm run demo -- --voice none  # sculpt the cast → Spark directs the table → out/replay.html + out/receipt.json
```

`npm run demo` runs the pipeline on a seed group chat ("wrong chat", three friends, twelve messages; Jay is not in the room). Muse Image sculpts each friend and their six expressions, SAM 3.1 masks them, SAM 3D turns them into meshes (with `FAL_KEY`), Spark directs the table, `validate_directions` checks it, and each line is spoken and read back (with `TTS_URL`). It writes `out/replay.html` and `out/receipt.json` (every call, tokens, dollars, latency).

- `--reuse-figures` uses the committed cast in `public/seed/figures/` instead of sculpting new ones.
- `--voice none` skips speech (captions and typing sounds).
- `--inject-text` is the validator test: it puts a `text` field into Spark's first answer. The validator rejects it (D4) and Spark directs again.

Prefer not to run anything? [`examples/demo-room/replay.html`](examples/demo-room/) is the seed room exported with its voices and the record of every check.

## How it works

```
Make a figure (once per person, about a minute)
  3 words ─▶ Muse Image: clay figurine ─▶ Muse Image edits: happy, laughing, surprised, annoyed, sad, dozing
           ─▶ SAM 3.1 masks the figurine in each image ─▶ SAM 3D Objects: one mesh per expression (GLB)

Send
  hold to talk ─▶ Muse Voice Transcribe ─▶ 1.5 s preview (tap to edit) ─▶ message = text (audio discarded)

Receive (once per message, shared by the room)
  Qwen3-TTS (your registered voice or a preset) ─▶ Muse Voice Transcribe read-back ─▶ match ≥ 0.85 ? play : retry ≤ 3 ─▶ captions only
  live staging: rule table (punctuation, emoji, caps, names) ─▶ speaker's expression, listeners' reactions

Replay (missed messages)
  Muse Spark 1.3 directs the whole segment in one call: per line the speaker's expression, gesture, camera and pause,
  and each listener's reaction (expression + where they look; a dozing friend wakes when the line is about them)
  ─▶ validate_directions (D1 one per line, in order · D2 values in range · D3 budget · D4 no text anywhere · D5 reactions
     only from real listeners, once each) ─▶ up to 3 attempts with the errors fed back ─▶ else the rule table
```

### Fixed checkpoints

| Checkpoint | Where | Rule |
|---|---|---|
| The director cannot change a word | `src/core/director.ts` | The JSON schema has no text field and member ids are an enum of the room. `validate_directions` rejects extra keys anywhere (D4), missing, duplicate or reordered lines (D1), values out of range (D2), oversized segments (D3), and reactions from unknown members or from the speaker (D5). Three failures fall back to the rule table. |
| Every spoken line is read back | `src/core/voice.ts` | Synthesized audio → Voice Transcribe → score = 1 − character error rate against the message (numbers may be spoken as words) ≥ 0.85, else synthesize again (≤ 3), else captions only, flagged. |
| Only your own voice | `src/core/voice.ts` | The recording must read the three sentences shown (≥ 0.80), 6–20 s, under 40% silence. Nothing is stored before it passes. |

## Numbers

Measured on Nov 3, 2026 from the receipts. Standard tier prices.

| Step | Model | Latency | Cost |
|---|---|---|---|
| Figurine, neutral (draw + mask) | Muse Image → SAM 3.1 | 15–25 s | $0.0125 |
| Six expressions (edit + mask, in parallel, in the background) | Muse Image edits → SAM 3.1 | about 30 s | $0.075 |
| One mesh | SAM 3D Objects (fal.ai) | 5–10 s (documented) | $0.02 |
| Hold to talk → text (5 s of speech) | Voice Transcribe | 1.6–3.0 s | $0.00025 |
| Voice enrollment read-back (15 s) | Voice Transcribe | about 1.5 s | $0.00075 |
| Direct 12 lines with every listener's reaction, one call | Spark 1.3, `reasoning_effort: minimal` | about 11 s | about $0.007 |
| Read-back of one spoken line | Voice Transcribe | 1.5–2 s | about $0.0001 |

<!-- TTS-NUMBERS -->

**What Spark adds that a rule table cannot.** In the seed room Jay is not connected, so he dozes. When Sam shouts "DO NOT tell Jay", Spark wakes him up, surprised. When Mina sends "...", Sam looks down. When Jay says "this is the only chat we have", the other two look away, caught. When Jay announces he is bringing the cake, Sam is annoyed and Mina laughs.

**What the read-back check caught.** Seeding the demo room, Qwen3-TTS produced lines Scene refused to play: it invented a name before "do not tell Jay" (*"Tangira Blackford said, do not tell Jay."*), babbled in Chinese before "I'll bring the cake", and looped a 2-second line into 20 seconds. Voice Transcribe heard each one, the score fell to 0.00, and Scene synthesized again until the clip matched. An earlier, more lenient score let a garbled English line pass at 0.88 (*"약 그 So who's bringing the cake으로"*); that case is now a regression test, and preset voices are chosen per language.

## Privacy

You can only register **your own** voice, and enrollment requires reading three sentences aloud that Scene verifies. Friends who haven't registered appear as a default figure with a preset voice; Scene never builds a figure or voice of someone who didn't make it themselves. Figures come from three words, not photographs, and are always clay figurines. Messages are stored as text; your spoken audio is transcribed and discarded. Your figure and voice reference are the only media stored, and you can delete them in settings. All Meta calls use the Standard tier. Every performance carries an "AI-made" mark. Expressions and reactions are stage directions for one line, never a profile of a person.

## Web app

```bash
# needs a Supabase project: apply supabase/migrations/*.sql, then fill the SUPABASE_* keys in .env
npx tsx scripts/seed-demo.ts            # seeds the demo template room (voices if TTS_URL is set)
npx tsx scripts/update-demo-figures.ts  # attaches the seed cast and lets Spark direct the room
npm run dev                             # http://localhost:3000 → "Open the demo room" (a private copy per visitor)
```

Rooms are links. No accounts: joining creates a member with a private key kept in the browser. Presence is posture: friends who are in the room stand awake; friends who are away doze, and wake only for the lines that concern them.

## Repository map

```
src/core/      meta.ts (Meta Model API) · figure.ts (figure pipeline) · sam3d.ts (SAM 3D Objects) · director.ts + rules.ts
               (Spark director, validator, rule table) · voice.ts (checks) · tts.ts · wav.ts · numbers.ts · ledger.ts (receipt)
src/stage3d/   engine.ts (three.js table stage) · replay-entry.ts (self-contained replay.html)
src/server/    Supabase access, rendering, figures, quotas, demo-room fork
src/client/    RoomApp.tsx (join, figure, voice, room, hold to talk, replay, settings) · HeroStage.tsx
app/           Next.js pages and API routes
tts/           Qwen3-TTS service (Modal + local) with one HTTP contract
scripts/       demo.ts · make-seed-figures.ts · seed-demo.ts · update-demo-figures.ts · export-room.ts
test/          unit tests (no network)
```

## License

MIT for this repository. Qwen3-TTS is Apache 2.0. Meta models are used under Meta's terms (Model API; SAM License for SAM 3D Objects).
