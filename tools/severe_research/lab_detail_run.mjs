// lab_detail_run.mjs <day> <minutes> <from> <boxKm> <every> <out.hfp>: the Lab's run of an editor day (2 km box of 84 km) with the detail nest of 500 m cells (boxKm wide, from minute <from>, a frame every <every> minutes), written as a pack (HFP2) that
// tools/severe_research/pack_render.mjs reads. Settings from the environment: DX=2000 DT=10 BOX=84 (km, the box's width) WINDOW (km, the middle of the box that the pack records: all of it unless given), EVAP=1 (the rain's evaporation), TWO=1 (the two-moment rain), DRAG (the ground's roughness in m: the Lab's own 0.1 unless it is given; DRAG=0 is the free-slip floor
// of the runs before the ground was put in, docs/severe-research.md part 7), ICE (JSON: settings of the ice scheme, iceParams of the core, e.g. {"qi0":1e-3,"n0smax":1e11}). VISC (the factor of the eddy viscosity, 1), NZ and DZ (the levels: 40 of 500 m; NZ=80 DZ=250 for twice the vertical resolution), NESTDX (m, 500: the nest's cells, a whole fraction of the box's: 333.3333333333333 for a third of 1 km), UPSHEAR (m: the nest lies that far against the shear of the lowest 6 km, as the run card's does with 8000; none unless given: the nest is in the middle of the box) and
// NOFF (east,north in m: the nest's offset from the middle of the box outright, e.g. NOFF=-8000,-2000, which wins). boxKm 0 runs the box alone.
//   node tools/severe_research/lab_detail_run.mjs outbreak 90 20 16 5 /tmp/outbreak.hfp
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const R = new URL('../../src/', import.meta.url).pathname;
for (const f of ['severe-core.js', 'severe-sounding.js', 'severe-refl.js', 'severe-nest.js', 'severe-analysis.js', 'severe-days.js', 'severe-geo.js', 'severe-pack.js', 'severe-lab.js']) await import(R + f);
const L = globalThis.HFSevereLab, P = globalThis.HFSeverePack;
const [day, minutes, from, boxKm, every, out] = process.argv.slice(2);
const d = globalThis.HFSevereDays.get(day), A = globalThis.HFSevereAnalysis.create(d.drawing), sp = d.spot, env = A.sounding(sp.x, sp.y, sp.t, { dz: 100, top: 20000 }), tb = env.table;
const ar = { z: Array.from(tb.z), theta: Array.from(tb.theta), qv: Array.from(tb.qv), u: Array.from(tb.z, (z) => env.uG(z)), v: Array.from(tb.z, (z) => env.vG(z)), p0: 1000, motion: env.motion };
const spec = { env: ar, dx: +process.env.DX || 2000, nz: +process.env.NZ || undefined, dz: +process.env.DZ || undefined, box: (+process.env.BOX || 84) * 1000, window: process.env.WINDOW ? +process.env.WINDOW * 1000 : undefined, dt: +process.env.DT || 10, minutes: +minutes, frameEvery: 5, evap: process.env.EVAP === undefined ? 1 : +process.env.EVAP, twoMoment: process.env.TWO === "1", visc: process.env.VISC === undefined ? undefined : +process.env.VISC, drag: process.env.DRAG === undefined ? undefined : +process.env.DRAG, iceParams: process.env.ICE ? JSON.parse(process.env.ICE) : undefined, detail: +boxKm > 0 ? Object.assign({ dx: +(process.env.NESTDX || 500), box: +boxKm * 1000, from: +from, ztop: 8000, every: +every }, process.env.UPSHEAR ? { upshear: +process.env.UPSHEAR } : {}, process.env.NOFF ? { offset: process.env.NOFF.split(',').map(Number) } : {}) : undefined };
let last = -1; const t0 = Date.now();
const r = await L.run(spec, { progress: (p) => { if (Math.floor(p.t) !== last && Math.floor(p.t) % 5 === 0) { last = Math.floor(p.t); console.log('t=' + last + ' min  wall ' + Math.round(p.wall) + ' s'); } }, nest: () => console.log('nest made') });
console.log('done', r.frames.length, 'frames', r.stopped ? 'stopped: ' + r.reason : '', 'wall', Math.round(r.wall), 's; drift', JSON.stringify(r.header.drift[r.frames.length - 1]));
const header = Object.assign({}, r.header, { name: day + ' lab detail', scenario: { lat0: 36.7408, lon0: -98.1279, origin: [-42000, -42000], radar: 'KVNX', clock: '15:00', tz: 'CDT' } });
const pk = P.assemble(header, r.frames.map((f) => f.block));
// write what assemble made: its header (with offsets) and the frames
const h = pk.h, head = new TextEncoder().encode(JSON.stringify(h)), per = h.nx * h.ny * h.nz;
const blocks = r.frames.map((f) => f.block), total = blocks.reduce((a, b) => a + b.length, 0), body = new Uint8Array(4 + head.length + total);
new DataView(body.buffer).setUint32(0, head.length, true); body.set(head, 4); let at = 4 + head.length; for (const b of blocks) { body.set(b, at); at += b.length; }
const magic = Buffer.from(h.v === 2 ? 'HFP2' : 'HFP1');
writeFileSync(out, Buffer.concat([magic, gzipSync(Buffer.from(body.buffer, body.byteOffset, body.byteLength), { level: 6 })]));
console.log('wrote', out, (body.length / 1e6).toFixed(1), 'MB raw');
