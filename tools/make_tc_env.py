#!/usr/bin/env python3
"""The environment real Atlantic tropical cyclones lived in (2017-2021): the data the storm engine's gates are checked against.

For every six-hourly best-track row of a tropical or subtropical cyclone (the IBTrACS tables of the PyPI wheel `huracanpy`, the same
source and pin as tools/make_tc_ref.py) this samples the environment the simulator itself models, from the files already in data/raw/:
  sst      ERSST v5 monthly (2 deg), bilinear in space, linear in time between month middles (the simulator's own SST base)
  rh0      ERA5 700 hPa relative humidity, daily mean at the row's date, bilinear at the centre (2 deg); rh2 the same two days EARLIER at the
           same place (the storm was still hundreds of km upwind); rhA the annulus 200-800 km from the centre (the storm's moist core is out)
  sh0      ERA5 200-850 hPa vector shear (kt) of the daily-mean winds, bilinear at the centre; sh2 the same two days earlier
  shM, rhM the monthly-mean fields (2007-2021 files) at the row's month
What this does NOT give is storm-free shear at the storm: a daily-mean 200-850 hPa difference of u and v at a 2-degree point inside a
cyclone contains the cyclone's own vertical differential rotation (850 hPa cyclonic against 200 hPa anticyclonic), so sh0 grows with
intensity (it is about twice a SHIPS-style environment shear) and an annulus mean of the magnitude is worse still. That is why the
lag-2-day samples (before the vortex arrived) and the monthly means are kept, and why the simulator's fields -- which have no vortex --
are compared with those, or with the genesis rows (a 25-kt depression hardly contaminates anything), never with sh0 of a hurricane.
Rows within a fifth of their neighbourhood of land (the engine's own five-point test on the page's 0.25 deg land mask) are marked and left
out of the tendency tables.

Written: data/generated/atlantic-tc-env.json (binned statistics only) and data/raw/atlantic-tc-env-rows.csv (the per-row table, git-ignored).
24-h tendency = wind 24 h later minus wind now (kt, best-track 5-kt steps).
usage: make_tc_env.py [out.json]"""
import base64, json, os, sys
import numpy as np
import pandas as pd
import xarray as xr

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import make_tc_ref as ref  # noqa: E402

RAW = os.path.join(ROOT, "data", "raw")
Y0, Y1 = 2017, 2021
TC = ref.TC
ANN = (200.0, 800.0)          # km, SHIPS-style environment annulus
VCLS = [("TD", 25, 34), ("TS", 34, 64), ("C1", 64, 83), ("C2", 83, 96), ("C3+", 96, 999)]
R_EARTH = 6371.0


# ---- fields ----------------------------------------------------------------------------------------------------------------
def load_fields():
    rh = xr.open_dataset(os.path.join(RAW, "era5_rh700_global_daily_2017-2021_allmonths.nc"))["rh700"]
    sh = xr.open_dataset(os.path.join(RAW, "era5_shear_global_daily_2017-2021_allmonths.nc"))["shear"]
    assert (rh.time.values == sh.time.values).all()
    lat, lon = rh.lat.values, rh.lon.values
    assert lat[0] == -88 and lat[-1] == 88 and lon[0] == -180 and lon[-1] == 178
    sst = xr.open_dataset(os.path.join(RAW, "ersstv5.nc"))["sst"]
    sst = sst.assign_coords(lon=(((sst.lon + 180) % 360) - 180)).sortby("lon").sortby("lat")   # ERSST's latitudes run 88 .. -88
    assert float(sst.lat[0]) == -88 and float(sst.lon[0]) == -180
    rhm = xr.open_dataset(os.path.join(RAW, "era5_rh700_global_monthly_2007-2021.nc"))["rh700"]
    shm = xr.open_dataset(os.path.join(RAW, "era5_shear_global_monthly_2007-2021.nc"))["shear"]
    assert float(rhm.lat[0]) == -88 and float(rhm.lon[0]) == -180
    return rh.values.astype(np.float32), sh.values.astype(np.float32), rh.time.values, sst, rhm, shm


def _idx(lat, lon, step=2.0, la0=-88.0, lo0=-180.0, ny=89, nx=180):
    fy = (lat - la0) / step; fx = (((lon - lo0) % 360.0) / step)
    j0 = int(np.clip(np.floor(fy), 0, ny - 2)); i0 = int(np.floor(fx)) % nx
    return j0, (i0 + 1) % nx, i0, fy - j0, fx - np.floor(fx)


def bilin(a2, lat, lon):
    """bilinear value of a (89, 180) array (lat -88..88, lon -180..178, periodic in lon); NaN corners are dropped and the weights renormalised"""
    j0, i1, i0, ty, tx = _idx(lat, lon)
    w = np.array([(1 - ty) * (1 - tx), (1 - ty) * tx, ty * (1 - tx), ty * tx])
    v = np.array([a2[j0, i0], a2[j0, i1], a2[j0 + 1, i0], a2[j0 + 1, i1]], float)
    ok = np.isfinite(v)
    return float((w[ok] * v[ok]).sum() / w[ok].sum()) if ok.any() and w[ok].sum() > 0 else np.nan


def annulus_mean(a2, lat, lon, r0=ANN[0], r1=ANN[1]):
    la = np.arange(-88, 90, 2.0); lo = np.arange(-180, 180, 2.0)
    dlat = r1 / 111.2 + 1.0
    j_lo = max(0, int(np.floor((lat - dlat + 88) / 2))); j_hi = min(88, int(np.ceil((lat + dlat + 88) / 2)))
    cosl = max(0.15, np.cos(np.radians(min(abs(lat) + dlat, 85.0))))
    dlon = min(180.0, (r1 / 111.2) / cosl + 2.0)
    n_lo = int(np.ceil(dlon / 2))
    i0 = int(np.floor(((lon + 180) % 360) / 2))
    ii = np.arange(i0 - n_lo, i0 + n_lo + 1) % 180
    sub = a2[j_lo:j_hi + 1][:, ii]
    LA, LO = np.meshgrid(la[j_lo:j_hi + 1], lo[ii], indexing="ij")
    p1, p2 = np.radians(lat), np.radians(LA)
    dl = np.radians(((LO - lon + 180) % 360) - 180)
    h = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    d = 2 * R_EARTH * np.arcsin(np.sqrt(h))
    m = (d >= r0) & (d <= r1) & np.isfinite(sub)
    return float(sub[m].mean()) if m.any() else np.nan


def sst_at(sst, time, lat, lon):
    t = pd.Timestamp(time)
    mid = lambda ts: pd.Timestamp(ts.year, ts.month, 1) + pd.Timedelta(days=(pd.Timestamp(ts.year + (ts.month == 12), ts.month % 12 + 1, 1) - pd.Timestamp(ts.year, ts.month, 1)).days / 2)
    m0 = pd.Timestamp(t.year, t.month, 1)
    if t < mid(t): m0 = m0 - pd.DateOffset(months=1)
    m1 = m0 + pd.DateOffset(months=1)
    t0, t1 = mid(m0), mid(m1)
    f = float((t - t0) / (t1 - t0))
    vals = []
    for m in (m0, m1):
        a = sst.sel(time=np.datetime64(m.strftime("%Y-%m-01")), method="nearest").values
        vals.append(bilin(a.astype(float), lat, lon))
    if not np.isfinite(vals).all():
        return np.nan
    return (1 - f) * vals[0] + f * vals[1]


# ---- the page's land mask ---------------------------------------------------------------------------------------------------
def load_land():
    d = json.load(open(os.path.join(ROOT, "data", "generated", "data.json")))
    nx, ny = 601, 449
    mb = np.frombuffer(base64.b64decode(d["mask"]), dtype=np.uint8)
    bits = np.unpackbits(mb)[: nx * ny].reshape(ny, nx)
    return bits


def land_fraction(land, lat, lon, d=0.3):
    def is_land(la, lo):
        i = int(round((lo - (-110.0)) / 0.25)); j = int(round((72.0 - la) / 0.25))
        if i < 0 or j < 0 or i >= 601 or j >= 449:
            return 0
        return int(land[j, i])
    k = d / max(0.3, np.cos(np.radians(lat)))
    n = is_land(lat, lon) + is_land(lat + d, lon) + is_land(lat - d, lon) + is_land(lat, lon + k) + is_land(lat, lon - k)
    return n / 5.0


# ---- the table ---------------------------------------------------------------------------------------------------------------
def build_rows():
    ref.fetch_wheel()
    j = ref.load_atlantic()
    j = j[(j.time >= f"{Y0}-01-01") & (j.time < f"{Y1 + 1}-01-01")].copy()
    j["wind"] = j.wind.astype(float)
    rh, sh, times, sst, rhm, shm = load_fields()
    rhm_v = rhm.values.astype(np.float32); shm_v = shm.values.astype(np.float32)
    m0 = pd.Timestamp(rhm.time.values[0])
    mon_idx = lambda t: (t.year - m0.year) * 12 + (t.month - m0.month)
    day0 = pd.Timestamp(times[0])
    land = load_land()
    rows = []
    for tid, g in j.groupby("track_id", sort=False):
        g = g.sort_values("time")
        wmap = dict(zip(g.time, g.wind)); smap = dict(zip(g.time, g.status))
        lat_map = dict(zip(g.time, g.lat)); lon_map = dict(zip(g.time, g.lon))
        first_tc = None
        for _, q in g.iterrows():
            if q.status not in TC or not np.isfinite(q.wind):
                continue
            if first_tc is None:
                first_tc = q.time
            k = int((pd.Timestamp(q.time).normalize() - day0).days)
            if k < 0 or k >= rh.shape[0]:
                continue
            t24 = q.time + pd.Timedelta(hours=24)
            v24 = wmap.get(t24, np.nan); st24 = smap.get(t24, "")
            lf0 = land_fraction(land, q.lat, q.lon)
            lf24 = land_fraction(land, lat_map[t24], lon_map[t24]) if t24 in lat_map else np.nan
            mi = mon_idx(pd.Timestamp(q.time)); k2 = max(0, k - 2)
            rows.append(dict(
                track_id=tid, season=int(q.season), time=q.time, lat=q.lat, lon=q.lon, status=q.status, wind=q.wind,
                age_h=float((pd.Timestamp(q.time) - pd.Timestamp(first_tc)) / pd.Timedelta(hours=1)),
                v24=v24, st24=st24, lf0=lf0, lf24=lf24,
                sst=sst_at(sst, q.time, q.lat, q.lon),
                rh0=bilin(rh[k], q.lat, q.lon), rh2=bilin(rh[k2], q.lat, q.lon), rhA=annulus_mean(rh[k], q.lat, q.lon),
                sh0=bilin(sh[k], q.lat, q.lon), sh2=bilin(sh[k2], q.lat, q.lon),
                rhM=bilin(rhm_v[mi], q.lat, q.lon) if 0 <= mi < rhm_v.shape[0] else np.nan,
                shM=bilin(shm_v[mi], q.lat, q.lon) if 0 <= mi < shm_v.shape[0] else np.nan))
    df = pd.DataFrame(rows)
    df["dv24"] = df.v24 - df.wind
    df["over_water"] = (df.lf0 <= 0.2) & (df.lf24 <= 0.2)
    return df


# ---- statistics --------------------------------------------------------------------------------------------------------------
def r(x, n=2):
    return None if x is None or (isinstance(x, float) and not np.isfinite(x)) else round(float(x), n)


def stats(a):
    a = np.asarray(a, float); a = a[np.isfinite(a)]
    if not len(a):
        return dict(n=0)
    return dict(n=int(len(a)), mean=r(a.mean()), p10=r(np.percentile(a, 10)), p50=r(np.percentile(a, 50)), p90=r(np.percentile(a, 90)))


def vclass(w):
    for name, lo, hi in VCLS:
        if lo <= w < hi:
            return name
    return None


def env_by_class(df):
    out = {}
    for name, lo, hi in VCLS:
        s = df[(df.wind >= lo) & (df.wind < hi) & (df.lf0 <= 0.2)]
        out[name] = {k: stats(s[k]) for k in ("sst", "sh0", "sh2", "shM", "rh0", "rh2", "rhA", "rhM", "lat")}
        out[name]["n"] = int(len(s))
    return out


def env_at_points(df):
    """at the first depression row, the first named row and the row of peak wind (one per track)"""
    first, named, peak = [], [], []
    for tid, g in df.groupby("track_id", sort=False):
        g = g.sort_values("time")
        first.append(g.iloc[0])
        gn = g[g.status.isin(["TS", "SS", "HU"])]
        if len(gn):
            named.append(gn.iloc[0])
        peak.append(g.loc[g.wind.idxmax()])
    f = lambda rs: {k: stats([x[k] for x in rs]) for k in ("sst", "sh0", "sh2", "shM", "rh0", "rh2", "rhA", "rhM", "lat", "wind")}
    return dict(first_row=f(first), first_named=f(named), peak=f(peak))


def tendency_bins(df, key, edges, label):
    ok = df[df.over_water & np.isfinite(df.dv24) & df.st24.isin(list(TC)) & (df.wind >= 25) & np.isfinite(df[key])]
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        for grp, (v0, v1) in (("weak", (25, 64)), ("strong", (64, 999))):
            s = ok[(ok[key] >= lo) & (ok[key] < hi) & (ok.wind >= v0) & (ok.wind < v1)]
            out.append(dict(var=label, lo=lo, hi=hi, group=grp, n=int(len(s)), mean_dv24=r(s.dv24.mean()) if len(s) else None,
                            ri=r((s.dv24 >= 30).mean(), 3) if len(s) else None, wk=r((s.dv24 <= -10).mean(), 3) if len(s) else None))
    return out


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "data", "generated", "atlantic-tc-env.json")
    df = build_rows()
    csv = os.path.join(RAW, "atlantic-tc-env-rows.csv")
    df.to_csv(csv, index=False)
    inf = dict(rows=int(len(df)), tracks=int(df.track_id.nunique()), years=[Y0, Y1], annulus_km=list(ANN),
               rows_over_water=int((df.lf0 <= 0.2).sum()), rows_with_tendency=int((df.over_water & np.isfinite(df.dv24) & df.st24.isin(list(TC))).sum()))
    res = dict(
        meta=inf,
        by_class=env_by_class(df),
        at=env_at_points(df),
        tendency=tendency_bins(df, "sh2", [0, 8, 14, 20, 30, 80], "sh2")
        + tendency_bins(df, "shM", [0, 8, 12, 16, 20, 80], "shM")
        + tendency_bins(df, "rhA", [0, 45, 52, 58, 64, 101], "rhA")
        + tendency_bins(df, "rh2", [0, 45, 52, 58, 64, 101], "rh2")
        + tendency_bins(df, "sst", [-5, 26, 27, 28, 29, 40], "sst"),
    )
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as fh:
        json.dump(res, fh, separators=(",", ":"))
    print(f"wrote {out_path} ({os.path.getsize(out_path) / 1024:.0f} KB) and {csv} ({len(df)} rows, {df.track_id.nunique()} tracks)")
    print(json.dumps(inf))
    for k, v in res["by_class"].items():
        g = lambda f: f"{v[f].get('p50')} ({v[f].get('p10')}..{v[f].get('p90')})"
        print(f"{k:4s} n={v['n']:4d}  sst {g('sst')}  sh0 {g('sh0')}  sh2 {g('sh2')}  shM {g('shM')}  rh0 {g('rh0')}  rh2 {g('rh2')}  rhA {g('rhA')}  rhM {g('rhM')}  lat {g('lat')}")
    for k, v in res["at"].items():
        g = lambda f: f"{v[f].get('p50')} ({v[f].get('p10')}..{v[f].get('p90')})"
        print(f"{k:12s} n={v['sst']['n']:3d}  sst {g('sst')}  sh0 {g('sh0')}  sh2 {g('sh2')}  shM {g('shM')}  rh0 {g('rh0')}  rh2 {g('rh2')}  rhM {g('rhM')}  lat {g('lat')}  wind {g('wind')}")


if __name__ == "__main__":
    main()
