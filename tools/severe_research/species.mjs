// The hydrometeors of a restart file's parent box (wk82_nest.mjs parent ... CKPT_AT) round its strongest updraft: by level, how many cells have any, the mean mixing ratios of rain, snow and graupel (g/kg), the share of the mass each has and the largest values.
//   node tools/severe_research/species.mjs <restart file>
import '../../src/severe-core.js';
import '../../src/severe-refl.js';
import { readFileSync } from 'node:fs';
const C = globalThis.HFSevereCore, ck = process.argv[2];
const raw = readFileSync(ck), hl = raw.readUInt32LE(0), head = JSON.parse(raw.subarray(4, 4 + hl).toString());
const nx = head.nx, ny = head.ny, nz = head.nz, N = head.N;
const core = C.create({ nx, ny, nz, dx: 500, dy: 500, dz: 500, moist: true, ice: true, iceParams: { n0g: 4e6, rhog: 400, n0r: 8e6, evap: 1 }, theta: () => 300, qv: () => 0.01, wind: { u: () => 0, v: () => 0 }, bc: { x: 'periodic', y: 'periodic' } });
let off = 4 + hl; const f = {}; for (const n of head.names) { f[n] = new Float64Array(raw.buffer.slice(raw.byteOffset + off, raw.byteOffset + off + N * 8)); off += N * 8; }
const S = f, idx = core.idx, sz = idx(0, 0, 1) - idx(0, 0, 0);
// the updraft
let best = -1, bi = 0, bj = 0; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const w = S.w[idx(i, j, 10)]; if (w > best) { best = w; bi = i; bj = j; } }
console.log('minute', head.time / 60, 'updraft', best.toFixed(1), 'm/s at', bi, bj);
const rho = (k) => core.base.rhoc[k];
console.log('level(km) | region: mean qr / qs / qg (g/kg) over cells with any hydrometeor within 15 km of the updraft; the share of the mass that is rain / graupel / snow; max qr, qg');
for (const k of [0, 1, 2, 3, 4, 6, 8, 10, 12]) {
  let sr = 0, ss = 0, sg = 0, n = 0, mr = 0, mg = 0, ms = 0;
  for (let j = Math.max(0, bj - 30); j < Math.min(ny, bj + 30); j++) for (let i = Math.max(0, bi - 30); i < Math.min(nx, bi + 30); i++) {
    const o = idx(i, j, k), r = S.qr[o], s = S.qs[o], g = S.qg[o]; if (r + s + g < 1e-6) continue;
    sr += r; ss += s; sg += g; n++; mr = Math.max(mr, r); mg = Math.max(mg, g); ms = Math.max(ms, s);
  }
  const tot = sr + ss + sg || 1;
  console.log(String((k + 0.5) * 0.5).padStart(5), '| n', String(n).padStart(5), '| mean qr', (1000 * sr / (n || 1)).toFixed(2), 'qs', (1000 * ss / (n || 1)).toFixed(2), 'qg', (1000 * sg / (n || 1)).toFixed(2), '| share rain', (sr / tot).toFixed(2), 'graupel', (sg / tot).toFixed(2), 'snow', (ss / tot).toFixed(2), '| max qr', (1000 * mr).toFixed(1), 'qs', (1000 * ms).toFixed(1), 'qg', (1000 * mg).toFixed(1));
}
