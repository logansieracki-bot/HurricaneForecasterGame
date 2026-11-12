// Node-only tests of what the Severe radar page stands on: the projections and the sphere (src/severe-geo.js), the baked map data it ships (data/generated/severe-geo.bin), the label layout of
// the map (src/severe-map.js), the storm pack and its place on the ground (src/severe-pack.js, data/severe/packs/*.hfp), the scanning step between the pack and the operator (src/severe-worker.js) and
// the GPU picture's reference (src/severe-gl.js, which the browser test holds the real GPU to). The right answers come from outside the code: great-circle distances of known cities, the
// closed forms of Web Mercator, a round trip through every codec, positions of real towns and radars, and the operator's own renderer.
import '../src/severe-geo.js';
import '../src/severe-palette.js';
import '../src/severe-radar.js';
import '../src/severe-pack.js';
import '../src/severe-worker.js';
import '../src/severe-gl.js';
import { readFileSync } from 'node:fs';
import { inflateRawSync, gzipSync } from 'node:zlib';

// the map engine needs a canvas to be created, but its pure part (layoutLabels) does not: load the script with a stand-in for what it only touches inside create()
globalThis.HFSevereMap = undefined; await import('../src/severe-map.js');
const G = globalThis.HFSevereGeo, P = globalThis.HFSevereGL, M = globalThis.HFSevereMap, K = globalThis.HFSevereRadar, PK = globalThis.HFSeverePack, PAL = globalThis.HFSeverePalette, SC = globalThis.HFSevereScanner;
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); } }
const t0 = Date.now(), lap = () => ((Date.now() - t0) / 1000).toFixed(1) + ' s', rd = (p) => readFileSync(new URL('../' + p, import.meta.url));
const close = (a, b, tol) => Math.abs(a - b) <= tol;

/* 1. Web Mercator and the view */
check('Mercator: the world is 2 pi R wide (180 degrees east is 20037508.34 m) and the latitude limit 85.0511 degrees is as far north as that',
  close(G.mercX(180), 20037508.342789244, 1e-6) && close(G.mercY(85.0511287798066), 20037508.342789244, 1e-3) && close(G.mercY(0), 0, 1e-8) && G.mercX(0) === 0);
let worst = 0; for (const [la, lo] of [[0, 0], [36.74, -98.13], [-33.9, 151.2], [64.1, -21.9], [-54.8, -68.3], [84, 179.9]]) { const m = G.fromMerc(G.mercX(lo), G.mercY(la)); worst = Math.max(worst, Math.abs(m.lat - la), Math.abs(m.lon - lo)); }
check('Mercator and its inverse agree to 1e-9 degrees at six places of the world (worst ' + worst.toExponential(1) + ')', worst < 1e-9);
check('zoom 0 is 156543.034 m per pixel (256-pixel tiles), every zoom halves it, and zoomOf inverts mppOf', close(G.mppOf(0), 156543.03392804097, 1e-6) && close(G.mppOf(7), 156543.03392804097 / 128, 1e-9) && close(G.zoomOf(G.mppOf(8.37)), 8.37, 1e-9));
{ const v = { cx: 1e6, cy: 4e6, mpp: 200, w: 800, h: 600 }, [px, py] = G.toScreen(v, 1e6 + 1000, 4e6 + 600), [mx, my] = G.fromScreen(v, px, py);
  check('a point 1000 m east and 600 m north of the centre is 5 px right of the middle and 3 px up (' + px + ', ' + py + '), and the view maps back', px === 405 && py === 297 && close(mx, 1e6 + 1000, 1e-9) && close(my, 4e6 + 600, 1e-9)); }

/* 2. The sphere */
{ const lp = G.distBearing(51.5074, -0.1278, 48.8566, 2.3522), eq = G.distBearing(0, 0, 0, 1), no = G.distBearing(0, 0, 1, 0), we = G.distBearing(10, 20, 10, 19);
  check('London to Paris: 343.5 km at 148.1 degrees (' + (lp.d / 1000).toFixed(1) + ' km, ' + lp.az.toFixed(1) + ')', close(lp.d / 1000, 343.5, 0.6) && close(lp.az, 148.1, 0.3));
  check('one degree of the equator is R pi / 180 = 111.195 km due east, one degree of a meridian due north, a step west is 270 degrees', close(eq.d, 6371008.8 * Math.PI / 180, 1e-6) && close(eq.az, 90, 1e-9) && close(no.az, 0, 1e-9) && close(we.az, 270, 0.2));
  worst = 0; for (const [la, lo, az, d] of [[36.7, -98.1, 37, 120000], [36.7, -98.1, 200, 230000], [-20, 130, 315, 50000], [60, 10, 90, 400000], [0, 0, 0, 1000]]) { const q = G.dest(la, lo, az, d), r = G.distBearing(la, lo, q.lat, q.lon); worst = Math.max(worst, Math.abs(r.d - d) / 1000, Math.abs(((r.az - az + 540) % 360) - 180) * d / 1e5); }
  check('dest and distBearing are each other\'s inverse (worst error ' + worst.toExponential(1) + ')', worst < 1e-6); }
{ const e = G.dest(36, -97, 90, 100000), l = G.local(36, -97, e.lat, e.lon), n = G.local(36, -97, G.dest(36, -97, 0, 100000).lat, -97), f = G.fromLocal(36, -97, 12345, -23456), b = G.local(36, -97, f.lat, f.lon);
  check('the radar\'s plane: a point 100 km east is at x = 100 km, y = 0 and 100 km north at y = 100 km, and fromLocal inverts local (' + l.x.toFixed(2) + ', ' + l.y.toFixed(2) + ')', close(l.x, 100000, 1e-3) && close(l.y, 0, 1e-3) && close(n.y, 100000, 1e-3) && close(n.x, 0, 1e-3) && close(b.x, 12345, 1e-4) && close(b.y, -23456, 1e-4));
  const m1 = G.mercX(-96) - G.mercX(-97); check('a Mercator picture of the same hundred km is wider by 1 / cos(latitude) (a degree of longitude at 36 N spans ' + (m1 / 1000).toFixed(1) + ' km of map, but ' + (6371008.8 * Math.PI / 180 * Math.cos(36 * Math.PI / 180) / 1000).toFixed(1) + ' km of ground)', close(m1 / (6371008.8 * Math.PI / 180 * Math.cos(36 * Math.PI / 180)), 1 / Math.cos(36 * Math.PI / 180) * 6378137 / 6371008.8, 1e-6)); }

/* 3. The bundle codec, on a small thing whose every number is known */
{ const steps = [127, 128, 255, 256, 16383, 16384, 2097151, 2097152], cum = steps.reduce((a, d) => (a.push(a[a.length - 1] + d), a), [0]);
  const lines = { a: [{ c: 2, p: [[10, 20], [15, 18], [-7, 30]] }, { c: 0, p: [[-1000000, 500000], [-999990, 500007]] }], b: [], v: [{ c: 0, p: cum.map((x, i) => [x, 300 * i - 1000]) }] }, polys = { w: [{ c: 1, rings: [[[0, 0], [10, 0], [10, 10], [0, 0]], [[2, 2], [4, 2], [3, 4], [2, 2]]] }] };
  const points = { p: { x: [-980000, -970000, 1], y: [360000, 361234, 2], c: [3, 0, 5], names: ['Enid', 'Stillwater, OK', 'x'], extra: ['OK', 'OK', ''] }, q: { x: [], y: [] } };
  const d = G.decodeBundle(G.encodeBundle({ unit: 1e-4, lines, polys, points, meta: { region: [1, 2, 3, 4] } }));
  const l0 = d.lines.a[0], k = 1e-4;
  check('a bundle comes back as it went in: lines with their classes and exact positions, empty layers, polygons with holes, points with names and extras and the metadata',
    d.lines.a.length === 2 && d.lines.b.length === 0 && l0.c === 2 && l0.n === 3 && close(l0.x[2], G.mercX(-7 * k), 1e-6) && close(l0.y[1], G.mercY(18 * k), 1e-6) && d.lines.a[1].c === 0 && close(d.lines.a[1].x[0], G.mercX(-100), 1e-6)
    && d.polys.w[0].c === 1 && d.polys.w[0].rings.length === 2 && d.polys.w[0].rings[1].x.length === 4 && d.points.p.n === 3 && d.points.p.names[1] === 'Stillwater, OK' && d.points.p.extra[2] === '' && d.points.p.c[2] === 5
    && close(d.points.p.lon[1], -97, 1e-9) && close(d.points.p.lat[1], 36.1234, 1e-9) && d.points.q.n === 0 && d.meta.region[3] === 4 && d.unit === 1e-4);
  check('numbers either side of every varint boundary (127 and 128, 255 and 256, 16383 and 16384, 2^21 - 1 and 2^21) survive the delta coding (in x; the y deltas are small and negative first)', d.lines.v[0].n === cum.length && cum.every((x, i) => close(d.lines.v[0].x[i], G.mercX(x * k), 1e-6) && close(d.lines.v[0].y[i], G.mercY((300 * i - 1000) * k), 1e-6)));
  check('the bounding box of a polygon is that of all its rings, and of a line that of its vertices in Mercator metres', close(d.polys.w[0].bb[2], G.mercX(10 * k), 1e-6) && close(d.polys.w[0].bb[3], G.mercY(10 * k), 1e-6) && close(d.polys.w[0].bb[0], 0, 1e-9) &&
    close(l0.bb[0], G.mercX(-7 * k), 1e-6) && close(l0.bb[2], G.mercX(15 * k), 1e-6) && close(l0.bb[1], G.mercY(18 * k), 1e-6) && close(l0.bb[3], G.mercY(30 * k), 1e-6)); }
{ const dl = G.dest(0, 179.5, 90, 111195.08);
  check('a point one degree east of 179.5 E is at 179.5 W, not 180.5 (the longitude wraps)', close(dl.lon, -179.5, 1e-3) && close(dl.lat, 0, 1e-6)); }

/* 4. The map data the page ships */
const geo = G.decodeBundle(new Uint8Array(inflateRawSync(rd('data/generated/severe-geo.bin'))));
const sites = JSON.parse(rd('data/generated/severe-sites.json').toString()), sp = geo.points.site, pl = geo.points.place;
const cnt = (a) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k].length]));
check('the baked map holds the lower 48: ' + JSON.stringify(cnt(geo.lines)) + ' lines, ' + JSON.stringify(cnt(geo.polys)) + ' polygons, ' + pl.n + ' places, ' + sp.n + ' radars',
  geo.lines.county.length > 5000 && geo.lines.state.length > 800 && geo.lines.outline.length > 300 && geo.lines.road.length > 5000 && geo.lines.river.length > 1500 && geo.polys.land.length > 400 && geo.polys.water.length > 400 && pl.n > 25000 && sp.n >= 140 && sp.n <= 160);
check('the roads come in three classes (interstate, US highway, other) and the rivers in four', JSON.stringify([...new Set(geo.lines.road.map((l) => l.c))].sort()) === '[0,1,2]' && JSON.stringify([...new Set(geo.lines.river.map((l) => l.c))].sort()) === '[0,1,2,3]');
{ const i = sp.names.indexOf('KTLX'), j = sp.names.indexOf('KVNX'), s = sites.KTLX, ex = sp.extra[i].split('|'), hv = (la1, lo1, la2, lo2) => { const r = Math.PI / 180, a = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2; return 2 * 6371008.8 * Math.asin(Math.sqrt(a)); };
  check('the radar sites are the WSR-88Ds of the table (KTLX at ' + sp.lat[i].toFixed(4) + ', ' + sp.lon[i].toFixed(4) + ' as in severe-sites.json, named "' + ex[0] + '" with the ground at ' + ex[1] + ' m), none of the terminal radars, and the biggest town within 35 km names them',
    close(sp.lat[i], s[0], 1e-4) && close(sp.lon[i], s[1], 1e-4) && ex[0] === 'Oklahoma City, OK' && +ex[1] === s[2] && sp.names.every((n) => /^K/.test(n)) && sp.extra[j].split('|')[0] === 'Enid, OK');
  check('KTLX to KVNX is 174.2 km from the baked positions as from a haversine of the table\'s own', close(G.distBearing(sp.lat[i], sp.lon[i], sp.lat[j], sp.lon[j]).d, hv(s[0], s[1], sites.KVNX[0], sites.KVNX[1]), 40) && close(G.distBearing(sp.lat[i], sp.lon[i], sp.lat[j], sp.lon[j]).d / 1000, 174.2, 0.4)); }
{ const e = pl.names.indexOf('Enid'), o = pl.names.indexOf('Oklahoma City'), so = geo.points.state.names.indexOf('Oklahoma');
  check('Enid is at 36.396 N, 97.878 W (a city of 46,138, class 3), Oklahoma City is a class-1 city, and the state of Oklahoma is labelled "OK" near 35.5 N 97.5 W',
    close(pl.lat[e], 36.3956, 0.01) && close(pl.lon[e], -97.8778, 0.01) && pl.c[e] === 3 && pl.extra[e] === 'OK' && pl.c[o] === 1 && geo.points.state.extra[so] === 'OK' && close(geo.points.state.lat[so], 35.5, 1) && close(geo.points.state.lon[so], -97.5, 2)); }
{ const ok = G.mercX(-97.5164), oy = G.mercY(35.4676); let best = 1e12; for (const l of geo.lines.road) if (l.c === 0) for (let i = 0; i < l.n; i++) best = Math.min(best, Math.hypot(l.x[i] - ok, l.y[i] - oy) * Math.cos(35.5 * Math.PI / 180));
  check('an interstate runs through Oklahoma City (the nearest vertex of the baked interstates is ' + (best / 1000).toFixed(1) + ' km from the I-35 and I-40 crossing)', best < 5000); }
{ const r = geo.meta.region, x0 = G.mercX(r[0]) - 1000, x1 = G.mercX(r[2]) + 1000, y0 = G.mercY(r[1]) - 1000, y1 = G.mercY(r[3]) + 1000; let out = 0;
  for (const k of ['road', 'river', 'county', 'state']) for (const l of geo.lines[k]) if (l.bb[0] < x0 || l.bb[2] > x1 || l.bb[1] < y0 || l.bb[3] > y1) out++;
  check('no road, river, county or state line leaves the region the page keeps (' + out + ' do)', out === 0); }

/* 5. Label layout */
{ const items = [{ x: 100, y: 100, w: 60, h: 14, pri: 1, id: 'low' }, { x: 120, y: 105, w: 60, h: 14, pri: 9, id: 'high' }, { x: 300, y: 100, w: 60, h: 14, pri: 5, id: 'far' }, { x: 100, y: 130, w: 60, h: 14, pri: 3, id: 'below' }], keep = items.slice(), out = M.layoutLabels(items, 2);
  check('the higher priority wins where two labels overlap, the others stay (' + out.map((i) => i.id).join(', ') + '), and the input is left as it was', out.map((i) => i.id).join() === 'high,far,below' && items.every((it, k) => it === keep[k]));
  const a = [{ x: 0, y: 0, w: 20, h: 10, pri: 2 }, { x: 24, y: 0, w: 20, h: 10, pri: 1 }];
  check('labels 4 px apart are kept with no padding and dropped with 3 px on each side, and a blocked box (a site pill) takes its place: the label under it goes', M.layoutLabels(a, 0).length === 2 && M.layoutLabels(a, 3).length === 1 && M.layoutLabels(a, 0, [[-5, -5, 5, 5]]).length === 1 && M.layoutLabels([], 2).length === 0); }

/* 6. A pack of a few cells, every value known */
{ const nx = 4, ny = 3, nz = 2, per = nx * ny * nz, nt = 3, h = { v: 1, name: 'test', nx, ny, nz, dx: 1000, dz: 500, floor: -30, times: [0, 5, 10], motion: { u: 8, v: 5 }, base: { z: [250, 750], u: [1, 2], v: [3, 4] }, track: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
    scale: { wind: 0.5, vz: 0.25 }, scenario: { lat0: 36, lon0: -97, origin: [-10000, -20000], radar: 'KXXX', clock: '23:50', tz: 'CDT' } };
  const head = Buffer.from(JSON.stringify(h)), body = Buffer.alloc(4 + head.length + nt * 5 * per); body.writeUInt32LE(head.length); head.copy(body, 4);
  for (let f = 0; f < nt; f++) for (let c = 0; c < 5; c++) for (let i = 0; i < per; i++) { const o = 4 + head.length + (f * 5 + c) * per + i; if (c === 1) body.writeUInt8((f * 7 + i) % 200, o); else body.writeInt8(c === 0 ? ((i * 3 + f) % 60) - 30 : ((i + 5 * c + f) % 40) - 20, o); }
  const pk = PK.fromBody(new Uint8Array(body)), fr = pk.frame(1), vol = pk.volume(2);
  check('a pack reads back: ' + pk.n + ' frames of ' + pk.nx + 'x' + pk.ny + 'x' + pk.nz + ', the arrays of a frame are views of its own five slices', pk.n === 3 && pk.per === per && pk.floor === -30 && fr.dbz[5] === ((5 * 3 + 1) % 60) - 30 && fr.vz[7] === (1 * 7 + 7) % 200 && fr.u[3] === ((3 + 10 + 1) % 40) - 20 && fr.w[0] === ((0 + 20 + 1) % 40) - 20 && fr.dbz.length === per);
  check('the volume for the operator has the winds in the ground\'s frame: u and v are the model\'s (0.5 m/s steps) plus the box\'s motion, w is the model\'s, the fall speed is in 0.25 m/s',
    close(vol.u[4], (((4 + 10 + 2) % 40) - 20) * 0.5 + 8, 1e-6) && close(vol.v[9], (((9 + 15 + 2) % 40) - 20) * 0.5 + 5, 1e-6) && close(vol.w[2], (((2 + 20 + 2) % 40) - 20) * 0.5, 1e-6) && close(vol.vz[3], ((2 * 7 + 3) % 200) * 0.25, 1e-6) && vol.base === pk.h.base && vol.dbz[1] === ((1 * 3 + 2) % 60) - 30 && vol.dx === 1000 && vol.dz === 500);
  const fb = pk.frameBytes(1), vf = PK.volumeFromFrame(pk.h, fb), v1 = pk.volume(1);
  check('a frame is also one block of bytes (what a worker is handed): 5 arrays of ' + per + ' cells, and the volume made from that block alone is the volume of the pack', fb.length === 5 * per && v1.u.every((x, i) => x === vf.u[i]) && v1.w.every((x, i) => x === vf.w[i]) && v1.vz.every((x, i) => x === vf.vz[i]) && v1.dbz.every((x, i) => x === vf.dbz[i]) && vf.base === pk.h.base && vf.floor === -30);
  const c = pk.corner(10), rl = G.fromLocal(36, -97, 3000, 4000), rb = pk.radarBox(10, rl.lat, rl.lon), bl = pk.boxLatLon(10, 8200, 21000), back = pk.radarBox(10, bl.lat, bl.lon);
  check('the box moves with the storm: its corner at 10 minutes is (' + c.join(', ') + ') m, a radar 3 km east and 4 km north of the scenario\'s point is at (' + rb.x.toFixed(1) + ', ' + rb.y.toFixed(1) + ') in the box, and a point of the box maps to the ground and back',
    close(c[0], -10000 + 8 * 600, 1e-9) && close(c[1], -20000 + 5 * 600, 1e-9) && close(rb.x, 8200, 0.01) && close(rb.y, 21000, 0.01) && close(back.x, 8200, 0.01) && close(back.y, 21000, 0.01));
  check('the clock runs on from 11:50 PM and wraps past midnight (' + [0, 15, 70, 600].map((t) => pk.clock(t).text).join(', ') + ')', pk.clock(0).text === '11:50 PM' && pk.clock(15).text === '12:05 AM' && pk.clock(70).text === '1:00 AM' && pk.clock(600).text === '9:50 AM');
  const s = pk.sample(1, 1500, 500, 600), o1 = pk.sample(1, -1, 0, 0), o2 = pk.sample(1, 0, 0, 1000), k = (0 * ny + 0) * nx + 1;
  check('the model\'s values at a point are those of the cell it is in (ix 1, iy 0, iz 1), and outside the box there are none', s && close(s.u, (((13 + 10 + 1) % 40) - 20) * 0.5 + 8, 1e-6) && s.dbz === ((((nx * ny + 1) * 3) + 1) % 60) - 30 && o1 === null && o2 === null && pk.sample(1, 4000, 0, 0) === null);
  let thrown = 0; try { PK.fromBody(new Uint8Array(body.subarray(0, body.length - 3))); } catch (e) { thrown++; }
  check('a pack that is cut short is refused', thrown === 1);
  const gz = await PK.gunzip(new Uint8Array(Buffer.concat([Buffer.from('HFP1'), gzipSync(body)])));
  let bad = 0; try { await PK.gunzip(new Uint8Array([1, 2, 3, 4, 5])); } catch (e) { bad++; }
  check('the file form is "HFP1" and a gzip stream, read with the browser\'s own DecompressionStream, and anything else is refused', gz.length === body.length && PK.fromBody(gz).n === 3 && bad === 1); }

/* 7. The pack the page ships: the 1 km supercell */
const file = rd('data/severe/packs/wk82-1km-5min.hfp'), pack = PK.fromBody(await PK.gunzip(new Uint8Array(file)));
{ const f12 = pack.frame(12), f0 = pack.frame(0); let mx = -99, m0 = -99; for (let i = 0; i < pack.per; i++) { if (f12.dbz[i] > mx) mx = f12.dbz[i]; if (f0.dbz[i] > m0) m0 = f0.dbz[i]; }
  const sc = pack.scenario, kv = sites.KVNX, tr = pack.track[12], gl = pack.boxLatLon(pack.times[12], tr[0], tr[1]), d60 = G.distBearing(kv[0], kv[1], gl.lat, gl.lon), t90 = pack.track[18], g90 = pack.boxLatLon(pack.times[18], t90[0], t90[1]), d90 = G.distBearing(kv[0], kv[1], g90.lat, g90.lon);
  check('the shipped pack is the 1 km Weisman-Klemp supercell: ' + pack.n + ' frames, 0 to 90 minutes every 5, an 84x84x40 box of 1000 m cells and 500 m levels, moving at (' + pack.motion.u + ', ' + pack.motion.v + ') m/s, no echo at the start and a core of ' + mx + ' dBZ at 60 minutes',
    pack.n === 19 && pack.times[0] === 0 && pack.times[18] === 90 && pack.times.every((t, i) => t === 5 * i) && pack.nx === 84 && pack.ny === 84 && pack.nz === 40 && pack.dx === 1000 && pack.dz === 500 && close(pack.motion.u, 8.0998, 1e-4) && close(pack.motion.v, 4.9419, 1e-4) && m0 <= -30 && mx >= 55 && mx <= 70);
  check('it is laid over northern Oklahoma: the radar the page starts with is KVNX at the scenario\'s point (box position ' + pack.radarBox(0, kv[0], kv[1]).x.toFixed(0) + ', ' + pack.radarBox(0, kv[0], kv[1]).y.toFixed(0) + ' m at the start), the storm is ' + (d60.d / 1000).toFixed(0) + ' km to the ' + Math.round(d60.az) + ' degrees at 60 minutes and ' + (d90.d / 1000).toFixed(0) + ' km away at 90',
    sc.radar === 'KVNX' && close(pack.radarBox(0, kv[0], kv[1]).x, 110000, 150) && close(pack.radarBox(0, kv[0], kv[1]).y, 35000, 150) && d60.d > 25000 && d60.d < 50000 && d60.az > 280 && d60.az < 335 && d90.d > 20000 && d90.d < 45000);
  check('the strongest updraft at 5 km was at (55.5, 40.5) km at 60 minutes (the recorder\'s own log) and the winds are real: a 2 m/s or stronger rise somewhere in the frame', close(tr[0], 55500, 1500) && close(tr[1], 40500, 1500) && tr[2] > 25); }

/* 8. From the pack to a sweep: the scan the workers make */
{ const sc = SC.make(pack), rb = pack.radarBox(pack.times[12], sites.KVNX[0], sites.KVNX[1]), o = { elev: 0.5, x: rb.x, y: rb.y, seed: 12 }, a = sc.scan(12, o), b = sc.scan(12, o), n = a.dbz.length;
  let have = 0, hot = 0, vel = 0, vmax = 0; for (let i = 0; i < n; i++) { if (a.dbz[i] !== SC.NONE) have++; if (a.dbz[i] >= 100) hot++; if (a.vel[i] !== SC.NONE) { vel++; vmax = Math.max(vmax, Math.abs(a.vel[i]) / 2); } }
  check('a scan of the shipped storm: 720 radials of 920 gates, ' + (100 * have / n).toFixed(0) + ' % of the gates with an echo (clear air included), ' + hot + ' of them 50 dBZ or more, velocities up to ' + vmax + ' m/s inside the Nyquist velocity (' + a.meta.nyquist + ')',
    a.meta.nRad === 720 && a.meta.nGates === 920 && n === 662400 && have / n > 0.25 && hot > 500 && vel > 0.2 * n && vmax > 10 && vmax <= a.meta.nyquist + 1);
  let same = true; for (let i = 0; i < n; i++) if (a.dbz[i] !== b.dbz[i] || a.vel[i] !== b.vel[i] || a.sw[i] !== b.sw[i]) { same = false; break; }
  check('the same request gives the same sweep (the speckle is seeded), and the values are in half units with -32768 for none: quant of [1.5, NaN, -3.3, 99999] is ' + Array.from(SC.quant([1.5, NaN, -3.3, 99999])).join(','), same && Array.from(SC.quant([1.5, NaN, -3.3, 99999])).join() === '3,-32768,-7,32767'); }

/* 9. The GPU picture's reference against the operator's own renderer (a sweep of coarse blocks, so that the metres by which a flat plane and a sphere differ cannot move a pixel across a block edge) */
{ const nRad = 72, nGates = 40, dAz = 5, gate = 2000, r0 = 10000, data = new Int16Array(nRad * nGates); let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < data.length; i++) data[i] = rnd() < 0.15 ? SC.NONE : Math.round((rnd() * 110 - 20) * 2);
  const meta = { nRad, nGates, dAz, gate, r0, elev: 19.5 }, kv = sites.KVNX, radar = { lat: kv[0], lon: kv[1] }, lut = PAL.lut(PAL.parse(rd('data/severe/Apocs_BR_Expert.pal').toString()), { step: 0.25, vmin: -40, vmax: 105 });
  const ctr = G.dest(radar.lat, radar.lon, 300, 42000), mpp = G.mppOf(9.4), view = { cx: G.mercX(ctr.lon), cy: G.mercY(ctr.lat), mpp, w: 260, h: 220 };
  const ref = P.reference(meta, data, lut, view, radar, 1), cl = G.local(radar.lat, radar.lon, ctr.lat, ctr.lon), f = new Float32Array(data.length); for (let i = 0; i < f.length; i++) f[i] = data[i] === SC.NONE ? NaN : data[i] / 2;
  const img = K.render({ dbz: f, nRad, nGates, dAz, gate, r0, elev: 19.5 }, lut, { w: view.w, h: view.h, cx: cl.x, cy: cl.y, mpp: mpp * Math.cos(ctr.lat * Math.PI / 180), bg: [0, 0, 0, 0] });
  let same = 0, drawn = 0; for (let i = 0; i < view.w * view.h; i++) { const o = 4 * i; if (ref[o + 3] > 0 || img[o + 3] > 0) { drawn++; if (Math.abs(ref[o] - img[o]) <= 2 && Math.abs(ref[o + 1] - img[o + 1]) <= 2 && Math.abs(ref[o + 2] - img[o + 2]) <= 2 && Math.abs(ref[o + 3] - img[o + 3]) <= 2) same++; } }
  check('the picture the GPU is held to is the operator\'s renderer on a spherical Earth: ' + same + ' of ' + drawn + ' drawn pixels are the colour that render() gives from the same sweep (a sweep of 5 degree by 2 km blocks seen from 42 km away; the rest are block edges, which the convergence of the meridians and the Mercator scale move by up to 0.7 px, where the flat render() has none of that: a mirrored azimuth or a gate off by one would leave 15 %)', drawn > 15000 && same / drawn > 0.93);
  const half = P.reference(meta, data.map((v) => (v === SC.NONE ? v : v)), lut, view, radar, 2.2369362920544);
  let diff = 0; for (let i = 0; i < ref.length; i += 4) if (ref[i + 3] !== half[i + 3] || ref[i] !== half[i]) diff++;
  check('the unit scale multiplies the field before the table (a table in mph reads the same sweep differently: ' + diff + ' pixels change), and a sweep with no data draws nothing', diff > 1000 && P.reference(meta, new Int16Array(data.length).fill(SC.NONE), lut, view, radar, 1).every((v) => v === 0)); }

console.log(`\n${passed} passed, ${failed} failed (${lap()})`);
process.exit(failed ? 1 : 0);
