#!/usr/bin/env python3
"""Round-trip check: transcribe the spike wavs with Whisper (MLX, on this Mac) and compare
with the text that was synthesized. A stand-in for Meta Voice Transcribe, to catch bad
pronunciation early. Not part of the product.

  uv run --python 3.12 --with mlx-whisper python spikes/tts/asr_check.py [results_local.json]
"""

import json
import re
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODEL = "mlx-community/whisper-large-v3-turbo"


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s).lower()
    return re.sub(r"[\W_]+", "", s)  # drop spaces and punctuation


def cer(ref: str, hyp: str) -> float:
    r, h = norm(ref), norm(hyp)
    if not r:
        return 0.0
    prev = list(range(len(h) + 1))
    for i, rc in enumerate(r, 1):
        cur = [i]
        for j, hc in enumerate(h, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (rc != hc)))
        prev = cur
    return prev[-1] / len(r)


def main():
    import mlx_whisper

    res_path = HERE / (sys.argv[1] if len(sys.argv) > 1 else "results_local.json")
    res = json.loads(res_path.read_text())
    items = [(l["file"], l["text"], l["language"]) for l in res.get("lines", []) if l.get("file")]
    if "ref" in res:
        items.append((res["ref"]["file"], res["ref"]["text"], "ko"))
    out = []
    for f, text, lang in items:
        p = HERE / f
        if not p.exists():
            continue
        r = mlx_whisper.transcribe(str(p), path_or_hf_repo=MODEL, language=lang, temperature=0.0)
        hyp = r["text"].strip()
        c = cer(text, hyp)
        out.append({"file": f, "lang": lang, "text": text, "asr": hyp, "cer": round(c, 3)})
        print(f"{f:34s} cer={c:.2f}  ref={text!r}  asr={hyp!r}", flush=True)
    dst = HERE / res_path.name.replace("results_", "asr_")
    dst.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print("wrote", dst)


if __name__ == "__main__":
    main()
