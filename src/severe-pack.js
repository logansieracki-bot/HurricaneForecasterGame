/* Severe: a recorded storm for the radar page (docs/severe-plan.md 7.4; written by tools/severe_research/make_pack.mjs).
 *
 * `fromBody(bytes)` reads what is inside the gzip stream of a pack: a 32-bit header length, the header (JSON) and then, frame by frame, five byte arrays of nz*ny*nx cells: reflectivity
 * (Int8, dBZ, `floor` for none), the fall speed of the precipitation (Uint8, 0.25 m/s), and the winds u, v, w of the model (Int8, 0.5 m/s). `gunzip(bytes)` (the page) takes the whole file,
 * checks "HFP1" and inflates with the browser's DecompressionStream; Node tests inflate with zlib and call `fromBody`.
 *
 * What a pack knows about the ground: the box of the model moves over the ground with `motion` (the frame in which the storm stays in the box), its south-west corner at the first frame is
 * at scenario.origin (metres east and north of (lat0, lon0) in the azimuthal equidistant plane of HFSevereGeo), so a radar on the ground has a position in the box that changes with time:
 * `radarBox(t, lat, lon)`. `volume(i)` is a frame as the radar operator takes it (winds in the ground's frame: the model's plus the motion), `sample(i, x, y, z)` the model's own values at a
 * point (the page's probe shows them beside the radar's).
 * A classic script that sets `globalThis.HFSeverePack`; it needs HFSevereGeo.
 */
(function () {
  const G = globalThis.HFSevereGeo;

  async function gunzip(bytes) {                                // the whole file -> the bytes of the body (browser)
    if (!(bytes[0] === 0x48 && bytes[1] === 0x46 && bytes[2] === 0x50 && bytes[3] === 0x31)) throw new Error('not a storm pack (no HFP1)');
    const rs = new Response(new Blob([bytes.subarray(4)]).stream().pipeThrough(new DecompressionStream('gzip')));
    return new Uint8Array(await rs.arrayBuffer());
  }

  function fromBody(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), hl = dv.getUint32(0, true), h = JSON.parse(new TextDecoder().decode(u8.subarray(4, 4 + hl))), base = 4 + hl;
    const nx = h.nx, ny = h.ny, nz = h.nz, per = nx * ny * nz, n = h.times.length, W = h.scale.wind, VZ = h.scale.vz, mo = h.motion || { u: 0, v: 0 }, sc = h.scenario;
    if (u8.length < base + n * 5 * per) throw new Error('storm pack is truncated');
    const P = { h, n, per, nx, ny, nz, dx: h.dx, dz: h.dz, times: h.times, floor: h.floor, scenario: sc, motion: mo, track: h.track, name: h.name };
    const view = (i, c, Cls) => new Cls(u8.buffer, u8.byteOffset + base + (i * 5 + c) * per, per);
    P.frame = (i) => ({ dbz: view(i, 0, Int8Array), vz: view(i, 1, Uint8Array), u: view(i, 2, Int8Array), v: view(i, 3, Int8Array), w: view(i, 4, Int8Array) });
    P.volume = (i) => {
      const f = P.frame(i), u = new Float32Array(per), v = new Float32Array(per), w = new Float32Array(per), vz = new Float32Array(per);
      for (let k = 0; k < per; k++) { u[k] = f.u[k] * W + mo.u; v[k] = f.v[k] * W + mo.v; w[k] = f.w[k] * W; vz[k] = f.vz[k] * VZ; }
      return { nx, ny, nz, dx: h.dx, dy: h.dx, dz: h.dz, floor: h.floor, dbz: f.dbz, u, v, w, vz, base: h.base };
    };
    /* where the box is on the ground at model minute t: the south-west corner, metres east and north of the scenario's point */
    P.corner = (t) => [sc.origin[0] + mo.u * 60 * t, sc.origin[1] + mo.v * 60 * t];
    P.radarBox = (t, lat, lon) => { const l = G.local(sc.lat0, sc.lon0, lat, lon), c = P.corner(t); return { x: l.x - c[0], y: l.y - c[1] }; };
    P.boxLatLon = (t, bx, by) => { const c = P.corner(t); return G.fromLocal(sc.lat0, sc.lon0, c[0] + bx, c[1] + by); };
    /* the model's values at a point of the box (x, y, z metres from the south-west corner and the ground), or null outside it: dBZ, u, v, w (ground frame), the fall speed */
    P.sample = (i, x, y, z) => {
      const ix = Math.floor(x / h.dx), iy = Math.floor(y / h.dx), iz = Math.floor(z / h.dz);
      if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return null;
      const f = P.frame(i), k = (iz * ny + iy) * nx + ix;
      return { dbz: f.dbz[k], u: f.u[k] * W + mo.u, v: f.v[k] * W + mo.v, w: f.w[k] * W, vz: f.vz[k] * VZ };
    };
    /* the clock: the scenario's local time at the first frame plus the model minutes, as { h, m } and as "3:35 PM" */
    const [h0, m0] = (sc.clock || '15:00').split(':').map(Number);
    P.clock = (t) => { const tot = Math.round(h0 * 60 + m0 + t), hh = ((Math.floor(tot / 60) % 24) + 24) % 24, mm = ((tot % 60) + 60) % 60; return { h: hh, m: mm, text: ((hh + 11) % 12 + 1) + ':' + String(mm).padStart(2, '0') + ' ' + (hh < 12 ? 'AM' : 'PM') }; };
    return P;
  }

  globalThis.HFSeverePack = { gunzip, fromBody };
})();
