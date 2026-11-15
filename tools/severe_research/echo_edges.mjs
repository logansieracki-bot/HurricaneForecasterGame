// echo_edges.mjs: how abruptly the echo of a storm ends, in a real radar sweep and in a frame of a storm pack seen by the operator, in the same terms: (1) the width of the edge of the strong echo, the distance from a pixel on the border of the
// echo of 40 dBZ or more to the nearest pixel under 20 dBZ (or with no echo), in km, over the border pixels of a window round the storm (median, quartiles, the share within 1 km: a sharp edge is within a pixel or two, a real storm's fringe is
// kilometres wide); (2) the fringe: the area at 20 to 40 dBZ against the area at 40 dBZ or more (a real supercell's weak echo is several times its strong echo). Pixels of 250 m, the window 100 km across (the border pixels within 10 km of its
// sides are left out). The user's remark of 15 Nov, that the echo "just abruptly stops", and docs/severe-research.md part 3 (the real storms' weak echo, 15 to 25 dBZ, that the model's flat distribution lacks).
//   node tools/severe_research/echo_edges.mjs real <base>                  (nexrad_sweep.py's <base>.json and .f32; the window is centred on the strongest cluster of 50 dBZ (thr=) between 20 and 150 km)
//   node tools/severe_research/echo_edges.mjs pack <pack.hfp> <frame (an index, or m70 for the frame nearest to minute 70)> [radar=x,y (km in the box; default 45 km south-west of the strongest updraft)] [elev=0.5] [n=16] [edge=0] [win=100]
import '../../src/severe-geo.js';
import '../../src/severe-pack.js';
import '../../src/severe-radar.js';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const [mode, src, frame, ...kv] = process.argv.slice(2), opt = Object.fromEntries(kv.map((s) => s.split('=')));
if (mode !== 'real' && mode !== 'pack') { console.error('usage: echo_edges.mjs real <base> | pack <pack.hfp> <frame> [key=value ...]'); process.exit(1); }
const R = globalThis.HFSevereRadar, DEG = Math.PI / 180, PX = 0.25, WIN = +(opt.win || 100), THR = +(opt.thr || 50);                   // (km)
let sweep, center, label;
if (mode === 'real') {
  const meta = JSON.parse(readFileSync(src + '.json', 'utf8')), raw = readFileSync(src + '.f32');
  sweep = { dbz: new Float32Array(raw.buffer, raw.byteOffset, meta.n * meta.gates), nRad: meta.n, nGates: meta.gates, dAz: 360 / meta.n, gate: meta.dr, r0: meta.gate0 };
  let best = -1; const cnt = new Map(); center = [0, 0];                                                       // the strongest cluster of 50 dBZ gates (3 x 3 km boxes), 20 to 150 km out
  for (let a = 0; a < meta.n; a++) for (let g = 0; g < meta.gates; g++) {
    const v = sweep.dbz[a * meta.gates + g], km = (meta.gate0 + g * meta.dr) / 1000; if (!(v >= THR) || km < 20 || km > 150) continue;
    const x = km * Math.sin((a + 0.5) * sweep.dAz * DEG), y = km * Math.cos((a + 0.5) * sweep.dAz * DEG), key = Math.round(x / 3) + ',' + Math.round(y / 3), c = (cnt.get(key) || 0) + 1;
    cnt.set(key, c); if (c > best) { best = c; center = [Math.round(x / 3) * 3, Math.round(y / 3) * 3]; }
  }
  label = meta.site + ' ' + src.replace(/.*\//, '') + ' at ' + Math.round(Math.hypot(center[0], center[1])) + ' km, ' + meta.elev.toFixed(2) + ' deg';
} else {
  const PK = globalThis.HFSeverePack, raw = readFileSync(src), body = gunzipSync(raw.subarray(4)), P = PK.fromBody(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
  const fi = /^m/.test(frame) ? P.times.reduce((b, t, k) => Math.abs(t - +frame.slice(1)) < Math.abs(P.times[b] - +frame.slice(1)) ? k : b, 0) : +frame, tr = P.track[fi];          // (`m70`: the frame nearest to minute 70)
  if (!(fi >= 0 && fi < P.n)) { console.error('no frame ' + frame + ' (the pack has ' + P.n + ')'); process.exit(1); }
  const rad = opt.radar ? opt.radar.split(',').map((v) => +v * 1000) : [tr[0] - 45000 / Math.SQRT2 * 1, tr[1] - 45000 / Math.SQRT2 * 1];      // (45 km towards the south-west of the strongest updraft)
  const vol = P.volume(fi);
  sweep = R.scan(vol, { x: rad[0], y: rad[1], elev: +(opt.elev || 0.5), seed: 1, n: +(opt.n || 16), edge: +(opt.edge || 0), clutter: { ground: 1, clearAir: 1 }, velocity: false });
  center = [(tr[0] - rad[0]) / 1000, (tr[1] - rad[1]) / 1000];
  label = src.replace(/.*\//, '') + ' frame ' + fi + ' (minute ' + P.times[fi] + '), the radar ' + Math.round(Math.hypot(center[0], center[1])) + ' km from the strongest updraft';
}
const N = Math.round(WIN / PX), half = WIN / 2, f = new Float32Array(N * N).fill(NaN);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {                                                     // the sweep on a grid of 250 m, nearest gate
  const x = center[0] - half + (i + 0.5) * PX, y = center[1] - half + (j + 0.5) * PX, r = Math.hypot(x, y) * 1000;
  let az = Math.atan2(x, y) / DEG; if (az < 0) az += 360;
  const a = Math.floor(az / sweep.dAz) % sweep.nRad, g = Math.round((r - sweep.r0) / sweep.gate);
  if (g >= 0 && g < sweep.nGates) { const v = sweep.dbz[a * sweep.nGates + g]; if (v === v) f[j * N + i] = v; }
}
const strong = (v) => v >= 40, weak = (v) => !(v >= 20);                                                      // (NaN is weak: no echo)
const D1 = 1, D2 = Math.SQRT2;
function distFrom(is) {                                                                                       // a chamfer distance (in pixels) from the pixels that `is` says are of the kind
  const dist = new Float32Array(N * N).fill(1e9);
  for (let k = 0; k < N * N; k++) if (is(f[k])) dist[k] = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; let d = dist[k]; if (i > 0) d = Math.min(d, dist[k - 1] + D1); if (j > 0) { d = Math.min(d, dist[k - N] + D1); if (i > 0) d = Math.min(d, dist[k - N - 1] + D2); if (i < N - 1) d = Math.min(d, dist[k - N + 1] + D2); } dist[k] = d; }
  for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) { const k = j * N + i; let d = dist[k]; if (i < N - 1) d = Math.min(d, dist[k + 1] + D1); if (j < N - 1) { d = Math.min(d, dist[k + N] + D1); if (i < N - 1) d = Math.min(d, dist[k + N + 1] + D2); if (i > 0) d = Math.min(d, dist[k + N - 1] + D2); } dist[k] = d; }
  return dist;
}
const m = Math.round(10 / PX); let nS = 0, nW = 0, nWk = 0;
function borderWidths(inside, far) {                                                                          // for the border pixels of the region `inside`, the distance to the nearest pixel of the kind `far`, km
  const dist = distFrom(far), out = [];
  for (let j = m; j < N - m; j++) for (let i = m; i < N - m; i++) {
    if (!inside(f[j * N + i])) continue;
    if (inside(f[j * N + i - 1]) && inside(f[j * N + i + 1]) && inside(f[(j - 1) * N + i]) && inside(f[(j + 1) * N + i])) continue;
    out.push(dist[j * N + i] * PX);
  }
  return out.sort((p, q) => p - q);
}
for (let k = 0; k < N * N; k++) { const v = f[k]; if (strong(v)) nS++; else if (v >= 20) nW++; else if (v >= 0) nWk++; }
const edge = borderWidths(strong, weak), fringe = borderWidths((v) => v >= 20, (v) => !(v >= 5));              // (the strong echo's edge to under 20 dBZ; the edge of the 20 dBZ echo to under 5 dBZ or no echo: how wide the weak fringe is)
const qv = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN, A = PX * PX, share = (a) => a.length ? (100 * a.filter((d) => d <= 1).length / a.length).toFixed(0) : '-';
console.log(label + ': strong echo (40 dBZ or more) ' + (nS * A).toFixed(0) + ' km2, 20 to 40 dBZ ' + (nW * A).toFixed(0) + ' km2 (' + (nS ? (nW / nS).toFixed(2) : '-') + ' times the strong); strong echo to under 20 dBZ: median ' + qv(edge, 0.5).toFixed(2) + ' km, quartiles ' + qv(edge, 0.25).toFixed(2) + ' to ' + qv(edge, 0.75).toFixed(2) + ', within 1 km ' + share(edge) + ' %; the 20 dBZ echo to under 5 dBZ (the fringe, ' + fringe.length + ' border pixels): median ' + qv(fringe, 0.5).toFixed(2) + ' km, quartiles ' + qv(fringe, 0.25).toFixed(2) + ' to ' + qv(fringe, 0.75).toFixed(2) + ', 90th percentile ' + qv(fringe, 0.9).toFixed(2) + ', within 1 km ' + share(fringe) + ' %');
