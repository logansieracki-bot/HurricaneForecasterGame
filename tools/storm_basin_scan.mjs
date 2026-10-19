// One parameter of a basin's calibrated candidate at a time: the loss and the headline numbers of whole seasons at each of a list of values, every value on the same seasons of the page's weather (tools/storm_mc.mjs).
// It is what a search that left a parameter out, or a number the check on other seasons found to be off, asks for after the fact -- a one-dimensional look is minutes where another search is hours.
//
//   node tools/storm_basin_scan.mjs <basin> --maps maps.json --best best.json --param latLo --values 3,4.5,6,7.5 --seeds 801-848 [--param2 vpLat --values2 0.2,0.4]
//       best.json is a search's result (its `best.values`); with --param2 every value of the first meets every value of the second
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import '../src/storms.js';
import { runLab, TCB } from './storm_mc.mjs';
import { summarize } from './storm_basin.mjs';
import { SPEC, toPatch, targets, lossOf, gateLat, setModes } from './storm_basin_opt.mjs';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2), basin = a[0], get = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
  if (!TCB[basin]) { console.error('usage: node tools/storm_basin_scan.mjs <basin> --maps maps.json --best best.json --param latLo --values 3,4.5,6 [--seeds 801-848]'); process.exit(1); }
  const range = get('seeds', '801-848').split('-').map(Number), seeds = []; for (let s = range[0]; s <= (range[1] ?? range[0]); s++) seeds.push(s);
  const maps = JSON.parse(readFileSync(get('maps'), 'utf8')), best = JSON.parse(readFileSync(get('best'), 'utf8')).best.values;
  const ref = JSON.parse(readFileSync(new URL(`../data/generated/${basin}-tc-ref.json`, import.meta.url), 'utf8'));
  const P1 = get('param'), V1 = get('values').split(',').map(Number), P2 = get('param2'), V2 = P2 ? get('values2').split(',').map(Number) : [null];
  for (const p of [P1, P2].filter(Boolean)) if (!SPEC.some((s) => s[0] === p)) { console.error('unknown parameter ' + p + ' (' + SPEC.map((s) => s[0]).join(', ') + ')'); process.exit(1); }
  const sub = !!(ref.meta && ref.meta.synthetic) || a.includes('--sub');
  // the same gate the search used (storm_basin_opt.mjs): a candidate here is what the search would have scored
  setModes({ sub, gate: gateLat(ref) });
  const T = targets(ref);
  const sets = {}, keys = [];
  for (const v1 of V1) for (const v2 of V2) {
    const k = `${P1}=${v1}` + (P2 ? ` ${P2}=${v2}` : ''), vals = { ...best, [P1]: v1, ...(P2 ? { [P2]: v2 } : {}) };
    sets[k] = toPatch(vals); keys.push(k);
  }
  const raw = await runLab({ seeds, days: 365, sets, pages: +get('pages', 4), basin, maps }), { res } = summarize(raw, basin);
  const rows = keys.map((k) => ({ k, o: res[k], L: lossOf(res[k], T) }));
  const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '-');
  for (const r of rows) console.log(`${r.k.padEnd(28)} loss ${f(r.L.total, 1).padStart(6)}  dep ${f(r.o.dep)} named ${f(r.o.named)} hurr ${f(r.o.hurr)} major ${f(r.o.major)} cat5 ${f(r.o.cat5, 2)} ace ${f(r.o.ace, 0)}  |lat| of 64-kt rows q5/25/50 ${r.o.hurrLat ? [1, 2, 3].map((i) => f(r.o.hurrLat[i], 1)).join('/') : '-'}  peak ${f(r.o.peakMean, 0)} life ${f(r.o.namedDays, 1)}  ENSO slope ${f(r.o.ensoSlope, 2)} named ${f(r.o.ensoNamed, 2)} lon ${f(r.o.ensoLon, 1)} lat ${f(r.o.ensoLat, 2)}  SD ace ${f(r.o.sd.ace, 0)}`);
  const b = rows.slice().sort((x, y) => x.L.total - y.L.total)[0];
  console.log('lowest loss:', b.k, f(b.L.total, 1), '\n' + b.L.parts.filter((p) => p[3] > 1).map((p) => `${p[0]} ${f(+p[1], 3)} (target ${f(+p[2], 3)}, loss ${f(p[3], 2)})`).join('\n'));
}

