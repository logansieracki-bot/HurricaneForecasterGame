// Mutation testing of what the Severe radar page stands on (the projections and the sphere, the map data codec, the label layout, the storm pack, the scanning step and the GPU picture's
// reference): each mutant changes one expression of src/severe-geo.js, severe-map.js, severe-pack.js, severe-worker.js or severe-gl.js, and tests/severe_geo.mjs runs against the copy.
// A mutant that the tests let through ("survived") is a place where they do not look.
//   node tools/severe_geo_mutants.mjs [name-filter] [jobs=4]
// Each copy goes to its own temporary directory with the test and the data it reads beside it, so nothing in the repository is touched and the copies run side by side.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir, cpus } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = { geo: 'severe-geo.js', map: 'severe-map.js', pack: 'severe-pack.js', worker: 'severe-worker.js', gl: 'severe-gl.js', palette: 'severe-palette.js', radar: 'severe-radar.js' };
const SRC = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, readFileSync(join(root, 'src/' + f), 'utf8')]));
const DATA = ['data/generated/severe-geo.bin', 'data/generated/severe-sites.json', 'data/severe/Apocs_BR_Expert.pal', 'data/severe/packs/wk82-1km-5min.hfp'];
// [name, file, the text to find (once), its replacement]
const M = [
  // Web Mercator and the view
  ['merc-x-radius', 'geo', 'const mercX = (lon) => RM * lon * DEG;', 'const mercX = (lon) => RE * lon * DEG;'],
  ['merc-y-half-angle', 'geo', 'Math.tan(Math.PI / 4 + lat * DEG / 2)', 'Math.tan(Math.PI / 4 + lat * DEG)'],
  ['merc-inverse-lat', 'geo', '(2 * Math.atan(Math.exp(my / RM)) - Math.PI / 2) / DEG', '(Math.atan(Math.exp(my / RM)) * 2 - Math.PI / 4) / DEG'],
  ['zoom0-tile-size', 'geo', 'MPP0 = 2 * Math.PI * RM / 256', 'MPP0 = 2 * Math.PI * RM / 512'],
  ['zoom-of-base', 'geo', 'Math.log2(MPP0 / mpp)', 'Math.log(MPP0 / mpp)'],
  ['screen-y-up', 'geo', 'v.h / 2 - (my - v.cy) / v.mpp]', 'v.h / 2 + (my - v.cy) / v.mpp]'],
  ['screen-x-scale', 'geo', 'v.cx + (px - v.w / 2) * v.mpp', 'v.cx + (px - v.w / 2) / v.mpp'],
  ['screen-centre-w', 'geo', '(mx - v.cx) / v.mpp + v.w / 2', '(mx - v.cx) / v.mpp + v.h / 2'],
  // the sphere
  ['sphere-radius', 'geo', 'd = 2 * RE * Math.asin(', 'd = 2 * RM * Math.asin('],
  ['haversine-lat-term', 'geo', 'Math.cos(p1) * Math.cos(p2) * sl * sl', 'Math.cos(p1) * sl * sl'],
  ['bearing-atan-args', 'geo', 'Math.atan2(y, x) / DEG', 'Math.atan2(x, y) / DEG'],
  ['bearing-not-wrapped', 'geo', 'if (az < 0) az += 360;\n    return { d, az };', 'return { d, az };'],
  ['dest-angular-distance', 'geo', 'c = d / RE;', 'c = d / RM / 2;'],
  ['dest-longitude-not-wrapped', 'geo', "lon = ((lon + 540) % 360) - 180;", 'lon = lon;'],
  ['local-xy-swapped', 'geo', 'return { x: r.d * Math.sin(t), y: r.d * Math.cos(t) };', 'return { x: r.d * Math.cos(t), y: r.d * Math.sin(t) };'],
  ['fromlocal-atan2-args', 'geo', 'Math.atan2(x, y) / DEG, d)', 'Math.atan2(y, x) / DEG, d)'],
  // the bundle
  ['varint-continuation', 'geo', 'while (n >= 128) {', 'while (n >= 256) {'],
  ['zigzag-sign-lost', 'geo', 'const zig = (n) => ((n << 1) ^ (n >> 31)) >>> 0', 'const zig = (n) => (n << 1) >>> 0'],
  ['unzigzag-sign-lost', 'geo', 'unzig = (u) => (u >>> 1) ^ -(u & 1)', 'unzig = (u) => (u >>> 1)'],
  ['ring-deltas-not-summed', 'geo', 'for (let i = 0; i < n; i++) { px += r.s(); py += r.s(); const mx', 'for (let i = 0; i < n; i++) { px = r.s(); py = r.s(); const mx'],
  ['ring-bbox-top', 'geo', 'if (my > y1) y1 = my; }', 'if (my > y1) y1 = y0; }'],
  ['poly-bbox-merge', 'geo', 'Math.max(b0[2], g.bb[2])', 'Math.min(b0[2], g.bb[2])'],
  ['names-split-on-comma', 'geo', "nm === '' ? [] : nm.split('\\n')", "nm === '' ? [] : nm.split(',')"],
  ['extra-names-dropped', 'geo', "ex === '' ? [] : ex.split('\\n')", '[]'],
  ['point-deltas-not-summed', 'geo', 'c[i] = r.u(); px += r.s(); py += r.s();', 'c[i] = r.u(); px = r.s(); py = r.s();'],
  // the label layout
  ['layout-priority-reversed', 'map', 'items.slice().sort((a, b) => b.pri - a.pri)', 'items.slice().sort((a, b) => a.pri - b.pri)'],
  ['layout-input-sorted-in-place', 'map', 'items.slice().sort(', 'items.sort('],
  ['layout-no-padding-left', 'map', 'x0 = it.x - it.w / 2 - pad', 'x0 = it.x - it.w / 2'],
  ['layout-blockers-ignored', 'map', '(blockers || []).map((b) => b.slice())', '[]'],
  ['layout-x-overlap-ignored', 'map', 'if (x0 < p[2] && x1 > p[0] && y0 < p[3] && y1 > p[1])', 'if (y0 < p[3] && y1 > p[1])'],
  ['layout-y-overlap-ignored', 'map', 'if (x0 < p[2] && x1 > p[0] && y0 < p[3] && y1 > p[1])', 'if (x0 < p[2] && x1 > p[0])'],
  // the pack
  ['pack-motion-not-added-u', 'pack', 'u[k] = ub[k] * W + mo.u;', 'u[k] = ub[k] * W;'],
  ['pack-motion-not-added-v', 'pack', 'v[k] = vb[k] * W + mo.v;', 'v[k] = vb[k] * W;'],
  ['pack-wind-step', 'pack', 'w[k] = wb[k] * W;', 'w[k] = wb[k] * 0.25;'],
  ['pack-fall-speed-step', 'pack', 'vz[k] = vzb[k] * VZ;', 'vz[k] = vzb[k];'],
  ['pack-frame-block-offset', 'pack', 'u8.byteOffset + base + at(i), at(i + 1) - at(i))', 'u8.byteOffset + base + at(i), 5 * per)'],
  ['pack-volume-from-block-wind-offset', 'pack', 'o + 3 * per, per), wb', 'o + 2 * per, per), wb'],
  ['pack-corner-time-unit', 'pack', 'sc.origin[0] + mo.u * 60 * t', 'sc.origin[0] + mo.u * 6 * t'],
  ['pack-radar-box-sign', 'pack', 'return { x: l.x - c[0], y: l.y - c[1] };', 'return { x: l.x + c[0], y: l.y + c[1] };'],
  ['pack-box-to-ground-sign', 'pack', 'c[0] + bx, c[1] + by', 'c[0] - bx, c[1] + by'],
  ['pack-clock-no-wrap', 'pack', 'hh = ((Math.floor(tot / 60) % 24) + 24) % 24', 'hh = Math.floor(tot / 60)'],
  ['pack-clock-twelve', 'pack', '((hh + 11) % 12 + 1)', '(hh % 12)'],
  ['pack-sample-upper-edge', 'pack', 'ix >= nx || iy >= ny || iz >= nz', 'ix > nx || iy > ny || iz > nz'],
  ['pack-sample-lower-edge', 'pack', 'if (ix < 0 || iy < 0 || iz < 0 ||', 'if (ix < -1 || iy < 0 || iz < 0 ||'],
  ['pack-truncated-accepted', 'pack', 'if (u8.length < base + at(n)) throw', 'if (false) throw'],
  ['pack-magic-checked', 'pack', 'bytes[3] === 0x31', 'bytes[3] === 0x32'],
  ['pack2-offsets-ignored', 'pack', 'const off = h.offsets || null,', 'const off = null,'],
  ['pack2-view-offset', 'pack', 'u8.byteOffset + base + at(i) + c * per, per)', 'u8.byteOffset + base + i * 5 * per + c * per, per)'],
  ['pack2-no-nests-guard', 'pack', 'if (here && here.length) {', 'if (here) {'],
  ['pack2-frame-index-ignored', 'pack', 'h.nests && h.fn && i !== undefined ? h.fn[i] : null', 'h.nests && h.fn && i !== undefined ? h.fn[0] : null'],
  ['pack2-nest-block-start', 'pack', 'vol.nests = []; let at = 5 * per;', 'vol.nests = []; let at = 4 * per;'],
  ['pack2-second-nest-offset', 'pack', 'at += 5 * np;', 'at += 4 * np;'],
  ['pack2-nest-corner-swapped', 'pack', 'vol.nests.push({ x, y, vol: {', 'vol.nests.push({ x: y, y: x, vol: {'],
  ['pack2-nest-frame-u', 'pack', 'U[c] = nu[c] * NW + mo.u + fr.u;', 'U[c] = nu[c] * NW + mo.u;'],
  ['pack2-nest-frame-v', 'pack', 'V[c] = nv[c] * NW + mo.v + fr.v;', 'V[c] = nv[c] * NW + mo.v;'],
  ['pack2-nest-wind-step', 'pack', 'U[c] = nu[c] * NW + mo.u + fr.u;', 'U[c] = nu[c] * W + mo.u + fr.u;'],
  ['pack2-nest-w-step', 'pack', 'Wn[c] = nw[c] * NW;', 'Wn[c] = nw[c] * W;'],
  ['pack2-nest-fall-speed-step', 'pack', 'VZn[c] = nvz[c] * NV;', 'VZn[c] = nvz[c] * VZ;'],
  ['pack2-nest-floor', 'pack', 'floor: h.floor, dbz: nb,', 'floor: 0, dbz: nb,'],
  ['pack2-nest-dz', 'pack', 'dz: nh.dz, floor: h.floor, dbz: nb', 'dz: nh.dx, floor: h.floor, dbz: nb'],
  ['pack-frame-offset', 'pack', 'base + at(i) + c * per, per)', 'base + at(i) + c * per + 1, per)'],
  ['pack-cell-index', 'pack', 'const f = P.frame(i), k = (iz * ny + iy) * nx + ix;', 'const f = P.frame(i), k = (iz * ny + ix) * nx + iy;'],
  // the scanning step
  ['quant-half-units', 'worker', 'Math.round(v * 2)', 'Math.round(v)'],
  ['quant-nan-as-zero', 'worker', ': NONE;', ': 0;'],
  ['quant-no-clamp', 'worker', 'Math.max(-32767, Math.min(32767, Math.round(v * 2)))', 'Math.round(v * 2)'],
  ['scan-velocity-off', 'worker', "Object.assign({ velocity: true }, opts)", "Object.assign({ velocity: false }, opts)"],
  // the GPU picture's reference
  ['ref-azimuth-mirrored', 'gl', 'let az = Math.atan2(p.x, p.y) / DEG; if (az < 0) az += 360;', 'let az = Math.atan2(-p.x, p.y) / DEG; if (az < 0) az += 360;'],
  ['ref-first-gate-edge', 'gl', 'rIn = sweep.r0 - sweep.gate / 2', 'rIn = sweep.r0'],
  ['ref-ground-range', 'gl', 'Math.hypot(p.x, p.y) / cosE', 'Math.hypot(p.x, p.y)'],
  ['ref-gate-rounded', 'gl', 'const r = Math.hypot(p.x, p.y) / cosE, g = Math.floor((r - rIn) / sweep.gate);', 'const r = Math.hypot(p.x, p.y) / cosE, g = Math.round((r - rIn) / sweep.gate);'],
  ['ref-radial-rounded', 'gl', 'a = Math.min(sweep.nRad - 1, Math.floor(az * inv))', 'a = Math.min(sweep.nRad - 1, Math.round(az * inv))'],
  ['ref-unit-scale-ignored', 'gl', 'raw * 0.5 * (scale || 1)', 'raw * 0.5'],
  ['ref-row-order', 'gl', 'data[a * sweep.nGates + g]', 'data[g * sweep.nRad + a]'],
];

const only = process.argv.slice(2).find((a) => !a.startsWith('jobs=')), jobs = +((process.argv.find((a) => a.startsWith('jobs=')) || '').slice(5)) || Math.min(4, cpus().length);
const base = mkdtempSync(join(tmpdir(), 'sev-gmut-'));
const prepare = (name, file, text) => {
  const d = join(base, name);
  for (const x of ['src', 'tests', 'data/generated', 'data/severe/packs']) mkdirSync(join(d, x), { recursive: true });
  copyFileSync(join(root, 'tests/severe_geo.mjs'), join(d, 'tests/severe_geo.mjs'));
  for (const x of DATA) copyFileSync(join(root, x), join(d, x));
  for (const k of Object.keys(FILES)) writeFileSync(join(d, 'src/' + FILES[k]), k === file ? text : SRC[k]);
  return d;
};
const run = (name, file, text) => new Promise((resolve) => {
  const d = prepare(name, file, text), p = spawn('node', ['tests/severe_geo.mjs'], { cwd: d }); let out = '', err = '';
  const timer = setTimeout(() => p.kill('SIGKILL'), 300000);
  p.stdout.on('data', (b) => { out += b; }); p.stderr.on('data', (b) => { err += b; });
  p.on('close', (code) => { clearTimeout(timer); const f = out.split('\n').filter((l) => l.startsWith('FAIL')).map((l) => l.slice(5, 90)); rmSync(d, { recursive: true, force: true }); resolve(code === 0 ? { killed: false } : { killed: true, by: f[0] || err.split('\n').find((l) => l.trim()) || 'crash' }); });
});

const main = async () => {
  const b = await run('original', 'geo', SRC.geo);
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
