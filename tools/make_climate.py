#!/usr/bin/env python3
"""Builds the climate portion of a basin's data.json (clim/eof/K/enso/phi) from
raw ERSST v5. See climate_lib.py for the actual methodology.

Usage: python3 tools/make_climate.py <basin> <lon0> <lon1> <lat0> <lat1> [K]
  e.g. python3 tools/make_climate.py eastpacific -140 -74 0 36 14
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import climate_lib as cl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def build(basin, lon0, lon1, lat0, lat1, k=14):
    sst = cl.load(os.path.join(ROOT, "data", "raw", "ersstv5.nc"))
    box, cnx, cny = cl.extract_box(sst, lon0, lon1, lat0, lat1)
    fill = cl.land_fill_indices(box)

    clim12 = cl.monthly_climatology(box, fill)                 # (12, CN)
    anom, times = cl.anomalies(box, clim12, fill)               # (T, CN)
    patterns, pcs, phi = cl.compute_eofs(anom, k)
    k = patterns.shape[0]

    n34_times, n34_anom = cl.nino34_index(sst)
    enso = cl.enso_regression(anom, times, n34_times, n34_anom)  # (3, CN)

    fine_res = 0.25
    fine_nx = round((lon1 - lon0) / fine_res) + 1
    fine_ny = round((lat1 - lat0) / fine_res) + 1
    out = {
        "domain": {
            "lon0": lon0, "lon1": lon1, "lat0": lat0, "lat1": lat1, "res": fine_res, "nx": fine_nx, "ny": fine_ny,
            "clon0": lon0, "clat0": lat1, "cres": cl.CRES, "cnx": cnx, "cny": cny,
        },
        "K": k,
        "clim": cl.encode_i16(clim12, 100),      # deg C * 100
        "eof": cl.encode_i16(patterns, 1000),    # deg C per +1 sigma * 1000
        "enso": cl.encode_i16(enso, 1000),       # deg C per deg C Nino3.4 * 1000
        "phi": [round(float(x), 4) for x in phi],
    }

    out_dir = os.path.join(ROOT, "data", "generated")
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, f"{basin}-climate.json")
    with open(dest, "w") as f:
        json.dump(out, f)
    print(f"wrote {dest}")
    print(f"  cnx={cnx} cny={cny} K={k}")
    print(f"  phi (monthly persistence per mode): {out['phi']}")
    return out


if __name__ == "__main__":
    args = sys.argv[1:]
    basin = args[0]
    lon0, lon1, lat0, lat1 = (float(x) for x in args[1:5])
    k = int(args[5]) if len(args) > 5 else 14
    build(basin, lon0, lon1, lat0, lat1, k)
