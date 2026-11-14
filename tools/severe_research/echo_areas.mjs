#!/usr/bin/env node
// How big the echo is: for every frame of a pack, the area (km2) at one level of the reflectivity at 30, 40, 50, 55 and 60 dBZ or more, and the strongest value of the level.
// A real isolated supercell has 50 dBZ or more over about 100 to 300 km2 at the lowest tilt; a storm that has been spread into a mass by its cold pool has several times that
// (docs/severe-research.md part 7, "What real hooks have that ours do not").
//   node tools/severe_research/echo_areas.mjs <pack.hfp> [level km = 1.25]
import '../../src/severe-geo.js';
import '../../src/severe-pack.js';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const [path, lv = '1.25'] = process.argv.slice(2);
if (!path) { console.error('usage: echo_areas.mjs <pack.hfp> [level km]'); process.exit(1); }
const raw = readFileSync(path), body = gunzipSync(raw.subarray(4)), P = globalThis.HFSeverePack.fromBody(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
const nx = P.nx, ny = P.ny, k = Math.min(P.nz - 1, Math.floor(+lv * 1000 / P.dz)), km2 = (P.dx / 1000) ** 2;
for (let i = 0; i < P.n; i++) {
  const d = P.frame(i).dbz, c = { 30: 0, 40: 0, 50: 0, 55: 0, 60: 0 }; let mx = -99;
  for (let j = 0; j < ny; j++) for (let x = 0; x < nx; x++) { const v = d[(k * ny + j) * nx + x]; if (v > mx) mx = v; for (const t in c) if (v >= +t) c[t]++; }
  console.log('minute ' + P.times[i].toFixed(1).padStart(5) + '  km2 >= ' + Object.keys(c).map((t) => t + ': ' + (c[t] * km2).toFixed(0)).join('  ') + '   max ' + mx.toFixed(0) + ' dBZ');
}
