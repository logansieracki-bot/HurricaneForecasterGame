/* A GRLevelX-style colour table (.pal) for the radar views, and a colour look-up that interpolates between its entries (Severe).
 *
 * The file format (the one GR2Analyst, GR3 and RadarScope-like tools read): "Product:", "Units:", "Step:", "Scale:" and "Offset:" lines and colour lines
 *   Color: value R G B            the colour at `value`, running linearly (in RGB) into the colour of the next entry
 *   Color: value R G B R2 G2 B2   the colour at `value`, running linearly to R2 G2 B2 at the next entry's value (so the next entry may start a different colour: a jump)
 *   SolidColor: value R G B       one colour from `value` to the next entry (no run)
 *   Color4: / SolidColor4:        the same with a fourth number, the opacity (0-255)
 * and anything after a `;` is a comment. Below the first entry nothing is drawn (transparent); above the last entry its colour stays.
 *
 * `lut(pal, { vmin, vmax, step })` makes the table of the colour of every `step` dBZ (RGBA bytes) that the renderer indexes by value, so that a picture is made of
 * the table's colours and nothing else: the colours of the data run smoothly, they are not binned.
 * `unitScale(pal.units)` is how many of the table's units make one m/s: a velocity kept in m/s is drawn with a table in miles per hour or knots by multiplying it by this first.
 */
(function () {
  function parse(text) {
    const pal = { product: '', units: '', step: 5, scale: 1, offset: 0, stops: [] };
    for (let line of String(text).split(/\r?\n/)) {
      const semi = line.indexOf(';'); if (semi >= 0) line = line.slice(0, semi);
      line = line.trim(); if (!line) continue;
      const m = /^([A-Za-z0-9]+)\s*:\s*(.*)$/.exec(line); if (!m) continue;
      const key = m[1].toLowerCase(), rest = m[2].trim();
      if (key === 'product') pal.product = rest;
      else if (key === 'units') pal.units = rest;
      else if (key === 'step') pal.step = +rest;
      else if (key === 'scale') pal.scale = +rest;
      else if (key === 'offset') pal.offset = +rest;
      else if (key === 'color' || key === 'color4' || key === 'solidcolor' || key === 'solidcolor4') {
        const n = rest.split(/\s+/).map(Number), four = key.endsWith('4'), w = four ? 4 : 3;
        if (n.length < 1 + w || n.some((x) => !Number.isFinite(x))) continue;
        const c1 = n.slice(1, 1 + w), c2 = n.length >= 1 + 2 * w ? n.slice(1 + w, 1 + 2 * w) : null;
        pal.stops.push({ v: n[0], c1: four ? c1 : [...c1, 255], c2: c2 ? (four ? c2 : [...c2, 255]) : null, solid: key.startsWith('solid') });
      }
    }
    pal.stops.sort((a, b) => a.v - b.v);                                                  // stable: two entries at one value stay in file order (a jump)
    return pal;
  }

  // the colour [r, g, b, a] of a value: transparent for NaN and below the table, the last entry's colour above it, a straight run in RGB between entries
  function colorAt(pal, v) {
    const s = pal.stops, n = s.length;
    if (!(v === v) || n === 0 || v < s[0].v) return [0, 0, 0, 0];
    if (v >= s[n - 1].v) return s[n - 1].c1.slice();
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m].v <= v) lo = m; else hi = m; }   // the last entry at or under v: of two entries at one value the later starts the segment
    const a = s[lo], b = s[lo + 1], end = a.solid ? a.c1 : (a.c2 || b.c1), span = b.v - a.v;
    if (!(span > 0)) return a.c1.slice();
    const t = (v - a.v) / span, out = new Array(4);
    for (let k = 0; k < 4; k++) out[k] = Math.round(a.c1[k] + (end[k] - a.c1[k]) * t);
    return out;
  }

  // RGBA bytes of every `step` dBZ from vmin to vmax: lut.rgba[4 i .. 4 i + 3] is the colour of vmin + i step; lut.index(v) is i for a value (clamped)
  function lut(pal, o) {
    o = o || {};
    const vmin = o.vmin !== undefined ? o.vmin : (pal.stops.length ? pal.stops[0].v - 5 : -40), vmax = o.vmax !== undefined ? o.vmax : (pal.stops.length ? pal.stops[pal.stops.length - 1].v + 5 : 100), step = o.step || 0.05;
    const n = Math.round((vmax - vmin) / step) + 1, rgba = new Uint8ClampedArray(4 * n);
    for (let i = 0; i < n; i++) { const c = colorAt(pal, vmin + i * step); rgba[4 * i] = c[0]; rgba[4 * i + 1] = c[1]; rgba[4 * i + 2] = c[2]; rgba[4 * i + 3] = c[3]; }
    const inv = 1 / step;
    return { vmin, vmax, step, n, rgba, index: (v) => { const i = Math.round((v - vmin) * inv); return i < 0 ? 0 : i >= n ? n - 1 : i; } };
  }

  // how many of a table's units make one metre per second (the radar operator's velocity and width are in m/s): 2.23694 for miles per hour, 1.94384 for knots, 3.6 for kilometres per hour; 1 for
  // m/s and for units that are not speeds (dBZ)
  function unitScale(units) {
    const u = String(units || '').trim().toLowerCase();
    return u === 'mph' || u === 'mi/h' ? 2.2369362920544 : u === 'kts' || u === 'kt' || u === 'kn' ? 1.9438444924406 : u === 'kph' || u === 'km/h' || u === 'kmh' ? 3.6 : 1;
  }

  globalThis.HFSeverePalette = { parse, colorAt, lut, unitScale };
})();
