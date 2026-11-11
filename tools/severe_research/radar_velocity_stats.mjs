// The model's side of nexrad_velocity_stats.py: the same statistics of the simulated radar's velocity, in the same JSON (docs/severe-research.md, part 5). Clear air: the default clear air (no storm,
// a uniform wind) of three seeds out to 100 km. Rain: a recorded storm seen from radars on and around its box at the minutes asked for, 35-45 dBZ, 5-90 km.
//   node tools/severe_research/radar_velocity_stats.mjs <run.json> <out.json> [minutes=60,75,90] [radars=19,59:64,14:109,59:64,104:53,58:65,47:75,59:32,40]
// radars: places in km from the box's south-west corner, as x,y pairs separated by colons. FS=<m/s> in the environment sets the white fluctuation of the rain's velocity (a fit to the real shares).
import '../../src/severe-radar.js';
import { loadFrame } from './frames.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const R = globalThis.HFSevereRadar, [runPath, outPath, ...kv] = process.argv.slice(2), opt = Object.fromEntries(kv.map((s) => s.split('=')));
const pct = (a, p) => { const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
const shares = (d) => [0, 0.5, 1, 2, 4].map((t) => 100 * d.filter((x) => x <= t + 0.01).length / d.length);
const out = { valid: {}, clear: {}, precip: {} };
// clear air (the default clear air, no storm): 3 seeds, 400 gates (100 km)
const dvs = {}, sws = {}, vcount = {}; for (let b = 0; b < 100; b += 20) vcount[b] = [0, 0];
for (const seed of [5, 6, 7]) {
  const sw = R.scan(null, { seed, nGates: 400, env: { u: 12, v: 4 }, velocity: true }), nG = sw.nGates, nR = sw.nRad;
  for (let a = 0; a < nR; a++) for (let g = 0; g < nG; g++) {
    const km = (sw.r0 + g * sw.gate) / 1000, q = a * nG + g, b = Math.floor(km / 20) * 20;
    if (b < 100 && sw.dbz[q] === sw.dbz[q]) { vcount[b][0]++; if (sw.vel[q] === sw.vel[q]) vcount[b][1]++; }
    if (km < 5 || km >= 90 || sw.sw[q] !== sw.sw[q]) continue;
    const z = sw.dbz[q], zb = Math.floor(z / 5) * 5; if (zb < -10 || zb >= 15) continue; (sws[zb] = sws[zb] || []).push(sw.sw[q]);
    if (a < nR - 1) { const q2 = q + nG; if (sw.vel[q2] === sw.vel[q2]) { const dv = Math.abs(sw.vel[q2] - sw.vel[q]); if (dv < 28) { const zz = Math.floor(0.5 * (z + sw.dbz[q2]) / 5) * 5; if (zz >= -10 && zz < 15) (dvs[zz] = dvs[zz] || []).push(dv); } } }
  }
}
for (const b in vcount) out.valid[b] = 100 * vcount[b][1] / vcount[b][0];
for (const z of Object.keys(dvs).map(Number)) out.clear[z] = { n: dvs[z].length, dv: shares(dvs[z]), sw: [10, 50, 90].map((p) => pct(sws[z] || [0], p)) };
// precipitation: the 1 km storm at 40 km from its mesocyclone, 0.5 degrees, Z of 35-45 dBZ, 20-90 km
const run = JSON.parse(readFileSync(runPath, 'utf8'));
const pd = [], ps = [], redges = [5, 20, 40, 60, 90], rsw = redges.map(() => []);
for (const minute of (opt.minutes || '60,75,90').split(',').map(Number)) { const vol = loadFrame(run, runPath, minute); for (const [rx, ry] of (opt.radars || '19,59:64,14:109,59:64,104:53,58:65,47:75,59:32,40').split(':').map((s) => s.split(',').map(Number))) {
  const sw = R.scan(vol, { x: rx * 1000, y: ry * 1000, seed: 3, nGates: 400, velocity: process.env.FS ? { fine: { storm: +process.env.FS } } : true }), nG = sw.nGates;
  for (let a = 0; a < sw.nRad - 1; a++) for (let g = 0; g < nG; g++) { const km = (sw.r0 + g * sw.gate) / 1000; if (km < 5 || km >= 90) continue; const q = a * nG + g, q2 = q + nG, z = 0.5 * (sw.dbz[q] + sw.dbz[q2]);
    if (z >= 35 && z < 45 && sw.sw[q] === sw.sw[q]) { let e = 0; while (e < 3 && km >= redges[e + 1]) e++; rsw[e].push(sw.sw[q]); }
    if (!(z >= 35 && z < 45) || !(sw.vel[q] === sw.vel[q] && sw.vel[q2] === sw.vel[q2])) continue; const dv = Math.abs(sw.vel[q2] - sw.vel[q]); if (dv < 28) { pd.push(dv); ps.push(sw.sw[q]); } } } }
out.precip = { n: pd.length, dv: shares(pd), sw: [10, 50, 90].map((p) => pct(ps, p)) };
out.precip_sw_range = { edges: redges, p: rsw.map((a) => a.length > 30 ? [10, 50, 90].map((p) => pct(a, p)) : null), n: rsw.map((a) => a.length) };
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log('wrote ' + outPath + ': rain shares ' + JSON.stringify(out.precip.dv.map((v) => +v.toFixed(1))) + ', width ' + JSON.stringify(out.precip.sw));
