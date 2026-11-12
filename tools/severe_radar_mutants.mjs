// Mutation testing of the radar's view (Severe: reflectivity, velocity and spectrum width): each mutant changes one expression of src/severe-radar.js or src/severe-palette.js, and tests/severe_radar.mjs runs against the changed
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
  // a finer volume nested in the box
  ['nest-dbz-ignored', 'radar', 'const sample = vol ? withNests(vol, volumeSampler, (v) => !!v.dbz) : null,', 'const sample = vol ? volumeSampler(vol) : null,'],
  ['nest-winds-ignored', 'radar', 'withNests(vol, windSampler, (v) => !!(v.u && v.v && v.w))', 'windSampler(vol)'],
  ['nest-offset-x-lost', 'radar', 'lx = x - n.x, ly = y - n.y;', 'lx = x, ly = y - n.y;'],
  ['nest-offset-y-lost', 'radar', 'lx = x - n.x, ly = y - n.y;', 'lx = x - n.x, ly = y;'],
  ['nest-never-holds', 'radar', 'if (lx >= 0 && ly >= 0 && lx <= n.w && ly <= n.h) return n.f(lx, ly, z, out);', 'if (lx >= 0 && ly >= 0 && lx <= n.w && ly <= 0) return n.f(lx, ly, z, out);'],
  ['nest-wide-everywhere', 'radar', 'if (lx >= 0 && ly >= 0 && lx <= n.w && ly <= n.h) return n.f(lx, ly, z, out);', 'if (lx >= -1e9 && ly >= -1e9 && lx <= 1e9 && ly <= 1e9) return n.f(lx, ly, z, out);'],
  ['nest-winds-from-box', 'radar', "filter((n) => n && n.vol && has(n.vol))", "filter((n) => n && n.vol)"],
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
  ['power-average-in-dbz', 'radar', 'const wz = w * Math.pow(10, 0.1 * d);', 'const wz = w * Math.pow(10, 0.1 * d) * (d > 30 ? 2 : 1);'],
  // the volume
  ['sampler-half-cell', 'radar', 'const fx = x / dx - 0.5, fy = y / dy - 0.5, fz = z / dz - 0.5;\n      if (fx < -0.5 || fy < -0.5 || fx > nx - 0.5 || fy > ny - 0.5 || z < 0 || fz > nz - 0.5) return floor;', 'const fx = x / dx, fy = y / dy, fz = z / dz;\n      if (fx < -0.5 || fy < -0.5 || fx > nx - 0.5 || fy > ny - 0.5 || z < 0 || fz > nz - 0.5) return floor;'],
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
  // the Doppler velocity and the spectrum width
  ["wind-sampler-half-cell", 'radar', "const fx = x / dx - 0.5, fy = y / dy - 0.5, fz = z / dz - 0.5;\n      if (fx < -0.5 || fy < -0.5 || fx > nx - 0.5 || fy > ny - 0.5 || z < 0 || fz > nz - 0.5) return false;", "const fx = x / dx, fy = y / dy, fz = z / dz;\n      if (fx < -0.5 || fy < -0.5 || fx > nx - 0.5 || fy > ny - 0.5 || z < 0 || fz > nz - 0.5) return false;"],
  ["wind-sampler-below-ground-has-wind", 'radar', "|| z < 0 || fz > nz - 0.5) return false;", "|| fz > nz - 0.5) return false;"],
  ["wind-sampler-east-edge-open", 'radar', "fx > nx - 0.5 || fy > ny - 0.5 || z < 0 || fz > nz - 0.5) return false;", "fx > nx + 5 || fy > ny - 0.5 || z < 0 || fz > nz - 0.5) return false;"],
  ["wind-sampler-outer-half-cell-extrapolates", 'radar', "k = Math.floor(fz), tx = fx - i, ty = fy - j, tz = fz - k;\n      if (i < 0) { i = 0; tx = 0; }", "k = Math.floor(fz), tx = fx - i, ty = fy - j, tz = fz - k;\n      if (i < 0) { i = 0; }"],
  ["wind-sampler-v-for-w", 'radar', "out[2] = tri(W, o, tx, ty, tz);", "out[2] = tri(V, o, tx, ty, tz);"],
  ["wind-sampler-no-fall-speed", 'radar', "out[3] = VZ ? tri(VZ, o, tx, ty, tz) : 0;", "out[3] = 0;"],
  ["wind-tri-x-weight", 'radar', "const x0 = a[o] + (a[o + 1] - a[o]) * tx,", "const x0 = a[o] + (a[o + 1] - a[o]) * ty,"],
  ["wind-tri-no-height", 'radar', "x2 = a[o + nxy] + (a[o + nxy + 1] - a[o + nxy]) * tx,", "x2 = a[o] + (a[o + 1] - a[o]) * tx,"],
  ["env-uniform-without-v", 'radar', "out[0] = e.u; out[1] = e.v || 0;", "out[0] = e.u; out[1] = 0;"],
  ["env-profile-not-interpolated", 'radar', "const t = (z - zs[lo]) / (zs[hi] - zs[lo]);", "const t = 0;"],
  ["env-base-state-not-used", 'radar', "envWind(o.env || (vol && vol.base))", "envWind(o.env)"],
  ["vel-u-v-swapped", 'radar', "vr = wv[0] * ue + wv[1] * ve + (wv[2] - wv[3]) * sinE;", "vr = wv[0] * ve + wv[1] * ue + (wv[2] - wv[3]) * sinE;"],
  ["vel-sign-flipped", 'radar', "vr = wv[0] * ue + wv[1] * ve + (wv[2] - wv[3]) * sinE;", "vr = -(wv[0] * ue + wv[1] * ve + (wv[2] - wv[3]) * sinE);"],
  ["vel-no-cos-elevation", 'radar', "ue = cosE * sa, ve = cosE * ca", "ue = sa, ve = ca"],
  ["vel-fall-speed-ignored", 'radar', "(wv[2] - wv[3]) * sinE", "wv[2] * sinE"],
  ["vel-fall-speed-upward", 'radar', "(wv[2] - wv[3]) * sinE", "(wv[2] + wv[3]) * sinE"],
  ["vel-vertical-wind-ignored", 'radar', "(wv[2] - wv[3]) * sinE", "(0 - wv[3]) * sinE"],
  ["vel-left-part-weight", 'radar', "vA0 += wz * vr;", "vA0 += 0.5 * wz * vr;"],
  ["vel-centre-part-weight", 'radar', "vA1 += wz * vr;", "vA1 += 0.5 * wz * vr;"],
  ["vel-right-part-weight", 'radar', "vA2 += wz * vr;", "vA2 += 0.5 * wz * vr;"],
  ["vel-second-moment-wrong", 'radar', "wA1 += wz * vr * vr;", "wA1 += wz * vr;"],
  ["vel-nan-wind-counts", 'radar', "if (vr - vr === 0) {", "if (true) {"],
  ["vel-storm-share-from-acc", 'radar', "zst = acc / wsum;", "zst = acc;"],
  ["vel-shear-in-beam-ignored", 'radar', "qst = (vv / VERT_VAR + vl / LAT_VAR) / ZW;", "qst = 0;"],
  ["vel-vertical-spread-uncorrected", 'radar', "vv / VERT_VAR", "vv"],
  ["vel-lateral-spread-uncorrected", 'radar', "vl / LAT_VAR", "vl"],
  ["vel-lateral-spread-left-lost", 'radar', "vl += zA0 * (m - vst) * (m - vst);", "vl += 0;"],
  ["vel-width-base-ignored", 'radar', "sw = Math.sqrt(between + w2)", "sw = Math.sqrt(between)"],
  ["vel-width-no-weak-signal-bias", 'radar', "sw * (1 + vel.swBias * lo)", "sw"],
  ["vel-width-no-scatter", 'radar', "vel.noise * vel.swNoise * Math.sqrt(1 + 4 * lo) * gauss(seed ^ 0x2545f491, a, g, 1)", "0"],
  ["vel-width-not-capped", 'radar', "Math.round(Math.min(20, swm) / vel.quant)", "Math.round(swm / vel.quant)"],
  ["vel-width-no-steps", 'radar', "swOut[at] = Math.max(0, vel.quant > 0 ?", "swOut[at] = Math.max(0, false ?"],
  ["vel-width-can-be-negative", 'radar', "swOut[at] = Math.max(0,", "swOut[at] = Math.max(-5,"],
  ["vel-unresolved-shear-ignored", 'radar', "const sbeam = vel.shear * SIGMA * r,", "const sbeam = 0,"],
  ["vel-unresolved-shear-not-the-beams-width", 'radar', "const sbeam = vel.shear * SIGMA * r,", "const sbeam = vel.shear * SIGMA * 40000,"],
  ["vel-clutter-width-term-lost", 'radar', "+ zgr * vb * vb) / zv;", ") / zv;"],
  ["vel-fold-off", 'radar', "if (!vel.dealias) {", "if (false) {"],
  ["vel-dealias-inverted", 'radar', "if (!vel.dealias) {", "if (vel.dealias) {"],
  ["vel-fold-by-rounding", 'radar', "v -= 2 * nyq * Math.floor(v / (2 * nyq));", "v -= 2 * nyq * Math.round(v / (2 * nyq));"],
  ["vel-fold-not-shifted-back", 'radar', "v -= 2 * nyq * Math.floor(v / (2 * nyq)); v -= nyq;", "v -= 2 * nyq * Math.floor(v / (2 * nyq));"],
  ["vel-nyquist-ignored", 'radar', "nyq = vel.nyquist,", "nyq = 28,"],
  ["vel-no-steps", 'radar', "if (vel.quant > 0) v = Math.round(v / vel.quant) * vel.quant;", ""],
  ["vel-steps-twice-as-coarse", 'radar', "v = Math.round(v / vel.quant) * vel.quant;", "v = Math.round(v / vel.quant / 2) * vel.quant * 2;"],
  ["vel-no-error", 'radar', "let v = vb + vel.noise * Math.sqrt(sd * sd + f2) * gauss(seed ^ 0x2545f491, a, g, 0);", "let v = vb;"],
  ["vel-error-scale-ignored", 'radar', "vel.noise * Math.sqrt(sd * sd + f2)", "Math.sqrt(sd * sd + f2)"],
  ["vel-no-white-fluctuation", 'radar', "Math.sqrt(sd * sd + f2)", "sd"],
  ["vel-pulses-ignored", 'radar', "(2 * vel.pulses * rho * rho)", "(2 * 40 * rho * rho)"],
  ["vel-estimator-loss-ignored", 'radar', "snrE = snr / Math.pow(10, 0.1 * vel.snrLoss)", "snrE = snr"],
  ["vel-pulse-pair-without-noise-term", 'radar', "Math.pow(1 + 1 / snrE, 2)", "1"],
  ["vel-pulse-pair-without-width", 'radar', "rho = Math.exp(-Math.PI * Math.PI * sw * sw / (2 * nyq * nyq))", "rho = 1"],
  ["vel-censoring-off", 'radar', "if (!(pw >= thrV * zn))", "if (false)"],
  ["vel-censoring-on-signal-only", 'radar', "pw >= thrV * zn", "sig >= thrV * zn"],
  ["vel-censoring-threshold-low", 'radar', "thrV = vel ? Math.pow(10, 0.1 * vel.thr) : 0", "thrV = vel ? Math.pow(10, 0.1 * vel.thr) - 1 : 0"],
  ["vel-no-data-is-zero", 'radar', "velOut = vel ? new Float32Array(nRad * nG).fill(NaN) : null", "velOut = vel ? new Float32Array(nRad * nG) : null"],
  ["vel-width-no-data-is-zero", 'radar', "swOut = vel ? new Float32Array(nRad * nG).fill(NaN) : null", "swOut = vel ? new Float32Array(nRad * nG) : null"],
  ["vel-clear-air-model-wind-unused", 'radar', "if (wsamp && wsamp(px, py, h, wv)) vcl = wv[0] * ue + wv[1] * ve; else {", "if (false) vcl = wv[0] * ue + wv[1] * ve; else {"],
  ["vel-clear-air-wind-zero", 'radar', "wenv(h, we); vcl = we[0] * ue + we[1] * ve;", "wenv(h, we); vcl = 0;"],
  ["vel-clear-air-u-v-swapped", 'radar', "vcl = we[0] * ue + we[1] * ve;", "vcl = we[0] * ve + we[1] * ue;"],
  ["vel-clutter-left-out-of-the-weights", 'radar', "const zv = zst + zcl + ztg + zgr;", "const zv = zst + zcl + ztg;"],
  ["vel-target-stands-still", 'radar', "vtg = 24 * (hash(seed + 47, a, g, 11) - 0.5);", "vtg = 0;"],
  ["vel-target-twice-as-fast", 'radar', "vtg = 24 * (hash(seed + 47, a, g, 11) - 0.5)", "vtg = 48 * (hash(seed + 47, a, g, 11) - 0.5)"],
  ["unit-mph-factor", "palette", "2.2369362920544", "2.0"],
  ["unit-knots-factor", "palette", "1.9438444924406", "2"],
  ["unit-kph-factor", "palette", "? 3.6 : 1;", "? 3 : 1;"],
  ["unit-unknown-is-not-one", "palette", "3.6 : 1;", "3.6 : 0;"],
  ["unit-case-sensitive", "palette", "String(units || '').trim().toLowerCase()", "String(units || '').trim()"],
  ["unit-knots-alias-lost", "palette", "u === 'kts' || u === 'kt' || u === 'kn'", "u === 'kts'"],
  ["render-scale-ignored", "radar", "v = dbz[a * nGates + g] * sc;", "v = dbz[a * nGates + g];"],
  ["render-scale-divides", "radar", "v = dbz[a * nGates + g] * sc;", "v = dbz[a * nGates + g] / sc;"],
  ["render-scale-default-zero", "radar", "sc = view.scale || 1;", "sc = view.scale || 0;"],
  ["render-field-ignored", 'radar', "dbz = sweep[view.field || 'dbz']", "dbz = sweep.dbz"],
  ["render-field-default-wrong", 'radar', "sweep[view.field || 'dbz']", "sweep[view.field || 'vel']"],
];

const only = process.argv.slice(2).find((a) => !a.startsWith('jobs=')), jobs = +((process.argv.find((a) => a.startsWith('jobs=')) || '').slice(5)) || Math.min(4, cpus().length);
const base = mkdtempSync(join(tmpdir(), 'sev-rmut-'));
const prepare = (name, file, text) => {
  const d = join(base, name);
  for (const x of ['src', 'tests', 'data/severe']) mkdirSync(join(d, x), { recursive: true });
  copyFileSync(join(root, 'tests/severe_radar.mjs'), join(d, 'tests/severe_radar.mjs'));
  for (const x of ['Apocs_BR_Expert.pal', 'User_BV_mph.pal']) copyFileSync(join(root, 'data/severe/' + x), join(d, 'data/severe/' + x));
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
