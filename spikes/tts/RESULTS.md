# TTS spike results (2026-11-03)

Status: **BLOCKED on Modal billing.** Image build and weight download succeeded. The GPU function
was not created, so no audio exists yet and no latency was measured.

## Exact error

`modal deploy tts/modal_app.py` (Modal client 1.6.3, workspace `skynkm0307`, 00:13 UTC):

```
╭─ Error ──────────────────────────────────────────────────────────────────────╮
│ Please add a payment method to use L4 GPU functions.                         │
╰──────────────────────────────────────────────────────────────────────────────╯
```

The app `scene-tts` (ap-2sJonnqOQWSvXqTadiWFve) exists in state `stopped` with 0 tasks.
Fix: add a card in Modal (Settings, Usage and Billing), then run `modal deploy tts/modal_app.py`
again. The image is cached, so the redeploy should take about a minute. Then run
`python3 tts/smoke_test.py`.

## What is done

- Model check from primary sources (QwenLM/Qwen3-TTS README, HF model cards, configs, qwen-tts 0.1.1 source):
  - Clone: `Qwen/Qwen3-TTS-12Hz-1.7B-Base` @ `fd4b254389122332181a7c3db7f27e918eec64e3` (3.86 GB + 0.68 GB tokenizer)
  - Presets: `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` @ `0c0e3051f131929182e2c023b9537f8b1c68adfe`
  - Languages from config: chinese, english, german, italian, portuguese, spanish, japanese, **korean**, french, russian (+ auto).
  - Speakers: serena, vivian, uncle_fu, ryan, aiden, ono_anna, sohee, eric, dylan. Sohee is the only native Korean voice.
  - ICL clone needs `ref_text`. Without it, `x_vector_only_mode=True` works at lower quality.
  - License Apache-2.0 (code and weights).
- Secret `scene-tts` with `TTS_TOKEN` created. `TTS_TOKEN` appended to `scene/.env`. `TTS_URL` is not appended yet (no URL until deploy succeeds).
- Image built: python 3.12, torch 2.8.0, qwen-tts 0.1.1, transformers 4.57.3; 131 packages resolved
  without conflict. Both snapshots (13 files each) downloaded into the image in about 7 s each.

## Not done (needs the deploy)

- Preset ko/en wavs, 12 s Korean reference, Korean clone wav.
- Cold start, warm p50/p95, RTF, GPU memory.

## Cost (Modal list price, checked today)

L4 $0.000222/s = $0.80/h. CPU $0.0000131/core-s, memory $0.00000222/GiB-s add roughly
$0.05-0.10/h. A warm L4 is about **$0.85-0.90 per hour**. Starter plan includes $30/month credit.

---

## Local fallback on this Mac (M1 Pro 16 GB, MPS, float16), 09:30-09:40 KST

Server: `tts/local_server.py` (same contract as Modal, shares `load_engine`/`build_api` with
`tts/modal_app.py`), `http://127.0.0.1:8765`, venv `tts/.venv` (Python 3.12, torch 2.8.0, qwen-tts 0.1.1).
Weights in `~/.cache/huggingface` (same pinned revisions). Both 1.7B models loaded together.

| Step | Value |
|---|---|
| Weight download (both repos, ~9 GB) | 362 s + 355 s |
| Model load (both) | 20.8 s |
| Warm-up ("Warm up.", 64 tokens max) | 53.7 s |
| Memory | MPS alloc 8.0 GB, driver 9.9 GB, process phys_footprint 11 GB (peak 11 GB) |
| Sample rate | 24 kHz mono |

Per line (gen = server time, RTF = gen / audio length):

| File | Text | Audio | Gen | RTF |
|---|---|---|---|---|
| local_preset_ko_sohee.wav | 야 금요일 7시 다 모여 | 2.32 s | 36.4 s (run 1), 44.4 s (run 2) | 15.7 / 19.1 |
| ref sentence 1 (sohee) | 안녕, 나는 이번 주 금요일 파티를 준비하고 있어. | 5.04 s | 62.6 s | 12.4 |
| ref sentence 2 (sohee) | 다들 일곱 시까지 거실에 모여서 조용히 기다려 줘. | 4.72 s | 55.1 s | 11.7 |
| ref sentence 3 (sohee) | 케이크는 내가 가져갈 테니까 너희는 풍선만 챙겨 와. | 3.12 s | 63.5 s | 20.4 |
| local_ref_ko_sohee_12s.wav | 3 sentences + 0.35 s gaps | 13.58 s | - | - |
| local_clone_ko_secret.wav | 제이한테는 비밀 | 1.20 s | 20.8 s (prompt build 4.6 s, cache miss) | 17.3 |
| local_clone_en_cake.wav | you can't bring your own cake | 1.76 s | 16.7 s (cache hit) | 9.5 |

Remaining lines (English presets ryan/serena/vivian/aiden/sohee, 3 warm runs each for preset and
clone) were still running at report time; they land in `results_local.json`.

**Verdict for the local path:** works end to end, Korean clone works, but MPS is about 10-20x
slower than real time. Usable for pre-generating demo clips, not for live chat. The swap on this
Mac was already 13.5 GB used by other apps, which may make it slower.

### Whisper round-trip (stand-in for Meta STT)

`spikes/tts/asr_check.py`, mlx-whisper large-v3-turbo, CER after removing spaces/punctuation:

| File | ASR | CER |
|---|---|---|
| local_clone_ko_secret.wav | 제이한테는 비밀 | 0.00 |
| local_clone_en_cake.wav | You can't bring your own cage. | 0.04 |
| local_preset_ko_sohee.wav | 야 금요일 7시 다 보여? | 0.11 (모여 heard as 보여) |
| local_ref_ko_sohee_12s.wav | ... 다들 7시까지 ... 내가 가져갈 테니까 ... | 0.10 (일곱 시 -> 7시 is only formatting; 케이크는 missing) |

Note: in the ref, "케이크는" is missing in the ASR. Either the TTS dropped the word or Whisper did;
someone must listen to sentence 3. The ref_text still says 케이크는, which can hurt the clone a little.
