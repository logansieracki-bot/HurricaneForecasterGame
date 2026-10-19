#!/usr/bin/env python3
"""The seasonal cycle of a basin's year-to-year humidity and shear, and the ENSO response a sustained event really has.

A basin's humidity and shear fields (make_humidity.py, make_shear.py) are a climatology plus two kinds of year-to-year variability: EOF modes fitted on all months together and an ENSO regression of
the Nino 3.4 index at three lags (0, 3, 6 months), each lag fitted on its own and the three summed by the page. Two things in that are wrong for a cyclone season, and the storm engine, which reads those
fields, turns both into seasons that are far too alike or far too different:

  * the three lag terms each carry the whole response, so a slow event is counted up to three times (the in-sample reconstruction from the real Nino 3.4 history comes out about twice the real anomaly in
    every basin: the steering layer cured this with climate_lib.enso_regression_lagsum(), a joint fit; docs/roadmap.md, known gaps);
  * the EOFs are fitted over all months together, so every month gets the same year-to-year spread, while the real spread has a strong seasonal cycle (the 700 hPa humidity of the western North Pacific's
    main development region varies by 7-8 points from year to year in January to April and by 2.6-3.8 from June to September; the page gave it 7 in August to October, ERA5 1.5).

This builds, for a basin, from the same ERA5 monthly means (2007-2021) the fields were made from:
  1. the joint-lag ENSO coefficients (climate_lib.enso_regression_lagsum), written back over `enso` of <basin>-humidity.json and <basin>-shear.json (their sum is the response to a sustained 1 C event);
  2. `seas`: {enso: [12], eof: [12]}, a gain by calendar month on the ENSO part and on the EOF part. They are fitted to the main development region (the basin's `mdr` box in src/storms.js, ocean cells):
     enso_m = the slope of the real regional-mean anomaly on the page's reconstruction of it from the real Nino 3.4 history; eof_m = the square root of what is left of the real variance of month m
     once that part is taken out, over the variance the page's EOF part carries (unit-variance modes), each smoothed 1-2-1 across the months (15 years of a month are a noisy variance) and kept in [0.15, 2.5].
A page that carries `seas` multiplies the ENSO term and the EOF term of the day by the gains interpolated between the middles of the months (src/template*.html computeField, src/storm-hooks.js computeStormFields).
The Atlantic and the East Pacific keep the fields their storm physics was calibrated on: they carry neither the new `enso` nor `seas`.

usage: make_env_seasonality.py <basin>... [--write]     (prints the gains and the spread before and after; --write rewrites data/generated/<basin>-humidity.json and -shear.json)
"""
import json
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import climate_lib as cl  # noqa: E402

ROOT = os.path.dirname(HERE)
GEN = os.path.join(ROOT, "data", "generated")
YEARS = (2007, 2021)
GMIN, GMAX = 0.3, 1.5          # limits of the EOF part's gain; the ENSO part's gain is limited to [0.2, 1] (the joint-lag coefficients are already the sustained-event response: a month can only ask for less of it)


def decode(b64, scale):
    import base64
    return np.frombuffer(base64.b64decode(b64), dtype="<i2").astype(float) / scale


def mdr_box(basin):
    out = subprocess.check_output(["node", "--input-type=module", "-e", f"import './src/storms.js'; console.log(JSON.stringify(globalThis.HFStorms.basinInfo('{basin}').mdr))"], cwd=ROOT)
    return json.loads(out)


def smooth12(a):
    return 0.25 * np.roll(a, 1) + 0.5 * a + 0.25 * np.roll(a, -1)


def analyse(basin, field, sst, n34_times, n34_anom, write):
    path = os.path.join(GEN, f"{basin}-{'climate' if field == 'sst' else field}.json")
    J = json.load(open(path)); d = J["domain"]
    lon0, lon1, lat0, lat1 = d["lon0"], d["lon1"], d["lat0"], d["lat1"]
    yrs = cl.EOF_YEARS if field == "sst" else YEARS
    if field == "sst":
        glob = sst
    elif field == "humidity":
        glob = cl.load_era5_rh700(sst["lat"], sst["lon"], YEARS[0], YEARS[1], cache_path=os.path.join(ROOT, "data", "raw", f"era5_rh700_global_monthly_{YEARS[0]}-{YEARS[1]}.nc"))
    else:
        glob = cl.load_era5_shear(sst["lat"], sst["lon"], YEARS[0], YEARS[1], cache_path=os.path.join(ROOT, "data", "raw", f"era5_shear_global_monthly_{YEARS[0]}-{YEARS[1]}.nc"))
    box, cnx, cny = cl.extract_box(glob, lon0, lon1, lat0, lat1)
    fill = cl.land_fill_indices(box)
    clim12 = cl.monthly_climatology(box, fill) if field == "sst" else cl.monthly_climatology(box, fill, base_years=YEARS)
    anom, times = cl.anomalies(box, clim12, fill) if field == "sst" else cl.anomalies(box, clim12, fill, eof_years=YEARS)       # (T, CN)
    K = J["K"]; patterns = decode(J["eof"], 1000).reshape(K, -1)
    enso_old = decode(J["enso"], 1000).reshape(3, -1)
    enso_new = cl.enso_regression_lagsum(anom, times, n34_times, n34_anom)               # (3, CN): the three sum to the sustained-event response
    # the region: ocean cells of the basin's main development region (2 degree cells; ERSST is NaN over land)
    sbox, _, _ = cl.extract_box(sst, lon0, lon1, lat0, lat1)
    land = cl.land_fill_indices(sbox).flatten()
    la = np.repeat(box["lat"].values, cnx).reshape(cny, cnx).flatten() if False else np.repeat(box["lat"].values[:, None], cnx, axis=1).flatten()
    lo = np.tile(box["lon"].values[None, :], (cny, 1)).flatten() % 360
    m = mdr_box(basin); a0, a1 = sorted(m["lat"]); b0, b1 = (m["lon"][0] % 360, m["lon"][1] % 360)
    inlon = (lo >= b0) & (lo <= b1) if b0 <= b1 else (lo >= b0) | (lo <= b1)
    R = (la >= a0) & (la <= a1) & inlon & ~land
    if R.sum() < 3:
        raise SystemExit(f"{basin}: only {int(R.sum())} ocean cells in the main development region")
    months = cl._month_index(times); cal = (months % 12) + 1
    lookup = dict(zip(cl._month_index(n34_times).tolist(), n34_anom.tolist()))
    X = np.stack([np.array([lookup.get(int(mm - lag), 0.0) for mm in months]) for lag in (0, 3, 6)], axis=1)       # (T, 3) the real index at the three lags
    an = np.nan_to_num(anom)[:, R].mean(axis=1)                                         # (T,) the region's mean anomaly
    resp_old = X @ enso_old[:, R].mean(axis=1); resp_new = X @ enso_new[:, R].mean(axis=1)
    # a storm season is three months, not one: a month's mean carries weather noise the page's own synoptic generator already supplies, so everything is matched on 3-month means centred on the month
    c3 = lambda v: np.convolve(v, np.ones(3) / 3.0, mode="same")
    an3, ro3, rn3 = c3(an), c3(resp_old), c3(resp_new)
    ok = np.ones(len(an), bool); ok[0] = ok[-1] = False
    phi = np.array(J["phi"], float)
    ak = patterns[:, R].mean(axis=1)                                                    # the EOF modes' region means
    vEof = float((ak ** 2 * (3 + 4 * phi + 2 * phi ** 2) / 9).sum())                    # variance of a 3-month mean of the page's EOF part (AR(1) modes of unit variance, lag-1 correlation phi)
    # ENSO gain by month: the slope of the real regional anomaly on the page's reconstruction, pulled toward the all-month value where the month's sample (15 years) cannot say (a Bayesian shrinkage:
    # the prior is the pooled slope with a spread of TAU across months, the month's own estimate has the standard error of its regression)
    TAU = 0.5
    k = np.ones(12); se = np.ones(12); e = np.ones(12); sd_real = np.zeros(12); sd_old = np.zeros(12); sd_new = np.zeros(12); kold = np.zeros(12)
    ap = pp = 0.0
    for mm in range(1, 13):
        s_ = (cal == mm) & ok
        a_ = an3[s_] - an3[s_].mean(); p_ = rn3[s_] - rn3[s_].mean(); po = ro3[s_] - ro3[s_].mean()
        ap += float((a_ * p_).sum()); pp += float((p_ * p_).sum())
        kk = float((a_ * p_).sum() / max(1e-9, (p_ * p_).sum())); k[mm - 1] = kk
        kold[mm - 1] = float((a_ * po).sum() / max(1e-9, (po * po).sum()))
        r_ = a_ - kk * p_
        se[mm - 1] = float(np.sqrt(max(r_.var(ddof=1), 1e-9) / max(1e-9, (p_ * p_).sum())))
    kpool = min(1.0, ap / max(pp, 1e-9))
    kpost = (k / se ** 2 + kpool / TAU ** 2) / (1 / se ** 2 + 1 / TAU ** 2)
    ks = np.clip(smooth12(kpost), 0.2, 1.0)
    for mm in range(1, 13):
        s_ = (cal == mm) & ok
        a_ = an3[s_] - an3[s_].mean(); p_ = rn3[s_] - rn3[s_].mean()
        res = a_ - ks[mm - 1] * p_
        e[mm - 1] = float(np.sqrt(max(res.var(ddof=1), 1e-9) / max(vEof, 1e-9)))
        sd_real[mm - 1] = a_.std(ddof=1)
    es = np.clip(smooth12(e), GMIN, GMAX)
    # the spread the page gives the region's 3-month mean: ENSO part from the real history plus the EOF part (independent), before and after
    for mm in range(1, 13):
        s_ = (cal == mm) & ok
        po = ro3[s_] - ro3[s_].mean(); pn = rn3[s_] - rn3[s_].mean()
        sd_old[mm - 1] = np.sqrt(po.var(ddof=1) + vEof); sd_new[mm - 1] = np.sqrt((ks[mm - 1] ** 2) * pn.var(ddof=1) + (es[mm - 1] ** 2) * vEof)
    f1 = lambda v, w=5, p=2: " ".join(f"{x:{w}.{p}f}" for x in v)
    print(f"{basin:12s} {field:9s} region {int(R.sum())} cells, EOF part sd {np.sqrt(vEof):.2f}; spread of the region's 3-month mean, centred on each month (real | page now | page with the gains):")
    print(f"{'':22s}  months          " + " ".join(f"{x:5d}" for x in range(1, 13)))
    print(f"{'':22s}  real sd         " + f1(sd_real, 5, 2))
    print(f"{'':22s}  page now        " + f1(sd_old, 5, 2))
    print(f"{'':22s}  page with gains " + f1(sd_new, 5, 2))
    print(f"{'':22s}  ENSO gain       " + f1(ks) + f"   (pooled {kpool:.2f}; the one-lag-at-a-time coefficients would need {f1(smooth12(kold))})")
    print(f"{'':22s}  EOF gain        " + f1(es))
    if write:
        J["enso"] = cl.encode_i16(enso_new, 1000)
        J["seas"] = {"enso": [round(float(v), 2) for v in ks], "eof": [round(float(v), 2) for v in es]}
        json.dump(J, open(path, "w"))
        print(f"wrote {path}")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        raise SystemExit(__doc__)
    write = "--write" in sys.argv
    sst = cl.load(os.path.join(ROOT, "data", "raw", "ersstv5.nc"))
    n34_times, n34_anom = cl.nino34_index(sst)
    for basin in args:
        for field in ("humidity", "shear") + (("sst",) if "--sst" in sys.argv else ()):
            analyse(basin, field, sst, n34_times, n34_anom, write and field != "sst")


if __name__ == "__main__":
    main()
