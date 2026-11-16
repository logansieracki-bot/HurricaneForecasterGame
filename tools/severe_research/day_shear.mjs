// day_shear.mjs: for each of the editor's days, the motion of its storm (Bunkers' right mover) and the shear of the lowest 1, 6 and 10 km at the day's spot, as a bearing (degrees, towards) and a speed (m/s): where the nest of a fine run goes
// against the middle of the box (`HFSevereLab.upshear`: against the shear of the lowest 6 km), docs/severe-research.md part 7 ("Where the rotation is, against the nest, and the nest upshear").
//   node tools/severe_research/day_shear.mjs
const R = new URL('../../src/', import.meta.url).pathname;
for (const f of ['severe-core.js', 'severe-sounding.js', 'severe-refl.js', 'severe-nest.js', 'severe-analysis.js', 'severe-days.js', 'severe-geo.js', 'severe-pack.js', 'severe-lab.js']) await import(R + f);
const bearing = (u, v) => ((Math.atan2(u, v) * 180 / Math.PI) + 360) % 360, fmt = (v) => bearing(v[0], v[1]).toFixed(0) + ' degrees ' + Math.hypot(v[0], v[1]).toFixed(1) + ' m/s';
for (const day of globalThis.HFSevereDays.list) {
  const d = globalThis.HFSevereDays.get(day.id), A = globalThis.HFSevereAnalysis.create(d.drawing), sp = d.spot, env = A.sounding(sp.x, sp.y, sp.t, { dz: 100, top: 20000 });
  const sh = (z1) => [env.uG(z1) - env.uG(0), env.vG(z1) - env.vG(0)], up = globalThis.HFSevereLab.upshear(env, 8000);
  console.log(day.id.padEnd(9), 'motion', fmt([env.motion.u, env.motion.v]), '| shear 0-1 km', fmt(sh(1000)), '| 0-6 km', fmt(sh(6000)), '| 0-10 km', fmt(sh(10000)), '| the nest 8 km upshear: ' + up.map((v) => (v / 1000).toFixed(1)).join(', ') + ' km east, north');
}
