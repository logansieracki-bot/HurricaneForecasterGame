"""Real GOES infrared (ABI band 13, 10.3 um) frames of a tropical cyclone: fetch from the public Google Cloud buckets, crop round a point on a regular
lat/lon grid (north up, square km), convert to brightness temperature (C), colour with the game's own palette (read from src/storm-nest.js) and measure.
Used for the infrared research of the satellite floater (docs/ir-research.md)."""
import os, re, subprocess, math, datetime as dt
import numpy as np, h5py
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')
os.makedirs(RAW, exist_ok=True)
BUCKET = {'G16': 'gcp-public-data-goes-16', 'G17': 'gcp-public-data-goes-17', 'G18': 'gcp-public-data-goes-18', 'G19': 'gcp-public-data-goes-19'}
REPO = '/home/user/HurricaneForecasterGame'

# ---- the game's palette (the same stops the page uses) -------------------------------------------------------------------------------------------------
def load_stops(path=os.path.join(REPO, 'src/storm-nest.js')):
    s = open(path).read()
    m = re.search(r'const IR_STOPS = (\[\[.*?\]\]);', s)
    arr = eval(m.group(1).replace('[', '[').replace(']', ']'))
    return [(t, tuple(c)) for t, c in arr]
STOPS = load_stops()
def lut(tmax=40.0, tmin=-110.0, step=0.25):
    ts = np.arange(tmax, tmin - 1e-9, -step); out = np.zeros((len(ts), 3), np.uint8)
    for i, t in enumerate(ts):
        if t >= STOPS[0][0]: c = STOPS[0][1]
        elif t <= STOPS[-1][0]: c = STOPS[-1][1]
        else:
            j = 1
            while j < len(STOPS) - 1 and t < STOPS[j][0]: j += 1
            a, b = STOPS[j - 1], STOPS[j]; u = (a[0] - t) / (a[0] - b[0]); c = tuple(a[1][k] + (b[1][k] - a[1][k]) * u for k in range(3))
        out[i] = [int(x) for x in c]
    return out
LUT = lut()
def colourise(tb):
    idx = np.clip(((40.0 - tb) * 4 + 0.5).astype(np.int32), 0, len(LUT) - 1)
    img = LUT[idx]; img[~np.isfinite(tb)] = (0, 0, 0)
    return img

# ---- fetching ------------------------------------------------------------------------------------------------------------------------------------------
def doy(d): return d.timetuple().tm_yday
def listing(sat, when):
    p = f"gs://{BUCKET[sat]}/ABI-L2-CMIPF/{when.year}/{doy(when):03d}/{when.hour:02d}/"
    r = subprocess.run(['gsutil', 'ls', p], capture_output=True, text=True, timeout=120)
    return [l.strip() for l in r.stdout.splitlines() if 'C13_' in l]
def scan_time(name):
    m = re.search(r'_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})', name)
    y, d, h, mi, s = map(int, m.groups()); return dt.datetime(y, 1, 1) + dt.timedelta(days=d - 1, hours=h, minutes=mi, seconds=s)
def fetch(sat, when, keep=False):
    """the full-disk band-13 file whose scan starts nearest to `when` (UTC datetime); returns (local path, actual time)"""
    names = listing(sat, when)
    if not names:
        raise FileNotFoundError(f'no band 13 file for {sat} {when}')
    best = min(names, key=lambda n: abs((scan_time(n) - when).total_seconds()))
    loc = os.path.join(RAW, os.path.basename(best))
    if not os.path.exists(loc): subprocess.run(['gsutil', '-q', 'cp', best, loc], check=True, timeout=300)
    return loc, scan_time(best)

# ---- geometry ------------------------------------------------------------------------------------------------------------------------------------------
class Frame:
    def __init__(self, path):
        f = h5py.File(path, 'r')
        cmi = f['CMI']; sf = float(cmi.attrs['scale_factor'][0]); off = float(cmi.attrs['add_offset'][0])
        raw = cmi[:].view(np.uint16)
        self.tb = np.where(raw == 65535, np.nan, raw.astype(np.float32) * sf + off).astype(np.float32) - 273.15
        def ax(n):
            v = f[n]; return v[:].astype(np.float64) * float(v.attrs['scale_factor'][0]) + float(v.attrs['add_offset'][0])
        self.x, self.y = ax('x'), ax('y')
        p = f['goes_imager_projection']
        self.H = float(p.attrs['perspective_point_height'][0]) + float(p.attrs['semi_major_axis'][0])
        self.req = float(p.attrs['semi_major_axis'][0]); self.rpol = float(p.attrs['semi_minor_axis'][0]); self.lon0 = math.radians(float(p.attrs['longitude_of_projection_origin'][0]))
        self.dx = self.x[1] - self.x[0]; self.dy = self.y[1] - self.y[0]
        f.close()
    def scan_angles(self, lat, lon):
        lat = np.radians(lat); lon = np.radians(lon); e2 = 1 - (self.rpol / self.req) ** 2
        phic = np.arctan((self.rpol ** 2 / self.req ** 2) * np.tan(lat)); rc = self.rpol / np.sqrt(1 - e2 * np.cos(phic) ** 2)
        sx = self.H - rc * np.cos(phic) * np.cos(lon - self.lon0); sy = -rc * np.cos(phic) * np.sin(lon - self.lon0); sz = rc * np.sin(phic)
        vis = self.H * (self.H - sx) >= sy ** 2 + (self.req ** 2 / self.rpol ** 2) * sz ** 2
        x = np.arcsin(-sy / np.sqrt(sx ** 2 + sy ** 2 + sz ** 2)); y = np.arctan(sz / sx)
        return x, y, vis
    def crop(self, lat0, lon0, half_km=500.0, res_km=2.0):
        """a (2*half/res)^2 grid north up, west left, the brightness temperature (C) bilinearly sampled; returns (tb, lat grid, lon grid)"""
        n = int(round(2 * half_km / res_km)); dlat = res_km / 111.195; dlon = dlat / math.cos(math.radians(lat0))
        lats = lat0 + (np.arange(n)[::-1] - (n - 1) / 2) * dlat; lons = lon0 + (np.arange(n) - (n - 1) / 2) * dlon
        LON, LAT = np.meshgrid(lons, lats); x, y, vis = self.scan_angles(LAT, LON)
        cols = (x - self.x[0]) / self.dx; rows = (y - self.y[0]) / self.dy
        r0 = np.floor(rows).astype(int); c0 = np.floor(cols).astype(int); fr = rows - r0; fc = cols - c0
        ok = vis & (r0 >= 0) & (r0 < self.tb.shape[0] - 1) & (c0 >= 0) & (c0 < self.tb.shape[1] - 1)
        r0 = np.clip(r0, 0, self.tb.shape[0] - 2); c0 = np.clip(c0, 0, self.tb.shape[1] - 2); T = self.tb
        out = (T[r0, c0] * (1 - fr) * (1 - fc) + T[r0, c0 + 1] * (1 - fr) * fc + T[r0 + 1, c0] * fr * (1 - fc) + T[r0 + 1, c0 + 1] * fr * fc)
        out = np.where(ok, out, np.nan).astype(np.float32)
        return out, LAT, LON

# ---- pictures and numbers ------------------------------------------------------------------------------------------------------------------------------
def font(sz=13):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans.ttf'):
        if os.path.exists(p): return ImageFont.truetype(p, sz)
    return ImageFont.load_default()
def panel(tb, label, res_km=2.0, scale=1, ring_km=(100, 200), mark=True):
    img = Image.fromarray(colourise(tb)); n = tb.shape[0]
    if scale != 1: img = img.resize((n * scale, n * scale), Image.BILINEAR)
    d = ImageDraw.Draw(img); f = font(12); W = img.size[0]
    d.rectangle([0, 0, W, 16], fill=(0, 0, 0)); d.text((4, 2), label, fill=(255, 255, 255), font=f)
    # a 100 km scale bar
    L = 100.0 / res_km * scale; y = img.size[1] - 8; d.line([(6, y), (6 + L, y)], fill=(255, 255, 255), width=2); d.text((10 + L, y - 7), '100 km', fill=(255, 255, 255), font=f)
    if mark:
        c = W / 2
        for r in ring_km:
            rr = r / res_km * scale; d.ellipse([c - rr, c - rr, c + rr, c + rr], outline=(255, 255, 255), width=1)
    return img
def sheet(panels, cols, path):
    w, h = panels[0].size; rows = (len(panels) + cols - 1) // cols; bar = 26
    out = Image.new('RGB', (w * cols, h * rows + bar), (20, 20, 20))
    for i, p in enumerate(panels): out.paste(p, ((i % cols) * w, (i // cols) * h))
    # the key
    ts = np.linspace(40, -90, w * cols); strip = colourise(ts[None, :].repeat(10, 0)); out.paste(Image.fromarray(strip), (0, h * rows + 2))
    d = ImageDraw.Draw(out); f = font(11)
    for t in (40, 20, 0, -20, -40, -60, -80, -90):
        x = int((40 - t) / 130 * (w * cols - 1)); d.text((min(x, w * cols - 24), h * rows + 13), str(t), fill=(255, 255, 255), font=f)
    out.save(path)
def stats(tb, res_km=2.0, center_km=24.0):
    n = tb.shape[0]; c = (n - 1) / 2; yy, xx = np.mgrid[0:n, 0:n]; r = np.hypot(yy - c, xx - c) * res_km
    ok = np.isfinite(tb); out = {'tmin': float(np.nanmin(tb)), 'p1': float(np.nanpercentile(tb, 1)), 'p10': float(np.nanpercentile(tb, 10)), 'median': float(np.nanmedian(tb))}
    for th in (-20, -40, -60, -70, -80):
        out[f'area_lt{-th}'] = float(np.sum((tb < th) & ok) * res_km * res_km)
    m = (r <= center_km) & ok; out['eye_warm'] = float(np.nanmax(np.where(m, tb, np.nan))) if m.any() else float('nan')
    return out
