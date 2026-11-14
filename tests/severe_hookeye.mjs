// Node tests of the weak-echo eye (tools/severe_research/eyes.mjs): the number that says whether the echo of a storm has curled round a weak-echo hole, as a hook does, or only has a bay or a notch open to the clear air.
// From grids of a few cells that can be drawn by hand: a ring, a ring with a gap, a hole at the edge, the thresholds, the levels, and two eyes.
import { eyes } from '../tools/severe_research/eyes.mjs';
import '../src/severe-geo.js';
import '../src/severe-pack.js';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); if (process.env.FAILFAST) process.exit(1); } }
const t0 = Date.now();

/* a grid of nx x ny cells and nz levels, all -30 dBZ, with `cells` [i, j, k, dBZ] put in */
const grid = (nx, ny, nz, cells) => { const d = new Int8Array(nx * ny * nz).fill(-30); for (const [i, j, k, v] of cells) d[(k * ny + j) * nx + i] = v; return d; };
const box = (i0, i1, j0, j1, k, v) => { const out = []; for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push([i, j, k, v]); return out; };
const ring = (i0, i1, j0, j1, k, v) => box(i0, i1, j0, j1, k, v).filter(([i, j]) => i === i0 || i === i1 || j === j0 || j === j1);
const E = (cells, nx = 12, ny = 10, nz = 1, k = 0, T = 30, MIN = 1) => eyes(grid(nx, ny, nz, cells), nx, ny, k, T, MIN);

{
  const r = E(ring(3, 8, 2, 7, 0, 45));
  check('a ring of echo 6 x 6 cells round a hole of 4 x 4 is one eye of 16 cells, in the middle of the ring (' + JSON.stringify(r.eyes) + ')', r.eyes.length === 1 && r.eyes[0].cells === 16 && r.eyes[0].x === 6 && r.eyes[0].y === 5);
  check('and the echo is the ring\'s 20 cells (' + r.echo + ')', r.echo === 20);
  const gap = E(ring(3, 8, 2, 7, 0, 45).filter(([i, j]) => !(i === 8 && j === 4)));
  check('a ring with one cell missing is not an eye: the hole opens to the clear air through the gap (' + gap.eyes.length + ')', gap.eyes.length === 0);
  const corner = E(ring(3, 8, 2, 7, 0, 45).filter(([i, j]) => !(i === 8 && j === 7)));
  check('a ring with a corner cell missing is still shut: the weak echo flows by the sides of cells, not by their corners, so the hole stays an eye of 16 cells (' + JSON.stringify(corner.eyes) + ')', corner.eyes.length === 1 && corner.eyes[0].cells === 16);
}
{
  /* the diagonal case on its own: a hole that the echo shuts in at the corner only */
  const cells = [[2, 1, 0, 45], [3, 2, 0, 45], [1, 2, 0, 45], [2, 3, 0, 45]];                 // a diamond of four cells round the cell (2, 2)
  const r = E(cells, 6, 6);
  check('a hole shut in by cells that touch it at their sides, in a diamond of four, is an eye of one cell (' + JSON.stringify(r.eyes) + ')', r.eyes.length === 1 && r.eyes[0].cells === 1 && r.eyes[0].x === 2.5 && r.eyes[0].y === 2.5);
  const open = E([[2, 1, 0, 45], [3, 2, 0, 45], [1, 2, 0, 45]], 6, 6);
  check('and with one of the four cells missing it is open (' + open.eyes.length + ')', open.eyes.length === 0);
}
{
  const bay = E(box(2, 9, 2, 7, 0, 45).filter(([i, j]) => !(i >= 4 && i <= 6 && j <= 4)));        // a bay cut into a block of echo from its south side
  check('a bay open to the edge of the box is not an eye (' + bay.eyes.length + ')', bay.eyes.length === 0);
  const edge = E(box(0, 5, 0, 9, 0, 45).filter(([i, j]) => !(i >= 2 && i <= 3 && j >= 4 && j <= 5)).concat(ring(6, 7, 0, 9, 0, 45)));
  check('a hole inside the echo is an eye of its 4 cells (' + JSON.stringify(edge.eyes.map((e) => e.cells)) + ') and the clear air outside the block, which reaches the edge of the box, is not one', edge.eyes.length === 1 && edge.eyes[0].cells === 4);
  const atEdge = E(box(0, 6, 0, 6, 0, 45).filter(([i, j]) => !(i === 0 && j >= 2 && j <= 3)));
  check('a hole that touches the edge of the box is outside, however much echo is round it (' + atEdge.eyes.length + ')', atEdge.eyes.length === 0);
}
{
  const sq = (v, inner) => E(ring(3, 8, 2, 7, 0, v).concat(box(4, 7, 3, 6, 0, inner)));
  check('30 dBZ is echo (the threshold is "30 or more"): a ring of 30 dBZ round a hole of 29 is an eye (' + sq(30, 29).eyes.length + '), a ring of 29 is not (' + sq(29, -30).eyes.length + ')', sq(30, 29).eyes.length === 1 && sq(29, -30).eyes.length === 0);
  check('a hole of 30 dBZ is no hole (' + sq(45, 30).eyes.length + ')', sq(45, 30).eyes.length === 0);
  const T40 = eyes(grid(12, 10, 1, ring(3, 8, 2, 7, 0, 45).concat(box(4, 7, 3, 6, 0, 35))), 12, 10, 0, 40, 1), T30 = eyes(grid(12, 10, 1, ring(3, 8, 2, 7, 0, 45).concat(box(4, 7, 3, 6, 0, 35))), 12, 10, 0, 30, 1);
  check('the threshold is a parameter: a hole of 35 dBZ in a ring of 45 is an eye at 40 dBZ (' + T40.eyes.length + ') and not at 30 (' + T30.eyes.length + ')', T40.eyes.length === 1 && T30.eyes.length === 0);
}
{
  const cells = ring(3, 8, 2, 7, 1, 45), up = E(cells, 12, 10, 3, 1), down = E(cells, 12, 10, 3, 0), top = E(cells, 12, 10, 3, 2);
  check('the level is the one asked for: a ring at level 1 is an eye at level 1 (' + up.eyes.length + '), and nothing at levels 0 and 2 (' + down.eyes.length + ', ' + top.eyes.length + ')', up.eyes.length === 1 && down.eyes.length === 0 && top.eyes.length === 0);
  const two = E(ring(1, 4, 1, 4, 0, 45).concat(ring(6, 10, 3, 8, 0, 45)), 12, 10, 1, 0, 30, 1);
  check('two eyes come largest first (' + two.eyes.map((e) => e.cells).join(', ') + '): the 3 x 4 hole and the 2 x 2 one', two.eyes.length === 2 && two.eyes[0].cells === 12 && two.eyes[1].cells === 4);
  const small = E(ring(1, 4, 1, 4, 0, 45).concat(ring(6, 10, 3, 8, 0, 45)), 12, 10, 1, 0, 30, 5);
  check('an eye needs its least size: with 5 cells the hole of 4 is left out (' + small.eyes.map((e) => e.cells).join(', ') + ')', small.eyes.length === 1 && small.eyes[0].cells === 12);
}
{
  /* holes at each side of the box are outside, the weak echo reaches them from the edge itself */
  const blk = (nx, ny, hole) => box(0, nx - 1, 0, ny - 1, 0, 45).filter(([i, j]) => !hole.some(([a, b]) => a === i && b === j));
  const at = (hole, nx = 12, ny = 10) => E(blk(nx, ny, hole), nx, ny).eyes.length;
  const w = at([[0, 4], [0, 5]]), e = at([[11, 4], [11, 5]]), s2 = at([[5, 0], [6, 0]]), n = at([[5, 9], [6, 9]]), inside = at([[5, 4], [6, 4]]);
  check('a hole of two cells at the west edge (' + w + '), at the east (' + e + '), at the south (' + s2 + ') or at the north (' + n + ') is outside, one that is not at an edge is an eye (' + inside + ')', w === 0 && e === 0 && s2 === 0 && n === 0 && inside === 1);
  /* a corridor from each side: the weak echo comes in from the edge and fills the hole that it leads to */
  const room = [[5, 4], [6, 4], [5, 5], [6, 5]], fromW = at(room.concat([[0, 4], [1, 4], [2, 4], [3, 4], [4, 4]])), fromE = at(room.concat([[7, 4], [8, 4], [9, 4], [10, 4], [11, 4]])), fromS = at(room.concat([[5, 0], [5, 1], [5, 2], [5, 3]])), fromN = at(room.concat([[5, 6], [5, 7], [5, 8], [5, 9]]));
  check('a hole with a corridor one cell wide to the west edge (' + fromW + '), the east (' + fromE + '), the south (' + fromS + ') or the north edge (' + fromN + ') is not an eye: the weak echo comes in from the edge', fromW === 0 && fromE === 0 && fromS === 0 && fromN === 0);
  /* the shape of an eye: grown cell by cell from the first of its cells (the lowest row, the leftmost), so it has to go east, north, west and south */
  const stair = E(blk(12, 10, [[5, 3], [5, 4], [4, 4], [3, 4], [3, 5], [3, 6]])).eyes, u = E(blk(12, 10, [[3, 3], [3, 4], [3, 5], [4, 5], [5, 5], [5, 4], [5, 3]])).eyes;
  check('an eye of a stair shape (6 cells, which needs west and north steps from its first cell) is one eye of 6 (' + stair.map((q) => q.cells).join(', ') + ') and a U (7 cells, which needs south steps) one eye of 7 (' + u.map((q) => q.cells).join(', ') + ')', stair.length === 1 && stair[0].cells === 6 && u.length === 1 && u[0].cells === 7);
  const diagHoles = E(blk(6, 6, [[2, 2], [3, 3]]), 6, 6).eyes, antiHoles = E(blk(6, 6, [[3, 2], [2, 3]]), 6, 6).eyes;
  check('two holes that touch at their corners are two eyes (' + diagHoles.map((q) => q.cells).join(', ') + ' and ' + antiHoles.map((q) => q.cells).join(', ') + ' for the other diagonal)', diagHoles.length === 2 && antiHoles.length === 2 && diagHoles[0].cells === 1 && antiHoles[0].cells === 1);
  const edgeEcho = E([[1, 1, 0, 30]]), under = E([[1, 1, 0, 29]]);
  check('a cell of 30 dBZ is echo and one of 29 is not (' + edgeEcho.echo + ' and ' + under.echo + ')', edgeEcho.echo === 1 && under.echo === 0);
}
{
  /* the recorded storms of the page: the weak-echo eye of the echo at 2.25 km (30 dBZ, at least 6 cells), frame by frame */
  const PK = globalThis.HFSeverePack, packOf = (f) => { const raw = readFileSync(new URL('../data/severe/packs/' + f, import.meta.url)), b = gunzipSync(raw.subarray(4)); return PK.fromBody(new Uint8Array(b.buffer, b.byteOffset, b.byteLength)); };
  const eyeSeries = (P, xmax) => Array.from({ length: P.n }, (_, i) => { const r = eyes(P.frame(i).dbz, P.nx, P.ny, Math.floor(2250 / P.dz), 30, 6).eyes.find((e) => e.x * P.dx / 1000 < xmax); return { t: P.times[i], km2: r ? r.cells * (P.dx / 1000) ** 2 : 0 }; });
  const ob = packOf('outbreak-500m.hfp'), big = eyeSeries(ob, 41).filter((e) => e.km2 >= 8), top = Math.max(...eyeSeries(ob, 41).map((e) => e.km2));
  check('the recorded storm of the tornado outbreak day (cells of ' + ob.dx + ' m, ' + ob.n + ' frames from minute ' + ob.times[0] + ' to ' + ob.times[ob.n - 1] + ') has a weak-echo eye of 8 km2 or more at 2.25 km on the hook side of its updraft (the west of the box, under 41 km of its window) in ' + big.length + ' of them (minutes ' + big.map((e) => e.t).join(', ') + '; the largest ' + top.toFixed(1) + ' km2): the echo has curled round a hole, as in a hook',
    ob.dx === 500 && ob.n === 17 && big.length >= 5 && top >= 12 && big.every((e) => e.t >= 80) && big.some((e) => e.t >= 85));
  const one = eyeSeries(packOf('wk82-1km-5min.hfp'), 1e9), hund = eyeSeries(packOf('wk82-100m-nest.hfp'), 1e9);
  check('the other two recorded storms, the 1 km one (' + one.length + ' frames, the largest eye ' + Math.max(...one.map((e) => e.km2)).toFixed(1) + ' km2) and the 100 m one (' + hund.length + ' frames, ' + Math.max(...hund.map((e) => e.km2)).toFixed(1) + ' km2), have no eye of 6 km2 (a notch, a bay and a hole of a few cells, not a hook)', one.every((e) => e.km2 < 6) && hund.every((e) => e.km2 < 6));
}
console.log('\n' + passed + ' passed, ' + failed + ' failed (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
process.exit(failed ? 1 : 0);
