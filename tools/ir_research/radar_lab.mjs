// The game's radar picture, measured the way a radar's is read (docs/radar-research.md): a forced storm run through the nest, the echo coverage by radius and by reflectivity, the eye (how clear
// and how big), the eyewall ring (how much of it is there, how lopsided), at chosen hours; the dBZ fields can be dumped for the contact sheets (radarsheet.py).
//   node tools/ir_research/radar_lab.mjs '<json: one case or a list>' [outprefix]
// a case is what model_lab.mjs takes: { label, seed, m, par (PAR keys to set), hours, every, spin, utc0, base: { v (kt), rmax (km), r34, shear (m/s), shdir, sst, rh, lat, lon, eta, ... }, prog: [ { h, <keys of base> }, ... ] }
import '../../src/storm-cities.js';
import '../../src/storms.js';
import '../../src/storm-nest.js';
import { forcing } from './model_lab.mjs';
import { writeFileSync } from 'node:fs';
const N = globalThis.HFNest, NG = N.N, NN = NG * NG;
export const BANDS = [[0, 15], [15, 30], [30, 50], [50, 75], [75, 100], [100, 150], [150, 250]], THR = [10, 20, 30, 40, 50];
const lerpObj = (a, b, t) => { const o = Object.assign({}, a); for (const k in b) if (k !== 'h' && typeof b[k] === 'number') o[k] = (a[k] != null ? a[k] : b[k]) + (b[k] - (a[k] != null ? a[k] : b[k])) * t; return o; };
function paramsAt(c, h) {
  const base = c.base || {}, pr = c.prog; if (!pr || !pr.length) return base;
  if (h <= pr[0].h) return Object.assign({}, base, pr[0]); if (h >= pr[pr.length - 1].h) return Object.assign({}, base, pr[pr.length - 1]);
  for (let i = 0; i + 1 < pr.length; i++) if (h >= pr[i].h && h <= pr[i + 1].h) return lerpObj(Object.assign({}, base, pr[i]), pr[i + 1], (h - pr[i].h) / (pr[i + 1].h - pr[i].h));
  return base;
}
/* the radar of the nest as the page draws it (the display's texture on, the composite of every echo) and what a forecaster would read off it */
export function measureRadar(n, rmaxKm) {
  n.display(0, true, false);
  const rc = n.drc, rs = n.drs, m = n.m, dbz = new Float32Array(NN);
  for (let k = 0; k < NN; k++) dbz[k] = rc[k] < 0.01 && rs[k] < 0.01 ? -20 : N.dbzOf(rc[k], rs[k]);
  const cov = BANDS.map(([a, b]) => { const c = new Array(THR.length).fill(0); let tot = 0; for (let k = 0; k < NN; k++) { const r = n.rr[k] * m; if (r < a || r >= b) continue; tot++; for (let q = 0; q < THR.length; q++) if (dbz[k] >= THR[q]) c[q]++; } return c.map((x) => +(x / Math.max(1, tot)).toFixed(3)); });
  // the eye: the share of the cells within 0.7 of the radius of maximum wind that is clear (under 15 dBZ), the radius at which the circle mean first reaches 25 dBZ, the strongest circle mean (the eyewall) and where it is
  const rm = rmaxKm; let clear = 0, nIn = 0; for (let k = 0; k < NN; k++) { const r = n.rr[k] * m; if (r <= 0.7 * rm) { nIn++; if (dbz[k] < 15) clear++; } }
  const nb = 140, sum = new Float64Array(nb), cnt = new Float64Array(nb); for (let k = 0; k < NN; k++) { const b = Math.floor(n.rr[k] * m / 2); if (b < nb) { sum[b] += Math.max(0, dbz[k]); cnt[b]++; } }
  const mean = Array.from(sum, (s, i) => (cnt[i] ? s / cnt[i] : 0)); let eyeR = null; for (let i = 0; i < nb; i++) if (mean[i] >= 25) { eyeR = i * 2; break; }
  let pk = 0, pkR = 0; for (let i = 0; i < nb; i++) if (mean[i] > pk) { pk = mean[i]; pkR = i * 2; }
  // the ring: 16 sectors, the mean of dBZ between 0.7 and 2.0 radii of maximum wind
  const ss = new Float64Array(16), sn = new Float64Array(16); for (let k = 0; k < NN; k++) { const r = n.rr[k] * m; if (r < 0.7 * rm || r >= 2 * rm) continue; const q = Math.min(15, Math.floor((Math.atan2(n.sth[k], n.cth[k]) + Math.PI) * 2.5465)); ss[q] += Math.max(0, dbz[k]); sn[q]++; }
  const sec = Array.from(ss, (s, i) => (sn[i] ? s / sn[i] : 0)), ringMax = Math.max(...sec), ringMin = Math.min(...sec), ringCover = sec.filter((x) => x >= 30).length / 16, ringMean = sec.reduce((a, b) => a + b, 0) / 16;
  let a45 = 0, a40 = 0; for (let k = 0; k < NN; k++) { if (n.rr[k] * m <= 60) { if (dbz[k] >= 45) a45++; if (dbz[k] >= 40) a40++; } } const cell = 4 * m * m;
  // the share of the cells in the colour classes of a radar picture (no echo, green, yellow, orange, red: under 20, 20-35, 35-45, 45-50, 50 and over dBZ), within two radii of maximum wind, within 2 to 5 radii, and by radius in radii of the eye (the picture's own scale: the user's reference video is read the same way)
  const cls = (a, b, unit) => { const c = [0, 0, 0, 0, 0]; let tot = 0; for (let k = 0; k < NN; k++) { const r = n.rr[k] / unit; if (r < a || r >= b) continue; tot++; const d = dbz[k]; c[d < 20 ? 0 : d < 35 ? 1 : d < 45 ? 2 : d < 50 ? 3 : 4]++; } return c.map((x) => +(x / Math.max(1, tot)).toFixed(2)); };
  const rE = Math.max(3, n.rdRE || 0.75 * rm), EB = [[0, 1], [1, 1.6], [1.6, 2.5], [2.5, 4], [4, 6], [6, 9], [9, 14]];
  // the mean rain rate (mm/h, convective and stratiform, zeros included) the picture holds in each band
  const meanR = BANDS.map(([a, b]) => { let sum = 0, tot = 0; for (let k = 0; k < NN; k++) { const r = n.rr[k] * m; if (r < a || r >= b) continue; tot++; sum += n.drc[k] + n.drs[k]; } return +(sum / Math.max(1, tot)).toFixed(2); });
  let mx = -99; for (let k = 0; k < NN; k++) if (dbz[k] > mx) mx = dbz[k];
  return { dbz, st: { meanR, cls2: cls(0, 2, rm), cls5: cls(2, 5, rm), clsE: EB.map(([a, b]) => cls(a, b, rE)), rE: +rE.toFixed(1), cov, eyeClear: +(clear / Math.max(1, nIn)).toFixed(2), eyeR, peakMean: +pk.toFixed(1), peakR: pkR, ringMax: +ringMax.toFixed(1), ringMin: +ringMin.toFixed(1), ringCover: +ringCover.toFixed(2), ringMean: +ringMean.toFixed(1), A40: Math.round(a40 * cell), A45: Math.round(a45 * cell), max: +mx.toFixed(0), eyeS: +(n.eyeS || 0).toFixed(2), vNest: +(n.vNest * m / 0.514444).toFixed(0), lean: +(Math.atan2(n.asY, n.asX) * 180 / Math.PI).toFixed(0), am: +Math.hypot(n.asX, n.asY).toFixed(2) } };
}
const PAR0 = JSON.parse(JSON.stringify(N.PAR));
export function runRadar(c, outp) {
  Object.assign(N.PAR, JSON.parse(JSON.stringify(PAR0)), c.par || {});
  const m = c.m || 1, hours = c.hours || 4, every = c.every || hours, spin = c.spin != null ? c.spin : 3, dt = c.dt || 240;
  const mk = (h) => { const f = forcing(paramsAt(c, h)); f.utc = ((c.utc0 || 0) + h) % 24; return m !== 1 ? N.scaleForcing(f, m) : f; };
  const n = N.create({ seed: c.seed || 7, m }); n.init(mk(0));
  const out = []; let h = -spin;
  const stepHour = (hh) => { const fa = mk(Math.max(hh, 0)), fb = mk(Math.max(hh + 1, 0)); n.setForcing(fa, fb); n.setEnv(null, fa); for (let i = 0; i < 3600 / dt; i++) n.step(dt); };
  for (; h < 0; h++) stepHour(h);
  let nextOut = 0;
  for (; h <= hours; h++) {
    if (h >= nextOut - 1e-9) { const p = paramsAt(c, h), r = measureRadar(n, p.rmax); r.st.h = h; r.st.v = Math.round(p.v); r.st.rmax = Math.round(p.rmax); out.push(r.st); if (outp) writeFileSync(`${outp}_${c.label}_${String(h).padStart(3, '0')}.f32`, Buffer.from(r.dbz.buffer)); nextOut += every; }
    if (h < hours) stepHour(h);
  }
  return out;
}
if (process.argv[1] && process.argv[1].endsWith('radar_lab.mjs')) {
  const spec = JSON.parse(process.argv[2]), cases = Array.isArray(spec) ? spec : [spec], outp = process.argv[3], res = {};
  for (const c of cases) res[c.label] = runRadar(c, outp);
  if (process.env.JSON) console.log(JSON.stringify(res));
  else for (const [label, rows] of Object.entries(res)) {
    console.log(`== ${label}`);
    console.log('  h   v rmax | eyeClear eyeR | peakMean@R ringMin..Max cover | A40 A45 max | coverage ≥20 dBZ by band (0-15 15-30 30-50 50-75 75-100 100-150 150-250) | ≥40 (same)');
    for (const r of rows) console.log(`${String(r.h).padStart(3)} ${String(r.v).padStart(3)} ${String(r.rmax).padStart(4)} | ${String(r.eyeClear).padStart(5)} ${String(r.eyeR).padStart(4)} | ${String(r.peakMean).padStart(5)}@${String(r.peakR).padStart(3)} ${String(r.ringMin).padStart(5)}..${String(r.ringMax).padEnd(5)} ${String(r.ringCover).padStart(4)} | ${String(r.A40).padStart(5)} ${String(r.A45).padStart(4)} ${String(r.max).padStart(3)} | ${r.cov.map((c) => c[1].toFixed(2)).join(' ')} | ${r.cov.map((c) => c[3].toFixed(2)).join(' ')}   eyeS ${r.eyeS} vN ${r.vNest} lean ${r.lean} deg (${r.am})`);
  }
}
