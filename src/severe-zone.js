/* Severe: the initiation zone (docs/severe-plan.md 6.4), the pure half: a line or an area drawn on the map and the bubbles that start its storms, apart from the page so that it can be tested on its own.
 *
 *   HFSevereZone.plan(zone, opts)    // { box: { x0, y0, L, n }, seeds: [{ x, y, t, amp }], dropped }: the square box of cells that holds the zone and its margin, and the seeds in the box's own coordinates (m from its south-west corner), for
 *                                    // HFSevereLab.run's `box` and `seeds`. `dropped` is the number of seeds that fell outside a box that is held to its largest size (a zone longer than the box can hold is cut at its ends).
 *      zone: { kind: 'line' | 'area', pts: [[x, y], ...] (m, in the drawing's plane: at least 2 for a line, 3 for an area),
 *              width (m, a line's: the seeds lie within half of it on either side of the line; 20000), density (seeds per 100 km of line, or per 1000 km2 of area; 3 for a line, 1 for an area), strength (K, the bubble's warming; 3),
 *              window: [first, last] (minutes in which the seeds go off; [0, 0]: all at the start), spacing (m, no two seeds nearer than this: bubbles that touch are one storm; 12000), seed (the integer that seeds the random draw: a run is repeatable; 1) }
 *      opts: { dx (m, the box's cell; 2000), margin (m, round the zone; 40000), min (m, the smallest box; 84000), max (m, the largest; 200000) }
 *   HFSevereZone.draw(zone)          // the seeds alone, in the zone's own coordinates (what plan makes before it puts them in the box)
 *   HFSevereZone.length(pts)         // the length of a polyline (m)
 *   HFSevereZone.area(pts)           // the area of a polygon (m2, positive)
 *   HFSevereZone.rng(seed)           // a function that gives the next number of a repeatable sequence in [0, 1) (mulberry32)
 *
 * A zone is a *trigger*, as the single bubble of a run is: it does not say what grows (docs/severe-plan.md 6.4). The seeds go as a draw along the line (or over the area) and in time, no two nearer than `spacing`; a place that cannot hold
 * that many gets fewer, never closer ones. A classic script that sets `globalThis.HFSevereZone`.
 */
(function () {
  'use strict';

  function rng(seed) {                                                                                  // mulberry32
    let a = (seed | 0) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const length = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };
  const area = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p[0] * q[1] - q[0] * p[1]; } return Math.abs(s) / 2; };
  const inside = (pts, x, y) => {                                                                       // even-odd rule
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) if ((pts[i][1] > y) !== (pts[j][1] > y) && x < (pts[j][0] - pts[i][0]) * (y - pts[i][1]) / (pts[j][1] - pts[i][1]) + pts[i][0]) c = !c;
    return c;
  };
  /* the point a distance u along a polyline, offset by v to its left (the normal of the piece it is on) */
  function along(pts, u, v) {
    let s = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], d = Math.hypot(dx, dy);
      if (u <= s + d || i === pts.length - 1) { const f = d > 0 ? Math.max(0, Math.min(1, (u - s) / d)) : 0, nx = d > 0 ? -dy / d : 0, ny = d > 0 ? dx / d : 0; return [pts[i - 1][0] + f * dx + v * nx, pts[i - 1][1] + f * dy + v * ny]; }
      s += d;
    }
    return [pts[0][0], pts[0][1]];
  }

  function settings(zone) {
    if (!zone || (zone.kind !== 'line' && zone.kind !== 'area')) throw new Error('severe-zone: a zone is a line or an area');
    const pts = zone.pts;
    if (!Array.isArray(pts) || pts.length < (zone.kind === 'line' ? 2 : 3) || !pts.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))) throw new Error('severe-zone: a ' + zone.kind + ' needs at least ' + (zone.kind === 'line' ? 2 : 3) + ' points');
    const w = zone.window || [0, 0], line = zone.kind === 'line';
    const z = { kind: zone.kind, pts, width: zone.width === undefined ? 20000 : zone.width, density: zone.density === undefined ? (line ? 3 : 1) : zone.density, strength: zone.strength === undefined ? 3 : zone.strength,
      t0: Math.min(w[0], w[1]), t1: Math.max(w[0], w[1]), spacing: zone.spacing === undefined ? 12000 : zone.spacing, seed: zone.seed === undefined ? 1 : zone.seed };
    if (!(z.width >= 0) || !(z.density > 0) || !(z.spacing >= 0) || !(z.t0 >= 0) || !Number.isFinite(z.t1) || !Number.isFinite(z.strength)) throw new Error('severe-zone: the width, density, spacing, window and strength of a zone must be numbers (the density above 0, the others not negative)');
    return z;
  }

  /* the seeds of a zone in its own coordinates, in the order of their times */
  function draw(zone) {
    const z = settings(zone), line = z.kind === 'line', rand = rng(z.seed), len = line ? length(z.pts) : 0, ar = line ? 0 : area(z.pts);
    const want = Math.max(1, Math.round(z.density * (line ? len / 100000 : ar / 1e9))), seeds = [];
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (const p of z.pts) { xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]); ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); }
    for (let tries = 0; seeds.length < want && tries < 200 * want; tries++) {
      let x, y;
      if (line) { const u = rand() * len, v = (rand() - 0.5) * z.width; [x, y] = along(z.pts, u, v); }
      else { x = xmin + rand() * (xmax - xmin); y = ymin + rand() * (ymax - ymin); if (!inside(z.pts, x, y)) continue; }
      if (seeds.some((q) => Math.hypot(q.x - x, q.y - y) < z.spacing)) continue;
      seeds.push({ x, y, t: z.t0 + rand() * (z.t1 - z.t0), amp: z.strength * (0.8 + 0.4 * rand()) });
    }
    return seeds.sort((p, q) => p.t - q.t || p.x - q.x);
  }

  /* the zone in a box of the Lab: the square box of cells that holds the zone and `margin` round it (no smaller than `min`, no larger than `max`), centred on the zone's bounding box, and the seeds in it */
  function plan(zone, opts) {
    const o = Object.assign({ dx: 2000, margin: 40000, min: 84000, max: 200000 }, opts || {}), z = settings(zone), all = draw(zone);
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (const p of z.pts) { xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]); ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); }
    const span = Math.max(xmax - xmin, ymax - ymin) + 2 * o.margin, n = Math.max(Math.ceil(o.min / o.dx), Math.min(Math.floor(o.max / o.dx), Math.ceil(span / o.dx))), L = n * o.dx;
    const x0 = (xmin + xmax) / 2 - L / 2, y0 = (ymin + ymax) / 2 - L / 2, seeds = [];
    for (const q of all) { const x = q.x - x0, y = q.y - y0; if (x >= 0 && x < L && y >= 0 && y < L) seeds.push({ x, y, t: q.t, amp: q.amp }); }
    return { box: { x0, y0, L, n }, seeds, dropped: all.length - seeds.length };
  }

  globalThis.HFSevereZone = { plan, draw, length, area, rng };
})();
