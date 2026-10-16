#!/usr/bin/env python3
"""The real figures behind STEER_SPECS' highsReal / highsP (tests/run.mjs): the real-data counterpart of the page's high-detection rule, for any basin box: the same rule (a maximum of the total sea-level pressure over its 8
neighbours on the 4 degree node grid, >= 1017 hPa, standing >= 2.5 hPa above the mean of the 8 nodes two steps away, |lat| >= 15 incl. after the
parabola refinement) applied to the REAL daily-mean pressure of 2017-2021 (ERA5), per calendar month and hemisphere. The node grid is the page's:
every second 2 degree node of the displayed box, counting from its north-west corner; maxima on the outer two rows/columns are not considered.
usage: real_steer_highs.py <basin> <lon0> <lon1> <lat0> <lat1> [out.json]"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import climate_lib as cl
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HMIN, PROM, HLAT = 1017.0, 2.5, 15.0
basin, lon0, lon1, lat0, lat1 = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
out_path = sys.argv[6] if len(sys.argv) > 6 else None
sst = cl.load(os.path.join(ROOT, "data", "raw", "ersstv5.nc"))
slp = cl.load_era5_mslp(sst["lat"], sst["lon"], 2017, 2021, freq="D")
box, _, _ = cl.extract_box(slp, lon0, lon1, lat0, lat1)
box = box.transpose("time", "lat", "lon")
P = box.values[:, ::2, ::2].astype("float64")
la = box["lat"].values[::2]
ts = box["time"].values.astype("datetime64[D]"); mon = ts.astype("datetime64[M]").astype(int) % 12 + 1
T, NY, NX = P.shape
def detect(p):
    n = []
    for j in range(2, NY - 2):
        for i in range(2, NX - 2):
            v = p[j, i]
            if v < HMIN or abs(la[j]) < HLAT: continue
            if (p[j - 1:j + 2, i - 1:i + 2] >= v).sum() > 1: continue
            ring = (p[j, i - 2] + p[j, i + 2] + p[j - 2, i] + p[j + 2, i] + p[j - 2, i - 2] + p[j - 2, i + 2] + p[j + 2, i - 2] + p[j + 2, i + 2]) / 8
            if v - ring < PROM: continue
            l, r, u, d = p[j, i - 1], p[j, i + 1], p[j - 1, i], p[j + 1, i]; cx, cy = 2 * v - l - r, 2 * v - u - d
            pk = v + ((r - l) ** 2 / (8 * cx) if cx > 1e-6 else 0) + ((u - d) ** 2 / (8 * cy) if cy > 1e-6 else 0)
            oy = max(-1.0, min(1.0, (u - d) / (2 * cy))) if cy > 1e-6 else 0.0
            if abs(la[j] + oy * 4.0) < HLAT: continue
            n.append((la[j], pk))
    return n
res = {"grid": [NX, NY], "days": int(T), "months": {}}
allp = []
for m in range(1, 13):
    nh, sh = [], []
    for t in np.where(mon == m)[0]:
        d = detect(P[t]); nh.append(sum(1 for x in d if x[0] > 0)); sh.append(sum(1 for x in d if x[0] < 0)); allp += [x[1] for x in d]
    res["months"][m] = {"nh": float(np.mean(nh)), "sh": float(np.mean(sh)), "nh_p10_p90": [float(np.percentile(nh, 10)), float(np.percentile(nh, 90))], "sh_p10_p90": [float(np.percentile(sh, 10)), float(np.percentile(sh, 90))]}
res["pressure_p10_p50_p90"] = [round(float(np.percentile(allp, q)), 1) for q in (10, 50, 90)] if allp else None
print(f"{basin}: grid {NX}x{NY}, {T} days")
print("  month  NH/day  SH/day")
for m, v in res["months"].items(): print(f"  {m:5d}  {v['nh']:6.2f}  {v['sh']:6.2f}")
print("  pressure p10/p50/p90", res["pressure_p10_p50_p90"])
if out_path: json.dump(res, open(out_path, "w"))
