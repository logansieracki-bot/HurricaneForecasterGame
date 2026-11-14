// Mutation testing of the weak-echo eye (tools/severe_research/eyes.mjs): each mutant changes one expression, and tests/severe_hookeye.mjs runs against the copy.
// A mutant that the test lets through ("survived") is a place where it does not look. (A diagonal step down and to the west in the growth of an eye is left out: the scan meets the lower cell first, so it cannot matter.)
//   node tools/severe_hookeye_mutants.mjs [name-filter]
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(root, 'tools/severe_research/eyes.mjs'), 'utf8');
// [name, the text to find (once), its replacement]
const M = [
  // what is echo and what is not
  ['low-threshold-strict', 'low[j * nx + i] = d < T ? 1 : 0;', 'low[j * nx + i] = d <= T ? 1 : 0;'],
  ['low-threshold-loose', 'low[j * nx + i] = d < T ? 1 : 0;', 'low[j * nx + i] = d < T + 1 ? 1 : 0;'],
  ['low-inverted', 'low[j * nx + i] = d < T ? 1 : 0;', 'low[j * nx + i] = d >= T ? 1 : 0;'],
  ['echo-threshold-strict', 'if (d >= T) echo++;', 'if (d > T) echo++;'],
  ['echo-count-twice', 'if (d >= T) echo++;', 'if (d >= T) echo += 2;'],
  ['level-index-rows', 'dbz[(k * ny + j) * nx + i]', 'dbz[(k * nx + j) * ny + i]'],
  ['level-ignored', 'dbz[(k * ny + j) * nx + i]', 'dbz[j * nx + i]'],
  ['low-index-columns', 'low[j * nx + i] = d < T', 'low[i * ny + j] = d < T'],
  // the outside: what reaches an edge of the box
  ['edge-south-not-seeded', 'push(i, 0); push(i, ny - 1);', 'push(i, ny - 1);'],
  ['edge-north-not-seeded', 'push(i, 0); push(i, ny - 1);', 'push(i, 0);'],
  ['edge-west-not-seeded', 'push(0, j); push(nx - 1, j);', 'push(nx - 1, j);'],
  ['edge-east-not-seeded', 'push(0, j); push(nx - 1, j);', 'push(0, j);'],
  ['edge-nothing-seeded', 'for (let i = 0; i < nx; i++) { push(i, 0); push(i, ny - 1); } for (let j = 0; j < ny; j++) { push(0, j); push(nx - 1, j); }', ''],
  ['edge-rows-by-nx', 'push(i, ny - 1);', 'push(i, nx - 1);'],
  ['edge-columns-by-ny', 'push(nx - 1, j);', 'push(ny - 1, j);'],
  ['push-seen-ignored', 'if (low[q] && !seen[q]) {', 'if (low[q]) {'],
  ['push-low-ignored', 'if (low[q] && !seen[q]) {', 'if (!seen[q]) {'],
  // how the outside spreads (the weak echo flows by the sides of cells)
  ['flood-no-west', 'const q = stack.pop(), i = q % nx, j = (q - i) / nx; if (i > 0) push(i - 1, j); if (i < nx - 1) push(i + 1, j); if (j > 0) push(i, j - 1); if (j < ny - 1) push(i, j + 1); } };', 'const q = stack.pop(), i = q % nx, j = (q - i) / nx; if (i < nx - 1) push(i + 1, j); if (j > 0) push(i, j - 1); if (j < ny - 1) push(i, j + 1); } };'],
  ['flood-no-east', 'const q = stack.pop(), i = q % nx, j = (q - i) / nx; if (i > 0) push(i - 1, j); if (i < nx - 1) push(i + 1, j); if (j > 0) push(i, j - 1); if (j < ny - 1) push(i, j + 1); } };', 'const q = stack.pop(), i = q % nx, j = (q - i) / nx; if (i > 0) push(i - 1, j); if (j > 0) push(i, j - 1); if (j < ny - 1) push(i, j + 1); } };'],
  ['flood-no-south', 'const q = stack.pop(), i = q % nx, j = (q - i) / nx; if (i > 0) push(i - 1, j); if (i < nx - 1) push(i + 1, j); if (j > 0) push(i, j - 1); if (j < ny - 1) push(i, j + 1); } };', 'const q = stack.pop(), i = q % nx, j = (q - i) / nx; if (i > 0) push(i - 1, j); if (i < nx - 1) push(i + 1, j); if (j < ny - 1) push(i, j + 1); } };'],
  ['flood-no-north', 'const q = stack.pop(), i = q % nx, j = (q - i) / nx; if (i > 0) push(i - 1, j); if (i < nx - 1) push(i + 1, j); if (j > 0) push(i, j - 1); if (j < ny - 1) push(i, j + 1); } };', 'const q = stack.pop(), i = q % nx, j = (q - i) / nx; if (i > 0) push(i - 1, j); if (i < nx - 1) push(i + 1, j); if (j > 0) push(i, j - 1); } };'],
  ['flood-diagonal', 'const q = stack.pop(), i = q % nx, j = (q - i) / nx; if (i > 0) push(i - 1, j); if (i < nx - 1) push(i + 1, j); if (j > 0) push(i, j - 1); if (j < ny - 1) push(i, j + 1); } };', 'const q = stack.pop(), i = q % nx, j = (q - i) / nx; if (i > 0) push(i - 1, j); if (i < nx - 1) push(i + 1, j); if (j > 0) push(i, j - 1); if (j < ny - 1) push(i, j + 1); if (i > 0 && j > 0) push(i - 1, j - 1); if (i < nx - 1 && j < ny - 1) push(i + 1, j + 1); } };'],
  ['flood-skipped', '  flood();', '  void flood;'],
  // the eyes: what is left
  ['eye-no-west', 'n++; sx += i + 0.5; sy += j + 0.5; if (i > 0) push(i - 1, j); if (i < nx - 1) push(i + 1, j);', 'n++; sx += i + 0.5; sy += j + 0.5; if (i < nx - 1) push(i + 1, j);'],
  ['eye-no-east', 'n++; sx += i + 0.5; sy += j + 0.5; if (i > 0) push(i - 1, j); if (i < nx - 1) push(i + 1, j);', 'n++; sx += i + 0.5; sy += j + 0.5; if (i > 0) push(i - 1, j);'],
  ['eye-no-south', 'if (i < nx - 1) push(i + 1, j); if (j > 0) push(i, j - 1); if (j < ny - 1) push(i, j + 1); }\n    if (n >= MIN)', 'if (i < nx - 1) push(i + 1, j); if (j < ny - 1) push(i, j + 1); }\n    if (n >= MIN)'],
  ['eye-no-north', 'if (i < nx - 1) push(i + 1, j); if (j > 0) push(i, j - 1); if (j < ny - 1) push(i, j + 1); }\n    if (n >= MIN)', 'if (i < nx - 1) push(i + 1, j); if (j > 0) push(i, j - 1); }\n    if (n >= MIN)'],
  ['eye-diagonal-up', 'n++; sx += i + 0.5; sy += j + 0.5; if (i > 0) push(i - 1, j);', 'n++; sx += i + 0.5; sy += j + 0.5; if (i < nx - 1 && j < ny - 1) push(i + 1, j + 1); if (i > 0) push(i - 1, j);'],
  ['eye-first-cell-uncounted', 'let n = 0, sx = 0, sy = 0; seen[q0] = 1; stack.push(q0);', 'let n = -1, sx = 0, sy = 0; seen[q0] = 1; stack.push(q0);'],
  ['eye-start-not-marked', 'seen[q0] = 1; stack.push(q0);', 'stack.push(q0);'],
  ['eye-skips-seen', 'if (!low[q0] || seen[q0]) continue;', 'if (!low[q0]) continue;'],
  ['eye-skips-echo', 'if (!low[q0] || seen[q0]) continue;', 'if (seen[q0]) continue;'],
  ['centre-east-no-half', 'sx += i + 0.5;', 'sx += i;'],
  ['centre-north-no-half', 'sy += j + 0.5;', 'sy += j;'],
  ['centre-east-by-north', 'sx += i + 0.5;', 'sx += j + 0.5;'],
  ['centre-north-by-east', 'sy += j + 0.5;', 'sy += i + 0.5;'],
  ['centre-not-a-mean', 'x: sx / n, y: sy / n', 'x: sx, y: sy / n'],
  ['centre-not-a-mean-north', 'x: sx / n, y: sy / n', 'x: sx / n, y: sy'],
  ['least-size-strict', 'if (n >= MIN) out.push', 'if (n > MIN) out.push'],
  ['least-size-ignored', 'if (n >= MIN) out.push', 'if (true) out.push'],
  ['order-smallest-first', 'out.sort((a, b) => b.cells - a.cells);', 'out.sort((a, b) => a.cells - b.cells);'],
  ['order-none', 'out.sort((a, b) => b.cells - a.cells);', ''],
  ['returns-no-echo', 'return { eyes: out, echo };', 'return { eyes: out, echo: 0 };'],
];

const only = process.argv[2];
const base = mkdtempSync(join(tmpdir(), 'sev-eyemut-'));
const run = (name, text) => {
  const d = join(base, name); mkdirSync(join(d, 'tools/severe_research'), { recursive: true }); mkdirSync(join(d, 'tests'), { recursive: true });
  copyFileSync(join(root, 'tests/severe_hookeye.mjs'), join(d, 'tests/severe_hookeye.mjs')); writeFileSync(join(d, 'tools/severe_research/eyes.mjs'), text);
  symlinkSync(join(root, 'src'), join(d, 'src')); symlinkSync(join(root, 'data'), join(d, 'data'));                // (the pack reader and the recorded storms, which the test also reads, are not mutated)
  const r = spawnSync('node', ['tests/severe_hookeye.mjs'], { cwd: d, encoding: 'utf8', env: Object.assign({}, process.env, { FAILFAST: '1' }), timeout: 60000 }); rmSync(d, { recursive: true, force: true });
  const f = (r.stdout || '').split('\n').find((l) => l.startsWith('FAIL')); return r.status === 0 ? { killed: false } : { killed: true, by: f ? f.slice(5, 100) : ((r.stderr || '').split('\n').find((l) => l.trim()) || 'crash') };
};
let killed = 0, total = 0; const survived = [];
const b = run('original', SRC); if (b.killed) { console.log('the unmutated copy fails:', b.by); process.exit(2); }
for (const [name, a, c] of M) {
  if (only && !name.includes(only)) continue;
  const n = SRC.split(a).length - 1; if (n !== 1) { console.log('??   ' + name + ': the text to change occurs ' + n + ' times'); continue; }
  total++; const r = run(name, SRC.replace(a, () => c));
  if (r.killed) { killed++; console.log('kill ' + name + '  <- ' + r.by); } else { survived.push(name); console.log('SURVIVED ' + name); }
}
console.log('\n' + killed + ' of ' + total + ' mutants killed' + (survived.length ? '; survived: ' + survived.join(', ') : ''));
rmSync(base, { recursive: true, force: true });
process.exit(survived.length ? 1 : 0);
