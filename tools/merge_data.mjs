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

if (import.meta.url === `file://${process.argv[1]}`) {
  const basin = process.argv[2];
  if (!basin) { console.error('usage: node tools/merge_data.mjs <basin>'); process.exit(1); }
  merge(basin);
}
