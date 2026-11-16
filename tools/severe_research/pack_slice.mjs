// pack_slice.mjs <pack.hfp> <frame (an index, or m67 for the frame nearest to minute 67)> <out.png> [key=value ...]: horizontal slices of a storm pack's nest (or of its box, nests=0), three panels side by side:
// reflectivity (the Apocs table) at `dbz` metres up (1250), vertical velocity at `w` metres (3000) and vertical vorticity at `z` metres (750), the last two blue for negative and red for positive. It says where the strongest updraft and the
// strongest rotation (the greatest vertical vorticity at the level `z`) are, in km east and north of the picture's south-west corner, and how far apart they are, which is what "is the hook round the rotation?" asks:
// docs/severe-research.md part 7 ("Where the rotation is, against the hook").
//   node tools/severe_research/pack_slice.mjs data/severe/packs/outbreak-500m.hfp m67 /tmp/slice.png dbz=1250 w=3000 z=750 scale=6
// keys: dbz, w, z (metres up), scale (pixels a cell, 6), wmax (m/s of full colour, 25), zmax (1/s, 0.03), nests=0 (the box alone), crop=x0,x1,y0,y1 (km from the corner)
import '../../src/severe-geo.js';
import '../../src/severe-pack.js';
import '../../src/severe-palette.js';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { writePng } from './png.mjs';

const [path, which, outPath, ...kv] = process.argv.slice(2), opt = Object.fromEntries(kv.map((s) => s.split('=')));
if (!path || !which || !outPath) { console.error('usage: pack_slice.mjs <pack.hfp> <frame | mMINUTE> <out.png> [dbz=1250 w=3000 z=750 scale=6 wmax=25 zmax=0.03 nests=0 crop=x0,x1,y0,y1]'); process.exit(1); }
const raw = readFileSync(path), body = gunzipSync(raw.subarray(4)), P = globalThis.HFSeverePack.fromBody(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
let fi = +which; if (/^m/.test(which)) { const t = +which.slice(1); fi = 0; for (let i = 0; i < P.n; i++) if (Math.abs(P.times[i] - t) < Math.abs(P.times[fi] - t)) fi = i; }
const vol = P.volume(fi), useNest = opt.nests !== '0' && vol.nests && vol.nests.length, V = useNest ? vol.nests[0].vol : vol, x0 = useNest ? vol.nests[0].x : 0, y0 = useNest ? vol.nests[0].y : 0;
const { nx, ny, nz, dx } = V, dz = V.dz, scale = +(opt.scale || 6), wmax = +(opt.wmax || 25), zmax = +(opt.zmax || 0.03);
const lev = (m) => Math.max(0, Math.min(nz - 1, Math.round((m - V.floor) / dz - 0.5 + 0.0)));
const kd = lev(+(opt.dbz || 1250)), kw = lev(+(opt.w || 3000)), kz = lev(+(opt.z || 750));
const [cx0, cx1, cy0, cy1] = opt.crop ? opt.crop.split(',').map(Number) : [0, nx * dx / 1000, 0, ny * dx / 1000];
const i0 = Math.max(0, Math.floor(cx0 * 1000 / dx)), i1 = Math.min(nx, Math.ceil(cx1 * 1000 / dx)), j0 = Math.max(0, Math.floor(cy0 * 1000 / dx)), j1 = Math.min(ny, Math.ceil(cy1 * 1000 / dx));
const at = (a, k, i, j) => a[(k * ny + j) * nx + i];
const pal = globalThis.HFSeverePalette.parse(readFileSync(new URL('../../data/severe/Apocs_BR_Expert.pal', import.meta.url), 'utf8')), lut = globalThis.HFSeverePalette.lut(pal, { vmin: -40, vmax: 105, step: 0.5 });
const div = (x, m) => { const t = Math.max(-1, Math.min(1, x / m)); return t < 0 ? [255 + 255 * t, 255 + 255 * t * 0.6, 255] : [255, 255 - 255 * t * 0.7, 255 - 255 * t]; };
const W = (i1 - i0) * scale, H = (j1 - j0) * scale, GAP = 6, OW = 3 * W + 2 * GAP, out = new Uint8Array(OW * H * 4).fill(18);
let wBest = -1e9, wi = 0, wj = 0, zBest = -1e9, zi = 0, zj = 0, dmax = -1e9;
for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
  const d = at(V.dbz, kd, i, j), ww = at(V.w, kw, i, j), im = Math.max(0, i - 1), ip = Math.min(nx - 1, i + 1), jm = Math.max(0, j - 1), jp = Math.min(ny - 1, j + 1);
  const z = (at(V.v, kz, ip, j) - at(V.v, kz, im, j)) / ((ip - im) * dx) - (at(V.u, kz, i, jp) - at(V.u, kz, i, jm)) / ((jp - jm) * dx);
  if (ww > wBest) { wBest = ww; wi = i; wj = j; } if (z > zBest) { zBest = z; zi = i; zj = j; } dmax = Math.max(dmax, d);
  const idx = Math.max(0, Math.min(lut.n - 1, Math.round((d - lut.vmin) / lut.step))), cols = [d <= -29 ? [14, 18, 28] : [lut.rgba[4 * idx], lut.rgba[4 * idx + 1], lut.rgba[4 * idx + 2]], div(ww, wmax), div(z, zmax)];
  for (let p = 0; p < 3; p++) for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) { const X = p * (W + GAP) + (i - i0) * scale + sx, Y = (j1 - 1 - j) * scale + sy, o = (Y * OW + X) * 4; out[o] = cols[p][0]; out[o + 1] = cols[p][1]; out[o + 2] = cols[p][2]; out[o + 3] = 255; }
}
// a cross at the strongest updraft (white) and at the strongest rotation (black) in each panel
const mark = (i, j, c) => { for (let p = 0; p < 3; p++) for (let d = -4; d <= 4; d++) for (const [ax, ay] of [[d, 0], [0, d]]) { const X = p * (W + GAP) + (i - i0) * scale + (scale >> 1) + ax, Y = (j1 - 1 - j) * scale + (scale >> 1) + ay; if (X >= 0 && X < OW && Y >= 0 && Y < H) { const o = (Y * OW + X) * 4; out[o] = c; out[o + 1] = c; out[o + 2] = c; } } };
mark(wi, wj, 255); mark(zi, zj, 0);
writePng(outPath, OW, H, out);
const km = (i) => ((i + 0.5) * dx / 1000).toFixed(1), sep = Math.hypot((wi - zi) * dx, (wj - zj) * dx) / 1000;
console.log('frame ' + fi + ' (minute ' + P.times[fi] + ', ' + (useNest ? 'the nest of ' + dx + ' m, its corner at ' + (x0 / 1000) + ', ' + (y0 / 1000) + ' km of the box' : 'the box of ' + dx + ' m') + '): reflectivity at ' + ((kd + 0.5) * dz + V.floor) + ' m up to ' + dmax + ' dBZ; strongest updraft ' + wBest.toFixed(1) + ' m/s at ' + ((kw + 0.5) * dz + V.floor) + ' m at (' + km(wi) + ', ' + km(wj) + ') km (white cross); strongest vorticity ' + (zBest * 1000).toFixed(1) + ' per 1000 s at ' + ((kz + 0.5) * dz + V.floor) + ' m at (' + km(zi) + ', ' + km(zj) + ') km (black cross); they are ' + sep.toFixed(1) + ' km apart');
