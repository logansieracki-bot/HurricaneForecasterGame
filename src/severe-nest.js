/* Severe: a one-way nest of two cores (docs/severe-plan.md 6.7 and 6.8).
 *
 * A fine core (the child) lies inside a coarse one (the parent), both made by HFSevereCore.create from the same sounding, the child with bc { x: 'driven', y: 'driven' }. The nest steps them
 * together: the parent takes a step, the values it has at the points round the child's sides (and the three cells of halo beyond them) are interpolated to the child's grid at the start and
 * at the end of that step (trilinear in space, with the staggering of every field: u on the x faces, v on the y faces, w on the z faces, the rest at the cell centres), and the child takes
 * `ratio` smaller steps with the targets blended in time between the two; the child's relaxation zone (core.relaxWidth cells) pulls it to the same targets. Nothing goes back to the parent:
 * the parent is the same with or without a child.
 *
 * The child's frame may move over the parent's with a constant velocity `frame` (m/s): the child follows a storm that drifts through the parent, its winds are the parent's minus `frame`, and
 * its south-west corner is at (x0 + frame.u t, y0 + frame.v t) of the parent's plane (metres, the origin of the parent's grid), t the seconds since the nest was made: (x0, y0) is where the corner is
 * when `create` is called, whatever the parent's clock says. The child's base-state wind (its `wind` option) and its drag
 * frame have to be given for that frame by the caller: wind(z) - frame, and the parent's frame over the ground + frame.
 *
 *   const nest = HFSevereNest.create({ parent, child, ratio, x0, y0, frame: { u, v } });
 *   nest.init();            // the child's state from the parent's
 *   nest.step(dt);          // the parent by dt, the child by ratio steps of dt / ratio
 *
 * A classic script that sets `globalThis.HFSevereNest`; it needs nothing but the two cores.
 */
(function () {
  'use strict';

  function create(opt) {
    const P = opt.parent, C = opt.child, ratio = opt.ratio || 1, fr = Object.assign({ u: 0, v: 0 }, opt.frame || {}), H = P.halo;
    if (!C.target) throw new Error('severe-nest: the child must have driven sides (bc x and y: "driven")');
    if (C.halo !== H) throw new Error('severe-nest: the halos differ');
    if (P.nz * P.dz !== C.nz * C.dz) throw new Error('severe-nest: parent and child must have the same depth');
    const names = C.names, pn = new Set(P.names);
    for (const n of names) if (!pn.has(n)) throw new Error('severe-nest: the parent has no field ' + n);
    const nx = C.nx, ny = C.ny, nz = C.nz, RW = C.relaxWidth, T = C.target;
    const nest = { parent: P, child: C, ratio, x0: opt.x0, y0: opt.y0, frame: fr, time: P.time }, T0 = P.time;       // T0: the parent's clock when the corner is (x0, y0)

    /* where a field lives in a cell (ox, oy, oz in cells: 0.5 at a centre, 0 on a face) */
    const KIND = { u: [0, 0.5, 0.5], v: [0.5, 0, 0.5], w: [0.5, 0.5, 0], c: [0.5, 0.5, 0.5] };
    const kindOf = (n) => (n === 'u' || n === 'v' || n === 'w' ? n : 'c');

    /* the points whose target the child reads: the cells within `RW` of a driven side, the halo cells beyond it, all the levels with their halos */
    const zi = [], zj = [], zk = [];
    for (let k = -H; k < nz + H; k++) for (let j = -H; j < ny + H; j++) for (let i = -H; i < nx + H; i++)
      if (i < RW || i >= nx - RW || j < RW || j >= ny - RW) { zi.push(i); zj.push(j); zk.push(k); }
    const M = zi.length, Zi = Int16Array.from(zi), Zj = Int16Array.from(zj), Zk = Int16Array.from(zk), Zx = new Int32Array(M);
    for (let m = 0; m < M; m++) Zx[m] = C.idx(Zi[m], Zj[m], Zk[m]);
    const B0 = {}, B1 = {}; for (const n of names) { B0[n] = new Float64Array(M); B1[n] = new Float64Array(M); }

    /* the parent's array n at the point (xp, yp, zp) of its plane (metres), trilinear; the indices are kept inside the parent's halo */
    const pnx = P.nx, pny = P.ny, pnz = P.nz, psx = 1, psy = P.idx(0, 1, 0) - P.idx(0, 0, 0), psz = P.idx(0, 0, 1) - P.idx(0, 0, 0);
    const clampI = (v, n) => Math.max(-H, Math.min(n + H - 2, v));
    function trilinear(a, ox, oy, oz, xp, yp, zp) {
      const fi = xp / P.dx - ox, fj = P.ny > 1 ? yp / P.dy - oy : 0, fk = zp / P.dz - oz;
      let i0 = Math.floor(fi), j0 = Math.floor(fj), k0 = Math.floor(fk);
      const wx = fi - i0, wy = fj - j0, wz = fk - k0;
      i0 = clampI(i0, pnx); k0 = clampI(k0, pnz); if (P.ny > 1) j0 = clampI(j0, pny);
      const o = P.idx(i0, P.ny > 1 ? j0 : 0, k0), dy = P.ny > 1 ? psy : 0, wy1 = P.ny > 1 ? wy : 0;
      const c00 = a[o] * (1 - wx) + a[o + psx] * wx, c10 = a[o + dy] * (1 - wx) + a[o + dy + psx] * wx;
      const c01 = a[o + psz] * (1 - wx) + a[o + psz + psx] * wx, c11 = a[o + dy + psz] * (1 - wx) + a[o + dy + psz + psx] * wx;
      return (c00 * (1 - wy1) + c10 * wy1) * (1 - wz) + (c01 * (1 - wy1) + c11 * wy1) * wz;
    }
    /* the child's point (i, j, k) of a kind, in the parent's plane at time t */
    const posX = (i, ox, t) => nest.x0 + fr.u * (t - T0) + (i + ox) * C.dx, posY = (j, oy, t) => nest.y0 + fr.v * (t - T0) + (j + oy) * C.dy, posZ = (k, oz) => (k + oz) * C.dz;

    function sample(B, t) {                       // targets at the ring of points, from the parent's state as it is now, for the parent's time t
      for (const n of names) {
        const kd = KIND[kindOf(n)], a = P.S[n], b = B[n], off = n === 'u' ? fr.u : n === 'v' ? fr.v : 0;
        for (let m = 0; m < M; m++) b[m] = trilinear(a, kd[0], kd[1], kd[2], posX(Zi[m], kd[0], t), posY(Zj[m], kd[1], t), posZ(Zk[m], kd[2])) - off;
      }
    }
    function blend(f) { for (const n of names) { const t = T[n], a = B0[n], b = B1[n]; for (let m = 0; m < M; m++) t[Zx[m]] = a[m] + f * (b[m] - a[m]); } }

    /* the child's state from the parent's, over the whole child grid (cells, and the faces up to the last), at the parent's time now */
    nest.init = function () {
      const t = P.time; nest.time = t;
      for (const n of names) {
        const kd = KIND[kindOf(n)], a = P.S[n], b = C.S[n], off = n === 'u' ? fr.u : n === 'v' ? fr.v : 0;
        const ni = n === 'u' ? nx + 1 : nx, nj = n === 'v' && ny > 1 ? ny + 1 : ny, nk = n === 'w' ? nz + 1 : nz;
        for (let k = 0; k < nk; k++) for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++)
          b[C.idx(i, j, k)] = trilinear(a, kd[0], kd[1], kd[2], posX(i, kd[0], t), posY(j, kd[1], t), posZ(k, kd[2])) - off;
      }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { C.S.w[C.idx(i, j, 0)] = 0; C.S.w[C.idx(i, j, nz)] = 0; }
      sample(B0, t); blend(0); C.fill();
      C.time = t;
    };

    /* the parent by dt, the child by `ratio` steps of dt / ratio, with the targets blended between the parent's state at the start and at the end */
    nest.step = function (dt) {
      const t0 = P.time;
      if (!nest.started) { sample(B0, t0); nest.started = true; }
      P.step(dt); sample(B1, P.time);
      for (let m = 1; m <= ratio; m++) { blend(m / ratio); C.step(dt / ratio); }
      for (const n of names) { const s = B0[n]; B0[n] = B1[n]; B1[n] = s; }
      nest.time = P.time;
    };
    nest.points = M;
    return nest;
  }

  globalThis.HFSevereNest = { create };
})();
