#!/bin/sh
# Makes a basin's storm climatology from nothing but the built page and the best-track tables, step by step (each step writes into a work directory and can be run again on its own).
#
#   sh tools/rollout_basin.sh <basin> <step> [workdir]
#
#   steps (in order), basin as in tools/tc_basins.json (eastpacific westpacific nio aus swio spac), PLAYWRIGHT_CHROMIUM_PATH set, a build in dist/ (or HF_DIST=<dir> for a lab build):
#     real      the page's region and the real targets and maps            storm_region.mjs, make_tc_basin.py             -> data/generated/<basin>-tc-{region,ref,maps}.json
#     clim      the page's mean steering and environment, by month         storm_fit.mjs clim   (8 seasons)               -> $W/clim.json
#     rates     the development rates and the supply of local seeds        storm_fit.mjs fit, wet, fit --ipf, rescale, maps (24 + 16 seasons)  -> $W/maps0.json, $W/sim0.json
#     rounds    refine the rates against the real first-fix map, correct the drift for the anomaly the page's weather adds, 3 rounds of 72 seasons  -> $W/maps<n>.json
#     opt       calibrate the intensity law (storm_basin_opt.mjs, CMA-ES, 24 generations of 12 candidates on 24 seasons)  -> $W/opt.json
#     patch     write its best candidate and the genesis latitude gates into BASIN_PARAMS (src/storms.js) and rebuild    (storm_basin_patch.mjs; then `rounds` again: the counts move with the physics)
#     check     96 held-out seasons against the reference                  storm_basin.mjs
#     all       real clim rates rounds opt patch rounds check (an hour or two)
#   after the last: copy the final maps to data/generated/<basin>-tc-storm-maps.json, `node tools/merge_data.mjs <basin> --storm-maps <prefix>-data.json` and `--storms`, `npm run build`.
set -e
B=$1; STEP=$2; W=${3:-/tmp/hf-$B}; mkdir -p "$W"
cd "$(dirname "$0")/.."
export STORM_BASIN=$B
LAST=$(ls "$W"/maps[0-9]*.json 2>/dev/null | sed 's/.*maps\([0-9]*\)\.json/\1/' | sort -n | tail -1)
case "$STEP" in
  real)
    node tools/storm_region.mjs "$B"
    python3 tools/make_tc_basin.py "$B" ;;
  clim)
    node tools/storm_fit.mjs clim --seeds 1-8 --out "$W/clim.json" ;;
  rates)
    node tools/storm_fit.mjs fit --clim "$W/clim.json" --seeds 201-216 --iters 1 --out "$W/simA.json" --raw "$W/fitA.json"
    node tools/storm_fit.mjs wet --clim "$W/clim.json" --raw "$W/fitA_it1.json" --out "$W/clim_wet.json"
    node tools/storm_fit.mjs fit --clim "$W/clim_wet.json" --start "$W/simA.json" --seeds 301-324 --iters 3 --ipf --out "$W/simB.json" --raw "$W/fitB.json"
    node tools/storm_fit.mjs rescale --sim "$W/simB.json" --out "$W/sim0.json"
    node tools/storm_fit.mjs maps --clim "$W/clim_wet.json" --sim "$W/sim0.json" --out "$W/maps0.json" ;;
  rounds)
    R=$((${LAST:-0}+1)); END=$((R+2))
    SIM=$W/sim$((R-1)).json; MAPS=$W/maps$((R-1)).json
    while [ $R -le $END ]; do
      node tools/storm_basin.mjs "$B" --seeds $((R*100+1))-$((R*100+72)) --maps "$MAPS" --diag --out "$W/raw$R.json" > "$W/rep$R.txt"
      node tools/storm_fit.mjs refine --clim "$W/clim_wet.json" --sim "$SIM" --raw "$W/raw$R.json" --out "$W/simF$R.json" > "$W/refine$R.txt"
      node tools/storm_fit.mjs motion --sim "$W/simF$R.json" --raw "$W/raw$R.json" --out "$W/sim$R.json" > "$W/motion$R.txt"
      node tools/storm_fit.mjs maps --clim "$W/clim_wet.json" --sim "$W/sim$R.json" --out "$W/maps$R.json" > /dev/null
      SIM=$W/sim$R.json; MAPS=$W/maps$R.json
      echo "round $R: $(grep -E '^(depressions|named storms)' "$W/rep$R.txt" | tr -s ' ' | tr '\n' ' ')"
      R=$((R+1))
    done ;;
  opt)
    node tools/storm_basin_opt.mjs "$B" --maps "$W/maps$LAST.json" --seeds 801-824 --gens 24 --pop 12 --out "$W/opt.json" ;;
  patch)
    node tools/storm_basin_patch.mjs "$B" --opt "$W/opt.json" --gate
    node tools/build.mjs > /dev/null ;;
  check)
    node tools/storm_basin.mjs "$B" --seeds 901-996 --maps "$W/maps$LAST.json" --out "$W/check.json" ;;
  all)
    for st in real clim rates rounds opt patch rounds check; do echo "== $B: $st $(date -u +%H:%M)"; sh "$0" "$B" "$st" "$W"; done ;;
  *) echo "usage: sh tools/rollout_basin.sh <basin> real|clim|rates|rounds|opt|patch|check|all [workdir]"; exit 1 ;;
esac
