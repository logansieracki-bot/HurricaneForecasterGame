// Node-only tests of what a finer storm needs of the core (docs/severe-plan.md 6.8): a nest, with its sides driven by a parent (src/severe-nest.js, the driven sides and the relaxation
// zone of src/severe-core.js), the drag of the ground on the lowest level, and the saving and restoring of a state.
//   - the nest: a state at rest stays at rest, a uniform wind passes through, the parent's fields reach the child's grid with the right staggering (a field that is linear in each
//     direction is exact on u, v, w and the centres), a child whose frame moves over the parent sees the parent's field move by exactly that, a tracer carried across the child's
//     sides agrees with the parent's, and a warm thermal that rises in the parent rises in the child as it does in the parent;
//   - the driven side and its relaxation: the outermost cells are the target and the taper reaches the inside, whatever the child does;
//   - the drag: a uniform wind over the ground slows at the rate of cd U^2 / dz, in the frame in which the ground moves, and only on the lowest level;
//   - a state saved and restored runs on bit for bit.
import '../src/severe-core.js';
import '../src/severe-nest.js';

const C = globalThis.HFSevereCore, N = globalThis.HFSevereNest;
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); } }
const t0 = Date.now();
const maxAbs = (a) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i])); return m; };

/* a parent of 20 x 20 x 10 cells of 1 km (a 20 km box 10 km deep) and a child of 20 x 20 x 20 cells of 500 m inside it, from (5, 5) km; a dry neutral atmosphere */
const PAR = { nx: 20, ny: 20, nz: 10, dx: 1000, dy: 1000, dz: 1000 };
const CHD = { nx: 20, ny: 20, nz: 20, dx: 500, dy: 500, dz: 500 };
const pair = (extra = {}, childExtra = {}, popt = {}) => {
  const parent = C.create(Object.assign({}, PAR, { bc: { x: 'wall', y: 'wall' } }, extra, popt));
  const child = C.create(Object.assign({}, CHD, { bc: { x: 'driven', y: 'driven' } }, extra, childExtra));
  return { parent, child };
};

/* 1. At rest nothing moves, in the parent or the child. */
{
  const { parent, child } = pair();
  const nest = N.create({ parent, child, ratio: 2, x0: 5000, y0: 5000 }); nest.init();
  for (let m = 0; m < 10; m++) nest.step(6);
  const d = child.diag(), p = parent.diag();
  check('a nest at rest stays at rest (child |u| ' + d.umax + ', |w| ' + Math.max(d.wmax, -d.wmin) + ', |pi\'| ' + d.pimax + '; parent ' + p.umax + ')', Math.max(d.umax, d.wmax, -d.wmin, d.pimax, p.umax, p.pimax) < 1e-13 && nest.points > 10000);
}

/* 2. A uniform wind goes through the child as it goes through the parent: nothing is made at the sides. */
{
  const wind = { u: () => 10, v: () => 4 };
  const { parent, child } = pair({ wind }, {}, { bc: { x: 'periodic', y: 'periodic' } });
  for (const [c, nz] of [[parent, PAR.nz], [child, CHD.nz]]) { c.S.u.fill(10); c.S.v.fill(4); }
  const nest = N.create({ parent, child, ratio: 2, x0: 5000, y0: 5000 }); nest.init();
  for (let m = 0; m < 20; m++) nest.step(6);
  let eu = 0, ev = 0, ew = 0;
  for (let k = 0; k < CHD.nz; k++) for (let j = 0; j < CHD.ny; j++) for (let i = 0; i < CHD.nx; i++) { const o = child.idx(i, j, k); eu = Math.max(eu, Math.abs(child.S.u[o] - 10)); ev = Math.max(ev, Math.abs(child.S.v[o] - 4)); ew = Math.max(ew, Math.abs(child.S.w[o])); }
  check('a uniform wind of 10 and 4 m/s goes through the nest unchanged (child errors ' + eu.toExponential(1) + ', ' + ev.toExponential(1) + ' m/s; w ' + ew.toExponential(1) + ')', eu < 1e-9 && ev < 1e-9 && ew < 1e-9);
}

/* 3. The staggering: parent fields that are linear in x, y and z, each as a function of the position it lives at, arrive on the child's grid exactly (u on its x faces, v on its y faces, w on its
      z faces, the tracer at its centres): a half cell wrong anywhere would show. The child's frame moves at (3, -2) m/s over the parent's, and the child's winds are the parent's minus that. */
{
  const { parent, child } = pair({ tracers: ['q'] }, { tracers: ['q'] });
  const lin = (x, y, z) => 1 + 0.001 * x + 0.002 * y + 0.0005 * z;
  const dx = PAR.dx, dz = PAR.dz;
  for (let k = -3; k < PAR.nz + 3; k++) for (let j = -3; j < PAR.ny + 3; j++) for (let i = -3; i < PAR.nx + 3; i++) {
    const o = parent.idx(i, j, k);
    parent.S.u[o] = lin(i * dx, (j + 0.5) * dx, (k + 0.5) * dz); parent.S.v[o] = lin((i + 0.5) * dx, j * dx, (k + 0.5) * dz) + 1; parent.S.w[o] = lin((i + 0.5) * dx, (j + 0.5) * dx, k * dz) + 2;
    parent.S.q[o] = lin((i + 0.5) * dx, (j + 0.5) * dx, (k + 0.5) * dz) + 3; parent.S.th[o] = lin((i + 0.5) * dx, (j + 0.5) * dx, (k + 0.5) * dz) + 4;
  }
  const nest = N.create({ parent, child, ratio: 2, x0: 5200, y0: 4700, frame: { u: 3, v: -2 } }); nest.init();
  const cdx = CHD.dx, cdz = CHD.dz, X0 = 5200, Y0 = 4700;
  const err = { u: 0, v: 0, w: 0, q: 0, th: 0 };
  for (let k = 1; k < CHD.nz; k++) for (let j = 0; j < CHD.ny; j++) for (let i = 0; i <= CHD.nx; i++) {            // u on its faces
    const o = child.idx(i, j, k); err.u = Math.max(err.u, Math.abs(child.S.u[o] - (lin(X0 + i * cdx, Y0 + (j + 0.5) * cdx, (k + 0.5) * cdz) - 3)));
  }
  for (let k = 1; k < CHD.nz; k++) for (let j = 0; j <= CHD.ny; j++) for (let i = 0; i < CHD.nx; i++) { const o = child.idx(i, j, k); err.v = Math.max(err.v, Math.abs(child.S.v[o] - (lin(X0 + (i + 0.5) * cdx, Y0 + j * cdx, (k + 0.5) * cdz) + 1 + 2))); }
  for (let k = 1; k < CHD.nz; k++) for (let j = 0; j < CHD.ny; j++) for (let i = 0; i < CHD.nx; i++) {
    const o = child.idx(i, j, k);
    err.w = Math.max(err.w, Math.abs(child.S.w[o] - (lin(X0 + (i + 0.5) * cdx, Y0 + (j + 0.5) * cdx, k * cdz) + 2)));
    err.q = Math.max(err.q, Math.abs(child.S.q[o] - (lin(X0 + (i + 0.5) * cdx, Y0 + (j + 0.5) * cdx, (k + 0.5) * cdz) + 3)));
    err.th = Math.max(err.th, Math.abs(child.S.th[o] - (lin(X0 + (i + 0.5) * cdx, Y0 + (j + 0.5) * cdx, (k + 0.5) * cdz) + 4)));
  }
  check('the parent\'s fields, linear in space, arrive on the child\'s grid exactly with every staggering (errors u ' + err.u.toExponential(1) + ', v ' + err.v.toExponential(1) + ', w ' + err.w.toExponential(1) + ', centres ' + Math.max(err.q, err.th).toExponential(1) + '), and the child\'s winds are the parent\'s less its frame',
    Math.max(err.u, err.v, err.w, err.q, err.th) < 1e-9);
  /* the targets at the child's sides, the halo and the faces at the sides, are the same linear fields: read them back from the target arrays */
  const T = child.target; let et = 0;
  for (const [i, j, k] of [[-1, 4, 3], [-3, 10, 7], [CHD.nx + 2, 5, 9], [5, -2, 2], [8, CHD.ny + 1, 12], [0, 6, 6], [CHD.nx - 1, 3, 4]]) {
    const o = child.idx(i, j, k); et = Math.max(et, Math.abs(T.q[o] - (lin(X0 + (i + 0.5) * cdx, Y0 + (j + 0.5) * cdx, (k + 0.5) * cdz) + 3)), Math.abs(T.u[o] - (lin(X0 + i * cdx, Y0 + (j + 0.5) * cdx, (k + 0.5) * cdz) - 3)));
  }
  check('the target arrays at the sides, in the halo and at the corners of the child hold the same fields (error ' + et.toExponential(1) + ')', et < 1e-9);
}

/* 4. A child whose frame moves over the parent's: the parent is at rest with a tracer that is linear in x and y, the child's frame moves at (3, -2) m/s, so the child has a wind of (-3, +2) in it and the
      tracer is carried through it: after 204 s the child's tracer is the parent's linear field at the places the child's cells have moved to (the fifth-order scheme is exact on a line). */
{
  const { parent, child } = pair({ tracers: ['q'] }, { tracers: ['q'], wind: { u: () => -3, v: () => 2 } });
  const lin = (x, y) => 2 + 0.0004 * x + 0.0003 * y, dx = PAR.dx;
  for (let k = -3; k < PAR.nz + 3; k++) for (let j = -3; j < PAR.ny + 3; j++) for (let i = -3; i < PAR.nx + 3; i++) parent.S.q[parent.idx(i, j, k)] = lin((i + 0.5) * dx, (j + 0.5) * dx);
  const nest = N.create({ parent, child, ratio: 2, x0: 5000, y0: 5000, frame: { u: 3, v: -2 } }); nest.init();
  for (let m = 0; m < 34; m++) nest.step(6);                                                                // 204 s
  const t = 204; let e = 0, windU = 0, windV = 0;
  for (let k = 0; k < CHD.nz; k++) for (let j = 0; j < CHD.ny; j++) for (let i = 0; i < CHD.nx; i++) {
    const o = child.idx(i, j, k); e = Math.max(e, Math.abs(child.S.q[o] - lin(5000 + 3 * t + (i + 0.5) * CHD.dx, 5000 - 2 * t + (j + 0.5) * CHD.dy))); windU = Math.max(windU, Math.abs(child.S.u[o] + 3)); windV = Math.max(windV, Math.abs(child.S.v[o] - 2));
  }
  check('a child whose frame moves at (3, -2) m/s over a parent at rest sees the parent\'s tracer move by exactly that (error ' + e.toExponential(1) + ', the side values being those of the end of each step, of a field that changes by ' + (0.0004 * 3 * t + 0.0003 * 2 * t).toFixed(2) + '; winds ' + windU.toExponential(1) + ' and ' + windV.toExponential(1) + ' from (-3, 2) m/s)', e < 1e-5 && windU < 1e-9 && windV < 1e-9);
}

/* 4b. The corner is where it is said to be when the nest is made, whatever the parent's clock says: the same set-up as 4, from a parent whose clock stands at 7000 s (a restart), gives the same
       child, bit for bit, and its corner has moved by the frame's velocity over the time since the nest was made, not since the clock's zero. */
{
  const run = (clock) => {
    const { parent, child } = pair({ tracers: ['q'] }, { tracers: ['q'], wind: { u: () => -3, v: () => 2 } });
    const lin = (x, y) => 2 + 0.0004 * x + 0.0003 * y;
    for (let k = -3; k < PAR.nz + 3; k++) for (let j = -3; j < PAR.ny + 3; j++) for (let i = -3; i < PAR.nx + 3; i++) parent.S.q[parent.idx(i, j, k)] = lin((i + 0.5) * PAR.dx, (j + 0.5) * PAR.dx);
    parent.time = clock;
    const nest = N.create({ parent, child, ratio: 2, x0: 5000, y0: 5000, frame: { u: 3, v: -2 } }); nest.init();
    for (let m = 0; m < 34; m++) nest.step(6);
    return { child, lin };
  };
  const a = run(0), b = run(7000); let diff = 0, e = 0;
  for (let k = 0; k < CHD.nz; k++) for (let j = 0; j < CHD.ny; j++) for (let i = 0; i < CHD.nx; i++) {
    const o = a.child.idx(i, j, k); diff = Math.max(diff, Math.abs(a.child.S.q[o] - b.child.S.q[o]), Math.abs(a.child.S.u[o] - b.child.S.u[o]), Math.abs(a.child.S.w[o] - b.child.S.w[o]));
    e = Math.max(e, Math.abs(b.child.S.q[o] - b.lin(5000 + 3 * 204 + (i + 0.5) * CHD.dx, 5000 - 2 * 204 + (j + 0.5) * CHD.dy)));
  }
  check('a nest made when the parent\'s clock stands at 7000 s is the nest made at 0: the same child bit for bit (' + diff.toExponential(1) + '), its tracer at the places 204 s of the frame\'s motion from x0 (error ' + e.toExponential(1) + ')', diff === 0 && e < 1e-5 && b.child.time === 7204);
}

/* 5. A tracer blob carried across the child's sides by a wind of 10 m/s (the parent periodic, the blob 4 parent cells wide and periodic itself, so that the parent has it right): the child's tracer is the exact
      solution where the blob has come in through the west side. */
{
  const wind = { u: () => 10, v: () => 0 };
  const { parent, child } = pair({ wind, tracers: ['q'] }, {}, { bc: { x: 'periodic', y: 'periodic' } });
  for (const c of [parent, child]) c.S.u.fill(10);
  const one = (x, y) => Math.exp(-((x - 1500) ** 2 + (y - 5000) ** 2) / (2 * 4000 * 4000));
  const blob = (x, y) => { let a = 0; for (let n = -1; n <= 1; n++) for (let m = -1; m <= 1; m++) a += one(x + 20000 * n, y + 20000 * m); return a; };          // (the periodic blob: no step at the seam of the box)
  for (let k = 0; k < PAR.nz; k++) for (let j = 0; j < PAR.ny; j++) for (let i = 0; i < PAR.nx; i++) parent.S.q[parent.idx(i, j, k)] = blob((i + 0.5) * PAR.dx, (j + 0.5) * PAR.dy);
  parent.fill();
  const nest = N.create({ parent, child, ratio: 2, x0: 5000, y0: 0 }); nest.init();                       // (the child is 10 km across from x = 5 km; the blob's centre goes from 1.5 km to 6.3 km)
  for (let m = 0; m < 80; m++) nest.step(6);                                                              // 480 s
  let num = 0, den = 0, cmax = 0;
  for (let k = 0; k < CHD.nz; k++) for (let j = 0; j < CHD.ny; j++) for (let i = 0; i < CHD.nx; i++) {
    const x = 5000 + (i + 0.5) * CHD.dx, y = (j + 0.5) * CHD.dy, exact = blob(x - 10 * 480, y), c = child.S.q[child.idx(i, j, k)];
    num += (c - exact) * (c - exact); den += exact * exact; cmax = Math.max(cmax, c);
  }
  check('a tracer blob carried into the child by the wind is the blob that the exact solution has there (relative error ' + (Math.sqrt(num / den) * 100).toFixed(2) + ' %, its peak ' + cmax.toFixed(3) + ' of 1)', Math.sqrt(num / den) < 0.02 && cmax > 0.9);
}

/* 6. A thermal rises in the child as it does in a run at the child's resolution everywhere: a 2 K bubble in a neutral atmosphere, the parent at 1 km (24 x 24 x 10 cells), the child at 500 m
      (32 x 32 x 20) from (4, 4) km, and a reference core of 500 m over the whole 24 km. The child starts from the bubble itself, as the reference does. After 180 s the child's updraft is the
      reference's to a small fraction of the error the parent's own field (interpolated) has against it. */
{
  const PARb = { nx: 24, ny: 24, nz: 10, dx: 1000, dy: 1000, dz: 1000 }, CHDb = { nx: 32, ny: 32, nz: 20, dx: 500, dy: 500, dz: 500 };
  const parent = C.create(Object.assign({}, PARb, { bc: { x: 'wall', y: 'wall' } })), child = C.create(Object.assign({}, CHDb, { bc: { x: 'driven', y: 'driven' } }));
  const ref = C.create({ nx: 48, ny: 48, nz: 20, dx: 500, dy: 500, dz: 500, bc: { x: 'wall', y: 'wall' } });
  const bub = (x, y, z) => { const r2 = ((x - 12000) / 3000) ** 2 + ((y - 12000) / 3000) ** 2 + ((z - 2000) / 1500) ** 2; return r2 < 1 ? 2 * Math.pow(Math.cos(0.5 * Math.PI * Math.sqrt(r2)), 2) : 0; };
  for (let k = 0; k < PARb.nz; k++) for (let j = 0; j < PARb.ny; j++) for (let i = 0; i < PARb.nx; i++) parent.S.th[parent.idx(i, j, k)] = bub((i + 0.5) * 1000, (j + 0.5) * 1000, (k + 0.5) * 1000);
  for (let k = 0; k < 20; k++) for (let j = 0; j < 48; j++) for (let i = 0; i < 48; i++) ref.S.th[ref.idx(i, j, k)] = bub((i + 0.5) * 500, (j + 0.5) * 500, (k + 0.5) * 500);
  parent.fill(); ref.fill();
  const nest = N.create({ parent, child, ratio: 2, x0: 4000, y0: 4000 }); nest.init();
  for (let k = 0; k < 20; k++) for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) child.S.th[child.idx(i, j, k)] = bub(4000 + (i + 0.5) * 500, 4000 + (j + 0.5) * 500, (k + 0.5) * 500);
  child.fill();
  for (let m = 0; m < 30; m++) nest.step(6);                                                            // 180 s
  for (let m = 0; m < 60; m++) ref.step(3);
  let eC = 0, eP = 0, mx = 0, n = 0, wc = 0, wr = 0;
  const lerp = (a, b, t) => a * (1 - t) + b * t, pw = (i, j, k) => parent.S.w[parent.idx(i, j, k)];
  for (let k = 2; k < 16; k++) for (let j = 10; j < 22; j++) for (let i = 10; i < 22; i++) {               // the child's cells clear of its relaxation zone
    const r = 0.5 * (ref.S.w[ref.idx(i + 8, j + 8, k)] + ref.S.w[ref.idx(i + 8, j + 8, k + 1)]), c = 0.5 * (child.S.w[child.idx(i, j, k)] + child.S.w[child.idx(i, j, k + 1)]);
    const fi = (4000 + (i + 0.5) * 500) / 1000 - 0.5, fj = (4000 + (j + 0.5) * 500) / 1000 - 0.5, fk = ((k + 0.5) * 500) / 1000, i0 = Math.floor(fi), j0 = Math.floor(fj), k0 = Math.floor(fk), wx = fi - i0, wy = fj - j0, wz = fk - k0;
    const p = lerp(lerp(lerp(pw(i0, j0, k0), pw(i0 + 1, j0, k0), wx), lerp(pw(i0, j0 + 1, k0), pw(i0 + 1, j0 + 1, k0), wx), wy), lerp(lerp(pw(i0, j0, k0 + 1), pw(i0 + 1, j0, k0 + 1), wx), lerp(pw(i0, j0 + 1, k0 + 1), pw(i0 + 1, j0 + 1, k0 + 1), wx), wy), wz);
    eC += (c - r) ** 2; eP += (p - r) ** 2; mx = Math.max(mx, Math.abs(r)); n++; wc = Math.max(wc, c); wr = Math.max(wr, r);
  }
  const rc = Math.sqrt(eC / n), rp = Math.sqrt(eP / n);
  check('a thermal in the child is the thermal of a run at its resolution everywhere (rms difference of the updraft ' + rc.toFixed(4) + ' m/s against the parent\'s ' + rp.toFixed(3) + ', peak ' + wc.toFixed(2) + ' against ' + wr.toFixed(2) + ' m/s)', rc < 0.02 * mx && rc < 0.1 * rp && wr > 3);
}

/* 7. A driven side and its relaxation: a child alone, its targets set by hand (a wind of 5 m/s and a warm 1 K), the interior at rest to begin with. After one step the outer cells have been pulled
      to the target by the weight cos^2(pi d / 2 W) of their distance d from the edge (1 at the edge, 0.5 at W / 2, 0 at W), on the west and on the east side and on the faces of u, and the
      middle of the box is not touched; a target of zero leaves a state at rest alone. */
{
  const W = 6, nx = 24, child = C.create(Object.assign({}, CHD, { nx, ny: nx, bc: { x: 'driven', y: 'driven' }, relax: { width: W } }));
  child.target.u.fill(5); child.target.v.fill(5); child.target.th.fill(1);
  child.fill(); child.step(0.5);
  const o = (i, j, k) => child.idx(i, j, k), mid = 12, a = (d) => Math.pow(Math.cos(0.5 * Math.PI * d / W), 2);
  let eth = 0, eu = 0; const rows = [];
  for (let d = 0; d < W; d++) {
    eth = Math.max(eth, Math.abs(child.S.th[o(d, mid, 8)] - a(d)), Math.abs(child.S.th[o(nx - 1 - d, mid, 8)] - a(d)), Math.abs(child.S.th[o(mid, d, 8)] - a(d)), Math.abs(child.S.th[o(mid, nx - 1 - d, 8)] - a(d)));
    eu = Math.max(eu, Math.abs(child.S.u[o(d, mid, 8)] - 5 * a(d)), Math.abs(child.S.u[o(nx - d, mid, 8)] - 5 * a(d)), Math.abs(child.S.v[o(mid, d, 8)] - 5 * a(d)), Math.abs(child.S.v[o(mid, nx - d, 8)] - 5 * a(d)));
    rows.push(child.S.th[o(d, mid, 8)].toFixed(3));
  }
  check('after one step the outer cells of a driven side are pulled to the target by cos^2 of their distance (th at 0 to 5 cells: ' + rows.join(', ') + '; the largest departure from the formula is ' + eth.toExponential(1) + ' on the four sides and ' + eu.toExponential(1) + ' m/s on the u and v faces on all four, a default width of ' + C.create(Object.assign({}, CHD, { bc: { x: 'driven', y: 'driven' } })).relaxWidth + '), and the middle is not touched (' + Math.abs(child.S.th[o(mid, mid, 8)]).toExponential(0) + ')',
    eth < 2e-3 && eu < 1e-2 && Math.abs(child.S.th[o(mid, mid, 8)]) < 1e-3 && Math.abs(child.S.u[o(nx, mid, 8)] - 5) < 1e-9 && Math.abs(child.S.v[o(mid, nx, 8)] - 5) < 1e-9 && C.create(Object.assign({}, CHD, { bc: { x: 'driven', y: 'driven' } })).relaxWidth === 6);
}

/* 7b. The halo and the faces at the edge of a driven side are the target, index for index, on all four sides, for the centres and for every staggering (a pattern that never repeats near a side
       is put in the target arrays; the interior is not touched by a fill). */
{
  const child = C.create(Object.assign({}, CHD, { nx: 12, ny: 10, bc: { x: 'driven', y: 'driven' }, tracers: ['q'], moist: true, ice: true }));
  const T = child.target; child.names.forEach((n, q) => { for (let m = 0; m < child.N; m++) T[n][m] = 1000 * (q + 1) + (m % 977) + 0.5; });
  child.fill();
  let bad = 0, count = 0; const at = (n, i, j, k) => { count++; if (child.S[n][child.idx(i, j, k)] !== T[n][child.idx(i, j, k)]) bad++; };
  for (const n of child.names) for (let k = n === 'w' ? 1 : 0; k < child.nz; k++) {                          // (the ground face of w is zero everywhere, a wall)
    const fx = n === 'u', fy = n === 'v';
    for (let j = 0; j < child.ny; j++) { for (const i of [-1, -2, -3, child.nx, child.nx + 1, child.nx + 2]) at(n, i, j, k); if (fx) at(n, 0, j, k); }
    for (let i = 0; i < child.nx; i++) { for (const j of [-1, -2, -3, child.ny, child.ny + 1, child.ny + 2]) at(n, i, j, k); if (fy) at(n, i, 0, k); }
  }
  let touched = 0; for (const n of child.names) if (child.S[n][child.idx(5, 5, 5)] !== 0) touched++;
  check('the halo of a driven side and its edge faces are the target index for index, on the west, east, south and north, for the centres and for u and v (' + count + ' places, ' + bad + ' wrong), and the interior is left alone (' + touched + ' of ' + child.names.length + ' fields changed there)', bad === 0 && touched === 0 && count > 1000);
}

/* 8. The drag: a uniform wind over the ground slows on the lowest level as dU/dt = -cd U^2 / dz, which integrates to U0 / (1 + cd U0 t / dz); the model's frame is the one in which the ground
      moves (frame u = 10: the model's wind is 0 and the ground wind is 10), the levels above are not touched, and no drag is no change. */
{
  const dz = 100, cd = 0.003, mk = (drag) => C.create({ nx: 8, ny: 8, nz: 8, dx: 500, dy: 500, dz, bc: { x: 'periodic', y: 'periodic' }, drag });
  const a = mk({ cd, frame: { u: 10, v: 0 } }), b = mk(null), d = mk({ cd, frame: { u: 0, v: 0 } });
  for (let m = 0; m < 600; m++) { a.step(1); b.step(1); }
  const T = 600, u1 = 10 / (1 + cd * 10 * T / dz) - 10, uA = a.S.u[a.idx(3, 3, 0)], uB = a.S.u[a.idx(3, 3, 1)];
  check('over the ground a uniform wind of 10 m/s slows at cd U^2 / dz (after 600 s: ' + (uA + 10).toFixed(4) + ' m/s against ' + (u1 + 10).toFixed(4) + ' by the formula; the next level up ' + uB.toExponential(1) + ' from 0), and with no drag nothing moves',
    Math.abs(uA - u1) < 2e-3 && Math.abs(uB) < 1e-12 && maxAbs(b.S.u) === 0 && !!a.drag && Math.abs(a.drag.cd - cd) < 1e-12);
  /* the drag of the wind over the ground also acts on v (the speed is that of both components), and the default cd is the log law's: (0.4 / ln(z1 / z0))^2 */
  const e = C.create({ nx: 8, ny: 8, nz: 8, dx: 500, dy: 500, dz, bc: { x: 'periodic', y: 'periodic' }, drag: { z0: 0.1, frame: { u: 6, v: 8 } } });
  for (let m = 0; m < 60; m++) e.step(1);
  const ue = e.S.u[e.idx(3, 3, 0)], ve = e.S.v[e.idx(3, 3, 0)], cdlog = Math.pow(0.4 / Math.log(50 / 0.1), 2);
  check('the drag takes its speed from both components (6 and 8 m/s: the wind turns not at all, u/v ' + ((ue + 6) / (ve + 8)).toFixed(4) + ' against 0.75, and slows by ' + (10 - Math.hypot(ue + 6, ve + 8)).toFixed(4) + ') and its default cd is the log law\'s ' + cdlog.toFixed(5),
    Math.abs((ue + 6) / (ve + 8) - 0.75) < 1e-6 && Math.abs(e.drag.cd - cdlog) < 1e-12 && Math.hypot(ue + 6, ve + 8) < 10 && Math.hypot(ue + 6, ve + 8) > 9.5);
}

/* 9. A state saved and restored runs on bit for bit: a small moist storm with ice, ten steps, saved, ten more, and the same ten more from the copy. */
{
  const mk = () => C.create({ nx: 12, ny: 12, nz: 20, dx: 2000, dy: 2000, dz: 500, moist: true, ice: true, theta: (z) => 300 + 8 * Math.min(z, 12000) / 12000 + 20 * Math.max(0, z - 12000) / 8000, qv: (z) => 0.012 * Math.exp(-z / 3000), wind: { u: (z) => 8 * Math.min(z, 6000) / 6000, v: () => 0 }, bc: { x: 'periodic', y: 'periodic' } });
  const a = mk(); for (let k = 0; k < 4; k++) for (let j = 4; j < 8; j++) for (let i = 4; i < 8; i++) a.S.th[a.idx(i, j, k)] = 2;
  for (const n of a.names) a.S[n][a.idx(5, 6, 7)] += 1e-4 * (a.names.indexOf(n) + 1);                          // (a distinct value in every field, the waters too)
  a.precip[5] = 3.25; a.precipS[3] = 1.5; a.precipG[9] = 0.75;                                        // (nothing has reached the ground yet: some rain on the ground to keep)
  a.fill(); for (let m = 0; m < 10; m++) a.step(5);
  const saved = a.getState(); const copied = a.names.every((n) => saved.f[n].every((v, q) => v === a.S[n][q]));
  for (let m = 0; m < 10; m++) a.step(5);
  const b = mk(); b.setState(saved); const restored = b.names.every((n) => saved.f[n].every((v, q) => v === b.S[n][q])); for (let m = 0; m < 10; m++) b.step(5);
  let same = true; for (const n of a.names) for (let i = 0; i < a.N; i++) if (a.S[n][i] !== b.S[n][i]) { same = false; break; }
  check('a state saved and restored runs on bit for bit (time ' + a.time + ' and ' + b.time + ', ' + a.names.length + ' fields, ' + (saved.f.u.length * a.names.length * 8 / 1e3).toFixed(0) + ' kB; a state of another grid is refused)',
    same && copied && restored && a.time === b.time && b.precip[5] === 3.25 && b.precipS[3] === 1.5 && b.precipG[9] === 0.75 && a.precip.every((v, q) => v === b.precip[q]) && (() => { try { mk().setState(Object.assign({}, saved, { nx: 13 })); return false; } catch (e) { return true; } })());
}

/* 10. What a nest is not: a child with walls, a child as deep as another, a child that wants a field the parent has not, and a side that is none of the three kinds are refused. */
{
  const thrown = (f) => { try { f(); return false; } catch (e) { return true; } };
  const walls = C.create(Object.assign({}, CHD)), parent = C.create(Object.assign({}, PAR)), deep = C.create(Object.assign({}, CHD, { nz: 10, bc: { x: 'driven', y: 'driven' } })), withQ = C.create(Object.assign({}, CHD, { tracers: ['q'], bc: { x: 'driven', y: 'driven' } }));
  check('a nest of a child with walls, of a child of another depth, of a field the parent does not have, and a boundary of a kind that does not exist are all refused (and walls have no target arrays)',
    thrown(() => N.create({ parent, child: walls, ratio: 2, x0: 5000, y0: 5000 })) && thrown(() => N.create({ parent, child: deep, ratio: 2, x0: 5000, y0: 5000 })) && thrown(() => N.create({ parent, child: withQ, ratio: 2, x0: 5000, y0: 5000 }))
    && thrown(() => C.create(Object.assign({}, PAR, { bc: { x: 'open', y: 'wall' } }))) && walls.target === null && !!C.create(Object.assign({}, CHD, { bc: { x: 'driven', y: 'driven' } })).target);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
process.exit(failed ? 1 : 0);
