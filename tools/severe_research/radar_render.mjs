// A recorded storm (wk82_run.mjs: <run>.json and <run>.dbz3d.i8) seen by the radar operator of src/severe-radar.js and drawn with the palette: one PNG.
//   node tools/severe_research/radar_render.mjs <run.json> <minute> <out.png> [key=value ...]
// keys: radar=x,y (km, the radar's place from the box's south-west corner, default 140,45), elev=0.5, view=cx,cy,mpp,w,h (km east and north of the radar at the picture's centre, metres per
// pixel, pixels; default 70,0,100,1400,800), seed=1, n=4 (independent samples), clutter=1, clear=1, pal=<file>, bg=r,g,b, dbz=- (print the range of the data)
import '../../src/severe-palette.js';
import '../../src/severe-radar.js';
import { readFileSync } from 'node:fs';
import { writePng } from './png.mjs';

const [runPath, minute, outPath, ...kv] = process.argv.slice(2), opt = Object.fromEntries(kv.map((s) => s.split('=')));
const run = JSON.parse(readFileSync(runPath, 'utf8')), P = globalThis.HFSeverePalette, R = globalThis.HFSevereRadar;
export function loadFrame(run, runPath, minute) {
  const f = run.dbz3d, fi = f.times.findIndex((t) => Math.abs(t - minute) < 1e-6);
  if (fi < 0) throw new Error('no frame at minute ' + minute + ' (have ' + f.times.join(',') + ')');
  const all = readFileSync(runPath.replace(/[^/]*$/, '') + f.file), per = run.nz * run.ny * run.nx;
  return { nx: run.nx, ny: run.ny, nz: run.nz, dx: run.dx, dy: run.dx, dz: run.dz, floor: -30, dbz: new Int8Array(all.buffer, all.byteOffset + fi * per, per) };
}
const vol = loadFrame(run, runPath, +minute);
const rad = (opt.radar || '140,45').split(',').map(Number), view = (opt.view || '70,0,100,1400,800').split(',').map(Number);
const pal = P.parse(readFileSync(opt.pal || new URL('../../data/severe/Apocs_BR_Expert.pal', import.meta.url), 'utf8')), lut = P.lut(pal, { vmin: -40, vmax: 105, step: 0.05 });
const t0 = Date.now();
const sweep = R.scan(vol, { x: rad[0] * 1000, y: rad[1] * 1000, elev: +(opt.elev || 0.5), seed: +(opt.seed || 1), n: +(opt.n || 2), clutter: { ground: +(opt.clutter ?? 1), clearAir: +(opt.clear ?? 1) } });
const t1 = Date.now();
const img = R.render(sweep, lut, { w: view[3], h: view[4], cx: view[0] * 1000, cy: view[1] * 1000, mpp: view[2], bg: (opt.bg || '11,13,26').split(',').map(Number).concat(255) });
writePng(outPath, view[3], view[4], img);
let mx = -99, cnt = 0; for (const v of sweep.dbz) if (v === v) { cnt++; if (v > mx) mx = v; }
console.log('scan ' + (t1 - t0) + ' ms, render ' + (Date.now() - t1) + ' ms, ' + cnt + ' of ' + sweep.dbz.length + ' gates with data, strongest ' + mx + ' dBZ -> ' + outPath);
