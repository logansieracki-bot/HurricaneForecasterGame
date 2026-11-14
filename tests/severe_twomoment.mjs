// Node-only tests of the two-moment rain of the Severe core (src/severe-core.js with ice: true and iceParams.twoMoment: true) and of its reflectivity (src/severe-refl.js).
// The number of rain drops (nr, per kg of air) is a second prognostic variable beside the rain's mass (qr); the size distribution is still exponential but its intercept is free. The tests show that the scheme
// is the single-moment one where it should be (the evaporation of the single-moment size distribution, the rain that the warm-rain processes make), that every process still conserves water and the moist enthalpy,
// that the number follows the mass in freezing, collection and evaporation, that melting gives drops of the size of the particle that melted, that the drops are sorted by size as they fall (mass and number fall at
// their own speeds), that big drops evaporate more slowly than small ones at the rate of the ventilation integrals, that the reflectivity goes as 1 / N at a given mass, that restart files without the number are
// accepted, and that a 2-D warm bubble stays stable with a warmer cold pool than the single-moment one. tools/severe_twomoment_mutants.mjs changes the scheme one expression at a time and checks that these tests notice.
import '../src/severe-core.js';
import '../src/severe-refl.js';
import '../src/severe-nest.js';
import { loadSounding, bubble } from '../tools/severe_research/wk82.mjs';

const C = globalThis.HFSevereCore, RF = globalThis.HFSevereRefl, NEST = globalThis.HFSevereNest, { CP, RD, P0, KS } = C.consts, snd = loadSounding(), gam = C.gammaF;
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); if (process.env.FAILFAST) process.exit(1); } }          // (FAILFAST=1: stop at the first failure, for the mutants)
const f3 = (v) => (+v).toPrecision(4), t0 = Date.now(), lap = () => ((Date.now() - t0) / 1000).toFixed(1) + ' s';
const LV = KS.XLV, LF = 3.34e5, T0 = 273.15, RHOW = 1000, XMIN = 2.6e-10, XMAX = 5e-6;
const mk = (o, ip) => C.create(Object.assign({ nx: 4, ny: 1, nz: 24, dx: 1000, dz: 500, ice: true, sediment: false, theta: snd.theta, qv: snd.qv, bc: { x: 'periodic' }, iceParams: Object.assign({ twoMoment: true }, ip || {}) }, o || {}));
const mk1 = (o) => mk(Object.assign({}, o), { twoMoment: false });
const esw = (T) => 611.2 * Math.exp(KS.SVP2 * (T - KS.SVPT0) / (T - KS.SVP3)), qsw = (T, p) => KS.EP2 * esw(T) / (p - esw(T));
const K = 3;                                                                                        // the level used for single cells (1.75 km: warm)
const KC = 10;                                                                                      // and a cold one (5.25 km)
function setCell(core, i, st, k = K) {
  const o = core.idx(i, 0, k), b = core.base, S = core.S;
  S.th[o] = st.T / b.pibc[k] - b.thc[k]; S.qv[o] = st.qv - b.qvbc[k];
  for (const n of ['qc', 'qr', 'qi', 'qs', 'qg']) S[n][o] = st[n] || 0;
  if (S.nr) S.nr[o] = st.nr || 0;
  return o;
}
function read(core, o, k = K) { const b = core.base, S = core.S; return { T: (b.thc[k] + S.th[o]) * b.pibc[k], qv: b.qvbc[k] + S.qv[o], qc: S.qc[o], qr: S.qr[o], qi: S.qi[o], qs: S.qs[o], qg: S.qg[o], nr: S.nr ? S.nr[o] : 0 }; }
function run(core, dt, n) { for (let m = 0; m < n; m++) { core.micro(dt); core.S.pi.fill(0); } }          // single-cell tests: the pressure perturbation of the heating is dropped after each step
const pOf = (core, k = K) => P0 * Math.pow(core.base.pibc[k], CP / RD);
const nOfD = (q, d) => q / (Math.PI / 6 * RHOW * d * d * d);                                         // the number per kg of rain of mass q whose mean drop has the volume diameter d
const dOf = (q, n) => Math.cbrt(6 * q / n / Math.PI / RHOW);

/* 1. The option adds one prognostic variable, only when asked for. */
{
  const a = mk1(), b = mk();
  check('the option is off unless asked for: a core without it has no drop number, one with it has nr beside the other waters (' + a.names.join(',') + ' against ' + b.names.slice(-2).join(',') + ')', !a.names.includes('nr') && !a.iceParams.twoMoment && b.names.includes('nr') && b.names[b.names.length - 1] === 'nr' && b.iceParams.twoMoment === true && b.iceParams.xrMin === XMIN && b.iceParams.xrMax === XMAX);
}

/* 2. The single-moment size distribution evaporates as the single-moment scheme does; bigger drops more slowly, smaller drops faster, at the ratio of the ventilation integrals. */
{
  const probe = mk(), p = pOf(probe), rho = probe.base.rhoc[K], T = 285, q = 1e-3, qv = 0.6 * qsw(T, p);
  const lamMP = Math.pow(Math.PI * RHOW * 8e6 / (rho * q), 0.25), nMP = 8e6 / lamMP / rho;
  const lost = (c, nr) => { const o = setCell(c, 1, { T, qv, qr: q, nr }); run(c, 10, 1); return q - read(c, o).qr; };
  const one = lost(mk1(), 0), two = lost(mk(), nMP);
  check('rain of the single-moment size distribution evaporates in one step as the single-moment scheme says (' + f3(1e3 * two) + ' against ' + f3(1e3 * one) + ' g/kg, ratio ' + (two / one).toFixed(9) + ')', Math.abs(two / one - 1) < 1e-9);
  // the theory: the rate goes as N0 times the ventilation integral (0.78 / lambda^2 + 0.31 Sc^(1/3) sqrt(a sqrt(rho0 / rho) / nu) Gamma((b + 5) / 2) / lambda^((b + 5) / 2)); the single-moment formula is for N0 = 8e6
  const mu = 1.458e-6 * Math.pow(T, 1.5) / (T + 110.4), nu = mu / rho, dv = 2.11e-5 * Math.pow(T / 273.15, 1.94) * 101325 / p, sc = nu / dv, a = 842, b = 0.8, rho0 = probe.base.rhoc[0];
  const vent = (l) => 0.78 / (l * l) + 0.31 * Math.cbrt(sc) * Math.sqrt(a * Math.sqrt(rho0 / rho) / nu) * gam((b + 5) / 2) / Math.pow(l, (b + 5) / 2);
  const rows = [];
  for (const d of [0.4e-3, 0.8e-3, 1.5e-3, 2.0e-3]) {
    const n = nOfD(q, d), l = Math.cbrt(Math.PI * RHOW * n / q), want = (rho * n * l * vent(l)) / (8e6 * vent(lamMP)), got = lost(mk(), n) / one;
    rows.push({ d, want, got });
  }
  const maxErr = Math.max(...rows.map((r) => Math.abs(r.got / r.want - 1)));
  check('drops of 0.4, 0.8, 1.5 and 2 mm evaporate ' + rows.map((r) => r.got.toFixed(3)).join(', ') + ' times as fast as the single-moment rain of the same mass, the ratios of N0 times the ventilation integral (' + rows.map((r) => r.want.toFixed(3)).join(', ') + '; the largest error ' + maxErr.toExponential(1) + ')', maxErr < 2e-3 && rows[0].got > rows[1].got && rows[1].got > rows[2].got && rows[2].got > rows[3].got && rows[0].got > 1.5 && rows[3].got < 0.5);
}

/* 3. Conservation: 300 random states from -48 to +9 C with every species present or not and a drop number that is not the single-moment one: water and the moist enthalpy as in the single-moment scheme, the number never negative, the mean drop mass kept in its range. */
{
  let seed = 4242; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pw = pOf(mk(), KC), qs = (T) => KS.EP2 * 611.2 * Math.exp(KS.SVP2 * (T - KS.SVPT0) / (T - KS.SVP3)) / (pw - 611.2);
  let dw = 0, dh = 0, neg = 0, off = 0, bad = 0;
  for (let n = 0; n < 300; n++) {
    const core = mk(), T = 225 + 60 * rnd(), qv = qsw(T, pw) * (0.3 + 1.1 * rnd()), st = { T, qv };
    for (const nme of ['qc', 'qr', 'qi', 'qs', 'qg']) st[nme] = rnd() < 0.5 ? 0 : 3e-3 * rnd();
    st.nr = st.qr > 0 ? st.qr / (XMIN * Math.pow(XMAX / XMIN, rnd())) : 0;
    const o = setCell(core, 1, st, KC), a = read(core, o, KC); run(core, 10, 1); const z = read(core, o, KC);
    const W = (s) => s.qv + s.qc + s.qr + s.qi + s.qs + s.qg, E = (s) => CP * s.T + LV * s.qv - LF * (s.qi + s.qs + s.qg);
    dw = Math.max(dw, Math.abs(W(z) - W(a))); dh = Math.max(dh, Math.abs(E(z) - E(a)) / CP / 1e-3);
    if (z.nr < 0 || z.qr < 0) neg++;
    if (z.qr > 1e-12 && (z.nr < z.qr / XMAX * (1 - 1e-9) || z.nr > z.qr / XMIN * (1 + 1e-9))) off++; if (!Number.isFinite(z.nr) || !Number.isFinite(z.T)) bad++;
  }
  check('300 random states in one step: water is conserved to ' + dw.toExponential(1) + ' kg/kg, the moist enthalpy to ' + dh.toExponential(1) + ' (in units of 1 g/kg of heat, K), no negative waters or numbers (' + neg + '), the mean drop mass always between 2.6e-10 and 5e-6 kg (' + off + ' outside), nothing not finite (' + bad + ')', dw < 1e-12 && dh < 1e-6 && neg === 0 && off === 0 && bad === 0);
}

/* 4. The warm-rain processes make drops of the single-moment size; melting makes drops of the mass of the particle that melts (in the thin air of 5 km, where the density is two thirds of the ground's, with the temperature put by hand). */
{
  const probe = mk(), p = pOf(probe), rho = probe.base.rhoc[K], pc = pOf(probe, KC), rhoC = probe.base.rhoc[KC];
  // cloud water of 3 g/kg at 285 K, no rain: autoconversion and accretion make rain, the number follows the mass by the single-moment mean mass
  { const c = mk(), o = setCell(c, 1, { T: 285, qv: qsw(285, p), qc: 3e-3 }); run(c, 10, 1); const r = read(c, o), l = Math.pow(Math.PI * RHOW * 8e6 / (rho * r.qr), 0.25), x = rho * r.qr * l / 8e6;
    check('cloud water that autoconverts makes rain with the single-moment mean drop mass (' + f3(r.qr / r.nr) + ' kg for ' + f3(1e3 * r.qr) + ' g/kg of rain: the distribution of 8e6 m-4 has ' + f3(x) + ')', r.qr > 1e-6 && Math.abs(r.qr / r.nr / x - 1) < 1e-6); }
  // snow at +4 C: the rain has the mean mass of the snow's own distribution (its intercept is 2e6 above freezing)
  { const c = mk(), qs = 1e-3, T = 277, o = setCell(c, 1, { T, qv: 0.9 * qsw(T, pc), qs }, KC); const lS = Math.pow(Math.PI * 100 * 2e6 / (rhoC * qs), 0.25), xS = rhoC * qs * lS / 2e6;
    run(c, 10, 1); const r = read(c, o, KC), melted = qs - r.qs;
    check('snow that melts makes drops of its own mean mass (' + f3(melted / r.nr) + ' kg, the snow of 2e6 m-4 and 100 kg/m3 having ' + f3(xS) + '; ' + f3(1e3 * melted) + ' g/kg melted)', melted > 1e-5 && Math.abs(melted / r.nr / xS - 1) < 2e-2); }
  // graupel at +5 C with air warm enough to melt it: the rain has the mean mass of the graupel's own distribution
  { const c = mk(), qg = 2e-3, T = 278, o = setCell(c, 1, { T, qv: 0.9 * qsw(T, pc), qg }, KC); const lG = Math.pow(Math.PI * 400 * 4e6 / (rhoC * qg), 0.25), xG = rhoC * qg * lG / 4e6;
    run(c, 10, 1); const r = read(c, o, KC), melted = qg - r.qg;
    check('graupel that melts makes drops of its own mean mass (' + f3(melted / r.nr) + ' kg, the graupel of 4e6 m-4 and 400 kg/m3 having ' + f3(xG) + '; ' + f3(1e3 * melted) + ' g/kg melted into ' + f3(r.nr) + ' drops per kg)', melted > 1e-5 && Math.abs(melted / r.nr / xG - 1) < 2e-2); }
  // what melts is never made of drops smaller than 80 microns or bigger than 2.1 mm across: snow of a trace (mean mass of 8e-11 kg) and graupel of 50 g/kg (7e-6 kg)
  { const c = mk(), T = 277, o = setCell(c, 1, { T, qv: qsw(T, pc), qs: 1e-8 }, KC); run(c, 10, 1); const r = read(c, o, KC), got = (1e-8 - r.qs) / r.nr;
    check('snow of a trace that melts makes drops no smaller than the scheme\'s smallest (' + f3(got) + ' kg against ' + f3(XMIN) + ')', 1e-8 - r.qs > 1e-10 && Math.abs(got / XMIN - 1) < 1e-6); }
  { const c = mk(), T = 280, o = setCell(c, 1, { T, qv: qsw(T, pc), qg: 5e-2 }, KC); run(c, 10, 1); const r = read(c, o, KC), got = (5e-2 - r.qg) / r.nr;
    check('graupel of 50 g/kg that melts makes drops no bigger than the scheme\'s biggest (' + f3(got) + ' kg against ' + f3(XMAX) + ')', 5e-2 - r.qg > 1e-5 && Math.abs(got / XMAX - 1) < 1e-3); }
}

/* 4b. The drop number is kept in range: rain with no drops counted, or with absurdly many, is given the biggest or the smallest drops the scheme has, and stays finite. */
{
  const probe = mk(), pw = pOf(probe), q = 1e-3, T = 285;
  const run1 = (nr) => { const c = mk(), o = setCell(c, 1, { T, qv: 0.95 * qsw(T, pw), qr: q, nr }); run(c, 1, 1); return read(c, o); };
  const a = run1(0), b = run1(1e12);
  check('rain with no drops counted is made of the biggest drops (' + f3(a.qr / a.nr) + ' kg: ' + f3(XMAX) + ') and rain with absurdly many of the smallest (' + f3(b.qr / b.nr) + ' kg: ' + f3(XMIN) + '), both finite', Number.isFinite(a.nr) && Number.isFinite(b.nr) && Math.abs(a.qr / a.nr / XMAX - 1) < 1e-6 && Math.abs(b.qr / b.nr / XMIN - 1) < 1e-6);
}

/* 5. Freezing and collection take drops in proportion to the mass; homogeneous freezing takes them all; evaporation takes the number with the mass. */
{
  const probe = mk(), pc = pOf(probe, KC), rho = probe.base.rhoc[KC], rho0 = probe.base.rhoc[0], q = 1e-3, n = nOfD(q, 1.2e-3);
    // the reference of the kernel integral of the collection of rain by graupel (the core's pairColl, written out), and of Bigg's freezing: 20 pi^2 100 N0 (rho_w / rho) (exp(0.66 (T0 - T)) - 1) / lambda^7 per second, N0 = rho nr lambda
  const VGa = Math.sqrt(4 * 9.81 * 400 / (3 * 0.6 * rho0)), gw = (b) => [0, 1, 2, 3, 4, 5].map((pp) => gam(1 + pp + b) / gam(1 + pp)), SPG = { a: VGa, b: 0.5, g: gw(0.5) }, SPR = { a: 842, b: 0.8, g: gw(0.8) };
  const vW = (S, pp, l) => S.a * Math.sqrt(rho0 / rho) * S.g[pp] / Math.pow(l, S.b);
  const collRef = (lG, lR, n0r) => Math.PI * Math.PI * RHOW * 4e6 * n0r * (0.5 * Math.abs(vW(SPG, 2, lG) - vW(SPR, 3, lR)) / (lG ** 3 * lR ** 4) + 2 * Math.abs(vW(SPG, 1, lG) - vW(SPR, 4, lR)) / (lG * lG * lR ** 5) + 5 * Math.abs(vW(SPG, 0, lG) - vW(SPR, 5, lR)) / (lG * lR ** 6)) / rho;
  // Bigg's freezing makes graupel, which collects rain in the same step (in the order of the scheme: the freezing at the size distribution the cell had, then the collection with the graupel it made): the loss of rain of the whole step is the two, for the size distribution of each cell
  { const T = 263, dt = 10, rows = [];
    for (const d of [0.5e-3, 1.0e-3, 1.8e-3]) { const nn = nOfD(q, d), l = Math.cbrt(Math.PI * RHOW * nn / q), n0 = rho * nn * l;
      const d1 = Math.min(q, 20 * Math.PI * Math.PI * 100 * n0 * (RHOW / rho) * (Math.exp(0.66 * (T0 - T)) - 1) / Math.pow(l, 7) * dt), lGn = Math.pow(Math.PI * 400 * 4e6 / (rho * d1), 0.25), d2 = Math.min(q - d1, collRef(lGn, l, n0) * dt);
      const c = mk(), o = setCell(c, 1, { T, qv: qsw(T, pc), qr: q, nr: nn }, KC); run(c, dt, 1); rows.push({ d, want: d1 + d2, got: q - read(c, o, KC).qr, d1 }); }
    const err = Math.max(...rows.map((r) => Math.abs(r.got / r.want - 1)));
    check('rain of mean drops of 0.5, 1 and 1.8 mm at -10 C loses ' + rows.map((r) => f3(1e3 * r.got)).join(', ') + ' g/kg in 10 s to Bigg freezing (' + rows.map((r) => f3(1e3 * r.d1)).join(', ') + ') and the collection by the graupel it makes, the formulas for the size distribution of each (' + rows.map((r) => f3(1e3 * r.want)).join(', ') + '; the largest error ' + err.toExponential(1) + ')', err < 2e-3 && rows[0].got > 0 && rows[0].d1 < rows[1].d1 && rows[1].d1 < rows[2].d1); }
  // graupel collects rain at the double integral of the collision kernel over its own distribution and the rain's (N0 = rho nr lambda): the same formula as the core, written out here
  { const T = 272, qg = 1e-5, rows = [], lG = Math.pow(Math.PI * 400 * 4e6 / (rho * qg), 0.25);
    for (const d of [0.6e-3, 1.2e-3, 2.0e-3]) { const nn = nOfD(q, d), lR = Math.cbrt(Math.PI * RHOW * nn / q), n0 = rho * nn * lR;
      const want = collRef(lG, lR, n0) * 10;
      const c = mk(), o = setCell(c, 1, { T, qv: qsw(T, pc), qr: q, qg, nr: nn }, KC); run(c, 2, 1); rows.push({ d, want: want / 5, got: q - read(c, o, KC).qr }); }
    const err = Math.max(...rows.map((r) => Math.abs(r.got / r.want - 1)));
    check('graupel collects ' + rows.map((r) => f3(1e3 * r.got)).join(', ') + ' g/kg of rain of mean drops of 0.6, 1.2 and 2 mm in 2 s, the integral over the two distributions (' + rows.map((r) => f3(1e3 * r.want)).join(', ') + '; the largest error ' + err.toExponential(1) + ')', err < 0.02); }
  { const c = mk(), T = 263, o = setCell(c, 1, { T, qv: qsw(T, pc), qr: q, nr: n }, KC); run(c, 10, 1); const r = read(c, o, KC);
    check('rain at -10 C that freezes (Bigg) loses drops in proportion to its mass (' + f3(1e3 * (q - r.qr)) + ' g/kg frozen, drops left ' + (r.nr / n).toFixed(6) + ' of the start, mass left ' + (r.qr / q).toFixed(6) + ')', r.qr < 0.999 * q && Math.abs(r.nr / n / (r.qr / q) - 1) < 1e-6); }
  { const c = mk(), T = 263, o = setCell(c, 1, { T, qv: qsw(T, pc), qr: q, qg: 1e-5, nr: n }, KC); run(c, 10, 1); const r = read(c, o, KC);
    check('graupel that collects rain takes drops in proportion too (the mean drop mass of what is left, ' + f3(r.qr / r.nr) + ' kg, is that of the start, ' + f3(q / n) + '; ' + f3(1e3 * (q - r.qr)) + ' g/kg collected or frozen)', r.qr < 0.99 * q && r.qr > 0.05 * q && Math.abs((r.qr / r.nr) / (q / n) - 1) < 1e-6); }
  { const c = mk(), T = 225, o = setCell(c, 1, { T, qv: qsw(T, pc), qr: q, nr: n }, KC); run(c, 10, 1); const r = read(c, o, KC);
    check('rain colder than -40 C freezes whole: no rain and no drops are left (' + r.qr + ', ' + r.nr + ') and the graupel has it (' + f3(1e3 * r.qg) + ' g/kg)', r.qr === 0 && r.nr === 0 && r.qg >= q - 1e-12); }
  { const p = pOf(probe), c = mk(), T = 285, o = setCell(c, 1, { T, qv: 0.5 * qsw(T, p), qr: q, nr: nOfD(q, 1.0e-3) }); run(c, 10, 3); const r = read(c, o), n0 = nOfD(q, 1.0e-3);
    check('evaporating rain keeps its mean drop mass (' + f3(r.qr / r.nr) + ' kg against ' + f3(q / n0) + ' at the start, ' + (100 * (1 - r.qr / q)).toFixed(1) + ' % of the mass gone)', r.qr < 0.97 * q && Math.abs((r.qr / r.nr) / (q / n0) - 1) < 1e-6); }
}

/* 6. Sorting: a layer of rain falls through saturated air; mass and number fall at their own speeds, so the big drops arrive first, the mass reaching the ground is what leaves the column, and the drops that stay behind are small. */
{
  const nz = 40, dz = 250, c = C.create({ nx: 4, ny: 1, nz, dx: 1000, dz, ice: true, sediment: true, theta: snd.theta, qv: snd.qv, bc: { x: 'periodic' }, iceParams: { twoMoment: true, evap: 0 } }), S = c.S, b = c.base;
  const dm = 1.5e-3, q0 = 2e-3, n0 = nOfD(q0, dm);
  for (let k = 6; k < 10; k++) { const o = c.idx(1, 0, k); S.qr[o] = q0; S.nr[o] = n0; }
  const mass = () => { let m = 0; for (let k = 0; k < nz; k++) m += b.rhoc[k] * dz * S.qr[c.idx(1, 0, k)]; return m; };
  const m0 = mass(); let t = 0, front = 0, tail = 0, ratio = 0, mid = 1;
  for (let s = 1; s <= 48; s++) { c.micro(5); t += 5;
    if (t === 180) { mid = (mass() + c.precip[1]) / m0;
      const prof = []; for (let k = 0; k < nz; k++) { const o = c.idx(1, 0, k), q = S.qr[o]; if (q > 1e-6) prof.push({ k, d: dOf(q, S.nr[o]), q }); }
      front = prof[0].d; tail = prof[prof.length - 1].d; ratio = (m0 > 0 ? c.precip[1] / m0 : 0); } }
  check('after 3 minutes the rain at the front of the falling layer is made of big drops (' + (1e3 * front).toFixed(2) + ' mm) and the rain it leaves behind of small ones (' + (1e3 * tail).toFixed(2) + ' mm), from drops of ' + (1e3 * dm).toFixed(1) + ' mm that fell together, and ' + (100 * ratio).toFixed(0) + ' % of the mass has reached the ground', front > 1.2 * dm && tail < 0.7 * dm && ratio > 0.05 && ratio < 0.95);
  check('the rain falling is conserved: what is in the column and what has reached the ground add up to the start (' + mid.toFixed(9) + ' of it)', Math.abs(mid - 1) < 1e-9);
}

/* 6a. The fall speeds: the mass and the number that leave a cell of rain in one step go at the speeds of the size distribution there, with the thinner air faster (the mass-weighted speed 842 Gamma(4.8) / 6 / lambda^0.8 and the number-weighted 842 Gamma(1.8) / lambda^0.8, times sqrt(rho_0 / rho)); a long step takes the short steps that its Courant number asks for. */
{
  const nz = 40, dz = 250, mkc = () => C.create({ nx: 4, ny: 1, nz, dx: 1000, dz, ice: true, sediment: true, theta: snd.theta, qv: snd.qv, bc: { x: 'periodic' }, iceParams: { twoMoment: true, evap: 0 } });
  const rows = [];
  for (const k of [2, 8, 14]) for (const d of [0.4e-3, 1.0e-3]) {
    const c = mkc(), S = c.S, b = c.base, q = 1e-3, n = nOfD(q, d), o = c.idx(1, 0, k), ob = c.idx(1, 0, k - 1); S.qr[o] = q; S.nr[o] = n; c.micro(2);
    const l = Math.cbrt(Math.PI * RHOW * n / q), f = 842 * Math.sqrt(b.rhoc[0] / b.rhoc[k]) / Math.pow(l, 0.8), vq = f * gam(4.8) / 6, vn = f * gam(1.8);
    rows.push({ k, d, mass: S.qr[ob] * b.rhoc[k - 1] * dz / (q * b.rhoc[k] * 2) / vq, num: S.nr[ob] * b.rhoc[k - 1] * dz / (n * b.rhoc[k] * 2) / vn });
  }
  const err = Math.max(...rows.map((r) => Math.max(Math.abs(r.mass - 1), Math.abs(r.num - 1))));
  check('in one step the rain moves down at the mass- and number-weighted speeds of its size distribution at heights of 0.6, 2.1 and 3.6 km for drops of 0.4 and 1 mm (the ratios to the formulas, ' + rows.map((r) => r.mass.toFixed(4) + '/' + r.num.toFixed(4)).join(' '), err < 2e-3);
  const c = mkc(), S = c.S, b = c.base, n0 = nOfD(2e-3, 1.8e-3); for (let k = 6; k < 10; k++) { const o = c.idx(1, 0, k); S.qr[o] = 2e-3; S.nr[o] = n0; }
  const mass = () => { let m = 0, neg = 0; for (let k = 0; k < nz; k++) { const q = S.qr[c.idx(1, 0, k)]; m += b.rhoc[k] * dz * q; if (q < 0 || S.nr[c.idx(1, 0, k)] < 0) neg++; } return [m, neg]; };
  const m0 = mass()[0]; c.micro(30); const [m1, neg] = mass();
  check('a step of 30 s, in which big drops cross more than a cell, is taken in short steps and still conserves the rain that falls (' + ((m1 + c.precip[1]) / m0).toFixed(9) + ' of the start, ' + neg + ' negative cells)', Math.abs((m1 + c.precip[1]) / m0 - 1) < 1e-9 && neg === 0);
}
{
  // drops counted where there is no rain (a trace under 1e-12 kg/kg, in a column in which rain falls) are not kept
  const c = C.create({ nx: 4, ny: 1, nz: 24, dx: 1000, dz: 500, ice: true, sediment: true, theta: snd.theta, qv: snd.qv, bc: { x: 'periodic' }, iceParams: { twoMoment: true, evap: 0 } }), ob = c.idx(1, 0, 3), og = c.idx(1, 0, 8);
  c.S.qr[ob] = 1e-3; c.S.nr[ob] = nOfD(1e-3, 1e-3); c.S.qr[og] = 5e-13; c.S.nr[og] = 100; c.micro(5);
  check('drops counted in a cell with no rain, in a column in which rain falls, are not kept (' + c.S.nr[og] + ' per kg)', c.S.nr[og] === 0 && c.S.qr[ob] > 0);
}
{
  const c = mk(), o = c.idx(1, 0, K); c.S.nr[o] = -5; c.S.qr[o] = 0; c.micro(1);
  check('a negative number of drops is clipped to nothing and is not counted among the water that clipping adds (' + c.S.nr[o] + ', ' + c.stat.clipped + ' kg)', c.S.nr[o] === 0 && c.stat.clipped === 0);
}

/* 6b. The drops themselves are conserved in the air (when no drop is taken to be bigger than the scheme's biggest, which breaks up): a layer of drops of 0.6 mm falls for 40 s, before the first of them reaches the ground. */
{
  const nz = 40, dz = 250, c = C.create({ nx: 4, ny: 1, nz, dx: 1000, dz, ice: true, sediment: true, theta: snd.theta, qv: snd.qv, bc: { x: 'periodic' }, iceParams: { twoMoment: true, evap: 0 } }), S = c.S, b = c.base;
  const q0 = 2e-3, n0 = nOfD(q0, 0.6e-3);
  for (let k = 10; k < 14; k++) { const o = c.idx(1, 0, k); S.qr[o] = q0; S.nr[o] = n0; }
  const num = () => { let m = 0; for (let k = 0; k < nz; k++) m += b.rhoc[k] * dz * S.nr[c.idx(1, 0, k)]; return m; }, mass = () => { let m = 0; for (let k = 0; k < nz; k++) m += b.rhoc[k] * dz * S.qr[c.idx(1, 0, k)]; return m; };
  const nm0 = num(), m0 = mass(); for (let s = 1; s <= 8; s++) c.micro(5);
  let low = 99; for (let k = 0; k < nz; k++) if (S.qr[c.idx(1, 0, k)] > 1e-9) { low = k; break; }
  const tPrecip = c.precip[1];
  const tNum = num() / nm0, tMass = mass() / m0; for (let s = 1; s <= 60; s++) c.micro(5);
  let ghost = 0, empty = 0; for (let k = 0; k < nz; k++) for (let i = 0; i < 4; i++) { const o = c.idx(i, 0, k); if (S.qr[o] <= 1e-12) { empty++; if (S.nr[o] !== 0) ghost++; } }
  check('where the falling rain has left a cell no drops are left in it, none of the ' + empty + ' cells without rain has any (' + ghost + ' have)', empty > 100 && ghost === 0);
  check('the drops in the air are all there after 40 s (' + tNum.toFixed(9) + ' of them, ' + tMass.toFixed(9) + ' of the mass), and the layer has not reached the ground (its lowest cell is at ' + ((low + 0.5) * dz).toFixed(0) + ' m)', Math.abs(tNum - 1) < 2e-4 && Math.abs(tMass - 1) < 1e-9 && low >= 2 && tPrecip === 0);
}

/* 7. The reflectivity: the same as the single-moment one for the single-moment size distribution, +3 dB for half the drops of the same mass, and the Doppler speed of bigger drops higher. */
{
  const dbz = (core, o) => { const col = new Float64Array(core.nz), vz = new Float64Array(core.nz); RF.create(core).column(1, 0, col, vz); return { z: col[K], v: vz[K] }; };
  const probe = mk(), rho = probe.base.rhoc[K], q = 2e-3, T = 285, p = pOf(probe), lam = Math.pow(Math.PI * RHOW * 8e6 / (rho * q), 0.25), nMP = 8e6 / lam / rho;
  const cs = mk1(), os = setCell(cs, 1, { T, qv: qsw(T, p), qr: q }), c1 = mk(), o1 = setCell(c1, 1, { T, qv: qsw(T, p), qr: q, nr: nMP }), c2 = mk(), o2 = setCell(c2, 1, { T, qv: qsw(T, p), qr: q, nr: nMP / 2 }), c3 = mk(), o3 = setCell(c3, 1, { T, qv: qsw(T, p), qr: q, nr: nMP * 2 });
  const zs = dbz(cs, os), z1 = dbz(c1, o1), z2 = dbz(c2, o2), z3 = dbz(c3, o3);
  check('rain of the single-moment size distribution has the single-moment reflectivity (' + z1.z.toFixed(6) + ' against ' + zs.z.toFixed(6) + ' dBZ, the Doppler speed ' + z1.v.toFixed(5) + ' against ' + zs.v.toFixed(5) + ' m/s)', Math.abs(z1.z - zs.z) < 1e-6 && Math.abs(z1.v - zs.v) < 1e-6);
    const cl = mk(), ol = setCell(cl, 1, { T, qv: qsw(T, p), qr: q, nr: 0 }), ch = mk(), oh = setCell(ch, 1, { T, qv: qsw(T, p), qr: q, nr: 1e12 }), cb = mk(), ob = setCell(cb, 1, { T, qv: qsw(T, p), qr: q, nr: q / XMAX }), cm = mk(), om = setCell(cm, 1, { T, qv: qsw(T, p), qr: q, nr: q / XMIN });
  const zl = dbz(cl, ol), zh = dbz(ch, oh), zb = dbz(cb, ob), zsm = dbz(cm, om);
  check('rain with no drops counted reflects as the biggest drops and rain with absurdly many as the smallest (' + zl.z.toFixed(4) + ' and ' + zb.z.toFixed(4) + ' dBZ; ' + zh.z.toFixed(4) + ' and ' + zsm.z.toFixed(4) + ' dBZ)', Math.abs(zl.z - zb.z) < 1e-9 && Math.abs(zh.z - zsm.z) < 1e-9 && zl.z > zsm.z + 10);
  check('half the drops for the same mass is 3.01 dB more echo and twice the drops 3.01 dB less (' + (z2.z - z1.z).toFixed(4) + ', ' + (z3.z - z1.z).toFixed(4) + '), and the bigger drops fall faster for the radar (' + z2.v.toFixed(3) + ' against ' + z1.v.toFixed(3) + ' and ' + z3.v.toFixed(3) + ' m/s)', Math.abs(z2.z - z1.z - 10 * Math.log10(2)) < 1e-4 && Math.abs(z3.z - z1.z + 10 * Math.log10(2)) < 1e-4 && z2.v > z1.v && z1.v > z3.v);
}

/* 8. State: a restart file made without the drop number (a single-moment run) is accepted and given the single-moment size distribution; the state goes out and back with the number. */
{
  const a = mk1(), S1 = a.S, o = a.idx(1, 0, K), rho = a.base.rhoc[K]; S1.qr[o] = 1.5e-3; S1.qr[a.idx(2, 0, K)] = 3e-4;
  const st = a.getState(), b = mk(); b.setState(st);
  const q = 1.5e-3, lam = Math.pow(Math.PI * RHOW * 8e6 / (rho * q), 0.25), want = 8e6 / lam / rho, got = b.S.nr[b.idx(1, 0, K)];
  check('a state from a single-moment run is taken with the single-moment drop number (' + f3(got) + ' per kg, the distribution of 8e6 m-4 having ' + f3(want) + '), nothing where there is no rain (' + b.S.nr[b.idx(0, 0, K)] + ')', Math.abs(got / want - 1) < 1e-9 && b.S.nr[b.idx(0, 0, K)] === 0);
  const s2 = b.getState(), c = mk(); c.setState(s2);
  check('the state with the number goes out and back as it was (' + (c.S.nr[c.idx(1, 0, K)] === b.S.nr[b.idx(1, 0, K)]) + ')', s2.f.nr && c.S.nr[c.idx(1, 0, K)] === b.S.nr[b.idx(1, 0, K)] && c.S.nr[c.idx(2, 0, K)] === b.S.nr[b.idx(2, 0, K)]);
}

/* 9. A nest of two-moment cores: the child takes the drop number from its parent as it takes the other waters. */
{
  const opt = { ny: 12, nz: 8, dz: 500, ice: true, theta: snd.theta, qv: snd.qv, iceParams: { twoMoment: true } };
  const parent = C.create(Object.assign({ nx: 12, dx: 1000, bc: { x: 'periodic', y: 'periodic' } }, opt)), child = C.create(Object.assign({ nx: 12, dx: 500, bc: { x: 'driven', y: 'driven' }, relax: { width: 3 } }, opt));
  for (let k = 0; k < 4; k++) for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) { const o = parent.idx(i, j, k); parent.S.qr[o] = 1e-3; parent.S.nr[o] = nOfD(1e-3, 1.0e-3); }
  parent.fill();
  const nest = NEST.create({ parent, child, ratio: 2, x0: 3000, y0: 3000 }); nest.init();
  const oc = child.idx(5, 5, 1); let ok = true; for (let m = 0; m < 3; m++) { nest.step(4); }
  const fin = Number.isFinite(child.diag().wmax) && Number.isFinite(parent.diag().wmax);
  check('a child of two-moment rain inside a two-moment parent has the parent\'s drops where the parent has rain (' + f3(child.S.nr[oc]) + ' against ' + f3(parent.S.nr[parent.idx(4, 4, 1)]) + ' per kg after three steps) and the nest runs (finite: ' + fin + ')', fin && child.names.includes('nr') && child.S.nr[oc] > 0.5 * nOfD(1e-3, 1.0e-3) && child.S.qr[oc] > 5e-4);
}

/* 10. A warm bubble in a 2-D slice of the Weisman-Klemp sounding, 30 minutes, with the single-moment rain and with the two-moment: stable, drops everywhere in range, rain at the ground, and a warmer cold pool with two moments (the large drops that fall out of the downdraft evaporate more slowly). */
{
  const out = {};
  for (const two of [false, true]) {
    const nx = 100, nz = 40, core = C.create({ nx, ny: 1, nz, dx: 1000, dz: 500, ice: true, theta: snd.theta, qv: snd.qv, bc: { x: 'periodic' }, visc: { kh: 300, kv: 300 }, damp: { top: { depth: 5000, rate: 0.003 } }, iceParams: two ? { twoMoment: true } : {} });
    const S = core.S; for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) S.th[core.idx(i, 0, k)] = bubble((i + 0.5) * 1000, 0, (k + 0.5) * 500, 50000, 0);
    let wpk = 0, thv = 0, bad = false; for (let m = 1; m <= 300; m++) { core.step(6); const d = core.diag(); wpk = Math.max(wpk, d.wmax); thv = Math.min(thv, d.thvmin); if (!Number.isFinite(d.wmax)) { bad = true; break; } }
    let nmin = 0, off = 0; if (two) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { const o = core.idx(i, 0, k); nmin = Math.min(nmin, S.nr[o]); if (S.qr[o] > 1e-9 && (S.nr[o] < S.qr[o] / XMAX * (1 - 1e-6) || S.nr[o] > S.qr[o] / XMIN * (1 + 1e-6))) off++; }
    out[two ? 'two' : 'one'] = { wpk, thv, bad, nmin, off, rain: Math.max(...core.precip), clipped: core.stat.clipped, water: (() => { let w = 0; for (const n of ['qc', 'qr', 'qi', 'qs', 'qg']) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) w += core.base.rhoc[k] * 500 * 1000 * S[n][core.idx(i, 0, k)]; return w; })() };
  }
  console.log('     2-D bubble, 30 min: single-moment w ' + f3(out.one.wpk) + ' m/s, coldest thv ' + f3(out.one.thv) + ' K, rain at the ground ' + f3(out.one.rain) + ' mm; two-moment w ' + f3(out.two.wpk) + ', ' + f3(out.two.thv) + ' K, ' + f3(out.two.rain) + ' mm');
  check('the bubble with two-moment rain is stable with an updraft of 15 to 70 m/s, drops never negative or out of range (' + out.two.nmin + ', ' + out.two.off + ' cells outside) and rain at the ground (' + f3(out.two.rain) + ' mm), and what the clipping of negative waters adds is small and not counted in drops (' + out.two.clipped.toExponential(1) + ' kg against ' + out.one.clipped.toExponential(1) + ' of the single-moment run, of ' + out.two.water.toExponential(1) + ' kg of water)', !out.two.bad && out.two.wpk > 15 && out.two.wpk < 70 && out.two.nmin === 0 && out.two.off === 0 && out.two.rain > 0.1 && out.two.clipped < 1e-3 * out.two.water + 2 * out.one.clipped);
  check('and its cold pool is warmer than the single-moment one by at least 0.3 K (' + f3(out.two.thv) + ' against ' + f3(out.one.thv) + ' K)', out.two.thv > out.one.thv + 0.3);
}

console.log(`\n${passed} passed, ${failed} failed (${lap()})`);
process.exit(failed ? 1 : 0);
