// Mutation testing of the Lab (src/severe-lab.js) and the pack assembler (src/severe-pack.js): each mutant changes one expression, and tests/severe_lab.mjs runs against the copy.
// A mutant that the test lets through ("survived") is a place where it does not look.
//   node tools/severe_lab_mutants.mjs [name-filter, or several with | between them] [jobs=4]     (DRY=1: only look for the text of each mutant, once, in its file)
// Each copy goes to its own temporary directory with the test and the modules it loads beside it, so nothing in the repository is touched and the copies run side by side.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir, cpus } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = { core: 'severe-core.js', snd: 'severe-sounding.js', refl: 'severe-refl.js', nest: 'severe-nest.js', ana: 'severe-analysis.js', days: 'severe-days.js', geo: 'severe-geo.js', pack: 'severe-pack.js', lab: 'severe-lab.js' };
const SRC = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, readFileSync(join(root, 'src/' + f), 'utf8')]));
// The echo's centre read after the frame hook instead of before it (a worker hands the block over to the page in the hook and it is gone): from the line with the centring through the hook's, moved behind it.
// Built from the source because the comment between them is long.
const AFTER_HOOK = (() => {
  const s = SRC.lab, hook = 'frames.push(rec); header.times.push(rec.t); header.track.push(rec.track); header.drift.push(rec.drift); if (det) header.fn.push(rec.fn); if (hooks.frame) hooks.frame(rec);', c0 = s.indexOf('const c = follow ? centring('), h0 = s.indexOf(hook), h1 = h0 + hook.length;
  return c0 < 0 || h0 < c0 ? ['(not found)', ''] : [s.slice(c0, h1), hook + '\n        const c = follow ? centring(block, nx, nx, nz, dz) : null;'];
})();
// The nest made before the frame's move instead of after it (the child would be moved at the frame at which it is made): the line of the move through the line of the nest, with the two in the other order.
const NEST_BEFORE_ROLL = (() => {
  const s = SRC.lab, roll = 'if (c && (c.sx || c.sy)) { rollNested(core, nest, ratio, c.sx, c.sy);', start = 'if (det && !nest && t >= det.from * 60 - 1e-9 && d.wmax >= det.minUpdraft) { startNest(); if (hooks.nest) hooks.nest({ child, nest }); }', i0 = s.indexOf(roll), i1 = s.indexOf(start);
  if (i0 < 0 || i1 < i0) return ['(not found)', ''];
  const moveLine = s.slice(i0, s.indexOf('\n', i0));
  return [s.slice(i0, i1 + start.length), start + '\n        ' + moveLine];
})();
// [name, file, the text to find (once), its replacement]
// Two changes that cannot be seen are left out: the cap of a frame's strongest echo at 120 dBZ (no storm here goes near it) and the zero for the fall speed of a cell with no echo (the reflectivity module gives zero there already).
const M = [
  // the environment
  ['lin-bottom', 'lab', 'if (zz <= z[0]) return a[0];', 'if (zz <= z[0]) return a[1];'],
  ['lin-top', 'lab', 'if (zz >= z[n - 1]) return a[n - 1];', 'if (zz >= z[n - 1]) return a[n - 2];'],
  ['lin-spacing', 'lab', 'const dz = z[1] - z[0], f = (zz - z[0]) / dz,', 'const dz = z[1] - z[0], f = (zz - z[0]) / (2 * dz),'],
  ['lin-interpolation', 'lab', 'return a[i] + (a[i + 1] - a[i]) * (f - i);', 'return a[i];'],
  ['env-motion', 'lab', 'p0: a.p0 || 1000, motion: a.motion });', 'p0: a.p0 || 1000, motion: undefined });'],
  ['env-p0-default', 'lab', 'p0: a.p0 || 1000,', 'p0: a.p0 || 900,'],
  ['env-p0-ignored', 'lab', 'p0: a.p0 || 1000,', 'p0: 1000,'],
  // the bubble
  ['bubble-profile', 'lab', 'Math.cos(0.5 * Math.PI * r) ** 2 : 0;', 'Math.cos(0.5 * Math.PI * r) : 0;'],
  ['bubble-x-width', 'lab', '((x - xc) / 10000) ** 2', '((x - xc) / 5000) ** 2'],
  ['bubble-y-width', 'lab', '((y - yc) / 10000) ** 2', '((y - yc) / 20000) ** 2'],
  ['bubble-depth', 'lab', '((z - 1500) / 1500) ** 2', '((z - 1500) / 3000) ** 2'],
  ['bubble-height', 'lab', '((z - 1500) / 1500) ** 2', '((z - 1000) / 1500) ** 2'],
  ['bubble-default', 'lab', '(delt === undefined ? 3 : delt)', '(delt === undefined ? 4 : delt)'],
  ['bubble-edge', 'lab', 'return r < 1 ?', 'return r <= 1 ?'],
  ['bubble-ignores-amplitude', 'lab', '(delt === undefined ? 3 : delt) * Math.cos', '3 * Math.cos'],
  // the recorder
  ['rec-wind-step', 'lab', 'Math.round(v / step)', 'Math.round(v / (2 * step))'],
  ['rec-wind-clamp', 'lab', 'Math.max(-127, Math.min(127, Math.round(v / step)))', 'Math.max(-100, Math.min(100, Math.round(v / step)))'],
  ['rec-fall-speed-step', 'lab', 'Math.round(4 * vzc[k])', 'Math.round(2 * vzc[k])'],
  ['rec-layout', 'lab', 'at = (k * ny + j) * nx + i;', 'at = (j * nz + k) * nx + i;'],
  ['rec-layout-x-y', 'lab', 'at = (k * ny + j) * nx + i;', 'at = (k * ny + i) * nx + j;'],
  ['rec-u-centre', 'lab', 'uu[at] = c8(0.5 * (S.u[o] + S.u[o + 1]));', 'uu[at] = c8(S.u[o]);'],
  ['rec-v-centre', 'lab', 'vv[at] = c8(0.5 * (S.v[o] + S.v[o + sy]));', 'vv[at] = c8(S.v[o]);'],
  ['rec-w-centre', 'lab', 'ww[at] = c8(0.5 * (S.w[o] + S.w[o + sz]));', 'ww[at] = c8(S.w[o]);'],
  ['rec-v-for-u', 'lab', 'uu[at] = c8(0.5 * (S.u[o] + S.u[o + 1])); vv[at] = c8(0.5 * (S.v[o] + S.v[o + sy]));', 'uu[at] = c8(0.5 * (S.v[o] + S.v[o + sy])); vv[at] = c8(0.5 * (S.u[o] + S.u[o + 1]));'],
  ['rec-array-order', 'lab', 'uu = new Int8Array(block.buffer, o0 + 2 * per, per), vv = new Int8Array(block.buffer, o0 + 3 * per, per)', 'uu = new Int8Array(block.buffer, o0 + 3 * per, per), vv = new Int8Array(block.buffer, o0 + 2 * per, per)'],
  ['rec-vz-offset', 'lab', 'vz = new Uint8Array(block.buffer, o0 + per, per)', 'vz = new Uint8Array(block.buffer, o0 + 2 * per, per)'],
  ['rec-strongest-echo', 'lab', 'if (col[k] > zmax) zmax = col[k];', 'if (col[k] < zmax) zmax = col[k];'],
  ['rec-echo-floor', 'lab', 'dbz[at] = Math.max(-30, Math.min(120, Math.round(col[k])));', 'dbz[at] = Math.max(-20, Math.min(120, Math.round(col[k])));'],
  // the run
  ['run-box-default', 'lab', 'dx = spec.dx || 2000, L = spec.box || 84000,', 'dx = spec.dx || 2000, L = spec.box || 80000,'],
  ['run-dx-default', 'lab', 'dx = spec.dx || 2000,', 'dx = spec.dx || 1000,'],
  ['run-levels-default', 'lab', 'nz = spec.nz || 40, dz = spec.dz || 500,', 'nz = spec.nz || 30, dz = spec.dz || 500,'],
  ['run-spacing-default', 'lab', 'dz = spec.dz || 500, dt = spec.dt || 10', 'dz = spec.dz || 400, dt = spec.dt || 10'],
  ['run-step-default', 'lab', 'dt = spec.dt || 10, minutes', 'dt = spec.dt || 5, minutes'],
  ['run-frame-interval', 'lab', 'nextFrame += (nest ? det.every : every) * 60;', 'nextFrame += (nest ? det.every : every) * 30;'],
  ['run-frame-default', 'lab', 'every = spec.frameEvery || 5;', 'every = spec.frameEvery || 10;'],
  ['run-steps', 'lab', 'nSteps = Math.round(minutes * 60 / dt), follow', 'nSteps = Math.round(minutes * 30 / dt), follow'],
  ['run-first-frame', 'lab', 'if (t >= nextFrame - 1e-9) {', 'if (t > nextFrame) {'],
  ['run-track-level', 'lab', 'k5 = Math.min(nz - 2, Math.floor(5250 / dz));', 'k5 = Math.min(nz - 2, Math.floor(3000 / dz));'],
  ['run-track-x', 'lab', 'wx = (i + 0.5) * dx;', 'wx = i * dx;'],
  ['run-track-y', 'lab', 'wy = (j + 0.5) * dx; } }', 'wy = j * dx; } }'],
  ['run-track-updraft', 'lab', 'const o = idx(i, j, k5), w = 0.5 * (S.w[o] + S.w[o + sz]); if (w > wm)', 'const o = idx(i, j, k5), w = -0.5 * (S.w[o] + S.w[o + sz]); if (w > wm)'],
  ['run-track-strength', 'lab', 'track: [Math.round(wx), Math.round(wy), +wm.toFixed(1)]', 'track: [Math.round(wx), Math.round(wy), +d.wmax.toFixed(1)]'],
  ['run-blow-up', 'lab', "if (!Number.isFinite(d.wmax) || d.wmax > 150 || (dc && (!Number.isFinite(dc.wmax) || dc.wmax > 150))) { stopped = true; reason = 'the model blew up at '", "if (false) { stopped = true; reason = 'the model blew up at '"],
  ['run-progress-every', 'lab', 'step % (nest ? 1 : 6) === 0', 'step % (nest ? 1 : 3) === 0'],
  ['detail-progress-every-step', 'lab', 'step % (nest ? 1 : 6) === 0', 'step % (nest ? 2 : 6) === 0'],
  ['detail-progress-no-faster', 'lab', 'step % (nest ? 1 : 6) === 0', 'step % 6 === 0'],
  ['run-yield', 'lab', 'if (hooks.yield && Date.now() - yielded > 80)', 'if (hooks.yield && Date.now() - yielded > 80000)'],
  ['run-cancel', 'lab', 'const c = hooks.cancelled && hooks.cancelled(); if (c)', 'const c = false; if (c)'],
  ['run-cancel-reason', 'lab', "reason = typeof c === 'string' ? c : 'cancelled'; break;", "reason = typeof c === 'string' ? c : 'stopped'; break;"],
  ['run-cancel-reason-given', 'lab', "reason = typeof c === 'string' ? c : 'cancelled'; break;", "reason = 'cancelled'; break;"],
  ['run-cancel-reason-any', 'lab', "reason = typeof c === 'string' ? c : 'cancelled'; break;", "reason = typeof c === 'string' ? 'cancelled' : c; break;"],
  ['run-header-base-u', 'lab', 'u: Array.from(b.ubc, (v) => +(v + motion.u).toFixed(3))', 'u: Array.from(b.ubc, (v) => +(v).toFixed(3))'],
  ['run-header-base-v', 'lab', 'v: Array.from(b.vbc, (v) => +(v + motion.v).toFixed(3))', 'v: Array.from(b.vbc, (v) => +(v - motion.v).toFixed(3))'],
  ['run-header-base-z', 'lab', 'z: Array.from(b.rhoc, (_, k) => (k + 0.5) * dz)', 'z: Array.from(b.rhoc, (_, k) => k * dz)'],
  ['run-header-motion', 'lab', 'motion: { u: motion.u, v: motion.v }, track:', 'motion: { u: motion.v, v: motion.u }, track:'],
  ['run-header-scale', 'lab', "scale: { wind: 0.5, vz: 0.25 },", "scale: { wind: 1, vz: 0.25 },"],
  ['run-header-floor', 'lab', 'floor: -30, times:', 'floor: -20, times:'],
  ['run-header-times', 'lab', 'header.times.push(rec.t);', 'header.times.push(rec.t * 60);'],
  ['run-bubble-centre', 'lab', 'xc = L / 2, yc = L / 2,', 'xc = L / 4, yc = L / 2,'],
  ['run-bubble-amplitude', 'lab', 'bubble((i + 0.5) * dx, (j + 0.5) * dx, (k + 0.5) * dz, xc, yc, spec.bubble)', 'bubble((i + 0.5) * dx, (j + 0.5) * dx, (k + 0.5) * dz, xc, yc, 3)'],
  ['run-storm-frame', 'lab', 'S.u[o] = b.ubc[k]; S.v[o] = b.vbc[k]; }', 'S.u[o] = 0; S.v[o] = 0; }'],
  ['run-rain-evaporation-default', 'lab', 'const evap = spec.evap === undefined ? 1 : spec.evap,', 'const evap = spec.evap === undefined ? 0.5 : spec.evap,'],
  ['run-rain-evaporation-ignored', 'lab', 'const evap = spec.evap === undefined ? 1 : spec.evap,', 'const evap = 1,'],
  ['run-bubble-recorded', 'lab', 'bubble: spec.bubble === undefined ? 3 : spec.bubble,', 'bubble: 3,'],
  ['run-evap-in-the-core', 'lab', 'n0r: 8e6, evap },', 'n0r: 8e6, evap: 1 },'],
  ['core-graupel-intercept', 'lab', 'iceParams: { n0g: 4e6,', 'iceParams: { n0g: 2e6,'],
  ['core-graupel-density', 'lab', 'rhog: 400,', 'rhog: 900,'],
  ['core-rain-intercept', 'lab', 'n0r: 8e6, evap }', 'n0r: 4e6, evap }'],
  ['core-moist', 'lab', 'moist: true, ice: true, iceParams', 'moist: true, ice: false, iceParams'],
  ['core-bc-x', 'lab', "Object.assign(physics(nx, dx), { bc: { x: 'periodic', y: 'periodic' } })", "Object.assign(physics(nx, dx), { bc: { x: 'wall', y: 'periodic' } })"],
  ['core-bc-y', 'lab', "Object.assign(physics(nx, dx), { bc: { x: 'periodic', y: 'periodic' } })", "Object.assign(physics(nx, dx), { bc: { x: 'periodic', y: 'wall' } })"],
  ['core-viscosity', 'lab', 'visc: { kh: 500 * d / 2000, kv: 500 * d / 2000 }', 'visc: { kh: 500, kv: 500 }'],
  ['core-viscosity-vertical', 'lab', 'kv: 500 * d / 2000 }', 'kv: 250 * d / 2000 }'],
  ['core-rayleigh', 'lab', 'top: { depth: 5000, rate: 0.003 }', 'top: { depth: 3000, rate: 0.003 }'],
  ['core-rayleigh-rate', 'lab', 'top: { depth: 5000, rate: 0.003 }', 'top: { depth: 5000, rate: 0.03 }'],
  ['core-sponge-back', 'lab', 'damp: { top: { depth: 5000, rate: 0.003 } } });', 'damp: { top: { depth: 5000, rate: 0.003 }, lateral: { width: Math.min(10000, L / 6), rate: 0.02 } } });'],
  ['core-winds', 'lab', 'wind: { u: env.u, v: env.v },', 'wind: { u: env.v, v: env.u },'],
  ['core-spacing-y', 'lab', 'dx: d, dy: d, dz, moist', 'dx: d, dy: d / 2, dz, moist'],
  // the box that follows its storm: the roll of the state, where the echo is, the drift, the pack's corner
  ['roll-east-west', 'lab', 'B[idx(mod(i - sx, nx), mod(j - sy, ny), k)]', 'B[idx(mod(i + sx, nx), mod(j - sy, ny), k)]'],
  ['roll-north-south', 'lab', 'B[idx(mod(i - sx, nx), mod(j - sy, ny), k)]', 'B[idx(mod(i - sx, nx), mod(j + sy, ny), k)]'],
  ['roll-x-by-y', 'lab', 'B[idx(mod(i - sx, nx), mod(j - sy, ny), k)]', 'B[idx(mod(i - sy, nx), mod(j - sx, ny), k)]'],
  ['roll-no-w', 'lab', 'for (const name of core.names) {\n      const A = core.S[name]', "for (const name of core.names.filter((n) => n !== 'w')) {\n      const A = core.S[name]"],
  ['roll-no-pressure', 'lab', 'for (const name of core.names) {\n      const A = core.S[name]', "for (const name of core.names.filter((n) => n !== 'pi')) {\n      const A = core.S[name]"],
  ['roll-no-rain', 'lab', 'for (const name of core.names) {\n      const A = core.S[name]', "for (const name of core.names.filter((n) => n !== 'qr')) {\n      const A = core.S[name]"],
  ['roll-top-level', 'lab', 'for (let k = 0; k <= kmax; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) A[idx(i, j, k)]', 'for (let k = 0; k < kmax; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) A[idx(i, j, k)]'],
  ['roll-bottom-level', 'lab', 'for (let k = 0; k <= kmax; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) A[idx(i, j, k)]', 'for (let k = 1; k <= kmax; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) A[idx(i, j, k)]'],
  ['roll-precip-east-west', 'lab', 'P[j * nx + i] = B[mod(j - sy, ny) * nx + mod(i - sx, nx)]', 'P[j * nx + i] = B[mod(j - sy, ny) * nx + mod(i + sx, nx)]'],
  ['roll-precip-north-south', 'lab', 'P[j * nx + i] = B[mod(j - sy, ny) * nx + mod(i - sx, nx)]', 'P[j * nx + i] = B[mod(j + sy, ny) * nx + mod(i - sx, nx)]'],
  ['roll-precip-rows', 'lab', 'P[j * nx + i] = B[mod(j - sy, ny) * nx + mod(i - sx, nx)]', 'P[j * nx + i] = B[mod(j - sy, ny) * ny + mod(i - sx, nx)]'],
  ['roll-precip-only-rain', 'lab', 'for (const P of [core.precip, core.precipS, core.precipG])', 'for (const P of [core.precip])'],
  ['roll-wrap-x', 'lab', 'B[idx(mod(i - sx, nx), mod(j - sy, ny), k)]', 'B[idx(mod(i - sx, ny), mod(j - sy, ny), k)]'],
  ['roll-wrap-y', 'lab', 'B[idx(mod(i - sx, nx), mod(j - sy, ny), k)]', 'B[idx(mod(i - sx, nx), mod(j - sy, nx), k)]'],
  ['centring-echo-threshold-down', 'lab', 'if (d < 30) continue;', 'if (d < 20) continue;'],
  ['centring-echo-threshold-up', 'lab', 'if (d < 30) continue;', 'if (d < 31) continue;'],
  ['centring-unweighted', 'lab', 'const w = Math.pow(10, d / 10),', 'const w = 1,'],
  ['centring-weight-amplitude', 'lab', 'const w = Math.pow(10, d / 10),', 'const w = Math.pow(10, d / 20),'],
  ['centring-min-cells-down', 'lab', 'if (n < 3 ||', 'if (n < 2 ||'],
  ['centring-min-cells-up', 'lab', 'if (n < 3 ||', 'if (n < 4 ||'],
  ['centring-lump-x-unchecked', 'lab', 'Math.hypot(cx, sx) / W < 0.3 ||', 'false ||'],
  ['centring-lump-y-unchecked', 'lab', '|| Math.hypot(cy, sy) / W < 0.3) return null;', ') return null;'],
  ['centring-lump-loose', 'lab', 'Math.hypot(cx, sx) / W < 0.3 || Math.hypot(cy, sy) / W < 0.3', 'Math.hypot(cx, sx) / W < 0.1 || Math.hypot(cy, sy) / W < 0.1'],
  ['centring-lump-strict', 'lab', 'Math.hypot(cx, sx) / W < 0.3 || Math.hypot(cy, sy) / W < 0.3', 'Math.hypot(cx, sx) / W < 0.9 || Math.hypot(cy, sy) / W < 0.9'],
  ['centring-lowest-level', 'lab', 'k0 = Math.max(0, Math.floor(500 / dz))', 'k0 = Math.max(0, Math.floor(0 / dz))'],
  ['centring-highest-level', 'lab', 'k1 = Math.min(nz - 1, Math.floor(3500 / dz))', 'k1 = Math.min(nz - 1, Math.floor(4500 / dz))'],
  ['centring-levels-in-metres', 'lab', 'k0 = Math.max(0, Math.floor(500 / dz))', 'k0 = Math.max(0, Math.floor(500 / 500))'],
  ['centring-levels-in-metres-top', 'lab', 'k1 = Math.min(nz - 1, Math.floor(3500 / dz))', 'k1 = Math.min(nz - 1, Math.floor(3500 / 500))'],
  ['centring-sign-east', 'lab', 'sx: wrap(nx / 2 - px, nx)', 'sx: wrap(px - nx / 2, nx)'],
  ['centring-sign-north', 'lab', 'sy: wrap(ny / 2 - py, ny)', 'sy: wrap(py - ny / 2, ny)'],
  ['centring-middle-x', 'lab', 'sx: wrap(nx / 2 - px, nx)', 'sx: wrap(nx / 2 + 1 - px, nx)'],
  ['centring-middle-y', 'lab', 'sy: wrap(ny / 2 - py, ny)', 'sy: wrap(ny / 2 + 1 - py, ny)'],
  ['centring-cell-middle-x', 'lab', 'a = 2 * Math.PI * (i + 0.5) / nx', 'a = 2 * Math.PI * i / nx'],
  ['centring-cell-middle-y', 'lab', 'b = 2 * Math.PI * (j + 0.5) / ny', 'b = 2 * Math.PI * j / ny'],
  ['centring-x-by-ny', 'lab', 'a = 2 * Math.PI * (i + 0.5) / nx', 'a = 2 * Math.PI * (i + 0.5) / ny'],
  ['centring-y-by-nx', 'lab', 'b = 2 * Math.PI * (j + 0.5) / ny', 'b = 2 * Math.PI * (j + 0.5) / nx'],
  ['centring-px-by-ny', 'lab', 'px = Math.atan2(sx, cx) / (2 * Math.PI) * nx', 'px = Math.atan2(sx, cx) / (2 * Math.PI) * ny'],
  ['centring-py-by-nx', 'lab', 'py = Math.atan2(sy, cy) / (2 * Math.PI) * ny', 'py = Math.atan2(sy, cy) / (2 * Math.PI) * nx'],
  ['centring-no-wrap', 'lab', 'return r > m / 2 ? r - m : r; };', 'return r; };'],
  ['centring-no-rounding', 'lab', 'const r = mod(Math.round(v), m);', 'const r = mod(Math.floor(v), m);'],
  ['centring-rows-by-columns', 'lab', 'sy: wrap(ny / 2 - py, ny)', 'sy: wrap(nx / 2 - py, nx)'],
  ['centring-block-rows', 'lab', 'dbz[(k * ny + j) * nx + i]; if (d < 30)', 'dbz[(k * nx + j) * ny + i]; if (d < 30)'],
  ['follow-after-hook', 'lab', AFTER_HOOK[0], AFTER_HOOK[1]],
  ['follow-default-off', 'lab', 'follow = spec.follow !== false,', 'follow = spec.follow === true,'],
  ['follow-ignored', 'lab', 'follow = spec.follow !== false,', 'follow = true,'],
  ['detail-nest-before-the-move', 'lab', NEST_BEFORE_ROLL[0], NEST_BEFORE_ROLL[1]],
  ['follow-late', 'lab', 'const c = follow ? centring(', 'const c = follow && frames.length >= 4 ? centring('],
  ['follow-never-rolls', 'lab', 'if (c && (c.sx || c.sy)) { rollNested(core, nest, ratio, c.sx, c.sy);', 'if (c && (c.sx || c.sy)) { '],
  ['drift-sign-east', 'lab', 'cum[0] -= c.sx * dx;', 'cum[0] += c.sx * dx;'],
  ['drift-sign-north', 'lab', 'cum[1] -= c.sy * dx;', 'cum[1] += c.sy * dx;'],
  ['drift-east-by-north', 'lab', 'cum[0] -= c.sx * dx;', 'cum[0] -= c.sy * dx;'],
  ['drift-north-by-east', 'lab', 'cum[1] -= c.sy * dx;', 'cum[1] -= c.sx * dx;'],
  ['drift-in-cells', 'lab', 'cum[0] -= c.sx * dx;', 'cum[0] -= c.sx;'],
  ['drift-frame-after-roll', 'lab', 'thvmin: +d.thvmin.toFixed(2), drift: [cum[0], cum[1]], nest: !!nest, fn:', 'thvmin: +d.thvmin.toFixed(2), drift: [0, 0], nest: !!nest, fn:'],
  ['drift-not-in-header', 'lab', ' header.drift.push(rec.drift);', ''],
  ['track-not-in-header', 'lab', ' header.track.push(rec.track);', ''],
  ['follow-not-in-header', 'lab', 'minutes, follow },', 'minutes, follow: true },'],
  ['corner-drift-ignored', 'pack', 'd = drift[k] || d; } return [', 'd = [0, 0]; } return ['],
  ['corner-drift-first-frame', 'pack', 'd = drift[k] || d; } return [', 'd = drift[0] || d; } return ['],
  ['corner-drift-last-frame', 'pack', 'd = drift[k] || d; } return [', 'd = drift[h.times.length - 1] || d; } return ['],
  ['corner-drift-no-default', 'pack', 'd = drift[k] || d; } return [', 'd = drift[k]; } return ['],
  ['corner-drift-north-by-east', 'pack', 'sc.origin[1] + mo.v * 60 * t + d[1]]', 'sc.origin[1] + mo.v * 60 * t + d[0]]'],
  ['corner-drift-east-by-north', 'pack', 'sc.origin[0] + mo.u * 60 * t + d[0],', 'sc.origin[0] + mo.u * 60 * t + d[1],'],
  ['corner-frame-strict', 'pack', 'if (h.times[q] <= t + 1e-6) k = q;', 'if (h.times[q] < t) k = q;'],
  ['corner-frame-ahead', 'pack', 'if (h.times[q] <= t + 1e-6) k = q;', 'if (h.times[q] <= t + 3) k = q;'],
  ['corner-frame-first', 'pack', 'if (h.times[q] <= t + 1e-6) k = q;', 'if (h.times[q] <= t + 1e-6) k = 0;'],
  ['corner-no-drift-field', 'pack', 'const drift = h.drift || null;', 'const drift = null;'],
  // where the storm was over the ground (the radar site is picked from it)
  ['path-method-empty', 'pack', 'P.path = () => stormPath(h);', 'P.path = () => ({ pts: [], mid: { x: 0, y: 0, n: 0 } });'],
  ['path-box-middle', 'pack', 'half = h.nx * h.dx / 2, tr = h.track', 'half = h.nx * h.dx, tr = h.track'],
  ['path-motion-east-by-north', 'pack', 'x: mo.u * 60 * t + d[0] + at[0] - half', 'x: mo.v * 60 * t + d[0] + at[0] - half'],
  ['path-motion-north-by-east', 'pack', 'y: mo.v * 60 * t + d[1] + at[1] - half', 'y: mo.u * 60 * t + d[1] + at[1] - half'],
  ['path-motion-in-seconds', 'pack', 'x: mo.u * 60 * t + d[0] + at[0] - half', 'x: mo.u * t + d[0] + at[0] - half'],
  ['path-drift-ignored', 'pack', 'd = dr ? dr[i] : [0, 0], at = q', 'd = [0, 0], at = q'],
  ['path-drift-east-by-north', 'pack', 'x: mo.u * 60 * t + d[0] + at[0] - half', 'x: mo.u * 60 * t + d[1] + at[0] - half'],
  ['path-drift-north-by-east', 'pack', 'y: mo.v * 60 * t + d[1] + at[1] - half', 'y: mo.v * 60 * t + d[0] + at[1] - half'],
  ['path-updraft-east-by-north', 'pack', 'x: mo.u * 60 * t + d[0] + at[0] - half', 'x: mo.u * 60 * t + d[0] + at[1] - half'],
  ['path-updraft-north-by-east', 'pack', 'y: mo.v * 60 * t + d[1] + at[1] - half', 'y: mo.v * 60 * t + d[1] + at[0] - half'],
  ['path-east-no-middle', 'pack', 'x: mo.u * 60 * t + d[0] + at[0] - half', 'x: mo.u * 60 * t + d[0] + at[0]'],
  ['path-north-no-middle', 'pack', 'y: mo.v * 60 * t + d[1] + at[1] - half', 'y: mo.v * 60 * t + d[1] + at[1]'],
  ['path-storm-threshold-down', 'pack', 'q && q[2] >= 5 ?', 'q && q[2] >= 4 ?'],
  ['path-storm-threshold-up', 'pack', 'q && q[2] >= 5 ?', 'q && q[2] >= 6 ?'],
  ['path-storm-threshold-strict', 'pack', 'q && q[2] >= 5 ?', 'q && q[2] > 5 ?'],
  ['path-no-storm-anywhere', 'pack', '[half, half, q ? q[2] : 0]', '[0, 0, q ? q[2] : 0]'],
  ['path-no-storm-always-track', 'pack', 'at = q && q[2] >= 5 ? q : [half, half, q ? q[2] : 0]', 'at = q || [half, half, 0]'],
  ['path-window-start-early', 'pack', 'p.t >= 20 && p.t <= 70', 'p.t >= 10 && p.t <= 70'],
  ['path-window-start-strict', 'pack', 'p.t >= 20 && p.t <= 70', 'p.t > 20 && p.t <= 70'],
  ['path-window-end-late', 'pack', 'p.t >= 20 && p.t <= 70', 'p.t >= 20 && p.t <= 80'],
  ['path-window-end-strict', 'pack', 'p.t >= 20 && p.t <= 70', 'p.t >= 20 && p.t < 70'],
  ['path-window-ignored', 'pack', 'p.t >= 20 && p.t <= 70 && p.w >= 15', 'p.w >= 15'],
  ['path-mature-window-down', 'pack', 'p.t <= 70 && p.w >= 15', 'p.t <= 70 && p.w >= 14'],
  ['path-mature-window-up', 'pack', 'p.t <= 70 && p.w >= 15', 'p.t <= 70 && p.w >= 16'],
  ['path-mature-any-down', 'pack', 'use = pts.filter((p) => p.w >= 15)', 'use = pts.filter((p) => p.w >= 14)'],
  ['path-mature-any-up', 'pack', 'use = pts.filter((p) => p.w >= 15)', 'use = pts.filter((p) => p.w >= 16)'],
  ['path-no-fallback-mature', 'pack', 'if (!use.length) use = pts.filter((p) => p.w >= 15); ', ''],
  ['path-no-fallback-all', 'pack', 'if (!use.length) use = pts;', ''],
  ['path-mid-east-by-north', 'pack', 'x: n ? use.reduce((a, p) => a + p.x, 0) / n : 0', 'x: n ? use.reduce((a, p) => a + p.y, 0) / n : 0'],
  ['path-mid-north-by-east', 'pack', 'y: n ? use.reduce((a, p) => a + p.y, 0) / n : 0', 'y: n ? use.reduce((a, p) => a + p.x, 0) / n : 0'],
  ['path-mid-sum', 'pack', 'x: n ? use.reduce((a, p) => a + p.x, 0) / n : 0', 'x: n ? use.reduce((a, p) => a + p.x, 0) : 0'],
  ['path-mid-count', 'pack', ', n } };', ', n: pts.length } };'],
  // the recorder's options
  ['rec-wind-default', 'lab', 'step = opt.wind || 0.5;', 'step = opt.wind || 0.25;'],
  ['rec-wind-option-ignored', 'lab', 'step = opt.wind || 0.5;', 'step = 0.5;'],
  ['rec-window-ignored', 'lab', 'nz = Math.min(nzc, opt.nz || nzc),', 'nz = nzc,'],
  ['rec-zmax-window-only', 'lab', 'for (let k = 0; k < nzc; k++) if (col[k] > zmax) zmax = col[k];', 'for (let k = 0; k < nz; k++) if (col[k] > zmax) zmax = col[k];'],
  ['rec-into-ignored', 'lab', 'const block = into || new Uint8Array(5 * per), o0', 'const block = new Uint8Array(5 * per), o0'],
  ['rec-at-ignored', 'lab', 'o0 = block.byteOffset + (into ? at || 0 : 0)', 'o0 = block.byteOffset'],
  ['rec-byteoffset-ignored', 'lab', 'o0 = block.byteOffset + (into ? at || 0 : 0)', 'o0 = (into ? at || 0 : 0)'],
  // the box moved with its nest
  ['rollnested-box-not-rolled', 'lab', 'function rollNested(core, nest, ratio, sx, sy) {\n    roll(core, sx, sy);', 'function rollNested(core, nest, ratio, sx, sy) {'],
  ['rollnested-child-not-rolled', 'lab', 'roll(nest.child, ratio * sx, ratio * sy); nest.edge(', 'nest.edge('],
  ['rollnested-child-x-not-scaled', 'lab', 'roll(nest.child, ratio * sx, ratio * sy)', 'roll(nest.child, sx, ratio * sy)'],
  ['rollnested-child-y-not-scaled', 'lab', 'roll(nest.child, ratio * sx, ratio * sy)', 'roll(nest.child, ratio * sx, sy)'],
  ['rollnested-child-x-sign', 'lab', 'roll(nest.child, ratio * sx, ratio * sy)', 'roll(nest.child, -ratio * sx, ratio * sy)'],
  ['rollnested-child-y-sign', 'lab', 'roll(nest.child, ratio * sx, ratio * sy)', 'roll(nest.child, ratio * sx, -ratio * sy)'],
  ['rollnested-child-axes-swapped', 'lab', 'roll(nest.child, ratio * sx, ratio * sy)', 'roll(nest.child, ratio * sy, ratio * sx)'],
  ['rollnested-edge-absent', 'lab', ' nest.edge(ratio * Math.max(Math.abs(sx), Math.abs(sy))); }', ' }'],
  ['rollnested-edge-no-ratio', 'lab', 'nest.edge(ratio * Math.max(Math.abs(sx), Math.abs(sy)))', 'nest.edge(Math.max(Math.abs(sx), Math.abs(sy)))'],
  ['rollnested-edge-x-only', 'lab', 'nest.edge(ratio * Math.max(Math.abs(sx), Math.abs(sy)))', 'nest.edge(ratio * Math.abs(sx))'],
  ['rollnested-edge-y-only', 'lab', 'nest.edge(ratio * Math.max(Math.abs(sx), Math.abs(sy)))', 'nest.edge(ratio * Math.abs(sy))'],
  ['rollnested-edge-sum', 'lab', 'nest.edge(ratio * Math.max(Math.abs(sx), Math.abs(sy)))', 'nest.edge(ratio * (Math.abs(sx) + Math.abs(sy)))'],
  ['rollnested-edge-one-more', 'lab', 'nest.edge(ratio * Math.max(Math.abs(sx), Math.abs(sy)))', 'nest.edge(ratio * Math.max(Math.abs(sx), Math.abs(sy)) + 1)'],
  ['rollnested-edge-one-less', 'lab', 'nest.edge(ratio * Math.max(Math.abs(sx), Math.abs(sy)))', 'nest.edge(ratio * Math.max(Math.abs(sx), Math.abs(sy)) - 1)'],
  ['rollnested-edge-signed', 'lab', 'nest.edge(ratio * Math.max(Math.abs(sx), Math.abs(sy)))', 'nest.edge(ratio * Math.max(sx, sy))'],
  ['rollnested-zero-shift', 'lab', 'if (nest && (sx || sy)) {', 'if (nest) {'],
  // the run with a nest
  ['detail-no-nest-module-unchecked', 'lab', "if (!NEST) throw new Error(", "if (false) throw new Error("],
  ['detail-follow-unchecked', 'lab', 'if (!follow) throw new Error(', 'if (false) throw new Error('],
  ['detail-ratio-one-allowed', 'lab', 'if (ratio < 2 || Math.abs(', 'if (ratio < 1 || Math.abs('],
  ['detail-ratio-fraction-unchecked', 'lab', 'ratio < 2 || Math.abs(ratio * det.dx - dx) > 1e-6', 'ratio < 2'],
  ['detail-box-minimum', 'lab', 'Math.max(4, Math.min(nx - 4, Math.round(det.box / dx)))', 'Math.max(2, Math.min(nx - 4, Math.round(det.box / dx)))'],
  ['detail-box-maximum', 'lab', 'Math.max(4, Math.min(nx - 4, Math.round(det.box / dx)))', 'Math.max(4, Math.min(nx - 2, Math.round(det.box / dx)))'],
  ['detail-box-floor', 'lab', 'Math.round(det.box / dx)', 'Math.floor(det.box / dx)'],
  ['detail-box-ceil', 'lab', 'Math.round(det.box / dx)', 'Math.ceil(det.box / dx)'],
  ['detail-corner-floor', 'lab', 'cx0 = cy0 = Math.round((nx - pc) / 2) * dx', 'cx0 = cy0 = Math.floor((nx - pc) / 2) * dx'],
  ['detail-corner-in-cells', 'lab', 'cx0 = cy0 = Math.round((nx - pc) / 2) * dx', 'cx0 = cy0 = Math.round((nx - pc) / 2)'],
  ['detail-depth-floor', 'lab', 'Math.ceil(det.ztop / dz - 1e-9)', 'Math.floor(det.ztop / dz - 1e-9)'],
  ['detail-depth-round', 'lab', 'Math.ceil(det.ztop / dz - 1e-9)', 'Math.round(det.ztop / dz - 1e-9)'],
  ['detail-depth-at-least-one', 'lab', 'Math.max(1, Math.ceil(det.ztop / dz - 1e-9))', 'Math.max(0, Math.ceil(det.ztop / dz - 1e-9))'],
  ['detail-depth-at-most-all', 'lab', 'nzr = Math.min(nz, Math.max(1,', 'nzr = Math.min(nz + 5, Math.max(1,'],
  ['detail-child-sides', 'lab', "physics(cn, det.dx), { bc: { x: 'driven', y: 'driven' }, relax", "physics(cn, det.dx), { bc: { x: 'driven', y: 'periodic' }, relax"],
  ['detail-child-relax', 'lab', 'relax: { width: 6 } }));', 'relax: { width: 4 } }));'],
  ['detail-child-cell', 'lab', 'physics(cn, det.dx)', 'physics(cn, dx)'],
  ['detail-child-viscosity-of-the-box', 'lab', 'physics = (n, d) => ({ nx: n, ny: n, nz, dx: d, dy: d, dz, moist: true, ice: true, iceParams: { n0g: 4e6, rhog: 400, n0r: 8e6, evap }, theta: env.theta, qv: env.qv, wind: { u: env.u, v: env.v },\n      visc: { kh: 500 * d / 2000, kv: 500 * d / 2000 }', 'physics = (n, d) => ({ nx: n, ny: n, nz, dx: d, dy: d, dz, moist: true, ice: true, iceParams: { n0g: 4e6, rhog: 400, n0r: 8e6, evap }, theta: env.theta, qv: env.qv, wind: { u: env.u, v: env.v },\n      visc: { kh: 500 * (n === nx ? d : dx) / 2000, kv: 500 * (n === nx ? d : dx) / 2000 }'],
  ['detail-nest-ratio', 'lab', 'NEST.create({ parent: core, child, ratio, x0: cx0, y0: cy0 })', 'NEST.create({ parent: core, child, ratio: ratio + 1, x0: cx0, y0: cy0 })'],
  ['detail-nest-x', 'lab', 'x0: cx0, y0: cy0 }); nest.init();', 'x0: cx0 + 1000, y0: cy0 }); nest.init();'],
  ['detail-nest-y', 'lab', 'x0: cx0, y0: cy0 }); nest.init();', 'x0: cx0, y0: cy0 + 1000 }); nest.init();'],
  ['detail-nest-not-initialised', 'lab', 'y0: cy0 }); nest.init(); crec', 'y0: cy0 }); crec'],
  ['detail-record-wind', 'lab', 'recorder(child, { wind: 1, nz: nzr })', 'recorder(child, { wind: 0.5, nz: nzr })'],
  ['detail-record-depth', 'lab', 'recorder(child, { wind: 1, nz: nzr })', 'recorder(child, { wind: 1 })'],
  ['detail-record-at-start', 'lab', 'if (nest) crec(block, per5);', 'if (nest) crec(block, 0);'],
  ['detail-record-skipped', 'lab', 'if (nest) crec(block, per5);', ''],
  ['detail-block-depth', 'lab', 'new Uint8Array(per5 + 5 * cn * cn * nzr)', 'new Uint8Array(per5 + 5 * cn * cn * nz)'],
  ['detail-frame-flag', 'lab', 'nest: !!nest, fn:', 'nest: false, fn:'],
  ['detail-child-diag-skipped', 'lab', 'dc = nest ? child.diag() : null', 'dc = null'],
  ['detail-child-blow-up-nan', 'lab', '(dc && (!Number.isFinite(dc.wmax) || dc.wmax > 150))', '(dc && dc.wmax > 150)'],
  ['detail-child-blow-up-ignored', 'lab', ' || (dc && (!Number.isFinite(dc.wmax) || dc.wmax > 150))', ''],
  ['detail-roll-box-only', 'lab', 'rollNested(core, nest, ratio, c.sx, c.sy);', 'rollNested(core, null, ratio, c.sx, c.sy);'],
  ['detail-start-at-boundary', 'lab', 't >= det.from * 60 - 1e-9 && d.wmax', 't > det.from * 60 + 1e-9 && d.wmax'],
  ['detail-start-in-seconds', 'lab', 't >= det.from * 60 - 1e-9 && d.wmax', 't >= det.from - 1e-9 && d.wmax'],
  ['detail-start-again', 'lab', 'if (det && !nest && t >= det.from * 60 - 1e-9 && d.wmax >= det.minUpdraft) { startNest();', 'if (det && t >= det.from * 60 - 1e-9 && d.wmax >= det.minUpdraft) { startNest();'],
  ['detail-hook-not-called', 'lab', 'startNest(); if (hooks.nest) hooks.nest({ child, nest }); }', 'startNest(); }'],
  ['detail-stepped-by-box', 'lab', 'if (nest) nest.step(dt); else core.step(dt);', 'core.step(dt);'],
  ['detail-stepped-twice', 'lab', 'if (nest) nest.step(dt); else core.step(dt);', 'if (nest) { nest.step(dt); core.step(dt); } else core.step(dt);'],
  ['detail-frame-interval-ignored', 'lab', 'nextFrame += (nest ? det.every : every) * 60;', 'nextFrame += every * 60;'],
  ['detail-frame-interval-of-the-box', 'lab', 'nextFrame += (nest ? det.every : every) * 60;', 'nextFrame += (nest ? every : every) * 60;'],
  ['detail-header-version', 'lab', 'v: det ? 2 : 1,', 'v: 1,'],
  ['detail-header-nested-by-option', 'lab', 'if (!frames.some((f) => f.nest)) { delete header.nests;', 'if (!det) { delete header.nests;'],
  ['detail-header-nests-absent', 'lab', 'if (det) { header.nests = [{', 'if (false) { header.nests = [{'],
  ['detail-header-nests-kept', 'lab', 'if (!frames.some((f) => f.nest)) { delete header.nests; delete header.fn; header.v = 1; }', 'if (false) { delete header.nests; delete header.fn; header.v = 1; }'],
  ['detail-header-fn-kept', 'lab', 'if (!frames.some((f) => f.nest)) { delete header.nests; delete header.fn; header.v = 1; }', 'if (!frames.some((f) => f.nest)) { delete header.nests; header.v = 1; }'],
  ['detail-header-version-kept', 'lab', 'if (!frames.some((f) => f.nest)) { delete header.nests; delete header.fn; header.v = 1; }', 'if (!frames.some((f) => f.nest)) { delete header.nests; delete header.fn; }'],
  ['detail-header-nest-wind', 'lab', 'scale: { wind: 1, vz: 0.25 }, frame: { u: 0, v: 0 } }];', 'scale: { wind: 0.5, vz: 0.25 }, frame: { u: 0, v: 0 } }];'],
  ['detail-header-nest-frame', 'lab', 'scale: { wind: 1, vz: 0.25 }, frame: { u: 0, v: 0 } }];', 'scale: { wind: 1, vz: 0.25 }, frame: { u: 1, v: 0 } }];'],
  ['detail-header-nest-depth', 'lab', 'header.nests = [{ nx: cn, ny: cn, nz: nzr,', 'header.nests = [{ nx: cn, ny: cn, nz,'],
  ['detail-header-nest-size', 'lab', 'header.nests = [{ nx: cn, ny: cn,', 'header.nests = [{ nx: cn + 1, ny: cn,'],
  ['detail-header-nest-cell', 'lab', 'nz: nzr, dx: det.dx, dz, scale', 'nz: nzr, dx, dz, scale'],
  ['detail-header-fn-always', 'lab', 'nest: !!nest, fn: nest ? [[0, cx0, cy0]] : [] };', 'nest: !!nest, fn: [[0, cx0, cy0]] };'],
  ['detail-header-fn-corner', 'lab', 'fn: nest ? [[0, cx0, cy0]] : [] };', 'fn: nest ? [[0, cx0 + 1000, cy0]] : [] };'],
  ['detail-header-fn-nest-number', 'lab', 'fn: nest ? [[0, cx0, cy0]] : [] };', 'fn: nest ? [[1, cx0, cy0]] : [] };'],
  ['detail-header-fn-not-grown', 'lab', ' if (det) header.fn.push(rec.fn);', ''],
  ['start-hook-not-called', 'lab', 'if (hooks.start) hooks.start(header);', ''],
  ['start-hook-after-start', 'lab', 'if (hooks.start) hooks.start(header);\n    let nextFrame = 0,', 'let nextFrame = 0,'],
  ['detail-header-setting-box', 'lab', 'detail: { dx: det.dx, box: cn * det.dx,', 'detail: { dx: det.dx, box: det.box,'],
  ['detail-header-setting-depth', 'lab', 'ztop: nzr * dz, every: det.every', 'ztop: det.ztop, every: det.every'],
  ['detail-header-setting-every', 'lab', 'ztop: nzr * dz, every: det.every', 'ztop: nzr * dz, every'],
  ['detail-header-setting-from', 'lab', 'from: det.from, ztop', 'from: 0, ztop'],
  ['detail-header-setting-cell', 'lab', 'detail: { dx: det.dx,', 'detail: { dx,'],
  ['detail-default-every', 'lab', '{ dx: 500, box: 40000, from: 20, ztop: 8000, every: 1, minUpdraft: 10 }', '{ dx: 500, box: 40000, from: 20, ztop: 8000, every: 5 }'],
  ['detail-default-depth', 'lab', '{ dx: 500, box: 40000, from: 20, ztop: 8000, every: 1, minUpdraft: 10 }', '{ dx: 500, box: 40000, from: 20, ztop: 6000, every: 1, minUpdraft: 10 }'],
  ['detail-default-from', 'lab', '{ dx: 500, box: 40000, from: 20, ztop: 8000, every: 1, minUpdraft: 10 }', '{ dx: 500, box: 40000, from: 30, ztop: 8000, every: 1, minUpdraft: 10 }'],
  ['detail-default-updraft', 'lab', '{ dx: 500, box: 40000, from: 20, ztop: 8000, every: 1, minUpdraft: 10 }', '{ dx: 500, box: 40000, from: 20, ztop: 8000, every: 2, minUpdraft: 0 }'],
  ['detail-updraft-ignored', 'lab', ' && d.wmax >= det.minUpdraft) { startNest();', ') { startNest();'],
  ['detail-updraft-strict', 'lab', 'd.wmax >= det.minUpdraft', 'd.wmax > det.minUpdraft'],
  ['detail-updraft-of-the-nest', 'lab', 'd.wmax >= det.minUpdraft', '(dc ? dc.wmax : d.wmax) >= det.minUpdraft'],
  ['detail-header-setting-updraft', 'lab', 'every: det.every, minUpdraft: det.minUpdraft }', 'every: det.every, minUpdraft: 0 }'],
  ['detail-default-cell', 'lab', '{ dx: 500, box: 40000, from: 20, ztop: 8000, every: 1, minUpdraft: 10 }', '{ dx: 1000, box: 40000, from: 20, ztop: 8000, every: 1, minUpdraft: 10 }'],
  ['detail-default-box', 'lab', '{ dx: 500, box: 40000, from: 20, ztop: 8000, every: 1, minUpdraft: 10 }', '{ dx: 500, box: 30000, from: 20, ztop: 8000, every: 1, minUpdraft: 10 }'],
  // the assembler with nests
  ['assemble-nest-length-x', 'pack', 'n += 5 * nests[k].nx * nests[k].ny * nests[k].nz;', 'n += 5 * nests[k].nx * nests[k].nx * nests[k].nz;'],
  ['assemble-nest-length-y', 'pack', 'n += 5 * nests[k].nx * nests[k].ny * nests[k].nz;', 'n += 5 * nests[k].ny * nests[k].ny * nests[k].nz;'],
  ['assemble-nest-length-z', 'pack', 'n += 5 * nests[k].nx * nests[k].ny * nests[k].nz;', 'n += 5 * nests[k].nx * nests[k].ny;'],
  ['assemble-nest-of-frame', 'pack', 'for (const [k] of h.fn[i] || []) n +=', 'for (const [k] of h.fn[0] || []) n +='],
  ['assemble-nest-without-fn', 'pack', 'if (nests && h.fn) for', 'if (nests) for'],
  ['assemble-offsets-always', 'pack', 'offsets.push(at); if (nests) h.offsets = offsets;', 'offsets.push(at); h.offsets = offsets;'],
  ['assemble-offsets-never', 'pack', 'offsets.push(at); if (nests) h.offsets = offsets;', 'offsets.push(at);'],
  ['assemble-offsets-last', 'pack', 'offsets.push(at); if (nests)', 'if (nests)'],
  ['assemble-offset-of-frame', 'pack', 'blocks.forEach((b, i) => { if (b.length !== want(i)) throw new Error(\'storm pack: frame \' + i + \' has \' + b.length + \' bytes, not \' + want(i)); offsets.push(at); at += b.length; });', 'blocks.forEach((b, i) => { if (b.length !== want(i)) throw new Error(\'storm pack: frame \' + i + \' has \' + b.length + \' bytes, not \' + want(i)); offsets.push(at); at += 5 * per; });'],
  // the pack that grows with its frames
  ['live-size-unchecked', 'pack', 'if (block.length !== want) throw', 'if (false) throw'],
  ['live-nest-size-ignored', 'pack', 'if (nests) for (const [k] of rec.fn || []) want +=', 'if (false) for (const [k] of rec.fn || []) want +='],
  ['live-nest-length-x', 'pack', 'want += 5 * nests[k].nx * nests[k].ny * nests[k].nz;', 'want += 5 * nests[k].nx * nests[k].nx * nests[k].nz;'],
  ['live-nest-length-y', 'pack', 'want += 5 * nests[k].nx * nests[k].ny * nests[k].nz;', 'want += 5 * nests[k].ny * nests[k].ny * nests[k].nz;'],
  ['live-times-unchecked', 'pack', 'if (i && !(rec.t > h.times[i - 1])) throw', 'if (false) throw'],
  ['live-times-not-strict', 'pack', 'if (i && !(rec.t > h.times[i - 1])) throw', 'if (i && !(rec.t >= h.times[i - 1])) throw'],
  ['live-times-first-too', 'pack', 'if (i && !(rec.t > h.times[i - 1])) throw', 'if (!(rec.t > (h.times[i - 1] || 0))) throw'],
  ['live-times-not-grown', 'pack', 'blocks.push(block); h.times.push(rec.t);', 'blocks.push(block);'],
  ['live-track-not-grown', 'pack', ' h.track.push(rec.track);', ''],
  ['live-drift-not-grown', 'pack', ' h.drift.push(rec.drift || [0, 0]);', ''],
  ['live-drift-no-default', 'pack', 'h.drift.push(rec.drift || [0, 0]);', 'h.drift.push(rec.drift);'],
  ['live-fn-not-grown', 'pack', ' if (nests) h.fn.push(rec.fn || []);', ''],
  ['live-fn-no-default', 'pack', 'h.fn.push(rec.fn || [])', 'h.fn.push(rec.fn)'],
  ['live-fn-always', 'pack', 'if (nests) h.fn = []; else delete h.fn;', 'h.fn = [];'],
  ['live-fn-kept', 'pack', 'if (nests) h.fn = []; else delete h.fn;', 'if (nests) h.fn = [];'],
  ['live-block-not-kept', 'pack', 'blocks.push(block); h.times.push(rec.t);', 'h.times.push(rec.t);'],
  ['live-index', 'pack', '      return i;\n    };\n    return P;', '      return i + 1;\n    };\n    return P;'],
  ['live-flag', 'pack', 'P.live = true;', 'P.live = false;'],
  ['live-header-frames-kept', 'pack', 'Object.assign({}, header, { times: [], track: [], drift: [] })', 'Object.assign({ times: [], track: [], drift: [] }, header)'],
  // the pack assembler
  ['assemble-header-length', 'pack', 'new DataView(body.buffer).setUint32(0, head.length, true);', 'new DataView(body.buffer).setUint32(0, head.length + 1, true);'],
  ['assemble-frame-offset', 'pack', 'blocks.forEach((b, i) => body.set(b, 4 + head.length + offsets[i]));', 'blocks.forEach((b, i) => body.set(b, 4 + head.length + i * 4 * per));'],
  ['assemble-size-check', 'pack', 'if (b.length !== want(i)) throw', 'if (false) throw'],
  ['assemble-per', 'pack', 'const per = header.nx * header.ny * header.nz, nests = header.nests || null,', 'const per = header.nx * header.nx * header.nz, nests = header.nests || null,'],
];

const only = process.argv.slice(2).find((a) => !a.startsWith('jobs=')), jobs = +((process.argv.find((a) => a.startsWith('jobs=')) || '').slice(5)) || Math.min(4, cpus().length);
const base = mkdtempSync(join(tmpdir(), 'sev-labmut-'));
const prepare = (name, file, text) => {
  const d = join(base, name);
  for (const x of ['src', 'tests']) mkdirSync(join(d, x), { recursive: true });
  copyFileSync(join(root, 'tests/severe_lab.mjs'), join(d, 'tests/severe_lab.mjs'));
  for (const k of Object.keys(FILES)) writeFileSync(join(d, 'src/' + FILES[k]), k === file ? text : SRC[k]);
  return d;
};
const run = (name, file, text) => new Promise((resolve) => {
  const d = prepare(name, file, text), p = spawn('node', ['tests/severe_lab.mjs'], { cwd: d, env: Object.assign({}, process.env, { FAILFAST: '1' }) }); let out = '', err = '';
  const timer = setTimeout(() => p.kill('SIGKILL'), 600000);
  p.stdout.on('data', (b) => { out += b; }); p.stderr.on('data', (b) => { err += b; });
  p.on('close', (code) => { clearTimeout(timer); const f = out.split('\n').filter((l) => l.startsWith('FAIL')).map((l) => l.slice(5, 90)); rmSync(d, { recursive: true, force: true }); resolve(code === 0 ? { killed: false } : { killed: true, by: f[0] || err.split('\n').find((l) => l.trim()) || 'crash' }); });
});

const main = async () => {
  if (process.env.DRY) {
    let bad = 0; for (const [name, file, a] of M) { const n = SRC[file].split(a).length - 1; if (n !== 1) { bad++; console.log('??   ' + name + ': the text to change occurs ' + n + ' times'); } }
    console.log(M.length + ' mutants, ' + bad + ' with text that is not there exactly once'); rmSync(base, { recursive: true, force: true }); process.exit(bad ? 1 : 0);
  }
  const b = await run('original', 'ana', SRC.ana);
  if (b.killed) { console.log('the unmutated copy fails:', b.by); process.exit(2); }
  const todo = [];
  for (const [name, file, a, c] of M) {
    if (only && !only.split('|').some((f) => name.includes(f))) continue;
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
