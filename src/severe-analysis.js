/* Severe: the analysis builder (docs/severe-plan.md 6.2): a drawn day (lows, highs, fronts, a dryline, troughs, jets, arrows) turned into the pressure, the air masses, the winds and, at any point, a sounding.
 *
 *   const A = HFSevereAnalysis.create(drawing);        // drawing: { lat, base, aloft: { speed, from }, air: { warm: { qv0: 14 } }, objects: [...] }, positions in km east and north of the drawing's centre, speeds in m/s, pressures in hPa;
 *                                                      // `air` changes any key of the spec of an air mass (warm, cold, dry or cool: the keys of HFSevereSounding.make, e.g. theta0, qv0, ml, cap)
 *   A.pressure(x, y, t)                                // sea-level pressure, hPa; t is hours after the drawing
 *   A.surface(x, y, t)                                 // { p, T, Td, u, v, speed, dir } at the ground (C, m/s, the wind's direction in degrees from which it blows)
 *   A.sounding(x, y, t, { dz, top })                   // an environment (HFSevereSounding.fromProfile: the object `make` returns) at that point; the indices are HFSevereSounding.indices(env)
 *   A.columns(points, t, { dz })                        // the same numbers at a list of points [[x, y], ...] (km): arrays of the surface and of the indices, n of them (what `fields` is made of)
 *   A.fields(t, { x0, x1, y0, y1, nx, ny, dz })        // a map: Float32Arrays of the surface and of the indices on a grid, the same numbers as the points' (the CIN not below -1000: air with no free convection has no inhibition to speak of)
 *
 * What the objects mean (every one has a default for everything but where it is, and every one moves along its arrow `motion: { u, v }`, m/s, and a low deepens at `deepen` hPa per hour):
 *   low { x, y, depth 15, size 400 }, high { x, y, rise 10, size 600 }: a Gaussian of pressure of that e-folding radius (km); the geostrophic wind of the pressure's gradient at the ground, turned and slowed
 *      by friction (0.55 of it, 28 degrees towards the low, at the ground; none above 2.5 km), and the same gradient's wind aloft falling off with an e-folding height of 3.5 km;
 *   trough { pts, depth 4, width 120 }: a line of low pressure;
 *   front { kind: cold | warm | stationary | occluded, pts, cold: left | right (of the direction the line is drawn), contrast K, width km, slope }: the cold air mass behind the line (a polar one for a cold or an occluded front, a cool marine
 *      one for a warm or a stationary front), its surface temperature lower by `contrast`, the front's surface lying under the warm air at the slope (1/80 for a cold front, 1/150 warm, 1/100 stationary and occluded:
 *      the cold air at a height z is z / slope behind the line), with a trough in the pressure along it; it fades out beyond the ends of the line;
 *   dryline { pts, dry: left | right, contrast K of dew point, width 20 }: a dry deep mixed layer on one side, its air riding over the moist air at 1/40 aloft;
 *   outflow { pts, cool: left | right, contrast 4, width 10 }: the cold air of an old storm's gust front, a front of slope 1/25 (a dome of a kilometre);
 *   moisture { pts, amount 3, width 200 }: a moist tongue: the dew point higher by `amount` K along the line, in the lowest 2 km;
 *   jet { pts, speed 25, width 250 }: wind added to the flow aloft along the line (the direction it is drawn), at 9.5 km; llj { pts, speed 18, width 150 }: the low-level jet at 1.5 km;
 *   utrough { x, y, speed 25, size 500 }: a cyclonic circulation aloft added to the flow (Vmax at the radius `size`, at 8 km): southwesterly flow ahead of it.
 * The day always has the flow aloft of `drawing.aloft` ({ speed 30, from 255 degrees }), which rises with height as (z / 10 km)^0.8; the jets and the circulation are added to it.
 *
 * This is not a forecast model: the drawing is the large-scale truth of a hypothetical day, and a profile is blended from four air masses the sounding generator makes (warm and moist: the tornado
 * preset; cold: continental polar; dry: an elevated mixed layer; cool: marine and stable) by the weights the front, the dryline and the outflow lines give them at each height. It needs HFSevereCore and HFSevereSounding.
 * A classic script that sets `globalThis.HFSevereAnalysis`.
 */
(function () {
  'use strict';
  const SND = globalThis.HFSevereSounding;
  if (!SND) throw new Error('severe-analysis: load severe-sounding.js first');
  const DEG = Math.PI / 180, OMEGA = 7.292e-5, RHO = 1.2, KMH = 3.6, { CP, RD } = globalThis.HFSevereCore.consts;

  /* ---- the air masses: the specs for the sounding generator (the warm one is the tornado day's) ---- */
  const AIR_SPEC = {
    warm: SND.presets.tornado,
    cold: { theta0: 288, qv0: 4.5, ml: 700, cap: 0, capDepth: 400, rhMax: 0.9, rhDry: 0.55, ztr: 10500, thetaTr: 333, tTr: 213, thExp: 1.2, rhExp: 1.25 },
    dry: { theta0: 311, qv0: 5, ml: 3000, cap: 0, capDepth: 400, rhMax: 0.6, rhDry: 0.8, ztr: 13000, thetaTr: 349, tTr: 213, thExp: 1.0, rhExp: 1.25 },
    cool: { theta0: 291, qv0: 12, ml: 200, cap: 5, capDepth: 600, rhMax: 0.95, rhDry: 0.4, ztr: 12000, thetaTr: 344, tTr: 213, thExp: 1.25, rhExp: 1.25 },
  };
  const tableCache = {};
  function airTables(dz, top, over) {                                         // the four air masses on the grid of this analysis: theta and the vapour at every level (cached); `over` changes keys of an air mass's spec
    const key = dz + '/' + top + '/' + (over ? JSON.stringify(over) : ''); if (tableCache[key]) return tableCache[key];
    const n = Math.round(top / dz) + 1, out = {}, z = Float64Array.from({ length: n }, (_, k) => k * dz);
    for (const name of Object.keys(AIR_SPEC)) {
      const t = SND.make(Object.assign({}, AIR_SPEC[name], over && over[name], { winds: [[0, 0, 0], [12000, 0, 0]], jets: [], motion: { u: 0, v: 0 } })).table, step = Math.round(dz / (t.z[1] - t.z[0]));
      out[name] = { theta: Float64Array.from({ length: n }, (_, k) => t.theta[k * step]), qv: Float64Array.from({ length: n }, (_, k) => t.qv[k * step]), pi: Float64Array.from({ length: n }, (_, k) => t.pi[k * step]) };
    }
    return (tableCache[key] = { z, n, air: out });
  }
  const dewpointC = (qv, pPa) => { const e = Math.max(1e-6, qv * pPa / (0.622 + qv) / 100), l = Math.log(e / 6.112); return 243.5 * l / (17.67 - l); };         // Bolton's inversion: vapour mixing ratio and pressure to the dew point, C

  /* ---- the line of a polyline: how far a point is from it, on which side, the direction there, and how far past an end it is ---- */
  function polyNear(pts, x, y) {
    let best = null; const last = pts.length - 2;
    for (let i = 0; i <= last; i++) {
      const ax = pts[i][0], ay = pts[i][1], vx = pts[i + 1][0] - ax, vy = pts[i + 1][1] - ay, L2 = vx * vx + vy * vy, L = Math.sqrt(L2);
      const t = L2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / L2 : 0, tc = Math.max(0, Math.min(1, t)), px = ax + tc * vx, py = ay + tc * vy, d2 = (x - px) * (x - px) + (y - py) * (y - py);
      if (!best || d2 < best.d2) best = { d2, i, t, tc, px, py, ux: L > 0 ? vx / L : 1, uy: L > 0 ? vy / L : 0, L };
    }
    const dist = Math.sqrt(best.d2);
    let ux = best.ux, uy = best.uy;
    if (best.tc === 1 && best.i < last) {                                                       // at a corner the direction is the middle of the two segments' (the start of the next is the same vertex, and a tie goes to the earlier)
      const q = pts[best.i + 1], r = pts[best.i + 2], vx = r[0] - q[0], vy = r[1] - q[1], L = Math.hypot(vx, vy) || 1; ux += vx / L; uy += vy / L; }
    const U = Math.hypot(ux, uy) || 1; ux /= U; uy /= U;
    const left = ux * (y - best.py) - uy * (x - best.px);                                       // positive: the point is to the left of the direction the line is drawn
    const past = best.i === 0 && best.t < 0 ? -best.t * best.L : best.i === last && best.t > 1 ? (best.t - 1) * best.L : 0;
    return { dist, left: left > 0 ? dist : -dist, ux, uy, past };
  }
  const shifted = (pts, dx, dy) => (dx === 0 && dy === 0 ? pts : pts.map((p) => [p[0] + dx, p[1] + dy]));
  const gauss = (a) => Math.exp(-a * a);

  const FRONT = { cold: { slope: 1 / 80, contrast: 12, width: 40, air: 'cold' }, warm: { slope: 1 / 150, contrast: 10, width: 60, air: 'cool' }, stationary: { slope: 1 / 100, contrast: 8, width: 50, air: 'cool' },
                  occluded: { slope: 1 / 100, contrast: 8, width: 50, air: 'cold' } };

  function create(drawing, options) {
    const D = drawing || {}, objs = (D.objects || []).map((o) => Object.assign({}, o)), opts = Object.assign({ dz: 100, top: 20000, fade: 200 }, options);
    const lat = D.lat === undefined ? 36.7 : D.lat, f = Math.max(2e-5, 2 * OMEGA * Math.sin(lat * DEG)), pBase = D.base === undefined ? 1015 : D.base;
    const aloft = Object.assign({ speed: 30, from: 255 }, D.aloft), bg = { u: -aloft.speed * Math.sin(aloft.from * DEG), v: -aloft.speed * Math.cos(aloft.from * DEG) };
    const KNOWN = ['low', 'high', 'trough', 'front', 'dryline', 'outflow', 'moisture', 'jet', 'llj', 'utrough'];
    for (const o of objs) if (!KNOWN.includes(o.type)) throw new Error('severe-analysis: no object of type ' + o.type);
    for (const o of objs) {
      const lineLike = ['trough', 'front', 'dryline', 'outflow', 'moisture', 'jet', 'llj'].includes(o.type);
      if (lineLike && (!o.pts || o.pts.length < 2)) throw new Error('severe-analysis: a ' + o.type + ' needs a line of at least two points');
      if (o.type === 'front' && !FRONT[o.kind || 'cold']) throw new Error('severe-analysis: no front of kind ' + o.kind);
    }
    const mv = (o, t) => { const m = o.motion || { u: 0, v: 0 }; return [m.u * t * KMH, m.v * t * KMH]; };            // how far an object has gone, km, in t hours
    const T = airTables(opts.dz, opts.top, D.air);
    const strength = (o) => (o.type === 'dryline' ? -1 : o.type === 'front' ? (o.contrast === undefined ? FRONT[o.kind || 'cold'].contrast : o.contrast) : o.type === 'outflow' ? (o.contrast === undefined ? 4 : o.contrast) : 99);
    const ordered = objs.slice().sort((a, b) => strength(a) - strength(b));                                  // where air masses overlap the coldest wins: the dry air first, then the lines by their contrast, the largest last
    const nominal = {};                                                                                       // how different the cold and the cool air are from the warm at the ground (theta, K): the contrast a line of 1 means
    { const w = T.air.warm; for (const k of ['cold', 'cool']) { const a = T.air[k]; nominal[k] = { T: w.theta[0] * w.pi[0] - a.theta[0] * a.pi[0] }; } }

    /* how much of the dry air makes a drop of `contrast` K in the dew point at the ground (the vapour is blended, the dew point is not linear in it: found by halving) */
    function dryShare(contrast) {
      const w = T.air.warm, d = T.air.dry, p = 100 * pBase, target = dewpointC(w.qv[0], p) - contrast;
      let lo = 0, hi = Math.min(2, 0.98 * w.qv[0] / (w.qv[0] - d.qv[0]));
      for (let i = 0; i < 40; i++) { const mid = 0.5 * (lo + hi); if (dewpointC(w.qv[0] + mid * (d.qv[0] - w.qv[0]), p) > target) lo = mid; else hi = mid; }
      return 0.5 * (lo + hi);
    }

    /* ---- the pressure ---- */
    function pressure(x, y, t) {
      t = t || 0; let p = pBase;
      for (const o of objs) {
        const [dx, dy] = mv(o, t);
        if (o.type === 'low') p -= ((o.depth === undefined ? 15 : o.depth) + (o.deepen || 0) * t) * gauss(Math.hypot(x - o.x - dx, y - o.y - dy) / (o.size || 400));
        else if (o.type === 'high') p += ((o.rise === undefined ? 10 : o.rise) + (o.deepen || 0) * t) * gauss(Math.hypot(x - o.x - dx, y - o.y - dy) / (o.size || 600));
        else if (o.type === 'trough') p -= (o.depth === undefined ? 4 : o.depth) * gauss(polyNear(shifted(o.pts, dx, dy), x, y).dist / (o.width || 120));
        else if (o.type === 'front') {
          const F = FRONT[o.kind || 'cold'], w = o.width || F.width, pn = polyNear(shifted(o.pts, dx, dy), x, y);
          p -= 0.1 * (o.contrast === undefined ? F.contrast : o.contrast) * gauss(pn.dist / (1.5 * w)) * gauss(pn.past / opts.fade);
        }
      }
      return p;
    }
    function gradient(x, y, t) {                                                                          // Pa/m
      const h = 3; return { gx: (pressure(x + h, y, t) - pressure(x - h, y, t)) * 100 / (2 * h * 1000), gy: (pressure(x, y + h, t) - pressure(x, y - h, t)) * 100 / (2 * h * 1000) };
    }
    const geostrophic = (x, y, t) => { const g = gradient(x, y, t); return { u: -g.gy / (RHO * f), v: g.gx / (RHO * f) }; };

    /* ---- the wind at a height: the gradient's, with friction, the flow aloft, the jets and the circulation aloft ---- */
    function windAt(x, y, z, t, g0) {
      const g = g0 || geostrophic(x, y, t), fr = 0.55 + 0.45 * (1 - Math.exp(-z / 700)), ang = 28 * DEG * Math.exp(-z / 700), dec = Math.exp(-z / 3500), ca = Math.cos(ang), sa = Math.sin(ang);
      let u = dec * fr * (g.u * ca - g.v * sa), v = dec * fr * (g.u * sa + g.v * ca);
      const sh = z >= 10000 ? 1 : Math.pow(z / 10000, 0.8);
      u += bg.u * sh; v += bg.v * sh;
      for (const o of objs) {
        const [dx, dy] = mv(o, t || 0);
        if (o.type === 'jet' || o.type === 'llj') {
          const pn = polyNear(shifted(o.pts, dx, dy), x, y), V = o.speed === undefined ? (o.type === 'jet' ? 25 : 18) : o.speed, w = o.width || (o.type === 'jet' ? 250 : 150);
          const vert = o.type === 'jet' ? gauss((z - 9500) / 3500) : gauss((z - 1500) / 800), a = V * gauss(pn.dist / w) * gauss(pn.past / opts.fade) * vert;
          u += a * pn.ux; v += a * pn.uy;
        } else if (o.type === 'utrough') {
          const cx = o.x + dx, cy = o.y + dy, r = Math.hypot(x - cx, y - cy), R = o.size || 500, V = o.speed === undefined ? 25 : o.speed;
          if (r > 1e-9) { const a = V * (r / R) * Math.exp(0.5 * (1 - (r / R) * (r / R))) * gauss((z - 8000) / 4000); u += a * (-(y - cy) / r); v += a * ((x - cx) / r); }
        }
      }
      return [u, v];
    }
    const WZ = [0, 250, 500, 1000, 1500, 2000, 3000, 4500, 6000, 8000, 10000, 12000, 16000, 20000];
    function windNodes(x, y, t) { const g = geostrophic(x, y, t); return WZ.filter((z) => z <= opts.top).map((z) => { const w = windAt(x, y, z, t, g); return [z, w[0], w[1]]; }); }

    /* ---- the profile at a point: the warm air mass with the others let in by the lines' weights at every height ---- */
    function sounding(x, y, t, o) {
      t = t || 0;
      const dz = (o && o.dz) || opts.dz, top = (o && o.top) || opts.top, W = dz === opts.dz && top === opts.top ? T : airTables(dz, top, D.air), n = W.n, z = W.z;
      const th = Float64Array.from(W.air.warm.theta), qv = Float64Array.from(W.air.warm.qv), piG = Math.pow(pressure(x, y, t) / 1000, RD / CP);
      for (const ob of ordered) {
        const [sx, sy] = mv(ob, t);
        if (ob.type === 'front' || ob.type === 'dryline' || ob.type === 'outflow') {
          const pn = polyNear(shifted(ob.pts, sx, sy), x, y), fade = gauss(pn.past / opts.fade);
          let air, slope, w, k, sideLeft;
          if (ob.type === 'front') {
            const F = FRONT[ob.kind || 'cold']; air = F.air; slope = ob.slope || F.slope; w = ob.width || F.width; k = (ob.contrast === undefined ? F.contrast : ob.contrast) / nominal[air].T; sideLeft = (ob.cold || 'left') === 'left';
          } else if (ob.type === 'outflow') { air = 'cold'; slope = ob.slope || 1 / 25; w = ob.width || 10; k = (ob.contrast === undefined ? 4 : ob.contrast) / nominal.cold.T; sideLeft = (ob.cool || 'left') === 'left'; }
          else { air = 'dry'; slope = ob.slope || -1 / 40; w = ob.width || 20; k = dryShare(ob.contrast === undefined ? 12 : ob.contrast); sideLeft = (ob.dry || 'left') === 'left'; }
          if (ob.type !== 'dryline') k /= piG;                                                        // the contrast of a front is the temperature at the ground, theta times the Exner function there
          k = Math.max(0, Math.min(2, k));
          const dWarm = (sideLeft ? -pn.left : pn.left), A = W.air[air], wm = W.air.warm;           // kilometres, positive on the warm (or the moist) side
          for (let i = 0; i < n; i++) {
            const c = fade * 0.5 * (1 - Math.tanh((dWarm + z[i] / slope / 1000) / w));                  // the other air's share at this height: the line leans over its own side at `slope` (the dry air the other way)
            th[i] += c * (wm.theta[i] + k * (A.theta[i] - wm.theta[i]) - th[i]); qv[i] += c * (Math.max(1e-7, wm.qv[i] + k * (A.qv[i] - wm.qv[i])) - qv[i]);      // (the air mass of a weaker line is the warm air with that share of the difference)
          }
        } else if (ob.type === 'moisture') {
          const pn = polyNear(shifted(ob.pts, sx, sy), x, y), a = (ob.amount === undefined ? 3 : ob.amount) * gauss(pn.dist / (ob.width || 200)) * gauss(pn.past / opts.fade);
          if (a !== 0) for (let i = 0; i < n; i++) qv[i] *= 1 + a * 0.065 * Math.exp(-z[i] / 2000);       // a kelvin of dew point is about 6.5 % of the vapour
        }
      }
      for (let i = 1; i < n; i++) if (th[i] < th[i - 1]) th[i] = th[i - 1];                                  // a blend of air masses is never unstable by itself: theta does not fall with height
      const nodes = windNodes(x, y, t), zz = nodes.map((r) => r[0]), pu = SND.pchip(zz, nodes.map((r) => r[1])), pv = SND.pchip(zz, nodes.map((r) => r[2]));
      return SND.fromProfile({ z, theta: th, qv, uG: pu, vG: pv, p0: pressure(x, y, t) });
    }

    function surface(x, y, t) {
      const env = sounding(x, y, t), tb = env.table, w = windAt(x, y, 10, t), p = pressure(x, y, t);
      return { p, T: tb.theta[0] * tb.pi[0] - 273.15, Td: dewpointC(tb.qv[0], 100 * p), u: w[0], v: w[1], speed: Math.hypot(w[0], w[1]), dir: (Math.atan2(-w[0], -w[1]) / DEG + 360) % 360 };
    }

    /* ---- the surface and the indices at a list of points: [[x, y], ...] (km) ---- */
    const NAMES = ['mslp', 'T', 'Td', 'u', 'v', 'mlcape', 'mlcin', 'mllcl', 'shear06', 'srh01', 'srh03', 'stp', 'scp'];
    function columns(points, t, o) {
      const dz = (o && o.dz) || 100, out = { n: points.length, names: NAMES };
      for (const nm of NAMES) out[nm] = new Float32Array(points.length);
      for (let q = 0; q < points.length; q++) {
        const x = points[q][0], y = points[q][1];
        const env = sounding(x, y, t, { dz, top: 16000 }), ix = SND.indices(env), tb = env.table, w = windAt(x, y, 10, t), p = pressure(x, y, t);
        out.mslp[q] = p; out.T[q] = tb.theta[0] * tb.pi[0] - 273.15; out.Td[q] = dewpointC(tb.qv[0], 100 * p); out.u[q] = w[0]; out.v[q] = w[1];
        out.mlcape[q] = ix.mlcape; out.mlcin[q] = Math.max(-1000, ix.mlcin); out.mllcl[q] = ix.mllcl; out.shear06[q] = ix.shear06; out.srh01[q] = ix.srh01; out.srh03[q] = ix.srh03; out.stp[q] = ix.stp;
        const cinTerm = ix.mlcin > -40 ? 1 : -40 / ix.mlcin, shT = ix.shear06 < 10 ? 0 : Math.min(1.5, ix.shear06 / 20);
        out.scp[q] = Math.max(0, ix.mlcape / 1000) * Math.max(0, ix.srh03 / 50) * shT * cinTerm;
      }
      return out;
    }

    /* ---- a map: the surface and the indices on a grid ---- */
    function fields(t, g) {
      g = Object.assign({ x0: -500, x1: 500, y0: -500, y1: 500, nx: 24, ny: 24, dz: 100 }, g);
      const pts = []; for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) pts.push([g.x0 + (g.x1 - g.x0) * (g.nx > 1 ? i / (g.nx - 1) : 0.5), g.y0 + (g.y1 - g.y0) * (g.ny > 1 ? j / (g.ny - 1) : 0.5)]);
      const c = columns(pts, t, { dz: g.dz }), out = { nx: g.nx, ny: g.ny, x0: g.x0, x1: g.x1, y0: g.y0, y1: g.y1, names: NAMES };
      for (const nm of NAMES) out[nm] = c[nm];
      return out;
    }

    return { drawing: D, f, pressure, geostrophic, windAt, sounding, surface, columns, fields, objects: objs.length, nominal, options: opts };
  }

  globalThis.HFSevereAnalysis = { create, polyNear, dewpointC, AIR_SPEC, FRONT };
})();
