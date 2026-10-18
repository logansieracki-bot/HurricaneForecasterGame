// Calibrates the storm engine's free parameters against the real Atlantic best track (data/generated/atlantic-tc-ref.json) with CMA-ES,
// every candidate running on the same seasons of the real simulated environment (tools/storm_mc.mjs, one browser pass per generation).
//
//   node tools/storm_opt.mjs --maps maps.json --seeds 1-20 --gens 30 --out opt.json [--page built.html] [--pop 12] [--resume opt.json] [--start values.json]
//                            [--free name,name,...] [--weight 'ET share=3;reach 30N=2'] [--slider k=v ...]
//
// With the climatology-anchored model (see tools/storm_fit.mjs) where and when disturbances develop is fixed by the maps (the real genesis map), and where storms go by the real
// mean drift: what is left to calibrate is how strong they get (the intensity law's gates and rates), how the environment modulates the development (the coupling coefficients that
// set the year-to-year spread, the El Nino response and the response to warming).
//
// The loss is a sum of squared standardised misses of whole-season aggregates, the seasonal shape, the genesis geography, intensification
// (rapid intensification, hurricane and major shares) and lifetime. What it deliberately leaves out is what the result is checked on
// afterwards, on other seasons: the El Nino / La Nina ratio, the warming slider, steering and lows, and the reference's own spread.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import '../src/storms.js';                                                       // sets globalThis.HFStorms
import { runLab, summarize, refAceByMonth, FATE_BINS } from './storm_mc.mjs';
import { etReal } from './storm_et.mjs';

/* ---- the free parameters: name, low, high, initial, scale ('lin' | 'log'), how to put it into a parameter patch ----------------------- */
const WARM = 1;                                                                            // degrees of warming in the twin of every engine
export const SPEC = [
  ['shearK', 1.0, 4.0, 1.9, 'lin'], ['shearPow', 1.2, 4.5, 3, 'lin'], ['shearVMod', 0, 3, 0.6, 'lin'],
  ['rhLo', 25, 50, 38, 'lin'], ['rhWid', 10, 60, 24, 'lin'], ['sstLo', 23, 28, 25, 'lin'], ['sstWid', 1.0, 7, 2.5, 'lin'], ['sstRelW', 0, 1, 0.3, 'lin'],
  ['gCrit', 0.03, 0.8, 0.33, 'lin'], ['kUp', 0.008, 0.12, 0.022, 'log'], ['kDn', 0.002, 0.08, 0.016, 'log'], ['vEqLo', 0.05, 0.7, 0.4, 'lin'], ['matureBoost', 0, 0.6, 0.3, 'lin'], ['qSd', 0, 1.3, 0.4, 'lin'],
  ['riHaz', 0.0002, 0.06, 0.0075, 'log'], ['riRate', 0.6, 1.8, 1.0, 'lin'], ['riShear', 4, 16, 9, 'lin'],
  ['bR', 0, 0.12, 0.03, 'lin'], ['bV', 0, 0.15, 0.05, 'lin'], ['bS', 0, 1.5, 0.5, 'lin'], ['bW', 0, 0.6, 0.2, 'lin'],
  ['rhLat', -16, 4, 0, 'lin'], ['sstLat', -1.5, 2.5, 0, 'lin'], ['shLat', -0.5, 1.0, 0, 'lin'], ['envTau', 1, 120, 12, 'log'],
  ['etB0', -8.5, -4.5, -6.444, 'lin'], ['disB0', 1.0, 5.0, 3.422, 'lin'], ['dcap0', 0.1, 0.8, 0.25, 'lin'], ['dcap1', 0.1, 1.8, 0.6, 'lin'], ['bcKTc', 0.004, 0.08, 0.0208, 'log'], ['bcV0', 10, 35, 20, 'lin'], ['bcV1', 40, 75, 55, 'lin'], ['exTau', 30, 160, 72, 'log'], ['exDeepP', 0.05, 0.7, 0.35, 'lin'],
  ['actSeas', 0, 0.7, 0.2, 'lin'], ['actIntra', 0, 0.7, 0.15, 'lin'], ['devA', -0.3, 0.2, -0.05, 'lin'], ['devB', 0.02, 0.5, 0.2, 'lin'],
  ['vpLat', 0, 0.7, 0, 'lin'], ['rRelax', 0.01, 0.1, 0.02, 'log'], ['etaMin', 0.3, 0.9, 0.55, 'lin'], ['etaLo', 18, 26, 23, 'lin'], ['etaHi', 24, 30, 28, 'lin'],
];
const unit = (v, [, lo, hi, , sc]) => (sc === 'log' ? (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) : (v - lo) / (hi - lo));
const phys = (u, [, lo, hi, , sc]) => { const c = Math.min(1, Math.max(0, u)); return sc === 'log' ? Math.exp(Math.log(lo) + c * (Math.log(hi) - Math.log(lo))) : lo + c * (hi - lo); };
// a run may free only some of the parameters (--free a,b,c): the rest stay at their starting values (--start) or their defaults
let FREE = SPEC.slice(), FIXED = {};
export const configure = (freeNames, fixed) => { FREE = freeNames ? SPEC.filter((s) => freeNames.includes(s[0])) : SPEC.slice(); FIXED = Object.fromEntries(SPEC.map((s) => [s[0], fixed && fixed[s[0]] != null ? fixed[s[0]] : s[3]])); };
configure(null, null);
export const toValues = (x) => Object.assign({}, FIXED, Object.fromEntries(FREE.map((s, i) => [s[0], phys(x[i], s)])));
export const toPatch = (v) => ({
  shearK: v.shearK, shearPow: v.shearPow, shearVMod: v.shearVMod, rhGate: [v.rhLo, v.rhLo + v.rhWid], sstGate: [v.sstLo, v.sstLo + v.sstWid], sstRelW: v.sstRelW,
  vpLat: v.vpLat, rRelax: v.rRelax, gCrit: v.gCrit, kUp: v.kUp, kDn: v.kDn, vEqLo: v.vEqLo, matureBoost: v.matureBoost, qSd: v.qSd,
  ri: { haz: v.riHaz, rate: [1.4 * v.riRate, 3.0 * v.riRate], shear: v.riShear },
  envB: { rh: v.bR, shear: v.bV, sst: v.bS, sstAbs: v.bW }, rhLat: v.rhLat, sstLat: v.sstLat, shLat: v.shLat, envTau: v.envTau,
  etHaz: { b0: v.etB0 }, disHaz: { b0: v.disB0 }, decayCap: [v.dcap0, v.dcap1], bc: { kTc: v.bcKTc, v: [v.bcV0, v.bcV1], exTau: v.exTau }, exDeep: { p: v.exDeepP },
  act: { seasSd: v.actSeas, intraSd: v.actIntra }, devGate: [v.devA, v.devA + v.devB], etaMin: v.etaMin, etaLo: v.etaLo, etaHi: v.etaHi,
});

/* ---- the loss ------------------------------------------------------------------------------------------------------------------------ */
// [label, value from a summary, target, standard deviation of a miss, weight]
export function targets(ref, REF, VAL, ET) {
  const ns = ref.namedByMonth.slice(5, 11), tot = ns.reduce((a, b) => a + b, 0);
  const T = [
    ['dep', (o) => o.dep, ref.dep, 1.5, 1], ['named', (o) => o.named, ref.named, 1.0, 2], ['hurr', (o) => o.hurr, ref.hurr, 0.7, 2], ['major', (o) => o.major, ref.major, 0.45, 2],
    ['cat5', (o) => o.cat5, ref.cat5, 0.2, 0.5], ['ace', (o) => o.ace, ref.ace, 14, 2], ['named/dep', (o) => o.namedOfDep, 0.88, 0.04, 1],
    ['RI share', (o) => o.riFrac, REF.intensity_change.ri_frac_all, 0.01, 1.5], ['hurr RI', (o) => o.riOfHurr, REF.ri_track_fractions.HU.frac, 0.08, 1], ['major RI', (o) => o.riOfMajor, REF.ri_track_fractions.MH.frac, 0.08, 1],
    ['named days', (o) => o.namedDays, REF.lifetime.mean_named_days, 0.4, 1], ['<2 d share', (o) => o.short2d, REF.lifetime.short_lived_lt_2d, 0.05, 0.5],
    ['reach 30N', (o) => o.reach30, 0.708, 0.06, 1], ['reach 35N', (o) => o.reach35, 0.588, 0.06, 1],
    ['gen lat q25', (o) => o.genLat[1], REF.genesis.named_lat_quantiles[1], 1.5, 0.3], ['gen lat q50', (o) => o.genLat[2], REF.genesis.named_lat_quantiles[2], 1.5, 0.3], ['gen lat q75', (o) => o.genLat[3], REF.genesis.named_lat_quantiles[3], 2, 0.3],
    ['SD named', (o) => o.sd.named, REF.normals.ns_sd, 1.0, 1.5], ['SD hurr', (o) => o.sd.hurr, REF.normals.h_sd, 0.8, 1], ['SD major', (o) => o.sd.major, REF.normals.mh_sd, 0.5, 1], ['SD ace', (o) => o.sd.ace, REF.normals.ace_sd, 14, 1.5],
    ['ENSO slope', (o) => o.ensoSlope, -0.33, 0.17, 1.5], ['subtropical/yr', (o) => o.ssPerYear, REF.status.subtropical_storms_per_year, 0.5, 0.7],
    // what one degree of uniform warming does with the humidity, the shear and the steering unchanged: design targets from the literature, not data (GPI scaling with potential
    // intensity alone: genesis +15-25 % per degree; intensity +3-5 %, so ACE +30-60 %; the interannual regression of ACE on the main development region's SST, which also carries
    // the shear and humidity that come with a warm year, is +70-100 % per degree and is an upper bound for a change of the sea alone)
    ['warm ACE ratio', (o) => o.warmAce, 1.5, 0.25, 2.5], ['warm named ratio', (o) => o.warmNamed, 1.15, 0.12, 1.5], ['warm hurr ratio', (o) => o.warmHurr, 1.3, 0.2, 1],
  ];
  // the extratropical transition and the tropical cyclones of high latitudes: what a storm does when the westerlies take it (data/generated/atlantic-tc-et.json, tools/make_tc_et.py)
  if (ET) {
    const e = (f) => (o) => f(o.et);
    T.push(['ET share', e((x) => x.share), ET.share, 0.05, 2], ['final EX', e((x) => x.final.EX), ET.final.EX, 0.05, 1.5], ['final LO', e((x) => x.final.LO), ET.final.LO, 0.05, 1], ['final TC', e((x) => x.final.TC), ET.final.TC, 0.05, 0.7],
      ['ET lat q25', e((x) => x.lat[1]), ET.lat[1], 1.5, 1], ['ET lat q50', e((x) => x.lat[2]), ET.lat[2], 1.5, 1.5], ['ET lat q75', e((x) => x.lat[3]), ET.lat[3], 1.5, 1],
      ['ET lon q50', e((x) => x.lon[2]), ET.lon[2], 5, 0.5], ['ET wind q25', e((x) => x.wind[1]), ET.wind[1], 5, 0.7], ['ET wind q50', e((x) => x.wind[2]), ET.wind[2], 5, 1], ['ET wind q75', e((x) => x.wind[3]), ET.wind[3], 6, 0.7],
      ['ET tail q50', e((x) => x.tail[2]), ET.tail[2], 6, 0.5], ['ET tail q75', e((x) => x.tail[3]), ET.tail[3], 12, 0.4], ['ET speed q50', e((x) => x.speed[2]), ET.speed[2], 4, 0.5],
      ['EX rows', e((x) => x.exRows.perSeason), ET.exRows.perSeason, 8, 1.2], ['EX rows >= 34 kt', e((x) => x.exRows.ge34), ET.exRows.ge34, 0.07, 1], ['EX rows 40-50N', e((x) => x.exRows.byLat[2]), ET.exRows.byLat[2], 4, 0.6],
      ['ET dv24 median', e((x) => x.dv24.q[2]), ET.dv24.q[2], 3, 0.5], ['ET dv24 +10 share', e((x) => x.dv24.ge10), ET.dv24.ge10, 0.05, 0.4], ['LO rows', e((x) => x.loRows.perSeason), ET.loRows.perSeason, 8, 0.2],
      ['TC rows >33N', e((x) => x.tcHi.perSeason), ET.tcHi.perSeason, 8, 1], ['TC wind q50 >33N', e((x) => x.tcHi.wind[2]), ET.tcHi.wind[2], 5, 1], ['TC wind q90 >33N', e((x) => x.tcHi.wind[4]), ET.tcHi.wind[4], 8, 0.8],
      ['TC dv 50-79', e((x) => x.tcHi.dvMid), ET.tcHi.dvMid, 3, 0.5],
      ...['25-30', '30-35', '35-40'].flatMap((k) => [[`TC >=96 kt ${k}N`, e((x) => x.tcLat[k].ge96), ET.tcLat[k].ge96, 0.04, 1], [`TC wind q50 ${k}N`, e((x) => x.tcLat[k].q50), ET.tcLat[k].q50, 5, 0.7]]), ['TC dv 80+', e((x) => x.tcHi.dvStrong), ET.tcHi.dvStrong, 4, 0.5], ['land rows', e((x) => x.landRows.all), ET.landRows.all, 5, 0.7]);
  }
  // where and how strongly the depressions that formed in each latitude band develop, and where the named storms spend their time: the geography the law must reproduce (atlantic-tc-validate.json)
  if (VAL) {
    for (const [lo, hi] of FATE_BINS) { const k = lo + '-' + hi, r = VAL.genesis_fate[k]; T.push([`named ${k}N`, (o) => o.fate[k].named, r.named, 0.07, 1], [`hurr ${k}N`, (o) => o.fate[k].hurr, r.hurricane, 0.08, 1], [`major ${k}N`, (o) => o.fate[k].major, r.major, 0.06, 0.6]); }
    for (let i = 1; i <= 8; i++) T.push([`rows ${5 + 5 * i}N`, (o) => o.latProfile[i], VAL.lat_profile.share[i], 0.03, 0.8]);
  }
  ns.forEach((r, i) => T.push(['frac ' + 'JJASON'[i], (o) => { const t = o.namedByMonth.slice(5, 11).reduce((a, b) => a + b, 0); return t ? o.namedByMonth[5 + i] / t : 0; }, r / tot, 0.03, 1]));
  REF.genesis.cells_10x20.slice(0, 8).forEach(([la, lo, share], i) => T.push([`cell ${la}N ${lo}`, (o) => o.cells[i].sim, share, 0.035, 0.3]));    // where named storms form (the maps fix this: a check, not a target)
  const ra = refAceByMonth().slice(5, 12), rt = ra.reduce((a, b) => a + b, 0);                  // the season's ACE by month: Jul .. Nov shares
  for (let i = 1; i <= 5; i++) T.push(['ACE share ' + 'JJASOND'[i], (o) => { const a = o.aceByMonth.slice(5, 12), t = a.reduce((x, y) => x + y, 0); return t ? a[i] / t : 0; }, ra[i] / rt, 0.04, 0.8]);
  return T;
}
export function lossOf(o, T) {
  const parts = T.map(([label, f, t, s, w]) => { const v = f(o); const z = Number.isFinite(v) ? (v - t) / s : 10; return [label, v, t, w * z * z]; });
  return { total: parts.reduce((a, p) => a + p[3], 0), parts };
}

/* ---- CMA-ES (Hansen's tutorial form), box handled by clipping plus a penalty --------------------------------------------------------- */
function eigSym(A) {                                                                   // Jacobi: A = B diag(d) B^T
  const n = A.length, a = A.map((r) => r.slice()), B = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (off < 1e-22) break;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const bkp = B[k][p], bkq = B[k][q]; B[k][p] = c * bkp - s * bkq; B[k][q] = s * bkp + c * bkq; }
    }
  }
  return { d: a.map((r, i) => r[i]), B };
}
function gauss(rng) { return Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng()); }
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class CMA {
  constructor(x0, sigma, lambda, seed = 1) {
    const n = (this.n = x0.length); this.lambda = lambda; this.mu = Math.floor(lambda / 2); this.rng = mulberry(seed);
    let w = Array.from({ length: this.mu }, (_, i) => Math.log(this.mu + 0.5) - Math.log(i + 1)); const sw = w.reduce((a, b) => a + b, 0); w = w.map((x) => x / sw); this.w = w;
    this.mueff = 1 / w.reduce((a, b) => a + b * b, 0);
    this.cc = (4 + this.mueff / n) / (n + 4 + 2 * this.mueff / n); this.cs = (this.mueff + 2) / (n + this.mueff + 5);
    this.c1 = 2 / ((n + 1.3) ** 2 + this.mueff); this.cmu = Math.min(1 - this.c1, 2 * (this.mueff - 2 + 1 / this.mueff) / ((n + 2) ** 2 + this.mueff));
    this.ds = 1 + 2 * Math.max(0, Math.sqrt((this.mueff - 1) / (n + 1)) - 1) + this.cs; this.chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
    this.m = x0.slice(); this.sigma = sigma; this.C = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    this.pc = new Array(n).fill(0); this.ps = new Array(n).fill(0); this.gen = 0; this.eig = eigSym(this.C);
  }
  ask() {
    const { n, eig } = this, out = [];
    for (let k = 0; k < this.lambda; k++) {
      const z = Array.from({ length: n }, () => gauss(this.rng)), y = new Array(n).fill(0);
      for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += eig.B[i][j] * Math.sqrt(Math.max(eig.d[j], 1e-20)) * z[j]; y[i] = s; }
      out.push({ z, y, x: this.m.map((mi, i) => mi + this.sigma * y[i]) });
    }
    return out;
  }
  tell(pop, f) {                                                                         // f[i]: loss of pop[i] (lower is better)
    const { n, mu, w } = this, idx = f.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]).map((p) => p[1]).slice(0, mu);
    const old = this.m.slice(), yw = new Array(n).fill(0);
    for (let k = 0; k < mu; k++) for (let i = 0; i < n; i++) yw[i] += w[k] * pop[idx[k]].y[i];
    this.m = old.map((mi, i) => mi + this.sigma * yw[i]);
    // C^{-1/2} yw = B D^{-1} B^T yw
    const t = new Array(n).fill(0); for (let j = 0; j < n; j++) { let s = 0; for (let i = 0; i < n; i++) s += this.eig.B[i][j] * yw[i]; t[j] = s / Math.sqrt(Math.max(this.eig.d[j], 1e-20)); }
    const cinv = new Array(n).fill(0); for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += this.eig.B[i][j] * t[j]; cinv[i] = s; }
    const { cs, cc, c1, cmu } = this;
    this.ps = this.ps.map((p, i) => (1 - cs) * p + Math.sqrt(cs * (2 - cs) * this.mueff) * cinv[i]);
    const psn = Math.sqrt(this.ps.reduce((a, b) => a + b * b, 0));
    this.gen++;
    const hsig = psn / Math.sqrt(1 - (1 - cs) ** (2 * this.gen)) / this.chiN < 1.4 + 2 / (n + 1) ? 1 : 0;
    this.pc = this.pc.map((p, i) => (1 - cc) * p + hsig * Math.sqrt(cc * (2 - cc) * this.mueff) * yw[i]);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      let rank = 0; for (let k = 0; k < mu; k++) rank += w[k] * pop[idx[k]].y[i] * pop[idx[k]].y[j];
      this.C[i][j] = (1 - c1 - cmu) * this.C[i][j] + c1 * (this.pc[i] * this.pc[j] + (1 - hsig) * cc * (2 - cc) * this.C[i][j]) + cmu * rank;
    }
    this.sigma *= Math.exp((cs / this.ds) * (psn / this.chiN - 1));
    this.eig = eigSym(this.C.map((r, i) => r.map((v, j) => (v + this.C[j][i]) / 2)));
  }
}

/* ---- the loop ------------------------------------------------------------------------------------------------------------------------ */
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const a = process.argv.slice(2), get = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
  const range = get('seeds', '1-20').split('-').map(Number), seeds = []; for (let s = range[0]; s <= (range[1] ?? range[0]); s++) seeds.push(s);
  const gens = +get('gens', 30), lambda = +get('pop', 12), out = get('out', 'opt.json'), page = get('page') || undefined;
  const REF = JSON.parse(readFileSync(new URL('../data/generated/atlantic-tc-ref.json', import.meta.url), 'utf8')), VAL = JSON.parse(readFileSync(new URL('../data/generated/atlantic-tc-validate.json', import.meta.url), 'utf8'));
  const sliders = Object.fromEntries(a.flatMap((x, i) => (x === '--slider' ? [a[i + 1].split('=')] : [])).map(([k, v]) => [k, +v]));   // e.g. --slider seasonal=1 --slider features=1 --slider enso=1: no seed-to-seed climate jitter
  const ET = etReal(JSON.parse(readFileSync(new URL('../data/generated/atlantic-tc-et.json', import.meta.url), 'utf8')));
  const maps = get('maps') ? JSON.parse(readFileSync(get('maps'), 'utf8')) : null;
  const start = get('start') ? JSON.parse(readFileSync(get('start'), 'utf8')) : null;      // {name: value} to start from instead of the defaults
  configure(get('free') ? get('free').split(',') : null, start);
  const x0 = FREE.map((s) => (start && start[s[0]] != null ? unit(start[s[0]], s) : unit(s[3], s)));
  const WEIGHTS = Object.fromEntries((get('weight') || '').split(';').filter(Boolean).map((kv) => { const i = kv.lastIndexOf('='); return [kv.slice(0, i), +kv.slice(i + 1)]; }));
  const cma = new CMA(x0, +get('sigma', 0.25), lambda, +get('rngseed', 1));
  const log = existsSync(out) && get('resume') ? JSON.parse(readFileSync(out, 'utf8')) : { spec: FREE.map((s) => s[0]), seeds, history: [], best: null };
  for (let g = log.history.length; g < gens; g++) {
    const t0 = Date.now(), pop = cma.ask();
    const sets = {}; pop.forEach((p, i) => { sets['c' + i] = toPatch(toValues(p.x)); });
    // the baseline of this generation: the current mean, so that progress is visible on the same seasons
    sets.mean = toPatch(toValues(cma.m));
    // the same engines in a world one degree warmer (sstOffset is exactly what the page's Warming slider does to the fields, checked bit for bit on eight seasons)
    for (const k of Object.keys(sets).slice()) sets[k + 'w'] = Object.assign({}, sets[k], { sstOffset: WARM });
    const raw = await runLab({ seeds, sets, sliders, pages: +get('pages', 4), page, maps });
    const { ref, res } = summarize(raw), T = targets(ref, REF, VAL, ET).map((t) => (WEIGHTS[t[0]] != null ? [t[0], t[1], t[2], t[3], WEIGHTS[t[0]]] : t));
    for (const k of Object.keys(sets)) if (!k.endsWith('w')) { const o = res[k], w = res[k + 'w']; o.warmAce = w.ace / Math.max(o.ace, 1e-6); o.warmNamed = w.named / Math.max(o.named, 1e-6); o.warmHurr = w.hurr / Math.max(o.hurr, 1e-6); }
    const L = Object.fromEntries(Object.keys(sets).filter((k) => !k.endsWith('w')).map((k) => [k, lossOf(res[k], T)]));
    const pen = (x) => 0.5 * x.reduce((s, v) => s + Math.max(0, -v) ** 2 + Math.max(0, v - 1) ** 2, 0) * 50;      // stay inside the box
    const f = pop.map((p, i) => L['c' + i].total + pen(p.x));
    cma.tell(pop, f);
    const bi = f.indexOf(Math.min(...f)), bestC = 'c' + bi;
    const rec = { gen: g, secs: Math.round((Date.now() - t0) / 1000), best: f[bi], mean: L.mean.total, sigma: cma.sigma, values: toValues(pop[bi].x), meanValues: toValues(cma.m), summary: { named: res[bestC].named, hurr: res[bestC].hurr, major: res[bestC].major, ace: res[bestC].ace, dep: res[bestC].dep } };
    log.history.push(rec);
    if (!log.best || rec.best < log.best.loss) log.best = { loss: rec.best, gen: g, values: rec.values, patch: toPatch(rec.values), parts: L[bestC].parts.map((p) => [p[0], +p[1].toFixed(3), +p[2].toFixed(3), +p[3].toFixed(2)]) };
    writeFileSync(out, JSON.stringify(log, null, 1));
    console.log(`gen ${g} (${rec.secs} s): best ${rec.best.toFixed(1)}  mean-of-population ${L.mean.total.toFixed(1)}  sigma ${cma.sigma.toFixed(3)}  best: dep ${rec.summary.dep.toFixed(1)} named ${rec.summary.named.toFixed(1)} hurr ${rec.summary.hurr.toFixed(1)} major ${rec.summary.major.toFixed(1)} ACE ${rec.summary.ace.toFixed(0)}`);
  }
  console.log('best overall:', JSON.stringify(log.best.values), '\nloss', log.best.loss.toFixed(1));
  console.log(log.best.parts.map((p) => `${p[0]} ${p[1]} (target ${p[2]}, loss ${p[3]})`).join('\n'));
}
