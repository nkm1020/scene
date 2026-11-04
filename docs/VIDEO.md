# 3-minute video: shot list (updated Nov 4 for home, friends, doors and room sets)

Two phones side by side (record each at 9:16, edit to 16:9): **A** is you, **B** is a friend. Record on the live site (https://scene-lovat.vercel.app) or on `npm run dev` with `TTS_URL` set if you want live lines spoken (the demo chat's lines are already voiced and checked). Failure scenes use **real logs captured on Nov 3** (below).

| Time | Screen | Voiceover |
|---|---|---|
| 0:00–0:08 | Disclosure text (README first paragraph) | "Disclosure first: I prototyped this idea before the hackathon. Everything you see was built in the last three days." |
| 0:08–0:20 | A plain text group chat scrolling → cut to A's home: a clay figure on a turntable, chats below | "This is my group chat. Same messages, new layout." |
| 0:20–0:50 | A, first run: type a name → read three sentences ("Registered") → three chips → "Muse Image is sculpting your figure" → the figure appears → dress it (hair options drawn on it) → home: drag the turntable all the way round, pinch in | "A name, my voice, three words. Voice Transcribe checks I really read the sentences, so only my own voice can be registered. Muse Image sculpts a clay me, and draws me from the side and from behind, so I can turn myself all the way round. SAM 3.1 cuts every picture out." |
| 0:50–1:10 | A: Friends → share code. B: types the code → A: "Asking to be friends" → Accept → a chat for the two of them appears | "Friends are real: send your code, they ask, you accept, and a room for the two of you opens." |
| 1:10–1:40 | A taps the chat: the double doors close and swing open onto the table. A holds to talk in Korean → on B the table turns to A's figure, which says it in A's voice; the others turn to the speaker | "Tap a chat and you walk in. I talk; Voice Transcribe writes it down. On my friend's phone, my figure says it, in my voice." |
| 1:40–2:10 | The demo chat (marked Script) → "Play 12 missed" → "Muse Spark is directing 12 lines" → the table performs "wrong chat": Sam shouts DO NOT tell Jay, dozing Jay wakes up | "Every new user gets this scripted chat to see the table perform. Missed messages? Press play. Spark reads the whole thing and directs every figure. Jay was asleep, until someone said his name." |
| 2:10–2:25 | Room button → "Say a room": 비 오는 밤 서울 포장마차 → 30 s later the orange tarp tent appears on both phones | "Rooms are yours. Say one, Spark plans it, a checker makes sure there are no people or words in it, and Muse Image paints it for everyone at the table." |
| 2:25–2:45 | Terminal: the real read-back and validator logs (below) | "The voice model sometimes invents words. Here it added 'Tangira Blackford said'. Voice Transcribe heard it, and Scene refused to play it. Spark can't change a word either: its output has no text field, and the validator rejects anything extra." |
| 2:45–2:53 | Settings → Receipt; `npm run demo` in a terminal | "Every call is on the receipt. Judges: one key, one command, no login." |
| 2:53–3:00 | The table, wide, everyone laughing → end card with the live link | "Scene. Your group chat, performed. It says what you said, nothing else." |

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
