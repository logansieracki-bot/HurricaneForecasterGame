// The first real storm: the Weisman-Klemp (1982) supercell on WRF's test/em_quarter_ss geometry, run with the Severe core (src/severe-core.js, moist, Kessler).
//   node tools/severe_research/wk82_run.mjs <dx m> <minutes> <dt s> <out.json> [frameMinutes=5]
// 2 km: 42 x 42 x 40 cells (84 km square, 20 km deep, 500 m levels), the sounding's winds already shifted so that the storm stays in the box, periodic sides with a
// 10 km sponge, a 5 km Rayleigh layer under the lid, a constant viscosity of 500 m2/s (WRF's khdif/kvdif for this case at 2 km), a +3 K bubble 10 km x 10 km x 1.5 km.
// It prints, every five minutes: the strongest updraft and where it is, the coldest air at the ground, cloud and rain water, the strongest rain, low-level and mid-level
// vertical vorticity, the updraft helicity (2-5 km), and the updraft cores at 5 km (a count above 1 is a split). Frames (2-D maps) go to the JSON.
import '../../src/severe-core.js';
import { loadSounding, bubble } from './wk82.mjs';
import { writeFileSync } from 'node:fs';

const C = globalThis.HFSevereCore;
const dx = +process.argv[2] || 2000, minutes = +process.argv[3] || 60, dt = +process.argv[4] || 10, out = process.argv[5] || 'wk82.json', frameMin = +process.argv[6] || 5;
const L = 84000, nx = Math.round(L / dx), ny = nx, nz = 40, dz = 500, snd = loadSounding();
const core = C.create({ nx, ny, nz, dx, dy: dx, dz, moist: true, theta: snd.theta, qv: snd.qv, wind: { u: snd.u, v: snd.v }, bc: { x: 'periodic', y: 'periodic' },
                        visc: { kh: 500 * dx / 2000, kv: 500 * dx / 2000 }, damp: { top: { depth: 5000, rate: 0.003 }, lateral: { width: 10000, rate: 0.02 } } });
const S = core.S, idx = core.idx, b = core.base, xc = L / 2, yc = L / 2;
for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
  const o = idx(i, j, k);
  S.th[o] = bubble((i + 0.5) * dx, (j + 0.5) * dx, (k + 0.5) * dz, xc, yc); S.u[o] = b.ubc[k]; S.v[o] = b.vbc[k];
}
core.fill();

const dbz = (rho, qr) => { const g = rho * qr * 1000; return g > 1e-6 ? 10 * Math.log10(17300 * Math.pow(g, 1.75)) : -30; };      // WRF's Kessler reflectivity (Marshall-Palmer rain)
function zeta(i, j, k) {                                  // vertical vorticity at a cell centre, from the winds averaged to centres
  const o = idx(i, j, k), sx = 1, sy = core.idx(0, 1, 0) - core.idx(0, 0, 0);
  const vc = (q) => 0.5 * (S.v[q] + S.v[q + sy]), uc = (q) => 0.5 * (S.u[q] + S.u[q + 1]);
  return (vc(o + sx) - vc(o - sx)) / (2 * dx) - (uc(o + sy) - uc(o - sy)) / (2 * dx);
}
function cores(k, thr) {                                  // the updraft cores of a level: connected cells above thr, their strongest value and place (km)
  const seen = new Uint8Array(nx * ny), res = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (seen[j * nx + i] || S.w[idx(i, j, k)] < thr) continue;
    const st = [[i, j]]; seen[j * nx + i] = 1; let wm = -1, wi = i, wj = j;
    while (st.length) { const [a, c] = st.pop(), w = S.w[idx(a, c, k)]; if (w > wm) { wm = w; wi = a; wj = c; }
      for (const [da, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const aa = a + da, cc = c + dc; if (aa < 0 || cc < 0 || aa >= nx || cc >= ny || seen[cc * nx + aa] || S.w[idx(aa, cc, k)] < thr) continue; seen[cc * nx + aa] = 1; st.push([aa, cc]); } }
    res.push({ w: +wm.toFixed(1), x: +((wi + 0.5) * dx / 1000).toFixed(0), y: +((wj + 0.5) * dx / 1000).toFixed(0) });
  }
  return res.sort((p, q) => q.w - p.w);
}
function water() { let w = 0; for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const o = idx(i, j, k); w += b.rhoc[k] * dz * dx * dx * (b.qvbc[k] + S.qv[o] + S.qc[o] + S.qr[o]); } for (const p of core.precip) w += p * dx * dx; return w; }

const frames = [], log = [], w0 = water(), t0 = Date.now(), k5 = Math.floor(5250 / dz), k1 = Math.floor(1000 / dz);
let nextFrame = 0;
for (let step = 0; step * dt <= minutes * 60; step++) {
  const t = step * dt;
  if (t >= nextFrame) {
    nextFrame += frameMin * 60;
    const d = core.diag();
    let wm = -1, wl = null, z1 = 0, z4 = 0, uh = 0, zmax = -99, pmax = 0;
    const comp = new Array(nx * ny), w5 = new Array(nx * ny), z1m = new Array(nx * ny), thv = new Array(nx * ny), pr = new Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let zc = -30, u2 = 0;
      for (let k = 0; k < nz; k++) {
        const o = idx(i, j, k), w = S.w[o];
        if (w > wm) { wm = w; wl = [(i + 0.5) * dx / 1000, (j + 0.5) * dx / 1000, (k + 0.5) * dz / 1000]; }
        zc = Math.max(zc, dbz(b.rhoc[k], S.qr[o]));
        if (zc > zmax) zmax = zc;
        if (k >= 4 && k < 10) { const wz = 0.5 * (w + S.w[o + core.idx(0, 0, 1) - core.idx(0, 0, 0)]); u2 += wz * zeta(i, j, k) * dz; }
      }
      uh = Math.max(uh, u2);
      const zl = zeta(i, j, k1), zm = Math.max(zeta(i, j, 6), zeta(i, j, 8));
      z1 = Math.max(z1, zl); z4 = Math.max(z4, zm); pmax = Math.max(pmax, core.precip[j * nx + i]);
      const o0 = idx(i, j, 0), q = j * nx + i;
      comp[q] = Math.round(zc); w5[q] = +S.w[idx(i, j, k5)].toFixed(1); z1m[q] = +(1000 * zl).toFixed(2);
      thv[q] = +((b.thc[0] + S.th[o0]) * (1 + 0.608 * (b.qvbc[0] + S.qv[o0]) - S.qc[o0] - S.qr[o0]) - b.thvc[0]).toFixed(2); pr[q] = +core.precip[q].toFixed(2);
    }
    const cs = cores(k5, 8), rec = { t: t / 60, wmax: +wm.toFixed(1), wloc: wl.map((v) => +v.toFixed(0)), thvmin: +d.thvmin.toFixed(2), qcmax: +(1000 * d.qcmax).toFixed(2), qrmax: +(1000 * d.qrmax).toFixed(2), zmax: Math.round(zmax),
                 zeta1km: +(1000 * z1).toFixed(1), zeta3_5km: +(1000 * z4).toFixed(1), uh: Math.round(uh), precipMax: +pmax.toFixed(1), cores5km: cs.slice(0, 4), water: +((water() - w0) / w0).toExponential(2), clipped: +core.stat.clipped.toExponential(1) };
    log.push(rec); frames.push({ t: t / 60, comp, w5, z1: z1m, thv, precip: pr });
    console.log(`t=${String(rec.t).padStart(3)} min  wmax ${String(rec.wmax).padStart(5)} m/s at (${rec.wloc.join(', ')}) km  thv_min ${rec.thvmin} K  qc ${rec.qcmax} qr ${rec.qrmax} g/kg  Zmax ${rec.zmax} dBZ  zeta(1km) ${rec.zeta1km} zeta(3-5km) ${rec.zeta3_5km} 1e-3/s  UH ${rec.uh}  rain ${rec.precipMax} mm  cores@5km ${JSON.stringify(rec.cores5km.map((c) => c.w + '@' + c.x + ',' + c.y))}  budget ${rec.water}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    if (!Number.isFinite(rec.wmax) || rec.wmax > 120) { console.log('BLEW UP'); break; }
  }
  core.step(dt);
}
writeFileSync(out, JSON.stringify({ dx, nx, ny, nz, dz, dt, log, frames }));
console.log('wrote ' + out);
