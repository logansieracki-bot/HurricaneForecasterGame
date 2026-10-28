// The game's infrared picture, measured the way the real storms were (docs/ir-research.md): a forced storm run through the nest, the cold areas, the radial mean
// brightness temperature, the eye, the cold tops' texture and the number of bursts, at chosen hours; the Tb fields can be dumped for the contact sheets (modelsheet.py).
//   node tools/ir_research/model_lab.mjs '<json: one case or a list>' [outprefix]
// a case: { label, seed, m, par (PAR keys to set), hours, every, spin, utc0, base: { v (kt), rmax (km), r34, shear (m/s), shdir (rad, the way the shear vector points), sst, rh, lat, lon, eta, etdir, spd, head, ...any forcing key },
//           prog: [ { h, <any numeric key of base> }, ... ] (linear in the hour; the keys not given keep the base) }
import '../../src/storm-cities.js';
import '../../src/storms.js';
import '../../src/storm-nest.js';
import { writeFileSync } from 'node:fs';
const N = globalThis.HFNest, KT = 0.514444, NG = N.N, NN = NG * NG, RAD = [5, 15, 25, 35, 45, 65, 85, 115, 155, 195, 245];

export function forcing(o) {
  const vt = new Float32Array(N.NR), V = o.v * KT, rm = o.rmax, r34 = o.r34 || 120, x = Math.max(0.3, Math.min(1.1, Math.log(V / 17.5) / Math.log(r34 / rm))), nIn = 1 + 2 * Math.min(1, Math.max(0, (o.v - 50) / 50));
  for (let i = 0; i < N.NR; i++) vt[i] = i <= rm ? V * Math.pow(i / rm, nIn) : V * Math.pow(rm / i, x);
  const lat = o.lat != null ? o.lat : 18, f = Object.assign({ clat: lat, clon: o.lon != null ? o.lon : -60, lat: Math.abs(lat), vmax: V, rmax: rm, org: 0, shear: (o.shear != null ? o.shear : 3), shdir: 0, uem: 0, vem: 0, ued: 0, ved: 0, head: Math.PI / 4, spd: 4, rh: 0.72, sst: 28.8, eta: 0, etdir: 0.8, conv: 1, sg: 1, vt, cold: 0 }, o.extra || {});
  for (const k of ['shdir', 'rh', 'sst', 'eta', 'etdir', 'spd', 'head', 'conv', 'cold', 'uem', 'vem', 'ued', 'ved']) if (o[k] != null) f[k] = o[k];
  return f;
}
const lerpObj = (a, b, t) => { const o = Object.assign({}, a); for (const k in b) if (k !== 'h' && typeof b[k] === 'number') o[k] = (a[k] != null ? a[k] : b[k]) + (b[k] - (a[k] != null ? a[k] : b[k])) * t; return o; };
function paramsAt(c, h) {
  const base = c.base || {}, pr = c.prog; if (!pr || !pr.length) return base;
  if (h <= pr[0].h) return Object.assign({}, base, pr[0]); if (h >= pr[pr.length - 1].h) return Object.assign({}, base, pr[pr.length - 1]);
  for (let i = 0; i + 1 < pr.length; i++) if (h >= pr[i].h && h <= pr[i + 1].h) return lerpObj(Object.assign({}, base, pr[i]), pr[i + 1], (h - pr[i].h) / (pr[i + 1].h - pr[i].h));
  return base;
}
export function measure(n, ts0) {
  n.display(0, true, true); const tb = n.irTb(new Float32Array(NN), ts0), cell = 4 * n.m * n.m;
  const area = (th) => { let k = 0; for (let i = 0; i < NN; i++) if (tb[i] < th) k++; return k * cell / 1000; };
  const prof = RAD.map((q) => { let s = 0, m = 0; for (let k = 0; k < NN; k++) { const r = n.rr[k] * n.m; if (r >= q - 5 && r < q + 5) { s += tb[k]; m++; } } return m ? s / m : null; });
  let eye = -99; for (let k = 0; k < NN; k++) if (n.rr[k] * n.m <= 24 && tb[k] > eye) eye = tb[k];
  // the cold tops' texture: std of Tb minus its 5 x 5 mean where that mean is colder than -50 C, and the median gradient per cell there
  const bm = new Float32Array(NN); for (let j = 2; j < NG - 2; j++) for (let i = 2; i < NG - 2; i++) { let s = 0; for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) s += tb[(j + b) * NG + i + a]; bm[j * NG + i] = s / 25; }
  let cnt = 0, s1 = 0, s2 = 0; const gr = [], hp = []; for (let j = 2; j < NG - 2; j++) for (let i = 2; i < NG - 2; i++) { const k = j * NG + i; if (bm[k] < -50) { const d = tb[k] - bm[k]; cnt++; s1 += d; s2 += d * d; hp.push(d); gr.push(Math.hypot(tb[k + 1] - tb[k - 1], tb[k + NG] - tb[k - NG]) / 2); } }
  gr.sort((a, b) => a - b); hp.sort((a, b) => a - b); let texr = null; if (cnt > 400) { const md = hp[hp.length >> 1], dv = hp.map((x) => Math.abs(x - md)).sort((a, b) => a - b); texr = 1.4826 * dv[dv.length >> 1]; }
  const sd = cnt > 400 ? Math.sqrt(s2 / cnt - (s1 / cnt) ** 2) : null, gm = cnt > 400 ? gr[gr.length >> 1] : null;
  let tmin = 1e9; for (let k = 0; k < NN; k++) if (tb[k] < tmin) tmin = tb[k];
  return { tb, st: { tmin, A40: area(-40), A60: area(-60), A70: area(-70), A80: area(-80), A20: area(-20), eye, prof, tex: sd, texr, grad: gm, bursts: n.bs.map((b) => (b.t >= 0 ? +b.a.toFixed(2) : null)), strip: +n.strip.toFixed(2), ef: +n.ef.toFixed(2), vN: +(n.vNest * n.m / KT).toFixed(1), g: +n.g.toFixed(2), mass: +n.ma.toFixed(2), towers: n.twn } };
}
const PAR0 = JSON.parse(JSON.stringify(N.PAR));
export function runCase(c, outp, log) {
  Object.assign(N.PAR, JSON.parse(JSON.stringify(PAR0)), c.par || {});                                                                                    // (c.par: PAR keys to set for this case)
  const base = c.base || {}, m = c.m || 1, hours = c.hours || 4, every = c.every || hours, spin = c.spin != null ? c.spin : 3, dt = c.dt || 240;
  const mk = (h) => { const f = forcing(paramsAt(c, h)); f.utc = ((c.utc0 || 0) + h) % 24; return m !== 1 ? N.scaleForcing(f, m) : f; };
  const n = N.create({ seed: c.seed || 7, m }); const f0 = mk(0); n.init(f0);
  const out = []; let h = -spin;
  const stepHour = (hh) => { const fa = mk(Math.max(hh, 0)), fb = mk(Math.max(hh + 1, 0)); n.setForcing(fa, fb); n.setEnv(null, fa); for (let i = 0; i < 3600 / dt; i++) n.step(dt); };
  for (; h < 0; h++) stepHour(h);
  let nextOut = 0;
  for (; h <= hours; h++) {
    if (h >= nextOut - 1e-9) { const r = measure(n, paramsAt(c, h).sst != null ? paramsAt(c, h).sst : 28.8); r.st.h = h; out.push(r.st); if (outp) writeFileSync(`${outp}_${c.label}_${String(h).padStart(3, '0')}.f32`, Buffer.from(r.tb.buffer)); nextOut += every; }
    if (h < hours) stepHour(h);
  }
  return out;
}
if (process.argv[1] && process.argv[1].endsWith('model_lab.mjs')) {
  const spec = JSON.parse(process.argv[2]), cases = Array.isArray(spec) ? spec : [spec], outp = process.argv[3];
  const res = {}; for (const c of cases) res[c.label] = runCase(c, outp);
  console.log(JSON.stringify(res));
}
