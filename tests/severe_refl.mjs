// Node-only tests of the radar reflectivity of a core's state (src/severe-refl.js), against the closed forms of the definitions it is made of:
//   - no water, no echo (-30 dBZ and no fall speed), in a column of ice and of Kessler's warm rain;
//   - rain: Z = 720 N0 / lambda^7 with lambda = (pi rho_w N0 / (rho q))^(1/4), and the intercept N0 is the core's own (a tenth of it is +7.5 dB: Z goes as N0^(-3/4));
//   - dry snow and graupel in cold air: the dielectric factor 0.176 / 0.93 of ice against water and (density / 900)^2; snow's intercept follows its temperature (2e6 exp(0.12 (273.15 - T)),
//     at most 2e8), graupel's is the core's;
//   - wet ice: with nothing at the reference level the ice that is above freezing reflects like water; with some, the water fraction is the share of the mass that has gone since it
//     (at least 0.5 %, at most 99 %), and a quarter of the mass as water is enough for the value of water;
//   - several species add in Z, and the fall speed is the mean of theirs weighted by the echo of each (core.zFall: it is what a Doppler radar adds to the wind);
//   - Kessler's formula of WRF without ice: Z = 17300 (rho q in g/m3)^1.75.
import '../src/severe-core.js';
import '../src/severe-refl.js';

const C = globalThis.HFSevereCore, R = globalThis.HFSevereRefl;
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const T0 = 273.15, KICE = 0.176 / 0.93;

const NZ = 12;
const make = (extra = {}) => C.create(Object.assign({ nx: 4, ny: 4, nz: NZ, dx: 500, dy: 500, dz: 1000, moist: true, ice: true, theta: (z) => 300 + z * 0.004, qv: (z) => 0.012 * Math.exp(-z / 3000) }, extra));
/* the temperature of a cell is set through theta' (the pressure's perturbation is left at 0) */
const setT = (core, i, j, k, T) => { const o = core.idx(i, j, k); core.S.th[o] = T / core.base.pibc[k] - core.base.thc[k]; };
const column = (core, i, j, vz = true) => { const r = R.create(core), d = new Float64Array(NZ), v = new Float64Array(NZ); if (vz) r.column(i, j, d, v); else r.column(i, j, d); return { d, v }; };
const lam = (n0, rhox, rho, q) => Math.pow(Math.PI * rhox * n0 / (rho * q), 0.25);
const zOf = (n0, rhox, rho, q) => 720 * n0 / Math.pow(lam(n0, rhox, rho, q), 7);          // m^3 (times 1e18 for mm6/m3)
const dB = (z) => 10 * Math.log10(z * 1e18);
const cold = (core, i, j) => { for (let k = 0; k < NZ; k++) setT(core, i, j, k, 250); };

/* 1. No water, no echo. */
{
  for (const ice of [true, false]) {
    const core = make({ ice }); const { d, v } = column(core, 1, 1);
    check('no water, no echo (' + (ice ? 'ice' : 'Kessler') + '): every level -30 dBZ and no fall speed', d.every((x) => x === -30) && v.every((x) => x === 0));
  }
  const core = make(); const o = core.idx(1, 1, 3); core.S.qr[o] = 5e-10; core.S.qg[o] = 8e-10; core.S.qs[o] = 9e-10;
  check('a mixing ratio below 1e-9 is no echo', column(core, 1, 1).d[3] === -30);
  core.S.qr[o] = 2e-9; check('2e-9 of rain is far under the floor of -30 dBZ: no echo', column(core, 1, 1).d[3] === -30);
  core.S.qr[o] = 3e-7; const e = column(core, 1, 1).d[3];
  check('3e-7 of rain is the first that shows, the closed form to rounding: ' + e.toFixed(2) + ' dBZ', e > -30 && near(e, dB(zOf(8e6, 1000, core.base.rhoc[3], 3e-7)), 1e-9));
}

/* 2. Rain: the closed form, the intercept the core's own, the fall speed the core's. */
{
  const core = make(); cold(core, 1, 1); for (let k = 0; k < NZ; k++) setT(core, 1, 1, k, 288);
  const qs = [0.0004, 0.003, 0.012], ks = [1, 4, 9];
  for (let m = 0; m < 3; m++) core.S.qr[core.idx(1, 1, ks[m])] = qs[m];
  const { d, v } = column(core, 1, 1);
  let ok = true, okv = true; for (let m = 0; m < 3; m++) { ok = ok && near(d[ks[m]], dB(zOf(8e6, 1000, core.base.rhoc[ks[m]], qs[m])), 1e-9); okv = okv && near(v[ks[m]], core.zFall.rain(qs[m], ks[m]), 1e-9); }
  check('rain: Z = 720 N0 / lambda^7 at three levels and three contents (' + [1, 4, 9].map((k) => d[k].toFixed(1)).join(', ') + ' dBZ)', ok);
  check('rain alone: the fall speed is the core\'s own reflectivity-weighted one (' + v[4].toFixed(2) + ' m/s)', okv && v[4] > 3);
  check('the levels with no water have no echo and no fall speed', [0, 2, 3, 5, 6, 7, 8, 10, 11].every((k) => d[k] === -30 && v[k] === 0));
  const c2 = make({ iceParams: { n0r: 8e5 } }); for (let k = 0; k < NZ; k++) setT(c2, 1, 1, k, 288); c2.S.qr[c2.idx(1, 1, 4)] = 0.003;
  const d2 = column(c2, 1, 1).d[4];
  check('the rain\'s intercept is the core\'s: a tenth of it is 7.5 dB more (' + (d2 - d[4]).toFixed(3) + ')', near(d2 - d[4], 7.5, 1e-9) && near(d2, dB(zOf(8e5, 1000, c2.base.rhoc[4], 0.003)), 1e-9));
  check('and the fall speed follows the core\'s intercept (bigger drops fall faster)', near(column(c2, 1, 1).v[4], c2.zFall.rain(0.003, 4), 1e-9) && c2.zFall.rain(0.003, 4) > core.zFall.rain(0.003, 4));
}

/* 3. Dry snow and graupel in cold air. */
{
  const core = make(), core2 = make({ iceParams: { n0g: 4e5, rhog: 700 } });
  for (const c of [core, core2]) { cold(c, 1, 1); for (let k = 0; k < NZ; k++) setT(c, 1, 1, k, 260); }
  core.S.qg[core.idx(1, 1, 5)] = 0.004; core2.S.qg[core2.idx(1, 1, 5)] = 0.004;
  const g1 = column(core, 1, 1), g2 = column(core2, 1, 1), rho = core.base.rhoc[5];
  check('dry graupel: 0.176/0.93 (rho/900)^2 720 N0 / lambda^7 (n0g 4e6, 400 kg/m3: ' + g1.d[5].toFixed(2) + ' dBZ)', near(g1.d[5], dB(KICE * Math.pow(400 / 900, 2) * zOf(4e6, 400, rho, 0.004)), 1e-9));
  check('the graupel of the core\'s settings (n0g 4e5, 700 kg/m3: ' + g2.d[5].toFixed(2) + ' dBZ)', near(g2.d[5], dB(KICE * Math.pow(700 / 900, 2) * zOf(4e5, 700, rho, 0.004)), 1e-9));
  check('graupel\'s fall speed is the core\'s', near(g1.v[5], core.zFall.graupel(0.004, 5), 1e-9) && near(g2.v[5], core2.zFall.graupel(0.004, 5), 1e-9) && Math.abs(g1.v[5] - g2.v[5]) > 0.1);
  {                                                                             // the least ice that shows: a milligram per kilogram of graupel or snow
    const c = make(); for (let k = 0; k < NZ; k++) setT(c, 1, 1, k, 250); c.S.qg[c.idx(1, 1, 4)] = 1e-6; c.S.qs[c.idx(1, 1, 7)] = 1e-6; const d = column(c, 1, 1).d;
    check('1e-6 of graupel and of snow show (' + d[4].toFixed(1) + ', ' + d[7].toFixed(1) + ' dBZ): the closed forms', near(d[4], dB(KICE * Math.pow(400 / 900, 2) * zOf(4e6, 400, c.base.rhoc[4], 1e-6)), 1e-9) && near(d[7], dB(KICE * Math.pow(100 / 900, 2) * zOf(Math.min(2e8, 2e6 * Math.exp(0.12 * (T0 - 250))), 100, c.base.rhoc[7], 1e-6)), 1e-9) && d[4] > -30 && d[7] > -30);
  }
  for (const T of [250, 268, 200]) {                                          // snow's intercept follows the cold; at 200 K it is the cap
    const c = make(); for (let k = 0; k < NZ; k++) setT(c, 1, 1, k, T); c.S.qs[c.idx(1, 1, 6)] = 0.002;
    const n0 = Math.min(2e8, 2e6 * Math.exp(0.12 * Math.max(0, T0 - T)));
    const d = column(c, 1, 1), want = dB(KICE * Math.pow(100 / 900, 2) * zOf(n0, 100, c.base.rhoc[6], 0.002));
    check('dry snow at ' + T + ' K: intercept ' + n0.toExponential(2) + ' m-4, ' + d.d[6].toFixed(2) + ' dBZ', near(d.d[6], want, 1e-9) && near(d.v[6], c.zFall.snow(0.002, 6, c.idx(1, 1, 6)), 1e-9));
  }
}

/* 4. Wet ice. A cold top and a warm bottom: the reference level is the highest one at or below freezing (the top level); ice above freezing is as wet as the share of its mass that has gone. */
{
  const warmBelow = (c) => { for (let k = 0; k < NZ; k++) setT(c, 1, 1, k, k < 6 ? 285 : 250); };
  const core = make(); warmBelow(core);
  core.S.qg[core.idx(1, 1, 3)] = 0.004;
  const rho = core.base.rhoc[3], kw = zOf(4e6, 400, rho, 0.004) * Math.pow(400 / 900, 2);
  let d = column(core, 1, 1).d[3];
  check('ice above freezing with nothing at the reference level reflects like water: kk = 1 (' + d.toFixed(2) + ' dBZ, dry would be ' + dB(KICE * kw).toFixed(2) + ')', near(d, dB(kw), 1e-9));
  const mref = core.base.rhoc[NZ - 1] * 0.003;                                  // some graupel at the reference level
  const at = (frac) => {                                                        // the level 3's mass is `frac` of the reference mass
    const c = make(); warmBelow(c); c.S.qg[c.idx(1, 1, NZ - 1)] = 0.003; c.S.qg[c.idx(1, 1, 3)] = frac * mref / c.base.rhoc[3];
    return column(c, 1, 1).d[3];
  };
  const wantK = (wet) => KICE + (1 - KICE) * Math.min(1, wet / 0.25);
  const zq = (frac) => zOf(4e6, 400, rho, frac * mref / rho) * Math.pow(400 / 900, 2);
  check('the water fraction is the share of the mass that has gone: a tenth gone (0.1) is 40 % of the way to water', near(at(0.9), dB(wantK(0.1) * zq(0.9)), 1e-9));
  check('a quarter or more gone is as water: kk = 1 (0.6 gone)', near(at(0.4), dB(zq(0.4)), 1e-9));
  check('little gone is dry ice but for the 0.5 % floor: mass above the reference\'s gives 0.005', near(at(1.5), dB(wantK(0.005) * zq(1.5)), 1e-9));
  check('and nearly all gone is capped at 99 %, still water: kk = 1', near(at(0.001), dB(zq(0.001)), 1e-9));
  {                                                                             // snow has its own reference mass, and its own intercept
    const sat = (frac) => { const c = make(); warmBelow(c); c.S.qs[c.idx(1, 1, NZ - 1)] = 0.003; c.S.qs[c.idx(1, 1, 3)] = frac * mref / c.base.rhoc[3]; return column(c, 1, 1).d[3]; };
    const zsn = (frac) => zOf(2e6, 100, rho, frac * mref / rho) * Math.pow(100 / 900, 2);
    check('snow is wet by its own mass at the reference level, not the graupel\'s: a tenth gone', near(sat(0.9), dB(wantK(0.1) * zsn(0.9)), 1e-9));
    const c = make(); warmBelow(c); c.S.qg[c.idx(1, 1, NZ - 1)] = 0.003; c.S.qs[c.idx(1, 1, 3)] = 0.9 * mref / c.base.rhoc[3];
    check('and graupel at the reference does not wet snow: the snow\'s reference is empty, kk = 1', near(column(c, 1, 1).d[3], dB(zsn(0.9)), 1e-9));
  }
  {                                                                             // the pressure's perturbation is part of the temperature
    const c = make(); for (let k = 0; k < NZ; k++) setT(c, 1, 1, k, 274); const o = c.idx(1, 1, 3); c.S.qg[o] = 0.004; c.S.pi[o] = -0.004;
    const T = (c.base.thc[3] + c.S.th[o]) * (c.base.pibc[3] + c.S.pi[o]);
    const dw = column(c, 1, 1).d[3]; c.S.pi[o] = 0; const dd = column(c, 1, 1).d[3];
    check('the temperature is theta times the whole pressure function (' + T.toFixed(2) + ' K with pi\', 274 K without): ice at 273 K and a little is not wet, as water at 274 K is', T < T0 && 274 > T0 && dw < dd - 5 && near(dd, dB(zOf(4e6, 400, c.base.rhoc[3], 0.004) * Math.pow(400 / 900, 2)), 1e-9));
  }
  check('colder than freezing the same ice is dry whatever the reference: 0.176/0.93', near((() => { const c = make(); cold(c, 1, 1); c.S.qg[c.idx(1, 1, NZ - 1)] = 0.003; c.S.qg[c.idx(1, 1, 3)] = 0.0004; return column(c, 1, 1).d[3]; })(), dB(KICE * zq(0.0004 * core.base.rhoc[3] / mref)), 1e-9));
}

/* 5. Several species: the sum in Z and the fall speed weighted by the echo. */
{
  const core = make(); for (let k = 0; k < NZ; k++) setT(core, 1, 1, k, 285);
  const o = core.idx(1, 1, 4); core.S.qr[o] = 0.002; core.S.qg[o] = 0.003; core.S.qs[o] = 0.001;
  const { d, v } = column(core, 1, 1), rho = core.base.rhoc[4];
  const zr = zOf(8e6, 1000, rho, 0.002) * 1e18, zg = zOf(4e6, 400, rho, 0.003) * Math.pow(400 / 900, 2) * 1e18, zs = zOf(2e6 * Math.exp(0.12 * Math.max(0, T0 - 285)), 100, rho, 0.001) * Math.pow(100 / 900, 2) * 1e18;
  check('rain, graupel and snow in one cell add in Z (warm: the ice reflects as water): ' + d[4].toFixed(2) + ' dBZ', near(d[4], 10 * Math.log10(zr + zg + zs), 1e-9));
  const want = (zr * core.zFall.rain(0.002, 4) + zg * core.zFall.graupel(0.003, 4) + zs * core.zFall.snow(0.001, 4, o)) / (zr + zg + zs);
  check('their fall speed is the mean weighted by the echo of each: ' + v[4].toFixed(3) + ' m/s', near(v[4], want, 1e-9) && v[4] > Math.min(core.zFall.rain(0.002, 4), core.zFall.snow(0.001, 4, o)) && v[4] < core.zFall.graupel(0.003, 4) + 1e-9);
  const d2 = column(core, 1, 1, false).d;
  check('asking for the dBZ alone gives the same dBZ', d2[4] === d[4] && d2.every((x, k) => x === d[k]));
}

/* 6. Kessler (no ice): WRF's formula. A column does not read its neighbours. */
{
  const core = make({ ice: false }); const o = core.idx(2, 1, 5); core.S.qr[o] = 0.004;
  const { d, v } = column(core, 2, 1), g = core.base.rhoc[5] * 0.004 * 1000;
  check('Kessler: Z = 17300 (rho q in g/m3)^1.75 (' + d[5].toFixed(2) + ' dBZ), the fall speed the core\'s', near(d[5], 10 * Math.log10(17300 * Math.pow(g, 1.75)), 1e-9) && v[5] === core.zFall.rain(0.004, 5));
  check('a column does not read its neighbours', column(core, 1, 1).d.every((x) => x === -30) && column(core, 3, 1).d.every((x) => x === -30) && column(core, 2, 2).d.every((x) => x === -30));
  const small = 1e-4 / (core.base.rhoc[5] * 1000);                                     // 1e-4 g/m3: Kessler's formula gives -27.6 dBZ, above the floor
  core.S.qr[core.idx(2, 1, 6)] = 1e-4 / (core.base.rhoc[6] * 1000);
  check('Kessler: a tenth of a milligram per cubic metre of rain shows, -27.6 dBZ', near(column(core, 2, 1).d[6], 10 * Math.log10(17300 * Math.pow(1e-4, 1.75)), 1e-9) && small > 0);
  const ic = make(); ic.S.qr[ic.idx(2, 1, 5)] = 0.004; const di = column(ic, 2, 1).d[5];
  check('the two formulae for rain are both Marshall-Palmer-like: 4 g/kg is ' + di.toFixed(1) + ' dBZ with ice and ' + d[5].toFixed(1) + ' in Kessler\'s, within 3 dB', Math.abs(di - d[5]) < 3);
}

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
