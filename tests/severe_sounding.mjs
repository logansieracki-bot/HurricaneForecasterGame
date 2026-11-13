// Node-only tests of the environment in a forecaster's terms (src/severe-sounding.js): the Weisman-Klemp day against WRF's own table and against the independent CAPE tool; the hydrostatic pressure; the
// buoyancy integral on profiles whose areas are known; the condensation level against Bolton's formula; the shear, the helicity and Bunkers' storm motion on hodographs with closed forms (a straight
// one and a circle); the significant tornado parameter on its definition; the mixed layer, the cap and the jet; the presets in the ranges of published tornado and hail days; and that the core accepts it.
import '../src/severe-core.js';
import '../src/severe-sounding.js';
import { loadSounding } from '../tools/severe_research/wk82.mjs';
import { capeOf } from '../tools/severe_research/wk82_cape.mjs';

const C = globalThis.HFSevereCore, S = globalThis.HFSevereSounding, { G, CP, RV1 } = C.consts;
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

/* 1. The Weisman-Klemp day: the family's own formulae give WRF's table. */
const tab = loadSounding(), wk = S.make(S.presets.wk82);
{
  let dt = 0, dq = 0, du = 0, dv = 0;
  for (let z = 0; z <= 20000; z += 50) { dt = Math.max(dt, Math.abs(wk.theta(z) - tab.theta(z))); dq = Math.max(dq, Math.abs(wk.qv(z) - tab.qv(z)) * 1000); du = Math.max(du, Math.abs(wk.u(z) - tab.u(z))); dv = Math.max(dv, Math.abs(wk.v(z) - tab.v(z))); }
  check('the Weisman-Klemp preset is the table of WRF\'s em_quarter_ss: theta to ' + dt.toFixed(3) + ' K, the vapour to ' + dq.toFixed(3) + ' g/kg, the winds to ' + du.toFixed(3) + ' and ' + dv.toFixed(3) + ' m/s (0 to 20 km)', dt < 0.01 && dq < 0.05 && du < 0.1 && dv < 0.1);
  check('and its frame is the table\'s: the storm moves at (8.0998, 4.9419) m/s over the ground', wk.motion.u === 8.0998 && wk.motion.v === 4.9419 && near(wk.uG(0), 0, 1e-9) && near(wk.vG(0), 0, 1e-9));
}

/* 2. The pressure is hydrostatic with the virtual temperature, from 1000 hPa at the ground. */
{
  const t = wk.table; let worst = 0;
  for (let k = 1; k < t.z.length; k++) { const thv = 0.5 * (t.theta[k] * (1 + RV1 * t.qv[k]) + t.theta[k - 1] * (1 + RV1 * t.qv[k - 1])), want = -G / (CP * thv); worst = Math.max(worst, Math.abs((t.pi[k] - t.pi[k - 1]) / (t.z[k] - t.z[k - 1]) - want) / Math.abs(want)); }
  check('the Exner function falls as -g / (cp theta_v) at every level of the table (to ' + worst.toExponential(1) + ' of itself), and is 1 at the ground (1000 hPa)', worst < 1e-3 && t.pi[0] === 1);
}

/* 3. The Weisman-Klemp day's CAPE is the independent tool's (and the published 2200 J/kg) */
const ixw = S.indices(wk), old = capeOf(tab);
check('the surface parcel\'s CAPE of the Weisman-Klemp day is ' + ixw.sbcape.toFixed(0) + ' J/kg against ' + old.cape.toFixed(0) + ' of the tool that was written first, its condensation level ' + ixw.sblcl + ' m against ' + old.lcl.toFixed(0) + ', its level of free convection ' + ixw.sblfc + ' against ' + old.lfc.toFixed(0) + ' and its equilibrium level ' + ixw.sbel + ' against ' + old.el.toFixed(0),
  rel(ixw.sbcape, old.cape) < 0.02 && near(ixw.sblcl, old.lcl, 30) && near(ixw.sblfc, old.lfc, 60) && near(ixw.sbel, old.el, 60) && ixw.sbcape > 2000 && ixw.sbcape < 2300);
{
  const Td = 292.18, T = 300, Tl = 1 / (1 / (Td - 56) + Math.log(T / Td) / 800) + 56, zl = (T - Tl) / 0.00976;       // Bolton (1980): the temperature at the lifting condensation level of a parcel of 300 K and a dew point of 19.03 C, and the height from the dry adiabat
  check('the condensation level of the surface parcel (' + ixw.sblcl + ' m) is Bolton\'s (' + zl.toFixed(0) + ' m) to 3 %', rel(ixw.sblcl, zl) < 0.03);
}

/* 4. The buoyancy integral on a profile of known areas: -0.5 K over 500 m, +2 K over 1 km, -1 K over 500 m, +1 K over 1 km, in air of 300 K. */
{
  const dz = 10, n = 301, z = Float64Array.from({ length: n }, (_, k) => k * dz), tvE = new Float64Array(n).fill(300), tvP = new Float64Array(n);
  for (let k = 0; k < n; k++) { const h = z[k] + 5; tvP[k] = 300 + (h < 500 ? -0.5 : h < 1500 ? 2 : h < 2000 ? -1 : 1); }
  const b = S.buoyancy(z, tvP, tvE, 0), k0 = G / 300;
  check('buoyancy: CAPE g/300 (2 K x 1 km + 1 K x 1 km) = ' + (k0 * 3000).toFixed(1) + ' J/kg (' + b.cape.toFixed(1) + '), CIN -g/300 x 0.5 K x 500 m = ' + (-k0 * 250).toFixed(1) + ' (' + b.cin.toFixed(1) + '), the level of free convection at the first layer that is buoyant, 490 to 500 m (' + b.lfc + '), and the equilibrium level at the top of the last one, 3000 m (' + b.el + '), the layer between the two warm ones not taken off',
    rel(b.cape, k0 * 3000) < 0.01 && rel(b.cin, -k0 * 250) < 0.03 && near(b.lfc, 490, 1e-9) && b.el === 3000);
  const b2 = S.buoyancy(z, tvP.map((v) => v - 5), tvE, 0);
  check('a parcel that is never warmer than its surroundings has no CAPE, no level of free convection and no equilibrium level', b2.cape === 0 && Number.isNaN(b2.lfc) && Number.isNaN(b2.el));
  const b3 = S.buoyancy(z, tvP, tvE, 805);
  check('buoyant air under the condensation level is not free convection: with the condensation level at 805 m, between two levels of the table, the level of free convection is there (' + b3.lfc + ') and the CIN is the 500 m of cold air under it alone', b3.lfc === 805 && rel(b3.cin, b.cin) < 0.03);
}

/* 5. Shear, helicity and Bunkers on hodographs with closed forms. */
{
  const a = 0.003, straight = S.make({ winds: [[0, 0, 0], [12000, 12000 * a, 0]], motion: { u: 0, v: 0 } });         // u = a z, v = 0
  const bk = S.bunkers(straight), m = a * 3000;
  check('a straight hodograph (u = 3 m/s per km): the 0-6 km mean wind ' + m.toFixed(1) + ' m/s, the right mover 7.5 m/s to its right (' + bk.right.u.toFixed(2) + ', ' + bk.right.v.toFixed(2) + ') and the left mover 7.5 to its left',
    near(bk.mean.u, m, 0.02) && near(bk.right.u, m, 0.05) && near(bk.right.v, -7.5, 0.02) && near(bk.left.v, 7.5, 0.02));
  const h = S.srh(straight, 0, 1000, { u: 0, v: -7.5 }), h0 = S.srh(straight, 0, 1000, { u: 0, v: 0 });
  check('its helicity for a storm 7.5 m/s south of the wind is 7.5 x 3 m/s per km x 1 km = ' + (7.5 * a * 1000).toFixed(1) + ' m2/s2 (' + h.toFixed(2) + '), and nothing for a storm on the hodograph\'s line (' + h0.toFixed(3) + ')', near(h, 7.5 * a * 1000, 0.05) && near(h0, 0, 1e-6));
  const R = 15, k = 0.002, nodes = []; for (let z = 0; z <= 6000; z += 50) nodes.push([z, R * Math.sin(k * z), R * Math.cos(k * z)]);
  const circle = S.make({ winds: nodes, motion: { u: 0, v: 0 } }), hc = S.srh(circle, 0, 1000, { u: 0, v: 0 }), hc3 = S.srh(circle, 0, 3000, { u: 0, v: 0 });
  check('a hodograph that turns clockwise at 0.002 rad/m, radius 15 m/s, storm at its centre: the helicity is R2 k H = ' + (R * R * k * 1000).toFixed(0) + ' m2/s2 over 1 km (' + hc.toFixed(1) + ') and ' + (R * R * k * 3000).toFixed(0) + ' over 3 km (' + hc3.toFixed(1) + '); turning the other way it is negative',
    rel(hc, R * R * k * 1000) < 0.005 && rel(hc3, R * R * k * 3000) < 0.005);
  const back = S.make({ winds: nodes.map((r) => [r[0], -r[1], r[2]]), motion: { u: 0, v: 0 } });
  check('a hodograph that turns the other way has the negative helicity', near(S.srh(back, 0, 1000, { u: 0, v: 0 }), -R * R * k * 1000, 3));
  const ix = S.indices(circle), dV = Math.hypot(R * Math.sin(k * 1000) - 0, R * Math.cos(k * 1000) - R);
  check('the bulk shear of 0-1 km is the length of the vector between the winds (' + ix.shear01.toFixed(2) + ' against ' + dV.toFixed(2) + ' m/s), and 0-6 km likewise', near(ix.shear01, dV, 0.02) && near(ix.shear06, Math.hypot(R * Math.sin(k * 6000), R * Math.cos(k * 6000) - R), 0.05));
}

/* 5b. The pieces that the first mutants showed nobody looked at: the monotone cubic against scipy's, the cap's curve, the grid's linear interpolation, the moisture cap in the mixed layer, Bunkers on a curved
       hodograph, the helicity of the indices, the buoyancy's trapezoid, the parcels of the indices. */
{
  const f = S.pchip([0, 1, 2, 12, 13, 20], [0, 10, 10.5, 11, 14, 14.2]);
  check('the monotone cubic through nodes that are not evenly spaced is scipy\'s PchipInterpolator\'s between the interior nodes (10.3544 at 1.5, 10.5533 at 2.5, 10.7293 at 7, 12.5073 at 12.5) and passes through every node',
    [[1.5, 10.3544199595], [2.5, 10.5532577741], [7, 10.7292725472], [12.5, 12.5073254049]].every(([x, y]) => near(f(x), y, 1e-8)) && [[0, 0], [1, 10], [2, 10.5], [12, 11], [13, 14], [20, 14.2]].every(([x, y]) => near(f(x), y, 1e-12)));
  const g = S.pchip([0, 1, 2], [0, 1, 0]); let mx = -1; for (let x = 0; x <= 2; x += 0.01) mx = Math.max(mx, g(x));
  check('and it does not overshoot a peak: through 0, 1, 0 it stays at or under 1 (' + mx.toFixed(6) + ')', mx <= 1 + 1e-12 && near(g(1), 1, 1e-12) && g(-5) === 0 && g(9) === 0);
  const e = S.make({ theta0: 302, qv0: 15, ml: 1000, cap: 3, capDepth: 400, ztr: 12000, thetaTr: 343 }), x = 0.25;
  check('the cap rises by the smoothstep 3x2 - 2x3 of the way (a quarter of the way up the cap, 0.156 of it), plus the usual growth: ' + e.theta(1100).toFixed(4) + ' K', near(e.theta(1100), 302 + 3 * (x * x * (3 - 2 * x)) + (343 - 302 - 3) * Math.pow(100 / 11000, 1.25), 1e-9));
  check('between the levels of the 10 m table the profile is linear: the value in the middle of a cell is the mean of its ends (theta, the vapour, a wind)', near(e.theta(1805), 0.5 * (e.theta(1800) + e.theta(1810)), 1e-12) && near(e.qv(2305), 0.5 * (e.qv(2300) + e.qv(2310)), 1e-15) && near(wk.theta(5005), 0.5 * (wk.theta(5000) + wk.theta(5010)), 1e-12));
  const m = S.make({ theta0: 302, qv0: 18, ml: 1000, cap: 3, rhMax: 0.95 }), tt = m.table; let rh = 0; for (let k = 0; tt.z[k] <= 1000; k++) rh = Math.max(rh, tt.qv[k] / S.qvsAt(tt.theta[k] * tt.pi[k], 1e5 * Math.pow(tt.pi[k], CP / C.consts.RD)));
  check('in a mixed layer that is too moist the moisture is held at 95 % of saturation, not above: the most is ' + (100 * rh).toFixed(2) + ' % and the vapour at 900 m (' + (m.qv(900) * 1000).toFixed(2) + ' g/kg) is under the surface\'s (' + (m.qv(0) * 1000).toFixed(2) + ')', rh <= 0.95 + 1e-9 && rh > 0.949 && m.qv(900) * 1000 < m.qv(0) * 1000 - 1);
}
{
  const R = 15, k = 0.002, nodes = []; for (let z = 0; z <= 6000; z += 50) nodes.push([z, R * Math.sin(k * z), R * Math.cos(k * z)]);
  const circle = S.make({ winds: nodes, motion: { u: 0, v: 0 } }), b = S.bunkers(circle);
  const mean = (z0, z1) => ({ u: R * (Math.cos(k * z0) - Math.cos(k * z1)) / (k * (z1 - z0)), v: R * (Math.sin(k * z1) - Math.sin(k * z0)) / (k * (z1 - z0)) });
  const m = mean(0, 6000), lo = mean(0, 500), hi = mean(5500, 6000), sx = hi.u - lo.u, sy = hi.v - lo.v, sp = Math.hypot(sx, sy);
  check('Bunkers on a hodograph that turns (the means from the circle\'s closed form: 0-6 km mean ' + m.u.toFixed(2) + ', ' + m.v.toFixed(2) + '; the shear between the means of 0-0.5 and 5.5-6 km): the right mover is (' + (m.u + 7.5 * sy / sp).toFixed(2) + ', ' + (m.v - 7.5 * sx / sp).toFixed(2) + ') and the left one the mirror',
    near(b.mean.u, m.u, 0.03) && near(b.mean.v, m.v, 0.03) && near(b.right.u, m.u + 7.5 * sy / sp, 0.03) && near(b.right.v, m.v - 7.5 * sx / sp, 0.03) && near(b.left.u, m.u - 7.5 * sy / sp, 0.03) && near(b.left.v, m.v + 7.5 * sx / sp, 0.03));
  const ix = S.indices(circle, { c: { u: 0, v: 0 } });
  check('the indices take the helicity of 0-1 and 0-3 km for the storm motion they are given: R2 k H = ' + (R * R * k * 1000).toFixed(0) + ' and ' + (R * R * k * 3000).toFixed(0) + ' (' + ix.srh01.toFixed(1) + ', ' + ix.srh03.toFixed(1) + ') and report that motion', rel(ix.srh01, R * R * k * 1000) < 0.005 && rel(ix.srh03, R * R * k * 3000) < 0.005 && ix.motion.u === 0 && ix.motion.v === 0);
  const z = Float64Array.from({ length: 101 }, (_, i) => i * 10), tvE = new Float64Array(101).fill(300), tvP = Float64Array.from(z, (h) => 300 + 0.01 * h), lin = S.buoyancy(z, tvP, tvE, 0);
  check('the buoyancy integral is the trapezoid: a parcel 0.01 K per metre warmer than the air gives g x 0.01 / 300 x 1000 m x 1000 m / 2 = ' + (G * 0.01 / 300 * 500000).toFixed(3) + ' J/kg (' + lin.cape.toFixed(3) + '), and the equilibrium level is the top', near(lin.cape, G * 0.01 / 300 * 500000, 1e-6) && lin.el === 1000 && lin.lfc === 0);
  const e = S.make(S.presets.wk82), t = e.table; let th = 0, qv = 0, n = 0, th5 = 0, qv5 = 0, n5 = 0;
  for (let i = 0; t.z[i] <= 1000; i++) { th += t.theta[i]; qv += t.qv[i]; n++; } for (let i = 0; t.z[i] <= 500; i++) { th5 += t.theta[i]; qv5 += t.qv[i]; n5++; }
  const ixw2 = S.indices(e), ml = S.lift(e, th / n, qv / n), sb = S.lift(e, t.theta[0], t.qv[0]), ml5 = S.lift(e, th5 / n5, qv5 / n5), ix5 = S.indices(e, { ml: 500 });
  check('the mixed-layer parcel has the mean theta and vapour of the lowest 1000 m (500 with ml: 500) and the surface parcel the ground\'s, and the tornado parameter is made from the mixed-layer parcel\'s numbers',
    ixw2.mlcape === ml.cape && ixw2.mllcl === ml.lcl && ixw2.mlcin === ml.cin && ixw2.sbcape === sb.cape && ixw2.sbcin === sb.cin && ix5.mlcape === ml5.cape && ml5.cape !== ml.cape && ixw2.stp === S.stpOf(ixw2.mlcape, ixw2.mllcl, ixw2.srh01, ixw2.shear06, ixw2.mlcin));
}

/* 6. The significant tornado parameter: its factors on their definition. */
{
  const f = S.stpOf;
  check('the significant tornado parameter is 1 when every factor is 1 (1500 J/kg, 1000 m, 150 m2/s2, 20 m/s, -50 J/kg), 2 for twice the CAPE and 0.5 for a condensation level at 1500 m',
    near(f(1500, 1000, 150, 20, -50), 1, 1e-12) && near(f(3000, 1000, 150, 20, -50), 2, 1e-12) && near(f(1500, 1500, 150, 20, -50), 0.5, 1e-12) && f(1500, 2100, 150, 20, -50) === 0 && near(f(1500, 800, 150, 20, -50), 1, 1e-12));
  check('shear: 0 under 12.5 m/s, 1.5 at 30 m/s and no more above; CIN: 1 down to -50 J/kg, 0.5 at -125 and 0 at -200; no helicity, no parameter',
    f(1500, 1000, 150, 12, -50) === 0 && near(f(1500, 1000, 150, 30, -50), 1.5, 1e-12) && near(f(1500, 1000, 150, 60, -50), 1.5, 1e-12) && near(f(1500, 1000, 150, 20, -125), 0.5, 1e-12) && f(1500, 1000, 150, 20, -200) === 0 && f(1500, 1000, -20, 20, -50) === 0);
}

/* 7. The mixed layer, the cap and the jet. */
{
  const e = S.make(Object.assign({}, S.presets.wk82, { theta0: 302, qv0: 15, ml: 1000, cap: 3, capDepth: 400, rhMax: 0.95 }));
  check('a mixed layer: theta is constant under 1000 m (' + e.theta(0).toFixed(2) + ', ' + e.theta(500).toFixed(2) + ', ' + e.theta(1000).toFixed(2) + ') and rises by the cap and the usual growth (3 K and 0.6, ' + (e.theta(1400) - e.theta(1000)).toFixed(2) + ' K over 400 m)', e.theta(0) === 302 && e.theta(500) === 302 && e.theta(1000) === 302 && e.theta(1400) - e.theta(1000) > 3 && e.theta(1400) - e.theta(1000) < 3.8);
  let rhMax = 0; const t = e.table; for (let k = 0; k < t.z.length && t.z[k] <= 12000; k += 5) { const T = t.theta[k] * t.pi[k], p = 1e5 * Math.pow(t.pi[k], CP / C.consts.RD); rhMax = Math.max(rhMax, t.qv[k] / S.qvsAt(T, p)); }
  check('the moisture never goes past 95 % of saturation (the most is ' + (100 * rhMax).toFixed(1) + ' %), and the mixed layer\'s is the surface\'s where that allows (' + (e.qv(0) * 1000).toFixed(2) + ' g/kg at the ground)', rhMax <= 0.95 + 1e-6 && e.qv(0) * 1000 <= 15 + 1e-9 && e.qv(0) > 0.012);
  const jet = S.make(Object.assign({}, S.presets.wk82, { jets: [{ z: 1500, width: 1500, u: 0, v: 10 }] })), sin2 = (z) => 10 * Math.pow(Math.sin(Math.PI * Math.min(z, 3000) / 3000), 2) * (z < 3000 ? 1 : 0);
  let worst = 0; for (let z = 0; z <= 6000; z += 100) worst = Math.max(worst, Math.abs(jet.vG(z) - wk.vG(z) - sin2(z)), Math.abs(jet.uG(z) - wk.uG(z)));
  check('a jet of 10 m/s at 1500 m with a width of 1500 m is the sin2 jet the research runs used (to ' + worst.toExponential(1) + ' m/s), and the helicity of the lowest kilometre goes from ' + ixw.srh01.toFixed(0) + ' to ' + S.indices(jet).srh01.toFixed(0) + ' m2/s2', worst < 1e-9 && S.indices(jet).srh01 > ixw.srh01 + 80);
  const mon = ['wk82', 'tornado', 'hail'].every((n) => { const p = S.make(S.presets[n]); for (let z = 0; z < 30000; z += 100) if (p.theta(z + 100) < p.theta(z) - 1e-9) return false; return true; });
  check('theta never falls with height in any preset', mon);
}

/* 8. The presets, in the ranges that published tornado and hail days have. */
{
  const t = S.indices(S.make(S.presets.tornado)), h = S.indices(S.make(S.presets.hail));
  check('the tornado day: mixed-layer CAPE ' + t.mlcape.toFixed(0) + ' J/kg, CIN ' + t.mlcin.toFixed(0) + ', condensation level ' + t.mllcl + ' m, 0-6 km shear ' + t.shear06.toFixed(1) + ' m/s, helicity of 0-1 km ' + t.srh01.toFixed(0) + ' m2/s2 (of 0-3 km ' + t.srh03.toFixed(0) + '), the tornado parameter ' + t.stp.toFixed(1),
    t.mlcape > 2000 && t.mlcape < 4500 && t.mlcin < 0 && t.mllcl < 1100 && t.shear06 > 25 && t.srh01 > 150 && t.stp > 1);
  check('the hail day: mixed-layer CAPE ' + h.mlcape.toFixed(0) + ' J/kg, the condensation level ' + h.mllcl + ' m, 0-6 km shear ' + h.shear06.toFixed(1) + ' m/s, helicity of 0-1 km ' + h.srh01.toFixed(0) + ', the tornado parameter ' + h.stp.toFixed(2), h.mlcape > 2500 && h.mllcl > 1200 && h.shear06 > 20 && h.srh01 < 100 && h.stp < 0.8);
  const noB = S.make(Object.assign({}, S.presets.tornado, { motion: null })), b = S.bunkers(noB);
  check('a spec with no motion runs in the frame of the Bunkers right mover (' + noB.motion.u + ', ' + noB.motion.v + ' m/s, from ' + b.right.u.toFixed(2) + ', ' + b.right.v.toFixed(2) + '), to 0.1', near(noB.motion.u, b.right.u, 0.06) && near(noB.motion.v, b.right.v, 0.06) && near(noB.u(1000), noB.uG(1000) - noB.motion.u, 1e-12));
}

/* 9. The core takes it: a hydrostatic base state at rest in the moving frame stays at rest. */
{
  const e = S.make(S.presets.tornado), core = C.create({ nx: 6, ny: 6, nz: 24, dx: 1000, dy: 1000, dz: 500, moist: true, ice: true, theta: e.theta, qv: e.qv, wind: { u: e.u, v: e.v }, bc: { x: 'periodic', y: 'periodic' } });
  const S0 = core.S, b = core.base; for (let k = 0; k < 24; k++) for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) { const o = core.idx(i, j, k); S0.u[o] = b.ubc[k]; S0.v[o] = b.vbc[k]; } core.fill();
  for (let n = 0; n < 6; n++) core.step(5);
  const d = core.diag();
  check('the core runs on the tornado day: after six steps the base state has not moved (the strongest w ' + d.wmax.toExponential(1) + ' m/s, no cloud water ' + d.qcmax.toExponential(1) + ' kg/kg)', Math.abs(d.wmax) < 1e-6 && Math.abs(d.wmin) < 1e-6 && d.qcmax < 1e-9);
}

/* 10. An environment from profiles made some other way (what the analysis builder blends air masses into): the table of a preset gives the preset back; an isothermal atmosphere has the closed-form pressure; the vapour is held to saturation;
   the winds and the motion are the caller's or Bunkers'; and a grid of 100 m gives the CAPE of a grid of 10 m to a few per cent (the maps use it). */
{
  const e = S.make(S.presets.tornado), t = e.table, f = S.fromProfile({ z: t.z, theta: t.theta, qv: t.qv, uG: e.uG, vG: e.vG, p0: 1000, motion: e.motion });
  let dp = 0; for (let k = 0; k < t.z.length; k++) dp = Math.max(dp, Math.abs(f.table.pi[k] - t.pi[k]) / t.pi[k]);
  const a = S.indices(e), b = S.indices(f);
  check('the tornado preset\'s own profiles give the preset back: the Exner function to ' + dp.toExponential(1) + ' of itself, the mixed-layer CAPE ' + b.mlcape.toFixed(1) + ' against ' + a.mlcape.toFixed(1) + ', the condensation level, the helicity and the tornado parameter the same',
    dp < 1e-7 && rel(b.mlcape, a.mlcape) < 1e-4 && near(b.mllcl, a.mllcl, 1e-6) && near(b.srh01, a.srh01, 1e-9) && near(b.stp, a.stp, 1e-4) && near(f.motion.u, e.motion.u, 0) && near(f.motion.v, e.motion.v, 0));
  const T0 = 250, n = 1001, z = Float64Array.from({ length: n }, (_, k) => k * 20), th = Float64Array.from(z, (zz) => T0 * Math.pow(1000 / 950, C.consts.RD / CP) * Math.exp(G * zz / (CP * T0))), qz = new Float64Array(n);                 // theta of 250 K air under 950 hPa, the reference being 1000 hPa
  const iso = S.fromProfile({ z, theta: th, qv: qz, uG: () => 0, vG: () => 0, p0: 950 }); let worst = 0;
  for (let k = 0; k < n; k += 50) { const p = 1e5 * Math.pow(iso.table.pi[k], CP / C.consts.RD), want = 95000 * Math.exp(-G * z[k] / (C.consts.RD * T0)); worst = Math.max(worst, Math.abs(p - want) / want); }
  check('an isothermal dry atmosphere of 250 K under 950 hPa has p = 950 hPa exp(-g z / (R T)) at every 1000 m to ' + worst.toExponential(1) + ' of itself (the ground is at 95000 Pa: ' + (1e5 * Math.pow(iso.table.pi[0], CP / C.consts.RD)).toFixed(3) + ')',
    worst < 2e-4 && near(1e5 * Math.pow(iso.table.pi[0], CP / C.consts.RD), 95000, 1e-6));
  const wet = S.fromProfile({ z: t.z, theta: t.theta, qv: Float64Array.from(t.z, () => 0.05), uG: e.uG, vG: e.vG }), dry = S.fromProfile({ z: t.z, theta: t.theta, qv: Float64Array.from(t.z, () => 1e-7), uG: e.uG, vG: e.vG });
  let wetBad = 0, dryBad = 0; for (let k = 0; k < t.z.length; k += 100) { const T = wet.table.theta[k] * wet.table.pi[k], p = 1e5 * Math.pow(wet.table.pi[k], CP / C.consts.RD); if (!near(wet.table.qv[k], S.qvsAt(T, p), 1e-12)) wetBad++; if (dry.table.qv[k] !== 1e-7) dryBad++; }
  check('vapour beyond saturation is held to the saturation of its level (50 g/kg everywhere: ' + wetBad + ' levels off), and vapour below it is kept as it was (' + dryBad + ' levels off)', wetBad === 0 && dryBad === 0 && wet.table.qv[0] < 0.05 && wet.table.qv[0] > 0.01);
  const w2 = S.fromProfile({ z: t.z, theta: t.theta, qv: t.qv, uG: (zz) => 10 + 1.37 * zz / 1000, vG: () => -5 }), w3 = S.fromProfile({ z: t.z, theta: t.theta, qv: t.qv, uG: (zz) => 10 + 1.37 * zz / 1000, vG: () => -5, motion: { u: 3, v: 4 } }), bk = S.bunkers(w2);
  check('the winds are the caller\'s functions in the ground\'s frame and the model\'s are those minus the motion, which is the Bunkers right mover\'s to 0.1 m/s unless the caller gives one (' + w2.motion.u + ', ' + w2.motion.v + ' for ' + bk.right.u.toFixed(2) + ', ' + bk.right.v.toFixed(2) + ')',
    near(w2.uG(2000), 12.74, 1e-9) && near(w2.u(2000), 12.74 - w2.motion.u, 1e-12) && near(w2.v(0), -5 - w2.motion.v, 1e-12) && near(w2.motion.u, bk.right.u, 0.06) && near(w2.motion.v, bk.right.v, 0.06) && w3.motion.u === 3 && w3.motion.v === 4 && near(w3.u(0), 7, 1e-12) && near(w3.v(0), -9, 1e-12));
  const fi = S.fromProfile({ z: t.z, theta: t.theta, qv: t.qv, uG: e.uG, vG: e.vG }), zm = 0.5 * (t.z[100] + t.z[101]);
  check('theta and the vapour as functions of height are the table at its levels and linear between them (the midpoint of two levels is their mean) and constant beyond the first and the last, and with no ground pressure given the ground is at 1000 hPa (Exner function ' + fi.table.pi[0] + ')',
    fi.theta(t.z[100]) === t.theta[100] && near(fi.theta(zm), 0.5 * (t.theta[100] + t.theta[101]), 1e-12) && near(fi.qv(zm), 0.5 * (fi.table.qv[100] + fi.table.qv[101]), 1e-15) && fi.theta(-50) === t.theta[0] && fi.theta(1e6) === t.theta[t.z.length - 1] && fi.qv(1e6) === fi.table.qv[t.z.length - 1] && fi.table.pi[0] === 1);
  const ci = (k) => Float64Array.from(t.z.filter((_, i) => i % k === 0)), c10 = S.fromProfile({ z: ci(10), theta: Float64Array.from(t.theta.filter((_, i) => i % 10 === 0)), qv: Float64Array.from(t.qv.filter((_, i) => i % 10 === 0)), uG: e.uG, vG: e.vG, motion: e.motion }), d = S.indices(c10);
  check('a grid of 100 m gives the tornado day\'s mixed-layer CAPE (' + d.mlcape.toFixed(0) + ' against ' + a.mlcape.toFixed(0) + ' J/kg) within 3 %, its CIN within 5 J/kg, the helicity within 1 and the condensation level within 100 m',
    rel(d.mlcape, a.mlcape) < 0.03 && near(d.mlcin, a.mlcin, 5) && near(d.srh01, a.srh01, 1) && near(d.mllcl, a.mllcl, 100));
}

/* 11. The parcel on a coarse grid: the condensation level is found between two levels (a parcel that went on dry to the level above would be too cold for all the rest of its way: 0.5 K for 100 m, a tenth of the CAPE), so the CAPE,
   the CIN and the levels are those of the fine grid to a fraction of a per cent on grids of 50 and 100 m; a parcel saturated at the ground has its condensation level there; and a sliver of warm air at the condensation level,
   which a cap just above cancels, is not free convection (the cap is the inhibition), while a stretch of 250 m or more is. */
{
  let worstC = 0, worstL = 0, worstI = 0, names = [];
  for (const nme of ['wk82', 'tornado', 'hail']) {
    const e = S.make(S.presets[nme]), t = e.table, fine = S.indices(e);
    for (const k of [5, 10]) {
      const f = S.fromProfile({ z: Float64Array.from(t.z.filter((_, i) => i % k === 0)), theta: Float64Array.from(t.theta.filter((_, i) => i % k === 0)), qv: Float64Array.from(t.qv.filter((_, i) => i % k === 0)), uG: e.uG, vG: e.vG, motion: e.motion }), c = S.indices(f);
      worstC = Math.max(worstC, rel(c.sbcape, fine.sbcape), rel(c.mlcape, fine.mlcape)); worstL = Math.max(worstL, Math.abs(c.sblcl - fine.sblcl)); worstI = Math.max(worstI, Math.abs(c.sbcin - fine.sbcin), Math.abs(c.mlcin - fine.mlcin));
    }
    names.push(nme);
  }
  check('the three presets on grids of 50 and 100 m: the surface and mixed-layer CAPE within ' + (100 * worstC).toFixed(2) + ' % of the 10 m grid\'s (under 0.3 %), the surface condensation level within ' + worstL.toFixed(2) + ' m (under 1.5 m), the CIN within ' + worstI.toFixed(2) + ' J/kg (under 1)',
    worstC < 0.003 && worstL < 1.5 && worstI < 1);
  const e = S.make(S.presets.tornado), ix = S.indices(e);
  check('the tornado day\'s cap just over its condensation level counts: mixed-layer CIN ' + ix.mlcin.toFixed(1) + ' J/kg (-32), the level of free convection above the cap at ' + ix.mllfc + ' m (1820), CAPE ' + ix.mlcape.toFixed(0) + ' (3070); the same on a grid of 100 m (CIN ' + S.indices(S.fromProfile({ z: Float64Array.from(e.table.z.filter((_, i) => i % 10 === 0)), theta: Float64Array.from(e.table.theta.filter((_, i) => i % 10 === 0)), qv: Float64Array.from(e.table.qv.filter((_, i) => i % 10 === 0)), uG: e.uG, vG: e.vG, motion: e.motion })).mlcin.toFixed(1) + ')',
    near(ix.mlcin, -32.1, 0.5) && near(ix.mllfc, 1820, 25) && near(ix.mlcape, 3070, 20));
  const dz = 10, n = 301, z = Float64Array.from({ length: n }, (_, k) => k * dz), tvE = new Float64Array(n).fill(300), k0 = G / 300;
  const sliver = new Float64Array(n); for (let k = 0; k < n; k++) { const h = z[k] + 5; sliver[k] = 300 + (h < 50 ? 0.5 : h < 400 ? -1 : h < 1400 ? 1.5 : -1); }
  const bs = S.buoyancy(z, sliver, tvE, 0);
  check('a sliver of warm air 50 m deep at the condensation level, a cap of 350 m, then 1 km of warm air: free convection starts at the layer above the cap, 390 m (' + bs.lfc + '), the inhibition is the cap and the layer under it, ' + (-k0 * 342.5).toFixed(1) + ' J/kg (' + bs.cin.toFixed(1) + '), the CAPE is what is above it, ' + (k0 * 1502.5).toFixed(0) + ' (' + bs.cape.toFixed(0) + ')',
    bs.lfc === 390 && rel(bs.cin, -k0 * 342.5) < 0.03 && rel(bs.cape, k0 * 1502.5) < 0.01 && bs.el === 1400);
  const stretch = new Float64Array(n); for (let k = 0; k < n; k++) { const h = z[k] + 5; stretch[k] = 300 + (h < 300 ? 0.5 : h < 600 ? -1 : h < 2600 ? 2 : -1); }
  const bt = S.buoyancy(z, stretch, tvE, 0);
  check('warm air 300 m deep at the condensation level is free convection there, a cap above it is not subtracted (the level of free convection ' + bt.lfc + ', the CIN ' + bt.cin.toFixed(2) + ')', bt.lfc === 0 && bt.cin === 0 && rel(bt.cape, k0 * (290 * 0.5 + 10 * 0.25 + 2000 * 2 - 10 * 0.5 * 0) / 1) < 0.2);
  const b3 = S.buoyancy(z, sliver.map((v, k) => 300 + ((z[k] + 5) < 500 ? -0.5 : (z[k] + 5) < 1500 ? 2 : (z[k] + 5) < 2000 ? -1 : 1)), tvE, 805);
  check('warm air that begins under the condensation level and goes on above it counts from the condensation level only: with it at 805 m the CAPE is g/300 x (2 K x 700 m + 1 K x 1000 m) = ' + (k0 * 2400).toFixed(1) + ' J/kg (' + b3.cape.toFixed(1) + '), not with the 300 m under it', rel(b3.cape, k0 * 2400) < 0.01);
  const under = new Float64Array(n); for (let k = 0; k < n; k++) { const h = z[k] + 5; under[k] = 300 + (h < 400 ? -1 : h < 700 ? 1 : h < 1000 ? -1 : 1.5); }
  const bu = S.buoyancy(z, under, tvE, 800);
  check('warm air 300 m deep that lies under the condensation level (800 m) is not free convection, whatever its depth: the level of free convection is above the cold layer over it, at 990 m (' + bu.lfc + ')', bu.lfc === 990);
  const shallow = new Float64Array(n); for (let k = 0; k < n; k++) { const h = z[k] + 5; shallow[k] = 300 + (h < 400 ? -1 : h < 1060 ? 1 : h < 1450 ? -1 : 2); }
  const bh = S.buoyancy(z, shallow, tvE, 805);
  check('a stretch of warm air is measured from the condensation level, not from the base of its layer: from 805 m to 1050 m it is 245 m, too shallow to be free convection (the level of free convection is above the next cold layer, ' + bh.lfc + ' m), and it is 250 m (' + S.buoyancy(z, shallow.map((v, k) => (z[k] + 5 < 1060 && z[k] + 5 >= 400 ? 301 : v)), tvE, 800).lfc + ' m) from 800 m',
    bh.lfc === 1440 && S.buoyancy(z, shallow, tvE, 800).lfc === 800);
  const th = S.make(S.presets.wk82).table, sat = S.lift(S.make(S.presets.wk82), th.theta[0], S.qvsAt(th.theta[0] * th.pi[0], 1e5 * Math.pow(th.pi[0], CP / C.consts.RD)) * 1.0000001);
  check('a parcel that is saturated at the ground (22 g/kg of vapour at 300 K, much more than the day\'s 14) has its condensation level there (' + sat.lcl + ' m) and a CAPE of its own, a finite number larger than the day\'s (' + sat.cape.toFixed(0) + ' J/kg)', sat.lcl === 0 && Number.isFinite(sat.cape) && sat.cape > 4000 && sat.cape < 20000);
}

/* The parcel's path (for a skew-T): the temperature of the mixed-layer and of the surface parcel at every level of the table, the dry adiabat to its condensation level and the pseudo-adiabat above it. */
{
  const e = S.make(S.presets.tornado), t = e.table, ix = S.indices(e); let th = 0, qv = 0, n = 0; for (let k = 0; t.z[k] <= 1000; k++) { th += t.theta[k]; qv += t.qv[k]; n++; }
  const thMl = th / n, below = [], above = []; for (let k = 0; k < t.z.length; k++) (t.z[k] < ix.mllcl - 1 ? below : above).push(k);
  const worstDry = Math.max(...below.map((k) => Math.abs(ix.mlpath[k] - thMl * t.pi[k])));
  check('the mixed-layer parcel\'s path has a temperature for every level of the table (' + ix.mlpath.length + ' of ' + t.z.length + ') and follows the dry adiabat, theta of the mixed layer (' + thMl.toFixed(2) + ' K) times the Exner function, below its condensation level at ' + ix.mllcl.toFixed(0) + ' m (the worst of ' + below.length + ' levels ' + worstDry.toExponential(1) + ' K)',
    ix.mlpath.length === t.z.length && below.length > 5 && worstDry < 1e-9 && ix.mlpath instanceof Float64Array);
  const warmer = above.filter((k) => k > 0 && t.z[k] > ix.mllcl + 300 && t.z[k] < 8000).every((k) => ix.mlpath[k] > thMl * t.pi[k] + 0.5), cooling = above.slice(1).every((k, j) => ix.mlpath[k] < ix.mlpath[above[j]]);
  check('above it the parcel is on the pseudo-adiabat: it cools with height (' + cooling + ') and stays warmer than the dry adiabat would have it (at 4 km ' + ix.mlpath[t.z.indexOf(4000)].toFixed(1) + ' K against ' + (thMl * t.pi[t.z.indexOf(4000)]).toFixed(1) + ' K), and the surface parcel starts at the temperature of the ground (' + ix.sbpath[0].toFixed(3) + ' K against ' + (t.theta[0] * t.pi[0]).toFixed(3) + ' K)',
    warmer && cooling && near(ix.sbpath[0], t.theta[0] * t.pi[0], 1e-9) && ix.sbpath.length === t.z.length);
}

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
