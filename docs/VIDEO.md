# 3-minute video — shot list (updated Nov 3 for the build as it exists)

Direction since Nov 3 noon: friends are **3D clay figurines** (Muse Image figurine and six expression edits, SAM 3.1 masks, SAM 3D meshes) on a wooden table, and **Spark directs the whole table** (listener reactions; a dozing friend wakes when the line is about them). Failure scenes use **real logs captured on Nov 3** (below). Record phone screens at 9:16; edit to 16:9 with two phones side by side.

| Time | Screen | Voiceover |
|---|---|---|
| 0:00–0:08 | Disclosure text (README first paragraph) | "Disclosure first: I prototyped this idea before the hackathon. Every line here is new, written in the last three days." |
| 0:08–0:25 | A plain text group chat scrolling → the same chat as three clay friends on a wooden table; Jay is dozing | "This is my group chat. Same messages, but my friends are standing on the table." |
| 0:25–0:55 | Join: three chips → "Muse Image is sculpting your figurine" → the figure appears on the table in 3D, turns → a strip of its six expressions | "Three words. Muse Image sculpts a clay me, and six expressions of the same me. SAM 3.1 cuts each one out, and SAM 3D turns them into figures. Three Meta models before I've said a word." |
| 0:55–1:10 | Voice step: read three sentences → "Registered" | "Ten seconds of reading. Voice Transcribe checks I actually read it, so only my own voice can be registered." |
| 1:10–1:40 | Phone A: hold to talk in Korean → preview → send. Phone B: my figure walks to the front and says it in my voice; the others turn to me | "I talk. Voice Transcribe writes the message. On my friend's phone, my figure says it, in my voice." |
| 1:40–2:15 | "12 missed · Play" → "Muse Spark is directing 12 lines" → the table performs "wrong chat": Sam shouts DO NOT tell Jay, dozing Jay wakes up | "Missed the chat? Press play. Spark reads the whole thing and directs every figure. Jay was asleep, until someone said his name." |
| 2:15–2:40 | Terminal: the real read-back and validator logs (below) | "The voice model sometimes invents words. Here it added 'Tangira Blackford said'. Voice Transcribe heard it, and Scene refused to play it. Spark can't change a word either: its output has no text field, and the validator rejects anything extra." |
| 2:40–2:52 | Settings → Receipt; `npm run demo` in a terminal | "Every call is on the receipt. Judges: one key, one command, no login." |
| 2:52–3:00 | The table, wide, everyone laughing → end card | "Scene. Your group chat, performed. It says what you said, nothing else." |

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

## X post (30 s clip: the table performing "wrong chat", 9:16)

> My group chat, performed by tiny clay versions of my friends, in their own voices.
> Each line says exactly what they typed, nothing else: Muse Voice Transcribe listens to every line before it plays.
> Muse Image sculpts the figures, SAM 3.1 + SAM 3D make them 3D, Muse Spark directs the table (Jay wakes up when someone says his name).
> 3 days, Meta AI Developer Hackathon @MetaforDevs @cerebral_valley. Repo in thread.
