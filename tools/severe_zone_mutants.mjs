// Mutation testing of the initiation zone's pure half (src/severe-zone.js): each mutant changes one expression, and tests/severe_zone.mjs runs against the copy.
// A mutant that the test lets through ("survived") is a place where it does not look.
//   node tools/severe_zone_mutants.mjs [name-filter] [jobs=4]
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir, cpus } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(root, 'src/severe-zone.js'), 'utf8');
// [name, the text to find (once), its replacement]
// Changes that make no difference are left out: the seed's conversion to an integer for a fraction or a negative number (the generator's own `>>> 0` does the same), a spacing tested with <= instead of < (a distance of exactly the
// spacing between two random points does not happen), the edge of the box tested with > instead of >= (a seed exactly on the box's edge, which a margin of 40 km keeps a zone from), the generator's state kept as a double and not
// wrapped to 32 bits (the same numbers for the first five million, which no zone draws), a point along a line at `u <= s + d` against `u < s + d` or without its last-piece and clamp guards (u is under the line's length and a
// piece is at least as long as what is asked of it: the guards are for rounding), the polygon test counting the crossings on the other side of the point (an even-odd count is the same either way), a point of a polygon
// that is not an array (a number or a string has no finite first element, so it is refused all the same), and the y of an area drawn over the x's span (the points outside are thrown away: the same draw, slower).
const M = [
  // the random sequence
  ['rng-increment', '0x6D2B79F5', '0x6D2B79F4'],
  ['rng-shift-15', 't ^ (t >>> 15)', 't ^ (t >>> 14)'],
  ['rng-or-1', 'Math.imul(t ^ (t >>> 15), t | 1)', 'Math.imul(t ^ (t >>> 15), t | 3)'],
  ['rng-shift-7', 't ^ (t >>> 7)', 't ^ (t >>> 6)'],
  ['rng-or-61', 't | 61', 't | 63'],
  ['rng-shift-14', '(t ^ (t >>> 14)) >>> 0', '(t ^ (t >>> 13)) >>> 0'],
  ['rng-scale', '/ 4294967296', '/ 4294967295'],
  ['rng-signed', '((t ^ (t >>> 14)) >>> 0) / 4294967296', '(t ^ (t >>> 14)) / 4294967296'],
  // the length and the area
  ['length-from-start', 'pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]', 'pts[i][0] - pts[0][0], pts[i][1] - pts[i - 1][1]'],
  ['length-manhattan', 'Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])', 'Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1])'],
  ['length-y-only', 'Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])', 'Math.hypot(0, pts[i][1] - pts[i - 1][1])'],
  ['area-no-half', 'Math.abs(s) / 2; };', 'Math.abs(s); };'],
  ['area-signed', 'Math.abs(s) / 2; };', 's / 2; };'],
  ['area-sum', 's += p[0] * q[1] - q[0] * p[1];', 's += p[0] * q[1] + q[0] * p[1];'],
  ['area-open', 'q = pts[(i + 1) % pts.length]', 'q = pts[Math.min(i + 1, pts.length - 1)]'],
  // inside a polygon
  ['inside-straddle', '(pts[i][1] > y) !== (pts[j][1] > y)', '(pts[i][1] > y) === (pts[j][1] > y)'],
  ['inside-toggle', 'c = !c;', 'c = true;'],
  ['inside-slope', '(y - pts[i][1]) / (pts[j][1] - pts[i][1]) + pts[i][0]', '(y - pts[i][1]) / (pts[j][1] - pts[i][1]) + pts[j][0]'],
  ['inside-start', 'for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)', 'for (let i = 1, j = 0; i < pts.length; j = i++)'],
  // a point along a line
  ['along-fraction', 'f = d > 0 ? Math.max(0, Math.min(1, (u - s) / d)) : 0', 'f = d > 0 ? Math.max(0, Math.min(1, u / d)) : 0'],
  ['along-normal-x', 'nx = d > 0 ? -dy / d : 0', 'nx = d > 0 ? dy / d : 0'],
  ['along-normal-y', 'ny = d > 0 ? dx / d : 0', 'ny = d > 0 ? -dx / d : 0'],
  ['along-normal-unit', 'nx = d > 0 ? -dy / d : 0', 'nx = d > 0 ? -dy : 0'],
  ['along-offset-y', '+ f * dy + v * ny]', '+ f * dy]'],
  ['along-offset-x', '+ f * dx + v * nx,', '+ f * dx,'],
  ['along-start-of-piece', 'return [pts[i - 1][0] + f * dx', 'return [pts[i][0] + f * dx'],
  ['along-distance-kept', '      s += d;\n    }\n    return [pts[0][0]', '    }\n    return [pts[0][0]'],
  // the settings
  ['settings-width-default', 'zone.width === undefined ? 20000 : zone.width', 'zone.width === undefined ? 10000 : zone.width'],
  ['settings-density-default-line', '(line ? 3 : 1)', '(line ? 2 : 1)'],
  ['settings-density-default-area', '(line ? 3 : 1)', '(line ? 3 : 2)'],
  ['settings-strength-default', 'zone.strength === undefined ? 3 : zone.strength', 'zone.strength === undefined ? 2 : zone.strength'],
  ['settings-spacing-default', 'zone.spacing === undefined ? 12000 : zone.spacing', 'zone.spacing === undefined ? 6000 : zone.spacing'],
  ['settings-seed-default', 'zone.seed === undefined ? 1 : zone.seed', 'zone.seed === undefined ? 2 : zone.seed'],
  ['settings-window-default', 'zone.window || [0, 0]', 'zone.window || [0, 10]'],
  ['settings-window-first', 't0: Math.min(w[0], w[1])', 't0: w[0]'],
  ['settings-window-last', 't1: Math.max(w[0], w[1])', 't1: w[1]'],
  ['settings-kind-line', "zone.kind !== 'line' && zone.kind !== 'area'", "zone.kind !== 'line'"],
  ['settings-kind-checked', "if (!zone || (zone.kind !== 'line' && zone.kind !== 'area')) throw", "if (!zone) throw"],
  ['settings-points-line', "pts.length < (zone.kind === 'line' ? 2 : 3)", "pts.length < 2"],
  ['settings-points-area', "pts.length < (zone.kind === 'line' ? 2 : 3)", "pts.length < 3"],
  ['settings-points-array', '!Array.isArray(pts) ||', ''],
  ['settings-points-numbers', 'Number.isFinite(p[0]) && Number.isFinite(p[1])', 'true'],
  ['settings-width-negative', '!(z.width >= 0) ||', ''],
  ['settings-width-strict', '!(z.width >= 0)', '!(z.width > 0)'],
  ['settings-density-zero', '!(z.density > 0)', '!(z.density >= 0)'],
  ['settings-density-unchecked', '|| !(z.density > 0) ||', '||'],
  ['settings-spacing-negative', '!(z.spacing >= 0)', 'false'],
  ['settings-spacing-strict', '!(z.spacing >= 0)', '!(z.spacing > 0)'],
  ['settings-start-negative', '!(z.t0 >= 0)', 'false'],
  ['settings-start-strict', '!(z.t0 >= 0)', '!(z.t0 > 0)'],
  ['settings-end-finite', '!Number.isFinite(z.t1)', 'false'],
  ['settings-strength-finite', '!Number.isFinite(z.strength)', 'false'],
  // the draw
  ['draw-count-line-scale', 'len / 100000', 'len / 10000'],
  ['draw-count-area-scale', 'ar / 1e9', 'ar / 1e8'],
  ['draw-count-min', 'Math.max(1, Math.round(', 'Math.max(0, Math.round('],
  ['draw-count-floor', 'Math.max(1, Math.round(', 'Math.max(1, Math.floor('],
  ['draw-count-density', 'z.density * (line ?', '(line ?'],
  ['draw-tries', 'tries < 200 * want', 'tries < 2 * want'],
  ['draw-along', 'const u = rand() * len, v = (rand() - 0.5) * z.width;', 'const u = rand() * len / 2, v = (rand() - 0.5) * z.width;'],
  ['draw-one-side', 'v = (rand() - 0.5) * z.width;', 'v = rand() * z.width;'],
  ['draw-offset-full-width', 'v = (rand() - 0.5) * z.width;', 'v = (rand() - 0.5) * z.width / 2;'],
  ['draw-offset-double', 'v = (rand() - 0.5) * z.width;', 'v = (rand() - 0.5) * z.width * 2;'],
  ['draw-area-x', 'x = xmin + rand() * (xmax - xmin); y', 'x = xmin + rand() * (ymax - ymin); y'],
  ['draw-area-corner', 'x = xmin + rand()', 'x = rand()'],
  ['draw-area-inside', 'if (!inside(z.pts, x, y)) continue;', ''],
  ['draw-area-outside', 'if (!inside(z.pts, x, y)) continue;', 'if (inside(z.pts, x, y)) continue;'],
  ['draw-spacing-x-only', 'Math.hypot(q.x - x, q.y - y) < z.spacing', 'Math.abs(q.x - x) < z.spacing'],
  ['draw-spacing-y-only', 'Math.hypot(q.x - x, q.y - y) < z.spacing', 'Math.abs(q.y - y) < z.spacing'],
  ['draw-spacing-unchecked', 'if (seeds.some((q) => Math.hypot(q.x - x, q.y - y) < z.spacing)) continue;', ''],
  ['draw-spacing-sum', 'Math.hypot(q.x - x, q.y - y) < z.spacing', '(Math.abs(q.x - x) + Math.abs(q.y - y)) < z.spacing'],
  ['draw-time-start', 't: z.t0 + rand() * (z.t1 - z.t0)', 't: rand() * (z.t1 - z.t0)'],
  ['draw-time-span', 't: z.t0 + rand() * (z.t1 - z.t0)', 't: z.t0 + rand() * z.t1'],
  ['draw-time-end', 't: z.t0 + rand() * (z.t1 - z.t0)', 't: z.t0 + rand() * (z.t1 - z.t0) + 1'],
  ['draw-amp-spread', 'amp: z.strength * (0.8 + 0.4 * rand())', 'amp: z.strength'],
  ['draw-amp-low', 'amp: z.strength * (0.8 + 0.4 * rand())', 'amp: z.strength * (0.5 + 0.4 * rand())'],
  ['draw-amp-high', 'amp: z.strength * (0.8 + 0.4 * rand())', 'amp: z.strength * (0.8 + 0.8 * rand())'],
  ['draw-amp-added', 'amp: z.strength * (0.8 + 0.4 * rand())', 'amp: z.strength + (0.8 + 0.4 * rand())'],
  ['draw-sorted', 'return seeds.sort((p, q) => p.t - q.t || p.x - q.x);', 'return seeds;'],
  ['draw-sorted-backwards', 'return seeds.sort((p, q) => p.t - q.t || p.x - q.x);', 'return seeds.sort((p, q) => q.t - p.t || p.x - q.x);'],
  ['draw-sorted-by-place', 'p.t - q.t || p.x - q.x', 'p.x - q.x'],
  ['draw-seed', 'const z = settings(zone), line = z.kind === \'line\', rand = rng(z.seed)', 'const z = settings(zone), line = z.kind === \'line\', rand = rng(1)'],
  ['draw-bbox-x', 'xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]); ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); }\n    for (let tries', 'xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]); ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[0]); }\n    for (let tries'],
  // the box
  ['plan-dx-default', 'dx: 2000, margin: 40000, min: 84000, max: 200000', 'dx: 3000, margin: 40000, min: 84000, max: 200000'],
  ['plan-margin-default', 'dx: 2000, margin: 40000, min: 84000, max: 200000', 'dx: 2000, margin: 30000, min: 84000, max: 200000'],
  ['plan-min-default', 'dx: 2000, margin: 40000, min: 84000, max: 200000', 'dx: 2000, margin: 40000, min: 60000, max: 200000'],
  ['plan-max-default', 'dx: 2000, margin: 40000, min: 84000, max: 200000', 'dx: 2000, margin: 40000, min: 84000, max: 160000'],
  ['plan-span-longer-side', 'Math.max(xmax - xmin, ymax - ymin) + 2 * o.margin', 'Math.min(xmax - xmin, ymax - ymin) + 2 * o.margin'],
  ['plan-span-x-only', 'Math.max(xmax - xmin, ymax - ymin) + 2 * o.margin', '(xmax - xmin) + 2 * o.margin'],
  ['plan-span-y-only', 'Math.max(xmax - xmin, ymax - ymin) + 2 * o.margin', '(ymax - ymin) + 2 * o.margin'],
  ['plan-margin-one-side', 'Math.max(xmax - xmin, ymax - ymin) + 2 * o.margin', 'Math.max(xmax - xmin, ymax - ymin) + o.margin'],
  ['plan-cells-floor', 'Math.ceil(span / o.dx)', 'Math.floor(span / o.dx)'],
  ['plan-max-ceil', 'Math.min(Math.floor(o.max / o.dx), Math.ceil(span / o.dx))', 'Math.min(Math.ceil(o.max / o.dx), Math.ceil(span / o.dx))'],
  ['plan-min-floor', 'Math.max(Math.ceil(o.min / o.dx), Math.min(', 'Math.max(Math.floor(o.min / o.dx), Math.min('],
  ['plan-min-unused', 'Math.max(Math.ceil(o.min / o.dx), Math.min(Math.floor(o.max / o.dx), Math.ceil(span / o.dx)))', 'Math.min(Math.floor(o.max / o.dx), Math.ceil(span / o.dx))'],
  ['plan-max-unused', 'Math.max(Math.ceil(o.min / o.dx), Math.min(Math.floor(o.max / o.dx), Math.ceil(span / o.dx)))', 'Math.max(Math.ceil(o.min / o.dx), Math.ceil(span / o.dx))'],
  ['plan-size', 'L = n * o.dx;', 'L = n * 2000;'],
  ['plan-corner-x', 'x0 = (xmin + xmax) / 2 - L / 2', 'x0 = xmin - L / 2'],
  ['plan-corner-x-half', 'x0 = (xmin + xmax) / 2 - L / 2', 'x0 = (xmin + xmax) / 2 - L'],
  ['plan-corner-y', 'y0 = (ymin + ymax) / 2 - L / 2', 'y0 = ymin - L / 2'],
  ['plan-corner-y-from-x', 'y0 = (ymin + ymax) / 2 - L / 2', 'y0 = (xmin + xmax) / 2 - L / 2'],
  ['plan-seeds-x', 'const x = q.x - x0, y = q.y - y0;', 'const x = q.x, y = q.y - y0;'],
  ['plan-seeds-y', 'const x = q.x - x0, y = q.y - y0;', 'const x = q.x - x0, y = q.y;'],
  ['plan-seeds-time', 'seeds.push({ x, y, t: q.t, amp: q.amp })', 'seeds.push({ x, y, t: 0, amp: q.amp })'],
  ['plan-seeds-amp', 'seeds.push({ x, y, t: q.t, amp: q.amp })', 'seeds.push({ x, y, t: q.t, amp: 3 })'],
  ['plan-seeds-all-kept', 'if (x >= 0 && x < L && y >= 0 && y < L) seeds.push', 'if (true) seeds.push'],
  ['plan-seeds-x-bound', 'if (x >= 0 && x < L && y >= 0 && y < L) seeds.push', 'if (y >= 0 && y < L) seeds.push'],
  ['plan-seeds-y-bound', 'if (x >= 0 && x < L && y >= 0 && y < L) seeds.push', 'if (x >= 0 && x < L) seeds.push'],
  ['plan-seeds-x-low', 'if (x >= 0 && x < L && y >= 0 && y < L) seeds.push', 'if (x < L && y >= 0 && y < L) seeds.push'],
  ['plan-seeds-y-low', 'if (x >= 0 && x < L && y >= 0 && y < L) seeds.push', 'if (x >= 0 && x < L && y < L) seeds.push'],
  ['plan-seeds-x-high', 'if (x >= 0 && x < L && y >= 0 && y < L) seeds.push', 'if (x >= 0 && y >= 0 && y < L) seeds.push'],
  ['plan-seeds-y-high', 'if (x >= 0 && x < L && y >= 0 && y < L) seeds.push', 'if (x >= 0 && x < L && y >= 0) seeds.push'],
  ['plan-dropped', 'dropped: all.length - seeds.length', 'dropped: 0'],
  ['plan-box-n', 'return { box: { x0, y0, L, n }, seeds,', 'return { box: { x0, y0, L, n: n + 1 }, seeds,'],
];

const only = process.argv.slice(2).find((a) => !a.startsWith('jobs=')), jobs = +((process.argv.find((a) => a.startsWith('jobs=')) || '').slice(5)) || Math.min(4, cpus().length);
const base = mkdtempSync(join(tmpdir(), 'sev-zonemut-'));
const prepare = (name, text) => {
  const d = join(base, name);
  for (const x of ['src', 'tests']) mkdirSync(join(d, x), { recursive: true });
  copyFileSync(join(root, 'tests/severe_zone.mjs'), join(d, 'tests/severe_zone.mjs'));
  writeFileSync(join(d, 'src/severe-zone.js'), text);
  return d;
};
const run = (name, text) => new Promise((resolve) => {
  const d = prepare(name, text), p = spawn('node', ['tests/severe_zone.mjs'], { cwd: d, env: Object.assign({}, process.env, { FAILFAST: '1' }) }); let out = '', err = '';
  const timer = setTimeout(() => p.kill('SIGKILL'), 60000);
  p.stdout.on('data', (b) => { out += b; }); p.stderr.on('data', (b) => { err += b; });
  p.on('close', (code) => { clearTimeout(timer); const f = out.split('\n').filter((l) => l.startsWith('FAIL')).map((l) => l.slice(5, 90)); rmSync(d, { recursive: true, force: true }); resolve(code === 0 ? { killed: false } : { killed: true, by: f[0] || (err.split('\n')[0] || 'it failed').slice(0, 90) }); });
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
