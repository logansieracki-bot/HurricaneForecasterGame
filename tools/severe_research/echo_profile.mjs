// echo_profile.mjs: how the echo falls off outside a storm's strong core, in a real radar sweep and in a frame of a storm pack seen by the operator, in the same terms: for the pixels outside the echo of `thr` dBZ
// or more (40 by default), by their distance from it (bins of 0.5 km, to 8 km), the share that has echo of 20, 10 and 5 dBZ or more, and the median echo of those that have any; and the width of the edge of the echo of
// `in` dBZ (30) to under `out` dBZ (10) along its border, in quantiles (`map=` draws the border coloured by its width). The user's remark of 15 Nov, "the outflow edge, it usually fades out MUCH longer in normal supercells",
// and docs/severe-research.md part 3 ("How the echo fades outside a strong core, as profiles"), which has the numbers of three real storms and of the model.
//   node tools/severe_research/echo_profile.mjs real <base> [thr=40] [in=30 out=10] [map=out.png]     (nexrad_sweep.py's <base>.json and .f32; the window is centred on the strongest cluster of 50 dBZ between 20 and 150 km)
//   node tools/severe_research/echo_profile.mjs pack <pack.hfp> <frame (an index, or m70)> [radar=x,y (km in the box; default 45 km south-west of the strongest updraft)] [elev=0.5] [n=16] [edge=0] [win=100] [thr=40] [clear=1 ground=1] [in=30 out=10] [map=out.png]
import '../../src/severe-geo.js';
import '../../src/severe-pack.js';
import '../../src/severe-radar.js';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const args = process.argv.slice(2), mode = args[0], src = args[1], rest = args.slice(2), frame = mode === 'pack' ? rest.shift() : undefined, opt = Object.fromEntries(rest.map((s) => s.split('=')));
if (mode !== 'real' && mode !== 'pack') { console.error('usage: echo_profile.mjs real <base> | pack <pack.hfp> <frame> [key=value ...]'); process.exit(1); }
const IN = +(opt.in || 30), OUT = +(opt.out || 10), R = globalThis.HFSevereRadar, DEG = Math.PI / 180, PX = 0.25, WIN = +(opt.win || 100), THR = 50, CORE = +(opt.thr || 40);
let sweep, center, label;
if (mode === 'real') {
  const meta = JSON.parse(readFileSync(src + '.json', 'utf8')), raw = readFileSync(src + '.f32');
  sweep = { dbz: new Float32Array(raw.buffer, raw.byteOffset, meta.n * meta.gates), nRad: meta.n, nGates: meta.gates, dAz: 360 / meta.n, gate: meta.dr, r0: meta.gate0 };
  let best = -1; const cnt = new Map(); center = [0, 0];
  for (let a = 0; a < meta.n; a++) for (let g = 0; g < meta.gates; g++) {
    const v = sweep.dbz[a * meta.gates + g], km = (meta.gate0 + g * meta.dr) / 1000; if (!(v >= THR) || km < 20 || km > 150) continue;
    const x = km * Math.sin((a + 0.5) * sweep.dAz * DEG), y = km * Math.cos((a + 0.5) * sweep.dAz * DEG), key = Math.round(x / 3) + ',' + Math.round(y / 3), c = (cnt.get(key) || 0) + 1;
    cnt.set(key, c); if (c > best) { best = c; center = [Math.round(x / 3) * 3, Math.round(y / 3) * 3]; }
  }
  label = meta.site + ' ' + src.replace(/.*\//, '') + ' at ' + Math.round(Math.hypot(center[0], center[1])) + ' km';
} else {
  const PK = globalThis.HFSeverePack, raw = readFileSync(src), body = gunzipSync(raw.subarray(4)), P = PK.fromBody(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
  const fi = /^m/.test(frame) ? P.times.reduce((b, t, k) => Math.abs(t - +frame.slice(1)) < Math.abs(P.times[b] - +frame.slice(1)) ? k : b, 0) : +frame, tr = P.track[fi];
  if (!(fi >= 0 && fi < P.n)) { console.error('no frame ' + frame + ' (the pack has ' + P.n + ')'); process.exit(1); }
  const rad = opt.radar ? opt.radar.split(',').map((v) => +v * 1000) : [tr[0] - 45000 / Math.SQRT2, tr[1] - 45000 / Math.SQRT2];
  const vol = P.volume(fi), so = { x: rad[0], y: rad[1], elev: +(opt.elev || 0.5), seed: 1, n: +(opt.n || 16), edge: +(opt.edge || 0), clutter: { ground: +(opt.ground ?? 1), clearAir: +(opt.clear ?? 1) }, velocity: false };
  sweep = R.scan(vol, so);
  center = [(tr[0] - rad[0]) / 1000, (tr[1] - rad[1]) / 1000];
  label = src.replace(/.*\//, '') + ' frame ' + fi + ' (minute ' + P.times[fi] + '), the radar ' + Math.round(Math.hypot(center[0], center[1])) + ' km from the strongest updraft';
}
const N = Math.round(WIN / PX), half = WIN / 2, f = new Float32Array(N * N).fill(NaN);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const x = center[0] - half + (i + 0.5) * PX, y = center[1] - half + (j + 0.5) * PX, r = Math.hypot(x, y) * 1000;
  let az = Math.atan2(x, y) / DEG; if (az < 0) az += 360;
  const a = Math.floor(az / sweep.dAz) % sweep.nRad, g = Math.round((r - sweep.r0) / sweep.gate);
  if (g >= 0 && g < sweep.nGates) { const v = sweep.dbz[a * sweep.nGates + g]; if (v === v) f[j * N + i] = v; }
}
const D1 = 1, D2 = Math.SQRT2, dist = new Float32Array(N * N).fill(1e9);
for (let k = 0; k < N * N; k++) if (f[k] >= CORE) dist[k] = 0;
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; let d = dist[k]; if (i > 0) d = Math.min(d, dist[k - 1] + D1); if (j > 0) { d = Math.min(d, dist[k - N] + D1); if (i > 0) d = Math.min(d, dist[k - N - 1] + D2); if (i < N - 1) d = Math.min(d, dist[k - N + 1] + D2); } dist[k] = d; }
for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) { const k = j * N + i; let d = dist[k]; if (i < N - 1) d = Math.min(d, dist[k + 1] + D1); if (j < N - 1) { d = Math.min(d, dist[k + N] + D1); if (i < N - 1) d = Math.min(d, dist[k + N + 1] + D2); if (i > 0) d = Math.min(d, dist[k + N - 1] + D2); } dist[k] = d; }
const m = Math.round(10 / PX), BIN = 0.5, NB = 16, bins = Array.from({ length: NB }, () => ({ n: 0, e20: 0, e10: 0, e5: 0, v: [] }));
for (let j = m; j < N - m; j++) for (let i = m; i < N - m; i++) {
  const k = j * N + i, d = dist[k] * PX; if (!(d > 0) || d >= NB * BIN) continue;
  const b = bins[Math.floor(d / BIN)], v = f[k]; b.n++; if (v >= 20) b.e20++; if (v >= 10) b.e10++; if (v >= 5) b.e5++; if (v >= 0) b.v.push(v);
}
let nCore = 0; for (let k = 0; k < N * N; k++) if (f[k] >= CORE) nCore++;
const pc = (a, n) => n ? (100 * a / n).toFixed(0).padStart(3) : '  -', md = (v) => v.length ? v.sort((p, q) => p - q)[v.length >> 1].toFixed(0).padStart(3) : '  -';
console.log(label + ': core (' + CORE + ' dBZ or more) ' + (nCore * PX * PX).toFixed(0) + ' km2');
console.log('  distance from the core (km)   share with 20+ dBZ, 10+, 5+ (%), and the median echo of those with echo (dBZ)');
for (let q = 0; q < NB; q++) { const b = bins[q]; console.log('  ' + (q * BIN).toFixed(1) + ' to ' + ((q + 1) * BIN).toFixed(1) + '   ' + pc(b.e20, b.n) + ' ' + pc(b.e10, b.n) + ' ' + pc(b.e5, b.n) + '    median ' + md(b.v) + '   (' + b.n + ' pixels)'); }
// the sharpest edges: for the pixels on the border of the echo of `in` dBZ or more (30), the distance to the nearest pixel under `out` dBZ (10) (or with no echo), in km: quantiles, and the share within 0.5 and 1 km (a real supercell's
// edge is a few kilometres wide nearly everywhere; a model's has stretches that are a cell or two wide)
{
  const far = new Float32Array(N * N).fill(1e9);
  for (let k = 0; k < N * N; k++) if (!(f[k] >= OUT)) far[k] = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; let d = far[k]; if (i > 0) d = Math.min(d, far[k - 1] + D1); if (j > 0) { d = Math.min(d, far[k - N] + D1); if (i > 0) d = Math.min(d, far[k - N - 1] + D2); if (i < N - 1) d = Math.min(d, far[k - N + 1] + D2); } far[k] = d; }
  for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) { const k = j * N + i; let d = far[k]; if (i < N - 1) d = Math.min(d, far[k + 1] + D1); if (j < N - 1) { d = Math.min(d, far[k + N] + D1); if (i < N - 1) d = Math.min(d, far[k + N + 1] + D2); if (i > 0) d = Math.min(d, far[k + N - 1] + D2); } far[k] = d; }
  const inside = (v) => v >= IN, w = [];
  for (let j = m; j < N - m; j++) for (let i = m; i < N - m; i++) {
    if (!inside(f[j * N + i])) continue;
    if (inside(f[j * N + i - 1]) && inside(f[j * N + i + 1]) && inside(f[(j - 1) * N + i]) && inside(f[(j + 1) * N + i])) continue;
    w.push(far[j * N + i] * PX);
  }
  w.sort((p, q) => p - q);
  const q = (p) => w.length ? w[Math.min(w.length - 1, Math.floor(p * w.length))].toFixed(2) : '-', sh = (t) => w.length ? (100 * w.filter((d) => d <= t).length / w.length).toFixed(0) : '-';
  if (opt.map) {                                                                                           // map=<out.png>: the window (250 m a pixel, shown at 2 x) in grey by echo, the border of the 30 dBZ echo coloured by its width: red under 0.75 km, orange to 1.5, yellow to 3, green to 6, blue wider
    const { writePng } = await import('./png.mjs'), Z = 2, W = N * Z, rgba = new Uint8Array(W * W * 4);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, v = f[k], g = v === v ? Math.max(0, Math.min(255, Math.round((v + 10) / 70 * 255))) : 0;
      let c = [g, g, g];
      if (inside(v) && !(inside(f[k - 1]) && inside(f[k + 1]) && inside(f[k - N]) && inside(f[k + N]))) { const d = far[k] * PX; c = d <= 0.75 ? [255, 40, 40] : d <= 1.5 ? [255, 150, 0] : d <= 3 ? [255, 235, 0] : d <= 6 ? [60, 220, 60] : [70, 120, 255]; }
      for (let a = 0; a < Z; a++) for (let b = 0; b < Z; b++) { const o = (((N - 1 - j) * Z + a) * W + i * Z + b) * 4; rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255; }
    }
    writePng(opt.map, W, W, rgba);
  }
  console.log('  edge of the echo of ' + IN + ' dBZ or more to under ' + OUT + ' dBZ (' + w.length + ' border pixels): quantiles 10, 25, 50, 75, 90 %: ' + [0.1, 0.25, 0.5, 0.75, 0.9].map(q).join(', ') + ' km; within 0.5 km ' + sh(0.5) + ' %, within 1 km ' + sh(1) + ' %');
}
