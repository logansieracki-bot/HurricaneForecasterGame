#!/usr/bin/env node
// Writes data/generated/severe-geo.bin: the baked vector map of the Severe radar page (src/severe.html), all of it public-domain data:
//   states, counties and the outline of the country: the Census cartographic boundary files as the us-atlas package carries them (counties-10m.json, 1:10 million, TopoJSON);
//   roads (interstates, US and state highways), rivers, lakes, land and places: Natural Earth 10m (naturalearthdata.com), from its GitHub mirror;
//   small towns: the US cities table of github.com/kelvins/US-Cities-Database (names and positions from the Census gazetteer, no populations);
//   radar sites: data/generated/severe-sites.json (tools/make_severe_sites.py).
// The sources are downloaded once into data/raw/severe-geo/ (git-ignored; this script runs curl for any file that is missing), the result is a deflated bundle that
// src/severe-geo.js decodes (a header of layers, then varints of 1e-4 degree units; see encodeBundle there). Nothing here is a picture: the page draws the vectors itself.
//   node tools/make_severe_geo.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { deflateRawSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/severe-geo.js';

const G = globalThis.HFSevereGeo, ROOT = dirname(dirname(fileURLToPath(import.meta.url))), RAW = join(ROOT, 'data/raw/severe-geo'), UNIT = 1e-4;
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const SRC = { 'ne_roads.geojson': NE + 'ne_10m_roads.geojson', 'ne_rivers_lc.geojson': NE + 'ne_10m_rivers_lake_centerlines.geojson', 'ne_rivers_na.geojson': NE + 'ne_10m_rivers_north_america.geojson',
  'ne_lakes.geojson': NE + 'ne_10m_lakes.geojson', 'ne_lakes_na.geojson': NE + 'ne_10m_lakes_north_america.geojson', 'ne_places.geojson': NE + 'ne_10m_populated_places_simple.geojson', 'ne_land.geojson': NE + 'ne_10m_land.geojson',
  'us_cities.csv': 'https://raw.githubusercontent.com/kelvins/US-Cities-Database/main/csv/us_cities.csv', 'us-atlas.tgz': 'https://registry.npmjs.org/us-atlas/-/us-atlas-3.0.1.tgz' };
const REGION = [-128, 23, -64, 52], CLIP = [-136, 12, -52, 58];                       // what the page keeps (the lower 48 and a margin), and the rectangle that land polygons are cut to
const STATES = { Alabama: 'AL', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY' };

function need(name) {
  const p = join(RAW, name);
  if (!existsSync(p)) { mkdirSync(RAW, { recursive: true }); console.log('fetching', SRC[name]); execFileSync('curl', ['-sSL', '--fail', '--max-time', '900', '-o', p, SRC[name]], { stdio: 'inherit' }); }
  return p;
}
const json = (name) => JSON.parse(readFileSync(need(name), 'utf8'));
let atlas;
function counties() {
  if (!atlas) { const p = join(RAW, 'counties-10m.json'); if (!existsSync(p)) { execFileSync('tar', ['-xzf', need('us-atlas.tgz'), '-C', RAW, '--strip-components=1', 'package/counties-10m.json']); } atlas = JSON.parse(readFileSync(p, 'utf8')); }
  return atlas;
}

/* ---- geometry helpers (integer units of 1e-4 degree) ---- */
const q = (deg) => Math.round(deg / UNIT);
const inRegion = (lon, lat, r = REGION) => lon >= r[0] && lon <= r[2] && lat >= r[1] && lat <= r[3];
function dpSimplify(pts, tol) {                            // Douglas-Peucker on [[x, y], ...], iterative; the end points stay
  const n = pts.length; if (n < 3 || !(tol > 0)) return pts;
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1; const stack = [[0, n - 1]], t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop(); let dmax = 0, im = -1; const [ax, ay] = pts[a], dx = pts[b][0] - ax, dy = pts[b][1] - ay, L = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      let t = L > 0 ? ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + t * dx - pts[i][0], ey = ay + t * dy - pts[i][1], d = ex * ex + ey * ey; if (d > dmax) { dmax = d; im = i; }
    }
    if (dmax > t2) { keep[im] = 1; stack.push([a, im], [im, b]); }
  }
  const out = []; for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]); return out;
}
function dedupe(pts) { const out = []; for (const p of pts) { const l = out[out.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) out.push(p); } return out; }
function clipLine(coords, r) {                             // the runs of a polyline inside a rectangle (lon, lat degrees)
  const runs = []; let cur = [];
  for (const [x, y] of coords) { if (inRegion(x, y, r)) cur.push([x, y]); else { if (cur.length > 1) runs.push(cur); cur = []; } }
  if (cur.length > 1) runs.push(cur); return runs;
}
function clipRing(ring, r) {                               // Sutherland-Hodgman against the rectangle [x0, y0, x1, y1]
  let pts = ring.slice(0, ring.length - (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? 1 : 0));
  const edges = [[0, r[0], 1], [0, r[2], -1], [1, r[1], 1], [1, r[3], -1]];
  for (const [ax, v, sgn] of edges) {
    const out = [], inside = (p) => sgn * (p[ax] - v) >= 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], ia = inside(a), ib = inside(b);
      const cross = () => { const t = (v - a[ax]) / (b[ax] - a[ax]), o = [0, 0]; o[ax] = v; o[1 - ax] = a[1 - ax] + t * (b[1 - ax] - a[1 - ax]); return o; };
      if (ia && ib) out.push(b); else if (ia && !ib) out.push(cross()); else if (!ia && ib) { out.push(cross()); out.push(b); }
    }
    pts = out; if (!pts.length) break;
  }
  return pts.length >= 3 ? pts : null;
}
const bboxOf = (coords) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of coords) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
const touches = (b, r) => b[2] >= r[0] && b[0] <= r[2] && b[3] >= r[1] && b[1] <= r[3];
const qpts = (coords, tol) => dedupe(dpSimplify(dedupe(coords.map(([x, y]) => [q(x), q(y)])), tol));

/* ---- the country: states, counties and the outline, from the TopoJSON arcs ---- */
function atlasLines() {
  const t = counties(), [sx, sy] = t.transform.scale, [tx, ty] = t.transform.translate, arcs = t.arcs.map((a) => { let x = 0, y = 0; return a.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; }); });
  const use = (obj) => { const m = new Map(); obj.geometries.forEach((g, gi) => { const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : []; for (const poly of polys) for (const ring of poly) for (const a of ring) { const i = a < 0 ? ~a : a; if (!m.has(i)) m.set(i, new Set()); m.get(i).add(gi); } }); return m; };
  const cu = use(t.objects.counties), su = use(t.objects.states), out = { county: [], state: [], outline: [] };
  arcs.forEach((a, i) => {
    if (!a.length || !touches(bboxOf(a), REGION)) return;
    const kind = (su.get(i) || new Set()).size >= 2 ? 'state' : (cu.get(i) || new Set()).size >= 2 ? 'county' : 'outline';
    out[kind].push({ c: 0, p: dedupe(a.map(([x, y]) => [q(x), q(y)])) });
  });
  const labels = { x: [], y: [], c: [], names: [], extra: [] };                  // state names at the middle of the biggest ring
  t.objects.states.geometries.forEach((g) => {
    const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs, name = g.properties.name; if (!STATES[name]) return;
    let best = null, area = 0;
    for (const poly of polys) { const ring = []; for (const a of poly[0]) { const pts = a < 0 ? arcs[~a].slice().reverse() : arcs[a]; for (const p of pts) ring.push(p); }
      const bb = bboxOf(ring), ar = (bb[2] - bb[0]) * (bb[3] - bb[1]); if (ar > area) { area = ar; best = bb; } }
    if (!best) return; labels.x.push(q((best[0] + best[2]) / 2)); labels.y.push(q((best[1] + best[3]) / 2)); labels.c.push(0); labels.names.push(name); labels.extra.push(STATES[name]);
  });
  return { out, labels };
}

/* ---- Natural Earth ---- */
const feats = (name) => json(name).features.filter((f) => f.geometry);               // (a few features of the sources have no geometry)
function roads() {
  const out = [];
  for (const f of feats('ne_roads.geojson')) {
    const p = f.properties; if (p.sov_a3 !== 'USA' || p.type === 'Ferry Route') continue;
    const cls = p.level === 'Interstate' ? 0 : p.level === 'Federal' ? 1 : 2, lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const l of lines) for (const run of clipLine(l, REGION)) { const pts = qpts(run, 4); if (pts.length > 1) out.push({ c: cls, p: pts }); }
  }
  return out;
}
function rivers() {
  const out = [];
  for (const [file, shift] of [['ne_rivers_lc.geojson', 0], ['ne_rivers_na.geojson', 0]]) for (const f of feats(file)) {
    const r = +f.properties.scalerank, cls = r <= 4 ? 0 : r <= 7 ? 1 : r <= 9 ? 2 : 3, lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const l of lines) for (const run of clipLine(l, REGION)) { const pts = qpts(run, 5); if (pts.length > 1) out.push({ c: cls + shift, p: pts }); }
  }
  return out;
}
function polygons(geom) { return geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : []; }
function lakes() {
  const out = [];
  for (const file of ['ne_lakes.geojson', 'ne_lakes_na.geojson']) for (const f of feats(file)) {
    const r = f.properties.scalerank === undefined ? 10 : +f.properties.scalerank, cls = r <= 4 ? 0 : r <= 7 ? 1 : 2;
    for (const poly of polygons(f.geometry)) {
      if (!touches(bboxOf(poly[0]), REGION)) continue;
      const rings = poly.map((ring) => qpts(ring, 4)).filter((g) => g.length >= 4); if (rings.length) out.push({ c: cls, rings });
    }
  }
  return out;
}
function land() {
  const out = [];
  for (const f of feats('ne_land.geojson')) for (const poly of polygons(f.geometry)) {
    if (!touches(bboxOf(poly[0]), CLIP)) continue;
    const rings = []; for (const ring of poly) { const c = clipRing(ring, CLIP); if (c) { const g = qpts(c, 5); if (g.length >= 4) rings.push(g); } }
    if (rings.length) out.push({ c: 0, rings });
  }
  return out;
}
const csv = (text) => text.split('\n').slice(1).filter(Boolean).map((l) => { const f = []; let cur = '', q2 = false; for (const ch of l.replace(/\r$/, '')) { if (ch === '"') q2 = !q2; else if (ch === ',' && !q2) { f.push(cur); cur = ''; } else cur += ch; } f.push(cur); return f; });
function places() {
  const list = [], skip = new Set(['AK', 'HI', 'PR', 'GU', 'VI', 'AS', 'MP']);
  for (const f of feats('ne_places.geojson')) {
    const p = f.properties; if (p.adm0_a3 !== 'USA') continue; const lon = p.longitude, lat = p.latitude; if (!inRegion(lon, lat)) continue;
    const pop = p.pop_max, cls = pop >= 1e6 ? 0 : pop >= 250000 ? 1 : pop >= 100000 ? 2 : pop >= 25000 ? 3 : 4;
    list.push({ lon, lat, c: cls, name: p.name, st: STATES[p.adm1name] || '', pop });
  }
  const have = new Map(); for (const p of list) { const k = p.name.toLowerCase(); if (!have.has(k)) have.set(k, []); have.get(k).push(p); }
  for (const r of csv(readFileSync(need('us_cities.csv'), 'utf8'))) {
    const st = r[1], name = r[3], lat = +r[5], lon = +r[6]; if (skip.has(st) || !inRegion(lon, lat)) continue;
    if ((have.get(name.toLowerCase()) || []).some((p) => Math.abs(p.lon - lon) < 0.3 && Math.abs(p.lat - lat) < 0.3)) continue;
    list.push({ lon, lat, c: 5, name, st, pop: 0 });
  }
  list.sort((a, b) => a.lon - b.lon);
  return list;
}
function sites(pl) {                                        // the radar sites of the lower 48, each named for the nearest sizeable town: "Oklahoma City, OK"
  const S = JSON.parse(readFileSync(join(ROOT, 'data/generated/severe-sites.json'), 'utf8')), big = pl.filter((p) => p.c <= 3), out = { x: [], y: [], c: [], names: [], extra: [] };
  for (const id of Object.keys(S).sort()) {
    const [lat, lon, elev] = S[id]; if (!inRegion(lon, lat) || !/^K/.test(id)) continue;      // (the WSR-88Ds of the lower 48; the terminal Doppler radars (T...) are 5 cm radars with other gates and are left out)
    let best = null, bd = 1e12;                              // the biggest town within 35 km, else the nearest sizeable one (KTLX is at Norman, 28 km from Oklahoma City: "Oklahoma City, OK")
    for (const p of big) { const d = G.distBearing(lat, lon, p.lat, p.lon).d; if (d < 35000 ? (bd >= 35000 || p.c < best.c || (p.c === best.c && d < bd)) : (bd >= 35000 && d < bd)) { bd = d; best = p; } }
    out.x.push(q(lon)); out.y.push(q(lat)); out.c.push(0); out.names.push(id); out.extra.push((best ? best.name + ', ' + best.st : '') + '|' + elev);
  }
  return out;
}

function main() {
  const t0 = Date.now(), A = atlasLines(), pl = places(), L = { land: land(), water: lakes() };
  const lines = { county: A.out.county, state: A.out.state, outline: A.out.outline, road: roads(), river: rivers() };
  const pts = (arr) => ({ x: arr.map((p) => q(p.lon)), y: arr.map((p) => q(p.lat)), c: arr.map((p) => p.c), names: arr.map((p) => p.name), extra: arr.map((p) => p.st) });
  const bundle = G.encodeBundle({ unit: UNIT, lines, polys: L, points: { place: pts(pl), state: A.labels, site: sites(pl) },
    meta: { region: REGION, credit: 'Census cartographic boundaries (us-atlas), Natural Earth, US Cities Database (Census gazetteer): public domain' } });
  const packed = deflateRawSync(Buffer.from(bundle), { level: 9 }), dest = join(ROOT, 'data/generated/severe-geo.bin');
  writeFileSync(dest, packed);
  const n = (a) => a.reduce((s, l) => s + (l.p ? l.p.length : l.rings ? l.rings.reduce((u, r) => u + r.length, 0) : 0), 0);
  console.log(`lines: county ${lines.county.length}/${n(lines.county)}  state ${lines.state.length}/${n(lines.state)}  outline ${lines.outline.length}/${n(lines.outline)}  road ${lines.road.length}/${n(lines.road)}  river ${lines.river.length}/${n(lines.river)}`);
  console.log(`polys: land ${L.land.length}/${n(L.land)}  water ${L.water.length}/${n(L.water)}   points: places ${pl.length}  states ${A.labels.names.length}  sites ${sites(pl).names.length}`);
  console.log(`bundle ${bundle.length} bytes, deflated ${packed.length} bytes -> ${dest}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
main();
