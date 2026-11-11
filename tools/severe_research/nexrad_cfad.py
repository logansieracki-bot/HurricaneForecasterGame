#!/usr/bin/env python3
"""A first comparison of the Severe core's storm with real radar: reflectivity by height (CFAD) and its percentile profiles.

Real side: Level II volumes of NEXRAD from the Unidata archive (s3://unidata-nexrad-level2), read with Py-ART (not a dependency of the project: pip install arm_pyart into a
scratch directory and pass it with --pylib). For each volume the strongest echo cluster is found, an 84 km square box (the model's box) is cut around it and every sweep's gates
are averaged (in linear Z, masked gates counting as no echo) into 2 km x 2 km columns, each with the height of its beam. The beams of a real volume cut a storm 100 km away at a
handful of heights only (about 1.8, 2.7, 3.5, 4.5, 5.7, 7.1, 9, 11, 14 km), with beams 2 km thick, so the comparison is made at those heights:
Model side: the 3-D reflectivity the storm script wrote (wk82_run.mjs, <out>.dbz3d.i8) is sampled by a virtual radar at the same range: at every elevation of the real volume the
model's linear Z is averaged over the beam's vertical extent (the beam centre r sin(e) + r^2 / (2 * 4/3 * R_earth), the width r * 1 degree), on the model's own 2 km columns
(a 1 km run is first averaged to 2 km). A column is part of the storm when its composite reflectivity is at least 20 dBZ.

  nexrad_cfad.py --pylib DIR --model run.json[:label] [--model other.json:label2 ...] [--t0 40 --t1 100] --out result.json --png fig.png  VOLUME.gz[:x0:y0] ...
(x0, y0, km east and north of the radar, are the centre of the box; without them the strongest cluster of 55 dBZ and more between 50 and 140 km is used.)
"""
import argparse, json, sys, warnings
warnings.filterwarnings('ignore')

ap = argparse.ArgumentParser()
ap.add_argument('--pylib', default=None); ap.add_argument('--model', action='append', required=True, help='run.json[:label], more than once to compare variants'); ap.add_argument('--t0', type=float, default=40); ap.add_argument('--t1', type=float, default=100)
ap.add_argument('--out', default='cfad.json'); ap.add_argument('--png', default='cfad.png'); ap.add_argument('--box', type=float, default=84.0); ap.add_argument('--min-gates', type=int, default=6)
ap.add_argument('--rmin', type=float, default=50.0); ap.add_argument('--rmax', type=float, default=140.0); ap.add_argument('--label', default='')
ap.add_argument('volumes', nargs='+')
a = ap.parse_args()
if a.pylib: sys.path.insert(0, a.pylib)
import numpy as np, pyart
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt

RE = 6371.0 * 4 / 3                                                     # effective earth radius for the beam (km)
BIN = 2.0                                                               # km, the horizontal size of a column (the model's 2 km cells)
PCT = [50, 90, 99]
THR = 20.0                                                              # dBZ: the composite threshold for a column to be part of the storm

def dbz_of(z): return 10 * np.log10(np.maximum(z, 1e-3))

def real_volume(path, centre):
    radar = pyart.io.read_nexrad_archive(path)
    s0 = radar.get_slice(0); ref0 = radar.fields['reflectivity']['data'][s0].filled(-99); az = radar.azimuth['data'][s0]; rng = radar.range['data'][:ref0.shape[1]] / 1000.0
    x0 = rng[None, :] * np.sin(np.deg2rad(az))[:, None]; y0 = rng[None, :] * np.cos(np.deg2rad(az))[:, None]
    if centre is None:                                                  # the strongest cluster of 55 dBZ: around the strongest 20 km cell of such gates
        m = (ref0 >= 55) & (rng[None, :] >= a.rmin) & (rng[None, :] <= a.rmax)
        xs, ys = x0[m], y0[m]; best, cx, cy = 0, 0, 0
        for px, py in zip(xs[::3], ys[::3]):
            n = int(((np.abs(xs - px) < 20) & (np.abs(ys - py) < 20)).sum())
            if n > best: best, cx, cy = n, px, py
        sel = (np.abs(xs - cx) < 20) & (np.abs(ys - cy) < 20); centre = (float(xs[sel].mean()), float(ys[sel].mean()))
    xc, yc = centre; half = a.box / 2; nb = int(round(a.box / BIN)); r0 = float(np.hypot(xc, yc))
    sweeps = []
    for sw in range(radar.nsweeps):
        ref = radar.fields['reflectivity']['data'][radar.get_slice(sw)]
        if ref.count() == 0: continue
        gx, gy, gz = radar.get_gate_x_y_z(sw); gx = gx[:, :ref.shape[1]] / 1000.0; gy = gy[:, :ref.shape[1]] / 1000.0; gz = gz[:, :ref.shape[1]] / 1000.0
        inb = (np.abs(gx - xc) < half) & (np.abs(gy - yc) < half) & (np.hypot(gx, gy) > 20)
        if inb.sum() < 50: continue
        ix = np.floor((gx[inb] - (xc - half)) / BIN).astype(int); iy = np.floor((gy[inb] - (yc - half)) / BIN).astype(int)
        ok = (ix >= 0) & (ix < nb) & (iy >= 0) & (iy < nb); ix, iy = ix[ok], iy[ok]
        rv = ref[inb][ok]; zl = np.where(np.ma.getmaskarray(rv), 0.0, 10 ** (rv.filled(-99) / 10.0)); hz = gz[inb][ok]
        flat = iy * nb + ix; S = np.bincount(flat, weights=zl, minlength=nb * nb); N = np.bincount(flat, minlength=nb * nb); H = np.bincount(flat, weights=hz, minlength=nb * nb)
        valid = N >= a.min_gates
        Z = np.where(valid, S / np.maximum(N, 1), np.nan); Hm = np.where(valid, H / np.maximum(N, 1), np.nan)
        sweeps.append({'elev': float(radar.fixed_angle['data'][sw]), 'dbz': dbz_of(Z).reshape(nb, nb), 'h': Hm.reshape(nb, nb), 'valid': valid.reshape(nb, nb)})
    return {'centre': centre, 'r0': r0, 'sweeps': sweeps, 'time': str(radar.time['units'])[-20:]}

def merge_elev(sweeps):                                                 # sweeps at the same elevation (split cuts): one level, the stronger value where both exist
    out = {}
    for s in sweeps:
        k = round(s['elev'], 1)
        if k not in out: out[k] = dict(s)
        else:
            o = out[k]; d = np.where(np.isnan(o['dbz']), -99, o['dbz']); e = np.where(np.isnan(s['dbz']), -99, s['dbz'])
            o['dbz'] = np.where(np.maximum(d, e) < -90, np.nan, np.maximum(d, e)); o['h'] = np.where(np.isnan(o['h']), s['h'], o['h'])
    return [out[k] for k in sorted(out)]

def real_samples(v):
    sw = merge_elev(v['sweeps']); comp = np.full(sw[0]['dbz'].shape, -99.0)
    for s in sw: comp = np.maximum(comp, np.where(np.isnan(s['dbz']), -99, s['dbz']))
    storm = comp >= THR
    rows = []
    for s in sw:
        m = storm & ~np.isnan(s['dbz']); h = float(np.nanmedian(s['h'][m])) if m.any() else float('nan')
        rows.append({'elev': s['elev'], 'h': h, 'dbz': np.where(m, s['dbz'], np.nan)[m] if m.any() else np.array([]), 'cover': float((m & (s['dbz'] >= THR)).sum() / max(1, storm.sum()))})
    return rows, int(storm.sum())

def beam_height(r, e):                                                  # km above the radar (Py-ART's 4/3 earth)
    return float(np.sqrt(r * r + RE * RE + 2 * r * RE * np.sin(np.deg2rad(e))) - RE)

def model_samples(model_json, r0, elevs):
    d = json.load(open(model_json)); nx, ny, nz, dz, dx = d['nx'], d['ny'], d['nz'], d['dz'] / 1000.0, d['dx'] / 1000.0
    f = d['dbz3d']; arr = np.fromfile(model_json.rsplit('/', 1)[0] + '/' + f['file'], dtype=np.int8).reshape(f['nt'], nz, ny, nx).astype(float)
    if dx < BIN - 1e-9:                                                 # average a finer run to the 2 km columns in linear Z
        q = int(round(BIN / dx)); z = 10 ** (arr / 10.0); z = z[:, :, :ny // q * q, :nx // q * q].reshape(f['nt'], nz, ny // q, q, nx // q, q).mean(axis=(3, 5)); arr = dbz_of(z) if False else 10 * np.log10(np.maximum(z, 1e-3))
        arr = np.where(z < 1e-3, -30, arr)
    lin = 10 ** (arr / 10.0); lin = np.where(arr <= -29, 0.0, lin)
    out = []
    for fi, t in enumerate(f['times']):
        if t < a.t0 or t > a.t1: continue
        comp = arr[fi].max(axis=0); storm = comp >= THR; rows = []
        for e in elevs:
            hc = beam_height(r0, e); half = 0.5 * r0 * np.deg2rad(1.0) * np.cos(np.deg2rad(e)); lo, hi = max(0.0, hc - half), hc + half
            if lo >= nz * dz: rows.append({'elev': e, 'h': hc, 'dbz': np.array([]), 'cover': 0.0}); continue
            wts = np.array([max(0.0, min(hi, (k + 1) * dz) - max(lo, k * dz)) for k in range(nz)]); wts = wts / wts.sum()
            z = (lin[fi] * wts[:, None, None]).sum(axis=0); db = dbz_of(z); m = storm
            rows.append({'elev': e, 'h': hc, 'dbz': db[m & (db > -29)], 'cover': float((m & (db >= THR)).sum() / max(1, m.sum()))})
        out.append((t, rows, int(storm.sum())))
    return out

def stats(vals):
    if len(vals) < 5: return [None] * (len(PCT) + 1)
    return [float(np.percentile(vals, p)) for p in PCT] + [float(np.max(vals))]

# ---- run ----
vols = []
for spec in a.volumes:
    p = spec.split(':'); centre = (float(p[1]), float(p[2])) if len(p) == 3 else None
    v = real_volume(p[0], centre); rows, ncol = real_samples(v); v['rows'], v['ncol'], v['file'] = rows, ncol, p[0].rsplit('/', 1)[-1]; vols.append(v)
    print('%s: box centre (%.0f, %.0f) km, range %.0f km, %d storm columns of 2 km, sweeps at %s km' % (v['file'], v['centre'][0], v['centre'][1], v['r0'], ncol, ' '.join('%.1f' % r['h'] for r in rows)))
r0 = float(np.mean([v['r0'] for v in vols])); elevs = sorted({round(r['elev'], 1) for v in vols for r in v['rows']})
models = []
for spec in a.model:
    path, _, label = spec.partition(':'); models.append((label or path.rsplit('/', 1)[-1], model_samples(path, r0, elevs)))
print('virtual radar at %.0f km, elevations %s, model heights %s km' % (r0, elevs, ' '.join('%.1f' % beam_height(r0, e) for e in elevs)))

def level_rows(rows): return [{'elev': r['elev'], 'h': r['h'], 'n': int(len(r['dbz'])), 'cover20': r['cover'], 'pct': stats(r['dbz'][r['dbz'] >= 10])} for r in rows]
res = {'range_km': r0, 'elevations': elevs, 'real': [{'file': v['file'], 'centre': v['centre'], 'r0': v['r0'], 'columns': v['ncol'], 'levels': level_rows(v['rows'])} for v in vols], 'models': {}}
for label, mod in models: res['models'][label] = [{'t': t, 'columns': ncol, 'levels': level_rows(rows)} for t, rows, ncol in mod]
json.dump(res, open(a.out, 'w'))

# a verdict per model: the mean over the levels of the layer of (model - real) in the percentiles, the real value being the mean of the volumes, the model's the median over its frames
LAYERS = [('2-10 km', 1.5, 10.0), ('10-15 km', 10.0, 15.0)]
def offset(label, lo, hi):
    out = []
    for pi, p in enumerate(PCT):
        d = []
        for lv in range(len(elevs)):
            rv = [v['levels'][lv]['pct'][pi] for v in res['real'] if lv < len(v['levels']) and v['levels'][lv]['pct'][pi] is not None and lo <= v['levels'][lv]['h'] < hi]
            mv = [m['levels'][lv]['pct'][pi] for m in res['models'][label] if 'levels' in m and lv < len(m['levels']) and m['levels'][lv]['pct'][pi] is not None]
            if rv and mv: d.append(np.median(mv) - np.mean(rv))
        out.append(float(np.mean(d)) if d else float('nan'))
    return out
res['offsets'] = {}
for label in res['models']:
    res['offsets'][label] = {}
    for name, lo, hi in LAYERS:
        o = offset(label, lo, hi); res['offsets'][label][name] = o
        print('%-28s model minus real, %-9s: median %+5.1f, 90th %+5.1f, 99th %+5.1f dB' % (label, name, o[0], o[1], o[2]))
json.dump(res, open(a.out, 'w'))

# ---- figure: percentile profiles and the pooled CFADs ----
def pooled(rows_list, elevs):
    out = {}
    for e in elevs:
        vals = np.concatenate([r['dbz'][r['dbz'] >= 10] for rows in rows_list for r in rows if abs(r['elev'] - e) < 0.05] or [np.array([])])
        hs = [r['h'] for rows in rows_list for r in rows if abs(r['elev'] - e) < 0.05 and not np.isnan(r['h'])]
        out[e] = (float(np.mean(hs)) if hs else np.nan, vals)
    return out
palette = ['#c0392b', '#2471a3', '#1e8449', '#8e44ad']
nm = len(models)
fig = plt.figure(figsize=(17, 9.6), constrained_layout=True); gs = fig.add_gridspec(2, max(4, nm + 1), height_ratios=[1, 0.9])
names = {50: 'median', 90: '90th percentile', 99: '99th percentile'}
for pi, p in enumerate(PCT):
    A = fig.add_subplot(gs[0, pi])
    for vi, v in enumerate(res['real']):
        hh = [l['h'] for l in v['levels'] if l['pct'][pi] is not None]; yy = [l['pct'][pi] for l in v['levels'] if l['pct'][pi] is not None]
        A.plot(yy, hh, color='k', lw=0.8, alpha=0.5, marker='o', ms=2.5, label='real volume' if vi == 0 else None)
    for mi, (label, mod) in enumerate(models):
        per = {}
        for t, rows, ncol in mod:
            for r in rows:
                st = stats(r['dbz'][r['dbz'] >= 10])
                if st[pi] is not None: per.setdefault(round(r['elev'], 1), []).append((r['h'], st[pi]))
        eh = sorted(per); hh = [np.mean([q[0] for q in per[x]]) for x in eh]; med = [np.median([q[1] for q in per[x]]) for x in eh]
        lo = [np.percentile([q[1] for q in per[x]], 10) for x in eh]; hi = [np.percentile([q[1] for q in per[x]], 90) for x in eh]
        A.plot(med, hh, color=palette[mi], lw=2.2, label=label); A.fill_betweenx(hh, lo, hi, color=palette[mi], alpha=0.12)
    A.set_title(names[p] + ' of the storm columns', fontsize=9, loc='left'); A.set_xlabel('dBZ'); A.set_ylabel('beam height above the radar (km)'); A.set_xlim(10, 80); A.set_ylim(0, 17); A.grid(alpha=0.3)
    if pi == 0: A.legend(fontsize=7, loc='upper right')
B = fig.add_subplot(gs[0, 3])
for v in res['real']: B.plot([100 * l['cover20'] for l in v['levels']], [l['h'] for l in v['levels']], color='k', lw=0.8, alpha=0.5, marker='o', ms=2.5)
for mi, (label, mod) in enumerate(models):
    per = {}
    for t, rows, ncol in mod:
        for r in rows: per.setdefault(round(r['elev'], 1), []).append((r['h'], 100 * r['cover']))
    eh = sorted(per); B.plot([np.median([q[1] for q in per[x]]) for x in eh], [np.mean([q[0] for q in per[x]]) for x in eh], color=palette[mi], lw=2.2)
B.set_xlabel('share of the storm columns with 20 dBZ or more (%)'); B.set_ylim(0, 17); B.set_xlim(0, 100); B.grid(alpha=0.3); B.set_title('echo depth', fontsize=9, loc='left')
edges = np.arange(10, 85, 5)
def cfad(A, P, title):
    for e in elevs:
        h, v = P[e]
        if np.isnan(h) or len(v) < 5: continue
        hist = np.histogram(v, bins=edges)[0].astype(float); hist = 100 * hist / hist.sum()
        A.pcolormesh(edges, [h - 0.5, h + 0.5], hist[None, :], cmap='viridis', vmin=0, vmax=40, shading='flat')
    A.set_title(title, fontsize=9, loc='left'); A.set_xlabel('reflectivity (dBZ); colour = share of the samples at that height (%)', fontsize=8); A.set_ylabel('beam height (km)'); A.set_ylim(0, 17); A.set_xlim(10, 80); A.set_facecolor('#222')
cfad(fig.add_subplot(gs[1, 0]), pooled([v['rows'] for v in vols], elevs), 'real: %s (%d volumes)' % (a.label or 'NEXRAD', len(vols)))
for mi, (label, mod) in enumerate(models): cfad(fig.add_subplot(gs[1, mi + 1]), pooled([r for _, r, _ in mod], elevs), '%s, %d-%d min (%d frames)' % (label, a.t0, a.t1, len(mod)))
fig.suptitle('Reflectivity by height at a radar range of %.0f km: %s against the Severe core with ice (2 km columns, 1 degree beam)' % (r0, a.label or 'NEXRAD'), fontsize=10)
fig.savefig(a.png, dpi=100); print('saved', a.png, a.out)
