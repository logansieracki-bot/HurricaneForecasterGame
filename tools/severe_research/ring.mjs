// ring.mjs <pack> [level km=0.75] [thr=30] [from=40]: the low-level mesocyclone of the nest (the largest vertical vorticity at the level, 3x3 mean) frame by frame,
// and how far the echo of `thr` dBZ or more wraps round it: the share of the azimuth (72 rays) at radius 1.5, 2.5, 3.5 km that is echo, the echo at its middle,
// and whether the weak echo at its middle is closed (an eye from eyes.mjs within 3 km of it). A closed ring is a wrap of 100 % with a weak middle.
// Settings from the environment: RAD (km, 8) how far from the updraft at 4.25 km the vorticity is looked for (5 keeps out the forward flank's vortices), TO (minute) the last frame, BOX=1 reads the box when the pack has no nest, ROWS=1 a line a frame.
//   RAD=5 node tools/severe_research/ring.mjs data/severe/packs/outbreak-500m.hfp 0.75
const R = new URL('../../', import.meta.url).pathname;
await import(R + 'src/severe-geo.js'); await import(R + 'src/severe-pack.js');
const { eyes } = await import(R + 'tools/severe_research/eyes.mjs');
const { readFileSync } = await import('node:fs'), { gunzipSync } = await import('node:zlib');
const [pp, lv = '0.75', thr = '30', from = '40'] = process.argv.slice(2), raw = readFileSync(pp), body = gunzipSync(raw.subarray(4)), P = globalThis.HFSeverePack.fromBody(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
const T = +thr; let rows = [], sum = { n: 0, w: [0, 0, 0], closed: 0, weak: 0, zeta: 0, best: 0, mid: 0, wm: 0 };
for (let f = 0; f < P.n; f++) {
  if (P.times[f] < +from || P.times[f] > +(process.env.TO || 1e9)) continue;
  const V = P.volume(f); if (!V.nests && !process.env.BOX) continue; const N0 = V.nests ? V.nests[0].vol : V, nx = N0.nx, ny = N0.ny, dx = N0.dx, fz = Math.max(0, Math.min(N0.nz - 1.001, +lv * 1000 / N0.dz - 0.5)), k0 = Math.floor(fz), tz = fz - k0, o = 0, k = 0;
  const lay = (a) => { const r = new Float32Array(nx * ny), p0 = k0 * nx * ny, p1 = (k0 + 1) * nx * ny; for (let q = 0; q < nx * ny; q++) r[q] = a[p0 + q] * (1 - tz) + a[p1 + q] * tz; return r; };
  const N = { u: lay(N0.u), v: lay(N0.v), w: N0.w, dbz: lay(N0.dbz), nz: N0.nz, dz: N0.dz }, W2 = lay(N0.w);
  const z = new Float32Array(nx * ny);
  for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const q = o + j * nx + i; z[j * nx + i] = (N.v[q + 1] - N.v[q - 1] - N.u[q + nx] + N.u[q - nx]) / (2 * dx); }
  const k4 = Math.min(N.nz - 1, Math.floor(4250 / N.dz)); let wu = -1, ui = nx / 2, uj = ny / 2;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const w4 = N.w[k4 * nx * ny + j * nx + i]; if (w4 > wu) { wu = w4; ui = i; uj = j; } }
  let best = -1, bi = 0, bj = 0;
  for (let j = 3; j < ny - 3; j++) for (let i = 3; i < nx - 3; i++) { if (Math.hypot(i - ui, j - uj) * dx > (+process.env.RAD || 8) * 1000) continue; let s = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) s += z[(j + b) * nx + i + a]; if (s > best) { best = s; bi = i; bj = j; } }
  const zeta = best / 9, at = (x, y) => { const i = Math.round(x), j = Math.round(y); return i < 0 || j < 0 || i >= nx || j >= ny ? -30 : N.dbz[o + j * nx + i]; };
  const wrap = [1500, 2500, 3500].map((r) => { let e = 0; for (let a = 0; a < 72; a++) { const t = a * Math.PI / 36; if (at(bi + r / dx * Math.cos(t), bj + r / dx * Math.sin(t)) >= T) e++; } return e / 72; });
  const mid = at(bi, bj), ey = eyes(N.dbz, nx, ny, 0, T, 4).eyes.find((e) => Math.hypot(e.x - 0.5 - bi, e.y - 0.5 - bj) * dx < 3000);
  sum.n++; wrap.forEach((w, i) => sum.w[i] += w); if (ey) sum.closed++; if (mid < T) sum.weak++; sum.zeta += zeta; sum.mid += mid; sum.wm += W2[bj * nx + bi]; sum.best = Math.max(sum.best, zeta);
  rows.push(P.times[f] + ': z ' + (zeta * 1000).toFixed(0) + ' at ' + ((bi - nx / 2) * dx / 1000).toFixed(1) + ',' + ((bj - ny / 2) * dx / 1000).toFixed(1) + ' wrap ' + wrap.map((w) => Math.round(w * 100)).join('/') + ' mid ' + mid.toFixed(0) + ' w ' + W2[bj * nx + bi].toFixed(0) + ' from updraft ' + ((bi - ui) * dx / 1000).toFixed(1) + ',' + ((bj - uj) * dx / 1000).toFixed(1) + (ey ? ' EYE ' + (ey.cells * dx * dx / 1e6).toFixed(1) : ''));
}
console.log(pp.replace(/.*\//, '') + ' level ' + lv + ' km, echo >= ' + T + ' dBZ, from minute ' + from + ': ' + sum.n + ' frames; mean low-level vorticity ' + (sum.zeta / sum.n * 1000).toFixed(1) + 'e-3 (largest ' + (sum.best * 1000).toFixed(1) + '); mean wrap at 1.5/2.5/3.5 km ' + sum.w.map((w) => Math.round(w / sum.n * 100)).join('/') + ' %; mean echo at the middle ' + (sum.mid / sum.n).toFixed(0) + ' dBZ, w there ' + (sum.wm / sum.n).toFixed(1) + ' m/s; weak middle on ' + sum.weak + ', a closed eye on ' + sum.closed);
if (process.env.ROWS) console.log(rows.join('\n'));
