#!/usr/bin/env python3
"""Crops the embedded Blue Marble imagery for a basin's data.json (bm/bmBox/bmSize)
from a cloud-free equirectangular source (2048x1024 NASA-derived world texture --
see tools/fetch.py for why: a higher-res alternative was tried but had clouds baked in).

Usage: python3 tools/make_imagery.py <basin> <lonW> <lonE> <latS> <latN> [floor] [quality]
  e.g. python3 tools/make_imagery.py eastpacific -146 -68 -6 42
"""
import base64
import io
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "raw", "blue_marble_2048.jpg")


def build(basin, lonW, lonE, latS, latN, floor=18, quality=88):
    src = Image.open(SRC).convert("RGB")
    sw, sh = src.size  # 2048 x 1024, full -180..180 / 90..-90

    x0 = round((lonW + 180) / 360 * sw)
    x1 = round((lonE + 180) / 360 * sw)
    y0 = round((90 - latN) / 180 * sh)
    y1 = round((90 - latS) / 180 * sh)
    if x0 >= 0 and x1 <= sw:
        crop = src.crop((x0, y0, x1, y1))
    elif x0 >= 0 and x1 > sw:
        # A box crossing the antimeridian (x1 > sw, e.g. a WPAC crop padded past 180 deg) needs
        # to wrap around to the image's own opposite edge, not pad with black -- plain PIL crop()
        # silently fills out-of-bounds pixels with black, which read as a fake dark smear off the
        # date line rather than the real imagery continuing from the other side of the world map.
        left = src.crop((x0, y0, sw, y1))
        right = src.crop((0, y0, x1 - sw, y1))
        crop = Image.new("RGB", (x1 - x0, y1 - y0))
        crop.paste(left, (0, 0))
        crop.paste(right, (left.width, 0))
    else:
        raise NotImplementedError(f"box crosses the antimeridian on the west side too (x0={x0}) -- not needed by any basin yet")

    # Black-floor lift: ocean-trench/shadow pixels in Blue Marble can hit true black,
    # which looks harsh composited under the SST overlay against the app's own dark
    # navy background. Lift the floor so nothing is pure black.
    arr = np.asarray(crop).astype(np.float32)
    arr = floor + (255 - floor) / 255 * arr
    lifted = Image.fromarray(arr.astype(np.uint8), "RGB")

    buf = io.BytesIO()
    lifted.save(buf, format="JPEG", quality=quality, optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    out = {
        "bm": b64,
        "bmBox": [lonW, lonE, latS, latN],
        "bmSize": [lifted.width, lifted.height],
    }
    out_dir = os.path.join(ROOT, "data", "generated")
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, f"{basin}-imagery.json")
    with open(dest, "w") as f:
        json.dump(out, f)
    print(f"wrote {dest}")
    print(f"  size {lifted.width}x{lifted.height} ({lifted.width/(lonE-lonW):.1f} px/deg), jpeg bytes={len(buf.getvalue())}")
    return out


if __name__ == "__main__":
    args = sys.argv[1:]
    basin = args[0]
    lonW, lonE, latS, latN = (float(x) for x in args[1:5])
    floor = int(args[5]) if len(args) > 5 else 18
    quality = int(args[6]) if len(args) > 6 else 88
    build(basin, lonW, lonE, latS, latN, floor, quality)
