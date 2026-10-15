#!/usr/bin/env node
// Two calibrations that can only be made against the simulation itself, written to <basin>-steer-means.json:
//
//  1. The SMEAR. The explicit jet ribbon (a westerly stripe along the simulated jet axis) moves winds around; the client subtracts the mean
//     ribbon the simulated jet produces at each node, so the climate mean stays the real one (the same idea as the shear ribbon's "smear",
//     measured here from the built page because the ribbon follows the simulated axis, whose distribution -- mean path, spread, soft limits --
//     is what the average has to be taken over).
//
//  2. The RESIDUAL AMPLITUDE MAPS (sigR for the deep layer, sigRs for the shallow one). The simulated wind is: climatology + year-to-year part
//     (EOF, ENSO) + ribbon + pressure-driven part + residual waves. make_steer_weather.py can only estimate the residual's size from the real
//     data after removing its own versions of the other terms, and those are not exactly what the simulation adds back, so the pieces did not
//     add up to the real variance (in August the simulated deep-layer winds were up to 60% too variable at 25-35N). Here the budget is
//     closed in the simulation itself: for every calendar month and node,
//         residual variance = (real year-to-year variance + real day-to-day variance) - (variance of everything the simulation adds except
//                             the residual, measured from the built page),
//     floored at 0. (Variances are u^2 + v^2 summed; the targets come from <basin>-steer-calib.json, written by make_steer.py and
//     make_steer_weather.py.) Where the other terms alone already exceed the target the residual is 0 and the report says so.
//
// Needs a prior `npm run build` (neither calibration depends on the smear/maps that may already be baked in, but both depend on the EOF part and
// the ribbon). Afterwards run
//   node tools/merge_data.mjs <basin> --steer <data-file-name>   and rebuild, to bake the result in.
//
// usage: node tools/calibrate_steer_means.mjs <basin> [seeds=120] [samples-per-seed=12] [seeds-per-month=40]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GEN = join(ROOT, 'data', 'generated');
const [basin, seedsArg, sampArg, monthSeedsArg] = process.argv.slice(2);
if (!basin) { console.error('usage: node tools/calibrate_steer_means.mjs <basin> [seeds] [samples-per-seed] [seeds-per-month]'); process.exit(1); }
const seeds = +(seedsArg || 120), nsamp = +(sampArg || 12), monthSeeds = +(monthSeedsArg || 40), perVisit = 4;
const DIST = { atlantic: 'atlantic', eastpacific: 'eastpacific', westpacific: 'westpacific', nio: 'nio', aus: 'aus', swio: 'swio', spac: 'spac', satl: 'satl', med: 'med' }[basin];
const calib = JSON.parse(readFileSync(join(GEN, `${basin}-steer-calib.json`), 'utf8'));
if (!calib.varInt || !calib.varDaily) { console.error(`${basin}-steer-calib.json needs varInt (make_steer.py) and varDaily (make_steer_weather.py)`); process.exit(1); }
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
await page.route('**://**/*', (r) => r.request().url().startsWith('file://') ? r.continue() : r.abort());
await page.goto(pathToFileURL(join(ROOT, 'dist', `${DIST}-sst-simulator.html`)).href);
await page.waitForFunction(() => window.__ready === true);
const grid = await page.evaluate(() => { const g = window.SSTSIM.steerGrid(); return { nx: g.nx, ny: g.ny }; });
const SN = grid.nx * grid.ny;

// ---- 1. the smear
const res = await page.evaluate(([seeds, nsamp]) => {
  const S = window.SSTSIM; S.setPlaying(false);
  let sum = null, sq = null, n = 0;
  for (let s = 1; s <= seeds; s++) {
    S.applySeed(5000 + s); S.setPlaying(false); S.tick(24 * 15);
    for (let k = 0; k < nsamp; k++) {
      S.tick(24 * 20 + 7 * k);                       // 20+ jet-days apart: the axis has forgotten its earlier shape (its slowest mode persists ~16 jet-days)
      const r = S.steerRibbonNodes(), a = [...r.shallow[0], ...r.shallow[1], ...r.deep[0], ...r.deep[1]];
      if (!sum) { sum = new Float64Array(a.length); sq = new Float64Array(a.length); }
      for (let q = 0; q < a.length; q++) { sum[q] += a[q]; sq[q] += a[q] * a[q]; }
      n++;
    }
  }
  const mean = Array.from(sum, (v) => v / n), sd = Array.from(sq, (v, q) => Math.sqrt(Math.max(0, v / n - mean[q] * mean[q])));
  return { mean, sd, n };
}, [seeds, nsamp]);
const q16 = Int16Array.from(res.mean, (v) => Math.round(v * 100));
const maxMean = Math.max(...res.mean.map(Math.abs)), maxSe = Math.max(...res.sd) / Math.sqrt(res.n * 0.25);   // 0.25: the samples are not fully independent
console.log(`${basin}: mean ribbon over ${res.n} samples; largest mean component ${maxMean.toFixed(2)} kt, rough standard error <= ${maxSe.toFixed(2)} kt`);

// ---- 2. the residual amplitude maps
// Every seed is run through one year; at the middle of each calendar month it is sampled `perVisit` times, 3 days apart, with the residual (the one term
// the maps control) taken back out of the winds. Within a month the samples come from different seeds, so they are independent.
const mv = await page.evaluate(([monthSeeds, perVisit, SN]) => {
  const S = window.SSTSIM; S.setPlaying(false);
  S.applySeed(1); S.setPlaying(false);
  const t0 = new Date(S.state().date), visits = [];
  for (let m = 0; m < 12; m++) { let t = Date.UTC(t0.getUTCFullYear(), m, 15); if (t < t0.getTime() + 6 * 864e5) t = Date.UTC(t0.getUTCFullYear() + 1, m, 15); visits.push({ m, day: Math.round((t - t0.getTime()) / 864e5) }); }
  visits.sort((a, b) => a.day - b.day);
  const sum = Array.from({ length: 12 }, () => new Float64Array(4 * SN)), sq = Array.from({ length: 12 }, () => new Float64Array(4 * SN)), cnt = new Array(12).fill(0);
  for (let s = 1; s <= monthSeeds; s++) {
    S.applySeed(6000 + s); S.setPlaying(false);
    let cur = 0;
    for (const v of visits) {
      const start = v.day - 5; S.tick(24 * (start - cur)); cur = start;
      for (let k = 0; k < perVisit; k++) {
        S.tick(24 * 3); cur += 3;
        const d = S.steerNodes('deep'), sh = S.steerNodes('shallow'), p = S.steerParts();
        const comp = [sh.u, sh.v, d.u, d.v], res = [p.rsU, p.rsV, p.rU, p.rV];
        for (let c = 0; c < 4; c++) for (let q = 0; q < SN; q++) { const x = comp[c][q] - res[c][q]; sum[v.m][c * SN + q] += x; sq[v.m][c * SN + q] += x * x; }
        cnt[v.m]++;
      }
    }
  }
  return { sum: sum.map((a) => Array.from(a)), sq: sq.map((a) => Array.from(a)), cnt };
}, [monthSeeds, perVisit, SN]);

const smooth3 = (a) => {                       // 3x3 box over the node grid, edges clamped
  const o = new Float64Array(SN);
  for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) {
    let s = 0, c = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const jj = Math.max(0, Math.min(grid.ny - 1, j + dj)), ii = Math.max(0, Math.min(grid.nx - 1, i + di)); s += a[jj * grid.nx + ii]; c++; }
    o[j * grid.nx + i] = s / c;
  }
  return o;
};
const R2 = [new Array(12), new Array(12)], sat = [new Array(12), new Array(12)], share = [new Array(12), new Array(12)];   // layer 0 shallow, 1 deep
for (let m = 0; m < 12; m++) {
  const n = mv.cnt[m];
  for (const layer of [0, 1]) {
    const target = new Float64Array(SN), other = new Float64Array(SN);
    for (let q = 0; q < SN; q++) {
      for (const c of (layer ? [2, 3] : [0, 1])) { const s = mv.sum[m][c * SN + q], s2 = mv.sq[m][c * SN + q]; other[q] += (s2 - s * s / n) / (n - 1); }
      target[q] = calib.varInt[m][layer][q] + calib.varDaily[m][layer][q];
    }
    const tS = smooth3(target), oS = smooth3(other), r2 = new Float64Array(SN);
    let zero = 0, ratio = 0;
    for (let q = 0; q < SN; q++) { r2[q] = Math.max(0, tS[q] - oS[q]); if (tS[q] <= oS[q]) zero++; ratio += r2[q] / Math.max(1e-9, tS[q]); }
    R2[layer][m] = r2; sat[layer][m] = zero / SN; share[layer][m] = ratio / SN;
  }
}
// 1-2-1 over the months (cyclic), then to amplitudes
const amps = [0, 1].map((layer) => {
  const out = new Int16Array(12 * SN);
  for (let m = 0; m < 12; m++) for (let q = 0; q < SN; q++) { const v = 0.25 * R2[layer][(m + 11) % 12][q] + 0.5 * R2[layer][m][q] + 0.25 * R2[layer][(m + 1) % 12][q]; out[m * SN + q] = Math.round(Math.sqrt(v) * 100); }
  return out;
});
const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
console.log('residual share of the real variance (mean over nodes, by month 1..12): shallow ' + share[0].map((x) => x.toFixed(2)).join(' ') + ' | deep ' + share[1].map((x) => x.toFixed(2)).join(' '));
console.log('nodes where the other terms already exceed the target (residual 0), % by month: shallow ' + sat[0].map((x) => (x * 100).toFixed(0)).join(' ') + ' | deep ' + sat[1].map((x) => (x * 100).toFixed(0)).join(' '));

writeFileSync(join(GEN, `${basin}-steer-means.json`), JSON.stringify({ smear: Buffer.from(q16.buffer).toString('base64'), samples: res.n, sigR: b64(amps[1]), sigRs: b64(amps[0]), closure: { monthSeeds, perVisit } }));
console.log(`wrote ${basin}-steer-means.json`);
await browser.close();
