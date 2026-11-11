// A test card for the colour table: a sweep whose value runs smoothly round the compass from the table's lowest to its highest value (and out along the range), drawn gate by gate.
//   node tools/severe_research/radar_testcard.mjs <out.png> [pal=file] [size=900] [ramp=1]
// ramp=1 draws, instead, a model volume whose reflectivity rises from 0 to 105 dBZ along 120 km (east of the radar), seen through the whole operator (speckle, 0.5 dBZ steps, beam; no noise
// floor, clutter or clear air): the colours of the table as a storm would show them, with the speckle on top, out to the 100 dBZ end.
import '../../src/severe-palette.js';
import '../../src/severe-radar.js';
import { readFileSync } from 'node:fs';
import { writePng } from './png.mjs';

const [outPath, ...kv] = process.argv.slice(2), opt = Object.fromEntries(kv.map((s) => s.split('='))), size = +(opt.size || 900);
const P = globalThis.HFSeverePalette, R = globalThis.HFSevereRadar;
const pal = P.parse(readFileSync(opt.pal || new URL('../../data/severe/Apocs_BR_Expert.pal', import.meta.url), 'utf8')), lut = P.lut(pal, { vmin: -40, vmax: 105, step: 0.05 });
const nRad = 720, nGates = 920, dbz = new Float32Array(nRad * nGates), lo = pal.stops[0].v, hi = pal.stops[pal.stops.length - 1].v;
for (let a = 0; a < nRad; a++) for (let g = 0; g < nGates; g++) dbz[a * nGates + g] = lo + (hi - lo) * (a + 0.5) / nRad;
const sweep = { dbz, nRad, nGates, dAz: 0.5, gate: 250, r0: 2125, elev: 0.5, antenna: 0 };
if (opt.ramp) {
  const nx = 130, ny = 40, nz = 12, v = new Int8Array(nx * ny * nz);                                           // 130 x 40 km, 6 km deep, the radar at (5, 20) km
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[(k * ny + j) * nx + i] = Math.max(-30, Math.min(105, Math.round(105 * (i + 0.5 - 5) / 120)));
  const w = 1500, h = 300, sw = R.scan({ nx, ny, nz, dx: 1000, dy: 1000, dz: 500, dbz: v, floor: -30 }, { x: 5000, y: 20000, elev: 0.5, seed: 4, n: 2, antenna: 0, nGates: 520, clutter: { ground: 0, clearAir: 0 }, noise: { sparse: 0, z1: -90 } });
  writePng(outPath, w, h, R.render(sw, lut, { w, h, cx: 62000, cy: 0, mpp: 80 }));
} else
writePng(outPath, size, size, R.render(sweep, lut, { w: size, h: size, cx: 0, cy: 0, mpp: 2 * 120000 / size }));
console.log('wrote ' + outPath);
