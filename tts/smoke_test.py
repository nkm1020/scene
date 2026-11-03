#!/usr/bin/env python3
"""Smoke test + latency spike for the deployed scene-tts endpoint.

stdlib only. Reads TTS_URL and TTS_TOKEN from the environment, or from
scene/.env (only those two keys). Writes wavs and results.json to
scene/spikes/tts/.

  python3 tts/smoke_test.py                                   # Modal, full run
  python3 tts/smoke_test.py --url http://127.0.0.1:8765 --skip-cold --n 3   # local server
Flags: --url URL, --skip-cold, --n N (warm repeats, default 5), --label NAME
"""

import base64
import io
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "spikes" / "tts"


def arg(name, default=None):
    if name in sys.argv:
        i = sys.argv.index(name)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return default


def load_cfg():
    url, tok = arg("--url") or os.environ.get("TTS_URL"), os.environ.get("TTS_TOKEN")
    env = ROOT / ".env"
    if (not url or not tok) and env.exists():
        for line in env.read_text().splitlines():
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k == "TTS_URL" and not url:
                url = v
            if k == "TTS_TOKEN" and not tok:
                tok = v
    if not url or not tok:
        sys.exit("TTS_URL / TTS_TOKEN not set")
    return url.rstrip("/"), tok


URL, TOKEN = load_cfg()


def call(method, path, payload=None, auth=True, timeout=600):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(URL + path, data=data, method=method)
    if payload is not None:
        req.add_header("Content-Type", "application/json")
    if auth:
        req.add_header("Authorization", f"Bearer {TOKEN}")
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body, hdrs, status = r.read(), dict(r.headers), r.status
    except urllib.error.HTTPError as e:
        body, hdrs, status = e.read(), dict(e.headers), e.code
    return status, body, hdrs, (time.time() - t0) * 1000


def tts(text, language, voice, out_name=None, **extra):
    payload = {"text": text, "language": language, "voice": voice, **extra}
    status, body, h, ms = call("POST", "/tts", payload)
    if status != 200:
        raise RuntimeError(f"/tts {status}: {body[:300]!r}")
    if out_name:
        (OUT / out_name).write_bytes(body)
    rec = {
        "file": out_name, "text": text, "language": language,
        "voice": voice.get("preset", "clone"), "wall_ms": round(ms),
        "gen_ms": int(h.get("x-gen-ms", h.get("X-Gen-Ms", -1))),
        "dur_ms": int(h.get("x-duration-ms", h.get("X-Duration-Ms", -1))),
        "rtf": float(h.get("x-rtf", h.get("X-RTF", -1))),
        "queue_ms": int(h.get("x-queue-ms", h.get("X-Queue-Ms", 0))),
        "prompt_ms": int(h.get("x-prompt-ms", h.get("X-Prompt-Ms", 0)) or 0),
        "voice_cache": h.get("x-voice-cache", h.get("X-Voice-Cache")),
        "sr": int(h.get("x-sample-rate", h.get("X-Sample-Rate", 0))),
    }
    print(f"  {out_name or '-':32s} wall={rec['wall_ms']:6d}ms gen={rec['gen_ms']:6d}ms "
          f"dur={rec['dur_ms']:6d}ms rtf={rec['rtf']:.2f} cache={rec['voice_cache']}")
    return body, rec


def concat_wavs(blobs, gap_s=0.35):
    params, frames = None, []
    for b in blobs:
        with wave.open(io.BytesIO(b)) as w:
            p = w.getparams()
            if params is None:
                params = p
            assert (p.nchannels, p.sampwidth, p.framerate) == (params.nchannels, params.sampwidth, params.framerate)
            frames.append(w.readframes(w.getnframes()))
    silence = b"\x00" * int(gap_s * params.framerate) * params.sampwidth * params.nchannels
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(params.nchannels)
        w.setsampwidth(params.sampwidth)
        w.setframerate(params.framerate)
        w.writeframes(silence.join(frames))
    return buf.getvalue()


def wav_seconds(b):
    with wave.open(io.BytesIO(b)) as w:
        return w.getnframes() / w.getframerate()


def pct(xs, q):
    xs = sorted(xs)
    k = (len(xs) - 1) * q
    lo, hi = int(k), min(int(k) + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (k - lo)


def summarize(runs):
    return {
        "n": len(runs),
        "wall_p50_ms": round(pct([r["wall_ms"] for r in runs], 0.5)),
        "wall_p95_ms": round(pct([r["wall_ms"] for r in runs], 0.95)),
        "gen_p50_ms": round(pct([r["gen_ms"] for r in runs], 0.5)),
        "gen_p95_ms": round(pct([r["gen_ms"] for r in runs], 0.95)),
        "dur_mean_ms": round(statistics.mean(r["dur_ms"] for r in runs)),
        "rtf_mean": round(statistics.mean(r["rtf"] for r in runs), 3),
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    local = "127.0.0.1" in URL or "localhost" in URL
    label = arg("--label") or ("local" if local else "modal")
    prefix = "local_" if local else ""
    n_warm = int(arg("--n", "5"))
    res = {"url": URL, "label": label, "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    results_path = OUT / f"results_{label}.json"

    def save():
        results_path.write_text(json.dumps(res, ensure_ascii=False, indent=2))

    st, _, _, _ = call("GET", "/presets", auth=False)
    res["presets_without_token_status"] = st
    print(f"/presets without token -> {st}")

    ko_line, en_line = "야 금요일 7시 다 모여", "ok Friday 7pm. everyone hide in the kitchen"
    print("preset Korean (sohee)" + ("" if "--skip-cold" in sys.argv else " = cold start") + ":")
    _, rec = tts(ko_line, "ko", {"preset": "sohee"}, f"{prefix}preset_ko_sohee.wav", seed=7)
    res["first_call"] = rec
    res["lines"] = [rec]
    save()

    print("build ~12 s Korean reference (sohee reads 3 sentences):")
    ref_sents = [
        "안녕, 나는 이번 주 금요일 파티를 준비하고 있어.",
        "다들 일곱 시까지 거실에 모여서 조용히 기다려 줘.",
        "케이크는 내가 가져갈 테니까 너희는 풍선만 챙겨 와.",
    ]
    blobs = []
    for i, sent in enumerate(ref_sents):
        b, rec = tts(sent, "ko", {"preset": "sohee"}, None, seed=11 + i)
        blobs.append(b)
        res["lines"].append(rec)
    ref = concat_wavs(blobs)
    (OUT / f"{prefix}ref_ko_sohee_12s.wav").write_bytes(ref)
    ref_text = " ".join(ref_sents)
    res["ref"] = {"file": f"{prefix}ref_ko_sohee_12s.wav", "seconds": round(wav_seconds(ref), 2), "text": ref_text}
    print(f"  ref length {res['ref']['seconds']} s")
    save()

    print("clone from reference (Base model):")
    clone_voice = {"ref_audio_b64": base64.b64encode(ref).decode(), "ref_text": ref_text}
    res["clone_runs"] = [
        tts("제이한테는 비밀", "ko", clone_voice, f"{prefix}clone_ko_secret.wav", seed=7)[1],
        tts("you can't bring your own cake", "en", clone_voice, f"{prefix}clone_en_cake.wav", seed=7)[1],
    ]
    res["lines"] += res["clone_runs"]
    save()

    print("preset English:")
    for spk in ["ryan", "serena", "vivian", "aiden", "sohee"]:
        _, rec = tts(en_line, "en", {"preset": spk}, f"{prefix}preset_en_{spk}.wav", seed=7)
        res["lines"].append(rec)
    save()

    if "--extra-ko" in sys.argv:
        print("preset Korean, other voices:")
        for spk in ["serena", "vivian", "ryan", "aiden"]:
            res["lines"].append(tts(ko_line, "ko", {"preset": spk}, f"{prefix}preset_ko_{spk}.wav", seed=7)[1])
        save()

    line2 = "오늘 저녁에 같이 밥 먹자"
    print(f"warm latency, preset ko, ~2 s line x{n_warm}:")
    res["warm_preset"] = [tts(line2, "ko", {"preset": "sohee"}, None, seed=100 + i)[1] for i in range(n_warm)]
    print(f"warm latency, clone ko (cached prompt), ~2 s line x{n_warm}:")
    res["warm_clone"] = [tts(line2, "ko", clone_voice, None, seed=100 + i)[1] for i in range(n_warm)]
    for k in ["warm_preset", "warm_clone"]:
        res[k + "_summary"] = summarize(res[k])
        print(f"  {k}: {res[k + '_summary']}")

    st, body, _, _ = call("GET", "/health", auth=False)
    res["health"] = json.loads(body)
    print("health:", res["health"])
    save()
    print("wrote", results_path)


if __name__ == "__main__":
    main()
