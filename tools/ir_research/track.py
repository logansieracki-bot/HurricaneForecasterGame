"""Follow a storm's eye through a series of frames, forward and backward from a known position, keeping crops and numbers.
   python track.py NAME SAT START END STEP_H SEED_ISO SEED_LAT SEED_LON [--half 250] [--res 2] [--pull 0.0]
Each frame: a crop of +-half km round the previous centre (moved by the last velocity), the eye found by find_eye in it, the centre updated (not when no eye
is found: the centre is then carried on at the last velocity); crops and stats kept in crops/NAME, out/NAME/track.json."""
import sys, os, json, math, argparse, datetime as dt, concurrent.futures as cf
import numpy as np
import goes_ir as G
from series import find_eye, parse_iso, lon180

def run(a):
    t0, t1, ts = parse_iso(a.start), parse_iso(a.end), parse_iso(a.seed)
    step = dt.timedelta(hours=a.step); fwd = []; t = ts
    while t <= t1: fwd.append(t); t += step
    bwd = []; t = ts - step
    while t >= t0: bwd.append(t); t -= step
    os.makedirs(f'crops/{a.name}', exist_ok=True); os.makedirs(f'out/{a.name}', exist_ok=True)
    def dl(t):
        try: return t, G.fetch(a.sat, t)
        except Exception as e: return t, e
    res = {}
    def walk(times, sign):
        lat, lon = a.seed_lat, a.seed_lon; vlat = vlon = 0.0; last = None
        with cf.ThreadPoolExecutor(max_workers=4) as ex:
            futs = [ex.submit(dl, t) for t in times]
            for t, fu in zip(times, futs):
                _, r = fu.result()
                if isinstance(r, Exception): print('skip', t, r); continue
                path, when = r
                try:
                    fr = G.Frame(path); plat, plon = lat + vlat, lon + vlon
                    tb, LAT, LON = fr.crop(plat, lon180(plon), half_km=a.half, res_km=a.res); n = tb.shape[0]
                    e = find_eye(tb, a.res, search_km=a.search, min_depth=a.depth)
                    if e:
                        i, j = e[0], e[1]; c = (n - 1) / 2; nlat = plat - (i - c) * a.res / 111.195; nlon = plon + (j - c) * a.res / (111.195 * math.cos(math.radians(plat)))
                        dtt = abs((when - last).total_seconds()) / 3600.0 if last else a.step
                        if last: vlat = 0.5 * vlat + 0.5 * (nlat - lat) * (1 if True else 0); vlon = 0.5 * vlon + 0.5 * (nlon - lon)
                        lat, lon = nlat, nlon; found = True
                    else:
                        lat, lon = plat, plon; found = False
                    last = when
                    # a fresh crop on the (final) centre of this frame, for the picture and the statistics
                    tb2, _, _ = fr.crop(lat, lon180(lon), half_km=a.half, res_km=a.res)
                    st = G.stats(tb2, a.res); st.update({'time': f'{when:%Y-%m-%dT%H:%M}', 'lat': lat, 'lon': lon180(lon), 'eye_found': found})
                    e2 = find_eye(tb2, a.res, search_km=40, min_depth=a.depth)
                    if e2: st['eye'] = {'t': e2[2], 'ring': e2[3], 'contrast': e2[4]}
                    np.savez_compressed(f'crops/{a.name}/{when:%Y%m%dT%H%M}.npz', tb=tb2.astype(np.float16), lat=lat, lon=lon180(lon), res=a.res)
                    res[st['time']] = st
                except Exception as ex2:
                    print('fail', t, repr(ex2))
                finally:
                    try: os.remove(path)
                    except OSError: pass
    walk(fwd, 1); walk(bwd, -1)
    rows = [res[k] for k in sorted(res)]; json.dump(rows, open(f'out/{a.name}/track.json', 'w'), indent=1); print('frames', len(rows))

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('name'); ap.add_argument('sat'); ap.add_argument('start'); ap.add_argument('end'); ap.add_argument('step', type=float)
    ap.add_argument('seed'); ap.add_argument('seed_lat', type=float); ap.add_argument('seed_lon', type=float)
    ap.add_argument('--half', type=float, default=250.0); ap.add_argument('--res', type=float, default=2.0); ap.add_argument('--search', type=float, default=110.0); ap.add_argument('--depth', type=float, default=8.0)
    run(ap.parse_args())
