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
 *  Physics (see docs/storms-plan.md and its revision after the first trial): the climatology-anchored model. When the host supplies maps (prepareMaps)
 *    motion = the real mean drift of the system's kind at its place and time of year + a gain times the anomaly of the host's steering (a ring average of the
 *      layers the system follows) from the host's own mean steering, the anomaly's response lagging (the mean drift is already a lagged velocity), and a smooth wobble;
 *    genesis = a disturbance (African easterly wave, local seed, tracked pressure low) develops at an hourly rate that is the real genesis density divided by
 *      the exposure the host's disturbances provide, times E (how much better humidity, shear and sea temperature are than their own mean, gated by the growth
 *      law's own gate), a seed quality and a large-scale activity factor;
 *    intensity = a logistic growth law bounded by an environment-limited potential (DeMaria-Kaplan empirical MPI of the effective SST, shear, mid-level humidity,
 *      latitude), stochastic rapid intensification, a cold wake, land decay (Kaplan-DeMaria) and smooth internal variability, and a cap on how fast a cyclone loses wind;
 *    the end of a tropical cyclone = two competing random exits whose rates are the real best track's (latitude, sea temperature, shear and the storm's own wind): the
 *      transition to post-tropical (it keeps its wind; a jet's shear holds a weak system up and lets a post-tropical one re-intensify) and dissipation (a remnant low or the
 *      end of the track), plus the end of a weak storm over land; post-tropical cyclones and remnant lows have lognormal lives.
 *  Without maps (the node tests' synthetic environments) the engine falls back to the plain steering model of its first version: motion from the layers with a
 *  fitted drift, seeds from the African coast and from regional boxes that obey the same growth law, so genesis is "seeds filtered by the environment".
 *
 *  Environment interface (what the host supplies; the same shape for the live sim, a shadow environment and the node tests):
 *    env.sst(lat, lon) degC | NaN       env.rh(lat, lon) % | NaN      env.shear(lat, lon) kt | NaN
 *    env.steer(lat, lon, out)           fills out[0..5] = u,v of the shallow, medium, deep layer (kt, +east / +north)
 *    env.slp(lat, lon) hPa              env.isLand(lat, lon) boolean
 *    env.box = {lat0, lat1, lon0, lon1}  the simulated box (systems that leave it end)
 *    env.lows() -> [{lat, lon, p, prom}]  optional: the sea-level-pressure minima right now (for the low tracker)
 *    env.sstRef() degC                  optional: the main development region's mean SST right now (the reference of relative SST)
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
const ST = { VOL: 1, WX: 2, WY: 3, PRES: 4, RIT: 5, RID: 6, RIR: 7, SPAWN: 8, POS: 9, V0: 10, SUBC: 11, ETC: 12, LIFE: 13, WAVE: 14, LOWSEED: 15, PLACE: 16, Q: 17, Q0: 18, GEN: 19, LIFEN: 20, SEEDPOS: 21, ACT: 22, ETL: 23, ETD: 24, ETS: 25 };
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
// The calibrated values: what the lab (tools/storm_mc.mjs: the same simulated weather run through many parameter sets) and tools/storm_opt.mjs (CMA-ES, then structured scans
// of the parameters the optimiser could not separate: tools/storm_opt.mjs describes the loss) settled on against the real Atlantic best track, with the climatology maps of
// tools/storm_fit.mjs; docs/roadmap.md has the method and the held-out numbers. They replace the structure's own defaults below, which are what the tests' synthetic
// environments (no maps) were written against. etHaz, disHaz, decayCap, bc and exDeep are patches: the entries not named here keep the structure's values.
const CALIBRATED = {
  shearK: 4,
  shearPow: 1.488,
  shearVMod: 1.482,
  rhGate: [49.65, 59.75],
  sstGate: [23.73, 26.26],
  sstRelW: 0.6263,
  vpLat: 0.5,
  vpLatB: [14, 36],
  rRelax: 0.025,
  gCrit: 0.07,
  kUp: 0.029,
  kDn: 0.07492,
  vEqLo: 0.09244,
  matureBoost: 0.03298,
  qSd: 0.7,
  tdMargin: 0.12,
  rhSelf: 5,
  ri: {haz: 0.04, rate: [2.343, 5.02], shear: 8.609, rh: [44, 58]},                // rh: on the page's humidity scale (the main development region's mean is 54), not the 50-68 of a storm-centred field
  envB: {rh: 0.12, shear: 0.1421, sst: 0.1715, sstAbs: 0.03626},
  rhLat: -12.39,
  sstLat: 0.2852,
  shLat: 0.9545,
  envTau: 27.99,
  etHaz: {b0: -6.1},
  disHaz: {b0: 2.388, lowShare: 0.3},
  decayCap: [0.35, 0.9],
  bc: {kTc: 0.01055, v: [25, 69.06], exTau: 156.7},
  exDeep: {p: 0.3804},
  act: {seasSd: 0.25, intraSd: 0.2337},                                   // seasSd is not the optimiser's (0.054): the real seasons are over-dispersed (SD of the named count 5.5 against a Poisson 3.7, of the ACE 66), the rest is the climate the page does not carry; 0.4 gave an ACE SD of 80-100 and seasons of 350-490
  devGate: [-0.1249, 0.256],
  etaMin: 0.3009,
  etaLo: 18.01,
  etaHi: 27.7,
};
let useCalibrated = true;                                                      // the node tests switch it off to check the structure of the physics against its own plain defaults
function defaultParams() {
  return useCalibrated ? mergeParams(structureParams(), CALIBRATED) : structureParams();
}
function structureParams() {
  return {
    // motion (the tropical-cyclone law is a least-squares fit to 1949 real six-hourly fixes 2017-2021 against the annulus-mean ERA5 layers the page
    // reproduces, tools/make_tc_motion.py: medium layer for a depression, deep layer for a hurricane, 93 % of the flow plus a drift)
    waveWest: 2.5,                  // kt of extra westward drift of a wave relative to the 850-700 hPa flow
    steerScale: 0.933, deepV: [20, 90],          // share of the flow a tropical cyclone follows; medium -> deep layer between these winds
    driftU: [-0.84, -1.17], driftV: [0.33, 0.88],  // kt: drift relative to the flow = [at 0 kt, extra at 100 kt] (beta drift: toward the north-west, more for a strong storm)
    betaBase: 1.6, betaVMod: 1.6,   // subtropical systems only: kt toward the north-west, base + extra for a strong one
    lagBase: 4, lagVMod: 6,         // hours of lag to the steering vector (weak ... strong)
    wobbleSd: 2.0, wobbleTau: 10,   // kt, hours (the real six-hourly residual of the fit has sd 3.2 kt per component and a lag-6-h autocorrelation of 0.45)
    exSpeedUp: 1.12,                // post-tropical lows run a little faster than the steering flow
    // tropical environment gates
    // the page's shear is a 2-degree point value of the daily-mean 200-850 hPa wind difference (about twice what a storm-centred environment
    // shear sees, vortex removed); shearK divides it for the tropical gates below, whose scales are therefore in storm-centred kt
    sstOffset: 0, shearOffset: 0, rhOffset: 0,    // a uniform shift of the environment the engine sees (what the page's Warming / Wind shear / Moisture sliders do to the fields): the calibration lab asks what a world with a slider moved would do without running its weather
    shearK: 1.9, shearKW: 1,                      // shearKW: extra divisor of the shear a still-undeveloped wave feels (a seed forms in moderate shear a storm would not stand)
    rhLat: 0, sstLat: 0, shLat: 0,                // the growth gates' empirical latitude dependence: the humidity gate moves by rhLat points, the sea-temperature gate by sstLat degrees (a positive value opens it) and the
                                                  // shear scale by a fraction shLat per ten degrees away from 15 N (the page's humidity and shear fall and rise poleward faster than what real storms there need)
    sstSeas: 0,                                   // deg C: the sea-surface-temperature gate opens by up to this much away from the season's peak (a fixed seasonal shape of the threshold)
    sstRef0: 28.7, sstRelW: 0,                    // relative SST: genesis follows the sea's warmth relative to the main development region's mean (env.sstRef(), moving with the season, the year and the Warming slider);
                                                  // sstRelW 1 makes the gate fully relative (the gate sees sst + sstRef0 - sstRef), 0 absolute. The potential intensity stays absolute
    sstGate: [25.0, 27.5], rhGate: [38, 62], latGate: [4, 11], shearScale: 15, shearPow: 3, shearVMod: 0.6,
    gCrit: 0.33, matureBoost: 0.30, kUp: 0.022, kDn: 0.016, vEqLo: 0.40, rRelax: 0.02, vFloor: 12,
    etaMin: 0.55, etaLo: 23, etaHi: 28,                   // cool-water efficiency of the empirical MPI
    // subtropical systems (relaxed gates, capped intensity)
    sub: { sstGate: [22.0, 25.0], rhGate: [30, 55], shearScale: 26, gCrit: 0.30, kUp: 0.012, vCap: 62 },
    // rapid intensification
    ri: { haz: 0.0075, dur: [12, 36], rate: [0.9, 2.4], cool: 18, sst: [27.4, 29.0], shear: 9, rh: [50, 68] },
    // the quality of a seed: how well organised this disturbance is, a persistent random factor on its growth gate (N(0,1), correlation time
    // qTau hours, gate x exp(qSd q) until the system is a storm): given the same environment some waves develop and most do not
    qSd: 0.4, qTau: 48, qFade: [35, 65],
    // the environment a storm responds to: shear and humidity averaged over a cross of points envAvg degrees away (0 = the centre point only) and over
    // the last envTau hours (1 = the instant); SST is not smoothed (it changes slowly), the fix still reports the centre value
    envAvg: 0, envTau: 1,
    // noise
    noiseRel: 0.07, noiseTau: 16, pressureSd: 3.5, pressureTau: 24,
    // cold wake
    cwMax: 3.0, cwRef: 5, cwLen: 150,
    // land
    landAlpha: 0.095, landVb: 26.7, landCut: 0.9, landSample: 0.3,
    landEnd: [30, 12],                             // wind (kt) and hours: a tropical cyclone over land that has stayed this weak this long is finished (a remnant low or the end of the track: the Kaplan-DeMaria decay only goes to 26.7 kt, and a real storm inland is gone in a day or two, 28 rows a season against the 80 the decay alone left)
    // genesis / naming
    genV: 25, genHold: 6, namedV: 34,
    // post-tropical
    // post-tropical transition. A tropical or subtropical cyclone becomes extratropical at a random moment whose rate is the real best track's (tools/make_tc_et.py,
    // data/generated/atlantic-tc-et.json): the logit of the six-hour probability is b0 + lat |lat| + sst SST + shear shear + wind V, a regression on 8,636 six-hourly rows and 184
    // transitions of the 432 named storms of 1991-2020. It is the latitude, the cold water and the strong shear of the westerlies that do it, and a strong storm resists; the cyclone
    // keeps its wind through the transition (hurricanes are about 65 kt at their first post-tropical row, tropical storms 45 kt), it does not spin down first
    etHaz: { b0: -6.444, lat: 0.18744, sst: -0.14069, shear: 0.0461, wind: -0.0273, latMin: 20 },
    // the other way a tropical cyclone ends poleward of the subtropics: it dissipates (a remnant low or the end of the track, half and half), a weak one far more often than a strong one
    // (the same rows, over water: logit = b0 + lat |lat| + sst SST + shear shear + wind V, applied from 26N to full strength at 30N; the intensity law's own decay does the rest)
    disHaz: { b0: 3.422, lat: 0.07049, sst: -0.18551, shear: 0.01057, wind: -0.11618, lat0: 26, lat1: 30, lowShare: 0.49, age: [12, 36] },       // age: hours as a cyclone over which the exit comes in (a storm that has just formed up there almost never dissipates: 0.3 % per six hours in its first day, 2-3 % afterwards)
    // what the baroclinic zone supports: poleward of ~30N a system is held up by (a weak one grows toward) a wind that rises with the shear of the jet, and a post-tropical cyclone
    // relaxes toward it (the real wind falls 5 kt a day, and one in six gains 10 kt or more within two days: an episode of re-intensification, chance exDeep.p in a strong jet)
    bc: { shear: [20, 60], v: [20, 55], lat: [28, 40], kTc: 1 / 48, exTau: 72 },
    exDeep: { p: 0.35, rate: [0.5, 1.5], dur: [12, 36] },
    exLife: [30, 1.1, 4, 200],                   // hours a post-tropical cyclone lasts after its transition: lognormal median, log-sd, minimum, maximum (real: 3 / 12 / 30 / 60 / 102 h at the 10 / 25 / 50 / 75 / 90th percentile)
    nlLife: [24, 1.0, 6, 120], nlV: 20,           // a remnant low: lognormal lifetime (real 6 / 12 / 24 / 57 / 84 h) and the wind it hovers at (real 25 kt)
    // translation of a post-tropical cyclone by age (hours since the transition) relative to the all-ages mean of the extratropical map at its place: the 1,654 six-hourly pairs of the 208 named storms of 1980-2024 that
    // became post-tropical (the first row is 3 kt faster to the east and 7 kt faster to the north than the mean at its latitude, 25 kt in all against 19; from three days on it is 8 kt slower east and 5 north)
    exAge: { t: [0, 6, 12, 18, 24, 33, 48, 69, 90], du: [3.3, 3.8, 3.2, 2.3, 2.0, 0.7, -0.9, -2.5, -8.1], dv: [7.2, 5.0, 3.6, 2.7, 0.9, -1.6, -4.1, -5.7, -5.2] },
    exLandMul: 0.25,                              // a baroclinic low does not spin down over land the way a warm-core storm does
    vpLat: 0, vpLatB: [18, 38],                   // the wind a storm can reach falls poleward by up to this share between these latitudes (the real share of tropical rows of 96 kt or more: 13-16 % at 15-25N, 10 % at 25-30N, 4 % at 30-35N, 1.5 % at 35-40N)
    decayCap: [0.25, 0.6],                        // kt/h: the fastest a tropical cyclone loses wind over water, c0 + c1 (V/60)^2 (real, 24 h north of 33N: -5 kt for 50-80 kt storms, -20 kt for 80 kt and more, -40 kt at the 10th percentile)
    // seeds
    waveRate0: 0.46, waveLat0: 10.5, waveV0: [12, 20], waveLife: 21 * 24, regional: true, regionMul: 1,
    lateW: 1, earlyW: 1,                          // multipliers of every source's activity from mid-October on and before the start of July (the real season is broader than the sea-surface temperature alone makes it)
    regions: [
      { key: 'CAG', th: 'tc', box: [16, 27, -98, -80], perYear: 9, w: [0, 0, 0, 0.3, 0.8, 1.2, 0.9, 0.8, 0.9, 1.3, 0.6, 0.1], v0: [14, 22] },
      { key: 'WCAR', th: 'tc', box: [10, 18, -88, -76], perYear: 5, w: [0, 0, 0, 0.1, 0.5, 1.2, 0.8, 0.6, 0.8, 1.5, 0.8, 0.1], v0: [14, 22] },
      { key: 'SEUS', th: 'mix', box: [26, 36, -82, -68], perYear: 10, w: [0, 0, 0, 0.2, 0.8, 1.2, 0.7, 0.6, 1.1, 1.3, 0.9, 0.2], v0: [16, 24] },
      { key: 'SUBT', th: 'sc', box: [24, 38, -60, -35], perYear: 8, w: [0.1, 0, 0.1, 0.2, 0.4, 0.6, 0.8, 0.9, 1.2, 1.4, 1.0, 0.4], v0: [18, 26] },
    ],
    lowSeedHaz: 0.012,
    // ---- the climatology-anchored model (used when the host supplies maps, see prepareMaps) ----------------------------------------------------------------
    // motion: a system moves with the real mean drift of its kind at its place and time of year (maps.drift, from the best track) plus driftGain times the anomaly of
    // the page's steering (averaged over a ring of steerRing degrees round the centre, vortex-free like the annulus the real fit used) from the page's own mean steering
    // (maps.steerClim): the mean tracks, landfalls and recurvature of the real Atlantic, with the sim's weather deciding which way each storm goes this time
    steerRing: 3.0, driftGain: { wv: 0.75, tc: 0.75, sc: 0.75, ex: 0.75, nl: 0.6 }, vGain: 0.85, strongV: [55, 85],       // vGain: the share of the steering anomaly's north-south part that counts (its east-west part counts fully)
    // genesis: a disturbance (an easterly wave, a local seed, a tracked low) develops at the hourly rate maps.haz times E, how much better or worse the environment is than
    // its own mean at that place and time (maps.env0): exp(rh anomaly [%], - shear anomaly [page kt], relative-SST and absolute-SST anomaly), clipped, times soft physical gates
    envB: { rh: 0.03, shear: 0.05, sst: 0.5, sstAbs: 0.2, clip: 1.0 },
    hazMul: 1,                                    // a multiplier of every development rate (the fitting tools and the lab use it; the shipped value is 1, the maps carry the calibration)
    devGate: [-0.05, 0.15],                       // a disturbance only develops where a depression could live: its growth gate g must exceed gCrit by between these amounts (the rate is zero below the first, full above the second)
    rhSelf: 0, rhSelfV: [30, 65],                 // points of humidity an established storm adds to what the page's field says (a storm moistens its own environment: the page's 2-degree field flips a marginal gate with every dry pocket, and without this a storm in
                                                  // little shear over 28 C water dies of it, 11 % of the simulated named phases ended south of 15 N, real 4.6 %); it comes in between these winds
    tdMargin: 0,                                  // an organising disturbance is only declared a depression while its growth gate (with its own quality) exceeds gCrit by this much: the event pushes the wind to the depression threshold whatever the
                                                  // environment does next, and without this one declared in a place that can not keep it (the humidity it was picked for fades) is a depression for a day and gone (21 % of the numbered ones, real 11 %)
    genGate: { sst: [24.5, 26.5], sstSub: [20.0, 23.5], shear: 28, lat: [8.5, 11.5] }, hazMax: 0.3, devRate: 0.8, devV: 26, devVSub: 36,          // lat: no tropical development close to the equator (the real first-depression latitude has its 5th percentile at 10 N)
    // the large-scale climate the simulated environment does not carry (Atlantic meridional mode, the West African monsoon, the stratosphere, intraseasonal pulses of convection): a random
    // activity factor on every development rate, exp(seasSd z_year + intraSd z(t)) with unit mean: z_year a draw per calendar year, z(t) six sinusoids of 14-60 day periods with random
    // phases (a pure function of the seed and the time). It is what makes some seasons hyperactive and some quiet, and storms cluster in time, as the real ones do
    act: { seasSd: 0.2, intraSd: 0.15, K: 6, T: [14, 60] },
    seedV: [14, 20], lifeN: [48, 144], distV: [14, 22], seedMul: 1, waveLatMax: 32,          // an easterly wave that has not developed by 32N is no longer one (it has become a trough)
  };
}
// a parameter set with some entries replaced: plain objects merge key by key, arrays and numbers replace (the calibration lab and the tests pass partial sets)
function mergeParams(base, patch) {
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  if (!patch) return out;
  for (const k of Object.keys(patch)) {
    const b = out[k], v = patch[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' && !Array.isArray(b) ? mergeParams(b, v) : v;
  }
  return out;
}
const WAVE_SEASON = [0, 0, 0, 0, 0.15, 0.55, 0.80, 1, 1, 0.6, 0.15, 0];     // relative easterly-wave activity by month (mid-month values)
function seasonalWeight(w, doy) {                                              // linear between mid-month values
  const p = (doy + 0.5) / 30.4375 - 0.5, i = Math.floor(p), t = p - i;
  return w[((i % 12) + 12) % 12] * (1 - t) + w[(((i + 1) % 12) + 12) % 12] * t;
}

function seasonShape(par, doy) {                                                // the late- and early-season multipliers on the sources' monthly weights
  if (doy == null || (par.lateW === 1 && par.earlyW === 1)) return 1;
  return (1 + (par.lateW - 1) * smooth01(doy, 258, 292)) * (1 + (par.earlyW - 1) * (1 - smooth01(doy, 150, 190)));
}

/* ---- climatology maps ----------------------------------------------------------------------------------------------------
 *  Fields on one regular grid with one value per node and calendar month, interpolated bilinearly in space and linearly between mid-month values in time. The host (the
 *  page, from data.json; the tests; the fitting tools) hands the engine a plain object, prepareMaps() turns every [12][ny][nx] array in it into one Float32Array:
 *    grid {lon0, lat0, res, nx, ny}          the node (j, i) sits at lat0 + j res, lon0 + i res
 *    drift {weak|strong|sub|ex: {u, v}}      the real mean translation (kt) of a tropical storm / hurricane / subtropical / extratropical system at that place and month
 *    steerClim [6 arrays], ring              the page's own mean steering, ring-averaged over `ring` degrees (steerRing): shallow u, v, medium u, v, deep u, deep v (kt)
 *    haz {T, S}                              hourly rate at which a disturbance there develops into a tropical / a subtropical depression (before E)
 *    spawn                                   local disturbances born in a month, per year and node (like the genesis maps, the twelve months add up to the year): the sources the waves and the pressure lows do not supply
 *    env0 {rh, shear, sst, sstRel}           the page's own mean environment (relative SST = SST minus the main development region's mean)           */
const PREPARED = new WeakMap();
function flat12(a, n) {
  if (a instanceof Float32Array) return a;
  if (typeof a[0] === 'number') return Float32Array.from(a);
  const out = new Float32Array(12 * n), ny = a[0].length, nx = a[0][0].length;
  for (let m = 0; m < 12; m++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) out[m * n + j * nx + i] = a[m][j][i];
  return out;
}
function prepareMaps(raw) {
  if (!raw) return null;
  if (PREPARED.has(raw)) return PREPARED.get(raw);
  const g = raw.grid, n = g.nx * g.ny, M = { g, n, nx: g.nx, ny: g.ny, lon0: g.lon0, lat0: g.lat0, res: g.res, ring: raw.ring != null ? raw.ring : null };
  if (raw.drift) { M.drift = {}; for (const c of Object.keys(raw.drift)) M.drift[c] = { u: flat12(raw.drift[c].u, n), v: flat12(raw.drift[c].v, n) }; }
  if (raw.steerClim) M.steerClim = raw.steerClim.map((a) => flat12(a, n));
  if (raw.haz) M.haz = { T: flat12(raw.haz.T, n), S: flat12(raw.haz.S, n) };
  if (raw.spawn) { M.spawn = flat12(raw.spawn, n); M.spawnCells = []; for (let k = 0; k < n; k++) { let s = 0; for (let m = 0; m < 12; m++) s += M.spawn[m * n + k]; if (s > 0) M.spawnCells.push(k); } }
  if (raw.env0) M.env0 = { rh: flat12(raw.env0.rh, n), shear: flat12(raw.env0.shear, n), sst: flat12(raw.env0.sst, n), sstRel: flat12(raw.env0.sstRel, n) };
  PREPARED.set(raw, M);
  return M;
}
function timeWeights(doyF) {                                                   // the two months a (fractional) day of the year lies between, and the weight of the later one
  const p = (doyF + 0.5) / 30.4375 - 0.5, i = Math.floor(p);
  return { m0: ((i % 12) + 12) % 12, m1: (((i + 1) % 12) + 12) % 12, t: p - i };
}
function bil(a, off, M, lat, lon) {
  let fx = (lon - M.lon0) / M.res, fy = (lat - M.lat0) / M.res;
  fx = fx < 0 ? 0 : fx > M.nx - 1.000001 ? M.nx - 1.000001 : fx; fy = fy < 0 ? 0 : fy > M.ny - 1.000001 ? M.ny - 1.000001 : fy;
  const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = off + j * M.nx + i;
  return (a[k] * (1 - tx) + a[k + 1] * tx) * (1 - ty) + (a[k + M.nx] * (1 - tx) + a[k + M.nx + 1] * tx) * ty;
}
function mapAt(M, arr, tw, lat, lon) { return bil(arr, tw.m0 * M.n, M, lat, lon) * (1 - tw.t) + bil(arr, tw.m1 * M.n, M, lat, lon) * tw.t; }
const DV = new Float64Array(2), CV = new Float64Array(6), DACC = new Float64Array(2);
function driftAt(M, cls, tw, lat, lon, out) { const d = M.drift[cls]; out[0] = mapAt(M, d.u, tw, lat, lon); out[1] = mapAt(M, d.v, tw, lat, lon); }
function addDrift(M, cls, w, tw, lat, lon, acc) { if (w > 0) { driftAt(M, cls, tw, lat, lon, DV); acc[0] += w * DV[0]; acc[1] += w * DV[1]; } }
function climAt(M, tw, lat, lon, out) { for (let k = 0; k < 6; k++) out[k] = mapAt(M, M.steerClim[k], tw, lat, lon); }
/* the steering a cyclone sees: the centre point and four points a ring of R degrees round it (centre 0.36, each 0.16) -- the page's field is a point value that holds the circulation
   of any low a storm sits in, the real fit used the vortex-free annulus mean, and a ring average is what comes closest */
const RB = new Float64Array(6);
function steerRing(env, lat, lon, R, out) {
  env.steer(lat, lon, out);
  if (!(R > 0)) return;
  const k = R / Math.max(0.3, Math.cos(lat * DEG));
  for (let q = 0; q < 6; q++) out[q] *= 0.36;
  env.steer(lat + R, lon, RB); for (let q = 0; q < 6; q++) out[q] += 0.16 * RB[q];
  env.steer(lat - R, lon, RB); for (let q = 0; q < 6; q++) out[q] += 0.16 * RB[q];
  env.steer(lat, lon + k, RB); for (let q = 0; q < 6; q++) out[q] += 0.16 * RB[q];
  env.steer(lat, lon - k, RB); for (let q = 0; q < 6; q++) out[q] += 0.16 * RB[q];
}
/* E: how much better (or worse) than its own mean the environment is for a disturbance to develop, with soft physical gates.
   sstRef is the main development region's mean SST right now (env.sstRef), the reference of "relative" SST.                                     */
function envFactor(par, M, tw, lat, lon, sst, rh, shear, sstRef, sub) {
  const B = par.envB, G = par.genGate;
  let x = 0;
  if (M && M.env0) {
    x = B.rh * (rh - mapAt(M, M.env0.rh, tw, lat, lon)) - B.shear * (shear - mapAt(M, M.env0.shear, tw, lat, lon)) + B.sstAbs * (sst - mapAt(M, M.env0.sst, tw, lat, lon));
    if (sstRef != null) x += B.sst * ((sst - sstRef) - mapAt(M, M.env0.sstRel, tw, lat, lon));
    x = clamp(x, -B.clip, B.clip);
  }
  const gate = (sub ? smooth01(sst, G.sstSub[0], G.sstSub[1]) : smooth01(sst, G.sst[0], G.sst[1]) * smooth01(Math.abs(lat), G.lat[0], G.lat[1]));
  return Math.exp(x) * gate / (1 + Math.pow(shear / par.shearK / G.shear, 4));
}

/* the share of its development rate a disturbance keeps where it is: the growth gate of a freshly formed depression there (the law's own), against par.devGate */
function devGrowth(par, env, sub, lat, sst, rh, shear, doy, dSst) {
  const G = sub ? par.sub : par, alat = Math.abs(lat), latD = sub ? 0 : (alat - 15) / 10;
  const sShift = (!sub && par.sstSeas && doy != null ? par.sstSeas * (1 - Math.cos(2 * Math.PI * (doy - 255) / 365)) / 2 : 0) + par.sstLat * latD;
  const sstG = par.sstRelW ? sst + par.sstRelW * (par.sstRef0 - (env.sstRef ? env.sstRef() + dSst : par.sstRef0)) : sst;
  return growthG(par, G, sub, par.devV, sstG, rh, shear / par.shearK, alat, sShift, latD);
}
function devGateAt(par, env, sub, lat, sst, rh, shear, doy, dSst) {
  const G = sub ? par.sub : par;
  return smooth01(devGrowth(par, env, sub, lat, sst, rh, shear, doy, dSst), G.gCrit + par.devGate[0], G.gCrit + par.devGate[1]);
}

/* the activity factor (see par.act): 1 on average, a pure function of the seed, the calendar year and the hour */
function activityFactor(par, seed, year, h) {
  const A = par.act; if (!A || (A.seasSd === 0 && A.intraSd === 0)) return 1;
  let zt = 0; const d = h / 24;
  if (A.intraSd) { for (let k = 0; k < A.K; k++) { const T = A.T[0] * Math.pow(A.T[1] / A.T[0], A.K > 1 ? k / (A.K - 1) : 0); zt += Math.cos(2 * Math.PI * d / T + 2 * Math.PI * rnd(seed, 7002, k, ST.ACT)); } zt *= Math.sqrt(2 / A.K); }
  return Math.exp(A.seasSd * rndn(seed, 7001, year, ST.ACT) + A.intraSd * zt - 0.5 * (A.seasSd * A.seasSd + A.intraSd * A.intraSd));
}

/* ---- the calibration lab's accumulators (dev only): where disturbances were, how favourable it was for them, where they developed, by class, month and node ------------------- */
const DIAG_KEYS = ['xT.W', 'xT.N', 'xT.L', 'xS.N', 'xS.L', 'h.W', 'h.N', 'h.L', 'gT.W', 'gT.N', 'gT.L', 'gT.M', 'gS.N', 'gS.L', 'spawn.N',
  'ax.weak', 'ay.weak', 'n.weak', 'ax.strong', 'ay.strong', 'n.strong', 'ax.sub', 'ay.sub', 'n.sub', 'ax.ex', 'ay.ex', 'n.ex'];       // the last twelve: the steering-anomaly part of the motion by class (sum x, sum y, hours), per month and node
function newDiag(M) { const d = {}; for (const k of DIAG_KEYS) d[k] = new Float64Array(12 * M.n); return d; }
function diagCell(ctx, tw, lat, lon) {
  const M = ctx.maps; let i = Math.round((lon - M.lon0) / M.res), j = Math.round((lat - M.lat0) / M.res);
  i = i < 0 ? 0 : i > M.nx - 1 ? M.nx - 1 : i; j = j < 0 ? 0 : j > M.ny - 1 ? M.ny - 1 : j;
  return (tw.t < 0.5 ? tw.m0 : tw.m1) * M.n + j * M.nx + i;
}
function diagExposure(ctx, kind, tw, lat, lon, eT, eS, dt) {                   // dt hours of exposure (1 for a system's hour, 6 for a low's six-hourly look)
  const d = ctx.diag; if (!d['h.' + kind]) return;
  const k = diagCell(ctx, tw, lat, lon), w = dt || 1;
  d['xT.' + kind][k] += eT * w; d['h.' + kind][k] += w;
  if (eS > 0 && d['xS.' + kind]) d['xS.' + kind][k] += eS * w;
}
function diagMotion(ctx, cls, tw, lat, lon, ax, ay) {                         // the anomaly part of one hour of motion (kt): where the page's weather speeds a storm up or slows it down on average
  const d = ctx.diag, k = diagCell(ctx, tw, lat, lon); d['ax.' + cls][k] += ax; d['ay.' + cls][k] += ay; d['n.' + cls][k] += 1;
}
function diagGenesis(ctx, kind, sub, tw, lat, lon) {
  const d = ctx.diag, a = d['g' + (sub ? 'S' : 'T') + '.' + kind]; if (!a) return;
  a[diagCell(ctx, tw, lat, lon)] += 1;
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

/* the growth gate of the intensity law: how well the environment supports a system of wind V, 0..1 (before the seed's own quality and the mature-storm boost). The same function the
   law uses every hour and the genesis rule uses to refuse a depression an environment it could not live in. shT is the storm-centred shear (page shear / shearK). */
function growthG(par, G, sub, V, sstG, rh, shT, alat, sShift, latD) {
  const sEff = shT / (1 + par.shearVMod * smooth01(V, 30, 100));
  const gSh = 1 / (1 + Math.pow(sEff / (G.shearScale * Math.max(0.15, 1 + par.shLat * latD)), par.shearPow));          // (the floor: a storm that drifts south of 4 N would otherwise get a negative scale and a NaN)
  const gS = smooth01(sstG, G.sstGate[0] - sShift, G.sstGate[1] - sShift), gR = smooth01(rh, G.rhGate[0] + par.rhLat * latD, G.rhGate[1] + par.rhLat * latD), gL = sub ? 1 : smooth01(alat, par.latGate[0], par.latGate[1]);
  return gS * gR * gSh * gL;
}

/* ---- a system ---------------------------------------------------------------------------------------------------------
 *  th (thermal / structure class): 'wv' wave or disturbance, 'tc' tropical cyclone (TD/TS/HU), 'sc' subtropical (SD/SS),
 *  'ex' extratropical / post-tropical, 'nl' non-tropical low (also the remnant low of a decayed cyclone).
 *  v is the underlying wind; the reported wind is v * exp(noiseRel * z) with z a smooth OU process (internal variability).      */
function newSystem(o) {
  return {
    id: o.id, num: o.num, origin: o.origin || '', born: o.hour, th: o.th, sub: !!o.sub, dev: -1, life: o.life || 0, kind: o.kind || '',
    lat: o.lat, lon: o.lon, v: o.v, vr: o.v, p: 1008, cx: o.cx || 0, cy: o.cy || 0, wx: 0, wy: 0, zv: 0, zp: 0,
    q: o.q || 0, shSm: null, rhSm: null, cw: 0, ri: null, riCoolUntil: -1, riTotal: 0, onLand: false, genCount: 0, lowCount: 0, landLow: 0, convCount: 0, nlTill: -1,
    exDeep: 0, exEp: null, exLift: 0, ux: 0, uy: 0, etAt: -1, remnant: false, alive: true, end: null, endReason: '', depNum: 0, name: '', tdHour: -1, namedHour: -1,
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
/* the wind the baroclinic zone supports at a place: nothing in the tropics, rising with the shear of the jet poleward of ~30N */
function baroclinicV(par, shear, alat) {
  const B = par.bc;
  return smooth01(alat, B.lat[0], B.lat[1]) * (B.v[0] + (B.v[1] - B.v[0]) * smooth01(shear, B.shear[0], B.shear[1]));
}
/* the probability that a tropical or subtropical cyclone at |lat| over sea of temperature sst, in page shear `shear` and with wind v, becomes post-tropical within six hours */
function etHazard6(par, alat, sst, shear, v) {
  const E = par.etHaz;
  return alat < E.latMin ? 0 : 1 / (1 + Math.exp(-(E.b0 + E.lat * alat + E.sst * sst + E.shear * shear + E.wind * v)));
}
/* the probability of the other exit, dissipation over water (a remnant low, or the track simply ends), within six hours */
function disHazard6(par, alat, sst, shear, v, age) {
  const D = par.disHaz, f = smooth01(alat, D.lat0, D.lat1) * smooth01(age == null ? 1e9 : age, D.age[0], D.age[1]);
  return f <= 0 ? 0 : f / (1 + Math.exp(-(D.b0 + D.lat * alat + D.sst * sst + D.shear * shear + D.wind * v)));
}
/* piecewise-linear table lookup, held at the ends */
function tableAt(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x < xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
  return ys[ys.length - 1];
}
/* lifetimes are lognormal (median, log-sd, minimum, maximum); the draw is a pure function of the system and the hour */
function lifetimeH(L, seed, id, h, stream) { return clamp(L[0] * Math.exp(L[1] * rndn(seed, id, h, stream)), L[2], L[3]); }
/* a tropical or subtropical cyclone becomes post-tropical at the end of hour h: it keeps its wind and position, and gets the life (and, in a strong jet, the chance of a
   re-intensification episode) of an extratropical cyclone */
function becomePostTropical(S, h, seed, par, shear) {
  S.th = 'ex'; S.etAt = h + 1; S.lowCount = 0;
  S.nlTill = h + 1 + lifetimeH(par.exLife, seed, S.num, h, ST.ETL);
  const D = par.exDeep;
  if (rnd(seed, S.num, h, ST.ETD) < D.p * smooth01(shear, 20, 50)) {
    const dur = D.dur[0] + (D.dur[1] - D.dur[0]) * rnd(seed, S.num, h, ST.ETS), rate = D.rate[0] + (D.rate[1] - D.rate[0]) * rnd(seed, S.num, h + 7919, ST.ETS);
    S.exEp = { t0: h + 1 + Math.floor(6 * rnd(seed, S.num, h + 104729, ST.ETS)), dur, rate };
    S.nlTill = Math.max(S.nlTill, S.exEp.t0 + dur + 12);                    // a cyclone that re-intensifies is not absorbed in the middle of it
  }
}
function becomeRemnantLow(S, h, seed, par) { S.th = 'nl'; S.remnant = true; S.nlTill = h + 1 + lifetimeH(par.nlLife, seed, S.num, h, ST.LIFE); }
function stepSystem(S, env, h, seed, par, doy, ctx) {
  const lat = S.lat, lon = S.lon, id = S.num;
  const M = ctx && ctx.maps && ctx.tw ? ctx.maps : null, tw = M ? ctx.tw : null;                       // the climatology-anchored model, when the host supplied maps
  // ---- environment at the system
  const dSst = par.sstOffset, dShear = par.shearOffset, dRh = par.rhOffset;
  let sst = env.sst(lat, lon) + dSst, shear = env.shear(lat, lon) + dShear, rh = env.rh(lat, lon) + dRh;
  const lf = landFraction(env, lat, lon, par.landSample), box = env.box;
  if (!(sst === sst) && lf === 0) { S.alive = false; S.endReason = 'left the basin'; S.end = h + 1; return; }
  if (box && (lat < box.lat0 + 0.5 || lat > box.lat1 - 0.5 || lon < box.lon0 + 0.5 || lon > box.lon1 - 0.5)) { S.alive = false; S.endReason = 'left the domain'; S.end = h + 1; return; }
  if (!(sst === sst)) sst = S.lastSst; if (!(shear === shear)) shear = S.lastShear; if (!(rh === rh)) rh = S.lastRh;
  S.lastSst = sst; S.lastShear = shear; S.lastRh = rh; S.lastLf = lf;                // what the fix reports: the value at the centre, the number the map shows
  // what a storm RESPONDS to is its neighbourhood and the last day or so, not the instant's value at one 2-degree point of a daily-mean field
  if (par.envAvg > 0) {
    const D = par.envAvg, k = D / Math.max(0.3, Math.cos(lat * DEG));
    const avg = (f, c, off) => { const a = f(lat + D, lon) + off, b = f(lat - D, lon) + off, e = f(lat, lon + k) + off, d = f(lat, lon - k) + off; return a === a && b === b && e === e && d === d ? 0.4 * c + 0.15 * (a + b + e + d) : c; };
    shear = avg(env.shear, shear, dShear); rh = avg(env.rh, rh, dRh);
  }
  if (par.envTau > 1) {
    const aE = 1 - Math.exp(-1 / par.envTau);
    S.shSm = S.shSm == null ? shear : S.shSm + aE * (shear - S.shSm); S.rhSm = S.rhSm == null ? rh : S.rhSm + aE * (rh - S.rhSm);
    shear = S.shSm; rh = S.rhSm;
  }
  if (M) steerRing(env, lat, lon, M.ring != null ? M.ring : par.steerRing, BUF); else env.steer(lat, lon, BUF);          // the ring the maps' mean steering was measured with, so that anomaly and mean are made the same way
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
  let tx, ty, tau, wobSd = 0, maps = false;
  if (M && M.drift && M.steerClim) {
    maps = true;
    // the real mean drift of this kind of system here and now, plus the anomaly of the steering (the layers it follows) from the page's own mean steering
    let ws = 0, wm = 0, wd = 0, gain;
    DACC[0] = 0; DACC[1] = 0;
    if (th === 'wv') { ws = 0.55; wm = 0.45; gain = par.driftGain.wv; addDrift(M, 'weak', 1, tw, lat, lon, DACC); tau = 5; }
    else if (th === 'tc') {
      const a = smooth01(V, par.deepV[0], par.deepV[1]), sw = smooth01(V, par.strongV[0], par.strongV[1]);
      wm = 1 - a; wd = a; gain = par.driftGain.tc; addDrift(M, 'weak', 1 - sw, tw, lat, lon, DACC); addDrift(M, 'strong', sw, tw, lat, lon, DACC);
      tau = par.lagBase + par.lagVMod * Math.min(1, V / 110); wobSd = par.wobbleSd * (0.6 + 0.4 * Math.min(1, V / 80));
    } else if (th === 'sc') {
      const a = smooth01(V, 12, 38);
      ws = 1 - a; wm = a * 0.65; wd = a * 0.35; gain = par.driftGain.sc; addDrift(M, 'sub', 1, tw, lat, lon, DACC);
      tau = par.lagBase + par.lagVMod * Math.min(1, V / 110); wobSd = par.wobbleSd * (0.6 + 0.4 * Math.min(1, V / 80));
    } else if (th === 'ex') {
      wm = 0.3; wd = 0.7; gain = par.driftGain.ex; addDrift(M, 'ex', 1, tw, lat, lon, DACC); tau = 8; wobSd = 1.5;
      if (S.etAt >= 0) { const X = par.exAge, a = h - S.etAt; DACC[0] += tableAt(X.t, X.du, a); DACC[1] += tableAt(X.t, X.dv, a); }       // the map is the mean over all ages of post-tropical cyclones: a fresh one runs faster than that, an old one slower
    } else {
      const e = smooth01(alat, 25, 35);
      wm = 0.5; wd = 0.5; gain = par.driftGain.nl; addDrift(M, 'weak', 1 - e, tw, lat, lon, DACC); addDrift(M, 'ex', e, tw, lat, lon, DACC); tau = 8; wobSd = 1.2;
    }
    climAt(M, tw, lat, lon, CV);
    const anx = gain * (ws * (us - CV[0]) + wm * (um - CV[2]) + wd * (ud - CV[4])), any = gain * par.vGain * (ws * (vs - CV[1]) + wm * (vm - CV[3]) + wd * (vd - CV[5]));
    tx = DACC[0] + anx; ty = DACC[1] + any;
    if (ctx.diag && th !== 'wv' && th !== 'nl') diagMotion(ctx, th === 'tc' ? (V >= 64 ? 'strong' : 'weak') : th === 'sc' ? 'sub' : 'ex', tw, lat, lon, anx, any);
  } else if (th === 'wv') {
    tx = 0.55 * us + 0.45 * um - par.waveWest; ty = 0.55 * vs + 0.45 * vm; tau = 5;
  } else if (th === 'tc') {
    const a = smooth01(V, par.deepV[0], par.deepV[1]), vi = Math.min(1, V / 100), ramp = smooth01(alat, 4, 12);
    tx = par.steerScale * ((1 - a) * um + a * ud) + (par.driftU[0] + par.driftU[1] * vi) * ramp;
    ty = par.steerScale * ((1 - a) * vm + a * vd) + (par.driftV[0] + par.driftV[1] * vi) * ramp;
    tau = par.lagBase + par.lagVMod * Math.min(1, V / 110);
    wobSd = par.wobbleSd * (0.6 + 0.4 * Math.min(1, V / 80));
  } else if (th === 'sc') {
    const a = smooth01(V, 12, 38), b = 0.35;
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
  if (maps) {                                                                    // the real mean drift is already a lagged velocity (a storm that speeds up as it goes poleward is slower than the flow it is going into, in the data too): only the response to the weather's anomaly lags
    S.ux = (S.ux || 0) + al * ((tx - DACC[0]) - (S.ux || 0)); S.uy = (S.uy || 0) + al * ((ty - DACC[1]) - (S.uy || 0));
    S.cx = DACC[0] + S.ux; S.cy = DACC[1] + S.uy;
  } else { S.cx += al * (tx - S.cx); S.cy += al * (ty - S.cy); }
  const rho = Math.exp(-1 / par.wobbleTau), sr = Math.sqrt(1 - rho * rho);
  S.wx = rho * S.wx + sr * wobSd * rndn(seed, id, h, ST.WX); S.wy = rho * S.wy + sr * wobSd * rndn(seed, id, h, ST.WY);
  const mx = S.cx + S.wx, my = S.cy + S.wy;
  S.lat = lat + (my * KT_KMH) / KM_DEG;
  S.lon = lon + (mx * KT_KMH) / (KM_DEG * Math.max(0.2, Math.cos(S.lat * DEG)));

  // ---- intensity
  let dV = 0;
  if (th === 'wv' && M && M.haz) {
    // a disturbance (wave, local seed, low) is not yet a cyclone: its wind only reflects how favourable the place is, and development is a random event whose rate is the
    // map rate (what the real Atlantic does there at this time of year) times E (how much better the environment is than its own mean) times the seed's own quality
    const rq = Math.exp(-1 / par.qTau); S.q = rq * S.q + Math.sqrt(1 - rq * rq) * rndn(seed, id, h, ST.Q);
    const Q = Math.exp(par.qSd * S.q - 0.5 * par.qSd * par.qSd), sstRef = env.sstRef ? env.sstRef() + dSst : null;
    const water = lf < 0.3 && alat >= 4;
    const act = ctx.act || 1;
    const eT = water ? envFactor(par, M, tw, lat, lon, sst, rh, shear, sstRef, false) * devGateAt(par, env, false, lat, sst, rh, shear, doy, dSst) * Q * act : 0;
    const eS = water && S.kind !== 'W' && S.kind !== 'M' ? envFactor(par, M, tw, lat, lon, sst, rh, shear, sstRef, true) * devGateAt(par, env, true, lat, sst, rh, shear, doy, dSst) * Q * act : 0;
    S.eq = eT;
    if (S.dev < 0) {
      const hT = Math.min(par.hazMax, par.hazMul * mapAt(M, M.haz.T, tw, lat, lon) * eT), hS = eS > 0 ? Math.min(par.hazMax, par.hazMul * mapAt(M, M.haz.S, tw, lat, lon) * eS) : 0;
      if (ctx.diag) diagExposure(ctx, S.kind, tw, lat, lon, eT, eS);
      const u = rnd(seed, id, h, ST.GEN);
      if (u < hT + hS) {
        S.dev = h + 1; S.sub = u >= hT;
        if (ctx.diag) diagGenesis(ctx, S.kind, S.sub, tw, lat, lon);
      }
    } else if (h - S.dev > 48) S.dev = -1;                                                  // it never organised: back to being a disturbance
    const devV = S.sub ? par.devVSub : par.devV;                                          // a subtropical system is only classified once it has gale-force wind (four in five real ones are storms from their first row)
    S.sust = true;
    if (S.dev >= 0 && par.tdMargin > 0) S.sust = Math.min(1, devGrowth(par, env, S.sub, lat, sst, rh, shear, doy, dSst) * Math.exp(par.qSd * S.q)) >= (S.sub ? par.sub : par).gCrit + par.tdMargin;
    dV = S.dev >= 0 && S.sust ? (V < devV ? par.devRate : 0.3 * (devV - V)) : 0.08 * (par.distV[0] + (par.distV[1] - par.distV[0]) * smooth01(eT, 0.3, 2.0) - V);
  } else if (th === 'wv' || th === 'tc' || th === 'sc') {
    const sub = th === 'sc' || (th === 'wv' && S.sub);
    const G = sub ? par.sub : par;
    const shT = shear / (th === 'wv' ? par.shearK * par.shearKW : par.shearK);   // storm-centred units (see shearK)
    const latD = sub ? 0 : (alat - 15) / 10;                                   // the gates' empirical latitude dependence (0 at 15 degrees; see rhLat, sstLat, shLat)
    const sShift = (!sub && par.sstSeas && doy != null ? par.sstSeas * (1 - Math.cos(2 * Math.PI * (doy - 255) / 365)) / 2 : 0) + par.sstLat * latD;
    const sstG = par.sstRelW ? sstE + par.sstRelW * (par.sstRef0 - (env.sstRef ? env.sstRef() + dSst : par.sstRef0)) : sstE;      // the sea the genesis gate sees (see sstRelW)
    const gL = sub ? 1 : smooth01(alat, par.latGate[0], par.latGate[1]), gS = smooth01(sstG, G.sstGate[0] - sShift, G.sstGate[1] - sShift);
    let g = growthG(par, G, sub, V, sstG, rh + par.rhSelf * smooth01(V, par.rhSelfV[0], par.rhSelfV[1]), shT, alat, sShift, latD);
    if (par.qSd > 0) {                                                           // the seed's own quality (persistent random organisation), fading once it is a storm
      const rq = Math.exp(-1 / par.qTau); S.q = rq * S.q + Math.sqrt(1 - rq * rq) * rndn(seed, id, h, ST.Q);
      g = Math.min(1, g * Math.exp(par.qSd * S.q * (1 - smooth01(V, par.qFade[0], par.qFade[1]))));
    }
    g += (1 - g) * par.matureBoost * smooth01(V, 45, 95) * gL * gS;
    const gc = G.gCrit, ku = G.kUp;
    const kappa = g >= gc ? ku * (g - gc) / (1 - gc) : -par.kDn * (gc - g) / gc;
    const vcap = (sub ? Math.min(G.vCap, vPot(sstE, par)) : vPot(sstE, par)) * (1 - par.vpLat * smooth01(alat, par.vpLatB[0], par.vpLatB[1]));
    const veq = vcap * (par.vEqLo + (1 - par.vEqLo) * g);
    if (kappa > 0) dV = V < veq ? kappa * V * (1 - V / veq) : -par.rRelax * (V - veq);
    else dV = Math.max(kappa * (V - par.vFloor), -(par.decayCap[0] + par.decayCap[1] * (V / 60) * (V / 60)));
    // rapid intensification: episodes that trigger only in a good environment, while there is room to grow
    if (th === 'tc') {
      const R = par.ri;
      if (S.ri && h >= S.ri.t0 + S.ri.dur) { S.ri = null; S.riCoolUntil = h + R.cool; }
      if (S.ri) {
        if (V > 0.93 * vcap || lf > 0.3) { S.ri = null; S.riCoolUntil = h + R.cool; }
        else dV += S.ri.rate * Math.sin(Math.PI * (h - S.ri.t0 + 0.5) / S.ri.dur);
      } else if (h >= S.riCoolUntil && lf < 0.1) {
        const cond = smooth01(sstE, R.sst[0], R.sst[1]) / (1 + Math.pow(shT / R.shear, 3)) * smooth01(rh, R.rh[0], R.rh[1])
          * smooth01(V, 35, 55) * (1 - smooth01(V, 105, 125)) * smooth01(1 - V / Math.max(vcap, 1), 0.12, 0.35) * gL;
        if (cond > 0.01 && rnd(seed, id, h, ST.RIT) < R.haz * cond) {
          S.ri = { t0: h, dur: R.dur[0] + (R.dur[1] - R.dur[0]) * rnd(seed, id, h, ST.RID), rate: R.rate[0] + (R.rate[1] - R.rate[0]) * rnd(seed, id, h, ST.RIR) };
        }
      }
    }
    if (th === 'tc' || th === 'sc') {                                           // poleward of ~30N the jet's shear holds a weak system up (and lets it grow toward what the baroclinic zone supports)
      const vb = baroclinicV(par, shear, alat);
      if (V < vb) dV = Math.max(dV, par.bc.kTc * (vb - V));
    }
  } else if (th === 'ex' || th === 'nl') {
    // a post-tropical cyclone relaxes (over three days) toward what the local baroclinic zone supports, with the odd episode of re-intensification; a remnant low of a decayed
    // tropical cyclone hovers at a weak wind until it fills
    if (th === 'ex') {
      const lift = S.exLift || 0;                                                // what an episode of re-intensification has added to the wind the baroclinic zone supports: it stays, and fades over days
      dV = -(V - baroclinicV(par, shear, alat) - lift) / par.bc.exTau;
      S.exLift = lift * (1 - 1 / (2 * par.bc.exTau));
      const ep = S.exEp; if (ep && h >= ep.t0 && h < ep.t0 + ep.dur) { const e = ep.rate * Math.sin(Math.PI * (h - ep.t0 + 0.5) / ep.dur); dV += e; S.exLift += e; }
      S.exDeep = Math.min(40, S.exDeep + 0.15 * clamp(shear - 25, 0, 30) / 30);
    } else dV = -(V - par.nlV) / 36;
  }
  if (lf > 0) {                                                                  // Kaplan-DeMaria decay V = Vb + (R V0 - Vb) exp(-alpha t), weighted by how much of the neighbourhood is land
    const ex = th === 'ex';
    if (!S.onLand && lf > 0.5) { if (!ex) S.v *= par.landCut; S.onLand = true; }
    S.v = Math.max(1, S.v + (1 - lf) * dV);
    S.v = S.v > par.landVb ? par.landVb + (S.v - par.landVb) * Math.exp(-par.landAlpha * (ex ? par.exLandMul : 1) * lf) : Math.max(1, S.v - lf * 0.03 * (ex ? par.exLandMul : 1) * Math.max(0, S.v - 8));
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
    if (S.vr >= (S.sub && M ? par.devVSub - 1 : par.genV) && lf < 0.5 && Math.abs(lat2) >= 6 && sstE > (S.sub && M ? 19 : 24) && (!M || (S.dev >= 0 && S.sust !== false))) S.genCount++; else S.genCount = 0;
    if (S.genCount >= par.genHold) { S.th = S.sub ? 'sc' : 'tc'; S.tdHour = h + 1; S.genCount = 0; }
    else {
      if (S.v < 9) S.v = 9;                                                      // a wave stays a wave: it fades toward a floor, it does not vanish
      if (lf > 0.7 && h - S.born > 12) S.lowCount++; else S.lowCount = 0;
      if (S.lowCount >= 12) { S.alive = false; S.endReason = 'moved over land'; S.end = h + 1; }
      else if (sst < (S.sub && M ? 17 : 22) || (h + 1 - S.born) > par.waveLife || (M && S.dev < 0 && ((S.life > 0 && h + 1 - S.born > S.life) || S.lat > (S.kind === 'W' ? par.waveLatMax : 42)))) { S.alive = false; S.endReason = 'dissipated'; S.end = h + 1; }
    }
  } else if (th === 'tc' || th === 'sc') {
    // the post-tropical transition: a random event at the real best track's rate (etHaz: latitude, cold water, the shear of the westerlies, a strong storm resists)
    const finished = () => { if (rnd(seed, id, h, ST.ETS) < par.disHaz.lowShare) becomeRemnantLow(S, h, seed, par); else { S.alive = false; S.endReason = lf > 0.5 ? 'dissipated over land' : 'dissipated'; S.end = h + 1; } };
    if (lf > 0.5 && S.v < par.landEnd[0]) { S.landLow = (S.landLow || 0) + 1; if (S.landLow >= par.landEnd[1]) finished(); } else S.landLow = 0;
    const pE = S.alive && S.th === th ? etHazard6(par, alat, sst, shear, S.v) : 0, pD = S.alive && S.th === th && lf < 0.3 ? disHazard6(par, alat, sst, shear, S.v, S.tdHour >= 0 ? h - S.tdHour : null) : 0;
    if (pE > 0 || pD > 0) {                                                   // two exits that compete: the transition, or dissipation (a remnant low, or the track ends)
      const u = rnd(seed, id, h, ST.ETC), lE = pE > 0 ? -Math.log(1 - pE) / 6 : 0, lD = pD > 0 ? -Math.log(1 - pD) / 6 : 0;
      if (u < lE) becomePostTropical(S, h, seed, par, shear);
      else if (u < lE + lD) finished();
    }
    if (S.th === 'tc') {
      if (S.vr < 22) {
        S.lowCount++;
        if (S.lowCount >= 12) becomeRemnantLow(S, h, seed, par);                    // a storm that has spun down is a remnant low (a baroclinic zone would have kept it up: see baroclinicV)
      } else S.lowCount = 0;
    } else if (S.th === 'sc') {
      const conv = sstE >= 26 && shear / par.shearK <= 15 && S.vr >= 30 && lf < 0.3;           // a subtropical storm over warm water with little shear becomes tropical
      S.convCount = conv ? S.convCount + 1 : 0;
      if (S.convCount >= 18) { S.th = 'tc'; S.convCount = 0; }
      else if (S.vr < 20) { S.lowCount++; if (S.lowCount >= 12) becomeRemnantLow(S, h, seed, par); }
      else S.lowCount = 0;
    }
  } else if (th === 'ex' || th === 'nl') {
    if (h + 1 >= S.nlTill || S.v < 12) { S.alive = false; S.endReason = th === 'ex' ? 'absorbed' : 'dissipated'; S.end = h + 1; }
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
    dir: Math.round((Math.atan2(S.cx, S.cy) / DEG + 360) % 360), spd: Math.round(spd), sst: r1(S.lastSst), sh: Math.round(S.lastShear), rh: Math.round(S.lastRh),
    ace: Math.round(aceTotal * 100) / 100, land: S.lastLf > 0.5,
  };
}

/* ---- low tracker: nearest-neighbour tracking of the pressure minima the host detects every six hours ------------------- */
function LowTracker() { this.tracks = []; this.next = 1; this.done = []; }          // done: [born, end, fixes, deepest hPa] of the tracks that ended (the last 600), for statistics
LowTracker.prototype._finish = function (t, hour) {
  t.alive = false; t.end = hour;
  if (!this.done) this.done = [];
  this.done.push([t.born, hour, t.n, Math.round(t.pmin)]); if (this.done.length > 600) this.done.shift();
};
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
    t.lat = d.lat; t.lon = d.lon; t.p = d.p; t.miss = 0; t.maxDepth = Math.max(t.maxDepth, 1010 - d.p); t.n++; t.pmin = Math.min(t.pmin, d.p);
    t.fixes.push([hour, r1(d.lat), r1(d.lon), Math.round(d.p)]); if (t.fixes.length > 80) t.fixes.shift();
  }
  for (const t of alive) if (!matched.has(t)) { t.miss++; if (t.miss >= 2) this._finish(t, hour); }
  for (let j = 0; j < dets.length; j++) if (!used[j]) {
    const d = dets[j];
    this.tracks.push({ id: 'L' + this.next++, born: hour, lat: d.lat, lon: d.lon, p: d.p, dx: 0, dy: 0, miss: 0, alive: true, maxDepth: 1010 - d.p, n: 1, pmin: d.p, fixes: [[hour, r1(d.lat), r1(d.lon), Math.round(d.p)]] });
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
  this.par = mergeParams(defaultParams(), o.params);
  this.hour = o.hour0 || 0;
  this.systems = []; this.byId = {};
  this.n = { W: 0, N: 0, M: 0 };
  this.auto = o.auto !== false; this.autoRate = o.autoRate == null ? 1 : o.autoRate;
  this.sched = { waveT: null, waveK: 0, waveSpawn: false };
  this.lows = new LowTracker();
  this.maps = prepareMaps(o.maps);                                             // the climatology the host supplied (null: the plain steering model)
  this.ctx = { maps: this.maps, tw: null, diag: null };                          // what a step needs besides the system: maps, the time weights of the hour, the calibration lab's accumulators
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
  return this._add(newSystem({ id: ns + k, num: idNum(ns, k), th, lat, lon, v, hour: h, origin, sub, kind: ns, q: rndn(this.seed, idNum(ns, k), 0, ST.Q0) }));
};

/* hand-placed systems: kind 'wave' | 'td' | 'sd' | 'low' */
Manager.prototype.place = function (spec) {
  const h = spec.hour == null ? this.hour : spec.hour;
  const v0 = { wave: 15, td: 30, sd: 28, low: 32 }[spec.kind] || 15, th = { wave: 'wv', td: 'tc', sd: 'sc', low: 'nl' }[spec.kind] || 'wv';
  const S = this._seedSystem('M', th, spec.lat, spec.lon, spec.v || v0, h, 'placed:' + spec.kind, spec.kind === 'sd');
  if (th === 'nl') S.nlTill = h + this.par.nlLife[3];
  if (th === 'tc' || th === 'sc') S.genCount = 0;
  return S;
};

/* the place a new hand-placed system would get (for a preview that has exactly the noise the placed storm will have) */
Manager.prototype.pendingPlacement = function (spec) {
  const k = this.n.M + 1, v0 = { wave: 15, td: 30, sd: 28, low: 32 }[spec.kind] || 15, th = { wave: 'wv', td: 'tc', sd: 'sc', low: 'nl' }[spec.kind] || 'wv';
  const S = newSystem({ id: 'M' + k, num: idNum('M', k), th, lat: spec.lat, lon: spec.lon, v: spec.v || v0, hour: spec.hour == null ? this.hour : spec.hour, origin: 'placed:' + spec.kind, sub: spec.kind === 'sd', kind: 'M', q: rndn(this.seed, idNum('M', k), 0, ST.Q0) });
  if (th === 'nl') S.nlTill = S.born + this.par.nlLife[3];                    // exactly what place() gives a low
  return S;
};

Manager.prototype._waveSchedule = function (from) {                      // next wave time after `from`: a quasi-periodic train whose rate follows the season
  const rate = this.par.waveRate0 * seasonalWeight(WAVE_SEASON, this.doyAt(from)) * seasonShape(this.par, this.doyAt(from)) * this.autoRate;
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
      const sw = clamp((doy - 140) / 100, 0, 1), latC = par.waveLat0 + 2.5 * Math.sin(Math.PI * sw);
      const lat = clamp(latC + 2.2 * rndn(seed, 78, k, ST.POS), 8, 18), lon = -17.5 + 0.6 * rndn(seed, 79, k, ST.POS);
      const v0 = par.waveV0[0] + (par.waveV0[1] - par.waveV0[0]) * rnd(seed, 80, k, ST.V0);
      this._seedSystem('W', 'wv', lat, lon, v0, h, 'wave', false);
    }
    const s = this._waveSchedule(this.sched.waveT); this.sched.waveT = s.t; this.sched.waveSpawn = s.spawn;
  }
  // local seeds: disturbances the waves and the pressure lows do not supply (a trough or a gyre over the Gulf, a stalled front off the Carolinas ...), born where the real
  // Atlantic needs them (maps.spawn, per year per node) and lasting a few days unless they develop
  if (this.maps) {
    const M = this.maps, tw = this.ctx.tw, rate = par.seedMul * this.autoRate / (30.4375 * 24), diag = this.ctx.diag;       // maps.spawn: the seeds a month contributes to a year's total, per node
    for (const k of M.spawnCells || []) {
      const a = (M.spawn[tw.m0 * M.n + k] * (1 - tw.t) + M.spawn[tw.m1 * M.n + k] * tw.t) * rate;
      if (!(a > 0) || rnd(seed, 1000 + k, h, ST.SPAWN) >= a) continue;
      const j = (k / M.nx) | 0, i = k - j * M.nx;
      const lat = M.lat0 + (j + rnd(seed, 1000 + k, h, ST.SEEDPOS) - 0.5) * M.res, lon = M.lon0 + (i + rnd(seed, 1000 + k, h + 1000003, ST.SEEDPOS) - 0.5) * M.res;
      if (env && env.isLand && env.isLand(lat, lon)) continue;
      const v0 = par.seedV[0] + (par.seedV[1] - par.seedV[0]) * rnd(seed, 1000 + k, h, ST.V0);
      const S = this._seedSystem('N', 'wv', lat, lon, v0, h, 'seed', false);
      S.life = par.lifeN[0] + (par.lifeN[1] - par.lifeN[0]) * rnd(seed, 1000 + k, h, ST.LIFEN);
      if (diag) diag['spawn.N'][(tw.t < 0.5 ? tw.m0 : tw.m1) * M.n + k] += 1;
    }
    return;
  }
  // regional sources
  if (par.regional) {
    for (let r = 0; r < par.regions.length; r++) {
      const R = par.regions[r], wsum = R.w.reduce((a, b) => a + b, 0) / 12;
      const haz = R.perYear * par.regionMul * this.autoRate / (365.25 * 24) * seasonalWeight(R.w, doy) * seasonShape(par, doy) / Math.max(wsum, 1e-6);
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
  if (!this.auto) return;                                                      // the lows are still tracked (and drawn), but nothing develops from them
  const par = this.par;
  if (this.maps && this.maps.haz && this.ctx.tw) {
    // a tracked low develops like any other disturbance: at the map's rate for its place and month times E; a tropical or a subtropical depression, whichever draw it wins
    const M = this.maps, tw = this.ctx.tw, ctx = this.ctx, sstRef = env.sstRef ? env.sstRef() + par.sstOffset : null;
    for (const t of this.lows.tracks) {
      if (!t.alive || h - t.born < 6 || t.lat < 18 || t.lat > 45 || env.isLand(t.lat, t.lon)) continue;
      const sst = env.sst(t.lat, t.lon) + par.sstOffset, sh = env.shear(t.lat, t.lon) + par.shearOffset, rh = env.rh(t.lat, t.lon) + par.rhOffset;
      if (!(sst === sst) || !(sh === sh) || !(rh === rh)) continue;
      const act = ctx.act || 1, doy = this.doyAt(h);
      const eT = envFactor(par, M, tw, t.lat, t.lon, sst, rh, sh, sstRef, false) * devGateAt(par, env, false, t.lat, sst, rh, sh, doy, par.sstOffset) * act;
      const eS = envFactor(par, M, tw, t.lat, t.lon, sst, rh, sh, sstRef, true) * devGateAt(par, env, true, t.lat, sst, rh, sh, doy, par.sstOffset) * act;
      const hT = Math.min(par.hazMax, 6 * par.hazMul * mapAt(M, M.haz.T, tw, t.lat, t.lon) * eT * this.autoRate), hS = Math.min(par.hazMax, 6 * par.hazMul * mapAt(M, M.haz.S, tw, t.lat, t.lon) * eS * this.autoRate);
      if (ctx.diag) diagExposure(ctx, 'L', tw, t.lat, t.lon, eT, eS, 6);
      const u = rnd(this.seed, idNum('L', +t.id.slice(1)), h, ST.LOWSEED);
      if (u < hT + hS) {
        this.lows._finish(t, h); t.became = true;
        const S = this._seedSystem('N', 'wv', t.lat, t.lon, 22, h, 'low', u >= hT);
        S.dev = h;
        S.fixes = t.fixes.map(([hh, la, lo, pp]) => ({ h: hh, lat: la, lon: lo, v: 20, p: pp, st: 'LO', th: 'wv', dir: 0, spd: 0, sst: 0, sh: 0, rh: 0, ace: 0, land: false }));      // the low's own path leads into the depression's
        if (ctx.diag) diagGenesis(ctx, 'L', S.sub, tw, t.lat, t.lon);
      }
    }
    return;
  }
  for (const t of this.lows.tracks) {
    if (!t.alive || h - t.born < 12 || t.lat < 22 || t.lat > 38) continue;
    const sst = env.sst(t.lat, t.lon) + par.sstOffset, sh = env.shear(t.lat, t.lon) + par.shearOffset;
    if (!(sst === sst) || sst < 22.5 || sst > 28.5 || !(sh < 30) || env.isLand(t.lat, t.lon)) continue;
    if (rnd(this.seed, idNum('L', +t.id.slice(1)), h, ST.LOWSEED) < par.lowSeedHaz * this.autoRate) {
      this.lows._finish(t, h); t.became = true;
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
    const doy = this.doyAt(h);
    if (this.maps) { this.ctx.tw = timeWeights(doy + (((h % 24) + 24) % 24) / 24); this.ctx.act = activityFactor(this.par, this.seed, this.dateAt(h).getUTCFullYear(), h); }
    if (this.auto) this._spawn(h, env);
    for (const S of this.systems) if (S.alive) stepSystem(S, env, h, this.seed, this.par, doy, this.ctx);
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
  const ctx = { maps: this.maps, tw: null, diag: null };
  for (let k = 0; k < horizonH && S.alive; k++) {
    const env = envSrc && typeof envSrc.at === 'function' ? envSrc.at(h) : envSrc;
    const doy = this.doyAt(h);
    if (this.maps) { ctx.tw = timeWeights(doy + (((h % 24) + 24) % 24) / 24); ctx.act = activityFactor(par, this.seed, this.dateAt(h).getUTCFullYear(), h); }
    stepSystem(S, env, h, this.seed, par, doy, ctx); h++;
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
    season: this.season, prev: this.prev, prevEntry: this.prevEntry, archive: this.archive, yearEndH: this.yearEndH, systems: this.systems, lows: { tracks: this.lows.tracks, next: this.lows.next, done: this.lows.done } };
};
Manager.prototype.enableDiag = function () { if (this.maps) this.ctx.diag = newDiag(this.maps); return !!this.ctx.diag; };
Manager.prototype.diagPacked = function () {                              // the accumulators as sparse [index, value] lists (what the lab ships back to the page's caller)
  const d = this.ctx.diag; if (!d) return null;
  const out = {}; for (const k of DIAG_KEYS) { const a = d[k], l = []; for (let i = 0; i < a.length; i++) if (a[i] !== 0) l.push([i, Math.round(a[i] * 1000) / 1000]); out[k] = l; }
  return out;
};
Manager.restore = function (o, extra) {                                  // a parameter added since the save is filled in with its default
  const m = new Manager({ seed: o.seed, startMs: o.startMs, params: {}, hour0: o.hour, auto: o.auto, autoRate: o.autoRate, maps: extra && extra.maps });
  m.par = mergeParams(defaultParams(), o.par); m.n = o.n; m.sched = o.sched; m.season = o.season; m.prev = o.prev; m.prevEntry = o.prevEntry || null; m.archive = o.archive; m.yearEndH = o.yearEndH;
  m.systems = o.systems; m.byId = {}; for (const S of m.systems) m.byId[S.id] = S;
  m.lows.tracks = o.lows.tracks; m.lows.next = o.lows.next; m.lows.done = o.lows.done || [];
  return m;
};

function describe(S, fix) {                                                // what a hover / card shows for a system at a fix (or its live state)
  const f = fix || makeFix(S, 0, S.ace), v = f.v, cat = category(v);
  const over = !!f.land;
  return { id: S.id, name: S.name, status: f.st, cat, windKt: v, windMph: ktToMph(v), gustMph: ktToMph(gustKt(v, over)), pressure: f.p,
    move: f.spd < 1 ? 'nearly stationary' : compass(f.dir) + ' at ' + f.spd + ' kt', sst: f.sst, shear: f.sh };
}

root.HFStorms = {
  VERSION, create: (o) => new Manager(o), restore: (o, extra) => Manager.restore(o, extra), defaultParams, mergeParams,
  prepareMaps, timeWeights, mapAt, driftAt, climAt, steerRing, envFactor, activityFactor, structureParams, CALIBRATED, calibrated: (on) => { const was = useCalibrated; if (on != null) useCalibrated = !!on; return was; },
  category, ktToMph, aceOf, round5, gustKt, compass, pressureFromWind, windFromPressure, WP, vPot, statusOf, describe, nameFor, NAME_SETS, NAME_SUPPLEMENTAL,
  smooth01, rnd, rndn, hash5, idNum, stepSystem, newSystem, makeFix, seasonalWeight, WAVE_SEASON, LowTracker, etHazard6, disHazard6, baroclinicV,
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
/* ==== STORMS ENGINE END ==== */
