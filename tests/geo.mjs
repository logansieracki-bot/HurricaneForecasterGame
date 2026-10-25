// The land geometry of every basin page: no clip artifacts. A polygon that crosses the antimeridian (Fiji's Vanua Levu and Taveuni, about 16.5S 179E) used to leave, once clipped to a basin's box,
// a sliver and a spike on its island that drew a grey line and a stripe through the sea-temperature layer right across the South-West Indian, Australian and South Pacific pages.
// Pure node: reads data/generated/*-data.json and the repair functions of tools/geo_repair.mjs (which tools/make_geo.mjs applies to what it clips).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isSliver, dropSpikes, repairLand } from '../tools/geo_repair.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); } }

const BASINS = ['atlantic', 'eastpacific', 'westpacific', 'nio', 'aus', 'swio', 'spac', 'satl', 'med'].filter((b) => existsSync(join(ROOT, 'data/generated', `${b}-data.json`)));
const dec = (flat) => { const out = []; let x = flat[0], y = flat[1]; out.push([x / 100, y / 100]); for (let i = 2; i + 1 < flat.length; i += 2) { x += flat[i]; y += flat[i + 1]; out.push([x / 100, y / 100]); } return out; };
const rows = BASINS.map((b) => { const D = JSON.parse(readFileSync(join(ROOT, 'data/generated', `${b}-data.json`), 'utf8')), [, , lat0, lat1] = D.box, R = repairLand(D.land, lat0, lat1);
  let flat = 0; for (const poly of D.land) for (const fl of (Array.isArray(poly[0]) ? poly : [poly])) { const p = dec(fl); for (let i = 1; i < p.length; i++) if (Math.abs(p[i][0] - p[i - 1][0]) > 6 && Math.abs(p[i][1] - p[i - 1][1]) <= 0.1 && Math.abs(p[i][1] - lat0) > 0.1 && Math.abs(p[i][1] - lat1) > 0.1) flat++; }
  return { b, sliver: R.dropped, spikes: R.spikes, flat, n: D.land.length }; });
check(`no basin's land has a sliver polygon or a spiked island (${rows.map((r) => r.b + ' ' + r.sliver + '/' + r.spikes).join(', ')} of ${BASINS.length} basins with a data file: the Atlantic's land is in its own page)`, BASINS.length === 8 && rows.every((r) => r.sliver === 0 && r.spikes === 0));
check(`and none has a long flat coast edge (over 6 degrees of longitude, flat to a tenth of a degree) anywhere but on the box's own north and south sides (${rows.map((r) => r.b + ' ' + r.flat).join(', ')})`, rows.every((r) => r.flat === 0));

// the repair on the shape of the real artifacts
const sliver = [[110, -16.79], [28, -16.79], [28, -16.89], [110, -16.93], [110, -16.79]];
const island = [[179, -16.17], [179, -16.92], [178.97, -16.91], [178.6, -16.8], [178.3, -16.6], [178.4, -16.4], [178.98, -16.47], [179, -16.46], [179, -16.15]];
const spiked = [[87, -16.16]].concat(island, [[87, -16.15], [87, -16.16]]).map((p) => p.slice());
const lone = Array.from({ length: 120 }, (_, i) => [40 + 4 * Math.cos(i / 120 * 6.2832), -20 + 6 * Math.sin(i / 120 * 6.2832)]);
const mada = dropSpikes(spiked, -46, 2);
check(`Fiji's sliver (5 points, 82 degrees long, 0.14 tall) is a clip artifact and a real island of 120 points or a thin box-edge sliver of the same shape at 0.5 degrees is not (${isSliver(sliver)}, ${isSliver(lone)}, ${isSliver(sliver.map((p, i) => [p[0], p[1] - (i % 2 ? 0.4 : 0)]))})`,
  isSliver(sliver) && !isSliver(lone) && !isSliver(sliver.map((p, i) => [p[0], p[1] - (i % 2 ? 0.4 : 0)])));
check(`the spike of two far vertices on an island's ring is taken out and the island's own ${island.length} vertices stay (${spiked.length} -> ${mada.length} points, none west of 178: ${mada.every((p) => p[0] > 178)}), a ring with no spike is left as it is (${dropSpikes(lone, -46, 2) === lone})`,
  mada.length === island.length + 1 && mada.every((p) => p[0] > 178) && dropSpikes(lone, -46, 2) === lone);
const edge = [[30, 2], [100, 2], [100, -3], [60, -4], [30, -3], [30, 2]];
check(`a flat edge on the box's own north side (the coast of a landmass cut by the box) is not a spike (${dropSpikes(edge, -46, 2) === edge})`, dropSpikes(edge, -46, 2) === edge);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
