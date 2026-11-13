#!/usr/bin/env node
// The Weisman-Klemp (1982) storm with a finer nest in it (docs/severe-plan.md 6.8): the parent is the recorder's own run (wk82_run.mjs: 500 m cells, 84 km box, 500 m levels, Kessler or ice
// microphysics as there), the child a core of 100 to 250 m cells round the storm's low-level rotation, driven at its sides by the parent (src/severe-nest.js), with the drag of the ground.
//   [CKPT_AT=50,60] [FROM=<in.ckpt>] node tools/severe_research/wk82_nest.mjs parent <out.ckpt> <minutes>   the parent alone to <minutes>, then its state (the restart file; CKPT_AT also writes <out>.50.ckpt and so on on the way), with the track of its strongest updraft;
//                                                                                         FROM continues a restart file: <minutes> is then the minute to run to, counted from the storm's start (CKPT_AT likewise)
//   node tools/severe_research/wk82_nest.mjs child  <in.ckpt> <out> <minutes>         from the restart: parent and child together for <minutes> more, the child's frames and a log
// Settings are environment variables (the defaults in brackets):
//   BUBBLE_X=42 BUBBLE_Y=42 (km, where the +3 K bubble is; the storm drifts east at 8 m/s: 26 keeps 100 minutes clear of the sponge, which starts 10 km from the east edge)
//   PDX=500 (m, the parent's cell)  BOX_KM=84  DT=4 (s, the parent's step)  ICE=1  QV_SCALE=1  LLJ=0 (m/s, a low-level jet added to the sounding's winds: see env())
//   N0G=4e6 RHOG=400 (graupel/hail)  N0R=8e6 (rain's intercept)  EVAP=1 (the rain's evaporation, times: the knob of the cold pool); the same in the parent and the child
//   CDX=100 (the child's cell)  CDZ=200 (its level)  CL=12 (km, its side)  RATIO=4 (child steps per parent step)  DRAG=1  Z0=0.1 (m)  KHC=0.25 (child viscosity: KHC * CDX m2/s)
//   AGREE_EVERY=60 (s between the lines that set the child against its parent: means and rms differences at four levels inside the child; 0 for none)
//   PERTURB=0 (K: random noise of this amplitude on theta in the child's lowest 3 km at its start, for copies of one storm that differ by a breath)  SEED=1
//   FRAME_EVERY=60 (s between the child's frames; 0 for none)  PARENT_FRAMES=1 (the parent's whole box at the same times, for a pack)  DIAG_EVERY=10 (s)  CENTRE=auto|vort|x,y (km, the child's centre in the parent's box: auto the strongest updraft, vort the strongest rotation at 750 m near it)  FRAME_UV=auto|u,v (m/s, the child's frame over the parent's)
// The child's frames: <out>.cdbz.i8 (reflectivity, dBZ rounded, -30 for none, in the order frame, level, y, x), <out>.cvz.u8 (the reflectivity-weighted fall speed, 0.25 m/s downward, 0 for none, the same order),
// <out>.cuvw.i16 (u, v, w in 0.01 m/s at the cell centres, in the child's frame, order frame, component, level, y, x) and <out>.json (grid, times, the parent's motion over the ground, the child's frame, where the child lies, its south-west corner in the box at each frame, the parent's grid, its updraft track and the base state);
// with PARENT_FRAMES the parent's box at the same times in the same kinds of files (<out>.pdbz.i8, <out>.pvz.u8, <out>.puvw.i16: tools/severe_research/make_nest_pack.mjs makes a pack of the two); the log has, every DIAG_EVERY seconds, the strongest rotation,
// the lowest pressure and the strongest wind of the lowest level over the ground, with the places, and what the criteria of plan 6.8 ask (z1km: the rotation near 1 km above the lowest level's strongest, adj: the cells joined to it
// by their sides with a rotation of 0.1 per second or more, pmed: the median pressure change of the level, what the vortex is under); vortex_series.py reads the lines and says whether a log has a tornado-like vortex.
import '../../src/severe-core.js';
import '../../src/severe-nest.js';
import '../../src/severe-refl.js';
import { loadSounding, bubble } from './wk82.mjs';
import { readFileSync, writeFileSync, openSync, writeSync, closeSync, renameSync } from 'node:fs';

const C = globalThis.HFSevereCore, NEST = globalThis.HFSevereNest, { P0, CP, RD } = C.consts;
const [mode, a1, a2, a3] = process.argv.slice(2);
const E = (k, d) => (process.env[k] === undefined ? d : +process.env[k]);
const PDX = E('PDX', 500), L = E('BOX_KM', 84) * 1000, DT = E('DT', 4), ICE = E('ICE', 1) !== 0, QV = E('QV_SCALE', 1), LLJ = E('LLJ', 0);
const ICEP = { n0g: E('N0G', 4e6), rhog: E('RHOG', 400), n0r: E('N0R', 8e6), evap: E('EVAP', 1) };          // the ice scheme's settings (the same in the parent and the child)
const BX = E('BUBBLE_X', L / 2000), BY = E('BUBBLE_Y', L / 2000);                       // where the warm bubble is, km: the storm drifts east in the box at about 8 m/s, so a bubble west of the middle keeps its first 100 minutes clear of the sponge on the east side
const NZ = 40, DZ = 500, MOTION = { u: 8.0998, v: 4.9419 };                                // the box's motion over the ground (wk82_run.mjs: the model's winds plus it are the ground's)
const snd = loadSounding(undefined, QV);

/* the environment: the sounding's winds, with a low-level jet added if LLJ > 0 (m/s of southerly wind at 800 m, tapering to nothing above 3 km): the Weisman-Klemp quarter circle has a 0-1 km
   shear of 6 m/s and a 0-1 km helicity of 40 m2/s2, which is not the day of a tornado; a stronger low level shear and a veering wind put the storm in a more tornadic setting */
const jet = (z) => LLJ * Math.sin(Math.PI * Math.min(z, 3000) / 3000) ** 2 * (z < 3000 ? 1 : 0);
const wind = { u: (z) => snd.u(z), v: (z) => snd.v(z) + jet(z) };
const parentOpts = () => ({ nx: Math.round(L / PDX), ny: Math.round(L / PDX), nz: NZ, dx: PDX, dy: PDX, dz: DZ, moist: true, ice: ICE, iceParams: ICEP, theta: snd.theta, qv: snd.qv, wind,
  bc: { x: 'periodic', y: 'periodic' }, visc: { kh: 500 * PDX / 2000, kv: 500 * PDX / 2000 }, damp: { top: { depth: 5000, rate: 0.003 }, lateral: { width: 10000, rate: 0.02 } } });

function newParent() {
  const core = C.create(parentOpts()), S = core.S, idx = core.idx, b = core.base, xc = BX * 1000, yc = BY * 1000, nx = core.nx, ny = core.ny;
  for (let k = 0; k < NZ; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const o = idx(i, j, k); S.th[o] = bubble((i + 0.5) * PDX, (j + 0.5) * PDX, (k + 0.5) * DZ, xc, yc); S.u[o] = b.ubc[k]; S.v[o] = b.vbc[k]; }
  core.fill(); return core;
}
/* where the strongest updraft of the middle levels is, in the parent (cell centres, metres, m/s), and the strongest low-level vertical vorticity near it */
function updraft(core, k = 10) {
  const S = core.S, idx = core.idx; let best = -1e9, bi = 0, bj = 0;
  for (let j = 0; j < core.ny; j++) for (let i = 0; i < core.nx; i++) { const w = S.w[idx(i, j, k)]; if (w > best) { best = w; bi = i; bj = j; } }
  return { x: (bi + 0.5) * core.dx, y: (bj + 0.5) * core.dy, w: best };
}
function vort(core, k, i0, i1, j0, j1) {                  // the strongest vertical vorticity dv/dx - du/dy at the cell corners of level k in the box of cells, and where (cell index), 1/s
  const S = core.S, idx = core.idx, sy = idx(0, 1, 0) - idx(0, 0, 0); let best = -1e9, bi = 0, bj = 0, worst = 1e9;
  for (let j = Math.max(1, j0); j < Math.min(core.ny, j1); j++) for (let i = Math.max(1, i0); i < Math.min(core.nx, i1); i++) {
    const o = idx(i, j, k), z = (S.v[o] - S.v[o - 1]) / core.dx - (S.u[o] - S.u[o - sy]) / core.dy;
    if (z > best) { best = z; bi = i; bj = j; } if (z < worst) worst = z;
  }
  return { z: best, i: bi, j: bj, min: worst };
}

/* the frame of a core for the radar (as wk82_run.mjs records one): `take()` fills dbz (dBZ rounded, -30 for none, in the order level, y, x), vz (the reflectivity-weighted fall speed in 0.25 m/s steps downward, 0 for none)
   and uvw (u, v, w at the cell centres in 0.01 m/s, in the core's own frame, in the order component, level, y, x) from the core's state */
function recorder(core) {
  const nx = core.nx, ny = core.ny, nz = core.nz, per = nx * ny * nz, S = core.S, ix = core.idx, sy = ix(0, 1, 0) - ix(0, 0, 0), sz = ix(0, 0, 1) - ix(0, 0, 0);
  const refl = globalThis.HFSevereRefl.create(core), dcol = new Float64Array(nz), vcol = new Float64Array(nz), dbz = new Int8Array(per), vz = new Uint8Array(per), uvw = new Int16Array(3 * per);
  const q16 = (x) => Math.max(-32767, Math.min(32767, Math.round(x * 100)));
  return {
    dbz, vz, uvw,
    take() {
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        refl.column(i, j, dcol, vcol);
        for (let k = 0; k < nz; k++) { const q = (k * ny + j) * nx + i; dbz[q] = Math.max(-30, Math.min(100, Math.round(dcol[k]))); vz[q] = dcol[k] > -29 ? Math.max(0, Math.min(255, Math.round(4 * vcol[k]))) : 0; }
      }
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const o = ix(i, j, k), q = (k * ny + j) * nx + i;
        uvw[q] = q16(0.5 * (S.u[o] + S.u[o + 1])); uvw[per + q] = q16(0.5 * (S.v[o] + S.v[o + sy])); uvw[2 * per + q] = q16(0.5 * (S.w[o] + S.w[o + sz]));
      }
    },
  };
}

function writeCkpt(core, track, file) {
  const st = core.getState(), names = Object.keys(st.f), head = JSON.stringify({ v: 1, time: st.time, nx: st.nx, ny: st.ny, nz: st.nz, names, track: track.slice(), env: { PDX, L, DT, ICE, QV, LLJ, ICEP }, motion: MOTION, N: core.N });
  const hb = Buffer.from(head), hl = Buffer.alloc(4); hl.writeUInt32LE(hb.length);
  const bufs = [hl, hb]; for (const n of names) bufs.push(Buffer.from(st.f[n].buffer, st.f[n].byteOffset, st.f[n].byteLength));
  for (const a of [st.precip, st.precipS, st.precipG]) bufs.push(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  const all = Buffer.concat(bufs); writeFileSync(file + '.tmp', all); renameSync(file + '.tmp', file);     // written whole, then named: a run that is stopped in the middle of it leaves no half file
  console.log('wrote ' + file + ' (' + (all.length / 1e6).toFixed(0) + ' MB)');
}

/* a restart file: the header and the state (the settings in the header have to be the environment's, for the parent is made again as it was) */
function readCkpt(inFile) {
  const raw = readFileSync(inFile), hl = raw.readUInt32LE(0), head = JSON.parse(raw.subarray(4, 4 + hl).toString());
  const here = { PDX, L, DT, ICE, QV, LLJ, ICEP };                                  // the child's parent has to be made as the restart's was: the settings in the environment must be the run's
  for (const k of Object.keys(head.env)) if (JSON.stringify(head.env[k]) !== JSON.stringify(here[k])) throw new Error('the restart was made with ' + k + ' = ' + JSON.stringify(head.env[k]) + ' and this run has ' + JSON.stringify(here[k]) + ': set it in the environment');
  const parent = newParent(); let off = 4 + hl;
  const st = { time: head.time, nx: head.nx, ny: head.ny, nz: head.nz, f: {}, precip: null, precipS: null, precipG: null };
  const take = (len) => { const a = new Float64Array(raw.buffer.slice(raw.byteOffset + off, raw.byteOffset + off + len * 8)); off += len * 8; return a; };
  for (const n of head.names) st.f[n] = take(head.N);
  st.precip = take(parent.nx * parent.ny); st.precipS = take(parent.nx * parent.ny); st.precipG = take(parent.nx * parent.ny);
  parent.setState(st);
  return { parent, head };
}

if (mode === 'parent') {
  const out = a1, minutes = +a2, from = process.env.FROM, at = (process.env.CKPT_AT || '').split(',').filter(Boolean).map(Number), t0 = Date.now();
  let core, track = [], m = 0;                                                       // m: the minutes done
  if (from) { const r = readCkpt(from); core = r.parent; track = r.head.track.slice(); m = Math.round(core.time / 60); } else core = newParent();
  const steps = Math.round((minutes - m) * 60 / DT);
  console.log('parent ' + core.nx + 'x' + core.ny + 'x' + core.nz + ' cells of ' + PDX + ' m, ' + steps + ' steps of ' + DT + ' s' + (from ? ' from minute ' + m : '') + (at.length ? ', restart files at minutes ' + at.join(', ') : ''));
  for (let n = 0; n < steps; n++) {
    core.step(DT);
    if (Math.round(core.time) % 60 === 0 && core.time - m * 60 >= 59.9) {
      m++; const u = updraft(core), d = core.diag(); track.push([m, u.x, u.y, +u.w.toFixed(1)]);
      if (m % 5 === 0) {
        const z0 = vort(core, 0, 0, core.nx, 0, core.ny), z1 = vort(core, 1, 0, core.nx, 0, core.ny);
        console.log('t=' + String(m).padStart(3) + ' min  wmax ' + d.wmax.toFixed(1) + ' at (' + (u.x / 1000).toFixed(1) + ', ' + (u.y / 1000).toFixed(1) + ') km  thv_min ' + d.thvmin.toFixed(2) + ' K  zeta 250 m ' + (z0.z * 1000).toFixed(1) + ' (' + (z0.i * PDX / 1000).toFixed(1) + ', ' + (z0.j * PDX / 1000).toFixed(1) + '), 750 m ' + (z1.z * 1000).toFixed(1) + ' 1e-3/s  (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
      }
      if (at.includes(m) && m < minutes) writeCkpt(core, track, out.replace(/(\.ckpt)?$/, '.' + m + '$1'));
    }
  }
  writeCkpt(core, track, out);
} else if (mode === 'child') {
  const inFile = a1, out = a2, minutes = +a3, { parent, head } = readCkpt(inFile);
  /* the child: where it lies and how it moves over the parent */
  const CDX = E('CDX', 100), CDZ = E('CDZ', 200), CL = E('CL', 12) * 1000, RATIO = E('RATIO', 4), DRAG = E('DRAG', 1) !== 0, Z0 = E('Z0', 0.1), KHC = E('KHC', 0.25);
  const track = head.track, last = track[track.length - 1], prev = track[Math.max(0, track.length - 11)];
  const mv = process.env.FRAME_UV && process.env.FRAME_UV !== 'auto' ? process.env.FRAME_UV.split(',').map(Number) : [(last[1] - prev[1]) / ((last[0] - prev[0]) * 60 || 1), (last[2] - prev[2]) / ((last[0] - prev[0]) * 60 || 1)];
  const fr = { u: +mv[0].toFixed(2), v: +mv[1].toFixed(2) };
  let cen = process.env.CENTRE && process.env.CENTRE !== 'auto' && process.env.CENTRE !== 'vort' ? process.env.CENTRE.split(',').map((v) => +v * 1000) : [last[1], last[2]];
  if (process.env.CENTRE === 'vort') {                       // the strongest vertical vorticity at 750 m within 10 km of the strongest updraft
    const v = vort(parent, 1, Math.floor((last[1] - 10000) / PDX), Math.ceil((last[1] + 10000) / PDX), Math.floor((last[2] - 10000) / PDX), Math.ceil((last[2] + 10000) / PDX));
    cen = [v.i * PDX, v.j * PDX]; console.log('the strongest rotation at 750 m in the parent: ' + (v.z * 1000).toFixed(1) + ' 1e-3/s at (' + (cen[0] / 1000).toFixed(1) + ', ' + (cen[1] / 1000).toFixed(1) + ') km, ' + (Math.hypot(cen[0] - last[1], cen[1] - last[2]) / 1000).toFixed(1) + ' km from the updraft');
  }
  const x0 = Math.round((cen[0] - CL / 2) / PDX) * PDX, y0 = Math.round((cen[1] - CL / 2) / PDX) * PDX, nxc = Math.round(CL / CDX), nzc = Math.round(NZ * DZ / CDZ);
  const mot = head.motion, frame = { u: mot.u + fr.u, v: mot.v + fr.v };                  // the child's frame over the ground
  const child = C.create({ nx: nxc, ny: nxc, nz: nzc, dx: CDX, dy: CDX, dz: CDZ, moist: true, ice: ICE, iceParams: ICEP, theta: snd.theta, qv: snd.qv,
    wind: { u: (z) => wind.u(z) - fr.u, v: (z) => wind.v(z) - fr.v }, bc: { x: 'driven', y: 'driven' }, relax: { width: Math.max(6, Math.round(1000 / CDX)) },
    visc: { kh: KHC * CDX, kv: KHC * CDX }, damp: { top: { depth: 5000, rate: 0.003 } }, drag: DRAG ? { z0: Z0, frame } : null });
  const nest = NEST.create({ parent, child, ratio: RATIO, x0, y0, frame: fr }); nest.init();
  const PA = E('PERTURB', 0), PSEED = E('SEED', 1);
  if (PA) {                                                  // a copy that differs by noise on theta below 3 km (mulberry32, so that a seed gives the same copy again)
    let sd = PSEED >>> 0; const rnd = () => { sd = (sd + 0x6D2B79F5) | 0; let t = Math.imul(sd ^ (sd >>> 15), 1 | sd); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (let k = 0; k < nzc; k++) if ((k + 0.5) * CDZ < 3000) for (let j = 0; j < nxc; j++) for (let i = 0; i < nxc; i++) child.S.th[child.idx(i, j, k)] += PA * (2 * rnd() - 1);
    child.fill();
  }
  console.log('child ' + nxc + 'x' + nxc + 'x' + nzc + ' cells of ' + CDX + ' x ' + CDZ + ' m from (' + (x0 / 1000) + ', ' + (y0 / 1000) + ') km in the parent, its frame moves at (' + fr.u + ', ' + fr.v + ') m/s over the parent\'s, ' + RATIO + ' steps per parent step of ' + DT + ' s, drag ' + (DRAG ? 'cd ' + child.drag.cd.toFixed(5) : 'off'));
  const FE = E('FRAME_EVERY', 60), DE = E('DIAG_EVERY', 10), steps = Math.round(minutes * 60 / DT), t0 = Date.now(), tStart = parent.time, times = [];
  const PF = FE > 0 && E('PARENT_FRAMES', 1) !== 0, ptrack = [], corners = [];                  // the parent's box at the child's frame times too (the pack's box: tools/severe_research/make_nest_pack.mjs)
  const fd = FE ? openSync(out + '.cdbz.i8', 'w') : -1, fv = FE ? openSync(out + '.cuvw.i16', 'w') : -1, fz = FE ? openSync(out + '.cvz.u8', 'w') : -1;
  const pfd = PF ? openSync(out + '.pdbz.i8', 'w') : -1, pfv = PF ? openSync(out + '.puvw.i16', 'w') : -1, pfz = PF ? openSync(out + '.pvz.u8', 'w') : -1;
  const CS = child.S, ci = child.idx, rec = recorder(child), prec = PF ? recorder(parent) : null;       // reflectivity and fall speed as in wk82_run.mjs (src/severe-refl.js)
  /* how the child agrees with its parent: at the parent's cell centres inside the child (away from its relaxation zone) the child's field is taken by trilinear interpolation and set against the parent's own, at one level;
     the mean of each, the rms of the difference and the parent's own spread, for w at 5.25 km, theta' at 1.25 km, the speed over the ground at 250 m and the water vapour at 1.25 km */
  const AE = E('AGREE_EVERY', 60); let nextAgree = AE;
  const cAt = (a, ox, oy, oz, x, y, z) => {                       // the child's array a (a kind with offsets ox, oy, oz in cells) at the child's own coordinates (metres)
    const fi = x / CDX - ox, fj = y / CDX - oy, fk = z / CDZ - oz; let i0 = Math.floor(fi), j0 = Math.floor(fj), k0 = Math.floor(fk);
    const wx = fi - i0, wy = fj - j0, wz = fk - k0; i0 = Math.max(0, Math.min(nxc - 2, i0)); j0 = Math.max(0, Math.min(nxc - 2, j0)); k0 = Math.max(0, Math.min(nzc - 2, k0));
    const o = ci(i0, j0, k0), sy = ci(0, 1, 0) - ci(0, 0, 0), sz = ci(0, 0, 1) - ci(0, 0, 0);
    const c = (d) => a[o + d] * (1 - wx) + a[o + d + 1] * wx, f = (d) => c(d) * (1 - wy) + c(d + sy) * wy;
    return f(0) * (1 - wz) + f(sz) * wz;
  };
  function agree(tt) {
    const PS = parent.S, pidx = parent.idx, psy = pidx(0, 1, 0) - pidx(0, 0, 0), cx = x0 + fr.u * tt, cy = y0 + fr.v * tt, m = child.relaxWidth * CDX + 1000, out = [];       // the interior: 1 km and the relaxation width inside the child's side
    const rows = [['w 5 km', 10, 5000, (o) => PS.w[o], (x, y, z) => cAt(CS.w, 0.5, 0.5, 0, x, y, z)],
                  ["th' 1.25 km", 2, 1250, (o) => PS.th[o], (x, y, z) => cAt(CS.th, 0.5, 0.5, 0.5, x, y, z)],
                  ["qv' 1.25 km", 2, 1250, (o) => PS.qv[o], (x, y, z) => cAt(CS.qv, 0.5, 0.5, 0.5, x, y, z)],
                  ['speed 250 m', 0, 250, (o) => Math.hypot(0.5 * (PS.u[o] + PS.u[o + 1]), 0.5 * (PS.v[o] + PS.v[o + psy])), (x, y, z) => Math.hypot(cAt(CS.u, 0, 0.5, 0.5, x, y, z) + fr.u, cAt(CS.v, 0.5, 0, 0.5, x, y, z) + fr.v)]];
    for (const [name, kp, z, pv, cv] of rows) {
      let n = 0, sp = 0, sc = 0, sd = 0, spp = 0;
      for (let j = 0; j < parent.ny; j++) for (let i = 0; i < parent.nx; i++) {
        const xp = (i + 0.5) * PDX - cx, yp = (j + 0.5) * PDX - cy; if (xp < m || yp < m || xp > CL - m || yp > CL - m) continue;
        const a = pv(pidx(i, j, kp)), b = cv(xp, yp, z);
        n++; sp += a; sc += b; sd += (b - a) * (b - a); spp += a * a;
      }
      out.push(name + ' parent ' + (sp / n).toFixed(2) + ' child ' + (sc / n).toFixed(2) + ' rms diff ' + Math.sqrt(sd / n).toFixed(2) + ' (spread ' + Math.sqrt(Math.max(0, spp / n - (sp / n) ** 2)).toFixed(2) + ')');
    }
    console.log('  nest agreement at ' + tt.toFixed(0) + ' s: ' + out.join(' | '));
  }
  let nextDiag = DE, nextFrame = FE;
  const dpBuf = new Float64Array(nxc * nxc), k1km = Math.max(0, Math.round(1000 / CDZ - 0.5));                         // the lowest level's pressure change (for its median), and the level near 1 km
  const zAt = (i, j) => (i < 1 || j < 1 || i >= nxc || j >= nxc ? -1e9 : (CS.v[ci(i, j, 0)] - CS.v[ci(i - 1, j, 0)]) / CDX - (CS.u[ci(i, j, 0)] - CS.u[ci(i, j - 1, 0)]) / CDX);       // the lowest level's vertical vorticity at a cell corner
  for (let n = 0; n < steps; n++) {
    nest.step(DT); const tt = parent.time - tStart;
    if (AE && tt + 1e-6 >= nextAgree) { nextAgree += AE; agree(tt); }
    if (DE && tt + 1e-6 >= nextDiag) {
      nextDiag += DE;
      const kk = 1, zc = vort(child, kk, 0, nxc, 0, nxc), z0v = vort(child, 0, 0, nxc, 0, nxc);
      let pmin = 1e9, pi_ = 0, pj = 0, vmax = 0, vi = 0, vj = 0, wmax = -1e9, wi = 0, wj = 0, wk = 0;
      const pib0 = child.base.pibc[0];
      for (let j = 0; j < nxc; j++) for (let i = 0; i < nxc; i++) {
        const o = ci(i, j, 0), dp = (P0 * Math.pow(pib0 + CS.pi[o], CP / RD) - P0 * Math.pow(pib0, CP / RD)) / 100, ug = CS.u[o] + frame.u, vg = CS.v[o] + frame.v, sp = Math.hypot(ug, vg);
        dpBuf[j * nxc + i] = dp; if (dp < pmin) { pmin = dp; pi_ = i; pj = j; } if (sp > vmax) { vmax = sp; vi = i; vj = j; }
      }
      for (let k = 0; k < nzc; k++) for (let j = 0; j < nxc; j++) for (let i = 0; i < nxc; i++) { const w = CS.w[ci(i, j, k)]; if (w > wmax) { wmax = w; wi = i; wj = j; wk = k; } }
      /* what the criteria of plan 6.8 ask of a vortex: the rotation at 1 km above the lowest level's strongest, the cells joined (by their sides) to it with 0.1 per second or more, and the surroundings' pressure (the median of the level) */
      const zk = vort(child, k1km, z0v.i - 3, z0v.i + 4, z0v.j - 3, z0v.j + 4), srt = Float64Array.from(dpBuf).sort(), pmed = srt[srt.length >> 1];
      let adj = 0;
      if (zAt(z0v.i, z0v.j) >= 0.1) { const seen = new Set([z0v.j * nxc + z0v.i]), st = [[z0v.i, z0v.j]]; while (st.length) { const [i, j] = st.pop(); adj++; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj, key = b * nxc + a; if (!seen.has(key) && zAt(a, b) >= 0.1) { seen.add(key); st.push([a, b]); } } } }
      console.log('t=' + tt.toFixed(0).padStart(5) + ' s  zeta0 ' + (z0v.z * 1000).toFixed(0) + ' (' + z0v.i + ',' + z0v.j + ') zeta1 ' + (zc.z * 1000).toFixed(0) + ' 1e-3/s  pmin ' + pmin.toFixed(1) + ' hPa (' + pi_ + ',' + pj + ')  vmax0 ' + vmax.toFixed(1) + ' m/s (' + vi + ',' + vj + ')  wmax ' + wmax.toFixed(1) + ' at (' + wi + ',' + wj + ',' + wk + ')  [' + ((Date.now() - t0) / 1000).toFixed(0) + ' s]  z1km ' + (zk.z * 1000).toFixed(0) + ' adj ' + adj + ' pmed ' + pmed.toFixed(1));
    }
    if (FE && tt + 1e-6 >= nextFrame) {
      nextFrame += FE; times.push(+tt.toFixed(1)); corners.push([+(x0 + fr.u * tt).toFixed(1), +(y0 + fr.v * tt).toFixed(1)]);     // the child's south-west corner in the parent's box at this frame (src/severe-nest.js)
      rec.take(); writeSync(fd, Buffer.from(rec.dbz.buffer)); writeSync(fv, Buffer.from(rec.uvw.buffer)); writeSync(fz, Buffer.from(rec.vz.buffer));
      if (PF) {
        prec.take(); writeSync(pfd, Buffer.from(prec.dbz.buffer)); writeSync(pfv, Buffer.from(prec.uvw.buffer)); writeSync(pfz, Buffer.from(prec.vz.buffer));
        const u = updraft(parent); ptrack.push([Math.round(u.x), Math.round(u.y), +u.w.toFixed(1)]);
      }
    }
  }
  if (FE) { closeSync(fd); closeSync(fv); closeSync(fz); }
  if (PF) { closeSync(pfd); closeSync(pfv); closeSync(pfz); }
  const pb = parent.base, pbase = { z: Array.from(pb.rhoc, (_, k) => (k + 0.5) * DZ), u: Array.from(pb.ubc, (v) => +(v + mot.u).toFixed(3)), v: Array.from(pb.vbc, (v) => +(v + mot.v).toFixed(3)) };      // the base state's winds over the ground (what a clear-air echo outside the box follows)
  writeFileSync(out + '.json', JSON.stringify({ v: 1, vz: { scale: 0.25 }, nx: nxc, ny: nxc, nz: nzc, dx: CDX, dz: CDZ, times, startMinute: tStart / 60, frame: fr, motion: mot, x0, y0, parentDx: PDX, ratio: RATIO, drag: DRAG, perturb: PA ? { amp: PA, seed: PSEED } : null, env: head.env,
    corners, parent: PF ? { nx: parent.nx, ny: parent.ny, nz: parent.nz, dx: PDX, dz: DZ, track: ptrack, base: pbase } : null }));
  console.log('done (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
} else { console.error('usage: wk82_nest.mjs parent <out.ckpt> <minutes> | child <in.ckpt> <out> <minutes>'); process.exit(1); }
