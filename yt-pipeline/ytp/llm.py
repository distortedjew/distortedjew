"""Gemini (free tier di Google AI Studio) per idee e script. Serve GEMINI_API_KEY."""
import json
import os
import re
import time

import requests

MODELS = [os.getenv("GEMINI_MODEL", "gemini-2.5-flash"), "gemini-2.5-flash-lite"]
URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def gemini_json(prompt: str, temperature: float = 0.9, retries: int = 5):
    key = os.environ["GEMINI_API_KEY"]
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": temperature, "responseMimeType": "application/json"},
    }
    last = None
    for attempt in range(retries):
        model = MODELS[min(attempt // 3, len(MODELS) - 1)]
        try:
            r = requests.post(URL.format(model=model), json=body,
                              headers={"x-goog-api-key": key}, timeout=120)
            if r.status_code in (429, 500, 503):
                raise RuntimeError(f"{r.status_code}: {r.text[:200]}")
            r.raise_for_status()
            text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
            text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
            return json.loads(text)
        except Exception as e:  # noqa: BLE001 - retry su qualsiasi errore transitorio/parsing
            last = e
            time.sleep(min(60, 5 * 2 ** attempt))
    raise RuntimeError(f"Gemini fallito dopo {retries} tentativi: {last}")
