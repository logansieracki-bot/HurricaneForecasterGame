// The surface parcel's CAPE, condensation level, level of free convection and equilibrium level of a sounding from tools/severe_research/wk82.mjs (a pseudo-adiabatic ascent with the
// same saturation formula as the core; the same calculation as tests/severe_moist.mjs).
//   node tools/severe_research/wk82_cape.mjs [qvScale ...]
import '../../src/severe-core.js';
import { loadSounding } from './wk82.mjs';

const C = globalThis.HFSevereCore, { G, CP, RD, P0, KS, RV1 } = C.consts;
const qvsOf = (T, pii) => { const p = P0 * Math.pow(pii, CP / RD), es = 1000 * KS.SVP1 * Math.exp(KS.SVP2 * (T * pii - KS.SVPT0) / (T * pii - KS.SVP3)); return KS.EP2 * es / (p - es); };
// (qvsOf takes theta-like T / pii as in the test: the temperature divided by the Exner function)
export function capeOf(snd, dzp = 20) {
  const probe = C.create({ nx: 4, ny: 1, nz: 60, dx: 1000, dz: 500, moist: true, theta: snd.theta, qv: snd.qv, bc: { x: 'periodic' } }), b = probe.base, L = KS.XLV, eps = KS.EP2;
  let sat = false, T = 300, lcl = NaN, cape = 0, lfc = NaN, el = NaN;
  for (let z = 0; z < 17000; z += dzp) {
    const zm = z + dzp / 2, pii = b.piBar(zm), thvE = snd.theta(zm) * (1 + RV1 * snd.qv(zm));
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
if (process.argv[1] && process.argv[1].endsWith('wk82_cape.mjs')) {
  for (const f of (process.argv.length > 2 ? process.argv.slice(2).map(Number) : [1, 1.08, 1.15, 1.25])) {
    const c = capeOf(loadSounding(undefined, f));
    console.log('qvScale ' + f + ': surface qv ' + (1000 * loadSounding(undefined, f).qv(0)).toFixed(1) + ' g/kg, CAPE ' + c.cape.toFixed(0) + ' J/kg (sqrt(2 CAPE) ' + Math.sqrt(2 * c.cape).toFixed(0) + ' m/s), LCL ' + c.lcl.toFixed(0) + ' m, LFC ' + c.lfc.toFixed(0) + ' m, EL ' + c.el.toFixed(0) + ' m');
  }
}
