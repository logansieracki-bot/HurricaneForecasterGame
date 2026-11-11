/* The radar's view of a model storm (Severe): a base-reflectivity operator that scans a 3-D reflectivity volume the way a WSR-88D does, and a renderer that draws the
 * scan as the gates it is made of (Severe, docs/severe-plan.md section 7).
 *
 * The operator (`scan`): for every radial and every gate of one tilt it
 *   - finds where the beam is (the 4/3-earth model: a 0.5 degree beam is about 1.5 km above the ground at 100 km and 4 km at 200 km),
 *   - weights the volume across the beam with a Gaussian pattern (0.9 degrees wide at half power) in power, below ground counting as no echo (partial beam filling),
 *   - adds what a radar sees that is not the storm: a noise floor that rises with range as 20 log10 r (and by the correction for the air's attenuation, 0.019 dB per km, so that
 *     the weakest echo a WSR-88D reports is -8 dBZ at 50 km, +9 at 250 km and +17 at 430 km, as 14 real volumes show) and the receiver's threshold for a gate to be reported,
 *     ground clutter near the radar and the clear-air return of insects and birds in the boundary layer (a continuous return, +2 dBZ with a spread of 5 dB, that fades with range as the
 *     beam climbs out of the layer and the floor rises: the 99 % of the gates that report within 45 km of a real radar, a third at 90 km),
 *   - and puts the speckle of a random scatterer population on top: the power of N independent samples of an exponentially distributed power has a spread of
 *     4.34 sqrt(psi'(N)) dB (5.6 dB for one sample, 2.3 for four), from random numbers seeded by (frame, radial, gate) so that a frame always looks the same,
 *   - and quantises to 0.5 dBZ as the Level II data are.
 * The volume is the model's reflectivity in dBZ on its own grid (-30 or less: no echo); the picture is made of the model's storm, nothing is painted on it.
 *
 * Velocity (`velocity` option): the Doppler velocity of a gate is the mean radial velocity of what scatters, weighted by its power (the Z of each point of the beam, not its dBZ). The radial velocity of
 * a point is its wind projected on the beam, u sin(az) cos(e) + v cos(az) cos(e), plus its vertical motion times sin(e): the air's vertical wind w and, for precipitation, minus its reflectivity-weighted
 * fall speed (what the Doppler radar sees at a high tilt, where a rain shaft shows as motion towards the radar). Positive is away from the radar. The volume brings u, v, w and vz in the ground's frame;
 * outside the box the clear air follows the base-state wind (`base` of the volume: a VAD pattern around the radar), clutter stands still, isolated targets move. The spectrum width is the spread of the
 * velocities in the beam (the shear across it, corrected from the nine and three points of the quadrature to the full Gaussian) with what the model does not resolve: turbulence, the spread of fall
 * speeds and the motion of the antenna. The measurement is the pulse-pair estimate of M pulses: its error depends on the signal-to-noise ratio and the spectrum width (Zrnic 1977), with a small
 * white fluctuation of the winds in the gate; both are set from the Doppler cut of 14 real volumes. Velocity is folded at the Nyquist velocity (the radar cannot tell 30 m/s from -24 at 27 m/s) unless
 * `dealias` is set; the data are in 0.5 m/s steps; a gate has a velocity only where the signal is a little stronger than reflectivity needs (about 1.5 dB).
 *
 * The renderer (`render`): every pixel of the picture asks which gate it is in (range and azimuth from the radar) and takes that gate's colour from the palette's look-up
 * table: gates are blocks 250 m deep and 0.5 degrees wide, never smoothed or interpolated; zooming makes the blocks bigger. Colours come from src/severe-palette.js.
 */
(function () {
  const RE = 6371000 * 4 / 3, DEG = Math.PI / 180, BEAMW = 0.9, SIGMA = BEAMW / (2 * Math.sqrt(2 * Math.LN2)) * DEG;   // effective earth radius; the beam's sigma in radians

  /* ---- geometry ---- */
  function beamHeight(r, elevDeg, antenna) {                // metres above the ground under the radar at slant range r (m) and elevation (degrees)
    const e = elevDeg * DEG;
    return Math.sqrt(r * r + RE * RE + 2 * r * RE * Math.sin(e)) - RE + (antenna || 0);
  }
  function groundRange(r, elevDeg, antenna) {               // metres along the ground
    const e = elevDeg * DEG, h = beamHeight(r, elevDeg, 0);
    return RE * Math.asin(r * Math.cos(e) / (RE + h));
  }

  /* ---- the random numbers: a hash of (seed, a, b, c) to [0, 1) ---- */
  function hash(seed, a, b, c) {
    let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(a + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(b + 0x165667b1, 0x27d4eb2f) ^ Math.imul(c + 0x1b873593, 0x9e3779b1);
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function gammaUnit(seed, a, b, n) {                       // the power of n independent samples of an exponential power, mean 1: Gamma(n, 1/n)
    let s = 0; for (let k = 0; k < n; k++) s -= Math.log(1 - hash(seed, a, b, 1000 + k));
    return s / n;
  }
  function vnoise(seed, x, y) {                             // smooth noise in [0, 1) of a lattice of unit spacing
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(seed, i, j, 7), b = hash(seed, i + 1, j, 7), c = hash(seed, i, j + 1, 7), d = hash(seed, i + 1, j + 1, 7);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  /* ---- the volume: sampling it (trilinear in dBZ, so that echo edges are smooth; no echo outside it) ---- */
  function volumeSampler(vol) {
    const { nx, ny, nz, dx, dy, dz, dbz } = vol, floor = vol.floor !== undefined ? vol.floor : -30, nxy = nx * ny;
    return function (x, y, z) {                             // dBZ at (x, y, z) metres from the volume's south-west corner and the ground
      const fx = x / dx - 0.5, fy = y / dy - 0.5, fz = z / dz - 0.5;
      if (fx < -0.5 || fy < -0.5 || fx > nx - 0.5 || fy > ny - 0.5 || z < 0 || fz > nz - 0.5) return floor;
      let i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz);
      let tx = fx - i, ty = fy - j, tz = fz - k;
      if (i < 0) { i = 0; tx = 0; } else if (i >= nx - 1) { i = nx - 2; tx = 1; }
      if (j < 0) { j = 0; ty = 0; } else if (j >= ny - 1) { j = ny - 2; ty = 1; }
      if (k < 0) { k = 0; tz = 0; } else if (k >= nz - 1) { k = nz - 2; tz = 1; }
      const o = k * nxy + j * nx + i;
      const c000 = dbz[o], c100 = dbz[o + 1], c010 = dbz[o + nx], c110 = dbz[o + nx + 1], c001 = dbz[o + nxy], c101 = dbz[o + nxy + 1], c011 = dbz[o + nxy + nx], c111 = dbz[o + nxy + nx + 1];
      const x0 = c000 + (c100 - c000) * tx, x1 = c010 + (c110 - c010) * tx, x2 = c001 + (c101 - c001) * tx, x3 = c011 + (c111 - c011) * tx;
      const y0 = x0 + (x1 - x0) * ty, y1 = x2 + (x3 - x2) * ty;
      return y0 + (y1 - y0) * tz;
    };
  }

  /* ---- the winds of the volume: u, v, w and the fall speed vz of its precipitation, m/s in the ground's frame, on the same grid (trilinear; false outside it) ---- */
  function windSampler(vol) {
    const { nx, ny, nz, dx, dy, dz } = vol, nxy = nx * ny, U = vol.u, V = vol.v, W = vol.w, VZ = vol.vz;
    const tri = (a, o, tx, ty, tz) => {
      const x0 = a[o] + (a[o + 1] - a[o]) * tx, x1 = a[o + nx] + (a[o + nx + 1] - a[o + nx]) * tx, x2 = a[o + nxy] + (a[o + nxy + 1] - a[o + nxy]) * tx, x3 = a[o + nxy + nx] + (a[o + nxy + nx + 1] - a[o + nxy + nx]) * tx;
      const y0 = x0 + (x1 - x0) * ty, y1 = x2 + (x3 - x2) * ty;
      return y0 + (y1 - y0) * tz;
    };
    return function (x, y, z, out) {                        // fills out[0..3] with u, v, w, vz at (x, y, z) metres from the south-west corner and the ground
      const fx = x / dx - 0.5, fy = y / dy - 0.5, fz = z / dz - 0.5;
      if (fx < -0.5 || fy < -0.5 || fx > nx - 0.5 || fy > ny - 0.5 || z < 0 || fz > nz - 0.5) return false;
      let i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz), tx = fx - i, ty = fy - j, tz = fz - k;
      if (i < 0) { i = 0; tx = 0; } else if (i >= nx - 1) { i = nx - 2; tx = 1; }
      if (j < 0) { j = 0; ty = 0; } else if (j >= ny - 1) { j = ny - 2; ty = 1; }
      if (k < 0) { k = 0; tz = 0; } else if (k >= nz - 1) { k = nz - 2; tz = 1; }
      const o = k * nxy + j * nx + i;
      out[0] = tri(U, o, tx, ty, tz); out[1] = tri(V, o, tx, ty, tz); out[2] = tri(W, o, tx, ty, tz); out[3] = VZ ? tri(VZ, o, tx, ty, tz) : 0;
      return true;
    };
  }
  function envWind(e) {                                     // the wind outside the box: (z, out) -> out[0..1] = u, v. e: a function, { z, u, v } arrays (linear between the levels), { u, v } (uniform) or nothing (calm)
    if (typeof e === 'function') return e;
    if (e && e.z && e.u && e.v) {
      const zs = e.z, n = zs.length;
      return (z, out) => {
        if (z <= zs[0]) { out[0] = e.u[0]; out[1] = e.v[0]; return; }
        if (z >= zs[n - 1]) { out[0] = e.u[n - 1]; out[1] = e.v[n - 1]; return; }
        let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (zs[m] <= z) lo = m; else hi = m; }
        const t = (z - zs[lo]) / (zs[hi] - zs[lo]); out[0] = e.u[lo] + (e.u[hi] - e.u[lo]) * t; out[1] = e.v[lo] + (e.v[hi] - e.v[lo]) * t;
      };
    }
    if (e && typeof e.u === 'number') return (z, out) => { out[0] = e.u; out[1] = e.v || 0; };
    return (z, out) => { out[0] = 0; out[1] = 0; };
  }
  function gauss(seed, a, b, k) {                           // a standard normal number from the hash (Box-Muller)
    return Math.sqrt(-2 * Math.log(1 - hash(seed, a, b, 2000 + 2 * k))) * Math.cos(2 * Math.PI * hash(seed, a, b, 2001 + 2 * k));
  }

  const CLEAR = { mean: 2, fall: 1.5, top: 1300, soft: 200, std: [3.2, 1.6], scale: [9000, 2800] }, CLUTTER = { low: -10, span: 30, prob: 0.3, scale: 12 };  // clear air: the mean dBZ at the antenna, its fall per km of beam height, the layer's top and the softness of its edge (m), the spread (dB) and the size (m) of its two scales of patches; clutter: dBZ of the weakest and the spread, the share of gates at the radar, its range scale (km)
  const NODES = [];                                                                                      // nine points up the beam from -2 to +2 sigmas (0.5 apart) with Gaussian weights
  for (let t = -2; t <= 2.0001; t += 0.5) NODES.push([t, Math.exp(-0.5 * t * t)]);
  let SW0 = 0, SW2 = 0; for (const nd of NODES) { SW0 += nd[1]; SW2 += nd[1] * nd[0] * nd[0]; }
  const VERT_VAR = SW2 / SW0, LAT_VAR = 2 * 0.6065 / (1 + 2 * 0.6065);                                  // the variance, in beam sigmas squared, of the nine points up the beam (0.857) and the three across it (0.548) against the Gaussian's 1
  const VEL = { nyquist: 28, dealias: false, quant: 0.5, pulses: 40, snrLoss: 4.5, thr: 4, noise: 1, fine: { storm: 0.7, clear: 0.8, clutter: 0.3 }, width: { storm: 0.6, clear: 2, clutter: 0.8 }, shear: 0.0029, swBias: 1.25, swNoise: 1.1 };   // see scan

  /* ---- one tilt ----
     o: { x, y: the radar's place in the volume's frame (m); antenna: its height above the ground (m, 30); elev: degrees (0.5); dAz: radial spacing in degrees (0.5);
          gate: gate length (m, 250); r0: range of the first gate's centre (m, 2125); nGates (920: 230 km); seed (1); n: independent samples of the speckle (2);
          noise: { z1: the noise floor in dBZ at 1 km (-41.8), atten: the air's attenuation corrected for, dB per km (0.019), thr: the threshold in dB over the noise for a gate to be reported (2.5),
                   n: samples of the noise (16), sparse: the share of gates with an isolated weak target (0.0008) };
          clutter: { ground: 0..1 (strength, 1), clearAir: 0..1 (1) }; clear: { mean: the clear air's dBZ at the antenna (2; real radars range from -5 on a dull day to +5 on a day of insects), top: the boundary layer's top (m, 1300, with a soft edge of 200) };
          quant: dBZ step of the data (0.5); beamBlock: off;
          velocity: false, or { nyquist: the Nyquist velocity in m/s (28; real sites run from 26 to 36), dealias: the true velocity, not folded into +-Nyquist (false), quant: step of the data (0.5),
                   pulses: M of the pulse-pair estimate (40), snrLoss: what the real estimator loses against the ideal one, in dB of signal (4.5), thr: the signal over the noise, in dB, a gate needs for a velocity
                   (4: 1.5 dB over what reflectivity needs), noise: 0..1 scale of the measurement error (1), fine: { storm, clear, clutter }: the white fluctuation of the wind in the gate, m/s (0.7, 0.8, 0.3),
                   width: { storm, clear, clutter }: the spectrum width the model does not resolve, m/s (0.6, 2, 0.8), shear: the shear in the storm's gates that the model does not resolve, 1/s (0.0029: its spread in the beam
                   grows with the beam's width, so rain reads 0.5 m/s wide at 10 km and 2.4 at 120 km) }; the fitted values come from the Doppler cut of 14 real volumes (research part 5);
          env: the wind outside the volume's box (a function (z, out), { z, u, v } arrays or { u, v }); the volume's own `base` is used when there is none.
          (A volume with no u, v and w has no wind of its own: its echo reads 0 m/s, the clear air and the clutter still read as above.)
     Returns { dbz: Float32Array(nRad * nGates), NaN for a gate with no data, nRad, nGates, dAz, gate, r0, elev, antenna, x, y } and, with velocity, vel and sw (Float32Arrays, m/s, NaN for none) and nyquist. */
  function scan(vol, o) {
    o = o || {};
    const elev = o.elev !== undefined ? o.elev : 0.5, dAz = o.dAz || 0.5, gate = o.gate || 250, r0 = o.r0 !== undefined ? o.r0 : 2125, nG = o.nGates || 920, antenna = o.antenna !== undefined ? o.antenna : 30;
    const seed = (o.seed === undefined ? 1 : o.seed) | 0, nS = Math.max(1, o.n || 2), nRad = Math.round(360 / dAz), quant = o.quant === undefined ? 0.5 : o.quant;
    const noise = Object.assign({ z1: -41.8, atten: 0.019, thr: 2.5, n: 16, sparse: 0.0008 }, o.noise), cl = Object.assign({ ground: 1, clearAir: 1 }, o.clutter), cla = Object.assign({}, CLEAR, o.clear);
    const sample = vol ? volumeSampler(vol) : null, rx = o.x || 0, ry = o.y || 0, floor = vol && vol.floor !== undefined ? vol.floor : -30;
    const out = new Float32Array(nRad * nG), snrThr = Math.pow(10, 0.1 * noise.thr) - 1, nN = Math.max(1, noise.n | 0);
    const sinE = Math.sin(elev * DEG), cosE = Math.cos(elev * DEG);
    const vel = o.velocity ? Object.assign({}, VEL, o.velocity === true ? {} : o.velocity) : null;
    if (vel) { vel.fine = Object.assign({}, VEL.fine, vel.fine); vel.width = Object.assign({}, VEL.width, vel.width); }
    const velOut = vel ? new Float32Array(nRad * nG).fill(NaN) : null, swOut = vel ? new Float32Array(nRad * nG).fill(NaN) : null, wsamp = vel && vol && vol.u && vol.v && vol.w ? windSampler(vol) : null;
    const wenv = vel ? envWind(o.env || (vol && vol.base)) : null, wv = [0, 0, 0, 0], we = [0, 0], thrV = vel ? Math.pow(10, 0.1 * vel.thr) : 0;
    // the volume's footprint seen from the radar, to spare the sampling of gates far from it
    const lx = vol ? vol.nx * vol.dx : 0, ly = vol ? vol.ny * vol.dy : 0;
    for (let a = 0; a < nRad; a++) {
      const az = (a + 0.5) * dAz * DEG, sa = Math.sin(az), ca = Math.cos(az), ue = cosE * sa, ve = cosE * ca;               // the radial velocity of a wind (u, v, w) is u ue + v ve + w sin(e)
      for (let g = 0; g < nG; g++) {
        const r = r0 + g * gate, km = r / 1000;
        const h = Math.sqrt(r * r + RE * RE + 2 * r * RE * sinE) - RE + antenna, s = groundRange(r, elev, antenna);
        // the noise power in the units of Z (mm6/m3): rises as r squared, and with the correction for the air's attenuation that the radar applies to what it measures
        const zn = Math.pow(10, 0.1 * (noise.z1 + 20 * Math.log10(km) + noise.atten * km));
        let zs = 0;                                                                                   // the signal, linear
        let zst = 0, vst = 0, qst = 0, zcl = 0, vcl = 0, zgr = 0, ztg = 0, vtg = 0;                   // with velocity: the storm's part of it, its mean radial velocity and its variance in the beam; the clear air's, the clutter's, a target's
        const px = rx + s * sa, py = ry + s * ca;                                                     // where the gate is in the volume's frame
        // -- the storm
        if (sample && px > -3 * SIGMA * r && px < lx + 3 * SIGMA * r && py > -3 * SIGMA * r && py < ly + 3 * SIGMA * r) {
          const sv = SIGMA * r;                                                                       // the beam's width in metres, across and up
          let acc = 0, wsum = 0, zA0 = 0, zA1 = 0, zA2 = 0, vA0 = 0, vA1 = 0, vA2 = 0, wA0 = 0, wA1 = 0, wA2 = 0;   // (velocity: per position across the beam, the sums of Z, Z v and Z v^2)
          for (let ia = -1; ia <= 1; ia++) {
            const wa = ia === 0 ? 1 : 0.6065, qx = px + ia * sv * ca, qy = py - ia * sv * sa;       // across the beam (perpendicular to the ray)
            for (let iv = 0; iv < NODES.length; iv++) {
              const z = h + NODES[iv][0] * sv * cosE, w = wa * NODES[iv][1];
              wsum += w;
              const d = sample(qx, qy, z);                                                            // (under the ground the sampler finds no echo: partial beam filling)
              if (d > floor + 0.5) {
                const wz = w * Math.pow(10, 0.1 * d);
                acc += wz;
                if (vel) {
                  let vr = 0;                                                                         // the node's radial velocity: its wind on the beam, and its vertical motion minus the fall of its rain
                  if (wsamp && wsamp(qx, qy, z, wv)) vr = wv[0] * ue + wv[1] * ve + (wv[2] - wv[3]) * sinE;
                  if (vr - vr === 0) {
                    if (ia < 0) { zA0 += wz; vA0 += wz * vr; wA0 += wz * vr * vr; } else if (ia === 0) { zA1 += wz; vA1 += wz * vr; wA1 += wz * vr * vr; } else { zA2 += wz; vA2 += wz * vr; wA2 += wz * vr * vr; }
                  }
                }
              }
            }
          }
          zs += acc / wsum;
          if (vel) {
            const ZW = zA0 + zA1 + zA2;
            if (ZW > 0) {
              vst = (vA0 + vA1 + vA2) / ZW; zst = acc / wsum;
              let vv = 0, vl = 0;                                                                     // the spread of the radial velocity in the beam: along the beam's height and across it, each corrected to the full Gaussian
              if (zA0 > 0) { const m = vA0 / zA0; vv += Math.max(0, wA0 - zA0 * m * m); vl += zA0 * (m - vst) * (m - vst); }
              if (zA1 > 0) { const m = vA1 / zA1; vv += Math.max(0, wA1 - zA1 * m * m); vl += zA1 * (m - vst) * (m - vst); }
              if (zA2 > 0) { const m = vA2 / zA2; vv += Math.max(0, wA2 - zA2 * m * m); vl += zA2 * (m - vst) * (m - vst); }
              qst = (vv / VERT_VAR + vl / LAT_VAR) / ZW;
            }
          }
        }
        // -- what is not the storm: clear air in the lowest kilometres, ground clutter near the radar, and the odd weak target (a radar sees them, a storm model does not make them)
        if (cl.clearAir > 0) {                                                                        // insects and birds: they stay in the boundary layer, so the return ends where the beam leaves it
          const inLayer = 1 / (1 + Math.exp((h - cla.top) / cla.soft));
          if (inLayer > 0.01) {                                                                       // a continuous return: patches of two sizes (a lattice noise has a spread of about 0.21)
            const patch = (vnoise(seed + 11, px / cla.scale[0], py / cla.scale[0]) - 0.5) * cla.std[0] / 0.21 + (vnoise(seed + 12, px / cla.scale[1], py / cla.scale[1]) - 0.5) * cla.std[1] / 0.21;
            zcl = cl.clearAir * inLayer * Math.pow(10, 0.1 * (cla.mean - cla.fall * Math.max(h - antenna, 0) / 1000 + patch));
            zs += zcl;
            if (vel) {                                                                                // insects and birds drift with the air: the model's wind inside its box, the base state's outside
              if (wsamp && wsamp(px, py, h, wv)) vcl = wv[0] * ue + wv[1] * ve; else { wenv(h, we); vcl = we[0] * ue + we[1] * ve; }
            }
          }
        }
        if (cl.ground > 0 && km < 50) {                                                               // fixed targets, filtered but not gone: a share of the gates, in patches, fewer with range
          const fx = px / 2500, fy = py / 2500, share = CLUTTER.prob * Math.exp(-km / CLUTTER.scale) * (0.4 + 1.2 * vnoise(seed + 23, fx, fy));
          if (hash(seed + 31, a, g, 5) < share) { zgr = cl.ground * Math.pow(10, 0.1 * (CLUTTER.low + CLUTTER.span * Math.pow(hash(seed + 37, a, g, 6), 1.6))); zs += zgr; }
        }
        if (noise.sparse > 0 && hash(seed + 41, a, g, 9) < noise.sparse) { ztg = zn * Math.pow(10, 0.1 * (6 + 8 * hash(seed + 43, a, g, 10))); zs += ztg; vtg = 24 * (hash(seed + 47, a, g, 11) - 0.5); }   // an isolated weak target, 6 to 14 dB over the noise, moving at up to 12 m/s
        // -- measurement: the speckle of the signal, the fluctuation of the noise, the receiver subtracting the mean noise and reporting a gate only above its threshold
        const sig = zs * gammaUnit(seed, a, g, nS), pw = sig + zn * gammaUnit(seed ^ 0x5bd1e995, a, g, nN), net = pw - zn;
        if (!(sig > 0) || !(net >= snrThr * zn)) { out[a * nG + g] = NaN; continue; }
        let d = 10 * Math.log10(net);
        if (quant > 0) d = Math.round(d / quant) * quant;
        out[a * nG + g] = d;
        if (vel) {
          const at = a * nG + g;
          if (!(pw >= thrV * zn)) { velOut[at] = NaN; swOut[at] = NaN; continue; }
          // what the beam holds: the power-weighted mean radial velocity of its parts (the clutter stands still), its spread, and the broadening that the model does not resolve
          const zv = zst + zcl + ztg + zgr;                                                           // (the parts that have a velocity: all of the signal unless the winds of the volume are not numbers)
          const vb = (zst * vst + zcl * vcl + ztg * vtg) / zv;
          const between = (zst * (qst + (vst - vb) * (vst - vb)) + zcl * (vcl - vb) * (vcl - vb) + ztg * (vtg - vb) * (vtg - vb) + zgr * vb * vb) / zv;
          const sbeam = vel.shear * SIGMA * r, w2 = (zst * (vel.width.storm * vel.width.storm + sbeam * sbeam) + (zcl + ztg) * vel.width.clear * vel.width.clear + zgr * vel.width.clutter * vel.width.clutter) / zv, sw = Math.sqrt(between + w2);
          const f2 = (zst * vel.fine.storm * vel.fine.storm + (zcl + ztg) * vel.fine.clear * vel.fine.clear + zgr * vel.fine.clutter * vel.fine.clutter) / zv;
          // the pulse-pair estimate of M pulses (Zrnic 1977): its error grows as the signal gets weak and as the spectrum widens
          const snr = sig / zn, snrE = snr / Math.pow(10, 0.1 * vel.snrLoss), nyq = vel.nyquist, rho = Math.exp(-Math.PI * Math.PI * sw * sw / (2 * nyq * nyq));
          const sd = Math.min(nyq, nyq / Math.PI * Math.sqrt(Math.max(0, (Math.pow(1 + 1 / snrE, 2) - rho * rho) / (2 * vel.pulses * rho * rho))));
          let v = vb + vel.noise * Math.sqrt(sd * sd + f2) * gauss(seed ^ 0x2545f491, a, g, 0);
          if (!vel.dealias) { v += nyq; v -= 2 * nyq * Math.floor(v / (2 * nyq)); v -= nyq; }
          if (vel.quant > 0) v = Math.round(v / vel.quant) * vel.quant;
          const lo = 1 / snr, swm = sw * (1 + vel.swBias * lo) + vel.noise * vel.swNoise * Math.sqrt(1 + 4 * lo) * gauss(seed ^ 0x2545f491, a, g, 1);
          velOut[at] = v; swOut[at] = Math.max(0, vel.quant > 0 ? Math.round(Math.min(20, swm) / vel.quant) * vel.quant : Math.min(20, swm));
        }
      }
    }
    const res = { dbz: out, nRad, nGates: nG, dAz, gate, r0, elev, antenna, x: rx, y: ry };
    if (vel) { res.vel = velOut; res.sw = swOut; res.nyquist = vel.nyquist; }
    return res;
  }

  /* ---- the picture ----
     view: { w, h: pixels; cx, cy: the point (m east and north of the radar) at the centre of the picture; mpp: metres per pixel; bg: [r, g, b, a]; field: 'dbz' (the default), 'vel' or 'sw';
             scale: what the field is multiplied by before the table (1; 2.23694 draws a velocity in m/s with a table in miles per hour: HFSeverePalette.unitScale) }
     lut: from HFSeverePalette.lut. Returns Uint8ClampedArray(w * h * 4). */
  function render(sweep, lut, view) {
    const w = view.w, h = view.h, img = new Uint8ClampedArray(w * h * 4), bg = view.bg || [11, 13, 26, 255], mpp = view.mpp;
    const { nRad, nGates, dAz, gate, r0 } = sweep, dbz = sweep[view.field || 'dbz'], cosE = Math.cos(sweep.elev * DEG), rIn = r0 - gate / 2, rOut = rIn + nGates * gate, inv = 1 / dAz, rgba = lut.rgba, sc = view.scale || 1;   // (the field: dbz, vel or sw)
    for (let py = 0; py < h; py++) {
      const y = view.cy - (py + 0.5 - h / 2) * mpp;
      for (let px = 0; px < w; px++) {
        const x = view.cx + (px + 0.5 - w / 2) * mpp, o = (py * w + px) * 4, r = Math.sqrt(x * x + y * y) / cosE;
        let c0 = bg[0], c1 = bg[1], c2 = bg[2], c3 = bg[3];
        if (r >= rIn && r < rOut) {
          let az = Math.atan2(x, y) / DEG; if (az < 0) az += 360;
          const a = Math.min(nRad - 1, Math.floor(az * inv)), g = Math.floor((r - rIn) / gate), v = dbz[a * nGates + g] * sc;
          if (v === v) {
            const i = 4 * lut.index(v), al = rgba[i + 3] / 255;
            if (al > 0) { c0 = bg[0] + (rgba[i] - bg[0]) * al; c1 = bg[1] + (rgba[i + 1] - bg[1]) * al; c2 = bg[2] + (rgba[i + 2] - bg[2]) * al; c3 = 255; }
          }
        }
        img[o] = c0; img[o + 1] = c1; img[o + 2] = c2; img[o + 3] = c3;
      }
    }
    return img;
  }

  globalThis.HFSevereRadar = { scan, render, beamHeight, groundRange, hash, gammaUnit, volumeSampler, windSampler, RE };
})();
