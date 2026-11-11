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
    const KH = (o.visc && o.visc.kh) || 0, KV = (o.visc && o.visc.kv) || 0, F = o.f || 0, moist = !!o.moist;
    if (F && ny === 1) throw new Error('severe-core: Coriolis needs a 3-D grid (ny > 1)');
    const tracerNames = o.tracers || [], wnames = moist ? ['qv', 'qc', 'qr'] : [];       // qv is the PERTURBATION of the vapour about its base state
    const names = ['u', 'v', 'w', 'th', 'pi'].concat(wnames, tracerNames), scalarNames = ['th'].concat(wnames, tracerNames);
    const S = {}, S0 = {}, R = {};
    for (const n of names) { S[n] = new Float64Array(N); S0[n] = new Float64Array(N); R[n] = new Float64Array(N); }
    const THV = moist ? new Float64Array(N) : null;     // theta_v' of the stage state (the live theta' in a dry run)

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
        THV[o] = (thc[k] + X.th[o]) * (1 + RV1 * (qvbc[k] + X.qv[o]) - X.qc[o] - X.qr[o]) - thvc[k];
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

    const core = { nx, ny, nz, dx, dy, dz, N, S, idx, zc, zw, cmax, dtauMax, time: 0, precip, stat, moist,
                   base: { thc, thvc, thvw, Mc, Mw, Cc, dthc, rhoc, qvbc, pibc, ubc, vbc, piBar } };
    core.fill = () => { fillAll(S); };
    core.micro = (dt) => { fillAll(S); micro(dt); fillAll(S); };           // the microphysics alone (for tests and diagnostics)
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
      if (moist) micro(dt);
      fillAll(S);
      core.time += dt;
    };
    core.diag = function () {
      let wmax = -Infinity, wmin = Infinity, thmin = Infinity, thmax = -Infinity, umax = 0, pimax = 0, qcmax = 0, qrmax = 0, thvmin = Infinity;
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const o = idx(i, j, k);
        wmax = Math.max(wmax, S.w[o]); wmin = Math.min(wmin, S.w[o]); thmin = Math.min(thmin, S.th[o]); thmax = Math.max(thmax, S.th[o]);
        umax = Math.max(umax, Math.abs(S.u[o])); pimax = Math.max(pimax, Math.abs(S.pi[o]));
        if (moist) { qcmax = Math.max(qcmax, S.qc[o]); qrmax = Math.max(qrmax, S.qr[o]); if (k === 0) thvmin = Math.min(thvmin, (thc[0] + S.th[o]) * (1 + RV1 * (qvbc[0] + S.qv[o]) - S.qc[o] - S.qr[o]) - thvc[0]); }
      }
      return { wmax, wmin, thmin, thmax, umax, pimax, qcmax, qrmax, thvmin, time: core.time };
    };
    return core;
  }

  globalThis.HFSevereCore = { create, consts: { G, CP, RD, P0, CV, GAMMA, RV1, KS } };
})();
