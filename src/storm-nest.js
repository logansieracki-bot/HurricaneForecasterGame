/* ==== STORM NEST BEGIN ==== */
/* ------------------------------------------------------------------------------------------------------------------------
 *  The 2-km storm-scale nest behind the radar floater.
 *
 *  What it is, honestly: a reduced-physics, convection-resolving-in-spirit model of the inside of one system, on a 256 x 256 grid of 2 km cells (512 km square,
 *  following the storm). It is not a numerical weather prediction model (no vertical dimension, no microphysics), and it is not a painted picture either: the
 *  rain is made by convection that the model's own winds drive. It is the balanced limit of the moist-convective rotating shallow-water model (Bouchut et al. 2009;
 *  Rostami and Zeitlin 2017-2022) with the gravity waves left out (they cost a time step of 10 s and add nothing to what a radar shows), in four pieces:
 *    - dynamics: the low-level vorticity zeta is advected by its own winds (semi-Lagrangian, cubic interpolation; the winds come from the axisymmetric mean by
 *      Stokes' theorem and from the rest by a Poisson solve), so differential rotation shears everything into spirals, vortex Rossby waves travel, thin rings
 *      break up;
 *    - the boundary layer: the Ekman pumping of the surface stress w = k curl(Cd |u| u) / (f + zeta) lifts moist air (Kepert's slab boundary layer in its shortest
 *      form), with a larger drag over land; it also converges moisture (w Q / Hq);
 *    - weak and disorganised systems (disturbances, depressions, a storm that is weakening or crossing a coast, an extratropical low): the lift the vortex gives is small, so the rain is made by the broad ascent of a moist
 *      tropical atmosphere over the area the system fills (its size is read from its wind table; the weather decides how much of that area is alive), through a heavy-tailed multiplicative variability at three scales (cells
 *      of a few km, clusters of 30 km, mesoscale areas of 60 km and more, carried and sheared by the flow), so there are scattered cells, cell clusters and rain-free gaps, not a disc; a slow moisture memory (the mid-level moisture that builds where a mass has rained, lasts about half a day in moist air and far less in dry air, over cool water, over land and on the upshear side of shear, and is carried round by the swirl) raises the supply where it is high, so a weak system in warm, moist air has one constant burst that covers it and winds into bands, in shear the burst is one mass on the downshear side, and in dry or cool air there are only small isolated clusters; the stratiform rain of a cluster is made
 *      from its own blurred convective rain (a skirt that fades out), heavier cells rain more per unit of condensation (the precipitation efficiency grows with the updraught), land dries the air over tens of km, not at a line,
 *      water and rain flow in and out of the box openly (a large shield goes on beyond it), and an extratropical transition scales its warm-sector shield, front and dry slot with the size of the system;
 *    - convection: a column of water Q, fed by that convergence and by the sea (evaporation grows with the wind: WISHE, Emanuel 1986), rains out above a threshold in
 *      a time tauC, so cells have a life cycle and a spacing; the rain's latent heating is a mass flux W = aW P out of the layer, which stretches the vorticity
 *      (d zeta / dt = (f + zeta)(W - w) / H): convection builds the vortex, the Ekman suction spins it down. Shear ventilates the upshear side, the lead of the
 *      right-front side and the coast shape where it rains, an extratropical transition adds the baroclinic lift and the dry slot;
 *    - the radar: rain tracers (convective: short-lived; stratiform: made from decaying convective rain and broad ascent, long-lived, smeared outward and downshear)
 *      and a forward operator Z = 250 R^1.2 for convective rain (the NHC's tropical relation) and 200 R^1.6 for stratiform, with the beam geometry of a site.
 *  The picture adds what a 2-km cell cannot hold (a texture of cells and patches below it, carried by the flow) and the radar's wind adds turbulence and the downdraughts' outflow. The eye of a strong storm has a
 *  ragged soft edge and is cleared of rain, including the stratiform rain the eyewall's skirt would put into it.
 *  The engine owns the storm: it gives the vortex (its wind profile, the two rings of an eyewall replacement), the environment (sea temperature, humidity, shear,
 *  land) and the motion. The nest's mean vorticity is held to the engine's by a slow relaxation (the storm is the engine's, the structure inside it is the nest's),
 *  and the heating efficiency adapts slowly so the nest's convection supports the intensity the engine says.
 *
 *  Pure JavaScript, no DOM. A classic script that sets `globalThis.HFNest`; tools/build.mjs inlines it after the engine.
 * ------------------------------------------------------------------------------------------------------------------------ */
(function (root) {
'use strict';

const N = 256, NC = 128, DX = 2000, NN = N * N, NR = 420;                       // grid size, coarse grid size (the Poisson solve), cell size (m), radial table length (km)
const DEG = Math.PI / 180, KM_DEG = 111.195;
let P_MEANU = 0;                                                               // the share of the mean secondary circulation (the mean divergence's radial wind) that moves things: 0, the mean belongs to the engine
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sm01 = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ---- tunable numbers, in one place (the tests and the node renders read and set them) ------------------------------------------------------------------------------ */
const PAR = {
  H: 1500, Hq: 3300,                                  // the depth the stretching acts over and the depth of the moist layer (m)
  cd: [2.4e-3, 3.8e-3], uFac: 0.8, kw: 5, wMin: 3e-4, kv: 150, zs: 2e-3, wFloor: 0.3, wBg: 0.035, vOn: [8, 28],   // drag coefficient at sea and over land; the share of the gradient wind the boundary layer's winds keep; the pumping's scale (the slab layer's inflow, about 5 times the Ekman value); the least f + zeta (1/s); the convergence of the inflow that goes with the vorticity (m: w = kv zeta, saturating at zs), and the share of it that is left where the Ekman formula would make descent (the boundary layer stays convergent); the large-scale ascent of the tropical atmosphere that starts convection in a disorganised system (m/s); the wind range (m/s) over which the vortex's own convergence takes over from it
  Qc: 50, tauC: 600, Qstar: 1.06, Qenv: 0.85, QenvV: 0.05, tauEnv: 43200, kE: 3e-7, u0: 1.5,    // convection: the column water above which it rains (mm), its time (s), the sea's saturation relative to Qc, the environment's relative to Qc (for a weak vortex, and the more for a strong one: a storm moistens its surroundings) and its relaxation (s), evaporation per metre of wind, the gust
  aW: 45, Pmax: 0.03, kr: [1.1, 2.4],                      // the mass flux per mm/s of rain (m per mm), the most rain convection can make from the supply (mm/s), the rain a mm/s of condensation is, for a weak and for a strong vortex (the column above the layer converges moisture too, the more the deeper the convection)
  sq: 1.3, noiseTau: 900, sc: 1.1, clTau: 7200, cl2Tau: 14400, bgSig: [1.1, 0.9, 0.8], bgA: 2, bgR: [150, 270], bgOrg: 0.75, etW: 0.08, etF: 0.35, eyeRag: 0.3, eyeClr: 0.4, edgeS: [215, 252], vTurb: [1.0, 0.06, 0.45], vOut: 700, vTau: 420, texS: 0.25, texC: 0.45, texR: 0.25, texCc: 0.15, inA: 0.07, inR: 3.5, rhQ: 0.2, dryK: 0.88, dryR: 1.0, shAmp: 1.3, landR: [8, 10], landK: 0.7, landSq: 0.06, gsC: 0.35, sBlur: 4, wBlur: 5, pcv: 0.0015, pcx: 2.5,                             // the multiplicative variability of the supply: cell scale (and its memory, s) and mesoscale clusters 30 km across (their share and memory), which the swirl shears into spiral arms
  tauUp: 300, tauC2: 1200, sigS: 0.05, tauS: 1800, gs: 0.4,    // radar rain: rise time of convective rain (s), its fall time; the share of it stratiform rain receives (per tauC2), its life (s), the rain of broad ascent (mm/h)
  top: [8.2, 2.4, 15.2, 2.0],      // the top (km) of a convective cell raining r mm/h: top[0] + top[1] ln(1 + r/3), soft-capped (above top[2] it levels off toward top[2] + top[3]); fitted so that a category 1 and 2 hurricane's core has the cold tops of the real ones (Nolo 25-26 Sep 2026, GOES: within 100 km about 17 thousand km2 colder than -60 C and 8 thousand colder than -70 C, the coldest top within 60 km about -78 C)
  memS: 1.2, memN: 0.4, memUp: 10800, memDn: 43200, memA: [1, 5], memR: 10,      // the moisture memory: the gain of the supply on it (and the level of it that leaves the supply as it was), the time it builds over where it rains and the time it lasts in moist air (s), the rain (mm/h, over memR cells) that builds it
  ciSp: 2, ciR: 1, ciW: 0.7,      // the anvil mixes sideways (passes of a 3 x 3 mean per cirrus step: about 7 km an hour) and is made of the rain of a cell's neighbourhood, not of one cell's (the radius in cells of the mean and its share: isolated cells and thin streaks make small anvils, a mass of rain a large one)
  eyeV: [40, 47], eyeU: 6, eyeRing: [1.0, 2.2, 2, 10, 0.45, 0.85], eyeTau: [5400, 3600],      // the eye: the wind (m/s) over which it can form (it begins in category 2 and is there by category 3), how much higher that wind is in the most hostile air (shear, dry air, cool water: the eye erodes at category 3), the ring it needs (inner and outer radius in radii of maximum wind, the rain a sector needs to count: from and to in mm/h, the share of the sectors that makes the ring: from and to) and the time it forms and fills in (s)
  tauCi: 9000, dzCi: 0.4, ciOut: 8, ciTex: [0.2, 0.25], ciDt: 300,      // infrared: the life of the cirrus the convection spreads (s), its top's fall (km an hour), the upper outflow that spreads it (m/s), the texture on its thickness (cell and cluster scale), how often it is advected (s)
  outflow: 4, gsW: 1.6,                                 // the upper-level outflow (m/s) that carries stratiform rain outward from the core; the stratiform rain of an extratropical transition's warm sector (mm/h)
  tauN: [1200, 900], tauG: 3 * 3600, zmax: 0.05, nu: 0, meanStretch: 0, zCap: 3e-3, eye: 0.8, tauA: [1500, 7200],     // relaxation of the mean vorticity to the engine's (inner and outer, s); the time the efficiency adapts over; the cap on |zeta| (1/s); the smoothing of zeta per step; the damping time of the departures from the circle mean in the core and outside it (s: what the third dimension and the convective heating do to the two-dimensional instabilities of a ring); the share of the circle-mean stretching that is kept (the rest is the engine's to say), the vorticity above which stretching stops growing with it (1/s), the eye's share of the radius of maximum wind
};

/* ---- numerics: a small FFT for the 128 x 128 Poisson solve ------------------------------------------------------------------------------------------------------------- */
const FFT = (() => {
  const n = NC, rev = new Uint16Array(n), bits = Math.log2(n), cs = new Float64Array(n / 2), sn = new Float64Array(n / 2), bre = new Float64Array(n), bim = new Float64Array(n);
  for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b); rev[i] = r; }
  for (let i = 0; i < n / 2; i++) { cs[i] = Math.cos(2 * Math.PI * i / n); sn[i] = -Math.sin(2 * Math.PI * i / n); }
  function one(re, im, off, stride, inv) {
    for (let i = 0; i < n; i++) { const j = rev[i]; bre[j] = re[off + i * stride]; bim[j] = im[off + i * stride]; }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1, step = n / len;
      for (let s = 0; s < n; s += len) for (let k = 0; k < half; k++) {
        const wr = cs[k * step], wi = inv ? -sn[k * step] : sn[k * step], a = s + k, b = a + half, xr = bre[b] * wr - bim[b] * wi, xi = bre[b] * wi + bim[b] * wr;
        bre[b] = bre[a] - xr; bim[b] = bim[a] - xi; bre[a] += xr; bim[a] += xi;
      }
    }
    for (let i = 0; i < n; i++) { re[off + i * stride] = bre[i]; im[off + i * stride] = bim[i]; }
  }
  return (re, im, inv) => { for (let j = 0; j < n; j++) one(re, im, j * n, 1, inv); for (let i = 0; i < n; i++) one(re, im, i, n, inv); };
})();
const KSQ = (() => { const k = new Float64Array(NC * NC); for (let j = 0; j < NC; j++) for (let i = 0; i < NC; i++) { const a = 2 * Math.PI * (i <= NC / 2 ? i : i - NC) / (NC * 2 * DX), b = 2 * Math.PI * (j <= NC / 2 ? j : j - NC) / (NC * 2 * DX); k[j * NC + i] = a * a + b * b; } return k; })();

/* ---- randomness: a stream per nest (a pure function of the seed and the number of draws, so the same storm opens the same way) -------------------------------- */
function Rng(seed) { this.s = (seed >>> 0) || 1; }
Rng.prototype.next = function () { let x = this.s; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; this.s = x; return x / 4294967296; };

/* ---- the nest -------------------------------------------------------------------------------------------------------------------------------------------------------------- */
function Nest(o) {
  o = o || {};
  this.seed = (o.seed >>> 0) || 1; this.rng = new Rng(this.seed ^ 0x9e3779b9);
  this.t = 0; this.steps = 0; this.ciAcc = 0; this.g = 1; this.gI = 0; this.m = o.m > 0 ? o.m : 1;                                                   // seconds since the nest started, steps taken, the heating efficiency (adapts) and its integral
  const mk = () => new Float32Array(NN);
  this.zeta = mk(); this.Q = mk(); this.qn = mk(); this.eyeS = 0; this.eyeG = 0; this.eyeSum = new Float32Array(16); this.eyeCnt = new Float32Array(16); this.rcN = mk(); this.cl = mk(); this.cl2 = mk(); this.mem = mk(); this.memA = mk(); this.rcB = mk(); this.wS = mk(); this.cir = mk(); this.cih = mk(); this.uc = mk(); this.vc = mk(); this.tn1 = null; this.tn2 = null; this.vu = null; this.vv = null; this.turbOn = false; this.rc = mk(); this.rs = mk(); this.P = mk();         // vorticity, column water, supply noise, convective and stratiform rain (mm/h), condensation (mm/s)
  this.wb = mk(); this.Wc = mk(); this.dv = mk(); this.U = mk(); this.V = mk(); this.us = mk(); this.vs = mk();     // boundary-layer ascent, convective mass flux, divergence, the swirl, the stratiform flow
  this.lf = mk(); this.lfD = mk(); this.lfM = mk(); this.pv = null; this.keepPrev = false; this.t1 = mk(); this.t2 = mk(); this.t3 = mk(); this.sc = [mk(), mk(), mk(), mk(), mk(), mk(), mk()];
  this.dep = { ix: new Int32Array(NN), iy: new Int32Array(NN), fx: mk(), fy: mk() };
  this.rr = mk(); this.cth = mk(); this.sth = mk(); this.gout = mk(); this.edge = mk(); this.edgeS = mk(); this.rbin = new Int16Array(NN);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i - (N - 1) / 2) * DX / 1000, y = (j - (N - 1) / 2) * DX / 1000, k = j * N + i, r = Math.hypot(x, y);
    this.rr[k] = r; this.cth[k] = r > 0 ? x / r : 1; this.sth[k] = r > 0 ? y / r : 0; this.rbin[k] = Math.min(NR - 1, Math.round(r));
    this.edge[k] = 1 - sm01(Math.max(Math.abs(x), Math.abs(y)), 170, 250); this.edgeS[k] = 1 - sm01(Math.max(Math.abs(x), Math.abs(y)), PAR.edgeS[0], PAR.edgeS[1]);                                     // the vortex's winds fade toward the box's edges so the periodic domain has no seam
  }
  this.setGeom();
  this.cr = new Float64Array(NC * NC); this.ci = new Float64Array(NC * NC);
  this.cu = new Float32Array(NC * NC); this.cv = new Float32Array(NC * NC); this.cu2 = new Float32Array(NC * NC); this.cv2 = new Float32Array(NC * NC);
  this.bz = new Float64Array(NR + 1); this.bd = new Float64Array(NR + 1); this.bn = new Float64Array(NR + 1); this.Vb = new Float64Array(NR + 1); this.Ub = new Float64Array(NR + 1);
  this.zT = new Float32Array(NR + 1); this.gz = new Float32Array(NR + 1);                                  // the engine's mean vorticity by radius (km); the correction that pulls the mean to it
  this.eDry = mk(); this.eQs = mk(); this.eQb = mk(); this.eQc = mk(); this.eBg = mk(); this.eVent = mk();                                 // the air round the storm, cell by cell: the sea's saturation, the environment's moisture, the threshold, the background ascent, the shear's ventilation
  this.f0 = null; this.f1 = null; this.cur = null; this.lastDt = 120; this.lfOn = false; this.vNest = 0; this.qNorm = 1; this.rmaxN = 30;
}

/* ---- the forcing: what the engine says the storm and its surroundings are (see forcingOf) --------------------------------------------------------------------------- */
const FKEYS = ['clat', 'clon', 'lat', 'vmax', 'rmax', 'shear', 'shdir', 'uem', 'vem', 'ued', 'ved', 'head', 'spd', 'rh', 'sst', 'eta', 'etdir', 'conv', 'org', 'cold'];
function lerpForcing(a, b, t) {
  if (!b || t <= 0) return a; if (t >= 1) return b;
  const f = Object.assign({}, a);
  for (const k of FKEYS) if (typeof a[k] === 'number' && typeof b[k] === 'number') f[k] = a[k] + (b[k] - a[k]) * t;
  f.vt = new Float32Array(NR); for (let i = 0; i < NR; i++) f.vt[i] = a.vt[i] + (b.vt[i] - a.vt[i]) * t;
  return f;
}
Nest.prototype.setGeom = function () {                                         // what the scale decides in the geometry: the upper-level outflow's reach (true km)
  const m = this.m, go = this.gout, rr = this.rr;
  for (let k = 0; k < NN; k++) { const rg = Math.max(rr[k], 1) * m; go[k] = sm01(rg, 5, 40) * Math.exp(-rg / 220); }
};
/* a new scale (a larger storm wants a larger box): every field is resampled about the centre (what is lengths in cells stays what it is in cells, what is vorticity, water or rain keeps its value), the box edge's value stands
   where the old box did not reach; the host sets the forcing, the environment and the land again for the new scale */
Nest.prototype.rescale = function (mNew) {
  if (!(mNew > 0) || Math.abs(Math.log(mNew / this.m)) < 1e-6) return;
  const q = mNew / this.m, c = (N - 1) / 2, tmp = this.t1, flds = [this.zeta, this.Q, this.qn, this.cl, this.cl2, this.mem, this.memA, this.rc, this.rs, this.P, this.tn1, this.tn2].filter(Boolean);
  for (const a of flds) {
    for (let j = 0; j < N; j++) { const y = clamp(c + (j - c) * q, 0, N - 1.001), j0 = Math.floor(y), fy = y - j0;
      for (let i = 0; i < N; i++) { const x = clamp(c + (i - c) * q, 0, N - 1.001), i0 = Math.floor(x), fx = x - i0, k0 = j0 * N + i0;
        tmp[j * N + i] = (a[k0] * (1 - fx) + a[k0 + 1] * fx) * (1 - fy) + (a[k0 + N] * (1 - fx) + a[k0 + N + 1] * fx) * fy; } }
    a.set(tmp);
  }
  this.m = mNew; this.setGeom(); this.tabAt = -1; this.sz = 0; this.drc = null; this.drs = null; this.pv = null;
};
Nest.prototype.setForcing = function (f0, f1) { this.f0 = f0; this.f1 = f1 || f0; this.tF0 = this.t; this.tabAt = -1; };
Nest.prototype.forcingAt = function (t) { return lerpForcing(this.f0, this.f1, clamp((t - this.tF0) / 3600, 0, 1)); };
Nest.prototype.setLand = function (lf, mirror) {                               // lf: Float32Array(N*N), row 0 = south (the host's order); mirror: the southern hemisphere's flip
  const d = this.lf; this.lfOn = false;
  for (let j = 0; j < N; j++) { const sj = mirror ? N - 1 - j : j; for (let i = 0; i < N; i++) { const v = lf[sj * N + i]; d[j * N + i] = v; if (v > 0) this.lfOn = true; } }
  if (this.lfOn) { boxBlur(d, this.lfD, this.t1, PAR.landR[0]); boxBlur(d, this.lfM, this.t1, PAR.landR[1]); }
};
function vorticityOf(vt) {                                                     // the vorticity V/r + dV/dr of a radial wind table (m/s at r = 0..NR-1 km), smoothed
  const s = new Float32Array(NR), z = new Float32Array(NR + 1);
  for (let i = 0; i < NR; i++) s[i] = (vt[Math.max(0, i - 1)] + 2 * vt[i] + vt[Math.min(NR - 1, i + 1)]) / 4;
  for (let i = 0; i < NR; i++) { const a = Math.max(0, i - 1), b = Math.min(NR - 1, i + 1), dv = (s[b] - s[a]) / ((b - a) * 1000); z[i] = i === 0 ? 2 * (s[1] - s[0]) / 1000 : s[i] / (i * 1000) + dv; }
  z[NR] = 0; const o = new Float32Array(NR + 1);
  for (let i = 0; i <= NR; i++) o[i] = (z[Math.max(0, i - 1)] + 2 * z[i] + z[Math.min(NR, i + 1)]) / 4;
  return o;
}
Nest.prototype.init = function (f) {                                           // the vortex the engine describes, in a moist environment
  if ((f.m || 1) !== this.m) { this.m = f.m || 1; this.setGeom(); }
  this.setForcing(f, f); this.zT.set(vorticityOf(f.vt)); this.tabAt = 0; this.setEnv(null, f);
  const z = this.zeta, Q = this.Q, rr = this.rr, P = PAR;
  for (let k = 0; k < NN; k++) { const r = rr[k], a = Math.min(NR - 1, Math.floor(r)), t = r - a; z[k] = this.zT[a] * (1 - t) + this.zT[a + 1] * t; Q[k] = P.Qc * (P.Qenv + P.QenvV * sm01(f.vmax, 10, 30) + 0.12 * Math.exp(-r / 120)); }
  this.mem.fill(0); this.memA.fill(0); this.eyeS = sm01(f.vmax * (f.m || 1) - PAR.eyeU * unfavOf(f, f.m || 1), PAR.eyeV[0], PAR.eyeV[1]); this.eyeG = 2400;
  this.clMix(0); this.clMix2(0); for (let k = 0; k < NN; k++) Q[k] += 4 * this.cl[k] * (1 + 0.5 * Math.exp(-rr[k] / 150));
  const qn = this.qn; for (let k = 0; k < NN; k++) qn[k] = (this.rng.next() + this.rng.next() - 1) * 2.449;
  this.blur(qn, this.t1); this.blur(qn, this.t1);
  let s2 = 0; for (let k = 0; k < NN; k++) s2 += qn[k] * qn[k]; this.qNorm = 1 / Math.sqrt(s2 / NN); for (let k = 0; k < NN; k++) qn[k] *= this.qNorm;
};
Nest.prototype.blur = function (a, tmp) {                                       // [1 2 1]/4 in x then y (periodic), in place
  for (let j = 0; j < N; j++) { const o = j * N; for (let i = 0; i < N; i++) tmp[o + i] = 0.25 * a[o + ((i + N - 1) & 255)] + 0.5 * a[o + i] + 0.25 * a[o + ((i + 1) & 255)]; }
  for (let j = 0; j < N; j++) { const o = j * N, om = ((j + N - 1) & 255) * N, op = ((j + 1) & 255) * N; for (let i = 0; i < N; i++) a[o + i] = 0.25 * tmp[om + i] + 0.5 * tmp[o + i] + 0.25 * tmp[op + i]; }
};

/* a periodic box blur of radius m cells, twice (a smooth bell about 0.6 m cells wide), a into out (tmp is scratch) */
function boxBlur(a, out, tmp, m) {
  const w = 1 / (2 * m + 1);
  for (let pass = 0; pass < 2; pass++) {
    const src = pass ? out : a;
    for (let j = 0; j < N; j++) { const o = j * N; let s = 0; for (let d = -m; d <= m; d++) s += src[o + ((d + 256) & 255)]; for (let i = 0; i < N; i++) { tmp[o + i] = s * w; s += src[o + ((i + m + 1) & 255)] - src[o + ((i - m + 256) & 255)]; } }
    for (let i = 0; i < N; i++) { let s = 0; for (let d = -m; d <= m; d++) s += tmp[((d + 256) & 255) * N + i]; for (let j = 0; j < N; j++) { out[j * N + i] = s * w; s += tmp[((j + m + 1) & 255) * N + i] - tmp[((j - m + 256) & 255) * N + i]; } }
  }
}
Nest.prototype.clMix2 = function (a) {                                         // the mesoscale clusters: the same on an 8 x 8 grid (cells 64 km): the rain areas of a few tens to a hundred km that a weak system is made of
  if (!this.clc2) this.clc2 = new Float32Array(64);
  const c = this.clc2, cl = this.cl2, b = Math.sqrt(Math.max(0, 1 - a * a));
  for (let k = 0; k < 64; k++) c[k] = (this.rng.next() + this.rng.next() + this.rng.next() - 1.5) * 2;
  const oy = this.rng.next() * 64, ox = this.rng.next() * 64;                                                          // (the lattice is moved at random each time: the variability is the same everywhere, not larger at fixed nodes)
  for (let j = 0; j < N; j++) { const y = (j + oy) / 32, j0 = Math.floor(y) & 7, j1 = (j0 + 1) & 7, fy = y - Math.floor(y), sy = fy * fy * (3 - 2 * fy);
    for (let i = 0; i < N; i++) { const x = (i + ox) / 32, i0 = Math.floor(x) & 7, i1 = (i0 + 1) & 7, fx = x - Math.floor(x), sx = fx * fx * (3 - 2 * fx);
      const v = (c[j0 * 8 + i0] * (1 - sx) + c[j0 * 8 + i1] * sx) * (1 - sy) + (c[j1 * 8 + i0] * (1 - sx) + c[j1 * 8 + i1] * sx) * sy; cl[j * N + i] = a * cl[j * N + i] + b * v; } }
};
Nest.prototype.clMix = function (a) {                                          // the cluster noise relaxes toward a fresh field of unit normals on a 16 x 16 grid (cells 32 km), interpolated smoothly; a = the share it keeps
  if (!this.clc) this.clc = new Float32Array(256);
  const c = this.clc, cl = this.cl, b = Math.sqrt(Math.max(0, 1 - a * a));
  for (let k = 0; k < 256; k++) c[k] = (this.rng.next() + this.rng.next() + this.rng.next() - 1.5) * 2;
  const oy = this.rng.next() * 32, ox = this.rng.next() * 32;
  for (let j = 0; j < N; j++) { const y = (j + oy) / 16, j0 = Math.floor(y) & 15, j1 = (j0 + 1) & 15, fy = y - Math.floor(y), sy = fy * fy * (3 - 2 * fy);
    for (let i = 0; i < N; i++) { const x = (i + ox) / 16, i0 = Math.floor(x) & 15, i1 = (i0 + 1) & 15, fx = x - Math.floor(x), sx = fx * fx * (3 - 2 * fx);
      const v = (c[j0 * 16 + i0] * (1 - sx) + c[j0 * 16 + i1] * sx) * (1 - sy) + (c[j1 * 16 + i0] * (1 - sx) + c[j1 * 16 + i1] * sx) * sy; cl[j * N + i] = a * cl[j * N + i] + b * v; } }
};

/* the weather round the storm, not only at its centre: coarse fields (32 x 32 of 16 km: sea temperature, humidity 0-1, shear m/s; row 0 south, mirrored by the caller in the southern hemisphere) set the sea's
   saturation, the moisture the air round the storm relaxes to, the threshold, the background ascent and the shear's ventilation of every cell, so a dry side, a cold side or a sheared side makes the storm lopsided.
   null: the centre's values everywhere */
const NE = 32;
Nest.prototype.setEnv = function (g, f) {
  const P = PAR, Qc = P.Qc, qs = this.eQs, qb = this.eQb, qc = this.eQc, bg = this.eBg, ve = this.eVent, ed = this.eDry;
  f = f || this.cur || this.f0;
  for (let j = 0; j < N; j++) {
    const v = clamp((j - (N - 1) / 2) / 8 + (NE - 1) / 2, 0, NE - 1.001), j0 = Math.floor(v), fy = v - j0;
    for (let i = 0; i < N; i++) {
      const u = clamp((i - (N - 1) / 2) / 8 + (NE - 1) / 2, 0, NE - 1.001), i0 = Math.floor(u), fx = u - i0, k = j * N + i;
      const ce = Math.max(f.cold || 0, f.eta || 0); let sst = f.sst, rh = f.rh, sh = f.shear * this.m;
      if (g) { const a = j0 * NE + i0, w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        sst = g.sst[a] * w00 + g.sst[a + 1] * w10 + g.sst[a + NE] * w01 + g.sst[a + NE + 1] * w11; rh = g.rh[a] * w00 + g.rh[a + 1] * w10 + g.rh[a + NE] * w01 + g.rh[a + NE + 1] * w11; sh = g.sh[a] * w00 + g.sh[a + 1] * w10 + g.sh[a + NE] * w01 + g.sh[a + NE + 1] * w11; }
      sst += ce * Math.max(0, 27.5 - sst) * 0.85;                                   // (the cold air aloft makes up for a cool sea)
      qs[k] = Qc * (P.Qstar + 0.05 * clamp((sst - 27) / 2, -1.5, 1)) * (0.6 + 0.4 * sm01(sst, 23, 27.5));
      qb[k] = P.Qenv + P.rhQ * (rh - 0.5); ed[k] = 1 - P.dryK * (1 - sm01(rh - f.rh, -0.3, -0.03));      // (a side drier than the centre starves its convection)
      qc[k] = Qc * (1 + 0.12 * clamp((27.5 - sst) / 4, -0.5, 1.5));
      bg[k] = (0.45 + 0.55 * sm01(sst, 24.5, 28.5)) * (0.25 + 0.75 * sm01(rh, 0.2, 0.6));
      ve[k] = clamp(sh / 12, 0, 1.5);
    }
  }
};
/* the coarse environment fields of a nest centred on (lat0, lon0), from the engine's environment env (sst degC, rh %, shear kt; NaN where it has none: the centre's value stands in) */
function envGridOf(env, lat0, lon0, sg, fb, out, m) {
  m = m || fb.m || 1;
  out = out || { sst: new Float32Array(NE * NE), rh: new Float32Array(NE * NE), sh: new Float32Array(NE * NE) };
  const kx = KM_DEG * Math.cos(lat0 * DEG);
  for (let j = 0; j < NE; j++) for (let i = 0; i < NE; i++) {
    const lat = lat0 + (j - (NE - 1) / 2) * 16 * m / KM_DEG, lon = lon0 + (i - (NE - 1) / 2) * 16 * m / kx, jj = sg < 0 ? NE - 1 - j : j, k = jj * NE + i;
    const a = env.sst(lat, lon), b = env.rh(lat, lon), c = env.shear(lat, lon);
    out.sst[k] = a === a ? a : fb.sst; out.rh[k] = b === b ? clamp(b / 100, 0.05, 1) : fb.rh; out.sh[k] = c === c ? c * KT : fb.shear * (fb.m || 1);
  }
  return out;
}

/* ---- transport --------------------------------------------------------------------------------------------------------------------------------------------------------------- */
Nest.prototype.departure = function (U, V, dt) {                               // the departure cell of every cell by the midpoint rule, periodic
  const d = this.dep, ix = d.ix, iy = d.iy, fx = d.fx, fy = d.fy, h = dt / DX;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i; let x = i - 0.5 * U[k] * h, y = j - 0.5 * V[k] * h;
    let xi = Math.floor(x), yi = Math.floor(y); const ax = x - xi, ay = y - yi;
    const a0 = xi & 255, a1 = (xi + 1) & 255, b0 = (yi & 255) * N, b1 = ((yi + 1) & 255) * N;
    const um = (U[b0 + a0] * (1 - ax) + U[b0 + a1] * ax) * (1 - ay) + (U[b1 + a0] * (1 - ax) + U[b1 + a1] * ax) * ay;
    const vm = (V[b0 + a0] * (1 - ax) + V[b0 + a1] * ax) * (1 - ay) + (V[b1 + a0] * (1 - ax) + V[b1 + a1] * ax) * ay;
    x = i - um * h; y = j - vm * h; xi = Math.floor(x); yi = Math.floor(y);
    ix[k] = xi; iy[k] = yi; fx[k] = x - xi; fy[k] = y - yi;
  }
};
/* the bicubic (Catmull-Rom) value of fields A at every cell's departure point, into B; the fields flagged in `lim` stay within the four nearest values (no new extremes: rain, water) */
Nest.prototype.gather = function (A, B, lim) {
  const d = this.dep, ix = d.ix, iy = d.iy, fx = d.fx, fy = d.fy, nf = A.length;
  for (let k = 0; k < NN; k++) {
    const t = fx[k], u = fy[k], t2 = t * t, t3 = t2 * t, u2 = u * u, u3 = u2 * u;
    const w0 = -0.5 * t3 + t2 - 0.5 * t, w1 = 1.5 * t3 - 2.5 * t2 + 1, w2 = -1.5 * t3 + 2 * t2 + 0.5 * t, w3 = 0.5 * t3 - 0.5 * t2;
    const v0 = -0.5 * u3 + u2 - 0.5 * u, v1 = 1.5 * u3 - 2.5 * u2 + 1, v2 = -1.5 * u3 + 2 * u2 + 0.5 * u, v3 = 0.5 * u3 - 0.5 * u2;
    const x0 = (ix[k] - 1) & 255, x1 = ix[k] & 255, x2 = (ix[k] + 1) & 255, x3 = (ix[k] + 2) & 255;
    const o0 = ((iy[k] - 1) & 255) * N, o1 = (iy[k] & 255) * N, o2 = ((iy[k] + 1) & 255) * N, o3 = ((iy[k] + 2) & 255) * N;
    for (let f = 0; f < nf; f++) {
      const s = A[f], p1 = s[o1 + x1], p2 = s[o1 + x2], q1 = s[o2 + x1], q2 = s[o2 + x2];
      let v = v0 * (w0 * s[o0 + x0] + w1 * s[o0 + x1] + w2 * s[o0 + x2] + w3 * s[o0 + x3]) + v1 * (w0 * s[o1 + x0] + w1 * p1 + w2 * p2 + w3 * s[o1 + x3])
        + v2 * (w0 * s[o2 + x0] + w1 * q1 + w2 * q2 + w3 * s[o2 + x3]) + v3 * (w0 * s[o3 + x0] + w1 * s[o3 + x1] + w2 * s[o3 + x2] + w3 * s[o3 + x3]);
      if (lim[f]) { const lo = Math.min(p1, p2, q1, q2), hi = Math.max(p1, p2, q1, q2); v = v < lo ? lo : v > hi ? hi : v; }
      B[f][k] = v;
    }
  }
};

/* the same Catmull-Rom gather with the indices clamped at the box's edge (an open boundary: what flows in is the edge's own value), for the water and the rain; fields in `lim` stay between their four nearest values */
Nest.prototype.gatherOpen = function (A, B, lim) {
  const d = this.dep, ix = d.ix, iy = d.iy, fx = d.fx, fy = d.fy, nf = A.length, M = N - 1;
  for (let k = 0; k < NN; k++) {
    const t = fx[k], u = fy[k], t2 = t * t, t3 = t2 * t, u2 = u * u, u3 = u2 * u;
    const w0 = -0.5 * t3 + t2 - 0.5 * t, w1 = 1.5 * t3 - 2.5 * t2 + 1, w2 = -1.5 * t3 + 2 * t2 + 0.5 * t, w3 = 0.5 * t3 - 0.5 * t2;
    const v0 = -0.5 * u3 + u2 - 0.5 * u, v1 = 1.5 * u3 - 2.5 * u2 + 1, v2 = -1.5 * u3 + 2 * u2 + 0.5 * u, v3 = 0.5 * u3 - 0.5 * u2;
    const a = ix[k], b = iy[k], x0 = a - 1 < 0 ? 0 : a - 1 > M ? M : a - 1, x1 = a < 0 ? 0 : a > M ? M : a, x2 = a + 1 < 0 ? 0 : a + 1 > M ? M : a + 1, x3 = a + 2 < 0 ? 0 : a + 2 > M ? M : a + 2;
    const y0 = b - 1 < 0 ? 0 : b - 1 > M ? M : b - 1, y1 = b < 0 ? 0 : b > M ? M : b, y2 = b + 1 < 0 ? 0 : b + 1 > M ? M : b + 1, y3 = b + 2 < 0 ? 0 : b + 2 > M ? M : b + 2;
    const o0 = y0 * N, o1 = y1 * N, o2 = y2 * N, o3 = y3 * N;
    for (let f = 0; f < nf; f++) {
      const s = A[f], p1 = s[o1 + x1], p2 = s[o1 + x2], q1 = s[o2 + x1], q2 = s[o2 + x2];
      let v = v0 * (w0 * s[o0 + x0] + w1 * s[o0 + x1] + w2 * s[o0 + x2] + w3 * s[o0 + x3]) + v1 * (w0 * s[o1 + x0] + w1 * p1 + w2 * p2 + w3 * s[o1 + x3])
        + v2 * (w0 * s[o2 + x0] + w1 * q1 + w2 * q2 + w3 * s[o2 + x3]) + v3 * (w0 * s[o3 + x0] + w1 * s[o3 + x1] + w2 * s[o3 + x2] + w3 * s[o3 + x3]);
      if (lim[f]) { const lo = Math.min(p1, p2, q1, q2), hi = Math.max(p1, p2, q1, q2); v = v < lo ? lo : v > hi ? hi : v; }
      B[f][k] = v;
    }
  }
};
Nest.prototype.linear = function (a, b, oa, ob) {                              // two fields at the departure points, bilinear (the noise: smoothness is all it needs)
  const d = this.dep, ix = d.ix, iy = d.iy, fx = d.fx, fy = d.fy;
  for (let k = 0; k < NN; k++) {
    const x0 = ix[k] & 255, x1 = (ix[k] + 1) & 255, o0 = (iy[k] & 255) * N, o1 = ((iy[k] + 1) & 255) * N, t = fx[k], u = fy[k], w00 = (1 - t) * (1 - u), w10 = t * (1 - u), w01 = (1 - t) * u, w11 = t * u;
    oa[k] = a[o0 + x0] * w00 + a[o0 + x1] * w10 + a[o1 + x0] * w01 + a[o1 + x1] * w11; ob[k] = b[o0 + x0] * w00 + b[o0 + x1] * w10 + b[o1 + x0] * w01 + b[o1 + x1] * w11;
  }
};

/* the winds: the axisymmetric part exactly (circulation and flux through each circle, so the far field is right in an open domain) and the rest from a periodic Poisson solve on a
   4-km grid, both for the vorticity (rotational wind) and the divergence (the secondary circulation that convection and friction drive) */
Nest.prototype.winds = function (f) {
  const z = this.zeta, dv = this.dv, rr = this.rr, bz = this.bz, bd = this.bd, bn = this.bn, rb = this.rbin, cr = this.cr, ci = this.ci;
  bz.fill(0); bd.fill(0); bn.fill(0);
  for (let k = 0; k < NN; k++) { const b = rb[k]; bz[b] += z[k]; bd[b] += dv[k]; bn[b]++; }
  for (let b = 0; b < NR; b++) if (bn[b] > 0) { bz[b] /= bn[b]; bd[b] /= bn[b]; }
  { const Vb = this.Vb, Ub = this.Ub; let cz = 0, cd = 0; Vb[0] = 0; Ub[0] = 0;
    for (let b = 1; b < NR; b++) { const r0 = (b - 1) * 1000, r1 = b * 1000; cz += 0.5 * (bz[b - 1] * r0 + bz[b] * r1) * 1000; cd += 0.5 * (bd[b - 1] * r0 + bd[b] * r1) * 1000; Vb[b] = cz / r1; Ub[b] = cd / r1; }
    Vb[NR] = Vb[NR - 1] * (NR - 1) / NR; Ub[NR] = Ub[NR - 1] * (NR - 1) / NR; }
  let mz = 0, md = 0;
  for (let j = 0; j < NC; j++) for (let i = 0; i < NC; i++) {
    let sz = 0, sd = 0;
    for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) { const k = (2 * j + b) * N + 2 * i + a, r = rr[k], bb = Math.min(NR - 2, Math.floor(r)), t = r - bb; sz += z[k] - (bz[bb] * (1 - t) + bz[bb + 1] * t); sd += dv[k] - (bd[bb] * (1 - t) + bd[bb + 1] * t); }
    cr[j * NC + i] = sz / 4; ci[j * NC + i] = sd / 4; mz += sz / 4; md += sd / 4;
  }
  mz /= NC * NC; md /= NC * NC; for (let k = 0; k < NC * NC; k++) { cr[k] -= mz; ci[k] -= md; }
  FFT(cr, ci, false);
  for (let k = 1; k < NC * NC; k++) { const g = -1 / KSQ[k]; cr[k] *= g; ci[k] *= g; }
  cr[0] = 0; ci[0] = 0;
  FFT(cr, ci, true);
  const sc = 1 / (NC * NC) / (4 * DX), cu = this.cu, cv = this.cv, cu2 = this.cu2, cv2 = this.cv2;
  for (let j = 0; j < NC; j++) { const jm = ((j + NC - 1) & 127) * NC, jp = ((j + 1) & 127) * NC, o = j * NC; for (let i = 0; i < NC; i++) { const im = (i + NC - 1) & 127, ip = (i + 1) & 127;
    cu[o + i] = -(cr[jp + i] - cr[jm + i]) * sc; cv[o + i] = (cr[o + ip] - cr[o + im]) * sc; cu2[o + i] = (ci[o + ip] - ci[o + im]) * sc; cv2[o + i] = (ci[jp + i] - ci[jm + i]) * sc; } }
  const U = this.U, V = this.V, ct = this.cth, st = this.sth, Vb = this.Vb, Ub = this.Ub, um = f.uem, vm = f.vem, edge = this.edge;
  let vmax = 0;
  for (let j = 0; j < N; j++) {
    const y = (j - 0.5) / 2, j0 = Math.floor(y), fy = y - j0, jr0 = (j0 & 127) * NC, jr1 = ((j0 + 1) & 127) * NC;
    for (let i = 0; i < N; i++) {
      const x = (i - 0.5) / 2, i0 = Math.floor(x), fx = x - i0, a0 = i0 & 127, a1 = (i0 + 1) & 127, k = j * N + i;
      const pu = (cu[jr0 + a0] + cu2[jr0 + a0]) * (1 - fx) + (cu[jr0 + a1] + cu2[jr0 + a1]) * fx, pu1 = (cu[jr1 + a0] + cu2[jr1 + a0]) * (1 - fx) + (cu[jr1 + a1] + cu2[jr1 + a1]) * fx;
      const pv = (cv[jr0 + a0] + cv2[jr0 + a0]) * (1 - fx) + (cv[jr0 + a1] + cv2[jr0 + a1]) * fx, pv1 = (cv[jr1 + a0] + cv2[jr1 + a0]) * (1 - fx) + (cv[jr1 + a1] + cv2[jr1 + a1]) * fx;
      const r = rr[k], bb = Math.min(NR - 1, Math.floor(r)), t = r - bb, vb = Vb[bb] * (1 - t) + Vb[bb + 1] * t, ub = P_MEANU * (Ub[bb] * (1 - t) + Ub[bb + 1] * t);
      const e = edge[k];
      U[k] = e * (-vb * st[k] + ub * ct[k] + pu * (1 - fy) + pu1 * fy) + um; V[k] = e * (vb * ct[k] + ub * st[k] + pv * (1 - fy) + pv1 * fy) + vm;
      if (vb > vmax) vmax = vb;
    }
  }
  { let vm2 = 0; for (let b = 1; b < NR; b++) if (Vb[b] > vm2) vm2 = Vb[b];
    let rm = 0; for (let b = 4; b < NR - 4 && !rm; b++) if (Vb[b] > 0.6 * vm2) { let top = true; for (let q = b - 4; q <= b + 4; q++) if (Vb[q] > Vb[b]) { top = false; break; } if (top) rm = b; }        // the innermost real maximum of the mean wind (the inner eyewall of a pair of them)
    this.rmaxN = Math.max(rm || 5, 5); }
  this.vNest = vmax;                                                                                       // the strongest axisymmetric mean wind (m/s): what the efficiency adapts to
};

/* ---- one step ---------------------------------------------------------------------------------------------------------------------------------------------------------------- */
function sizeOf(f) {                                                           // the radius (km) at which the mean wind falls to 34 kt (0.6 of its maximum for a weaker one) beyond the radius of maximum wind
  if (f.sz) return f.sz;
  const m = f.m || 1, thr = Math.max(8, Math.min(17.5, 0.6 * f.vmax * m)) / m; let i = Math.ceil(Math.max(f.rmax, 5));
  while (i < NR - 1 && f.vt[i] >= thr) i++;
  return i;
}
Nest.prototype.step = function (dt) {
  if (this.keepPrev) this.savePrev();
  const f = this.forcingAt(this.t), P = PAR; this.cur = f; this.lastDt = dt;
  if (this.tabAt < 0 || this.t - this.tabAt > 600) { this.zT.set(vorticityOf(f.vt)); this.tabAt = this.t; this.sz = sizeOf(f); }
  const z = this.zeta, Q = this.Q, qn = this.qn, rc = this.rc, rs = this.rs, U = this.U, V = this.V, us = this.us, vs = this.vs, rr = this.rr, lf = this.lf, lfOn = this.lfOn, ct = this.cth, st = this.sth;
  this.winds(f);
  // the stratiform flow: half the swirl, the upper environment, and the outflow
  { const uo = P.outflow / this.m, ued = 0.45 * f.ued, ved = 0.45 * f.ved, go = this.gout; for (let k = 0; k < NN; k++) { const g = uo * go[k]; us[k] = 0.55 * U[k] + ued + g * ct[k]; vs[k] = 0.55 * V[k] + ved + g * st[k]; } }
  // advection: the swirl carries vorticity, water, the supply noise and the convective rain; the stratiform flow its own rain
  const sc = this.sc;
  this.departure(U, V, dt);
  this.gather([z], sc, [false]); this.gatherOpen([Q, rc, this.mem], [sc[1], sc[2], sc[6]], [true, true, true]);
  this.linear(qn, this.cl, sc[3], sc[4]); this.linear(this.cl2, this.cl2, sc[5], sc[5]);
  z.set(sc[0]); Q.set(sc[1]); rc.set(sc[2]); this.mem.set(sc[6]); qn.set(sc[3]); this.cl.set(sc[4]); this.cl2.set(sc[5]);
  this.clMix(Math.exp(-dt / P.clTau)); this.clMix2(Math.exp(-dt / P.cl2Tau));                                       // (the clusters change a little at every step, not by a jump every hour)
  this.departure(us, vs, dt);
  this.gatherOpen([rs], sc, [true]); rs.set(sc[0]);
  this.ciAcc += dt;
  if (this.ciAcc >= P.ciDt) {                                                      // the cirrus is slow and passive: its flow and its advection are done every few minutes, with the time waited (a third of the cost of doing it at every step)
  // the upper flow that carries the cirrus: the environment's flow aloft and the shear (the plumes go downshear), a weak anticyclonic residue of the swirl and the outflow (an anvil spreads out, curving the way an upper high turns)
    { const oc = P.ciOut / this.m, shx = 0.8 * f.shear * Math.cos(f.shdir), shy = 0.8 * f.shear * Math.sin(f.shdir), go = this.gout, uc = this.uc, vc = this.vc; for (let k = 0; k < NN; k++) { const g = oc * go[k]; uc[k] = -0.2 * U[k] + f.ued + shx + g * ct[k]; vc[k] = -0.2 * V[k] + f.ved + shy + g * st[k]; } }
    this.departure(this.uc, this.vc, this.ciAcc); this.gatherOpen([this.cir, this.cih], [sc[0], sc[1]], [true, true]); this.cir.set(sc[0]); this.cih.set(sc[1]); this.ciAcc = 0; this.spreadCirrus();
  }
  // noise: the variability of the supply, refreshed a little at every step (a cell's supply lasts about a quarter of an hour: no jumps between pictures)
  {
    const a = Math.exp(-dt / P.noiseTau), b = Math.sqrt(1 - a * a), t3 = this.t3, rng = this.rng;
    for (let k = 0; k < NN; k++) t3[k] = (rng.next() + rng.next() - 1) * 2.449;
    this.blur(t3, this.t2); this.blur(t3, this.t2);
    const nrm = this.qNorm * b; for (let k = 0; k < NN; k++) qn[k] = a * qn[k] + nrm * t3[k];
  }
  // the boundary layer's ascent (Ekman pumping of the surface stress)
  const lfD = this.lfD, t1 = this.t1, t2 = this.t2, uF = P.uFac, wb = this.wb, cd0 = P.cd[0], cdd = P.cd[1] - P.cd[0], fcor = 2 * 7.292e-5 * Math.sin(Math.max(f.lat, 3) * DEG);
  for (let k = 0; k < NN; k++) { const a = uF * (U[k] - f.uem), b = uF * (V[k] - f.vem), c = (lfOn ? cd0 + cdd * lfD[k] : cd0) * Math.sqrt(a * a + b * b); t1[k] = c * a; t2[k] = c * b; }
  { const kw = P.kw * this.m / (2 * DX), wMin = P.wMin;
    for (let j = 0; j < N; j++) { const om = ((j + N - 1) & 255) * N, op = ((j + 1) & 255) * N, o = j * N; for (let i = 0; i < N; i++) { const im = (i + N - 1) & 255, ip = (i + 1) & 255, k = o + i;
      const zz = z[k], eta = fcor + (zz > 0 ? zz : 0); const wi = zz > 0 ? P.kv * zz / (1 + zz / P.zs) : 0, we = kw * ((t2[o + ip] - t2[o + im]) - (t1[op + i] - t1[om + i])) / (eta > wMin ? eta : wMin) + wi; wb[k] = we > P.wFloor * wi ? we : P.wFloor * wi; } } }
  boxBlur(rc, this.rcB, this.t3, P.sBlur); boxBlur(wb, this.wS, this.t3, P.wBlur);
  if (this.steps % 3 === 0) { const a = this.t1, rcB = this.rcB, rs = this.rs; for (let k = 0; k < NN; k++) a[k] = rcB[k] + rs[k]; boxBlur(a, this.memA, this.t3, P.memR); }
  boxBlur(rc, this.rcN, this.t3, P.ciR);                                    // (the rain of a cell's neighbourhood: what an anvil is made of)
  this.convect(f, dt, fcor);
  // the engine's mean vorticity: the mean of every circle relaxes toward it (slowly in the core, faster outside)
  { const bz = this.bz, bn = this.bn, zT = this.zT, rm = Math.max(f.rmax, 5), g = this.gz;                    // (the circle means of the start of the step: bz is already a mean)
    for (let b = 0; b < NR; b++) { const tau = P.tauN[0] + (P.tauN[1] - P.tauN[0]) * sm01(b, 1.5 * rm, 4 * rm + 40); g[b] = bn[b] > 0 ? (zT[b] - bz[b]) * (1 - Math.exp(-dt / tau)) : 0; }
    g[NR] = 0;
    const aIn = 1 - Math.exp(-dt / P.tauA[0]), aOut = 1 - Math.exp(-dt / P.tauA[1]), rA = 2.5 * rm + 20;
    for (let k = 0; k < NN; k++) { const r = rr[k], b = Math.min(NR - 1, Math.floor(r)), t = r - b, zb = bz[b] * (1 - t) + bz[b + 1] * t, a = aOut + (aIn - aOut) * (1 - sm01(r, rA, 1.6 * rA)); z[k] += g[b] * (1 - t) + g[b + 1] * t - a * (z[k] - zb); } }
  if (P.nu > 0) this.smooth(z, this.t1, P.nu);
  // the efficiency adapts so the convection supports the engine's intensity
  { const e = Math.log(Math.max(f.vmax, 3) / Math.max(this.vNest, 3)); this.gI = clamp(this.gI + e * dt / P.tauG, -0.8, 0.8); this.g = Math.exp(clamp(0.5 * e + this.gI, -0.9, 0.9)); }
  if (this.turbOn) this.turbStep(dt);
  this.t += dt; this.steps++;
};
/* the wind a Doppler radar sees (true m/s): the nest's own wind (times the scale) plus what a 2-km grid cannot hold: turbulence (a metre a second, more in strong wind and in rain, correlated over a few km and gone in minutes) and the outflow of the downdrafts
   of the heavier cells (away from the rain, with the rain's gradient); the first call switches the noise on (it costs a few ms a step) */
Nest.prototype.turbStep = function (dt) {
  const a = Math.exp(-dt / PAR.vTau), b = Math.sqrt(1 - a * a) * 2.67, rng = this.rng, n1 = this.tn1, n2 = this.tn2, t3 = this.t3, t2 = this.t2;
  for (let w = 0; w < 2; w++) { const n = w ? n2 : n1; for (let k = 0; k < NN; k++) t3[k] = (rng.next() + rng.next() - 1) * 2.449; this.blur(t3, t2); for (let k = 0; k < NN; k++) n[k] = a * n[k] + b * t3[k]; }
};
Nest.prototype.velocity = function (outU, outV) {
  const P = PAR, N1 = N - 1;
  if (!this.turbOn) { this.turbOn = true; this.tn1 = new Float32Array(NN); this.tn2 = new Float32Array(NN); for (let w = 0; w < 3; w++) this.turbStep(1e9); }
  const mm = this.m, U = this.U, V = this.V, rc = this.rc, rs = this.rs, rcB = this.rcB, n1 = this.tn1, n2 = this.tn2, vT = P.vTurb, vO = P.vOut / (2 * DX);
  for (let j = 0; j < N; j++) { const jm = (j > 0 ? j - 1 : 0) * N, jp = (j < N1 ? j + 1 : N1) * N, o = j * N;
    for (let i = 0; i < N; i++) {
      const k = o + i, im = i > 0 ? i - 1 : 0, ip = i < N1 ? i + 1 : N1, sp = mm * Math.sqrt(U[k] * U[k] + V[k] * V[k]), amp = vT[0] + vT[1] * sp + vT[2] * Math.sqrt(rc[k] + 0.3 * rs[k]);
      const ox = -clamp(vO * (rc[o + ip] - rc[o + im]), -9, 9), oy = -clamp(vO * (rc[jp + i] - rc[jm + i]), -9, 9);
      outU[k] = mm * U[k] + amp * n1[k] + ox; outV[k] = mm * V[k] + amp * n2[k] + oy;
    } }
};
Nest.prototype.smooth = function (a, tmp, w) {
  for (let j = 0; j < N; j++) { const o = j * N; for (let i = 0; i < N; i++) tmp[o + i] = (1 - w) * a[o + i] + 0.5 * w * (a[o + ((i + 255) & 255)] + a[o + ((i + 1) & 255)]); }
  for (let j = 0; j < N; j++) { const o = j * N, om = ((j + 255) & 255) * N, op = ((j + 1) & 255) * N; for (let i = 0; i < N; i++) a[o + i] = (1 - w) * tmp[o + i] + 0.5 * w * (tmp[om + i] + tmp[op + i]); }
};

/* convection: moisture, condensation, the mass flux that stretches the vorticity, and the radar's rain */
Nest.prototype.convect = function (f, dt, fcor) {
  const P = PAR, z = this.zeta, Q = this.Q, qn = this.qn, cl = this.cl, rc = this.rc, rs = this.rs, Pr = this.P, wb = this.wb, Wc = this.Wc, dv = this.dv, rr = this.rr, lf = this.lf, lfM = this.lfM, lfOn = this.lfOn, U = this.U, V = this.V, ct = this.cth, st = this.sth;
  const rmax = Math.max(f.rmax, 5), eta = f.eta || 0, tc = f.etdir || 0, ctc = Math.cos(tc), stc = Math.sin(tc);
  const mm = this.m, vN = this.vNest * mm, fV = f.vmax * mm, sdc = Math.cos(f.shdir), sds = Math.sin(f.shdir), rfd = f.head - Math.PI / 4, crf = Math.cos(rfd), srf = Math.sin(rfd);
  const trA = clamp(f.spd * mm / 8, 0, 1) * 0.45, ventK = 1 - 0.4 * sm01(fV, 45, 70), eQs = this.eQs, eQb = this.eQb, eQc = this.eQc, eBg = this.eBg, eVent = this.eVent, qeV = P.QenvV * sm01(fV, 10, 30);
  const shA = P.shAmp * sm01(f.shear * mm, 3, 13) * (1 - 0.45 * sm01(vN, 22, 38)), cdl = Math.cos(f.shdir + Math.PI / 4), sdl = Math.sin(f.shdir + Math.PI / 4), eDry = this.eDry;
  const Qc = P.Qc, sz = this.sz || 100, exT = Math.max(eta, sm01(sz, 170, 300)), cl2 = this.cl2, rcN = this.rcN, cW = P.ciW, mem = this.mem, memA = this.memA, memK = 1 / (1 + P.memS * P.memN), rcB = this.rcB, wS = this.wS, cir = this.cir, cih = this.cih, aCi = Math.exp(-dt / P.tauCi), dzCi = dt * P.dzCi / 3600;
  const favC = sm01(f.rh, 0.25, 0.55) * sm01(f.sst, 25.5, 28), Rsup = Math.min(330, Math.max(P.bgR[0] + (P.bgR[1] - P.bgR[0]) * favC, 0.85 * sz + 40)) * (1 - 0.3 * sm01(vN, 30, 50)), bgS = 1 - P.bgOrg * sm01(vN, 28, 45) * 1.13, Lsc = clamp(sz * (1 + 0.6 * eta), 150, 420), etdW = 14 + 0.03 * Lsc, sg1 = P.bgSig[0], sg2 = P.bgSig[1], sg3 = P.bgSig[2], sg0 = -0.5 * (sg1 * sg1 + sg2 * sg2 + sg3 * sg3);
  const aEnv = dt / P.tauEnv, pm = P.Pmax * this.g * f.conv, aW = P.aW * clamp(this.g, 0.5, 1.8), aUp = 1 - Math.exp(-dt / P.tauUp), aDn = Math.exp(-dt / P.tauC2), aS = Math.exp(-dt / P.tauS), bS = 1 - aS;
  const kr = P.kr[0] + (P.kr[1] - P.kr[0]) * sm01(vN, 22, 50), orgS = sm01(vN, 30, 50), orgV = sm01(vN, 21, 33), vEff = sm01(fV, P.vOn[0], P.vOn[1]), iH = 1 / P.H, ventR = 150 + 3 * rmax, edgeS = this.edgeS, bdm = this.bd, rb = this.rbin, msk = 1 - P.meanStretch, zc = P.zCap;
  const pcS = P.pcv * (1 + 20 * sm01(vN, 20, 40)), eyeR = P.eye * this.rmaxN;
  let ringC = 0;                                                                // the ring: the share of the eyewall's annulus (1 to 2.2 radii of maximum wind) that is raining, in 16 sectors
  { const er = P.eyeRing, r0 = er[0] * this.rmaxN, r1 = er[1] * this.rmaxN, sm = this.eyeSum, cn = this.eyeCnt; sm.fill(0); cn.fill(0);
    for (let k = 0; k < NN; k++) { const r = rr[k]; if (r < r0 || r >= r1) continue; const q = Math.min(15, Math.floor((Math.atan2(st[k], ct[k]) + Math.PI) * 2.5465)); sm[q] += rc[k] + rs[k]; cn[q]++; }
    for (let q = 0; q < 16; q++) if (cn[q]) ringC += sm01(sm[q] / cn[q], er[2], er[3]);
    ringC /= 16; }
  if (this.eyeG > 0) { ringC = 1; this.eyeG -= dt; }                            // (a new strong vortex has the ring it is made of until its own rain has formed)
  const eyeT = sm01(vN - P.eyeU * unfavOf(f, mm), P.eyeV[0], P.eyeV[1]) * sm01(ringC, P.eyeRing[4], P.eyeRing[5]);
  this.eyeS += (eyeT - this.eyeS) * (1 - Math.exp(-dt / (eyeT > this.eyeS ? P.eyeTau[0] : P.eyeTau[1])));      // the eye forms in an hour or two once the ring is there and fills again when it breaks
  const eyeA = this.eyeS * (1 - 0.9 * eta);                                            // the eye: inside the nest's own radius of maximum wind, once the vortex is strong enough to have one
  for (let k = 0; k < NN; k++) {
    const eS = 1 - (1 - edgeS[k]) * (1 - exT), r = rr[k], l = lfOn ? lfM[k] : 0, c = ct[k], s = st[k];
    const sp = Math.sqrt(mm * mm * (U[k] * U[k] + V[k] * V[k]) + P.u0 * P.u0), nz = Math.max(0, 1 + P.sq * qn[k] + P.sc * cl[k] * (1 - (1 - sm01(r, 1.2 * rmax, 3 * rmax)) * orgS)) * eS;
    const gs = Math.min(1, r / (1.5 * rmax)) * Math.exp(-r / (6 * rmax + 60));
    let q = Q[k]; const Qs = eQs[k], Qe = Qc * clamp(eQb[k] + qeV, 0.55, 0.95), Qck = eQc[k], vent = eVent[k] * ventK, wBg = P.wBg * eBg[k];
    // surface evaporation (the sea only; WISHE: it grows with the wind) and the boundary layer's moisture convergence, stronger on the right-front side
    const E = P.kE * sp * Math.max(0, Qs - q) * nz * (1 - 0.92 * l);
    let w = orgV * wb[k] + (1 - orgV) * wS[k]; w *= 1 + trA * gs * (c * crf + s * srf);
    const rin = (r - rmax) / (P.inR * rmax + 25), inS = r > 0.9 * rmax ? orgS * P.inA * Math.exp(-rin * rin) * sm01(r, 0.9 * rmax, 1.25 * rmax) : 0, rq = r / Rsup, nzB = Math.exp(sg0 + sg1 * qn[k] + sg2 * cl[k] + sg3 * cl2[k]) * eS * (1 + P.memS * mem[k]) * memK;
    const nzV = orgV * nz + (1 - orgV) * nzB;
    let Sq = (Qc / P.Hq) * (w * vEff * nzV + (wBg * P.bgA * bgS * Math.exp(-rq * rq * Math.sqrt(rq)) + inS * eBg[k]) * nzB) * (1 - P.landSq * l) * (shA > 0 ? Math.max(0.05, 1 + 1.3 * shA * (c * cdl + s * sdl) * sm01(r, 0.2 * rmax, 1.6 * rmax)) : 1) * eDry[k];
    // extratropical transition: lift ahead and to the left of the motion (the warm conveyor belt), a front behind it, a dry slot to the rear
    let dry = 0, strat = 0;
    if (eta > 0.02) {
      const L = Lsc, dx = r * c, dy = r * s, along = dx * ctc + dy * stc, across = -dx * stc + dy * ctc;
      const aw = (along - 0.35 * L) / (0.8 * L), cw = (across - 0.2 * L) / (0.6 * L), warm = Math.exp(-aw * aw - cw * cw);
      const dist = Math.abs(across - 0.55 * along - 0.13 * L), front = along < 0.1 * L ? Math.exp(-dist * dist / (2 * etdW * etdW)) * sm01(-along, 0.07 * L, 0.27 * L) * Math.exp(along / (0.85 * L)) : 0;
      const ad = (along + 0.3 * L) / (0.37 * L), cd = (across + 0.37 * L) / (0.3 * L); dry = Math.exp(-ad * ad - cd * cd);
      Sq += eta * (Qc / P.Hq) * (P.etW * warm + P.etF * front) * nzB * (1 - 0.85 * dry);
      strat = eta * warm * P.gsW * eS * (0.5 + 0.5 * Math.max(0, 1 + 0.6 * cl[k] + 0.4 * cl2[k])) * (1 - 0.8 * dry);
    }
    // shear ventilates the upshear side (dry air in: the moisture there relaxes toward the environment's), land dries the column
    let relax = aEnv * (1 + P.landK * l);
    let vt = 0; if (vent > 0 && r < ventR) { const cu = -(c * sdc + s * sds); if (cu > 0) vt = dt * vent * cu * cu / 5400 * sm01(r, 0.5 * rmax, 2 * rmax); }
    relax += vt;
    if (eta > 0.02) relax += dt * eta * dry * 0.6 / 3600;
    relax += dt * P.dryR * (1 - eDry[k]) / 3600;
    { const h0 = mem[k], h1 = h0 + (1 - h0) * sm01(memA[k], P.memA[0], P.memA[1]) * dt / P.memUp - h0 * (dt * (1 + P.landK * l) / (P.memDn * (0.3 + 0.7 * eBg[k])) + vt); mem[k] = h1 < 0 ? 0 : h1 > 1 ? 1 : h1; }     // the moisture memory builds where it rains, dies away in time (faster in dry air, over land and in the shear's dry air)
    let ey = 0; if (eyeA > 0) { const eR = eyeR * (1 + P.eyeRag * (0.8 * cl[k] + 0.15 * qn[k])); if (r < 1.15 * eR) ey = eyeA * sm01(eR - r, -0.12 * eR, 0.4 * eR + 2); }
    const p0 = q > Qck ? (q - Qck) / P.tauC : 0, p = p0 > 0 ? pm * (1 - Math.exp(-p0 / pm)) * (1 - ey) : 0;
    q = q + dt * (E + Sq - p); q += relax * (Qe - q); if (ey > 0) q += ey * (1 - Math.exp(-dt / 600)) * (0.7 * Qe - q);
    Q[k] = q < 0 ? 0 : q > 2 * Qc ? 2 * Qc : q; Pr[k] = p;
    // the mass flux out of the layer stretches the vorticity; the boundary layer's ascent spins it down
    const W = aW * p; Wc[k] = W; const d = (w - W) * iH; dv[k] = d;
    const zn = z[k] - dt * (fcor + (z[k] < zc ? z[k] : zc)) * (d - msk * bdm[rb[k]]); z[k] = zn > P.zmax ? P.zmax : zn < -P.zmax ? -P.zmax : zn;
    // the radar's rain: convective rain follows the condensation; stratiform rain comes from the decay of convective rain and from broad ascent
    const R = p * 3600 * kr * (1 + Math.min(P.pcx, p / pcS)), rcn = rc[k] + (R - rc[k]) * (R > rc[k] ? aUp : 1 - aDn);
    rc[k] = ey > 0 ? rcn * (1 - P.eyeClr * ey) : rcn;
    { const e0 = cir[k] * aCi, z0 = cih[k] - dzCi;                                                                    // the cirrus: a cell's top (km) and how opaque it is; the old cirrus thins and sinks, the highest top stays
      if (rcn > 0.05) { const rcc = (1 - cW) * rcn + cW * rcN[k], zc = topZ(rcc), es = 1 - Math.exp(-rcc / 2.5); if (es > e0) { cir[k] = es; cih[k] = e0 > 0.15 && z0 > zc ? z0 : zc; } else { cir[k] = e0; cih[k] = z0 < 6 ? 6 : z0; } } else { cir[k] = e0; cih[k] = z0 < 6 ? 6 : z0; }
      if (ey > 0) cir[k] *= 1 - 0.8 * P.eyeClr * ey; }
    const sSrc = P.sigS * (P.tauS / P.tauC2) * rcn + P.gsC * rcB[k] + P.gs * Math.min(1, Math.max(0, w * vEff) / 0.4) * (1 - 0.7 * eta * dry) + strat;
    rs[k] = ey > 0 ? (rs[k] * aS + bS * sSrc * (1 - 0.95 * ey)) * (1 - 0.25 * ey) : rs[k] * aS + bS * sSrc;
  }
};

/* ---- the engine's storm as the nest's forcing ------------------------------------------------------------------------------------------------------------------------ */
const KT = 0.514444, NMI = 1.852;
function unfavOf(f, m) { return Math.max(sm01(f.shear * m, 5, 14), 1 - sm01(f.rh, 0.38, 0.62), sm01(26.5 - f.sst, 0, 3)); }          // how hostile the air is to an eye (0 to 1): strong shear, dry air or cool water
function ringInto(vt, rp, Vp, nIn, tail) {                                    // a ring of peak wind Vp (m/s) at radius rp (km) merged into the wind table by the stronger; `tail(r)` is its wind beyond rp
  for (let i = 0; i < NR; i++) { const r = Math.max(i, 0.01), v = r <= rp ? Vp * Math.pow(r / rp, nIn) : tail(r); if (v > vt[i]) vt[i] = v; }
}
/* the forcing at scale m: every length divided by m and every speed too (the wind table by radius, the radius of maximum wind, the speeds of the storm and of the layers, the shear): a storm m times smaller and m times slower,
   with the vorticity, the rotation rate and every time as they were; szT is the true size (km) at which the wind falls to 34 kt, rmaxT the true radius of maximum wind */
function scaleForcing(f, m) {
  const g = Object.assign({}, f), vt = new Float32Array(NR), src = f.vt, last = src[NR - 1];
  for (let i = 0; i < NR; i++) { const r = i * m, a = Math.floor(r); vt[i] = (a >= NR - 1 ? last * Math.pow((NR - 1) / Math.max(r, 1), 0.5) : src[a] * (1 - (r - a)) + src[a + 1] * (r - a)) / m; }
  g.vt = vt; g.m = m; g.vmax = f.vmax / m; g.rmax = f.rmax / m; g.shear = f.shear / m; g.uem = f.uem / m; g.vem = f.vem / m; g.ued = f.ued / m; g.ved = f.ved / m; g.spd = f.spd / m;
  return g;
}
/* the scale a system of true size szT (km) wants: the box of 256 cells of 2 m km should hold it with room (1.25 of its size), but the eye must stay resolved (a radius of maximum wind of at least 9 cells); between 1 and 3, in
   quarter steps, and the scale it has now stays unless the wanted one is more than about 20 % away (no flicker) */
function scaleOf(szT, rmaxT, mPrev) {
  const want = clamp(Math.min(1.25 * szT / 256, Math.max(1, rmaxT / 9)), 1, 3);
  if (mPrev > 0 && Math.abs(Math.log(want / mPrev)) < 0.2) return mPrev;
  return Math.round(want * 4) / 4;
}
/* the forcing of a system S at hour h in the engine's weather env (the nest works in the northern hemisphere's frame: south of the equator y is mirrored, `mirror` says so):
   its mean wind profile (the engine's, with the inner core made hollow for a strong storm: a ring, not solid rotation; two rings during an eyewall replacement), the environment (sea temperature,
   humidity, shear and its direction, the flow of the layers relative to the storm), its motion, and how far an extratropical transition has gone */
function forcingOf(S, par, env, h, m) {
  const HS = root.HFStorms, sg = S.lat < 0 ? -1 : 1, st = [0, 0, 0, 0, 0, 0];
  if (env && typeof env.steer === 'function') env.steer(S.lat, S.lon, st);
  const cx = S.cx || 0, cy = S.cy || 0, vt = new Float32Array(NR), W = par.wind;
  let Vs, rmax;
  if (S.th === 'wv') {                                                         // a disturbance: a broad weak vortex (its wind is the engine's, its size is not known to it)
    Vs = clamp(S.vr, 8, 34) * KT; rmax = 100 + 2 * (34 - clamp(S.vr, 8, 34));
    const tail = (r) => Vs * Math.pow(rmax / r, 0.4);
    ringInto(vt, rmax, Vs, 1, tail);
  } else {
    const P = HS.windProfile(S, par, null), X = S.erc, tailOf = (Pq) => (r) => HS.profileAt(Pq, r / NMI) * KT;
    const nIn = 1 + 2 * sm01(P.Vs, 50, 100);
    Vs = P.Vs * KT; rmax = P.rmax * NMI;
    if (X) {                                                                  // an eyewall replacement: the inner ring fades as the outer one forms outside it and takes over
      const E = W.erc, t = Math.max(0, h - X.t0), a = X.d0, b = a + X.d1, rb = Math.exp(S.rm - (S.ercRm || 0)) * NMI, sm = (x) => sm01(x, 0, 1);
      const rIn = rb * Math.pow(E.rm0, sm(t / a));
      const wOut = t < a ? 0.45 * sm(t / a) : t < b ? 0.45 + 0.55 * sm((t - a) / X.d1) : 1, wIn = t < a ? 1 : t < b ? 1 - 0.85 * sm((t - a) / X.d1) : 0.15 * (1 - sm((t - b) / X.d2));
      const rOut = rb * X.rmx * (t < a ? 1.2 : t < b ? 1.2 - 0.2 * sm((t - a) / X.d1) : Math.pow(E.rm2, sm((t - b) / X.d2)));
      const Vb = (P.Vs + (S.ercDef || 0)) * KT, Vo = P.Vs * KT * (0.55 + 0.45 * wOut), Pq = Object.assign({}, P, { rmax: rOut / NMI, Vs: Vo / KT, vr34: Vo / KT * Math.pow(rOut / NMI / P.r34, P.x) });
      ringInto(vt, rIn, wIn * Vb, nIn, (r) => wIn * Vb * Math.pow(rIn / r, 1.3));
      ringInto(vt, rOut, Vo, 2.5, tailOf(Pq));
      rmax = wIn > 0.5 ? rIn : rOut; Vs = Math.max(wIn * Vb, Vo);
    } else ringInto(vt, rmax, Vs, nIn, tailOf(P));
  }
  const sh = S.lastShear * KT, sdx = st[4] - st[0], sdy = sg * (st[5] - st[1]);
  const subT = S.th === 'sc' || (S.th === 'wv' && S.sub), eta = S.th === 'ex' ? sm01(h - Math.max(S.etAt, 0), 0, W.ex ? W.ex.T : 60) : S.th === 'nl' ? 0.35 : subT ? 0.4 : 0;
  const F = {
    clat: S.lat, clon: S.lon, lat: Math.abs(S.lat), vmax: Vs, rmax, vt, shear: sh, shdir: Math.atan2(sdy, sdx), uem: (st[2] - cx) * KT, vem: sg * (st[3] - cy) * KT, ued: (st[4] - cx) * KT, ved: sg * (st[5] - cy) * KT,
    head: Math.atan2(sg * cy, cx), spd: Math.hypot(cx, cy) * KT, rh: clamp(S.lastRh / 100, 0.1, 1), sst: S.lastSst, eta, etdir: Math.atan2(sg * cy, cx), conv: S.th === 'nl' ? 0.8 : 1, org: 0, sg, cold: subT ? 1 : 0,
  };
  F.m = 1; F.szT = sizeOf(F); F.rmaxT = F.rmax;
  return m && m !== 1 ? scaleForcing(F, m) : F;
}
/* the land fraction of every cell of the nest centred on (lat, lon), from the host's land test: row 0 is south (the nest mirrors it itself south of the equator) */
function landGrid(lat0, lon0, isLand, out, m) {
  m = m || 1; const kx = KM_DEG * Math.cos(lat0 * DEG);
  for (let j = 0; j < N; j++) { const lat = lat0 + (j - (N - 1) / 2) * 2 * m / KM_DEG; for (let i = 0; i < N; i++) out[j * N + i] = isLand(lat, lon0 + (i - (N - 1) / 2) * 2 * m / kx) ? 1 : 0; }
  const t = new Float32Array(NN);
  for (let pass = 0; pass < 2; pass++) { for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; t[k] = 0.25 * out[j * N + Math.max(0, i - 1)] + 0.5 * out[k] + 0.25 * out[j * N + Math.min(N - 1, i + 1)]; }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; out[k] = 0.25 * t[Math.max(0, j - 1) * N + i] + 0.5 * t[k] + 0.25 * t[Math.min(N - 1, j + 1) * N + i]; } }
  return out;
}

/* the rain `frac` of a step after the last one, for a picture that glides between steps: each tracer is carried back along its own flow for that fraction of the step (nothing of the model changes) */
Nest.prototype.display = function (frac, tex, ir) {
  if (!this.drc) { this.drc = new Float32Array(NN); this.drs = new Float32Array(NN); }
  if (ir && !this.dcr) { this.dcr = new Float32Array(NN); this.dch = new Float32Array(NN); this.dQ = new Float32Array(NN); }
  const rc = this.rc, rs = this.rs, drc = this.drc, drs = this.drs;
  if (!(frac > 0.02) || !this.cur) { drc.set(rc); drs.set(rs); if (ir) { this.dcr.set(this.cir); this.dch.set(this.cih); this.dQ.set(this.Q); } if (tex) this.texture(ir); return; }
  const h = frac * this.lastDt / DX, U = this.U, V = this.V, us = this.us, vs = this.vs;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    for (let w = 0; w < 2; w++) {
      const src = w ? rs : rc, dst = w ? drs : drc, x = i - (w ? us[k] : U[k]) * h, y = j - (w ? vs[k] : V[k]) * h, xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi, c0 = xi & 255, c1 = (xi + 1) & 255, d0 = (yi & 255) * N, d1 = ((yi + 1) & 255) * N;
      dst[k] = (src[d0 + c0] * (1 - tx) + src[d0 + c1] * tx) * (1 - ty) + (src[d1 + c0] * (1 - tx) + src[d1 + c1] * tx) * ty;
    }
  }
  if (ir) {                                                                      // the cirrus is carried by the upper flow, the water by the swirl
    const cir = this.cir, cih = this.cih, Q = this.Q, dcr = this.dcr, dch = this.dch, dQ = this.dQ, uc = this.uc, vc = this.vc;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      for (let w = 0; w < 3; w++) {
        const src = w === 0 ? cir : w === 1 ? cih : Q, dst = w === 0 ? dcr : w === 1 ? dch : dQ, ux = w < 2 ? uc[k] : U[k], vy = w < 2 ? vc[k] : V[k], x = i - ux * h, y = j - vy * h, xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi, c0 = xi & 255, c1 = (xi + 1) & 255, d0 = (yi & 255) * N, d1 = ((yi + 1) & 255) * N;
        dst[k] = (src[d0 + c0] * (1 - tx) + src[d0 + c1] * tx) * (1 - ty) + (src[d1 + c0] * (1 - tx) + src[d1 + c1] * tx) * ty;
      }
    }
  }
  if (tex) this.texture(ir);
};

/* the radar's texture: what a 2-km cell cannot hold, the cells and the patchiness of the rain below it (a few km), as a multiplicative variation that is carried by the flow like the supply noise it is made of */
/* the picture between two steps without a leap at the next one (the page's clock): the state one step ago and the state now are mixed over the step, the old one carried forward by the flow to the instant and the new one carried
   back, so the picture shows the model a step late but what the next step brings has already been arriving; phi runs from 0 to 1 over the step, the noise of the texture is mixed the same way */
Nest.prototype.savePrev = function () {
  const names = ['rc', 'rs', 'cir', 'cih', 'Q', 'qn', 'cl'], pv = this.pv || (this.pv = {});
  for (const n of names) { if (!pv[n]) pv[n] = new Float32Array(NN); pv[n].set(this[n]); }
};
Nest.prototype.displayBlend = function (phi, tex, ir) {
  if (!this.keepPrev) this.keepPrev = true;
  if (!this.pv) this.savePrev();
  if (!this.cur) return this.display(0, tex, ir);
  phi = phi < 0 ? 0 : phi > 1 ? 1 : phi;
  if (!this.drc) { this.drc = new Float32Array(NN); this.drs = new Float32Array(NN); }
  if (ir && !this.dcr) { this.dcr = new Float32Array(NN); this.dch = new Float32Array(NN); this.dQ = new Float32Array(NN); }
  const dt = this.lastDt, hF = phi * dt / DX, hB = (1 - phi) * dt / DX, pv = this.pv;
  const mix = (a, b, dst, U, V) => {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, u = U[k], v = V[k]; let va = 0, vb = 0;
      for (let w = 0; w < 2; w++) {
        const x = i + (w ? u * hB : -u * hF), y = j + (w ? v * hB : -v * hF), src = w ? b : a, xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi, c0 = xi & 255, c1 = (xi + 1) & 255, d0 = (yi & 255) * N, d1 = ((yi + 1) & 255) * N;
        const r = (src[d0 + c0] * (1 - tx) + src[d0 + c1] * tx) * (1 - ty) + (src[d1 + c0] * (1 - tx) + src[d1 + c1] * tx) * ty; if (w) vb = r; else va = r;
      }
      dst[k] = (1 - phi) * va + phi * vb;
    }
  };
  mix(pv.rc, this.rc, this.drc, this.U, this.V); mix(pv.rs, this.rs, this.drs, this.us, this.vs);
  if (ir) { mix(pv.cir, this.cir, this.dcr, this.uc, this.vc); mix(pv.cih, this.cih, this.dch, this.uc, this.vc); mix(pv.Q, this.Q, this.dQ, this.U, this.V); }
  if (tex) { const qb = this.t1, cb = this.t2, q0 = pv.qn, c0 = pv.cl, q1 = this.qn, c1 = this.cl; for (let k = 0; k < NN; k++) { qb[k] = (1 - phi) * q0[k] + phi * q1[k]; cb[k] = (1 - phi) * c0[k] + phi * c1[k]; } this.texture(ir, qb, cb); }
};
/* the anvil spreads sideways: the cloud's opacity and its top (weighted by the opacity) are mixed over a few km, so the gaps between the cells of a canopy fill in and its edges soften */
Nest.prototype.blurOpen = function (a, tmp) {                                  // [1 2 1]/4 in x then y, the box's edge value standing beyond the edge (an open boundary: nothing wraps round), in place
  for (let j = 0; j < N; j++) { const o = j * N; for (let i = 0; i < N; i++) tmp[o + i] = 0.25 * a[o + (i > 0 ? i - 1 : 0)] + 0.5 * a[o + i] + 0.25 * a[o + (i < N - 1 ? i + 1 : N - 1)]; }
  for (let j = 0; j < N; j++) { const o = j * N, om = (j > 0 ? j - 1 : 0) * N, op = (j < N - 1 ? j + 1 : N - 1) * N; for (let i = 0; i < N; i++) a[o + i] = 0.25 * tmp[om + i] + 0.5 * tmp[o + i] + 0.25 * tmp[op + i]; }
};
Nest.prototype.spreadCirrus = function () {
  const e = this.cir, h = this.cih, a = this.t1, b = this.t2, tmp = this.t3;
  for (let k = 0; k < NN; k++) { a[k] = e[k]; b[k] = e[k] * h[k]; }
  for (let p = 0; p < PAR.ciSp; p++) { this.blurOpen(a, tmp); this.blurOpen(b, tmp); }
  for (let k = 0; k < NN; k++) { const w = a[k]; if (w > 1e-4) { const hm = b[k] / w; if (!(e[k] > 0.3 && h[k] > hm)) h[k] = hm; e[k] = w > 1 ? 1 : w; } else e[k] = 0; }          // (a gap takes the canopy's level, a cloud keeps its own top where it is higher: the domes stay)
};
Nest.prototype.texture = function (ir, qnIn, clIn) {                                          // (the cirrus' texture is in its transparency: thick cirrus stays opaque, thin cirrus is streaky)
  const P = PAR, drc = this.drc, drs = this.drs, qn = qnIn || this.qn, cl = clIn || this.cl, a = ir ? 0 : P.texS, b = P.texC, c0 = -0.5 * (a * a + 0.7 * b * b), a2 = P.texR, b2 = P.texCc, c2 = -0.5 * (a2 * a2 + 0.7 * b2 * b2);
  if (!ir) for (let k = 0; k < NN; k++) { const q = qn[k], c = cl[k]; if (drs[k] > 0.005) drs[k] *= Math.exp(c0 + a * q + b * c); if (drc[k] > 0.005) drc[k] *= Math.exp(c2 + a2 * q + b2 * c); }
  if (ir && this.dcr) { const dcr = this.dcr, t0 = P.ciTex[0], t1 = P.ciTex[1]; for (let k = 0; k < NN; k++) { const e = dcr[k]; if (e > 0.01) { const v = 1 - (1 - e) * Math.exp(t0 * qn[k] + t1 * cl[k] - 0.5 * (t0 * t0 + 0.7 * t1 * t1)); dcr[k] = v < 0 ? 0 : v > 1 ? 1 : v; } } }
};

/* ---- the infrared picture: the brightness temperature (C) of every cell: the sea (or the land) seen through what is above it, layer by layer: scattered low clouds from the water of the column, the tops of the
   rain clouds (convective tops from the rain rate, stratiform tops lower), the cirrus the convection spread (its thickness and top), the colder the higher; a tropical atmosphere reaches about -72 C at 15 km
   (a cell that overshoots goes colder), the tropopause is lower and warmer poleward; what a 2-km model cannot hold is the texture on the cirrus ---- */
const IR_STOPS = [[40, [6, 6, 6]], [30, [56, 56, 56]], [20, [108, 108, 108]], [10, [160, 160, 160]], [0, [205, 205, 205]], [-10, [238, 238, 238]], [-19.9, [254, 254, 254]], [-20.1, [3, 251, 255]], [-22.5, [2, 210, 231]], [-25, [0, 150, 195]], [-27.5, [0, 87, 163]], [-30, [2, 0, 116]], [-32.5, [5, 41, 100]], [-35, [5, 100, 80]], [-37.5, [1, 171, 35]], [-40, [6, 250, 8]], [-42.5, [42, 255, 0]], [-45, [104, 255, 3]], [-47.5, [169, 255, 2]], [-50, [245, 255, 2]], [-52.5, [253, 212, 0]], [-55, [252, 150, 0]], [-57.5, [255, 84, 2]], [-60, [249, 4, 0]], [-62.5, [210, 1, 1]], [-65, [156, 0, 1]], [-67.5, [84, 1, 1]], [-70, [26, 3, 4]], [-70.6, [0, 0, 0]], [-79.9, [236, 236, 236]], [-80.1, [238, 111, 193]], [-82.5, [219, 91, 181]], [-85, [195, 70, 169]], [-87.5, [158, 31, 147]], [-90, [115, 6, 113]]];
function irColor(t) {                                                          // the colour of a brightness temperature (C), read off the chosen colour bar: black to white from +40 to -20, a step to cyan, blue, green, yellow, orange and red down to -70, black, grey to white to -80, a step to pink and purple at -90
  const S = IR_STOPS; if (t >= S[0][0]) return S[0][1]; if (t <= S[S.length - 1][0]) return S[S.length - 1][1];
  let i = 1; while (i < S.length - 1 && t < S[i][0]) i++;
  const a = S[i - 1], b = S[i], u = (a[0] - t) / (a[0] - b[0]); return [a[1][0] + (b[1][0] - a[1][0]) * u, a[1][1] + (b[1][1] - a[1][1]) * u, a[1][2] + (b[1][2] - a[1][2]) * u];
}
const capZ = (z) => { const c = PAR.top[2], w = PAR.top[3]; return z > c ? c + w * Math.tanh((z - c) / w) : z; };                // (no cloud top is higher than the tropopause's overshoot, convective or stratiform)
const topZ = (r) => capZ(PAR.top[0] + PAR.top[1] * Math.log(1 + r / 3));
const irTz = (ts, z, ztp, ttp) => (z <= ztp ? ts + (ttp - ts) * z / ztp : Math.max(-105, ttp - 9 * (z - ztp)));       // the temperature at height z (km): a straight fall to the tropopause, colder above it for a cell that overshoots
Nest.prototype.irTb = function (out, ts0) {
  if (!this.dcr) this.display(0, true, true);
  const P = PAR, Qc = P.Qc, rc = this.drc, rs = this.drs, ci = this.dcr, cz = this.dch, Q = this.dQ, lfM = this.lfM, lfOn = this.lfOn, f = this.cur || this.f0, lat = f.lat;
  const ztp = clamp(16.5 - 0.12 * Math.max(0, lat - 20), 9, 16.5), ttp = -75 + 0.7 * Math.max(0, lat - 18), zk = ztp / 16.5;       // (the clouds' heights are tropical ones: poleward they are scaled by the lower tropopause, so a deep cloud at 50 N tops out near -45 C, not -80 C)
  for (let k = 0; k < NN; k++) {
    const ts = ts0 + (lfOn ? 3 * lfM[k] : 0), qr = Q[k] / Qc, aL = sm01(qr, 0.93, 1.0);
    let tb = ts;
    if (aL > 0) tb += 0.9 * aL * (irTz(ts, zk * (1 + 4.5 * sm01(qr, 0.94, 1.02)), ztp, ttp) - ts);                    // scattered low cloud
    const r1 = rc[k], r2 = rs[k];
    if (r1 > 0.05 || r2 > 0.05) { const zt = Math.max(r1 > 0.05 ? topZ(r1) : 0, capZ(7 + 2.4 * Math.log(1 + r2 / 0.5))); tb += (1 - Math.exp(-(r1 / 3 + r2 / 0.7))) * (irTz(ts, zk * zt, ztp, ttp) - tb); }     // the rain clouds
    const e = ci[k]; if (e > 0.01) { const m = tb + e * (irTz(ts, zk * cz[k], ztp, ttp) - tb); if (m < tb) tb = m; }                                           // the cirrus over them
    out[k] = tb;
  }
  return out;
};

/* ---- the radar's picture --------------------------------------------------------------------------------------------------------------------------------------------------- */
function dbzOf(rc, rs) {                                                       // reflectivity (dBZ) of convective rain rc and stratiform rain rs (mm/h): Z = 250 R^1.2 and 200 R^1.6
  const z = (rc > 0 ? 250 * Math.pow(rc, 1.2) : 0) + (rs > 0 ? 200 * Math.pow(rs, 1.6) : 0);
  return z > 0.1 ? 10 * Math.log10(z) : -20;
}
Nest.prototype.dbz = function (out) { const rc = this.rc, rs = this.rs; for (let k = 0; k < NN; k++) out[k] = dbzOf(rc[k], rs[k]); return out; };

root.HFNest = { N, NC, DX, NR, NE, PAR, create: (o) => new Nest(o), IR_STOPS, irColor, dbzOf, lerpForcing, vorticityOf, forcingOf, scaleForcing, scaleOf, landGrid, envGridOf, sm01 };
})(typeof globalThis !== 'undefined' ? globalThis : this);
/* ==== STORM NEST END ==== */
