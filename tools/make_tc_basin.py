#!/usr/bin/env python3
"""Real best-track statistics and maps for the storm engine of any basin page: the targets it is calibrated and tested against, and the climatology it is anchored to.

The same data and the same pin as tools/make_tc_ref.py / tools/make_tc_maps.py (the IBTrACS tables in the PyPI wheel `huracanpy` 1.5.0: `jtwc.csv`, 1-minute winds at 00/06/12/18 UTC, all basins,
1980-2024), with the definitions that work in every basin, where the status codes of the Atlantic (TD TS HU) do not exist (TY, ST, TC, MD, XX ...), so everything is by WIND:
  region      the part of the world the page lets a storm live in (data/generated/<basin>-tc-region.json, tools/storm_region.mjs): a storm of the record belongs to a page when it FORMS inside it,
              over water, and its track is cut where it first leaves (the engine ends a system at the page's edge). Storms that form in a neighbouring basin and enter are not counted: nothing enters a page.
  tropical    a synoptic row whose status is not EX, ET, PT, LO, DB or WV and whose wind is known
  depression  the first tropical row of 25 kt or more (a numbered depression: the engine's genV);  the season of a storm is the season of that row
  named       a track with a tropical row of 34 kt or more;  hurricane-strength (the local word: hurricane, typhoon, cyclone): 64 kt;  major: 96 kt;  category 5: 137 kt
  ACE         the sum over tropical synoptic rows of 34 kt or more of (wind / 100)^2   (10^4 kt^2), charged to the storm's season
  season      the calendar year (NH basins) or July to June named for the year it starts in (SH basins and the Mediterranean): `seasonMonth` of tools/tc_basins.json
  RI          a gain of 30 kt or more in the 24 h after a tropical row of 25 kt or more
The maps are on the node grid of tools/tc_basins.json, smoothed in space and time exactly like the Atlantic's (genesis: Gaussian 3 degrees, 15 days; drift: local-linear, 4 degrees, 20 days, ridge 3)
so that a few hundred events give a smooth field.
Written: data/generated/<basin>-tc-ref.json (targets) and <basin>-tc-maps.json (maps).   usage: make_tc_basin.py <basin> [--allow-sparse]"""
import base64, json, os, sys, zipfile
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import make_tc_ref as ref  # noqa: E402  (the pinned wheel)
import climate_lib as cl   # noqa: E402

NONTROP = {"EX", "ET", "PT", "LO", "DB", "WV"}
SUBTROP = {"SD", "SS"}
CLASSES = ["weak", "strong", "sub", "ex"]
MDAYS = np.array([31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])
MSTART = np.concatenate([[0], np.cumsum(MDAYS)])[:-1]
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
r = ref.r
quantiles = ref.quantiles


def cfg(basin):
    c = json.load(open(os.path.join(HERE, "tc_basins.json")))
    c.pop("_", None)
    if basin not in c:
        raise SystemExit(f"unknown basin {basin}: {', '.join(c)}")
    return c[basin]


# ---- the page's region and land ------------------------------------------------------------------------------------------------
class Region:
    def __init__(self, basin, hemisphere):
        self.sign = 1.0 if hemisphere == "N" else -1.0      # the pages' boxes reach across the equator; only the basin's own half counts
        d = json.load(open(os.path.join(ROOT, "data", "generated", f"{basin}-tc-region.json")))
        self.lon0, self.lat1, self.res, self.nx, self.ny = d["lon0"], d["lat1"], d["res"], d["nx"], d["ny"]
        n = self.nx * self.ny
        unpack = lambda s: np.unpackbits(np.frombuffer(base64.b64decode(s), dtype=np.uint8))[:n].reshape(self.ny, self.nx)
        self.inb, self.land = unpack(d["inb"]), unpack(d["land"])

    def cell(self, lat, lon):
        i = np.rint((np.asarray(lon) - self.lon0) / self.res).astype(int); j = np.rint((self.lat1 - np.asarray(lat)) / self.res).astype(int)
        ok = (i >= 0) & (j >= 0) & (i < self.nx) & (j < self.ny)
        return i.clip(0, self.nx - 1), j.clip(0, self.ny - 1), ok

    def inside(self, lat, lon):
        i, j, ok = self.cell(lat, lon)
        return ok & (self.inb[j, i] == 1) & (self.sign * np.asarray(lat) > 0)

    def water(self, lat, lon):
        i, j, ok = self.cell(lat, lon)
        return ok & (self.inb[j, i] == 1) & (self.land[j, i] == 0) & (self.sign * np.asarray(lat) > 0)


def page_land(basin):
    """the page's own 0.25-degree land mask and its domain (the drift maps use rows over water by the engine's five-point test)"""
    d = json.load(open(os.path.join(ROOT, "data", "generated", "data.json" if basin == "atlantic" else f"{basin}-data.json")))
    dm = d["domain"]
    bits = np.unpackbits(np.frombuffer(base64.b64decode(d["mask"]), dtype=np.uint8))[: dm["nx"] * dm["ny"]].reshape(dm["ny"], dm["nx"])
    return bits, dm


def land_fraction(land, dm, lat, lon, d=0.3):
    def is_land(la, lo):
        i = int(round((lo - dm["lon0"]) / dm["res"])); j = int(round((dm["lat1"] - la) / dm["res"]))
        return int(land[j, i]) if 0 <= i < dm["nx"] and 0 <= j < dm["ny"] else 0
    k = d / max(0.3, np.cos(np.radians(lat)))
    return (is_land(lat, lon) + is_land(lat + d, lon) + is_land(lat - d, lon) + is_land(lat, lon + k) + is_land(lat, lon - k)) / 5.0


# ---- the record ----------------------------------------------------------------------------------------------------------------
def load_rows(frame):
    ref.fetch_wheel()
    z = zipfile.ZipFile(ref.WHEEL_PATH)
    j = pd.read_csv(z.open("huracanpy/_data/_ibtracs_files/jtwc.csv"), parse_dates=["time"], keep_default_na=False, na_values=[""])
    j = j[(j.time.dt.minute == 0) & (j.time.dt.hour % 6 == 0)].copy()
    j["wind"] = j.wind.astype(float)
    j["lon"] = j.lon % 360 if frame == 360 else ((j.lon + 180) % 360) - 180
    j["trop"] = ~j.status.isin(NONTROP) & j.wind.notna()
    return j.sort_values(["track_id", "time"]).reset_index(drop=True)


def season_of(t, month):
    t = pd.Timestamp(t)
    return t.year if t.month - 1 >= month else t.year - 1


def build_tracks(j, region, month, years):
    """the storms of the page: the clipped tracks (rows inside the basin from the genesis row to the first exit)"""
    out, outside, entered = [], 0, 0
    for tid, g in j.groupby("track_id", sort=False):
        lat, lon, w, trop = g.lat.values, g.lon.values, g.wind.values, g.trop.values
        ok = np.where(trop & (w >= 25))[0]
        if not len(ok):
            continue
        gi = ok[0]
        if not region.water(lat[gi], lon[gi]):
            outside += 1
            continue
        ins = region.inside(lat, lon)
        out_idx = np.where(~ins[gi:])[0]
        end = gi + (out_idx[0] if len(out_idx) else len(g))
        sl = slice(gi, end)
        t = g.time.values[sl]; st = g.status.values[sl]
        rec = dict(tid=tid, t=t, lat=lat[sl], lon=lon[sl], w=w[sl], st=st, trop=trop[sl], cut=bool(len(out_idx)), season=season_of(g.time.iloc[gi], month), t0=g.time.iloc[gi], pre=g.iloc[max(0, gi - 8):gi])
        out.append(rec)
    return out, outside


def track_flags(q):
    w, trop = q["w"], q["trop"]
    wt = np.where(trop, w, np.nan)
    q["peak"] = float(np.nanmax(wt))
    named = np.where(trop & (w >= 34))[0]
    q["named"] = len(named) > 0
    q["hu"], q["major"], q["cat5"] = q["peak"] >= 64, q["peak"] >= 96, q["peak"] >= 137
    q["ace"] = float(((w[trop & (w >= 34)] / 100.0) ** 2).sum())
    q["gen_status"] = str(q["st"][named[0]]) if len(named) else ""
    if q["named"]:
        k = named[0]
        q.update(n_i=int(k), n_time=pd.Timestamp(q["t"][k]), n_lat=float(q["lat"][k]), n_lon=float(q["lon"][k]), n_hours=float((named[-1] - named[0]) * 6))
        after = q["st"][named[-1] + 1:]
        q["ex_after"] = bool(np.isin(after, ["EX", "ET", "PT"]).any())
    q["td_lat"], q["td_lon"] = float(q["lat"][0]), float(q["lon"][0])
    q["sub0"] = str(q["st"][0]) in SUBTROP
    q["tc_hours"] = float((np.where(trop)[0][-1]) * 6)
    return q


def season_table(tr, years):
    rows = {}
    for y in years:
        t = [q for q in tr if q["season"] == y]
        rows[y] = dict(tracks=len(t), ns=sum(q["named"] for q in t), h=sum(q["hu"] for q in t), mh=sum(q["major"] for q in t), c5=sum(q["cat5"] for q in t), ace=sum(q["ace"] for q in t))
    return pd.DataFrame(rows).T


def day_of_season(t, year, month):
    return int((pd.Timestamp(t) - pd.Timestamp(year, month + 1, 1)).days)


def ace_curves(tr, years, month):
    L = 366
    A = np.zeros((len(years), L)); Nn = np.zeros((len(years), L))
    for k, y in enumerate(years):
        for q in tr:
            if q["season"] != y:
                continue
            for t, w, trop in zip(q["t"], q["w"], q["trop"]):
                if trop and w >= 34:
                    A[k, min(L - 1, max(0, day_of_season(t, y, month)))] += (w / 100.0) ** 2
            if q["named"]:
                Nn[k, min(L - 1, max(0, day_of_season(q["n_time"], y, month)))] += 1
    A = np.cumsum(A, axis=1); Nn = np.cumsum(Nn, axis=1)
    def curves(M, nd):
        return dict(mean=[r(v, nd) for v in M.mean(0)], p10=[r(v, nd) for v in np.percentile(M, 10, axis=0)], p25=[r(v, nd) for v in np.percentile(M, 25, axis=0)],
                    p50=[r(v, nd) for v in np.percentile(M, 50, axis=0)], p75=[r(v, nd) for v in np.percentile(M, 75, axis=0)], p90=[r(v, nd) for v in np.percentile(M, 90, axis=0)],
                    min=[r(v, nd) for v in M.min(0)], max=[r(v, nd) for v in M.max(0)])
    return curves(A, 1), curves(Nn, 2)


def by_month(times, ny):
    m = pd.DatetimeIndex(times).month.values
    return [r(float((m == k).sum()) / ny, 3) for k in range(1, 13)]


def genesis_stats(tr, years):
    ny = len(years)
    t = [q for q in tr if q["season"] in years]
    nm = [q for q in t if q["named"]]
    return dict(named_by_month=by_month([q["n_time"] for q in nm], ny), depression_by_month=by_month([q["t0"] for q in t], ny),
                depression_lat_quantiles=quantiles([q["td_lat"] for q in t], (2, 5, 10, 25, 50, 75, 95), 1), depression_abslat_quantiles=quantiles([abs(q["td_lat"]) for q in t], (2, 5, 10, 25, 50, 75, 95), 1), depression_lon_quantiles=quantiles([q["td_lon"] for q in t], (5, 25, 50, 75, 95), 1),
                named_lat_quantiles=quantiles([q["n_lat"] for q in nm], (5, 25, 50, 75, 95), 1), named_lon_quantiles=quantiles([q["n_lon"] for q in nm], (5, 25, 50, 75, 95), 1),
                depression_count=len(t), named_of_depressions=r(len(nm) / max(1, len(t)), 3),
                td_to_ts_hours_quantiles=quantiles([float((q["n_i"]) * 6) for q in nm], (10, 25, 50, 75, 90), 0))


def intensity_change(tr, years):
    dv = []; by_month_win = np.zeros(12); by_month_ri = np.zeros(12)
    n_tr = {"HU": [0, 0], "MH": [0, 0]}
    for q in tr:
        if q["season"] not in years:
            continue
        idx = {tt: k for k, tt in enumerate(q["t"])}
        any_ri = False
        for k in range(len(q["t"])):
            if not (q["trop"][k] and q["w"][k] >= 25):
                continue
            k2 = idx.get(q["t"][k] + np.timedelta64(24, "h"))
            if k2 is None or not np.isfinite(q["w"][k2]):
                continue
            d = q["w"][k2] - q["w"][k]; dv.append(d)
            m = pd.Timestamp(q["t"][k]).month - 1; by_month_win[m] += 1; by_month_ri[m] += d >= 30
            any_ri |= d >= 30
        for key, ok in (("HU", q["hu"]), ("MH", q["major"])):
            if ok:
                n_tr[key][0] += 1; n_tr[key][1] += any_ri
    a = np.array(dv)
    return dict(n_all=int(len(a)), ri_frac_all=r((a >= 30).mean(), 4), rw_frac=r((a <= -30).mean(), 4), ri50=r((a >= 50).mean(), 4), ri65=r((a >= 65).mean(), 4), ri_per_season=r(float((a >= 30).sum()) / len(years), 1),
                q=quantiles(a, (5, 25, 50, 75, 95, 99), 1), by_month=[r(x / y if y else 0, 4) for x, y in zip(by_month_ri, by_month_win)],
                ri_track_fractions={k: dict(n=v[0], with_ri=int(v[1]), frac=r(v[1] / max(1, v[0]), 3)) for k, v in n_tr.items()})


def motion_stats(tr, years):
    rows = []
    for q in tr:
        if q["season"] not in years:
            continue
        for k in range(len(q["t"]) - 1):
            if q["t"][k + 1] - q["t"][k] != np.timedelta64(6, "h") or not (q["trop"][k] and q["w"][k] >= 25):
                continue
            latm = (q["lat"][k] + q["lat"][k + 1]) / 2
            dx = (((q["lon"][k + 1] - q["lon"][k]) + 180) % 360 - 180) * 111.2 * np.cos(np.radians(latm)); dy = (q["lat"][k + 1] - q["lat"][k]) * 111.2
            rows.append((q["lat"][k], q["w"][k], dx / 6 / 1.852, dy / 6 / 1.852))
    d = pd.DataFrame(rows, columns=["lat", "w", "u", "v"]); d["spd"] = np.hypot(d.u, d.v)
    out = {}
    for label, sel in (("weak", d.w < 64), ("hurricane", d.w >= 64)):
        bands = []
        for lo in range(-60, 60, 5):
            s = d[sel & (d.lat >= lo) & (d.lat < lo + 5)]
            if len(s) >= 15:
                bands.append(dict(lat0=lo, n=int(len(s)), u=r(s.u.mean(), 2), v=r(s.v.mean(), 2), speed=r(s.spd.mean(), 2)))
        out[label] = bands
    out["all_tc_speed_quantiles"] = quantiles(d.spd, (5, 25, 50, 75, 95), 1)
    return out


def hurr_lat_stats(tr, years):
    """where the hurricane-strength rows are: |latitude| quantiles of the synoptic tropical rows of 64 kt or more (the equatorward edge of intense cyclones: the Coriolis limit the engine's growth gate stands in for)"""
    la = np.array([abs(q["lat"][k]) for q in tr if q["season"] in years for k in range(len(q["t"])) if q["trop"][k] and q["w"][k] >= 64])
    return dict(n=int(len(la)), abslat_quantiles=quantiles(la, (1, 5, 25, 50, 75), 1)) if len(la) else dict(n=0, abslat_quantiles=[None] * 5)


def peak_stats(tr, years):
    pk = np.array([q["peak"] for q in tr if q["season"] in years and q["named"]])
    edges = list(range(30, 180, 10)); h, _ = np.histogram(np.clip(pk, 30, 169), bins=edges)
    return dict(hist_edges=edges, hist=[int(v) for v in h], mean=r(pk.mean(), 1), median=r(np.median(pk), 1),
                frac_ge64=r((pk >= 64).mean(), 3), frac_ge96=r((pk >= 96).mean(), 3), frac_ge113=r((pk >= 113).mean(), 3), frac_ge137=r((pk >= 137).mean(), 4))


def lifetime_stats(tr, years):
    nm = [q for q in tr if q["season"] in years and q["named"]]
    d = np.array([q["n_hours"] / 24.0 for q in nm])
    return dict(named_days_quantiles=quantiles(d, (5, 25, 50, 75, 95), 2), mean_named_days=r(d.mean(), 2), short_lived_lt_2d=r((d < 2).mean(), 3))


def status_stats(tr, years):
    ny = len(years); t = [q for q in tr if q["season"] in years]; nm = [q for q in t if q["named"]]
    return dict(et_fraction_of_named=r(np.mean([q["ex_after"] for q in nm]), 3), et_per_year=r(sum(q["ex_after"] for q in nm) / ny, 2),
                subtropical_storms_per_year=r(sum(q["gen_status"] in SUBTROP or q["sub0"] for q in nm) / ny, 2), tracks_per_year=r(len(t) / ny, 2), named_per_year=r(len(nm) / ny, 2),
                cut_fraction=r(np.mean([q["cut"] for q in t]), 3))


def enso_composites(st, B):
    sst = cl.load(os.path.join(ROOT, "data", "raw", "ersstv5.nc"))
    times, anom = cl.nino34_index(sst)
    ts = pd.Series(anom, index=pd.to_datetime(times))
    idx = {}
    for y in st.index:
        vals = []
        for mm in B["ensoMonths"]:
            yy, m = (y + 1, mm - 12) if mm > 12 else (y, mm)
            s = ts[(ts.index.year == yy) & (ts.index.month == m)]
            if len(s):
                vals.append(float(s.iloc[0]))
        if len(vals) == len(B["ensoMonths"]):
            idx[y] = float(np.mean(vals))
    cls = {y: ("elnino" if v > 0.5 else "lanina" if v < -0.5 else "neutral") for y, v in idx.items()}
    out = {"months": B["ensoMonths"], "threshold": 0.5, "index": {int(y): r(v, 2) for y, v in idx.items()}}
    for c in ("elnino", "neutral", "lanina"):
        ys = [y for y in idx if cls[y] == c]
        s = st.loc[ys]
        out[c] = dict(n=len(ys), ns=r(s.ns.mean(), 2) if len(ys) else None, h=r(s.h.mean(), 2) if len(ys) else None, ace=r(s.ace.mean(), 1) if len(ys) else None, ace_sd=r(s.ace.std(), 1) if len(ys) > 1 else None)
    out["ace_ratio_lanina_over_elnino"] = r(out["lanina"]["ace"] / out["elnino"]["ace"], 2) if out["elnino"]["ace"] and out["lanina"]["ace"] else None
    ys = np.array(list(idx)); x = np.array([idx[y] for y in ys]); yv = np.log(np.array([st.loc[y].ace for y in ys]) + 10)
    out["slope_ln_ace10"] = r(np.polyfit(x, yv, 1)[0], 3); out["r_ln_ace10"] = r(np.corrcoef(x, yv)[0, 1], 2)
    return out


# ---- maps ----------------------------------------------------------------------------------------------------------------------
class Grid:
    def __init__(self, g):
        self.lon0, self.lat0, self.res, self.nx, self.ny = g["lon0"], g["lat0"], g["res"], g["nx"], g["ny"]
        self.lons = self.lon0 + self.res * np.arange(self.nx); self.lats = self.lat0 + self.res * np.arange(self.ny)


def month_weights(doy, sigma):
    t = np.arange(0, 365)
    w = np.exp(-0.5 * (((t - doy + 182.5) % 365 - 182.5) / sigma) ** 2)
    out = np.array([w[int(a): int(a + d)].sum() for a, d in zip(MSTART, MDAYS)])
    return out / out.sum()


def node_weights(G, lat, lon, sigma):
    d2 = (G.lats[:, None] - lat) ** 2 + ((G.lons[None, :] - lon) * np.cos(np.radians(lat))) ** 2
    w = np.exp(-0.5 * d2 / sigma ** 2)
    return w / w.sum()


def genesis_maps(G, ev, years, sigma_s, sigma_t=15.0):
    out = {}
    for cls in ("T", "S"):
        M = np.zeros((12, G.ny, G.nx))
        for e in ev:
            if e["cls"] == cls:
                M += month_weights(e["doy"], sigma_t)[:, None, None] * node_weights(G, e["lat"], e["lon"], sigma_s)[None]
        out[cls] = M / years
    return out


def drift_rows(j, region, land, dm, y0, y1):
    """consecutive six-hourly pairs inside the basin and over water (the engine's five-point test on the page's land mask): class weak / strong / sub / ex"""
    rows = []
    jj = j[(j.time.dt.year >= y0) & (j.time.dt.year <= y1) & (j.status != "XX")]
    for tid, g in jj.groupby("track_id", sort=False):
        t, lat, lon, w, st = g.time.values, g.lat.values, g.lon.values, g.wind.values, g.status.values
        ins = region.inside(lat, lon)
        for i in range(len(g) - 1):
            if t[i + 1] - t[i] != np.timedelta64(6, "h") or not (ins[i] and ins[i + 1]):
                continue
            ex_a, ex_b = st[i] in ("EX", "ET", "PT", "LO"), st[i + 1] in ("EX", "ET", "PT", "LO")
            trop_a = st[i] not in NONTROP and np.isfinite(w[i]); trop_b = st[i + 1] not in NONTROP or ex_b
            if not (trop_a or ex_a) or not (trop_b or ex_b) or (not ex_a and w[i] < 20):
                continue
            if land_fraction(land, dm, lat[i], lon[i]) > 0.2 or land_fraction(land, dm, lat[i + 1], lon[i + 1]) > 0.2:
                continue
            latm = (lat[i] + lat[i + 1]) / 2; lonm = lon[i] + (((lon[i + 1] - lon[i]) + 180) % 360 - 180) / 2
            u = (((lon[i + 1] - lon[i]) + 180) % 360 - 180) * 111.2 * np.cos(np.radians(latm)) / 6.0 / 1.852; v = (lat[i + 1] - lat[i]) * 111.2 / 6.0 / 1.852
            ww = w[i] if np.isfinite(w[i]) else 30.0
            cls = "ex" if ex_a else "sub" if st[i] in SUBTROP else "strong" if ww >= 64 else "weak"
            rows.append((cls, pd.Timestamp(t[i]).dayofyear - 1, latm, lonm, u, v, ww))
    return pd.DataFrame(rows, columns=["cls", "doy", "lat", "lon", "u", "v", "wind"])


def drift_maps(G, dr, prior=None, sigma_s=4.0, sigma_t=20.0, n0=2.0, ridge=3.0):
    """Gaussian-weighted local-linear means (tools/make_tc_maps.py): at every node and month the weighted least-squares plane through the rows, evaluated at the node, with a ridge shrinking the slopes
    toward zero where rows are few; a node with hardly any rows falls back, with weight n0, on the same class in a latitude band of +-10 degrees (of `prior` when given: the same class from all longitudes)"""
    res = {}
    for cls in CLASSES:
        d = dr[dr.cls == cls]
        p = (prior[prior.cls == cls] if prior is not None else d)
        lat, lon, doy, u, v = (d[c].values for c in ("lat", "lon", "doy", "u", "v"))
        plat, pdoy, pu_, pv_ = (p[c].values for c in ("lat", "doy", "u", "v"))
        U = np.zeros((12, G.ny, G.nx)); V = np.zeros_like(U); N = np.zeros_like(U)
        mid = MSTART + MDAYS / 2.0
        lam = ridge * sigma_s ** 2
        for m in range(12):
            dt = np.abs(((doy - mid[m] + 182.5) % 365) - 182.5); wt = np.exp(-0.5 * (dt / sigma_t) ** 2)
            pdt = np.abs(((pdoy - mid[m] + 182.5) % 365) - 182.5); pwt = np.exp(-0.5 * (pdt / sigma_t) ** 2)
            for k, la in enumerate(G.lats):
                band = pwt * (np.abs(plat - la) <= 10) * (pdt <= 40); nb = band.sum()
                pu = (band * pu_).sum() / nb if nb > 3 else 0.0; pv = (band * pv_).sum() / nb if nb > 3 else 0.0
                for i, lo in enumerate(G.lons):
                    x = lat - la; y = (lon - lo) * np.cos(np.radians(la))
                    w = wt * np.exp(-0.5 * (x ** 2 + y ** 2) / sigma_s ** 2); n = w.sum()
                    if n < 1e-9:
                        U[m, k, i] = pu; V[m, k, i] = pv; continue
                    A = np.array([[n, (w * x).sum(), (w * y).sum()], [(w * x).sum(), (w * x * x).sum() + lam, (w * x * y).sum()], [(w * y).sum(), (w * x * y).sum(), (w * y * y).sum() + lam]])
                    a_u = np.linalg.solve(A, np.array([(w * u).sum(), (w * x * u).sum(), (w * y * u).sum()]))[0]
                    a_v = np.linalg.solve(A, np.array([(w * v).sum(), (w * x * v).sum(), (w * y * v).sum()]))[0]
                    U[m, k, i] = (n * a_u + n0 * pu) / (n + n0); V[m, k, i] = (n * a_v + n0 * pv) / (n + n0); N[m, k, i] = n
        res[cls] = (U, V, N)
    return res


def rr(a, n=3):
    return np.round(np.asarray(a, dtype=float), n).tolist()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        raise SystemExit(__doc__)
    basin = args[0]; B = cfg(basin); month = B["seasonMonth"]; G = Grid(B["grid"])
    region = Region(basin, B["hemisphere"]); land, dm = page_land(basin)
    j = load_rows(B["frame"])
    years = list(range(B["years"][0], B["years"][1] + 1)); gy0, gy1 = B["genesisYears"]; dy0, dy1 = B["driftYears"]
    tr, outside = build_tracks(j, region, month, years)
    tr = [track_flags(q) for q in tr]
    n_all = len([q for q in tr if gy0 <= q["season"] <= gy1])
    if n_all < 100 and "--allow-sparse" not in sys.argv:
        raise SystemExit(f"{basin}: only {n_all} storms formed inside the page in {gy0}-{gy1}: too few for maps (the engine takes literature-based maps for the rare basins)")
    seasons = list(range(gy0, gy1 + 1)); all_years = [y for y in seasons if gy0 <= y <= gy1]
    st_all = season_table(tr, all_years); st = st_all.loc[years]
    ace_c, named_c = ace_curves(tr, years, month)
    daily = np.diff(np.array([0.0] + ace_c["mean"])); sm = np.convolve(daily, np.ones(15) / 15, mode="same")
    median_day = int(np.argmax(np.array(ace_c["mean"]) >= ace_c["mean"][-1] / 2.0))
    gen = genesis_stats(tr, years)
    nrm = dict(years=[years[0], years[-1]], tracks=r(st.tracks.mean(), 2), named=r(st.ns.mean(), 2), hurricanes=r(st.h.mean(), 2), majors=r(st.mh.mean(), 2), cat5=r(st.c5.mean(), 3),
               ace_mean=r(st.ace.mean(), 1), ace_sd=r(st.ace.std(), 1), ace_min=r(st.ace.min(), 1), ace_max=r(st.ace.max(), 1), ns_sd=r(st.ns.std(), 2), h_sd=r(st.h.std(), 2), mh_sd=r(st.mh.std(), 2),
               ace_median_day=median_day, ace_peak_day_smoothed=int(np.argmax(sm)),
               by_year={int(y): dict(tracks=int(row.tracks), ns=int(row.ns), h=int(row.h), mh=int(row.mh), c5=int(row.c5), ace=r(row.ace, 1)) for y, row in st_all.iterrows()})
    refj = dict(meta=dict(source=f"PyPI huracanpy {ref.WHEEL_VERSION} (IBTrACS-derived tables, JTWC 1-minute winds, 00/06/12/18 UTC)", wheel_sha256=ref.WHEEL_SHA256, generator="tools/make_tc_basin.py", basin=basin,
                          normals=[years[0], years[-1]], seasonMonth=month, tracks=len(tr), tracks_outside_region=int(outside), definitions="by wind: named >= 34 kt, hurricane-strength >= 64, major >= 96, cat 5 >= 137; depression = first tropical row >= 25 kt; ACE over tropical rows >= 34 kt"),
                normals=nrm, genesis=gen, ace_curve=ace_c, named_curve=named_c, intensity_change=intensity_change(tr, years), motion=motion_stats(tr, years), lifetime=lifetime_stats(tr, years),
                peak=peak_stats(tr, years), hurr_rows=hurr_lat_stats(tr, years), status=status_stats(tr, years), enso=enso_composites(st_all, B))
    ev = []
    for q in tr:
        if gy0 <= q["season"] <= gy1:
            t0 = pd.Timestamp(q["t0"])
            ev.append(dict(lat=q["td_lat"], lon=q["td_lon"], doy=int(t0.dayofyear - 1), cls="S" if q["sub0"] else "T", named=q["named"]))
    sg = 3.0 if G.res >= 5 else 2.0
    gm = genesis_maps(G, ev, gy1 - gy0 + 1, sg)
    dr = drift_rows(j, region, land, dm, dy0, dy1)
    south = G.lat0 < 0
    dm_ = drift_maps(G, dr)
    maps = dict(meta=dict(source=refj["meta"]["source"], basin=basin, genesis_years=[gy0, gy1], drift_years=[dy0, dy1], smoothing=dict(genesis_deg=sg, genesis_days=15, drift_deg=4.0, drift_days=20, drift_prior_rows=2, drift_estimator="local-linear, ridge 3")),
                grid=dict(lon0=G.lon0, lat0=G.lat0, res=G.res, nx=G.nx, ny=G.ny),
                genesis=dict(events=len(ev), events_T=sum(e["cls"] == "T" for e in ev), events_S=sum(e["cls"] == "S" for e in ev), per_year=r(len(ev) / (gy1 - gy0 + 1), 2), T=[rr(m, 4) for m in gm["T"]], S=[rr(m, 4) for m in gm["S"]],
                             by_month_T=rr(gm["T"].sum(axis=(1, 2)), 3), by_month_S=rr(gm["S"].sum(axis=(1, 2)), 3)),
                drift={c: dict(u=[rr(m, 2) for m in dm_[c][0]], v=[rr(m, 2) for m in dm_[c][1]], n=[rr(m, 1) for m in dm_[c][2]], rows=int((dr.cls == c).sum())) for c in CLASSES})
    gen_dir = os.path.join(ROOT, "data", "generated")
    with open(os.path.join(gen_dir, f"{basin}-tc-ref.json"), "w") as fh:
        json.dump(refj, fh, separators=(",", ":"))
    with open(os.path.join(gen_dir, f"{basin}-tc-maps.json"), "w") as fh:
        json.dump(maps, fh, separators=(",", ":"))
    n = nrm
    print(f"{basin}: {len(tr)} storms formed inside the page (+{outside} formed over land / outside); cut at the edge {status_stats(tr, years)['cut_fraction']}")
    print(f"{years[0]}-{years[-1]}: depressions {n['tracks']}  named {n['named']}  hurricane-strength {n['hurricanes']}  majors {n['majors']}  cat5 {n['cat5']}  ACE {n['ace_mean']} (sd {n['ace_sd']}, {n['ace_min']}..{n['ace_max']})  median ACE day {n['ace_median_day']}")
    print("named genesis per year by month (Jan..Dec):", gen["named_by_month"])
    print("depression latitude q2/5/10/25/50/75/95:", gen["depression_lat_quantiles"], " named lat/lon q5..q95:", gen["named_lat_quantiles"], gen["named_lon_quantiles"])
    ic = refj["intensity_change"]; print("RI share:", ic["ri_frac_all"], "per season", ic["ri_per_season"], " peak:", {k: refj["peak"][k] for k in ("mean", "frac_ge64", "frac_ge96", "frac_ge137")}, " mean named days", refj["lifetime"]["mean_named_days"], " ET share", refj["status"]["et_fraction_of_named"])
    print("ENSO:", {k: refj["enso"][k] for k in ("elnino", "neutral", "lanina", "ace_ratio_lanina_over_elnino", "slope_ln_ace10")})
    rows_by_class = ", ".join("%s: %d" % (c, maps["drift"][c]["rows"]) for c in CLASSES)
    print(f"maps: genesis events {len(ev)} ({maps['genesis']['events_S']} subtropical), drift rows {{{rows_by_class}}}")


if __name__ == "__main__":
    main()
