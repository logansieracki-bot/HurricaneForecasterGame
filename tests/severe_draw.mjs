// Node-only tests of the pure geometry of the drawing tool (src/severe-draw.js): contour lines (marching squares) on fields whose level sets are known (a ramp, circles, a saddle, two hills, a grid with holes),
// the symbols along a front, the nearest point of a line, picking an object of a drawing, objects at an hour, undo and redo, and the skew-T chart's formulae. The right answers are the level sets of the fields
// themselves (a circle of radius 3 is 3 from its centre), lengths and angles worked out by hand, and a few known values of the chart (10 g/kg of vapour at 1000 hPa is a dew point of 13.9 C).
import '../src/severe-draw.js';

const D = globalThis.HFSevereDraw;
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const t0 = Date.now();
const field = (nx, ny, f) => { const v = new Float64Array(nx * ny); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = f(i, j); return v; };
const length = (l) => { let s = 0; for (let i = 0; i < l.length - 1; i++) s += Math.hypot(l[i + 1][0] - l[i][0], l[i + 1][1] - l[i][1]); return s; };

/* 1. Contour lines. */
{
  const ramp = D.contourLines(field(5, 4, (i) => i), 5, 4, 1.5);
  check('a ramp (the value is the column) at 1.5 is one line, straight, at x = 1.5, from the first row to the last (' + ramp.length + ' line of ' + (ramp[0] || []).length + ' points)',
    ramp.length === 1 && ramp[0].length === 4 && ramp[0].every((p) => near(p[0], 1.5, 1e-12)) && Math.min(...ramp[0].map((p) => p[1])) === 0 && Math.max(...ramp[0].map((p) => p[1])) === 3);
  const lv = D.contourLines(field(5, 4, (i) => i * 2), 5, 4, 5);
  check('the crossing is placed by linear interpolation (the value is twice the column: 5 is at x = 2.5), and a level that the field does not reach has no line (' + lv[0][0][0] + ', ' + D.contourLines(field(5, 4, (i) => i), 5, 4, 9).length + ')', lv.length === 1 && lv[0].every((p) => near(p[0], 2.5, 1e-12)) && D.contourLines(field(5, 4, (i) => i), 5, 4, 9).length === 0);
  const r = field(12, 12, (i, j) => Math.hypot(i - 5.5, j - 5.5)), c = D.contourLines(r, 12, 12, 3);
  const worst = Math.max(...c[0].map((p) => Math.abs(Math.hypot(p[0] - 5.5, p[1] - 5.5) - 3)));
  check('a field of the distance from a point at 3 is one closed line (' + c.length + ' line, its first point is its last), every point 3 from the centre to ' + worst.toFixed(3) + ' and its length 2 pi 3 = ' + (2 * Math.PI * 3).toFixed(2) + ' to 1.5 % (' + length(c[0]).toFixed(2) + ')',
    c.length === 1 && c[0][0][0] === c[0][c[0].length - 1][0] && c[0][0][1] === c[0][c[0].length - 1][1] && worst < 0.1 && near(length(c[0]), 2 * Math.PI * 3, 0.015 * 2 * Math.PI * 3));
  const two = D.contourLines(field(14, 8, (i, j) => Math.min(Math.hypot(i - 3.5, j - 3.5), Math.hypot(i - 10.5, j - 3.5))), 14, 8, 2);
  check('two hills are two closed lines (' + two.length + ')', two.length === 2 && two.every((l) => l.length > 6 && l[0][0] === l[l.length - 1][0]));
  const open = D.contourLines(field(8, 8, (i, j) => Math.hypot(i, j)), 8, 8, 5);
  check('a circle that leaves the grid is one open line that starts and ends on its edge (' + open.length + ' line, from (' + open[0][0].map((x) => x.toFixed(1)) + ') to (' + open[0][open[0].length - 1].map((x) => x.toFixed(1)) + '))',
    open.length === 1 && open[0][0] !== open[0][open[0].length - 1] && (open[0][0][0] === 0 || open[0][0][1] === 0 || open[0][0][0] === 7 || open[0][0][1] === 7) && (open[0][open[0].length - 1][0] === 7 || open[0][open[0].length - 1][1] === 7 || open[0][open[0].length - 1][0] === 0 || open[0][open[0].length - 1][1] === 0));
  const hi = D.contourLines(Float64Array.from([1, 0, 0, 1]), 2, 2, 0.5), lo = D.contourLines(Float64Array.from([1, 0, 0, 1].map((x) => x * 0.2)), 2, 2, 0.1), lo2 = D.contourLines(Float64Array.from([2, 0, 0, 2]), 2, 2, 0.5);
  check('a saddle (high corners on one diagonal, 1 0 / 0 1 at level 0.5 with a mean of exactly 0.5) is joined through the centre: two lines (' + hi.length + '), and with a mean over the level (2 0 / 0 2 at 0.5) it is two lines that cut off the low corners, with a mean under it (0.2, 0, 0, 0.2 at 0.1: mean 0.1) two that cut off the high ones: all of two points',
    hi.length === 2 && lo2.length === 2 && lo.length === 2 && [hi, lo, lo2].every((g) => g.every((l) => l.length === 2)));
  const sad = (vals, level) => D.contourLines(Float64Array.from(vals), 2, 2, level).map((l) => l.map((p) => p.map((x) => +x.toFixed(3)).join(',')).sort().join(' ')).sort().join(' | ');
  const s5lo = sad([10, 0, 0, 10], 8), s5hi = sad([10, 0, 0, 10], 3), s10lo = sad([0, 10, 10, 0], 8), s10hi = sad([0, 10, 10, 0], 3);
  check('which corners a saddle joins follows its centre, for both diagonals: high corners at the south-west and north-east (10 0 / 0 10, mean 5): at level 8 (centre under it) each high corner is cut off alone, a line round the south-west one and one round the north-east one (' + s5lo + '), at level 3 (centre over it) each low corner is cut off alone (' + s5hi + '); high corners at the south-east and north-west likewise (' + s10lo + ' ; ' + s10hi + ')',
    s5lo === '0,0.2 0.2,0 | 0.8,1 1,0.8' && s5hi === '0,0.7 0.3,1 | 0.7,0 1,0.3' && s10lo === '0,0.8 0.2,1 | 0.8,0 1,0.2' && s10hi === '0,0.3 0.3,0 | 0.7,1 1,0.7');
  const bump = D.contourLines(Float64Array.from([0, 0, 0, 0, 0, 10, 10, 0]), 4, 2, 5), bp = bump.length === 1 ? bump[0].map((p) => p.join(',')) : [];
  check('a line that enters and leaves through the same edge of the grid is one line through all its cells: a bump on the top edge (0 10 10 0 over zeros, level 5) is four points from (0.5, 1) by (1, 0.5) and (2, 0.5) to (2.5, 1) (' + bump.length + ' line: ' + bp.join(' ') + ')',
    bump.length === 1 && (bp.join(' ') === '0.5,1 1,0.5 2,0.5 2.5,1' || bp.join(' ') === '2.5,1 2,0.5 1,0.5 0.5,1'));
  const holes = field(6, 6, (i) => i); holes[2 * 6 + 3] = NaN;
  const hl = D.contourLines(holes, 6, 6, 2.5);
  check('cells with a missing value (NaN) are left out: a ramp with one hole at (3, 2) has a line of 5 cells less the 2 of the column that touch the hole (' + hl.reduce((s, l) => s + l.length - 1, 0) + ' segments)', hl.reduce((s, l) => s + l.length - 1, 0) === 3 && hl.length === 2);
  const many = D.contourLines(field(40, 30, (i, j) => Math.sin(i / 5) + Math.cos(j / 4)), 40, 30, 0.3);
  const ends = new Set(); many.forEach((l) => { for (const e of [l[0], l[l.length - 1]]) ends.add(e.join(',')); });
  check('a wavy field gives lines that never cross themselves or each other\'s ends: every segment is used once (' + many.reduce((s, l) => s + l.length - 1, 0) + ' segments in ' + many.length + ' lines)', many.length > 2 && many.reduce((s, l) => s + l.length - 1, 0) > 40);
}

/* 2. Symbols along a line. */
{
  const s1 = D.symbolsAlong([[0, 0], [100, 0]], 20, 10);
  check('symbols every 20 pixels from 10 along a line of 100: at 10, 30, 50, 70, 90, pointing along it (' + s1.map((s) => s.x).join(', ') + '; angle ' + s1[0].ang + ')', s1.length === 5 && s1.every((s, k) => near(s.x, 10 + 20 * k, 1e-9) && s.y === 0 && s.ang === 0 && near(s.s, 10 + 20 * k, 1e-9)));
  const s2 = D.symbolsAlong([[0, 0], [30, 0], [30, 40]], 25), a = s2.map((s) => [s.x, s.y, +(s.ang).toFixed(4)]);
  check('round a corner (30 along, then 40 up) with the first at half a spacing: at 12.5 on the first piece, 37.5 and 62.5 along it on the second, with the angle of each piece (' + JSON.stringify(a) + ')',
    s2.length === 3 && near(s2[0].x, 12.5, 1e-9) && s2[0].ang === 0 && near(s2[1].x, 30, 1e-9) && near(s2[1].y, 7.5, 1e-9) && near(s2[1].ang, Math.PI / 2, 1e-9) && near(s2[2].y, 32.5, 1e-9));
  check('nothing for a spacing that is not positive (it would never end), and none when the line is shorter than the first one (' + D.symbolsAlong([[0, 0], [10, 0]], 0).length + ', ' + D.symbolsAlong([[0, 0], [5, 0]], 20).length + ')', D.symbolsAlong([[0, 0], [10, 0]], 0).length === 0 && D.symbolsAlong([[0, 0], [10, 0]], -3).length === 0 && D.symbolsAlong([[0, 0], [5, 0]], 20).length === 0);
  const s3 = D.symbolsAlong([[0, 0], [0, 0], [60, 0]], 30, 0);
  check('a repeated point does not matter (and a first at 0 puts one at the start): at 0, 30, 60, all of them numbers (' + s3.map((s) => s.x).join(', ') + ')', s3.length === 3 && s3.every((s, k) => Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.ang) && near(s.x, 30 * k, 1e-9) && s.y === 0 && s.ang === 0));
}

/* 3. The nearest point of a line, an object at an hour and which object a point is on. */
{
  const n = D.nearest([[0, 0], [10, 0], [10, 10]], 6, 3), e = D.nearest([[0, 0], [10, 0]], 14, 3), one = D.nearest([[5, 5]], 8, 9);
  check('the nearest point of a line: (6, 3) is 3 from the first piece at (6, 0), 0.6 along it (' + n.d + ', ' + n.px + ', ' + n.py + ', t ' + n.t + ', piece ' + n.i + '), beyond the end it is the end (' + e.px + ', ' + e.d.toFixed(3) + '), a one-point line is that point (' + one.d + ')',
    near(n.d, 3, 1e-12) && n.px === 6 && n.py === 0 && near(n.t, 0.6, 1e-12) && n.i === 0 && e.px === 10 && near(e.d, 5, 1e-12) && one.d === 5);
  const m = { type: 'front', pts: [[0, 0], [100, 0]], motion: { u: 10, v: -5 } }, m2 = D.moved(m, 2), m3 = D.moved({ type: 'low', x: 1, y: 2, motion: { u: 5, v: 5 } }, 1), still = { type: 'low', x: 1, y: 2 };
  check('an object at an hour is its points moved along its arrow (10 m/s east and 5 south for 2 hours: 72 km east and 36 south), a point object too (5, 5 m/s for an hour: 18 km), the original untouched, and an object with no arrow is itself (' + JSON.stringify(m2.pts) + ', ' + m3.x + ', ' + m3.y + ')',
    m2.pts[0][0] === 72 && m2.pts[0][1] === -36 && m2.pts[1][0] === 172 && m.pts[0][0] === 0 && m3.x === 19 && m3.y === 20 && D.moved(still, 5) === still && D.moved(m, 0) === m);
  const objs = [{ type: 'low', x: 0, y: 0 }, { type: 'front', pts: [[-100, 50], [0, 50], [100, 80]] }, { type: 'high', x: 50, y: -50 }, { type: 'dryline', pts: [[-100, 50], [-100, -50]] }];
  const p1 = D.pick(objs, 2, 1, 5), p2 = D.pick(objs, 40, 60, 5), p3 = D.pick(objs, -100, 49, 5), p4 = D.pick(objs, 51, -49, 5), p5 = D.pick(objs, 300, 300, 5), p6 = D.pick(objs, -60, 50, 5);
  check('picking: a low by its place (' + JSON.stringify(p1) + '), a front by its body (' + JSON.stringify(p2) + '), where two lines meet the topmost (the later one) by its point, the handle winning over the dryline\'s body (' + JSON.stringify(p3) + '), a high (' + JSON.stringify(p4) + '), nothing far from everything (' + p5 + '), a point on the body of the front but not a point (' + JSON.stringify(p6) + ')',
    JSON.stringify(p1) === '{"index":0,"part":"pt:0"}' && JSON.stringify(p2) === '{"index":1,"part":"body"}' && JSON.stringify(p3) === '{"index":3,"part":"pt:0"}' && JSON.stringify(p4) === '{"index":2,"part":"pt:0"}' && p5 === null && JSON.stringify(p6) === '{"index":1,"part":"body"}');
  const q = D.pick([{ type: 'front', pts: [[0, 0], [100, 0]] }], 50, 4, 6), q2 = D.pick([{ type: 'front', pts: [[0, 0], [100, 0]] }], 50, 4, 3.9), q3 = D.pick([{ type: 'front', pts: [[0, 0], [100, 0]] }], 1, 1, 3);
  check('the tolerance is a distance in km: a front 4 km away is picked at 6 and not at 3.9 (' + JSON.stringify(q) + ', ' + q2 + '), and the point of a line wins over its body near it, though the body is nearer (' + JSON.stringify(q3) + ')', q && q.part === 'body' && q2 === null && q3.part === 'pt:0');
  const edge = D.pick([{ type: 'low', x: 10, y: 10 }], 15, 10, 5), edge2 = D.pick([{ type: 'low', x: 10, y: 10 }], 15.001, 10, 5), edge3 = D.pick([{ type: 'front', pts: [[0, 0], [100, 0]] }], 50, 4, 4), edge4 = D.pick([{ type: 'front', pts: [[0, 0], [100, 0]] }], 50, 4.001, 4);
  const edge5 = D.pick([{ type: 'front', pts: [[0, 0], [100, 0]] }], 5, 0, 5), edge6 = D.pick([{ type: 'front', pts: [[0, 0], [100, 0]] }], 5.001, 0, 5);
  check('the tolerance includes its own distance: a low exactly 5 km away is picked at 5 and not at 5 less a hair, a front exactly 4 km away likewise, and a front\'s end exactly 5 km away is picked by its point, a hair further by its body (' + JSON.stringify(edge) + ', ' + edge2 + ', ' + JSON.stringify(edge3) + ', ' + edge4 + ', ' + JSON.stringify(edge5) + ', ' + JSON.stringify(edge6) + ')',
    edge && edge.part === 'pt:0' && edge2 === null && edge3 && edge3.part === 'body' && edge4 === null && edge5.part === 'pt:0' && edge6.part === 'body');
  const two = [{ type: 'front', pts: [[0, 0], [100, 0]] }, { type: 'dryline', pts: [[0, 3], [100, 3]] }], tn = D.pick(two, 50, 1, 5), tn2 = D.pick(two, 50, 2.5, 5), tn3 = D.pick(two, 50, 1.5, 5);
  check('of two bodies in reach it is the nearer that is picked, not the topmost: at y = 1 the first (1 away, the other 2) though it is the lower, at y = 2.5 the second, and at exactly 1.5 from both the topmost (the second): ' + JSON.stringify(tn) + ', ' + JSON.stringify(tn2) + ', ' + JSON.stringify(tn3), tn.index === 0 && tn.part === 'body' && tn2.index === 1 && tn3.index === 1);
  const mv = D.pick([{ type: 'front', pts: [[0, 0], [100, 0]], motion: { u: 10, v: 0 } }], 80, 0, 5, 2), mv2 = D.pick([{ type: 'front', pts: [[0, 0], [100, 0]], motion: { u: 10, v: 0 } }], 150, 0, 5, 2);
  check('at an hour it is the moved object that is picked (after 2 hours the front\'s end is at 172: (80, 0) is on its body, (172, 0) is its end, (150, 0) its body): ' + JSON.stringify(mv) + ', ' + JSON.stringify(D.pick([{ type: 'front', pts: [[0, 0], [100, 0]], motion: { u: 10, v: 0 } }], 172, 0, 5, 2)) + ', ' + JSON.stringify(mv2),
    mv.part === 'body' && D.pick([{ type: 'front', pts: [[0, 0], [100, 0]], motion: { u: 10, v: 0 } }], 172, 0, 5, 2).part === 'pt:1' && mv2.part === 'body' && D.pick([{ type: 'front', pts: [[0, 0], [100, 0]], motion: { u: 10, v: 0 } }], 0, 0, 5, 2) === null);
}

/* 4. Undo and redo. */
{
  const h = D.History({ n: 0 }); h.push({ n: 1 }); h.push({ n: 2 });
  check('undo and redo step through what was pushed (at ' + h.now.n + ': undo ' + h.undo().n + ', undo ' + h.undo().n + ', undo stays ' + h.undo().n + ', redo ' + h.redo().n + ')', h.undo().n === 0 && h.redo().n === 1 && h.redo().n === 2 && h.redo().n === 2 && h.canUndo() && !h.canRedo());
  const g = D.History({ n: 0 }); g.push({ n: 1 }); g.push({ n: 2 }); g.undo(); g.undo(); g.push({ n: 9 });
  check('a push after an undo drops what was undone (it is 9, a redo has nothing: ' + g.redo().n + ', and an undo goes back to 0, not to the 2 that was undone), and the history is limited (a limit of 3 keeps the last three)', g.now.n === 9 && g.redo().n === 9 && !g.canRedo() && g.undo().n === 0 && !g.canUndo() && (() => { const l = D.History({ n: 0 }, 3); for (let i = 1; i <= 5; i++) l.push({ n: i }); let k = 0; while (l.canUndo()) { l.undo(); k++; } return k === 2 && l.now.n === 3; })());
}

/* 5. The skew-T chart. */
{
  const S = D.skewT;
  check('the chart: x is the temperature at 1000 hPa and is skewed 35 degrees per unit of ln p above (' + S.x(20, 1000) + ', ' + S.x(0, 500).toFixed(3) + ' = 35 ln 2), y is ln(1000 / p) and pOfY is its inverse (' + S.y(500).toFixed(4) + ', ' + S.pOfY(S.y(642)).toFixed(6) + ')',
    S.x(20, 1000) === 20 && near(S.x(0, 500), 35 * Math.LN2, 1e-12) && near(S.y(500), Math.LN2, 1e-12) && near(S.pOfY(S.y(642)), 642, 1e-9));
  check('a dry adiabat of 300 K is 26.85 C at 1000 hPa and 300 x 0.5^0.2857 K = ' + (300 * Math.pow(0.5, 0.2857) - 273.15).toFixed(2) + ' C at 500 (' + S.dryAdiabat(300, 1000).toFixed(2) + ', ' + S.dryAdiabat(300, 500).toFixed(2) + ')', near(S.dryAdiabat(300, 1000), 26.85, 1e-9) && near(S.dryAdiabat(300, 500), 300 * Math.pow(0.5, 0.2857) - 273.15, 1e-9));
  check('10 g/kg of vapour at 1000 hPa is a dew point of 13.9 C (' + S.mixingRatioLine(10, 1000).toFixed(2) + '), and at 500 hPa 1 g/kg is -25.1 C (' + S.mixingRatioLine(1, 500).toFixed(2) + ')', near(S.mixingRatioLine(10, 1000), 13.85, 0.1) && near(S.mixingRatioLine(1, 500), -25.1, 0.3));
}

console.log('\n' + passed + ' passed, ' + failed + ' failed (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
process.exit(failed ? 1 : 0);
