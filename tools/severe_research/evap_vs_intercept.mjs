#!/usr/bin/env node
// How fast rain of one mass evaporates for each intercept N0 of its exponential size distribution, against Kessler's own N0 = 8e6 (the rain the core's evaporation formula is for): N0 times the ventilation integral of the size distribution,
// the formula tests/severe_twomoment.mjs holds the core to (docs/severe-research.md part 7, "What real hooks have that ours do not"). Air of 285 K at 850 hPa, the rain at 0.5, 2, 5 and 10 g/kg.
//   node tools/severe_research/evap_vs_intercept.mjs
const gam = (x) => { const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]; x -= 1; let a = c[0]; const t = x + g + 0.5; for (let i = 1; i < g + 2; i++) a += c[i] / (x + i); return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a; };
const RHOW = 1000, T = 285, p = 85000, rho = p / (287 * T), rho0 = 1.15;
const mu = 1.458e-6 * Math.pow(T, 1.5) / (T + 110.4), nu = mu / rho, dv = 2.11e-5 * Math.pow(T / 273.15, 1.94) * 101325 / p, sc = nu / dv, a = 842, b = 0.8;
const vent = (l) => 0.78 / (l * l) + 0.31 * Math.cbrt(sc) * Math.sqrt(a * Math.sqrt(rho0 / rho) / nu) * gam((b + 5) / 2) / Math.pow(l, (b + 5) / 2);
for (const q of [0.5e-3, 2e-3, 5e-3, 10e-3]) {
  const rate = (N0) => { const l = Math.pow(Math.PI * RHOW * N0 / (rho * q), 0.25); return N0 * vent(l); };
  const r0 = rate(8e6);
  console.log('q ' + (q * 1e3) + ' g/kg: ' + [8e6, 4e6, 2e6, 8e5, 5.5e5, 4e5, 2e5, 8e4].map((n) => 'N0 ' + n.toExponential(1) + ' -> ' + (rate(n) / r0).toFixed(3)).join('; '));
}
// the exponent: d ln rate / d ln N0 between 8e6 and 8e5
for (const q of [0.5e-3, 2e-3, 5e-3, 10e-3]) { const rate = (N0) => { const l = Math.pow(Math.PI * RHOW * N0 / (rho * q), 0.25); return N0 * vent(l); }; console.log('q', q * 1e3, 'exponent', (Math.log(rate(8e6) / rate(8e5)) / Math.log(10)).toFixed(3)); }
