#!/usr/bin/env python3
"""Downloads raw source data into data/raw/. Idempotent -- skips files that already exist."""
import os
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")

SOURCES = {
    # NOAA ERSST v5, global monthly 2 deg, 1970-2021. "No constraints on data access or use."
    # Mirrored (unmodified) in xarray's own tutorial-data repo.
    "ersstv5.nc": "https://raw.githubusercontent.com/pydata/xarray-data/master/ersstv5.nc",
    # NASA Blue Marble: Next Generation, cloud-free equirectangular, 8192x4096 (courtesy Reto
    # Stockli, NASA/GSFC; public domain), unmodified, mirrored in a GitHub project's assets.
    "blue_marble_8192.jpg": "https://raw.githubusercontent.com/Anko59/GeoguessMe/dev/frontend/public/globe/earth-8192.jpg",
}


def main():
    os.makedirs(RAW, exist_ok=True)
    for name, url in SOURCES.items():
        dest = os.path.join(RAW, name)
        if os.path.exists(dest):
            print(f"skip  {name} (already present)")
            continue
        print(f"fetch {name} <- {url}")
        urllib.request.urlretrieve(url, dest)
        print(f"  -> {os.path.getsize(dest)} bytes")


if __name__ == "__main__":
    main()
