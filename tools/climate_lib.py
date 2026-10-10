"""Shared climatology pipeline: turns raw ERSST v5 into the coarse-grid arrays
src/template.html expects (clim/eof/enso/phi), for any basin's domain box.

Basin-independent physics (the ENSO oscillator's own calibration, the seaCeil
latitude table) stays hardcoded in template.html, unchanged across basins --
only the *spatial* pieces (climatology, EOF patterns, ENSO regression) are
basin-specific and come from here.
"""
import base64
import numpy as np
import xarray as xr

CRES = 2.0
BASE_YEARS = (1991, 2020)   # climatology baseline, matches the Atlantic build's own docs
EOF_YEARS = (1970, 2021)    # matches the Atlantic build's documented EOF window
NINO34_BOX = dict(lon0=-170, lon1=-120, lat0=-5, lat1=5)


def load(path):
    ds = xr.open_dataset(path)
    sst = ds["sst"]
    # ERSST longitudes run 0..358; re-index to -180..180 so basin boxes (which
    # cross the antimeridian for some basins, the prime meridian for others)
    # can be expressed in the same convention the app already uses.
    lon180 = ((sst["lon"] + 180) % 360) - 180
    sst = sst.assign_coords(lon=lon180).sortby("lon")
    return sst.sortby("lat")   # ascending lat: -88..88


def extract_box(sst, lon0, lon1, lat0, lat1):
    """Coarse-grid slice on a 2 deg grid, returned north-to-south / west-to-east
    (row 0 = lat1) to match how the app's domain.clat0/clon0 are defined."""
    if lon1 < lon0:
        # Crosses the antimeridian for real (South Pacific: 160E to -120/120W, unlike
        # WPAC's own box which only touches it at exactly 180) -- lon1 is given in the
        # same -180..180 convention as everywhere else, so a lon1 *less than* lon0 is
        # the signal this box wraps around through the dateline rather than running
        # backwards. Slice the two real pieces on either side and concat in order: the
        # western piece up to the last real column before the dateline (178, the same
        # "stop short, let the eastern piece supply the dateline column itself" trick
        # the lon1==180 case below uses), then the eastern piece starting exactly at
        # the dateline's own -180 label through lon1.
        main = sst.sel(lon=slice(lon0, 178), lat=slice(lat0, lat1))
        edge = sst.sel(lon=slice(-180, lon1), lat=slice(lat0, lat1))
        box = xr.concat([main, edge], dim="lon")
        cnx = int(round(((lon1 + 360) - lon0) / CRES)) + 1
    elif lon1 == 180:
        # 180E and 180W are the same meridian, but load()'s -180..180 re-index only
        # keeps the -180 label for it (():(180+180)%360-180 == -180), never +180 --
        # so a plain slice(lon0, 180) comes up one column short at the east edge.
        # Slice up to the last real column below it (178) and append the -180
        # column itself as the requested 180 edge; its actual coordinate label
        # doesn't matter downstream since climate/geo both flatten by position,
        # not by looking the label back up.
        main = sst.sel(lon=slice(lon0, 178), lat=slice(lat0, lat1))
        edge = sst.sel(lon=[-180], lat=slice(lat0, lat1))
        box = xr.concat([main, edge], dim="lon")
        cnx = int(round((lon1 - lon0) / CRES)) + 1
    else:
        box = sst.sel(lon=slice(lon0, lon1), lat=slice(lat0, lat1))
        cnx = int(round((lon1 - lon0) / CRES)) + 1
    box = box.sortby("lat", ascending=False)   # north first
    cny = int(round((lat1 - lat0) / CRES)) + 1
    assert box.sizes["lon"] == cnx, f"lon size {box.sizes['lon']} != {cnx}"
    assert box.sizes["lat"] == cny, f"lat size {box.sizes['lat']} != {cny}"
    return box, cnx, cny


def land_fill_indices(box):
    """Boolean invalid (land) mask from the temporal mean's NaN pattern -- land
    is NaN in every timestep, so this mask doesn't change over time."""
    mean2d = box.mean("time").values
    return ~np.isfinite(mean2d)


def apply_fill(vals2d, invalid, iterations=300):
    """Diffusion fill: each invalid cell relaxes toward the average of its 4
    neighbors, repeated until the filled region blends smoothly into the real
    data around it (Jacobi iteration solving Laplace's equation with the valid
    cells as fixed boundary values -- standard image-inpainting technique).

    Replaces a nearest-valid-cell fill, which was fine for a coastline the 2 deg
    ERSST grid resolves reasonably well, but produced a real, visible bug for a
    basin box a strait/gulf much narrower than 2 deg (Gulf of California is a
    prime example): most of its coarse cells are themselves invalid (majority
    land at that resolution), so nearest-fill gave them all the *same* borrowed
    value from whatever distant real ocean cell happened to be closest -- flat,
    repeated patches with a hard multi-degree step right where that patch met
    the next one. Diffusion fill has no such single borrowed source: it blends
    continuously from every direction, so there's no seam to begin with."""
    if not invalid.any():
        return vals2d
    out = np.where(invalid, np.nanmean(vals2d), vals2d)
    valid = ~invalid
    for _ in range(iterations):
        up = np.vstack([out[:1], out[:-1]])
        down = np.vstack([out[1:], out[-1:]])
        left = np.hstack([out[:, :1], out[:, :-1]])
        right = np.hstack([out[:, 1:], out[:, -1:]])
        avg = (up + down + left + right) / 4
        out = np.where(valid, vals2d, avg)
    return out


def monthly_climatology(box, fill, base_years=BASE_YEARS):
    """12 x (cny*cnx) climatology, deg C, averaged over base_years. Defaults to the module's
    own BASE_YEARS (ERSST's 1991-2020 baseline) so every existing SST call site is unaffected
    -- a humidity build passes its own, deliberately shorter window explicitly (see
    make_humidity.py) rather than silently inheriting SST's, since .sel(time=slice(...)) on a
    non-overlapping range returns an empty/partial selection with no error, not an exception."""
    invalid = fill
    y0, y1 = base_years
    sub = box.sel(time=slice(f"{y0}-01-01", f"{y1}-12-31"))
    clim = sub.groupby("time.month").mean("time").transpose("month", "lat", "lon").values
    clim = np.stack([apply_fill(clim[m], invalid) for m in range(12)])
    return clim.reshape(12, -1)   # (12, cny*cnx), row-major matching cny,cnx


def anomalies(box, clim12, fill, eof_years=EOF_YEARS):
    """Monthly anomalies over eof_years relative to the (already-filled) climatology. Defaults
    to the module's own EOF_YEARS for the same backward-compatibility reason as
    monthly_climatology's own base_years parameter."""
    invalid = fill
    y0, y1 = eof_years
    sub = box.sel(time=slice(f"{y0}-01-01", f"{y1}-12-31"))
    months = sub["time"].dt.month.values
    raw = sub.transpose("time", "lat", "lon").values
    filled = np.stack([apply_fill(raw[t], invalid) for t in range(raw.shape[0])])
    vals = filled.reshape(filled.shape[0], -1)
    clim_per_t = clim12[months - 1]
    return vals - clim_per_t, sub["time"].values   # (T, cny*cnx)


def compute_eofs(anom, k):
    """Top-k EOFs by SVD. Returns (patterns[k, cny*cnx] in deg C per +1 sigma PC,
    pc_time_series[T, k] each unit-variance, phi[k] monthly lag-1 autocorrelation
    of that mode's own PC)."""
    a = np.nan_to_num(anom, nan=0.0)
    # SVD on the (time x space) anomaly matrix
    U, S, Vt = np.linalg.svd(a, full_matrices=False)
    k = min(k, len(S))
    pcs_raw = U[:, :k] * S[:k]            # (T, k), physical-amplitude PC time series
    patterns_raw = Vt[:k, :]              # (k, space), unit-norm spatial patterns
    pc_std = pcs_raw.std(axis=0)
    pcs = pcs_raw / pc_std[None, :]       # unit variance
    patterns = patterns_raw * pc_std[:, None]   # deg C per +1 sigma of the unit-variance PC
    phi = np.array([np.corrcoef(pcs[1:, i], pcs[:-1, i])[0, 1] for i in range(k)])
    return patterns, pcs, phi


def nino34_index(sst_global):
    b = NINO34_BOX
    box = sst_global.sel(lon=slice(b["lon0"], b["lon1"]), lat=slice(b["lat0"], b["lat1"]))
    ts = box.mean(("lat", "lon"))
    y0, y1 = BASE_YEARS
    clim = ts.sel(time=slice(f"{y0}-01-01", f"{y1}-12-31")).groupby("time.month").mean("time")
    months = ts["time"].dt.month.values
    anom = ts.values - clim.values[months - 1]
    return ts["time"].values, anom   # monthly Nino 3.4 SST anomaly, deg C


def _month_index(times):
    """Integer months-since-epoch, so lag arithmetic is plain integer subtraction
    (avoids numpy datetime64 unit-casting headaches)."""
    t = times.astype("datetime64[M]").astype(np.int64)
    return t


def enso_regression(anom_box, box_times, n34_times, n34_anom, lags_months=(0, 3, 6)):
    """Ridge regression of this basin's SST anomaly on the Nino 3.4 index at each
    lag (Nino3.4 leading). Returns (3, cny*cnx) deg C response per deg C of Nino3.4."""
    box_m = _month_index(box_times)
    n34_m = _month_index(n34_times)
    n34_lookup = dict(zip(n34_m.tolist(), n34_anom.tolist()))
    out = []
    for lag in lags_months:
        x = np.array([n34_lookup.get(int(m - lag), 0.0) for m in box_m])
        y = np.nan_to_num(anom_box, nan=0.0)
        xn = x - x.mean()
        denom = (xn @ xn) + 1e-3   # small ridge term
        beta = (xn[None, :] @ y).flatten() / denom
        out.append(beta)
    return np.array(out)   # (3, space)


def encode_i16(arr, scale):
    q = np.round(arr * scale).astype(np.int16)
    return base64.b64encode(q.tobytes()).decode("ascii")


ERA5_ZARR = "gcs://gcp-public-data-arco-era5/ar/1959-2022-6h-240x121_equiangular_with_poles_conservative.zarr"


def load_era5_rh700(target_lat, target_lon, year0, year1, level=700,
                     zarr_path=ERA5_ZARR, cache_path=None):
    """Loads ERA5 reanalysis mid-level relative humidity from the public, unauthenticated
    ARCO-ERA5 archive on Google Cloud Storage (NOAA's own servers are blocked by this
    environment's network policy; GCS is not -- confirmed directly, see the humidity plan).

    Pulls every 6-hourly reading in [year0, year1] and derives relative humidity at each
    individual reading first (RH is nonlinear in specific humidity/temperature, so
    deriving-then-averaging is the correct order, not averaging-then-deriving), then averages
    into one true monthly mean per (year, month) -- the same real quantity
    monthly_climatology()/anomalies() already compute for SST, not a single-day proxy.

    An earlier version of this function sampled only one day a month (the cloud archive's own
    chunking bundles every pressure level and the whole globe into each time-chunk touched, so
    that seemed like the only way to keep a multi-year pull tractable). Measured against the
    live store, the real cost turned out to be dramatically lower than that conservative
    estimate -- a full year of true monthly means (all ~1460 six-hourly readings) took about
    20s, not the many minutes a naive byte-count suggested -- so the single-day proxy's own
    real cost savings weren't worth what it was costing in data quality: it injected enough
    synoptic weather noise into the interannual anomaly field that the EOF decomposition's own
    singular-value spectrum came back essentially flat (mode 1 explained only ~2.5% of
    variance, no elbow at all) and the measured per-mode persistence was noise-dominated
    (several modes' own lag-1 autocorrelation came back negative). True monthly means fixed
    both -- caught by actually checking the EOF spectrum before shipping, not assumed.

    Regrids onto target_lat/target_lon -- pass load()'s own ERSST lat/lon arrays here, not a
    generic/hardcoded grid -- because ERA5's own native grid (1.5 deg) doesn't match ERSST's
    (2.0 deg, baked into this module's own CRES constant and extract_box()'s own size
    assertions). Regridding onto ERSST's exact coordinates up front means every downstream
    function in this file (extract_box, land_fill_indices, apply_fill, compute_eofs,
    enso_regression, encode_i16) needs zero changes, and the client's own single upsample()
    closure (sized once from DATA.domain) can be shared between SST and humidity verbatim.

    Returns a DataArray shaped exactly like load()'s own ERSST output (ascending lat, -180..180
    lon, one timestep per (year,month), dated the 15th as a nominal label) so it feeds
    extract_box() completely unchanged.

    Caches its own pulled/derived/regridded *global* result at cache_path (small, one value per
    basin-independent (year,month)) so a rerun -- including a future basin's own humidity
    build -- doesn't re-hit GCS at all."""
    import os
    if cache_path and os.path.exists(cache_path):
        return xr.open_dataarray(cache_path)

    ds = xr.open_zarr(zarr_path, storage_options={"token": "anon"}, chunks=None)
    sub_all = ds[["specific_humidity", "temperature"]].sel(level=level, method="nearest")

    # Pull and reduce one year at a time, not the whole [year0, year1] range in a single
    # .load() -- loading all years of raw 6-hourly global data at once (~5GB+ of float32 before
    # any of xarray's own intermediate copies during derive/groupby/regrid, each of which can
    # duplicate the array) OOM-killed this process the first time this was tried on the real 15-
    # year range in this container (15GB RAM). One year's worth stays comfortably bounded (a
    # single year measured at ~339MB raw), and the per-year monthly-mean result kept afterward
    # is tiny, so peak memory stays roughly year-sized regardless of how many years this spans.
    yearly_monthly = []
    for year in range(year0, year1 + 1):
        sub = sub_all.sel(time=sub_all["time"].dt.year == year).load()

        # Bolton (1980)/Tetens saturation vapor pressure, then saturation specific humidity,
        # then RH -- per individual 6-hourly reading, before any averaging (see docstring above).
        t_c = sub["temperature"] - 273.15
        e_sat = 6.112 * np.exp(17.67 * t_c / (t_c + 243.5))
        q_sat = 0.622 * e_sat / (level - 0.378 * e_sat)
        rh = 100.0 * sub["specific_humidity"] / q_sat

        # True monthly mean: every reading in the month, not a single sampled day.
        rh = rh.assign_coords(month=rh["time"].dt.month)
        rh_year = rh.groupby("month").mean("time").compute()
        new_times = np.array([f"{year}-{m:02d}-15" for m in rh_year["month"].values], dtype="datetime64[ns]")
        rh_year = rh_year.rename({"month": "time"}).assign_coords(time=new_times)
        yearly_monthly.append(rh_year)
        del sub, rh   # this year's raw/derived arrays are no longer needed once reduced

    rh_monthly = xr.concat(yearly_monthly, dim="time").sortby("time")

    # ERA5's own longitude runs 0..358.5; re-wrap to -180..180, same convention load() already
    # uses for ERSST, before regridding onto ERSST's own exact coordinates.
    lon180 = ((rh_monthly["longitude"] + 180) % 360) - 180
    rh_monthly = rh_monthly.assign_coords(longitude=lon180).sortby("longitude").sortby("latitude")
    rh_monthly = rh_monthly.rename({"latitude": "lat", "longitude": "lon"})
    rh_monthly = rh_monthly.interp(lat=target_lat, lon=target_lon, method="linear")
    rh_monthly = rh_monthly.clip(0, 100)
    # load()'s own ERSST output is always (time, lat, lon) -- match that explicitly rather
    # than trust whatever order falls out of the groupby/regrid chain above. land_fill_indices
    # and the (12, cny*cnx)/(T, cny*cnx) reshapes downstream assume this exact lat-major order
    # (caught by testing this function directly against real data before building on it: it
    # came out (time, lon, lat) without this transpose -- a silent transpose bug, not a crash).
    rh_monthly = rh_monthly.transpose("time", "lat", "lon")
    rh_monthly.name = "rh700"

    if cache_path:
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        rh_monthly.to_netcdf(cache_path)
    return rh_monthly


def load_era5_rh700_daily(target_lat, target_lon, year0, year1, months=None, level=700,
                           zarr_path=ERA5_ZARR, cache_path=None):
    """Like load_era5_rh700, but reduces to DAILY means, not monthly -- for characterizing
    synoptic-timescale (day-to-day: tropical waves, SAL outbreaks) variability, which a monthly
    climatology structurally can't show (it's averaged away). Not a replacement for
    load_era5_rh700 -- this is a different real quantity, used by a different build script
    (make_humidity_synoptic.py, not make_humidity.py).

    Same per-timestep RH derivation and same year-by-year loading as load_era5_rh700 (see its
    own docstring for why -- one year's raw 6-hourly data stays memory-bounded regardless of how
    many years this spans; loading the whole range in one .load() OOM-killed the build the first
    time this was tried on the monthly version of this pull).

    `months`, if given (e.g. range(6,12) for June-November), restricts to those calendar months
    before regridding -- real hurricane-season synoptic character (SAL activity, tropical wave
    trains) differs from the rest of the year, and this is for calibrating a noise process
    that's only added during gameplay seasons that matter, not an annual-average one. This does
    NOT reduce network cost (the archive's own time-only chunking means every day in range still
    pulls its whole chunk regardless, see ERA5_ZARR's own docstring) -- only the post-download
    memory/compute shrinks, by skipping the reduction work on months this build doesn't need.

    Returns one value per (day, lat, lon), dated at that real calendar day (not day-15 proxy
    dates the monthly version uses) -- feeds anomalies() unchanged, since that function only
    ever keys off each timestamp's own calendar month, never its exact day-of-month."""
    import os
    if cache_path and os.path.exists(cache_path):
        return xr.open_dataarray(cache_path)

    ds = xr.open_zarr(zarr_path, storage_options={"token": "anon"}, chunks=None)
    sub_all = ds[["specific_humidity", "temperature"]].sel(level=level, method="nearest")

    yearly_daily = []
    for year in range(year0, year1 + 1):
        mask = sub_all["time"].dt.year == year
        if months is not None:
            mask = mask & sub_all["time"].dt.month.isin(list(months))
        sub = sub_all.sel(time=mask).load()

        t_c = sub["temperature"] - 273.15
        e_sat = 6.112 * np.exp(17.67 * t_c / (t_c + 243.5))
        q_sat = 0.622 * e_sat / (level - 0.378 * e_sat)
        rh = 100.0 * sub["specific_humidity"] / q_sat

        rh = rh.assign_coords(day=rh["time"].dt.floor("D"))
        rh_year = rh.groupby("day").mean("time").compute()
        rh_year = rh_year.rename({"day": "time"})
        yearly_daily.append(rh_year)
        del sub, rh

    rh_daily = xr.concat(yearly_daily, dim="time").sortby("time")

    lon180 = ((rh_daily["longitude"] + 180) % 360) - 180
    rh_daily = rh_daily.assign_coords(longitude=lon180).sortby("longitude").sortby("latitude")
    rh_daily = rh_daily.rename({"latitude": "lat", "longitude": "lon"})
    rh_daily = rh_daily.interp(lat=target_lat, lon=target_lon, method="linear")
    rh_daily = rh_daily.clip(0, 100)
    rh_daily = rh_daily.transpose("time", "lat", "lon")
    rh_daily.name = "rh700"

    if cache_path:
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        rh_daily.to_netcdf(cache_path)
    return rh_daily


def load_era5_shear(target_lat, target_lon, year0, year1, level_upper=200, level_lower=850,
                     zarr_path=ERA5_ZARR, cache_path=None):
    """Loads real ERA5 deep-layer vertical wind shear (the vector wind difference between
    level_upper and level_lower, the standard NHC/SHIPS 200-850 hPa definition) from the same
    public ARCO-ERA5 archive load_era5_rh700 already uses. Both 200 hPa and 850 hPa are exact
    native levels in this archive (confirmed directly against the live store), unlike 700 hPa
    for RH, which also happens to be exact but defensively uses method="nearest" anyway.

    Averaging order was a genuinely open question, resolved against real data before writing
    this function (not assumed either way): average u/v across every 6-hourly reading in each
    (year, month) at each level FIRST, then take the magnitude of the vector difference between
    levels ONCE from the two time-mean vectors. u/v are already linear quantities (unlike RH,
    which must be derived from specific humidity/temperature before any averaging can be
    correct), so this is simpler than load_era5_rh700's own per-reading derivation step -- just
    a mean, the same real quantity monthly_climatology() already computes for SST. The
    alternative (deriving instantaneous shear magnitude per 6-hourly reading, then averaging
    those magnitudes, mirroring RH's own literal order) was computed and compared directly: it
    ran systematically 5-17 kt higher everywhere sampled (Jensen's-inequality bias on a convex
    vector norm -- averaging a norm of noisy vectors overstates the norm of their true mean) and
    produced implausibly high values even in the climatologically "low shear" hurricane season
    (MDR Jun-Nov came back 27-32 kt). Averaging the vectors first instead gives MDR peak-season
    values of 16-24 kt, matching real published climatological deep-layer-shear figures, and a
    clean ENSO signal in the expected direction (El Nino year 2015 sampled 8.1 kt higher than La
    Nina year 2011 at the MDR, matching the real, well-documented teleconnection -- El Nino
    strengthens upper-tropospheric westerlies over the tropical Atlantic via the Walker
    circulation response, the shear-side analogue of this codebase's own already-verified "El
    Nino wets the Gulf, dries the MDR" humidity finding).

    Converts m/s (ERA5's native wind unit) to knots before returning (x1.943844) -- the real
    NHC/SHIPS operational convention for discussing deep-layer shear -- so every downstream
    consumer (encode scale, vmin/vmax, key) already works in the real display unit, the same
    principle load_era5_rh700 already applies by delivering %, never a raw specific-humidity
    unit, all the way through.

    Same year-by-year loading (bounded memory -- see load_era5_rh700's own docstring for why),
    same lon rewrap + regrid onto target_lat/target_lon, same derived-result NetCDF caching, and
    the same (time, lat, lon) output shape as load_era5_rh700 -- feeds extract_box() unchanged."""
    import os
    if cache_path and os.path.exists(cache_path):
        return xr.open_dataarray(cache_path)

    ds = xr.open_zarr(zarr_path, storage_options={"token": "anon"}, chunks=None)
    sub_all = ds[["u_component_of_wind", "v_component_of_wind"]].sel(
        level=[level_upper, level_lower], method="nearest")

    yearly_monthly = []
    for year in range(year0, year1 + 1):
        sub = sub_all.sel(time=sub_all["time"].dt.year == year).load()

        # Average u/v across every 6-hourly reading in the month FIRST, then take the magnitude
        # of the vector difference between levels ONCE from the two time-mean vectors (see
        # docstring above for why this order, confirmed against real data).
        sub = sub.assign_coords(month=sub["time"].dt.month)
        uv = sub.groupby("month").mean("time").compute()
        du = uv["u_component_of_wind"].sel(level=level_upper) - uv["u_component_of_wind"].sel(level=level_lower)
        dv = uv["v_component_of_wind"].sel(level=level_upper) - uv["v_component_of_wind"].sel(level=level_lower)
        shear_year = np.sqrt(du ** 2 + dv ** 2)
        new_times = np.array([f"{year}-{m:02d}-15" for m in uv["month"].values], dtype="datetime64[ns]")
        shear_year = shear_year.rename({"month": "time"}).assign_coords(time=new_times)
        yearly_monthly.append(shear_year)
        del sub, uv, du, dv

    shear_monthly = xr.concat(yearly_monthly, dim="time").sortby("time")

    lon180 = ((shear_monthly["longitude"] + 180) % 360) - 180
    shear_monthly = shear_monthly.assign_coords(longitude=lon180).sortby("longitude").sortby("latitude")
    shear_monthly = shear_monthly.rename({"latitude": "lat", "longitude": "lon"})
    shear_monthly = shear_monthly.interp(lat=target_lat, lon=target_lon, method="linear")
    shear_monthly = shear_monthly * 1.943844   # m/s -> kt (see docstring)
    shear_monthly = shear_monthly.clip(0, None)   # magnitude can't be negative; interpolation can introduce tiny sub-zero noise right at that boundary
    shear_monthly = shear_monthly.transpose("time", "lat", "lon")
    shear_monthly.name = "shear"

    if cache_path:
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        shear_monthly.to_netcdf(cache_path)
    return shear_monthly
