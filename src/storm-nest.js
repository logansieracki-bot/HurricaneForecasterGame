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
 *    - convection: a column of water Q, fed by that convergence and by the sea (evaporation grows with the wind: WISHE, Emanuel 1986), rains out above a threshold in
 *      a time tauC, so cells have a life cycle and a spacing; the rain's latent heating is a mass flux W = aW P out of the layer, which stretches the vorticity
 *      (d zeta / dt = (f + zeta)(W - w) / H): convection builds the vortex, the Ekman suction spins it down. Shear ventilates the upshear side, the lead of the
 *      right-front side and the coast shape where it rains, an extratropical transition adds the baroclinic lift and the dry slot;
 *    - the radar: rain tracers (convective: short-lived; stratiform: made from decaying convective rain and broad ascent, long-lived, smeared outward and downshear)
 *      and a forward operator Z = 250 R^1.2 for convective rain (the NHC's tropical relation) and 200 R^1.6 for stratiform, with the beam geometry of a site.
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
  cd: [2.4e-3, 5e-3], uFac: 0.8, kw: 5, wMin: 3e-4, kv: 150, zs: 2e-3, wFloor: 0.3, wBg: 0.035, vOn: [8, 28],   // drag coefficient at sea and over land; the share of the gradient wind the boundary layer's winds keep; the pumping's scale (the slab layer's inflow, about 5 times the Ekman value); the least f + zeta (1/s); the convergence of the inflow that goes with the vorticity (m: w = kv zeta, saturating at zs), and the share of it that is left where the Ekman formula would make descent (the boundary layer stays convergent); the large-scale ascent of the tropical atmosphere that starts convection in a disorganised system (m/s); the wind range (m/s) over which the vortex's own convergence takes over from it
  Qc: 50, tauC: 600, Qstar: 1.06, Qenv: 0.8, QenvV: 0.1, tauEnv: 43200, kE: 3e-7, u0: 1.5,    // convection: the column water above which it rains (mm), its time (s), the sea's saturation relative to Qc, the environment's relative to Qc (for a weak vortex, and the more for a strong one: a storm moistens its surroundings) and its relaxation (s), evaporation per metre of wind, the gust
  aW: 45, Pmax: 0.03, kr: [1.1, 2.4],                      // the mass flux per mm/s of rain (m per mm), the most rain convection can make from the supply (mm/s), the rain a mm/s of condensation is, for a weak and for a strong vortex (the column above the layer converges moisture too, the more the deeper the convection)
  sq: 1.3, noiseTau: 300, sc: 1.1, clTau: 7200,                             // the multiplicative variability of the supply: cell scale (and its memory, s) and mesoscale clusters 30 km across (their share and memory), which the swirl shears into spiral arms
  tauUp: 300, tauC2: 1200, sigS: 0.05, tauS: 1800, gs: 0.4,    // radar rain: rise time of convective rain (s), its fall time; the share of it stratiform rain receives (per tauC2), its life (s), the rain of broad ascent (mm/h)
  outflow: 4, gsW: 2.4,                                 // the upper-level outflow (m/s) that carries stratiform rain outward from the core; the stratiform rain of an extratropical transition's warm sector (mm/h)
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
  this.t = 0; this.steps = 0; this.g = 1; this.gI = 0;                                                   // seconds since the nest started, steps taken, the heating efficiency (adapts) and its integral
  const mk = () => new Float32Array(NN);
  this.zeta = mk(); this.Q = mk(); this.qn = mk(); this.cl = mk(); this.rc = mk(); this.rs = mk(); this.P = mk();         // vorticity, column water, supply noise, convective and stratiform rain (mm/h), condensation (mm/s)
  this.wb = mk(); this.Wc = mk(); this.dv = mk(); this.U = mk(); this.V = mk(); this.us = mk(); this.vs = mk();     // boundary-layer ascent, convective mass flux, divergence, the swirl, the stratiform flow
  this.lf = mk(); this.t1 = mk(); this.t2 = mk(); this.t3 = mk(); this.sc = [mk(), mk(), mk(), mk(), mk(), mk()];
  this.dep = { ix: new Int32Array(NN), iy: new Int32Array(NN), fx: mk(), fy: mk() };
  this.rr = mk(); this.cth = mk(); this.sth = mk(); this.gout = mk(); this.edge = mk(); this.edgeS = mk(); this.rbin = new Int16Array(NN);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i - (N - 1) / 2) * DX / 1000, y = (j - (N - 1) / 2) * DX / 1000, k = j * N + i, r = Math.hypot(x, y);
    this.rr[k] = r; this.cth[k] = r > 0 ? x / r : 1; this.sth[k] = r > 0 ? y / r : 0; this.rbin[k] = Math.min(NR - 1, Math.round(r));
    const rg = Math.max(r, 1); this.gout[k] = sm01(rg, 5, 40) * Math.exp(-rg / 220);
    this.edge[k] = 1 - sm01(Math.max(Math.abs(x), Math.abs(y)), 170, 250); this.edgeS[k] = 1 - sm01(Math.max(Math.abs(x), Math.abs(y)), 200, 245);                                     // the vortex's winds fade toward the box's edges so the periodic domain has no seam
  }
  this.cr = new Float64Array(NC * NC); this.ci = new Float64Array(NC * NC);
  this.cu = new Float32Array(NC * NC); this.cv = new Float32Array(NC * NC); this.cu2 = new Float32Array(NC * NC); this.cv2 = new Float32Array(NC * NC);
  this.bz = new Float64Array(NR + 1); this.bd = new Float64Array(NR + 1); this.bn = new Float64Array(NR + 1); this.Vb = new Float64Array(NR + 1); this.Ub = new Float64Array(NR + 1);
  this.zT = new Float32Array(NR + 1); this.gz = new Float32Array(NR + 1);                                  // the engine's mean vorticity by radius (km); the correction that pulls the mean to it
  this.f0 = null; this.f1 = null; this.cur = null; this.lastDt = 120; this.lfOn = false; this.vNest = 0; this.qNorm = 1; this.rmaxN = 30;
}

/* ---- the forcing: what the engine says the storm and its surroundings are (see forcingOf) --------------------------------------------------------------------------- */
const FKEYS = ['clat', 'clon', 'lat', 'vmax', 'rmax', 'shear', 'shdir', 'uem', 'vem', 'ued', 'ved', 'head', 'spd', 'rh', 'sst', 'eta', 'etdir', 'conv', 'org'];
function lerpForcing(a, b, t) {
  if (!b || t <= 0) return a; if (t >= 1) return b;
  const f = Object.assign({}, a);
  for (const k of FKEYS) if (typeof a[k] === 'number' && typeof b[k] === 'number') f[k] = a[k] + (b[k] - a[k]) * t;
  f.vt = new Float32Array(NR); for (let i = 0; i < NR; i++) f.vt[i] = a.vt[i] + (b.vt[i] - a.vt[i]) * t;
  return f;
}
Nest.prototype.setForcing = function (f0, f1) { this.f0 = f0; this.f1 = f1 || f0; this.tF0 = this.t; this.tabAt = -1; };
Nest.prototype.forcingAt = function (t) { return lerpForcing(this.f0, this.f1, clamp((t - this.tF0) / 3600, 0, 1)); };
Nest.prototype.setLand = function (lf, mirror) {                               // lf: Float32Array(N*N), row 0 = south (the host's order); mirror: the southern hemisphere's flip
  const d = this.lf; this.lfOn = false;
  for (let j = 0; j < N; j++) { const sj = mirror ? N - 1 - j : j; for (let i = 0; i < N; i++) { const v = lf[sj * N + i]; d[j * N + i] = v; if (v > 0) this.lfOn = true; } }
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
  this.setForcing(f, f); this.zT.set(vorticityOf(f.vt)); this.tabAt = 0;
  const z = this.zeta, Q = this.Q, rr = this.rr, P = PAR;
  for (let k = 0; k < NN; k++) { const r = rr[k], a = Math.min(NR - 1, Math.floor(r)), t = r - a; z[k] = this.zT[a] * (1 - t) + this.zT[a + 1] * t; Q[k] = P.Qc * (P.Qenv + P.QenvV * sm01(f.vmax, 10, 30) + 0.12 * Math.exp(-r / 120)); }
  this.clMix(0); for (let k = 0; k < NN; k++) Q[k] += 4 * this.cl[k] * (1 + 0.5 * Math.exp(-rr[k] / 150));
  const qn = this.qn; for (let k = 0; k < NN; k++) qn[k] = (this.rng.next() + this.rng.next() - 1) * 2.449;
  this.blur(qn, this.t1); this.blur(qn, this.t1);
  let s2 = 0; for (let k = 0; k < NN; k++) s2 += qn[k] * qn[k]; this.qNorm = 1 / Math.sqrt(s2 / NN); for (let k = 0; k < NN; k++) qn[k] *= this.qNorm;
};
Nest.prototype.blur = function (a, tmp) {                                       // [1 2 1]/4 in x then y (periodic), in place
  for (let j = 0; j < N; j++) { const o = j * N; for (let i = 0; i < N; i++) tmp[o + i] = 0.25 * a[o + ((i + N - 1) & 255)] + 0.5 * a[o + i] + 0.25 * a[o + ((i + 1) & 255)]; }
  for (let j = 0; j < N; j++) { const o = j * N, om = ((j + N - 1) & 255) * N, op = ((j + 1) & 255) * N; for (let i = 0; i < N; i++) a[o + i] = 0.25 * tmp[om + i] + 0.5 * tmp[o + i] + 0.25 * tmp[op + i]; }
};

Nest.prototype.clMix = function (a) {                                          // the cluster noise relaxes toward a fresh field of unit normals on a 16 x 16 grid (cells 32 km), interpolated smoothly; a = the share it keeps
  if (!this.clc) this.clc = new Float32Array(256);
  const c = this.clc, cl = this.cl, b = Math.sqrt(Math.max(0, 1 - a * a));
  for (let k = 0; k < 256; k++) c[k] = (this.rng.next() + this.rng.next() + this.rng.next() - 1.5) * 2;
  for (let j = 0; j < N; j++) { const y = j / 16, j0 = Math.floor(y) & 15, j1 = (j0 + 1) & 15, fy = y - Math.floor(y), sy = fy * fy * (3 - 2 * fy);
    for (let i = 0; i < N; i++) { const x = i / 16, i0 = Math.floor(x) & 15, i1 = (i0 + 1) & 15, fx = x - Math.floor(x), sx = fx * fx * (3 - 2 * fx);
      const v = (c[j0 * 16 + i0] * (1 - sx) + c[j0 * 16 + i1] * sx) * (1 - sy) + (c[j1 * 16 + i0] * (1 - sx) + c[j1 * 16 + i1] * sx) * sy; cl[j * N + i] = a * cl[j * N + i] + b * v; } }
};

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
  { let rm = 0, vm2 = 0; for (let b = 1; b < NR; b++) if (Vb[b] > vm2) { vm2 = Vb[b]; rm = b; } this.rmaxN = Math.max(rm, 5); }
  this.vNest = vmax;                                                                                       // the strongest axisymmetric mean wind (m/s): what the efficiency adapts to
};

/* ---- one step ---------------------------------------------------------------------------------------------------------------------------------------------------------------- */
Nest.prototype.step = function (dt) {
  const f = this.forcingAt(this.t), P = PAR; this.cur = f; this.lastDt = dt;
  if (this.tabAt < 0 || this.t - this.tabAt > 600) { this.zT.set(vorticityOf(f.vt)); this.tabAt = this.t; }
  const z = this.zeta, Q = this.Q, qn = this.qn, rc = this.rc, rs = this.rs, U = this.U, V = this.V, us = this.us, vs = this.vs, rr = this.rr, lf = this.lf, lfOn = this.lfOn, ct = this.cth, st = this.sth;
  this.winds(f);
  // the stratiform flow: half the swirl, the upper environment, and the outflow
  { const uo = P.outflow, ued = 0.45 * f.ued, ved = 0.45 * f.ved, go = this.gout; for (let k = 0; k < NN; k++) { const g = uo * go[k]; us[k] = 0.55 * U[k] + ued + g * ct[k]; vs[k] = 0.55 * V[k] + ved + g * st[k]; } }
  // advection: the swirl carries vorticity, water, the supply noise and the convective rain; the stratiform flow its own rain
  const sc = this.sc;
  this.departure(U, V, dt);
  this.gather([z, Q, rc], sc, [false, true, true]);
  this.linear(qn, this.cl, sc[3], sc[4]);
  z.set(sc[0]); Q.set(sc[1]); rc.set(sc[2]); qn.set(sc[3]); this.cl.set(sc[4]);
  if (this.steps % 30 === 0 && this.steps > 0) this.clMix(Math.exp(-30 * dt / P.clTau));
  this.departure(us, vs, dt);
  this.gather([rs], sc, [true]); rs.set(sc[0]);
  // noise: the variability of the supply, refreshed a little each other step
  if (this.steps % 2 === 0) {
    const a = Math.exp(-2 * dt / P.noiseTau), b = Math.sqrt(1 - a * a), t3 = this.t3, rng = this.rng;
    for (let k = 0; k < NN; k++) t3[k] = (rng.next() + rng.next() - 1) * 2.449;
    this.blur(t3, this.t2); this.blur(t3, this.t2);
    const nrm = this.qNorm * b; for (let k = 0; k < NN; k++) qn[k] = a * qn[k] + nrm * t3[k];
  }
  // the boundary layer's ascent (Ekman pumping of the surface stress)
  const t1 = this.t1, t2 = this.t2, uF = P.uFac, wb = this.wb, cd0 = P.cd[0], cdd = P.cd[1] - P.cd[0], fcor = 2 * 7.292e-5 * Math.sin(Math.max(f.lat, 3) * DEG);
  for (let k = 0; k < NN; k++) { const a = uF * (U[k] - f.uem), b = uF * (V[k] - f.vem), c = (lfOn ? cd0 + cdd * lf[k] : cd0) * Math.sqrt(a * a + b * b); t1[k] = c * a; t2[k] = c * b; }
  { const kw = P.kw / (2 * DX), wMin = P.wMin;
    for (let j = 0; j < N; j++) { const om = ((j + N - 1) & 255) * N, op = ((j + 1) & 255) * N, o = j * N; for (let i = 0; i < N; i++) { const im = (i + N - 1) & 255, ip = (i + 1) & 255, k = o + i;
      const zz = z[k], eta = fcor + (zz > 0 ? zz : 0); const wi = zz > 0 ? P.kv * zz / (1 + zz / P.zs) : 0, we = kw * ((t2[o + ip] - t2[o + im]) - (t1[op + i] - t1[om + i])) / (eta > wMin ? eta : wMin) + wi; wb[k] = we > P.wFloor * wi ? we : P.wFloor * wi; } } }
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
  this.t += dt; this.steps++;
};
Nest.prototype.smooth = function (a, tmp, w) {
  for (let j = 0; j < N; j++) { const o = j * N; for (let i = 0; i < N; i++) tmp[o + i] = (1 - w) * a[o + i] + 0.5 * w * (a[o + ((i + 255) & 255)] + a[o + ((i + 1) & 255)]); }
  for (let j = 0; j < N; j++) { const o = j * N, om = ((j + 255) & 255) * N, op = ((j + 1) & 255) * N; for (let i = 0; i < N; i++) a[o + i] = (1 - w) * tmp[o + i] + 0.5 * w * (tmp[om + i] + tmp[op + i]); }
};

/* convection: moisture, condensation, the mass flux that stretches the vorticity, and the radar's rain */
Nest.prototype.convect = function (f, dt, fcor) {
  const P = PAR, z = this.zeta, Q = this.Q, qn = this.qn, cl = this.cl, rc = this.rc, rs = this.rs, Pr = this.P, wb = this.wb, Wc = this.Wc, dv = this.dv, rr = this.rr, lf = this.lf, lfOn = this.lfOn, U = this.U, V = this.V, ct = this.cth, st = this.sth;
  const rmax = Math.max(f.rmax, 5), eta = f.eta || 0, tc = f.etdir || 0, ctc = Math.cos(tc), stc = Math.sin(tc);
  const sh = f.shear, sdc = Math.cos(f.shdir), sds = Math.sin(f.shdir), rfd = f.head - Math.PI / 4, crf = Math.cos(rfd), srf = Math.sin(rfd);
  const trA = clamp(f.spd / 8, 0, 1) * 0.45, vent = clamp(sh / 12, 0, 1.5) * (1 - 0.4 * sm01(f.vmax, 45, 70));
  const Qc = P.Qc, Qs = Qc * (P.Qstar + 0.05 * clamp((f.sst - 27) / 2, -1.5, 1)) * (0.6 + 0.4 * sm01(f.sst, 23, 27.5)), Qe = Qc * clamp(P.Qenv + P.QenvV * sm01(f.vmax, 10, 30) + 0.12 * (f.rh - 0.7), 0.6, 0.95);
  const aEnv = dt / P.tauEnv, pm = P.Pmax * this.g * f.conv, aW = P.aW * clamp(this.g, 0.5, 1.8), aUp = 1 - Math.exp(-dt / P.tauUp), aDn = Math.exp(-dt / P.tauC2), aS = Math.exp(-dt / P.tauS), bS = 1 - aS;
  const wBg = P.wBg * (0.3 + 0.7 * sm01(f.sst, 25.5, 28.5)) * sm01(f.rh, 0.4, 0.8), kr = P.kr[0] + (P.kr[1] - P.kr[0]) * sm01(this.vNest, 22, 50), orgS = sm01(this.vNest, 30, 50), vEff = sm01(f.vmax, P.vOn[0], P.vOn[1]), iH = 1 / P.H, ventR = 150 + 3 * rmax, edgeS = this.edgeS, bdm = this.bd, rb = this.rbin, msk = 1 - P.meanStretch, zc = P.zCap;
  const eyeR = P.eye * this.rmaxN, eyeA = sm01(this.vNest, 24, 42);                                            // the eye: inside the nest's own radius of maximum wind, once the vortex is strong enough to have one
  for (let k = 0; k < NN; k++) {
    const r = rr[k], l = lfOn ? lf[k] : 0, c = ct[k], s = st[k];
    const sp = Math.sqrt(U[k] * U[k] + V[k] * V[k] + P.u0 * P.u0), nz = Math.max(0, 1 + P.sq * qn[k] + P.sc * cl[k] * (1 - (1 - sm01(r, 1.2 * rmax, 3 * rmax)) * orgS)) * edgeS[k];
    const gs = Math.min(1, r / (1.5 * rmax)) * Math.exp(-r / (6 * rmax + 60));
    let q = Q[k];
    // surface evaporation (the sea only; WISHE: it grows with the wind) and the boundary layer's moisture convergence, stronger on the right-front side
    const E = P.kE * sp * Math.max(0, Qs - q) * nz * (1 - 0.92 * l);
    let w = wb[k]; w *= 1 + trA * gs * (c * crf + s * srf);
    let Sq = (Qc / P.Hq) * (w * vEff + wBg * Math.exp(-(r * r) / (170 * 170))) * nz * (1 - 0.4 * l);
    // extratropical transition: lift ahead and to the left of the motion (the warm conveyor belt), a front behind it, a dry slot to the rear
    let dry = 0, strat = 0;
    if (eta > 0.02) {
      const dx = r * c, dy = r * s, along = dx * ctc + dy * stc, across = -dx * stc + dy * ctc;
      const warm = Math.exp(-Math.pow((along - 100) / 130, 2) - Math.pow((across - 50) / 100, 2));
      const dist = Math.abs(across + 0.55 * (-along) - 40), front = along < 30 ? Math.exp(-dist * dist / (2 * 14 * 14)) * sm01(-along, 20, 80) * Math.exp(along / 260) : 0;
      dry = Math.exp(-Math.pow((along + 90) / 110, 2) - Math.pow((across + 110) / 90, 2));
      Sq += eta * (Qc / P.Hq) * (0.06 * warm + 0.55 * front * (0.7 + 0.3 * nz)) * edgeS[k]; strat = eta * warm * P.gsW * edgeS[k] * (0.5 + 0.5 * Math.max(0, 1 + 0.6 * cl[k]));
    }
    // shear ventilates the upshear side (dry air in: the moisture there relaxes toward the environment's), land dries the column
    let relax = aEnv * (1 + 18 * l);
    if (vent > 0 && r < ventR) { const cu = -(c * sdc + s * sds); if (cu > 0) relax += dt * vent * cu * cu / 5400 * sm01(r, 0.5 * rmax, 2 * rmax); }
    if (eta > 0.02) relax += dt * eta * dry * 0.6 / 3600;
    let ey = 0; if (eyeA > 0 && r < eyeR) ey = eyeA * sm01(eyeR - r, 0, 0.35 * eyeR + 2);
    const p0 = q > Qc ? (q - Qc) / P.tauC : 0, p = p0 > 0 ? pm * (1 - Math.exp(-p0 / pm)) * (1 - ey) : 0;
    q = q + dt * (E + Sq - p); q += relax * (Qe - q); if (ey > 0) q += ey * (1 - Math.exp(-dt / 600)) * (0.7 * Qe - q);
    Q[k] = q < 0 ? 0 : q > 2 * Qc ? 2 * Qc : q; Pr[k] = p;
    // the mass flux out of the layer stretches the vorticity; the boundary layer's ascent spins it down
    const W = aW * p; Wc[k] = W; const d = (w - W) * iH; dv[k] = d;
    const zn = z[k] - dt * (fcor + (z[k] < zc ? z[k] : zc)) * (d - msk * bdm[rb[k]]); z[k] = zn > P.zmax ? P.zmax : zn < -P.zmax ? -P.zmax : zn;
    // the radar's rain: convective rain follows the condensation; stratiform rain comes from the decay of convective rain and from broad ascent
    const R = p * 3600 * kr, rcn = rc[k] + (R - rc[k]) * (R > rc[k] ? aUp : 1 - aDn);
    rc[k] = rcn;
    rs[k] = (rs[k] * aS + bS * (P.sigS * (P.tauS / P.tauC2) * rcn + P.gs * Math.min(1, Math.max(0, w * vEff) / 0.4) * (1 - 0.7 * eta * dry) + strat)) * (0.3 + 0.7 * edgeS[k]);
  }
};

/* ---- the engine's storm as the nest's forcing ------------------------------------------------------------------------------------------------------------------------ */
const KT = 0.514444, NMI = 1.852;
function ringInto(vt, rp, Vp, nIn, tail) {                                    // a ring of peak wind Vp (m/s) at radius rp (km) merged into the wind table by the stronger; `tail(r)` is its wind beyond rp
  for (let i = 0; i < NR; i++) { const r = Math.max(i, 0.01), v = r <= rp ? Vp * Math.pow(r / rp, nIn) : tail(r); if (v > vt[i]) vt[i] = v; }
}
/* the forcing of a system S at hour h in the engine's weather env (the nest works in the northern hemisphere's frame: south of the equator y is mirrored, `mirror` says so):
   its mean wind profile (the engine's, with the inner core made hollow for a strong storm: a ring, not solid rotation; two rings during an eyewall replacement), the environment (sea temperature,
   humidity, shear and its direction, the flow of the layers relative to the storm), its motion, and how far an extratropical transition has gone */
function forcingOf(S, par, env, h) {
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
  const eta = S.th === 'ex' ? sm01(h - Math.max(S.etAt, 0), 0, W.ex ? W.ex.T : 60) : S.th === 'nl' ? 0.35 : 0;
  return {
    clat: S.lat, clon: S.lon, lat: Math.abs(S.lat), vmax: Vs, rmax, vt, shear: sh, shdir: Math.atan2(sdy, sdx), uem: (st[2] - cx) * KT, vem: sg * (st[3] - cy) * KT, ued: (st[4] - cx) * KT, ved: sg * (st[5] - cy) * KT,
    head: Math.atan2(sg * cy, cx), spd: Math.hypot(cx, cy) * KT, rh: clamp(S.lastRh / 100, 0.1, 1), sst: S.lastSst, eta, etdir: Math.atan2(sg * cy, cx), conv: S.th === 'nl' ? 0.8 : 1, org: 0, sg,
  };
}
/* the land fraction of every cell of the nest centred on (lat, lon), from the host's land test: row 0 is south (the nest mirrors it itself south of the equator) */
function landGrid(lat0, lon0, isLand, out) {
  const kx = KM_DEG * Math.cos(lat0 * DEG);
  for (let j = 0; j < N; j++) { const lat = lat0 + (j - (N - 1) / 2) * 2 / KM_DEG; for (let i = 0; i < N; i++) out[j * N + i] = isLand(lat, lon0 + (i - (N - 1) / 2) * 2 / kx) ? 1 : 0; }
  const t = new Float32Array(NN);
  for (let pass = 0; pass < 2; pass++) { for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; t[k] = 0.25 * out[j * N + Math.max(0, i - 1)] + 0.5 * out[k] + 0.25 * out[j * N + Math.min(N - 1, i + 1)]; }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; out[k] = 0.25 * t[Math.max(0, j - 1) * N + i] + 0.5 * t[k] + 0.25 * t[Math.min(N - 1, j + 1) * N + i]; } }
  return out;
}

/* the rain `frac` of a step after the last one, for a picture that glides between steps: each tracer is carried back along its own flow for that fraction of the step (nothing of the model changes) */
Nest.prototype.display = function (frac) {
  if (!this.drc) { this.drc = new Float32Array(NN); this.drs = new Float32Array(NN); }
  const rc = this.rc, rs = this.rs, drc = this.drc, drs = this.drs;
  if (!(frac > 0.02) || !this.cur) { drc.set(rc); drs.set(rs); return; }
  const h = frac * this.lastDt / DX, U = this.U, V = this.V, us = this.us, vs = this.vs;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    for (let w = 0; w < 2; w++) {
      const src = w ? rs : rc, dst = w ? drs : drc, x = i - (w ? us[k] : U[k]) * h, y = j - (w ? vs[k] : V[k]) * h, xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi, c0 = xi & 255, c1 = (xi + 1) & 255, d0 = (yi & 255) * N, d1 = ((yi + 1) & 255) * N;
      dst[k] = (src[d0 + c0] * (1 - tx) + src[d0 + c1] * tx) * (1 - ty) + (src[d1 + c0] * (1 - tx) + src[d1 + c1] * tx) * ty;
    }
  }
};

/* ---- the radar's picture --------------------------------------------------------------------------------------------------------------------------------------------------- */
function dbzOf(rc, rs) {                                                       // reflectivity (dBZ) of convective rain rc and stratiform rain rs (mm/h): Z = 250 R^1.2 and 200 R^1.6
  const z = (rc > 0 ? 250 * Math.pow(rc, 1.2) : 0) + (rs > 0 ? 200 * Math.pow(rs, 1.6) : 0);
  return z > 0.1 ? 10 * Math.log10(z) : -20;
}
Nest.prototype.dbz = function (out) { const rc = this.rc, rs = this.rs; for (let k = 0; k < NN; k++) out[k] = dbzOf(rc[k], rs[k]); return out; };

root.HFNest = { N, NC, DX, NR, PAR, create: (o) => new Nest(o), dbzOf, lerpForcing, vorticityOf, forcingOf, landGrid, sm01 };
})(typeof globalThis !== 'undefined' ? globalThis : this);
/* ==== STORM NEST END ==== */
