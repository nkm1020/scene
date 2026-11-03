#!/usr/bin/env python3
"""Local scene-tts server: same HTTP contract as modal_app.py, on Apple Silicon (MPS) or CPU.

  cd scene/tts && .venv/bin/python local_server.py
  -> http://127.0.0.1:8765  (POST /tts, GET /presets, GET /health)

Env:
  TTS_TOKEN   bearer token (default: read from scene/.env)
  TTS_DEVICE  mps | cpu       (default: mps if available)
  TTS_DTYPE   float16 | float32 | bfloat16 (default: float16 on mps, float32 on cpu)
  TTS_PORT    default 8765
Weights come from the default Hugging Face cache (~/.cache/huggingface), pinned to the
same revisions as the Modal image.
"""

import os
import sys
import types
from pathlib import Path

# Ops MPS lacks fall back to CPU instead of crashing. Must be set before torch loads.
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import modal_app as M  # noqa: E402  (shared constants, engine and FastAPI app)


def read_token() -> str:
    tok = os.environ.get("TTS_TOKEN")
    env = HERE.parent / ".env"
    if not tok and env.exists():
        for line in env.read_text().splitlines():
            k, _, v = line.partition("=")
            if k.strip() == "TTS_TOKEN":
                tok = v.strip().strip('"').strip("'")
    if not tok:
        sys.exit("TTS_TOKEN not set (env or scene/.env)")
    return tok


def main():
    import torch
    import uvicorn
    from huggingface_hub import snapshot_download

    device = os.environ.get("TTS_DEVICE") or ("mps" if torch.backends.mps.is_available() else "cpu")
    dtype_name = os.environ.get("TTS_DTYPE") or ("float16" if device == "mps" else "float32")
    dtype = {"float16": torch.float16, "float32": torch.float32, "bfloat16": torch.bfloat16}[dtype_name]
    port = int(os.environ.get("TTS_PORT", "8765"))

    cv_path = snapshot_download(M.CV_ID, revision=M.CV_REV)
    base_path = snapshot_download(M.BASE_ID, revision=M.BASE_REV)

    eng = types.SimpleNamespace()
    M.load_engine(eng, cv_path, base_path, device=device, dtype=dtype, attn="sdpa")
    api = M.build_api(eng, read_token())
    print(f"[scene-tts] local server on http://127.0.0.1:{port} pid={os.getpid()}", flush=True)
    uvicorn.run(api, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
