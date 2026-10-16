#!/usr/bin/env python3
"""The real figures behind STEER_SPECS' jet entries (tests/run.mjs): the REAL jet-ribbon composite for one basin, sampled exactly as the test samples the simulation: on the real daily axis (traced as make_shear_jet.py does, 5-point running
mean), at longitudes lonLo..lonHi every 4 degrees, on the days of the given months, where the axis' |latitude| lies in [latLo, latHi]: the deep-layer wind component along the
axis' local direction at the axis, its median angle off that direction, the share within 45 degrees, and the stripe (how much weaker that component is 10 degrees poleward /
equatorward of the axis). All on the analysis box (the displayed rows plus the whole jet band), like make_steer_weather.py.
usage: real_steer_axis.py <lon0> <lon1> <lat0> <lat1> <band lo,hi signed> <months e.g. 6,7,8> <lonLo> <lonHi> <latLo> <latHi> <hem +1/-1>"""
import os, sys, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_shear_jet as msj
import make_steer_weather as mw
a = sys.argv[1:]
lon0, lon1, lat0, lat1 = map(float, a[:4]); band = tuple(float(x) for x in a[4].split(",")); months = [int(m) for m in a[5].split(",")]
lonLo, lonHi, latLo, latHi, hem = float(a[6]), float(a[7]), float(a[8]), float(a[9]), int(a[10])
elat0, elat1 = msj.analysis_lat_range(lat0, lat1, band, True)
X, times, lat, lon = mw.box_arrays(lon0, lon1, elat0, elat1)
AN = msj.load_analysis(lon0, lon1, lat0, lat1, list(range(1, 13)), band, True)
axis = AN["axis_lat"]
def runmean(x, n=5):
    k = np.ones(n) / n; pad = n // 2
    return np.stack([np.convolve(np.pad(r, pad, mode="edge"), k, mode="valid") for r in x])
A = runmean(axis, 5)
U, V = X["u_d"], X["v_d"]
mon = times.astype("datetime64[M]").astype(int) % 12 + 1
sel = np.where(np.isin(mon, months))[0]
lons = np.arange(lonLo, lonHi + 0.01, 4.0)
along, ang, npol, nequ = [], [], [], []
def wind(t, j, la, tx, ty):
    u = np.interp(-la, -lat, U[t, :, j]); v = np.interp(-la, -lat, V[t, :, j]); return u * tx + v * ty, u, v
for t in sel:
    for ln in lons:
        j = int(round((ln - lon[0]) / 2.0))
        if j < 2 or j > len(lon) - 3: continue
        ax = A[t, j]
        if ax * hem < latLo or ax * hem > latHi: continue
        slope = (A[t, j + 2] - A[t, j - 2]) / 8.0
        c = np.cos(np.radians(ax)); n = np.hypot(c, slope); tx, ty = c / n, slope / n
        al, u, v = wind(t, j, ax, tx, ty); along.append(al)
        d = abs(np.degrees(np.arctan2(v, u)) - np.degrees(np.arctan2(ty, tx))); ang.append(360 - d if d > 180 else d)
        lp, le = ax + 10 * hem, ax - 10 * hem
        if lat[-1] <= lp <= lat[0] and lat[-1] <= le <= lat[0]:
            npol.append(wind(t, j, lp, tx, ty)[0]); nequ.append(wind(t, j, le, tx, ty)[0])
along, ang = np.array(along), np.array(ang)
res = dict(n=int(len(along)), along=round(float(along.mean()), 1), p10=round(float(np.percentile(along, 10)), 1), p90=round(float(np.percentile(along, 90)), 1),
           ang=round(float(np.median(ang)), 0), within45=round(float((ang < 45).mean()), 2), stripePol=round(float(along.mean() - np.mean(npol)), 1), stripeEqu=round(float(along.mean() - np.mean(nequ)), 1), nStripe=len(npol))
print(json.dumps(res))
