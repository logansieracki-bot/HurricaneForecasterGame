// The rotation a radar sees in a recorded storm: for radars on a ring around a point (where the storm turns most: the log's `cores` or the vertical vorticity of the winds), the largest rotational velocity
// Vrot = (v right of a radial - v left of it) / 2 over a separation of 2.5 km, in the gates within 12 km of that point, at each tilt asked for. A scan without measurement error (the
// couplet itself), no clutter, no clear air. The couplet of a cyclone has the outbound velocity on the right of the inbound one, looking along the beam.
//   node tools/severe_research/radar_vrot.mjs <run.json> <minute> <cx,cy> [dist=40] [elevs=0.5,1.8,3.1,4,5.1] [step=90]
//   cx,cy: the point, km from the box's south-west corner at that minute. dist: km from the point to the radars. step: degrees between the radars on the ring.
import '../../src/severe-radar.js';
import { loadFrame } from './frames.mjs';
import { readFileSync } from 'node:fs';

const [runPath, minute, centre, ...kv] = process.argv.slice(2), opt = Object.fromEntries(kv.map((s) => s.split('='))), R = globalThis.HFSevereRadar;
const run = JSON.parse(readFileSync(runPath, 'utf8')), vol = loadFrame(run, runPath, +minute), [cx, cy] = centre.split(',').map(Number), dist = +(opt.dist || 40), step = +(opt.step || 90);
const elevs = (opt.elevs || '0.5,1.8,3.1,4,5.1').split(',').map(Number), nG = 240, DEG = Math.PI / 180;
const rows = [];
for (let az = 0; az < 360; az += step) for (const elev of elevs) {
  const rx = cx + dist * Math.sin(az * DEG), ry = cy + dist * Math.cos(az * DEG);
  const sw = R.scan(vol, { x: rx * 1000, y: ry * 1000, elev, seed: 3, n: 1, nGates: nG, clutter: { ground: 0, clearAir: 0 }, noise: { sparse: 0 }, velocity: { noise: 0, nyquist: 1000, quant: 0 } });
  let best = 0, bg = 0;
  for (let g = 0; g < nG; g++) {
    const r = 2125 + g * 250, k = Math.max(1, Math.round(2500 / (r * sw.dAz * DEG)));
    for (let a = 0; a < sw.nRad; a++) {
      const v1 = sw.vel[a * nG + g], v2 = sw.vel[((a + k) % sw.nRad) * nG + g]; if (!(v1 === v1 && v2 === v2)) continue;
      const x = rx + R.groundRange(r, elev, 30) * Math.sin((a + 0.5) * sw.dAz * DEG) / 1000, y = ry + R.groundRange(r, elev, 30) * Math.cos((a + 0.5) * sw.dAz * DEG) / 1000;
      if (Math.hypot(x - cx, y - cy) > 12) continue;
      const d = (v2 - v1) / 2; if (d > best) { best = d; bg = g; }
    }
  }
  rows.push({ az, elev, vrot: best, range: (2125 + bg * 250) / 1000, height: R.beamHeight(2125 + bg * 250, elev, 30) / 1000 });
}
rows.sort((p, q) => q.vrot - p.vrot);
for (const r of rows.slice(0, 8)) console.log('radar ' + dist + ' km from the point at ' + r.az + ' deg, tilt ' + r.elev + ': Vrot ' + r.vrot.toFixed(1) + ' m/s at ' + r.range.toFixed(0) + ' km (beam ' + r.height.toFixed(1) + ' km up)');
