#!/usr/bin/env python3
"""Builds the wind-shear portion of a basin's data.json (clim/eof/K/enso/phi, mirroring
make_humidity.py's own shape exactly) from real ERA5 200-850 hPa deep-layer vertical wind
shear. See climate_lib.py's load_era5_shear() for the actual data access/derivation/averaging-
order reasoning (confirmed against real data, not assumed), and docs/roadmap.md for the shear
plan.

Phase 1 only: interannual climatology + EOF variability + ENSO regression. Day-to-day synoptic
shear noise (real upper-level trough passages) is an explicit, separate follow-up, the same way
humidity's own synoptic layer (make_humidity_synoptic.py) was built after this same kind of
script, not alongside it.

Usage: python3 tools/make_shear.py <basin> <lon0> <lon1> <lat0> <lat1> [K]
  e.g. python3 tools/make_shear.py atlantic -110 40 -40 72 6
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import climate_lib as cl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Same window humidity uses, same reason: shares a Nino3.4/ERSST-derived predictor, which stops
# at 2021 (ERSST's own time axis ends there) -- sampling past it would silently zero-fill the
# ENSO predictor for the out-of-range months instead of erroring. Also spans the same 3+ ENSO
# cycles (2007-08 La Nina through 2020-21 La Nina) humidity's own window does.
SHEAR_YEARS = (2007, 2021)


def build(basin, lon0, lon1, lat0, lat1, k=6):
    sst = cl.load(os.path.join(ROOT, "data", "raw", "ersstv5.nc"))

    cache_path = os.path.join(ROOT, "data", "raw", f"era5_shear_global_monthly_{SHEAR_YEARS[0]}-{SHEAR_YEARS[1]}.nc")
    shear_global = cl.load_era5_shear(sst["lat"], sst["lon"], SHEAR_YEARS[0], SHEAR_YEARS[1], cache_path=cache_path)

    box, cnx, cny = cl.extract_box(shear_global, lon0, lon1, lat0, lat1)
    fill = cl.land_fill_indices(box)   # expect ~0 invalid cells -- ERA5 has real values over land too

    clim12 = cl.monthly_climatology(box, fill, base_years=SHEAR_YEARS)        # (12, CN), kt
    anom, times = cl.anomalies(box, clim12, fill, eof_years=SHEAR_YEARS)      # (T, CN)
    patterns, pcs, phi = cl.compute_eofs(anom, k)
    k = patterns.shape[0]

    # Nino 3.4 stays on SST's own standard baseline and the full ERSST global field, same
    # reasoning as make_humidity.py's own identical comment -- it's a literature-defined SST
    # index, independent of shear's own (shorter) sampling window.
    n34_times, n34_anom = cl.nino34_index(sst)
    enso = cl.enso_regression(anom, times, n34_times, n34_anom)   # (3, CN), kt per deg C Nino3.4

    fine_res = 0.25
    fine_nx = round(((lon1 + 360 if lon1 < lon0 else lon1) - lon0) / fine_res) + 1
    fine_ny = round((lat1 - lat0) / fine_res) + 1
    out = {
        "domain": {
            "lon0": lon0, "lon1": lon1, "lat0": lat0, "lat1": lat1, "res": fine_res, "nx": fine_nx, "ny": fine_ny,
            "clon0": lon0, "clat0": lat1, "cres": cl.CRES, "cnx": cnx, "cny": cny,
        },
        "K": k,
        "clim": cl.encode_i16(clim12, 10),     # kt * 10 (0.1 kt precision)
        "eof": cl.encode_i16(patterns, 1000),  # kt per +1 sigma * 1000
        "enso": cl.encode_i16(enso, 1000),     # kt per deg C Nino3.4 * 1000
        "phi": [round(float(x), 4) for x in phi],
    }

    out_dir = os.path.join(ROOT, "data", "generated")
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, f"{basin}-shear.json")
    with open(dest, "w") as f:
        json.dump(out, f)
    print(f"wrote {dest}")
    print(f"  cnx={cnx} cny={cny} K={k} invalid(land) cells={int(fill.sum())}/{fill.size}")
    print(f"  clim (ocean) kt: min={clim12[:, ~fill.flatten()].min():.1f} max={clim12[:, ~fill.flatten()].max():.1f}")
    print(f"  phi (monthly persistence per mode): {out['phi']}")
    return out


if __name__ == "__main__":
    args = sys.argv[1:]
    basin = args[0]
    lon0, lon1, lat0, lat1 = (float(x) for x in args[1:5])
    k = int(args[5]) if len(args) > 5 else 6
    build(basin, lon0, lon1, lat0, lat1, k)
