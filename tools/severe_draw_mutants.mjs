// Mutation testing of the pure geometry of the drawing tool (src/severe-draw.js): each mutant changes one expression, and tests/severe_draw.mjs runs against the copy.
// A mutant that the test lets through ("survived") is a place where it does not look.
//   node tools/severe_draw_mutants.mjs [name-filter] [jobs=4]
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir, cpus } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(root, 'src/severe-draw.js'), 'utf8');
// [name, the text to find (once), its replacement]
// Two changes that cannot be seen are left out: swapping the two labels of an edge id (the ids are only keys, and the swap is a one-to-one map) and letting a cell whose corners are all above the level (code 15)
// through the guard (it has no case in the switch, so it adds no segment; the guard only saves the work of computing the crossings).
const M = [
  // contour lines
  ['contour-interpolation', 'f = (level - a) / (b - a);', 'f = 0.5;'],
  ['contour-interpolation-sign', 'f = (level - a) / (b - a);', 'f = (a - level) / (b - a);'],
  ['contour-vertical-edge', 'pos.set(id, horiz ? [i + f, j] : [i, j + f]);', 'pos.set(id, horiz ? [i + f, j] : [i + f, j]);'],
  ['contour-nan-cells', 'if (!(a === a && b === b && c === c && d === d)) continue;', ''],
  ['contour-code-level', 'const code = (a >= level ? 1 : 0)', 'const code = (a > level ? 1 : 0)'],
  ['contour-corner-b', '(b >= level ? 2 : 0)', '(b >= level ? 1 : 0)'],
  ['contour-case-1', 'case 1: case 14: segs.push([W, S]); break;', 'case 1: case 14: segs.push([W, N]); break;'],
  ['contour-case-2', 'case 2: case 13: segs.push([S, E]); break;', 'case 2: case 13: segs.push([S, N]); break;'],
  ['contour-case-3', 'case 3: case 12: segs.push([W, E]); break;', 'case 3: case 12: segs.push([W, S]); break;'],
  ['contour-case-4', 'case 4: case 11: segs.push([E, N]); break;', 'case 4: case 11: segs.push([E, S]); break;'],
  ['contour-case-6', 'case 6: case 9: segs.push([S, N]); break;', 'case 6: case 9: segs.push([S, E]); break;'],
  ['contour-case-7', 'case 7: case 8: segs.push([W, N]); break;', 'case 7: case 8: segs.push([W, E]); break;'],
  ['contour-saddle-centre', 'const centre = (a + b + c + d) / 4 >= level;', 'const centre = true;'],
  ['contour-saddle-branch', 'if ((code === 5) === centre) segs.push([W, N], [S, E]); else segs.push([W, S], [E, N]);', 'if ((code === 5) !== centre) segs.push([W, N], [S, E]); else segs.push([W, S], [E, N]);'],
  ['contour-south-edge', 'const S = cross(i, j, true), E = cross(i + 1, j, false), N = cross(i, j + 1, true), W = cross(i, j, false);', 'const S = cross(i, j + 1, true), E = cross(i + 1, j, false), N = cross(i, j + 1, true), W = cross(i, j, false);'],
  ['contour-east-edge', 'E = cross(i + 1, j, false)', 'E = cross(i, j, false)'],
  ['contour-join-direction', 'const s = segs[k], to = s[0] === from ? s[1] : s[0];', 'const s = segs[k], to = s[1];'],
  ['contour-join-used', 'const next = (at.get(to) || []).find((q) => !used[q]);', 'const next = (at.get(to) || []).find((q) => q !== k);'],
  ['contour-open-first', 'if (open !== null) lines.push(walk(k, open));', 'if (open !== null) lines.push(walk(k, s[0]));'],
  ['contour-open-test', 'const s = segs[k], open = at.get(s[0]).length === 1 ? s[0] : at.get(s[1]).length === 1 ? s[1] : null;', 'const s = segs[k], open = null;'],
  ['contour-closed-lines', 'for (let k = 0; k < segs.length; k++) if (!used[k]) lines.push(walk(k, segs[k][0]));', ''],
  // symbols
  ['symbols-guard', 'if (!(spacing > 0)) return [];', ''],
  ['symbols-first-default', 'first === undefined ? spacing / 2 : first;', 'first === undefined ? 0 : first;'],
  ['symbols-spacing', 'next += spacing;', 'next += spacing + 1;'],
  ['symbols-angle', 'const ang = Math.atan2(dy, dx);', 'const ang = Math.atan2(dx, dy);'],
  ['symbols-end', 'while (next <= s + L + 1e-9)', 'while (next < s + L - 1e-9)'],
  ['symbols-fraction', 'const f = (next - s) / L;', 'const f = (next - s) / (L + 1);'],
  ['symbols-arc-length', 's += L;', 's += L - 1;'],
  ['symbols-zero-length', 'if (L === 0) continue;', ''],
  // nearest
  ['nearest-clamp', 'Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2))', '((x - ax) * vx + (y - ay) * vy) / L2'],
  ['nearest-better', 'if (!best || d < best.d)', 'if (!best || d > best.d)'],
  ['nearest-one-point', 'return best || { d: Math.hypot(x - pts[0][0], y - pts[0][1]), i: 0, t: 0, px: pts[0][0], py: pts[0][1] };', 'return best;'],
  // moved and pick
  ['moved-hours', 'const m = o.motion || { u: 0, v: 0 }, dx = m.u * (t || 0) * KMH, dy = m.v * (t || 0) * KMH;', 'const m = o.motion || { u: 0, v: 0 }, dx = m.u * (t || 0) * 3, dy = m.v * (t || 0) * KMH;'],
  ['moved-v-lost', 'dy = m.v * (t || 0) * KMH;', 'dy = 0;'],
  ['moved-identity', 'if (dx === 0 && dy === 0) return o;', ''],
  ['moved-points', 'if (o.pts) c.pts = o.pts.map((p) => [p[0] + dx, p[1] + dy]);', ''],
  ['moved-place', 'if (o.x !== undefined) { c.x = o.x + dx; c.y = o.y + dy; }', ''],
  ['moved-y-of-place', 'c.x = o.x + dx; c.y = o.y + dy;', 'c.x = o.x + dx; c.y = o.y;'],
  ['pick-topmost', 'for (let k = objects.length - 1; k >= 0; k--) {\n      const o = moved(objects[k], t);\n      if (o.pts) {', 'for (let k = 0; k < objects.length; k++) {\n      const o = moved(objects[k], t);\n      if (o.pts) {'],
  ['pick-tolerance', 'if (d <= tol && (!best || d < best.d - 1e-9)) best = { d, index: k, part: \'pt:\' + p };', 'if (d < tol && (!best || d < best.d - 1e-9)) best = { d, index: k, part: \'pt:\' + p };'],
  ['pick-handle-first', 'if (best) return { index: best.index, part: best.part };', ''],
  ['pick-body-tolerance', 'if (n.d <= tol && (!best || n.d < best.d - 1e-9)) best = { d: n.d, index: k, part: \'body\' };', 'if (n.d <= tol * 2 && (!best || n.d < best.d - 1e-9)) best = { d: n.d, index: k, part: \'body\' };'],
  ['pick-body-nearest', 'if (n.d <= tol && (!best || n.d < best.d - 1e-9)) best = { d: n.d, index: k, part: \'body\' };', 'if (n.d <= tol && !best) best = { d: n.d, index: k, part: \'body\' };'],
  ['pick-body-inclusive', "if (n.d <= tol && (!best || n.d < best.d - 1e-9)) best = { d: n.d, index: k, part: 'body' };", "if (n.d < tol && (!best || n.d < best.d - 1e-9)) best = { d: n.d, index: k, part: 'body' };"],
  ['pick-body-tie', 'n.d < best.d - 1e-9', 'n.d < best.d + 1e-9'],
  ['pick-point-inclusive', 'else { const d = Math.hypot(x - o.x, y - o.y); if (d <= tol', 'else { const d = Math.hypot(x - o.x, y - o.y); if (d < tol'],
  ['pick-point-object', "const d = Math.hypot(x - o.x, y - o.y); if (d <= tol && (!best || d < best.d - 1e-9)) best = { d, index: k, part: 'pt:0' }; }", "const d = Math.hypot(x - o.x, y - o.y); if (d <= tol && (!best || d < best.d - 1e-9)) best = { d, index: k, part: 'body' }; }"],
  ['pick-uses-moved', 'const o = moved(objects[k], t);\n      if (o.pts) { for', 'const o = objects[k];\n      if (o.pts) { for'],
  ['pick-tie', '(!best || d < best.d - 1e-9)) best = { d, index: k, part: \'pt:\' + p };', '(!best || d <= best.d + 1e-9)) best = { d, index: k, part: \'pt:\' + p };'],
  // history
  ['history-truncate', 'H.stack.length = H.at + 1;', ''],
  ['history-limit', 'if (H.stack.length > H.limit) H.stack.shift();', ''],
  ['history-undo-floor', 'if (H.at > 0) H.at--;', 'H.at--;'],
  ['history-redo-ceiling', 'if (H.at < H.stack.length - 1) H.at++;', 'H.at++;'],
  ['history-can-undo', 'H.canUndo = () => H.at > 0;', 'H.canUndo = () => H.at > 1;'],
  ['history-can-redo', 'H.canRedo = () => H.at < H.stack.length - 1;', 'H.canRedo = () => H.at < H.stack.length;'],
  ['history-limit-default', 'limit: limit || 100', 'limit: limit || 2'],
  // wind barbs
  ['barb-floor', 'Math.round(kt / 5) * 5 : 0', 'Math.floor(kt / 5) * 5 : 0'],
  ['barb-calm-limit', 'if (n < 5) return', 'if (n < 10) return'],
  ['barb-not-a-number', 'const n = kt >= 0 ? Math.round(kt / 5) * 5 : 0;', 'const n = Math.round(Math.max(0, kt) / 5) * 5;'],
  ['barb-pennant', 'const pennants = Math.floor(r / 50);', 'const pennants = Math.floor(r / 100);'],
  ['barb-pennant-value', 'r -= 50 * pennants;', 'r -= 10 * pennants;'],
  ['barb-long', 'const longs = Math.floor(r / 10);', 'const longs = Math.floor(r / 20);'],
  ['barb-long-value', 'r -= 10 * longs;', 'r -= 5 * longs;'],
  ['barb-short', 'shorts: r >= 5 ? 1 : 0', 'shorts: r > 5 ? 1 : 0'],
  // simplify
  ['simplify-tolerance', 'let far = -1, fd = tol;', 'let far = -1, fd = tol * 2;'],
  ['simplify-segment', 'Math.max(0, Math.min(1, ((pts[i][0] - ax) * vx + (pts[i][1] - ay) * vy) / L2))', '((pts[i][0] - ax) * vx + (pts[i][1] - ay) * vy) / L2'],
  ['simplify-last-end', 'keep[0] = keep[n - 1] = 1;', 'keep[0] = 1;'],
  ['simplify-first-end', 'keep[0] = keep[n - 1] = 1;', 'keep[n - 1] = 1;'],
  ['simplify-second-half', 'stack.push([a, far], [far, b]);', 'stack.push([a, far]);'],
  ['simplify-first-half', 'stack.push([a, far], [far, b]);', 'stack.push([far, b]);'],
  ['simplify-copy', 'return pts.filter((_, i) => keep[i]).map((p) => p.slice());', 'return pts.filter((_, i) => keep[i]);'],
  ['simplify-short-copy', 'if (n < 3) return pts.map((p) => p.slice());', 'if (n < 3) return pts;'],
  // along
  ['along-clamp', 'let want = Math.max(0, Math.min(1, f)) * total;', 'let want = f * total;'],
  ['along-skip-doubled', 'if (L > 0 && (want <= L || i === pts.length - 2))', 'if (want <= L || i === pts.length - 2)'],
  ['along-angle', 'ang: Math.atan2(dy, dx) }; }', 'ang: Math.atan2(dx, dy) }; }'],
  ['along-subtract', 'want -= L;', 'want -= 1;'],
  // heading
  ['heading-axes', 'Math.atan2(u, v) * 180', 'Math.atan2(v, u) * 180'],
  ['heading-wrap', '% 360 + 360) % 360;', '% 360);'],
  ['velocity-u', 'u: speed * Math.sin(hd', 'u: speed * Math.cos(hd'],
  ['velocity-v', 'v: speed * Math.cos(hd', 'v: speed * Math.sin(hd'],
  // symbols of a line
  ['sides-opp', "const opp = (s) => (s === 'left' ? 'right' : 'left');", "const opp = (s) => (s === 'left' ? 'left' : 'left');"],
  ['sides-cold-default', "const cold = o.cold || 'left', warm", "const cold = o.cold || 'right', warm"],
  ['sides-kind-default', "kind = o.kind || 'cold';", "kind = o.kind || 'warm';"],
  ['sides-cold-front', "if (kind === 'cold') return [{ shape: 'tooth', side: warm }];", "if (kind === 'cold') return [{ shape: 'tooth', side: cold }];"],
  ['sides-warm-front', "if (kind === 'warm') return [{ shape: 'semi', side: cold }];", "if (kind === 'warm') return [{ shape: 'semi', side: warm }];"],
  ['sides-stationary', "if (kind === 'stationary') return [{ shape: 'tooth', side: warm }, { shape: 'semi', side: cold }];", "if (kind === 'stationary') return [{ shape: 'tooth', side: cold }, { shape: 'semi', side: warm }];"],
  ['sides-occluded', "if (kind === 'occluded') return [{ shape: 'tooth', side: warm }, { shape: 'semi', side: warm }];", "if (kind === 'occluded') return [{ shape: 'tooth', side: warm }, { shape: 'semi', side: cold }];"],
  ['sides-dryline', "side: opp(o.dry || 'left') }]", "side: (o.dry || 'left') }]"],
  ['sides-dryline-default', "opp(o.dry || 'left')", "opp(o.dry || 'right')"],
  ['sides-outflow', "side: opp(o.cool || 'left') }]", "side: (o.cool || 'left') }]"],
  ['sides-outflow-default', "opp(o.cool || 'left')", "opp(o.cool || 'right')"],
  ['sides-others', "if (o.type === 'outflow') return [{ shape: 'tick', side: opp(o.cool || 'left') }];\n    return [];", "if (o.type === 'outflow') return [{ shape: 'tick', side: opp(o.cool || 'left') }];\n    return [{ shape: 'tooth', side: 'left' }];"],
  // the skew-T
  ['skew-slope', 'SKEW: 35,', 'SKEW: 30,'],
  ['skew-x', 'x: (T, p) => T + skewT.SKEW * Math.log(1000 / p),', 'x: (T, p) => T - skewT.SKEW * Math.log(1000 / p),'],
  ['skew-y', 'y: (p) => Math.log(1000 / p),', 'y: (p) => Math.log(p / 1000),'],
  ['skew-p-of-y', 'pOfY: (y) => 1000 / Math.exp(y),', 'pOfY: (y) => 1000 * Math.exp(y),'],
  ['adiabat-exponent', 'theta * Math.pow(p / 1000, 0.2857) - 273.15', 'theta * Math.pow(p / 1000, 0.4) - 273.15'],
  ['adiabat-kelvin', 'theta * Math.pow(p / 1000, 0.2857) - 273.15', 'theta * Math.pow(p / 1000, 0.2857) - 273'],
  ['mixing-ratio-vapour-pressure', 'const e = w * p / (622 + w)', 'const e = w * p / 622'],
  ['mixing-ratio-bolton', '243.5 * l / (17.67 - l)', '243.5 * l / (17.27 - l)'],
];

const only = process.argv.slice(2).find((a) => !a.startsWith('jobs=')), jobs = +((process.argv.find((a) => a.startsWith('jobs=')) || '').slice(5)) || Math.min(4, cpus().length);
const base = mkdtempSync(join(tmpdir(), 'sev-drmut-'));
const prepare = (name, text) => {
  const d = join(base, name);
  for (const x of ['src', 'tests']) mkdirSync(join(d, x), { recursive: true });
  copyFileSync(join(root, 'tests/severe_draw.mjs'), join(d, 'tests/severe_draw.mjs'));
  writeFileSync(join(d, 'src/severe-draw.js'), text);
  return d;
};
const run = (name, text) => new Promise((resolve) => {
  const d = prepare(name, text), p = spawn('node', ['tests/severe_draw.mjs'], { cwd: d }); let out = '', err = '';
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
