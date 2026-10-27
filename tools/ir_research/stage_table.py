"""Per-stage numbers of the real storms in the 500 x 500 km box round the centre (the model's nest is 512 km): median cold areas (km2) and radial mean Tb at fixed radii.
   python stage_table.py            (run from the folder with crops/ made by series.py / track.py)"""
import glob, numpy as np
STAGES = [('Nolo TD 13-15 Sep', 'nolo_td', '2026091[345]'), ('Nolo remnant/invest 16-20 Sep', 'nolo_rem', '2026091[6789]*'), ('Nolo TS 23-24 Sep', 'nolo_rem', '2026092[34]'),
          ('Nolo cat1-4 RI 25-27 Sep', 'nolo_hur', '2026092[567]'), ('Nolo peak 28 Sep', 'nolo_hur', '20260928'), ('Nolo typhoon 4-6 Oct', 'nolo_ty', '2026100[456]'),
          ('Dorian cat 4-5 1-3 Sep', 'dorian', '2019090[123]'), ('Ian cat 3-5 27-28 Sep', 'ian', '2022092[78]')]
RAD = [5, 15, 25, 35, 45, 65, 85, 115, 155, 195, 245]
def box_profile(tb, res, half=250.0):
    n = tb.shape[0]; c = (n - 1) / 2; yy, xx = np.mgrid[0:n, 0:n]; r = np.hypot(yy - c, xx - c) * res
    box = (np.abs(yy - c) * res <= half) & (np.abs(xx - c) * res <= half) & np.isfinite(tb)
    out = {f'A{t}': float(np.sum((tb < -t) & box) * res * res) for t in (40, 60, 70, 80)}
    out['prof'] = [float(np.nanmean(tb[(r >= q - 5) & (r < q + 5) & np.isfinite(tb)])) for q in RAD]
    return out
if __name__ == '__main__':
    print('%-32s %3s  %7s %7s %7s %6s   %s' % ('stage', 'n', 'A<-40', 'A<-60', 'A<-70', 'A<-80', 'mean Tb at ' + ' '.join(str(q) for q in RAD) + ' km'))
    for name, d, pat in STAGES:
        rows = []
        for f in sorted(glob.glob(f'crops/{d}/{pat}*.npz')):
            z = np.load(f); tb = z['tb'].astype(np.float32); res = float(z['res'])
            if tb.shape[0] * res < 480: continue
            rows.append(box_profile(tb, res))
        if not rows: print(name, 'none'); continue
        med = lambda k: np.median([r[k] for r in rows])
        prof = np.median([r['prof'] for r in rows], axis=0)
        print('%-32s %3d  %7.0f %7.0f %7.0f %6.0f   %s' % (name, len(rows), med('A40') / 1e3, med('A60') / 1e3, med('A70') / 1e3, med('A80') / 1e3, ' '.join('%4.0f' % p for p in prof)))
