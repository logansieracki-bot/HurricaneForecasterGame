/* Severe: the radar sweep on the GPU (docs/severe-plan.md 7.3, "pixelated like real radar").
 *
 * What the CPU renderer of src/severe-radar.js does for a picture (every pixel asks which gate it is in and takes that gate's colour from the table), done by the graphics card for the
 * pane: a mesh of 48 x 48 cells over the canvas carries, per vertex, where that pixel is in the radar's plane (metres east and north of the radar: HFSevereGeo.local, in double precision),
 * the fragment shader turns it into range and azimuth, reads the gate from a texture of the sweep (nGates x nRad, 16-bit integers, half units, no filtering) and the colour from a texture of
 * the palette. Gates are blocks at every zoom; zoomed out below about two pixels per gate four samples are averaged so that the blocks do not shimmer. Changing the palette, the unit
 * or the product costs nothing: the sweep is uploaded once, the colour is looked up per pixel.
 * `reference(sweep, field, lut, view, radar, scale)` is the same picture on the CPU (exact arithmetic per pixel): what the tests hold the GPU to.
 * A classic script that sets `globalThis.HFSevereGL`; it needs HFSevereGeo.
 */
(function () {
  const G = globalThis.HFSevereGeo, DEG = Math.PI / 180, N = 48, NONE = -32768;

  const VS = `#version 300 es
  in vec2 a_pos; in vec2 a_local; out vec2 v_local;
  void main() { v_local = a_local; gl_Position = vec4(a_pos, 0.0, 1.0); }`;
  const FS = `#version 300 es
  precision highp float; precision highp int; precision highp isampler2D;
  uniform isampler2D u_data; uniform sampler2D u_lut;
  uniform vec4 u_geom;     // rIn (m), 1 / gate, nGates, nRad
  uniform vec4 u_geom2;    // 1 / dAz, 1 / cos(elev), lut vmin, 1 / lut step
  uniform vec2 u_val;      // the unit scale of the field, lut entries
  uniform float u_ss;      // above 0.5: four samples per pixel
  in vec2 v_local; out vec4 o;
  vec4 at(vec2 p) {
    float r = length(p) * u_geom2.y, g = floor((r - u_geom.x) * u_geom.y);
    if (g < 0.0 || g >= u_geom.z) return vec4(0.0);
    float az = degrees(atan(p.x, p.y)); if (az < 0.0) az += 360.0;
    float a = min(u_geom.w - 1.0, floor(az * u_geom2.x));
    int raw = texelFetch(u_data, ivec2(int(g), int(a)), 0).r;
    if (raw == -32768) return vec4(0.0);
    float v = float(raw) * 0.5 * u_val.x, li = clamp(floor((v - u_geom2.z) * u_geom2.w + 0.5), 0.0, u_val.y - 1.0);
    vec4 c = texelFetch(u_lut, ivec2(int(li), 0), 0);
    return vec4(c.rgb * c.a, c.a);
  }
  void main() {
    if (u_ss > 0.5) {
      vec2 dx = dFdx(v_local), dy = dFdy(v_local);
      o = 0.25 * (at(v_local + 0.25 * dx + 0.25 * dy) + at(v_local - 0.25 * dx + 0.25 * dy) + at(v_local + 0.25 * dx - 0.25 * dy) + at(v_local - 0.25 * dx - 0.25 * dy));
    } else o = at(v_local);
  }`;

  function shader(gl, type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s)); return s; }

  function create(canvas) {
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    if (!gl) return null;
    const pr = gl.createProgram(); gl.attachShader(pr, shader(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(pr, shader(gl, gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('program: ' + gl.getProgramInfoLog(pr));
    const U = {}; for (const n of ['u_data', 'u_lut', 'u_geom', 'u_geom2', 'u_val', 'u_ss']) U[n] = gl.getUniformLocation(pr, n);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const nv = (N + 1) * (N + 1), pos = new Float32Array(nv * 2), loc = new Float32Array(nv * 2), idx = new Uint16Array(N * N * 6);
    for (let j = 0, k = 0; j <= N; j++) for (let i = 0; i <= N; i++, k++) { pos[2 * k] = 2 * i / N - 1; pos[2 * k + 1] = 1 - 2 * j / N; }
    for (let j = 0, k = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; idx.set([a, b, c, b, d, c], k); k += 6; }
    const bufPos = gl.createBuffer(), bufLoc = gl.createBuffer(), bufIdx = gl.createBuffer(), aPos = gl.getAttribLocation(pr, 'a_pos'), aLoc = gl.getAttribLocation(pr, 'a_local');
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPos); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufLoc); gl.bufferData(gl.ARRAY_BUFFER, loc, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(aLoc); gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    const texData = gl.createTexture(), texLut = gl.createTexture();
    for (const t of [texData, texLut]) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
    const L = { sweep: null, lut: null, scale: 1, shown: true, ss: 'auto' };          // ss: 'auto' (four samples when a gate is under about two pixels), true or false

    return Object.assign(L, {
      gl,
      setSweep(meta, data) {                                    // meta: { nRad, nGates, dAz, gate, r0, elev }, data: Int16Array(nRad * nGates), half units, -32768 for none
        L.sweep = meta; gl.bindTexture(gl.TEXTURE_2D, texData); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 2);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16I, meta.nGates, meta.nRad, 0, gl.RED_INTEGER, gl.SHORT, data);
      },
      setLut(lut, scale) {                                      // lut: HFSeverePalette.lut; scale: what the values are multiplied by before the table
        L.lut = lut; L.scale = scale || 1; gl.bindTexture(gl.TEXTURE_2D, texLut); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, lut.n, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(lut.rgba.buffer, lut.rgba.byteOffset, lut.rgba.byteLength));
      },
      clear() { gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); },
      draw(view, radar) {                                       // view: HFSevereGeo view (CSS pixels); radar: { lat, lon }
        L.clear(); if (!L.sweep || !L.lut || !L.shown) return;
        const s = L.sweep, cosLat = Math.cos(radar.lat * DEG);
        for (let j = 0, k = 0; j <= N; j++) for (let i = 0; i <= N; i++, k++) {
          const [mx, my] = G.fromScreen(view, i / N * view.w, j / N * view.h), ll = G.fromMerc(mx, my), p = G.local(radar.lat, radar.lon, ll.lat, ll.lon); loc[2 * k] = p.x; loc[2 * k + 1] = p.y;
        }
        gl.useProgram(pr); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, bufLoc); gl.bufferSubData(gl.ARRAY_BUFFER, 0, loc);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texData); gl.uniform1i(U.u_data, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texLut); gl.uniform1i(U.u_lut, 1);
        const cosE = Math.cos(s.elev * DEG), rIn = s.r0 - s.gate / 2, gatePx = s.gate / (view.mpp * cosLat);
        gl.uniform4f(U.u_geom, rIn, 1 / s.gate, s.nGates, s.nRad); gl.uniform4f(U.u_geom2, 1 / s.dAz, 1 / cosE, L.lut.vmin, 1 / L.lut.step);
        gl.uniform2f(U.u_val, L.scale, L.lut.n); gl.uniform1f(U.u_ss, (L.ss === 'auto' ? gatePx < 2.4 : L.ss) ? 1 : 0);
        gl.viewport(0, 0, canvas.width, canvas.height); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      },
      read() { const w = canvas.width, h = canvas.height, px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; },        // premultiplied RGBA, bottom row first
    });
  }

  /* the same picture on the CPU, pixel by pixel in exact arithmetic: RGBA (not premultiplied, top row first) of a w x h view; no supersampling */
  function reference(sweep, data, lut, view, radar, scale) {
    const w = view.w, h = view.h, img = new Uint8ClampedArray(w * h * 4), cosE = Math.cos(sweep.elev * DEG), rIn = sweep.r0 - sweep.gate / 2, inv = 1 / sweep.dAz;
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const [mx, my] = G.fromScreen(view, px + 0.5, py + 0.5), ll = G.fromMerc(mx, my), p = G.local(radar.lat, radar.lon, ll.lat, ll.lon);
      const r = Math.hypot(p.x, p.y) / cosE, g = Math.floor((r - rIn) / sweep.gate); if (g < 0 || g >= sweep.nGates) continue;
      let az = Math.atan2(p.x, p.y) / DEG; if (az < 0) az += 360; const a = Math.min(sweep.nRad - 1, Math.floor(az * inv)), raw = data[a * sweep.nGates + g]; if (raw === NONE) continue;
      const i = 4 * lut.index(raw * 0.5 * (scale || 1)), o = 4 * (py * w + px); img[o] = lut.rgba[i]; img[o + 1] = lut.rgba[i + 1]; img[o + 2] = lut.rgba[i + 2]; img[o + 3] = lut.rgba[i + 3];
    }
    return img;
  }

  globalThis.HFSevereGL = { create, reference, N, NONE };
})();
