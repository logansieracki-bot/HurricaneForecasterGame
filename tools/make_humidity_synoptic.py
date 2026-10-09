#!/usr/bin/env python3
"""Builds a *synoptic* (day-to-day weather-timescale) humidity variability layer -- a per-cell
noise amplitude/persistence pair, meant to sit on top of the existing monthly-climatology-based
humidity field (make_humidity.py) as an additive process. See docs/roadmap.md for why this
exists: the monthly-mean field alone can never show a transient moist pulse or dry outbreak
(it's averaged away by construction), so "favorable for development" never flickered on/off the
way real day-to-day weather does, no matter the season or ENSO phase.

An EOF approach (the same technique used for the interannual humidity variability and for SST)
was tried first and abandoned -- checked directly against 5 years (2017-2021) of real daily
ERA5 data, not assumed: the singular-value spectrum came back essentially flat (top 15 modes
explain only ~22% of variance, no elbow at all), unlike the interannual fit's own clearly
dominant leading modes. The reason, also checked directly: real day-to-day RH anomalies here
decorrelate in space by about 16-20 deg (~1800-2200 km, matching the real ~2000-2500 km
wavelength of African easterly waves) -- a short range relative to this basin's own ~150x112 deg
extent, so the field looks less like "a few basin-wide coherent patterns" (what EOF/SVD
compresses well) and more like many quasi-independent weather systems active in different parts
of the basin at once (what EOF/SVD needs dozens-to-hundreds of modes to represent acceptably).

Instead: fit each coarse grid cell its OWN std and daily lag-1 autocorrelation directly from the
real anomaly time series (no SVD), lightly spatially smoothed (4-neighbor diffusion, same
technique apply_fill already uses) since 915 daily samples per cell is a noisier estimate than
the 15-year interannual fit's own convergence, and neighboring cells are confirmed strongly
correlated (corr=0.92 one cell apart) so they should have very similar real statistics, not
estimation noise shaped like a checkerboard. Client-side, each coarse cell becomes its own
independent AR(1) process at that cell's own real amplitude/persistence -- the existing bicubic
upsample() (same closure already used for every other field) provides the spatial smoothing
between cells, so this doesn't reproduce the real ~2000 km coherent wave structure exactly, but
it does get the two properties that matter most for "does this look and feel like real weather"
honestly right: how much a point's humidity swings day to day, and how long a wet or dry spell
actually lasts, both calibrated from real data rather than guessed.

Usage: python3 tools/make_humidity_synoptic.py <basin> <lon0> <lon1> <lat0> <lat1>
  e.g. python3 tools/make_humidity_synoptic.py atlantic -110 40 -40 72
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import climate_lib as cl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# make_humidity.py's own 15-year MONTHLY pull is about interannual variability, where more years
# is strictly better for a stable fit. This is about SYNOPTIC variability instead -- the real
# sample size for that is daily, not yearly (Jun-Nov across 5 years is ~915 real weather
# samples, vastly more than the 15 the interannual fit works with), so a shorter span is both
# sufficient and keeps the pull itself modest. 2017-2021: two of the most active Atlantic
# seasons on record (2017, 2020) alongside quieter ones, for a representative mix, still inside
# ERA5's own confirmed-usable range. June-November only, matching NHC's own hurricane season --
# real synoptic character (SAL activity, tropical wave trains) is a season-specific regime, not
# a year-round constant, and this noise only needs to be realistic during the months it'll
# actually be seen driving gameplay.
SYNOPTIC_YEARS = (2017, 2021)
SYNOPTIC_MONTHS = range(6, 12)


def smooth2d(vals2d, invalid, iterations=40):
    """Light 4-neighbor box-smoothing of a noisy per-cell statistic (std or phi), land cells
    held out of the average and refilled from their own neighbors same as apply_fill. Far fewer
    iterations than apply_fill's own 300 -- this is denoising an already-mostly-smooth real
    field (confirmed: neighboring cells correlate at 0.92), not inpainting a hard land/ocean
    boundary from scratch, so it only needs to knock down sampling noise, not converge fully."""
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


def build(basin, lon0, lon1, lat0, lat1):
    sst = cl.load(os.path.join(ROOT, "data", "raw", "ersstv5.nc"))

    # Reuse the already-built monthly climatology (same cache make_humidity.py itself wrote) --
    # the synoptic anomaly is relative to that same monthly-mean baseline, not a separate one.
    monthly_cache = os.path.join(ROOT, "data", "raw", "era5_rh700_global_monthly_2007-2021.nc")
    rh_monthly = cl.load_era5_rh700(sst["lat"], sst["lon"], 2007, 2021, cache_path=monthly_cache)
    box_m, cnx, cny = cl.extract_box(rh_monthly, lon0, lon1, lat0, lat1)
    fill = cl.land_fill_indices(box_m)
    clim12 = cl.monthly_climatology(box_m, fill, base_years=(2007, 2021))

    daily_cache = os.path.join(
        ROOT, "data", "raw",
        f"era5_rh700_global_daily_{SYNOPTIC_YEARS[0]}-{SYNOPTIC_YEARS[1]}_junnov.nc",
    )
    rh_daily = cl.load_era5_rh700_daily(
        sst["lat"], sst["lon"], SYNOPTIC_YEARS[0], SYNOPTIC_YEARS[1],
        months=SYNOPTIC_MONTHS, cache_path=daily_cache,
    )
    box_d, cnx_d, cny_d = cl.extract_box(rh_daily, lon0, lon1, lat0, lat1)
    assert (cnx_d, cny_d) == (cnx, cny), "daily pull's own box must match the monthly clim's grid exactly"

    anom, times = cl.anomalies(box_d, clim12, fill, eof_years=SYNOPTIC_YEARS)   # (T, CN), T ~= 5*183

    std2d = np.nanstd(anom, axis=0).reshape(cny, cnx)
    phi2d = np.full((cny, cnx), np.nan)
    for q in range(anom.shape[1]):
        iy, ix = divmod(q, cnx)
        if fill[iy, ix]:
            continue
        s = anom[:, q]
        phi2d[iy, ix] = np.corrcoef(s[1:], s[:-1])[0, 1]

    std2d = smooth2d(np.nan_to_num(std2d, nan=0.0), fill)
    phi2d = smooth2d(np.nan_to_num(phi2d, nan=0.5), fill)
    # Clip phi to a sane positive range -- real values measured 0.30-0.72 (see the plan/roadmap
    # entry), this just guards the client's phi^nStep closed-form update against a pathological
    # near-zero or negative value the smoothing pass could in principle produce at an edge cell.
    phi2d = np.clip(phi2d, 0.1, 0.95)

    out = {
        "std": cl.encode_i16(std2d.flatten(), 10),    # % RH * 10
        "phi": cl.encode_i16(phi2d.flatten(), 1000),  # daily lag-1 autocorrelation * 1000
    }

    out_dir = os.path.join(ROOT, "data", "generated")
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, f"{basin}-humidity-synoptic.json")
    with open(dest, "w") as f:
        json.dump(out, f)
    print(f"wrote {dest}")
    print(f"  cnx={cnx} cny={cny} samples(days)={anom.shape[0]}")
    print(f"  std (ocean, smoothed): median={np.median(std2d[~fill]):.1f} p10={np.percentile(std2d[~fill],10):.1f} p90={np.percentile(std2d[~fill],90):.1f}")
    print(f"  phi (ocean, smoothed, daily): median={np.median(phi2d[~fill]):.2f} p10={np.percentile(phi2d[~fill],10):.2f} p90={np.percentile(phi2d[~fill],90):.2f}")
    return out


if __name__ == "__main__":
    args = sys.argv[1:]
    basin = args[0]
    lon0, lon1, lat0, lat1 = (float(x) for x in args[1:5])
    build(basin, lon0, lon1, lat0, lat1)
