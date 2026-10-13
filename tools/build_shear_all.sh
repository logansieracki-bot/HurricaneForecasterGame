#!/bin/bash
# Rebuilds the Wind Shear data (climatology + EOF + ENSO, the jet axis/ribbon/smear, and the local
# texture) for the eight non-Atlantic basins and merges it into each basin's <basin>-data.json.
# Everything runs on the global ERA5 caches already in data/raw (era5_shear_global_monthly_*.nc and
# era5_shear_global_daily_*_allmonths.nc, on ERSST's 2 degree grid), so it is local compute; the
# first run on a clean checkout downloads them from the public ARCO-ERA5 archive (see
# climate_lib.py's load_era5_shear / load_era5_shear_daily).
#
#   basin  lon0 lon1 lat0 lat1   months (the basin's own cyclone season, as for humidity)
#   band   the signed latitude interval the jet axis is traced in: 20,65 in the north, -65,-20 in the south
#          (the axis is traced, and the ribbon and smear measured, on an analysis box wider than the
#          displayed one -- see make_shear_jet.py)
#
# The Atlantic's own data was built before the jet was generalized and is reproduced exactly by the
# same scripts with --no-extend (its displayed box already contains the whole band):
#   python3 tools/make_shear.py atlantic -110 40 -40 72 6
#   python3 tools/make_shear_jet.py atlantic -110 40 -40 72 6,7,8,9,10,11 8 20,65 --no-extend
#   python3 tools/make_shear_synoptic.py atlantic -110 40 -40 72 6,7,8,9,10,11 --no-extend
#   node tools/merge_data.mjs atlantic --shear data.json  (then --shear-synoptic, --shear-jet)
set -e
cd "$(dirname "$0")/.."
ROWS=(
  "eastpacific -180 -68 -32 50 5,6,7,8,9,10,11 20,65 eastpacific-data.json"
  "westpacific 100 180 -6 56 6,7,8,9,10,11,12 20,65 westpacific-data.json"
  "nio 30 100 -8 32 4,5,6,10,11,12 20,65 nio-data.json"
  "aus 90 176 -44 4 11,12,1,2,3,4 -65,-20 aus-data.json"
  "swio 30 108 -44 0 11,12,1,2,3,4 -65,-20 swio-data.json"
  "spac 160 -120 -40 0 11,12,1,2,3,4 -65,-20 spac-data.json"
  "satl -50 20 -40 0 11,12,1,2,3,4 -65,-20 satl-data.json"
  "med -10 42 30 48 9,10,11,12,1 20,65 med-data.json"
)
for row in "${ROWS[@]}"; do
  read -r basin lon0 lon1 lat0 lat1 months band data <<< "$row"
  echo "=== $basin"
  python3 tools/make_shear.py "$basin" "$lon0" "$lon1" "$lat0" "$lat1" 6
  python3 tools/make_shear_jet.py "$basin" "$lon0" "$lon1" "$lat0" "$lat1" "$months" 8 "$band"
  python3 tools/make_shear_synoptic.py "$basin" "$lon0" "$lon1" "$lat0" "$lat1" "$months"
  node tools/merge_data.mjs "$basin" --shear "$data"
  node tools/merge_data.mjs "$basin" --shear-synoptic "$data"
  node tools/merge_data.mjs "$basin" --shear-jet "$data"
done
