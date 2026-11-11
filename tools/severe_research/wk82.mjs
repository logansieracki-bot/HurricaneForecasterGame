// The Weisman-Klemp (1982) supercell environment and its warm bubble, as in WRF's test/em_quarter_ss (tools/severe_research/wk82_sounding.txt):
// loadSounding() returns piecewise-linear theta(z) (K), qv(z) (kg/kg), u(z), v(z) (m/s, the winds already shifted so that the storm stays in the box);
// bubble(x, y, z, xc, yc) is the +3 K cosine-squared warm bubble (10 km wide, 1.5 km deep, centred at 1.5 km).
import { readFileSync } from 'node:fs';

// qvScale > 1 makes the low levels moister (a larger CAPE) for the larger-end scenarios: the mixing ratio is multiplied by qvScale below 3 km and by less up to 5 km, 1 above, but never beyond
// rhMax of saturation at a level (or beyond what the profile already had there): without that cap a scale of 1.15 gives 102-108 % relative humidity between 1 and 3 km and a scale of 1.35
// 100-127 %, the model condenses it at once and the whole box rains from the first minutes (found by the first extreme-CAPE storms).
export function loadSounding(path = new URL('./wk82_sounding.txt', import.meta.url), qvScale = 1, rhMax = 0.95) {
  const rows = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  const first = rows[0].trim().split(/\s+/).map(Number);                       // surface pressure (hPa), theta (K), qv (g/kg)
  const taper = (zz) => zz <= 3000 ? 1 : zz >= 5000 ? 0 : (5000 - zz) / 2000, moist = (zz, q) => q * (1 + (qvScale - 1) * taper(zz));
  const z = [0], th = [first[1]], raw = [first[2] / 1000], u = [0], v = [0];
  for (const r of rows.slice(1)) { const a = r.trim().split(/\s+/).map(Number); z.push(a[0]); th.push(a[1]); raw.push(a[2] / 1000); u.push(a[3]); v.push(a[4]); }
  u[0] = u[1]; v[0] = v[1];
  const qv = raw.map((q, i) => moist(z[i], q));
  if (qvScale > 1) {                                                           // the hydrostatic Exner function of the scaled sounding, then the saturation cap at every node
    const { G, CP, RD, P0, RV1, KS } = globalThis.HFSevereCore.consts;           // (the core must have been imported)
    let pii = Math.pow(first[0] * 100 / P0, RD / CP), dpiOld = 0;
    for (let i = 0; i < z.length; i++) {
      const dpi = -G / (CP * th[i] * (1 + RV1 * qv[i]));
      if (i > 0) pii += 0.5 * (dpiOld + dpi) * (z[i] - z[i - 1]);
      dpiOld = dpi;
      const T = th[i] * pii, p = P0 * Math.pow(pii, CP / RD), es = 1000 * KS.SVP1 * Math.exp(KS.SVP2 * (T - KS.SVPT0) / (T - KS.SVP3)), qvs = KS.EP2 * es / (p - es);
      qv[i] = Math.min(qv[i], Math.max(raw[i], rhMax * qvs));
    }
  }
  const lin = (arr) => (zz) => {
    if (zz <= z[0]) return arr[0];
    if (zz >= z[z.length - 1]) return arr[arr.length - 1];
    let lo = 0, hi = z.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (z[m] <= zz) lo = m; else hi = m; }
    return arr[lo] + (arr[hi] - arr[lo]) * (zz - z[lo]) / (z[hi] - z[lo]);
  };
  return { theta: lin(th), qv: lin(qv), u: lin(u), v: lin(v), zmax: z[z.length - 1] };
}

export function bubble(x, y, z, xc, yc, delt = 3) {
  const r = Math.sqrt(((x - xc) / 10000) ** 2 + ((y - yc) / 10000) ** 2 + ((z - 1500) / 1500) ** 2);
  return r < 1 ? delt * Math.cos(0.5 * Math.PI * r) ** 2 : 0;
}
