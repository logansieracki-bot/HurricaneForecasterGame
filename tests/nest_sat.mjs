// Node-only tests of the satellite's picture of the nest (HFNest irTb, the eye of the cloud tops, the storm-felt shear, the towers): an eye that forms quickly around Category 3 and is taken away only by a shear that is strong for
// the storm, convection made of cells that are born where it rains and differ in size, shape and coolness (no rows of identical tops), a sheared hurricane that keeps its eye and has its cold cloud downshear, cold areas and coldest
// tops in the ranges of real GOES storms (docs/ir-research.md), and pictures that follow each other the way real ones do. The model's own rain, the radar and every step stay as they were.
import '../src/storm-cities.js';
import '../src/storms.js';
import '../src/storm-nest.js';
import { makeEnv } from './storms_env.mjs';

const H = globalThis.HFStorms, N = globalThis.HFNest;
H.calibrated(false);
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); } }
const KT = 0.514444, NG = N.N, NN = NG * NG, f2 = (v, d = 2) => v.toFixed(d);

/* a forcing from a few storm numbers (kt, km), the way tests/nest.mjs and tests/nest_radar.mjs make one */
function forcing(o) {
  const vt = new Float32Array(N.NR), V = o.v * KT, rm = o.rmax, r34 = o.r34 || 120, x = Math.max(0.3, Math.min(1.1, Math.log(V / 17.5) / Math.log(r34 / rm))), nIn = 1 + 2 * Math.min(1, Math.max(0, (o.v - 50) / 50));
  for (let i = 0; i < N.NR; i++) vt[i] = i <= rm ? V * Math.pow(i / rm, nIn) : V * Math.pow(rm / i, x);
  return Object.assign({ clat: 20, clon: -60, lat: 20, vmax: V, rmax: rm, org: 0, shear: 3, shdir: 0, uem: 0, vem: 0, ued: 0, ved: 0, head: Math.PI / 4, spd: 4, rh: 0.72, sst: 28.8, eta: 0, etdir: 0.8, conv: 1, sg: 1, vt }, o.extra || {});
}
function run(o, hours, opts = {}) {
  const dt = 240, nest = N.create({ seed: opts.seed || 7 }), f = forcing(o);
  nest.init(f);
  const n = Math.round(hours * 3600 / dt); for (let i = 0; i < n; i++) nest.step(dt);
  return nest;
}
const defaults = JSON.parse(JSON.stringify(N.PAR));
const reset = () => { Object.assign(N.PAR, JSON.parse(JSON.stringify(defaults))); };
const tbOf = (n, sst = 28.8) => { n.display(0, true, true); return n.irTb(new Float32Array(NN), sst); };                                   // the infrared picture, in degC
const area = (tb, th) => { let c = 0; for (let k = 0; k < NN; k++) if (tb[k] < th) c++; return c * 4 / 1000; };                           // thousand km2 colder than th (the box is of 2 km cells at the scale of 1)
const tmin = (tb) => { let m = 99; for (let k = 0; k < NN; k++) if (tb[k] < m) m = tb[k]; return m; };
const corr = (a, b) => { const m = a.length; let sa = 0, sb = 0; for (let k = 0; k < m; k++) { sa += a[k]; sb += b[k]; } sa /= m; sb /= m; let sxy = 0, sxx = 0, syy = 0; for (let k = 0; k < m; k++) { const x = a[k] - sa, y = b[k] - sb; sxy += x * y; sxx += x * x; syy += y * y; } return sxy / Math.sqrt(sxx * syy); };
const sdOf = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length); };
const quant = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(p * (b.length - 1))]; };
const central = (tb, half) => { const o = [], c = (NG - 1) / 2; for (let j = Math.round(c - half); j < Math.round(c + half); j++) for (let i = Math.round(c - half); i < Math.round(c + half); i++) o.push(tb[j * NG + i]); return o; };
/* the connected cold blobs of a picture (4-neighbours) with the eccentricity of each (the square root of the ratio of the eigenvalues of its second moments: 1 for a disc) */
function blobs(mask) {
  const lab = new Int32Array(NN); let nl = 0; const out = [];
  for (let k = 0; k < NN; k++) {
    if (!mask[k] || lab[k]) continue; nl++; const st = [k]; lab[k] = nl; let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    while (st.length) { const q = st.pop(), x = q % NG, y = (q / NG) | 0; n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= NG || yy >= NG) continue; const r = yy * NG + xx; if (mask[r] && !lab[r]) { lab[r] = nl; st.push(r); } } }
    const mx = sx / n, my = sy / n, cxx = sxx / n - mx * mx, cyy = syy / n - my * my, cxy = sxy / n - mx * my, tr = cxx + cyy, det = cxx * cyy - cxy * cxy, d = Math.sqrt(Math.max(0, tr * tr / 4 - det)), l1 = tr / 2 + d, l2 = Math.max(1e-6, tr / 2 - d);
    out.push({ n, mx, my, ecc: Math.sqrt(l1 / l2) });
  }
  return out;
}

/* ---- the eye of the cloud tops forms around Category 3 and quickly, and only a shear that is strong for the storm takes it away ---------------------------------------------- */
{
  reset();
  const at = (v, extra, hours = 6) => run({ v, rmax: 28, r34: 130, extra: extra || {} }, hours);
  const e64 = at(64), e82 = at(82), e90 = at(90), e100 = at(100);
  check('an eye forms around Category 3: after 6 hours a 64 kt storm has ' + f2(e64.eyeS) + ' of one, 82 kt ' + f2(e82.eyeS) + ' (both under 0.1), 90 kt ' + f2(e90.eyeS) + ' (0.3 to 0.9) and 100 kt ' + f2(e100.eyeS) + ' (over 0.95)',
    e64.eyeS < 0.1 && e82.eyeS < 0.1 && e90.eyeS > 0.3 && e90.eyeS < 0.9 && e100.eyeS > 0.95);
  const dry = at(100, { rh: 0.3 }), cool = at(100, { sst: 25 }), mid = at(96, { rh: 0.45, sst: 26.5 }), dry90 = at(90, { rh: 0.3 });
  check('harsh air delays an eye a little and does not forbid it: a 100 kt storm in dry air (humidity 0.3) has ' + f2(dry.eyeS) + ' of its eye, over a 25 C sea ' + f2(cool.eyeS) + ' (both over 0.9), a 96 kt storm in middling air ' + f2(mid.eyeS) + ' (over 0.7),' +
    ' while a 90 kt storm in the dry air still has ' + f2(dry90.eyeS) + ' (under 0.3)', dry.eyeS > 0.9 && cool.eyeS > 0.9 && mid.eyeS > 0.7 && dry90.eyeS < 0.3);
  const s12 = at(100, { shear: 12 }), s16 = at(100, { shear: 16 }), s28 = at(100, { shear: 28 }), h20 = at(130, { shear: 20 }), h28 = at(130, { shear: 28 });
  check('a major hurricane keeps its eye in a moderate shear and loses it only in a strong one: a 100 kt storm has ' + f2(s12.eyeS) + ' of its eye in 12 m/s of shear (over 0.95), ' + f2(s16.eyeS) + ' in 16 (over 0.9) and ' + f2(s28.eyeS) + ' in 28 (0.02 to 0.35: the shear takes at most 0.85 of an eye)',
    s12.eyeS > 0.95 && s16.eyeS > 0.9 && s28.eyeS < 0.35 && s28.eyeS > 0.02);
  check('a stronger vortex resists a shear that takes the eye of a weaker one: 130 kt keeps ' + f2(h20.eyeS) + ' in 20 m/s (over 0.9) and ' + f2(h28.eyeS) + ' in 28 (over 0.4), where 100 kt in 28 keeps ' + f2(s28.eyeS), h20.eyeS > 0.9 && h28.eyeS > 0.4 && h28.eyeS > s28.eyeS + 0.25);
  { const q = N.create({ seed: 7 }); q.init(forcing({ v: 100, rmax: 28, r34: 130 })); q.eyeS = 0; q.eyeG = 0; for (let i = 0; i < 15; i++) q.step(240); const one = q.eyeS; for (let i = 0; i < 75; i++) q.step(240); const six = q.eyeS;
    check('an eye clears quickly, not at once: from none a 100 kt storm has ' + f2(one) + ' of its eye after 1 hour (0.4 to 0.95) and ' + f2(six) + ' after 6 (over 0.95)', one > 0.4 && one < 0.95 && six > 0.95); }
  { const a = N.create({ seed: 7 }); a.init(forcing({ v: 104, rmax: 24, r34: 140 })); const w = N.create({ seed: 7 }); w.init(forcing({ v: 40, rmax: 40, r34: 140 }));
    check('a new strong vortex starts with the eye its wind allows (' + f2(a.eyeS) + ' for 104 kt, over 0.9; ' + f2(w.eyeS) + ' for 40 kt, under 0.05)', a.eyeS > 0.9 && w.eyeS < 0.05); }
  { const hi = run({ v: 105, rmax: 24, r34: 140 }, 6), lo = run({ v: 55, rmax: 36, r34: 130 }, 6), th = tbOf(hi), tl = tbOf(lo);
    const inner = (n, tb) => { let s = 0, c = 0, mx = -99; for (let k = 0; k < NN; k++) if (n.rr[k] < 5) { s += tb[k]; c++; if (tb[k] > mx) mx = tb[k]; } return [s / c, mx]; };
    let op = 0, oc = 0, ce = 0, cn = 0; hi.display(0, true, true); for (let k = 0; k < NN; k++) { if (hi.rr[k] < 5) { op += hi.dcr[k]; oc++; } if (hi.eyM[k] > 0.8) { ce += hi.cir[k]; cn++; } }
    const [mh] = inner(hi, th), [ml] = inner(lo, tl);
    check('the eye is a warm hole in the cirrus: the mean temperature of the inner 5 km is ' + f2(mh, 0) + ' C for a 105 kt storm (warmer than -30, the cirrus over it ' + f2(op / oc) + ' thick: under 0.15, and over the middle of the eye ' + f2(ce / cn) + ': under 0.05, the anvil spreading in from the eyewall is cleared) and ' + f2(ml, 0) + ' C for a 55 kt storm (colder than -50)',
      mh > -30 && op / oc < 0.15 && ce / cn < 0.05 && ml < -50); }
}

/* ---- the shear the nest feels is the storm's, not the far point of the page's field ----------------------------------------------------------------------------------- */
{
  reset();
  const env = makeEnv({ sst: 29, shear: 24, rh: 66 }), p1 = H.mergeParams(H.defaultParams(), { shearK: 1 }), p3 = H.mergeParams(H.defaultParams(), { shearK: 3 });
  const S = (() => { const S0 = H.newSystem({ id: 'W', num: H.idNum('M', 3), th: 'tc', lat: 18, lon: -50, v: 80, hour: 0 }); S0.genCount = 0; S0.cx = -8; S0.cy = 4; S0.lastShear = 24; S0.lastRh = 66; S0.lastSst = 28.5; for (let h = 0; h < 3; h++) H.stepSystem(S0, env, h, 3, p1); return S0; })();
  const f1 = N.forcingOf(S, p1, env, 3), f3 = N.forcingOf(S, p3, env, 3), g1 = N.envGridOf(env, 18, -50, 1, f1), g3 = N.envGridOf(env, 18, -50, 1, f3);
  check('the shear of the nest is the one the engine\'s storm feels: the page\'s ' + f2(f1.shear / KT, 1) + ' kt becomes ' + f2(f3.shear / KT, 1) + ' kt with a shearK of 3 (a third: ' + f2(f1.shear / KT / 3, 1) + '), the forcing carries the factor (' + f3.shK + ') and the coarse shear field round the storm is divided by it (' +
    f2(g1.sh[NE_MID(g1)], 2) + ' to ' + f2(g3.sh[NE_MID(g3)], 2) + ' m/s at the middle)', Math.abs(f3.shear * 3 - f1.shear) < 1e-6 * Math.max(1, f1.shear) && f3.shK === 3 && f1.shK === 1 && Math.abs(g3.sh[NE_MID(g3)] * 3 - g1.sh[NE_MID(g1)]) < 1e-3);
}
function NE_MID(g) { return (g.sh.length >> 1) + (Math.sqrt(g.sh.length) >> 1); }

/* ---- the clouds are cells: born where it rains, of every size, strength and shape, moving as wholes ---------------------------------------------------------------------- */
{
  reset();
  const ts = run({ v: 50, rmax: 40, r34: 130 }, 12), tw = ts.towers();
  check('the infrared picture has cells: after 12 hours a 50 kt storm has ' + tw.length + ' (between 20 and 400, never more than the most there can be)', tw.length > 20 && tw.length < 400 && tw.length <= N.PAR.twN);
  let near = 0, box = 0; for (let k = 0; k < NN; k++) box += ts.rc[k]; box /= NN;
  for (const t of tw) { let s = 0, c = 0; for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) { const i = Math.round(t.x) + di, j = Math.round(t.y) + dj; if (i < 0 || j < 0 || i >= NG || j >= NG) continue; s += ts.rc[j * NG + i]; c++; } near += s / c; }
  near /= tw.length;
  check('cells stand where it rains: the rain within 8 km of a cell is ' + f2(near, 1) + ' mm/h on average, ' + f2(near / box, 1) + ' times the box\'s mean ' + f2(box, 1) + ' (over 1.8)', near > 1.8 * box);
  const zs = tw.map((t) => t.z), Rs = tw.map((t) => t.R * 2), ars = tw.map((t) => t.ar), lobes = tw.map((t) => t.lobe), strong = zs.filter((z) => z > 15.5);
  check('no two cells are alike: the tops of the cells differ by ' + f2(sdOf(zs)) + ' km (standard deviation, over 1), the strongest third of them by ' + f2(sdOf(strong)) + ' km (over 0.3: they do not all stop at the same height), the radii of their skirts run from ' + f2(quant(Rs, 0.1), 0) + ' to ' +
    f2(quant(Rs, 0.9), 0) + ' km (the top tenth over twice the bottom tenth) and their stretch from ' + f2(quant(ars, 0.1)) + ' to ' + f2(quant(ars, 0.9)) + ' (over 1.25 at the top)', sdOf(zs) > 1 && sdOf(strong) > 0.3 && quant(Rs, 0.9) > 2 * quant(Rs, 0.1) && quant(ars, 0.9) > 1.25 && quant(lobes, 0.1) > 0.1);
  { const mx = Math.max(...zs), crowd = zs.filter((z) => z > mx - 0.15).length;
    check('the strongest cells do not all stop at the cap: ' + crowd + ' of the ' + zs.length + ' cells (' + f2(100 * crowd / zs.length, 0) + ' %) are within 0.15 km of the highest top, ' + f2(mx) + ' km (at most 10 %)', crowd <= 0.10 * zs.length); }
  const tb = tbOf(ts), mask = new Uint8Array(NN); for (let k = 0; k < NN; k++) mask[k] = tb[k] < -62 && ts.rr[k] > 12 ? 1 : 0;
  const bl = blobs(mask).filter((b) => b.n * 4 > 100 && b.n * 4 < 6000).sort((a, b) => a.ecc - b.ecc), med = bl.length ? bl[bl.length >> 1].ecc : 0;
  check('the cold clouds are not round: the ' + bl.length + ' cold blobs of 100 to 6000 km2 (colder than -62 C) have a median eccentricity of ' + f2(med) + ' (over 1.25; a disc is 1)', bl.length >= 3 && med > 1.25);
  // a cell moves as a whole: its place changes with the flow, its strength and shape do not
  { const a = ts.towers(), key = (t) => t.z.toFixed(4) + '/' + t.R.toFixed(4) + '/' + t.th.toFixed(4); const before = new Map(a.map((t) => [key(t), t]));
    for (let i = 0; i < 4; i++) ts.step(240); const b = ts.towers(); let same = 0, moved = 0, drift = 0;
    for (const t of b) { const o = before.get(key(t)); if (!o) continue; same++; const d = Math.hypot(t.x - o.x, t.y - o.y); if (d > 0.3) moved++; drift += d; }
    check('cells move as wholes: of ' + a.length + ' cells ' + same + ' are still there 16 minutes later with the same top, size and direction (over 60 %: they live 40 to 90 minutes), ' + moved + ' of them have moved (over 70 % of those) by ' + f2(drift / Math.max(1, same) * 2, 1) + ' km on average', same > 0.6 * a.length && moved > 0.7 * same); }
  { const q = run({ v: 50, rmax: 40, r34: 130 }, 8), a = q.towers(); q.rescale(1.5); const b = q.towers();
    check('cells keep their place and their size in km when the box is rescaled (' + a.length + ' before, ' + b.length + ' after, the radius of the first x' + f2(b[0].R / a[0].R, 3) + ' for a box 1.5 times larger: 0.667)', a.length === b.length && Math.abs(b[0].R / a[0].R - 1 / 1.5) < 0.01); }
  { const h = run({ v: 105, rmax: 24, r34: 140 }, 8), hw = h.towers(); let inEye = 0; for (const t of hw) if (h.rr[Math.round(t.y) * NG + Math.round(t.x)] < 0.5 * h.rmaxN) inEye++;
    check('no cell stands in the eye of a 105 kt storm (' + inEye + ' of ' + hw.length + ' within half a radius of maximum wind of the centre; at most 3)', inEye <= 3); }
}

/* ---- what keeps the cells from being the whole picture: the tracer's own tops are capped, the cells are small where the rain area is small, none draws in the eye ------------------------------------------- */
{
  reset();
  const ts = run({ v: 50, rmax: 40, r34: 130, extra: { rh: 0.45 } }, 10);
  let hi = 0, nOp = 0; for (let k = 0; k < NN; k++) if (ts.rr[k] > 5 * ts.rmaxN && ts.cir[k] > 0.5) { nOp++; if (ts.cih[k] > hi) hi = ts.cih[k]; }
  const cap = N.PAR.twBase + N.PAR.twMem[0] + 0.5;
  check('the cirrus tracer makes no top of its own above ' + f2(cap, 1) + ' km away from the core of a storm of 50 kt (' + nOp + ' opaque cells beyond five radii of maximum wind, the highest top ' + f2(hi, 1) + ' km): the colder tops are the cells\', so a band of rain is not a spine of equal white tops', nOp > 200 && hi < cap);
  { const q = run({ v: 105, rmax: 24, r34: 140 }, 8), a = Float32Array.from(tbOf(q)); q.eyM.fill(1); q.display(0, true, true); const withT = Float32Array.from(q.irTb(new Float32Array(NN), 28.8)), keep = q.tw; q.tw = null; const without = q.irTb(new Float32Array(NN), 28.8); q.tw = keep;
    let diff = 0; for (let k = 0; k < NN; k++) if (Math.abs(withT[k] - without[k]) > 0.01) diff++; void a;
    check('no cell draws over the eye: with the eye\'s mask over the whole picture the cells change ' + diff + ' of the ' + NN + ' cells of it (none)', q.towers().length > 5 && diff === 0); }
  { const wet = (radiusKm, patchKm) => { const q = N.create({ seed: 5 }); q.init(forcing({ v: 40, rmax: 50, r34: 120 })); q.eyM.fill(0);
      const fill = () => { for (let k = 0; k < NN; k++) { const x = (k % NG - 127.5) * 2, y = (Math.floor(k / NG) - 127.5) * 2, px = ((x % 40) + 40) % 40 - 20, py = ((y % 40) + 40) % 40 - 20;
        q.rc[k] = patchKm ? (Math.hypot(px, py) < patchKm ? 25 : 0) : (Math.hypot(x, y) < radiusKm ? 25 : 0); } };
      for (let i = 0; i < 60; i++) { fill(); q.towerStep(300); }
      const R = q.towers().map((t) => t.R * 2); return { n: R.length, med: quant(R, 0.5) }; };
    const small = wet(0, 6), large = wet(160, 0);
    check('cells are small where the rain is in scattered small patches: in patches 12 km across 40 km apart (2 % of the box is raining) the cells have a median skirt of ' + f2(small.med, 0) + ' km (' + small.n + ' of them), in a solid rain area 320 km across ' + f2(large.med, 0) + ' km (' + large.n + '): the scattered one under 0.7 of the solid', small.n > 20 && large.n > 20 && small.med < 0.7 * large.med); }
  { const big = run({ v: 105, rmax: 24, r34: 140 }, 8); big.display(0, true, true); const sectors = new Float64Array(16), cnt = new Float64Array(16);
    for (let k = 0; k < NN; k++) { const r = big.rr[k]; if (r < 25 || r > 70 || big.dcr[k] < 0.9) continue; const q = Math.min(15, Math.floor((Math.atan2(big.sth[k], big.cth[k]) + Math.PI) * 2.5465)); sectors[q] += big.dch[k]; cnt[q]++; }
    const means = []; for (let q = 0; q < 16; q++) if (cnt[q] > 20) means.push(sectors[q] / cnt[q]);
    check('the canopy of a big storm is not a perfect disc: the mean top of its cloud at 25 to 70 km differs by ' + f2(sdOf(means), 2) + ' km (standard deviation of ' + means.length + ' sectors, over 0.25: the 64 km clusters that vary the height of the canopy) and the coldest sector is ' + f2(Math.max(...means) - Math.min(...means), 2) + ' km higher than the lowest (over 0.8)', means.length >= 12 && sdOf(means) > 0.25 && Math.max(...means) - Math.min(...means) > 0.8); }
  { const q = run({ v: 105, rmax: 24, r34: 140 }, 12), mx = Math.hypot(q.ocX, q.ocY), out = []; for (let a = 0; a < 8; a++) { let s = 0, c = 0; for (let k = 0; k < NN; k++) { const r = q.rr[k] * q.m; if (r < 80 || r > 120) continue; const th = Math.atan2(q.sth[k], q.cth[k]); if (Math.abs(((th - a * Math.PI / 4 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) > Math.PI / 8) continue; s += q.uc[k] * q.cth[k] + q.vc[k] * q.sth[k]; c++; } out.push(s / Math.max(c, 1)); }
    check('the outflow has channels that wander: its vector has wandered to ' + f2(mx, 2) + ' in 12 hours (over 0.05) and the outflow at 100 km runs from ' + f2(Math.min(...out), 1) + ' to ' + f2(Math.max(...out), 1) + ' m/s round the storm (the strongest over 1.2 times the weakest)', mx > 0.05 && Math.max(...out) > 1.2 * Math.min(...out)); }
}

/* ---- cold tops in the range of real GOES storms: the cold areas, the coldest tops, strong storms' tops lower than a burst's --------------------------------------------- */
{
  reset();
  const td = run({ v: 28, rmax: 50, r34: 110 }, 24), ts = run({ v: 50, rmax: 40, r34: 130 }, 24), hur = run({ v: 110, rmax: 22, r34: 150 }, 24);
  const [a, b, c] = [td, ts, hur].map((n) => { const t = tbOf(n); return { A60: area(t, -60), A70: area(t, -70), A75: area(t, -75), tmin: tmin(t) }; });
  check('a depression\'s burst has cold areas of real size: ' + f2(a.A60, 0) + ' thousand km2 colder than -60 C (real bursts 43, here 20 to 90), ' + f2(a.A70, 1) + ' colder than -70 (real 13, here 2.5 to 25) and tops down to ' + f2(a.tmin, 0) + ' C (real -82, here -88 to -76)',
    a.A60 > 20 && a.A60 < 90 && a.A70 > 2.5 && a.A70 < 25 && a.tmin < -76 && a.tmin > -88);
  check('a tropical storm\'s cold mass is of real size too: ' + f2(b.A60, 0) + ' thousand km2 colder than -60 C (real 54, here 30 to 100), ' + f2(b.A70, 1) + ' colder than -70 (real 24, here 4 to 30), coldest ' + f2(b.tmin, 0) + ' C (real -83, here -90 to -77)',
    b.A60 > 30 && b.A60 < 100 && b.A70 > 4 && b.A70 < 30 && b.tmin < -77 && b.tmin > -90);
  check('a hurricane\'s are those of a hurricane: ' + f2(c.A60, 0) + ' thousand km2 colder than -60 C (real 63, here 35 to 90), ' + f2(c.A70, 1) + ' colder than -70 (real 11, here 4 to 25), ' + f2(c.A75, 2) + ' colder than -75 (real 0.08, under 3) and coldest ' + f2(c.tmin, 0) + ' C (real -77, here -82 to -72)',
    c.A60 > 35 && c.A60 < 90 && c.A70 > 4 && c.A70 < 25 && c.A75 < 3 && c.tmin < -72 && c.tmin > -82);
  { const keep = td.tw, withT = tbOf(td); td.tw = null; const without = tbOf(td); td.tw = keep;
    check('the cells make the burst: taking them away leaves a depression ' + f2(area(withT, -60) - area(without, -60), 1) + ' thousand km2 less colder than -60 C (over 5), ' + f2(area(withT, -70) - area(without, -70), 1) + ' less colder than -70 C (over 1.5) and a coldest top ' + f2(tmin(without) - tmin(withT), 1) + ' C warmer (over 0)',
      area(withT, -60) - area(without, -60) > 5 && area(withT, -70) - area(without, -70) > 1.5 && tmin(without) - tmin(withT) > 0); }
  const tw = td.towers(), tt = hur.towers(), top = (l) => quant(l.map((t) => t.z), 0.9);
  { const osT = tw.filter((t) => t.oz > 0.1).length, osH = tt.filter((t) => t.oz > 0.1).length;
    check('the strongest cells of a burst have overshooting tops: ' + osT + ' of its ' + tw.length + ' cells stand 0.1 km or more over their own top (over 15 %), a mature hurricane\'s ' + osH + ' of ' + tt.length + ' (at most 2)', osT > 0.15 * tw.length && osH <= 2); }
  check('the cells of a burst are stronger than those of a mature hurricane: the 90th percentile of their tops is ' + f2(top(tw)) + ' km against ' + f2(top(tt)) + ' km (over 1 km higher)', top(tw) > top(tt) + 1);
}

/* ---- a sheared hurricane keeps its eye, and its cold cloud lies downshear in lumps -------------------------------------------------------------------------------------- */
{
  reset();
  const sh = (s) => { const n = run({ v: 100, rmax: 22, r34: 150, extra: { shear: s, shdir: 0 } }, 12), tb = tbOf(n); let sx = 0, sy = 0, c = 0, east = 0; const c0 = (NG - 1) / 2;
    for (let k = 0; k < NN; k++) if (tb[k] < -60) { const x = (k % NG - c0) * 2, y = (((k / NG) | 0) - c0) * 2; sx += x; sy += y; c++; if (x > 0) east++; }
    return { n, tb, off: Math.hypot(sx / c, sy / c), ex: sx / c, share: east / c, A60: c * 4 / 1000 }; };
  const s4 = sh(4), s12 = sh(12), s20 = sh(20);
  check('a sheared hurricane keeps its eye: a 100 kt storm has ' + f2(s12.n.eyeS) + ' of its eye in 12 m/s of shear (over 0.9) and the picture is warm at its centre (' + f2(tbOf(s12.n)[Math.round((NG - 1) / 2) * NG + Math.round((NG - 1) / 2)], 0) + ' C, warmer than -20)', s12.n.eyeS > 0.9 && s12.tb[Math.round((NG - 1) / 2) * NG + Math.round((NG - 1) / 2)] > -20);
  check('its cold cloud lies downshear: with the shear vector pointing east, ' + f2(100 * s20.share, 0) + ' % of the cold area (under -60 C) is east of the centre in 20 m/s of shear (over 65 %), against ' + f2(100 * s4.share, 0) + ' % in 4 m/s, and the cold area\'s centroid is ' + f2(s20.ex, 0) +
    ' km east (real storms 43 to 128 km off, here 25 to 150) against ' + f2(s4.ex, 0) + ' km', s20.share > 0.65 && s20.share > s4.share + 0.1 && s20.ex > 25 && s20.ex < 150);
  check('shear does not take the cold cloud away, it moves it: the cold area is ' + f2(s4.A60, 0) + ', ' + f2(s12.A60, 0) + ' and ' + f2(s20.A60, 0) + ' thousand km2 in 4, 12 and 20 m/s (real sheared majors 41 to 122; each between 30 and 100)', [s4, s12, s20].every((s) => s.A60 > 30 && s.A60 < 100));
}

/* ---- pictures that follow each other: no pops, no frozen picture ----------------------------------------------------------------------------------------------------- */
{
  reset();
  const n = run({ v: 50, rmax: 40, r34: 130 }, 12), fr = []; for (let i = 0; i < 7; i++) { for (let s = 0; s < 3; s++) n.step(200); fr.push(Float32Array.from(central(tbOf(n), 100))); }
  const r1 = corr(fr[0], fr[1]), r3 = corr(fr[0], fr[3]), r6 = corr(fr[0], fr[6]);
  check('successive pictures 10 minutes apart correlate ' + f2(r1, 3) + ' (real storms 0.92 to 0.95; here 0.9 to 0.995), 30 minutes apart ' + f2(r3, 3) + ' (real 0.76 to 0.81; 0.7 to 0.97) and an hour apart ' + f2(r6, 3) + ' (real 0.61 to 0.66; 0.55 to 0.95)', r1 > 0.9 && r1 < 0.995 && r3 > 0.7 && r3 < 0.97 && r6 > 0.55 && r6 < 0.95 && r1 > r3 && r3 > r6);
  const st = run({ v: 50, rmax: 40, r34: 130 }, 12); const a = Float32Array.from(tbOf(st)); for (let s = 0; s < 3; s++) st.step(200); const b = Float32Array.from(tbOf(st)); let big = 0; for (let k = 0; k < NN; k++) if (Math.abs(a[k] - b[k]) > 30) big++;
  check('no cell pops in or out between two pictures 10 minutes apart: ' + big + ' of the ' + NN + ' cells change by more than 30 C (at most 1 %)', big < 0.01 * NN);
}

/* ---- what it costs ---------------------------------------------------------------------------------------------------------------------------------------------------------- */
{
  reset();
  const q = run({ v: 110, rmax: 22, r34: 150 }, 12), out = new Float32Array(NN); q.display(0, true, true);
  const t0 = performance.now(); for (let i = 0; i < 10; i++) { q.display(0, true, true); q.irTb(out, 28.8); } const ms = (performance.now() - t0) / 10;
  check('the infrared picture costs ' + ms.toFixed(1) + ' ms with ' + q.towers().length + ' cells (under 40 ms on this machine)', ms < 40);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
