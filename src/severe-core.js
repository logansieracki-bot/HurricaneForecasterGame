/*  Severe: the real core.
 *
 *  A fully compressible, non-hydrostatic cloud-model dynamical core in double precision. It is the reference that the WebGPU port of the Severe discipline is
 *  tested against (docs/severe-plan.md, section 6.1), so it favours being simple and checkable over being fast.
 *
 *  Equations (Klemp & Wilhelmson 1978), in perturbations about a hydrostatic base state theta_bar(z), pi_bar(z): the winds u, v, w, the potential temperature
 *  theta' and the Exner function pi' (pi = (p/p0)^(R/cp)):
 *     du/dt     = -u.grad(u) - cp theta d(pi')/dx + f v + D(u)
 *     dv/dt     = -u.grad(v) - cp theta d(pi')/dy - f u + D(v)
 *     dw/dt     = -u.grad(w) - cp theta d(pi')/dz + g theta'/theta_bar + D(w)
 *     dtheta'/dt = -u.grad(theta') - w d(theta_bar)/dz + D(theta')
 *     dpi'/dt   = -u.grad(pi') - c_bar^2 / (cp rho_bar theta_bar^2) div(rho_bar theta_bar u)
 *  where theta = theta_bar + theta'. The last equation is the exact pressure equation of dry air: the base-state advection w d(pi_bar)/dz is inside the
 *  density-weighted divergence. Nothing of the base state's own pressure gradient is ever computed, so a base state at rest stays at rest exactly.
 *
 *  Space: an Arakawa C grid (u on the x faces, v on the y faces, w on the z faces, everything else at cell centres), uniform spacing, a halo of three cells.
 *  Advection is the 5th-order upwind-biased flux form of Wicker & Skamarock (2002), written as the flux differences minus the field times the divergence of the
 *  advecting flow, so that a constant field is never changed whatever the flow does. Time: their RK3, each stage integrating the fast acoustic terms (the
 *  pressure gradient and the divergence) with forward-backward small steps while the slow tendencies stay fixed.
 *
 *  Boundaries, per direction: 'wall' (free slip, nothing through, zero gradient of everything else) or 'periodic'; z is always a wall (ground and lid).
 *  A 2-D slice is a grid with ny = 1 (no y terms, no halo in y).
 *
 *  Pure JavaScript, no DOM. A classic script that sets `globalThis.HFSevereCore`.
 */
(function () {
  'use strict';
  const G = 9.81, CP = 1005.7, RD = 287.04, P0 = 1e5, CV = CP - RD, GAMMA = CP / CV, H = 3;

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
    const KH = (o.visc && o.visc.kh) || 0, KV = (o.visc && o.visc.kv) || 0, F = o.f || 0;
    if (F && ny === 1) throw new Error('severe-core: Coriolis needs a 3-D grid (ny > 1)');
    const tracerNames = o.tracers || [], names = ['u', 'v', 'w', 'th', 'pi'].concat(tracerNames);
    const S = {}, S0 = {}, R = {};
    for (const n of names) { S[n] = new Float64Array(N); S0[n] = new Float64Array(N); R[n] = new Float64Array(N); }

    /* ---- the base state: theta_bar(z) is given, pi_bar follows from hydrostatic balance (Simpson on a fine grid), then rho_bar and the sound speed ---- */
    const theta = o.theta || (() => 300), dthetaDz = (z) => (theta(z + 1) - theta(z - 1)) / 2;
    function piBar(z) {
      const n = Math.max(2, Math.ceil(z / 5)) * 2, h = z / n;
      let s = 1 / theta(0) + 1 / theta(z);
      for (let m = 1; m < n; m++) s += (m % 2 ? 4 : 2) / theta(m * h);
      return 1 - (G / CP) * s * h / 3;
    }
    const zc = new Float64Array(nz), zw = new Float64Array(nz + 1), thc = new Float64Array(nz), thw = new Float64Array(nz + 1), dthc = new Float64Array(nz);
    const Mc = new Float64Array(nz), Mw = new Float64Array(nz + 1), Cc = new Float64Array(nz);       // rho_bar theta_bar at centres and w levels; c^2/(cp rho theta^2) at centres
    let cmax = 0;
    for (let k = 0; k <= nz; k++) {
      zw[k] = k * dz; thw[k] = theta(zw[k]);
      const pw = piBar(zw[k]); Mw[k] = P0 * Math.pow(pw, CV / RD) / RD;                           // rho theta = p0 pi^(cv/R) / R
    }
    for (let k = 0; k < nz; k++) {
      zc[k] = (k + 0.5) * dz; thc[k] = theta(zc[k]); dthc[k] = dthetaDz(zc[k]);
      const pc = piBar(zc[k]), rho = P0 * Math.pow(pc, CV / RD) / (RD * thc[k]), c2 = GAMMA * RD * thc[k] * pc;
      Mc[k] = rho * thc[k]; Cc[k] = c2 / (CP * rho * thc[k] * thc[k]); cmax = Math.max(cmax, Math.sqrt(c2));
    }
    /* the largest small step of the forward-backward scheme: c dtau sqrt(1/dx^2 + 1/dy^2 + 1/dz^2) <= 1, with a margin */
    const dtauMax = (o.dtauFactor || 0.8) / (cmax * Math.sqrt(1 / (dx * dx) + (ny > 1 ? 1 / (dy * dy) : 0) + 1 / (dz * dz)));

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

    /* ---- the slow tendencies of a stage state X (advection, diffusion, buoyancy, the base-state gradient of theta, Coriolis) ---- */
    function slow(X) {
      fillAll(X);
      advect(R.u, X.u, 1, X.u, X.v, X.w); addDiff(R.u, X.u);
      if (ny > 1) { advect(R.v, X.v, 2, X.u, X.v, X.w); addDiff(R.v, X.v); }
      advect(R.w, X.w, 3, X.u, X.v, X.w); addDiff(R.w, X.w);
      advect(R.th, X.th, 0, X.u, X.v, X.w); addDiff(R.th, X.th);
      advect(R.pi, X.pi, 0, X.u, X.v, X.w);
      for (const n of tracerNames) { advect(R[n], X[n], 0, X.u, X.v, X.w); addDiff(R[n], X[n]); }
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const o = idx(i, j, k);
        if (k >= 1) R.w[o] += G * 0.5 * (X.th[o - sz] + X.th[o]) / thw[k];
        R.th[o] -= 0.5 * (X.w[o] + X.w[o + sz]) * dthc[k];
        if (F) {
          R.u[o] += F * 0.25 * (X.v[o - 1] + X.v[o] + X.v[o - 1 + sy] + X.v[o + sy]);
          R.v[o] -= F * 0.25 * (X.u[o] + X.u[o + 1] + X.u[o - sy] + X.u[o + 1 - sy]);
        }
      }
    }

    /* ---- the fast terms: forward-backward small steps from the state at the start of the step, the slow tendencies R held fixed, theta frozen at the stage state ---- */
    const DD = o.divdamp === undefined ? 0.1 : o.divdamp, PS = new Float64Array(N), PP = new Float64Array(N);   // divergence damping: the pressure gradient uses pi' extrapolated forward by DD of its last change
    function acoustic(ds) {
      const ns = Math.max(1, Math.ceil(ds / dtauMax - 1e-9)), dt = ds / ns;
      for (const n of ['u', 'v', 'w', 'pi']) S[n].set(S0[n]);
      PP.set(S.pi);
      for (let m = 0; m < ns; m++) {
        fillC(S.pi);
        for (let n = 0; n < N; n++) { PS[n] = S.pi[n] + DD * (S.pi[n] - PP[n]); PP[n] = S.pi[n]; }
        for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const o = idx(i, j, k), th = S.th;
          S.u[o] += dt * (R.u[o] - CP * (thc[k] + 0.5 * (th[o - 1] + th[o])) * (PS[o] - PS[o - 1]) / dx);
          if (ny > 1) S.v[o] += dt * (R.v[o] - CP * (thc[k] + 0.5 * (th[o - sy] + th[o])) * (PS[o] - PS[o - sy]) / dy);
          if (k >= 1) S.w[o] += dt * (R.w[o] - CP * (thw[k] + 0.5 * (th[o - sz] + th[o])) * (PS[o] - PS[o - sz]) / dz);
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

    const core = { nx, ny, nz, dx, dy, dz, N, S, idx, zc, zw, cmax, dtauMax, time: 0, base: { thc, thw, Mc, Mw, Cc, dthc, piBar } };
    core.fill = () => { fillAll(S); };
    core.step = function (dt) {
      for (const n of names) S0[n].set(S[n]);
      for (const f of [1 / 3, 0.5, 1]) {
        const ds = f * dt;
        slow(S);
        acoustic(ds);
        for (const n of ['th'].concat(tracerNames)) {
          const a = S[n], b = S0[n], r = R[n];
          for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const q = idx(i, j, k); a[q] = b[q] + ds * r[q]; }
        }
      }
      fillAll(S);
      core.time += dt;
    };
    core.diag = function () {
      let wmax = -Infinity, wmin = Infinity, thmin = Infinity, thmax = -Infinity, umax = 0, pimax = 0;
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const o = idx(i, j, k);
        wmax = Math.max(wmax, S.w[o]); wmin = Math.min(wmin, S.w[o]); thmin = Math.min(thmin, S.th[o]); thmax = Math.max(thmax, S.th[o]);
        umax = Math.max(umax, Math.abs(S.u[o])); pimax = Math.max(pimax, Math.abs(S.pi[o]));
      }
      return { wmax, wmin, thmin, thmax, umax, pimax, time: core.time };
    };
    return core;
  }

  globalThis.HFSevereCore = { create, consts: { G, CP, RD, P0, CV, GAMMA } };
})();
