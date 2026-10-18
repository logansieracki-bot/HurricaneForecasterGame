#!/usr/bin/env python3
"""How real Atlantic tropical cyclones become extratropical (1991-2020): the data the storm engine's transition is fitted and checked against.

Source: the IBTrACS tables of the PyPI wheel `huracanpy` (same source and pin as tools/make_tc_ref.py), HURDAT2-style status codes: TD / TS / HU / SD / SS are
the tropical and subtropical rows, EX the post-tropical (extratropical) rows, LO the remnant lows. Named storms only (432 in 1991-2020).

What it measures
  * what a transition looks like: the share of named storms with an EX row (45 %), where and when (latitude, longitude, month of the first EX row), how strong the
    storm is when it becomes post-tropical (a transition keeps the wind: hurricanes are about 65 kt at their first EX row, tropical storms 45 kt), how fast it moves, how
    long the post-tropical track lasts (median 1.5 days, a tail of a week), where it ends, how its wind changes in the next one and two days (-5 kt a day, one in six
    gains 10 kt or more: baroclinic re-intensification), and the remnant lows (LO) that are not transitions: how many, how strong, how long;
  * what makes it happen: for every six-hourly tropical row north of 15N whether the NEXT row is EX, against the latitude, the sea-surface temperature (ERSST, the
    simulator's own base), the 200-850 hPa shear (ERA5, the page's definition: daily means at 2 degrees where the files have them, 2017-2020, the monthly mean of 2007-2021
    otherwise), the deep-layer westerly flow and the storm's own wind and motion. The hazard is a logistic regression; the engine's coefficients (`etHaz` in
    src/storms.js) are these, with the intercept re-fitted to the simulator's own tracks by tools/storm_mc.mjs;
  * how a tropical cyclone's wind changes over 24 h at high latitude, which is what a transition must not destroy.

Written: data/generated/atlantic-tc-et.json (statistics only) and data/raw/atlantic-tc-et-rows.csv (the per-row table, git-ignored).
usage: make_tc_et.py [out.json]"""
import json, os, sys
import numpy as np
import pandas as pd
import xarray as xr

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import make_tc_ref as ref  # noqa: E402
import make_tc_env as E    # noqa: E402

RAW = os.path.join(ROOT, "data", "raw")
TC = ref.TC
Y0, Y1 = 1991, 2020
QS = [10, 25, 50, 75, 90]


def q(a, nd=1):
    a = np.asarray(a, float); a = a[np.isfinite(a)]
    return [round(float(x), nd) for x in np.percentile(a, QS)] if len(a) else None


# ---- the environment at a row ---------------------------------------------------------------------------------------------------------
class Env:
    def __init__(self):
        self.sst = xr.open_dataset(os.path.join(RAW, "ersstv5.nc"))["sst"]
        self.sst = self.sst.assign_coords(lon=(((self.sst.lon + 180) % 360) - 180)).sortby("lon").sortby("lat")
        shm = xr.open_dataset(os.path.join(RAW, "era5_shear_global_monthly_2007-2021.nc"))["shear"]
        self.shm = shm.values.astype(np.float32); self.m0 = pd.Timestamp(shm.time.values[0])
        self.clim_sh = np.nanmean(self.shm.reshape(-1, 12, *self.shm.shape[1:]), axis=0)
        shd = xr.open_dataset(os.path.join(RAW, "era5_shear_global_daily_2017-2021_allmonths.nc"))["shear"]
        self.shd = shd.values.astype(np.float32); self.day0 = pd.Timestamp(shd.time.values[0])
        self.sm = {y: xr.open_dataset(os.path.join(RAW, f"era5_steer_monthly_{y}.nc"))["u_deep"].values for y in range(2007, 2022)}
        self.sd = {y: xr.open_dataset(os.path.join(RAW, f"era5_steer_daily_{y}.nc"))["u_deep"].values for y in range(2017, 2022)}
        self.ud_clim = np.mean([self.sm[y] for y in range(2007, 2022)], axis=0)

    @staticmethod
    def s15(a2, lat, lon):                     # the steering files: 1.5 degrees, lat -90..90, lon 0..358.5
        fy = (lat + 90) / 1.5; fx = (lon % 360) / 1.5
        j0 = int(np.clip(np.floor(fy), 0, 119)); i0 = int(np.floor(fx)) % 240; i1 = (i0 + 1) % 240; ty = fy - j0; tx = fx - np.floor(fx)
        return float(a2[j0, i0] * (1 - ty) * (1 - tx) + a2[j0, i1] * (1 - ty) * tx + a2[j0 + 1, i0] * ty * (1 - tx) + a2[j0 + 1, i1] * ty * tx)

    def at(self, t, lat, lon):
        t = pd.Timestamp(t); y, mo = t.year, t.month
        o = dict(sst=E.sst_at(self.sst, t, lat, lon))
        mi = (y - self.m0.year) * 12 + (mo - self.m0.month)
        o["shM"] = E.bilin(self.shm[mi], lat, lon) if 0 <= mi < self.shm.shape[0] else E.bilin(self.clim_sh[mo - 1], lat, lon)
        o["udM"] = self.s15(self.sm[y][mo - 1] if y in self.sm else self.ud_clim[mo - 1], lat, lon)
        k = int((t.normalize() - self.day0).days)
        if 0 <= k < self.shd.shape[0]:
            o["shD"] = E.bilin(self.shd[k], lat, lon); o["udD"] = self.s15(self.sd[y][min(364, t.dayofyear - 1)], lat, lon)
        return o


# ---- logistic regression (IRLS) ---------------------------------------------------------------------------------------------------------
def logit_fit(X, y, l2=1e-6):
    X = np.column_stack([np.ones(len(X)), X]); b = np.zeros(X.shape[1])
    for _ in range(80):
        p = 1 / (1 + np.exp(-np.clip(X @ b, -30, 30))); W = p * (1 - p) + 1e-12
        step = np.linalg.solve((X.T * W) @ X + l2 * np.eye(len(b)), X.T @ (y - p) - l2 * b); b += step
        if np.abs(step).max() < 1e-9: break
    p = 1 / (1 + np.exp(-np.clip(X @ b, -30, 30)))
    se = np.sqrt(np.diag(np.linalg.inv((X.T * (p * (1 - p) + 1e-12)) @ X + l2 * np.eye(len(b)))))
    return b, se, float(np.sum(y * np.log(p + 1e-15) + (1 - y) * np.log(1 - p + 1e-15))), p


def auc(p, y):
    o = np.argsort(p); r = np.empty(len(p)); r[o] = np.arange(1, len(p) + 1); n1 = y.sum(); n0 = len(y) - n1
    return float((r[y == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def fit_model(d, cols):
    X = d[cols].values.astype(float); mu = X.mean(0); sd = X.std(0)
    b, se, ll, p = logit_fit((X - mu) / sd, d.event.values.astype(float))
    coef = b[1:] / sd; b0 = b[0] - float(np.sum(b[1:] * mu / sd))
    return dict(cols=cols, intercept=round(float(b0), 4), coef={c: round(float(v), 5) for c, v in zip(cols, coef)}, z={c: round(float(v), 2) for c, v in zip(cols, b[1:] / se[1:])},
                loglik=round(ll, 1), auc=round(auc(p, d.event.values.astype(float)), 3), rows=int(len(d)), events=int(d.event.sum()))


# ---- the tables --------------------------------------------------------------------------------------------------------------------------
def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "data", "generated", "atlantic-tc-et.json")
    ref.fetch_wheel(); j = ref.load_atlantic(); j = j[(j.season >= Y0) & (j.season <= Y1)].copy()
    env = Env(); land = E.load_land()
    rows, ets, tails, hi_lat = [], [], [], []
    nnamed = 0; final = {"EX": 0, "LO": 0, "TC": 0}
    rows_by = {"EX": [], "LO": []}
    for tid, g in j.groupby("track_id", sort=False):
        g = g.sort_values("time").reset_index(drop=True)
        if not g.status.isin(ref.NAMED).any(): continue
        nnamed += 1
        st = g.status.values; w = g.wind.values.astype(float); t = g.time
        last_tc = max(i for i in range(len(g)) if st[i] in TC)
        e = st[-1]; final["EX" if e == "EX" else "LO" if e == "LO" else "TC"] += 1
        for i in range(len(g)):
            if st[i] in ("EX", "LO"): rows_by[st[i]].append((g.lat[i], g.lon[i], w[i]))
        # the hazard rows: every tropical row north of 15N with what follows it six hours later: a tropical row, an EX row (the transition), an LO row or the end of the track (the system
        # dissipates, over water or land). Cause-specific hazards of the two exits are fitted separately over all the rows at risk
        for i in range(len(g)):
            if st[i] not in TC or g.lat[i] < 15: continue
            if i == len(g) - 1: nxt = "END"
            elif t[i + 1] - t[i] != pd.Timedelta(hours=6): continue
            elif st[i + 1] in TC: nxt = "TC"
            elif st[i + 1] in ("EX", "LO"): nxt = st[i + 1]
            else: continue
            if i > 0 and t[i] - t[i - 1] == pd.Timedelta(hours=6):
                u = (g.lon[i] - g.lon[i - 1]) * 111.2 * np.cos(np.radians((g.lat[i] + g.lat[i - 1]) / 2)) / 6 / 1.852; v = (g.lat[i] - g.lat[i - 1]) * 111.2 / 6 / 1.852
            else: u = v = np.nan
            r = dict(tid=tid, season=int(g.season[i]), time=t[i], lat=float(g.lat[i]), lon=float(g.lon[i]), wind=w[i], event=int(nxt == "EX"), dis=int(nxt in ("LO", "END")), nxt=nxt, u=u, v=v, month=t[i].month,
                     lf=E.land_fraction(land, g.lat[i], g.lon[i]))
            r.update(env.at(t[i], g.lat[i], g.lon[i])); rows.append(r)
        # 24-h wind change of tropical rows at high latitude (the next-day row tropical or EX)
        for i in range(len(g)):
            if st[i] in TC and g.lat[i] >= 33 and i + 4 < len(g) and t[i + 4] - t[i] == pd.Timedelta(hours=24) and (st[i + 4] in TC or st[i + 4] == "EX") and np.isfinite(w[i]) and np.isfinite(w[i + 4]):
                hi_lat.append(dict(w0=w[i], dv=w[i + 4] - w[i], sst=env.at(t[i], g.lat[i], g.lon[i])["sst"], lat=g.lat[i], ex_next=int(st[i + 4] == "EX")))
        # the transition itself: the first EX row after tropical rows
        first_ex = [i for i in range(len(g)) if st[i] == "EX" and any(st[k] in TC for k in range(i))]
        if first_ex:
            i0 = first_ex[0]; p = max(k for k in range(i0) if st[k] in TC); last = len(g) - 1
            sp = np.nan
            if i0 > 0:
                dx = (g.lon[i0] - g.lon[i0 - 1]) * 111.2 * np.cos(np.radians(g.lat[i0])) / 6 / 1.852; dy = (g.lat[i0] - g.lat[i0 - 1]) * 111.2 / 6 / 1.852; sp = float(np.hypot(dx, dy))
            ets.append(dict(lat=g.lat[i0], lon=g.lon[i0], month=t[i0].month, wind=w[i0], wind_prev=w[p], speed=sp, tail_h=(t[last] - t[i0]).total_seconds() / 3600, w_last=w[last], lat_last=g.lat[last], lon_last=g.lon[last],
                            dv24=(w[i0 + 4] - w[i0]) if i0 + 4 <= last else np.nan, dv48=(w[i0 + 8] - w[i0]) if i0 + 8 <= last else np.nan, dv72=(w[i0 + 12] - w[i0]) if i0 + 12 <= last else np.nan,
                            dE=(g.lon[last] - g.lon[i0]) * 111.2 * np.cos(np.radians((g.lat[last] + g.lat[i0]) / 2)), dN=(g.lat[last] - g.lat[i0]) * 111.2,
                            sst=env.at(t[i0], g.lat[i0], g.lon[i0])["sst"], shM=env.at(t[i0], g.lat[i0], g.lon[i0])["shM"]))
        # the remnant-low tail of a storm that does not become extratropical
        if st[-1] != "EX" and last_tc + 1 < len(g) and st[last_tc + 1] == "LO":
            tails.append(dict(tail_h=(t[len(g) - 1] - t[last_tc]).total_seconds() / 3600, w_tail=float(np.nanmean(w[last_tc + 1:])), lat=g.lat[last_tc], w_last_tc=w[last_tc]))
    R = pd.DataFrame(rows); R.to_csv(os.path.join(RAW, "atlantic-tc-et-rows.csv"), index=False)
    ET = pd.DataFrame(ets); TL = pd.DataFrame(tails); HL = pd.DataFrame(hi_lat)
    ns = Y1 - Y0 + 1
    res = dict(meta=dict(named=nnamed, seasons=ns, et_storms=int(len(ET)), hazard_rows=int(len(R)), hazard_events=int(R.event.sum()), source="IBTrACS (huracanpy wheel), ERSST v5, ERA5 shear and deep-layer wind"))
    res["share_of_named"] = round(len(ET) / nnamed, 3)
    res["final_status_share"] = {k: round(v / nnamed, 3) for k, v in final.items()}
    res["first_ex_row"] = dict(lat_q=q(ET.lat), lon_q=q(ET.lon), wind_q=q(ET.wind), wind_prev_q=q(ET.wind_prev), speed_q=q(ET.speed), sst_q=q(ET.sst), shear_monthly_q=q(ET.shM),
                               month_share={int(k): round(v / len(ET), 3) for k, v in ET.month.value_counts().sort_index().items()},
                               wind_by_last_tc_class={name: q(ET[m].wind) for name, m in (("hurricane", ET.wind_prev >= 64), ("storm", (ET.wind_prev >= 34) & (ET.wind_prev < 64)), ("depression", ET.wind_prev < 34))},
                               share_by_last_tc_class={name: round(float(m.mean()), 3) for name, m in (("hurricane", ET.wind_prev >= 64), ("storm", (ET.wind_prev >= 34) & (ET.wind_prev < 64)), ("depression", ET.wind_prev < 34))})
    res["after"] = dict(tail_hours_q=q(ET.tail_h, 0), last_wind_q=q(ET.w_last), last_lat_q=q(ET.lat_last), last_lon_q=q(ET.lon_last), east_km_q=q(ET.dE, 0), north_km_q=q(ET.dN, 0),
                        ends_north_of={str(L): round(float((ET.lat_last >= L).mean()), 3) for L in (50, 55, 60)},
                        dv_kt={k: dict(n=int(ET[k].notna().sum()), q=q(ET[k]), share_ge10=round(float((ET[k].dropna() >= 10).mean()), 3), share_le_m10=round(float((ET[k].dropna() <= -10).mean()), 3)) for k in ("dv24", "dv48", "dv72")})
    res["rows_per_season"] = {}
    for k in ("EX", "LO"):
        a = np.array(rows_by[k], float); la, lo, wd = a[:, 0], a[:, 1], np.nan_to_num(a[:, 2])
        res["rows_per_season"][k] = dict(rows=round(len(a) / ns, 1), wind_q=q(wd), share_ge34=round(float((wd >= 34).mean()), 3), lat_q=q(la), lon_q=q(lo),
                                         by_lat={f"{a0}-{b0}": round(float(((la >= a0) & (la < b0)).sum() / ns), 1) for a0, b0 in ((0, 30), (30, 40), (40, 50), (50, 60), (60, 90))})
    res["remnant_low"] = dict(storms_ending_as_LO_tail=int(len(TL)), tail_hours_q=q(TL.tail_h, 0), tail_wind_mean=round(float(TL.w_tail.mean()), 1), lat_of_last_tc_q=q(TL.lat), wind_at_last_tc_median=float(np.nanmedian(TL.w_last_tc)))
    HL = HL.dropna()
    TCH = []
    for tid, g in j.groupby("track_id", sort=False):
        if g.status.isin(ref.NAMED).any(): TCH += g[(g.status.isin(TC)) & (g.lat >= 33)].wind.dropna().tolist()
    res["tc_rows_north_of_33N"] = dict(per_season=round(len(TCH) / ns, 1), wind_q=q(TCH))
    BANDS = [(15, 20), (20, 25), (25, 30), (30, 35), (35, 40), (40, 50)]
    byb = {}
    for tid, g in j.groupby("track_id", sort=False):
        if not g.status.isin(ref.NAMED).any(): continue
        t_ = g[g.status.isin(TC)]
        for a0, b0 in BANDS: byb.setdefault((a0, b0), []).extend(t_[(t_.lat >= a0) & (t_.lat < b0)].wind.fillna(0).tolist())
    res["tc_wind_by_lat"] = {f"{a0}-{b0}": dict(rows_per_season=round(len(w) / ns, 1), wind_q50=float(np.percentile(w, 50)), wind_q90=float(np.percentile(w, 90)), share_ge96=round(float((np.array(w) >= 96).mean()), 3), share_ge64=round(float((np.array(w) >= 64).mean()), 3)) for (a0, b0), w in byb.items()}
    res["tc_rows_over_land"] = dict(per_season=round(float((R.lf > 0.6).sum()) / ns, 1), north_of_30N=round(float(((R.lf > 0.6) & (R.lat >= 30)).sum()) / ns, 1), note="tropical rows north of 15N with more than 0.6 of their neighbourhood land (the page's mask)")
    res["tc_wind_change_24h_north_of_33N"] = {name: dict(n=int(len(s)), q=q(s.dv), share_le_m20=round(float((s.dv <= -20).mean()), 3)) for name, s in (
        ("wind < 50 kt", HL[HL.w0 < 50]), ("50-79 kt", HL[(HL.w0 >= 50) & (HL.w0 < 80)]), ("80+ kt", HL[HL.w0 >= 80]), ("SST < 22", HL[HL.sst < 22]), ("SST 22-26", HL[(HL.sst >= 22) & (HL.sst < 26)]), ("SST >= 26", HL[HL.sst >= 26]))}
    # the hazard: observed by band, and the regressions
    d = R.dropna(subset=["sst", "shM", "udM", "wind"]); d = d[d.lat >= 20]
    band = lambda col, edges: [dict(lo=a, hi=b, rows=int(len(s)), events=int(s.event.sum()), hazard6h=round(float(s.event.mean()), 4)) for a, b in zip(edges[:-1], edges[1:]) for s in [d[(d[col] >= a) & (d[col] < b)]] if len(s)]
    res["hazard_observed"] = dict(lat=band("lat", [20, 25, 30, 35, 40, 45, 55]), sst=band("sst", [-5, 18, 20, 22, 24, 26, 27, 28, 40]), shear=band("shM", [0, 10, 15, 20, 25, 30, 40, 90]), u_deep=band("udM", [-30, 0, 5, 10, 15, 20, 30, 80]),
                                  wind=band("wind", [0, 30, 40, 50, 65, 85, 200]))
    dd = R.dropna(subset=["sst", "shD", "udD", "wind"]); dd = dd[dd.lat >= 20]
    d = d.copy(); d["shear"] = np.where(d.shD.notna(), d.shD, d.shM) if "shD" in d else d.shM; d["udeep"] = np.where(d.udD.notna(), d.udD, d.udM) if "udD" in d else d.udM
    d2 = d.dropna(subset=["u", "v"]).copy(); d2["speed"] = np.hypot(d2.u, d2.v)
    res["hazard_fit"] = {
        "lat": fit_model(d, ["lat"]), "lat+sst": fit_model(d, ["lat", "sst"]), "lat+sst+shear": fit_model(d, ["lat", "sst", "shear"]), "lat+sst+shear+wind": fit_model(d, ["lat", "sst", "shear", "wind"]),
        "lat+sst+shear+wind+udeep": fit_model(d, ["lat", "sst", "shear", "wind", "udeep"]), "monthly only: lat+sst+shM+wind": fit_model(d, ["lat", "sst", "shM", "wind"]),
        "with the storm's own motion: lat+sst+shear+wind+speed": fit_model(d2, ["lat", "sst", "shear", "wind", "speed"]), "daily 2017-2020: lat+sst+shD+wind": fit_model(dd.assign(shD=dd.shD), ["lat", "sst", "shD", "wind"]),
    }
    res["hazard_mean_motion_kt"] = {f"{a}-{a + 5}N": dict(flip=dict(u=round(float(s[s.event == 1].u.mean()), 1), v=round(float(s[s.event == 1].v.mean()), 1)), stay=dict(u=round(float(s[s.event == 0].u.mean()), 1), v=round(float(s[s.event == 0].v.mean()), 1)))
                                    for a in (25, 30, 35, 40) for s in [d2[(d2.lat >= a) & (d2.lat < a + 5)]]}
    # the other exit: a tropical row over water (a fifth of its neighbourhood or less is land) whose next row is a remnant low or the end of the track
    w = R[R.lf <= 0.2].dropna(subset=["sst", "shM", "wind"]); w = w[w.lat >= 20].copy()
    w["shear"] = np.where(w.shD.notna(), w.shD, w.shM) if "shD" in w else w.shM
    bd = lambda col, edges: [dict(lo=a, hi=b, rows=int(len(x)), ex=int(x.event.sum()), dis=int(x.dis.sum()), ex6h=round(float(x.event.mean()), 4), dis6h=round(float(x.dis.mean()), 4)) for a, b in zip(edges[:-1], edges[1:]) for x in [w[(w[col] >= a) & (w[col] < b)]] if len(x)]
    res["exits_over_water"] = dict(by_lat=bd("lat", [20, 25, 30, 35, 40, 45, 60]), by_wind=bd("wind", [0, 30, 40, 50, 65, 85, 200]), by_sst=bd("sst", [-5, 20, 24, 26, 28, 40]), rows=int(len(w)), ex=int(w.event.sum()), dis=int(w.dis.sum()))
    wd = w.copy(); wd["event"] = wd.dis
    res["dissipation_fit"] = {"lat+wind": fit_model(wd, ["lat", "wind"]), "lat+sst+shear+wind": fit_model(wd, ["lat", "sst", "shear", "wind"]), "sst+wind": fit_model(wd, ["sst", "wind"]), "wind": fit_model(wd, ["wind"])}
    we = w.copy()
    res["transition_fit_over_water"] = {"lat+sst+shear+wind": fit_model(we, ["lat", "sst", "shear", "wind"])}
    print("dissipation (LO or END) over water, rows", len(w), "events", int(w.dis.sum()))
    for k, v in res["dissipation_fit"].items(): print(f"  dis {k:30s} ll {v['loglik']:8.1f} auc {v['auc']:.3f}  b0 {v['intercept']:8.3f}  {v['coef']}  z {v['z']}")
    k, v = next(iter(res["transition_fit_over_water"].items())); print(f"  ex over water {k:24s} ll {v['loglik']:8.1f} auc {v['auc']:.3f}  b0 {v['intercept']:8.3f}  {v['coef']}")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as fh: json.dump(res, fh, separators=(",", ":"))
    print(f"wrote {out_path} ({os.path.getsize(out_path) / 1024:.0f} KB)")
    print("share of named", res["share_of_named"], " first EX lat", res["first_ex_row"]["lat_q"], " wind", res["first_ex_row"]["wind_q"], " tail h", res["after"]["tail_hours_q"])
    for k, v in res["hazard_fit"].items(): print(f"  {k:55s} ll {v['loglik']:8.1f} auc {v['auc']:.3f}  b0 {v['intercept']:8.3f}  {v['coef']}")


if __name__ == "__main__":
    main()
