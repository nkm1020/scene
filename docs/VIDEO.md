# 3-minute video — shot list (updated Nov 3 for the build as it exists)

Changes from the plan: personas come from **three words** (no photo, own-face feature on hold), absent friends show a **bowed pose** made by a Muse Image edit, and the failure scenes use **real logs captured on Nov 3** (below). Record phone screens at 9:16; edit to 16:9 with two phones side by side.

| Time | Screen | Voiceover |
|---|---|---|
| 0:00–0:08 | Disclosure text (README first paragraph) | "Disclosure first: I prototyped this idea before the hackathon. Every line here is new, written in the last three days." |
| 0:08–0:28 | A plain text group chat scrolling → the same room in Scene: dark room, three friends at a round table, one with head bowed (away) | "Text bubbles are a layout for screens. Glasses don't have one. This is the same group chat, in the next layout." |
| 0:28–0:55 | Join: name → three chips (hair, outfit, vibe) → Muse Image draws → SAM cut-out appears → (cut) the same persona dozing, head bowed | "Three words. Muse Image draws my persona, SAM 3.1 cuts it out for the hologram. Muse Image also draws me dozing — that's how friends see me when I'm not in the room." |
| 0:55–1:15 | Voice step: read three sentences → "✓ Registered · read-back 9x%" | "Ten seconds of reading. Voice Transcribe checks I actually read it — that's consent, and it's why you can only register your own voice." |
| 1:15–1:45 | Phone A: hold to talk in Korean → preview → send. Phone B: my persona stands up from the table and says it in my voice; caption = message | "I talk. Voice Transcribe writes the message. On my friend's phone, my persona says it — in my voice." |
| 1:45–2:15 | "12 missed · Play" → "Muse Spark is directing 12 lines…" → the room performs "wrong chat" (Jay raises his head only for his lines) | "Missed the chat? Play it. Spark directs the scene — timing, emotion, camera — in one call." |
| 2:15–2:40 | Terminal: the real read-back log + validator log (see below) | "Speech models sometimes add words you never said. Here the voice invented 'Tangira Blackford said' before 'do not tell Jay'. Voice Transcribe heard it, Scene refused to play it, and regenerated. And Spark can't change a word either: its output has no text field, and the validator rejects anything extra." |
| 2:40–2:52 | Settings → Receipt panel; `npm run demo` in a terminal | "Every call is on the receipt: a persona costs about two and a half cents, a replayed line a fraction of a cent. Judges: one key, one command, no login." |
| 2:52–3:00 | Glasses view (`replay.html?glasses`) → end card | "Scene. It says what you said — nothing else. Built on Muse Voice Transcribe, Spark, Muse Image and SAM 3.1." |

## Real logs to show (captured Nov 3, demo template room, Qwen3-TTS presets read back by Voice Transcribe)

```
m02 Mina "I'll bring the cake 🎂"
  attempt 1  0.00 ✗  heard: "그정 全部就长自动东西的交代件。 Oh, bring the cake.."
  attempt 2  1.00 ✓  heard: "I'll bring the cake!."
m03 Sam  "DO NOT tell Jay"
  attempt 1  0.00 ✗  heard: "Tangira Blackford said, do not tell Jay."
  attempt 2  1.00 ✓  heard: "Do not tell Jay!"
```

```
$ npm run demo -- --voice none --reuse-personas --inject-text
[3/4] Director: Muse Spark 1.3 directs 12 lines in one call, validate_directions checks every output
  attempt 1: ✗ D4 forbidden key "text" (directions carry no text)
  attempt 2: validate_directions ✓
```

## X post (30 s clip: the room performing "wrong chat", 9:16)

> Text bubbles are a layout for screens. Glasses don't have one.
> So I built the next layout for chat: your friends as holograms at a table, in their own voices, saying exactly what they typed — and nothing else.
> Every line is read back by Muse Voice Transcribe before it plays. When the voice model invented words, Scene refused to play them.
> Muse Spark directs. Muse Image + SAM 3.1 draw the personas. 3 days, Meta AI Developer Hackathon @MetaforDevs @cerebral_valley. Repo in thread.
