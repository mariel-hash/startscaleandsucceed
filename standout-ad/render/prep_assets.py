"""Prepare Standout brand assets for the ad.

Reads the original website exports (Standout Drive folder) from SRC and writes
web-ready layers to standout-ad/assets plus a geometry JSON used by index.html.
Usage: python3 prep_assets.py <src_dir> <out_dir>
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
geo = {}


def load(name):
    return Image.open(SRC / name).convert("RGBA")


def fit(img, width):
    h = round(img.height * width / img.width)
    return img.resize((width, h), Image.LANCZOS)


def save(img, name, **kw):
    img.save(OUT / name, optimize=True, **kw)
    print(f"{name:22s} {img.size}")


# --- Will: separate the person from the 11% cobalt circle + solid dot ---------
will = np.asarray(load("Copy_of_Website_Assets_3_.png")).astype(np.float64) / 255.0
C, A = will[..., :3], will[..., 3]
a8 = np.round(A * 255).astype(int)
ca, K = 28 / 255, np.array([0, 100, 219]) / 255
H, W = A.shape
yy, xx = np.mgrid[0:H, 0:W]
blueish = (C[..., 2] > C[..., 0] + 0.25) & (C[..., 2] > C[..., 1] + 0.15)
# the cobalt dot sits behind the person: find it first so its rim can't skew the circle fit
# (its right side is hidden behind the arm, so size it from the left/top/bottom edges)
dot = (a8 >= 250) & blueish & (xx < W * 0.35) & (yy > H * 0.7)
dys, dxs = np.nonzero(dot)
dr = (dys.max() - dys.min() + 1) / 2
dcx, dcy = dxs.min() + dr, (dys.max() + dys.min()) / 2
near_dot = (xx - dcx) ** 2 + (yy - dcy) ** 2 <= (dr + 10) ** 2
dot_l = C[int(dcy), int(dcx - dr * .7)] * 255
dot_r = C[int(dcy), int(dcx + dr * .2)] * 255
print("dot", round(dcx), round(dcy), round(dr), "colours", dot_l.round(), dot_r.round())
# least-squares circle through the anti-aliased rim of the 11% cobalt disc
rim = (a8 > 2) & (a8 < 26) & blueish & ~near_dot
ys, xs = np.nonzero(rim)
Dc, Ec, Fc = np.linalg.lstsq(np.c_[xs, ys, np.ones_like(xs)], -(xs ** 2 + ys ** 2).astype(float), rcond=None)[0]
cx, cy = -Dc / 2, -Ec / 2
r = float(np.sqrt(cx ** 2 + cy ** 2 - Fc))
print(f"circle fit: c=({cx:.1f},{cy:.1f}) r={r:.1f} from {len(xs)} rim px")
inside = (xx - cx) ** 2 + (yy - cy) ** 2 <= (r + 1.5) ** 2
pa = np.where(inside, np.clip((A - ca) / (1 - ca), 0, 1), A)
safe = np.maximum(pa, 1e-4)[..., None]
P = np.where(inside[..., None], (C * A[..., None] - K * ca * (1 - pa[..., None])) / safe, C)
P = np.clip(P, 0, 1)
pa = np.where(near_dot & (blueish | (pa < 0.5)), 0, pa)
on_rim = np.abs(np.hypot(xx - cx, yy - cy) - r) < 8
pa = np.where((pa < 0.3) & blueish & on_rim, 0, pa)  # leftover tint on the disc's edge (keep the soft shadow)
person = Image.fromarray(np.dstack([P, pa]).__mul__(255).round().astype(np.uint8), "RGBA")
s = 1100 / W
save(fit(person, 1100), "will.png")
geo["will"] = {"w": 1100, "h": round(H * s), "circle": [cx * s, cy * s, r * s],
               "dot": [dcx * s, dcy * s, dr * s],
               "dotColors": ["#%02x%02x%02x" % tuple(int(v) for v in dot_l), "#%02x%02x%02x" % tuple(int(v) for v in dot_r)]}


# --- circular avatar crops from the hero mockup --------------------------------
def avatar(img, cx, cy, r, size):
    crop = img.crop((cx - r, cy - r, cx + r, cy + r)).resize((size, size), Image.LANCZOS)
    m = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(m).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    crop.putalpha(m.resize((size, size), Image.LANCZOS))
    return crop


hero = load("2.png")
save(avatar(hero, 540, 1100, 170, 340), "james.png")
save(avatar(hero, 821, 181, 60, 120), "bex.png")
save(fit(hero, 1600), "devices.png")

# --- logo: mark + per-letter wordmark, white + cobalt variant ------------------
logo = np.asarray(load("Copy_of_Website_Assets_1_.png")).astype(np.float64) / 255.0
la, lrgb = logo[..., 3], logo[..., :3]
lum = lrgb.mean(-1)
sq = (134, 88, 428, 388)                       # black square with white S
mark = logo[sq[1]:sq[3], sq[0]:sq[2]]
m_l = mark[..., :3].mean(-1)
cobalt = np.array([0, 70, 218]) / 255
# black square -> white, white S -> cobalt (keep anti-aliasing via luminance mix)
mark_rgb = (1 - m_l)[..., None] * np.ones(3) + m_l[..., None] * cobalt
mark_img = Image.fromarray((np.dstack([mark_rgb, mark[..., 3]]) * 255).round().astype(np.uint8), "RGBA")
save(mark_img.resize((240, 240), Image.LANCZOS), "logo-mark-white.png")
save(Image.fromarray((mark * 255).round().astype(np.uint8), "RGBA").resize((240, 240), Image.LANCZOS),
     "logo-mark-black.png")
dark = (la > 0.5) & (lum < 0.4)
rows = np.nonzero(dark.sum(1) > 1200)[0]
top_rule = rows[rows < 230]
bot_rule = rows[rows >= 230]
band = (top_rule.max() + 1, bot_rule.min())
cols = (la[band[0] + 6:band[1] - 6, 700:] > 0.15).any(0)
runs, start = [], None
for i, v in enumerate(cols):
    x = i + 700
    if v and start is None:
        start = x
    if not v and start is not None:
        runs.append((start, x)); start = None
runs = [rn for rn in runs if rn[1] - rn[0] > 20]
letters = []
for i, (x0, x1) in enumerate(runs):
    x0, x1 = x0 - 6, x1 + 6
    piece = logo[band[0]:band[1], x0:x1]
    white = np.dstack([np.ones(piece.shape[:2] + (3,)), piece[..., 3] * (1 - piece[..., :3].mean(-1)).clip(0, 1) ** 0.9])
    save(Image.fromarray((white * 255).round().astype(np.uint8), "RGBA"), f"logo-l{i}.png")
    letters.append([int(x0), int(x1 - x0)])
geo["logo"] = {"srcW": 2732, "srcH": 462, "mark": [134, 88, 294, 300], "band": [int(band[0]), int(band[1] - band[0])],
               "letters": letters, "rules": [[int(top_rule.min()), int(len(top_rule))], [int(bot_rule.min()), int(len(bot_rule))]],
               "ruleX": [712, 2598]}
print("letters", len(letters), letters)

# --- product illustrations ---------------------------------------------------
for src, name, w in [("Copy_of_Website_Assets_6_.png", "tool-cv.png", 1000),
                     ("Copy_of_Website_Assets_9_.png", "tool-cover.png", 1000),
                     ("Copy_of_Website_Assets_10_.png", "tool-ats.png", 1000),
                     ("Copy_of_Website_Assets_13_.png", "tool-rewrite.png", 1000),
                     ("12.png", "daily.png", 1400)]:
    save(fit(load(src), w), name)

# --- film grain tile -----------------------------------------------------------
rng = np.random.default_rng(7)
g = rng.normal(0.5, 0.18, (256, 256)).clip(0, 1)
save(Image.fromarray((g * 255).astype(np.uint8), "L"), "grain.png")

(OUT / "geometry.json").write_text(json.dumps(geo, indent=1))
(OUT / "geometry.js").write_text("window.GEOMETRY = " + json.dumps(geo) + ";\n")   # lets index.html run from file://
print(json.dumps(geo)[:600])
