// Node-only tests of the initiation zone's pure half (src/severe-zone.js): the random sequence, the length and the area of a drawn line or polygon (worked out by hand), the seeds of a line and of an area (how many, where, when,
// how warm, how far apart, and the same again for the same seed), a zone with no room for what it asks, and the box of the Lab that holds a zone (its size, its place, the seeds in its own coordinates, what a zone too long for it loses).
import '../src/severe-zone.js';

const Z = globalThis.HFSevereZone;
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); if (process.env.FAILFAST) process.exit(1); } }      // (FAILFAST=1: the mutant tool stops at the first check that fails)
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const t0 = Date.now();
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const minGap = (s) => { let m = Infinity; for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) m = Math.min(m, dist(s[i], s[j])); return m; };
const toSegment = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], f = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - a[0] - f * dx, y - a[1] - f * dy); };
const toLine = (s, pts) => { let m = Infinity; for (let i = 1; i < pts.length; i++) m = Math.min(m, toSegment(s.x, s.y, pts[i - 1], pts[i])); return m; };
const throws = (f) => { try { f(); return ''; } catch (e) { return e.message; } };

/* 1. The random sequence: repeatable, in [0, 1), even. */
{
  const a = Z.rng(7), b = Z.rng(7), c = Z.rng(8), xs = Array.from({ length: 20000 }, () => a()), ys = Array.from({ length: 20000 }, () => b()), zs = Array.from({ length: 20 }, () => c());
  check('a seed gives the same sequence every time (20000 numbers equal) and another seed another (' + xs.slice(0, 2).map((v) => v.toFixed(4)).join(', ') + ' against ' + zs.slice(0, 2).map((v) => v.toFixed(4)).join(', ') + ')', xs.every((v, i) => v === ys[i]) && zs.some((v, i) => v !== xs[i]) && zs.filter((v, i) => v === xs[i]).length < 3);
  const bins = new Array(10).fill(0); for (const v of xs) bins[Math.min(9, Math.floor(v * 10))]++;
  const mean = xs.reduce((p, v) => p + v, 0) / xs.length, chi = bins.reduce((p, n) => p + (n - 2000) ** 2 / 2000, 0);
  check('its numbers are in [0, 1) and even: the mean ' + mean.toFixed(4) + ' (0.5), ten bins of about 2000 each (chi-square ' + chi.toFixed(1) + ' of 9 degrees of freedom: under 27.9 at 0.1 %), no value twice in a row', xs.every((v) => v >= 0 && v < 1) && near(mean, 0.5, 0.01) && chi < 27.9 && xs.every((v, i) => i === 0 || v !== xs[i - 1]));
  const k = Z.rng(1), k1 = k(), k2 = k(), k3 = k();
  check('it is mulberry32: the first numbers of the seed 1 are those of the published generator (' + k1 + ', ' + k2 + ', ' + k3 + ')', k1 === 0.6270739405881613 && k2 === 0.002735721180215478 && k3 === 0.5274470399599522 && Z.rng(42)() === 0.6011037519201636);
  const d0 = Z.rng(0), d1 = Z.rng(0.7);
  check('a seed of 0, a fraction or a negative number still gives a sequence (' + d0().toFixed(4) + ', ' + d1().toFixed(4) + ', ' + Z.rng(-5)().toFixed(4) + ')', [d0(), d1(), Z.rng(-5)()].every((v) => v >= 0 && v < 1));
}

/* 2. The length of a line and the area of a polygon. */
{
  check('a polyline is as long as its pieces: 3-4-5 is 5000 m, an L of 3000 and 4000 is 7000 m, three pieces of 1000 along a bend are 3000 m, one point is 0 (' + [[[0, 0], [3000, 4000]], [[0, 0], [3000, 0], [3000, 4000]], [[0, 0], [1000, 0], [1000, 1000], [2000, 1000]], [[5, 5]]].map((p) => Z.length(p)).join(', ') + ')',
    near(Z.length([[0, 0], [3000, 4000]]), 5000, 1e-9) && near(Z.length([[0, 0], [3000, 0], [3000, 4000]]), 7000, 1e-9) && near(Z.length([[0, 0], [1000, 0], [1000, 1000], [2000, 1000]]), 3000, 1e-9) && Z.length([[5, 5]]) === 0);
  check('a polygon\'s area is the shoelace\'s, the same either way round: a square of 1000 m is 1e6, the 3-4 triangle 6e6, an L of three squares 3e6, a line 0 (' + [[[0, 0], [1000, 0], [1000, 1000], [0, 1000]], [[0, 0], [0, 1000], [1000, 1000], [1000, 0]], [[0, 0], [4000, 0], [0, 3000]], [[0, 0], [2000, 0], [2000, 1000], [1000, 1000], [1000, 2000], [0, 2000]], [[0, 0], [5, 5]]].map((p) => Z.area(p)).join(', ') + ')',
    near(Z.area([[0, 0], [1000, 0], [1000, 1000], [0, 1000]]), 1e6, 1e-6) && near(Z.area([[0, 0], [0, 1000], [1000, 1000], [1000, 0]]), 1e6, 1e-6) && near(Z.area([[0, 0], [4000, 0], [0, 3000]]), 6e6, 1e-6)
    && near(Z.area([[0, 0], [2000, 0], [2000, 1000], [1000, 1000], [1000, 2000], [0, 2000]]), 3e6, 1e-6) && Z.area([[0, 0], [5, 5]]) === 0);
}

/* 3. The seeds of a line. */
{
  const line = [[0, 0], [200000, 0]], zn = { kind: 'line', pts: line, density: 3, window: [10, 30], strength: 3 }, s = Z.draw(zn), s2 = Z.draw(zn), s3 = Z.draw(Object.assign({}, zn, { seed: 2 }));
  check('a line of 200 km with 3 seeds to every 100 km has 6 (' + s.length + '), the same list for the same seed (' + JSON.stringify(s) .length + ' characters equal) and another for another (' + (JSON.stringify(s) === JSON.stringify(s3)) + ')', s.length === 6 && JSON.stringify(s) === JSON.stringify(s2) && JSON.stringify(s) !== JSON.stringify(s3));
  check('they lie on the line, within half of the width (20 km: 10 km) either side (the largest ' + Math.max(...s.map((q) => Math.abs(q.y))).toFixed(0) + ' m) and within its ends (x from ' + Math.min(...s.map((q) => q.x)).toFixed(0) + ' to ' + Math.max(...s.map((q) => q.x)).toFixed(0) + ')', s.every((q) => Math.abs(q.y) <= 10000 && q.x >= 0 && q.x <= 200000));
  check('no two are nearer than the spacing (12 km: the nearest pair ' + minGap(s).toFixed(0) + ' m), they go off in the window (10 to 30 minutes: ' + Math.min(...s.map((q) => q.t)).toFixed(1) + ' to ' + Math.max(...s.map((q) => q.t)).toFixed(1) + '), in the order of their times, and each is within a fifth of the strength (3 K: ' + Math.min(...s.map((q) => q.amp)).toFixed(2) + ' to ' + Math.max(...s.map((q) => q.amp)).toFixed(2) + ')',
    minGap(s) >= 12000 && s.every((q) => q.t >= 10 && q.t <= 30 && q.amp >= 2.4 && q.amp <= 3.6) && s.every((q, i) => i === 0 || q.t >= s[i - 1].t));
  const wide = Z.draw({ kind: 'line', pts: line, density: 30, spacing: 1000, width: 40000 }), left = wide.filter((q) => q.y > 0).length, right = wide.filter((q) => q.y < 0).length;
  check('a wide line has seeds on both sides of it (' + left + ' to the left, ' + right + ' to the right of 60) and the offset reaches out to its width (the farthest ' + Math.max(...wide.map((q) => Math.abs(q.y))).toFixed(0) + ' m of 20000)', wide.length === 60 && left > 15 && right > 15 && Math.max(...wide.map((q) => Math.abs(q.y))) > 15000 && wide.every((q) => Math.abs(q.y) <= 20000));
  const diag = [[0, 0], [100000, 100000]], dg = Z.draw({ kind: 'line', pts: diag, density: 40, spacing: 1000, width: 20000 }), bend = [[0, 0], [50000, 0], [50000, 50000]], bd = Z.draw({ kind: 'line', pts: bend, density: 40, spacing: 1000, width: 20000 });
  check('the width is across the line, whichever way it goes: along a diagonal every seed is within 10 km of it (the farthest ' + Math.max(...dg.map((q) => toLine(q, diag))).toFixed(0) + ' m of ' + dg.length + ') and along a bend of two pieces too (' + Math.max(...bd.map((q) => toLine(q, bend))).toFixed(0) + ' m of ' + bd.length + '), and the diagonal\'s seeds are spread along all of it (x from ' + Math.min(...dg.map((q) => q.x)).toFixed(0) + ' to ' + Math.max(...dg.map((q) => q.x)).toFixed(0) + ')',
    dg.length === 57 && dg.every((q) => toLine(q, diag) <= 10000 + 1e-6) && bd.length === 40 && bd.every((q) => toLine(q, bend) <= 10000 + 1e-6) && Math.min(...dg.map((q) => q.x)) < 20000 && Math.max(...dg.map((q) => q.x)) > 80000
    && bd.some((q) => q.y > 20000) && bd.some((q) => q.x < 30000 && q.y < 5000) && bd.some((q) => q.y > 30000 && Math.abs(q.x - 50000) <= 10000));
  check('the offset is across the line and reaches its width (the farthest seed of the diagonal is ' + Math.max(...dg.map((q) => toLine(q, diag))).toFixed(0) + ' m from it, of 10000; of the bend ' + Math.max(...bd.map((q) => toLine(q, bend))).toFixed(0) + '), on both sides of it (' + dg.filter((q) => q.y > q.x).length + ' above the diagonal, ' + dg.filter((q) => q.y < q.x).length + ' below), and the seeds of the second piece of the bend are along all of it, not heaped at its end (' + bd.filter((q) => q.x > 40000 && q.y > 10000 && q.y < 40000).length + ' of the 40 in its middle half, ' + bd.filter((q) => q.x > 40000 && q.y > 45000).length + ' at its end)',
    Math.max(...dg.map((q) => toLine(q, diag))) > 8000 && Math.max(...bd.map((q) => toLine(q, bend))) > 8000 && dg.filter((q) => q.y > q.x).length > 15 && dg.filter((q) => q.y < q.x).length > 15 && bd.filter((q) => q.x > 40000 && q.y > 10000 && q.y < 40000).length >= 5 && bd.filter((q) => q.x > 40000 && q.y > 45000).length < 15);
  const dflt = Z.draw({ kind: 'line', pts: [[0, 0], [100000, 0]] });
  check('a line with nothing but its points is 3 seeds to 100 km of 3 K (2.4 to 3.6) at the start, 20 km wide, 12 km apart (' + dflt.length + ' seeds, t ' + dflt.map((q) => q.t).join(',') + ', amp ' + dflt.map((q) => q.amp.toFixed(2)).join(', ') + ')',
    dflt.length === 3 && dflt.every((q) => q.t === 0 && q.amp >= 2.4 && q.amp <= 3.6 && Math.abs(q.y) <= 10000) && minGap(dflt) >= 12000 && JSON.stringify(dflt) === JSON.stringify(Z.draw({ kind: 'line', pts: [[0, 0], [100000, 0]], seed: 1, width: 20000, density: 3, strength: 3, spacing: 12000, window: [0, 0] })));
  const rev = Z.draw({ kind: 'line', pts: line, window: [30, 10], density: 30, spacing: 1000 }), fwd = Z.draw({ kind: 'line', pts: line, window: [10, 30], density: 30, spacing: 1000 });
  check('the seeds go off all through the window, and one given the wrong way round (30, 10) is the same window: of 60 seeds the times run from ' + Math.min(...fwd.map((q) => q.t)).toFixed(1) + ' to ' + Math.max(...fwd.map((q) => q.t)).toFixed(1) + ' for the window 10 to 30, and from ' + Math.min(...rev.map((q) => q.t)).toFixed(1) + ' to ' + Math.max(...rev.map((q) => q.t)).toFixed(1) + ' for 30 to 10 (the same seeds, ' + (JSON.stringify(rev) === JSON.stringify(fwd)) + ')',
    fwd.length === 60 && fwd.every((q) => q.t >= 10 && q.t <= 30) && Math.min(...fwd.map((q) => q.t)) < 12 && Math.max(...fwd.map((q) => q.t)) > 28 && JSON.stringify(rev) === JSON.stringify(fwd));
  const hot = Z.draw({ kind: 'line', pts: line, strength: 10 });
  check('the strength is the bubbles\' (10 K: ' + Math.min(...hot.map((q) => q.amp)).toFixed(2) + ' to ' + Math.max(...hot.map((q) => q.amp)).toFixed(2) + ', and not all the same: ' + (new Set(hot.map((q) => q.amp)).size) + ' values)', hot.every((q) => q.amp >= 8 && q.amp <= 12) && new Set(hot.map((q) => q.amp)).size > 3 && Math.min(...hot.map((q) => q.amp)) < 10 && Math.max(...hot.map((q) => q.amp)) > 10);
  const tight = Z.draw({ kind: 'line', pts: [[0, 0], [10000, 0]], density: 30, width: 4000 });
  check('a place that cannot hold what is asked gets fewer, never closer: 10 km of line 4 km wide with 3 seeds asked for and 12 km between them holds ' + tight.length + ' (' + minGap(tight).toFixed(0) + ' m apart)', tight.length >= 1 && tight.length < 3 && (tight.length < 2 || minGap(tight) >= 12000));
  const few = Z.draw({ kind: 'line', pts: [[0, 0], [10000, 0]], density: 0.5 });
  check('a line too short for its density still has one seed (a tenth of a seed rounds to none, and a zone with none would be no zone: ' + few.length + ')', few.length === 1);
}

/* 4. The seeds of an area. */
{
  const sq = [[0, 0], [100000, 0], [100000, 100000], [0, 100000]], zn = { kind: 'area', pts: sq, density: 1, window: [0, 20] }, s = Z.draw(zn);
  check('an area of 100 km by 100 km (10 thousand km2) with 1 seed to every thousand km2 has 10 (' + s.length + '), all inside it (' + Math.min(...s.map((q) => Math.min(q.x, q.y))).toFixed(0) + ' to ' + Math.max(...s.map((q) => Math.max(q.x, q.y))).toFixed(0) + ' m), 12 km apart at the least (' + minGap(s).toFixed(0) + ' m), in the window (0 to 20) and the same for the same seed',
    s.length === 10 && s.every((q) => q.x >= 0 && q.x <= 100000 && q.y >= 0 && q.y <= 100000 && q.t >= 0 && q.t <= 20 && q.amp >= 2.4 && q.amp <= 3.6) && minGap(s) >= 12000 && JSON.stringify(s) === JSON.stringify(Z.draw(zn)) && Math.max(...s.map((q) => q.x)) > 70000 && Math.min(...s.map((q) => q.x)) < 30000);
  const ell = [[0, 0], [100000, 0], [100000, 50000], [50000, 50000], [50000, 100000], [0, 100000]], el = Z.draw({ kind: 'area', pts: ell, density: 4, spacing: 3000 });
  check('an L-shaped area has no seed in its notch (the corner x > 50 km and y > 50 km): ' + el.length + ' seeds of 30 expected (7500 km2 at 4 to the thousand), ' + el.filter((q) => q.x > 50000 && q.y > 50000).length + ' of them in the notch, all inside the 100 km square (' + el.every((q) => q.x >= 0 && q.x <= 100000 && q.y >= 0 && q.y <= 100000) + ')', el.length === 30 && el.every((q) => !(q.x > 50000 && q.y > 50000) && q.x >= 0 && q.y >= 0 && q.x <= 100000 && q.y <= 100000) && el.some((q) => q.x > 50000 && q.y < 50000) && el.some((q) => q.y > 50000 && q.x < 50000));
  const tri = [[0, 0], [100000, 0], [0, 100000]], tr = Z.draw({ kind: 'area', pts: tri, density: 6, spacing: 2000 });
  check('a triangle holds its seeds under its slanted side (x + y within 100 km: ' + Math.max(...tr.map((q) => q.x + q.y)).toFixed(0) + ' m at the most; ' + tr.length + ' seeds of 30 expected: 5000 km2 at 6 to the thousand)', tr.length === 30 && tr.every((q) => q.x >= 0 && q.y >= 0 && q.x + q.y <= 100000));
  const cw = Z.draw({ kind: 'area', pts: sq.slice().reverse(), density: 1 }), other = Z.draw({ kind: 'area', pts: [sq[2], sq[3], sq[0], sq[1]], density: 1 });
  check('a polygon drawn the other way round, or from another corner (so that its closing side is the east one), is the same area (' + cw.length + ' and ' + other.length + ' seeds of 10, all inside: ' + (cw.every((q) => q.x >= 0 && q.x <= 100000 && q.y >= 0 && q.y <= 100000) && other.every((q) => q.x >= 0 && q.x <= 100000 && q.y >= 0 && q.y <= 100000)) + ')', cw.length === 10 && other.length === 10 && other.every((q) => q.x >= 0 && q.x <= 100000 && q.y >= 0 && q.y <= 100000));
  const dflt = Z.draw({ kind: 'area', pts: sq });
  check('an area with nothing but its points is 1 seed to every thousand km2 (' + dflt.length + ' of 10), of 3 K, at the start (' + dflt.map((q) => q.t).join(',') + ')', dflt.length === 10 && dflt.every((q) => q.t === 0 && q.amp >= 2.4 && q.amp <= 3.6));
  const rect = [[50000, 30000], [110000, 30000], [110000, 70000], [50000, 70000]], rc = Z.draw({ kind: 'area', pts: rect, density: 10, spacing: 2000 }), tall = [[0, 0], [40000, 0], [40000, 60000], [0, 60000]], tl = Z.draw({ kind: 'area', pts: tall, density: 10, spacing: 2000 });
  check('an area away from the origin and one longer than wide are filled all over: 60 km by 40 km at (50, 30) km has ' + rc.length + ' seeds of 24, in x from ' + Math.min(...rc.map((q) => q.x)).toFixed(0) + ' to ' + Math.max(...rc.map((q) => q.x)).toFixed(0) + ' (50000 to 110000) and y from ' + Math.min(...rc.map((q) => q.y)).toFixed(0) + ' to ' + Math.max(...rc.map((q) => q.y)).toFixed(0) + ' (30000 to 70000); 40 km by 60 km has ' + tl.length + ' of 24, y up to ' + Math.max(...tl.map((q) => q.y)).toFixed(0) + ' (60000)',
    rc.length === 24 && rc.every((q) => q.x >= 50000 && q.x <= 110000 && q.y >= 30000 && q.y <= 70000) && Math.max(...rc.map((q) => q.x)) > 95000 && Math.min(...rc.map((q) => q.x)) < 65000 && Math.max(...rc.map((q) => q.y)) > 60000 && Math.min(...rc.map((q) => q.y)) < 40000
    && tl.length === 24 && tl.every((q) => q.x >= 0 && q.x <= 40000 && q.y >= 0 && q.y <= 60000) && Math.max(...tl.map((q) => q.y)) > 50000 && Math.min(...tl.map((q) => q.y)) < 10000);
  const u = [[0, 0], [100000, 0], [100000, 100000], [70000, 100000], [70000, 30000], [30000, 30000], [30000, 100000], [0, 100000]], us = Z.draw({ kind: 'area', pts: u, density: 4, spacing: 3000 });
  check('a U-shaped area (7200 km2) has its seeds in its arms and its base and none in the gap between the arms (x between 30 and 70 km, y over 30 km): ' + us.length + ' seeds of 29, ' + us.filter((q) => q.x > 30000 && q.x < 70000 && q.y > 30000).length + ' in the gap, ' + us.filter((q) => q.x < 30000).length + ' in the west arm, ' + us.filter((q) => q.x > 70000).length + ' in the east one',
    us.length === 29 && us.every((q) => !(q.x > 30000 && q.x < 70000 && q.y > 30000) && q.x >= 0 && q.x <= 100000 && q.y >= 0 && q.y <= 100000) && us.some((q) => q.x < 30000 && q.y > 30000) && us.some((q) => q.x > 70000 && q.y > 30000) && us.some((q) => q.x > 30000 && q.x < 70000 && q.y < 30000));
}

/* 5. A zone that is not one. */
{
  const ln = [[0, 0], [1000, 0]];
  check('a zone is a line or an area (' + throws(() => Z.draw({ kind: 'blob', pts: ln })) + '; ' + throws(() => Z.draw(null)) + ')', /a line or an area/.test(throws(() => Z.draw({ kind: 'blob', pts: ln }))) && /a line or an area/.test(throws(() => Z.draw(null))));
  check('a line needs two points and an area three, all numbers (' + [throws(() => Z.draw({ kind: 'line', pts: [[0, 0]] })), throws(() => Z.draw({ kind: 'area', pts: ln })), throws(() => Z.draw({ kind: 'line', pts: [[0, 0], [NaN, 1]] })), throws(() => Z.draw({ kind: 'line', pts: 'no' }))].join('; ') + ')',
    /line needs at least 2/.test(throws(() => Z.draw({ kind: 'line', pts: [[0, 0]] }))) && /area needs at least 3/.test(throws(() => Z.draw({ kind: 'area', pts: ln }))) && /needs at least 2/.test(throws(() => Z.draw({ kind: 'line', pts: [[0, 0], [NaN, 1]] }))) && /needs at least 2/.test(throws(() => Z.draw({ kind: 'line', pts: 'no' }))));
  const bad = [{ width: -1 }, { density: 0 }, { density: -2 }, { spacing: -5 }, { window: [-1, 5] }, { window: [0, Infinity] }, { strength: NaN }, { density: 'a lot' }];
  check('a negative width, spacing or start, no density, a window that does not end and a strength that is not a number are refused (' + bad.map((o) => throws(() => Z.draw(Object.assign({ kind: 'line', pts: ln }, o))) !== '').join(',') + ')', bad.every((o) => /must be numbers/.test(throws(() => Z.draw(Object.assign({ kind: 'line', pts: ln }, o))))));
  check('a width of 0 is a line of seeds on it, a spacing of 0 allows seeds on top of each other, a strength of 0 is a bubble of no warmth (' + Z.draw({ kind: 'line', pts: [[0, 0], [100000, 0]], width: 0 }).every((q) => q.y === 0) + ', ' + Z.draw({ kind: 'line', pts: ln, spacing: 0, density: 3000 }).length + ' seeds of 3 in 1 km, ' + Z.draw({ kind: 'line', pts: ln, strength: 0 })[0].amp + ' K)',
    Z.draw({ kind: 'line', pts: [[0, 0], [100000, 0]], width: 0 }).every((q) => q.y === 0) && Z.draw({ kind: 'line', pts: ln, spacing: 0, density: 3000 }).length === 30 && Z.draw({ kind: 'line', pts: ln, strength: 0 })[0].amp === 0);
}

/* 6. The box of the Lab that holds a zone. */
{
  const ln = [[0, 0], [200000, 0]], p = Z.plan({ kind: 'line', pts: ln, density: 3 });
  check('a line of 200 km is held by the largest box, 200 km of 100 cells of 2 km (' + p.box.L + ' m, ' + p.box.n + ' cells), centred on the zone\'s bounding box (the middle of the zone at ' + (p.box.x0 + p.box.L / 2) + ', ' + (p.box.y0 + p.box.L / 2) + ' for 100000, 0), and all 6 seeds are in it (' + p.seeds.length + ', dropped ' + p.dropped + ')',
    p.box.L === 200000 && p.box.n === 100 && p.box.x0 + p.box.L / 2 === 100000 && p.box.y0 + p.box.L / 2 === 0 && p.seeds.length === 6 && p.dropped === 0);
  const raw = Z.draw({ kind: 'line', pts: ln, density: 3 });
  check('the seeds are in the box\'s own coordinates, from its south-west corner: each is the zone\'s own less the corner (' + p.seeds.map((q) => q.x.toFixed(0) + ',' + q.y.toFixed(0)).slice(0, 2).join(' ; ') + '), with their times and amplitudes, and all inside the box',
    p.seeds.length === raw.length && p.seeds.every((q, i) => q.x === raw[i].x - p.box.x0 && q.y === raw[i].y - p.box.y0 && q.t === raw[i].t && q.amp === raw[i].amp && q.x >= 0 && q.x < p.box.L && q.y >= 0 && q.y < p.box.L));
  const small = Z.plan({ kind: 'line', pts: [[0, 0], [1000, 0]] }), mid = Z.plan({ kind: 'line', pts: [[0, 0], [30000, 0]] }), tiny = Z.plan({ kind: 'line', pts: [[0, 0], [5000, 0]] });
  check('a short line gets the smallest box (84 km: ' + small.box.L + ' for a line of 1 km), a line of 30 km the room for it and 40 km each side of it (110 km: ' + mid.box.L + '), and one that needs a little more than the smallest a little more (5 km and its margins, 85 km, is 86 km of whole cells: ' + tiny.box.L + ')', small.box.L === 84000 && small.box.n === 42 && mid.box.L === 110000 && mid.box.n === 55 && tiny.box.L === 86000 && tiny.box.n === 43);
  const dx3 = Z.plan({ kind: 'line', pts: [[0, 0], [30000, 0]] }, { dx: 3000, margin: 30000, min: 60000, max: 120000 }), dx3b = Z.plan({ kind: 'line', pts: [[0, 0], [10000, 0]] }, { dx: 3000, margin: 30000, min: 60000, max: 120000 });
  check('the box is whole cells of the cell asked for, its margin and its smallest and largest are the options (cells of 3 km, 30 km of margin: 30 + 60 = 90 km, ' + dx3.box.L + '; the smallest 60 km, ' + dx3b.box.L + ' for a 10 km line and its margins of 70 km rounded up to cells: 72 km, so the 72 km it is)', dx3.box.L === 90000 && dx3.box.n === 30 && dx3b.box.L === 72000 && dx3b.box.n === 24 && Z.plan({ kind: 'line', pts: [[0, 0], [300000, 0]] }, { dx: 3000, max: 120000 }).box.L === 120000);
  const long = Z.plan({ kind: 'line', pts: [[0, 0], [300000, 0]], density: 3 }), allLong = Z.draw({ kind: 'line', pts: [[0, 0], [300000, 0]], density: 3 });
  check('a line longer than the box can hold is cut at the box\'s ends: of 9 seeds along 300 km the box of 200 km, centred on 150 km, keeps those between 50 and 250 km (' + long.seeds.length + ' kept, ' + long.dropped + ' dropped, of ' + allLong.length + '), and all it keeps are inside it',
    long.box.L === 200000 && allLong.length === 9 && long.dropped === allLong.filter((q) => q.x < 50000 || q.x >= 250000 || Math.abs(q.y) >= 100000).length && long.dropped > 0 && long.seeds.length === 9 - long.dropped && long.seeds.every((q) => q.x >= 0 && q.x < 200000 && q.y >= 0 && q.y < 200000));
  const odd = Z.plan({ kind: 'line', pts: [[0, 0], [30000, 0]] }, { dx: 3000, margin: 30000, min: 60000, max: 100000 }), big = Z.plan({ kind: 'line', pts: [[0, 0], [300000, 0]] }, { dx: 3000, margin: 30000, min: 60000, max: 100000 }), lo = Z.plan({ kind: 'line', pts: [[0, 0], [1000, 0]] }, { dx: 5000, margin: 1000, min: 84000, max: 200000 });
  check('a bound that is not whole cells is rounded the way that keeps it a bound: the largest box of 100 km in cells of 3 km is 33 cells, 99 km (' + big.box.L + ', and a line that needs 90 km of it, ' + odd.box.L + ', gets 90 km of 30 cells), the smallest of 84 km in cells of 5 km is 17 cells, 85 km (' + lo.box.L + ')', big.box.L === 99000 && big.box.n === 33 && odd.box.L === 90000 && lo.box.L === 85000 && lo.box.n === 17);
  const edge = Z.plan({ kind: 'line', pts: [[0, 0], [100000, 0]], width: 0, density: 3 }, { dx: 2000, margin: 40000, min: 84000, max: 140000 }), off = Z.plan({ kind: 'line', pts: [[-5000, 20000], [95000, 20000]], width: 0, density: 3 });
  check('the box follows the zone wherever it is drawn: a zone at (-5, 20) km to (95, 20) km has its box\'s middle at (45, 20) km (' + (off.box.x0 + off.box.L / 2) + ', ' + (off.box.y0 + off.box.L / 2) + ') and the seeds are on the middle line of it (y ' + off.seeds.map((q) => q.y.toFixed(0)).join(', ') + ' for ' + off.box.L / 2 + '), with a box of 100 + 80 = 180 km (' + off.box.L + '); a bound of 140 km cuts the 100 km line\'s box to it (' + edge.box.L + ')',
    off.box.x0 + off.box.L / 2 === 45000 && off.box.y0 + off.box.L / 2 === 20000 && off.box.L === 180000 && off.seeds.every((q) => q.y === off.box.L / 2) && edge.box.L === 140000);
  const vert = Z.plan({ kind: 'line', pts: [[0, 0], [0, 300000]], density: 3 }), allVert = Z.draw({ kind: 'line', pts: [[0, 0], [0, 300000]], density: 3 }), shortV = Z.plan({ kind: 'line', pts: [[0, 0], [0, 150000]], density: 3 }), diagz = Z.plan({ kind: 'line', pts: [[0, 0], [40000, 60000]], density: 6 });
  check('the box is as large as the longer side of the zone asks, north-south as east-west: a line of 150 km due north has a box of 150 + 80 = 230 km held to 200 km (' + shortV.box.L + '), one of 300 km is cut at both ends (' + vert.seeds.length + ' of ' + allVert.length + ' seeds kept, ' + vert.dropped + ' dropped, all in the box: ' + vert.seeds.every((q) => q.x >= 0 && q.x < 200000 && q.y >= 0 && q.y < 200000) + '), and a diagonal zone from (0, 0) to (40, 60) km has the middle of its box at (20, 30) km (' + (diagz.box.x0 + diagz.box.L / 2) + ', ' + (diagz.box.y0 + diagz.box.L / 2) + ') and a box of 60 + 80 = 140 km (' + diagz.box.L + ')',
    shortV.box.L === 200000 && vert.box.L === 200000 && vert.dropped === allVert.filter((q) => q.y < 50000 || q.y >= 250000 || Math.abs(q.x) >= 100000).length && vert.dropped > 0 && vert.seeds.length === allVert.length - vert.dropped && vert.seeds.every((q) => q.x >= 0 && q.x < 200000 && q.y >= 0 && q.y < 200000)
    && diagz.box.x0 + diagz.box.L / 2 === 20000 && diagz.box.y0 + diagz.box.L / 2 === 30000 && diagz.box.L === 144000 - 4000);
  const timed = Z.plan({ kind: 'line', pts: [[0, 0], [100000, 0]], density: 6, window: [5, 25] }), rawT = Z.draw({ kind: 'line', pts: [[0, 0], [100000, 0]], density: 6, window: [5, 25] });
  check('the seeds keep their times and strengths in the box (the times ' + timed.seeds.map((q) => q.t.toFixed(1)).join(', ') + ' of the window 5 to 25)', timed.seeds.length === rawT.length && timed.seeds.every((q, i) => q.t === rawT[i].t && q.amp === rawT[i].amp && q.t >= 5 && q.t <= 25) && new Set(timed.seeds.map((q) => q.t)).size > 3);
  const area = Z.plan({ kind: 'area', pts: [[0, 0], [60000, 0], [60000, 40000], [0, 40000]], density: 2 });
  check('an area\'s box holds its longer side and the margins (60 + 80 = 140 km: ' + area.box.L + ') and the seeds it draws (2 to the thousand km2 over 2400 km2: ' + area.seeds.length + ' of 5), each inside the box and inside the zone\'s rectangle once the corner is put back',
    area.box.L === 140000 && area.seeds.length === 5 && area.seeds.every((q) => { const x = q.x + area.box.x0, y = q.y + area.box.y0; return x >= 0 && x <= 60000 && y >= 0 && y <= 40000; }));
}

console.log('\n' + passed + ' passed, ' + failed + ' failed (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
process.exit(failed ? 1 : 0);
