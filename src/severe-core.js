/*  Severe: the real core.
 *
 *  A fully compressible, non-hydrostatic cloud-model dynamical core in double precision. It is the reference that the WebGPU port of the Severe discipline is
 *  tested against (docs/severe-plan.md, section 6.1), so it favours being simple and checkable over being fast.
 *
 *  Equations (Klemp & Wilhelmson 1978), in perturbations about a hydrostatic base state theta_bar(z), qv_bar(z), pi_bar(z): the winds u, v, w, the potential
 *  temperature theta' and the Exner function pi' (pi = (p/p0)^(R/cp)); with moisture, also the vapour perturbation qv' and the cloud and rain waters qc, qr:
 *     du/dt      = -u.grad(u) - cp theta_v d(pi')/dx + f v + D(u)
 *     dv/dt      = -u.grad(v) - cp theta_v d(pi')/dy - f u + D(v)
 *     dw/dt      = -u.grad(w) - cp theta_v d(pi')/dz + g theta_v'/theta_v_bar + D(w)
 *     dtheta'/dt = -u.grad(theta') - w d(theta_bar)/dz + D(theta')        (+ the heat of condensation, from the microphysics)
 *     dpi'/dt    = -u.grad(pi') - c_bar^2 / (cp rho_bar theta_v_bar^2) div(rho_bar theta_v_bar u)      (+ the expansion by that heat)
 *  where theta_v = theta (1 + 0.608 qv - qc - qr) is the density potential temperature (the weight of the water is in the buoyancy). The pressure equation
 *  is the exact one of moist air: the base-state advection w d(pi_bar)/dz is inside the density-weighted divergence. Nothing of the base state's own pressure
 *  gradient is ever computed, so a base state at rest stays at rest exactly.
 *
 *  Space: an Arakawa C grid (u on the x faces, v on the y faces, w on the z faces, everything else at cell centres), uniform spacing, a halo of three cells.
 *  Advection is the 5th-order upwind-biased flux form of Wicker & Skamarock (2002), written as the flux differences minus the field times the divergence of the
 *  advecting flow, so that a constant field is never changed whatever the flow does. Time: their RK3, each stage integrating the fast acoustic terms (the
 *  pressure gradient and the divergence) with forward-backward small steps and divergence damping while the slow tendencies stay fixed.
 *
 *  Moisture: Kessler's warm-rain scheme as in WRF's module_mp_kessler (rain falls with its mass-weighted speed, autoconversion and accretion make rain, rain
 *  evaporates in dry air, one Newton step of saturation adjustment condenses or evaporates cloud), applied once per step after the dynamics.
 *
 *  Boundaries, per direction: 'wall' (free slip, nothing through, zero gradient of everything else) or 'periodic'; z is always a wall (ground and lid). Optional
 *  damping: a Rayleigh layer under the lid and a sponge along the lateral edges, relaxing the perturbations (and the winds towards the base-state winds).
 *  A 2-D slice is a grid with ny = 1 (no y terms, no halo in y).
 *
 *  Pure JavaScript, no DOM. A classic script that sets `globalThis.HFSevereCore`.
 */
(function () {
  'use strict';
  const G = 9.81, CP = 1005.7, RD = 287.04, P0 = 1e5, CV = CP - RD, GAMMA = CP / CV, H = 3, RV1 = 0.608;
  const KS = { c1: 0.001, c2: 0.001, c3: 2.2, c4: 0.875, XLV: 2.5e6, SVP1: 0.6112, SVP2: 17.67, SVP3: 29.65, SVPT0: 273.15, EP2: 0.622, MAXCR: 0.75 };   // WRF's Kessler constants
  const F5 = KS.SVP2 * (KS.SVPT0 - KS.SVP3) * KS.XLV / CP;

  /* the gamma function (Lanczos), for the integrals over exponential size distributions */
  function gammaF(x) {
    if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaF(1 - x));
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    x -= 1; let t = c[0]; const g = x + 7.5;
    for (let i = 1; i < 9; i++) t += c[i] / (x + i);
    return Math.sqrt(2 * Math.PI) * Math.pow(g, x + 0.5) * Math.exp(-g) * t;
  }

  /* the upwind-biased value of the face between c and d from the six values a..f along the line (WS02, fifth order); v is the advecting speed at the face */
  function face5(a, b, c, d, e, f, v) {
    const p = (37 * (c + d) - 8 * (b + e) + (a + f)) / 60, dis = ((f - a) - 5 * (e - b) + 10 * (d - c)) / 60;
    return v > 0 ? p - dis : v < 0 ? p + dis : p;
  }

  function create(o) {
    const nx = o.nx, ny = o.ny || 1, nz = o.nz, dx = o.dx, dy = o.dy || o.dx, dz = o.dz;
    const bc = Object.assign({ x: 'wall', y: 'wall', z: 'wall' }, o.bc || {});
    if (bc.z !== 'wall') throw new Error('severe-core: z must be a wall (ground and lid)');
    const per = [bc.x === 'periodic', bc.y === 'periodic', false];
    const hy = ny > 1 ? H : 0, Nx = nx + 2 * H, Ny = ny + 2 * hy, Nz = nz + 2 * H, N = Nx * Ny * Nz;
    const sx = 1, sy = Nx, sz = Nx * Ny, off = H + hy * sy + H * sz;
    const idx = (i, j, k) => off + i * sx + j * sy + k * sz;
    const KH = (o.visc && o.visc.kh) || 0, KV = (o.visc && o.visc.kv) || 0, F = o.f || 0, ice = !!o.ice, moist = !!o.moist || ice;
    if (F && ny === 1) throw new Error('severe-core: Coriolis needs a 3-D grid (ny > 1)');
    const tracerNames = o.tracers || [], wnames = moist ? ['qv', 'qc', 'qr'].concat(ice ? ['qi', 'qs', 'qg'] : []) : [];       // qv is the PERTURBATION of the vapour about its base state
    const names = ['u', 'v', 'w', 'th', 'pi'].concat(wnames, tracerNames), scalarNames = ['th'].concat(wnames, tracerNames);
    const S = {}, S0 = {}, R = {};
    for (const n of names) { S[n] = new Float64Array(N); S0[n] = new Float64Array(N); R[n] = new Float64Array(N); }
    const THV = moist ? new Float64Array(N) : null;
    if (moist && !ice) { const ZERO = new Float64Array(N); S.qi = ZERO; S.qs = ZERO; S.qg = ZERO; }          // no ice: the ice waters are a shared array of zeros     // theta_v' of the stage state (the live theta' in a dry run)

    /* ---- the base state: theta_bar(z) and qv_bar(z) are given, pi_bar follows from hydrostatic balance with theta_v_bar (Simpson on a fine grid), then rho_bar and the sound speed ---- */
    const theta = o.theta || (() => 300), qvbar = moist && o.qv ? o.qv : () => 0, thetaV = (z) => theta(z) * (1 + RV1 * qvbar(z));
    const dthetaDz = (z) => (theta(z + 1) - theta(z - 1)) / 2, dqvDz = (z) => (qvbar(z + 1) - qvbar(z - 1)) / 2;
    function piBar(z) {
      const n = Math.max(2, Math.ceil(z / 5)) * 2, h = z / n;
      let s = 1 / thetaV(0) + 1 / thetaV(z);
      for (let m = 1; m < n; m++) s += (m % 2 ? 4 : 2) / thetaV(m * h);
      return 1 - (G / CP) * s * h / 3;
    }
    const windU = (o.wind && o.wind.u) || (() => 0), windV = (o.wind && o.wind.v) || (() => 0);
    const zc = new Float64Array(nz), zw = new Float64Array(nz + 1), thc = new Float64Array(nz), thvc = new Float64Array(nz), thvw = new Float64Array(nz + 1);
    const dthc = new Float64Array(nz), dqvc = new Float64Array(nz), qvbc = new Float64Array(nz), pibc = new Float64Array(nz), rhoc = new Float64Array(nz);
    const ubc = new Float64Array(nz), vbc = new Float64Array(nz);
    const Mc = new Float64Array(nz), Mw = new Float64Array(nz + 1), Cc = new Float64Array(nz);       // rho theta_v at centres and w levels; c^2/(cp rho theta_v^2) at centres
    let cmax = 0;
    for (let k = 0; k <= nz; k++) {
      zw[k] = k * dz; thvw[k] = thetaV(zw[k]);
      const pw = piBar(zw[k]); Mw[k] = P0 * Math.pow(pw, CV / RD) / RD;                           // rho theta_v = p0 pi^(cv/R) / R
    }
    for (let k = 0; k < nz; k++) {
      zc[k] = (k + 0.5) * dz; thc[k] = theta(zc[k]); thvc[k] = thetaV(zc[k]); dthc[k] = dthetaDz(zc[k]); qvbc[k] = qvbar(zc[k]); dqvc[k] = dqvDz(zc[k]);
      ubc[k] = windU(zc[k]); vbc[k] = windV(zc[k]);
      const pc = piBar(zc[k]), rho = P0 * Math.pow(pc, CV / RD) / (RD * thvc[k]), c2 = GAMMA * RD * thvc[k] * pc;
      pibc[k] = pc; rhoc[k] = rho; Mc[k] = rho * thvc[k]; Cc[k] = c2 / (CP * rho * thvc[k] * thvc[k]); cmax = Math.max(cmax, Math.sqrt(c2));
    }
    /* the largest small step of the forward-backward scheme: c dtau sqrt(1/dx^2 + 1/dy^2 + 1/dz^2) <= 1, with a margin */
    const dtauMax = (o.dtauFactor || 0.8) / (cmax * Math.sqrt(1 / (dx * dx) + (ny > 1 ? 1 / (dy * dy) : 0) + 1 / (dz * dz)));

    /* ---- damping: a Rayleigh layer under the lid and a sponge along the lateral edges ---- */
    const dmp = o.damp || null, rTop = new Float64Array(nz), rTopW = new Float64Array(nz + 1), rLat = new Float64Array(nx * ny);
    if (dmp) {
      const ztop = nz * dz, tp = dmp.top, lt = dmp.lateral;
      if (tp) for (let k = 0; k <= nz; k++) {
        const f = (v) => (v > ztop - tp.depth ? tp.rate * Math.pow(Math.sin(0.5 * Math.PI * (v - (ztop - tp.depth)) / tp.depth), 2) : 0);
        rTopW[k] = f(zw[k]); if (k < nz) rTop[k] = f(zc[k]);
      }
      if (lt) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        let d = Math.min((i + 0.5) * dx, (nx - i - 0.5) * dx);
        if (ny > 1) d = Math.min(d, (j + 0.5) * dy, (ny - j - 0.5) * dy);
        rLat[j * nx + i] = d < lt.width ? lt.rate * Math.pow(Math.cos(0.5 * Math.PI * d / lt.width), 2) : 0;
      }
    }

    /* ---- halos and boundary conditions ---- */
    const dimN = [nx, ny, nz], st = [sx, sy, sz], lo = [-H, -hy, -H], hi = [nx + H, ny + hy, nz + H];
    function fillDir(a, d, face) {          // face: the field lives on the faces of direction d (the normal wind), else at the cell centres
      const n = dimN[d], s = st[d], d1 = (d + 1) % 3, d2 = (d + 2) % 3, pr = per[d];
      for (let p = lo[d2]; p < hi[d2]; p++) for (let q = lo[d1]; q < hi[d1]; q++) {
        const b = off + q * st[d1] + p * st[d2];
        if (!face) {
          if (pr) for (let m = 1; m <= H; m++) { a[b - m * s] = a[b + (n - m) * s]; a[b + (n - 1 + m) * s] = a[b + (m - 1) * s]; }
          else for (let m = 1; m <= H; m++) { a[b - m * s] = a[b + (m - 1) * s]; a[b + (n - 1 + m) * s] = a[b + (n - m) * s]; }
        } else if (pr) {
          a[b + n * s] = a[b];
          for (let m = 1; m <= H; m++) { a[b - m * s] = a[b + (n - m) * s]; a[b + (n + m) * s] = a[b + m * s]; }
        } else {
          a[b] = 0; a[b + n * s] = 0;
          for (let m = 1; m <= H; m++) { a[b - m * s] = -a[b + m * s]; a[b + (n + m) * s] = -a[b + (n - m) * s]; }
        }
      }
    }
    const fill = (a, fx, fy, fz) => { fillDir(a, 0, fx); if (ny > 1) fillDir(a, 1, fy); fillDir(a, 2, fz); };
    const fillC = (a) => fill(a, 0, 0, 0);
    function fillAll(X) {
      fill(X.u, 1, 0, 0); if (ny > 1) fill(X.v, 0, 1, 0); fill(X.w, 0, 0, 1); fillC(X.th); fillC(X.pi);
      for (const n of wnames) fillC(X[n]);
      for (const n of tracerNames) fillC(X[n]);
    }
    function faceBC(X) {                    // the faces that sit on a wall are zero, the periodic duplicates are copies
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) { const a = idx(0, j, k), b = idx(nx, j, k); if (per[0]) X.u[b] = X.u[a]; else X.u[a] = X.u[b] = 0; }
      if (ny > 1) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { const a = idx(i, 0, k), b = idx(i, ny, k); if (per[1]) X.v[b] = X.v[a]; else X.v[a] = X.v[b] = 0; }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { X.w[idx(i, j, 0)] = 0; X.w[idx(i, j, nz)] = 0; }
    }

    /* ---- advection: out = -(u.grad psi) at the points of psi; tp: 0 centre, 1 u face, 2 v face, 3 w face ---- */
    function advect(out, psi, tp, U, V, W) {
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const o = idx(i, j, k), p0 = psi[o];
        let vl, vu;
        if (tp === 0) { vl = U[o]; vu = U[o + 1]; }
        else if (tp === 1) { vl = 0.5 * (U[o - 1] + U[o]); vu = 0.5 * (U[o] + U[o + 1]); }
        else if (tp === 2) { vl = 0.5 * (U[o - sy] + U[o]); vu = 0.5 * (U[o + 1 - sy] + U[o + 1]); }
        else { vl = 0.5 * (U[o - sz] + U[o]); vu = 0.5 * (U[o + 1 - sz] + U[o + 1]); }
        let a = (vu * (face5(psi[o - 2], psi[o - 1], p0, psi[o + 1], psi[o + 2], psi[o + 3], vu) - p0)
               - vl * (face5(psi[o - 3], psi[o - 2], psi[o - 1], p0, psi[o + 1], psi[o + 2], vl) - p0)) / dx;
        if (ny > 1) {
          if (tp === 0) { vl = V[o]; vu = V[o + sy]; }
          else if (tp === 1) { vl = 0.5 * (V[o - 1] + V[o]); vu = 0.5 * (V[o - 1 + sy] + V[o + sy]); }
          else if (tp === 2) { vl = 0.5 * (V[o - sy] + V[o]); vu = 0.5 * (V[o] + V[o + sy]); }
          else { vl = 0.5 * (V[o - sz] + V[o]); vu = 0.5 * (V[o - sz + sy] + V[o + sy]); }
          a += (vu * (face5(psi[o - 2 * sy], psi[o - sy], p0, psi[o + sy], psi[o + 2 * sy], psi[o + 3 * sy], vu) - p0)
              - vl * (face5(psi[o - 3 * sy], psi[o - 2 * sy], psi[o - sy], p0, psi[o + sy], psi[o + 2 * sy], vl) - p0)) / dy;
        }
        if (tp === 0) { vl = W[o]; vu = W[o + sz]; }
        else if (tp === 1) { vl = 0.5 * (W[o - 1] + W[o]); vu = 0.5 * (W[o - 1 + sz] + W[o + sz]); }
        else if (tp === 2) { vl = 0.5 * (W[o - sy] + W[o]); vu = 0.5 * (W[o - sy + sz] + W[o + sz]); }
        else { vl = 0.5 * (W[o - sz] + W[o]); vu = 0.5 * (W[o] + W[o + sz]); }
        a += (vu * (face5(psi[o - 2 * sz], psi[o - sz], p0, psi[o + sz], psi[o + 2 * sz], psi[o + 3 * sz], vu) - p0)
            - vl * (face5(psi[o - 3 * sz], psi[o - 2 * sz], psi[o - sz], p0, psi[o + sz], psi[o + 2 * sz], vl) - p0)) / dz;
        out[o] = -a;
      }
    }
    function addDiff(out, psi) {            // constant-coefficient Laplacian: KH in the horizontal, KV in the vertical
      if (!KH && !KV) return;
      const ax = KH / (dx * dx), ay = KH / (dy * dy), az = KV / (dz * dz);
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const o = idx(i, j, k), p0 = psi[o];
        let d = ax * (psi[o - 1] - 2 * p0 + psi[o + 1]) + az * (psi[o - sz] - 2 * p0 + psi[o + sz]);
        if (ny > 1) d += ay * (psi[o - sy] - 2 * p0 + psi[o + sy]);
        out[o] += d;
      }
    }
    /* positive-definite advection (for cloud and rain): the same 5th-order upwind-biased fluxes in flux form with the base-state density, then the outgoing flux of every cell
       scaled down so that the cell cannot give away more than it holds (Skamarock & Weisman 2009, as in WRF's moist_adv_opt = 1): conservative, and nothing goes negative.
       out = -(1/rho) div(rho u psi); psi0 is the field at the start of the stage and ds its length. */
    const FX = moist ? new Float64Array(N) : null, FY = moist ? new Float64Array(N) : null, FZ = moist ? new Float64Array(N) : null, BETA = moist ? new Float64Array(N) : null;
    const rhoW = new Float64Array(nz + 1); for (let k = 0; k <= nz; k++) rhoW[k] = Mw[k] / thvw[k];
    function advectPD(out, psi, psi0, ds, U, V, W) {
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i <= nx; i++) {
        const o = idx(i, j, k), v = U[o];
        FX[o] = rhoc[k] * v * face5(psi[o - 3], psi[o - 2], psi[o - 1], psi[o], psi[o + 1], psi[o + 2], v);
      }
      if (ny > 1) for (let k = 0; k < nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) {
        const o = idx(i, j, k), v = V[o];
        FY[o] = rhoc[k] * v * face5(psi[o - 3 * sy], psi[o - 2 * sy], psi[o - sy], psi[o], psi[o + sy], psi[o + 2 * sy], v);
      }
      for (let k = 0; k <= nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const o = idx(i, j, k), v = W[o];
        FZ[o] = (k === 0 || k === nz) ? 0 : rhoW[k] * v * face5(psi[o - 3 * sz], psi[o - 2 * sz], psi[o - sz], psi[o], psi[o + sz], psi[o + 2 * sz], v);
      }
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const o = idx(i, j, k);
        let outf = (Math.max(FX[o + 1], 0) + Math.max(-FX[o], 0)) / dx + (Math.max(FZ[o + sz], 0) + Math.max(-FZ[o], 0)) / dz;
        if (ny > 1) outf += (Math.max(FY[o + sy], 0) + Math.max(-FY[o], 0)) / dy;
        const cap = rhoc[k] * Math.max(psi0[o], 0) / ds;
        BETA[o] = outf > cap ? cap / outf : 1;
      }
      fillC(BETA);
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i <= nx; i++) { const o = idx(i, j, k); FX[o] *= FX[o] > 0 ? BETA[o - 1] : BETA[o]; }
      if (ny > 1) for (let k = 0; k < nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) { const o = idx(i, j, k); FY[o] *= FY[o] > 0 ? BETA[o - sy] : BETA[o]; }
      for (let k = 1; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const o = idx(i, j, k); FZ[o] *= FZ[o] > 0 ? BETA[o - sz] : BETA[o]; }
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const o = idx(i, j, k);
        let d = (FX[o + 1] - FX[o]) / dx + (FZ[o + sz] - FZ[o]) / dz;
        if (ny > 1) d += (FY[o + sy] - FY[o]) / dy;
        out[o] = -d / rhoc[k];
      }
    }
    function computeTHV(X) {                // theta_v' of the stage state, with the weight of cloud and rain
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const o = idx(i, j, k);
        THV[o] = (thc[k] + X.th[o]) * (1 + RV1 * (qvbc[k] + X.qv[o]) - X.qc[o] - X.qr[o] - X.qi[o] - X.qs[o] - X.qg[o]) - thvc[k];
      }
      fillC(THV);
    }
    const TV = moist ? THV : S.th;          // what the pressure gradient and the buoyancy read

    /* ---- the slow tendencies of a stage state X (advection, diffusion, buoyancy, the base-state gradients, Coriolis, damping) ---- */
    function slow(X, ds) {
      fillAll(X);
      if (moist) computeTHV(X);
      advect(R.u, X.u, 1, X.u, X.v, X.w); addDiff(R.u, X.u);
      if (ny > 1) { advect(R.v, X.v, 2, X.u, X.v, X.w); addDiff(R.v, X.v); }
      advect(R.w, X.w, 3, X.u, X.v, X.w); addDiff(R.w, X.w);
      advect(R.th, X.th, 0, X.u, X.v, X.w); addDiff(R.th, X.th);
      advect(R.pi, X.pi, 0, X.u, X.v, X.w);
      for (const n of wnames) { if (n === 'qv') advect(R[n], X[n], 0, X.u, X.v, X.w); else advectPD(R[n], X[n], S0[n], ds, X.u, X.v, X.w); addDiff(R[n], X[n]); }
      for (const n of tracerNames) { advect(R[n], X[n], 0, X.u, X.v, X.w); addDiff(R[n], X[n]); }
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const o = idx(i, j, k);
        if (k >= 1) R.w[o] += G * 0.5 * (TV[o - sz] + TV[o]) / thvw[k];
        const wc = 0.5 * (X.w[o] + X.w[o + sz]);
        R.th[o] -= wc * dthc[k];
        if (moist) R.qv[o] -= wc * dqvc[k];
        if (F) {
          R.u[o] += F * 0.25 * (X.v[o - 1] + X.v[o] + X.v[o - 1 + sy] + X.v[o + sy]);
          R.v[o] -= F * 0.25 * (X.u[o] + X.u[o + 1] + X.u[o - sy] + X.u[o + 1 - sy]);
        }
        if (dmp) {
          const rl = rLat[j * nx + i], rc = Math.max(rTop[k], rl);
          R.u[o] -= rc * (X.u[o] - ubc[k]); if (ny > 1) R.v[o] -= rc * (X.v[o] - vbc[k]);
          R.w[o] -= Math.max(rTopW[k], rl) * X.w[o]; R.th[o] -= rc * X.th[o]; R.pi[o] -= rl * X.pi[o];
          for (const n of wnames) R[n][o] -= rc * X[n][o];
        }
      }
    }

    /* ---- the fast terms: forward-backward small steps from the state at the start of the step, the slow tendencies R held fixed, theta_v frozen at the stage state ---- */
    const DD = o.divdamp === undefined ? 0.1 : o.divdamp, PS = new Float64Array(N), PP = new Float64Array(N);   // divergence damping: the pressure gradient uses pi' extrapolated forward by DD of its last change
    function acoustic(ds) {
      const ns = Math.max(1, Math.ceil(ds / dtauMax - 1e-9)), dt = ds / ns;
      for (const n of ['u', 'v', 'w', 'pi']) S[n].set(S0[n]);
      PP.set(S.pi);
      for (let m = 0; m < ns; m++) {
        fillC(S.pi);
        for (let n = 0; n < N; n++) { PS[n] = S.pi[n] + DD * (S.pi[n] - PP[n]); PP[n] = S.pi[n]; }
        for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const o = idx(i, j, k);
          S.u[o] += dt * (R.u[o] - CP * (thvc[k] + 0.5 * (TV[o - 1] + TV[o])) * (PS[o] - PS[o - 1]) / dx);
          if (ny > 1) S.v[o] += dt * (R.v[o] - CP * (thvc[k] + 0.5 * (TV[o - sy] + TV[o])) * (PS[o] - PS[o - sy]) / dy);
          if (k >= 1) S.w[o] += dt * (R.w[o] - CP * (thvw[k] + 0.5 * (TV[o - sz] + TV[o])) * (PS[o] - PS[o - sz]) / dz);
        }
        faceBC(S);
        for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const o = idx(i, j, k);
          let d = Mc[k] * (S.u[o + 1] - S.u[o]) / dx + (Mw[k + 1] * S.w[o + sz] - Mw[k] * S.w[o]) / dz;
          if (ny > 1) d += Mc[k] * (S.v[o + sy] - S.v[o]) / dy;
          S.pi[o] += dt * (R.pi[o] - Cc[k] * d);
        }
      }
    }

    /* ---- Kessler's warm-rain microphysics, as in WRF's module_mp_kessler: rain falls, rain forms, rain evaporates, cloud condenses or evaporates ---- */
    const precip = new Float64Array(nx * ny), stat = { clipped: 0, rainOut: 0 };      // precip: mm at the ground; clipped: water added by clipping negatives (kg); rainOut: rain through the ground (kg)
    const qrc = new Float64Array(nz), vt = new Float64Array(nz), vtden = new Float64Array(nz);
    for (let k = 0; k < nz; k++) vtden[k] = Math.sqrt(rhoc[0] / rhoc[k]);
    const fallSpeed = (q, k) => 36.34 * Math.pow(Math.max(0, q * 0.001 * rhoc[k]), 0.1364) * vtden[k];
    function micro(dt) {
      const area = dx * (ny > 1 ? dy : 1);
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {      // the dynamics can leave small negative waters: clip them (and count what that adds)
        const o = idx(i, j, k), qv = qvbc[k] + S.qv[o];
        if (S.qc[o] < 0) { stat.clipped -= S.qc[o] * rhoc[k] * dz * area; S.qc[o] = 0; }
        if (S.qr[o] < 0) { stat.clipped -= S.qr[o] * rhoc[k] * dz * area; S.qr[o] = 0; }
        if (qv < 0) { stat.clipped -= qv * rhoc[k] * dz * area; S.qv[o] = -qvbc[k]; }
      }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {                    // rain falls, column by column, in steps short enough for a Courant number of 0.75
        let crmax = 0;
        for (let k = 0; k < nz; k++) { qrc[k] = S.qr[idx(i, j, k)]; vt[k] = fallSpeed(qrc[k], k); crmax = Math.max(crmax, vt[k] * dt / dz); }
        let nfall = Math.max(1, Math.round(0.5 + crmax / KS.MAXCR)), dtfall = dt / nfall, tsed = dt;
        for (;;) {
          tsed -= dtfall;
          const out = rhoc[0] * qrc[0] * vt[0] * dtfall; precip[j * nx + i] += out; stat.rainOut += out * area;
          for (let k = 0; k < nz - 1; k++) qrc[k] -= dtfall / (dz * rhoc[k]) * (rhoc[k] * qrc[k] * vt[k] - rhoc[k + 1] * qrc[k + 1] * vt[k + 1]);
          qrc[nz - 1] -= dtfall / dz * qrc[nz - 1] * vt[nz - 1];
          if (nfall > 1) {
            nfall--; crmax = 0;
            for (let k = 0; k < nz; k++) { vt[k] = fallSpeed(qrc[k], k); crmax = Math.max(crmax, vt[k] * tsed / dz); }
            const nn = Math.max(1, Math.round(0.5 + crmax / KS.MAXCR));
            if (nn !== nfall) { nfall = nn; dtfall = tsed / nfall; }
          } else break;
        }
        for (let k = 0; k < nz; k++) S.qr[idx(i, j, k)] = qrc[k];
      }
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const o = idx(i, j, k);
        let qc = S.qc[o], qr = S.qr[o];
        const qv0 = qvbc[k] + S.qv[o], th0 = thc[k] + S.th[o];
        const factorn = 1 / (1 + KS.c3 * dt * Math.pow(qr, KS.c4));                           // accretion (implicit) and autoconversion
        const qrprod = qc * (1 - factorn) + factorn * KS.c1 * dt * Math.max(qc - KS.c2, 0);
        qc = Math.max(qc - qrprod, 0); qr = Math.max(qr + qrprod, 0);
        const rho = rhoc[k], rcgs = 0.001 * rho, pii = pibc[k] + S.pi[o], temp = pii * th0, pressure = P0 * Math.pow(pii, CP / RD), gam = KS.XLV / (CP * pii);
        const es = 1000 * KS.SVP1 * Math.exp(KS.SVP2 * (temp - KS.SVPT0) / (temp - KS.SVP3)), qvs = KS.EP2 * es / (pressure - es);
        const prod = (qv0 - qvs) / (1 + pressure / (pressure - es) * qvs * F5 / ((temp - KS.SVP3) * (temp - KS.SVP3)));     // one Newton step of saturation adjustment
        const ern = Math.min(dt * (((1.6 + 124.9 * Math.pow(rcgs * qr, 0.2046)) * Math.pow(rcgs * qr, 0.525)) / (2.55e8 / (pressure * qvs) + 5.4e5)) * (Math.max(qvs - qv0, 0) / (rcgs * qvs)),
                             Math.max(-prod - qc, 0), qr);                                     // rain evaporates in subsaturated air
        const product = Math.max(prod, -qc);
        const th1 = th0 + gam * (product - ern), qv1 = Math.max(qv0 - product + ern, 0);
        S.th[o] = th1 - thc[k]; S.qv[o] = qv1 - qvbc[k]; S.qc[o] = qc + product; S.qr[o] = qr - ern;
        S.pi[o] += Cc[k] * rho * (th1 * (1 + RV1 * qv1) - th0 * (1 + RV1 * qv0));              // the expansion by the heat released (the diabatic term of the pressure equation)
      }
    }

    /* ---- ice microphysics: a single-moment scheme of the Lin et al. (1983) / Rutledge & Hobbs (1984) class with five water species: cloud water, rain, cloud ice, snow and
       graupel or hail. Rain, snow and graupel have exponential size distributions N0 exp(-lambda D) (rain N0 = 8e6 m-4; snow N0 = 2e6 exp(0.12 (T0 - T)), density 100 kg/m3, as in
       WSM6; graupel N0 = 4e6 m-4 and density 400 kg/m3 by default, the graupel of Lin et al.; the "hail" setting of Lin et al. is iceParams { n0g: 4e4, rhog: 900 }, which makes
       reflectivities about 14 dB higher in a Weisman-Klemp storm than the real storms measured by radar, docs/severe-research.md part 3); cloud ice has the number of Rutledge & Hobbs.
       Every process moves mass between species with its latent heat (condensation Lv, freezing and melting Lf, deposition and sublimation Ls = Lv + Lf), so water and the moist enthalpy
       cp T + Lv qv - Lf (qi + qs + qg) are conserved by construction. The processes are applied one after the other, each limited by what it can take. ---- */
    const T0 = 273.15, LF = 3.34e5, LV = KS.XLV, LS = LV + LF, RVAP = 461.5, lvK = LV / CP, lfK = LF / CP, lsK = LS / CP;
    const IPAR = Object.assign({ n0g: 4e6, rhog: 400 }, o.iceParams || {}), RHO0 = rhoc[0];
    const N0R = 8e6, RHOW = 1000, RHOS = 100, N0S0 = 2e6, VRa = 842, VRb = 0.8, VSa = 11.72, VSb = 0.41, VGa = Math.sqrt(4 * G * IPAR.rhog / (3 * 0.6 * RHO0)), VGb = 0.5;   // fall speed a D^b (rain: Liu & Orville; snow: Locatelli & Hobbs; hail: drag law with C_D = 0.6)
    const gvent = (b) => gammaF((b + 5) / 2), gmass = (b) => gammaF(4 + b) / 6, gcoll = (b) => gammaF(3 + b);
    const GR = { vent: gvent(VRb), mass: gmass(VRb), coll: gcoll(VRb) }, GS = { vent: gvent(VSb), mass: gmass(VSb), coll: gcoll(VSb) }, GG = { vent: gvent(VGb), mass: gmass(VGb), coll: gcoll(VGb) };
    const lamOf = (n0, rhox, rho, q) => Math.pow(Math.PI * rhox * n0 / (rho * q), 0.25);
    const n0sOf = (T) => Math.min(2e8, N0S0 * Math.exp(0.12 * Math.max(0, T0 - T)));
    const vbar = (a, b, mass, rho, l) => a * Math.sqrt(RHO0 / rho) * mass / Math.pow(l, b);                                   // mass-weighted fall speed of an exponential distribution
    const collSmall = (E, n0, a, b, coll, rho, l) => E * Math.PI / 4 * n0 * a * Math.sqrt(RHO0 / rho) * coll / Math.pow(l, 3 + b);   // 1/s: what a species sweeps out of small particles at rest
    // What x collects of y (kg/m3/s): the integral of the collision kernel (pi/4) (Dx + Dy)^2 |Vx - Vy| m(Dy) N(Dx) N(Dy) over both exponential distributions. Expanding (Dx + Dy)^2 gives three
    // terms, with Dx^2 Dy^3, 2 Dx Dy^4 and Dy^5 under the integral; each is evaluated with the fall speed each distribution has under its own weight D^p, V(p) = a Gamma(1 + p + b) / Gamma(1 + p) / lambda^b
    // (Lin et al. 1983 took one mean speed for each distribution for the whole integral: for 1 g/kg of graupel and 1 g/kg of rain, which fall at 5.2 and 6.1 m/s on average, that gives a rate 5.5 times
    // smaller than the double integral, because the collisions are carried by the large drops, at 8 m/s, and the small graupel that are most of the number, at 2 m/s; tests/severe_ice.mjs).
    const gw = (b) => [0, 1, 2, 3, 4, 5].map((p) => gammaF(1 + p + b) / gammaF(1 + p));
    const SPR = { a: VRa, b: VRb, g: gw(VRb) }, SPS = { a: VSa, b: VSb, g: gw(VSb) }, SPG = { a: VGa, b: VGb, g: gw(VGb) };
    const vW = (S, p, rho, l) => S.a * Math.sqrt(RHO0 / rho) * S.g[p] / Math.pow(l, S.b);
    const pairColl = (E, rhoY, n0x, n0y, X, lx, Y, ly, rho) => Math.PI * Math.PI * E * rhoY * n0x * n0y * (
      0.5 * Math.abs(vW(X, 2, rho, lx) - vW(Y, 3, rho, ly)) / (lx * lx * lx * ly * ly * ly * ly) + 2 * Math.abs(vW(X, 1, rho, lx) - vW(Y, 4, rho, ly)) / (lx * lx * Math.pow(ly, 5)) +
      5 * Math.abs(vW(X, 0, rho, lx) - vW(Y, 5, rho, ly)) / (lx * Math.pow(ly, 6)));
    const ventI = (a, b, gv, l, rho, nu, sc) => 0.78 / (l * l) + 0.31 * Math.cbrt(sc) * Math.sqrt(a * Math.sqrt(RHO0 / rho) / nu) * gv / Math.pow(l, (b + 5) / 2);
    const esw = (T) => 1000 * KS.SVP1 * Math.exp(KS.SVP2 * (T - KS.SVPT0) / (T - KS.SVP3)), esi = (T) => 611.2 * Math.exp(21.8745584 * (T - 273.16) / (T - 7.66));
    const precipS = new Float64Array(nx * ny), precipG = new Float64Array(nx * ny), sedQ = new Float64Array(nz), sedV = new Float64Array(nz);
    const temp = (q, k) => (thc[k] + S.th[q]) * (pibc[k] + S.pi[q]);
    const vRain = (q, k, o) => q < 1e-12 ? 0 : vbar(VRa, VRb, GR.mass, rhoc[k], lamOf(N0R, RHOW, rhoc[k], q));
    const vSnow = (q, k, o) => q < 1e-12 ? 0 : vbar(VSa, VSb, GS.mass, rhoc[k], lamOf(n0sOf(temp(o, k)), RHOS, rhoc[k], q));
    const vGrau = (q, k, o) => q < 1e-12 ? 0 : vbar(VGa, VGb, GG.mass, rhoc[k], lamOf(IPAR.n0g, IPAR.rhog, rhoc[k], q));
    const vIce = (q, k, o) => q < 1e-12 ? 0 : 3.29 * Math.pow(rhoc[k] * q, 0.16);
    function sediment(name, vfun, dt, pr1, pr2) {          // a species falls out of its columns by the upwind step in steps short enough for a Courant number of 0.75; its flux at the ground is precipitation
      const area = dx * (ny > 1 ? dy : 1), A = S[name];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        let crmax = 0;
        for (let k = 0; k < nz; k++) { const o = idx(i, j, k); sedQ[k] = A[o]; sedV[k] = vfun(sedQ[k], k, o); crmax = Math.max(crmax, sedV[k] * dt / dz); }
        if (crmax === 0) continue;
        let nfall = Math.max(1, Math.round(0.5 + crmax / KS.MAXCR)), dtfall = dt / nfall, tsed = dt;
        for (;;) {
          tsed -= dtfall;
          const out = rhoc[0] * sedQ[0] * sedV[0] * dtfall; precip[j * nx + i] += out; if (pr1) pr1[j * nx + i] += out; if (pr2) pr2[j * nx + i] += out; stat.rainOut += out * area;
          for (let k = 0; k < nz - 1; k++) sedQ[k] -= dtfall / (dz * rhoc[k]) * (rhoc[k] * sedQ[k] * sedV[k] - rhoc[k + 1] * sedQ[k + 1] * sedV[k + 1]);
          sedQ[nz - 1] -= dtfall / dz * sedQ[nz - 1] * sedV[nz - 1];
          if (nfall > 1) {
            nfall--; crmax = 0;
            for (let k = 0; k < nz; k++) { const o = idx(i, j, k); sedV[k] = vfun(sedQ[k], k, o); crmax = Math.max(crmax, sedV[k] * tsed / dz); }
            const nn = Math.max(1, Math.round(0.5 + crmax / KS.MAXCR));
            if (nn !== nfall) { nfall = nn; dtfall = tsed / nfall; }
          } else break;
        }
        for (let k = 0; k < nz; k++) A[idx(i, j, k)] = sedQ[k];
      }
    }
    function clipWaters() {                                // the dynamics can leave small negative waters: clip them (and count what that adds)
      const area = dx * (ny > 1 ? dy : 1);
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const o = idx(i, j, k), qv = qvbc[k] + S.qv[o], m = rhoc[k] * dz * area;
        for (const n of wnames) if (n !== 'qv' && S[n][o] < 0) { stat.clipped -= S[n][o] * m; S[n][o] = 0; }
        if (qv < 0) { stat.clipped -= qv * m; S.qv[o] = -qvbc[k]; }
      }
    }
    const sedOn = o.sediment !== false;
    function microIce(dt) {
      clipWaters();
      if (sedOn) { sediment('qr', vRain, dt, null, null); sediment('qi', vIce, dt, precipS, null); sediment('qs', vSnow, dt, precipS, null); sediment('qg', vGrau, dt, null, precipG); }
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const o = idx(i, j, k);
        let qv = qvbc[k] + S.qv[o], qc = S.qc[o], qr = S.qr[o], qi = S.qi[o], qs = S.qs[o], qg = S.qg[o];
        const pii = pibc[k] + S.pi[o], th0 = thc[k] + S.th[o], rho = rhoc[k], p = P0 * Math.pow(pii, CP / RD), qv0 = qv;
        let T = th0 * pii;
        const hyd = qc + qr + qi + qs + qg;
        if (hyd < 1e-12) {                                  // nothing to do in clear air that is not supersaturated
          const ew = esw(T); if (qv <= KS.EP2 * ew / (p - ew) && !(T < T0 && qv > KS.EP2 * esi(T) / (p - esi(T)))) continue;
        }
        const mu = 1.458e-6 * Math.pow(T, 1.5) / (T + 110.4), nu = mu / rho, dv = 2.11e-5 * Math.pow(T / 273.15, 1.94) * 101325 / p, sc = nu / dv, ka = 0.0243 + 7.8e-5 * (T - 273.15);
        const hasS0 = qs > 1e-12, hasG0 = qg > 1e-12;
        let lS = 0, lG = 0, n0s = 0;
        if (hasS0) { n0s = n0sOf(T); lS = lamOf(n0s, RHOS, rho, qs); }
        if (hasG0) lG = lamOf(IPAR.n0g, IPAR.rhog, rho, qg);
        if (T > T0) {                                       // melting: cloud ice at once, snow and hail by the heat the air gives them (the bright band)
          if (qi > 0) { qc += qi; T -= lfK * qi; qi = 0; }
          const qsT0 = KS.EP2 * 611.2 / (p - 611.2);
          if (hasS0) { const Q = ka * (T - T0) + LV * dv * rho * (qv - qsT0); if (Q > 0) { const d = Math.min(2 * Math.PI * n0s * Q / (rho * LF) * ventI(VSa, VSb, GS.vent, lS, rho, nu, sc) * dt, qs, (T - T0) / lfK); qs -= d; qr += d; T -= lfK * d; } }
          if (hasG0) { const Q = ka * (T - T0) + LV * dv * rho * (qv - qsT0); if (Q > 0) { const d = Math.min(2 * Math.PI * IPAR.n0g * Q / (rho * LF) * ventI(VGa, VGb, GG.vent, lG, rho, nu, sc) * dt, qg, (T - T0) / lfK); qg -= d; qr += d; T -= lfK * d; } }
        }
        if (T < 233.15) {                                   // homogeneous freezing
          if (qc > 0) { qi += qc; T += lfK * qc; qc = 0; }
          if (qr > 0) { qg += qr; T += lfK * qr; qr = 0; }
        }
        if (T < T0) {
          let lR = qr > 1e-12 ? lamOf(N0R, RHOW, rho, qr) : 0;
          if (lR > 0) {                                     // freezing of rain (Bigg 1953) to graupel
            const d = Math.min(qr, 20 * Math.PI * Math.PI * 100 * N0R * (RHOW / rho) * (Math.exp(0.66 * (T0 - T)) - 1) / Math.pow(lR, 7) * dt); qr -= d; qg += d; T += lfK * d;
            if (qg > 1e-12 && lG === 0) lG = lamOf(IPAR.n0g, IPAR.rhog, rho, qg);
          }
          const hasS = qs > 1e-12 && lS > 0, hasG = qg > 1e-12 && (lG > 0 || (lG = lamOf(IPAR.n0g, IPAR.rhog, rho, qg)) > 0);
          if (qc > 1e-12) {                                 // riming: snow and graupel collect cloud water, which freezes onto them
            if (hasS) { const d = qc * (1 - Math.exp(-collSmall(1, n0s, VSa, VSb, GS.coll, rho, lS) * dt)); qc -= d; qs += d; T += lfK * d; }
            if (hasG) { const d = qc * (1 - Math.exp(-collSmall(1, IPAR.n0g, VGa, VGb, GG.coll, rho, lG) * dt)); qc -= d; qg += d; T += lfK * d; }
          }
          if (hasG && lR > 0 && qr > 1e-12) { const d = Math.min(qr, pairColl(1, RHOW, IPAR.n0g, N0R, SPG, lG, SPR, lR, rho) / rho * dt); qr -= d; qg += d; T += lfK * d; }     // graupel collects rain
          if (hasG && hasS && qs > 1e-12) { const d = Math.min(qs, pairColl(Math.exp(0.09 * (T - T0)), RHOS, IPAR.n0g, n0s, SPG, lG, SPS, lS, rho) / rho * dt); qs -= d; qg += d; }   // graupel collects snow
          if (qi > 1e-12) {                                 // snow and graupel collect cloud ice
            if (hasS) { const d = qi * (1 - Math.exp(-collSmall(Math.exp(0.025 * (T - T0)), n0s, VSa, VSb, GS.coll, rho, lS) * dt)); qi -= d; qs += d; }
            if (hasG) { const d = qi * (1 - Math.exp(-collSmall(0.1, IPAR.n0g, VGa, VGb, GG.coll, rho, lG) * dt)); qi -= d; qg += d; }
            const d = Math.min(qi, Math.max(0, 1e-3 * Math.exp(0.025 * (T - T0)) * dt * (qi - 5e-4))); qi -= d; qs += d;                                // ice becomes snow above 0.5 g/kg
          }
          { const d = Math.min(qs, Math.max(0, 1e-3 * Math.exp(0.09 * (T - T0)) * dt * (qs - 6e-4))); qs -= d; qg += d; }                               // heavy snow becomes graupel
        }
        {                                                   // cloud water into rain: Kessler's autoconversion and accretion
          const fn = 1 / (1 + KS.c3 * dt * Math.pow(qr, KS.c4)), d = Math.min(qc, qc * (1 - fn) + fn * KS.c1 * dt * Math.max(qc - KS.c2, 0)); qc -= d; qr += d;
        }
        if (T < T0) {                                       // ice nucleation and the growth of ice, snow and graupel by deposition (sublimation in dry air)
          const e = esi(T), qsi = KS.EP2 * e / (p - e), gI = 1 + LS * LS / (CP * RVAP * T * T) * qsi * p / (p - e);
          let excess = (qv - qsi) / gI;
          if (excess > 0 && T < 268.15) { const qn = Math.min(excess, Math.max(0, Math.min(5 * Math.exp(0.304 * (T0 - T)), 5e5) * 1e-12 / rho - qi)); qi += qn; qv -= qn; T += lsK * qn; excess -= qn; }
          const sm1 = qv / qsi - 1;
          if (sm1 !== 0 && (qi + qs + qg > 1e-12)) {
            const G1 = 1 / ((LS / (RVAP * T) - 1) * LS / (ka * T) + RVAP * T / (dv * e));
            let Ri = 0, Rs = 0, Rg = 0;
            if (qi > 1e-12) { const ni = 5.38e7 * Math.pow(rho * qi, 0.75), di = Math.cbrt(6 * rho * qi / ni / (Math.PI * 500)); Ri = 2 * Math.PI * ni * di * G1 * sm1 / rho; }
            if (qs > 1e-12) { if (!lS) { n0s = n0sOf(T); lS = lamOf(n0s, RHOS, rho, qs); } Rs = 2 * Math.PI * n0s * G1 * sm1 / rho * ventI(VSa, VSb, GS.vent, lS, rho, nu, sc); }
            if (qg > 1e-12) { if (!lG) lG = lamOf(IPAR.n0g, IPAR.rhog, rho, qg); Rg = 2 * Math.PI * IPAR.n0g * G1 * sm1 / rho * ventI(VGa, VGb, GG.vent, lG, rho, nu, sc); }
            const R = Ri + Rs + Rg;
            if (sm1 > 0 && R > 0) { const dep = Math.min(R * dt, Math.max(0, (qv - qsi) / gI)); qi += dep * Ri / R; qs += dep * Rs / R; qg += dep * Rg / R; qv -= dep; T += lsK * dep; }
            else if (sm1 < 0 && R < 0) {
              const sub = Math.min(-R * dt, (qsi - qv) / gI), di = Math.min(qi, sub * Ri / R), dss = Math.min(qs, sub * Rs / R), dg = Math.min(qg, sub * Rg / R), tot = di + dss + dg;
              qi -= di; qs -= dss; qg -= dg; qv += tot; T -= lsK * tot;
            }
          }
        }
        {                                                   // saturation adjustment of cloud water (this is where the Bergeron process takes the water: ice has dried the air below water saturation)
          const e = esw(T), qvs = KS.EP2 * e / (p - e), prod = (qv - qvs) / (1 + p / (p - e) * qvs * F5 / ((T - KS.SVP3) * (T - KS.SVP3))), pr = Math.max(prod, -qc);
          qc += pr; qv -= pr; T += lvK * pr;
        }
        if (qr > 1e-12) {                                   // rain evaporates in subsaturated air (Kessler's ventilation formula)
          const e = esw(T), qvs = KS.EP2 * e / (p - e), rcgs = 0.001 * rho, gW = 1 + p / (p - e) * qvs * F5 / ((T - KS.SVP3) * (T - KS.SVP3));
          const ern = Math.min(dt * (((1.6 + 124.9 * Math.pow(rcgs * qr, 0.2046)) * Math.pow(rcgs * qr, 0.525)) / (2.55e8 / (p * qvs) + 5.4e5)) * (Math.max(qvs - qv, 0) / (rcgs * qvs)), qr, Math.max(0, (qvs - qv) / gW));
          qr -= ern; qv += ern; T -= lvK * ern;
        }
        const th1 = T / pii;
        S.th[o] = th1 - thc[k]; S.qv[o] = qv - qvbc[k]; S.qc[o] = qc; S.qr[o] = qr; S.qi[o] = qi; S.qs[o] = qs; S.qg[o] = qg;
        S.pi[o] += Cc[k] * rho * (th1 * (1 + RV1 * qv) - th0 * (1 + RV1 * qv0));              // the expansion by the heat released
      }
    }

    const core = { nx, ny, nz, dx, dy, dz, N, S, idx, zc, zw, cmax, dtauMax, time: 0, precip, precipS, precipG, stat, moist, ice,
                   base: { thc, thvc, thvw, Mc, Mw, Cc, dthc, rhoc, qvbc, pibc, ubc, vbc, piBar } };
    core.fill = () => { fillAll(S); };
    core.micro = (dt) => { fillAll(S); (ice ? microIce : micro)(dt); fillAll(S); };           // the microphysics alone (for tests and diagnostics)
    // The reflectivity-weighted fall speed of each precipitating species, m/s downward: what a Doppler radar adds to the vertical wind (it sees the power-weighted mean motion of the particles, and the power
    // of Rayleigh scatterers goes as D^6). Over the exponential distribution N0 exp(-lambda D) with the fall speed a sqrt(rho0/rho) D^b it is a sqrt(rho0/rho) Gamma(7 + b) / Gamma(7) / lambda^b,
    // faster than the mass-weighted speed that sediments the water (the large drops carry the echo). q is the mixing ratio (kg/kg), k the level, o the cell (snow's N0 follows its temperature).
    const vZ = (a, b, rho, l) => a * Math.sqrt(RHO0 / rho) * gammaF(7 + b) / 720 / Math.pow(l, b);
    core.zFall = {
      rain: (q, k) => q < 1e-12 ? 0 : vZ(VRa, VRb, rhoc[k], lamOf(N0R, RHOW, rhoc[k], q)),
      snow: (q, k, o) => q < 1e-12 ? 0 : vZ(VSa, VSb, rhoc[k], lamOf(n0sOf(temp(o, k)), RHOS, rhoc[k], q)),
      graupel: (q, k) => q < 1e-12 ? 0 : vZ(VGa, VGb, rhoc[k], lamOf(IPAR.n0g, IPAR.rhog, rhoc[k], q)) };
    core.step = function (dt) {
      for (const n of names) S0[n].set(S[n]);
      for (const f of [1 / 3, 0.5, 1]) {
        const ds = f * dt;
        slow(S, ds);
        acoustic(ds);
        for (const n of scalarNames) {
          const a = S[n], b = S0[n], r = R[n];
          for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const q = idx(i, j, k); a[q] = b[q] + ds * r[q]; }
        }
      }
      if (moist) (ice ? microIce : micro)(dt);
      fillAll(S);
      core.time += dt;
    };
    core.diag = function () {
      let wmax = -Infinity, wmin = Infinity, thmin = Infinity, thmax = -Infinity, umax = 0, pimax = 0, qcmax = 0, qrmax = 0, thvmin = Infinity, qimax = 0, qsmax = 0, qgmax = 0;
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const o = idx(i, j, k);
        wmax = Math.max(wmax, S.w[o]); wmin = Math.min(wmin, S.w[o]); thmin = Math.min(thmin, S.th[o]); thmax = Math.max(thmax, S.th[o]);
        umax = Math.max(umax, Math.abs(S.u[o])); pimax = Math.max(pimax, Math.abs(S.pi[o]));
        if (moist) { qcmax = Math.max(qcmax, S.qc[o]); qrmax = Math.max(qrmax, S.qr[o]); if (k === 0) thvmin = Math.min(thvmin, (thc[0] + S.th[o]) * (1 + RV1 * (qvbc[0] + S.qv[o]) - S.qc[o] - S.qr[o] - S.qi[o] - S.qs[o] - S.qg[o]) - thvc[0]); if (ice) { qimax = Math.max(qimax, S.qi[o]); qsmax = Math.max(qsmax, S.qs[o]); qgmax = Math.max(qgmax, S.qg[o]); } }
      }
      return { wmax, wmin, thmin, thmax, umax, pimax, qcmax, qrmax, qimax, qsmax, qgmax, thvmin, time: core.time };
    };
    return core;
  }

  globalThis.HFSevereCore = { create, consts: { G, CP, RD, P0, CV, GAMMA, RV1, KS }, gammaF };
})();
