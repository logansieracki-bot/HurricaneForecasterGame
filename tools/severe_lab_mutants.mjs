// Mutation testing of the Lab (src/severe-lab.js) and the pack assembler (src/severe-pack.js): each mutant changes one expression, and tests/severe_lab.mjs runs against the copy.
// A mutant that the test lets through ("survived") is a place where it does not look.
//   node tools/severe_lab_mutants.mjs [name-filter] [jobs=4]
// Each copy goes to its own temporary directory with the test and the modules it loads beside it, so nothing in the repository is touched and the copies run side by side.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir, cpus } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = { core: 'severe-core.js', snd: 'severe-sounding.js', refl: 'severe-refl.js', ana: 'severe-analysis.js', days: 'severe-days.js', geo: 'severe-geo.js', pack: 'severe-pack.js', lab: 'severe-lab.js' };
const SRC = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, readFileSync(join(root, 'src/' + f), 'utf8')]));
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
  ['rec-wind-step', 'lab', 'Math.round(v / 0.5)', 'Math.round(v / 0.25)'],
  ['rec-wind-clamp', 'lab', 'Math.max(-127, Math.min(127, Math.round(v / 0.5)))', 'Math.max(-100, Math.min(100, Math.round(v / 0.5)))'],
  ['rec-fall-speed-step', 'lab', 'Math.round(4 * vzc[k])', 'Math.round(2 * vzc[k])'],
  ['rec-layout', 'lab', 'at = (k * ny + j) * nx + i;', 'at = (j * nz + k) * nx + i;'],
  ['rec-layout-x-y', 'lab', 'at = (k * ny + j) * nx + i;', 'at = (k * ny + i) * nx + j;'],
  ['rec-u-centre', 'lab', 'uu[at] = c8(0.5 * (S.u[o] + S.u[o + 1]));', 'uu[at] = c8(S.u[o]);'],
  ['rec-v-centre', 'lab', 'vv[at] = c8(0.5 * (S.v[o] + S.v[o + sy]));', 'vv[at] = c8(S.v[o]);'],
  ['rec-w-centre', 'lab', 'ww[at] = c8(0.5 * (S.w[o] + S.w[o + sz]));', 'ww[at] = c8(S.w[o]);'],
  ['rec-v-for-u', 'lab', 'uu[at] = c8(0.5 * (S.u[o] + S.u[o + 1])); vv[at] = c8(0.5 * (S.v[o] + S.v[o + sy]));', 'uu[at] = c8(0.5 * (S.v[o] + S.v[o + sy])); vv[at] = c8(0.5 * (S.u[o] + S.u[o + 1]));'],
  ['rec-array-order', 'lab', 'uu = new Int8Array(block.buffer, 2 * per, per), vv = new Int8Array(block.buffer, 3 * per, per)', 'uu = new Int8Array(block.buffer, 3 * per, per), vv = new Int8Array(block.buffer, 2 * per, per)'],
  ['rec-vz-offset', 'lab', 'vz = new Uint8Array(block.buffer, per, per)', 'vz = new Uint8Array(block.buffer, 2 * per, per)'],
  ['rec-strongest-echo', 'lab', 'if (col[k] > zmax) zmax = col[k];', 'if (col[k] < zmax) zmax = col[k];'],
  ['rec-echo-floor', 'lab', 'dbz[at] = Math.max(-30, Math.min(120, Math.round(col[k])));', 'dbz[at] = Math.max(-20, Math.min(120, Math.round(col[k])));'],
  // the run
  ['run-box-default', 'lab', 'dx = spec.dx || 2000, L = spec.box || 84000,', 'dx = spec.dx || 2000, L = spec.box || 80000,'],
  ['run-dx-default', 'lab', 'dx = spec.dx || 2000,', 'dx = spec.dx || 1000,'],
  ['run-levels-default', 'lab', 'nz = spec.nz || 40, dz = spec.dz || 500,', 'nz = spec.nz || 30, dz = spec.dz || 500,'],
  ['run-spacing-default', 'lab', 'dz = spec.dz || 500, dt = spec.dt || 10', 'dz = spec.dz || 400, dt = spec.dt || 10'],
  ['run-step-default', 'lab', 'dt = spec.dt || 10, minutes', 'dt = spec.dt || 5, minutes'],
  ['run-frame-interval', 'lab', 'nextFrame += every * 60;', 'nextFrame += every * 30;'],
  ['run-frame-default', 'lab', 'every = spec.frameEvery || 5;', 'every = spec.frameEvery || 10;'],
  ['run-steps', 'lab', 'nSteps = Math.round(minutes * 60 / dt), follow', 'nSteps = Math.round(minutes * 30 / dt), follow'],
  ['run-first-frame', 'lab', 'if (t >= nextFrame - 1e-9) {', 'if (t > nextFrame) {'],
  ['run-track-level', 'lab', 'k5 = Math.min(nz - 2, Math.floor(5250 / dz));', 'k5 = Math.min(nz - 2, Math.floor(3000 / dz));'],
  ['run-track-x', 'lab', 'wx = (i + 0.5) * dx;', 'wx = i * dx;'],
  ['run-track-y', 'lab', 'wy = (j + 0.5) * dx; } }', 'wy = j * dx; } }'],
  ['run-track-updraft', 'lab', 'const o = idx(i, j, k5), w = 0.5 * (S.w[o] + S.w[o + sz]); if (w > wm)', 'const o = idx(i, j, k5), w = -0.5 * (S.w[o] + S.w[o + sz]); if (w > wm)'],
  ['run-track-strength', 'lab', 'track: [Math.round(wx), Math.round(wy), +wm.toFixed(1)]', 'track: [Math.round(wx), Math.round(wy), +d.wmax.toFixed(1)]'],
  ['run-blow-up', 'lab', "if (!Number.isFinite(d.wmax) || d.wmax > 150) { stopped = true; reason = 'the model blew up at '", "if (false) { stopped = true; reason = 'the model blew up at '"],
  ['run-progress-every', 'lab', 'step % 6 === 0', 'step % 3 === 0'],
  ['run-yield', 'lab', 'if (hooks.yield && Date.now() - yielded > 80)', 'if (hooks.yield && Date.now() - yielded > 80000)'],
  ['run-cancel', 'lab', 'if (hooks.cancelled && hooks.cancelled())', 'if (false)'],
  ['run-cancel-reason', 'lab', "stopped = true; reason = 'cancelled'; break;", "stopped = true; reason = 'stopped'; break;"],
  ['run-header-base-u', 'lab', 'u: Array.from(b.ubc, (v) => +(v + motion.u).toFixed(3))', 'u: Array.from(b.ubc, (v) => +(v).toFixed(3))'],
  ['run-header-base-v', 'lab', 'v: Array.from(b.vbc, (v) => +(v + motion.v).toFixed(3))', 'v: Array.from(b.vbc, (v) => +(v - motion.v).toFixed(3))'],
  ['run-header-base-z', 'lab', 'z: Array.from(b.rhoc, (_, k) => (k + 0.5) * dz)', 'z: Array.from(b.rhoc, (_, k) => k * dz)'],
  ['run-header-motion', 'lab', 'motion: { u: motion.u, v: motion.v }, track:', 'motion: { u: motion.v, v: motion.u }, track:'],
  ['run-header-scale', 'lab', "scale: { wind: 0.5, vz: 0.25 },", "scale: { wind: 1, vz: 0.25 },"],
  ['run-header-floor', 'lab', 'floor: -30, times:', 'floor: -20, times:'],
  ['run-header-times', 'lab', 'times: frames.map((f) => f.t), motion', 'times: frames.map((f) => f.t * 60), motion'],
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
  ['core-bc-x', 'lab', "bc: { x: 'periodic', y: 'periodic' }, visc", "bc: { x: 'wall', y: 'periodic' }, visc"],
  ['core-bc-y', 'lab', "bc: { x: 'periodic', y: 'periodic' }, visc", "bc: { x: 'periodic', y: 'wall' }, visc"],
  ['core-viscosity', 'lab', 'visc: { kh: 500 * dx / 2000, kv: 500 * dx / 2000 }', 'visc: { kh: 500, kv: 500 }'],
  ['core-viscosity-vertical', 'lab', 'kv: 500 * dx / 2000 }', 'kv: 250 * dx / 2000 }'],
  ['core-rayleigh', 'lab', 'top: { depth: 5000, rate: 0.003 }', 'top: { depth: 3000, rate: 0.003 }'],
  ['core-rayleigh-rate', 'lab', 'top: { depth: 5000, rate: 0.003 }', 'top: { depth: 5000, rate: 0.03 }'],
  ['core-sponge-back', 'lab', 'damp: { top: { depth: 5000, rate: 0.003 } } });', 'damp: { top: { depth: 5000, rate: 0.003 }, lateral: { width: Math.min(10000, L / 6), rate: 0.02 } } });'],
  ['core-winds', 'lab', 'wind: { u: env.u, v: env.v },', 'wind: { u: env.v, v: env.u },'],
  ['core-spacing-y', 'lab', 'dx, dy: dx, dz, moist', 'dx, dy: dx / 2, dz, moist'],
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
  ['follow-after-hook', 'lab', '        const c = follow && frames.length >= 2 ? centring(block, nx, nx, nz, dz) : null;                    // (looked at before the hook: a worker hands the block over to the page and it is gone from here)\n        frames.push(rec); if (hooks.frame) hooks.frame(rec);\n', '        frames.push(rec); if (hooks.frame) hooks.frame(rec);\n        const c = follow && frames.length >= 3 ? centring(block, nx, nx, nz, dz) : null;\n'],
  ['follow-default-off', 'lab', 'follow = spec.follow !== false,', 'follow = spec.follow === true,'],
  ['follow-ignored', 'lab', 'follow = spec.follow !== false,', 'follow = true,'],
  ['follow-late', 'lab', 'if (follow && frames.length >= 3)', 'if (follow && frames.length >= 5)'],
  ['follow-never-rolls', 'lab', 'if (c && (c.sx || c.sy)) { roll(core, c.sx, c.sy);', 'if (c && (c.sx || c.sy)) { '],
  ['drift-sign-east', 'lab', 'cum[0] -= c.sx * dx;', 'cum[0] += c.sx * dx;'],
  ['drift-sign-north', 'lab', 'cum[1] -= c.sy * dx;', 'cum[1] += c.sy * dx;'],
  ['drift-east-by-north', 'lab', 'cum[0] -= c.sx * dx;', 'cum[0] -= c.sy * dx;'],
  ['drift-north-by-east', 'lab', 'cum[1] -= c.sy * dx;', 'cum[1] -= c.sx * dx;'],
  ['drift-in-cells', 'lab', 'cum[0] -= c.sx * dx;', 'cum[0] -= c.sx;'],
  ['drift-frame-after-roll', 'lab', 'thvmin: +d.thvmin.toFixed(2), drift: [cum[0], cum[1]] };', 'thvmin: +d.thvmin.toFixed(2), drift: [0, 0] };'],
  ['drift-not-in-header', 'lab', 'track: frames.map((f) => f.track), drift: frames.map((f) => f.drift), scale:', 'track: frames.map((f) => f.track), scale:'],
  ['follow-not-in-header', 'lab', 'minutes, follow },', 'minutes, follow: true },'],
  ['corner-drift-ignored', 'pack', 'd = drift[k]; } return [', 'd = [0, 0]; } return ['],
  ['corner-drift-first-frame', 'pack', 'd = drift[k]; } return [', 'd = drift[0]; } return ['],
  ['corner-drift-last-frame', 'pack', 'd = drift[k]; } return [', 'd = drift[n - 1]; } return ['],
  ['corner-drift-north-by-east', 'pack', 'sc.origin[1] + mo.v * 60 * t + d[1]]', 'sc.origin[1] + mo.v * 60 * t + d[0]]'],
  ['corner-drift-east-by-north', 'pack', 'sc.origin[0] + mo.u * 60 * t + d[0],', 'sc.origin[0] + mo.u * 60 * t + d[1],'],
  ['corner-frame-strict', 'pack', 'if (h.times[q] <= t + 1e-6) k = q;', 'if (h.times[q] < t) k = q;'],
  ['corner-frame-ahead', 'pack', 'if (h.times[q] <= t + 1e-6) k = q;', 'if (h.times[q] <= t + 3) k = q;'],
  ['corner-frame-first', 'pack', 'if (h.times[q] <= t + 1e-6) k = q;', 'if (h.times[q] <= t + 1e-6) k = 0;'],
  ['corner-no-drift-field', 'pack', 'const drift = h.drift || null;', 'const drift = null;'],
  // the pack assembler
  ['assemble-header-length', 'pack', 'new DataView(body.buffer).setUint32(0, head.length, true);', 'new DataView(body.buffer).setUint32(0, head.length + 1, true);'],
  ['assemble-frame-offset', 'pack', 'body.set(b, 4 + head.length + i * 5 * per);', 'body.set(b, 4 + head.length + i * 4 * per);'],
  ['assemble-size-check', 'pack', "if (b.length !== 5 * per) throw", "if (false) throw"],
  ['assemble-per', 'pack', 'const per = header.nx * header.ny * header.nz, head = new TextEncoder()', 'const per = header.nx * header.nx * header.nz, head = new TextEncoder()'],
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
  const d = prepare(name, file, text), p = spawn('node', ['tests/severe_lab.mjs'], { cwd: d }); let out = '', err = '';
  const timer = setTimeout(() => p.kill('SIGKILL'), 600000);
  p.stdout.on('data', (b) => { out += b; }); p.stderr.on('data', (b) => { err += b; });
  p.on('close', (code) => { clearTimeout(timer); const f = out.split('\n').filter((l) => l.startsWith('FAIL')).map((l) => l.slice(5, 90)); rmSync(d, { recursive: true, force: true }); resolve(code === 0 ? { killed: false } : { killed: true, by: f[0] || err.split('\n').find((l) => l.trim()) || 'crash' }); });
});

const main = async () => {
  const b = await run('original', 'ana', SRC.ana);
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
