"""python sheets.py NAME OUTPREFIX COLS ROWS START END EVERY_H [scale] -- contact sheets from the kept crops, with the eye numbers from track.json if present"""
import sys, os, json, glob, datetime as dt, numpy as np
import goes_ir as G
name, outp, cols, rows, start, end, every = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5], sys.argv[6], float(sys.argv[7])
scale = int(sys.argv[8]) if len(sys.argv) > 8 else 1
t0 = dt.datetime.strptime(start, '%Y-%m-%dT%H:%M'); t1 = dt.datetime.strptime(end, '%Y-%m-%dT%H:%M')
files = sorted(glob.glob(f'crops/{name}/*.npz')); st = {}
for tj in (f'out/{name}/track.json', f'out/{name}/stats.json'):
    if os.path.exists(tj):
        for r in json.load(open(tj)): st[r['time']] = r
panels = []; k = 0; last = None
for f in files:
    t = dt.datetime.strptime(os.path.basename(f)[:13], '%Y%m%dT%H%M')
    if t < t0 or t > t1: continue
    if last is not None and (t - last).total_seconds() / 3600.0 < every - 1e-6: continue
    last = t; z = np.load(f); tb = z['tb'].astype(np.float32); key = f'{t:%Y-%m-%dT%H:%M}'; s = st.get(key, {})
    lab = f'{t:%m-%d %H:%MZ} ({float(z["lat"]):.1f},{float(z["lon"]):.1f}) min {np.nanmin(tb):.0f}'
    if s.get('eye'): lab += f' eye {s["eye"]["t"]:.0f}'
    panels.append(G.panel(tb, lab, res_km=float(z['res']), scale=scale, ring_km=(50, 100)))
    if len(panels) == cols * rows: G.sheet(panels, cols, f'{outp}{k:02d}.png'); k += 1; panels = []
if panels: G.sheet(panels, cols, f'{outp}{k:02d}.png'); k += 1
print('sheets', k)
