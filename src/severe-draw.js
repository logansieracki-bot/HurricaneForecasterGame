/* Severe: the pure geometry of the drawing tool (docs/severe-plan.md 6.2), apart from the page so that it can be tested on its own.
 *
 *   HFSevereDraw.contourLines(v, nx, ny, level)       // the lines where a field (row after row, nx by ny values) is at `level`, as polylines of [i, j] in the grid's index units (a closed line repeats its first point)
 *   HFSevereDraw.symbolsAlong(pts, spacing, first)    // points of a polyline (pixels) -> [{ x, y, ang, s }] every `spacing` pixels along it, ang the direction of the line there (radians, screen), s the arc length
 *   HFSevereDraw.nearest(pts, x, y)                   // the nearest point of a polyline: { d, i, t, px, py }
 *   HFSevereDraw.pick(objects, x, y, tol, t)          // which object of a drawing (positions in km) is within `tol` km of (x, y) at hour t: { index, part } (part: 'pt:k' a point of it, 'body') or null; a point wins over a body
 *   HFSevereDraw.moved(o, t)                          // an object as it is at hour t (its points moved along its arrow)
 *   HFSevereDraw.History(initial)                     // the drawing's undo and redo: .push(next), .undo(), .redo(), .now
 *   HFSevereDraw.skewT                                // the geometry of a skew-T chart: x and y of a temperature and a pressure, the dry adiabats and the lines of constant mixing ratio
 *
 * A classic script that sets `globalThis.HFSevereDraw`.
 */
(function () {
  'use strict';
  const KMH = 3.6;

  /* ---- contour lines: marching squares on the cells of the grid, the segments joined into polylines through the edges they cross ---- */
  function contourLines(v, nx, ny, level) {
    const eid = (i, j, horiz) => 2 * (j * nx + i) + (horiz ? 0 : 1);                                     // an edge: from (i, j) to (i + 1, j) (horizontal) or to (i, j + 1)
    const segs = [];                                                                                      // [edge a, edge b]
    const pos = new Map();                                                                                // edge id -> [x, y] where the level crosses it
    const cross = (i, j, horiz) => {
      const id = eid(i, j, horiz); let p = pos.get(id); if (p) return id;
      const a = v[j * nx + i], b = horiz ? v[j * nx + i + 1] : v[(j + 1) * nx + i], f = (level - a) / (b - a);
      pos.set(id, horiz ? [i + f, j] : [i, j + f]); return id;
    };
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = v[j * nx + i], b = v[j * nx + i + 1], c = v[(j + 1) * nx + i + 1], d = v[(j + 1) * nx + i];                  // corners: (i, j) (i+1, j) (i+1, j+1) (i, j+1)
      if (!(a === a && b === b && c === c && d === d)) continue;
      const code = (a >= level ? 1 : 0) | (b >= level ? 2 : 0) | (c >= level ? 4 : 0) | (d >= level ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const S = cross(i, j, true), E = cross(i + 1, j, false), N = cross(i, j + 1, true), W = cross(i, j, false);          // the south, east, north and west edges of the cell
      switch (code) {
        case 1: case 14: segs.push([W, S]); break;
        case 2: case 13: segs.push([S, E]); break;
        case 3: case 12: segs.push([W, E]); break;
        case 4: case 11: segs.push([E, N]); break;
        case 6: case 9: segs.push([S, N]); break;
        case 7: case 8: segs.push([W, N]); break;
        case 5: case 10: {                                                                                  // a saddle: the centre decides which corners are joined
          const centre = (a + b + c + d) / 4 >= level;
          if ((code === 5) === centre) segs.push([W, N], [S, E]); else segs.push([W, S], [E, N]);
          break;
        }
      }
    }
    /* join: every edge has two segments at most */
    const at = new Map(); segs.forEach((s, k) => { for (const e of s) { if (!at.has(e)) at.set(e, []); at.get(e).push(k); } });
    const used = new Uint8Array(segs.length), lines = [];
    const walk = (k0, start) => {
      const line = [start]; let k = k0, from = start;
      for (;;) {
        used[k] = 1; const s = segs[k], to = s[0] === from ? s[1] : s[0]; line.push(to);
        const next = (at.get(to) || []).find((q) => !used[q]);
        if (next === undefined) break; k = next; from = to;
      }
      return line;
    };
    for (let k = 0; k < segs.length; k++) {                                                                // open lines first (they start at an edge with one segment), then the closed ones
      if (used[k]) continue;
      const s = segs[k], open = at.get(s[0]).length === 1 ? s[0] : at.get(s[1]).length === 1 ? s[1] : null;
      if (open !== null) lines.push(walk(k, open));
    }
    for (let k = 0; k < segs.length; k++) if (!used[k]) lines.push(walk(k, segs[k][0]));
    return lines.map((l) => l.map((e) => pos.get(e)));
  }

  /* ---- symbols along a line: where the teeth of a front go, every `spacing` pixels, from `first` ---- */
  function symbolsAlong(pts, spacing, first) {
    if (!(spacing > 0)) return [];
    const out = []; let s = 0, next = first === undefined ? spacing / 2 : first;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], ay = pts[i][1], dx = pts[i + 1][0] - ax, dy = pts[i + 1][1] - ay, L = Math.hypot(dx, dy); if (L === 0) continue;
      const ang = Math.atan2(dy, dx);
      while (next <= s + L + 1e-9) { const f = (next - s) / L; out.push({ x: ax + dx * f, y: ay + dy * f, ang, s: next }); next += spacing; }
      s += L;
    }
    return out;
  }

  /* ---- the nearest point of a polyline ---- */
  function nearest(pts, x, y) {
    let best = null;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], ay = pts[i][1], vx = pts[i + 1][0] - ax, vy = pts[i + 1][1] - ay, L2 = vx * vx + vy * vy, t = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2)) : 0;
      const px = ax + vx * t, py = ay + vy * t, d = Math.hypot(x - px, y - py);
      if (!best || d < best.d) best = { d, i, t, px, py };
    }
    return best || { d: Math.hypot(x - pts[0][0], y - pts[0][1]), i: 0, t: 0, px: pts[0][0], py: pts[0][1] };
  }

  /* ---- an object at an hour, and which object a point of the map is on ---- */
  function moved(o, t) {
    const m = o.motion || { u: 0, v: 0 }, dx = m.u * (t || 0) * KMH, dy = m.v * (t || 0) * KMH;
    if (dx === 0 && dy === 0) return o;
    const c = Object.assign({}, o);
    if (o.pts) c.pts = o.pts.map((p) => [p[0] + dx, p[1] + dy]);
    if (o.x !== undefined) { c.x = o.x + dx; c.y = o.y + dy; }
    return c;
  }
  function pick(objects, x, y, tol, t) {                                                                  // a point of an object (its handle) within the tolerance wins over any body; then the nearest body; the topmost on a tie
    let best = null;
    for (let k = objects.length - 1; k >= 0; k--) {
      const o = moved(objects[k], t);
      if (o.pts) { for (let p = 0; p < o.pts.length; p++) { const d = Math.hypot(x - o.pts[p][0], y - o.pts[p][1]); if (d <= tol && (!best || d < best.d - 1e-9)) best = { d, index: k, part: 'pt:' + p }; } }
      else { const d = Math.hypot(x - o.x, y - o.y); if (d <= tol && (!best || d < best.d - 1e-9)) best = { d, index: k, part: 'pt:0' }; }
    }
    if (best) return { index: best.index, part: best.part };
    for (let k = objects.length - 1; k >= 0; k--) {
      const o = moved(objects[k], t); if (!o.pts) continue;
      const n = nearest(o.pts, x, y); if (n.d <= tol && (!best || n.d < best.d - 1e-9)) best = { d: n.d, index: k, part: 'body' };
    }
    return best ? { index: best.index, part: best.part } : null;
  }

  /* ---- undo and redo ---- */
  function History(initial, limit) {
    const H = { stack: [initial], at: 0, limit: limit || 100 };
    Object.defineProperty(H, 'now', { get() { return H.stack[H.at]; } });
    H.push = (next) => { H.stack.length = H.at + 1; H.stack.push(next); if (H.stack.length > H.limit) H.stack.shift(); H.at = H.stack.length - 1; return next; };
    H.undo = () => { if (H.at > 0) H.at--; return H.now; };
    H.redo = () => { if (H.at < H.stack.length - 1) H.at++; return H.now; };
    H.canUndo = () => H.at > 0; H.canRedo = () => H.at < H.stack.length - 1;
    return H;
  }

  /* ---- the skew-T chart: x = T (C) skewed by ln p, y = ln p; the unit of x is a degree of temperature at 1000 hPa ---- */
  const skewT = {
    SKEW: 35,                                                                                              // degrees of x per unit of ln(1000 / p)
    x: (T, p) => T + skewT.SKEW * Math.log(1000 / p),
    y: (p) => Math.log(1000 / p),
    pOfY: (y) => 1000 / Math.exp(y),
    dryAdiabat: (theta, p) => theta * Math.pow(p / 1000, 0.2857) - 273.15,                                  // C at p of the dry adiabat of potential temperature theta (K)
    mixingRatioLine: (w, p) => { const e = w * p / (622 + w), l = Math.log(e / 6.112); return 243.5 * l / (17.67 - l); },    // the dew point (C) at p of a mixing ratio w (g/kg): Bolton's
  };

  globalThis.HFSevereDraw = { contourLines, symbolsAlong, nearest, pick, moved, History, skewT };
})();
