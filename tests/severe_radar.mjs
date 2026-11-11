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
