#!/usr/bin/env node
// The Weisman-Klemp (1982) storm with a finer nest in it (docs/severe-plan.md 6.8): the parent is the recorder's own run (wk82_run.mjs: 500 m cells, 84 km box, 500 m levels, Kessler or ice
// microphysics as there), the child a core of 100 to 250 m cells round the storm's low-level rotation, driven at its sides by the parent (src/severe-nest.js), with the drag of the ground.
//   [CKPT_AT=50,60] node tools/severe_research/wk82_nest.mjs parent <out.ckpt> <minutes>   the parent alone to <minutes>, then its state (the restart file; CKPT_AT also writes <out>.50.ckpt and so on on the way), with the track of its strongest updraft
//   node tools/severe_research/wk82_nest.mjs child  <in.ckpt> <out> <minutes>         from the restart: parent and child together for <minutes> more, the child's frames and a log
// Settings are environment variables (the defaults in brackets):
//   PDX=500 (m, the parent's cell)  BOX_KM=84  DT=4 (s, the parent's step)  ICE=1  QV_SCALE=1  LLJ=0 (m/s, a low-level jet added to the sounding's winds: see env())
//   N0G=4e6 RHOG=400 (graupel/hail)  N0R=8e6 (rain's intercept)  EVAP=1 (the rain's evaporation, times: the knob of the cold pool); the same in the parent and the child
//   CDX=100 (the child's cell)  CDZ=200 (its level)  CL=12 (km, its side)  RATIO=4 (child steps per parent step)  DRAG=1  Z0=0.1 (m)  KHC=0.25 (child viscosity: KHC * CDX m2/s)
//   FRAME_EVERY=60 (s between the child's frames; 0 for none)  DIAG_EVERY=10 (s)  CENTRE=auto|x,y (km, the child's centre in the parent's box)  FRAME_UV=auto|u,v (m/s, the child's frame over the parent's)
// The child's frames: <out>.cdbz.i8 (reflectivity, dBZ rounded, -30 for none, in the order frame, level, y, x), <out>.cuvw.i16 (u, v, w in 0.01 m/s at the cell centres, in the child's frame, order frame,
// component, level, y, x) and <out>.json (grid, times, the parent's motion over the ground, the child's frame, where the child lies); the log has, every DIAG_EVERY seconds, the strongest rotation,
// the lowest pressure and the strongest wind of the lowest level over the ground, with the places.
import '../../src/severe-core.js';
import '../../src/severe-nest.js';
import { loadSounding, bubble } from './wk82.mjs';
import { readFileSync, writeFileSync, openSync, writeSync, closeSync } from 'node:fs';

const C = globalThis.HFSevereCore, NEST = globalThis.HFSevereNest, { P0, CP, RD } = C.consts;
const [mode, a1, a2, a3] = process.argv.slice(2);
const E = (k, d) => (process.env[k] === undefined ? d : +process.env[k]);
const PDX = E('PDX', 500), L = E('BOX_KM', 84) * 1000, DT = E('DT', 4), ICE = E('ICE', 1) !== 0, QV = E('QV_SCALE', 1), LLJ = E('LLJ', 0);
const ICEP = { n0g: E('N0G', 4e6), rhog: E('RHOG', 400), n0r: E('N0R', 8e6), evap: E('EVAP', 1) };          // the ice scheme's settings (the same in the parent and the child)
const NZ = 40, DZ = 500, MOTION = { u: 8.0998, v: 4.9419 };                                // the box's motion over the ground (wk82_run.mjs: the model's winds plus it are the ground's)
const snd = loadSounding(undefined, QV);

/* the environment: the sounding's winds, with a low-level jet added if LLJ > 0 (m/s of southerly wind at 800 m, tapering to nothing above 3 km): the Weisman-Klemp quarter circle has a 0-1 km
   shear of 6 m/s and a 0-1 km helicity of 40 m2/s2, which is not the day of a tornado; a stronger low level shear and a veering wind put the storm in a more tornadic setting */
const jet = (z) => LLJ * Math.sin(Math.PI * Math.min(z, 3000) / 3000) ** 2 * (z < 3000 ? 1 : 0);
const wind = { u: (z) => snd.u(z), v: (z) => snd.v(z) + jet(z) };
const parentOpts = () => ({ nx: Math.round(L / PDX), ny: Math.round(L / PDX), nz: NZ, dx: PDX, dy: PDX, dz: DZ, moist: true, ice: ICE, iceParams: ICEP, theta: snd.theta, qv: snd.qv, wind,
  bc: { x: 'periodic', y: 'periodic' }, visc: { kh: 500 * PDX / 2000, kv: 500 * PDX / 2000 }, damp: { top: { depth: 5000, rate: 0.003 }, lateral: { width: 10000, rate: 0.02 } } });
const lamOf = (n0, rhox, rho, q) => Math.pow(Math.PI * rhox * n0 / (rho * q), 0.25);

function newParent() {
  const core = C.create(parentOpts()), S = core.S, idx = core.idx, b = core.base, xc = L / 2, yc = L / 2, nx = core.nx, ny = core.ny;
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

function writeCkpt(core, track, file) {
  const st = core.getState(), names = Object.keys(st.f), head = JSON.stringify({ v: 1, time: st.time, nx: st.nx, ny: st.ny, nz: st.nz, names, track: track.slice(), env: { PDX, L, DT, ICE, QV, LLJ }, motion: MOTION, N: core.N });
  const hb = Buffer.from(head), hl = Buffer.alloc(4); hl.writeUInt32LE(hb.length);
  const bufs = [hl, hb]; for (const n of names) bufs.push(Buffer.from(st.f[n].buffer, st.f[n].byteOffset, st.f[n].byteLength));
  for (const a of [st.precip, st.precipS, st.precipG]) bufs.push(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  const all = Buffer.concat(bufs); writeFileSync(file, all); console.log('wrote ' + file + ' (' + (all.length / 1e6).toFixed(0) + ' MB)');
}

if (mode === 'parent') {
  const out = a1, minutes = +a2, core = newParent(), track = [], t0 = Date.now(), at = (process.env.CKPT_AT || '').split(',').filter(Boolean).map(Number);
  let m = 0; const steps = Math.round(minutes * 60 / DT);
  console.log('parent ' + core.nx + 'x' + core.ny + 'x' + core.nz + ' cells of ' + PDX + ' m, ' + steps + ' steps of ' + DT + ' s' + (at.length ? ', restart files at minutes ' + at.join(', ') : ''));
  for (let n = 0; n < steps; n++) {
    core.step(DT);
    if (Math.round(core.time) % 60 === 0 && core.time - m * 60 >= 59.9) {
      m++; const u = updraft(core), d = core.diag(); track.push([m, u.x, u.y, +u.w.toFixed(1)]);
      if (m % 5 === 0) console.log('t=' + String(m).padStart(3) + ' min  wmax ' + d.wmax.toFixed(1) + ' at (' + (u.x / 1000).toFixed(1) + ', ' + (u.y / 1000).toFixed(1) + ') km  thv_min ' + d.thvmin.toFixed(2) + ' K  (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
      if (at.includes(m) && m < minutes) writeCkpt(core, track, out.replace(/(\.ckpt)?$/, '.' + m + '$1'));
    }
  }
  writeCkpt(core, track, out);
} else if (mode === 'child') {
  const inFile = a1, out = a2, minutes = +a3, raw = readFileSync(inFile), hl = raw.readUInt32LE(0), head = JSON.parse(raw.subarray(4, 4 + hl).toString());
  const parent = newParent(); let off = 4 + hl;
  const st = { time: head.time, nx: head.nx, ny: head.ny, nz: head.nz, f: {}, precip: null, precipS: null, precipG: null };
  const take = (len) => { const a = new Float64Array(raw.buffer.slice(raw.byteOffset + off, raw.byteOffset + off + len * 8)); off += len * 8; return a; };
  for (const n of head.names) st.f[n] = take(head.N);
  st.precip = take(parent.nx * parent.ny); st.precipS = take(parent.nx * parent.ny); st.precipG = take(parent.nx * parent.ny);
  parent.setState(st);
  /* the child: where it lies and how it moves over the parent */
  const CDX = E('CDX', 100), CDZ = E('CDZ', 200), CL = E('CL', 12) * 1000, RATIO = E('RATIO', 4), DRAG = E('DRAG', 1) !== 0, Z0 = E('Z0', 0.1), KHC = E('KHC', 0.25);
  const track = head.track, last = track[track.length - 1], prev = track[Math.max(0, track.length - 11)];
  const mv = process.env.FRAME_UV && process.env.FRAME_UV !== 'auto' ? process.env.FRAME_UV.split(',').map(Number) : [(last[1] - prev[1]) / ((last[0] - prev[0]) * 60 || 1), (last[2] - prev[2]) / ((last[0] - prev[0]) * 60 || 1)];
  const fr = { u: +mv[0].toFixed(2), v: +mv[1].toFixed(2) };
  const cen = process.env.CENTRE && process.env.CENTRE !== 'auto' ? process.env.CENTRE.split(',').map((v) => +v * 1000) : [last[1], last[2]];
  const x0 = Math.round((cen[0] - CL / 2) / PDX) * PDX, y0 = Math.round((cen[1] - CL / 2) / PDX) * PDX, nxc = Math.round(CL / CDX), nzc = Math.round(NZ * DZ / CDZ);
  const mot = head.motion, frame = { u: mot.u + fr.u, v: mot.v + fr.v };                  // the child's frame over the ground
  const child = C.create({ nx: nxc, ny: nxc, nz: nzc, dx: CDX, dy: CDX, dz: CDZ, moist: true, ice: ICE, iceParams: ICEP, theta: snd.theta, qv: snd.qv,
    wind: { u: (z) => wind.u(z) - fr.u, v: (z) => wind.v(z) - fr.v }, bc: { x: 'driven', y: 'driven' }, relax: { width: Math.max(6, Math.round(1000 / CDX)) },
    visc: { kh: KHC * CDX, kv: KHC * CDX }, damp: { top: { depth: 5000, rate: 0.003 } }, drag: DRAG ? { z0: Z0, frame } : null });
  const nest = NEST.create({ parent, child, ratio: RATIO, x0, y0, frame: fr }); nest.init();
  console.log('child ' + nxc + 'x' + nxc + 'x' + nzc + ' cells of ' + CDX + ' x ' + CDZ + ' m from (' + (x0 / 1000) + ', ' + (y0 / 1000) + ') km in the parent, its frame moves at (' + fr.u + ', ' + fr.v + ') m/s over the parent\'s, ' + RATIO + ' steps per parent step of ' + DT + ' s, drag ' + (DRAG ? 'cd ' + child.drag.cd.toFixed(5) : 'off'));
  const FE = E('FRAME_EVERY', 60), DE = E('DIAG_EVERY', 10), steps = Math.round(minutes * 60 / DT), t0 = Date.now(), tStart = parent.time, times = [];
  const fd = FE ? openSync(out + '.cdbz.i8', 'w') : -1, fv = FE ? openSync(out + '.cuvw.i16', 'w') : -1;
  const dbzC = new Int8Array(nxc * nxc * nzc), uvw = new Int16Array(3 * nxc * nxc * nzc), CS = child.S, ci = child.idx, KICE = 0.176 / 0.93;
  const zOf = (i, j, k) => {                                   // the reflectivity of a cell as in wk82_run.mjs (rain, and ice spheres of their density, the melting layer wet)
    const o = ci(i, j, k), rho = child.base.rhoc[k]; let z = 0;
    const qr = CS.qr[o], qs = CS.qs[o], qg = CS.qg[o];
    if (qr > 1e-9) z += 720 * 8e6 / Math.pow(lamOf(8e6, 1000, rho, qr), 7);
    if (qs > 1e-9) z += KICE * 720 * 2e6 * Math.exp(0.12 * Math.max(0, 273.15 - (child.base.thc[k] + CS.th[o]) * (child.base.pibc[k] + CS.pi[o]))) * Math.pow(100 / 1000, 2) / Math.pow(lamOf(Math.min(2e8, 2e6 * Math.exp(0.12 * Math.max(0, 273.15 - (child.base.thc[k] + CS.th[o]) * (child.base.pibc[k] + CS.pi[o])))), 100, rho, qs), 7);
    if (qg > 1e-9) z += KICE * 720 * 4e6 * Math.pow(400 / 1000, 2) / Math.pow(lamOf(4e6, 400, rho, qg), 7);
    return z > 1e-3 ? 10 * Math.log10(z * 1e18 / 1e18) : -30;
  };
  let nextDiag = DE, nextFrame = FE;
  for (let n = 0; n < steps; n++) {
    nest.step(DT); const tt = parent.time - tStart;
    if (DE && tt + 1e-6 >= nextDiag) {
      nextDiag += DE;
      const kk = 1, zc = vort(child, kk, 0, nxc, 0, nxc), z0v = vort(child, 0, 0, nxc, 0, nxc);
      let pmin = 1e9, pi_ = 0, pj = 0, vmax = 0, vi = 0, vj = 0, wmax = -1e9, wi = 0, wj = 0, wk = 0;
      const pib0 = child.base.pibc[0];
      for (let j = 0; j < nxc; j++) for (let i = 0; i < nxc; i++) {
        const o = ci(i, j, 0), dp = (P0 * Math.pow(pib0 + CS.pi[o], CP / RD) - P0 * Math.pow(pib0, CP / RD)) / 100, ug = CS.u[o] + frame.u, vg = CS.v[o] + frame.v, sp = Math.hypot(ug, vg);
        if (dp < pmin) { pmin = dp; pi_ = i; pj = j; } if (sp > vmax) { vmax = sp; vi = i; vj = j; }
      }
      for (let k = 0; k < nzc; k++) for (let j = 0; j < nxc; j++) for (let i = 0; i < nxc; i++) { const w = CS.w[ci(i, j, k)]; if (w > wmax) { wmax = w; wi = i; wj = j; wk = k; } }
      console.log('t=' + tt.toFixed(0).padStart(5) + ' s  zeta0 ' + (z0v.z * 1000).toFixed(0) + ' (' + z0v.i + ',' + z0v.j + ') zeta1 ' + (zc.z * 1000).toFixed(0) + ' 1e-3/s  pmin ' + pmin.toFixed(1) + ' hPa (' + pi_ + ',' + pj + ')  vmax0 ' + vmax.toFixed(1) + ' m/s (' + vi + ',' + vj + ')  wmax ' + wmax.toFixed(1) + ' at (' + wi + ',' + wj + ',' + wk + ')  [' + ((Date.now() - t0) / 1000).toFixed(0) + ' s]');
    }
    if (FE && tt + 1e-6 >= nextFrame) {
      nextFrame += FE; times.push(+tt.toFixed(1));
      for (let k = 0; k < nzc; k++) for (let j = 0; j < nxc; j++) for (let i = 0; i < nxc; i++) {
        const o = ci(i, j, k), q = (k * nxc + j) * nxc + i, z = zOf(i, j, k);
        dbzC[q] = Math.max(-30, Math.min(100, Math.round(z)));
        uvw[q] = Math.max(-32767, Math.min(32767, Math.round(0.5 * (CS.u[o] + CS.u[o + 1]) * 100))); uvw[nxc * nxc * nzc + q] = Math.max(-32767, Math.min(32767, Math.round(0.5 * (CS.v[o] + CS.v[o + child.idx(0, 1, 0) - child.idx(0, 0, 0)]) * 100)));
        uvw[2 * nxc * nxc * nzc + q] = Math.max(-32767, Math.min(32767, Math.round(0.5 * (CS.w[o] + CS.w[o + child.idx(0, 0, 1) - child.idx(0, 0, 0)]) * 100)));
      }
      writeSync(fd, Buffer.from(dbzC.buffer)); writeSync(fv, Buffer.from(uvw.buffer));
    }
  }
  if (FE) { closeSync(fd); closeSync(fv); }
  writeFileSync(out + '.json', JSON.stringify({ v: 1, nx: nxc, ny: nxc, nz: nzc, dx: CDX, dz: CDZ, times, startMinute: tStart / 60, frame: fr, motion: mot, x0, y0, parentDx: PDX, ratio: RATIO, drag: DRAG, env: head.env }));
  console.log('done (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
} else { console.error('usage: wk82_nest.mjs parent <out.ckpt> <minutes> | child <in.ckpt> <out> <minutes>'); process.exit(1); }
