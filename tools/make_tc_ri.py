#!/usr/bin/env python3
"""Real Atlantic rapid intensification against sea temperature, from the same best-track copy the other storm references use.

For every six-hourly row of a tropical depression / storm / hurricane over water (ERSST monthly sea temperature at the point is finite, latitude < 40) whose own
row 24 hours later is also a tropical row, the change of the 1-minute wind over those 24 hours. Output (data/generated/atlantic-tc-ri.json): the share of such
windows that gain at least 30 / 50 / 65 / 80 kt, overall and by sea temperature (<27, 27-28, 28-29, 29+) and starting wind (<45, 45-65, 65-95, 95+), the
quantiles of the gain by sea temperature for storms of 45-115 kt, and the strongest windows (the fastest intensifications on record). The engine's rapid
intensification is checked against these (tools/storm_ri.mjs).

Sources: IBTrACS rows of the PyPI wheel `huracanpy` (tools/make_tc_ref.py), NOAA ERSST v5 (data/raw/ersstv5.nc, 1970-2021: the rows of 1980-2021 are used).
"""
import json, os, sys
import numpy as np, pandas as pd, xarray as xr
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_tc_ref as M

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SB = [0, 27, 28, 29, 40]; VB = [0, 45, 65, 95, 200]; THS = [30, 50, 65, 80]
r3 = lambda x: None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), 4)

def main():
    j = M.load_atlantic()
    j = j[j.season <= 2021].copy()
    sst = xr.open_dataset(os.path.join(ROOT, "data", "raw", "ersstv5.nc"))["sst"].squeeze()
    times = pd.to_datetime(sst.time.values).to_period("M").to_timestamp(); tidx = {t: i for i, t in enumerate(times)}
    arr, la, lo = sst.values, sst["lat"].values, sst["lon"].values
    ym = pd.to_datetime(j.time.values).to_period("M").to_timestamp()
    lon = np.where(j.lon.values < 0, j.lon.values + 360, j.lon.values)
    vals = np.full(len(j), np.nan)
    for k in range(len(j)):
        ti = tidx.get(ym[k])
        if ti is not None:
            vals[k] = arr[ti, np.abs(la - j.lat.values[k]).argmin(), np.abs(lo - lon[k]).argmin()]
    j["sst"] = vals
    j = j.sort_values(["track_id", "time"]).reset_index(drop=True)
    g = j.groupby("track_id")
    j["w24"] = g.wind.shift(-4); j["t24"] = g.time.shift(-4); j["s24"] = g.status.shift(-4)
    ok = ((j.t24 - j.time) == pd.Timedelta(hours=24)) & j.status.isin(["TD", "TS", "HU"]) & j.s24.isin(["TD", "TS", "HU"])
    j["dv24"] = np.where(ok, j.w24 - j.wind, np.nan)
    tc = j[np.isfinite(j.dv24) & np.isfinite(j.sst) & np.isfinite(j.wind) & (j.lat < 40)].copy()
    tc["sb"] = pd.cut(tc.sst, SB, right=False, labels=False); tc["vb"] = pd.cut(tc.wind, VB, right=False, labels=False)
    out = {"meta": dict(rows=int(len(tc)), tracks=int(tc.track_id.nunique()), seasons=[int(tc.season.min()), int(tc.season.max())], sst_bins=SB, wind_bins=VB, thresholds=THS,
                        source="IBTrACS rows (huracanpy wheel), ERSST v5 monthly at the point")}
    out["overall"] = {str(th): r3((tc.dv24 >= th).mean()) for th in THS}
    out["by_sst_wind"] = {str(th): {"p": [[r3((tc[(tc.sb == a) & (tc.vb == b)].dv24 >= th).mean()) if ((tc.sb == a) & (tc.vb == b)).sum() else None for b in range(len(VB) - 1)] for a in range(len(SB) - 1)]} for th in THS}
    out["n_sst_wind"] = [[int(((tc.sb == a) & (tc.vb == b)).sum()) for b in range(len(VB) - 1)] for a in range(len(SB) - 1)]
    out["by_sst"] = {str(th): [r3((tc[tc.sb == a].dv24 >= th).mean()) for a in range(len(SB) - 1)] for th in THS}
    m = tc[(tc.wind >= 45) & (tc.wind <= 115)]
    out["gain_quantiles_45_115kt"] = [{"sst": [SB[a], SB[a + 1]], "n": int((m.sb == a).sum()), "p50_p90_p99_max": [r3(m[m.sb == a].dv24.quantile(q)) for q in (.5, .9, .99)] + [r3(m[m.sb == a].dv24.max())]} for a in range(len(SB) - 1)]
    top = tc.sort_values("dv24", ascending=False).head(12)
    out["strongest"] = [dict(season=int(r.season), lat=r3(r.lat), lon=r3(r.lon), wind=r3(r.wind), dv24=r3(r.dv24), sst=r3(r.sst)) for r in top.itertuples()]
    dest = os.path.join(ROOT, "data", "generated", "atlantic-tc-ri.json")
    json.dump(out, open(dest, "w"), indent=1)
    print("wrote", dest, "rows", len(tc), "overall", out["overall"])

if __name__ == "__main__":
    main()
