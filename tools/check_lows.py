#!/usr/bin/env python3
"""The pressure lows the simulator's detector finds in REAL sea-level pressure (ERA5, 2007-2021), for checking the simulated lows against.

The page finds lows as local minima of its sea-level-pressure field on the 4-degree node grid (src/template.html detectLowsOn: central pressure at
or below 1008 hPa, a strict minimum among the eight neighbours, at least 2 hPa below the mean of the ring of eight nodes two steps away, latitude
18-68, the centre refined with a parabola) and links them every six hours with the engine's LowTracker (nearest neighbour inside 7 degrees along
the track's own drift, a track ends after two misses; src/storms.js). This runs exactly that on ERA5 interpolated to the same nodes, so the real and
the simulated numbers are made the same way: tracks of at least three fixes (18 h) born per month, the deepest pressure and the lifetime.
Written: data/generated/atlantic-lows-ref.json. usage: check_lows.py [out.json]"""
import json, os, sys
import numpy as np
import xarray as xr

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
RAW = os.path.join(ROOT, "data", "raw")
LAT = 72 - 4 * np.arange(29); LON = -110 + 4 * np.arange(38)
LOW_MAX, PROM, LAT0, LAT1 = 1008.0, 2.0, 18.0, 68.0


def detect(P):
    out = []
    ny, nx = P.shape
    for j in range(2, ny - 2):
        for i in range(2, nx - 2):
            p = P[j, i]; al = abs(LAT[j])
            if not (p <= LOW_MAX) or al < LAT0 or al > LAT1:
                continue
            nb = P[j - 1:j + 2, i - 1:i + 2].copy(); nb[1, 1] = np.inf
            if (nb <= p).any():
                continue
            ring = (P[j, i - 2] + P[j, i + 2] + P[j - 2, i] + P[j + 2, i] + P[j - 2, i - 2] + P[j - 2, i + 2] + P[j + 2, i - 2] + P[j + 2, i + 2]) / 8
            if ring - p < PROM:
                continue
            l, r, u, d = P[j, i - 1], P[j, i + 1], P[j - 1, i], P[j + 1, i]
            cx = l + r - 2 * p; cy = u + d - 2 * p
            ox = max(-1, min(1, (l - r) / (2 * cx))) if cx > 1e-6 else 0.0
            oy = max(-1, min(1, (d - u) / (2 * cy))) if cy > 1e-6 else 0.0
            pk = p - ((r - l) ** 2 / (8 * cx) if cx > 1e-6 else 0) - ((u - d) ** 2 / (8 * cy) if cy > 1e-6 else 0)
            out.append(dict(lat=LAT[j] + oy * 4, lon=LON[i] + ox * 4, p=pk))
    return out


class Tracker:                                          # the engine's LowTracker, in Python
    def __init__(self):
        self.tracks = []; self.done = []
    def update(self, hour, dets):
        alive = [t for t in self.tracks if t["alive"]]; used = [False] * len(dets); pairs = []
        for t in alive:
            pl, po = t["lat"] + t["dy"], t["lon"] + t["dx"]
            for k, d in enumerate(dets):
                dist = np.hypot(d["lat"] - pl, (d["lon"] - po) * np.cos(np.radians(d["lat"])))
                if dist < 7:
                    pairs.append((dist, id(t), t, k))
        pairs.sort(key=lambda x: (x[0], x[1]))
        matched = set()
        for dist, _, t, k in pairs:
            if id(t) in matched or used[k]:
                continue
            matched.add(id(t)); used[k] = True; d = dets[k]
            t["dy"] = 0.5 * t["dy"] + 0.5 * (d["lat"] - t["lat"]); t["dx"] = 0.5 * t["dx"] + 0.5 * (d["lon"] - t["lon"])
            t["lat"], t["lon"], t["miss"] = d["lat"], d["lon"], 0; t["n"] += 1; t["pmin"] = min(t["pmin"], d["p"])
        for t in alive:
            if id(t) not in matched:
                t["miss"] += 1
                if t["miss"] >= 2:
                    t["alive"] = False; self.done.append((t["born"], hour, t["n"], t["pmin"]))
        for k, d in enumerate(dets):
            if not used[k]:
                self.tracks.append(dict(born=hour, lat=d["lat"], lon=d["lon"], dx=0.0, dy=0.0, miss=0, alive=True, n=1, pmin=d["p"]))
        self.tracks = [t for t in self.tracks if t["alive"]]
    def finish(self, hour):
        for t in self.tracks:
            self.done.append((t["born"], hour, t["n"], t["pmin"]))


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "data", "generated", "atlantic-lows-ref.json")
    years = list(range(2007, 2022))
    per_month = np.zeros(12); fixes_month = np.zeros(12); snaps_month = np.zeros(12); pmins = []; durs = []; pm_month = [[] for _ in range(12)]
    for y in years:
        ds = xr.open_dataset(os.path.join(RAW, f"era5_mslp_{y}.nc"))["mslp"]
        ds = ds.assign_coords(longitude=(((ds.longitude + 180) % 360) - 180)).sortby("longitude").sortby("latitude")
        G = ds.interp(latitude=LAT, longitude=LON).values            # (time, 29, 38) hPa
        times = ds.time.values.astype("datetime64[h]")
        tr = Tracker()
        t0 = times[0]
        for k in range(G.shape[0]):
            if k % 1:        # every 6 hours: the file is 6-hourly
                continue
            hour = int((times[k] - t0) / np.timedelta64(1, "h"))
            dets = detect(G[k]); m = int(str(times[k])[5:7]) - 1
            fixes_month[m] += len(dets); snaps_month[m] += 1
            tr.update(hour, dets)
        tr.finish(int((times[-1] - t0) / np.timedelta64(1, "h")))
        for born, end, n, pmin in tr.done:
            if n >= 3:
                m = int(str(t0 + np.timedelta64(int(born), "h"))[5:7]) - 1
                per_month[m] += 1; pmins.append(pmin); durs.append(end - born); pm_month[m].append(pmin)
        print(y, "tracks with >= 3 fixes:", sum(1 for d in tr.done if d[2] >= 3), flush=True)
    ny = len(years)
    res = dict(years=[years[0], years[-1]], thresholds=dict(max=LOW_MAX, prom=PROM, lat=[LAT0, LAT1]),
               tracks_per_month=[round(float(x) / ny, 2) for x in per_month], detections_per_snapshot=[round(float(f) / max(s, 1), 2) for f, s in zip(fixes_month, snaps_month)],
               pmin_mean=round(float(np.mean(pmins)), 1), pmin_p10=round(float(np.percentile(pmins, 10)), 1), pmin_p50=round(float(np.percentile(pmins, 50)), 1),
               dur_h_mean=round(float(np.mean(durs)), 1), dur_h_p50=round(float(np.percentile(durs, 50)), 1), dur_h_p90=round(float(np.percentile(durs, 90)), 1),
               pmin_by_month=[round(float(np.mean(a)), 1) if a else None for a in pm_month], tracks_per_year=round(float(per_month.sum()) / ny, 1))
    with open(out_path, "w") as fh:
        json.dump(res, fh, separators=(",", ":"))
    print(json.dumps(res))


if __name__ == "__main__":
    main()
