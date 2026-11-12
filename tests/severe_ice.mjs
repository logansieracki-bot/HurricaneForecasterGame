// Node-only tests of the ice microphysics of the Severe core (src/severe-core.js with ice: true): a single-moment scheme with cloud water, rain, cloud ice, snow and graupel.
// Single cells (the microphysics alone, one step or many) show that every process conserves water and the moist enthalpy cp T + Lv qv - Lf (qi + qs + qg); that melting,
// riming, deposition, the collection of rain, snow and ice, Bigg freezing and Cooper's nucleation run at the rates of the theory they are written from, which the tests work out
// by hand or by numerical quadrature of the size distributions; that cloud water freezes at -40 C, that a long step cannot take more than there is, that ice species fall at
// their speeds and a column's water budget closes with what reaches the ground counted by species; and a 2-D warm bubble in the Weisman-Klemp sounding with ice stays stable and
// grows an anvil and a graupel core. tools/severe_mutants.mjs changes the scheme one expression at a time and checks that these tests notice.
import '../src/severe-core.js';
import { loadSounding, bubble } from '../tools/severe_research/wk82.mjs';

const C = globalThis.HFSevereCore, { G, CP, RD, P0, KS } = C.consts, snd = loadSounding(), gam = C.gammaF;
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); } }
const f2 = (v, d = 2) => v.toFixed(d), t0 = Date.now(), lap = () => ((Date.now() - t0) / 1000).toFixed(1) + ' s';
const LV = KS.XLV, LF = 3.34e5, LS = LV + LF, T0 = 273.15;
const mk = (o) => C.create(Object.assign({ nx: 4, ny: 1, nz: 24, dx: 1000, dz: 500, ice: true, sediment: false, theta: snd.theta, qv: snd.qv, bc: { x: 'periodic' } }, o || {}));
const esw = (T) => 611.2 * Math.exp(KS.SVP2 * (T - KS.SVPT0) / (T - KS.SVP3)), esi = (T) => 611.2 * Math.exp(21.8745584 * (T - 273.16) / (T - 7.66));
const qsw = (T, p) => KS.EP2 * esw(T) / (p - esw(T)), qsi = (T, p) => KS.EP2 * esi(T) / (p - esi(T));
const K = 10;                                                                                     // the level used for single cells (5.25 km)
function setCell(core, i, st) {
  const o = core.idx(i, 0, K), b = core.base, S = core.S;
  S.th[o] = st.T / b.pibc[K] - b.thc[K]; S.qv[o] = st.qv - b.qvbc[K];
  for (const n of ['qc', 'qr', 'qi', 'qs', 'qg']) S[n][o] = st[n] || 0;
  return o;
}
function read(core, o) { const b = core.base, S = core.S; return { T: (b.thc[K] + S.th[o]) * b.pibc[K], qv: b.qvbc[K] + S.qv[o], qc: S.qc[o], qr: S.qr[o], qi: S.qi[o], qs: S.qs[o], qg: S.qg[o] }; }
function run(core, dt, n) { for (let m = 0; m < n; m++) { core.micro(dt); core.S.pi.fill(0); } }          // single-cell tests: the pressure perturbation of the heating is dropped after each step, as T is read at the base pressure
const water = (s) => s.qv + s.qc + s.qr + s.qi + s.qs + s.qg;
const enth = (s) => CP * s.T + LV * s.qv - LF * (s.qi + s.qs + s.qg);                        // the same pressure before and after, so T is the variable
const pK = () => { const core = mk(); return P0 * Math.pow(core.base.pibc[K], CP / RD); };
const P = pK();

/* 1. Conservation: 300 random states from -48 to +9 C with every species present or not, dry or supersaturated, one step of 10 s each. */
{
  let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let dw = 0, dh = 0, bad = 0, neg = 0;
  for (let n = 0; n < 300; n++) {
    const core = mk(), T = 225 + 60 * rnd(), sat = T < T0 ? (rnd() < 0.5 ? qsi(T, P) : qsw(T, P)) : qsw(T, P);
    const st = { T, qv: sat * (0.3 + 1.1 * rnd()) };
    for (const nme of ['qc', 'qr', 'qi', 'qs', 'qg']) st[nme] = rnd() < 0.5 ? 0 : 3e-3 * rnd();
    const o = setCell(core, 1, st), a = read(core, o);
    core.micro(10);
    const b = read(core, o);
    dw = Math.max(dw, Math.abs(water(b) - water(a))); dh = Math.max(dh, Math.abs(enth(b) - enth(a)));
    for (const k of ['qv', 'qc', 'qr', 'qi', 'qs', 'qg']) if (b[k] < 0) neg++;
    if (!Number.isFinite(b.T)) bad++;
  }
  check('300 random states: water is conserved by one step of every process (largest change ' + dw.toExponential(1) + ' kg/kg)', dw < 1e-12 && bad === 0);
  check('300 random states: the moist enthalpy cp T + Lv qv - Lf (qi + qs + qg) is conserved (largest change ' + dh.toExponential(1) + ' J/kg of 3e5), and no species goes negative', dh < 1e-3 && neg === 0);
}

/* 2. Melting: snow in air 3 C above freezing melts to rain and cools the air, and the heat taken is the heat of melting; no melting below freezing. */
{
  const core = mk(), o = setCell(core, 1, { T: T0 + 3, qv: qsw(T0 + 3, P) * 0.9, qs: 2e-3 }), a = read(core, o);
  run(core, 10, 6);
  const b = read(core, o), dh = Math.abs(enth(b) - enth(a)), dw = Math.abs(water(b) - water(a));
  console.log('     melting: snow ' + f2(1000 * a.qs, 2) + ' to ' + f2(1000 * b.qs, 2) + ' g/kg, rain ' + f2(1000 * b.qr, 2) + ' g/kg, air ' + f2(a.T - T0, 2) + ' to ' + f2(b.T - T0, 2) + ' C above freezing in 60 s');
  check('snow in air at +3 C melts to rain (' + f2(1000 * a.qs, 2) + ' to ' + f2(1000 * b.qs, 2) + ' g/kg of snow, ' + f2(1000 * b.qr, 2) + ' g/kg of rain) and cools the air by ' + f2(a.T - b.T, 2) + ' K, never below freezing',
        b.qs < 0.8 * a.qs && b.qr > 0.5e-3 && b.T < a.T && b.T >= T0 - 1e-9);
  check('the melting conserves water (' + dw.toExponential(0) + ' kg/kg) and the moist enthalpy (' + dh.toExponential(0) + ' J/kg of 3e5): the cooling is the heat of melting', dw < 1e-12 && dh < 1e-3);
  const c = mk(), oc = setCell(c, 1, { T: T0 - 2, qv: qsi(T0 - 2, P), qs: 2e-3 });
  run(c, 10, 6);
  const cb = read(c, oc);
  check('snow at -2 C in ice-saturated air does not melt (rain ' + (cb.qr * 1000).toExponential(1) + ' g/kg)', cb.qr === 0);
}

/* 3. Riming: snow in supercooled cloud water collects it at the rate of the collection integral, and the water freezes (the air warms by Lf/cp per kg). */
{
  const T = T0 - 10, qs0 = 1e-3, qc0 = 1e-3, core = mk(), o = setCell(core, 1, { T, qv: qsw(T, P), qs: qs0, qc: qc0 }), a = read(core, o), b0 = core.base;
  run(core, 10, 1);
  const b = read(core, o), rho = b0.rhoc[K];
  const n0 = 2e6 * Math.exp(0.12 * 10), lam = Math.pow(Math.PI * 100 * n0 / (rho * qs0), 0.25), k = Math.PI / 4 * n0 * 11.72 * Math.sqrt(b0.rhoc[0] / rho) * gam(3.41) / Math.pow(lam, 3.41);
  const expected = qc0 * (1 - Math.exp(-k * 10));
  console.log('     riming: snow 1 g/kg, cloud 1 g/kg at -10 C: collection rate ' + f2(1000 * k, 2) + ' per mille per second; expected ' + f2(1e6 * expected, 1) + ' mg/kg in 10 s, cloud water lost ' + f2(1e6 * (a.qc - b.qc), 1));
  check('snow rimes at the collection-integral rate (cloud water lost ' + f2(1e6 * (a.qc - b.qc), 1) + ' mg/kg against ' + f2(1e6 * expected, 1) + ' by hand; the Bergeron growth takes a little more)', a.qc - b.qc >= 0.97 * expected && a.qc - b.qc < 1.6 * expected && b.qs > a.qs);
  check('the rimed water freezes and warms the air (' + f2(b.T - a.T, 3) + ' K)', b.T > a.T);
}

/* 4. The Bergeron process: in air at water saturation at -15 C, snow grows by deposition and the cloud water gives the vapour up: cloud water falls, snow grows, water is conserved. */
{
  const T = T0 - 15, core = mk(), o = setCell(core, 1, { T, qv: qsw(T, P), qs: 2e-4, qc: 5e-4 }), a = read(core, o);
  run(core, 10, 30);
  const b = read(core, o);
  check('at -15 C snow takes the cloud water (snow ' + f2(1000 * a.qs, 3) + ' to ' + f2(1000 * b.qs, 3) + ' g/kg, cloud ' + f2(1000 * a.qc, 3) + ' to ' + f2(1000 * b.qc, 3) + ' g/kg in 5 minutes), water conserved to ' + Math.abs(water(b) - water(a)).toExponential(0),
        b.qs > 2 * a.qs && b.qc < 0.7 * a.qc && Math.abs(water(b) - water(a)) < 1e-12);
}

/* 4b. Deposition on snow at the rate of diffusion theory (Mason 1971 with the ventilation of Hall and Pruppacher 1976): the rate of the first second against a numerical
   quadrature over the size distribution, then the relaxation of an ice-supersaturated air by a heavy snowfall. */
{
  const T = T0 - 15, qs0 = 1e-4, core = mk(), o = setCell(core, 1, { T, qv: qsi(T, P) * 1.15, qs: qs0 }), a = read(core, o), rho = core.base.rhoc[K], rho0 = core.base.rhoc[0];
  run(core, 1, 1);
  const b = read(core, o), Rv = 461.5, e = esi(T), mu = 1.458e-6 * Math.pow(T, 1.5) / (T + 110.4), nu = mu / rho, Dv = 2.11e-5 * Math.pow(T / 273.15, 1.94) * 101325 / P, Ka = 0.0243 + 7.8e-5 * (T - 273.15), Sc = nu / Dv;
  const Fk = (LS / (Rv * T) - 1) * LS / (Ka * T), Fd = Rv * T / (Dv * e), Gd = 1 / (Fk + Fd);
  const n0 = 2e6 * Math.exp(0.12 * 15), lam = Math.pow(Math.PI * 100 * n0 / (rho * qs0), 0.25), S1 = a.qv / qsi(T, P) - 1;
  let sum = 0; const nD = 40000, dD = 40 / lam / nD;
  for (let n = 0; n < nD; n++) {
    const D = (n + 0.5) * dD, V = 11.72 * Math.pow(D, 0.41) * Math.sqrt(rho0 / rho), fv = 0.78 + 0.31 * Math.cbrt(Sc) * Math.sqrt(V * D / nu);
    sum += n0 * Math.exp(-lam * D) * 2 * Math.PI * D * S1 * Gd * fv * dD;                         // kg/m3/s of vapour taken by the particles of one size class
  }
  const expected = sum / rho, got = b.qs - a.qs;
  console.log('     deposition on 0.1 g/kg of snow at -15 C and ' + f2(100 * S1, 0) + ' % over ice: ' + f2(1e6 * got, 3) + ' mg/kg in 1 s; by quadrature ' + f2(1e6 * expected, 3) + '; time to use up the excess ' + f2((a.qv - qsi(T, P)) / expected / 60, 0) + ' min');
  check('deposition on snow runs at the rate of diffusion theory (' + f2(1e6 * got, 3) + ' mg/kg in 1 s against ' + f2(1e6 * expected, 3) + ' by quadrature of the size distribution)', Math.abs(got / expected - 1) < 0.02);
  const d = mk(), od = setCell(d, 1, { T, qv: qsi(T, P) * 1.15, qs: 1e-3 });
  let under = 0;
  for (let m = 0; m < 240; m++) { run(d, 10, 1); const r = read(d, od); under = Math.min(under, r.qv / qsi(r.T, P) - 1); }
  const e2 = read(d, od), fin = e2.qv / qsi(e2.T, P) - 1;
  check('a heavy snowfall (1 g/kg) brings ice-supersaturated air to ice saturation in 40 minutes (' + f2(100 * fin, 2) + ' % over it) without overshooting (lowest ' + f2(100 * under, 2) + ' %)', Math.abs(fin) < 0.01 && under > -0.01);
}

/* 5. Freezing: rain at -20 C freezes at Bigg's rate (about 0.3 per second for 1 g/m3), rain at -3 C does not; cloud water freezes at -45 C and not at -35 C. */
{
  const rho = mk().base.rhoc[K];
  const f20 = mk(), o20 = setCell(f20, 1, { T: T0 - 20, qv: qsi(T0 - 20, P), qr: 1e-3 / rho }), a20 = read(f20, o20);
  run(f20, 10, 1); const b20 = read(f20, o20);
  const f3 = mk(), o3 = setCell(f3, 1, { T: T0 - 3, qv: qsw(T0 - 3, P), qr: 1e-3 / rho }), b3 = (run(f3, 10, 1), read(f3, o3));
  check('rain at -20 C freezes to graupel in 10 s (' + f2(100 * (1 - b20.qr / a20.qr), 0) + ' % gone, graupel ' + f2(1000 * b20.qg, 2) + ' g/kg) and rain at -3 C mostly stays rain (' + f2(100 * (1 - b3.qr / (1e-3 / rho)), 1) + ' % gone; what goes is the rain the first graupel collects)', b20.qr < 0.1 * a20.qr && b20.qg > 0.8 * a20.qr && b3.qr > 0.9e-3 / rho);
  {                                                                                                      // Bigg's rate by hand: dq/dt = 20 pi^2 B' N0r (rho_w / rho) (exp(A' dT) - 1) / lambda^7, B' = 100 m-3, A' = 0.66 K-1; 0.1 s, no graupel to collect the rain
    const T = T0 - 20, q = 1e-3 / rho, lam = Math.pow(Math.PI * 1000 * 8e6 / (1e-3), 0.25), want = 20 * Math.PI * Math.PI * 100 * 8e6 * (1000 / rho) * (Math.exp(0.66 * 20) - 1) / Math.pow(lam, 7) * 0.1;
    const c = mk({ iceParams: { n0g: 1e-3, rhog: 400 } }), oc = setCell(c, 1, { T, qv: qsi(T, P), qr: q }); run(c, 0.1, 1); const r = read(c, oc), got = q - r.qr;      // (almost) no graupel to collect rain
    check('Bigg freezing runs at the published rate (' + f2(1e6 * got, 2) + ' mg/kg in 0.1 s against ' + f2(1e6 * want, 2) + ' by hand, ' + f2(want / q * 10, 2) + ' per second of the rain)', Math.abs(got / want - 1) < 0.1);
  }
  const h45 = mk(), oh = setCell(h45, 1, { T: T0 - 45, qv: qsi(T0 - 45, P), qc: 1e-3 }), ha = read(h45, oh);
  run(h45, 10, 1); const hb = read(h45, oh);
  const h35 = mk(), o35 = setCell(h35, 1, { T: T0 - 35, qv: qsw(T0 - 35, P), qc: 1e-3 }), h35b = (run(h35, 10, 1), read(h35, o35));
  check('cloud water freezes at -45 C (cloud ' + f2(1000 * hb.qc, 3) + ' g/kg, ice ' + f2(1000 * hb.qi, 3) + ' g/kg, warmer by ' + f2(hb.T - ha.T, 2) + ' K) and survives at -35 C (' + f2(1000 * h35b.qc, 3) + ' g/kg)', hb.qc < 1e-9 && hb.qi > 0.9e-3 && hb.T > ha.T && h35b.qc > 0.5e-3);
}

/* 5b. Melting at the rate of the heat the air gives a falling flake, by quadrature of the size distribution, and never below freezing even in a long step. */
{
  const T = T0 + 3, qs0 = 2e-3, core = mk(), o = setCell(core, 1, { T, qv: qsw(T, P) * 0.9, qs: qs0 }), a = read(core, o), rho = core.base.rhoc[K], rho0 = core.base.rhoc[0];
  run(core, 1, 1);
  const b = read(core, o), mu = 1.458e-6 * Math.pow(T, 1.5) / (T + 110.4), nu = mu / rho, Dv = 2.11e-5 * Math.pow(T / 273.15, 1.94) * 101325 / P, Ka = 0.0243 + 7.8e-5 * (T - 273.15), Sc = nu / Dv;
  const Q = Ka * (T - T0) + LV * Dv * rho * (a.qv - KS.EP2 * 611.2 / (P - 611.2)), lam = Math.pow(Math.PI * 100 * 2e6 / (rho * qs0), 0.25);
  let sum = 0; const nD = 40000, dD = 40 / lam / nD;
  for (let n = 0; n < nD; n++) { const D = (n + 0.5) * dD, V = 11.72 * Math.pow(D, 0.41) * Math.sqrt(rho0 / rho), fv = 0.78 + 0.31 * Math.cbrt(Sc) * Math.sqrt(V * D / nu); sum += 2e6 * Math.exp(-lam * D) * 2 * Math.PI * D * Q / LF * fv * dD; }
  const want = sum / rho, got = a.qs - b.qs;
  check('snow melts at the rate of the heat the air gives it (' + f2(1e6 * got, 2) + ' mg/kg in 1 s against ' + f2(1e6 * want, 2) + ' by quadrature; a flake of ' + f2(1000 / lam, 2) + ' mm mean size melts in about ' + f2(qs0 / want, 0) + ' s)', Math.abs(got / want - 1) < 0.03);
  const c = mk(), oc = setCell(c, 1, { T: T0 + 0.05, qv: qsw(T0 + 0.05, P), qs: qs0 }); run(c, 600, 1); const cb = read(c, oc);
  check('a long step (600 s) in air 0.05 K above freezing melts only what the air can pay for (air ' + f2(cb.T - T0, 3) + ' K, never below freezing)', cb.T >= T0 - 1e-6 && cb.qr > 0);
}

/* 5c. Rain freezing at -45 C becomes graupel (not snow) and warms the air by Lf/cp per kg. */
{
  const rho = mk().base.rhoc[K], T = T0 - 45, c = mk(), o = setCell(c, 1, { T, qv: qsi(T, P), qr: 1e-3 / rho }), a = read(c, o); run(c, 10, 1); const b = read(c, o);
  check('rain at -45 C freezes to graupel (' + f2(1000 * b.qg, 3) + ' of ' + f2(1000 * a.qr, 3) + ' g/kg; snow ' + f2(1000 * b.qs, 4) + ' g/kg) and warms the air by ' + f2(b.T - a.T, 2) + ' K (Lf/cp ' + f2(LF / CP * a.qr, 2) + ')', b.qr < 1e-9 && b.qg > 0.99 * a.qr && b.qs < 1e-9 && Math.abs((b.T - a.T) - LF / CP * a.qr) < 0.05 * LF / CP * a.qr);
}

/* 5d. Snow collects cloud ice at the rate of the collection integral (efficiency exp(0.025 (T - T0))), and heavy snow turns to graupel while light snow does not. */
{
  const T = T0 - 10, qs0 = 1e-3, qi0 = 1e-4, c = mk(), o = setCell(c, 1, { T, qv: qsi(T, P), qs: qs0, qi: qi0 }), rho = c.base.rhoc[K], rho0 = c.base.rhoc[0];
  run(c, 10, 1); const b = read(c, o), n0 = 2e6 * Math.exp(1.2), lam = Math.pow(Math.PI * 100 * n0 / (rho * qs0), 0.25);
  const k = Math.exp(0.025 * (T - T0)) * Math.PI / 4 * n0 * 11.72 * Math.sqrt(rho0 / rho) * gam(3.41) / Math.pow(lam, 3.41), want = qi0 * (1 - Math.exp(-k * 10));
  check('snow collects cloud ice at the integral rate (' + f2(1e6 * (qi0 - b.qi), 2) + ' mg/kg in 10 s against ' + f2(1e6 * want, 2) + ' by hand, efficiency ' + f2(Math.exp(0.025 * (T - T0)), 2) + ')', Math.abs((qi0 - b.qi) / want - 1) < 0.05);
  const h = mk(), oh = setCell(h, 1, { T, qv: qsi(T, P), qs: 2e-3 }), l = mk(), ol = setCell(l, 1, { T, qv: qsi(T, P), qs: 5e-4 });
  run(h, 10, 60); run(l, 10, 60); const hb = read(h, oh), lb = read(l, ol), want2 = 1e-3 * Math.exp(0.09 * (T - T0)) * (2e-3 - 6e-4) * 600;
  check('heavy snow (2 g/kg) turns to graupel (' + f2(1000 * hb.qg, 3) + ' g/kg in 10 minutes, the autoconversion alone ' + f2(1000 * want2, 3) + ', the graupel then collecting the rest of the snow) and light snow (0.5 g/kg) does not (' + (1000 * lb.qg).toExponential(1) + ')', hb.qg > 0.8 * want2 && lb.qg < 1e-8);
}

/* 5e. Graupel collects rain and snow at the rate of the collision integral: the double integral over both size distributions with the fall speed of every size against the closed
   form of the scheme (the three terms of the expanded kernel, each with the fall speeds weighted as the integral weights them). */
{
  const T = T0 - 10, rho = mk().base.rhoc[K], rho0 = mk().base.rhoc[0], q0 = 1e-3, vs = Math.sqrt(rho0 / rho), n0g = 4e6, rg = 400, lg = Math.pow(Math.PI * rg * n0g / (rho * q0), 0.25), vgA = Math.sqrt(4 * G * rg / (3 * 0.6 * rho0)) * vs;
  const exact = (n0y, rhoy, ay, by, E) => {                                                              // kg/m3/s of y collected by graupel
    const ly = Math.pow(Math.PI * rhoy * n0y / (rho * q0), 0.25); let sum = 0; const n = 400, dg = 15 / lg / n, dy = 15 / ly / n;
    for (let i = 0; i < n; i++) { const Dg = (i + 0.5) * dg, Vg = vgA * Math.sqrt(Dg); for (let j = 0; j < n; j++) { const Dy = (j + 0.5) * dy, Vy = ay * vs * Math.pow(Dy, by);
      sum += E * Math.PI / 4 * (Dg + Dy) * (Dg + Dy) * Math.abs(Vg - Vy) * n0g * Math.exp(-lg * Dg) * n0y * Math.exp(-ly * Dy) * (Math.PI / 6) * rhoy * Dy * Dy * Dy * dg * dy; } }
    return sum;
  };
  const cr = mk(), orr = setCell(cr, 1, { T, qv: qsi(T, P), qg: q0, qr: q0 }); run(cr, 0.1, 1); const br = read(cr, orr), gotR = (q0 - br.qr) / 0.1, wantR = exact(8e6, 1000, 842, 0.8, 1) / rho;
  const cs = mk(), os = setCell(cs, 1, { T, qv: qsi(T, P), qg: q0, qs: q0 }); run(cs, 0.1, 1); const bs = read(cs, os), gotS = (q0 - bs.qs) / 0.1, wantS = exact(2e6 * Math.exp(1.2), 100, 11.72, 0.41, Math.exp(-0.9)) / rho;
  console.log('     graupel collecting (1 g/kg each, -10 C): rain ' + f2(1e6 * gotR, 2) + ' mg/kg per s in the scheme, ' + f2(1e6 * wantR, 2) + ' from the double integral; snow ' + f2(1e6 * gotS, 2) + ' against ' + f2(1e6 * wantS, 2));
  check('graupel collects rain and snow at the collision integral (' + f2(gotR / wantR, 2) + ' and ' + f2(gotS / wantS, 2) + ' times the double integral with each size\'s own fall speed)', Math.abs(gotR / wantR - 1) < 0.1 && Math.abs(gotS / wantS - 1) < 0.2 && br.T > T0 - 10);
}

/* 5f. A long step cannot take more vapour than there is: 600 s of heavy snow in air 15 % over ice ends at ice saturation, not below it; the nucleation of ice by Cooper's
   rate, only below -5 C, more the colder it is. */
{
  const T = T0 - 15, c = mk(), o = setCell(c, 1, { T, qv: qsi(T, P) * 1.15, qs: 2e-3 }); run(c, 600, 1); const b = read(c, o);
  check('a 600 s step of heavy snow in supersaturated air stops at ice saturation (' + f2(100 * (b.qv / qsi(b.T, P) - 1), 3) + ' % over it), water conserved', b.qv / qsi(b.T, P) - 1 > -0.002 && b.qv / qsi(b.T, P) - 1 < 0.02);
  const rho = mk().base.rhoc[K], nuc = (Tc) => { const cc = mk(), oo = setCell(cc, 1, { T: T0 - Tc, qv: qsi(T0 - Tc, P) * 1.1 }); run(cc, 0.01, 1); return read(cc, oo).qi; };
  const q20 = nuc(20), q30 = nuc(30), q3 = nuc(3), want20 = 5 * Math.exp(0.304 * 20) * 1e-12 / rho;
  check('ice forms in supersaturated air at -20 C at the rate of Cooper (' + (q20).toExponential(2) + ' kg/kg against ' + want20.toExponential(2) + ' by hand), more at -30 C (' + q30.toExponential(1) + ') and none at -3 C (' + q3.toExponential(1) + ')', Math.abs(q20 / want20 - 1) < 0.15 && q30 > 10 * q20 && q3 === 0);
}

/* 5g. The heat of the ice processes raises the pressure of the cell as the expansion of a gas: the pressure perturbation after freezing is Cc rho (1 + 0.608 qv) times the change of theta. */
{
  const T = T0 - 45, c = mk(), o = setCell(c, 1, { T, qv: qsi(T, P), qc: 1e-3 }), a = read(c, o); c.micro(10);
  const b = read(c, o), pi = c.S.pi[o], want = c.base.Cc[K] * c.base.rhoc[K] * (1 + C.consts.RV1 * a.qv) * (b.T - a.T) / c.base.pibc[K];
  check('freezing 1 g/kg of cloud water raises the pressure perturbation by Cc rho Delta theta (' + pi.toExponential(3) + ' against ' + want.toExponential(3) + ' by hand)', pi > 0 && Math.abs(pi / want - 1) < 0.02);
}

/* 5b. The rain's two settings: its evaporation in subsaturated air scales with iceParams.evap (the knob of a cold pool), and its intercept n0r sets how fast it falls as N0^(-b/4): the
       reflectivity-weighted fall speed of an exponential distribution is proportional to lambda^-b, lambda to N0^0.25, b = 0.8, so a tenth of the intercept is 10^0.2 = 1.585 times faster. */
{
  const T = T0 + 12, q = 1e-3, evapOf = (ev) => { const c = mk({ iceParams: { evap: ev } }), o = setCell(c, 1, { T, qv: 0.5 * qsw(T, P), qr: q }); run(c, 1, 1); return q - read(c, o).qr; };
  const e1 = evapOf(1), eh = evapOf(0.5), e0 = evapOf(0), ed = (() => { const c = mk(), o = setCell(c, 1, { T, qv: 0.5 * qsw(T, P), qr: q }); run(c, 1, 1); return q - read(c, o).qr; })();
  const zf = (n0) => mk({ iceParams: { n0r: n0 } }).zFall.rain(q, K), zr = zf(8e5) / zf(8e6);
  check('rain evaporates in dry air at a rate that iceParams.evap scales (' + f2(1e6 * e1, 2) + ' mg/kg in a second, half of it at 0.5: ' + f2(eh / e1, 3) + ', none at 0, the default the same as 1), and a tenth of the rain intercept makes it fall ' + f2(zr, 3) + ' times as fast (10^0.2 = ' + f2(Math.pow(10, 0.2), 3) + ')',
    e1 > 1e-8 && Math.abs(eh / e1 - 0.5) < 0.01 && e0 === 0 && ed === e1 && Math.abs(zr - Math.pow(10, 0.2)) < 1e-9);
}

/* 6. Fall: with sedimentation on, graupel falls faster than snow and snow faster than cloud ice (and the hail setting faster than the graupel), and the water budget of the columns closes: what is in the air (vapour, cloud,
   rain, ice, snow, hail) plus what reached the ground is what was there at the start (the air is just short of saturation, so what melts reaches the ground as rain). */
{
  const core = mk({ sediment: true, nz: 30 }), b0 = core.base, S = core.S, nz = core.nz, dz = core.dz;
  for (let i = 1; i <= 3; i++) for (let k = 0; k < nz; k++) { const T = b0.thc[k] * b0.pibc[k]; const pk = P0 * Math.pow(b0.pibc[k], CP / RD); S.qv[core.idx(i, 0, k)] = 0.999 * (T > T0 ? qsw(T, pk) : qsi(T, pk)) - b0.qvbc[k]; }
  const k0 = 14; S.qs[core.idx(1, 0, k0)] = 1e-3; S.qg[core.idx(2, 0, k0)] = 1e-3; S.qi[core.idx(3, 0, k0)] = 1e-4;
  const tot = (n, i) => { let w = 0; for (let k = 0; k < nz; k++) w += b0.rhoc[k] * dz * S[n][core.idx(i, 0, k)]; return w; };
  const cen = (n, i) => { let a = 0, w = 0; for (let k = 0; k < nz; k++) { const m = b0.rhoc[k] * S[n][core.idx(i, 0, k)]; a += m * (k + 0.5) * dz; w += m; } return w ? a / w : NaN; };
  const air = () => { let w = 0; for (let i = 1; i <= 3; i++) for (const n of ['qv', 'qc', 'qr', 'qi', 'qs', 'qg']) w += tot(n, i); return w; };     // qv here is the perturbation: the base state is constant in time
  const z0 = (k0 + 0.5) * dz, w0 = air();
  run(core, 10, 12);
  const dzs = z0 - cen('qs', 1), dzg = z0 - cen('qg', 2), dzi = z0 - cen('qi', 3);
  console.log('     in 120 s a snow pulse fell ' + f2(dzs, 0) + ' m (' + f2(dzs / 120, 2) + ' m/s), a graupel pulse ' + f2(dzg, 0) + ' m (' + f2(dzg / 120, 1) + ' m/s), a cloud-ice pulse ' + f2(dzi, 0) + ' m');
  check('graupel falls faster than snow, and snow faster than cloud ice (' + f2(dzg / 120, 1) + ', ' + f2(dzs / 120, 2) + ', ' + f2(dzi / 120, 2) + ' m/s)', dzg > 2 * dzs && dzs > dzi && dzg / 120 > 2 && dzg / 120 < 9 && dzs / 120 > 0.3 && dzs / 120 < 3);
  const vi = 3.29 * Math.pow(b0.rhoc[k0] * 1e-4, 0.16);
  check('cloud ice falls at 3.29 (rho q)^0.16 (' + f2(dzi / 120, 2) + ' m/s against ' + f2(vi, 2) + ' m/s at the start)', Math.abs(dzi / 120 / vi - 1) < 0.2);
  {                                                                                                      // the hail setting of Lin et al.: larger, denser stones, N0 = 4e4 m-4 and 900 kg/m3
    const h = mk({ sediment: true, nz: 30, iceParams: { n0g: 4e4, rhog: 900 } }); for (let k = 0; k < nz; k++) { const T = b0.thc[k] * b0.pibc[k], pk = P0 * Math.pow(b0.pibc[k], CP / RD); h.S.qv[h.idx(1, 0, k)] = 0.999 * (T > T0 ? qsw(T, pk) : qsi(T, pk)) - b0.qvbc[k]; }
    h.S.qg[h.idx(1, 0, k0)] = 1e-3; const ch = () => { let a = 0, w = 0; for (let k = 0; k < nz; k++) { const m = b0.rhoc[k] * h.S.qg[h.idx(1, 0, k)]; a += m * (k + 0.5) * dz; w += m; } return a / w; };
    run(h, 10, 12); const dzh = z0 - ch();
    check('with the hail setting the stones fall at ' + f2(dzh / 120, 1) + ' m/s, faster than the graupel (' + f2(dzg / 120, 1) + ' m/s)', dzh / 120 > 8 && dzh / 120 < 16 && dzh > 1.5 * dzg);
    const h2 = mk({ sediment: true, nz: 30, iceParams: { n0g: 4e4, rhog: 900 } }); for (let k = 0; k < nz; k++) h2.S.qv[h2.idx(1, 0, k)] = h.S.qv[h.idx(1, 0, k)];
    h2.S.qg[h2.idx(1, 0, k0)] = 1e-3; run(h2, 60, 2); let a2 = 0, w2 = 0, neg = 0; for (let k = 0; k < nz; k++) { const q = h2.S.qg[h2.idx(1, 0, k)], m = b0.rhoc[k] * q; a2 += m * (k + 0.5) * dz; w2 += m; if (q < 0) neg++; }
    check('a step of 60 s (a Courant number of 1.4 for the stones) is split into stable sub-steps: the same fall (' + f2((z0 - a2 / w2) / 120, 1) + ' m/s against ' + f2(dzh / 120, 1) + ') and nothing negative', neg === 0 && Math.abs((z0 - a2 / w2) / dzh - 1) < 0.15);
  }
  run(core, 10, 888);                                                                                    // snow falls at about 1.2 m/s: it takes two hours to fall 7 km
  const ground = core.precip[1] + core.precip[2] + core.precip[3], gh = core.precipG[2], put = b0.rhoc[k0] * dz * (1e-3 + 1e-3 + 1e-4), resid = air() - w0 + ground;
  console.log('     after 9000 s: ' + f2(1e3 * ground, 1) + ' g/m2 reached the ground (' + f2(1e3 * gh, 2) + ' as graupel) of the ' + f2(1e3 * put, 1) + ' g/m2 put in; budget residual ' + (resid / put).toExponential(1) + ' of it');
  check('the column water budget closes (air + ground against the start: ' + (Math.abs(resid) / put).toExponential(1) + ' of the water put in), and most of it (' + f2(100 * ground / put, 0) + ' %; the cloud ice melts to cloud water, which stays up) reaches the ground, mostly as rain', Math.abs(resid) < 1e-9 * put && ground > 0.8 * put && ground <= put * (1 + 1e-9));
}

/* 6b. A column colder than freezing all the way down: graupel falls to the ground whole, and what reaches it is counted as graupel (and as water). */
{
  const core = mk({ sediment: true, nz: 30, theta: () => 255, qv: () => 1e-6 }), b0 = core.base, S = core.S, nz = core.nz, dz = core.dz;
  for (let k = 0; k < nz; k++) { const T = b0.thc[k] * b0.pibc[k], pk = P0 * Math.pow(b0.pibc[k], CP / RD); S.qv[core.idx(1, 0, k)] = 0.999 * qsi(T, pk) - b0.qvbc[k]; }
  const k0 = 14; S.qg[core.idx(1, 0, k0)] = 1e-3; const put = b0.rhoc[k0] * dz * 1e-3;
  run(core, 10, 900);
  check('graupel falling through a column below freezing reaches the ground as graupel (' + f2(1e3 * core.precipG[1], 1) + ' g/m2 of ' + f2(1e3 * put, 1) + ', all of it counted as precipitation, none as snow)', Math.abs(core.precipG[1] / put - 1) < 0.02 && Math.abs(core.precip[1] - core.precipG[1]) < 1e-12 && core.precipS[1] === 0);
}

/* 6c. The reflectivity-weighted fall speed (what a Doppler radar adds to the vertical wind: it sees the motion of the particles weighted by their echo, which goes as D^6): the closed form of the core
   against the quadrature of the size distribution for rain, snow, graupel and the hail setting, at a level where the air is thin (the density correction is 1.34), and faster than the mass-weighted speed. */
{
  const core = mk(), k = K, rho = core.base.rhoc[k], rho0 = core.base.rhoc[0], T = T0 - 15, sz = Math.sqrt(rho0 / rho), q = 1e-3;
  const quad = (n0, lam, V, p) => { let num = 0, den = 0; const nD = 60000, dD = 50 / lam / nD; for (let n = 0; n < nD; n++) { const D = (n + 0.5) * dD, w = n0 * Math.exp(-lam * D) * Math.pow(D, p); num += w * V(D); den += w; } return num / den; };
  const o = setCell(core, 1, { T, qv: qsi(T, P) * 0.9, qr: q, qs: q, qg: q }), lam = (n0, rx) => Math.pow(Math.PI * rx * n0 / (rho * q), 0.25), n0s = Math.min(2e8, 2e6 * Math.exp(0.12 * 15));
  const vR = (D) => 842 * Math.pow(D, 0.8) * sz, vS = (D) => 11.72 * Math.pow(D, 0.41) * sz, vG = (r) => { const a = Math.sqrt(4 * G * r / (3 * 0.6 * rho0)); return (D) => a * Math.sqrt(D) * sz; };
  const want = { r: quad(8e6, lam(8e6, 1000), vR, 6), s: quad(n0s, lam(n0s, 100), vS, 6), g: quad(4e6, lam(4e6, 400), vG(400), 6) }, got = { r: core.zFall.rain(q, k), s: core.zFall.snow(q, k, o), g: core.zFall.graupel(q, k) };
  const hail = C.create({ nx: 4, ny: 1, nz: 24, dx: 1000, dz: 500, ice: true, theta: snd.theta, qv: snd.qv, bc: { x: 'periodic' }, iceParams: { n0g: 4e4, rhog: 900 } }), wantH = quad(4e4, lam(4e4, 900), vG(900), 6), gotH = hail.zFall.graupel(q, k);
  const massR = quad(8e6, lam(8e6, 1000), vR, 3);
  const rel = (a, b) => Math.abs(a / b - 1);
  check('the reflectivity-weighted fall speed of 1 g/kg at 5.25 km is ' + f2(got.r, 2) + ' m/s for rain, ' + f2(got.s, 2) + ' for snow, ' + f2(got.g, 2) + ' for graupel and ' + f2(gotH, 2) + ' for hail, against ' + f2(want.r, 2) + ', ' + f2(want.s, 2) + ', ' + f2(want.g, 2) + ' and ' + f2(wantH, 2) + ' by quadrature of the size distribution',
        rel(got.r, want.r) < 0.003 && rel(got.s, want.s) < 0.003 && rel(got.g, want.g) < 0.003 && rel(gotH, wantH) < 0.003);
  check('it is faster than the mass-weighted speed that sediments the water (rain: ' + f2(got.r, 2) + ' against ' + f2(massR, 2) + ' m/s: the large drops carry the echo), hail falls faster than graupel (' + f2(gotH, 2) + ' against ' + f2(got.g, 2) + '), and nothing falls where there is no water (' + core.zFall.rain(0, k) + ')',
        got.r > 1.2 * massR && got.r < 1.7 * massR && gotH > got.g && core.zFall.rain(0, k) === 0 && core.zFall.snow(0, k, o) === 0 && core.zFall.graupel(0, k) === 0);
}

/* 7. A warm bubble in a 2-D slice of the Weisman-Klemp sounding with ice, 40 minutes: ice above the freezing level, an anvil, graupel/hail, rain below, stable, water budget within 0.3 %. */
{
  const nx = 100, nz = 40, core = C.create({ nx, ny: 1, nz, dx: 1000, dz: 500, ice: true, theta: snd.theta, qv: snd.qv, bc: { x: 'periodic' }, visc: { kh: 300, kv: 300 }, damp: { top: { depth: 5000, rate: 0.003 } } });
  const S = core.S, b = core.base;
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) S.th[core.idx(i, 0, k)] = bubble((i + 0.5) * 1000, 0, (k + 0.5) * 500, 50000, 0);
  const water = () => { let w = 0; for (const n of ['qc', 'qr', 'qi', 'qs', 'qg']) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) w += b.rhoc[k] * 500 * 1000 * S[n][core.idx(i, 0, k)]; for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) w += b.rhoc[k] * 500 * 1000 * (b.qvbc[k] + S.qv[core.idx(i, 0, k)]); for (let i = 0; i < nx; i++) w += core.precip[i] * 1000; return w; };
  const w0 = water(), dt = 6; let wpk = 0, qgpk = 0, qipk = 0, qspk = 0, topIce = 0;
  for (let m = 1; m <= 2400 / dt; m++) {
    core.step(dt); const d = core.diag();
    wpk = Math.max(wpk, d.wmax); qgpk = Math.max(qgpk, d.qgmax); qipk = Math.max(qipk, d.qimax); qspk = Math.max(qspk, d.qsmax);
  }
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { const o = core.idx(i, 0, k); if (S.qi[o] + S.qs[o] + S.qg[o] > 1e-5) topIce = Math.max(topIce, (k + 0.5) * 500); }
  const d = core.diag(), rel = (water() - w0) / w0, pmax = Math.max(...core.precip), gmax = Math.max(...core.precipG);
  console.log('     2-D bubble with ice, 40 min: w up to ' + f2(wpk, 1) + ' m/s, cloud ice up to ' + f2(1000 * qipk, 2) + ', snow ' + f2(1000 * qspk, 2) + ', graupel ' + f2(1000 * qgpk, 2) + ' g/kg, ice reaches ' + topIce + ' m, rain at the ground ' + f2(pmax, 2) + ' mm (' + f2(gmax, 2) + ' mm as graupel), water budget ' + rel.toExponential(2) + ', clipped ' + core.stat.clipped.toExponential(1) + ' kg per m (' + lap() + ')');
  check('the bubble with ice is stable, with an updraft of 15 to 70 m/s, graupel above 3 g/kg and ice reaching 9 to 14 km', Number.isFinite(d.wmax) && wpk > 15 && wpk < 70 && qgpk > 3e-3 && topIce >= 9000 && topIce <= 14500);
  check('the ice amounts are reasonable (cloud ice up to 0.3 to 5 g/kg, graupel 3 to 30 g/kg, some snow) and rain reaches the ground (' + f2(pmax, 1) + ' mm)', qipk > 3e-4 && qipk < 5e-3 && qgpk < 3e-2 && qspk > 1e-5 && pmax > 0.1);
  check('the water budget with ice closes to 0.3 % (' + rel.toExponential(1) + '), and little is clipped (' + (core.stat.clipped / (Math.abs(w0) || 1)).toExponential(1) + ' of the water)', Math.abs(rel) < 3e-3 && core.stat.clipped < 1e-3 * w0);
}

console.log(`\n${passed} passed, ${failed} failed (${lap()})`);
process.exit(failed ? 1 : 0);
