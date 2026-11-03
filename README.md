> **Disclosure.** I prototyped this idea before the hackathon: *Scene* ([github.com/nkm1020/UJHS-Ambition-for-Korea](https://github.com/nkm1020/UJHS-Ambition-for-Korea), created Oct 24, 2026 — a 3D motion-engine prototype with r3f avatars and a voice-clone experiment). That repository stays public. **This repository was created on Nov 3, 2026 and reuses none of its code or assets.** Everything here — the persona pipeline (Muse Image + SAM 3.1), the Voice Transcribe enrollment and read-back checks, the Spark replay director and its validator, the hologram stage, the chat backend and the web app — was written Nov 3–5, 2026. What carried over is the idea: chat performed by your friends' personas in their own voices.

# Scene — the next layout for chat

**Text bubbles are a layout for screens. Glasses don't have one.**

Scene is the next layout for chat. Everyone registers a persona once — three words become a stylized avatar drawn by **Muse Image** and cut out by **SAM 3.1** — and a voice from ten seconds of reading. Then you just talk. **Muse Voice Transcribe** turns your words into the message; on your friend's side, your persona appears like a hologram at the table and speaks it in your voice. Missed the group chat? Press play and the room performs it, directed by **Muse Spark 1.3**. Every synthesized line is transcribed back and checked against the message before it plays:

> **It says what you said. Nothing else.**

Theme: **Build for Your World** · Track: Indie Developer · Meta AI Developer Hackathon 2026

<!-- DEMO-LINKS -->

## Try it in 60 seconds (no login)

```bash
git clone <this repo> && cd scene
cp .env.example .env          # add META_API_KEY (dev.meta.ai, Standard tier). That's the only required key.
npm install
npm test                      # validator, rule table, read-back comparator, WAV helpers — 0 API calls
npm run demo -- --voice none  # seed room → personas → Spark director → validator → out/replay.html + out/receipt.json
```

`npm run demo` runs the whole pipeline on the seed group chat ("wrong chat", 3 friends, 12 messages): Muse Image draws three personas, SAM 3.1 cuts them out, Muse Spark directs the missed segment and `validate_directions` checks it, then each line is synthesized and read back by Voice Transcribe. It writes a self-contained `out/replay.html` (open it in any browser, no network) and `out/receipt.json` (every call, tokens, dollars, latency).

- `--voice none` skips speech synthesis (captions + typing sounds). Muse Image, SAM 3.1 and Spark still run; Voice Transcribe runs when voices are on (read-back of every line, enrollment check).
- `--reuse-personas` uses the committed personas in `public/seed/` instead of drawing new ones.
- With `TTS_URL`/`TTS_TOKEN` set (see [`tts/`](tts/)), lines are spoken by Qwen3-TTS and must pass the read-back check.
- `--inject-text` is the validator test: it inserts a `text` field into Spark's first output. The validator rejects it (D4) and Spark redirects.

Prefer not to run anything? [`examples/demo-room/`](examples/demo-room/) has a pre-rendered `replay.html` and `receipt.json`.

## How it works

```
Enroll (once per person)
  3 words ──▶ Muse Image (stylized bust, never photoreal) ──▶ SAM 3.1 "person" ──▶ alpha ──▶ persona.webp
          └─▶ Muse Image edit of the same image: head bowed, eyes closed ──▶ SAM 3.1 ──▶ away pose
              (presence is posture: friends who are not in the room sit dozing until they perform a line)
  read 3 sentences ──▶ Muse Voice Transcribe ──▶ matches the shown text ≥ 0.80? ──▶ voice reference stored
                                                  (consent proof + quality gate; otherwise nothing is stored)
Send
  hold to talk ──▶ Muse Voice Transcribe ──▶ 1.5 s preview (tap to edit) ──▶ message = text (audio discarded)
  typing ──▶ the same message

Receive (rendered once per message, shared by the room)
  rule table (punctuation, emoji, caps → emotion/gesture/pause, 0 ms)
  Qwen3-TTS (sender's voice or a preset) ──▶ Muse Voice Transcribe read-back ──▶ ≥ 0.85 ? play : retry ≤ 3 ──▶ captions-only + flag

Replay (missed messages)
  Muse Spark 1.3 directs the whole segment in one call (emotion, gesture, camera, pause per message_id)
  ──▶ validate_directions (D1 one-to-one & order · D2 enums & ranges · D3 budget · D4 no text channel)
  ──▶ ≤ 3 attempts with the errors fed back ──▶ else rule-table fallback (flag: director_fallback)
```

### Fixed checkpoints the models cannot skip

| Checkpoint | Where | Rule |
|---|---|---|
| Directions carry no words | `src/core/director.ts` | Spark's JSON schema has no text field. `validate_directions` rejects any extra key (D4), missing/duplicate/reordered ids (D1), out-of-range values (D2), oversized segments (D3). Three failures → deterministic rule table. |
| Every synthesized line is read back | `src/core/voice.ts` `renderVoice` | TTS audio → Voice Transcribe → normalized similarity with the message ≥ 0.85, else re-synthesize (≤ 3), else captions only, flagged `voice_unverified`. |
| Only your own voice | `src/core/voice.ts` `verifyEnrollment` | The recording must read the three sentences shown (≥ 0.80), 6–20 s, < 40 % silence. Nothing is stored before it passes. |

### Meta models

| Model | Role in Scene |
|---|---|
| **Muse Voice Transcribe** | Three jobs: message input (Korean and English), enrollment read-back (consent), and QA of every synthesized line. STT used as the checker for TTS. |
| **Muse Spark 1.3** | Replay director. One call per missed segment (≤ 40 messages), structured output, validated. Never in a real-time loop. |
| **Muse Image** | Draws the persona from three words. Always stylized. |
| **SAM 3.1** | Alpha extractor: Muse Image returns opaque images, SAM cuts the character out so it can stand at the table as a hologram. |

External: **Qwen3-TTS** (Apache 2.0, self-hosted on Modal) for voice only — Meta has no TTS. **Supabase** for rooms, realtime and storage. Everything that hears, directs, draws, cuts and verifies runs on Meta models.

## Numbers

Measured on Nov 3, 2026 from the receipts (`out/receipt.json`, the `ledger` table). Standard tier prices.

| Step | Model | Latency | Cost |
|---|---|---|---|
| Persona: draw + cut out | Muse Image → SAM 3.1 | 12–23 s | $0.0125 |
| Away pose: edit + cut out (after the persona is shown) | Muse Image edit → SAM 3.1 | 17–28 s, in the background | $0.0125 |
| Hold to talk → text (5 s of speech) | Voice Transcribe | 1.6–3.0 s | $0.00025 |
| Voice enrollment read-back (15 s) | Voice Transcribe | ~1.5 s | $0.00075 |
| Replay direction, 12 lines, one call | Spark 1.3, `reasoning_effort: minimal` | ~7 s | ~$0.004 |
| Replay direction, 12 lines, one call | Spark 1.3, `reasoning_effort: low` | ~12 s | ~$0.007 |
| Read-back of one synthesized line | Voice Transcribe | 1.5–2 s | ~$0.0001 |

<!-- TTS-NUMBERS -->

**What the read-back check caught.** Seeding the demo room on Nov 3, Qwen3-TTS (default sampling) produced lines Scene refused to play: it invented a name before "do not tell Jay" (*"Tangira Blackford said, do not tell Jay."*), babbled Chinese before "I'll bring the cake", and looped a 2-second line into 20 seconds. Voice Transcribe heard each one, the score fell to 0.00, and Scene synthesized again until the clip matched. An earlier, more lenient score let a garbled English line read by a Korean-native preset pass at 0.88 (*"약 그 So who's bringing the cake으로"*); that case is now a regression test, and presets are chosen per language.

## Privacy

You can only register **your own** voice, and enrollment requires reading three sentences aloud that Scene verifies. Friends who haven't registered appear as a default persona with a preset voice — Scene never builds a persona or voice of someone who didn't enroll. Messages are stored as text, like any chat; your spoken audio is transcribed and discarded. Your persona and voice reference are the only media stored, and you can delete them in settings. All Meta calls use the Standard tier (never the Contributor tier). Faces are always stylized. Every performance carries an "AI-MADE" mark. Scene performs your words and infers nothing about you: emotion and gesture are stage directions for one message, never a profile of a person.

## Web app

```bash
# needs a Supabase project: apply supabase/migrations/0001_init.sql, then fill the SUPABASE_* keys in .env
npx tsx scripts/seed-demo.ts   # seeds the demo template room
npm run dev                    # http://localhost:3000 → "Open the demo room" (a private copy per visitor)
```

Rooms are links. No accounts: joining creates a member with a private key kept in the browser. Presence is posture: friends who are in the room sit up and glow, friends who are away bow their heads, and raise them only while they perform a replayed line.

## Repository map

```
src/core/      meta.ts (4 Meta models) · persona.ts · director.ts (Spark + validator + rules) · voice.ts (checks) · tts.ts · wav.ts · ledger.ts (receipt)
src/stage/     engine.ts (hologram stage, framework-free) · styles.ts · replay-entry.ts (replay.html)
src/server/    Supabase access, rendering, demo-room fork
src/client/    RoomApp.tsx (join, room, hold-to-talk, replay, settings)
app/           Next.js pages and API routes
tts/           Qwen3-TTS service (Modal + local) with the same HTTP contract
scripts/       demo.ts · seed-demo.ts
test/          unit tests (no network)
```

## License

MIT for this repository. Qwen3-TTS is Apache 2.0. Meta models are used through the Model API under Meta's terms.
