"""Immagini gratuite: Pollinations (nessuna chiave) o Hugging Face FLUX (HF_TOKEN gratuito). 'placeholder' per i test."""
import hashlib
import io
import os
import time
import urllib.parse
from pathlib import Path

import requests
from PIL import Image, ImageDraw


def _valid(data: bytes, w: int, h: int) -> bool:
    try:
        im = Image.open(io.BytesIO(data))
        im.verify()
        return im.size[0] >= w // 2
    except Exception:  # noqa: BLE001
        return False


def _pollinations(prompt: str, w: int, h: int, seed: int) -> bytes:
    url = ("https://image.pollinations.ai/prompt/" + urllib.parse.quote(prompt[:900]) +
           f"?width={w}&height={h}&seed={seed}&model=flux&nologo=true&enhance=false")
    r = requests.get(url, timeout=180)
    r.raise_for_status()
    return r.content


def _huggingface(prompt: str, w: int, h: int, seed: int) -> bytes:
    r = requests.post(
        "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell",
        headers={"Authorization": f"Bearer {os.environ['HF_TOKEN']}"},
        json={"inputs": prompt, "parameters": {"width": w, "height": h, "seed": seed}}, timeout=180)
    r.raise_for_status()
    return r.content


def _placeholder(prompt: str, w: int, h: int, seed: int) -> bytes:
    hue = int(hashlib.md5(prompt.encode()).hexdigest()[:6], 16)
    im = Image.new("RGB", (w, h), ((hue >> 16) & 255, (hue >> 8) & 255, hue & 255))
    ImageDraw.Draw(im).text((40, 40), prompt[:80], fill="white")
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


PROVIDERS = {"pollinations": _pollinations, "huggingface": _huggingface, "placeholder": _placeholder}


def generate_image(cfg: dict, prompt: str, out: Path, seed: int, provider: str | None = None) -> bool:
    """True se generata; False se tutti i tentativi falliscono (il chiamante riusa l'immagine precedente)."""
    fn = PROVIDERS[provider or cfg["image_provider"]]
    w, h = cfg["image_width"], cfg["image_height"]
    for attempt in range(5):
        try:
            data = fn(prompt, w, h, seed + attempt)
            if _valid(data, w, h):
                Image.open(io.BytesIO(data)).convert("RGB").resize((w, h)).save(out, "JPEG", quality=92)
                return True
        except Exception:  # noqa: BLE001
            pass
        time.sleep(4 * (attempt + 1))
    return False
