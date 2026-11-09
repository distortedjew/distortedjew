"""Musica di sottofondo ed effetti sonori sintetizzati da codice (numpy + ffmpeg): gratis e senza licenze.
Genera in assets/generated/{music,sfx}/*.mp3. Per musica 'vera' metti i tuoi mp3 in assets/music/{calm,tense,joy,sad}.mp3 (hanno la precedenza)."""
import subprocess
import wave
from pathlib import Path

import numpy as np

SR = 44100
ROOT = Path(__file__).resolve().parent.parent
GEN = ROOT / "assets" / "generated"
SFX = ["whoosh", "boom", "impact", "thunder", "ding", "bell", "tick", "paper", "heartbeat", "knock", "clang", "stinger",
       "steps", "steps_run", "amb_wind", "amb_waves", "amb_rain", "amb_fire", "amb_birds", "amb_crickets", "amb_city",
       "amb_forest", "amb_room", "amb_cave"]
MOODS = ["calm", "tense", "joy", "sad"]
rs = np.random.default_rng(7)


def t_(d):  # asse tempi
    return np.arange(int(d * SR)) / SR


def noise(d):
    return rs.standard_normal(int(d * SR))


def band(x, lo=None, hi=None):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); m = np.ones_like(f)
    if lo: m[f < lo] = 0
    if hi: m[f > hi] = 0
    return np.fft.irfft(X * m, len(x))


def norm(x, peak=0.85):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak


def exp_env(d, tau, attack=0.003):
    t = t_(d); return np.minimum(1, t / attack) * np.exp(-t / tau)


def add(buf, x, at):
    i = int(at * SR); j = min(len(buf), i + len(x))
    if i < len(buf): buf[i:j] += x[:j - i]


def loopify(x, fade=0.5):
    f = int(fade * SR); out = x[:-f].copy(); w = np.linspace(0, 1, f)
    out[:f] = out[:f] * w + x[-f:] * (1 - w); return out


def thump(freq, d, tau):
    t = t_(d); ph = 2 * np.pi * np.cumsum(freq * (1 + 1.0 * np.exp(-t / 0.05))) / SR
    return np.sin(ph) * exp_env(d, tau)


# ---------- effetti ----------
def s_whoosh():
    d = 0.8; t = t_(d); n = noise(d); out = np.zeros_like(t)
    for (lo, hi), c in [((150, 700), 0.28), ((700, 2500), 0.38), ((2500, 8000), 0.48)]:
        out += band(n, lo, hi) * np.exp(-((t - c) ** 2) / 0.012)
    return out * np.sin(np.pi * t / d) ** 1.5


def s_boom():
    return thump(48, 2.4, 0.7) + 0.5 * band(noise(2.4), None, 220) * exp_env(2.4, 0.25)


def s_impact():
    return thump(70, 1.3, 0.25) + 0.7 * band(noise(1.3), None, 2500) * exp_env(1.3, 0.06)


def s_thunder():
    d = 3.8; t = t_(d); return band(noise(d), None, 260) * np.exp(-t / 1.4) * (1 + 0.6 * np.sin(t * 7.5)) * np.minimum(1, t / 0.03)


def s_ding():
    t = t_(1.6); return sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / tau) for f, a, tau in [(880, 1, 0.5), (1760, 0.4, 0.3), (2640, 0.2, 0.2)])


def s_bell():
    t = t_(3.2); return sum(a * np.sin(2 * np.pi * 440 * r * t) * np.exp(-t / tau) for r, a, tau in [(1, 1, 1.4), (2.76, 0.6, 0.9), (5.4, 0.35, 0.5), (8.93, 0.2, 0.3)])


def s_tick():
    return (np.sin(2 * np.pi * 1900 * t_(0.12)) * exp_env(0.12, 0.012) + 0.4 * band(noise(0.12), 2000, None) * exp_env(0.12, 0.006))


def s_paper():
    d = 0.7; n = band(noise(d), 1800, 9000); t = t_(d)
    return n * (0.5 + 0.5 * np.abs(np.sin(t * 38 + np.cumsum(rs.standard_normal(len(t))) * 0.02))) * np.sin(np.pi * t / d) ** 0.7


def s_heartbeat():
    b = np.zeros(int(1.7 * SR))
    for at in [0.0, 0.22, 0.85, 1.07]: add(b, thump(58, 0.4, 0.09) * (1 if at in (0.0, 0.85) else 0.7), at)
    return b


def s_knock():
    b = np.zeros(int(1.1 * SR))
    for at in [0.0, 0.26, 0.5]: add(b, thump(150, 0.18, 0.03) + 0.4 * band(noise(0.18), 300, 2500) * exp_env(0.18, 0.015), at)
    return b


def s_clang():
    t = t_(1.6); return sum(a * np.sin(2 * np.pi * 520 * r * t) * np.exp(-t / tau) for r, a, tau in [(1, 1, 0.35), (2.4, 0.7, 0.25), (3.9, 0.5, 0.18), (5.7, 0.3, 0.12)]) + band(noise(1.6), 2500, None) * exp_env(1.6, 0.03)


def s_stinger():
    d = 2.8; t = t_(d); env = np.minimum(1, t / 0.9) * np.exp(-np.maximum(0, t - 0.9) / 0.9)
    return env * sum(np.sign(np.sin(2 * np.pi * f * t)) * 0.15 + np.sin(2 * np.pi * f * t) for f in [233, 247, 311, 466])


def _steps(d, gap):
    b = np.zeros(int(d * SR))
    for k in range(int(d / gap)):
        add(b, (band(noise(0.12), 150, 1400) * exp_env(0.12, 0.03) + 0.6 * thump(95, 0.12, 0.035)) * (0.9 if k % 2 else 1.0), k * gap + rs.uniform(0, 0.02))
    return b


# ---------- ambienti (loop 10 s) ----------
def s_amb_wind():
    t = t_(11); return band(noise(11), 120, 900) * (0.5 + 0.35 * np.sin(2 * np.pi * 0.17 * t) + 0.15 * np.sin(2 * np.pi * 0.41 * t))


def s_amb_waves():
    t = t_(11); return band(noise(11), 100, 1800) * (0.15 + 0.85 * (0.5 + 0.5 * np.sin(2 * np.pi * t / 5 - 1.2)) ** 2)


def s_amb_rain():
    return band(noise(11), 1800, 9000) * 0.6 + band(noise(11), 300, 1200) * 0.15


def s_amb_fire():
    b = band(noise(11), 60, 350) * 0.5
    for _ in range(90): add(b, band(noise(0.03), 800, 6000) * exp_env(0.03, 0.006) * rs.uniform(0.3, 1.2), rs.uniform(0, 10.9))
    return b


def _chirp(d=0.12, f0=2600, f1=4200):
    t = t_(d); ph = 2 * np.pi * np.cumsum(np.linspace(f0, f1, len(t))) / SR
    return np.sin(ph) * np.sin(np.pi * t / d) ** 2


def s_amb_birds(n=14, wind=0.15):
    b = s_amb_wind() * wind
    for _ in range(n):
        at = rs.uniform(0, 10.4); f0 = rs.uniform(2200, 3600)
        for k in range(rs.integers(2, 5)): add(b, _chirp(0.09, f0, f0 + rs.uniform(500, 1500)) * 0.5, at + k * 0.12)
    return b


def s_amb_crickets():
    t = t_(11); b = np.zeros_like(t)
    for f in [4100, 4400]:
        b += np.sin(2 * np.pi * f * t) * (np.sin(2 * np.pi * 22 * t) > 0.3) * (0.5 + 0.5 * np.sin(2 * np.pi * (0.7 + f / 20000) * t)) ** 2
    return b * 0.3 + s_amb_wind() * 0.04


def s_amb_city():
    t = t_(11); return band(noise(11), 120, 700) * (0.55 + 0.25 * np.sin(2 * np.pi * 0.3 * t)) + band(noise(11), 700, 2200) * 0.12 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.9 * t))


def s_amb_forest():
    return s_amb_birds(6, 0.9) * 0.5 + band(noise(11), 2000, 5000) * 0.02


def s_amb_room():
    b = band(noise(11), 60, 300) * 0.25
    for k in range(10): add(b, band(noise(0.03), 1200, 4000) * exp_env(0.03, 0.005) * (0.6 if k % 2 else 1), k + 0.5)
    return b


def s_amb_cave():
    b = band(noise(11), 40, 160) * 0.8
    for _ in range(5):
        at = rs.uniform(0.2, 10.2); f = rs.uniform(900, 1500)
        add(b, np.sin(2 * np.pi * f * t_(0.25) * (1 + 0.5 * np.exp(-t_(0.25) / 0.03))) * exp_env(0.25, 0.05) * 0.5, at)
    return b


# ---------- musica ----------
def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)


def pad(notes, d):
    t = t_(d); out = np.zeros_like(t)
    for m in notes:
        for det in (-0.003, 0.0, 0.003):
            f = mtof(m) * (1 + det)
            for h, a in [(1, 1), (2, 0.4), (3, 0.2), (4, 0.1)]: out += a * np.sin(2 * np.pi * f * h * t + det * 50)
    att, rel = min(0.9, d / 3), min(1.2, d / 3)
    return out * np.minimum(1, t / att) * np.minimum(1, (d - t) / rel) / (len(notes) * 3)


def pluck(m, d=1.4, soft=False):
    t = t_(d); f = mtof(m)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t / (0.9 if soft else 0.5)) + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.3) + 0.12 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t / 0.15)
    return s * np.minimum(1, t / 0.006)


def bass(m, d):
    t = t_(d); f = mtof(m); return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t)) * np.minimum(1, t / 0.03) * np.minimum(1, (d - t) / 0.2)


def shaker():
    return band(noise(0.08), 5500, None) * exp_env(0.08, 0.02)


MOOD = {
    "calm": dict(bpm=72, prog=[[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 52]], arp=True, soft=True, drums=False, up=12),
    "sad": dict(bpm=56, prog=[[45, 48, 52], [41, 45, 48], [48, 52, 55], [43, 47, 50]], arp=True, soft=True, drums=False, up=12, slow=True),
    "joy": dict(bpm=108, prog=[[43, 47, 50], [38, 42, 45], [40, 43, 47], [48, 52, 55]], arp=True, soft=False, drums=True, up=24),
    "tense": dict(bpm=84, prog=[[38, 41, 45, 51], [34, 38, 41, 47], [43, 46, 50, 51], [45, 49, 52, 58]], arp=False, soft=True, drums=False, up=24, tense=True),
}


def music(mood):
    p = MOOD[mood]; beat = 60 / p["bpm"]; bar = 4 * beat
    reps = int(np.ceil(50 / (4 * bar))); total = bar * 4 * reps
    buf = np.zeros(int(total * SR) + SR * 3)
    for r in range(reps):
        for c, ch in enumerate(p["prog"]):
            t0 = (r * 4 + c) * bar
            add(buf, pad(ch, bar + 0.5), t0 - 0.25 if t0 > 0 else 0) if True else None
            add(buf, bass(ch[0] - 12, bar - 0.1) * 0.9, t0)
            if p.get("tense"):
                add(buf, pad([ch[0] + 24, ch[0] + 25], bar + 0.5) * 0.25, t0)
                for k in range(4): add(buf, thump(55, 0.35, 0.09) * (0.9 if k % 2 == 0 else 0.55), t0 + k * beat * 1.0 + (0.5 * beat if k % 2 else 0))
                if c % 2 == 0: add(buf, pluck(ch[-1] + 24, 2.5, True) * 0.5, t0 + 2 * beat)
            elif p["arp"]:
                step = beat * (2 if p.get("slow") else 0.5)
                n = int(bar / step)
                for k in range(n):
                    note = ch[(k * (1 if p.get("slow") else 2) + (k // len(ch))) % len(ch)] + p["up"]
                    add(buf, pluck(note, 1.6, p["soft"]) * (0.55 if p["soft"] else 0.7), t0 + k * step)
            if p["drums"]:
                for k in range(4):
                    if k % 2 == 0: add(buf, thump(60, 0.3, 0.1) * 0.8, t0 + k * beat)
                    add(buf, shaker() * 0.35, t0 + k * beat + 0.5 * beat)
    out = buf[:int(total * SR)]
    return out


def _write(name: str, x: np.ndarray, out: Path, post: str | None = None, peak=0.85):
    x = norm(np.asarray(x, dtype=np.float64), peak)
    wav = out.with_suffix(".wav")
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype(np.int16).tobytes())
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav)]
    if post: cmd += ["-af", post]
    subprocess.run(cmd + ["-ac", "2", "-b:a", "128k", str(out)], check=True)
    wav.unlink()


def ensure_assets(force: bool = False) -> Path:
    (GEN / "sfx").mkdir(parents=True, exist_ok=True); (GEN / "music").mkdir(parents=True, exist_ok=True)
    fns = {k: globals()[f"s_{k}"] for k in SFX if k not in ("steps", "steps_run")}
    fns["steps"] = lambda: _steps(4, 0.5); fns["steps_run"] = lambda: _steps(3, 0.28)
    for name in SFX:
        out = GEN / "sfx" / f"{name}.mp3"
        if out.exists() and not force: continue
        x = fns[name](); x = loopify(x, 0.5) if name.startswith("amb_") else x
        _write(name, x, out, post="aecho=0.7:0.5:70:0.25" if name in ("boom", "impact", "clang", "stinger", "bell") else None)
    for mood in MOODS:
        out = GEN / "music" / f"{mood}.mp3"
        if out.exists() and not force: continue
        _write(mood, music(mood), out, post="lowpass=f=7000,aecho=0.8:0.6:90|180:0.35|0.2", peak=0.8)
    return GEN


if __name__ == "__main__":
    print(ensure_assets(force=True))
