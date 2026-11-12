// A recorded storm (wk82_run.mjs: <run>.json and <run>.dbz3d.i8, the winds <run>.wind3d.i16 and the fall speed <run>.vz3d.u8) seen by the radar operator of src/severe-radar.js and drawn with the
// palette: one PNG.
//   node tools/severe_research/radar_render.mjs <run.json> <minute> <out.png> [key=value ...]
// keys: radar=x,y (km, the radar's place from the box's south-west corner at that minute, default 140,45), radar0=x,y (the place at minute 0: a radar on the ground stays put while the box, which moves
// with the storm, goes by, so at minute t it is at radar0 minus the motion of the box times t), elev=0.5, view=cx,cy,mpp,w,h (km east and north of the radar at the picture's centre, metres per pixel,
// pixels; default 70,0,100,1400,800), seed=1, n=2 (independent samples), clutter=1, clear=1, pal=<file>, bg=r,g,b, dbz=- (print the range of the data),
// product=dbz (default) | vel | sw, nyq=28 (the Nyquist velocity, m/s), dealias=0 (1: unfolded), vnoise=1 (0: no measurement error in the velocity). The velocity is in m/s and is drawn with
// data/severe/User_BV_mph.pal (your table, in miles per hour: the renderer multiplies by 2.237 first); pal=<file> takes any table, in any of m/s, mph, kts, kph.
// nest=<child.json>,<frame> lays a nest's frame (wk82_nest.mjs child: 100 to 250 m cells) over the box's volume, where the child lies at that frame's time; the box's own frame is the one of <minute>, so give the
// minute the child started from (or the nearest the run recorded): the radar's place is the box's at <minute>, and the child's corner is moved for the time between.
import '../../src/severe-palette.js';
import '../../src/severe-radar.js';
import { readFileSync } from 'node:fs';
import { writePng } from './png.mjs';
import { loadFrame, loadChild } from './frames.mjs';

const [runPath, minute, outPath, ...kv] = process.argv.slice(2), opt = Object.fromEntries(kv.map((s) => s.split('=')));
const run = JSON.parse(readFileSync(runPath, 'utf8')), P = globalThis.HFSeverePalette, R = globalThis.HFSevereRadar;
const vol = loadFrame(run, runPath, +minute), product = opt.product || 'dbz';
const m0 = run.motion || { u: 0, v: 0 }, rad = opt.radar0 ? opt.radar0.split(',').map((v, i) => +v - (i ? m0.v : m0.u) * 60 * +minute / 1000) : (opt.radar || '140,45').split(',').map(Number), view = (opt.view || '70,0,100,1400,800').split(',').map(Number);
const defPal = { dbz: 'Apocs_BR_Expert.pal', vel: 'User_BV_mph.pal', sw: 'Isobar_SW_placeholder.pal' }[product];
const pal = P.parse(readFileSync(opt.pal || new URL('../../data/severe/' + defPal, import.meta.url), 'utf8')), unit = product === 'dbz' ? 1 : P.unitScale(pal.units);                    // (a velocity is in m/s, the table may be in mph)
const range = product === 'dbz' ? [-40, 105] : [pal.stops[0].v - 5, pal.stops[pal.stops.length - 1].v + 5], lut = P.lut(pal, { vmin: range[0], vmax: range[1], step: product === 'dbz' ? 0.05 : 0.1 });
if (opt.nest) {
  const [np, nf] = opt.nest.split(','), child = JSON.parse(readFileSync(np, 'utf8')), c = loadChild(child, np, +(nf || 0)), dtS = child.startMinute * 60 + c.t - +minute * 60;      // the child's frame is dtS seconds after the box's
  vol.nests = [{ x: c.x + m0.u * dtS, y: c.y + m0.v * dtS, vol: c.vol }];
  console.log('nest: ' + child.nx + 'x' + child.ny + 'x' + child.nz + ' cells of ' + child.dx + ' x ' + child.dz + ' m, frame ' + (nf || 0) + ' at ' + c.t + ' s (minute ' + (child.startMinute + c.t / 60).toFixed(2) + '), its corner at (' + (vol.nests[0].x / 1000).toFixed(2) + ', ' + (vol.nests[0].y / 1000).toFixed(2) + ') km of the box');
}
const t0 = Date.now();
const sweep = R.scan(vol, { x: rad[0] * 1000, y: rad[1] * 1000, elev: +(opt.elev || 0.5), seed: +(opt.seed || 1), n: +(opt.n || 2), clutter: { ground: +(opt.clutter ?? 1), clearAir: +(opt.clear ?? 1) },
                            velocity: product === 'dbz' ? false : { nyquist: +(opt.nyq || 28), dealias: opt.dealias === '1', noise: +(opt.vnoise ?? 1) } });
const t1 = Date.now();
const img = R.render(sweep, lut, { w: view[3], h: view[4], cx: view[0] * 1000, cy: view[1] * 1000, mpp: view[2], field: product, scale: unit, bg: (opt.bg || '11,13,26').split(',').map(Number).concat(255) });
writePng(outPath, view[3], view[4], img);
let mx = -999, mn = 999, cnt = 0; for (const v of sweep[product]) if (v === v) { cnt++; if (v > mx) mx = v; if (v < mn) mn = v; }
console.log('scan ' + (t1 - t0) + ' ms, render ' + (Date.now() - t1) + ' ms, ' + cnt + ' of ' + sweep.dbz.length + ' gates with data, ' + product + ' from ' + mn + ' to ' + mx + ' -> ' + outPath + (opt.radar0 || opt.radar ? '' : ''));
