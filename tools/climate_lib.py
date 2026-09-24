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
    if lon1 == 180:
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
    else:
        box = sst.sel(lon=slice(lon0, lon1), lat=slice(lat0, lat1))
    box = box.sortby("lat", ascending=False)   # north first
    cnx = int(round((lon1 - lon0) / CRES)) + 1
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


def monthly_climatology(box, fill):
    """12 x (cny*cnx) climatology, deg C, averaged over BASE_YEARS."""
    invalid = fill
    y0, y1 = BASE_YEARS
    sub = box.sel(time=slice(f"{y0}-01-01", f"{y1}-12-31"))
    clim = sub.groupby("time.month").mean("time").transpose("month", "lat", "lon").values
    clim = np.stack([apply_fill(clim[m], invalid) for m in range(12)])
    return clim.reshape(12, -1)   # (12, cny*cnx), row-major matching cny,cnx


def anomalies(box, clim12, fill):
    """Monthly anomalies over EOF_YEARS relative to the (already-filled) BASE_YEARS climatology."""
    invalid = fill
    y0, y1 = EOF_YEARS
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
