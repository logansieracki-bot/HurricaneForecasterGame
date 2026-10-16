/* ==== STORMS ENGINE BEGIN ==== */
/* ------------------------------------------------------------------------------------------------------------------------
 *  Storm engine: tropical waves, tropical and subtropical cyclones, extratropical / post-tropical systems and non-tropical lows.
 *
 *  Pure JavaScript, no DOM, no Date at run time other than UTC arithmetic from the start time it is given. It is inlined into the
 *  simulator pages by tools/build.mjs (the `/*__STORMS__*\/` placeholder) and loaded as-is by the node tests (tests/storms.mjs), so
 *  one file is both the shipped engine and what the tests exercise. A classic script that sets `globalThis.HFStorms` (package.json
 *  is "type": "module", so `export` would break the inlined <script>).
 *
 *  Units: hours since the simulation start (the "hour"), degrees, km, kt (1-minute sustained wind), hPa. Everything the engine
 *  reports as a best-track fix is rounded the way HURDAT2 is (wind to 5 kt, pressure to 1 hPa, position to 0.1 degree) so that its
 *  season statistics are computed in the same definitions as data/generated/atlantic-tc-ref.json.
 *
 *  Randomness: every draw is a pure function hash(seed, system id, hour, stream) -- no hidden RNG state, so the same seed gives the
 *  same storms however time is chunked and a checkpoint is just plain data. Ids are namespaced (waves W<k>, other seeds N<k>,
 *  hand-placed M<j>, lows L<k>) so placing a storm never changes an automatic one.
 *
 *  Physics (see docs/storms-plan.md): motion is a BAM-style blend of the simulator's shallow / medium / deep steering layers plus beta
 *  drift, with a first-order lag and a smooth wobble; intensity is a logistic growth law bounded by an environment-limited
 *  potential (DeMaria-Kaplan empirical MPI of the effective SST, shear, mid-level RH, latitude), with stochastic rapid
 *  intensification, a cold wake, land decay (Kaplan-DeMaria), smooth internal variability; seeds (African easterly waves and the
 *  regional sources) obey the SAME law, so genesis is "seeds filtered by the environment".
 *
 *  Environment interface (what the host supplies; the same shape for the live sim, a shadow environment and the node tests):
 *    env.sst(lat, lon) degC | NaN       env.rh(lat, lon) % | NaN      env.shear(lat, lon) kt | NaN
 *    env.steer(lat, lon, out)           fills out[0..5] = u,v of the shallow, medium, deep layer (kt, +east / +north)
 *    env.slp(lat, lon) hPa              env.isLand(lat, lon) boolean
 *    env.box = {lat0, lat1, lon0, lon1}  the simulated box (systems that leave it end)
 *    env.lows() -> [{lat, lon, p, prom}]  optional: the sea-level-pressure minima right now (for the low tracker)
 * ------------------------------------------------------------------------------------------------------------------------ */
(function (root) {
'use strict';

const VERSION = 1;
const DEG = Math.PI / 180, KM_DEG = 111.195, KT_KMH = 1.852, KT_MPH = 1.150779, MS_KT = 1.943844, HOUR_MS = 3600000;

/* ---- helpers ------------------------------------------------------------------------------------------------------- */
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
function smooth01(x, a, b) { if (!(x === x)) return 0; const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
const round5 = (v) => Math.round(v / 5) * 5;
const r1 = (x) => Math.round(x * 10) / 10;

/* ---- hash-keyed randomness ------------------------------------------------------------------------------------------ */
function mix32(h) { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; }
function hash5(seed, a, b, c, d) {
  let h = mix32((seed | 0) ^ 0x9e3779b9);
  h = mix32(h ^ Math.imul(a | 0, 0x85ebca6b)); h = mix32(h ^ Math.imul(b | 0, 0xc2b2ae35));
  h = mix32(h ^ Math.imul(c | 0, 0x27d4eb2f)); h = mix32(h ^ Math.imul(d | 0, 0x165667b1));
  return h;
}
const rnd = (seed, a, b, c) => (hash5(seed, a, b, c, 0) + 0.5) / 4294967296;                  // uniform in (0, 1)
function rndn(seed, a, b, c) {                                                                  // standard normal
  const u1 = (hash5(seed, a, b, c, 1) + 0.5) / 4294967296, u2 = (hash5(seed, a, b, c, 2) + 0.5) / 4294967296;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
// streams (the `c` argument): one per purpose, so adding a draw somewhere never shifts another
const ST = { VOL: 1, WX: 2, WY: 3, PRES: 4, RIT: 5, RID: 6, RIR: 7, SPAWN: 8, POS: 9, V0: 10, SUBC: 11, ETC: 12, LIFE: 13, WAVE: 14, LOWSEED: 15, PLACE: 16 };
const NS = { W: 1, N: 2, M: 3, L: 4 };                                                          // id namespaces
const idNum = (ns, k) => NS[ns] * 1000000 + k;

/* ---- Saffir-Simpson, ACE, wind-pressure, gusts ---------------------------------------------------------------------- */
const SSHWS = [ // [min kt (on the 5-kt rounded best-track wind), short, long]
  [137, 'C5', 'Category 5 Hurricane'], [113, 'C4', 'Category 4 Hurricane'], [96, 'C3', 'Category 3 Hurricane'], [83, 'C2', 'Category 2 Hurricane'],
  [64, 'C1', 'Category 1 Hurricane'], [34, 'TS', 'Tropical Storm'], [0, 'TD', 'Tropical Depression'],
];
function category(kt) {                                   // by the wind as a best track would hold it (5-kt steps)
  const v = round5(kt);
  for (const c of SSHWS) if (v >= c[0]) return { short: c[1], name: c[2], cat: c[1][0] === 'C' ? +c[1][1] : 0 };
  return { short: 'TD', name: 'Tropical Depression', cat: 0 };
}
const ktToMph = (kt) => round5(kt * KT_MPH);               // advisories round to 5 mph
const aceOf = (kt) => (kt >= 34 ? (kt / 100) * (kt / 100) : 0);
// fitted to the 1991-2020 Atlantic best track (tools/make_tc_ref.py): dp = c V^d exp(e (lat - 25) / 10), dp = 1013 - pressure
const WP = { c: 0.01391, d: 1.7967, e: 0.1005, penv: 1013 };
const pressureFromWind = (kt, lat) => WP.penv - WP.c * Math.pow(Math.max(kt, 1), WP.d) * Math.exp(WP.e * ((Math.abs(lat || 25) - 25) / 10));
const windFromPressure = (hpa, lat) => Math.pow(Math.max(WP.penv - hpa, 0.5) / (WP.c * Math.exp(WP.e * ((Math.abs(lat || 25) - 25) / 10))), 1 / WP.d);
const gustKt = (kt, overLand) => kt * (overLand ? 1.3 : 1.21);   // 120 mph over water gusts to 145 mph (the reference card)
function compass(deg) { return ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]; }

/* ---- WMO Atlantic name lists ---------------------------------------------------------------------------------------- */
// Lists rotate every six years: the list used in year Y is index (Y - 2021) mod 6 (2026 is the 2020 list, 2027 the 2021 list ...).
// These are the lists as they stand for their NEXT use (retired names replaced). The official tables are not reachable from the
// build sandbox: the 2026 list is high-confidence, the others are from memory -- the replacement for Idalia in the 2023 list and any
// 2025 retirements (e.g. Melissa) are NOT verified. Edit here if the WMO tables differ.
const NAME_SETS = [
  ['Ana', 'Bill', 'Claudette', 'Danny', 'Elsa', 'Fred', 'Grace', 'Henri', 'Imani', 'Julian', 'Kate', 'Larry', 'Mindy', 'Nicholas', 'Odette', 'Peter', 'Rose', 'Sam', 'Teresa', 'Victor', 'Wanda'],
  ['Alex', 'Bonnie', 'Colin', 'Danielle', 'Earl', 'Farrah', 'Gaston', 'Hermine', 'Idris', 'Julia', 'Karl', 'Lisa', 'Martin', 'Nicole', 'Owen', 'Paula', 'Richard', 'Shary', 'Tobias', 'Virginie', 'Walter'],
  ['Arlene', 'Bret', 'Cindy', 'Don', 'Emily', 'Franklin', 'Gert', 'Harold', 'Idalia', 'Jose', 'Katia', 'Lee', 'Margot', 'Nigel', 'Ophelia', 'Philippe', 'Rina', 'Sean', 'Tammy', 'Vince', 'Whitney'],
  ['Alberto', 'Brianna', 'Chris', 'Debby', 'Ernesto', 'Francine', 'Gordon', 'Holly', 'Isaac', 'Joyce', 'Kirk', 'Leslie', 'Miguel', 'Nadine', 'Oscar', 'Patty', 'Rafael', 'Sara', 'Tony', 'Valerie', 'William'],
  ['Andrea', 'Barry', 'Chantal', 'Dexter', 'Erin', 'Fernand', 'Gabrielle', 'Humberto', 'Imelda', 'Jerry', 'Karen', 'Lorenzo', 'Melissa', 'Nestor', 'Olga', 'Pablo', 'Rebekah', 'Sebastien', 'Tanya', 'Van', 'Wendy'],
  ['Arthur', 'Bertha', 'Cristobal', 'Dolly', 'Edouard', 'Fay', 'Gonzalo', 'Hanna', 'Isaias', 'Josephine', 'Kyle', 'Leah', 'Marco', 'Nana', 'Omar', 'Paulette', 'Rene', 'Sally', 'Teddy', 'Vicky', 'Wilfred'],
];
const NAME_SUPPLEMENTAL = ['Adria', 'Braylen', 'Caridad', 'Deshawn', 'Emery', 'Foster', 'Gemma', 'Heath', 'Isla', 'Jacobus', 'Kenzie', 'Lucio', 'Makayla', 'Nolan', 'Orlanda', 'Pax', 'Ronin', 'Sophie', 'Tayshaun', 'Viviana', 'Will'];
function nameFor(year, index) {                            // index 0-based: the 22nd storm of a year takes the first supplemental name
  const list = NAME_SETS[(((year - 2021) % 6) + 6) % 6];
  return index < list.length ? list[index] : NAME_SUPPLEMENTAL[(index - list.length) % NAME_SUPPLEMENTAL.length];
}

/* ---- parameters (every tunable number in one place; the calibration scripts and the tests override them) ------------- */
function defaultParams() {
  return {
    // motion
    waveWest: 2.5,                  // kt of extra westward drift of a wave relative to the 850-700 hPa flow
    betaBase: 1.6, betaVMod: 1.6,   // kt toward the north-west: base + extra for a strong storm
    lagBase: 7, lagVMod: 7,         // hours of lag to the steering vector (weak ... strong)
    wobbleSd: 1.1, wobbleTau: 20,   // kt, hours
    exSpeedUp: 1.12,                // post-tropical lows run a little faster than the steering flow
    // tropical environment gates
    sstGate: [25.0, 27.5], rhGate: [38, 62], latGate: [4, 11], shearScale: 15, shearPow: 3, shearVMod: 0.6,
    gCrit: 0.33, matureBoost: 0.30, kUp: 0.022, kDn: 0.016, vEqLo: 0.40, rRelax: 0.02, vFloor: 12,
    etaMin: 0.55, etaLo: 23, etaHi: 28,                   // cool-water efficiency of the empirical MPI
    // subtropical systems (relaxed gates, capped intensity)
    sub: { sstGate: [22.0, 25.0], rhGate: [30, 55], shearScale: 26, gCrit: 0.30, kUp: 0.012, vCap: 62 },
    // rapid intensification
    ri: { haz: 0.0075, dur: [12, 36], rate: [0.9, 2.4], cool: 18, sst: [27.4, 29.0], shear: 9, rh: [50, 68] },
    // noise
    noiseRel: 0.07, noiseTau: 16, pressureSd: 3.5, pressureTau: 24,
    // cold wake
    cwMax: 3.0, cwRef: 5, cwLen: 150,
    // land
    landAlpha: 0.095, landVb: 26.7, landCut: 0.9, landSample: 0.3,
    // genesis / naming
    genV: 25, genHold: 6, namedV: 34,
    // post-tropical
    etSst: 22.5, etRate: 1 / 20, exVBase: 35, exLifeH: 55, exShearGain: 1.0,
    nlLifeH: [36, 96],
    // seeds
    waveRate0: 0.46, waveV0: [12, 20], waveLife: 21 * 24, regional: true,
    regions: [
      { key: 'CAG', th: 'tc', box: [16, 27, -98, -80], perYear: 9, w: [0, 0, 0, 0.3, 0.8, 1.2, 0.9, 0.8, 0.9, 1.3, 0.6, 0.1], v0: [14, 22] },
      { key: 'WCAR', th: 'tc', box: [10, 18, -88, -76], perYear: 5, w: [0, 0, 0, 0.1, 0.5, 1.2, 0.8, 0.6, 0.8, 1.5, 0.8, 0.1], v0: [14, 22] },
      { key: 'SEUS', th: 'mix', box: [26, 36, -82, -68], perYear: 10, w: [0, 0, 0, 0.2, 0.8, 1.2, 0.7, 0.6, 1.1, 1.3, 0.9, 0.2], v0: [16, 24] },
      { key: 'SUBT', th: 'sc', box: [24, 38, -60, -35], perYear: 8, w: [0.1, 0, 0.1, 0.2, 0.4, 0.6, 0.8, 0.9, 1.2, 1.4, 1.0, 0.4], v0: [18, 26] },
    ],
    lowSeedHaz: 0.012,
  };
}
const WAVE_SEASON = [0, 0, 0, 0, 0.15, 0.55, 0.80, 1, 1, 0.6, 0.15, 0];     // relative easterly-wave activity by month (mid-month values)
function seasonalWeight(w, doy) {                                              // linear between mid-month values
  const p = (doy + 0.5) / 30.4375 - 0.5, i = Math.floor(p), t = p - i;
  return w[((i % 12) + 12) % 12] * (1 - t) + w[(((i + 1) % 12) + 12) % 12] * t;
}

/* ---- environment sampling helpers ----------------------------------------------------------------------------------- */
function landFraction(env, lat, lon, d) {
  let n = env.isLand(lat, lon) ? 1 : 0;
  const k = d / Math.max(0.3, Math.cos(lat * DEG));
  n += env.isLand(lat + d, lon) ? 1 : 0; n += env.isLand(lat - d, lon) ? 1 : 0; n += env.isLand(lat, lon + k) ? 1 : 0; n += env.isLand(lat, lon - k) ? 1 : 0;
  return n / 5;
}
function vPot(sstE, par) {                                  // kt: the DeMaria-Kaplan empirical Atlantic MPI (m/s), made an upper envelope cooler than ~25 degC
  const ms = 28.2 + 55.8 * Math.exp(0.1813 * (sstE - 30));
  return MS_KT * ms * (par.etaMin + (1 - par.etaMin) * smooth01(sstE, par.etaLo, par.etaHi));
}

/* ---- a system ---------------------------------------------------------------------------------------------------------
 *  th (thermal / structure class): 'wv' wave or disturbance, 'tc' tropical cyclone (TD/TS/HU), 'sc' subtropical (SD/SS),
 *  'ex' extratropical / post-tropical, 'nl' non-tropical low (also the remnant low of a decayed cyclone).
 *  v is the underlying wind; the reported wind is v * exp(noiseRel * z) with z a smooth OU process (internal variability).      */
function newSystem(o) {
  return {
    id: o.id, num: o.num, origin: o.origin || '', born: o.hour, th: o.th, sub: !!o.sub,
    lat: o.lat, lon: o.lon, v: o.v, vr: o.v, p: 1008, cx: o.cx || 0, cy: o.cy || 0, wx: 0, wy: 0, zv: 0, zp: 0,
    cw: 0, ri: null, riCoolUntil: -1, riTotal: 0, onLand: false, genCount: 0, lowCount: 0, etProg: 0, convCount: 0, nlTill: -1,
    exDeep: 0, remnant: false, alive: true, end: null, endReason: '', depNum: 0, name: '', tdHour: -1, namedHour: -1,
    peakV: 0, peakP: 1020, peakHour: -1, ace: 0, season: 0, fixes: [], st: 'WV', lastShear: 15, lastRh: 50, lastSst: 27, lastLf: 0, kill: false,
  };
}
function statusOf(S) {
  const v = round5(S.vr);
  switch (S.th) {
    case 'wv': return v >= 20 ? 'DB' : 'WV';
    case 'tc': return v >= 64 ? 'HU' : v >= 34 ? 'TS' : 'TD';
    case 'sc': return v >= 34 ? 'SS' : 'SD';
    case 'ex': return 'EX';
    default: return 'LO';
  }
}

/* ---- one hour of physics ----------------------------------------------------------------------------------------------
 *  stepSystem(S, env, h, seed, par): the state at hour h becomes the state at hour h + 1. Pure function of its arguments (plus the
 *  hash-keyed noise), so the live engine, the forecast preview and the tests all run exactly this code.                          */
const BUF = new Float64Array(6);
function stepSystem(S, env, h, seed, par) {
  const lat = S.lat, lon = S.lon, id = S.num;
  // ---- environment at the system
  let sst = env.sst(lat, lon), shear = env.shear(lat, lon), rh = env.rh(lat, lon);
  const lf = landFraction(env, lat, lon, par.landSample), box = env.box;
  if (!(sst === sst) && lf === 0) { S.alive = false; S.endReason = 'left the basin'; S.end = h + 1; return; }
  if (box && (lat < box.lat0 + 0.5 || lat > box.lat1 - 0.5 || lon < box.lon0 + 0.5 || lon > box.lon1 - 0.5)) { S.alive = false; S.endReason = 'left the domain'; S.end = h + 1; return; }
  if (!(sst === sst)) sst = S.lastSst; if (!(shear === shear)) shear = S.lastShear; if (!(rh === rh)) rh = S.lastRh;
  S.lastSst = sst; S.lastShear = shear; S.lastRh = rh; S.lastLf = lf;
  env.steer(lat, lon, BUF);
  const us = BUF[0], vs = BUF[1], um = BUF[2], vm = BUF[3], ud = BUF[4], vd = BUF[5];
  const V = S.v, th = S.th, alat = Math.abs(lat);
  const spd0 = Math.hypot(S.cx, S.cy);

  // ---- cold wake (tropical and subtropical cyclones only)
  let sstE = sst;
  if (th === 'tc' || th === 'sc') {
    const dTarget = lf > 0.5 ? 0 : par.cwMax * Math.pow(V / 100, 2) * par.cwRef / (par.cwRef + spd0);
    const tau = clamp(par.cwLen / (Math.max(spd0, 2) * KT_KMH), 6, 60);
    S.cw += (dTarget - S.cw) / tau;
    sstE = sst - S.cw;
  }

  // ---- motion
  let tx, ty, tau, wobSd = 0;
  if (th === 'wv') {
    tx = 0.55 * us + 0.45 * um - par.waveWest; ty = 0.55 * vs + 0.45 * vm; tau = 5;
  } else if (th === 'tc' || th === 'sc') {
    const a = th === 'sc' ? smooth01(V, 12, 38) : smooth01(V, 22, 52), b = th === 'sc' ? 0.35 : smooth01(V, 58, 110);
    tx = (1 - a) * us + a * ((1 - b) * um + b * ud); ty = (1 - a) * vs + a * ((1 - b) * vm + b * vd);
    const beta = (par.betaBase + par.betaVMod * Math.min(1, V / 110)) * smooth01(alat, 4, 12);
    tx -= beta * 0.7071; ty += beta * 0.7071;
    tau = par.lagBase + par.lagVMod * Math.min(1, V / 110);
    wobSd = par.wobbleSd * (0.6 + 0.4 * Math.min(1, V / 80));
  } else if (th === 'ex') {
    tx = (0.3 * um + 0.7 * ud) * par.exSpeedUp; ty = (0.3 * vm + 0.7 * vd) * par.exSpeedUp; tau = 8; wobSd = 1.5;
  } else {
    tx = 0.5 * um + 0.5 * ud; ty = 0.5 * vm + 0.5 * vd; tau = 8; wobSd = 1.2;
  }
  const al = 1 - Math.exp(-1 / tau);
  S.cx += al * (tx - S.cx); S.cy += al * (ty - S.cy);
  const rho = Math.exp(-1 / par.wobbleTau), sr = Math.sqrt(1 - rho * rho);
  S.wx = rho * S.wx + sr * wobSd * rndn(seed, id, h, ST.WX); S.wy = rho * S.wy + sr * wobSd * rndn(seed, id, h, ST.WY);
  const mx = S.cx + S.wx, my = S.cy + S.wy;
  S.lat = lat + (my * KT_KMH) / KM_DEG;
  S.lon = lon + (mx * KT_KMH) / (KM_DEG * Math.max(0.2, Math.cos(S.lat * DEG)));

  // ---- intensity
  let dV = 0;
  if (th === 'wv' || th === 'tc' || th === 'sc') {
    const sub = th === 'sc' || (th === 'wv' && S.sub);
    const G = sub ? par.sub : par;
    const sEff = shear / (1 + par.shearVMod * smooth01(V, 30, 100));
    const gSh = 1 / (1 + Math.pow(sEff / G.shearScale, par.shearPow));
    const gS = smooth01(sstE, G.sstGate[0], G.sstGate[1]), gR = smooth01(rh, G.rhGate[0], G.rhGate[1]), gL = sub ? 1 : smooth01(alat, par.latGate[0], par.latGate[1]);
    let g = gS * gR * gSh * gL;
    g += (1 - g) * par.matureBoost * smooth01(V, 45, 95) * gL * gS;
    const gc = G.gCrit, ku = G.kUp;
    const kappa = g >= gc ? ku * (g - gc) / (1 - gc) : -par.kDn * (gc - g) / gc;
    const vcap = sub ? Math.min(G.vCap, vPot(sstE, par)) : vPot(sstE, par);
    const veq = vcap * (par.vEqLo + (1 - par.vEqLo) * g);
    if (kappa > 0) dV = V < veq ? kappa * V * (1 - V / veq) : -par.rRelax * (V - veq);
    else dV = kappa * (V - par.vFloor);
    // rapid intensification: episodes that trigger only in a good environment, while there is room to grow
    if (th === 'tc') {
      const R = par.ri;
      if (S.ri && h >= S.ri.t0 + S.ri.dur) { S.ri = null; S.riCoolUntil = h + R.cool; }
      if (S.ri) {
        if (V > 0.93 * vcap || lf > 0.3) { S.ri = null; S.riCoolUntil = h + R.cool; }
        else dV += S.ri.rate * Math.sin(Math.PI * (h - S.ri.t0 + 0.5) / S.ri.dur);
      } else if (h >= S.riCoolUntil && lf < 0.1) {
        const cond = smooth01(sstE, R.sst[0], R.sst[1]) / (1 + Math.pow(shear / R.shear, 3)) * smooth01(rh, R.rh[0], R.rh[1])
          * smooth01(V, 35, 55) * (1 - smooth01(V, 105, 125)) * smooth01(1 - V / Math.max(vcap, 1), 0.12, 0.35) * gL;
        if (cond > 0.01 && rnd(seed, id, h, ST.RIT) < R.haz * cond) {
          S.ri = { t0: h, dur: R.dur[0] + (R.dur[1] - R.dur[0]) * rnd(seed, id, h, ST.RID), rate: R.rate[0] + (R.rate[1] - R.rate[0]) * rnd(seed, id, h, ST.RIR) };
        }
      }
    }
  } else if (th === 'ex' || th === 'nl') {
    // baroclinic lows: relax toward what the local jet / shear supports; a post-tropical cyclone keeps its wind for a while
    // only poleward of the subtropics is there a baroclinic zone to feed on; a decayed tropical remnant just spins down
    const vbc = 10 + (par.exVBase + par.exShearGain * clamp(shear - 20, 0, 45) - 10) * smooth01(alat, 26, 38);
    dV = -0.03 * (V - vbc);
    if (th === 'ex') S.exDeep = Math.min(40, S.exDeep + 0.15 * clamp(shear - 25, 0, 30) / 30);
  }
  if (lf > 0) {                                                                  // Kaplan-DeMaria decay V = Vb + (R V0 - Vb) exp(-alpha t), weighted by how much of the neighbourhood is land
    if (!S.onLand && lf > 0.5) { S.v *= par.landCut; S.onLand = true; }
    S.v = Math.max(1, S.v + (1 - lf) * dV);
    S.v = S.v > par.landVb ? par.landVb + (S.v - par.landVb) * Math.exp(-par.landAlpha * lf) : Math.max(1, S.v - lf * 0.03 * Math.max(0, S.v - 8));
  } else {
    if (S.onLand) S.onLand = false;
    S.v = Math.max(1, S.v + dV);
  }
  const rhoV = Math.exp(-1 / par.noiseTau);
  S.zv = rhoV * S.zv + Math.sqrt(1 - rhoV * rhoV) * rndn(seed, id, h, ST.VOL);
  S.vr = S.v * Math.exp(par.noiseRel * S.zv);
  const rhoP = Math.exp(-1 / par.pressureTau);
  S.zp = rhoP * S.zp + Math.sqrt(1 - rhoP * rhoP) * rndn(seed, id, h, ST.PRES);
  S.p = th === 'wv' ? 1010 - 0.12 * S.vr + 0.8 * S.zp : pressureFromWind(S.vr, S.lat) - (th === 'ex' ? S.exDeep : 0) + par.pressureSd * S.zp;

  // ---- transitions and endings
  const lat2 = S.lat;
  if (th === 'wv') {
    if (S.vr >= par.genV && lf < 0.5 && Math.abs(lat2) >= 6 && sstE > 24) S.genCount++; else S.genCount = 0;
    if (S.genCount >= par.genHold) { S.th = S.sub ? 'sc' : 'tc'; S.tdHour = h + 1; S.genCount = 0; }
    else {
      if (S.v < 9) S.v = 9;                                                      // a wave stays a wave: it fades toward a floor, it does not vanish
      if (lf > 0.7 && h - S.born > 12) S.lowCount++; else S.lowCount = 0;
      if (S.lowCount >= 12) { S.alive = false; S.endReason = 'moved over land'; S.end = h + 1; }
      else if (sst < 22 || (h + 1 - S.born) > par.waveLife) { S.alive = false; S.endReason = 'dissipated'; S.end = h + 1; }
    }
  } else if (th === 'tc') {
    const etNow = sstE < par.etSst || (alat > 35 && shear > 20) || (alat > 28 && shear > 35 && sstE < 26);
    S.etProg = clamp(S.etProg + (etNow && lf < 0.5 ? par.etRate : -par.etRate * 0.5), 0, 1);
    if (S.etProg >= 1) { S.th = 'ex'; S.etProg = 0; S.nlTill = h + 1 + par.exLifeH * (0.4 + 1.2 * rnd(seed, id, h, ST.ETC)); }
    else if (S.vr < 22) { S.lowCount++; if (S.lowCount >= 12) { S.th = 'nl'; S.remnant = true; S.nlTill = h + 1 + par.nlLifeH[0] + (par.nlLifeH[1] - par.nlLifeH[0]) * rnd(seed, id, h, ST.LIFE); } }
    else S.lowCount = 0;
  } else if (th === 'sc') {
    const conv = sstE >= 26 && shear <= 15 && S.vr >= 30 && lf < 0.3;           // a subtropical storm over warm water with little shear becomes tropical
    S.convCount = conv ? S.convCount + 1 : 0;
    if (S.convCount >= 18) { S.th = 'tc'; S.convCount = 0; }
    else if (sstE < par.etSst - 1.5 && shear > 20) { S.th = 'ex'; S.nlTill = h + 1 + par.exLifeH * (0.4 + 1.2 * rnd(seed, id, h, ST.ETC)); }
    else if (S.vr < 20) { S.lowCount++; if (S.lowCount >= 12) { S.th = 'nl'; S.remnant = true; S.nlTill = h + 1 + par.nlLifeH[0] + (par.nlLifeH[1] - par.nlLifeH[0]) * rnd(seed, id, h, ST.LIFE); } }
    else S.lowCount = 0;
  } else if (th === 'ex' || th === 'nl') {
    if (h + 1 >= S.nlTill || S.v < 14) { S.alive = false; S.endReason = th === 'ex' ? 'absorbed' : 'dissipated'; S.end = h + 1; }
  }
  if (S.alive && S.th === 'tc' && lf > 0.5 && S.v < 18) { S.alive = false; S.endReason = 'dissipated over land'; S.end = h + 1; }
  if (S.alive && S.th === 'tc' && S.v < 8) { S.alive = false; S.endReason = 'dissipated'; S.end = h + 1; }
  if (S.alive && S.th === 'sc' && S.v < 8) { S.alive = false; S.endReason = 'dissipated'; S.end = h + 1; }
}

/* ---- best-track fixes -------------------------------------------------------------------------------------------------- */
function makeFix(S, h, aceTotal) {
  const spd = Math.hypot(S.cx, S.cy);
  return {
    h, lat: r1(S.lat), lon: r1(S.lon), v: S.th === 'wv' ? Math.round(S.vr) : round5(S.vr), p: Math.round(S.p), st: statusOf(S), th: S.th,
    dir: Math.round((Math.atan2(S.cx, S.cy) / DEG + 360) % 360), spd: Math.round(spd), sst: r1(S.lastSst), sh: Math.round(S.lastShear),
    ace: Math.round(aceTotal * 100) / 100, land: S.lastLf > 0.5,
  };
}

/* ---- low tracker: nearest-neighbour tracking of the pressure minima the host detects every six hours ------------------- */
function LowTracker() { this.tracks = []; this.next = 1; }
LowTracker.prototype.update = function (hour, dets) {
  const alive = this.tracks.filter((t) => t.alive), used = new Array(dets.length).fill(false);
  const pairs = [];
  for (const t of alive) for (let j = 0; j < dets.length; j++) {
    const pl = t.lat + t.dy, po = t.lon + t.dx, d = Math.hypot(dets[j].lat - pl, (dets[j].lon - po) * Math.cos(dets[j].lat * DEG));
    if (d < 7) pairs.push([d, t, j]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  const matched = new Set();
  for (const [, t, j] of pairs) {
    if (matched.has(t) || used[j]) continue;
    matched.add(t); used[j] = true;
    const d = dets[j]; t.dy = 0.5 * t.dy + 0.5 * (d.lat - t.lat); t.dx = 0.5 * t.dx + 0.5 * (d.lon - t.lon);
    t.lat = d.lat; t.lon = d.lon; t.p = d.p; t.miss = 0; t.maxDepth = Math.max(t.maxDepth, 1010 - d.p);
    t.fixes.push([hour, r1(d.lat), r1(d.lon), Math.round(d.p)]); if (t.fixes.length > 80) t.fixes.shift();
  }
  for (const t of alive) if (!matched.has(t)) { t.miss++; if (t.miss >= 2) { t.alive = false; t.end = hour; } }
  for (let j = 0; j < dets.length; j++) if (!used[j]) {
    const d = dets[j];
    this.tracks.push({ id: 'L' + this.next++, born: hour, lat: d.lat, lon: d.lon, p: d.p, dx: 0, dy: 0, miss: 0, alive: true, maxDepth: 1010 - d.p, fixes: [[hour, r1(d.lat), r1(d.lon), Math.round(d.p)]] });
  }
  if (this.tracks.length > 200) this.tracks = this.tracks.filter((t) => t.alive || hour - t.end < 72);
};

/* ---- seasons ------------------------------------------------------------------------------------------------------------ */
function newSeason(year) { return { year, dep: 0, named: 0, hurr: 0, major: 0, cat5: 0, ace: 0, aceDaily: new Array(366).fill(0), storms: [], namedIdx: 0 }; }
function summarize(S) {
  return { id: S.id, name: S.name, depNum: S.depNum, origin: S.origin, tdHour: S.tdHour, namedHour: S.namedHour, peakV: S.peakV, peakP: S.peakP, peakHour: S.peakHour,
    ace: Math.round(S.ace * 100) / 100, end: S.end, endReason: S.endReason, season: S.season, th: S.th };
}

/* ---- the manager ----------------------------------------------------------------------------------------------------------
 *  create({seed, startMs, params, auto})  startMs = UTC milliseconds of hour 0 (must be a 00Z time).                            */
function Manager(o) {
  this.seed = (o.seed >>> 0) || 1;
  this.startMs = o.startMs;
  this.par = Object.assign(defaultParams(), o.params || {});
  this.hour = o.hour0 || 0;
  this.systems = []; this.byId = {};
  this.n = { W: 0, N: 0, M: 0 };
  this.auto = o.auto !== false; this.autoRate = o.autoRate == null ? 1 : o.autoRate;
  this.sched = { waveT: null, waveK: 0, waveSpawn: false };
  this.lows = new LowTracker();
  const d0 = new Date(this.startMs + this.hour * HOUR_MS);
  this.season = newSeason(d0.getUTCFullYear()); this.prev = null; this.archive = [];
  this.yearEndH = this._hourOfYearStart(this.season.year + 1);
  this.prevEntry = null;
}
Manager.prototype._hourOfYearStart = function (y) { return (Date.UTC(y, 0, 1) - this.startMs) / HOUR_MS; };
Manager.prototype.dateAt = function (h) { return new Date(this.startMs + h * HOUR_MS); };
Manager.prototype.doyAt = function (h) { const d = this.dateAt(h), y = d.getUTCFullYear(); return Math.floor((d.getTime() - Date.UTC(y, 0, 1)) / 86400000); };

Manager.prototype._add = function (S) { S.season = this.season.year; this.systems.push(S); this.byId[S.id] = S; return S; };
Manager.prototype._seedSystem = function (ns, th, lat, lon, v, h, origin, sub) {
  const k = ++this.n[ns];
  return this._add(newSystem({ id: ns + k, num: idNum(ns, k), th, lat, lon, v, hour: h, origin, sub }));
};

/* hand-placed systems: kind 'wave' | 'td' | 'sd' | 'low' */
Manager.prototype.place = function (spec) {
  const h = spec.hour == null ? this.hour : spec.hour;
  const v0 = { wave: 15, td: 30, sd: 28, low: 32 }[spec.kind] || 15, th = { wave: 'wv', td: 'tc', sd: 'sc', low: 'nl' }[spec.kind] || 'wv';
  const S = this._seedSystem('M', th, spec.lat, spec.lon, spec.v || v0, h, 'placed:' + spec.kind, spec.kind === 'sd');
  if (th === 'nl') S.nlTill = h + this.par.nlLifeH[1];
  if (th === 'tc' || th === 'sc') S.genCount = 0;
  return S;
};

/* the place a new hand-placed system would get (for a preview that has exactly the noise the placed storm will have) */
Manager.prototype.pendingPlacement = function (spec) {
  const k = this.n.M + 1, v0 = { wave: 15, td: 30, sd: 28, low: 32 }[spec.kind] || 15, th = { wave: 'wv', td: 'tc', sd: 'sc', low: 'nl' }[spec.kind] || 'wv';
  return newSystem({ id: 'M' + k, num: idNum('M', k), th, lat: spec.lat, lon: spec.lon, v: spec.v || v0, hour: spec.hour == null ? this.hour : spec.hour, origin: 'placed:' + spec.kind, sub: spec.kind === 'sd' });
};

Manager.prototype._waveSchedule = function (from) {                      // next wave time after `from`: a quasi-periodic train whose rate follows the season
  const rate = this.par.waveRate0 * seasonalWeight(WAVE_SEASON, this.doyAt(from)) * this.autoRate;
  if (rate < 0.02) return { t: from + 24, spawn: false };
  return { t: from + 24 * (0.55 + 0.9 * rnd(this.seed, 77, this.sched.waveK, ST.WAVE)) / rate, spawn: true };
};
Manager.prototype._spawn = function (h, env) {
  const par = this.par, seed = this.seed, doy = this.doyAt(h);
  // African easterly waves
  if (this.sched.waveT == null) { const s = this._waveSchedule(h); this.sched.waveT = s.t; this.sched.waveSpawn = s.spawn; }
  while (h >= this.sched.waveT) {
    if (this.sched.waveSpawn) {
      const k = this.sched.waveK++;
      const sw = clamp((doy - 140) / 100, 0, 1), latC = 10.5 + 2.5 * Math.sin(Math.PI * sw);
      const lat = clamp(latC + 2.2 * rndn(seed, 78, k, ST.POS), 8, 18), lon = -17.5 + 0.6 * rndn(seed, 79, k, ST.POS);
      const v0 = par.waveV0[0] + (par.waveV0[1] - par.waveV0[0]) * rnd(seed, 80, k, ST.V0);
      this._seedSystem('W', 'wv', lat, lon, v0, h, 'wave', false);
    }
    const s = this._waveSchedule(this.sched.waveT); this.sched.waveT = s.t; this.sched.waveSpawn = s.spawn;
  }
  // regional sources
  if (par.regional) {
    for (let r = 0; r < par.regions.length; r++) {
      const R = par.regions[r], wsum = R.w.reduce((a, b) => a + b, 0) / 12;
      const haz = R.perYear * this.autoRate / (365.25 * 24) * seasonalWeight(R.w, doy) / Math.max(wsum, 1e-6);
      if (rnd(seed, 100 + r, h, ST.SPAWN) < haz) {
        const lat = R.box[0] + (R.box[1] - R.box[0]) * rnd(seed, 100 + r, h, ST.POS), lon = R.box[2] + (R.box[3] - R.box[2]) * rnd(seed, 100 + r, h + 1000003, ST.POS);
        if (env && env.isLand && env.isLand(lat, lon)) continue;
        const v0 = R.v0[0] + (R.v0[1] - R.v0[0]) * rnd(seed, 100 + r, h, ST.V0);
        const sub = R.th === 'sc' || (R.th === 'mix' && rnd(seed, 100 + r, h, ST.SUBC) < 0.45);
        this._seedSystem('N', 'wv', lat, lon, v0, h, R.key, sub);
      }
    }
  }
};

/* tracked lows and the subtropical storms they can turn into */
Manager.prototype._updateLows = function (h, env) {
  if (!env.lows) return;
  this.lows.update(h, env.lows());
  const par = this.par;
  for (const t of this.lows.tracks) {
    if (!t.alive || h - t.born < 12 || t.lat < 22 || t.lat > 38) continue;
    const sst = env.sst(t.lat, t.lon), sh = env.shear(t.lat, t.lon);
    if (!(sst === sst) || sst < 22.5 || sst > 28.5 || !(sh < 30) || env.isLand(t.lat, t.lon)) continue;
    if (rnd(this.seed, idNum('L', +t.id.slice(1)), h, ST.LOWSEED) < par.lowSeedHaz * this.autoRate) {
      t.alive = false; t.end = h; t.became = true;
      this._seedSystem('N', 'wv', t.lat, t.lon, 24, h, 'low', true);
    }
  }
};

Manager.prototype._record = function (h, env) {                             // six-hourly best-track fixes, naming, counters, ACE
  const season = this.season, par = this.par;
  for (const S of this.systems) {
    if (!S.alive && S.end !== h) continue;
    if (S.th === 'wv' && !S.alive) continue;                                   // a wave that never developed leaves no record
    const st = statusOf(S), isTC = S.th === 'tc' || S.th === 'sc', rv = round5(S.vr);
    const rec = S.season === season.year ? season : (this.prev && this.prev.year === S.season ? this.prev : season);
    if (isTC && S.depNum === 0) { S.depNum = ++rec.dep; if (S.tdHour < 0) S.tdHour = h; rec.storms.push(S.id); }
    if (isTC && S.name === '' && rv >= par.namedV) {
      S.name = nameFor(rec.year, rec.namedIdx++); S.namedHour = h; rec.named++;
    }
    let add = 0;
    if (isTC && rv >= 34) { add = aceOf(rv); S.ace += add; rec.ace += add; rec.aceDaily[clamp(this.doyAt(h), 0, 365)] += add; }
    if (isTC && st === 'HU' && !S.hurr) { S.hurr = true; rec.hurr++; }
    if (isTC && st === 'HU' && rv >= 96 && !S.major) { S.major = true; rec.major++; }
    if (isTC && st === 'HU' && rv >= 137 && !S.c5) { S.c5 = true; rec.cat5++; }
    if (isTC && rv > S.peakV) { S.peakV = rv; S.peakHour = h; S.peakP = Math.round(S.p); }
    if (isTC && Math.round(S.p) < S.peakP && rv >= S.peakV) S.peakP = Math.round(S.p);
    S.fixes.push(makeFix(S, h, S.ace));
    if (S.th === 'wv' && S.fixes.length > 48) S.fixes.shift();
  }
};

Manager.prototype._rollover = function (h) {
  // calendar-year seasons: archive the finished season and clear its paths; a system still alive on Jan 1 finishes under its formation year
  const old = this.season, y = old.year;
  const dead = this.systems.filter((S) => !S.alive && S.season === y && S.depNum > 0);
  const entry = { year: y, open: false, dep: old.dep, named: old.named, hurr: old.hurr, major: old.major, cat5: old.cat5, ace: Math.round(old.ace * 10) / 10,
    aceDaily: old.aceDaily.map((x) => Math.round(x * 100) / 100), storms: dead.map(summarize) };
  const stillAlive = this.systems.some((S) => S.alive && S.season === y && S.th !== 'wv');
  if (stillAlive) { entry.open = true; this.prev = old; this.prevEntry = entry; }
  this.archive.push(entry);
  this.systems = this.systems.filter((S) => S.alive);                          // the finished season's dead paths disappear
  this.byId = {}; for (const S of this.systems) this.byId[S.id] = S;
  this.season = newSeason(y + 1);
  this.yearEndH = this._hourOfYearStart(y + 2);
};
Manager.prototype._finalizePrev = function () {
  const p = this.prev, e = this.prevEntry;
  if (!p || !e) return;
  e.open = false; e.dep = p.dep; e.named = p.named; e.hurr = p.hurr; e.major = p.major; e.cat5 = p.cat5; e.ace = Math.round(p.ace * 10) / 10;
  e.aceDaily = p.aceDaily.map((x) => Math.round(x * 100) / 100);
  this.prev = null; this.prevEntry = null;
};
Manager.prototype._cleanup = function (h) {
  // a wave or low that never became a cyclone leaves no record; a finished cyclone stays on the map until its season is archived
  const cur = this.season.year;
  this.systems = this.systems.filter((S) => {
    let keep = S.alive || (S.depNum > 0 && S.season === cur);
    if (!keep && S.depNum > 0 && this.prevEntry && S.season === this.prev.year) this.prevEntry.storms.push(summarize(S));
    if (!keep) delete this.byId[S.id];
    return keep;
  });
  if (this.prev && !this.systems.some((S) => S.alive && S.season === this.prev.year && S.th !== 'wv')) this._finalizePrev();
};

Manager.prototype.advanceTo = function (target, envSrc) {
  while (this.hour < target) {
    const h = this.hour, env = envSrc && typeof envSrc.at === 'function' ? envSrc.at(h) : envSrc;
    if (h >= this.yearEndH) this._rollover(h);
    if (this.auto) this._spawn(h, env);
    for (const S of this.systems) if (S.alive) stepSystem(S, env, h, this.seed, this.par);
    this.hour = h + 1;
    if (this.hour % 6 === 0) { this._record(this.hour, env); this._updateLows(this.hour, env); }
    if (this.hour % 6 === 0) this._cleanup(this.hour);
  }
};

/* a forecast / preview: the same physics through an environment source, on a copy, with the noise the placed storm would have */
Manager.prototype.forecast = function (spec, envSrc, horizonH) {
  const S = this.pendingPlacement(spec), par = this.par, fixes = [];
  let h = S.born, ace = 0, peak = { v: 0, h, p: 1020 }, named = false, td = S.th === 'tc' || S.th === 'sc';
  fixes.push(makeFix(S, h, 0));
  for (let k = 0; k < horizonH && S.alive; k++) {
    const env = envSrc && typeof envSrc.at === 'function' ? envSrc.at(h) : envSrc;
    stepSystem(S, env, h, this.seed, par); h++;
    if (h % 6 === 0 || !S.alive) {
      const rv = round5(S.vr), isTC = S.th === 'tc' || S.th === 'sc';
      if (isTC && rv >= 34) { ace += aceOf(rv); named = true; }
      if (isTC) td = true;
      if (isTC && rv > peak.v) peak = { v: rv, h, p: Math.round(S.p) };
      fixes.push(makeFix(S, h, ace));
    }
  }
  return { id: S.id, fixes, peak, developed: td, named, ace: Math.round(ace * 100) / 100, alive: S.alive, endReason: S.endReason, endHour: S.end };
};

Manager.prototype.get = function (id) { return this.byId[id] || null; };
Manager.prototype.active = function () { return this.systems.filter((S) => S.alive); };
Manager.prototype.stats = function () { const s = this.season; return { year: s.year, dep: s.dep, named: s.named, hurr: s.hurr, major: s.major, cat5: s.cat5, ace: Math.round(s.ace * 10) / 10 }; };

Manager.prototype.serialize = function () {
  return { v: VERSION, seed: this.seed, startMs: this.startMs, hour: this.hour, par: this.par, n: this.n, auto: this.auto, autoRate: this.autoRate, sched: this.sched,
    season: this.season, prev: this.prev, prevEntry: this.prevEntry, archive: this.archive, yearEndH: this.yearEndH, systems: this.systems, lows: { tracks: this.lows.tracks, next: this.lows.next } };
};
Manager.restore = function (o) {
  const m = new Manager({ seed: o.seed, startMs: o.startMs, params: {}, hour0: o.hour, auto: o.auto, autoRate: o.autoRate });
  m.par = o.par; m.n = o.n; m.sched = o.sched; m.season = o.season; m.prev = o.prev; m.prevEntry = o.prevEntry || null; m.archive = o.archive; m.yearEndH = o.yearEndH;
  m.systems = o.systems; m.byId = {}; for (const S of m.systems) m.byId[S.id] = S;
  m.lows.tracks = o.lows.tracks; m.lows.next = o.lows.next;
  return m;
};

function describe(S, fix) {                                                // what a hover / card shows for a system at a fix (or its live state)
  const f = fix || makeFix(S, 0, S.ace), v = f.v, cat = category(v);
  const over = !!f.land;
  return { id: S.id, name: S.name, status: f.st, cat, windKt: v, windMph: ktToMph(v), gustMph: ktToMph(gustKt(v, over)), pressure: f.p,
    move: f.spd < 1 ? 'nearly stationary' : compass(f.dir) + ' at ' + f.spd + ' kt', sst: f.sst, shear: f.sh };
}

root.HFStorms = {
  VERSION, create: (o) => new Manager(o), restore: (o) => Manager.restore(o), defaultParams,
  category, ktToMph, aceOf, round5, gustKt, compass, pressureFromWind, windFromPressure, WP, vPot, statusOf, describe, nameFor, NAME_SETS, NAME_SUPPLEMENTAL,
  smooth01, rnd, rndn, hash5, idNum, stepSystem, newSystem, makeFix, seasonalWeight, WAVE_SEASON, LowTracker,
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
/* ==== STORMS ENGINE END ==== */
