"""Soundtrack of "Il tavolo che non entrava in macchina": original light score + synthesized SFX + mix with the Italian voice.
Own synthesis only (numpy/scipy via dsp.py and instruments.py). Run from this folder:  python ikea_audio.py
Inputs : ../voice/voice.wav (mono 48 kHz), ../voice/words.json, ../voice/events.json, shot cuts mirrored from story_ikea.ts
Outputs: ../out/audio/mix.wav (48 kHz stereo, exact picture length), music.wav, sfx.wav, cues.md
Mix rules (house standard): voice unchanged, music +3 dB, SFX -6 dB relative to the working levels below; music ducks under speech.
"""
import json, os
import numpy as np
from dsp import SR, ns, tt, rng, lp, hp, bp, place, pan, fades, dbg, make_ir, convolve_st, integrated, true_peak, read_wav, write_wav, modal
import instruments as _I

L = ns(2.0)


def _pad(fn):
    """every sound padded to the same length so layers can simply be added"""
    def w(*a, **k):
        y = np.asarray(fn(*a, **k), float)
        return np.pad(y, (0, max(0, L - len(y))))[:L]
    return w


class _Proxy:
    def __getattr__(self, name): return _pad(getattr(_I, name))


I = _Proxy()

HERE = os.path.dirname(os.path.abspath(__file__))
VOICE = os.path.join(HERE, "..", "voice")
OUT = os.path.join(HERE, "..", "out", "audio")
os.makedirs(OUT, exist_ok=True)

FPS, TOTAL = 30, 2055
DUR = TOTAL / FPS                                    # 68.5 s
CUTS = [0, 162, 444, 627, 696, 846, 1125, 1350, 1692, 1860]   # shot starts (frames) from story_ikea.ts
EV = json.load(open(os.path.join(VOICE, "events.json")))
WORDS = json.load(open(os.path.join(VOICE, "words.json"), encoding="utf-8"))
N = ns(DUR)
Q = 0.5                                              # quarter note, 120 bpm

# working levels (LUFS) before the +3 / -6 dB house rules
VOICE_LUFS, MUSIC_BASE, SFX_BASE = -17.0, -27.0, -19.0
MUSIC_LUFS, SFX_LUFS = MUSIC_BASE + 3.0, SFX_BASE - 6.0


def m2f(m): return 440.0 * 2 ** ((m - 69) / 12.0)


# ------------------------------------------------------------------ SFX (synthesized)
@_pad
def whoosh(dur=0.28, r=None, lo=500, hi=3500):
    r = r or rng(1); n = ns(dur); t = np.arange(n) / SR
    x = bp(r.standard_normal(n), lo, hi, 1) * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    return x * 0.5


@_pad
def thump(f=70, dur=0.35, r=None, vel=1.0):
    r = r or rng(2); t = tt(dur)
    y = np.sin(2 * np.pi * (f + 90 * np.exp(-t / 0.03)) * t) * np.exp(-t / 0.09)
    y += lp(r.standard_normal(len(t)), 900) * np.exp(-t / 0.012) * 0.5
    return fades(y * vel, 0.001, 0.05)


@_pad
def wood_knock(f=210, r=None, vel=1.0, dur=0.3):
    r = r or rng(3)
    y = modal(dur, [(f, 1.0, 0.07), (f * 2.3, 0.5, 0.05), (f * 3.9, 0.25, 0.03)], r)
    t = tt(dur); y += hp(r.standard_normal(len(t)), 1800) * np.exp(-t / 0.002) * 0.4
    return fades(y * vel * 0.7, 0.0005, 0.05)


@_pad
def clang(r=None, vel=1.0, dur=1.4):
    r = r or rng(4)
    y = modal(dur, [(310, 1.0, 0.55), (822, 0.7, 0.4), (1417, 0.5, 0.3), (2250, 0.3, 0.2), (3180, 0.15, 0.12)], r)
    t = tt(dur); y += hp(r.standard_normal(len(t)), 2500) * np.exp(-t / 0.004) * 0.3
    return fades(y * vel * 0.6, 0.0005, 0.1)


@_pad
def puff(r=None, dur=0.35):
    r = r or rng(5); n = ns(dur); t = np.arange(n) / SR
    return bp(r.standard_normal(n), 600, 5000, 1) * np.exp(-t / 0.09) * (1 - np.exp(-t / 0.01)) * 0.55


@_pad
def ratchet(dur, r=None, rate=26):
    r = r or rng(6); buf = np.zeros(ns(dur))
    k = 0
    while k / rate < dur - 0.02:
        c = wood_knock(900 + 80 * r.random(), r, 0.35, 0.05); i = ns(k / rate); buf[i:i + len(c)] += c[: len(buf) - i]; k += 1
    return buf * np.linspace(0.6, 1.0, len(buf))


@_pad
def step(r=None, vel=0.6):
    return thump(95, 0.18, r, vel) * 0.7


@_pad
def ding(r=None, f=1568.0, vel=0.7):
    return I.triangle(vel, r, 1.2, f) * 1.5 + I.glock(f, vel * 0.5, r, 1.0) * 0.5


def rumble(dur, r=None, vel=0.5):
    r = r or rng(7); n = ns(dur); t = np.arange(n) / SR
    base = lp(r.standard_normal(n), 130, 3)
    return base * (0.7 + 0.3 * np.sin(2 * np.pi * 14 * t)) * vel * 1.6


def birds(dur, r=None, density=0.7):
    r = r or rng(8); buf = np.zeros(ns(dur)); t0 = r.random() * 0.8
    while t0 < dur - 0.4:
        m = int(r.integers(2, 5)); f0 = 2800 + 1600 * r.random()
        for k in range(m):
            d = 0.07; tt_ = tt(d); y = np.sin(2 * np.pi * (f0 + 600 * np.sin(k + tt_ * 30) * (1 + k % 2)) * tt_) * np.sin(np.pi * tt_ / d) * 0.08
            i = ns(t0 + k * 0.1)
            if i + len(y) < len(buf): buf[i:i + len(y)] += y
        t0 += (1.5 + 3 * r.random()) / density
    return buf


def breeze(dur, r=None, vel=0.3):
    r = r or rng(9); n = ns(dur)
    env = np.interp(np.arange(n), np.linspace(0, n, 40), 0.6 + 0.4 * r.random(40))
    return lp(r.standard_normal(n), 500, 2) * env * vel * 0.6


def build_sfx():
    buf = np.zeros((2, N)); r = rng(100); log = []
    def put(t, x, g=1.0, p=0.0, what=""):
        place(buf, pan(np.asarray(x, float), p), t, g); log.append((round(t, 2), what))
    # picture: whoosh on every cut, white flash on the hook end
    for i, f in enumerate(CUTS[1:], 2):
        t = f / FPS
        put(t - 0.12, whoosh(0.26, r, 700, 5200), 0.5, 0, f"cut to shot {i}")
    put(CUTS[1] / FPS, thump(60, 0.5, r, 1.1) + I.glock(1318.5, 0.8, r, 1.0) * 0.6, 0.8, 0, "flash after the hook")
    put(EV["tableStuck"], wood_knock(180, r, 1.0) + thump(110, 0.2, r, 0.6), 0.9, -0.2, "table stuck")
    for k, dt in enumerate([0.0, 0.9, 1.8]):
        put(EV["boycott"] + dt, thump(80, 0.25, r, 0.9) + wood_knock(260, r, 0.6), 0.8, 0.3 * (k - 1), f"rival stamp {k+1}")
    put(EV["fairSlam"], clang(r, 1.0) + thump(55, 0.6, r, 1.2), 1.0, 0.0, "fair gate slams")
    for k in range(5):
        put(EV["neutralCrates"] - 0.6 + 0.35 * k, wood_knock(140 + 15 * k, r, 0.9) + puff(r) * 0.2, 0.6, -0.5 + 0.25 * k, f"crate {k+1}")
    put(EV["legsOff"] - 1.0, ratchet(1.0, r), 0.7, -0.1, "unscrewing the legs")
    for k in range(4):
        put(EV["legsOff"] + 0.15 * k, wood_knock(320 - 25 * k, r, 0.9) + thump(120, 0.15, r, 0.5), 0.8, -0.3 + 0.2 * k, f"leg {k+1} pops off")
    put(EV["tableIn"] - 0.55, whoosh(0.5, r, 200, 2500), 0.6, -0.3, "table slides")
    put(EV["tableIn"], thump(65, 0.5, r, 1.2) + wood_knock(150, r, 0.8), 1.0, -0.1, "table lands in the boot")
    for k, m in enumerate([72, 76, 79, 84]):
        put(EV["tableIn"] + 0.15 + 0.1 * k, I.glock(m2f(m), 0.7, r, 1.2), 0.6, 0.0, "ta-da")
    put(EV["poland"] - 6.0, rumble(7.0, r), 0.7, 0.0, "lorry rumble")
    for k in range(5):
        put(EV["airPuffs"] + 0.5 * k, puff(r), 0.7, (k - 2) * 0.2, f"air puff {k+1}")
    for k, f in enumerate([1568.0, 1760.0, 2093.0]):
        put(EV["priceDrop"] + 0.25 * k, ding(r, f, 0.7), 0.6, (k - 1) * 0.3, f"price tag {k+1} drops")
    for k in range(5):
        put(EV["boxCarry"] + 0.1 + 0.55 * k, step(r, 0.5), 0.5, 0.1, f"customer step {k+1}")
    put(EV["reissue"] + 2.2, I.snare(0.8, r) * 0.8 + I.cymbal(0.6, r) * 0.6, 0.8, 0.0, "final rimshot")
    # ambience: birds and breeze in the day exteriors (shots 1-5, 7), breeze in the golden yard
    for a, b in [(0, 696), (1125, 1350)]:
        put(a / FPS, birds((b - a) / FPS, r), 0.7, 0.0, "birds")
    put(0, breeze(DUR, r), 0.5, 0.0, "breeze bed")
    return buf, log


# ------------------------------------------------------------------ music (original, 120 bpm, 4/4)
CH = {"C": (36, [60, 64, 67]), "G": (43, [59, 62, 67]), "Am": (45, [57, 60, 64]), "F": (41, [57, 60, 65]),
      "Dm": (38, [57, 62, 65]), "E7": (40, [56, 62, 64]), "G7": (43, [59, 62, 65]), "Em": (40, [59, 62, 67])}
SCALE = {"C": [72, 74, 76, 79, 81], "G": [71, 74, 76, 79, 83], "Am": [69, 72, 76, 79, 81], "F": [69, 72, 74, 77, 81],
         "Dm": [69, 72, 74, 77, 81], "E7": [68, 71, 74, 76, 80], "G7": [71, 74, 77, 79, 83], "Em": [71, 74, 76, 79, 83]}
# bar plan, 2 s per bar: (start time s) sections follow the picture
PLAN = ([("C", "G")] * 0)
BARS = ["C", "G", "C",                      # 0-6.0   hook: pizzicato, sparse
        "C", "G", "Am", "F",                # 6-14    setting: gentle tune
        "Am", "Dm", "E7", "Am", "Dm", "E7", "Am", "E7",    # 14-30  plotting (minor), rivals and the fair, crates
        "C", "G", "Am", "G7",               # 30-38  Lundgren: tension then release on the table landing
        "C", "F", "C", "G",                 # 38-46  Poland and the cheerful lorry
        "C", "F", "G", "C", "F", "G",       # 46-58  explanation + prices, sunny
        "C", "Am", "F", "G7", "C"]          # 58-68  the customer, the reissue joke
SECTION = lambda t: ("hook" if t < 5.4 else "set" if t < 14.8 else "plot" if t < 28.2 else "tension" if t < 36.5 else "sun" if t < 56.4 else "end")


def build_music():
    buf = np.zeros((2, N)); r = rng(200)
    for bi, ch in enumerate(BARS):
        t0 = bi * 2.0
        if t0 >= DUR: break
        sec = SECTION(t0); bass, tri = CH[ch]
        quiet = sec == "hook"
        bv = 0.5 if not quiet else 0.35
        place(buf, pan(I.pluck(m2f(bass), bv, r, 0.5, 0.4, 0.3), -0.35), t0, 0.9)               # oom: beat 1
        place(buf, pan(I.pluck(m2f(bass + 7 if ch not in ("E7", "G7") else bass), bv * 0.8, r, 0.5, 0.4, 0.3), -0.35), t0 + 1.0, 0.8)  # beat 3
        if not quiet:
            for beat in (0.5, 1.5):                                                               # pah on 2 and 4 (strummed triad)
                for j, m in enumerate(tri):
                    place(buf, pan(I.pluck(m2f(m), 0.38, r, 0.6, 0.35, 0.2), 0.3), t0 + beat + 0.012 * j, 0.55)
                place(buf, pan(I.brush(0.4, r, 0.2), 0.0), t0 + beat, 0.5)
        if sec in ("set", "plot", "tension", "sun", "end"):                                        # tune on glockenspiel / music box
            sc = SCALE[ch]; rb = rng(300 + bi)
            pat = [0, 1, 2, 1] if sec in ("set", "sun") else [2, 1, 0, 1] if sec == "plot" else [0, 2, 1, 3]
            for k in range(4):
                m = sc[(pat[k] + int(rb.integers(0, 2))) % len(sc)] + (12 if sec == "sun" and k == 3 else 0)
                f = I.musicbox if sec in ("set", "end") else I.glock
                place(buf, pan(f(m2f(m), 0.45, r), 0.15), t0 + 0.5 * k + (0.04 if sec == "plot" else 0), 0.7)
        if sec == "tension":                                                                       # swelling ticks before the table lands
            for k in range(8):
                place(buf, pan(I.brush(0.2 + 0.05 * (bi % 4) + 0.03 * k, r, 0.1), 0.0), t0 + 0.25 * k, 0.5)
    # landing chord on "E il tavolo entra" and the closing sting
    for m in (60, 64, 67, 72):
        place(buf, pan(I.glock(m2f(m), 0.8, r, 1.6), 0.0), EV["tableIn"] + 0.15, 0.35)
    for m in (48, 60, 64, 67, 72, 76):
        place(buf, pan(I.pluck(m2f(m), 0.8, r, 1.2, 0.5), 0.0), 67.9, 0.4)
    # gentle reverb
    ir = make_ir(0.9, 11)
    wet = convolve_st(buf, ir)[:, :N]
    return buf + 0.12 * wet


# ------------------------------------------------------------------ mix
def speech_spans(merge=0.3):
    spans = []
    for w in WORDS:
        if spans and w["s"] - spans[-1][1] < merge: spans[-1][1] = w["e"]
        else: spans.append([w["s"], w["e"]])
    return spans


def duck_env(depth=-8.0, pre=0.08, post=0.15, att=0.07, rel=0.45):
    g = np.ones(N)
    for a, b in speech_spans():
        i0, i1 = ns(a - pre), ns(b + post)
        g[max(0, i0):min(N, i1)] = dbg(depth)
    k_a, k_r = np.exp(-1 / (att * SR)), np.exp(-1 / (rel * SR))
    out = np.empty(N); y = 1.0
    for i in range(N):                                   # one-pole smoothing, fast down, slow up
        y = g[i] + (y - g[i]) * (k_a if g[i] < y else k_r)
        out[i] = y
    return out


def limit(x, ceil_db=-1.5):
    c = dbg(ceil_db); pk = np.abs(x).max()
    return x if pk <= c else x * (c / pk)


def main():
    v, sr = read_wav(os.path.join(VOICE, "voice.wav")); assert sr == SR
    v = v[0][:N]; v = np.pad(v, (0, N - len(v)))
    vs = np.stack([v, v])
    print("music..."); music = build_music(); print("sfx..."); sfx, log = build_sfx()
    # level each bus to its target (music: integrated, sfx: max momentary), voice to its LUFS
    voice_b = vs * dbg(VOICE_LUFS - integrated(vs))
    music_b = music * dbg(MUSIC_LUFS - integrated(music)) * duck_env()
    sfx_peak_ref = sfx * dbg(SFX_LUFS - integrated(sfx))
    mix = voice_b + music_b + sfx_peak_ref
    mix = limit(mix)
    for name, x in (("mix", mix), ("music", music_b), ("sfx", sfx_peak_ref)):
        write_wav(os.path.join(OUT, f"{name}.wav"), x)
    I_l = integrated(mix); tp = true_peak(mix)
    with open(os.path.join(OUT, "cues.md"), "w") as f:
        f.write(f"# Cues - Il tavolo che non entrava in macchina\n\nmix: {I_l:.1f} LUFS integrated, true peak {tp:.1f} dBTP, {DUR:.2f} s\n"
                f"levels (LUFS): voice {VOICE_LUFS}, music {MUSIC_LUFS} (base {MUSIC_BASE} +3), sfx {SFX_LUFS} (base {SFX_BASE} -6), music ducked -8 dB under speech\n\n| t (s) | cue |\n|---|---|\n")
        for t, w in sorted(log): f.write(f"| {t} | {w} |\n")
    print(f"mix {I_l:.1f} LUFS, true peak {tp:.1f} dBTP")


if __name__ == "__main__":
    main()
