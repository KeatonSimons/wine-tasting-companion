#!/usr/bin/env python3
"""Realistic dried wine-glass ring stains (transparent PNGs).
Thin, irregular, BROKEN rings with a darker outer rim (coffee-ring effect),
slight ellipse, faint interior pooling. Not perfect circles."""
import numpy as np
from PIL import Image, ImageFilter
import os

ASSETS = "/Users/keatonhillsimonsgmail.com/Projects/wine-tasting-companion/assets"

def ang_noise(N, seed, smooth=11):
    rng = np.random.default_rng(seed)
    base = rng.random(N)
    k = np.hanning(smooth); k /= k.sum()
    ext = np.concatenate([base[-smooth:], base, base[:smooth]])
    sm = np.convolve(ext, k, mode="same")[smooth:-smooth]
    return (sm - sm.min()) / (np.ptp(sm) + 1e-6)

def make_stain(path, S=600, seed=1, base_r=0.62, ellip=0.93, rot=0.3,
               break_seed=2, gaps=2, max_alpha=0.5, color=(74, 26, 30)):
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    cx = cy = S / 2.0
    dx = (xx - cx); dy = (yy - cy)
    # rotate + squish to an ellipse
    ca, sa = np.cos(rot), np.sin(rot)
    rx = (dx * ca + dy * sa)
    ry = (-dx * sa + dy * ca) / ellip
    r = np.sqrt(rx * rx + ry * ry)
    ang = np.arctan2(ry, rx)  # -pi..pi

    N = 256
    radn = ang_noise(N, seed)          # wobble the radius (irregular, not circular)
    brkn = ang_noise(N, break_seed)    # where the ring is faint/broken
    idx = ((ang + np.pi) / (2 * np.pi) * N).astype(np.int32) % N
    rwobble = radn[idx]
    brk = brkn[idx]

    Rpx = base_r * (S / 2) * (1.0 + 0.06 * (rwobble - 0.5))
    d = r - Rpx
    sig = S * 0.010
    ring = np.exp(-(d ** 2) / (2 * sig ** 2)) * 0.55
    rim = np.exp(-((d - sig * 1.1) ** 2) / (2 * (sig * 0.7) ** 2)) * 0.9  # darker outer edge
    alpha = ring + rim

    # broken ring: fade big arcs, plus a couple of hard gaps
    brkmask = np.clip((brk - 0.22) / 0.6, 0, 1) ** 1.3
    rng = np.random.default_rng(break_seed + 9)
    for _ in range(gaps):
        g0 = rng.uniform(-np.pi, np.pi); gw = rng.uniform(0.25, 0.7)
        dist = np.abs(np.angle(np.exp(1j * (ang - g0))))
        brkmask *= np.clip(dist / gw, 0, 1)
    alpha *= (0.35 + 0.65 * brkmask)

    # faint interior pooling
    inside = np.clip(1 - r / Rpx, 0, 1)
    alpha += inside * 0.05

    alpha = np.clip(alpha, 0, 1) * max_alpha
    # soften
    aimg = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    alpha = np.asarray(aimg, np.float32) / 255

    out = np.zeros((S, S, 4), np.uint8)
    out[..., 0] = color[0]; out[..., 1] = color[1]; out[..., 2] = color[2]
    out[..., 3] = (alpha * 255).astype(np.uint8)
    Image.fromarray(out, "RGBA").save(path)
    print("wrote", os.path.basename(path))

# a fairly complete (but irregular, broken) ring
make_stain(f"{ASSETS}/stain1.png", seed=4, base_r=0.60, ellip=0.92, rot=0.25,
           break_seed=7, gaps=2, max_alpha=0.46, color=(78, 27, 31))
# a more partial / arc-heavy ring
make_stain(f"{ASSETS}/stain2.png", seed=13, base_r=0.66, ellip=0.88, rot=-0.4,
           break_seed=21, gaps=3, max_alpha=0.40, color=(66, 24, 28))
for f in ["stain1.png", "stain2.png"]:
    print(f, os.path.getsize(f"{ASSETS}/{f}"), "bytes")
