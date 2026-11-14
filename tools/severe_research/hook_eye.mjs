#!/usr/bin/env node
// A number for "is there a hook?": at one level of a pack (1.25 km by default: the 0.5 degree beam's height at 40 to 60 km), the weak-echo EYE of the echo: a connected region of cells under 30 dBZ that the echo
// shuts in on every side, that never reaches the edge of the pack's box (so a notch or a bay open to the clear air is not one). A curled finger drawn round a weak echo, as in a hook, makes one; a triangle poking out does not.
// For each frame it says the eye's size (km2, the largest enclosed one of at least 6 cells), where it is (km east and north of the box's corner), and the area of echo (30 dBZ or more) at the level.
//   node tools/severe_research/hook_eye.mjs <pack.hfp> [level km = 1.25] [threshold dBZ = 30] [min cells = 6]
import '../../src/severe-geo.js';
import '../../src/severe-pack.js';
import { readFileSync } from 'node:fs';
import { eyes } from './eyes.mjs';
import { gunzipSync } from 'node:zlib';

const [path, lv = '1.25', thr = '30', minc = '6'] = process.argv.slice(2);
if (!path) { console.error('usage: hook_eye.mjs <pack.hfp> [level km] [threshold dBZ] [min cells]'); process.exit(1); }
const raw = readFileSync(path), body = gunzipSync(raw.subarray(4)), P = globalThis.HFSeverePack.fromBody(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
const nx = P.nx, ny = P.ny, k = Math.min(P.nz - 1, Math.floor(+lv * 1000 / P.dz)), T = +thr, MIN = +minc;

{
  console.log(path.split('/').pop() + ': level ' + ((k + 0.5) * P.dz / 1000).toFixed(2) + ' km, echo = ' + T + ' dBZ or more, an eye is at least ' + MIN + ' cells; cells of ' + P.dx + ' m');
  for (let i = 0; i < P.n; i++) {
    const r = eyes(P.frame(i).dbz, nx, ny, k, T, MIN), e = r.eyes[0], km2 = (P.dx / 1000) ** 2;
    console.log('minute ' + P.times[i].toFixed(1).padStart(5) + '  echo ' + (r.echo * km2).toFixed(0).padStart(5) + ' km2   eye ' + (e ? (e.cells * km2).toFixed(1).padStart(6) + ' km2 at (' + (e.x * P.dx / 1000).toFixed(1) + ', ' + (e.y * P.dx / 1000).toFixed(1) + ') km' + (r.eyes.length > 1 ? ' (+' + (r.eyes.length - 1) + ' smaller)' : '') : '  none'));
  }
}
