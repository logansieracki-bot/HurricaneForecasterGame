#!/usr/bin/env python3
"""Per-year ERA5 pull for the steering-flow and sea-level-pressure work (steering arrows + highs).

Same public ARCO-ERA5 archive (6-hourly, 1.5 deg, 13 pressure levels) the shear/humidity pipelines
read. Three things come out of one pass, written one file per year so the pull can run as several
workers in parallel and resume where it stopped:

  era5_steer_monthly_<year>.nc  monthly means of the LAYER-MEAN horizontal wind (kt) for three steering
                                layers, the standard NHC "BAM" family: shallow 850-700 hPa (weak/shallow
                                storms), medium 850-500, deep 850-200 (mature hurricanes). Each is the
                                pressure-weighted (trapezoid in p) mean over the native levels in the layer.
  era5_steer_daily_<year>.nc    daily means of the same (only for years >= --daily-from; the synoptic
                                statistics only need a handful of years, exactly like the shear texture).
  era5_mslp_<year>.nc           6-hourly mean sea level pressure (hPa) -- the highs are detected and tracked
                                on it, so it keeps the full 6-hourly resolution.

All native grid (240 lon x 121 lat, 1.5 deg), nothing regridded here; climate_lib.load_era5_steer_* /
load_era5_mslp regrid onto the ERSST 2 deg grid the rest of the pipeline uses. Winds are averaged as
VECTORS first (u and v separately, over every 6-hourly reading) -- the same order, for the same reason, as
load_era5_shear: u/v are linear, so this is just a mean.

Usage: python3 tools/pull_era5_steer.py --years 2007-2011 [--daily-from 2017] [--months 9] [--out DIR] [--no-mslp]
"""
import argparse
import os
import sys
import time

import numpy as np
import xarray as xr

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ERA5_ZARR = "gcs://gcp-public-data-arco-era5/ar/1959-2022-6h-240x121_equiangular_with_poles_conservative.zarr"
LEVELS = [200, 250, 300, 400, 500, 600, 700, 850]
LAYERS = {"shallow": (700, 850), "medium": (500, 850), "deep": (200, 850)}   # (top, bottom) hPa
KT = 1.943844


def layer_weights(ptop, pbot):
    """Trapezoid weights in pressure over the native levels inside [ptop, pbot], normalised to sum to 1."""
    lv = np.array([l for l in LEVELS if ptop <= l <= pbot], float)
    w = np.zeros_like(lv)
    dp = np.diff(lv)
    w[:-1] += dp / 2
    w[1:] += dp / 2
    return lv, w / w.sum()


def retry(fn, tries=5):
    for i in range(tries):
        try:
            return fn()
        except Exception as e:   # transient network/zarr errors: back off and try again
            if i == tries - 1:
                raise
            print(f"  retry {i + 1}: {repr(e)[:140]}", flush=True)
            time.sleep(6 * (i + 1))


def pack(ds, scale, offset=0.0):
    enc = {v: {"dtype": "int16", "scale_factor": scale, "add_offset": offset, "_FillValue": -32768, "zlib": True, "complevel": 3} for v in ds.data_vars}
    return enc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", required=True, help="a-b inclusive, e.g. 2007-2011")
    ap.add_argument("--daily-from", type=int, default=2017)
    ap.add_argument("--months", default=None, help="comma list, for testing")
    ap.add_argument("--out", default=os.path.join(ROOT, "data", "raw"))
    ap.add_argument("--no-mslp", action="store_true")
    a = ap.parse_args()
    y0, y1 = [int(x) for x in a.years.split("-")]
    months = [int(m) for m in a.months.split(",")] if a.months else list(range(1, 13))
    os.makedirs(a.out, exist_ok=True)

    ds = xr.open_zarr(ERA5_ZARR, storage_options={"token": "anon"}, chunks=None)
    times = ds["time"].values
    years = ds["time"].dt.year.values
    mons = ds["time"].dt.month.values
    uv = ds[["u_component_of_wind", "v_component_of_wind"]].sel(level=LEVELS)
    wts = {L: layer_weights(*pb) for L, pb in LAYERS.items()}
    t0 = time.time()

    for year in range(y0, y1 + 1):
        f_mon = os.path.join(a.out, f"era5_steer_monthly_{year}.nc")
        f_day = os.path.join(a.out, f"era5_steer_daily_{year}.nc")
        f_slp = os.path.join(a.out, f"era5_mslp_{year}.nc")
        want_daily = year >= a.daily_from
        done_w = os.path.exists(f_mon) and (not want_daily or os.path.exists(f_day))
        done_p = a.no_mslp or os.path.exists(f_slp)
        if done_w and done_p and not a.months:
            print(f"{year}: already done", flush=True)
            continue
        mon_list, day_list, slp_list = [], [], []
        for month in months:
            idx = np.where((years == year) & (mons == month))[0]
            if len(idx) == 0:
                continue
            if not done_w:
                sub = retry(lambda: uv.isel(time=idx).load())
                vars_ = {}
                for L, (lv, w) in wts.items():
                    wl = xr.DataArray(w, dims="level", coords={"level": lv})
                    s = sub.sel(level=lv)
                    vars_[f"u_{L}"] = (s["u_component_of_wind"] * wl).sum("level") * KT
                    vars_[f"v_{L}"] = (s["v_component_of_wind"] * wl).sum("level") * KT
                lay = xr.Dataset(vars_).transpose("time", "latitude", "longitude")
                m = lay.mean("time").expand_dims(time=[np.datetime64(f"{year}-{month:02d}-15", "ns")])
                mon_list.append(m)
                if want_daily:
                    lay = lay.assign_coords(day=lay["time"].dt.floor("D"))
                    d = lay.groupby("day").mean("time").rename({"day": "time"})
                    day_list.append(d)
                del sub, lay
            if not done_p:
                p = retry(lambda: ds["mean_sea_level_pressure"].isel(time=idx).load())
                slp_list.append((p / 100.0).astype("float32").transpose("time", "latitude", "longitude"))
            print(f"{year}-{month:02d} done  ({time.time() - t0:.0f} s)", flush=True)
        if mon_list and not a.months:
            xr.concat(mon_list, dim="time").astype("float32").to_netcdf(f_mon)
        elif mon_list:
            xr.concat(mon_list, dim="time").astype("float32").to_netcdf(f_mon.replace(".nc", f"_m{a.months.replace(',', '-')}.nc"))
        if day_list:
            dd = xr.concat(day_list, dim="time").astype("float32")
            dd.to_netcdf(f_day if not a.months else f_day.replace(".nc", f"_m{a.months.replace(',', '-')}.nc"), encoding=pack(dd, 0.01))
        if slp_list:
            sl = xr.concat(slp_list, dim="time").to_dataset(name="mslp")
            sl.to_netcdf(f_slp if not a.months else f_slp.replace(".nc", f"_m{a.months.replace(',', '-')}.nc"), encoding=pack(sl, 0.01, 1000.0))
        print(f"{year}: written  ({time.time() - t0:.0f} s)", flush=True)


if __name__ == "__main__":
    main()
