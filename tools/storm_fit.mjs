// Fits the Atlantic storm engine's climatology maps to the page's own weather, through the built page (needs `npm run build` and, in a sandbox, PLAYWRIGHT_CHROMIUM_PATH).
//
//   node tools/storm_fit.mjs clim  --seeds 1-12 --out clim.json               the page's own mean steering and mean environment on the maps' grid, by month
//   node tools/storm_fit.mjs fit   --clim clim.json --seeds 1-24 --iters 3 --out sim.json [--start prev.json] [--ipf]    (--ipf: scale the rates by real / realised genesis instead of re-deriving them from the exposures)
//                                                                              the hourly development rates of disturbances and the supply of local seeds
//   node tools/storm_fit.mjs wet   --clim clim.json --raw fit_pass.json --out clim_wet.json           the nodes disturbances can develop at (a quarter of the cell is water and 10 disturbance-hours a year), replacing clim's centre-point mask
//   node tools/storm_fit.mjs rescale --sim sim.json --out sim_r.json                  multiply each month's rates by real / simulated genesis (limited to +-25 %), for a fit whose sample total missed by chance
//   node tools/storm_fit.mjs refine --clim clim.json --sim sim.json --raw lab.json --out sim_ref.json [--sigma 1.5]   scale the rates by real / simulated NUMBERED depressions (first fixes), smoothed broadly: the IPF counts development events, one in five of which fizzles
//   node tools/storm_fit.mjs motion --sim sim.json --raw lab.json --out sim_m.json                    (lab.json: a tools/storm_mc.mjs --diag run) correct the drift maps for the mean anomaly the page's weather adds where storms are
//   node tools/storm_fit.mjs maps  --clim clim.json --sim sim.json --out maps.json     assemble the maps object the engine takes (real drift + the two fits)
// After `maps`: copy maps.json to data/generated/atlantic-tc-storm-maps.json, `node tools/merge_data.mjs atlantic --storm-maps data.json`, `npm run build`, and check with
// `node tools/storm_mc.mjs --seeds 101-148 --out raw.json` + `node tools/storm_validate.mjs raw.json` on seeds the fit never saw (the fit uses 1-12 for `clim`, 201-248 for `fit`).
//
// What is fitted and why. The engine moves a storm with the REAL mean drift of its kind (data/generated/atlantic-tc-maps.json, from the best track) plus the anomaly of the
// page's steering from the page's own mean steering, and it lets a disturbance (an easterly wave, a local seed, a tracked pressure low) develop at an hourly rate
// haz(place, month) x E, E being how much better the environment is than its own mean there. The page's own means (steerClim, env0) come from running the page ('clim'); the
// development rate is then the real genesis density divided by the effective exposure the page's disturbances provide ('fit'):
//     haz = G_real / X,   X = sum over disturbance-hours of E x Q  (per year, per node, per month)
// so that the expected genesis map equals the real one by construction wherever disturbances go; where the waves and lows do not provide enough exposure (the Gulf, the western
// Caribbean, the Carolinas) local seeds are born at the rate that gives their prescribed share of the real genesis. Three or four passes converge (depletion: a disturbance that
// develops stops being exposed).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runLab, meanActivity, ACT_ELASTICITY, TCB } from './storm_mc.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// the basin: STORM_BASIN or --basin <name> (tools/tc_basins.json; the default is the Atlantic, whose maps and priors below were the first); its real maps are data/generated/<basin>-tc-maps.json (tools/make_tc_basin.py)
export const BASIN = process.env.STORM_BASIN || (process.argv.includes('--basin') ? process.argv[process.argv.indexOf('--basin') + 1] : 'atlantic');
const REAL = JSON.parse(readFileSync(join(ROOT, `data/generated/${BASIN}-tc-maps.json`), 'utf8'));
const BCFG = BASIN === 'atlantic' ? { start: [5, 1], seasonMonth: 0, days: 214 } : { ...TCB[BASIN], days: 365 };            // the month and day the lab's season starts on, the month the real season starts in, and the days a lab season runs
const GRID = REAL.grid, NX = GRID.nx, NY = GRID.ny, N = NX * NY;
const RING = 3.0;

const flat12 = (a) => { const o = new Float64Array(12 * N); for (let m = 0; m < 12; m++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) o[m * N + j * NX + i] = a[m][j][i]; return o; };
const nest12 = (f, d = 5) => Array.from({ length: 12 }, (_, m) => Array.from({ length: NY }, (_, j) => Array.from({ length: NX }, (_, i) => +f[m * N + j * NX + i].toFixed(d))));
const latOf = (k) => GRID.lat0 + Math.floor(k / NX) * GRID.res, lonOf = (k) => GRID.lon0 + (k % NX) * GRID.res;

/* ---- smoothing of a [12][node] field: Gaussian in space (sigma in nodes), circular three-point in the month; a local AVERAGE (weights renormalised at the edges) ---------------------------- */
function smoothAvg(a, sigma, wMonth = 0.2) {
  const rad = Math.max(1, Math.ceil(2.5 * sigma)), ker = []; for (let d = -rad; d <= rad; d++) ker.push(Math.exp(-0.5 * (d / sigma) ** 2));
  const t1 = new Float64Array(a.length), t2 = new Float64Array(a.length), out = new Float64Array(a.length);
  for (let m = 0; m < 12; m++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    let s = 0, w = 0; for (let d = -rad; d <= rad; d++) { const ii = i + d; if (ii < 0 || ii >= NX) continue; s += ker[d + rad] * a[m * N + j * NX + ii]; w += ker[d + rad]; } t1[m * N + j * NX + i] = s / w;
  }
  for (let m = 0; m < 12; m++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    let s = 0, w = 0; for (let d = -rad; d <= rad; d++) { const jj = j + d; if (jj < 0 || jj >= NY) continue; s += ker[d + rad] * t1[m * N + jj * NX + i]; w += ker[d + rad]; } t2[m * N + j * NX + i] = s / w;
  }
  for (let m = 0; m < 12; m++) for (let k = 0; k < N; k++) out[m * N + k] = wMonth * t2[((m + 11) % 12) * N + k] + (1 - 2 * wMonth) * t2[m * N + k] + wMonth * t2[((m + 1) % 12) * N + k];
  return out;
}

/* the months a lab season of `days` days starting on the 1st of month m0 passes through */
const runMonths = (m0, days) => { const o = new Set(), t0 = Date.UTC(2026, m0, 1); for (let d = 0; d < days; d++) o.add(new Date(t0 + d * 864e5).getUTCMonth()); return o; };
/* up to six boxes of roughly equal real genesis for the regional step of `refine` (the Atlantic has its own, named): three longitude bands cut at the terciles of the real genesis mass, each split in two at the node-row median
   of its latitudes; every box is [la0, la1) x [lo0, lo1) and together they cover the whole grid */
function autoRegions(g) {
  const lonMass = new Float64Array(NX); let tot = 0;
  for (let m = 0; m < 12; m++) for (let k = 0; k < N; k++) { lonMass[k % NX] += g[m * N + k]; tot += g[m * N + k]; }
  const cut = [1 / 3, 2 / 3].map((f) => { let c = 0; for (let i = 0; i < NX; i++) { c += lonMass[i]; if (c >= f * tot) return GRID.lon0 + (i + 0.5) * GRID.res; } return GRID.lon0 + NX * GRID.res; });
  const edges = [-1e9, ...cut, 1e9], out = [];
  for (let b = 0; b < 3; b++) {
    const rowMass = new Float64Array(NY); let t = 0;
    for (let m = 0; m < 12; m++) for (let k = 0; k < N; k++) { const lo = lonOf(k); if (lo >= edges[b] && lo < edges[b + 1]) { rowMass[(k / NX) | 0] += g[m * N + k]; t += g[m * N + k]; } }
    let c = 0, mid = GRID.lat0 + NY * GRID.res; for (let j = 0; j < NY; j++) { c += rowMass[j]; if (c >= 0.5 * t) { mid = GRID.lat0 + (j + 0.5) * GRID.res; break; } }
    out.push(['b' + b + 's', -1e9, mid, edges[b], edges[b + 1]], ['b' + b + 'n', mid, 1e9, edges[b], edges[b + 1]]);
  }
  return out;
}

/* ---- the prior for how much of the real genesis comes from local disturbances (not waves, not tracked lows) ------------------------------------------------------------------------ */
const sstep = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const box = (lat, lon, la0, la1, lo0, lo1, e = 3) => sstep(lat, la0 - e, la0 + e) * (1 - sstep(lat, la1 - e, la1 + e)) * sstep(lon, lo0 - e, lo0 + e) * (1 - sstep(lon, lo1 - e, lo1 + e));
export function localShare(lat, lon) {                       // 0.55 over the Gulf and the western Caribbean, 0.5 off the south-eastern US and the Bahamas, 0.3 in the subtropical Atlantic, 0.05 elsewhere
  if (BASIN !== 'atlantic') return 0.9;                      // no easterly waves to lean on elsewhere: nearly all of the supply is local seeds (the tracked lows are the rest), and the rates are fitted to the real genesis whatever the split
  return Math.max(0.05, 0.55 * box(lat, lon, 12, 31, -100, -78), 0.5 * box(lat, lon, 22, 38, -82, -62), 0.3 * sstep(lat, 27, 31));
}

/* ---- real targets ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- */
const G_T = flat12(REAL.genesis.T), G_S = flat12(REAL.genesis.S);
/* nodes that are at least a quarter water (the page's own land mask, sampled over each 5-degree cell): the only ones genesis can happen at */
export function wetNodes() {
  const D = JSON.parse(readFileSync(join(ROOT, 'data/generated', BASIN === 'atlantic' ? 'data.json' : `${BASIN}-data.json`), 'utf8')), dm = D.domain, mb = Buffer.from(D.mask, 'base64');
  const isLand = (lat, lon) => { const i = Math.round((lon - dm.lon0) / dm.res), j = Math.round((dm.lat1 - lat) / dm.res); if (i < 0 || j < 0 || i >= dm.nx || j >= dm.ny) return false; const k = j * dm.nx + i; return ((mb[k >> 3] >> (7 - (k & 7))) & 1) === 1; };
  const w = new Float64Array(N);
  for (let k = 0; k < N; k++) { let n = 0, c = 0; for (let a = -2; a <= 2; a += 0.5) for (let b = -2; b <= 2; b += 0.5) { n++; if (!isLand(latOf(k) + a, lonOf(k) + b)) c++; } w[k] = c / n >= 0.25 ? 1 : 0; }
  return w;
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
/* The real genesis maps on the nodes a disturbance can develop at. A coastal node that the page's land mask calls dry (the Yucatan, the Honduran coast, the Louisiana coast: 37 % of the real genesis of the Caribbean and the Gulf
   sits on such nodes, because the real maps were smoothed over the coast) still holds real genesis: its mass is handed to the water nodes round it (Gaussian weights over two nodes), and only a remainder with no water node
   near is spread over the whole basin. (Spreading all of it over the whole basin, as the first version of this fit did, left the Gulf and the Caribbean a quarter short and the south-eastern coast and subtropics too rich.) */
export function realTargets(wetT) {
  const out = [];
  for (const src of [G_T, G_S]) {
    const dst = new Float64Array(12 * N);
    for (let m = 0; m < 12; m++) {
      let leftover = 0;
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const k = j * NX + i, g = src[m * N + k]; if (!(g > 0)) continue;
        if (wetT[k]) { dst[m * N + k] += g; continue; }
        const nb = []; let sw = 0;
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
          const jj = j + dj, ii = i + di; if (jj < 0 || jj >= NY || ii < 0 || ii >= NX || !wetT[jj * NX + ii]) continue;
          const w = Math.exp(-0.5 * (dj * dj + di * di)); nb.push([jj * NX + ii, w]); sw += w;
        }
        if (sw > 0) for (const [kk, w] of nb) dst[m * N + kk] += g * w / sw; else leftover += g;
      }
      if (leftover > 0) { let tot = 0; for (let k = 0; k < N; k++) tot += dst[m * N + k]; if (tot > 0) for (let k = 0; k < N; k++) dst[m * N + k] *= 1 + leftover / tot; }
    }
    out.push(dst);
  }
  return out;
}

/* ---- clim: the page's mean steering and environment ------------------------------------------------------------------------------------------------------------------------------------ */
export function climFromRuns(seasons) {
  const steer = new Float64Array(12 * N * 6), ns = new Float64Array(12 * N), env = { sst: new Float64Array(12 * N), rh: new Float64Array(12 * N), shear: new Float64Array(12 * N), rel: new Float64Array(12 * N), ne: new Float64Array(12 * N) };
  for (const s of seasons) {
    const c = s.clim; if (!c) continue;
    for (let q = 0; q < steer.length; q++) steer[q] += c.steer[q];
    for (let q = 0; q < ns.length; q++) { ns[q] += c.ns[q]; env.sst[q] += c.sst[q]; env.rh[q] += c.rh[q]; env.shear[q] += c.shear[q]; env.rel[q] += c.rel[q]; env.ne[q] += c.ne[q]; }
  }
  const steerClim = Array.from({ length: 6 }, () => new Float64Array(12 * N));
  for (let q = 0; q < 12 * N; q++) for (let k = 0; k < 6; k++) steerClim[k][q] = ns[q] > 0 ? steer[q * 6 + k] / ns[q] : NaN;
  const e0 = {}; for (const k of ['sst', 'rh', 'shear', 'rel']) { e0[k] = new Float64Array(12 * N); for (let q = 0; q < 12 * N; q++) e0[k][q] = env.ne[q] > 0 ? env[k][q] / env.ne[q] : NaN; }
  const fill = (a) => {                                       // a node without samples (land, outside the Atlantic): the mean of the nodes round it, repeated until all are filled
    for (let pass = 0; pass < 12; pass++) {
      let left = 0;
      for (let m = 0; m < 12; m++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const q = m * N + j * NX + i; if (a[q] === a[q]) continue;
        let s = 0, w = 0; for (const [dj, di] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const jj = j + dj, ii = i + di; if (jj < 0 || jj >= NY || ii < 0 || ii >= NX) continue; const v = a[m * N + jj * NX + ii]; if (v === v) { s += v; w++; } }
        if (w) a[q] = s / w; else left++;
      }
      if (!left) break;
    }
  };
  const wet = new Float64Array(N);                              // a node the page has sea-surface temperature for (the Atlantic mask) in some month: the only ones a disturbance can develop at
  for (let k = 0; k < N; k++) { let n = 0; for (let m = 0; m < 12; m++) n += env.ne[m * N + k]; wet[k] = n > 0 ? 1 : 0; }
  steerClim.forEach(fill); Object.values(e0).forEach(fill);
  return { wet, steerClim, env0: { rh: e0.rh, shear: e0.shear, sst: e0.sst, sstRel: e0.rel }, samples: { steer: mean(Array.from(ns).filter((x) => x > 0)), env: mean(Array.from(env.ne).filter((x) => x > 0)) } };
}

/* ---- the fit of the development rates and the local-seed supply ------------------------------------------------------------------------------------------------------------------------ */
const HAZ_MAX = 0.04, P_SEED0 = 0.35, F_SUB_LOCAL = 0.5, EQ_GAP = 3;                  // EQ_GAP: nodes closer to the equator than this (degrees) are not wet outside the Atlantic (the real maps' smoothing leaks there; the engine's own latitude gate does the rest)
function sumDiag(seasons, key) {
  const a = new Float64Array(12 * N);
  for (const s of seasons) { const d = s.diagEnd ? s.diagEnd[0] : s.sets.base.diag; for (const [i, v] of d[key]) a[i] += v; }
  for (let q = 0; q < a.length; q++) a[q] /= seasons.length;                       // per season
  return a;
}
export function fitStep(seasons, maps, opts = {}) {
  const X = {}; for (const k of ['xT.W', 'xT.N', 'xT.L', 'xS.N', 'xS.L', 'gT.W', 'gT.N', 'gT.L', 'gT.M', 'gS.N', 'gS.L', 'h.W', 'h.N', 'h.L', 'spawn.N']) X[k] = sumDiag(seasons, k);
  const XT = new Float64Array(12 * N), XS = new Float64Array(12 * N);
  for (let q = 0; q < XT.length; q++) { XT[q] = X['xT.W'][q] + X['xT.N'][q] + X['xT.L'][q]; XS[q] = X['xS.N'][q] + X['xS.L'][q]; }
  const XTs = smoothAvg(XT, opts.sigmaX ?? 0.6, 0.2), XSs = smoothAvg(XS, opts.sigmaXS ?? 1.0, 0.25);
  const hazT = new Float64Array(12 * N), hazS = new Float64Array(12 * N);
  // genesis on the nodes that are mostly land is lost; the real maps were smoothed over the coast, so give that mass back to the nodes that can have it
  const wetT = Float64Array.from(opts.wet || new Float64Array(N).fill(1), (w, k) => (Math.abs(latOf(k)) < (BASIN === 'atlantic' ? 7.5 : EQ_GAP) ? 0 : w));       // the node on the equator only holds the real map's smoothing leaking south: nothing forms there
  const [gTreal, gSreal] = realTargets(wetT);
  const damp = (est, old, eta) => (old > 0 && est > 0 ? Math.exp((1 - eta) * Math.log(old) + eta * Math.log(est)) : est);
  for (let m = 0; m < 12; m++) for (let k = 0; k < N; k++) {
    const q = m * N + k, gT = gTreal[q], gS = gSreal[q];
    hazT[q] = XTs[q] > 1e-6 ? Math.min(HAZ_MAX, gT / XTs[q]) : 0;
    hazS[q] = XSs[q] > 1e-6 ? Math.min(HAZ_MAX, gS / XSs[q]) : 0;
    if (opts.prev && opts.eta != null) { hazT[q] = damp(hazT[q], opts.prev.hazT[q], opts.eta); hazS[q] = damp(hazS[q], opts.prev.hazS[q], opts.eta); }
  }
  // IPF step (opts.ipf, with opts.prev = the rates the run used): the realised genesis of the run, smoothed, against the real one, smoothed the same way; each node's rate is the one the run used
  // times the ratio (damped, limited to a factor of two), so that the totals, the monthly shape and the map come out the real ones whatever the exposures did (their noise, depletion, the gates)
  if (opts.ipf && opts.prev) {
    const eta = opts.eta ?? 0.7, gTr = new Float64Array(12 * N), gSr = new Float64Array(12 * N);
    gTr.set(gTreal); gSr.set(gSreal);
    const genT0 = new Float64Array(12 * N), genS0 = new Float64Array(12 * N);
    for (let q = 0; q < genT0.length; q++) { genT0[q] = X['gT.W'][q] + X['gT.N'][q] + X['gT.L'][q] + X['gT.M'][q]; genS0[q] = X['gS.N'][q] + X['gS.L'][q]; }
    const a1 = smoothAvg(genT0, 1.0, 0.25), b1 = smoothAvg(gTr, 1.0, 0.25), a2 = smoothAvg(genS0, 1.6, 0.3), b2 = smoothAvg(gSr, 1.6, 0.3);
    for (let q = 0; q < hazT.length; q++) {
      if (a1[q] > 2e-3 && b1[q] > 2e-3 && opts.prev.hazT[q] > 0) hazT[q] = Math.min(HAZ_MAX, opts.prev.hazT[q] * Math.pow(Math.max(0.5, Math.min(2, b1[q] / a1[q])), eta));
      if (a2[q] > 1e-3 && b2[q] > 1e-3 && opts.prev.hazS[q] > 0) hazS[q] = Math.min(HAZ_MAX, opts.prev.hazS[q] * Math.pow(Math.max(0.5, Math.min(2, b2[q] / a2[q])), eta));
    }
  }
  // local seeds: their share of the real genesis, divided by the share of seeds that develop (measured, smoothed over a wide neighbourhood; the prior before the first pass)
  const spawn = new Float64Array(12 * N), target = new Float64Array(12 * N);
  const gN = new Float64Array(12 * N); for (let q = 0; q < gN.length; q++) gN[q] = X['gT.N'][q] + X['gS.N'][q];
  const gNs = smoothAvg(gN, 1.5, 0.3), spNs = smoothAvg(X['spawn.N'], 1.5, 0.3);
  for (let m = 0; m < 12; m++) for (let k = 0; k < N; k++) {
    const q = m * N + k, fN = localShare(latOf(k), lonOf(k)), gT = gTreal[q], gS = gSreal[q];
    target[q] = fN * gT + F_SUB_LOCAL * gS;
    let p = P_SEED0; if (opts.useMeasuredP && spNs[q] > 1e-4 && gNs[q] > 1e-5) p = Math.max(0.05, Math.min(0.9, gNs[q] / spNs[q]));
    spawn[q] = target[q] / p;
  }
  // diagnostics
  const tot = (a) => { let s = 0; for (let q = 0; q < a.length; q++) s += a[q]; return s; };
  const mon = (a) => Array.from({ length: 12 }, (_, m) => { let s = 0; for (let k = 0; k < N; k++) s += a[m * N + k]; return s; });
  const genT = new Float64Array(12 * N), genS = new Float64Array(12 * N);
  for (let q = 0; q < genT.length; q++) { genT[q] = X['gT.W'][q] + X['gT.N'][q] + X['gT.L'][q] + X['gT.M'][q]; genS[q] = X['gS.N'][q] + X['gS.L'][q]; }
  return { hazT, hazS, spawn, X, genT, genS, stats: { genT: tot(genT), genS: tot(genS), realT: tot(G_T), realS: tot(G_S), byMonthT: mon(genT), realByMonthT: mon(G_T), byMonthS: mon(genS), shares: { W: tot(X['gT.W']), N: tot(X['gT.N']) + tot(X['gS.N']), L: tot(X['gT.L']) + tot(X['gS.L']) }, seedsPerYear: tot(X['spawn.N']), hoursW: tot(X['h.W']), hoursN: tot(X['h.N']), hoursL: tot(X['h.L']), capped: Array.from(hazT).filter((x) => x >= HAZ_MAX).length } };
}

/* ---- assembling the maps object the engine takes -------------------------------------------------------------------------------------------------------------------------------------- */
export function assembleMaps(clim, fit) {
  // the real mean drift, less what the page's weather adds on average where storms of that kind are (fit.driftCorr, tools/storm_fit.mjs motion): the real map is the mean motion of storms that were
  // where they were BECAUSE of the flow they met, so a simulated storm at that place has already got that conditional anomaly from the page's flow, and adding the map on top counts it twice
  const drift = {};
  for (const c of ['weak', 'strong', 'sub', 'ex']) {
    const cu = fit && fit.driftCorr && fit.driftCorr[c];
    drift[c] = { u: REAL.drift[c].u.map((m, mi) => m.map((r, j) => r.map((x, i) => (cu ? +(x - cu.u[mi * N + j * NX + i]).toFixed(2) : x)))), v: REAL.drift[c].v.map((m, mi) => m.map((r, j) => r.map((x, i) => (cu ? +(x - cu.v[mi * N + j * NX + i]).toFixed(2) : x)))) };
  }
  const m = { grid: GRID, ring: RING, drift };
  if (clim) {
    m.steerClim = clim.steerClim.map((a) => nest12(a, 2));
    m.env0 = { rh: nest12(clim.env0.rh, 2), shear: nest12(clim.env0.shear, 2), sst: nest12(clim.env0.sst, 2), sstRel: nest12(clim.env0.sstRel, 2) };
  }
  if (fit) { m.haz = { T: nest12(fit.hazT, 6), S: nest12(fit.hazS, 6) }; m.spawn = nest12(fit.spawn, 4); }
  return m;
}
const fromJson = (j) => ({ steerClim: j.steerClim.map((a) => flat12(a)), env0: { rh: flat12(j.env0.rh), shear: flat12(j.env0.shear), sst: flat12(j.env0.sst), sstRel: flat12(j.env0.sstRel) } });
const fitFromJson = (j) => ({ hazT: flat12(j.haz.T), hazS: flat12(j.haz.S), spawn: flat12(j.spawn), driftCorr: j.driftCorr ? Object.fromEntries(Object.entries(j.driftCorr).map(([c, o]) => [c, { u: flat12(o.u), v: flat12(o.v) }])) : null });

/* ---- command line ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, ...a] = process.argv.slice(2), get = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
  const seedsOf = (r) => { const [x, y] = r.split('-').map(Number), s = []; for (let q = x; q <= (y ?? x); q++) s.push(q); return s; };
  const t0 = Date.now(), tick = (s, n) => process.stderr.write(`\rseason ${n} (seed ${s}) ${((Date.now() - t0) / 1000).toFixed(0)} s   `);
  if (cmd === 'clim') {
    const raw = await runLab({ seeds: seedsOf(get('seeds', '1-8')), days: 365, sets: { base: {} }, pages: +get('pages', 4), basin: BASIN, clim: { grid: GRID, R: RING }, onSeed: tick });
    process.stderr.write('\n');
    const c = climFromRuns(raw.seasons);
    writeFileSync(get('out', 'clim.json'), JSON.stringify({ meta: { seeds: raw.seasons.length, ring: RING, grid: GRID, samplesPerNodeMonth: c.samples }, wet: Array.from({ length: NY }, (_, j) => Array.from({ length: NX }, (_, i) => c.wet[j * NX + i])), steerClim: c.steerClim.map((x) => nest12(x, 2)), env0: { rh: nest12(c.env0.rh, 2), shear: nest12(c.env0.shear, 2), sst: nest12(c.env0.sst, 2), sstRel: nest12(c.env0.sstRel, 2) } }));
    console.log('clim written', get('out', 'clim.json'), c.samples);
  } else if (cmd === 'fit') {
    const climJ = JSON.parse(readFileSync(get('clim'), 'utf8')), clim = fromJson(climJ);
    const wet = climJ.wet ? Float64Array.from(climJ.wet.flat()) : wetNodes();
    const startJ = get('start') ? JSON.parse(readFileSync(get('start'), 'utf8')) : null;
    let fit = startJ ? fitFromJson(startJ) : { hazT: new Float64Array(12 * N), hazS: new Float64Array(12 * N), spawn: null };
    if (!fit.spawn) { const f0 = fitStep([{ sets: { base: { diag: Object.fromEntries(['xT.W', 'xT.N', 'xT.L', 'xS.N', 'xS.L', 'gT.W', 'gT.N', 'gT.L', 'gT.M', 'gS.N', 'gS.L', 'h.W', 'h.N', 'h.L', 'spawn.N'].map((k) => [k, []])) } } }], null, { wet }); fit.spawn = f0.spawn; }
    const params = get('params') ? JSON.parse(readFileSync(get('params'), 'utf8')) : {}, pool = [], poolFrom = +get('poolfrom', 2), eta = +get('eta', 0.7), ipf = a.includes('--ipf');
    for (let it = 1; it <= +get('iters', 3); it++) {
      const maps = assembleMaps(clim, fit);
      const raw = await runLab({ seeds: seedsOf(get('seeds', '1-16')), days: +get('days', BCFG.days), extraDays: 365 - +get('days', BCFG.days), sets: { base: params }, pages: +get('pages', 4), basin: BASIN, maps, diag: true, onSeed: tick });
      process.stderr.write('\n');
      if (get('raw')) writeFileSync(get('raw').replace('.json', `_it${it}.json`), JSON.stringify(raw));
      if (it >= poolFrom) for (const s of raw.seasons) pool.push({ diagEnd: s.diagEnd });      // the exposures of every pass from `poolfrom` on, pooled: less noise, and the depletion they show is the converged one
      const f = ipf ? fitStep(raw.seasons, maps, { useMeasuredP: true, wet, prev: fit, eta, ipf: true }) : fitStep(it >= poolFrom ? pool : raw.seasons, maps, { useMeasuredP: it > 1, wet, prev: it > poolFrom ? fit : null, eta });
      const st = f.stats;
      console.log(`pass ${it}: genesis per year tropical ${st.genT.toFixed(2)} (real ${st.realT.toFixed(2)}), subtropical ${st.genS.toFixed(2)} (real ${st.realS.toFixed(2)}); from waves / local seeds / lows ${st.shares.W.toFixed(2)} / ${st.shares.N.toFixed(2)} / ${st.shares.L.toFixed(2)}; local seeds born ${st.seedsPerYear.toFixed(1)} a year; capped nodes ${st.capped}`);
      console.log('   tropical by month  sim ' + st.byMonthT.map((x) => x.toFixed(2)).join(' ') + '\n                      real ' + st.realByMonthT.map((x) => x.toFixed(2)).join(' '));
      fit = { hazT: f.hazT, hazS: f.hazS, spawn: f.spawn, driftCorr: fit.driftCorr };
      writeFileSync(get('out', 'sim.json'), JSON.stringify({ meta: { seeds: raw.seasons.length, pass: it, stats: st }, haz: { T: nest12(fit.hazT, 6), S: nest12(fit.hazS, 6) }, spawn: nest12(fit.spawn, 4), driftCorr: startJ ? startJ.driftCorr : undefined }));
    }
  } else if (cmd === 'rescale') {
    // the fit's sample is a few dozen seasons, so its genesis total is within a few per cent of the real one by chance: the last step multiplies the rates of each month by real / simulated
    // (the pooled passes' own count, in the file's meta), limited to +-25 % and smoothed over the neighbouring months, so the total and the monthly shape are the real ones
    const j = JSON.parse(readFileSync(get('sim'), 'utf8')), st = j.meta.stats, hz = flat12(j.haz.T), hs = flat12(j.haz.S);
    const sm = st.byMonthT.map((v, m) => (v > 0.3 ? Math.max(0.75, Math.min(1.25, st.realByMonthT[m] / v)) : 1)), r = sm.map((v, m) => 0.25 * sm[(m + 11) % 12] + 0.5 * v + 0.25 * sm[(m + 1) % 12]);
    for (let m = 0; m < 12; m++) for (let k = 0; k < N; k++) { hz[m * N + k] *= r[m]; }
    const rS = st.realS / Math.max(st.genS, 1e-6); const fS = Math.max(0.75, Math.min(1.25, rS));
    for (let q = 0; q < hs.length; q++) hs[q] *= fS;
    console.log('monthly factors on the tropical rates', r.map((x) => x.toFixed(3)).join(' '), ' subtropical', fS.toFixed(3));
    writeFileSync(get('out'), JSON.stringify({ meta: Object.assign({}, j.meta, { rescaled: r, rescaledS: fS }), haz: { T: nest12(hz, 6), S: nest12(hs, 6) }, spawn: j.spawn, driftCorr: j.driftCorr }));
  } else if (cmd === 'wet') {
    // The nodes disturbances can develop at: at least a quarter of the 5-degree cell is water (the page's land mask) AND the disturbances of a fit run spend at least 10 hours a year there. (`clim` marks the nodes whose
    // CENTRE point has sea-surface temperature, which drops cells that are 40-50 % water because their centre is on the Yucatan, the Honduran or the Louisiana coast, and keeps Pacific cells the Atlantic cannot reach.)
    const climJ = JSON.parse(readFileSync(get('clim'), 'utf8')), raw = JSON.parse(readFileSync(get('raw'), 'utf8')), area = wetNodes(), hrs = new Float64Array(N);
    for (const s of raw.seasons) { const d = s.diagEnd ? s.diagEnd[0] : s.sets.base.diag; for (const k of ['h.W', 'h.N', 'h.L']) for (const [i, v] of d[k]) hrs[i % N] += v / raw.seasons.length; }
    climJ.wet = Array.from({ length: NY }, (_, j) => Array.from({ length: NX }, (_, i) => (area[j * NX + i] && hrs[j * NX + i] >= 10 ? 1 : 0)));
    writeFileSync(get('out'), JSON.stringify(climJ));
    console.log('wet nodes', climJ.wet.flat().reduce((a, b) => a + b, 0), 'of', N);
  } else if (cmd === 'refine') {
    // The IPF counts the development EVENTS; about one in five fizzles before it is a numbered depression, and not equally everywhere (more over the Gulf and the western Caribbean, where the
    // air is marginal). This last step compares the first fixes of the numbered depressions of a lab run (seeds the rates were not fitted on, or at least not at these rates) with the real map
    // that has been smoothed the same, broadly (a few dozen seasons are few for a 5-degree node), and multiplies the rates by the ratio, limited to a factor 0.6-1.8 (subtropical 0.5-2).
    const climJ = JSON.parse(readFileSync(get('clim'), 'utf8')), wet = climJ.wet ? Float64Array.from(climJ.wet.flat()) : wetNodes();
    const j = JSON.parse(readFileSync(get('sim'), 'utf8')), raw = JSON.parse(readFileSync(get('raw'), 'utf8')), set = get('set', raw.names[0]), nS = raw.seasons.length;
    const START_MS = Date.UTC(2026, BCFG.start[0], BCFG.start[1]), hz = flat12(j.haz.T), hs = flat12(j.haz.S), sp = flat12(j.spawn), RUN = runMonths(BCFG.start[0], raw.days || BCFG.days);
    const wetT = Float64Array.from(wet, (w, k) => (Math.abs(latOf(k)) < (BASIN === 'atlantic' ? 7.5 : EQ_GAP) ? 0 : w)), [gTr, gSr] = realTargets(wetT);
    const simT = new Float64Array(12 * N), simS = new Float64Array(12 * N), simN = new Float64Array(12 * N);
    for (const s of raw.seasons) for (const x of s.sets[set].storms) {
      if (!x.gen || !(x.td >= 0)) continue;
      const m = new Date(START_MS + x.td * 3600000).getUTCMonth(), i = Math.round((x.gen[1] - GRID.lon0) / GRID.res), jj = Math.round((x.gen[0] - GRID.lat0) / GRID.res);
      if (i < 0 || i >= NX || jj < 0 || jj >= NY) continue;
      (x.sub0 ? simS : simT)[m * N + jj * NX + i] += 1 / nS; if (!x.sub0 && x.kind === 'N') simN[m * N + jj * NX + i] += 1 / nS;
    }
    const mAct = meanActivity(raw.seasons), actAdj = 1 - ACT_ELASTICITY * (mAct - 1);                                // the seeds' own mean activity (see meanActivity)
    for (let q = 0; q < simT.length; q++) { simT[q] *= actAdj; simS[q] *= actAdj; }
    for (let m = 0; m < 12; m++) if (!RUN.has(m)) for (let k = 0; k < N; k++) { simT[m * N + k] = gTr[m * N + k]; simS[m * N + k] = gSr[m * N + k]; }          // the months a lab season does not run (Jan-May of the Atlantic's 214 days) are left as they are
    // Regional totals first (a node has a few events a season, a region dozens): the real Atlantic's numbered depressions of each of the regions of tools/storm_validate.mjs against the simulated ones. The factor goes to every
    // node of the region, and the node-by-node step below then works on what is left (the pattern inside a region).
    const lim0 = (r, lo, hi) => Math.max(lo, Math.min(hi, r));
    const REGIONS = BASIN === 'atlantic' ? [['east', 5, 20, -45, 0], ['mdr', 5, 20, -62.5, -42.5], ['carib', 5, 20, -87.5, -62.5], ['gulf', 20, 32, -100, -80], ['seus', 20, 38, -80, -62.5], ['subtrop', 25, 66, -62.5, 0]] : autoRegions(gTr);
    const fReg = new Float64Array(N).fill(1), dampR = +get('rdamp', 0.8), regLog = [];
    for (const [nm, la0, la1, lo0, lo1] of REGIONS) {
      const inR = (k) => latOf(k) >= la0 && latOf(k) < la1 && lonOf(k) >= lo0 && lonOf(k) < lo1;
      let a = 0, b = 0; for (const m of RUN) for (let k = 0; k < N; k++) if (inR(k)) { a += gTr[m * N + k]; b += simT[m * N + k]; }
      if (!(a > 0.3 && b > 0.1)) continue;
      const f = Math.pow(lim0(a / b, 0.6, 1.5), dampR); regLog.push(`${nm} ${b.toFixed(2)} vs ${a.toFixed(2)} (x${f.toFixed(2)})`);
      for (let k = 0; k < N; k++) if (inR(k)) fReg[k] = f;
    }
    if (regLog.length) console.log('regions (simulated vs real numbered tropical depressions Jun-Dec): ' + regLog.join('; '));
    for (let q = 0; q < simT.length; q++) simT[q] *= fReg[q % N];
    const sg = +get('sigma', 1.5), sT = [smoothAvg(gTr, sg, 0.3), smoothAvg(simT, sg, 0.3)], sS = [smoothAvg(gSr, sg + 0.5, 0.3), smoothAvg(simS, sg + 0.5, 0.3)];            // --sigma: the smoothing, in nodes (1.5 for a few dozen seasons, ~1 for a few hundred)
    const lim = (r, lo, hi) => Math.max(lo, Math.min(hi, r)), damp = +get('damp', 1.0);
    const sN = smoothAvg(simN, sg, 0.3), sTall = smoothAvg(simT, sg, 0.3);                                              // the share of the events at a node that local seeds supply
    const fT = new Float64Array(12 * N).fill(1), fS = new Float64Array(12 * N).fill(1); let nCapped = 0;
    for (let q = 0; q < fT.length; q++) {
      if (sT[0][q] > 1e-3 && sT[1][q] > 1e-3) fT[q] = Math.pow(lim(sT[0][q] / sT[1][q], 0.6, 1.8), damp); else if (sT[0][q] > 1e-3) fT[q] = Math.pow(1.8, damp);
      if (sS[0][q] > 1e-3 && sS[1][q] > 1e-3) fS[q] = Math.pow(lim(sS[0][q] / sS[1][q], 0.5, 2.0), damp);
      // where the rate is already at its ceiling (the western Caribbean: few waves get there and a rate above ~0.04 an hour would develop a disturbance in under a day) what the rate can not take goes
      // to the supply of local seeds: with a share s of the events from seeds, scaling the rate by a and the supply by b scales the events by a (1 - s + s b)
      fT[q] *= fReg[q % N];
      const aMax = hz[q] > 0 ? HAZ_MAX / hz[q] : 1, sh = sTall[q] > 1e-4 ? lim(sN[q] / sTall[q], 0, 1) : 0;
      if (fT[q] <= aMax || sp[q] <= 0 || sh < 0.2) hz[q] = Math.min(HAZ_MAX, hz[q] * fT[q]);
      else { hz[q] = HAZ_MAX; sp[q] *= Math.min(3, (fT[q] / aMax - 1 + sh) / sh); nCapped++; }
      hs[q] = Math.min(HAZ_MAX, hs[q] * fS[q]);
    }
    const sum = (a) => { let t = 0; for (const m of RUN) for (let k = 0; k < N; k++) t += a[m * N + k]; return t; };
    console.log(`${nCapped} node-months were at the rate ceiling: their factor went to the supply of local seeds`);
    console.log(`the ${nS} seeds' mean activity is ${mAct.toFixed(3)}: counts scaled by ${actAdj.toFixed(3)} to an average season`);
    console.log(`numbered depressions per season (the months the lab ran): tropical ${sum(simT).toFixed(2)} (real ${sum(gTr).toFixed(2)}), subtropical ${sum(simS).toFixed(2)} (real ${sum(gSr).toFixed(2)}); the rates were scaled by ${(sum(gTr) / Math.max(1e-9, sum(simT))).toFixed(3)} on average`);
    writeFileSync(get('out'), JSON.stringify({ meta: Object.assign({}, j.meta, { refined: { seasons: nS, set } }), haz: { T: nest12(hz, 6), S: nest12(hs, 6) }, spawn: nest12(sp, 4), driftCorr: j.driftCorr }));
  } else if (cmd === 'motion') {
    // The drift maps are the mean motion of REAL storms of each kind at each place and time of year. A simulated storm is moved by that mean plus the anomaly of the page's steering; but the real mean
    // belongs to storms that were at that place because of the flow they met (a storm at 42N is there under a trough), so the page's anomaly at a simulated storm's place is not zero on average, and
    // the sum counts it twice (north of 35N it made the storms 2-5 kt too slow eastward and too fast northward). The engine's diagnostics (a lab run with --diag) hold the mean anomaly part of the
    // motion by class, month and node; the correction subtracted from the real drift is that mean, smoothed (1.2 nodes, the neighbouring months) and shrunk toward zero where the hours are few.
    const j = JSON.parse(readFileSync(get('sim'), 'utf8')), raw = JSON.parse(readFileSync(get('raw'), 'utf8')), set = get('set', raw.names[0]), eta = +get('eta', 0.8), n0 = +get('n0', 100);
    const old = j.driftCorr || {}, out = {}, stat = [];
    for (const c of ['weak', 'strong', 'sub', 'ex']) {
      const ax = new Float64Array(12 * N), ay = new Float64Array(12 * N), n = new Float64Array(12 * N);
      for (const sea of raw.seasons) { const d = sea.sets[set].diag; if (!d) continue; for (const [i, v] of d['ax.' + c]) ax[i] += v; for (const [i, v] of d['ay.' + c]) ay[i] += v; for (const [i, v] of d['n.' + c]) n[i] += v; }
      const sx = smoothAvg(ax, 1.2, 0.25), sy = smoothAvg(ay, 1.2, 0.25), sn = smoothAvg(n, 1.2, 0.25);          // smoothed sums and smoothed hours (the same weights: a local average of each)
      const prev = old[c] ? { u: flat12(old[c].u), v: flat12(old[c].v) } : { u: new Float64Array(12 * N), v: new Float64Array(12 * N) }, cu = new Float64Array(12 * N), cv = new Float64Array(12 * N);
      let hours = 0, sumU = 0, sumV = 0;
      for (let q = 0; q < cu.length; q++) {
        const meanU = sn[q] > 0 ? sx[q] / (sn[q] + n0 / 9) : 0, meanV = sn[q] > 0 ? sy[q] / (sn[q] + n0 / 9) : 0;      // (n0 / 9: the smoothing spreads ~9 nodes' worth of hours over a node)
        cu[q] = (1 - eta) * prev.u[q] + eta * meanU; cv[q] = (1 - eta) * prev.v[q] + eta * meanV; hours += n[q]; sumU += ax[q]; sumV += ay[q];
      }
      out[c] = { u: nest12(cu, 3), v: nest12(cv, 3) }; stat.push(`${c}: ${Math.round(hours)} h, mean anomaly part ${(sumU / Math.max(1, hours)).toFixed(2)} / ${(sumV / Math.max(1, hours)).toFixed(2)} kt`);
    }
    console.log('motion: ' + stat.join('; '));
    writeFileSync(get('out'), JSON.stringify(Object.assign({}, j, { driftCorr: out })));
  } else if (cmd === 'maps') {
    const clim = fromJson(JSON.parse(readFileSync(get('clim'), 'utf8'))), fit = fitFromJson(JSON.parse(readFileSync(get('sim'), 'utf8')));
    writeFileSync(get('out', 'maps.json'), JSON.stringify(assembleMaps(clim, fit)));
    console.log('maps written', get('out', 'maps.json'));
  } else console.log('usage: storm_fit.mjs clim|fit|maps ...');
}
