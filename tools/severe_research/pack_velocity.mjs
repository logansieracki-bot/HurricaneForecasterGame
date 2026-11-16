// pack_velocity.mjs <pack.hfp> <frame (an index, or m80 for the frame nearest to minute 80)> ... [dist=60 az=225 elev=0.5 ground=1 clear=1]: the radial velocities that a frame of a storm pack shows to the radar (the operator as the page
// scans it: 16 samples, the box's edge faded, the true velocity, not folded), in mph, split into the storm's gates (30 dBZ or more), the rest of the echo beyond 20 km (clear air) and the gates within 12 km of the radar (clutter), as
// median, 90th and 99th percentile and maximum. The radar is `dist` km from the strongest updraft towards the bearing `az` (degrees from north: 225 is the south-west). docs/severe-research.md part 8 ("The recorded storms, read the same way"):
// "severe is 60 mph".
//   node tools/severe_research/pack_velocity.mjs data/severe/packs/outbreak-500m.hfp m80
import '../../src/severe-geo.js';
import '../../src/severe-pack.js';
import '../../src/severe-radar.js';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const [src, ...args] = process.argv.slice(2), opt = Object.fromEntries(args.filter((s) => s.includes('=')).map((s) => s.split('='))), frames = args.filter((s) => !s.includes('='));
if (!src || !frames.length) { console.error('usage: pack_velocity.mjs <pack.hfp> <frame ...> [dist=60 az=225 elev=0.5 ground=1 clear=1]'); process.exit(1); }
const R = globalThis.HFSevereRadar, raw = readFileSync(src), body = gunzipSync(raw.subarray(4)), P = globalThis.HFSeverePack.fromBody(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
const idxOf = (f) => (/^m/.test(f) ? P.times.reduce((b, t, k) => (Math.abs(t - +f.slice(1)) < Math.abs(P.times[b] - +f.slice(1)) ? k : b), 0) : +f), MPH = 2.23694;
const q = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN), fmt = (a) => a.length + ' gates: median ' + q(a, 0.5).toFixed(0) + ', p90 ' + q(a, 0.9).toFixed(0) + ', p99 ' + q(a, 0.99).toFixed(0) + ', max ' + (a.length ? a[a.length - 1].toFixed(0) : '-') + ' mph';
for (const f of frames) {
  const fi = idxOf(f), tr = P.track[fi], d = +(opt.dist || 60) * 1000, ang = +(opt.az || 225) * Math.PI / 180, rx = tr[0] + d * Math.sin(ang), ry = tr[1] + d * Math.cos(ang), vol = P.volume(fi);
  const sw = R.scan(vol, { x: rx, y: ry, elev: +(opt.elev || 0.5), seed: 1, n: 16, edge: 10000, dealias: true, clutter: { ground: +(opt.ground ?? 1), clearAir: +(opt.clear ?? 1) }, velocity: { nyquist: 28, dealias: true } });
  const storm = [], other = [], near = [];
  for (let a = 0; a < sw.nRad; a++) for (let g = 0; g < sw.nGates; g++) {
    const k = a * sw.nGates + g, v = sw.vel[k], z = sw.dbz[k]; if (!(v === v) || !(z === z)) continue;
    const km = (sw.r0 + g * sw.gate) / 1000, av = Math.abs(v) * MPH;
    if (z >= 30) storm.push(av); else if (z >= 0 && km > 20) other.push(av); if (z >= -20 && km < 12) near.push(av);
  }
  for (const a of [storm, other, near]) a.sort((p, r) => p - r);
  console.log(src.replace(/.*\//, '') + ' frame ' + fi + ' (minute ' + P.times[fi] + '), the radar ' + d / 1000 + ' km from the strongest updraft towards ' + (opt.az || 225) + ' degrees:\n  storm gates (30 dBZ or more) |V|: ' + fmt(storm) + '\n  other echo (0 dBZ or more, beyond 20 km): ' + fmt(other) + '\n  within 12 km of the radar: ' + fmt(near));
}
