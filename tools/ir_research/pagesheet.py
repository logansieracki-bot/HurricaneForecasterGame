"""Contact sheets of the pictures the PAGE's floater makes (page_lab.mjs: <prefix>_<label>_<hour>.f32, 256 x 256 float32 of Tb in C, and <prefix>_<label>.json with the scale of each), on the same palette and with the same
100 / 200 km rings as the real ones (goes_ir.py), for putting beside the real storms.
   python pagesheet.py PREFIX LABEL OUT.jpg [COLS] [HOURS: comma list, default all]"""
import sys, glob, json, re, numpy as np
import goes_ir as G
from PIL import Image
prefix, label, out = sys.argv[1], sys.argv[2], sys.argv[3]
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 3
want = set(int(x) for x in sys.argv[5].split(',')) if len(sys.argv) > 5 else None
meta = {r['h']: r for r in json.load(open(f'{prefix}_{label}.json'))}
panels = []
for f in sorted(glob.glob(f'{prefix}_{label}_*.f32')):
    h = int(re.search(r'_(\d+)\.f32$', f).group(1))
    if want is not None and h not in want: continue
    tb = np.fromfile(f, np.float32).reshape(256, 256)[::-1]; m = meta[h]['m']; v = meta[h]['f']['v']
    panels.append(G.panel(tb, f'{label} +{h}h {v:.0f}kt min {np.nanmin(tb):.0f}C', res_km=2 * m, scale=1, ring_km=(100, 200)))
G.sheet(panels, cols, out + '.png'); Image.open(out + '.png').convert('RGB').save(out, quality=84); import os; os.remove(out + '.png'); print(out, len(panels))
