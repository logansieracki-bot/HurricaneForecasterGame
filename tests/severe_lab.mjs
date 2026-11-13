// Node-only tests of the Lab (src/severe-lab.js): the environment of a run made from arrays (linear in height, the winds in the frame of the storm), the bubble that starts a storm against its closed form, the recorder of a
// frame (the five arrays of a pack in the order level, y, x, the winds in half-metre steps, the fall speed in quarter-metre steps, clamps), a short run (its frames, its header, its hooks, a cancel and a blow-up), a storm of the
// dryline day (the drawing's sounding at its spot gives an updraft and an echo), and the pack that the page makes of what a run recorded (HFSeverePack.assemble reads back what was put in).
import '../src/severe-core.js';
import '../src/severe-sounding.js';
import '../src/severe-refl.js';
import '../src/severe-analysis.js';
import '../src/severe-days.js';
import '../src/severe-geo.js';
import '../src/severe-pack.js';
import '../src/severe-lab.js';

const C = globalThis.HFSevereCore, S = globalThis.HFSevereSounding, L = globalThis.HFSevereLab, P = globalThis.HFSeverePack;
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); } }
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
  check('the settings of a run are in its header: the rain\'s evaporation (the knob of the cold pool), the bubble, the step and the length (' + JSON.stringify(ev3.header.lab) + '; the defaults ' + JSON.stringify(dflt.header.lab) + ')', JSON.stringify(ev3.header.lab) === '{"evap":0.3,"bubble":2,"dt":30,"minutes":1,"follow":true}' && JSON.stringify(dflt.header.lab) === '{"evap":1,"bubble":3,"dt":10,"minutes":0.2,"follow":true}');
  const orig = C.create; let made = null; C.create = (o) => { made = o; return orig(o); };
  await L.run({ env: a, dx: 6000, box: 48000, nz: 20, dz: 1000, dt: 30, minutes: 0.2, evap: 0.3 }, {}); C.create = orig;
  check('the model is set up as the benchmark storm is: moist with ice (the rain\'s intercept 8e6, the graupel\'s 4e6 and 400 kg/m3, the evaporation of the run), periodic sides, a constant viscosity of 500 m2/s at 2 km scaled with the grid (' + made.visc.kh + ' at 6 km), a Rayleigh layer of 5 km under the lid and NO sponge along the edges (' + made.damp.top.depth + ' m; ' + made.damp.lateral + '): the periodic box has nothing at its sides that knows where they are, and a sponge made bars of echo as straight as the grid, the environment\'s own profiles',
    made.moist === true && made.ice === true && made.iceParams.n0r === 8e6 && made.iceParams.n0g === 4e6 && made.iceParams.rhog === 400 && made.iceParams.evap === 0.3 && made.bc.x === 'periodic' && made.bc.y === 'periodic' && made.visc.kh === 1500 && made.visc.kv === 1500
    && made.damp.top.depth === 5000 && made.damp.top.rate === 0.003 && made.damp.lateral === undefined && made.nx === 8 && made.ny === 8 && made.nz === 20 && made.dx === 6000 && made.dy === 6000 && made.dz === 1000 && near(made.theta(1250), 305, 1e-9) && near(made.wind.u(2000), 5, 1e-9));
  const five = await L.run(Object.assign({}, spec, { minutes: 7, frameEvery: 5, dt: 10 }), {});
  check('frames come every `frameEvery` minutes (5: at ' + five.header.times.join(' and ') + ' of a 7 minute run)', JSON.stringify(five.header.times) === '[0,5]');
  let asked = 0; const c = await L.run(Object.assign({}, spec, { minutes: 30 }), { yield: async () => { await new Promise((res) => setTimeout(res, 0)); }, cancelled: () => ++asked >= 1 });
  check('a cancel stops it at its next breath, with the frames it had (' + c.frames.length + ' of 31) and says so (' + c.stopped + ', "' + c.reason + '")', c.stopped && c.reason === 'cancelled' && c.frames.length >= 1 && c.frames.length < 31 && c.header.times.length === c.frames.length);
  const x = await L.run(Object.assign({}, spec, { bubble: 3000, minutes: 3 }), {});
  check('a model that blows up stops with a reason and the frames before it (' + x.stopped + ', "' + x.reason + '", ' + x.frames.length + ' frames)', x.stopped && /blew up/.test(x.reason) && x.frames.length >= 1 && x.frames.length < 4);
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
  check('under three cells of 30 dBZ is no storm (null for ' + JSON.stringify(ce([[3, 3, 2, 50], [4, 3, 2, 50]])) + '), and cells under 30 dBZ are no echo (' + JSON.stringify(ce(four(30, 5, 2, 29))) + ') and 30 dBZ is (' + JSON.stringify(ce(four(30, 5, 2, 30))) + '); the first of 3 is a storm', ce([[3, 3, 2, 50], [4, 3, 2, 50]]) === null && ce(four(30, 5, 2, 29)) === null && ce(four(30, 5, 2, 30)) !== null && ce([[3, 3, 2, 50], [4, 3, 2, 50], [3, 4, 2, 50]]) !== null);
  const lv = [0, 1, 7, 8].map((k) => ce(four(30, 5, k, 50)));
  check('only the levels from 500 m to 3.5 km are looked at (levels 0, 1, 7 and 8 of 500 m: ' + lv.map((x) => (x ? 'storm' : 'none')).join(', ') + ')', lv[0] === null && lv[1] !== null && lv[2] !== null && lv[3] === null);
  const two = ce(four(10, 20, 2, 50).concat(four(31, 20, 2, 50))), twoY = ce(four(10, 5, 2, 50).concat(four(10, 23, 2, 50))), wide = ce(four(10, 20, 2, 50).concat(four(28, 20, 2, 50))), mid = ce(four(10, 20, 2, 50).concat(four(22, 20, 2, 50)));
  check('two storms half a box apart, in a column or in a row, are not one (the mean of their angles means nothing: ' + JSON.stringify(two) + ', ' + JSON.stringify(twoY) + '), nor are two 18 columns apart (the mean vector is 0.22 long, under 0.3: ' + JSON.stringify(wide) + '), but two 12 columns apart are (0.62: ' + JSON.stringify(mid) + ') and two close ones are (' + JSON.stringify(ce(four(10, 20, 2, 50).concat(four(14, 20, 2, 50)))) + ')',
    two === null && twoY === null && wide === null && mid !== null && ce(four(10, 20, 2, 50).concat(four(14, 20, 2, 50))) !== null);
  const cy = ce(four(20, 30, 2, 50)), cy2 = ce(four(20, 5, 2, 50));
  check('rows are moved on their own: a blob above the middle (rows 30 and 31) goes south by 13 (' + JSON.stringify(cy) + '), one below (rows 5 and 6) north by 12 (' + JSON.stringify(cy2) + ') and neither moves east or west', cy && cy.sy === -13 && cy.sx === 0 && cy2 && cy2.sy === 12 && cy2.sx === 0);
  const cz = L.centring(blk(four(30, 5, 4, 50)), NX, NY, NZ, 1000);
  check('the levels are those of the grid: with levels of 1 km the band is the levels 0 to 3 (a blob at level 4 is none: ' + JSON.stringify(cz) + ', one at level 3 is one: ' + JSON.stringify(L.centring(blk(four(30, 5, 3, 50)), NX, NY, NZ, 1000)) + ')', cz === null && L.centring(blk(four(30, 5, 3, 50)), NX, NY, NZ, 1000) !== null);

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
  const hd = Object.assign({}, fol.header, { scenario: { lat0: 36, lon0: -98, origin: [1000, 2000], radar: 'KVNX', clock: '15:00', tz: 'CDT' } }), pk = P.assemble(hd, fol.frames.map((f) => f.block));
  const c4m = pk.corner(fol.header.times[4]), c0m = pk.corner(fol.header.times[0]), cb = pk.corner(fol.header.times[4] + 2.5), mo = fol.header.motion;
  check('the pack puts the box where its motion and the drift say: frame 4 at the origin plus the motion for 20 minutes plus the drift (' + c4m.map((v) => v.toFixed(0)).join(', ') + ' for ' + (1000 + mo.u * 1200 + dr[4][0]).toFixed(0) + ', ' + (2000 + mo.v * 1200 + dr[4][1]).toFixed(0) + '), frame 0 at the origin (' + c0m.join(', ') + '), and between two frames the drift of the earlier (' + cb.map((v) => v.toFixed(0)).join(', ') + ')',
    near(c4m[0], 1000 + mo.u * 1200 + dr[4][0], 1e-6) && near(c4m[1], 2000 + mo.v * 1200 + dr[4][1], 1e-6) && c0m[0] === 1000 && c0m[1] === 2000 && near(cb[0], 1000 + mo.u * 60 * (fol.header.times[4] + 2.5) + dr[4][0], 1e-6) && near(cb[1], 2000 + mo.v * 60 * (fol.header.times[4] + 2.5) + dr[4][1], 1e-6));
  const pk0 = P.assemble(Object.assign({}, hd, { drift: undefined }), non.frames.map((f) => f.block)), cn = pk0.corner(non.header.times[4]);
  check('a pack with no drift is the old one: the corner is the origin plus the motion (' + cn.map((v) => v.toFixed(0)).join(', ') + ')', near(cn[0], 1000 + mo.u * 1200, 1e-6) && near(cn[1], 2000 + mo.v * 1200, 1e-6));
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
}

console.log('\n' + passed + ' passed, ' + failed + ' failed (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
process.exit(failed ? 1 : 0);
