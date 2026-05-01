"""TTS engine abstraction.

The app's frontend always talks to the same two endpoints — /api/tts/voices
and /api/tts/synthesize. Internally we pick one of the registered engines
based on the `tts_provider` setting. Adding a new engine later is just
implementing the TTSEngine interface and registering it in ENGINES; no
frontend changes required.

Default engine: KokoroLocalEngine — runs Kokoro-82M directly in this
Python process via the `kokoro-onnx` pip package. The model files
(~330 MB total) are downloaded on first use into ~/.cache/kokoro_onnx
and reused across runs.
"""

from __future__ import annotations

import asyncio
import io
import os
import urllib.request
from pathlib import Path
from typing import Optional


# Where Kokoro stores its ONNX weights and voice bank between runs.
KOKORO_CACHE_DIR = Path(os.environ.get("KOKORO_CACHE_DIR", str(Path.home() / ".cache" / "kokoro_onnx")))

# Pinned URLs of the model + voices. v0.19 is the original public release;
# v1.0 is current. We stick with v1.0 for the wider voice catalogue.
KOKORO_MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
KOKORO_VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"


class TTSEngine:
    """Abstract interface every TTS backend implements."""

    async def list_voices(self) -> list[str]:
        raise NotImplementedError

    async def synthesize(self, text: str, voice: str) -> bytes:
        """Return the audio as a WAV byte string."""
        raise NotImplementedError


def _download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    print(f"  [TTS] Downloading {url} -> {dest} ...", flush=True)
    with urllib.request.urlopen(url) as r, open(tmp, "wb") as f:
        while True:
            chunk = r.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)
    tmp.replace(dest)
    print(f"  [TTS] Saved {dest} ({dest.stat().st_size // (1024 * 1024)} MB)", flush=True)


class KokoroLocalEngine(TTSEngine):
    """Kokoro-82M ONNX model loaded in-process via kokoro-onnx."""

    def __init__(self):
        self._kokoro = None
        self._lock = asyncio.Lock()
        self._load_failed: Optional[str] = None
        self._voices_cache: Optional[list[str]] = None

    async def _ensure_loaded(self):
        if self._kokoro is not None or self._load_failed:
            return
        async with self._lock:
            if self._kokoro is not None or self._load_failed:
                return
            try:
                model_path = KOKORO_CACHE_DIR / "kokoro-v1.0.onnx"
                voices_path = KOKORO_CACHE_DIR / "voices-v1.0.bin"
                # First-run download. Both files together are ~330 MB.
                if not model_path.exists():
                    await asyncio.to_thread(_download, KOKORO_MODEL_URL, model_path)
                if not voices_path.exists():
                    await asyncio.to_thread(_download, KOKORO_VOICES_URL, voices_path)

                from kokoro_onnx import Kokoro
                self._kokoro = await asyncio.to_thread(Kokoro, str(model_path), str(voices_path))
                print("  [TTS] Kokoro-82M ready.", flush=True)
            except Exception as e:
                self._load_failed = f"{type(e).__name__}: {e}"
                print(f"  [TTS] Kokoro load failed: {self._load_failed}", flush=True)
                raise

    async def list_voices(self) -> list[str]:
        await self._ensure_loaded()
        if self._voices_cache is None:
            try:
                names = await asyncio.to_thread(self._kokoro.get_voices)
                self._voices_cache = sorted(list(names))
            except Exception:
                self._voices_cache = []
        return self._voices_cache

    async def synthesize(self, text: str, voice: str) -> bytes:
        await self._ensure_loaded()
        if self._kokoro is None:
            raise RuntimeError(f"Kokoro failed to load: {self._load_failed}")
        voices = await self.list_voices()
        if not voice or voice not in voices:
            voice = voices[0] if voices else "af_bella"

        import numpy as np
        import soundfile as sf

        def _run():
            samples, sample_rate = self._kokoro.create(text, voice=voice, speed=1.0, lang="en-us")
            arr = np.asarray(samples, dtype=np.float32)
            return arr, sample_rate

        audio, sample_rate = await asyncio.to_thread(_run)
        buf = io.BytesIO()
        sf.write(buf, audio, sample_rate, format="WAV")
        return buf.getvalue()


# Registry of available engines. Adding a new engine = implement TTSEngine,
# put it here, expose its name in the frontend's tts_provider dropdown.
ENGINES: dict[str, type[TTSEngine]] = {
    "kokoro-local": KokoroLocalEngine,
}

# Singleton engine instance per provider name. Lazily constructed.
_instances: dict[str, TTSEngine] = {}


def get_engine(provider: str = "kokoro-local") -> TTSEngine:
    if provider not in ENGINES:
        # Fall back to kokoro-local rather than 500-ing the call.
        provider = "kokoro-local"
    if provider not in _instances:
        _instances[provider] = ENGINES[provider]()
    return _instances[provider]


def list_providers() -> list[str]:
    return list(ENGINES.keys())
