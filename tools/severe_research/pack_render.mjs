// A frame of a storm pack (make_pack.mjs, make_nest_pack.mjs) as the page reads it (src/severe-pack.js) and the radar operator takes it: one PNG, drawn with the palette. A look at what a pack holds, with its nests,
// before it goes to the page.
//   node tools/severe_research/pack_render.mjs <pack.hfp> <frame> <out.png> [key=value ...]
// keys: site=KVNX (the radar: an id of data/generated/severe-sites.json, default the pack's own), radar=x,y (km, the radar's
// place from the box's south-west corner at that frame, instead of the site), elev=0.5, view=auto | cx,cy,mpp,w,h (km east and north of the radar at the picture's centre, metres per pixel, pixels; `auto` centres on the
// strongest updraft of the frame, 100 m per pixel, 1400 x 800), product=dbz | vel | sw, seed=1, n=2, nyq=28, dealias=0, vnoise=1, nests=1 (0: the box alone, to see what the nest adds), pal=<file>.
import '../../src/severe-geo.js';
import '../../src/severe-pack.js';
import '../../src/severe-palette.js';
import '../../src/severe-radar.js';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { writePng } from './png.mjs';

const [packPath, frame, outPath, ...kv] = process.argv.slice(2), opt = Object.fromEntries(kv.map((s) => s.split('=')));
if (!packPath || frame === undefined || !outPath) { console.error('usage: pack_render.mjs <pack.hfp> <frame> <out.png> [key=value ...]'); process.exit(1); }
const G = globalThis.HFSevereGeo, PK = globalThis.HFSeverePack, PL = globalThis.HFSeverePalette, R = globalThis.HFSevereRadar;
const raw = readFileSync(packPath), body = gunzipSync(raw.subarray(4)), P = PK.fromBody(new Uint8Array(body.buffer, body.byteOffset, body.byteLength)), fi = +frame, t = P.times[fi];
if (!(fi >= 0 && fi < P.n)) { console.error('no frame ' + frame + ' (the pack has ' + P.n + ')'); process.exit(1); }
const sites = JSON.parse(readFileSync(new URL('../../data/generated/severe-sites.json', import.meta.url), 'utf8')), site = sites[opt.site || P.scenario.radar];
const rad = opt.radar ? opt.radar.split(',').map((v) => +v * 1000) : (() => { const b = P.radarBox(t, site[0], site[1]); return [b.x, b.y]; })();
const vol = P.volume(fi); if (opt.nests === '0') delete vol.nests;
const product = opt.product || 'dbz', tr = P.track[fi];
const view = opt.view && opt.view !== 'auto' ? opt.view.split(',').map(Number) : [(tr[0] - rad[0]) / 1000, (tr[1] - rad[1]) / 1000, 100, 1400, 800];
const defPal = { dbz: 'Apocs_BR_Expert.pal', vel: 'User_BV_mph.pal', sw: 'Isobar_SW_placeholder.pal' }[product];
const pal = PL.parse(readFileSync(opt.pal || new URL('../../data/severe/' + defPal, import.meta.url), 'utf8')), unit = product === 'dbz' ? 1 : PL.unitScale(pal.units);
const range = product === 'dbz' ? [-40, 105] : [pal.stops[0].v - 5, pal.stops[pal.stops.length - 1].v + 5], lut = PL.lut(pal, { vmin: range[0], vmax: range[1], step: product === 'dbz' ? 0.05 : 0.1 });
const t0 = Date.now();
const sweep = R.scan(vol, { x: rad[0], y: rad[1], elev: +(opt.elev || 0.5), seed: +(opt.seed || 1), n: +(opt.n || 2), clutter: { ground: 1, clearAir: 1 },
                            velocity: product === 'dbz' ? false : { nyquist: +(opt.nyq || 28), dealias: opt.dealias === '1', noise: +(opt.vnoise ?? 1) } });
const t1 = Date.now();
const img = R.render(sweep, lut, { w: view[3], h: view[4], cx: view[0] * 1000, cy: view[1] * 1000, mpp: view[2], field: product, scale: unit, bg: [11, 13, 26, 255] });
writePng(outPath, view[3], view[4], img);
console.log('frame ' + fi + ' at minute ' + t.toFixed(2) + ' (' + P.clock(t).text + '), ' + (vol.nests ? vol.nests.length + ' nest(s) at ' + vol.nests.map((n) => '(' + (n.x / 1000).toFixed(1) + ', ' + (n.y / 1000).toFixed(1) + ') km').join(', ') : 'no nest') + ', radar at (' + (rad[0] / 1000).toFixed(1) + ', ' + (rad[1] / 1000).toFixed(1) + ') km of the box, scan ' + (t1 - t0) + ' ms, render ' + (Date.now() - t1) + ' ms -> ' + outPath);
