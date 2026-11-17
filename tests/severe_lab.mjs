// Node-only tests of the Lab (src/severe-lab.js): the environment of a run made from arrays (linear in height, the winds in the frame of the storm), the bubble that starts a storm against its closed form, the recorder of a
// frame (the five arrays of a pack in the order level, y, x, the winds in half-metre steps, the fall speed in quarter-metre steps, clamps), a short run (its frames, its header, its hooks, a cancel and a blow-up), a storm of the
// dryline day (the drawing's sounding at its spot gives an updraft and an echo), and the pack that the page makes of what a run recorded (HFSeverePack.assemble reads back what was put in).
import '../src/severe-core.js';
import '../src/severe-sounding.js';
import '../src/severe-refl.js';
import '../src/severe-nest.js';
import '../src/severe-analysis.js';
import '../src/severe-days.js';
import '../src/severe-geo.js';
import '../src/severe-pack.js';
import '../src/severe-lab.js';

const C = globalThis.HFSevereCore, S = globalThis.HFSevereSounding, L = globalThis.HFSevereLab, P = globalThis.HFSeverePack, NEST = globalThis.HFSevereNest;
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); if (process.env.FAILFAST) process.exit(1); } }      // (FAILFAST=1: the mutant tool stops at the first check that fails)
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const t0 = Date.now();
const arrays = (nz = 41, dz = 500) => { const z = Array.from({ length: nz }, (_, k) => k * dz); return { z, theta: z.map((h) => 300 + 4 * h / 1000), qv: z.map((h) => 0.014 * Math.exp(-h / 2500)), u: z.map((h) => 3 + 5 * h / 1000), v: z.map((h) => 2 + 1 * h / 1000), p0: 1000, motion: { u: 8, v: 3 } }; };

/* 1. The environment from arrays. */
{
  const a = arrays(), e = L.envOf(a);
  check('the potential temperature and the vapour of the run are the arrays, linear between their heights (theta at 1250 m: ' + e.theta(1250).toFixed(3) + ' K for 305 K; at 3000: ' + e.theta(3000).toFixed(2) + '; at the ground ' + e.theta(0) + ' K; held above the top ' + e.theta(99999).toFixed(1) + ' K for ' + a.theta[40] + ')',
    near(e.theta(1250), 305, 1e-9) && near(e.theta(3000), 312, 1e-9) && e.theta(0) === 300 && near(e.theta(99999), a.theta[40], 1e-9) && e.theta(-50) === 300 && near(e.qv(250), (a.qv[0] + a.qv[1]) / 2, 1e-9));
  check('the winds the storm sees are the ground\'s less the storm\'s motion (8, 3 m/s): at 2 km the sounding has (13, 4), the storm sees (' + e.u(2000).toFixed(2) + ', ' + e.v(2000).toFixed(2) + '); the motion is kept (' + JSON.stringify(e.motion) + ')',
    near(e.u(2000), 13 - 8, 1e-9) && near(e.v(2000), 4 - 3, 1e-9) && e.motion.u === 8 && e.motion.v === 3 && near(e.u(1250), 3 + 5 * 1.25 - 8, 1e-9));
  check('the winds are held at the ends of their arrays (below the ground (-50 m) the lowest value, above the top (99999 m) the highest, less the motion: u ' + e.u(-50) + ', ' + e.u(99999) + '; v ' + e.v(-50) + ', ' + e.v(99999) + ')', near(e.u(-50), 3 - 8, 1e-12) && near(e.u(99999), 3 + 5 * 20 - 8, 1e-12) && near(e.v(-50), 2 - 3, 1e-12) && near(e.v(99999), 2 + 20 - 3, 1e-12));
  const e9 = L.envOf(Object.assign({}, a, { p0: 900 })), e0 = L.envOf(Object.assign({}, a, { p0: undefined }));
  check('the pressure at the ground is the one given (900 hPa: the Exner function ' + e9.table.pi[0].toFixed(5) + ' for ' + Math.pow(0.9, 287.04 / 1005.7).toFixed(5) + ') or 1000 hPa (' + e0.table.pi[0].toFixed(5) + ')', near(e9.table.pi[0], Math.pow(0.9, 287.04 / 1005.7), 1e-4) && near(e0.table.pi[0], 1, 1e-9));
  const e2 = L.envOf(Object.assign({}, a, { motion: undefined })); const b = S.bunkers(e2);
  check('with no motion given it is the Bunkers right mover\'s, to a tenth of a m/s (' + JSON.stringify(e2.motion) + ' for ' + b.right.u.toFixed(1) + ', ' + b.right.v.toFixed(1) + ')', near(e2.motion.u, b.right.u, 0.06) && near(e2.motion.v, b.right.v, 0.06));
}

/* 1b. Where the nest goes against the middle of the box (the pure part; the runs that use it are in 8c2): `upshear` metres against the shear of the lowest 6 km, in proportion to it under 20 m/s. */
{
  const shearEnv = (su, sv) => ({ uG: (z) => su * z / 6000, vG: (z) => sv * z / 6000 }), up = (su, sv, m) => L.upshear(shearEnv(su, sv), m), r0 = (v) => Math.round(v * 1000) / 1000 + 0;
  check('upshear is the given metres against the 0 to 6 km shear when it is 20 m/s or more (east 30: ' + up(30, 0, 8000).map(r0) + '; north 20: ' + up(0, 20, 8000).map(r0) + '; north-east, 21.2 each: ' + up(21.2, 21.2, 8000).map((v) => Math.round(v)) + '), in proportion to it under that (10 m/s east: ' + up(10, 0, 8000).map(r0) + '; 5 m/s west: ' + up(-5, 0, 8000).map(r0) + '), and nothing in none, a shear under 1 m/s or no metres (' + [up(0, 0, 8000), up(0.5, 0.5, 8000), up(30, 0, 0), up(30, 0, -5)].map((a) => a.map(r0)).join(' ') + ')',
    up(30, 0, 8000).map(r0).join() === '-8000,0' && up(0, 20, 8000).map(r0).join() === '0,-8000' && up(21.2, 21.2, 8000).map((v) => Math.round(v)).join() === '-5657,-5657' && up(10, 0, 8000).map(r0).join() === '-4000,0' && up(-5, 0, 8000).map(r0).join() === '2000,0'
    && [up(0, 0, 8000), up(0.5, 0.5, 8000), up(30, 0, 0), up(30, 0, -5)].every((a) => a.map(r0).join() === '0,0'));
}

/* 1c. The storm a steered box keeps (the pure part; the runs that use it are in 1d): `rotating`, the updraft that turns, found from the core's own winds by the updraft helicity of the levels from 2 to 5 km. */
{
  const nx = 40, nz = 14, dx = 2000, dz = 500, mk = () => C.create({ nx, ny: nx, nz, dx, dy: dx, dz, theta: () => 300, bc: { x: 'periodic', y: 'periodic' } });
  // a storm put in by hand: winds turning as a solid body at `om` (1/s; the vorticity is twice that) within 3.5 cells of the cell (i0, j0), and an updraft of `w` m/s in that cell and of three quarters of it in the eight round it
  // (a mean of 7 w / 9 over the 3 x 3), from the level k0 to the level k1 (the updraft at the centre of the level above k1 is half of it)
  const put = (core, i0, j0, om, w, k0 = 4, k1 = 9) => {
    const S = core.S, idx = core.idx, wr = (d) => d - nx * Math.round(d / nx);
    for (let k = k0; k <= k1; k++) for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) {
      const o = idx(i, j, k), xu = wr(i - (i0 + 0.5)), yu = wr(j + 0.5 - (j0 + 0.5)), xv = wr(i + 0.5 - (i0 + 0.5)), yv = wr(j - (j0 + 0.5));
      if (Math.hypot(xu, yu) <= 3.5) S.u[o] += -om * yu * dx;
      if (Math.hypot(xv, yv) <= 3.5) S.v[o] += om * xv * dx;
      if (Math.abs(wr(i - i0)) <= 1 && Math.abs(wr(j - j0)) <= 1) { const ww = i === i0 && j === j0 ? w : 0.75 * w; S.w[o] = ww; S.w[idx(i, j, k + 1)] = ww; }
    }
    core.fill(); return core;
  };
  const cell = (r) => r && [Math.round(r.x / dx - 0.5), Math.round(r.y / dx - 0.5)].join(','), R = (c, o) => L.rotating(c, o), mean = 7 / 9;
  const one = R(put(mk(), 12, 20, 0.004, 20));
  check('an updraft of 20 m/s in winds that turn cyclonically (a vorticity of 0.008 /s over the 3 km from 2 to 5 km: an updraft helicity of 7/9 x 20 x 0.008 x 3000 = 373 m2/s2 in the mean of its 3 x 3 cells) is found at its cell (12, 20: ' + cell(one) + '), as a rotating one, with that helicity (' + (one && one.uh.toFixed(1)) + ') and its updraft at 5.25 km (' + (one && one.w) + ' m/s, the half of it that the level has)',
    one && cell(one) === '12,20' && one.rot === true && one.far === false && near(one.uh, mean * 480, 0.5) && one.w === 10 && near(one.x, 12.5 * dx, 1e-9) && near(one.y, 20.5 * dx, 1e-9));
  const pair = put(put(mk(), 12, 20, 0.004, 20), 30, 8, -0.006, 35), two = R(pair), anti = R(put(mk(), 30, 8, -0.006, 35));
  check('of the two halves of a storm that has split, the cyclonic one is kept though the other is the stronger (an anticyclonic updraft of 35 m/s at (30, 8) beside the cyclonic 20 m/s at (12, 20): ' + cell(two) + ', rotating ' + (two && two.rot) + '); an anticyclonic updraft alone is no rotating one, and is found as the strongest updraft (' + cell(anti) + ', rotating ' + (anti && anti.rot) + ', ' + (anti && anti.w) + ' m/s, a helicity of ' + (anti && anti.uh.toFixed(0)) + ')',
    cell(two) === '12,20' && two.rot === true && cell(anti) === '30,8' && anti.rot === false && anti.w === 17.5 && near(anti.uh, -mean * 35 * 0.012 * 3000, 1));
  const sink = R(put(mk(), 30, 8, -0.006, -35));
  check('only an updraft counts: air that sinks while it turns the other way (35 m/s down, anticyclonic: the same product of the two) is no storm (' + sink + ')', sink === null);
  const weak = put(mk(), 12, 20, 0.0004, 20), w0 = R(weak), w1 = R(weak, { uh: 30 });
  check('an updraft counts as rotating from a helicity of 50 m2/s2 (one of 37: found as the strongest updraft, rotating ' + (w0 && w0.rot) + ', its helicity ' + (w0 && w0.uh.toFixed(1)) + '), or from `uh` (30: rotating ' + (w1 && w1.rot) + ')', w0 && w0.rot === false && cell(w0) === '12,20' && near(w0.uh, mean * 48, 0.2) && w1.rot === true && cell(w1) === '12,20');
  const both = put(put(mk(), 8, 8, 0.004, 20), 30, 30, 0.008, 20), nearA = R(both, { at: [8.5 * dx, 9.5 * dx], reach: 20000 }), anyw = R(both), farB = R(both, { at: [19.5 * dx, 19.5 * dx], reach: 6000 });
  check('it is looked for within `reach` of where it was put last: of two rotating updrafts the weaker one, 2 km from that place, is kept (' + cell(nearA) + ', not far: ' + (nearA && nearA.far) + ') though the other turns twice as fast (with no place given the stronger: ' + cell(anyw) + '); with none within reach the strongest of the whole box is taken and said to be far (' + cell(farB) + ', ' + (farB && farB.far) + ')',
    cell(nearA) === '8,8' && nearA.far === false && cell(anyw) === '30,30' && cell(farB) === '30,30' && farB.far === true && farB.rot === true);
  const rim = R(both, { at: [8.5 * dx + 20000, 8.5 * dx], reach: 20000 }), short = R(both, { at: [8.5 * dx + 20000, 8.5 * dx], reach: 19999 });
  check('the reach is a distance in metres from that place, in the round: the storm\'s own cell exactly 20000 m west of it is within a reach of 20000 (' + cell(rim) + ') and not within one of 19999, which takes the best cell that is, the next one east (' + cell(short) + ', a helicity of ' + (short && short.uh.toFixed(0)) + ' for 253)',
    cell(rim) === '8,8' && rim.far === false && cell(short) === '9,8' && short.far === false && near(short.uh, 4.75 / 9 * 480, 1));
  const diag = R(both, { at: [8.5 * dx + 15000, 8.5 * dx + 15000], reach: 20000 });
  check('a place 15 km east and 15 km north of it is 21.2 km away, out of a reach of 20 km though each of the two is within it (the best cell within reach is another: ' + cell(diag) + ')', diag && cell(diag) !== '8,8' && diag.far === false);
  const low = R(put(mk(), 12, 20, 0.004, 20, 0, 3)), high = R(put(mk(), 12, 20, 0.004, 20, 10, 12)), part = R(put(mk(), 12, 20, 0.004, 20, 3, 5));
  check('the helicity is that of the levels from 2 to 5 km and the updraft that of 5.25 km: a storm that turns below 2 km only is nothing (' + low + '), one above 5 km only is an updraft that does not rotate (' + cell(high) + ', ' + (high && high.rot) + ', ' + (high && high.w) + ' m/s), and one from 1.75 to 2.75 km counts with its two levels above 2 km (a helicity of ' + (part && part.uh.toFixed(1)) + ' for 124.4) and has no updraft at 5.25 km (' + (part && part.w) + ')',
    low === null && cell(high) === '12,20' && high.rot === false && high.w === 20 && part && part.rot === true && near(part.uh, mean * 160, 0.2) && part.w === 0);
  const edge = R(put(mk(), 39, 0, 0.004, 20), { at: [0.5 * dx, 39.5 * dx], reach: 6000 });
  check('the box is periodic: a storm at its south-east corner cell (39, 0) is found from a place across both edges, 2.8 km from it (' + cell(edge) + ', far ' + (edge && edge.far) + ')', cell(edge) === '39,0' && edge.far === false);
  const calm = R(mk()), puff = put(mk(), 5, 5, 0, 6), p0 = R(puff), p1 = R(puff, { w: 2 });
  check('a box with no updraft has none (' + calm + '), nor has one whose strongest is under 5 m/s at 5.25 km (3 m/s: ' + p0 + ') unless `w` says less (2: ' + cell(p1) + ', ' + (p1 && p1.w) + ' m/s)', calm === null && p0 === null && cell(p1) === '5,5' && p1.rot === false && p1.w === 3);
  const off = put(mk(), 12, 20, 0.004, 20); { const S = off.S, idx = off.idx, k5 = 10; S.w[idx(14, 20, k5)] = 60; S.w[idx(14, 20, k5 + 1)] = 60; S.w[idx(17, 20, k5)] = 90; S.w[idx(17, 20, k5 + 1)] = 90; off.fill(); }
  const ro = R(off);
  check('its updraft is the strongest at 5.25 km within 6 km of the place (60 m/s two cells east of it, not the 90 m/s five cells east: ' + (ro && ro.w) + ' m/s, the place still ' + cell(ro) + ')', ro && ro.w === 60 && cell(ro) === '12,20');
}

/* 1d. A box that is steered (`steer`, docs/severe-research.md part 7; here, before the long runs, so that a mutant of it is caught early): it keeps the rotating updraft of its storm (`rotating`, 1c) at one place, `lead` metres upshear of its middle; the bubble that starts the storm and the nest are put at that
      place; `sponge` damps what reaches the sides. Without them a run is what it was. The dryline day's storm at 3 km, as in 7 and 8 below. */
{
  const d = globalThis.HFSevereDays.get('dryline'), A = globalThis.HFSevereAnalysis.create(d.drawing), sp = d.spot, env = A.sounding(sp.x, sp.y, sp.t, { dz: 100, top: 20000 }), tb = env.table;
  const ar = { z: Array.from(tb.z), theta: Array.from(tb.theta), qv: Array.from(tb.qv), u: Array.from(tb.z, (z) => env.uG(z)), v: Array.from(tb.z, (z) => env.vG(z)), p0: 1000, motion: env.motion };
  const base = { env: ar, dx: 3000, box: 60000, dt: 10, minutes: 30, frameEvery: 5 }, cell = 3000, mid = 30000, whole = (v) => Math.round(v / cell) * cell;
  const made = [], cores = [], orig = C.create; C.create = (o) => { made.push(o); const c = orig(o); cores.push(c); return c; };
  const up9 = L.upshear(L.envOf(ar), 9000), at9 = [mid + whole(up9[0]), mid + whole(up9[1])], up12 = L.upshear(L.envOf(ar), 12000), at12 = [mid + whole(up12[0]), mid + whole(up12[1])];
  let warm = null;                                             // (where the bubble is, read from the core when the run hands its header over, before the first step)
  const where = (core) => { let b = -1, q = null; for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) { const t = core.S.th[core.idx(i, j, 3)]; if (t > b) { b = t; q = [(i + 0.5) * cell, (j + 0.5) * cell]; } } return q; };
  made.length = 0; cores.length = 0;
  const st = await L.run(Object.assign({}, base, { steer: { lead: 9000 } }), { start: () => { warm = where(cores[0]); } }), hs = st.header.lab.steer;
  check('a steered run says so in its header: the lead it was given (9000 m), the helicity that makes an updraft a rotating one (50) and the reach (20000 m) that are the Lab\'s own, and the place the storm is kept, 9000 m upshear of the middle of the box in whole cells (' + JSON.stringify(hs) + ' for ' + at9.join(', ') + ', the shear being ' + up9.map((v) => -Math.round(v)).join(', ') + ' m of it)',
    hs && hs.lead === 9000 && hs.uh === 50 && hs.reach === 20000 && hs.at.join() === at9.join() && (at9[0] !== mid || at9[1] !== mid) && at9[0] % cell === 0 && at9[1] % cell === 0);
  check('the bubble that starts the storm is at that place and not in the middle of the box (the warmest cell at 1.75 km before the first step is at ' + (warm && warm.join(', ')) + ' m, within a cell of ' + at9.join(', ') + ')', warm && Math.abs(warm[0] - at9[0]) <= cell && Math.abs(warm[1] - at9[1]) <= cell && Math.hypot(warm[0] - mid, warm[1] - mid) > 4000);
  const tr = st.header.track, dist = tr.map((t) => Math.round(Math.max(Math.abs(t[0] - at9[0]), Math.abs(t[1] - at9[1])) / cell * 10) / 10), dr = st.header.drift;
  check('once the storm has an updraft the box is moved to put it back at that place after every frame: the track (the storm the box keeps) is within 2 cells of it at each frame from the 20th minute (cells off, frame by frame: ' + dist.join(', ') + '), the box\'s corner has moved to do it (' + JSON.stringify(dr[dr.length - 1]) + ' m, whole cells) and the track\'s updraft is the storm\'s (' + tr.map((t) => t[2]).join(', ') + ' m/s)',
    dist.slice(4).every((x) => x <= 2) && (dr[dr.length - 1][0] !== 0 || dr[dr.length - 1][1] !== 0) && dr.every((q) => q[0] % cell === 0 && q[1] % cell === 0) && tr[tr.length - 1][2] >= 15);
  const non = await L.run(Object.assign({}, base, { follow: false, steer: { lead: 9000 }, seeds: [{ x: at9[0], y: at9[1] }] }), {});
  const gs = st.header.track.map((t, i) => [t[0] + dr[i][0], t[1] + dr[i][1]]), gn = non.header.track, idxs = gs.map((x, i) => i).filter((i) => st.header.track[i][2] >= 10 && gn[i][2] >= 10), gap = Math.max(...idxs.map((i) => Math.hypot(gs[i][0] - gn[i][0], gs[i][1] - gn[i][1])));
  check('the storm is where it would be in a box that is never moved (the same bubble at the same place, `follow: false`, which takes no steering: no `steer` in its header (' + (non.header.lab.steer === undefined) + '), no drift): the steered box\'s track plus its corner is that run\'s strongest updraft to within 2 cells at the ' + idxs.length + ' frames with an updraft of 10 m/s in both (the worst ' + Math.round(gap) + ' m)',
    non.header.lab.steer === undefined && non.header.drift.every((q) => q[0] === 0 && q[1] === 0) && idxs.length >= 3 && gap <= 2 * cell * Math.SQRT2);
  const spS = P.stormPath(st.header), h0 = Object.assign({}, st.header, { lab: Object.assign({}, st.header.lab, { steer: undefined }) }), sp0 = P.stormPath(h0), mo9 = st.header.motion, k9 = st.header.times.length - 1, q9 = st.header.track[k9], d9 = st.header.drift[k9];
  check('the storm\'s path over the ground starts from the place the box keeps it at, where its bubble is (the first point ' + spS.pts[0].x + ', ' + spS.pts[0].y + '; at the end ' + Math.round(spS.pts[k9].x) + ', ' + Math.round(spS.pts[k9].y) + ' m: the motion, the drift and the track less the place), where read from the middle of the box it would be ' + Math.round(sp0.pts[k9].x - spS.pts[k9].x) + ', ' + Math.round(sp0.pts[k9].y - spS.pts[k9].y) + ' m off',
    spS.pts[0].x === 0 && spS.pts[0].y === 0 && near(spS.pts[k9].x, mo9.u * 60 * st.header.times[k9] + d9[0] + q9[0] - at9[0], 1e-6) && near(spS.pts[k9].y, mo9.v * 60 * st.header.times[k9] + d9[1] + q9[1] - at9[1], 1e-6) && near(sp0.pts[k9].x - spS.pts[k9].x, at9[0] - mid, 1e-6) && near(sp0.pts[k9].y - spS.pts[k9].y, at9[1] - mid, 1e-6) && at9[0] !== at9[1]);
  const dfl = await L.run(Object.assign({}, base, { minutes: 1, frameEvery: 1, steer: true }), {}), big = await L.run({ env: ar, dx: 6000, box: 192000, nz: 20, dz: 1000, dt: 30, minutes: 0.5, steer: true }, {});
  check('`steer: true` takes the Lab\'s own lead, a fifth of the box (12000 m of 60 km: the place ' + JSON.stringify(dfl.header.lab.steer.at) + ' for ' + at12.join(', ') + ') and no more than 24 km (a box of 192 km: ' + big.header.lab.steer.lead + ' m)', dfl.header.lab.steer.lead === 12000 && dfl.header.lab.steer.at.join() === at12.join() && big.header.lab.steer.lead === 24000);
  made.length = 0;
  const DET = { dx: 1000, box: 18000, from: 15, ztop: 6000, every: 5 }, fnOf = (r) => r.header.fn[r.header.fn.length - 1][0].slice(1), b20 = Object.assign({}, base, { minutes: 20 });
  const sn = await L.run(Object.assign({}, b20, { steer: { lead: 9000 }, detail: DET }), {}), su = await L.run(Object.assign({}, b20, { steer: { lead: 9000 }, detail: Object.assign({}, DET, { upshear: 6000 }) }), {}), so = await L.run(Object.assign({}, b20, { steer: { lead: 9000 }, detail: Object.assign({}, DET, { offset: [3000, -3000] }) }), {});
  const up6 = L.upshear(L.envOf(ar), 6000);
  check('the nest of a steered run is on the place the storm is kept, its middle there (its corner at ' + fnOf(sn).join(', ') + ' for ' + (at9[0] - 9000) + ', ' + (at9[1] - 9000) + ', and the header says how far that is from the middle of the box: ' + JSON.stringify(sn.header.lab.detail.offset) + '), unless it is told where: `upshear` (6000: ' + fnOf(su).join(', ') + ') and `offset` (3000, -3000: ' + fnOf(so).join(', ') + ') are from the middle of the box as they were',
    fnOf(sn).join() === [at9[0] - 9000, at9[1] - 9000].join() && JSON.stringify(sn.header.lab.detail.offset) === JSON.stringify([at9[0] - mid, at9[1] - mid]) && fnOf(su).join() === [21000 + whole(up6[0]), 21000 + whole(up6[1])].join() && fnOf(so).join() === '24000,18000' && fnOf(sn).join() !== fnOf(su).join());
  made.length = 0;
  const sp6 = await L.run(Object.assign({}, b20, { minutes: 16, sponge: 6000, detail: DET }), {}), boxO = made[0], nestO = made[1];
  check('`sponge` (6000 m) is a damping of the box\'s sides over that width at 0.02 /s beside the Rayleigh layer under its lid (' + JSON.stringify(boxO && boxO.damp) + '), the header says it (' + sp6.header.lab.sponge + '), and the nest, which is driven at its sides, has none (' + JSON.stringify(nestO && nestO.damp) + ')',
    boxO && JSON.stringify(boxO.damp) === JSON.stringify({ top: { depth: 5000, rate: 0.003 }, lateral: { width: 6000, rate: 0.02 } }) && sp6.header.lab.sponge === 6000 && nestO && JSON.stringify(nestO.damp) === JSON.stringify({ top: { depth: 5000, rate: 0.003 } }) && nestO.bc.x === 'driven');
  made.length = 0;
  const plain = await L.run(Object.assign({}, base, { minutes: 1, frameEvery: 1 }), {}), zero = await L.run(Object.assign({}, base, { minutes: 1, frameEvery: 1, sponge: 0, steer: false }), {});
  check('a run with neither is what it was: no sponge in the model (' + JSON.stringify(made[0].damp) + '), nothing of them in the header (' + ('steer' in plain.header.lab) + ', ' + ('sponge' in plain.header.lab) + '; with `sponge: 0` and `steer: false` the same: ' + ('steer' in zero.header.lab) + ', ' + ('sponge' in zero.header.lab) + '), and the bubble in the middle of the box',
    JSON.stringify(made[0].damp) === JSON.stringify({ top: { depth: 5000, rate: 0.003 } }) && !('steer' in plain.header.lab) && !('sponge' in plain.header.lab) && !('steer' in zero.header.lab) && !('sponge' in zero.header.lab) && JSON.stringify(made[1].damp) === JSON.stringify(made[0].damp));
  const swin = await L.run(Object.assign({}, base, { minutes: 20, window: 36000, steer: { lead: 9000 } }), {}), tw = swin.header.track[swin.header.track.length - 1], aw = swin.header.lab.steer.at;
  check('with a window the place and the track are the window\'s (the box\'s less the window\'s corner, 12000 m: the place ' + JSON.stringify(aw) + ' for ' + (at9[0] - 12000) + ', ' + (at9[1] - 12000) + '; the track of the last frame within 2 cells of it: ' + JSON.stringify(tw.slice(0, 2)) + ')',
    aw.join() === [at9[0] - 12000, at9[1] - 12000].join() && Math.max(Math.abs(tw[0] - aw[0]), Math.abs(tw[1] - aw[1])) <= 2 * cell);
  C.create = orig;
}

/* 2. The bubble: a cosine squared of 10 km by 10 km by 1.5 km, centred at 1.5 km, 3 K. */
{
  const b = (x, y, z, d) => L.bubble(x, y, z, 42000, 42000, d);
  check('the bubble is 3 K at its centre (' + b(42000, 42000, 1500) + '), 1.5 K halfway out (cos^2 of 45 degrees: ' + b(47000, 42000, 1500).toFixed(6) + '), nothing at its edge or outside (' + b(52000, 42000, 1500) + ', ' + b(42000, 42000, 3000) + ', ' + b(70000, 42000, 1500) + '), 1.5 km deep and 10 km wide in every direction (' + b(42000, 47000, 1500).toFixed(3) + ', ' + b(42000, 42000, 2250).toFixed(3) + ')',
    b(42000, 42000, 1500) === 3 && near(b(47000, 42000, 1500), 1.5, 1e-12) && b(52000, 42000, 1500) === 0 && b(42000, 42000, 3000) === 0 && b(70000, 42000, 1500) === 0 && near(b(42000, 47000, 1500), 1.5, 1e-12) && near(b(42000, 42000, 2250), 1.5, 1e-12));
  check('another amplitude scales it (1 K: ' + b(42000, 42000, 1500, 1) + ', 0 K: ' + b(42000, 42000, 1500, 0) + ')', b(42000, 42000, 1500, 1) === 1 && b(42000, 42000, 1500, 0) === 0 && near(b(44000, 42000, 1800, 5), 5 * Math.pow(Math.cos(0.5 * Math.PI * Math.hypot(0.2, 0.2)), 2), 1e-12));
}

/* 3. The recorder: a frame of a pack. */
{
  const nx = 6, ny = 5, nz = 8, a = arrays(nz + 1, 500), e = L.envOf(a), core = C.create({ nx, ny, nz, dx: 1000, dy: 1000, dz: 500, moist: true, ice: true, theta: e.theta, qv: e.qv, wind: { u: e.u, v: e.v }, bc: { x: 'periodic', y: 'periodic' } });
  const st = core.S, idx = core.idx, sy = idx(0, 1, 0) - idx(0, 0, 0), sz = idx(0, 0, 1) - idx(0, 0, 0);
  core.fill(); st.u.fill(10); st.v.fill(-5); st.w.fill(3);
  const o = idx(2, 3, 1); st.qr[o] = 2e-3; st.u[o] = 4; st.u[o + 1] = 6; st.v[o] = 1; st.v[o + sy] = 3; st.w[o] = -2; st.w[o + sz] = -4;
  const { block, zmax } = L.recorder(core)(), per = nx * ny * nz, at = (k, j, i) => (k * ny + j) * nx + i, d = new Int8Array(block.buffer, 0, per), vz = new Uint8Array(block.buffer, per, per), u = new Int8Array(block.buffer, 2 * per, per), v = new Int8Array(block.buffer, 3 * per, per), w = new Int8Array(block.buffer, 4 * per, per);
  check('a frame is five arrays of nz*ny*nx bytes (' + block.length + ' for ' + 5 * per + ') in the order level, y, x: heavy rain in the cell (2, 3, 1) is an echo there (' + d[at(1, 3, 2)] + ' dBZ) and nowhere else (' + Array.from(d).filter((x) => x > -30).length + ' cells), with a fall speed in quarter-metre steps (' + vz[at(1, 3, 2)] + ' = ' + vz[at(1, 3, 2)] / 4 + ' m/s) and none elsewhere',
    block.length === 5 * per && d[at(1, 3, 2)] > 35 && d[at(1, 3, 2)] < 70 && Array.from(d).filter((x) => x > -30).length === 1 && vz[at(1, 3, 2)] >= 16 && vz[at(1, 3, 2)] <= 50 && Array.from(vz).filter((x) => x > 0).length === 1 && zmax === d[at(1, 3, 2)]);
  const vr = core.zFall.rain(2e-3, 1);
  check('the fall speed is the core\'s own for rain of that mass, in quarter-metre steps (' + vz[at(1, 3, 2)] / 4 + ' m/s for ' + vr.toFixed(2) + ')', near(vz[at(1, 3, 2)] / 4, vr, 0.13) && vr > 5);
  check('the winds are at the cell centres (the mean of the two faces), in steps of 0.5 m/s: (4 + 6) / 2 = 5 m/s is 10, (1 + 3) / 2 = 2 is 4, (-2 + -4) / 2 = -3 is -6 in the cell, and the uniform 10, -5 and 3 m/s elsewhere are 20, -10 and 6 (' + u[at(1, 3, 2)] + ', ' + v[at(1, 3, 2)] + ', ' + w[at(1, 3, 2)] + ' | ' + u[at(4, 1, 1)] + ', ' + v[at(4, 1, 1)] + ', ' + w[at(4, 1, 1)] + ')',
    u[at(1, 3, 2)] === 10 && v[at(1, 3, 2)] === 4 && w[at(1, 3, 2)] === -6 && u[at(4, 1, 1)] === 20 && v[at(4, 1, 1)] === -10 && w[at(4, 1, 1)] === 6);
  st.u.fill(200); st.v.fill(-200); const big = L.recorder(core)().block;
  check('a wind past 63.5 m/s is held there (200 m/s: ' + new Int8Array(big.buffer, 2 * per, per)[at(3, 2, 2)] + ' and ' + new Int8Array(big.buffer, 3 * per, per)[at(3, 2, 2)] + ' steps of 0.5)', new Int8Array(big.buffer, 2 * per, per)[at(3, 2, 2)] === 127 && new Int8Array(big.buffer, 3 * per, per)[at(3, 2, 2)] === -127);
  const clear = L.recorder(C.create({ nx, ny, nz, dx: 1000, dy: 1000, dz: 500, moist: true, ice: true, theta: e.theta, qv: e.qv, wind: { u: e.u, v: e.v }, bc: { x: 'periodic', y: 'periodic' } }))();
  check('clear air is -30 dBZ everywhere with no fall speed (' + Array.from(new Int8Array(clear.block.buffer, 0, per)).every((x) => x === -30) + ', ' + Array.from(new Uint8Array(clear.block.buffer, per, per)).every((x) => x === 0) + ') and the strongest echo of the frame is -30 (' + clear.zmax + ')', Array.from(new Int8Array(clear.block.buffer, 0, per)).every((x) => x === -30) && Array.from(new Uint8Array(clear.block.buffer, per, per)).every((x) => x === 0) && clear.zmax === -30);
}

/* 6b. Where the storm was over the ground (what picks the radar site): a header's path, from numbers that can be worked out by hand. */
{
  /* where the storm was over the ground (what picks the radar site): the box's motion for the time, the drift of its corner and the updraft's place in the box less the box's middle; where there is no updraft of 5 m/s yet, the box's middle */
  const syn = P.stormPath({ nx: 10, dx: 1000, motion: { u: 10, v: -5 }, times: [0, 10, 20, 30, 80], track: [[500, 500, 0], [5500, 5500, 4.9], [6500, 4500, 15], [7500, 5500, 30], [5500, 5500, 40]], drift: [[0, 0], [0, 0], [0, 0], [1000, -2000], [3000, 1000]] });
  const want = [[0, 0], [6000, -3000], [13500, -6500], [21500, -10500], [51500, -22500]];
  check('the storm\'s path over the ground, from a header of 5 frames (a motion of 10 east and 5 south, a drift, an updraft place in a box of 10 km: ' + syn.pts.map((p) => p.x + ',' + p.y).join(' ') + '): the box\'s motion for the time plus the drift plus the updraft less the box\'s middle (5 km), and where the updraft is under 5 m/s the box\'s middle (the first two frames); the middle of the mature part is that of the frames of 20 and 30 minutes, whose updraft is 15 m/s or more, but not that of 80 (' + JSON.stringify(syn.mid) + ')',
    syn.pts.every((p, i) => p.x === want[i][0] && p.y === want[i][1] && p.t === [0, 10, 20, 30, 80][i]) && syn.mid.x === 17500 && syn.mid.y === -8500 && syn.mid.n === 2 && syn.pts[2].w === 15);
  const sh = (times, w) => ({ nx: 10, dx: 1000, motion: { u: 0, v: 0 }, times, track: w.map((q, i) => [5000 + 1000 * (i + 1), 5000, q]) });         // (frame i's updraft is 1000 (i + 1) m east of the middle)
  const q1 = P.stormPath(sh([19, 20, 70, 71], [20, 20, 20, 20])).mid, q2 = P.stormPath(sh([20, 30, 100], [14.9, 14.9, 20])).mid, q3 = P.stormPath(sh([20, 30, 40], [15, 10, 10])).mid, q4 = P.stormPath(sh([10, 90], [20, 20])).mid, q5 = P.stormPath(sh([20, 30, 40], [3, 4, 4.9])).mid, q6 = P.stormPath(sh([20, 30], [5, 4.9])).pts.map((p) => p.x), q7 = P.stormPath(sh([10, 90, 95], [15, 14, 14])).mid;
  check('the middle of the mature part is that of the frames from 20 to 70 minutes (inclusive) with an updraft of 15 m/s or more: of 19, 20, 70 and 71 minutes the 20 and the 70 (' + JSON.stringify(q1) + '); with none of them (14.9 m/s) the frames with one at any time (' + JSON.stringify(q2) + '); 15 is enough (' + JSON.stringify(q3) + '); two strong frames outside the window both count (' + JSON.stringify(q4) + '), and one of 15 with two of 14 beside it is the only one (' + JSON.stringify(q7) + '); with no storm, all the frames, at the box\'s middle (' + JSON.stringify(q5) + '); 5 m/s is a storm, 4.9 is not (' + q6.join(', ') + ')',
    q1.x === 2500 && q1.n === 2 && q2.x === 3000 && q2.n === 1 && q3.x === 1000 && q3.n === 1 && q4.x === 1500 && q4.n === 2 && q7.x === 1000 && q7.n === 1 && q5.x === 0 && q5.n === 3 && q6[0] === 1000 && q6[1] === 0);
}

/* 4. A short run: frames, header, hooks, cancel, blow-up. */
{
  const a = arrays(41, 500), spec = { env: a, dx: 6000, box: 48000, nz: 20, dz: 1000, dt: 15, minutes: 3, frameEvery: 1 }, got = { frames: [], progress: 0, yields: 0 };
  const r = await L.run(spec, { frame: (f) => got.frames.push(f.t), progress: () => { got.progress++; }, yield: async () => { got.yields++; await new Promise((res) => setTimeout(res, 0)); } });
  const h = r.header, per = h.nx * h.ny * h.nz;
  check('a run of 3 minutes with a frame a minute makes four frames, at 0, 1, 2 and 3 minutes (' + got.frames.join(', ') + '), told to the hook as they came, with progress on the way every 6 steps of the model (' + got.progress + ' reports in 12 steps)', JSON.stringify(got.frames) === '[0,1,2,3]' && r.frames.length === 4 && got.progress === 3 && !r.stopped && r.steps === 12);
  check('the header is what a pack\'s is without its ground: the grid (' + h.nx + ' x ' + h.ny + ' x ' + h.nz + ' cells of ' + h.dx + ' m and ' + h.dz + ' m), the times, the floor of -30, the steps of the winds (0.5) and of the fall speed (0.25), the box\'s motion over the ground (' + JSON.stringify(h.motion) + '), one track entry per frame (' + h.track.length + ') inside the box, and the base state (' + h.base.z.length + ' levels at their middles, the sounding\'s winds there in the ground\'s frame: ' + h.base.u[0] + ', ' + h.base.v[0] + ' m/s at 500 m)',
    h.v === 1 && h.nx === 8 && h.ny === 8 && h.nz === 20 && h.dx === 6000 && h.dz === 1000 && h.floor === -30 && JSON.stringify(h.times) === '[0,1,2,3]' && h.scale.wind === 0.5 && h.scale.vz === 0.25 && h.motion.u === 8 && h.motion.v === 3 && h.track.length === 4 && h.track.every((t) => t[0] >= 0 && t[0] <= 48000 && t[1] >= 0 && t[1] <= 48000)
    && h.base.z.length === 20 && h.base.z[0] === 500 && h.base.z[19] === 19500 && near(h.base.u[0], 3 + 5 * 0.5, 0.01) && near(h.base.v[0], 2 + 0.5, 0.01) && near(h.base.u[10], 3 + 5 * 10.5, 0.01) && near(h.base.v[10], 2 + 10.5, 0.01));
  check('every frame is one block of five arrays (' + r.frames[0].block.length + ' bytes for ' + 5 * per + ') and the bubble is in the first: the updraft of the first frame is nothing, of the last it has begun (' + r.frames[0].wmax + ', ' + r.frames[3].wmax + ' m/s)', r.frames.every((f) => f.block.length === 5 * per) && r.frames[0].wmax === 0 && r.frames[3].wmax > 0.1 && r.frames[3].wmax < 60);
  check('the run yielded now and then, so that a worker can hear a cancel (' + got.yields + ' breaths) and it says how long it took (' + r.wall.toFixed(1) + ' s)', got.yields >= 1 && r.wall > 0);
  const dfl5 = await L.run({ env: a, dx: 6000, box: 48000, nz: 20, dz: 1000, dt: 30, minutes: 11 }, {});
  check('with no `frameEvery` a frame comes every 5 minutes (a run of 11 minutes: ' + dfl5.header.times.join(', ') + ')', JSON.stringify(dfl5.header.times) === '[0,5,10]');
  const u0 = new Int8Array(r.frames[0].block.buffer, 2 * per, per), at0 = (k, j, i) => (k * 8 + j) * 8 + i;
  check('the first frame has the sounding\'s winds in the frame of the storm, the base state, at every level (level 10: ' + u0[at0(10, 3, 3)] + ' steps of 0.5 for ' + (h.base.u[10] - h.motion.u) / 0.5 + '; level 2: ' + u0[at0(2, 6, 1)] + ' for ' + (h.base.u[2] - h.motion.u) / 0.5 + ')', u0[at0(10, 3, 3)] === Math.round((h.base.u[10] - h.motion.u) / 0.5) && u0[at0(2, 6, 1)] === Math.round((h.base.u[2] - h.motion.u) / 0.5) && Math.abs(u0[at0(10, 3, 3)]) > 5);
  const dflt = await L.run({ env: a, minutes: 0.2 }, {}), hd = dflt.header;
  check('a run with nothing but an environment is the 2 km box of 84 km: ' + hd.nx + ' x ' + hd.ny + ' x ' + hd.nz + ' cells of ' + hd.dx + ' m and ' + hd.dz + ' m, with the first frame at 0 (' + dflt.frames.length + ' frame) and one step of 10 s (' + dflt.steps + ')', hd.nx === 42 && hd.ny === 42 && hd.nz === 40 && hd.dx === 2000 && hd.dz === 500 && dflt.frames.length === 1 && dflt.steps === 1);
  const ev3 = await L.run({ env: a, dx: 6000, box: 48000, nz: 20, dz: 1000, dt: 30, minutes: 1, evap: 0.3, bubble: 2 }, {});
  check('the settings of a run are in its header: the rain\'s evaporation (the knob of the cold pool), the bubble, the step and the length (' + JSON.stringify(ev3.header.lab) + '; the defaults ' + JSON.stringify(dflt.header.lab) + ')', JSON.stringify(ev3.header.lab) === '{"evap":0.3,"bubble":2,"dt":30,"minutes":1,"follow":true,"drag":0.1}' && JSON.stringify(dflt.header.lab) === '{"evap":1,"bubble":3,"dt":10,"minutes":0.2,"follow":true,"drag":0.1}');
  const orig = C.create; let made = null, madeCore = null; C.create = (o) => { made = o; madeCore = orig(o); return madeCore; };
  await L.run({ env: a, dx: 6000, box: 48000, nz: 20, dz: 1000, dt: 30, minutes: 0.2, evap: 0.3 }, {}); C.create = orig;
  check('the model is set up as the benchmark storm is: moist with ice (the rain\'s intercept 8e6, the graupel\'s 4e6 and 400 kg/m3, the evaporation of the run), periodic sides, a constant viscosity of 500 m2/s at 2 km scaled with the grid (' + made.visc.kh + ' at 6 km), a Rayleigh layer of 5 km under the lid and NO sponge along the edges (' + made.damp.top.depth + ' m; ' + made.damp.lateral + '): the periodic box has nothing at its sides that knows where they are, and a sponge made bars of echo as straight as the grid, the environment\'s own profiles',
    made.moist === true && made.ice === true && made.iceParams.n0r === 8e6 && made.iceParams.n0g === 4e6 && made.iceParams.rhog === 400 && made.iceParams.evap === 0.3 && made.bc.x === 'periodic' && made.bc.y === 'periodic' && made.visc.kh === 1500 && made.visc.kv === 1500
    && made.damp.top.depth === 5000 && made.damp.top.rate === 0.003 && made.damp.lateral === undefined && made.nx === 8 && made.ny === 8 && made.nz === 20 && made.dx === 6000 && made.dy === 6000 && made.dz === 1000 && near(made.theta(1250), 305, 1e-9) && near(made.wind.u(2000), 5, 1e-9));
  const cdz = Math.pow(0.4 / Math.log(0.5 * 1000 / 0.1), 2);
  check('the ground is in the model, with nothing asked for: a drag on the lowest level with the log law\'s cd for a lowest level of 1 km and a roughness of 0.1 m, short grass (' + madeCore.drag.cd.toFixed(6) + ' for ' + cdz.toFixed(6) + '), in the frame that moves with the storm (' + JSON.stringify(made.drag.frame) + ' for the motion of 8, 3 m/s), balanced against the environment\'s own wind (' + made.drag.balance + '), and the core has it (' + (madeCore.drag && madeCore.drag.bu > 0) + ')',
    near(madeCore.drag.cd, cdz, 1e-12) && made.drag.z0 === 0.1 && made.drag.frame.u === 8 && made.drag.frame.v === 3 && made.drag.balance === true && !!madeCore.drag && madeCore.drag.bu > 0);
  const madeList = [], coreList = []; C.create = (o) => { madeList.push(o); const c = orig(o); coreList.push(c); return c; };
  const none = await L.run({ env: a, dx: 6000, box: 48000, nz: 20, dz: 1000, dt: 30, minutes: 0.2 }, {}), free = await L.run({ env: a, dx: 6000, box: 48000, nz: 20, dz: 1000, dt: 30, minutes: 0.2, drag: 0 }, {}), z5 = await L.run({ env: a, dx: 6000, box: 48000, nz: 20, dz: 1000, dt: 30, minutes: 0.2, drag: 0.5 }, {}); C.create = orig;
  const cd5 = Math.pow(0.4 / Math.log(0.5 * 1000 / 0.5), 2);
  check('a run has the ground of short grass unless it is told otherwise (with no `drag`: a roughness of ' + madeList[0].drag.z0 + ' m, the core\'s cd ' + coreList[0].drag.cd.toFixed(6) + ' for ' + cdz.toFixed(6) + ', the header\'s ' + none.header.lab.drag + '), `drag: 0` is the free-slip floor that every run had before (no drag in the model or the core, nothing in the header: ' + madeList[1].drag + ', ' + coreList[1].drag + ', ' + ('drag' in free.header.lab) + ') and a rougher ground than 0.1 m has a bigger drag (0.5 m: the header says ' + z5.header.lab.drag + ' and the core\'s cd is ' + coreList[2].drag.cd.toFixed(6) + ' for ' + cd5.toFixed(6) + ', more than the 0.1 m\'s ' + cdz.toFixed(6) + ')',
    madeList[0].drag.z0 === 0.1 && madeList[0].drag.balance === true && near(coreList[0].drag.cd, cdz, 1e-12) && none.header.lab.drag === 0.1 && madeList[1].drag === null && coreList[1].drag === null && !('drag' in free.header.lab) && z5.header.lab.drag === 0.5 && madeList[2].drag.z0 === 0.5 && near(coreList[2].drag.cd, cd5, 1e-12) && cd5 > cdz);
  const visList = []; C.create = (o) => { visList.push(o); return orig(o); };
  const v1 = await L.run({ env: a, dx: 6000, box: 48000, nz: 20, dz: 1000, dt: 30, minutes: 0.2 }, {}), v2 = await L.run({ env: a, dx: 6000, box: 48000, nz: 20, dz: 1000, dt: 30, minutes: 0.2, visc: 0.25 }, {}), v3 = await L.run({ env: a, dx: 6000, box: 48000, nz: 20, dz: 1000, dt: 30, minutes: 0.2, visc: 0 }, {}), v4 = await L.run({ env: a, dx: 6000, box: 48000, nz: 20, dz: 1000, dt: 30, minutes: 0.2, visc: -2 }, {}), v5 = await L.run({ env: a, dx: 6000, box: 48000, nz: 20, dz: 1000, dt: 30, minutes: 0.2, visc: 'x' }, {}), v6 = await L.run({ env: a, dx: 6000, box: 48000, nz: 20, dz: 1000, dt: 30, minutes: 0.2, visc: Infinity }, {}); C.create = orig;
  check('the eddy viscosity can be scaled (`visc`, a factor of the 500 m2/s at 2 km that goes with the grid: 1500 at 6 km): a quarter of it is ' + visList[1].visc.kh + ' and the header says ' + JSON.stringify(v2.header.lab.visc) + ', none is ' + visList[2].visc.kh + ' (' + JSON.stringify(v3.header.lab.visc) + '), and a run that does not ask, or asks for less than none or for something that is not a number, has the usual ' + visList[0].visc.kh + ', ' + visList[3].visc.kh + ', ' + visList[4].visc.kh + ' and says nothing of it (' + ('visc' in v1.header.lab) + ', ' + ('visc' in v4.header.lab) + ', ' + ('visc' in v5.header.lab) + ')',
    visList[0].visc.kh === 1500 && visList[0].visc.kv === 1500 && visList[1].visc.kh === 375 && visList[1].visc.kv === 375 && v2.header.lab.visc === 0.25 && visList[2].visc.kh === 0 && visList[2].visc.kv === 0 && v3.header.lab.visc === 0 && visList[3].visc.kh === 1500 && visList[4].visc.kh === 1500 && visList[5].visc.kh === 1500 && !('visc' in v1.header.lab) && !('visc' in v4.header.lab) && !('visc' in v5.header.lab) && !('visc' in v6.header.lab));
  const one = made, oneCore = madeCore; let tmCore = null; C.create = (o) => { made = o; tmCore = orig(o); return tmCore; };
  const tm = await L.run({ env: a, dx: 6000, box: 48000, nz: 20, dz: 1000, dt: 30, minutes: 0.2, evap: 0.3, twoMoment: true, iceParams: { n0r: 4e6, xrMax: 3e-6 } }, {}); C.create = orig;
  check('the ice scheme\'s own settings can be given to a run (`iceParams` win over the Lab\'s: the rain\'s intercept 4e6 and the largest drop 3e-6 kg here, the graupel\'s and the evaporation are the run\'s) and `twoMoment` gives the core the rain\'s drop number as a variable and says so in the header (' + JSON.stringify(tm.header.lab) + '), where a run that does not ask has neither (' + one.iceParams.twoMoment + ', ' + oneCore.names.length + ' variables against ' + tmCore.names.length + ')',
    made.iceParams.n0r === 4e6 && made.iceParams.xrMax === 3e-6 && made.iceParams.n0g === 4e6 && made.iceParams.rhog === 400 && made.iceParams.evap === 0.3 && made.iceParams.twoMoment === true
    && JSON.stringify(tm.header.lab.ice) === JSON.stringify({ n0r: 4e6, xrMax: 3e-6 }) && !('ice' in v1.header.lab) && tmCore.names.indexOf('nr') >= 0 && oneCore.names.indexOf('nr') < 0 && tmCore.names.length === oneCore.names.length + 1 && one.iceParams.twoMoment === false && one.iceParams.xrMax === undefined
    && JSON.stringify(tm.header.lab) === '{"evap":0.3,"bubble":3,"dt":30,"minutes":0.2,"follow":true,"drag":0.1,"twoMoment":true,"ice":{"n0r":4000000,"xrMax":0.000003}}');
  const five = await L.run(Object.assign({}, spec, { minutes: 7, frameEvery: 5, dt: 10 }), {});
  check('frames come every `frameEvery` minutes (5: at ' + five.header.times.join(' and ') + ' of a 7 minute run)', JSON.stringify(five.header.times) === '[0,5]');
  let asked = 0; const c = await L.run(Object.assign({}, spec, { minutes: 30 }), { yield: async () => { await new Promise((res) => setTimeout(res, 0)); }, cancelled: () => ++asked >= 1 });
  let askedK = 0; const kept = await L.run(Object.assign({}, spec, { minutes: 30 }), { yield: async () => { await new Promise((res) => setTimeout(res, 0)); }, cancelled: () => (++askedK >= 3 ? 'stopped by hand' : false) });
  check('a stop that gives a reason (the page\'s "show what it has") ends the run in the same way with that reason, the frames it had and a header for them (' + kept.stopped + ', "' + kept.reason + '", ' + kept.frames.length + ' of 31 frames, ' + kept.header.times.length + ' times)', kept.stopped && kept.reason === 'stopped by hand' && kept.frames.length >= 1 && kept.frames.length < 31 && kept.header.times.length === kept.frames.length && kept.frames.length >= c.frames.length);
  check('a cancel stops it at its next breath, with the frames it had (' + c.frames.length + ' of 31) and says so (' + c.stopped + ', "' + c.reason + '")', c.stopped && c.reason === 'cancelled' && c.frames.length >= 1 && c.frames.length < 31 && c.header.times.length === c.frames.length);
  const x = await L.run(Object.assign({}, spec, { bubble: 3000, minutes: 3 }), {});
  check('a model that blows up stops with a reason and the frames before it (' + x.stopped + ', "' + x.reason + '", ' + x.frames.length + ' frames)', x.stopped && /blew up/.test(x.reason) && x.frames.length >= 1 && x.frames.length < 4);
}

/* 4b. The seeds of a run (an initiation zone's bubbles, docs/severe-plan.md 6.4): where each is, when it goes off, that the box is periodic for it, what the header says. The potential temperature at the start of every step of a
   tiny box (8 x 8 x 20 cells of 6 km by 1 km, a step of 30 s) is what is looked at, against the bubble's own formula. */
{
  const a = arrays(41, 500), DXS = 6000, NXS = 8, LS = DXS * NXS, NZS = 20, DZS = 1000;
  const mk = (o) => Object.assign({ env: a, dx: DXS, box: LS, nz: NZS, dz: DZS, dt: 30, minutes: 1, follow: false }, o);
  const grab = async (o) => {                                                                                // the potential temperature at the start of each step, and the core
    const orig = C.create; let core = null; const th = [];
    C.create = (op) => { core = orig(op); const st = core.step; core.step = (dt) => { th.push(Float64Array.from(core.S.th)); st(dt); }; return core; };
    try { const r = await L.run(mk(o), {}); return { r, core, th }; } finally { C.create = orig; }
  };
  const field = (core, q) => {                                                                               // what a seed adds, cell by cell, from the bubble's formula and the nearest of its images in the periodic box
    const f = new Float64Array(core.S.th.length), idx = core.idx, w = (d) => d - LS * Math.round(d / LS);
    for (let k = 0; k < NZS; k++) for (let j = 0; j < NXS; j++) for (let i = 0; i < NXS; i++) f[idx(i, j, k)] = L.bubble(w((i + 0.5) * DXS - q.x), w((j + 0.5) * DXS - q.y), (k + 0.5) * DZS, 0, 0, q.amp, q.rx, q.ry, q.zc, q.rz);
    return f;
  };
  const inside = (core, f) => { let s = 0; for (let k = 0; k < NZS; k++) for (let j = 0; j < NXS; j++) for (let i = 0; i < NXS; i++) s += f[core.idx(i, j, k)]; return s; };
  const maxDiff = (core, f, g) => { let m = 0; for (let k = 0; k < NZS; k++) for (let j = 0; j < NXS; j++) for (let i = 0; i < NXS; i++) { const o = core.idx(i, j, k); m = Math.max(m, Math.abs(f[o] - g[o])); } return m; };

  const d0 = await grab({ bubble: 2 }), mid = field(d0.core, { x: LS / 2, y: LS / 2, amp: 2 });
  check('with no seeds there is one bubble in the middle of the box at minute 0, of the amplitude of `bubble` (2 K): the potential temperature of the first step is its formula, cell by cell (the largest difference ' + maxDiff(d0.core, d0.th[0], mid).toExponential(1) + ', the sum ' + inside(d0.core, d0.th[0]).toFixed(3) + ' K)', maxDiff(d0.core, d0.th[0], mid) < 1e-12 && inside(d0.core, mid) > 3);
  const s2 = [{ x: 12000, y: 18000, amp: 2 }, { x: 36000, y: 30000, amp: 1 }], d2 = await grab({ seeds: s2 }), f2 = field(d2.core, s2[0]), g2 = field(d2.core, s2[1]), sum2 = f2.map((v, i) => v + g2[i]);
  check('seeds at minute 0 are all in the initial state, each at its place and amplitude, and there is none that was not asked for (the largest difference from the sum of the two bubbles ' + maxDiff(d2.core, d2.th[0], sum2).toExponential(1) + '; the cell between them holds ' + d2.th[0][d2.core.idx(4, 3, 1)].toFixed(6) + ' K)', maxDiff(d2.core, d2.th[0], sum2) < 1e-12 && inside(d2.core, f2) > 0.5 && inside(d2.core, g2) > 0.5 && d2.th[0][d2.core.idx(4, 3, 1)] === 0);
  const t1 = await grab({ seeds: [{ x: 24000, y: 24000, t: 0.5, amp: 2 }] }), t0 = await grab({ seeds: [{ x: 24000, y: 24000, t: 100, amp: 2 }] }), ft = field(t1.core, { x: 24000, y: 24000, amp: 2 }), dd = t1.th[1].map((v, i) => v - t0.th[1][i]);
  check('a seed with a time is not in the initial state (the first step has none: the largest potential temperature ' + Math.max(...t1.th[0].map(Math.abs)) + ') and is added at the first step at or after its time (30 s: the step at 30 s starts with it, and the box is as a run whose seed comes at the 100th minute, the bubble apart: the largest difference from its formula ' + maxDiff(t1.core, dd, ft).toExponential(1) + ')', Math.max(...t1.th[0].map(Math.abs)) === 0 && maxDiff(t1.core, dd, ft) < 1e-12 && inside(t1.core, ft) > 3);
  const u1 = await grab({ minutes: 1, seeds: [{ x: 12000, y: 24000, t: 1, amp: 2 }, { x: 36000, y: 24000, t: 0.5, amp: 1 }] }), u2 = await grab({ minutes: 1, seeds: [{ x: 36000, y: 24000, t: 0.5, amp: 1 }] });
  const second = field(u1.core, { x: 12000, y: 24000, amp: 2 });
  check('seeds are taken in the order of their times whatever the order of the list: the later one (60 s) comes in at the step at 60 s and nothing else changes before it (the first 2 steps of a run with only the early seed are the same, ' + maxDiff(u1.core, u1.th[1], u2.th[1]).toExponential(1) + '), and what it adds is its own bubble (' + maxDiff(u1.core, u1.th[2].map((v, i) => v - u2.th[2][i]), second).toExponential(1) + ')',
    maxDiff(u1.core, u1.th[1], u2.th[1]) === 0 && maxDiff(u1.core, u1.th[2].map((v, i) => v - u2.th[2][i]), second) < 1e-9 && inside(u1.core, second) > 1);
  const e1 = await grab({ minutes: 0.5, seeds: [{ x: 3000, y: 45000, amp: 2 }] }), fe = field(e1.core, { x: 3000, y: 45000, amp: 2 }), far = e1.core.idx(NXS - 1, NXS - 1, 1), near1 = e1.core.idx(0, NXS - 1, 1);
  check('a seed at the edge goes on at the other side, as the periodic box has it (the bubble at (3000, 45000) m reaches the cells at the east edge (' + e1.th[0][far].toFixed(4) + ' K at the north-east corner, ' + fe[far].toFixed(4) + ' by the formula) and the north: the largest difference ' + maxDiff(e1.core, e1.th[0], fe).toExponential(1) + ')', maxDiff(e1.core, e1.th[0], fe) < 1e-12 && e1.th[0][far] > 0.3 && e1.th[0][near1] > 1);
  const ts = await grab({ minutes: 0.5, seeds: [{ x: 45000, y: 24000, t: 0.5, amp: 2 }] }), hi = ts.core.idx(-1, 3, 1), lo = ts.core.idx(NXS - 1, 3, 1), hi2 = ts.core.idx(NXS, 3, 1), lo2 = ts.core.idx(0, 3, 1);
  check('a seed that goes off after the start leaves the halo of the box filled (the cells beyond the edges hold what the cells at the other side do: ' + ts.th[1][hi].toFixed(4) + ' and ' + ts.th[1][lo].toFixed(4) + ' at the west, ' + ts.th[1][hi2].toFixed(4) + ' and ' + ts.th[1][lo2].toFixed(4) + ' at the east)', ts.th[1][lo] > 0.5 && ts.th[1][hi] === ts.th[1][lo] && ts.th[1][hi2] === ts.th[1][lo2] && ts.th[1][lo2] > 0.1);
  const sz = [{ x: 24000, y: 24000, amp: 1.5, rx: 20000, ry: 8000, zc: 3500, rz: 2000 }], z1 = await grab({ minutes: 0.5, seeds: sz }), fz = field(z1.core, sz[0]);
  check('a seed has its own size and height (20 km by 8 km, 4 km deep, centred at 3.5 km): the potential temperature of the first step is the formula\'s with those, cell by cell (the largest difference ' + maxDiff(z1.core, z1.th[0], fz).toExponential(1) + '; ' + inside(z1.core, fz).toFixed(2) + ' K summed)', maxDiff(z1.core, z1.th[0], fz) < 1e-12 && inside(z1.core, fz) > 3 && z1.th[0][z1.core.idx(3, 3, 3)] > 0 && z1.th[0][z1.core.idx(3, 3, 0)] === 0);
  const hd = await L.run(mk({ minutes: 1, seeds: [{ x: 36000, y: 12000.4, t: 0.5, amp: 1 }, { x: 12000, y: 24000 }] }), {}), no = await L.run(mk({ minutes: 0.2 }), {});
  check('the header lists the seeds (x, y, t, amplitude) in the order of their times, the amplitude 3 K where none was given, and nothing about seeds when there are none (' + JSON.stringify(hd.header.lab.seeds) + '; ' + ('seeds' in no.header.lab) + ')', JSON.stringify(hd.header.lab.seeds) === '[[12000,24000,0,3],[36000,12000,0.5,1]]' && !('seeds' in no.header.lab));
  const nestFail = async (o) => { try { await L.run(mk(Object.assign({ minutes: 1, detail: { dx: 3000, from: 0, every: 1, minUpdraft: 0 }, follow: true }, o)), {}); return ''; } catch (e) { return e.message; } };
  const nf = await nestFail({ seeds: [{ t: 0.5 }] }), nok = await nestFail({ seeds: [{ x: 24000, y: 24000 }] });
  check('a nest cannot take a seed that goes off later (it is driven at its sides only), and says so ("' + nf + '"), but takes any at minute 0 ("' + nok + '")', /does not reach a nest/.test(nf) && nok === '');
}

/* 5. A storm of the dryline day: the drawing's sounding at its spot, 20 minutes at 3 km. */
{
  const d = globalThis.HFSevereDays.get('dryline'), A = globalThis.HFSevereAnalysis.create(d.drawing), sp = d.spot, env = A.sounding(sp.x, sp.y, sp.t, { dz: 100, top: 20000 }), tb = env.table;
  const a = { z: Array.from(tb.z), theta: Array.from(tb.theta), qv: Array.from(tb.qv), u: Array.from(tb.z, (z) => env.uG(z)), v: Array.from(tb.z, (z) => env.vG(z)), p0: 1000, motion: env.motion };
  const r = await L.run({ env: a, dx: 3000, box: 60000, dt: 10, minutes: 20, frameEvery: 5 }, {}), last = r.frames[r.frames.length - 1], w = r.frames.map((f) => f.wmax), z = r.frames.map((f) => f.zmax);
  check('the dryline day\'s sounding at its spot (CAPE ' + S.indices(env).mlcape.toFixed(0) + ' J/kg) grows a storm in 20 minutes at 3 km: the updraft ' + w.join(', ') + ' m/s and the strongest echo ' + z.join(', ') + ' dBZ at 0, 5, 10, 15 and 20 minutes, the track of its updraft inside the box (' + JSON.stringify(last.track) + ')',
    r.frames.length === 5 && w[0] === 0 && last.wmax > 25 && last.zmax > 45 && last.zmax < 80 && last.track[0] > 0 && last.track[0] < 60000 && last.track[1] > 0 && last.track[1] < 60000 && last.thvmin < -0.5 && !r.stopped);
  const nxr = r.header.nx, nzr = r.header.nz, wblk = new Int8Array(last.block.buffer, 4 * nxr * nxr * nzr, nxr * nxr * nzr), k5 = Math.floor(5250 / r.header.dz); let bw = -1e9, bi = 0, bj = 0;
  for (let j = 0; j < nxr; j++) for (let i = 0; i < nxr; i++) { const q = wblk[(k5 * nxr + j) * nxr + i] * 0.5; if (q > bw) { bw = q; bi = i; bj = j; } }
  check('the track of a frame is the strongest updraft at 5.25 km, where it is in box metres and how strong, as the frame\'s own winds say (' + JSON.stringify(last.track) + ' for the block\'s ' + bw + ' m/s at the cell (' + bi + ', ' + bj + '), centred at (' + (bi + 0.5) * 3000 + ', ' + (bj + 0.5) * 3000 + '))',
    near(last.track[2], bw, 0.6) && near(last.track[0], (bi + 0.5) * 3000, 3000) && near(last.track[1], (bj + 0.5) * 3000, 3000) && last.track[0] % 1500 === 0 && last.track[1] % 1500 === 0 && (last.track[0] / 1500) % 2 === 1 && (last.track[1] / 1500) % 2 === 1);
  const mid = r.frames[2].track;
  check('the storm starts where the bubble was put, the middle of the box (the strongest updraft at 10 minutes: (' + mid[0] + ', ' + mid[1] + ') m for (30000, 30000), within 12 km)', Math.hypot(mid[0] - 30000, mid[1] - 30000) < 12000);
  const pk = P.assemble(Object.assign({}, r.header, { name: 'Test', scenario: { lat0: 36.7408, lon0: -98.1279, origin: [-30000, -30000], radar: 'KVNX', clock: '16:00', tz: 'CDT' } }), r.frames.map((f) => f.block));
  const vol = pk.volume(4), fr = pk.frame(4);
  check('the pack the page makes of it reads back what was recorded: ' + pk.n + ' frames, the times, the name and the track, the reflectivity of the last frame equal to the block\'s (' + Array.from(fr.dbz).every((x, i) => x === new Int8Array(last.block.buffer, 0, 3200 * 0 + fr.dbz.length)[i]) + '), the winds in the ground\'s frame (the block\'s 0.5 m/s steps plus the box\'s motion of ' + pk.motion.u.toFixed(1) + ', ' + pk.motion.v.toFixed(1) + '), the clock at the first frame ' + pk.clock(0).text,
    pk.n === 5 && JSON.stringify(pk.times) === '[0,5,10,15,20]' && pk.name === 'Test' && JSON.stringify(pk.track[4]) === JSON.stringify(last.track) && Array.from(fr.dbz).every((x, i) => x === new Int8Array(last.block.buffer, 0, fr.dbz.length)[i]) && Array.from(fr.u).every((x, i) => x === new Int8Array(last.block.buffer, 2 * fr.dbz.length, fr.dbz.length)[i])
    && near(vol.u[1234], fr.u[1234] * 0.5 + pk.motion.u, 1e-4) && near(vol.v[777], fr.v[777] * 0.5 + pk.motion.v, 1e-4) && pk.clock(0).text === '4:00 PM' && pk.clock(20).text === '4:20 PM');
}

/* 7. The box follows its storm: the state of a periodic box moved by whole cells, the centre of an echo, and a run that keeps its storm in the middle. */
{
  /* the roll is exact: a box that is the same everywhere does not care where its storm is. Two identical cores from a bubble, one rolled by (3, -2) cells part-way: the same fields at the end, moved by (3, -2) */
  const nx = 10, ny = 8, nz = 10, dz = 500, a = arrays(nz + 1, dz), e = L.envOf(a), mk = () => {
    const core = C.create({ nx, ny, nz, dx: 3000, dy: 3000, dz, moist: true, ice: true, iceParams: { n0g: 4e6, rhog: 400, n0r: 8e6, evap: 1 }, theta: e.theta, qv: e.qv, wind: { u: e.u, v: e.v }, bc: { x: 'periodic', y: 'periodic' }, visc: { kh: 1500, kv: 1500 }, damp: { top: { depth: 3000, rate: 0.003 } } });
    const idx = core.idx; for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const o = idx(i, j, k); core.S.th[o] = L.bubble((i + 0.5) * 3000, (j + 0.5) * 3000, (k + 0.5) * dz, 4 * 3000, 3 * 3000, 4); core.S.u[o] = core.base.ubc[k]; core.S.v[o] = core.base.vbc[k]; }
    core.fill(); return core;
  };
  const plain = mk(), rolled = mk(), SX = 3, SY = -2, md = (a2, n) => ((a2 % n) + n) % n;
  for (let s = 0; s < 14; s++) { plain.step(10); rolled.step(10); if (s === 6) { L.roll(rolled, SX, SY); } }
  let worst = 0, scale = 0, where = '';
  for (const name of plain.names) {
    const kmax = name === 'w' ? nz : nz - 1; let wn = 0, sn = 0;
    for (let k = 0; k <= kmax; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const p = plain.S[name][plain.idx(md(i - SX, nx), md(j - SY, ny), k)], q = rolled.S[name][rolled.idx(i, j, k)]; wn = Math.max(wn, Math.abs(p - q)); sn = Math.max(sn, Math.abs(p)); }
    if (wn / (sn || 1) > worst) { worst = wn / (sn || 1); where = name; } scale = Math.max(scale, sn);
  }
  check('rolling a box of 10 x 8 x 10 cells by (3, -2) part-way through 14 steps changes nothing but where its storm is: every field of the rolled run is the plain run\'s, moved, to ' + worst.toExponential(1) + ' of its size (the worst is ' + where + '; the strongest field is ' + scale.toFixed(2) + '), with a storm in it (' + plain.diag().wmax.toFixed(1) + ' m/s)',
    worst < 1e-9 && scale > 0.5 && plain.diag().wmax > 1);
  let pw = 0; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pw = Math.max(pw, Math.abs(plain.precip[md(j - SY, ny) * nx + md(i - SX, nx)] - rolled.precip[j * nx + i]));
  check('the rain that has reached the ground is moved with it (the accumulated precipitation differs by ' + pw.toExponential(1) + ' mm, of ' + Math.max(...plain.precip).toExponential(1) + ')', pw < 1e-12 && Math.max(...plain.precip) >= 0);
  const c0 = mk(); c0.S.th[c0.idx(2, 1, 3)] = 7; c0.S.u[c0.idx(0, 5, 2)] = 3; c0.S.w[c0.idx(9, 7, 5)] = 4; c0.S.qr[c0.idx(9, 7, 0)] = 2e-3; c0.precip[7 * nx + 9] = 5; c0.precipS[0] = 6; c0.precipG[4 * nx + 4] = 7; L.roll(c0, 1, 2);
  check('a roll by one east and two north puts a mark at (2, 1, 3) at (3, 3, 3), one in the u of face (0, 5) at (1, 7), one in the w of (9, 7, 5) at (0, 1, 5), one in the rain at (9, 7, 0) at (0, 1, 0) and in the three precipitation sums at the cells the same way: (9, 7) to (0, 1), (0, 0) to (1, 2), (4, 4) to (5, 6) (' + c0.S.th[c0.idx(3, 3, 3)] + ', ' + c0.S.u[c0.idx(1, 7, 2)] + ', ' + c0.S.w[c0.idx(0, 1, 5)] + ', ' + c0.S.qr[c0.idx(0, 1, 0)] + '; ' + c0.precip[1 * nx + 0] + ', ' + c0.precipS[2 * nx + 1] + ', ' + c0.precipG[6 * nx + 5] + ')',
    c0.S.th[c0.idx(3, 3, 3)] === 7 && c0.S.th[c0.idx(2, 1, 3)] === 0 && c0.S.u[c0.idx(1, 7, 2)] === 3 && c0.S.w[c0.idx(0, 1, 5)] === 4 && c0.S.qr[c0.idx(0, 1, 0)] === 2e-3 && c0.precip[1 * nx + 0] === 5 && c0.precipS[2 * nx + 1] === 6 && c0.precipG[6 * nx + 5] === 7);
  const c1 = mk(); c1.S.th[c1.idx(4, 4, 4)] = 3; const before = c1.getState(); L.roll(c1, 0, 0); const same = c1.S.th[c1.idx(4, 4, 4)] === 3; L.roll(c1, nx, -ny); const full = c1.S.th[c1.idx(4, 4, 4)] === 3;
  check('a roll by nothing, and by a whole box, leaves the state alone (' + same + ', ' + full + ')', same && full && before.nx === nx);

  /* where the echo is: 42 x 36 x 10 cells of 500 m (not square, so that a row is never taken for a column); 50 dBZ blobs */
  const NX = 42, NY = 36, NZ = 10, blk = (cells) => { const b = new Uint8Array(5 * NX * NY * NZ), d = new Int8Array(b.buffer, 0, NX * NY * NZ); d.fill(-30); for (const [i, j, k, v] of cells) d[(k * NY + j) * NX + i] = v; return b; };
  const four = (i0, j0, k, v) => [[i0, j0, k, v], [i0 + 1, j0, k, v], [i0, j0 + 1, k, v], [i0 + 1, j0 + 1, k, v]], ce = (cells) => L.centring(blk(cells), NX, NY, NZ, 500);
  const c2 = ce(four(30, 5, 2, 50));
  check('a blob of 2 x 2 cells at columns 30 and 31 and rows 5 and 6 (its middle at 31.0 and 6.0 of a box whose middle is 21.0) is moved by -10 east and 12 north to the middle (the box\'s middle is row 18.0: ' + JSON.stringify(c2) + ')', c2 && c2.sx === -10 && c2.sy === 12);
  const c3 = ce([[41, 20, 2, 50], [0, 20, 2, 50], [41, 21, 2, 50], [0, 21, 2, 50]]);
  check('a blob cut by the east edge (columns 41 and 0, rows 20 and 21) is one blob: its middle is at the edge, 0.0, so it is 21 cells from the middle of the box and not 21 - 41.5, and rows 20 and 21 are 3 rows above the middle (' + JSON.stringify(c3) + ')', c3 && Math.abs(c3.sx) === 21 && c3.sy === -3);
  const c4 = ce(four(10, 10, 2, 60).slice(0, 2).concat(four(10, 11, 2, 60).slice(0, 2)).concat([[30, 10, 2, 35], [31, 10, 2, 35]]));
  check('the echo counts by its power: two cells of 60 dBZ at columns 10 and 11 in two rows and two of 35 dBZ far off make the middle of the strong ones (11.0 and 11.0: moved by 10 east and 7 north, not by 0 as a plain mean of the cells would say) (' + JSON.stringify(c4) + ')', c4 && c4.sx === 10 && c4.sy === 7);
  const cp = ce(four(20, 20, 2, 45).concat(four(32, 20, 2, 50)));
  check('the weight is the power, 10^(dBZ/10): of two blobs of 4 cells, 45 dBZ at columns 20 and 21 and 50 dBZ at 32 and 33, the stronger counts 3.2 times as much, which puts the middle of the echo at column 30.9 (a shift of -10; by amplitude, 1.8 times, it would be -8, by the cells alone -6) and the rows at 20 and 21 are 3 above the middle (' + JSON.stringify(cp) + ')', cp && cp.sx === -10 && cp.sy === -3);
  check('under three cells of 30 dBZ is no storm (null for ' + JSON.stringify(ce([[3, 3, 2, 50], [4, 3, 2, 50]])) + '), and cells under 30 dBZ are no echo (' + JSON.stringify(ce(four(30, 5, 2, 29))) + ') and 30 dBZ is (' + JSON.stringify(ce(four(30, 5, 2, 30))) + '); the first of 3 is a storm', ce([[3, 3, 2, 50], [4, 3, 2, 50]]) === null && ce(four(30, 5, 2, 29)) === null && ce(four(30, 5, 2, 30)) !== null && ce([[3, 3, 2, 50], [4, 3, 2, 50], [3, 4, 2, 50]]) !== null);
  const lv = [0, 1, 7, 8].map((k) => ce(four(30, 5, k, 50)));
  check('only the levels from 500 m to 3.5 km are looked at (levels 0, 1, 7 and 8 of 500 m: ' + lv.map((x) => (x ? 'storm' : 'none')).join(', ') + ')', lv[0] === null && lv[1] !== null && lv[2] !== null && lv[3] === null);
  const two = ce(four(10, 20, 2, 50).concat(four(31, 20, 2, 50))), twoY = ce(four(10, 5, 2, 50).concat(four(10, 23, 2, 50))), wide = ce(four(10, 20, 2, 50).concat(four(28, 20, 2, 50))), mid = ce(four(10, 20, 2, 50).concat(four(22, 20, 2, 50)));
  check('two storms half a box apart, in a column or in a row, are not one (the mean of their angles means nothing: ' + JSON.stringify(two) + ', ' + JSON.stringify(twoY) + '), nor are two 18 columns apart (the mean vector is 0.22 long, under 0.3: ' + JSON.stringify(wide) + '), but two 12 columns apart are (0.62: ' + JSON.stringify(mid) + ') and two close ones are (' + JSON.stringify(ce(four(10, 20, 2, 50).concat(four(14, 20, 2, 50)))) + ')',
    two === null && twoY === null && wide === null && mid !== null && ce(four(10, 20, 2, 50).concat(four(14, 20, 2, 50))) !== null);
  const cy = ce(four(20, 30, 2, 50)), cy2 = ce(four(20, 5, 2, 50));
  check('rows are moved on their own: a blob above the middle (rows 30 and 31) goes south by 13 (' + JSON.stringify(cy) + '), one below (rows 5 and 6) north by 12 (' + JSON.stringify(cy2) + ') and neither moves east or west', cy && cy.sy === -13 && cy.sx === 0 && cy2 && cy2.sy === 12 && cy2.sx === 0);
  const blkz = (nz) => (cells) => { const b = new Uint8Array(5 * NX * NY * nz), d = new Int8Array(b.buffer, 0, NX * NY * nz); d.fill(-30); for (const [i, j, k, v] of cells) d[(k * NY + j) * NX + i] = v; return b; };
  const band = (nz, dz, ks) => ks.map((k) => (L.centring(blkz(nz)(four(30, 5, k, 50)), NX, NY, nz, dz) ? 'storm' : 'none')).join(' ');
  const b250 = band(18, 250, [0, 1, 2, 14, 15]), b1000 = band(6, 1000, [0, 3, 4]);
  check('the levels are those of the grid, in metres: with levels of 250 m the band is the levels 2 to 14 (0, 1, 2, 14, 15: ' + b250 + '), with levels of 1 km it is 0 to 3 (0, 3, 4: ' + b1000 + ')', b250 === 'none none storm storm none' && b1000 === 'storm storm none');

  /* a run that follows its storm: the dryline day's storm moves 13 m/s north of what Bunkers' estimate says, which takes it 5 cells of 3 km out of the middle in 30 minutes; with `follow` it stays within a cell or two */
  const d = globalThis.HFSevereDays.get('dryline'), A = globalThis.HFSevereAnalysis.create(d.drawing), sp = d.spot, env = A.sounding(sp.x, sp.y, sp.t, { dz: 100, top: 20000 }), tb = env.table;
  const ar = { z: Array.from(tb.z), theta: Array.from(tb.theta), qv: Array.from(tb.qv), u: Array.from(tb.z, (z) => env.uG(z)), v: Array.from(tb.z, (z) => env.vG(z)), p0: 1000, motion: env.motion };
  const fol = await L.run({ env: ar, dx: 3000, box: 60000, dt: 10, minutes: 30, frameEvery: 5 }, {}), non = await L.run({ env: ar, dx: 3000, box: 60000, dt: 10, minutes: 30, frameEvery: 5, follow: false }, {});
  const off = (r) => r.frames.map((f) => { const c = L.centring(f.block, r.header.nx, r.header.ny, r.header.nz, r.header.dz); return c ? Math.max(Math.abs(c.sx), Math.abs(c.sy)) : -1; });
  const of = off(fol), on = off(non);
  check('with `follow` the echo stays within 1 cell of the middle after its first move (the cells it would take to centre it, frame by frame: ' + of.join(', ') + ') and without it the storm drifts off (' + on.join(', ') + ')', of.slice(5).every((x) => x >= 0 && x <= 1) && on[6] >= 4 && Math.max(...of) <= 3);
  /* a worker hands each frame's block to the page (a transfer) and the block is gone from the worker: the run must have looked at it first */
  const gone = await L.run({ env: ar, dx: 4000, box: 60000, dt: 10, minutes: 20, frameEvery: 5 }, { frame: (rec) => { structuredClone(rec.block.buffer, { transfer: [rec.block.buffer] }); } });
  check('a frame that the hook has handed over (its buffer transferred and detached, as the Lab\'s worker does) does not stop the run, and the box still follows (' + gone.frames.length + ' frames, stopped: ' + gone.stopped + ', drift ' + JSON.stringify(gone.header.drift.slice(-1)) + ')', gone.frames.length === 5 && !gone.stopped && gone.header.drift.some((q) => q[0] !== 0 || q[1] !== 0));
  const dr = fol.header.drift;
  check('the header says where the box\'s corner is, for each frame (' + dr.length + ' of ' + fol.frames.length + ': ' + JSON.stringify(dr.slice(0, 6)) + '...): none at the first frames, whole cells of 3 km after, and none at all without `follow` (' + JSON.stringify(non.header.drift.every((q) => q[0] === 0 && q[1] === 0)) + ')',
    dr.length === fol.frames.length && dr[0][0] === 0 && dr[0][1] === 0 && dr[1][0] === 0 && dr[3][0] === 0 && dr[3][1] === 0 && dr.every((q) => q[0] % 3000 === 0 && q[1] % 3000 === 0) && dr[fol.frames.length - 1][1] >= 9000 && non.header.drift.every((q) => q[0] === 0 && q[1] === 0) && fol.header.lab.follow === true && non.header.lab.follow === false);
  check('the drift of a frame is the sum of the shifts made before it: the first frame at which the echo was found (15 minutes) was moved after being recorded, so frame 3 has none and frame 4 has it (' + JSON.stringify(dr[3]) + ' and ' + JSON.stringify(dr[4]) + ')', dr[3][0] === 0 && dr[3][1] === 0 && (dr[4][0] !== 0 || dr[4][1] !== 0));
  /* the box that follows must put the storm where the box that does not follow would have it: the storm's place on the ground, as the box's corner (the header's drift) plus the echo's place in the box, east and north, frame by frame */
  const gd = (r, f) => { const c = L.centring(f.block, r.header.nx, r.header.ny, r.header.nz, r.header.dz), q = r.header.drift[f.i]; return c ? [q[0] - c.sx * 3000, q[1] - c.sy * 3000] : null; };
  const gf = fol.frames.map((f) => gd(fol, f)), gn = non.frames.map((f) => gd(non, f)), both = gf.map((x, i) => (x && gn[i] ? i : -1)).filter((i) => i >= 0);
  const gap = Math.max(...both.map((i) => Math.max(Math.abs(gf[i][0] - gn[i][0]), Math.abs(gf[i][1] - gn[i][1])))), last = both[both.length - 1];
  check('the storm is on the ground where it would be without the roll: its place from the drift and the box (east, north, m) matches that of the run that is never moved to within a cell of 3 km, at each of the ' + both.length + ' frames with an echo in both (the worst is ' + gap + ' m; at the end ' + JSON.stringify(gf[last]) + ' and ' + JSON.stringify(gn[last]) + ': a storm that has gone west by 2 cells and north by 5)',
    both.length >= 4 && gap <= 3000 && Math.abs(gn[last][0]) >= 6000 && gn[last][1] >= 12000 && Math.sign(dr[last][0]) === Math.sign(gn[last][0]) && Math.sign(dr[last][1]) === Math.sign(gn[last][1]));
  const hd = Object.assign({}, fol.header, { scenario: { lat0: 36, lon0: -98, origin: [1000, 2000], radar: 'KVNX', clock: '15:00', tz: 'CDT' } }), pk = P.assemble(hd, fol.frames.map((f) => f.block));
  const c4m = pk.corner(fol.header.times[4]), c0m = pk.corner(fol.header.times[0]), cb = pk.corner(fol.header.times[4] + 2.5), mo = fol.header.motion;
  check('the pack puts the box where its motion and the drift say: frame 4 at the origin plus the motion for 20 minutes plus the drift (' + c4m.map((v) => v.toFixed(0)).join(', ') + ' for ' + (1000 + mo.u * 1200 + dr[4][0]).toFixed(0) + ', ' + (2000 + mo.v * 1200 + dr[4][1]).toFixed(0) + '), frame 0 at the origin (' + c0m.join(', ') + '), and between two frames the drift of the earlier (' + cb.map((v) => v.toFixed(0)).join(', ') + ')',
    near(c4m[0], 1000 + mo.u * 1200 + dr[4][0], 1e-6) && near(c4m[1], 2000 + mo.v * 1200 + dr[4][1], 1e-6) && c0m[0] === 1000 && c0m[1] === 2000 && near(cb[0], 1000 + mo.u * 60 * (fol.header.times[4] + 2.5) + dr[4][0], 1e-6) && near(cb[1], 2000 + mo.v * 60 * (fol.header.times[4] + 2.5) + dr[4][1], 1e-6));
  const pk0 = P.assemble(Object.assign({}, hd, { drift: undefined }), non.frames.map((f) => f.block)), cn = pk0.corner(non.header.times[4]);
  check('a pack with no drift is the old one: the corner is the origin plus the motion (' + cn.map((v) => v.toFixed(0)).join(', ') + ')', near(cn[0], 1000 + mo.u * 1200, 1e-6) && near(cn[1], 2000 + mo.v * 1200, 1e-6));

  const pf = P.stormPath(fol.header), pn = P.stormPath(non.header), both2 = pf.pts.map((p, i) => i).filter((i) => pf.pts[i].w >= 5 && pn.pts[i].w >= 5), pgap = Math.max(...both2.map((i) => Math.max(Math.abs(pf.pts[i].x - pn.pts[i].x), Math.abs(pf.pts[i].y - pn.pts[i].y))));
  check('the path of the run whose box follows its storm is the path of the run whose box does not (the dryline day for 30 minutes, ' + both2.length + ' frames with an updraft of 5 m/s or more: the worst difference is ' + pgap + ' m; at the end ' + Math.round(pf.pts[pf.pts.length - 1].x) + ', ' + Math.round(pf.pts[pf.pts.length - 1].y) + ' m and ' + Math.round(pn.pts[pn.pts.length - 1].x) + ', ' + Math.round(pn.pts[pn.pts.length - 1].y) + '), the pack says the same (' + (JSON.stringify(pk.path()) === JSON.stringify(P.stormPath(hd))) + '), and the middle of its mature part is where the nominal motion does not put it (' + Math.round(pf.mid.x) + ', ' + Math.round(pf.mid.y) + ' m from ' + pf.mid.n + ' frames, against ' + Math.round(mo.u * 3000) + ', ' + Math.round(mo.v * 3000) + ' at 50 minutes)',
    both2.length >= 4 && pgap <= 3000 && JSON.stringify(pk.path()) === JSON.stringify(P.stormPath(hd)) && pf.mid.n >= 2 && Math.hypot(pf.mid.x - mo.u * 3000, pf.mid.y - mo.v * 3000) > 5000 && pf.pts[0].x === 0 && pf.pts[0].y === 0 && near(pf.pts[1].x, mo.u * 300, 1) && near(pf.pts[1].y, mo.v * 300, 1));
}

/* 6. The assembler on its own: small known blocks, the refusal of a block of the wrong size. */
{
  const h = { v: 1, nx: 3, ny: 2, nz: 2, dx: 1000, dz: 500, floor: -30, times: [0, 5], motion: { u: 10, v: -4 }, base: { z: [250, 750], u: [1, 2], v: [3, 4] }, track: [[1500, 1000, 5], [1500, 1000, 8]], scale: { wind: 0.5, vz: 0.25 }, name: 'Tiny', scenario: { lat0: 36, lon0: -98, origin: [0, 0], radar: 'KVNX', clock: '15:00', tz: 'CDT' } }, per = 12;
  const blocks = [0, 1].map((f) => Uint8Array.from({ length: 5 * per }, (_, i) => (i * 7 + f * 31 + 3) & 127));
  const pk = P.assemble(h, blocks), f1 = pk.frame(1), vo = pk.volume(1);
  check('a known two-frame pack of 3 x 2 x 2 cells reads back byte for byte (reflectivity ' + Array.from(f1.dbz).join(',') + ', fall speed, the three winds), and a volume has the winds in the ground\'s frame: u = 0.5 x the byte + 10, v = 0.5 x the byte - 4, w = 0.5 x the byte, the fall speed 0.25 x the byte',
    Array.from(f1.dbz).every((x, i) => x === blocks[1][i]) && Array.from(f1.vz).every((x, i) => x === blocks[1][per + i]) && Array.from(f1.u).every((x, i) => x === blocks[1][2 * per + i]) && Array.from(f1.v).every((x, i) => x === blocks[1][3 * per + i]) && Array.from(f1.w).every((x, i) => x === blocks[1][4 * per + i])
    && vo.u.every((x, i) => near(x, blocks[1][2 * per + i] * 0.5 + 10, 1e-5)) && vo.v.every((x, i) => near(x, blocks[1][3 * per + i] * 0.5 - 4, 1e-5)) && vo.w.every((x, i) => near(x, blocks[1][4 * per + i] * 0.5, 1e-5)) && vo.vz.every((x, i) => near(x, blocks[1][per + i] * 0.25, 1e-5)));
  const sm = P.assemble(h, blocks).sample(1, 1500, 500, 600);
  check('a point of the box is the cell\'s own values (x 1500 m, y 500 m, z 600 m: cell (1, 0, 1): dBZ ' + (sm && sm.dbz) + ')', sm && sm.dbz === blocks[1][(1 * 2 + 0) * 3 + 1] && near(sm.u, blocks[1][2 * per + (1 * 2 + 0) * 3 + 1] * 0.5 + 10, 1e-5));
  let err = ''; try { P.assemble(h, [blocks[0], blocks[1].subarray(0, 50)]); } catch (e) { err = e.message; }
  check('a block of the wrong size is refused and says which (' + err + ')', /frame 1 has 50 bytes, not 60/.test(err));
  check('a pack of version 1 has no offsets in its header (they are for the packs whose frames are not all as long: ' + JSON.stringify(pk.h.offsets) + ')', pk.h.offsets === undefined && pk.h.nests === undefined);
  /* a pack with a nest that is not square (2 cells east, 3 north, 1 level), in the second frame only: the block of that frame is the box's 60 bytes and the nest's 30, the offsets are made from what the blocks measure */
  const h2 = Object.assign({}, h, { v: 2, nests: [{ nx: 2, ny: 3, nz: 1, dx: 500, dz: 500, scale: { wind: 1, vz: 0.25 }, frame: { u: 1, v: 2 } }], fn: [[], [[0, 1000, 500]]] });
  const b2 = [blocks[0], Uint8Array.from({ length: 5 * per + 30 }, (_, i) => (i * 5 + 11) & 127)], pk2 = P.assemble(h2, b2), v2 = pk2.volume(1), nn = v2.nests && v2.nests[0], nv = nn && nn.vol;
  let e2 = ''; try { P.assemble(h2, [blocks[0], blocks[1]]); } catch (e) { e2 = e.message; }
  let e3 = ''; try { P.assemble(h2, [Uint8Array.from({ length: 5 * per + 30 }), b2[1]]); } catch (e) { e3 = e.message; }
  check('a pack whose second frame has a nest of 2 x 3 x 1 cells has offsets from the lengths of the blocks (' + JSON.stringify(pk2.h.offsets) + ', for 0, 60 and 150), the frame\'s bytes are its block (' + pk2.frameBytes(1).length + '), the first frame has no nest and the second has it at (1000, 500) with its grid, its winds in whole metres plus the box\'s motion and its own frame\'s (' + (nv && nv.u[0]) + ' for ' + (b2[1][5 * per + 2 * 6] + 10 + 1) + '), and a frame without the nest\'s bytes, or one with them that has no nest, is refused (' + e2 + '; ' + e3 + ')',
    JSON.stringify(pk2.h.offsets) === '[0,60,150]' && pk2.frameBytes(1).length === 90 && pk2.volume(0).nests === undefined && nn && nn.x === 1000 && nn.y === 500 && nv.nx === 2 && nv.ny === 3 && nv.nz === 1 && nv.dx === 500 && nv.dy === 500 && nv.dbz.length === 6 && Array.from(nv.dbz).every((x, i) => x === b2[1][5 * per + i])
    && near(nv.u[0], b2[1][5 * per + 12] * 1 + 10 + 1, 1e-5) && near(nv.v[5], b2[1][5 * per + 3 * 6 + 5] * 1 - 4 + 2, 1e-5) && near(nv.w[4], b2[1][5 * per + 4 * 6 + 4] * 1, 1e-5) && /frame 1 has 60 bytes, not 90/.test(e2) && /frame 0 has 90 bytes, not 60/.test(e3));
}

/* 8. The detail nest (docs/severe-plan.md 6.8): a finer core in the middle of the box from a minute on. The recorder's options, the box moved with its nest, a run that makes one (the box records what it records without it, the nest has the box's time, follows
      the storm and is in the pack, the finer core is what a replay by hand makes of it), and the refusals. */
{
  const dryEnv = () => {
    const d = globalThis.HFSevereDays.get('dryline'), A = globalThis.HFSevereAnalysis.create(d.drawing), sp = d.spot, env = A.sounding(sp.x, sp.y, sp.t, { dz: 100, top: 20000 }), tb = env.table;
    return { z: Array.from(tb.z), theta: Array.from(tb.theta), qv: Array.from(tb.qv), u: Array.from(tb.z, (z) => env.uG(z)), v: Array.from(tb.z, (z) => env.vG(z)), p0: 1000, motion: env.motion };
  };
  const eqBytes = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };

  /* 8a. The recorder's options: the wind step, the levels kept, a place in a block to write to. */
  {
    const nx = 6, ny = 5, nz = 8, a = arrays(nz + 1, 500), e = L.envOf(a);
    const core = C.create({ nx, ny, nz, dx: 1000, dy: 1000, dz: 500, moist: true, ice: true, theta: e.theta, qv: e.qv, wind: { u: e.u, v: e.v }, bc: { x: 'periodic', y: 'periodic' } });
    const st = core.S, idx = core.idx, sy = idx(0, 1, 0) - idx(0, 0, 0), sz = idx(0, 0, 1) - idx(0, 0, 0), per = nx * ny * nz, at = (k, j, i) => (k * ny + j) * nx + i;
    core.fill(); st.u.fill(0); st.v.fill(0); st.w.fill(0);
    const o = idx(2, 3, 1); st.qr[o] = 2e-3; st.u[o] = 9; st.u[o + 1] = 11; st.v[o] = -3; st.v[o + sy] = -3; st.w[o] = 70; st.w[o + sz] = 70;
    const o2 = idx(4, 1, 2); st.u[o2] = 200; st.u[o2 + 1] = 200; st.v[o2] = -200; st.v[o2 + sy] = -200;
    const r1 = L.recorder(core, { wind: 1 })(), r5 = L.recorder(core)(), a1 = (r, c) => new Int8Array(r.block.buffer, c * per, per);
    check('with `wind: 1` the winds are in whole metres per second (10, -3 and 70 m/s in the cell: ' + a1(r1, 2)[at(1, 3, 2)] + ', ' + a1(r1, 3)[at(1, 3, 2)] + ', ' + a1(r1, 4)[at(1, 3, 2)] + ') and held at 127 (200 m/s: ' + a1(r1, 2)[at(2, 1, 4)] + ', ' + a1(r1, -1 + 4)[at(2, 1, 4)] + '), where the half-metre steps of the default have 20, -6 and the 70 m/s held at 127 (' + a1(r5, 2)[at(1, 3, 2)] + ', ' + a1(r5, 3)[at(1, 3, 2)] + ', ' + a1(r5, 4)[at(1, 3, 2)] + ')',
      a1(r1, 2)[at(1, 3, 2)] === 10 && a1(r1, 3)[at(1, 3, 2)] === -3 && a1(r1, 4)[at(1, 3, 2)] === 70 && a1(r1, 2)[at(2, 1, 4)] === 127 && a1(r1, 3)[at(2, 1, 4)] === -127 && a1(r5, 2)[at(1, 3, 2)] === 20 && a1(r5, 3)[at(1, 3, 2)] === -6 && a1(r5, 4)[at(1, 3, 2)] === 127);
    st.qr[idx(1, 1, 6)] = 8e-3;
    const full = L.recorder(core)(), win = L.recorder(core, { nz: 3 })(), p3 = nx * ny * 3;
    const slice = (r, p, c) => new Int8Array(r.block.buffer, c * p, p);
    check('`nz: 3` keeps the lowest three levels of each of the five arrays (' + win.block.length + ' bytes for ' + 5 * p3 + ', each array the first third of the whole frame\'s), and the strongest echo is still that of all the levels (' + win.zmax + ' dBZ from level 6, for the whole frame\'s ' + full.zmax + ', and the window\'s own ' + Math.max(...slice(win, p3, 0)) + ')',
      win.block.length === 5 * p3 && [0, 1, 2, 3, 4].every((c) => eqBytes(slice(win, p3, c), new Int8Array(full.block.buffer, c * per, p3))) && win.zmax === full.zmax && full.zmax > Math.max(...slice(win, p3, 0)) + 3 && Math.max(...slice(win, p3, 0)) > -30);
    const big = new Uint8Array(37 + 5 * per + 11).fill(255), rb = L.recorder(core)(big, 37), plain = L.recorder(core)();
    check('`record(into, at)` writes the frame into the block given from the byte `at` and returns that block, touching no other byte (' + (rb.block === big) + ', the 37 before and the 11 after are 255: ' + (big.subarray(0, 37).every((x) => x === 255) && big.subarray(37 + 5 * per).every((x) => x === 255)) + ', the frame is the one a new block has: ' + eqBytes(big.subarray(37, 37 + 5 * per), plain.block) + ', the strongest echo ' + rb.zmax + ' for ' + plain.zmax + ')',
      rb.block === big && big.subarray(0, 37).every((x) => x === 255) && big.subarray(37 + 5 * per).every((x) => x === 255) && eqBytes(big.subarray(37, 37 + 5 * per), plain.block) && rb.zmax === plain.zmax);
    const whole = new Uint8Array(3 + 20 + 5 * per + 9).fill(255), sub = new Uint8Array(whole.buffer, 3, 20 + 5 * per + 9), rs = L.recorder(core)(sub, 20), tail = whole;
    check('a block that is a view into a larger buffer is written at its own start plus `at` (the frame is at the 20th byte of the view: ' + eqBytes(new Uint8Array(sub.buffer, 3 + 20, 5 * per), plain.block) + '; the 3 bytes before the view, the 20 in front of the frame and the 9 after it are untouched: ' + (tail.subarray(0, 23).every((x) => x === 255) && tail.subarray(23 + 5 * per).every((x) => x === 255)) + ')',
      rs.block === sub && eqBytes(new Uint8Array(sub.buffer, 3 + 20, 5 * per), plain.block) && tail.subarray(0, 23).every((x) => x === 255) && tail.subarray(23 + 5 * per).every((x) => x === 255));
  }

  /* 8a2. The recorded window: the box's physics is all of it, the pack records its middle (`window`). The recorder keeps the columns of a window and nothing else; a run with a window is the run without it (the physics, the shifts that keep the storm in the
         middle, read from the whole box and not from the window, the nest's place) with a pack that is the middle of the other's, and says so in its header. */
  {
    const nx = 8, ny = 6, nz = 5, a = arrays(nz + 1, 500), e = L.envOf(a);
    const core = C.create({ nx, ny, nz, dx: 1000, dy: 1000, dz: 500, moist: true, ice: true, theta: e.theta, qv: e.qv, wind: { u: e.u, v: e.v }, bc: { x: 'periodic', y: 'periodic' } });
    const st = core.S, idx = core.idx, sy = idx(0, 1, 0) - idx(0, 0, 0), sz = idx(0, 0, 1) - idx(0, 0, 0);
    core.fill(); st.u.fill(0); st.v.fill(0); st.w.fill(0);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const o = idx(i, j, k); st.qr[o] = 1e-4 * (1 + i + 3 * j + k); st.u[o] = i - 3 * j + k; st.v[o] = 2 * i + j - k; st.w[o] = 1 + (i * j) % 5; }
    st.qr[idx(0, 0, 2)] = 8e-3;                                                                                  // (the strongest echo of all is a column outside the window)
    const full = L.recorder(core)(), win = L.recorder(core, { wx: 4, wy: 3, i0: 2, j0: 1 })(), per = nx * ny * nz, pw = 4 * 3 * nz;
    let same = 0, tot = 0, zin = -99; const dbzF = new Int8Array(full.block.buffer, 0, per);
    for (let c = 0; c < 5; c++) for (let k = 0; k < nz; k++) for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) {
      const w = (c === 1 ? new Uint8Array(win.block.buffer, c * pw, pw) : new Int8Array(win.block.buffer, c * pw, pw))[(k * 3 + j) * 4 + i], f = (c === 1 ? new Uint8Array(full.block.buffer, c * per, per) : new Int8Array(full.block.buffer, c * per, per))[(k * ny + (j + 1)) * nx + (i + 2)];
      tot++; if (w === f) same++;
    }
    for (let k = 0; k < nz; k++) for (let j = 1; j < 4; j++) for (let i = 2; i < 6; i++) zin = Math.max(zin, dbzF[(k * ny + j) * nx + i]);
    check('a recorder with a window (4 x 3 columns from the column 2, 1) keeps those columns of each of the five arrays and nothing else (' + win.block.length + ' bytes for ' + 5 * pw + '; ' + same + ' of ' + tot + ' values are the whole frame\'s at their place), and its strongest echo is the window\'s (' + win.zmax + ' dBZ, the whole frame\'s being ' + full.zmax + ' from a column outside)',
      win.block.length === 5 * pw && same === tot && tot === 5 * nz * 12 && win.zmax === zin && full.zmax > zin + 3);
    const dry = dryEnv(), spec = { env: dry, dx: 3000, box: 60000, dt: 10, minutes: 25, frameEvery: 5, seeds: [{ x: 15000, y: 30000 }] }, rf = await L.run(spec, {}), rw = await L.run(Object.assign({}, spec, { window: 36000 }), {});            // (the storm starts 3 km from the window's west edge: part of its echo is out of it)
    const n0 = 20, nw0 = 12, w0 = 4, per0 = 5 * 40 * n0 * n0, perw = 5 * 40 * nw0 * nw0;
    let ok = 0, all = 0; for (let f = 0; f < rf.frames.length; f++) for (let c = 0; c < 5; c++) for (let k = 0; k < 40; k++) for (let j = 0; j < nw0; j++) for (let i = 0; i < nw0; i++) {
      const pf = per0 / 5, pw2 = perw / 5; all++; if (rw.frames[f].block[c * pw2 + (k * nw0 + j) * nw0 + i] === rf.frames[f].block[c * pf + (k * n0 + j + w0) * n0 + i + w0]) ok++;
    }
    const inW = (v) => v >= 12000 && v < 48000, tr = rf.frames.map((fr, f) => [rw.frames[f].track[0] - (fr.track[0] - w0 * 3000), rw.frames[f].track[1] - (fr.track[1] - w0 * 3000)]).filter((v, f) => rf.frames[f].track[2] > 0 && inW(rf.frames[f].track[0]) && inW(rf.frames[f].track[1]));
    check('a run with `window: 36000` in a box of 60 km (12 of 20 cells of 3 km) records the middle of what the run without it records, byte for byte (' + ok + ' of ' + all + ' values of ' + rf.frames.length + ' frames), because the physics is the same (the drift that keeps the storm in the middle, ' + JSON.stringify(rw.header.drift) + ', is the same as ' + JSON.stringify(rf.header.drift) + ' and not zero: ' + rf.header.drift.some((d) => d[0] !== 0 || d[1] !== 0) + '), with the header saying what the pack is (nx ' + rw.header.nx + ', ny ' + rw.header.ny + ', box ' + rw.header.lab.box + ' m, window ' + rw.header.lab.window + ' m, none in the whole box\'s: ' + ('window' in rf.header.lab) + ')',
      ok === all && all === rf.frames.length * 5 * 40 * 144 && JSON.stringify(rw.header.drift) === JSON.stringify(rf.header.drift) && rf.header.drift.some((d) => d[0] !== 0 || d[1] !== 0) && rw.header.nx === 12 && rw.header.ny === 12 && rw.header.lab.box === 60000 && rw.header.lab.window === 36000 && !('window' in rf.header.lab) && rf.header.nx === 20
      && rw.frames.every((fr) => fr.block.length === perw) && rf.frames.every((fr) => fr.block.length === per0));
    check('its track is the full run\'s less the window\'s corner (12000 m) wherever the updraft is in the window (' + tr.length + ' frames, differences ' + [...new Set(tr.map((v) => v.join(',')))].join(' and ') + ' m), it is always a place in the window (' + rw.frames.map((fr) => fr.track[0] + ',' + fr.track[1]).join(' ') + ' of 36000 m: the updraft that is out of it is not the window\'s), and the strongest echo of a frame is the window\'s (' + rw.frames.map((fr) => fr.zmax).join(', ') + ' dBZ against ' + rf.frames.map((fr) => fr.zmax).join(', ') + ')',
      tr.length > 2 && tr.every((v) => Math.abs(v[0]) <= 1 && Math.abs(v[1]) <= 1) && rw.frames.every((fr) => fr.track[0] >= 0 && fr.track[0] < 36000 && fr.track[1] >= 0 && fr.track[1] < 36000) && rw.frames.every((fr, f) => fr.zmax <= rf.frames[f].zmax));
    const tiny = { env: arrays(21, 500), dx: 4000, box: 40000, nz: 20, dz: 500, dt: 10, minutes: 2, frameEvery: 1 }, nd = { dx: 1000, from: 0, every: 1, minUpdraft: 0, box: 16000 };
    const nf = await L.run(Object.assign({}, tiny, { detail: nd }), {}), nwn = await L.run(Object.assign({}, tiny, { detail: nd, window: 24000 }), {}), cn = nwn.header.nests[0], perN = 5 * 20 * 6 * 6 + 5 * cn.nx * cn.nx * cn.nz;
    { const orig2 = C.create, made2 = []; C.create = (o) => { made2.push(o); return orig2(o); };
      await L.run(Object.assign({}, tiny, { detail: nd, visc: 0.5, minutes: 1 }), {}); C.create = orig2;
      check('the viscosity factor is the nest\'s too (a box of 4 km cells has ' + made2[0].visc.kh + ' m2/s and its nest of 1 km cells ' + made2[1].visc.kh + ': 500 m2/s at 2 km scaled with the grid, times 0.5)', made2.length === 2 && made2[0].visc.kh === 500 && made2[0].visc.kv === 500 && made2[1].visc.kh === 125 && made2[1].visc.kv === 125 && made2[1].dx === 1000); }
    let nestSame = 0; for (let f = 0; f < nf.frames.length; f++) if (nf.frames[f].nest) { const a1 = nf.frames[f].block, b1 = nwn.frames[f].block, o1 = 5 * 20 * 100, o2 = 5 * 20 * 36; let s = true; for (let q = 0; q < 5 * cn.nx * cn.nx * cn.nz; q++) if (a1[o1 + q] !== b1[o2 + q]) { s = false; break; } if (s) nestSame++; }
    check('with a nest the window moves its place in the pack (the nest\'s corner at ' + nf.header.fn[nf.header.fn.length - 1][0].join(',') + ' in the box of 40 km, ' + nwn.header.fn[nwn.header.fn.length - 1][0].join(',') + ' in the window of 24 km, 8000 m nearer the corner: the window\'s own is 6 cells of 4 km from the box\'s corner 2 cells in), a frame holds the window\'s box and the nest\'s (' + nwn.frames[nwn.frames.length - 1].block.length + ' bytes for ' + perN + '), and the nest is what it is without a window (' + nestSame + ' of ' + nf.frames.filter((fr) => fr.nest).length + ' frames with a nest)',
      nf.header.fn[nf.header.fn.length - 1][0][1] === 12000 && nwn.header.fn[nwn.header.fn.length - 1][0][1] === 4000 && nwn.header.fn[nwn.header.fn.length - 1][0][2] === 4000 && nwn.frames[nwn.frames.length - 1].block.length === perN && nestSame === nf.frames.filter((fr) => fr.nest).length && nestSame > 0);
    const big = await L.run(Object.assign({}, tiny, { window: 1e9 }), {}), small = await L.run(Object.assign({}, tiny, { window: 1 }), {}), odd = await L.run(Object.assign({}, tiny, { window: 13000 }), {}), odd2 = await L.run(Object.assign({}, tiny, { window: 15000 }), {});
    check('a window as large as the box (or larger: ' + big.header.nx + ' cells of ' + big.header.dx + ' m for the box\'s 10) is the whole box and says nothing of it (' + ('window' in big.header.lab) + '), one that is smaller than 2 cells is 2 (' + small.header.nx + '), and one that is not a whole number of cells is rounded to the nearest (13 km is 3.25 cells of 4 km: ' + odd.header.nx + ' cells, ' + odd.header.lab.window + ' m; 15 km is 3.75: ' + odd2.header.nx + ' cells, ' + odd2.header.lab.window + ' m)',
      big.header.nx === 10 && !('window' in big.header.lab) && small.header.nx === 2 && small.header.lab.window === 8000 && odd.header.nx === 3 && odd.header.lab.window === 12000 && odd2.header.nx === 4 && odd2.header.lab.window === 16000);
  }

  /* 8b. The box moved with its nest: a parent of 16 x 16 cells of 3 km with a nest of 8 x 8 of them as 24 x 24 cells of 1 km, both in a storm of their own, moved by (1, -2), (-3, 0) and (0, 1) cells of the box. The box is moved as it is without a nest;
         the nest by 3 times as many cells, so that what is in it is where it was in the box's frame; the cells within 3 times the larger shift of its sides are the box's again, as a nest made at that moment has them. */
  {
    const a = arrays(11, 500), e = L.envOf(a), RATIO = 3, PNX = 16, PC = 8, CN = PC * RATIO, X0 = 12000, NZ = 10, md = (v, n) => ((v % n) + n) % n;
    const popt = { nx: PNX, ny: PNX, nz: NZ, dx: 3000, dy: 3000, dz: 500, moist: true, ice: true, iceParams: { n0g: 4e6, rhog: 400, n0r: 8e6, evap: 1 }, theta: e.theta, qv: e.qv, wind: { u: e.u, v: e.v }, bc: { x: 'periodic', y: 'periodic' }, visc: { kh: 1500, kv: 1500 }, damp: { top: { depth: 3000, rate: 0.003 } } };
    const copt = Object.assign({}, popt, { nx: CN, ny: CN, dx: 1000, dy: 1000, visc: { kh: 125, kv: 125 }, bc: { x: 'driven', y: 'driven' }, relax: { width: 6 } });
    const build = () => {
      const parent = C.create(popt), child = C.create(copt), pi = parent.idx;
      for (let k = 0; k < NZ; k++) for (let j = 0; j < PNX; j++) for (let i = 0; i < PNX; i++) { const o = pi(i, j, k); parent.S.th[o] = L.bubble((i + 0.5) * 3000, (j + 0.5) * 3000, (k + 0.5) * 500, 24000, 24000, 4); parent.S.u[o] = parent.base.ubc[k]; parent.S.v[o] = parent.base.vbc[k]; }
      parent.fill(); const nest = NEST.create({ parent, child, ratio: RATIO, x0: X0, y0: X0 }); nest.init(); for (let s = 0; s < 8; s++) nest.step(10);
      return { parent, child, nest };
    };
    const trial = (sx, sy) => {
      const { parent, child, nest } = build(), before = child.getState(), twinP = C.create(popt); twinP.setState(parent.getState()); L.roll(twinP, sx, sy);
      L.rollNested(parent, nest, RATIO, sx, sy);
      const W = RATIO * Math.max(Math.abs(sx), Math.abs(sy)), twinC = C.create(copt), nest2 = NEST.create({ parent, child: twinC, ratio: RATIO, x0: X0, y0: X0 }); nest2.init();
      let pd = 0, inner = 0, innerBad = 0, band = 0, bandBad = 0, moved = 0;
      for (const n of parent.names) for (let q = 0; q < parent.N; q++) pd = Math.max(pd, Math.abs(parent.S[n][q] - twinP.S[n][q]));
      for (const n of child.names) {
        const ni = n === 'u' ? CN + 1 : CN, nj = n === 'v' ? CN + 1 : CN, nk = n === 'w' ? NZ + 1 : NZ;
        for (let k = 0; k < nk; k++) for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
          const q = child.idx(i, j, k);
          if (i < W || i >= ni - W || j < W || j >= nj - W) { band++; if (child.S[n][q] !== twinC.S[n][q]) bandBad++; }
          else { inner++; const was = before.f[n][child.idx(md(i - RATIO * sx, CN), md(j - RATIO * sy, CN), k)]; if (child.S[n][q] !== was) innerBad++; moved = Math.max(moved, Math.abs(was - before.f[n][q])); }
        }
      }
      return { W, pd, inner, innerBad, band, bandBad, moved };
    };
    const rs = [[1, -2], [-3, 0], [0, 1]].map(([sx, sy]) => [sx, sy, trial(sx, sy)]);
    check('the box and its nest moved together: the box as it is moved with no nest (differences ' + rs.map(([x, y, r]) => r.pd).join(', ') + '), the nest\'s cells beyond 3 times the larger shift of its sides are what was 3 times the shift away (wrong: ' + rs.map(([x, y, r]) => r.innerBad + ' of ' + r.inner).join(', ') + ' for (1, -2), (-3, 0), (0, 1): bands of ' + rs.map(([x, y, r]) => r.W).join(', ') + ' cells), those within it the box\'s, as a nest made at that moment has them (wrong: ' + rs.map(([x, y, r]) => r.bandBad + ' of ' + r.band).join(', ') + ')',
      rs.every(([x, y, r]) => r.pd === 0 && r.innerBad === 0 && r.bandBad === 0 && r.inner > 3000 && r.band > 3000 && r.moved > 1e-6) && rs[0][2].W === 6 && rs[1][2].W === 9 && rs[2][2].W === 3);
    const { parent: p1, child: c1, nest: n1 } = build(), p2 = C.create(popt), p3 = C.create(popt), keep = c1.getState(); p2.setState(p1.getState()); p3.setState(p1.getState());
    L.rollNested(p2, null, RATIO, 1, -2); L.roll(p3, 1, -2); let nd = 0; for (const n of p2.names) for (let q = 0; q < p2.N; q++) nd = Math.max(nd, Math.abs(p2.S[n][q] - p3.S[n][q]));
    L.rollNested(p1, n1, RATIO, 0, 0); let zd = 0; for (const n of c1.names) for (let q = 0; q < c1.N; q++) zd = Math.max(zd, Math.abs(c1.S[n][q] - keep.f[n][q]));
    check('with no nest the box alone is moved (' + nd + '), and a move by nothing leaves the nest as it is, to the last bit (' + zd + ')', nd === 0 && zd === 0);
  }

  /* 8c. A run with a nest, the dryline day's storm at 3 km with a nest of 1 km cells over 18 km from the 15th minute: the box records what it records without the nest (the nest never reaches back), the nest is in the frames after that and keeps
         the box's time, follows the storm as the box does, is a pack of version 2 that reads back, and is what a replay by hand makes of it (every setting of the finer core, the order of the moves and the recording). */
  const ar = dryEnv(), base = { env: ar, dx: 3000, box: 60000, dt: 10, minutes: 30, frameEvery: 5 }, DET = { dx: 1000, box: 18000, from: 15, ztop: 6000, every: 5 };
  const plain = await L.run(base, {}), seen = []; let late = 0, before = 0, after = 0;
  const det = await L.run(Object.assign({}, base, { detail: DET }), { nest: (n) => seen.push(n), frame: (rec) => { if (rec.nest && Math.abs(seen[0].child.time - rec.t * 60) > 1e-6) late++; }, progress: (p) => { if (seen.length) after++; else before++; } });
  const per5 = 5 * 20 * 20 * 40, cper = 5 * 18 * 18 * 12, hd = det.header;
  check('a run with a nest makes a pack of version 2: its grid (18 x 18 x 12 cells of 1000 x 500 m, 1 m/s steps of wind), its place (21000, 21000 in the box, the middle of it) in the frames after the 15th minute and in none before, a block that long, and what it was set to (' + JSON.stringify(hd.lab.detail) + '); the nest was made once (' + seen.length + ') and kept the box\'s time (' + late + ' frames out)',
    hd.v === 2 && JSON.stringify(hd.nests) === JSON.stringify([{ nx: 18, ny: 18, nz: 12, dx: 1000, dz: 500, scale: { wind: 1, vz: 0.25 }, frame: { u: 0, v: 0 } }]) && JSON.stringify(hd.fn) === JSON.stringify([[], [], [], [], [[0, 21000, 21000]], [[0, 21000, 21000]], [[0, 21000, 21000]]])
    && JSON.stringify(hd.lab.detail) === JSON.stringify(Object.assign({}, DET, { minUpdraft: 10 })) && det.frames.map((f) => f.block.length).join() === [per5, per5, per5, per5, per5 + cper, per5 + cper, per5 + cper].join() && det.frames.map((f) => f.nest).join() === 'false,false,false,false,true,true,true' && seen.length === 1 && seen[0].child.nx === 18 && seen[0].nest.x0 === 21000 && late === 0);
  check('the run says how far it has got every 6 steps (a model minute) until the nest is made and at every step after it, a step of the finer model being long (' + before + ' times in the first 15 minutes, ' + after + ' in the next 15)', before === 15 && after === 91);
  check('a run without one is a pack of version 1 as before: no nests, no `fn`, frames of the box\'s five arrays (' + plain.header.v + ', ' + (plain.header.nests === undefined) + ', ' + (plain.header.fn === undefined) + ', detail ' + plain.header.lab.detail + ')', plain.header.v === 1 && plain.header.nests === undefined && plain.header.fn === undefined && plain.header.lab.detail === undefined && plain.frames.every((f) => !f.nest && f.block.length === per5));
  let same = plain.frames.length === det.frames.length; plain.frames.forEach((f, i) => { if (same && !eqBytes(det.frames[i].block.subarray(0, per5), f.block)) same = false; });
  check('the box records what it records without the nest, bit for bit, all ' + plain.frames.length + ' frames, with the same times, track and drift of its corner (the nest is one way, and moves with the box): ' + same, same && JSON.stringify(plain.header.drift) === JSON.stringify(det.header.drift) && JSON.stringify(plain.header.track) === JSON.stringify(det.header.track) && JSON.stringify(plain.header.times) === JSON.stringify(det.header.times) && det.header.drift[6].join() !== det.header.drift[4].join());
  /* 8c2. Where the nest goes in the box: in the middle (as above), `upshear` metres against the shear of the lowest 6 km (in proportion to it under 20 m/s, whole cells of the box, kept in the box), or `offset` outright, which wins; the box does not
         know (the nest is one way), so it records what it recorded with the nest in the middle, bit for bit */
  const b20 =Object.assign({}, base, { minutes: 20 }), dxs = base.dx, midC = 21000, hiC = (20 - 6) * dxs, clampC = (v) => Math.max(0, Math.min(hiC, v)), shear = L.upshear(L.envOf(ar), 9000), expU = [clampC(midC + Math.round(shear[0] / dxs) * dxs), clampC(midC + Math.round(shear[1] / dxs) * dxs)];
  const upr = await L.run(Object.assign({}, b20, { detail: Object.assign({}, DET, { upshear: 9000 }) }), {}), ofr = await L.run(Object.assign({}, b20, { detail: Object.assign({}, DET, { offset: [-6000, 3000], upshear: 9000 }) }), {}), clr = await L.run(Object.assign({}, b20, { detail: Object.assign({}, DET, { offset: [-1e6, 1e6] }) }), {});
  const fnOf = (r) => r.header.fn[r.header.fn.length - 1][0].slice(1);
  check('a nest 9000 m upshear of the day\'s shear (' + shear.map((v) => Math.round(v)).join(', ') + ' m, whole cells of 3 km) is at ' + fnOf(upr).join(', ') + ' of the box (expected ' + expU.join(', ') + ') and its header says by how much it is off the middle (' + JSON.stringify(upr.header.lab.detail.offset) + '); the nest in the middle has no offset in its header (' + (hd.lab.detail.offset === undefined) + ')',
    shear[0] < -2000 && fnOf(upr).join() === expU.join() && JSON.stringify(upr.header.lab.detail.offset) === JSON.stringify([expU[0] - midC, expU[1] - midC]) && fnOf(upr).join() !== '21000,21000' && hd.lab.detail.offset === undefined);
  check('an offset given outright wins over upshear (' + fnOf(ofr).join(', ') + ' for -6000, 3000), and one that would take the nest out of the box is stopped at its edge (' + fnOf(clr).join(', ') + ' for a million metres west and north)',
    fnOf(ofr).join() === '15000,24000' && JSON.stringify(ofr.header.lab.detail.offset) === JSON.stringify([-6000, 3000]) && fnOf(clr).join() === '0,' + hiC);
  let sameUp = upr.frames.length === det.frames.length - 2, sameOf = true; upr.frames.forEach((f, i) => { if (sameUp && !eqBytes(det.frames[i].block.subarray(0, per5), f.block.subarray(0, per5))) sameUp = false; }); ofr.frames.forEach((f, i) => { if (sameOf && !eqBytes(det.frames[i].block.subarray(0, per5), f.block.subarray(0, per5))) sameOf = false; });
  check('the box records what it records wherever the nest is, bit for bit (' + upr.frames.length + ' frames upshear: ' + sameUp + ', ' + ofr.frames.length + ' with an offset: ' + sameOf + ')', sameUp && sameOf && upr.header.drift.join() === det.header.drift.slice(0, 5).join() && upr.frames[4].nest === true);
  /* the nest sees the storm where the box does: the middle of the echo (30 dBZ or more, 0.5 to 3.5 km, by power) of the nest and of the box's cells under it */
  const cent = (dbz, nx, i0, i1, j0, j1, dxm, ox) => { let W = 0, cx = 0, cy = 0; for (let k = 1; k <= 7; k++) for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) { const d = dbz[(k * nx + j) * nx + i]; if (d < 30) continue; const w = Math.pow(10, d / 10); W += w; cx += w * (ox + (i - i0 + 0.5) * dxm); cy += w * (ox + (j - j0 + 0.5) * dxm); } return W > 0 ? [cx / W, cy / W] : null; };
  const gaps = [4, 5, 6].map((i) => { const f = det.frames[i], b = new Int8Array(f.block.buffer, f.block.byteOffset, 20 * 20 * 40), c = new Int8Array(f.block.buffer, f.block.byteOffset + per5, 18 * 18 * 12), cb = cent(b, 20, 7, 13, 7, 13, 3000, 21000), cc = cent(c, 18, 0, 18, 0, 18, 1000, 21000); return cb && cc ? Math.max(Math.abs(cb[0] - cc[0]), Math.abs(cb[1] - cc[1])) : -1; });
  check('the echo of the nest is where the echo of the box under it is, at each frame with a nest (the middles of their power differ by ' + gaps.map((g) => Math.round(g)).join(', ') + ' m)', gaps.every((g) => g >= 0 && g < 1500));
  const hdr = Object.assign({}, det.header, { name: 'T', scenario: { lat0: 36, lon0: -98, origin: [0, 0], radar: 'KVNX', clock: '15:00', tz: 'CDT' } }), pk = P.assemble(hdr, det.frames.map((f) => f.block)), v3 = pk.volume(3), v5 = pk.volume(5), nv = v5.nests && v5.nests[0];
  const cdb = new Int8Array(det.frames[5].block.buffer, det.frames[5].block.byteOffset + per5, 18 * 18 * 12), cu = new Int8Array(det.frames[5].block.buffer, det.frames[5].block.byteOffset + per5 + 2 * 18 * 18 * 12, 18 * 18 * 12);
  let ud = 0; if (nv) for (let q = 0; q < cu.length; q++) ud = Math.max(ud, Math.abs(nv.vol.u[q] - (cu[q] + pk.motion.u)));
  check('the pack reads back: offsets of the frames as long as their blocks (' + pk.h.offsets.join(', ') + '), no nest in frame 3 and one in frame 5 at (21000, 21000) with its grid, its reflectivity the block\'s, its winds in whole metres plus the box\'s motion (' + ud.toExponential(1) + ' off)',
    pk.h.offsets.join() === [0, per5, 2 * per5, 3 * per5, 4 * per5, 4 * per5 + per5 + cper, 4 * per5 + 2 * (per5 + cper), 4 * per5 + 3 * (per5 + cper)].join() && v3.nests === undefined && v5.nests.length === 1 && nv.x === 21000 && nv.y === 21000 && nv.vol.nx === 18 && nv.vol.nz === 12 && nv.vol.dx === 1000 && nv.vol.dz === 500 && eqBytes(nv.vol.dbz, cdb) && ud < 1e-4 && cu.some((x) => x !== 0));
  /* the replay: the same run by hand, with the box moved by what the header's drift says and the nest made and moved as the Lab's text says it is */
  {
    const env = L.envOf(ar), phys = (n, d) => ({ nx: n, ny: n, nz: 40, dx: d, dy: d, dz: 500, moist: true, ice: true, iceParams: { n0g: 4e6, rhog: 400, n0r: 8e6, evap: 1 }, theta: env.theta, qv: env.qv, wind: { u: env.u, v: env.v }, visc: { kh: 500 * d / 2000, kv: 500 * d / 2000 }, damp: { top: { depth: 5000, rate: 0.003 } }, drag: { z0: 0.1, frame: { u: env.motion.u, v: env.motion.v }, balance: true } });
    const par = C.create(Object.assign(phys(20, 3000), { bc: { x: 'periodic', y: 'periodic' } })), b = par.base;
    for (let k = 0; k < 40; k++) for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) { const o = par.idx(i, j, k); par.S.th[o] = L.bubble((i + 0.5) * 3000, (j + 0.5) * 3000, (k + 0.5) * 500, 30000, 30000); par.S.u[o] = b.ubc[k]; par.S.v[o] = b.vbc[k]; }
    par.fill(); let kid = null, nst = null, rec = null; const dr = det.header.drift, shift = (f) => [-(dr[f + 1][0] - dr[f][0]) / 3000, -(dr[f + 1][1] - dr[f][1]) / 3000], mine = [];
    for (let f = 0; f <= 5; f++) {                                           // (frame f is at 5 f minutes: record it, make the move its block asked for, make the nest after the 15th minute's move, and take the 30 steps of 10 s to the next frame)
      if (f >= 4) mine[f] = rec().block;
      if (f === 5) break;
      const [sx, sy] = shift(f); if (sx || sy) L.rollNested(par, nst, 3, sx, sy);
      if (f === 3) { kid = C.create(Object.assign(phys(18, 1000), { bc: { x: 'driven', y: 'driven' }, relax: { width: 6 } })); nst = NEST.create({ parent: par, child: kid, ratio: 3, x0: 21000, y0: 21000 }); nst.init(); rec = L.recorder(kid, { wind: 1, nz: 12 }); }
      for (let s = 0; s < 30; s++) { if (nst) nst.step(10); else par.step(10); }
    }
    const ok = [4, 5].map((f) => mine[f] && eqBytes(mine[f], det.frames[f].block.subarray(per5)));
    check('a replay by hand of the run (the box moved by the header\'s drift, the nest of 18 x 18 x 40 cells of 1 km made after the 15th minute\'s move, 30 steps of 10 s between frames, the lowest 12 levels recorded in 1 m/s steps) gives the frames 4 and 5 of the nest bit for bit: ' + ok.join(', '), ok.every(Boolean));
  }

  /* 8d. What is refused, the nest's size and place, the frames' times, and a nest that blows up on its own. */
  {
    const fail = async (spec) => { try { await L.run(spec, {}); return ''; } catch (e) { return e.message; } };
    const tiny = { env: arrays(21, 500), dx: 4000, box: 40000, nz: 20, dz: 500, dt: 10, minutes: 2, frameEvery: 1 };
    const e1 = await fail(Object.assign({}, tiny, { follow: false, detail: { dx: 1000 } })), e2 = await fail(Object.assign({}, tiny, { detail: { dx: 1500 } })), e3 = await fail(Object.assign({}, tiny, { detail: { dx: 4000 } }));
    const keep = globalThis.HFSevereNest; delete globalThis.HFSevereNest; const e4 = await fail(Object.assign({}, tiny, { detail: { dx: 1000 } })); globalThis.HFSevereNest = keep;
    check('a nest is refused with a box that does not follow its storm (' + e1 + '), with cells that are not a whole fraction of the box\'s (' + e2 + '), with cells as large as the box\'s (' + e3 + ') and without the nest module (' + e4 + ')',
      /follow/.test(e1) && /whole fraction/.test(e2) && /1500/.test(e2) && /whole fraction/.test(e3) && /needs HFSevereNest/.test(e4));
    const size = async (d) => { const r = await L.run(Object.assign({}, tiny, { minutes: 2, detail: Object.assign({ dx: 1000, from: 0, every: 1, minUpdraft: 0 }, d) }), {}); return { n: r.header.nests[0], at: r.header.fn[r.header.fn.length - 1][0], lab: r.header.lab.detail }; };
    const s1 = await size({ box: 16000 }), s2 = await size({ box: 1e6 }), s3 = await size({ box: 1000 }), s4 = await size({ ztop: 4100 }), s5 = await size({ ztop: 100 }), s6 = await size({ ztop: 1e6 }), s7 = await size({ box: 20000 }), s8 = await size({ box: 17000 }), s9 = await size({ box: 19000 }), s0 = await size({ ztop: 0 });
    check('the nest\'s box is a whole number of the box\'s cells, in its middle: 16 km is 4 cells (16 of 1 km, the corner at 12000), 20 km is 5 (20 of 1 km, the corner at 12000: 10 cells less 5 is 5, half of it 2.5, which is 3 cells in), a box too large is 4 cells less than the box (24, at 8000) and one too small is 4 cells (16): '
      + [s1, s7, s2, s3].map((s) => s.n.nx + ' at ' + s.at[1]).join(', ') + '; its depth is the levels that hold `ztop` (8000 m, the default, is 16, 4100 m 9, 100 m 1, any more all 20): ' + [s1.n.nz, s4.n.nz, s5.n.nz, s6.n.nz, s2.n.nz].join(', '),
      s1.n.nx === 16 && s1.at[1] === 12000 && s1.at[2] === 12000 && s7.n.nx === 20 && s7.at[1] === 12000 && s2.n.nx === 24 && s2.at[1] === 8000 && s3.n.nx === 16 && s4.n.nz === 9 && s5.n.nz === 1 && s6.n.nz === 20 && s1.n.nz === 16 && s1.lab.ztop === 8000 && s2.n.nz === 16);
    check('a box that is not a whole number of cells is rounded to the nearest (17 km is 4.25 cells of 4 km: ' + s8.n.nx / 4 + ' cells; 19 km is 4.75: ' + s9.n.nx / 4 + ' cells) and the header says what it came to (box ' + s8.lab.box + ' and ' + s9.lab.box + ' m, ztop ' + s4.lab.ztop + ' m for the 4100 asked, ' + s0.n.nz + ' level for none)',
      s8.n.nx === 16 && s9.n.nx === 20 && s8.lab.box === 16000 && s9.lab.box === 20000 && s4.lab.ztop === 4500 && s0.n.nz === 1 && s0.lab.ztop === 500);
    const t1 = await L.run(Object.assign({}, tiny, { minutes: 6, frameEvery: 2, detail: { dx: 1000, from: 2, every: 1, minUpdraft: 0 } }), {}), t2 = await L.run(Object.assign({}, tiny, { minutes: 6, frameEvery: 2, detail: { dx: 1000, from: 3, every: 1, minUpdraft: 0 } }), {});
    check('the nest is made at the first frame at or after `from` and the frames are `every` minutes apart from then on: from 2 with frames every 2 and then every 1: ' + t1.header.times.join(', ') + ' with the nest in the frames after the 2nd minute (' + t1.header.fn.map((f) => f.length).join('') + '); from 3: ' + t2.header.times.join(', ') + ' (' + t2.header.fn.map((f) => f.length).join('') + ')',
      t1.header.times.join() === '0,2,3,4,5,6' && t1.header.fn.map((f) => f.length).join('') === '001111' && t2.header.times.join() === '0,2,4,5,6' && t2.header.fn.map((f) => f.length).join('') === '00011');
    const none = await L.run(Object.assign({}, tiny, { minutes: 2, detail: { dx: 1000, from: 100 } }), {});
    check('a run in which the nest is never made (it was to start at the 100th minute of 2) is a pack of version 1 as any other, and says what it was set to (' + none.header.v + ', ' + (none.header.nests === undefined) + ', ' + (none.header.fn === undefined) + ', ' + JSON.stringify(none.header.lab.detail) + ')',
      none.header.v === 1 && none.header.nests === undefined && none.header.fn === undefined && none.frames.every((f) => !f.nest) && none.header.lab.detail.from === 100 && none.header.lab.detail.dx === 1000);
    const dead = await L.run(Object.assign({}, tiny, { minutes: 3, detail: { dx: 1000, from: 0, every: 1 } }), {}), z0 = await L.run(Object.assign({}, tiny, { minutes: 2, detail: { dx: 1000, from: 0, every: 1, minUpdraft: 0 } }), {});
    check('a day with no storm gets no nest: with the updraft the nest needs (10 m/s, by default) at no frame of a quiet run (the updrafts of ' + dead.frames.map((f) => f.wmax).join(', ') + ' m/s) it is never made and the pack is of version 1 (' + dead.header.v + ', ' + dead.header.times.join(',') + ', ' + JSON.stringify(dead.header.lab.detail) + '); with none needed it is made at the first frame at or after `from`, an updraft of 0 being enough (the nest in the frames after 0: ' + z0.header.fn.map((f) => f.length).join('') + ')',
      dead.header.v === 1 && dead.header.nests === undefined && dead.header.lab.detail.minUpdraft === 10 && dead.frames.every((f) => f.wmax < 10) && z0.header.fn.map((f) => f.length).join('') === '011' && z0.header.lab.detail.minUpdraft === 0);
    const w15 = plain.frames[3].wmax, late = await L.run(Object.assign({}, base, { minutes: 25, detail: Object.assign({}, DET, { minUpdraft: w15 + 0.2 }) }), {});
    check('the nest waits for the storm: with an updraft needed of 0.2 m/s more than the box has at the 15th minute (' + w15 + ' m/s) it is made after the 20th (the nest in the frames of 0 to 25 minutes: ' + late.header.fn.map((f) => f.length).join('') + ')', late.header.fn.map((f) => f.length).join('') === '000001' && plain.frames[4].wmax > w15 + 0.2);
    /* the run as the page plays it while it goes: the header comes first, the frames bring their own part of it, and a pack that grows with them is the pack that is made of the whole run */
    {
      const spec = Object.assign({}, tiny, { minutes: 3, frameEvery: 1, detail: { dx: 1000, box: 16000, ztop: 4000, from: 0, every: 1, minUpdraft: 0 } }); let started = 0, snap = null, atStart = -1; const got = [];
      const r = await L.run(spec, { start: (h) => { started++; atStart = got.length; snap = JSON.parse(JSON.stringify(h)); }, frame: (f) => got.push({ t: f.t, i: f.i, nest: f.nest, fn: f.fn, track: f.track, drift: f.drift, block: f.block }) });
      const h = r.header, per = 5 * 10 * 10 * 20, nper = 5 * 16 * 16 * 8;
      check('the header is given once, before the first frame (' + started + ' time, after ' + atStart + ' frames), with the grid, the scale, the motion, the base state, what the run was set to and the nest\'s grid, and with no frame\'s part of it yet (' + snap.times.length + ' times, ' + snap.track.length + ' tracks, ' + snap.drift.length + ' drifts, ' + snap.fn.length + ' fns)',
        started === 1 && atStart === 0 && snap.v === 2 && snap.nx === 10 && snap.ny === 10 && snap.nz === 20 && snap.dx === 4000 && snap.dz === 500 && snap.floor === -30 && snap.scale.wind === 0.5 && snap.scale.vz === 0.25 && snap.motion.u === 8 && snap.motion.v === 3 && snap.base.z.length === 20 && snap.lab.detail.dx === 1000 && snap.lab.dt === 10
        && snap.nests.length === 1 && snap.nests[0].nx === 16 && snap.nests[0].nz === 8 && snap.nests[0].scale.wind === 1 && snap.times.length === 0 && snap.track.length === 0 && snap.drift.length === 0 && snap.fn.length === 0);
      check('each frame brings its own part of the header (its fn: no nest in the first, the nest at (12000, 12000) in the others; its track and the drift of the box\'s corner) and the header ends with all of them: ' + JSON.stringify(h.fn) + ' for the frames at ' + h.times.join(', ') + ' minutes',
        got.length === 4 && got.every((f, i) => f.i === i && f.t === h.times[i] && JSON.stringify(f.fn) === JSON.stringify(h.fn[i]) && JSON.stringify(f.track) === JSON.stringify(h.track[i]) && JSON.stringify(f.drift) === JSON.stringify(h.drift[i]) && f.nest === (i > 0) && f.block.length === (i > 0 ? per + nper : per))
        && JSON.stringify(h.fn) === '[[],[[0,12000,12000]],[[0,12000,12000]],[[0,12000,12000]]]' && h.times.join() === '0,1,2,3' && h.track.length === 4 && h.drift.length === 4 && h.v === 2);
      const sc = { lat0: 36, lon0: -98, origin: [1000, 2000], radar: 'KVNX', clock: '15:00', tz: 'CDT' }, lv = P.live(Object.assign({}, snap, { name: 'T', scenario: sc }));
      const empty = lv.n === 0 && lv.corner(5)[0] === 1000 + 8 * 300 && lv.corner(5)[1] === 2000 + 3 * 300 && lv.live === true && lv.times.length === 0;
      const idx = got.map((f) => lv.append(f, f.block)), asm = P.assemble(Object.assign({}, h, { name: 'T', scenario: sc }), got.map((f) => f.block));
      let vs = true; for (let i = 0; i < 4; i++) { const a = lv.volume(i), b = asm.volume(i); vs = vs && eqBytes(a.dbz, b.dbz) && a.u.every((x, q) => x === b.u[q]) && (a.nests ? a.nests.length : 0) === (b.nests ? b.nests.length : 0) && (!a.nests || (a.nests[0].x === b.nests[0].x && a.nests[0].vol.u.every((x, q) => x === b.nests[0].vol.u[q]))) && eqBytes(lv.frameBytes(i), asm.frameBytes(i)); }
      check('a live pack made from that header and fed those frames is the pack that is made of the whole run: nothing before the first frame (and a corner already, from the motion), then ' + lv.n + ' frames (' + idx.join(', ') + '), their volumes, the nest\'s and the bytes of each frame the same, and the box\'s corner, the clock and the path the same too',
        empty && lv.n === 4 && idx.join() === '0,1,2,3' && vs && lv.corner(2).join() === asm.corner(2).join() && lv.clock(3).text === asm.clock(3).text && JSON.stringify(lv.path()) === JSON.stringify(asm.path()) && lv.times === lv.h.times && lv.track === lv.h.track && lv.h.fn.length === 4 && lv.h.drift.length === 4 && lv.h.track.length === 4 && JSON.stringify(lv.h.fn) === JSON.stringify(asm.h.fn));
      let e1 = '', e2 = '', e3 = ''; try { lv.append({ t: 3, track: [0, 0, 0], fn: [[0, 12000, 12000]] }, got[3].block); } catch (e) { e1 = e.message; } try { lv.append({ t: 4, track: [0, 0, 0], fn: [] }, got[3].block); } catch (e) { e2 = e.message; } try { lv.append({ t: 2.5, track: [0, 0, 0], fn: [[0, 12000, 12000]] }, got[3].block); } catch (e) { e3 = e.message; }
      const none = P.live(Object.assign({}, snap, { nests: undefined, name: 'T', scenario: sc })); none.append({ t: 0, track: [0, 0, 0] }, got[0].block); none.append({ t: 1, track: [0, 0, 1], drift: [1000, 2000] }, got[0].block);
      check('a frame that is not after the one before, or has not the bytes of its box and the nests its fn lists, is refused and the pack does not change (' + e1 + '; ' + e2 + '; ' + e3 + '; ' + lv.n + ' frames); a pack with no nests has no fn, and a frame with no drift has none (' + JSON.stringify(none.h.drift) + ', fn ' + none.h.fn + ')',
        /frame 4 is at minute 3, not after minute 3/.test(e1) && /frame 4 has \d+ bytes, not \d+/.test(e2) && /frame 4 is at minute 2\.5, not after minute 3/.test(e3) && lv.n === 4 && none.h.fn === undefined && JSON.stringify(none.h.drift) === '[[0,0],[1000,2000]]' && none.n === 2);
    }
    const bl = await L.run(Object.assign({}, base, { minutes: 15, detail: Object.assign({}, DET, { from: 10, minUpdraft: 0 }) }), { nest: ({ child }) => { child.S.w[child.idx(4, 4, 4)] = NaN; } });
    check('a nest that blows up on its own (the box is fine) stops the run at the next frame with a reason and the frames before it (' + bl.stopped + ', "' + bl.reason + '", ' + bl.frames.length + ' frames)', bl.stopped && /blew up at 15\.0 min/.test(bl.reason) && bl.frames.length === 3);
  }
}

console.log('\n' + passed + ' passed, ' + failed + ' failed (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
process.exit(failed ? 1 : 0);
