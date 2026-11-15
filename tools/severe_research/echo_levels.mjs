// echo_levels.mjs <pack.hfp> <frame (an index, or m70 for the frame nearest to minute 70)> ...: the echo of a frame of a storm pack by height, in the terms of the real-radar comparison of docs/severe-research.md part 3 (the CFAD of two
// real supercells: the real storms' weak echo, 15 to 25 dBZ, at every height; the model's anvil too deep and too reflective at 10 to 14 km): the storm's columns are those with 40 dBZ or more somewhere in them; at each level the share
// of them with 20 dBZ or more, the area of 40 dBZ or more and of 15 to 40 dBZ (km2) and the median of their echo of 0 dBZ or more; and the height of the echo top (20 dBZ) of the storm's columns (median and 90th percentile).
//   node tools/severe_research/echo_levels.mjs <pack.hfp> m60 m75 m90
import '../../src/severe-geo.js';
import '../../src/severe-pack.js';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const [src, ...frames] = process.argv.slice(2);
const raw = readFileSync(src), body = gunzipSync(raw.subarray(4)), P = globalThis.HFSeverePack.fromBody(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
const idxOf = (f) => /^m/.test(f) ? P.times.reduce((b, t, k) => Math.abs(t - +f.slice(1)) < Math.abs(P.times[b] - +f.slice(1)) ? k : b, 0) : +f;
for (const f of frames) {
  const fi = idxOf(f), v = P.volume(fi), { nx, ny, nz, dx, dy, dz, dbz } = v, nxy = nx * ny, A = dx * dy / 1e6, cols = [];
  for (let c = 0; c < nxy; c++) { let mx = -99; for (let k = 0; k < nz; k++) mx = Math.max(mx, dbz[k * nxy + c]); if (mx >= 40) cols.push(c); }
  const tops = cols.map((c) => { let t = 0; for (let k = nz - 1; k >= 0; k--) if (dbz[k * nxy + c] >= 20) { t = (k + 0.5) * dz / 1000; break; } return t; }).sort((p, q) => p - q);
  const out = [];
  for (const zk of [2.25, 5.25, 8.25, 10.25, 11.25, 12.25]) {
    const k = Math.min(nz - 1, Math.round(zk * 1000 / dz - 0.5)); let n20 = 0, a40 = 0, a15 = 0; const vals = [];
    for (const c of cols) { const d = dbz[k * nxy + c]; if (d >= 20) n20++; if (d >= 40) a40++; else if (d >= 15) a15++; if (d >= 0) vals.push(d); }
    vals.sort((p, q) => p - q);
    out.push(zk + ' km: ' + (100 * n20 / Math.max(1, cols.length)).toFixed(0) + ' % >= 20 dBZ, 40+ ' + (a40 * A).toFixed(0) + ' km2, 15-40 ' + (a15 * A).toFixed(0) + ' km2, median ' + (vals.length ? vals[vals.length >> 1].toFixed(0) : '-'));
  }
  console.log(src.replace(/.*\//, '') + ' frame ' + fi + ' (minute ' + P.times[fi] + '), ' + cols.length + ' storm columns (' + (cols.length * A).toFixed(0) + ' km2), echo top (20 dBZ) median ' + tops[tops.length >> 1].toFixed(1) + ' km, 90th percentile ' + tops[Math.floor(0.9 * tops.length)].toFixed(1) + ' km\n   ' + out.join('\n   '));
}
