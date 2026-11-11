#!/usr/bin/env python3
"""The lowest tilt of a real NEXRAD Level II volume as a plain array, for drawing it with the same renderer and palette as the simulated radar (radar_real_render.mjs) and
for measuring the receiver's floor and the clear-air return (docs/severe-research.md, part 4).

  nexrad_sweep.py --pylib DIR VOLUME.gz OUT      writes OUT.f32 (float32, 720 radials x gates, dBZ, NaN where the gate has no data) and OUT.json (n, gates, gate0, dr, elev, site)
The volume comes from the Unidata archive (s3://unidata-nexrad-level2) and is read with Py-ART (not a dependency of the project: pip install arm_pyart into a scratch directory and pass
it with --pylib). The rays (about 0.5 degrees apart, not exactly) are put on a regular 0.5 degree grid by the nearest ray; the gates (250 m, the first at 2125 m) are kept as they are.
"""
import argparse, json, sys, warnings
warnings.filterwarnings('ignore')
ap = argparse.ArgumentParser(); ap.add_argument('--pylib', default=None); ap.add_argument('volume'); ap.add_argument('out')
a = ap.parse_args()
if a.pylib: sys.path.insert(0, a.pylib)
import numpy as np, pyart

radar = pyart.io.read_nexrad_archive(a.volume)
s = next((i for i in range(radar.nsweeps) if float(np.mean(radar.elevation['data'][radar.get_slice(i)])) < 1.0 and radar.range['data'][1] - radar.range['data'][0] < 300), 0)
sl = radar.get_slice(s); ref = radar.fields['reflectivity']['data'][sl].astype(float).filled(np.nan); az = radar.azimuth['data'][sl]; rng = radar.range['data']
n = 720; grid = (np.arange(n) * 0.5 + 0.25) % 360.0
idx = np.argmin(np.abs(((az[None, :] - grid[:, None]) + 180) % 360 - 180), axis=1)
ref[idx, :].astype(np.float32).tofile(a.out + '.f32')
meta = {'n': n, 'gates': int(ref.shape[1]), 'gate0': float(rng[0]), 'dr': float(rng[1] - rng[0]), 'elev': float(np.mean(radar.elevation['data'][sl])), 'file': a.out.split('/')[-1] + '.f32',
        'site': a.volume.split('/')[-1][:4]}
json.dump(meta, open(a.out + '.json', 'w'))
print(meta)
