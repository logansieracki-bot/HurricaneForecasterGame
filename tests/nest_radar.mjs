// Node-only tests of the radar's picture of the nest's rain (HFNest radarOp, called by display with the texture on): a rain-free eye from about 60 mph long before the cloud tops clear, the share of the rain that a radar sees, the
// echo thinning with distance, the eyewall's weak side, nothing past the saturation of an echo, and no leap between pictures. The model's own rain, the infrared and every step stay as they were: the picture is only a view.
import '../src/storm-cities.js';
import '../src/storms.js';
import '../src/storm-nest.js';

const N = globalThis.HFNest;
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); } }
const KT = 0.514444, NG = N.N, NN = NG * NG, f2 = (v, d = 2) => v.toFixed(d);

/* a forcing from a few storm numbers (kt, km), the way tests/nest.mjs makes one */
function forcing(o) {
  const vt = new Float32Array(N.NR), V = o.v * KT, rm = o.rmax, r34 = o.r34 || 120, x = Math.max(0.3, Math.min(1.1, Math.log(V / 17.5) / Math.log(r34 / rm))), nIn = 1 + 2 * Math.min(1, Math.max(0, (o.v - 50) / 50));
  for (let i = 0; i < N.NR; i++) vt[i] = i <= rm ? V * Math.pow(i / rm, nIn) : V * Math.pow(rm / i, x);
  return Object.assign({ clat: 20, clon: -60, lat: 20, vmax: V, rmax: rm, org: 0, shear: 3, shdir: 0, uem: 0, vem: 0, ued: 0, ved: 0, head: Math.PI / 4, spd: 4, rh: 0.72, sst: 28.8, eta: 0, etdir: 0.8, conv: 1, sg: 1, vt }, o.extra || {});
}
function run(o, hours, opts = {}) {
  const dt = 240, nest = N.create({ seed: opts.seed || 7 }), f = forcing(o);
  nest.init(f);
  const n = Math.round(hours * 3600 / dt); for (let i = 0; i < n; i++) nest.step(dt);
  return nest;
}
const defaults = JSON.parse(JSON.stringify(N.PAR));
const reset = () => { Object.assign(N.PAR, JSON.parse(JSON.stringify(defaults))); };
const pic = (n) => { n.display(0, true, false); const d = new Float32Array(NN); for (let k = 0; k < NN; k++) d[k] = n.drc[k] + n.drs[k] < 0.01 ? -20 : N.dbzOf(n.drc[k], n.drs[k]); return d; };       // the radar's picture, in dBZ
const raw = (n) => n.dbz(new Float32Array(NN));                                                                                                                                 // the model's own rain, in dBZ
const cover = (n, d, a, b, thr = 20) => { let c = 0, t = 0; for (let k = 0; k < NN; k++) { const r = n.rr[k]; if (r >= a && r < b) { t++; if (d[k] >= thr) c++; } } return c / t; };
const maxIn = (n, d, r) => { let m = -99; for (let k = 0; k < NN; k++) if (n.rr[k] < r && d[k] > m) m = d[k]; return m; };
const ringSectors = (n, d) => { const ss = new Float64Array(16), sn = new Float64Array(16); for (let k = 0; k < NN; k++) { const r = n.rr[k]; if (r < 0.7 * n.rmaxN || r >= 2 * n.rmaxN) continue; const q = Math.min(15, Math.floor((Math.atan2(n.sth[k], n.cth[k]) + Math.PI) * 2.5465)); ss[q] += Math.max(0, d[k]); sn[q]++; } return Array.from(ss, (s, i) => s / sn[i]); };
const corr = (a, b) => { const n = a.length; let sa = 0, sb = 0; for (let k = 0; k < n; k++) { sa += a[k]; sb += b[k]; } sa /= n; sb /= n; let sxy = 0, sxx = 0, syy = 0; for (let k = 0; k < n; k++) { const x = a[k] - sa, y = b[k] - sb; sxy += x * y; sxx += x * x; syy += y * y; } return sxy / Math.sqrt(sxx * syy); };

/* ---- the radar's eye clears at about 60 mph, the cloud tops' eye much later ------------------------------------------------------------------------------------- */
{
  reset();
  const at = (v, rm, extra, hours = 6) => run({ v, rmax: rm, r34: 130, extra: extra || {} }, hours);
  const n40 = at(40, 40), n46 = at(46, 40), n50 = at(50, 40), n54 = at(54, 40);
  check('the radar\'s eye clears at about 60 mph: after 6 hours a 40 kt storm has ' + f2(n40.eyeRd) + ' of it, 46 kt (53 mph) ' + f2(n46.eyeRd) + ' (0.2 to 0.7), 50 kt (58 mph) ' + f2(n50.eyeRd) + ' (over 0.7) and 54 kt (62 mph) ' + f2(n54.eyeRd) + ' (over 0.9)',
    n40.eyeRd < 0.1 && n46.eyeRd > 0.2 && n46.eyeRd < 0.7 && n50.eyeRd > 0.7 && n54.eyeRd > 0.9);
  check('the rain clears long before the cloud tops: at 54 kt the radar\'s eye is ' + f2(n54.eyeRd) + ' there while the infrared\'s (the convection and the cirrus over the eye) is still ' + f2(n54.eyeS) + ' (under 0.05)', n54.eyeRd > 0.9 && n54.eyeS < 0.05);
  const clear = [7, 8, 9, 10].map((seed) => run({ v: 60, rmax: 36, r34: 130 }, 6, { seed })), cl = clear.filter((n) => { const d = pic(n), r = raw(n); return maxIn(n, d, 6) < 10 && maxIn(n, r, 6) > 25; }).length;
  check('a 60 kt storm\'s picture has a clear eye (no echo of 10 dBZ in the inner 6 km) while the model\'s own rain still fills the middle (over 25 dBZ there) in ' + cl + ' of 4 runs (at least 3)', cl >= 3);
  // an even rain field with the echo's own noise off: only the eye's edge is left to make the radius of the first echo vary
  const rag = [7, 8, 9].map((seed) => { const q = N.create({ seed }); q.init(forcing({ v: 90, rmax: 30, r34: 140 })); for (let i = 0; i < 30; i++) q.step(240);
    Object.assign(N.PAR, { rdSig: [0, 0, 2, 6], rdCut: [0, 0.001], rdBlur: 0, rdEffV: [1, 22, 50] }); q.rc.fill(80); q.rs.fill(0); q.asX = 0; q.asY = 0; const d = pic(q), out = [];
    for (let a = 0; a < 24; a++) { let best = 999; for (let k = 0; k < NN; k++) { if (d[k] < 20 || q.rr[k] < 3) continue; const th = (Math.atan2(q.sth[k], q.cth[k]) * 180 / Math.PI + 360) % 360, dth = Math.abs(((th - (a * 15 + 7.5)) + 540) % 360 - 180); if (dth <= 7.5 && q.rr[k] < best) best = q.rr[k]; } if (best < 999) out.push(best); }
    reset(); const m = out.reduce((x, y) => x + y, 0) / out.length; return Math.sqrt(out.reduce((x, y) => x + (y - m) * (y - m), 0) / out.length) / m; });
  const rg = rag.reduce((a, b) => a + b, 0) / rag.length;
  check('the edge of the radar\'s eye is ragged, not a circle: on an even rain field the radius of the first echo of 20 dBZ varies by ' + (100 * rg).toFixed(1) + ' % round the eye on average (over 4 %, a circle gives 1.5)', rg > 0.04);
  const bad = at(54, 40, { shear: 16, rh: 0.35 }), mild = at(54, 40, { shear: 6, rh: 0.55 });
  check('hostile air makes the eye wait for more wind: at 54 kt in 16 m/s of shear and dry air the radar\'s eye is ' + f2(bad.eyeRd) + ' (under 0.7), in mild air ' + f2(mild.eyeRd) + ' (over 0.9)', bad.eyeRd < 0.7 && mild.eyeRd > 0.9);
  const ring = (cut) => { const q = N.create({ seed: 7 }); q.init(forcing({ v: 70, rmax: 30, r34: 140 })); for (let i = 0; i < 60; i++) q.step(240);
    for (let i = 0; i < 60; i++) { if (cut) for (let k = 0; k < NN; k++) { const r = q.rr[k]; if (r > q.rmaxN && r < 2.2 * q.rmaxN && q.cth[k] < cut) { q.rc[k] = 0; q.rs[k] = 0; } } q.step(240); } return q.eyeRd; };
  const k0 = ring(0), kh = ring(0.2), ka = ring(2);
  check('a part of an eyewall is enough for the radar\'s eye but not none of it: with the west half of the annulus cleared of rain for four hours the eye is ' + f2(kh) + ' (over 0.6), with all of it cleared ' + f2(ka) + ' (under 0.5), the untouched storm ' + f2(k0) + ' (over 0.9)', kh > 0.6 && ka < 0.5 && k0 > 0.9);
  { const q = N.create({ seed: 7 }); q.init(forcing({ v: 60, rmax: 40, r34: 130 })); q.eyeRd = 0; q.eyeG = 0; for (let i = 0; i < 15; i++) q.step(240); const one = q.eyeRd; for (let i = 0; i < 75; i++) q.step(240); const six = q.eyeRd;
    check('the eye clears over an hour or two, not at once: from none, a 60 kt storm has ' + f2(one) + ' of its radar eye after 1 hour (0.05 to 0.85) and ' + f2(six) + ' after 6 (over 0.9)', one > 0.05 && one < 0.85 && six > 0.9); }
  { const a = N.create({ seed: 7 }); a.init(forcing({ v: 104, rmax: 24, r34: 140 })); const w = N.create({ seed: 7 }); w.init(forcing({ v: 40, rmax: 40, r34: 140 }));
    check('a new strong vortex starts with the radar eye its wind allows (' + f2(a.eyeRd) + ' for 104 kt, over 0.9; ' + f2(w.eyeRd) + ' for 40 kt, under 0.1)', a.eyeRd > 0.9 && w.eyeRd < 0.1); }
  { const e0 = at(104, 24, { eta: 0 }, 6), e1 = at(104, 24, { eta: 1 }, 6), inner = (n) => { let s = 0, c = 0; pic(n); for (let k = 0; k < NN; k++) if (n.rr[k] < 10) { s += n.drc[k] + n.drs[k]; c++; } return s / c; };
    const t0 = inner(e0), t1 = inner(e1);
    check('an extratropical transition fills the radar\'s eye of a strong storm: the rain in the inner 10 km of the picture is ' + f2(t0, 1) + ' mm/h for the tropical storm and ' + f2(t1, 1) + ' in transition (over 0.3 mm/h and over 10 times)', t1 > 0.3 && t1 > 10 * t0); }
  { pic(n54); const s54 = n54.rdRE / n54.rmaxN, big = at(104, 24); pic(big); const s104 = big.rdRE / big.rmaxN;
    check('the eye grows with the wind, as a share of the radius of maximum wind: ' + f2(s54) + ' at 54 kt, ' + f2(s104) + ' at 104 kt (the second over the first, both between 0.35 and 0.6)', s104 > s54 + 0.02 && s54 > 0.35 && s104 < 0.6); }
}

/* ---- the share of the rain a radar sees: the echo thins with distance and strong echo is rare ---------------------------------------------------------------------- */
{
  reset();
  const runs = [7, 8, 9].map((seed) => run({ v: 95, rmax: 24, r34: 150 }, 8, { seed })), pics = runs.map(pic), rawd = runs.map(raw);
  const bands = [[15, 30], [30, 50], [50, 100], [100, 150], [150, 250]], avg = (fn) => bands.map((b) => runs.reduce((s, n, i) => s + fn(n, i, b), 0) / runs.length);
  const cr = avg((n, i, b) => cover(n, pics[i], b[0], b[1])), cm = avg((n, i, b) => cover(n, rawd[i], b[0], b[1]));
  check('the echo thins with distance: a 95 kt storm\'s radar picture has echo of 20 dBZ or more over ' + cr.map((v) => (100 * v).toFixed(0)).join(', ') + ' % of the cells at 15-30, 30-50, 50-100, 100-150 and 150-250 km (over 70 at 15-30, under 85 at 50-100 (the shield of the inflow side lies there), under 35 at 150-250 and 0.25 under the model\'s own there, falling outward), where the model\'s own rain covers ' + cm.map((v) => (100 * v).toFixed(0)).join(', ') + ' %',
    cr[0] > 0.7 && cr[2] < 0.85 && cr[4] < 0.35 && cr[0] > cr[2] && cr[2] > cr[3] && cr[3] > cr[4] && cr[2] < cm[2] - 0.15 && cr[4] < cm[4] - 0.25);
  const shares = pics.map((d, i) => { let y = 0, t = 0; for (let k = 0; k < NN; k++) if (runs[i].rr[k] < 2 * runs[i].rmaxN) { t++; if (d[k] >= 35) y++; } return y / t; }), mx = pics.map((d) => Math.max(...d));
  check('strong echo is rare and capped: within two radii of maximum wind ' + shares.map((v) => (100 * v).toFixed(0)).join(', ') + ' % of the cells are 35 dBZ or more (under 60 in each and under 45 on average, the reference\'s 34: the inflow side begins there), the strongest echoes are ' + mx.map((v) => v.toFixed(0)).join(', ') + ' dBZ (45 or more in one, none over 55.3, where an echo saturates)', shares.every((v) => v < 0.6) && shares.reduce((a, b) => a + b, 0) / shares.length < 0.45 && Math.max(...mx) >= 45 && Math.max(...mx) <= 55.3);
  { const q = N.create({ seed: 7 }); q.init(forcing({ v: 95, rmax: 24, r34: 150 })); for (let i = 0; i < 20; i++) q.step(240); for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) { const x = (i - 127.5) * 2 - 120, y = (j - 127.5) * 2; if (x * x + y * y < 30 * 30) { q.rc[j * NG + i] = 3000; q.rs[j * NG + i] = 100; } }
    const d = pic(q); let m = -99; for (let k = 0; k < NN; k++) if (d[k] > m) m = d[k];
    check('an echo saturates: a patch of 3000 mm/h of convective rain and 100 of stratiform is drawn at ' + m.toFixed(1) + ' dBZ at most (under 56)', m < 56 && m > 45); }
  const faint = runs.map((n, i) => cover(n, pics[i], 100, 250, 5)), fa = faint.reduce((a, b) => a + b, 0) / faint.length;
  check('the faintest echo (5 dBZ, the first colour of the scale) is not everywhere: it covers ' + (100 * fa).toFixed(0) + ' % of the cells at 100-250 km (under 40), the rain too light to reach a radar is not drawn', fa < 0.4);
  const spread = pics.map((d, i) => { const s = ringSectors(runs[i], d); return Math.max(...s) - Math.min(...s); }), sp = spread.reduce((a, b) => a + b, 0) / spread.length;
  check('the eyewall has a weak side: the strongest of its 16 sectors is ' + spread.map((v) => v.toFixed(0)).join(', ') + ' dBZ above the weakest in three runs (' + sp.toFixed(1) + ' on average, over 9)', sp > 9);
  const ts = [35, 50].map((v) => run({ v, rmax: 45, r34: 110 }, 8)), tp = ts.map(pic), tm = tp.map((d) => Math.max(...d));
  check('a weak storm\'s picture is not a blob of heavy rain: a 35 kt and a 50 kt storm\'s strongest echoes are ' + tm.map((v) => v.toFixed(0)).join(' and ') + ' dBZ (under 47.5 and 50.5 in the first and second)', tm[0] < 47.5 && tm[1] < 50.5);
  // the picture is smooth at the cell scale (a cell is not a pixel of noise): the difference of the echo between neighbours that both have 20 dBZ
  const rough = pics.map((d) => { let s = 0, n = 0; for (let k = 0; k < NN - 1; k++) if ((k % NG) < NG - 1 && d[k] >= 20 && d[k + 1] >= 20) { const x = d[k + 1] - d[k]; s += x * x; n++; } return Math.sqrt(s / n); }), rg = rough.reduce((a, b) => a + b, 0) / rough.length;
  check('the picture is not speckle: neighbouring cells that both have an echo of 20 dBZ differ by ' + rg.toFixed(2) + ' dBZ rms (under 2.45)', rg < 2.45);
}

/* ---- the eyewall leans where the environment asks and wanders; the picture is only a view ------------------------------------------------------------------------- */
{
  reset();
  const proj = (sh) => [7, 8, 9].map((seed) => { const n = run({ v: 80, rmax: 30, r34: 150, extra: { shear: sh, shdir: 0.3, spd: 2 } }, 6, { seed }); return n.asX * Math.cos(0.3 + Math.PI / 4) + n.asY * Math.sin(0.3 + Math.PI / 4); });
  const p3 = proj(3), p14 = proj(14), mean = (a) => a.reduce((x, y) => x + y, 0) / a.length, sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) * (x - m)))); };
  check('the eyewall\'s wave number 1 leans toward downshear and left of the shear: its mean push along that direction is ' + f2(mean(p14)) + ' in 14 m/s of shear against ' + f2(mean(p3)) + ' in 3 m/s (the first over 0.4 and over the second by 0.2)', mean(p14) > 0.4 && mean(p14) > mean(p3) + 0.2);
  check('and it wanders: in 3 m/s of shear the push along that direction differs from storm to storm (' + p3.map((v) => f2(v)).join(', ') + ': a spread of ' + f2(sd(p3)) + ', over 0.15), so no two eyewalls are weak on the same side', sd(p3) > 0.15);
  const n = run({ v: 95, rmax: 24, r34: 150 }, 6), rc0 = Float32Array.from(n.rc), rs0 = Float32Array.from(n.rs), Q0 = Float32Array.from(n.Q), zt0 = Float32Array.from(n.zeta);
  n.display(0, true, true); const tbA = n.irTb(new Float32Array(NN), 28.8); n.display(0, true, false); n.displayBlend(0.5, true, false); n.display(0, true, true); const tbB = n.irTb(new Float32Array(NN), 28.8);
  let dm = 0, dt = 0; for (let k = 0; k < NN; k++) { dm = Math.max(dm, Math.abs(rc0[k] - n.rc[k]), Math.abs(rs0[k] - n.rs[k]), Math.abs(Q0[k] - n.Q[k]), Math.abs(zt0[k] - n.zeta[k])); dt = Math.max(dt, Math.abs(tbA[k] - tbB[k])); }
  check('the picture is only a view: after the radar\'s pictures the model\'s rain, water and vorticity are as they were (' + dm.toExponential(1) + ' at most) and the infrared picture is the same (' + dt.toExponential(1) + ' C at most)', dm === 0 && dt === 0);
  n.display(0, false, false); let same = 0; for (let k = 0; k < NN; k++) same += n.drc[k] === n.rc[k] && n.drs[k] === n.rs[k] ? 1 : 0;
  check('with the texture off the picture is the model\'s own rain (' + same + ' of ' + NN + ' cells equal)', same === NN);
  const fin = pic(n); let bad = 0; for (let k = 0; k < NN; k++) if (!(n.drc[k] >= 0) || !(n.drs[k] >= 0) || !isFinite(fin[k])) bad++;
  check('the picture has no negative or undefined rain (' + bad + ' cells)', bad === 0);
  const big = N.create({ seed: 7, m: 1 }); big.init(forcing({ v: 90, rmax: 30, r34: 140 })); for (let i = 0; i < 30; i++) big.step(240); big.rescale(1.5); for (let i = 0; i < 10; i++) big.step(240); const dd = pic(big); let cells = 0, nan = 0; for (let k = 0; k < NN; k++) { if (dd[k] >= 20) cells++; if (!isFinite(dd[k])) nan++; }
  check('after a change of scale the picture is whole (' + cells + ' cells of 20 dBZ or more, ' + nan + ' undefined) and its eye is clear (' + maxIn(big, dd, 5).toFixed(0) + ' dBZ in the inner 5 km, under 10)', cells > 300 && nan === 0 && maxIn(big, dd, 5) < 10);
}

/* ---- the inflow side: a shield of echo clockwise of the strongest eyewall sector, spiral arms in it, as large and as strong as the storm's inflow ------------------------------ */
{
  reset();
  const leanTo = (q, d, mag) => { q.asX = mag * Math.cos(d * Math.PI / 180); q.asY = mag * Math.sin(d * Math.PI / 180); q.shX = q.asX; q.shY = q.asY; };
  const wrap = (a) => ((a + 540) % 360) - 180, az = (q, k) => Math.atan2(q.sth[k], q.cth[k]) * 180 / Math.PI;
  const share = (q, d, c, half, lo, hi, thr) => { let n = 0, s = 0; const eye = Math.max(q.rdRE, 1); for (let k = 0; k < NN; k++) { const u = q.rr[k] / eye; if (u < lo || u >= hi || Math.abs(wrap(az(q, k) - c)) > half) continue; n++; if (d[k] >= thr) s++; } return s / Math.max(n, 1); };
  const centroid = (q, d, lo, hi, thr) => { let sx = 0, sy = 0; const eye = Math.max(q.rdRE, 1); for (let k = 0; k < NN; k++) { const u = q.rr[k] / eye; if (u < lo || u >= hi || d[k] < thr) continue; sx += q.cth[k]; sy += q.sth[k]; } return Math.atan2(sy, sx) * 180 / Math.PI; };
  const area = (q, d, thr) => { let n = 0; for (let k = 0; k < NN; k++) if (q.rr[k] * q.m >= 40 && d[k] >= thr) n++; return n * 4; };
  const storm = (o, seed, ex) => { const q = run(Object.assign({}, o, { extra: ex || {} }), 8, { seed }); leanTo(q, 30, 0.6); return q; };
  const cat3 = { v: 105, rmax: 24, r34: 150 };
  const runs = [7, 8, 9].map((seed) => { const q = storm(cat3, seed), d = pic(q); return { q, d, sh: share(q, d, -15, 45, 4, 9, 35), op: share(q, d, 165, 45, 4, 9, 35), cov: share(q, d, -15, 45, 4, 9, 20) }; });
  check('the inflow side is a shield of echo clockwise of the strongest eyewall sector: at 4 to 9 eye radii a 105 kt storm has 35 dBZ or more over ' + runs.map((r) => f2(r.sh)).join(', ') + ' of the sector 45 degrees clockwise of the lean (each over 0.4; echo of 20 dBZ over ' + runs.map((r) => f2(r.cov)).join(', ') + ', each over 0.9) and over ' +
    runs.map((r) => f2(r.op)).join(', ') + ' of the opposite one (each under 0.2, and under a quarter of the shield\'s)', runs.every((r) => r.sh > 0.4 && r.cov > 0.9 && r.op < 0.2 && r.op < 0.25 * r.sh));
  // it follows the lean as the lean wanders
  const fol = [7, 8].map((seed) => { const q = storm(cat3, seed), c30 = centroid(q, pic(q), 4, 9, 35); leanTo(q, 210, 0.6); const c210 = centroid(q, pic(q), 4, 9, 35); leanTo(q, 120, 0.6); const c120 = centroid(q, pic(q), 4, 9, 35); return [c30, c210, c120]; });
  check('the shield follows the lean: with the lean turned from 30 to 210 degrees the centre of the strong echo at 4 to 9 eye radii turns by ' + fol.map((c) => f2(wrap(c[1] - c[0]), 0)).join(' and ') + ' degrees (180, within 70) and by ' + fol.map((c) => f2(wrap(c[2] - c[0]), 0)).join(' and ') + ' to 120 (90, within 60)',
    fol.every((c) => Math.abs(wrap(wrap(c[1] - c[0]) - 180)) < 70 && Math.abs(wrap(c[2] - c[0]) - 90) < 60));
  // and it turns very slowly and little: the shield's own direction (the lean filtered over two days) moves a few degrees in six hours while the lean of the eyewall wanders
  { const q = storm(cat3, 7), ang = () => Math.atan2(q.shY, q.shX) * 180 / Math.PI, l0 = Math.atan2(q.asY, q.asX) * 180 / Math.PI, a0 = ang(); let wl = 0; for (let i = 0; i < 90; i++) { q.step(240); wl = Math.max(wl, Math.abs(wrap(Math.atan2(q.asY, q.asX) * 180 / Math.PI - l0))); } const d6 = Math.abs(wrap(ang() - a0));
    check('the shield turns very slowly and little: in six hours its direction moves ' + f2(d6, 1) + ' degrees (under 20) while the eyewall\'s lean wandered by up to ' + f2(wl, 0) + ' degrees', d6 < 20); }
  // as strong and as large as the inflow is
  const mean = (o, ex) => { const a = [7, 8].map((seed) => { const q = storm(o, seed, ex); return area(q, pic(q), 35); }); return (a[0] + a[1]) / 2; };
  const aT = mean({ v: 50, rmax: 42, r34: 120 }), a1 = mean({ v: 75, rmax: 32, r34: 130 }), a3 = (runs.slice(0, 2).map((r) => area(r.q, r.d, 35)).reduce((x, y) => x + y)) / 2;
  check('a stronger storm has a stronger and larger shield: the area of 35 dBZ or more beyond 40 km is ' + f2(aT / 1000, 1) + ' thousand km2 for a 50 kt storm, ' + f2(a1 / 1000, 1) + ' for 75 kt and ' + f2(a3 / 1000, 1) + ' for 105 kt (each over 1.15 times the last, and the last over twice the first)', a1 > 1.15 * aT && a3 > 1.15 * a1 && a3 > 2 * aT);
  const aS = mean({ v: 105, rmax: 24, r34: 70 }), aL = mean({ v: 105, rmax: 24, r34: 260 }), aH = mean(cat3, { shear: 16, rh: 0.35 });
  check('a larger inflow has a larger shield and a hostile air a smaller one: for 105 kt the area of 35 dBZ or more beyond 40 km is ' + f2(aS / 1000, 1) + ' thousand km2 with a wind field of 70 km, ' + f2(a3 / 1000, 1) + ' with 150 and ' + f2(aL / 1000, 1) + ' with 260 (the compact one under 0.7 of the middle one, the large one over 1.5 times), and ' + f2(aH / 1000, 1) + ' in 16 m/s of shear and dry air (under half)', aS < 0.7 * a3 && aL > 1.5 * a3 && aH < 0.5 * a3);
  // its strength follows the size of the wind field as well as its reach (the size that has all of the inflow side is a parameter of the strength alone: the nest's own rain and the reach stay as they are)
  const aSz = (sz) => { N.PAR.rdIn[15] = sz; const a = runs.slice(0, 2).map((r) => area(r.q, pic(r.q), 35)); reset(); return (a[0] + a[1]) / 2; };
  const aOne = aSz(150), aTwo = aSz(300);
  check('the shield is as strong as the wind field is large and not only as far-reaching: with the size of a wind field that has all of the inflow side raised from 150 to 300 km, a wind field of 150 km (the same nest, the same reach) has ' + f2(aTwo / 1000, 1) + ' thousand km2 of 35 dBZ or more beyond 40 km against ' + f2(aOne / 1000, 1) + ' (under 0.9 of it)', aTwo < 0.9 * aOne);
  // what the shield adds to the nest's own echo: little for a depression, none in a transition, a great deal for a hurricane
  const added = (o, ex) => { Object.assign(N.PAR, JSON.parse(JSON.stringify(defaults))); const q = storm(o, 7, ex), a = area(q, pic(q), 35); N.PAR.rdIn[0] = 0; const b = area(q, pic(q), 35); reset(); return a - b; };
  const dTd = added({ v: 30, rmax: 70, r34: 90 }), dTc = added(cat3), dEt = added({ v: 90, rmax: 30, r34: 150 }, { eta: 1 });
  check('the shield adds ' + f2(dTc / 1000, 1) + ' thousand km2 of 35 dBZ or more to a hurricane\'s picture (over 5), ' + f2(dTd / 1000, 1) + ' to a depression\'s (under 2: it is not defined before the core is) and ' + f2(dEt / 1000, 2) + ' in an extratropical transition (none: the transition has its own rain)', dTc > 5000 && dTd < 2000 && Math.abs(dEt) < 100);
  // the bands: seen in the angle and the log of the radius, the echo of the shield lies along spirals that wind clockwise outward (the cyclonic side of the northern hemisphere's frame): the power of its waves that wind that way against the power of the waves that wind the other way
  const winding = (seed) => {
    const q = storm(cat3, seed); q.rc.fill(0); q.rs.fill(0); const d = pic(q), eye = Math.max(q.rdRE, 1), NT = 72, NS = 24, s0 = Math.log(4), s1 = Math.log(10), a = new Float64Array(NT * NS);
    for (let js = 0; js < NS; js++) { const u = Math.exp(s0 + (s1 - s0) * js / (NS - 1)); for (let jt = 0; jt < NT; jt++) { const th = 2 * Math.PI * jt / NT - Math.PI, x = 127.5 + u * eye * Math.cos(th) / 2, y = 127.5 + u * eye * Math.sin(th) / 2; a[js * NT + jt] = Math.max(0, d[Math.round(y) * NG + Math.round(x)]) / 40; } }
    let pos = 0, neg = 0;
    for (let m = 3; m <= 12; m++) for (let kk = -6; kk <= 6; kk++) {
      if (kk === 0) continue; const ks = 2 * Math.PI * kk / (s1 - s0); let re = 0, im = 0;
      for (let js = 0; js < NS; js++) { const s = s0 + (s1 - s0) * js / (NS - 1), w = 0.5 - 0.5 * Math.cos(2 * Math.PI * (js + 0.5) / NS); for (let jt = 0; jt < NT; jt++) { const ph = m * (2 * Math.PI * jt / NT - Math.PI) + ks * (s - s0), v = a[js * NT + jt] * w; re += v * Math.cos(ph); im += v * Math.sin(ph); } }
      if (kk > 0) pos += re * re + im * im; else neg += re * re + im * im;
    }
    return pos / neg;
  };
  const wnd = [7, 8, 9].map(winding);
  check('the shield is made of spiral bands that wind clockwise outward (the cyclonic side of the northern hemisphere\'s frame): in the angle and the log of the radius the power of the waves of 3 to 12 bands that wind that way is ' + wnd.map((v) => f2(v, 1)).join(', ') + ' times the power of the waves that wind the other way (each over 2.5)', wnd.every((v) => v > 2.5));
  // and the area does not swell and shrink within the half hour: the area of strong echo changes by a few percent in 30 minutes, not by a third
  { const q = storm(cat3, 7), ser = []; for (let i = 0; i < 13; i++) { ser.push(area(q, pic(q), 35)); for (let j = 0; j < 3; j++) q.step(200); }
    const mean = ser.reduce((x, y) => x + y) / ser.length, ch = []; for (let i = 0; i + 3 < ser.length; i++) ch.push(Math.abs(ser[i + 3] - ser[i]) / mean); ch.sort((x, y) => x - y);
    check('the large convection area keeps its size within the half hour: the area of 35 dBZ or more beyond 40 km (' + f2(mean / 1000, 1) + ' thousand km2 on average) changes by ' + f2(100 * ch[Math.floor(ch.length / 2)], 0) + ' percent in the middle of the 30 minute changes and by at most ' + f2(100 * ch[ch.length - 1], 0) + ' (under 12 and under 30)', ch[Math.floor(ch.length / 2)] < 0.12 && ch[ch.length - 1] < 0.3); }
  // the edges of the area are not drawn with a compass: the farthest echo of 20 dBZ round the storm differs from sector to sector (a wedge ends on an arc), and the area does not follow the storm's air in an hour but in a day
  const edgeIrr = (seed) => {
    const q = storm(cat3, seed); q.rc.fill(0); q.rs.fill(0); const d = pic(q), eye = Math.max(q.rdRE, 5), NS = 36, outer = new Float64Array(NS), cnt = new Float64Array(NS);
    for (let k = 0; k < NN; k++) { if (d[k] < 20) continue; const sct = Math.min(NS - 1, Math.floor((Math.atan2(q.sth[k], q.cth[k]) + Math.PI) / (2 * Math.PI) * NS)), u = q.rr[k] / eye; if (u > outer[sct]) outer[sct] = u; cnt[sct]++; }
    const sec = []; for (let i = 0; i < NS; i++) { const a = (i + 0.5) * 360 / NS - 180; if (Math.abs(wrap(a + 15)) < 70 && cnt[i] > 20) sec.push(outer[i]); }
    const m = sec.reduce((x, y) => x + y, 0) / sec.length; return Math.sqrt(sec.reduce((x, y) => x + (y - m) * (y - m), 0) / sec.length) / m;
  };
  const edg = [7, 8, 9].map(edgeIrr);
  check('the outer edge of the shield is not an arc: the farthest echo of 20 dBZ in the sectors it spans differs by ' + edg.map((v) => f2(100 * v, 0)).join(', ') + ' percent of its mean (standard deviation; each over 10)', edg.every((v) => v > 0.1));
  // the bands move and change over hours and hardly in ten minutes (the same cells, the instant of the pattern changed)
  { const mv = (seed) => { const q = storm(cat3, seed); q.rc.fill(0); q.rs.fill(0); const at = (dt) => { q.t += dt; q.display(0, true, false); const r = Float32Array.from(q.shR); q.t -= dt; return r; }, a = at(0); return [corr(a, at(600)), corr(a, at(10800))]; };
    const m = [7, 8, 9].map(mv);
    check('the bands move and change over hours, not minutes: the inflow side\'s rain keeps a correlation of ' + m.map((c) => f2(c[0])).join(', ') + ' after ten minutes (each over 0.97) and of ' + m.map((c) => f2(c[1])).join(', ') + ' after three hours (each under 0.9 and at least 0.1 under the first), the cells being the same', m.every((c) => c[0] > 0.97 && c[1] < 0.9 && c[0] - c[1] > 0.1)); }
  { const q = storm(cat3, 7), only = () => { q.rc.fill(0); q.rs.fill(0); return area(q, pic(q), 35); }, a0 = only(), hostile = forcing(Object.assign({}, cat3, { extra: { shear: 16, rh: 0.35 } })); q.setForcing(hostile, hostile); q.setEnv(null, hostile);
    for (let i = 0; i < 15; i++) q.step(240); const a1 = only(); for (let i = 0; i < 195; i++) q.step(240); const a2 = only();
    check('the large convection area follows the storm\'s air over hours and not in one: after the air turns hostile (shear 16 m/s, dry) the area of 35 dBZ or more beyond 40 km is ' + f2(a1 / a0, 2) + ' of what it was after one hour (over 0.85) and ' + f2(a2 / a0, 2) + ' after fourteen (under 0.7)', a1 > 0.85 * a0 && a2 < 0.7 * a0); }
}

/* ---- no leaps: the picture changes a little from one step to the next --------------------------------------------------------------------------------------------------- */
{
  reset();
  const q = N.create({ seed: 5 }); q.init(forcing({ v: 90, rmax: 28, r34: 140 })); for (let i = 0; i < 40; i++) q.step(120);
  const d0 = pic(q), r0 = Float32Array.from(q.drc); q.step(120); const d1 = pic(q), c1 = corr(Float32Array.from(d0, (v) => Math.max(0, v)), Float32Array.from(d1, (v) => Math.max(0, v)));
  check('the radar picture changes a little from one step to the next, not by a jump: the echo keeps a correlation of ' + c1.toFixed(2) + ' across a step of 2 minutes (over 0.95)', c1 > 0.95);
  q.displayBlend(0, true, false); q.step(120); q.displayBlend(1, true, false); const a = Float32Array.from(q.drc), b = Float32Array.from(q.drs); q.step(120); q.displayBlend(0, true, false);
  let e1 = 0, e2 = 0; for (let k = 0; k < NN; k++) { e1 = Math.max(e1, Math.abs(a[k] - q.drc[k])); e2 = Math.max(e2, Math.abs(b[k] - q.drs[k])); }
  check('the picture between steps has no leap at the next step: the convective and stratiform rain shown at the end of one step and at the start of the next differ by at most ' + e1.toExponential(1) + ' and ' + e2.toExponential(1) + ' mm/h (under 0.001)', e1 < 1e-3 && e2 < 1e-3);
  const t0 = performance.now(); for (let i = 0; i < 8; i++) q.display(0, true, false); const ms = (performance.now() - t0) / 8;
  check('the radar\'s picture costs ' + ms.toFixed(1) + ' ms (under 25 ms on this machine)', ms < 25);
}

/* ---- the picture a playing clock makes (displayBlend: the state one step ago and the state now, mixed over the step) is the paused picture's weather and not another one ---------------------------------------- */
{
  reset();
  const rain = (q) => Float32Array.from(q.drc, (v, k) => v + q.drs[k]);
  const rows = [{ v: 110, rmax: 22, r34: 150 }, { v: 50, rmax: 40, r34: 130 }].map((o) => {
    const q = run(o, 8); q.keepPrev = true; for (let s = 0; s < 3; s++) q.step(120);                       // (the floater keeps the state one step ago from the first picture of a playing clock, in steps of 2 minutes)
    q.display(0, true, false); const p = rain(q); q.displayBlend(1, true, false); const e = rain(q); q.displayBlend(0.5, true, false); const m = rain(q);
    let dmax = 0, sp = 0, sm = 0; for (let k = 0; k < NN; k++) { dmax = Math.max(dmax, Math.abs(p[k] - e[k])); sp += p[k]; sm += m[k]; }
    return { dmax, ratio: sm / sp };
  });
  check('the playing clock draws the paused picture at the end of a step and the same weather half way through: the rain of a 110 kt and a 50 kt storm differs by at most ' + rows.map((r) => r.dmax.toExponential(1)).join(' and ') + ' mm/h from the paused picture at the end of a step (under 0.001), and half way through it holds ' + rows.map((r) => f2(r.ratio, 3)).join(' and ') + ' of the paused picture\'s rain (0.95 to 1.05)',
    rows.every((r) => r.dmax < 1e-3 && r.ratio > 0.95 && r.ratio < 1.05));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
