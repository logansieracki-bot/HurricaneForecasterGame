#!/usr/bin/env python3
"""Phase 1 of the steering field (and of the sea-level pressure field the highs live in): the real monthly
climatology, joint EOF variability and an ENSO regression of the layer-mean winds and mean sea level
pressure, for one basin box. Same recipe as make_shear.py / make_humidity.py -- "analogs" in the sense
the rest of the app uses the word -- with three differences that matter for a VECTOR field:

  * The EOFs are JOINT: one state vector holds the shallow (850-700 hPa) and deep (850-200 hPa)
    layer winds (u and v of each) and the sea-level pressure, each field scaled by its own standard
    deviation so none of them dominates. The principal components are therefore shared, and the
    patterns keep the real coupling between pressure and flow (a stronger subtropical high comes with
    stronger trades south of it and stronger westerlies north of it) and between the layers. The medium
    layer (850-500) is not stored: it is 0.68 x shallow + 0.32 x deep to within 1 kt (R^2 0.98-0.99, see
    MEDIUM_WEIGHT), so the client blends it.
  * The ENSO coefficients come from climate_lib.enso_regression_lagsum(): the three lag weights are
    fitted TOGETHER, so a sustained event produces the response it really has instead of the 1.7-2.8x
    the older one-lag-at-a-time fit gives (relevant now that ENSO can be held at a value).
  * The EOFs are fitted on all months together, so on their own every month would get the same year-to-year
    spread -- but the real spread has a strong seasonal cycle (the deep-layer wind at 25-35N varies by 3.4 kt
    from year to year in August and 11.4 kt in February; 7.3 pooled). Each month's EOF contribution is therefore
    rescaled node by node (eofAmp) so that EOF + ENSO reproduce the real interannual variance of that month.
  * The field lives on a 4 degree grid (every second ERSST node). Steering flow and pressure patterns are
    ~1000 km features, so 4 degrees loses nothing the arrows can show, and the file stays small. The
    client interpolates bicubically.

Everything the day-to-day weather adds on top (the jet ribbon, travelling pressure and flow waves) is
calibrated separately (make_steer_weather.py) against the real DAILY fields.

Usage: python3 tools/make_steer.py <basin> <lon0> <lon1> <lat0> <lat1> [K]
  e.g. python3 tools/make_steer.py atlantic -110 40 -40 72 8
"""
import json
import os
import sys

import numpy as np
from scipy.ndimage import uniform_filter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import climate_lib as cl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STEER_YEARS = (2007, 2021)       # same window shear/humidity use (the Nino 3.4 predictor stops at 2021)
FIELDS = ["u_shallow", "v_shallow", "u_deep", "v_deep", "mslp"]
GRID_STEP = 2                    # every second node of the 2 degree ERSST grid -> 4 degrees
MEDIUM_WEIGHT = 0.68             # medium layer ~ MEDIUM_WEIGHT * shallow + (1 - MEDIUM_WEIGHT) * deep
SLP_OFFSET = 1000.0              # hPa, subtracted before int16 packing
AMP_MIN, AMP_MAX = 0.25, 2.5     # limits of the seasonal EOF amplitude factor


def month_clim(vals, months):
    return np.stack([vals[months == m].mean(axis=0) for m in range(1, 13)])


def build(basin, lon0, lon1, lat0, lat1, k=8, out_dir=None):
    sst = cl.load(os.path.join(ROOT, "data", "raw", "ersstv5.nc"))
    mon = cl.load_era5_steer_monthly(sst["lat"], sst["lon"], *STEER_YEARS)
    slp = cl.load_era5_mslp(sst["lat"], sst["lon"], *STEER_YEARS, freq="M")
    src = {f: (slp if f == "mslp" else mon[f]) for f in FIELDS}

    boxes, times = {}, None
    for f in FIELDS:
        box, cnx2, cny2 = cl.extract_box(src[f], lon0, lon1, lat0, lat1)
        box = box.sel(time=slice(f"{STEER_YEARS[0]}-01-01", f"{STEER_YEARS[1]}-12-31"))
        box = box.isel(lat=slice(0, None, GRID_STEP), lon=slice(0, None, GRID_STEP))
        boxes[f] = box.transpose("time", "lat", "lon")
        times = boxes[f]["time"].values
    ny, nx = boxes[FIELDS[0]].sizes["lat"], boxes[FIELDS[0]].sizes["lon"]
    N, F, T = ny * nx, len(FIELDS), len(times)
    months = boxes[FIELDS[0]]["time"].dt.month.values
    raw = np.stack([boxes[f].values.reshape(T, N) for f in FIELDS], axis=1)      # (T, F, N)
    assert np.isfinite(raw).all(), "ERA5 has values over land too; a NaN here means a bad regrid"

    clim = np.stack([month_clim(raw[:, i, :], months) for i in range(F)], axis=1)  # (12, F, N)
    anom = raw - clim[months - 1]                                                   # (T, F, N)
    wf = 1.0 / np.sqrt((anom ** 2).mean(axis=(0, 2)))                               # per-field weight: 1 / rms anomaly
    A = (anom * wf[None, :, None]).reshape(T, F * N)
    patterns, pcs, phi = cl.compute_eofs(A, k)
    k = patterns.shape[0]
    patterns = patterns.reshape(k, F, N) / wf[None, :, None]                        # back to kt / hPa per +1 sigma of the PC

    s = np.linalg.svd(A, compute_uv=False)
    cum = np.cumsum(s ** 2) / np.sum(s ** 2)

    n34_times, n34_anom = cl.nino34_index(sst)
    enso = cl.enso_regression_lagsum(anom.reshape(T, F * N), times, n34_times, n34_anom).reshape(3, F, N)
    enso_old = cl.enso_regression(anom.reshape(T, F * N), times, n34_times, n34_anom).reshape(3, F, N)   # for the report only

    # ---- seasonal amplitude of the EOF part, so that EOF + ENSO reproduce each calendar month's real interannual variance
    n34_sel = (np.asarray(n34_times) >= np.datetime64(f"{STEER_YEARS[0]}-01-01")) & (np.asarray(n34_times) <= np.datetime64(f"{STEER_YEARS[1]}-12-31"))
    n34_var = float(np.asarray(n34_anom)[n34_sel].var())
    var_m = np.stack([anom[months == m].var(axis=0, ddof=1) for m in range(1, 13)])               # (12, F, N): variance over the years of month m's mean anomaly
    v_enso = enso.sum(axis=0) ** 2 * n34_var                                                       # (F, N): what the sustained-event response contributes
    v_eof = (patterns ** 2).sum(axis=0)                                                            # (F, N): the EOF part's variance with unit-variance PCs
    amp = np.sqrt(np.clip((var_m - v_enso[None]) / np.maximum(v_eof[None], 1e-9), AMP_MIN ** 2, AMP_MAX ** 2))
    amp = uniform_filter(amp.reshape(12, F, ny, nx), size=(1, 1, 3, 3), mode="nearest")            # 15 years per month is a noisy variance: smooth over neighbouring nodes ...
    amp = 0.25 * np.roll(amp, 1, axis=0) + 0.5 * amp + 0.25 * np.roll(amp, -1, axis=0)             # ... and over neighbouring months (cyclic)
    amp = amp.reshape(12, F, N)

    def pack(a, scale, offset=0.0):
        return cl.encode_i16(a - offset, scale)

    is_slp = np.array([f == "mslp" for f in FIELDS])
    clim_p = clim.copy(); clim_p[:, is_slp, :] -= SLP_OFFSET
    span = ((lon1 + 360) if lon1 < lon0 else lon1) - lon0
    out = {
        "domain": {"lon0": lon0, "lon1": lon1, "lat0": lat0, "lat1": lat1, "res": cl.CRES * GRID_STEP, "nx": nx, "ny": ny, "span": span},
        "fields": FIELDS,
        "mediumWeight": MEDIUM_WEIGHT,
        "K": k,
        "clim": cl.encode_i16(clim_p, 10),        # (12, F, N): kt * 10, hPa-1000 * 10
        "eof": cl.encode_i16(patterns, 1000),     # (K, F, N): per +1 sigma PC, * 1000
        "enso": cl.encode_i16(enso, 1000),        # (3, F, N): per degC Nino 3.4 at lag 0/3/6 months, * 1000; the three sum to the sustained-event response
        "eofAmp": cl.encode_i16(amp, 1000),       # (12, F, N): factor on the EOF part by calendar month, * 1000
        "phi": [round(float(x), 4) for x in phi],
    }
    out_dir = out_dir or os.path.join(ROOT, "data", "generated")
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, f"{basin}-steer.json")
    with open(dest, "w") as f:
        json.dump(out, f)

    # calibration-only targets (not shipped): the real interannual variance per month, summed over u and v, for the shallow and deep layer
    iu_s, iv_s, iu_d, iv_d = (FIELDS.index(f) for f in ("u_shallow", "v_shallow", "u_deep", "v_deep"))
    calib = {"varInt": [[np.round(var_m[m, iu_s] + var_m[m, iv_s], 2).tolist(), np.round(var_m[m, iu_d] + var_m[m, iv_d], 2).tolist()] for m in range(12)]}
    with open(os.path.join(out_dir, f"{basin}-steer-calib.json"), "w") as f:
        json.dump(calib, f)

    print(f"wrote {dest}   grid {nx}x{ny} @ {cl.CRES * GRID_STEP} deg, K={k}, T={T} months")
    lat_n = boxes[FIELDS[0]]["lat"].values
    rows = ", ".join(f"{a0}-{a1}N" for a0, a1 in ((15, 30), (30, 45), (45, 60)))
    print(f"  seasonal EOF amplitude (deep-layer u, mean over bands {rows}), months 1..12:")
    for a0, a1 in ((15, 30), (30, 45), (45, 60)):
        li = np.where((lat_n >= a0) & (lat_n < a1))[0]
        a4 = amp.reshape(12, F, ny, nx)[:, iu_d][:, li].mean(axis=(1, 2))
        print(f"    {a0}-{a1}N: " + " ".join(f"{x:.2f}" for x in a4))
    print("  joint-EOF cumulative variance (weighted state):", " ".join(f"{c * 100:.0f}" for c in cum[:12]), "%  (k=1..12)")
    print("  weights 1/rms anomaly:", {f: round(float(w), 3) for f, w in zip(FIELDS, wf)})
    print("  phi (monthly persistence of each mode):", out["phi"])
    for i, f in enumerate(FIELDS):
        c = clim[:, i, :]
        print(f"  clim {f}: {c.min():.1f}..{c.max():.1f}   eof peak {np.abs(patterns[:, i, :]).max():.2f}   enso(sum of lags) peak {np.abs(enso[:, i, :].sum(0)).max():.2f}  (old one-lag-at-a-time sum {np.abs(enso_old[:, i, :].sum(0)).max():.2f})")
    return out, dict(lat=boxes[FIELDS[0]]["lat"].values, lon=boxes[FIELDS[0]]["lon"].values, enso=enso, enso_old=enso_old, clim=clim, patterns=patterns, nx=nx, ny=ny)


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) < 5:
        sys.exit(__doc__)
    build(a[0], float(a[1]), float(a[2]), float(a[3]), float(a[4]), int(a[5]) if len(a) > 5 else 8)
