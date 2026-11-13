// Node-only tests of the analysis builder (src/severe-analysis.js): the pressure of lows, highs, troughs and fronts against the Gaussian they are; the geostrophic wind against the closed form (the gradient over rho f), its
// turning and slowing by friction and its fall with height; the flow aloft, the jets and the circulation aloft at the points where their formulae are known; the line geometry (the distance, the side, the end);
// the soundings: the warm sector is the sounding generator's own, behind a cold front the surface is colder by the drawn contrast, the front's surface leans over the cold air at its slope, a dryline lowers the dew point by the drawn
// amount and leans the other way, the outflow's dome is shallow, the moisture axis adds its share; a line moves along its arrow, ends fade, the coldest air wins where lines overlap; and a map is the same numbers as its points.
// The right answers are written out here from the definitions, not read back from the module.
import '../src/severe-core.js';
import '../src/severe-sounding.js';
import '../src/severe-analysis.js';

const C = globalThis.HFSevereCore, S = globalThis.HFSevereSounding, A = globalThis.HFSevereAnalysis;
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const t0 = Date.now(), E = Math.E, DEG = Math.PI / 180, F = 2 * 7.292e-5 * Math.sin(36.7 * DEG), RHO = 1.2;
const pi = (p) => Math.pow(p / 1000, C.consts.RD / C.consts.CP), sq = (x) => x * x, thrown = (fn) => { try { fn(); } catch (e) { return String(e.message); } return null; };
const mk = (objects, extra) => A.create(Object.assign({ objects }, extra));
const north = (x) => [[x, -3000], [x, 3000]];                                                          // a long line drawn northwards at x km: its left is the west

/* 1. The pressure: Gaussians of the drawn size, summed. */
{
  const a = mk([{ type: 'low', x: 0, y: 0, depth: 15, size: 400 }]);
  check('a low of 15 hPa and 400 km: 1000 hPa at its centre, 15/e under 1015 at 400 km in every direction, 1015 far away (' + a.pressure(0, 0, 0) + ', ' + a.pressure(400, 0, 0).toFixed(3) + ', ' + a.pressure(0, -400, 0).toFixed(3) + ', ' + a.pressure(4000, 0, 0) + ')',
    near(a.pressure(0, 0, 0), 1000, 1e-12) && near(a.pressure(400, 0, 0), 1015 - 15 / E, 1e-9) && near(a.pressure(0, -400, 0), 1015 - 15 / E, 1e-9) && near(a.pressure(0, 400 * Math.SQRT1_2 * Math.SQRT2, 0), 1015 - 15 / E, 1e-9) && near(a.pressure(4000, 0, 0), 1015, 1e-9));
  const b = mk([{ type: 'low', x: -100, y: 0, depth: 10, size: 300 }, { type: 'low', x: 100, y: 0, depth: 6, size: 200 }, { type: 'high', x: 0, y: 500, rise: 8, size: 600 }], { base: 1010 });
  const want = 1010 - 10 * Math.exp(-sq(Math.hypot(150, 20) / 300)) - 6 * Math.exp(-sq(Math.hypot(50, 20) / 200)) + 8 * Math.exp(-sq(Math.hypot(50, 480) / 600));
  check('two lows and a high add: at (50, 20) ' + b.pressure(50, 20, 0).toFixed(4) + ' hPa against ' + want.toFixed(4) + ', on a base of 1010', near(b.pressure(50, 20, 0), want, 1e-9));
  const h = mk([{ type: 'high', x: 100, y: -50, rise: 10, size: 600 }]);
  check('a high rises 10 hPa at its centre and 10/e at its size (' + h.pressure(100, -50, 0) + ', ' + h.pressure(700, -50, 0).toFixed(3) + ')', near(h.pressure(100, -50, 0), 1025, 1e-9) && near(h.pressure(700, -50, 0), 1015 + 10 / E, 1e-9));
  const tr = mk([{ type: 'trough', pts: [[-500, 0], [500, 0]], depth: 4, width: 120 }]), fr = mk([{ type: 'front', kind: 'cold', pts: [[0, -300], [0, 300]], contrast: 12, width: 40 }]);
  check('a trough is 4 hPa down on its line and 4/e at its width (' + tr.pressure(0, 0, 0) + ', ' + tr.pressure(10, 120, 0).toFixed(3) + '), a front lies in a trough of a tenth of its contrast (' + fr.pressure(0, 0, 0).toFixed(3) + ' on the line, ' + fr.pressure(60, 0, 0).toFixed(3) + ' at 1.5 widths)',
    near(tr.pressure(0, 0, 0), 1011, 1e-9) && near(tr.pressure(10, 120, 0), 1015 - 4 / E, 1e-9) && near(fr.pressure(0, 0, 0), 1015 - 1.2, 1e-9) && near(fr.pressure(60, 0, 0), 1015 - 1.2 / E, 1e-9));
  const mo = mk([{ type: 'low', x: 0, y: 0, depth: 15, size: 400, motion: { u: 10, v: 0 }, deepen: 2 }, { type: 'trough', pts: [[0, 0], [0, 100]], depth: 4, width: 50, motion: { u: 0, v: -5 } }]);
  const wantMoved = 1015 - 19 - 4 * Math.exp(-((72 / 50) ** 2)), wantAt0 = 1015 - 19 * Math.exp(-((72 / 400) ** 2)) - 4;
  check('a low goes along its arrow (10 m/s east is 72 km in 2 hours) and deepens (2 hPa an hour: 19 hPa), a trough moves too (5 m/s south is 36 km in 2 hours): ' + mo.pressure(72, 0, 2).toFixed(3) + ' hPa at the low\'s new centre (' + wantMoved.toFixed(3) + ') and ' + mo.pressure(0, 0, 2).toFixed(3) + ' on the trough (' + wantAt0.toFixed(3) + ')',
    near(mo.pressure(72, 0, 2), wantMoved, 1e-9) && near(mo.pressure(0, 0, 2), wantAt0, 1e-9));
}

/* 2. The line: the distance, the side (positive to the left of the direction it is drawn), the corner, the end. */
{
  const L = [[0, 0], [100, 0]], p1 = A.polyNear(L, 50, 10), p2 = A.polyNear(L, 50, -10), p3 = A.polyNear(L, 150, 0), p4 = A.polyNear(L, -30, 40);
  check('a line drawn east: a point 10 km north is 10 km to its left, 10 km south 10 to its right (' + p1.left + ', ' + p2.left + '), its direction (' + p1.ux + ', ' + p1.uy + '), nothing past an end (' + p1.past + '), and 50 km east of the end it is 50 km past it (' + p3.past + ', ' + p3.dist + ')',
    p1.left === 10 && p2.left === -10 && p1.ux === 1 && p1.uy === 0 && p1.past === 0 && p3.past === 50 && p3.dist === 50 && near(p4.past, 30, 1e-12) && near(p4.dist, 50, 1e-12));
  const bent = [[0, 0], [100, 0], [100, 100]], c = A.polyNear(bent, 120, -20), m = A.polyNear(bent, 80, 30);
  check('round a corner the direction is the middle of the two segments\' and the side follows it: a point outside a left turn is to the right (' + c.left.toFixed(2) + '), inside it to the left (' + m.left.toFixed(2) + ', direction (' + m.ux + ', ' + m.uy + '))',
    near(c.left, -Math.hypot(20, 20), 1e-9) && near(c.ux, Math.SQRT1_2, 1e-9) && near(c.uy, Math.SQRT1_2, 1e-9) && m.left === 20 && m.ux === 0 && m.uy === 1);
}

/* 3. The wind of the pressure: geostrophic, with friction, falling with height. */
{
  const a = mk([{ type: 'low', x: 0, y: 0, depth: 15, size: 400 }], { aloft: { speed: 0 } }), Vr = (r, R, D) => (2 * D * 100 * r * 1000 / (R * 1000) ** 2 * Math.exp(-sq(r / R))) / (RHO * F);
  const e = a.geostrophic(400, 0, 0), n = a.geostrophic(0, 400, 0), w = a.geostrophic(-400, 0, 0), s = a.geostrophic(0, -400, 0), m = a.geostrophic(200, 0, 0), V = Vr(400, 400, 15);
  check('the geostrophic wind of a low of 15 hPa and 400 km is the gradient over rho f: ' + V.toFixed(2) + ' m/s at 400 km, counter-clockwise (north on its east side, west on its north, south on its west, east on its south: ' + [e.v, -n.u, -w.v, s.u].map((x) => x.toFixed(2)).join(', ') + ') and ' + Vr(200, 400, 15).toFixed(2) + ' at 200 km (' + Math.hypot(m.u, m.v).toFixed(2) + ')',
    rel(e.v, V) < 0.002 && near(e.u, 0, 0.01) && rel(-n.u, V) < 0.002 && rel(-w.v, V) < 0.002 && rel(s.u, V) < 0.002 && rel(Math.hypot(m.u, m.v), Vr(200, 400, 15)) < 0.002);
  const hi = mk([{ type: 'high', x: 0, y: 0, rise: 10, size: 600 }]).geostrophic(600, 0, 0);
  check('round a high it turns clockwise: south on its east side (' + hi.v.toFixed(2) + ', and ' + Vr(600, 600, 10).toFixed(2) + ' m/s)', hi.v < 0 && rel(-hi.v, Vr(600, 600, 10)) < 0.002);
  const g = V, z10 = a.windAt(400, 0, 10, 0), fr = 0.55 + 0.45 * (1 - Math.exp(-10 / 700)), dec = Math.exp(-10 / 3500), ang = Math.atan2(-z10[0], z10[1]) / DEG;
  check('at the ground friction slows it to ' + (fr * dec).toFixed(4) + ' of the gradient wind and turns it ' + (28 * Math.exp(-10 / 700)).toFixed(2) + ' degrees towards the low (' + (Math.hypot(z10[0], z10[1]) / g).toFixed(4) + ', ' + ang.toFixed(2) + ' degrees, u < 0: ' + z10[0].toFixed(2) + ')',
    rel(Math.hypot(z10[0], z10[1]), g * fr * dec) < 0.003 && near(ang, 28 * Math.exp(-10 / 700), 0.1) && z10[0] < 0);
  const z5 = a.windAt(400, 0, 5000, 0), f5 = 0.55 + 0.45 * (1 - Math.exp(-5000 / 700));
  check('at 5 km the gradient\'s wind is ' + (f5 * Math.exp(-5000 / 3500)).toFixed(4) + ' of the surface\'s, unturned (' + (Math.hypot(z5[0], z5[1]) / g).toFixed(4) + ', u ' + z5[0].toFixed(3) + ')', rel(Math.hypot(z5[0], z5[1]), g * f5 * Math.exp(-5000 / 3500)) < 0.003 && Math.abs(z5[0]) < 0.01 * Math.abs(z5[1]));
}

/* 4. The flow aloft, the jets and the circulation aloft. */
{
  const bg = mk([]), u10 = -30 * Math.sin(255 * DEG), v10 = -30 * Math.cos(255 * DEG), w1 = bg.windAt(0, 0, 10000, 0), w5 = bg.windAt(0, 0, 5000, 0), w0 = bg.windAt(0, 0, 0, 0), w12 = bg.windAt(0, 0, 12000, 0);
  check('with nothing drawn the flow aloft is 30 m/s from 255 degrees at 10 km (' + w1[0].toFixed(3) + ', ' + w1[1].toFixed(3) + ' for ' + u10.toFixed(3) + ', ' + v10.toFixed(3) + '), (z / 10 km)^0.8 of it at 5 km (' + Math.pow(0.5, 0.8).toFixed(4) + '), none at the ground and the same above 10 km',
    near(w1[0], u10, 1e-9) && near(w1[1], v10, 1e-9) && near(w5[0], u10 * Math.pow(0.5, 0.8), 1e-9) && w0[0] === 0 && w0[1] === 0 && near(w12[0], u10, 1e-9));
  const own = mk([], { aloft: { speed: 20, from: 180 } }).windAt(0, 0, 10000, 0);
  check('the flow aloft is the drawing\'s own (20 m/s from the south: ' + own[0].toFixed(3) + ', ' + own[1].toFixed(3) + ' is northward 20)', near(own[0], 0, 1e-9) && near(own[1], 20, 1e-9));
  const j = mk([{ type: 'jet', pts: [[-1000, 0], [1000, 0]], speed: 25, width: 250 }], { aloft: { speed: 0 } }), r = mk([{ type: 'jet', pts: [[1000, 0], [-1000, 0]], speed: 25, width: 250 }], { aloft: { speed: 0 } });
  check('a jet of 25 m/s drawn east: 25 m/s east on its axis at 9.5 km (' + j.windAt(0, 0, 9500, 0)[0].toFixed(4) + '), 25/e one width off (' + j.windAt(0, 250, 9500, 0)[0].toFixed(3) + '), 25/e at 6 km (' + j.windAt(0, 0, 6000, 0)[0].toFixed(3) + '), nothing at the ground (' + j.windAt(0, 0, 0, 0)[0].toFixed(4) + '), none northwards; drawn west it blows west (' + r.windAt(0, 0, 9500, 0)[0].toFixed(3) + ')',
    near(j.windAt(0, 0, 9500, 0)[0], 25, 1e-9) && near(j.windAt(0, 0, 9500, 0)[1], 0, 1e-9) && near(j.windAt(0, 250, 9500, 0)[0], 25 / E, 1e-9) && near(j.windAt(0, 0, 6000, 0)[0], 25 / E, 1e-9) && j.windAt(0, 0, 0, 0)[0] < 0.02 && near(r.windAt(0, 0, 9500, 0)[0], -25, 1e-9));
  const l = mk([{ type: 'llj', pts: [[0, -500], [0, 500]], speed: 18, width: 150 }], { aloft: { speed: 0 } });
  check('a low-level jet of 18 m/s drawn north: 18 m/s north on its axis at 1.5 km (' + l.windAt(0, 0, 1500, 0)[1].toFixed(4) + '), 18/e at one width (' + l.windAt(150, 0, 1500, 0)[1].toFixed(3) + ') and 800 m higher (' + l.windAt(0, 0, 2300, 0)[1].toFixed(3) + '), and nothing at 6 km (' + l.windAt(0, 0, 6000, 0)[1].toExponential(1) + ')',
    near(l.windAt(0, 0, 1500, 0)[1], 18, 1e-9) && near(l.windAt(0, 0, 1500, 0)[0], 0, 1e-9) && near(l.windAt(150, 0, 1500, 0)[1], 18 / E, 1e-9) && near(l.windAt(0, 0, 2300, 0)[1], 18 / E, 1e-9) && l.windAt(0, 0, 6000, 0)[1] < 1e-3);
  const u = mk([{ type: 'utrough', x: 0, y: 0, speed: 25, size: 500 }], { aloft: { speed: 0 } }), at = (x, y, z) => u.windAt(x, y, z, 0);
  check('a circulation aloft of 25 m/s at 500 km: counter-clockwise (south on its east side at 8 km ' + at(500, 0, 8000)[1].toFixed(3) + ', west on its north ' + at(0, 500, 8000)[0].toFixed(3) + ', north on its west ' + at(-500, 0, 8000)[1].toFixed(3) + '), nothing at the centre, ' + (50 * Math.exp(-1.5)).toFixed(3) + ' m/s at twice the radius (' + at(1000, 0, 8000)[1].toFixed(3) + '), 25/e at 4 km',
    near(at(500, 0, 8000)[1], 25, 1e-9) && near(at(0, 500, 8000)[0], -25, 1e-9) && near(at(-500, 0, 8000)[1], -25, 1e-9) && at(0, 0, 8000)[0] === 0 && near(at(1000, 0, 8000)[1], 50 * Math.exp(-1.5), 1e-9) && near(at(500, 0, 4000)[1], 25 / E, 1e-9));
}

/* 5. The soundings: the air masses and where the lines let them in. */
{
  const dz = 100, n = 201, warm = S.make(Object.assign({}, S.presets.tornado, { winds: [[0, 0, 0], [12000, 0, 0]], jets: [], motion: { u: 0, v: 0 } })).table, zt = Float64Array.from({ length: n }, (_, k) => k * dz);
  const ref = S.fromProfile({ z: zt, theta: Float64Array.from(zt, (_, k) => warm.theta[k * 10]), qv: Float64Array.from(zt, (_, k) => warm.qv[k * 10]), uG: () => 0, vG: () => 0, p0: 1015 }), refIx = S.indices(ref);
  const none = mk([]), ix0 = S.indices(none.sounding(0, 0, 0));
  check('with nothing drawn the sounding is the warm air mass\'s, the tornado day\'s: mixed-layer CAPE ' + ix0.mlcape.toFixed(1) + ' against ' + refIx.mlcape.toFixed(1) + ' (the table of the generator on a grid of 100 m, the ground at 1015 hPa), CIN and condensation level the same', near(ix0.mlcape, refIx.mlcape, 1e-6) && near(ix0.mlcin, refIx.mlcin, 1e-6) && near(ix0.mllcl, refIx.mllcl, 1e-6));
  const tW = none.surface(0, 0, 0).T, cf = mk([{ type: 'front', kind: 'cold', pts: north(0), cold: 'left', contrast: 12, width: 40 }]);
  const dT = (x) => cf.surface(x, 0, 0).T - tW;
  const halfWant = 301 * (pi(1015 - 1.2) - pi(1015)) - 6;                                              // (the front's kink of 1.2 hPa on its line makes the ground 0.1 K colder by itself: theta 301 K times the Exner function)
  check('behind a cold front of contrast 12 K (its cold side to the left of the way it is drawn) the ground is 12 K colder (' + dT(-500).toFixed(3) + '), half way on the line (' + dT(0).toFixed(3) + ' against ' + halfWant.toFixed(3) + ': 6 K and the kink), the same as before the front, ahead of it (' + dT(500).toFixed(3) + ')',
    near(dT(-500), -12, 0.01) && near(dT(0), halfWant, 0.005) && near(dT(500), 0, 0.01));
  const cfr = mk([{ type: 'front', kind: 'cold', pts: north(0), cold: 'right', contrast: 12, width: 40 }]);
  check('with the cold side to the right the other side is cold (east: ' + (cfr.surface(500, 0, 0).T - tW).toFixed(3) + ', west: ' + (cfr.surface(-500, 0, 0).T - tW).toFixed(3) + ')', near(cfr.surface(500, 0, 0).T - tW, -12, 0.01) && near(cfr.surface(-500, 0, 0).T - tW, 0, 0.01));
  const weak = mk([{ type: 'front', kind: 'cold', pts: north(0), cold: 'left', contrast: 6, width: 40 }]);
  check('the contrast scales the cold air: 6 K behind a front of 6 (' + (weak.surface(-500, 0, 0).T - tW).toFixed(3) + ')', near(weak.surface(-500, 0, 0).T - tW, -6, 0.01));
  const cold = A.AIR_SPEC.cold, thC = S.make(Object.assign({}, cold, { winds: [[0, 0, 0], [12000, 0, 0]], jets: [], motion: { u: 0, v: 0 } })).table;
  const weightAt = (x, z) => { const k = Math.round(z / dz), th = cf.sounding(x, 0, 0).table.theta[k]; return (th - warm.theta[k * 10]) / ((12 / 13 / pi(1015)) * (thC.theta[k * 10] - warm.theta[k * 10])); };
  check('the front leans over the cold air at 1 in 80: at 2 km the cold air\'s share is half 160 km behind the line (' + weightAt(-160, 2000).toFixed(4) + '), nearly all 300 km behind it (' + weightAt(-300, 2000).toFixed(3) + '), none ahead of it (' + weightAt(40, 2000).toFixed(4) + '); at 1 km half 80 km behind (' + weightAt(-80, 1000).toFixed(4) + ')',
    near(weightAt(-160, 2000), 0.5, 1e-4) && weightAt(-300, 2000) > 0.97 && weightAt(40, 2000) < 0.001 && near(weightAt(-80, 1000), 0.5, 1e-4));       // (to 1e-4: the pressure under the front's kink changes the Exner function a little)
  const wf = mk([{ type: 'front', kind: 'warm', pts: north(0), cold: 'left', contrast: 10, width: 60 }]), st = mk([{ type: 'front', kind: 'stationary', pts: north(0), cold: 'left', contrast: 8, width: 50 }]);
  check('a warm front lets in the cool marine air (10 K colder behind it: ' + (wf.surface(-600, 0, 0).T - tW).toFixed(3) + ', with a dew point near ' + wf.surface(-600, 0, 0).Td.toFixed(1) + ') and a stationary one 8 K (' + (st.surface(-600, 0, 0).T - tW).toFixed(3) + '), both moist and neither as dry as the polar air (' + cf.surface(-500, 0, 0).Td.toFixed(1) + ')',
    near(wf.surface(-600, 0, 0).T - tW, -10, 0.01) && near(st.surface(-600, 0, 0).T - tW, -8, 0.01) && wf.surface(-600, 0, 0).Td > cf.surface(-500, 0, 0).Td + 5);
  const dl = mk([{ type: 'dryline', pts: north(0), dry: 'left', contrast: 12, width: 20 }]), td = none.surface(0, 0, 0).Td;
  check('behind a dryline of 12 K the dew point is 12 K lower (' + (dl.surface(-300, 0, 0).Td - td).toFixed(3) + ', in the dry side, to the left), on the moist side what it was (' + (dl.surface(300, 0, 0).Td - td).toFixed(3) + '), the dry air hotter (' + (dl.surface(-300, 0, 0).T - tW).toFixed(2) + ' K) and the condensation level far higher (' + S.indices(dl.sounding(-300, 0, 0)).mllcl.toFixed(0) + ' m)',
    near(dl.surface(-300, 0, 0).Td - td, -12, 0.4) && near(dl.surface(300, 0, 0).Td - td, 0, 0.01) && dl.surface(-300, 0, 0).T > tW + 2 && S.indices(dl.sounding(-300, 0, 0)).mllcl > 2500);
  const dryAt = (x, z) => { const k = Math.round(z / dz), q = dl.sounding(x, 0, 0).table.qv[k]; return q; };
  check('the dry air rides over the moist air towards the east at 1 in 40: at 2 km the air 80 km east of the line is half dry (the vapour ' + (dryAt(80, 2000) * 1000).toFixed(2) + ' g/kg between the moist ' + (dryAt(500, 2000) * 1000).toFixed(2) + ' and the dry ' + (dryAt(-500, 2000) * 1000).toFixed(2) + '), at the ground the line is where it was drawn',
    dryAt(80, 2000) > dryAt(-500, 2000) && dryAt(80, 2000) < dryAt(500, 2000) && dryAt(80, 2000) < dryAt(500, 2000) * 0.8 + dryAt(-500, 2000) * 0.2 + 1e-4 && near(dryAt(0, 0), (dryAt(-500, 0) + dryAt(500, 0)) / 2, 0.6e-3));
  const of = mk([{ type: 'outflow', pts: north(0), cool: 'left', contrast: 4, width: 10 }]);
  const off = (x, z) => of.sounding(x, 0, 0).table.theta[Math.round(z / dz)] - none.sounding(x, 0, 0).table.theta[Math.round(z / dz)];
  check('an outflow of 4 K is 4 K colder behind its line (' + (of.surface(-100, 0, 0).T - tW).toFixed(3) + '), a dome that is shallow: 10 km behind it, at 1 km the colder air is ' + (100 * off(-10, 1000) / off(-10, 0)).toFixed(1) + ' % of what it is at the ground (and a cold front\'s dome ' + (100 * (cf.sounding(-10, 0, 0).table.theta[10] - none.sounding(-10, 0, 0).table.theta[10]) / (cf.sounding(-10, 0, 0).table.theta[0] - none.sounding(-10, 0, 0).table.theta[0])).toFixed(0) + ' %)',
    near(of.surface(-100, 0, 0).T - tW, -4, 0.01) && Math.abs(off(-10, 1000) / off(-10, 0)) < 0.1 && Math.abs(off(-10, 3000)) < 0.05);
  const mx = mk([{ type: 'moisture', pts: north(0), amount: 3, width: 200 }]), q0 = none.sounding(0, 0, 0).table.qv, q1 = mx.sounding(0, 0, 0).table.qv, q2 = mx.sounding(600, 0, 0).table.qv;
  check('a moist tongue of 3 K raises the vapour by 6.5 % a kelvin at the ground (' + (q1[0] / q0[0]).toFixed(4) + ' of what it was on its axis), by e^-0.1 of that at 200 m (' + (q1[2] / q0[2]).toFixed(4) + '), and does nothing three widths away (' + (q2[0] / q0[0]).toFixed(5) + ')',
    near(q1[0] / q0[0], 1 + 3 * 0.065, 1e-9) && near(q1[2] / q0[2], 1 + 3 * 0.065 * Math.exp(-0.1), 1e-9) && near(q2[0] / q0[0], 1, 1e-3));
}

/* 6. Lines that move, end, overlap: translation, the fade at the ends, the coldest air wins. */
{
  const mov = mk([{ type: 'front', kind: 'cold', pts: north(0), cold: 'left', contrast: 12, width: 40, motion: { u: 10, v: 0 } }, { type: 'low', x: 0, y: 0, depth: 12, size: 300, motion: { u: 10, v: 0 } }]), still = mk([{ type: 'front', kind: 'cold', pts: north(0), cold: 'left', contrast: 12, width: 40 }, { type: 'low', x: 0, y: 0, depth: 12, size: 300 }]);
  const ok = [[-200, 100], [0, -50], [150, 700]].every(([x, y]) => near(mov.surface(x, y, 3).T, still.surface(x - 108, y, 0).T, 1e-9) && near(mov.surface(x, y, 3).p, still.surface(x - 108, y, 0).p, 1e-9) && near(mov.surface(x, y, 3).u, still.surface(x - 108, y, 0).u, 1e-9));
  check('everything that moves is the same picture moved: after 3 hours at 10 m/s east (108 km) the ground\'s temperature, pressure and wind at (x, y) are those of the drawing at (x - 108, y)', ok);
  const short = mk([{ type: 'front', kind: 'cold', pts: [[0, -100], [0, 100]], cold: 'left', contrast: 12, width: 40 }]), tW = mk([]).surface(0, 0, 0).T;
  check('a front fades beyond its ends: 200 km past the north end (and 500 km behind it) the cold is e^-1 of its 12 K (' + (short.surface(-500, 300, 0).T - tW).toFixed(3) + ' against ' + (-12 / E).toFixed(3) + '), 400 km past it e^-4 (' + (short.surface(-500, 500, 0).T - tW).toFixed(3) + ')',
    near(short.surface(-500, 300, 0).T - tW, -12 / E, 0.02) && near(short.surface(-500, 500, 0).T - tW, -12 * Math.exp(-4), 0.02));
  const both = mk([{ type: 'dryline', pts: north(100), dry: 'left', contrast: 12, width: 20 }, { type: 'front', kind: 'cold', pts: north(0), cold: 'left', contrast: 12, width: 40 }]);
  const alone = mk([{ type: 'front', kind: 'cold', pts: north(0), cold: 'left', contrast: 12, width: 40 }]), dry = mk([{ type: 'dryline', pts: north(100), dry: 'left', contrast: 12, width: 20 }]);
  check('where a cold front and a dryline overlap the colder air wins: west of both the air is the front\'s (' + (both.surface(-400, 0, 0).T - tW).toFixed(3) + ' against ' + (alone.surface(-400, 0, 0).T - tW).toFixed(3) + ' and a dew point of ' + both.surface(-400, 0, 0).Td.toFixed(2) + ' against ' + alone.surface(-400, 0, 0).Td.toFixed(2) + '), between them it is the dryline\'s, less the front\'s tail (' + (both.surface(50, 0, 0).T - tW).toFixed(2) + ' K against ' + (dry.surface(50, 0, 0).T - tW).toFixed(2) + ')',
    near(both.surface(-400, 0, 0).T, alone.surface(-400, 0, 0).T, 0.01) && near(both.surface(-400, 0, 0).Td, alone.surface(-400, 0, 0).Td, 0.01) && both.surface(50, 0, 0).T > dry.surface(50, 0, 0).T - 2 && both.surface(50, 0, 0).T < dry.surface(50, 0, 0).T + 0.1 && both.surface(50, 0, 0).T > tW + 1);
}

/* 7. The wind in a sounding is the wind at its heights; the surface is the sounding's and the pressure's. */
{
  const a = mk([{ type: 'low', x: 0, y: 0, depth: 15, size: 400 }, { type: 'jet', pts: [[-1000, 100], [1000, 100]], speed: 25, width: 250 }, { type: 'llj', pts: [[300, -500], [300, 500]], speed: 18, width: 150 }]);
  const e = a.sounding(250, -50, 0), w = (z) => a.windAt(250, -50, z, 0);
  check('the wind of a sounding goes through the wind at its heights (at 1, 3 and 9.5 km: ' + [1000, 3000, 10000].map((z) => e.uG(z).toFixed(3) + '/' + w(z)[0].toFixed(3)).join(', ') + '), and the ground at 1015 minus the low\'s ' + e.table.pi[0].toFixed(5),
    [250, 1000, 3000, 6000, 10000].every((z) => near(e.uG(z), w(z)[0], 1e-6) && near(e.vG(z), w(z)[1], 1e-6)) && near(1e5 * Math.pow(e.table.pi[0], C.consts.CP / C.consts.RD), a.pressure(250, -50, 0) * 100, 1e-3));
  const sf = a.surface(250, -50, 0), ww = a.windAt(250, -50, 10, 0);
  check('the surface is the sounding\'s ground and the wind at 10 m (a wind of ' + sf.speed.toFixed(2) + ' m/s from ' + sf.dir.toFixed(0) + ' degrees, ' + sf.T.toFixed(1) + ' C, dew point ' + sf.Td.toFixed(1) + ')', near(sf.u, ww[0], 1e-12) && near(sf.v, ww[1], 1e-12) && near(sf.speed, Math.hypot(ww[0], ww[1]), 1e-12) && near(sf.T, e.table.theta[0] * e.table.pi[0] - 273.15, 1e-9) && near(sf.p, a.pressure(250, -50, 0), 1e-12));
  const lw = mk([{ type: 'low', x: 0, y: 0, depth: 15, size: 400 }], { aloft: { speed: 0 } }), e1 = lw.surface(400, 0, 0), n1 = lw.surface(0, 400, 0), s1 = lw.surface(0, -400, 0), w1 = lw.surface(-400, 0, 0), ang = 28 * Math.exp(-10 / 700);
  check('the direction the wind comes from: a south wind turned 27.6 degrees towards the low comes from 152.4 (east of the low), 62.4 on the low\'s north (an east-north-east wind), 242.4 on its south and 332.4 on its west (' + [e1.dir, n1.dir, s1.dir, w1.dir].map((d) => d.toFixed(1)).join(', ') + ')',
    near(e1.dir, 180 - ang, 0.1) && near(n1.dir, 90 - ang, 0.1) && near(s1.dir, 270 - ang, 0.1) && near(w1.dir, 360 - ang, 0.1));
  const none = mk([]).surface(0, 0, 0), eq = (1.5 * 0 + 0.0155 * 101500 / (0.622 + 0.0155)) / 100, lg = Math.log(eq / 6.112);
  check('the ground of the warm air mass at 1015 hPa: ' + none.T.toFixed(3) + ' C (theta 301 K times the Exner function, minus 273.15: ' + (301 * pi(1015) - 273.15).toFixed(3) + ') and a dew point of ' + none.Td.toFixed(3) + ' C (15.5 g/kg: Bolton\'s ' + (243.5 * lg / (17.67 - lg)).toFixed(3) + ')',
    near(none.T, 301 * pi(1015) - 273.15, 1e-3) && near(none.Td, 243.5 * lg / (17.67 - lg), 1e-3) && near(none.p, 1015, 1e-12) && near(none.Td, 20.885, 0.01));
}

/* 8. A map is its points; the CIN of air with no free convection is not below -1000; every field is a number. */
{
  const a = mk([{ type: 'low', x: -100, y: 50, depth: 14, size: 350 }, { type: 'front', kind: 'cold', pts: [[-100, 50], [-150, -150], [-250, -350]], cold: 'right' }, { type: 'front', kind: 'warm', pts: [[-100, 50], [150, 40], [400, 60]], cold: 'left' }]);
  const F = a.fields(0, { x0: -300, x1: 300, y0: -300, y1: 300, nx: 4, ny: 3 });
  let same = true, finite = true, lowCin = true;
  for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) {
    const x = -300 + 600 * i / 3, y = -300 + 600 * j / 2, q = j * 4 + i, env = a.sounding(x, y, 0, { dz: 100, top: 16000 }), ix = S.indices(env), s = a.surface(x, y, 0);
    same = same && near(F.mlcape[q], ix.mlcape, 0.01) && near(F.mllcl[q], ix.mllcl, 0.01) && near(F.shear06[q], ix.shear06, 1e-3) && near(F.srh01[q], ix.srh01, 0.01) && near(F.stp[q], ix.stp, 1e-4) && near(F.mslp[q], s.p, 1e-3) && near(F.u[q], s.u, 1e-4) && near(F.Td[q], s.Td, 1e-3);
    for (const nm of F.names) finite = finite && Number.isFinite(F[nm][q]);
    lowCin = lowCin && F.mlcin[q] >= -1000 && F.mlcin[q] <= 0;
  }
  check('a map of 4 x 3 points has, at each, the numbers of the sounding there (the indices and the surface), every field is finite, the CIN between -1000 and 0 (the fields: ' + F.names.join(' ') + ')', same && finite && lowCin && F.nx === 4 && F.ny === 3 && F.mlcape.length === 12);
  const warmI = S.indices(a.sounding(300, -250, 0)), coldI = S.indices(a.sounding(-400, 250, 0));
  check('a day drawn with a low, a cold front and a warm front has a warm sector with CAPE (' + warmI.mlcape.toFixed(0) + ' J/kg at (300, -250)) and cold air with none (' + coldI.mlcape.toFixed(0) + ' behind the cold front)', warmI.mlcape > 2000 && coldI.mlcape < 100);
}

/* 9. The refusals, determinism, and a drawing that is not touched. */
{
  const bad1 = thrown(() => A.create({ objects: [{ type: 'tornado' }] })), bad2 = thrown(() => A.create({ objects: [{ type: 'front', pts: [[0, 0]] }] })), bad3 = thrown(() => A.create({ objects: [{ type: 'front', kind: 'squall', pts: [[0, 0], [1, 1]] }] })), bad4 = thrown(() => A.create({ objects: [{ type: 'jet' }] }));
  check('an object of a kind that does not exist, a line of one point, a front of no kind and a jet with no line are refused with a word (' + [bad1, bad2, bad3, bad4].map((m) => (m || '').slice(0, 40)).join(' | ') + ')',
    /no object of type tornado/.test(bad1) && /needs a line of at least two points/.test(bad2) && /no front of kind squall/.test(bad3) && /needs a line/.test(bad4));
  const d = { lat: 35, objects: [{ type: 'low', x: 0, y: 0 }, { type: 'front', kind: 'cold', pts: [[0, 0], [10, 10]], motion: { u: 5, v: 1 } }] }, before = JSON.stringify(d), a = A.create(d), b = A.create(d);
  a.sounding(30, 5, 2); a.fields(1, { nx: 2, ny: 2 });
  check('building and using an analysis leaves the drawing as it was, and the same drawing gives the same numbers twice (' + a.surface(30, 5, 2).T.toFixed(6) + ')', JSON.stringify(d) === before && a.surface(30, 5, 2).T === b.surface(30, 5, 2).T && a.pressure(3, 4, 1) === b.pressure(3, 4, 1));
  const lat0 = A.create({ lat: 0, objects: [{ type: 'low', x: 0, y: 0, depth: 10, size: 300 }] }), w = lat0.geostrophic(300, 0, 0);
  check('at the equator the Coriolis parameter is kept from vanishing (' + lat0.f + ') and the wind stays finite (' + Math.hypot(w.u, w.v).toFixed(1) + ' m/s)', lat0.f === 2e-5 && Number.isFinite(w.v) && w.v > 0);
}

/* 10. The defaults of every kind of line, the weights where the formulae put them, the order of the air masses, the safeguard of the blend, and the supercell composite of a map. */
{
  const none = mk([]), tW = none.surface(0, 0, 0).T, dz = 100, mkT = (spec) => S.make(Object.assign({}, spec, { winds: [[0, 0, 0], [12000, 0, 0]], jets: [], motion: { u: 0, v: 0 } })).table, warm = mkT(S.presets.tornado), P0 = pi(1015);
  const KINDS = { cold: { c: 12, w: 40, s: 80, air: 'cold' }, warm: { c: 10, w: 60, s: 150, air: 'cool' }, stationary: { c: 8, w: 50, s: 100, air: 'cool' }, occluded: { c: 8, w: 50, s: 100, air: 'cold' } };
  const nom = { cold: 13, cool: 10 };
  for (const [kind, K] of Object.entries(KINDS)) {
    const a = mk([{ type: 'front', kind, pts: north(0), cold: 'left' }]), air = mkT(A.AIR_SPEC[K.air]);
    const share = (x, z) => { const k = Math.round(z / dz), th = a.sounding(x, 0, 0).table.theta[k]; return (th - warm.theta[k * 10]) / ((K.c / nom[K.air] / P0) * (air.theta[k * 10] - warm.theta[k * 10])); };
    const dT = (x) => a.surface(x, 0, 0).T - tW, tdW = none.surface(0, 0, 0).Td;
    check('a ' + kind + ' front with nothing set: ' + K.c + ' K colder behind it (' + dT(-700).toFixed(3) + '), its width ' + K.w + ' km (' + (dT(-K.w) / dT(-700)).toFixed(3) + ' of the cold one width behind the line, 0.881), its surface leaning 1 in ' + K.s + ' (the share at 1 km is half ' + K.s + ' km behind: ' + share(-K.s, 1000).toFixed(4) + '), the air a ' + (K.air === 'cold' ? 'dry polar one' : 'moist cool one') + ' (dew point ' + a.surface(-700, 0, 0).Td.toFixed(1) + ')',
      near(dT(-700), -K.c, 0.01) && near(dT(-K.w) / dT(-700), 0.8808, 0.01) && near(share(-K.s, 1000), 0.5, 2e-3) && (K.air === 'cold' ? a.surface(-700, 0, 0).Td < tdW - 7 : a.surface(-700, 0, 0).Td > 14));
  }
  const of = mk([{ type: 'outflow', pts: north(0) }]), ofT = (x) => of.surface(x, 0, 0).T - tW, ofAir = mkT(A.AIR_SPEC.cold), ofShare = (x, z) => { const k = Math.round(z / dz); return (of.sounding(x, 0, 0).table.theta[k] - warm.theta[k * 10]) / ((4 / 13 / P0) * (ofAir.theta[k * 10] - warm.theta[k * 10])); };
  check('an outflow with nothing set: 4 K colder behind its line (' + ofT(-300).toFixed(3) + '), its width 10 km (' + (ofT(-10) / ofT(-300)).toFixed(3) + ' one width behind it) and its dome leaning 1 in 25: at 500 m the share is half 12.5 km behind the line (' + ofShare(-12.5, 500).toFixed(4) + ')',
    near(ofT(-300), -4, 0.01) && near(ofT(-10) / ofT(-300), 0.8808, 0.01) && near(ofShare(-12.5, 500), 0.5, 2e-3));
  const mx = mk([{ type: 'moisture', pts: north(0) }]);
  check('a moist tongue with nothing set: 3 K of dew point (6.5 % a kelvin), 200 km wide: at 200 km the vapour is raised by ' + (100 * (mx.sounding(200, 0, 0).table.qv[0] / none.sounding(0, 0, 0).table.qv[0] - 1)).toFixed(3) + ' % (3 x 6.5 % x e^-1 = ' + (100 * 3 * 0.065 / E).toFixed(3) + ')', near(mx.sounding(200, 0, 0).table.qv[0] / none.sounding(0, 0, 0).table.qv[0], 1 + 3 * 0.065 / E, 1e-9));
  const dl = mk([{ type: 'dryline', pts: north(0), dry: 'left' }]), qvAt = (x, k) => dl.sounding(x, 0, 0).table.qv[k], dshare = (x, k) => (qvAt(500, k) - qvAt(x, k)) / (qvAt(500, k) - qvAt(-500, k));
  check('a dryline with nothing set is 20 km wide and leans over the moist air at 1 in 40: the dry share is ' + dshare(-20, 0).toFixed(4) + ' (0.8808) 20 km behind it at the ground, and at 2 km it is half 80 km ahead of the ground line (' + dshare(80, 20).toFixed(4) + '), at 1 km half 40 km ahead (' + dshare(40, 10).toFixed(4) + ')',
    near(dshare(-20, 0), 0.8808, 1e-3) && near(dshare(80, 20), 0.5, 1e-3) && near(dshare(40, 10), 0.5, 1e-3));
  const cf = mk([{ type: 'front', kind: 'cold', pts: north(0), cold: 'left' }]), wf = mk([{ type: 'front', kind: 'warm', pts: north(0), cold: 'left' }]), o1 = mk([{ type: 'front', kind: 'warm', pts: north(0), cold: 'left' }, { type: 'front', kind: 'cold', pts: north(0), cold: 'left' }]), o2 = mk([{ type: 'front', kind: 'cold', pts: north(0), cold: 'left' }, { type: 'front', kind: 'warm', pts: north(0), cold: 'left' }]);
  check('where a warm front and a cold front lie on each other the cold air wins whatever order they were drawn in (' + [o1, o2].map((o) => (o.surface(-600, 0, 0).T - cf.surface(-600, 0, 0).T).toFixed(4) + ' K, dew point ' + o.surface(-600, 0, 0).Td.toFixed(2)).join('; ') + ', the cold one alone ' + cf.surface(-600, 0, 0).Td.toFixed(2) + ')',
    near(o1.surface(-600, 0, 0).T, cf.surface(-600, 0, 0).T, 0.01) && near(o2.surface(-600, 0, 0).T, cf.surface(-600, 0, 0).T, 0.01) && near(o1.surface(-600, 0, 0).Td, cf.surface(-600, 0, 0).Td, 0.01) && wf.surface(-600, 0, 0).Td > cf.surface(-600, 0, 0).Td + 5);
  const deep = mk([{ type: 'front', kind: 'cold', pts: north(0), cold: 'left' }]).sounding(-1000, 0, 0), th = deep.table.theta; let flat = 0, monotone = true; for (let i = 1; i < th.length; i++) { if (th[i] < th[i - 1]) monotone = false; if (th[i] === th[i - 1]) flat++; }
  check('1000 km behind a cold front the polar air reaches 12.5 km, higher than its own tropopause is under the warm air\'s, and theta there would fall with height where the two meet; the blend is held to never falling (monotone: ' + monotone + ', ' + flat + ' levels held)', monotone && flat > 0);
  const a = mk([{ type: 'low', x: -100, y: 50, depth: 14, size: 350 }, { type: 'front', kind: 'cold', pts: [[-100, 50], [-150, -150], [-250, -350]], cold: 'right' }, { type: 'jet', pts: [[-500, -300], [0, 100], [500, 300]] }]), F = a.fields(0, { x0: -300, x1: 300, y0: -300, y1: 300, nx: 5, ny: 4 });
  let scpOk = true, worst = 0;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) {
    const x = -300 + 600 * i / 4, y = -300 + 600 * j / 3, q = j * 5 + i, ix = S.indices(a.sounding(x, y, 0, { dz: 100, top: 16000 })), want = Math.max(0, ix.mlcape / 1000) * Math.max(0, ix.srh03 / 50) * (ix.shear06 < 10 ? 0 : Math.min(1.5, ix.shear06 / 20)) * (ix.mlcin > -40 ? 1 : -40 / ix.mlcin);
    worst = Math.max(worst, Math.abs(F.scp[q] - want) / (1 + want)); if (!(Math.abs(F.scp[q] - want) <= 1e-4 * (1 + want))) scpOk = false;
  }
  check('the supercell composite of a map is CAPE / 1000 times helicity of 0-3 km / 50 times 0-6 km shear / 20 (nothing under 10 m/s, at most 1.5) times -40 / CIN where the CIN is under -40: at every one of 20 points (worst ' + worst.toExponential(1) + ' of its size)', scpOk && Math.max(...F.scp) > 0.5);
}

/* 11. What every object does when only its place is given (the documented defaults), every kind of object moving along its arrow, the ends of lines, strong contrasts, and the order of overlapping air masses. */
{
  const q = (obj, extra) => mk([obj], Object.assign({ aloft: { speed: 0 } }, extra));
  const lo = q({ type: 'low', x: 0, y: 0 }), hi = q({ type: 'high', x: 0, y: 0 }), tr = q({ type: 'trough', pts: [[-500, 0], [500, 0]] });
  check('a low with only its place is 15 hPa deep and 400 km across (' + lo.pressure(0, 0, 0) + ', ' + lo.pressure(400, 0, 0).toFixed(3) + '), a high 10 hPa and 600 km (' + hi.pressure(0, 0, 0) + ', ' + hi.pressure(600, 0, 0).toFixed(3) + '), a trough 4 hPa and 120 km (' + tr.pressure(0, 0, 0) + ', ' + tr.pressure(0, 120, 0).toFixed(3) + ')',
    near(lo.pressure(0, 0, 0), 1000, 1e-9) && near(lo.pressure(400, 0, 0), 1015 - 15 / E, 1e-9) && near(hi.pressure(0, 0, 0), 1025, 1e-9) && near(hi.pressure(600, 0, 0), 1015 + 10 / E, 1e-9) && near(tr.pressure(0, 0, 0), 1011, 1e-9) && near(tr.pressure(0, 120, 0), 1015 - 4 / E, 1e-9));
  const jt = q({ type: 'jet', pts: [[-1000, 0], [1000, 0]] }), ll = q({ type: 'llj', pts: [[0, -500], [0, 500]] }), ut = q({ type: 'utrough', x: 0, y: 0 });
  check('a jet with only its line is 25 m/s and 250 km wide (' + jt.windAt(0, 0, 9500, 0)[0].toFixed(3) + ', ' + jt.windAt(0, 250, 9500, 0)[0].toFixed(3) + '), a low-level jet 18 m/s and 150 km (' + ll.windAt(0, 0, 1500, 0)[1].toFixed(3) + ', ' + ll.windAt(150, 0, 1500, 0)[1].toFixed(3) + '), a circulation aloft 25 m/s at 500 km (' + ut.windAt(500, 0, 8000, 0)[1].toFixed(3) + ')',
    near(jt.windAt(0, 0, 9500, 0)[0], 25, 1e-9) && near(jt.windAt(0, 250, 9500, 0)[0], 25 / E, 1e-9) && near(ll.windAt(0, 0, 1500, 0)[1], 18, 1e-9) && near(ll.windAt(150, 0, 1500, 0)[1], 18 / E, 1e-9) && near(ut.windAt(500, 0, 8000, 0)[1], 25, 1e-9));
  const w11 = mk([]).windAt(0, 0, 11000, 0), u10 = -30 * Math.sin(255 * DEG);
  check('the flow aloft does not grow above 10 km (the same at 11 km: ' + w11[0].toFixed(4) + ' and ' + u10.toFixed(4) + ')', near(w11[0], u10, 1e-9));
  /* every kind of object moves: the picture after 3 hours at (10, -6) m/s is the picture at the start, moved 108 km east and 64.8 km south */
  const objects = (m) => [{ type: 'low', x: 0, y: 0, depth: 12, size: 300, motion: m }, { type: 'high', x: 300, y: 400, rise: 8, size: 400, motion: m }, { type: 'trough', pts: [[-200, 100], [200, 150]], depth: 4, width: 100, motion: m },
    { type: 'front', kind: 'cold', pts: north(-250), cold: 'left', motion: m }, { type: 'dryline', pts: north(-100), dry: 'left', motion: m }, { type: 'outflow', pts: [[0, -300], [100, 300]], cool: 'right', contrast: 5, width: 15, motion: m },
    { type: 'moisture', pts: north(150), amount: 3, width: 150, motion: m }, { type: 'jet', pts: [[-800, -300], [800, 300]], speed: 30, width: 200, motion: m }, { type: 'llj', pts: [[100, -500], [100, 500]], speed: 15, width: 120, motion: m },
    { type: 'utrough', x: -100, y: 200, speed: 20, size: 400, motion: m }];
  const mv = mk(objects({ u: 10, v: -6 })), st = mk(objects(null)), dx = 108, dy = -64.8;
  let worstP = 0, worstT = 0, worstW = 0, worstQ = 0;
  for (const [x, y] of [[-150, 40], [60, -120], [200, 250], [-300, -200], [20, 90]]) {
    const a = mv.surface(x + dx, y + dy, 3), b = st.surface(x, y, 0), ea = mv.sounding(x + dx, y + dy, 3), eb = st.sounding(x, y, 0);
    worstP = Math.max(worstP, Math.abs(a.p - b.p)); worstT = Math.max(worstT, Math.abs(a.T - b.T)); worstQ = Math.max(worstQ, Math.abs(ea.table.qv[10] - eb.table.qv[10]) * 1000);
    for (const z of [1500, 4000, 8000, 9500]) worstW = Math.max(worstW, Math.abs(ea.uG(z) - eb.uG(z)), Math.abs(ea.vG(z) - eb.vG(z)));
  }
  check('every kind of object goes along its arrow: after 3 hours at (10, -6) m/s the pressure, temperature, moisture and the winds at 1.5, 4, 8 and 9.5 km at (x + 108, y - 64.8) km are those of the picture at (x, y) (worst: ' + worstP.toExponential(1) + ' hPa, ' + worstT.toExponential(1) + ' K, ' + worstQ.toExponential(1) + ' g/kg, ' + worstW.toExponential(1) + ' m/s), for a low, a high, a trough, a front, a dryline, an outflow, a moist tongue, two jets and a circulation aloft',
    worstP < 1e-9 && worstT < 1e-9 && worstQ < 1e-9 && worstW < 1e-6);
  /* the ends */
  const fe = mk([{ type: 'front', kind: 'cold', pts: [[0, -100], [0, 100]], cold: 'left', contrast: 12, width: 40 }]);
  check('the pressure of a front fades past its end as well: 60 km north of it, where the kink is e^-1 of 1.2 hPa on the line, it is also times e^-0.09 (' + fe.pressure(0, 160, 0).toFixed(4) + ' against ' + (1015 - 1.2 * Math.exp(-1) * Math.exp(-0.09)).toFixed(4) + ')', near(fe.pressure(0, 160, 0), 1015 - 1.2 * Math.exp(-1) * Math.exp(-0.09), 1e-9));
  const jf = mk([{ type: 'jet', pts: [[-200, 0], [200, 0]], speed: 25, width: 250 }], { aloft: { speed: 0 } }).windAt(300, 0, 9500, 0)[0], mf = mk([{ type: 'moisture', pts: [[0, -100], [0, 100]], amount: 3, width: 200 }]), mq = mf.sounding(0, 300, 0).table.qv[0] / mk([]).sounding(0, 0, 0).table.qv[0];
  check('a jet fades past its end: 100 km east of it, 25 m/s times e^-0.16 across the line and e^-0.25 past the end (' + jf.toFixed(3) + ' against ' + (25 * Math.exp(-0.16) * Math.exp(-0.25)).toFixed(3) + '), a moist tongue too (200 km past its end and 200 km off: ' + mq.toFixed(5) + ' against ' + (1 + 3 * 0.065 * Math.exp(-1) * Math.exp(-1)).toFixed(5) + ')',
    near(jf, 25 * Math.exp(-0.16) * Math.exp(-0.25), 1e-9) && near(mq, 1 + 3 * 0.065 * Math.exp(-2), 1e-9));
  /* sides given by nothing, strong contrasts, and the order of the air masses */
  const dc = mk([{ type: 'front', kind: 'cold', pts: north(0) }]), dd = mk([{ type: 'dryline', pts: north(0) }]), nn = mk([]), tdN = nn.surface(0, 0, 0).Td, tN = nn.surface(0, 0, 0).T;
  check('a front with no side given has its cold air to the left of the way it was drawn (west of a line drawn north: ' + (dc.surface(-500, 0, 0).T - tN).toFixed(2) + ' K, east ' + (dc.surface(500, 0, 0).T - tN).toFixed(2) + '), a dryline its dry air to the left (' + (dd.surface(-300, 0, 0).Td - tdN).toFixed(2) + ' K of dew point, east ' + (dd.surface(300, 0, 0).Td - tdN).toFixed(2) + ') and a drop of 12 K',
    near(dc.surface(-500, 0, 0).T - tN, -12, 0.01) && near(dc.surface(500, 0, 0).T - tN, 0, 0.01) && near(dd.surface(-300, 0, 0).Td - tdN, -12, 0.4) && near(dd.surface(300, 0, 0).Td - tdN, 0, 0.01));
  const big = mk([{ type: 'front', kind: 'cold', pts: north(0), cold: 'left', contrast: 26 }]), bs = big.sounding(-600, 0, 0), dr20 = mk([{ type: 'dryline', pts: north(0), dry: 'left', contrast: 20 }]);
  check('a front twice as strong as the polar air is gets twice its difference (26 K colder: ' + (big.surface(-600, 0, 0).T - tN).toFixed(3) + ', the vapour kept above nothing: ' + (bs.table.qv[0] * 1000).toExponential(2) + ' g/kg) and a dryline of 20 K drops the dew point 20 K (' + (dr20.surface(-300, 0, 0).Td - tdN).toFixed(2) + ')',
    near(big.surface(-600, 0, 0).T - tN, -26, 0.02) && bs.table.qv[0] > 0 && near(dr20.surface(-300, 0, 0).Td - tdN, -20, 0.5));
  const cfo = mk([{ type: 'front', kind: 'cold', pts: north(0), cold: 'left', contrast: 12 }]), of = mk([{ type: 'outflow', pts: north(0), cool: 'left', contrast: 4, width: 10 }]), b1 = mk([{ type: 'front', kind: 'cold', pts: north(0), cold: 'left', contrast: 12 }, { type: 'outflow', pts: north(0), cool: 'left', contrast: 4 }]), b2 = mk([{ type: 'outflow', pts: north(0), cool: 'left', contrast: 4 }, { type: 'front', kind: 'cold', pts: north(0), cold: 'left', contrast: 12 }]);
  check('where an outflow lies on a cold front the colder air is the front\'s, whichever was drawn first (' + [b1, b2].map((b) => (b.surface(-600, 0, 0).T - tN).toFixed(3)).join(', ') + ' K, the front alone ' + (cfo.surface(-600, 0, 0).T - tN).toFixed(3) + ', the outflow alone ' + (of.surface(-600, 0, 0).T - tN).toFixed(3) + ')',
    near(b1.surface(-600, 0, 0).T, cfo.surface(-600, 0, 0).T, 0.01) && near(b2.surface(-600, 0, 0).T, cfo.surface(-600, 0, 0).T, 0.01) && near(of.surface(-600, 0, 0).T - tN, -4, 0.01));
  const f6 = mk([{ type: 'front', kind: 'cold', pts: north(0), cold: 'left', contrast: 6 }]), d6 = mk([{ type: 'outflow', pts: north(0), cool: 'left' }, { type: 'front', kind: 'cold', pts: north(0), cold: 'left', contrast: 6 }]), d7 = mk([{ type: 'front', kind: 'cold', pts: north(0), cold: 'left', contrast: 6 }, { type: 'outflow', pts: north(0), cool: 'left' }]);
  check('an outflow with no contrast given (4 K) on a front of 6 K: the front\'s air wins in either order (' + [d6, d7].map((b) => (b.surface(-600, 0, 0).T - tN).toFixed(3)).join(', ') + ' K against the front alone ' + (f6.surface(-600, 0, 0).T - tN).toFixed(3) + ')', near(d6.surface(-600, 0, 0).T, f6.surface(-600, 0, 0).T, 0.01) && near(d7.surface(-600, 0, 0).T, f6.surface(-600, 0, 0).T, 0.01));
  const weakAloft = mk([{ type: 'front', kind: 'cold', pts: north(-300), cold: 'left' }], { aloft: { speed: 15, from: 255 } }), W = weakAloft.fields(0, { x0: 0, x1: 400, y0: -200, y1: 200, nx: 3, ny: 3 });
  check('a map where the 0-6 km shear is under 10 m/s has no supercell composite whatever the CAPE (shear ' + Math.max(...W.shear06).toFixed(1) + ' m/s, CAPE up to ' + Math.max(...W.mlcape).toFixed(0) + ', composite ' + Math.max(...W.scp) + ')', Math.max(...W.shear06) < 10 && Math.max(...W.mlcape) > 1000 && Math.max(...W.scp) === 0);
  const mm = thrown(() => A.create({ objects: [{ type: 'moisture' }] }));
  check('a moist tongue with no line is refused (' + (mm || '').slice(0, 50) + ')', /a moisture needs a line of at least two points/.test(mm));
}

/* 12. The air masses of a day can be changed: `air` changes keys of the spec of an air mass (the warmth, the moisture, the cap), on every grid, and one analysis's change never leaks into another. */
{
  const base = mk([]), moist = mk([], { air: { warm: { qv0: 12 } } }), warmer = mk([], { air: { warm: { theta0: 305 } } }), back = mk([]);
  const e0 = base.surface(0, 0, 0), e1 = moist.surface(0, 0, 0), e2 = warmer.surface(0, 0, 0), e3 = back.surface(0, 0, 0), x0 = S.indices(base.sounding(0, 0, 0)), x1 = S.indices(moist.sounding(0, 0, 0));
  check('a drier warm air (qv0 12 g/kg for 15.5) has a lower dew point (' + e1.Td.toFixed(2) + ' C for ' + e0.Td.toFixed(2) + ') and less CAPE (' + x1.mlcape.toFixed(0) + ' for ' + x0.mlcape.toFixed(0) + '), the same temperature (' + e1.T.toFixed(2) + ', ' + e0.T.toFixed(2) + ')',
    e0.Td - e1.Td > 4 && x1.mlcape < 0.7 * x0.mlcape && near(e1.T, e0.T, 0.05));
  check('a warmer warm air (theta0 305 K for 301) is 4 K warmer at the ground, up to the Exner function (' + (e2.T - e0.T).toFixed(2) + ' K)', near(e2.T - e0.T, 4 * pi(1015), 0.05));
  check('an analysis made after one with a change has none of it: the same numbers as the first (' + e3.Td.toFixed(2) + ' C, ' + e3.T.toFixed(2) + ' C against ' + e0.Td.toFixed(2) + ' C, ' + e0.T.toFixed(2) + ' C), and the one with the change is still itself (' + moist.surface(0, 0, 0).Td.toFixed(2) + ')',
    e3.Td === e0.Td && e3.T === e0.T && moist.surface(0, 0, 0).Td === e1.Td);
  const g = moist.sounding(0, 0, 0, { dz: 250, top: 16000 }), g0 = base.sounding(0, 0, 0, { dz: 250, top: 16000 });
  check('the change holds on another grid of the same day (dz 250 m, top 16 km: the vapour at the ground ' + (g.table.qv[0] * 1000).toFixed(2) + ' g/kg for ' + (g0.table.qv[0] * 1000).toFixed(2) + ' without it, and the change itself ' + (e1.Td - e0.Td).toFixed(2) + ' K of dew point)',
    near(g.table.qv[0] * 1000, 12, 0.3) && near(g0.table.qv[0] * 1000, 15.5, 0.4));
  const cold = mk([{ type: 'front', kind: 'cold', pts: north(0), cold: 'left', contrast: 12 }], { air: { cold: { theta0: 283 } } }), cold0 = mk([{ type: 'front', kind: 'cold', pts: north(0), cold: 'left', contrast: 12 }]);
  check('a change to the cold air keeps the front\'s drawn contrast at the ground (12 K: ' + (cold.surface(-600, 0, 0).T - cold.surface(600, 0, 0).T).toFixed(2) + ' K for ' + (cold0.surface(-600, 0, 0).T - cold0.surface(600, 0, 0).T).toFixed(2) + ') and changes the air aloft a little, as the contrast is held at the ground (the 3 km temperature ' + (cold.sounding(-600, 0, 0).table.theta[30] * cold.sounding(-600, 0, 0).table.pi[30] - 273.15).toFixed(2) + ' C for ' + (cold0.sounding(-600, 0, 0).table.theta[30] * cold0.sounding(-600, 0, 0).table.pi[30] - 273.15).toFixed(2) + ')',
    near(cold.surface(-600, 0, 0).T - cold.surface(600, 0, 0).T, -12, 0.1) && near(cold0.surface(-600, 0, 0).T - cold0.surface(600, 0, 0).T, -12, 0.1) && Math.abs(cold.sounding(-600, 0, 0).table.theta[30] - cold0.sounding(-600, 0, 0).table.theta[30]) > 0.3);
}

/* 13. The numbers at any list of points (the maps of the editor are made on a lattice of the screen): the same as the single-point calls, at the hour asked, in the order given, on the grid asked for. */
{
  const a = mk([{ type: 'low', x: -150, y: 80, depth: 14, size: 380, motion: { u: 6, v: 3 } }, { type: 'front', kind: 'cold', pts: [[-150, 80], [-250, -300]], cold: 'right', contrast: 12, motion: { u: 8, v: 0 } },
    { type: 'dryline', pts: [[-20, -400], [-60, 100]], dry: 'left', contrast: 14 }, { type: 'jet', pts: [[-600, 0], [600, 250]], speed: 30 }], { air: { warm: { qv0: 14 } } });
  const pts = [[-100, 50], [200, -120], [0, 300], [-60, -250]], c = a.columns(pts, 2, { dz: 250 });
  let worst = 0, ok = c.n === 4 && c.names.length === 13; for (let q = 0; q < pts.length; q++) {
    const [x, y] = pts[q], s = a.surface(x, y, 2), ix = S.indices(a.sounding(x, y, 2, { dz: 250, top: 16000 }));
    const pairs = [[c.mslp[q], s.p, 1e-2], [c.T[q], s.T, 1e-3], [c.Td[q], s.Td, 1e-3], [c.mlcape[q], ix.mlcape, 1e-3 * Math.max(1, ix.mlcape)], [c.shear06[q], ix.shear06, 1e-3], [c.srh01[q], ix.srh01, 1e-3 * Math.max(1, Math.abs(ix.srh01))], [c.stp[q], ix.stp, 1e-3 * Math.max(1, ix.stp)]];
    for (const [got, want, tol] of pairs) { worst = Math.max(worst, Math.abs(got - want) / tol); if (!(Math.abs(got - want) <= tol)) ok = false; }
  }
  check('the numbers at four scattered points at 2 hours (grid 250 m) are those of the single-point calls: the pressure, the temperature and dew point at the ground, the CAPE, shear, helicity and tornado parameter (worst ' + worst.toFixed(2) + ' of the tolerance)', ok && worst < 1);
  const c0 = a.columns(pts, 0, { dz: 250 }), diff = Math.abs(c0.T[0] - c.T[0]) + Math.abs(c0.mslp[1] - c.mslp[1]);
  check('the hour is the one asked for (the low and the fronts moved: the pressure at (200, -120) is ' + c0.mslp[1].toFixed(2) + ' at 0 hours and ' + c.mslp[1].toFixed(2) + ' at 2), and with no grid given it is 100 m', diff > 0.05 && Math.abs(c0.mslp[1] - c.mslp[1]) > 0.01 && a.columns([[0, 0]], 0).mlcape[0] === a.columns([[0, 0]], 0, { dz: 100 }).mlcape[0] && a.columns([], 0).n === 0);
  const f = a.fields(1, { x0: -300, x1: 300, y0: -200, y1: 200, nx: 3, ny: 2, dz: 250 }), cf = a.columns([[-300, -200], [0, -200], [300, -200], [-300, 200], [0, 200], [300, 200]], 1, { dz: 250 });
  check('a map is the columns of its lattice, row after row from the south-west corner (3 by 2: ' + Array.from(f.mlcape).map((x) => x.toFixed(0)).join(', ') + ')', ['mslp', 'T', 'Td', 'mlcape', 'shear06', 'stp'].every((nm) => Array.from(f[nm]).every((v, i) => v === cf[nm][i])));
}

console.log('\n' + passed + ' passed, ' + failed + ' failed (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
process.exit(failed ? 1 : 0);
