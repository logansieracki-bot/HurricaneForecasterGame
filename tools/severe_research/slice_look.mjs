#!/usr/bin/env node
// A horizontal slice of a recorded storm, as three panels side by side: reflectivity (the Apocs table), vertical velocity and vertical vorticity (blue for negative, red for positive).
//   node tools/severe_research/slice_look.mjs <run.json> <frame-or-minute> <out.png> [level=0] [scale=3] [crop=x0,x1,y0,y1 in km of the grid] [wmax=20] [zmax=0.03]
// <run.json> is a recorder's run (wk82_run.mjs: its <run>.dbz3d.i8 and <run>.wind3d.i16, the argument a minute) or a nest's (wk82_nest.mjs child: <out>.json with <out>.cdbz.i8 and <out>.cuvw.i16, the
// argument the number of the frame). The vorticity is dv/dx - du/dy from the winds at the cell centres, 1/s. It prints the extremes of what it draws.
import '../../src/severe-palette.js';
import { readFileSync } from 'node:fs';
import { writePng } from './png.mjs';

const [runPath, which, outPath, ...kv] = process.argv.slice(2), opt = Object.fromEntries(kv.map((s) => s.split('=')));
const run = JSON.parse(readFileSync(runPath, 'utf8')), dir = runPath.replace(/[^/]*$/, ''), P = globalThis.HFSeverePalette;
const level = +(opt.level || 0), scale = +(opt.scale || 3), wmax = +(opt.wmax || 20), zmax = +(opt.zmax || 0.03);
let nx, ny, nz, dx, dbz, u, v, w, label;
if (run.dbz3d) {                                                       // the recorder's run
  nx = run.nx; ny = run.ny; nz = run.nz; dx = run.dx; const fi = run.dbz3d.times.findIndex((t) => Math.abs(t - +which) < 1e-6); if (fi < 0) throw new Error('no frame at minute ' + which + ': ' + run.dbz3d.times.join(','));
  const per = nx * ny * nz, db = readFileSync(dir + run.dbz3d.file), wb = readFileSync(dir + run.wind3d.file), wi = new Int16Array(wb.buffer.slice(wb.byteOffset, wb.byteOffset + wb.byteLength));
  dbz = new Int8Array(db.buffer, db.byteOffset + fi * per, per); const g = (c) => Float32Array.from({ length: per }, (_, i) => wi[(fi * 3 + c) * per + i] * run.wind3d.scale);
  u = g(0); v = g(1); w = g(2); label = 'minute ' + which;
} else {                                                               // a nest's child
  nx = run.nx; ny = run.ny; nz = run.nz; dx = run.dx; const fi = +which, per = nx * ny * nz, db = readFileSync(runPath.replace(/\.json$/, '.cdbz.i8')), ub = readFileSync(runPath.replace(/\.json$/, '.cuvw.i16'));
  if (fi < 0 || fi >= run.times.length) throw new Error('no frame ' + fi + ' (have ' + run.times.length + ', at ' + run.times.join(',') + ' s)');
  dbz = new Int8Array(db.buffer, db.byteOffset + fi * per, per); const ui = new Int16Array(ub.buffer.slice(ub.byteOffset, ub.byteOffset + ub.byteLength));
  const g = (c) => Float32Array.from({ length: per }, (_, i) => ui[fi * 3 * per + c * per + i] * 0.01); u = g(0); v = g(1); w = g(2); label = 'frame ' + fi + ' at ' + run.times[fi] + ' s';
}
const [cx0, cx1, cy0, cy1] = opt.crop ? opt.crop.split(',').map(Number) : [0, nx * dx / 1000, 0, ny * dx / 1000];
const i0 = Math.max(0, Math.floor(cx0 * 1000 / dx)), i1 = Math.min(nx, Math.ceil(cx1 * 1000 / dx)), j0 = Math.max(0, Math.floor(cy0 * 1000 / dx)), j1 = Math.min(ny, Math.ceil(cy1 * 1000 / dx));
const pal = P.parse(readFileSync(new URL('../../data/severe/Apocs_BR_Expert.pal', import.meta.url), 'utf8')), lut = P.lut(pal, { vmin: -40, vmax: 105, step: 0.5 });
const W = (i1 - i0) * scale, H = (j1 - j0) * scale, GAP = 6, out = new Uint8Array((3 * W + 2 * GAP) * H * 4).fill(18); const OW = 3 * W + 2 * GAP;
const at = (a, i, j) => a[(level * ny + j) * nx + i];
const div = (x, m) => { const t = Math.max(-1, Math.min(1, x / m)); return t < 0 ? [255 + 255 * t, 255 + 255 * t * 0.6, 255] : [255, 255 - 255 * t * 0.7, 255 - 255 * t]; };   // blue - white - red
let zmaxSeen = -1e9, zminSeen = 1e9, wmaxSeen = -1e9, wminSeen = 1e9, dmax = -1e9;
for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
  const d = at(dbz, i, j), ww = at(w, i, j), im = Math.max(0, i - 1), ip = Math.min(nx - 1, i + 1), jm = Math.max(0, j - 1), jp = Math.min(ny - 1, j + 1);
  const z = (at(v, ip, j) - at(v, im, j)) / ((ip - im) * dx) - (at(u, i, jp) - at(u, i, jm)) / ((jp - jm) * dx);
  zmaxSeen = Math.max(zmaxSeen, z); zminSeen = Math.min(zminSeen, z); wmaxSeen = Math.max(wmaxSeen, ww); wminSeen = Math.min(wminSeen, ww); dmax = Math.max(dmax, d);
  const idx = Math.max(0, Math.min(lut.n - 1, Math.round((d - lut.vmin) / lut.step))), c0 = [lut.rgba[4 * idx], lut.rgba[4 * idx + 1], lut.rgba[4 * idx + 2], lut.rgba[4 * idx + 3]];
  const cols = [d <= -29 ? [14, 18, 28] : [c0[0], c0[1], c0[2]], div(ww, wmax), div(z, zmax)];
  for (let p = 0; p < 3; p++) for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
    const X = p * (W + GAP) + (i - i0) * scale + sx, Y = (j1 - 1 - j) * scale + sy, o = (Y * OW + X) * 4; out[o] = cols[p][0]; out[o + 1] = cols[p][1]; out[o + 2] = cols[p][2]; out[o + 3] = 255;
  }
}
writePng(outPath, OW, H, out);
console.log(label + ', level ' + level + ' (' + ((level + 0.5) * (run.dz || 500)).toFixed(0) + ' m): reflectivity up to ' + dmax + ' dBZ, w from ' + wminSeen.toFixed(1) + ' to ' + wmaxSeen.toFixed(1) + ' m/s, vorticity from ' + (zminSeen * 1000).toFixed(1) + ' to ' + (zmaxSeen * 1000).toFixed(1) + ' 1e-3/s; panels: reflectivity, w (+-' + wmax + ' m/s), vorticity (+-' + zmax + ' 1/s) -> ' + outPath);
