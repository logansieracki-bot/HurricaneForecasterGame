// Calibrates a basin's intensity law against its real best track (data/generated/<basin>-tc-ref.json) with CMA-ES, every candidate running on the same seasons of the page's weather.
// The Atlantic's calibration (tools/storm_opt.mjs) took the physics from the Atlantic's record; another basin starts from those values (src/storms.js CALIBRATED) and moves only the few
// that say how much of the potential wind a storm reaches and how fast it gains and loses it, where the sea, the humidity and the shear stop it, how often it intensifies rapidly -- the
// maps (where disturbances develop, how storms drift) are fixed first by tools/storm_fit.mjs, and are the real ones.
//
//   node tools/storm_basin_opt.mjs <basin> --maps maps.json --seeds 601-624 --gens 25 --out opt.json [--pop 12] [--resume] [--free a,b] [--start values.json] [--weight 'ACE=3'] [--sub]
//   node tools/storm_basin_opt.mjs <basin> --maps maps.json --rescore opt.json --seeds 851-898 --out best.json [--top 8] [--last 3]
//       the loss of 24 seasons is noisy (a candidate that is best of its generation is partly lucky): the best few candidates of a run and the last means of its search are scored again on fresh seasons, in one lab run (they share the weather), and
//       the one with the lowest loss there is written in the shape of opt.json's `best`, which tools/storm_basin_patch.mjs --opt takes
// The loss is a sum of squared standardised misses of whole-season aggregates (counts, ACE, the hurricane and major shares of the named storms, the mean peak), rapid intensification,
// lifetime and the extratropical share; what it leaves to the check afterwards, on other seasons, is the spread between seasons, the seasonal shape and the El Nino response.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import '../src/storms.js';
import { CMA } from './storm_opt.mjs';
import { runLab, TCB } from './storm_mc.mjs';
import { summarize } from './storm_basin.mjs';

const C = globalThis.HFStorms.CALIBRATED;
/* name, low, high, initial (the Atlantic's calibrated value), scale, patch */
export const SPEC = [
  ['vpScale', 0.7, 1.12, 1, 'lin'], ['kUp', 0.012, 0.07, C.kUp, 'log'], ['kDn', 0.01, 0.8, C.kDn, 'log'], ['sstLo', 20, 27.5, C.sstGate[0], 'lin'], ['rhLo', 30, 62, C.rhGate[0], 'lin'],
  ['shearK', 1.4, 6.5, C.shearK, 'lin'], ['etaLo', 6, 26, C.etaLo, 'lin'], ['etaHi', 24, 31, C.etaHi, 'lin'], ['vpLat', 0, 0.95, C.vpLat, 'lin'], ['gCrit', 0.0, 0.22, C.gCrit, 'lin'], ['riHaz', 0.003, 0.25, C.ri.haz, 'log'], ['etB0', -10, -3.5, -6.1, 'lin'], ['latLo', 1, 10, 4, 'lin'],
  // the share of depressions that become storms (a system is only declared a depression while its growth gate exceeds gCrit by tdMargin), the spread between seasons and the response to El Nino: the size of the random season factor, how strongly the development rates follow the page's own humidity / shear / sea (a multiple of the Atlantic's coupling), and par.enso
  // (activity a degree of Nino 3.4, genesis region moved east and north a degree: the real slopes of the record, data/generated/<basin>-tc-ref.json, are the targets and the start)
  ['tdMargin', 0, 0.7, C.tdMargin, 'lin'], ['seasSd', 0, 0.35, 0.12, 'lin'], ['envScale', 0.05, 6, 1, 'log'], ['ensoAct', -0.7, 0.7, 0, 'lin'], ['ensoLon', -14, 14, 0, 'lin'], ['ensoLat', -5, 5, 0, 'lin'],
];
const ENSO_PARAMS = ['ensoAct', 'ensoLon', 'ensoLat'];
// a basin whose storms are mostly subtropical (the South Atlantic, the Mediterranean) also fits the subtropical class's own law (--sub, or a synthetic reference): the soft cap on its wind, its growth rate, its gate level and the shear it stands
SPEC.push(['subVcap', 40, 110, 62, 'lin'], ['subKup', 0.003, 0.06, 0.012, 'log'], ['subGcrit', 0.05, 0.6, 0.30, 'lin'], ['subShear', 8, 70, 26, 'lin']);
const SUB_PARAMS = ['subVcap', 'subKup', 'subGcrit', 'subShear'];
let SUB_ON = false;
const unit = (v, [, lo, hi, , sc]) => (sc === 'log' ? (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) : (v - lo) / (hi - lo));
const phys = (u, [, lo, hi, , sc]) => { const c = Math.min(1, Math.max(0, u)); return sc === 'log' ? Math.exp(Math.log(lo) + c * (Math.log(hi) - Math.log(lo))) : lo + c * (hi - lo); };
let FREE = SPEC.slice(), FIXED = {};
const configure = (names, fixed) => { FREE = names ? SPEC.filter((s) => names.includes(s[0])) : SPEC.slice(); FIXED = Object.fromEntries(SPEC.map((s) => [s[0], fixed && fixed[s[0]] != null ? fixed[s[0]] : s[3]])); };
const toValues = (x) => Object.assign({}, FIXED, Object.fromEntries(FREE.map((s, i) => [s[0], phys(x[i], s)])));
export const toPatch = (v) => ({ vpScale: v.vpScale, kUp: v.kUp, kDn: v.kDn, sstGate: [v.sstLo, v.sstLo + (C.sstGate[1] - C.sstGate[0])], rhGate: [v.rhLo, v.rhLo + (C.rhGate[1] - C.rhGate[0])], shearK: v.shearK, etaLo: v.etaLo, etaHi: v.etaHi, vpLat: v.vpLat, gCrit: v.gCrit, ri: { haz: v.riHaz }, etHaz: { b0: v.etB0 }, latGate: [v.latLo, v.latLo + 7],
  tdMargin: v.tdMargin, ...(SUB_ON ? { sub: { vCap: v.subVcap, kUp: v.subKup, gCrit: v.subGcrit, shearScale: v.subShear } } : {}), act: { seasSd: v.seasSd }, envB: { rh: C.envB.rh * v.envScale, shear: C.envB.shear * v.envScale, sst: C.envB.sst * v.envScale, sstAbs: C.envB.sstAbs * v.envScale }, enso: { act: v.ensoAct, lon: v.ensoLon, lat: v.ensoLat } });

/* [label, value from a summary, target, standard deviation of a miss, weight] */
export function targets(ref) {
  const n = ref.normals, pk = ref.peak, ic = ref.intensity_change, g = ref.genesis;
  return [
    ['named', (o) => o.named, n.named, Math.max(0.6, 0.06 * n.named), 1.5], ['hurr', (o) => o.hurr, n.hurricanes, Math.max(0.4, 0.07 * n.hurricanes), 2], ['major', (o) => o.major, n.majors, Math.max(0.3, 0.1 * n.majors), 2],
    ['cat5', (o) => o.cat5, n.cat5, Math.max(0.1, 0.25 * n.cat5), 0.7], ['ace', (o) => o.ace, n.ace_mean, 0.06 * n.ace_mean, 3], ['named/dep', (o) => o.namedOfDep, g.named_of_depressions, 0.04, 1],
    ['hurr share', (o) => o.hurrOfNamed, pk.frac_ge64, 0.04, 2], ['major share', (o) => o.majorOfNamed, pk.frac_ge96, 0.035, 2], ['cat5 share', (o) => o.cat5OfNamed, pk.frac_ge137, Math.max(0.01, 0.3 * pk.frac_ge137), 0.7],
    ['mean peak', (o) => o.peakMean, pk.mean, 3, 1.5], ['RI share', (o) => o.riFrac, ic.ri_frac_all, 0.01, 1.5], ['hurr RI', (o) => o.riOfHurr, ic.ri_track_fractions.HU.frac, 0.08, 1],
    ['named days', (o) => o.namedDays, ref.lifetime.mean_named_days, 0.4, 1.5], ['<2 d share', (o) => o.short2d, ref.lifetime.short_lived_lt_2d, 0.05, 0.7],
    ['ET share', (o) => o.etOfNamed, ref.status.et_fraction_of_named, 0.06, 1], ['named lat q50', (o) => o.genLat[2], g.named_lat_quantiles[2], 1.5, 0.5], ['named lon q50', (o) => o.genLon[2], g.named_lon_quantiles[2], 3, 0.4],
    ['ENSO slope', (o) => o.ensoSlope, ref.enso.slope_ln_ace10, 0.17, 1],
    ['named SD', (o) => o.sd.named, n.ns_sd, Math.max(0.7, 0.15 * n.ns_sd), 1.5], ['hurr SD', (o) => o.sd.hurr, n.h_sd, Math.max(0.5, 0.15 * n.h_sd), 1], ['ACE SD', (o) => o.sd.ace, n.ace_sd, 0.2 * n.ace_sd, 1.5],
    ...(ref.enso.slope_lon != null ? [['ENSO named', (o) => o.ensoNamed, ref.enso.slope_ln_named, 0.08, 0.7], ['ENSO lon', (o) => o.ensoLon, ref.enso.slope_lon, Math.max(1.0, 0.25 * Math.abs(ref.enso.slope_lon)), 1], ['ENSO lat', (o) => o.ensoLat, ref.enso.slope_lat, Math.max(0.4, 0.3 * Math.abs(ref.enso.slope_lat)), 0.5]] : []),
    ...(ref.hurr_rows ? [['64-kt rows |lat| q5', (o) => o.hurrLat[1], ref.hurr_rows.abslat_quantiles[1], 1.0, 2], ['64-kt rows |lat| q25', (o) => o.hurrLat[2], ref.hurr_rows.abslat_quantiles[2], 1.5, 1], ['64-kt rows |lat| q50', (o) => o.hurrLat[3], ref.hurr_rows.abslat_quantiles[3], 1.5, 0.7]] : []),
  ];
}
export function lossOf(o, T) {
  const parts = T.map(([label, f, t, s, w]) => { const v = f(o); const z = Number.isFinite(v) ? (v - t) / s : 10; return [label, v, t, w * z * z]; });
  return { total: parts.reduce((a, p) => a + p[3], 0), parts };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2), basin = a[0], get = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
  if (!TCB[basin]) { console.error('usage: node tools/storm_basin_opt.mjs <basin> --maps maps.json --seeds 601-624 ...'); process.exit(1); }
  const range = get('seeds', '601-624').split('-').map(Number), seeds = []; for (let s = range[0]; s <= (range[1] ?? range[0]); s++) seeds.push(s);
  const gens = +get('gens', 25), lambda = +get('pop', 12), out = get('out', 'opt.json'), maps = get('maps') ? JSON.parse(readFileSync(get('maps'), 'utf8')) : null;
  const start = get('start') ? JSON.parse(readFileSync(get('start'), 'utf8')) : null;
  const ref = JSON.parse(readFileSync(new URL(`../data/generated/${basin}-tc-ref.json`, import.meta.url), 'utf8'));
  const hasEnso = ref.enso.slope_lon != null;
  if (hasEnso) { SPEC.find((s) => s[0] === 'ensoLon')[3] = 0.6 * ref.enso.slope_lon; SPEC.find((s) => s[0] === 'ensoLat')[3] = 0.6 * ref.enso.slope_lat; }
  SUB_ON = a.includes('--sub') || !!(ref.meta && ref.meta.synthetic);
  configure((get('free') ? get('free').split(',') : SPEC.map((s) => s[0])).filter((k) => (hasEnso || !ENSO_PARAMS.includes(k)) && (SUB_ON || !SUB_PARAMS.includes(k))), start);
  const WEIGHTS = Object.fromEntries((get('weight') || '').split(';').filter(Boolean).map((kv) => { const i = kv.lastIndexOf('='); return [kv.slice(0, i), +kv.slice(i + 1)]; }));
  const T = targets(ref).map((t) => (WEIGHTS[t[0]] != null ? [t[0], t[1], t[2], t[3], WEIGHTS[t[0]]] : t));
  if (get('rescore')) {
    const prev = JSON.parse(readFileSync(get('rescore'), 'utf8')), top = +get('top', 8), last = +get('last', 3);
    const cands = [...prev.history.map((h) => ({ tag: 'g' + h.gen + 'b', values: h.values, was: h.best })).sort((x, y) => x.was - y.was).slice(0, top), ...prev.history.slice(-last).map((h) => ({ tag: 'g' + h.gen + 'm', values: h.meanValues, was: h.mean }))];
    const sets = Object.fromEntries(cands.map((c) => [c.tag, toPatch(c.values)]));
    const raw = await runLab({ seeds, days: 365, sets, pages: +get('pages', 4), basin, maps }), { res } = summarize(raw, basin);
    const rows = cands.map((c) => ({ ...c, now: lossOf(res[c.tag], T) })).sort((x, y) => x.now.total - y.now.total);
    for (const r of rows) console.log(`${r.tag.padEnd(5)} loss ${r.now.total.toFixed(1).padStart(6)} on ${seeds.length} fresh seasons (${r.was.toFixed(1)} on the ones it was found on): named ${res[r.tag].named.toFixed(1)} hurr ${res[r.tag].hurr.toFixed(1)} major ${res[r.tag].major.toFixed(1)} ace ${res[r.tag].ace.toFixed(0)}`);
    const b = rows[0];
    writeFileSync(out, JSON.stringify({ basin, rescored: rows.map((r) => ({ tag: r.tag, loss: r.now.total, was: r.was })), seeds, best: { loss: b.now.total, gen: b.tag, values: b.values, patch: toPatch(b.values), parts: b.now.parts.map((p) => [p[0], +p[1].toFixed(3), +p[2].toFixed(3), +p[3].toFixed(2)]) } }, null, 1));
    console.log('best:', b.tag, '\n' + b.now.parts.map((p) => `${p[0]} ${(+p[1]).toFixed(3)} (target ${(+p[2]).toFixed(3)}, loss ${p[3].toFixed(2)})`).join('\n'));
    process.exit(0);
  }
  const x0 = FREE.map((s) => (start && start[s[0]] != null ? unit(start[s[0]], s) : unit(s[3], s)));
  const cma = new CMA(x0, +get('sigma', 0.2), lambda, +get('rngseed', 1));
  const log = existsSync(out) && a.includes('--resume') ? JSON.parse(readFileSync(out, 'utf8')) : { basin, spec: FREE.map((s) => s[0]), seeds, history: [], best: null };
  for (let g = log.history.length; g < gens; g++) {
    const t0 = Date.now(), pop = cma.ask(), sets = {};
    pop.forEach((p, i) => { sets['c' + i] = toPatch(toValues(p.x)); }); sets.mean = toPatch(toValues(cma.m));
    const raw = await runLab({ seeds, days: 365, sets, pages: +get('pages', 4), basin, maps }), { res } = summarize(raw, basin);
    const L = Object.fromEntries(Object.keys(sets).map((k) => [k, lossOf(res[k], T)]));
    const pen = (x) => 0.5 * x.reduce((s, v) => s + Math.max(0, -v) ** 2 + Math.max(0, v - 1) ** 2, 0) * 50;
    const f = pop.map((p, i) => L['c' + i].total + pen(p.x));
    cma.tell(pop, f);
    const bi = f.indexOf(Math.min(...f)), bestC = 'c' + bi, b = res[bestC];
    const rec = { gen: g, secs: Math.round((Date.now() - t0) / 1000), best: f[bi], mean: L.mean.total, sigma: cma.sigma, values: toValues(pop[bi].x), meanValues: toValues(cma.m), summary: { dep: b.dep, named: b.named, hurr: b.hurr, major: b.major, ace: b.ace } };
    log.history.push(rec);
    if (!log.best || rec.best < log.best.loss) log.best = { loss: rec.best, gen: g, values: rec.values, patch: toPatch(rec.values), parts: L[bestC].parts.map((p) => [p[0], +p[1].toFixed(3), +p[2].toFixed(3), +p[3].toFixed(2)]) };
    writeFileSync(out, JSON.stringify(log, null, 1));
    console.log(`gen ${g} (${rec.secs} s): best ${rec.best.toFixed(1)}  mean ${L.mean.total.toFixed(1)}  sigma ${cma.sigma.toFixed(3)}  best: named ${b.named.toFixed(1)} hurr ${b.hurr.toFixed(1)} major ${b.major.toFixed(1)} ace ${b.ace.toFixed(0)}`);
  }
  console.log('best overall:', JSON.stringify(log.best.values), '\nloss', log.best.loss.toFixed(1));
  console.log(log.best.parts.map((p) => `${p[0]} ${p[1]} (target ${p[2]}, loss ${p[3]})`).join('\n'));
}
