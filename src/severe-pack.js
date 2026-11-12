/* Severe: a recorded storm for the radar page (docs/severe-plan.md 7.4; written by tools/severe_research/make_pack.mjs).
 *
 * `fromBody(bytes)` reads what is inside the gzip stream of a pack: a 32-bit header length, the header (JSON) and then, frame by frame, five byte arrays of nz*ny*nx cells: reflectivity
 * (Int8, dBZ, `floor` for none), the fall speed of the precipitation (Uint8, 0.25 m/s), and the winds u, v, w of the model (Int8, 0.5 m/s). `gunzip(bytes)` (the page) takes the whole file,
 * checks "HFP1" and inflates with the browser's DecompressionStream; Node tests inflate with zlib and call `fromBody`.
 *
 * What a pack knows about the ground: the box of the model moves over the ground with `motion` (the frame in which the storm stays in the box), its south-west corner at the first frame is
 * at scenario.origin (metres east and north of (lat0, lon0) in the azimuthal equidistant plane of HFSevereGeo), so a radar on the ground has a position in the box that changes with time:
 * `radarBox(t, lat, lon)`. `volume(i)` is a frame as the radar operator takes it (winds in the ground's frame: the model's plus the motion), `sample(i, x, y, z)` the model's own values at a
 * point (the page's probe shows them beside the radar's). `frameBytes(i)` is the five arrays of a frame as one block of bytes: what the page hands a scanning worker, which makes the
 * volume with `volumeFromFrame` (so that a worker never holds the whole recording).
 * A pack of version 2 (header `v: 2`) may also carry NESTS, finer volumes of a storm that a finer run (src/severe-nest.js) made inside the box, for the frames in which it has them: the header's `nests` lists
 * their grids ({ nx, ny, nz, dx, dz, scale: { wind, vz }, frame: { u, v } the nest's motion over the box }), `fn[i]` the nests of frame i as [k, x, y] (nest k, its south-west corner in the box in metres), and
 * `offsets` the byte offsets of the frames' blocks (a block is the box's five arrays and then the five arrays of each of its nests, in the order of `fn[i]`). `volume(i)` then has `nests: [{ x, y, vol }]`,
 * which the radar operator reads (a point inside a nest is the nest's, the rest the box's). A pack of version 1 has none of this and reads as before.
 * A classic script that sets `globalThis.HFSeverePack`; it needs HFSevereGeo.
 */
(function () {
  const G = globalThis.HFSevereGeo;

  async function gunzip(bytes) {                                // the whole file -> the bytes of the body (browser)
    if (!(bytes[0] === 0x48 && bytes[1] === 0x46 && bytes[2] === 0x50 && (bytes[3] === 0x31 || bytes[3] === 0x32))) throw new Error('not a storm pack (no HFP1 or HFP2)');
    const rs = new Response(new Blob([bytes.subarray(4)]).stream().pipeThrough(new DecompressionStream('gzip')));
    return new Uint8Array(await rs.arrayBuffer());
  }

  /* a frame as the radar operator takes it, from the bytes of its block (the five arrays of the box and, in a pack of version 2, those of the nests the header lists for frame i) and the header: the winds in the
     ground's frame (the model's plus the motion of the box, and the nest's own motion over the box) */
  function volumeFromFrame(h, f5, i) {
    const nx = h.nx, ny = h.ny, nz = h.nz, per = nx * ny * nz, W = h.scale.wind, VZ = h.scale.vz, mo = h.motion || { u: 0, v: 0 }, b = f5.buffer, o = f5.byteOffset;
    const dbz = new Int8Array(b, o, per), vzb = new Uint8Array(b, o + per, per), ub = new Int8Array(b, o + 2 * per, per), vb = new Int8Array(b, o + 3 * per, per), wb = new Int8Array(b, o + 4 * per, per);
    const u = new Float32Array(per), v = new Float32Array(per), w = new Float32Array(per), vz = new Float32Array(per);
    for (let k = 0; k < per; k++) { u[k] = ub[k] * W + mo.u; v[k] = vb[k] * W + mo.v; w[k] = wb[k] * W; vz[k] = vzb[k] * VZ; }
    const vol = { nx, ny, nz, dx: h.dx, dy: h.dx, dz: h.dz, floor: h.floor, dbz, u, v, w, vz, base: h.base };
    const here = h.nests && h.fn && i !== undefined ? h.fn[i] : null;
    if (here && here.length) {
      vol.nests = []; let at = 5 * per;
      for (const [k, x, y] of here) {
        const nh = h.nests[k], np = nh.nx * nh.ny * nh.nz, NW = nh.scale.wind, NV = nh.scale.vz, fr = nh.frame || { u: 0, v: 0 }, q = o + at;
        const nb = new Int8Array(b, q, np), nvz = new Uint8Array(b, q + np, np), nu = new Int8Array(b, q + 2 * np, np), nv = new Int8Array(b, q + 3 * np, np), nw = new Int8Array(b, q + 4 * np, np);
        const U = new Float32Array(np), V = new Float32Array(np), Wn = new Float32Array(np), VZn = new Float32Array(np);
        for (let c = 0; c < np; c++) { U[c] = nu[c] * NW + mo.u + fr.u; V[c] = nv[c] * NW + mo.v + fr.v; Wn[c] = nw[c] * NW; VZn[c] = nvz[c] * NV; }
        vol.nests.push({ x, y, vol: { nx: nh.nx, ny: nh.ny, nz: nh.nz, dx: nh.dx, dy: nh.dx, dz: nh.dz, floor: h.floor, dbz: nb, u: U, v: V, w: Wn, vz: VZn, base: h.base } });
        at += 5 * np;
      }
    }
    return vol;
  }

  function fromBody(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), hl = dv.getUint32(0, true), h = JSON.parse(new TextDecoder().decode(u8.subarray(4, 4 + hl))), base = 4 + hl;
    const nx = h.nx, ny = h.ny, nz = h.nz, per = nx * ny * nz, n = h.times.length, W = h.scale.wind, VZ = h.scale.vz, mo = h.motion || { u: 0, v: 0 }, sc = h.scenario;
    const off = h.offsets || null, at = (i) => (off ? off[i] : i * 5 * per);                        // where frame i's block starts in the body (a pack of version 1: five arrays of the box, frame after frame)
    if (u8.length < base + at(n)) throw new Error('storm pack is truncated');
    const P = { h, n, per, nx, ny, nz, dx: h.dx, dz: h.dz, times: h.times, floor: h.floor, scenario: sc, motion: mo, track: h.track, name: h.name, nests: h.nests || [] };
    const view = (i, c, Cls) => new Cls(u8.buffer, u8.byteOffset + base + at(i) + c * per, per);
    P.frame = (i) => ({ dbz: view(i, 0, Int8Array), vz: view(i, 1, Uint8Array), u: view(i, 2, Int8Array), v: view(i, 3, Int8Array), w: view(i, 4, Int8Array) });
    P.frameBytes = (i) => new Uint8Array(u8.buffer, u8.byteOffset + base + at(i), at(i + 1) - at(i));
    P.volume = (i) => volumeFromFrame(h, P.frameBytes(i), i);
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

  globalThis.HFSeverePack = { gunzip, fromBody, volumeFromFrame };
})();
