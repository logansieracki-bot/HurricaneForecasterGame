#!/usr/bin/env python3
"""Calibrates the DAY-TO-DAY part of the steering field and of the sea-level pressure field against the real
daily ERA5 data (5 years, 2017-2021), for one basin box. make_steer.py builds the slow part (monthly
climatology, joint EOFs, ENSO); this builds what rides on top of it. Four ingredients, each measured here
and checked against the real data before the client uses it:

  1. PRESSURE WEATHER. The daily pressure anomaly P' (the daily value minus that year-month's own mean, so the
     monthly part stays in make_steer.py's EOFs) is a field of highs and lows that travel. Measured per latitude
     band: its standard deviation (a map per calendar month), its correlation length, and how fast the pattern
     moves. The highs the app draws ("H 1026") are the maxima of climatology + EOF/ENSO anomaly + P'.
  2. COUPLING. The layer winds answer to that pressure pattern roughly geostrophically: the wind anomaly is alpha
     times the geostrophic wind of P' (north of 20 degrees alpha is 0.7-0.8 for the shallow layer, 0.7 for the
     deep one, and the pattern explains 55-75% / 25-35% of their variance; in the deep tropics it is weak).
     alpha is fitted per latitude band by regression over the TC-masked daily anomalies.
  3. JET RIBBON. The real jet axis (traced exactly as make_shear_jet.py does) carries a westerly ribbon: the
     steering wind along the axis is far stronger than away from it. The along-axis profile is measured as a
     composite re-centred on each day's own axis (its excess over the far field either side). The client adds
     it along the SAME axis that draws the jet line and the Wind Shear ribbon, pointing along the axis' local
     direction, so arrows hug the jet and swing north-east ahead of troughs; the mean ribbon the simulation itself
     produces is subtracted again (tools/calibrate_steer_means.mjs), so the climate mean stays the real one.
  4. WHAT IS LEFT. After the pressure-driven part and the ribbon are taken out, the residual flow is what no
     surface feature explains (upper-level troughs, tropical waves). It is calibrated as a rotational (streamfunction)
     wave field: rms speed per node and calendar month, the ratio of the shallow to the deep residual, and the
     length scale per band (the u- and v-correlation lengths of a non-divergent isotropic field pin it down; the
     measured ones sit in the ratio 1.8-2.1 that such a field has).

Hurricanes' own circulation is masked out of every statistic (8 degree discs around pressure minima below
1003 hPa between 5 and 40 degrees latitude; 0.8% of the Atlantic's grid-days) so what is calibrated is the
ENVIRONMENT the storm model will later steer in.

Usage: python3 tools/make_steer_weather.py <basin> <lon0> <lon1> <lat0> <lat1> <jet months e.g. 6,7,8,9,10,11> <band lo,hi> [--no-extend]
  e.g. python3 tools/make_steer_weather.py atlantic -110 40 -40 72 6,7,8,9,10,11 20,65 --no-extend
"""
import json
import os
import sys

import numpy as np
from scipy.ndimage import minimum_filter, uniform_filter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import climate_lib as cl
import make_shear_jet as msj

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
YEARS = (2017, 2021)
GRID_STEP = 2
RHO, OMEGA, R_EARTH, KT = 1.2, 7.292e-5, 6.371e6, 1.943844
F_FLOOR_DEG = 15.0                # the geostrophic wind uses f at max(|lat|, 15 deg): the pressure-wind relation is empirical near the equator, alpha absorbs it
BAND_EDGES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 90]   # |latitude| bands for alpha, kappa
PROFILE_OFFSETS = np.arange(0, 15, 2.0)       # degrees from the axis; the ribbon is 0 from 14 on
SUPPORT_DEG = 14.0


def box_arrays(lon0, lon1, lat0, lat1):
    sst = cl.load(os.path.join(ROOT, "data", "raw", "ersstv5.nc"))
    daily = cl.load_era5_steer_daily(sst["lat"], sst["lon"], *YEARS)
    slp = cl.load_era5_mslp(sst["lat"], sst["lon"], *YEARS, freq="D")
    src = {"u_s": daily["u_shallow"], "v_s": daily["v_shallow"], "u_d": daily["u_deep"], "v_d": daily["v_deep"], "p": slp}
    out, times = {}, None
    for f, a in src.items():
        b, cnx, cny = cl.extract_box(a, lon0, lon1, lat0, lat1)
        b = b.transpose("time", "lat", "lon")
        out[f] = b.values.astype("float64")
        times = b["time"].values
        lat, lon = b["lat"].values, b["lon"].values
    # A box that crosses the dateline carries the labels 160..178, -180..-120 (South Pacific); unwrap them to 160..240 so that
    # distances, the longitude sector and the TC discs below are measured on a continuous axis. A no-op for every other box.
    lon = np.where(lon < lon0, lon + 360.0, lon)
    return out, times, lat, lon


def year_month_anomalies(x, ym):
    a = x.copy()
    for k in np.unique(ym):
        m = ym == k
        a[m] -= x[m].mean(axis=0)
    return a


def tc_mask(p, lat, lon, lon_lo, lon_hi):
    T = p.shape[0]
    LA, LO = np.meshgrid(lat, lon, indexing="ij")
    mask = np.zeros(p.shape, bool)
    for t in range(T):
        ps = uniform_filter(p[t], size=3, mode="nearest")
        mn = minimum_filter(ps, size=5, mode="nearest")
        ii, jj = np.where((ps == mn) & (ps < 1003.0) & (np.abs(LA) >= 5) & (np.abs(LA) <= 40) & (LO >= lon_lo) & (LO <= lon_hi))
        for i, j in zip(ii, jj):
            mask[t] |= np.hypot(LA - lat[i], (LO - lon[j]) * np.cos(np.radians(lat[i]))) <= 8.0
    return mask


def geostrophic(pa, lat, lon):
    """Geostrophic wind (kt) of a pressure field in Pa on the (north-first) 2 degree grid. f is held at its 15 degree value inside 15 degrees."""
    phi = np.radians(lat)[None, :, None]
    fe = 2 * OMEGA * np.sign(np.sin(phi)) * np.sin(np.maximum(np.abs(phi), np.radians(F_FLOOR_DEG)))
    fe = np.where(np.abs(fe) < 1e-9, 2 * OMEGA * np.sin(np.radians(F_FLOOR_DEG)), fe)      # the equator row: any finite value, alpha is ~0 there
    dlat = np.radians(abs(lat[0] - lat[1])); dlon = np.radians(abs(lon[1] - lon[0]))
    dpdy = np.gradient(pa, -dlat * np.sign(lat[0] - lat[1]), axis=1) / R_EARTH if lat[0] > lat[1] else np.gradient(pa, dlat, axis=1) / R_EARTH
    dpdx = np.gradient(pa, dlon, axis=2) / (R_EARTH * np.cos(phi))
    return -dpdy / (RHO * fe) * KT, dpdx / (RHO * fe) * KT


def ribbon_vectors(axis_s, lat_nodes, col_idx, profile):
    """Ribbon wind (u, v), kt, at the 4 degree nodes for every day: profile(|offset|) along the axis' local direction.
    axis_s: (T, cnx) smoothed axis latitude on the 2 degree columns; col_idx: the node columns' indices in it."""
    T = axis_s.shape[0]
    a = axis_s[:, col_idx]                                                       # (T, nodes_x)
    ap, am = axis_s[:, np.minimum(col_idx + 1, axis_s.shape[1] - 1)], axis_s[:, np.maximum(col_idx - 1, 0)]
    span = (np.minimum(col_idx + 1, axis_s.shape[1] - 1) - np.maximum(col_idx - 1, 0)) * 2.0
    slope = (ap - am) / span                                                     # deg lat per deg lon
    d = np.abs(lat_nodes[None, :, None] - a[:, None, :])                         # (T, ny, nx)
    mag = np.interp(d, np.r_[PROFILE_OFFSETS, SUPPORT_DEG + 100], np.r_[profile, 0.0])
    mag = np.where(d >= SUPPORT_DEG, 0.0, mag)
    coslat = np.cos(np.radians(lat_nodes))[None, :, None]
    norm = np.sqrt(coslat ** 2 + slope[:, None, :] ** 2)
    return mag * coslat / norm, mag * slope[:, None, :] / norm



WAVE_BANDS = [(5, 15, 10.0), (15, 25, 20.0), (25, 35, 30.0), (35, 45, 40.0), (45, 60, 52.0)]    # |lat| range and centre of the five bands the wave fields are built from
FALLBACK_C_P = [-4.0, -3.0, 12.0, 19.0, 19.0]      # m/s eastward; used where the measured pattern speed is not trustworthy (see band_scales)
FALLBACK_C_R = [-11.0, -3.0, 8.0, 9.0, 8.5]
KM = 111.2


def _corr_efold(arr, mask, li, cols, step_km):
    """e-fold distance (km) of the lag correlation along longitude, pooled over the band, sector and days (TC samples masked)."""
    x = np.where(mask[:, li, :][:, :, cols], np.nan, arr[:, li, :][:, :, cols])
    x = x - np.nanmean(x)
    var = np.nanmean(x * x)
    prev = 1.0
    kmax = min(40, x.shape[2] - 4)         # a lag has to leave a few columns to correlate
    for k in range(1, kmax):
        c = np.nanmean(x[:, :, : x.shape[2] - k] * x[:, :, k:]) / var
        if c < 1 / np.e:
            return (k - 1 + (prev - 1 / np.e) / (prev - c)) * step_km
        prev = c
    # The correlation never fell below 1/e inside the sector (the tropical pressure anomaly over the Pacific is larger than a
    # window this wide): the pattern is bigger than the window, so the window's own length is a lower bound -- and the
    # honest answer, since a wave this long is nearly uniform across the basin.
    return (kmax - 1) * step_km


def _speed(arr, mask, li, cols, lat_mid, sep):
    """Pattern speed (m/s, + eastward) from the lag of the maximum daily cross-correlation between columns `sep` apart (parabolic peak)."""
    x = np.where(mask[:, li, :][:, :, cols], np.nan, arr[:, li, :][:, :, cols])
    x = x - np.nanmean(x)
    var = np.nanmean(x * x)
    taus = list(range(-4, 5))
    cors = []
    for tau in taus:
        if tau >= 0:
            a, b = x[: x.shape[0] - tau, :, : x.shape[2] - sep], x[tau:, :, sep:]
        else:
            a, b = x[-tau:, :, : x.shape[2] - sep], x[: x.shape[0] + tau, :, sep:]
        cors.append(np.nanmean(a * b) / var)
    cors = np.array(cors)
    i = int(np.argmax(cors))
    if 0 < i < len(taus) - 1:
        y0, y1, y2 = cors[i - 1], cors[i], cors[i + 1]
        tau = (taus[i] + 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2)) * 86400.0
    else:
        tau = taus[i] * 86400.0
    dx = sep * 2.0 * KM * 1000 * np.cos(np.radians(lat_mid))
    return dx / tau if abs(tau) > 1 else 0.0


def band_scales(Pa, Ru, Rv, mask, lat, lon, cols):
    """Length scale (km) and pattern speed of the pressure anomaly and of the residual flow, per |lat| band. A ring-spectrum isotropic wave
    field has J0(k r) pressure correlations (e-fold at k r = 1.75) and, for its non-divergent winds, e-fold lengths 2.59/k (along-wind, u along x)
    and 1.37/k (across-wind, v along x); the measured u and v lengths sit in that 1.8-2.1 ratio, so the wavelength follows from either."""
    alat = np.abs(lat)
    out = {"lat": [], "lamP": [], "lamR": [], "cP": [], "cR": [], "measuredP": [], "measuredR": [], "LP": [], "Lu": [], "Lv": []}
    for (a0, a1, mid), fp, fr in zip(WAVE_BANDS, FALLBACK_C_P, FALLBACK_C_R):
        li = np.where((alat >= a0) & (alat < a1))[0]
        step = 2.0 * KM * np.cos(np.radians(mid))
        LP, Lu, Lv = _corr_efold(Pa, mask, li, cols, step), _corr_efold(Ru, mask, li, cols, step), _corr_efold(Rv, mask, li, cols, step)
        kP = 1.75 / LP; kR = 0.5 * (2.59 / Lu + 1.37 / Lv)
        cp = float(np.median([_speed(Pa, mask, li, cols, mid, s) for s in (4, 5)])); cr = float(np.median([_speed(Rv, mask, li, cols, mid, s) for s in (4, 5)]))
        # Pressure: trust a measurement only where the pattern moves coherently (mid-latitudes); the tropical P' is a slow, very large-scale blob.
        # Flow: south of 25 degrees the deep-layer residual mixes westward easterly waves with eastward upper troughs, and the layer below (which the
        # shallow arrows follow) is the westward one that matters for weak storms, so there the measured westward speed is used and a measured eastward one is not.
        okp, okr = abs(cp) <= 30 and (a0 >= 30 or abs(cp) < 15), abs(cr) <= 25 and (a0 >= 25 or (a0 < 15 and cr < 0))
        out["lat"].append(mid); out["LP"].append(round(LP)); out["Lu"].append(round(Lu)); out["Lv"].append(round(Lv))
        out["lamP"].append(round(2 * np.pi / kP)); out["lamR"].append(round(2 * np.pi / kR))
        out["cP"].append(round(cp if okp else fp, 1)); out["cR"].append(round(cr if okr else fr, 1)); out["measuredP"].append(bool(okp)); out["measuredR"].append(bool(okr))
        print(f"  band {a0:2d}-{a1:<2d}: P' e-fold {LP:5.0f} km -> wavelength {2 * np.pi / kP:6.0f} km, speed {cp:6.1f} m/s ({'measured' if okp else 'fallback ' + str(fp)}) | residual u/v e-fold {Lu:5.0f}/{Lv:4.0f} km -> wavelength {2 * np.pi / kR:5.0f} km, speed {cr:6.1f} m/s ({'measured' if okr else 'fallback ' + str(fr)})")
    return out


def build(basin, lon0, lon1, lat0, lat1, months, band=(20, 65), extend=True, out_dir=None):
    # Everything is measured on the ANALYSIS box -- the displayed rows plus the whole jet search band and the ribbon's support, exactly as
    # make_shear_jet.py does, because most basins' boxes do not contain the jet -- and only the per-node maps shipped at the end are cut back
    # to the displayed rows (r0 = first displayed row inside the analysis box, cny = how many there are). With --no-extend the two boxes are one.
    elat0, elat1 = msj.analysis_lat_range(lat0, lat1, band, extend)
    X, times, lat, lon = box_arrays(lon0, lon1, elat0, elat1)
    r0 = int(round((elat1 - lat1) / cl.CRES)); cny = int(round((lat1 - lat0) / cl.CRES)) + 1
    lon_hi = float(lon[-1])
    T = len(times)
    ym = np.array([int(str(t)[:4]) * 100 + int(str(t)[5:7]) for t in times.astype("datetime64[D]")])
    mon = ym % 100
    A = {k: year_month_anomalies(v, ym) for k, v in X.items()}
    mask = tc_mask(X["p"], lat, lon, lon0, lon_hi)
    print(f"days {T}, grid {len(lat)}x{len(lon)}, TC-masked samples {mask.mean() * 100:.2f}%")
    Gu, Gv = geostrophic(A["p"] * 100.0, lat, lon)

    # ---- the jet axis on every day (all months), traced exactly as make_shear_jet.py does for the shear ribbon
    AN = msj.load_analysis(lon0, lon1, lat0, lat1, list(range(1, 13)), band, extend)
    axis = AN["axis_lat"]                                                          # (T, cnx) on the analysis box's 2 degree columns
    assert axis.shape[0] == T, (axis.shape, T)
    def runmean(a, n=5):
        k = np.ones(n) / n; pad = n // 2
        return np.stack([np.convolve(np.pad(r, pad, mode="edge"), k, mode="valid") for r in a])
    axis_s = runmean(axis, 5)
    lat_nodes, col_idx = lat[::GRID_STEP], np.arange(0, len(lon), GRID_STEP)
    season = np.isin(mon, months)

    # ---- ribbon profile: along-axis component of each layer's wind, composite re-centred on each day's axis (season days), symmetrised, excess over the far field
    lay = {"shallow": (X["u_s"], X["v_s"]), "deep": (X["u_d"], X["v_d"])}
    offs = np.arange(-16, 16.1, 2.0)
    prof = {}
    jsel = np.arange(2, len(lon) - 2)
    blo, bhi = sorted(abs(x) for x in band)
    for L, (U, V) in lay.items():
        acc = np.zeros(len(offs)); cnt = np.zeros(len(offs))
        for t in np.where(season)[0]:
            for j in jsel:
                a = axis_s[t, j]
                if abs(a) < blo + 5 or abs(a) > bhi - 7:          # the axis counts where the whole profile fits inside the band it is traced in
                    continue
                slope = (axis_s[t, j + 1] - axis_s[t, j - 1]) / 4.0
                c = np.cos(np.radians(a)); n = np.hypot(c, slope); tx, ty = c / n, slope / n
                la = a + offs
                ok = (la >= lat[-1]) & (la <= lat[0])
                u = np.interp(-la, -lat, U[t, :, j]) if lat[0] > lat[-1] else np.interp(la, lat, U[t, :, j])
                v = np.interp(-la, -lat, V[t, :, j]) if lat[0] > lat[-1] else np.interp(la, lat, V[t, :, j])
                acc[ok] += (u * tx + v * ty)[ok]; cnt[ok] += 1
        p = acc / np.maximum(cnt, 1)
        sym = np.array([0.5 * (p[np.argmin(np.abs(offs - d))] + p[np.argmin(np.abs(offs + d))]) for d in PROFILE_OFFSETS])
        far = 0.5 * (0.5 * (p[np.argmin(np.abs(offs - 16))] + p[np.argmin(np.abs(offs + 16))]) + 0.5 * (p[np.argmin(np.abs(offs - 14))] + p[np.argmin(np.abs(offs + 14))]))
        prof[L] = np.maximum(sym - far, 0.0)
        prof[L][-1] = 0.0
        print(f"  ribbon profile {L}: excess along-axis kt at 0,2,..,12 deg: {np.round(prof[L], 1).tolist()}   (far field {far:.1f} kt, n={int(cnt.max())})")

    # ---- remove the real ribbon (day minus its year-month mean), then fit alpha per |lat| band on what is left
    rib = {}
    for L in lay:
        ru, rv = ribbon_vectors(axis_s, lat_nodes, col_idx, prof[L])
        ru = year_month_anomalies(ru, ym); rv = year_month_anomalies(rv, ym)
        rib[L] = (ru, rv)
    def up(a):                                                                      # 4 deg nodes -> 2 deg grid by repetition (statistics only)
        return np.repeat(np.repeat(a, 2, axis=1), 2, axis=2)[:, : len(lat), : len(lon)]
    Vn = {"shallow": (A["u_s"] - up(rib["shallow"][0]), A["v_s"] - up(rib["shallow"][1])), "deep": (A["u_d"] - up(rib["deep"][0]), A["v_d"] - up(rib["deep"][1]))}
    sec = (lon >= lon0 + 6) & (lon <= lon_hi - 6)
    alat = np.abs(lat)
    alpha = {"shallow": [], "deep": []}; kappa = []; band_rows = []
    centers = []
    for a0, a1 in zip(BAND_EDGES[:-1], BAND_EDGES[1:]):
        li = np.where((alat >= a0) & (alat < a1))[0]
        if len(li) < 1: continue
        sl = np.ix_(range(T), li, np.where(sec)[0]); ok = ~mask[sl]
        if ok.sum() < 2000: continue
        g = np.stack([Gu[sl][ok], Gv[sl][ok]], 1)
        # SH rows have f<0 already in G, so the same alpha applies in both hemispheres
        row = {"a0": a0, "a1": a1}; res = {}
        for L, (u, v) in Vn.items():
            w = np.stack([u[sl][ok], v[sl][ok]], 1)
            al = float((w * g).sum() / (g * g).sum()); r2 = float(1 - ((w - al * g) ** 2).sum() / (w ** 2).sum())
            row[L] = [al, r2]; res[L] = w - al * g
        row["stdP"] = float(A["p"][sl][ok].std()); row["Rd"] = float(np.sqrt((res["deep"] ** 2).sum(1).mean())); row["Rs"] = float(np.sqrt((res["shallow"] ** 2).sum(1).mean()))
        row["corrR"] = float(np.corrcoef(res["shallow"].ravel(), res["deep"].ravel())[0, 1])
        band_rows.append(row); centers.append(0.5 * (a0 + min(a1, 75)))
        print(f"  |lat| {a0:2d}-{a1:<2d}: P' std {row['stdP']:5.2f} hPa | alpha shallow {row['shallow'][0]:.2f} (r2 {row['shallow'][1]:.2f}), deep {row['deep'][0]:.2f} ({row['deep'][1]:.2f}) | residual rms deep {row['Rd']:5.1f} shallow {row['Rs']:5.1f} kt (corr {row['corrR']:.2f})")

    # ---- standard deviation maps per calendar month on the 4 degree nodes: P' (hPa) and the deep residual's rms speed (kt)
    Rd_u = Vn["deep"][0] - np.interp(np.abs(lat), centers, [r["deep"][0] for r in band_rows])[None, :, None] * Gu
    Rd_v = Vn["deep"][1] - np.interp(np.abs(lat), centers, [r["deep"][0] for r in band_rows])[None, :, None] * Gv
    waves = band_scales(A["p"], Rd_u, Rd_v, mask, lat, lon, np.where(sec)[0])
    ny, nx = len(range(0, cny, GRID_STEP)), len(col_idx)
    sigP = np.zeros((12, ny, nx)); sigR = np.zeros((12, ny, nx))
    Pm = np.where(mask, np.nan, A["p"]); Rm = np.where(mask, np.nan, Rd_u ** 2 + Rd_v ** 2)
    for m in range(1, 13):
        sel = mon == m
        sp = np.sqrt(np.nanmean(Pm[sel] ** 2, axis=0)); sr = np.sqrt(np.nanmean(Rm[sel], axis=0))
        # smooth over a 3x3 block of 2-degree cells, then take the 4-degree nodes
        sp = uniform_filter(np.nan_to_num(sp, nan=np.nanmean(sp)), size=3, mode="nearest"); sr = uniform_filter(np.nan_to_num(sr, nan=np.nanmean(sr)), size=3, mode="nearest")
        sigP[m - 1] = sp[r0:r0 + cny:GRID_STEP, ::GRID_STEP]; sigR[m - 1] = sr[r0:r0 + cny:GRID_STEP, ::GRID_STEP]
    for arr in (sigP, sigR):                                                      # 1-2-1 smoothing across neighbouring months (cyclic)
        arr[:] = 0.25 * np.roll(arr, 1, axis=0) + 0.5 * arr + 0.25 * np.roll(arr, -1, axis=0)
    print(f"  sigma P' (hPa) month 1/7: {sigP[0].mean():.2f}/{sigP[6].mean():.2f}   map max {sigP.max():.1f}   sigma R (kt) month 1/7: {sigR[0].mean():.1f}/{sigR[6].mean():.1f}   map max {sigR.max():.1f}")

    # ---- calibration-only target (not shipped): the real DAY-TO-DAY wind variance per calendar month and node, u^2 + v^2 summed, both layers.
    # sigR above is only a first estimate of the residual's size (it is what is left after removing the pressure-driven part and the ribbon, and
    # those two removals are not exactly what the simulation adds back); tools/calibrate_steer_means.mjs closes the budget in the simulation itself:
    # (real year-to-year variance + this) minus the variance of everything the simulation adds except the residual is the residual's variance.
    def month_var(Uu, Vv):
        Q = np.where(mask, np.nan, Uu ** 2 + Vv ** 2)
        out = np.zeros((12, ny, nx))
        for m in range(1, 13):
            q = np.nanmean(Q[mon == m], axis=0)
            q = uniform_filter(np.nan_to_num(q, nan=np.nanmean(q)), size=3, mode="nearest")
            out[m - 1] = q[r0:r0 + cny:GRID_STEP, ::GRID_STEP]
        return 0.25 * np.roll(out, 1, axis=0) + 0.5 * out + 0.25 * np.roll(out, -1, axis=0)
    var_daily = np.stack([month_var(A["u_s"], A["v_s"]), month_var(A["u_d"], A["v_d"])], axis=1)      # (12, 2 [shallow, deep], ny, nx)
    calib_path = os.path.join(out_dir or os.path.join(ROOT, "data", "generated"), f"{basin}-steer-calib.json")
    calib = json.load(open(calib_path)) if os.path.exists(calib_path) else {}
    calib["varDaily"] = [[np.round(var_daily[m, i].ravel(), 2).tolist() for i in range(2)] for m in range(12)]
    json.dump(calib, open(calib_path, "w"))
    print(f"  day-to-day wind variance targets (u^2+v^2, kt^2) month 8, deep: mean {var_daily[7, 1].mean():.0f}  (wrote {os.path.basename(calib_path)})")

    out = {
        "alpha": {"lat": [round(c, 1) for c in centers], "shallow": [round(r["shallow"][0], 3) for r in band_rows], "deep": [round(r["deep"][0], 3) for r in band_rows],
                  "r2Shallow": [round(r["shallow"][1], 3) for r in band_rows], "r2Deep": [round(r["deep"][1], 3) for r in band_rows]},
        "kappa": {"lat": [round(c, 1) for c in centers], "shallow": [round(r["Rs"] / r["Rd"], 3) for r in band_rows]},
        "ribbon": {"offsets": PROFILE_OFFSETS.tolist(), "shallow": [round(float(x), 2) for x in prof["shallow"]], "deep": [round(float(x), 2) for x in prof["deep"]]},
        "waves": waves,
        "sigP": cl.encode_i16(sigP, 100), "sigR": cl.encode_i16(sigR, 100),
    }
    out_dir = out_dir or os.path.join(ROOT, "data", "generated")
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, f"{basin}-steer-weather.json")
    json.dump(out, open(dest, "w"))
    print(f"wrote {dest}")
    return out


if __name__ == "__main__":
    a = [x for x in sys.argv[1:] if not x.startswith("--")]
    if len(a) < 7:
        sys.exit(__doc__)
    band = tuple(float(x) for x in a[6].split(","))
    build(a[0], float(a[1]), float(a[2]), float(a[3]), float(a[4]), [int(m) for m in a[5].split(",")], band, "--no-extend" not in sys.argv)
