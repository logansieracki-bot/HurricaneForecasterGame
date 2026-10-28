"""A contact sheet of chosen pictures of the PAGE's floater (page_lab.mjs dumps), from any runs, in the order given: for before-and-after rows, or one storm beside another.
   python gamesheet.py OUT.jpg COLS PREFIX:LABEL:HOUR:CAPTION ...        (CAPTION may be left out: "label +hour kt min C" is written; the scale bar and the 100 / 200 km rings are the real sheets')"""
import sys, json, os, numpy as np
import goes_ir as G
from PIL import Image
out, cols = sys.argv[1], int(sys.argv[2])
panels = []
for spec in sys.argv[3:]:
    prefix, label, hour, *cap = spec.split(':', 3); h = int(hour)
    meta = {r['h']: r for r in json.load(open(f'{prefix}_{label}.json'))}[h]
    tb = np.fromfile(f'{prefix}_{label}_{h:03d}.f32', np.float32).reshape(256, 256)[::-1]
    text = cap[0] if cap and cap[0] else f"{label} +{h}h {meta['f']['v']:.0f}kt min {np.nanmin(tb):.0f}C"
    panels.append(G.panel(tb, text, res_km=2 * meta['m'], scale=int(os.environ.get('SCALE', '1')), ring_km=(100, 200)))
G.sheet(panels, cols, out + '.png'); Image.open(out + '.png').convert('RGB').save(out, quality=82); os.remove(out + '.png'); print(out, len(panels))
