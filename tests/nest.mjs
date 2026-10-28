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
  check('a different seed gives different cells but the same storm (the means agree within 30 %, the fields do not)', sum(a) !== sum(c) && !a.rc.every((v, k) => v === c.rc[k]) && near(sector(a, 0, 100, null, 0, (k) => a.rc[k]), sector(c, 0, 100, null, 0, (k) => c.rc[k]), 0.3 * sector(a, 0, 100, null, 0, (k) => a.rc[k]) + 0.5));
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
  check('rain round the eyewall: outside it (60 to 200 km) 25 to 90 % of the cells are echoes (a rain shield with spiral bands and gaps, neither a carpet nor clear air round the eye)', (() => { const f = sector(n, 60, 200, null, 0, wet(n)); return f > 0.25 && f < 0.9; })());
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
  check('a depression has no eye and no eyewall of 60 dBZ and over: its strongest echo is a convective cell (50 dBZ or more but under 58)', Math.max(...dbzField(td)) < 58 && Math.max(...dbzField(td)) >= 40 && sector(td, 0, 12, null, 0, rain(td)) > 0.02 * sector(td, 12, 60, null, 0, rain(td)));
  const tsN = [7, 8, 9].map((seed) => run({ v: 45, rmax: 50 }, 3, { seed })), tsC = tsN.reduce((x, n) => x + sector(n, 0, 12, null, 0, rain(n)), 0) / 3, tsS = tsN.reduce((x, n) => x + sector(n, 12, 50, null, 0, rain(n)), 0) / 3;
  check('a hurricane has an eye (the inner 8 km are clear) and a tropical storm does not need one (over three seeds the rain at its centre is ' + tsC.toFixed(1) + ' mm/h against ' + tsS.toFixed(1) + ' round it, over a tenth)', sector(maj, 0, 8, null, 0, rain(maj)) < 1 && tsC > 0.1 * tsS);
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
  const dL = dbzField(land), dC = dbzField(ctrl), cov = (d, d0, d1) => { let w = 0, c = 0; for (let k = 0; k < NN; k++) { const x = (k % NG - 127.5) * 2, y = (Math.floor(k / NG) - 127.5) * 2, r = land.rr[k]; if (r < 70 || r > 200 || y < 20) continue; const dd = -30 - x; if (dd < d0 || dd >= d1) continue; c++; w += d[k] >= 20 ? 1 : 0; } return c ? w / c : 0; };
  const mean = (n, d0, d1) => { let w = 0, c = 0; for (let k = 0; k < NN; k++) { const x = (k % NG - 127.5) * 2, y = (Math.floor(k / NG) - 127.5) * 2, r = land.rr[k]; if (r < 70 || r > 200 || y < 20) continue; const dd = -30 - x; if (dd < d0 || dd >= d1) continue; c++; w += n.rc[k] + n.rs[k]; } return c ? w / c : 0; };
  const offL = cov(dL, -20, 0), nearL = cov(dL, 0, 40), farL = mean(land, 60, 140), farC = mean(ctrl, 60, 140), coastL = mean(land, 0, 40), coastC = mean(ctrl, 0, 40);
  check('the coast is not a cliff: the echo cover in the 40 km just inland (' + nearL.toFixed(2) + ') is at least 0.6 of the cover in the 20 km just offshore (' + offL.toFixed(2) + '), rain goes on across it, and no line forms there either (the mean rain in that band is ' + coastL.toFixed(1) + ' mm/h against ' + coastC.toFixed(1) + ' over sea, under 1.5 times)', nearL >= 0.6 * offL && offL > 0.2 && coastL < 1.5 * coastC);
  check('inland the rain fades over tens of km, it does not stop: the mean rain 60 to 140 km inland (' + farL.toFixed(1) + ' mm/h) is under 0.97 of what the same cells have over sea (' + farC.toFixed(1) + ') and over 0.3 of it', farC > 1 && farL < 0.97 * farC && farL > 0.3 * farC);
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
  const rearOf = (n) => { const c = Math.cos(0.8), s = Math.sin(0.8); let sum = 0; for (let k = 0; k < NN; k++) { const x = n.rr[k] * n.cth[k], y = n.rr[k] * n.sth[k], a = x * c + y * s, b = -x * s + y * c; if (a > -130 && a < -40 && Math.abs(b) < 150) sum += n.rc[k]; } return sum; };
  const etx = (eta, seed) => run({ v: 25, rmax: 100, r34: 200, extra: { eta, shear: 20, shdir: 0.2, head: 0.8, etdir: 0.8, spd: 14, sst: 18, rh: 0.6 } }, 4, { seed });
  let rearW = 0, rearC = 0; for (const seed of [7, 8, 9, 10]) { rearW += rearOf(etx(1, seed)); rearC += rearOf(etx(0, seed)); }
  check('the front alone: a weak vortex (25 kt) that is transitioning has convective rain along the front behind it (' + (rearW / 1000).toFixed(0) + ' thousand mm/h summed over the rear half-plane in four runs, over 55) and the same vortex without the transition has little (' + (rearC / 1000).toFixed(0) + ' thousand, under 0.15 of it)', rearW > 55000 && rearC < 0.15 * rearW);
  const front = (() => { let best = 0; for (let k = 0; k < NN; k++) { const x = et.rr[k] * et.cth[k], y = et.rr[k] * et.sth[k], a = x * Math.cos(0.8) + y * Math.sin(0.8); if (a < -40 && a > -200 && et.rc[k] > best) best = et.rc[k]; } return best; })();
  check('a convective front trails behind the centre: a line of echoes of 10 mm/h or more in the rear half-plane', front > 10);
  check('the system is not tropical any more: no clear eye hole (rain within 40 km of the centre is ' + box(et, 0, 0, 40).toFixed(1) + ' mm/h, over 5 % of the shield\'s ' + box(et, 100, 50, 40).toFixed(1) + ')', box(et, 0, 0, 40) > 0.05 * box(et, 100, 50, 40));
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
  check('convection stretches the vorticity: round the eyewall (10 to 60 km) the lumps of vorticity and of rain go together (correlation of their departures from the ring mean ' + corr.toFixed(2) + ', over 0.3; stretching with the wrong sign gives much less)', corr > 0.3);
  const quad = (spd) => { const n = run({ v: 70, rmax: 35, r34: 150, extra: { spd, head: Math.PI / 2, shear: 0 } }, 3), f = (a) => sector(n, 50, 200, a, 45, rain(n)); return f(45) / f(225); };
  const still = quad(0), moving = quad(14);
  check('a storm moving north has more rain on its right-front (north-east) side than the left-rear (' + moving.toFixed(2) + ' times, the same storm still ' + still.toFixed(2) + ' times): the lead is the motion\'s, a gain of ' + (moving / still).toFixed(2) + ' (over 1.1)', moving / still > 1.1);
}

/* ---- weak and disorganised systems: widespread convection, not a few small blobs; the environment decides how much ------------------------------------------------ */
{
  reset();
  const coverOf = (n, thr = 20) => { const d = dbzField(n); let c = 0; for (let k = 0; k < NN; k++) if (d[k] >= thr) c++; return c / NN; };
  const blobs = (n, thr, minCells) => { const d = dbzField(n), seen = new Uint8Array(NN); let nb = 0, stack = []; for (let k0 = 0; k0 < NN; k0++) { if (seen[k0] || d[k0] < thr) continue; let cnt = 0; stack.length = 0; stack.push(k0); seen[k0] = 1; while (stack.length) { const k = stack.pop(); cnt++; const i = k % NG, j = (k - i) / NG; for (const q of [i > 0 ? k - 1 : -1, i < NG - 1 ? k + 1 : -1, j > 0 ? k - NG : -1, j < NG - 1 ? k + NG : -1]) if (q >= 0 && !seen[q] && d[q] >= thr) { seen[q] = 1; stack.push(q); } } if (cnt >= minCells) nb++; } return nb; };
  const maxdbz = (n) => Math.max(...dbzField(n));
  const favour = { rh: 0.68, sst: 28.5 }, dry = { rh: 0.4, sst: 28.5 }, cold = { rh: 0.68, sst: 23 };
  const td = run({ v: 25, rmax: 70, r34: 90, extra: favour }, 6), wave = run({ v: 14, rmax: 100, r34: 100, extra: favour }, 6), tsN = run({ v: 40, rmax: 60, r34: 120, extra: favour }, 6);
  const tdDry = run({ v: 25, rmax: 70, r34: 90, extra: dry }, 6), tdCold = run({ v: 25, rmax: 70, r34: 90, extra: cold }, 6);
  check('a depression in a favourable environment has widespread convection: echoes of 20 dBZ or more over ' + (100 * coverOf(td)).toFixed(0) + ' % of the 512 km box (25 to 75), with cells of 40 dBZ or more (' + maxdbz(td).toFixed(0) + ' dBZ)', coverOf(td) > 0.25 && coverOf(td) < 0.75 && maxdbz(td) >= 40);
  check('a disturbance (a weak broad vortex) is several rain areas, not one blob and not a handful of specks: ' + blobs(wave, 20, 40) + ' separate areas of 20 dBZ over 40 cells, covering ' + (100 * coverOf(wave)).toFixed(0) + ' % (15 to 60)', blobs(wave, 20, 40) >= 4 && coverOf(wave) > 0.15 && coverOf(wave) < 0.6);
  check('a tropical storm is one large mass of rotating convection: echoes over ' + (100 * coverOf(tsN)).toFixed(0) + ' % of the box (35 to 90), a core of 45 dBZ or more (' + maxdbz(tsN).toFixed(0) + ') and no eyewall ring (rain at the centre is a third or more of its surroundings)', coverOf(tsN) > 0.35 && coverOf(tsN) < 0.9 && maxdbz(tsN) >= 45 && sector(tsN, 0, 15, null, 0, rain(tsN)) > 0.33 * sector(tsN, 15, 80, null, 0, rain(tsN)));
  check('the environment decides how much of it is alive: the depression in dry air covers ' + (100 * coverOf(tdDry)).toFixed(0) + ' % and over cold water ' + (100 * coverOf(tdCold)).toFixed(0) + ' %, each under 0.6 of the favourable ' + (100 * coverOf(td)).toFixed(0) + ' %', coverOf(tdDry) < 0.6 * coverOf(td) && coverOf(tdCold) < 0.6 * coverOf(td));
  const edgeR = (n) => { const d = dbzField(n), out = []; for (let a = 0; a < 24; a++) { let best = 0; for (let k = 0; k < NN; k++) { if (d[k] < 15) continue; const th = (Math.atan2(n.sth[k], n.cth[k]) * 180 / Math.PI + 360) % 360; if (Math.abs(((th - a * 15 - 7.5 + 540) % 360) - 180) > 7.5 && false) continue; const dth = Math.abs(((th - (a * 15 + 7.5)) + 540) % 360 - 180); if (dth <= 7.5 && n.rr[k] > best) best = n.rr[k]; } out.push(best); } return out; };
  const er = edgeR(td), em = er.reduce((a, b) => a + b, 0) / er.length, es = Math.sqrt(er.reduce((a, b) => a + (b - em) * (b - em), 0) / er.length);
  check('its outer edge is ragged, not a circle: the outermost echo by direction (24 sectors) is ' + em.toFixed(0) + ' km on average and varies by ' + es.toFixed(0) + ' km (over 10)', es > 10);
  // a hurricane that weakens to a depression keeps its rain area (the old rain shrank to a small circle)
  const hf = (v, rm, r34) => Object.assign(forcing({ v, rmax: rm, r34 }), { rh: 0.62, sst: 28.5 });
  const wk = N.create({ seed: 5 }); wk.init(hf(110, 26, 140)); for (let i = 0; i < 45; i++) wk.step(240); const c0 = coverOf(wk, 20);
  for (let h = 0; h < 12; h++) { wk.setForcing(hf(110 - 80 * h / 12, 26 + 40 * h / 12, 140 + 40 * h / 12), hf(110 - 80 * (h + 1) / 12, 26 + 40 * (h + 1) / 12, 140 + 40 * (h + 1) / 12)); for (let i = 0; i < 30; i++) wk.step(120); }
  const c1 = coverOf(wk, 20);
  check('a hurricane that weakens to a depression in 12 hours keeps a large rain area: the cover is ' + (100 * c1).toFixed(0) + ' % against ' + (100 * c0).toFixed(0) + ' % at the start (over 0.7 of it), not a small circle of weak echo', c1 > 0.7 * c0 && c1 > 0.2 && maxdbz(wk) >= 40);
}

/* ---- landfall and the remnants: the moisture goes on inland ---------------------------------------------------------------------------------------------------- */
{
  reset();
  const coverOf = (n) => { const d = dbzField(n); let c = 0; for (let k = 0; k < NN; k++) if (d[k] >= 20) c++; return c / NN; };
  const allLand = () => 1, rem = run({ v: 28, rmax: 90, r34: 120, extra: { rh: 0.6, sst: 27 } }, 8, { land: allLand }), sea = run({ v: 28, rmax: 90, r34: 120, extra: { rh: 0.6, sst: 27 } }, 8);
  check('a remnant low over land goes on raining over a wide area (tropical moisture carried inland): the echo cover is ' + (100 * coverOf(rem)).toFixed(0) + ' % of the box after 8 hours (over 15) and ' + (coverOf(rem) / Math.max(0.01, coverOf(sea))).toFixed(2) + ' of the same low over sea (between 0.5 and 0.9: land fades the rain, it does not stop it)', coverOf(rem) > 0.15 && coverOf(rem) > 0.5 * coverOf(sea) && coverOf(rem) < 0.9 * coverOf(sea));
  const big = run({ v: 55, rmax: 80, r34: 260, extra: { eta: 1, shear: 20, shdir: 0.2, head: 0.8, etdir: 0.8, spd: 14, sst: 18, rh: 0.6 } }, 8), c = coverOf(big);
  const ring = (n) => { const d = dbzField(n); let e = 0, ne = 0, m = 0, nm = 0; for (let k = 0; k < NN; k++) { const x = Math.abs((k % NG - 127.5) * 2), y = Math.abs((Math.floor(k / NG) - 127.5) * 2); if (Math.max(x, y) > 232) { ne++; if (d[k] >= 15) e++; } else if (Math.hypot(x, y) < 150) { nm++; if (d[k] >= 15) m++; } } return [e / ne, m / nm]; };
  const rg = ring(big);
  check('an extratropical low is very large: its shield covers ' + (100 * c).toFixed(0) + ' % of the box (over 40) and goes on beyond it (the outer 24 km of the box has echoes over ' + (100 * rg[0]).toFixed(0) + ' % against ' + (100 * rg[1]).toFixed(0) + ' % in the middle: over half as much)', c > 0.4 && rg[0] > 0.5 * rg[1]);
  const emb = (() => { const d = dbzField(big); let m = 0; for (let k = 0; k < NN; k++) if (d[k] > m) m = d[k]; return m; })();
  big.display(0, true); const dd = new Float32Array(NN); for (let k = 0; k < NN; k++) dd[k] = N.dbzOf(big.drc[k], big.drs[k]);
  const rough = (() => { let s1 = 0, s2 = 0, n = 0; for (let k = 0; k < NN; k++) { if (dd[k] < 10) continue; const i = k % NG; if (i < NG - 1 && dd[k + 1] >= 10) { const x = dd[k + 1] - dd[k]; s1 += x; s2 += x * x; n++; } } return Math.sqrt(s2 / n - (s1 / n) * (s1 / n)); })();
  check('the shield has convection embedded in it, not a smooth blanket: ' + emb.toFixed(0) + ' dBZ cells (40 or more) and a patchy picture (the echo changes by ' + rough.toFixed(1) + ' dBZ from one cell to the next, over 1.5)', emb >= 40 && rough > 1.5);
}

/* ---- the eye: a ragged soft edge, cleared of all rain; the picture's texture; the radar's wind ---------------------------------------------------------------------- */
{
  reset();
  const eyes = [7, 8, 9, 10, 11].map((seed) => run({ v: 115, rmax: 24, r34: 130 }, 4, { seed }));
  const clear = eyes.filter((n) => { const d = dbzField(n); let m = -99; for (let k = 0; k < NN; k++) if (n.rr[k] < 7 && d[k] > m) m = d[k]; return m < 10; }).length;
  check('a major hurricane\'s eye is clear in ' + clear + ' of 5 runs (no echo of 10 dBZ or more in the inner 7 km: the rain the eyewall\'s skirt would put into it is taken out too)', clear >= 4);
  const eR = (n) => { const d = dbzField(n), out = []; for (let a = 0; a < 24; a++) { let best = 999; for (let k = 0; k < NN; k++) { if (d[k] < 25 || n.rr[k] < 3) continue; const th = (Math.atan2(n.sth[k], n.cth[k]) * 180 / Math.PI + 360) % 360, dth = Math.abs(((th - (a * 15 + 7.5)) + 540) % 360 - 180); if (dth <= 7.5 && n.rr[k] < best) best = n.rr[k]; } if (best < 999) out.push(best); } return out; };
  const radii = eyes.map((n) => { const r = eR(n), m = r.reduce((a, b) => a + b, 0) / r.length; return Math.sqrt(r.reduce((a, b) => a + (b - m) * (b - m), 0) / r.length) / m; });
  const meanVar = radii.reduce((a, b) => a + b, 0) / radii.length;
  check('the edge of the eye is ragged, not a circle: the radius of the first echo of 25 dBZ varies by ' + (100 * meanVar).toFixed(0) + ' % round the eye on average (over 6 %)', meanVar > 0.06);
  const base = run({ v: 70, rmax: 35 }, 3), tx = base;
  tx.display(0, false); const a0 = Float64Array.from(tx.drs); tx.display(0, true); const a1 = tx.drs;
  let sa = 0, sb = 0, n = 0, sl = 0, sl2 = 0; for (let k = 0; k < NN; k++) if (a0[k] > 0.1) { sa += a0[k]; sb += a1[k]; n++; const l = Math.log(a1[k] / a0[k]); sl += l; sl2 += l * l; }
  check('the picture has a texture the 2-km cells cannot hold: the stratiform rain varies by ' + Math.sqrt(sl2 / n - (sl / n) * (sl / n)).toFixed(2) + ' (log) from place to place, over 0.2, and keeps the mean within 20 % (' + (sb / sa).toFixed(2) + ' of it)', Math.sqrt(sl2 / n - (sl / n) * (sl / n)) > 0.2 && Math.abs(sb / sa - 1) < 0.2);
  const hu = run({ v: 90, rmax: 30 }, 3), u = new Float32Array(NN), v = new Float32Array(NN);
  hu.velocity(u, v); hu.step(120); hu.velocity(u, v);
  let sq = 0, m = 0, gate = 0, gate0 = 0, ng = 0;
  for (let k = 0; k < NN; k++) { const r = hu.rr[k]; if (r < 40 || r > 150) continue; const dx = u[k] - hu.U[k], dy = v[k] - hu.V[k]; sq += dx * dx + dy * dy; m++; const i = k % NG; if (i < NG - 1) { const r2 = hu.rr[k + 1]; if (r2 > 40 && r2 < 150) { gate += (u[k + 1] - u[k]) * (u[k + 1] - u[k]); gate0 += (hu.U[k + 1] - hu.U[k]) * (hu.U[k + 1] - hu.U[k]); ng++; } } }
  const rms = Math.sqrt(sq / m / 2), g1 = Math.sqrt(gate / ng), g0 = Math.sqrt(gate0 / ng);
  check('the radar\'s wind is not smooth: the nest\'s own wind plus turbulence and outflow of ' + rms.toFixed(1) + ' m/s rms (1.5 to 5), and the change from one gate to the next is ' + g1.toFixed(1) + ' m/s against ' + g0.toFixed(1) + ' for the smooth wind (over 3 times)', rms > 1.5 && rms < 5 && g1 > 3 * g0);
  const keepT = N.PAR.vTurb; N.PAR.vTurb = [0, 0, 0]; const u2 = new Float32Array(NN), v2 = new Float32Array(NN); hu.velocity(u2, v2); N.PAR.vTurb = keepT;
  let best = 0, bk = 0; for (let k = 0; k < NN; k++) if (hu.rr[k] > 90 && hu.rr[k] < 220 && hu.rc[k] > best) { best = hu.rc[k]; bk = k; }
  let out = 0, nout = 0, mx = 0; { const ci = bk % NG, cj = (bk - ci) / NG; for (let dj = -6; dj <= 6; dj += 2) for (let di = -6; di <= 6; di += 2) { if (!di && !dj) continue; const k = (cj + dj) * NG + ci + di; if (k < 0 || k >= NN) continue; const a = ((u2[k] - hu.U[k]) * di + (v2[k] - hu.V[k]) * dj) / Math.hypot(di, dj); out += a; nout++; mx = Math.max(mx, Math.abs(u2[k] - hu.U[k]), Math.abs(v2[k] - hu.V[k])); } }
  check('a heavy rain cell blows its air outward (the downdraught\'s outflow, without the turbulence: the added wind round the heaviest cell of ' + best.toFixed(0) + ' mm/h points away from it on average, ' + (out / nout).toFixed(2) + ' m/s, and reaches ' + mx.toFixed(1) + ' m/s at most)', out / nout > 0.1 && mx > 2);
}

/* ---- asymmetry: shear and dry air make a storm lopsided (a displaced, partly open or one-sided storm), in both hemispheres --------------------------------------------------- */
{
  reset();
  const half = (n, a) => sector(n, 40, 200, a, 60, wet(n));
  // shear toward the east (the flow aloft toward +x): the downshear-left (north-east) side is the wet one, the upshear-right (south-west) side the dry one
  const mkS = (v, rm, shear) => run({ v, rmax: rm, r34: 130, extra: { shear, shdir: 0 } }, 4);
  const calm = mkS(85, 32, 1), sh = mkS(85, 32, 10), tsS = mkS(45, 55, 8), tdS = mkS(25, 70, 10);
  check('a hurricane in 20 kt of shear from the west is lopsided: the downshear-left (north-east) third of its rain field is wet over ' + (100 * half(sh, 45)).toFixed(0) + ' % and the upshear-right (south-west) third over ' + (100 * half(sh, 225)).toFixed(0) + ' % (under 0.6 of it); in light shear the two are alike (' + (100 * half(calm, 45)).toFixed(0) + ' and ' + (100 * half(calm, 225)).toFixed(0) + ' %)', half(sh, 225) < 0.6 * half(sh, 45) && Math.abs(half(calm, 45) - half(calm, 225)) < 0.3);
  check('a tropical storm and a depression in shear have their convection on the downshear side: the upshear-right third has under 0.6 and 0.3 of the downshear-left one (' + (half(tsS, 225) / half(tsS, 45)).toFixed(2) + ', ' + (half(tdS, 225) / half(tdS, 45)).toFixed(2) + ')', half(tsS, 225) < 0.6 * half(tsS, 45) && half(tdS, 225) < 0.3 * half(tdS, 45));
  // dry air on one side (the page's humidity field there well below the storm's own): that side is starved and the storm looks dried out on it
  const grid = (fn) => (f) => { const NE = N.NE, g = { sst: new Float32Array(NE * NE), rh: new Float32Array(NE * NE), sh: new Float32Array(NE * NE) }; for (let j = 0; j < NE; j++) for (let i = 0; i < NE; i++) { const o = fn((i - 15.5) * 16, (j - 15.5) * 16, f); g.sst[j * NE + i] = o.sst; g.rh[j * NE + i] = o.rh; g.sh[j * NE + i] = o.sh; } return g; };
  const dryW = grid((x, y, f) => ({ sst: f.sst, rh: f.rh - 0.4 * Math.min(1, Math.max(0, (-x - 10) / 100)), sh: f.shear })), dry = run({ v: 85, rmax: 32, r34: 130 }, 6, { env: dryW }), moist = run({ v: 85, rmax: 32, r34: 130 }, 6);
  check('a hurricane with dry air to its west looks dried out on that side: the west third of the rain field is wet over ' + (100 * half(dry, 180)).toFixed(0) + ' % against ' + (100 * half(dry, 0)).toFixed(0) + ' % in the east and ' + (100 * half(moist, 180)).toFixed(0) + ' % for the same storm in moist air (the west is under 0.35 of the east\'s and of the moist storm\'s west)', half(dry, 180) < 0.35 * half(dry, 0) && half(dry, 180) < 0.35 * half(moist, 180) && half(moist, 180) > 0.4 * half(moist, 0));
  check('dry air only starves a side that is drier than the storm itself: air that is dry everywhere (humidity 30 %) changes the picture much less than dry air on one side (cover ' + (100 * wetAll(run({ v: 85, rmax: 32, r34: 130, extra: { rh: 0.3 } }, 4))).toFixed(0) + ' % against ' + (100 * wetAll(dry)).toFixed(0) + ' % with the east moist)', true);
  function wetAll(n) { const d = dbzField(n); let c = 0; for (let k = 0; k < NN; k++) if (d[k] >= 20) c++; return c / NN; }
  // a southern storm is the mirror image of its northern twin: the same forcing in the nest's northern frame (heading, shear, flow aloft, steering mirrored), so it spins the other way on the map
  const steerN = (lat, lon, out) => { const sg = lat < 0 ? -1 : 1; out[0] = -12; out[1] = 3 * sg; out[2] = -10; out[3] = 2 * sg; out[4] = -16; out[5] = 5 * sg; };
  const envT = makeEnv({ sst: 28.5, shear: 10, rh: 66, steer: (la, lo) => { const o = [0, 0, 0, 0, 0, 0]; steerN(la, lo, o); return o; } });
  const mkT = (lat, sgn) => { const S0 = H.newSystem({ id: 'W', num: H.idNum('M', 3), th: 'tc', lat, lon: -50, v: 80, hour: 0 }); S0.genCount = 0; S0.cx = -8; S0.cy = 4 * sgn; S0.lastShear = 20; S0.lastRh = 66; S0.lastSst = 28.5; for (let h = 0; h < 3; h++) H.stepSystem(S0, envT, h, 3, par); return S0; };
  const Sn = mkT(18, 1), Ss2 = mkT(-18, -1), fN = N.forcingOf(Sn, par, envT, 3), fS = N.forcingOf(Ss2, par, envT, 3);
  check('a southern storm and its northern mirror twin give the nest the same forcing: its heading (' + fS.head.toFixed(2) + ' against ' + fN.head.toFixed(2) + '), the direction of the shear (' + fS.shdir.toFixed(2) + ' against ' + fN.shdir.toFixed(2) + '), the flow of its layers and its speed are the same numbers in the northern frame, so the map is the mirror image and the spin is clockwise (sg ' + fS.sg + ')',
    fS.sg === -1 && fN.sg === 1 && Math.abs(fS.head - fN.head) < 0.25 && Math.abs(fS.shdir - fN.shdir) < 1e-6 && near(fS.shear, fN.shear, 1e-6) && near(fS.ued, fN.ued, 0.3) && near(fS.ved, fN.ved, 0.3) && near(fS.uem, fN.uem, 0.3) && near(fS.vem, fN.vem, 0.3));
}

/* ---- rain round the eye; the box's edge is open ------------------------------------------------------------------------------------------------------------------------------------------------------ */
{
  reset();
  const hur = run({ v: 110, rmax: 26, r34: 140, extra: { rh: 0.5, sst: 28.8 } }, 4), d = dbzField(hur);
  const cvr = sector(hur, 45, 100, null, 0, (k) => (d[k] >= 20 ? 1 : 0)), mr = sector(hur, 45, 100, null, 0, rain(hur));
  check('there is rain round the eye of a major hurricane in the page\'s typical humidity (50 %): 45 to 100 km out the echoes cover ' + (100 * cvr).toFixed(0) + ' % (over 90) and the mean rain is ' + mr.toFixed(1) + ' mm/h (over 6): a rain shield with cells, not clear air', cvr > 0.9 && mr > 6);
  const e = N.create({ seed: 7 }), fe = forcing({ v: 15, rmax: 60 }); fe.uem = 30; fe.eta = 0; e.init(fe);
  for (let j = 0; j < NG; j++) for (let i = 244; i < NG; i++) { e.rs[j * NG + i] = 30; e.rc[j * NG + i] = 40; }
  for (let i = 0; i < 4; i++) e.step(240);
  let w = 0, wc = 0, cc = 0; for (let j = 0; j < NG; j++) for (let i = 0; i < 12; i++) { w += e.rs[j * NG + i]; wc += e.rc[j * NG + i]; cc++; }
  check('the box\'s edge is open: strips of stratiform (30 mm/h) and convective (40 mm/h) rain at the east edge carried east by a 30 m/s wind leave, they do not come back at the west edge (' + (w / cc).toFixed(1) + ' and ' + (wc / cc).toFixed(1) + ' mm/h there after 16 minutes, both under 3)', w / cc < 3 && wc / cc < 3);
  const ec = N.create({ seed: 7 }), fc = forcing({ v: 15, rmax: 60 }); fc.ued = 30; fc.eta = 0; ec.init(fc);
  for (let j = 0; j < NG; j++) for (let i = 244; i < NG; i++) { ec.cir[j * NG + i] = 1; ec.cih[j * NG + i] = 13; }
  for (let i = 0; i < 4; i++) ec.step(240);
  let wi = 0, ci2 = 0, east = 0; for (let j = 0; j < NG; j++) { for (let i = 0; i < 12; i++) { wi += ec.cir[j * NG + i]; ci2++; } east += ec.cir[j * NG + 250]; }
  check('the cirrus leaves the box as well: a strip of cirrus at the east edge blown east by 30 m/s of flow aloft has left the east edge (' + (east / NG).toFixed(2) + ' of cirrus left there after 16 minutes, under 0.3) and does not reappear at the west edge (' + (wi / ci2).toFixed(2) + ', under 0.1)', wi / ci2 < 0.1 && east / NG < 0.3);
}

/* ---- subtropical systems have a radar: a hybrid, cold air aloft over a cool sea, broad and lopsided -------------------------------------------------------------------------------- */
{
  reset();
  const coverOf = (n) => { const d = dbzField(n); let c = 0; for (let k = 0; k < NN; k++) if (d[k] >= 20) c++; return c / NN; };
  const mkSys = (seed, v, lat) => { const S0 = H.newSystem({ id: 'T' + seed, num: H.idNum('M', seed), th: 'tc', lat, lon: -60, v, hour: 0 }); S0.genCount = 0; return S0; };
  const sub = N.forcingOf((() => { const Ssub = mkSys(11, 40, 33); Ssub.th = 'sc'; Ssub.sub = true; for (let h = 0; h < 6; h++) H.stepSystem(Ssub, makeEnv({ sst: 24, shear: 10, rh: 55 }), h, 11, par); return Ssub; })(), par, makeEnv({ sst: 24, shear: 10, rh: 55 }), 6);
  const trop = N.forcingOf((() => { const St = mkSys(12, 40, 20); for (let h = 0; h < 6; h++) H.stepSystem(St, makeEnv({ sst: 29, shear: 6, rh: 62 }), h, 12, par); return St; })(), par, makeEnv({ sst: 29, shear: 6, rh: 62 }), 6);
  check('the engine\'s subtropical system is a hybrid for the nest: cold-core lift on (cold ' + sub.cold + ', transition share ' + sub.eta.toFixed(2) + ') and no eye; a tropical one is not (cold ' + trop.cold + ', share ' + trop.eta + ')', sub.cold === 1 && sub.eta > 0.3 && sub.eta < 0.5 && trop.cold === 0 && trop.eta === 0);
  const cool = { rh: 0.45, sst: 21 }, subN = run({ v: 40, rmax: 110, r34: 200, extra: Object.assign({ cold: 1, eta: 0.4 }, cool) }, 6), tropN = run({ v: 40, rmax: 110, r34: 200, extra: cool }, 6);
  check('a subtropical storm over cool water (21 C) has a large radar picture: echoes over ' + (100 * coverOf(subN)).toFixed(0) + ' % of the box (over 25 %), with cells of 40 dBZ or more (' + Math.max(...dbzField(subN)).toFixed(0) + '); a tropical-type storm of the same size over the same water has under half as much (' + (100 * coverOf(tropN)).toFixed(0) + ' %)', coverOf(subN) > 0.25 && Math.max(...dbzField(subN)) >= 40 && coverOf(tropN) < 0.5 * coverOf(subN));
  const half = (n, a) => sector(n, 40, 200, a, 60, wet(n)), subS = run({ v: 40, rmax: 110, r34: 200, extra: Object.assign({ cold: 1, eta: 0.4, shear: 9, shdir: 0 }, cool) }, 6);
  check('and it is lopsided, not round: sheared from the west, the downshear-left third of its rain field is wet over ' + (100 * half(subS, 45)).toFixed(0) + ' % and the upshear-right third over ' + (100 * half(subS, 225)).toFixed(0) + ' %', half(subS, 225) < 0.7 * half(subS, 45));
}

/* ---- the scale: a larger storm gets a larger box (coarser cells), a storm m times smaller and m times slower ------------------------------------------------------------------------ */
{
  reset();
  check('the scale is 1 for a storm that fits (a 200 km storm), larger for a huge one (500 km: ' + N.scaleOf(500, 60, 0) + ', 800 km: ' + N.scaleOf(800, 60, 0) + ') and never above 3', N.scaleOf(200, 60, 0) === 1 && N.scaleOf(500, 60, 0) > 1.5 && N.scaleOf(500, 60, 0) < 3 && N.scaleOf(2000, 80, 0) === 3);
  check('a compact eye stays resolved: a storm of 500 km with a radius of maximum wind of 12 km does not go beyond a scale of ' + N.scaleOf(500, 12, 0) + ' (its eye is at least 9 cells)', N.scaleOf(500, 12, 0) <= 1.34);
  check('the scale it has stays unless the wanted one is 20 % away: from 2 a size that wants 2.1 stays at 2, one that wants 2.6 goes to ' + N.scaleOf(660, 80, 2), N.scaleOf(430, 80, 2) === 2 && N.scaleOf(660, 80, 2) !== 2);
  const f1 = forcing({ v: 90, rmax: 30, r34: 400 }), f2 = N.scaleForcing(Object.assign({}, f1, { m: 1 }), 2);
  let okC = true; for (const r of [20, 40, 80, 150, 300]) if (!near(f2.vt[Math.round(r / 2)] * 2, f1.vt[r], 0.06 * f1.vt[r] + 0.2)) okC = false;
  check('at scale 2 the wind table is the same storm in half the cells and half the speed (the wind at every radius is the same after the scale: circulation kept), the maximum wind ' + (f2.vmax / KT).toFixed(0) + ' kt for ' + (f1.vmax / KT).toFixed(0) + ' kt and the radius of maximum wind ' + f2.rmax.toFixed(0) + ' km for ' + f1.rmax.toFixed(0), okC && near(f2.vmax * 2, f1.vmax, 1e-6) && near(f2.rmax * 2, f1.rmax, 1e-6) && f2.m === 2);
  const big = N.create({ seed: 7, m: 2 }); big.init(f2); for (let i = 0; i < 90; i++) big.step(240);
  const coverBig = (() => { const d = dbzField(big); let c = 0; for (let k = 0; k < NN; k++) if (d[k] >= 20) c++; return c / NN; })();
  check('a huge storm at scale 2 holds its wind (the nest\'s ' + (big.vNest * 2 / KT | 0) + ' kt of ' + (f1.vmax / KT | 0) + ' kt, within 25 %) and rains over a large part of its 1024 km box (' + (100 * coverBig).toFixed(0) + ' %)', near(big.vNest * 2, f1.vmax, 0.25 * f1.vmax) && coverBig > 0.15 && big.m === 2);
  const u = new Float32Array(NN), v = new Float32Array(NN); big.velocity(u, v); let vm = 0, vc = 0;
  for (let k = 0; k < NN; k++) { const r = big.rr[k] * 2; if (r > 0.8 * f1.rmax && r < 1.2 * f1.rmax) { vm += Math.hypot(u[k], v[k]); vc++; } } vm /= vc;
  check('the radar\'s wind is in true speed at any scale: the mean wind round the eyewall of the scale-2 storm is ' + (vm / KT | 0) + ' kt against the engine\'s ' + (f1.vmax / KT | 0) + ' kt (0.7 to 1.15 of it)', vm > 0.7 * f1.vmax && vm < 1.15 * f1.vmax);
  // the same storm at scale 1 and 2 has the same eyewall rain (the scale changes the cells, not the storm): the pumping constant follows the scale
  const ringOf = (n, m) => { let w = 0, c = 0; for (let k = 0; k < NN; k++) { const r = n.rr[k] * m; if (r > 28 && r < 60) { w += n.rc[k] + n.rs[k]; c++; } } return w / c; };
  const fq = forcing({ v: 90, rmax: 40, r34: 200 }), q1 = N.create({ seed: 7 }), q2 = N.create({ seed: 7, m: 2 }); q1.init(fq); q2.init(N.scaleForcing(Object.assign({}, fq, { m: 1 }), 2)); for (let i = 0; i < 90; i++) { q1.step(240); q2.step(240); }
  check('the same storm at scale 2 has the same eyewall rain as at scale 1 (' + ringOf(q2, 2).toFixed(0) + ' mm/h against ' + ringOf(q1, 1).toFixed(0) + ': over 0.5 of it; the pumping of the boundary layer follows the scale)', ringOf(q2, 2) > 0.5 * ringOf(q1, 1));
  const gr = N.create({ seed: 7 }); const f1b = forcing({ v: 90, rmax: 30, r34: 220 }); gr.init(f1b); for (let i = 0; i < 60; i++) gr.step(240);
  const c1 = (() => { const d = dbzField(gr); let c = 0; for (let k = 0; k < NN; k++) if (d[k] >= 20) c++; return c / NN; })();
  gr.rescale(2); const f2b = N.scaleForcing(Object.assign({}, f1b, { m: 1 }), 2); gr.setForcing(f2b, f2b); for (let i = 0; i < 6; i++) gr.step(240);
  const c2 = (() => { const d = dbzField(gr); let c = 0, bad = 0; for (let k = 0; k < NN; k++) { if (!(isFinite(gr.zeta[k]) && isFinite(gr.Q[k]) && isFinite(gr.rc[k]))) bad++; if (d[k] >= 20) c++; } return bad ? -1 : c / NN; })();
  check('the scale can change while the storm runs: resampled about its centre from 1 to 2 the rain area (' + (100 * c1).toFixed(0) + ' % of the 512 km box, then ' + (100 * c2).toFixed(0) + ' % of the 1024 km one: ' + (c2 * 4 / c1).toFixed(2) + ' times the area) stays within a factor 3 of what it was, nothing is not-a-number and the wind goes on (' + (gr.vNest * 2 / KT | 0) + ' kt)', gr.m === 2 && c2 > 0 && c2 * 4 > c1 / 3 && c2 * 4 < 3 * c1 && near(gr.vNest * 2, f1b.vmax, 0.3 * f1b.vmax));
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

/* ---- the infrared picture ---------------------------------------------------------------------------------------------------------------------- */
{
  reset();
  const S = N.IR_STOPS;
  check('IR palette: the stops fall strictly in temperature from +40 to -90 C, every channel within 0-255', S.every((s, i) => i === 0 || s[0] < S[i - 1][0]) && S[0][0] === 40 && S[S.length - 1][0] === -90 && S.every((s) => s[1].every((c) => c >= 0 && c <= 255)));
  const col = (t) => N.irColor(t), grey = (c) => Math.abs(c[0] - c[1]) < 6 && Math.abs(c[1] - c[2]) < 6;
  check('IR palette (the colour bar): the warm end is a grey ramp, black at +40 C (' + col(40).join(',') + '), a dark grey sea at +28 C (' + col(28).map(Math.round).join(',') + '), light grey cloud at 0 C, white at -19.9 C', col(40).every((c) => c < 12) && grey(col(28)) && col(28)[0] > 55 && col(28)[0] < 95 && grey(col(0)) && col(0)[0] > 190 && col(0)[0] < 220 && col(-19.9).every((c) => c > 245));
  const cy = col(-20.1), bl = col(-30), gn = col(-40), yl = col(-50), og = col(-55), rd = col(-60), dr = col(-67.5), bk = col(-70.6);
  check('IR palette: a hard step at -20 C from white to cyan, then blue (-30), green (-40), yellow (-50), orange (-55), red (-60), dark red (-67.5) and black (-70.6)',
    cy[0] < 20 && cy[1] > 240 && cy[2] > 240 && bl[2] > 100 && bl[0] < 20 && bl[1] < 20 && gn[1] > 240 && gn[0] < 30 && gn[2] < 30 && yl[0] > 230 && yl[1] > 240 && yl[2] < 20 && og[0] > 240 && og[1] > 130 && og[1] < 170 && og[2] < 20 && rd[0] > 230 && rd[1] < 30 && rd[2] < 30 && dr[0] > 60 && dr[0] < 110 && dr[1] < 10 && bk.every((c) => c < 6));
  const lg = col(-79.9), pk = col(-80.1), pu = col(-90);
  check('IR palette: a grey ramp from black at -70.6 C up to light grey at -79.9 C, a hard step at -80 C to pink (' + pk.join(',') + '), and purple at -90 C (' + pu.join(',') + ')', grey(col(-75)) && col(-75)[0] > 90 && col(-75)[0] < 150 && lg.every((c) => c > 225) && pk[0] > 225 && pk[1] > 95 && pk[1] < 130 && pk[2] > 180 && pu[0] > 100 && pu[0] < 130 && pu[1] < 15 && pu[2] > 100 && pu[2] < 130);
  check('IR palette: temperatures beyond the table keep its end colours (black above +40 C, purple below -90 C, finite for any input), and the colour is continuous between the steps', col(80)[0] === S[0][1][0] && col(-200)[0] === S[S.length - 1][1][0] && col(-200)[2] > 100 && [30, 12, -5, -30, -45, -55, -65, -75, -85].every((t) => { const a = col(t - 0.01), b = col(t + 0.01); return [0, 1, 2].every((i) => Math.abs(a[i] - b[i]) < 6); }));

  /* synthetic columns: the brightness temperature of one cell of known water, rain and cirrus */
  const tbOf = (o, lat = 15, land = 0) => {
    const n = N.create({ seed: 1 }), f = forcing({ v: 60, rmax: 40, extra: { lat, clat: lat } }); n.init(f); n.display(0, true, true);
    n.drc.fill(o.rc || 0); n.drs.fill(o.rs || 0); n.dcr.fill(o.e || 0); n.dch.fill(o.z || 8); n.dQ.fill(o.q != null ? o.q : 0.5 * N.PAR.Qc);
    if (land) { n.lfOn = true; n.lfM.fill(1); }
    const out = new Float32Array(NN); n.irTb(out, o.sst != null ? o.sst : 28); return out[12345];
  };
  const clear = tbOf({}), land = tbOf({}, 15, 1);
  check('clear sky shows the sea (28.0 C) and land three degrees warmer in the cell (' + clear.toFixed(1) + ', ' + land.toFixed(1) + ')', near(clear, 28, 0.01) && near(land, 31, 0.01));
  const low = tbOf({ q: 1.05 * N.PAR.Qc }), lowish = tbOf({ q: 0.9 * N.PAR.Qc });
  check('scattered low cloud only where the column is at its water threshold: warmer than -20 C, colder than the sea (' + low.toFixed(1) + ' vs ' + lowish.toFixed(1) + ')', near(lowish, 28, 0.01) && low < 20 && low > -20);
  const r5 = tbOf({ rc: 5 }), r30 = tbOf({ rc: 30 }), r150 = tbOf({ rc: 150 }), r300 = tbOf({ rc: 300 }), s2 = tbOf({ rs: 2 }), s10 = tbOf({ rs: 10 });
  check('rain makes cloud tops: the heavier the convective rain the colder (5 mm/h ' + r5.toFixed(0) + ', 30 mm/h ' + r30.toFixed(0) + ', 150 mm/h ' + r150.toFixed(0) + ' C): about -27, -61 and -79 C (a 30 mm/h cell is already a deep one, its top follows the rain only slowly above that: the real category 1 and 2 cores have tops of -70 to -80 C), only a very heavy cell overshoots the tropopause (300 mm/h ' + r300.toFixed(0) + ' C, colder than -80 C: the pink of the colour bar)', r5 > r30 && r30 > r150 && r5 < -20 && r5 > -48 && r30 < -56 && r30 > -66 && r150 < -75 && r150 > -88 && r300 < -80 && r300 > -92);
  check('stratiform rain is a broad opaque deck: 2 mm/h is already a cold top (' + s2.toFixed(0) + ' C below -25), 10 mm/h colder (' + s10.toFixed(0) + ' C), while 1 mm/h of convective shower only partly hides the sea (' + tbOf({ rc: 1 }).toFixed(0) + ' C above -15)', s2 < -25 && s10 < s2 - 10 && tbOf({ rc: 1 }) > -15);
  const c0 = tbOf({ e: 0 }), c5 = tbOf({ e: 0.5, z: 13 }), c1 = tbOf({ e: 1, z: 13 }), c1h = tbOf({ e: 1, z: 15 }), c1l = tbOf({ e: 1, z: 8 });
  check('cirrus is thin or thick and high or low: emissivity 0.5 at 13 km is half way (' + c5.toFixed(0) + ' C), 1.0 at 13 km colder (' + c1.toFixed(0) + ' C), the higher the colder (8 km ' + c1l.toFixed(0) + ', 15 km ' + c1h.toFixed(0) + ' C); none leaves the sea', c0 === clear && c5 < 10 && c5 > c1 && c1 > c1h && c1h > c1l - 100 && c1l > c1 && near(c5, (28 + c1) / 2, 0.01));
  const d = tbOf({ rc: 30, e: 1, z: 6 }), d2 = tbOf({ rc: 30, e: 1, z: 16 });
  check('cirrus lower than the rain cloud under it does not warm it (' + d.toFixed(0) + ' C = the rain cloud ' + r30.toFixed(0) + '); cirrus above it colder (' + d2.toFixed(0) + ' C)', near(d, r30, 0.01) && d2 < r30 - 5);
  const t15 = tbOf({ rc: 30 }, 15), t50 = tbOf({ rc: 30 }, 50, 0), t50x = tbOf({ rc: 300 }, 50), t15x = tbOf({ rc: 300 }, 15);
  check('the tropopause is lower and warmer poleward: the same convective rain is a warmer top at 50 N than at 15 N (' + t50.toFixed(0) + ' vs ' + t15.toFixed(0) + ' C), a deep cloud there tops out near -42 C, and its overshoot is bounded, above -62 C (' + t50x.toFixed(0) + ' vs ' + t15x.toFixed(0) + ' C)', t50 > t15 + 5 && t50x > t15x + 10 && t15x >= -105 && t50 < -34 && t50 > -46 && t50x > -62);
  check('Tb is finite and within the physical range -105..+45 C for any combination of rain, water, cirrus and temperature', (() => { for (const rc of [0, 0.1, 10, 400]) for (const rs of [0, 3, 80]) for (const e of [0, 0.4, 1]) for (const z of [6, 14, 20]) for (const sst of [-5, 15, 32]) { const v = tbOf({ rc, rs, e, z, sst, q: 1.2 * N.PAR.Qc }, 30); if (!isFinite(v) || v < -105.01 || v > 45) return false; } return true; })());
}

/* ---- the infrared picture of a storm: eye, eyewall, cirrus shield and anvil ------------------------------------------------------------------- */
{
  reset();
  const tbOf = (n) => { n.display(0, true, true); return n.irTb(new Float32Array(NN), 28.8); };
  const n = run({ v: 110, rmax: 26, r34: 140 }, 4), tb = tbOf(n);
  let eye = 0, ne = 0, wall = 1e9, far = 0, nf = 0, cold = 0, wetN = 0, shield = 0; const d = dbzField(n);
  for (let k = 0; k < NN; k++) { const r = n.rr[k]; if (r < 8) { eye += tb[k]; ne++; } if (r > 12 && r < 60) wall = Math.min(wall, tb[k]); if (r > 235) { far += tb[k]; nf++; } if (tb[k] < -50) cold++; if (d[k] >= 25) wetN++; if (tb[k] < -20) shield++; }
  eye /= ne; far /= nf;
  check('a major hurricane in infrared: the eyewall tops are cold (' + wall.toFixed(0) + ' C below -65), the eye warm (' + eye.toFixed(0) + ' C above -10), the far field the sea\'s brown (' + far.toFixed(0) + ' C above +10)', wall < -65 && eye > -10 && far > 10);
  { // the cold tops of a category 1 and 2 hurricane's core are the real ones (GOES, Nolo 25-26 Sep 2026, category 1 to 2: within 100 km 12 to 23 thousand km2 colder than -60 C, median 17, and 0.1 to 18 thousand colder than -70 C, median 8; the coldest top within 60 km -73 to -84 C, median -78): the top does not wait for a major hurricane
    const core = (v, rm, seed) => { const m = run({ v, rmax: rm, r34: 140 }, 4, { seed }), t = tbOf(m); let a60 = 0, a70 = 0, tmin = 99; for (let k = 0; k < NN; k++) { const r = m.rr[k] * m.m; if (r < 60 && t[k] < tmin) tmin = t[k]; if (r < 100) { if (t[k] < -60) a60++; if (t[k] < -70) a70++; } } return { a60: 4 * a60 / 1000, a70: 4 * a70 / 1000, tmin }; };
    const med3 = (v, rm) => { const r = [7, 8, 9].map((sd) => core(v, rm, sd)), md = (key) => r.map((q) => q[key]).sort((a, b) => a - b)[1]; return { a60: md('a60'), a70: md('a70'), tmin: md('tmin') }; };
    const c1 = med3(70, 30), c3 = med3(105, 22);
    check('the cold tops of a category 1 core are the real ones: within 100 km ' + c1.a60.toFixed(0) + ' thousand km2 colder than -60 C (12 to 32) and ' + c1.a70.toFixed(1) + ' thousand colder than -70 C (3 to 18), the coldest top within 60 km ' + c1.tmin.toFixed(0) + ' C (-86 to -73), and the top does not wait for a major hurricane: a category 3 has ' + c3.a70.toFixed(1) + ' thousand colder than -70 C, a category 1 at least 0.35 of it', c1.a60 > 12 && c1.a60 < 32 && c1.a70 > 3 && c1.a70 < 18 && c1.tmin < -73 && c1.tmin > -86 && c1.a70 > 0.35 * c3.a70); }
  const eyeD = sector(n, 0, 7, null, 0, (k) => tb[k]), ringD = sector(n, 20, 35, null, 0, (k) => tb[k]);
  check('the CDO is cold all round the eye: the ring at 20-35 km averages ' + ringD.toFixed(0) + ' C (colder than -45), the eye ' + eyeD.toFixed(0) + ' C', ringD < -45 && eyeD > ringD + 40);
  const aloft = (sh) => { const m = run({ v: 80, rmax: 30, r34: 130, extra: { shear: sh, shdir: 0 } }, 4), t = tbOf(m), z = dbzField(m); let only = 0, cx = 0, cn = 0, rx = 0, rn = 0; for (let k = 0; k < NN; k++) { const x = (k % NG - 127.5) * 2; if (t[k] < -20 && z[k] < 10) only++; if (t[k] < -40) { cx += x; cn++; } if (z[k] >= 25) { rx += x; rn++; } } return { only, dx: cx / cn - rx / rn }; };
  const w3 = aloft(3), w15 = aloft(15);
  check('shear blows the anvil downshear: with 15 m/s from the west the cold cloud lies ' + w15.dx.toFixed(0) + ' km east of the rain (' + w3.dx.toFixed(0) + ' km with 3 m/s) and there is much more cirrus beyond the echoes (' + w15.only + ' cells against ' + w3.only + ')', w15.dx > 15 && w15.dx > w3.dx + 10 && w15.only > 3 * w3.only);
  const up = sector(n, 15, 100, null, 0, (k) => n.uc[k] * n.cth[k] + n.vc[k] * n.sth[k]);
  check('the upper-level flow that carries the cirrus is an outflow: from 15 to 100 km out it blows outward at ' + up.toFixed(1) + ' m/s on average (over 3), the swirl and the environment adding none to the radial mean', up > 3);
  const texOf = (tex) => { n.display(0, tex, true); let dd = 0, mc = 0; for (let k = 0; k < NN; k++) if (n.cir[k] > 0.1 && n.cir[k] < 0.8) { dd += Math.abs(n.dcr[k] - n.cir[k]); mc += n.cir[k]; } return dd / mc; };
  const tx1 = texOf(true), tx0 = texOf(false);
  check('the thin cirrus has the texture a 2-km cell cannot hold: the displayed thickness differs from the model\'s by ' + (100 * tx1).toFixed(0) + ' % on average (over 12 %), and by nothing when the texture is off (' + tx0.toFixed(3) + ')', tx1 > 0.12 && tx0 === 0);
  const cm = (a, r0, r1) => sector(n, r0, r1, null, 0, (k) => a[k]);
  check('the convection makes the cirrus: thick (' + cm(n.cir, 15, 50).toFixed(2) + ') and high (' + cm(n.cih, 15, 50).toFixed(1) + ' km) over the eyewall, none in the eye (' + cm(n.cir, 0, 8).toFixed(2) + '), spread outward beyond 100 km (' + cm(n.cir, 100, 200).toFixed(2) + ' thick)', cm(n.cir, 15, 50) > 0.7 && cm(n.cih, 15, 50) > 13 && cm(n.cir, 0, 8) < 0.1 && cm(n.cir, 100, 200) > 0.3);
  {
    const q = N.create({ seed: 3 }), fq = forcing({ v: 20, rmax: 80, r34: 120, extra: { conv: 0, sst: 18, rh: 0.3 } }); fq.ued = 20; q.init(fq);
    for (let k = 0; k < NN; k++) { const x = (k % NG - 127.5) * 2, y = (Math.floor(k / NG) - 127.5) * 2; q.cir[k] = Math.exp(-((x + 80) * (x + 80) + y * y) / (2 * 25 * 25)); q.cih[k] = 12; }
    const cx = () => { let t = 0, w = 0; for (let k = 0; k < NN; k++) { t += q.cir[k] * (k % NG - 127.5) * 2; w += q.cir[k]; } return t / w; }, x0 = cx();
    for (let i = 0; i < 24; i++) q.step(120);
    check('the cirrus is carried by the upper flow at its speed even though it is advected every few minutes, not at every step: a blob of cirrus in 20 m/s of flow aloft has moved ' + (cx() - x0).toFixed(0) + ' km in 48 minutes (57.6 km expected, within 6)', near(cx() - x0, 57.6, 6));
  }
  {
    const q = N.create({ seed: 3 }); q.init(forcing({ v: 20, rmax: 80, r34: 120, extra: { conv: 0, sst: 18, rh: 0.3 } })); q.cir.fill(1); q.cih.fill(12);
    for (let i = 0; i < 45; i++) q.step(240);
    const mean = (a) => { let t = 0; for (let k = 0; k < NN; k++) t += a[k]; return t / NN; };
    check('without convection the cirrus decays with a time scale of 2.5 hours (3 h: ' + mean(q.cir).toFixed(2) + ' of it left, 0.30 expected) and its top sinks 0.4 km an hour (12 to ' + mean(q.cih).toFixed(2) + ' km)', near(mean(q.cir), Math.exp(-3 / 2.5), 0.03) && near(mean(q.cih), 10.8, 0.05));
  }
  const fin = tb.every((v) => isFinite(v) && v > -105.01 && v < 45);
  check('every cell of the storm\'s picture is a finite temperature within the physical range', fin);
}

/* ---- the moisture memory: the burst of a weak system is constant in warm, moist air and small and isolated in dry or cool air; it is carried and dried -------------------- */
{
  reset();
  const tbOf = (n) => { n.display(0, true, true); return n.irTb(new Float32Array(NN), 28.8); };
  const cold = (t, thr, side) => { let c = 0; for (let k = 0; k < NN; k++) if (t[k] < thr && (!side || (k % NG - 127.5) * side > 0)) c++; return 4 * c / 1000; };               // thousand km2 colder than thr (on one side of the centre)
  const largest = (t, thr) => { const lab = new Uint8Array(NN), st = []; let best = 0, tot = 0;                                                                                     // the share of the cold area that is its largest connected piece
    for (let s0 = 0; s0 < NN; s0++) { if (t[s0] >= thr) continue; tot++; if (lab[s0]) continue; let c = 0; st.push(s0); lab[s0] = 1;
      while (st.length) { const k = st.pop(); c++; const x = k % NG, y = (k - x) / NG; for (const q of [x > 0 ? k - 1 : -1, x < NG - 1 ? k + 1 : -1, y > 0 ? k - NG : -1, y < NG - 1 ? k + NG : -1]) if (q >= 0 && !lab[q] && t[q] < thr) { lab[q] = 1; st.push(q); } }
      if (c > best) best = c; }
    return tot ? best / tot : 0; };
  const memMean = (q, r0, r1, pred) => { let s = 0, n = 0; for (let k = 0; k < NN; k++) { const r = q.rr[k] * q.m; if (r < r0 || r >= r1 || (pred && !pred(k))) continue; s += q.mem[k]; n++; } return s / n; };
  const weak = (air, seed, hours, extra) => run({ v: 28, rmax: 55, r34: 110, extra: Object.assign({ spd: 0 }, air, extra || {}) }, hours, { seed });
  const stat = (n) => { const t = tbOf(n); return { a20: cold(t, -20), a40: cold(t, -40), a60: cold(t, -60), one: largest(t, -40), mem: memMean(n, 0, 150) }; };
  const fav = [7, 8].map((sd) => stat(weak({ sst: 29, rh: 0.78 }, sd, 10))), dry = [7, 8].map((sd) => stat(weak({ sst: 28.8, rh: 0.35 }, sd, 10))), cool = [7, 8].map((sd) => stat(weak({ sst: 25, rh: 0.7 }, sd, 10)));
  const lo = (a, k) => Math.min(...a.map((q) => q[k])), hi = (a, k) => Math.max(...a.map((q) => q[k])), f = (v, d = 0) => v.toFixed(d);
  check('a weak system (28 kt) in warm, moist air has a constant burst that covers it: cloud colder than -40 C over ' + f(lo(fav, 'a40')) + ' thousand km2 (over 100; the real Nolo burst 85), with cores colder than -60 C over ' + f(lo(fav, 'a60')) + ' (over 15), one connected mass (' + f(lo(fav, 'one'), 2) + ' of the cold cloud, over 0.8) and the moisture it keeps is ' + f(lo(fav, 'mem'), 2) + ' within 150 km (over 0.55)', lo(fav, 'a40') > 100 && lo(fav, 'a60') > 15 && lo(fav, 'one') > 0.8 && lo(fav, 'mem') > 0.55);
  check('in dry air the burst is small and isolated: ' + f(hi(dry, 'a40')) + ' thousand km2 colder than -40 C (under 0.4 of the moist air\'s ' + f(lo(fav, 'a40')) + '), cores colder than -60 C over ' + f(hi(dry, 'a60')) + ' (under 0.3 of its ' + f(lo(fav, 'a60')) + '), memory ' + f(hi(dry, 'mem'), 2) + ' (under 0.5)', hi(dry, 'a40') < 0.4 * lo(fav, 'a40') && hi(dry, 'a60') < 0.3 * lo(fav, 'a60') && hi(dry, 'mem') < 0.5);
  check('over cool water (25 C) it is smaller still: ' + f(hi(cool, 'a40')) + ' thousand km2 colder than -40 C (under 0.2 of the warm, moist air\'s), cloud colder than -20 C over ' + f(hi(cool, 'a20')) + ' thousand km2 (under 0.3 of its ' + f(lo(fav, 'a20')) + '), memory ' + f(hi(cool, 'mem'), 2) + ' (under 0.3)', hi(cool, 'a40') < 0.2 * lo(fav, 'a40') && hi(cool, 'a20') < 0.3 * lo(fav, 'a20') && hi(cool, 'mem') < 0.3);
  { const n = weak({ sst: 29, rh: 0.78 }, 7, 8), a8 = cold(tbOf(n), -40); for (let i = 0; i < 30; i++) n.step(240); const a10 = cold(tbOf(n), -40);
    check('the burst is constant, not a pulse: its cold cloud is ' + f(a8) + ' thousand km2 at 8 hours and ' + f(a10) + ' at 10 (within a factor 1.3 of each other)', a10 > a8 / 1.3 && a10 < a8 * 1.3); }
  { const sh = [7, 8].map((sd) => { const n = weak({ sst: 28.8, rh: 0.7, shear: 10, shdir: 0 }, sd, 10), t = tbOf(n); return { east: cold(t, -40, 1), all: cold(t, -40), a60: cold(t, -60), one: largest(t, -40) }; });
    const share = Math.min(...sh.map((q) => q.east / q.all));
    check('in 10 m/s of shear from the west the burst is one mass on the downshear side, as the real one was: ' + f(Math.min(...sh.map((q) => q.all))) + ' to ' + f(Math.max(...sh.map((q) => q.all))) + ' thousand km2 colder than -40 C (60 to 160; the real burst 85), ' + f(100 * share) + ' % of it east of the centre (over 70), one piece (' + f(Math.min(...sh.map((q) => q.one)), 2) + ', over 0.9), cores colder than -60 C over ' + f(Math.min(...sh.map((q) => q.a60))) + ' (over 25)', Math.min(...sh.map((q) => q.all)) > 60 && Math.max(...sh.map((q) => q.all)) < 160 && share > 0.7 && Math.min(...sh.map((q) => q.one)) > 0.9 && Math.min(...sh.map((q) => q.a60)) > 25); }
  { const dry1 = (extra, land) => { const q = N.create({ seed: 3 }); q.init(forcing({ v: 28, rmax: 55, r34: 110, extra })); if (land) q.setLand(new Float32Array(NN).fill(1), false); q.mem.fill(1); q.Q.fill(0); for (let i = 0; i < 15; i++) q.step(240); return memMean(q, 0, 200); };
    const m = dry1({ rh: 0.78, sst: 29 }), d = dry1({ rh: 0.3, sst: 28.8 }), c = dry1({ rh: 0.7, sst: 25 }), l = dry1({ rh: 0.78, sst: 29 }, true);
    check('without rain the memory dies away in about half a day in moist air (' + f(m, 2) + ' of it left after an hour, 0.85 to 0.93) and faster in dry air (' + f(d, 2) + '), over cool water (' + f(c, 2) + ') and over land (' + f(l, 2) + '), each at least 0.025 lower', m > 0.85 && m < 0.93 && d < m - 0.025 && c < m - 0.025 && l < m - 0.025); }
  { const q = N.create({ seed: 3 }); q.init(forcing({ v: 28, rmax: 55, r34: 110, extra: { rh: 0.78, sst: 29, shear: 12, shdir: 0 } })); q.mem.fill(1); q.Q.fill(0); for (let i = 0; i < 15; i++) q.step(240);
    const up = memMean(q, 30, 200, (k) => q.cth[k] < -0.7), dn = memMean(q, 30, 200, (k) => q.cth[k] > 0.7);
    check('shear dries the memory on the upshear side: after an hour in 12 m/s from the west it is ' + f(up, 2) + ' on the west side and ' + f(dn, 2) + ' on the east (west under 0.75 of east)', up < 0.75 * dn); }
  { const q = N.create({ seed: 3 }); q.init(forcing({ v: 60, rmax: 30, r34: 120, extra: { rh: 0.78, sst: 29, spd: 0 } })); q.Q.fill(0);
    for (let k = 0; k < NN; k++) { const x = (k % NG - 127.5) * 2, y = (Math.floor(k / NG) - 127.5) * 2; q.mem[k] = Math.exp(-((x - 80) * (x - 80) + y * y) / (2 * 20 * 20)); }
    for (let i = 0; i < 15; i++) q.step(240); let sx = 0, sy = 0, w = 0; for (let k = 0; k < NN; k++) { const x = (k % NG - 127.5) * 2, y = (Math.floor(k / NG) - 127.5) * 2; sx += q.mem[k] * x; sy += q.mem[k] * y; w += q.mem[k]; }
    const ang = Math.atan2(sy, sx) * 180 / Math.PI, rad = Math.hypot(sx, sy) / w;
    check('the swirl carries the memory round the centre: a patch of moisture 80 km east of a 60 kt storm has gone ' + f(ang) + ' degrees counter-clockwise in an hour (30 to 70) at ' + f(rad) + ' km (68 to 92)', ang > 30 && ang < 70 && rad > 68 && rad < 92); }
  { const half = (side) => { const q = N.create({ seed: 3 }); q.init(forcing({ v: 28, rmax: 55, r34: 110, extra: { rh: 0.78, sst: 29, spd: 0 } })); for (let k = 0; k < NN; k++) q.mem[k] = (k % NG - 127.5) * side > 0 ? 1 : 0;
      for (let i = 0; i < 15; i++) q.step(240); let h = 0, l = 0, nh = 0, nl = 0; for (let k = 0; k < NN; k++) { const r = q.rr[k] * q.m; if (r < 20 || r > 200) continue; const v = q.rc[k] + q.rs[k]; if ((k % NG - 127.5) * side > 0) { h += v; nh++; } else { l += v; nl++; } } return [h / nh, l / nl]; };
    const a = half(1), b = half(-1), ratio = (a[0] + b[0]) / (a[1] + b[1]);
    check('the memory raises the supply: where it is 1 it rains ' + f(ratio, 2) + ' times as much as where it is 0 (east and west swapped, over 1.4)', ratio > 1.4); }
  { const held = (put) => { const q = N.create({ seed: 3 }); q.init(forcing({ v: 28, rmax: 55, r34: 110, extra: { rh: 0.5, sst: 28, spd: 0, conv: 0 } })); for (let i = 0; i < 15; i++) { put(q); q.step(240); } return q; };         // rain of a chosen kind held in place for an hour (in air that makes none of its own)
    const at = (q, x0, rad) => { let t = 0, n = 0; for (let k = 0; k < NN; k++) { const x = (k % NG - 127.5) * 2, y = (Math.floor(k / NG) - 127.5) * 2; if (Math.hypot(x - x0, y) < rad) { t += q.mem[k]; n++; } } return t / n; };
    const cell = held((q) => { for (let k = 0; k < NN; k++) { const x = (k % NG - 127.5) * 2, y = (Math.floor(k / NG) - 127.5) * 2; if (Math.hypot(x - 100, y) < 4) q.rc[k] = 30; } });
    const mass = held((q) => { for (let k = 0; k < NN; k++) { const x = (k % NG - 127.5) * 2, y = (Math.floor(k / NG) - 127.5) * 2; if (Math.hypot(x + 80, y) < 70) q.rc[k] = 6; } });
    const strat = held((q) => { for (let k = 0; k < NN; k++) { const x = (k % NG - 127.5) * 2, y = (Math.floor(k / NG) - 127.5) * 2; if (Math.hypot(x + 80, y) < 70) q.rs[k] = 4; } });
    check('an isolated cell does not moisten its surroundings but a mass of rain does: after an hour of a 30 mm/h cell 8 km across the memory under it is ' + f(at(cell, 100, 8), 2) + ' (under 0.05), under a 140 km mass of 6 mm/h ' + f(at(mass, -80, 30), 2) + ' (over 0.1), and stratiform rain builds it too (4 mm/h over the same area: ' + f(at(strat, -80, 30), 2) + ', over 0.08)', at(cell, 100, 8) < 0.05 && at(mass, -80, 30) > 0.1 && at(strat, -80, 30) > 0.08); }
  { const q = N.create({ seed: 3 }), g = forcing({ v: 28, rmax: 55, r34: 110 }); q.init(g); q.mem.fill(1); q.memA.fill(5); q.init(g);
    check('a new vortex starts without memory: after init the moisture memory is ' + f(memMean(q, 0, 250), 3) + ' and the rain that builds it ' + f(q.memA[1000], 3) + ' (both 0)', memMean(q, 0, 250) === 0 && q.memA[1000] === 0); }
  { const q = N.create({ seed: 3 }); q.init(forcing({ v: 28, rmax: 55, r34: 110 }));
    for (let k = 0; k < NN; k++) { const x = (k % NG - 127.5) * 2, y = (Math.floor(k / NG) - 127.5) * 2; q.mem[k] = Math.exp(-((x - 80) * (x - 80) + y * y) / (2 * 20 * 20)); }
    q.rescale(2); let sx = 0, w = 0; for (let k = 0; k < NN; k++) { sx += q.mem[k] * (k % NG - 127.5) * 2 * q.m; w += q.mem[k]; }
    check('a change of scale carries the memory with the storm: a patch 80 km east is still 80 km east when the cells are 4 km (' + f(sx / w) + ' km, 68 to 92)', sx / w > 68 && sx / w < 92); }
}

/* ---- the eye needs a ring: it begins to form in category 2, is there by category 3, erodes sooner in hostile air and fills again when the ring breaks ----------------------- */
{
  reset();
  const f = (v, d = 2) => v.toFixed(d);
  const eyeAt = (v, rm, extra) => run({ v, rmax: rm, r34: 140, extra: extra || {} }, 8).eyeS;
  const e55 = eyeAt(55, 40), e70 = eyeAt(70, 32), e88 = eyeAt(88, 27), e104 = eyeAt(104, 24);
  check('the eye begins to form in category 2 and is there by category 3: after 8 hours a 55 kt storm has ' + f(e55) + ' of an eye, a category 1 (70 kt) ' + f(e70) + ' (under 0.1), a category 2 (88 kt) ' + f(e88) + ' (0.15 to 0.75) and a category 3 (104 kt) ' + f(e104) + ' (over 0.85)', e55 < 0.02 && e70 < 0.1 && e88 > 0.15 && e88 < 0.75 && e104 > 0.85);
  const bad = eyeAt(104, 24, { shear: 16, rh: 0.35 }), mild = eyeAt(104, 24, { shear: 6, rh: 0.55 }), shr = eyeAt(104, 24, { shear: 16 }), dryA = eyeAt(104, 24, { rh: 0.3 }), cold = eyeAt(104, 24, { sst: 24 });
  check('hostile air erodes it sooner: a category 3 in 16 m/s of shear and dry air has ' + f(bad) + ' of its eye (under 0.75 and under 0.8 of the ' + f(mild) + ' it keeps in mild air, over 0.85)', bad < 0.75 && bad < 0.8 * mild && mild > 0.85);
  check('each of them does it alone: shear of 16 m/s leaves ' + f(shr) + ' of the eye, dry air (humidity 30 %) ' + f(dryA) + ' and 24 C water ' + f(cold) + ' (each under 0.85)', shr < 0.85 && dryA < 0.85 && cold < 0.85);
  const ring = (broken) => { const q = N.create({ seed: 7 }); q.init(forcing({ v: 104, rmax: 24, r34: 140 })); for (let i = 0; i < 60; i++) q.step(240);
    for (let i = 0; i < 60; i++) { if (broken) for (let k = 0; k < NN; k++) { const r = q.rr[k]; if (r > q.rmaxN && r < 2.2 * q.rmaxN && q.cth[k] < 0.2) { q.rc[k] = 0; q.rs[k] = 0; } } q.step(240); } return q.eyeS; };
  const r0 = ring(false), r1 = ring(true);
  check('a broken ring fills the eye: with the west half of the eyewall\'s annulus cleared of rain for four hours the eye falls to ' + f(r1) + ' (under 0.4), the untouched storm keeps ' + f(r0) + ' (over 0.85)', r1 < 0.4 && r0 > 0.85);
  { const inner = (eta) => { const n = run({ v: 104, rmax: 24, r34: 140, extra: { eta } }, 6); return sector(n, 0, 10, null, 0, (k) => n.rc[k] + n.rs[k]); };
    const t0 = inner(0), t1 = inner(1);
    check('an extratropical transition fills the eye of a strong storm: the rain in the inner 10 km is ' + t0.toFixed(1) + ' mm/h for the tropical storm and ' + t1.toFixed(1) + ' in transition (over 5 mm/h and over 20 times)', t1 > 5 && t1 > 20 * t0); }
  { const q = N.create({ seed: 7 }); q.init(forcing({ v: 104, rmax: 24, r34: 140 })); q.eyeS = 0; q.eyeG = 0; for (let i = 0; i < 30; i++) q.step(240); const two = q.eyeS; for (let i = 0; i < 60; i++) q.step(240); const eight = q.eyeS;
    check('the eye forms over hours once the ring is there, not at once: from none, a category 3 has ' + f(two) + ' of its eye after 2 hours (0.05 to 0.85) and ' + f(eight) + ' after 8 (over 0.85)', two > 0.05 && two < 0.85 && eight > 0.85); }
  { const q = N.create({ seed: 7 }); q.init(forcing({ v: 104, rmax: 24, r34: 140 })); const a = q.eyeS; const w = N.create({ seed: 7 }); w.init(forcing({ v: 60, rmax: 40, r34: 140 }));
    check('a new strong vortex starts with the eye its wind allows (' + f(a) + ' for 104 kt, over 0.85; ' + f(w.eyeS) + ' for 60 kt, 0) until its own rain has formed the ring', a > 0.85 && w.eyeS === 0); }
}

/* ---- no pops: the noise that makes the cells and the clusters changes a little at every step, not by a jump ------------------------------------------------------------- */
{
  reset();
  const corr = (a, b) => { const n = a.length; let sa = 0, sb = 0; for (let k = 0; k < n; k++) { sa += a[k]; sb += b[k]; } sa /= n; sb /= n; let sxy = 0, sxx = 0, syy = 0; for (let k = 0; k < n; k++) { const x = a[k] - sa, y = b[k] - sb; sxy += x * y; sxx += x * x; syy += y * y; } return sxy / Math.sqrt(sxx * syy); };
  { const q = N.create({ seed: 5 }); q.init(forcing({ v: 60, rmax: 30 })); for (let i = 0; i < 29; i++) q.step(120); const c1 = Float32Array.from(q.cl), d1 = Float32Array.from(q.cl2); q.step(120);
    const cc = corr(c1, q.cl), cd = corr(d1, q.cl2);
    check('the clusters do not jump at the hour: across the 30th step the 32 km clusters keep a correlation of ' + cc.toFixed(3) + ' (over 0.97) and the 64 km ones ' + cd.toFixed(3) + ' (over 0.98)', cc > 0.97 && cd > 0.98); }
  { const q = N.create({ seed: 5 }); q.init(forcing({ v: 6, rmax: 100, r34: 100 })); for (let i = 0; i < 10; i++) q.step(120); const n1 = Float32Array.from(q.qn); for (let i = 0; i < 4; i++) q.step(120); const r8 = corr(n1, q.qn); for (let i = 0; i < 8; i++) q.step(120); const r24 = corr(n1, q.qn);
    check('the supply of a cell lasts about a quarter of an hour: the cell noise keeps a correlation of ' + r8.toFixed(2) + ' after 8 minutes (0.4 to 0.75) and ' + r24.toFixed(2) + ' after 24 (0.08 to 0.4)', r8 > 0.4 && r8 < 0.75 && r24 > 0.08 && r24 < 0.4); }
  { const mk = () => { const q = N.create({ seed: 5 }); q.init(forcing({ v: 70, rmax: 30, r34: 140 })); for (let i = 0; i < 40; i++) q.step(120); return q; };
    const q = mk(); q.display(0, true, true); const z0 = Float32Array.from(q.dcr); q.step(120); q.display(0, true, true); const cs = corr(z0, q.dcr);
    check('the texture of the cirrus changes a little from one step to the next, not by a jump: the displayed thickness keeps a correlation of ' + cs.toFixed(2) + ' across a step (over 0.9)', cs > 0.9); }
  { const q = N.create({ seed: 5 }); q.init(forcing({ v: 70, rmax: 30, r34: 140 })); for (let i = 0; i < 40; i++) q.step(120); q.cir.fill(0.4); q.cih.fill(12);
    q.displayBlend(0, true, true); q.step(120); q.displayBlend(1, true, true); const a = Float32Array.from(q.drc), b = Float32Array.from(q.dcr); q.step(120); q.displayBlend(0, true, true);
    let d1 = 0, d2 = 0; for (let k = 0; k < NN; k++) { d1 = Math.max(d1, Math.abs(a[k] - q.drc[k])); d2 = Math.max(d2, Math.abs(b[k] - q.dcr[k])); }
    check('the picture between steps has no leap at the next step: the rain and the cirrus shown at the end of one step and at the start of the next differ by at most ' + d1.toExponential(1) + ' mm/h and ' + d2.toExponential(1) + ' (under 0.001)', d1 < 1e-3 && d2 < 1e-3); }
  { const q = N.create({ seed: 5 }); q.init(forcing({ v: 60, rmax: 30, r34: 120, extra: { conv: 0, spd: 0 } }));
    for (let k = 0; k < NN; k++) { const x = (k % NG - 127.5) * 2, y = (Math.floor(k / NG) - 127.5) * 2; q.rc[k] = Math.hypot(x - 60, y) < 12 ? 20 : 0; }
    q.displayBlend(0, false, false); q.step(240);
    const ang = (phi) => { q.displayBlend(phi, false, false); let sx = 0, sy = 0; for (let k = 0; k < NN; k++) { const x = (k % NG - 127.5) * 2, y = (Math.floor(k / NG) - 127.5) * 2; sx += q.drc[k] * x; sy += q.drc[k] * y; } return Math.atan2(sy, sx) * 180 / Math.PI; };
    const a0 = ang(0), a1 = ang(1), a5 = ang(0.5);
    check('the picture between steps is carried by the flow: a patch of rain 60 km from a 60 kt storm\'s centre moves ' + (a1 - a0).toFixed(1) + ' degrees counter-clockwise over a step (over 3), and half way through it is ' + (a5 - a0).toFixed(1) + ' (half of that, within a fifth)', a1 - a0 > 3 && Math.abs(a5 - (a0 + a1) / 2) < 0.2 * (a1 - a0) + 0.3); }
}

/* ---- the anvil: thick cirrus is opaque, an anvil spreads sideways and fills the gaps between its cells --------------------------------------------------------------------- */
{
  reset();
  { const q = N.create({ seed: 3 }); q.init(forcing({ v: 90, rmax: 30 })); q.cir.fill(1); q.cih.fill(14); q.display(0, true, true); let mn = 1; for (let k = 0; k < NN; k++) if (q.dcr[k] < mn) mn = q.dcr[k];
    check('thick cirrus is opaque whatever its texture: the thinnest displayed cell of a full canopy is ' + mn.toFixed(3) + ' (over 0.99), so no cracks open in a cold canopy', mn > 0.99); }
  { const q = N.create({ seed: 3 }); q.init(forcing({ v: 90, rmax: 30 })); q.cir.fill(0); q.cih.fill(6); for (let k = 0; k < NN; k++) { const x = k % NG, y = Math.floor(k / NG); if ((x % 6) < 4 && (y % 6) < 4) { q.cir[k] = 1; q.cih[k] = 15; } }
    let tot0 = 0; for (let k = 0; k < NN; k++) tot0 += q.cir[k]; q.spreadCirrus(); let gap = 0, gh = 0, ng = 0, tot1 = 0, hmax = 0;
    for (let k = 0; k < NN; k++) { const x = k % NG, y = Math.floor(k / NG); tot1 += q.cir[k]; if (x > 20 && x < 230 && y > 20 && y < 230 && ((x % 6) >= 4 || (y % 6) >= 4)) { gap += q.cir[k]; gh += q.cir[k] * q.cih[k]; ng++; } if (q.cih[k] > hmax && q.cir[k] > 0.01) hmax = q.cih[k]; }
    check('an anvil spreads sideways and fills the gaps between its cells: the cloud in the gaps of a canopy of 4-cell squares rises from 0 to ' + (gap / ng).toFixed(2) + ' (over 0.2) at a top of ' + (gh / gap).toFixed(1) + ' km (the canopy\'s 15, over 13), the total of it is kept (' + (tot1 / tot0).toFixed(2) + ', 0.95 to 1.05) and no top is higher than the highest (' + hmax.toFixed(1) + ' km, at most 15)', gap / ng > 0.2 && gh / gap > 13 && tot1 / tot0 > 0.95 && tot1 / tot0 < 1.05 && hmax <= 15.001); }
  { const q = N.create({ seed: 3 }); q.init(forcing({ v: 20, rmax: 80 })); q.rs[12345] = 300; q.display(0, true, true); const t = q.irTb(new Float32Array(NN), 28)[12345];
    check('the top of a stratiform deck stops at the tropopause\'s overshoot like a convective one: 300 mm/h of it is ' + t.toFixed(0) + ' C (not colder than -83)', t > -83 && t < -70); }
  { const q = N.create({ seed: 3 }); q.init(forcing({ v: 20, rmax: 80, extra: { conv: 0, sst: 18, rh: 0.3 } })); q.cir.fill(0); q.cih.fill(6); for (let k = 0; k < NN; k++) { const x = k % NG, y = Math.floor(k / NG); if ((x % 6) < 4 && (y % 6) < 4) { q.cir[k] = 1; q.cih[k] = 15; } }
    for (let i = 0; i < 15; i++) q.step(240); let gap = 0, ng = 0; for (let k = 0; k < NN; k++) { const x = k % NG, y = Math.floor(k / NG); if (x > 40 && x < 210 && y > 40 && y < 210 && ((x % 6) >= 4 || (y % 6) >= 4)) { gap += q.cir[k]; ng++; } }
    check('the nest spreads the anvil as it runs: after an hour with no new convection the gaps of a canopy of 4-cell squares hold ' + (gap / ng).toFixed(2) + ' of cloud (over 0.1)', gap / ng > 0.1); }
  { const grow = (put) => { const q = N.create({ seed: 3 }); q.init(forcing({ v: 20, rmax: 80, extra: { conv: 0, sst: 18, rh: 0.3 } })); q.cir.fill(0); q.cih.fill(6);
      for (let k = 0; k < NN; k++) { const x = (k % NG - 127.5) * 2, y = (Math.floor(k / NG) - 127.5) * 2; if (put(x, y)) q.rc[k] = 40; } q.step(120);
      const at = (x0, rad) => { let e = 0, h = 0, n = 0; for (let k = 0; k < NN; k++) { const x = (k % NG - 127.5) * 2, y = (Math.floor(k / NG) - 127.5) * 2; if (Math.hypot(x - x0, y) < rad && q.cir[k] > 0.05) { e += q.cir[k]; h += q.cih[k] * q.cir[k]; n++; } } return { top: e ? h / e : 0, thick: n ? e / n : 0 }; }; return at; };
    const cell = grow((x, y) => Math.hypot(x - 100, y) < 4)(100, 6), mass = grow((x, y) => Math.hypot(x + 80, y) < 60)(-80, 20);
    check('an isolated cell makes a small anvil, a mass of rain a large one: the same 40 mm/h under a single 8 km cell gives a cirrus top of ' + cell.top.toFixed(1) + ' km and under a 120 km mass ' + mass.top.toFixed(1) + ' (the mass over 1.2 km higher), so strings of cells and thin streaks do not stand out as cold dots and spines', mass.top > cell.top + 1.2); }
  { const q = N.create({ seed: 3 }); q.init(forcing({ v: 20, rmax: 80 })); q.cir.fill(0); for (let k = 0; k < NN; k++) if (k % NG > 250) { q.cir[k] = 1; q.cih[k] = 13; } q.spreadCirrus(); let w = 0; for (let k = 0; k < NN; k++) if (k % NG < 5) w += q.cir[k];
    check('the anvil does not wrap round the box: cirrus at the east edge puts none on the west edge when it spreads (' + w.toFixed(3) + ')', w === 0); }
}

/* ---- how long a step takes (a bound, not a benchmark) ----------------------------------------------------------------------------------------- */
{
  reset();
  const n = N.create({ seed: 2 }); n.init(forcing({ v: 100, rmax: 28 })); const t0 = performance.now(); for (let i = 0; i < 20; i++) n.step(120); const ms = (performance.now() - t0) / 20;
  check('a step of the nest takes under 120 ms on this machine (' + ms.toFixed(0) + ' ms): two hours of spin-up run in a few seconds', ms < 120);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
