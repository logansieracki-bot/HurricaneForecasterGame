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
 *    env.enso() degC                    optional: the Nino 3.4 index right now (par.enso: the part of El Nino's response the fields do not carry)
 * ------------------------------------------------------------------------------------------------------------------------ */
(function (root) {
'use strict';

const VERSION = 1;
const DEG = Math.PI / 180, KM_DEG = 111.195, KT_KMH = 1.852, KT_MPH = 1.150779, MS_KT = 1.943844, HOUR_MS = 3600000;

/* ---- helpers ------------------------------------------------------------------------------------------------------- */
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
function smooth01(x, a, b) { if (!(x === x)) return 0; const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
/* soft limits. A limit in this engine is a knee, never a clamp: satur(x, cap) is x for x well under cap and bends over toward cap without ever reaching it (p: how sharp the knee is);
   softMin(a, b) is the smaller of two positive numbers with the corner rounded off. Where a rule used to switch on at a threshold it is a ramp (smooth01) or a hazard now */
function satur(x, cap, p) { if (!(x > 0)) return 0; const q = p || 6; return x / Math.pow(1 + Math.pow(x / cap, q), 1 / q); }
function softMin(a, b) { return Math.pow(Math.pow(a, -8) + Math.pow(b, -8), -0.125); }
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
const ST = { VOL: 1, WX: 2, WY: 3, PRES: 4, RIT: 5, RID: 6, RIR: 7, SPAWN: 8, POS: 9, V0: 10, SUBC: 11, ETC: 12, LIFE: 13, WAVE: 14, LOWSEED: 15, PLACE: 16, Q: 17, Q0: 18, GEN: 19, LIFEN: 20, SEEDPOS: 21, ACT: 22, ETL: 23, ETD: 24, ETS: 25, GENC: 26, ENDH: 27, FLOOR: 28, CONV: 29, LEAD: 30, ENS: 31, SIZE: 32, SIZEQ: 33, ERC: 34, ERCP: 35, EXG: 36, ABS: 37, IMP: 38, SUBX: 39 };
const NS = { W: 1, N: 2, M: 3, L: 4, F: 5 };                                                          // id namespaces
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
/* ---- each basin's own intensity scale -------------------------------------------------------------------------------------------------------
   The wind the engine carries is a 1-minute sustained wind (the best-track convention of the US agencies, and what the real normals it is calibrated on are counted in). A region's official agency
   classifies on its own winds: the 10-minute winds of JMA, Meteo-France, the Bureau of Meteorology and Fiji, the 3-minute winds of the India Meteorological Department. Each class below starts at the
   agency's cut-off converted to the 1-minute wind (10-minute / 0.88, the WMO rule of thumb; 3-minute x 1.05) and rounded to the 5 kt a best track holds, so a storm is called what that agency would call
   it. The first storm class always starts at 34 kt (a storm is named at 34 kt of 1-minute wind in every basin: the definition of the named storms the engine is calibrated on). The West Pacific takes
   JTWC's own 1-minute Typhoon (64 kt) and Super Typhoon (130 kt) with JMA's Severe Tropical Storm (48 kt of 10-minute wind), Very Strong (85) and Violent Typhoon (105) between. `bar` are the three season-bar counters' tags: they keep their engine
   thresholds (64 / 96 / 137 kt, what the real normals count) and only the word changes. Each scale also has its own look, as the region's agency and Wikipedia draw it: `cols`, one colour for each class (the NHC's and the West Pacific's blue-green-yellow-orange-red-pink, and the ranked pastels of the Australian, South-West Indian and North Indian charts), and `tag`, the letters that stand for each class on a forecast point (D S H M for the NHC, D S SS T ST VT SU for the West Pacific, the category numbers for Australia, the agency's own abbreviations in the Indian Ocean). Post-tropical is grey on every page.
   Each class: [first 1-minute kt, short, long]. A word `Hurricane` in a long name is the page's local word for it (hurrWord in src/storm-hooks.js: Cyclone, Medicane, ...). */
const NHC_CLASSES = SSHWS.slice().reverse();
const AU_CLASSES = [[34, 'C1', 'Category 1 Tropical Cyclone'], [55, 'C2', 'Category 2 Tropical Cyclone'], [75, 'C3', 'Category 3 Severe Tropical Cyclone'], [100, 'C4', 'Category 4 Severe Tropical Cyclone'], [125, 'C5', 'Category 5 Severe Tropical Cyclone']];
const NHC_LOOK = { cols: ['#3d8bff', '#2fd27a', '#ffe14a', '#ffa534', '#ff4d3d', '#e53fb5', '#a45dff'], tag: ['D', 'S', 'H', 'H', 'M', 'M', 'M'] };           // (the cone's letters are the NHC's: D, S, H for Category 1 and 2, M from Category 3)
const WIKI = { purple: '#a188fc', pink: '#ff738a', peach: '#ffd98c', green: '#c0ffc0', cyan: '#4dffff', sky: '#6ec1ea', blue: '#1591de', teal: '#00faf4' };           // the colours of Wikipedia's storm-formation charts, from the top class down
const AU_LOOK = { cols: [WIKI.sky, WIKI.cyan, WIKI.green, WIKI.peach, WIKI.pink, WIKI.purple], tag: ['L', '1', '2', '3', '4', '5'] };
const SCALES = {
  nhc:  Object.assign({ agency: 'NHC / CPHC', avg: '1-min', classes: NHC_CLASSES, major: 4, bar: ['HURR', 'MAJOR', 'CAT 5'] }, NHC_LOOK),          // major: the index of the first class called major (Category 3); the others have no such word
  satl: Object.assign({ agency: 'Saffir-Simpson (no agency)', avg: '1-min', classes: NHC_CLASSES, major: 4, bar: ['CYC', 'MAJOR', 'CAT 5'] }, NHC_LOOK),
  med:  Object.assign({ agency: 'Saffir-Simpson (no agency)', avg: '1-min', classes: NHC_CLASSES, major: 4, bar: ['MEDI', 'MAJOR', 'CAT 5'] }, NHC_LOOK),
  jtwc: { agency: 'JTWC / JMA', avg: '1-min', classes: [[0, 'D', 'Tropical Depression'], [34, 'S', 'Tropical Storm'], [55, 'SS', 'Severe Tropical Storm'], [64, 'T', 'Typhoon'], [95, 'ST', 'Strong Typhoon'], [120, 'VT', 'Violent Typhoon'], [130, 'SU', 'Super Typhoon']], bar: ['TYPH', 'MAJOR', 'SUPER'],
          cols: ['#0a84ff', '#00f060', '#ffcc00', '#ff9400', '#ff5900', '#ff0022', '#ff55bb'], tag: ['D', 'S', 'SS', 'T', 'ST', 'VT', 'SU'] },
  imd:  { agency: 'IMD', avg: '3-min', classes: [[0, 'D', 'Depression'], [30, 'DD', 'Deep Depression'], [34, 'CS', 'Cyclonic Storm'], [50, 'SCS', 'Severe Cyclonic Storm'], [65, 'VSCS', 'Very Severe Cyclonic Storm'], [95, 'ESCS', 'Extremely Severe Cyclonic Storm'], [125, 'SuCS', 'Super Cyclonic Storm']], bar: ['VSCS', 'ESCS', 'SUPER'],
          cols: [WIKI.blue, WIKI.sky, WIKI.teal, WIKI.green, WIKI.peach, WIKI.pink, WIKI.purple], tag: ['D', 'DD', 'CS', 'SCS', 'VSCS', 'ESCS', 'SuCS'] },
  mfr:  { agency: 'Meteo-France La Reunion', avg: '10-min', classes: [[0, 'TD', 'Tropical Depression'], [34, 'MTS', 'Moderate Tropical Storm'], [55, 'STS', 'Severe Tropical Storm'], [75, 'TC', 'Tropical Cyclone'], [100, 'ITC', 'Intense Tropical Cyclone'], [130, 'VITC', 'Very Intense Tropical Cyclone']], bar: ['CYC', 'INTENSE', 'V.INT'],
          cols: [WIKI.sky, WIKI.cyan, WIKI.green, WIKI.peach, WIKI.pink, WIKI.purple], tag: ['D', 'MTS', 'STS', 'TC', 'ITC', 'VITC'] },
  bom:  Object.assign({ agency: 'Bureau of Meteorology', avg: '10-min', classes: [[0, 'TL', 'Tropical Low']].concat(AU_CLASSES), bar: ['SEVERE', 'CAT 4+', 'CAT 5'] }, AU_LOOK),
  fiji: Object.assign({ agency: 'Fiji Meteorological Service (RSMC Nadi)', avg: '10-min', classes: [[0, 'TD', 'Tropical Depression']].concat(AU_CLASSES), bar: ['SEVERE', 'CAT 4+', 'CAT 5'] }, { cols: AU_LOOK.cols, tag: ['D', '1', '2', '3', '4', '5'] }),
};
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

/* ---- the nine basins -------------------------------------------------------------------------------------------------------------------
   What differs from one basin to the next in the engine itself: the season (a calendar year in the northern hemisphere, July to June in the southern: the season is named for the year it
   starts in), the way storms are named, the word for a hurricane-strength cyclone, and a patch of the parameters (the physics is the Atlantic's, calibrated; a basin's patch holds what its
   real record asks to be different, see docs/roadmap.md). The climatology maps (where and when disturbances develop, how storms drift) are data, not code: they come with the page.
   Name lists: the Atlantic and the Eastern Pacific are the WMO / NHC tables as I remember them (the 2026 lists high confidence, later years and the replacements less); the other lists are
   the real names in the order I remember them or, where I do not, plausible names in their style -- all of them are flagged `verified: false` and can be edited here. */
const EP_SETS = [
  ['Amanda', 'Boris', 'Cristina', 'Douglas', 'Elida', 'Fausto', 'Genevieve', 'Hernan', 'Iselle', 'Julio', 'Karina', 'Lowell', 'Marie', 'Norbert', 'Odalys', 'Polo', 'Rachel', 'Simon', 'Trudy', 'Vance', 'Winnie', 'Xavier', 'Yolanda', 'Zeke'],
  ['Andres', 'Blanca', 'Carlos', 'Dolores', 'Enrique', 'Felicia', 'Guillermo', 'Hilda', 'Ignacio', 'Jimena', 'Kevin', 'Linda', 'Marty', 'Nora', 'Olaf', 'Pamela', 'Rick', 'Sandra', 'Terry', 'Vivian', 'Waldo', 'Xina', 'York', 'Zelda'],
  ['Agatha', 'Blas', 'Celia', 'Darby', 'Estelle', 'Frank', 'Georgette', 'Howard', 'Ivette', 'Javier', 'Kay', 'Lester', 'Madeline', 'Newton', 'Orlene', 'Paine', 'Roslyn', 'Seymour', 'Tina', 'Virgil', 'Winifred', 'Xavier', 'Yolanda', 'Zeke'],
  ['Adrian', 'Beatriz', 'Calvin', 'Dora', 'Eugene', 'Fernanda', 'Greg', 'Hilary', 'Irwin', 'Jova', 'Kenneth', 'Lidia', 'Max', 'Norma', 'Otis', 'Pilar', 'Ramon', 'Selma', 'Todd', 'Veronica', 'Wiley', 'Xina', 'York', 'Zelda'],
  ['Aletta', 'Bud', 'Carlotta', 'Daniel', 'Emilia', 'Fabio', 'Gilma', 'Hector', 'Ileana', 'John', 'Kristy', 'Lane', 'Miriam', 'Norman', 'Olivia', 'Paul', 'Rosa', 'Sergio', 'Tara', 'Vicente', 'Willa', 'Xavier', 'Yolanda', 'Zeke'],
  ['Alvin', 'Barbara', 'Cosme', 'Dalila', 'Erick', 'Flossie', 'Gil', 'Henriette', 'Ivo', 'Juliette', 'Kiko', 'Lorena', 'Mario', 'Narda', 'Octave', 'Priscilla', 'Raymond', 'Sonia', 'Tico', 'Velma', 'Wallis', 'Xina', 'York', 'Zelda'],
];
const EP_EXTRA = ['Alexa', 'Brent', 'Celeste', 'Dario', 'Esmeralda', 'Fabian', 'Galen', 'Hollis', 'Iris', 'Jovan', 'Kaleo', 'Leona'];
const CP_NAMES = ['Akoni', 'Ema', 'Hone', 'Iona', 'Keli', 'Lala', 'Moke', 'Nolo', 'Olana', 'Pena', 'Ulana', 'Wale', 'Aka', 'Ekeka', 'Hene', 'Iolana', 'Keoni', 'Lino', 'Mele', 'Nona', 'Oliwa', 'Pama', 'Upana', 'Wene',
  'Alika', 'Ele', 'Huko', 'Iopa', 'Kika', 'Lana', 'Maka', 'Neki', 'Omeka', 'Pewa', 'Unala', 'Wali', 'Ana', 'Ela', 'Halola', 'Iune', 'Kilo', 'Loke', 'Malia', 'Niala', 'Oka', 'Peke', 'Uleki', 'Wila'];
const WP_NAMES = ['Damrey', 'Haikui', 'Kirogi', 'Yun-yeung', 'Koinu', 'Bolaven', 'Sanba', 'Jelawat', 'Ewiniar', 'Maliksi', 'Gaemi', 'Prapiroon', 'Maria', 'Son-Tinh', 'Ampil', 'Wukong', 'Jongdari', 'Shanshan', 'Yagi', 'Leepi',
  'Bebinca', 'Pulasan', 'Soulik', 'Cimaron', 'Jebi', 'Krathon', 'Barijat', 'Trami', 'Kong-rey', 'Yinxing', 'Toraji', 'Man-yi', 'Usagi', 'Pabuk', 'Wutip', 'Sepat', 'Mun', 'Danas', 'Nari', 'Wipha', 'Francisco', 'Co-may', 'Krosa', 'Bailu',
  'Podul', 'Lingling', 'Kajiki', 'Nongfa', 'Peipah', 'Tapah', 'Mitag', 'Ragasa', 'Neoguri', 'Bualoi', 'Matmo', 'Halong', 'Nakri', 'Fengshen', 'Kalmaegi', 'Fung-wong', 'Koto', 'Nokaen', 'Penha', 'Nuri', 'Sinlaku', 'Hagupit', 'Jangmi',
  'Mekkhala', 'Higos', 'Bavi', 'Maysak', 'Haishen', 'Noul', 'Dolphin', 'Kujira', 'Chan-hom', 'Peilou', 'Nangka', 'Saudel', 'Narra', 'Gaenari', 'Atsani', 'Etau', 'Bang-lang', 'Krovanh', 'Dujuan', 'Surigae', 'Choi-wan', 'Koguma', 'Champi',
  'In-fa', 'Cempaka', 'Nepartak', 'Lupit', 'Mirinae', 'Nida', 'Omais', 'Luc-binh', 'Chanthu', 'Dianmu', 'Mindulle', 'Lionrock', 'Kompasu', 'Namtheun', 'Malou', 'Nyatoh', 'Sarbul', 'Amuyao', 'Gosari', 'Chaba', 'Aere', 'Songda', 'Trases',
  'Mulan', 'Meari', 'Ma-on', 'Tokage', 'Hinnamnor', 'Muifa', 'Merbok', 'Nanmadol', 'Talas', 'Noru', 'Kulap', 'Roke', 'Sonca', 'Nesat', 'Haitang', 'Nalgae', 'Banyan', 'Yamaneko', 'Pakhar', 'Sanvu', 'Mawar', 'Guchol', 'Talim', 'Duksuri', 'Khanun', 'Lan', 'Saola'];
const NI_NAMES = ['Nisarga', 'Gati', 'Nivar', 'Burevi', 'Tauktae', 'Yaas', 'Gulab', 'Shaheen', 'Jawad', 'Asani', 'Sitrang', 'Mandous', 'Mocha', 'Biparjoy', 'Tej', 'Hamoon', 'Midhili', 'Michaung', 'Remal', 'Asna', 'Dana', 'Fengal', 'Shakhti', 'Montha',
  'Senyar', 'Ditwah', 'Arnab', 'Murasu', 'Akvan', 'Kaani', 'Ngamann', 'Sail', 'Sahab', 'Lulu', 'Ghazeer', 'Gigum', 'Thianyot', 'Afoor', 'Diksam'];
const AU_NAMES = ['Anika', 'Billy', 'Charlotte', 'Darian', 'Ellie', 'Freddy', 'Gabrielle', 'Herman', 'Ilsa', 'Jasper', 'Kirrily', 'Lincoln', 'Megan', 'Neville', 'Olga', 'Paul', 'Robyn', 'Sean', 'Tatiana', 'Vince', 'Alessia', 'Bart', 'Caleb', 'Dianne',
  'Errol', 'Fiona', 'Gregg', 'Hayley', 'Ian', 'Jenna', 'Kevin', 'Linda', 'Marcus', 'Nora', 'Owen', 'Pat', 'Quinn', 'Ralph', 'Selwyn', 'Tessa'];
const SW_SETS = [
  ['Ana', 'Batsirai', 'Cliff', 'Dumako', 'Emnati', 'Fezile', 'Gombe', 'Halima', 'Issa', 'Jobo', 'Kamba', 'Lola', 'Mondo', 'Nakisha', 'Olwen', 'Pesho', 'Quincy', 'Rumbi', 'Soraya', 'Tula', 'Uriel', 'Vana', 'Waldo', 'Xola'],
  ['Ashley', 'Balita', 'Cheneso', 'Dingani', 'Enala', 'Freddy', 'Gamane', 'Herold', 'Iris', 'Jude', 'Kofi', 'Lavina', 'Mawa', 'Noa', 'Orson', 'Paza', 'Rando', 'Sakina', 'Tambo', 'Uzuri', 'Venu', 'Wala', 'Xiomara', 'Yoli'],
  ['Alvaro', 'Belal', 'Candice', 'Djoungou', 'Eleanor', 'Fabrice', 'Garance', 'Hidaya', 'Ikoro', 'Jabulani', 'Kena', 'Lindiwe', 'Moana', 'Nandi', 'Oscar', 'Pamba', 'Rafael', 'Saba', 'Teddy', 'Umar', 'Vincent', 'Wilma', 'Xaver', 'Yanis'],
  ['Alinta', 'Boris', 'Cyril', 'Dalia', 'Elias', 'Fana', 'Gerald', 'Hasina', 'Ivan', 'Jade', 'Kiki', 'Lamar', 'Mina', 'Naomi', 'Omar', 'Pili', 'Ravo', 'Sofia', 'Thabo', 'Ulrika', 'Valo', 'Wenda', 'Xander', 'Yara'],
  ['Amara', 'Bruno', 'Chedza', 'Dadou', 'Eloise', 'Faraji', 'Gaston', 'Hawa', 'Idrissa', 'Joyce', 'Kassim', 'Layla', 'Mikael', 'Nia', 'Oliver', 'Penda', 'Rado', 'Salima', 'Tiago', 'Unity', 'Vero', 'Wassim', 'Xena', 'Yves'],
  ['Alima', 'Bakari', 'Chido', 'Dikeledi', 'Elton', 'Faith', 'Gugu', 'Hamisi', 'Ines', 'Jamal', 'Kelvin', 'Lerato', 'Malik', 'Nasra', 'Odile', 'Pierre', 'Roya', 'Sidi', 'Tendai', 'Una', 'Viola', 'Winston', 'Xavi', 'Yasmin'],
];
const SP_NAMES = ['Ana', 'Bina', 'Cody', 'Dovi', 'Eva', 'Fili', 'Gina', 'Hale', 'Irene', 'Judy', 'Kevin', 'Lola', 'Mal', 'Nat', 'Olo', 'Pita', 'Rae', 'Sera', 'Tam', 'Uesi', 'Vania', 'Wesi', 'Yani', 'Zita'];
const SA_NAMES = ['Arani', 'Bapo', 'Cari', 'Deni', 'Ecai', 'Guara', 'Iba', 'Jaguar', 'Kurumi', 'Mani', 'Oquira', 'Potira', 'Raoni', 'Sepe', 'Tupa', 'Uba', 'Vitoria', 'Waima', 'Yara', 'Zeca'];
const MED_NAMES = ['Zorbas', 'Ianos', 'Daniel', 'Apollo', 'Celeno', 'Numa', 'Leucosia', 'Rolf', 'Elaina', 'Quirinus', 'Trixie', 'Cassilda', 'Helios', 'Medea', 'Nostos', 'Oceanis', 'Pontos', 'Selene'];
/* The fitted physics of each basin: the Atlantic's calibrated law (CALIBRATED) is the base, a basin's entry holds what its own best track asked to be different (tools/storm_basin_opt.mjs, CMA-ES on the
   intensity law; the genesis latitude gates from the latitudes where its depressions really form; docs/roadmap.md, milestone 10). tools/storm_basin_patch.mjs writes this block. */
/* ==== BASIN PARAMS BEGIN ==== */
const BASIN_PARAMS = {
  eastpacific: {
    vpScale: 1.025, kUp: 0.02206, kDn: 0.2593, sstGate: [24.51, 27.04], rhGate: [53.21, 63.31], shearK: 1.822, etaLo: 16.47, etaHi: 24.07, vpLat: 0.5855, gCrit: 0.0176,
    ri: { haz: 0.09609 }, etHaz: { b0: -6.68 }, genGate: { lat: [6.9, 10.8] }, latGate: [6.189, 13.19],
  },
  westpacific: {
    vpScale: 1.105, kUp: 0.02619, kDn: 0.03, sstGate: [25.61, 28.14], rhGate: [53.84, 63.94], shearK: 3.772, etaLo: 21.85, etaHi: 30, vpLat: 0.8, gCrit: 0.01516,
    ri: { haz: 0.02389 }, etHaz: { b0: -5.753 }, latGate: [2, 9], act: { seasSd: 0 }, envB: { rh: 0.36, shear: 0.4263, sst: 0.5145, sstAbs: 0.1088 },
    enso: { act: 0.5407, lon: 5.271, lat: -2.139 }, genGate: { lat: [3.4, 7.9] },
  },
  nio: {
    vpScale: 1.05, kUp: 0.03258, kDn: 0.5, sstGate: [22, 24.53], rhGate: [42, 52.1], shearK: 3.514, etaLo: 15.67, etaHi: 29.84, vpLat: 0.3532, gCrit: 0.02434,
    ri: { haz: 0.01 }, etHaz: { b0: -4.5 }, latGate: [2.609, 9.609], tdMargin: 0.4463, act: { seasSd: 0.02545 },
    envB: { rh: 0.018, shear: 0.02132, sst: 0.02573, sstAbs: 0.005439 }, enso: { act: 0.5833, lon: -4.373, lat: -1.458 }, genGate: { lat: [2, 6.5] },
  },
  swio: {
    vpScale: 0.8467, kUp: 0.0331, kDn: 0.1988, sstGate: [25.27, 27.8], rhGate: [45.4, 55.5], shearK: 3.518, etaLo: 8.061, etaHi: 27.18, vpLat: 0.32, gCrit: 0.2003,
    ri: { haz: 0.01608 }, etHaz: { b0: -6.738 }, latGate: [2.679, 9.679], tdMargin: 0.2117, act: { seasSd: 0.05842 },
    envB: { rh: 0.04227, shear: 0.05006, sst: 0.06042, sstAbs: 0.01277 }, enso: { act: -0.08193, lon: -2.029, lat: -0.1037 }, genGate: { lat: [3.1, 7.3] },
  },
  satl: {
    genGate: { lat: [16.4, 21.6], sstSub: [19.5, 22.5] }, etaLo: 10.01, etaHi: 24, subSstOK: 18, subCold: 16, seedCold: 20,
    sub: { sstGate: [21, 24], vCap: 110, kUp: 0.02458, gCrit: 0.6, shearScale: 10.94 }, vpScale: 0.7, kUp: 0.06294, kDn: 0.02533, sstGate: [23.73, 26.26],
    rhGate: [49.65, 59.75], shearK: 6.287, vpLat: 0.5, gCrit: 0.1299, ri: { haz: 0.01084 }, etHaz: { b0: -8.147 }, latGate: [4, 11], tdMargin: 0.1809,
    act: { seasSd: 0.08952 }, envB: { rh: 0.05358, shear: 0.06345, sst: 0.07657, sstAbs: 0.01619 }, enso: { act: 0, lon: 0, lat: 0 },
  },
  med: {
    genGate: { lat: [30.6, 34.2], sstSub: [13.5, 17.5] }, etaLo: 9.979, etaHi: 24.44, subSstOK: 13.5, subCold: 11.5, seedCold: 11.5,
    sub: { sstGate: [14.5, 18.5], rhGate: [24, 45], vCap: 97.18, kUp: 0.06, gCrit: 0.05, shearScale: 57.83 }, vpScale: 1.12, kUp: 0.07, kDn: 0.01889,
    sstGate: [23.73, 26.26], rhGate: [49.65, 59.75], shearK: 6.5, vpLat: 0.5, gCrit: 0.09755, ri: { haz: 0.02165 }, etHaz: { b0: -8.946 }, latGate: [4, 11],
    tdMargin: 0.6784, act: { seasSd: 0.35 }, envB: { rh: 0.36, shear: 0.4263, sst: 0.5145, sstAbs: 0.1088 }, enso: { act: 0, lon: 0, lat: 0 },
  },
  spac: {
    genGate: { lat: [6, 9.5] }, vpScale: 1.026, kUp: 0.05369, kDn: 0.2901, sstGate: [25.66, 28.19], rhGate: [37.96, 48.06], shearK: 1.4, etaLo: 7.48, etaHi: 27.33,
    vpLat: 0.7947, gCrit: 0.1106, ri: { haz: 0.01622 }, etHaz: { b0: -6.945 }, latGate: [6.113, 13.11], tdMargin: 0.04976, act: { seasSd: 0.3174 },
    envB: { rh: 0.1454, shear: 0.1722, sst: 0.2079, sstAbs: 0.04395 }, enso: { act: 0.07855, lon: 0.6724, lat: -0.8416 },
  },
  aus: {
    genGate: { lat: [4.2, 8.9] }, vpScale: 0.9395, kUp: 0.02754, kDn: 0.5022, sstGate: [20.87, 23.4], rhGate: [45.15, 55.25], shearK: 3.864, etaLo: 20.46, etaHi: 26.97,
    vpLat: 0.6091, gCrit: 0.09526, ri: { haz: 0.06613 }, etHaz: { b0: -7.438 }, latGate: [8.42, 15.42], tdMargin: 0.1675, act: { seasSd: 0.1257 },
    envB: { rh: 0.1025, shear: 0.1214, sst: 0.1465, sstAbs: 0.03097 }, enso: { act: 0.116, lon: -4.088, lat: 0.6667 },
  },
};
/* ==== BASIN PARAMS END ==== */
const BASINS = {
  atlantic:    { label: 'Atlantic', menu: 'atlantic', scale: 'nhc', inv: { w: 'L', e: 'L', at: 0 }, seasonMonth: 0, waves: true, hurricane: 'hurricane', lowLat0: 18, mdr: { lat: [10, 20], lon: [-80, -20] }, names: { type: 'yearly', base: 2021, lists: NAME_SETS, extra: NAME_SUPPLEMENTAL, verified: false }, params: BASIN_PARAMS.atlantic },
  eastpacific: { label: 'Eastern Pacific', menu: 'epac', scale: 'nhc', inv: { w: 'C', e: 'E', at: -140 }, seasonMonth: 0, waves: false, hurricane: 'hurricane', lowLat0: 8, mdr: { lat: [8, 18], lon: [-125, -95] }, names: { type: 'yearly', base: 2020, lists: EP_SETS, extra: EP_EXTRA, west: { lon: -140, seq: CP_NAMES, start: 5 }, verified: false }, params: BASIN_PARAMS.eastpacific },
  westpacific: { label: 'Western Pacific', menu: 'wpac', scale: 'jtwc', inv: { w: 'W', e: 'W', at: 0 }, seasonMonth: 0, waves: false, hurricane: 'typhoon', lowLat0: 5, mdr: { lat: [8, 20], lon: [130, 165] }, names: { type: 'seq', list: WP_NAMES, start: 61, verified: false }, params: BASIN_PARAMS.westpacific },
  nio:         { label: 'North Indian Ocean', menu: 'nio', scale: 'imd', inv: { w: 'A', e: 'B', at: 78 }, seasonMonth: 0, waves: false, hurricane: 'cyclone', lowLat0: 5, mdr: { lat: [8, 18], lon: [60, 95] }, names: { type: 'seq', list: NI_NAMES, start: 26, verified: false }, params: BASIN_PARAMS.nio },
  aus:         { label: 'Australian Region', menu: 'aus', scale: 'bom', inv: { w: 'S', e: 'P', at: 135 }, seasonMonth: 6, waves: false, hurricane: 'cyclone', lowLat0: 5, mdr: { lat: [-18, -8], lon: [105, 150] }, names: { type: 'seq', list: AU_NAMES, start: 0, verified: false }, params: BASIN_PARAMS.aus },
  swio:        { label: 'South-West Indian Ocean', menu: 'swio', scale: 'mfr', inv: { w: 'S', e: 'S', at: 0 }, seasonMonth: 6, waves: false, hurricane: 'cyclone', lowLat0: 5, mdr: { lat: [-20, -8], lon: [50, 90] }, names: { type: 'yearly', base: 2021, lists: SW_SETS, extra: NAME_SUPPLEMENTAL, verified: false }, params: BASIN_PARAMS.swio },
  spac:        { label: 'South Pacific', menu: 'spac', scale: 'fiji', inv: { w: 'P', e: 'P', at: 0 }, seasonMonth: 6, waves: false, hurricane: 'cyclone', lowLat0: 5, mdr: { lat: [-20, -8], lon: [160, 210] }, names: { type: 'seq', list: SP_NAMES, start: 0, verified: false }, params: BASIN_PARAMS.spac },
  satl:        { label: 'South Atlantic', menu: 'satl', scale: 'satl', inv: { w: 'Q', e: 'Q', at: 0 }, seasonMonth: 6, waves: false, hurricane: 'cyclone', lowLat0: 15, mdr: { lat: [-32, -20], lon: [-50, -30] }, names: { type: 'seq', list: SA_NAMES, start: 12, verified: false }, params: BASIN_PARAMS.satl },
  med:         { label: 'Mediterranean', menu: 'med', scale: 'med', inv: { w: 'M', e: 'M', at: 0 }, seasonMonth: 6, waves: false, hurricane: 'medicane', lowLat0: 30, mdr: { lat: [34, 40], lon: [0, 25] }, names: { type: 'seq', list: MED_NAMES, start: 0, verified: false }, params: BASIN_PARAMS.med },
};
const basinOf = (id) => BASINS[id] || BASINS.atlantic;
const scaleOf = (id) => SCALES[basinOf(id).scale] || SCALES.nhc;
/* the letter of an invest (the 90-99 numbers a forecaster gives an area under investigation): the agency's basin letter, split in two where the agency splits its basin -- the East Pacific's C west of 140W (Central Pacific),
   the North Indian Ocean's A (Arabian Sea) west of 78E and B (Bay of Bengal) east of it, the southern Indian-Australian S west of 135E and P east of it */
const investLetter = (id, lon) => { const I = basinOf(id).inv; return lon < I.at ? I.w : I.e; };
/* the class of a wind (kt, 1-minute) in a basin's own scale: { idx, short, long }. A subtropical cyclone keeps the subtropical names whatever the region */
function classOf(id, kt, th) {
  const v = round5(kt);
  if (th === 'sc') return v >= 34 ? { idx: 1, short: 'SS', long: 'Subtropical Storm' } : { idx: 0, short: 'SD', long: 'Subtropical Depression' };
  const C = scaleOf(id).classes; let k = 0;
  for (let i = 0; i < C.length; i++) if (v >= C[i][0]) k = i;
  return { idx: k, short: C[k][1], long: C[k][2] };
}
/* the next name for a storm that has just reached 34 kt: a yearly basin takes the index-th name of the season's list (a supplemental list after the last), a sequential one the next in a list that goes on
   from season to season and wraps; the Eastern Pacific names a storm west of 140W from the Central Pacific list */
function stormName(basin, seasonYear, index, cursors, lon) {
  const N = basinOf(basin).names;
  if (N.west && lon != null && lon > -180 && lon < N.west.lon) { const k = cursors.west = (cursors.west == null ? N.west.start : cursors.west + 1); return N.west.seq[k % N.west.seq.length]; }
  if (N.type === 'seq') { const k = cursors.seq = (cursors.seq == null ? N.start : cursors.seq + 1); return N.list[k % N.list.length]; }
  const list = N.lists[(((seasonYear - N.base) % N.lists.length) + N.lists.length) % N.lists.length];
  return index < list.length ? list[index] : N.extra[(index - list.length) % N.extra.length];
}
/* the year a hand-made calendar date belongs to in a basin whose season starts in month `m` (0 = January): a southern-hemisphere season is named for the year it begins in */
const seasonYearOf = (ms, m) => { const d = new Date(ms), y = d.getUTCFullYear(); return d.getUTCMonth() < m ? y - 1 : y; };

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
  ri: {haz: 0.038, hp: 0.6, rate: [1.2, 2.1], rk: 1.5, xLo: 0.8, xHi: 3.8, sst: [25.5, 27.8], pnSst: [27.6, 29.6], shear: 8.609, rh: [44, 58], vLow: [34, 58], vHigh: [135, 160], room: [0.05, 0.22]},
                                                                                      // rh: on the page's humidity scale (the main development region's mean is 54), not the 50-68 of a storm-centred field;
                                                                                      // the values are tools/storm_ri.mjs against the real record (data/generated/atlantic-tc-ri.json): the share of 24-h windows that gain 30 / 50 / 65 / 80 kt, by sea temperature
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
  seedFloor: 3,                                                                // disturbances over the whole box, a year (see structureParams): the Great Lakes, the Mediterranean and the rest of the water the maps know nothing about stay possible
};
let useCalibrated = true;                                                      // the node tests switch it off to check the structure of the physics against its own plain defaults
function defaultParams(basin) {                                                // the calibrated Atlantic physics, patched by the basin's own entry (BASINS[basin].params) when one is asked for
  const base = useCalibrated ? mergeParams(structureParams(), CALIBRATED) : structureParams(), B = basin && BASINS[basin];
  return useCalibrated && B && B.params ? mergeParams(base, B.params) : base;
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
    vpScale: 1,                                           // a basin's own scale of the potential wind (the empirical MPI is the Atlantic's upper envelope; a basin whose warm layer is thinner, or whose page runs warm, takes a little less): BASINS[..].params
    // subtropical systems (relaxed gates, capped intensity)
    sub: { sstGate: [22.0, 25.0], rhGate: [30, 55], shearScale: 26, gCrit: 0.30, kUp: 0.012, vCap: 62 },
    // rapid intensification
    ri: { haz: 0.0075, dur: [12, 36], rate: [0.9, 2.4], cool: 18, sst: [27.4, 29.0], shear: 9, rh: [50, 68],
      hp: 1, rk: 1, xLo: 0, xHi: 0, pnSst: [28.0, 30.0], pnShear: 2.2, pnRh: [52, 64], pnRoom: [0.25, 0.55], vLow: [35, 55], vHigh: [105, 125], room: [0.12, 0.35] },     // vLow / vHigh / room: the wind range an episode can start in and the share of the potential wind that must still be free; hp: the exponent of the conditions in the start rate; rk: the exponent of the draw of the rate (above 1 most episodes are slow and the fast ones rare); xLo / xHi: how much faster an episode can be in a perfect environment (pn, 0-1: warm deep water, no shear, moist air, far from the potential wind)
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
    etHaz: { b0: -6.444, lat: 0.18744, sst: -0.14069, shear: 0.0461, wind: -0.0273, latMin: 20, relief: 0.85 },       // latMin: the top of a ramp that starts 8 degrees below it; relief: how much of the latitude term a perfect tropical environment (perf, below) takes away -- latitude stands in for the baroclinic zone, and where the page says there is none (warm water, no shear, moist air) there is nothing for a storm to be pulled into
    // the other way a tropical cyclone ends poleward of the subtropics: it dissipates (a remnant low or the end of the track, half and half), a weak one far more often than a strong one
    // (the same rows, over water: logit = b0 + lat |lat| + sst SST + shear shear + wind V, applied from 26N to full strength at 30N; the intensity law's own decay does the rest)
    disHaz: { b0: 3.422, lat: 0.07049, sst: -0.18551, shear: 0.01057, wind: -0.11618, lat0: 26, lat1: 30, lowShare: 0.49, age: [12, 36] },       // age: hours as a cyclone over which the exit comes in (a storm that has just formed up there almost never dissipates: 0.3 % per six hours in its first day, 2-3 % afterwards)
    // what the baroclinic zone supports: poleward of ~30N a system is held up by (a weak one grows toward) a wind that rises with the shear of the jet, and a post-tropical cyclone
    // relaxes toward it (the real wind falls 5 kt a day, and one in six gains 10 kt or more within two days: an episode of re-intensification, chance exDeep.p in a strong jet)
    bc: { shear: [20, 60], v: [20, 55], lat: [28, 40], kTc: 1 / 48, exTau: 72 },
    exDeep: { p: 0.35, rate: [0.5, 1.5], dur: [12, 36] },
    // the life of a post-tropical cyclone. It is not given a lifetime: its wind relaxes toward what the baroclinic zone supports times a life-cycle factor (full for `occ[0]` hours after the transition, then the occlusion and
    // the friction wear it down with an e-folding of `occ[1]` hours), and it ends when it has filled (below fill[0] kt for fill[1] hours it is a weak non-tropical low, which then fills as a remnant low does), when it is
    // absorbed (a hazard per hour, 1 / absTau for a weak low in the westerlies, none for one of gale force: absV, absLat; and a merger with a stronger post-tropical or non-tropical low within `mergeD` degrees, chance
    // `mergeP` an hour for the weaker one) or when it is very old (maxAge). Real best tracks stop following them after a median of 30 hours; that is the forecasters stopping, not the low
    ex: { occ: [48, 100], fill: [20, 12], absTau: 36, absV: [22, 38], absLat: [30, 36], mergeD: 3, mergeP: 0.15, maxAge: [240, 336] },
    nlLife: [24, 1.0, 6, 120], nlV: 20,           // a remnant low: lognormal lifetime (real 6 / 12 / 24 / 57 / 84 h) and the wind it hovers at (real 25 kt)
    // translation of a post-tropical cyclone by age (hours since the transition) relative to the all-ages mean of the extratropical map at its place: the 1,654 six-hourly pairs of the 208 named storms of 1980-2024 that
    // became post-tropical (the first row is 3 kt faster to the east and 7 kt faster to the north than the mean at its latitude, 25 kt in all against 19; from three days on it is 8 kt slower east and 5 north)
    exAge: { t: [0, 6, 12, 18, 24, 33, 48, 69, 90], du: [3.3, 3.8, 3.2, 2.3, 2.0, 0.7, -0.9, -2.5, -8.1], dv: [7.2, 5.0, 3.6, 2.7, 0.9, -1.6, -4.1, -5.7, -5.2] },
    // a developing disturbance is subtropical rather than tropical more and more often over cooler water poleward of the tropics (60 % of 197 Atlantic subtropical cyclones formed over water above 25 C, in weak static stability, Guishard et al. 2009):
    // the share of the tropical developments that are subtropical instead is max x ramp(|latitude| lat[0] to lat[1]) x (1 - ramp(sea temperature sst[0] to sst[1])); the number of developments is the same
    subShift: { max: 0.9, lat: [22, 30], sst: [25, 27] },
    exLandMul: 0.25,                              // a baroclinic low does not spin down over land the way a warm-core storm does
    vpLat: 0, vpLatB: [18, 38],                   // the wind a storm can reach falls poleward by up to this share between these latitudes (the real share of tropical rows of 96 kt or more: 13-16 % at 15-25N, 10 % at 25-30N, 4 % at 30-35N, 1.5 % at 35-40N)
    perfEnv: { sst: [25.5, 27.5], shear: 2.2, rh: [52, 64] }, vpRelief: 0.9,  // ... but that fall is the stand-in for everything the page's fields do not carry poleward (upper-level cold air, a trough nearby, the heat content of the sea): where
                                                  // the page says the environment is perfectly tropical -- warm water, next to no shear, moist air: perf = the product of the three ramps, shear in storm-centred kt -- a storm takes most (vpRelief) of
                                                  // it back, and the same index relieves the latitude term of the post-tropical hazard. In the climate of today that is a rare moment in the Caribbean and almost never farther north
    sstAbsUp: 1.3,                                // the growth gate sees the sea relative to the main development region's mean (sstRelW); in a warmed world that would shut every sea that is not as warm as the tropics, so the gate is the more permissive
                                                  // of the relative one and the absolute one (the same ramp, this many degrees warmer): up to about +2 degC of warming the relative gate is the looser, and nothing changes
    decayCap: [0.25, 0.6],                        // kt/h: the soft limit on how fast a tropical cyclone loses wind over water (satur: the rate bends toward it, it is not clamped to it), c0 + c1 (V/60)^2 (real, 24 h north of 33N: -5 kt for 50-80 kt storms, -20 kt for 80 kt and more, -40 kt at the 10th percentile)
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
    lowLat: [14, 18, 45, 50],                     // a tracked low develops like any disturbance, weighted by a ramp up between the first two latitudes and down between the last two (the tropics' own lows are the waves' business; far poleward the sea is cold)
    hazFloor: 2e-6, seedFloor: 0,                 // a development rate no map is zero under (per hour, before E: with a perfect environment a disturbance anywhere over water can develop, at odds of one in a few thousand per disturbance-week), and a
                                                  // supply of disturbances over the whole box (per year, uniform over the water, ids 'F<k>'): together what makes the Great Lakes, the Mediterranean or the South Atlantic possible without making them likely
    eqSoft: 2.5,                                  // degrees: a system never crosses the equator -- a step toward it bends into a soft floor on |latitude| below this (identity poleward of it, see keepSide)
    seedLatMax: 42, endH: 4,                      // a disturbance that is not developing is carried off poleward of this latitude (waveLatMax for a wave), a cold sea does the same: both are hazards with this mean life in hours, not walls
    // ---- the climatology-anchored model (used when the host supplies maps, see prepareMaps) ----------------------------------------------------------------
    // motion: a system moves with the real mean drift of its kind at its place and time of year (maps.drift, from the best track) plus driftGain times the anomaly of
    // the page's steering (averaged over a ring of steerRing degrees round the centre, vortex-free like the annulus the real fit used) from the page's own mean steering
    // (maps.steerClim): the mean tracks, landfalls and recurvature of the real Atlantic, with the sim's weather deciding which way each storm goes this time
    steerRing: 3.0, driftGain: { wv: 0.75, tc: 0.75, sc: 0.75, ex: 0.75, nl: 0.6 }, vGain: 0.85, strongV: [55, 85],       // vGain: the share of the steering anomaly's north-south part that counts (its east-west part counts fully)
    // genesis: a disturbance (an easterly wave, a local seed, a tracked low) develops at the hourly rate maps.haz times E, how much better or worse the environment is than
    // its own mean at that place and time (maps.env0): exp(rh anomaly [%], - shear anomaly [page kt], relative-SST and absolute-SST anomaly), clipped, times soft physical gates
    envB: { rh: 0.03, shear: 0.05, sst: 0.5, sstAbs: 0.2, clip: 1.0 },
    enso: { act: 0, lon: 0, lat: 0 },             // the part of the response to El Nino the page's fields do not carry (env.enso(), Nino 3.4): every development rate is multiplied by exp(act * index) and the places the maps say a disturbance is likely to
                                                  // develop, and the seeds' own places, are moved by (lat, lon) degrees per degree of the index (the real genesis region of the western North Pacific moves 4.7 degrees east per degree: the page's humidity and
                                                  // shear say the opposite of the east of the basin getting better). All zero is the engine without it, bit for bit; the basin calibration (tools/storm_basin_opt.mjs) fits the three
    hazMul: 1,                                    // a multiplier of every development rate (the fitting tools and the lab use it; the shipped value is 1, the maps carry the calibration)
    devGate: [-0.05, 0.15],                       // a disturbance only develops where a depression could live: its growth gate g must exceed gCrit by between these amounts (the rate is zero below the first, full above the second)
    rhSelf: 0, rhSelfV: [30, 65],                 // points of humidity an established storm adds to what the page's field says (a storm moistens its own environment: the page's 2-degree field flips a marginal gate with every dry pocket, and without this a storm in
                                                  // little shear over 28 C water dies of it, 11 % of the simulated named phases ended south of 15 N, real 4.6 %); it comes in between these winds
    tdMargin: 0,                                  // an organising disturbance is only declared a depression while its growth gate (with its own quality) exceeds gCrit by this much: the event pushes the wind to the depression threshold whatever the
                                                  // environment does next, and without this one declared in a place that can not keep it (the humidity it was picked for fades) is a depression for a day and gone (21 % of the numbered ones, real 11 %)
    subSstOK: 19, subCold: 17, seedCold: 22,      // a subtropical disturbance is declared a depression only over water warmer than the first (a ramp of a degree below it); water colder than subCold carries off one that has begun to develop as a subtropical system, and water colder than seedCold
                                                  // one that has not begun to (the Mediterranean's hybrid cyclones form over 15-22 degC: a basin like it lowers all three)
    genGate: { sst: [24.5, 26.5], sstSub: [20.0, 23.5], shear: 28, lat: [8.5, 11.5] }, hazMax: 0.3, devRate: 0.8, devV: 26, devVSub: 36,          // lat: no tropical development close to the equator (the real first-depression latitude has its 5th percentile at 10 N)
    // the large-scale climate the simulated environment does not carry (Atlantic meridional mode, the West African monsoon, the stratosphere, intraseasonal pulses of convection): a random
    // activity factor on every development rate, exp(seasSd z_year + intraSd z(t)) with unit mean: z_year a draw per calendar year, z(t) six sinusoids of 14-60 day periods with random
    // phases (a pure function of the seed and the time). It is what makes some seasons hyperactive and some quiet, and storms cluster in time, as the real ones do
    act: { seasSd: 0.2, intraSd: 0.15, K: 6, T: [14, 60] },
    distOn: 19, distOff: 17, distOnE: 1.2, distOffE: 0.9,                  // the disturbance stage of a wave or seed (wind, kt, with hysteresis) and of a tracked low (development rate relative to its place's mean)
    seedV: [14, 20], lifeN: [48, 144], distV: [14, 22], seedMul: 1, waveLatMax: 32,          // an easterly wave that has not developed by 32N is no longer one (it has become a trough)
    // the outlook (Manager.prototype.outlook): the areas of interest and their chances of formation in 2 and 7 days. Nothing here is fitted to data -- these are the choices of how a forecast is made and drawn
    outlook: {
      horizon: 168, step: 3, minP7: 10, maxAreas: 10,                              // hours ahead, the time step of the forecast track (hours), the least 7-day chance drawn (percent), the most areas
      tdShare: 0.92, tdHold: 7,                                                   // the share of development events that become a depression, and the hours the new depression's wind must hold (genHold) on top of the time it takes to rise to devV
      anomTau: { sst: 720, rh: 480, shear: 480, steer: 72 },                      // hours: the anomaly of a field from its own climate that the forecast keeps, decaying to the climate (a persistence forecast: the weather beyond the next keyframe is not known to it; the places where conditions are good stay where they are as a disturbance moves toward them)
      lowLife: 60,                                                                // hours: the mean remaining life of a tracked low
      r0: 1.2, r1: 0.6, rUnborn: 1.5,                                             // the area's radius (degrees of latitude): at the start, per day ahead, and extra for a system that does not exist yet
      win: [0.1, 0.9], maxSpan: 96, maxLen: 14, gap: 0.5, minArea: 4, favP2: [0.015, 0.03], onsetP: 0.025, cred: [6, 0.5, 12], arrowMin: 2.5, arrowMax: [30, 36],   // the area covers the 10th to 90th percentile of the formation time but no more than maxSpan hours and maxLen degrees of track; two areas keep gap degrees apart (the younger gives way) and none is drawn smaller than minArea square degrees; the X sits inside the area only while the 2-day chance is not 0 -- nothing is expected from it in two days is a disturbance not yet in favourable conditions, and it is not in its shape yet -- (the chance of formation in 2 days, as a share, below the first value of favP2 takes the X out of its shape, above the second puts it back: a hysteresis), and then an arrow (at least arrowMin and at most arrowMax degrees long, the second value of arrowMax once there is one) points from it to where the chance starts to build up, the place of its track when the chance of formation has reached onsetP; an arrow that stays for more than cred[0] issues in a row has said that conditions will improve ahead of the disturbance for that long and has not been right (on the real engine, after 9 issues the 7-day chance it gave was 0.46 and what happened 0.24): its chances are multiplied by a credibility that falls to cred[1] over the next cred[2] issues
      rise: 20, fall: 20, firstP7: 40, firstP2: 30, morph: 0.3, maxMove: 2, maxGrow: 0.5, memH: 30,   // between two issues a chance moves by no more than rise / fall (percent), a shape the share morph of the way to the new forecast (the rest is the last issue's, carried with its disturbance) and at most maxMove degrees (its radius maxGrow); a disturbance seen for the first time starts no higher than firstP7 / firstP2; an issue older than memH hours is not what the next one moves on from
      lead: { W: [48, 168, 0], N: [12, 120, 0.3], F: [12, 120, 0.3] },           // how many hours before it exists a forecaster sees a system coming: shortest, longest, and the share nobody sees coming
      cls: [35, 60],                                                              // an area is low (yellow) up to this 7-day chance, medium (orange) up to the next, high (red) above
    },
    // the ensembles (Manager.prototype.ensemble): members that start from the same system and see a slightly different weather; every size below is for a predictability factor of 1 (see ensFactor)
    ens: {
      n: 24, horizon: 168,                                                         // members and hours ahead (the look-ahead of the page's own weather is 174 h)
      f: [0.75, 0.3, 25, 80], wv: 1.6,                                            // predictability factor: for a depression or weak storm, for a hurricane, and the wind (kt) between which it falls from one to the other (a strong storm is steered by the deep flow and is the better forecast); wv: a wave, low or disturbance is worse again, this many times that
      common: 0.4,                                                                 // every member also shares one forecast error (the analysis and the model are wrong the same way for all of them): its size in members' sizes -- a fan's centre is sometimes wrong
      pos: 0.1, dv: 5,                                                            // the error of the starting position (degrees) and wind (kt) of a member
      disp: [0.4, 5, 1.2],                                                      // the features the steering is read from are shifted by a member-specific amount: sd (degrees) at the start, and the growth to a week with lead (power of lead / 168 h)
      vec: [1.3, 0.6],                                                             // the steering error (kt, a speed and direction error that changes slowly): sd at the start and growth to a week
      shear: 0.25, sst: 0.4, rh: 4, ramp: 48,                                      // the weather the storm feels: shear x (1 + e), sea temperature (C) and humidity (points), reaching full size after ramp hours
      foot: [0.6, 1.4],                                                            // the track density: the radius (degrees) round a member's track that counts as "there", at the start and at a week
    },
    // the wind field (stepWind, windAt, windRadii). Three slow quantities of their own and a profile: the mean 34 kt radius R34 (nmi) follows the latitude, the storm's own size (a slow draw: size is almost independent of intensity, r about 0.3,
    // Merrill 1984, Chavas and Emanuel 2010), only weakly the intensity (R34 ~ V^0.42), its age and the eyewall replacement cycles and the transition that grow it; Rmax follows the intensity, the latitude and the storm's size (Willoughby et
    // al. 2006, Chavas and Knaff 2022), contracts in rapid intensification and jumps in an eyewall replacement; outside Rmax the wind falls as a power law V = Vmax (Rmax / r)^x, x fixed by Vmax at Rmax and 34 kt at R34 (so R64 and R50 follow
    // the intensity and the eyewall, not a fixed share of R34), steeper beyond R34. The wind at a point is the profile plus a share of the storm's speed on its right-front side; the radii are the roots of that same function
    wind: {
      r0: 76, latSlope: 0.021, lat0: 15,                                         // R34 of a 55-kt storm: 76 nmi at 15 degrees, growing 2.1 % a degree poleward of it
      kv: 0.42, tau: 36,                                                         // the share of the intensity change R34 follows (R34 ~ V^0.42) and how fast (hours): the 34 kt field is the slow one
      sd: 0.34, szTau: 60, aqSd: 0.10, aqTau: 36,                               // the size anomaly (log, sd) and its memory (hours); the anomalies of the four quadrants and theirs
      age: [0.18, 168],                                                          // a storm's field grows as it ages (outer winds spin up after the peak): up to +18 % (log), with this time constant (hours)
      land: 0.35, nlBase: -0.2,                                                  // landfall takes this much (log) at full land (the outer winds spin down slower than the core); a remnant low is smaller
      ex: { T: 60, g0: 0.15, g1: 0.45, gSd: 0.25, rm: 0.5, tau: 36 },            // a post-tropical cyclone grows over T hours toward a size gain (log) g0 + g1 (jet shear share) + noise, a minority smaller; its eyewall (Rmax) grows by this share more
      rm: [24, -0.011, 0.012], rmCap: [6, 70, 95], rmSz: 0.4, rmTau: 12, rmRI: -0.16,      // Rmax (nmi) = 24 exp(-0.011 (V - 60) + 0.012 (|lat| - 20)) x (R34 / its climate)^rmSz, between 6 and 70 (95 post-tropical), relaxing over rmTau hours; contracts by rmRI (log) in rapid intensification
      xMin: 0.12, xMax: 1.3, xOut: 0.6, nIn: 1.0,                                // the outer exponent's limits, the steeper exponent beyond R34, the inner power law's exponent
      asym: [0.35, 0.5],                                                         // the right-front side's lead: this share of the storm's speed (kt) added to the wind there (Shapiro 1983: about a half), at most this share of the wind
      pSz: 6, pErc: 0.5,                                                         // central pressure: this many hPa lower per e-fold of R34 (a larger storm has a lower pressure for the same wind, Kossin 2015), and this share of an eyewall replacement's wind loss does not show in it
      // the eyewall replacement cycle (stepErc). A hurricane that has held 90 kt or more for half a day or so, over warm water and not on land or in rapid intensification, forms a secondary eyewall at a rate (per hour) rate x g; the cycle is
      // three phases (Sitkowski, Kossin and Rozoff 2011): the outer eyewall forms (d0 hours: the inner one contracts), the inner one weakens as the outer takes over (d1 hours: the wind falls by `loss` kt, about 10 m/s on average, Rmax jumps to rmx
      // times, the 34 kt field grows by sz), and the storm re-intensifies (d2 hours: it takes back rec of the loss, Rmax contracts to rm2 of its peak value). The wind loss fades over tDef hours, the larger eye over tRm, the larger field over tSz
      erc: { rate: 0.08, vR: [76, 102], hi: [6, 14], sst: [25.5, 27.5], shear: 2.5, land: [0.05, 0.25], cool: [36, 84], d0: [6, 12], d1: [12, 24], d2: [12, 30], loss: [19, 7, 8, 38], rec: [0.7, 1.0], rmx: [1.8, 2.8], rm0: 0.85, rm2: 0.7, sz: [0.10, 0.18], tDef: 36, tRm: 48, tSz: 96 },
    },
    // what a storm does to a city (Manager._impacts, impactOf). The wind a city has is the profile's (windAt) at nine points of a 3 x 3 grid round it, over land a little less (friction) with a gust on top; the rain is a
    // symmetric profile (Lonfat et al., Tuleya et al.: about 3 mm/h at the core of a tropical storm, above 15 mm/h at that of a major hurricane, under 1 mm/h beyond 200 km) summed over the hours the storm stays (a slow storm rains
    // longer), lifted by the mountains near the city; the surge is a proxy (the sim has none) from the onshore wind and the size of the storm on a coast. Damage is Emanuel's cubic law of the wind above a threshold, a law of the rain
    // above a few inches and a law of the surge, together; deaths are three terms (surge, rain, wind: the shares of the real record) and injuries follow them. An event is a storm's visit: it opens when the local wind or rain
    // reaches on[0] kt or on[1] in/h and closes on[2] hours after the last; its damage then heals over recover.max days at the worst (damage of a fraction d of the city takes max x sqrt(d / d0) days, at least min): not at all
    // for the first lag of that time, injuries three tenths as long, deaths stay until the end and then the record goes
    impact: {
      reach: [1.5, 90], grid: 0.2, fric: [0.92, 0.85], gust: [1.23, 1.36, 1.49], on: [25, 0.04, 12],
      wind: { vt: 25.7, vh: [92, 80, 68, 58], scale: 1 }, cap: [380, 90, 35, 12],
      rain: { v: [20, 35, 50, 75, 100, 130], pk: [0.05, 0.12, 0.25, 0.5, 0.75, 1.0], core: 1.2, e: 0.3, asym: 0.35, max: 3 },
      flood: { r0: 5, k: 0.0001, p: 1.7, max: 0.15, vul: [1, 1.2, 1.5, 2] },
      surge: { s0: 3, ref: 100, size: 110, share: 0.2, shareMax: 0.6, back: 0.25, up: 21 },
      deaths: { mult: [1, 3, 8, 25], surge: 0.07, ps: 2.5, flood: 3.1e-6, r1: 8, rs: 15, wind: 4.8e-5, sd: 0.45, inj: [6, 6, 5, 4], injW: 3e-5 },
      recover: { max: 200, d0: 0.4, p: 0.5, min: 2, lag: 0.1, inj: 0.3, keep: 12, min0: 2e-5 },
    },
    // watches and warnings (alertsOf), the NHC's: a warning is for conditions EXPECTED within 36 hours of the onset of tropical-storm-force winds, a watch for conditions POSSIBLE within 48; a cell the forecast's wind radius reaches (expected: plus
    // mExp of the cone's error circle [its share, nmi added], possible: plus mPos) gets one; once there, one stays while the threat is anywhere in the next keepH hours; a post-tropical cyclone's large field makes a high wind warning (hwwH hours ahead, kept to hwwKeep)
    alerts: { cell: 0.125, warnH: 36, watchH: 48, keepH: 72, mExp: [0.5, 10], mPos: [1.1, 25], hwwH: 24, hwwKeep: 48, hwwM: 0.3 },
    // the cone of uncertainty (coneOf): the NHC's mean track errors (nautical miles) by hour, a circle of that size round each forecast point; the points; how far a new cone moves from the last one
    cone: { h: [0, 12, 24, 36, 48, 60, 72, 96, 120], nmi: [8, 26, 41, 55, 70, 88, 102, 151, 220], pts: [12, 24, 36, 48, 72, 96, 120], blend: [6, 36, 0.5], minAlive: 0.5 },
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
function lowWeight(par, lat) { const L = par.lowLat; return smooth01(lat, L[0], L[1]) * (1 - smooth01(lat, L[2], L[3])); }          // how much a tracked low at this latitude counts as a precursor (a ramp up and a ramp down, no window)
function mapAt(M, arr, tw, lat, lon) { return bil(arr, tw.m0 * M.n, M, lat, lon) * (1 - tw.t) + bil(arr, tw.m1 * M.n, M, lat, lon) * tw.t; }
function hazAt(par, M, arr, tw, lat, lon, sh) { return Math.max(sh ? mapAt(M, arr, tw, lat - sh[0], lon - sh[1]) : mapAt(M, arr, tw, lat, lon), par.hazFloor || 0); }           // the development rate of the map, and never less than the floor: no place is impossible, only unlikely
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
  return growthG(par, G, sub, par.devV, sstG, rh, shear / par.shearK, alat, sShift, latD, sst);
}
function devGateOf(par, sub, g) { const G = sub ? par.sub : par; return smooth01(g, G.gCrit + par.devGate[0], G.gCrit + par.devGate[1]); }          // the share of its development rate a disturbance keeps, from its place's growth gate g
function devGateAt(par, env, sub, lat, sst, rh, shear, doy, dSst) { return devGateOf(par, sub, devGrowth(par, env, sub, lat, sst, rh, shear, doy, dSst)); }

/* the activity factor (see par.act): 1 on average, a pure function of the seed, the season's year (the calendar year where the season is one; a southern season is named for the year it starts in, so it does not change in January) and the hour */
function activityFactor(par, seed, year, h) {
  const A = par.act; if (!A || (A.seasSd === 0 && A.intraSd === 0)) return 1;
  let zt = 0; const d = h / 24;
  if (A.intraSd) { for (let k = 0; k < A.K; k++) { const T = A.T[0] * Math.pow(A.T[1] / A.T[0], A.K > 1 ? k / (A.K - 1) : 0); zt += Math.cos(2 * Math.PI * d / T + 2 * Math.PI * rnd(seed, 7002, k, ST.ACT)); } zt *= Math.sqrt(2 / A.K); }
  return Math.exp(A.seasSd * rndn(seed, 7001, year, ST.ACT) + A.intraSd * zt - 0.5 * (A.seasSd * A.seasSd + A.intraSd * A.intraSd));
}

/* the El Nino part of par.enso for this hour: the development rates' extra factor (into ctx.act) and the shift of the maps' places (ctx.shift = [lat, lon] degrees, or null); nothing at all when the parameter is zero or the host has no index */
function ensoOf(par, env, ctx) {
  const E = par.enso; ctx.shift = null;
  if (!E || !(E.act || E.lon || E.lat) || !env || !env.enso) return;
  const z = env.enso(); if (!(z === z)) return;
  if (E.act) ctx.act = (ctx.act || 1) * Math.exp(E.act * z);
  if (E.lon || E.lat) ctx.shift = [E.lat * z, E.lon * z];
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
  return MS_KT * ms * par.vpScale * (par.etaMin + (1 - par.etaMin) * smooth01(sstE, par.etaLo, par.etaHi));
}

/* the growth gate of the intensity law: how well the environment supports a system of wind V, 0..1 (before the seed's own quality and the mature-storm boost). The same function the
   law uses every hour and the genesis rule uses to refuse a depression an environment it could not live in. shT is the storm-centred shear (page shear / shearK). */
function sstGateAt(par, G, sstG, sstA, sShift) {                    // the sea-temperature gate: the more permissive of the one relative to the main development region (sstG) and the absolute one (sstA, shifted warmer by sstAbsUp)
  const rel = smooth01(sstG, G.sstGate[0] - sShift, G.sstGate[1] - sShift);
  if (sstA == null || !par.sstAbsUp) return rel;
  return Math.max(rel, smooth01(sstA, G.sstGate[0] - sShift + par.sstAbsUp, G.sstGate[1] - sShift + par.sstAbsUp));
}
function growthG(par, G, sub, V, sstG, rh, shT, alat, sShift, latD, sstA) {
  const sEff = shT / (1 + par.shearVMod * smooth01(V, 30, 100));
  const gSh = 1 / (1 + Math.pow(sEff / (G.shearScale * Math.max(0.15, 1 + par.shLat * latD)), par.shearPow));          // (the floor: a storm that drifts south of 4 N would otherwise get a negative scale and a NaN)
  const gS = sstGateAt(par, G, sstG, sstA, sShift), gR = smooth01(rh, G.rhGate[0] + par.rhLat * latD, G.rhGate[1] + par.rhLat * latD), gL = sub ? 1 : smooth01(alat, par.latGate[0], par.latGate[1]);
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
    q: o.q || 0, dist: false, invest: '', ck: '', shSm: null, rhSm: null, cw: 0, ri: null, riCoolUntil: -1, riTotal: 0, onLand: false, genCount: 0, lowCount: 0, landLow: 0, convCount: 0, nlTill: -1,
    exDeep: 0, exEp: null, exLift: 0, ux: 0, uy: 0, etAt: -1, remnant: false, erc: null, ercDef: 0, ercRm: 0, ercSz: 0, ercCool: -1, ercN: 0, ercPh: '', hiH: 0, alive: true, end: null, endReason: '', depNum: 0, name: '', tdHour: -1, namedHour: -1,
    peakV: 0, peakP: 1020, peakHour: -1, ace: 0, season: 0, fixes: [], st: 'WV', lastShear: 15, lastRh: 50, lastSst: 27, lastLf: 0, kill: false, lfs: [], lp: null,
  };
}
function statusOf(S) {
  const v = round5(S.vr);
  switch (S.th) {
    case 'wv': return S.dist ? 'DB' : S.kind === 'N' ? 'LO' : 'WV';              // a wave or a low that has the potential to become a cyclone (S.dist) is a disturbance; the same system, one stage on
    case 'tc': return v >= 64 ? 'HU' : v >= 34 ? 'TS' : 'TD';
    case 'sc': return v >= 34 ? 'SS' : 'SD';
    case 'ex': return 'EX';
    default: return 'LO';
  }
}

/* the equator is not crossed: a system keeps its hemisphere. The meridional step bends into a soft floor on |lat| below `a` degrees (x >= a is untouched, bit for bit; below it the position
   approaches the equator only asymptotically, positive for any step -- a ramp, not a wall); whatever is stuck there spins down by the growth gate's own latitude edge and ends */
const softFloor = (x, a) => (x >= a ? x : a * Math.exp((x - a) / a));                  // x itself from a up; below it x bends over toward zero, never reaching it
function keepSide(lat, dy, a) {
  const hs = lat < 0 ? -1 : 1;
  return hs * softFloor(hs * (lat + dy), a);
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
/* the probability that a tropical or subtropical cyclone at |lat| over sea of temperature sst, in page shear `shear` and with wind v, becomes post-tropical within six hours; perf (0-1) is how perfectly
   tropical its environment is (see perfEnv): the latitude term is the stand-in for the baroclinic zone and a perfect environment takes etHaz.relief of it away. The hazard is a ramp from latMin - 8 degrees up, not a wall at latMin */
function etHazard6(par, alat, sst, shear, v, perf) {
  const E = par.etHaz, ramp = smooth01(alat, E.latMin - 8, E.latMin);
  return ramp <= 0 ? 0 : ramp / (1 + Math.exp(-(E.b0 + E.lat * alat * (1 - (E.relief || 0) * (perf || 0)) + E.sst * sst + E.shear * shear + E.wind * v)));
}
/* the probability of the other exit, dissipation over water (a remnant low, or the track simply ends), within six hours */
function disHazard6(par, alat, sst, shear, v, age, lf) {
  const D = par.disHaz, f = smooth01(alat, D.lat0, D.lat1) * smooth01(age == null ? 1e9 : age, D.age[0], D.age[1]) * (1 - smooth01(lf || 0, 0.2, 0.5));          // (over land the intensity law's decay and the weak-storm rule end a cyclone: the water hazard fades out with the share of land)
  return f <= 0 ? 0 : f / (1 + Math.exp(-(D.b0 + D.lat * alat + D.sst * sst + D.shear * shear + D.wind * v)));
}
/* the share of tropical developments over water of this temperature at this latitude that are subtropical instead (par.subShift) */
function subShare(par, alat, sst) { const Z = par.subShift; return Z.max * smooth01(alat, Z.lat[0], Z.lat[1]) * (1 - smooth01(sst, Z.sst[0], Z.sst[1])); }
/* the fastest a tropical cyclone of wind V loses wind over water, kt per hour: a soft limit (the rate bends toward c0 + c1 (V/60)^2 and never reaches it; real, 24 h north of 33N: -5 kt for 50-80 kt storms, -20 kt for 80 kt and more) */
function decayLimit(par, x, V) { return satur(x, par.decayCap[0] + par.decayCap[1] * (V / 60) * (V / 60)); }
/* piecewise-linear table lookup, held at the ends */
function tableAt(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x < xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
  return ys[ys.length - 1];
}
/* lifetimes are lognormal (median, log-sd, minimum, maximum); the draw is a pure function of the system and the hour */
function lifetimeH(L, seed, id, h, stream) { return Math.max(L[2], satur(L[0] * Math.exp(L[1] * rndn(seed, id, h, stream)), L[3], 4)); }       // (the long end bends toward L[3], the short end is the least a system lasts)
/* a tropical or subtropical cyclone becomes post-tropical at the end of hour h: it keeps its wind and position, and gets the growth and the life cycle (and, in a strong jet, the chance of a
   re-intensification episode) of an extratropical cyclone */
function becomePostTropical(S, h, seed, par, shear) {
  S.th = 'ex'; S.etAt = h + 1; S.lowCount = 0; S.erc = null; S.ercPh = ''; S.nlTill = -1; S.exLowH = 0;
  { const X = par.wind.ex; S.exG = Math.max(-0.1, X.g0 + X.g1 * smooth01(shear, 15, 50) + X.gSd * rndn(seed, S.num, h, ST.EXG)); }
  const D = par.exDeep;
  if (rnd(seed, S.num, h, ST.ETD) < D.p * smooth01(shear, 20, 50)) {
    const dur = D.dur[0] + (D.dur[1] - D.dur[0]) * rnd(seed, S.num, h, ST.ETS), rate = D.rate[0] + (D.rate[1] - D.rate[0]) * rnd(seed, S.num, h + 7919, ST.ETS);
    S.exEp = { t0: h + 1 + Math.floor(6 * rnd(seed, S.num, h + 104729, ST.ETS)), dur, rate };
  }
}
function becomeRemnantLow(S, h, seed, par) { S.th = 'nl'; S.remnant = true; S.erc = null; S.ercPh = ''; S.nlTill = h + 1 + lifetimeH(par.nlLife, seed, S.num, h, ST.LIFE); }
/* ---- the wind field ------------------------------------------------------------------------------------------------------------------------------------------------------
   A storm's wind field is a profile, three slow quantities and a few episodes. The profile: outside the radius of maximum wind (Rmax) the wind falls as a power law, V = Vmax (Rmax / r)^x, with x fixed by the two things a forecaster
   knows -- Vmax at Rmax and 34 kt at R34 (so a stronger storm has a larger R64 / R34, and an eyewall that moves out moves the 64 kt radius more than the 34 kt radius, as the best tracks show) -- and steeper beyond R34 where the vortex
   dies away; inside Rmax the wind rises about linearly to the eyewall. The storm's own motion adds a share of its speed on its right-front side (the left-front in the south) and takes it away on the other: the wind at a point is the profile plus
   that, and the radii of the 34, 50 and 64 kt winds in the four quadrants are the roots of that same function (windAt, windRadii), so the picture, the watches and warnings and the cities never disagree.
   The slow quantities: the 34 kt radius R34 follows the latitude, the size this storm happens to have (a slow draw: size is almost independent of intensity), only weakly the intensity (R34 ~ V^0.42), the age (outer winds spin up after the peak) and the
   episodes below; Rmax follows the intensity, the latitude and the storm's size, contracts in rapid intensification and jumps in an eyewall replacement; the quadrants have anomalies of their own. The episodes: an eyewall replacement cycle (stepErc: the wind
   dips by about 10 m/s while Rmax jumps out, the hurricane-force radius and the 34 kt field grow and stay grown, then the wind comes back) and a post-tropical cyclone's growth (the large fields of the extratropical lows, reached over a day or two). */
const sm3 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const sizeClim = (par, alat) => Math.log(par.wind.r0) + par.wind.latSlope * Math.max(0, alat - par.wind.lat0);           // ln R34 (nmi) of a 55 kt storm of an ordinary size at this latitude
const rmaxBase = (par, V, A) => par.wind.rm[0] * Math.exp(par.wind.rm[1] * (V - 60) + par.wind.rm[2] * (A - 20));       // Rmax (nmi) before the storm's own size, eyewall and episodes
const exGrowth = (S, par, h) => { const X = par.wind.ex; if (S.th !== 'ex' || !(S.etAt >= 0)) return 0; return (S.exG === undefined ? X.g0 + 0.3 * X.g1 : S.exG) * sm3((h - S.etAt) / X.T); };     // the log growth of a post-tropical cyclone's 34 kt field so far
/* the size this storm has beyond what its latitude and intensity give any storm (log): what Rmax and the central pressure take from it */
const sizeAnom = (S, par, alat) => (S.lr === undefined ? 0 : S.lr - sizeClim(par, alat) - par.wind.kv * Math.log(Math.max(S.vr + (S.ercDef || 0), 30) / 55));
function stepWind(S, par, seed, h, alat, lf) {
  const W = par.wind;
  if (S.th === 'wv') { S.w = null; return; }
  if (S.rs === undefined) { S.rs = W.sd * rndn(seed, S.num, 0, ST.SIZE); S.rq = [0, 1, 2, 3].map((q) => W.aqSd * rndn(seed, S.num, 4 + q, ST.SIZEQ)); }
  const a = Math.exp(-1 / W.szTau), b = Math.exp(-1 / W.aqTau);
  S.rs = a * S.rs + Math.sqrt(1 - a * a) * W.sd * rndn(seed, S.num, h, ST.SIZE);
  for (let q = 0; q < 4; q++) S.rq[q] = b * S.rq[q] + Math.sqrt(1 - b * b) * W.aqSd * rndn(seed, S.num, h * 4 + q, ST.SIZEQ);
  const Vu = S.vr + (S.ercDef || 0), age = Math.max(0, h - (S.tdHour >= 0 ? S.tdHour : S.born));
  const clim = sizeClim(par, alat);
  const target = clim + (S.th === 'nl' ? W.nlBase : 0) + exGrowth(S, par, h) + S.rs + W.kv * Math.log(Math.max(Vu, 30) / 55) + W.age[0] * (1 - Math.exp(-age / W.age[1])) + (S.ercSz || 0) - W.land * lf;
  S.lr = S.lr === undefined ? target : S.lr + (target - S.lr) / W.tau;
  const cap = S.th === 'ex' ? W.rmCap[2] : W.rmCap[1];
  const lt = clamp(Math.log(rmaxBase(par, Vu, alat)) + W.rmSz * sizeAnom(S, par, alat) + (S.ercRm || 0) + (S.ri ? W.rmRI : 0) + (S.th === 'ex' && S.etAt >= 0 ? W.ex.rm * sm3((h - S.etAt) / W.ex.T) : 0), Math.log(W.rmCap[0]), Math.log(cap));
  S.rm = S.rm === undefined ? lt : S.rm + (lt - S.rm) / W.rmTau;
  const R = windRadii(S, par), m = (k) => Math.round((R[k][0] + R[k][1] + R[k][2] + R[k][3]) / 4);
  S.w = R.r34.some((x) => x > 0) ? [m('r34'), m('r50'), m('r64')] : [0, 0, 0];
}
/* the profile of a system: its wind and Rmax, R34, the exponents, and the lead its motion gives the right-front side */
function windProfile(S, par, A) {
  const W = par.wind, V = Math.max(S.vr, 1), alat = A == null ? Math.abs(S.lat) : A, cap = S.th === 'ex' ? W.rmCap[2] : W.rmCap[1];
  const rmax = S.rm !== undefined ? clamp(Math.exp(S.rm), W.rmCap[0], cap) : clamp(rmaxBase(par, V, alat), W.rmCap[0], cap);
  const r34 = clamp(S.lr !== undefined ? Math.exp(S.lr) : Math.exp(sizeClim(par, alat) + W.kv * Math.log(Math.max(V, 30) / 55)), 1.05 * rmax, 700);
  const spd = Math.hypot(S.cx || 0, S.cy || 0), dmax = Math.min(W.asym[1] * V, W.asym[0] * spd), Vs = V - dmax;
  const x = Vs > 34.5 ? clamp(Math.log(Vs / 34) / Math.log(r34 / rmax), W.xMin, W.xMax) : 0.5;
  return { V, Vs, dmax, spd, rmax, r34, x, xo: Math.max(x, W.xOut), n: W.nIn, vr34: Vs * Math.pow(rmax / r34, x) };
}
function profileAt(P, r) {                                                      // the symmetric part of the wind (kt) at r nmi from the centre
  if (r <= P.rmax) return P.Vs * Math.pow(Math.max(r, 0) / P.rmax, P.n);
  if (r <= P.r34) return P.Vs * Math.pow(P.rmax / r, P.x);
  return P.vr34 * Math.pow(P.r34 / r, P.xo);
}
function profileRoot(P, v) {                                                    // the radius where the symmetric wind falls to v (kt): 0 where it is never as strong
  if (!(P.Vs > v) || v <= 0) return 0;
  return v >= P.vr34 ? P.rmax * Math.pow(P.Vs / v, 1 / P.x) : P.r34 * Math.pow(P.vr34 / v, 1 / P.xo);
}
const heading = (S) => (Math.atan2(S.cx || 0, S.cy || 0) / DEG + 360) % 360;
/* the four quadrant values [NE, SE, SW, NW] (centres at 45, 135, 225, 315 degrees) smoothly interpolated at an azimuth (degrees clockwise from north) */
function quadAt(arr, az) { const k = (((az % 360) + 360) % 360 - 45) / 90, i = Math.floor(k), f = k - i, i0 = ((i % 4) + 4) % 4; return arr[i0] + (arr[(i0 + 1) % 4] - arr[i0]) * f * f * (3 - 2 * f); }
/* the sustained wind (kt, 1-minute) a system gives a point: the profile plus the lead of the right-front side (it fades beyond twice R34, where the roots of the radii never go), at the radius stretched by the quadrant anomalies */
function windAt(S, par, lat, lon, P) {
  P = P || windProfile(S, par, null);
  const k = Math.cos(((lat + S.lat) / 2) * DEG), dx = (lon - S.lon) * 60 * k, dy = (lat - S.lat) * 60, r = Math.hypot(dx, dy), az = (Math.atan2(dx, dy) / DEG + 360) % 360;
  const rf = heading(S) + (S.lat < 0 ? -60 : 60), d = P.dmax * Math.cos((az - rf) * DEG) * Math.min(1, r / P.rmax) * (1 - sm3((r - 2 * P.r34) / (2 * P.r34)));
  const rr = r / Math.exp(S.rq ? quadAt(S.rq, az) : 0);
  return Math.max(0, profileAt(P, rr) + d);
}
/* the mean radii [R34, R50, R64] and Rmax (nmi) of a system's symmetric profile, or null where it has no 34 kt winds (the radii by quadrant are windRadii) */
function windScale(S, par, alat) {
  const V = S.vr;
  if (S.lr === undefined || !(V > 34.5)) return null;
  const P = windProfile(S, par, alat), fd = (v) => Math.max(P.rmax, profileRoot(P, v)) * smooth01(P.V, v, v + 4);
  const r34 = P.r34 * smooth01(V, 34, 38), r50 = Math.min(fd(50), r34);
  return [r34, r50, Math.min(fd(64), r50 || r34), P.rmax];
}
/* the radii by quadrant [NE, SE, SW, NW] of the 34, 50 and 64 kt winds, in nautical miles (0 where the wind is below the threshold): the roots of the wind of windAt along the centre line of each quadrant */
function windRadii(S, par) {
  const out = { r34: [0, 0, 0, 0], r50: [0, 0, 0, 0], r64: [0, 0, 0, 0], rmax: 0, heading: 0, speed: 0 };
  if (S.lr === undefined || !(S.vr > 34.5)) return out;
  const P = windProfile(S, par, null), head = heading(S), rf = head + (S.lat < 0 ? -60 : 60);
  for (let q = 0; q < 4; q++) {
    const d = P.dmax * Math.cos((45 + 90 * q - rf) * DEG), f = Math.exp(S.rq ? S.rq[q] : 0);
    const at = (v) => { const m = P.Vs + d; return m > v ? Math.max(P.rmax * f, profileRoot(P, v - d) * f) * smooth01(m, v, v + 4) : 0; };
    const a = Math.min(at(34), 700), b = Math.min(at(50), a), c = Math.min(at(64), b || a);
    out.r34[q] = Math.round(a); out.r50[q] = Math.round(b); out.r64[q] = Math.round(c);
  }
  out.rmax = Math.round(P.rmax); out.heading = Math.round(head); out.speed = Math.round(P.spd);
  return out;
}
/* ---- the eyewall replacement cycle ----------------------------------------------------------------------------------------------------------------------------------------------
   Three phases (Sitkowski, Kossin and Rozoff 2011): the outer eyewall forms and the inner one contracts; the inner one weakens as the outer takes over (the wind dips, Rmax jumps out and the fields grow); the storm
   re-intensifies as the new eyewall contracts. The dip is a deficit S.ercDef on the reported wind (the intensity law keeps its own wind, which the reported one returns to as the deficit fades), the eye's growth S.ercRm
   (log) multiplies Rmax, the field's S.ercSz (log) is added to R34. After the episode all three fade (the wind loss in tDef hours, the larger eye in tRm, the larger field in tSz). */
function ercShape(E, X, t) {                                                    // [wind deficit (kt), log Rmax factor, log R34 gain] t hours into the episode X, or null when it is over
  const a = X.d0, b = a + X.d1, c = b + X.d2;
  if (t >= c) return null;
  if (t < a) return [0, Math.log(E.rm0) * sm3(t / a), 0];
  if (t < b) { const s = sm3((t - a) / X.d1); return [X.loss * s, Math.log(E.rm0) + (Math.log(X.rmx) - Math.log(E.rm0)) * s, X.sz * s]; }
  const s = sm3((t - b) / X.d2); return [X.loss * (1 - X.rec * s), Math.log(X.rmx) + Math.log(E.rm2) * s, X.sz];
}
function stepErc(S, par, seed, h, lf, shT, sstE) {
  const E = par.wind.erc;
  S.hiH = S.v >= 90 ? (S.hiH || 0) + 1 : S.v < 80 ? 0 : (S.hiH || 0);            // hours as a mature hurricane: an inner core that has held its strength
  if (S.erc && S.th !== 'tc') { S.erc = null; S.ercPh = ''; }                       // a transition ends it
  if (S.erc) {
    const t = h + 1 - S.erc.t0, sh = ercShape(E, S.erc, t);
    if (sh) { S.ercDef = sh[0]; S.ercRm = sh[1]; S.ercSz = sh[2]; S.ercPh = t < S.erc.d0 ? 'forming' : t < S.erc.d0 + S.erc.d1 ? 'weakening' : 're-intensifying'; return; }
    S.erc = null; S.ercPh = ''; S.ercCool = h + 1 + E.cool[0] + (E.cool[1] - E.cool[0]) * rnd(seed, S.num, h, ST.ERCP);
  }
  S.ercDef = (S.ercDef || 0) * Math.exp(-1 / E.tDef); S.ercRm = (S.ercRm || 0) * Math.exp(-1 / E.tRm); S.ercSz = (S.ercSz || 0) * Math.exp(-1 / E.tSz);
  if (S.th !== 'tc' || S.ri || h < (S.ercCool || -1)) return;
  const g = smooth01(S.v, E.vR[0], E.vR[1]) * smooth01(S.hiH, E.hi[0], E.hi[1]) * smooth01(sstE, E.sst[0], E.sst[1]) * (1 - smooth01(lf, E.land[0], E.land[1])) / (1 + Math.pow(shT / E.shear, 3));
  if (g > 0 && rnd(seed, S.num, h, ST.ERC) < E.rate * g) {
    const z = (k) => rnd(seed, S.num, h * 8 + k, ST.ERCP), u = (r, k) => r[0] + (r[1] - r[0]) * z(k);
    const loss = clamp((E.loss[0] + E.loss[1] * rndn(seed, S.num, h, ST.ERCP)) * clamp(S.v / 115, 0.7, 1.2), E.loss[2], E.loss[3]);
    S.erc = { t0: h + 1, d0: u(E.d0, 1), d1: u(E.d1, 2), d2: u(E.d2, 3), loss, rec: u(E.rec, 4), rmx: u(E.rmx, 5), sz: u(E.sz, 6) };
    S.ercN = (S.ercN || 0) + 1; S.ercPh = 'forming';
  }
}
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
  const V = S.v, th = S.th, alat = Math.abs(lat), hs = lat < 0 ? -1 : 1;      // hs: poleward is south in the southern hemisphere
  const spd0 = Math.hypot(S.cx, S.cy);
  let perf = 0;                                                                  // how perfectly tropical the environment is, 0-1 (set from the growth gate below): relieves the latitude terms

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
      if (S.etAt >= 0) { const X = par.exAge, a = h - S.etAt; DACC[0] += tableAt(X.t, X.du, a); DACC[1] += (lat < 0 ? -1 : 1) * tableAt(X.t, X.dv, a); }       // (dv is poleward: south in the southern hemisphere)       // the map is the mean over all ages of post-tropical cyclones: a fresh one runs faster than that, an old one slower
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
    ty = par.steerScale * ((1 - a) * vm + a * vd) + hs * (par.driftV[0] + par.driftV[1] * vi) * ramp;
    tau = par.lagBase + par.lagVMod * Math.min(1, V / 110);
    wobSd = par.wobbleSd * (0.6 + 0.4 * Math.min(1, V / 80));
  } else if (th === 'sc') {
    const a = smooth01(V, 12, 38), b = 0.35;
    tx = (1 - a) * us + a * ((1 - b) * um + b * ud); ty = (1 - a) * vs + a * ((1 - b) * vm + b * vd);
    const beta = (par.betaBase + par.betaVMod * Math.min(1, V / 110)) * smooth01(alat, 4, 12);
    tx -= beta * 0.7071; ty += hs * beta * 0.7071;
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
  S.lat = keepSide(lat, (my * KT_KMH) / KM_DEG, par.eqSoft);
  S.lon = lon + (mx * KT_KMH) / (KM_DEG * Math.max(0.2, Math.cos(S.lat * DEG)));

  // ---- intensity
  let dV = 0;
  if (th === 'wv' && M && M.haz) {
    // a disturbance (wave, local seed, low) is not yet a cyclone: its wind only reflects how favourable the place is, and development is a random event whose rate is the
    // map rate (what the real Atlantic does there at this time of year) times E (how much better the environment is than its own mean) times the seed's own quality
    const rq = Math.exp(-1 / par.qTau); S.q = rq * S.q + Math.sqrt(1 - rq * rq) * rndn(seed, id, h, ST.Q);
    const Q = Math.exp(par.qSd * S.q - 0.5 * par.qSd * par.qSd), sstRef = env.sstRef ? env.sstRef() + dSst : null;
    const water = (1 - smooth01(lf, 0.2, 0.5)) * smooth01(alat, 2, 4);              // how much of a development a place that is partly land and close to the equator can host (a ramp, not a wall)
    const act = ctx.act || 1;
    const eT = water > 0 ? water * envFactor(par, M, tw, lat, lon, sst, rh, shear, sstRef, false) * devGateAt(par, env, false, lat, sst, rh, shear, doy, dSst) * Q * act : 0;
    const eS = water > 0 && S.kind !== 'W' && S.kind !== 'M' ? water * envFactor(par, M, tw, lat, lon, sst, rh, shear, sstRef, true) * devGateAt(par, env, true, lat, sst, rh, shear, doy, dSst) * Q * act : 0;
    S.eq = eT;
    if (S.dev < 0) {
      const hT = satur(par.hazMul * hazAt(par, M, M.haz.T, tw, lat, lon, ctx.shift) * eT, par.hazMax), hS = eS > 0 ? satur(par.hazMul * hazAt(par, M, M.haz.S, tw, lat, lon, ctx.shift) * eS, par.hazMax) : 0;
      if (ctx.diag) diagExposure(ctx, S.kind, tw, lat, lon, eT, eS);
      const u = rnd(seed, id, h, ST.GEN);
      if (u < hT + hS) {
        S.dev = h + 1; S.sub = u >= hT || (hT > 0 && rnd(seed, id, 0, ST.SUBX) < subShare(par, alat, sst));       // (one draw per system: the same uniform decides again where the depression is declared, which can be a day later and farther north)
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
    const gL = sub ? 1 : smooth01(alat, par.latGate[0], par.latGate[1]), gS = sstGateAt(par, G, sstG, sstE, sShift);
    let g = growthG(par, G, sub, V, sstG, rh + par.rhSelf * smooth01(V, par.rhSelfV[0], par.rhSelfV[1]), shT, alat, sShift, latD, sstE);
    if (par.qSd > 0) {                                                           // the seed's own quality (persistent random organisation), fading once it is a storm
      const rq = Math.exp(-1 / par.qTau); S.q = rq * S.q + Math.sqrt(1 - rq * rq) * rndn(seed, id, h, ST.Q);
      g = Math.min(1, g * Math.exp(par.qSd * S.q * (1 - smooth01(V, par.qFade[0], par.qFade[1]))));
    }
    g += (1 - g) * par.matureBoost * smooth01(V, 45, 95) * gL * gS;
    const gc = G.gCrit, ku = G.kUp;
    const kappa = g >= gc ? ku * (g - gc) / (1 - gc) : -par.kDn * (gc - g) / gc;
    const PE = par.perfEnv;
    perf = smooth01(sstE, PE.sst[0], PE.sst[1]) / (1 + Math.pow(shT / PE.shear, 3)) * smooth01(rh, PE.rh[0], PE.rh[1]);
    const vp = vPot(sstE, par), vcap = (sub ? softMin(G.vCap, vp) : vp) * (1 - par.vpLat * (1 - par.vpRelief * perf) * smooth01(alat, par.vpLatB[0], par.vpLatB[1]));
    const veq = vcap * (par.vEqLo + (1 - par.vEqLo) * g);
    if (kappa > 0) dV = V < veq ? kappa * V * (1 - V / veq) : -par.rRelax * (V - veq);
    else { const d = kappa * (V - par.vFloor); dV = d >= 0 ? d : -decayLimit(par, -d, V); }
    // rapid intensification: episodes that trigger only in a good environment, while there is room to grow
    if (th === 'tc') {
      const R = par.ri;
      if (S.ri && h >= S.ri.t0 + S.ri.dur) { S.ri = null; S.riCoolUntil = h + R.cool; }
      const landF = 1 - smooth01(lf, 0.1, 0.4);                                    // an episode fades as the coast comes in, and cannot start on one
      if (S.ri) {
        dV += S.ri.rate * Math.sin(Math.PI * (h - S.ri.t0 + 0.5) / S.ri.dur) * landF * smooth01(1 - V / Math.max(vcap, 1), 0.02, 0.10);       // ... and tapers off as the wind comes up to the potential wind
      } else if (h >= S.riCoolUntil && landF > 0 && !S.erc) {
        const cond = smooth01(sstE, R.sst[0], R.sst[1]) / (1 + Math.pow(shT / R.shear, 3)) * smooth01(rh, R.rh[0], R.rh[1])
          * smooth01(V, R.vLow[0], R.vLow[1]) * (1 - smooth01(V, R.vHigh[0], R.vHigh[1])) * smooth01(1 - V / Math.max(vcap, 1), R.room[0], R.room[1]) * gL * landF;
        if (rnd(seed, id, h, ST.RIT) < R.haz * Math.pow(cond, R.hp) * smooth01(cond, 0.005, 0.015)) {
          // how perfect the environment is (0-1): very warm water, next to no shear, moist air, far from the potential wind; in a perfect one an episode can be much faster
          const pn = R.xLo || R.xHi ? smooth01(sstE, R.pnSst[0], R.pnSst[1]) / (1 + Math.pow(shT / R.pnShear, 3)) * smooth01(rh, R.pnRh[0], R.pnRh[1]) * smooth01(1 - V / Math.max(vcap, 1), R.pnRoom[0], R.pnRoom[1]) * gL : 0;
          const r0 = R.rate[0] + R.xLo * pn, r1 = R.rate[1] + R.xHi * pn;
          S.ri = { t0: h, dur: R.dur[0] + (R.dur[1] - R.dur[0]) * rnd(seed, id, h, ST.RID), rate: r0 + (r1 - r0) * Math.pow(rnd(seed, id, h, ST.RIR), R.rk), pn };
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
      const lc = Math.exp(-Math.max(0, h + 1 - S.etAt - par.ex.occ[0]) / par.ex.occ[1]);                 // the life cycle: a post-tropical cyclone is held up for a day or two, then the occlusion and the friction wear it down
      dV = -(V - baroclinicV(par, shear, alat) * lc - lift * lc) / par.bc.exTau;
      S.exLift = lift * (1 - 1 / (2 * par.bc.exTau));
      const ep = S.exEp; if (ep && h >= ep.t0 && h < ep.t0 + ep.dur) { const e = ep.rate * Math.sin(Math.PI * (h - ep.t0 + 0.5) / ep.dur); dV += e; S.exLift += e; }
      S.exDeep += 0.15 * smooth01(shear, 25, 55) * (1 - S.exDeep / 40);                        // (the extra deepening saturates toward 40 hPa)
    } else dV = -(V - par.nlV) / 36;
  }
  if (lf > 0) {                                                                  // Kaplan-DeMaria decay V = Vb + (R V0 - Vb) exp(-alpha t), weighted by how much of the neighbourhood is land
    const ex = th === 'ex';
    if (!ex) { const cut = 1 - (1 - par.landCut) * smooth01(lf, 0.2, 0.7), had = S.landCut || 1; if (cut < had) { S.v *= cut / had; S.landCut = cut; } }          // the friction of the first contact comes in with the share of land (a ramp, not a step at one half)
    if (lf > 0.5) S.onLand = true;
    S.v = Math.max(1, S.v + (1 - lf) * dV);
    S.v = S.v > par.landVb ? par.landVb + (S.v - par.landVb) * Math.exp(-par.landAlpha * (ex ? par.exLandMul : 1) * lf) : Math.max(1, S.v - lf * 0.03 * (ex ? par.exLandMul : 1) * Math.max(0, S.v - 8));
  } else {
    if (S.onLand) S.onLand = false;
    S.landCut = 1;
    S.v = Math.max(1, S.v + dV);
  }
  const rhoV = Math.exp(-1 / par.noiseTau);
  S.zv = rhoV * S.zv + Math.sqrt(1 - rhoV * rhoV) * rndn(seed, id, h, ST.VOL);
  if (th !== 'wv') stepErc(S, par, seed, h, lf, shear / par.shearK, sstE);
  S.vr = Math.max(1, S.v * Math.exp(par.noiseRel * S.zv) - (S.ercDef || 0));                  // (an eyewall replacement's dip is on the reported wind only)
  const rhoP = Math.exp(-1 / par.pressureTau);
  S.zp = rhoP * S.zp + Math.sqrt(1 - rhoP * rhoP) * rndn(seed, id, h, ST.PRES);
  S.p = th === 'wv' ? 1010 - 0.12 * S.vr + 0.8 * S.zp : pressureFromWind(S.vr + par.wind.pErc * (S.ercDef || 0), S.lat) - par.wind.pSz * clamp(sizeAnom(S, par, alat), -0.6, 0.9) - (th === 'ex' ? S.exDeep : 0) + par.pressureSd * S.zp;       // (a larger storm has a lower pressure for the same wind, and part of an eyewall replacement's wind loss does not show in it)

  // ---- transitions and endings
  const lat2 = S.lat;
  if (th === 'wv') {
    if (S.dev >= 0 || S.v >= par.distOn) S.dist = true; else if (S.v < par.distOff) S.dist = false;      // the disturbance stage: development has begun, or the environment holds the wind up near what a depression needs (with some hysteresis)
    const sstOK = S.sub && M ? par.subSstOK : 24, wGen = (1 - smooth01(lf, 0.4, 0.8)) * smooth01(Math.abs(lat2), 3, 6) * smooth01(sstE, sstOK - 1, sstOK);          // the land, the equator and the cold sea each close the door gradually
    if (S.vr >= (S.sub && M ? par.devVSub - 1 : par.genV) && wGen > 0 && rnd(seed, id, h, ST.GENC) < wGen && (!M || (S.dev >= 0 && S.sust !== false))) S.genCount++; else S.genCount = 0;
    if (S.genCount >= par.genHold) { if (!S.sub && M && rnd(seed, id, 0, ST.SUBX) < subShare(par, Math.abs(S.lat), sstE)) S.sub = true; S.th = S.sub ? 'sc' : 'tc'; S.tdHour = h + 1; S.genCount = 0; }
    else {
      if (S.v < 9) S.v = 9;                                                      // a wave stays a wave: it fades toward a floor, it does not vanish
      if (lf > 0.7 && h - S.born > 12) S.lowCount++; else S.lowCount = 0;
      if (S.lowCount >= 12) { S.alive = false; S.endReason = 'moved over land'; S.end = h + 1; }
      else {
        // a disturbance that is not developing is carried off by cold water, by too high a latitude and by old age: hazards with a mean life of par.endH hours where the rule is fully on, not walls
        const age = h + 1 - S.born, cold = S.sub && M ? par.subCold : par.seedCold, latW = M && S.dev < 0 ? smooth01(Math.abs(S.lat) - (S.kind === 'W' ? par.waveLatMax : par.seedLatMax), -2, 2) : 0;
        const wend = 1 - (1 - smooth01(cold - sst, -1, 1)) * (1 - smooth01(age, par.waveLife - 96, par.waveLife + 96)) * (1 - latW);
        const own = M && S.dev < 0 && S.life > 0 && age > S.life;                          // a seed's own drawn life, the end of a disturbance that never organised
        if (own || rnd(seed, id, h, ST.ENDH) < wend / par.endH) { S.alive = false; S.endReason = 'dissipated'; S.end = h + 1; }
      }
    }
  } else if (th === 'tc' || th === 'sc') {
    // the post-tropical transition: a random event at the real best track's rate (etHaz: latitude, cold water, the shear of the westerlies, a strong storm resists)
    const finished = () => { if (rnd(seed, id, h, ST.ETS) < par.disHaz.lowShare) becomeRemnantLow(S, h, seed, par); else { S.alive = false; S.endReason = lf > 0.5 ? 'dissipated over land' : 'dissipated'; S.end = h + 1; } };
    if (lf > 0.5 && S.v < par.landEnd[0]) { S.landLow = (S.landLow || 0) + 1; if (S.landLow >= par.landEnd[1]) finished(); } else S.landLow = 0;
    const pE = S.alive && S.th === th ? etHazard6(par, alat, sst, shear, S.v, perf) : 0, pD = S.alive && S.th === th ? disHazard6(par, alat, sst, shear, S.v, S.tdHour >= 0 ? h - S.tdHour : null, lf) : 0;
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
      const wConv = smooth01(sstE, 25, 26) * (1 - smooth01(shear / par.shearK, 15, 20)) * smooth01(S.vr, 26, 30) * (1 - smooth01(lf, 0.2, 0.5));
      const conv = wConv > 0 && rnd(seed, id, h, ST.CONV) < wConv;                                // a subtropical storm over warm water with little shear becomes tropical (each hour counts with the probability the conditions are met)
      S.convCount = conv ? S.convCount + 1 : 0;
      if (S.convCount >= 18) { S.th = 'tc'; S.convCount = 0; }
      else if (S.vr < 20) { S.lowCount++; if (S.lowCount >= 12) becomeRemnantLow(S, h, seed, par); }
      else S.lowCount = 0;
    }
  } else if (th === 'ex' || th === 'nl') {
    const keep = ctx && ctx.keep, timed = S.nlTill > 0 && h + 1 >= S.nlTill && !keep;                    // (a hard end: a remnant low's life, or one a test or a placement gave a post-tropical cyclone)
    if (timed || S.v < 12) { S.alive = false; S.endReason = th === 'ex' ? 'absorbed' : 'dissipated'; S.end = h + 1; }
    else if (th === 'ex') {
      const X = par.ex, age = h + 1 - S.etAt;
      S.exLowH = S.v < X.fill[0] ? (S.exLowH || 0) + 1 : 0;
      if (S.exLowH >= X.fill[1]) { S.th = 'nl'; S.nlTill = h + 1 + lifetimeH(par.nlLife, seed, S.num, h, ST.LIFE); }          // it has filled: a weak low that goes on a while longer
      else if (!keep) {
        const hz = (1 - smooth01(S.v, X.absV[0], X.absV[1])) * smooth01(alat, X.absLat[0], X.absLat[1]) / X.absTau + smooth01(age, X.maxAge[0], X.maxAge[1]) / 24;
        if (hz > 0 && rnd(seed, id, h, ST.ABS) < hz) { S.alive = false; S.endReason = 'absorbed'; S.end = h + 1; }
      }
    }
  }
  // a circulation that is nearly gone is finished: a hazard that grows as the wind falls (over land from 22 kt on, over water from 10 kt), not a threshold
  if (S.alive && S.th === 'tc' && lf > 0) { const w = smooth01(lf, 0.3, 0.6) * (1 - smooth01(S.v, 12, 22)); if (w > 0 && rnd(seed, id, h, ST.ENDH + 100) < 0.5 * w) { S.alive = false; S.endReason = 'dissipated over land'; S.end = h + 1; } }
  if (S.alive && (S.th === 'tc' || S.th === 'sc')) { const w = 1 - smooth01(S.v, 4, 10); if (w > 0 && rnd(seed, id, h, ST.ENDH + 200) < 0.5 * w) { S.alive = false; S.endReason = 'dissipated'; S.end = h + 1; } }
  if (S.alive) stepWind(S, par, seed, h, alat, lf);
}

/* ---- best-track fixes -------------------------------------------------------------------------------------------------- */
function makeFix(S, h, aceTotal) {
  const spd = Math.hypot(S.cx, S.cy);
  return {
    h, lat: r1(S.lat), lon: r1(S.lon), v: S.th === 'wv' ? Math.round(S.vr) : round5(S.vr), p: Math.round(S.p), st: statusOf(S), th: S.th,
    dir: Math.round((Math.atan2(S.cx, S.cy) / DEG + 360) % 360), spd: Math.round(spd), sst: r1(S.lastSst), sh: Math.round(S.lastShear), rh: Math.round(S.lastRh),
    ace: Math.round(aceTotal * 100) / 100, land: S.lastLf > 0.5, w: S.w ? S.w.slice() : null,       // w: the mean radii of the 34, 50 and 64 kt winds (nmi)
    ec: S.ercPh || undefined,                                                                      // ec: the phase of an eyewall replacement cycle under way
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
/* a storm's track for the season summary and its map: the six-hourly fixes, compact: [h, lat, lon, wind kt, hPa, kind] with kind 0 tropical, 1 subtropical, 2 extratropical, 3 a remnant or other
   low, 4 the disturbance or low that was followed before the depression (a plain wave is not on it) */
function trackOf(S) {
  const out = [];
  for (const f of S.fixes) {
    if (f.h % 6) continue;
    const k = f.th === 'tc' ? 0 : f.th === 'sc' ? 1 : f.th === 'ex' ? 2 : f.th === 'nl' ? 3 : (f.st === 'DB' || f.st === 'LO') ? 4 : -1;
    if (k >= 0) out.push([f.h, f.lat, f.lon, f.v, f.p, k]);
  }
  return out;
}
function summarize(S) {
  const im = S.imp, areas = im && im.cs ? Object.keys(im.cs).map((c) => [c, im.cs[c]]).sort((a, b) => b[1] - a[1]).slice(0, 5) : [];
  return { id: S.id, name: S.name, depNum: S.depNum, origin: S.origin, tdHour: S.tdHour, namedHour: S.namedHour, peakV: S.peakV, peakP: S.peakP, peakHour: S.peakHour,
    ace: S.ace, end: S.end, endReason: S.endReason, season: S.season, th: S.th, imp: im ? { d: im.d, k: im.k, i: im.i } : null,       // unrounded: the page rounds once, to a tenth (rounding here too turned 10.5475 into 10.55 and then 10.6)
    trk: trackOf(S), lfs: (S.lfs || []).map((l) => Object.assign({}, l)), areas };
}

/* ---- the manager ----------------------------------------------------------------------------------------------------------
 *  create({seed, startMs, params, auto})  startMs = UTC milliseconds of hour 0 (must be a 00Z time).                            */
function Manager(o) {
  this.seed = (o.seed >>> 0) || 1;
  this.startMs = o.startMs;
  this.basin = BASINS[o.basin] ? o.basin : 'atlantic';
  this.seasonMonth = BASINS[this.basin].seasonMonth;                           // 0: the season is the calendar year; 6: July to June, named for the year it starts in
  this.nameCur = {};                                                           // where each sequential name list stands (it goes on from season to season)
  this.par = mergeParams(defaultParams(this.basin), o.params);
  this.hour = o.hour0 || 0;
  this.systems = []; this.byId = {};
  this.n = { W: 0, N: 0, M: 0, F: 0 };
  this.auto = o.auto !== false; this.autoRate = o.autoRate == null ? 1 : o.autoRate;
  this.sched = { waveT: null, waveK: 0, waveSpawn: false };
  this.invN = {};                                                              // invests given so far this season, per letter (the next is 90 + n mod 10)
  this.olMem = null;                                                           // what the last outlook issue said about every disturbance (the next one moves on from it)
  this.lows = new LowTracker();
  this.maps = prepareMaps(o.maps);                                             // the climatology the host supplied (null: the plain steering model)
  this.ctx = { maps: this.maps, tw: null, diag: null };                          // what a step needs besides the system: maps, the time weights of the hour, the calibration lab's accumulators
  this.season = newSeason(seasonYearOf(this.startMs + this.hour * HOUR_MS, this.seasonMonth)); this.season.from = this.seasonDay(this.hour); this.prev = null; this.archive = [];
  this.yearEndH = this._hourOfYearStart(this.season.year + 1);
  this.prevEntry = null;
  this.cities = null; this.ledger = {};                                          // the cities the host hands over (setCities) and what the storms did to them
}
Manager.prototype._hourOfYearStart = function (y) { return (Date.UTC(y, this.seasonMonth, 1) - this.startMs) / HOUR_MS; };      // the hour season y begins
Manager.prototype.dateAt = function (h) { return new Date(this.startMs + h * HOUR_MS); };
Manager.prototype.doyAt = function (h) { const d = this.dateAt(h), y = d.getUTCFullYear(); return Math.floor((d.getTime() - Date.UTC(y, 0, 1)) / 86400000); };      // the day of the calendar year: what the climatology is a function of
Manager.prototype.seasonDay = function (h) { const t = this.dateAt(h).getTime(); return Math.floor((t - Date.UTC(seasonYearOf(t, this.seasonMonth), this.seasonMonth, 1)) / 86400000); };      // the day of the season (the ACE graph's axis)

Manager.prototype._aceDay = function (year, h) {                        // the day index of the ACE curve of `year` that hour h falls on (the last day for a fix after the turn of the year)
  const t = this.dateAt(h).getTime();
  return seasonYearOf(t, this.seasonMonth) === year ? clamp(this.seasonDay(h), 0, 365) : Math.round((Date.UTC(year + 1, this.seasonMonth, 1) - Date.UTC(year, this.seasonMonth, 1)) / 86400000) - 1;
};
Manager.prototype._add = function (S) { S.season = this.season.year; this.systems.push(S); this.byId[S.id] = S; return S; };
Manager.prototype._seedSystem = function (ns, th, lat, lon, v, h, origin, sub, kind) {
  const k = this.n[ns] = (this.n[ns] || 0) + 1;
  return this._add(newSystem({ id: ns + k, num: idNum(ns, k), th, lat, lon, v, hour: h, origin, sub, kind: kind || ns, q: rndn(this.seed, idNum(ns, k), 0, ST.Q0) }));
};

/* hand-placed systems: kind 'wave' | 'td' | 'sd' | 'low' */
Manager.prototype.place = function (spec) {
  const h = spec.hour == null ? this.hour : spec.hour;
  const v0 = { wave: 15, td: 30, sd: 28, low: 32 }[spec.kind] || 15, th = { wave: 'wv', td: 'tc', sd: 'sc', low: 'nl' }[spec.kind] || 'wv';
  const S = this._seedSystem('M', th, spec.lat, spec.lon, spec.v || v0, h, 'placed:' + spec.kind, spec.kind === 'sd');
  if (th === 'nl') S.nlTill = h + this.par.nlLife[3];
  if (th === 'tc' || th === 'sc') S.genCount = 0;
  this._ol = null;                                                             // the held outlook does not know it
  return S;
};

/* the place a new hand-placed system would get (for a preview that has exactly the noise the placed storm will have) */
Manager.prototype.pendingPlacement = function (spec) {
  const k = this.n.M + 1, v0 = { wave: 15, td: 30, sd: 28, low: 32 }[spec.kind] || 15, th = { wave: 'wv', td: 'tc', sd: 'sc', low: 'nl' }[spec.kind] || 'wv';
  const S = newSystem({ id: 'M' + k, num: idNum('M', k), th, lat: spec.lat, lon: spec.lon, v: spec.v || v0, hour: spec.hour == null ? this.hour : spec.hour, origin: 'placed:' + spec.kind, sub: spec.kind === 'sd', kind: 'M', q: rndn(this.seed, idNum('M', k), 0, ST.Q0) });
  if (th === 'nl') S.nlTill = S.born + this.par.nlLife[3];                    // exactly what place() gives a low
  return S;
};

/* ---- births: the generators the engine and the outlook share ------------------------------------------------------------------------------------------------------------
   Every system the supply creates is a pure function of the seed and the hour (and the maps and the parameters): _waveNext / _waveBirth for the Atlantic's easterly waves, _localSeed for a map
   cell's local seed, _floorSeed for the floor supply over the whole box. _spawn creates what they return at the hour it is; the outlook (Manager.prototype.outlook) calls the very same
   functions for the hours ahead, so the disturbance it draws before it exists is the one that will be born, not a guess. */
Manager.prototype._waveNext = function (from, k) {                            // next wave time after `from` (k: the running count of waves born): a quasi-periodic train whose rate follows the season
  const rate = this.par.waveRate0 * seasonalWeight(WAVE_SEASON, this.doyAt(from)) * seasonShape(this.par, this.doyAt(from)) * this.autoRate;
  if (rate < 0.02) return { t: from + 24, spawn: false };
  return { t: from + 24 * (0.55 + 0.9 * rnd(this.seed, 77, k, ST.WAVE)) / rate, spawn: true };
};
Manager.prototype._waveSchedule = function (from) { return this._waveNext(from, this.sched.waveK); };
Manager.prototype._waveBirth = function (k, h) {                              // the k-th wave, born at hour h: where it leaves the coast and how strong it is
  const par = this.par, seed = this.seed, doy = this.doyAt(h);
  const sw = clamp((doy - 140) / 100, 0, 1), latC = par.waveLat0 + 2.5 * Math.sin(Math.PI * sw);
  return { lat: clamp(latC + 2.2 * rndn(seed, 78, k, ST.POS), 8, 18), lon: -17.5 + 0.6 * rndn(seed, 79, k, ST.POS), v0: par.waveV0[0] + (par.waveV0[1] - par.waveV0[0]) * rnd(seed, 80, k, ST.V0) };
};
/* the local seed of map cell k at hour h, or null: born where the real Atlantic needs them (maps.spawn, per year per node), at a place inside the cell that El Nino can shift (shift: [lat, lon] degrees or null), over water, lasting a few days unless it develops */
Manager.prototype._localSeed = function (k, h, tw, shift, env) {
  const par = this.par, seed = this.seed, M = this.maps, rate = par.seedMul * this.autoRate / (30.4375 * 24);       // maps.spawn: the seeds a month contributes to a year's total, per node
  const a = (M.spawn[tw.m0 * M.n + k] * (1 - tw.t) + M.spawn[tw.m1 * M.n + k] * tw.t) * rate;
  if (!(a > 0) || rnd(seed, 1000 + k, h, ST.SPAWN) >= a) return null;
  const j = (k / M.nx) | 0, i = k - j * M.nx;
  let lat = M.lat0 + (j + rnd(seed, 1000 + k, h, ST.SEEDPOS) - 0.5) * M.res, lon = M.lon0 + (i + rnd(seed, 1000 + k, h + 1000003, ST.SEEDPOS) - 0.5) * M.res;
  if (shift) { lat += shift[0]; lon += shift[1]; const B = env && env.box; if (B) { lat = clamp(lat, B.lat0 + 0.6, B.lat1 - 0.6); lon = clamp(lon, B.lon0 + 0.6, B.lon1 - 0.6); } }
  if (env && env.isLand && env.isLand(lat, lon)) return null;
  return { lat, lon, v0: par.seedV[0] + (par.seedV[1] - par.seedV[0]) * rnd(seed, 1000 + k, h, ST.V0), life: par.lifeN[0] + (par.lifeN[1] - par.lifeN[0]) * rnd(seed, 1000 + k, h, ST.LIFEN) };
};
/* the floor supply: a disturbance now and then anywhere in the box (par.seedFloor a year, uniform over the water, ids F<k> so no other system's id moves). Whether it comes to anything is the environment's business: over the Great
   Lakes in the climate of today it never does, with the page's Warming, Moisture and Wind shear sliders pushed to the end it very rarely can */
Manager.prototype._floorSeed = function (h, env) {
  const par = this.par, seed = this.seed;
  if (!(par.seedFloor > 0 && env && env.box && rnd(seed, 90001, h, ST.FLOOR) < par.seedFloor * this.autoRate / (365.25 * 24))) return null;
  const B = env.box, lat = B.lat0 + 1 + (B.lat1 - B.lat0 - 2) * rnd(seed, 90002, h, ST.FLOOR), lon = B.lon0 + 1 + (B.lon1 - B.lon0 - 2) * rnd(seed, 90003, h, ST.FLOOR);
  if (env.isLand && env.isLand(lat, lon)) return null;
  return { lat, lon, v0: par.seedV[0] + (par.seedV[1] - par.seedV[0]) * rnd(seed, 90004, h, ST.FLOOR), life: par.lifeN[0] + (par.lifeN[1] - par.lifeN[0]) * rnd(seed, 90005, h, ST.FLOOR) };
};
Manager.prototype._spawn = function (h, env) {
  const par = this.par, seed = this.seed, doy = this.doyAt(h);
  // African easterly waves (only a basin with a wave train of its own has them: the Atlantic. The others' disturbances are the local seeds of the fitted supply and the tracked lows)
  if (basinOf(this.basin).waves && this.sched.waveT == null) { const s = this._waveSchedule(h); this.sched.waveT = s.t; this.sched.waveSpawn = s.spawn; }
  while (basinOf(this.basin).waves && h >= this.sched.waveT) {
    if (this.sched.waveSpawn) {
      const k = this.sched.waveK++, w = this._waveBirth(k, h);
      this._seedSystem('W', 'wv', w.lat, w.lon, w.v0, h, 'wave', false).ck = 'uW' + k + ':' + h;           // (the key the outlook gave it before it existed: its record goes on)
    }
    const s = this._waveSchedule(this.sched.waveT); this.sched.waveT = s.t; this.sched.waveSpawn = s.spawn;
  }
  // local seeds: disturbances the waves and the pressure lows do not supply (a trough or a gyre over the Gulf, a stalled front off the Carolinas ...)
  if (this.maps) {
    const M = this.maps, tw = this.ctx.tw, diag = this.ctx.diag;
    for (const k of M.spawnCells || []) {
      const b = this._localSeed(k, h, tw, this.ctx.shift, env); if (!b) continue;
      const S = this._seedSystem('N', 'wv', b.lat, b.lon, b.v0, h, 'seed', false);
      S.life = b.life; S.ck = 'uN' + (1000 + k) + ':' + h;
      if (diag) diag['spawn.N'][(tw.t < 0.5 ? tw.m0 : tw.m1) * M.n + k] += 1;
    }
    const f = this._floorSeed(h, env);
    if (f) { const S = this._seedSystem('F', 'wv', f.lat, f.lon, f.v0, h, 'seed', false, 'N'); S.life = f.life; S.ck = 'uF90001:' + h; }
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
      if (!t.alive || h - t.born < 6 || env.isLand(t.lat, t.lon)) continue;
      const lw = lowWeight(par, Math.abs(t.lat)); if (lw <= 0) continue;
      const sst = env.sst(t.lat, t.lon) + par.sstOffset, sh = env.shear(t.lat, t.lon) + par.shearOffset, rh = env.rh(t.lat, t.lon) + par.rhOffset;
      if (!(sst === sst) || !(sh === sh) || !(rh === rh)) continue;
      const act = ctx.act || 1, doy = this.doyAt(h);
      const eT = lw * envFactor(par, M, tw, t.lat, t.lon, sst, rh, sh, sstRef, false) * devGateAt(par, env, false, t.lat, sst, rh, sh, doy, par.sstOffset) * act;
      const eS = lw * envFactor(par, M, tw, t.lat, t.lon, sst, rh, sh, sstRef, true) * devGateAt(par, env, true, t.lat, sst, rh, sh, doy, par.sstOffset) * act;
      const hT = satur(6 * par.hazMul * hazAt(par, M, M.haz.T, tw, t.lat, t.lon, ctx.shift) * eT * this.autoRate, par.hazMax), hS = satur(6 * par.hazMul * hazAt(par, M, M.haz.S, tw, t.lat, t.lon, ctx.shift) * eS * this.autoRate, par.hazMax);
      if (ctx.diag) diagExposure(ctx, 'L', tw, t.lat, t.lon, eT, eS, 6);
      const pot = Math.max(eT, eS); if (pot >= par.distOnE) t.dist = true; else if (pot < par.distOffE) t.dist = false;           // a low with the potential to become a cyclone is a disturbance too
      const u = rnd(this.seed, idNum('L', +t.id.slice(1)), h, ST.LOWSEED);
      if (u < hT + hS) {
        this.lows._finish(t, h); t.became = true;
        if (!t.invest) this._invest(t);                                          // (a depression that grows from a low was an invest first, whether or not the six-hourly look saw it flagged)
        const S = this._seedSystem('N', 'wv', t.lat, t.lon, 22, h, 'low', u >= hT);
        S.dev = h; S.invest = t.invest; S.ck = t.id;
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

/* an invest: a disturbance (the engine's own flag S.dist / t.dist: development has begun, or the environment holds the wind near what a depression needs) is given the next 9x number of its letter the first
   six-hourly time it is seen with the flag -- a number is a property of the system, kept when a low becomes a depression, and the same however the clock was chunked */
Manager.prototype._invest = function (o) { const L = investLetter(this.basin, o.lon), n = this.invN[L] || 0; this.invN[L] = n + 1; o.invest = '9' + (n % 10) + L; };
Manager.prototype._assignInvests = function () {
  for (const S of this.systems) if (S.alive && S.th === 'wv' && S.dist && !S.invest) this._invest(S);
  for (const t of this.lows.tracks) if (t.alive && t.dist && !t.invest) this._invest(t);
};

Manager.prototype._record = function (h, env) {                             // three-hourly fixes (the six-hourly ones are the synoptic times; ACE counts only those), naming, counters
  const season = this.season, par = this.par;
  for (const S of this.systems) {
    if (!S.alive && S.end !== h) continue;
    if (S.th === 'wv' && !S.alive) continue;                                   // a wave that never developed leaves no record
    const st = statusOf(S), isTC = S.th === 'tc' || S.th === 'sc', rv = round5(S.vr);
    const rec = S.season === season.year ? season : (this.prev && this.prev.year === S.season ? this.prev : season);
    // a system put on the map as a cyclone is a numbered depression even if it changes class before its first fix (a 70-kt storm placed at 41N is post-tropical within six hours one time in three)
    if ((isTC || S.origin === 'placed:td' || S.origin === 'placed:sd') && S.depNum === 0) { S.depNum = ++rec.dep; if (S.tdHour < 0) S.tdHour = h; rec.storms.push(S.id); }
    if (isTC && S.name === '' && rv >= par.namedV) {
      S.name = stormName(this.basin, rec.year, rec.namedIdx++, this.nameCur, S.lon); S.namedHour = h; rec.named++;
    }
    let add = 0;
    if (isTC && rv >= 34 && h % 6 === 0) { add = aceOf(rv); S.ace += add; rec.ace += add; rec.aceDaily[this._aceDay(rec.year, h)] += add; }       // ACE: the synoptic 00 / 06 / 12 / 18Z fixes only, as the real definition has it
    if (isTC && st === 'HU' && !S.hurr) { S.hurr = true; rec.hurr++; }
    if (isTC && st === 'HU' && rv >= 96 && !S.major) { S.major = true; rec.major++; }
    if (isTC && st === 'HU' && rv >= 137 && !S.c5) { S.c5 = true; rec.cat5++; }
    if (isTC && rv > S.peakV) { S.peakV = rv; S.peakHour = h; S.peakP = Math.round(S.p); }
    if (isTC && Math.round(S.p) < S.peakP && rv >= S.peakV) S.peakP = Math.round(S.p);
    S.fixes.push(makeFix(S, h, S.ace));
    if (S.th === 'wv' && S.fixes.length > 96) S.fixes.shift();
  }
};

Manager.prototype._rollover = function (h) {
  // calendar-year seasons: archive the finished season and clear its paths; a system still alive on Jan 1 finishes under its formation year
  const old = this.season, y = old.year;
  const dead = this.systems.filter((S) => !S.alive && S.season === y && S.depNum > 0);
  const entry = { year: y, open: false, from: old.from || 0, dep: old.dep, named: old.named, hurr: old.hurr, major: old.major, cat5: old.cat5, ace: Math.round(old.ace * 10) / 10,
    aceDaily: old.aceDaily.map((x) => Math.round(x * 100) / 100), storms: dead.map(summarize), imp: old.imp || null };
  const stillAlive = this.systems.some((S) => S.alive && S.season === y && S.th !== 'wv');
  if (stillAlive) { entry.open = true; this.prev = old; this.prevEntry = entry; }
  this.archive.push(entry);
  this.systems = this.systems.filter((S) => S.alive);                          // the finished season's dead paths disappear
  this.byId = {}; for (const S of this.systems) this.byId[S.id] = S;
  this.season = newSeason(y + 1);
  this.yearEndH = this._hourOfYearStart(y + 2);
  this.invN = {};                                                              // a new season numbers its invests from 90 again
};
Manager.prototype._finalizePrev = function () {
  const p = this.prev, e = this.prevEntry;
  if (!p || !e) return;
  e.open = false; e.dep = p.dep; e.named = p.named; e.hurr = p.hurr; e.major = p.major; e.cat5 = p.cat5; e.ace = Math.round(p.ace * 10) / 10;
  e.aceDaily = p.aceDaily.map((x) => Math.round(x * 100) / 100); e.imp = p.imp || null;
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

/* two post-tropical or non-tropical lows that come within par.ex.mergeD degrees of each other merge: the weaker is absorbed (a chance of par.ex.mergeP an hour) */
Manager.prototype._merge = function (h) {
  const L = this.systems.filter((S) => S.alive && (S.th === 'ex' || S.th === 'nl')), X = this.par.ex;
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], b = L[j]; if (!a.alive || !b.alive) continue;
    if (Math.hypot(a.lat - b.lat, (a.lon - b.lon) * Math.cos(((a.lat + b.lat) / 2) * DEG)) >= X.mergeD) continue;
    const w = a.vr < b.vr ? a : b;
    if (rnd(this.seed, w.num, h, ST.ABS + 100) < X.mergeP) { w.alive = false; w.endReason = 'absorbed'; w.end = h + 1; }
  }
};
/* Landfalls: the centre of a tropical or subtropical cyclone that was over water an hour ago and is over land now (the host's own land test: a lake is water). The coast between the two hourly positions is found by
   halving ten times, so a landfall is where the coast is and the hour it happens in, not the next advisory; one system has no second landfall within six hours (a strait crossed, a coast skimmed). The log of a
   system is S.lfs, [{ h: the hour after the step, lat, lon, v: the reported wind then (kt), th }]; S.lp is where its centre was the hour before, [lat, lon, v, over land]. The page's markers, the summary's
   count and the wikitext all read this one log. */
Manager.prototype._landfalls = function (h, env) {
  if (!env || typeof env.isLand !== 'function') return;
  for (const S of this.systems) {
    if (!S.alive) { S.lp = null; continue; }
    const land = !!env.isLand(S.lat, S.lon), p = S.lp;
    if (p && !p[3] && land && S.depNum > 0 && (S.th === 'tc' || S.th === 'sc')) {
      const lf = S.lfs || (S.lfs = []);
      if (!lf.length || h + 1 - lf[lf.length - 1].h >= 6) {
        let dl = S.lon - p[1]; if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
        let a = 0, b = 1;
        for (let k = 0; k < 10; k++) { const m = (a + b) / 2; if (env.isLand(p[0] + (S.lat - p[0]) * m, p[1] + dl * m)) b = m; else a = m; }
        let lo = p[1] + dl * b; if (lo > 180) lo -= 360; else if (lo < -180) lo += 360;
        lf.push({ h: h + 1, lat: Math.round((p[0] + (S.lat - p[0]) * b) * 100) / 100, lon: Math.round(lo * 100) / 100, v: Math.round((p[2] + (S.vr - p[2]) * b) * 10) / 10, th: S.th });
      }
    }
    S.lp = [S.lat, S.lon, S.vr, land];
  }
};
Manager.prototype.advanceTo = function (target, envSrc) {
  while (this.hour < target) {
    const h = this.hour, env = envSrc && typeof envSrc.at === 'function' ? envSrc.at(h) : envSrc;
    if (env && env.beginHour) env.beginHour(h);                                // an environment that carries its keyframes forward in time is told the hour it is about to be asked about
    if (h >= this.yearEndH) this._rollover(h);
    const doy = this.doyAt(h);
    if (this.maps) { this.ctx.tw = timeWeights(doy + (((h % 24) + 24) % 24) / 24); this.ctx.act = activityFactor(this.par, this.seed, seasonYearOf(this.startMs + h * HOUR_MS, this.seasonMonth), h); ensoOf(this.par, env, this.ctx); }
    if (this.auto) this._spawn(h, env);
    for (const S of this.systems) if (S.alive) stepSystem(S, env, h, this.seed, this.par, doy, this.ctx);
    this._merge(h);
    this._landfalls(h, env);
    this.hour = h + 1;
    this._impacts(h + 1, env);
    if (this.hour % 3 === 0) this._record(this.hour, env);
    if (this.hour % 6 === 0) { this._updateLows(this.hour, env); this._assignInvests(); this._cleanup(this.hour); }
  }
};

/* ---- the outlook: areas of interest ------------------------------------------------------------------------------------------------------------------------------------
 *  Manager.prototype.outlook(env): the areas where a tropical or subtropical cyclone could form in the next 7 days, each with the chance of formation within 2 and within 7 days (percent, in steps of 5), the way the
 *  National Hurricane Center draws them. One implementation for every basin; nothing in it is a number fitted to a basin (par.outlook holds the choices of how a forecast is made and drawn).
 *  A candidate is a disturbance that exists (a wave, a local seed, a tracked low, a placed wave) or that the supply has already scheduled: the very generators _spawn uses (_waveNext, _waveBirth, _localSeed, _floorSeed) are
 *  asked for the hours ahead, so a disturbance drawn before it exists is the one that will be born. Each is followed along its mean track (the drift of a weak system at its place and time of year plus the steering anomaly
 *  the page shows now, decaying to the climate) through the environment the page has now with its anomaly decaying to the climate (a persistence forecast: the weather beyond the next keyframe is not known to it). Along the
 *  track the development rate is the one stepSystem uses (the map rate x how favourable the environment is x the system's quality x the activity factor), thinned by the chance a development event becomes a depression and
 *  competing with what ends a disturbance (cold water, latitude, age, land, its own drawn life): the chance of formation by a time is the integral of rate x survival.
 *  The area covers where the formation is expected -- from the 10th to the 90th percentile of its time, along the track, widening with lead -- so a high chance soon after favourable conditions is a short compact area and a
 *  thin chance spread over days a long one. A disturbance that exists has an X; when the rate it has now is well below the best it will have, the X gets an arrow to the area (not yet in favourable conditions), else it sits
 *  inside it. A disturbance the supply has not made yet has the area only, and only once it is inside its lead, the hours a forecaster sees it coming (a wave leaving Africa for days, a local seed for a day or two, a third of those not at all).
 *  The result is held for the six hours of its issue (00, 06, 12 and 18Z, the NHC's cycle). The call is pure: a function of the engine's state and the environment it is handed.
 */
const normCdf = (x) => {                                                       // the standard normal's distribution function (Abramowitz & Stegun 7.1.26, error < 1.5e-7)
  const z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * z), y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
};
/* the outline of a swath: a chain of discs [lat, lon, radius in degrees of latitude] joined by tapered capsules, as the zero line of their distance field (marching squares). It is one closed outline whatever the chain does -- a chain that
   doubles back, a sharp turn, a radius larger than the bend: the two offset curves of the capsule this replaces crossed each other and an outline showed up inside the outline. Longitudes are scaled by the cosine of latitude so that a disc is
   round on the map; the outline never crosses the equator any more than a system does (its latitudes go through the same soft floor, eq = par.eqSoft, on the side of the first disc).
   Returns { poly, area (square degrees), pole: the point of the swath farthest from its edge, where a label goes } */
function swathFull(chain, eq) {
  const n = chain.length, kx = Math.max(0.2, Math.cos(chain.reduce((a, q) => a + q[0], 0) / n * DEG));
  let P = chain.map((q) => [q[1] * kx, q[0], q[2]]), poly = [], its = 1, area = 0, pole = null;
  if (n === 1) { for (let i = 0; i < 24; i++) { const a = 2 * Math.PI * i / 24; poly.push([P[0][0] + P[0][2] * Math.cos(a), P[0][1] + P[0][2] * Math.sin(a)]); } its = 2; area = Math.PI * P[0][2] * P[0][2]; pole = [P[0][0], P[0][1]]; }
  else {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const q of P) { x0 = Math.min(x0, q[0] - q[2]); x1 = Math.max(x1, q[0] + q[2]); y0 = Math.min(y0, q[1] - q[2]); y1 = Math.max(y1, q[1] + q[2]); }
    const cell = Math.max(0.3, Math.max(x1 - x0, y1 - y0) / 70), X0 = x0 - 2 * cell, Y0 = y0 - 2 * cell, nx = Math.ceil((x1 - x0) / cell) + 5, ny = Math.ceil((y1 - y0) / cell) + 5, f = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const px = X0 + i * cell, py = Y0 + j * cell; let best = 1e9;
      for (let k = 0; k + 1 < n; k++) {
        const a = P[k], b = P[k + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 > 0 ? Math.min(1, Math.max(0, ((px - a[0]) * dx + (py - a[1]) * dy) / L2)) : 0;
        const d = Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy)) - (a[2] + t * (b[2] - a[2]));
        if (d < best) best = d;
      }
      f[j * nx + i] = best;
    }
    const pts = new Map(), adj = new Map(), inside = (i, j) => f[j * nx + i] < 0;
    const edge = (h, i, j) => {                                                 // the point where the zero line crosses the grid edge from (i, j) to (i + 1, j) (h) or to (i, j + 1)
      const id = (j * nx + i) * 2 + (h ? 0 : 1); if (!pts.has(id)) { const a = f[j * nx + i], b = h ? f[j * nx + i + 1] : f[(j + 1) * nx + i], t = a / (a - b); pts.set(id, h ? [X0 + (i + t) * cell, Y0 + j * cell] : [X0 + i * cell, Y0 + (j + t) * cell]); }
      return id;
    };
    const link = (u, v) => { if (!adj.has(u)) adj.set(u, []); if (!adj.has(v)) adj.set(v, []); adj.get(u).push(v); adj.get(v).push(u); };
    for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
      const c = (inside(i, j) ? 1 : 0) | (inside(i + 1, j) ? 2 : 0) | (inside(i + 1, j + 1) ? 4 : 0) | (inside(i, j + 1) ? 8 : 0);
      if (c === 0 || c === 15) continue;
      const B = () => edge(true, i, j), T = () => edge(true, i, j + 1), L = () => edge(false, i, j), R = () => edge(false, i + 1, j);
      if (c === 1 || c === 14) link(L(), B()); else if (c === 2 || c === 13) link(B(), R()); else if (c === 3 || c === 12) link(L(), R()); else if (c === 4 || c === 11) link(R(), T());
      else if (c === 6 || c === 9) link(B(), T()); else if (c === 7 || c === 8) link(L(), T());
      else { const cv = (f[j * nx + i] + f[j * nx + i + 1] + f[(j + 1) * nx + i + 1] + f[(j + 1) * nx + i]) / 4; if ((c === 5) === (cv < 0)) { link(L(), T()); link(B(), R()); } else { link(L(), B()); link(R(), T()); } }       // (the two saddles: the centre says which way the zero line goes)
    }
    const seen = new Set(); let best = null, bestA = 0, bestId = -1;
    for (const s0 of adj.keys()) {                                              // the closed loops of the zero line: the biggest is the outline (a hole or an island of the swath is left out)
      if (seen.has(s0)) continue;
      const loop = []; let prev = -1, cur = s0;
      for (let g = 0; g < 100000; g++) { seen.add(cur); loop.push(pts.get(cur)); const nb = adj.get(cur); if (nb.length < 2) break; const nxt = nb[0] !== prev ? nb[0] : nb[1]; if (nxt === s0 || seen.has(nxt)) break; prev = cur; cur = nxt; }
      let Ar = 0; for (let k = 0, m = loop.length - 1; k < loop.length; m = k++) Ar += loop[m][0] * loop[k][1] - loop[k][0] * loop[m][1];
      if (Math.abs(Ar) / 2 > bestA) { bestA = Math.abs(Ar) / 2; best = loop; bestId = s0; }
    }
    area = best ? bestA : 0;
    const step = best ? Math.max(1, Math.ceil(best.length / 110)) : 1;
    poly = best ? best.filter((_, k) => k % step === 0) : [[P[0][0], P[0][1]]];
    if (best) {                                                                 // the pole: the deepest node of that outline (a flood fill from a node inside it)
      const e = bestId >> 1, a = e, b = (bestId & 1) === 0 ? e + 1 : e + nx, seed = f[a] < 0 ? a : b, vis = new Uint8Array(nx * ny), st = [seed]; vis[seed] = 1; let pb = seed;
      while (st.length) { const k = st.pop(); if (f[k] < f[pb]) pb = k; const i = k % nx, j = (k - i) / nx; for (const q of [i > 0 ? k - 1 : -1, i + 1 < nx ? k + 1 : -1, j > 0 ? k - nx : -1, j + 1 < ny ? k + nx : -1]) if (q >= 0 && !vis[q] && f[q] < 0) { vis[q] = 1; st.push(q); } }
      pole = [X0 + (pb % nx) * cell, Y0 + Math.floor(pb / nx) * cell];
    }
  }
  for (let it = 0; it < its && poly.length > 2; it++) { const q = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); } poly = q; }
  const hs = chain[0][0] < 0 ? -1 : 1, r2 = (x) => Math.round(x * 100) / 100, fold = (q) => [r2(eq > 0 ? hs * softFloor(hs * q[1], eq) : q[1]), r2(q[0] / kx)];          // (hundredths of a degree: tenths show as steps in an outline zoomed in)
  return { poly: poly.map(fold), area, pole: pole ? fold(pole) : null };
}
const swath = (chain, eq) => swathFull(chain, eq).poly;
function capsule(pts, rad, eq) { return swath(pts.map((q, i) => [q[0], q[1], rad[i]]), eq); }
/* the chain cut to cap degrees of length and spread again over nine discs, the first one where it was */
function capChain(chain, cap) {
  const cum = [0]; for (let i = 1; i < chain.length; i++) cum.push(cum[i - 1] + Math.hypot(chain[i][0] - chain[i - 1][0], (chain[i][1] - chain[i - 1][1]) * Math.cos((chain[i][0] + chain[i - 1][0]) / 2 * DEG)));
  if (cum[cum.length - 1] <= cap) return chain;
  return chain.map((_, k) => {
    const d = cap * k / (chain.length - 1); let i = 1; while (i < chain.length - 1 && cum[i] < d) i++;
    const a = chain[i - 1], b = chain[i], w = cum[i] > cum[i - 1] ? (d - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0;
    return [a[0] + w * (b[0] - a[0]), a[1] + w * (b[1] - a[1]), a[2] + w * (b[2] - a[2])];
  });
}
const outlookClass = (O, p7) => (p7 <= O.cls[0] ? 'low' : p7 <= O.cls[1] ? 'medium' : 'high');          // the NHC's three colours by the 7-day chance
/* what ends a disturbance that has not developed, per hour: cold water, too high a latitude, old age (hazards with a mean life of endH hours), the land (twelve hours over it ends a seed), and for a tracked low its own life */
function outlookEnd(par, c, alat, sst, lf, age) {
  const latW = smooth01(alat - (c.kind === 'W' ? par.waveLatMax : par.seedLatMax), -2, 2);
  const wend = 1 - (1 - smooth01(par.seedCold - sst, -1, 1)) * (1 - smooth01(age, par.waveLife - 96, par.waveLife + 96)) * (1 - latW);
  return c.low ? 1 / par.outlook.lowLife + wend / par.endH + smooth01(lf, 0.6, 0.8) / 8 : wend / par.endH + (age > 12 ? smooth01(lf, 0.6, 0.8) / 8 : 0);
}
/* follow one candidate along its mean track: per step of par.outlook.step hours its place, the rate at which it becomes a depression (rate) and the probability that it does so in the step (mass), with the chance it still
   exists and has not yet developed (surv) falling by what ends it. c: { kind, lat, lon, h0 (first hour on the path), born, life, ux, uy, q (its quality now, when known), vx, vy (a tracked low's motion), low, dev } */
function outlookFollow(mgr, F, c) {
  const par = mgr.par, O = par.outlook, M = F.M, env = F.env, A = O.anomTau, dt = O.step, H0 = F.H0, end = H0 + O.horizon, box = env.box;
  const out = { t: [], lat: [], lon: [], dt: [], dly: [], rate: [], mass: [], surv: [], lf: [] };
  let lat = c.lat, lon = c.lon, ux = c.ux || 0, uy = c.uy || 0, h = c.h0, surv = 1, lastSst = 27, lastRh = 50, lastShear = 15;
  const rq = Math.exp(-1 / par.qTau), al = 1 - Math.exp(-dt / 5), sub = c.kind !== 'W' && c.kind !== 'M';
  while (h < end) {
    const alat = Math.abs(lat), dh = h - H0;
    if (box && (lat < box.lat0 + 0.5 || lat > box.lat1 - 0.5 || lon < box.lon0 + 0.5 || lon > box.lon1 - 0.5)) break;
    const lf = landFraction(env, lat, lon, par.landSample), tw = timeWeights(mgr.doyAt(h) + (((h % 24) + 24) % 24) / 24), doy = mgr.doyAt(h);
    let sst = env.sst(lat, lon), rh = env.rh(lat, lon), shear = env.shear(lat, lon);
    if (!(sst === sst) && lf === 0) break;                                           // left the basin
    if (!(sst === sst)) sst = lastSst; if (!(shear === shear)) shear = lastShear; if (!(rh === rh)) rh = lastRh;
    if (M.env0 && dh > 0) {                                                          // the anomaly from the climate decays, the climate goes on: the season changes under a persistence forecast
      const a = (name, arr, tau, v) => { const c0 = mapAt(M, arr, F.tw0, lat, lon); return mapAt(M, arr, tw, lat, lon) + (v - c0) * Math.exp(-dh / tau); };
      sst = a('sst', M.env0.sst, A.sst, sst); rh = a('rh', M.env0.rh, A.rh, rh); shear = a('shear', M.env0.shear, A.shear, shear);
    }
    lastSst = sst; lastRh = rh; lastShear = shear;
    sst += par.sstOffset; rh += par.rhOffset; shear += par.shearOffset;
    const age = h - c.born, act = activityFactor(par, mgr.seed, seasonYearOf(mgr.startMs + h * HOUR_MS, mgr.seasonMonth), h) * F.ensoMul;
    const gT = devGrowth(par, env, false, lat, sst, rh, shear, doy, par.sstOffset);
    let eT, eS = 0, lamT, lamS = 0, Qm = 1, gS = 0;
    if (c.low) {                                                                     // a tracked low develops at six-hourly draws (see _updateLows), weighted by its latitude
      const lw = lowWeight(par, alat); gS = devGrowth(par, env, true, lat, sst, rh, shear, doy, par.sstOffset);
      eT = lw * envFactor(par, M, tw, lat, lon, sst, rh, shear, F.sstRef, false) * devGateOf(par, false, gT) * act;
      eS = lw * envFactor(par, M, tw, lat, lon, sst, rh, shear, F.sstRef, true) * devGateOf(par, true, gS) * act;
      lamT = satur(6 * par.hazMul * hazAt(par, M, M.haz.T, tw, lat, lon, F.shift) * eT * mgr.autoRate, par.hazMax) / 6;
      lamS = satur(6 * par.hazMul * hazAt(par, M, M.haz.S, tw, lat, lon, F.shift) * eS * mgr.autoRate, par.hazMax) / 6;
    } else {
      const water = (1 - smooth01(lf, 0.2, 0.5)) * smooth01(alat, 2, 4);
      if (c.q != null) Qm = Math.exp(par.qSd * Math.pow(rq, dh) * c.q - 0.5 * par.qSd * par.qSd * Math.pow(rq, 2 * dh));        // the mean of exp(qSd q) given the quality now (it relaxes to a unit-mean draw)
      eT = water > 0 ? water * envFactor(par, M, tw, lat, lon, sst, rh, shear, F.sstRef, false) * devGateOf(par, false, gT) * Qm * act : 0;
      lamT = satur(par.hazMul * hazAt(par, M, M.haz.T, tw, lat, lon, F.shift) * eT, par.hazMax);
      if (sub && water > 0) {
        gS = devGrowth(par, env, true, lat, sst, rh, shear, doy, par.sstOffset);
        eS = water * envFactor(par, M, tw, lat, lon, sst, rh, shear, F.sstRef, true) * devGateOf(par, true, gS) * Qm * act;
        lamS = satur(par.hazMul * hazAt(par, M, M.haz.S, tw, lat, lon, F.shift) * eS, par.hazMax);
      }
    }
    { const qs = subShare(par, alat, sst); if (qs > 0 && lamT > 0) { if (!(gS > 0)) gS = devGrowth(par, env, true, lat, sst, rh, shear, doy, par.sstOffset); lamS += qs * lamT; lamT *= 1 - qs; } }       // (the share of the tropical developments that are subtropical instead: the same draw as the genesis rule's)
    // the chance a development event becomes a depression: the doors the genesis rule closes (land, the equator, cold water) and the growth gate the new depression must hold (tdMargin)
    const sd = c.q != null ? Math.sqrt(Math.max(0.0025, 1 - Math.pow(rq, 2 * dh))) : 1, mq = c.q != null ? Math.pow(rq, dh) * c.q : 0;
    const sustP = (g, G) => { if (!(par.tdMargin > 0)) return 1; if (!(g > 0)) return 0; if (!(par.qSd > 0)) return g >= G.gCrit + par.tdMargin ? 1 : 0; return 1 - normCdf((Math.log((G.gCrit + par.tdMargin) / g) / par.qSd - mq) / sd); };
    const door = (1 - smooth01(lf, 0.4, 0.8)) * smooth01(alat, 3, 6);
    const convT = O.tdShare * door * smooth01(sst, 23, 24) * sustP(gT, par), convS = lamS > 0 ? O.tdShare * door * smooth01(sst, par.subSstOK - 1, par.subSstOK) * sustP(gS, par.sub) : 0;
    const rate = lamT * convT + lamS * convS;
    // the hours from the event to the depression: the wind rises from where the disturbance's environment holds it to devV (devVSub for a subtropical one) at devRate, then holds tdHold hours
    const vPre = c.low ? 22 : par.distV[0] + (par.distV[1] - par.distV[0]) * smooth01(eT, 0.3, 2.0), dlyT = Math.max(0, par.devV - vPre) / par.devRate + O.tdHold, dlyS = Math.max(0, par.devVSub - vPre) / par.devRate + O.tdHold;
    const dly = rate > 0 ? (lamT * convT * dlyT + lamS * convS * dlyS) / rate : dlyT;
    const hE = outlookEnd(par, c, alat, sst, lf, age);
    let step = Math.min(dt, end - h); const left = c.life > 0 ? c.born + c.life - h : Infinity;
    if (left <= 0) break;
    step = Math.min(step, left);
    const tot = rate + hE, mass = surv * (tot > 1e-12 ? (rate / tot) * (1 - Math.exp(-tot * step)) : rate * step);
    out.t.push(h); out.lat.push(lat); out.lon.push(lon); out.dt.push(step); out.dly.push(dly); out.rate.push(rate); out.mass.push(mass); out.surv.push(surv); out.lf.push(lf);
    surv *= Math.exp(-tot * step);
    // the mean motion over the step
    if (c.low) {
      const f = Math.exp(-dh / 48);
      lat = keepSide(lat, c.vy * f * step, par.eqSoft); lon += c.vx * f * step;
    } else {
      DACC[0] = 0; DACC[1] = 0; addDrift(M, 'weak', 1, tw, lat, lon, DACC);
      steerRing(env, lat, lon, F.ring, BUF); climAt(M, F.tw0, lat, lon, CV);
      const dec = Math.exp(-dh / A.steer), gn = par.driftGain.wv * dec;
      const tx = gn * (0.55 * (BUF[0] - CV[0]) + 0.45 * (BUF[2] - CV[2])), ty = gn * par.vGain * (0.55 * (BUF[1] - CV[1]) + 0.45 * (BUF[3] - CV[3]));
      ux += al * (tx - ux); uy += al * (ty - uy);
      lat = keepSide(lat, ((DACC[1] + uy) * KT_KMH * step) / KM_DEG, par.eqSoft); lon += ((DACC[0] + ux) * KT_KMH * step) / (KM_DEG * Math.max(0.2, Math.cos(lat * DEG)));
    }
    h += step;
    if (surv < 1e-4) break;
  }
  out.endT = h; out.endLat = lat; out.endLon = lon;
  return out;
}
Manager.prototype.outlook = function (env) {
  const slot = Math.floor(this.hour / 6), key = slot + '|' + (this.auto ? 1 : 0) + '|' + this.autoRate;
  if (this._ol && this._ol.key === key) return this._ol.res;
  const res = this._outlookCompute(env);
  this._ol = { key, res };
  return res;
};
Manager.prototype._outlookCompute = function (env) {
  const par = this.par, O = par.outlook, M = this.maps, H0 = this.hour, slot = Math.floor(H0 / 6), res = { issued: slot * 6, hour: H0, areas: [] };
  if (!M || !M.haz || !env || !O) return res;
  // what the issue before this one said about every disturbance (this.olMem): this issue moves on from it -- a chance by no more than O.rise / O.fall, a shape O.morph of the way to the new forecast, an arrow only after the gate has been shut for
  // a while -- and a disturbance seen for the first time starts low. Asked again within the same six hours (a placed system), the issue is made from the same last issue
  let mem = this.olMem;
  if (!mem || mem.slot !== slot) mem = this.olMem = { slot, prevSlot: mem ? mem.slot : -1e6, prev: mem ? mem.cur : {}, cur: {} }; else mem.cur = {};
  const gap = Math.max(1, slot - mem.prevSlot), fresh = gap * 6 <= O.memH, morph = 1 - Math.pow(1 - O.morph, gap);
  const ens = { act: 1 }; ensoOf(par, env, ens);
  const F = { M, env, H0, tw0: timeWeights(this.doyAt(H0) + (((H0 % 24) + 24) % 24) / 24), ring: M.ring != null ? M.ring : par.steerRing, sstRef: env.sstRef ? env.sstRef() + par.sstOffset : null, ensoMul: ens.act, shift: ens.shift };
  const cands = [];
  for (const S of this.systems) if (S.alive && S.th === 'wv') cands.push({ kind: S.kind || 'N', id: S.id, ck: S.ck || S.id, sys: S, lat: S.lat, lon: S.lon, ux: S.ux, uy: S.uy, q: S.q, h0: H0, born: S.born, life: S.life || 0, dev: S.dev, sust: S.sust, invest: S.invest });
  if (this.auto) for (const t of this.lows.tracks) {
    if (!t.alive || t.n < 3 || H0 - t.born < 6 || lowWeight(par, Math.abs(t.lat)) < 0.05 || env.isLand(t.lat, t.lon)) continue;
    cands.push({ kind: 'L', low: true, id: t.id, ck: t.id, track: t, lat: t.lat, lon: t.lon, vx: t.dx / 6, vy: t.dy / 6, h0: H0, born: t.born, life: 0, dev: -1, invest: t.invest });
  }
  if (this.auto) for (const b of this._peekBirths(env, F)) cands.push(b);
  const lim = (v, p) => Math.max(p - O.fall * gap, Math.min(p + O.rise * gap, v)), items = [];
  for (const c of cands) {
    const pr = fresh ? mem.prev[c.ck] : null, r = this._outlookRaw(F, c, pr); if (!r) continue;
    const ar = r.mode === 'arrow' ? (pr && pr.mode === 'arrow' ? pr.ar || 0 : 0) + (fresh ? gap : 1) : 0, cr = 1 - (1 - O.cred[1]) * clamp((ar - O.cred[0]) / O.cred[2], 0, 1);          // (the issues in a row it has pointed an arrow at where conditions will be right, and how much its chances are believed after that)
    let p7 = round5(100 * r.P7 * cr), p2 = Math.min(round5(100 * r.P2 * cr), p7);
    if (fresh) { if (pr) { p7 = lim(p7, pr.p7); p2 = lim(p2, pr.p2); } else if (c.kind !== 'M' || H0 - c.born >= 6) { p7 = Math.min(p7, O.firstP7); p2 = Math.min(p2, O.firstP2); } }          // (a hand-placed disturbance is shown at the chance it has the first time: it did not appear out of nowhere)
    p2 = Math.min(p2, p7);
    if (r.mode === 'in' && r.x && r.P2 >= O.favP2[0] && r.P2 < O.favP2[1] && p2 < 5) p2 = Math.min(5, p7);          // (in its shape means a 2-day chance: 0 is outside it, so the X that the band between the two values of favP2 keeps where it was has the 5 % it rounds up from)
    if (r.light) { if (p7 >= 5) mem.cur[c.ck] = { p2, p7 }; continue; }
    let chain = r.chain;
    if (pr && pr.chain && pr.chain.length === chain.length) {                          // the shape of the last issue, carried with the disturbance (while the X is inside its area), moved a share of the way to the new one
      const sh = pr.mode === 'in' && pr.x && r.x ? [r.x[0] - pr.x[0], r.x[1] - pr.x[1]] : [0, 0];                 // (a shape that was round its X rides with it, whatever it becomes: the arrow grows out of the X, not out of where the X was)
      chain = chain.map((q, i) => {
        if (i === 0 && r.mode === 'in' && r.x) return q;
        const o = pr.chain[i], la = o[0] + sh[0], lo = o[1] + sh[1]; let dla = morph * (q[0] - la), dlo = morph * (q[1] - lo);
        const dm = Math.hypot(dla, dlo * Math.cos(la * DEG)), mx = O.maxMove * gap; if (dm > mx) { dla *= mx / dm; dlo *= mx / dm; }          // (a shape never moves further than maxMove degrees in one issue)
        return [la + dla, lo + dlo, o[2] + clamp(morph * (q[2] - o[2]), -O.maxGrow * gap, O.maxGrow * gap)];
      });
    }
    let arrow = null, arrowR = 0;
    const mode = r.mode;
    if (mode === 'arrow') {                                                           // the X is outside its shape, an arrow of arrowMin degrees at the least to it: a shape still on its way from the X (it moves a share of the way each issue) has its head put that far from it, on the line it is moving away along
      const kx = Math.cos(r.x[0] * DEG), dl = Math.hypot(chain[0][0] - r.x[0], (chain[0][1] - r.x[1]) * kx);
      if (dl < O.arrowMin) { const dy = r.chain[0][0] - r.x[0], dx = (r.chain[0][1] - r.x[1]) * kx, L = Math.hypot(dy, dx) || 1; chain = chain.map((q, i) => (i ? q : [r.x[0] + (dy / L) * O.arrowMin, r.x[1] + (dx / L) * O.arrowMin / kx, q[2]])); }
      arrow = [r1(chain[0][0]), r1(chain[0][1])]; arrowR = chain[0][2];
    }
    chain = capChain(chain, O.maxLen * 1.25);                                          // (a shape that was drawn far from the disturbance it now belongs to is not stretched from one to the other for long)
    mem.cur[c.ck] = { p2, p7, mode: r.mode, ar, x: r.x, chain: chain.map((q) => [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100, Math.round(q[2] * 100) / 100]) };
    if (p7 < O.minP7) continue;
    items.push({ c, r, chain, mode, arrow, arrowR, p2, p7 });
  }
  // the shapes, the oldest disturbance first (a system that exists, then the ones still to be born in the order of their births): each is drawn clear of the ones before it, so that no two areas overlap and none has an outline
  // running through another -- its swath stops where it would come within O.gap degrees of a shape already drawn (the way a wave's area ends before the area of the wave ahead of it); an X always keeps the disc round it
  items.sort((a, b) => a.c.born - b.c.born || (a.c.ck < b.c.ck ? -1 : a.c.ck > b.c.ck ? 1 : 0));
  const placed = [];
  const clearOf = (chain, keepHead) => {
    if (!placed.length) return chain;
    const free = (la, lo, r) => {                                                      // is the disc [la, lo, r] at least O.gap clear of every shape drawn?
      const kx = Math.max(0.2, Math.cos(la * DEG));
      for (const CH of placed) for (let k = 0; k < Math.max(1, CH.length - 1); k++) {
        const a = CH[k], b = CH[Math.min(k + 1, CH.length - 1)], ax = a[1] * kx, bx = b[1] * kx, dx = bx - ax, dy = b[0] - a[0], px = lo * kx, L2 = dx * dx + dy * dy, t = L2 > 0 ? clamp(((px - ax) * dx + (la - a[0]) * dy) / L2, 0, 1) : 0;
        if (Math.hypot(px - (ax + t * dx), la - (a[0] + t * dy)) - (a[2] + t * (b[2] - a[2])) < r + O.gap) return false;
      }
      return true;
    };
    if (!free(chain[0][0], chain[0][1], chain[0][2])) return keepHead ? [chain[0]] : null;
    const out = [chain[0]];
    for (let i = 1; i < chain.length; i++) {
      const a = chain[i - 1], b = chain[i]; let ok = a;
      for (let q = 1; q <= 6; q++) { const u = q / 6, s2 = [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1]), a[2] + u * (b[2] - a[2])]; if (!free(s2[0], s2[1], s2[2])) { if (ok !== a || q > 1) out.push(ok); return out; } ok = s2; }
      out.push(b);
    }
    return out;
  };
  const arcLen = (ch) => { let L = 0; for (let i = 1; i < ch.length; i++) L += Math.hypot(ch[i][0] - ch[i - 1][0], (ch[i][1] - ch[i - 1][1]) * Math.cos((ch[i][0] + ch[i - 1][0]) / 2 * DEG)); return L; };
  const cutAt = (ch, L) => {                                                         // the chain cut where its length is L degrees
    const out = [ch[0]]; let run = 0;
    for (let i = 1; i < ch.length; i++) { const d = arcLen([ch[i - 1], ch[i]]); if (run + d >= L) { const w = d > 0 ? (L - run) / d : 0; out.push([ch[i - 1][0] + w * (ch[i][0] - ch[i - 1][0]), ch[i - 1][1] + w * (ch[i][1] - ch[i - 1][1]), ch[i - 1][2] + w * (ch[i][2] - ch[i - 1][2])]); return out; } out.push(ch[i]); run += d; }
    return out;
  };
  for (const { c, r, chain, mode, arrow, arrowR, p2, p7 } of items) {
    let ch = clearOf(chain, mode === 'in' && !!r.x); const rec = mem.cur[c.ck], pp = fresh ? mem.prev[c.ck] : null, pl = pp && pp.mode === r.mode ? pp.len : null;
    if (!ch) { rec.len = 0; continue; }
    if (pl != null && ch.length > 1) { const L = arcLen(ch), mx = pl + O.maxMove * gap; if (L > mx) ch = cutAt(ch, Math.max(mx, 0.01)); }          // (a shape that was held short by a neighbour grows back by no more than maxMove degrees an issue, as it moves by no more)
    const S = swathFull(ch, par.eqSoft);
    if (S.area < O.minArea) { rec.len = 0; continue; }
    rec.len = Math.round(arcLen(ch) * 100) / 100;
    placed.push(ch);
    res.areas.push({ key: c.ck, id: c.unborn ? null : c.id, kind: c.unborn ? 'unborn' : c.low ? 'low' : c.kind === 'W' ? 'wave' : c.kind === 'M' ? 'placed' : 'seed', x: r.x, arrow, arrowR, p2, p7, raw: [r.P2, r.P7], cls: outlookClass(O, p7),
      poly: S.poly, pole: S.pole, t0: r.t0, t1: r.t1, birth: c.unborn ? c.birth : null, invest: c.invest || '' });
  }
  res.areas.sort((a, b) => b.p7 - a.p7 || b.p2 - a.p2);
  res.areas.length = Math.min(res.areas.length, O.maxAreas);
  return res;
};
/* the systems the supply will make in the next horizon hours that a forecaster sees coming: the generators _spawn runs, asked for the hours ahead, kept while the hours to the birth are inside the system's lead */
Manager.prototype._peekBirths = function (env, F) {
  const par = this.par, O = par.outlook, H0 = F.H0, end = H0 + O.horizon, M = this.maps, out = [];
  const lead = (kind, key, hb) => { const L = O.lead[kind]; if (rnd(this.seed, key, hb, ST.LEAD) < L[2]) return -1; return L[0] + (L[1] - L[0]) * rnd(this.seed, key, hb + 1, ST.LEAD); };
  const add = (kind, key, hb, b, extra) => { const ld = lead(kind === 'F' ? 'F' : kind, key, hb); if (hb - H0 <= ld) out.push(Object.assign({ kind: kind === 'F' ? 'N' : kind, unborn: true, id: 'u' + kind + key + ':' + hb, ck: 'u' + kind + key + ':' + hb, lat: b.lat, lon: b.lon, h0: hb, born: hb, life: b.life || 0, dev: -1, ux: 0, uy: 0, q: null, birth: hb }, extra)); };
  if (basinOf(this.basin).waves) {
    let t = this.sched.waveT, spawn = this.sched.waveSpawn, k = this.sched.waveK;
    if (t == null) { const s = this._waveNext(H0, k); t = s.t; spawn = s.spawn; }
    for (let guard = 0; t < end && guard < 400; guard++) {
      if (spawn) { const hb = Math.max(H0, Math.ceil(t)); add('W', k, hb, this._waveBirth(k, hb)); k++; }
      const s = this._waveNext(t, k); t = s.t; spawn = s.spawn;
    }
  }
  for (let hb = H0; hb < end; hb++) {
    const tw = timeWeights(this.doyAt(hb) + (((hb % 24) + 24) % 24) / 24);
    for (const k of M.spawnCells || []) { const b = this._localSeed(k, hb, tw, F.shift, env); if (b) add('N', 1000 + k, hb, b); }
    const f = this._floorSeed(hb, env); if (f) add('F', 90001, hb, f);
  }
  return out;
};
/* what the forecast says about one candidate, before the last issue is taken into account (pr: the last issue's record of it, or null): the chances of formation within 2 and 7 days (P2, P7), whether its X sits in the area ('in') or points to
   it ('arrow'; 'none': no X, it does not exist yet), the swath as nine discs (chain) over the window of formation, and the window in hours from now. Null when nothing is worth recording; { light: true } when the chance is too low to be drawn
   and only the chances are kept */
Manager.prototype._outlookRaw = function (F, c, pr) {
  const par = this.par, O = par.outlook, H0 = F.H0, R = O.horizon, N9 = 9;
  const radius = (t) => O.r0 + O.r1 * Math.max(0, t - H0) / 24 + (c.unborn ? O.rUnborn : 0);
  if (c.dev >= 0) {                                                                    // developing: the event has happened, the depression is a few hours off
    const S = c.sys, tf = Math.max(0, c.dev + (par.devV - Math.min(par.devV, S.v)) / par.devRate + O.tdHold - H0), sustF = c.sust === false ? 0.3 : 1, spd = [S.cx || 0, S.cy || 0];
    const hE = outlookEnd(par, Object.assign({}, c, { kind: S.kind }), Math.abs(c.lat), F.env.sst(c.lat, c.lon) + par.sstOffset, landFraction(F.env, c.lat, c.lon, par.landSample), H0 - c.born), P = Math.min(0.995, O.tdShare * sustF * Math.exp(-hE * tf)), t1 = Math.max(6, tf), chain = [];
    for (let i = 0; i < N9; i++) { const t = t1 * i / (N9 - 1); chain.push([keepSide(c.lat, (spd[1] * KT_KMH * t) / KM_DEG, par.eqSoft), c.lon + (spd[0] * KT_KMH * t) / (KM_DEG * Math.max(0.2, Math.cos(c.lat * DEG))), radius(H0 + t)]); }
    return { ck: c.ck, P2: P, P7: P, mode: 'in', x: [c.lat, c.lon], chain, t0: 0, t1 };
  }
  const fo = outlookFollow(this, F, c), n = fo.t.length; if (!n) return null;
  const tBeg = (i) => fo.t[i] + fo.dly[i];                                             // the depression forms `dly` hours after the event
  const cumAt = (X) => { let s = 0; for (let i = 0; i < n; i++) s += fo.mass[i] * clamp((X - tBeg(i)) / fo.dt[i], 0, 1); return s; };
  const P7 = cumAt(H0 + R), P2 = cumAt(H0 + 48), p7r = round5(100 * P7);
  if (p7r < O.minP7 && !(pr && pr.p7 >= O.minP7)) return p7r >= 5 || pr ? { ck: c.ck, P2, P7, light: true } : null;
  const timeAt = (x) => { let lo = H0, hi = H0 + R; for (let it = 0; it < 24; it++) { const mid = (lo + hi) / 2; if (cumAt(mid) >= x) hi = mid; else lo = mid; } return hi; };
  const tq0 = timeAt(O.win[0] * P7), tq1 = timeAt(O.win[1] * P7);
  const pos = (x) => {                                                                 // the place of the mean track at hour x
    if (x <= fo.t[0]) return [fo.lat[0], fo.lon[0]];
    for (let i = 0; i < n; i++) { const e = fo.t[i] + fo.dt[i]; if (x < e) { const w = (x - fo.t[i]) / fo.dt[i], la1 = i + 1 < n ? fo.lat[i + 1] : fo.endLat, lo1 = i + 1 < n ? fo.lon[i + 1] : fo.endLon; return [fo.lat[i] + w * (la1 - fo.lat[i]), fo.lon[i] + w * (lo1 - fo.lon[i])]; } }
    return [fo.endLat, fo.endLon]; };
  let mode = c.unborn ? 'none' : 'in', ts = c.unborn ? tq0 : H0;
  if (!c.unborn && P2 < (pr && pr.mode === 'in' ? O.favP2[0] : O.favP2[1])) {         // nothing is expected in the next two days (a 2-day chance of 0): the disturbance is not in favourable conditions yet, so it is not in its shape -- an arrow runs from it to where the chance starts to build up
    const away = (q) => Math.hypot(q[0] - c.lat, (q[1] - c.lon) * Math.cos(c.lat * DEG)), cap = pr && pr.mode === 'arrow' ? O.arrowMax[1] : O.arrowMax[0];
    let t = Math.max(timeAt(Math.min(O.onsetP, 0.5 * P7)), H0 + 3), d = away(pos(t));
    while (d < O.arrowMin && t < H0 + R) { t += 3; d = away(pos(t)); }                 // (a slow disturbance: the shape starts as far from it as an arrow is long at the least)
    if (d > cap) return { ck: c.ck, P2, P7, light: true };                              // (the chance builds up too far ahead to point to: the area is not drawn until it is nearer, its chance is kept)
    if (d >= O.arrowMin) { mode = 'arrow'; ts = t; }
  }
  let te = Math.min(Math.max(tq1, ts + 6), ts + O.maxSpan);                            // no more than maxSpan hours of track, and not on past the coast
  for (let i = 0; i < n; i++) if (fo.t[i] > ts && fo.lf[i] >= 0.6) { te = Math.min(te, Math.max(ts + 6, fo.t[i])); break; }
  { let len = 0, last = pos(ts);                                                       // and no more than maxLen degrees of it
    for (let t = ts + 3; t <= te + 1e-9; t += 3) { const q = pos(t); len += Math.hypot(q[0] - last[0], (q[1] - last[1]) * Math.cos(q[0] * DEG)); last = q; if (len > O.maxLen) { te = Math.max(ts + 6, t); break; } } }
  const chain = []; for (let i = 0; i < N9; i++) { const t = ts + (te - ts) * i / (N9 - 1), q = pos(t); chain.push([q[0], q[1], radius(t)]); }
  if (mode === 'in' && !c.unborn) chain[0] = [c.lat, c.lon, radius(H0)];
  return { ck: c.ck, P2, P7, mode, x: c.unborn ? null : [c.lat, c.lon], chain, t0: ts - H0, t1: te - H0 };
};

/* a forecast / preview: the same physics through an environment source, on a copy, with the noise the placed storm would have */
/* a live system one hour on, stepped by the engine's own physics on a copy (nothing of the real state changes): the radar floater's look-ahead, so it can run inside the hour between two real states.
   The real step also runs the manager's merges after it; the copy does not, so a system that a merge removes at that hour is still there in the look-ahead. */
Manager.prototype.peek = function (id, envSrc) {
  const S0 = this.byId[id]; if (!S0 || !S0.alive) return null;
  const h = this.hour, env = envSrc && typeof envSrc.at === 'function' ? envSrc.at(h) : envSrc, doy = this.doyAt(h), ctx = { maps: this.maps, tw: null, diag: null };
  if (env && env.beginHour) env.beginHour(h);                                  // (told the hour, as the real step is; asking twice about the same hour changes nothing)
  if (this.maps) { ctx.tw = timeWeights(doy + (((h % 24) + 24) % 24) / 24); ctx.act = activityFactor(this.par, this.seed, seasonYearOf(this.startMs + h * HOUR_MS, this.seasonMonth), h); ensoOf(this.par, env, ctx); }
  const S = cloneSystem(S0); stepSystem(S, env, h, this.seed, this.par, doy, ctx); return S;
};
Manager.prototype.forecast = function (spec, envSrc, horizonH) {
  const S = this.pendingPlacement(spec), par = this.par, fixes = [];
  let h = S.born, ace = 0, peak = { v: 0, h, p: 1020 }, named = false, td = S.th === 'tc' || S.th === 'sc';
  fixes.push(makeFix(S, h, 0));
  const ctx = { maps: this.maps, tw: null, diag: null };
  for (let k = 0; k < horizonH && S.alive; k++) {
    const env = envSrc && typeof envSrc.at === 'function' ? envSrc.at(h) : envSrc;
    const doy = this.doyAt(h);
    if (this.maps) { ctx.tw = timeWeights(doy + (((h % 24) + 24) % 24) / 24); ctx.act = activityFactor(par, this.seed, seasonYearOf(this.startMs + h * HOUR_MS, this.seasonMonth), h); ensoOf(par, env, ctx); }
    stepSystem(S, env, h, this.seed, par, doy, ctx); h++;
    if (h % 3 === 0 || !S.alive) {
      const rv = round5(S.vr), isTC = S.th === 'tc' || S.th === 'sc';
      if (isTC && rv >= 34) { if (h % 6 === 0) ace += aceOf(rv); named = true; }
      if (isTC) td = true;
      if (isTC && rv > peak.v) peak = { v: rv, h, p: Math.round(S.p) };
      fixes.push(makeFix(S, h, ace));
    }
  }
  return { id: S.id, fixes, peak, developed: td, named, ace: Math.round(ace * 100) / 100, alive: S.alive, endReason: S.endReason, endHour: S.end };
};

/* ---- ensembles ---------------------------------------------------------------------------------------------------------------------------------------------------------
   A member is a copy of the live system stepped by the engine's own physics through the page's own weather of the next days, with what a forecast does not know made different from member to member: where the
   features that steer it (a ridge's edge, a trough) are, how fast the flow really is, a little of the shear, sea temperature and humidity it feels, and the draws of chance (wobble, rapid intensification,
   genesis). The sizes grow with lead and are scaled by how well a system of that strength can be forecast (ensFactor): a wave is a wide fan, a hurricane a tight one. A member's coefficients are a pure function of the
   seed, the system and the member, never of the hour of the issue, so a fan made six hours later is the same fan moved on by what changed, not a new one. */
const ENS_FAM = [['GEFS', 'p', 10], ['ECENS', 'e', 8], ['CMCE', 'c', 6]];
function cloneSystem(S) { const C = Object.assign({}, S); C.fixes = []; C.ri = S.ri ? Object.assign({}, S.ri) : null; C.exEp = S.exEp ? Object.assign({}, S.exEp) : null; C.rq = S.rq ? S.rq.slice() : S.rq; C.erc = S.erc ? Object.assign({}, S.erc) : null; C.w = S.w ? S.w.slice() : S.w; return C; }
const ensFactor = (E, v) => E.f[0] + (E.f[1] - E.f[0]) * smooth01(v, E.f[2], E.f[3]);
function ensCoef(seed, tid, k) {
  const z = (j) => rndn(seed, tid, k * 32 + j, ST.ENS);
  return { dla: z(0), dlo: z(1), dla2: z(2), dlo2: z(3), eu: z(4), ev: z(5), eu2: z(6), ev2: z(7), ph: 6.2832 * rnd(seed, tid, k * 32 + 8, ST.ENS), shr: z(9), sst: z(10), rh: z(11), pla: z(12), plo: z(13), pv: z(14), salt: hash5(seed, tid, k, ST.ENS, 99) };
}
function ensCommon(seed, tid, H0) {                                          // the error all members share: drawn per 48-hour epoch and interpolated, so it drifts from one issue to the next instead of being drawn again
  const ep = Math.floor(H0 / 48), u = (H0 - ep * 48) / 48, a = ensCoef(seed, tid, 100000 + ep), b = ensCoef(seed, tid, 100001 + ep), n = Math.sqrt((1 - u) * (1 - u) + u * u), C = {};
  for (const k of Object.keys(a)) C[k] = k === 'salt' ? a[k] : ((1 - u) * a[k] + u * b[k]) / n;
  return C;
}
function ensEnv(E, f, C, Cc) {                                                   // the weather one member sees: the base environment with its own errors, a wrapper whose `at(base, lead)` sets the hour
  const W = { base: null, box: null, ds: 0, dr: 0, sm: 0, dla: 0, dlo: 0, eu: 0, ev: 0, sstRef: undefined, enso: undefined };
  W.isLand = (la, lo) => W.base.isLand(la, lo);
  W.sst = (la, lo) => W.base.sst(la, lo) + W.ds; W.rh = (la, lo) => W.base.rh(la, lo) + W.dr; W.shear = (la, lo) => W.base.shear(la, lo) * (1 + W.sm);
  W.steer = (la, lo, out) => {
    W.base.steer(la + W.dla, lo + W.dlo / Math.max(0.3, Math.cos(la * DEG)), out);
    out[0] += W.eu; out[2] += W.eu; out[4] += W.eu; out[1] += W.ev; out[3] += W.ev; out[5] += W.ev;
  };
  W.at = (base, lead) => {
    const u = Math.min(Math.max(lead, 0), 192) / 168, ramp = Math.min(1, lead / E.ramp), sw = Math.sin(lead / 41 + C.ph);
    const sd = f * (E.disp[0] + E.disp[1] * Math.pow(u, E.disp[2])), vs = f * (E.vec[0] + E.vec[1] * u), g = E.common;
    W.base = base; W.box = base.box; W.sstRef = base.sstRef ? () => base.sstRef() : undefined; W.enso = base.enso ? () => base.enso() : undefined;
    W.dla = sd * (C.dla + 0.5 * C.dla2 * sw + g * (Cc.dla + 0.5 * Cc.dla2 * sw)); W.dlo = sd * (C.dlo + 0.5 * C.dlo2 * sw + g * (Cc.dlo + 0.5 * Cc.dlo2 * sw));
    W.eu = vs * (C.eu + 0.5 * C.eu2 * sw + g * (Cc.eu + 0.5 * Cc.eu2 * sw)); W.ev = vs * (C.ev + 0.5 * C.ev2 * sw + g * (Cc.ev + 0.5 * Cc.ev2 * sw));
    W.sm = f * E.shear * (C.shr + g * Cc.shr) * ramp; W.ds = f * E.sst * (C.sst + g * Cc.sst) * ramp; W.dr = f * E.rh * (C.rh + g * Cc.rh) * ramp;
    return W;
  };
  return W;
}
/* target: the id of a system (a cyclone, a wave, a seed) or of a tracked low ('L12'); envSrc: { at(h) } or an environment (the page's shadow weather). Returns null for something that is not there. */
Manager.prototype.ensemble = function (target, envSrc, opts) {
  const par = this.par, E = opts && opts.ens ? mergeParams(par.ens, opts.ens) : par.ens, H0 = this.hour, n = (opts && opts.n) || E.n;
  let S0 = typeof target === 'string' ? this.byId[target] : target, tid;
  if (S0 && !S0.alive) return null;
  if (!S0) {                                                               // a tracked low: the same low a placed one is, moving as the track moved over its last six hours
    const t = this.lows.tracks.find((q) => q.id === target); if (!t || !t.alive) return null;
    S0 = this.pendingPlacement({ kind: 'low', lat: t.lat, lon: t.lon, hour: H0 }); const k = 111.2 / 6 / 1.852;
    S0.cx = (t.dx || 0) * Math.cos(t.lat * DEG) * k; S0.cy = (t.dy || 0) * k; tid = 1e6 + (t.born | 0);
  } else tid = S0.num | 0;
  const f = ensFactor(E, S0.vr) * (S0.th === 'wv' ? E.wv : 1), horizon = Math.min(E.horizon, (opts && opts.horizon) || E.horizon);
  const Cc = ensCommon(this.seed, tid, H0), members = [], labels = []; for (const F of ENS_FAM) for (let i = 0; i < F[2]; i++) labels.push([F[0], F[1] + String(i + 1).padStart(2, '0')]);
  const run = [];
  for (let k = 0; k < n; k++) {
    const L = labels[k % labels.length], C = ensCoef(this.seed, tid, k), W = ensEnv(E, f, C, Cc), S = cloneSystem(S0);
    S.lat += E.pos * f * (C.pla + E.common * Cc.pla); S.lon += (E.pos * f * (C.plo + E.common * Cc.plo)) / Math.max(0.3, Math.cos(S.lat * DEG)); { const dv = E.dv * f * (C.pv + E.common * Cc.pv); S.v = Math.max(5, S.v + dv); S.vr = Math.max(5, S.vr + dv); }
    run.push({ k, L, C, W, S, ctx: { maps: this.maps, tw: null, diag: null, keep: true }, pts: [[S.lat, S.lon, Math.round(S.vr), S.th, Math.round(S.p), S.w ? S.w[0] : 0, S.w ? S.w[1] : 0, S.w ? S.w[2] : 0]], peak: S.vr });
  }
  for (let q = 0; q < horizon; q++) {                                       // hour by hour, all members together: the page's weather carries its steering forward in place, so the environment of an hour has to be read at that hour and used before the next is asked for
    const h = H0 + q, base = envSrc && typeof envSrc.at === 'function' ? envSrc.at(h) : envSrc, doy = this.doyAt(h), cx = { maps: this.maps, tw: null, diag: null };
    if (this.maps) { cx.tw = timeWeights(doy + (((h % 24) + 24) % 24) / 24); cx.act = activityFactor(par, this.seed, seasonYearOf(this.startMs + h * HOUR_MS, this.seasonMonth), h); ensoOf(par, base, cx); }
    for (const m of run) {
      const S = m.S; if (!S.alive) continue;
      m.ctx.tw = cx.tw; m.ctx.act = cx.act; m.ctx.shift = cx.shift;
      stepSystem(S, m.W.at(base, q), h, m.C.salt, par, doy, m.ctx);
      if (S.vr > m.peak) m.peak = S.vr;
      if ((q + 1) % 3 === 0 || !S.alive) m.pts.push([S.lat, S.lon, Math.round(S.vr), S.th, Math.round(S.p), S.w ? S.w[0] : 0, S.w ? S.w[1] : 0, S.w ? S.w[2] : 0]);
    }
  }
  for (const m of run) members.push({ k: m.k, name: m.L[0] + ' ' + m.L[1], fam: m.L[0], pts: m.pts, peak: Math.round(m.peak), hours: Math.min(horizon, (m.pts.length - 1) * 3), alive: m.S.alive });
  return { init: H0, id: S0.id || target, factor: f, start: [S0.lat, S0.lon], members };
};
/* the cone of uncertainty: the consensus of a fan (the mean of the members still alive) with a circle round it as big as the NHC's mean track error at that lead (par.cone: 26 nmi at 12 h to 220 at 120 h), so the cone is the
   same size for every storm whatever the fan looks like. The centre line is a smooth curve: the consensus is smoothed over a few hours and read every 12 hours, and a monotone cubic (pchip) runs through those points, so it
   never wiggles, overshoots or loops the way the mean of a few dozen tracks does where members come and go; the circles' sizes run through the NHC's numbers the same way. The points at 12, 24, 36, 48, 72, 96 and 120 h are read off that
   curve and carry the wind, the pressure and the class letter (the tag of the class the page colours the point with in the basin's scale: D, S, H, M for the NHC, D S SS T ST VT SU in the West Pacific, the category numbers in Australia ...; grey when most members are post-tropical). A new cone is blended with the last one by valid time -- all the way to the
   new forecast near the start (it must begin at the storm), half way beyond a day and a half -- so it moves part of the way to a changed forecast and never jumps. */
function pchip(xs, ys) {                                                     // the monotone cubic through the points (Fritsch-Carlson): no overshoot, so no wiggle
  const n = xs.length; if (n === 1) return () => ys[0];
  const h = [], d = []; for (let i = 0; i < n - 1; i++) { h.push(xs[i + 1] - xs[i]); d.push((ys[i + 1] - ys[i]) / h[i]); }
  if (n === 2) return (x) => ys[0] + d[0] * (x - xs[0]);
  const m = new Array(n), sg = Math.sign;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] > 0 ? 3 * (h[i - 1] + h[i]) / ((2 * h[i] + h[i - 1]) / d[i - 1] + (h[i] + 2 * h[i - 1]) / d[i]) : 0;
  const end = (h0, h1, d0, d1) => { let e = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1); if (sg(e) !== sg(d0)) e = 0; else if (sg(d0) !== sg(d1) && Math.abs(e) > 3 * Math.abs(d0)) e = 3 * d0; return e; };
  m[0] = end(h[0], h[1], d[0], d[1]); m[n - 1] = end(h[n - 2], h[n - 3], d[n - 2], d[n - 3]);
  return (x) => {
    let k = 0; while (k < n - 2 && x > xs[k + 1]) k++;
    const t = Math.min(1, Math.max(0, (x - xs[k]) / h[k])), t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h[k] * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h[k] * m[k + 1];
  };
}
const coneRCache = new Map();
function coneRadius(K, lead) {                                               // degrees of latitude: the NHC's circles through a monotone curve, not a polyline
  let f = coneRCache.get(K); if (!f) { f = pchip(K.h, K.nmi); coneRCache.set(K, f); }
  return f(Math.min(Math.max(lead, K.h[0]), K.h[K.h.length - 1])) / 60;
}
const coneLetter = (v, scale) => { const S = scale || SCALES.nhc, C = S.classes, r = round5(v); let k = 0; for (let i = 0; i < C.length; i++) if (r >= C[i][0]) k = i; return S.tag[k]; };       // by the class the point is coloured with (the wind in 5-kt steps in the basin's scale), so the letter and the colour can never disagree
function coneOf(E, par, prev, scale) {
  if (!E || !E.members.length) return null;
  const K = par.cone, N = E.members.length, rows = [];
  for (let i = 0; i < 41; i++) {
    const A = E.members.filter((m) => m.pts.length > i); if (A.length < K.minAlive * N) break;
    const med = (j) => { const v = A.map((m) => m.pts[i][j]).sort((a, b) => a - b); return v[Math.floor((v.length - 1) / 2)]; };
    const la = A.reduce((t, m) => t + m.pts[i][0], 0) / A.length, lo = A.reduce((t, m) => t + m.pts[i][1], 0) / A.length, post = A.filter((m) => m.pts[i][3] === 'ex' || m.pts[i][3] === 'nl').length > A.length / 2;
    const th = post ? (A.filter((m) => m.pts[i][3] === 'nl').length > A.filter((m) => m.pts[i][3] === 'ex').length ? 'nl' : 'ex') : (A.filter((m) => m.pts[i][3] === 'wv').length > A.length / 2 ? 'wv' : A.filter((m) => m.pts[i][3] === 'sc').length > A.length / 2 ? 'sc' : 'tc');
    const mr = (j) => { const v = A.map((m) => m.pts[i][j] || 0).sort((a, b) => a - b); return v[Math.floor((v.length - 1) / 2)]; };       // (the wind radii the members carry: the median, 0 where fewer than half have such winds)
    rows.push({ lat: la, lon: lo, v: med(2), p: med(4), r34: mr(5), r50: mr(6), r64: mr(7), th, lead: i * 3, t: E.init + i * 3 });
  }
  if (!rows.length) return null;
  const last = (rows.length - 1) * 3, leads = []; for (let l = 0; l <= last; l += 12) leads.push(l); if (last % 12) leads.push(last);
  const sm = (i, key) => {                                                  // (a few hours of the consensus: the mean of a few dozen tracks has small steps where members come and go) a straight line fitted through the rows within 6 hours, read at the row: smooth, and no lag where the track ends
    if (i === 0) return rows[0][key];
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let d = -2; d <= 2; d++) { const r = rows[i + d]; if (!r) continue; const w = 3 - Math.abs(d); sw += w; sx += w * d; sy += w * r[key]; sxx += w * d * d; sxy += w * d * r[key]; }
    const den = sw * sxx - sx * sx; return den > 1e-9 ? (sy * sxx - sx * sxy) / den : sy / sw;
  };
  const KEYS = ['lat', 'lon', 'v', 'p', 'r34', 'r50', 'r64'];
  let ctrl = leads.map((l) => { const c = { lead: l }; for (const k of KEYS) c[k] = sm(l / 3, k); return c; });
  if (prev && prev.init < E.init && E.init - prev.init <= 24 && prev.at) {
    ctrl = ctrl.map((c) => {
      const o = prev.at(E.init + c.lead - prev.init); if (!o) return c;
      const w = 1 - (1 - K.blend[2]) * smooth01(c.lead, K.blend[0], K.blend[1]);
      const r = { lead: c.lead }; for (const k of KEYS) r[k] = o[k] + w * (c[k] - o[k]); return r;
    });
  }
  const xs = ctrl.map((c) => c.lead), f = {}; for (const k of KEYS) f[k] = pchip(xs, ctrl.map((c) => c[k]));
  const at = (lead) => (lead < 0 || lead > last + 1e-9 ? null : { lat: f.lat(lead), lon: f.lon(lead), v: f.v(lead), p: f.p(lead), r34: Math.max(0, f.r34(lead)), r50: Math.max(0, f.r50(lead)), r64: Math.max(0, f.r64(lead)) });
  const out = rows.map((r) => { const q = at(r.lead); return { lat: q.lat, lon: q.lon, v: q.v, p: Math.round(q.p), r34: q.r34, r50: q.r50, r64: q.r64, th: r.th, lead: r.lead, t: r.t }; });
  const leadsP = K.pts.filter((h) => h <= last), pre = leadsP.length ? leadsP[leadsP.length - 1] : 0;
  if (last >= K.pts[0] && last - pre >= 6 && last % 3 === 0) leadsP.push(last);                    // a cone that ends early (the system is gone by then) still ends in a point, the last hour of the forecast
  const pts = leadsP.map((h) => { const q = at(h), v = Math.max(5, round5(q.v)), th = out[h / 3].th; return { lead: h, t: E.init + h, lat: q.lat, lon: q.lon, v, p: Math.round(q.p), th, letter: coneLetter(v, scale), post: th === 'ex' || th === 'nl', end: K.pts.indexOf(h) < 0 }; });
  return { init: E.init, id: E.id, rows: out, pts, chain: out.map((q) => [q.lat, q.lon, coneRadius(K, q.lead)]), ctrl, at: (T) => at(T), line: Array.from({ length: last + 1 }, (_, l) => Object.assign(at(l), { th: out[Math.min(out.length - 1, Math.round(l / 3))].th })) };
}
/* ---- watches and warnings -----------------------------------------------------------------------------------------------------------------------------------------------
   The cones of all the active cyclones (the consensus track, intensity and wind radii every hour to 72, each with the NHC's error circle) become one map of alerts on a grid in (longitude, Mercator y), an eighth of a degree a cell, land or sea (the page paints
   only the land and the coast). For each cell and each cone: Te, the first hour the forecast's 34 kt radius plus a part of the error circle (the winds are expected there) reaches the cell, and Tp, the same with all of the error circle (they are possible).
   Hurricane force the same with the 64 kt radius (a storm forecast at 60 kt or more counts for half of its 50 kt radius). The codes: 1 tropical storm watch, 2 hurricane watch, 3 tropical storm warning, 4 hurricane watch with a tropical storm warning,
   5 hurricane warning, 6 high wind warning (a post-tropical or remnant cyclone's field, Th within 24 hours). A warning is Te <= 36 h, a watch Tp <= 48 h; the NHC times both from the onset of tropical-storm-force winds, so a hurricane warning is the cell
   where hurricane force is expected and tropical-storm force arrives within 36 hours. The last issue is remembered (prev): a cell that had a warning keeps one while the threat is anywhere in the next 72 hours, a watch likewise, so an area is not dropped
   and picked up again as the forecast wobbles; it is cancelled when the forecast no longer reaches it (the storm has passed or has dissipated). Overlapping cyclones take the higher code. */
const unmercY = (y) => (2 * Math.atan(Math.exp(y * DEG)) - Math.PI / 2) / DEG;
const ALERT_RANK = [0, 2, 3, 4, 5, 6, 1];                                        // the order of severity of the codes (a high wind warning is the least)
function alertsOf(cones, env, par, prev) {
  const A = par.alerts, K = par.cone, d = A.cell, H = Math.min(A.keepH, 72);
  const cs = (cones || []).filter((C) => C && C.line && C.line.length > 1);
  if (!cs.length) return { init: cones && cones[0] ? cones[0].init : null, cell: d, x0: 0, y0: 0, nx: 0, ny: 0, code: new Uint8Array(0), at: () => 0, n: 0 };
  const tracks = cs.map((C) => { const L = []; for (let t = 0; t <= H && t < C.line.length; t++) { const q = C.line[t], cone = coneRadius(K, t) * 60, post = q.th === 'ex' || q.th === 'nl', r34 = q.r34 > 0 ? q.r34 : q.v >= 30 ? 25 : 0, hr = q.v >= 64 ? q.r64 : q.v >= 60 ? 0.5 * q.r50 : 0; L.push({ lat: q.lat, lon: q.lon, post, r34, r64: q.r64 > 1 ? q.r64 : 0, hr, cone, v: q.v }); } return L; });
  let la0 = 90, la1 = -90, lo0 = 1e9, lo1 = -1e9;
  for (const L of tracks) { L.bb = [90, -90, 1e9, -1e9]; for (const q of L) { const reach = (Math.max(q.r34, 25) + A.mPos[0] * q.cone + A.mPos[1] + 15) / 60, lr = reach / Math.max(0.3, Math.cos(q.lat * DEG)); la0 = Math.min(la0, q.lat - reach); la1 = Math.max(la1, q.lat + reach); lo0 = Math.min(lo0, q.lon - lr); lo1 = Math.max(lo1, q.lon + lr); L.bb[0] = Math.min(L.bb[0], q.lat - reach); L.bb[1] = Math.max(L.bb[1], q.lat + reach); L.bb[2] = Math.min(L.bb[2], q.lon - lr); L.bb[3] = Math.max(L.bb[3], q.lon + lr); } }
  const B = env && env.box; if (B) { la0 = Math.max(la0, B.lat0); la1 = Math.min(la1, B.lat1); lo0 = Math.max(lo0, B.lon0); lo1 = Math.min(lo1, B.lon1); }
  const x0 = Math.floor(lo0 / d) * d, y0 = Math.floor(mercY(la0) / d) * d, nx = Math.max(1, Math.ceil((lo1 - x0) / d)), ny = Math.max(1, Math.ceil((mercY(la1) - y0) / d)), code = new Uint8Array(nx * ny);
  const at = (lat, lon) => { const i = Math.floor((lon - x0) / d), j = Math.floor((mercY(lat) - y0) / d); return i < 0 || j < 0 || i >= nx || j >= ny ? 0 : code[j * nx + i]; };
  for (let j = 0; j < ny; j++) {
    const lat = unmercY(y0 + (j + 0.5) * d), cl = Math.cos(lat * DEG) * 60;
    for (let i = 0; i < nx; i++) {
      const lon = x0 + (i + 0.5) * d, pc = prev && prev.at ? prev.at(lat, lon) : 0; let best = 0;
      for (const L of tracks) {
        if (lat < L.bb[0] || lat > L.bb[1] || lon < L.bb[2] || lon > L.bb[3]) continue;                // (a cell far from this storm's whole swath)
        let Te = 1e9, Tp = 1e9, Th = 1e9, hurrE = false, hurrP = false;
        for (let t = 0; t < L.length; t++) {
          const q = L[t], dn = Math.hypot((lon - q.lon) * cl, (lat - q.lat) * 60);
          if (q.post) { if (Th === 1e9 && q.r34 > 0 && dn <= q.r34 + A.hwwM * q.cone + 10) Th = t; continue; }
          if (Te === 1e9 && q.r34 > 0 && dn <= q.r34 + A.mExp[0] * q.cone + A.mExp[1]) Te = t;
          if (Tp === 1e9 && q.r34 > 0 && dn <= q.r34 + A.mPos[0] * q.cone + A.mPos[1]) Tp = t;
          if (q.r64 > 0 && dn <= q.r64 + A.mExp[0] * q.cone + A.mExp[1]) hurrE = true;
          if (q.hr > 0 && dn <= Math.max(q.r64, q.hr) + A.mPos[0] * q.cone + A.mPos[1]) hurrP = true;
        }
        const warnHad = pc >= 3 && pc <= 5, watchHad = pc >= 1 && pc <= 5;
        const warn = Te <= A.warnH || (warnHad && Te <= A.keepH), watch = warn || Tp <= A.watchH || (watchHad && Tp <= A.keepH);
        let c = 0;
        if (warn && hurrE) c = 5; else if (warn) c = hurrP ? 4 : 3; else if (watch) c = hurrP ? 2 : 1;
        else if (Th <= A.hwwH || (pc === 6 && Th <= A.hwwKeep)) c = 6;
        if (ALERT_RANK[c] > ALERT_RANK[best]) best = c;
      }
      code[j * nx + i] = best;
    }
  }
  return { init: cs[0].init, cell: d, x0, y0, nx, ny, code, at, n: cs.length };
}
/* the track density: the share of the members that pass within a footprint of each cell of a grid in (longitude, Mercator y), both in degrees, so that it lands exactly on the page's projection */
const mercY = (lat) => (Math.log(Math.tan(Math.PI / 4 + Math.min(85, Math.max(-85, lat)) * DEG / 2)) / DEG);
function ensDensity(members, o) {
  const E = (o && o.foot) || [0.6, 1.4], N = members.length; if (!N) return null;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const m of members) for (const q of m.pts) { const y = mercY(q[0]); x0 = Math.min(x0, q[1]); x1 = Math.max(x1, q[1]); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const pad = 2.2 * E[1] / Math.max(0.2, Math.cos(((y0 + y1) / 2) * 0.5 * DEG)), cell = Math.max(0.1, Math.max(x1 - x0, y1 - y0) / 220);
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const nx = Math.ceil((x1 - x0) / cell) + 1, ny = Math.ceil((y1 - y0) / cell) + 1, cnt = new Float32Array(nx * ny), mark = new Int32Array(nx * ny);
  members.forEach((m, k) => {
    const stamp = (x, y, r) => {                                           // r in degrees of mercator space (a circle there is a circle on the map)
      const i0 = Math.max(0, Math.floor((x - r - x0) / cell)), i1 = Math.min(nx - 1, Math.ceil((x + r - x0) / cell)), j0 = Math.max(0, Math.floor((y - r - y0) / cell)), j1 = Math.min(ny - 1, Math.ceil((y + r - y0) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const dx = x0 + i * cell - x, dy = y0 + j * cell - y; if (dx * dx + dy * dy <= r * r) { const c = j * nx + i; if (mark[c] !== k + 1) { mark[c] = k + 1; cnt[c]++; } } }
    };
    for (let a = 0; a < m.pts.length; a++) {
      const A = m.pts[a], B = m.pts[Math.min(a + 1, m.pts.length - 1)], ya = mercY(A[0]), yb = mercY(B[0]), L = Math.hypot(B[1] - A[1], yb - ya), steps = Math.max(1, Math.ceil(L / (0.5 * cell)));
      for (let s2 = 0; s2 < (a + 1 < m.pts.length ? steps : 1); s2++) {
        const u = s2 / steps, lead = (a + u) * 3, la = A[0] + u * (B[0] - A[0]), rr = (E[0] + (E[1] - E[0]) * Math.min(1, lead / 168)) / Math.max(0.2, Math.cos(la * DEG));
        stamp(A[1] + u * (B[1] - A[1]), ya + u * (yb - ya), rr);
      }
    }
  });
  const f = new Float32Array(nx * ny); for (let c = 0; c < f.length; c++) f[c] = cnt[c] / N;
  for (let pass = 0; pass < 1; pass++) {                                    // a light 3 x 3 blur: the edge of a footprint is not a staircase
    const g = new Float32Array(f.length);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let t = 0, w = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const jj = j + dj, ii = i + di; if (jj >= 0 && jj < ny && ii >= 0 && ii < nx) { const wt = (di ? 1 : 2) * (dj ? 1 : 2); t += wt * f[jj * nx + ii]; w += wt; } } g[j * nx + i] = t / w; }
    f.set(g);
  }
  return { lon0: x0, my0: y0, dlon: cell, dmy: cell, nx, ny, frac: f };
}

/* The season summary: one uniform record for any season of this run -- the current one, one that has ended but still has a storm alive
   (its counters keep running in `prev`), or an archived one. Cyclones only (those that got a depression number), in order of formation. */
Manager.prototype.seasonYears = function () { return this.archive.map((e) => e.year).concat([this.season.year]); };
Manager.prototype.seasonRecord = function (year) {
  const byDep = (a, b) => a.depNum - b.depNum, r1 = (x) => Math.round(x * 10) / 10;
  const live = (y) => this.systems.filter((S) => S.season === y && S.depNum > 0).map(summarize);
  const rec = (q, o) => Object.assign({ year: q.year, from: q.from || 0, dep: q.dep, named: q.named, hurr: q.hurr, major: q.major, cat5: q.cat5, ace: r1(q.ace), aceDaily: q.aceDaily.slice(), imp: q.imp || null }, o);
  const cur = this.season;
  if (year === cur.year) return rec(cur, { current: true, open: true, day: this.seasonDay(this.hour), storms: live(year).sort(byDep) });
  const e = this.archive.find((x) => x.year === year);
  if (!e) return null;
  if (e.open && this.prev && this.prev.year === year) return rec(this.prev, { current: false, open: true, day: 365, storms: e.storms.concat(live(year)).sort(byDep) });
  return rec(e, { current: false, open: false, day: 365, storms: e.storms.slice().sort(byDep) });
};

/* ---- what a storm does to a city --------------------------------------------------------------------------------------------------------------------------------------------------
   The pure pieces (rainRate, surgeOf, emanuel, damageOf, deathsOf, recoverH, eventNow) are exported for the tests; Manager._impacts runs them every hour for the cities the page hands over (setCities) and keeps the ledger. */
const KT_MS = 0.514444;
/* the rain rate (in/h) a system gives a point r nmi from its centre, at azimuth az (degrees clockwise from north); P is the system's wind profile */
function rainRate(S, par, P, r, az) {
  const I = par.impact.rain, V = S.vr; if (!(V > 15)) return 0;
  const r0 = I.core * P.rmax, rE = I.e * P.r34, g = r < r0 ? 0.55 + 0.45 * r / r0 : Math.exp(-(r - r0) / rE), rf = heading(S) + (S.lat < 0 ? -60 : 60);
  return Math.min(I.max, tableAt(I.v, I.pk, V) * g * (1 + I.asym * Math.cos((az - rf) * DEG)));
}
/* the peak surge (m) a coast of exposure c gets from an onshore wind of v kt under a storm whose 34 kt wind reaches r34 nmi */
const surgeOf = (par, v, r34, c) => { const Z = par.impact.surge; return v > 0 && c > 0 ? Z.s0 * Math.pow(v / Z.ref, 2) * Math.sqrt(Math.max(r34, 20) / Z.size) * c : 0; };
const surgeShare = (par, S2, c) => (S2 > 0.3 ? Math.min(par.impact.surge.shareMax, par.impact.surge.share * c * c) * 0.6 * (1 - Math.exp(-Math.pow(S2 / 6, 2.2))) : 0);        // the share of a city's people and value the water reaches
const emanuel = (v, vh, vt) => { const vn = Math.max(0, v - vt) / (vh - vt), c = vn * vn * vn; return c / (1 + c); };          // the share of the property destroyed by a wind of v m/s (Emanuel 2011)
/* the damage fraction, the death and the injury tolls the peaks of an event give a city: pk: the nine peak winds (m/s), rp: the 72 h rain (in), sg: the surge (m); city: { pop (thousands), inc, oro, coast } */
function damageOf(par, city, pk, rp, sg) {
  const I = par.impact, W = I.wind, vh = W.vh[city.inc], F = I.flood;
  let fw = 0; for (const v of pk) fw += emanuel(v, vh, W.vt); fw = Math.min(1, W.scale * fw / pk.length);
  const ff = Math.min(F.max, F.k * Math.pow(Math.max(0, rp - F.r0), F.p)) * F.vul[city.inc] * (0.7 + 0.3 * city.coast), x = surgeShare(par, sg, city.coast);
  const fs = x * 0.5;                                                                                     // (half of what the water reaches is lost)
  return { fw, ff, fs, x, d: 1 - (1 - fw) * (1 - ff) * (1 - fs) };
}
function deathsOf(par, city, dmg, rp, z, u) {                                                             // z: a standard normal draw, u: a uniform one (the event's own)
  const D = par.impact.deaths, people = city.pop * 1000 * D.mult[city.inc];
  const exp = people * (D.surge * Math.pow(dmg.x, D.ps) + D.flood * Math.pow(Math.max(0, rp - D.r1) / D.rs, 1.5) + D.wind * dmg.fw), v = exp * Math.exp(D.sd * z - 0.5 * D.sd * D.sd);
  const k = v >= 1 ? Math.round(v) : (u < v ? 1 : 0);
  const inj = Math.round(k * D.inj[city.inc] + city.pop * 1000 * D.injW * Math.pow(dmg.fw / 0.01, 0.8) * (dmg.fw > 0 ? 1 : 0));
  return { k, i: inj };
}
const recoverH = (par, d) => { const R = par.impact.recover; return 24 * clamp(R.max * Math.sqrt(Math.max(d, 0) / R.d0), R.min, R.max); };      // hours a damage fraction d takes to heal
const healed = (age, T, lag) => smooth01(age, lag * T, T);                                                // the share that has healed `age` hours after the event ended
/* the part of an event still there at hour t: damage, injuries, deaths, in the units of the event */
function eventNow(par, e, t) {
  const R = par.impact.recover, age = e.te == null ? 0 : Math.max(0, t - e.te), T = e.T || recoverH(par, e.d);
  if (e.te != null && age >= T) return { D: 0, k: 0, i: 0, rec: 1 };
  return { D: e.D * (1 - healed(age, T, R.lag)), k: e.k, i: Math.round(e.i * (1 - healed(age, R.inj * T, R.lag))), rec: healed(age, T, R.lag) };
}
const cityKey = (c) => c.name + '#' + Math.round(c.lat);
Manager.prototype.setCities = function (list) {
  const cap = this.par.impact.cap;
  this.cities = list.map((c, idx) => Object.assign({ idx, key: cityKey(c), now: null, L: null, pop: 250, inc: 1, oro: 1, coast: c.inland ? 0 : 1 }, c, { cap: cap[c.inc == null ? 1 : c.inc] }));
  if (!this.ledger) this.ledger = {};
  for (const c of this.cities) { const l = this.ledger[c.key]; if (l) { c.L = l; } }
  return this.cities.length;
};
Manager.prototype._ledgerOf = function (c) { return c.L || (c.L = this.ledger[c.key] = { rain: null, ev: [], open: null }); };
Manager.prototype._impacts = function (h, env) {
  const cs = this.cities; if (!cs || !cs.length) return;
  const par = this.par, I = par.impact, G = I.grid;
  const act = this.systems.filter((S) => S.alive && S.th !== 'wv' && S.vr > 15).map((S) => ({ S, P: windProfile(S, par, null) }));
  for (const c of cs) {
    let best = null, rain = 0, vmax = 0, pk = null;
    const kx = Math.cos(c.lat * DEG);
    for (const a of act) {
      const S = a.S, P = a.P, dy = (c.lat - S.lat) * 60, dx = (c.lon - S.lon) * 60 * Math.cos(((c.lat + S.lat) / 2) * DEG), r = Math.hypot(dx, dy);
      if (r > I.reach[0] * P.r34 + I.reach[1]) continue;
      const az = (Math.atan2(dx, dy) / DEG + 360) % 360, fr = c.inland ? I.fric[1] : I.fric[0];
      const w = [];                                                                                      // the sustained wind (kt) at the nine points: the city and eight round it
      for (let k = 0; k < 9; k++) { const oy = k === 0 ? 0 : ((k - 1) % 3 - 1) * G, ox = k === 0 ? 0 : (Math.floor((k - 1) / 3) - 1) * G / kx; w.push(windAt(S, par, c.lat + oy, c.lon + ox, P) * fr); }
      const r0 = rainRate(S, par, P, r, az) * c.oro;
      rain += r0;
      if (!pk) pk = w.slice(); else for (let k = 0; k < 9; k++) if (w[k] > pk[k]) pk[k] = w[k];
      if (w[0] > vmax) { vmax = w[0]; best = { S, P, r, az, w0: w[0] }; }
      else if (!best && r0 > 0) best = { S, P, r, az, w0: w[0] };
    }
    let L = c.L;
    if (!L && !(vmax >= I.on[0] || rain >= I.on[1])) { c.now = vmax > 0 || rain > 0 ? { v: vmax, g: 0, rain: 0, sid: best ? best.S.id : null } : null; continue; }
    L = this._ledgerOf(c);
    // the rain ring: the last 72 hours of rain, the slot of this hour replaced
    if (!L.rain && rain > 0) L.rain = new Array(72).fill(0);
    if (L.rain) L.rain[((h % 72) + 72) % 72] = Math.round(rain * 1000) / 1000;
    const r72 = L.rain ? L.rain.reduce((x, y) => x + y, 0) : 0;
    // onshore wind on the coast: the water is upwind of the city
    let onshore = false, surge = 0;
    if (best && !c.inland && vmax > 0) {
      const S = best.S, hs = S.lat < 0 ? -1 : 1, a = best.az * DEG, px = Math.sin(a), py = Math.cos(a), ci = Math.cos(20 * DEG), si = Math.sin(20 * DEG);      // the point's direction from the centre; cyclonic flow round it, turned 20 degrees inward
      const wx = hs * (-py) * ci - px * si, wy = hs * px * ci - py * si, d = I.surge.back, uy = c.lat - wy * d, ux = c.lon - wx * d / kx;
      onshore = !env.isLand(uy, ux);
      if (onshore) surge = surgeOf(par, vmax, best.P.r34, c.coast);
    }
    const gf = c.inland ? I.gust[2] : (onshore ? I.gust[0] : I.gust[1]);
    c.now = { v: vmax, g: vmax * gf, rain72: r72, sid: best ? best.S.id : null, onshore };
    // the event
    const active = vmax >= I.on[0] || rain >= I.on[1];
    let e = L.open;
    if (active) {
      if (!e) { e = L.open = { t0: h, te: null, last: h, pk: new Array(9).fill(0), rp: 0, sg: 0, vmax: 0, gmax: 0, D: 0, k: 0, i: 0, d: 0, sid: null, sn: '' }; e.z = rndn(this.seed, c.idx + 1, h, ST.IMP); e.u = rnd(this.seed, c.idx + 1, h, ST.IMP); }
      e.last = h; for (let k = 0; k < 9; k++) if (pk && pk[k] * KT_MS > e.pk[k]) e.pk[k] = pk[k] * KT_MS;
      e.rp = Math.max(e.rp, r72); e.sg = Math.max(e.sg, surge); if (vmax > e.vmax) { e.vmax = vmax; e.gmax = c.now.g; e.sid = best ? best.S.id : e.sid; e.sn = best ? best.S.name || best.S.id : e.sn; }
      const dm = damageOf(par, c, e.pk, e.rp, e.sg), ds = deathsOf(par, c, dm, e.rp, e.z, e.u), D = dm.d * c.pop * c.cap * 1e6, dD = D - e.D, dk = ds.k - e.k, di = ds.i - e.i;
      e.d = dm.d; e.D = D; e.k = ds.k; e.i = ds.i;
      if (best && (dD > 0 || dk > 0 || di > 0)) {
        const S = best.S, T = S.imp || (S.imp = { d: 0, k: 0, i: 0 }), rec = S.season === this.season.year ? this.season : (this.prev && this.prev.year === S.season ? this.prev : this.season), Y = rec.imp || (rec.imp = { d: 0, k: 0, i: 0, worst: null });
        T.d += Math.max(0, dD); T.k += Math.max(0, dk); T.i += Math.max(0, di); Y.d += Math.max(0, dD); Y.k += Math.max(0, dk); Y.i += Math.max(0, di);
        if (dD > 0) { const cs = T.cs || (T.cs = {}); cs[c.name] = (cs[c.name] || 0) + dD; }                                    // (where the damage was: the summary lists the cities a storm hurt most)
        if (!Y.worst || D > Y.worst.d) Y.worst = { city: c.name, d: D, k: ds.k, storm: S.name || S.id };
      }
    } else if (e && h - e.last >= I.on[2]) {
      e.te = e.last; e.T = recoverH(par, e.d); L.open = null; delete e.z; delete e.u;
      if (e.d >= I.recover.min0 || e.k > 0 || e.i > 0) { L.ev.push(e); if (L.ev.length > 12) L.ev.shift(); }
    }
    if (h % 24 === 0) L.ev = L.ev.filter((x) => h - x.te < (x.T || recoverH(par, x.d)));                     // a healed event leaves the ledger
    if (!L.open && !L.ev.length && !(L.rain && L.rain.some((x) => x > 0))) { delete this.ledger[c.key]; c.L = null; }
  }
};
/* what the page shows of a city now: the wind and gusts (mph), the rain of the last 72 hours (in), the toll of its open and unhealed events, and how far it has recovered */
Manager.prototype.impactOf = function (i) {
  const c = this.cities && this.cities[i]; if (!c) return null;
  const L = c.L, t = this.hour, now = c.now, mph = (kt) => Math.round(kt * KT_MPH);
  const out = { windSustained: now && now.v >= 15 ? mph(now.v) : 0, windGust: now && now.v >= 15 ? mph(now.g || now.v * 1.3) : 0, rain72h: 0, deaths: 0, injuries: 0, damageCost: 0, damagePct: 0, recovery: 0, severity: 0, open: false, value: c.pop * c.cap * 1e6 };
  if (L) {
    out.rain72h = L.rain ? L.rain.reduce((x, y) => x + y, 0) : 0;
    let peak = 0, left = 0;
    for (const e of L.ev.concat(L.open ? [L.open] : [])) { const q = eventNow(this.par, e, t); out.damageCost += q.D; out.deaths += q.k; out.injuries += q.i; peak += e.D; left += q.D; }
    out.open = !!L.open; out.recovery = peak > 0 ? 1 - left / peak : 0;
    out.damagePct = 100 * out.damageCost / out.value; out.severity = out.damageCost / out.value;
  }
  return out;
};
Manager.prototype.impactRings = function () {                           // the cities with damage that has not healed: [index, share of the city's value still damaged, share healed]
  const out = []; if (!this.cities) return out;
  for (const c of this.cities) { if (!c.L) continue; const v = this.impactOf(c.idx); if (v && v.damageCost > 0) out.push([c.idx, v.severity, v.recovery]); }
  return out;
};
Manager.prototype.get = function (id) { return this.byId[id] || null; };
Manager.prototype.active = function () { return this.systems.filter((S) => S.alive); };
Manager.prototype.stats = function () { const s = this.season; return { year: s.year, dep: s.dep, named: s.named, hurr: s.hurr, major: s.major, cat5: s.cat5, ace: Math.round(s.ace * 10) / 10 }; };

Manager.prototype.serialize = function () {
  return { v: VERSION, basin: this.basin, nameCur: this.nameCur, seed: this.seed, startMs: this.startMs, hour: this.hour, par: this.par, n: this.n, auto: this.auto, autoRate: this.autoRate, sched: this.sched, invN: this.invN, olMem: this.olMem,
    season: this.season, prev: this.prev, prevEntry: this.prevEntry, archive: this.archive, yearEndH: this.yearEndH, systems: this.systems, lows: { tracks: this.lows.tracks, next: this.lows.next, done: this.lows.done }, imp: this.ledger || {} };
};
Manager.prototype.enableDiag = function () { if (this.maps) this.ctx.diag = newDiag(this.maps); return !!this.ctx.diag; };
Manager.prototype.diagPacked = function () {                              // the accumulators as sparse [index, value] lists (what the lab ships back to the page's caller)
  const d = this.ctx.diag; if (!d) return null;
  const out = {}; for (const k of DIAG_KEYS) { const a = d[k], l = []; for (let i = 0; i < a.length; i++) if (a[i] !== 0) l.push([i, Math.round(a[i] * 1000) / 1000]); out[k] = l; }
  return out;
};
Manager.restore = function (o, extra) {                                  // a parameter added since the save is filled in with its default
  const m = new Manager({ seed: o.seed, startMs: o.startMs, params: {}, hour0: o.hour, auto: o.auto, autoRate: o.autoRate, maps: extra && extra.maps, basin: o.basin });
  m.nameCur = o.nameCur || {};
  m.par = mergeParams(defaultParams(m.basin), o.par); m.n = Object.assign({ W: 0, N: 0, M: 0, F: 0 }, o.n); m.sched = o.sched; m.invN = o.invN || {}; m.olMem = o.olMem || null; m.season = o.season; m.prev = o.prev; m.prevEntry = o.prevEntry || null; m.archive = o.archive; m.yearEndH = o.yearEndH;
  m.systems = o.systems; m.byId = {}; for (const S of m.systems) m.byId[S.id] = S;
  m.lows.tracks = o.lows.tracks; m.lows.next = o.lows.next; m.lows.done = o.lows.done || [];
  m.ledger = o.imp || {};
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
  category, ktToMph, aceOf, round5, gustKt, compass, pressureFromWind, windFromPressure, WP, vPot, statusOf, describe, nameFor, NAME_SETS, NAME_SUPPLEMENTAL, BASINS, basinInfo: basinOf, stormName, seasonYearOf,
  smooth01, rnd, rndn, hash5, idNum, stepSystem, newSystem, makeFix, seasonalWeight, WAVE_SEASON, LowTracker, etHazard6, disHazard6, subShare, baroclinicV, satur, softMin, lowWeight, keepSide, SCALES, scaleOf, classOf, investLetter, capsule, swath, swathFull, outlookClass, outlookFollow, cloneSystem, rainRate, surgeOf, surgeShare, emanuel, damageOf, deathsOf, recoverH, eventNow, windRadii, windScale, windAt, windProfile, profileAt, profileRoot, stepWind, stepErc, ercShape, sizeClim, rmaxBase, alertsOf, unmercY, ensFactor, ensDensity, mercY, coneOf, coneRadius, coneLetter, sstGateAt, growthG, decayLimit,
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
/* ==== STORMS ENGINE END ==== */
