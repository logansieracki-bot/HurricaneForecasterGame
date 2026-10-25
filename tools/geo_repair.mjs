#!/usr/bin/env node
// Repairs the clipping artifacts that a polygon crossing the antimeridian leaves in a basin's land data (the "Fiji line"): Natural Earth's Vanua
// Levu and Taveuni (about 16.5S, 179E) are drawn from -180 to 180, so clipped to a basin's box they leave (1) a sliver, a polygon a few points
// long and a tenth of a degree tall that spans the whole box, and (2) a spike on the island's ring: two vertices at the far edge of the box
// joined to the island by long, flat edges. Each is a land edge drawn right across the sea at one latitude (the sliver, a polygon, erases a
// stripe of the sea-temperature layer and draws a grey line over the whole basin: the South-West Indian, Australian and South Pacific pages).
//   node tools/geo_repair.mjs [--check] [basin ...]      repairs data/generated/<basin>-data.json in place (--check only reports)
// make_geo.mjs applies the same two functions to what it clips, so a rebuilt file has none of these to begin with.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const LONG = 6, FLAT = 0.1, MAX_RUN = 4;          // a "long flat edge": more than 6 degrees of longitude and at most a tenth of a degree of latitude; a spike is at most 4 vertices between two of them

/* a ring of [lon, lat] that is a clip artifact: few points, several degrees long in one direction and under 0.3 degrees in the other (no real coastline ring is both) */
export function isSliver(ring) {
  if (!ring || ring.length === 0 || ring.length > 30) return false;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of ring) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  return (y1 - y0 < 0.3 && x1 - x0 > 3) || (x1 - x0 < 0.3 && y1 - y0 > 3);
}

/* the ring without its spikes: runs of at most MAX_RUN vertices between two long flat edges are taken out. Edges on the box's own north or south side are left alone (lat0, lat1) */
export function dropSpikes(ring, lat0, lat1) {
  if (!ring || ring.length < 6) return ring;
  const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1], P = closed ? ring.slice(0, -1) : ring.slice(), n = P.length;
  const onBox = (y) => lat0 != null && lat1 != null && (Math.abs(y - lat0) < FLAT || Math.abs(y - lat1) < FLAT);
  const longEdge = (i) => { const a = P[i], b = P[(i + 1) % n]; return Math.abs(b[0] - a[0]) > LONG && Math.abs(b[1] - a[1]) <= FLAT && !onBox(a[1]) && !onBox(b[1]); };
  const E = []; for (let i = 0; i < n; i++) if (longEdge(i)) E.push(i);
  if (E.length < 2) return ring;
  const drop = new Set();
  for (let k = 0; k < E.length; k++) {
    const a = E[k], b = E[(k + 1) % E.length], count = (b - a + n) % n;           // vertices a+1 .. b lie between the edge that leaves the island and the one that comes back
    if (count >= 1 && count <= MAX_RUN) for (let m = 1; m <= count; m++) drop.add((a + m) % n);
  }
  if (!drop.size || drop.size >= n - 2) return ring;
  const out = P.filter((_, i) => !drop.has(i)); if (closed) out.push(out[0].slice());
  return out;
}

/* ---- the files: land polygons are [ring, ring ...] of flat delta lists (first point absolute, in hundredths of a degree) ---- */
const decode = (flat) => { const out = []; let x = flat[0], y = flat[1]; out.push([x / 100, y / 100]); for (let i = 2; i + 1 < flat.length; i += 2) { x += flat[i]; y += flat[i + 1]; out.push([x / 100, y / 100]); } return out; };
const encode = (ring) => { let lx = 0, ly = 0; const out = []; for (const [lon, lat] of ring) { const x = Math.round(lon * 100), y = Math.round(lat * 100); out.push(x - lx, y - ly); lx = x; ly = y; } return out; };

export function repairLand(list, lat0, lat1) {                                    // -> { polys, dropped, spikes }
  const polys = []; let dropped = 0, spikes = 0;
  for (const poly of list) {
    const rings = (Array.isArray(poly[0]) ? poly : [poly]).map(decode);
    if (isSliver(rings[0])) { dropped++; continue; }
    const fixed = rings.map((r) => { const q = dropSpikes(r, lat0, lat1); if (q !== r) spikes++; return q; });
    polys.push(Array.isArray(poly[0]) ? fixed.map(encode) : encode(fixed[0]));
  }
  return { polys, dropped, spikes };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ROOT = dirname(dirname(fileURLToPath(import.meta.url))), args = process.argv.slice(2), check = args.includes('--check');
  const all = ['atlantic', 'eastpacific', 'westpacific', 'nio', 'aus', 'swio', 'spac', 'satl', 'med'], which = args.filter((a) => !a.startsWith('--'));
  for (const b of which.length ? which : all) {
    const file = join(ROOT, 'data/generated', `${b}-data.json`); if (!existsSync(file)) continue;
    const D = JSON.parse(readFileSync(file, 'utf8')), [, , lat0, lat1] = D.box, R = repairLand(D.land, lat0, lat1);
    console.log(`${b}: ${R.dropped} sliver polygons and ${R.spikes} spiked rings in land${check ? '' : ' repaired'}`);
    if (!check && (R.dropped || R.spikes)) { D.land = R.polys; writeFileSync(file, JSON.stringify(D)); }
  }
}
