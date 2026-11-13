// Mutation testing of the environment generator and its indices (src/severe-sounding.js): each mutant changes one expression, and tests/severe_sounding.mjs runs against the copy.
// A mutant that the tests let through ("survived") is a place where they do not look.
//   node tools/severe_sounding_mutants.mjs [name-filter] [jobs=4]
// Each copy goes to its own temporary directory with the test and the three research files it reads beside it, so nothing in the repository is touched and the copies run side by side.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir, cpus } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = { core: 'severe-core.js', snd: 'severe-sounding.js' };
const SRC = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, readFileSync(join(root, 'src/' + f), 'utf8')]));
const DATA = ['tools/severe_research/wk82.mjs', 'tools/severe_research/wk82_cape.mjs', 'tools/severe_research/wk82_sounding.txt'];
// [name, file, the text to find (once), its replacement]
// (Changes that make no difference worth a test, and so are not here: the midpoint of the moist ascent, the predictor Tm = T or the corrector's rate taken at the start of the layer, each of which changes a 10 m step's
//  cooling by a second-order amount.)
const M = [
  // the monotone cubic
  ['pchip-start-slope', 'snd', 'm[0] = d[0]; m[n - 1] = d[n - 2];', 'm[0] = 0; m[n - 1] = d[n - 2];'],
  ['pchip-end-slope', 'snd', 'm[0] = d[0]; m[n - 1] = d[n - 2];', 'm[0] = d[0]; m[n - 1] = 0;'],
  ['pchip-weights', 'snd', 'w2 = h[i] + 2 * h[i - 1]; m[i]', 'w2 = 2 * h[i] + h[i - 1]; m[i]'],
  ['pchip-harmonic', 'snd', '(w1 + w2) / (w1 / d[i - 1] + w2 / d[i])', '(w1 + w2) / (w1 / d[i] + w2 / d[i - 1])'],
  ['pchip-flat-at-extremum', 'snd', 'if (d[i - 1] * d[i] <= 0) m[i] = 0;', 'if (false) m[i] = 0;'],
  ['pchip-hermite-h00', 'snd', '(2 * t3 - 3 * t2 + 1) * ys[lo]', '(2 * t3 - 3 * t2) * ys[lo]'],
  ['pchip-hermite-h10', 'snd', '(t3 - 2 * t2 + t) * h[lo] * m[lo]', '(t3 - 2 * t2 + t) * m[lo]'],
  ['pchip-hermite-h01', 'snd', '(-2 * t3 + 3 * t2) * ys[lo + 1]', '(-2 * t3 + 3 * t2) * ys[lo]'],
  ['pchip-hermite-h11', 'snd', '(t3 - t2) * h[lo] * m[lo + 1]', '(t3 - t2) * h[lo] * m[lo]'],
  ['pchip-below-first', 'snd', 'if (x <= xs[0]) return ys[0];', 'if (x <= xs[0]) return 0;'],
  ['pchip-above-last', 'snd', 'if (x >= xs[n - 1]) return ys[n - 1];', 'if (x >= xs[n - 1]) return 0;'],
  // theta and the moisture
  ['stratosphere-exponent', 'snd', 'G / (CP * s.tTr) * (z - s.ztr)', 'G / CP * s.tTr * (z - s.ztr)'],
  ['theta-growth-exponent', 'snd', 'Math.pow(f, s.thExp)', 'Math.pow(f, 1)'],
  ['theta-growth-base', 'snd', 'f = (z - s.ml) / (s.ztr - s.ml)', 'f = z / s.ztr'],
  ['cap-not-smooth', 'snd', 's.cap * (x * x * (3 - 2 * x))', 's.cap * x'],
  ['cap-depth', 'snd', 'x = Math.min(1, (z - s.ml) / s.capDepth)', 'x = Math.min(1, (z - s.ml) / (2 * s.capDepth))'],
  ['cap-not-in-growth', 'snd', '(s.thetaTr - s.theta0 - s.cap) * Math.pow', '(s.thetaTr - s.theta0) * Math.pow'],
  ['mixed-layer-not-constant', 'snd', 'if (z <= s.ml) return s.theta0;', 'if (z <= 0) return s.theta0;'],
  ['moisture-ml-no-rhmax', 'snd', 'return Math.min(s.qv0 / 1000, s.rhMax * qs);', 'return s.qv0 / 1000;'],
  ['moisture-rh-shape', 'snd', '1 - s.rhDry * Math.pow(Math.min(zz, s.ztr) / s.ztr, s.rhExp)', '1 - s.rhDry * Math.pow(Math.min(zz, s.ztr) / s.ztr, 1)'],
  ['moisture-rh-dryness', 'snd', '1 - s.rhDry * Math.pow(', '1 - 0.5 * Math.pow('],
  ['moisture-above-rhmax', 'snd', 'Math.min(rh, s.rhMax) * qs', 'rh * qs'],
  ['moisture-surface-cap', 'snd', 'return Math.min(s.qv0 / 1000, Math.min(rh, s.rhMax) * qs);', 'return Math.min(rh, s.rhMax) * qs;'],
  ['saturation-pressure', 'snd', 'p = P0 * Math.pow(pi_, CP / RD), qs = qvsAt(T, p);', 'p = P0 * Math.pow(pi_, RD / CP), qs = qvsAt(T, p);'],
  // the hydrostatic pressure
  ['hydrostatic-sign', 'snd', 'pi[k - 1] - G * dz / (CP * 0.5 * (thvA + thvB)); q = qvAt(', 'pi[k - 1] + G * dz / (CP * 0.5 * (thvA + thvB)); q = qvAt('],
  ['profile-hydrostatic-sign', 'snd', 'pi[k - 1] - G * dz / (CP * 0.5 * (thvA + thvB)); q = sat(', 'pi[k - 1] + G * dz / (CP * 0.5 * (thvA + thvB)); q = sat('],
  ['hydrostatic-no-virtual', 'snd', 'const thvA = th[k - 1] * (1 + RV1 * qv[k - 1]);\n      let piK = pi[k - 1] - G * dz / (CP * thvA), q = qvAt(', 'const thvA = th[k - 1];\n      let piK = pi[k - 1] - G * dz / (CP * thvA), q = qvAt('],
  ['profile-hydrostatic-no-virtual', 'snd', 'const thvA = th[k - 1] * (1 + RV1 * qv[k - 1]);\n      let piK = pi[k - 1] - G * dz / (CP * thvA), q = sat(', 'const thvA = th[k - 1];\n      let piK = pi[k - 1] - G * dz / (CP * thvA), q = sat('],
  ['hydrostatic-upper-virtual', 'snd', 'const thvB = th[k] * (1 + RV1 * q); piK = pi[k - 1] - G * dz / (CP * 0.5 * (thvA + thvB)); q = qvAt(', 'const thvB = th[k]; piK = pi[k - 1] - G * dz / (CP * 0.5 * (thvA + thvB)); q = qvAt('],
  ['profile-hydrostatic-upper-virtual', 'snd', 'const thvB = th[k] * (1 + RV1 * q); piK = pi[k - 1] - G * dz / (CP * 0.5 * (thvA + thvB)); q = sat(', 'const thvB = th[k]; piK = pi[k - 1] - G * dz / (CP * 0.5 * (thvA + thvB)); q = sat('],
  ['hydrostatic-surface', 'snd', 'pi[0] = 1;', 'pi[0] = 0.99;'],
  ['table-interpolation', 'snd', 'const f = zz / dz, i = Math.floor(f); return a[i] + (a[i + 1] - a[i]) * (f - i);', 'const f = zz / dz, i = Math.floor(f); return a[i];'],
  ['profile-table-interpolation', 'snd', 'const f = (zz - z[0]) / dz, i = Math.floor(f); return a[i] + (a[i + 1] - a[i]) * (f - i);', 'const f = (zz - z[0]) / dz, i = Math.floor(f); return a[i];'],
  // the winds
  ['jet-component', 'snd', 'const uG = (zz) => uG0(zz) + jetOf(zz)[0], vG = (zz) => vG0(zz) + jetOf(zz)[1];', 'const uG = (zz) => uG0(zz) + jetOf(zz)[1], vG = (zz) => vG0(zz) + jetOf(zz)[1];'],
  ['jet-shape', 'snd', 'Math.pow(Math.cos(0.5 * Math.PI * x), 2)', 'Math.cos(0.5 * Math.PI * x)'],
  ['jet-width', 'snd', 'const x = (zz - j.z) / j.width;', 'const x = (zz - j.z) / (2 * j.width);'],
  ['frame-sign-u', 'snd', 'env.u = (zz) => uG(zz) - mo.u;', 'env.u = (zz) => uG(zz) + mo.u;'],
  ['frame-sign-v', 'snd', 'env.v = (zz) => vG(zz) - mo.v;', 'env.v = (zz) => vG(zz) + mo.v;'],
  ['motion-rounding', 'snd', 'let mo = s.motion;\n    if (!mo) { const b = bunkers(env); mo = { u: Math.round(b.right.u * 10) / 10', 'let mo = s.motion;\n    if (!mo) { const b = bunkers(env); mo = { u: Math.floor(b.right.u)'],
  ['profile-motion-rounding', 'snd', 'let mo = o.motion;\n    if (!mo) { const b = bunkers(env); mo = { u: Math.round(b.right.u * 10) / 10', 'let mo = o.motion;\n    if (!mo) { const b = bunkers(env); mo = { u: Math.floor(b.right.u)'],
  ['motion-default-right', 'snd', 'let mo = s.motion;\n    if (!mo) { const b = bunkers(env); mo = { u: Math.round(b.right.u * 10) / 10, v: Math.round(b.right.v * 10) / 10 };', 'let mo = s.motion;\n    if (!mo) { const b = bunkers(env); mo = { u: Math.round(b.left.u * 10) / 10, v: Math.round(b.left.v * 10) / 10 };'],
  ['profile-motion-default-right', 'snd', 'let mo = o.motion;\n    if (!mo) { const b = bunkers(env); mo = { u: Math.round(b.right.u * 10) / 10, v: Math.round(b.right.v * 10) / 10 };', 'let mo = o.motion;\n    if (!mo) { const b = bunkers(env); mo = { u: Math.round(b.left.u * 10) / 10, v: Math.round(b.left.v * 10) / 10 };'],
  // Bunkers, shear, helicity
  ['mean-wind-end-weights', 'snd', 'const w = i === 0 || i === n ? 0.5 : 1,', 'const w = 1,'],
  ['bunkers-deviation', 'snd', 'function bunkers(env, D = 7.5)', 'function bunkers(env, D = 5)'],
  ['bunkers-perpendicular-sign', 'snd', 'ux = sy / sp, uy = -sx / sp;', 'ux = -sy / sp, uy = sx / sp;'],
  ['bunkers-left-sign', 'snd', 'left: { u: m.u - D * ux, v: m.v - D * uy }', 'left: { u: m.u + D * ux, v: m.v + D * uy }'],
  ['bunkers-shear-layers', 'snd', 'lo = meanWind(env, 0, 500), hi = meanWind(env, 5500, 6000)', 'lo = meanWind(env, 0, 500), hi = meanWind(env, 5000, 6000)'],
  ['bunkers-mean-layer', 'snd', 'const m = meanWind(env, 0, 6000)', 'const m = meanWind(env, 0, 5000)'],
  ['helicity-sign', 'snd', 's += ((va + vb) / 2 - c.v) * (ub - ua) - ((ua + ub) / 2 - c.u) * (vb - va);', 's -= ((va + vb) / 2 - c.v) * (ub - ua) - ((ua + ub) / 2 - c.u) * (vb - va);'],
  ['helicity-motion-u', 'snd', '((va + vb) / 2 - c.v) * (ub - ua) - ((ua + ub) / 2 - c.u) * (vb - va)', '((va + vb) / 2 - c.v) * (ub - ua) - ((ua + ub) / 2) * (vb - va)'],
  ['helicity-motion-v', 'snd', '((va + vb) / 2 - c.v) * (ub - ua) - ((ua + ub) / 2 - c.u) * (vb - va)', '((va + vb) / 2) * (ub - ua) - ((ua + ub) / 2 - c.u) * (vb - va)'],
  ['helicity-one-term', 'snd', ' - ((ua + ub) / 2 - c.u) * (vb - va);', ';'],
  ['shear-component', 'snd', 'shear = (z1) => Math.hypot(env.uG(z1) - env.uG(0), env.vG(z1) - env.vG(0))', 'shear = (z1) => Math.abs(env.uG(z1) - env.uG(0))'],
  ['shear-layer-1km', 'snd', 's01 = shear(1000), s03 = shear(3000), s06 = shear(6000), h01 = srh(env, 0, 1000, c), h03 = srh(env, 0, 3000, c)', 's01 = shear(500), s03 = shear(3000), s06 = shear(6000), h01 = srh(env, 0, 1000, c), h03 = srh(env, 0, 3000, c)'],
  ['helicity-layer-3km', 'snd', 'h03 = srh(env, 0, 3000, c)', 'h03 = srh(env, 0, 2000, c)'],
  ['indices-storm-motion', 'snd', 'c = o.c || b.right', 'c = o.c || b.left'],
  // the parcel's path
  ['path-dry-adiabat', 'snd', 'T = th0 * t.pi[k];\n        const qs', 'T = th0 * t.pi[0];\n        const qs'],
  ['path-surface-parcel', 'snd', 'mlpath: ml.path, sbpath: sb.path,', 'mlpath: ml.path, sbpath: ml.path,'],
  ['path-ml-parcel', 'snd', 'mlpath: ml.path, sbpath: sb.path,', 'mlpath: sb.path, sbpath: sb.path,'],
  ['path-moist-step', 'snd', 'T -= moistLapse(Tm, qvsAt(Tm, pm)) * dzk; qp = qvsAt(T, pk);\n      }\n      tvP[k]', 'T -= 0.0065 * dzk; qp = qvsAt(T, pk);\n      }\n      tvP[k]'],
  // the buoyancy integral
  ['buoyancy-cin-sign', 'snd', 'k++) if (bl[k] < 0) cin += bl[k]', 'k++) if (bl[k] < 0) cin -= bl[k]'],
  ['buoyancy-cin-counts-positive', 'snd', 'k++) if (bl[k] < 0) cin += bl[k] * (z[k + 1] - z[k]);', 'k++) cin += bl[k] * (z[k + 1] - z[k]);'],
  ['buoyancy-cin-above-lfc', 'snd', 'for (let k = 0; k < (lfcK < 0 ? n : lfcK); k++)', 'for (let k = 0; k < n; k++)'],
  ['buoyancy-lfc-at-lcl', 'snd', 'lfc: Math.max(z[lfcK], lcl)', 'lfc: z[lfcK]'],
  ['buoyancy-lfc-above-lcl', 'snd', 'if (!(bl[k] > 0 && z[k + 1] > lcl)) continue;', 'if (!(bl[k] > 0)) continue;'],
  ['buoyancy-stretch-unchecked', 'snd', 'if (m === n || z[m] - Math.max(z[k], lcl) >= MIN_STRETCH) lfcK = k; else k = m - 1;', 'if (true) lfcK = k; else k = m - 1;'],
  ['buoyancy-stretch-short', 'snd', 'const MIN_STRETCH = 250;', 'const MIN_STRETCH = 30;'],
  ['buoyancy-stretch-long', 'snd', 'const MIN_STRETCH = 250;', 'const MIN_STRETCH = 400;'],
  ['buoyancy-stretch-from-the-ground', 'snd', 'z[m] - Math.max(z[k], lcl) >= MIN_STRETCH', 'z[m] - z[k] >= MIN_STRETCH'],
  ['buoyancy-el', 'snd', '{ cape += bl[k] * (z[k + 1] - z[k]); el = z[k + 1]; }', '{ cape += bl[k] * (z[k + 1] - z[k]); el = z[k]; }'],
  ['buoyancy-negative-aloft', 'snd', 'for (let k = lfcK; k < n; k++) if (bl[k] > 0) {', 'for (let k = lfcK; k < n; k++) {'],
  ['buoyancy-trapezoid', 'snd', 'bl[k] = 0.5 * (G * (tvParcel[k] - tvEnv[k]) / tvEnv[k] + G * (tvParcel[k + 1] - tvEnv[k + 1]) / tvEnv[k + 1]);', 'bl[k] = G * (tvParcel[k] - tvEnv[k]) / tvEnv[k];'],
  ['buoyancy-virtual-env', 'snd', '(tvParcel[k] - tvEnv[k]) / tvEnv[k] + G', '(tvParcel[k] - tvEnv[k]) / 300 + G'],
  // the parcel
  ['parcel-saturation-test', 'snd', 'if (e >= 0) {', 'if (e >= 0.0004) {'],
  ['lcl-found-at-the-level', 'snd', 'const f = -ePrev / (e - ePrev), piL =', 'const f = 1, piL ='],
  ['lcl-found-at-the-last-level', 'snd', 'const f = -ePrev / (e - ePrev), piL =', 'const f = 0, piL ='],
  ['lcl-excess-sign', 'snd', 'const f = -ePrev / (e - ePrev), piL =', 'const f = ePrev / (e - ePrev), piL ='],
  ['lcl-remaining-layer', 'snd', 'dzL = (1 - f) * (z[k] - z[k - 1]);', 'dzL = f * (z[k] - z[k - 1]);'],
  ['lcl-excess-not-kept', 'snd', 'ePrev = e;\n      } else {', '} else {'],
  ['lcl-at-the-ground', 'snd', 'if (k === 0) lcl = z[0];\n          else {', 'if (false) lcl = z[0];\n          else {'],
  ['lcl-dry-to-the-lcl', 'snd', 'TL = th0 * piL,', 'TL = th0 * t.pi[k],'],
  ['lcl-pressure-interpolation', 'snd', 'piL = t.pi[k - 1] + f * (t.pi[k] - t.pi[k - 1])', 'piL = t.pi[k - 1]'],
  ['profile-p0-units', 'snd', 'pi[0] = Math.pow((o.p0 || 1000) * 100 / P0, RD / CP)', 'pi[0] = Math.pow((o.p0 || 1000) * 1000 / P0, RD / CP)'],
  ['profile-p0-default', 'snd', '(o.p0 || 1000)', '(o.p0 || 900)'],
  ['profile-saturation-not-held', 'snd', 'const sat = (k, piK) => Math.min(qIn[k], qvsAt(th[k] * piK, P0 * Math.pow(piK, CP / RD)));', 'const sat = (k, piK) => qIn[k];'],
  ['profile-saturation-lower', 'snd', 'const sat = (k, piK) => Math.min(qIn[k], qvsAt(', 'const sat = (k, piK) => Math.max(qIn[k], qvsAt('],
  ['profile-surface-vapour-unheld', 'snd', 'qv[0] = sat(0, pi[0]);', 'qv[0] = qIn[0];'],
  ['profile-clamp-below', 'snd', 'if (zz <= z[0]) return a[0]; if (zz >= zTop) return a[n - 1];', 'if (zz >= zTop) return a[n - 1];'],
  ['profile-clamp-above', 'snd', 'if (zz <= z[0]) return a[0]; if (zz >= zTop) return a[n - 1];', 'if (zz <= z[0]) return a[0];'],
  ['profile-winds-relative', 'snd', 'env.u = (zz) => o.uG(zz) - mo.u; env.v = (zz) => o.vG(zz) - mo.v;', 'env.u = (zz) => o.uG(zz); env.v = (zz) => o.vG(zz) - mo.v;'],
  ['parcel-dry-adiabat', 'snd', 'T = th0 * t.pi[k];', 'T = th0;'],
  ['parcel-lapse-numerator', 'snd', 'const moistLapse = (T, qs) => G * (1 + LV * qs / (RD * T)) /', 'const moistLapse = (T, qs) => G /'],
  ['parcel-lapse-denominator', 'snd', '/ (CP + LV * LV * qs * EPS / (RD * T * T));\n\n  /* a parcel', '/ CP;\n\n  /* a parcel'],
  ['parcel-no-moisture-in-tv', 'snd', 'tvP[k] = T * (1 + RV1 * qp);', 'tvP[k] = T;'],
  ['environment-no-moisture-in-tv', 'snd', 'tvE[k] = Tenv * (1 + RV1 * t.qv[k]);', 'tvE[k] = Tenv;'],
  ['parcel-pressure', 'snd', 'const pk = P0 * Math.pow(t.pi[k], CP / RD), Tenv', 'const pk = P0 * Math.pow(t.pi[k], RD / CP), Tenv'],
  ['mixed-layer-depth', 'snd', 'for (let k = 0; t.z[k] <= o.ml; k++)', 'for (let k = 0; t.z[k] <= o.ml / 2; k++)'],
  ['mixed-layer-moisture', 'snd', 'th += t.theta[k]; qv += t.qv[k]; n++;', 'th += t.theta[k]; qv += t.qv[0]; n++;'],
  ['surface-parcel', 'snd', 'const sb = lift(env, t.theta[0], t.qv[0]);', 'const sb = lift(env, t.theta[1], t.qv[1]);'],
  // the tornado parameter
  ['stp-cape', 'snd', 'Math.max(0, mlcape / 1500)', 'Math.max(0, mlcape / 1000)'],
  ['stp-lcl', 'snd', '(2000 - mllcl) / 1000', '(2500 - mllcl) / 1000'],
  ['stp-helicity', 'snd', 'Math.max(0, srh01 / 150)', 'Math.max(0, srh01 / 100)'],
  ['stp-shear-floor', 'snd', 'shear06 < 12.5 ? 0 :', 'shear06 < 10 ? 0 :'],
  ['stp-shear-cap', 'snd', 'Math.min(1.5, shear06 / 20)', 'Math.min(2, shear06 / 20)'],
  ['stp-cin', 'snd', '(200 + mlcin) / 150', '(150 + mlcin) / 150'],
  ['stp-uses-ml', 'snd', 'stpOf(ml.cape, ml.lcl, h01, s06, ml.cin)', 'stpOf(sb.cape, sb.lcl, h01, s06, sb.cin)'],
  // the presets
  ['preset-wk82-frame', 'snd', 'jets: [], motion: { u: 8.0998, v: 4.9419 }', 'jets: [], motion: { u: 8.1, v: 4.9 }'],
];

const only = process.argv.slice(2).find((a) => !a.startsWith('jobs=')), jobs = +((process.argv.find((a) => a.startsWith('jobs=')) || '').slice(5)) || Math.min(4, cpus().length);
const base = mkdtempSync(join(tmpdir(), 'sev-smut-'));
const prepare = (name, file, text) => {
  const d = join(base, name);
  for (const x of ['src', 'tests', 'tools/severe_research']) mkdirSync(join(d, x), { recursive: true });
  copyFileSync(join(root, 'tests/severe_sounding.mjs'), join(d, 'tests/severe_sounding.mjs'));
  for (const x of DATA) copyFileSync(join(root, x), join(d, x));
  for (const k of Object.keys(FILES)) writeFileSync(join(d, 'src/' + FILES[k]), k === file ? text : SRC[k]);
  return d;
};
const run = (name, file, text) => new Promise((resolve) => {
  const d = prepare(name, file, text), p = spawn('node', ['tests/severe_sounding.mjs'], { cwd: d }); let out = '', err = '';
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
