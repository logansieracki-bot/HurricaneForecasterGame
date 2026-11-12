/* Severe: where things are (the radar page's geometry, docs/severe-plan.md section 7).
 *
 * Three small pieces that the map, the radar layer and the tests share, all pure arithmetic:
 *   - the map's projection: Web Mercator (`mercX`, `mercY`, `fromMerc`) and the view of a pane (centre and metres per pixel: `toScreen`, `fromScreen`, `zoomOf`, `mppOf`);
 *   - the radar's plane: the azimuthal equidistant projection about a point (`local`, `fromLocal`), so that a point 100 km from a radar on the ground really is 100 km and at its
 *     real bearing whatever the latitude (a flat Mercator picture is 25 % too wide at 41 degrees); `distBearing` and `dest` are the great-circle pair; the sphere is the mean one;
 *   - the baked map data (`encodeBundle`, `decodeBundle`): lines, polygons and points in 1e-4 degree units, delta-coded, as LEB128 varints, tools/make_severe_geo.mjs writes it and the
 *     page decodes it (a bundle is the bytes before deflate: a 32-bit header length, the header as JSON, the body).
 * A classic script that sets `globalThis.HFSevereGeo`.
 */
(function () {
  const DEG = Math.PI / 180, RM = 6378137, RE = 6371008.8, MPP0 = 2 * Math.PI * RM / 256;       // Web Mercator radius; the mean earth radius; metres per pixel at zoom 0 of 256-pixel tiles

  /* ---- Web Mercator ---- */
  const mercX = (lon) => RM * lon * DEG;
  const mercY = (lat) => RM * Math.log(Math.tan(Math.PI / 4 + lat * DEG / 2));
  const fromMerc = (mx, my) => ({ lon: mx / RM / DEG, lat: (2 * Math.atan(Math.exp(my / RM)) - Math.PI / 2) / DEG });
  const mppOf = (zoom) => MPP0 / Math.pow(2, zoom), zoomOf = (mpp) => Math.log2(MPP0 / mpp);

  /* a view: { cx, cy: Mercator metres of the centre of the pane, mpp: Mercator metres per CSS pixel, w, h: the pane in CSS pixels } */
  const toScreen = (v, mx, my) => [(mx - v.cx) / v.mpp + v.w / 2, v.h / 2 - (my - v.cy) / v.mpp];
  const fromScreen = (v, px, py) => [v.cx + (px - v.w / 2) * v.mpp, v.cy - (py - v.h / 2) * v.mpp];

  /* ---- the sphere ---- */
  function distBearing(lat1, lon1, lat2, lon2) {            // great-circle distance (m) and initial bearing (degrees clockwise from north, 0 to 360)
    const p1 = lat1 * DEG, p2 = lat2 * DEG, dl = (lon2 - lon1) * DEG, sp = Math.sin((p2 - p1) / 2), sl = Math.sin(dl / 2);
    const a = sp * sp + Math.cos(p1) * Math.cos(p2) * sl * sl, d = 2 * RE * Math.asin(Math.min(1, Math.sqrt(a)));
    const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    let az = Math.atan2(y, x) / DEG; if (az < 0) az += 360;
    return { d, az };
  }
  function dest(lat1, lon1, az, d) {                         // the point d metres from (lat1, lon1) along the bearing az
    const p1 = lat1 * DEG, l1 = lon1 * DEG, t = az * DEG, c = d / RE;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(c) + Math.cos(p1) * Math.sin(c) * Math.cos(t));
    const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(c) * Math.cos(p1), Math.cos(c) - Math.sin(p1) * Math.sin(p2));
    let lon = l2 / DEG; lon = ((lon + 540) % 360) - 180;
    return { lat: p2 / DEG, lon };
  }
  function local(lat0, lon0, lat, lon) {                     // the azimuthal equidistant plane about (lat0, lon0): { x: metres east, y: metres north }
    const r = distBearing(lat0, lon0, lat, lon), t = r.az * DEG;
    return { x: r.d * Math.sin(t), y: r.d * Math.cos(t) };
  }
  function fromLocal(lat0, lon0, x, y) {
    const d = Math.hypot(x, y);
    if (d === 0) return { lat: lat0, lon: lon0 };
    return dest(lat0, lon0, Math.atan2(x, y) / DEG, d);
  }

  /* ---- varints and the bundle of baked map data ---- */
  function putVar(out, n) { n = n >>> 0; while (n >= 128) { out.push((n & 127) | 128); n >>>= 7; } out.push(n); }
  const zig = (n) => ((n << 1) ^ (n >> 31)) >>> 0, unzig = (u) => (u >>> 1) ^ -(u & 1);
  function reader(bytes, pos) {
    return {
      pos,
      u() { let n = 0, s = 0, b; do { b = bytes[this.pos++]; n += (b & 127) * Math.pow(2, s); s += 7; } while (b & 128); return n; },
      s() { return unzig(this.u()); },
    };
  }

  /* encodeBundle({ unit, lines: { id: [{ c: class, p: [[x, y], ...] }] }, polys: { id: [{ c, rings: [[[x, y], ...]] }] }, points: { id: { x: [], y: [], c: [], names: [] } }, meta })
     -> Uint8Array. Coordinates are integers in `unit` degrees. */
  function encodeBundle(b) {
    const body = [], layers = [], names = {};
    const ring = (out, pts) => { putVar(out, pts.length); let px = 0, py = 0; for (const [x, y] of pts) { putVar(out, zig(x - px)); putVar(out, zig(y - py)); px = x; py = y; } };
    for (const id of Object.keys(b.lines || {})) {
      const L = b.lines[id], start = body.length; putVar(body, L.length);
      for (const l of L) { putVar(body, l.c || 0); ring(body, l.p); }
      layers.push({ id, kind: 'line', off: start, len: body.length - start, n: L.length });
    }
    for (const id of Object.keys(b.polys || {})) {
      const P = b.polys[id], start = body.length; putVar(body, P.length);
      for (const p of P) { putVar(body, p.c || 0); putVar(body, p.rings.length); for (const r of p.rings) ring(body, r); }
      layers.push({ id, kind: 'poly', off: start, len: body.length - start, n: P.length });
    }
    for (const id of Object.keys(b.points || {})) {
      const P = b.points[id], n = P.x.length, start = body.length; putVar(body, n);
      let px = 0, py = 0; for (let i = 0; i < n; i++) { putVar(body, P.c ? P.c[i] : 0); putVar(body, zig(P.x[i] - px)); putVar(body, zig(P.y[i] - py)); px = P.x[i]; py = P.y[i]; }
      layers.push({ id, kind: 'point', off: start, len: body.length - start, n });
      if (P.names) names[id] = P.names.join('\n');
      if (P.extra) names[id + ':extra'] = P.extra.join('\n');
    }
    const head = new TextEncoder().encode(JSON.stringify({ v: 1, unit: b.unit || 1e-4, layers, names, meta: b.meta || {} })), out = new Uint8Array(4 + head.length + body.length);
    new DataView(out.buffer).setUint32(0, head.length, true); out.set(head, 4);
    let o = 4 + head.length; for (let i = 0; i < body.length; i++) out[o++] = body[i];       // (the body is a plain array of byte values)
    return out;
  }

  /* decodeBundle(bytes) -> { unit, meta, lines: { id: [{ c, n, x: Float64Array, y: Float64Array (Mercator metres), bb: [minx, miny, maxx, maxy] }] },
                              polys: { id: [{ c, rings: [{ x, y }], bb }] }, points: { id: { n, c: Uint8Array, lon, lat: Float64Array, mx, my: Float64Array, names: [] } } } */
  function decodeBundle(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), hl = dv.getUint32(0, true), head = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + hl))), base = 4 + hl, k = head.unit;
    const res = { unit: k, meta: head.meta || {}, lines: {}, polys: {}, points: {} };
    const readRing = (r) => {
      const n = r.u(), x = new Float64Array(n), y = new Float64Array(n); let px = 0, py = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < n; i++) { px += r.s(); py += r.s(); const mx = mercX(px * k), my = mercY(py * k); x[i] = mx; y[i] = my; if (mx < x0) x0 = mx; if (mx > x1) x1 = mx; if (my < y0) y0 = my; if (my > y1) y1 = my; }
      return { n, x, y, bb: [x0, y0, x1, y1] };
    };
    for (const L of head.layers) {
      const r = reader(bytes, base + L.off), n = r.u();
      if (L.kind === 'line') { const a = []; for (let i = 0; i < n; i++) { const c = r.u(), g = readRing(r); a.push({ c, n: g.n, x: g.x, y: g.y, bb: g.bb }); } res.lines[L.id] = a; }
      else if (L.kind === 'poly') {
        const a = []; for (let i = 0; i < n; i++) { const c = r.u(), nr = r.u(), rings = [];
          let b0 = [Infinity, Infinity, -Infinity, -Infinity]; for (let j = 0; j < nr; j++) { const g = readRing(r); rings.push({ x: g.x, y: g.y }); b0 = [Math.min(b0[0], g.bb[0]), Math.min(b0[1], g.bb[1]), Math.max(b0[2], g.bb[2]), Math.max(b0[3], g.bb[3])]; }
          a.push({ c, rings, bb: b0 }); }
        res.polys[L.id] = a;
      } else {
        const c = new Uint8Array(n), lon = new Float64Array(n), lat = new Float64Array(n), mx = new Float64Array(n), my = new Float64Array(n); let px = 0, py = 0;
        for (let i = 0; i < n; i++) { c[i] = r.u(); px += r.s(); py += r.s(); lon[i] = px * k; lat[i] = py * k; mx[i] = mercX(lon[i]); my[i] = mercY(lat[i]); }
        const nm = head.names[L.id], ex = head.names[L.id + ':extra'];
        res.points[L.id] = { n, c, lon, lat, mx, my, names: nm !== undefined ? (nm === '' ? [] : nm.split('\n')) : [], extra: ex !== undefined ? (ex === '' ? [] : ex.split('\n')) : [] };
      }
    }
    return res;
  }

  globalThis.HFSevereGeo = { DEG, RM, RE, mercX, mercY, fromMerc, mppOf, zoomOf, toScreen, fromScreen, distBearing, dest, local, fromLocal, encodeBundle, decodeBundle };
})();
