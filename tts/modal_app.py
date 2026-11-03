"""Scene TTS service: Qwen3-TTS (Apache-2.0) on a Modal L4.

Endpoints (FastAPI, served by Modal):
  GET  /health   no auth. Liveness + GPU memory.
  GET  /presets  Bearer auth. Preset speakers with language hints.
  POST /tts      Bearer auth. JSON in, audio/wav (mono PCM16) out.

Deploy:  modal deploy tts/modal_app.py      (from the scene/ folder)
Secret:  modal secret create scene-tts TTS_TOKEN=<token>
"""

import modal

APP_NAME = "scene-tts"

# Pinned Hugging Face revisions (checked 2026-11-03).
BASE_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"  # zero-shot voice clone
BASE_REV = "fd4b254389122332181a7c3db7f27e918eec64e3"
CV_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"  # 9 preset speakers
CV_REV = "0c0e3051f131929182e2c023b9537f8b1c68adfe"
MODEL_DIR = "/models"

# Preset speakers of the CustomVoice model (names from its config.json; the
# model card says any speaker can speak any of the 10 languages, best in its
# native one).
PRESETS = {
    "sohee": {"native": "ko", "gender": "female", "desc": "Warm Korean female voice with rich emotion"},
    "serena": {"native": "zh", "gender": "female", "desc": "Warm, gentle young female voice"},
    "vivian": {"native": "zh", "gender": "female", "desc": "Bright, slightly edgy young female voice"},
    "ono_anna": {"native": "ja", "gender": "female", "desc": "Playful Japanese female voice, light timbre"},
    "ryan": {"native": "en", "gender": "male", "desc": "Dynamic male voice with strong rhythmic drive"},
    "aiden": {"native": "en", "gender": "male", "desc": "Sunny American male voice, clear midrange"},
    "uncle_fu": {"native": "zh", "gender": "male", "desc": "Seasoned male voice, low and mellow"},
    "dylan": {"native": "zh-beijing", "gender": "male", "desc": "Youthful Beijing male voice"},
    "eric": {"native": "zh-sichuan", "gender": "male", "desc": "Lively Chengdu male voice, slightly husky"},
}
# Scene defaults: two female-ish, one male-ish. Chosen by the STT round-trip
# spike in spikes/tts/RESULTS.md.
DEFAULT_VOICES = ["sohee", "serena", "ryan"]

LANG_MAP = {
    "ko": "korean", "korean": "korean",
    "en": "english", "english": "english",
    "auto": "auto",
    "zh": "chinese", "chinese": "chinese",
    "ja": "japanese", "japanese": "japanese",
    "de": "german", "german": "german",
    "fr": "french", "french": "french",
    "ru": "russian", "russian": "russian",
    "pt": "portuguese", "portuguese": "portuguese",
    "es": "spanish", "spanish": "spanish",
    "it": "italian", "italian": "italian",
}

MAX_TEXT_CHARS = 600
MAX_REF_SECONDS = 30.0
PROMPT_CACHE_SIZE = 256


def download_models():
    from huggingface_hub import snapshot_download

    for repo, rev, sub in [(BASE_ID, BASE_REV, "base"), (CV_ID, CV_REV, "custom_voice")]:
        snapshot_download(repo_id=repo, revision=rev, local_dir=f"{MODEL_DIR}/{sub}")


image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("sox", "libsox-fmt-all", "libsndfile1", "ffmpeg")
    .uv_pip_install(
        "torch==2.8.0",
        "torchaudio==2.8.0",
        "qwen-tts==0.1.1",
        "transformers==4.57.3",
        "accelerate==1.12.0",
        "huggingface_hub>=0.34,<1.0",
        "soundfile",
        "librosa",
        "fastapi[standard]",
    )
    .env({"TOKENIZERS_PARALLELISM": "false", "HF_HUB_DISABLE_TELEMETRY": "1"})
    .run_function(download_models, timeout=1800)
)

app = modal.App(APP_NAME)


# ---------------------------------------------------------------------------
# Shared engine code. Used by the Modal class below and by tts/local_server.py.
# An "engine" is any object; these functions set and read attributes on it.
# ---------------------------------------------------------------------------
def load_engine(eng, cv_path: str, base_path: str, device: str, dtype, attn: str = "sdpa"):
    import threading
    import time
    from collections import OrderedDict

    from qwen_tts import Qwen3TTSModel

    t0 = time.time()
    kw = dict(device_map=device, dtype=dtype, attn_implementation=attn)
    eng.cv = Qwen3TTSModel.from_pretrained(cv_path, **kw)
    eng.base = Qwen3TTSModel.from_pretrained(base_path, **kw)
    eng.device = str(device)
    eng.dtype = str(dtype).replace("torch.", "")
    eng.load_ms = int((time.time() - t0) * 1000)
    eng.peak_mem_mb = 0

    # Warm up kernels so the first real request is not slow.
    t1 = time.time()
    eng.cv.generate_custom_voice(text="Warm up.", language="english", speaker="ryan", max_new_tokens=64)
    eng.warmup_ms = int((time.time() - t1) * 1000)

    eng.lock = threading.Lock()
    eng.prompt_cache = OrderedDict()
    eng.started_at = time.time()
    eng.requests = 0
    note_mem(eng)
    print(f"[scene-tts] models loaded on {eng.device}/{eng.dtype} in {eng.load_ms} ms, "
          f"warmup {eng.warmup_ms} ms, speakers={eng.cv.get_supported_speakers()}", flush=True)


def device_mem(eng) -> dict:
    import resource
    import sys

    import torch

    out = {}
    dev = getattr(eng, "device", "")
    if dev.startswith("cuda"):
        free, total = torch.cuda.mem_get_info()
        out.update(gpu=torch.cuda.get_device_name(0), gpu_mem_used_mb=int((total - free) / 2**20),
                   gpu_mem_total_mb=int(total / 2**20),
                   torch_max_alloc_mb=int(torch.cuda.max_memory_allocated() / 2**20))
    elif dev.startswith("mps"):
        out.update(gpu="apple-mps", mps_alloc_mb=int(torch.mps.current_allocated_memory() / 2**20),
                   mps_driver_mb=int(torch.mps.driver_allocated_memory() / 2**20))
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    out["proc_max_rss_mb"] = int(rss / 2**20) if sys.platform == "darwin" else int(rss / 1024)
    return out


def note_mem(eng):
    m = device_mem(eng)
    cur = m.get("gpu_mem_used_mb") or m.get("mps_driver_mb") or 0
    eng.peak_mem_mb = max(getattr(eng, "peak_mem_mb", 0), cur)


def clone_prompt(eng, audio_bytes: bytes, ref_text, xvec_only: bool):
    import hashlib
    import io

    import numpy as np
    import soundfile as sf

    h = hashlib.sha256(audio_bytes).hexdigest()
    key = f"{h}:{hashlib.sha256((ref_text or '').encode()).hexdigest()[:16]}:{int(xvec_only)}"
    if key in eng.prompt_cache:
        eng.prompt_cache.move_to_end(key)
        return eng.prompt_cache[key], h, True
    wav, sr = sf.read(io.BytesIO(audio_bytes), dtype="float32", always_2d=True)
    wav = wav.mean(axis=1)
    wav = wav[: int(MAX_REF_SECONDS * sr)]
    if wav.size < sr:  # under 1 s
        raise ValueError("ref audio shorter than 1 s")
    items = eng.base.create_voice_clone_prompt(
        ref_audio=(np.ascontiguousarray(wav), int(sr)),
        ref_text=None if xvec_only else ref_text,
        x_vector_only_mode=xvec_only,
    )
    eng.prompt_cache[key] = items
    while len(eng.prompt_cache) > PROMPT_CACHE_SIZE:
        eng.prompt_cache.popitem(last=False)
    return items, h, False


def max_tokens(text: str) -> int:
    # 12.5 codec frames per second of speech. Speech runs ~6 Korean syllables or ~15 English
    # characters per second, so 5 frames (0.4 s) per character plus 8 s of headroom is generous
    # and still stops a runaway (looping) generation early. Observed Nov 3: a 29-char line ran to
    # 20.6 s under the old 10-frames-per-char cap; Scene's read-back check rejected it.
    return int(min(2048, 100 + 5 * len(text)))


def build_api(eng, token: str):
    import base64
    import binascii
    import hmac
    import io
    import random
    import time

    import numpy as np
    import soundfile as sf
    import torch
    from fastapi import FastAPI, Header, HTTPException, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse, Response

    api = FastAPI(title="scene-tts", version="1.0")
    api.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["X-Duration-Ms", "X-Gen-Ms", "X-Queue-Ms", "X-Prompt-Ms", "X-Voice-Cache",
                        "X-Voice-Id", "X-Sample-Rate", "X-Model", "X-RTF"],
    )

    def check_auth(authorization):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(401, "missing bearer token")
        if not hmac.compare_digest(authorization[7:].strip().encode(), token.encode()):
            raise HTTPException(401, "bad token")

    @api.get("/health")
    def health():
        return {
            "ok": True,
            "models": {"base": BASE_ID, "custom_voice": CV_ID},
            "device": eng.device,
            "dtype": eng.dtype,
            **device_mem(eng),
            "peak_mem_mb": eng.peak_mem_mb,
            "load_ms": eng.load_ms,
            "warmup_ms": eng.warmup_ms,
            "uptime_s": int(time.time() - eng.started_at),
            "requests": eng.requests,
            "cached_voices": len(eng.prompt_cache),
        }

    @api.get("/presets")
    def presets(authorization: str = Header(None)):
        check_auth(authorization)
        return {
            "defaults": DEFAULT_VOICES,
            "presets": [{"name": k, **v} for k, v in PRESETS.items()],
            "languages": ["ko", "en", "auto", "zh", "ja", "de", "fr", "ru", "pt", "es", "it"],
        }

    @api.post("/tts")
    def tts(body: dict, authorization: str = Header(None)):
        check_auth(authorization)
        t_req = time.time()

        text = body.get("text")
        if not isinstance(text, str) or not text.strip():
            raise HTTPException(400, "text is required")
        text = text.strip()
        if len(text) > MAX_TEXT_CHARS:
            raise HTTPException(400, f"text longer than {MAX_TEXT_CHARS} chars")
        lang_in = str(body.get("language") or "auto").lower()
        if lang_in not in LANG_MAP:
            raise HTTPException(400, f"unsupported language {lang_in!r}")
        language = LANG_MAP[lang_in]
        voice = body.get("voice")
        if not isinstance(voice, dict):
            raise HTTPException(400, "voice must be {preset} or {ref_audio_b64, ref_text}")
        seed = body.get("seed")
        speed = body.get("speed")
        if speed is not None:
            try:
                speed = float(speed)
            except (TypeError, ValueError):
                raise HTTPException(400, "speed must be a number")
            if not 0.5 <= speed <= 2.0:
                raise HTTPException(400, "speed must be in [0.5, 2.0]")
        if seed is not None and not isinstance(seed, int):
            raise HTTPException(400, "seed must be an int")

        headers = {}
        # Lower-than-default sampling temperature (package default 0.9): fewer hallucinated words before the line.
        # Scene reads every clip back anyway; this just makes the first attempt pass more often.
        try:
            temperature = float(body.get("temperature", 0.65))
            top_p = float(body.get("top_p", 0.85))
        except (TypeError, ValueError):
            raise HTTPException(400, "temperature/top_p must be numbers")
        if not (0.1 <= temperature <= 1.5 and 0.1 <= top_p <= 1.0):
            raise HTTPException(400, "temperature in [0.1,1.5], top_p in [0.1,1.0]")
        gen_kwargs = {"max_new_tokens": max_tokens(text), "temperature": temperature, "top_p": top_p}

        if "preset" in voice:
            spk = str(voice["preset"]).lower()
            if spk not in PRESETS:
                raise HTTPException(400, f"unknown preset {spk!r}; see /presets")
            mode = "preset"
        elif "ref_audio_b64" in voice:
            b64 = str(voice["ref_audio_b64"])
            if b64.startswith("data:"):
                b64 = b64.split(",", 1)[-1]
            try:
                audio_bytes = base64.b64decode(b64, validate=False)
            except (binascii.Error, ValueError):
                raise HTTPException(400, "ref_audio_b64 is not valid base64")
            ref_text = voice.get("ref_text")
            xvec_only = bool(voice.get("x_vector_only", False)) or not ref_text
            mode = "clone"
        else:
            raise HTTPException(400, "voice must contain 'preset' or 'ref_audio_b64'")

        t_wait = time.time()
        with eng.lock:
            t_start = time.time()
            headers["X-Queue-Ms"] = str(int((t_start - t_wait) * 1000))
            if seed is not None:
                random.seed(seed)
                np.random.seed(seed % 2**32)
                torch.manual_seed(seed)
            try:
                if mode == "preset":
                    wavs, sr = eng.cv.generate_custom_voice(
                        text=text, language=language, speaker=spk, **gen_kwargs)
                    headers["X-Model"] = CV_ID
                else:
                    tp = time.time()
                    try:
                        items, vid, hit = clone_prompt(eng, audio_bytes, ref_text, xvec_only)
                    except Exception as e:  # bad wav, too short, etc.
                        raise HTTPException(400, f"bad ref audio: {e}")
                    headers["X-Prompt-Ms"] = str(int((time.time() - tp) * 1000))
                    headers["X-Voice-Cache"] = "hit" if hit else "miss"
                    headers["X-Voice-Id"] = vid[:16]
                    wavs, sr = eng.base.generate_voice_clone(
                        text=text, language=language, voice_clone_prompt=items, **gen_kwargs)
                    headers["X-Model"] = BASE_ID
            finally:
                eng.requests += 1
            gen_s = time.time() - t_start
            note_mem(eng)

        wav = np.asarray(wavs[0], dtype=np.float32).reshape(-1)
        if not np.all(np.isfinite(wav)):
            raise HTTPException(500, "model produced non-finite audio (dtype issue?)")
        if speed is not None and abs(speed - 1.0) > 1e-3:
            import librosa

            wav = librosa.effects.time_stretch(wav, rate=speed)
        peak = float(np.max(np.abs(wav))) if wav.size else 0.0
        if peak > 0.99:
            wav = wav * (0.99 / peak)
        buf = io.BytesIO()
        sf.write(buf, wav, sr, format="WAV", subtype="PCM_16")
        dur_s = wav.size / sr
        headers.update({
            "X-Duration-Ms": str(int(dur_s * 1000)),
            "X-Gen-Ms": str(int(gen_s * 1000)),
            "X-RTF": f"{gen_s / max(dur_s, 1e-6):.3f}",
            "X-Sample-Rate": str(sr),
        })
        print(f"[scene-tts] {mode} lang={language} chars={len(text)} dur={dur_s:.2f}s "
              f"gen={gen_s * 1000:.0f}ms total={(time.time() - t_req) * 1000:.0f}ms", flush=True)
        return Response(content=buf.getvalue(), media_type="audio/wav", headers=headers)

    @api.exception_handler(Exception)
    def on_error(request: Request, exc: Exception):
        print(f"[scene-tts] error: {type(exc).__name__}: {exc}", flush=True)
        return JSONResponse({"error": f"{type(exc).__name__}: {exc}"}, status_code=500)

    return api


# ---------------------------------------------------------------------------
# Modal deployment
# ---------------------------------------------------------------------------
@app.cls(
    image=image,
    gpu="L4",
    secrets=[modal.Secret.from_name("scene-tts")],
    scaledown_window=300,
    min_containers=0,
    max_containers=2,
    timeout=600,
    startup_timeout=900,
)
@modal.concurrent(max_inputs=4, target_inputs=1)
class SceneTTS:
    @modal.enter()
    def load(self):
        import torch

        load_engine(self, f"{MODEL_DIR}/custom_voice", f"{MODEL_DIR}/base",
                    device="cuda:0", dtype=torch.bfloat16, attn="sdpa")

    @modal.asgi_app()
    def web(self):
        import os

        return build_api(self, os.environ["TTS_TOKEN"])
