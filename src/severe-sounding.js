/* Severe: an environment in a forecaster's terms, and the indices a forecaster reads from it (docs/severe-plan.md 6.3).
 *
 *   const env = HFSevereSounding.make(spec);        // spec: a preset (HFSevereSounding.presets.tornado) or any of its keys changed
 *   env.theta(z), env.qv(z), env.u(z), env.v(z)     // the four functions the core takes as its base state (K, kg/kg, m/s: the winds in the frame that moves with the storm, env.motion over the ground)
 *   HFSevereSounding.indices(env)                   // CAPE, CIN, the condensation level, the level of free convection and the equilibrium level of the surface and the mixed-layer parcel,
 *                                                   // the bulk shear of 0-1, 0-3 and 0-6 km, Bunkers storm motions, the storm-relative helicity of 0-1 and 0-3 km, the significant tornado parameter
 *
 * The thermodynamics are the Weisman-Klemp (1982) family: theta rises from the ground to the tropopause as theta0 + (thetaTr - theta0) (z / ztr)^thExp, is that of an isothermal stratosphere above it,
 * and the vapour mixing ratio is the least of qv0 and a relative humidity that falls with height, 1 - rhDry (z / ztr)^rhExp, of the saturation of the air at that height (the pressure from hydrostatic balance with
 * the virtual temperature, from 1000 hPa at the ground as in the core). Three things are added, which a forecaster asks for: a mixed layer of depth `ml` (theta and qv constant, the moisture never beyond
 * rhMax of saturation), a cap, an inversion of `cap` K over `capDepth` m on top of it, and a low-level jet. The winds go through nodes (height, u, v in the frame of the ground, a monotone cubic between them), and
 * the frame that moves with the storm, the one the core runs in, is the Bunkers right mover's unless the spec gives one. CAPE and the rest are made with the core's own saturation formula and a pseudo-adiabatic
 * ascent, so they are the CAPE of the parcels the core's own condensation makes.
 *
 * A classic script that sets `globalThis.HFSevereSounding`; it needs HFSevereCore (its constants).
 */
(function () {
  'use strict';
  const CORE = globalThis.HFSevereCore;
  if (!CORE || !CORE.consts) throw new Error('severe-sounding: load severe-core.js first');
  const { G, CP, RD, P0, RV1, KS } = CORE.consts, LV = KS.XLV, EPS = KS.EP2;
  const qvsAt = (T, p) => { const es = 1000 * KS.SVP1 * Math.exp(KS.SVP2 * (T - KS.SVPT0) / (T - KS.SVP3)); return EPS * es / (p - es); };       // saturation mixing ratio (kg/kg), T in K, p in Pa

  /* a monotone cubic through the nodes (Fritsch and Carlson 1980), constant beyond the first and last */
  function pchip(xs, ys) {
    const n = xs.length, h = [], d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; d[i] = (ys[i + 1] - ys[i]) / h[i]; }
    if (n === 1) m[0] = 0; else {
      m[0] = d[0]; m[n - 1] = d[n - 2];
      for (let i = 1; i < n - 1; i++) {
        if (d[i - 1] * d[i] <= 0) m[i] = 0;
        else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
      }
    }
    return (x) => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let lo = 0, hi = n - 1; while (hi - lo > 1) { const k = (lo + hi) >> 1; if (xs[k] <= x) lo = k; else hi = k; }
      const t = (x - xs[lo]) / h[lo], t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h[lo] * m[lo] + (-2 * t3 + 3 * t2) * ys[lo + 1] + (t3 - t2) * h[lo] * m[lo + 1];
    };
  }

  /* the Weisman-Klemp day of WRF's em_quarter_ss, winds of the ground's frame at its nodes (the table's winds plus the frame's 8.0998, 4.9419 m/s) */
  const WK82 = {
    theta0: 300, qv0: 14, ztr: 12000, thetaTr: 343, tTr: 213, thExp: 1.25, rhDry: 0.75, rhExp: 1.25, ml: 0, cap: 0, capDepth: 400, rhMax: 1,
    winds: [[0, 0, 0], [100, 0.02, 0.522], [200, 0.079, 1.099], [300, 0.178, 1.671], [400, 0.315, 2.235], [500, 0.491, 2.788], [600, 0.704, 3.328], [800, 1.237, 4.358], [1000, 1.906, 5.306], [1250, 2.917, 6.345],
            [1500, 4.083, 7.205], [2000, 6.77, 8.264], [2500, 9.638, 8.442], [3000, 12.484, 8.442], [4000, 18.175, 8.442], [5000, 23.867, 8.442], [6000, 29.558, 8.442], [6700, 33.542, 8.442], [6900, 34.681, 8.442],
            [7000, 35.25, 8.442], [7100, 35.25, 8.442], [12000, 35.25, 8.442]],
    jets: [], motion: { u: 8.0998, v: 4.9419 }
  };
  const presets = {
    wk82: WK82,
    /* a day for tornadoes: a warm, moist mixed layer under a weak cap, a low-level jet of 15 m/s at 1.5 km with the winds veering above it: the storm-relative helicity of the lowest kilometre 150 m2/s2 and more */
    tornado: Object.assign({}, WK82, { theta0: 301, qv0: 15.5, ml: 900, cap: 3.5, capDepth: 400, rhMax: 0.97, rhDry: 0.7, ztr: 12500, thetaTr: 345,
      winds: [[0, 3, 7], [500, 5, 14], [1000, 7, 19], [2000, 12, 24], [3000, 17, 26], [4000, 21, 27], [6000, 28, 28], [9000, 38, 25], [12000, 44, 22]], jets: [], motion: null }),
    /* a day for large hail: very high CAPE, a high cloud base, a long straight hodograph with little low-level helicity */
    hail: Object.assign({}, WK82, { theta0: 304, qv0: 15, ml: 1500, cap: 4.5, capDepth: 500, rhMax: 0.95, rhDry: 0.8, ztr: 13000, thetaTr: 348,
      winds: [[0, 4, 6], [1000, 6, 9], [3000, 12, 13], [6000, 24, 18], [9000, 34, 21], [12000, 40, 22]], jets: [], motion: null })
  };

  function make(specIn) {
    const s = Object.assign({}, WK82, specIn || {}), zTop = 30000, dz = 10, nz = Math.round(zTop / dz);
    const thetaOf = (z) => {
      if (z >= s.ztr) return s.thetaTr * Math.exp(G / (CP * s.tTr) * (z - s.ztr));
      if (z <= s.ml) return s.theta0;
      const f = (z - s.ml) / (s.ztr - s.ml), x = Math.min(1, (z - s.ml) / s.capDepth);
      return s.theta0 + s.cap * (x * x * (3 - 2 * x)) + (s.thetaTr - s.theta0 - s.cap) * Math.pow(f, s.thExp);
    };
    /* the hydrostatic pressure (Exner function) with the virtual temperature of the moisture the profile has, level by level, then the moisture on the fine grid */
    const z = new Float64Array(nz + 1), pi = new Float64Array(nz + 1), qv = new Float64Array(nz + 1), th = new Float64Array(nz + 1);
    const qvAt = (zz, th_, pi_) => {
      const T = th_ * pi_, p = P0 * Math.pow(pi_, CP / RD), qs = qvsAt(T, p);
      if (zz <= s.ml) return Math.min(s.qv0 / 1000, s.rhMax * qs);
      const rh = Math.max(0, 1 - s.rhDry * Math.pow(Math.min(zz, s.ztr) / s.ztr, s.rhExp));
      return Math.min(s.qv0 / 1000, Math.min(rh, s.rhMax) * qs);
    };
    z[0] = 0; th[0] = thetaOf(0); pi[0] = 1; qv[0] = qvAt(0, th[0], 1);
    for (let k = 1; k <= nz; k++) {
      z[k] = k * dz; th[k] = thetaOf(z[k]);
      const thvA = th[k - 1] * (1 + RV1 * qv[k - 1]);
      let piK = pi[k - 1] - G * dz / (CP * thvA), q = qvAt(z[k], th[k], piK);                       // a first guess, then the trapezoid with the moisture it gives
      for (let it = 0; it < 2; it++) { const thvB = th[k] * (1 + RV1 * q); piK = pi[k - 1] - G * dz / (CP * 0.5 * (thvA + thvB)); q = qvAt(z[k], th[k], piK); }
      pi[k] = piK; qv[k] = q;
    }
    const lin = (a) => (zz) => { if (zz <= 0) return a[0]; if (zz >= zTop) return a[nz]; const f = zz / dz, i = Math.floor(f); return a[i] + (a[i + 1] - a[i]) * (f - i); };
    const wz = s.winds.map((r) => r[0]), uN = s.winds.map((r) => r[1]), vN = s.winds.map((r) => r[2]);
    const uG0 = pchip(wz, uN), vG0 = pchip(wz, vN);
    const jetOf = (zz) => { let a = 0, b = 0; for (const j of s.jets) { const x = (zz - j.z) / j.width; if (Math.abs(x) < 1) { const f = Math.pow(Math.cos(0.5 * Math.PI * x), 2); a += (j.u || 0) * f; b += (j.v || 0) * f; } } return [a, b]; };
    const uG = (zz) => uG0(zz) + jetOf(zz)[0], vG = (zz) => vG0(zz) + jetOf(zz)[1];
    const env = { spec: s, theta: lin(th), qv: lin(qv), uG, vG, zmax: zTop, table: { z, pi, theta: th, qv } };
    let mo = s.motion;
    if (!mo) { const b = bunkers(env); mo = { u: Math.round(b.right.u * 10) / 10, v: Math.round(b.right.v * 10) / 10 }; }
    env.motion = { u: mo.u, v: mo.v };
    env.u = (zz) => uG(zz) - mo.u; env.v = (zz) => vG(zz) - mo.v;
    return env;
  }

  /* the mean wind of a layer (the mean over height) */
  function meanWind(env, z0, z1) { const n = Math.max(4, Math.round((z1 - z0) / 50)); let u = 0, v = 0; for (let i = 0; i <= n; i++) { const w = i === 0 || i === n ? 0.5 : 1, zz = z0 + (z1 - z0) * i / n; u += w * env.uG(zz); v += w * env.vG(zz); } return { u: u / n, v: v / n }; }

  /* Bunkers et al. (2000), the internal dynamics method: the mean wind of 0-6 km, and 7.5 m/s from it at a right angle to the shear between the mean winds of 0-0.5 and 5.5-6 km */
  function bunkers(env, D = 7.5) {
    const m = meanWind(env, 0, 6000), lo = meanWind(env, 0, 500), hi = meanWind(env, 5500, 6000), sx = hi.u - lo.u, sy = hi.v - lo.v, sp = Math.hypot(sx, sy) || 1, ux = sy / sp, uy = -sx / sp;
    return { right: { u: m.u + D * ux, v: m.v + D * uy }, left: { u: m.u - D * ux, v: m.v - D * uy }, mean: m };
  }

  /* the storm-relative helicity of a layer for a storm motion c: the integral of (v - cv) du/dz - (u - cu) dv/dz over the height, m2/s2 */
  function srh(env, z0, z1, c) {
    const n = Math.max(8, Math.round((z1 - z0) / 25)), h = (z1 - z0) / n; let s = 0;
    for (let i = 0; i < n; i++) {
      const a = z0 + i * h, b = a + h, ua = env.uG(a), va = env.vG(a), ub = env.uG(b), vb = env.vG(b);
      s += ((va + vb) / 2 - c.v) * (ub - ua) - ((ua + ub) / 2 - c.u) * (vb - va);
    }
    return s;
  }

  /* the buoyancy of a parcel along the height: the area above the level of free convection (cape), below it where it is negative (cin), and where those are */
  function buoyancy(z, tvParcel, tvEnv, lcl) {
    let cape = 0, cin = 0, lfc = NaN, el = NaN;
    for (let k = 0; k < z.length - 1; k++) {
      const bk = G * (tvParcel[k] - tvEnv[k]) / tvEnv[k], bk1 = G * (tvParcel[k + 1] - tvEnv[k + 1]) / tvEnv[k + 1], dzk = z[k + 1] - z[k], b = 0.5 * (bk + bk1);
      if (Number.isNaN(lfc)) {
        if (b > 0 && z[k + 1] > lcl) lfc = Math.max(z[k], lcl);                       // the first buoyant layer above the condensation level
        else { if (b < 0) cin += b * dzk; continue; }                                  // until then the negative buoyancy is the inhibition
      }
      if (b > 0) { cape += b * dzk; el = z[k + 1]; }
    }
    return { cape, cin, lfc, el };
  }

  /* the rate at which saturated air cools as it rises, K/m, for a saturation mixing ratio qs at the temperature T */
  const moistLapse = (T, qs) => G * (1 + LV * qs / (RD * T)) / (CP + LV * LV * qs * EPS / (RD * T * T));

  /* a parcel of the given potential temperature and vapour mixing ratio lifted from the ground: dry up to its condensation level, then along the pseudo-adiabat; the CAPE, the CIN, the levels */
  function lift(env, th0, qv0) {
    const t = env.table, z = t.z, n = z.length, tvP = new Float64Array(n), tvE = new Float64Array(n);
    let sat = false, T = th0, lcl = NaN, qp = qv0;
    for (let k = 0; k < n; k++) {
      const pk = P0 * Math.pow(t.pi[k], CP / RD), Tenv = t.theta[k] * t.pi[k];
      tvE[k] = Tenv * (1 + RV1 * t.qv[k]);
      if (!sat) {
        T = th0 * t.pi[k];
        const qs = qvsAt(T, pk);
        if (qp >= qs) { sat = true; lcl = z[k]; qp = qs; }
      } else {
        const dzk = z[k] - z[k - 1], pm = P0 * Math.pow(0.5 * (t.pi[k] + t.pi[k - 1]), CP / RD), Tm = T - 0.5 * moistLapse(T, qvsAt(T, pm)) * dzk;      // the midpoint rule: the rate at the middle of the layer
        T -= moistLapse(Tm, qvsAt(Tm, pm)) * dzk; qp = qvsAt(T, pk);
      }
      tvP[k] = T * (1 + RV1 * qp);
    }
    if (Number.isNaN(lcl)) lcl = z[n - 1];
    const b = buoyancy(z, tvP, tvE, lcl);
    return { cape: b.cape, cin: b.cin, lcl, lfc: b.lfc, el: b.el };
  }

  /* the significant tornado parameter of Thompson et al. (2003), fixed layers: the mixed-layer CAPE over 1500 J/kg, the condensation level (1 at 1000 m or less, 0 at 2000 m or more), the helicity of 0-1 km over 150,
     the 0-6 km shear over 20 m/s (0 under 12.5, at most 1.5) and the mixed-layer CIN (1 at -50 J/kg or less deep, 0 at -200) */
  function stpOf(mlcape, mllcl, srh01, shear06, mlcin) {
    const lclTerm = Math.max(0, Math.min(1, (2000 - mllcl) / 1000)), shTerm = shear06 < 12.5 ? 0 : Math.min(1.5, shear06 / 20), cinTerm = Math.max(0, Math.min(1, (200 + mlcin) / 150));
    return Math.max(0, mlcape / 1500) * lclTerm * Math.max(0, srh01 / 150) * shTerm * cinTerm;
  }

  function indices(env, opt) {
    const o = Object.assign({ ml: 1000, c: null }, opt || {}), t = env.table;
    const sb = lift(env, t.theta[0], t.qv[0]);
    let th = 0, qv = 0, n = 0; for (let k = 0; t.z[k] <= o.ml; k++) { th += t.theta[k]; qv += t.qv[k]; n++; }
    const ml = lift(env, th / n, qv / n);
    const b = bunkers(env), c = o.c || b.right, shear = (z1) => Math.hypot(env.uG(z1) - env.uG(0), env.vG(z1) - env.vG(0));
    const s01 = shear(1000), s03 = shear(3000), s06 = shear(6000), h01 = srh(env, 0, 1000, c), h03 = srh(env, 0, 3000, c);
    const stp = stpOf(ml.cape, ml.lcl, h01, s06, ml.cin);
    return { sbcape: sb.cape, sbcin: sb.cin, sblcl: sb.lcl, sblfc: sb.lfc, sbel: sb.el, mlcape: ml.cape, mlcin: ml.cin, mllcl: ml.lcl, mllfc: ml.lfc, mlel: ml.el,
      shear01: s01, shear03: s03, shear06: s06, srh01: h01, srh03: h03, motion: { u: c.u, v: c.v }, bunkers: b, stp };
  }

  globalThis.HFSevereSounding = { make, indices, presets, bunkers, srh, pchip, lift, buoyancy, qvsAt, stpOf, meanWind, moistLapse };
})();
