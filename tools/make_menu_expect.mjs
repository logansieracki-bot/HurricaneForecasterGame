#!/usr/bin/env node
// Calibrates the "Expected" section of the main menu: what a season of a basin holds (named storms, hurricanes, majors, ACE) under the settings the player chose.
// The numbers are not guessed from the real record: they are what the game itself makes. Whole seasons are played through the built page of each basin (dist/, node tools/build.mjs first),
// in the way the menu starts it (the sliders of the settings, the activity, an El Nino or La Nina held at the start, free to drift or locked), for a space-filling design of settings
// (a Halton sequence over warmth, shear, moisture, activity, the ENSO state and its influence, and how the ENSO state is kept) and for a set of seasons at the normal settings.
// Each season's counts are one line of data/generated/menu-expect-runs.jsonl. `fit` turns them into one response model per basin and count (a quasi-Poisson regression with a log link: the
// number of storms is multiplied by what each setting does, zeros are fine) and writes data/generated/menu-expect.json, which tools/build.mjs puts into index.html.
//   node tools/make_menu_expect.mjs run [basin ...] [--runs 150] [--base 40] [--workers 3] [--dist dist]       plays the seasons (resumes: what is in the file is not played again)
//   node tools/make_menu_expect.mjs fit                                                            fits the models and writes menu-expect.json
//   node tools/make_menu_expect.mjs validate [basin ...] [--seeds 10] [--workers 3] [--dist dist]    plays ten new seasons of each of ten scenarios (not in the design) and compares them with the model's means and ranges
//   basins: atlantic epac wpac nio swio aus spac satl med   (the menu's ids)
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SPECS, featuresOf, glm, dev, predict, countRange, aceRange, fitVariance } from './menu_expect_lib.mjs';
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
// (the page's applySeed keeps a seed between 1 and 999999: a larger one is the same season whatever it is, which the first run of this tool did not know and played four basins' normal seasons forty times each)
const MAXSEED = 999999, fitSeed = (s) => (s <= MAXSEED ? s : s - 480000);
const baseline = (basin, i) => ({ b: basin, i, kind: 'base', W: 0, S: 0, M: 0, A: 1, E: 0, I: null, mode: 'random', seed: fitSeed(500000 + 104729 * ALL.indexOf(basin) + 17 * i) });

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
  if (tasks.some((t) => !(t.seed >= 1 && t.seed <= MAXSEED))) throw new Error('a seed outside 1..' + MAXSEED + ' is clamped by the page: every such season would be the same one');
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
function fit() {
  const rows = readFileSync(RUNS, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)), out = { v: 2, made: 'tools/make_menu_expect.mjs', basins: {} };
  for (const b of ALL) {
    const R = rows.filter((r) => r.b === b); if (R.length < 30) { console.log(`${b}: ${R.length} seasons, not enough`); continue; }
    const base = R.filter((r) => r.kind === 'base'), fold = (r) => (R.indexOf(r) % 5);
    const mean = (a, k) => a.reduce((t, r) => t + r[k], 0) / Math.max(1, a.length), sd = (a, k) => { const m = mean(a, k); return Math.sqrt(a.reduce((t, r) => t + (r[k] - m) ** 2, 0) / Math.max(1, a.length - 1)); };
    // which form of model predicts the seasons it did not see best: five-fold cross-validation of the deviance, summed over the four counts
    const rare = mean(base, 'named') < 0.3, forms = rare ? ['rare'] : Object.keys(SPECS).filter((k) => k !== 'rare');          // (a basin whose normal seasons are empty has no mean to fit a constant to: the South Atlantic's are not, since 0.8 named storms in a season is what the page makes of it, but the rule stays for a basin whose are)
    const live = (m) => R.filter((r) => r[m] > 0).length >= 15;          // (a count that is nearly always zero is not modelled below, and its deviance, a ratio to one that is nearly zero, cannot choose a form)
    const cv = {}; for (const name of forms) {
      cv[name] = 0;
      for (let f = 0; f < 5; f++) { const tr = R.filter((r) => fold(r) !== f), te = R.filter((r) => fold(r) === f);
        for (const m of METRICS) { if (!live(m)) continue; const g = glm(tr.map((r) => featuresOf(r, SPECS[name])), tr.map((r) => r[m]), 0.05), mu = te.map((r) => Math.exp(Math.max(-12, Math.min(12, featuresOf(r, SPECS[name]).reduce((t, v, j) => t + v * g.beta[j], 0))))), ymean = Math.max(1e-9, mean(te, m)); cv[name] += dev(te.map((r) => r[m]), mu) / Math.max(1, dev(te.map((r) => r[m]), te.map(() => ymean))) / 5; } }
    }
    let best = Object.keys(cv).sort((x, y) => cv[x] - cv[y])[0];
    if ((best === 'flat' || best === 'lin') && cv.quad != null && cv.quad <= 1.05 * cv[best]) best = 'quad';          // (within the noise of the cross-validation the curvature stays: the El Nino's effect on the South Pacific saturates, and the seasons that were not in the design showed it)
    const spec = SPECS[best];
    const entry = { n: R.length, nBase: base.length, spec, form: best, base: {}, baseSd: {}, coef: {}, phi: {}, held: {} };          // (phi: the variance function of each count)
    for (const m of METRICS) {
      entry.base[m] = +mean(base, m).toFixed(3); entry.baseSd[m] = +sd(base, m).toFixed(3);
      let full;
      if (rare) {                                                                                           // the intercept is the normal seasons' own mean (a floor under it), the rest is fitted round it
        const target = Math.max(mean(base, m), { named: 0.02, hurr: 0.01, major: 0.005, ace: 0.05 }[m]), rest = spec.slice(1);
        full = glm(R.map((r) => featuresOf(r, rest)), R.map((r) => r[m]), 0.05, R.map(() => Math.log(target)));
        full.beta = [Math.log(target)].concat(full.beta);
      } else full = glm(R.map((r) => featuresOf(r, spec)), R.map((r) => r[m]), 0.05);
      entry.coef[m] = full.beta.map((v) => +v.toFixed(4));
      if (!rare && R.filter((r) => r[m] > 0).length < 15) entry.coef[m] = entry.coef[m].map((v, j) => (j === 0 ? +Math.log(Math.max(mean(base, m), 0.004)).toFixed(4) : 0));          // (a count that is nearly always zero, as the South Atlantic's, has too few seasons with anything in them to say what the settings do: it stays at its normal)
      const sub = (rand) => R.map((r, k) => [r, k]).filter(([r]) => (r.mode === 'random') === rand), vf = (rand) => fitVariance(sub(rand).map(([r]) => r[m]), sub(rand).map(([, k]) => full.mu[k]));
      entry.phi[m] = { r: vf(true), c: vf(false) };          // the variance round the mean (a * mean + b * mean squared) for a season whose ENSO is left to chance and for one whose ENSO was chosen
      const te = R.filter((r) => fold(r) === 4), tr = R.filter((r) => fold(r) !== 4), g = rare ? { beta: [entry.coef[m][0]].concat(glm(tr.map((r) => featuresOf(r, spec.slice(1))), tr.map((r) => r[m]), 0.05, tr.map(() => entry.coef[m][0])).beta) } : glm(tr.map((r) => featuresOf(r, spec)), tr.map((r) => r[m]), 0.05), pred = te.map((r) => Math.exp(featuresOf(r, spec).reduce((t, v, j) => t + v * g.beta[j], 0)));
      const ym = mean(te, m), pm = pred.reduce((t, v) => t + v, 0) / Math.max(1, pred.length);
      entry.held[m] = { obs: +ym.toFixed(2), pred: +pm.toFixed(2), dev: live(m) ? +(1 - dev(te.map((r) => r[m]), pred) / Math.max(1, dev(te.map((r) => r[m]), te.map(() => Math.max(ym, 1e-9))))).toFixed(2) : null };          // (null: too few seasons with anything in them to say)
    }
    out.basins[b] = entry;
    console.log(`${b}: ${R.length} seasons (${base.length} at the normal settings); form ${best} (cv ${Object.keys(cv).map((k) => k + ' ' + cv[k].toFixed(2)).join(', ')}); normal ${METRICS.map((m) => m + ' ' + entry.base[m]).join(', ')}; held out ${METRICS.map((m) => m + ' ' + entry.held[m].pred + '/' + entry.held[m].obs + ' (' + entry.held[m].dev + ')').join(', ')}`);
  }
  // the printed range is meant to hold 8 seasons in 10: the scale that makes it so over all the seasons played (a log-normal and a negative binomial are not quite the shape of these)
  out.rangeScale = {};
  for (const m of METRICS) {
    out.rangeScale[m] = {};
    for (const grp of ['r', 'c']) {
      const G = rows.filter((r) => out.basins[r.b] && (r.mode === 'random') === (grp === 'r')); let best = 1, bd = 9;
      for (let kz = 0.5; kz <= 2.2001; kz += 0.05) { let hit = 0; for (const r of G) { const E = out.basins[r.b], p = predict(E, { W: r.W, S: r.S, M: r.M, A: r.A, E: r.E, I: r.I == null ? 1 : r.I, mode: r.mode }), [lo, hi] = m === 'ace' ? aceRange(p.ace, E.phi.ace[grp], kz) : countRange(p[m], E.phi[m][grp], kz); if (r[m] >= lo && r[m] <= hi) hit++; } const d = Math.abs(hit / G.length - 0.8); if (d < bd) { bd = d; best = kz; } }
      out.rangeScale[m][grp] = +best.toFixed(2);
    }
  }
  console.log('range scales (random ENSO / chosen): ' + METRICS.map((m) => m + ' ' + out.rangeScale[m].r + '/' + out.rangeScale[m].c).join(', '));
  writeFileSync(OUT, JSON.stringify(out));
  console.log('wrote ' + OUT);
}

/* ---- the check against seasons that were not in the design: ten scenarios a player would try, ten new seasons of each ---- */
const SCENARIOS = [
  ['normal', {}], ['ocean 2 °C warmer', { W: 2 }], ['shear +10 kt', { S: 10 }], ['moisture −8 %', { M: -8 }], ['activity ×2', { A: 2 }], ['El Niño +2, locked', { E: 2, mode: 'locked' }], ['La Niña −2, locked', { E: -2, mode: 'locked' }],
  ['warm +1.5 °C, shear −6 kt', { W: 1.5, S: -6 }], ['cool −1.5 °C, shear +8 kt, moisture −5 %', { W: -1.5, S: 8, M: -5 }], ['El Niño +1.5 drifting, activity ×1.5, moisture +5 %', { E: 1.5, mode: 'drift', A: 1.5, M: 5 }],
];
async function validate() {
  const { chromium } = await import('playwright'), J = JSON.parse(readFileSync(OUT, 'utf8'));
  const which = process.argv.slice(3).filter((a, i, v) => !a.startsWith('--') && !(i > 0 && v[i - 1].startsWith('--'))), basins = which.length ? which : ALL, nSeeds = arg('seeds', 10), workers = arg('workers', 3);
  const tasks = []; for (const b of basins) SCENARIOS.forEach(([name, o], si) => { for (let k = 0; k < nSeeds; k++) tasks.push(Object.assign({ b, kind: 'check', i: si * 100 + k, W: 0, S: 0, M: 0, A: 1, E: 0, I: null, mode: 'random', seed: 800000 + 1009 * ALL.indexOf(b) + 53 * si + 7 * k, name }, o)); });
  if (tasks.some((t) => !(t.seed >= 1 && t.seed <= MAXSEED))) throw new Error('a seed outside 1..' + MAXSEED + ' is clamped by the page');
  const res = []; let next = 0;
  async function worker() {
    const browser = await chromium.launch(); let page = null, pageOf = null, n = 0;
    while (true) {
      const j = next++; if (j >= tasks.length) break; const q = tasks[j];
      if (!page || pageOf !== q.b || n >= 20) { if (page) await page.close(); page = await browser.newPage({ viewport: { width: 1280, height: 800 } }); await page.route('**://**/*', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort())); await page.goto('file://' + join(DIST, PAGE[q.b] + '-sst-simulator.html'), { waitUntil: 'load', timeout: 90000 }); await page.waitForFunction(() => window.__ready === true, { timeout: 60000 }); pageOf = q.b; n = 0; }
      try { res.push(Object.assign({}, q, await page.evaluate(inPage, q))); n++; } catch (e) { console.error('failed', q.b, q.name, e.message.slice(0, 120)); page = null; }
    }
    await browser.close();
  }
  await Promise.all(Array.from({ length: workers }, () => worker()));
  const out = {};
  for (const b of basins) {
    const E = J.basins[b]; if (!E) continue; const rows = [];
    for (const [name, o] of SCENARIOS) {
      const R = res.filter((r) => r.b === b && r.name === name); if (!R.length) continue;
      const q = Object.assign({ W: 0, S: 0, M: 0, A: 1, E: 0, I: 1, mode: 'random' }, o), p = predict(E, q), m = (k) => R.reduce((t, r) => t + r[k], 0) / R.length;
      const g = q.mode === 'random' ? 'r' : 'c', inR = (k, v) => { const [lo, hi] = k === 'ace' ? aceRange(p.ace, E.phi.ace[g], J.rangeScale.ace[g]) : countRange(p[k], E.phi[k][g], J.rangeScale[k][g]); return v >= lo && v <= hi; };
      rows.push({ name, n: R.length, pred: { named: +p.named.toFixed(2), ace: Math.round(p.ace) }, obs: { named: +m('named').toFixed(2), ace: Math.round(m('ace')) }, within: { named: R.filter((r) => inR('named', r.named)).length / R.length, ace: R.filter((r) => inR('ace', r.ace)).length / R.length } });
    }
    const lr = (k) => rows.reduce((t, r) => t + Math.abs(Math.log((r.pred[k] + 0.3) / (r.obs[k] + 0.3))), 0) / rows.length, cov = (k) => rows.reduce((t, r) => t + r.within[k], 0) / rows.length;
    out[b] = { rows, meanAbsLogRatio: { named: +lr('named').toFixed(3), ace: +lr('ace').toFixed(3) }, within: { named: +cov('named').toFixed(2), ace: +cov('ace').toFixed(2) } };
    console.log(`${b}: mean |log(predicted/observed)| named ${out[b].meanAbsLogRatio.named}, ACE ${out[b].meanAbsLogRatio.ace}; seasons inside the printed range: named ${out[b].within.named}, ACE ${out[b].within.ace}`);
    for (const r of rows) console.log(`   ${r.name.padEnd(52)} named ${String(r.pred.named).padStart(5)} / ${String(r.obs.named).padStart(5)}   ACE ${String(r.pred.ace).padStart(4)} / ${String(r.obs.ace).padStart(4)}   in range ${r.within.named.toFixed(1)}/${r.within.ace.toFixed(1)}`);
  }
  writeFileSync(join(ROOT, 'data/generated/menu-expect-validation.json'), JSON.stringify(out));
}

if (cmd === 'run') await run(); else if (cmd === 'fit') fit(); else if (cmd === 'validate') await validate(); else { console.error('node tools/make_menu_expect.mjs run [basin ...] [--runs N] [--base N] [--workers K] [--dist DIR] | fit | validate [basin ...] [--seeds N] [--workers K] [--dist DIR]'); process.exit(1); }
