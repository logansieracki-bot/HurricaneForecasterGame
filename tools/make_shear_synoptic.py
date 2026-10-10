#!/usr/bin/env python3
"""Builds a *synoptic* (day-to-day weather-timescale) wind shear variability layer -- real
upper-level trough passages and jet streaks -- meant to sit on top of the existing monthly-
climatology-based shear field (make_shear.py) as an additive process. See docs/roadmap.md for
why this exists: a monthly-mean shear field can never show a transient jet streak (it's averaged
away by construction), which is also why the user's own complaint that the Phase 1 field doesn't
read as a prominent, realistic jet band is expected to improve once this lands.

Humidity's own synoptic layer (make_humidity_synoptic.py) checked an EOF approach first and
abandoned it -- real daily RH anomalies there decorrelate in space over a short range (~16-20
deg) and the singular-value spectrum came back flat, so every coarse cell got its own
independent AR(1) process instead. Checked again here for shear specifically rather than
assumed to be the same (real jet streaks are a physically different, larger-scale, more
elongated/anisotropic feature than the smaller tropical-wave-driven humidity anomalies) --
confirmed against 5 years (2017-2021) of real daily ERA5 200-850 hPa shear, restricted to the
Atlantic's own Jun-Nov hurricane season (not the full year -- winter jet variability is much
stronger, see the N.Atlantic std figures below, and would otherwise dominate the fit): the
spectrum has a real elbow (mode 1 alone explains 14.3% of domain-wide variance, roughly 3-4x any
single other mode) with cumulative top-15 reaching 47.3%, genuinely EOF-compressible, unlike
humidity's flat spectrum. So this layer is a HYBRID, not a straight copy of either existing
pattern: a small-k EOF component (same technique as the interannual variability/SST, capturing
the coherent, anisotropic jet-latitude-shift-like structure an isotropic per-cell approach would
miss) plus a per-cell AR(1) residual on top (same technique as humidity's synoptic layer,
capturing the leftover local variance the EOF modes don't reach) -- fit on the RESIDUAL after
removing the EOF reconstruction, not the raw anomaly, so the two layers' variance isn't double-
counted.

k=15 (not 6, the interannual layers' own default) because the real spectrum's cumulative
variance explained keeps climbing meaningfully past 6 modes (31.3% at k=6 -> 47.3% at k=15,
before flattening: only +5.7% more at k=20) AND because the extra modes specifically help where
it matters most for jet prominence: at a North Atlantic storm-track point, k=15 explains 31% of
local variance vs k=6's 9%, while at the tropical MDR (where genesis actually happens) even k=15
only reaches 27% -- confirming the EOF modes mostly live where the real jet does (mid/high
latitudes), not in the tropics, which is exactly the real physical pattern this is trying to
reproduce, and exactly why the residual AR(1) layer still carries most of the real day-to-day
variability at genesis-relevant latitudes.

Usage: python3 tools/make_shear_synoptic.py <basin> <lon0> <lon1> <lat0> <lat1> <months> [k]
  <months> is a comma-separated list of calendar months (1-12) covering that basin's own real
  cyclone season -- see make_humidity_synoptic.py's own docstring for why this isn't guessed.
  e.g. python3 tools/make_shear_synoptic.py atlantic -110 40 -40 72 6,7,8,9,10,11 15
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import climate_lib as cl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Same window make_humidity_synoptic.py uses, same reason (ample real daily sample size from a
# shorter span; same representative mix of active/quiet years; same reference window across
# basins so cross-basin comparisons later aren't confounded by different years chosen).
SYNOPTIC_YEARS = (2017, 2021)


def smooth2d(vals2d, invalid, iterations=40):
    """Light 4-neighbor box-smoothing of a noisy per-cell statistic (residual std or phi) --
    identical technique to make_humidity_synoptic.py's own smooth2d (see its docstring); kept as
    its own local copy rather than factored into climate_lib.py since both call sites are this
    specific kind of per-script synoptic-noise post-processing, not a general climate primitive."""
    valid = ~invalid
    out = np.where(invalid, np.nanmean(vals2d[valid]), vals2d)
    for _ in range(iterations):
        up = np.vstack([out[:1], out[:-1]])
        down = np.vstack([out[1:], out[-1:]])
        left = np.hstack([out[:, :1], out[:, :-1]])
        right = np.hstack([out[:, 1:], out[:, -1:]])
        avg = (up + down + left + right) / 4
        out = np.where(valid, 0.7 * out + 0.3 * avg, avg)
    return out


def build(basin, lon0, lon1, lat0, lat1, months, k=15):
    sst = cl.load(os.path.join(ROOT, "data", "raw", "ersstv5.nc"))

    # Reuse the already-built monthly climatology (same cache make_shear.py itself wrote) -- the
    # synoptic anomaly is relative to that same monthly-mean baseline, not a separate one.
    monthly_cache = os.path.join(ROOT, "data", "raw", "era5_shear_global_monthly_2007-2021.nc")
    shear_monthly = cl.load_era5_shear(sst["lat"], sst["lon"], 2007, 2021, cache_path=monthly_cache)
    box_m, cnx, cny = cl.extract_box(shear_monthly, lon0, lon1, lat0, lat1)
    fill = cl.land_fill_indices(box_m)
    clim12 = cl.monthly_climatology(box_m, fill, base_years=(2007, 2021))

    # Shared all-12-months cache, same principle as make_humidity_synoptic.py's own: pull/cache
    # the full year once, filter to this basin's own season afterward in memory.
    daily_cache = os.path.join(
        ROOT, "data", "raw",
        f"era5_shear_global_daily_{SYNOPTIC_YEARS[0]}-{SYNOPTIC_YEARS[1]}_allmonths.nc",
    )
    shear_daily_all = cl.load_era5_shear_daily(
        sst["lat"], sst["lon"], SYNOPTIC_YEARS[0], SYNOPTIC_YEARS[1],
        months=None, cache_path=daily_cache,
    )
    shear_daily = shear_daily_all.sel(time=shear_daily_all["time"].dt.month.isin(list(months)))
    box_d, cnx_d, cny_d = cl.extract_box(shear_daily, lon0, lon1, lat0, lat1)
    assert (cnx_d, cny_d) == (cnx, cny), "daily pull's own box must match the monthly clim's grid exactly"

    anom, times = cl.anomalies(box_d, clim12, fill, eof_years=SYNOPTIC_YEARS)   # (T, CN)

    a = np.nan_to_num(anom, nan=0.0)
    patterns, pcs, phi = cl.compute_eofs(a, k)   # phi here is already a real DAILY lag-1 autocorrelation (fit directly from day-apart PC samples), unlike the interannual EOF's own monthly phi -- no ^(1/30.44) conversion needed client-side
    k = patterns.shape[0]
    recon = pcs @ patterns
    resid = a - recon

    std2d = np.nanstd(resid, axis=0).reshape(cny, cnx)
    phi2d = np.full((cny, cnx), np.nan)
    for q in range(resid.shape[1]):
        iy, ix = divmod(q, cnx)
        if fill[iy, ix]:
            continue
        s = resid[:, q]
        phi2d[iy, ix] = np.corrcoef(s[1:], s[:-1])[0, 1]

    std2d = smooth2d(np.nan_to_num(std2d, nan=0.0), fill)
    phi2d = smooth2d(np.nan_to_num(phi2d, nan=0.5), fill)
    phi2d = np.clip(phi2d, 0.1, 0.95)   # same defensive guard as make_humidity_synoptic.py's own, against a pathological near-zero/negative smoothed edge value

    out = {
        "K": k,
        "eof": cl.encode_i16(patterns, 1000),           # kt per +1 sigma of each mode * 1000, same scale make_shear.py's own interannual eof uses
        "phi": [round(float(x), 4) for x in phi],        # already-daily lag-1 autocorrelation per mode, plain floats (same encoding make_shear.py uses for its own phi)
        "residStd": cl.encode_i16(std2d.flatten(), 10),   # kt * 10
        "residPhi": cl.encode_i16(phi2d.flatten(), 1000),  # daily lag-1 autocorrelation * 1000
    }

    out_dir = os.path.join(ROOT, "data", "generated")
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, f"{basin}-shear-synoptic.json")
    with open(dest, "w") as f:
        json.dump(out, f)
    print(f"wrote {dest}")
    print(f"  cnx={cnx} cny={cny} K={k} samples(days)={a.shape[0]}")
    print(f"  EOF phi (daily persistence per mode): {out['phi']}")
    var_explained = 1 - (np.nanstd(resid, axis=0) ** 2).sum() / (np.nanstd(a, axis=0) ** 2).sum()
    print(f"  domain-wide fraction of variance explained by top {k} modes: {var_explained:.2f}")
    print(f"  residual std (ocean, smoothed): median={np.median(std2d[~fill]):.1f} p10={np.percentile(std2d[~fill],10):.1f} p90={np.percentile(std2d[~fill],90):.1f} kt")
    print(f"  residual phi (ocean, smoothed, daily): median={np.median(phi2d[~fill]):.2f} p10={np.percentile(phi2d[~fill],10):.2f} p90={np.percentile(phi2d[~fill],90):.2f}")
    return out


if __name__ == "__main__":
    args = sys.argv[1:]
    basin = args[0]
    lon0, lon1, lat0, lat1 = (float(x) for x in args[1:5])
    months = [int(x) for x in args[5].split(",")]
    k = int(args[6]) if len(args) > 6 else 15
    build(basin, lon0, lon1, lat0, lat1, months, k)
