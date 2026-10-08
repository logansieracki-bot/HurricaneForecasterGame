#!/usr/bin/env python3
"""Builds the humidity portion of a basin's data.json (clim/eof/K/enso/phi, mirroring
make_climate.py's own shape exactly) from ERA5 700 hPa relative humidity. See
climate_lib.py's load_era5_rh700() for the actual data access/derivation, and the
humidity plan (docs/roadmap.md) for why 700 hPa, why this year window, and why this is a
separate build from SST's own.

Usage: python3 tools/make_humidity.py <basin> <lon0> <lon1> <lat0> <lat1> [K]
  e.g. python3 tools/make_humidity.py atlantic -110 40 -40 72 6
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import climate_lib as cl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 15 years, not SST's own 30 -- a deliberate tradeoff for cloud-archive-pull tractability, not
# a claim this is an official climate normal (see the humidity plan's "Data volume & sampling
# strategy" section). End year forced to 2021: ERSST's own time axis -- and so the Nino 3.4
# index enso_regression() needs -- stops there; sampling into 2022 would silently zero-fill the
# ENSO predictor for the out-of-range months instead of erroring. Spans 2007-08 La Nina through
# 2020-21 La Nina, at least 3 full ENSO cycles with a real mix of amplitudes.
HUMID_YEARS = (2007, 2021)


def build(basin, lon0, lon1, lat0, lat1, k=6):
    sst = cl.load(os.path.join(ROOT, "data", "raw", "ersstv5.nc"))

    cache_path = os.path.join(ROOT, "data", "raw", f"era5_rh700_global_monthly_{HUMID_YEARS[0]}-{HUMID_YEARS[1]}.nc")
    rh = cl.load_era5_rh700(sst["lat"], sst["lon"], HUMID_YEARS[0], HUMID_YEARS[1], cache_path=cache_path)

    box, cnx, cny = cl.extract_box(rh, lon0, lon1, lat0, lat1)
    fill = cl.land_fill_indices(box)   # expect ~0 invalid cells -- ERA5 has real values over land too

    clim12 = cl.monthly_climatology(box, fill, base_years=HUMID_YEARS)         # (12, CN)
    anom, times = cl.anomalies(box, clim12, fill, eof_years=HUMID_YEARS)       # (T, CN)
    patterns, pcs, phi = cl.compute_eofs(anom, k)
    k = patterns.shape[0]

    # Nino 3.4 stays on SST's own standard baseline and the full ERSST global field -- it's a
    # literature-defined SST index, independent of humidity's own (shorter) sampling window.
    n34_times, n34_anom = cl.nino34_index(sst)
    enso = cl.enso_regression(anom, times, n34_times, n34_anom)   # (3, CN)

    fine_res = 0.25
    fine_nx = round(((lon1 + 360 if lon1 < lon0 else lon1) - lon0) / fine_res) + 1
    fine_ny = round((lat1 - lat0) / fine_res) + 1
    out = {
        "domain": {
            "lon0": lon0, "lon1": lon1, "lat0": lat0, "lat1": lat1, "res": fine_res, "nx": fine_nx, "ny": fine_ny,
            "clon0": lon0, "clat0": lat1, "cres": cl.CRES, "cnx": cnx, "cny": cny,
        },
        "K": k,
        "clim": cl.encode_i16(clim12, 10),    # % RH * 10 (0.1% precision -- RH doesn't need SST's own hundredths)
        "eof": cl.encode_i16(patterns, 1000),  # % RH per +1 sigma * 1000
        "enso": cl.encode_i16(enso, 1000),     # % RH per deg C Nino3.4 * 1000
        "phi": [round(float(x), 4) for x in phi],
    }

    out_dir = os.path.join(ROOT, "data", "generated")
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, f"{basin}-humidity.json")
    with open(dest, "w") as f:
        json.dump(out, f)
    print(f"wrote {dest}")
    print(f"  cnx={cnx} cny={cny} K={k} invalid(land) cells={int(fill.sum())}/{fill.size}")
    print(f"  phi (monthly persistence per mode): {out['phi']}")
    return out


if __name__ == "__main__":
    args = sys.argv[1:]
    basin = args[0]
    lon0, lon1, lat0, lat1 = (float(x) for x in args[1:5])
    k = int(args[5]) if len(args) > 5 else 6
    build(basin, lon0, lon1, lat0, lat1, k)
