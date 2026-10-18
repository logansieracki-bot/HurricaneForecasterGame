#!/usr/bin/env python3
"""Real Atlantic track statistics the engine's motion is validated against (not fitted to).

Source: the IBTrACS tables of tools/make_tc_ref.py, 00/06/12/18 UTC rows, 1991-2020 unless stated.
  motion residuals   every pair of consecutive six-hourly rows of a tropical / subtropical / extratropical system over water (as in make_tc_maps.py), 1980-2024:
                     the translation velocity (kt) minus the real mean drift of its class at that place and month (the map the engine is anchored to, same bilinear / mid-month
                     interpolation): per class its standard deviation, and the autocorrelation of the residual at lags of 6, 12, 24, 48 and 96 hours along the track
  displacements      from every six-hourly row of a tropical cyclone (TD..HU) over water inside a box (the main development region, the Caribbean, the western Atlantic subtropics),
                     where the track still exists 48 / 96 hours later (any status): the mean and the standard deviation of the displacement (km east, km north). Storms that end
                     earlier are not in the sample, in the real data or in the simulation: the same censoring on both sides
  reach              the share of named storms whose track reaches 25 / 30 / 35 / 40 N, and the share of named storms of tropical origin south of 20 N at genesis that do
  tracks             named storms per season that make a first landfall in a region box (make_tc_maps.py REGIONS), by genesis region (main development region / Caribbean / Gulf / elsewhere)
Written: data/generated/atlantic-tc-validate.json   usage: make_tc_validate.py [out.json]"""
import json, os, sys
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import make_tc_ref as ref  # noqa: E402
import make_tc_env as env  # noqa: E402

MAPS = json.load(open(os.path.join(ROOT, "data", "generated", "atlantic-tc-maps.json")))
G = MAPS["grid"]
DR = {c: (np.array(MAPS["drift"][c]["u"]), np.array(MAPS["drift"][c]["v"])) for c in ("weak", "strong", "sub", "ex")}
BOXES = {"MDR (10-20N, 60-30W)": (10, 20, -60, -30), "Caribbean (12-20N, 85-60W)": (12, 20, -85, -60), "W Atlantic subtropics (25-35N, 80-55W)": (25, 35, -80, -55)}


def tw(doy):
    p = (doy + 0.5) / 30.4375 - 0.5
    i = int(np.floor(p))
    return i % 12, (i + 1) % 12, p - i


def bil(a, lat, lon):
    fx = np.clip((lon - G["lon0"]) / G["res"], 0, G["nx"] - 1.000001); fy = np.clip((lat - G["lat0"]) / G["res"], 0, G["ny"] - 1.000001)
    i, j = int(fx), int(fy); tx, ty = fx - i, fy - j
    return (a[j, i] * (1 - tx) + a[j, i + 1] * tx) * (1 - ty) + (a[j + 1, i] * (1 - tx) + a[j + 1, i + 1] * tx) * ty


def drift(cls, doy, lat, lon):
    m0, m1, t = tw(doy)
    U, V = DR[cls]
    return ((1 - t) * bil(U[m0], lat, lon) + t * bil(U[m1], lat, lon), (1 - t) * bil(V[m0], lat, lon) + t * bil(V[m1], lat, lon))


def kmdisp(a, b):
    latm = (a.lat + b.lat) / 2
    return (((b.lon - a.lon) + 180) % 360 - 180) * 111.2 * np.cos(np.radians(latm)), (b.lat - a.lat) * 111.2


def loop_flag(lat, lon, step=2, win=10, thresh=300.0, min_km=40.0):
    """does a track turn through 300 degrees or more within 5 days? lat/lon are six-hourly fixes of one storm; headings from 12-hour displacements (each at least 40 km), cumulative turning over `win` of them"""
    la = np.asarray(lat, float); lo = np.asarray(lon, float)
    if len(la) < step + 3:
        return False
    dx = ((lo[step:] - lo[:-step] + 180) % 360 - 180) * 111.2 * np.cos(np.radians((la[step:] + la[:-step]) / 2)); dy = (la[step:] - la[:-step]) * 111.2
    ok = np.hypot(dx, dy) >= min_km
    th = np.degrees(np.arctan2(dx, dy))[ok]
    if len(th) < 3:
        return False
    d = (np.diff(th) + 180) % 360 - 180
    for i in range(0, max(1, len(d) - win + 2)):
        if abs(d[i:i + win - 1].sum()) >= thresh:
            return True
    return False


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "data", "generated", "atlantic-tc-validate.json")
    ref.fetch_wheel(); j = ref.load_atlantic(); land = env.load_land()
    j = j[(j.time >= "1980-01-01")].copy()
    res = {c: {"u": [], "v": [], "pairs": {lag: ([], []) for lag in (1, 2, 4, 8, 16)}} for c in ("weak", "strong", "sub", "ex")}
    disp = {name: {48: [], 96: []} for name in BOXES}
    reach = {"n": 0, 25: 0, 30: 0, 35: 0, 40: 0}
    loops = {"n": 0, "loop": 0}
    for tid, g in j.groupby("track_id", sort=False):
        g = g.sort_values("time").reset_index(drop=True)
        yr = g.time.iloc[0].year
        named = g.status.isin(ref.NAMED).any()
        times = g.time.values
        # residual series along the track (6-hourly consecutive over-water pairs)
        ru, rv, rc = [], [], []
        for i in range(len(g) - 1):
            a, b = g.iloc[i], g.iloc[i + 1]
            if (b.time - a.time) != pd.Timedelta(hours=6) or a.status not in ref.TC | {"EX", "LO"} or b.status not in ref.TC | {"EX", "LO"}:
                ru.append(None); rv.append(None); rc.append(None); continue
            if env.land_fraction(land, a.lat, a.lon) > 0.2 or env.land_fraction(land, b.lat, b.lon) > 0.2:
                ru.append(None); rv.append(None); rc.append(None); continue
            latm = (a.lat + b.lat) / 2; lonm = a.lon + (((b.lon - a.lon + 180) % 360) - 180) / 2
            dx, dy = kmdisp(a, b); u = dx / 6.0 / 1.852; v = dy / 6.0 / 1.852
            w = a.wind if np.isfinite(a.wind) else 30.0
            cls = "sub" if a.status in ("SD", "SS") else "ex" if a.status in ("EX", "LO") else "strong" if (a.status == "HU" and w >= 64) else "weak"
            du, dv = drift(cls, a.time.dayofyear - 1, latm, lonm)
            ru.append(u - du); rv.append(v - dv); rc.append(cls)
        for i, c in enumerate(rc):
            if c is None:
                continue
            res[c]["u"].append(ru[i]); res[c]["v"].append(rv[i])
            for lag, (xs, ys) in res[c]["pairs"].items():
                if i + lag < len(rc) and rc[i + lag] == c and ru[i + lag] is not None:
                    xs.append((ru[i], ru[i + lag])); ys.append((rv[i], rv[i + lag]))
        # displacements from tropical rows
        tidx = {t: k for k, t in enumerate(times)}
        for i in range(len(g)):
            a = g.iloc[i]
            if a.status not in ref.TC or not (1991 <= a.time.year <= 2020):
                continue
            if env.land_fraction(land, a.lat, a.lon) > 0.2:
                continue
            for name, (la0, la1, lo0, lo1) in BOXES.items():
                if la0 <= a.lat <= la1 and lo0 <= a.lon <= lo1:
                    for H in (48, 96):
                        tt = np.datetime64(a.time + pd.Timedelta(hours=H))
                        if tt in tidx:
                            b = g.iloc[tidx[tt]]
                            disp[name][H].append(kmdisp(a, b) if abs(b.lon - a.lon) < 90 else (np.nan, np.nan))
        if named and 1991 <= yr <= 2020:
            gt = g[g.status.isin(ref.TC)]
            loops["n"] += 1; loops["loop"] += int(loop_flag(gt.lat.values, gt.lon.values))
            reach["n"] += 1
            for L in (25, 30, 35, 40):
                if (g.lat >= L).any():
                    reach[L] += 1
    # fate by genesis latitude: of the tropical depressions first seen in a latitude band, the share that became named storms / hurricanes / majors (1991-2020), and the
    # latitude profile of the six-hourly rows of named storms at named-storm strength between 100W and 20W (shares per 5-degree band)
    ev = []
    prof = np.zeros(14)
    for tid, g in j[(j.time >= "1991-01-01") & (j.time < "2021-01-01")].groupby("track_id", sort=False):
        g = g.sort_values("time"); tc = g[g.status.isin(ref.TC)]
        if tc.empty:
            continue
        r0 = tc.iloc[0]
        if r0.status in ("SD", "SS"):
            continue
        w = g.wind.fillna(0)
        ev.append((r0.lat, bool(g.status.isin(ref.NAMED).any()), bool((g.status == "HU").any() and (w >= 64).any()), bool((w >= 96).any())))
        rows = g[g.status.isin(ref.NAMED) & (g.lon >= -100) & (g.lon <= -20)]
        for la in rows.lat.values:
            k = int(np.clip((la - 5) // 5, 0, 13)); prof[k] += 1
    ev = np.array(ev, dtype=float)
    bins = [(0, 13), (13, 17), (17, 25), (25, 70)]
    out_fate = {}
    for lo, hi in bins:
        m = (ev[:, 0] >= lo) & (ev[:, 0] < hi)
        out_fate[f"{lo}-{hi}"] = dict(n=int(m.sum()), named=round(float(ev[m, 1].mean()), 3), hurricane=round(float(ev[m, 2].mean()), 3), major=round(float(ev[m, 3].mean()), 3))
    out_fate["all"] = dict(n=int(len(ev)), named=round(float(ev[:, 1].mean()), 3), hurricane=round(float(ev[:, 2].mean()), 3), major=round(float(ev[:, 3].mean()), 3))
    out = {"meta": dict(source="IBTrACS (huracanpy 1.5.0 tables)", residual_years=[1980, 2024], displacement_years=[1991, 2020])}
    out["genesis_fate"] = out_fate
    out["lat_profile"] = dict(lat0=5, res=5, share=[round(float(x), 4) for x in (prof / prof.sum())])
    out["residual"] = {}
    for c in res:
        u = np.array(res[c]["u"]); v = np.array(res[c]["v"])
        ac = {}
        for lag, (xs, ys) in res[c]["pairs"].items():
            pr = np.array(xs + ys)
            ac[str(lag * 6)] = round(float((pr[:, 0] * pr[:, 1]).mean() / np.sqrt((pr[:, 0] ** 2).mean() * (pr[:, 1] ** 2).mean())), 3) if len(pr) > 50 else None
        out["residual"][c] = dict(n=int(len(u)), mean_u=round(float(u.mean()), 2), mean_v=round(float(v.mean()), 2), sd_u=round(float(u.std()), 2), sd_v=round(float(v.std()), 2), autocorr_h=ac)
    out["displacement"] = {}
    for name in BOXES:
        out["displacement"][name] = {}
        for H in (48, 96):
            a = np.array(disp[name][H], dtype=float)
            a = a[np.isfinite(a).all(axis=1)] if len(a) else a
            out["displacement"][name][str(H)] = dict(n=int(len(a)), mean_e=round(float(a[:, 0].mean()), 0), mean_n=round(float(a[:, 1].mean()), 0), sd_e=round(float(a[:, 0].std()), 0), sd_n=round(float(a[:, 1].std()), 0)) if len(a) > 20 else dict(n=int(len(a)))
    out["reach"] = {str(L): round(reach[L] / reach["n"], 3) for L in (25, 30, 35, 40)}
    out["reach"]["named_storms"] = reach["n"]
    out["loops"] = dict(named_storms=loops["n"], share=round(loops["loop"] / loops["n"], 3))
    with open(out_path, "w") as fh:
        json.dump(out, fh, indent=1)
    print("wrote", out_path)
    for c, d in out["residual"].items():
        print(f"  residual {c:6s} n={d['n']:5d} mean ({d['mean_u']:+.2f}, {d['mean_v']:+.2f}) sd ({d['sd_u']:.2f}, {d['sd_v']:.2f}) autocorr by lag h {d['autocorr_h']}")
    for name, d in out["displacement"].items():
        print(" ", name, d)
    print("  reach", out["reach"]); print("  loops", out["loops"]); print("  fate by genesis latitude", out["genesis_fate"]); print("  latitude profile of named rows", out["lat_profile"]["share"])


if __name__ == "__main__":
    main()
