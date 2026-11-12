/* Severe: the radar reflectivity (and the fall speed a Doppler radar adds to the wind) of a core's state, column by column.
 *
 * The Rayleigh value at 10 cm that WRF's refl10cm_lin computes: rain 720 N0 / lambda^7 (the core's own intercept); snow and graupel/hail as ice spheres of their density against water
 * (|K|^2 of ice over water 0.176 / 0.93, times (density / 900)^2), the ice rising to the value of water as it gets wet below the melting level (a water coat on a quarter of the mass
 * reflects like rain: the bright band, the wet hail); snow's intercept follows its temperature (2e6 exp(0.12 (273.15 - T)), at most 2e8). Without ice (Kessler) the formula of WRF's
 * module_mp_kessler: Z = 17300 (rho q in g/m3)^1.75. The fall speed of each species is the core's own core.zFall (reflectivity-weighted, m/s downward), weighted here by the echo of each.
 *
 *   const R = HFSevereRefl.create(core);        // the settings (the rain's and graupel's intercepts and the graupel's density) are the core's own (core.iceParams)
 *   R.column(i, j, dbz, vz);                    // dbz[k] in dBZ (-30 for no echo), vz[k] in m/s downward (0 for no echo); vz may be omitted
 *
 * A classic script that sets `globalThis.HFSevereRefl`; it reads core.S, core.base, core.idx, core.nz, core.ice, core.iceParams and core.zFall, nothing else.
 */
(function () {
  'use strict';
  const T0 = 273.15, KICE = 0.176 / 0.93;
  const lamOf = (n0, rhox, rho, q) => Math.pow(Math.PI * rhox * n0 / (rho * q), 0.25);        // the slope of an exponential size distribution of mass q (kg/kg) in air of density rho
  const dbzOf = (z) => z > 1e-3 ? 10 * Math.log10(z) : -30;                                    // z in mm6/m3 (times 1e18 for the SI value the sums below carry)

  function create(core) {
    const nz = core.nz, S = core.S, idx = core.idx, b = core.base, ice = !!core.ice, P = core.iceParams || { n0g: 4e6, rhog: 400, n0r: 8e6 };
    const tcol = new Float64Array(nz);
    function column(i, j, res, vzres) {
      if (!ice) {
        for (let k = 0; k < nz; k++) { const q = S.qr[idx(i, j, k)], g = b.rhoc[k] * q * 1000; res[k] = g > 1e-6 ? 10 * Math.log10(17300 * Math.pow(g, 1.75)) : -30; if (vzres) vzres[k] = core.zFall.rain(q, k); }
        return;
      }
      let kz = -1;                                                                              // the highest level at or below freezing, then the first above it going down
      for (let k = nz - 1; k >= 0; k--) { const o = idx(i, j, k); tcol[k] = (b.thc[k] + S.th[o]) * (b.pibc[k] + S.pi[o]); }
      for (let k = nz - 1; k >= 0; k--) if (tcol[k] <= T0) { kz = k; break; }
      const msRef = kz >= 0 ? b.rhoc[kz] * S.qs[idx(i, j, kz)] : 0, mgRef = kz >= 0 ? b.rhoc[kz] * S.qg[idx(i, j, kz)] : 0;
      for (let k = 0; k < nz; k++) {
        const o = idx(i, j, k), rho = b.rhoc[k], T = tcol[k];
        let z = 0, zv = 0;
        if (S.qr[o] > 1e-9) { const l = lamOf(P.n0r, 1000, rho, S.qr[o]), zr = 720 * P.n0r / Math.pow(l, 7); z += zr; if (vzres) zv += zr * core.zFall.rain(S.qr[o], k); }
        for (let s = 0; s < 2; s++) {
          const snow = s === 0, q = snow ? S.qs[o] : S.qg[o];
          if (q <= 1e-9) continue;
          const n0 = snow ? Math.min(2e8, 2e6 * Math.exp(0.12 * Math.max(0, T0 - T))) : P.n0g, rx = snow ? 100 : P.rhog, mref = snow ? msRef : mgRef, l = lamOf(n0, rx, rho, q);
          let wet = 0;                                                                          // water fraction: from what has melted since the freezing level (WRF)
          if (T > T0) wet = mref > 0 ? Math.max(0.005, Math.min(1 - rho * q / mref, 0.99)) : 0.99;
          const kk = KICE + (1 - KICE) * Math.min(1, wet / 0.25);                               // a water coat on a quarter of the mass reflects like rain
          const zs = kk * Math.pow(rx / 900, 2) * 720 * n0 / Math.pow(l, 7);
          z += zs; if (vzres) zv += zs * (snow ? core.zFall.snow(q, k, o) : core.zFall.graupel(q, k));
        }
        res[k] = dbzOf(z * 1e18);
        if (vzres) vzres[k] = z > 0 ? zv / z : 0;
      }
    }
    return { column };
  }

  globalThis.HFSevereRefl = { create };
})();
