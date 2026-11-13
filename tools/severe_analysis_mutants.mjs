// Mutation testing of the analysis builder (src/severe-analysis.js): each mutant changes one expression, and tests/severe_analysis.mjs runs against the copy.
// A mutant that the test lets through ("survived") is a place where it does not look.
//   node tools/severe_analysis_mutants.mjs [name-filter] [jobs=4]
// Each copy goes to its own temporary directory with the test and the modules it loads beside it, so nothing in the repository is touched and the copies run side by side.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir, cpus } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = { core: 'severe-core.js', snd: 'severe-sounding.js', ana: 'severe-analysis.js' };
const SRC = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, readFileSync(join(root, 'src/' + f), 'utf8')]));
// [name, file, the text to find (once), its replacement]
const M = [
  // columns: the numbers at a list of points
  ['columns-x-y', 'ana', 'const x = points[q][0], y = points[q][1];', 'const x = points[q][1], y = points[q][0];'],
  ['columns-hour', 'ana', 'const env = sounding(x, y, t, { dz, top: 16000 }), ix = SND.indices(env), tb = env.table, w = windAt(x, y, 10, t), p = pressure(x, y, t);\n        out.mslp[q] = p; out.T[q]', 'const env = sounding(x, y, 0, { dz, top: 16000 }), ix = SND.indices(env), tb = env.table, w = windAt(x, y, 10, t), p = pressure(x, y, t);\n        out.mslp[q] = p; out.T[q]'],
  ['columns-pressure-hour', 'ana', 'w = windAt(x, y, 10, t), p = pressure(x, y, t);\n        out.mslp[q] = p; out.T[q]', 'w = windAt(x, y, 10, t), p = pressure(x, y, 0);\n        out.mslp[q] = p; out.T[q]'],
  ['columns-grid', 'ana', 'const dz = (o && o.dz) || 100, out = { n: points.length', 'const dz = (o && o.dz) || 250, out = { n: points.length'],
  ['columns-grid-ignored', 'ana', 'const dz = (o && o.dz) || 100, out = { n: points.length', 'const dz = 100, out = { n: points.length'],
  ['fields-lattice-order', 'ana', 'for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) pts.push(', 'for (let i = 0; i < g.nx; i++) for (let j = 0; j < g.ny; j++) pts.push('],
  ['fields-hour', 'ana', 'const c = columns(pts, t, { dz: g.dz })', 'const c = columns(pts, 0, { dz: g.dz })'],
  // the air masses of a day can be changed
  ['air-override-ignored', 'ana', "Object.assign({}, AIR_SPEC[name], over && over[name], { winds", "Object.assign({}, AIR_SPEC[name], { winds"],
  ['air-override-order', 'ana', "Object.assign({}, AIR_SPEC[name], over && over[name], { winds", "Object.assign({}, over && over[name], AIR_SPEC[name], { winds"],
  ['air-cache-key', 'ana', "const key = dz + '/' + top + '/' + (over ? JSON.stringify(over) : '');", "const key = dz + '/' + top;"],
  ['air-main-tables', 'ana', 'const T = airTables(opts.dz, opts.top, D.air);', 'const T = airTables(opts.dz, opts.top);'],
  ['air-other-grid', 'ana', 'airTables(dz, top, D.air), n = W.n', 'airTables(dz, top), n = W.n'],
  // the pressure
  ['low-depth-default', 'ana', '(o.depth === undefined ? 15 : o.depth) + (o.deepen', '(o.depth === undefined ? 12 : o.depth) + (o.deepen'],
  ['low-size-default', 'ana', '(o.size || 400)', '(o.size || 300)'],
  ['low-deepen-sign', 'ana', '(o.depth === undefined ? 15 : o.depth) + (o.deepen || 0) * t)', '(o.depth === undefined ? 15 : o.depth) - (o.deepen || 0) * t)'],
  ['low-centre-ignores-motion', 'ana', "p -= ((o.depth === undefined ? 15 : o.depth) + (o.deepen || 0) * t) * gauss(Math.hypot(x - o.x - dx, y - o.y - dy)", "p -= ((o.depth === undefined ? 15 : o.depth) + (o.deepen || 0) * t) * gauss(Math.hypot(x - o.x, y - o.y - dy)"],
  ['high-sign', 'ana', "p += ((o.rise === undefined ? 10 : o.rise)", "p -= ((o.rise === undefined ? 10 : o.rise)"],
  ['high-rise-default', 'ana', 'o.rise === undefined ? 10 : o.rise', 'o.rise === undefined ? 8 : o.rise'],
  ['high-size-default', 'ana', '(o.size || 600)', '(o.size || 500)'],
  ['gauss-shape', 'ana', 'const gauss = (a) => Math.exp(-a * a);', 'const gauss = (a) => Math.exp(-Math.abs(a));'],
  ['trough-width-default', 'ana', '(o.width || 120)', '(o.width || 100)'],
  ['trough-depth-default', 'ana', 'o.depth === undefined ? 4 : o.depth', 'o.depth === undefined ? 5 : o.depth'],
  ['trough-ignores-motion', 'ana', "gauss(polyNear(shifted(o.pts, dx, dy), x, y).dist / (o.width || 120))", "gauss(polyNear(o.pts, x, y).dist / (o.width || 120))"],
  ['front-kink-scale', 'ana', 'p -= 0.1 * (o.contrast', 'p -= 0.2 * (o.contrast'],
  ['front-kink-width', 'ana', 'gauss(pn.dist / (1.5 * w))', 'gauss(pn.dist / w)'],
  ['front-kink-end-fade', 'ana', 'gauss(pn.dist / (1.5 * w)) * gauss(pn.past / opts.fade)', 'gauss(pn.dist / (1.5 * w))'],
  ['motion-hours', 'ana', 'return [m.u * t * KMH, m.v * t * KMH];', 'return [m.u * t * 3, m.v * t * KMH];'],
  ['motion-v-lost', 'ana', 'return [m.u * t * KMH, m.v * t * KMH];', 'return [m.u * t * KMH, 0];'],
  ['gradient-step', 'ana', 'const h = 3;', 'const h = 80;'],
  ['gradient-x-units', 'ana', '* 100 / (2 * h * 1000), gy:', '* 10 / (2 * h * 1000), gy:'],
  ['gradient-y-units', 'ana', 'gy: (pressure(x, y + h, t) - pressure(x, y - h, t)) * 100 /', 'gy: (pressure(x, y + h, t) - pressure(x, y - h, t)) * 10 /'],
  ['geostrophic-u-sign', 'ana', 'return { u: -g.gy / (RHO * f), v: g.gx / (RHO * f) };', 'return { u: g.gy / (RHO * f), v: g.gx / (RHO * f) };'],
  ['geostrophic-v-sign', 'ana', 'return { u: -g.gy / (RHO * f), v: g.gx / (RHO * f) };', 'return { u: -g.gy / (RHO * f), v: -g.gx / (RHO * f) };'],
  ['geostrophic-coriolis', 'ana', 'v: g.gx / (RHO * f) };', 'v: g.gx / RHO };'],
  ['coriolis-floor', 'ana', 'Math.max(2e-5, 2 * OMEGA * Math.sin(lat * DEG))', 'Math.max(1e-5, 2 * OMEGA * Math.sin(lat * DEG))'],
  ['coriolis-latitude-default', 'ana', "D.lat === undefined ? 36.7 : D.lat", "D.lat === undefined ? 30 : D.lat"],
  ['base-pressure-default', 'ana', 'D.base === undefined ? 1015 : D.base', 'D.base === undefined ? 1013 : D.base'],
  // the wind
  ['friction-ratio-ground', 'ana', 'fr = 0.55 + 0.45 * (1 - Math.exp(-z / 700))', 'fr = 0.65 + 0.35 * (1 - Math.exp(-z / 700))'],
  ['friction-depth', 'ana', 'fr = 0.55 + 0.45 * (1 - Math.exp(-z / 700))', 'fr = 0.55 + 0.45 * (1 - Math.exp(-z / 1400))'],
  ['friction-angle', 'ana', 'ang = 28 * DEG * Math.exp(-z / 700)', 'ang = 20 * DEG * Math.exp(-z / 700)'],
  ['friction-angle-depth', 'ana', 'ang = 28 * DEG * Math.exp(-z / 700)', 'ang = 28 * DEG * Math.exp(-z / 2000)'],
  ['friction-turns-away', 'ana', 'let u = dec * fr * (g.u * ca - g.v * sa), v = dec * fr * (g.u * sa + g.v * ca);', 'let u = dec * fr * (g.u * ca + g.v * sa), v = dec * fr * (-g.u * sa + g.v * ca);'],
  ['gradient-wind-decay', 'ana', 'dec = Math.exp(-z / 3500)', 'dec = Math.exp(-z / 7000)'],
  ['aloft-exponent', 'ana', 'Math.pow(z / 10000, 0.8)', 'Math.pow(z / 10000, 0.5)'],
  ['aloft-top', 'ana', 'z >= 10000 ? 1 :', 'z >= 12000 ? 1 :'],
  ['aloft-u-sign', 'ana', 'bg = { u: -aloft.speed * Math.sin(aloft.from * DEG)', 'bg = { u: aloft.speed * Math.sin(aloft.from * DEG)'],
  ['aloft-v-sign', 'ana', 'v: -aloft.speed * Math.cos(aloft.from * DEG) }', 'v: aloft.speed * Math.cos(aloft.from * DEG) }'],
  ['aloft-speed-default', 'ana', '{ speed: 30, from: 255 }', '{ speed: 25, from: 255 }'],
  ['aloft-direction-default', 'ana', '{ speed: 30, from: 255 }', '{ speed: 30, from: 270 }'],
  ['aloft-not-added', 'ana', 'u += bg.u * sh; v += bg.v * sh;', 'v += bg.v * sh;'],
  ['jet-speed-default', 'ana', "(o.type === 'jet' ? 25 : 18)", "(o.type === 'jet' ? 30 : 18)"],
  ['llj-speed-default', 'ana', "(o.type === 'jet' ? 25 : 18)", "(o.type === 'jet' ? 25 : 20)"],
  ['jet-width-default', 'ana', "(o.type === 'jet' ? 250 : 150)", "(o.type === 'jet' ? 300 : 150)"],
  ['llj-width-default', 'ana', "(o.type === 'jet' ? 250 : 150)", "(o.type === 'jet' ? 250 : 120)"],
  ['jet-height', 'ana', 'gauss((z - 9500) / 3500)', 'gauss((z - 9000) / 3500)'],
  ['jet-thickness', 'ana', 'gauss((z - 9500) / 3500)', 'gauss((z - 9500) / 2500)'],
  ['llj-height', 'ana', 'gauss((z - 1500) / 800)', 'gauss((z - 1000) / 800)'],
  ['llj-thickness', 'ana', 'gauss((z - 1500) / 800)', 'gauss((z - 1500) / 1200)'],
  ['jet-direction', 'ana', 'u += a * pn.ux; v += a * pn.uy;', 'u += a * pn.uy; v += a * pn.ux;'],
  ['jet-end-fade', 'ana', 'gauss(pn.dist / w) * gauss(pn.past / opts.fade) * vert', 'gauss(pn.dist / w) * vert'],
  ['jet-cross-width', 'ana', 'gauss(pn.dist / w) * gauss(pn.past', 'gauss(pn.dist / (2 * w)) * gauss(pn.past'],
  ['jet-ignores-motion', 'ana', "const pn = polyNear(shifted(o.pts, dx, dy), x, y), V = o.speed", "const pn = polyNear(o.pts, x, y), V = o.speed"],
  ['utrough-clockwise', 'ana', 'u += a * (-(y - cy) / r); v += a * ((x - cx) / r);', 'u += a * ((y - cy) / r); v += a * (-(x - cx) / r);'],
  ['utrough-profile', 'ana', 'Math.exp(0.5 * (1 - (r / R) * (r / R)))', 'Math.exp(1 - (r / R))'],
  ['utrough-height', 'ana', 'gauss((z - 8000) / 4000)', 'gauss((z - 9000) / 4000)'],
  ['utrough-thickness', 'ana', 'gauss((z - 8000) / 4000)', 'gauss((z - 8000) / 6000)'],
  ['utrough-speed-default', 'ana', 'V = o.speed === undefined ? 25 : o.speed;', 'V = o.speed === undefined ? 20 : o.speed;'],
  ['utrough-size-default', 'ana', 'R = o.size || 500', 'R = o.size || 400'],
  ['utrough-ignores-motion', 'ana', 'const cx = o.x + dx, cy = o.y + dy,', 'const cx = o.x, cy = o.y + dy,'],
  ['wind-nodes-gradient-once', 'ana', 'const w = windAt(x, y, z, t, g); return [z, w[0], w[1]];', 'const w = windAt(x, y, z, t); return [z, w[0] * 1, w[1] * 1.0000001];'],
  // the profile and its blend
  ['sounding-ground-pressure', 'ana', 'p0: pressure(x, y, t) });', 'p0: pBase });'],
  ['sounding-u-nodes', 'ana', 'pu = SND.pchip(zz, nodes.map((r) => r[1]))', 'pu = SND.pchip(zz, nodes.map((r) => r[2]))'],
  ['sounding-v-nodes', 'ana', 'pv = SND.pchip(zz, nodes.map((r) => r[2]))', 'pv = SND.pchip(zz, nodes.map((r) => r[1]))'],
  ['blend-half-on-the-line', 'ana', 'const c = fade * 0.5 * (1 - Math.tanh(', 'const c = fade * (1 - Math.tanh('],
  ['blend-slope-sign', 'ana', '(dWarm + z[i] / slope / 1000) / w', '(dWarm - z[i] / slope / 1000) / w'],
  ['blend-slope-units', 'ana', 'z[i] / slope / 1000', 'z[i] / slope / 100'],
  ['blend-width', 'ana', '/ slope / 1000) / w));', '/ slope / 1000) / (2 * w)));'],
  ['blend-fade-lost', 'ana', 'const c = fade * 0.5', 'const c = 0.5'],
  ['blend-side', 'ana', 'const dWarm = (sideLeft ? -pn.left : pn.left)', 'const dWarm = (sideLeft ? pn.left : -pn.left)'],
  ['blend-theta-target', 'ana', 'th[i] += c * (wm.theta[i] + k * (A.theta[i] - wm.theta[i]) - th[i]);', 'th[i] += c * (wm.theta[i] + 1 * (A.theta[i] - wm.theta[i]) - th[i]);'],
  ['blend-theta-from-current', 'ana', 'th[i] += c * (wm.theta[i] + k * (A.theta[i] - wm.theta[i]) - th[i]);', 'th[i] += c * k * (A.theta[i] - th[i]);'],
  ['blend-vapour-target', 'ana', 'wm.qv[i] + k * (A.qv[i] - wm.qv[i])', 'wm.qv[i] + (A.qv[i] - wm.qv[i])'],
  ['blend-vapour-floor', 'ana', 'Math.max(1e-7, wm.qv[i] + k * (A.qv[i] - wm.qv[i]))', 'wm.qv[i] + k * (A.qv[i] - wm.qv[i])'],
  ['front-cold-side-default', 'ana', "(ob.cold || 'left') === 'left'", "(ob.cold || 'right') === 'left'"],
  ['outflow-cool-side-default', 'ana', "(ob.cool || 'left') === 'left'", "(ob.cool || 'right') === 'left'"],
  ['dryline-dry-side-default', 'ana', "(ob.dry || 'left') === 'left'", "(ob.dry || 'right') === 'left'"],
  ['contrast-not-scaled-by-exner', 'ana', "if (ob.type !== 'dryline') k /= piG;", "if (ob.type !== 'dryline') k *= 1;"],
  ['contrast-limit', 'ana', 'k = Math.max(0, Math.min(2, k));', 'k = Math.max(0, Math.min(1, k));'],
  ['front-slope-cold', 'ana', 'cold: { slope: 1 / 80,', 'cold: { slope: 1 / 60,'],
  ['front-slope-warm', 'ana', 'warm: { slope: 1 / 150,', 'warm: { slope: 1 / 100,'],
  ['front-slope-stationary', 'ana', 'stationary: { slope: 1 / 100,', 'stationary: { slope: 1 / 80,'],
  ['front-slope-occluded', 'ana', 'occluded: { slope: 1 / 100,', 'occluded: { slope: 1 / 80,'],
  ['front-contrast-cold', 'ana', 'cold: { slope: 1 / 80, contrast: 12,', 'cold: { slope: 1 / 80, contrast: 10,'],
  ['front-contrast-warm', 'ana', 'contrast: 10, width: 60,', 'contrast: 8, width: 60,'],
  ['front-contrast-stationary', 'ana', 'stationary: { slope: 1 / 100, contrast: 8,', 'stationary: { slope: 1 / 100, contrast: 6,'],
  ['front-contrast-occluded', 'ana', 'occluded: { slope: 1 / 100, contrast: 8,', 'occluded: { slope: 1 / 100, contrast: 6,'],
  ['front-width-cold', 'ana', 'contrast: 12, width: 40,', 'contrast: 12, width: 30,'],
  ['front-width-warm', 'ana', 'contrast: 10, width: 60,', 'contrast: 10, width: 40,'],
  ['front-width-stationary', 'ana', 'stationary: { slope: 1 / 100, contrast: 8, width: 50,', 'stationary: { slope: 1 / 100, contrast: 8, width: 40,'],
  ['front-width-occluded', 'ana', 'occluded: { slope: 1 / 100, contrast: 8, width: 50,', 'occluded: { slope: 1 / 100, contrast: 8, width: 40,'],
  ['front-air-warm', 'ana', "contrast: 10, width: 60, air: 'cool'", "contrast: 10, width: 60, air: 'cold'"],
  ['front-air-stationary', 'ana', "stationary: { slope: 1 / 100, contrast: 8, width: 50, air: 'cool'", "stationary: { slope: 1 / 100, contrast: 8, width: 50, air: 'cold'"],
  ['front-air-occluded', 'ana', "occluded: { slope: 1 / 100, contrast: 8, width: 50, air: 'cold'", "occluded: { slope: 1 / 100, contrast: 8, width: 50, air: 'cool'"],
  ['outflow-slope-default', 'ana', 'ob.slope || 1 / 25', 'ob.slope || 1 / 40'],
  ['outflow-width-default', 'ana', 'w = ob.width || 10;', 'w = ob.width || 20;'],
  ['outflow-contrast-default', 'ana', 'ob.contrast === undefined ? 4 : ob.contrast', 'ob.contrast === undefined ? 6 : ob.contrast'],
  ['dryline-slope-default', 'ana', 'ob.slope || -1 / 40', 'ob.slope || -1 / 30'],
  ['dryline-slope-sign', 'ana', 'ob.slope || -1 / 40', 'ob.slope || 1 / 40'],
  ['dryline-width-default', 'ana', 'w = ob.width || 20; k = dryShare', 'w = ob.width || 30; k = dryShare'],
  ['dryline-contrast-default', 'ana', 'dryShare(ob.contrast === undefined ? 12 : ob.contrast)', 'dryShare(ob.contrast === undefined ? 10 : ob.contrast)'],
  ['dryline-share-bounds', 'ana', 'let lo = 0, hi = Math.min(2, 0.98 * w.qv[0] / (w.qv[0] - d.qv[0]));', 'let lo = 0, hi = 1;'],
  ['dryline-share-direction', 'ana', 'if (dewpointC(w.qv[0] + mid * (d.qv[0] - w.qv[0]), p) > target) lo = mid; else hi = mid;', 'if (dewpointC(w.qv[0] + mid * (d.qv[0] - w.qv[0]), p) > target) hi = mid; else lo = mid;'],
  ['moisture-rate', 'ana', 'a * 0.065 * Math.exp', 'a * 0.05 * Math.exp'],
  ['moisture-depth', 'ana', 'Math.exp(-z[i] / 2000)', 'Math.exp(-z[i] / 3000)'],
  ['moisture-width-default', 'ana', '(ob.width || 200)', '(ob.width || 150)'],
  ['moisture-amount-default', 'ana', 'ob.amount === undefined ? 3 : ob.amount', 'ob.amount === undefined ? 2 : ob.amount'],
  ['moisture-end-fade', 'ana', 'gauss(pn.dist / (ob.width || 200)) * gauss(pn.past / opts.fade)', 'gauss(pn.dist / (ob.width || 200))'],
  ['order-dryline-first', 'ana', "o.type === 'dryline' ? -1 :", "o.type === 'dryline' ? 99 :"],
  ['order-weakest-last', 'ana', 'strength(a) - strength(b)', 'strength(b) - strength(a)'],
  ['order-outflow-default-contrast', 'ana', "o.type === 'outflow' ? (o.contrast === undefined ? 4 : o.contrast) : 99", "o.type === 'outflow' ? (o.contrast === undefined ? 40 : o.contrast) : 99"],
  ['order-front-default-contrast', 'ana', "(o.contrast === undefined ? FRONT[o.kind || 'cold'].contrast : o.contrast) : o.type === 'outflow'", "(o.contrast === undefined ? 0 : o.contrast) : o.type === 'outflow'"],
  ['order-front-explicit-contrast', 'ana', "FRONT[o.kind || 'cold'].contrast : o.contrast) : o.type === 'outflow'", "FRONT[o.kind || 'cold'].contrast : 0) : o.type === 'outflow'"],
  ['theta-held-monotone', 'ana', 'if (th[i] < th[i - 1]) th[i] = th[i - 1];', ''],
  ['theta-held-wrong-way', 'ana', 'if (th[i] < th[i - 1]) th[i] = th[i - 1];', 'if (th[i] < th[i - 1]) th[i - 1] = th[i];'],
  // the line
  ['line-not-clamped', 'ana', 'tc = Math.max(0, Math.min(1, t))', 'tc = t'],
  ['line-side-sign', 'ana', 'left: left > 0 ? dist : -dist', 'left: left > 0 ? -dist : dist'],
  ['line-side-cross', 'ana', 'const left = ux * (y - best.py) - uy * (x - best.px);', 'const left = ux * (y - best.py) + uy * (x - best.px);'],
  ['line-past-start', 'ana', 'best.i === 0 && best.t < 0 ? -best.t * best.L', 'best.i === 0 && best.t < 0 ? 0'],
  ['line-past-end', 'ana', 'best.i === last && best.t > 1 ? (best.t - 1) * best.L : 0', 'best.i === last && best.t > 1 ? (best.t - 1) : 0'],
  ['line-corner-direction', 'ana', 'ux += vx / L; uy += vy / L; }', 'ux += 0; uy += 0; }'],
  ['line-nearest', 'ana', 'if (!best || d2 < best.d2)', 'if (!best || d2 > best.d2)'],
  ['line-shift-lost', 'ana', 'const shifted = (pts, dx, dy) => (dx === 0 && dy === 0 ? pts : pts.map((p) => [p[0] + dx, p[1] + dy]));', 'const shifted = (pts, dx, dy) => pts;'],
  // the surface, the map and the refusals
  ['surface-kelvin', 'ana', 'T: tb.theta[0] * tb.pi[0] - 273.15, Td: dewpointC(tb.qv[0], 100 * p), u: w[0]', 'T: tb.theta[0] * tb.pi[0] - 273, Td: dewpointC(tb.qv[0], 100 * p), u: w[0]'],
  ['surface-dewpoint-pressure', 'ana', 'Td: dewpointC(tb.qv[0], 100 * p), u: w[0]', 'Td: dewpointC(tb.qv[0], 1e5), u: w[0]'],
  ['surface-direction', 'ana', 'dir: (Math.atan2(-w[0], -w[1]) / DEG + 360) % 360', 'dir: (Math.atan2(w[0], w[1]) / DEG + 360) % 360'],
  ['surface-wind-height', 'ana', 'w = windAt(x, y, 10, t), p = pressure(x, y, t);\n      return', 'w = windAt(x, y, 100, t), p = pressure(x, y, t);\n      return'],
  ['dewpoint-bolton', 'ana', '243.5 * l / (17.67 - l)', '243.5 * l / (17.27 - l)'],
  ['dewpoint-mixing-ratio', 'ana', 'qv * pPa / (0.622 + qv) / 100', 'qv * pPa / 0.622 / 100'],
  ['map-x-end', 'ana', 'const x = g.x0 + (g.x1 - g.x0) * (g.nx > 1 ? i / (g.nx - 1) : 0.5)', 'const x = g.x0 + (g.x1 - g.x0) * (g.nx > 1 ? i / g.nx : 0.5)'],
  ['map-y-end', 'ana', 'y = g.y0 + (g.y1 - g.y0) * (g.ny > 1 ? j / (g.ny - 1) : 0.5)', 'y = g.y0 + (g.y1 - g.y0) * (g.ny > 1 ? j / g.ny : 0.5)'],
  ['map-cin-floor', 'ana', 'out.mlcin[q] = Math.max(-1000, ix.mlcin);', 'out.mlcin[q] = ix.mlcin;'],
  ['map-top', 'ana', "{ dz: g.dz, top: 16000 }", "{ dz: g.dz, top: 12000 }"],
  ['map-scp-cin', 'ana', 'ix.mlcin > -40 ? 1 : -40 / ix.mlcin', 'ix.mlcin > -40 ? 1 : 1'],
  ['map-scp-shear', 'ana', 'ix.shear06 < 10 ? 0 : Math.min(1.5, ix.shear06 / 20)', 'ix.shear06 < 10 ? 0 : ix.shear06 / 20'],
  ['map-scp-shear-floor', 'ana', 'ix.shear06 < 10 ? 0 : Math.min(1.5', 'ix.shear06 < 5 ? 0 : Math.min(1.5'],
  ['map-scp-helicity', 'ana', 'Math.max(0, ix.srh03 / 50)', 'Math.max(0, ix.srh03 / 100)'],
  ['map-scp-cape', 'ana', 'Math.max(0, ix.mlcape / 1000)', 'Math.max(0, ix.mlcape / 2000)'],
  ['unknown-object-allowed', 'ana', "for (const o of objs) if (!KNOWN.includes(o.type)) throw", "for (const o of objs) if (false) throw"],
  ['short-line-allowed', 'ana', "if (lineLike && (!o.pts || o.pts.length < 2)) throw", "if (false) throw"],
  ['front-kind-unchecked', 'ana', "if (o.type === 'front' && !FRONT[o.kind || 'cold']) throw", "if (false) throw"],
  ['moisture-not-a-line', 'ana', "['trough', 'front', 'dryline', 'outflow', 'moisture', 'jet', 'llj'].includes(o.type)", "['trough', 'front', 'dryline', 'outflow', 'jet', 'llj'].includes(o.type)"],
];

const only = process.argv.slice(2).find((a) => !a.startsWith('jobs=')), jobs = +((process.argv.find((a) => a.startsWith('jobs=')) || '').slice(5)) || Math.min(4, cpus().length);
const base = mkdtempSync(join(tmpdir(), 'sev-anmut-'));
const prepare = (name, file, text) => {
  const d = join(base, name);
  for (const x of ['src', 'tests', 'tools/severe_research']) mkdirSync(join(d, x), { recursive: true });
  copyFileSync(join(root, 'tests/severe_analysis.mjs'), join(d, 'tests/severe_analysis.mjs'));
  for (const k of Object.keys(FILES)) writeFileSync(join(d, 'src/' + FILES[k]), k === file ? text : SRC[k]);
  return d;
};
const run = (name, file, text) => new Promise((resolve) => {
  const d = prepare(name, file, text), p = spawn('node', ['tests/severe_analysis.mjs'], { cwd: d }); let out = '', err = '';
  const timer = setTimeout(() => p.kill('SIGKILL'), 120000);
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
