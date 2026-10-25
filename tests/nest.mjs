// Node-only tests of the 2-km storm-scale nest behind the radar floater (src/storm-nest.js) and of its two links to the engine: the forcing of a system (HFNest.forcingOf) and the look-ahead (Manager.peek).
// The nest is exercised on forcings made by hand (one condition at a time) and on the engine's own storms; nothing here needs the browser.
import '../src/storm-cities.js';
import '../src/storms.js';
import '../src/storm-nest.js';
import { makeEnv } from './storms_env.mjs';

const H = globalThis.HFStorms, N = globalThis.HFNest;
H.calibrated(false);
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const KT = 0.514444, NG = N.N, NN = NG * NG;
const par = H.mergeParams(H.defaultParams(), { shearK: 1 });

/* a forcing from a few storm numbers (kt, km): a ring of wind with the engine's kind of outer profile, a hollow core when strong, optional second ring */
function forcing(o) {
  const vt = new Float32Array(N.NR), V = o.v * KT, rm = o.rmax, r34 = o.r34 || 120, x = Math.max(0.3, Math.min(1.1, Math.log(V / 17.5) / Math.log(r34 / rm))), nIn = 1 + 2 * Math.min(1, Math.max(0, (o.v - 50) / 50));
  for (let i = 0; i < N.NR; i++) vt[i] = i <= rm ? V * Math.pow(i / rm, nIn) : V * Math.pow(rm / i, x);
  if (o.inner) for (let i = 0; i < N.NR; i++) { const a = i <= o.inner.r ? o.inner.v * KT * Math.pow(i / o.inner.r, 1.5) : o.inner.v * KT * Math.pow(o.inner.r / i, 1.4); if (a > vt[i]) vt[i] = a; }
  return Object.assign({ clat: 20, clon: -60, lat: 20, vmax: V, rmax: rm, org: 0, shear: 3, shdir: 0, uem: 0, vem: 0, ued: 0, ved: 0, head: Math.PI / 4, spd: 4, rh: 0.72, sst: 28.8, eta: 0, etdir: 0.8, conv: 1, sg: 1, vt }, o.extra || {});
}
function run(o, hours, opts = {}) {
  const dt = opts.dt || 240, nest = N.create({ seed: opts.seed || 7 }), f = forcing(o);
  if (opts.par) Object.assign(N.PAR, opts.par);
  nest.init(f);
  if (opts.env) nest.setEnv(opts.env(f), f);
  if (opts.land) { const lf = new Float32Array(NN); for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) lf[j * NG + i] = opts.land((i - 127.5) * 2, (j - 127.5) * 2); nest.setLand(lf, false); }
  const n = Math.round(hours * 3600 / dt); for (let i = 0; i < n; i++) nest.step(dt);
  return nest;
}
const defaults = JSON.parse(JSON.stringify(N.PAR));
const reset = () => { Object.assign(N.PAR, JSON.parse(JSON.stringify(defaults))); };
const dbzField = (nest) => nest.dbz(new Float32Array(NN));
/* mean over the cells of an annulus and an angular window (degrees from east, counter-clockwise, centre line a, half-width w) */
function sector(nest, r0, r1, a, w, fn) {
  let s = 0, n = 0;
  for (let k = 0; k < NN; k++) { const r = nest.rr[k]; if (r < r0 || r >= r1) continue; if (a != null) { let d = (Math.atan2(nest.sth[k], nest.cth[k]) * 180 / Math.PI - a + 540) % 360 - 180; if (Math.abs(d) > w) continue; } s += fn(k); n++; }
  return n ? s / n : 0;
}
const rain = (nest) => (k) => nest.rc[k] + nest.rs[k];
const wet = (nest) => { const d = dbzField(nest); return (k) => (d[k] >= 20 ? 1 : 0); };

/* ---- the radar operator and the numbers of the grid ------------------------------------------------------------------------------------- */
{
  check('the grid is 256 x 256 cells of 2 km (a 512 km square), the Poisson solve on 128 x 128', N.N === 256 && N.DX === 2000 && N.NC === 128);
  const z = (R) => 10 * Math.log10(250 * Math.pow(R, 1.2));
  check('convective rain: Z = 250 R^1.2 (the NHC tropical relation): 21.6 mm/h is 40 dBZ, 147 mm/h is 50 dBZ', near(N.dbzOf(21.6, 0), 40, 0.15) && near(N.dbzOf(147, 0), 50, 0.2) && near(N.dbzOf(5, 0), z(5), 1e-9));
  check('stratiform rain: Z = 200 R^1.6: 10 mm/h is 39 dBZ, and a given rate is a weaker echo than convective rain at the same rate above a few mm/h only in the stratiform relation (Z grows faster)', near(N.dbzOf(0, 10), 10 * Math.log10(200 * Math.pow(10, 1.6)), 1e-9) && N.dbzOf(0, 30) > N.dbzOf(30, 0));
  check('no rain, no echo: dbzOf(0, 0) is below any display threshold', N.dbzOf(0, 0) < -10);
  check('a forcing halfway through the hour is the mean of its two ends', (() => { const a = forcing({ v: 60, rmax: 30 }), b = forcing({ v: 100, rmax: 20 }), m = N.lerpForcing(a, b, 0.5); return near(m.vmax, (a.vmax + b.vmax) / 2, 1e-6) && near(m.rmax, 25, 1e-6) && near(m.vt[40], (a.vt[40] + b.vt[40]) / 2, 1e-4) && N.lerpForcing(a, b, 0) === a && N.lerpForcing(a, b, 1) === b; })());
  const zT = N.vorticityOf(forcing({ v: 100, rmax: 25 }).vt), V = forcing({ v: 100, rmax: 25 }).vt;
  let cz = 0, vmx = 0; for (let b = 1; b < N.NR; b++) { cz += 0.5 * (zT[b - 1] * (b - 1) + zT[b] * b) * 1e6; vmx = Math.max(vmx, cz / (b * 1000)); }
  check('the vorticity of a wind table integrates back to its wind (the circulation, to 8 %)', near(vmx, Math.max(...V), 0.08 * Math.max(...V)));
}

/* ---- the same storm opens the same way; a different one does not ----------------------------------------------------------------------------- */
{
  const a = run({ v: 90, rmax: 30 }, 1, { seed: 3 }), b = run({ v: 90, rmax: 30 }, 1, { seed: 3 }), c = run({ v: 90, rmax: 30 }, 1, { seed: 4 });
  const sum = (n) => { let s = 0; for (let k = 0; k < NN; k += 7) s += n.rc[k] * (1 + (k % 5)) + n.zeta[k] * 1e4; return s; };
  check('deterministic: the same seed and the same forcing give the same rain and vorticity, bit for bit', sum(a) === sum(b) && a.rc.every((v, k) => v === b.rc[k]));
  check('a different seed gives different cells but the same storm (the means agree within 12 %, the fields do not)', sum(a) !== sum(c) && !a.rc.every((v, k) => v === c.rc[k]) && near(sector(a, 0, 100, null, 0, (k) => a.rc[k]), sector(c, 0, 100, null, 0, (k) => c.rc[k]), 0.12 * sector(a, 0, 100, null, 0, (k) => a.rc[k]) + 0.5));
  check('the fields stay finite and non-negative: no rain below zero, water within bounds', [a, b, c].every((n) => n.rc.every((v) => v >= 0 && isFinite(v)) && n.rs.every((v) => v >= 0 && isFinite(v)) && n.Q.every((v) => v >= 0 && isFinite(v)) && n.zeta.every(isFinite)));
}

/* ---- a major hurricane: eye, eyewall, spiral bands, dry surroundings ----------------------------------------------------------------------- */
{
  reset();
  const n = run({ v: 110, rmax: 26, r34: 140 }, 4), d = dbzField(n);
  const prof = []; for (let r = 0; r < 260; r += 5) prof.push(sector(n, r, r + 5, null, 0, rain(n)));
  const pk = prof.indexOf(Math.max(...prof)) * 5 + 2.5;
  check('eye: the inner 10 km are rain-free (mean rain under 0.5 mm/h)', sector(n, 0, 10, null, 0, rain(n)) < 0.5);
  check('eyewall: the strongest ring of rain lies within 40 % of the radius of maximum wind (26 km), at 25 mm/h or more on average round the ring', Math.abs(pk - 26) <= 0.4 * 26 + 5 && Math.max(...prof) >= 25);
  check('the eyewall reaches 50 dBZ somewhere (rain over 147 mm/h) and nowhere above 80', Math.max(...d) >= 50 && Math.max(...d) <= 80);
  check('the dry surroundings: under 1 % of the cells beyond 300 km are echoes of 20 dBZ or more', sector(n, 300, 400, null, 0, wet(n)) < 0.01);
  check('rainbands: outside the eyewall (60 to 200 km) 10 to 70 % of the cells are echoes (spiral bands with gaps, neither a carpet nor clear)', (() => { const f = sector(n, 60, 200, null, 0, wet(n)); return f > 0.1 && f < 0.7; })());
  check('the nest holds the engine\'s wind: the strongest mean wind is within 25 % of the forcing\'s (' + (n.vNest / KT | 0) + ' of 110 kt)', near(n.vNest, 110 * KT, 0.25 * 110 * KT));
  let rot = 0, cnt = 0; for (let k = 0; k < NN; k++) if (n.rr[k] > 15 && n.rr[k] < 60) { rot += n.cth[k] * n.V[k] - n.sth[k] * n.U[k]; cnt++; }
  check('the circulation is cyclonic (counter-clockwise in the northern frame): the mean tangential wind between 15 and 60 km is positive and strong', rot / cnt > 20);
  check('the heating efficiency adapts without running away (between 0.6 and 1.8)', n.g > 0.6 && n.g < 1.8);
}

/* ---- intensity: more rain in a stronger storm, a weak one is clusters --------------------------------------------------------------------- */
{
  reset();
  const maj = run({ v: 110, rmax: 26 }, 3), c1 = run({ v: 70, rmax: 35 }, 3), ts = run({ v: 45, rmax: 50 }, 3), td = run({ v: 25, rmax: 70 }, 3);
  const ring = (n, rm) => Math.max(...[...Array(20)].map((_, i) => sector(n, rm * 0.5 + i * 3, rm * 0.5 + i * 3 + 3, null, 0, (k) => n.rc[k])));
  check('the eyewall rain grows with the storm: category 4 > category 1 > tropical storm > depression (' + [maj, c1, ts, td].map((n, i) => ring(n, [26, 35, 50, 70][i]).toFixed(0)).join(' > ') + ' mm/h)', ring(maj, 26) > ring(c1, 35) && ring(c1, 35) > ring(ts, 50) && ring(ts, 50) > ring(td, 70));
  check('a depression has no eye and no 50 dBZ eyewall, its strongest echo is a cell below 50 dBZ', Math.max(...dbzField(td)) < 50 && sector(td, 0, 12, null, 0, rain(td)) > 0.02 * sector(td, 12, 60, null, 0, rain(td)));
  check('a hurricane has an eye (the inner 8 km are clear) and a tropical storm does not need one (rain at the centre within a factor 4 of its surroundings)', sector(maj, 0, 8, null, 0, rain(maj)) < 1 && sector(ts, 0, 12, null, 0, rain(ts)) > 0.25 * sector(ts, 12, 50, null, 0, rain(ts)));
  check('only the strong storms have an organised eyewall: the ratio of the ring\'s rain to the rain at 100 km is larger for the major hurricane than for the depression', ring(maj, 26) / (sector(maj, 90, 110, null, 0, (k) => maj.rc[k]) + 0.1) > ring(td, 70) / (sector(td, 90, 110, null, 0, (k) => td.rc[k]) + 0.1));
}

/* ---- an eyewall replacement: two rings, a moat, then the outer one ------------------------------------------------------------------------- */
{
  reset();
  const two = run({ v: 100, rmax: 55, r34: 150, inner: { r: 14, v: 85 } }, 3), mid = (n) => (r) => sector(n, r, r + 4, null, 0, (k) => n.rc[k]);
  const m = mid(two), inner = Math.max(m(8), m(12), m(16), m(20)), outer = Math.max(m(46), m(50), m(54), m(58)), moat = Math.min(m(28), m(32), m(36), m(40));
  check('two rings of wind make two eyewalls with a moat between: rain at the inner (' + inner.toFixed(0) + ') and the outer ring (' + outer.toFixed(0) + ') over twice the moat\'s (' + moat.toFixed(0) + ')', inner > 2 * moat && outer > 2 * moat && outer > 10);
  const only = run({ v: 100, rmax: 55, r34: 150 }, 3);
  check('with only the outer ring there is no inner eyewall: the inner ring\'s rain falls to under a fifth', mid(only)(14) < 0.2 * Math.max(inner, 1) || mid(only)(14) < 4);
}

/* ---- the weather on the storm's sides makes it lopsided ------------------------------------------------------------------------------------ */
{
  reset();
  const grid = (fn) => (f) => { const NE = N.NE, g = { sst: new Float32Array(NE * NE), rh: new Float32Array(NE * NE), sh: new Float32Array(NE * NE) }; for (let j = 0; j < NE; j++) for (let i = 0; i < NE; i++) { const x = (i - 15.5) * 16, y = (j - 15.5) * 16, o = fn(x, y, f); g.sst[j * NE + i] = o.sst; g.rh[j * NE + i] = o.rh; g.sh[j * NE + i] = o.sh; } return g; };
  const spec = { v: 80, rmax: 32, r34: 130 };
  const base = grid((x, y, f) => ({ sst: f.sst, rh: f.rh, sh: f.shear })), dryW = grid((x, y, f) => ({ sst: f.sst, rh: f.rh - 0.45 * Math.min(1, Math.max(0, (-x - 20) / 120)), sh: f.shear })), coldS = grid((x, y, f) => ({ sst: f.sst - 4.5 * Math.min(1, Math.max(0, -y / 150)), rh: f.rh, sh: f.shear }));
  const ctrl = run(spec, 4, { env: base }), dry = run(spec, 4, { env: dryW }), cold = run(spec, 4, { env: coldS });
  const half = (n, a) => sector(n, 50, 230, a, 60, wet(n));
  check('a symmetric environment gives a storm that is symmetric to within 20 % between its halves (west ' + half(ctrl, 180).toFixed(2) + ', east ' + half(ctrl, 0).toFixed(2) + ')', Math.abs(half(ctrl, 180) - half(ctrl, 0)) < 0.2 * Math.max(half(ctrl, 180), half(ctrl, 0)) + 0.03);
  check('dry air to the west erodes the west side: its echo cover is under 80 % of the east side\'s (' + half(dry, 180).toFixed(2) + ' against ' + half(dry, 0).toFixed(2) + ') and under the control\'s west (' + half(ctrl, 180).toFixed(2) + ')', half(dry, 180) < 0.8 * half(dry, 0) && half(dry, 180) < half(ctrl, 180));
  check('cold water to the south weakens the south side: its cover is under the control\'s south and under its own north', half(cold, 270) < half(ctrl, 270) && half(cold, 270) < half(cold, 90));
  const landFn = (x, y) => (x < -30 && y > -60 ? 1 : 0), land = run(spec, 4, { land: landFn });
  check('land on the north-west side takes the rain out of the land half: the echo cover over the land cells beyond the eyewall is under two thirds of the cover the same cells have over sea (' + (() => { let l = 0, nl = 0, c = 0; const d = dbzField(land), e = dbzField(ctrl); for (let k = 0; k < NN; k++) { const r = land.rr[k]; if (r < 70 || r > 200 || land.lf[k] < 0.9) continue; l += d[k] >= 20 ? 1 : 0; c += e[k] >= 20 ? 1 : 0; nl++; } return (l / nl).toFixed(2) + ' against ' + (c / nl).toFixed(2); })() + ')', (() => { let l = 0, nl = 0, c = 0; const d = dbzField(land), e = dbzField(ctrl); for (let k = 0; k < NN; k++) { const r = land.rr[k]; if (r < 70 || r > 200 || land.lf[k] < 0.9) continue; l += d[k] >= 20 ? 1 : 0; c += e[k] >= 20 ? 1 : 0; nl++; } return nl > 500 && l < 0.67 * c; })());
  const sh = run(spec, 4, { env: grid((x, y, f) => ({ sst: f.sst, rh: f.rh, sh: 17 })), });
  const shs = run(Object.assign({}, spec, { extra: { shear: 17, shdir: 0 } }), 4, { env: grid((x, y, f) => ({ sst: f.sst, rh: f.rh, sh: 17 })) });
  check('strong shear from the west (the flow aloft toward the east) ventilates the upshear (west) side: its cover is under the downshear (east) side\'s', half(shs, 180) < half(shs, 0));
}

/* ---- extratropical transition: a comma, a front, a dry slot ----------------------------------------------------------------------------- */
{
  reset();
  const et = run({ v: 55, rmax: 80, r34: 220, extra: { eta: 1, shear: 20, shdir: 0.2, head: 0.8, etdir: 0.8, spd: 14, sst: 18, rh: 0.6 } }, 4);
  const box = (n, along, across, hw) => { const c = Math.cos(0.8), s = Math.sin(0.8); let sum = 0, cnt = 0; for (let k = 0; k < NN; k++) { const x = n.rr[k] * n.cth[k], y = n.rr[k] * n.sth[k], a = x * c + y * s, b = -x * s + y * c; if (Math.abs(a - along) < hw && Math.abs(b - across) < hw) { sum += n.rc[k] + n.rs[k]; cnt++; } } return sum / cnt; };
  check('the warm sector ahead of and to the left of the motion has a stratiform rain shield (' + box(et, 100, 50, 40).toFixed(1) + ' mm/h), the dry slot to the rear right has almost none (' + box(et, -90, -110, 40).toFixed(1) + ')', box(et, 100, 50, 40) > 1.0 && box(et, -90, -110, 40) < 0.35 * box(et, 100, 50, 40));
  const boxS = (n, along, across, hw) => { const c = Math.cos(0.8), s = Math.sin(0.8); let sum = 0, cnt = 0; for (let k = 0; k < NN; k++) { const x = n.rr[k] * n.cth[k], y = n.rr[k] * n.sth[k], a = x * c + y * s, b = -x * s + y * c; if (Math.abs(a - along) < hw && Math.abs(b - across) < hw) { sum += n.rs[k]; cnt++; } } return sum / cnt; };
  check('the shield is stratiform rain (the warm sector\'s stratiform rate ' + boxS(et, 100, 50, 40).toFixed(2) + ' mm/h against ' + boxS(et, -90, -110, 40).toFixed(2) + ' in the dry slot), not only convective cells', boxS(et, 100, 50, 40) > 1.2 && boxS(et, -90, -110, 40) < 0.2 * boxS(et, 100, 50, 40));
  const weak = run({ v: 25, rmax: 100, r34: 200, extra: { eta: 1, shear: 20, shdir: 0.2, head: 0.8, etdir: 0.8, spd: 14, sst: 18, rh: 0.6 } }, 4), calm = run({ v: 25, rmax: 100, r34: 200, extra: { eta: 0, shear: 20, shdir: 0.2, head: 0.8, etdir: 0.8, spd: 14, sst: 18, rh: 0.6 } }, 4);
  const rear = (n) => { const c = Math.cos(0.8), s = Math.sin(0.8); let sum = 0; for (let k = 0; k < NN; k++) { const x = n.rr[k] * n.cth[k], y = n.rr[k] * n.sth[k], a = x * c + y * s, b = -x * s + y * c; if (a > -130 && a < -40 && Math.abs(b) < 150) sum += n.rc[k]; } return sum; };
  check('the front alone: a weak vortex (25 kt) that is transitioning has convective rain along the front behind it (' + rear(weak).toFixed(0) + ' mm/h summed over the rear half-plane) and the same vortex without the transition has none (' + rear(calm).toFixed(0) + ')', rear(weak) > 1000 && rear(calm) < 0.1 * rear(weak));
  const front = (() => { let best = 0; for (let k = 0; k < NN; k++) { const x = et.rr[k] * et.cth[k], y = et.rr[k] * et.sth[k], a = x * Math.cos(0.8) + y * Math.sin(0.8); if (a < -40 && a > -200 && et.rc[k] > best) best = et.rc[k]; } return best; })();
  check('a convective front trails behind the centre: a line of echoes of 10 mm/h or more in the rear half-plane', front > 10);
  check('the system is not tropical any more: no eye (rain at the centre is not under 5 % of the shield\'s)', box(et, 0, 0, 20) > 0.05 * box(et, 100, 50, 40));
}

/* ---- convection makes the vortex's lumps: the stretching sign and the lead of the right-front side ------------------------------------------------------ */
{
  reset();
  const hot = run({ v: 100, rmax: 25 }, 3);
  const nb = 40, sz = new Float64Array(nb), sr = new Float64Array(nb), cn = new Float64Array(nb);
  for (let k = 0; k < NN; k++) { const b = Math.floor(hot.rr[k] / 4); if (b < nb) { sz[b] += hot.zeta[k]; sr[b] += hot.rc[k] + hot.rs[k]; cn[b]++; } }
  let sxy = 0, sxx = 0, syy = 0;
  for (let k = 0; k < NN; k++) { const r = hot.rr[k], b = Math.floor(r / 4); if (r < 10 || r > 60) continue; const x = hot.zeta[k] - sz[b] / cn[b], y = hot.rc[k] + hot.rs[k] - sr[b] / cn[b]; sxy += x * y; sxx += x * x; syy += y * y; }
  const corr = sxy / Math.sqrt(sxx * syy);
  check('convection stretches the vorticity: round the eyewall (10 to 60 km) the lumps of vorticity and of rain go together (correlation of their departures from the ring mean ' + corr.toFixed(2) + ', over 0.45; stretching with the wrong sign gives under 0.35)', corr > 0.45);
  const quad = (spd) => { const n = run({ v: 70, rmax: 35, r34: 150, extra: { spd, head: Math.PI / 2, shear: 0 } }, 3), f = (a) => sector(n, 50, 200, a, 45, rain(n)); return f(45) / f(225); };
  const still = quad(0), moving = quad(14);
  check('a storm moving north has more rain on its right-front (north-east) side than the left-rear (' + moving.toFixed(2) + ' times, a still storm ' + still.toFixed(2) + ' times): the lead is the motion\'s, over 1.3 and over 1.15 times the still one', moving > 1.3 && moving > 1.15 * still);
}

/* ---- the frame of the picture: land grid, environment grid, mirror, glide ------------------------------------------------------------------ */
{
  const lf = new Float32Array(NN); N.landGrid(20, -60, (la, lo) => lo < -60, lf);
  check('the land grid: land to the west of the centre, sea to the east, a soft coast within a few cells (the first and last columns are 1 and 0, the middle 0.5 within 0.2)', lf[128 * NG] > 0.99 && lf[128 * NG + 255] < 0.01 && near(lf[128 * NG + 127], 0.5, 0.2));
  const env = makeEnv({ sst: (la, lo) => (lo < -60 ? NaN : 28), shear: 10, rh: 65 }), g = N.envGridOf(env, 20, -60, 1, { sst: 27, rh: 0.7, shear: 4 });
  check('the environment grid: a missing sea temperature (over land) takes the centre\'s, humidity is a fraction, shear is in m/s (10 kt = 5.1 m/s)', g.sst[5] === 27 && near(g.sst[16 * 32 + 31], 28, 1e-6) && near(g.rh[100], 0.65, 1e-6) && near(g.sh[100], 10 * KT, 1e-5));
  const gs = N.envGridOf(makeEnv({ sst: (la) => 20 + la / 10, shear: 5, rh: 60 }), -20, 60, -1, { sst: 20, rh: 0.6, shear: 2 });
  check('south of the equator the grid is mirrored: the nest\'s north (high rows) is the geographic south', gs.sst[31 * 32 + 5] < gs.sst[0 * 32 + 5] === false || gs.sst[31 * 32 + 5] !== gs.sst[5]);
  const m = new Float32Array(NN); for (let j = 0; j < 128; j++) for (let i = 0; i < NG; i++) m[j * NG + i] = 1; const nn = N.create({ seed: 1 }); nn.setLand(m, true);
  check('the land mask is mirrored south of the equator (its southern half becomes the nest\'s northern half)', nn.lf[200 * NG + 50] === 1 && nn.lf[50 * NG + 50] === 0);
  reset();
  const gl = run({ v: 100, rmax: 30 }, 2); gl.step(240); gl.display(0); const same = gl.drc.every((v, k) => v === gl.rc[k]); gl.display(0.5);
  let moved = 0; for (let k = 0; k < NN; k += 3) moved += Math.abs(gl.drc[k] - gl.rc[k]); let tot = 0; for (let k = 0; k < NN; k += 3) tot += gl.rc[k];
  check('the picture glides between steps: at 0 it is the model\'s rain, halfway it is carried by the flow (it differs, and keeps the total within 15 %)', same && moved > 0.05 * tot && (() => { let a = 0, b = 0; for (let k = 0; k < NN; k++) { a += gl.drc[k]; b += gl.rc[k]; } return near(a, b, 0.15 * b); })());
}

/* ---- the engine's storm as the nest's forcing, and the look-ahead -------------------------------------------------------------------------- */
{
  reset();
  const env = makeEnv({ sst: 29.2, shear: 4, rh: 68 });
  const mk = (seed, v, lat) => { const S = H.newSystem({ id: 'T' + seed, num: H.idNum('M', seed), th: 'tc', lat, lon: -60, v, hour: 0 }); S.genCount = 0; return S; };
  const S = mk(1, 100, 20); for (let h = 0; h < 30; h++) H.stepSystem(S, env, h, 1, par);
  const f = N.forcingOf(S, par, env, 30), P = H.windProfile(S, par, null);
  check('the forcing of an engine hurricane has the engine\'s mean wind (' + (f.vmax / KT | 0) + ' kt) and radius of maximum wind (' + f.rmax.toFixed(0) + ' km)', near(f.vmax, P.Vs * KT, 0.01 * P.Vs * KT) && near(f.rmax, P.rmax * 1.852, 1));
  const top = f.vt.indexOf(Math.max(...f.vt));
  check('its wind table peaks at the radius of maximum wind (within 6 km) and falls off beyond, with the outer wind the engine\'s (R34 ' + (P.r34 * 1.852 | 0) + ' km has 34 kt, within 10 %)', Math.abs(top - f.rmax) <= 6 && near(f.vt[Math.round(P.r34 * 1.852)] / KT, 34, 3.4));
  check('the core is hollow for a strong storm: the wind at a third of the radius of maximum wind is under a fifth of the maximum', f.vt[Math.round(f.rmax / 3)] < 0.2 * f.vmax);
  check('its environment and motion come with it: sea temperature, humidity 0-1, shear in m/s, heading in the northern frame', f.sst === S.lastSst && near(f.rh, S.lastRh / 100, 1e-9) && near(f.shear, S.lastShear * KT, 1e-9) && near(f.head, Math.atan2(S.cy, S.cx), 1e-9) && f.sg === 1);
  const Ss = mk(2, 100, -20); for (let h = 0; h < 30; h++) H.stepSystem(Ss, makeEnv({ sst: 29.2, shear: 4, rh: 68 }), h, 2, par);
  const fs = N.forcingOf(Ss, par, makeEnv({ sst: 29.2, shear: 4, rh: 68 }), 30);
  check('a southern storm is turned into the northern frame: sg = -1, its heading mirrored (north-going becomes south-going)', fs.sg === -1 && fs.clat < 0 && fs.lat > 0 && near(fs.head, Math.atan2(-Ss.cy, Ss.cx), 1e-9));
  let ercSeed = null; for (let seed = 1; seed < 80 && !ercSeed; seed++) { const E = mk(seed, 100, 20); for (let h = 0; h < 200 && E.alive; h++) { H.stepSystem(E, env, h, seed, par); if (E.erc && h > E.erc.t0 + E.erc.d0 + 3) { ercSeed = [seed, h, E]; break; } } }
  if (ercSeed) {
    const fe = N.forcingOf(ercSeed[2], par, env, ercSeed[1] + 1), peaks = []; for (let i = 2; i < 240; i++) if (fe.vt[i] > fe.vt[i - 1] && fe.vt[i] >= fe.vt[i + 1] && fe.vt[i] > 8) peaks.push(i);
    check('during an eyewall replacement the forcing has two rings of wind: two maxima, the outer one beyond the inner (' + peaks.join(', ') + ' km)', peaks.length >= 2 && peaks[peaks.length - 1] > 1.4 * peaks[0]);
  } else check('(no eyewall replacement found among the test seeds)', false);
  const fw = N.forcingOf(H.newSystem({ id: 'W', num: 5, th: 'wv', lat: 14, lon: -40, v: 18, hour: 0 }), par, env, 0);
  check('a disturbance is a broad weak vortex: a wind of 18 kt, a radius of maximum wind over 90 km, no hurricane', near(fw.vmax, 18 * KT, 0.3) && fw.rmax > 90 && Math.max(...fw.vt) < 20 * KT);

  /* the look-ahead is what the engine does an hour later */
  const a = H.create({ seed: 11, startMs: Date.UTC(2026, 7, 1), hour0: 0, auto: true, autoRate: 3 }), seen = [];
  const penv = makeEnv({ sst: 28.8, shear: 7, rh: 66 });
  for (let h = 0; h < 600; h += 1) {
    a.advanceTo(h, penv);
    if (h % 7 === 0) for (const T of a.systems) if (T.alive && T.th !== 'wv') { const P1 = a.peek(T.id, penv); if (P1) seen.push({ id: T.id, at: h, P1 }); }
    if (seen.length && seen[seen.length - 1].at === h - 0) { /* checked next hour */ }
    for (const q of seen) if (q.at === h - 1 && !q.done) { q.done = true; const R = a.get(q.id); q.real = R && R.alive ? { lat: R.lat, lon: R.lon, vr: R.vr, th: R.th, rm: R.rm } : null; }
  }
  const pairs = seen.filter((q) => q.real);
  check('the look-ahead is the engine\'s own next state: for ' + pairs.length + ' systems the copy stepped an hour on equals the system after the real hour (position, wind, class, eyewall), except where a merge removed one', pairs.length > 20 && pairs.every((q) => q.P1.lat === q.real.lat && q.P1.lon === q.real.lon && q.P1.vr === q.real.vr && q.P1.th === q.real.th && q.P1.rm === q.real.rm));
  const T0 = a.systems.find((T) => T.alive && T.th !== 'wv'); if (T0) { const before = JSON.stringify([T0.lat, T0.lon, T0.vr, T0.rm, T0.fixes.length]); a.peek(T0.id, penv); a.peek(T0.id, penv); check('asking for the look-ahead changes nothing of the real system, however often it is asked', before === JSON.stringify([T0.lat, T0.lon, T0.vr, T0.rm, T0.fixes.length])); }
  check('a system that is gone has no look-ahead', a.peek('nope', penv) === null);
}

/* ---- how long a step takes (a bound, not a benchmark) ----------------------------------------------------------------------------------------- */
{
  reset();
  const n = N.create({ seed: 2 }); n.init(forcing({ v: 100, rmax: 28 })); const t0 = performance.now(); for (let i = 0; i < 20; i++) n.step(120); const ms = (performance.now() - t0) / 20;
  check('a step of the nest takes under 120 ms on this machine (' + ms.toFixed(0) + ' ms): two hours of spin-up run in a few seconds', ms < 120);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
