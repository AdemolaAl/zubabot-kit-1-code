"""Zubabot voice server: our own voices (Kokoro) and listening (Whisper) on one GPU machine.

The main Zubabot server calls it. Users never reach it directly.
  POST /tts   {"text": "...", "voice": "af_heart", "speed": 1.05, "format": "mp3"}   -> audio/mpeg
  POST /stt   raw audio body (webm / ogg / mp4 / wav), Content-Type: audio/...        -> {"text": "...", "lang": "en", "sec": 3.2}
  GET  /health                                                                       -> {"ok": true, ...}
Every request needs  Authorization: Bearer <VOICE_SERVER_KEY>  (same value as VOICE_SERVER_KEY in the Zubabot .env).

Settings (environment variables, see .env.example in this folder):
  VOICE_SERVER_KEY   shared secret                         (required)
  PORT               default 8090
  KOKORO_MODEL       default models/kokoro-v1.0.onnx
  KOKORO_VOICES      default models/voices-v1.0.bin
  WHISPER_MODEL      default large-v3-turbo   (small = faster, less exact)
  DEVICE             cuda | cpu               default cuda
  TTS_WORKERS        voices made at the same time, default 4
  STT_WORKERS        recordings heard at the same time, default 2
"""
import io, json, os, subprocess, tempfile, threading, time, wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

KEY = os.environ.get("VOICE_SERVER_KEY", "")
PORT = int(os.environ.get("PORT", "8090"))
DEVICE = os.environ.get("DEVICE", "cuda")
if DEVICE == "cuda":
    os.environ.setdefault("ONNX_PROVIDER", "CUDAExecutionProvider")   # Kokoro on the GPU

from kokoro_onnx import Kokoro                    # noqa: E402
from faster_whisper import WhisperModel           # noqa: E402

print("loading voices...", flush=True)
TTS_ON = "unknown"
_M, _V = os.environ.get("KOKORO_MODEL", "models/kokoro-v1.0.onnx"), os.environ.get("KOKORO_VOICES", "models/voices-v1.0.bin")
try:
    import onnxruntime as ort
    _prov = ["CUDAExecutionProvider", "CPUExecutionProvider"] if DEVICE == "cuda" else ["CPUExecutionProvider"]
    _sess = ort.InferenceSession(_M, providers=_prov)
    TTS_ON = _sess.get_providers()[0]
    print("voices run on:", _sess.get_providers(), flush=True)
    if DEVICE == "cuda" and TTS_ON != "CUDAExecutionProvider":
        print("WARNING: voices are running on the CPU, not the GPU. Rebuild the image (see README 'GPU check').", flush=True)
    TTS = Kokoro.from_session(_sess, _V)
except Exception as e:  # older kokoro-onnx without from_session
    print("kokoro from_session not available, using default:", e, flush=True)
    TTS = Kokoro(_M, _V)
VOICES = set(TTS.get_voices())
print("loading listening model...", flush=True)
STT = WhisperModel(os.environ.get("WHISPER_MODEL", "large-v3-turbo"), device=DEVICE, compute_type="float16" if DEVICE == "cuda" else "int8")
TTS_SEM = threading.Semaphore(int(os.environ.get("TTS_WORKERS", "4")))
STT_SEM = threading.Semaphore(int(os.environ.get("STT_WORKERS", "2")))
STATS = {"tts": 0, "stt": 0, "errors": 0, "started": time.time(), "busy_tts": 0, "busy_stt": 0}
PROMPT = "Zubabot, IQ Option, Roland, EUR/USD, OTC, signal, deposit, top up, naira, cedis, gale."


def to_mp3(samples, rate):
    pcm = (np.clip(samples, -1, 1) * 32767).astype(np.int16).tobytes()
    p = subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "s16le", "-ar", str(rate), "-ac", "1", "-i", "pipe:0", "-b:a", "64k", "-f", "mp3", "pipe:1"], input=pcm, capture_output=True, check=True)
    return p.stdout


def to_wav(samples, rate):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes((np.clip(samples, -1, 1) * 32767).astype(np.int16).tobytes())
    return buf.getvalue()


class H(BaseHTTPRequestHandler):
    server_version = "zb-voice/1"

    def log_message(self, fmt, *a):
        pass

    def out(self, code, body, ctype="application/json"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        self.send_response(code); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

    def authed(self):
        if not KEY or self.headers.get("Authorization", "") != "Bearer " + KEY:
            self.out(401, {"ok": False, "error": "bad_key"}); return False
        return True

    def body(self, limit):
        n = int(self.headers.get("Content-Length") or 0)
        if n > limit:
            raise ValueError("too_big")
        return self.rfile.read(n)

    def do_GET(self):
        if self.path.startswith("/health"):
            if not self.authed():
                return
            self.out(200, {"ok": True, "device": DEVICE, "tts_on": TTS_ON, "voices": sorted(VOICES), **STATS, "uptime": int(time.time() - STATS["started"])})
        else:
            self.out(404, {"ok": False})

    def do_POST(self):
        if not self.authed():
            return
        try:
            if self.path.startswith("/tts"):
                d = json.loads(self.body(20000) or b"{}")
                text = str(d.get("text", "")).strip()[:600]
                if not text:
                    return self.out(400, {"ok": False, "error": "empty"})
                voice = d.get("voice") if d.get("voice") in VOICES else "af_heart"
                # the first letter of a Kokoro voice is its language: a American, b British, e Spanish, f French, p Brazilian Portuguese
                lang = {"a": "en-us", "b": "en-gb", "e": "es", "f": "fr-fr", "p": "pt-br", "i": "it", "h": "hi", "j": "ja", "z": "cmn"}.get(voice[:1], "en-us")
                STATS["busy_tts"] += 1
                try:
                    with TTS_SEM:
                        samples, rate = TTS.create(text, voice=voice, speed=float(d.get("speed", 1.0)), lang=lang)
                finally:
                    STATS["busy_tts"] -= 1
                STATS["tts"] += 1
                if d.get("format") == "wav":
                    return self.out(200, to_wav(samples, rate), "audio/wav")
                return self.out(200, to_mp3(samples, rate), "audio/mpeg")
            if self.path.startswith("/stt"):
                raw = self.body(4_000_000)
                if len(raw) < 500:
                    return self.out(200, {"ok": True, "text": "", "sec": 0})
                ext = {"audio/mp4": ".mp4", "audio/ogg": ".ogg", "audio/wav": ".wav", "audio/mpeg": ".mp3"}.get(self.headers.get("Content-Type", "").split(";")[0], ".webm")
                with tempfile.NamedTemporaryFile(suffix=ext) as f:
                    f.write(raw); f.flush()
                    STATS["busy_stt"] += 1
                    try:
                        with STT_SEM:
                            hint = (self.path.split("lang=")[1][:2] if "lang=" in self.path else None) or None    # e.g. /stt?lang=pt
                            segs, info = STT.transcribe(f.name, beam_size=1, vad_filter=True, initial_prompt=PROMPT if not hint or hint == "en" else None, language=hint)
                            text = " ".join(s.text.strip() for s in segs).strip()
                    finally:
                        STATS["busy_stt"] -= 1
                STATS["stt"] += 1
                return self.out(200, {"ok": True, "text": text, "lang": info.language, "sec": round(info.duration, 2)})
            self.out(404, {"ok": False})
        except Exception as e:  # keep serving
            STATS["errors"] += 1
            self.out(500, {"ok": False, "error": str(e)[:200]})


if __name__ == "__main__":
    if not KEY:
        raise SystemExit("Set VOICE_SERVER_KEY first")
    print(f"Zubabot voice server on :{PORT} ({DEVICE})", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
