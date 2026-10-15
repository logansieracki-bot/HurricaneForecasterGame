#!/bin/bash
# Rebuilds the steering-flow / sea-level-pressure data (steering arrows + highs) for the basins whose client
# has it (so far only the Atlantic; the other eight rows are listed so the boxes, seasons and bands are in one
# place, commented out until their templates are ported) and bakes it into each basin's data file.
#
#   0. tools/pull_era5_steer.py     ERA5 layer-mean winds (shallow 850-700, medium 850-500, deep 850-200 hPa;
#                                   monthly 2007-2021, daily 2017-2021) and 6-hourly sea-level pressure, global,
#                                   one file per year in data/raw (public ARCO-ERA5 archive; ~2 GB, resumable).
#   1. tools/make_steer.py          Phase 1: climatology + joint EOF (winds and pressure together) + ENSO
#                                   regression (the three lags fitted together) + the seasonal amplitude of the
#                                   EOF part (eofAmp)  ->  <basin>-steer.json, and the year-to-year variance
#                                   targets in <basin>-steer-calib.json.
#   2. tools/make_steer_weather.py  the day-to-day part, calibrated on the real daily fields: pressure-weather
#                                   size/scale/speed per latitude band and month, the wind-pressure coupling
#                                   (alpha), the jet ribbon, the residual flow  ->  <basin>-steer-weather.json,
#                                   and the day-to-day variance targets (added to the calib file).
#   3. merge + build                 (the page has to exist before it can be measured)
#   4. tools/calibrate_steer_means.mjs  measures, on the built page, the mean ribbon the simulated jet produces
#                                   (the client subtracts it so the climate mean stays the real one) and closes the
#                                   variance budget: the residual's size per month and node is what is left of the
#                                   real year-to-year + day-to-day variance once everything else the page adds
#                                   is counted  ->  <basin>-steer-means.json.
#   5. merge + build again           to bake the measured means and residual maps in.
#
# Arguments per basin (the same boxes, seasons and bands as build_shear_all.sh):
#   basin  lon0 lon1 lat0 lat1   months (the basin's own cyclone season: the jet and ribbon statistics use it)
#   band   the signed latitude interval the jet axis is traced in (20,65 north, -65,-20 south)
#   data   the merged data file the basin's build embeds (the Atlantic's is the older data.json)
#   flags  --no-extend when the displayed box already contains the whole band (the Atlantic's does)
set -e
cd "$(dirname "$0")/.."
if [ "$1" = "--pull" ]; then
  python3 tools/pull_era5_steer.py --years 2007-2021 --daily-from 2017
fi
ROWS=(
  "atlantic -110 40 -40 72 6,7,8,9,10,11 20,65 data.json --no-extend"
  # "eastpacific -180 -68 -32 50 5,6,7,8,9,10,11 20,65 eastpacific-data.json"
  # "westpacific 100 180 -6 56 6,7,8,9,10,11,12 20,65 westpacific-data.json"
  # "nio 30 100 -8 32 4,5,6,10,11,12 20,65 nio-data.json"
  # "aus 90 176 -44 4 11,12,1,2,3,4 -65,-20 aus-data.json"
  # "swio 30 108 -44 0 11,12,1,2,3,4 -65,-20 swio-data.json"
  # "spac 160 -120 -40 0 11,12,1,2,3,4 -65,-20 spac-data.json"
  # "satl -50 20 -40 0 11,12,1,2,3,4 -65,-20 satl-data.json"
  # "med -10 42 30 48 9,10,11,12,1 20,65 med-data.json"
)
for row in "${ROWS[@]}"; do
  read -r basin lon0 lon1 lat0 lat1 months band data flags <<< "$row"
  echo "=== $basin"
  rm -f "data/generated/$basin-steer-means.json"
  python3 tools/make_steer.py "$basin" "$lon0" "$lon1" "$lat0" "$lat1" 8
  python3 tools/make_steer_weather.py "$basin" "$lon0" "$lon1" "$lat0" "$lat1" "$months" "$band" $flags
  node tools/merge_data.mjs "$basin" --steer "$data"
  npm run build
  node tools/calibrate_steer_means.mjs "$basin"
  node tools/merge_data.mjs "$basin" --steer "$data"
  npm run build
done
