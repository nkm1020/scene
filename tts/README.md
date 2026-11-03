# scene-tts

Text-to-speech service for Scene. Meta's API has no TTS, so this is the one external model.
It runs open-weights **Qwen3-TTS** (Apache-2.0) on a Modal L4 GPU and scales to zero.

## Models

| Use | Hugging Face ID | Revision |
|---|---|---|
| Zero-shot voice clone | `Qwen/Qwen3-TTS-12Hz-1.7B-Base` | `fd4b2543` |
| Preset speakers | `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` | `0c0e3051` |

Package `qwen-tts==0.1.1`, `transformers==4.57.3`, `torch==2.8.0`, bf16, SDPA attention.
Output is 24 kHz mono. Languages: Korean, English, Chinese, Japanese, German, French, Russian,
Portuguese, Spanish, Italian. License: Apache-2.0 for code and weights.

## Contract

All calls except `/health` need `Authorization: Bearer $TTS_TOKEN`.

`POST /tts` with JSON:

```jsonc
{
  "text": "제이한테는 비밀",
  "language": "ko",               // "ko" | "en" | "auto" (also zh, ja, de, fr, ru, pt, es, it)
  "voice": {"preset": "sohee"},   // or {"ref_audio_b64": "<wav base64>", "ref_text": "<transcript of the ref>"}
  "seed": 7,                      // optional, makes output repeatable
  "speed": 1.0                    // optional, 0.5-2.0, time-stretch after synthesis
}
```

Response: `audio/wav` (mono, PCM16, 24 kHz). Headers:
`X-Duration-Ms`, `X-Gen-Ms` (GPU time), `X-Queue-Ms`, `X-RTF`, `X-Sample-Rate`, `X-Model`,
and for clones `X-Voice-Cache` (`hit`/`miss`), `X-Voice-Id` (first 16 hex of the ref sha256), `X-Prompt-Ms`.

- Clone reference: 10-15 s wav (any sample rate, stereo is averaged, cut at 30 s). Give `ref_text`
  (exact transcript) for best quality. Without it, the service falls back to speaker-embedding-only
  mode (`x_vector_only`), which is lower quality.
- The clone prompt is cached in memory per container, keyed by sha256 of the ref audio (+ ref_text).
  Send the same bytes again and the prompt step is skipped. The cache is lost when the container scales down.
- Errors: 400 for bad input, 401 for a missing or wrong token, 500 with `{"error": ...}`.

`GET /presets` returns the preset names, native language, gender, and the 3 Scene defaults.
`GET /health` returns GPU name and memory, model load time, uptime.

## Deploy

```bash
cd scene
modal secret create scene-tts TTS_TOKEN=$(python3 -c "import secrets;print(secrets.token_urlsafe(32))")
modal deploy tts/modal_app.py
python3 tts/smoke_test.py      # reads TTS_URL / TTS_TOKEN from env or scene/.env
```

Modal settings: L4, `scaledown_window=300`, `min_containers=0`, `max_containers=2`.
For the live demo set `min_containers=1` to skip the cold start. Weights are baked into the image
at build time, so a cold start does not download them again.

Measured numbers and errors: `spikes/tts/RESULTS.md`.

## Local fallback (Apple Silicon)

```bash
cd scene/tts
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python torch==2.8.0 torchaudio==2.8.0 qwen-tts==0.1.1 \
  transformers==4.57.3 accelerate==1.12.0 "huggingface_hub<1.0" soundfile librosa fastapi uvicorn modal==1.6.3
.venv/bin/python local_server.py          # http://127.0.0.1:8765, MPS float16, token from scene/.env
python3 smoke_test.py --url http://127.0.0.1:8765 --skip-cold --n 3
```

Same contract and code as Modal (`local_server.py` imports `load_engine` and `build_api` from
`modal_app.py`). On an M1 Pro it runs at about 10-20x slower than real time, so use it for
pre-generated clips only.
