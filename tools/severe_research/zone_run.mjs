// zone_run.mjs <day> <minutes> <out.hfp>: the Lab's run of an editor day with an initiation zone (src/severe-zone.js: seeds along a drawn line or over an area, in a box that holds it, no nest, the box not following any storm), as a pack for
// tools/severe_research/pack_render.mjs. ZONE (JSON, the zone of HFSevereZone: kind, pts in m, density, strength, window; default a line of 120 km north-south, 4 seeds to 100 km, 3 K, over the first 30 minutes), DX=2000 DT=10 EVAP=1 DRAG (the ground's roughness in m: the Lab's own, 0.1, unless it is given; DRAG=0 is the free-slip floor of the run in docs/severe-research.md part 7).
//   node tools/severe_research/zone_run.mjs outbreak 90 /tmp/zone.hfp
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const R = new URL('../../src/', import.meta.url).pathname;
for (const f of ['severe-core.js', 'severe-sounding.js', 'severe-refl.js', 'severe-nest.js', 'severe-analysis.js', 'severe-days.js', 'severe-geo.js', 'severe-pack.js', 'severe-lab.js', 'severe-zone.js']) await import(R + f);
const L = globalThis.HFSevereLab, P = globalThis.HFSeverePack, Z = globalThis.HFSevereZone;
const [day, minutes, out] = process.argv.slice(2);
const d = globalThis.HFSevereDays.get(day), A = globalThis.HFSevereAnalysis.create(d.drawing), sp = d.spot, env = A.sounding(sp.x, sp.y, sp.t, { dz: 100, top: 20000 }), tb = env.table;
const ar = { z: Array.from(tb.z), theta: Array.from(tb.theta), qv: Array.from(tb.qv), u: Array.from(tb.z, (z) => env.uG(z)), v: Array.from(tb.z, (z) => env.vG(z)), p0: 1000, motion: env.motion };
const zone = JSON.parse(process.env.ZONE || '{"kind":"line","pts":[[0,-60000],[0,60000]],"density":4,"strength":3,"window":[0,30]}'), plan = Z.plan(zone, { dx: +process.env.DX || 2000 });
console.log('zone box', plan.box.L / 1000, 'km,', plan.seeds.length, 'seeds, dropped', plan.dropped, plan.seeds.map((q) => '(' + (q.x / 1000).toFixed(0) + ',' + (q.y / 1000).toFixed(0) + ' t' + q.t.toFixed(0) + ')').join(' '));
const spec = { env: ar, dx: +process.env.DX || 2000, box: plan.box.L, dt: +process.env.DT || 10, minutes: +minutes, frameEvery: 5, follow: false, evap: process.env.EVAP === undefined ? 1 : +process.env.EVAP, seeds: plan.seeds };
if (process.env.DRAG !== undefined) spec.drag = +process.env.DRAG;
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
