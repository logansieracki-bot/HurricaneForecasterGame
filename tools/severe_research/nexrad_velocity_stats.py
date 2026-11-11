#!/usr/bin/env python3
"""What the Doppler cut of real NEXRAD volumes says about velocity, for fixing the velocity of the simulated radar (docs/severe-research.md, part 5; the model's side of the same numbers is
radar_velocity_stats.mjs). The Doppler cut is the first sweep below 1 degree that carries velocity (the second 0.5 degree cut of a volume).

  nexrad_velocity_stats.py --pylib DIR OUT.json VOLUME.gz [VOLUME.gz ...]

OUT.json: valid (the share of the gates with a reflectivity that also have a velocity, by 20 km of range), clear (clear air, 5-90 km: for every 5 dBZ of reflectivity the share of pairs of neighbouring
radials that differ by 0, 0.5, 1, 2 and 4 m/s or less, and the 10, 50 and 90 % of the spectrum width), precip (35-45 dBZ, 5-90 km: the same shares, the width), precip_sw_range (the width of
35-45 dBZ rain by range). Clear air is where no gate within 4 radials and 6 gates reaches 20 dBZ. The volumes come from the Unidata archive (s3://unidata-nexrad-level2) and are read with Py-ART
(not a dependency of the project: pip install arm_pyart into a scratch directory and pass it with --pylib).
"""
import argparse, json, sys, warnings
warnings.filterwarnings('ignore')
ap = argparse.ArgumentParser(); ap.add_argument('--pylib', default=None); ap.add_argument('out'); ap.add_argument('volumes', nargs='+')
a = ap.parse_args()
if a.pylib: sys.path.insert(0, a.pylib)
import numpy as np, pyart
from scipy.ndimage import maximum_filter
files = a.volumes
bins = np.arange(0, 100, 20.0)
valid = {b: [0, 0] for b in bins}
zb = list(range(-10, 20, 5))
dvs = {z: [] for z in zb}; sws = {z: [] for z in zb}; pdv = []; psw = []
redges = [5, 20, 40, 60, 90, 150]; rsw = {e: [] for e in range(len(redges) - 1)}
for f in files:
    try: radar = pyart.io.read_nexrad_archive(f)
    except Exception as e: print('skipped', f, e); continue
    s = next((i for i in range(radar.nsweeps) if float(np.mean(radar.elevation['data'][radar.get_slice(i)])) < 1.0 and 'velocity' in radar.fields and np.ma.count(radar.fields['velocity']['data'][radar.get_slice(i)]) > 0), None)
    if s is None: continue
    sl = radar.get_slice(s); rr = radar.range['data'] / 1000.0
    ref = radar.fields['reflectivity']['data'][sl].astype(float).filled(np.nan); vel = radar.fields['velocity']['data'][sl].astype(float).filled(np.nan); wid = radar.fields['spectrum_width']['data'][sl].astype(float).filled(np.nan)
    vn = float(np.mean(radar.instrument_parameters['nyquist_velocity']['data'][sl]))
    for b in bins:
        m = (rr >= b) & (rr < b + 20); r = ref[:, m]; v = vel[:, m]
        valid[b][0] += int(np.isfinite(r).sum()); valid[b][1] += int((np.isfinite(r) & np.isfinite(v)).sum())
    fin = np.where(np.isfinite(ref), ref, -40.0); clear = maximum_filter(fin, size=(9, 13)) < 20; near = (rr >= 5) & (rr < 90)
    dv = vel[1:, :] - vel[:-1, :]; zz = 0.5 * (ref[1:, :] + ref[:-1, :]); okd = np.isfinite(dv) & near[None, :] & (np.abs(dv) < vn)
    for z in zb:
        m = okd & clear[1:, :] & clear[:-1, :] & (zz >= z) & (zz < z + 5); dvs[z].append(np.abs(dv[m]))
        mw = np.isfinite(wid) & clear & near[None, :] & (ref >= z) & (ref < z + 5); sws[z].append(wid[mw])
    mp = okd & (zz >= 35) & (zz < 45) & (rr[None, :] < 90); pdv.append(np.abs(dv[mp]))
    for e in range(len(redges) - 1):
        mr = np.isfinite(wid) & (ref >= 35) & (ref < 45) & ((rr >= redges[e]) & (rr < redges[e + 1]))[None, :]; rsw[e].append(wid[mr])
    mw = np.isfinite(wid) & np.isfinite(ref) & (ref >= 35) & (ref < 45) & (rr[None, :] < 90); psw.append(wid[mw])
out = {'valid': {int(b): 100.0 * valid[b][1] / max(1, valid[b][0]) for b in bins}, 'clear': {}, 'precip': {}}
for z in zb:
    d = np.concatenate(dvs[z]); w = np.concatenate(sws[z])
    out['clear'][z] = {'n': int(d.size), 'dv': [float((d <= t + 0.01).mean() * 100) for t in (0, 0.5, 1, 2, 4)], 'sw': [float(np.percentile(w, p)) for p in (10, 50, 90)]}
out['precip_sw_range'] = {'edges': redges, 'p': [[float(np.percentile(np.concatenate(rsw[e]), p)) for p in (10, 50, 90)] for e in range(len(redges) - 1)], 'n': [int(np.concatenate(rsw[e]).size) for e in range(len(redges) - 1)]}
d = np.concatenate(pdv); w = np.concatenate(psw)
out['precip'] = {'n': int(d.size), 'dv': [float((d <= t + 0.01).mean() * 100) for t in (0, 0.5, 1, 2, 4)], 'sw': [float(np.percentile(w, p)) for p in (10, 50, 90)]}
json.dump(out, open(a.out, 'w'), indent=1)
print('wrote ' + a.out + ' from ' + str(len(files)) + ' volumes')
