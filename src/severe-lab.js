/* Severe: the Lab (docs/severe-plan.md section 8): one storm in the environment of a drawing at a spot, run by the real core (src/severe-core.js) on a box that moves with the storm, and its frames recorded in the
 * form the radar page plays (src/severe-pack.js). The environment is horizontally uniform (the sounding of the drawing at the spot: the Lab with nothing else drawn is the benchmark's set-up) and a warm bubble starts the storm.
 *
 *   HFSevereLab.envOf(a)                       // an environment (HFSevereSounding.fromProfile) from arrays: a = { z, theta, qv, u, v, p0, motion }: z even from 0 (m), theta (K), qv (kg/kg), the winds in the ground's frame (m/s)
 *   HFSevereLab.run(spec, hooks)               // async: runs, calls hooks.frame(rec) for every recorded frame, hooks.progress(rec) at every step of the clock, hooks.yield() now and then (an await that lets a worker hear a cancel;
 *                                              // hooks.cancelled() true stops it, a string stops it with that as the reason: the frames so far are the run's); resolves { frames, header, wall, steps, stopped, reason }
 *      spec: { env: a (see envOf), dx 2000, box 84000 (m), nz 40, dz 500, dt 10, minutes 90, frameEvery 5 (minutes), bubble 3 (K), evap 1, twoMoment (false: the rain's drop number is a second variable of the core, see src/severe-core.js), iceParams (other settings of the ice scheme: n0g, rhog, n0r, xrMin, xrMax), seeds (the bubbles that start storms, see below), drag (the ground's drag on the lowest level, the z0 of its log law in m: 0.1 is short grass; 0, the default, for a free-slip floor), detail, ... }
 *      frame rec: { i, t (minutes), block (Uint8Array: the five arrays of a pack's frame, and those of the nest if it has one), track: [x, y, w], wmax, zmax, thvmin, drift: [east, north], nest (true if the block has the nest's arrays), fn (the pack's `fn` of the frame) }
 *      hooks.start(header) is called once before the first frame with the header as it is then (the grid, the scale, the motion, the base state, the nests' grids; `times`, `track`, `drift` and `fn` empty, and growing with the frames):
 *      what a page needs to play the run while it goes (HFSeverePack.live)
 *      header: what a pack's header has but the scenario (its place on the ground is the page's to say): { v: 1, nx, ny, nz, dx, dz, floor, times, motion, base, track, drift, scale, lab: { evap, bubble, dt, minutes, follow, detail } },
 *              and, if the run made a nest, { v: 2, nests, fn } (src/severe-pack.js: HFSeverePack.assemble makes the offsets)
 *      detail (spec, off unless given): { dx 500 (m), box 40000 (m), from 20 (minutes), ztop 8000 (m), every 1 (minute), minUpdraft 10 (m/s) }: a finer core, the nest of src/severe-nest.js, lies in the middle of the box from the first frame at or after `from`
 *              minutes at which the box's updraft is `minUpdraft` or more (a day that grows no storm is not run at 500 m for nothing): cells of `dx` (a whole fraction of the box's) over `box` metres (a whole number of the box's cells, in its middle), driven at its sides by the box's own state, the box unaffected by it. Hooks of a supercell need
 *              cells of 500 m or less and a nest that starts with the storm: one that starts at minute 60 makes none (docs/severe-research.md part 7). Its lowest `ztop` metres go into every frame, in 1 m/s steps of wind (it has
 *              winds past 63.5 m/s), and the frames are `every` minutes apart from then on. It needs `follow` (the box that keeps its storm in the middle keeps the nest's storm in the nest's), and moves with the box (rollNested).
 *              hooks.nest({ child, nest }) is called when it is made (for tests and experiments).
 *      seeds (spec, one bubble in the middle at minute 0): [{ x, y (m from the box's south-west corner), t (minutes), amp (K), rx, ry (m), zc, rz (m) }]: the warm bubbles that start the storms, an initiation zone's way (docs/severe-plan.md 6.4). Those at minute 0 are in the
 *              initial state, the others are added when the clock reaches them (a run with a nest takes none of those); the box is periodic, so a bubble at an edge goes on at the other. The header's `lab.seeds` lists [x, y, t, amp] of each. A box of many storms is run with
 *              `follow: false`: nothing keeps one of them in the middle.
 *      drag (spec, 0): the ground, off unless asked for: a quadratic drag on the lowest level of the box (and of the nest), cd |V| V / dz with V the wind over the ground (the model's plus the storm's motion) and cd = (0.4 / ln(z1 / z0))^2 for the
 *              z0 given (0.1 m is short grass), balanced against the environment's own wind (src/severe-core.js `drag.balance`: only what a storm changes in the wind is slowed). Without it the floor is free-slip, as every run has been; the hook of a
 *              supercell is sharper and curls more with it (docs/severe-research.md part 7). The header's `lab.drag` is the z0 (absent for none).
 *      follow (spec, true): the box keeps its storm in the middle. The box is periodic with nothing at its sides that knows where they are (no sponge, one sounding everywhere), so after each recorded frame the whole state is moved by whole cells to put the
 *      centre of the echo back in the middle (`centring`, `roll`), and the header's `drift` says, for each frame, how far the box's corner is from where the uniform motion would have it (HFSeverePack's corner adds it): the storm leaves no edge to be cut by.
 *      Without it a storm that moves a little differently from Bunkers' estimate (the dryline day's by 13 m/s northward) is out of a box of 84 km in an hour, and the sponge that stood at its sides made bars of echo as straight as the grid.
 *   HFSevereLab.roll(core, sx, sy)             // the state of a periodic core moved by whole cells (east, north)
 *   HFSevereLab.rollNested(core, nest, ratio, sx, sy) // the box moved so, and its nest (or null) with it: ratio times as many cells of the finer core, the cells that came round its edge taken again from the box
 *   HFSevereLab.centring(block, nx, ny, nz, dz) // { sx, sy }: the cells that put the echo of a frame's block in the middle of the box, or null
 *   HFSevereLab.bubble(x, y, z, xc, yc, delt, rx, ry, zc, rz)  // the +3 K cosine-squared bubble of Weisman and Klemp (10 km by 10 km by 1.5 km at 1.5 km; the optional radii and height are a seed's)
 *   HFSevereLab.recorder(core, { wind: 0.5, nz })  // a function that records the core's state as a pack frame's block: record(into, at) writes it into a block of bytes from the byte `at`; the winds in steps of `wind` m/s, the lowest nz levels
 *
 * The winds the storm sees are in the frame that moves with it (Bunkers' right mover, the sounding's own `motion`), so that it stays in the box; the radar on the ground adds the box's motion back. Pure JavaScript, no DOM; the same file runs in
 * the page's Worker and in Node (the tests). A classic script that sets `globalThis.HFSevereLab`; it needs HFSevereCore, HFSevereSounding and HFSevereRefl (and HFSevereNest for a run with `detail`).
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
  function bubble(x, y, z, xc, yc, delt, rx, ry, zc, rz) {                                // (the size of a seed: 10 km by 10 km by 1.5 km at a height of 1.5 km, unless said)
    const r = Math.sqrt(((x - xc) / (rx || 10000)) ** 2 + ((y - yc) / (ry || 10000)) ** 2 + ((z - (zc === undefined ? 1500 : zc)) / (rz || 1500)) ** 2);
    return r < 1 ? (delt === undefined ? 3 : delt) * Math.cos(0.5 * Math.PI * r) ** 2 : 0;
  }

  /* a frame of a pack from the state: reflectivity (Int8 dBZ, -30 for none), the fall speed (Uint8, 0.25 m/s), and the winds at the cell centres in steps of `opt.wind` m/s (Int8, 0.5 unless said), each nz*ny*nx in the order level, y, x;
     `opt.nz`: only the lowest nz levels are kept (the whole depth unless said). `record(into, at)` writes the five arrays into a given block of bytes from the byte `at` (a new block, 5 * nz * ny * nx bytes, if none is given),
     and returns { block, zmax } (the strongest echo of all the levels of the core, kept or not) */
  function recorder(core, opt) {
    opt = opt || {};
    const nx = core.nx, ny = core.ny, nzc = core.nz, nz = Math.min(nzc, opt.nz || nzc), per = nx * ny * nz, S = core.S, idx = core.idx, sy = idx(0, 1, 0) - idx(0, 0, 0), sz = idx(0, 0, 1) - idx(0, 0, 0), step = opt.wind || 0.5;
    const col = new Float64Array(nzc), vzc = new Float64Array(nzc), dbzColumn = RF.create(core).column, c8 = (v) => Math.max(-127, Math.min(127, Math.round(v / step)));
    return function record(into, at) {
      const block = into || new Uint8Array(5 * per), o0 = block.byteOffset + (into ? at || 0 : 0), dbz = new Int8Array(block.buffer, o0, per), vz = new Uint8Array(block.buffer, o0 + per, per), uu = new Int8Array(block.buffer, o0 + 2 * per, per), vv = new Int8Array(block.buffer, o0 + 3 * per, per), ww = new Int8Array(block.buffer, o0 + 4 * per, per);
      let zmax = -30;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        dbzColumn(i, j, col, vzc);
        for (let k = 0; k < nzc; k++) if (col[k] > zmax) zmax = col[k];
        for (let k = 0; k < nz; k++) {
          const o = idx(i, j, k), at = (k * ny + j) * nx + i;
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

  /* the box moved by (sx, sy) whole cells and, if it has a nest, the nest's state with it: the finer core by `ratio` times as many cells, the same distance, and the cells that came round its edge (as many as it was moved by, on each side
     of it) taken again from the box that has been moved */
  function rollNested(core, nest, ratio, sx, sy) {
    roll(core, sx, sy);
    if (nest && (sx || sy)) { roll(nest.child, ratio * sx, ratio * sy); nest.edge(ratio * Math.max(Math.abs(sx), Math.abs(sy))); }
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
    const evap = spec.evap === undefined ? 1 : spec.evap, drag = spec.drag === undefined ? 0 : (+spec.drag || 0), env = envOf(spec.env), dx = spec.dx || 2000, L = spec.box || 84000, nx = Math.round(L / dx), nz = spec.nz || 40, dz = spec.dz || 500, dt = spec.dt || 10, minutes = spec.minutes || 90, every = spec.frameEvery || 5;
    const physics = (n, d) => ({ nx: n, ny: n, nz, dx: d, dy: d, dz, moist: true, ice: true, iceParams: Object.assign({ n0g: 4e6, rhog: 400, n0r: 8e6, evap, twoMoment: !!spec.twoMoment }, spec.iceParams || {}), theta: env.theta, qv: env.qv, wind: { u: env.u, v: env.v },
      visc: { kh: 500 * d / 2000, kv: 500 * d / 2000 }, damp: { top: { depth: 5000, rate: 0.003 } }, drag: drag ? { z0: drag, frame: { u: env.motion.u, v: env.motion.v }, balance: true } : null });
    const core = C.create(Object.assign(physics(nx, dx), { bc: { x: 'periodic', y: 'periodic' } }));
    const S = core.S, idx = core.idx, b = core.base, xc = L / 2, yc = L / 2, sz = idx(0, 0, 1) - idx(0, 0, 0), k5 = Math.min(nz - 2, Math.floor(5250 / dz));
    /* the bubbles that start storms (docs/severe-plan.md 6.4): `spec.seeds` is a list of { x, y (m from the box's south-west corner; the middle of the box), t (minutes; 0), amp (K; spec.bubble, 3), rx, ry (m; 10000), zc, rz (m; 1500) }, and a run
       without it has one, in the middle at minute 0. Those at minute 0 are in the initial state, the others are added to the potential temperature when the clock reaches them; the box is periodic, so a bubble that reaches an edge goes on at the other. */
    const seeds = (spec.seeds || [{}]).map((q) => ({ x: q.x === undefined ? xc : q.x, y: q.y === undefined ? yc : q.y, t: q.t || 0, amp: q.amp === undefined ? spec.bubble : q.amp, rx: q.rx, ry: q.ry, zc: q.zc, rz: q.rz })).sort((p, q) => p.t - q.t);
    const wrap = (d) => d - L * Math.round(d / L), warmth = (q, i, j, k) => bubble(wrap((i + 0.5) * dx - q.x), wrap((j + 0.5) * dx - q.y), (k + 0.5) * dz, 0, 0, q.amp, q.rx, q.ry, q.zc, q.rz);
    const timed = seeds.filter((q) => q.t > 0); let nextSeed = 0;
    for (let k = 0; k < nz; k++) for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) { const o = idx(i, j, k); let th = 0; for (const q of seeds) if (!(q.t > 0)) th += warmth(q, i, j, k); S.th[o] = th; S.u[o] = b.ubc[k]; S.v[o] = b.vbc[k]; }
    core.fill();
    const record = recorder(core), frames = [], t0 = Date.now(), motion = env.motion, nSteps = Math.round(minutes * 60 / dt), follow = spec.follow !== false, cum = [0, 0];
    /* the detail nest: from the first recorded frame at or after `from` minutes a finer core (cells of `dx`, a box of `box` metres as whole cells of the box's, in its middle) lies in the middle of the box, driven at its sides by the box's own state
       (src/severe-nest.js), and every frame carries its lowest `ztop` metres beside the box's. It stays where it is in the box, which follows the storm, and is moved with the box when that is moved. */
    const NEST = globalThis.HFSevereNest, det = spec.detail ? Object.assign({ dx: 500, box: 40000, from: 20, ztop: 8000, every: 1, minUpdraft: 10 }, spec.detail) : null;
    let ratio = 0, cn = 0, cx0 = 0, cy0 = 0, nzr = 0, child = null, nest = null, crec = null;
    if (det) {
      if (!NEST) throw new Error('severe-lab: a detail nest needs HFSevereNest');
      if (!follow) throw new Error('severe-lab: a detail nest needs a box that follows its storm');
      if (timed.length) throw new Error('severe-lab: a seed that goes off after minute 0 does not reach a nest (it is driven at its sides only)');
      ratio = Math.round(dx / det.dx); if (ratio < 2 || Math.abs(ratio * det.dx - dx) > 1e-6) throw new Error('severe-lab: the detail cells (' + det.dx + ' m) must be a whole fraction (a half or less) of the box\'s (' + dx + ' m)');
      const pc = Math.max(4, Math.min(nx - 4, Math.round(det.box / dx))); cn = pc * ratio; cx0 = cy0 = Math.round((nx - pc) / 2) * dx; nzr = Math.min(nz, Math.max(1, Math.ceil(det.ztop / dz - 1e-9)));
    }
    const startNest = () => {
      child = C.create(Object.assign(physics(cn, det.dx), { bc: { x: 'driven', y: 'driven' }, relax: { width: 6 } }));
      nest = NEST.create({ parent: core, child, ratio, x0: cx0, y0: cy0 }); nest.init(); crec = recorder(child, { wind: 1, nz: nzr });
    };
    /* the header is made now and its frames' parts grow with them: a page that plays the run while it goes (hooks.start) has the grid, the scale, the motion and the nest's grid before the first frame */
    const header = { v: det ? 2 : 1, nx, ny: nx, nz, dx, dz, floor: -30, times: [], motion: { u: motion.u, v: motion.v }, track: [], drift: [], scale: { wind: 0.5, vz: 0.25 },
      lab: Object.assign({ evap, bubble: spec.bubble === undefined ? 3 : spec.bubble, dt, minutes, follow }, drag ? { drag } : {}, spec.twoMoment ? { twoMoment: true } : {}, spec.seeds ? { seeds: seeds.map((q) => [Math.round(q.x), Math.round(q.y), q.t, q.amp === undefined ? 3 : q.amp]) } : {}, det ? { detail: { dx: det.dx, box: cn * det.dx, from: det.from, ztop: nzr * dz, every: det.every, minUpdraft: det.minUpdraft } } : {}),     // (what the run was set to; the pack reader does not look at it)
      base: { z: Array.from(b.rhoc, (_, k) => (k + 0.5) * dz), u: Array.from(b.ubc, (v) => +(v + motion.u).toFixed(3)), v: Array.from(b.vbc, (v) => +(v + motion.v).toFixed(3)) } };
    if (det) { header.nests = [{ nx: cn, ny: cn, nz: nzr, dx: det.dx, dz, scale: { wind: 1, vz: 0.25 }, frame: { u: 0, v: 0 } }]; header.fn = []; }
    if (hooks.start) hooks.start(header);
    let nextFrame = 0, yielded = Date.now(), stopped = false, reason = '';
    for (let step = 0; step <= nSteps; step++) {
      const t = step * dt;
      if (t >= nextFrame - 1e-9) {
        const d = core.diag(), dc = nest ? child.diag() : null, per5 = 5 * nx * nx * nz, { block, zmax } = record(nest ? new Uint8Array(per5 + 5 * cn * cn * nzr) : null, 0); let wm = -1, wx = 0, wy = 0;
        if (nest) crec(block, per5);
        for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) { const o = idx(i, j, k5), w = 0.5 * (S.w[o] + S.w[o + sz]); if (w > wm) { wm = w; wx = (i + 0.5) * dx; wy = (j + 0.5) * dx; } }
        const rec = { i: frames.length, t: t / 60, block, track: [Math.round(wx), Math.round(wy), +wm.toFixed(1)], wmax: +d.wmax.toFixed(1), zmax: Math.round(zmax), thvmin: +d.thvmin.toFixed(2), drift: [cum[0], cum[1]], nest: !!nest, fn: nest ? [[0, cx0, cy0]] : [] };
        if (!Number.isFinite(d.wmax) || d.wmax > 150 || (dc && (!Number.isFinite(dc.wmax) || dc.wmax > 150))) { stopped = true; reason = 'the model blew up at ' + (t / 60).toFixed(1) + ' min'; break; }
        const c = follow ? centring(block, nx, nx, nz, dz) : null;                                         // (looked at before the hook: a worker hands the block over to the page and it is gone from here)
        frames.push(rec); header.times.push(rec.t); header.track.push(rec.track); header.drift.push(rec.drift); if (det) header.fn.push(rec.fn); if (hooks.frame) hooks.frame(rec);
        if (c && (c.sx || c.sy)) { rollNested(core, nest, ratio, c.sx, c.sy); cum[0] -= c.sx * dx; cum[1] -= c.sy * dx; }       // (the storm is back in the middle, the box's corner is where the storm's drift has taken it)
        if (det && !nest && t >= det.from * 60 - 1e-9 && d.wmax >= det.minUpdraft) { startNest(); if (hooks.nest) hooks.nest({ child, nest }); }
        nextFrame += (nest ? det.every : every) * 60;
      }
      if (hooks.progress && step % (nest ? 1 : 6) === 0) hooks.progress({ t: t / 60, of: minutes, wall: (Date.now() - t0) / 1000 });          // (a minute is 6 steps, and a step with the nest is long: it reports every one)
      if (nextSeed < timed.length && t >= timed[nextSeed].t * 60 - 1e-9) {                              // (the bubbles of the minute are added to the box as it stands and its halo is filled again)
        while (nextSeed < timed.length && t >= timed[nextSeed].t * 60 - 1e-9) { const q = timed[nextSeed++]; for (let k = 0; k < nz; k++) for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) S.th[idx(i, j, k)] += warmth(q, i, j, k); }
        core.fill();
      }
      if (nest) nest.step(dt); else core.step(dt);
      if (hooks.yield && Date.now() - yielded > 80) { await hooks.yield(); yielded = Date.now(); const c = hooks.cancelled && hooks.cancelled(); if (c) { stopped = true; reason = typeof c === 'string' ? c : 'cancelled'; break; } }
    }
    if (!frames.some((f) => f.nest)) { delete header.nests; delete header.fn; header.v = 1; }                                  // (a run in which the nest never started is a pack of version 1)
    return { frames, header, wall: (Date.now() - t0) / 1000, steps: nSteps, stopped, reason };
  }

  globalThis.HFSevereLab = { envOf, run, bubble, recorder, roll, rollNested, centring };
})();
