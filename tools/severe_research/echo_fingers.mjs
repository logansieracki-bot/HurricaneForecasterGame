// echo_fingers.mjs <pack.hfp> [level km=1.25] [dBZ=40] [width cells=5]: the thin long parts of the nest's echo (a hook is one): the echo of T dBZ or more less its opening by a square of w cells (what is wider than w cells stays), the pieces of what is left
// that are at least 8 cells in area and 10 cells long, frame by frame; the totals for minutes 40 to 90 (docs/severe-research.md part 7: a number for "is there a finger", as hook_eye.mjs is one for "is there an eye")
//   node tools/severe_research/echo_fingers.mjs <pack.hfp> [level km = 1.25] [dBZ = 40] [width cells = 5]      (ROWS=1: every frame; KM=2.5: the width is given in km, and the longest of a finger of 5 km and its area of 2 km2 are the same
//   at any cell size, so that a nest of 333 m is measured as one of 500 m: the width is the odd number of cells nearest to it)
import '../../src/severe-geo.js';
import '../../src/severe-pack.js';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const [path, lv = '1.25', thr = '40', wc = '5'] = process.argv.slice(2), T = +thr, KM = process.env.KM ? +process.env.KM : 0;
let W = +wc, h = (W - 1) / 2, MINLEN = 10, MINAREA = 8, lastDx = 500;
const raw = readFileSync(path), body = gunzipSync(raw.subarray(4)), P = globalThis.HFSeverePack.fromBody(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
let frames = 0, withF = 0, area = 0, longest = 0; const rows = [];
for (let i = 0; i < P.n; i++) {
  const v = P.volume(i); if (!v.nests || P.times[i] < 40) continue;
  const nv = v.nests[0].vol, nx = nv.nx, ny = nv.ny, k = Math.min(nv.nz - 1, Math.floor(+lv * 1000 / nv.dz)), m = new Uint8Array(nx * ny);
  for (let q = 0; q < nx * ny; q++) m[q] = nv.dbz[k * nx * ny + q] >= T ? 1 : 0;
  if (KM) { W = 2 * Math.round((KM * 1000 / nv.dx - 1) / 2) + 1; h = (W - 1) / 2; MINLEN = Math.round(5000 / nv.dx); MINAREA = Math.max(1, Math.round(2e6 / (nv.dx * nv.dx))); }
  const er = new Uint8Array(nx * ny), op = new Uint8Array(nx * ny);
  for (let j = h; j < ny - h; j++) for (let x = h; x < nx - h; x++) { let all = 1; for (let b = -h; b <= h && all; b++) for (let a = -h; a <= h; a++) if (!m[(j + b) * nx + x + a]) { all = 0; break; } er[j * nx + x] = all; }
  for (let j = 0; j < ny; j++) for (let x = 0; x < nx; x++) if (er[j * nx + x]) for (let b = -h; b <= h; b++) for (let a = -h; a <= h; a++) { const jj = j + b, xx = x + a; if (jj >= 0 && jj < ny && xx >= 0 && xx < nx) op[jj * nx + xx] = 1; }
  const f = new Uint8Array(nx * ny); for (let q = 0; q < nx * ny; q++) f[q] = m[q] && !op[q] ? 1 : 0;
  const seen = new Uint8Array(nx * ny); let fa = 0, fl = 0, n = 0;
  for (let q0 = 0; q0 < nx * ny; q0++) if (f[q0] && !seen[q0]) {
    const st = [q0]; seen[q0] = 1; let a = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    while (st.length) { const q = st.pop(), x = q % nx, y = (q - x) / nx; a++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) { const xx = x + c, yy = y + b; if (xx >= 0 && xx < nx && yy >= 0 && yy < ny && f[yy * nx + xx] && !seen[yy * nx + xx]) { seen[yy * nx + xx] = 1; st.push(yy * nx + xx); } } }
    const len = Math.max(x1 - x0, y1 - y0) + 1; if (a >= MINAREA && len >= MINLEN) { n++; fa += a; fl = Math.max(fl, len); }
  }
  lastDx = nv.dx; const km2 = (nv.dx / 1000) ** 2; frames++; if (n) withF++; area += fa * km2; longest = Math.max(longest, fl * nv.dx / 1000); rows.push([P.times[i], n, fa * km2, fl * nv.dx / 1000]);
}
console.log(path.split('/').pop() + ': ' + withF + ' of ' + frames + ' frames from minute 40 have a finger (' + T + ' dBZ at ' + lv + ' km, thinner than ' + (W * lastDx / 1000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + ' km, at least ' + (MINLEN * lastDx / 1000).toFixed(1).replace(/\.0$/, '') + ' km long); mean area of fingers per frame ' + (area / frames).toFixed(1) + ' km2; the longest ' + longest.toFixed(1) + ' km');
if (process.env.ROWS) for (const r of rows) console.log('  minute ' + r[0] + ': ' + r[1] + ' fingers, ' + r[2].toFixed(1) + ' km2, longest ' + r[3].toFixed(1) + ' km');
