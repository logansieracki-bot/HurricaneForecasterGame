// The strongest maxima of the vertical vorticity of a restart file's parent box at a level (the 750 m one by default), with the updraft at 5 km above and the rain at the level: which of the many
// low-level vortices (a gust front's, the mesocyclone's) is the one a child should be centred on.
//   node tools/severe_research/vortmax.mjs <restart file> [level 0..39, 1 = 750 m]
import '../../src/severe-core.js';
import { readFileSync } from 'node:fs';
const C = globalThis.HFSevereCore, ck = process.argv[2], K = +(process.argv[3] || 1);
const raw = readFileSync(ck), hl = raw.readUInt32LE(0), head = JSON.parse(raw.subarray(4, 4 + hl).toString());
const nx = head.nx, ny = head.ny, nz = head.nz, N = head.N;
const core = C.create({ nx, ny, nz, dx: 500, dy: 500, dz: 500, moist: true, ice: true, iceParams: { n0g: 4e6, rhog: 400, n0r: 8e6, evap: 1 }, theta: () => 300, qv: () => 0.01, wind: { u: () => 0, v: () => 0 }, bc: { x: 'periodic', y: 'periodic' } });
let off = 4 + hl; const S = {}; for (const n of head.names) { S[n] = new Float64Array(raw.buffer.slice(raw.byteOffset + off, raw.byteOffset + off + N * 8)); off += N * 8; }
const idx = core.idx, sy = idx(0, 1, 0) - idx(0, 0, 0), z = new Float64Array(nx * ny);
for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const o = idx(i, j, K); z[j * nx + i] = (S.v[o] - S.v[o - 1]) / 500 - (S.u[o] - S.u[o - sy]) / 500; }
const peaks = [];
for (let j = 2; j < ny - 2; j++) for (let i = 2; i < nx - 2; i++) { const v = z[j * nx + i]; if (v < 0.008) continue; let ok = true; for (let dj = -4; dj <= 4 && ok; dj++) for (let di = -4; di <= 4; di++) if (z[(j + dj) * nx + i + di] > v) { ok = false; break; } if (ok) peaks.push([v, i, j]); }
peaks.sort((a, b) => b[0] - a[0]);
console.log('minute', head.time / 60, 'level', K, 'maxima of vertical vorticity (1e-3/s) at (x, y km), with the updraft at 5 km and the rain at that level:');
for (const [v, i, j] of peaks.slice(0, 10)) { const o = idx(i, j, K), w5 = Math.max(...[-2, -1, 0, 1, 2].map((d) => S.w[idx(i + d, j, 10)])), qr = S.qr[o] * 1000; console.log('  ' + (v * 1000).toFixed(1).padStart(6), '(' + (i * 0.5 + 0.25).toFixed(1) + ', ' + (j * 0.5 + 0.25).toFixed(1) + ')', 'w5km', w5.toFixed(1), 'qr', qr.toFixed(2), 'g/kg'); }
