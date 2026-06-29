#!/usr/bin/env python3
"""Procedural photoreal-ish textures for Wine Tasting Companion.
Weathered walnut plank board + aged parchment. No external images."""
import numpy as np
from PIL import Image, ImageFilter
import random, os

ASSETS = "/Users/keatonhillsimonsgmail.com/Projects/wine-tasting-companion/assets"
random.seed(11); np.random.seed(11)

def value_noise(H, W, base_w, base_h, octaves=5, persist=0.55):
    out = np.zeros((H, W), np.float32); amp = 1.0; tot = 0.0
    for o in range(octaves):
        bw = max(2, base_w * (2 ** o)); bh = max(2, base_h * (2 ** o))
        small = (np.random.rand(bh, bw) * 255).astype(np.uint8)
        big = np.asarray(Image.fromarray(small).resize((W, H), Image.BILINEAR), np.float32) / 255.0
        out += big * amp; tot += amp; amp *= persist
    return out / tot

def ramp(lum, stops, cols):
    return np.interp(lum, stops, cols).astype(np.float32)

def make_wood(W=1500, H=2200):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    warp  = value_noise(H, W, 7, 11, 5, 0.60)     # grain wander (phase)
    warp2 = value_noise(H, W, 18, 26, 4, 0.50)    # grain spacing variation
    fine  = value_noise(H, W, 80, 120, 4, 0.50)   # fibre
    blotch = value_noise(H, W, 3, 5, 4, 0.62)     # broad tone variation

    xloc = np.zeros((H, W), np.float32)
    pbase = np.zeros((H, W), np.float32)
    cnt = np.zeros((H, W), np.float32)
    poff = np.zeros((H, W), np.float32)
    hue = np.zeros((H, W), np.float32)
    seam = np.ones((H, W), np.float32)

    edges = [0]
    while edges[-1] < W:
        edges.append(edges[-1] + random.randint(230, 360))
    edges[-1] = W
    for i in range(len(edges) - 1):
        x0, x1 = edges[i], edges[i + 1]; w = max(1, x1 - x0)
        xl = (np.arange(x0, x1) - x0) / w
        xloc[:, x0:x1] = xl[None, :]
        pbase[:, x0:x1] = (random.random() - 0.5) * 0.20      # plank brightness
        cnt[:, x0:x1] = random.randint(16, 28)                # grain density varies
        poff[:, x0:x1] = random.random() * 3.0
        hue[:, x0:x1] = (random.random() - 0.5) * 0.16        # warm/cool plank
        d = np.minimum(np.arange(x0, x1) - x0, x1 - 1 - np.arange(x0, x1))
        seam[:, x0:x1] = (np.clip(d / 10.0, 0, 1) * 0.45 + 0.55)[None, :]

    # domain-warped grain so spacing & path both wander (kills the "corduroy" look)
    xw = xloc + (warp2 - 0.5) * 0.20 + (warp - 0.5) * 0.05
    phase = xw * cnt + poff + (warp - 0.5) * 1.6
    grain = 0.5 + 0.5 * np.sin(phase * 2 * np.pi)
    grain = grain ** 2.1                                       # thin dark grain lines

    lum = (0.45 + pbase + (blotch - 0.5) * 0.34 - grain * 0.36 + (fine - 0.5) * 0.06)
    lum *= (1.07 - 0.17 * (yy / H))                            # soft top-down light
    lum = np.clip(lum, 0, 1)

    stops = [0.0, 0.28, 0.5, 0.72, 1.0]
    R = ramp(lum, stops, [24, 56, 95, 138, 180])
    G = ramp(lum, stops, [14, 32, 58, 94, 132])
    B = ramp(lum, stops, [8, 18, 32, 56, 88])
    R *= (1 + hue * 0.18); B *= (1 - hue * 0.18)               # per-plank warmth
    R *= seam; G *= seam; B *= seam

    for _ in range(3):                                         # knots
        kx, ky = random.randint(80, W - 80), random.randint(120, H - 120)
        dist = np.sqrt((xx - kx) ** 2 + ((yy - ky) * 1.6) ** 2)
        rings = 0.5 + 0.5 * np.sin(dist * 0.22)
        m = np.clip(1 - dist / random.randint(60, 110), 0, 1) ** 1.6
        dark = (0.5 + 0.5 * rings)
        R = R * (1 - m) + R * dark * m
        G = G * (1 - m) + G * dark * m
        B = B * (1 - m) + B * dark * m

    rgb = np.stack([R, G, B], -1)

    # subtle, weathered wine-glass ring stains (faint reddish-brown, not pink)
    for (cx, cy, rad) in [(int(W * 0.22), int(H * 0.12), 120), (int(W * 0.78), int(H * 0.66), 100)]:
        dist = np.sqrt((xx - cx) ** 2 + ((yy - cy) * 1.05) ** 2)
        rm = np.exp(-((dist - rad) ** 2) / (2 * 13.0 ** 2)) * 0.16
        rm += np.exp(-((dist - rad * 0.86) ** 2) / (2 * 18.0 ** 2)) * 0.05   # faint inner
        rm = np.asarray(Image.fromarray((rm * 255).clip(0, 255).astype(np.uint8))
                        .filter(ImageFilter.GaussianBlur(3)), np.float32) / 255
        stain = np.array([70, 30, 30], np.float32)
        for c in range(3):
            rgb[..., c] = rgb[..., c] * (1 - rm) + stain[c] * rm

    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    img = img.filter(ImageFilter.GaussianBlur(0.4))
    img.save(f"{ASSETS}/wood.jpg", quality=86)
    Image.eval(img, lambda v: int(v * 0.70)).save(f"{ASSETS}/wood-dark.jpg", quality=86)
    print("wood.jpg", img.size)

def make_parchment(W=1100, H=1100):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    mottle = value_noise(H, W, 5, 5, 5, 0.6)
    fibre = value_noise(H, W, 90, 90, 3, 0.5)
    lum = 0.92 + (mottle - 0.5) * 0.16 + (fibre - 0.5) * 0.05
    edge = np.clip(np.minimum(np.minimum(xx, W - 1 - xx), np.minimum(yy, H - 1 - yy)) / 90.0, 0, 1)
    lum *= (0.86 + 0.14 * edge)
    lum = np.clip(lum, 0, 1)
    stops = [0.0, 0.5, 0.8, 1.0]
    R = ramp(lum, stops, [196, 224, 240, 250])
    G = ramp(lum, stops, [170, 202, 222, 236])
    B = ramp(lum, stops, [122, 158, 184, 206])
    rgb = np.stack([R, G, B], -1)
    for _ in range(5):
        sx, sy = random.randint(0, W), random.randint(0, H)
        dist = np.sqrt((xx - sx) ** 2 + (yy - sy) ** 2)
        m = np.exp(-(dist ** 2) / (2 * random.randint(60, 140) ** 2)) * 0.12
        tint = np.array([150, 116, 70], np.float32)
        for c in range(3):
            rgb[..., c] = rgb[..., c] * (1 - m) + tint[c] * m
    Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).save(f"{ASSETS}/parchment.jpg", quality=90)
    print("parchment.jpg", (W, H))

make_wood()
make_parchment()
for f in ["wood.jpg", "wood-dark.jpg", "parchment.jpg"]:
    print(f, os.path.getsize(f"{ASSETS}/{f}"), "bytes")
