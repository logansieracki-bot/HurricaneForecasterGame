#!/usr/bin/env node
// Builds the geography portion of a basin's data.json (land/landOut/b0/b1/mask)
// from Natural Earth (world-atlas) + Natural Earth/TIGER (apexmaps-geo) TopoJSON,
// for a parameterized domain box. No live fetch, no naturalearthdata.com access
// needed -- both packages bundle the actual vector data.
import * as topojson from 'topojson-client';
import * as turf from '@turf/turf';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const NM = join(ROOT, 'node_modules');
const loadTopo = (pkgPath) => JSON.parse(readFileSync(join(NM, pkgPath), 'utf8'));

function ringToDelta(ring) {
  // [lon,lat] pairs -> flat [dx0,dy0,dx1,dy1,...] hundredths-of-degree deltas,
  // first point absolute (matches src/template.html's buildPolys/buildLines decode).
  let lx = 0, ly = 0;
  const out = [];
  for (const [lon, lat] of ring) {
    const x = Math.round(lon * 100), y = Math.round(lat * 100);
    out.push(x - lx, y - ly);
    lx = x; ly = y;
  }
  return out;
}

function encodePolygons(fc) {
  // GeoJSON Feature/FeatureCollection of (Multi)Polygons -> list[ polygon -> list[ ring -> flat[] ] ]
  const polys = [];
  const addPoly = (coords) => polys.push(coords.map(ringToDelta));
  const addGeom = (g) => {
    if (!g) return;
    if (g.type === 'Polygon') addPoly(g.coordinates);
    else if (g.type === 'MultiPolygon') for (const c of g.coordinates) addPoly(c);
  };
  if (fc.type === 'FeatureCollection') for (const f of fc.features) addGeom(f.geometry);
  else addGeom(fc.type === 'Feature' ? fc.geometry : fc);
  return polys;
}

function encodeLines(fc) {
  // GeoJSON Feature/FeatureCollection of (Multi)LineString -> list[ line -> flat[] ]
  const lines = [];
  const addGeom = (g) => {
    if (!g) return;
    if (g.type === 'LineString') lines.push(ringToDelta(g.coordinates));
    else if (g.type === 'MultiLineString') for (const c of g.coordinates) lines.push(ringToDelta(c));
  };
  if (fc.type === 'FeatureCollection') for (const f of fc.features) addGeom(f.geometry);
  else addGeom(fc.type === 'Feature' ? fc.geometry : fc);
  return lines;
}

function isSliverRing(ring) {
  // turf.bboxClip on a huge multi-part polygon (e.g. every landmass on Earth as one feature)
  // can emit a spurious degenerate ring as a clipping artifact: very few points, spanning a
  // huge distance in one dimension while being almost zero-width in the other -- not real
  // coastline (nothing is a hundred-plus degrees long and a hundredth of a degree tall), just
  // a stray seam from the clip. First caught as a fake landmass stretching clear across the
  // Eastern Pacific at one exact latitude, cutting a hole clean across the SST map there.
  if (!Array.isArray(ring) || ring.length === 0 || ring.length > 8) return false;
  try {
    let minLon = 999, maxLon = -999, minLat = 999, maxLat = -999;
    for (const pt of ring) {
      if (!Array.isArray(pt) || pt.length < 2) return false;
      const [lon, lat] = pt;
      if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon; if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    }
    const w = maxLon - minLon, h = maxLat - minLat;
    return (h < 0.1 && w > 3) || (w < 0.1 && h > 3);
  } catch { return false; }
}

function dropSliverPolygons(geom) {
  try {
    if (geom.type === 'Polygon') return isSliverRing(geom.coordinates[0]) ? null : geom;
    if (geom.type === 'MultiPolygon') {
      const kept = geom.coordinates.filter((rings) => !isSliverRing(rings && rings[0]));
      if (!kept.length) return null;
      return kept.length === geom.coordinates.length ? geom : { type: 'MultiPolygon', coordinates: kept };
    }
  } catch { /* fall through */ }
  return geom;
}

function clipToBox(fc, box) {
  // box = [lon0, lat0, lon1, lat1]. Drops empty results; bboxClip throws on some
  // degenerate inputs, so skip those features rather than fail the whole build.
  const out = { type: 'FeatureCollection', features: [] };
  const feats = fc.type === 'FeatureCollection' ? fc.features : [fc];
  for (const f of feats) {
    if (!f.geometry) continue;
    try {
      const clipped = turf.bboxClip(f, box);
      if (!clipped.geometry) continue;
      const geom = dropSliverPolygons(clipped.geometry);
      if (geom && geom.coordinates.length) out.features.push({ ...clipped, geometry: geom });
    } catch { /* skip degenerate geometry */ }
  }
  return out;
}

function rasterizeMask(landFC, lon0, lat1, res, nx, ny) {
  // Point-in-polygon over the fine grid via scanline ray casting per polygon ring,
  // same technique src/template.html's own inRing() uses in the browser.
  const mask = new Uint8Array(nx * ny);
  const polys = [];
  const collect = (g) => {
    if (!g) return;
    if (g.type === 'Polygon') polys.push(g.coordinates);
    else if (g.type === 'MultiPolygon') for (const c of g.coordinates) polys.push(c);
  };
  const feats = landFC.type === 'FeatureCollection' ? landFC.features : [landFC];
  for (const f of feats) collect(f.geometry);

  for (const rings of polys) {
    // bbox of this polygon in grid space, to limit scanline work
    let minLon = 999, maxLon = -999, minLat = 999, maxLat = -999;
    for (const ring of rings) for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    }
    const j0 = Math.max(0, Math.floor((lat1 - maxLat) / res) - 1);
    const j1 = Math.min(ny - 1, Math.ceil((lat1 - minLat) / res) + 1);
    const i0 = Math.max(0, Math.floor((minLon - lon0) / res) - 1);
    const i1 = Math.min(nx - 1, Math.ceil((maxLon - lon0) / res) + 1);
    for (let j = j0; j <= j1; j++) {
      const lat = lat1 - j * res;
      for (let i = i0; i <= i1; i++) {
        const lon = lon0 + i * res;
        let inside = false;
        for (const ring of rings) {
          const n = ring.length;
          for (let a = 0, b = n - 1; a < n; b = a++) {
            const [xa, ya] = ring[a], [xb, yb] = ring[b];
            if ((ya > lat) !== (yb > lat) && lon < (xb - xa) * (lat - ya) / (yb - ya) + xa) inside = !inside;
          }
        }
        if (inside) mask[j * nx + i] = 1;
      }
    }
  }
  return mask;
}

function packBits(mask) {
  const bytes = new Uint8Array(Math.ceil(mask.length / 8));
  for (let k = 0; k < mask.length; k++) if (mask[k]) bytes[k >> 3] |= 1 << (7 - (k & 7));
  return Buffer.from(bytes).toString('base64');
}

export function build(basin, { lon0, lon1, lat0, lat1, padBox }) {
  // [lonW, lonE, latS, latN] -- matches DATA.box's field order in src/template.html
  // (BXL=box[0], BXR=box[1], BYT=mercN(box[3]), BYB=mercN(box[2])), and DATA.bmBox below.
  // West edge is clamped at -180 (the antimeridian) rather than padded past it: padding is just
  // context beyond the simulated domain, and there's nothing meaningful to show past the date
  // line for this basin -- it's where the West Pacific basin starts, not this one's edge fading out.
  const box = [Math.max(-180, lon0 - padBox), lon1 + padBox, lat0 - padBox, lat1 + padBox];
  const clipBox = [box[0], box[2], box[1], box[3]];   // turf wants [minLon, minLat, maxLon, maxLat]

  const worldLand10 = loadTopo('world-atlas/land-10m.json');
  const worldLand50 = loadTopo('world-atlas/land-50m.json');
  const worldCountries10 = loadTopo('world-atlas/countries-10m.json');
  const mx = loadTopo('apexmaps-geo/mx-admin1-10m.json');
  const us = loadTopo('apexmaps-geo/us-states-10m.json');

  const landFC = topojson.feature(worldLand10, worldLand10.objects.land);
  const landClipped = clipToBox(landFC, clipBox);

  const landOutFC = topojson.feature(worldLand50, worldLand50.objects.land);   // global, for context beyond the pan limit

  const countriesMesh = topojson.mesh(worldCountries10, worldCountries10.objects.countries, (a, b) => a !== b);
  const b0Clipped = clipToBox(countriesMesh.type ? { type: 'Feature', geometry: countriesMesh } : countriesMesh, clipBox);

  const mxObjKey = Object.keys(mx.objects)[0];
  const usObjKey = Object.keys(us.objects)[0];
  const mxMesh = topojson.mesh(mx, mx.objects[mxObjKey], (a, b) => a !== b);
  const usMesh = topojson.mesh(us, us.objects[usObjKey], (a, b) => a !== b);
  const b1Clipped = clipToBox({ type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: mxMesh }, { type: 'Feature', geometry: usMesh },
  ] }, clipBox);

  const RES = 0.25;
  const nx = Math.round((lon1 - lon0) / RES) + 1;
  const ny = Math.round((lat1 - lat0) / RES) + 1;
  const maskBox = clipToBox(landFC, [lon0 - 1, lat0 - 1, lon1 + 1, lat1 + 1]);
  const mask = rasterizeMask(maskBox, lon0, lat1, RES, nx, ny);

  const out = {
    box,   // [lonW, lonE, latS, latN] -- the box land/b0/b1 were clipped to, for onBox seam-skipping
    land: encodePolygons(landClipped),
    landOut: encodePolygons(landOutFC),
    b0: encodeLines(b0Clipped),
    b1: encodeLines(b1Clipped),
    lakes: [], lakeNames: [], lakeAreas: [],
    mask: packBits(mask),
  };

  const dest = join(ROOT, 'data', 'generated', `${basin}-geo.json`);
  writeFileSync(dest, JSON.stringify(out));
  console.log(`wrote ${dest}`);
  console.log(`  land polys=${out.land.length} landOut polys=${out.landOut.length} b0 lines=${out.b0.length} b1 lines=${out.b1.length}`);
  console.log(`  mask: ${mask.reduce((a, b) => a + b, 0)} / ${mask.length} land cells (nx=${nx} ny=${ny})`);
  return out;
}

// CLI: node tools/make_geo.mjs eastpacific -140 -74 0 36 [padBoxDeg]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [basin, lon0, lon1, lat0, lat1, pad] = process.argv.slice(2);
  build(basin, { lon0: +lon0, lon1: +lon1, lat0: +lat0, lat1: +lat1, padBox: pad ? +pad : 6 });
}
