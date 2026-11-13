// Mutation testing of the colours of the editor's maps (src/severe-editor-paint.js): each mutant changes one expression or one stop, and tests/severe_editor.mjs runs against the copy.
// A mutant that the test lets through ("survived") is a place where it does not look.
//   node tools/severe_editor_mutants.mjs [name-filter] [jobs=4]
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir, cpus } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(root, 'src/severe-editor-paint.js'), 'utf8');
// [name, the text to find (once), its replacement]
// Three changes that cannot be seen are left out: the comparisons at the stops (`<=` for `<` in the two places: a value at a stop gets that stop's colour from either segment).
const M = [
  ['color-missing', "typeof v !== 'number' || !(v === v)", '!(v === v)'],
  ['color-nan', "typeof v !== 'number' || !(v === v)", "typeof v !== 'number'"],
  ['color-transparent', "return [0, 0, 0, 0];\n    if (v <= S[0][0])", "return [0, 0, 0, 1];\n    if (v <= S[0][0])"],
  ['color-low-end', 'return [S[0][1], S[0][2], S[0][3], S[0][4]];', 'return [S[1][1], S[1][2], S[1][3], S[1][4]];'],
  ['color-fraction', 'f = (v - a[0]) / (b[0] - a[0]);', 'f = 0.5;'],
  ['color-fraction-denominator', 'f = (v - a[0]) / (b[0] - a[0]);', 'f = (v - a[0]) / b[0];'],
  ['color-red', 'return [a[1] + (b[1] - a[1]) * f,', 'return [a[1],'],
  ['color-green', ' a[2] + (b[2] - a[2]) * f,', ' a[2],'],
  ['color-blue', ' a[3] + (b[3] - a[3]) * f,', ' a[3],'],
  ['color-alpha', ' a[4] + (b[4] - a[4]) * f];', ' a[4]];'],
  ['color-high-end', 'const e = S[S.length - 1]; return [e[1], e[2], e[3], e[4]];', 'const e = S[S.length - 2]; return [e[1], e[2], e[3], e[4]];'],
  ['color-high-end-alpha', 'const e = S[S.length - 1]; return [e[1], e[2], e[3], e[4]];', 'const e = S[S.length - 1]; return [e[1], e[2], e[3], 1];'],
  ['layer-find', "LAYERS.find((l) => l.id === id) || null", "LAYERS.find((l) => l.id === id) || LAYERS[0]"],
  ['layer-field', "{ id: 'Td', field: 'Td',", "{ id: 'Td', field: 'T',"],
  ['cape-yellow', '[2000, 255, 235, 60, .55]', '[2000, 255, 235, 90, .55]'],
  ['cape-orange', '[3000, 255, 150, 40, .6]', '[3000, 255, 170, 40, .6]'],
  ['cape-first-alpha', '[0, 120, 200, 255, 0], [100,', '[0, 120, 200, 255, .1], [100,'],
  ['cape-top', '[5000, 255, 60, 200, .7]', '[5000, 255, 60, 200, .9]'],
  ['shear-start', '[[10, 110, 200, 255, 0], [15,', '[[10, 110, 200, 255, .3], [15,'],
  ['srh-start', '[[0, 110, 200, 255, 0], [50, 110, 200, 255, .3], [100,', '[[0, 110, 200, 255, .2], [50, 110, 200, 255, .3], [100,'],
  ['stp-start', '[[0, 110, 200, 255, 0], [.5,', '[[0, 110, 200, 255, .2], [.5,'],
  ['temp-cold', '[-10, 80, 120, 255, .55]', '[-10, 255, 120, 80, .55]'],
  ['temp-zero', '[0, 60, 190, 255, .55]', '[0, 60, 90, 255, .55]'],
  ['temp-hot', '[30, 255, 150, 50, .58], [40, 255, 60, 60, .6]', '[30, 255, 150, 50, .58], [40, 255, 160, 60, .6]'],
  ['dew-alpha', '[5, 205, 185, 95, .5]', '[5, 205, 185, 95, .1]'],
  ['range-temp', "name: 'Temperature', kind: 'temp', range: [-20, 40]", "name: 'Temperature', kind: 'temp', range: [-20, 60]"],
];

const only = process.argv.slice(2).find((a) => !a.startsWith('jobs=')), jobs = +((process.argv.find((a) => a.startsWith('jobs=')) || '').slice(5)) || Math.min(4, cpus().length);
const base = mkdtempSync(join(tmpdir(), 'sev-edmut-'));
const prepare = (name, text) => {
  const d = join(base, name);
  for (const x of ['src', 'tests']) mkdirSync(join(d, x), { recursive: true });
  copyFileSync(join(root, 'tests/severe_editor.mjs'), join(d, 'tests/severe_editor.mjs'));
  for (const f of ['severe-core.js', 'severe-sounding.js', 'severe-analysis.js', 'severe-draw.js']) copyFileSync(join(root, 'src/' + f), join(d, 'src/' + f));
  writeFileSync(join(d, 'src/severe-editor-paint.js'), text);
  return d;
};
const run = (name, text) => new Promise((resolve) => {
  const d = prepare(name, text), p = spawn('node', ['tests/severe_editor.mjs'], { cwd: d }); let out = '', err = '';
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
