// Monte-Carlo of whole Atlantic seasons through the built page, for any number of storm-engine parameter sets at once.
//
//   node tools/storm_mc.mjs --seeds 1-24 --sets sets.json [--maps maps.json] [--days 214] [--pages 4] [--page built.html] [--slider warming=1.5 ...] [--out raw.json]
//   node tools/storm_mc.mjs --from raw.json                  (summarise a saved run again, no browser)
//   --diag keeps the engine's accumulators (exposure, genesis, the anomaly part of the motion) in the output, for tools/storm_fit.mjs and the motion check
//
// sets.json maps a name to a partial parameter set (merged over HFStorms.defaultParams()): {"base": {}, "shear26": {"shearScale": 26}}.
// Every set runs inside the SAME page on the SAME keyframes with the same seed (SSTSIM.stormLabStart), so a comparison sees identical
// weather and identical waves; the environment (13-39 ms per simulated day) is paid once, not once per set. A season here is the 214
// days from Jun 1 to Dec 31 of the page's first year, which is the whole real season but for the few storms of Jan-May, and the
// reference is cut the same way (cumulative curves of data/generated/atlantic-tc-ref.json from Jun 1 to the end of the year).
// Needs `npm run build` first and, in a sandbox, PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import '../src/storms.js';                                              // sets globalThis.HFStorms (the activity factor of a seed, see meanActivity)
import { etStats, etReal, etLines } from './storm_et.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REF = JSON.parse(readFileSync(join(ROOT, 'data/generated/atlantic-tc-ref.json'), 'utf8'));
export const FATE_BINS = [[0, 13], [13, 17], [17, 25], [25, 70]];                 // latitude of the first tropical fix: the real best track's share of depressions that become named storms / hurricanes / majors in each (atlantic-tc-validate.json)

/* ---- running ------------------------------------------------------------------------------------------------------------------ */
export async function runLab({ seeds, days = 214, sets, pages = 4, sliders = {}, page: pagePath = join(ROOT, 'dist/atlantic-sst-simulator.html'), onSeed = () => {}, maps = null, diag = false, clim = null, extraDays = 0 }) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
  const names = Object.keys(sets), list = names.map((k) => sets[k]);
  const out = [], queue = seeds.slice();
  const worker = async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
    await page.route('**://**/*', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
    await page.goto(pathToFileURL(pagePath).href, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, { timeout: 60000 });
    while (queue.length) {
      const seed = queue.shift();
      const rec = await page.evaluate(({ seed, days, list, sliders, maps, diag, clim, extraDays }) => {
        const S = window.SSTSIM;
        S.setPlaying(false); S.applySeed(seed); S.setPlaying(false); S.stormAuto(true);
        for (const [k, v] of Object.entries(sliders)) S.set(k, v);                 // e.g. warming, moisture, shearShift: the page's own experiment sliders
        S.stormMaps(maps);                                                         // null: the maps the page was built with
        S.stormLabStart(list, { diag });
        if (clim) S.stormClimStart(clim.grid, clim.R);
        // the environment the storms see, averaged over the main development region (10-20N, 80-20W) and Aug-Oct, to compare its year-to-year spread with ERA5's
        const pts = []; for (let la = 10; la <= 20; la += 5) for (let lo = -80; lo <= -20; lo += 5) pts.push([la, lo]);
        const n34 = [], env = { sst: 0, rh: 0, shear: 0, n: 0 }; let d = 0;
        while (d < days) {
          const step = Math.min(8, days - d); S.tick(24 * step); d += step;
          if (d >= 62 && d <= 152) for (const [la, lo] of pts) { const e = S.stormEnvSample(la, lo); if (!e.land && isFinite(e.sst) && isFinite(e.shear)) { env.sst += e.sst; env.rh += e.rh; env.shear += e.shear; env.n++; } }
          if (d === 64 || d === 96 || d === 120) n34.push(S.enso().n34);
        }
        const recs = S.stormLabRecord();
        let diagEnd = null;                                                         // extraDays: keep going (Jan-May of the next year) and report the accumulators again at the end
        if (extraDays) { let e = 0; while (e < extraDays) { const step = Math.min(8, extraDays - e); S.tick(24 * step); e += step; } diagEnd = S.stormLabRecord().map((r) => r.diag); }
        return { seed, n34, env: { sst: env.sst / env.n, rh: env.rh / env.n, shear: env.shear / env.n }, recs, diagEnd, clim: clim ? S.stormClimGet() : null };
      }, { seed, days, list, sliders, maps, diag, clim, extraDays });
      out.push({ seed, n34: rec.n34, env: rec.env, clim: rec.clim, diagEnd: rec.diagEnd, sets: Object.fromEntries(names.map((k, i) => [k, rec.recs[i]])) });
      onSeed(seed, out.length);
    }
    await page.close();
  };
  await Promise.all(Array.from({ length: Math.min(pages, seeds.length) }, worker));
  await browser.close();
  out.sort((a, b) => a.seed - b.seed);
  return { days, names, seasons: out };
}

/* ---- statistics ---------------------------------------------------------------------------------------------------------------- */
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const sd = (a) => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
const quant = (a, q) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y), p = (s.length - 1) * q, i = Math.floor(p); return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (p - i); };
const f1 = (x, n = 1) => (Number.isFinite(x) ? x.toFixed(n) : '-');

// the reference over the same window: Jun 1 .. Dec 31 (day of year 151 .. 365) from the cumulative curves
const MONTH_END = [30, 58, 89, 119, 150, 180, 211, 242, 272, 303, 333, 364];            // day of year (0-based) of the last day of each month
export function refAceByMonth() { const A = REF.ace_curve.mean; return MONTH_END.map((e, i) => A[e] - (i ? A[MONTH_END[i - 1]] : 0)); }
export function refWindow() {
  const A = REF.ace_curve.mean, N = REF.named_curve.mean, n = REF.normals, g = REF.genesis;
  const sum = (a, from) => a.slice(from).reduce((x, y) => x + y, 0);
  const named = N[365] - N[150], ace = A[365] - A[150];
  return { dep: n.tracks - (sum(g.depression_by_month.slice(0, 5), 0)), named, ace, hurr: n.hurricanes, major: n.majors, cat5: n.cat5, namedByMonth: g.named_by_month, depByMonth: g.depression_by_month,
    sd: { named: n.ns_sd, hurr: n.h_sd, major: n.mh_sd, ace: n.ace_sd } };
}

/* The season's activity factor (a random draw per seed and calendar year, see par.act) is the largest single source of noise in a few dozen seasons' counts: with its sd of 0.4 the mean of 72 seasons moves by 5 % from the
   seeds alone (the counts follow it with an elasticity of about one half: it explains 40 % of the variance of a season's depressions). Counts are therefore reported at the activity of an average season, from the mean
   activity of the seeds actually run (weighted by the real monthly profile of depressions) and that elasticity. */
export const ACT_ELASTICITY = 0.55;
export function meanActivity(seasons, par = globalThis.HFStorms.defaultParams()) {
  const H = globalThis.HFStorms, W = [0, 0, 0, 0, 0, 1.0, 1.9, 4.0, 5.0, 2.9, 0.7, 0.2], t0 = Date.UTC(2026, 5, 1);
  let tot = 0;
  for (const s of seasons) {
    const seed = ((s.seed * 2654435761) ^ 0x517171) >>> 0; let a = 0, w = 0;
    for (let h = 0; h < 214 * 24; h += 6) { const d = new Date(t0 + h * 3600000), wt = W[d.getUTCMonth()]; a += wt * H.activityFactor(par, seed, d.getUTCFullYear(), h); w += wt; }
    tot += a / w;
  }
  return tot / seasons.length;
}

export function summarize(raw) {
  const ref = refWindow(), res = {};
  const E = raw.seasons.filter((s) => s.env), envStat = (k) => ({ mean: mean(E.map((s) => s.env[k])), sd: sd(E.map((s) => s.env[k])) });
  ref.envSpread = E.length > 3 ? { sst: envStat('sst'), rh: envStat('rh'), shear: envStat('shear') } : null;
  for (const name of raw.names) {
    const S = raw.seasons.map((s) => ({ n34: mean(s.n34), r: s.sets[name] }));
    const st = (k) => S.map((s) => s.r.stats[k]);
    const storms = S.flatMap((s) => s.r.storms), named = storms.filter((x) => x.named), nSeasons = S.length;
    const hurrStorms = storms.filter((x) => x.peak >= 65);
    const win = storms.reduce((a, x) => a + x.win, 0), ri = storms.reduce((a, x) => a + x.ri, 0);
    const o = {
      seasons: nSeasons, dep: mean(st('dep')), named: mean(st('named')), hurr: mean(st('hurr')), major: mean(st('major')), cat5: mean(st('cat5')), ace: mean(st('ace')),
      sd: { named: sd(st('named')), hurr: sd(st('hurr')), major: sd(st('major')), ace: sd(st('ace')) }, aceRange: [Math.min(...st('ace')), Math.max(...st('ace'))],
      hurrOfNamed: named.length ? named.filter((x) => x.peak >= 65).length / named.length : NaN,
      majorOfNamed: named.length ? named.filter((x) => x.peak >= 96).length / named.length : NaN,
      cat5OfNamed: named.length ? named.filter((x) => x.peak >= 137).length / named.length : NaN,
      namedOfDep: storms.length ? named.length / storms.length : NaN,
      namedByMonth: Array.from({ length: 12 }, (_, m) => mean(S.map((s) => s.r.namedByMonth[m]))),
      depByMonth: Array.from({ length: 12 }, (_, m) => mean(S.map((s) => s.r.depByMonth[m]))),
      aceByMonth: Array.from({ length: 12 }, (_, m) => mean(S.map((s) => s.r.aceByMonth[m]))),
      riFrac: win ? ri / win : NaN, riOfHurr: hurrStorms.length ? hurrStorms.filter((x) => x.riAny).length / hurrStorms.length : NaN,
      riOfMajor: storms.filter((x) => x.peak >= 96).length ? storms.filter((x) => x.peak >= 96 && x.riAny).length / storms.filter((x) => x.peak >= 96).length : NaN,
      namedDays: mean(named.map((x) => x.hours / 24)), short2d: named.length ? named.filter((x) => x.hours < 48).length / named.length : NaN,
      etOfNamed: named.length ? named.filter((x) => x.et).length / named.length : NaN, ssPerYear: storms.filter((x) => x.subNamed).length / nSeasons,
      genLat: [0.05, 0.25, 0.5, 0.75, 0.95].map((q) => quant(named.filter((x) => x.genN).map((x) => x.genN[0]), q)),
      genLon: [0.05, 0.25, 0.5, 0.75, 0.95].map((q) => quant(named.filter((x) => x.genN).map((x) => x.genN[1]), q)),
      peakMean: mean(storms.filter((x) => x.named).map((x) => x.peak)),
    };
    // the lows the page's detector tracks (the same in every parameter set): tracks of at least three fixes born per month, deepest pressure, lifetime
    const lw = S.flatMap((s) => s.r.lows || []).filter((x) => x[1] >= 3);
    o.lows = { perMonth: Array.from({ length: 12 }, (_, m) => lw.filter((x) => x[0] === m).length / nSeasons), pminMean: mean(lw.map((x) => x[2])), durMean: mean(lw.map((x) => x[3])), durP50: quant(lw.map((x) => x[3]), 0.5) };
    // where named storms form: shares in the reference's 10 x 20 degree cells
    o.cells = REF.genesis.cells_10x20.slice(0, 10).map(([la, lo, share]) => ({ la, lo, ref: share, sim: named.length ? named.filter((x) => x.genN && x.genN[0] >= la && x.genN[0] < la + 10 && x.genN[1] >= lo && x.genN[1] < lo + 20).length / named.length : NaN }));
    // environment at genesis (first tropical fix) and at the first named fix: sst, shear, rh
    const env = (key) => { const a = storms.filter((x) => x[key]); return { n: a.length, sst: mean(a.map((x) => x[key][3])), sh: mean(a.map((x) => x[key][4])), rh: mean(a.map((x) => x[key][5])), shP50: quant(a.map((x) => x[key][4]), 0.5), rhP50: quant(a.map((x) => x[key][5]), 0.5) }; };
    o.envGen = env('gen'); o.envNamed = env('genN');
    // how named storms end, and how many reach high latitudes (the real extratropical share is 45 %)
    const ends = {}; for (const x of named) { const k = (x.end || '').replace(/ .*/, '') || '?'; ends[k] = (ends[k] || 0) + 1; }
    o.ends = Object.fromEntries(Object.entries(ends).map(([k, v]) => [k, v / Math.max(1, named.length)]));
    const exs = named.filter((x) => x.etLat != null); o.etLatQ = [0.1, 0.5, 0.9].map((q) => quant(exs.map((x) => x.etLat), q)); o.etVMed = quant(exs.map((x) => x.etV), 0.5); o.etN = exs.length;
    o.et = etStats(named, nSeasons);
    o.reach35 = named.length ? named.filter((x) => x.maxLat >= 35).length / named.length : NaN; o.reach30 = named.length ? named.filter((x) => x.maxLat >= 30).length / named.length : NaN;
    // El Nino / La Nina split on the mean of the Aug / Sep / Oct Nino 3.4 (the real split uses ASO > +-0.5)
    const grp = (f) => S.filter((s) => f(s.n34)), g = (a) => ({ n: a.length, ace: mean(a.map((s) => s.r.stats.ace)), named: mean(a.map((s) => s.r.stats.named)), hurr: mean(a.map((s) => s.r.stats.hurr)) });
    o.enso = { el: g(grp((x) => x > 0.5)), neutral: g(grp((x) => x >= -0.5 && x <= 0.5)), la: g(grp((x) => x < -0.5)) };
    o.enso.ratio = o.enso.el.n && o.enso.la.n ? o.enso.la.ace / o.enso.el.ace : NaN;
    // the regression of ln(ACE + 10) on the Aug-Oct Nino 3.4 of the season: real 1991-2020 (and 1980-2021) -0.32 +- 0.10 per degree, r -0.5 (the ratio above is its two-group version)
    { const xs = S.map((s) => s.n34), ys = S.map((s) => Math.log(s.r.stats.ace + 10)), mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0; xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; }); o.ensoSlope = sxx > 0 ? sxy / sxx : NaN; }
    // what becomes of the depressions that formed in a latitude band, and where the named storms spend their six-hourly rows (shares per 5 degrees of latitude from 5N, 100W-20W)
    o.fate = {}; for (const [lo, hi] of FATE_BINS) { const a = storms.filter((x) => x.gen && !x.sub0 && x.gen[0] >= lo && x.gen[0] < hi); o.fate[lo + '-' + hi] = { n: a.length, named: a.filter((x) => x.named).length / Math.max(1, a.length), hurr: a.filter((x) => x.peak >= 65).length / Math.max(1, a.length), major: a.filter((x) => x.peak >= 96).length / Math.max(1, a.length) }; }
    { const prof = new Array(14).fill(0); let tot = 0; for (const x of named) for (const t of x.trk || []) if (t[3] % 6 === 0 && t[4] <= 1 && t[2] >= 34 && t[1] >= -100 && t[1] <= -20) { prof[Math.max(0, Math.min(13, Math.floor((t[0] - 5) / 5)))]++; tot++; } o.latProfile = prof.map((x) => (tot ? x / tot : 0)); }
    // translation velocity by latitude band, tropical rows, weak (< 64 kt) and hurricane strength
    const rows = storms.flatMap((x) => x.rows);
    o.motion = {};
    for (const [label, sel] of [['weak', (r) => r[2] < 64], ['hurricane', (r) => r[2] >= 64]]) {
      o.motion[label] = REF.motion[label].map((b) => {
        const a = rows.filter((r) => sel(r) && r[0] >= b.lat0 && r[0] < b.lat0 + 5);
        return { lat0: b.lat0, n: a.length, u: mean(a.map((r) => r[3] * Math.sin(r[4] * Math.PI / 180))), v: mean(a.map((r) => r[3] * Math.cos(r[4] * Math.PI / 180))), refU: b.u, refV: b.v };
      });
    }
    res[name] = o;
  }
  return { ref, res };
}

export function report(raw, only) {
  const { ref, res } = summarize(raw), names = only || raw.names, L = [];
  const row = (label, vals, refv) => L.push(label.padEnd(30) + vals.map((v) => String(v).padStart(11)).join('') + (refv === undefined ? '' : '   | ' + refv));
  const head = (t) => L.push('\n' + t.padEnd(30) + names.map((n) => n.slice(0, 10).padStart(11)).join('') + '   | real (Jun-Dec window)');
  head(`${raw.seasons.length} seasons, ${raw.days} days from Jun 1`);
  const col = (f, n = 1) => names.map((k) => f1(f(res[k]), n));
  row('depressions (TD or stronger)', col((o) => o.dep), f1(ref.dep));
  row('named storms', col((o) => o.named), f1(ref.named));
  row('hurricanes', col((o) => o.hurr), f1(ref.hurr));
  row('major hurricanes', col((o) => o.major), f1(ref.major));
  row('category 5', col((o) => o.cat5, 2), f1(ref.cat5, 2));
  row('ACE', col((o) => o.ace, 0), f1(ref.ace, 0));
  { const c = 1 - ACT_ELASTICITY * (meanActivity(raw.seasons) - 1);
    row(`at an average season (these seeds ${f1(meanActivity(raw.seasons), 2)})`, names.map((k) => `${f1(res[k].dep * c)}/${f1(res[k].named * c)}/${f1(res[k].hurr * c)}/${f1(res[k].major * c)}/${f1(res[k].ace * c, 0)}`), 'dep/named/hurr/major/ACE, counts x ' + f1(c, 3)); }
  row('SD named / hurr / major', names.map((k) => `${f1(res[k].sd.named)}/${f1(res[k].sd.hurr)}/${f1(res[k].sd.major)}`), `${f1(ref.sd.named)}/${f1(ref.sd.hurr)}/${f1(ref.sd.major)}`);
  row('SD ACE, min..max', names.map((k) => `${f1(res[k].sd.ace, 0)} ${f1(res[k].aceRange[0], 0)}..${f1(res[k].aceRange[1], 0)}`), `${f1(ref.sd.ace, 0)}, 32..250`);
  row('hurricane share of named', col((o) => o.hurrOfNamed, 2), f1(REF.peak.frac_ge64, 2));
  row('major share of named', col((o) => o.majorOfNamed, 2), f1(REF.peak.frac_ge96, 2));
  row('cat 5 share of named', col((o) => o.cat5OfNamed, 3), f1(REF.peak.frac_ge137, 3));
  row('named share of depressions', col((o) => o.namedOfDep, 2), f1(REF.status.named_per_year / REF.status.tracks_per_year, 2));
  row('RI share of 24-h windows', col((o) => o.riFrac, 3), f1(REF.intensity_change.ri_frac_all, 3));
  row('hurricanes with RI', col((o) => o.riOfHurr, 2), f1(REF.ri_track_fractions.HU.frac, 2));
  row('majors with RI', col((o) => o.riOfMajor, 2), f1(REF.ri_track_fractions.MH.frac, 2));
  row('mean named days / <2 d share', names.map((k) => `${f1(res[k].namedDays, 1)}/${f1(res[k].short2d, 2)}`), `${REF.lifetime.mean_named_days}/${REF.lifetime.short_lived_lt_2d}`);
  row('extratropical share of named', col((o) => o.etOfNamed, 2), f1(REF.status.et_fraction_of_named, 2));
  row('subtropical storms a year', col((o) => o.ssPerYear, 2), f1(REF.status.subtropical_storms_per_year, 2));
  row('named storms reaching 30N / 35N', names.map((k) => `${f1(res[k].reach30, 2)}/${f1(res[k].reach35, 2)}`), '0.71/0.59');
  row('extratropical: latitude q10/50/90', names.map((k) => res[k].etLatQ.map((x) => f1(x, 0)).join('/')), '32/41/48');
  row('extratropical: wind at transition', col((o) => o.etVMed, 0), '45');
  L.push('');
  try { L.push(...etLines(Object.fromEntries(names.map((k) => [k, res[k].et])), etReal(JSON.parse(readFileSync(join(ROOT, 'data/generated/atlantic-tc-et.json'), 'utf8'))))); } catch (e) { L.push('(no data/generated/atlantic-tc-et.json: python3 tools/make_tc_et.py)'); }
  L.push('  how named storms end (share): ' + names.slice(0, 1).map((k) => Object.entries(res[k].ends).sort((a, b) => b[1] - a[1]).map(([e, v]) => `${e} ${f1(100 * v, 0)}%`).join(', ')).join(''));
  row('named genesis lat 5/25/50/75/95', names.map((k) => res[k].genLat.map((x) => f1(x, 0)).join('/')), REF.genesis.named_lat_quantiles.map((x) => f1(x, 0)).join('/'));
  row('named genesis lon 5/25/50/75/95', names.map((k) => res[k].genLon.map((x) => f1(x, 0)).join('/')), REF.genesis.named_lon_quantiles.map((x) => f1(x, 0)).join('/'));
  row('mean peak of named (kt)', col((o) => o.peakMean, 0), f1(REF.peak.mean, 0));
  L.push('\nshare of named storms forming in each 10 x 20 degree cell (lat, lon of the south-west corner)   real | ' + names.map((n) => n.slice(0, 7)).join(' '));
  REF.genesis.cells_10x20.slice(0, 10).forEach(([la, lo, share], i) => L.push(`  ${String(la).padStart(3)}N ${String(lo).padStart(5)}   ${f1(100 * share, 0).padStart(3)}% | ` + names.map((n) => (f1(100 * res[n].cells[i].sim, 0) + '%').padStart(7)).join(' ')));
  L.push('\nnamed storms by month (Jun..Nov)  ' + 'real: ' + ref.namedByMonth.slice(5, 11).map((x) => f1(x, 2)).join(' '));
  for (const k of names) L.push('  ' + k.padEnd(16) + res[k].namedByMonth.slice(5, 11).map((x) => f1(x, 2).padStart(6)).join(' ') + '    dep ' + res[k].depByMonth.slice(5, 11).map((x) => f1(x, 2).padStart(5)).join(' '));
  L.push('  real depressions' + ' '.repeat(2) + ref.depByMonth.slice(5, 11).map((x) => f1(x, 2).padStart(6)).join(' '));
  if (ref.envSpread) L.push(`\nMDR (10-20N, 80-20W) Aug-Oct environment, mean and year-to-year SD over ${raw.seasons.length} seasons: SST ${f1(ref.envSpread.sst.mean, 2)} / ${f1(ref.envSpread.sst.sd, 2)}, humidity ${f1(ref.envSpread.rh.mean)} / ${f1(ref.envSpread.rh.sd, 2)}, shear ${f1(ref.envSpread.shear.mean)} / ${f1(ref.envSpread.shear.sd, 2)}   (ERA5 2007-2021, ERSST 1991-2020: SST 28.13 / 0.34, humidity 54.0 / 1.72, shear 19.5 / 2.84)`);
  const ra = refAceByMonth();
  L.push('\nACE by month (Jun..Dec), share of the total   real: ' + ra.slice(5, 12).map((x) => f1(x, 1).padStart(6)).join(' ') + '   (' + ra.slice(5, 12).map((x) => f1(100 * x / ra.slice(5, 12).reduce((a, b) => a + b, 0), 0) + '%').join(' ') + ')');
  for (const k of names) { const a = res[k].aceByMonth.slice(5, 12), t = a.reduce((x, y) => x + y, 0); L.push('  ' + k.padEnd(16) + a.map((x) => f1(x, 1).padStart(6)).join(' ') + '   (' + a.map((x) => f1(100 * x / t, 0) + '%').join(' ') + ')'); }
  try {
    const LR = JSON.parse(readFileSync(join(ROOT, 'data/generated/atlantic-lows-ref.json'), 'utf8')), lo = res[names[0]].lows;
    if (lo && lo.perMonth.some((x) => x > 0)) {
      L.push('\nlows tracked by the page (>= 3 fixes = 18 h) born per month, Jun..Dec   real ERA5 2007-2021: ' + LR.tracks_per_month.slice(5, 12).map((x) => f1(x, 0)).join(' ') + `   deepest ${f1(LR.pmin_mean)} hPa mean, ${f1(LR.dur_h_mean, 0)} h mean (median ${f1(LR.dur_h_p50, 0)})`);
      L.push('  simulated                                                         ' + lo.perMonth.slice(5, 12).map((x) => f1(x, 0)).join(' ') + `   deepest ${f1(lo.pminMean)} hPa mean, ${f1(lo.durMean, 0)} h mean (median ${f1(lo.durP50, 0)})`);
    }
  } catch (e) { /* no real lows file yet */ }
  L.push('\nenvironment at the first tropical fix (sst / shear / rh, medians of shear and rh) and at the first named fix');
  for (const k of names) { const a = res[k].envGen, b = res[k].envNamed; L.push(`  ${k.padEnd(16)} gen ${f1(a.sst)} / ${f1(a.sh)} (${f1(a.shP50)}) / ${f1(a.rh)} (${f1(a.rhP50)}) n=${a.n}   named ${f1(b.sst)} / ${f1(b.sh)} (${f1(b.shP50)}) / ${f1(b.rh)} (${f1(b.rhP50)}) n=${b.n}`); }
  L.push('  real: first TD row sst 28.3, shear (daily 2-deg point) 17.7 (p10..p90 9..27), rh 700 hPa 77 inside / 56-60 around it (data/generated/atlantic-tc-env.json)');
  L.push('\nEl Nino / neutral / La Nina (Nino 3.4 over Aug-Oct > +0.5 / -0.5): seasons, mean named, mean ACE, ratio La Nina / El Nino (real 12/17/13 years, 9.5 / 14.1 / 15.9 named, ACE 69 / 125 / 134, ratio 1.94; slope of ln(ACE + 10) on Nino 3.4: -0.33 +- 0.09)');
  for (const k of names) { const e = res[k].enso; L.push(`  ${k.padEnd(16)} ${[e.el, e.neutral, e.la].map((x) => `${x.n}: ${f1(x.named)} / ${f1(x.ace, 0)}`).join('   ')}   ratio ${f1(e.ratio, 2)}   slope ${f1(res[k].ensoSlope, 2)}`); }
  try {
    const VAL = JSON.parse(readFileSync(join(ROOT, 'data/generated/atlantic-tc-validate.json'), 'utf8'));
    L.push('\nwhat becomes of the depressions formed in a latitude band: named / hurricane / major share (real best track in brackets)');
    for (const k of names.slice(0, 1)) for (const [lo, hi] of FATE_BINS) { const x = res[k].fate[lo + '-' + hi], r = VAL.genesis_fate[lo + '-' + hi]; L.push(`  ${String(lo).padStart(2)}-${String(hi).padEnd(2)}N n=${String(x.n).padStart(3)}   ${f1(x.named, 2)} / ${f1(x.hurr, 2)} / ${f1(x.major, 2)}   (${f1(r.named, 2)} / ${f1(r.hurricane, 2)} / ${f1(r.major, 2)})`); }
    L.push('share of the named storms\' six-hourly rows by latitude band (10-15N .. 40-45N): sim ' + res[names[0]].latProfile.slice(1, 9).map((x) => f1(x, 2)).join(' ') + '   real ' + VAL.lat_profile.share.slice(1, 9).map((x) => f1(x, 2)).join(' '));
  } catch (e) { /* no validation file */ }
  L.push('\ntranslation velocity (kt, u/v) by latitude band, mean over the six-hourly rows: weak storms (sim vs real)');
  for (const k of names.slice(0, 1)) for (const b of res[k].motion.weak) if (b.n >= 20) L.push(`  ${String(b.lat0).padStart(2)}N n=${String(b.n).padStart(5)}  u ${f1(b.u)} (${f1(b.refU)})  v ${f1(b.v)} (${f1(b.refV)})`);
  return L.join('\n');
}

/* ---- command line ---------------------------------------------------------------------------------------------------------------- */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2), get = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
  let raw;
  if (get('from')) raw = JSON.parse(readFileSync(get('from'), 'utf8'));
  else {
    const range = get('seeds', '1-12').split('-').map(Number), seeds = [];
    for (let s = range[0]; s <= (range[1] ?? range[0]); s++) seeds.push(s);
    const sets = get('sets') ? JSON.parse(readFileSync(get('sets'), 'utf8')) : { base: {} };
    const t0 = Date.now();
    const sliders = Object.fromEntries(a.flatMap((x, i) => (x === '--slider' ? [a[i + 1].split('=')] : [])).map(([k, v]) => [k, +v]));
    raw = await runLab({ seeds, days: +get('days', 214), sets, pages: +get('pages', 4), sliders, page: get('page') || undefined, maps: get('maps') ? JSON.parse(readFileSync(get('maps'), 'utf8')) : null, diag: a.includes('--diag'), onSeed: (s, n) => process.stderr.write(`\rseason ${n}/${seeds.length} (seed ${s}) ${((Date.now() - t0) / 1000).toFixed(0)} s   `) });
    process.stderr.write('\n');
    if (get('out')) writeFileSync(get('out'), JSON.stringify(raw));
  }
  console.log(report(raw, get('only') ? get('only').split(',') : undefined));
}
