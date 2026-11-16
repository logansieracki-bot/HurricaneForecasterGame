// nest_cover.mjs <pack.hfp> [from minute = 30] [to minute = 80]: how far inside the nest the storm's low-level rotation and its strongest updraft are, frame by frame (every second minute): the distance of each from the nest's nearest side, in km, negative
// outside it; the rotation is the greatest vertical vorticity at 750 m and the updraft the greatest vertical velocity at 3 km, both in the box's own cells (the 1 km parent of the Fine run, which a nest of any size is inside), so that
// where a nest was put can be told from the run that made it. The last line counts the frames with each 3 km or more inside. docs/severe-research.md part 7 ("Where the rotation is, against the nest, and the nest upshear"):
// a nest of 30 km in the middle of the box has the rotation inside on 17 of 26 frames from minute 30 to 80 of the outbreak day, 8 km upshear on 21.
//   node tools/severe_research/nest_cover.mjs /tmp/run.hfp 30 80
import '../../src/severe-geo.js';
import '../../src/severe-pack.js';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const [f, a = '30', b = '80'] = process.argv.slice(2), t0 = +a, t1 = +b;
if (!f) { console.error('usage: nest_cover.mjs <pack.hfp> [from minute] [to minute]'); process.exit(1); }
const raw = readFileSync(f), body = gunzipSync(raw.subarray(4)), P = globalThis.HFSeverePack.fromBody(new Uint8Array(body.buffer, body.byteOffset, body.byteLength)), rows = [];
for (let i = 0; i < P.n; i++) {
  const t = P.times[i]; if (t < t0 || t > t1 || t % 2) continue;
  const B = P.volume(i); if (!B.nests || !B.nests.length) continue; const N = B.nests[0], nw = N.vol.nx * N.vol.dx, nh = N.vol.ny * N.vol.dx;
  const kz = Math.max(0, Math.round(750 / B.dz - 0.5)), kw = Math.max(0, Math.round(3000 / B.dz - 0.5)); let zb = -1e9, zi = 0, zj = 0, wb = -1e9, wi = 0, wj = 0;
  for (let j = 1; j < B.ny - 1; j++) for (let ii = 1; ii < B.nx - 1; ii++) {
    const o = (kz * B.ny + j) * B.nx + ii, z = (B.v[o + 1] - B.v[o - 1]) / (2 * B.dx) - (B.u[o + B.nx] - B.u[o - B.nx]) / (2 * B.dx); if (z > zb) { zb = z; zi = ii; zj = j; }
    const w = B.w[(kw * B.ny + j) * B.nx + ii]; if (w > wb) { wb = w; wi = ii; wj = j; }
  }
  const margin = (x, y) => Math.min(x - N.x, N.x + nw - x, y - N.y, N.y + nh - y) / 1000;
  rows.push({ t, meso: margin((zi + 0.5) * B.dx, (zj + 0.5) * B.dx), up: margin((wi + 0.5) * B.dx, (wj + 0.5) * B.dx), z: zb * 1000 });
}
console.log(rows.map((r) => r.t + ': rotation ' + r.meso.toFixed(0) + ' km (' + r.z.toFixed(0) + ' per 1000 s), updraft ' + r.up.toFixed(0)).join(' | '));
console.log('frames ' + rows.length + ', the rotation 3 km or more inside the nest on ' + rows.filter((r) => r.meso >= 3).length + ' and the updraft on ' + rows.filter((r) => r.up >= 3).length);
