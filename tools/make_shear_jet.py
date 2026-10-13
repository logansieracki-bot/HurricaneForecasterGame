#!/usr/bin/env python3
"""Builds an explicit jet-stream AXIS feature for Wind Shear -- a continuous, meandering band of
elevated shear, instead of the diffuse statistical noise field make_shear_synoptic.py's own
EOF-on-the-field-value approach produced. See docs/roadmap.md for why this exists: the user drew
a real jet-stream chart over a screenshot of the field-value approach and asked for a continuous,
flowing ribbon with troughs as dips, not scattered patches -- a structurally different thing from
"how much does each point's own shear vary," which is what the old approach modeled.

Checked directly against 5 years of real daily ERA5 200-850 hPa shear, restricted to the
Atlantic's own Jun-Nov season, before building anything (same discipline as every other field
here): for each day and each longitude, find the latitude of peak shear within a jet-relevant
band (20-65N) -- this traces a real daily "axis" the same way a person reading an actual chart
would. Two things fall out of that directly:

1. The axis's own LATITUDE (as a function of longitude) decomposes far more efficiently into EOF
   wave modes than the raw field value does -- cumulative top-6 explains 65% of the axis's own
   variance (vs. only 31% for shear's raw field-value EOF, see make_shear_synoptic.py's own
   superseded docstring) -- confirming the axis position is the real underlying coherent degree
   of freedom; modeling field value directly via EOF was capturing a blurry echo of the same
   motion. So this file REPLACES that old field-value EOF entirely with axis-latitude EOF modes
   (real spatial wave patterns + real daily persistence, same compute_eofs() technique, just
   applied to a (days, longitude) matrix instead of (days, space)).

2. The TRUE instantaneous cross-axis shear profile -- found by re-centering each day's own
   profile on THAT day's own axis position before averaging, not a plain climatological average
   across many different axis positions mixed together (which smears/flattens it) -- is a real,
   sharp ribbon: ~75 kt peak, tapering to a ~25 kt background by about 15-16 deg either side,
   half-width ~7 deg. This is what actually gets rendered as the band's own cross-section.

ENSO's direct effect on the axis's own daily latitude/strength came back statistically weak in
this same real data (correlation near zero in a raw regression) -- a real finding, not something
to paper over with an invented effect. The honest "ENSO influenced" channel is the one already
verified in Phase 1 (make_shear.py): El Nino measurably raises shear magnitude at the MDR. This
script's own jet bump is added ON TOP of that existing climatology+interannual-EOF+ENSO value
(see the combine loop in template.html), so when Phase 1's own ENSO term raises the background,
the jet's peak rises with it too, through the real mechanism, not a fabricated axis-specific one.

OTHER BASINS. The same method runs for every basin, with two generalizations (the Atlantic's own
numbers are reproduced exactly when neither is switched on -- `--no-extend` below):
  * Hemisphere. The search band is a signed latitude interval: NH 20..65 (the default), SH -65..-20
    (pass `-65,-20`). Nothing else in the method is hemisphere-specific.
  * An ANALYSIS box wider than the displayed one. Most basins' boxes don't contain the whole band
    (a tropical basin's box stops at 32N; the jet is at 33N on average there), and a jet axis that
    sits just outside the displayed box still throws its flank across the box edge. So the axis is
    traced, and the ribbon profile and the smear are measured, on the displayed box's longitudes
    and an extended latitude range (the displayed rows plus the band, padded by the ribbon's 12 deg
    support so every cell a ribbon can touch is counted). Only the per-cell outputs (smear) are cut
    back to the displayed rows; the axis (meanPath/eof) and the profile are properties of the jet,
    not of the box.

Usage: python3 tools/make_shear_jet.py <basin> <lon0> <lon1> <lat0> <lat1> <months> [k] [band_lo,band_hi] [--no-extend]
  e.g. python3 tools/make_shear_jet.py atlantic -110 40 -40 72 6,7,8,9,10,11 8 20,65 --no-extend
       python3 tools/make_shear_jet.py aus 90 176 -44 4 11,12,1,2,3,4 8 -65,-20
"""
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import climate_lib as cl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYNOPTIC_YEARS = (2017, 2021)   # same window make_shear_synoptic.py uses, same reasoning
JET_LAT_LO, JET_LAT_HI = 20, 65   # default (northern-hemisphere) search band for the axis -- wide enough to let it wander (real measured std ~9-14 deg), narrow enough to exclude the deep tropics and the polar cap
SUPPORT = 12.0   # deg: past this the ribbon is 0 by construction, whatever is left belongs to the background


def jet_band(lat1, cny, band=(JET_LAT_LO, JET_LAT_HI)):
    """Row indices (and latitudes) of the coarse grid that fall inside the jet search band, plus
    the full latitude column -- shared with make_shear_synoptic.py, which needs the exact same
    band to subtract the jet's own explained part before fitting its local texture."""
    lats = lat1 - np.arange(cny) * cl.CRES
    jet_rows = np.where((lats >= band[0]) & (lats <= band[1]))[0]
    assert len(jet_rows) >= 5, "jet search band too narrow for this basin/domain -- widen JET_LAT_LO/HI"
    return lats, jet_rows, lats[jet_rows]


def analysis_lat_range(lat0, lat1, band, extend=True):
    """Latitude extent of the ANALYSIS box: the displayed rows plus the whole search band, padded
    by the ribbon's support, snapped outward to the 2 deg grid and kept inside the ERSST grid
    (-88..88) the global caches sit on."""
    if not extend:
        return lat0, lat1
    lo = min(lat0, band[0] - SUPPORT)
    hi = max(lat1, band[1] + SUPPORT)
    return max(-88, int(2 * math.floor(lo / 2))), min(88, int(2 * math.ceil(hi / 2)))


def trace_axis(sub, jet_lats):
    """Daily axis latitude per longitude from (T, band_rows, cnx) daily shear: row of max shear
    within the jet band, refined with a 3-point parabolic interpolation around the discrete max
    so the axis isn't snapped to the 2 deg grid (the same real sub-grid precision a person
    tracing a smooth curve by eye would have, not available to a naive argmax alone)."""
    T, _, cnx = sub.shape
    axis_row_f = np.full((T, cnx), np.nan)
    for t in range(T):
        for c in range(cnx):
            col = sub[t, :, c]
            if np.all(np.isnan(col)):
                continue
            i = int(np.nanargmax(col))
            if 0 < i < len(col) - 1 and not (np.isnan(col[i - 1]) or np.isnan(col[i + 1])):
                y0, y1, y2 = col[i - 1], col[i], col[i + 1]
                denom = y0 - 2 * y1 + y2
                delta = 0.5 * (y0 - y2) / denom if abs(denom) > 1e-6 else 0.0
                delta = max(-1.0, min(1.0, delta))
            else:
                delta = 0.0
            axis_row_f[t, c] = i + delta
    return np.interp(axis_row_f, np.arange(len(jet_lats)), jet_lats)


def load_analysis(lon0, lon1, lat0, lat1, months, band=(JET_LAT_LO, JET_LAT_HI), extend=True):
    """Everything the jet analysis needs, on the analysis box: the monthly climatology (the baseline
    the client ADDS the jet bump onto, so the bump has to be measured as excess over exactly
    this), the real daily shear in the basin's own season, and the traced daily axis. Shared with
    make_shear_synoptic.py so both scripts trace the identical axis."""
    sst = cl.load(os.path.join(ROOT, "data", "raw", "ersstv5.nc"))
    elat0, elat1 = analysis_lat_range(lat0, lat1, band, extend)

    monthly_cache = os.path.join(ROOT, "data", "raw", "era5_shear_global_monthly_2007-2021.nc")
    shear_monthly = cl.load_era5_shear(sst["lat"], sst["lon"], 2007, 2021, cache_path=monthly_cache)
    box_m, cnx, ecny = cl.extract_box(shear_monthly, lon0, lon1, elat0, elat1)
    fill = cl.land_fill_indices(box_m)
    clim12 = cl.monthly_climatology(box_m, fill, base_years=(2007, 2021))   # (12, ecny*cnx)
    clim3 = clim12.reshape(12, ecny, cnx)

    daily_cache = os.path.join(
        ROOT, "data", "raw",
        f"era5_shear_global_daily_{SYNOPTIC_YEARS[0]}-{SYNOPTIC_YEARS[1]}_allmonths.nc",
    )
    shear_daily_all = cl.load_era5_shear_daily(
        sst["lat"], sst["lon"], SYNOPTIC_YEARS[0], SYNOPTIC_YEARS[1],
        months=None, cache_path=daily_cache,
    )
    shear_daily = shear_daily_all.sel(time=shear_daily_all["time"].dt.month.isin(list(months)))
    box_d, cnx_d, ecny_d = cl.extract_box(shear_daily, lon0, lon1, elat0, elat1)
    assert (cnx_d, ecny_d) == (cnx, ecny)

    lats, jet_rows, jet_lats = jet_band(elat1, ecny, band)
    vals = box_d.transpose("time", "lat", "lon").values   # (T, ecny, cnx)
    sub = vals[:, jet_rows, :]
    axis_lat = trace_axis(sub, jet_lats)
    cny = int(round((lat1 - lat0) / cl.CRES)) + 1
    r0 = int(round((elat1 - lat1) / cl.CRES))   # first row of the DISPLAYED box inside the analysis box
    return dict(
        cnx=cnx, cny=cny, ecny=ecny, r0=r0, elat1=elat1, lats=lats, jet_rows=jet_rows, vals=vals, sub=sub,
        clim3=clim3, months_d=box_d["time"].dt.month.values, axis_lat=axis_lat, band=band,
    )


def build(basin, lon0, lon1, lat0, lat1, months, k=8, band=(JET_LAT_LO, JET_LAT_HI), extend=True, out_dir=None):
    A = load_analysis(lon0, lon1, lat0, lat1, months, band, extend)
    cnx, cny, ecny, r0, elat1, lats, jet_rows = A["cnx"], A["cny"], A["ecny"], A["r0"], A["elat1"], A["lats"], A["jet_rows"]
    vals, sub, clim3, months_d, axis_lat = A["vals"], A["sub"], A["clim3"], A["months_d"], A["axis_lat"]
    T = sub.shape[0]

    mean_path = np.nanmean(axis_lat, axis=0)   # (cnx,) -- the real season-climatological axis shape
    anom = axis_lat - mean_path[None, :]
    a = np.nan_to_num(anom, nan=0.0)
    patterns, pcs, phi = cl.compute_eofs(a, k)   # patterns: (k, cnx) deg lat per +1 sigma; phi: real DAILY lag-1 autocorrelation per mode, already daily-native
    k = patterns.shape[0]

    # Re-centered (axis-following) cross-axis shear profile: for every day and every longitude,
    # resample that column's real shear profile onto a common grid of offsets from THAT day's
    # own axis position, then average across all of them. This is the TRUE instantaneous shape
    # -- a plain climatological average mixes together many different daily axis positions and
    # smears/flattens the real peak (confirmed directly: the plain climatological profile at
    # lon=-50 peaks at only 51.6 kt; this re-centered one peaks at ~75 kt).
    offsets_deg = np.arange(-20, 20.1, 2.0)
    profile_sum = np.zeros_like(offsets_deg)
    profile_n = np.zeros_like(offsets_deg)
    for t in range(T):
        for c in range(cnx):
            ax = axis_lat[t, c]
            if np.isnan(ax):
                continue
            col = vals[t, :, c] - clim3[months_d[t] - 1, :, c]   # EXCESS over that day's own month's climatology, not the raw value -- the client adds this bump onto that same climatology, and the climatology already holds a smeared copy of the jet (~35 kt at the axis), so adding a raw-value profile on top would double-count it
            valid = ~np.isnan(col)
            if valid.sum() < 5:
                continue
            sample_offsets = lats[valid] - ax
            in_range = (sample_offsets >= -20) & (sample_offsets <= 20)
            if in_range.sum() < 5:
                continue
            # lats (and so sample_offsets) run north-to-south, i.e. descending -- np.interp needs
            # its xp strictly increasing, hence the [::-1] reversal on both arrays together.
            interp_vals = np.interp(offsets_deg, sample_offsets[in_range][::-1], col[valid][in_range][::-1])
            profile_sum += interp_vals
            profile_n += 1
    profile_mean = profile_sum / np.maximum(profile_n, 1)
    # Symmetrize (the real measured profile is only mildly asymmetric -- averaging both sides is
    # a reasonable, simpler game-level representation, not a strong physical asymmetry worth
    # preserving) and keep only the non-negative-offset half plus the peak; the client mirrors it.
    half = (offsets_deg >= 0)
    sym_offsets = offsets_deg[half]
    sym_profile = np.array([
        (profile_mean[offsets_deg == -o][0] + profile_mean[offsets_deg == o][0]) / 2 if o > 0 else profile_mean[offsets_deg == 0][0]
        for o in sym_offsets
    ])
    A_prof = sym_profile.copy()   # E[daily - climatology | offset from that day's axis] -- measured above
    print("  excess over climatology, by offset from the axis:")
    print("   ", ", ".join(f"{o:.0f}:{v:+.1f}" for o, v in zip(sym_offsets, A_prof)))

    # --- Remove the double counting between the climatology and the jet. ---
    # The monthly climatology already holds a smeared copy of the jet (it is the average over days
    # when the jet was HERE and days when it was elsewhere), so rendering "climatology + a jet
    # that moves" counts the jet twice: on any given day the background right next to the jet
    # still carries the smear, and averaged over days the simulated field would run hotter than
    # the real climatology all through the jet's range. Fix: render  background + ribbon  where
    #     background = climatology - smear          (smear = the ribbon's own average over the
    #                                                days' axis positions, per cell)
    #     ribbon(off) = E[daily - background | off] = A(off) + E[smear at that spot | off]
    # By construction the time-mean of the simulated field then equals the real climatology, while
    # any single day shows a sharp ribbon over a quieter background, like the real daily field.
    # The ribbon depends on the smear and the smear on the ribbon, so it's solved by iterating
    # (it is a contraction -- the smear is a heavily averaged copy of the ribbon -- and settles in
    # a handful of passes).
    inside = sym_offsets < SUPPORT
    ok_axis = ~np.isnan(axis_lat)
    cols = np.broadcast_to(np.arange(cnx)[None, :], axis_lat.shape)

    def smear_from(P):
        # (ecny, cnx): this ribbon's average over every day's own axis position, cell by cell
        off = np.abs(lats[None, :, None] - axis_lat[:, None, :])                  # (T, ecny, cnx)
        p = np.interp(np.nan_to_num(off, nan=1e9), sym_offsets, P, right=0.0)
        p = np.where(ok_axis[:, None, :], p, 0.0)
        return p.mean(axis=0)

    def smear_at_offset(smear, off_deg):
        # E[smear at the cell sitting off_deg north/south of the axis], over all days and columns
        tot, n = 0.0, 0
        for sign in (-1.0, 1.0):
            row_f = np.nan_to_num((elat1 - (axis_lat + sign * off_deg)) / cl.CRES, nan=-1.0)
            good = ok_axis & (row_f >= 0) & (row_f <= ecny - 1)
            r0_ = np.clip(np.floor(row_f).astype(int), 0, ecny - 2)
            w = row_f - r0_
            v = smear[r0_, cols] * (1 - w) + smear[r0_ + 1, cols] * w
            tot += v[good].sum()
            n += int(good.sum())
        return tot / max(n, 1)

    def shape(P):
        # Zero outside the support, continuous at its edge (subtract the value there), non-negative,
        # and monotonically non-increasing away from the peak -- real sampling noise (and other jets
        # showing up as secondary peaks a long way off, seen at +/-14-20 deg in the raw profile)
        # has no business becoming a second, fake band.
        edge = P[np.argmax(~inside)]
        P = np.maximum(P - edge, 0.0)
        P = np.where(inside, P, 0.0)
        for i in range(1, len(P)):
            if P[i] > P[i - 1]:
                P[i] = P[i - 1]
        return P

    P = shape(A_prof)
    for it in range(12):
        smear = smear_from(P)
        B = np.array([smear_at_offset(smear, o) for o in sym_offsets])
        P_new = shape(A_prof + B)
        change = float(np.abs(P_new - P).max())
        P = P_new
        if change < 0.05:
            break
    smear = smear_from(P)
    sym_profile = P
    print(f"  ribbon re-derived against the de-smeared background after {it + 1} passes (last change {change:.3f} kt):")
    print("   ", ", ".join(f"{o:.0f}:{v:+.1f}" for o, v in zip(sym_offsets, P)))
    smear_disp = smear[r0:r0 + cny]   # the part of the smear inside the DISPLAYED box -- what the client subtracts from its climatology
    print(f"  smear removed from the background: max={smear.max():.1f} kt (displayed box: {smear_disp.max():.1f}), mean over the jet band={smear[jet_rows].mean():.1f} kt")

    # Sanity check against the real data: the simulated core (background + ribbon peak) should
    # land on the real mean daily value at the axis.
    real_core = float(np.nanmean(np.nanmax(sub, axis=1)))
    rows_at_axis = np.clip(np.round((elat1 - np.nan_to_num(axis_lat, nan=elat1)) / cl.CRES).astype(int), 0, ecny - 1)
    sim_core = float(np.mean([
        clim3[months_d[t] - 1, rows_at_axis[t, c], c] - smear[rows_at_axis[t, c], c] + P[0]
        for t in range(T) for c in range(cnx) if ok_axis[t, c]
    ]))
    print(f"  core check: real mean daily shear at the axis = {real_core:.1f} kt, simulated core = {sim_core:.1f} kt")

    out = {
        "K": k,
        "band": [band[0], band[1]],                                   # the latitude band the axis was traced in (deg, signed)
        "meanPath": [round(float(x), 2) for x in mean_path],         # deg latitude, one per coarse longitude column
        "eof": cl.encode_i16(patterns, 100),                          # deg latitude per +1 sigma of each mode * 100
        "phi": [round(float(x), 4) for x in phi],                     # already-daily lag-1 autocorrelation per mode
        "profileOffsets": [round(float(x), 1) for x in sym_offsets],  # deg from axis, 0..20
        "profileKt": [round(float(x), 1) for x in sym_profile],       # ribbon: kt ABOVE the de-smeared background at that offset from the axis
        "smear": cl.encode_i16(smear_disp.flatten(), 10),             # kt * 10, (cny*cnx) row-major, DISPLAYED box -- the client subtracts this from the climatology
    }

    out_dir = out_dir or os.path.join(ROOT, "data", "generated")
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, f"{basin}-shear-jet.json")
    with open(dest, "w") as f:
        json.dump(out, f)
    print(f"wrote {dest}")
    print(f"  cnx={cnx} cny={cny} (analysis rows {ecny}, displayed box starts at row {r0}) K={k} samples(days)={T}")
    var_explained = (np.linalg.svd(a, compute_uv=False) ** 2)
    var_explained = var_explained / var_explained.sum()
    print(f"  cumulative variance explained by top {k} axis modes: {var_explained[:k].sum()*100:.1f}%")
    print(f"  phi (daily persistence per mode): {out['phi']}")
    print(f"  mean path range: {min(out['meanPath']):.1f} to {max(out['meanPath']):.1f} deg latitude")
    inbox = (axis_lat >= lat0) & (axis_lat <= lat1) & ok_axis
    print(f"  axis inside the displayed box: {inbox.sum() / max(ok_axis.sum(), 1) * 100:.1f}% of day-columns")
    print(f"  cross-axis profile: peak={sym_profile[0]:.1f} kt, background={sym_profile[-1]:.1f} kt")
    for o, v in zip(sym_offsets, sym_profile):
        print(f"    +/-{o:4.1f} deg: {v:5.1f} kt")
    return out


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    basin = args[0]
    lon0, lon1, lat0, lat1 = (float(x) for x in args[1:5])
    months = [int(x) for x in args[5].split(",")]
    k = int(args[6]) if len(args) > 6 else 8
    band = tuple(float(x) for x in args[7].split(",")) if len(args) > 7 else (JET_LAT_LO, JET_LAT_HI)
    build(basin, lon0, lon1, lat0, lat1, months, k, band, extend="--no-extend" not in flags)
