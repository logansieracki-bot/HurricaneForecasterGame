// Mutation testing of the two-moment rain (src/severe-core.js with iceParams.twoMoment, and the rain of src/severe-refl.js): each mutant changes one expression, and tests/severe_twomoment.mjs runs against the copy.
// A mutant that the test lets through ("survived") is a place where it does not look.
//   node tools/severe_twomoment_mutants.mjs [name-filter] [jobs=4]     (DRY=1: only look for the text of each mutant, once, in its file)
// Each copy goes to its own temporary directory with the test and the modules and data it loads beside it, so nothing in the repository is touched and the copies run side by side.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir, cpus } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = { core: 'severe-core.js', refl: 'severe-refl.js', nest: 'severe-nest.js' };
const SRC = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, readFileSync(join(root, 'src/' + f), 'utf8')]));
const DATA = ['tools/severe_research/wk82.mjs', 'tools/severe_research/wk82_sounding.txt'];
// [name, file, the text to find (once), its replacement]
// (Changes that cannot be seen and so are not here: the zero of the drop number of a cell that has no rain left at the end of a step, because the range that the number is kept in is zero for no rain; and the floor and the ceiling
//  of the mean mass of what melts or of what the warm-rain processes make (`xMelt`), because the end of the step keeps the number inside the same range whatever the sources put in.)
const M = [
  // the option
  ['option-always-on', 'core', 'const TWO = ice && !!(o.iceParams && o.iceParams.twoMoment),', 'const TWO = ice,'],
  ['option-never-on', 'core', 'const TWO = ice && !!(o.iceParams && o.iceParams.twoMoment),', 'const TWO = false,'],
  ['number-not-last', 'core', "['qv', 'qc', 'qr'].concat(ice ? ['qi', 'qs', 'qg'] : [], TWO ? ['nr'] : [])", "['qv', 'qc', 'qr'].concat(TWO ? ['nr'] : [], ice ? ['qi', 'qs', 'qg'] : [])"],
  ['clip-counts-drops', 'core', "if (n !== 'nr') stat.clipped -= S[n][o] * m;", 'stat.clipped -= S[n][o] * m;'],
  // the size distribution
  ['range-no-big-drop-limit', 'core', 'const neff = (q, N) => Math.min(Math.max(N, q / XRMAX), q / XRMIN);', 'const neff = (q, N) => Math.min(N, q / XRMIN);'],
  ['range-no-small-drop-limit', 'core', 'const neff = (q, N) => Math.min(Math.max(N, q / XRMAX), q / XRMIN);', 'const neff = (q, N) => Math.max(N, q / XRMAX);'],
  ['range-swapped', 'core', 'const neff = (q, N) => Math.min(Math.max(N, q / XRMAX), q / XRMIN);', 'const neff = (q, N) => Math.min(Math.max(N, q / XRMIN), q / XRMAX);'],
  ['slope-quarter-root', 'core', 'const lamR2 = (q, N) => Math.cbrt(Math.PI * RHOW * neff(q, N) / q);', 'const lamR2 = (q, N) => Math.pow(Math.PI * RHOW * neff(q, N) / q, 0.25);'],
  ['slope-unclamped', 'core', 'const lamR2 = (q, N) => Math.cbrt(Math.PI * RHOW * neff(q, N) / q);', 'const lamR2 = (q, N) => Math.cbrt(Math.PI * RHOW * N / q);'],
  ['slope-no-water-density', 'core', 'const lamR2 = (q, N) => Math.cbrt(Math.PI * RHOW * neff(q, N) / q);', 'const lamR2 = (q, N) => Math.cbrt(Math.PI * neff(q, N) / q);'],
  ['warm-mass-intercept', 'core', 'const xMP = (rho, q) => xMelt(rho * q * lamOf(N0R, RHOW, rho, q) / N0R);', 'const xMP = (rho, q) => xMelt(rho * q * lamOf(N0R, RHOW, rho, q) / 4e6);'],
  ['warm-mass-no-density', 'core', 'const xMP = (rho, q) => xMelt(rho * q * lamOf(N0R, RHOW, rho, q) / N0R);', 'const xMP = (rho, q) => xMelt(q * lamOf(N0R, RHOW, rho, q) / N0R);'],
  // the fall
  ['fall-number-at-mass-speed', 'core', 'sdVn[k] = f * GRN;', 'sdVn[k] = f * GR.mass;'],
  ['fall-mass-at-number-speed', 'core', 'sdVq[k] = f * GR.mass;', 'sdVq[k] = f * GRN;'],
  ['fall-speed-density', 'core', 'f = VRa * Math.sqrt(RHO0 / rhoc[k]) / Math.pow(l, VRb);', 'f = VRa / Math.pow(l, VRb);'],
  ['fall-number-stays', 'core', 'sdN[k] -= c * (rhoc[k] * sdN[k] * sdVn[k] - rhoc[k + 1] * sdN[k + 1] * sdVn[k + 1]);', ''],
  ['fall-number-flux-density', 'core', 'sdN[k] -= c * (rhoc[k] * sdN[k] * sdVn[k] - rhoc[k + 1] * sdN[k + 1] * sdVn[k + 1]);', 'sdN[k] -= c * (rhoc[k] * sdN[k] * sdVn[k] - rhoc[k] * sdN[k + 1] * sdVn[k + 1]);'],
  ['fall-number-not-from-below', 'core', 'sdN[k] -= c * (rhoc[k] * sdN[k] * sdVn[k] - rhoc[k + 1] * sdN[k + 1] * sdVn[k + 1]);', 'sdN[k] -= c * (rhoc[k] * sdN[k] * sdVn[k]);'],
  ['fall-steps-by-number-speed', 'core', 'crmax = Math.max(crmax, sdVq[k] * dt / dz); }\n        if (crmax === 0) continue;', 'crmax = Math.max(crmax, sdVn[k] * dt / dz); }\n        if (crmax === 0) continue;'],
  ['fall-written-back-with-no-rain', 'core', 'An[o] = sdQ[k] > 1e-12 ? sdN[k] : 0;', 'An[o] = sdN[k];'],
  ['fall-mass-not-counted-at-ground', 'core', 'const out = rhoc[0] * sdQ[0] * sdVq[0] * dtfall; precip[j * nx + i] += out; stat.rainOut += out * area;', 'const out = rhoc[0] * sdQ[0] * sdVq[0] * dtfall; stat.rainOut += out * area;'],
  ['fall-single-moment', 'core', 'if (TWO) sedimentRain2(dt); else sediment', 'if (false) sedimentRain2(dt); else sediment'],
  // melting, freezing, collection
  ['melt-snow-no-drops', 'core', 'if (TWO) nr += d / xMelt(rho * qs * lS / n0s); ', ''],
  ['melt-snow-no-density', 'core', 'xMelt(rho * qs * lS / n0s)', 'xMelt(qs * lS / n0s)'],
  ['melt-snow-with-graupel-intercept', 'core', 'xMelt(rho * qs * lS / n0s)', 'xMelt(rho * qs * lS / IPAR.n0g)'],
  ['melt-graupel-no-drops', 'core', 'if (TWO) nr += d / xMelt(rho * qg * lG / IPAR.n0g); ', ''],
  ['melt-graupel-no-density', 'core', 'xMelt(rho * qg * lG / IPAR.n0g)', 'xMelt(qg * lG / IPAR.n0g)'],
  ['melt-graupel-with-snow-intercept', 'core', 'xMelt(rho * qg * lG / IPAR.n0g)', 'xMelt(rho * qg * lG / 2e6)'],
  ['freeze-keeps-drops', 'core', 'if (TWO) nr *= (qr - d) / qr; qr -= d; qg += d; T += lfK * d;\n            if (qg > 1e-12 && lG === 0)', 'qr -= d; qg += d; T += lfK * d;\n            if (qg > 1e-12 && lG === 0)'],
  ['freeze-takes-all-drops', 'core', 'if (TWO) nr *= (qr - d) / qr; qr -= d; qg += d; T += lfK * d;\n            if (qg > 1e-12 && lG === 0)', 'if (TWO) nr = 0; qr -= d; qg += d; T += lfK * d;\n            if (qg > 1e-12 && lG === 0)'],
  ['freeze-intercept-single-moment', 'core', '100 * n0rc * (RHOW / rho)', '100 * N0R * (RHOW / rho)'],
  ['collect-keeps-drops', 'core', 'if (TWO) nr *= (qr - d) / qr; qr -= d; qg += d; T += lfK * d; }     // graupel collects rain', 'qr -= d; qg += d; T += lfK * d; }     // graupel collects rain'],
  ['collect-intercept-single-moment', 'core', 'pairColl(1, RHOW, IPAR.n0g, n0rc, SPG, lG, SPR, lR, rho)', 'pairColl(1, RHOW, IPAR.n0g, N0R, SPG, lG, SPR, lR, rho)'],
  ['slope-of-rain-single-moment', 'core', 'let lR = qr > 1e-12 ? (TWO ? lamR2(qr, nr) : lamOf(N0R, RHOW, rho, qr)) : 0;', 'let lR = qr > 1e-12 ? lamOf(N0R, RHOW, rho, qr) : 0;'],
  ['intercept-of-rain-no-density', 'core', 'const n0rc = TWO && lR > 0 ? rho * neff(qr, nr) * lR : N0R;', 'const n0rc = TWO && lR > 0 ? neff(qr, nr) * lR : N0R;'],
  // the warm-rain processes
  ['warm-rain-no-drops', 'core', 'if (TWO && d > 0) nr += d / xMP(rho, qr + d); ', ''],
  ['warm-rain-sized-before', 'core', 'nr += d / xMP(rho, qr + d);', 'nr += d / xMP(rho, qr + 1e-9);'],
  ['warm-rain-drops-of-80-microns', 'core', 'nr += d / xMP(rho, qr + d);', 'nr += d / XRMIN;'],
  // evaporation
  ['evaporation-ignores-size', 'core', 'const ern = Math.min(dt * IPAR.evap * evf * (', 'const ern = Math.min(dt * IPAR.evap * ('],
  ['evaporation-ratio-inverted', 'core', 'evf = (rho * neff(qr, nr) * l2 * ventI(VRa, VRb, GR.vent, l2, rho, nu, sc)) / (N0R * ventI(VRa, VRb, GR.vent, l1, rho, nu, sc));', 'evf = (N0R * ventI(VRa, VRb, GR.vent, l1, rho, nu, sc)) / (rho * neff(qr, nr) * l2 * ventI(VRa, VRb, GR.vent, l2, rho, nu, sc));'],
  ['evaporation-intercept-no-density', 'core', 'evf = (rho * neff(qr, nr) * l2 *', 'evf = (neff(qr, nr) * l2 *'],
  ['evaporation-no-ventilation', 'core', 'l2 * ventI(VRa, VRb, GR.vent, l2, rho, nu, sc)) / (N0R * ventI(VRa, VRb, GR.vent, l1, rho, nu, sc));', 'l2) / (N0R * l1);'],
  ['evaporation-reference-intercept', 'core', '(N0R * ventI(VRa, VRb, GR.vent, l1, rho, nu, sc));', '(4e6 * ventI(VRa, VRb, GR.vent, l1, rho, nu, sc));'],
  ['evaporation-keeps-drops', 'core', 'if (TWO) nr *= (qr - ern) / qr;\n', '\n'],
  ['evaporation-takes-drops-twice', 'core', 'if (TWO) nr *= (qr - ern) / qr;\n', 'if (TWO) nr *= ((qr - ern) / qr) ** 2;\n'],
  // the end of the step, the radar's fall speed, the state
  ['step-ends-unclamped', 'core', 'if (TWO) S.nr[o] = qr > 1e-12 ? neff(qr, nr) : 0;', 'if (TWO) S.nr[o] = nr;'],
  ['step-ends-without-the-number', 'core', 'if (TWO) S.nr[o] = qr > 1e-12 ? neff(qr, nr) : 0;', ''],
  ['radar-speed-single-moment', 'core', 'TWO ? lamR2(q, S.nr[o]) : lamOf(N0R, RHOW, rhoc[k], q)', 'lamOf(N0R, RHOW, rhoc[k], q)'],
  ['restart-no-density', 'core', 'S.nr[o] = q > 1e-12 ? N0R / lamOf(N0R, RHOW, rhoc[k], q) / rhoc[k] : 0;', 'S.nr[o] = q > 1e-12 ? N0R / lamOf(N0R, RHOW, rhoc[k], q) : 0;'],
  ['restart-with-no-number-leaves-none', 'core', "if (n === 'nr' && !r.f.nr) {", "if (n === 'nr' && !r.f.nr && false) {"],
  // the reflectivity
  ['reflectivity-single-moment', 'refl', 'let l, n0 = P.n0r; if (TWO) {', 'let l, n0 = P.n0r; if (false) {'],
  ['reflectivity-intercept-no-density', 'refl', 'n0 = rho * Ne * l; }', 'n0 = Ne * l; }'],
  ['reflectivity-no-big-drop-limit', 'refl', 'Ne = Math.min(Math.max(S.nr[o], q / P.xrMax), q / P.xrMin)', 'Ne = Math.min(S.nr[o], q / P.xrMin)'],
  ['reflectivity-no-small-drop-limit', 'refl', 'Ne = Math.min(Math.max(S.nr[o], q / P.xrMax), q / P.xrMin)', 'Ne = Math.max(S.nr[o], q / P.xrMax)'],
  ['reflectivity-slope-quarter-root', 'refl', 'l = Math.cbrt(Math.PI * 1000 * Ne / q);', 'l = Math.pow(Math.PI * 1000 * Ne / q, 0.25);'],
  ['reflectivity-speed-single-moment', 'refl', 'core.zFall.rain(S.qr[o], k, o)', 'core.zFall.rain(S.qr[o], k)'],
];

const only = process.argv.slice(2).find((a) => !a.startsWith('jobs=')), jobs = +((process.argv.find((a) => a.startsWith('jobs=')) || '').slice(5)) || Math.min(4, cpus().length);
const base = mkdtempSync(join(tmpdir(), 'twomoment-mut-'));
const prepare = (name, file, text) => {
  const d = join(base, name);
  for (const x of ['src', 'tests', 'tools/severe_research']) mkdirSync(join(d, x), { recursive: true });
  copyFileSync(join(root, 'tests/severe_twomoment.mjs'), join(d, 'tests/severe_twomoment.mjs'));
  for (const x of DATA) copyFileSync(join(root, x), join(d, x));
  for (const k of Object.keys(FILES)) writeFileSync(join(d, 'src/' + FILES[k]), k === file ? text : SRC[k]);
  return d;
};
const run = (name, file, text) => new Promise((resolve) => {
  const d = prepare(name, file, text), p = spawn('node', ['tests/severe_twomoment.mjs'], { cwd: d, env: Object.assign({}, process.env, { FAILFAST: '1' }) }); let out = '', err = '';
  const timer = setTimeout(() => p.kill('SIGKILL'), 300000);
  p.stdout.on('data', (b) => { out += b; }); p.stderr.on('data', (b) => { err += b; });
  p.on('close', (code) => { clearTimeout(timer); const f = out.split('\n').filter((l) => l.startsWith('FAIL')).map((l) => l.slice(5, 95)); rmSync(d, { recursive: true, force: true }); resolve(code === 0 ? { killed: false } : { killed: true, by: f[0] || err.split('\n').find((l) => l.trim()) || 'crash' }); });
});

const main = async () => {
  if (process.env.DRY) {
    let bad = 0; for (const [name, file, a] of M) { const n = SRC[file].split(a).length - 1; if (n !== 1) { bad++; console.log('??   ' + name + ': the text to change occurs ' + n + ' times'); } }
    console.log(M.length + ' mutants, ' + bad + ' with text that is not there exactly once'); rmSync(base, { recursive: true, force: true }); process.exit(bad ? 1 : 0);
  }
  const b = await run('original', 'core', SRC.core);
  if (b.killed) { console.log('the unmutated copy fails:', b.by); process.exit(2); }
  const todo = [];
  for (const [name, file, a, c] of M) {
    if (only && !only.split('|').some((o) => name.includes(o))) continue;
    const n = SRC[file].split(a).length - 1;
    if (n !== 1) { console.log('??   ' + name + ': the text to change occurs ' + n + ' times'); continue; }
    todo.push([name, file, SRC[file].replace(a, () => c)]);
  }
  let killed = 0; const survived = []; let next = 0;
  await Promise.all(Array.from({ length: jobs }, async () => {
    while (next < todo.length) {
      const [name, file, text] = todo[next++], r = await run(name, file, text);
      if (r.killed) { killed++; console.log('kill ' + name + '  <- ' + r.by); } else { survived.push(name); console.log('SURVIVED ' + name); }
    }
  }));
  console.log('\n' + killed + ' of ' + todo.length + ' mutants killed' + (survived.length ? '; survived: ' + survived.join(', ') : ''));
  rmSync(base, { recursive: true, force: true });
  process.exit(survived.length ? 1 : 0);
};
main();
