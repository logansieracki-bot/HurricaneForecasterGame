// Node-only tests of the radar's view of a model storm (Severe): the colour table reader and its interpolation (src/severe-palette.js), the base-reflectivity operator and the gate renderer
// (src/severe-radar.js). The operator is tested on volumes whose right answer is known: a uniform echo (the speckle of N independent samples has a mean of 4.34 (psi(N) - ln N) dB and a
// spread of 4.34 sqrt(psi'(N)) dB), an echo layer of a known depth (the share of the Gaussian beam inside it), a column at a known place (its azimuth and range), the 4/3-earth beam
// height, the receiver's threshold, quantisation and determinism; and at the large end: 100 dBZ, 460 km, values and gates that are not numbers, a whole sweep and a full-screen picture.
import '../src/severe-palette.js';
import '../src/severe-radar.js';
import { readFileSync } from 'node:fs';

const P = globalThis.HFSeverePalette, R = globalThis.HFSevereRadar;
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); } }
const f2 = (v, d = 2) => v.toFixed(d), t0 = Date.now(), lap = () => ((Date.now() - t0) / 1000).toFixed(1) + ' s';
const pal = P.parse(readFileSync(new URL('../data/severe/Apocs_BR_Expert.pal', import.meta.url), 'utf8'));
const near = (c, d, tol = 1) => c.length === d.length && c.every((v, i) => Math.abs(v - d[i]) <= tol);
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/* 1. The colour table: read as it is written. */
check('the table is read: product ' + pal.product + ', units ' + pal.units + ', ' + pal.stops.length + ' entries from ' + pal.stops[0].v + ' to ' + pal.stops[pal.stops.length - 1].v + ' dBZ, comments and blanks skipped',
      pal.product === 'BR' && pal.units === 'dBZ' && pal.step === 5 && pal.stops.length === 27 && pal.stops[0].v === -35 && pal.stops[26].v === 100);
check('the entry at -2 dBZ has two colours (navy to teal), the others one', pal.stops[4].v === -2 && near(pal.stops[4].c1.slice(0, 3), [21, 53, 86], 0) && near(pal.stops[4].c2.slice(0, 3), [31, 154, 180], 0) && pal.stops.filter((s) => s.c2).length === 1);
const at = (v) => P.colorAt(pal, v).slice(0, 3);
check('every entry shows its own colour at its own value (-35 pink, 12 teal, 14.3 green, 69 black, 75 white, 80 cyan, 100 black)',
      near(at(-35), [150, 38, 140], 0) && near(at(12), [0, 166, 169], 0) && near(at(14.3), [65, 169, 72], 0) && near(at(69), [0, 0, 0], 0) && near(at(75), [255, 255, 255], 0) && near(at(80), [0, 244, 255], 0) && near(at(100), [0, 0, 0], 0));

/* 2. Interpolation: a straight run in RGB between entries, a jump where the file says so. */
check('between two entries the colour runs straight: halfway from -2 to 12 dBZ is halfway from the navy to the teal (' + at(5).join(',') + ' for ' + lerp([21, 53, 86], [31, 154, 180], 0.5).map((v) => f2(v, 1)).join(',') + ')', near(at(5), lerp([21, 53, 86], [31, 154, 180], 0.5), 1));
check('and in a run without a second colour it ends at the next entry\'s colour (halfway from 14.3 to 22 dBZ: ' + at(18.15).join(',') + ')', near(at(18.15), lerp([65, 169, 72], [3, 102, 14], 0.5), 1) && near(at(35), lerp([255, 213, 0], [255, 95, 34], 0.6), 1));
check('at 12 dBZ there is the jump the file asks for (11.999: ' + at(11.999).join(',') + ', 12: ' + at(12).join(',') + ')', near(at(11.999), [31, 154, 180], 1) && at(11.999)[0] - at(12)[0] >= 30);
check('below the table nothing is drawn, a value that is not a number nothing, above it the last colour stays (-36: ' + P.colorAt(pal, -36)[3] + ', NaN: ' + P.colorAt(pal, NaN)[3] + ', 250: ' + at(250).join(',') + ')',
      P.colorAt(pal, -36)[3] === 0 && P.colorAt(pal, NaN)[3] === 0 && P.colorAt(pal, -Infinity)[3] === 0 && near(at(250), [0, 0, 0], 0) && P.colorAt(pal, Infinity)[3] === 255);
{
  const lut = P.lut(pal, { vmin: -40, vmax: 105, step: 0.05 });
  let jumps = 0, maxStep = 0, worst = 0, mism = 0;
  for (let i = 1; i < lut.n; i++) {
    if (lut.rgba[4 * i + 3] === 0 || lut.rgba[4 * i - 1] === 0) continue;
    const d = Math.max(Math.abs(lut.rgba[4 * i] - lut.rgba[4 * i - 4]), Math.abs(lut.rgba[4 * i + 1] - lut.rgba[4 * i - 3]), Math.abs(lut.rgba[4 * i + 2] - lut.rgba[4 * i - 2]));
    if (d > 6) { jumps++; worst = d; } else maxStep = Math.max(maxStep, d);
  }
  for (let i = 0; i < lut.n; i += 7) { const c = P.colorAt(pal, lut.vmin + i * lut.step); for (let k = 0; k < 4; k++) if (c[k] !== lut.rgba[4 * i + k]) mism++; }
  check('the look-up table (every 0.05 dBZ, ' + lut.n + ' entries) runs smoothly: the largest step between neighbours is ' + maxStep + ' of 255 in any channel, and the one jump (' + jumps + ', of ' + worst + ') is the file\'s own at 12 dBZ; it agrees with the exact colours (' + mism + ' differences)',
        jumps === 1 && maxStep <= 6 && mism === 0 && lut.index(-1000) === 0 && lut.index(1000) === lut.n - 1 && lut.n === 2901 &&
        near(Array.from(lut.rgba.slice(4 * (lut.n - 1), 4 * lut.n)), P.colorAt(pal, lut.vmax), 0));
  check('a value takes the nearest entry of the table (-34.974 dBZ is the entry at -34.95, not the one at -35; 2.01 is the one at 2.0), and a value on an entry takes that entry (' + lut.index(-34.974) + ', ' + lut.index(2.01) + ', ' + lut.index(60) + ')',
        lut.index(-34.974) === 101 && lut.index(-35.026) === 99 && lut.index(2.01) === 840 && lut.index(60) === 2000);
}
{
  const u = P.parse('Color: 30 200 0 0\nColor: 0 0 0 100\nColor: 10 0 100 0\n');
  check('the reader puts the entries in order of value whatever order the file has (30, 0, 10 gives ' + u.stops.map((x) => x.v).join(', ') + '; at 5 dBZ: ' + P.colorAt(u, 5).join(',') + ', at 20: ' + P.colorAt(u, 20).join(',') + ')',
        u.stops.map((x) => x.v).join() === '0,10,30' && near(P.colorAt(u, 5), [0, 50, 50, 255], 1) && near(P.colorAt(u, 20), [100, 50, 0, 255], 1));
}
{
  const t = P.parse('Product: X\n; a comment\nSolidColor: 0 10 20 30 ; flat\nColor: 10 100 100 100\nColor: 20 0 0 0 200 200 200\nColor: 20 50 50 50\nColor4: 30 1 2 3 128\n');
  const c = (v) => P.colorAt(t, v);
  check('the reader also takes SolidColor (flat to the next entry), two entries at one value (a jump: the first one colours the left of it, the second the right) and Color4 (opacity): ' + JSON.stringify([c(5), c(15), c(19.999), c(20), c(30)]),
        near(c(5), [10, 20, 30, 255], 0) && near(c(15), [50, 50, 50, 255], 1) && near(c(19.999), [0, 0, 0, 255], 1) && near(c(20), [50, 50, 50, 255], 0) && near(c(30), [1, 2, 3, 128], 0));
}

/* 3. The beam: where it is. */
check('the beam of a 0.5 degree tilt is ' + f2(R.beamHeight(100000, 0.5) / 1000, 2) + ' km high at 100 km and ' + f2(R.beamHeight(200000, 0.5) / 1000, 2) + ' km at 200 km (about 1.5 and 4); level, at 100 km, ' + f2(R.beamHeight(100000, 0) / 1000, 3) + ' km (the curve of a 4/3 earth: r2 / 2Re = 0.589)',
      Math.abs(R.beamHeight(100000, 0.5) - 1461) < 15 && Math.abs(R.beamHeight(200000, 0.5) - 4099) < 40 && Math.abs(R.beamHeight(100000, 0) - 588.6) < 2 && Math.abs(R.beamHeight(0, 19.5)) < 1e-6 && R.groundRange(100000, 0.5) < 100000);

{
  // the distance along the ground of a gate: the standard formula tan(theta) = r cos(e) / (Re + r sin(e)), s = Re theta, with the beam model's effective earth
  const Re = R.RE; let worst = 0;
  for (const [r, e] of [[50000, 0.5], [100000, 0.5], [200000, 0.5], [230000, 4.3], [100000, 19.5], [460000, 0.5]]) worst = Math.max(worst, Math.abs(R.groundRange(r, e) - Re * Math.atan(r * Math.cos(e * Math.PI / 180) / (Re + r * Math.sin(e * Math.PI / 180)))));
  check('the distance along the ground of a gate agrees with the standard formula within ' + f2(worst, 1) + ' m at six places (50 to 460 km, 0.5 to 19.5 degrees)', worst < 5);
}

/* 4. Volumes with a known answer. */
function vol(nx, ny, nz, dx, dz, fn, floor = -30) {
  const dbz = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) dbz[(k * ny + j) * nx + i] = fn((i + 0.5) * dx, (j + 0.5) * dx, (k + 0.5) * dz);
  return { nx, ny, nz, dx, dy: dx, dz, floor, dbz };
}

{
  // across the beam: a half-plane of 40 dBZ echo beside a ray due east (two radials, 90 and 270 degrees), 100 km out, its edge half a beam-sigma from the ray on one side or the other. The beam looks at
  // it with three points across (-1, 0, +1 sigma, weights 0.6065, 1, 0.6065, the Gaussian pattern at those points): an edge half a sigma to the side of the ray lets through (1 + 0.6065) / 2.213 =
  // 0.726 of the power, or 0.274 on the other side (the exact Gaussian says 0.692 and 0.308); equal weights would give 0.667 and 0.333.
  const nx = 560, ny = 30, nz = 24, dx = 200, dy = 200, dz = 500, g = 391, r = 2125 + g * 250, sLat = 0.9 / (2 * Math.sqrt(2 * Math.LN2)) * Math.PI / 180 * r, out = [];
  for (const k of [-0.5, 0.5]) {
    const dbz = new Float32Array(nx * ny * nz);
    for (let kk = 0; kk < nz; kk++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) dbz[(kk * ny + j) * nx + i] = (j + 0.5) * dy > 3000 + k * sLat ? 40 : -30;
    const sw = R.scan({ nx, ny, nz, dx, dy, dz, dbz, floor: -30 }, { x: 0, y: 3000, dAz: 180, nGates: 400, n: 4096, quant: 0, noise: { sparse: 0, z1: -90 }, clutter: { ground: 0, clearAir: 0 } });
    out.push(Math.pow(10, 0.1 * (sw.dbz[g] - 40)));
  }
  check('an echo edge half a beam-sigma to either side of the ray lets through ' + f2(out[0], 3) + ' and ' + f2(out[1], 3) + ' of the power (the three-point Gaussian rule: 0.726 and 0.274; exact Gaussian 0.692 and 0.308), which add up to ' + f2(out[0] + out[1], 3),
        Math.abs(out[0] - 0.726) < 0.025 && Math.abs(out[1] - 0.274) < 0.025 && Math.abs(out[0] + out[1] - 1) < 0.03);
}
{
  // the ground cuts the beam: a uniform 40 dBZ field seen along the ground (a 0 degree tilt, 50 km out: the beam's centre is 176 m up and its width 333 m). The nodes of the nine-point rule that lie under the
  // ground see no echo, and what is left is the share of the weights above it, 0.78 (the exact Gaussian says 0.70): the gate reads 38.9 dBZ, not 40
  const nx = 60, ny = 10, nz = 20, g = 191, r = 2125 + g * 250, h = R.beamHeight(r, 0, 30), sv = 0.9 / (2 * Math.sqrt(2 * Math.LN2)) * Math.PI / 180 * r;
  let up = 0, all = 0; for (let t = -2; t <= 2.0001; t += 0.5) { const w = Math.exp(-0.5 * t * t); all += w; if (h + t * sv >= 0) up += w; }
  const sw = R.scan(vol(nx, ny, nz, 1000, 500, () => 40), { x: 0, y: 5000, elev: 0, dAz: 180, nGates: 200, n: 4096, quant: 0, noise: { sparse: 0, z1: -90 }, clutter: { ground: 0, clearAir: 0 } }), d = sw.dbz[g], want = 40 + 10 * Math.log10(up / all);
  check('a beam along the ground (0 degrees, 50 km out, ' + f2(h, 0) + ' m up, ' + f2(sv, 0) + ' m wide) loses what is under the ground: a uniform 40 dBZ field reads ' + f2(d, 2) + ' dBZ, the rule says ' + f2(want, 2) + ' (' + f2(up / all, 3) + ' of the weights are above ground; the exact Gaussian says 0.70)',
        Math.abs(d - want) < 0.2 && want < 39.5 && want > 38);
}
const clean = { clutter: { ground: 0, clearAir: 0 }, noise: { sparse: 0 } };
const digamma = (n) => { let s = -0.5772156649015329; for (let k = 1; k < n; k++) s += 1 / k; return s; }, trigamma = (n) => { let s = Math.PI * Math.PI / 6; for (let k = 1; k < n; k++) s -= 1 / (k * k); return s; };
{
  const big = vol(160, 160, 40, 1000, 500, () => 40);                                                // 40 dBZ everywhere, 160 km across and 20 km deep
  const stats = (n) => {
    const sw = R.scan(big, Object.assign({ x: 80000, y: 80000, elev: 0.5, n, seed: 3 }, clean)); let k = 0, s = 0, s2 = 0;
    for (let a = 0; a < sw.nRad; a++) for (let g = 280; g < 320; g++) { const v = sw.dbz[a * sw.nGates + g]; if (v === v) { k++; s += v; s2 += v * v; } }    // 70 to 80 km out
    const m = s / k; return { m, sd: Math.sqrt(s2 / k - m * m), k };
  };
  for (const n of [1, 2, 4]) {
    const st = stats(n), mean = 40 + 4.343 * (digamma(n) - Math.log(n)), sd = 4.343 * Math.sqrt(trigamma(n));
    check('a uniform 40 dBZ echo seen with N = ' + n + ' samples: mean ' + f2(st.m, 2) + ' dBZ (' + f2(mean, 2) + ' expected), spread ' + f2(st.sd, 2) + ' dB (' + f2(sd, 2) + ' = 4.34 sqrt(psi\'(N))) over ' + st.k + ' gates',
          Math.abs(st.m - mean) < 0.12 && Math.abs(st.sd / sd - 1) < 0.04);
  }
}
{
  // the beam's Gaussian weighting: a field that falls by 8 dB per km of height (a straight line in dBZ, which the volume's interpolation reproduces exactly above its lowest level) seen at
  // 30, 60 and 100 km, against the integral of the full Gaussian pattern worked out finely and independently (nothing below the ground, the field held at its lowest level under 250 m)
  const slope = vol(240, 240, 40, 1000, 500, (x, y, z) => 50 - 8 * z / 1000), sw = R.scan(slope, Object.assign({ x: 120000, y: 120000, elev: 0.5, n: 64, seed: 5 }, clean));
  let worst = 0, report = [];
  for (const km of [30, 60, 100]) {
    const g = Math.round((km * 1000 - sw.r0) / sw.gate); let s = 0, k = 0;
    for (let a = 0; a < sw.nRad; a++) { const v = sw.dbz[a * sw.nGates + g]; if (v === v) { s += v; k++; } }
    const r = sw.r0 + g * sw.gate, h = R.beamHeight(r, 0.5, 30), sd = 0.9 / 2.355 * Math.PI / 180 * r;
    let num = 0, den = 0; for (let t = -6; t <= 6; t += 0.01) { const w = Math.exp(-0.5 * t * t), z = h + t * sd * Math.cos(0.5 * Math.PI / 180); den += w; if (z >= 0) num += w * Math.pow(10, 0.1 * (50 - 8 * Math.max(z, 250) / 1000)); }
    const expect = 10 * Math.log10(num / den), meas = s / k; worst = Math.max(worst, Math.abs(meas - expect)); report.push(f2(meas, 2) + ' (' + f2(expect, 2) + ')');
  }
  check('a field falling 8 dB per km is seen through the Gaussian beam as the full integral of the pattern says, at 30, 60 and 100 km: ' + report.join(', ') + ' dBZ, within ' + f2(worst, 2) + ' dB (partial filling of the beam by the ground included)', worst < 0.25);
}
{
  // a column of 55 dBZ 4 km wide at a known place: the echo is where it is, to a gate
  const col = vol(100, 100, 40, 1000, 500, (x, y) => Math.abs(x - 62000) < 2000 && Math.abs(y - 30000) < 2000 ? 55 : -30), rx = 20000, ry = 10000;
  const sw = R.scan(col, Object.assign({ x: rx, y: ry, elev: 0.5, n: 8, seed: 9 }, clean));
  let sx = 0, sy = 0, sp = 0, hits = 0;
  for (let a = 0; a < sw.nRad; a++) for (let g = 0; g < sw.nGates; g++) { const v = sw.dbz[a * sw.nGates + g]; if (!(v > 25)) continue; const az = (a + 0.5) * sw.dAz * Math.PI / 180, s = R.groundRange(sw.r0 + g * sw.gate, 0.5, 30), w = Math.pow(10, 0.1 * v); sx += w * (rx + s * Math.sin(az)); sy += w * (ry + s * Math.cos(az)); sp += w; hits++; }
  check('a 4 km column of 55 dBZ at (62, 30) km seen from (20, 10): its echo (' + hits + ' gates) has its centre at (' + f2(sx / sp / 1000, 2) + ', ' + f2(sy / sp / 1000, 2) + ') km, within 0.4 km', Math.abs(sx / sp - 62000) < 400 && Math.abs(sy / sp - 30000) < 400 && hits > 100);
}
{
  // noise and threshold: an empty sky reports (nearly) nothing; an echo reports once it is clear of the noise, which grows with range
  const empty = vol(20, 20, 10, 1000, 500, () => -30), sw0 = R.scan(empty, Object.assign({ x: 0, y: 0, seed: 11 }, clean)), sw1 = R.scan(empty, { x: 0, y: 0, seed: 11, clutter: { ground: 0, clearAir: 0 } });
  let c0 = 0, c1 = 0; for (const v of sw0.dbz) if (v === v) c0++; for (const v of sw1.dbz) if (v === v) c1++;
  check('an empty sky reports ' + c0 + ' of ' + sw0.dbz.length + ' gates with the weak-target switch off and ' + c1 + ' (' + f2(100 * c1 / sw1.dbz.length, 2) + ' %) with it on: nothing but the odd target', c0 === 0 && c1 / sw1.dbz.length < 0.005 && c1 > c0);
  const cl = R.scan(empty, { x: 0, y: 0, seed: 11, noise: { sparse: 0 }, clutter: { ground: 1, clearAir: 0 } }), shareIn = (lo, hi) => { let n = 0, k = 0; for (let a = 0; a < cl.nRad; a++) for (let g = 0; g < cl.nGates; g++) { const km = (cl.r0 + g * cl.gate) / 1000; if (km < lo || km >= hi) continue; n++; if (cl.dbz[a * cl.nGates + g] === cl.dbz[a * cl.nGates + g]) k++; } return k / n; };
  const c8 = shareIn(5, 12), c30 = shareIn(25, 35), c80 = shareIn(60, 100);
  check('ground clutter fills a share of the gates near the radar and is gone beyond 50 km: ' + f2(100 * c8, 0) + ' % of the gates at 5-12 km, ' + f2(100 * c30, 1) + ' % at 25-35 km, ' + f2(100 * c80, 2) + ' % at 60-100 km', c8 > 0.1 && c8 < 0.4 && c30 > 0.005 && c30 < c8 / 3 && c80 === 0);
  const noiseDbz = (km) => -41.8 + 20 * Math.log10(km) + 0.019 * km, share = (km, snr) => {      // the receiver's noise in dBZ: -41.8 at 1 km, 20 log r, and the correction for the air's attenuation
    const v = vol(220, 220, 40, 2000, 500, () => noiseDbz(km) + snr), sw = R.scan(v, Object.assign({ x: 220000, y: 220000, elev: 0.5, n: 8, seed: 13 }, clean)), g = Math.round((km * 1000 - sw.r0) / sw.gate); let k = 0;
    for (let a = 0; a < sw.nRad; a++) if (sw.dbz[a * sw.nGates + g] === sw.dbz[a * sw.nGates + g]) k++;
    return k / sw.nRad;
  };
  const lo = share(80, -3), hi = share(80, 10), hi2 = share(200, 10);
  check('an echo 3 dB under the noise is reported by ' + f2(100 * lo, 0) + ' % of its gates and one 10 dB over it by ' + f2(100 * hi, 0) + ' % (at 80 km) and ' + f2(100 * hi2, 0) + ' % (at 200 km, where the noise is 8 dB higher)', lo < 0.3 && hi > 0.95 && hi2 > 0.95);
}
{
  // the receiver against real radar: Level II reflectivity of 14 volumes (KOAX 2014-06-16, KSGF 2011-05-22, KTLX 2013-05-20, lowest tilt, 20 km range bins; Py-ART, tools/severe_research/nexrad_sweep.py)
  // never reports anything under a floor that rises with range: the lowest value of a bin is -9.0 dBZ at 40-60 km, -2.5 at 80-100, 3.0 at 140-160, 9.0 at 240-260, 13.0 at 340-360 and 17.0 at
  // 420-440 km (the p0.5 of the bin is 1 dB higher). A weak echo of -22 dBZ everywhere (the clear-air layer made as high as the sky, no clutter and no isolated targets) is reported only
  // where it clears that floor, so the lowest value reported in each bin is the floor.
  const sw = R.scan(null, { seed: 9, nGates: 1840, noise: { sparse: 0 }, clutter: { ground: 0, clearAir: 1 }, clear: { mean: -22, fall: 0, top: 1e9, soft: 1, std: [0, 0] } });
  const lowest = (lo) => { let m = Infinity; for (let a = 0; a < sw.nRad; a++) for (let g = 0; g < sw.nGates; g++) { const km = (sw.r0 + g * sw.gate) / 1000; if (km < lo || km >= lo + 20) continue; const d = sw.dbz[a * sw.nGates + g]; if (d === d && d < m) m = d; } return m; };
  const real = [[40, -9.0], [80, -2.5], [140, 3.0], [240, 9.0], [340, 13.0], [420, 17.0]], got = real.map(([lo]) => lowest(lo));
  check('the lowest value reported by the simulated receiver follows the real radars\' floor within 2 dB: ' + real.map(([lo, v], i) => lo + '-' + (lo + 20) + ' km ' + f2(got[i], 1) + ' (real ' + f2(v, 1) + ')').join(', '), real.every(([lo, v], i) => Math.abs(got[i] - v) <= 2));
}
{
  // clear air against real radar: the lowest tilt of KOAX (2014-06-16 22:15 UTC, a day of insects: mean +4 dBZ) and KSGF (2011-05-22 21:40, a dull day: -4.7), in the gates with no echo of 18 dBZ
  // or more within 4 radials and 6 gates: 99 % of the gates report out to 45 km (KSGF 76 % at 40 km), 87 % (31 %) at 60 km, 37 % (10 %) at 90 km; the spread of the valid values is 5.2 dB (5.7) at 10 km
  // and 3.4 (3.0) at 60 km; neighbouring gates differ by 3.5 / sqrt 2 dB (10 km) to 2.1 (90 km). The default clear air has to lie between the two radars.
  const nG = 460, sw = R.scan(null, { seed: 5, nGates: nG }), a = sw.dbz, nRad = sw.nRad, ok = new Uint8Array(nRad * nG);
  for (let i = 0; i < nRad; i++) for (let g = 0; g < nG; g++) { let c = 1; for (let di = -4; di <= 4 && c; di++) { const ii = (i + di + nRad) % nRad; for (let dg = -6; dg <= 6; dg++) { const gg = g + dg; if (gg >= 0 && gg < nG && a[ii * nG + gg] >= 18) { c = 0; break; } } } ok[i * nG + g] = c; }
  const stat = (lo) => {
    let tot = 0, n = 0, sum = 0, sq = 0, dn = 0, ds = 0;
    for (let i = 0; i < nRad; i++) for (let g = 0; g < nG; g++) {
      const km = (sw.r0 + g * sw.gate) / 1000, o = i * nG + g; if (km < lo || km >= lo + 10 || !ok[o]) continue; tot++;
      const v = a[o]; if (v !== v) continue; n++; sum += v; sq += v * v;
      if (g + 1 < nG && ok[o + 1] && a[o + 1] === a[o + 1]) { const d = a[o + 1] - v; dn++; ds += d * d; }
    }
    const m = sum / n; return { valid: 100 * n / tot, mean: m, sd: Math.sqrt(sq / n - m * m), fine: Math.sqrt(ds / dn / 2) };
  };
  const s10 = stat(5), s30 = stat(25), s60 = stat(55), s90 = stat(85);
  const line = (s, lo) => lo + ' km: ' + f2(s.valid, 0) + ' % valid, mean ' + f2(s.mean, 1) + ', spread ' + f2(s.sd, 1) + ', fine ' + f2(s.fine, 1);
  check('the default clear air reports in the gates the way real radars do: ' + [line(s10, '5-15'), line(s30, '25-35'), line(s60, '55-65'), line(s90, '85-95')].join('; '),
        s10.valid > 97 && s30.valid > 89 && s30.valid < 100 && s60.valid > 30 && s60.valid < 95 && s90.valid > 8 && s90.valid < 45 && s10.mean > -4.7 && s10.mean < 4.8 && s60.mean > -4 && s60.mean < 5);
  check('with the real spread: the valid values scatter by 5.1 dB at 10 km (real 5.2 and 5.7) and 3.9 dB at 60 km (3.4 and 3.0), and neighbouring gates differ by the speckle of two samples, 3.5 dB at 30 km (real 3.2) falling to 2.2 at 90 km (2.1)',
        s10.sd > 4.4 && s10.sd < 6.3 && s60.sd > 2.5 && s60.sd < 4.4 && s30.fine > 2.7 && s30.fine < 4.0 && s90.fine > 1.5 && s90.fine < 2.7);
  // and it is where the boundary layer is: nothing of it above a beam 2.2 km high (at 150 km), the layer's top at 1.3 km
  const hi = R.scan(null, { seed: 5, nGates: 920 }); let far = 0, cnt = 0; for (let i = 0; i < hi.nRad; i++) for (let g = 560; g < 920; g++) { cnt++; if (hi.dbz[i * hi.nGates + g] === hi.dbz[i * hi.nGates + g]) far++; }
  check('beyond 140 km, where the beam is above the boundary layer, the clear air is gone and only the odd isolated target reports: ' + far + ' of ' + cnt + ' gates (' + f2(100 * far / cnt, 2) + ' %)', far / cnt < 0.005);
}
{
  const u = vol(160, 160, 40, 1000, 500, (x, y, z) => 20 + 30 * Math.sin(x / 9000) * Math.cos(y / 7000)), a = R.scan(u, Object.assign({ x: 80000, y: 80000, seed: 21 }, clean)), b = R.scan(u, Object.assign({ x: 80000, y: 80000, seed: 21 }, clean)), c = R.scan(u, Object.assign({ x: 80000, y: 80000, seed: 22 }, clean));
  let same = true, diff = 0, step = true, fin = 0; for (let i = 0; i < a.dbz.length; i++) { if (!Object.is(a.dbz[i], b.dbz[i])) same = false; if (!Object.is(a.dbz[i], c.dbz[i])) diff++; if (a.dbz[i] === a.dbz[i]) { fin++; if (Math.abs(a.dbz[i] * 2 - Math.round(a.dbz[i] * 2)) > 1e-6) step = false; } }
  check('a frame always looks the same (seeded by frame, radial and gate): the same seed gives the same ' + a.dbz.length + ' gates, another seed ' + diff + ' different ones; all ' + fin + ' values are in 0.5 dBZ steps as the data are', same && diff > 1000 && step);
}

/* 5. The large end. */
{
  const hot = vol(100, 100, 40, 1000, 500, () => 100), sw = R.scan(hot, Object.assign({ x: 50000, y: 50000, n: 4, seed: 31 }, clean));
  let k = 0, s = 0, mx = -99; for (let a = 0; a < sw.nRad; a++) for (let g = 100; g < 140; g++) { const v = sw.dbz[a * sw.nGates + g]; if (v === v) { k++; s += v; if (v > mx) mx = v; } }
  const lut = P.lut(pal, { vmin: -40, vmax: 105, step: 0.05 }), c = lut.rgba.subarray(4 * lut.index(mx), 4 * lut.index(mx) + 3);
  check('a 100 dBZ echo is seen as ' + f2(s / k, 1) + ' dBZ on average (strongest ' + mx + ') with nothing lost to overflow, and the table has a colour for it (' + Array.from(c).join(',') + ')', k > 3000 && Math.abs(s / k - 98.8) < 1 && mx < 120 && Number.isFinite(mx));
}
{
  const weird = vol(40, 40, 20, 1000, 500, (x, y, z) => (x + y) % 3000 < 1000 ? NaN : (x + y) % 3000 < 2000 ? Infinity : -Infinity, -30), sw = R.scan(weird, { x: 20000, y: 20000, seed: 41, clutter: { ground: 0, clearAir: 0 } });
  let bad = 0; for (const v of sw.dbz) if (v === Infinity || v === -Infinity) bad++;
  check('a volume of NaN, +Infinity and -Infinity gives gates that are numbers or no data (' + bad + ' infinite) and does not stop the scan', bad === 0 && sw.dbz.length === 720 * 920);
}
{
  const rain = vol(100, 100, 40, 1000, 500, (x, y, z) => z < 3000 ? 50 : -30), seen = (rx) => {                // a shower 3 km deep and 100 km across, the radar rx metres west of it
    const sw = R.scan(rain, Object.assign({ x: rx, y: 50000, nGates: 1840, n: 4, seed: 51 }, clean)); let k = 0;
    for (let a = 0; a < sw.nRad; a++) for (let q = 0; q < sw.nGates; q++) if (sw.dbz[a * sw.nGates + q] > 25) k++;
    return { k, sw };
  };
  const near = seen(-60000), far = seen(-400000), h = R.beamHeight(400000, 0.5, 30);
  check('out to 460 km (1840 gates) the scan runs: a shower 3 km deep is seen from 60 km (' + near.k + ' gates) but not from 400 km (' + far.k + ' gates), where the 0.5 degree beam is ' + f2(h / 1000, 1) + ' km high and passes over it: far storms lose their lowest kilometres',
        far.sw.nGates === 1840 && near.k > 2000 && far.k === 0 && h > 9000 && Number.isFinite(h));
}
{
  const dense = vol(160, 160, 40, 1000, 500, (x, y, z) => 30 + 25 * Math.sin(x / 15000) * Math.sin(y / 11000) + 5 * Math.sin(z / 3000)), tS = Date.now();
  const sw = R.scan(dense, { x: 80000, y: 80000, elev: 1.5, seed: 61 }), t1 = Date.now() - tS, lut = P.lut(pal, { vmin: -40, vmax: 105, step: 0.05 }), tR = Date.now();
  const img = R.render(sw, lut, { w: 1920, h: 1080, cx: 0, cy: 0, mpp: 160 }), t2 = Date.now() - tR;
  let colored = 0; for (let i = 0; i < img.length; i += 4) if (img[i] !== 11 || img[i + 1] !== 13 || img[i + 2] !== 26) colored++;
  check('a full sweep of a storm 160 km across (720 radials x 920 gates, with the 9-point beam) takes ' + t1 + ' ms and a 1920x1080 picture of it ' + t2 + ' ms; ' + f2(100 * colored / (img.length / 4), 0) + ' % of the pixels show echo', t1 < 4000 && t2 < 3000 && colored > 100000);
}

/* 5b. Doppler velocity and spectrum width: what the radar measures of the winds. */
const D2R = Math.PI / 180, SIG = 0.9 / (2 * Math.sqrt(2 * Math.LN2)) * D2R;                          // the beam's sigma, radians
const foldV = (v, n) => v - 2 * n * Math.floor((v + n) / (2 * n));                                   // a velocity folded into +-Nyquist
const nDb = (g) => -41.8 + 20 * Math.log10((2125 + g * 250) / 1000) + 0.019 * (2125 + g * 250) / 1000;   // the noise power at gate g, in dBZ
function volw(nx, ny, nz, dx, dz, fn, wf, floor = -30) {                                            // a volume with winds: fn(x, y, z) the dBZ, wf(x, y, z) = [u, v, w, vz] in m/s (vz: the fall of the rain, downward)
  const V = vol(nx, ny, nz, dx, dz, fn, floor), n = nx * ny * nz; V.u = new Float32Array(n); V.v = new Float32Array(n); V.w = new Float32Array(n); V.vz = new Float32Array(n);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const q = (k * ny + j) * nx + i, a = wf((i + 0.5) * dx, (j + 0.5) * dx, (k + 0.5) * dz); V.u[q] = a[0]; V.v[q] = a[1]; V.w[q] = a[2]; V.vz[q] = a[3]; }
  return V;
}
const azOf = (sw, a) => (a + 0.5) * sw.dAz * D2R;
function worstErr(sw, want, g0, g1, use) {                                                           // the largest |velocity - want(az, gate)| over the gates g0..g1-1 that have a velocity (and whose radial passes use(az))
  let m = 0, k = 0; for (let a = 0; a < sw.nRad; a++) { const az = azOf(sw, a); if (use && !use(az)) continue; for (let g = g0; g < g1; g++) { const v = sw.vel[a * sw.nGates + g]; if (v === v) { k++; m = Math.max(m, Math.abs(v - want(az, g))); } } }
  return { m, k };
}
function vad(sw, g0, g1) {                                                                           // the velocity azimuth display: the least-squares fit of A0 + A1 sin(az) + A2 cos(az) to the gates g0..g1-1
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0]; let n = 0;
  for (let a = 0; a < sw.nRad; a++) { const az = azOf(sw, a), f = [1, Math.sin(az), Math.cos(az)]; for (let g = g0; g < g1; g++) { const v = sw.vel[a * sw.nGates + g]; if (v !== v) continue; n++; for (let i = 0; i < 3; i++) { b[i] += f[i] * v; for (let j = 0; j < 3; j++) S[i][j] += f[i] * f[j]; } } }
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]), D = det(S);
  const x = [0, 1, 2].map((i) => det(S.map((row, r) => row.map((c, k) => k === i ? b[r] : c))) / D);
  return { A0: x[0], A1: x[1], A2: x[2], n };
}
const exact = { nyquist: 1000, quant: 0, noise: 0 };                                                 // no folding, no rounding and no measurement error: the geometry alone
const median = (a) => { const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };
{
  // the wind sampler of the volume: the stored value at a cell centre, a straight line between the centres (any linear field is reproduced exactly), the first cell's value in the outer half cell, nothing outside
  const nx = 6, ny = 5, nz = 4, dx = 100, dz = 50, ws = R.windSampler(volw(nx, ny, nz, dx, dz, () => 20, (x, y, z) => [x * 0.01 + 1, y * 0.02 - 3, z * 0.1 + 2, 7 + x * 0.001 + z * 0.01])), o = [0, 0, 0, 0];
  const lin = (x, y, z) => [x * 0.01 + 1, y * 0.02 - 3, z * 0.1 + 2, 7 + x * 0.001 + z * 0.01];
  let worst = 0, seed = 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let t = 0; t < 200; t++) { const x = (0.5 + rnd() * (nx - 1)) * dx, y = (0.5 + rnd() * (ny - 1)) * dx, z = (0.5 + rnd() * (nz - 1)) * dz; ws(x, y, z, o); const e = lin(x, y, z); for (let c = 0; c < 4; c++) worst = Math.max(worst, Math.abs(o[c] - e[c])); }
  const inside = ws(2.5 * dx, 1.5 * dx, 3.5 * dz, o), atC = lin(2.5 * dx, 1.5 * dx, 3.5 * dz), cen = [...o];
  ws(0.1 * dx, 0.3 * dx, 0.1 * dz, o); const corner = lin(0.5 * dx, 0.5 * dx, 0.5 * dz);
  check('the wind sampler gives a linear field exactly between the cell centres (largest error ' + worst.toExponential(1) + ' in 200 places), the stored values at a centre (' + cen.map((v) => f2(v, 2)).join(', ') + '), the first cell\'s in the outer half cell (' + o.map((v) => f2(v, 2)).join(', ') + '), and nothing above, below or beside the volume',
        worst < 1e-3 && inside === true && cen.every((v, c) => Math.abs(v - atC[c]) < 1e-4) && o.every((v, c) => Math.abs(v - corner[c]) < 1e-4) &&
        ws(-0.6 * dx, 100, 100, o) === false && ws(100, nx * dx + 1, 100, o) === false && ws(100, 100, -1, o) === false && ws(100, 100, nz * dz + 1, o) === false && ws(nx * dx + 1, 100, 100, o) === false);
}
{
  // uniform wind in uniform rain: every gate reads the radial component of the wind, u cos(e) sin(az) + v cos(e) cos(az) + (w - fall speed) sin(e), positive away from the radar
  const wnd = [12, -5, 3, 6], big = volw(160, 160, 40, 1000, 500, () => 40, () => wnd), res = [];
  for (const e of [0.5, 19.5]) {
    const sw = R.scan(big, Object.assign({ x: 80000, y: 80000, elev: e, dAz: 1, nGates: 160, seed: 5, velocity: exact }, clean)), c = Math.cos(e * D2R), s = Math.sin(e * D2R);
    res.push(Object.assign(worstErr(sw, (az) => c * (wnd[0] * Math.sin(az) + wnd[1] * Math.cos(az)) + (wnd[2] - wnd[3]) * s, 0, 160), { sw }));
  }
  check('a uniform wind (12 m/s to the east, 5 to the south, rising at 3, rain falling at 6) gives every gate its radial component, cos(e) (u sin az + v cos az) + (w - fall) sin(e): the largest error is ' + res[0].m.toExponential(1) + ' m/s at 0.5 degrees (' + res[0].k + ' gates) and ' + res[1].m.toExponential(1) + ' at 19.5 (' + res[1].k + ')',
        res[0].k === 360 * 160 && res[1].k === 360 * 160 && res[0].m < 1e-3 && res[1].m < 1e-3);
  const v = res[0].sw.vel;
  check('the sign is the radar\'s: wind to the east is positive (away) for a gate due east (' + f2(v[90 * 160 + 100]) + ') and negative for one due west (' + f2(v[270 * 160 + 100]) + '), wind to the south is negative (towards) for a gate due north (' + f2(v[0 * 160 + 100]) + ')',
        v[90 * 160 + 100] > 11 && v[270 * 160 + 100] < -11 && v[100] < -4 && v[180 * 160 + 100] > 4);
}
{
  // rain falls, and a radar looking up sees the fall as a motion towards it: -fall sin(e). At 19.5 degrees 8 m/s of fall is -2.67 m/s, at 0.5 degrees -0.07; an updraft of 20 m/s is +6.7
  const at = (w, vz, e) => { const sw = R.scan(volw(160, 160, 40, 1000, 500, () => 40, () => [0, 0, w, vz]), Object.assign({ x: 80000, y: 80000, elev: e, dAz: 90, nGates: 120, seed: 5, velocity: exact }, clean)); return Object.assign(worstErr(sw, () => (w - vz) * Math.sin(e * D2R), 0, 120), { v: sw.vel[100] }); };
  const fall = at(0, 8, 19.5), low = at(0, 8, 0.5), up = at(20, 0, 19.5);
  check('rain falling at 8 m/s reads ' + f2(fall.v) + ' m/s at 19.5 degrees (-8 sin(19.5) = ' + f2(-8 * Math.sin(19.5 * D2R)) + ') and ' + f2(low.v, 3) + ' at 0.5 degrees; a 20 m/s updraft reads ' + f2(up.v) + ' (20 sin(19.5) = ' + f2(20 * Math.sin(19.5 * D2R)) + ')',
        fall.m < 1e-3 && low.m < 1e-3 && up.m < 1e-3 && Math.abs(fall.v + 8 * Math.sin(19.5 * D2R)) < 1e-3 && Math.abs(up.v - 20 * Math.sin(19.5 * D2R)) < 1e-3 && fall.k === 4 * 120);
}
{
  // a vortex turning counter-clockwise (a cyclone) 35 km east of the radar, solid-body (a linear field, so the beam's average is exact): the radial velocity is the vortex's rate of turning times the distance of the
  // ray from its centre, cos(e) om ((xr - xc) cos az - (yr - yc) sin az); looking along the beam it is towards the radar on the left of the centre and away on the right, the couplet of a mesocyclone
  const om = 0.002, xc = 85000, yc = 50000, V = volw(200, 200, 24, 500, 500, () => 40, (x, y) => [-om * (y - yc), om * (x - xc), 0, 0]);
  const sw = R.scan(V, Object.assign({ x: 50000, y: 50000, elev: 0.5, dAz: 1, nGates: 160, seed: 5, velocity: exact }, clean)), c = Math.cos(0.5 * D2R);
  const wr = worstErr(sw, (az) => c * om * ((50000 - xc) * Math.cos(az) - (50000 - yc) * Math.sin(az)), 0, 160), left = sw.vel[88 * 160 + 131], right = sw.vel[91 * 160 + 131], in1 = sw.vel[89 * 160 + 131], in2 = sw.vel[90 * 160 + 131];
  check('a solid-body vortex 35 km away: every gate reads the vortex\'s rate of turning times the distance of its ray from the centre (largest error ' + wr.m.toExponential(1) + ' m/s over ' + wr.k + ' gates), and at its range the rays 1.5 degrees to the left and to the right read ' + f2(left) + ' (towards) and +' + f2(right) + ' (away), the two either side of the centre ' + f2(in1, 2) + ' and +' + f2(in2, 2),
        wr.k === 360 * 160 && wr.m < 1e-3 && left < -1.7 && right > 1.7 && Math.abs(in1 + in2) < 1e-3 && in1 < -0.5 && in2 > 0.5 && Math.abs(left + right) < 1e-3);
}
{
  // the beam averages the velocity of its parts weighted by their power, not by their dBZ: half the beam in 50 dBZ rain blowing away at 10 m/s, half in 30 dBZ rain blowing towards the radar at 10: the strong half has 100
  // times the power. The echo edge half a beam-sigma to one side or the other of the ray gives the strong half 0.726 or 0.274 of the beam's weights (three points across), so the velocity is
  // 10 (0.726 100000 - 0.274 1000) / (0.726 100000 + 0.274 1000) = 9.93, or 10 (0.274 100000 - 0.726 1000) / (0.274 100000 + 0.726 1000) = 9.48; a mean of the two halves would read near 0 and one by dBZ near +4.5
  const nx = 560, ny = 30, nz = 24, dx = 200, dz = 500, g = 391, r = 2125 + g * 250, sLat = SIG * r, out = [], ws = (1 + 0.6065) / (1 + 2 * 0.6065);
  for (const k of [-0.5, 0.5]) {
    const V = volw(nx, ny, nz, dx, dz, (x, y) => y > 3000 + k * sLat ? 50 : 30, (x, y) => [y > 3000 + k * sLat ? 10 : -10, 0, 0, 0]);
    out.push(R.scan(V, { x: 0, y: 3000, dAz: 180, nGates: 400, n: 4096, seed: 1, velocity: exact, noise: { sparse: 0, z1: -90 }, clutter: { ground: 0, clearAir: 0 } }).vel[g]);
  }
  const want = [10 * (ws * 1e5 - (1 - ws) * 1e3) / (ws * 1e5 + (1 - ws) * 1e3), 10 * ((1 - ws) * 1e5 - ws * 1e3) / ((1 - ws) * 1e5 + ws * 1e3)];
  check('the velocity is the power-weighted mean of the beam: ' + f2(out[0]) + ' and ' + f2(out[1]) + ' m/s with the strong echo (50 dBZ, +10) on 0.726 and on 0.274 of the beam, the rule says ' + f2(want[0]) + ' and ' + f2(want[1]) + ' (not 0 or 4.5, which are the unweighted and the dBZ-weighted means)',
        Math.abs(out[0] - want[0]) < 0.1 && Math.abs(out[1] - want[1]) < 0.1 && out[0] > 9.5 && out[1] > 9);
}
{
  // folding: a 40 m/s wind seen by a radar whose Nyquist velocity is 28 m/s shows 40 - 56 = -16 where it blows away at 40 (the velocity is only known to within 2 x 28), and the unfolded value is there when asked for
  const big = volw(160, 160, 40, 1000, 500, () => 40, () => [40, 0, 0, 0]), base = Object.assign({ x: 80000, y: 80000, elev: 0.5, dAz: 1, nGates: 100, seed: 5 }, clean), c = Math.cos(0.5 * D2R), truth = (az) => 40 * c * Math.sin(az);
  const folded = R.scan(big, Object.assign({}, base, { velocity: { nyquist: 28, quant: 0, noise: 0 } })), open = R.scan(big, Object.assign({}, base, { velocity: { nyquist: 28, quant: 0, noise: 0, dealias: true } })), wide = R.scan(big, Object.assign({}, base, { velocity: { nyquist: 60, quant: 0, noise: 0 } }));
  const wf = worstErr(folded, (az) => foldV(truth(az), 28), 0, 100), wo = worstErr(open, truth, 0, 100), ww = worstErr(wide, truth, 0, 100);
  let mx = 0, mxO = 0, nFold = 0; for (let q = 0; q < folded.vel.length; q++) { mx = Math.max(mx, Math.abs(folded.vel[q])); mxO = Math.max(mxO, Math.abs(open.vel[q])); if (Math.abs(truth(azOf(folded, Math.floor(q / 100)))) > 28) nFold++; }
  check('with a Nyquist velocity of 28 m/s a 40 m/s wind is folded: every gate shows the true value minus 56 where it passes 28 (largest error ' + wf.m.toExponential(1) + ', ' + f2(100 * nFold / folded.vel.length, 0) + ' % of the gates folded, none beyond +-' + f2(mx, 1) + '), the unfolded wind is ' + f2(mxO, 1) + ' at most when asked for (' + wo.m.toExponential(1) + ') and a Nyquist velocity of 60 needs no folding (' + ww.m.toExponential(1) + ')',
        wf.m < 1e-3 && wo.m < 1e-3 && ww.m < 1e-3 && mx <= 28 && mx > 27 && mxO > 39.5 && nFold / folded.vel.length > 0.4 && nFold / folded.vel.length < 0.6);
  const rounded = R.scan(volw(160, 160, 40, 1000, 500, () => 40, () => [13.37, 2.2, 0, 0]), Object.assign({}, base, { velocity: true }));
  let off = 0, n = 0; for (const v of rounded.vel) if (v === v) { n++; if (Math.abs(v * 2 - Math.round(v * 2)) > 1e-6) off++; }
  check('the velocities are in steps of 0.5 m/s like the Level II data (' + n + ' gates, ' + off + ' off the grid)', n > 30000 && off === 0);
}
{
  // the error of the radar's own estimate of the velocity (the pulse pair of M pulses, Zrnic 1977): sd = Vn / pi sqrt(((1 + 1/SNR)^2 - rho^2) / (2 M rho^2)); with no spread of the wind in the beam (rho = 1) and no
  // other source of scatter it is Vn / pi sqrt((2 / SNR + 1 / SNR^2) / 2M). Uniform 4 dBZ rain out to 72 km has every signal-to-noise ratio between 3 and 25 dB, so the scatter is found by the signal-to-noise ratio of
  // each gate (its reported reflectivity less the noise of its range)
  const big = volw(160, 160, 40, 1000, 500, () => 4, () => [6, 3, 0, 0]), c = Math.cos(0.5 * D2R);
  const model = (snrDb, o) => { const s = Math.pow(10, 0.1 * (snrDb - ((o && o.loss) || 0))); return ((o && o.nyq) || 28) / Math.PI * Math.sqrt((Math.pow(1 + 1 / s, 2) - 1) / (2 * ((o && o.pulses) || 40))); };
  const run = (vo) => {
    const sw = R.scan(big, Object.assign({ x: 80000, y: 80000, elev: 0.5, dAz: 0.5, nGates: 280, seed: 7 }, clean, { velocity: Object.assign({ quant: 0, snrLoss: 0, fine: { storm: 0 }, width: { storm: 0 }, shear: 0 }, vo) }));
    const bins = new Map(); let minWith = 99, maxWithout = -99, minAll = 99;
    for (let a = 0; a < sw.nRad; a++) { const az = azOf(sw, a), tv = c * (6 * Math.sin(az) + 3 * Math.cos(az)); for (let g = 40; g < 280; g++) { const q = a * sw.nGates + g, v = sw.vel[q], d = sw.dbz[q]; if (d !== d) continue; const snr = d - nDb(g);
      if (v === v) { minWith = Math.min(minWith, snr); const b = Math.round(snr), e = v - tv; if (!bins.has(b)) bins.set(b, [0, 0, 0]); const o = bins.get(b); o[0]++; o[1] += e; o[2] += e * e; } else maxWithout = Math.max(maxWithout, snr); } }
    const sd = (b) => { const o = bins.get(b) || [1, 0, 0], m = o[1] / o[0]; return { n: o[0], sd: Math.sqrt(o[2] / o[0] - m * m), mean: m }; };
    return { sd, minWith, maxWithout, sw };
  };
  const base = run({}), s5 = base.sd(5), s10 = base.sd(10), s15 = base.sd(15);
  check('the scatter of the velocity follows the pulse-pair formula: ' + f2(s5.sd, 3) + ' (' + s5.n + ' gates), ' + f2(s10.sd, 3) + ' (' + s10.n + ') and ' + f2(s15.sd, 3) + ' (' + s15.n + ') m/s at 5, 10 and 15 dB over the noise, the formula says ' + f2(model(5), 3) + ', ' + f2(model(10), 3) + ' and ' + f2(model(15), 3) + '; its mean error is ' + f2(s10.mean, 3),
        s5.n > 1500 && s10.n > 3000 && s15.n > 3000 && Math.abs(s5.sd / model(5) - 1) < 0.1 && Math.abs(s10.sd / model(10) - 1) < 0.08 && Math.abs(s15.sd / model(15) - 1) < 0.08 && Math.abs(s10.mean) < 0.05);
  const half = run({ noise: 0.5 }).sd(10).sd / s10.sd, more = run({ pulses: 160 }).sd(10).sd / s10.sd, wide = run({ nyquist: 56 }).sd(10).sd / s10.sd, loss = run({ snrLoss: 6 }).sd(10);
  check('the scatter halves with half the noise setting (' + f2(half, 2) + '), halves with four times the pulses (' + f2(more, 2) + '), doubles with twice the Nyquist velocity (' + f2(wide, 2) + '), and follows the formula with a 6 dB loss of the estimator (' + f2(loss.sd, 3) + ' against ' + f2(model(10, { loss: 6 }), 3) + ')',
        Math.abs(half - 0.5) < 0.04 && Math.abs(more - 0.5) < 0.04 && Math.abs(wide - 2) < 0.15 && Math.abs(loss.sd / model(10, { loss: 6 }) - 1) < 0.1);
  check('a gate has a velocity only if its total power is 4 dB over the noise (1.8 dB of net signal): the weakest gate with one is ' + f2(base.minWith, 2) + ' dB over the noise, the strongest without one ' + f2(base.maxWithout, 2) + ' dB (the reflectivity needs 2.5 dB over the noise, so there are gates with an echo and no velocity)',
        base.minWith > 1.45 && base.minWith < 2.2 && base.maxWithout > 1.2 && base.maxWithout < 2.15);
  // the estimator's loss of signal and the spectrum width the model does not resolve make the scatter at a high signal-to-noise ratio what the white fluctuation of the wind in the gate (0.8 m/s) and the pulse pair for
  // a spectrum width of 1.5 m/s make it: sqrt(0.8^2 + 0.17^2) = 0.82
  const hi = R.scan(volw(160, 160, 40, 1000, 500, () => 40, () => [6, 3, 0, 0]), Object.assign({ x: 80000, y: 80000, elev: 0.5, dAz: 0.5, nGates: 240, seed: 7, velocity: { quant: 0, fine: { storm: 0.8 }, width: { storm: 1.5 }, shear: 0 } }, clean));
  let k = 0, s1 = 0, s2 = 0; const swv = []; for (let a = 0; a < hi.nRad; a++) { const az = azOf(hi, a), tv = c * (6 * Math.sin(az) + 3 * Math.cos(az)); for (let g = 40; g < 240; g++) { const v = hi.vel[a * 240 + g]; if (v === v) { k++; const e = v - tv; s1 += e; s2 += e * e; swv.push(hi.sw[a * 240 + g]); } } }
  const sdHi = Math.sqrt(s2 / k - (s1 / k) ** 2), mSw = swv.reduce((p, q) => p + q, 0) / swv.length, sdSw = Math.sqrt(swv.reduce((p, q) => p + (q - mSw) ** 2, 0) / swv.length), rho = Math.exp(-Math.PI * Math.PI * 2.25 / (2 * 28 * 28)), ppSd = 28 / Math.PI * Math.sqrt((1 - rho * rho) / (80 * rho * rho));
  check('a strong echo (40 dBZ) has a velocity scatter of ' + f2(sdHi, 3) + ' m/s (0.8 white fluctuation and ' + f2(ppSd, 2) + ' of the pulse pair give ' + f2(Math.sqrt(0.64 + ppSd * ppSd), 3) + ') and a spectrum width of ' + f2(median(swv), 2) + ' m/s (the 1.5 of unresolved broadening) that scatters by ' + f2(sdSw, 2) + ' (real clear air and rain: about 1) over ' + k + ' gates',
        k > 100000 && Math.abs(sdHi - Math.sqrt(0.64 + ppSd * ppSd)) < 0.008 && Math.abs(median(swv) - 1.5) < 0.08 && Math.abs(sdSw - 1.02) < 0.06);
  // spectrum width reads high where the signal is weak (an estimate of the width from noisy pulses is biased up and scattered): the median at 5 dB over the noise against the one at 20 dB over it
  const lowSw = R.scan(big, Object.assign({ x: 80000, y: 80000, elev: 0.5, dAz: 0.5, nGates: 280, seed: 7, velocity: { quant: 0, width: { storm: 1.5 }, shear: 0 } }, clean)), by = {};
  for (let a = 0; a < lowSw.nRad; a++) for (let g = 40; g < 280; g++) { const q = a * 280 + g, d = lowSw.dbz[q]; if (d !== d || lowSw.sw[q] !== lowSw.sw[q]) continue; const b = Math.round(d - nDb(g)); if (b === 5 || b === 20) (by[b] = by[b] || []).push(lowSw.sw[q]); }
  const w5 = median(by[5]), w20 = median(by[20]);
  check('the spectrum width reads ' + f2(w5, 2) + ' m/s at 5 dB over the noise (' + by[5].length + ' gates) and ' + f2(w20, 2) + ' at 20 dB (' + by[20].length + '): weak echoes are biased towards wide', by[5].length > 1000 && by[20].length > 1000 && w5 / w20 > 1.25 && w5 / w20 < 1.6 && Math.abs(w20 - 1.52) < 0.1);
}
{
  // the width of rain follows the width of the beam: an intrinsic 0.6 m/s and a shear of 0.0029 /s that the model does not resolve across a beam that is 67 m wide at 10 km and 520 m at 78 km give
  // sqrt(0.6^2 + (0.0029 s)^2) = 0.63, 0.83, 1.31 and 1.62 m/s at 10, 30, 60 and 78 km (real rain of 35-45 dBZ: 0.5, 1.0, 1.0-1.5 and 1.5, 2.5 at 120 km)
  const rainV = volw(160, 160, 40, 1000, 500, () => 40, () => [6, 3, 0, 0]), rs = R.scan(rainV, Object.assign({ x: 80000, y: 80000, elev: 0.5, dAz: 0.5, nGates: 320, seed: 7, velocity: { quant: 0 } }, clean)), rows = [];
  for (const km of [10, 30, 60, 78]) { const g = Math.round((km * 1000 - 2125) / 250), sv = SIG * (2125 + g * 250), w = []; for (let a = 0; a < rs.nRad; a++) for (let q = g - 2; q <= g + 2; q++) { const v = rs.sw[a * 320 + q]; if (v === v) w.push(v); } rows.push({ km, got: median(w), want: Math.sqrt(0.36 + Math.pow(0.0029 * sv, 2)) }); }
  check('the spectrum width of rain grows with the beam: ' + rows.map((r) => f2(r.got, 2) + ' (' + f2(r.want, 2) + ') m/s at ' + r.km + ' km').join(', ') + ' (the formula in brackets)', rows.every((r) => Math.abs(r.got - r.want) < 0.08));
}
{
  // wind that changes across the beam makes the spectrum wide: the spread of the radial velocity in the beam (weighted by power, corrected from the nine points up and the three across the beam to the Gaussian they stand for)
  // adds to the 1.5 m/s the model does not resolve: sw^2 = shear^2 + 1.5^2. Wind blowing east that grows with height by 20 m/s per km (the beam is 253 m high at 38 km): sigma = 0.02 x 253 |sin az| = 5.1 m/s;
  // wind blowing east that grows to the north by 10 m/s per km: sigma = 0.01 x 200 sin^2(az) = 2.0 m/s at 30 km
  const V1 = volw(160, 160, 40, 1000, 500, () => 40, (x, y, z) => [0.02 * z, 0, 0, 0]), a1 = 0.02, e1 = 1.5, V2 = volw(160, 160, 40, 1000, 500, () => 40, (x, y) => [0.01 * (y - 80000), 0, 0, 0]), a2 = 0.01;
  const s1 = R.scan(V1, Object.assign({ x: 80000, y: 80000, elev: e1, dAz: 0.5, nGates: 160, seed: 3, velocity: { quant: 0, nyquist: 100, width: { storm: 1.5 }, shear: 0 } }, clean)), s2 = R.scan(V2, Object.assign({ x: 80000, y: 80000, elev: 0.5, dAz: 0.5, nGates: 160, seed: 3, velocity: { quant: 0, nyquist: 100, width: { storm: 1.5 }, shear: 0 } }, clean));
  const ratio1 = [], ratio2 = [];
  for (let a = 0; a < s1.nRad; a++) { const az = azOf(s1, a), sa = Math.sin(az); for (let g = 140; g < 160; g++) { const r = 2125 + g * 250, sv = SIG * r, v = s1.sw[a * 160 + g]; if (Math.abs(sa) > 0.94 && v === v) ratio1.push(v / Math.sqrt(Math.pow(a1 * sv * Math.pow(Math.cos(e1 * D2R), 2) * Math.abs(sa), 2) + 2.25)); } }
  for (let a = 0; a < s2.nRad; a++) { const az = azOf(s2, a), sa = Math.sin(az); if (Math.abs(sa) < 0.996) continue; for (let g = 100; g < 140; g++) { const r = 2125 + g * 250, sv = SIG * r, v = s2.sw[a * 160 + g]; if (v === v) ratio2.push(v / Math.sqrt(Math.pow(a2 * sv * sa * sa * Math.cos(0.5 * D2R), 2) + 2.25)); } }
  const m1 = median(ratio1), m2 = median(ratio2), s3 = R.scan(volw(160, 160, 40, 1000, 500, () => 40, (x, y, z) => [0.5 * z, 0, 0, 0]), Object.assign({ x: 80000, y: 80000, elev: e1, dAz: 10, nGates: 160, seed: 3, velocity: { quant: 0.5, nyquist: 28 } }, clean)), cap = []; for (let a = 0; a < s3.nRad; a++) for (let g = 140; g < 160; g++) { const v = s3.sw[a * 160 + g]; if (v === v && Math.abs(Math.sin(azOf(s3, a))) > 0.5) cap.push(v); }
  check('shear in the beam widens the spectrum as the full Gaussian beam says: the width over what sqrt(shear^2 + 1.5^2) gives has a median of ' + f2(m1, 3) + ' for shear up the beam (' + ratio1.length + ' gates, 4.8 to 5.1 m/s of it) and ' + f2(m2, 3) + ' for shear across it (' + ratio2.length + ' gates, 1.9 to 2.0 m/s of it); a shear of 500 m/s per km reads ' + f2(median(cap), 1) + ' m/s, the most the data holds',
        ratio1.length > 2000 && ratio2.length > 1000 && Math.abs(m1 - 1) < 0.035 && Math.abs(m2 - 1) < 0.035 && cap.length > 100 && cap.every((v) => v === 20));
}
{
  // determinism and independence: the same seed gives the same velocities, another seed other errors, switching velocity on changes no reflectivity, and no velocity is asked for by default
  const V = volw(100, 100, 24, 1000, 500, (x, y) => 25 + 20 * Math.sin(x / 9000) * Math.cos(y / 7000), (x, y) => [10 * Math.sin(y / 20000), 8 * Math.cos(x / 15000), 2, 4]);
  const o = { x: 50000, y: 50000, elev: 0.5, dAz: 1, nGates: 200, seed: 9, velocity: true }, a = R.scan(V, o), b = R.scan(V, o), c = R.scan(V, Object.assign({}, o, { seed: 10 })), plain = R.scan(V, Object.assign({}, o, { velocity: false })), dflt = R.scan(V, Object.assign({}, o, { velocity: undefined }));
  const same = (p, q) => p.every((v, i) => Object.is(v, q[i]));
  let diff = 0, both = 0; for (let i = 0; i < a.vel.length; i++) if (a.vel[i] === a.vel[i] && c.vel[i] === c.vel[i]) { both++; if (a.vel[i] !== c.vel[i]) diff++; }
  check('a scan with velocity repeats exactly with the same seed (velocity and width), differs in ' + f2(100 * diff / both, 0) + ' % of the gates with another, leaves every reflectivity as it was without velocity, and gives no velocity unless asked (' + (plain.vel === undefined && dflt.vel === undefined && plain.sw === undefined) + ')',
        same(a.vel, b.vel) && same(a.sw, b.sw) && diff / both > 0.7 && same(a.dbz, plain.dbz) && same(a.dbz, c.dbz) === false && plain.vel === undefined && dflt.vel === undefined && plain.sw === undefined && a.nyquist === 28);
  let orphan = 0, swMis = 0, nV = 0, nZ = 0, offGrid = 0, big = 0, wid = 0, odd = 0; for (let i = 0; i < a.vel.length; i++) {
    if (a.dbz[i] === a.dbz[i]) nZ++; if (a.vel[i] === a.vel[i]) { nV++; if (a.dbz[i] !== a.dbz[i]) orphan++; if (Math.abs(a.vel[i]) > 28) big++; if (Math.abs(a.vel[i] * 2 - Math.round(a.vel[i] * 2)) > 1e-6) offGrid++; if (Math.abs(Math.round(a.vel[i] * 2)) % 2 === 1) odd++; }
    if ((a.vel[i] === a.vel[i]) !== (a.sw[i] === a.sw[i])) swMis++; if (a.sw[i] === a.sw[i] && (a.sw[i] < 0 || a.sw[i] > 20)) wid++; if (a.sw[i] === a.sw[i] && Math.abs(a.sw[i] * 2 - Math.round(a.sw[i] * 2)) > 1e-6) offGrid++;
  }
  check('a velocity is only where there is an echo (' + orphan + ' gates without), the width has data exactly where the velocity has (' + swMis + ' differ) and lies between 0 and 20 m/s (' + wid + ' outside), the velocity within +-28 (' + big + ') and both in steps of 0.5 (' + offGrid + ' off the grid, ' + f2(100 * odd / nV, 0) + ' % of the velocities on the half steps); ' + f2(100 * nV / nZ, 0) + ' % of the gates with an echo have a velocity',
        orphan === 0 && swMis === 0 && wid === 0 && big === 0 && offGrid === 0 && odd / nV > 0.3 && odd / nV < 0.7 && nV / nZ > 0.8 && nV / nZ < 1);
}
{
  // clear air: with no storm the insects and birds drift with the wind of the base state (a velocity azimuth display, the sine curve of the radial velocity around the radar): the least-squares fit gives its wind. A
  // uniform 12 m/s from the west and 4 from the south: A1 = 12 cos(e), A2 = 4 cos(e), A0 = 0; a wind that grows with height (0 at the ground to 20 m/s at 1 km) is read at the height of the beam in each ring
  const c = Math.cos(0.5 * D2R), o = { x: 0, y: 0, elev: 0.5, dAz: 1, nGates: 120, seed: 9, noise: { sparse: 0 }, clutter: { ground: 0, clearAir: 1 } };
  const f = vad(R.scan(null, Object.assign({ env: { u: 12, v: 4 }, velocity: true }, o)), 12, 92);
  check('a radar in clear air reads the wind: the fit of the velocity azimuth display to ' + f.n + ' gates (5 to 25 km out) gives ' + f2(f.A1, 2) + ' east and ' + f2(f.A2, 2) + ' north (12 and 4 times cos(e) = ' + f2(12 * c, 2) + ' and ' + f2(4 * c, 2) + ') and ' + f2(f.A0, 2) + ' of the mean', f.n > 20000 && Math.abs(f.A1 - 12 * c) < 0.1 && Math.abs(f.A2 - 4 * c) < 0.1 && Math.abs(f.A0) < 0.1);
  const prof = { z: [0, 500, 1000, 2000], u: [0, 10, 20, 30], v: [0, 0, 0, 0] }, sw = R.scan(null, Object.assign({ env: prof, velocity: true }, o)), rings = [[28, 32], [68, 72], [108, 112]].map(([g0, g1]) => ({ f: vad(sw, g0, g1), h: R.beamHeight(2125 + 0.5 * (g0 + g1) * 250, 0.5, 30) }));
  check('a wind that grows with height is read at the height of the beam: ' + rings.map((q) => f2(q.f.A1, 2) + ' m/s at ' + f2(q.h, 0) + ' m').join(', ') + ' (the profile has ' + rings.map((q) => f2(q.h / 50 * c, 2)).join(', ') + '), the other component ' + rings.map((q) => f2(q.f.A2, 2)).join(', '),
        rings.every((q) => q.f.n > 800 && Math.abs(q.f.A1 - q.h / 50 * c) < 0.15 && Math.abs(q.f.A2) < 0.15));
  // inside the volume's box the clear air moves with the model's wind, outside with the base state (the volume's own `base`)
  const box = volw(80, 80, 40, 500, 100, () => -30, () => [-10, 0, 0, 0]); box.base = { z: [0, 5000], u: [5, 5], v: [0, 0] };
  const sb = R.scan(box, Object.assign({}, o, { x: 20000, y: 20000, nGates: 150, velocity: true })), inB = vad(sb, 12, 52), outB = vad(sb, 112, 144);
  check('inside the volume\'s box the clear air moves with the model\'s wind (' + f2(inB.A1, 2) + ' m/s, the model has -10 cos(e) = ' + f2(-10 * c, 2) + '), outside it with the base state (' + f2(outB.A1, 2) + ', 5 cos(e) = ' + f2(5 * c, 2) + ')', inB.n > 4000 && outB.n > 4000 && Math.abs(inB.A1 + 10 * c) < 0.15 && Math.abs(outB.A1 - 5 * c) < 0.15);
}
{
  // ground clutter stands still (the wind carries the clear air but not the buildings and hills): with the clear air off and a wind of 20 m/s the clutter gates read 0 with no measurement error and, with the error, scatter
  // about 0 by what the signal-to-noise ratio of each gate allows; isolated targets (birds, aircraft) move at random, up to 12 m/s either way
  const o = { x: 0, y: 0, elev: 0.5, dAz: 1, nGates: 160, seed: 4, env: { u: 20, v: 0 } }, vq = { quant: 0, nyquist: 100 };
  const quiet = { clutter: { ground: 1, clearAir: 0 }, noise: { sparse: 0 } }, ex = R.scan(null, Object.assign({}, o, quiet, { velocity: Object.assign({ noise: 0 }, vq) })), cl = R.scan(null, Object.assign({}, o, quiet, { velocity: vq })), none = R.scan(null, Object.assign({}, o, { clutter: { ground: 0, clearAir: 0 }, noise: { sparse: 0 }, velocity: vq }));
  let nEx = 0, mxEx = 0, nNone = 0; for (const v of ex.vel) if (v === v) { nEx++; mxEx = Math.max(mxEx, Math.abs(v)); } for (const v of none.vel) if (v === v) nNone++;
  const cv = []; for (const v of cl.vel) if (v === v) cv.push(v); const ab = cv.map(Math.abs).sort((p, q) => p - q), mean = cv.reduce((p, q) => p + q, 0) / cv.length;
  check('ground clutter stands still in a 20 m/s wind: ' + nEx + ' gates read ' + f2(mxEx, 3) + ' m/s at most without measurement error, and with it ' + cv.length + ' gates scatter about ' + f2(mean, 2) + ' (median of the absolute value ' + f2(median(ab), 2) + ', ' + f2(100 * ab.filter((v) => v < 2).length / ab.length, 0) + ' % within 2 m/s); with no clutter, no clear air and no targets there are none (' + nNone + ')',
        nEx > 1000 && mxEx < 1e-6 && cv.length === nEx && Math.abs(mean) < 0.15 && median(ab) < 0.8 && ab.filter((v) => v < 2).length / ab.length > 0.8 && nNone === 0);
  // clutter in rain: the beam holds rain blowing away at 10 m/s (0 dBZ) and the clutter that stands still, so the velocity is the rain's, weighted by its share of the power, f = 1 - (clutter / all), and the spectrum
  // width is that of the two (variance (10 sin az cos e)^2 f (1 - f)) with their own 1.5 and 0.8 m/s: where the clutter is 15 dB stronger the velocity is nearly 0, where there is none the rain's
  const mixV = volw(160, 160, 40, 1000, 500, () => 0, () => [10, 0, 0, 0]), mx = R.scan(mixV, { x: 80000, y: 80000, elev: 0.5, dAz: 1, nGates: 60, seed: 4, noise: { sparse: 0 }, clutter: { ground: 1, clearAir: 0 }, velocity: { quant: 0, nyquist: 100, noise: 0, width: { storm: 1.5 }, shear: 0 } });
  const cE = Math.cos(0.5 * D2R), strongR = [], weakR = [], widthR = [];
  for (let a = 0; a < 360; a++) { const sa = Math.sin((a + 0.5) * D2R); if (Math.abs(sa) < 0.5) continue; const vst = 10 * cE * sa; for (let g = 0; g < 60; g++) { const q = a * 60 + g, d = mx.dbz[q], v = mx.vel[q]; if (d !== d || v !== v) continue; const r = v / vst;
    if (d > 15) strongR.push(r); else if (d < 3) weakR.push(r); if (d - nDb(g) > 12 && r > 0.03 && r < 0.97) widthR.push(mx.sw[q] / Math.sqrt(vst * vst * r * (1 - r) + 2.25 * r + 0.64 * (1 - r))); } }
  check('where the clutter is 15 dB stronger than the rain the velocity is ' + f2(median(strongR), 2) + ' of the rain\'s (' + strongR.length + ' gates), without it ' + f2(median(weakR), 3) + ' (' + weakR.length + '), and in the ' + widthR.length + ' gates that hold both the spectrum width is ' + f2(median(widthR), 3) + ' of what the two velocities and widths make (the largest ' + f2(Math.max(...widthR), 3) + ')',
        strongR.length > 100 && median(strongR) < 0.05 && Math.max(...strongR) < 0.2 && weakR.length > 5000 && Math.abs(median(weakR) - 1) < 1e-3 && widthR.length > 1000 && Math.abs(median(widthR) - 1) < 0.01 && Math.max(...widthR) < 1.09 && Math.min(...widthR) > 0.99);
  const tg = R.scan(null, Object.assign({}, o, { clutter: { ground: 0, clearAir: 0 }, noise: { sparse: 0.01 }, velocity: Object.assign({ noise: 0 }, vq) })), tv = []; for (const v of tg.vel) if (v === v) tv.push(v);
  let m = 0, s = 0; for (const v of tv) { m += v; s += v * v; } m /= tv.length; const sd = Math.sqrt(s / tv.length - m * m), mxT = Math.max(...tv.map(Math.abs));
  check('isolated targets move at random, up to 12 m/s either way: ' + tv.length + ' gates with a velocity, mean ' + f2(m, 2) + ', spread ' + f2(sd, 2) + ' m/s (a uniform spread over +-12 has 6.9), the fastest ' + f2(mxT, 2) + ' m/s', tv.length > 400 && Math.abs(m) < 1 && Math.abs(sd - 6.93) < 0.6 && mxT < 12.0001 && mxT > 11);
}
{
  // the fit to the real radar: in clear air, between the velocities of neighbouring radials of 14 real volumes (KOAX, KSGF, KTLX, the Doppler cut at 0.5 degrees, 5 to 90 km) 53 % (0 to 5 dBZ) and 59 % (5 to 10 dBZ) differ by
  // 1 m/s or less and 92 % and 94 % by 4 m/s or less; the model's clear air (the default noise) must be there too
  const sw = R.scan(null, { x: 0, y: 0, dAz: 0.5, nGates: 400, seed: 5, env: { u: 12, v: 4 }, velocity: true }), out = {};
  for (let a = 0; a < sw.nRad - 1; a++) for (let g = 20; g < 360; g++) { const q = a * 400 + g, q2 = q + 400; if (!(sw.vel[q] === sw.vel[q] && sw.vel[q2] === sw.vel[q2])) continue; const z = 0.5 * (sw.dbz[q] + sw.dbz[q2]), b = z >= 0 && z < 5 ? 0 : z >= 5 && z < 10 ? 1 : -1; if (b < 0) continue; const dv = Math.abs(sw.vel[q2] - sw.vel[q]); if (dv >= 28) continue; const o = out[b] = out[b] || [0, 0, 0]; o[0]++; if (dv <= 1.01) o[1]++; if (dv <= 4.01) o[2]++; }
  const p = (b, i) => 100 * out[b][i] / out[b][0];
  check('the clear air\'s velocity is as noisy as the real one: neighbouring radials differ by 1 m/s or less in ' + f2(p(0, 1), 0) + ' % (0 to 5 dBZ, real 53) and ' + f2(p(1, 1), 0) + ' % (5 to 10 dBZ, real 59) of the pairs, by 4 m/s or less in ' + f2(p(0, 2), 0) + ' and ' + f2(p(1, 2), 0) + ' % (real 92 and 94)',
        out[0][0] > 20000 && out[1][0] > 5000 && Math.abs(p(0, 1) - 53) < 8 && Math.abs(p(1, 1) - 59) < 8 && Math.abs(p(0, 2) - 92) < 4 && Math.abs(p(1, 2) - 94) < 4);
}
{
  // the large end: winds of 100 m/s fold into the Nyquist interval and unfold when asked, and winds that are not numbers cost the gate its velocity but never make an infinite one or stop the scan
  const strong = volw(160, 160, 40, 1000, 500, () => 40, (x, y) => [100, -80, 30, 10]), base = Object.assign({ x: 80000, y: 80000, elev: 0.5, dAz: 1, nGates: 100, seed: 5 }, clean), c = Math.cos(0.5 * D2R), truth = (az) => c * (100 * Math.sin(az) - 80 * Math.cos(az)) + 20 * Math.sin(0.5 * D2R);
  const f = R.scan(strong, Object.assign({}, base, { velocity: { quant: 0, noise: 0 } })), u = R.scan(strong, Object.assign({}, base, { velocity: { quant: 0, noise: 0, dealias: true, nyquist: 28 } })), wf = worstErr(f, (az) => foldV(truth(az), 28), 0, 100), wu = worstErr(u, truth, 0, 100);
  let mxU = 0; for (const v of u.vel) if (v === v) mxU = Math.max(mxU, Math.abs(v));
  check('winds of 100 m/s: the velocity folds into +-28 as it should (largest error ' + wf.m.toExponential(1) + ' m/s over ' + wf.k + ' gates) and unfolds to ' + f2(mxU, 1) + ' m/s at most when asked (error ' + wu.m.toExponential(1) + ')', wf.k === 360 * 100 && wf.m < 1e-3 && wu.m < 1e-3 && mxU > 120 && mxU < 129);
  const weird = volw(40, 40, 20, 1000, 500, () => 40, (x, y) => [(x + y) % 3000 < 1000 ? NaN : (x + y) % 3000 < 2000 ? Infinity : 20, (x + y) % 2000 < 700 ? -Infinity : 5, (x + y) % 5000 < 500 ? NaN : 1, 4]);
  const sw = R.scan(weird, { x: 20000, y: 20000, seed: 41, velocity: { dealias: true }, clutter: { ground: 0, clearAir: 0 } });
  let inf = 0, fin = 0; for (let i = 0; i < sw.vel.length; i++) { if (sw.vel[i] === Infinity || sw.vel[i] === -Infinity || sw.sw[i] === Infinity || sw.sw[i] === -Infinity) inf++; if (sw.vel[i] === sw.vel[i]) fin++; }
  check('a volume whose winds are NaN, +Infinity and -Infinity in places gives velocities that are numbers or no data (' + inf + ' infinite, ' + fin + ' with a value) and does not stop the scan', inf === 0 && sw.vel.length === 720 * 920 && fin > 100);
  // half the beam in winds that are not numbers: the radar reads the nodes that have a wind (10 m/s) and not no data, whether a third or two thirds of the beam is bad
  const bad = [-0.5, 0.5].map((k) => R.scan(volw(560, 30, 24, 200, 500, () => 40, (x, y) => [y > 3000 + k * SIG * 99875 ? NaN : 10, 0, 0, 0]), { x: 0, y: 3000, dAz: 180, nGates: 400, n: 4096, seed: 1, velocity: { dealias: true, quant: 0, noise: 0 }, noise: { sparse: 0, z1: -90 }, clutter: { ground: 0, clearAir: 0 } }).vel[391]);
  check('a beam with a third or two thirds of it in winds that are not numbers reads the rest: ' + f2(bad[0], 3) + ' and ' + f2(bad[1], 3) + ' m/s (the wind that is there, 10)', Math.abs(bad[0] - 10) < 1e-3 && Math.abs(bad[1] - 10) < 1e-3);
  const t1 = Date.now(), dense = volw(160, 160, 40, 1000, 500, (x, y, z) => 30 + 25 * Math.sin(x / 15000) * Math.sin(y / 11000) + 5 * Math.sin(z / 3000), (x, y, z) => [15 * Math.sin(y / 9000), 12 * Math.cos(x / 7000), 3 * Math.sin(z / 2000), 5]);
  const full = R.scan(dense, { x: 80000, y: 80000, elev: 1.5, seed: 61, velocity: true }), ms = Date.now() - t1;
  check('a full sweep of a storm 160 km across with its velocity takes ' + ms + ' ms (the winds are sampled at the same nine-by-three points as the reflectivity)', ms < 8000 && full.vel.length === 720 * 920);
}

{
  // your velocity table (rebuilt from the picture of its colour bar): 25 swatches under 19 different numbers, -224 to 224, towards the radar negative. The numbers are miles per hour: the three outermost are
  // 224, 190 and 157, which are 100, 85 and 70 m/s. Every swatch is a colour stop at its number, the colour runs in a straight line between neighbouring swatches (so the table interpolates everywhere, whatever
  // its bar looks like), and where a number has two swatches (-60, -10, 0, 10, 40, 80) it steps there: the first swatch's colour just below the number, the second swatch's from it upwards
  const SW = [[-224, 239, 230, 255], [-190, 213, 107, 255], [-157, 255, 62, 200], [-120, 255, 0, 132], [-80, 22, 2, 153], [-60, 40, 204, 220], [-60, 48, 224, 227], [-50, 182, 238, 241], [-40, 3, 250, 3], [-10, 5, 102, 3], [-10, 78, 121, 76],
               [0, 110, 132, 108], [0, 138, 118, 118], [10, 132, 56, 65], [10, 110, 0, 0], [40, 243, 0, 7], [40, 250, 55, 81], [50, 255, 140, 213], [60, 255, 232, 163], [80, 255, 149, 83], [80, 255, 138, 79], [120, 103, 6, 2], [157, 255, 36, 20], [190, 255, 176, 0], [224, 255, 241, 194]];
  const vp = P.parse(readFileSync(new URL('../data/severe/User_BV_mph.pal', import.meta.url), 'utf8')), vc = (v) => P.colorAt(vp, v).slice(0, 3), mph = P.unitScale('MPH');
  check('the velocity table is read: product ' + vp.product + ', units ' + vp.units + ', ' + vp.stops.length + ' stops (the 25 swatches of the colour bar, each with its colour and number, none a two-colour line) at ' + new Set(vp.stops.map((s) => s.v)).size + ' different numbers from ' + vp.stops[0].v + ' to ' + vp.stops[vp.stops.length - 1].v + ', and its three outermost numbers are 100, 85 and 70 m/s (' + [100, 85, 70].map((v) => f2(v * mph, 1)).join(', ') + ' mph)',
        vp.product === 'BV' && vp.units === 'MPH' && vp.stops.length === 25 && vp.stops.every((s, i) => s.v === SW[i][0] && near(s.c1.slice(0, 3), SW[i].slice(1), 0) && !s.c2 && !s.solid) && new Set(vp.stops.map((s) => s.v)).size === 19 && [100, 85, 70].map((v) => Math.round(v * mph)).join() === '224,190,157');
  // the groups of the bar: every number with the colour that arrives at it from below (its first swatch) and the one that leaves it upwards (its last)
  const G = []; for (const s of SW) { const g = G.length && G[G.length - 1].v === s[0] ? G[G.length - 1] : G[G.push({ v: s[0], first: s.slice(1), last: s.slice(1) }) - 1]; g.last = s.slice(1); }
  let atNum = 0, arrive = 0, runs = 0, worst = 0;
  for (let i = 0; i < G.length; i++) {
    if (near(vc(G[i].v), G[i].last, 0)) atNum++;                                                                 // at its number: the colour that leaves it upwards
    if (i > 0 && near(vc(G[i].v - 1e-6), G[i].first, 1)) arrive++;                                               // just below it: the colour that arrives
    if (i + 1 < G.length) for (const q of [0.1, 0.25, 0.5, 0.75, 0.9]) {                                          // between two numbers: a straight line from what leaves the first to what arrives at the next
      const c = vc(G[i].v + q * (G[i + 1].v - G[i].v)), e = lerp(G[i].last, G[i + 1].first, q); runs++; worst = Math.max(worst, ...c.map((x, k) => Math.abs(x - e[k])));
    }
  }
  const lutV = P.lut(vp, { vmin: -230, vmax: 230, step: 0.1 }), stepAt = [], jump = (i) => Math.max(...[0, 1, 2].map((k) => Math.abs(lutV.rgba[4 * i + k] - lutV.rgba[4 * i - 4 + k])));
  let smooth = 0; for (let i = lutV.index(-224) + 1; i <= lutV.index(224); i++) { const d = jump(i); if (d > 3) stepAt.push([(i - 0.5) * lutV.step + lutV.vmin, d]); else smooth = Math.max(smooth, d); }
  const pairs = G.filter((g) => g.first.join() !== g.last.join());
  check('the table interpolates everywhere: every number shows its own colour (' + atNum + ' of ' + G.length + ') and the one arriving at it from below (' + arrive + ' of ' + (G.length - 1) + '), and between neighbouring numbers the colour runs in a straight line from one swatch to the next (' + runs + ' places, the largest difference from the line ' + worst + ' of 255); in the look-up table of every 0.1 mph the largest step between neighbours is ' + smooth + ' of 255 except at the ' + stepAt.length + ' numbers with two swatches (' + stepAt.map((s) => Math.round(s[0]) + ': ' + s[1]).join(', ') + '), where it is the difference of the pair',
        atNum === G.length && arrive === G.length - 1 && runs === 5 * (G.length - 1) && worst <= 1 && smooth <= 3 && stepAt.length === 6 && pairs.length === 6 &&
        pairs.every((g) => stepAt.some((s) => Math.abs(s[0] - g.v) < 0.11 && Math.abs(s[1] - Math.max(...[0, 1, 2].map((k) => Math.abs(g.last[k] - g.first[k])))) <= 3)) && P.colorAt(vp, -225)[3] === 0 && near(vc(300), [255, 241, 194], 0));
  check('the unit of a table turns a speed in m/s into its own: miles per hour ' + f2(P.unitScale('MPH'), 5) + ', knots ' + f2(P.unitScale('KTS'), 5) + ', kilometres per hour ' + P.unitScale('km/h') + ', and 1 for m/s, dBZ and no unit (' + [P.unitScale('M/S'), P.unitScale('dBZ'), P.unitScale('')].join(', ') + ')',
        Math.abs(P.unitScale('MPH') - 2.2369363) < 1e-6 && Math.abs(P.unitScale('mph') - 2.2369363) < 1e-6 && Math.abs(P.unitScale('KTS') - 1.9438445) < 1e-6 && P.unitScale('kt') === P.unitScale('KTS') && P.unitScale('km/h') === 3.6 && P.unitScale('KPH') === 3.6 &&
        P.unitScale('M/S') === 1 && P.unitScale('dBZ') === 1 && P.unitScale('') === 1 && P.unitScale(undefined) === 1);
}

/* 5b. A nest: a finer volume inside the box (vol.nests = [{ x, y, vol }]) answers for the points it holds. A box of 500 m cells with a broad weak echo and no wind, and in it, at 20 km from the radar, a nest of
       100 m cells with a 55 dBZ core 500 m across and a cyclonic vortex of 40 m/s at 300 m from its axis (the box has neither: a 500 m cell cannot hold them). Without the nest the scan sees neither the core nor
       the couplet; with it, it sees both, and a nest with no winds shows the core and no couplet. */
{
  const box = volw(80, 80, 20, 500, 500, () => 20, () => [0, 0, 0, 0]), nxn = 40, dxn = 100, cxn = nxn * dxn / 2;
  const mkNest = (winds) => (winds ? volw : (nx, ny, nz, dx, dz, fn) => vol(nx, ny, nz, dx, dz, fn))(nxn, nxn, 100, dxn, 100, (x, y) => Math.hypot(x - cxn, y - cxn) < 250 ? 55 : 20, (x, y) => {
    const dxv = x - cxn, dyv = y - cxn, r = Math.hypot(dxv, dyv), vt = r < 300 ? 40 * r / 300 : 40 * 300 / Math.max(r, 1); return [-vt * dyv / Math.max(r, 1), vt * dxv / Math.max(r, 1), 0, 0];
  });
  const withNest = Object.assign({}, box, { nests: [{ x: 20000 - cxn, y: 20000 - cxn, vol: mkNest(true) }] }), noWinds = Object.assign({}, box, { nests: [{ x: 20000 - cxn, y: 20000 - cxn, vol: mkNest(false) }] });
  const o = Object.assign({ x: 20000, y: 0, elev: 0.5, seed: 3, velocity: true, noise: { sparse: 0, z1: -90 } }, { clutter: { ground: 0, clearAir: 0 } });
  const a = R.scan(box, o), b = R.scan(withNest, o), c = R.scan(noWinds, o), g0 = Math.round((20000 - 2125) / 250);
  const peak = (sw) => { let m = -99; for (const a_ of [718, 719, 0, 1]) for (let g = g0 - 2; g <= g0 + 2; g++) m = Math.max(m, sw.dbz[a_ * sw.nGates + g]); return m; };
  const couple = (sw) => { let lo = 99, hi = -99; for (const a_ of [717, 718, 719, 0, 1, 2]) for (let g = g0 - 2; g <= g0 + 2; g++) { const v = sw.vel[a_ * sw.nGates + g]; if (v === v) { lo = Math.min(lo, v); hi = Math.max(hi, v); } } return hi - lo; };
  check('a nest of finer cells shows what the box cannot hold: the 55 dBZ core (' + peak(b).toFixed(1) + ' dBZ at the gates beside it against ' + peak(a).toFixed(1) + ' without the nest) and the 40 m/s vortex as a couplet of ' + couple(b).toFixed(1) + ' m/s (' + couple(a).toFixed(1) + ' without it); a nest with no winds has the core (' + peak(c).toFixed(1) + ') and no couplet (' + couple(c).toFixed(1) + ')',
    peak(a) < 25 && peak(b) > 40 && peak(c) > 40 && couple(b) > 30 && couple(a) < 8 && couple(c) < 8);
  const far = R.scan(withNest, Object.assign({}, o, { y: -10000 })), near = R.scan(box, Object.assign({}, o, { y: -10000 }));
  let diff = 0; for (let q = 0; q < far.dbz.length; q++) { const x = far.dbz[q], y = near.dbz[q]; if (x === x && y === y && Math.abs(x - y) > 0.01 && Math.abs(q % far.nGates - (g0 + 40)) > 6) diff++; }
  check('away from the nest the scan is the box\'s own (' + diff + ' gates differ, in a radar ten kilometres further south, outside the nest\'s few gates)', diff === 0);
}

/* 6. The renderer: gates as blocks. */
{
  const sw = { dbz: new Float32Array(720 * 920).fill(NaN), nRad: 720, nGates: 920, dAz: 0.5, gate: 250, r0: 2125, elev: 0.5, antenna: 30 };
  const A = 180, G0 = 200;                                                                             // gates due east: radial 180 covers 90.0 to 90.5 degrees
  sw.dbz[A * 920 + G0] = 40; sw.dbz[(A + 1) * 920 + G0] = 55; sw.dbz[A * 920 + G0 + 1] = 20;
  const lut = P.lut(pal, { vmin: -40, vmax: 105, step: 0.05 }), view = { w: 400, h: 400, cx: (2125 + G0 * 250) * Math.cos(0.5 * Math.PI / 180) * Math.sin(90.25 * Math.PI / 180), cy: (2125 + G0 * 250) * Math.cos(0.5 * Math.PI / 180) * Math.cos(90.25 * Math.PI / 180), mpp: 25, bg: [11, 13, 26, 255] };
  const img = R.render(sw, lut, view), colors = new Set(); for (let i = 0; i < img.length; i += 4) colors.add(img[i] + ',' + img[i + 1] + ',' + img[i + 2]);
  let opaque = true; for (let i = 3; i < img.length; i += 4) if (img[i] !== 255) opaque = false;                 // every pixel of the picture is opaque
  const c40 = Array.from(lut.rgba.subarray(4 * lut.index(40), 4 * lut.index(40) + 3)).join(','), c55 = Array.from(lut.rgba.subarray(4 * lut.index(55), 4 * lut.index(55) + 3)).join(','), c20 = Array.from(lut.rgba.subarray(4 * lut.index(20), 4 * lut.index(20) + 3)).join(',');
  check('a picture of three gates has exactly their three colours and the background (' + colors.size + ' colours: ' + [...colors].join(' | ') + '): nothing is smoothed or blended, every pixel opaque, and the gates are blocks',
        colors.size === 4 && colors.has(c40) && colors.has(c55) && colors.has(c20) && colors.has('11,13,26') && opaque);
  const img2 = R.render(sw, lut, Object.assign({}, view, { mpp: 12.5, w: 800, h: 800 })), colors2 = new Set(); for (let i = 0; i < img2.length; i += 4) colors2.add(img2[i] + ',' + img2[i + 1] + ',' + img2[i + 2]);
  let n40 = 0, n40b = 0; for (let i = 0; i < img.length; i += 4) if (img[i] + ',' + img[i + 1] + ',' + img[i + 2] === c40) n40++; for (let i = 0; i < img2.length; i += 4) if (img2[i] + ',' + img2[i + 1] + ',' + img2[i + 2] === c40) n40b++;
  check('zooming in twice makes the blocks bigger and not smoother: the same ' + colors2.size + ' colours, and the 40 dBZ gate covers ' + n40b + ' pixels against ' + n40 + ' (about four times as many)', colors2.size === colors.size && n40 > 20 && Math.abs(n40b / n40 - 4) < 0.5);
  // the picture of a velocity or a spectrum width sweep: the same blocks in the colours of the table that is given, and a gate without a velocity is background even where it has reflectivity
  const vp = P.parse('Product: BV\nUnits: M/S\nColor: -50 0 0 255\nColor: 0 128 128 128\nColor: 50 255 0 0\n'), vlut = P.lut(vp, { vmin: -80, vmax: 80, step: 0.05 });
  const vs = Object.assign({}, sw, { vel: new Float32Array(720 * 920).fill(NaN), sw: new Float32Array(720 * 920).fill(NaN) }), key = (l, v) => Array.from(l.rgba.subarray(4 * l.index(v), 4 * l.index(v) + 3)).join(',');
  vs.vel[A * 920 + G0] = -20; vs.vel[(A + 1) * 920 + G0] = 35; vs.sw[A * 920 + G0] = 6; vs.dbz[A * 920 + G0 + 2] = 30;
  const setOf = (im) => { const s = new Set(); for (let i = 0; i < im.length; i += 4) s.add(im[i] + ',' + im[i + 1] + ',' + im[i + 2]); return s; };
  const sv = setOf(R.render(vs, vlut, Object.assign({}, view, { field: 'vel' }))), ss = setOf(R.render(vs, vlut, Object.assign({}, view, { field: 'sw' }))), sd = setOf(R.render(vs, vlut, view));
  check('a picture of the velocity shows its gates in the colours of the velocity table (-20 and 35 m/s: ' + key(vlut, -20) + ' | ' + key(vlut, 35) + ', ' + sv.size + ' colours with the background), a width picture the width (6 m/s: ' + key(vlut, 6) + ', ' + ss.size + ' colours), the default the reflectivity (' + sd.size + ' colours: 40, 55, 20 and 30 dBZ and the background), and an echo without a velocity (30 dBZ) is empty in the velocity picture',
        sv.size === 3 && sv.has(key(vlut, -20)) && sv.has(key(vlut, 35)) && sv.has('11,13,26') && ss.size === 2 && ss.has(key(vlut, 6)) && sd.size === 5 && [40, 55, 20, 30].every((v) => sd.has(key(vlut, v))) && !sv.has(key(vlut, 30)));
  const mp = P.parse(readFileSync(new URL('../data/severe/User_BV_mph.pal', import.meta.url), 'utf8')), mlut = P.lut(mp, { vmin: -230, vmax: 230, step: 0.1 }), kk = P.unitScale(mp.units);
  const sm = setOf(R.render(vs, mlut, Object.assign({}, view, { field: 'vel', scale: kk }))), s1 = setOf(R.render(vs, mlut, Object.assign({}, view, { field: 'vel' })));
  check('a velocity in m/s is drawn with a table in miles per hour by multiplying it first (' + f2(kk, 4) + '): -20 and 35 m/s take the colours of -44.7 and 78.3 mph (' + key(mlut, -20 * kk) + ' | ' + key(mlut, 35 * kk) + '), not those of -20 and 35 mph (' + key(mlut, -20) + ' | ' + key(mlut, 35) + ') that they take without it',
        sm.size === 3 && sm.has(key(mlut, -20 * kk)) && sm.has(key(mlut, 35 * kk)) && s1.size === 3 && s1.has(key(mlut, -20)) && s1.has(key(mlut, 35)) && !sm.has(key(mlut, -20)) && key(mlut, -20 * kk) !== key(mlut, -20) && key(mlut, 35 * kk) !== key(mlut, 35));
  // a ramp of velocities through the renderer: gates every 0.5 m/s (the steps of the data) from -30 to +30 m/s along one radial, drawn with the table in miles per hour. Each gate has the colour of its own speed, all
  // 121 colours are different (nothing is binned) and no two neighbouring gates differ by more than 30 in a channel (the steepest run, 24 per mph from -50 to -40, is 27 per step of the data) unless the pair is
  // across one of the table's own steps (-60, -10, 0, 10, 40, 80 mph)
  const ramp = Object.assign({}, vs, { vel: new Float32Array(720 * 920).fill(NaN) }), nRamp = 121, gM = G0 + 60, rM = (2125 + gM * 250) * Math.cos(0.5 * Math.PI / 180), azR = (A + 0.5) * 0.5 * Math.PI / 180;
  for (let q = 0; q < nRamp; q++) ramp.vel[A * 920 + G0 + q] = -30 + 0.5 * q;
  const rw = 1400, rh = 60, rimg = R.render(ramp, mlut, { w: rw, h: rh, cx: rM * Math.sin(azR), cy: rM * Math.cos(azR), mpp: 25, bg: [11, 13, 26, 255], field: 'vel', scale: kk }), cols = [], steps = [-60, -10, 0, 10, 40, 80];
  for (let q = 0; q < nRamp; q++) { const rq = (2125 + (G0 + q) * 250) * Math.cos(0.5 * Math.PI / 180), px = Math.round(rw / 2 + (rq * Math.sin(azR) - rM * Math.sin(azR)) / 25 - 0.5), py = Math.round(rh / 2 - (rq * Math.cos(azR) - rM * Math.cos(azR)) / 25 - 0.5), o = 4 * (py * rw + px); cols.push([rimg[o], rimg[o + 1], rimg[o + 2]]); }
  let right = 0, bigPairs = 0, strayPairs = 0, smoothMax = 0; for (let q = 0; q < nRamp; q++) {
    const want = Array.from(mlut.rgba.subarray(4 * mlut.index((-30 + 0.5 * q) * kk), 4 * mlut.index((-30 + 0.5 * q) * kk) + 3)); if (near(cols[q], want, 0)) right++;
    if (q > 0) { const d = Math.max(...cols[q].map((x, k) => Math.abs(x - cols[q - 1][k]))), u0 = (-30 + 0.5 * (q - 1)) * kk, u1 = (-30 + 0.5 * q) * kk; if (d > 30) { bigPairs++; if (!steps.some((s) => u0 < s && s <= u1)) strayPairs++; } else smoothMax = Math.max(smoothMax, d); }
  }
  check('a ramp of velocities from -30 to +30 m/s in steps of 0.5 through the renderer and the table in miles per hour: ' + right + ' of ' + nRamp + ' gates have the colour of their own speed, ' + new Set(cols.map((c) => c.join())).size + ' different colours, and the only neighbours that differ by more than 30 in a channel (' + bigPairs + ' pairs, ' + strayPairs + ' elsewhere; the others by ' + smoothMax + ' at most) are across the table\'s own steps',
        right === nRamp && new Set(cols.map((c) => c.join())).size === nRamp && strayPairs === 0 && bigPairs >= 4 && bigPairs <= 5);
  let ok = 0, tot = 0, seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const dense = { dbz: Float32Array.from({ length: 720 * 920 }, (_, i) => -30 + 90 * ((i * 2654435761 >>> 0) / 4294967296)), nRad: 720, nGates: 920, dAz: 0.5, gate: 250, r0: 2125, elev: 0.5 };
  const im3 = R.render(dense, lut, { w: 300, h: 300, cx: 30000, cy: 40000, mpp: 400 });
  for (let t = 0; t < 400; t++) {
    const px = Math.floor(rnd() * 300), py = Math.floor(rnd() * 300), x = 30000 + (px + 0.5 - 150) * 400, y = 40000 - (py + 0.5 - 150) * 400, r = Math.hypot(x, y) / Math.cos(0.5 * Math.PI / 180);
    let az = Math.atan2(x, y) * 180 / Math.PI; if (az < 0) az += 360;
    const a = Math.floor(az / 0.5), g = Math.floor((r - 2000) / 250), o = (py * 300 + px) * 4; tot++;
    if (r < 2000 || g >= 920) { if (im3[o] === 11 && im3[o + 1] === 13 && im3[o + 2] === 26) ok++; continue; }
    const v = dense.dbz[a * 920 + g], l = 4 * lut.index(v); if (im3[o] === lut.rgba[l] && im3[o + 1] === lut.rgba[l + 1] && im3[o + 2] === lut.rgba[l + 2]) ok++;
  }
  check('every pixel of a picture takes the colour of the gate it is in, found independently from its range and azimuth (' + ok + ' of ' + tot + ' pixels), the hole of the cone of silence and the sky beyond the last gate being background', ok === tot);
}

console.log(`\n${passed} passed, ${failed} failed (${lap()})`);
process.exit(failed ? 1 : 0);
