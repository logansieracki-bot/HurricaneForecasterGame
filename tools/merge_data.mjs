#!/usr/bin/env node
// Combines a basin's <basin>-geo.json + <basin>-climate.json + <basin>-imagery.json
// (each built independently by make_geo.mjs / make_climate.py / make_imagery.py)
// into the single <basin>-data.json build.mjs actually embeds into the template.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GEN = join(ROOT, 'data', 'generated');

export function merge(basin) {
  const geo = JSON.parse(readFileSync(join(GEN, `${basin}-geo.json`), 'utf8'));
  const climate = JSON.parse(readFileSync(join(GEN, `${basin}-climate.json`), 'utf8'));
  const imagery = JSON.parse(readFileSync(join(GEN, `${basin}-imagery.json`), 'utf8'));

  const out = { ...geo, ...imagery, ...climate };   // climate's own `box`-like domain fields, if any, win last -- none collide today

  const dest = join(GEN, `${basin}-data.json`);
  writeFileSync(dest, JSON.stringify(out));
  console.log(`wrote ${dest}`);
  return out;
}

// Layers the storm engine's climatology maps (real mean drift, the page's own mean steering and environment, the fitted development rates and local-seed supply: tools/storm_fit.mjs,
// assembled into <basin>-tc-storm-maps.json) onto an already-merged data file, under storms.maps. Whatever else is under `storms` stays.
export function mergeStormMaps(basin, dataFileName) {
  const dataPath = join(GEN, dataFileName);
  const existing = JSON.parse(readFileSync(dataPath, 'utf8'));
  const maps = JSON.parse(readFileSync(join(GEN, `${basin}-tc-storm-maps.json`), 'utf8'));
  const out = { ...existing, storms: { ...(existing.storms || {}), maps } };
  writeFileSync(dataPath, JSON.stringify(out));
  console.log(`wrote ${dataPath} (added storms.maps: ${JSON.stringify(maps).length} bytes)`);
  return out;
}

// Layers a basin's own <basin>-humidity.json onto an *already-merged* data file, rather than
// rebuilding from scratch via merge() above. Atlantic has no split <basin>-geo/-climate/
// -imagery>.json files to feed merge() -- its merged output is the legacy, checked-in
// data/generated/data.json (see README's own "Known gaps" section) -- so merge('atlantic')
// would throw ENOENT. This works on whatever already-merged file is actually there instead.
// Nested under a single `humidity` key, not spread: <basin>-humidity.json has the exact same
// top-level keys (domain,K,clim,eof,enso,phi) as <basin>-climate.json, so a flat spread would
// silently clobber SST's own K/clim/eof/enso/phi with humidity's. `domain` itself is dropped
// from the nested copy -- it's identical to the top-level one by construction (both basins'
// own climate and humidity builds use the same basin box and the same fine_res=0.25
// convention) -- so there's only ever one domain object to look at, not two that could drift.
export function mergeHumidity(basin, dataFileName) {
  const dataPath = join(GEN, dataFileName);
  const existing = JSON.parse(readFileSync(dataPath, 'utf8'));
  const { domain, ...humidityRest } = JSON.parse(readFileSync(join(GEN, `${basin}-humidity.json`), 'utf8'));
  const out = { ...existing, humidity: humidityRest };
  writeFileSync(dataPath, JSON.stringify(out));
  console.log(`wrote ${dataPath} (added humidity key)`);
  return out;
}

// Layers a basin's own <basin>-humidity-synoptic.json (day-to-day weather-timescale noise,
// see make_humidity_synoptic.py) onto an already-merged, humidity-bearing data file, nested
// under humidity.synoptic -- the synoptic file has no domain of its own (it shares the parent
// humidity object's exact grid by construction) and no keys that collide with humidity's own
// top-level ones (K/clim/eof/enso/phi), so a flat merge into the `humidity` object is safe.
export function mergeHumiditySynoptic(basin, dataFileName) {
  const dataPath = join(GEN, dataFileName);
  const existing = JSON.parse(readFileSync(dataPath, 'utf8'));
  const synoptic = JSON.parse(readFileSync(join(GEN, `${basin}-humidity-synoptic.json`), 'utf8'));
  const out = { ...existing, humidity: { ...existing.humidity, synoptic } };
  writeFileSync(dataPath, JSON.stringify(out));
  console.log(`wrote ${dataPath} (added humidity.synoptic key)`);
  return out;
}

// Layers a basin's own <basin>-shear.json (200-850 hPa deep-layer wind shear climatology +
// EOF + ENSO regression, Phase 1 -- see make_shear.py) onto an already-merged data file, same
// shape as mergeHumidity above and for the same reason: <basin>-shear.json has the exact same
// top-level keys (domain,K,clim,eof,enso,phi) as both <basin>-climate.json and
// <basin>-humidity.json, so nesting under a new top-level `shear` key (domain dropped, same
// reasoning as mergeHumidity's own) avoids clobbering either one.
export function mergeShear(basin, dataFileName) {
  const dataPath = join(GEN, dataFileName);
  const existing = JSON.parse(readFileSync(dataPath, 'utf8'));
  const { domain, ...shearRest } = JSON.parse(readFileSync(join(GEN, `${basin}-shear.json`), 'utf8'));
  const out = { ...existing, shear: shearRest };
  writeFileSync(dataPath, JSON.stringify(out));
  console.log(`wrote ${dataPath} (added shear key)`);
  return out;
}

// Layers a basin's own <basin>-shear-synoptic.json (day-to-day weather-timescale shear noise,
// see make_shear_synoptic.py) onto an already-merged, shear-bearing data file, nested under
// shear.synoptic -- exact same shape and reasoning as mergeHumiditySynoptic above (no domain of
// its own; no top-level key collisions with shear's own K/clim/eof/enso/phi).
export function mergeShearSynoptic(basin, dataFileName) {
  const dataPath = join(GEN, dataFileName);
  const existing = JSON.parse(readFileSync(dataPath, 'utf8'));
  const synoptic = JSON.parse(readFileSync(join(GEN, `${basin}-shear-synoptic.json`), 'utf8'));
  const out = { ...existing, shear: { ...existing.shear, synoptic } };
  writeFileSync(dataPath, JSON.stringify(out));
  console.log(`wrote ${dataPath} (added shear.synoptic key)`);
  return out;
}

// Layers a basin's own <basin>-shear-jet.json (the explicit, continuous jet-axis feature --
// real mean path + EOF wave modes + the real re-centered cross-axis profile, see
// make_shear_jet.py) onto an already-merged, shear-bearing data file, nested under shear.jet --
// same shape and reasoning as mergeShearSynoptic above (no top-level key collisions: shear-
// jet.json's own K/eof/phi live one level deeper than shear's own, under `jet`, not `synoptic`).
export function mergeShearJet(basin, dataFileName) {
  const dataPath = join(GEN, dataFileName);
  const existing = JSON.parse(readFileSync(dataPath, 'utf8'));
  const jet = JSON.parse(readFileSync(join(GEN, `${basin}-shear-jet.json`), 'utf8'));
  const out = { ...existing, shear: { ...existing.shear, jet } };
  writeFileSync(dataPath, JSON.stringify(out));
  console.log(`wrote ${dataPath} (added shear.jet key)`);
  return out;
}


// Layers a basin's steering/pressure data onto an already-merged data file, nested under one `steer` key:
// <basin>-steer.json (make_steer.py: monthly climatology + joint EOF + ENSO of the layer winds and sea level
// pressure, on its own 4 degree grid, so its `domain` is kept -- it is NOT the coarse 2 degree one) with
// <basin>-steer-weather.json (make_steer_weather.py: the day-to-day calibration) as steer.weather and, if it
// exists, <basin>-steer-means.json (tools/calibrate_steer_means.mjs, measured on the built page: the mean ribbon
// the client subtracts, and the residual amplitude maps that close the variance budget) as steer.weather.means;
// the maps replace the weather file's first estimate of the residual size (sigR) and add the shallow layer's own (sigRs).
// <basin>-steer-calib.json holds calibration targets only and is never shipped.
export function mergeSteer(basin, dataFileName) {
  const dataPath = join(GEN, dataFileName);
  const existing = JSON.parse(readFileSync(dataPath, 'utf8'));
  const steer = JSON.parse(readFileSync(join(GEN, `${basin}-steer.json`), 'utf8'));
  const weather = JSON.parse(readFileSync(join(GEN, `${basin}-steer-weather.json`), 'utf8'));
  const meansPath = join(GEN, `${basin}-steer-means.json`);
  let note = '';
  if (existsSync(meansPath)) {
    const { smear, samples, sigR, sigRs } = JSON.parse(readFileSync(meansPath, 'utf8'));
    weather.means = { smear, samples };
    if (sigR && sigRs) { weather.sigR = sigR; weather.sigRs = sigRs; }
    note = `, with measured means${sigR ? ' and closed residual maps' : ''}`;
  }
  steer.weather = weather;
  const out = { ...existing, steer };
  writeFileSync(dataPath, JSON.stringify(out));
  console.log(`wrote ${dataPath} (added steer key${note})`);
  return out;
}

// Puts a basin's seasonal gains and joint-lag El Nino coefficients (tools/make_env_seasonality.py rewrites <basin>-humidity.json and <basin>-shear.json: `enso`, and `seas` = {enso: [12], eof: [12]})
// into an already-merged data file, leaving everything else of humidity and shear (synoptic, jet) as it is.
export function mergeEnvSeas(basin, dataFileName) {
  const dataPath = join(GEN, dataFileName);
  const existing = JSON.parse(readFileSync(dataPath, 'utf8'));
  for (const field of ['humidity', 'shear']) {
    const src = JSON.parse(readFileSync(join(GEN, `${basin}-${field}.json`), 'utf8'));
    if (!src.seas) throw new Error(`${basin}-${field}.json has no seas: run tools/make_env_seasonality.py ${basin} --write first`);
    existing[field] = { ...existing[field], enso: src.enso, seas: src.seas };
  }
  writeFileSync(dataPath, JSON.stringify(existing));
  console.log(`wrote ${dataPath} (humidity and shear: joint-lag enso, seas)`);
  return existing;
}

// Layers the real best-track climatology the storm pages draw their season summary against onto an already-merged data file, under one
// `storms` key: the daily cumulative ACE of the 30 seasons 1991-2020 (mean and percentiles) and the seasonal normals, from
// <basin>-tc-ref.json (tools/make_tc_ref.py). Only the numbers the page uses are shipped (about 11 KB).
export function mergeStorms(basin, dataFileName) {
  const dataPath = join(GEN, dataFileName);
  const existing = JSON.parse(readFileSync(dataPath, 'utf8'));
  const ref = JSON.parse(readFileSync(join(GEN, `${basin}-tc-ref.json`), 'utf8'));
  const a = ref.ace_curve, n = ref.normals, r1 = (x) => Math.round(x * 10) / 10, pick = (k) => a[k].map(r1);
  const storms = {
    years: ref.meta.normals, source: 'IBTrACS best track',
    ace: { mean: pick('mean'), p10: pick('p10'), p25: pick('p25'), p50: pick('p50'), p75: pick('p75'), p90: pick('p90') },
    normals: { dep: n.tracks, named: n.named, hurr: n.hurricanes, major: n.majors, cat5: n.cat5, ace: n.ace_mean, aceSd: n.ace_sd },
  };
  const out = { ...existing, storms: { ...(existing.storms || {}), ...storms } };               // keeps storms.maps (mergeStormMaps)
  writeFileSync(dataPath, JSON.stringify(out));
  console.log(`wrote ${dataPath} (added storms key: ${JSON.stringify(storms).length} bytes)`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [basin, mode, dataFileName] = process.argv.slice(2);
  if (!basin) { console.error('usage: node tools/merge_data.mjs <basin>\n       node tools/merge_data.mjs <basin> --humidity <data-file-name>\n       node tools/merge_data.mjs <basin> --humidity-synoptic <data-file-name>\n       node tools/merge_data.mjs <basin> --shear <data-file-name>\n       node tools/merge_data.mjs <basin> --shear-synoptic <data-file-name>\n       node tools/merge_data.mjs <basin> --shear-jet <data-file-name>\n       node tools/merge_data.mjs <basin> --steer <data-file-name>\n       node tools/merge_data.mjs <basin> --env-seas <data-file-name>\n       node tools/merge_data.mjs <basin> --storm-maps <data-file-name>\n       node tools/merge_data.mjs <basin> --storms <data-file-name>'); process.exit(1); }
  if (mode === '--humidity') {
    if (!dataFileName) { console.error('usage: node tools/merge_data.mjs <basin> --humidity <data-file-name>'); process.exit(1); }
    mergeHumidity(basin, dataFileName);
  } else if (mode === '--humidity-synoptic') {
    if (!dataFileName) { console.error('usage: node tools/merge_data.mjs <basin> --humidity-synoptic <data-file-name>'); process.exit(1); }
    mergeHumiditySynoptic(basin, dataFileName);
  } else if (mode === '--shear') {
    if (!dataFileName) { console.error('usage: node tools/merge_data.mjs <basin> --shear <data-file-name>'); process.exit(1); }
    mergeShear(basin, dataFileName);
  } else if (mode === '--shear-synoptic') {
    if (!dataFileName) { console.error('usage: node tools/merge_data.mjs <basin> --shear-synoptic <data-file-name>'); process.exit(1); }
    mergeShearSynoptic(basin, dataFileName);
  } else if (mode === '--shear-jet') {
    if (!dataFileName) { console.error('usage: node tools/merge_data.mjs <basin> --shear-jet <data-file-name>'); process.exit(1); }
    mergeShearJet(basin, dataFileName);
  } else if (mode === '--steer') {
    if (!dataFileName) { console.error('usage: node tools/merge_data.mjs <basin> --steer <data-file-name>'); process.exit(1); }
    mergeSteer(basin, dataFileName);
  } else if (mode === '--env-seas') {
    if (!dataFileName) { console.error('usage: node tools/merge_data.mjs <basin> --env-seas <data-file-name>'); process.exit(1); }
    mergeEnvSeas(basin, dataFileName);
  } else if (mode === '--storm-maps') {
    if (!dataFileName) { console.error('usage: node tools/merge_data.mjs <basin> --storm-maps <data-file-name>'); process.exit(1); }
    mergeStormMaps(basin, dataFileName);
  } else if (mode === '--storms') {
    if (!dataFileName) { console.error('usage: node tools/merge_data.mjs <basin> --storms <data-file-name>'); process.exit(1); }
    mergeStorms(basin, dataFileName);
  } else {
    merge(basin);
  }
}
