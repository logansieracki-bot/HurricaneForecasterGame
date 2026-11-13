/* Severe: the Lab (docs/severe-plan.md section 8): one storm in the environment of a drawing at a spot, run by the real core (src/severe-core.js) on a box that moves with the storm, and its frames recorded in the
 * form the radar page plays (src/severe-pack.js). The environment is horizontally uniform (the sounding of the drawing at the spot: the Lab with nothing else drawn is the benchmark's set-up) and a warm bubble starts the storm.
 *
 *   HFSevereLab.envOf(a)                       // an environment (HFSevereSounding.fromProfile) from arrays: a = { z, theta, qv, u, v, p0, motion }: z even from 0 (m), theta (K), qv (kg/kg), the winds in the ground's frame (m/s)
 *   HFSevereLab.run(spec, hooks)               // async: runs, calls hooks.frame(rec) for every recorded frame, hooks.progress(rec) at every step of the clock, hooks.yield() now and then (an await that lets a worker hear a cancel;
 *                                              // hooks.cancelled() true stops it); resolves { frames, header, wall, steps }
 *      spec: { env: a (see envOf), dx 2000, box 84000 (m), nz 40, dz 500, dt 10, minutes 90, frameEvery 5 (minutes), bubble 3 (K), evap 1, ... }
 *      frame rec: { i, t (minutes), block (Uint8Array: the five arrays of a pack's frame), track: [x, y, w], wmax, zmax, thvmin, drift: [east, north] }
 *      header: what a pack's header has but the scenario (its place on the ground is the page's to say): { v: 1, nx, ny, nz, dx, dz, floor, times, motion, base, track, drift, scale, lab: { evap, bubble, dt, minutes, follow } }
 *      follow (spec, true): the box keeps its storm in the middle. The box is periodic with nothing at its sides that knows where they are (no sponge, one sounding everywhere), so after each recorded frame the whole state is moved by whole cells to put the
 *      centre of the echo back in the middle (`centring`, `roll`), and the header's `drift` says, for each frame, how far the box's corner is from where the uniform motion would have it (HFSeverePack's corner adds it): the storm leaves no edge to be cut by.
 *      Without it a storm that moves a little differently from Bunkers' estimate (the dryline day's by 13 m/s northward) is out of a box of 84 km in an hour, and the sponge that stood at its sides made bars of echo as straight as the grid.
 *   HFSevereLab.roll(core, sx, sy)             // the state of a periodic core moved by whole cells (east, north)
 *   HFSevereLab.centring(block, nx, ny, nz, dz) // { sx, sy }: the cells that put the echo of a frame's block in the middle of the box, or null
 *   HFSevereLab.bubble(x, y, z, xc, yc, delt)  // the +3 K cosine-squared bubble of Weisman and Klemp
 *   HFSevereLab.recorder(core)                 // a function that records the core's state as a pack frame's block
 *
 * The winds the storm sees are in the frame that moves with it (Bunkers' right mover, the sounding's own `motion`), so that it stays in the box; the radar on the ground adds the box's motion back. Pure JavaScript, no DOM; the same file runs in
 * the page's Worker and in Node (the tests). A classic script that sets `globalThis.HFSevereLab`; it needs HFSevereCore, HFSevereSounding and HFSevereRefl.
 */
(function () {
  'use strict';
  const C = globalThis.HFSevereCore, SND = globalThis.HFSevereSounding, RF = globalThis.HFSevereRefl;
  if (!C || !SND || !RF) return;

  const lin = (z, a) => (zz) => {
    const n = z.length; if (zz <= z[0]) return a[0]; if (zz >= z[n - 1]) return a[n - 1];
    const dz = z[1] - z[0], f = (zz - z[0]) / dz, i = Math.min(n - 2, Math.floor(f)); return a[i] + (a[i + 1] - a[i]) * (f - i);
  };
  function envOf(a) {
    const z = Float64Array.from(a.z);
    return SND.fromProfile({ z, theta: Float64Array.from(a.theta), qv: Float64Array.from(a.qv), uG: lin(z, a.u), vG: lin(z, a.v), p0: a.p0 || 1000, motion: a.motion });
  }
  function bubble(x, y, z, xc, yc, delt) {
    const r = Math.sqrt(((x - xc) / 10000) ** 2 + ((y - yc) / 10000) ** 2 + ((z - 1500) / 1500) ** 2);
    return r < 1 ? (delt === undefined ? 3 : delt) * Math.cos(0.5 * Math.PI * r) ** 2 : 0;
  }

  /* a frame of a pack from the state: reflectivity (Int8 dBZ, -30 for none), the fall speed (Uint8, 0.25 m/s), and the winds at the cell centres in 0.5 m/s steps (Int8), each nz*ny*nx in the order level, y, x */
  function recorder(core) {
    const nx = core.nx, ny = core.ny, nz = core.nz, per = nx * ny * nz, S = core.S, idx = core.idx, sy = idx(0, 1, 0) - idx(0, 0, 0), sz = idx(0, 0, 1) - idx(0, 0, 0);
    const col = new Float64Array(nz), vzc = new Float64Array(nz), dbzColumn = RF.create(core).column, c8 = (v) => Math.max(-127, Math.min(127, Math.round(v / 0.5)));
    return function record() {
      const block = new Uint8Array(5 * per), dbz = new Int8Array(block.buffer, 0, per), vz = new Uint8Array(block.buffer, per, per), uu = new Int8Array(block.buffer, 2 * per, per), vv = new Int8Array(block.buffer, 3 * per, per), ww = new Int8Array(block.buffer, 4 * per, per);
      let zmax = -30;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        dbzColumn(i, j, col, vzc);
        for (let k = 0; k < nz; k++) {
          const o = idx(i, j, k), at = (k * ny + j) * nx + i; if (col[k] > zmax) zmax = col[k];
          dbz[at] = Math.max(-30, Math.min(120, Math.round(col[k]))); vz[at] = col[k] > -29 ? Math.max(0, Math.min(255, Math.round(4 * vzc[k]))) : 0;
          uu[at] = c8(0.5 * (S.u[o] + S.u[o + 1])); vv[at] = c8(0.5 * (S.v[o] + S.v[o + sy])); ww[at] = c8(0.5 * (S.w[o] + S.w[o + sz]));
        }
      }
      return { block, zmax: Math.round(zmax) };
    };
  }

  const mod = (a, n) => ((a % n) + n) % n;

  /* the whole state of a periodic box moved by (sx, sy) whole cells, east and north: what was in cell i is in cell i + sx. A box with no sponge at its sides and one sounding everywhere does not care where its storm is, so the model goes on
     as if the storm had been there (tests/severe_lab.mjs holds it to that to rounding) */
  function roll(core, sx, sy) {
    if (!sx && !sy) return;
    const nx = core.nx, ny = core.ny, nz = core.nz, idx = core.idx;
    for (const name of core.names) {
      const A = core.S[name], B = A.slice(), kmax = name === 'w' ? nz : nz - 1;
      for (let k = 0; k <= kmax; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) A[idx(i, j, k)] = B[idx(mod(i - sx, nx), mod(j - sy, ny), k)];
    }
    for (const P of [core.precip, core.precipS, core.precipG]) { const B = P.slice(); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) P[j * nx + i] = B[mod(j - sy, ny) * nx + mod(i - sx, nx)]; }
    core.fill();
  }

  /* where the echo of a frame is, as the whole cells that would put it in the middle of the box: the centre of the power (10^(dBZ/10)) of the cells of 30 dBZ or more in the levels from 500 m to 3.5 km, as a mean of angles round the box's
     circle so that a storm cut by an edge counts as one; null if there is no storm yet (under 3 such cells) or the echo is not one lump (two storms half a box apart: the length of the mean vector, 1 for a point, is under 0.3) */
  function centring(block, nx, ny, nz, dz) {
    const dbz = new Int8Array(block.buffer, block.byteOffset, nx * ny * nz), k0 = Math.max(0, Math.floor(500 / dz)), k1 = Math.min(nz - 1, Math.floor(3500 / dz));
    let n = 0, W = 0, cx = 0, sx = 0, cy = 0, sy = 0;
    for (let k = k0; k <= k1; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const d = dbz[(k * ny + j) * nx + i]; if (d < 30) continue;
      const w = Math.pow(10, d / 10), a = 2 * Math.PI * (i + 0.5) / nx, b = 2 * Math.PI * (j + 0.5) / ny; n++; W += w; cx += w * Math.cos(a); sx += w * Math.sin(a); cy += w * Math.cos(b); sy += w * Math.sin(b);
    }
    if (n < 3 || !(W > 0) || Math.hypot(cx, sx) / W < 0.3 || Math.hypot(cy, sy) / W < 0.3) return null;
    const px = Math.atan2(sx, cx) / (2 * Math.PI) * nx, py = Math.atan2(sy, cy) / (2 * Math.PI) * ny;                    // the echo's place in cells (the middle of cell i is i + 0.5), the box's middle is nx / 2
    const wrap = (v, m) => { const r = mod(Math.round(v), m); return r > m / 2 ? r - m : r; };
    return { sx: wrap(nx / 2 - px, nx), sy: wrap(ny / 2 - py, ny) };
  }

  async function run(spec, hooks) {
    hooks = hooks || {};
    const evap = spec.evap === undefined ? 1 : spec.evap, env = envOf(spec.env), dx = spec.dx || 2000, L = spec.box || 84000, nx = Math.round(L / dx), nz = spec.nz || 40, dz = spec.dz || 500, dt = spec.dt || 10, minutes = spec.minutes || 90, every = spec.frameEvery || 5;
    const core = C.create({ nx, ny: nx, nz, dx, dy: dx, dz, moist: true, ice: true, iceParams: { n0g: 4e6, rhog: 400, n0r: 8e6, evap }, theta: env.theta, qv: env.qv, wind: { u: env.u, v: env.v },
      bc: { x: 'periodic', y: 'periodic' }, visc: { kh: 500 * dx / 2000, kv: 500 * dx / 2000 }, damp: { top: { depth: 5000, rate: 0.003 } } });
    const S = core.S, idx = core.idx, b = core.base, xc = L / 2, yc = L / 2, sz = idx(0, 0, 1) - idx(0, 0, 0), k5 = Math.min(nz - 2, Math.floor(5250 / dz));
    for (let k = 0; k < nz; k++) for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) { const o = idx(i, j, k); S.th[o] = bubble((i + 0.5) * dx, (j + 0.5) * dx, (k + 0.5) * dz, xc, yc, spec.bubble); S.u[o] = b.ubc[k]; S.v[o] = b.vbc[k]; }
    core.fill();
    const record = recorder(core), frames = [], t0 = Date.now(), motion = env.motion, nSteps = Math.round(minutes * 60 / dt), follow = spec.follow !== false, cum = [0, 0];
    let nextFrame = 0, yielded = Date.now(), stopped = false, reason = '';
    for (let step = 0; step <= nSteps; step++) {
      const t = step * dt;
      if (t >= nextFrame - 1e-9) {
        nextFrame += every * 60; const d = core.diag(), { block, zmax } = record(); let wm = -1, wx = 0, wy = 0;
        for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) { const o = idx(i, j, k5), w = 0.5 * (S.w[o] + S.w[o + sz]); if (w > wm) { wm = w; wx = (i + 0.5) * dx; wy = (j + 0.5) * dx; } }
        const rec = { i: frames.length, t: t / 60, block, track: [Math.round(wx), Math.round(wy), +wm.toFixed(1)], wmax: +d.wmax.toFixed(1), zmax: Math.round(zmax), thvmin: +d.thvmin.toFixed(2), drift: [cum[0], cum[1]] };
        if (!Number.isFinite(d.wmax) || d.wmax > 150) { stopped = true; reason = 'the model blew up at ' + (t / 60).toFixed(1) + ' min'; break; }
        const c = follow ? centring(block, nx, nx, nz, dz) : null;                                         // (looked at before the hook: a worker hands the block over to the page and it is gone from here)
        frames.push(rec); if (hooks.frame) hooks.frame(rec);
        if (c && (c.sx || c.sy)) { roll(core, c.sx, c.sy); cum[0] -= c.sx * dx; cum[1] -= c.sy * dx; }       // (the storm is back in the middle, the box's corner is where the storm's drift has taken it)
      }
      if (hooks.progress && step % 6 === 0) hooks.progress({ t: t / 60, of: minutes, wall: (Date.now() - t0) / 1000 });
      core.step(dt);
      if (hooks.yield && Date.now() - yielded > 80) { await hooks.yield(); yielded = Date.now(); if (hooks.cancelled && hooks.cancelled()) { stopped = true; reason = 'cancelled'; break; } }
    }
    const header = { v: 1, nx, ny: nx, nz, dx, dz, floor: -30, times: frames.map((f) => f.t), motion: { u: motion.u, v: motion.v }, track: frames.map((f) => f.track), drift: frames.map((f) => f.drift), scale: { wind: 0.5, vz: 0.25 },
      lab: { evap, bubble: spec.bubble === undefined ? 3 : spec.bubble, dt, minutes, follow },                                      // (what the run was set to; the pack reader does not look at it)
      base: { z: Array.from(b.rhoc, (_, k) => (k + 0.5) * dz), u: Array.from(b.ubc, (v) => +(v + motion.u).toFixed(3)), v: Array.from(b.vbc, (v) => +(v + motion.v).toFixed(3)) } };
    return { frames, header, wall: (Date.now() - t0) / 1000, steps: nSteps, stopped, reason };
  }

  globalThis.HFSevereLab = { envOf, run, bubble, recorder, roll, centring };
})();
