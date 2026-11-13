// Mutation testing of the ready-made days (src/severe-days.js): each mutant changes one expression or one number a story rests on, and tests/severe_days.mjs runs against the copy.
// A mutant that the test lets through ("survived") is a place where it does not look.
//   node tools/severe_days_mutants.mjs [name-filter] [jobs=4]
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir, cpus } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(root, 'src/severe-days.js'), 'utf8');
// [name, the text to find (once), its replacement]
const M = [
  // the functions
  ['get-no-copy', 'return d ? copy(d) : null;', 'return d || null;'],
  ['get-unknown', 'return d ? copy(d) : null;', 'return d ? copy(d) : L[0];'],
  ['copy-shallow', "const copy = (o) => JSON.parse(JSON.stringify(o));", "const copy = (o) => Object.assign({}, o);"],
  ['latitude-of-the-drawing', 'for (const d of L) d.drawing.lat = d.lat;', ''],
  ['blank-latitude-default', "lat: lat === undefined ? 36 : lat, lon: lon === undefined ? -98 : lon, spot", "lat: lat === undefined ? 40 : lat, lon: lon === undefined ? -98 : lon, spot"],
  ['blank-longitude-default', "lon: lon === undefined ? -98 : lon, spot", "lon: lon === undefined ? -90 : lon, spot"],
  ['blank-drawing-latitude', "drawing: { lat: lat === undefined ? 36 : lat, base", "drawing: { lat: 36, base"],
  ['blank-has-objects', "aloft: { speed: 30, from: 255 }, objects: [] } });", "aloft: { speed: 30, from: 255 }, objects: [{ type: 'low', x: 0, y: 0 }] } });"],
  ['blank-hour', "spot: { x: 0, y: 0, t: 3 }, story: ''", "spot: { x: 0, y: 0, t: 0 }, story: ''"],
  // the days: each number that a story rests on
  ['dryline-contrast', "dry: 'left', contrast: 15, motion: { u: 3, v: 0 } }", "dry: 'left', contrast: 3, motion: { u: 3, v: 0 } }"],
  ['dryline-side', "dry: 'left', contrast: 15, motion: { u: 3, v: 0 } }", "dry: 'right', contrast: 15, motion: { u: 3, v: 0 } }"],
  ['dryline-day-no-moisture', "{ type: 'moisture', pts: [[10, -520], [40, -280], [90, -20], [190, 190]], amount: 3.5, width: 220 },", ""],
  ['outbreak-jet-weak', "{ type: 'llj', pts: [[40, -520], [90, -260], [150, 0], [200, 180]], speed: 28 },", "{ type: 'llj', pts: [[40, -520], [90, -260], [150, 0], [200, 180]], speed: 8 },"],
  ['outbreak-aloft-weak', "base: 1012, aloft: { speed: 40, from: 240 },", "base: 1012, aloft: { speed: 20, from: 240 },"],
  ['line-front-weak', "cold: 'right', contrast: 14, motion: { u: 13, v: -1 } }", "cold: 'right', contrast: 5, motion: { u: 13, v: -1 } }"],
  ['line-front-side', "cold: 'right', contrast: 14, motion: { u: 13, v: -1 } }", "cold: 'left', contrast: 14, motion: { u: 13, v: -1 } }"],
  ['hail-no-high-base', "air: { warm: { theta0: 304, qv0: 15.5, ml: 1500, cap: 4.5, capDepth: 500, rhMax: 0.95, rhDry: 0.8, ztr: 13000, thetaTr: 348 } },", ""],
  ['hail-dry-air', "air: { warm: { theta0: 304, qv0: 15.5, ml: 1500,", "air: { warm: { theta0: 304, qv0: 9, ml: 1500,"],
  ['dixie-wet', "air: { warm: { theta0: 296, qv0: 12.5, ml: 700,", "air: { warm: { theta0: 301, qv0: 15.5, ml: 700,"],
  ['dixie-no-aloft', "base: 1011, aloft: { speed: 38, from: 240 },", "base: 1011, aloft: { speed: 10, from: 240 },"],
  ['pulse-windy', "base: 1016, aloft: { speed: 8, from: 250 },", "base: 1016, aloft: { speed: 35, from: 250 },"],
  ['pulse-dry', "air: { warm: { theta0: 300, qv0: 14, ml: 900,", "air: { warm: { theta0: 300, qv0: 8, ml: 900,"],
  ['derecho-cool', "air: { warm: { theta0: 303, qv0: 14.5, ml: 1200,", "air: { warm: { theta0: 299, qv0: 12, ml: 1200,"],
  ['derecho-calm', "base: 1012, aloft: { speed: 28, from: 265 },", "base: 1012, aloft: { speed: 6, from: 265 },"],
  ['low-no-motion', "{ type: 'low', x: -150, y: 90, depth: 15, size: 380, motion: { u: 6, v: 3.5 } },", "{ type: 'low', x: -150, y: 90, depth: 15, size: 380 },"],
  ['warm-front-no-motion', "cold: 'left', contrast: 9, motion: { u: 1.5, v: 3 } },", "cold: 'left', contrast: 9 },"],
];

const only = process.argv.slice(2).find((a) => !a.startsWith('jobs=')), jobs = +((process.argv.find((a) => a.startsWith('jobs=')) || '').slice(5)) || Math.min(4, cpus().length);
const base = mkdtempSync(join(tmpdir(), 'sev-dymut-'));
const prepare = (name, text) => {
  const d = join(base, name);
  for (const x of ['src', 'tests']) mkdirSync(join(d, x), { recursive: true });
  copyFileSync(join(root, 'tests/severe_days.mjs'), join(d, 'tests/severe_days.mjs'));
  for (const f of ['severe-core.js', 'severe-sounding.js', 'severe-analysis.js']) copyFileSync(join(root, 'src/' + f), join(d, 'src/' + f));
  writeFileSync(join(d, 'src/severe-days.js'), text);
  return d;
};
const run = (name, text) => new Promise((resolve) => {
  const d = prepare(name, text), p = spawn('node', ['tests/severe_days.mjs'], { cwd: d }); let out = '', err = '';
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
