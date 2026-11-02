#!/usr/bin/env node
// Makes the coastline of the main menu's backdrop (a surface analysis of a tropical cyclone coming ashore on the northern Gulf coast): data/generated/menu-coast.json
// { box: [lonW, lonE, latS, latN], polys: [ flat [x0, y0, dx, dy, ...] in hundredths of a degree ] }. Source: the high-resolution land of the Atlantic page (data/generated/data.json,
// `landHi`), cut to the box (Sutherland-Hodgman) and simplified (Douglas-Peucker, 0.012 degrees, about a kilometre) so that the file is a few KB. The page strokes every edge that
// does not lie on the box and fills the polygons very faintly; tools/build.mjs puts the result into index.html.
//   node tools/make_menu_coast.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BOX = [-100, -75, 18, 39], TOL = 0.012, MIN_DIAG = 0.16;          // (the high-resolution land of the Atlantic page ends at 100 W: its polygons have an edge there, which the page must know as the box's)          // (islands smaller than 0.16 degrees across are left out: the picture is a design, not a chart)
const d = JSON.parse(readFileSync(join(ROOT, 'data/generated/data.json'), 'utf8'));

function decode(flat) { const o = []; let x = 0, y = 0; for (let i = 0; i < flat.length; i += 2) { x += flat[i]; y += flat[i + 1]; o.push([x / 100, y / 100]); } return o; }

/* Sutherland-Hodgman against one side of the box at a time */
function clip(poly, inside, cross) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) out.push(cross(a, b));
  }
  return out;
}
function clipBox(poly, [x0, x1, y0, y1]) {
  const at = (a, b, k, v) => { const t = (v - a[k]) / (b[k] - a[k]); return k === 0 ? [v, a[1] + t * (b[1] - a[1])] : [a[0] + t * (b[0] - a[0]), v]; };
  let p = poly;
  const sides = [[(q) => q[0] >= x0, (a, b) => at(a, b, 0, x0)], [(q) => q[0] <= x1, (a, b) => at(a, b, 0, x1)], [(q) => q[1] >= y0, (a, b) => at(a, b, 1, y0)], [(q) => q[1] <= y1, (a, b) => at(a, b, 1, y1)]];
  for (const [inside, cross] of sides) { if (!p.length) break; p = clip(p, inside, cross); }
  return p;
}

/* Douglas-Peucker on a closed ring: split at the point farthest from the first, simplify the two halves */
function dp(pts, tol) {
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let best = -1, bi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    for (let i = a + 1; i < b; i++) { const dist = len < 1e-12 ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay) : Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / len; if (dist > best) { best = dist; bi = i; } }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function simplifyRing(ring, tol) {
  let far = 1, fd = -1; for (let i = 1; i < ring.length; i++) { const dd = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]); if (dd > fd) { fd = dd; far = i; } }
  const a = dp(ring.slice(0, far + 1), tol), b = dp(ring.slice(far).concat([ring[0]]), tol);
  return a.concat(b.slice(1, -1));
}

const polys = []; let vIn = 0, vOut = 0;
for (const poly of d.landHi) for (const flat of poly) {
  const ring = decode(flat); vIn += ring.length;
  const c = clipBox(ring, BOX); if (c.length < 3) continue;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const p of c) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  if (Math.hypot(x1 - x0, y1 - y0) < MIN_DIAG) continue;
  const s = simplifyRing(c, TOL); if (s.length < 3) continue;
  const q = s.map((p) => [Math.round(p[0] * 100), Math.round(p[1] * 100)]), flatOut = []; let lx = 0, ly = 0;
  for (const [x, y] of q) { flatOut.push(x - lx, y - ly); lx = x; ly = y; }
  polys.push(flatOut); vOut += q.length;
}
writeFileSync(join(ROOT, 'data/generated/menu-coast.json'), JSON.stringify({ box: BOX, polys }));
console.log(`menu coast: ${polys.length} polygons, ${vOut} vertices (from ${vIn}), ${(JSON.stringify({ box: BOX, polys }).length / 1024).toFixed(1)} KB`);
