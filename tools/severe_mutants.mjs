// Mutation testing of the Severe core's ice microphysics: each mutant changes one expression of src/severe-core.js, and the tests that should notice (tests/severe_ice.mjs,
// tests/severe_moist.mjs) run against the changed copy. A mutant that all of them let through ("survived") is a place where the tests do not look.
//   node tools/severe_mutants.mjs [name-filter]
// The copy goes to a temporary directory with the test files and the sounding beside it, so nothing in the repository is touched.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), src = readFileSync(join(root, 'src/severe-core.js'), 'utf8');
const M = [
  ['rain-evap-knob-ignored', 'dt * IPAR.evap * (((1.6 + 124.9', 'dt * (((1.6 + 124.9'],
  ['rain-intercept-fixed', 'const N0R = IPAR.n0r, RHOW = 1000,', 'const N0R = 8e6, RHOW = 1000,'],
  // melting
  ['melt-snow-heat-sign', 'qs -= d; qr += d; T -= lfK * d;', 'qs -= d; qr += d; T += lfK * d;'],
  ['melt-hail-no-cooling', 'qg -= d; qr += d; T -= lfK * d;', 'qg -= d; qr += d;'],
  ['melt-ice-no-cooling', 'if (qi > 0) { qc += qi; T -= lfK * qi; qi = 0; }', 'if (qi > 0) { qc += qi; qi = 0; }'],
  ['melt-no-limit', 'qs, (T - T0) / lfK); qs -= d;', 'qs, 1e9); qs -= d;'],
  ['melt-rate-halved', '2 * Math.PI * n0s * Q / (rho * LF)', 'Math.PI * n0s * Q / (rho * LF)'],
  // freezing
  ['hom-freeze-threshold', 'if (T < 233.15) {', 'if (T < 223.15) {'],
  ['hom-freeze-no-heat', 'if (qc > 0) { qi += qc; T += lfK * qc; qc = 0; }', 'if (qc > 0) { qi += qc; qc = 0; }'],
  ['hom-freeze-rain-to-snow', 'if (qr > 0) { qg += qr; T += lfK * qr; qr = 0; }', 'if (qr > 0) { qs += qr; T += lfK * qr; qr = 0; }'],
  ['bigg-exponent', 'Math.exp(0.66 * (T0 - T)) - 1', 'Math.exp(0.33 * (T0 - T)) - 1'],
  ['bigg-prefactor', '20 * Math.PI * Math.PI * 100 * N0R', '10 * Math.PI * Math.PI * 100 * N0R'],
  ['bigg-no-heat', 'qr -= d; qg += d; T += lfK * d;\n            if (qg > 1e-12 && lG === 0)', 'qr -= d; qg += d;\n            if (qg > 1e-12 && lG === 0)'],
  // riming and collection
  ['rime-snow-no-heat', 'qc -= d; qs += d; T += lfK * d; }\n            if (hasG)', 'qc -= d; qs += d; }\n            if (hasG)'],
  ['rime-sweep-doubled', 'E * Math.PI / 4 * n0 * a', 'E * Math.PI / 2 * n0 * a'],
  ['graupel-rain-no-heat', 'qr -= d; qg += d; T += lfK * d; }     // graupel collects rain', 'qr -= d; qg += d; }     // graupel collects rain'],
  ['graupel-collects-rain-off', 'if (hasG && lR > 0 && qr > 1e-12) {', 'if (false && hasG && lR > 0 && qr > 1e-12) {'],
  ['ice-collection-efficiency', 'Math.exp(0.025 * (T - T0)), n0s, VSa', '0.0, n0s, VSa'],
  ['ice-to-snow-threshold', '(qi - 5e-4)', '(qi - 5e-2)'],
  ['snow-to-graupel-threshold', '(qs - 6e-4)', '(qs - 6e-2)'],
  // deposition and sublimation
  ['dep-heat-is-Lv', 'qv -= dep; T += lsK * dep;', 'qv -= dep; T += lvK * dep;'],
  ['sub-heat-is-Lv', 'qv += tot; T -= lsK * tot;', 'qv += tot; T -= lvK * tot;'],
  ['dep-Gfactor', 'RVAP * T / (dv * e))', 'RVAP * T / (dv * e * 2))'],
  ['dep-ventilation', '0.78 / (l * l)', '0.39 / (l * l)'],
  ['dep-limit-off', 'Math.min(R * dt, Math.max(0, (qv - qsi) / gI))', 'R * dt'],
  ['esi-constant', '21.8745584 * (T - 273.16)', '17.2693882 * (T - 273.16)'],
  ['nucleation-exponent', 'Math.exp(0.304 * (T0 - T))', 'Math.exp(0.15 * (T0 - T))'],
  ['nucleation-off', 'if (excess > 0 && T < 268.15) {', 'if (false) {'],
  // saturation adjustment and rain evaporation
  ['condensation-heat-is-Ls', 'qc += pr; qv -= pr; T += lvK * pr;', 'qc += pr; qv -= pr; T += lsK * pr;'],
  ['rain-evap-heat-is-Ls', 'qr -= ern; qv += ern; T -= lvK * ern;', 'qr -= ern; qv += ern; T -= lsK * ern;'],
  // size distributions and fall
  ['lambda-exponent', 'Math.pow(Math.PI * rhox * n0 / (rho * q), 0.25)', 'Math.pow(Math.PI * rhox * n0 / (rho * q), 0.3)'],
  ['snow-n0-slope', 'N0S0 * Math.exp(0.12 * Math.max(0, T0 - T))', 'N0S0 * Math.exp(0.06 * Math.max(0, T0 - T))'],
  ['snow-fall-speed', 'VSa = 11.72', 'VSa = 5.0'],
  ['hail-fall-exponent', 'VGb = 0.5', 'VGb = 0.25'],
  ['ice-fall-speed', '3.29 * Math.pow(rhoc[k] * q, 0.16)', '3.29 * Math.pow(rhoc[k] * q, 0.32)'],
  ['mass-weighted-speed', 'gammaF(4 + b) / 6', 'gammaF(3 + b) / 6'],
  ['ground-accounting', 'precip[j * nx + i] += out; if (pr1)', 'if (pr1)'],
  ['hail-ground-accounting', 'if (pr2) pr2[j * nx + i] += out;', ''],
  ['sedimentation-courant', 'if (crmax === 0) continue;\n        let nfall = Math.max(1, Math.round(0.5 + crmax / KS.MAXCR))', 'if (crmax === 0) continue;\n        let nfall = Math.max(1, Math.round(0.5 + crmax / (8 * KS.MAXCR)))'],
  ['pressure-expansion', 'S.pi[o] += Cc[k] * rho * (th1 * (1 + RV1 * qv) - th0 * (1 + RV1 * qv0));', ''],
];

const only = process.argv[2], dir = mkdtempSync(join(tmpdir(), 'sev-mut-'));
for (const d of ['src', 'tests', 'tools/severe_research']) mkdirSync(join(dir, d), { recursive: true });
for (const f of ['tests/severe_ice.mjs', 'tests/severe_moist.mjs', 'tools/severe_research/wk82.mjs', 'tools/severe_research/wk82_sounding.txt']) copyFileSync(join(root, f), join(dir, f));
const run = (name, text) => {
  writeFileSync(join(dir, 'src/severe-core.js'), text);
  for (const t of ['tests/severe_ice.mjs', 'tests/severe_moist.mjs']) {
    const r = spawnSync('node', [t], { cwd: dir, encoding: 'utf8', timeout: 240000 });
    if (r.status !== 0) { const f = (r.stdout || '').split('\n').filter((l) => l.startsWith('FAIL')).map((l) => l.slice(5, 70)); return { killed: true, by: t.split('/')[1] + ': ' + (f[0] || (r.stderr || '').split('\n')[0] || 'crash') }; }
  }
  return { killed: false };
};
const base = run('original', src);
if (base.killed) { console.log('the unmutated copy fails:', base.by); process.exit(2); }
let killed = 0, survived = [], skipped = 0;
for (const [name, a, b] of M) {
  if (only && !name.includes(only)) continue;
  const n = src.split(a).length - 1;
  if (n !== 1) { console.log('SKIP     ' + name + ' (the original text occurs ' + n + ' times)'); skipped++; continue; }
  if (a === b) { skipped++; continue; }
  const r = run(name, src.replace(a, () => b));
  if (r.killed) { killed++; console.log('killed   ' + name.padEnd(30) + ' by ' + r.by); } else { survived.push(name); console.log('SURVIVED ' + name); }
}
console.log('\n' + killed + ' killed, ' + survived.length + ' survived' + (skipped ? ', ' + skipped + ' skipped' : '') + (survived.length ? ': ' + survived.join(', ') : ''));
rmSync(dir, { recursive: true, force: true });
process.exit(survived.length ? 1 : 0);
