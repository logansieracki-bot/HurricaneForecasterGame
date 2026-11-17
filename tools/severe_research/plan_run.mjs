// plan_run.mjs <day> <minutes> fine|fast <out.hfp> [key=value ...]: a run of an editor day as the page's "Run a storm" makes it: the spec of the run plan (src/severe-runplan.js: HFSevereRunPlan.spec with the model's own settings, or with the
// keys given changed: ground=0.1 evap=0.3 rain=1 bubble=3 nest=2 nestBox=30 nestFrom=20) and the page's own frame every 5 minutes, 40 levels of 500 m, in the day's sounding at its spot; written as a pack that tools/severe_research/pack_render.mjs,
// pack_trim.mjs and the page read. It prints the environment, a line a frame (the updraft, the echo, the box's drift, the storm the box keeps) and what the run cost.
//   node tools/severe_research/plan_run.mjs outbreak 120 fine /tmp/outbreak.hfp
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const R = new URL('../../src/', import.meta.url).pathname;
for (const f of ['severe-core.js', 'severe-sounding.js', 'severe-refl.js', 'severe-nest.js', 'severe-analysis.js', 'severe-days.js', 'severe-geo.js', 'severe-pack.js', 'severe-lab.js', 'severe-runplan.js']) await import(R + f);
const L = globalThis.HFSevereLab, P = globalThis.HFSeverePack, RP = globalThis.HFSevereRunPlan, SND = globalThis.HFSevereSounding;
const [day, minutes, kind, out, ...kv] = process.argv.slice(2), set = Object.assign({}, RP.SET_DEF, Object.fromEntries(kv.map((s) => s.split('=')).map(([k, v]) => [k, +v])));
if (!day || !out || !['fine', 'fast'].includes(kind)) { console.error('usage: plan_run.mjs <day> <minutes> fine|fast <out.hfp> [key=value ...]'); process.exit(1); }
const d = globalThis.HFSevereDays.get(day), A = globalThis.HFSevereAnalysis.create(d.drawing), sp = d.spot, env = A.sounding(sp.x, sp.y, sp.t, { dz: 100, top: 20000 }), tb = env.table, ix = SND.indices(env);
const ar = { z: Array.from(tb.z), theta: Array.from(tb.theta), qv: Array.from(tb.qv), u: Array.from(tb.z, (z) => env.uG(z)), v: Array.from(tb.z, (z) => env.vG(z)), p0: 1000, motion: { u: env.motion.u, v: env.motion.v } };
const o = Object.assign({ minutes: 90, dx: 2000, box: 128000, dt: 10 }, RP.spec({ minutes: +minutes, fine: kind === 'fine', zone: null }, set));       // (as the editor's runStorm takes the plan's spec)
const spec = { env: ar, dx: o.dx, box: o.box, dt: o.dt, minutes: o.minutes, frameEvery: 5, nz: 40, dz: 500, bubble: o.bubble, evap: o.evap, drag: o.drag, twoMoment: o.twoMoment, iceParams: o.iceParams, detail: o.detail, seeds: o.seeds, follow: o.follow, window: o.window, steer: o.steer, sponge: o.sponge };
console.log(day + ', ' + kind + ', ' + minutes + ' minutes; settings ' + JSON.stringify(set) + '; CAPE ' + Math.round(ix.mlcape) + ' J/kg, inhibition ' + ix.mlcin.toFixed(0) + ', shear 0-6 km ' + ix.shear06.toFixed(1) + ' m/s, helicity 0-1 km ' + Math.round(ix.srh01) + ' and 0-3 km ' + Math.round(ix.srh03) + ', motion ' + env.motion.u.toFixed(1) + ', ' + env.motion.v.toFixed(1) + ' m/s; the plan says ' + (kind === 'fine' ? RP.timeText(Math.round(RP.work(+minutes, set))) : 'a few minutes') + ' of work');
const t0 = Date.now();
const r = await L.run(spec, { frame: (f) => console.log('t=' + f.t + ' wmax ' + f.wmax + ' storm ' + f.track[2] + ' m/s at ' + f.track.slice(0, 2).map((x) => (x / 1000).toFixed(1)).join(', ') + ' km, echo ' + f.zmax + ' dBZ, pool ' + f.thvmin + ' K, drift ' + f.drift.map((x) => Math.round(x / 1000)).join(', ') + ' km' + (f.nest ? ', nest' : '') + ', wall ' + Math.round((Date.now() - t0) / 1000) + ' s'), nest: () => console.log('nest made') });
console.log('done', r.frames.length, 'frames', r.stopped ? 'stopped: ' + r.reason : '', 'wall', Math.round(r.wall), 's; header lab ' + JSON.stringify(r.header.lab));
const header = Object.assign({}, r.header, { name: day + ' plan run', scenario: { lat0: 36.7408, lon0: -98.1279, origin: [-42000, -42000], radar: 'KVNX', clock: '15:00', tz: 'CDT' } });
const pk = P.assemble(header, r.frames.map((f) => f.block)), h = pk.h, head = new TextEncoder().encode(JSON.stringify(h));
const blocks = r.frames.map((f) => f.block), total = blocks.reduce((a, b) => a + b.length, 0), body = new Uint8Array(4 + head.length + total);
new DataView(body.buffer).setUint32(0, head.length, true); body.set(head, 4); let at = 4 + head.length; for (const b of blocks) { body.set(b, at); at += b.length; }
writeFileSync(out, Buffer.concat([Buffer.from(h.v === 2 ? 'HFP2' : 'HFP1'), gzipSync(Buffer.from(body.buffer, body.byteOffset, body.byteLength), { level: 6 })]));
console.log('wrote', out, (body.length / 1e6).toFixed(1), 'MB raw');
