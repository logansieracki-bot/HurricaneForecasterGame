#!/usr/bin/env python3
"""Literature-based targets and maps for a basin the best-track tables do not hold (the South Atlantic: 3 tracks; the Mediterranean: none).

Reads an entry of tools/tc_synthetic.json (per-season normals, the season's shape, where the cyclones form, how strong they get, how long they last) and writes data/generated/<basin>-tc-ref.json and
<basin>-tc-maps.json of the same shape tools/make_tc_basin.py makes from the record, so that the fit, the lab, the calibration and the season summary work on them unchanged. What cannot be known
is left neutral: the El Nino response (none), the drift (the maps hold the marker 'steer': the engine moves a storm with the page's own mean steering, tools/storm_fit.mjs assembles it), the
daily ACE curve (the season's shape integrated, the spread between seasons lognormal with the normals' own standard deviation).
usage: make_tc_synthetic.py <basin>"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import make_tc_basin as mb  # noqa: E402

MDAYS = mb.MDAYS
MSTART = mb.MSTART
r = mb.r


def season_curve(month_weights, season_month):
    """daily weights over the 366 days of a season (the engine's own interpolation between the middles of the months), normalised to sum 1"""
    out = np.zeros(366)
    for d in range(366):
        doy = (int(MSTART[season_month]) + d) % 365
        p = (doy + 0.5) / 30.4375 - 0.5; i = int(np.floor(p)); t = p - i
        out[d] = (1 - t) * month_weights[i % 12] + t * month_weights[(i + 1) % 12]
    return out / out.sum()


def main():
    basin = sys.argv[1] if len(sys.argv) > 1 else None
    spec_all = json.load(open(os.path.join(HERE, "tc_synthetic.json")))
    spec_all.pop("_", None)
    if basin not in spec_all:
        raise SystemExit("usage: make_tc_synthetic.py <%s>" % "|".join(spec_all))
    S = spec_all[basin]; B = mb.cfg(basin); G = mb.Grid(B["grid"]); month = B["seasonMonth"]
    n = S["normals"]; gm = np.array(S["genesis_by_month"], float); gm = gm / gm.sum()
    years = list(range(B["years"][0], B["years"][1] + 1))

    # ---- the maps: genesis density per year (depressions), class T and S, by month and node
    mapsT = np.zeros((12, G.ny, G.nx)); mapsS = np.zeros_like(mapsT)
    wsum = sum(c["w"] for c in S["centers"])
    for m in range(12):
        for c in S["centers"]:
            d2 = ((G.lats[:, None] - c["lat"]) / c["sd_lat"]) ** 2 + ((G.lons[None, :] - c["lon"]) * np.cos(np.radians(c["lat"])) / c["sd_lon"]) ** 2
            w = np.exp(-0.5 * d2); w /= w.sum()
            mapsT[m] += gm[m] * (1 - S["sub_share"]) * n["tracks"] * c["w"] / wsum * w
            mapsS[m] += gm[m] * S["sub_share"] * n["tracks"] * c["w"] / wsum * w

    # ---- the targets
    cv = n["ace_sd"] / max(n["ace_mean"], 1e-6); sig = np.sqrt(np.log(1 + cv * cv))
    daily = season_curve(gm, month) * n["ace_mean"]                       # the season's mean ACE by day (shaped like the genesis, a little later)
    shift = 12; daily = np.roll(daily, shift); daily[:shift] = 0; daily *= n["ace_mean"] / daily.sum()      # named storms peak a few days after the depressions
    cum = np.cumsum(daily)
    z = {"p10": -1.2816, "p25": -0.6745, "p50": 0.0, "p75": 0.6745, "p90": 1.2816}
    ace_c = {"mean": [r(v, 1) for v in cum]}
    for k, zz in z.items():
        ace_c[k] = [r(v * np.exp(sig * zz - 0.5 * sig * sig), 1) for v in cum]
    ace_c["min"] = [r(v * n["ace_min"] / max(n["ace_mean"], 1e-6), 1) for v in cum]; ace_c["max"] = [r(v * n["ace_max"] / max(n["ace_mean"], 1e-6), 1) for v in cum]
    ncum = np.cumsum(np.roll(season_curve(gm, month), shift)) * n["named"]
    named_c = {"mean": [r(v, 2) for v in ncum]}
    for k, zz in z.items():
        named_c[k] = [r(v * np.exp(0.5 * zz * 0.5), 2) for v in ncum]
    named_c["min"] = [0.0] * 366; named_c["max"] = [r(v * 3.5, 2) for v in ncum]
    named_by_month = [r(v * n["named"], 3) for v in gm]; dep_by_month = [r(v * n["tracks"], 3) for v in gm]
    mean_lat = sum(c["lat"] * c["w"] for c in S["centers"]) / wsum
    sgn = 1.0 if B["hemisphere"] == "N" else -1.0
    rng = np.random.default_rng(7)
    pts = []                                                              # quantiles of the genesis places from the blobs
    for c in S["centers"]:
        k = int(round(4000 * c["w"] / wsum))
        pts += list(zip(rng.normal(c["lat"], c["sd_lat"], k), rng.normal(c["lon"], c["sd_lon"], k)))
    la = np.array([p[0] for p in pts]); lo = np.array([p[1] for p in pts])
    refj = dict(
        meta=dict(source="literature: " + S["source"], generator="tools/make_tc_synthetic.py", basin=basin, normals=[years[0], years[-1]], seasonMonth=month, tracks=0, synthetic=True,
                  definitions="by wind (named 34 kt, hurricane-strength 64, major 96, category 5 137; depression 25 kt), as tools/make_tc_basin.py; the numbers are approximate"),
        normals=dict(years=[years[0], years[-1]], tracks=n["tracks"], named=n["named"], hurricanes=n["hurricanes"], majors=n["majors"], cat5=n["cat5"], ace_mean=n["ace_mean"], ace_sd=n["ace_sd"],
                     ace_min=n["ace_min"], ace_max=n["ace_max"], ns_sd=n["ns_sd"], h_sd=n["h_sd"], mh_sd=n["mh_sd"], ace_median_day=int(np.argmax(cum >= cum[-1] / 2.0)), ace_peak_day_smoothed=int(np.argmax(daily)), by_year={}),
        genesis=dict(named_by_month=named_by_month, depression_by_month=dep_by_month, depression_lat_quantiles=[r(np.percentile(la, q), 1) for q in (2, 5, 10, 25, 50, 75, 95)],
                     depression_abslat_quantiles=[r(np.percentile(np.abs(la), q), 1) for q in (2, 5, 10, 25, 50, 75, 95)],
                     depression_lon_quantiles=[r(np.percentile(lo, q), 1) for q in (5, 25, 50, 75, 95)], named_lat_quantiles=[r(np.percentile(la, q), 1) for q in (5, 25, 50, 75, 95)],
                     named_lon_quantiles=[r(np.percentile(lo, q), 1) for q in (5, 25, 50, 75, 95)], depression_count=int(round(n["tracks"] * len(years))), named_of_depressions=S["named_of_depressions"],
                     td_to_ts_hours_quantiles=[12, 24, 36, 60, 96]),
        ace_curve=ace_c, named_curve=named_c,
        intensity_change=dict(n_all=0, ri_frac_all=S["ri_frac_all"], rw_frac=0.01, ri50=0.003, ri65=0.001, ri_per_season=0.0, q=[-10, -5, 0, 5, 10, 20], by_month=[S["ri_frac_all"]] * 12,
                              ri_track_fractions={"HU": dict(n=0, with_ri=0, frac=0.5), "MH": dict(n=0, with_ri=0, frac=0.5)}),
        motion=dict(weak=[], hurricane=[], all_tc_speed_quantiles=[3, 6, 9, 13, 20]),
        lifetime=dict(named_days_quantiles=[0.5, 1.0, 2.0, 3.5, 6.5], mean_named_days=S["lifetime"]["mean_named_days"], short_lived_lt_2d=S["lifetime"]["short_lived_lt_2d"]),
        peak=dict(hist_edges=list(range(30, 180, 10)), hist=[0] * 14, mean=S["peak"]["mean"], median=S["peak"]["mean"] - 3, frac_ge64=S["peak"]["frac_ge64"], frac_ge96=S["peak"]["frac_ge96"], frac_ge113=0.0, frac_ge137=S["peak"]["frac_ge137"]),
        status=dict(et_fraction_of_named=S["status"]["et_fraction_of_named"], et_per_year=r(S["status"]["et_fraction_of_named"] * n["named"], 2), subtropical_storms_per_year=S["status"]["subtropical_storms_per_year"],
                    tracks_per_year=n["tracks"], named_per_year=n["named"], cut_fraction=0.1),
        enso=dict(months=B["ensoMonths"], threshold=0.5, index={}, elnino=dict(n=0, ns=None, h=None, ace=None, ace_sd=None), neutral=dict(n=0, ns=None, h=None, ace=None, ace_sd=None),
                  lanina=dict(n=0, ns=None, h=None, ace=None, ace_sd=None), ace_ratio_lanina_over_elnino=None, slope_ln_ace10=0.0, r_ln_ace10=0.0),
    )
    gen_events = n["tracks"] * len(years)
    maps = dict(meta=dict(source=refj["meta"]["source"], basin=basin, synthetic=True, genesis_years=[B["genesisYears"][0], B["genesisYears"][1]], drift_years=None,
                          smoothing=dict(genesis_deg="Gaussian blobs", genesis_days="monthly shape", drift_estimator="the page's mean steering")),
                grid=dict(lon0=G.lon0, lat0=G.lat0, res=G.res, nx=G.nx, ny=G.ny),
                genesis=dict(events=int(round(gen_events)), events_T=int(round(gen_events * (1 - S["sub_share"]))), events_S=int(round(gen_events * S["sub_share"])), per_year=n["tracks"],
                             T=[mb.rr(m, 4) for m in mapsT], S=[mb.rr(m, 4) for m in mapsS], by_month_T=mb.rr(mapsT.sum(axis=(1, 2)), 3), by_month_S=mb.rr(mapsS.sum(axis=(1, 2)), 3)),
                drift="steer")
    gen_dir = os.path.join(ROOT, "data", "generated")
    json.dump(refj, open(os.path.join(gen_dir, f"{basin}-tc-ref.json"), "w"), separators=(",", ":"))
    json.dump(maps, open(os.path.join(gen_dir, f"{basin}-tc-maps.json"), "w"), separators=(",", ":"))
    print(f"{basin}: wrote the literature-based reference and maps: {n['tracks']} depressions, {n['named']} named, {n['hurricanes']} hurricane-strength, ACE {n['ace_mean']} a season; genesis {mapsT.sum() + mapsS.sum():.2f} a year over {len(S['centers'])} centres")


if __name__ == "__main__":
    main()
