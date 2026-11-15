// Mutation testing of the plan of a run (src/severe-runplan.js): each mutant changes one expression, number or word, and tests/severe_runplan.mjs runs against the copy.
// A mutant that the test lets through ("survived") is a place where it does not look.
//   node tools/severe_runplan_mutants.mjs [name-filter] [jobs=4]
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir, cpus } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(root, 'src/severe-runplan.js'), 'utf8');
// [name, the text to find (once), its replacement]
const M = [
  // the model's own settings
  ['def-ground', 'ground: 0.1, evap: 1, bubble: 3, nest: 2, nestBox: 30, nestFrom: 20 };', 'ground: 0.3, evap: 1, bubble: 3, nest: 2, nestBox: 30, nestFrom: 20 };'],
  ['def-evap', 'ground: 0.1, evap: 1, bubble: 3, nest: 2, nestBox: 30, nestFrom: 20 };', 'ground: 0.1, evap: 0.5, bubble: 3, nest: 2, nestBox: 30, nestFrom: 20 };'],
  ['def-bubble', 'ground: 0.1, evap: 1, bubble: 3, nest: 2, nestBox: 30, nestFrom: 20 };', 'ground: 0.1, evap: 1, bubble: 4, nest: 2, nestBox: 30, nestFrom: 20 };'],
  ['def-nest', 'ground: 0.1, evap: 1, bubble: 3, nest: 2, nestBox: 30, nestFrom: 20 };', 'ground: 0.1, evap: 1, bubble: 3, nest: 3, nestBox: 30, nestFrom: 20 };'],
  ['def-nest-width', 'ground: 0.1, evap: 1, bubble: 3, nest: 2, nestBox: 30, nestFrom: 20 };', 'ground: 0.1, evap: 1, bubble: 3, nest: 2, nestBox: 40, nestFrom: 20 };'],
  ['def-nest-start', 'ground: 0.1, evap: 1, bubble: 3, nest: 2, nestBox: 30, nestFrom: 20 };', 'ground: 0.1, evap: 1, bubble: 3, nest: 2, nestBox: 30, nestFrom: 10 };'],
  // the rows
  ['row-ground-none', "opts: [[0, 'None'], [0.03, 'Smooth']", "opts: [[0, 'Off'], [0.03, 'Smooth']"],
  ['row-ground-smooth', "[0.03, 'Smooth']", "[0.05, 'Smooth']"],
  ['row-ground-crops', "[0.3, 'Crops']", "[0.5, 'Crops']"],
  ['row-ground-trees', "[1, 'Trees']", "[2, 'Trees']"],
  ['row-evap-half', "[0.5, 'Half']", "[0.6, 'Half']"],
  ['row-evap-light', "[0.3, 'Light']", "[0.2, 'Light']"],
  ['row-bubble-2', "[[2, '2 K'], [3, '3 K']", "[[1, '2 K'], [3, '3 K']"],
  ['row-bubble-5', "[5, '5 K']", "[6, '5 K']"],
  ['row-nest-333', "[3, '333 m']", "[3, '300 m']"],
  ['row-nest-250', "[4, '250 m']", "[5, '250 m']"],
  ['row-nest-width-20', "[[20, '20 km'], [30, '30 km']", "[[15, '20 km'], [30, '30 km']"],
  ['row-nest-width-40', "[40, '40 km']", "[50, '40 km']"],
  ['row-nest-start-10', "[[10, 'minute 10']", "[[5, 'minute 10']"],
  ['row-nest-start-30', "[30, 'minute 30']", "[40, 'minute 30']"],
  ['row-nest-not-fine-only', "{ id: 'nest', title: 'Nest cells', fine: true,", "{ id: 'nest', title: 'Nest cells',"],
  ['row-nest-width-not-fine-only', "{ id: 'nestBox', title: 'Nest width', fine: true,", "{ id: 'nestBox', title: 'Nest width',"],
  ['row-nest-start-not-fine-only', "{ id: 'nestFrom', title: 'Nest starts', fine: true,", "{ id: 'nestFrom', title: 'Nest starts',"],
  ['row-bubble-fine-only', "{ id: 'bubble', title: 'Warm bubble',", "{ id: 'bubble', title: 'Warm bubble', fine: true,"],
  ['row-order', "{ id: 'evap', title: 'Rain evaporation',", "{ id: 'evapx', title: 'Rain evaporation',"],
  ['row-hint-lost', "hint: 'How wide the nest is, round the storm. A wider one holds more of the storm\\'s edges and costs by its area.'", "hint: ''"],
  // the nest, the fine model, the quick one
  ['detail-cells', 'const DETAIL = { dx: 500,', 'const DETAIL = { dx: 250,'],
  ['detail-width', 'box: 30000, from: 20, ztop: 8000, every: 1, cost: 3.1, boxRate: 15 }', 'box: 20000, from: 20, ztop: 8000, every: 1, cost: 3.1, boxRate: 15 }'],
  ['detail-start', 'box: 30000, from: 20, ztop: 8000, every: 1, cost: 3.1, boxRate: 15 }', 'box: 30000, from: 10, ztop: 8000, every: 1, cost: 3.1, boxRate: 15 }'],
  ['detail-top', 'from: 20, ztop: 8000, every: 1, cost: 3.1, boxRate: 15 }', 'from: 20, ztop: 6000, every: 1, cost: 3.1, boxRate: 15 }'],
  ['detail-every', 'ztop: 8000, every: 1, cost: 3.1, boxRate: 15 }', 'ztop: 8000, every: 2, cost: 3.1, boxRate: 15 }'],
  ['detail-cost', 'every: 1, cost: 3.1, boxRate: 15 }', 'every: 1, cost: 3.8, boxRate: 15 }'],
  ['detail-box-rate', 'cost: 3.1, boxRate: 15 }', 'cost: 3.1, boxRate: 9 }'],
  ['fine-cells', 'FINE = { dx: 1000, dt: 5,', 'FINE = { dx: 500, dt: 5,'],
  ['fine-step', 'FINE = { dx: 1000, dt: 5,', 'FINE = { dx: 1000, dt: 10,'],
  ['fine-box', 'box: 108000, window: 96000, detail: DETAIL }', 'box: 120000, window: 96000, detail: DETAIL }'],
  ['fine-window', 'box: 108000, window: 96000, detail: DETAIL }', 'box: 108000, window: 90000, detail: DETAIL }'],
  ['fine-no-nest', 'window: 96000, detail: DETAIL }', 'window: 96000 }'],
  ['fast-box', 'FAST = { box: 128000 };', 'FAST = { box: 84000 };'],
  // how many are changed
  ['changed-never-differs', 'st[k] !== SET_DEF[k] &&', 'st[k] === SET_DEF[k] &&'],
  ['changed-nest-always', '&& !(!fine && /^nest/.test(k))', ''],
  ['changed-nest-never', '&& !(!fine && /^nest/.test(k))', '&& !/^nest/.test(k)'],
  ['changed-nest-for-quick', '&& !(!fine && /^nest/.test(k))', '&& !(fine && /^nest/.test(k))'],
  ['changed-prefix', '/^nest/.test(k)', '/^nestB/.test(k)'],
  // what the nest costs
  ['factor-fixed-part', 'const FIXED = 0.36,', 'const FIXED = 0.5,'],
  ['factor-fixed-none', 'const FIXED = 0.36,', 'const FIXED = 0,'],
  ['factor-variable-part', 'FIXED + (1 - FIXED) * Math.pow(', 'FIXED + Math.pow('],
  ['factor-area-exponent', 'Math.pow(st.nestBox / 30, 2)', 'Math.pow(st.nestBox / 30, 1)'],
  ['factor-area-reference', 'Math.pow(st.nestBox / 30, 2)', 'Math.pow(st.nestBox / 40, 2)'],
  ['factor-steps-exponent', 'Math.pow(st.nest / 2, 3)', 'Math.pow(st.nest / 2, 2)'],
  ['factor-steps-reference', 'Math.pow(st.nest / 2, 3)', 'Math.pow(st.nest / 3, 3)'],
  ['factor-ignores-width', 'Math.pow(st.nestBox / 30, 2) * Math.pow(st.nest / 2, 3)', 'Math.pow(st.nest / 2, 3)'],
  ['factor-ignores-cells', 'Math.pow(st.nestBox / 30, 2) * Math.pow(st.nest / 2, 3)', 'Math.pow(st.nestBox / 30, 2)'],
  // the minutes of work
  ['work-box-rate', 'Math.min(min, st.nestFrom) * 0.3 +', 'Math.min(min, st.nestFrom) * 0.4 +'],
  ['work-before-nest', 'Math.min(min, st.nestFrom) * 0.3 +', 'min * 0.3 +'],
  ['work-nest-start', 'Math.min(min, st.nestFrom) * 0.3 +', 'Math.min(min, 20) * 0.3 +'],
  ['work-after-nest', 'Math.max(0, min - st.nestFrom) *', 'Math.max(0, min - 20) *'],
  ['work-after-nest-floor', 'Math.max(0, min - st.nestFrom) *', '(min - st.nestFrom) *'],
  ['work-nest-rate', '(0.3 + 0.52 * nestFactor(st))', '(0.3 + 0.6 * nestFactor(st))'],
  ['work-nest-box-share', '(0.3 + 0.52 * nestFactor(st))', '(0.52 * nestFactor(st))'],
  ['work-ignores-factor', '(0.3 + 0.52 * nestFactor(st))', '0.82'],
  // how a time is said
  ['time-hours-from', 'mins >= 120 ?', 'mins > 120 ?'],
  ['time-hours-from-earlier', 'mins >= 120 ?', 'mins >= 90 ?'],
  ['time-halves', '(Math.round(mins / 30) / 2)', '(Math.round(mins / 60))'],
  ['time-quarters', '(Math.round(mins / 30) / 2)', '(Math.round(mins / 15) / 4)'],
  ['time-floor', '(Math.round(mins / 30) / 2)', '(Math.floor(mins / 30) / 2)'],
  ['time-word-hours', "' hours'", "' hrs'"],
  ['time-word-minutes', "'about ' + mins + ' minutes'", "'about ' + mins + ' mins'"],
  // the spec of a run
  ['spec-minutes', 'const out = { minutes: o.minutes,', 'const out = { minutes: 90,'],
  ['spec-ground', 'drag: st.ground, evap: st.evap };', 'drag: 0.1, evap: st.evap };'],
  ['spec-rain', 'drag: st.ground, evap: st.evap };', 'drag: st.ground, evap: 1 };'],
  ['spec-ground-and-rain-swapped', 'drag: st.ground, evap: st.evap };', 'drag: st.evap, evap: st.ground };'],
  ['spec-zone-rest', 'if (o.zone) return Object.assign(out, o.zone);', 'if (o.zone) return Object.assign(o.zone, out);'],
  ['spec-zone-ignored', 'if (o.zone) return Object.assign(out, o.zone);', ''],
  ['spec-zone-bubble', 'if (o.zone) return Object.assign(out, o.zone);\n    out.bubble = st.bubble;', 'out.bubble = st.bubble;\n    if (o.zone) return Object.assign(out, o.zone);'],
  ['spec-bubble', 'out.bubble = st.bubble;', 'out.bubble = 3;'],
  ['spec-bubble-lost', 'out.bubble = st.bubble;', ''],
  ['spec-quick', 'if (!o.fine) return Object.assign(out, FAST);', 'if (!o.fine) return Object.assign(out, FINE);'],
  ['spec-quick-shared', 'if (!o.fine) return Object.assign(out, FAST);', 'if (!o.fine) return FAST;'],
  ['spec-fine-nest-cells', 'dx: FINE.dx / st.nest,', 'dx: st.nest,'],
  ['spec-fine-nest-cells-whole', 'dx: FINE.dx / st.nest,', 'dx: Math.round(FINE.dx / st.nest),'],
  ['spec-fine-nest-width', 'box: st.nestBox * 1000,', 'box: st.nestBox,'],
  ['spec-fine-nest-start', 'from: st.nestFrom,', 'from: DETAIL.from,'],
  ['spec-fine-nest-cost', 'cost: 1 + (DETAIL.cost - 1) * nestFactor(st) }', 'cost: DETAIL.cost }'],
  ['spec-fine-nest-cost-plain', 'cost: 1 + (DETAIL.cost - 1) * nestFactor(st) }', 'cost: DETAIL.cost * nestFactor(st) }'],
  ['spec-fine-nest-copy', 'Object.assign({}, DETAIL, {', 'Object.assign(DETAIL, {'],
  ['spec-fine-box-shared', 'return Object.assign(out, FINE, {', 'return Object.assign(FINE, out, {'],
  ['spec-fine-rest', 'return Object.assign(out, FINE, {', 'return Object.assign(out, {'],
];

const only = process.argv.slice(2).find((a) => !a.startsWith('jobs=')), jobs = +((process.argv.find((a) => a.startsWith('jobs=')) || '').slice(5)) || Math.min(4, cpus().length);
const base = mkdtempSync(join(tmpdir(), 'sev-rpmut-'));
const prepare = (name, text) => {
  const d = join(base, name);
  for (const x of ['src', 'tests']) mkdirSync(join(d, x), { recursive: true });
  copyFileSync(join(root, 'tests/severe_runplan.mjs'), join(d, 'tests/severe_runplan.mjs'));
  writeFileSync(join(d, 'src/severe-runplan.js'), text);
  return d;
};
const run = (name, text) => new Promise((resolve) => {
  const d = prepare(name, text), p = spawn('node', ['tests/severe_runplan.mjs'], { cwd: d }); let out = '', err = '';
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
