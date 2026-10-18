#!/usr/bin/env python3
"""The real Atlantic maps the storm engine is anchored to: where and when tropical and subtropical cyclones form, how they drift, where they go.

Source and conventions: the IBTrACS tables of tools/make_tc_ref.py (1980-2024, 00/06/12/18 UTC, HURDAT2-style status codes).
  genesis   the first synoptic row of a track with a tropical or subtropical depression/storm status (TD SD TS SS HU); class T when it is
            TD/TS/HU, class S when it is SD/SS. 1991-2024 (34 seasons, the depression stage is complete from the early 1990s).
  drift     every pair of consecutive six-hourly rows, both over water (land fraction <= 0.2 of the page's own land mask), the second still a
            cyclone (status TD..HU, EX, LO); the translation in kt (+east, +north) at the mid point; classes: weak (tropical, < 64 kt),
            strong (hurricane, >= 64 kt), sub (SD/SS), ex (EX/LO). 1980-2024.
  landfall  a named storm's change from water (land fraction < 0.5) to land (>= 0.5); counted per year in the regions of REGIONS, 1991-2020.
  density   named-storm six-hourly rows per 5 x 5 degree cell per season, 1991-2020 (a map to look at, not a target of the engine).
All maps are on one grid of 5-degree nodes (lon -105..-5, lat 5..65) and smoothed by Gaussian kernels in space (genesis 3 deg, drift 4 deg, as local-linear means: see drift_maps)
and time (genesis 15 days, drift 20 days) so that the few hundred events a map is made of give a smooth field: a genesis event spreads one
unit of weight over the nodes and over the months, so the maps still add up to the real counts per year.
Written: data/generated/atlantic-tc-maps.json   usage: make_tc_maps.py [out.json]"""
import json, os, sys
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import make_tc_ref as ref  # noqa: E402
import make_tc_env as env  # noqa: E402

LON0, LON1, LAT0, LAT1, RES = -105.0, -5.0, 5.0, 65.0, 5.0
NX = int(round((LON1 - LON0) / RES)) + 1
NY = int(round((LAT1 - LAT0) / RES)) + 1
LONS = LON0 + RES * np.arange(NX)
LATS = LAT0 + RES * np.arange(NY)
MDAYS = np.array([31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])
MSTART = np.concatenate([[0], np.cumsum(MDAYS)])[:-1]
CLASSES = ["weak", "strong", "sub", "ex"]
# regions of first landfall (a box on the position of the first row over land)
REGIONS = {
    "US East coast": (30.5, 46.0, -82.5, -62.0), "Florida": (24.0, 30.5, -83.5, -79.0), "US Gulf coast": (25.0, 31.6, -98.5, -83.5),
    "Mexico": (14.5, 26.0, -98.5, -86.0), "Central America": (7.5, 17.5, -92.0, -77.0), "Greater Antilles and Bahamas": (17.0, 28.0, -86.0, -65.0),
    "Lesser Antilles": (10.0, 19.0, -66.0, -58.0), "South America": (4.0, 13.0, -75.0, -50.0), "Canada": (43.5, 53.0, -68.0, -52.0),
}


def month_weights(doy, sigma):
    """the share of an event on day-of-year `doy` that falls in each month, spread by a circular Gaussian of `sigma` days"""
    t = np.arange(0, 365)
    w = np.exp(-0.5 * (((t - doy + 182.5) % 365 - 182.5) / sigma) ** 2)
    out = np.array([w[int(a): int(a + d)].sum() for a, d in zip(MSTART, MDAYS)])
    return out / out.sum()


def node_weights(lat, lon, sigma):
    d2 = ((LATS[:, None] - lat) ** 2 + ((LONS[None, :] - lon) * np.cos(np.radians(lat))) ** 2)
    w = np.exp(-0.5 * d2 / sigma ** 2)
    return w / w.sum()


def genesis_events(j, y0=1991, y1=2024):
    rows = []
    for tid, g in j.groupby("track_id", sort=False):
        g = g.sort_values("time")
        tc = g[g.status.isin(ref.TC)]
        if tc.empty or not (y0 <= tc.iloc[0].time.year <= y1):
            continue
        r0 = tc.iloc[0]
        rows.append(dict(track_id=tid, lat=float(r0.lat), lon=float(r0.lon), doy=int(r0.doy), year=int(r0.time.year), cls="S" if r0.status in ("SD", "SS") else "T", named=bool(g.status.isin(ref.NAMED).any())))
    return pd.DataFrame(rows)


def genesis_maps(ev, years, sigma_s=3.0, sigma_t=15.0):
    out = {}
    for cls in ("T", "S"):
        M = np.zeros((12, NY, NX))
        for r in ev[ev.cls == cls].itertuples():
            M += month_weights(r.doy, sigma_t)[:, None, None] * node_weights(r.lat, r.lon, sigma_s)[None]
        out[cls] = M / years
    return out


def drift_rows(j, land):
    rows = []
    for tid, g in j.groupby("track_id", sort=False):
        g = g.sort_values("time").reset_index(drop=True)
        for i in range(len(g) - 1):
            a, b = g.iloc[i], g.iloc[i + 1]
            if (b.time - a.time) != pd.Timedelta(hours=6) or a.status not in ref.TC | {"EX", "LO"} or b.status not in ref.TC | {"EX", "LO"}:
                continue
            latm = (a.lat + b.lat) / 2; lonm = a.lon + (((b.lon - a.lon + 180) % 360) - 180) / 2
            if env.land_fraction(land, a.lat, a.lon) > 0.2 or env.land_fraction(land, b.lat, b.lon) > 0.2:
                continue
            u = (((b.lon - a.lon) + 180) % 360 - 180) * 111.2 * np.cos(np.radians(latm)) / 6.0 / 1.852
            v = (b.lat - a.lat) * 111.2 / 6.0 / 1.852
            w = a.wind if np.isfinite(a.wind) else 30.0
            cls = "sub" if a.status in ("SD", "SS") else "ex" if a.status in ("EX", "LO") else "strong" if (a.status == "HU" and w >= 64) else "weak"
            rows.append((cls, a.time.dayofyear - 1, latm, lonm, u, v, w))
    return pd.DataFrame(rows, columns=["cls", "doy", "lat", "lon", "u", "v", "wind"])


def drift_maps(dr, sigma_s=4.0, sigma_t=20.0, n0=2.0, ridge=3.0):
    """Gaussian-weighted LOCAL-LINEAR means: at every node and month the weighted least-squares plane through the rows (weights: a Gaussian of the distance, sigma_s degrees,
    and of the day of the year, sigma_t days), evaluated at the node, with a ridge that shrinks the slopes toward zero where the rows are few (ridge rows' worth at one
    sigma). A weighted MEAN is biased wherever the field has a gradient and the rows are not spread evenly round the node, which at the poleward edge, where the westerlies
    speed a storm up by 3 kt a degree and the rows are few, made the maps 3-6 kt too slow north of 40N (tools/make_tc_validate.py, the check of the maps against their own rows).
    Where a node has hardly any rows it falls back, with weight n0, on the same class in a latitude band of +-10 degrees."""
    res = {}
    for cls in CLASSES:
        d = dr[dr.cls == cls]
        lat, lon, doy, u, v = (d[c].values for c in ("lat", "lon", "doy", "u", "v"))
        U = np.zeros((12, NY, NX)); V = np.zeros_like(U); N = np.zeros_like(U)
        mid = MSTART + MDAYS / 2.0
        lam = ridge * sigma_s ** 2
        for m in range(12):
            dt = np.abs(((doy - mid[m] + 182.5) % 365) - 182.5)
            wt = np.exp(-0.5 * (dt / sigma_t) ** 2)
            for k, la in enumerate(LATS):
                band = wt * (np.abs(lat - la) <= 10) * (dt <= 40)
                nb = band.sum()
                pu = (band * u).sum() / nb if nb > 3 else 0.0; pv = (band * v).sum() / nb if nb > 3 else 0.0
                for i, lo in enumerate(LONS):
                    x = lat - la; y = (lon - lo) * np.cos(np.radians(la))
                    w = wt * np.exp(-0.5 * (x ** 2 + y ** 2) / sigma_s ** 2)
                    n = w.sum()
                    if n < 1e-9:
                        U[m, k, i] = pu; V[m, k, i] = pv; continue
                    A = np.array([[n, (w * x).sum(), (w * y).sum()], [(w * x).sum(), (w * x * x).sum() + lam, (w * x * y).sum()], [(w * y).sum(), (w * x * y).sum(), (w * y * y).sum() + lam]])
                    a_u = np.linalg.solve(A, np.array([(w * u).sum(), (w * x * u).sum(), (w * y * u).sum()]))[0]
                    a_v = np.linalg.solve(A, np.array([(w * v).sum(), (w * x * v).sum(), (w * y * v).sum()]))[0]
                    U[m, k, i] = (n * a_u + n0 * pu) / (n + n0); V[m, k, i] = (n * a_v + n0 * pv) / (n + n0); N[m, k, i] = n
        res[cls] = (U, V, N)
    return res


def landfalls(j, land, y0=1991, y1=2020):
    out = {k: [] for k in REGIONS}
    for tid, g in j.groupby("track_id", sort=False):
        g = g.sort_values("time").reset_index(drop=True)
        if not (y0 <= g.time.iloc[0].year <= y1) or not g.status.isin(ref.NAMED).any():
            continue
        was_water = None
        for i in range(len(g)):
            r = g.iloc[i]; lf = env.land_fraction(land, r.lat, r.lon)
            if was_water is not None and was_water and lf >= 0.5 and g.iloc[i - 1].status in ref.NAMED | {"TD", "SD"}:
                w0 = g.iloc[i - 1].wind if np.isfinite(g.iloc[i - 1].wind) else 0
                for k, (a, b, c, d) in REGIONS.items():
                    if a <= r.lat <= b and c <= r.lon <= d:
                        out[k].append((int(g.iloc[i - 1].time.year), float(w0)))
                        break
            was_water = lf < 0.5
    return out


def density(j, y0=1991, y1=2020):
    n = j[(j.time.dt.year >= y0) & (j.time.dt.year <= y1) & j.status.isin(ref.NAMED)]
    H, _, _ = np.histogram2d(n.lat.values, n.lon.values, bins=[np.arange(LAT0 - RES / 2, LAT1 + RES, RES), np.arange(LON0 - RES / 2, LON1 + RES, RES)])
    return H / (y1 - y0 + 1)


def r(a, n=3):
    return np.round(np.asarray(a, dtype=float), n).tolist()


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "data", "generated", "atlantic-tc-maps.json")
    ref.fetch_wheel(); j = ref.load_atlantic(); land = env.load_land()
    ev = genesis_events(j); years = 2024 - 1991 + 1
    gm = genesis_maps(ev, years)
    dr = drift_rows(j, land); dm = drift_maps(dr)
    lf = landfalls(j, land); dens = density(j)
    n30 = 30.0
    out = dict(
        meta=dict(source="IBTrACS (huracanpy 1.5.0 tables), see tools/make_tc_ref.py", genesis_years=[1991, 2024], drift_years=[1980, 2024], landfall_years=[1991, 2020], smoothing=dict(genesis_deg=3.0, genesis_days=15, drift_deg=4.0, drift_days=20, drift_prior_rows=2, drift_estimator="local-linear, ridge 3")),
        grid=dict(lon0=LON0, lat0=LAT0, res=RES, nx=NX, ny=NY),
        genesis=dict(events=int(len(ev)), events_T=int((ev.cls == "T").sum()), events_S=int((ev.cls == "S").sum()), per_year=round(len(ev) / years, 2), T=[r(m, 4) for m in gm["T"]], S=[r(m, 4) for m in gm["S"]],
                     by_month_T=r(gm["T"].sum(axis=(1, 2)), 3), by_month_S=r(gm["S"].sum(axis=(1, 2)), 3)),
        drift={cls: dict(u=[r(m, 2) for m in dm[cls][0]], v=[r(m, 2) for m in dm[cls][1]], n=[r(m, 1) for m in dm[cls][2]], rows=int((dr.cls == cls).sum())) for cls in CLASSES},
        landfall=dict(regions={k: list(v) for k, v in REGIONS.items()}, years=30, per_year={k: round(sum(1 for y, w in v) / n30, 2) for k, v in lf.items()}, hurricane_per_year={k: round(sum(1 for y, w in v if w >= 64) / n30, 2) for k, v in lf.items()}),
        density_named_rows_per_season=r(dens, 2),
    )
    with open(out_path, "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print(f"wrote {out_path}: genesis events {len(ev)} ({out['genesis']['events_T']} tropical, {out['genesis']['events_S']} subtropical; {out['genesis']['per_year']}/yr)")
    print("genesis by month (tropical, per year):", out["genesis"]["by_month_T"])
    print("drift rows:", {c: out["drift"][c]["rows"] for c in CLASSES})
    print("landfalls per year (named storms, 1991-2020):")
    for k in REGIONS:
        print(f"  {k:30s} {out['landfall']['per_year'][k]:5.2f}  (hurricane at landfall {out['landfall']['hurricane_per_year'][k]:4.2f})")


if __name__ == "__main__":
    main()
