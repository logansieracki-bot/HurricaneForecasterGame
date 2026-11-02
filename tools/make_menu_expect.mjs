#!/usr/bin/env node
// Calibrates the "Expected" section of the main menu: what a season of a basin holds (named storms, hurricanes, majors, ACE) under the settings the player chose.
// The numbers are not guessed from the real record: they are what the game itself makes. Whole seasons are played through the built page of each basin (dist/, node tools/build.mjs first),
// in the way the menu starts it (the sliders of the settings, the activity, an El Nino or La Nina held at the start, free to drift or locked), for a space-filling design of settings
// (a Halton sequence over warmth, shear, moisture, activity, the ENSO state and its influence, and how the ENSO state is kept) and for a set of seasons at the normal settings.
// Each season's counts are one line of data/generated/menu-expect-runs.jsonl. `fit` turns them into one response model per basin and count (a quasi-Poisson regression with a log link: the
// number of storms is multiplied by what each setting does, zeros are fine) and writes data/generated/menu-expect.json, which tools/build.mjs puts into index.html.
//   node tools/make_menu_expect.mjs run [basin ...] [--runs 150] [--base 40] [--workers 3] [--dist dist]       plays the seasons (resumes: what is in the file is not played again)
//   node tools/make_menu_expect.mjs fit                                                            fits the models and writes menu-expect.json
//   basins: atlantic epac wpac nio swio aus spac satl med   (the menu's ids)
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RUNS = join(ROOT, 'data/generated/menu-expect-runs.jsonl'), OUT = join(ROOT, 'data/generated/menu-expect.json');
const PAGE = { atlantic: 'atlantic', epac: 'eastpacific', wpac: 'westpacific', nio: 'nio', swio: 'swio', aus: 'aus', spac: 'spac', satl: 'satl', med: 'med' };
const ALL = Object.keys(PAGE);
const METRICS = ['named', 'hurr', 'major', 'ace'];

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const argS = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const cmd = process.argv[2], DIST = argS('dist', join(ROOT, 'dist'));            // (a copy of dist/ lets the pages be rebuilt while the seasons are played)

/* ---- the design ---- */
const halton = (i, b) => { let f = 1, r = 0; for (; i > 0; i = Math.floor(i / b)) { f /= b; r += f * (i % b); } return r; };
function design(basin, i) {                                                  // run i of a basin: the settings, and the seed
  const bi = ALL.indexOf(basin), k = i + 1 + 211 * bi, u = [2, 3, 5, 7, 11, 13, 17].map((b) => halton(k, b));
  const modeU = u[6], mode = modeU < 0.4 ? 'random' : modeU < 0.7 ? 'locked' : 'drift';
  const r = (v, step) => +(Math.round(v / step) * step).toFixed(2);                                                  // (the values the menu's sliders can hold)
  const tw = (v) => Math.sign(2 * v - 1) * Math.pow(Math.abs(2 * v - 1), 1.5);                                         // -1..1, denser near the normal (where the players are) and still reaching the ends of the sliders
  return { b: basin, i, kind: 'design', W: r(tw(u[0]) >= 0 ? 4 * tw(u[0]) : 3 * tw(u[0]), 0.1), S: Math.round(20 * tw(u[1])), M: Math.round(20 * tw(u[2])), A: Math.max(0.3, r(Math.exp(Math.log(0.3) + u[3] * Math.log(10)), 0.1)), E: r(-3 + 6.4 * u[4], 0.1), I: r(Math.exp(Math.log(0.3) + u[5] * Math.log(8.33)), 0.05), mode, seed: 1000 + 7919 * bi + 31 * i };
}
const baseline = (basin, i) => ({ b: basin, i, kind: 'base', W: 0, S: 0, M: 0, A: 1, E: 0, I: null, mode: 'random', seed: 500000 + 104729 * ALL.indexOf(basin) + 17 * i });

/* ---- a season through the page: what the menu's Begin does, then the clock to the end of the season ---- */
function inPage(q) {
  const S = window.SSTSIM, $ = (id) => document.getElementById(id), hold = $('enso-hold');
  S.setPlaying(false); S.storms(true); S.stormAuto(true);
  const slide = (id, v) => { const el = $(id); el.value = v; el.oninput(); };                                  // (through the controls: a new seed reads every slider from its control, a value set only in the model's parameters would be put back)
  slide('p-warm', q.W); slide('p-moist', q.M); slide('p-shear', q.S); slide('p-stact', q.A);
  if (q.mode === 'random') { if (hold.checked) { hold.checked = false; hold.onchange(); } }
  else { $('p-ensonow').value = q.E; $('p-ensonow').oninput(); hold.checked = true; hold.onchange(); }          // the season about to start is made already in that regime
  S.applySeed(q.seed); S.setPlaying(false);
  if (q.I != null) slide('p-enso', q.I);                                                                        // (a new seed jitters this slider: the design's value is set after it)
  if (q.mode === 'drift') { hold.checked = false; hold.onchange(); }                                            // it starts at the chosen state and drifts from there
  const y0 = S.stormState().stats.year; let d = 0;
  while (S.stormState().stats.year === y0 && d < 430) { S.tick(24 * 10); d += 10; }
  const rec = S.stormRecord(y0);
  return { named: rec.named, hurr: rec.hurr, major: rec.major, ace: +rec.ace.toFixed(1), dep: rec.storms.length, days: d };
}

async function run() {
  const { chromium } = await import('playwright');
  const which = process.argv.slice(3).filter((a, i, v) => !a.startsWith('--') && !(i > 0 && v[i - 1].startsWith('--'))), basins = which.length ? which : ALL;
  const nDesign = arg('runs', 150), nBase = arg('base', 40), workers = arg('workers', 3);
  const done = new Set(existsSync(RUNS) ? readFileSync(RUNS, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return r.b + '|' + r.kind + '|' + r.i; }) : []);
  const tasks = [];
  for (let i = 0; i < Math.max(nDesign, nBase); i++) for (const b of basins) {
    if (i < nBase && !done.has(b + '|base|' + i)) tasks.push(baseline(b, i));
    if (i < nDesign && !done.has(b + '|design|' + i)) tasks.push(design(b, i));
  }
  console.log(`${tasks.length} seasons to play (${basins.join(', ')}), ${workers} at a time`);
  let next = 0, finished = 0; const t0 = Date.now();
  async function worker(k) {
    const browser = await chromium.launch(); let page = null, pageOf = null, n = 0;
    while (true) {
      const j = next++; if (j >= tasks.length) break;
      const q = tasks[j];
      if (!page || pageOf !== q.b || n >= 20) {                                                                  // a fresh page for each basin, and after twenty seasons
        if (page) await page.close();
        page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await page.route('**://**/*', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
        await page.goto('file://' + join(DIST, PAGE[q.b] + '-sst-simulator.html'), { waitUntil: 'load', timeout: 90000 });
        await page.waitForFunction(() => window.__ready === true, { timeout: 60000 }); pageOf = q.b; n = 0;
      }
      let r; try { r = await page.evaluate(inPage, q); } catch (e) { console.error('worker', k, q.b, q.kind, q.i, 'failed:', e.message.slice(0, 160)); page = null; continue; }
      n++; appendFileSync(RUNS, JSON.stringify(Object.assign({}, q, r)) + '\n'); finished++;
      if (finished % 10 === 0) console.log(`${finished}/${tasks.length} played, ${Math.round((Date.now() - t0) / 1000)} s`);
    }
    await browser.close();
  }
  await Promise.all(Array.from({ length: workers }, (_, k) => worker(k)));
  console.log(`done: ${finished} seasons in ${Math.round((Date.now() - t0) / 60000)} min`);
}

/* ---- the fit ---- */
// The inputs of a model: w warmth/2, s shear/10, m moisture/10, a the log of the activity, d 1 when an El Nino or La Nina was chosen, e the chosen state times its influence over 2 (0 when it is left random), dre the same
// when it is left to drift. The menu reads the list of names of a basin's model from the file and builds the same numbers (src/menu.html, expFeatures).
const SPECS = {
  quad: ['1', 'w', 's', 'm', 'a', 'w2', 's2', 'm2', 'd', 'e', 'e2', 'dre'],
  cubic: ['1', 'w', 's', 'm', 'a', 'w2', 's2', 'm2', 'w3', 's3', 'm3', 'd', 'e', 'e2', 'dre'],
  cross: ['1', 'w', 's', 'm', 'a', 'w2', 's2', 'm2', 'w3', 's3', 'm3', 'ws', 'wm', 'sm', 'd', 'e', 'e2', 'dre'],
};
function inputs(r) {
  const w = r.W / 2, s = r.S / 10, m = r.M / 10, a = Math.log(Math.max(r.A, 0.3)), d = r.mode === 'random' ? 0 : 1, e = d * (r.E * (r.I == null ? 1 : r.I)) / 2, dr = r.mode === 'drift' ? 1 : 0;
  return { '1': 1, w, s, m, a, w2: w * w, s2: s * s, m2: m * m, w3: w * w * w, s3: s * s * s, m3: m * m * m, ws: w * s, wm: w * m, sm: s * m, d, e, e2: e * e, dre: dr * e };
}
const featuresOf = (r, spec) => { const v = inputs(r); return spec.map((k) => v[k]); };
function solve(A, b) {                                                       // Gaussian elimination with partial pivoting
  const n = b.length, M = A.map((row, i) => row.concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; const piv = M[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / piv; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / (M[r][r] || 1e-12); }
  return x;
}
function glm(X, y, ridge) {                                                  // quasi-Poisson, log link, by iteratively reweighted least squares (the intercept is not shrunk)
  const n = X.length, p = X[0].length, mean = y.reduce((t, v) => t + v, 0) / n; let beta = new Array(p).fill(0); beta[0] = Math.log(Math.max(mean, 1e-3));
  for (let it = 0; it < 60; it++) {
    const eta = X.map((x) => x.reduce((t, v, j) => t + v * beta[j], 0)), mu = eta.map((e) => Math.exp(Math.max(-12, Math.min(12, e))));
    const A = Array.from({ length: p }, () => new Array(p).fill(0)), b = new Array(p).fill(0);
    for (let i = 0; i < n; i++) { const w = mu[i], z = eta[i] + (y[i] - mu[i]) / Math.max(mu[i], 1e-9); for (let j = 0; j < p; j++) { b[j] += w * X[i][j] * z; for (let k = 0; k < p; k++) A[j][k] += w * X[i][j] * X[i][k]; } }
    for (let j = 1; j < p; j++) A[j][j] += ridge;
    const nb = solve(A, b), diff = Math.max(...nb.map((v, j) => Math.abs(v - beta[j]))); beta = nb; if (diff < 1e-7) break;
  }
  const mu = X.map((x) => Math.exp(Math.max(-12, Math.min(12, x.reduce((t, v, j) => t + v * beta[j], 0)))));
  const pearson = y.reduce((t, v, i) => t + (v - mu[i]) ** 2 / Math.max(mu[i], 1e-6), 0), phi = Math.max(1, pearson / Math.max(1, n - p));
  return { beta, phi, mu };
}
const dev = (y, mu) => 2 * y.reduce((t, v, i) => t + (v > 0 ? v * Math.log(v / mu[i]) : 0) - (v - mu[i]), 0);

function fit() {
  const rows = readFileSync(RUNS, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)), out = { v: 2, made: 'tools/make_menu_expect.mjs', basins: {} };
  for (const b of ALL) {
    const R = rows.filter((r) => r.b === b); if (R.length < 30) { console.log(`${b}: ${R.length} seasons, not enough`); continue; }
    const base = R.filter((r) => r.kind === 'base'), fold = (r) => (R.indexOf(r) % 5);
    const mean = (a, k) => a.reduce((t, r) => t + r[k], 0) / Math.max(1, a.length), sd = (a, k) => { const m = mean(a, k); return Math.sqrt(a.reduce((t, r) => t + (r[k] - m) ** 2, 0) / Math.max(1, a.length - 1)); };
    // which form of model predicts the seasons it did not see best: five-fold cross-validation of the deviance, summed over the four counts
    const cv = {}; for (const name in SPECS) {
      cv[name] = 0;
      for (let f = 0; f < 5; f++) { const tr = R.filter((r) => fold(r) !== f), te = R.filter((r) => fold(r) === f);
        for (const m of METRICS) { const g = glm(tr.map((r) => featuresOf(r, SPECS[name])), tr.map((r) => r[m]), 0.05), mu = te.map((r) => Math.exp(Math.max(-12, Math.min(12, featuresOf(r, SPECS[name]).reduce((t, v, j) => t + v * g.beta[j], 0))))), ymean = Math.max(1e-9, mean(te, m)); cv[name] += dev(te.map((r) => r[m]), mu) / Math.max(1e-9, dev(te.map((r) => r[m]), te.map(() => ymean))) / 5; } }
    }
    const best = Object.keys(cv).sort((x, y) => cv[x] - cv[y])[0], spec = SPECS[best];
    const entry = { n: R.length, nBase: base.length, spec, form: best, base: {}, baseSd: {}, coef: {}, phi: {}, held: {} };
    for (const m of METRICS) {
      entry.base[m] = +mean(base, m).toFixed(3); entry.baseSd[m] = +sd(base, m).toFixed(3);
      const full = glm(R.map((r) => featuresOf(r, spec)), R.map((r) => r[m]), 0.05);
      entry.coef[m] = full.beta.map((v) => +v.toFixed(4)); entry.phi[m] = +full.phi.toFixed(2);
      const te = R.filter((r) => fold(r) === 4), tr = R.filter((r) => fold(r) !== 4), g = glm(tr.map((r) => featuresOf(r, spec)), tr.map((r) => r[m]), 0.05), pred = te.map((r) => Math.exp(featuresOf(r, spec).reduce((t, v, j) => t + v * g.beta[j], 0)));
      const ym = mean(te, m), pm = pred.reduce((t, v) => t + v, 0) / Math.max(1, pred.length);
      entry.held[m] = { obs: +ym.toFixed(2), pred: +pm.toFixed(2), dev: +(1 - dev(te.map((r) => r[m]), pred) / Math.max(1e-9, dev(te.map((r) => r[m]), te.map(() => Math.max(ym, 1e-9))))).toFixed(2) };
    }
    out.basins[b] = entry;
    console.log(`${b}: ${R.length} seasons (${base.length} at the normal settings); form ${best} (cv ${Object.keys(cv).map((k) => k + ' ' + cv[k].toFixed(2)).join(', ')}); normal ${METRICS.map((m) => m + ' ' + entry.base[m]).join(', ')}; held out ${METRICS.map((m) => m + ' ' + entry.held[m].pred + '/' + entry.held[m].obs + ' (' + entry.held[m].dev + ')').join(', ')}`);
  }
  writeFileSync(OUT, JSON.stringify(out));
  console.log('wrote ' + OUT);
}

if (cmd === 'run') await run(); else if (cmd === 'fit') fit(); else { console.error('node tools/make_menu_expect.mjs run [basin ...] [--runs N] [--base N] [--workers K] | fit'); process.exit(1); }
