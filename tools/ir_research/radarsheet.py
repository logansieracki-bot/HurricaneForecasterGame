#!/usr/bin/env python3
"""Contact sheet of the radar dumps of radar_lab.mjs: python3 tools/ir_research/radarsheet.py <prefix> <label> <hours comma list> <out.png> [km half-width]
The colours are the National Weather Service's base reflectivity bands (the floater's own: FL_BANDS of src/storm-floater.js), one per 5 dBZ from 5."""
import sys, numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap, BoundaryNorm
BANDS = ['04e9e7', '019ff4', '0300f4', '02fd02', '01c501', '008e00', 'fdf802', 'e5bc00', 'fd9500', 'fd0000', 'd40000', 'bc0000', 'f800fd', '9854c6', 'ffffff']
cmap = ListedColormap(['#' + b for b in BANDS]); cmap.set_under('#10182b'); norm = BoundaryNorm([5 + 5 * i for i in range(len(BANDS) + 1)], cmap.N)
prefix, label, hours, out = sys.argv[1], sys.argv[2], [int(h) for h in sys.argv[3].split(',')], sys.argv[4]
half = float(sys.argv[5]) if len(sys.argv) > 5 else 256
n = len(hours); cols = min(n, 3); rows = (n + cols - 1) // cols
fig, axs = plt.subplots(rows, cols, figsize=(5 * cols, 5.15 * rows), squeeze=False)
for ax in axs.ravel(): ax.axis('off')
for i, h in enumerate(hours):
    a = np.fromfile(f'{prefix}_{label}_{h:03d}.f32', dtype=np.float32).reshape(256, 256)
    ax = axs[i // cols][i % cols]; ax.axis('on')
    ax.imshow(np.where(a < 5, np.nan, a), origin='lower', cmap=cmap, norm=norm, extent=[-256, 256, -256, 256], interpolation='nearest')
    ax.set_facecolor('#10182b'); ax.set_xlim(-half, half); ax.set_ylim(-half, half)
    for r in (50, 100, 150, 200):
        if r <= half * 1.42: ax.add_patch(plt.Circle((0, 0), r, fill=False, ec='#ffffff', lw=0.5, alpha=0.35))
    ax.set_title(f'{label}  h {h}', fontsize=9); ax.tick_params(labelsize=6)
plt.tight_layout(); plt.savefig(out, dpi=95); print(out)
