// The first real storm: the Weisman-Klemp (1982) supercell on WRF's test/em_quarter_ss geometry, run with the Severe core (src/severe-core.js, moist), with the
// warm-rain scheme of Kessler (ice = 0) or with ice: cloud water, rain, cloud ice, snow and graupel/hail (ice = 1, the default).
//   [QV_SCALE=1.25] node tools/severe_research/wk82_run.mjs <dx m> <minutes> <dt s> <out.json> [frameMinutes=5] [ice=1] [n0g=4e6 m-4] [rhog=400 kg/m3]
// 2 km: 42 x 42 x 40 cells (84 km square, 20 km deep, 500 m levels), the sounding's winds already shifted so that the storm stays in the box, periodic sides with a
// 10 km sponge, a 5 km Rayleigh layer under the lid, a constant viscosity of 500 m2/s (WRF's khdif/kvdif for this case at 2 km), a +3 K bubble 10 km x 10 km x 1.5 km.
// It prints, every five minutes: the strongest updraft and where it is, the coldest air at the ground, cloud, rain and ice water, the strongest reflectivity, low-level and
// mid-level vertical vorticity, the updraft helicity (2-5 km), the updraft cores at 5 km (a count above 1 is a split), the 10 dBZ echo top and the ice water path.
// Frames (2-D maps and two vertical slices through the strongest updraft) go to the JSON; the whole 3-D reflectivity of every frame goes to <out>.dbz3d.i8 (signed bytes,
// dBZ rounded, -30 for none, in the order frame, level, y, x) for the comparison with real radar (nexrad_cfad.py).
// The winds go to <out>.wind3d.i16 (signed 16-bit, 0.01 m/s, at the cell centres, in the order frame, component (u, v, w), level, y, x) and the reflectivity-weighted fall speed of the
// precipitation (what a Doppler radar adds to the vertical wind) to <out>.vz3d.u8 (0.25 m/s, 0 for none, downward, the order frame, level, y, x); the JSON has the frame's motion over the ground
// ("motion": a radar on the ground sees the model's winds plus this) and the base-state winds in the ground's frame ("base": the wind a clear-air return follows outside the box).
// Reflectivity is the Rayleigh value at 10 cm as WRF's refl10cm_lin computes it: rain 720 N0 / lambda^7; snow and graupel/hail as ice spheres of their density, with the
// dielectric factor 0.176/0.93 against water, rising to 1 as the ice gets wet below the melting level (the bright band).
import '../../src/severe-core.js';
import { loadSounding, bubble } from './wk82.mjs';
import { writeFileSync } from 'node:fs';

const C = globalThis.HFSevereCore;
const dx = +process.argv[2] || 2000, minutes = +process.argv[3] || 60, dt = +process.argv[4] || 10, out = process.argv[5] || 'wk82.json', frameMin = +process.argv[6] || 5;
const ice = (process.argv[7] === undefined ? 1 : +process.argv[7]) !== 0, n0g = +process.argv[8] || 4e6, rhog = +process.argv[9] || 400;     // graupel/hail intercept and density
const qvScale = +process.env.QV_SCALE || 1;                                                                // QV_SCALE=1.25: moister low levels, a larger CAPE (the larger-end scenarios)
const L = (+process.env.BOX_KM || 84) * 1000, nx = Math.round(L / dx), ny = nx, nz = 40, dz = 500, snd = loadSounding(undefined, qvScale);          // BOX_KM: the side of the box (84 km)
const core = C.create({ nx, ny, nz, dx, dy: dx, dz, moist: true, ice, iceParams: { n0g, rhog }, theta: snd.theta, qv: snd.qv, wind: { u: snd.u, v: snd.v }, bc: { x: 'periodic', y: 'periodic' },
                        visc: { kh: 500 * dx / 2000, kv: 500 * dx / 2000 }, damp: { top: { depth: 5000, rate: 0.003 }, lateral: { width: 10000, rate: 0.02 } } });
const S = core.S, idx = core.idx, b = core.base, xc = L / 2, yc = L / 2, T0 = 273.15;
for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
  const o = idx(i, j, k);
  S.th[o] = bubble((i + 0.5) * dx, (j + 0.5) * dx, (k + 0.5) * dz, xc, yc); S.u[o] = b.ubc[k]; S.v[o] = b.vbc[k];
}
core.fill();

/* ---- reflectivity (mm6/m3 -> dBZ) ---- */
const lamOf = (n0, rhox, rho, q) => Math.pow(Math.PI * rhox * n0 / (rho * q), 0.25);
const KICE = 0.176 / 0.93;                                                                               // |K|^2 of ice against water (WRF)
const zcol = new Float64Array(nz), tcol = new Float64Array(nz);
const dbzOf = (z) => z > 1e-3 ? 10 * Math.log10(z) : -30;
function dbzColumn(i, j, res, vzres) {                                                                // dBZ for every level of a column into res[k] (and the reflectivity-weighted fall speed into vzres[k])
  if (!ice) { for (let k = 0; k < nz; k++) { const q = S.qr[idx(i, j, k)], g = b.rhoc[k] * q * 1000; res[k] = g > 1e-6 ? 10 * Math.log10(17300 * Math.pow(g, 1.75)) : -30; if (vzres) vzres[k] = core.zFall.rain(q, k); } return; }   // WRF's Kessler reflectivity
  let kz = -1;                                                                                           // the highest level at or below freezing, then the first above it going down
  for (let k = nz - 1; k >= 0; k--) { const o = idx(i, j, k); tcol[k] = (b.thc[k] + S.th[o]) * (b.pibc[k] + S.pi[o]); }
  for (let k = nz - 1; k >= 0; k--) if (tcol[k] <= T0) { kz = k; break; }
  const msRef = kz >= 0 ? b.rhoc[kz] * S.qs[idx(i, j, kz)] : 0, mgRef = kz >= 0 ? b.rhoc[kz] * S.qg[idx(i, j, kz)] : 0;
  for (let k = 0; k < nz; k++) {
    const o = idx(i, j, k), rho = b.rhoc[k], T = tcol[k];
    let z = 0, zv = 0;
    if (S.qr[o] > 1e-9) { const l = lamOf(8e6, 1000, rho, S.qr[o]), zr = 720 * 8e6 / Math.pow(l, 7); z += zr; zv += zr * core.zFall.rain(S.qr[o], k); }
    for (const [q, n0, rx, mref, sp] of [[S.qs[o], Math.min(2e8, 2e6 * Math.exp(0.12 * Math.max(0, T0 - T))), 100, msRef, 'snow'], [S.qg[o], n0g, rhog, mgRef, 'graupel']]) {
      if (q <= 1e-9) continue;
      const l = lamOf(n0, rx, rho, q);
      let wet = 0;                                                                                       // water fraction: from what has melted since the freezing level (WRF)
      if (T > T0) wet = mref > 0 ? Math.max(0.005, Math.min(1 - rho * q / mref, 0.99)) : 0.99;
      const kk = KICE + (1 - KICE) * Math.min(1, wet / 0.25);                                            // a water coat on a quarter of the mass reflects like rain
      const zs = kk * Math.pow(rx / 900, 2) * 720 * n0 / Math.pow(l, 7);
      z += zs; zv += zs * (sp === 'snow' ? core.zFall.snow(q, k, o) : core.zFall.graupel(q, k));
    }
    res[k] = dbzOf(z * 1e18);
    if (vzres) vzres[k] = z > 0 ? zv / z : 0;
  }
}
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
function water() {
  let w = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const o = idx(i, j, k); w += b.rhoc[k] * dz * dx * dx * (b.qvbc[k] + S.qv[o] + S.qc[o] + S.qr[o] + S.qi[o] + S.qs[o] + S.qg[o]); }
  for (const p of core.precip) w += p * dx * dx;
  return w;
}

const nFrames = Math.floor(minutes / frameMin) + 1, d3 = new Int8Array(nFrames * nz * ny * nx), wnd = new Int16Array(nFrames * 3 * nz * ny * nx), vzf = new Uint8Array(nFrames * nz * ny * nx);
const sxc = 1, syc = core.idx(0, 1, 0) - core.idx(0, 0, 0), szc = core.idx(0, 0, 1) - core.idx(0, 0, 0), q16 = (v) => Math.max(-32767, Math.min(32767, Math.round(100 * v)));
const frames = [], log = [], w0 = water(), t0 = Date.now(), k5 = Math.floor(5250 / dz), k1 = Math.floor(1000 / dz), kfz = (() => { let k = 0; while (k < nz && (b.thc[k] * b.pibc[k]) > T0) k++; return k; })();
let nextFrame = 0;
for (let step = 0; step * dt <= minutes * 60; step++) {
  const t = step * dt;
  if (t >= nextFrame) {
    nextFrame += frameMin * 60;
    const d = core.diag();
    let wm = -1, wl = null, z1 = 0, z4 = 0, uh = 0, zmax = -99, pmax = 0, topMax = 0, iwpMax = 0, z1max = -99, qgcol = 0;
    const comp = new Array(nx * ny), r1 = new Array(nx * ny), w5 = new Array(nx * ny), z1m = new Array(nx * ny), thv = new Array(nx * ny), pr = new Array(nx * ny), top = new Array(nx * ny), iwp = new Array(nx * ny), hail = new Array(nx * ny);
    const col = new Float64Array(nz), vzc = new Float64Array(nz), nF = frames.length;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      dbzColumn(i, j, col, vzc);
      for (let k = 0; k < nz; k++) {
        const o = idx(i, j, k), at = ((nF * nz + k) * ny + j) * nx + i;
        d3[at] = Math.max(-30, Math.min(120, Math.round(col[k])));
        vzf[at] = col[k] > -29 ? Math.max(0, Math.min(255, Math.round(4 * vzc[k]))) : 0;
        wnd[((nF * 3 + 0) * nz + k) * ny * nx + j * nx + i] = q16(0.5 * (S.u[o] + S.u[o + sxc]));
        wnd[((nF * 3 + 1) * nz + k) * ny * nx + j * nx + i] = q16(0.5 * (S.v[o] + S.v[o + syc]));
        wnd[((nF * 3 + 2) * nz + k) * ny * nx + j * nx + i] = q16(0.5 * (S.w[o] + S.w[o + szc]));
      }
      let zc = -30, u2 = 0, tp = 0, ip = 0, hp = 0;
      for (let k = 0; k < nz; k++) {
        const o = idx(i, j, k), w = S.w[o];
        if (w > wm) { wm = w; wl = [(i + 0.5) * dx / 1000, (j + 0.5) * dx / 1000, (k + 0.5) * dz / 1000]; }
        zc = Math.max(zc, col[k]);
        if (col[k] > 10) tp = (k + 1) * dz / 1000;
        ip += b.rhoc[k] * dz * (S.qi[o] + S.qs[o] + S.qg[o]); hp += b.rhoc[k] * dz * S.qg[o];
        if (k >= 4 && k < 10) { const wz = 0.5 * (w + S.w[o + core.idx(0, 0, 1) - core.idx(0, 0, 0)]); u2 += wz * zeta(i, j, k) * dz; }
      }
      if (zc > zmax) zmax = zc;
      topMax = Math.max(topMax, tp); iwpMax = Math.max(iwpMax, ip); qgcol = Math.max(qgcol, hp); z1max = Math.max(z1max, col[k1]);
      uh = Math.max(uh, u2);
      const zl = zeta(i, j, k1), zm = Math.max(zeta(i, j, 6), zeta(i, j, 8));
      z1 = Math.max(z1, zl); z4 = Math.max(z4, zm); pmax = Math.max(pmax, core.precip[j * nx + i]);
      const o0 = idx(i, j, 0), q = j * nx + i;
      comp[q] = Math.round(zc); r1[q] = Math.round(col[k1]); w5[q] = +S.w[idx(i, j, k5)].toFixed(1); z1m[q] = +(1000 * zl).toFixed(2); top[q] = +tp.toFixed(1); iwp[q] = +ip.toFixed(2); hail[q] = +(core.precipG[q]).toFixed(2);
      thv[q] = +((b.thc[0] + S.th[o0]) * (1 + 0.608 * (b.qvbc[0] + S.qv[o0]) - S.qc[o0] - S.qr[o0] - S.qi[o0] - S.qs[o0] - S.qg[o0]) - b.thvc[0]).toFixed(2); pr[q] = +core.precip[q].toFixed(2);
    }
    // the two vertical slices through the strongest updraft (at 5 km): west-east at its y, south-north at its x
    const wi = Math.min(nx - 1, Math.floor(wl[0] * 1000 / dx)), wj = Math.min(ny - 1, Math.floor(wl[1] * 1000 / dx));
    const slice = (alongX) => {
      const n = alongX ? nx : ny, o = { dbz: [], w: [], qc: [], ice: [], qg: [], th: [] }, cc = new Float64Array(nz);
      for (let a = 0; a < n; a++) {
        dbzColumn(alongX ? a : wi, alongX ? wj : a, cc);
        for (let k = 0; k < nz; k++) {
          const q = alongX ? idx(a, wj, k) : idx(wi, a, k);
          (o.dbz[k] = o.dbz[k] || []).push(Math.round(cc[k])); (o.w[k] = o.w[k] || []).push(+S.w[q].toFixed(1)); (o.qc[k] = o.qc[k] || []).push(+(1000 * S.qc[q]).toFixed(2));
          (o.ice[k] = o.ice[k] || []).push(+(1000 * (S.qi[q] + S.qs[q])).toFixed(2)); (o.qg[k] = o.qg[k] || []).push(+(1000 * S.qg[q]).toFixed(2));
          (o.th[k] = o.th[k] || []).push(+((b.thc[k] + S.th[q]) * (b.pibc[k] + S.pi[q]) - T0).toFixed(1));
        }
      }
      return o;
    };
    const cs = cores(k5, 8), rec = { t: t / 60, wmax: +wm.toFixed(1), wloc: wl.map((v) => +v.toFixed(0)), thvmin: +d.thvmin.toFixed(2), qcmax: +(1000 * d.qcmax).toFixed(2), qrmax: +(1000 * d.qrmax).toFixed(2),
                 qimax: +(1000 * d.qimax).toFixed(2), qsmax: +(1000 * d.qsmax).toFixed(2), qgmax: +(1000 * d.qgmax).toFixed(2), zmax: Math.round(zmax), z1km: Math.round(z1max), top10: +topMax.toFixed(1), iwpMax: +iwpMax.toFixed(1),
                 zeta1km: +(1000 * z1).toFixed(1), zeta3_5km: +(1000 * z4).toFixed(1), uh: Math.round(uh), precipMax: +pmax.toFixed(1), hailMax: +Math.max(...core.precipG).toFixed(1), cores5km: cs.slice(0, 4),
                 water: +((water() - w0) / w0).toExponential(2), clipped: +core.stat.clipped.toExponential(1) };
    log.push(rec); frames.push({ t: t / 60, comp, r1, w5, z1: z1m, thv, precip: pr, top, iwp, hail, xz: slice(true), yz: slice(false), at: [wi, wj] });
    console.log(`t=${String(rec.t).padStart(3)} min  wmax ${String(rec.wmax).padStart(5)} m/s at (${rec.wloc.join(', ')}) km  thv_min ${rec.thvmin} K  qc ${rec.qcmax} qr ${rec.qrmax}` + (ice ? ` qi ${rec.qimax} qs ${rec.qsmax} qg ${rec.qgmax}` : '') +
                ` g/kg  Zmax ${rec.zmax} dBZ (1 km ${rec.z1km})` + (ice ? `  top10 ${rec.top10} km  IWPmax ${rec.iwpMax} kg/m2` : '') + `  zeta(1km) ${rec.zeta1km} zeta(3-5km) ${rec.zeta3_5km} 1e-3/s  UH ${rec.uh}  rain ${rec.precipMax} mm` +
                (ice ? ` (hail ${rec.hailMax})` : '') + `  cores@5km ${JSON.stringify(rec.cores5km.map((c) => c.w + '@' + c.x + ',' + c.y))}  budget ${rec.water}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    if (!Number.isFinite(rec.wmax) || rec.wmax > 120) { console.log('BLEW UP'); break; }
  }
  core.step(dt);
}
const d3file = out.replace(/\.json$/, '') + '.dbz3d.i8', wfile = out.replace(/\.json$/, '') + '.wind3d.i16', vfile = out.replace(/\.json$/, '') + '.vz3d.u8';
writeFileSync(d3file, Buffer.from(d3.buffer, 0, frames.length * nz * ny * nx));
writeFileSync(wfile, Buffer.from(wnd.buffer, 0, frames.length * 3 * nz * ny * nx * 2));
writeFileSync(vfile, Buffer.from(vzf.buffer, 0, frames.length * nz * ny * nx));
const times = frames.map((f) => f.t), motion = snd.motion, base = { z: Array.from(b.rhoc, (_, k) => (k + 0.5) * dz), u: Array.from(b.ubc, (v) => +(v + motion.u).toFixed(3)), v: Array.from(b.vbc, (v) => +(v + motion.v).toFixed(3)) };
writeFileSync(out, JSON.stringify({ dx, nx, ny, nz, dz, dt, ice, kfz, dbz3d: { file: d3file.split('/').pop(), nt: frames.length, times }, wind3d: { file: wfile.split('/').pop(), scale: 0.01, nt: frames.length },
                                  vz3d: { file: vfile.split('/').pop(), scale: 0.25, nt: frames.length }, motion, base, log, frames }));
console.log('wrote ' + out);
