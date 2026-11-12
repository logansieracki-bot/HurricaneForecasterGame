// Mutation testing of the radar reflectivity of a core's state (src/severe-refl.js): each mutant changes one expression, and tests/severe_refl.mjs runs against the copy.
// A mutant that the tests let through ("survived") is a place where they do not look.
//   node tools/severe_refl_mutants.mjs [name-filter] [jobs=4]
// Each copy goes to its own temporary directory with the test beside it, so nothing in the repository is touched and the copies run side by side.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir, cpus } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = { core: 'severe-core.js', refl: 'severe-refl.js' };
const SRC = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, readFileSync(join(root, 'src/' + f), 'utf8')]));
const DATA = [];
// [name, file, the text to find (once), its replacement]
// (Changes that make no difference, and so are not here: the comparison at exactly 0 C, which no test state sits on; the wet fraction's 0.99, as the cap or as the value without a reference,
//  changed to anything above 0.25, because a quarter of the mass as water is already the value of water.)
const M = [
  // the definitions
  ['kice-value', 'refl', 'KICE = 0.176 / 0.93', 'KICE = 0.176 / 0.9'],
  ['slope-exponent', 'refl', 'rho * q), 0.25)', 'rho * q), 0.3)'],
  ['slope-no-pi', 'refl', 'Math.pow(Math.PI * rhox * n0 / (rho * q), 0.25)', 'Math.pow(rhox * n0 / (rho * q), 0.25)'],
  ['floor-threshold', 'refl', 'z > 1e-3 ? 10 * Math.log10(z) : -30', 'z > 1e-2 ? 10 * Math.log10(z) : -30'],
  ['floor-value', 'refl', 'z > 1e-3 ? 10 * Math.log10(z) : -30', 'z > 1e-3 ? 10 * Math.log10(z) : -20'],
  ['units-1e18', 'refl', 'res[k] = dbzOf(z * 1e18);', 'res[k] = dbzOf(z * 1e17);'],
  // Kessler
  ['kessler-coefficient', 'refl', '10 * Math.log10(17300 * Math.pow(g, 1.75))', '10 * Math.log10(1730 * Math.pow(g, 1.75))'],
  ['kessler-exponent', 'refl', '10 * Math.log10(17300 * Math.pow(g, 1.75))', '10 * Math.log10(17300 * Math.pow(g, 1.5))'],
  ['kessler-threshold', 'refl', 'g > 1e-6 ?', 'g > 1e-3 ?'],
  ['kessler-fall-speed', 'refl', 'if (vzres) vzres[k] = core.zFall.rain(q, k); }\n        return;', 'if (vzres) vzres[k] = 0; }\n        return;'],
  ['ice-flag-ignored', 'refl', 'ice = !!core.ice', 'ice = true'],
  // rain
  ['rain-intercept-fixed', 'refl', 'lamOf(P.n0r, 1000, rho, S.qr[o]), zr = 720 * P.n0r / Math.pow(l, 7)', 'lamOf(8e6, 1000, rho, S.qr[o]), zr = 720 * 8e6 / Math.pow(l, 7)'],
  ['rain-intercept-in-z-only', 'refl', 'lamOf(P.n0r, 1000, rho, S.qr[o]), zr = 720 * P.n0r / Math.pow(l, 7)', 'lamOf(P.n0r, 1000, rho, S.qr[o]), zr = 720 * 8e6 / Math.pow(l, 7)'],
  ['rain-density', 'refl', 'lamOf(P.n0r, 1000, rho, S.qr[o])', 'lamOf(P.n0r, 900, rho, S.qr[o])'],
  ['rain-power-6', 'refl', '720 * P.n0r / Math.pow(l, 7)', '720 * P.n0r / Math.pow(l, 6)'],
  ['rain-720', 'refl', '720 * P.n0r / Math.pow(l, 7)', '72 * P.n0r / Math.pow(l, 7)'],
  ['rain-threshold', 'refl', 'if (S.qr[o] > 1e-9) {', 'if (S.qr[o] > 1e-5) {'],
  ['rain-fall-speed-unweighted', 'refl', 'zv += zr * core.zFall.rain(S.qr[o], k);', 'zv += core.zFall.rain(S.qr[o], k);'],
  ['settings-not-the-cores', 'refl', 'P = core.iceParams || {', 'P = {'],
  // snow and graupel
  ['snow-slope-law', 'refl', '2e6 * Math.exp(0.12 * Math.max(0, T0 - T))', '2e6 * Math.exp(0.10 * Math.max(0, T0 - T))'],
  ['snow-intercept-cap', 'refl', 'Math.min(2e8, 2e6 * Math.exp', 'Math.min(2e9, 2e6 * Math.exp'],
  ['snow-intercept-base', 'refl', '2e6 * Math.exp(0.12 * Math.max(0, T0 - T))', '4e6 * Math.exp(0.12 * Math.max(0, T0 - T))'],
  ['snow-warm-intercept', 'refl', 'Math.exp(0.12 * Math.max(0, T0 - T))', 'Math.exp(0.12 * (T0 - T))'],
  ['snow-density', 'refl', 'rx = snow ? 100 : P.rhog', 'rx = snow ? 200 : P.rhog'],
  ['graupel-density-setting', 'refl', 'rx = snow ? 100 : P.rhog', 'rx = snow ? 100 : 400'],
  ['graupel-intercept-setting', 'refl', 'n0 = snow ? Math.min(2e8, 2e6 * Math.exp(0.12 * Math.max(0, T0 - T))) : P.n0g', 'n0 = snow ? Math.min(2e8, 2e6 * Math.exp(0.12 * Math.max(0, T0 - T))) : 4e6'],
  ['ice-sphere-density-factor', 'refl', 'Math.pow(rx / 900, 2)', 'Math.pow(rx / 1000, 2)'],
  ['ice-threshold', 'refl', 'if (q <= 1e-9) continue;', 'if (q <= 1e-6) continue;'],
  ['ice-species-swapped', 'refl', 'q = snow ? S.qs[o] : S.qg[o]', 'q = snow ? S.qg[o] : S.qs[o]'],
  ['ice-fall-speed-species', 'refl', '(snow ? core.zFall.snow(q, k, o) : core.zFall.graupel(q, k))', '(snow ? core.zFall.graupel(q, k) : core.zFall.snow(q, k, o))'],
  ['ice-fall-speed-unweighted', 'refl', 'zv += zs * (snow ?', 'zv += (snow ?'],
  ['fall-speed-not-divided', 'refl', 'vzres[k] = z > 0 ? zv / z : 0;', 'vzres[k] = zv;'],
  // wet ice
  ['wet-reference-swapped', 'refl', 'mref = snow ? msRef : mgRef', 'mref = snow ? mgRef : msRef'],
  ['wet-water-above-freezing', 'refl', 'if (T > T0) wet =', 'if (T > T0 + 40) wet ='],
  ['wet-no-reference-fraction', 'refl', ': 0.99;\n          const kk', ': 0.1;\n          const kk'],
  ['wet-cap', 'refl', 'Math.min(1 - rho * q / mref, 0.99)', 'Math.min(1 - rho * q / mref, 0.1)'],
  ['wet-floor', 'refl', 'Math.max(0.005, Math.min(', 'Math.max(0.05, Math.min('],
  ['wet-share-no-density', 'refl', '1 - rho * q / mref', '1 - q / mref'],
  ['wet-quarter', 'refl', 'Math.min(1, wet / 0.25)', 'Math.min(1, wet / 0.5)'],
  ['wet-not-capped-at-water', 'refl', 'KICE + (1 - KICE) * Math.min(1, wet / 0.25)', 'KICE + (1 - KICE) * wet / 0.25'],
  ['reference-from-below', 'refl', 'for (let k = nz - 1; k >= 0; k--) if (tcol[k] <= T0) { kz = k; break; }', 'for (let k = 0; k < nz; k++) if (tcol[k] <= T0) { kz = k; break; }'],
  ['reference-mass-air-density', 'refl', 'b.rhoc[kz] * S.qs[idx(i, j, kz)]', 'S.qs[idx(i, j, kz)]'],
  ['temperature-without-pressure', 'refl', '(b.thc[k] + S.th[o]) * (b.pibc[k] + S.pi[o])', '(b.thc[k] + S.th[o]) * b.pibc[k]'],
  ['temperature-without-theta-perturbation', 'refl', '(b.thc[k] + S.th[o]) * (b.pibc[k] + S.pi[o])', 'b.thc[k] * (b.pibc[k] + S.pi[o])'],
];

const only = process.argv.slice(2).find((a) => !a.startsWith('jobs=')), jobs = +((process.argv.find((a) => a.startsWith('jobs=')) || '').slice(5)) || Math.min(4, cpus().length);
const base = mkdtempSync(join(tmpdir(), 'sev-rmut-'));
const prepare = (name, file, text) => {
  const d = join(base, name);
  for (const x of ['src', 'tests', 'data/generated', 'data/severe/packs']) mkdirSync(join(d, x), { recursive: true });
  copyFileSync(join(root, 'tests/severe_refl.mjs'), join(d, 'tests/severe_refl.mjs'));
  for (const x of DATA) copyFileSync(join(root, x), join(d, x));
  for (const k of Object.keys(FILES)) writeFileSync(join(d, 'src/' + FILES[k]), k === file ? text : SRC[k]);
  return d;
};
const run = (name, file, text) => new Promise((resolve) => {
  const d = prepare(name, file, text), p = spawn('node', ['tests/severe_refl.mjs'], { cwd: d }); let out = '', err = '';
  const timer = setTimeout(() => p.kill('SIGKILL'), 300000);
  p.stdout.on('data', (b) => { out += b; }); p.stderr.on('data', (b) => { err += b; });
  p.on('close', (code) => { clearTimeout(timer); const f = out.split('\n').filter((l) => l.startsWith('FAIL')).map((l) => l.slice(5, 90)); rmSync(d, { recursive: true, force: true }); resolve(code === 0 ? { killed: false } : { killed: true, by: f[0] || err.split('\n').find((l) => l.trim()) || 'crash' }); });
});

const main = async () => {
  const b = await run('original', 'core', SRC.core);
  if (b.killed) { console.log('the unmutated copy fails:', b.by); process.exit(2); }
  const todo = [];
  for (const [name, file, a, c] of M) {
    if (only && !name.includes(only)) continue;
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
