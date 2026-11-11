// A real radar sweep (nexrad_sweep.py: <base>.json and <base>.f32) drawn with the renderer and the palette of the simulated radar, at the same scale, for the comparison of the
// look of a real WSR-88D base reflectivity with the operator's.
//   node tools/severe_research/radar_real_render.mjs <base> <out.png> [key=value ...]
// keys: view=cx,cy,mpp,w,h (km east and north of the radar at the picture's centre, metres per pixel, pixels; default: the strongest echo of 50 dBZ or more between 20 and 150 km, 70 m, 1500 x 860),
//       pal=<file>, bg=r,g,b, product=dbz (default) | vel | sw (the Doppler cut: needs nexrad_sweep.py --doppler)
import '../../src/severe-palette.js';
import '../../src/severe-radar.js';
import { readFileSync } from 'node:fs';
import { writePng } from './png.mjs';

const [base, outPath, ...kv] = process.argv.slice(2), opt = Object.fromEntries(kv.map((s) => s.split('=')));
const meta = JSON.parse(readFileSync(base + '.json', 'utf8')), raw = readFileSync(base + '.f32'), P = globalThis.HFSeverePalette, R = globalThis.HFSevereRadar;
const dbz = new Float32Array(raw.buffer, raw.byteOffset, meta.n * meta.gates), DEG = Math.PI / 180, product = opt.product || 'dbz', dir = base.replace(/[^/]*$/, '');
const sweep = { dbz, nRad: meta.n, nGates: meta.gates, dAz: 360 / meta.n, gate: meta.dr, r0: meta.gate0, elev: meta.elev, antenna: 30, x: 0, y: 0 };
for (const [k, file] of [['vel', meta.vel_file], ['sw', meta.sw_file]]) if (file) { const b = readFileSync(dir + file); sweep[k] = new Float32Array(b.buffer, b.byteOffset, meta.n * meta.vel_gates); }
if (!sweep[product]) throw new Error('no ' + product + ' in ' + base + ' (extract it with nexrad_sweep.py --doppler)');
if (product !== 'dbz') sweep.elev = meta.vel_elev;
let view = opt.view ? opt.view.split(',').map(Number) : null;
if (!view) {                                                                                             // the middle of the strongest cluster of 50 dBZ gates (a 3 x 3 km box with the most of them)
  let best = -1, bx = 70, by = 0; const cnt = new Map();
  for (let a = 0; a < meta.n; a++) for (let g = 0; g < meta.gates; g++) {
    const v = dbz[a * meta.gates + g], km = (meta.gate0 + g * meta.dr) / 1000; if (!(v >= 50) || km < 20 || km > 150) continue;
    const x = km * Math.sin((a + 0.5) * 360 / meta.n * DEG), y = km * Math.cos((a + 0.5) * 360 / meta.n * DEG), key = Math.round(x / 3) + ',' + Math.round(y / 3), c = (cnt.get(key) || 0) + 1;
    cnt.set(key, c); if (c > best) { best = c; bx = Math.round(x / 3) * 3; by = Math.round(y / 3) * 3; }
  }
  view = [bx, by, 70, 1500, 860];
}
const defPal = { dbz: 'Apocs_BR_Expert.pal', vel: 'User_BV_mph.pal', sw: 'Isobar_SW_placeholder.pal' }[product];
const pal = P.parse(readFileSync(opt.pal || new URL('../../data/severe/' + defPal, import.meta.url), 'utf8')), unit = product === 'dbz' ? 1 : P.unitScale(pal.units);                    // (a velocity is in m/s, the table may be in mph)
const range = product === 'dbz' ? [-40, 105] : [pal.stops[0].v - 5, pal.stops[pal.stops.length - 1].v + 5], lut = P.lut(pal, { vmin: range[0], vmax: range[1], step: product === 'dbz' ? 0.05 : 0.1 });
const img = R.render(sweep, lut, { w: view[3], h: view[4], cx: view[0] * 1000, cy: view[1] * 1000, mpp: view[2], field: product, scale: unit, bg: (opt.bg || '11,13,26').split(',').map(Number).concat(255) });
writePng(outPath, view[3], view[4], img);
let mx = -99, mn = 999; for (const v of sweep[product]) if (v === v) { if (v > mx) mx = v; if (v < mn) mn = v; }
console.log(meta.site + ' ' + sweep.elev.toFixed(2) + ' deg, picture centred ' + view[0] + ',' + view[1] + ' km from the radar, ' + product + ' from ' + mn + ' to ' + mx + (product === 'vel' ? ' m/s, Nyquist ' + meta.nyquist.toFixed(1) : '') + ' -> ' + outPath);
