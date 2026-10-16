#!/usr/bin/env python3
"""Real Atlantic best-track statistics for the storm engine: the targets the engine is calibrated and tested against.

Source: the IBTrACS tables shipped inside the PyPI wheel `huracanpy` (1.5.0): `jtwc.csv` has the HURDAT2-style status codes
(TD TS HU EX SD SS WV DB LO) for every basin, 1980-2024, at 00/06/12/18 UTC; `wmo.csv` has the same wind and pressure
(99.9 % identical for the Atlantic). NHC/NCEI themselves are not reachable from the sandbox, so this is a third-party mirror of
NOAA public data: the script checks the wheel against PyPI's own sha256 and the result against NHC's published tallies.

Only derived statistics are written (data/generated/atlantic-tc-ref.json); the wheel is cached in git-ignored data/raw/.
Every definition below is the one the engine's Monte-Carlo statistics use, so the two can be compared like for like:
  season          the IBTrACS `season` (the calendar year of the first record)
  named storm     any synoptic row with status TS, SS or HU (tropical or subtropical storm)
  hurricane       any HU row;  major: HU row with wind >= 96 kt;  cat 5: >= 137 kt
  ACE             sum over synoptic rows with status TS/SS/HU of (wind_kt / 100)^2   (10^4 kt^2)
  genesis         first synoptic row with status TS/SS/HU (named) and first row with TD/SD/TS/SS/HU (depression)
  RI              a gain of >= 30 kt in the 24 h after a synoptic row (start >= 25 kt, tropical/subtropical status)
usage: make_tc_ref.py [out.json]"""
import hashlib, io, json, os, sys, urllib.request, zipfile
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import climate_lib as cl  # noqa: E402

WHEEL_VERSION = "1.5.0"
WHEEL_NAME = f"huracanpy-{WHEEL_VERSION}-py3-none-any.whl"
WHEEL_SHA256 = "fc6dd3a11c120cfd1f6c611de8911b1da6c2d2b70c253df39544c8b7204c0688"
WHEEL_PATH = os.path.join(ROOT, "data", "raw", WHEEL_NAME)
Y0, Y1 = 1991, 2020                 # NHC's current normals
TC = {"TD", "SD", "TS", "SS", "HU"}       # tropical or subtropical stages
NAMED = {"TS", "SS", "HU"}
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def fetch_wheel():
    if not os.path.exists(WHEEL_PATH):
        meta = json.load(urllib.request.urlopen(f"https://pypi.org/pypi/huracanpy/{WHEEL_VERSION}/json", timeout=120))
        url = [f["url"] for f in meta["urls"] if f["filename"] == WHEEL_NAME][0]
        os.makedirs(os.path.dirname(WHEEL_PATH), exist_ok=True)
        with open(WHEEL_PATH, "wb") as fh:
            fh.write(urllib.request.urlopen(url, timeout=600).read())
    h = hashlib.sha256(open(WHEEL_PATH, "rb").read()).hexdigest()
    if h != WHEEL_SHA256:
        raise SystemExit(f"{WHEEL_PATH}: sha256 {h} is not the pinned {WHEEL_SHA256}")
    return h


def load_atlantic():
    z = zipfile.ZipFile(WHEEL_PATH)
    kw = dict(parse_dates=["time"], keep_default_na=False, na_values=[""])   # "NA" (North Atlantic) must stay text
    j = pd.read_csv(z.open("huracanpy/_data/_ibtracs_files/jtwc.csv"), **kw)
    j = j[j.basin == "NA"].copy()
    j = j[(j.time.dt.minute == 0) & (j.time.dt.hour % 6 == 0)]            # synoptic rows only (drop landfall/peak specials)
    j = j.sort_values(["track_id", "time"]).reset_index(drop=True)
    j["doy"] = j.time.dt.dayofyear - 1
    return j


def r(x, n=2):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), n)


def quantiles(a, qs=(5, 25, 50, 75, 95), n=2):
    a = np.asarray(a, float)
    return [r(np.percentile(a, q), n) for q in qs] if len(a) else [None] * len(qs)


def per_track(j):
    """one record per track: season, rows, flags and the named/depression genesis rows"""
    out = []
    for tid, g in j.groupby("track_id", sort=False):
        st = g.status.values
        wind = g.wind.values.astype(float)
        named_idx = np.where(np.isin(st, list(NAMED)))[0]
        tc_idx = np.where(np.isin(st, list(TC)))[0]
        rec = dict(tid=tid, season=int(g.season.iloc[0]), n=len(g))
        rec["named"] = len(named_idx) > 0
        rec["hu"] = bool((st == "HU").any())
        hu_w = wind[st == "HU"]
        rec["major"] = bool(len(hu_w) and np.nanmax(hu_w) >= 96)
        rec["cat5"] = bool(len(hu_w) and np.nanmax(hu_w) >= 137)
        rec["tc"] = len(tc_idx) > 0
        rec["peak"] = float(np.nanmax(wind[tc_idx])) if len(tc_idx) else np.nan
        if len(named_idx):
            i = named_idx[0]
            rec.update(gen_i=int(i), gen_time=g.time.iloc[i], gen_lat=float(g.lat.iloc[i]), gen_lon=float(g.lon.iloc[i]),
                       gen_status=str(st[i]), gen_wind=float(wind[i]))
            rec["last_named_i"] = int(named_idx[-1])
            rec["named_hours"] = float((named_idx[-1] - named_idx[0]) * 6)
            rec["ex_after"] = bool((st[named_idx[-1] + 1:] == "EX").any())
            rec["ss_any"] = bool((st == "SS").any())
        if len(tc_idx):
            k = tc_idx[0]
            rec.update(td_time=g.time.iloc[k], td_lat=float(g.lat.iloc[k]), td_lon=float(g.lon.iloc[k]), td_status=str(st[k]))
            rec["tc_hours"] = float((tc_idx[-1] - tc_idx[0]) * 6)
            if len(named_idx):
                rec["td_to_ts_h"] = float((named_idx[0] - tc_idx[0]) * 6)
        out.append(rec)
    return pd.DataFrame(out)


def season_table(tr, j, years):
    rows = {}
    for y in years:
        t = tr[tr.season == y]
        e = j[(j.season == y) & j.status.isin(list(NAMED))]
        ace = float(((e.wind.astype(float) / 100.0) ** 2).sum())
        rows[y] = dict(tracks=int(len(t)), ns=int(t.named.sum()), h=int(t.hu.sum()), mh=int(t.major.sum()), c5=int(t.cat5.sum()), ace=ace)
    return pd.DataFrame(rows).T


def ace_curves(j, years):
    """cumulative ACE and cumulative named storms by day of year, per year -> percentile curves"""
    A = np.zeros((len(years), 366)); Nn = np.zeros((len(years), 366))
    for k, y in enumerate(years):
        e = j[(j.season == y) & j.status.isin(list(NAMED))]
        np.add.at(A[k], e.doy.values, (e.wind.astype(float).values / 100.0) ** 2)
        first = e.groupby("track_id").doy.min()
        np.add.at(Nn[k], first.values, 1)
    A = np.cumsum(A, axis=1); Nn = np.cumsum(Nn, axis=1)
    def curves(M, nd):
        return dict(mean=[r(v, nd) for v in M.mean(0)], p10=[r(v, nd) for v in np.percentile(M, 10, axis=0)],
                    p25=[r(v, nd) for v in np.percentile(M, 25, axis=0)], p50=[r(v, nd) for v in np.percentile(M, 50, axis=0)],
                    p75=[r(v, nd) for v in np.percentile(M, 75, axis=0)], p90=[r(v, nd) for v in np.percentile(M, 90, axis=0)],
                    min=[r(v, nd) for v in M.min(0)], max=[r(v, nd) for v in M.max(0)])
    return curves(A, 1), curves(Nn, 2)


def genesis_stats(tr, years):
    t = tr[tr.season.isin(years) & tr.named]
    ny = len(years)
    bymon = [r(float((t.gen_time.dt.month == m).sum()) / ny, 3) for m in range(1, 13)]
    td = tr[tr.season.isin(years) & tr.tc]
    bymon_td = [r(float((td.td_time.dt.month == m).sum()) / ny, 3) for m in range(1, 13)]
    cells = {}
    for _, q in t.iterrows():
        la = int(np.floor(q.gen_lat / 10) * 10); lo = int(np.floor(q.gen_lon / 20) * 20)
        cells[(la, lo)] = cells.get((la, lo), 0) + 1
    cells10 = [[la, lo, r(c / len(t), 4)] for (la, lo), c in sorted(cells.items(), key=lambda kv: -kv[1])]
    fine = {}
    for _, q in td.iterrows():            # 5 x 5 degree map of where depressions first appear (the seed-region calibration)
        k = (int(np.floor(q.td_lat / 5) * 5), int(np.floor(q.td_lon / 5) * 5))
        fine[k] = fine.get(k, 0) + 1
    grid5 = [[la, lo, c] for (la, lo), c in sorted(fine.items())]
    return dict(
        named_by_month=bymon, depression_by_month=bymon_td,
        named_lat_quantiles=quantiles(t.gen_lat, (5, 25, 50, 75, 95), 1), named_lon_quantiles=quantiles(t.gen_lon, (5, 25, 50, 75, 95), 1),
        cells_10x20=cells10, depression_grid_5x5=grid5, depression_count=int(len(td)),
        starts_as=dict(TD=int((t.gen_status.isin(["TS", "HU"]) & (t.td_status == "TD")).sum()), SD=int((t.td_status == "SD").sum()),
                       direct_TS_or_SS=int((t.td_status.isin(["TS", "SS", "HU"])).sum())),
        td_to_ts_hours_quantiles=quantiles(t.td_to_ts_h.dropna(), (10, 25, 50, 75, 90), 0),
        td_only_per_year=r(float((td.named == False).sum()) / ny, 2),
    )


def intensity_change(j, years):
    """24-h wind change after every synoptic row (start >= 25 kt, TC status), by starting intensity class"""
    classes = [("25-34", 25, 35), ("35-63", 35, 64), ("64-95", 64, 96), ("96-136", 96, 137), ("137+", 137, 999)]
    edges = list(range(-80, 85, 5))
    out = {c[0]: dict(n=0, dv=[]) for c in classes}
    ri_by_month = np.zeros(12); win_by_month = np.zeros(12)
    jj = j[j.season.isin(years)]
    for tid, g in jj.groupby("track_id", sort=False):
        t = g.time.values; w = g.wind.astype(float).values; st = g.status.values
        idx = {tt: k for k, tt in enumerate(t)}
        for k in range(len(g)):
            if st[k] not in TC or not (w[k] >= 25):
                continue
            tt = t[k] + np.timedelta64(24, "h")
            k2 = idx.get(tt)
            if k2 is None or not (w[k2] == w[k2]):
                continue
            dv = w[k2] - w[k]
            for name, lo, hi in classes:
                if lo <= w[k] < hi:
                    out[name]["dv"].append(dv); break
            m = g.time.iloc[k].month - 1
            win_by_month[m] += 1; ri_by_month[m] += (dv >= 30)
    res = {}
    allv = []
    for name, lo, hi in classes:
        a = np.array(out[name]["dv"]); allv.extend(a.tolist())
        h, _ = np.histogram(np.clip(a, edges[0], edges[-1] - 1e-9), bins=edges)
        res[name] = dict(n=int(len(a)), mean=r(a.mean(), 2), sd=r(a.std(), 2), ri_frac=r((a >= 30).mean(), 4), rw_frac=r((a <= -30).mean(), 4),
                         q=quantiles(a, (5, 25, 50, 75, 95, 99), 1), hist=[int(v) for v in h])
    allv = np.array(allv)
    ge35 = np.concatenate([np.array(out[n]["dv"]) for n in ("35-63", "64-95", "96-136", "137+")])
    ri_tracks = {}
    tr_rows = jj[jj.status.isin(list(TC))]
    return dict(hist_edges=edges, by_class=res, n_all=int(len(allv)),
                ri_frac_all=r((allv >= 30).mean(), 4), ri_frac_start35=r((ge35 >= 30).mean(), 4),
                ri_per_season=r(float((allv >= 30).sum()) / len(years), 1),
                ri_by_month=[r(a / b if b else 0, 4) for a, b in zip(ri_by_month, win_by_month)],
                ri_windows_by_month=[int(v) for v in win_by_month])


def ri_track_fractions(j, years):
    """share of hurricanes / majors / cat 4-5 storms that had at least one RI window"""
    jj = j[j.season.isin(years)]
    cnt = {"HU": [0, 0], "MH": [0, 0], "C4+": [0, 0]}
    for tid, g in jj.groupby("track_id", sort=False):
        w = g.wind.astype(float).values; st = g.status.values; t = g.time.values
        hu = st == "HU"
        if not hu.any(): continue
        pk = np.nanmax(w[hu])
        idx = {tt: k for k, tt in enumerate(t)}
        ri = False
        for k in range(len(g)):
            if st[k] in TC and w[k] >= 25:
                k2 = idx.get(t[k] + np.timedelta64(24, "h"))
                if k2 is not None and w[k2] == w[k2] and w[k2] - w[k] >= 30: ri = True; break
        for key, ok in (("HU", True), ("MH", pk >= 96), ("C4+", pk >= 113)):
            if ok: cnt[key][0] += 1; cnt[key][1] += ri
    return {k: dict(n=v[0], with_ri=v[1], frac=r(v[1] / v[0], 3)) for k, v in cnt.items()}


def motion_stats(j, years):
    """6-hourly displacement -> translation velocity (kt, +u east, +v north) by latitude band and strength"""
    jj = j[j.season.isin(years)].copy()
    jj["t6"] = jj.groupby("track_id").time.shift(-1)
    for c in ("lat", "lon", "status", "wind"):
        jj[c + "2"] = jj.groupby("track_id")[c].shift(-1)
    ok = (jj.t6 - jj.time) == pd.Timedelta(hours=6)
    d = jj[ok].copy()
    coslat = np.cos(np.deg2rad((d.lat + d.lat2) / 2))
    dx = (d.lon2 - d.lon) * 111.2 * coslat; dy = (d.lat2 - d.lat) * 111.2
    d["u"] = dx / 6 / 1.852; d["v"] = dy / 6 / 1.852; d["spd"] = np.hypot(d.u, d.v)
    d = d[d.status.isin(list(TC)) & d.status2.isin(list(TC) + ["EX", "LO"])]
    out = {}
    for label, sel in (("weak", d.wind < 64), ("hurricane", d.wind >= 64)):
        bands = []
        for lo in range(5, 55, 5):
            s = d[sel & (d.lat >= lo) & (d.lat < lo + 5)]
            if len(s) >= 15:
                bands.append(dict(lat0=lo, n=int(len(s)), u=r(s.u.mean(), 2), v=r(s.v.mean(), 2), speed=r(s.spd.mean(), 2),
                                  speed_sd=r(s.spd.std(), 2), u_sd=r(s.u.std(), 2), v_sd=r(s.v.std(), 2)))
        out[label] = bands
    ex = jj[ok & (jj.status == "EX")].copy()
    ex_d = ex.assign(u=((ex.lon2 - ex.lon) * 111.2 * np.cos(np.deg2rad((ex.lat + ex.lat2) / 2))) / 6 / 1.852, v=((ex.lat2 - ex.lat) * 111.2) / 6 / 1.852)
    out["extratropical"] = dict(n=int(len(ex_d)), u=r(ex_d.u.mean(), 2), v=r(ex_d.v.mean(), 2), speed=r(np.hypot(ex_d.u, ex_d.v).mean(), 2))
    allsp = d.spd
    out["all_tc_speed_quantiles"] = quantiles(allsp, (5, 25, 50, 75, 95), 1)
    return out


def lifetime_stats(tr, years):
    t = tr[tr.season.isin(years) & tr.named]
    return dict(named_days_quantiles=quantiles(t.named_hours / 24.0, (5, 25, 50, 75, 95), 2),
                tropical_days_quantiles=quantiles(t.tc_hours / 24.0, (5, 25, 50, 75, 95), 2),
                mean_named_days=r((t.named_hours / 24.0).mean(), 2), short_lived_lt_2d=r(((t.named_hours / 24.0) < 2).mean(), 3))


def peak_stats(tr, years):
    t = tr[tr.season.isin(years) & tr.named]
    pk = t.peak.values
    edges = list(range(30, 180, 10))
    h, _ = np.histogram(np.clip(pk, 30, 169), bins=edges)
    return dict(hist_edges=edges, hist=[int(v) for v in h], mean=r(pk.mean(), 1), median=r(np.median(pk), 1),
                frac_ge64=r((pk >= 64).mean(), 3), frac_ge96=r((pk >= 96).mean(), 3), frac_ge113=r((pk >= 113).mean(), 3), frac_ge137=r((pk >= 137).mean(), 4))


def status_stats(j, tr, years):
    jj = j[j.season.isin(years)]
    t = tr[tr.season.isin(years)]
    named = t[t.named]
    ny = len(years)
    rows = {k: int(v) for k, v in jj.status.value_counts().items()}
    return dict(row_counts=rows,
                et_fraction_of_named=r(named.ex_after.mean(), 3), et_per_year=r(float(named.ex_after.sum()) / ny, 2),
                subtropical_storms_per_year=r(float(named.ss_any.sum()) / ny, 2),
                named_first_status=dict(named.gen_status.value_counts().to_dict()),
                tracks_per_year=r(len(t) / ny, 2), named_per_year=r(len(named) / ny, 2))


def wind_pressure(j):
    d = j[j.status.isin(list(TC)) & j.slp.notna() & j.wind.notna() & (j.wind >= 25)].copy()
    V = d.wind.astype(float).values; P = d.slp.astype(float).values
    dp = 1013.0 - P
    keep = dp > 1
    V, P, dp, lat = V[keep], P[keep], dp[keep], d.lat.values[keep]
    # V = a * dp^b
    b, la = np.polyfit(np.log(dp), np.log(V), 1)
    resid_kt = V - np.exp(la) * dp ** b
    # dp = c * V^d, and with a latitude term
    d1, lc = np.polyfit(np.log(V), np.log(dp), 1)
    resid_p = dp - np.exp(lc) * V ** d1
    X = np.column_stack([np.ones_like(V), np.log(V), (lat - 25) / 10])
    coef, *_ = np.linalg.lstsq(X, np.log(dp), rcond=None)
    resid_p_lat = dp - np.exp(X @ coef)
    bins = []
    for lo in range(25, 175, 10):
        s = P[(V >= lo) & (V < lo + 10)]
        if len(s) >= 8:
            bins.append(dict(v0=lo, n=int(len(s)), p50=r(np.median(s), 1), p10=r(np.percentile(s, 10), 1), p90=r(np.percentile(s, 90), 1)))
    bylat = {}
    for name, lo, hi in (("<20N", 0, 20), ("20-30N", 20, 30), (">=30N", 30, 90)):
        row = []
        for v0 in (35, 65, 95):
            s = P[(V >= v0) & (V < v0 + 25) & (lat >= lo) & (lat < hi)]
            row.append(dict(v0=v0, n=int(len(s)), p50=r(np.median(s), 1) if len(s) >= 8 else None))
        bylat[name] = row
    return dict(n=int(len(V)), v_from_dp=dict(a=r(np.exp(la), 4), b=r(b, 4), rms_kt=r(np.sqrt((resid_kt ** 2).mean()), 2)),
                dp_from_v=dict(c=r(np.exp(lc), 5), d=r(d1, 4), rms_hPa=r(np.sqrt((resid_p ** 2).mean()), 2)),
                dp_from_v_lat=dict(c=r(np.exp(coef[0]), 5), d=r(coef[1], 4), lat_per10=r(coef[2], 4), rms_hPa=r(np.sqrt((resid_p_lat ** 2).mean()), 2)),
                by_wind=bins, by_wind_and_lat=bylat, penv=1013.0)


def enso_composites(st):
    sst = cl.load(os.path.join(ROOT, "data", "raw", "ersstv5.nc"))
    times, anom = cl.nino34_index(sst)
    ts = pd.Series(anom, index=pd.to_datetime(times))
    aso = ts[ts.index.month.isin([8, 9, 10])].groupby(ts[ts.index.month.isin([8, 9, 10])].index.year).mean()
    years = [y for y in st.index if y in aso.index]
    cls = {y: ("elnino" if aso[y] > 0.5 else "lanina" if aso[y] < -0.5 else "neutral") for y in years}
    out = {"years": f"{min(years)}-{max(years)}", "aso_threshold": 0.5, "n34_aso": {int(y): r(aso[y], 2) for y in years}}
    for c in ("elnino", "neutral", "lanina"):
        ys = [y for y in years if cls[y] == c]
        s = st.loc[ys]
        out[c] = dict(n=len(ys), ns=r(s.ns.mean(), 2), h=r(s.h.mean(), 2), mh=r(s.mh.mean(), 2), ace=r(s.ace.mean(), 1), ace_sd=r(s.ace.std(), 1))
    out["ace_ratio_lanina_over_elnino"] = r(out["lanina"]["ace"] / out["elnino"]["ace"], 2)
    return out


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "data", "generated", "atlantic-tc-ref.json")
    sha = fetch_wheel()
    j = load_atlantic()
    tr = per_track(j)
    normals_years = list(range(Y0, Y1 + 1))
    all_years = list(range(1980, 2025))
    st_all = season_table(tr, j, all_years)
    st = st_all.loc[normals_years]
    ace_c, named_c = ace_curves(j, normals_years)
    ace_cum = np.cumsum
    doy_median = lambda curve: int(np.argmax(np.array(curve) >= curve[-1] / 2.0))
    ace_mean_curve = ace_c["mean"]
    # peak of the 15-day smoothed daily ACE of the mean curve
    daily = np.diff(np.array([0.0] + ace_mean_curve))
    sm = np.convolve(daily, np.ones(15) / 15, mode="same")
    ref = dict(
        meta=dict(source=f"PyPI huracanpy {WHEEL_VERSION} (IBTrACS-derived Atlantic tables, 00/06/12/18 UTC)", wheel_sha256=sha,
                  generator="tools/make_tc_ref.py", normals=[Y0, Y1], rows=int(len(j)), tracks=int(len(tr)),
                  note="third-party mirror of NOAA public data; checked against NHC tallies, see normals.nhc_published"),
        normals=dict(
            years=[Y0, Y1], tracks=r(st.tracks.mean(), 2), named=r(st.ns.mean(), 2), hurricanes=r(st.h.mean(), 2), majors=r(st.mh.mean(), 2),
            cat5=r(st.c5.mean(), 3), ace_mean=r(st.ace.mean(), 1), ace_sd=r(st.ace.std(), 1), ace_min=r(st.ace.min(), 1), ace_max=r(st.ace.max(), 1),
            ns_sd=r(st.ns.std(), 2), h_sd=r(st.h.std(), 2), mh_sd=r(st.mh.std(), 2),
            ace_median_doy=doy_median(ace_mean_curve), ace_peak_doy_smoothed=int(np.argmax(sm)),
            nhc_published=dict(named=14.4, hurricanes=7.2, majors=3.2, ace=122, peak="about Sep 10"),
            by_year={int(y): dict(tracks=int(row.tracks), ns=int(row.ns), h=int(row.h), mh=int(row.mh), c5=int(row.c5), ace=r(row.ace, 1)) for y, row in st_all.iterrows()},
        ),
        genesis=genesis_stats(tr, normals_years),
        ace_curve=ace_c, named_curve=named_c,
        intensity_change=intensity_change(j, normals_years),
        ri_track_fractions=ri_track_fractions(j, normals_years),
        motion=motion_stats(j, normals_years),
        lifetime=lifetime_stats(tr, normals_years),
        peak=peak_stats(tr, normals_years),
        status=status_stats(j, tr, normals_years),
        wind_pressure=wind_pressure(j[j.season.isin(normals_years)]),
        enso=enso_composites(st_all),
    )
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as fh:
        json.dump(ref, fh, separators=(",", ":"), sort_keys=False)
    n = ref["normals"]; g = ref["genesis"]; ic = ref["intensity_change"]
    print(f"wrote {out_path} ({os.path.getsize(out_path) / 1024:.0f} KB)")
    print(f"{Y0}-{Y1}: tracks {n['tracks']}  named {n['named']} (NHC 14.4)  hurricanes {n['hurricanes']} (7.2)  majors {n['majors']} (3.2)  cat5 {n['cat5']}")
    print(f"ACE mean {n['ace_mean']} (NHC ~122) sd {n['ace_sd']} min {n['ace_min']} max {n['ace_max']}; median ACE day-of-year {n['ace_median_doy']} (Jan 1 = 0); smoothed peak doy {n['ace_peak_doy_smoothed']}")
    print("named genesis per year by month:", dict(zip(MON, g["named_by_month"])))
    print("RI share of 24-h windows:", ic["ri_frac_all"], " start>=35kt:", ic["ri_frac_start35"], " per season:", ic["ri_per_season"], " tracks with RI:", ref["ri_track_fractions"])
    print("wind-pressure dp = c V^d:", ref["wind_pressure"]["dp_from_v"], " with latitude:", ref["wind_pressure"]["dp_from_v_lat"])
    print("ENSO composites:", {k: ref["enso"][k] for k in ("elnino", "neutral", "lanina", "ace_ratio_lanina_over_elnino")})
    print("subtropical/ET:", ref["status"]["subtropical_storms_per_year"], "SS storms/yr;", ref["status"]["et_per_year"], "ET/yr =", ref["status"]["et_fraction_of_named"], "of named")


if __name__ == "__main__":
    main()
