// Mutation testing of what a finer storm stands on (the driven sides and the relaxation zone, the drag of the ground and the saving of a state in src/severe-core.js, and the nest of
// src/severe-nest.js): each mutant changes one expression, and tests/severe_nest.mjs runs against the copy.
// A mutant that the tests let through ("survived") is a place where they do not look.
//   node tools/severe_nest_mutants.mjs [name-filter] [jobs=4]
// Each copy goes to its own temporary directory with the test and the data it reads beside it, so nothing in the repository is touched and the copies run side by side.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir, cpus } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = { core: 'severe-core.js', nest: 'severe-nest.js' };
const SRC = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, readFileSync(join(root, 'src/' + f), 'utf8')]));
const DATA = [];
// [name, file, the text to find (once), its replacement]
// (Changes that make no difference, and so are not here: the halo of the pressure in the acoustic steps of a driven side, because the faces at the edge are set from the target straight after;
//  the edge faces of u and w at the start of a nest, because the first fill sets them from the target; the corner halo above and below the ground, which no stencil reads.)
const M = [
  // the driven sides
  ['driven-halo-from-inside', 'core', 'else if (dv) for (let m = 1; m <= H; m++) { a[b - m * s] = tg[b - m * s]; a[b + (n - 1 + m) * s] = tg[b + (n - 1 + m) * s]; }', 'else if (dv) for (let m = 1; m <= H; m++) { a[b - m * s] = a[b + (m - 1) * s]; a[b + (n - 1 + m) * s] = tg[b + (n - 1 + m) * s]; }'],
  ['driven-halo-east-index', 'core', 'a[b - m * s] = tg[b - m * s]; a[b + (n - 1 + m) * s] = tg[b + (n - 1 + m) * s]; }', 'a[b - m * s] = tg[b - m * s]; a[b + (n - 1 + m) * s] = tg[b + (n - m) * s]; }'],
  ['driven-face-edges-zero', 'core', 'a[b] = tg[b]; a[b + n * s] = tg[b + n * s];', 'a[b] = 0; a[b + n * s] = 0;'],
  ['driven-face-halo-east', 'core', 'a[b + (n + m) * s] = tg[b + (n + m) * s]; }\n        } else {', 'a[b + (n + m) * s] = tg[b + (n - m) * s]; }\n        } else {'],
  ['facebc-u-east-zero', 'core', 'else if (drv[0]) { X.u[a] = TG.u[a]; X.u[b] = TG.u[b]; }', 'else if (drv[0]) { X.u[a] = TG.u[a]; X.u[b] = 0; }'],
  ['facebc-v-north-zero', 'core', 'else if (drv[1]) { X.v[a] = TG.v[a]; X.v[b] = TG.v[b]; }', 'else if (drv[1]) { X.v[a] = TG.v[a]; X.v[b] = 0; }'],
  ['fill-th-no-target', 'core', 'fillC(X.th, TG.th); fillC(X.pi, TG.pi);', 'fillC(X.th); fillC(X.pi, TG.pi);'],
  ['fill-w-no-target', 'core', 'fill(X.w, 0, 0, 1, TG.w);', 'fill(X.w, 0, 0, 1);'],
  ['bc-kind-unchecked', 'core', "if (!['wall', 'periodic', 'driven'].includes(bc[d]))", "if (false)"],
  // the relaxation zone
  ['relax-width-default', 'core', '(o.relax && o.relax.width) || 6', '(o.relax && o.relax.width) || 4'],
  ['relax-taper-linear', 'core', 'RMAX * Math.pow(Math.cos(0.5 * Math.PI * d / RW), 2)', 'RMAX * Math.cos(0.5 * Math.PI * d / RW)'],
  ['relax-face-distance', 'core', 'dfx = drv[0] ? Math.min(i, nx - i) : big', 'dfx = drv[0] ? Math.min(i, nx - 1 - i) : big'],
  ['relax-v-face-distance', 'core', 'dfy = drv[1] && ny > 1 ? Math.min(j, ny - j) : big', 'dfy = drv[1] && ny > 1 ? Math.min(j, ny - 1 - j) : big'],
  ['relax-u-not-pulled', 'core', 'if (aU) S.u[q] += aU * (TG.u[q] - S.u[q]);', 'if (false) S.u[q] += aU * (TG.u[q] - S.u[q]);'],
  ['relax-scalars-half', 'core', 'if (aC) for (const n of other) S[n][q] += aC * (TG[n][q] - S[n][q]);', 'if (aC) for (const n of other) S[n][q] += 0.5 * aC * (TG[n][q] - S[n][q]);'],
  ['relax-not-applied', 'core', 'if (nestOn && RW) relax();', 'if (false) relax();'],
  // the drag
  ['drag-cd-log-height', 'core', 'Math.log(0.5 * dz / (o.drag.z0 || 0.1))', 'Math.log(dz / (o.drag.z0 || 0.1))'],
  ['drag-frame-u-lost', 'core', "fu: (o.drag.frame && o.drag.frame.u) || 0", 'fu: 0'],
  ['drag-frame-v-lost', 'core', "fv: (o.drag.frame && o.drag.frame.v) || 0", 'fv: 0'],
  ['drag-sign', 'core', 'R.u[o] -= cdz * Math.sqrt(ug * ug + vu * vu) * ug;', 'R.u[o] += cdz * Math.sqrt(ug * ug + vu * vu) * ug;'],
  ['drag-speed-u-only', 'core', 'R.u[o] -= cdz * Math.sqrt(ug * ug + vu * vu) * ug;', 'R.u[o] -= cdz * Math.abs(ug) * ug;'],
  ['drag-v-frame-in-speed', 'core', 'const vu = (ny > 1 ? 0.25 * (X.v[o - 1] + X.v[o] + X.v[o - 1 + sy] + X.v[o + sy]) : 0) + DR.fv, ug', 'const vu = (ny > 1 ? 0.25 * (X.v[o - 1] + X.v[o] + X.v[o - 1 + sy] + X.v[o + sy]) : 0), ug'],
  ['drag-v-component-not-slowed', 'core', 'R.v[o] -= cdz * Math.sqrt(uv * uv + vg * vg) * vg;', 'R.v[o] -= 0;'],
  ['drag-v-speed-no-u-frame', 'core', 'const uv = 0.25 * (X.u[o] + X.u[o + 1] + X.u[o - sy] + X.u[o + 1 - sy]) + DR.fu, vg', 'const uv = 0.25 * (X.u[o] + X.u[o + 1] + X.u[o - sy] + X.u[o + 1 - sy]), vg'],
  ['drag-second-level', 'core', 'const o = idx(i, j, 0), cdz = DR.cd / dz;', 'const o = idx(i, j, 1), cdz = DR.cd / dz;'],
  ['drag-thickness', 'core', 'const o = idx(i, j, 0), cdz = DR.cd / dz;', 'const o = idx(i, j, 0), cdz = DR.cd / (2 * dz);'],
  // saving a state
  ['state-time-not-restored', 'core', 'core.time = r.time; precip.set(r.precip);', 'precip.set(r.precip);'],
  ['state-precip-not-restored', 'core', 'precip.set(r.precip); precipS.set(r.precipS); precipG.set(r.precipG); fillAll(S);', 'precipS.set(r.precipS); precipG.set(r.precipG); fillAll(S);'],
  ['state-grid-unchecked', 'core', 'if (r.nx !== nx || r.ny !== ny || r.nz !== nz) throw', 'if (false) throw'],
  ['state-one-field-missing', 'core', 'for (const n of names) r.f[n] = S[n].slice(); return r; };', 'for (const n of names) if (n !== "qg") r.f[n] = S[n].slice(); else r.f[n] = new Float64Array(N); return r; };'],
  // the nest
  ['kind-u-centre-x', 'nest', 'u: [0, 0.5, 0.5]', 'u: [0.5, 0.5, 0.5]'],
  ['kind-v-centre-y', 'nest', 'v: [0.5, 0, 0.5]', 'v: [0.5, 0.5, 0.5]'],
  ['kind-w-centre-z', 'nest', 'w: [0.5, 0.5, 0]', 'w: [0.5, 0.5, 0.5]'],
  ['kind-centre-lowered', 'nest', 'c: [0.5, 0.5, 0.5]', 'c: [0.5, 0.5, 0]'],
  ['frame-not-in-position-x', 'nest', 'posX = (i, ox, t) => nest.x0 + fr.u * t + (i + ox) * C.dx', 'posX = (i, ox, t) => nest.x0 + (i + ox) * C.dx'],
  ['frame-not-in-position-y', 'nest', 'posY = (j, oy, t) => nest.y0 + fr.v * t + (j + oy) * C.dy', 'posY = (j, oy, t) => nest.y0 + (j + oy) * C.dy'],
  ['frame-wind-u-not-removed', 'nest', "off = n === 'u' ? fr.u : n === 'v' ? fr.v : 0;\n        for (let m = 0; m < M; m++)", "off = n === 'v' ? fr.v : 0;\n        for (let m = 0; m < M; m++)"],
  ['frame-wind-v-not-removed', 'nest', "off = n === 'u' ? fr.u : n === 'v' ? fr.v : 0;\n        for (let m = 0; m < M; m++)", "off = n === 'u' ? fr.u : 0;\n        for (let m = 0; m < M; m++)"],
  ['init-wind-frame-lost', 'nest', "off = n === 'u' ? fr.u : n === 'v' ? fr.v : 0;\n        const ni =", "off = 0;\n        const ni ="],
  ['blend-end-of-step', 'nest', 'blend(m / ratio); C.step(dt / ratio);', 'blend(1); C.step(dt / ratio);'],
  ['sample-at-start-time', 'nest', 'P.step(dt); sample(B1, P.time);', 'P.step(dt); sample(B1, t0);'],
  ['blend-not-swapped', 'nest', 'for (const n of names) { const s = B0[n]; B0[n] = B1[n]; B1[n] = s; }', ''],
  ['zone-one-short', 'nest', 'if (i < RW || i >= nx - RW || j < RW || j >= ny - RW)', 'if (i < RW - 1 || i >= nx - RW + 1 || j < RW - 1 || j >= ny - RW + 1)'],
  ['trilinear-z-weight', 'nest', '* (1 - wz) + (c01 * (1 - wy1) + c11 * wy1) * wz', '* (1 - wz) + (c01 * (1 - wy1) + c11 * wy1) * (1 - wz)'],
  ['trilinear-y-weight', 'nest', 'return (c00 * (1 - wy1) + c10 * wy1)', 'return (c00 * wy1 + c10 * (1 - wy1))'],
  ['trilinear-x-weight', 'nest', 'const c00 = a[o] * (1 - wx) + a[o + psx] * wx,', 'const c00 = a[o] * wx + a[o + psx] * (1 - wx),'],
  ['depth-unchecked', 'nest', 'if (P.nz * P.dz !== C.nz * C.dz) throw', 'if (false) throw'],
  ['driven-unchecked', 'nest', 'if (!C.target) throw', 'if (false) throw'],
  ['field-unchecked', 'nest', 'if (!pn.has(n)) throw', 'if (false) throw'],
];

const only = process.argv.slice(2).find((a) => !a.startsWith('jobs=')), jobs = +((process.argv.find((a) => a.startsWith('jobs=')) || '').slice(5)) || Math.min(4, cpus().length);
const base = mkdtempSync(join(tmpdir(), 'sev-gmut-'));
const prepare = (name, file, text) => {
  const d = join(base, name);
  for (const x of ['src', 'tests', 'data/generated', 'data/severe/packs']) mkdirSync(join(d, x), { recursive: true });
  copyFileSync(join(root, 'tests/severe_nest.mjs'), join(d, 'tests/severe_nest.mjs'));
  for (const x of DATA) copyFileSync(join(root, x), join(d, x));
  for (const k of Object.keys(FILES)) writeFileSync(join(d, 'src/' + FILES[k]), k === file ? text : SRC[k]);
  return d;
};
const run = (name, file, text) => new Promise((resolve) => {
  const d = prepare(name, file, text), p = spawn('node', ['tests/severe_nest.mjs'], { cwd: d }); let out = '', err = '';
  const timer = setTimeout(() => p.kill('SIGKILL'), 300000);
  p.stdout.on('data', (b) => { out += b; }); p.stderr.on('data', (b) => { err += b; });
  p.on('close', (code) => { clearTimeout(timer); const f = out.split('\n').filter((l) => l.startsWith('FAIL')).map((l) => l.slice(5, 90)); rmSync(d, { recursive: true, force: true }); resolve(code === 0 ? { killed: false } : { killed: true, by: f[0] || err.split('\n').find((l) => l.trim()) || 'crash' }); });
});

const main = async () => {
  const b = await run('original', 'core', SRC.core);
  if (b.killed) { console.log('the unmutated copy fails:', b.by); process.exit(2); }
  const todo = [];
  for (const [name, file, a, c] of M) {
    if (only && !name.includes(only)) continue;
    const n = SRC[file].split(a).length - 1;
    if (n !== 1) { console.log('??   ' + name + ': the text to change occurs ' + n + ' times'); continue; }
    todo.push([name, file, SRC[file].replace(a, () => c)]);
  }
  let killed = 0; const survived = []; let next = 0;
  await Promise.all(Array.from({ length: jobs }, async () => {
    while (next < todo.length) {
      const [name, file, text] = todo[next++], r = await run(name, file, text);
      if (r.killed) { killed++; console.log('kill ' + name + '  <- ' + r.by); } else { survived.push(name); console.log('SURVIVED ' + name); }
    }
  }));
  console.log('\n' + killed + ' of ' + todo.length + ' mutants killed' + (survived.length ? '; survived: ' + survived.join(', ') : ''));
  rmSync(base, { recursive: true, force: true });
  process.exit(survived.length ? 1 : 0);
};
main();
