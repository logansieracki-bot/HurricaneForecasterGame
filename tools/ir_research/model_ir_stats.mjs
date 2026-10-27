import '../../src/storm-cities.js';
import '../../src/storms.js';
import '../../src/storm-nest.js';
import { writeFileSync } from 'node:fs';
const N = globalThis.HFNest, KT = 0.514444, NG = N.N, NN = NG * NG;
function forcing(o) {
  const vt = new Float32Array(N.NR), V = o.v * KT, rm = o.rmax, r34 = o.r34 || 120, x = Math.max(0.3, Math.min(1.1, Math.log(V / 17.5) / Math.log(r34 / rm))), nIn = 1 + 2 * Math.min(1, Math.max(0, (o.v - 50) / 50));
  for (let i = 0; i < N.NR; i++) vt[i] = i <= rm ? V * Math.pow(i / rm, nIn) : V * Math.pow(rm / i, x);
  return Object.assign({ clat: 18, clon: -60, lat: 18, vmax: V, rmax: rm, org: 0, shear: 3, shdir: 0, uem: 0, vem: 0, ued: 0, ved: 0, head: Math.PI / 4, spd: 4, rh: 0.72, sst: 28.8, eta: 0, etdir: 0.8, conv: 1, sg: 1, vt }, o.extra || {});
}
const cases = JSON.parse(process.argv[2]); const hours = +(process.argv[3] || 4); const out = [];
for (const c of cases) {
  const n = N.create({ seed: c.seed || 7 }); n.init(forcing(c)); const dt = 240; for (let i = 0; i < hours * 3600 / dt; i++) n.step(dt);
  n.display(0, true, true); const tb = n.irTb(new Float32Array(NN), c.extra && c.extra.sst != null ? c.extra.sst : 28.8);
  const res = 2, cell = res * res; const area = (th) => { let k = 0; for (let i = 0; i < NN; i++) if (tb[i] < th) k++; return k * cell; };
  let tmin = 1e9; for (let i = 0; i < NN; i++) if (tb[i] < tmin) tmin = tb[i];
  const prof = []; for (let r0 = 0; r0 < 250; r0 += 10) { let s = 0, m = 0; for (let k = 0; k < NN; k++) { const r = n.rr[k]; if (r >= r0 && r < r0 + 10) { s += tb[k]; m++; } } prof.push(m ? s / m : null); }
  let eye = -99; for (let k = 0; k < NN; k++) if (n.rr[k] <= 24 && tb[k] > eye) eye = tb[k];
  out.push({ label: c.label, v: c.v, hours, tmin, A40: area(-40), A60: area(-60), A70: area(-70), A80: area(-80), eye, prof });
}
console.log(JSON.stringify(out));
