/* Severe: the radar page (docs/severe-plan.md section 7; built into dist/severe.html by tools/build.mjs).
 *
 * A radar app in the manner of RadarScope on a simulated storm: a vector map (src/severe-map.js) under a GPU sweep (src/severe-gl.js) of what the radar operator (src/severe-radar.js) makes of
 * a recorded storm (src/severe-pack.js), scanned in Workers at display time so that the radar can be moved and the tilt changed after the run; one or two linked panes, a floating dock with
 * the site, product, tilt, transport, frame interval and speed, a frame slider, a colour bar read from the palette itself, a probe that shows the radar's value and the model's truth, and a
 * measuring tool. Everything on screen that is weather comes out of the model: there is no painted echo anywhere.
 * `window.SEVERE` is what the tests drive.
 */
(function () {
  'use strict';
  const G = HFSevereGeo, R = HFSevereRadar, PAL = HFSeverePalette, MAP = HFSevereMap, GL = HFSevereGL, PACK = HFSeverePack, DEG = Math.PI / 180, D = SEVERE_DATA;
  const $ = (id) => document.getElementById(id);
  const TILTS = [0.5, 0.9, 1.3, 1.8, 2.4, 3.1, 4.0, 5.1, 6.4, 8.0, 10.0, 12.5, 15.6, 19.5], SPEEDS = [1, 2, 5, 10, 20];
  const PRODUCTS = { dbz: { name: 'Base Reflectivity', pal: 'br' }, vel: { name: 'Base Velocity', pal: 'bv' }, sw: { name: 'Spectrum Width', pal: 'sw' } };
  const UNITS = { imperial: { name: 'Miles and mph', speed: 'mph', k: 2.2369362920544, dist: 'mi', m: 1609.344 }, nautical: { name: 'Nautical miles and knots', speed: 'kt', k: 1.9438444924406, dist: 'nm', m: 1852 },
    metric: { name: 'Kilometres and m/s', speed: 'm/s', k: 1, dist: 'km', m: 1000 } };
  const LS = 'hf-severe-v1';
  /* the storms the page can show: the recorded 1 km storm is inside the page, the others are files beside it (severe-packs/, made by tools/severe_research/make_nest_pack.mjs) that are fetched when they are asked for;
     t: the minute the page opens it at, zoom: how close, panes: the products of its panes, interval: the minutes between the frames it plays, mb: the size of the file (the menu says it) */
  const STORMS = [
    { id: 'wk82-1km', name: 'Supercell, 1 km grid', sub: 'Recorded · smooth rotation · a frame every 5 minutes' },
    { id: 'wk82-100m', name: 'Supercell, 100 m nest', sub: 'Recorded · a notch and a tight couplet · a frame every minute', file: 'severe-packs/wk82-100m-nest.hfp', mb: 10, t: 79, zoom: 11.3, panes: ['dbz', 'vel'], interval: 1 },
  ];

  /* ---- state ---- */
  const saved = (() => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } })();
  const S = Object.assign({ theme: 'dark', units: 'imperial', speed: 2, interval: 5, panes: 1, dealias: false, clutter: true, res: 'super',
    layers: { county: true, state: true, road: true, river: true, place: true, site: true, rings: true } }, saved);
  Object.assign(S, { t: 0, frame: 0, playing: false, loop: true, tool: 'none', active: 0, dragging: false, radar: null, probe: null, measure: [] });
  const save = () => { try { localStorage.setItem(LS, JSON.stringify({ theme: S.theme, units: S.units, speed: S.speed, interval: S.interval, panes: S.panes, dealias: S.dealias, clutter: S.clutter, res: S.res, layers: S.layers })); } catch (e) { /* none */ } };
  S.layers = Object.assign({ county: true, state: true, road: true, river: true, place: true, site: true, rings: true }, S.layers);

  let geo, pack, scanner, pals, luts, panes = [], pack0 = null, runPack = null, stormBusy = false;
  S.storm = 'wk82-1km';
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const toast = (msg, ms) => { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.k); toast.k = setTimeout(() => { t.hidden = true; }, ms || 2600); };

  /* ---- the scanner: a pool of workers (or the page itself) ---- */
  async function makeScanner() {
    const queue = [], inflight = new Map(); let seq = 0, workers = [], idle = [], fallback = null;
    const done = (id, res, err) => { const j = inflight.get(id); if (!j) return; inflight.delete(id); err ? j.reject(new Error(err)) : j.resolve(res); };
    function pump() {
      while (queue.length && (workers.length ? idle.length : !fallback.busy)) {
        queue.sort((a, b) => a.prio - b.prio); const j = queue.shift(); inflight.set(j.id, j);
        if (workers.length) { const w = idle.shift(); w.job = j.id; const bytes = pack.frameBytes(j.frame).slice().buffer; w.postMessage({ t: 'scan', id: j.id, frame: j.frame, bytes, opts: j.opts }, [bytes]); }
        else { fallback.busy = true; setTimeout(() => { try { done(j.id, fallback.sc.scan(j.frame, j.opts)); } catch (e) { done(j.id, null, String(e)); } fallback.busy = false; pump(); }, 0); }
      }
    }
    try {
      const src = ['src-geo', 'src-radar', 'src-pack', 'src-worker'].map((id) => $(id).textContent).join('\n;\n'), url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
      await Promise.all(Array.from({ length: n }, () => new Promise((ok, no) => {
        const w = new Worker(url); const tm = setTimeout(() => no(new Error('worker timeout')), 20000);
        w.onmessage = (e) => { const m = e.data;
          if (m.t === 'ready') { clearTimeout(tm); workers.push(w); idle.push(w); ok(); }
          else if (m.t === 'sweep') { idle.push(w); done(m.id, { meta: m.meta, dbz: m.dbz, vel: m.vel, sw: m.sw }); pump(); }
          else if (m.t === 'error') { idle.push(w); done(m.id, null, m.message); pump(); } };
        w.onerror = (e) => { clearTimeout(tm); no(new Error(e.message || 'worker error')); };
        w.postMessage({ t: 'init', header: pack.h });
      })));
    } catch (e) { for (const w of workers) w.terminate(); workers = []; idle = []; fallback = { sc: HFSevereScanner.make(pack), busy: false }; console.warn('severe: scanning on the page itself (' + e.message + ')'); }
    return {
      mode: () => (workers.length ? 'workers:' + workers.length : 'inline'),
      scan(frame, opts, prio) { return new Promise((resolve, reject) => { queue.push({ id: ++seq, frame, opts, prio: prio || 0, resolve, reject }); pump(); }); },
      busy: () => queue.length + inflight.size,
      dispose() { for (const w of workers) w.terminate(); workers = []; idle = []; for (const j of queue) j.reject(new Error('cancelled')); queue.length = 0; },
      cancelBelow(prio) { for (let i = queue.length - 1; i >= 0; i--) if (queue[i].prio >= prio) { queue[i].reject(new Error('cancelled')); queue.splice(i, 1); } },
    };
  }

  /* ---- sweeps: what to scan, the cache, and who waits for what ---- */
  const cache = new Map(), pending = new Map();
  const quickOf = () => S.dragging || S.res === 'legacy';
  const keyOf = (frame, tilt, radar, quick) => [frame, TILTS[tilt], quick ? 'L' : 'S', radar.lat.toFixed(4), radar.lon.toFixed(4), S.dealias ? 1 : 0, S.clutter ? 1 : 0].join('|');
  function optsOf(frame, tilt, radar, quick) {
    const rb = pack.radarBox(pack.times[frame], radar.lat, radar.lon), geom = quick ? { dAz: 1, gate: 1000, nGates: 230, r0: 2500 } : { dAz: 0.5, gate: 250, nGates: 920, r0: 2125 };
    return Object.assign(geom, { elev: TILTS[tilt], x: rb.x, y: rb.y, seed: 1 + frame * 131 + tilt, dealias: S.dealias, clutter: { ground: S.clutter ? 1 : 0, clearAir: S.clutter ? 1 : 0 } });
  }
  function want(frame, tilt, radar, prio, quick) {                            // a promise of the sweep (from the cache if it is there)
    const key = keyOf(frame, tilt, radar, quick); if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (pending.has(key)) return pending.get(key);
    const rad = { lat: radar.lat, lon: radar.lon }, p = scanner.scan(frame, optsOf(frame, tilt, radar, quick), prio).then((r) => {
      pending.delete(key); const sw = { key, frame, tilt, radar: rad, quick, meta: r.meta, dbz: r.dbz, vel: r.vel, sw: r.sw }; cache.set(key, sw); trim(); return sw; }, (e) => { pending.delete(key); throw e; });
    pending.set(key, p); return p;
  }
  function trim() { const keep = new Set(panes.map((p) => p.key)); for (const k of cache.keys()) { if (cache.size <= 30) break; if (!keep.has(k)) cache.delete(k); } }
  const ready = (frame) => panes.every((p) => cache.has(keyOf(frame, p.tilt, S.radar, quickOf())));

  /* ---- time ---- */
  const hasEvery = (iv) => { let gap = Infinity; for (let i = 1; i < pack.times.length; i++) gap = Math.min(gap, pack.times[i] - pack.times[i - 1]); return iv >= gap - 1e-9 && pack.times.filter((t) => Math.abs(t / iv - Math.round(t / iv)) < 1e-6).length >= 2; };      // a chip is on if the recording has frames that close together
  function frames() { const iv = S.interval, a = []; pack.times.forEach((t, i) => { if (Math.abs(t / iv - Math.round(t / iv)) < 1e-6) a.push(i); }); return a.length ? a : pack.times.map((_, i) => i); }
  function frameAt(t) { const f = frames(); let r = f[0]; for (const i of f) if (pack.times[i] <= t + 1e-6) r = i; return r; }
  const tSpan = () => { const f = frames(); return [pack.times[f[0]], pack.times[f[f.length - 1]]]; };
  function setT(t, quiet) { const [a, b] = tSpan(); S.t = Math.min(b, Math.max(a, t)); const f = frameAt(S.t); if (f !== S.frame) { S.frame = f; frameChanged(); } else if (!quiet) syncDock(); syncSlider(); }
  function step(dir) { const f = frames(), i = f.indexOf(S.frame), n = Math.min(f.length - 1, Math.max(0, i + dir)); if (n === i && dir > 0 && S.loop && S.playing) { setT(pack.times[f[0]]); return; } setT(pack.times[f[n]]); }
  function setPlaying(on) { S.playing = on; $('ic-play').hidden = on; $('ic-pause').hidden = !on; $('t-play').setAttribute('aria-label', on ? 'Pause' : 'Play'); if (on && S.t >= tSpan()[1] - 1e-6) setT(tSpan()[0]); }
  function frameChanged() { refresh(); syncDock(); syncSlider(); }

  /* ---- panes ---- */
  function makePane(i) {
    const el = document.createElement('section'); el.className = 'pane'; el.dataset.pane = i;
    el.innerHTML = '<canvas class="cv-base"></canvas><canvas class="cv-gl"></canvas><canvas class="cv-top"></canvas><button class="ptitle" aria-label="Product and tilt of this pane"></button><div class="loading"></div><div class="bar"><div class="bt"></div><span class="bu"></span><canvas width="780" height="14"></canvas><div class="bm"></div></div>';
    $('panes').appendChild(el);
    const base = el.querySelector('.cv-base'), glc = el.querySelector('.cv-gl'), top = el.querySelector('.cv-top'), map = MAP.create({ geo, base, top });
    let gl = null; try { gl = GL.create(glc); } catch (e) { console.warn(e); }
    const pane = { i, el, base, glc, top, map, gl, product: i === 0 ? 'dbz' : 'vel', tilt: 0, key: '', sweep: null, titleEl: el.querySelector('.ptitle'), barEl: el.querySelector('.bar'), barCv: el.querySelector('.bar canvas'), busy: false };
    map.theme = S.theme; map.layers = S.layers; map.activeSite = S.radar ? S.radar.id : null;
    map.addFrameHook((view) => { if (pane.gl) pane.gl.draw(view, pane.sweep ? pane.sweep.radar : S.radar); });
    map.addHook((c, v, h) => overlay(pane, c, v, h));
    map.on('view', (v) => link(pane, v));
    map.on('tap', (x, y, e) => tapPane(pane, x, y, e));
    map.dragHandler = (x, y, e) => dragRadar(pane, x, y, e);
    el.addEventListener('pointerdown', () => setActive(i), true);
    pane.titleEl.addEventListener('click', (e) => { e.stopPropagation(); setActive(i); openPaneMenu(pane); });
    new ResizeObserver(() => resizePane(pane)).observe(el);
    return pane;
  }
  function resizePane(p) {
    const r = p.el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return; const dpr = Math.min(2, window.devicePixelRatio || 1);
    p.map.resize(Math.round(r.width), Math.round(r.height), dpr); p.glc.width = p.base.width; p.glc.height = p.base.height; p.glc.style.width = p.base.style.width; p.glc.style.height = p.base.style.height; p.map.redraw();
  }
  let linking = false;
  function link(src, v) { if (linking || panes.length < 2) return; linking = true; for (const p of panes) if (p !== src) p.map.setView({ cx: v.cx, cy: v.cy, mpp: v.mpp }); linking = false; }
  function setActive(i) { if (S.active === i) return; S.active = i; panes.forEach((p, k) => p.el.classList.toggle('active', k === i)); syncDock(); }
  const act = () => panes[S.active] || panes[0];
  function setPaneCount(n) {
    S.panes = n; $('panes').classList.toggle('two', n === 2);
    while (panes.length < n) { const p = makePane(panes.length); panes.push(p); applyTheme(p); const v = panes[0].map.view; p.map.setView({ cx: v.cx, cy: v.cy, mpp: v.mpp }); }
    while (panes.length > n) { const p = panes.pop(); p.el.remove(); }
    if (S.active >= n) S.active = 0; panes.forEach((p, k) => p.el.classList.toggle('active', k === S.active)); $('b-panes').setAttribute('aria-pressed', n === 2 ? 'true' : 'false');
    panes.forEach(resizePane); refresh(); syncDock(); save();
  }

  /* ---- showing a sweep ---- */
  function lutFor(prod) { const k = PRODUCTS[prod].pal; return S.theme === 'light' && k === 'br' ? luts.brLight : luts[k]; }
  function applyProduct(p) { if (!p.gl) return; const k = PRODUCTS[p.product].pal; p.gl.setLut(lutFor(p.product), PAL.unitScale(pals[k].units)); drawBar(p); p.map.redraw(); }
  function show(p, sw) {
    p.sweep = sw; p.key = sw.key; p.busy = false; p.el.classList.remove('busy');
    if (p.gl) { p.gl.setSweep(sw.meta, sw[p.product]); applyProduct(p); }
    title(p); p.map.redraw();
  }
  function refresh() {
    panes.forEach((p) => {
      const key = keyOf(S.frame, p.tilt, S.radar, quickOf()); p.key = key;
      if (cache.has(key)) { show(p, cache.get(key)); return; }
      p.busy = true; p.el.classList.add('busy');
      want(S.frame, p.tilt, S.radar, S.dragging ? 0 : 0, quickOf()).then((sw) => { if (p.key === sw.key) show(p, sw); }).catch(() => { /* cancelled */ });
    });
    prefetch(); syncDock();
  }
  function prefetch() {
    if (S.dragging) return; const f = frames(), i = f.indexOf(S.frame);
    for (let k = 1; k <= 3; k++) { const n = f[(i + k) % f.length]; if (n === S.frame) break; for (const p of panes) want(n, p.tilt, S.radar, 4 + k, quickOf()).catch(() => {}); }
  }
  function title(p) {
    const sw = p.sweep, site = S.radar.id || 'Virtual', tm = pack.clock(pack.times[sw ? sw.frame : S.frame]).text;
    p.titleEl.innerHTML = '<span class="dot"></span><b>' + site + '</b><i>' + PRODUCTS[p.product].name + ' · ' + TILTS[p.tilt].toFixed(1) + '° · ' + tm + '</i>';
  }

  /* ---- the colour bar: drawn from the palette's own look-up table ---- */
  function barSpec(prod) {                                                     // the range shown, in m/s or dBZ, and the tick values in the display unit
    const U = UNITS[S.units];
    if (prod === 'dbz') return { lo: -30, hi: 80, tick: 10, unit: 'dBZ', toPhys: (x) => x, fromDisp: (x) => x, labels: [-20, -10, 0, 10, 20, 30, 40, 50, 60, 70, 80] };
    if (prod === 'vel') { const lim = 120 / 2.2369362920544; const step = S.units === 'metric' ? 10 : 20, top = Math.floor(lim * U.k / step) * step, lab = []; for (let v = -top; v <= top; v += step) lab.push(v); return { lo: -lim, hi: lim, unit: U.speed, fromDisp: (x) => x / U.k, labels: lab }; }
    const hi = 20, step = S.units === 'metric' ? 5 : 10, lab = []; for (let v = 0; v <= hi * U.k; v += step) lab.push(v); return { lo: 0, hi, unit: U.speed, fromDisp: (x) => x / U.k, labels: lab };
  }
  function drawBar(p) {
    const prod = p.product, k = PRODUCTS[prod].pal, lut = lutFor(prod), sc = PAL.unitScale(pals[k].units), sp = barSpec(prod), cv = p.barCv, W = cv.width, c = cv.getContext('2d'), img = c.createImageData(W, 1);
    for (let x = 0; x < W; x++) { const v = (sp.lo + (sp.hi - sp.lo) * (x + 0.5) / W) * sc, i = 4 * lut.index(v), a = lut.rgba[i + 3] / 255; img.data[4 * x] = lut.rgba[i]; img.data[4 * x + 1] = lut.rgba[i + 1]; img.data[4 * x + 2] = lut.rgba[i + 2]; img.data[4 * x + 3] = 255 * a; }
    c.clearRect(0, 0, W, 14); const row = document.createElement('canvas'); row.width = W; row.height = 1; row.getContext('2d').putImageData(img, 0, 0); c.imageSmoothingEnabled = false; c.drawImage(row, 0, 0, W, 14);
    const bt = p.barEl.querySelector('.bt'); bt.innerHTML = ''; for (const L of sp.labels) { const ph = sp.fromDisp(L), f = (ph - sp.lo) / (sp.hi - sp.lo); if (f < 0.01 || f > 0.99) continue; const s = document.createElement('span'); s.style.left = (f * 100) + '%'; s.textContent = L; bt.appendChild(s); }
    p.barEl.querySelector('.bu').textContent = sp.unit; p.barSpec = sp;
  }

  /* ---- what is drawn over the map ---- */
  const ringStep = (view, U) => { const per = view.mpp * Math.cos(S.radar.lat * DEG) * 90, c = U.dist === 'km' ? [2, 5, 10, 20, 25, 50, 100] : [1, 2, 5, 10, 20, 25, 50, 100]; for (const s of c) if (s * U.m >= per) return s * U.m; return 100 * U.m; };
  function overlay(p, c, v, h) {
    const th = h.theme, U = UNITS[S.units], R0 = S.radar, rm = [G.mercX(R0.lon), G.mercY(R0.lat)], rs = G.toScreen(v, rm[0], rm[1]);
    if (S.layers.rings) {
      const st = ringStep(v, U); c.save(); c.lineWidth = 1; c.strokeStyle = th.ring; c.fillStyle = th.ringText; c.font = '600 10.5px ' + h.FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let d = st; d <= 230000; d += st) {
        c.beginPath(); for (let a = 0; a <= 360; a += 3) { const q = G.dest(R0.lat, R0.lon, a, d), [x, y] = G.toScreen(v, G.mercX(q.lon), G.mercY(q.lat)); a === 0 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke();
        const q = G.dest(R0.lat, R0.lon, 0, d), [lx, ly] = G.toScreen(v, G.mercX(q.lon), G.mercY(q.lat)); if (lx > 0 && lx < v.w && ly > 12 && ly < v.h) { const t = Math.round(d / U.m) + ' ' + U.dist, w = h.text(c, t, '600 10.5px ' + h.FONT); c.fillStyle = th.halo; c.fillRect(lx - w / 2 - 3, ly - 7, w + 6, 14); c.fillStyle = th.ringText; c.fillText(t, lx, ly); }
      }
      c.restore();
    }
    p.customRect = null;
    if (R0.custom) {                                                            // a radar of the user's own: a pill like a site's
      const w = h.text(c, 'MY RADAR', '700 12px ' + h.FONT) + 18, x = rs[0] - w / 2, y = rs[1] - 11;
      c.save(); c.fillStyle = th.cone; c.beginPath(); c.arc(rs[0], rs[1], 7, 0, 6.2832); c.fill(); c.shadowColor = 'rgba(79,156,255,.55)'; c.shadowBlur = 14; c.fillStyle = '#4a90f5'; c.beginPath(); c.roundRect(x, y, w, 22, 9); c.fill(); c.restore();
      c.strokeStyle = 'rgba(190,220,255,.95)'; c.lineWidth = 1.6; c.beginPath(); c.roundRect(x, y, w, 22, 9); c.stroke(); c.fillStyle = '#fff'; c.font = '700 12px ' + h.FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('MY RADAR', rs[0], rs[1] + 0.5); p.customRect = [x, y, w, 22];
    }
    if (S.measure.length) {                                                     // the measuring line
      c.save(); c.strokeStyle = '#ffd166'; c.fillStyle = '#ffd166'; c.lineWidth = 2; c.setLineDash([7, 5]); const pts = S.measure.map((q) => G.toScreen(v, G.mercX(q.lon), G.mercY(q.lat)));
      if (pts.length === 2) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); c.lineTo(pts[1][0], pts[1][1]); c.stroke(); } c.setLineDash([]);
      for (const q of pts) { c.beginPath(); c.arc(q[0], q[1], 5, 0, 6.2832); c.fillStyle = '#ffd166'; c.fill(); c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 1.5; c.stroke(); }
      if (pts.length === 2) { const d = G.distBearing(S.measure[0].lat, S.measure[0].lon, S.measure[1].lat, S.measure[1].lon), t = (d.d / U.m).toFixed(d.d / U.m < 10 ? 2 : 1) + ' ' + U.dist + ' · ' + Math.round(d.az) + '°', mx = (pts[0][0] + pts[1][0]) / 2, my = (pts[0][1] + pts[1][1]) / 2, w = h.text(c, t, '700 12.5px ' + h.FONT);
        c.fillStyle = 'rgba(8,12,20,.88)'; c.beginPath(); c.roundRect(mx - w / 2 - 8, my - 22, w + 16, 22, 8); c.fill(); c.fillStyle = '#ffd166'; c.font = '700 12.5px ' + h.FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, mx, my - 10.5); }
      c.restore();
    }
    if (S.probe) {                                                              // the probe's cross-hair
      const [x, y] = G.toScreen(v, G.mercX(S.probe.lon), G.mercY(S.probe.lat)); c.save(); c.strokeStyle = '#fff'; c.lineWidth = 2; c.shadowColor = 'rgba(0,0,0,.8)'; c.shadowBlur = 4;
      c.beginPath(); c.arc(x, y, 9, 0, 6.2832); c.moveTo(x - 16, y); c.lineTo(x - 5, y); c.moveTo(x + 5, y); c.lineTo(x + 16, y); c.moveTo(x, y - 16); c.lineTo(x, y - 5); c.moveTo(x, y + 5); c.lineTo(x, y + 16); c.stroke(); c.restore();
    }
  }

  /* ---- popovers ---- */
  const pop = () => $('pop');
  function closePop() { pop().hidden = true; pop().innerHTML = ''; document.querySelectorAll('[data-open]').forEach((b) => b.removeAttribute('data-open')); }
  function openPop(anchor, html, where, onBuilt) {
    const el = pop(); closePop(); el.innerHTML = html; el.hidden = false; const ar = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor, w = el.offsetWidth, h = el.offsetHeight;
    let left = Math.min(innerWidth - w - 10, Math.max(10, ar.left + (ar.width || 0) / 2 - w / 2)), topPx;
    if (where === 'below') { topPx = ar.bottom + 10; left = Math.min(innerWidth - w - 10, Math.max(10, ar.right - w)); } else if (where === 'point') { topPx = Math.max(10, ar.top - h - 18); left = Math.min(innerWidth - w - 10, Math.max(10, ar.left - 30)); } else topPx = Math.max(10, ar.top - h - 12);
    el.style.left = left + 'px'; el.style.top = topPx + 'px'; if (anchor.setAttribute) anchor.setAttribute('data-open', ''); if (onBuilt) onBuilt(el);
  }
  document.addEventListener('pointerdown', (e) => { const el = pop(); if (!el.hidden && !el.contains(e.target) && !e.target.closest('[data-open]') && !e.target.closest('#dock button') && !e.target.closest('.top-tools')) { if (!(S.tool === 'probe' && e.target.closest('.pane'))) closePop(); } }, true);
  const row = (id, label, sub, checked) => '<button class="row" role="menuitemradio" aria-checked="' + (checked ? 'true' : 'false') + '" data-id="' + id + '">' + label + (sub ? '<span class="sub">' + sub + '</span>' : '') + '</button>';
  function onRows(el, fn) { el.querySelectorAll('.row').forEach((b) => b.addEventListener('click', () => fn(b.dataset.id, b))); }

  function openProductMenu(anchor) {
    const p = act(); openPop(anchor, '<h4>Product</h4>' + Object.keys(PRODUCTS).map((k) => row(k, PRODUCTS[k].name, '', p.product === k)).join(''), 'above', (el) => onRows(el, (id) => { setProduct(p, id); closePop(); }));
  }
  function openPaneMenu(pane) {
    openPop(pane.titleEl, '<h4>Product</h4>' + Object.keys(PRODUCTS).map((k) => row('p:' + k, PRODUCTS[k].name, '', pane.product === k)).join('') + '<h4>Tilt</h4><div class="seg" id="pm-tilts" style="flex-wrap:wrap">' + TILTS.map((t, i) => '<button data-t="' + i + '" aria-pressed="' + (pane.tilt === i) + '" style="flex:0 0 22%">' + t.toFixed(1) + '°</button>').join('') + '</div>', 'below', (el) => {
      onRows(el, (id) => { setProduct(pane, id.slice(2)); closePop(); }); el.querySelectorAll('#pm-tilts button').forEach((b) => b.addEventListener('click', () => { setTilt(pane, +b.dataset.t); closePop(); }));
    });
  }
  function setProduct(p, prod) { p.product = prod; if (p.sweep && p.gl) p.gl.setSweep(p.sweep.meta, p.sweep[prod]); applyProduct(p); title(p); syncDock(); }
  function setTilt(p, i) { p.tilt = Math.min(TILTS.length - 1, Math.max(0, i)); refresh(); }

  function nearestSites(lat, lon, n) { const s = geo.points.site, a = []; for (let i = 0; i < s.n; i++) a.push({ i, d: G.distBearing(lat, lon, s.lat[i], s.lon[i]).d }); a.sort((x, y) => x.d - y.d); return a.slice(0, n); }
  const siteInfo = (i) => { const s = geo.points.site, ex = (s.extra[i] || '').split('|'); return { id: s.names[i], lat: s.lat[i], lon: s.lon[i], name: ex[0] || '', elev: +ex[1] || 0 }; };
  function openSiteMenu(anchor) {
    const v = act().map.view, c = G.fromMerc(v.cx, v.cy), U = UNITS[S.units], list = nearestSites(c.lat, c.lon, 10);
    openPop(anchor, '<h4>Radars near the map</h4>' + list.map((q) => { const s = siteInfo(q.i); return row('s:' + s.id, '<b>' + s.id + '</b> ' + s.name, Math.round(q.d / U.m) + ' ' + U.dist, S.radar.id === s.id); }).join('') + '<h4>Or</h4>' + row('here', 'A radar at the middle of the map', '', S.radar.custom) + '<div class="kv" style="color:var(--dim)"><span></span><span style="font-weight:400">Drag the radar\'s pill on the map to move it.</span></div>', 'above', (el) => onRows(el, (id) => {
      if (id === 'here') { const m = act().map.view, q = G.fromMerc(m.cx, m.cy); setRadar({ id: null, custom: true, name: 'Virtual radar', lat: q.lat, lon: q.lon }); } else { const s = siteInfo(geo.points.site.names.indexOf(id.slice(2))); setRadar({ id: s.id, custom: false, name: s.name, lat: s.lat, lon: s.lon }); }
      closePop();
    }));
  }
  function setRadar(r) {
    S.radar = r; for (const p of panes) p.map.activeSite = r.id; refresh(); syncDock(); for (const p of panes) p.map.redraw();
  }
  function openLayers(anchor) {
    const L = S.layers, items = [['rings', 'Range rings'], ['place', 'Places'], ['site', 'Radar sites'], ['road', 'Roads'], ['river', 'Rivers'], ['county', 'County lines'], ['state', 'State lines']];
    openPop(anchor, '<h4>Map layers</h4>' + items.map(([k, n]) => row(k, n, '', L[k])).join('') + '<div class="kv"><span></span><span style="font-weight:400;font-size:11px;color:var(--dim)">Map data: Census cartographic boundaries, Natural Earth and the US Cities Database, all public domain.</span></div>', 'below', (el) => onRows(el, (id, b) => { L[id] = !L[id]; b.setAttribute('aria-checked', L[id] ? 'true' : 'false'); for (const p of panes) { p.map.layers = L; p.map.redraw(); } save(); }));
  }
  function openSettings(anchor) {
    const seg = (id, opts, cur) => '<div class="seg" data-seg="' + id + '">' + opts.map(([v, n]) => '<button data-v="' + v + '" aria-pressed="' + (cur === v) + '">' + n + '</button>').join('') + '</div>';
    openPop(anchor, '<h4>Units</h4>' + seg('units', Object.keys(UNITS).map((k) => [k, k === 'imperial' ? 'mi · mph' : k === 'nautical' ? 'nm · kt' : 'km · m/s']), S.units) + '<h4>Resolution</h4>' + seg('res', [['super', 'Super-res'], ['legacy', 'Legacy']], S.res)
      + '<h4>Velocity</h4>' + seg('dealias', [['0', 'Folded'], ['1', 'Unfolded']], S.dealias ? '1' : '0') + '<h4>Clutter and clear air</h4>' + seg('clutter', [['1', 'Shown'], ['0', 'Hidden']], S.clutter ? '1' : '0')
      + '<h4>Theme</h4>' + seg('theme', [['dark', 'Dark'], ['light', 'Light']], S.theme), 'below', (el) => el.querySelectorAll('[data-seg]').forEach((g) => g.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        const k = g.dataset.seg, v = b.dataset.v; if (k === 'units') S.units = v; else if (k === 'res') S.res = v; else if (k === 'dealias') S.dealias = v === '1'; else if (k === 'clutter') S.clutter = v === '1'; else if (k === 'theme') setTheme(v);
        g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); panes.forEach((p) => drawBar(p)); refresh(); save();
      }))));
  }
  function openSpeed(anchor) { openPop(anchor, '<h4>Playback speed</h4>' + SPEEDS.map((s, i) => row('v:' + i, s + ' game minute' + (s > 1 ? 's' : '') + ' per second', '', S.speed === i)).join(''), 'above', (el) => onRows(el, (id) => { S.speed = +id.slice(2); syncDock(); save(); closePop(); })); }

  /* ---- the tools ---- */
  function setTool(t) {
    S.tool = S.tool === t ? 'none' : t; $('b-probe').setAttribute('aria-pressed', S.tool === 'probe' ? 'true' : 'false'); $('b-measure').setAttribute('aria-pressed', S.tool === 'measure' ? 'true' : 'false');
    if (S.tool !== 'probe') { S.probe = null; closePop(); for (const p of panes) { p.barEl.querySelector('.bm').style.display = 'none'; } } if (S.tool !== 'measure') S.measure = [];
    for (const p of panes) { p.top.style.cursor = S.tool === 'none' ? '' : 'crosshair'; p.map.redraw(); }
    if (S.tool === 'probe') toast('Tap the map to read the radar and the model'); else if (S.tool === 'measure') toast('Tap two points');
  }
  function tapPane(p, x, y) {
    setActive(p.i); const v = p.map.view, [mx, my] = G.fromScreen(v, x, y), ll = G.fromMerc(mx, my);
    if (S.tool === 'probe') { S.probe = ll; probeAt(p, x, y, ll); for (const q of panes) q.map.redraw(); return; }
    if (S.tool === 'measure') { if (S.measure.length >= 2) S.measure = []; S.measure.push(ll); for (const q of panes) q.map.redraw(); return; }
    const id = p.map.hitSite(x, y); if (id && id !== S.radar.id) { const s = siteInfo(geo.points.site.names.indexOf(id)); setRadar({ id: s.id, custom: false, name: s.name, lat: s.lat, lon: s.lon }); toast(s.id + ' · ' + s.name); }
  }
  function dragRadar(p, x, y) {                                                // a drag that starts on the radar's pill moves the radar
    if (S.tool !== 'none') return null; const hit = p.map.hitSite(x, y), cr = p.customRect, onCustom = cr && x >= cr[0] && x <= cr[0] + cr[2] && y >= cr[1] && y <= cr[1] + cr[3];
    if (!(hit && hit === S.radar.id) && !onCustom) return null;
    return { move(px, py) { const [mx, my] = G.fromScreen(p.map.view, px, py), q = G.fromMerc(mx, my); S.dragging = true; S.radar = { id: null, custom: true, name: 'Virtual radar', lat: q.lat, lon: q.lon }; for (const k of panes) k.map.activeSite = null; refreshQuick(); },
      end() { S.dragging = false; refresh(); toast('Radar at ' + S.radar.lat.toFixed(2) + '°N ' + Math.abs(S.radar.lon).toFixed(2) + '°W'); } };
  }
  let quickBusy = false;
  function refreshQuick() {                                                    // while the radar is dragged: a legacy-resolution scan at most once at a time
    syncDock(); for (const q of panes) q.map.redraw(); if (quickBusy) return; quickBusy = true;
    const go = () => { const keys = panes.map((p) => [p, keyOf(S.frame, p.tilt, S.radar, true)]); Promise.all(keys.map(([p, k]) => { p.key = k; return want(S.frame, p.tilt, S.radar, 0, true).then((sw) => [p, sw]); })).then((rs) => { rs.forEach(([p, sw]) => { if (p.key === sw.key) show(p, sw); }); quickBusy = false; if (S.dragging && panes.some((p) => p.key !== keyOf(S.frame, p.tilt, S.radar, true))) { quickBusy = true; go(); } }).catch(() => { quickBusy = false; }); };
    go();
  }
  function probeAt(p, x, y, ll) {
    const sw = p.sweep, U = UNITS[S.units], R0 = S.radar, loc = G.local(R0.lat, R0.lon, ll.lat, ll.lon), ground = Math.hypot(loc.x, loc.y), bearing = ((Math.atan2(loc.x, loc.y) / DEG) + 360) % 360;
    let html = '', val = null, unit = '';
    if (sw) {
      const m = sw.meta, cosE = Math.cos(m.elev * DEG), slant = ground / cosE, gi = Math.floor((slant - (m.r0 - m.gate / 2)) / m.gate), ai = Math.min(m.nRad - 1, Math.floor(bearing / m.dAz));
      if (gi >= 0 && gi < m.nGates) { const raw = sw[p.product][ai * m.nGates + gi]; if (raw !== GL.NONE) { val = raw / 2; unit = p.product === 'dbz' ? 'dBZ' : U.speed; if (p.product !== 'dbz') val *= U.k; } }
      const beam = R.beamHeight(slant, m.elev, m.antenna);
      html += '<div class="big">' + (val === null ? '—' : val.toFixed(p.product === 'dbz' ? 1 : 0)) + '<small>' + (val === null ? 'no data here' : unit) + '</small></div><div class="kv"><span>Range</span><span>' + (ground / U.m).toFixed(1) + ' ' + U.dist + '</span><span>Bearing</span><span>' + Math.round(bearing) + '°</span><span>Beam height</span><span>' + (beam / (U.dist === 'km' ? 1000 : 1609.344)).toFixed(2) + ' ' + (U.dist === 'km' ? 'km' : 'mi') + ' above ground</span></div>';
      // the model's own values at that point: what is true, beside what the radar says
      const c = pack.corner(pack.times[sw.frame]), lp = G.local(pack.scenario.lat0, pack.scenario.lon0, ll.lat, ll.lon), truth = pack.sample(sw.frame, lp.x - c[0], lp.y - c[1], Math.max(50, beam));
      if (truth) { const spd = Math.hypot(truth.u, truth.v), dir = ((Math.atan2(-truth.u, -truth.v) / DEG) + 360) % 360;
        html += '<h4>The model, at the beam</h4><div class="kv"><span>Reflectivity</span><span>' + (truth.dbz <= pack.floor ? 'none' : truth.dbz + ' dBZ') + '</span><span>Wind</span><span>' + Math.round(spd * U.k) + ' ' + U.speed + ' from ' + Math.round(dir) + '°</span><span>Vertical wind</span><span>' + (truth.w >= 0 ? '+' : '') + (truth.w * U.k).toFixed(1) + ' ' + U.speed + '</span><span>Fall speed</span><span>' + (truth.vz * U.k).toFixed(1) + ' ' + U.speed + '</span></div>'; }
      else html += '<h4>The model</h4><div class="kv"><span></span><span style="font-weight:400;color:var(--dim)">Outside the storm\'s box: clear air.</span></div>';
    } else html = '<div class="big">—</div>';
    const near = nearestPlace(ll.lat, ll.lon); if (near) html += '<div class="kv"><span>Near</span><span>' + near + '</span></div>';
    const r = p.top.getBoundingClientRect(); openPop({ left: r.left + x, top: r.top + y, right: r.left + x, bottom: r.top + y, width: 0 }, html, 'point');
    const bm = p.barEl.querySelector('.bm'); bm.style.display = 'none';
    if (val !== null && p.barSpec) { const ph = p.product === 'dbz' ? val : val / U.k, fr = (ph - p.barSpec.lo) / (p.barSpec.hi - p.barSpec.lo); if (fr >= 0 && fr <= 1) { bm.style.left = fr * 100 + '%'; bm.style.display = 'block'; } }
  }
  function nearestPlace(lat, lon) { const P = geo.points.place; let best = -1, bd = 25000; for (let i = 0; i < P.n; i++) { if (Math.abs(P.lat[i] - lat) > 0.3 || Math.abs(P.lon[i] - lon) > 0.4) continue; const d = G.distBearing(lat, lon, P.lat[i], P.lon[i]).d; if (d < bd) { bd = d; best = i; } } return best < 0 ? '' : P.names[best] + ', ' + P.extra[best] + ' (' + (bd / 1000).toFixed(0) + ' km)'; }

  /* ---- the dock ---- */
  function syncSlider() {
    const [a, b] = tSpan(), f = b > a ? (S.t - a) / (b - a) : 0, el = $('slider'); el.value = Math.round(f * 1000); el.style.setProperty('--p', (f * 100) + '%');
    document.querySelectorAll('#ticks span').forEach((s) => s.classList.toggle('on', +s.dataset.i === S.frame));
  }
  function buildTicks() {
    const [a, b] = tSpan(), box = $('ticks'); box.innerHTML = ''; for (const i of frames()) { const s = document.createElement('span'); s.dataset.i = i; s.style.left = (b > a ? (pack.times[i] - a) / (b - a) * 100 : 0) + '%'; box.appendChild(s); }
  }
  function syncDock() {
    const p = act(), R0 = S.radar; $('site-id').textContent = R0.id || 'Virtual'; $('site-nm').textContent = R0.custom ? R0.lat.toFixed(2) + '°N ' + Math.abs(R0.lon).toFixed(2) + '°W' : R0.name;
    $('prod-nm').textContent = PRODUCTS[p.product].name; $('tilt-v').textContent = TILTS[p.tilt].toFixed(1) + '°'; $('tilt-dn').disabled = p.tilt === 0; $('tilt-up').disabled = p.tilt === TILTS.length - 1;
    document.querySelectorAll('#int button').forEach((b) => { const iv = +b.dataset.i, on = hasEvery(iv); b.disabled = !on; b.title = on ? 'A frame every ' + iv + ' minutes' : 'This recording has a frame every 5 minutes; 1 and 3 come with live runs'; b.setAttribute('aria-pressed', iv === S.interval ? 'true' : 'false'); });
    $('speed').textContent = '×' + SPEEDS[S.speed]; const t = pack.times[S.frame], tm = pack.clock(t).text; $('clk').textContent = tm; const sw = p.sweep; $('clk-sub').textContent = sw && sw.frame !== S.frame ? 'Loading…' : 'Updated ' + tm;
    panes.forEach(title);
  }

  /* ---- theme ---- */
  function applyTheme(p) { p.map.setTheme(S.theme); applyProduct(p); }
  const ICON_SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>', ICON_MOON = '<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/></svg>';
  function setTheme(t) { S.theme = t; document.documentElement.dataset.theme = t; $('b-theme').innerHTML = t === 'dark' ? ICON_SUN : ICON_MOON; $('b-theme').title = t === 'dark' ? 'Light theme (T)' : 'Dark theme (T)'; panes.forEach(applyTheme); save(); }

  /* ---- playing ---- */
  let last = 0;
  function tick(ts) {
    requestAnimationFrame(tick); const dt = Math.min(0.25, (ts - last) / 1000); last = ts; if (!S.playing) return;
    const f = frames(), [a, b] = tSpan(); let nt = S.t + SPEEDS[S.speed] * dt;
    if (nt >= b - 1e-6 && S.frame === f[f.length - 1]) { if (S.loop) nt = a; else { setPlaying(false); return; } }
    nt = Math.min(nt, b); const nf = frameAt(nt);
    if (nf !== S.frame && !ready(nf)) { for (const p of panes) want(nf, p.tilt, S.radar, 1, quickOf()).catch(() => {}); return; }      // buffering: wait for the sweeps of the next frame
    setT(nt, true);
  }

  /* ---- another storm: the page plays the pack it is given (the Lab's, or a file's) ---- */
  const focusOf = (p, i) => { const h = p.h, f = h.nests && h.fn && h.fn[i]; if (f && f.length) { const nh = h.nests[f[0][0]]; return [f[0][1] + nh.nx * nh.dx / 2, f[0][2] + nh.ny * nh.dx / 2]; } return p.track[i]; };      // where to look: the middle of the first nest of the frame, else the strongest updraft
  async function setPack(p, o) {
    o = o || {}; setPlaying(false); if ((o.id || 'run') === 'run') runPack = p;
    const old = scanner; pack = p; cache.clear(); pending.clear();
    scanner = await makeScanner(); if (old && old.dispose) old.dispose();
    const sc = pack.scenario, i0 = geo.points.site.names.indexOf(sc.radar); if (i0 < 0) throw new Error('no radar ' + sc.radar);
    const s0 = siteInfo(i0); S.radar = { id: s0.id, custom: false, name: s0.name, lat: s0.lat, lon: s0.lon };
    if (o.interval && hasEvery(o.interval)) S.interval = o.interval; else if (!hasEvery(S.interval)) S.interval = [5, 10, 3, 1].find(hasEvery) || 5;
    const want = o.t === undefined ? 60 : o.t, near = pack.times.reduce((b, t, i) => (Math.abs(t - want) < Math.abs(pack.times[b] - want) ? i : b), 0); S.t = pack.times[near]; S.frame = frameAt(S.t);
    const tr = focusOf(pack, S.frame), c = pack.boxLatLon(pack.times[S.frame], tr[0], tr[1]), mid = o.zoom ? c : { lat: (c.lat + S.radar.lat) / 2, lon: (c.lon + S.radar.lon) / 2 };      // (close up: on the storm; else between the storm and the radar)
    for (const pn of panes) { pn.map.activeSite = S.radar.id; pn.map.setView({ cx: G.mercX(mid.lon), cy: G.mercY(mid.lat), mpp: G.mppOf(o.zoom || 8.9) }); pn.sweep = null; pn.key = ''; }
    S.storm = o.id || 'run'; buildTicks(); refresh(); syncSlider(); syncDock();
  }
  function fetchBytes(url, onProgress) {                                       // XMLHttpRequest, not fetch: it reads a file beside a page that was opened from disk (the browser's setting permitting) and says how far it is
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest(); x.open('GET', url); x.responseType = 'arraybuffer';
      x.onprogress = (e) => { if (onProgress && e.lengthComputable && e.total) onProgress(e.loaded / e.total); };
      x.onload = () => (x.status === 0 || (x.status >= 200 && x.status < 300)) && x.response && x.response.byteLength ? resolve(new Uint8Array(x.response)) : reject(new Error(x.status ? 'the server said ' + x.status : 'the file is empty'));
      x.onerror = () => reject(new Error('the file could not be fetched; it is a separate file beside this page, so the page has to be opened from its web address'));
      x.send();
    });
  }
  async function showStorm(id) {
    if (stormBusy) return; const st = STORMS.find((q) => q.id === id);
    if (id === 'run') { if (!runPack) throw new Error('no run yet: draw a day and run a storm'); return setPack(runPack, { id: 'run', t: S.storm === 'run' ? S.t : undefined }); }
    if (!st) throw new Error('no storm ' + id);
    if (!st.pack && st.file) {
      stormBusy = true;
      try { const bytes = await fetchBytes(st.file, (f) => toast('Loading ' + st.name + ' · ' + Math.round(f * 100) + '%', 60000)); st.pack = PACK.fromBody(await PACK.gunzip(bytes)); $('toast').hidden = true; }
      finally { stormBusy = false; }
    }
    const p = st.pack || pack0;
    await setPack(p, { id, t: st.t, zoom: st.zoom, interval: st.interval });
    if (st.panes) { setPaneCount(st.panes.length); panes.forEach((pn, i) => { pn.tilt = 0; setProduct(pn, st.panes[i]); }); refresh(); }
    closePop();
  }
  const row2 = (id, name, sub, checked) => '<button class="row two" role="menuitemradio" aria-checked="' + (checked ? 'true' : 'false') + '" data-id="' + id + '"><span class="rt"><b>' + name + '</b><span class="sub">' + sub + '</span></span></button>';        // a row with its note under the name
  function openStormMenu(anchor) {
    openPop(anchor, '<h4>Storms</h4>' + STORMS.map((q) => row2(q.id, q.name, q.sub + (q.mb ? ' · ' + q.mb + ' MB' : ''), S.storm === q.id)).join('') + (runPack ? row2('run', 'Your last run', 'From Draw: ' + (runPack.name || 'a storm'), S.storm === 'run') : '')
      + '<div class="kv"><span></span><span style="font-weight:400;font-size:11px;color:var(--dim)">The 100 m storm is a recording of the real model: cells of 500 m with a nest of 100 m round the storm\'s rotation.</span></div>', 'below',
      (el) => onRows(el, (id) => { closePop(); showStorm(id).catch((e) => { $('toast').hidden = true; toast('That storm could not be shown: ' + e.message, 9000); }); }));
  }

  /* ---- wiring ---- */
  function wire() {
    const on = (id, f) => $(id).addEventListener('click', f);
    on('t-play', () => setPlaying(!S.playing)); on('t-first', () => { setPlaying(false); setT(tSpan()[0]); }); on('t-last', () => { setPlaying(false); setT(tSpan()[1]); });
    on('t-prev', () => { setPlaying(false); step(-1); }); on('t-next', () => { setPlaying(false); step(1); });
    $('slider').addEventListener('input', (e) => { setPlaying(false); const [a, b] = tSpan(); setT(a + (e.target.value / 1000) * (b - a)); });
    document.querySelectorAll('#int button').forEach((b) => b.addEventListener('click', () => { S.interval = +b.dataset.i; buildTicks(); setT(S.t); save(); syncDock(); }));
    on('speed', (e) => openSpeed(e.currentTarget)); on('prod', (e) => openProductMenu(e.currentTarget)); on('site', (e) => openSiteMenu(e.currentTarget));
    on('tilt-dn', () => setTilt(act(), act().tilt - 1)); on('tilt-up', () => setTilt(act(), act().tilt + 1));
    on('b-probe', () => setTool('probe')); on('b-measure', () => setTool('measure'));
    on('b-locate', () => { const R0 = S.radar, v = act().map.view; for (const p of panes) p.map.setView({ cx: G.mercX(R0.lon), cy: G.mercY(R0.lat), mpp: Math.min(v.mpp, G.mppOf(8.4)) }); });
    on('z-in', () => { const m = act().map; m.zoomAt(m.view.w / 2, m.view.h / 2, 1.6); }); on('z-out', () => { const m = act().map; m.zoomAt(m.view.w / 2, m.view.h / 2, 1 / 1.6); });
    on('b-storms', (e) => openStormMenu(e.currentTarget)); on('b-theme', () => setTheme(S.theme === 'dark' ? 'light' : 'dark')); on('b-layers', (e) => openLayers(e.currentTarget)); on('b-settings', (e) => openSettings(e.currentTarget)); on('b-panes', () => setPaneCount(S.panes === 1 ? 2 : 1));
    document.addEventListener('keydown', (e) => {
      if ($('app').dataset.mode === 'draw') return;                                                      // (the editor has its own keys)
      if (e.target && /input|textarea|select/i.test(e.target.tagName) && e.target.id !== 'slider') return; if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key; let used = true;
      if (k === ' ') setPlaying(!S.playing); else if (k === 'ArrowRight') { setPlaying(false); step(1); } else if (k === 'ArrowLeft') { setPlaying(false); step(-1); } else if (k === 'ArrowUp') setTilt(act(), act().tilt + 1); else if (k === 'ArrowDown') setTilt(act(), act().tilt - 1);
      else if (k === '1' || k === '2' || k === '3') setProduct(act(), ['dbz', 'vel', 'sw'][+k - 1]); else if (k === 'p' || k === 'P') setTool('probe'); else if (k === 'm' || k === 'M') setTool('measure');
      else if (k === 't' || k === 'T') setTheme(S.theme === 'dark' ? 'light' : 'dark'); else if (k === 'c' || k === 'C') $('b-locate').click(); else if (k === '+' || k === '=') { const m = act().map; m.zoomAt(m.view.w / 2, m.view.h / 2, 1.5); } else if (k === '-') { const m = act().map; m.zoomAt(m.view.w / 2, m.view.h / 2, 1 / 1.5); }
      else if (k === 'Escape') { if (!pop().hidden) closePop(); else if (S.tool !== 'none') setTool(S.tool); else used = false; } else used = false;
      if (used) e.preventDefault();
    });
  }

  /* ---- boot ---- */
  async function boot() {
    const inflate = async (u8) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    geo = G.decodeBundle(await inflate(b64(D.geo)));
    const body = await PACK.gunzip(b64(D.pack)); pack = PACK.fromBody(body); pack0 = pack;
    pals = { br: PAL.parse(D.pal.br), bv: PAL.parse(D.pal.bv), sw: PAL.parse(D.pal.sw) };
    luts = { br: PAL.lut(pals.br, { step: 0.25, vmin: -40, vmax: 105 }), bv: PAL.lut(pals.bv, { step: 0.25 }), sw: PAL.lut(pals.sw, { step: 0.1 }) };
    luts.brLight = Object.assign({}, luts.br, { rgba: Uint8ClampedArray.from(luts.br.rgba) });                    // on white the weak echo is made fainter, as RadarScope's light map does
    for (let i = 0; i < luts.br.n; i++) { const v = luts.br.vmin + i * luts.br.step; if (v < 25) luts.brLight.rgba[4 * i + 3] = Math.round(luts.br.rgba[4 * i + 3] * Math.max(0.35, Math.min(1, 0.35 + (v + 5) / 30 * 0.65))); }
    scanner = await makeScanner();
    const sc = pack.scenario, i0 = geo.points.site.names.indexOf(sc.radar), s0 = siteInfo(i0); S.radar = { id: s0.id, custom: false, name: s0.name, lat: s0.lat, lon: s0.lon };
    document.documentElement.dataset.theme = S.theme; $('b-theme').innerHTML = S.theme === 'dark' ? ICON_SUN : ICON_MOON; if (!hasEvery(S.interval)) S.interval = 5;
    setPaneCount(S.panes); panes[0].tilt = 0;
    const t60 = pack.times.reduce((b, t, i) => (Math.abs(t - 60) < Math.abs(pack.times[b] - 60) ? i : b), 0); S.t = pack.times[t60]; S.frame = frameAt(S.t);
    const tr = pack.track[S.frame], c = pack.boxLatLon(pack.times[S.frame], tr[0], tr[1]), mid = { lat: (c.lat + S.radar.lat) / 2, lon: (c.lon + S.radar.lon) / 2 };
    for (const p of panes) { p.map.activeSite = S.radar.id; p.map.setView({ cx: G.mercX(mid.lon), cy: G.mercY(mid.lat), mpp: G.mppOf(8.9) }); }
    new ResizeObserver(() => { const d = $('dock'); document.documentElement.style.setProperty('--dockh', d.offsetHeight + 'px'); }).observe($('dock'));
    wire(); buildTicks(); setActive(0); panes.forEach((p) => { applyTheme(p); drawBar(p); }); refresh(); syncSlider(); requestAnimationFrame(tick);
    try { if (location.hash !== '#draw' && !localStorage.getItem(LS + '-tip')) { localStorage.setItem(LS + '-tip', '1'); setTimeout(() => toast('Tip: drag the radar\'s pill to move it, tap Probe to read the storm, and the cloud button brings a closer storm with a tight rotation', 8000), 1500); } } catch (e) { /* none */ }
    window.SEVERE.ready = true; window.dispatchEvent(new Event('severe-ready'));
  }

  const api = { S, TILTS, SPEEDS, PRODUCTS, STORMS, toast, setPack, showStorm, fetchBytes, get runPack() { return runPack; }, get panes() { return panes; }, get pack() { return pack; }, get geo() { return geo; }, get cache() { return cache; }, get scanner() { return scanner; }, ready: false,
    setT, step, setPlaying, setPaneCount, setTheme, setTool, setProduct, setTilt, setRadar, frames, keyOf, probeAt, tapPane, refresh, UNITS, siteInfo,
    async whenIdle() { for (let i = 0; i < 600; i++) { if (!scanner.busy() && !panes.some((p) => p.busy)) { await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); if (!scanner.busy() && !panes.some((p) => p.busy)) return true; } await new Promise((r) => setTimeout(r, 50)); } return false; } };
  window.SEVERE = api;
  boot().catch((e) => { console.error(e); toast('The radar could not start: ' + e.message, 12000); window.SEVERE.error = String(e && e.stack || e); });
})();
