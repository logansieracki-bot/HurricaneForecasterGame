#!/usr/bin/env node
// Packs a nested run (wk82_nest.mjs child, with its parent's box recorded: PARENT_FRAMES=1) into the file the Severe radar page plays (src/severe-pack.js), a pack of version 2, "HFP2": one gzip stream of
// [32-bit header length][header JSON][frames]. A frame is the box's five byte arrays (reflectivity Int8 in dBZ, the fall speed Uint8 in 0.25 m/s, u v w Int8 in 0.5 m/s, nz*ny*nx cells each, as
// in make_pack.mjs) and then the five arrays of the nest (its own grid, its own wind step: 0.5 m/s, or 1 m/s when a wind of the run passes 63.5 m/s). The header says where the nest lies in the box at each
// frame (`fn`), the byte offset of every frame (`offsets`) and the grids (`nests`), see the head of src/severe-pack.js.
//   node tools/severe_research/make_nest_pack.mjs <child.json> <out.hfp> [spec="all"] ["name"]
// spec: windows `from-to:every` in model minutes (since the storm's start), comma-separated, as in make_pack.mjs; "all" keeps every frame the run recorded. Settings (environment):
//   SITE=KVNX (the radar the page starts with: an id of data/generated/severe-sites.json)  AT=85:-30:25 (minute:east km:north km, where the strongest updraft of the box is that minute, from the radar; it fixes
//   where the box lies on the ground: the radar stays and the box, which moves with the storm, goes by; ON=x,y km of the box instead of the updraft: the vortex, say, when another cell has the strongest updraft)  CLOCK=15:00 (the local time at model minute 0)  TZ=CDT
// What a pack holds can be cut down (a pack of the whole 168 x 168 x 40 box of the 500 m storm is 0.74 MB a frame; the storm and the radar's view of it need a part): BOX=x0,x1,y0,y1 (km of the box, outwards to whole cells: the window of
// the box that is kept; the nest has to lie inside it in every kept frame), ZTOP=16 (km: the box's levels up to there), NEST_ZTOP=6 (km: the nest's levels up to there; above it the radar falls back to the box), SNAP=0.5 (minutes: the frames'
// times are rounded to a multiple of it, so that the page's frame chips (1, 3, 5 and 10 minutes) find them; a run's frames are a parent step apart, 28 and 32 s for 30 s). AT and ON are in the whole box's coordinates, as before.
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

const die = (m) => { console.error(m); process.exit(1); };
const num = (name) => { const v = Number(process.env[name]); if (!(v > 0)) die(name + ' is a number above 0 (' + process.env[name] + ')'); return v; };
let bi0 = 0, bi1 = PR.nx, bj0 = 0, bj1 = PR.ny;                                            // the window of the box that is kept, in cells
if (process.env.BOX) {
  const b = process.env.BOX.split(',').map(Number); if (b.length !== 4 || b.some((v) => !isFinite(v))) die('BOX is x0,x1,y0,y1 in km of the box (' + process.env.BOX + ')');
  bi0 = Math.max(0, Math.floor(b[0] * 1000 / PR.dx + 1e-9)); bi1 = Math.min(PR.nx, Math.ceil(b[1] * 1000 / PR.dx - 1e-9)); bj0 = Math.max(0, Math.floor(b[2] * 1000 / PR.dx + 1e-9)); bj1 = Math.min(PR.ny, Math.ceil(b[3] * 1000 / PR.dx - 1e-9));
  if (!(bi1 > bi0 && bj1 > bj0)) die('BOX ' + process.env.BOX + ' holds no cell of the ' + PR.nx * PR.dx / 1000 + ' km box');
}
const bnz = process.env.ZTOP ? Math.min(PR.nz, Math.ceil(num('ZTOP') * 1000 / PR.dz - 1e-9)) : PR.nz, cnz = process.env.NEST_ZTOP ? Math.min(run.nz, Math.ceil(num('NEST_ZTOP') * 1000 / run.dz - 1e-9)) : run.nz;
const SNAP = process.env.SNAP ? num('SNAP') : 0;
const BW = { i0: bi0, i1: bi1, j0: bj0, j1: bj1, nz: bnz }, CW = { i0: 0, i1: run.nx, j0: 0, j1: run.ny, nz: cnz };           // (the windows of the two grids)
const wn = (w) => (w.i1 - w.i0) * (w.j1 - w.j0) * w.nz, cn = run.nx * run.ny * run.nz, rd = (f) => readFileSync(base + f);
const pdbz = rd('.pdbz.i8'), pvz = rd('.pvz.u8'), pu = rd('.puvw.i16'), cdbz = rd('.cdbz.i8'), cvz = rd('.cvz.u8'), cu = rd('.cuvw.i16');
const i16 = (b) => new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), PU = i16(pu), CU = i16(cu);
let cmax = 0; for (const [, fi] of keep) for (let c = 0; c < 3; c++) for (let k = 0; k < CW.nz; k++) for (let q = 0; q < run.nx * run.ny; q++) cmax = Math.max(cmax, Math.abs(CU[(fi * 3 + c) * cn + k * run.nx * run.ny + q]) * 0.01);
const WBOX = 0.5, WNEST = cmax > 63.5 ? 1 : 0.5;                                          // a wind step that holds the strongest wind of the nest (Int8: 127 steps)

// where the box lies on the ground: the radar (the site) is the point; at the minute of AT the strongest updraft of the box is at (east, north) km from it
const [atMin, atE, atN] = process.env.AT ? process.env.AT.split(':').map(Number) : [];
const mot = run.motion, ON = process.env.ON ? process.env.ON.split(',').map(Number) : null;               // ON=x,y (km): the point of the box that AT places (where it is at the minute of the nearest frame), instead of the strongest updraft
let origin;
{
  const m = isFinite(atMin) ? atMin : keep[Math.floor(keep.length / 2)][0];                  // the middle of the kept frames unless AT says
  let near = keep[0][1], dn = 1e9; keep.forEach(([t, i]) => { if (Math.abs(t - m) < dn) { dn = Math.abs(t - m); near = i; } });
  const tr = ON ? [ON[0] * 1000, ON[1] * 1000] : PR.track[near], e = isFinite(atE) ? atE : -30, nn = isFinite(atN) ? atN : 25, tm = minutes[near];
  origin = [Math.round(e * 1000 - tr[0] - mot.u * 60 * tm), Math.round(nn * 1000 - tr[1] - mot.v * 60 * tm)];            // the box's south-west corner at model minute 0, from the site (P.corner(t) = origin + motion * 60 * t)
}

origin = [origin[0] + bi0 * PR.dx, origin[1] + bj0 * PR.dx];                               // the kept window's south-west corner (the radar's place is the same, the box's corner moves)
const times = [], track = [], fn = [], offsets = [], blockLen = 5 * wn(BW) + 5 * wn(CW), bw = (bi1 - bi0) * PR.dx, bh = (bj1 - bj0) * PR.dx; let clipped = 0, at = 0;
keep.forEach(([t, fi]) => {
  const cx = run.corners[fi][0] - bi0 * PR.dx, cy = run.corners[fi][1] - bj0 * PR.dx;
  if (cx < -1e-6 || cy < -1e-6 || cx + run.nx * run.dx > bw + 1e-6 || cy + run.ny * run.dx > bh + 1e-6) die('the nest leaves the kept window of the box at minute ' + t.toFixed(2) + ' (at ' + (cx / 1000).toFixed(1) + ', ' + (cy / 1000).toFixed(1) + ' km of it, ' + (run.nx * run.dx / 1000) + ' km across; the window is ' + bw / 1000 + ' x ' + bh / 1000 + ' km)');
  times.push(+(SNAP ? Math.round(t / SNAP) * SNAP : t).toFixed(4)); track.push([PR.track[fi][0] - bi0 * PR.dx, PR.track[fi][1] - bj0 * PR.dx].concat(PR.track[fi].slice(2))); fn.push([[0, cx, cy]]); offsets.push(at); at += blockLen;
});
for (let i = 1; i < times.length; i++) if (!(times[i] > times[i - 1])) die('SNAP=' + SNAP + ' puts two frames at minute ' + times[i] + ': a larger SNAP than the frames are apart');
offsets.push(at);
const header = {
  v: 2, name: aName || ('Weisman-Klemp supercell, ' + PR.dx + ' m with a ' + run.dx + ' m nest'), nx: bi1 - bi0, ny: bj1 - bj0, nz: bnz, dx: PR.dx, dz: PR.dz, floor: -30, times, motion: mot,
  base: PR.base && PR.base.z ? { z: PR.base.z.slice(0, bnz), u: PR.base.u.slice(0, bnz), v: PR.base.v.slice(0, bnz) } : PR.base, track,
  scale: { wind: WBOX, vz: 0.25 },
  nests: [{ nx: run.nx, ny: run.ny, nz: cnz, dx: run.dx, dz: run.dz, scale: { wind: WNEST, vz: run.vz.scale }, frame: run.frame }], fn, offsets,
  scenario: { lat0: site[0], lon0: site[1], origin, radar: siteId, clock: process.env.CLOCK || '15:00', tz: process.env.TZ || 'CDT' },
};

const q8 = (v, step) => { let q = Math.round(v / step); if (q > 127) { q = 127; clipped++; } else if (q < -127) { q = -127; clipped++; } return q; };
const block = (dbz, vz, uvw, fi, g, w, step) => {                                        // one frame of one grid (g: its size in the files, w: the window kept of it) as the pack's five arrays
  const n = g.nx * g.ny * g.nz, m = wn(w), b = Buffer.alloc(5 * m); let o = 0;
  for (let k = 0; k < w.nz; k++) for (let j = w.j0; j < w.j1; j++) for (let i = w.i0; i < w.i1; i++, o++) {
    const s = (k * g.ny + j) * g.nx + i; b[o] = dbz[fi * n + s]; b[m + o] = vz[fi * n + s];
    for (let c = 0; c < 3; c++) b.writeInt8(q8(uvw[(fi * 3 + c) * n + s] * 0.01, step), (2 + c) * m + o);
  }
  return b;
};

const head = Buffer.from(JSON.stringify(header)), len = Buffer.alloc(4); len.writeUInt32LE(head.length);
const out = createWriteStream(outPath), gz = createGzip({ level: 9 }); gz.pipe(out); out.write('HFP2');
let packed = 0; gz.on('data', (d) => { packed += d.length; });
const put = (b) => new Promise((res, rej) => gz.write(b, (e) => (e ? rej(e) : res())));
await put(len); await put(head);
for (const [, fi] of keep) { await put(block(pdbz, pvz, PU, fi, PR, BW, WBOX)); await put(block(cdbz, cvz, CU, fi, run, CW, WNEST)); }
gz.end(); await once(out, 'close');
console.log(`${keep.length} frames (${times[0].toFixed(2)} to ${times[times.length - 1].toFixed(2)} min) of a ${bi1 - bi0}x${bj1 - bj0}x${bnz} box of ${PR.dx} m (${PR.nx}x${PR.ny}x${PR.nz} in the run) and a ${run.nx}x${run.ny}x${cnz} nest of ${run.dx} x ${run.dz} m: ${(at / 1e6).toFixed(0)} MB raw, ${((packed + 4) / 1e6).toFixed(1)} MB packed, wind step ${WNEST} m/s in the nest (strongest ${cmax.toFixed(0)} m/s), ${clipped} values clamped; the box's origin ${origin.join(',')} m from ${siteId} -> ${outPath}`);
