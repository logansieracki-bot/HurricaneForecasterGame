// Mutation testing of the radar's view (Severe): each mutant changes one expression of src/severe-radar.js or src/severe-palette.js, and tests/severe_radar.mjs runs against the changed
// copy. A mutant that the tests let through ("survived") is a place where they do not look.
//   node tools/severe_radar_mutants.mjs [name-filter] [jobs=4]
// Each copy goes to its own temporary directory with the test and the colour table beside it, so nothing in the repository is touched and the copies run side by side.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir, cpus } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = { radar: readFileSync(join(root, 'src/severe-radar.js'), 'utf8'), palette: readFileSync(join(root, 'src/severe-palette.js'), 'utf8') };
// [name, file, the text to find (once), its replacement]
const M = [
  // the beam: where it is and how wide
  ['earth-radius-not-4-3', 'radar', 'const RE = 6371000 * 4 / 3', 'const RE = 6371000'],
  ['beam-width', 'radar', 'BEAMW = 0.9', 'BEAMW = 1.4'],
  ['beam-height-fn-curve-term', 'radar', 'Math.sqrt(r * r + RE * RE + 2 * r * RE * Math.sin(e)) - RE + (antenna || 0)', 'Math.sqrt(r * r + RE * RE + r * RE * Math.sin(e)) - RE + (antenna || 0)'],
  ['scan-height-curve-term', 'radar', 'Math.sqrt(r * r + RE * RE + 2 * r * RE * sinE) - RE + antenna', 'Math.sqrt(r * r + RE * RE + r * RE * sinE) - RE + antenna'],
  ['ground-range-flat', 'radar', 'return RE * Math.asin(r * Math.cos(e) / (RE + h));', 'return r * Math.cos(e);'],
  ['beam-across-weight', 'radar', 'const wa = ia === 0 ? 1 : 0.6065', 'const wa = 1'],
  ['beam-truncated', 'radar', 'for (let t = -2; t <= 2.0001; t += 0.5)', 'for (let t = -1; t <= 1.0001; t += 0.5)'],
  ['beam-weights-sum', 'radar', 'wsum += w;', 'wsum += 1;'],
  ['sampler-ground-has-echo-below', 'radar', '|| z < 0 || fz > nz - 0.5) return floor;', '|| fz > nz - 0.5) return floor;'],
  ['power-average-in-dbz', 'radar', 'acc += w * Math.pow(10, 0.1 * d);', 'acc += w * Math.pow(10, 0.1 * d) * (d > 30 ? 2 : 1);'],
  // the volume
  ['sampler-half-cell', 'radar', 'const fx = x / dx - 0.5, fy = y / dy - 0.5, fz = z / dz - 0.5;', 'const fx = x / dx, fy = y / dy, fz = z / dz;'],
  ['sampler-no-echo-below-floor', 'radar', 'if (d > floor + 0.5)', 'if (d > floor - 100)'],
  // speckle, noise, threshold
  ['speckle-mean', 'radar', 'return s / n;', 'return s;'],
  ['no-speckle', 'radar', 'const sig = zs * gammaUnit(seed, a, g, nS)', 'const sig = zs'],
  ['noise-range-term', 'radar', '20 * Math.log10(km) + noise.atten * km', '20 * Math.log10(km)'],
  ['noise-range-exponent', 'radar', '20 * Math.log10(km)', '10 * Math.log10(km)'],
  ['noise-floor-level', 'radar', 'z1: -41.8', 'z1: -47.8'],
  ['threshold-offset', 'radar', 'snrThr = Math.pow(10, 0.1 * noise.thr) - 1', 'snrThr = Math.pow(10, 0.1 * noise.thr)'],
  ['noise-not-subtracted', 'radar', 'net = pw - zn', 'net = pw'],
  ['no-quantisation', 'radar', 'if (quant > 0) d = Math.round(d / quant) * quant;', ''],
  ['seed-ignored', 'radar', 'const seed = (o.seed === undefined ? 1 : o.seed) | 0', 'const seed = 1'],
  ['isolated-targets-off', 'radar', 'if (noise.sparse > 0 && hash(seed + 41, a, g, 9) < noise.sparse)', 'if (false)'],
  // clear air and clutter
  ['clear-air-no-top', 'radar', 'const inLayer = 1 / (1 + Math.exp((h - cla.top) / cla.soft));', 'const inLayer = 1;'],
  ['clear-air-rises-with-height', 'radar', 'cla.mean - cla.fall * Math.max(h - antenna, 0) / 1000 + patch', 'cla.mean + cla.fall * Math.max(h - antenna, 0) / 1000 + patch'],
  ['clear-air-no-large-patches', 'radar', '(vnoise(seed + 11, px / cla.scale[0], py / cla.scale[0]) - 0.5) * cla.std[0] / 0.21', '0'],
  ['clear-air-level', 'radar', 'const CLEAR = { mean: 2,', 'const CLEAR = { mean: -6,'],
  ['clutter-off', 'radar', 'if (cl.ground > 0 && km < 50) {', 'if (false) {'],
  ['clutter-everywhere', 'radar', 'if (cl.ground > 0 && km < 50) {', 'if (cl.ground > 0) {'],
  ['clutter-no-fall-off', 'radar', 'Math.exp(-km / CLUTTER.scale)', '1'],
  // the picture
  ['render-azimuth-mirrored', 'radar', 'let az = Math.atan2(x, y) / DEG;', 'let az = Math.atan2(-x, y) / DEG;'],
  ['render-first-gate-edge', 'radar', 'rIn = r0 - gate / 2', 'rIn = r0'],
  ['render-slant-range', 'radar', 'r = Math.sqrt(x * x + y * y) / cosE', 'r = Math.sqrt(x * x + y * y)'],
  ['render-radial-index', 'radar', 'const a = Math.min(nRad - 1, Math.floor(az * inv))', 'const a = Math.min(nRad - 1, Math.round(az * inv))'],
  ['render-background-blend', 'radar', 'c3 = 255; }', 'c3 = 128; }'],
  // the colour table
  ['pal-second-colour-ignored', 'palette', 'end = a.solid ? a.c1 : (a.c2 || b.c1)', 'end = a.solid ? a.c1 : b.c1'],
  ['pal-no-interpolation', 'palette', 'const t = (v - a.v) / span', 'const t = 0'],
  ['pal-run-too-short', 'palette', 'const t = (v - a.v) / span', 'const t = Math.min(1, 2 * (v - a.v) / span)'],
  ['pal-below-table-visible', 'palette', 'v < s[0].v) return [0, 0, 0, 0];', 'v < s[0].v - 100) return [0, 0, 0, 0];'],
  ['pal-above-table-transparent', 'palette', 'if (v >= s[n - 1].v) return s[n - 1].c1.slice();', 'if (v >= s[n - 1].v) return [0, 0, 0, 0];'],
  ['pal-comments-kept', 'palette', 'if (semi >= 0) line = line.slice(0, semi);', ''],
  ['pal-unsorted', 'palette', 'pal.stops.sort((a, b) => a.v - b.v);', ''],
  ['pal-opacity-ignored', 'palette', 'c1: four ? c1 : [...c1, 255]', 'c1: [...c1.slice(0, 3), 255]'],
  ['lut-one-short', 'palette', 'const n = Math.round((vmax - vmin) / step) + 1', 'const n = Math.round((vmax - vmin) / step)'],
  ['lut-index-floor', 'palette', 'Math.round((v - vmin) * inv)', 'Math.floor((v - vmin) * inv)'],
  ['lut-index-unclamped', 'palette', 'return i < 0 ? 0 : i >= n ? n - 1 : i;', 'return i;'],
];

const only = process.argv.slice(2).find((a) => !a.startsWith('jobs=')), jobs = +((process.argv.find((a) => a.startsWith('jobs=')) || '').slice(5)) || Math.min(4, cpus().length);
const base = mkdtempSync(join(tmpdir(), 'sev-rmut-'));
const prepare = (name, file, text) => {
  const d = join(base, name);
  for (const x of ['src', 'tests', 'data/severe']) mkdirSync(join(d, x), { recursive: true });
  copyFileSync(join(root, 'tests/severe_radar.mjs'), join(d, 'tests/severe_radar.mjs')); copyFileSync(join(root, 'data/severe/Apocs_BR_Expert.pal'), join(d, 'data/severe/Apocs_BR_Expert.pal'));
  writeFileSync(join(d, 'src/severe-radar.js'), file === 'radar' ? text : SRC.radar); writeFileSync(join(d, 'src/severe-palette.js'), file === 'palette' ? text : SRC.palette);
  return d;
};
const run = (name, file, text) => new Promise((resolve) => {
  const d = prepare(name, file, text), p = spawn('node', ['tests/severe_radar.mjs'], { cwd: d }); let out = '', err = '';
  const timer = setTimeout(() => p.kill('SIGKILL'), 300000);
  p.stdout.on('data', (b) => { out += b; }); p.stderr.on('data', (b) => { err += b; });
  p.on('close', (code) => { clearTimeout(timer); const f = out.split('\n').filter((l) => l.startsWith('FAIL')).map((l) => l.slice(5, 90)); resolve(code === 0 ? { killed: false } : { killed: true, by: f[0] || err.split('\n')[0] || 'crash' }); });
});

const main = async () => {
  const b = await run('original', 'radar', SRC.radar);
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
