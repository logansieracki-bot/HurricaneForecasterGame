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

if (import.meta.url === `file://${process.argv[1]}`) {
  const [basin, mode, dataFileName] = process.argv.slice(2);
  if (!basin) { console.error('usage: node tools/merge_data.mjs <basin>\n       node tools/merge_data.mjs <basin> --humidity <data-file-name>'); process.exit(1); }
  if (mode === '--humidity') {
    if (!dataFileName) { console.error('usage: node tools/merge_data.mjs <basin> --humidity <data-file-name>'); process.exit(1); }
    mergeHumidity(basin, dataFileName);
  } else {
    merge(basin);
  }
}
