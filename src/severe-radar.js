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

  const CLEAR = { mean: 2, fall: 1.5, top: 1300, soft: 200, std: [3.2, 1.6], scale: [9000, 2800] }, CLUTTER = { low: -10, span: 30, prob: 0.3, scale: 12 };  // clear air: the mean dBZ at the antenna, its fall per km of beam height, the layer's top and the softness of its edge (m), the spread (dB) and the size (m) of its two scales of patches; clutter: dBZ of the weakest and the spread, the share of gates at the radar, its range scale (km)
  const NODES = [];                                                                                      // nine points up the beam from -2 to +2 sigmas (0.5 apart) with Gaussian weights
  for (let t = -2; t <= 2.0001; t += 0.5) NODES.push([t, Math.exp(-0.5 * t * t)]);

  /* ---- one tilt ----
     o: { x, y: the radar's place in the volume's frame (m); antenna: its height above the ground (m, 30); elev: degrees (0.5); dAz: radial spacing in degrees (0.5);
          gate: gate length (m, 250); r0: range of the first gate's centre (m, 2125); nGates (920: 230 km); seed (1); n: independent samples of the speckle (2);
          noise: { z1: the noise floor in dBZ at 1 km (-41.8), atten: the air's attenuation corrected for, dB per km (0.019), thr: the threshold in dB over the noise for a gate to be reported (2.5),
                   n: samples of the noise (16), sparse: the share of gates with an isolated weak target (0.0008) };
          clutter: { ground: 0..1 (strength, 1), clearAir: 0..1 (1) }; clear: { mean: the clear air's dBZ at the antenna (2; real radars range from -5 on a dull day to +5 on a day of insects), top: the boundary layer's top (m, 1300, with a soft edge of 200) };
          quant: dBZ step of the data (0.5); beamBlock: off }
     Returns { dbz: Float32Array(nRad * nGates), NaN for a gate with no data, nRad, nGates, dAz, gate, r0, elev, antenna, x, y }. */
  function scan(vol, o) {
    o = o || {};
    const elev = o.elev !== undefined ? o.elev : 0.5, dAz = o.dAz || 0.5, gate = o.gate || 250, r0 = o.r0 !== undefined ? o.r0 : 2125, nG = o.nGates || 920, antenna = o.antenna !== undefined ? o.antenna : 30;
    const seed = (o.seed === undefined ? 1 : o.seed) | 0, nS = Math.max(1, o.n || 2), nRad = Math.round(360 / dAz), quant = o.quant === undefined ? 0.5 : o.quant;
    const noise = Object.assign({ z1: -41.8, atten: 0.019, thr: 2.5, n: 16, sparse: 0.0008 }, o.noise), cl = Object.assign({ ground: 1, clearAir: 1 }, o.clutter), cla = Object.assign({}, CLEAR, o.clear);
    const sample = vol ? volumeSampler(vol) : null, rx = o.x || 0, ry = o.y || 0, floor = vol && vol.floor !== undefined ? vol.floor : -30;
    const out = new Float32Array(nRad * nG), snrThr = Math.pow(10, 0.1 * noise.thr) - 1, nN = Math.max(1, noise.n | 0);
    const sinE = Math.sin(elev * DEG), cosE = Math.cos(elev * DEG);
    // the volume's footprint seen from the radar, to spare the sampling of gates far from it
    const lx = vol ? vol.nx * vol.dx : 0, ly = vol ? vol.ny * vol.dy : 0;
    for (let a = 0; a < nRad; a++) {
      const az = (a + 0.5) * dAz * DEG, sa = Math.sin(az), ca = Math.cos(az);
      for (let g = 0; g < nG; g++) {
        const r = r0 + g * gate, km = r / 1000;
        const h = Math.sqrt(r * r + RE * RE + 2 * r * RE * sinE) - RE + antenna, s = groundRange(r, elev, antenna);
        // the noise power in the units of Z (mm6/m3): rises as r squared, and with the correction for the air's attenuation that the radar applies to what it measures
        const zn = Math.pow(10, 0.1 * (noise.z1 + 20 * Math.log10(km) + noise.atten * km));
        let zs = 0;                                                                                   // the signal, linear
        const px = rx + s * sa, py = ry + s * ca;                                                     // where the gate is in the volume's frame
        // -- the storm
        if (sample && px > -3 * SIGMA * r && px < lx + 3 * SIGMA * r && py > -3 * SIGMA * r && py < ly + 3 * SIGMA * r) {
          const sv = SIGMA * r;                                                                       // the beam's width in metres, across and up
          let acc = 0, wsum = 0;
          for (let ia = -1; ia <= 1; ia++) {
            const wa = ia === 0 ? 1 : 0.6065, qx = px + ia * sv * ca, qy = py - ia * sv * sa;       // across the beam (perpendicular to the ray)
            for (let iv = 0; iv < NODES.length; iv++) {
              const z = h + NODES[iv][0] * sv * cosE, w = wa * NODES[iv][1];
              wsum += w;
              const d = sample(qx, qy, z);                                                            // (under the ground the sampler finds no echo: partial beam filling)
              if (d > floor + 0.5) acc += w * Math.pow(10, 0.1 * d);
            }
          }
          zs += acc / wsum;
        }
        // -- what is not the storm: clear air in the lowest kilometres, ground clutter near the radar, and the odd weak target (a radar sees them, a storm model does not make them)
        if (cl.clearAir > 0) {                                                                        // insects and birds: they stay in the boundary layer, so the return ends where the beam leaves it
          const inLayer = 1 / (1 + Math.exp((h - cla.top) / cla.soft));
          if (inLayer > 0.01) {                                                                       // a continuous return: patches of two sizes (a lattice noise has a spread of about 0.21)
            const patch = (vnoise(seed + 11, px / cla.scale[0], py / cla.scale[0]) - 0.5) * cla.std[0] / 0.21 + (vnoise(seed + 12, px / cla.scale[1], py / cla.scale[1]) - 0.5) * cla.std[1] / 0.21;
            zs += cl.clearAir * inLayer * Math.pow(10, 0.1 * (cla.mean - cla.fall * Math.max(h - antenna, 0) / 1000 + patch));
          }
        }
        if (cl.ground > 0 && km < 50) {                                                               // fixed targets, filtered but not gone: a share of the gates, in patches, fewer with range
          const fx = px / 2500, fy = py / 2500, share = CLUTTER.prob * Math.exp(-km / CLUTTER.scale) * (0.4 + 1.2 * vnoise(seed + 23, fx, fy));
          if (hash(seed + 31, a, g, 5) < share) zs += cl.ground * Math.pow(10, 0.1 * (CLUTTER.low + CLUTTER.span * Math.pow(hash(seed + 37, a, g, 6), 1.6)));
        }
        if (noise.sparse > 0 && hash(seed + 41, a, g, 9) < noise.sparse) zs += zn * Math.pow(10, 0.1 * (6 + 8 * hash(seed + 43, a, g, 10)));   // an isolated weak target, 6 to 14 dB over the noise
        // -- measurement: the speckle of the signal, the fluctuation of the noise, the receiver subtracting the mean noise and reporting a gate only above its threshold
        const sig = zs * gammaUnit(seed, a, g, nS), pw = sig + zn * gammaUnit(seed ^ 0x5bd1e995, a, g, nN), net = pw - zn;
        if (!(sig > 0) || !(net >= snrThr * zn)) { out[a * nG + g] = NaN; continue; }
        let d = 10 * Math.log10(net);
        if (quant > 0) d = Math.round(d / quant) * quant;
        out[a * nG + g] = d;
      }
    }
    return { dbz: out, nRad, nGates: nG, dAz, gate, r0, elev, antenna, x: rx, y: ry };
  }

  /* ---- the picture ----
     view: { w, h: pixels; cx, cy: the point (m east and north of the radar) at the centre of the picture; mpp: metres per pixel; bg: [r, g, b, a] }
     lut: from HFSeverePalette.lut. Returns Uint8ClampedArray(w * h * 4). */
  function render(sweep, lut, view) {
    const w = view.w, h = view.h, img = new Uint8ClampedArray(w * h * 4), bg = view.bg || [11, 13, 26, 255], mpp = view.mpp;
    const { dbz, nRad, nGates, dAz, gate, r0 } = sweep, cosE = Math.cos(sweep.elev * DEG), rIn = r0 - gate / 2, rOut = rIn + nGates * gate, inv = 1 / dAz, rgba = lut.rgba;
    for (let py = 0; py < h; py++) {
      const y = view.cy - (py + 0.5 - h / 2) * mpp;
      for (let px = 0; px < w; px++) {
        const x = view.cx + (px + 0.5 - w / 2) * mpp, o = (py * w + px) * 4, r = Math.sqrt(x * x + y * y) / cosE;
        let c0 = bg[0], c1 = bg[1], c2 = bg[2], c3 = bg[3];
        if (r >= rIn && r < rOut) {
          let az = Math.atan2(x, y) / DEG; if (az < 0) az += 360;
          const a = Math.min(nRad - 1, Math.floor(az * inv)), g = Math.floor((r - rIn) / gate), v = dbz[a * nGates + g];
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

  globalThis.HFSevereRadar = { scan, render, beamHeight, groundRange, hash, gammaUnit, volumeSampler, RE };
})();
