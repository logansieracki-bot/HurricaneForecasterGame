#!/usr/bin/env python3
"""Writes data/generated/severe-sites.json: the WSR-88D (NEXRAD) radar sites, id -> [lat, lon, ground elevation in metres].

The table is NOAA's (HOMR); the simplest copy that needs no dependencies is the one inside the Py-ART package, whose source is read straight out of its wheel:
  pip download --no-deps arm_pyart -d /tmp/pyart && python3 tools/make_severe_sites.py /tmp/pyart/arm_pyart-*.whl
"""
import ast, glob, json, os, re, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    wheels = [w for a in sys.argv[1:] for w in glob.glob(a)]
    if not wheels:
        sys.exit(__doc__)
    z = zipfile.ZipFile(wheels[0])
    src = z.read('pyart/io/nexrad_common.py').decode()
    table = ast.literal_eval(re.search(r'NEXRAD_LOCATIONS\s*=\s*(\{.*?\n\})', src, re.S).group(1))
    out = {k: [round(v['lat'], 4), round(v['lon'], 4), round(v['elev'] * 0.3048)] for k, v in sorted(table.items())}   # feet -> metres
    dest = os.path.join(ROOT, 'data', 'generated', 'severe-sites.json')
    with open(dest, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print(f'{len(out)} sites -> {dest} ({os.path.getsize(dest)} bytes); KVNX {out["KVNX"]}, KTLX {out["KTLX"]}')

if __name__ == '__main__':
    main()
