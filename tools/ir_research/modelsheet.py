"""Contact sheets of the model's infrared fields dumped by model_lab.mjs (<prefix>_<label>_<hour>.f32, 256 x 256 float32 of Tb in C), on the same palette and with the same
100 / 200 km rings as the real ones (goes_ir.py), for putting beside the real storms.
   python modelsheet.py PREFIX LABEL OUT.png [COLS] [m]"""
import sys, glob, os, re, numpy as np
import goes_ir as G
prefix, label, out = sys.argv[1], sys.argv[2], sys.argv[3]
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 3; m = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
panels = []
for f in sorted(glob.glob(f'{prefix}_{label}_*.f32')):
    h = int(re.search(r'_(\d+)\.f32$', f).group(1)); tb = np.fromfile(f, np.float32).reshape(256, 256)[::-1]
    panels.append(G.panel(tb, f'{label} +{h}h min {np.nanmin(tb):.0f}C', res_km=2 * m, scale=1, ring_km=(100, 200)))
G.sheet(panels, cols, out); print(out, len(panels))
