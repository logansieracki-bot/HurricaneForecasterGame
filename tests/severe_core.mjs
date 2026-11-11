// Node-only tests of the Severe core (src/severe-core.js, the double-precision reference of the real cloud model): a base state at rest stays at rest, advection
// converges at the order of its scheme and leaves a constant alone, a sound pulse travels at the speed of sound, an internal gravity wave oscillates at its
// theoretical frequency, Coriolis turns a wind at f, a 3-D grid keeps its x-y symmetry, and the Straka et al. (1993) density current (a -15 K cold bubble in a neutral
// atmosphere with a constant viscosity of 75 m2/s) reaches the published front position. SLOW=1 adds the 100 m version of that benchmark (minutes).
import '../src/severe-core.js';

const C = globalThis.HFSevereCore, { G, CP, RD, GAMMA } = C.consts;
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); } }
const f2 = (v, d = 2) => v.toFixed(d);
const t0 = Date.now(), lap = () => ((Date.now() - t0) / 1000).toFixed(1) + ' s';

/* 1. A base state at rest stays at rest: the perturbation form never computes the base state's own pressure gradient, so there is nothing to leave it. */
{
  const core = C.create({ nx: 24, ny: 1, nz: 20, dx: 500, dz: 250, theta: (z) => 300 * Math.exp(1e-4 * z / G), bc: { x: 'periodic' }, visc: { kh: 50, kv: 50 } });
  for (let m = 0; m < 50; m++) core.step(10);
  const d = core.diag();
  check('a stratified base state at rest stays at rest (|w| ' + d.wmax + ', |pi\'| ' + d.pimax + ')', Math.max(Math.abs(d.wmax), Math.abs(d.wmin), d.pimax, d.umax, Math.abs(d.thmin), Math.abs(d.thmax)) < 1e-14);
}

/* 2. A passive tracer carried once round a periodic domain by a uniform wind: the error falls with the grid at (at least) the third order of RK3, and a constant stays constant. */
{
  const run = (nx, dt, withV) => {
    const L = withV ? 50000 : 100000, dx = L / nx, ny = withV ? nx : 1, core = C.create({ nx, ny, nz: 2, dx, dy: dx, dz: 500, bc: { x: 'periodic', y: 'periodic' }, tracers: ['tr', 'one'] });
    const S = core.S, idx = core.idx, U = 10, s0 = [];
    for (let k = -3; k < 5; k++) for (let j = withV ? -3 : 0; j < (withV ? ny + 3 : 1); j++) for (let i = -3; i < nx + 4; i++) { const o = idx(i, j, k); if (withV) S.v[o] = U; else S.u[o] = U; }
    for (let k = 0; k < 2; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const o = idx(i, j, k), c = withV ? (j + 0.5) * dx : (i + 0.5) * dx, d = c - L / 2;
      S.tr[o] = Math.exp(-(d * d) / (2 * 4000 * 4000)); S.one[o] = 1; s0[o] = S.tr[o];
    }
    const steps = Math.round(L / U / dt);
    for (let m = 0; m < steps; m++) core.step(dt);
    let e2 = 0, n2 = 0, oneDev = 0;
    for (let k = 0; k < 2; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const o = idx(i, j, k); e2 += (S.tr[o] - s0[o]) ** 2; n2 += s0[o] ** 2; oneDev = Math.max(oneDev, Math.abs(S.one[o] - 1)); }
    return { err: Math.sqrt(e2 / n2), oneDev };
  };
  const a = run(100, 50, false), b = run(200, 25, false);
  check('a tracer carried once round (1 km: ' + f2(100 * a.err, 3) + ' %, 500 m: ' + f2(100 * b.err, 3) + ' %): the error falls by at least 5 when the grid is halved', a.err / b.err > 5);
  check('a tracer carried once round loses less than 1 % of its shape at 500 m', b.err < 0.01);
  check('a constant tracer stays constant (' + b.oneDev.toExponential(1) + ')', b.oneDev < 1e-12);
  const c = run(50, 50, true);
  check('a tracer carried once round in y (a 3-D grid, 1 km cells): error ' + f2(100 * c.err, 2) + ' % (2-D: ' + f2(100 * a.err, 2) + ' %), a constant stays constant', c.err < 0.02 && c.oneDev < 1e-12);
}

/* 3. A sound pulse: pi' travels at c = sqrt(gamma R T), and splits in two. */
{
  const nx = 200, dx = 500, core = C.create({ nx, ny: 1, nz: 2, dx, dz: 200, bc: { x: 'periodic' } }), S = core.S, idx = core.idx, x0 = 50000;
  for (let k = 0; k < 2; k++) for (let i = 0; i < nx; i++) { const q = ((i + 0.5) * dx - x0) / 3000; S.pi[idx(i, 0, k)] = 1e-6 * Math.exp(-q * q); }
  const T = 60, dt = 5;
  for (let m = 0; m < T / dt; m++) core.step(dt);
  let ip = 0, best = -Infinity;
  for (let i = Math.round(x0 / dx) + 10; i < nx - 20; i++) { const v = S.pi[idx(i, 0, 0)] + S.pi[idx(i, 0, 1)]; if (v > best) { best = v; ip = i; } }
  const ym = S.pi[idx(ip - 1, 0, 0)] + S.pi[idx(ip - 1, 0, 1)], yp = S.pi[idx(ip + 1, 0, 0)] + S.pi[idx(ip + 1, 0, 1)], sh = 0.5 * (ym - yp) / (ym - 2 * best + yp);
  const xp = (ip + sh + 0.5) * dx, c = Math.sqrt(GAMMA * RD * 300 * core.base.piBar(200)), xe = x0 + c * T;
  check('a sound pulse travels at the speed of sound (' + f2(xp - x0, 0) + ' m in 60 s, expected ' + f2(c * T, 0) + ' m at c = ' + f2(c, 1) + ' m/s)', Math.abs(xp - xe) < 0.02 * c * T);
  check('the sound pulse keeps about half its amplitude in each direction (' + f2(best / 2e-6, 3) + ' of 0.5)', best / 2e-6 > 0.45 && best / 2e-6 < 0.55);
}

/* 4. An internal gravity wave in a stable layer oscillates at omega = N k / sqrt(k2 + m2). */
{
  const N2 = 1e-4, nx = 120, nz = 30, dx = 100, dz = 100, L = nx * dx, Hh = nz * dz, kk = 2 * Math.PI / L, mm = Math.PI / Hh;
  const core = C.create({ nx, ny: 1, nz, dx, dz, theta: (z) => 300 * Math.exp(N2 * z / G), bc: { x: 'periodic' } }), S = core.S, idx = core.idx;
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) S.th[idx(i, 0, k)] = 0.1 * Math.sin(kk * (i + 0.5) * dx) * Math.sin(mm * (k + 0.5) * dz);
  const i0 = 29, k0 = 15, dt = 5, ser = [];
  for (let m = 0; m < 700; m++) { core.step(dt); ser.push(S.th[idx(i0, 0, k0)]); }
  const zc = [];
  for (let m = 1; m < ser.length; m++) if (ser[m - 1] * ser[m] < 0) zc.push((m - 1 + ser[m - 1] / (ser[m - 1] - ser[m]) + 1) * dt);
  const per = zc.length >= 3 ? 2 * (zc[zc.length - 1] - zc[0]) / (zc.length - 1) : NaN, om = Math.sqrt(N2) * kk / Math.sqrt(kk * kk + mm * mm), Te = 2 * Math.PI / om;
  check('an internal gravity wave oscillates at N k / sqrt(k2 + m2) (period ' + f2(per, 0) + ' s, expected ' + f2(Te, 0) + ' s)', Math.abs(per - Te) < 0.02 * Te);
}

/* 5. Coriolis turns a uniform wind at the rate f (an inertial oscillation: u = U cos ft, v = -U sin ft), on a 3-D grid. */
{
  const f = 1e-4, core = C.create({ nx: 8, ny: 8, nz: 2, dx: 1000, dy: 1000, dz: 500, bc: { x: 'periodic', y: 'periodic' }, f }), S = core.S, idx = core.idx;
  for (let k = -3; k < 5; k++) for (let j = -3; j < 11; j++) for (let i = -3; i < 11; i++) S.u[idx(i, j, k)] = 10;
  const dt = 300, steps = Math.round(Math.PI / 2 / f / dt);
  for (let m = 0; m < steps; m++) core.step(dt);
  const t = steps * dt, o = idx(3, 3, 0);
  check('Coriolis turns the wind at f (after ' + f2(t / 3600, 2) + ' h: u ' + f2(S.u[o], 3) + ', v ' + f2(S.v[o], 3) + ', expected ' + f2(10 * Math.cos(f * t), 3) + ', ' + f2(-10 * Math.sin(f * t), 3) + ')',
        Math.abs(S.u[o] - 10 * Math.cos(f * t)) < 0.02 && Math.abs(S.v[o] + 10 * Math.sin(f * t)) < 0.02);
}

/* 6. A 3-D warm bubble in a square box keeps the symmetry between x and y (a check of the y terms against the x terms). */
{
  const n = 24, core = C.create({ nx: n, ny: n, nz: 16, dx: 500, dy: 500, dz: 500, theta: () => 300, visc: { kh: 50, kv: 50 } }), S = core.S, idx = core.idx;
  for (let k = 0; k < 16; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const r = Math.hypot(((i + 0.5) - n / 2) * 500, ((j + 0.5) - n / 2) * 500, ((k + 0.5) - 4) * 500) / 2000;
    if (r < 1) S.th[idx(i, j, k)] = 2 * Math.cos(Math.PI * r / 2) ** 2;
  }
  for (let m = 0; m < 60; m++) core.step(3);
  let asym = 0, big = 0;
  for (let k = 0; k < 16; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    asym = Math.max(asym, Math.abs(S.th[idx(i, j, k)] - S.th[idx(j, i, k)]), Math.abs(S.u[idx(i, j, k)] - S.v[idx(j, i, k)]), Math.abs(S.pi[idx(i, j, k)] - S.pi[idx(j, i, k)]));
    big = Math.max(big, Math.abs(S.w[idx(i, j, k)]));
  }
  check('a 3-D bubble in a square box keeps the x-y symmetry (largest difference ' + asym.toExponential(1) + ', w up to ' + f2(big, 2) + ' m/s)', big > 0.5 && asym < 1e-9);
}

/* 7. The Straka et al. (1993) density current: a -15 K cosine bubble (4 km x 2 km, centred at 3 km height) in a neutral atmosphere of 300 K with K = 75 m2/s. Half the
      domain is run (the bubble's symmetry plane is a wall): x from 0 to 25.6 km, z from 0 to 6.4 km. At t = 900 s the published front (the -1 K contour on the ground)
      is at about 15 km and the coldest air is about -9.8 K. */
function straka(dx, dt) {
  const nx = Math.round(25600 / dx), nz = Math.round(6400 / dx);
  const core = C.create({ nx, ny: 1, nz, dx, dz: dx, theta: () => 300, visc: { kh: 75, kv: 75 }, bc: { x: 'wall' } }), S = core.S, idx = core.idx;
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const L = Math.hypot(((i + 0.5) * dx) / 4000, ((k + 0.5) * dx - 3000) / 2000);
    if (L < 1) S.th[idx(i, 0, k)] = -15 * (1 + Math.cos(Math.PI * L)) / 2;
  }
  for (let m = 0; m < Math.round(900 / dt); m++) core.step(dt);
  let front = NaN;
  for (let i = nx - 2; i >= 0; i--) { const a = S.th[idx(i, 0, 0)], b = S.th[idx(i + 1, 0, 0)]; if (a <= -1 && b > -1) { front = ((i + 0.5) + (a + 1) / (a - b)) * dx; break; } }
  const d = core.diag();
  return { front, thmin: d.thmin, wmax: d.wmax, ok: Number.isFinite(d.thmin) && Number.isFinite(d.wmax) };
}
{
  const a = straka(200, 2);
  console.log('     Straka, 200 m: front ' + f2(a.front / 1000, 2) + ' km, coldest ' + f2(a.thmin, 2) + ' K, w up to ' + f2(a.wmax, 1) + ' m/s (' + lap() + ')');
  check('the Straka density current at 200 m is finite, its front is at 14 to 16 km and its coldest air between -11 and -8.5 K', a.ok && a.front > 14000 && a.front < 16000 && a.thmin < -8.5 && a.thmin > -11);
  if (process.env.SLOW) {
    const b = straka(100, 1);
    console.log('     Straka, 100 m: front ' + f2(b.front / 1000, 2) + ' km, coldest ' + f2(b.thmin, 2) + ' K, w up to ' + f2(b.wmax, 1) + ' m/s (' + lap() + ')');
    check('the Straka density current at 100 m has its front at 14.5 to 15.6 km and the two resolutions agree within 0.5 km', b.ok && b.front > 14500 && b.front < 15600 && Math.abs(a.front - b.front) < 500);
  }
}

console.log(`\n${passed} passed, ${failed} failed (${lap()})`);
process.exit(failed ? 1 : 0);
