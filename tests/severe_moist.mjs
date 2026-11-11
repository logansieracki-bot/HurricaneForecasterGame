// Node-only tests of the moist half of the Severe core (src/severe-core.js with moist: true, Kessler's warm-rain scheme as in WRF's module_mp_kessler) on the
// Weisman-Klemp (1982) environment of WRF's test/em_quarter_ss (tools/severe_research/wk82_sounding.txt): saturation adjustment conserves water and moist
// enthalpy and leaves the air close to saturation; autoconversion and accretion make rain at the Kessler rates; rain evaporates in dry air and heats nothing but
// cools it by exactly the latent heat; rain falls out of a column and the water budget closes; the sounding's CAPE and cloud base are the textbook ones; and a warm
// bubble in a 2-D slice of that environment makes a cloud at the lifted condensation level, an updraft of tens of m/s, and rain at the ground.
import '../src/severe-core.js';
import { loadSounding, bubble } from '../tools/severe_research/wk82.mjs';

const C = globalThis.HFSevereCore, { G, CP, RD, P0, KS, RV1 } = C.consts, snd = loadSounding();
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); } }
const f2 = (v, d = 2) => v.toFixed(d), t0 = Date.now(), lap = () => ((Date.now() - t0) / 1000).toFixed(1) + ' s';
const mk = (o) => C.create(Object.assign({ nx: 4, ny: 1, nz: 24, dx: 1000, dz: 500, moist: true, theta: snd.theta, qv: snd.qv, bc: { x: 'periodic' } }, o || {}));
const qvsOf = (th, pii) => { const T = th * pii, p = P0 * Math.pow(pii, CP / RD), es = 1000 * KS.SVP1 * Math.exp(KS.SVP2 * (T - KS.SVPT0) / (T - KS.SVP3)); return KS.EP2 * es / (p - es); };

/* 1. Saturation adjustment: a cell 3 % supersaturated (what a step of a model makes) condenses; water is conserved, cp pi dtheta + L dqv = 0, and one Newton step leaves it near saturation. */
{
  const core = mk(), b = core.base, k = 6, o = core.idx(1, 0, k), qs0 = qvsOf(b.thc[k], b.pibc[k]), qv0 = 1.03 * qs0;
  core.S.qv[o] = qv0 - b.qvbc[k];
  core.micro(10);
  const th1 = b.thc[k] + core.S.th[o], qv1 = b.qvbc[k] + core.S.qv[o], qc1 = core.S.qc[o], qr1 = core.S.qr[o], pii = b.pibc[k];
  check('condensation conserves water (vapour + cloud + rain: ' + (qv1 + qc1 + qr1 - qv0).toExponential(1) + ')', Math.abs(qv1 + qc1 + qr1 - qv0) < 1e-12);
  check('condensation conserves moist enthalpy: cp pi dtheta + L dqv = ' + (CP * pii * (th1 - b.thc[k]) + KS.XLV * (qv1 - qv0)).toExponential(1) + ' J/kg (of ' + f2(KS.XLV * (qv0 - qv1), 0) + ')',
        Math.abs(CP * pii * (th1 - b.thc[k]) + KS.XLV * (qv1 - qv0)) < 1e-6 * KS.XLV * (qv0 - qv1));
  const qs1 = qvsOf(th1, pii);                                      // at the pressure the step itself used (the heat then raises pi', which the acoustic steps relieve)
  check('one step of adjustment leaves the air within 0.15 % of saturation (' + f2(100 * (qv1 / qs1 - 1), 2) + ' %), warmer by ' + f2(th1 - b.thc[k], 2) + ' K, with ' + f2(1000 * qc1, 2) + ' g/kg of cloud',
        Math.abs(qv1 / qs1 - 1) < 0.0015 && th1 > b.thc[k] && qc1 > 0);
}

/* 2. Kessler's rates: in saturated air (nothing to condense) a cell with cloud and no rain makes rain at c1 (qc - c2), and with rain at c3 qc qr^0.875 on top. The rain
      of the cell also falls (that is done first, by the upwind step of WRF's scheme), which the expected values include. */
{
  const core = mk(), b = core.base, k = 12, o = core.idx(1, 0, k), dt = 10, qs = qvsOf(b.thc[k], b.pibc[k]);
  core.S.qv[o] = qs - b.qvbc[k]; core.S.qc[o] = 3e-3;
  core.micro(dt);
  const auto = 0.001 * dt * (3e-3 - 0.001);
  check('autoconversion makes rain at c1 (qc - c2): ' + (core.S.qr[o] * 1e3).toExponential(3) + ' g/kg against ' + (auto * 1e3).toExponential(3), Math.abs(core.S.qr[o] - auto) < 1e-4 * auto && Math.abs(core.S.qc[o] - (3e-3 - auto)) < 1e-9);
  const c2 = mk(), b2 = c2.base, o2 = c2.idx(1, 0, k), qr0 = 1e-4, qc0 = 5e-3;
  c2.S.qv[o2] = qs - b2.qvbc[k]; c2.S.qc[o2] = qc0; c2.S.qr[o2] = qr0;
  c2.micro(dt);
  const rho = b2.rhoc[k], vt = 36.34 * Math.pow(0.001 * rho * qr0, 0.1364) * Math.sqrt(b2.rhoc[0] / rho), qrSed = qr0 - dt / 500 * qr0 * vt;    // one upwind step of fall-out (nothing falls in from above)
  const fn = 1 / (1 + 2.2 * dt * Math.pow(qrSed, 0.875)), prod = qc0 * (1 - fn) + fn * 0.001 * dt * (qc0 - 0.001);
  check('accretion adds to autoconversion (rain ' + (c2.S.qr[o2] * 1e3).toFixed(4) + ' g/kg against ' + ((qrSed + prod) * 1e3).toFixed(4) + ' by hand)', Math.abs(c2.S.qr[o2] - (qrSed + prod)) < 1e-3 * (qrSed + prod));
}

/* 3. Rain falling through dry air evaporates and cools it by the latent heat; the column's water budget (vapour + cloud + rain + what reached the ground) closes. */
{
  const core = mk({ nz: 30 }), b = core.base, S = core.S, nz = core.nz, dz = core.dz;
  for (let k = 8; k < 14; k++) S.qr[core.idx(1, 0, k)] = 2e-3;                                  // a rain shower aloft, from 4 to 7 km
  const water = () => { let w = 0; for (let k = 0; k < nz; k++) { const o = core.idx(1, 0, k); w += b.rhoc[k] * dz * (b.qvbc[k] + S.qv[o] + S.qc[o] + S.qr[o]); } return w + core.precip[1]; };
  const heat = () => { let h = 0; for (let k = 0; k < nz; k++) { const o = core.idx(1, 0, k); h += b.rhoc[k] * dz * (CP * b.pibc[k] * (b.thc[k] + S.th[o]) + KS.XLV * (b.qvbc[k] + S.qv[o])); } return h; };
  const w0 = water(), h0 = heat();
  for (let m = 0; m < 30; m++) core.micro(30);                                                  // 15 minutes
  check('the water budget of a falling shower closes (' + ((water() - w0) / w0).toExponential(1) + ' of the column), ' + f2(core.precip[1], 3) + ' mm reached the ground', Math.abs(water() - w0) < 1e-9 * w0 && core.precip[1] > 0.01);
  check('the shower\'s evaporation cools the air by the latent heat it takes (cp pi theta + L qv summed over the column changes by ' + ((heat() - h0) / Math.abs(h0)).toExponential(1) + ' of its value)', Math.abs(heat() - h0) < 1e-5 * Math.abs(h0));
  let cooled = 0; for (let k = 0; k < nz; k++) cooled = Math.min(cooled, S.th[core.idx(1, 0, k)]);
  check('the evaporating rain cools the air (down to ' + f2(cooled, 2) + ' K) and nothing is clipped (' + core.stat.clipped.toExponential(1) + ' kg)', cooled < -0.05 && core.stat.clipped === 0);
}

/* 4. The sounding: the surface parcel's CAPE and condensation level (pseudo-adiabatic ascent with the same saturation formula) are the textbook ones for qv0 = 14 g/kg. */
const probe = mk({ nz: 60 });
function parcel(dzp = 20) {
  const b = probe.base, L = KS.XLV, eps = KS.EP2;
  let sat = false, T = 300, lcl = NaN, cape = 0, lfc = NaN, el = NaN;
  for (let z = 0; z < 17000; z += dzp) {
    const zm = z + dzp / 2, pii = b.piBar(zm), p = P0 * Math.pow(pii, CP / RD), thvE = snd.theta(zm) * (1 + RV1 * snd.qv(zm));
    let qp = snd.qv(0);
    if (!sat) { T = 300 * pii; if (qp >= qvsOf(300, pii)) { sat = true; lcl = zm; } }
    else {
      const qs = qvsOf(T / pii, pii), gm = G * (1 + L * qs / (RD * T)) / (CP + L * L * qs * eps / (RD * T * T));
      T -= gm * dzp; qp = qvsOf(T / b.piBar(zm + dzp), b.piBar(zm + dzp));
    }
    const thvP = (T / pii) * (1 + RV1 * (sat ? qvsOf(T / pii, pii) : qp)), B = G * (thvP - thvE) / thvE;
    if (B > 0) { if (Number.isNaN(lfc)) lfc = zm; el = zm; cape += B * dzp; }
  }
  return { lcl, lfc, el, cape };
}
const pc = parcel();
console.log('     the sounding\'s surface parcel: LCL ' + f2(pc.lcl, 0) + ' m, LFC ' + f2(pc.lfc, 0) + ' m, EL ' + f2(pc.el, 0) + ' m, CAPE ' + f2(pc.cape, 0) + ' J/kg, sqrt(2 CAPE) ' + f2(Math.sqrt(2 * pc.cape), 1) + ' m/s');
check('the Weisman-Klemp sounding has about 2000-3000 J/kg of CAPE, its condensation level near 1 km and its equilibrium level near 12 km', pc.cape > 1800 && pc.cape < 3200 && pc.lcl > 800 && pc.lcl < 1400 && pc.el > 11000 && pc.el < 13500);

/* 5. A warm bubble (3 K, 10 km wide, 1.5 km deep) in a 2-D slice of that environment, no wind, 25 minutes: a cloud at about the condensation level, an updraft of tens of m/s, the
      water budget within a thousandth, and no negative waters beyond what the clipping reports. */
{
  const nx = 100, nz = 40, core = C.create({ nx, ny: 1, nz, dx: 1000, dz: 500, moist: true, theta: snd.theta, qv: snd.qv, bc: { x: 'periodic' }, visc: { kh: 300, kv: 300 }, damp: { top: { depth: 5000, rate: 0.003 } } });
  const S = core.S, b = core.base;
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) S.th[core.idx(i, 0, k)] = bubble((i + 0.5) * 1000, 0, (k + 0.5) * 500, 50000, 0);
  const water = () => { let w = 0; for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { const o = core.idx(i, 0, k); w += b.rhoc[k] * 500 * 1000 * (b.qvbc[k] + S.qv[o] + S.qc[o] + S.qr[o]); } for (let i = 0; i < nx; i++) w += core.precip[i] * 1000; return w; };
  const w0 = water(), dt = 6; let wpk = 0, tw = 0, qcpk = 0, base = Infinity;
  for (let m = 1; m <= 1500 / dt; m++) {
    core.step(dt);
    const d = core.diag(); if (d.wmax > wpk) { wpk = d.wmax; tw = m * dt; } qcpk = Math.max(qcpk, d.qcmax);
    if (m * dt === 600) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) if (S.qc[core.idx(i, 0, k)] > 1e-5) base = Math.min(base, (k + 0.5) * 500);
  }
  const d = core.diag(), rel = (water() - w0) / w0;
  console.log('     2-D bubble, 25 min: w up to ' + f2(wpk, 1) + ' m/s at ' + tw + ' s, cloud water up to ' + f2(1000 * qcpk, 2) + ' g/kg, cloud base at 10 min ' + base + ' m, rain at the ground ' + f2(Math.max(...core.precip), 2) + ' mm, water budget ' + rel.toExponential(2) + ', clipped ' + core.stat.clipped.toExponential(1) + ' kg per m (' + lap() + ')');
  check('the warm bubble makes an updraft of 15 to 60 m/s and a cloud with 2 to 12 g/kg of water', Number.isFinite(d.wmax) && wpk > 15 && wpk < 60 && qcpk > 2e-3 && qcpk < 12e-3);
  check('the first cloud (at 10 min) is at 1 to 2 km, near the condensation level of the sounding (' + f2(pc.lcl, 0) + ' m)', base >= 750 && base <= 2250);
  check('the water budget of the bubble run closes to 0.3 % (' + rel.toExponential(1) + '; the vapour is advected in advective form, which is not exactly conservative)', Math.abs(rel) < 3e-3);
}

/* 7. The moister soundings of the larger-end scenarios (loadSounding with a qvScale): the vapour is scaled up below 3 km but held to 95 % of saturation. Without the cap the first extreme storms
    started in air that was 100-127 % saturated and rained over the whole box. */
{
  let worst = 0, drier = 0, atSurf = 0, wettest = 0;
  for (const scale of [1.15, 1.25, 1.35]) {
    const sn = loadSounding(undefined, scale), core = C.create({ nx: 4, ny: 1, nz: 60, dx: 1000, dz: 500, moist: true, theta: sn.theta, qv: sn.qv, bc: { x: 'periodic' } }), b = core.base;
    for (let z = 0; z <= 14000; z += 250) {
      const raw = snd.qv(z), rh = sn.qv(z) / qvsOf(sn.theta(z), b.piBar(z));
      if (sn.qv(z) < raw - 1e-12) drier++;
      if (sn.qv(z) > raw * (1 + 1e-9)) worst = Math.max(worst, rh);                              // where the scaling made it moister
      wettest = Math.max(wettest, rh);
    }
    atSurf = Math.max(atSurf, sn.qv(0) / snd.qv(0));
  }
  check('the moister soundings (x1.15, x1.25, x1.35) are held to 95 % saturation wherever the scaling made them moister (worst ' + f2(100 * worst, 1) + ' %, between the table\'s levels 1 % over is allowed), are never drier than the original, and the surface vapour is x' + f2(atSurf, 2) + ' at most',
        worst < 0.96 && worst > 0.9 && drier === 0 && Math.abs(atSurf - 1.35) < 1e-9 && wettest < 1);
  const one = loadSounding(undefined, 1);
  check('a scale of 1 is the sounding as it is (vapour at 0, 1, 2, 4 km: ' + [0, 1000, 2000, 4000].map((z) => f2(1000 * one.qv(z), 2)).join(', ') + ' g/kg)', [0, 1000, 2000, 4000].every((z) => one.qv(z) === snd.qv(z)));
}

console.log(`\n${passed} passed, ${failed} failed (${lap()})`);
process.exit(failed ? 1 : 0);
