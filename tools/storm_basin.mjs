// Whole seasons of any basin page through the built page, for any number of storm-engine parameter sets at once, against the real best track of that basin.
//
//   node tools/storm_basin.mjs <basin> --seeds 1-48 [--sets sets.json] [--maps maps.json] [--pages 4] [--slider warming=1.5 ...] [--out raw.json]
//   node tools/storm_basin.mjs <basin> --from raw.json                    (summarise a saved run again, no browser)
//
// The same lab as tools/storm_mc.mjs (every parameter set sees the same weather and the same waves of one seed), with a season that is a whole year long and starts on the basin's first day
// (tools/tc_basins.json), and the reference of data/generated/<basin>-tc-ref.json (tools/make_tc_basin.py: by wind, the storms that form inside the page). Needs `npm run build` and, in a sandbox,
// PLAYWRIGHT_CHROMIUM_PATH.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import '../src/storms.js';
import { runLab, TCB, ACT_ELASTICITY } from './storm_mc.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const sd = (a) => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
const quant = (a, q) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y), p = (s.length - 1) * q, i = Math.floor(p); return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (p - i); };
const f1 = (x, n = 1) => (Number.isFinite(x) ? x.toFixed(n) : '-');
export const loadRef = (basin) => JSON.parse(readFileSync(join(ROOT, `data/generated/${basin}-tc-ref.json`), 'utf8'));

/* The season's activity factor (a random draw per seed and season, par.act) is the largest single source of noise in a few dozen seasons' counts: counts are reported at the activity of an average season,
   from the mean activity of the seeds actually run (weighted by the real monthly profile of depressions) and the elasticity of the counts to it (tools/storm_mc.mjs). */
export function meanActivity(seasons, basin, ref, days = 365) {
  const H = globalThis.HFStorms, par = H.defaultParams(basin), B = TCB[basin], W = ref.genesis.depression_by_month;
  const t0 = Date.UTC(new Date().getUTCFullYear(), B.start[0], B.start[1]);
  let tot = 0;
  for (const s of seasons) {
    const seed = ((s.seed * 2654435761) ^ 0x517171) >>> 0; let a = 0, w = 0;
    for (let h = 0; h < days * 24; h += 6) { const d = new Date(t0 + h * 3600000), wt = W[d.getUTCMonth()], sy = H.seasonYearOf(d.getTime(), B.seasonMonth); a += wt * H.activityFactor(par, seed, sy, h); w += wt; }
    tot += a / w;
  }
  return tot / seasons.length;
}

export function summarize(raw, basin) {
  const ref = loadRef(basin), res = {};
  for (const name of raw.names) {
    const S = raw.seasons.map((s) => ({ n34: mean(s.n34), r: s.sets[name] }));
    const st = (k) => S.map((s) => s.r.stats[k]);
    const storms = S.flatMap((s) => s.r.storms), named = storms.filter((x) => x.named), n = S.length;
    const win = storms.reduce((a, x) => a + x.win, 0), ri = storms.reduce((a, x) => a + x.ri, 0), hurr = storms.filter((x) => x.peak >= 65);
    const o = {
      seasons: n, dep: mean(st('dep')), named: mean(st('named')), hurr: mean(st('hurr')), major: mean(st('major')), cat5: mean(st('cat5')), ace: mean(st('ace')),
      sd: { named: sd(st('named')), hurr: sd(st('hurr')), major: sd(st('major')), ace: sd(st('ace')) }, aceRange: [Math.min(...st('ace')), Math.max(...st('ace'))],
      hurrOfNamed: named.length ? named.filter((x) => x.peak >= 65).length / named.length : NaN, majorOfNamed: named.length ? named.filter((x) => x.peak >= 96).length / named.length : NaN,
      cat5OfNamed: named.length ? named.filter((x) => x.peak >= 137).length / named.length : NaN, namedOfDep: storms.length ? named.length / storms.length : NaN,
      namedByMonth: Array.from({ length: 12 }, (_, m) => mean(S.map((s) => s.r.namedByMonth[m]))), depByMonth: Array.from({ length: 12 }, (_, m) => mean(S.map((s) => s.r.depByMonth[m]))),
      aceByMonth: Array.from({ length: 12 }, (_, m) => mean(S.map((s) => s.r.aceByMonth[m]))),
      riFrac: win ? ri / win : NaN, riOfHurr: hurr.length ? hurr.filter((x) => x.riAny).length / hurr.length : NaN,
      namedDays: mean(named.map((x) => x.hours / 24)), short2d: named.length ? named.filter((x) => x.hours < 48).length / named.length : NaN,
      etOfNamed: named.length ? named.filter((x) => x.et).length / named.length : NaN, ssPerYear: storms.filter((x) => x.subNamed).length / n,
      depLat: [0.02, 0.05, 0.1, 0.25, 0.5, 0.75, 0.95].map((q) => quant(storms.filter((x) => x.gen).map((x) => x.gen[0]), q)),
      genLat: [0.05, 0.25, 0.5, 0.75, 0.95].map((q) => quant(named.filter((x) => x.genN).map((x) => x.genN[0]), q)), genLon: [0.05, 0.25, 0.5, 0.75, 0.95].map((q) => quant(named.filter((x) => x.genN).map((x) => x.genN[1]), q)),
      peakMean: mean(named.map((x) => x.peak)), maxLat: quant(named.map((x) => Math.abs(x.maxLat)), 0.9),
      hurrLat: [0.01, 0.05, 0.25, 0.5, 0.75].map((q) => quant(storms.flatMap((x) => x.rows).filter((r) => r[2] >= 64 && r[8] % 6 === 0).map((r) => Math.abs(r[0])), q)),
    };
    const lw = S.flatMap((s) => s.r.lows || []).filter((x) => x[1] >= 3); o.lowsPerSeason = lw.length / n;
    const ends = {}; for (const x of named) { const k = (x.end || '').replace(/ .*/, '') || '?'; ends[k] = (ends[k] || 0) + 1; } o.ends = Object.fromEntries(Object.entries(ends).map(([k, v]) => [k, v / Math.max(1, named.length)]));
    const grp = (f) => S.filter((s) => f(s.n34)), g = (a) => ({ n: a.length, ace: mean(a.map((s) => s.r.stats.ace)), named: mean(a.map((s) => s.r.stats.named)) });
    o.enso = { el: g(grp((x) => x > 0.5)), neutral: g(grp((x) => x >= -0.5 && x <= 0.5)), la: g(grp((x) => x < -0.5)) };
    o.enso.ratio = o.enso.el.n && o.enso.la.n ? o.enso.la.ace / o.enso.el.ace : NaN;
    const slopeOf = (xs, ys) => { const mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0; xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; }); return sxx > 0 ? sxy / sxx : NaN; };
    o.ensoSlope = slopeOf(S.map((s) => s.n34), S.map((s) => Math.log(s.r.stats.ace + 10)));
    o.ensoNamed = slopeOf(S.map((s) => s.n34), S.map((s) => Math.log(s.r.stats.named + 1)));
    o.ensoDep = slopeOf(S.map((s) => s.n34), S.map((s) => Math.log(s.r.stats.dep + 1)));
    { const P = S.filter((s) => s.r.storms.filter((x) => x.gen).length >= 2), place = (s, k) => mean(s.r.storms.filter((x) => x.gen).map((x) => x.gen[k]));       // where the season's depressions formed, on average: degrees per degree of the index
      o.ensoLon = slopeOf(P.map((s) => s.n34), P.map((s) => place(s, 1))); o.ensoLat = slopeOf(P.map((s) => s.n34), P.map((s) => place(s, 0))); }
    res[name] = o;
  }
  return { ref, res };
}

/* the real ACE of each calendar month, from the cumulative curve by day of the season (a 365-day year starting on the basin's first day) */
export function refAceByMonth(ref) {
  const A = ref.ace_curve.mean, M = ref.meta.seasonMonth, out = new Array(12).fill(0);
  for (let d = 0; d < 365; d++) out[new Date(Date.UTC(2001, M, 1 + d)).getUTCMonth()] += A[d] - (d ? A[d - 1] : 0);
  return out;
}

export function report(raw, basin, only) {
  const { ref, res } = summarize(raw, basin), names = only || raw.names, L = [], B = TCB[basin], n = ref.normals, g = ref.genesis;
  const row = (label, vals, refv) => L.push(label.padEnd(34) + vals.map((v) => String(v).padStart(12)).join('') + (refv === undefined ? '' : '   | ' + refv));
  const col = (f, d = 1) => names.map((k) => f1(f(res[k]), d));
  L.push(`${basin}: ${raw.seasons.length} seasons of ${raw.days} days from month ${B.start[0] + 1} day ${B.start[1]}`.padEnd(34) + names.map((k) => k.slice(0, 11).padStart(12)).join('') + `   | real ${n.years.join('-')} (storms formed inside the page)`);
  row('depressions (25 kt or more)', col((o) => o.dep), f1(n.tracks));
  row('named storms (34 kt)', col((o) => o.named), f1(n.named));
  row('hurricane-strength (64 kt)', col((o) => o.hurr), f1(n.hurricanes));
  row('major (96 kt)', col((o) => o.major), f1(n.majors));
  row('category 5 (137 kt)', col((o) => o.cat5, 2), f1(n.cat5, 2));
  row('ACE', col((o) => o.ace, 0), f1(n.ace_mean, 0));
  { const c = 1 - ACT_ELASTICITY * (meanActivity(raw.seasons, basin, ref, raw.days) - 1);
    row(`at an average season (seeds ${f1(meanActivity(raw.seasons, basin, ref, raw.days), 2)})`, names.map((k) => `${f1(res[k].dep * c)}/${f1(res[k].named * c)}/${f1(res[k].hurr * c)}/${f1(res[k].major * c)}/${f1(res[k].ace * c, 0)}`), `dep/named/hurr/major/ACE, counts x ${f1(c, 3)}`); }
  row('SD named / hurr / major', names.map((k) => `${f1(res[k].sd.named)}/${f1(res[k].sd.hurr)}/${f1(res[k].sd.major)}`), `${f1(n.ns_sd)}/${f1(n.h_sd)}/${f1(n.mh_sd)}`);
  row('SD ACE, min..max', names.map((k) => `${f1(res[k].sd.ace, 0)} ${f1(res[k].aceRange[0], 0)}..${f1(res[k].aceRange[1], 0)}`), `${f1(n.ace_sd, 0)}, ${f1(n.ace_min, 0)}..${f1(n.ace_max, 0)}`);
  row('hurricane share of named', col((o) => o.hurrOfNamed, 2), f1(ref.peak.frac_ge64, 2));
  row('major share of named', col((o) => o.majorOfNamed, 2), f1(ref.peak.frac_ge96, 2));
  row('cat 5 share of named', col((o) => o.cat5OfNamed, 3), f1(ref.peak.frac_ge137, 3));
  row('named share of depressions', col((o) => o.namedOfDep, 2), f1(g.named_of_depressions, 2));
  row('mean peak of named (kt)', col((o) => o.peakMean, 0), f1(ref.peak.mean, 0));
  if (ref.hurr_rows) row('|lat| of 64-kt rows q1/5/25/50/75', names.map((k) => res[k].hurrLat.map((x) => f1(x, 0)).join('/')), ref.hurr_rows.abslat_quantiles.map((x) => f1(x, 0)).join('/'));
  row('RI share of 24-h windows', col((o) => o.riFrac, 3), f1(ref.intensity_change.ri_frac_all, 3));
  row('hurricanes with RI', col((o) => o.riOfHurr, 2), f1(ref.intensity_change.ri_track_fractions.HU.frac, 2));
  row('mean named days / <2 d share', names.map((k) => `${f1(res[k].namedDays, 1)}/${f1(res[k].short2d, 2)}`), `${ref.lifetime.mean_named_days}/${ref.lifetime.short_lived_lt_2d}`);
  row('extratropical share of named', col((o) => o.etOfNamed, 2), f1(ref.status.et_fraction_of_named, 2));
  row('subtropical named a year', col((o) => o.ssPerYear, 2), f1(ref.status.subtropical_storms_per_year, 2));
  row('depression lat q2/5/10/25/50/75/95', names.map((k) => res[k].depLat.map((x) => f1(x, 0)).join('/')), g.depression_lat_quantiles.map((x) => f1(x, 0)).join('/'));
  row('named lat q5/25/50/75/95', names.map((k) => res[k].genLat.map((x) => f1(x, 0)).join('/')), g.named_lat_quantiles.map((x) => f1(x, 0)).join('/'));
  row('named lon q5/25/50/75/95', names.map((k) => res[k].genLon.map((x) => f1(x, 0)).join('/')), g.named_lon_quantiles.map((x) => f1(x, 0)).join('/'));
  L.push('\nnamed storms by calendar month (Jan..Dec)   real: ' + g.named_by_month.map((x) => f1(x, 2).padStart(5)).join(' '));
  for (const k of names) L.push('  ' + k.padEnd(18) + res[k].namedByMonth.map((x) => f1(x, 2).padStart(5)).join(' '));
  L.push('depressions by calendar month   real: ' + g.depression_by_month.map((x) => f1(x, 2).padStart(5)).join(' '));
  for (const k of names) L.push('  ' + k.padEnd(18) + res[k].depByMonth.map((x) => f1(x, 2).padStart(5)).join(' '));
  const ra = refAceByMonth(ref), tr = ra.reduce((a, b) => a + b, 0);
  L.push('ACE by calendar month (% of the total)   real: ' + ra.map((x) => f1(100 * x / tr, 0).padStart(4)).join(' '));
  for (const k of names) { const a = res[k].aceByMonth, t = a.reduce((x, y) => x + y, 0); L.push('  ' + k.padEnd(18) + a.map((x) => f1(100 * x / t, 0).padStart(4)).join(' ')); }
  const e = ref.enso;
  L.push(`\nENSO (Nino 3.4 over months ${e.months.join('/')} above +0.5 / neutral / below -0.5): seasons, mean ACE; real ${[e.elnino, e.neutral, e.lanina].map((x) => `${x.n}: ${f1(x.ace, 0)}`).join('   ')}  La Nina / El Nino ${e.ace_ratio_lanina_over_elnino}, slope of ln(ACE+10) ${e.slope_ln_ace10} (r ${e.r_ln_ace10})`);
  for (const k of names) { const x = res[k].enso; L.push(`  ${k.padEnd(18)} ${[x.el, x.neutral, x.la].map((q) => `${q.n}: ${f1(q.ace, 0)}`).join('   ')}   ratio ${f1(x.ratio, 2)}   slope ${f1(res[k].ensoSlope, 2)}`); }
  if (e.slope_lon != null) {
    L.push(`  per degree of the index: ln(named + 1) real ${e.slope_ln_named}, ln(depressions + 1) real ${e.slope_ln_dep}; where the depressions form: longitude real ${e.slope_lon} (r ${e.r_lon}), latitude real ${e.slope_lat} (r ${e.r_lat})`);
    for (const k of names) L.push(`  ${k.padEnd(18)} named ${f1(res[k].ensoNamed, 3)}   depressions ${f1(res[k].ensoDep, 3)}   longitude ${f1(res[k].ensoLon, 2)}   latitude ${f1(res[k].ensoLat, 2)}`);
  }
  L.push('\nhow named storms end (share): ' + Object.entries(res[names[0]].ends).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${f1(100 * v, 0)}%`).join(', ') + `; the 90th percentile of the latitude a named storm reaches: ${f1(res[names[0]].maxLat, 0)}; tracked lows a season ${f1(res[names[0]].lowsPerSeason, 0)}`);
  return L.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2), basin = a[0], get = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
  if (!TCB[basin]) { console.error('usage: node tools/storm_basin.mjs <' + Object.keys(TCB).join('|') + '> --seeds 1-48 ...'); process.exit(1); }
  let raw;
  if (get('from')) raw = JSON.parse(readFileSync(get('from'), 'utf8'));
  else {
    const range = get('seeds', '1-12').split('-').map(Number), seeds = []; for (let s = range[0]; s <= (range[1] ?? range[0]); s++) seeds.push(s);
    const sets = get('sets') ? JSON.parse(readFileSync(get('sets'), 'utf8')) : { base: {} }, t0 = Date.now();
    const sliders = Object.fromEntries(a.flatMap((x, i) => (x === '--slider' ? [a[i + 1].split('=')] : [])).map(([k, v]) => [k, +v]));
    raw = await runLab({ seeds, days: +get('days', 365), sets, pages: +get('pages', 4), sliders, basin, maps: get('maps') ? JSON.parse(readFileSync(get('maps'), 'utf8')) : null, diag: a.includes('--diag'), onSeed: (s, n) => process.stderr.write(`\rseason ${n}/${seeds.length} (seed ${s}) ${((Date.now() - t0) / 1000).toFixed(0)} s   `) });
    process.stderr.write('\n');
    if (get('out')) writeFileSync(get('out'), JSON.stringify(raw));
  }
  console.log(report(raw, basin, get('only') ? get('only').split(',') : undefined));
}
