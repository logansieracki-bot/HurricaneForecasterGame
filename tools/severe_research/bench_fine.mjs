// bench_fine.mjs: the work of the Lab's Fine run (the outbreak day, 1 km cells and the nest of 500 m over 30 km) per model minute, before the nest and with it, for a box and a recorded window (docs/severe-research.md part 7, "Where the echo stops dead").
//   BOX=108 WINDOW=96 FROM=3 MIN=8 node tools/severe_research/bench_fine.mjs      (km; the nest from minute FROM of a run of MIN minutes; the box 84 km and no window unless given)
const R = new URL('../../src/', import.meta.url).pathname;
for (const f of ['severe-core.js', 'severe-sounding.js', 'severe-refl.js', 'severe-nest.js', 'severe-analysis.js', 'severe-days.js', 'severe-geo.js', 'severe-pack.js', 'severe-lab.js']) await import(R + f);
const L = globalThis.HFSevereLab;
const box = +(process.env.BOX || 84) * 1000, win = process.env.WINDOW ? +process.env.WINDOW * 1000 : undefined, from = +(process.env.FROM || 3), minutes = +(process.env.MIN || 8);
const d = globalThis.HFSevereDays.get('outbreak'), A = globalThis.HFSevereAnalysis.create(d.drawing), sp = d.spot, env = A.sounding(sp.x, sp.y, sp.t, { dz: 100, top: 20000 }), tb = env.table;
const ar = { z: Array.from(tb.z), theta: Array.from(tb.theta), qv: Array.from(tb.qv), u: Array.from(tb.z, (z) => env.uG(z)), v: Array.from(tb.z, (z) => env.vG(z)), p0: 1000, motion: env.motion };
const marks = {}; const r = await L.run({ env: ar, dx: 1000, dt: 5, box, window: win, minutes, frameEvery: 1, minUpdraft: 0, detail: { dx: 500, box: 30000, from, ztop: 8000, every: 1, minUpdraft: 0 } }, { progress: (p) => { const m = Math.floor(p.t + 1e-9); if (!(m in marks)) marks[m] = p.wall; } });
const ms = Object.keys(marks).map(Number).sort((a, b) => a - b), rate = (a, b) => ((marks[b] - marks[a]) / (b - a));
console.log('box ' + box / 1000 + ' km, window ' + (win ? win / 1000 : 'all') + ' km: ' + r.frames.length + ' frames, ' + (r.frames[r.frames.length - 1].block.length / 1e6).toFixed(2) + ' MB in the last; wall ' + r.wall.toFixed(0) + ' s; per model minute: before the nest (minutes 0 to ' + from + ') ' + rate(0, from).toFixed(1) + ' s, with it (' + (from + 1) + ' to ' + minutes + ') ' + rate(from + 1, minutes).toFixed(1) + ' s');
