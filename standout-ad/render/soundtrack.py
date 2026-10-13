"""Synthesize the Standout ad soundtrack (music bed + UI sound design).

Everything is generated from scratch with numpy/scipy, no samples.
The music follows the 128 BPM / 8-bar structure of index.html; SFX are placed
from the cue sheet exported by `node render/capture.mjs cues cues.json`.

    python3 render/soundtrack.py cues.json soundtrack.wav
"""
import json
import sys
import wave

import numpy as np
from scipy import signal

SR = 48000
DUR = 15.0
N = int(DUR * SR)
BPM = 128
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(20261013)


def bar(n, beat=0.0):
    return (n - 1) * BAR + beat * BEAT


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tax(n):
    return np.arange(n) / SR


def noise(n):
    return rng.standard_normal(n)


def sos(kind, f, order=2, q=None):
    if kind == "bp":
        lo, hi = f
        return signal.butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return signal.butter(order, f, btype=kind, fs=SR, output="sos")


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x)


def svf(x, fc, q=1.0, mode="bp"):
    """Time-varying TPT state-variable filter (fc may be an array)."""
    fc = np.broadcast_to(np.asarray(fc, float), x.shape)
    g = np.tan(np.pi * np.clip(fc, 20, SR * 0.45) / SR)
    k = 1.0 / q
    a1 = 1 / (1 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    out = np.empty_like(x)
    ic1 = ic2 = 0.0
    for i in range(len(x)):
        v3 = x[i] - ic2
        v1 = a1[i] * ic1 + a2[i] * v3
        v2 = ic2 + a2[i] * ic1 + a3[i] * v3
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        out[i] = v1 if mode == "bp" else v2 if mode == "lp" else x[i] - k * v1 - v2
    return out


def adsr(n, a=0.005, d=0.1, s=0.7, r=0.1, hold=None):
    t = tax(n)
    hold = (n / SR - r) if hold is None else hold
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    rel = np.clip((t - hold) / max(r, 1e-6), 0, 1)
    return e * (1 - rel)


class Bus:
    def __init__(self):
        self.x = np.zeros((2, N + SR * 3))

    def add(self, t, sig, gain=1.0, pan=0.0):
        """Place mono (or stereo) `sig` at time t with constant-power pan."""
        i = int(round(t * SR))
        if i < 0:
            sig = sig[..., -i:]
            i = 0
        if sig.ndim == 1:
            th = (np.clip(pan, -1, 1) + 1) * np.pi / 4
            sig = np.vstack([sig * np.cos(th), sig * np.sin(th)])
        n = min(sig.shape[1], self.x.shape[1] - i)
        if n > 0:
            self.x[:, i:i + n] += sig[:, :n] * gain


drums, bass, music, sfx, verb = Bus(), Bus(), Bus(), Bus(), Bus()


# ----------------------------------------------------------------- instruments
def kick(f0=175, f1=50, pd=0.03, ad=0.27, click=0.65):
    n = int(0.6 * SR)
    t = tax(n)
    f = f1 + (f0 - f1) * np.exp(-t / pd)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / ad)
    clk = filt(noise(n), "hp", 1800) * np.exp(-t / 0.0025) * click
    x = body + clk
    return np.tanh(1.6 * x) / np.tanh(1.6)


def clap():
    n = int(0.5 * SR)
    t = tax(n)
    src = filt(noise(n), "bp", (1100, 4800), 2)
    env = np.zeros(n)
    for k, off in enumerate([0, 0.009, 0.019, 0.028]):
        tt = t - off
        env += np.where(tt >= 0, np.exp(-np.maximum(tt, 0) / (0.006 if k < 3 else 0.11)), 0)
    return src * env * 0.9


def hat(open_=False):
    n = int((0.35 if open_ else 0.08) * SR)
    t = tax(n)
    metal = sum(signal.square(2 * np.pi * f * t) for f in (317, 449, 543, 671, 829, 1011)) / 6
    x = filt(filt(0.6 * noise(n) + 0.4 * metal, "hp", 6500, 2), "lp", 13000, 2)
    return x * np.exp(-t / (0.12 if open_ else 0.022))


def snare(tone=0.4):
    n = int(0.25 * SR)
    t = tax(n)
    x = filt(noise(n), "bp", (1200, 7000)) * np.exp(-t / 0.07)
    x += tone * np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05)
    return x


def crash(length=1.8):
    n = int(length * SR)
    t = tax(n)
    x = filt(noise(n), "hp", 3500, 2) * np.exp(-t / (length / 4.5))
    return np.vstack([x, np.roll(filt(noise(n), "hp", 3500, 2), 17) * np.exp(-t / (length / 4.5))])


def saw(f, t, detune=0.0):
    return signal.sawtooth(2 * np.pi * f * (1 + detune) * t + rng.uniform(0, 6.28))


def pad_note(f, dur, a=0.25, r=0.4):
    n = int((dur + r) * SR)
    t = tax(n)
    L = sum(saw(f, t, d) for d in (-0.006, 0.0021, 0.0047)) / 3
    R = sum(saw(f, t, d) for d in (0.006, -0.0019, -0.0043)) / 3
    env = adsr(n, a=a, d=0.6, s=0.85, r=r, hold=dur)
    return np.vstack([L, R]) * env


def pluck(f, dur=0.22, bright=1.0):
    n = int(dur * SR)
    t = tax(n)
    x = (np.sin(2 * np.pi * f * t) + 0.45 * bright * np.sin(4 * np.pi * f * t) + 0.22 * bright * np.sin(6 * np.pi * f * t)
         + 0.12 * bright * np.sin(8 * np.pi * f * t) * np.exp(-t / 0.03))
    return x * np.exp(-t / (dur / 4)) * np.clip(t / 0.002, 0, 1)


def bass_note(f, dur):
    n = int(dur * SR)
    t = tax(n)
    x = 0.75 * saw(f, t) + 0.42 * np.sin(2 * np.pi * f * t) + 0.18 * signal.square(2 * np.pi * 2 * f * t)
    cut = 420 + 1900 * np.exp(-t / 0.07)
    x = svf(x, cut, q=0.9, mode="lp")
    return x * adsr(n, a=0.004, d=0.12, s=0.75, r=0.03, hold=dur - 0.03)


# ----------------------------------------------------------------- SFX palette
def whoosh(d=0.5, f0=400, f1=3000, pan=0.0, pan1=None):
    n = int(d * SR)
    u = np.linspace(0, 1, n)
    fc = f0 * (f1 / f0) ** u
    x = svf(noise(n), fc, q=1.4) * 1.6
    env = np.sin(np.pi * np.clip(u / 0.62, 0, 1) / 2) ** 2 * np.clip((1 - u) / 0.38, 0, 1) ** 1.5
    x = x * env
    if pan1 is None:
        return x, pan
    p = np.linspace(pan, pan1, n)
    th = (p + 1) * np.pi / 4
    return np.vstack([x * np.cos(th), x * np.sin(th)]), 0.0


def ping(f):
    n = int(0.9 * SR)
    t = tax(n)
    fb = f * (1 + 0.02 * np.exp(-t / 0.03))               # slight downward pitch bend
    ph = 2 * np.pi * np.cumsum(fb) / SR
    x = np.sin(ph) + 0.3 * np.sin(2 * ph)                 # + one octave harmonic
    return x * np.exp(-t / 0.2) * np.clip(t / 0.002, 0, 1)


def sparkle():
    n = int(0.16 * SR)
    t = tax(n)
    f = 2400 * (2 ** (t / 0.15))                          # 2400 -> 4800 Hz
    x = signal.sawtooth(2 * np.pi * np.cumsum(f) / SR, 0.5)   # triangle
    return x * np.exp(-t / 0.05)


def check():
    out = np.zeros(int(0.24 * SR))
    for k, f in enumerate((1200, 1800)):
        n = int(0.1 * SR)
        t = tax(n)
        out[int(k * 0.1 * SR):int(k * 0.1 * SR) + n] += np.sin(2 * np.pi * f * t) * np.exp(-t / 0.035)
    return out


def boop(f0=400, f1=900):
    n = int(0.16 * SR)
    t = tax(n)
    f = f0 + (f1 - f0) * np.clip(t / 0.09, 0, 1)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.06)
    clickn = int(0.002 * SR)
    x[:clickn] += 0.25 * signal.square(2 * np.pi * 2000 * t[:clickn])
    return x


def plip(f=1046.5):
    n = int(0.25 * SR)
    t = tax(n)
    fr = f * (0.6 + 0.4 * np.clip(t / 0.03, 0, 1))
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t / 0.07) * np.clip(t / 0.001, 0, 1)


def impact(soft=False):
    n = int(2.4 * SR)
    t = tax(n)
    f = 42 + 38 * np.exp(-t / 0.22)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (0.7 if not soft else 0.45))
    hit = filt(noise(n), "lp", 2500) * np.exp(-t / 0.08)
    x = boom + 0.5 * hit
    return np.tanh(1.3 * x)


def riser(d):
    n = int(d * SR)
    u = np.linspace(0, 1, n)
    fc = 300 * (9000 / 300) ** (u ** 1.3)
    x = svf(noise(n), fc, q=2.2) * 1.5
    tone = signal.sawtooth(2 * np.pi * np.cumsum(180 * 8 ** u) / SR) * 0.15
    tone = filt(tone, "lp", 3000)
    return (x + tone) * (u ** 2.2)


def revcym(d):
    c = crash(d + 0.4)[:, :int(d * SR)]
    return c[:, ::-1] * np.linspace(0.2, 1, c.shape[1]) ** 2


def swish(d=0.38):
    x, _ = whoosh(d, 1800, 7000)
    return x


def shimmer(d=0.6, n=34):
    out = np.zeros((2, int((d + 0.1) * SR)))
    for k in range(n):
        at = rng.uniform(0, d) * (k / n) ** 0.5 * 1.4
        at = min(at, d)
        f = rng.uniform(2200, 6500)
        m = int(0.05 * SR)
        t = tax(m)
        b = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.012) * rng.uniform(0.3, 1)
        p = rng.uniform(-0.9, 0.9)
        i = int(at * SR)
        th = (p + 1) * np.pi / 4
        out[0, i:i + m] += b * np.cos(th)
        out[1, i:i + m] += b * np.sin(th)
    return out


def scan(d):
    n = int(d * SR)
    u = np.linspace(0, 1, n)
    x = svf(noise(n), 900 + 2200 * np.sin(np.pi * u), q=3.0)
    hum = np.sin(2 * np.pi * np.cumsum(520 + 180 * u) / SR) * 0.15
    env = np.sin(np.pi * u) ** 1.2
    p = np.linspace(-0.85, 0.85, n)
    th = (p + 1) * np.pi / 4
    y = (x + hum) * env
    return np.vstack([y * np.cos(th), y * np.sin(th)])


def thump():
    n = int(0.25 * SR)
    t = tax(n)
    f = 50 + 60 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.08)


def typing(d, n):
    out = np.zeros(int((d + 0.1) * SR))
    for k in range(n):
        at = d * k / n + rng.uniform(-0.008, 0.008)
        m = int(0.03 * SR)
        t = tax(m)
        c = filt(noise(m), "bp", (2000, 6000)) * np.exp(-t / 0.004)
        c += 0.5 * np.sin(2 * np.pi * rng.uniform(260, 340) * t) * np.exp(-t / 0.008)
        i = max(0, int(at * SR))
        out[i:i + m] += c * rng.uniform(0.55, 1.0)
    return out


def counter(d, n):
    out = np.zeros(int((d + 0.1) * SR))
    for k in range(1, n + 1):
        g = k / n
        u = 1 - (1 - g) ** 0.25                            # inverse of the gauge's ease-out-quart
        m = int(0.03 * SR)
        t = tax(m)
        f = 900 + 1500 * g
        i = int(u * d * SR)
        out[i:i + m] += np.sin(2 * np.pi * f * t) * np.exp(-t / 0.008)
    return out


def sweep(d):
    n = int(d * SR)
    u = np.linspace(0, 1, n)
    g = 1 - (1 - u) ** 4
    return np.sin(2 * np.pi * np.cumsum(260 + 520 * g) / SR) * np.sin(np.pi * u) ** 0.7 * 0.5


def bell(f, d=1.2, idx=1.6, ratio=3.5):
    n = int(d * SR)
    t = tax(n)
    mod = idx * np.exp(-t / 0.25) * np.sin(2 * np.pi * f * ratio * t)
    return np.sin(2 * np.pi * f * t + mod) * np.exp(-t / (d / 3.5)) * np.clip(t / 0.002, 0, 1)


def notify():
    out = np.zeros(int(0.9 * SR))
    for k, f in enumerate((midi(84), midi(91))):           # C6 -> G6
        b = bell(f, 0.7, 1.1, 2.0)
        i = int(k * 0.085 * SR)
        out[i:i + len(b)] += b[:len(out) - i]
    return out


def flick():
    n = int(0.09 * SR)
    t = tax(n)
    x = svf(noise(n), np.linspace(4200, 1500, n), q=1.2)
    return x * np.clip(t / 0.004, 0, 1) * np.exp(-t / 0.022) * 1.4


def swell(d):
    n = int(d * SR)
    u = np.linspace(0, 1, n)
    x = svf(noise(n), 400 * (6000 / 400) ** u, q=0.9) * 1.2
    return x * u ** 2.5


def knock():
    n = int(0.3 * SR)
    t = tax(n)
    f = 95 + 70 * np.exp(-t / 0.012)
    thud = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.05)
    wood = svf(noise(n), 520, q=6.0) * np.exp(-t / 0.035) * 2.2
    wood2 = svf(noise(n), 1250, q=8.0) * np.exp(-t / 0.02) * 1.2
    tick = filt(noise(n), "bp", (1500, 5000)) * np.exp(-t / 0.002) * 0.6
    return np.tanh(1.4 * (thud + wood + wood2 + tick))


def click():
    out = np.zeros(int(0.06 * SR))
    for off, g in ((0.0, 1.0), (0.016, 0.6)):
        m = int(0.006 * SR)
        t = tax(m)
        c = filt(noise(m), "bp", (2500, 9000)) * np.exp(-t / 0.0008) * g
        i = int(off * SR)
        out[i:i + m] += c
    return out


def tick_snd(f=2200):
    n = int(0.05 * SR)
    t = tax(n)
    return np.sin(2 * np.pi * f * t) * np.exp(-t / 0.01)


def clock(hi=True):
    n = int(0.08 * SR)
    t = tax(n)
    f = 3300 if hi else 2500
    x = svf(noise(n), f, q=12.0) * np.exp(-t / 0.012) * 3
    x += 0.4 * np.sin(2 * np.pi * (900 if hi else 700) * t) * np.exp(-t / 0.006)
    return x


def chime():
    out = np.zeros((2, int(2.4 * SR)))
    for k, (m, p) in enumerate(((72, -0.3), (76, 0.3), (79, -0.15), (86, 0.2), (91, 0.0))):
        b = bell(midi(m), 2.2, 1.3, 3.5) * (0.9 if k < 3 else 0.55)
        i = int(k * 0.028 * SR)
        th = (p + 1) * np.pi / 4
        out[0, i:i + len(b)] += b[:out.shape[1] - i] * np.cos(th)
        out[1, i:i + len(b)] += b[:out.shape[1] - i] * np.sin(th)
    return out


# ----------------------------------------------------------------- the music
CHORDS = {  # bar -> (root midi for bass, chord tones for pad, arp tones)
    1: (45, [57, 60, 64], None),            # Am (intro)
    2: (45, [57, 60, 64], None),
    3: (41, [53, 57, 60, 64], [77, 81, 84, 88]),   # Fmaj7
    4: (43, [55, 59, 62, 69], [79, 83, 86, 81]),   # Gadd9
    5: (45, [57, 60, 64, 67], [81, 84, 88, 79]),   # Am7
    6: (41, [53, 57, 60, 67], [77, 81, 84, 79]),   # Fadd9
    7: (43, [55, 59, 62, 65], [79, 83, 86, 89]),   # G7
    8: (48, [60, 64, 67, 71], [84, 88, 91, 83]),   # Cmaj7
}

KICK, CLAP, HAT_C, HAT_O = kick(), clap(), hat(), hat(True)

# intro: clock ticks (beats in bar 1, 8ths in bar 2, 16ths into the drop)
for k in range(4):
    sfx.add(bar(1, k), clock(k % 2 == 0), 0.22)
for k in range(8):
    sfx.add(bar(2, k / 2), clock(k % 2 == 0), 0.2 + 0.03 * k / 8)
# muffled pulse in bar 2
mk = filt(KICK, "lp", 420) * 0.85
for k in range(4):
    drums.add(bar(2, k), mk, 0.55 + 0.1 * k)
# snare build over the last two beats
roll = [bar(2, 2 + i / 2) for i in range(2)] + [bar(2, 3 + i / 4) for i in range(4)]
for i, at in enumerate(roll):
    drums.add(at, snare(0.3), 0.12 + 0.06 * i, pan=0.1)
for i in range(4):
    drums.add(bar(2, 3.5 + i / 8), snare(0.2), 0.32 + 0.05 * i, pan=-0.1)

# groove: bars 3-7 (stop-time on the last two beats of bar 7 for the knocks)
for b in range(3, 8):
    for k in range(4):
        if b == 7 and k >= 2:
            continue
        drums.add(bar(b, k), KICK, 0.95)
        if k in (1, 3):
            drums.add(bar(b, k), CLAP, 0.62, pan=0.0)
            verb.add(bar(b, k), CLAP, 0.12)
        drums.add(bar(b, k + 0.5), HAT_O, 0.10 if b != 6 else 0.06, pan=0.25)
        for s in range(4):
            if b == 7 and k >= 2:
                break
            drums.add(bar(b, k + s / 4), HAT_C, (0.06 if s % 2 else 0.09) * (0.7 if b == 6 else 1), pan=-0.3)
# end card: hit, then let it ring
drums.add(bar(8), KICK, 1.0)
drums.add(bar(8, 1), KICK, 0.55)
drums.add(bar(8, 1), CLAP, 0.25)
for b, g in ((3, 0.5), (8, 0.42)):
    drums.add(bar(b), crash(2.2), g)

# bass: 8ths, octave pump, bars 3-7 (+ the downbeat of bar 8)
for b in range(3, 8):
    root = CHORDS[b][0]
    for e in range(8):
        if b == 7 and e >= 4:
            break
        f = midi(root + (12 if e % 2 else 0))
        bass.add(bar(b, e / 2), bass_note(f, BEAT / 2 - 0.01), 0.42)
bass.add(bar(8), bass_note(midi(36), 0.9), 0.32)

# pads: intro Am from silence, then a chord per bar
for b in range(1, 9):
    _, tones, _ = CHORDS[b]
    dur = BAR + (0.6 if b == 8 else 0.02)
    if b == 7:
        dur = BAR / 2
    for m in tones:
        p = pad_note(midi(m), dur, a=0.5 if b == 1 else 0.03, r=0.25 if b != 8 else 1.6)
        lvl = 0.06 if b <= 2 else 0.1
        music.add(bar(b), p, lvl)
        verb.add(bar(b), p, 0.02)
# sub drone under the intro
n = int(2 * BAR * SR)
tt = tax(n)
music.add(0, np.sin(2 * np.pi * midi(33) * tt) * np.clip(tt / 1.2, 0, 1) * np.clip((2 * BAR - tt) / 0.1, 0, 1), 0.035)

# chord stabs on the drop and the end card
for b in (3, 8):
    for m in CHORDS[b][1]:
        st = pad_note(midi(m + 12), 0.25, a=0.002, r=0.35)
        st = np.vstack([filt(st[0], "lp", 3500), filt(st[1], "lp", 3500)])
        music.add(bar(b), st, 0.11)
        verb.add(bar(b), st, 0.05)

# arp: 16th-note plucks, bars 3-6 (+ sparkle tail in 8)
for b in (3, 4, 5, 6):
    arp = CHORDS[b][2]
    for s in range(16):
        m = arp[(s * 3) % 4] + (12 if s % 8 == 7 else 0)
        pl = pluck(midi(m), 0.2, 1.0)
        pan = -0.45 if s % 2 else 0.45
        g = (0.085 if s % 4 == 0 else 0.06) * (0.75 if b == 6 else 1)
        music.add(bar(b, s / 4), pl, g, pan)
        verb.add(bar(b, s / 4), pl, g * 0.6)
for s, m in enumerate((84, 88, 91, 95, 96)):
    pl = pluck(midi(m), 0.4, 0.6)
    music.add(bar(8, 0.25 + s * 0.25), pl, 0.035, pan=(-0.5 + s * 0.25))
    verb.add(bar(8, 0.25 + s * 0.25), pl, 0.05)

# ----------------------------------------------------------------- SFX from cues
cues = json.load(open(sys.argv[1]))["cues"]
VERB_SEND = {"ping": 0.35, "plip": 0.3, "notify": 0.4, "chime": 0.6, "knock": 0.25, "sparkle": 0.3, "check": 0.2, "boop": 0.15,
             "impact": 0.25, "click": 0.05}
for c in cues:
    t, ty, g = c["t"], c["type"], c.get("g", 0.2)
    pan = c.get("pan", 0.0)
    if ty == "whoosh":
        x, pan = whoosh(c["d"], c["f0"], c["f1"], pan, c.get("pan1"))
    elif ty == "ping":
        x = ping(c["f"])
    elif ty == "sparkle":
        x = sparkle()
        pan = rng.uniform(-0.5, 0.5)
    elif ty == "check":
        x = check()
        pan = -0.3 + 0.2 * c.get("k", 0)
    elif ty == "boop":
        x = boop(c.get("f0", 400), c.get("f1", 900))
    elif ty == "plip":
        x = plip(c.get("f", 1046.5))
    elif ty == "impact":
        x = impact(bool(c.get("soft")))
    elif ty == "riser":
        x = riser(c["d"])
    elif ty == "revcym":
        x = revcym(c["d"])
    elif ty == "swish":
        x = swish(c["d"])
        pan = 0.2
    elif ty == "shimmer":
        x = shimmer(c["d"])
    elif ty == "scan":
        x = scan(c["d"])
    elif ty == "thump":
        x = thump()
    elif ty == "type":
        x = typing(c["d"], c["n"])
        pan = 0.25
    elif ty == "counter":
        x = counter(c["d"], c["n"])
        pan = 0.2
    elif ty == "sweep":
        x = sweep(c["d"])
    elif ty == "notify":
        x = notify()
    elif ty == "flick":
        x = flick()
        pan = [-0.5, 0.5, 0.5, -0.5][c.get("k", 0) % 4]
    elif ty == "swell":
        x = swell(c["d"])
    elif ty == "knock":
        x = knock()
    elif ty == "click":
        x = click()
        pan = -0.1
    elif ty == "tick":
        x = tick_snd(c.get("f", 2200))
        pan = rng.uniform(-0.4, 0.4)
    elif ty == "chime":
        x = chime()
    else:
        print("unknown cue", ty)
        continue
    sfx.add(t, x, g, pan)
    if ty in VERB_SEND:
        verb.add(t, x, g * VERB_SEND[ty], pan)


# ----------------------------------------------------------------- mix + master
def make_ir(rt60=1.5, length=2.2):
    n = int(length * SR)
    t = tax(n)
    env = np.exp(-6.9 * t / rt60)
    irs = []
    for ch in range(2):
        x = noise(n) * env
        x = filt(x, "lp", 6500) * 0.7 + filt(x, "lp", 2500) * 0.3
        x[: int(0.018 * SR)] = 0                             # pre-delay
        irs.append(x / np.sqrt(np.sum(x ** 2)))
    return np.vstack(irs)


IR = make_ir()
wet = np.vstack([signal.fftconvolve(verb.x[ch], IR[ch])[: verb.x.shape[1]] for ch in range(2)]) * 0.9

# kick-driven sidechain for bass + music
sc = np.zeros(N + SR * 3)
for b in range(3, 9):
    for k in range(4):
        if (b == 7 and k >= 2) or (b == 8 and k >= 2):
            continue
        i = int(bar(b, k) * SR)
        m = int(0.3 * SR)
        sc[i:i + m] = np.maximum(sc[i:i + m], np.exp(-tax(m) / 0.09))
duck = 1 - 0.55 * sc

# bus balance (linear gains), chosen from measured bus levels
GAIN = {"drums": 0.24, "bass": 0.95, "music": 1.35, "sfx": 0.30, "verb": 0.75}
buses = {"drums": drums.x, "bass": bass.x * duck, "music": music.x * (1 - 0.35 * sc), "sfx": sfx.x, "verb": wet * (1 - 0.3 * sc)}
for k in buses:
    buses[k] = buses[k][:, :N] * GAIN[k]
    v = buses[k]
    print(f"  {k:6s} rms {20 * np.log10(np.sqrt(np.mean(v ** 2)) + 1e-12):6.1f} dBFS  peak {20 * np.log10(np.max(np.abs(v)) + 1e-12):6.1f}")
mix = sum(buses.values())

# gentle bus EQ: trim sub rumble, a touch of air
mix = np.vstack([filt(ch, "hp", 28, 2) for ch in mix])
air = np.vstack([filt(ch, "hp", 9000, 1) for ch in mix])
mix = mix + 0.05 * air

# fade the very end so the cut is clean
fade = np.ones(N)
fn = int(0.35 * SR)
fade[-fn:] = np.linspace(1, 0, fn) ** 1.5
mix *= fade
print(f"pre-master peak {20 * np.log10(np.max(np.abs(mix))):.1f} dBFS")


def limiter(x, ceiling=10 ** (-1.5 / 20), look=0.003, rel=0.12):
    from scipy.ndimage import maximum_filter1d, uniform_filter1d
    la = int(look * SR)
    pk = maximum_filter1d(np.max(np.abs(x), axis=0), size=2 * la + 1)
    gain = np.minimum(1.0, ceiling / np.maximum(pk, 1e-9))
    gain = -maximum_filter1d(-gain, size=la)               # hold so the smoothing can't undershoot
    gain = uniform_filter1d(gain, size=la)                  # smooth attack inside the look-ahead
    a = np.exp(-1 / (rel * SR))
    g = np.empty_like(gain)
    cur = 1.0
    for i in range(len(gain)):
        cur = gain[i] if gain[i] < cur else a * cur + (1 - a) * gain[i]
        g[i] = cur
    return x * np.minimum(g, ceiling / np.maximum(np.max(np.abs(x), axis=0), 1e-9)), g


def lufs(x):
    """ITU-R BS.1770 integrated loudness (K-weighting, 400 ms blocks, gating)."""
    b1, a1 = signal.iirfilter(2, 1681.97, btype="highpass", ftype="butter", fs=SR)  # approximate pre-filter shelf
    shelf = []
    for ch in x:
        hp = signal.lfilter(b1, a1, ch)
        y = ch + (10 ** (4 / 20) - 1) * hp                  # ~+4 dB high shelf
        y = signal.sosfilt(signal.butter(2, 38, "highpass", fs=SR, output="sos"), y)
        shelf.append(y)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    ms = np.array([sum(np.mean(c[i:i + blk] ** 2) for c in shelf) for i in range(0, x.shape[1] - blk, hop)])
    lk = -0.691 + 10 * np.log10(ms + 1e-12)
    ms = ms[lk > -70]
    rel = -0.691 + 10 * np.log10(np.mean(ms)) - 10
    ms = ms[-0.691 + 10 * np.log10(ms) > rel]
    return -0.691 + 10 * np.log10(np.mean(ms))


TARGET = float(sys.argv[3]) if len(sys.argv) > 3 else -13.0
g = 10 ** ((TARGET - lufs(mix)) / 20)
for it in range(5):
    out, gr = limiter(mix * g)
    L = lufs(out)
    if abs(L - TARGET) < 0.15:
        break
    g *= 10 ** ((TARGET - L) / 20)
grdb = 20 * np.log10(gr)
print(f"master: makeup {20 * np.log10(g):+.1f} dB -> {L:.2f} LUFS | limiter GR max {grdb.min():.1f} dB, "
      f"time >2dB {np.mean(grdb < -2) * 100:.1f}%, >4dB {np.mean(grdb < -4) * 100:.1f}%")
mix = out
peak = np.max(np.abs(mix))
print(f"peak {20 * np.log10(peak):.2f} dBFS, rms {20 * np.log10(np.sqrt(np.mean(mix ** 2))):.2f} dBFS")

pcm = (np.clip(mix.T, -1, 1) * 32767).astype("<i2")
with wave.open(sys.argv[2], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", sys.argv[2])
