#!/usr/bin/env node
// Combines a basin's <basin>-geo.json + <basin>-climate.json + <basin>-imagery.json
// (each built independently by make_geo.mjs / make_climate.py / make_imagery.py)
// into the single <basin>-data.json build.mjs actually embeds into the template.
import { readFileSync, writeFileSync } from 'node:fs';
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const [basin, mode, dataFileName] = process.argv.slice(2);
  if (!basin) { console.error('usage: node tools/merge_data.mjs <basin>\n       node tools/merge_data.mjs <basin> --humidity <data-file-name>\n       node tools/merge_data.mjs <basin> --humidity-synoptic <data-file-name>\n       node tools/merge_data.mjs <basin> --shear <data-file-name>'); process.exit(1); }
  if (mode === '--humidity') {
    if (!dataFileName) { console.error('usage: node tools/merge_data.mjs <basin> --humidity <data-file-name>'); process.exit(1); }
    mergeHumidity(basin, dataFileName);
  } else if (mode === '--humidity-synoptic') {
    if (!dataFileName) { console.error('usage: node tools/merge_data.mjs <basin> --humidity-synoptic <data-file-name>'); process.exit(1); }
    mergeHumiditySynoptic(basin, dataFileName);
  } else if (mode === '--shear') {
    if (!dataFileName) { console.error('usage: node tools/merge_data.mjs <basin> --shear <data-file-name>'); process.exit(1); }
    mergeShear(basin, dataFileName);
  } else {
    merge(basin);
  }
}
