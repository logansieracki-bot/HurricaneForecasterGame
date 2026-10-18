#!/usr/bin/env python3
"""How real Atlantic tropical cyclones move relative to the simulator's steering layers: the data the engine's motion law is fitted to.

Rows: every pair of consecutive six-hourly best-track fixes (IBTrACS tables of the PyPI wheel `huracanpy`, same source and pin as
tools/make_tc_ref.py) of a tropical or subtropical cyclone, 2017-2021, whose second fix is still tropical, subtropical, extratropical or a
low (the same selection as the reference's motion table), over water at both ends. The observed motion is the displacement over six hours
(kt, +east / +north).
Steering: the daily-mean layer winds of data/raw/era5_steer_daily_YYYY.nc (the three layers the page has: shallow 850-700, medium 850-500,
deep 850-200 hPa; kt in spite of the file's unit label), averaged over the ANNULUS 200-600 km round the centre. The annulus is what a
vortex-free field like the page's looks like at a storm's centre: a point value 1.5 degrees from a cyclone contains its own circulation.
Fit: [u_obs, v_obs] = w_shallow [u_s, v_s] + w_medium [u_m, v_m] + w_deep [u_d, v_d] + [b_u, b_v], one set of weights per class (shared by
the two components, offsets free), by least squares within intensity classes and latitude bands; the offsets are the drift relative to the
flow (beta drift, in a north-westward direction for a tropical storm in easterlies). Residuals give the amplitude and the persistence of
the unsteered wobble.
Written: data/generated/atlantic-tc-motion.json (fit tables only) and data/raw/atlantic-tc-motion-rows.csv (per-row table, git-ignored).
usage: make_tc_motion.py [out.json]"""
import json, os, sys
import numpy as np
import pandas as pd
import xarray as xr

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import make_tc_ref as ref  # noqa: E402
import make_tc_env as env  # noqa: E402  (land mask, great-circle helpers)

RAW = os.path.join(ROOT, "data", "raw")
TC = ref.TC
R_EARTH = 6371.0
ANN = (200.0, 600.0)
LAYERS = ("shallow", "medium", "deep")


def annulus_vec(u, v, lat, lon, la, lo, r0=ANN[0], r1=ANN[1]):
    """vector mean of a (lat, lon) wind field over the annulus r0..r1 km round (lat, lon); la, lo are the grid axes (lo 0..358.5)"""
    dlat = r1 / 111.2 + 1.6
    j = np.where((la >= lat - dlat) & (la <= lat + dlat))[0]
    cosl = max(0.15, np.cos(np.radians(min(abs(lat) + dlat, 85.0))))
    dlon = min(180.0, (r1 / 111.2) / cosl + 2.0)
    i0 = int(round((lon % 360.0) / 1.5)); n = int(np.ceil(dlon / 1.5))
    ii = np.arange(i0 - n, i0 + n + 1) % 240
    LA, LO = np.meshgrid(la[j], lo[ii], indexing="ij")
    p1, p2 = np.radians(lat), np.radians(LA)
    dl = np.radians(((LO - lon + 180) % 360) - 180)
    h = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    d = 2 * R_EARTH * np.arcsin(np.sqrt(h))
    m = (d >= r0) & (d <= r1)
    uu = u[np.ix_(j, ii)][m]; vv = v[np.ix_(j, ii)][m]
    ok = np.isfinite(uu) & np.isfinite(vv)
    return (float(uu[ok].mean()), float(vv[ok].mean())) if ok.any() else (np.nan, np.nan)


def build_rows():
    ref.fetch_wheel()
    j = ref.load_atlantic()
    j = j[(j.time >= "2017-01-01") & (j.time < "2022-01-01")].copy()
    j["wind"] = j.wind.astype(float)
    land = env.load_land()
    rows = []
    cache = {}
    def day_field(year, k):
        key = (year, k)
        if key not in cache:
            ds = cache.setdefault(("ds", year), xr.open_dataset(os.path.join(RAW, f"era5_steer_daily_{year}.nc")))
            sl = ds.isel(time=k)
            cache.clear() if len(cache) > 40 else None
            cache[("ds", year)] = ds
            cache[key] = {f"{c}_{l}": sl[f"{c}_{l}"].values for l in LAYERS for c in ("u", "v")}
        return cache[key]
    for tid, g in j.groupby("track_id", sort=False):
        g = g.sort_values("time").reset_index(drop=True)
        for i in range(len(g) - 1):
            a, b = g.iloc[i], g.iloc[i + 1]
            if (b.time - a.time) != pd.Timedelta(hours=6) or a.status not in TC or b.status not in (TC | {"EX", "LO"}):
                continue
            if not (np.isfinite(a.wind) and np.isfinite(b.wind)):
                continue
            lat0, lat1 = a.lat, b.lat
            latm = (lat0 + lat1) / 2; lonm = a.lon + (((b.lon - a.lon + 180) % 360) - 180) / 2
            dx = ((((b.lon - a.lon) + 180) % 360) - 180) * 111.2 * np.cos(np.radians(latm)); dy = (lat1 - lat0) * 111.2
            u_obs = dx / 6.0 / 1.852; v_obs = dy / 6.0 / 1.852
            ts = pd.Timestamp(a.time)
            k = int((ts.normalize() - pd.Timestamp(f"{ts.year}-01-01")).days)
            f = day_field(ts.year, k)
            la = np.arange(-90, 90.1, 1.5); lo = np.arange(0, 360, 1.5)
            rec = dict(track_id=tid, time=a.time, lat=latm, lon=lonm, wind=a.wind, wind2=b.wind, status=a.status, u_obs=u_obs, v_obs=v_obs,
                       lf=env.land_fraction(land, latm, lonm))
            for l in LAYERS:
                u, v = annulus_vec(f[f"u_{l}"], f[f"v_{l}"], latm, lonm, la, lo)
                rec[f"u_{l}"] = u; rec[f"v_{l}"] = v
            rows.append(rec)
    df = pd.DataFrame(rows)
    df = df[np.isfinite(df[[f"{c}_{l}" for l in LAYERS for c in "uv"]]).all(axis=1)].reset_index(drop=True)
    return df


def fit(df, cols=LAYERS):
    """shared weights for the layers in `cols`, free offsets: least squares on the stacked u and v equations"""
    n = len(df)
    X = np.zeros((2 * n, len(cols) + 2)); y = np.zeros(2 * n)
    for k, l in enumerate(cols):
        X[:n, k] = df[f"u_{l}"].values; X[n:, k] = df[f"v_{l}"].values
    X[:n, -2] = 1.0; X[n:, -1] = 1.0
    y[:n] = df.u_obs.values; y[n:] = df.v_obs.values
    coef, *_ = np.linalg.lstsq(X, y, rcond=None)
    res = y - X @ coef
    return coef, res


def r(x, n=3):
    return None if x is None or not np.isfinite(x) else round(float(x), n)


def summarize(df, name):
    out = dict(name=name, n=int(len(df)))
    if len(df) < 25:
        return out
    coef, res = fit(df)
    n = len(df)
    out.update(w=dict(zip(LAYERS, [r(c) for c in coef[:3]])), w_sum=r(coef[:3].sum()), offset_u=r(coef[3], 2), offset_v=r(coef[4], 2), rms=r(np.sqrt(np.mean(res ** 2)), 2))
    # one layer at a time (weights free, offsets free) and no steering at all: what each explains
    zero = np.concatenate([df.u_obs.values - df.u_obs.mean(), df.v_obs.values - df.v_obs.mean()])
    out["rms_null"] = r(np.sqrt(np.mean(zero ** 2)), 2)
    for l in LAYERS:
        c1, r1 = fit(df, (l,)); out[f"rms_only_{l}"] = r(np.sqrt(np.mean(r1 ** 2)), 2); out[f"w_only_{l}"] = r(c1[0])
    out["resid_u_sd"] = r(res[:n].std(), 2); out["resid_v_sd"] = r(res[n:].std(), 2)
    out["mean_obs_speed"] = r(np.hypot(df.u_obs, df.v_obs).mean(), 2)
    return out


def residual_persistence(df):
    """lag-1 autocorrelation (6 h) of the residual along tracks, from the overall fit (for the wobble's correlation time)"""
    coef, res = fit(df)
    n = len(df); df = df.copy(); df["ru"] = res[:n]; df["rv"] = res[n:]
    num = den = 0.0
    for tid, g in df.groupby("track_id"):
        g = g.sort_values("time")
        ok = (g.time.diff().shift(-1) == pd.Timedelta(hours=6)).values[:-1]
        for c in ("ru", "rv"):
            a = g[c].values[:-1][ok]; b = g[c].values[1:][ok]
            num += float((a * b).sum()); den += float((a * a).sum())
    return r(num / den) if den > 0 else None


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "data", "generated", "atlantic-tc-motion.json")
    df = build_rows()
    df.to_csv(os.path.join(RAW, "atlantic-tc-motion-rows.csv"), index=False)
    ow = df[df.lf <= 0.2]
    classes = [("TD 25-34", ow.wind < 34), ("TS 35-49", (ow.wind >= 35) & (ow.wind < 50)), ("TS 50-64", (ow.wind >= 50) & (ow.wind < 64)), ("C1 65-83", (ow.wind >= 64) & (ow.wind < 84)),
               ("C2 85-99", (ow.wind >= 84) & (ow.wind < 100)), ("C3+ 100+", ow.wind >= 100)]
    bands = [("lat<20", ow.lat < 20), ("lat 20-30", (ow.lat >= 20) & (ow.lat < 30)), ("lat>=30", ow.lat >= 30)]
    res = dict(meta=dict(rows=int(len(df)), over_water=int(len(ow)), years=[2017, 2021], annulus_km=list(ANN)),
               by_intensity=[summarize(ow[m], n) for n, m in classes],
               by_latitude=[summarize(ow[m], n) for n, m in bands],
               by_both=[summarize(ow[m1 & m2], f"{n1} / {n2}") for n1, m1 in (("weak <64", ow.wind < 64), ("hurricane >=64", ow.wind >= 64)) for n2, m2 in bands],
               all=summarize(ow, "all"), resid_lag1=residual_persistence(ow))
    with open(out_path, "w") as fh:
        json.dump(res, fh, separators=(",", ":"))
    print(f"wrote {out_path}; rows {len(df)}, over water {len(ow)}")
    for k in ("by_intensity", "by_latitude", "by_both"):
        print("\n" + k)
        for s in res[k]:
            if s.get("w"):
                print(f"  {s['name']:26s} n={s['n']:4d} w(shallow, medium, deep)=({s['w']['shallow']:+.2f}, {s['w']['medium']:+.2f}, {s['w']['deep']:+.2f}) sum {s['w_sum']:+.2f}  offset ({s['offset_u']:+.1f}, {s['offset_v']:+.1f}) kt  rms {s['rms']} (null {s['rms_null']}; only shallow {s['rms_only_shallow']}, medium {s['rms_only_medium']}, deep {s['rms_only_deep']})")
            else:
                print(f"  {s['name']:26s} n={s['n']:4d}")
    a = res["all"]
    print(f"\nall: w {a['w']} sum {a['w_sum']} offsets ({a['offset_u']}, {a['offset_v']}) rms {a['rms']} null {a['rms_null']}; residual sd u {a['resid_u_sd']} v {a['resid_v_sd']}; residual lag-6h autocorrelation {res['resid_lag1']}")


if __name__ == "__main__":
    main()
