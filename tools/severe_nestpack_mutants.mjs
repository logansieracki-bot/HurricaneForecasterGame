// Mutation testing of the tool that makes the nested storm packs (tools/severe_research/make_nest_pack.mjs): each mutant changes one expression, and tests/severe_nestpack.mjs runs against the copy.
// A mutant that the test lets through ("survived") is a place where it does not look.
//   node tools/severe_nestpack_mutants.mjs [name-filter] [jobs=4]
// Each copy goes to its own temporary directory with the test, the reader the test checks against (src/severe-pack.js, src/severe-geo.js) and the table of sites beside it, so nothing in the repository
// is touched and the copies run side by side.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir, cpus } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = 'tools/severe_research/make_nest_pack.mjs', SRC = readFileSync(join(root, TOOL), 'utf8');
const KEEP = ['src/severe-geo.js', 'src/severe-pack.js', 'data/generated/severe-sites.json', 'tests/severe_nestpack.mjs'];
// [name, the text to find (once), its replacement]
const M = [
  // the file and its header
  ['magic-v1', "out.write('HFP2')", "out.write('HFP1')"],
  ['header-v1', 'v: 2, name:', 'v: 1, name:'],
  ['floor-zero', 'floor: -30, times', 'floor: 0, times'],
  ['name-ignored', "name: aName || ('Weisman-Klemp", "name: ('Weisman-Klemp"],
  ['motion-lost', 'floor: -30, times, motion: mot,', 'floor: -30, times, motion: { u: 0, v: 0 },'],
  ['base-lost', 'base: PR.base && PR.base.z ? { z: PR.base.z.slice(0, bnz), u: PR.base.u.slice(0, bnz), v: PR.base.v.slice(0, bnz) } : PR.base, track,', 'track,'],
  ['box-wind-step', 'const WBOX = 0.5,', 'const WBOX = 1,'],
  ['nest-vz-scale-fixed', 'scale: { wind: WNEST, vz: run.vz.scale }', 'scale: { wind: WNEST, vz: 0.25 }'],
  ['nest-frame-lost', 'frame: run.frame }]', 'frame: { u: 0, v: 0 } }]'],
  ['window-cells-no-levels', 'const wn = (w) => (w.i1 - w.i0) * (w.j1 - w.j0) * w.nz,', 'const wn = (w) => (w.i1 - w.i0) * (w.j1 - w.j0),'],
  // the frames: times, the choice, the offsets, the nest's place
  ['times-no-start', 'run.startMinute + t / 60', 't / 60'],
  ['times-in-seconds', 'run.startMinute + t / 60', 'run.startMinute + t'],
  ['window-end-exclusive', 't <= b + 1e-6', 't < b'],
  ['window-start-exclusive', 't >= a - 1e-6', 't > a'],
  ['window-every-ignored', 'Math.abs((t - a) / e - Math.round((t - a) / e)) < 1e-6', 'true'],
  ['offsets-box-only', 'at += blockLen;', 'at += 5 * wn(BW);'],
  ['offsets-no-end', 'offsets.push(at);\nconst header', 'const header'],
  ['corner-swapped', 'fn.push([[0, cx, cy]])', 'fn.push([[0, cy, cx]])'],
  ['corner-first-frame', 'const cx = run.corners[fi][0] - bi0 * PR.dx, cy = run.corners[fi][1] - bj0 * PR.dx;', 'const cx = run.corners[0][0] - bi0 * PR.dx, cy = run.corners[0][1] - bj0 * PR.dx;'],
  ['track-first-frame', 'track.push([PR.track[fi][0] - bi0 * PR.dx, PR.track[fi][1] - bj0 * PR.dx].concat(PR.track[fi].slice(2)))', 'track.push([PR.track[0][0] - bi0 * PR.dx, PR.track[0][1] - bj0 * PR.dx].concat(PR.track[0].slice(2)))'],
  // the arrays of a frame
  ['block-frame-index', 'b[o] = dbz[fi * n + s];', 'b[o] = dbz[s];'],
  ['block-vz-frame-index', 'b[m + o] = vz[fi * n + s];', 'b[m + o] = vz[s];'],
  ['block-vz-slot', 'b[m + o] = vz[fi * n + s];', 'b[o] = vz[fi * n + s];'],
  ['block-wind-order', 'uvw[(fi * 3 + c) * n + s] * 0.01', 'uvw[(fi * 3 + (2 - c)) * n + s] * 0.01'],
  ['block-wind-frame', 'uvw[(fi * 3 + c) * n + s] * 0.01', 'uvw[c * n + s] * 0.01'],
  ['block-wind-unit', 'uvw[(fi * 3 + c) * n + s] * 0.01', 'uvw[(fi * 3 + c) * n + s] * 0.1'],
  ['block-wind-slot', ', (2 + c) * m + o)', ', (1 + c) * m + o)'],
  ['block-row-stride', 'const s = (k * g.ny + j) * g.nx + i;', 'const s = (k * g.nx + j) * g.ny + i;'],
  ['block-level-stride', 'const s = (k * g.ny + j) * g.nx + i;', 'const s = (k * g.nz + j) * g.nx + i;'],
  ['block-column-offset-lost', 'for (let i = w.i0; i < w.i1; i++, o++)', 'for (let i = 0; i < w.i1 - w.i0; i++, o++)'],
  ['block-row-offset-lost', 'for (let j = w.j0; j < w.j1; j++) for (let i = w.i0;', 'for (let j = 0; j < w.j1 - w.j0; j++) for (let i = w.i0;'],
  ['block-levels-all', 'for (let k = 0; k < w.nz; k++) for (let j = w.j0;', 'for (let k = 0; k < g.nz; k++) for (let j = w.j0;'],
  ['box-and-nest-swapped', 'await put(block(pdbz, pvz, PU, fi, PR, BW, WBOX)); await put(block(cdbz, cvz, CU, fi, run, CW, WNEST));', 'await put(block(cdbz, cvz, CU, fi, run, CW, WNEST)); await put(block(pdbz, pvz, PU, fi, PR, BW, WBOX));'],
  ['clamp-high', 'if (q > 127) { q = 127;', 'if (q > 127) { q = 126;'],
  ['clamp-low', 'else if (q < -127) { q = -127;', 'else if (q < -127) { q = -126;'],
  ['clamp-uncounted', 'if (q > 127) { q = 127; clipped++; }', 'if (q > 127) { q = 127; }'],
  // the nest's wind step
  ['step-never-1', 'cmax > 63.5 ? 1 : 0.5', 'cmax > 63.5 ? 0.5 : 0.5'],
  ['step-1-too-late', 'cmax > 63.5 ? 1 : 0.5', 'cmax > 127 ? 1 : 0.5'],
  ['step-1-always', 'cmax > 63.5 ? 1 : 0.5', 'cmax > 63.5 ? 1 : 1'],
  ['strongest-first-frame', 'for (const [, fi] of keep) for (let c = 0; c < 3; c++) for (let k = 0;', 'for (const [, fi] of [keep[0]]) for (let c = 0; c < 3; c++) for (let k = 0;'],
  ['strongest-two-components', 'for (let c = 0; c < 3; c++) for (let k = 0; k < CW.nz;', 'for (let c = 0; c < 2; c++) for (let k = 0; k < CW.nz;'],
  ['strongest-unit', '* cn + k * run.nx * run.ny + q]) * 0.01', '* cn + k * run.nx * run.ny + q]) * 0.1'],
  ['strongest-all-levels', 'for (let k = 0; k < CW.nz; k++) for (let q = 0;', 'for (let k = 0; k < run.nz; k++) for (let q = 0;'],
  ['strongest-component-slot', 'CU[(fi * 3 + c) * cn +', 'CU[(fi * 3) * cn + c +'],
  // the box on the ground
  ['origin-sign-track', 'e * 1000 - tr[0] -', 'e * 1000 + tr[0] -'],
  ['origin-no-motion-u', '- mot.u * 60 * tm)', '- 0)'],
  ['origin-v-with-u', '- mot.v * 60 * tm)', '- mot.u * 60 * tm)'],
  ['origin-minute-by-index', 'tm = minutes[near]', 'tm = near'],
  ['at-default-first-frame', 'keep[Math.floor(keep.length / 2)][0]', 'keep[0][0]'],
  ['at-default-east', 'isFinite(atE) ? atE : -30', 'isFinite(atE) ? atE : 0'],
  ['at-default-north', 'isFinite(atN) ? atN : 25', 'isFinite(atN) ? atN : 0'],
  ['at-nearest-never', 'if (Math.abs(t - m) < dn)', 'if (Math.abs(t - m) > dn)'],
  ['on-ignored', 'const tr = ON ? [ON[0] * 1000, ON[1] * 1000] : PR.track[near],', 'const tr = PR.track[near],'],
  ['on-swapped', 'const tr = ON ? [ON[0] * 1000, ON[1] * 1000] :', 'const tr = ON ? [ON[1] * 1000, ON[0] * 1000] :'],
  ['on-metres', 'const tr = ON ? [ON[0] * 1000, ON[1] * 1000] :', 'const tr = ON ? [ON[0], ON[1]] :'],
  ['on-north-lost', 'const tr = ON ? [ON[0] * 1000, ON[1] * 1000] :', 'const tr = ON ? [ON[0] * 1000, PR.track[near][1]] :'],
  ['at-empty-is-zero', "process.env.AT ? process.env.AT.split(':').map(Number) : []", "(process.env.AT || '').split(':').map(Number)"],
  ['site-default', "process.env.SITE || 'KVNX'", "process.env.SITE || 'KTLX'"],
  ['site-lat-lon-swapped', 'lat0: site[0], lon0: site[1]', 'lat0: site[1], lon0: site[0]'],
  ['clock-default', "process.env.CLOCK || '15:00'", "process.env.CLOCK || '12:00'"],
  ['zone-default', "process.env.TZ || 'CDT'", "process.env.TZ || 'CST'"],
  // cutting a pack down
  ['crop-origin-lost', 'origin = [origin[0] + bi0 * PR.dx, origin[1] + bj0 * PR.dx];', 'origin = [origin[0], origin[1]];'],
  ['crop-origin-east-only', 'origin = [origin[0] + bi0 * PR.dx, origin[1] + bj0 * PR.dx];', 'origin = [origin[0] + bi0 * PR.dx, origin[1]];'],
  ['crop-origin-north-by-east', 'origin = [origin[0] + bi0 * PR.dx, origin[1] + bj0 * PR.dx];', 'origin = [origin[0] + bi0 * PR.dx, origin[1] + bi0 * PR.dx];'],
  ['crop-corner-east-lost', 'const cx = run.corners[fi][0] - bi0 * PR.dx,', 'const cx = run.corners[fi][0],'],
  ['crop-corner-north-lost', 'cy = run.corners[fi][1] - bj0 * PR.dx;', 'cy = run.corners[fi][1];'],
  ['crop-track-east-lost', 'track.push([PR.track[fi][0] - bi0 * PR.dx,', 'track.push([PR.track[fi][0],'],
  ['crop-track-north-lost', 'PR.track[fi][1] - bj0 * PR.dx]', 'PR.track[fi][1]]'],
  ['crop-track-strength-lost', '.concat(PR.track[fi].slice(2))', '.concat([])'],
  ['box-west-up', 'Math.floor(b[0] * 1000 / PR.dx + 1e-9)', 'Math.ceil(b[0] * 1000 / PR.dx + 1e-9)'],
  ['box-east-down', 'Math.ceil(b[1] * 1000 / PR.dx - 1e-9)', 'Math.floor(b[1] * 1000 / PR.dx - 1e-9)'],
  ['box-south-up', 'Math.floor(b[2] * 1000 / PR.dx + 1e-9)', 'Math.ceil(b[2] * 1000 / PR.dx + 1e-9)'],
  ['box-north-down', 'Math.ceil(b[3] * 1000 / PR.dx - 1e-9)', 'Math.floor(b[3] * 1000 / PR.dx - 1e-9)'],
  ['box-west-not-cut', 'bi0 = Math.max(0, Math.floor(', 'bi0 = Math.max(-1, Math.floor('],
  ['box-south-not-cut', 'bj0 = Math.max(0, Math.floor(', 'bj0 = Math.max(-1, Math.floor('],
  ['box-east-not-cut', 'bi1 = Math.min(PR.nx, Math.ceil(', 'bi1 = Math.min(PR.nx + 1, Math.ceil('],
  ['box-north-cut-by-nx', 'bj1 = Math.min(PR.ny, Math.ceil(', 'bj1 = Math.min(PR.nx, Math.ceil('],
  ['box-y-by-dz', 'b[2] * 1000 / PR.dx + 1e-9)', 'b[2] * 1000 / PR.dz + 1e-9)'],
  ['box-window-ignored', 'const BW = { i0: bi0, i1: bi1, j0: bj0, j1: bj1, nz: bnz }', 'const BW = { i0: 0, i1: PR.nx, j0: 0, j1: PR.ny, nz: bnz }'],
  ['box-size-in-header', 'nx: bi1 - bi0, ny: bj1 - bj0, nz: bnz,', 'nx: PR.nx, ny: PR.ny, nz: bnz,'],
  ['box-ny-by-nx', 'nx: bi1 - bi0, ny: bj1 - bj0,', 'nx: bi1 - bi0, ny: bi1 - bi0,'],
  ['box-levels-in-header', 'ny: bj1 - bj0, nz: bnz,', 'ny: bj1 - bj0, nz: PR.nz,'],
  ['box-levels-in-window', 'j1: bj1, nz: bnz }', 'j1: bj1, nz: PR.nz }'],
  ['base-uncut', 'base: PR.base && PR.base.z ? { z: PR.base.z.slice(0, bnz), u: PR.base.u.slice(0, bnz), v: PR.base.v.slice(0, bnz) } : PR.base,', 'base: PR.base,'],
  ['base-z-uncut', 'z: PR.base.z.slice(0, bnz),', 'z: PR.base.z,'],
  ['base-u-uncut', 'u: PR.base.u.slice(0, bnz),', 'u: PR.base.u,'],
  ['base-v-uncut', 'v: PR.base.v.slice(0, bnz) }', 'v: PR.base.v }'],
  ['ztop-down', "Math.ceil(num('ZTOP') * 1000 / PR.dz - 1e-9)", "Math.floor(num('ZTOP') * 1000 / PR.dz - 1e-9)"],
  ['ztop-not-cut', "Math.min(PR.nz, Math.ceil(num('ZTOP')", "Math.min(PR.nz + 3, Math.ceil(num('ZTOP')"],
  ['ztop-by-nest-dz', "num('ZTOP') * 1000 / PR.dz", "num('ZTOP') * 1000 / run.dz"],
  ['nest-ztop-down', "Math.ceil(num('NEST_ZTOP') * 1000 / run.dz - 1e-9)", "Math.floor(num('NEST_ZTOP') * 1000 / run.dz - 1e-9)"],
  ['nest-ztop-by-box-dz', "num('NEST_ZTOP') * 1000 / run.dz", "num('NEST_ZTOP') * 1000 / PR.dz"],
  ['nest-ztop-not-cut', "Math.min(run.nz, Math.ceil(num('NEST_ZTOP')", "Math.min(run.nz + 3, Math.ceil(num('NEST_ZTOP')"],
  ['nest-ztop-ignored', 'CW = { i0: 0, i1: run.nx, j0: 0, j1: run.ny, nz: cnz }', 'CW = { i0: 0, i1: run.nx, j0: 0, j1: run.ny, nz: run.nz }'],
  ['nest-levels-in-header', 'nests: [{ nx: run.nx, ny: run.ny, nz: cnz,', 'nests: [{ nx: run.nx, ny: run.ny, nz: run.nz,'],
  ['snap-ignored', 'SNAP ? Math.round(t / SNAP) * SNAP : t', 't'],
  ['snap-down', 'Math.round(t / SNAP) * SNAP', 'Math.floor(t / SNAP) * SNAP'],
  ['snap-up', 'Math.round(t / SNAP) * SNAP', 'Math.ceil(t / SNAP) * SNAP'],
  ['snap-no-step', 'Math.round(t / SNAP) * SNAP', 'Math.round(t / SNAP)'],
  ['snap-clash-unchecked', 'if (!(times[i] > times[i - 1])) die(', 'if (false) die('],
  ['num-unchecked', "if (!(v > 0)) die(name", "if (false) die(name"],
  ['box-format-unchecked', "if (b.length !== 4 || b.some((v) => !isFinite(v))) die(", "if (false) die("],
  ['box-empty-unchecked', 'if (!(bi1 > bi0 && bj1 > bj0)) die(', 'if (false) die('],
  ['box-empty-east-only', 'if (!(bi1 > bi0 && bj1 > bj0)) die(', 'if (!(bi1 > bi0)) die('],
  ['box-empty-north-only', 'if (!(bi1 > bi0 && bj1 > bj0)) die(', 'if (!(bj1 > bj0)) die('],
  ['nest-west-unchecked', 'if (cx < -1e-6 ||', 'if (false ||'],
  ['nest-south-unchecked', '|| cy < -1e-6 ||', '|| false ||'],
  ['nest-east-unchecked', '|| cx + run.nx * run.dx > bw + 1e-6 ||', '|| false ||'],
  ['nest-north-unchecked', '|| cy + run.ny * run.dx > bh + 1e-6) die(', '|| false) die('],
  ['nest-west-edge-refused', 'cx < -1e-6', 'cx <= 0'],
  ['nest-east-edge-refused', 'cx + run.nx * run.dx > bw + 1e-6', 'cx + run.nx * run.dx >= bw'],
  ['nest-east-size-by-ny', 'cx + run.nx * run.dx > bw', 'cx + run.ny * run.dx > bw'],
  ['nest-north-size-by-nx', 'cy + run.ny * run.dx > bh', 'cy + run.nx * run.dx > bh'],
  ['window-width-by-dz', 'bw = (bi1 - bi0) * PR.dx,', 'bw = (bi1 - bi0) * PR.dz,'],
  ['window-height-by-width', 'bh = (bj1 - bj0) * PR.dx;', 'bh = (bi1 - bi0) * PR.dx;'],
  // the refusals
  ['usage-unchecked', 'if (!runPath || !outPath) {', 'if (false) {'],
  ['parent-unchecked', 'if (!PR) {', 'if (false) {'],
  ['site-unchecked', 'if (!site) {', 'if (false) {'],
  ['no-frame-unchecked', 'if (!keep.length) {', 'if (false) {'],
  ['bad-window-accepted', "if (!m) { console.error('bad window", "if (false) { console.error('bad window"],
];

const only = process.argv.slice(2).find((a) => !a.startsWith('jobs=')), jobs = +((process.argv.find((a) => a.startsWith('jobs=')) || '').slice(5)) || Math.min(4, cpus().length);
const base = mkdtempSync(join(tmpdir(), 'sev-npmut-'));
const prepare = (name, text) => {
  const d = join(base, name);
  for (const x of ['src', 'tests', 'data/generated', 'tools/severe_research']) mkdirSync(join(d, x), { recursive: true });
  for (const x of KEEP) copyFileSync(join(root, x), join(d, x));
  writeFileSync(join(d, TOOL), text);
  return d;
};
const run = (name, text) => new Promise((resolve) => {
  const d = prepare(name, text), p = spawn('node', ['tests/severe_nestpack.mjs'], { cwd: d }); let out = '', err = '';
  const timer = setTimeout(() => p.kill('SIGKILL'), 120000);
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
