"""A series of frames of one storm: download in parallel, crop, keep the crops (npz) and the numbers (json), make contact sheets.
   python series.py NAME SAT START END STEP_H HALF_KM RES_KM  --anchors 'ISO,lat,lon;ISO,lat,lon;...'  [--sheet 3x3] [--eye]
"""
import sys, os, json, math, argparse, datetime as dt, subprocess, concurrent.futures as cf
import numpy as np
import goes_ir as G

def parse_iso(s): return dt.datetime.strptime(s, '%Y-%m-%dT%H:%M')
def make_path(anchors):
    pts = [(parse_iso(a[0]), float(a[1]), float(a[2])) for a in anchors]
    def at(t):
        if t <= pts[0][0]: return pts[0][1], pts[0][2]
        if t >= pts[-1][0]: return pts[-1][1], pts[-1][2]
        for (t0, a0, o0), (t1, a1, o1) in zip(pts, pts[1:]):
            if t0 <= t <= t1:
                u = (t - t0).total_seconds() / (t1 - t0).total_seconds(); return a0 + (a1 - a0) * u, o0 + (o1 - o0) * u
    return at
def lon180(o): return ((o + 180) % 360) - 180

def find_eye(tb, res_km, prior_px=None, search_km=120.0, min_depth=8.0):
    """a warm spot (an eye) in a cold canopy: the local maximum of the 3x3 mean that has the largest contrast with the mean of the ring 12-45 km round it,
    within search_km of the prior (the crop's centre by default); returns (row, col, eye temperature, ring mean, contrast) or None"""
    n = tb.shape[0]; c = (n - 1) / 2 if prior_px is None else None
    pr, pc = ((n - 1) / 2, (n - 1) / 2) if prior_px is None else prior_px
    t = np.where(np.isfinite(tb), tb, 30.0)
    k = np.pad(t, 1, mode='edge'); sm = sum(k[i:i + n, j:j + n] for i in range(3) for j in range(3)) / 9.0
    R = int(search_km / res_km); r0, r1 = int(max(2, pr - R)), int(min(n - 3, pr + R)); c0, c1 = int(max(2, pc - R)), int(min(n - 3, pc + R))
    ring_in, ring_out = 12.0 / res_km, 45.0 / res_km
    yy, xx = np.mgrid[-int(ring_out) - 1:int(ring_out) + 2, -int(ring_out) - 1:int(ring_out) + 2]; rr = np.hypot(yy, xx); ring = (rr >= ring_in) & (rr <= ring_out)
    best = None
    for i in range(r0, r1):
        for j in range(c0, c1):
            if i < int(ring_out) + 1 or j < int(ring_out) + 1 or i > n - int(ring_out) - 2 or j > n - int(ring_out) - 2: continue
            v = sm[i, j]
            if v < -20: continue
            patch = sm[i - int(ring_out) - 1:i + int(ring_out) + 2, j - int(ring_out) - 1:j + int(ring_out) + 2]
            rm = patch[ring].mean(); cont = v - rm
            if cont < min_depth: continue
            score = cont - 0.03 * math.hypot(i - pr, j - pc) * res_km
            if best is None or score > best[0]: best = (score, i, j, float(v), float(rm), float(cont))
    return None if best is None else best[1:]

def run(args):
    anchors = [a.split(',') for a in args.anchors.split(';')]; at = make_path(anchors)
    t0, t1 = parse_iso(args.start), parse_iso(args.end); step = dt.timedelta(hours=args.step)
    times = []; t = t0
    while t <= t1: times.append(t); t += step
    os.makedirs(f'out/{args.name}', exist_ok=True); os.makedirs(f'crops/{args.name}', exist_ok=True)
    def dl(t):
        try: return t, G.fetch(args.sat, t)
        except Exception as e: return t, e
    rows = []; panels = []; sheet_n = 0; cols, nrows = (int(x) for x in args.sheet.split('x'))
    with cf.ThreadPoolExecutor(max_workers=4) as ex:
        futs = [ex.submit(dl, t) for t in times]
        for fu in futs:
            t, res = fu.result()
            if isinstance(res, Exception): print('skip', t, res); continue
            path, when = res
            try:
                fr = G.Frame(path); lat, lon = at(t); tb, LAT, LON = fr.crop(lat, lon180(lon), half_km=args.half_km, res_km=args.res_km)
                np.savez_compressed(f'crops/{args.name}/{when:%Y%m%dT%H%M}.npz', tb=tb.astype(np.float16), lat=lat, lon=lon180(lon), res=args.res_km)
                st = G.stats(tb, args.res_km); st['time'] = f'{when:%Y-%m-%dT%H:%M}'; st['lat'] = lat; st['lon'] = lon180(lon)
                lab = f'{when:%m-%d %H:%MZ} c=({lat:.1f},{lon180(lon):.1f}) min {st["tmin"]:.0f}C'
                if args.eye:
                    e = find_eye(tb, args.res_km)
                    if e: st['eye'] = {'t': e[2], 'ring': e[3], 'contrast': e[4], 'off_km': [(e[0] - (tb.shape[0] - 1) / 2) * args.res_km, (e[1] - (tb.shape[1] - 1) / 2) * args.res_km]}; lab += f' eye {e[2]:.0f}C'
                rows.append(st); panels.append(G.panel(tb, lab, res_km=args.res_km, scale=args.scale, ring_km=tuple(args.rings)))
            except Exception as e:
                print('fail', t, repr(e))
            finally:
                try: os.remove(path)
                except OSError: pass
            if len(panels) == cols * nrows:
                G.sheet(panels, cols, f'out/{args.name}/sheet{sheet_n:02d}.png'); sheet_n += 1; panels = []
    if panels: G.sheet(panels, cols, f'out/{args.name}/sheet{sheet_n:02d}.png')
    json.dump(rows, open(f'out/{args.name}/stats.json', 'w'), indent=1); print('done', len(rows), 'frames', sheet_n + (1 if panels else 0), 'sheets')

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('name'); ap.add_argument('sat'); ap.add_argument('start'); ap.add_argument('end'); ap.add_argument('step', type=float); ap.add_argument('half_km', type=float); ap.add_argument('res_km', type=float)
    ap.add_argument('--anchors', required=True); ap.add_argument('--sheet', default='3x3'); ap.add_argument('--scale', type=int, default=1); ap.add_argument('--eye', action='store_true'); ap.add_argument('--rings', type=float, nargs='*', default=[100, 200])
    run(ap.parse_args())
