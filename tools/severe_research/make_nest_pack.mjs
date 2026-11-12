#!/usr/bin/env node
// Packs a nested run (wk82_nest.mjs child, with its parent's box recorded: PARENT_FRAMES=1) into the file the Severe radar page plays (src/severe-pack.js), a pack of version 2, "HFP2": one gzip stream of
// [32-bit header length][header JSON][frames]. A frame is the box's five byte arrays (reflectivity Int8 in dBZ, the fall speed Uint8 in 0.25 m/s, u v w Int8 in 0.5 m/s, nz*ny*nx cells each, as
// in make_pack.mjs) and then the five arrays of the nest (its own grid, its own wind step: 0.5 m/s, or 1 m/s when a wind of the run passes 63.5 m/s). The header says where the nest lies in the box at each
// frame (`fn`), the byte offset of every frame (`offsets`) and the grids (`nests`), see the head of src/severe-pack.js.
//   node tools/severe_research/make_nest_pack.mjs <child.json> <out.hfp> [spec="all"] ["name"]
// spec: windows `from-to:every` in model minutes (since the storm's start), comma-separated, as in make_pack.mjs; "all" keeps every frame the run recorded. Settings (environment):
//   SITE=KVNX (the radar the page starts with: an id of data/generated/severe-sites.json)  AT=85:-30:25 (minute:east km:north km, where the strongest updraft of the box is that minute, from the radar; it fixes
//   where the box lies on the ground: the radar stays and the box, which moves with the storm, goes by)  CLOCK=15:00 (the local time at model minute 0)  TZ=CDT
import { readFileSync, createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { once } from 'node:events';

const [runPath, outPath, spec = 'all', aName] = process.argv.slice(2);
if (!runPath || !outPath) { console.error('usage: make_nest_pack.mjs <child.json> <out.hfp> [spec="all"] [name]'); process.exit(1); }
const run = JSON.parse(readFileSync(runPath, 'utf8')), base = runPath.replace(/\.json$/, ''), PR = run.parent;
if (!PR) { console.error('the run has no parent frames (wk82_nest.mjs child with PARENT_FRAMES=1, the default)'); process.exit(1); }
const SITES = JSON.parse(readFileSync(new URL('../../data/generated/severe-sites.json', import.meta.url), 'utf8'));
const siteId = process.env.SITE || 'KVNX', site = SITES[siteId];                          // { id: [lat, lon, elevation m] }
if (!site) { console.error('no site ' + siteId + ' in the table'); process.exit(1); }

const minutes = run.times.map((t) => run.startMinute + t / 60);
const wins = spec === 'all' ? null : spec.split(',').map((w) => { const m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(w.trim()); if (!m) { console.error('bad window "' + w + '" (from-to:every)'); process.exit(1); } return [+m[1], +m[2], +m[3]]; });
const keep = minutes.map((t, i) => [t, i]).filter(([t]) => !wins || wins.some(([a, b, e]) => t >= a - 1e-6 && t <= b + 1e-6 && Math.abs((t - a) / e - Math.round((t - a) / e)) < 1e-6));
if (!keep.length) { console.error('no frame in "' + spec + '"; the run has ' + minutes.map((t) => t.toFixed(2)).join(',')); process.exit(1); }

const bn = PR.nx * PR.ny * PR.nz, cn = run.nx * run.ny * run.nz, rd = (f) => readFileSync(base + f);
const pdbz = rd('.pdbz.i8'), pvz = rd('.pvz.u8'), pu = rd('.puvw.i16'), cdbz = rd('.cdbz.i8'), cvz = rd('.cvz.u8'), cu = rd('.cuvw.i16');
const i16 = (b) => new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), PU = i16(pu), CU = i16(cu);
let cmax = 0; for (const [, fi] of keep) for (let q = 0; q < 3 * cn; q++) cmax = Math.max(cmax, Math.abs(CU[fi * 3 * cn + q]) * 0.01);
const WBOX = 0.5, WNEST = cmax > 63.5 ? 1 : 0.5;                                          // a wind step that holds the strongest wind of the nest (Int8: 127 steps)

// where the box lies on the ground: the radar (the site) is the point; at the minute of AT the strongest updraft of the box is at (east, north) km from it
const [atMin, atE, atN] = process.env.AT ? process.env.AT.split(':').map(Number) : [];
const mot = run.motion;
let origin;
{
  const m = isFinite(atMin) ? atMin : keep[Math.floor(keep.length / 2)][0];                  // the middle of the kept frames unless AT says
  let near = keep[0][1], dn = 1e9; keep.forEach(([t, i]) => { if (Math.abs(t - m) < dn) { dn = Math.abs(t - m); near = i; } });
  const tr = PR.track[near], e = isFinite(atE) ? atE : -30, nn = isFinite(atN) ? atN : 25, tm = minutes[near];
  origin = [Math.round(e * 1000 - tr[0] - mot.u * 60 * tm), Math.round(nn * 1000 - tr[1] - mot.v * 60 * tm)];            // the box's south-west corner at model minute 0, from the site (P.corner(t) = origin + motion * 60 * t)
}

const times = [], track = [], fn = [], offsets = [], blockLen = 5 * bn + 5 * cn; let clipped = 0, at = 0;
keep.forEach(([t, fi]) => { times.push(+t.toFixed(4)); track.push(PR.track[fi]); fn.push([[0, run.corners[fi][0], run.corners[fi][1]]]); offsets.push(at); at += blockLen; });
offsets.push(at);
const header = {
  v: 2, name: aName || ('Weisman-Klemp supercell, ' + PR.dx + ' m with a ' + run.dx + ' m nest'), nx: PR.nx, ny: PR.ny, nz: PR.nz, dx: PR.dx, dz: PR.dz, floor: -30, times, motion: mot, base: PR.base, track,
  scale: { wind: WBOX, vz: 0.25 },
  nests: [{ nx: run.nx, ny: run.ny, nz: run.nz, dx: run.dx, dz: run.dz, scale: { wind: WNEST, vz: run.vz.scale }, frame: run.frame }], fn, offsets,
  scenario: { lat0: site[0], lon0: site[1], origin, radar: siteId, clock: process.env.CLOCK || '15:00', tz: process.env.TZ || 'CDT' },
};

const q8 = (v, step) => { let q = Math.round(v / step); if (q > 127) { q = 127; clipped++; } else if (q < -127) { q = -127; clipped++; } return q; };
const block = (dbz, vz, uvw, fi, n, step) => {                                           // one frame of one grid as the pack's five arrays
  const b = Buffer.alloc(5 * n); b.set(dbz.subarray(fi * n, (fi + 1) * n), 0); b.set(vz.subarray(fi * n, (fi + 1) * n), n);
  for (let c = 0; c < 3; c++) for (let i = 0; i < n; i++) b.writeInt8(q8(uvw[(fi * 3 + c) * n + i] * 0.01, step), (2 + c) * n + i);
  return b;
};

const head = Buffer.from(JSON.stringify(header)), len = Buffer.alloc(4); len.writeUInt32LE(head.length);
const out = createWriteStream(outPath), gz = createGzip({ level: 9 }); gz.pipe(out); out.write('HFP2');
let packed = 0; gz.on('data', (d) => { packed += d.length; });
const put = (b) => new Promise((res, rej) => gz.write(b, (e) => (e ? rej(e) : res())));
await put(len); await put(head);
for (const [, fi] of keep) { await put(block(pdbz, pvz, PU, fi, bn, WBOX)); await put(block(cdbz, cvz, CU, fi, cn, WNEST)); }
gz.end(); await once(out, 'close');
console.log(`${keep.length} frames (${times[0].toFixed(2)} to ${times[times.length - 1].toFixed(2)} min) of a ${PR.nx}x${PR.ny}x${PR.nz} box of ${PR.dx} m and a ${run.nx}x${run.ny}x${run.nz} nest of ${run.dx} x ${run.dz} m: ${(at / 1e6).toFixed(0)} MB raw, ${((packed + 4) / 1e6).toFixed(1)} MB packed, wind step ${WNEST} m/s in the nest (strongest ${cmax.toFixed(0)} m/s), ${clipped} values clamped; the box's origin ${origin.join(',')} m from ${siteId} -> ${outPath}`);
