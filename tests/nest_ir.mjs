// Node-only tests of the infrared picture against the real storms (docs/ir-research.md): the eye's warm floor, cloud fill and ramp, the cirrus canopy and its size, the smooth cold tops, the bursts of a weak storm, the stripping of a sheared one and the transition's
// shield (src/storm-nest.js). The older checks of the picture's physics (the palette, a column's temperature, the cirrus' transport) are in nest.mjs; the mutants of the new work run on this file alone.
import '../src/storm-cities.js';
import '../src/storms.js';
import '../src/storm-nest.js';
import { makeEnv } from './storms_env.mjs';
import { stats } from '../tools/ir_research/irstats.mjs';
import { readFileSync } from 'node:fs';

const H = globalThis.HFStorms, N = globalThis.HFNest;
H.calibrated(false);
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); if (process.env.HF_FAILFAST) process.exit(1); } }          // (HF_FAILFAST: the mutation harness stops at the first failure: that mutant is killed)
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

/* ---- the infrared picture against the real storms (docs/ir-research.md): eye, canopy, smooth tops, bursts, stripping, transition ---------------------------------------------- */
{
  reset();
  const tbOf = (n, sst = 28.8) => { n.display(0, true, true); return n.irTb(new Float32Array(NN), sst); };
  const radial = (n, tb, edges) => edges.slice(0, -1).map((a, i) => { let s = 0, c = 0; for (let k = 0; k < NN; k++) { const r = n.rr[k] * n.m; if (r >= a && r < edges[i + 1]) { s += tb[k]; c++; } } return c ? s / c : NaN; });
  const area = (n, tb, th) => { let c = 0; for (let k = 0; k < NN; k++) if (tb[k] < th) c++; return c * 4 * n.m * n.m; };
  const maj = run({ v: 115, rmax: 20, r34: 140 }, 4), Rm = maj.rmaxN;

  /* the eye: a warm floor below the sea, a cloud that fills it, a smooth ramp to the eyewall */
  maj.ef = 0; maj.efN = 0; const tbC = tbOf(maj);
  let eyeMax = -99, eyeMean = 0, ne = 0; for (let k = 0; k < NN; k++) if (maj.rr[k] < 0.3 * Rm) { eyeMean += tbC[k]; ne++; } eyeMean /= ne; for (let k = 0; k < NN; k++) if (maj.rr[k] < 1.5 * Rm && tbC[k] > eyeMax) eyeMax = tbC[k];
  check('a clear eye is warm but not the sea: ' + eyeMean.toFixed(1) + ' C at its centre (11 to 21 C, the real strong storms\') and nowhere above 22 C (' + eyeMax.toFixed(1) + ') under a sea of 28.8 C', eyeMean > 11 && eyeMean < 21 && eyeMax < 22);
  maj.ef = 1; maj.efN = 0; const tbF = tbOf(maj); let fillMean = 0; for (let k = 0; k < NN; k++) if (maj.rr[k] < 0.3 * Rm) fillMean += tbF[k]; fillMean /= ne;
  check('a cloud-filled eye is cool and white: ' + fillMean.toFixed(1) + ' C (between -25 and +5 C, colder than the clear eye by over 15)', fillMean < 5 && fillMean > -25 && fillMean < eyeMean - 15);
  { const ring = []; for (let r = 0; r <= 90; r += 2) ring.push(r); const rain2 = new Float32Array(NN); for (let k = 0; k < NN; k++) rain2[k] = maj.rc[k] + maj.rs[k];
    maj.ef = 0; const rp = radial(maj, rain2, ring), tp = radial(maj, tbOf(maj), ring), pk = Math.max(...rp), rRadar = ring[rp.findIndex((v) => v >= 0.5 * pk)], tmid = (tp[0] + Math.min(...tp)) / 2, rIr = ring[tp.findIndex((v) => v <= tmid)];
    check('the picture\'s eye is the radar\'s eye, not a larger one: the rain reaches half its eyewall\'s peak at ' + rRadar + ' km, the picture is half way from the eye\'s warmth to the eyewall\'s cold at ' + rIr + ' km (within 4 km of each other), both inside the radius of maximum wind (' + Rm.toFixed(0) + ' km)', Math.abs(rRadar - rIr) <= 4 && rIr < Rm && rRadar < Rm); }
  { let drop = 0; const pr = radial(maj, tbC, [0, 5, 10, 15, 20, 25, 30, 40, 50, 60]); for (let i = 1; i < 6; i++) drop = Math.max(drop, pr[i - 1] - pr[i]);
    check('the eye ends in a thin ring (the real eyewall\'s inner edge is a few km), not a cliff and not a ramp over two radii: the mean Tb by 5 km ring is ' + pr.slice(0, 6).map((v) => v.toFixed(0)).join(', ') + ' C, falling by ' + drop.toFixed(0) + ' C (30 to 75) in one ring and reaching the eyewall top (' + pr[7].toFixed(0) + ' C, below -50) by 40 km', drop > 30 && drop < 75 && pr[7] < -50 && pr[0] > 8); }
  { const eyeContrast = (v, rm) => { const n = N.create({ seed: 3 }); n.init(forcing({ v, rmax: rm, r34: 140 })); for (let i = 0; i < 60; i++) n.step(240); n.ef = 0; const tb = tbOf(n); let c = 0, cn = 0, o = 0, on = 0; for (let k = 0; k < NN; k++) { const r = n.rr[k]; if (r < 0.3 * n.rmaxN) { c += tb[k]; cn++; } else if (r > 1.0 * n.rmaxN && r < 1.6 * n.rmaxN) { o += tb[k]; on++; } } return c / cn - o / on; };
    const c1 = eyeContrast(75, 35), c2 = eyeContrast(90, 30), c3 = eyeContrast(105, 25);
    check('no eye at category 1, a ragged hint of one in category 2 and a clear one from category 3: the centre is ' + c1.toFixed(0) + ' C warmer than the eyewall\'s ring at 75 kt (under 12), ' + c2.toFixed(0) + ' at 90 kt (15 to 60: a dimple of cloud, not a clear eye) and ' + c3.toFixed(0) + ' at 105 kt (over 55)', c1 < 12 && c2 > 15 && c2 < 60 && c3 > 55); }
  { const mk = (ramp) => { const n = N.create({ seed: 3 }), f0 = forcing({ v: ramp ? 70 : 120, rmax: 28 }), f1 = forcing({ v: 120, rmax: 20 }); n.init(f0); n.setForcing(f0, f1); for (let i = 0; i < 90; i++) n.step(240); return n; };
    const ri = mk(true), st = mk(false);
    check('an eye fills with cloud during a rapid intensification and not in a steady storm: the fill is ' + ri.ef.toFixed(2) + ' after 6 hours of 70 to 120 kt against ' + st.ef.toFixed(2) + ' for 120 kt held (over 0.3 more)', ri.ef > st.ef + 0.3); }
  { const n = N.create({ seed: 2 }), f = forcing({ v: 100, rmax: 25 }); n.init(f); for (let i = 0; i < 20; i++) n.step(240); const base = tbOf(n).slice(); n.cur = Object.assign({}, n.cur, { eta: 0.6 }); const tb = tbOf(n); let d = 0; for (let k = 0; k < NN; k++) if (n.rr[k] < 20) d = Math.max(d, Math.abs(tb[k] - base[k]));
    check('a transitioning system has no eye in the picture: with the transition 0.6 along the picture\'s eye window is shut (the largest change within 20 km ' + d.toFixed(0) + ' C, a clear eye differs from the cloud round it by tens)', d > 8); }

  /* the canopy: a strong storm's cirrus shield reaches the edge of the box, in a size that follows the storm */
  const tbM = tbOf(maj), rp = radial(maj, tbM, [60, 80, 120, 150, 190, 230, 250]), a60 = area(maj, tbM, -60), a70 = area(maj, tbM, -70);
  check('the cirrus shield of a major hurricane reaches the box\'s edge: the mean Tb is ' + rp.map((v) => v.toFixed(0)).join(', ') + ' C at 70, 100, 135, 170, 210 and 240 km (the real storms: about -70, -66, -56, -43 and -28 C), under -20 C all the way out', rp[0] < -62 && rp[2] < -40 && rp[4] < -20 && rp[5] < -5);
  check('the cold areas are those of the real storms: ' + (a60 / 1000).toFixed(0) + ' thousand km2 colder than -60 C (35 to 110) and ' + (a70 / 1000).toFixed(0) + ' thousand colder than -70 C (2 to 45) in the 512 km box (the real majors: 45 to 108 and 15 to 37)', a60 > 35000 && a60 < 110000 && a70 > 2000 && a70 < 45000);
  { const mkS = (v, rm, r34, m) => { const n = N.create({ seed: 4, m }); let f = forcing({ v, rmax: rm, r34 }); if (m !== 1) f = N.scaleForcing(f, m); n.init(f); for (let i = 0; i < 60; i++) n.step(240); return n; };
    const cmp = mkS(100, 10, 65, 1), lrg = mkS(100, 45, 300, 2), rad = (n) => { const tb = tbOf(n), p = radial(n, tb, [0, 40, 80, 120, 160, 200, 260, 340, 440]); let i = 0; for (let q = 0; q < p.length; q++) if (p[q] < -40) i = q + 1; return i; };
    const rc2 = rad(cmp), rl = rad(lrg);
    check('the canopy follows the size of the storm: a compact storm (radius of maximum wind 10 km) keeps its cold cloud (colder than -40 C) within ' + [40, 80, 120, 160, 200, 260, 340, 440][Math.max(0, rc2 - 1)] + ' km, a large one (45 km, 300 km radius of 34 kt wind) out to ' + [40, 80, 120, 160, 200, 260, 340, 440][Math.max(0, rl - 1)] + ' km', rl >= rc2 + 2); }

  /* smooth cold tops: the real ones are smooth to a few tenths of a degree, the weak storms' a little rougher */
  const texr = (tb) => { const bm = new Float32Array(NN), hp = []; for (let j = 2; j < NG - 2; j++) for (let i = 2; i < NG - 2; i++) { let s = 0; for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) s += tb[(j + b) * NG + i + a]; bm[j * NG + i] = s / 25; if (s / 25 < -50) hp.push(tb[j * NG + i] - s / 25); }
    hp.sort((a, b) => a - b); const md = hp[hp.length >> 1], dv = hp.map((x) => Math.abs(x - md)).sort((a, b) => a - b); return hp.length > 400 ? 1.4826 * dv[dv.length >> 1] : null; };
  const grad = (tb) => { const g = []; for (let j = 2; j < NG - 2; j++) for (let i = 2; i < NG - 2; i++) { const k = j * NG + i; if (tb[k] < -50) g.push(Math.hypot(tb[k + 1] - tb[k - 1], tb[k + NG] - tb[k - NG]) / 2); } g.sort((a, b) => a - b); return g[g.length >> 1]; };
  const tH = texr(tbM), gH = grad(tbM);
  check('the cold tops are smooth: the robust spread of what is left after the 10 km mean is ' + tH.toFixed(2) + ' C (real hurricanes 0.27 to 0.56, the old picture 2 to 3) and the median step between neighbouring cells ' + gH.toFixed(2) + ' C (real 0.5 to 0.6, the old 2 to 2.7)', tH > 0.05 && tH < 0.6 && gH < 1.3);
  { const n = N.create({ seed: 7 }), f = forcing({ v: 28, rmax: 50, r34: 110, extra: { shear: 6.2, shdir: 0, sst: 28.5, rh: 0.68 } }); n.init(f); if (!n.bs.some((b) => b.t >= 0)) n.burstBirth(f, 14, 12, 1); for (let i = 0; i < 60; i++) n.step(240);
    const tbT = tbOf(n, 28.5), tT = texr(tbT);
    check('a weak storm\'s cold tops are rougher than a hurricane\'s but still smooth (' + (tT == null ? 'none' : tT.toFixed(2)) + ' C against ' + tH.toFixed(2) + ' C, under 1.0)', tT != null && tT >= tH * 0.8 && tT < 1.0); }
}

/* ---- bursts, stripping and the transition in the picture ------------------------------------------------------------------------------------------------------------------------ */
{
  reset();
  const tbOf = (n, sst = 28.5) => { n.display(0, true, true); return n.irTb(new Float32Array(NN), sst); };
  const tdOf = (sh, seed) => { const n = N.create({ seed }), f = forcing({ v: 28, rmax: 50, r34: 110, extra: { shear: sh, shdir: 0, sst: 28.5, rh: 0.68 } }); n.init(f); for (const b of n.bs) { b.t = -1; b.a = 0; } n.bf.fill(0); n.burstBirth(f, f.vmax, sh / KT, 0); const b = n.bs.find((x) => x.t >= 0); b.t = b.tg + 600; b.amp = 1; b.tm = 6 * 3600; for (let i = 0; i < 45; i++) n.step(240); return n; };
  const cold = (n, tb, th) => { let sx = 0, sy = 0, c = 0, cc = 0, cn = 0; for (let k = 0; k < NN; k++) if (tb[k] < th) { sx += n.rr[k] * n.cth[k]; sy += n.rr[k] * n.sth[k]; c++; if (n.rr[k] < 40) cn++; } for (let k = 0; k < NN; k++) if (n.rr[k] < 40) cc++; return { x: sx / c, y: sy / c, n: c, centre: cn / cc }; };
  const biggest = (tb, th) => { const seen = new Uint8Array(NN); let best = 0; for (let k0 = 0; k0 < NN; k0++) { if (seen[k0] || !(tb[k0] < th)) continue; let cnt = 0; const st = [k0]; seen[k0] = 1; while (st.length) { const k = st.pop(); cnt++; const i = k % NG, j = (k - i) / NG; for (const q of [i > 0 ? k - 1 : -1, i < NG - 1 ? k + 1 : -1, j > 0 ? k - NG : -1, j < NG - 1 ? k + NG : -1]) if (q >= 0 && !seen[q] && tb[q] < th) { seen[q] = 1; st.push(q); } } best = Math.max(best, cnt); } return best * 4; };
  const sh = tdOf(15, 7), tbS = tbOf(sh), cs = cold(sh, tbS, -40), cal = tdOf(0.8, 7), cc = cold(cal, tbOf(cal), -40);
  check('a depression rains in a burst downshear of a bare swirl: with 29 kt of westerly shear (storm-centred: the air that strips a depression) the cold cloud (colder than -40 C) is centred ' + cs.x.toFixed(0) + ' km east of the centre (over 70), and less than half of the cells within 40 km of the swirl are cold (' + (100 * cs.centre).toFixed(0) + ' %)', cs.x > 70 && cs.centre < 0.5);
  check('the burst is one coherent mass: the largest connected area colder than -40 C is ' + (biggest(tbS, -40) / 1000).toFixed(0) + ' thousand km2 (over 8 thousand: 100 km across and more), and a calm depression\'s burst sits nearer its centre (' + Math.hypot(cc.x, cc.y).toFixed(0) + ' km against ' + Math.hypot(cs.x, cs.y).toFixed(0) + ')', biggest(tbS, -40) > 8000 && Math.hypot(cc.x, cc.y) < Math.hypot(cs.x, cs.y));
  { const n = N.create({ seed: 5 }), f = forcing({ v: 25, rmax: 60, r34: 100, extra: { rh: 0.68 } }); n.init(f); for (const b of n.bs) { b.t = -1; b.a = 0; } n.bSince = 0; n.burstBirth(f, f.vmax, 4, 0); const b = n.bs.find((x) => x.t >= 0); b.tg = b.tm = b.td = 3600; b.amp = 1; const a = [];
    for (let i = 0; i < 46; i++) { n.burstStep(n.forcingAt(n.t), 240); n.t += 240; if (i === 7 || i === 22 || i === 38) a.push(b.a); }
    check('a burst has a life cycle: it grows (amplitude ' + a[0].toFixed(2) + ' half way up its first hour), is mature (' + a[1].toFixed(2) + ') and decays (' + a[2].toFixed(2) + ' in its last hour), and is gone after three hours (' + (b.t < 0 ? 'freed' : 'still there') + ')', a[0] > 0.2 && a[0] < 0.8 && a[1] > 0.95 && a[2] < 0.7 && a[2] > 0.05 && b.t < 0); }
  check('bursts are born mostly in the local night: the diurnal factor of the birth is ' + N.diurnal(1.5).toFixed(2) + ' at 01:30 and ' + N.diurnal(13.5).toFixed(2) + ' at 13:30 (over 1.8 times as much), and never zero (' + N.diurnal(13.5).toFixed(2) + ')', N.diurnal(1.5) > 1.8 * N.diurnal(13.5) && N.diurnal(13.5) > 0.3);
  const maj = run({ v: 115, rmax: 20, r34: 140 }, 2);
  check('a hurricane makes no bursts: the weak-storm weight is ' + maj.wkB.toFixed(2) + ' (under 0.05) and no burst is alive', maj.wkB < 0.05 && !maj.bs.some((b) => b.t >= 0));

  /* shear and dry air strip the convection to one side, but slowly (hours to a day, not at once) and a strong storm resists: a hurricane in hostile air keeps its eye and a ragged core for a day, a weak storm is left a bare swirl */
  const stripRun = (shear, rh, hours, dv, v0 = 105) => { const n = N.create({ seed: 6 }); const fa = (h) => forcing({ v: h < 2 ? v0 : Math.max(20, v0 - dv * (h - 2)), rmax: 18, r34: 140, extra: { shear: h < 2 ? 2.5 : shear, rh: h < 2 ? 0.6 : rh, shdir: 0.8, sst: 28.5, lat: 21 } }); n.init(fa(0));
    const out = {}; for (let h = 0; h < hours; h++) { n.setForcing(fa(h), fa(h + 1)); for (let i = 0; i < 15; i++) n.step(240); const key = h === 7 ? 'early' : h === 11 ? 'mid' : h === hours - 1 ? 'late' : null;
      if (key) { const tb = tbOf(n); let c60 = 0, c40 = 0, cn = 0, cm = 0; for (let k = 0; k < NN; k++) { if (tb[k] < -60) c60++; if (tb[k] < -40) c40++; if (n.rr[k] < 60) { cm++; if (tb[k] < -40) cn++; } } out[key] = { a60: c60 * 4, a40: c40 * 4, cover: cn / cm, strip: n.strip, alive: n.bs.some((b) => b.t >= 0), bSince: n.bSince, ef: n.ef, g: n.g }; } } return { n, out }; };
  const s1 = stripRun(16, 0.4, 30, 1.5), s0 = stripRun(2.5, 0.6, 30, 0), sH = stripRun(15, 0.4, 30, 0, 90), sT = stripRun(16, 0.4, 30, 0, 60), sC = stripRun(2.5, 0.6, 30, 0, 60);
  const e1 = s1.out.early, l1 = s1.out.late, e0 = s0.out.early, l0 = s0.out.late;
  check('hostile air takes a hurricane\'s convection slowly: after 6 hours of 31 kt of shear in dry air the strip state is ' + e1.strip.toFixed(2) + ' (under 0.45) and the area colder than -60 C is ' + (e1.a60 / 1000).toFixed(0) + ' thousand km2 against ' + (e0.a60 / 1000).toFixed(0) + ' in calm air (over 0.35 of it); after 28 hours (the storm down to 60 kt) the strip state is ' + l1.strip.toFixed(2) + ' (over 0.7) and it is ' + (l1.a60 / 1000).toFixed(1) + ' thousand (under 0.1 of the calm storm\'s ' + (l0.a60 / 1000).toFixed(0) + ')', e1.strip < 0.45 && e0.strip < 0.05 && e1.a60 > 0.35 * e0.a60 && l1.strip > 0.7 && l1.a60 < 0.1 * l0.a60);
  const lH = sH.out.late;
  check('a category 2 held at its wind in hostile air (30 kt of shear, dry) does not lose its picture: after 28 hours the strip state is ' + lH.strip.toFixed(2) + ' (under 0.8, a strong storm resists), the cloud colder than -40 C is ' + (lH.a40 / 1000).toFixed(0) + ' thousand km2 (over 0.45 of the calm hurricane\'s ' + (l0.a40 / 1000).toFixed(0) + ') and the area colder than -60 C ' + (lH.a60 / 1000).toFixed(0) + ' thousand (over 8)', lH.strip < 0.8 && lH.a40 > 0.45 * l0.a40 && lH.a60 > 8000);
  const m1 = s1.out.mid;
  check('no new burst for half a day after the stripping begins: none is alive at hour 12 of it, and the next one waits (' + (m1.bSince / 3600).toFixed(1) + ' h on a clock that started at -12 h when the strip passed 0.25 and needs 7)', !m1.alive && m1.bSince < 7 * 3600);
  check('the eye of a stripped storm is clouded over (the fill is ' + s1.n.ef.toFixed(2) + ', over 0.8; ' + s0.n.ef.toFixed(2) + ' for the same storm in calm air)', s1.n.ef > 0.8 && s0.n.ef < 0.6);
  check('a stripped weak storm held at its wind does not make up for it with heating: the efficiency is ' + sT.n.g.toFixed(2) + ' (under 1.5; ' + sC.n.g.toFixed(2) + ' for the same storm in calm air, over 0.3 more) in a strip state of ' + sT.n.strip.toFixed(2), sT.n.strip > 0.8 && sT.n.g < 1.5 && sT.n.g < sC.n.g - 0.3);

  /* the transition: the cold convection goes, the shield stays, fine streaks along the flow, a dry slot */
  const etF = (eta, lat, sst, v) => forcing({ v, rmax: 90, r34: 220, extra: { eta, lat, clat: lat, sst, shear: 20, shdir: 0.7, head: 0.9, etdir: 0.9, spd: 14, rh: 0.6 } });
  const et = N.create({ seed: 7 }); et.init(etF(1, 42, 16, 60)); for (let i = 0; i < 60; i++) et.step(240);
  const tr = N.create({ seed: 7 }); tr.init(etF(0, 18, 28.8, 60)); for (let i = 0; i < 60; i++) tr.step(240);
  const tbE = tbOf(et, 16), tbR = tbOf(tr, 28.8), ar = (tb, th) => { let c = 0; for (let k = 0; k < NN; k++) if (tb[k] < th) c++; return c * 4; };
  check('a post-tropical system makes no bursts (the weak-storm weight is ' + et.wkB.toFixed(2) + ', under 0.05): its shield, front and dry slot are the transition\'s own', et.wkB < 0.05);
  check('after a transition the cold convection is gone and the shield stays: ' + (ar(tbE, -60) / 1000).toFixed(1) + ' thousand km2 colder than -60 C (under 2) and ' + (ar(tbE, -20) / 1000).toFixed(0) + ' thousand colder than -20 C (over 60), the coldest top ' + Math.min(...tbE).toFixed(0) + ' C (the real ones -46 to -60), against ' + (ar(tbR, -60) / 1000).toFixed(0) + ' thousand colder than -60 C for the same storm without it', ar(tbE, -60) < 2000 && ar(tbE, -20) > 60000 && Math.min(...tbE) > -66 && Math.min(...tbE) < -35);
  { const c = Math.cos(0.7), s = Math.sin(0.7); let al = 0, ac = 0, n1 = 0, n2 = 0; for (let j = 8; j < NG - 8; j++) for (let i = 8; i < NG - 8; i++) { const k = j * NG + i; if (tbE[k] > -30) continue; const ka = (j + Math.round(2 * s)) * NG + i + Math.round(2 * c), kc = (j + Math.round(2 * c)) * NG + i - Math.round(2 * s); if (tbE[ka] < -30) { al += Math.abs(tbE[k] - tbE[ka]); n1++; } if (tbE[kc] < -30) { ac += Math.abs(tbE[k] - tbE[kc]); n2++; } }
    check('the shield is made of fine streaks along the flow aloft: the step between neighbours along the flow is ' + (al / n1).toFixed(2) + ' C, across it ' + (ac / n2).toFixed(2) + ' C (across over 1.3 times along)', ac / n2 > 1.3 * al / n1); }
  { const c = Math.cos(0.9), s = Math.sin(0.9), boxT = (al, ac2, hw) => { let sum = 0, cnt = 0; for (let k = 0; k < NN; k++) { const x = et.rr[k] * et.cth[k], y = et.rr[k] * et.sth[k], a = x * c + y * s, b = -x * s + y * c; if (Math.abs(a - al) < hw && Math.abs(b - ac2) < hw) { sum += tbE[k]; cnt++; } } return sum / cnt; };
    const warm = boxT(100, 50, 45), dry = boxT(-90, -110, 45);
    check('the dry slot is clear: the picture to the rear right of the centre is ' + dry.toFixed(0) + ' C, the warm sector\'s shield ' + warm.toFixed(0) + ' C (the slot warmer by over 20)', dry > warm + 20); }
  { const t0 = performance.now(); for (let i = 0; i < 5; i++) { et.display(0, true, true); et.irTb(new Float32Array(NN), 16); } const ms = (performance.now() - t0) / 5;
    check('the infrared picture of a transitioning system (the most work it has) takes under 40 ms here (' + ms.toFixed(0) + ' ms)', ms < 40); }
}


/* ---- what the mutants asked for: the parts of the picture and the bursts that no other check pinned down ---------------------------------------------------------------------------------- */
{
  reset();
  const tbOfN = (n, sst = 28.5) => { n.display(0, true, true); return n.irTb(new Float32Array(NN), sst); };
  const meanR = (n, a, r0, r1) => sector(n, r0, r1, null, 0, (k) => a[k]);
  const burstNest = (v, rm, r34, shear, rh, seed) => { const n = N.create({ seed }), f = forcing({ v, rmax: rm, r34, extra: { shear, shdir: 0, sst: 28.5, rh } }); n.init(f); n.setEnv(null, f); for (const b of n.bs) { b.t = -1; b.a = 0; } n.bf.fill(0); n.burstBirth(f, f.vmax, shear / KT, 0);
    const b = n.bs.find((x) => x.t >= 0); b.t = b.tg + 600; b.amp = 1; b.tm = 6 * 3600; for (let i = 0; i < 45; i++) n.step(240); return n; };
  // the eye fill target, without its random walk: a stripped storm's eye is full, a calm one's is not; a new hurricane's is fuller than an old one's
  N.PAR.eyeT = [10800, 14400, 0];
  const fillOf = (strip) => { const n = N.create({ seed: 1 }); n.init(forcing({ v: 100, rmax: 20 })); n.strip = strip; n.ef = 0; const f = n.forcingAt(0); for (let i = 0; i < 80; i++) n.eyeFill(f, 240); return n.ef; };
  const fS = fillOf(1), fC = fillOf(0);
  check('the eye of a stripped storm is full of cloud and a calm storm\'s is not: the fill settles at ' + fS.toFixed(2) + ' when stripped (over 0.7) and ' + fC.toFixed(2) + ' when not (under 0.5)', fS > 0.7 && fC < 0.5 && fS > fC + 0.3);
  const steady = (v, rm) => { const n = N.create({ seed: 1 }); n.init(forcing({ v, rmax: rm })); for (let i = 0; i < 40; i++) n.step(240); return n.ef; };
  const fNew = steady(65, 30), fOld = steady(125, 16);
  check('a new hurricane\'s eye is fuller of cloud than an old major\'s: the fill is ' + fNew.toFixed(2) + ' for a steady 65 kt storm and ' + fOld.toFixed(2) + ' for a steady 125 kt one (over 0.1 more)', fNew > fOld + 0.1);
  reset();
  // an anvil is wider than its cell
  { const n = N.create({ seed: 3 }); n.init(forcing({ v: 20, rmax: 80, r34: 120, extra: { conv: 0, sst: 18, rh: 0.3 } })); n.cir.fill(0); n.cih.fill(6); n.Q.fill(0.3 * N.PAR.Qc);
    for (let k = 0; k < NN; k++) { const x = (k % NG - 127.5) * 2, y = (Math.floor(k / NG) - 127.5) * 2; n.rc[k] = Math.hypot(x - 40, y) < 20 ? 30 : 0; } n.step(120);
    let rainC = 0, cirC = 0; for (let k = 0; k < NN; k++) { if (n.rc[k] > 0.5) rainC++; if (n.cir[k] > 0.3) cirC++; }
    check('an anvil is wider than its cell: a disc of rain of ' + rainC + ' cells is under a cirrus of ' + cirC + ' cells (' + (cirC / rainC).toFixed(1) + ' times the area, over 1.8)', cirC > 1.8 * rainC); }
  // the canopy follows the size of the storm: the outflow, the life and the reach of the cirrus
  { const mk = (v, rm, r34, m) => { const n = N.create({ seed: 4, m }); let f = forcing({ v, rmax: rm, r34 }); if (m !== 1) f = N.scaleForcing(f, m); n.init(f); n.step(240); return n; };
    const a = mk(100, 10, 65, 1), b = mk(100, 45, 300, 2);
    check('the canopy follows the size of the storm: the cirrus of a large storm (radius of 34 kt wind 300 km) spreads ' + (b.ciK / a.ciK).toFixed(1) + ' times as fast and lives ' + (b.tauCiE / a.tauCiE).toFixed(1) + ' times as long as a compact storm\'s (65 km), both over 2', b.ciK > 2 * a.ciK && b.tauCiE > 2 * a.tauCiE); }
  // a burst needs moist air: the same burst in dry air (35 % humidity) covers less than two thirds of the cold cloud
  const bm = burstNest(28, 50, 110, 6.2, 0.68, 7), bd = burstNest(28, 50, 110, 6.2, 0.35, 7), cold = (n) => { const tb = tbOfN(n); let c = 0; for (let k = 0; k < NN; k++) if (tb[k] < -40) c++; return c * 4; };
  const cm = cold(bm), cdry = cold(bd);
  check('a burst feeds on moist air: in dry air (35 % humidity, 68 % in the other) it makes ' + (cdry / 1000).toFixed(0) + ' thousand km2 of cloud colder than -40 C against ' + (cm / 1000).toFixed(0) + ' (under 0.65 of it)', cdry < 0.65 * cm);
  // a burst is a mass, not a field of cells: all of its core is raining and cold
  { let core = 0, cl = 0, rain = 0; const tb = tbOfN(bm); for (let k = 0; k < NN; k++) if (bm.bf[k] > 0.7) { core++; if (tb[k] < -40) cl++; if (bm.rc[k] + bm.rs[k] > 1) rain++; }
    check('a burst is a mass: of the ' + core + ' cells of its core ' + (100 * cl / core).toFixed(0) + ' % are under cold cloud and ' + (100 * rain / core).toFixed(0) + ' % are raining (over 99 and 97)', cl / core > 0.99 && rain / core > 0.97); }
  // a weak storm gives the burst its vortex's convergence: a tropical storm's rain at its centre is not on top of the burst's
  { const ts = burstNest(45, 40, 130, 12, 0.7, 5), c = meanR(ts, ts.rc, 0, 60) + meanR(ts, ts.rs, 0, 60), o = meanR(ts, ts.rc, 100, 250) + meanR(ts, ts.rs, 100, 250);
    check('a tropical storm with a burst keeps a swirl that is less wet than its surroundings are: ' + c.toFixed(0) + ' mm/h within 60 km against ' + o.toFixed(0) + ' at 100 to 250 km (' + (c / o).toFixed(1) + ' times, under 3.2; the centre under 25)', c < 25 && c / o < 3.2); }
  // the dry slot has no convection of its own: the convective rain there against the rest of the shield
  { const et = N.create({ seed: 7 }), eta = 0.8; et.init(forcing({ v: 65, rmax: 90, r34: 220, extra: { eta, lat: 36, clat: 36, sst: 22, shear: 12, shdir: 0.7, head: 0.9, etdir: 0.9, spd: 14, rh: 0.7 } })); for (let i = 0; i < 60; i++) et.step(240);
    const L = Math.min(420, Math.max(150, et.sz * (1 + 0.6 * eta))), c = Math.cos(0.9), s = Math.sin(0.9); let dC = 0, dN = 0, oC = 0, oN = 0;
    for (let k = 0; k < NN; k++) { const x = et.rr[k] * et.cth[k], y = et.rr[k] * et.sth[k], al = x * c + y * s, ac = -x * s + y * c, ad = (al + 0.3 * L) / (0.37 * L), cd = (ac + 0.37 * L) / (0.3 * L), dry = Math.exp(-ad * ad - cd * cd); if (dry > 0.6) { dC += et.rc[k]; dN++; } else if (dry < 0.1 && et.rr[k] < 230) { oC += et.rc[k]; oN++; } }
    check('the dry slot of a transition has little convection of its own: ' + (dC / dN).toFixed(2) + ' mm/h of convective rain in it against ' + (oC / oN).toFixed(1) + ' elsewhere in the shield (under 0.06 of it)', dC / dN < 0.06 * (oC / oN)); }
  // a transition at 0.5 has no rain-free eye hole: its centre is as wet as the ring round it
  { const n = N.create({ seed: 7 }); n.init(forcing({ v: 90, rmax: 30, r34: 160, extra: { eta: 0.5, lat: 38, clat: 38, sst: 20, shear: 10, shdir: 0.7, head: 0.9, etdir: 0.9, spd: 12, rh: 0.65 } })); for (let i = 0; i < 45; i++) n.step(240);
    const cen = meanR(n, n.rc, 0, 20) + meanR(n, n.rs, 0, 20), ring = meanR(n, n.rc, 30, 60) + meanR(n, n.rs, 30, 60);
    check('a transition half way has lost its eye hole: the rain within 20 km is ' + cen.toFixed(1) + ' mm/h, the ring at 30 to 60 km ' + ring.toFixed(1) + ' (the centre over half of it)', cen > 0.5 * ring); }
  // no cirrus in the eye
  { const n = N.create({ seed: 2 }); n.init(forcing({ v: 115, rmax: 20, r34: 140 })); for (let i = 0; i < 30; i++) n.step(240);
    check('the eye is free of cirrus: the thickness within 8 km of the centre is ' + meanR(n, n.cir, 0, 8).toFixed(3) + ' (under 0.01), while the eyewall\'s is ' + meanR(n, n.cir, 15, 40).toFixed(2), meanR(n, n.cir, 0, 8) < 0.01 && meanR(n, n.cir, 15, 40) > 0.8); }
}

/* ---- what a storm is found with, and the coldest tops --------------------------------------------------------------------------------------------------------------------------------- */
{
  reset(); N.PAR.irTx = [0, 0]; N.PAR.irStreak = 0; N.PAR.irFib = [0, 12, 7200];
  const open = (v, rm, r34) => { const n = N.create({ seed: 2 }); n.init(forcing({ v, rmax: rm, r34 })); n.display(0, true, true); return n; };
  const cm = (n, r0, r1) => sector(n, r0, r1, null, 0, (k) => n.dcr[k]);
  const hur = open(110, 25, 140), td = open(25, 70, 100);
  check('a hurricane is found with its cirrus canopy spread (the thickness is ' + cm(hur, 80, 200).toFixed(2) + ' between 80 and 200 km at the opening, over 0.4) and a depression is not (' + cm(td, 80, 200).toFixed(2) + ', under 0.05): the nest has had two hours, the storm days', cm(hur, 80, 200) > 0.4 && cm(td, 80, 200) < 0.05);
  const tbCol = (rc, rs = 0) => { const n = N.create({ seed: 1 }); n.init(forcing({ v: 60, rmax: 40, extra: { lat: 15, clat: 15 } })); n.display(0, true, true); n.drc.fill(rc); n.drs.fill(rs); n.dcr.fill(0); n.dQ.fill(0.5 * N.PAR.Qc); const out = new Float32Array(NN); n.irTb(out, 28); return out[12345]; };
  check('the coldest tops are the real ones, not the cap of the formula: the heaviest cell (1000 mm/h) is ' + tbCol(1000).toFixed(0) + ' C and 300 mm/h ' + tbCol(300).toFixed(0) + ' C (between -82 and -74 C: the rain alone stops near -78, the pink of the colour bar is the hot towers\'), a deluge of stratiform rain ' + tbCol(0, 300).toFixed(0) + ' C (above -90 C)', tbCol(1000) > -82 && tbCol(1000) < -74 && tbCol(300) < -74 && tbCol(300) > -82 && tbCol(0, 300) > -90);
  { const n = open(110, 25, 140); for (let i = 0; i < 90; i++) n.step(240); n.display(0, true, true); const tb = n.irTb(new Float32Array(NN), 28.8); let m = 99; for (let k = 0; k < NN; k++) if (tb[k] < m) m = tb[k];
    check('the coldest top of a major hurricane is ' + m.toFixed(0) + ' C (no colder than -88 C: the real record is -86)', m > -88); }
}

/* ---- the weak storm's one big mass, the hot towers, no dots, and a picture the radar does not depend on (milestone 21: the page's pictures were judged against the real ones' numbers, tools/ir_research/targets.json) ---------------------- */
{
  reset();
  const REAL = JSON.parse(readFileSync(new URL('../tools/ir_research/targets.json', import.meta.url))).stages;
  const tbOf = (n, sst = 28.8) => { n.display(0, true, true); return n.irTb(new Float32Array(NN), sst); };
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  // a run of a few hours with the picture measured at the last three three-hour marks (kept in n.hist: a storm's picture varies from frame to frame, so it is judged over several)
  const frames = (o, hours, seeds) => seeds.map((seed) => { const n = N.create({ seed }); n.init(forcing(o)); n.hist = []; for (let h = 0; h < hours; h++) { for (let i = 0; i < 15; i++) n.step(240); if (h >= hours - 7 && (hours - 1 - h) % 3 === 0) n.hist.push(stats(tbOf(n), NG, 2)); } return n; });
  const statsOf = (ns) => ns.flatMap((n) => n.hist);
  const mOf = (ss, k) => med(ss.map((x) => x[k]).filter((v) => v != null));
  const inReal = (stage, k, v, lo = 0.5, hi = 1.5) => { const r = REAL[stage][k]; return v >= r.p10 * lo - 1e-9 && v <= r.p90 * hi + 1e-9; };
  const rng = (stage, k) => { const r = REAL[stage][k]; return r.p10 + '-' + r.p90; };
  const calm = { shear: 2, rh: 0.7, sst: 28.8 }, SEEDS = [7, 8];
  const td = frames({ v: 28, rmax: 60, r34: 100, extra: calm }, 14, SEEDS), ts = frames({ v: 35, rmax: 55, r34: 110, extra: calm }, 14, [7]), tsw = frames({ v: 50, rmax: 45, r34: 120, extra: calm }, 14, SEEDS);
  const hostile = frames({ v: 28, rmax: 60, r34: 100, extra: { shear: 15, rh: 0.7, sst: 28.8 } }, 14, [7]), dry = frames({ v: 28, rmax: 60, r34: 100, extra: { shear: 2, rh: 0.35, sst: 28.8 } }, 14, [7]);
  const c1 = frames({ v: 65, rmax: 35, r34: 130, extra: calm }, 8, [7]), c3 = frames({ v: 100, rmax: 25, r34: 140, extra: calm }, 14, SEEDS), wave = frames({ v: 14, rmax: 100, r34: 100, extra: calm }, 8, [7]);
  const sTd = statsOf(td), sTs = statsOf(ts), sH = statsOf(hostile), sC3 = statsOf(c3);

  /* the continuous mass */
  const offOf = (n) => { const tb = tbOf(n); let sx = 0, sy = 0, c = 0; for (let k = 0; k < NN; k++) if (tb[k] < -40) { sx += n.rr[k] * n.cth[k]; sy += n.rr[k] * n.sth[k]; c++; } return Math.hypot(sx / c, sy / c); };
  check('a depression in very warm, moist, quiet air is one big continuous mass of convection: the mass is alive (' + td.map((n) => n.ma.toFixed(2)).join(', ') + '), the cloud colder than -40 C is ' + mOf(sTd, 'A40').toFixed(0) + ' thousand km2 (the real tropical storm\'s ' + rng('mass', 'A40') + ') and ' + (100 * mOf(sTd, 'largest')).toFixed(0) + ' % of it is one connected piece (over 90), the area colder than -60 C ' + mOf(sTd, 'A60').toFixed(0) + ' thousand (' + rng('mass', 'A60') + ')', td.every((n) => n.ma > 0.9) && inReal('mass', 'A40', mOf(sTd, 'A40')) && mOf(sTd, 'largest') > 0.9 && inReal('mass', 'A60', mOf(sTd, 'A60'), 0.5, 1.7));
  check('the mass sits to one side of the swirl, not on it: the cold cloud\'s centre is ' + med(td.map(offOf)).toFixed(0) + ' km from the swirl for a 28 kt depression (over 35), and ' + med(tsw.map(offOf)).toFixed(0) + ' for a 50 kt storm that has taken it in (under 0.6 of that)', med(td.map(offOf)) > 35 && med(tsw.map(offOf)) < 0.6 * med(td.map(offOf)));
  check('hostile air has no mass, only bursts and a bare swirl: with 29 kt of shear it is ' + hostile.map((n) => n.ma.toFixed(2)).join(', ') + ' and in dry air (35 % humidity) ' + dry.map((n) => n.ma.toFixed(2)).join(', ') + ' (under 0.05), and the cloud is under 0.5 of the calm storm\'s (' + mOf(sH, 'A40').toFixed(0) + ' against ' + mOf(sTd, 'A40').toFixed(0) + ' thousand km2)', hostile.every((n) => n.ma < 0.05) && dry.every((n) => n.ma < 0.05) && mOf(sH, 'A40') < 0.5 * mOf(sTd, 'A40'));
  check('a hurricane has no mass and a wave has none: the mass of a 65 kt storm is ' + c1[0].ma.toFixed(2) + ', of a 100 kt one ' + c3[0].ma.toFixed(2) + ', of a 14 kt disturbance ' + wave[0].ma.toFixed(2) + ' (all under 0.05): its convection is the eyewall\'s and the bands\' (or several clusters)', c1[0].ma < 0.05 && c3[0].ma < 0.05 && wave[0].ma < 0.05);
  check('the mass has the real storms\' lumps and sharp rim, not a glassy smooth skirt: the texture of its body is ' + mOf(sTd, 'tex50').toFixed(2) + ' C (the real ' + rng('mass', 'tex50') + ', over 0.45, and over 1.25 times a hurricane\'s ' + mOf(sC3, 'tex50').toFixed(2) + ') and the temperature steps ' + mOf(sTd, 'edgeGrad').toFixed(1) + ' C a km across its -20 C rim (the real ' + rng('mass', 'edgeGrad') + ')', mOf(sTd, 'tex50') > 0.45 && inReal('mass', 'edgeGrad', mOf(sTd, 'edgeGrad'), 0.6, 1.6) && mOf(sTs, 'tex50') > 0.45 && mOf(sTd, 'tex50') > 1.25 * mOf(sC3, 'tex50'));

  /* the dots: no speckle at the thin cloud's edge, no cloud of a few cells, as in the real pictures */
  const all = [['depression', 'mass', sTd], ['tropical storm', 'mass', sTs], ['hurricane', 'hur', sC3]];
  for (const [name, stage, ss] of all) check('no dots in a ' + name + '\'s picture: ' + (100 * mOf(ss, 'speckle')).toFixed(1) + ' % of its cloud-edge pixels differ from their neighbours by over 5 C (the real ' + (100 * REAL[stage].speckle.p10).toFixed(1) + '-' + (100 * REAL[stage].speckle.p90).toFixed(1) + ' %, under 3 %), ' + mOf(ss, 'smallN').toFixed(0) + ' separate cloud objects under 100 km2 in 500 km (the real ' + rng(stage, 'smallN') + ', under 60) and the thin cirrus is ' + mOf(ss, 'cirrusRough').toFixed(2) + ' C rough (the real ' + rng(stage, 'cirrusRough') + ', over 0.66: its fibres along the upper flow, not glass and not speckle)', mOf(ss, 'speckle') < 0.03 && mOf(ss, 'smallN') < 60 && mOf(ss, 'cirrusRough') > 0.66 && inReal(stage, 'cirrusRough', mOf(ss, 'cirrusRough'), 0.5, 1.6));
  { // the sensor's spread: what a 2-km sensor cannot resolve is averaged away on the cloud's fringe (one cell colder than its cloud is pulled toward it, less in larger cells; the clear air does not leak into the cloud; the deep cold tops are not touched)
    const fringe = (m, fill, spike, at = 128 * NG + 128) => { const n = N.create({ seed: 1, m }), tb = new Float32Array(NN).fill(fill); tb[at] = spike; n.irSensor(tb); return tb; };
    const p1 = fringe(1, -30, -42), p2 = fringe(2, -30, -42), cloud = (n) => { const tb = new Float32Array(NN).fill(20); for (let j = 100; j < 160; j++) for (let i = 100; i < 140; i++) tb[j * NG + i] = -30; n.irSensor(tb); return tb; };
    const cl = cloud(N.create({ seed: 1, m: 1 })), hot = fringe(1, -60, -75);
    const d1 = p1[128 * NG + 128] + 42, d2 = p2[128 * NG + 128] + 42, rim = cl[130 * NG + 139] + 30, outside = cl[130 * NG + 140] - 20, deep = hot[128 * NG + 128] + 75;
    check('the sensor\'s spread averages a lone cell into its cloud, less on larger cells: a cell 12 C colder than the -30 C cloud round it is pulled ' + d1.toFixed(1) + ' C toward it at 2 km (3.5 to 7) and ' + d2.toFixed(1) + ' C at 4 km (under 0.6 of that), the cloud\'s edge pixel next to clear air stays within ' + Math.abs(rim).toFixed(2) + ' C (under 0.5: the clear air does not leak in), the clear air beside it is untouched (' + outside.toFixed(2) + ') and a -75 C top in a -60 C one stays (' + Math.abs(deep).toFixed(2) + ' C, under 0.3)', d1 > 3.5 && d1 < 7 && d2 < 0.6 * d1 && d2 > 0.5 && Math.abs(rim) < 0.5 && Math.abs(outside) < 1e-6 && Math.abs(deep) < 0.3); }
  { // a larger box (the satellite shows 768 km where the radar shows 512): where the old box did not reach nothing is known, and its edge is not carried outward (bars of rain and of cirrus along the flow, rows of one value in the noise and the water: the
    // bars that were seen in the first hours of the satellite picture)
    const grow = (v, rmax, r34) => { const f = forcing({ v, rmax, r34, extra: calm }), n = N.create({ seed: 5 }); n.init(f); for (let i = 0; i < 30; i++) n.step(240);
      for (let j = 116; j < 128; j++) for (const i of [0, 1, 2, 3, NG - 4, NG - 3, NG - 2, NG - 1]) { n.rc[j * NG + i] = 25; n.rs[j * NG + i] = 3; n.cir[j * NG + i] = 0.95; }          // (a cell of rain and its cirrus on the old box's west and east edge)
      n.rescale(1.5); const g = N.scaleForcing(Object.assign({}, f, { m: 1 }), 1.5); n.setForcing(g, g);
      let rain = 0, cir = 0, cs = 0, nr = 0; for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) { const x = 127.5 + (i - 127.5) * 1.5, y = 127.5 + (j - 127.5) * 1.5; if (x < -4 || x > NG + 3 || y < -4 || y > NG + 3) { const k = j * NG + i; rain = Math.max(rain, n.rc[k] + n.rs[k]); cir = Math.max(cir, n.cir[k]); cs += n.cir[k]; nr++; } }
      let sd = 0, sq = 0, c = 0; for (let j = 60; j < 200; j++) { let m = 0, mq = 0; for (let i = 0; i < 30; i++) { m += n.cl[j * NG + i]; mq += n.Q[j * NG + i]; } m /= 30; mq /= 30; for (let i = 0; i < 30; i++) { sd += (n.cl[j * NG + i] - m) ** 2; sq += (n.Q[j * NG + i] - mq) ** 2; c++; } }
      return { rain, cir, cmean: cs / nr, noise: Math.sqrt(sd / c), water: Math.sqrt(sq / c) }; };
    const gw = grow(28, 60, 100), gs = grow(100, 25, 140);
    check('a larger box has no bars at its new edge: a cell of rain and its cirrus on the old edge leave ' + gw.rain.toFixed(2) + ' mm/h of rain and ' + gw.cir.toFixed(2) + ' of cirrus in the new ring round a depression (both under 0.05: nothing is known there, the edge is not stretched out), and the ring round a hurricane has its canopy ('
      + gs.cmean.toFixed(2) + ' thick on average, 0.35 to 0.7) and no rain (' + gs.rain.toFixed(2) + ')', gw.rain < 0.05 && gw.cir < 0.05 && gs.rain < 0.05 && gs.cmean > 0.35 && gs.cmean < 0.7);
    check('the new ring has noise of its own, not rows of the old edge\'s: along a row of the ring the cluster noise varies by ' + gw.noise.toFixed(2) + ' (over 0.25; a stretched edge gives 0) and the water by ' + gw.water.toFixed(1) + ' mm (over 0.8)', gw.noise > 0.25 && gw.water > 0.8); }
  check('a major hurricane\'s cold areas and tops are the real ones: the area colder than -60 C is ' + mOf(sC3, 'A60').toFixed(0) + ' thousand km2 (' + rng('hur', 'A60') + '), colder than -70 C ' + mOf(sC3, 'A70').toFixed(1) + ' (' + rng('hur', 'A70') + ') and its tops are rougher than glass but smooth (' + mOf(sC3, 'tex50').toFixed(2) + ' C, the real ' + rng('hur', 'tex50') + ')', inReal('hur', 'A60', mOf(sC3, 'A60'), 0.5, 1.6) && inReal('hur', 'A70', mOf(sC3, 'A70'), 0, 2) && inReal('hur', 'tex50', mOf(sC3, 'tex50'), 0.6, 1.5));

  /* a strong storm makes its own weather: over cool water and in dry air a hurricane keeps a cloud shield of its size (the engine says what its wind is; its convection follows it down over a day, not at once) */
  { const hostileSea = (v) => { const n = N.create({ seed: 7 }); n.init(forcing({ v, rmax: 30, r34: 150, extra: { shear: 4, rh: 0.35, sst: 24.5 } })); for (let h = 0; h < 12; h++) for (let i = 0; i < 15; i++) n.step(240); return stats(tbOf(n), NG, 2); };
    const h85 = hostileSea(85), t40 = hostileSea(40);
    check('over 24.5 C water in dry air (35 % humidity) a hurricane of 85 kt keeps a cloud shield: ' + h85.A40.toFixed(0) + ' thousand km2 colder than -40 C (over 50) and ' + h85.A60.toFixed(0) + ' colder than -60 C (over 8), a tropical storm of 40 kt in the same air has ' + t40.A40.toFixed(0) + ' (under 0.35 of the hurricane\'s): the shield goes with the wind', h85.A40 > 50 && h85.A60 > 8 && t40.A40 < 0.35 * h85.A40); }

  /* the cold cores of a weak storm: grey and white cores of 20 to 60 km, a few pink flecks (hot towers), none where there is no deep convection */
  { const pink = sTd.map((x) => x.A80), frShare = pink.filter((x) => x > 0).length / pink.length, big = Math.max(...pink), grey = med(sTd.map((x) => x.A70)), hp = Math.max(...sC3.map((x) => x.A80));
    check('a weak storm\'s mass has hot towers, the pink flecks of the real bursts: ' + (100 * frShare).toFixed(0) + ' % of its pictures have some area colder than -80 C (over 35), never more than ' + big.toFixed(1) + ' thousand km2 of it (under 8, the real 10th to 90th percentile is ' + rng('mass', 'A80') + ' on a median of ' + REAL.mass.A80.med + '), the area colder than -70 C (grey and white cores) is ' + grey.toFixed(0) + ' thousand (' + rng('mass', 'A70') + '), and a steady major hurricane has none of the pink (' + hp.toFixed(1) + ' thousand km2, under 1)', frShare > 0.35 && big < 8 && inReal('mass', 'A70', grey, 0.4, 1.7) && hp < 1); }

  /* the radar does not see the picture: the same storm with the hot towers, the fibres, the texture and the low cloud's tops changed has the same rain */
  { const rain = (par) => { reset(); Object.assign(N.PAR, par); const n = N.create({ seed: 5 }); n.init(forcing({ v: 45, rmax: 50, r34: 120, extra: calm })); for (let i = 0; i < 40; i++) { n.step(240); if (i % 10 === 9) tbOf(n); } return n; };
    const a = rain({}), b = rain({ tw: N.PAR.tw.map((x, i) => (i === 4 ? 0 : i === 1 ? 5 : x)), irFib: [0, 12, 7200], irTx: [0, 0], lc: [3, 1], irSm: 0.3, ciDt: 900 });
    let d = 0; for (let k = 0; k < NN; k++) d = Math.max(d, Math.abs(a.rc[k] - b.rc[k]), Math.abs(a.rs[k] - b.rs[k]));
    check('the radar does not depend on the picture, nor on how many random numbers it draws: with no hot towers (five tries a step, not forty), no fibres (drawn a third as often), no texture and other low clouds and smoothing the rain of the same storm is the same to ' + d.toExponential(0) + ' mm/h', d === 0); reset(); }
  check('the satellite shows at least 768 km: the scale a storm gets is at least ' + N.scaleOf(150, 20, 0, 1.5) + ' for the satellite view where the radar\'s is ' + N.scaleOf(150, 20, 0) + ' (a compact storm), and a big storm\'s is still the size it wants (' + N.scaleOf(700, 60, 0, 1.5) + ', over 2)', N.scaleOf(150, 20, 0, 1.5) >= 1.5 && N.scaleOf(150, 20, 0) === 1 && N.scaleOf(700, 60, 0, 1.5) > 2);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
