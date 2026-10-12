#!/usr/bin/env python3
"""Builds the per-cell local noise texture for Wind Shear's day-to-day ("synoptic") layer -- real
upper-level weather noise that isn't explained by the explicit jet-axis feature (see
make_shear_jet.py). Pure per-cell AR(1), same technique and same shape as
make_humidity_synoptic.py's own (see its docstring for the general reasoning) -- no EOF here.

This file originally DID include its own field-value EOF (a small-k coherent-mode layer
reconstructing shear's own value directly), but that's now superseded by make_shear_jet.py's
explicit jet-axis mechanism: checked directly against the same real data, the axis's own
LATITUDE decomposes into EOF wave modes far more efficiently (65% of variance in the top 6
modes) than the raw field VALUE did (only 31% at the same k) -- the axis position is the real
coherent degree of freedom; modeling field value directly via EOF was only ever capturing a
blurry echo of the same underlying motion, and rendered as scattered patches rather than a
continuous band once actually drawn (see docs/roadmap.md). This script now just fits each
coarse cell's own real std and daily lag-1 autocorrelation directly from the real daily anomaly
(no EOF reconstruction to subtract first), providing local texture -- most useful away from the
jet axis itself (the deep tropics/MDR/Caribbean/Gulf, where the axis mechanism contributes
little, confirmed directly: even the axis's own top-8 modes only explain 9-31% of LOCAL variance
at any single point despite explaining 65-73% of the axis's own basin-wide shape variance).

Usage: python3 tools/make_shear_synoptic.py <basin> <lon0> <lon1> <lat0> <lat1> <months>
  e.g. python3 tools/make_shear_synoptic.py atlantic -110 40 -40 72 6,7,8,9,10,11
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import climate_lib as cl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYNOPTIC_YEARS = (2017, 2021)


def smooth2d(vals2d, invalid, iterations=40):
    """Light 4-neighbor box-smoothing of a noisy per-cell statistic -- identical technique to
    make_humidity_synoptic.py's own smooth2d (see its docstring)."""
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


def build(basin, lon0, lon1, lat0, lat1, months):
    sst = cl.load(os.path.join(ROOT, "data", "raw", "ersstv5.nc"))

    monthly_cache = os.path.join(ROOT, "data", "raw", "era5_shear_global_monthly_2007-2021.nc")
    shear_monthly = cl.load_era5_shear(sst["lat"], sst["lon"], 2007, 2021, cache_path=monthly_cache)
    box_m, cnx, cny = cl.extract_box(shear_monthly, lon0, lon1, lat0, lat1)
    fill = cl.land_fill_indices(box_m)
    clim12 = cl.monthly_climatology(box_m, fill, base_years=(2007, 2021))

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
    std_raw_median = float(np.median(np.nanstd(anom, axis=0).reshape(cny, cnx)[~fill]))

    # Subtract the part the explicit jet already accounts for, so this texture only models what
    # the jet DOESN'T -- otherwise the same real variance gets drawn twice (once as the band
    # moving, once as local noise right on top of it), which both over-states the variability
    # near the jet and buries the band in clutter once rendered (seen directly: fit on the raw
    # anomaly, the field read as speckle with a faint ribbon in it, not a ribbon). Uses the exact
    # same axis tracing, search band, and profile the client renders (make_shear_jet.py must have
    # been run first), so what's subtracted here is precisely what the client adds back.
    import make_shear_jet as msj
    jet_path = os.path.join(ROOT, "data", "generated", f"{basin}-shear-jet.json")
    assert os.path.exists(jet_path), f"{jet_path} not found -- run make_shear_jet.py first (this fits the texture on what's left after the jet)"
    with open(jet_path) as f:
        jet = json.load(f)
    offs = np.array(jet["profileOffsets"], dtype=float)
    bump_kt = np.array(jet["profileKt"], dtype=float)
    bump_kt = bump_kt - bump_kt[-1]   # excess over the profile's own far-field value, same as the client's jetBumpLut
    import base64
    smear = (np.frombuffer(base64.b64decode(jet["smear"]), dtype=np.int16).astype(float) / 10).reshape(cny, cnx)   # what the client subtracts from the climatology (the jet's own average smear, see make_shear_jet.py)
    lats, jet_rows, jet_lats = msj.jet_band(lat1, cny)
    vals = box_d.transpose("time", "lat", "lon").values   # (T, cny, cnx)
    axis_lat = msj.trace_axis(vals[:, jet_rows, :], jet_lats)   # (T, cnx)
    off = np.abs(lats[None, :, None] - axis_lat[:, None, :])    # (T, cny, cnx) distance of every cell from that day's axis at its own longitude
    bump = np.interp(np.nan_to_num(off, nan=1e9), offs, bump_kt, right=0.0)   # NaN axis (no valid column) or beyond the last offset -> 0
    # The client draws  climatology - smear + ribbon  (+ interannual/ENSO, which are monthly-scale
    # and not part of this day-to-day fit), so what the texture has to cover is the daily anomaly
    # minus (ribbon - smear).
    anom = anom - (bump - smear[None, :, :]).reshape(anom.shape[0], -1)

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
    phi2d = np.clip(phi2d, 0.1, 0.95)

    out = {
        "std": cl.encode_i16(std2d.flatten(), 10),    # kt * 10
        "phi": cl.encode_i16(phi2d.flatten(), 1000),  # daily lag-1 autocorrelation * 1000
    }

    out_dir = os.path.join(ROOT, "data", "generated")
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, f"{basin}-shear-synoptic.json")
    with open(dest, "w") as f:
        json.dump(out, f)
    print(f"wrote {dest}")
    print(f"  cnx={cnx} cny={cny} samples(days)={anom.shape[0]}")
    print(f"  std on the raw anomaly (before subtracting the jet): median={std_raw_median:.1f} kt")
    print(f"  std on what's left after the jet (ocean, smoothed): median={np.median(std2d[~fill]):.1f} p10={np.percentile(std2d[~fill],10):.1f} p90={np.percentile(std2d[~fill],90):.1f} kt")
    print(f"  phi (ocean, smoothed, daily): median={np.median(phi2d[~fill]):.2f} p10={np.percentile(phi2d[~fill],10):.2f} p90={np.percentile(phi2d[~fill],90):.2f}")
    return out


if __name__ == "__main__":
    args = sys.argv[1:]
    basin = args[0]
    lon0, lon1, lat0, lat1 = (float(x) for x in args[1:5])
    months = [int(x) for x in args[5].split(",")]
    build(basin, lon0, lon1, lat0, lat1, months)
