#!/usr/bin/env node
// Packs a recorded storm run (wk82_run.mjs: <run>.json, .dbz3d.i8, .wind3d.i16, .vz3d.u8) into the file the Severe radar page plays (src/severe-pack.js): "HFP1" and then
// one gzip stream of  [32-bit header length][header JSON][frames], every frame being five byte arrays of nz*ny*nx cells in this order:
//   dbz  Int8   the model's reflectivity, dBZ rounded, `floor` (-30) for none
//   vz   Uint8  the reflectivity-weighted fall speed of the precipitation, 0.25 m/s steps, downwards
//   u v w Int8  the model's winds (in the frame that moves with the storm), 0.5 m/s steps (a clamp at 63.5 m/s)
// The header has the grid, the frame times (model minutes), the box's motion over the ground, the base-state winds, the track of the strongest updraft at 5 km (box metres, per frame)
// and the scenario: where the box lies on the ground (a point of the earth and the offset of the box's south-west corner at the first frame from it), the clock at the first frame and
// the radar that the page starts with.
// The frames are chosen by a spec of windows, `from-to:every` in model minutes, comma-separated: "0-45:5,46-80:1,85-90:5" keeps a frame every 5 minutes up to 45, every minute from 46 to 80 and
// every 5 minutes after (the run has to have recorded them: wk82_run.mjs ... frameMinutes=1).
//   node tools/severe_research/make_pack.mjs <run.json> <out.hfp> [spec="0-90:5"] ["name"]
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const [runPath, outPath, spec = '0-90:5', aName] = process.argv.slice(2);
if (!runPath || !outPath) { console.error('usage: make_pack.mjs <run.json> <out.hfp> [spec="0-90:5"] [name]'); process.exit(1); }
const wins = spec.split(',').map((w) => { const m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(w.trim()); if (!m) { console.error('bad window "' + w + '" (from-to:every)'); process.exit(1); } return [+m[1], +m[2], +m[3]]; });
const run = JSON.parse(readFileSync(runPath, 'utf8')), dir = runPath.replace(/[^/]*$/, ''), { nx, ny, nz } = run, per = nx * ny * nz;
const dbz = readFileSync(dir + run.dbz3d.file), vz = readFileSync(dir + run.vz3d.file), wb = readFileSync(dir + run.wind3d.file);
const wind = new Int16Array(wb.buffer.slice(wb.byteOffset, wb.byteOffset + wb.byteLength)), ws = run.wind3d.scale, STEP = 0.5;
const frames = run.dbz3d.times.map((t, i) => [t, i]).filter(([t]) => wins.some(([a, b, e]) => t >= a - 1e-9 && t <= b + 1e-9 && Math.abs((t - a) / e - Math.round((t - a) / e)) < 1e-9));
if (!frames.length) { console.error('no frame in "' + spec + '"; the run has', run.dbz3d.times.join(',')); process.exit(1); }

const body = Buffer.alloc(frames.length * 5 * per), track = [], times = []; let clipped = 0;
frames.forEach(([t, fi], n) => {
  const o = n * 5 * per; body.set(dbz.subarray(fi * per, (fi + 1) * per), o); body.set(vz.subarray(fi * per, (fi + 1) * per), o + per);
  for (let c = 0; c < 3; c++) for (let i = 0; i < per; i++) {
    let q = Math.round(wind[(fi * 3 + c) * per + i] * ws / STEP); if (q > 127) { q = 127; clipped++; } else if (q < -127) { q = -127; clipped++; }
    body.writeInt8(q, o + (2 + c) * per + i);
  }
  let best = -1e9, bx = 0, by = 0; const wo = (fi * 3 + 2) * per + 10 * ny * nx;                    // the strongest updraft at 5.25 km
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const w = wind[wo + j * nx + i] * ws; if (w > best) { best = w; bx = i; by = j; } }
  track.push([Math.round((bx + 0.5) * run.dx), Math.round((by + 0.5) * run.dx), +best.toFixed(1)]); times.push(t);
});
const header = {
  v: 1, name: aName || 'Weisman-Klemp supercell, 1 km', nx, ny, nz, dx: run.dx, dz: run.dz, floor: -30, times, motion: run.motion, base: run.base, track,
  scale: { wind: STEP, vz: run.vz3d.scale },
  // the box on the ground: the plane of the azimuthal equidistant projection about (lat0, lon0) (KVNX, Vance AFB, near Enid, OK); the box's south-west corner at the first frame is at `origin`
  // (metres east and north of that point), and the box moves with `motion`; the strongest updraft of the run (box 42 km, 42 km at 15 minutes, then east and a little north) passes 28 km
  // north of the point at 90 minutes, coming from the west-north-west. The clock is local time at the first frame.
  scenario: { lat0: 36.7408, lon0: -98.1279, origin: [-110000, -35000], radar: 'KVNX', clock: '15:00', tz: 'CDT' },
};
const head = Buffer.from(JSON.stringify(header)), len = Buffer.alloc(4); len.writeUInt32LE(head.length);
const packed = gzipSync(Buffer.concat([len, head, body]), { level: 9 });
writeFileSync(outPath, Buffer.concat([Buffer.from('HFP1'), packed]));
console.log(`${frames.length} frames (${times[0]} to ${times[times.length - 1]} min: ${spec}) of ${nx}x${ny}x${nz}: ${(body.length / 1e6).toFixed(1)} MB raw, ${((packed.length + 4) / 1e6).toFixed(2)} MB packed, ${clipped} wind values clamped -> ${outPath}`);
