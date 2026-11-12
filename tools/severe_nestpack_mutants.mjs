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
  ['motion-lost', 'motion: mot, base: PR.base', 'motion: { u: 0, v: 0 }, base: PR.base'],
  ['base-lost', 'motion: mot, base: PR.base, track,', 'motion: mot, track,'],
  ['box-wind-step', 'const WBOX = 0.5,', 'const WBOX = 1,'],
  ['nest-vz-scale-fixed', 'scale: { wind: WNEST, vz: run.vz.scale }', 'scale: { wind: WNEST, vz: 0.25 }'],
  ['nest-frame-lost', 'frame: run.frame }]', 'frame: { u: 0, v: 0 } }]'],
  ['box-cells-no-levels', 'const bn = PR.nx * PR.ny * PR.nz,', 'const bn = PR.nx * PR.ny,'],
  // the frames: times, the choice, the offsets, the nest's place
  ['times-no-start', 'run.startMinute + t / 60', 't / 60'],
  ['times-in-seconds', 'run.startMinute + t / 60', 'run.startMinute + t'],
  ['window-end-exclusive', 't <= b + 1e-6', 't < b'],
  ['window-start-exclusive', 't >= a - 1e-6', 't > a'],
  ['window-every-ignored', 'Math.abs((t - a) / e - Math.round((t - a) / e)) < 1e-6', 'true'],
  ['offsets-box-only', 'at += blockLen;', 'at += 5 * bn;'],
  ['offsets-no-end', 'offsets.push(at);\nconst header', 'const header'],
  ['corner-swapped', '[[0, run.corners[fi][0], run.corners[fi][1]]]', '[[0, run.corners[fi][1], run.corners[fi][0]]]'],
  ['corner-first-frame', '[[0, run.corners[fi][0], run.corners[fi][1]]]', '[[0, run.corners[0][0], run.corners[0][1]]]'],
  ['track-first-frame', 'track.push(PR.track[fi])', 'track.push(PR.track[0])'],
  // the arrays of a frame
  ['block-frame-index', 'dbz.subarray(fi * n, (fi + 1) * n), 0)', 'dbz.subarray(0, n), 0)'],
  ['block-vz-slot', 'vz.subarray(fi * n, (fi + 1) * n), n)', 'vz.subarray(fi * n, (fi + 1) * n), 0)'],
  ['block-wind-order', 'uvw[(fi * 3 + c) * n + i]', 'uvw[(fi * 3 + (2 - c)) * n + i]'],
  ['block-wind-unit', 'uvw[(fi * 3 + c) * n + i] * 0.01', 'uvw[(fi * 3 + c) * n + i] * 0.1'],
  ['block-wind-slot', ', (2 + c) * n + i)', ', (1 + c) * n + i)'],
  ['box-and-nest-swapped', 'await put(block(pdbz, pvz, PU, fi, bn, WBOX)); await put(block(cdbz, cvz, CU, fi, cn, WNEST));', 'await put(block(cdbz, cvz, CU, fi, cn, WNEST)); await put(block(pdbz, pvz, PU, fi, bn, WBOX));'],
  ['clamp-high', 'if (q > 127) { q = 127;', 'if (q > 127) { q = 126;'],
  ['clamp-low', 'else if (q < -127) { q = -127;', 'else if (q < -127) { q = -126;'],
  ['clamp-uncounted', 'if (q > 127) { q = 127; clipped++; }', 'if (q > 127) { q = 127; }'],
  // the nest's wind step
  ['step-never-1', 'cmax > 63.5 ? 1 : 0.5', 'cmax > 63.5 ? 0.5 : 0.5'],
  ['step-1-too-late', 'cmax > 63.5 ? 1 : 0.5', 'cmax > 127 ? 1 : 0.5'],
  ['step-1-always', 'cmax > 63.5 ? 1 : 0.5', 'cmax > 63.5 ? 1 : 1'],
  ['strongest-first-frame', 'for (const [, fi] of keep) for (let q = 0; q < 3 * cn; q++)', 'for (const [, fi] of [keep[0]]) for (let q = 0; q < 3 * cn; q++)'],
  ['strongest-two-components', 'q < 3 * cn; q++) cmax', 'q < 2 * cn; q++) cmax'],
  ['strongest-unit', 'Math.abs(CU[fi * 3 * cn + q]) * 0.01', 'Math.abs(CU[fi * 3 * cn + q]) * 0.1'],
  // the box on the ground
  ['origin-sign-track', 'e * 1000 - tr[0] -', 'e * 1000 + tr[0] -'],
  ['origin-no-motion-u', '- mot.u * 60 * tm)', '- 0)'],
  ['origin-v-with-u', '- mot.v * 60 * tm)', '- mot.u * 60 * tm)'],
  ['origin-minute-by-index', 'tm = minutes[near]', 'tm = near'],
  ['at-default-first-frame', 'keep[Math.floor(keep.length / 2)][0]', 'keep[0][0]'],
  ['at-default-east', 'isFinite(atE) ? atE : -30', 'isFinite(atE) ? atE : 0'],
  ['at-default-north', 'isFinite(atN) ? atN : 25', 'isFinite(atN) ? atN : 0'],
  ['at-nearest-never', 'if (Math.abs(t - m) < dn)', 'if (Math.abs(t - m) > dn)'],
  ['at-empty-is-zero', "process.env.AT ? process.env.AT.split(':').map(Number) : []", "(process.env.AT || '').split(':').map(Number)"],
  ['site-default', "process.env.SITE || 'KVNX'", "process.env.SITE || 'KTLX'"],
  ['site-lat-lon-swapped', 'lat0: site[0], lon0: site[1]', 'lat0: site[1], lon0: site[0]'],
  ['clock-default', "process.env.CLOCK || '15:00'", "process.env.CLOCK || '12:00'"],
  ['zone-default', "process.env.TZ || 'CDT'", "process.env.TZ || 'CST'"],
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
