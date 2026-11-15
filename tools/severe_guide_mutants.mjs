// Mutation testing of the guidance of the editor (src/severe-guide.js): each mutant changes one expression or threshold, and tests/severe_guide.mjs runs against the copy.
// A mutant that the test lets through ("survived") is a place where it does not look.
//   node tools/severe_guide_mutants.mjs [name-filter] [jobs=4]
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir, cpus } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(root, 'src/severe-guide.js'), 'utf8');
// [name, the text to find (once), its replacement]
// One change cannot be seen and is left out: a contrast that is not given (`o.contrast !== undefined && o.contrast < 2`: undefined is under nothing).
const M = [
  // the side of a line
  ['side-left-x', 'const lx = -dy / L, ly = dx / L;', 'const lx = dy / L, ly = dx / L;'],
  ['side-left-y', 'const lx = -dy / L, ly = dx / L;', 'const lx = -dy / L, ly = -dx / L;'],
  ['side-right', "return side === 'right' ? [-lx, -ly] : [lx, ly];", "return side === 'right' ? [lx, ly] : [-lx, -ly];"],
  ['side-right-half', "[-lx, -ly] : [lx, ly]", "[-lx, ly] : [lx, ly]"],
  ['side-chord', 'b = pts[pts.length - 1], dx', 'b = pts[1], dx'],
  ['side-none', 'if (!(L > 0)) return null;', 'if (L < 0) return null;'],
  // the length of a line
  ['length-sum', 's += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);', 's = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);'],
  ['length-limit', 'lengthOf(o.pts) < 40', 'lengthOf(o.pts) <= 40'],
  ['length-limit-more', 'lengthOf(o.pts) < 40', 'lengthOf(o.pts) < 50'],
  ['length-trough', "['front', 'dryline', 'outflow', 'trough'].includes(o.type)", "['front', 'dryline', 'outflow'].includes(o.type)"],
  ['length-outflow', "['front', 'dryline', 'outflow', 'trough'].includes(o.type)", "['front', 'dryline', 'trough'].includes(o.type)"],
  ['length-jet', "['front', 'dryline', 'outflow', 'trough'].includes(o.type)", "['front', 'dryline', 'outflow', 'trough', 'jet'].includes(o.type)"],
  // which side of a line looks where, and the arrow of a flipped line
  ['face-sign', 'function faceSide(pts, dir) { return dotN(pts, \'left\', dir) < 0 ? \'right\' : \'left\'; }', 'function faceSide(pts, dir) { return dotN(pts, \'left\', dir) > 0 ? \'right\' : \'left\'; }'],
  ['face-from-the-right', 'function faceSide(pts, dir) { return dotN(pts, \'left\', dir) < 0', 'function faceSide(pts, dir) { return dotN(pts, \'right\', dir) < 0'],
  ['face-tie', 'return dotN(pts, \'left\', dir) < 0 ? \'right\' : \'left\'; }', 'return dotN(pts, \'left\', dir) <= 0 ? \'right\' : \'left\'; }'],
  ['dot-x-only', 'return n ? n[0] * m[0] + n[1] * m[1] : 0; };', 'return n ? n[0] * m[0] : 0; };'],
  ['dot-sum', 'return n ? n[0] * m[0] + n[1] * m[1] : 0; };', 'return n ? n[0] * m[0] - n[1] * m[1] : 0; };'],
  ['dot-no-line', 'return n ? n[0] * m[0] + n[1] * m[1] : 0; };', 'return n ? n[0] * m[0] + n[1] * m[1] : 1; };'],
  ['motion-side-sign', "return Math.abs(d) < 1e-9 ? null : d > 0 ? 'left' : 'right'; }", "return Math.abs(d) < 1e-9 ? null : d > 0 ? 'right' : 'left'; }"],
  ['motion-side-along', "return Math.abs(d) < 1e-9 ? null : d > 0", "return Math.abs(d) < 1e-9 ? 'left' : d > 0"],
  ['motion-side-threshold', "Math.abs(d) < 1e-9 ? null", "Math.abs(d) < 1 ? null"],
  ['motion-side-missing-part', "dotN(pts, 'left', [m.u || 0, m.v || 0])", "dotN(pts, 'left', [m.u || 0, 0])"],
  ['reflect-once', 'return { u: Math.round((m.u - 2 * d * n[0]) * 10) / 10, v: Math.round((m.v - 2 * d * n[1]) * 10) / 10 };', 'return { u: Math.round((m.u - d * n[0]) * 10) / 10, v: Math.round((m.v - d * n[1]) * 10) / 10 };'],
  ['reflect-turns-all', 'return { u: Math.round((m.u - 2 * d * n[0]) * 10) / 10, v: Math.round((m.v - 2 * d * n[1]) * 10) / 10 };', 'return { u: -m.u, v: -m.v };'],
  ['reflect-u-only', 'v: Math.round((m.v - 2 * d * n[1]) * 10) / 10 };', 'v: m.v };'],
  ['reflect-rounding', 'return { u: Math.round((m.u - 2 * d * n[0]) * 10) / 10, v: Math.round((m.v - 2 * d * n[1]) * 10) / 10 };', 'return { u: m.u - 2 * d * n[0], v: m.v - 2 * d * n[1] };'],
  ['reflect-dot', 'const d = n[0] * m.u + n[1] * m.v; return', 'const d = n[0] * m.u; return'],
  ['reflect-no-line', 'if (!n) return { u: m.u, v: m.v };', 'if (!n) return { u: 0, v: 0 };'],
  // the outflow boundary's warning
  ['outflow-boundary', 'toward > 1) out.push({ level: \'warn\', index, text: \'This outflow', 'toward > 0) out.push({ level: \'warn\', index, text: \'This outflow'],
  ['outflow-side', "sideNormal(o.pts, o.cool || 'left') : null, toward", "sideNormal(o.pts, o.cool || 'right') : null, toward"],
  ['outflow-direction', "toCool = lined ? sideNormal(o.pts, o.cool || 'left') : null, toward = toCool ? (m.u || 0) * toCool[0] + (m.v || 0) * toCool[1] : 0;", "toCool = lined ? sideNormal(o.pts, o.cool || 'left') : null, toward = toCool ? -((m.u || 0) * toCool[0] + (m.v || 0) * toCool[1]) : 0;"],
  ['outflow-level', "level: 'warn', index, text: 'This outflow", "level: 'info', index, text: 'This outflow"],
  ['outflow-index', "out.push({ level: 'warn', index, text: 'This outflow", "out.push({ level: 'warn', index: 0, text: 'This outflow"],
  // the warnings
  ['cold-boundary', 'toward > 1) out.push', 'toward > 0) out.push'],
  ['cold-boundary-equal', 'toward > 1) out.push', 'toward >= 1) out.push'],
  ['cold-occluded', "(kind === 'cold' || kind === 'occluded') && toward > 1", "(kind === 'cold') && toward > 1"],
  ['cold-kind-default', "const kind = o.kind || 'cold', cold", "const kind = o.kind || 'warm', cold"],
  ['cold-side-default', "cold = o.cold || 'left', toCold", "cold = o.cold || 'right', toCold"],
  ['cold-level', "{ level: 'warn', index, text: 'This ' + name[kind]", "{ level: 'info', index, text: 'This ' + name[kind]"],
  ['warm-boundary', "kind === 'warm' && toward < -1", "kind === 'warm' && toward < 0"],
  ['warm-boundary-equal', "kind === 'warm' && toward < -1", "kind === 'warm' && toward <= -1"],
  ['warm-direction', "kind === 'warm' && toward < -1", "kind === 'warm' && toward > 1"],
  ['motion-u', '(m.u || 0) * toCold[0]', 'm.u * toCold[0]'],
  ['motion-v', '(m.v || 0) * toCold[1]', 'm.v * toCold[1]'],
  ['motion-speed', 'sp = Math.hypot(m.u || 0, m.v || 0)', 'sp = Math.abs(m.u || 0)'],
  ['stationary-limit', "kind === 'stationary' && sp > 3", "kind === 'stationary' && sp > 2"],
  ['stationary-limit-equal', "kind === 'stationary' && sp > 3", "kind === 'stationary' && sp >= 3"],
  ['stationary-level', "{ level: 'info', index, text: 'A stationary front", "{ level: 'warn', index, text: 'A stationary front"],
  ['front-contrast-limit', 'o.contrast < 2)', 'o.contrast <= 2)'],
  ['front-contrast-more', 'o.contrast < 2)', 'o.contrast < 3)'],
  ['dryline-limit', 'o.contrast < 3)', 'o.contrast <= 3)'],
  ['dryline-limit-more', 'o.contrast < 3)', 'o.contrast < 4)'],
  ['dryline-level', "{ level: 'warn', index, text: 'A dryline needs", "{ level: 'info', index, text: 'A dryline needs"],
  ['no-drawing', '(drawing && drawing.objects) || []', 'drawing.objects || []'],
  ['index', 'out.push({ level: \'warn\', index, text: \'A dryline', 'out.push({ level: \'warn\', index: 0, text: \'A dryline'],
  // what to expect
  ['cape-limit', '!(cape >= 250)', '!(cape > 250)'],
  ['cape-limit-more', '!(cape >= 250)', '!(cape >= 300)'],
  ['cape-not-a-number', '!(cape >= 250)', 'cape < 250'],
  ['cin-limit', 'cin <= -150) mode', 'cin < -150) mode'],
  ['cin-limit-more', 'cin <= -150) mode', 'cin <= -100) mode'],
  ['super-shear', "else if (sh >= 18 && srh3 >= 150) mode = 'Supercells.'", "else if (sh > 18 && srh3 >= 150) mode = 'Supercells.'"],
  ['super-srh', "else if (sh >= 18 && srh3 >= 150) mode = 'Supercells.'", "else if (sh >= 18 && srh3 > 150) mode = 'Supercells.'"],
  ['super-shear-less', "else if (sh >= 18 && srh3 >= 150) mode = 'Supercells.'", "else if (sh >= 15 && srh3 >= 150) mode = 'Supercells.'"],
  ['super-needs-srh', "else if (sh >= 18 && srh3 >= 150) mode = 'Supercells.'", "else if (sh >= 18) mode = 'Supercells.'"],
  ['multi-shear', "else if (sh >= 15) mode = 'Organised", "else if (sh > 15) mode = 'Organised"],
  ['hazard-block-cin', 'if (cape >= 250 && cin > -150) {', 'if (cape >= 250 && cin >= -150) {'],
  ['hazard-block-cape', 'if (cape >= 250 && cin > -150) {', 'if (cin > -150) {'],
  ['hail-limit', "if (cape >= 2000) hazards.push(cape >= 3000 ?", "if (cape > 2000) hazards.push(cape >= 3000 ?"],
  ['hail-very', "hazards.push(cape >= 3000 ? 'very large hail' : 'large hail')", "hazards.push(cape > 3000 ? 'very large hail' : 'large hail')"],
  ['tornado-stp', "if (stp >= 1 && lcl < 1500) hazards.push(stp >= 3", "if (stp > 1 && lcl < 1500) hazards.push(stp >= 3"],
  ['tornado-lcl', "if (stp >= 1 && lcl < 1500)", "if (stp >= 1 && lcl <= 1500)"],
  ['tornado-strong', "hazards.push(stp >= 3 ? 'strong tornadoes'", "hazards.push(stp > 3 ? 'strong tornadoes'"],
  ['tornado-weak-srh', "else if (srh1 >= 100 && lcl < 1500)", "else if (srh1 > 100 && lcl < 1500)"],
  ['tornado-weak-lcl', "else if (srh1 >= 100 && lcl < 1500)", "else if (srh1 >= 100 && lcl <= 1500)"],
  ['wind-supercell', "hazards.push('damaging wind');\n      } else if (sh >= 15) {", "\n      } else if (sh >= 15) {"],
  ['wind-multicell', "{ hazards.push('damaging wind'); if (cape >= 2000)", "{ if (cape >= 2000)"],
  ['multi-hail', "hazards.push('damaging wind'); if (cape >= 2000) hazards.push('large hail'); }", "hazards.push('damaging wind'); if (cape > 2000) hazards.push('large hail'); }"],
  ['pulse-hail', "hazards.push(cape >= 1500 ? 'downbursts and hail'", "hazards.push(cape > 1500 ? 'downbursts and hail'"],
  ['note-cap', 'if (cin <= -50) notes.push', 'if (cin < -50) notes.push'],
  ['note-high-base', 'if (lcl >= 1500) notes.push', 'if (lcl > 1500) notes.push'],
  ['note-low-base', 'else if (lcl < 1000) notes.push', 'else if (lcl <= 1000) notes.push'],
];

const only = process.argv.slice(2).find((a) => !a.startsWith('jobs=')), jobs = +((process.argv.find((a) => a.startsWith('jobs=')) || '').slice(5)) || Math.min(4, cpus().length);
const base = mkdtempSync(join(tmpdir(), 'sev-gdmut-'));
const prepare = (name, text) => {
  const d = join(base, name);
  for (const x of ['src', 'tests']) mkdirSync(join(d, x), { recursive: true });
  copyFileSync(join(root, 'tests/severe_guide.mjs'), join(d, 'tests/severe_guide.mjs'));
  writeFileSync(join(d, 'src/severe-guide.js'), text);
  return d;
};
const run = (name, text) => new Promise((resolve) => {
  const d = prepare(name, text), p = spawn('node', ['tests/severe_guide.mjs'], { cwd: d }); let out = '', err = '';
  const timer = setTimeout(() => p.kill('SIGKILL'), 60000);
  p.stdout.on('data', (b) => { out += b; }); p.stderr.on('data', (b) => { err += b; });
  p.on('close', (code) => { clearTimeout(timer); const f = out.split('\n').filter((l) => l.startsWith('FAIL')).map((l) => l.slice(5, 90)); rmSync(d, { recursive: true, force: true }); resolve(code === 0 ? { killed: false } : { killed: true, by: f[0] || err.split('\n').find((l) => l.trim()) || 'crash' }); });
});

const main = async () => {
  const b = await run('original', SRC);
  if (b.killed) { console.log('the unmutated copy fails:', b.by); process.exit(2); }
  const todo = [];
  for (const [name, a, c] of M) {
    if (only && !name.includes(only)) continue;
    const n = SRC.split(a).length - 1;
    if (n !== 1) { console.log('??   ' + name + ': the text to change occurs ' + n + ' times'); continue; }
    todo.push([name, SRC.replace(a, () => c)]);
  }
  let killed = 0; const survived = []; let next = 0;
  await Promise.all(Array.from({ length: jobs }, async () => {
    while (next < todo.length) {
      const [name, text] = todo[next++], r = await run(name, text);
      if (r.killed) { killed++; console.log('kill ' + name + '  <- ' + r.by); } else { survived.push(name); console.log('SURVIVED ' + name); }
    }
  }));
  console.log('\n' + killed + ' of ' + todo.length + ' mutants killed' + (survived.length ? '; survived: ' + survived.join(', ') : ''));
  rmSync(base, { recursive: true, force: true });
  process.exit(survived.length ? 1 : 0);
};
main();
