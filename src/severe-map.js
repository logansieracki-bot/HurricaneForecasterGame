/* Severe: the radar page's map engine (docs/severe-plan.md section 7.3).
 *
 * A small Web Mercator map on two canvases (the base under the radar, the top over it) that redraws everything from one view state in one animation frame, so that the basemap, the radar's
 * GPU layer and the overlays can never disagree about where they are. It draws the baked vector data of src/severe-geo.js (decodeBundle): land and water, county, state and national lines,
 * rivers and roads with zoom-dependent detail, place names with collision, the radar sites as pills; and it handles the gestures (drag with inertia, wheel and pinch zoom about the
 * pointer, double-tap zoom, tap) and hands the app what it needs to draw on top (`hooks`).
 *
 * `layoutLabels` is pure (the collision rule: higher priority first, no two boxes overlap) and tested on its own.
 * A classic script that sets `globalThis.HFSevereMap`; it needs HFSevereGeo first.
 */
(function () {
  const G = globalThis.HFSevereGeo;
  const FONT = '"Avenir Next","Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",sans-serif';
  const MIN_Z = 3.4, MAX_Z = 13.2;

  /* ---- the colours of a theme ---- */
  const THEMES = {
    dark: { ocean: '#0b1320', land: '#171a1f', lake: '#17243a', lakeEdge: 'rgba(96,140,200,.30)', county: 'rgba(136,150,172,.30)', state: 'rgba(178,192,212,.46)', outline: 'rgba(214,224,238,.62)',
      river: '#2e5a98', roadCase: 'rgba(8,10,14,.75)', road: ['#d8b24a', '#b49f66', '#7f7662'], label: '#f3f6fb', halo: 'rgba(6,9,15,.94)', dim: '#9aa6b8', dot: '#dfe6f0', stateLabel: 'rgba(190,202,220,.32)',
      pill: 'rgba(66,74,88,.94)', pillText: '#e8edf5', pillEdge: 'rgba(255,255,255,.16)', ring: 'rgba(150,170,200,.32)', ringText: 'rgba(190,205,225,.7)', cone: '#05070b' },
    light: { ocean: '#b9d3ea', land: '#eceee9', lake: '#b9d3ea', lakeEdge: 'rgba(70,110,160,.35)', county: 'rgba(80,92,110,.22)', state: 'rgba(54,66,86,.55)', outline: 'rgba(30,40,58,.72)',
      river: '#7aa7d6', roadCase: 'rgba(255,255,255,.85)', road: ['#e2a23a', '#c9b27a', '#b9b3a2'], label: '#161d2a', halo: 'rgba(255,255,255,.92)', dim: '#5a6679', dot: '#2a3446', stateLabel: 'rgba(40,52,72,.28)',
      pill: 'rgba(255,255,255,.95)', pillText: '#27324a', pillEdge: 'rgba(20,30,50,.22)', ring: 'rgba(40,60,90,.28)', ringText: 'rgba(40,60,90,.7)', cone: '#10131a' },
  };

  /* ---- label collision: items { x, y, w, h, pri } (centre and size in pixels); the highest pri first, a box that would touch a placed one is dropped ---- */
  function layoutLabels(items, pad, blockers) {               // blockers: boxes [x0, y0, x1, y1] that are already taken (the site pills)
    pad = pad === undefined ? 2 : pad;
    const order = items.slice().sort((a, b) => b.pri - a.pri), placed = (blockers || []).map((b) => b.slice()), out = [];
    for (const it of order) {
      const x0 = it.x - it.w / 2 - pad, x1 = it.x + it.w / 2 + pad, y0 = it.y - it.h / 2 - pad, y1 = it.y + it.h / 2 + pad; let ok = true;
      for (let i = 0; i < placed.length; i++) { const p = placed[i]; if (x0 < p[2] && x1 > p[0] && y0 < p[3] && y1 > p[1]) { ok = false; break; } }
      if (ok) { placed.push([x0, y0, x1, y1]); out.push(it); }
    }
    return out;
  }

  function create(o) {
    const geo = o.geo, base = o.base, top = o.top, bctx = base.getContext('2d'), tctx = top.getContext('2d');
    const M = { view: { cx: G.mercX(-97.5), cy: G.mercY(36), mpp: G.mppOf(7), w: 800, h: 600 }, theme: 'dark', dpr: 1, hooks: [], layers: { county: true, state: true, road: true, river: true, place: true, site: true }, activeSite: null, warnedSites: new Set() };
    const ev = {}, on = (n, f) => { (ev[n] = ev[n] || []).push(f); }, emit = (n, a, b, c) => { for (const f of ev[n] || []) f(a, b, c); };
    const split = (lines) => { const by = {}; for (const l of lines || []) (by[l.c] = by[l.c] || []).push(l); return by; };
    const L = { county: split(geo.lines.county), state: split(geo.lines.state), outline: split(geo.lines.outline), road: split(geo.lines.road), river: split(geo.lines.river) };
    let dirty = true, raf = 0, textCache = new Map(), inertia = null, lastHit = [];

    /* ---- the view ---- */
    const zoom = () => G.zoomOf(M.view.mpp);
    function clampView() {
      const v = M.view, wide = Math.min(G.mppOf(MIN_Z), (G.mercX(-134) - G.mercX(-54)) * -1 / Math.max(1, v.w));      // (zoomed out no further than the land data reaches across the pane)
      v.mpp = Math.min(wide, Math.max(G.mppOf(MAX_Z), v.mpp));
      const r = geo.meta.region || [-128, 23, -64, 52], x0 = G.mercX(r[0]), x1 = G.mercX(r[2]), y0 = G.mercY(r[1]), y1 = G.mercY(r[3]);
      v.cx = Math.min(x1, Math.max(x0, v.cx)); v.cy = Math.min(y1, Math.max(y0, v.cy));
    }
    function setView(p) { Object.assign(M.view, p); clampView(); changed(); }
    function changed() { dirty = true; emit('view', M.view); if (!raf) schedule(); }
    function schedule() { if (!raf) raf = requestAnimationFrame(frame); }
    function resize(w, h, dpr) {
      dpr = dpr || (globalThis.devicePixelRatio || 1); M.dpr = dpr; M.view.w = w; M.view.h = h;
      for (const c of [base, top]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = w + 'px'; c.style.height = h + 'px'; }
      changed();
    }
    function zoomAt(px, py, factor) {                         // factor > 1 zooms in about the pixel
      const v = M.view, [mx, my] = G.fromScreen(v, px, py), nm = v.mpp / factor;
      v.cx = mx - (px - v.w / 2) * nm; v.cy = my + (py - v.h / 2) * nm; v.mpp = nm; clampView(); changed();
    }
    function panBy(dx, dy) { const v = M.view; v.cx -= dx * v.mpp; v.cy += dy * v.mpp; clampView(); changed(); }
    function fitBounds(b, pad) {                              // b: Mercator [x0, y0, x1, y1]
      const v = M.view, p = pad || 40, mpp = Math.max((b[2] - b[0]) / Math.max(1, v.w - 2 * p), (b[3] - b[1]) / Math.max(1, v.h - 2 * p));
      setView({ cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2, mpp: Math.max(G.mppOf(MAX_Z), mpp) });
    }

    /* ---- styles by zoom ---- */
    const T = () => THEMES[M.theme];
    const lineW = (z, a, b) => Math.max(a, Math.min(b, a + (z - 5) * (b - a) / 6));        // a width that grows from a at zoom 5 to b at zoom 11
    function text(ctx, s, font) { const k = font + '|' + s; let w = textCache.get(k); if (w === undefined) { ctx.font = font; w = ctx.measureText(s).width; if (textCache.size > 5000) textCache.clear(); textCache.set(k, w); } return w; }

    /* ---- drawing: the base ---- */
    function pathOf(ctx, lines, view, gap) {                  // one path of every visible line; points closer than `gap` pixels to the last are skipped
      const { cx, cy, mpp, w, h } = view, m = 24 * mpp, x0 = cx - w / 2 * mpp - m, x1 = cx + w / 2 * mpp + m, y0 = cy - h / 2 * mpp - m, y1 = cy + h / 2 * mpp + m, g2 = gap * gap; let n = 0;
      ctx.beginPath();
      for (const l of lines) {
        const bb = l.bb; if (bb[2] < x0 || bb[0] > x1 || bb[3] < y0 || bb[1] > y1) continue;
        let lx = 0, ly = 0; const N = l.x.length;
        for (let i = 0; i < N; i++) {
          const px = (l.x[i] - cx) / mpp + w / 2, py = h / 2 - (l.y[i] - cy) / mpp;
          if (i === 0) { ctx.moveTo(px, py); lx = px; ly = py; } else if (i === N - 1 || (px - lx) * (px - lx) + (py - ly) * (py - ly) >= g2) { ctx.lineTo(px, py); lx = px; ly = py; }
        }
        n++;
      }
      return n;
    }
    function fillPolys(ctx, polys, view, gap, only) {
      const { cx, cy, mpp, w, h } = view, m = 40 * mpp, x0 = cx - w / 2 * mpp - m, x1 = cx + w / 2 * mpp + m, y0 = cy - h / 2 * mpp - m, y1 = cy + h / 2 * mpp + m, g2 = gap * gap;
      for (const poly of polys) {
        if (only && !only(poly.c)) continue; const bb = poly.bb; if (bb[2] < x0 || bb[0] > x1 || bb[3] < y0 || bb[1] > y1) continue;
        ctx.beginPath();
        for (const r of poly.rings) {
          let lx = 0, ly = 0; const N = r.x.length;
          for (let i = 0; i < N; i++) {
            const px = (r.x[i] - cx) / mpp + w / 2, py = h / 2 - (r.y[i] - cy) / mpp;
            if (i === 0) { ctx.moveTo(px, py); lx = px; ly = py; } else if (i === N - 1 || (px - lx) * (px - lx) + (py - ly) * (py - ly) >= g2) { ctx.lineTo(px, py); lx = px; ly = py; }
          }
          ctx.closePath();
        }
        ctx.fill('evenodd');
      }
    }
    function drawBase() {
      const v = M.view, z = zoom(), t = T(), c = bctx; c.setTransform(M.dpr, 0, 0, M.dpr, 0, 0);
      c.fillStyle = t.ocean; c.fillRect(0, 0, v.w, v.h);
      c.fillStyle = t.land; fillPolys(c, geo.polys.land, v, 0.7);
      c.fillStyle = t.lake; fillPolys(c, geo.polys.water, v, 0.7, (k) => k === 0 || (k === 1 && z >= 5) || (k === 2 && z >= 6.5));
      c.lineJoin = 'round'; c.lineCap = 'round';
      if (M.layers.county && z >= 5.6) { c.strokeStyle = t.county; c.lineWidth = lineW(z, 0.6, 1.1); for (const k in L.county) { pathOf(c, L.county[k], v, 1.2); c.stroke(); } }
      if (M.layers.river) {
        const lim = [4, 5.6, 7.2, 8.8];
        for (const k in L.river) { if (z < lim[k]) continue; c.strokeStyle = t.river; c.lineWidth = lineW(z, 0.7, 1.6) * (k === '0' ? 1.5 : k === '1' ? 1.2 : 1); pathOf(c, L.river[k], v, 1); c.stroke(); }
        c.strokeStyle = t.lakeEdge; c.lineWidth = 0.8;
        for (const poly of geo.polys.water) { if (!(poly.c === 0 || (poly.c === 1 && z >= 5) || (poly.c === 2 && z >= 6.5))) continue; pathOf(c, poly.rings.map((r) => ({ x: r.x, y: r.y, bb: poly.bb })), v, 1.2); c.stroke(); }
      }
      if (M.layers.road) {
        const lim = [4.8, 6.6, 8.2], w0 = [2.2, 1.7, 1.2];
        for (const k of ['2', '1', '0']) { if (!L.road[k] || z < lim[k]) continue; const wd = lineW(z, 0.8, 1.0) * w0[k] * (z > 9 ? 1.25 : 1);
          c.strokeStyle = t.roadCase; c.lineWidth = wd + 1.6; pathOf(c, L.road[k], v, 1); c.stroke(); c.strokeStyle = t.road[k]; c.lineWidth = wd; c.stroke(); }
      }
      if (M.layers.state) { c.strokeStyle = t.state; c.lineWidth = lineW(z, 1.0, 1.7); for (const k in L.state) { pathOf(c, L.state[k], v, 1); c.stroke(); } }
      c.strokeStyle = t.outline; c.lineWidth = lineW(z, 1.0, 1.6); for (const k in L.outline) { pathOf(c, L.outline[k], v, 1); c.stroke(); }
    }

    /* ---- drawing: the top (names, sites, then what the app adds) ---- */
    const PL_FONT = ['700 15px ', '700 14px ', '600 13px ', '600 12.5px ', '600 12px ', '500 11px '], PL_Z = [3.4, 5, 6.1, 7.1, 8.1, 9.3];
    function drawTop() {
      const v = M.view, z = zoom(), t = T(), c = tctx; c.setTransform(M.dpr, 0, 0, M.dpr, 0, 0); c.clearRect(0, 0, v.w, v.h);
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
      const items = [], pad = 40, P = geo.points.place, S = geo.points.state;
      const pills = M.layers.site && z >= 4.6 ? sitePills(c, v, z) : [], blockers = pills.map((p) => [p.x - 2, p.y - 2, p.x + p.w + 2, p.y + p.h + 2]);
      const stateAlpha = z < 6.6 ? Math.min(1, (6.6 - z) / 1.2) : 0;
      if (stateAlpha > 0 && M.layers.state) {
        for (let i = 0; i < S.n; i++) { const [px, py] = G.toScreen(v, S.mx[i], S.my[i]); if (px > -pad && px < v.w + pad && py > -pad && py < v.h + pad) items.push({ s: i, k: 6, x: px, y: py, w: text(c, S.names[i].toUpperCase(), '700 13px ' + FONT), h: 14, pri: 0 }); }
      }
      if (M.layers.place) {
        for (let i = 0; i < P.n; i++) {
          const k = P.c[i]; if (z < PL_Z[k]) continue;
          const [px, py] = G.toScreen(v, P.mx[i], P.my[i]); if (px < -pad || px > v.w + pad || py < -pad || py > v.h + pad) continue;
          const font = PL_FONT[k] + FONT, tw = text(c, P.names[i], font); items.push({ i, k, x: px, y: py - (k <= 4 ? 8 : 0), px, py, w: tw, h: 14, pri: 10 - k * 2, font });
        }
      }
      for (const it of layoutLabels(items, 3, blockers)) {
        if (it.k === 6) { c.font = '700 13px ' + FONT; c.fillStyle = t.stateLabel; c.globalAlpha = stateAlpha; c.fillText(S.names[it.s].toUpperCase(), it.x, it.y); c.globalAlpha = 1; continue; }
        if (it.k <= 4) { c.fillStyle = t.dot; c.strokeStyle = t.halo; c.lineWidth = 2; c.beginPath(); c.arc(it.px, it.py, 2.4, 0, 6.2832); c.stroke(); c.fill(); }
        c.font = it.font; c.lineWidth = 3.4; c.strokeStyle = t.halo; c.strokeText(P.names[it.i], it.x, it.y); c.fillStyle = it.k <= 4 ? t.label : t.dim; c.fillText(P.names[it.i], it.x, it.y);
      }
      lastHit = [];
      drawSites(c, pills, t);
      for (const h of M.hooks) h(c, v, { theme: t, zoom: z, FONT, text, toScreen: (mx, my) => G.toScreen(v, mx, my) });
    }
    function pillPath(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
    function sitePills(c, v, z) {                              // the pills in view: { id, px, py, x, y, w, h } (the active site's always, the others from zoom 5.3)
      const S = geo.points.site, out = [];
      for (let i = 0; i < S.n; i++) {
        const id = S.names[i], act = id === M.activeSite; if (!act && z < 5.3) continue;
        const [px, py] = G.toScreen(v, S.mx[i], S.my[i]); if (px < -40 || px > v.w + 40 || py < -40 || py > v.h + 40) continue;
        const w = text(c, id, '700 12px ' + FONT) + 18, h = 22; out.push({ id, act, px, py, x: px - w / 2, y: py - h / 2, w, h });
      }
      return out;
    }
    function drawSites(c, pills, t) {
      c.font = '700 12px ' + FONT;
      for (const p of pills.slice().sort((a, b) => a.act - b.act)) {                  // (the active one last, on top)
        const act = p.act, warned = M.warnedSites.has(p.id);
        if (act) { c.fillStyle = t.cone; c.beginPath(); c.arc(p.px, p.py, 7, 0, 6.2832); c.fill(); }
        c.save(); if (act) { c.shadowColor = 'rgba(79,156,255,.55)'; c.shadowBlur = 14; }
        pillPath(c, p.x, p.y, p.w, p.h, 9); c.fillStyle = act ? '#4a90f5' : warned ? '#c9302c' : t.pill; c.fill(); c.restore();
        pillPath(c, p.x, p.y, p.w, p.h, 9); c.strokeStyle = act ? 'rgba(190,220,255,.95)' : t.pillEdge; c.lineWidth = act ? 1.6 : 1; c.stroke();
        c.fillStyle = act || warned ? '#fff' : t.pillText; c.fillText(p.id, p.px, p.py + 0.5); lastHit.push({ id: p.id, x: p.x, y: p.y, w: p.w, h: p.h });
      }
    }
    function hitSite(px, py) { for (let i = lastHit.length - 1; i >= 0; i--) { const s = lastHit[i]; if (px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h) return s.id; } return null; }

    /* ---- one animation frame for everything ---- */
    function frame() {
      raf = 0; if (inertia) stepInertia();
      if (dirty) { dirty = false; drawBase(); for (const h of M.frameHooks || []) h(M.view); drawTop(); }
      if (dirty || inertia) schedule();
    }
    function stepInertia() {
      const s = inertia; s.vx *= 0.93; s.vy *= 0.93;
      if (Math.abs(s.vx) < 0.03 && Math.abs(s.vy) < 0.03) { inertia = null; return; }
      const v = M.view; v.cx -= s.vx * 16 * v.mpp; v.cy += s.vy * 16 * v.mpp; clampView(); dirty = true; emit('view', M.view);
    }
    M.frameHooks = [];

    /* ---- gestures: pointer events on the top canvas ---- */
    const ptr = new Map(); let g = null;
    top.style.touchAction = 'none';
    const rel = (e) => { const r = top.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    top.addEventListener('pointerdown', (e) => {
      top.setPointerCapture(e.pointerId); const [x, y] = rel(e); ptr.set(e.pointerId, { x, y }); inertia = null;
      if (ptr.size === 1) { const cap = M.dragHandler ? M.dragHandler(x, y, e) : null; g = { mode: cap ? 'cap' : 'pan', cap, x0: x, y0: y, t0: performance.now(), moved: false, vx: 0, vy: 0, lx: x, ly: y, lt: performance.now() }; }
      else if (ptr.size === 2) { const [a, b] = [...ptr.values()]; g = { mode: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, moved: true }; }
    });
    top.addEventListener('pointermove', (e) => {
      const [x, y] = rel(e);
      if (!ptr.has(e.pointerId)) { emit('hover', x, y); return; }
      ptr.get(e.pointerId).x = x; ptr.get(e.pointerId).y = y;
      if (!g) return;
      if (g.mode === 'pinch' && ptr.size >= 2) {
        const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        panBy(mx - g.mx, my - g.my); if (g.d > 0 && d > 0) zoomAt(mx, my, d / g.d); g.d = d; g.mx = mx; g.my = my;
      } else if (g.mode === 'pan' || g.mode === 'cap') {
        const dx = x - g.lx, dy = y - g.ly, now = performance.now();
        if (!g.moved && Math.hypot(x - g.x0, y - g.y0) > 5) g.moved = true;
        if (g.moved) {
          if (g.mode === 'cap') g.cap.move(x, y, e); else { panBy(dx, dy); const dt = Math.max(1, now - g.lt); g.vx = 0.8 * g.vx + 0.2 * dx / dt; g.vy = 0.8 * g.vy + 0.2 * dy / dt; }
        }
        g.lx = x; g.ly = y; g.lt = now;
      }
    });
    const up = (e) => {
      const [x, y] = rel(e); ptr.delete(e.pointerId); if (!g) return;
      if (g.mode === 'pinch') { if (ptr.size < 2) g = null; return; }
      const gg = g; g = null;
      if (gg.mode === 'cap') { gg.cap.end && gg.cap.end(x, y, e, gg.moved); return; }
      if (!gg.moved && performance.now() - gg.t0 < 500) emit('tap', x, y, e);
      else if (Math.hypot(gg.vx, gg.vy) > 0.06 && performance.now() - gg.lt < 80) { inertia = { vx: gg.vx, vy: gg.vy }; schedule(); }
    };
    top.addEventListener('pointerup', up); top.addEventListener('pointercancel', up);
    top.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = rel(e); zoomAt(x, y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016))); }, { passive: false });
    top.addEventListener('dblclick', (e) => { if (M.noDoubleZoom) return; const [x, y] = rel(e); zoomAt(x, y, 2); });

    Object.assign(M, { on, setView, resize, zoomAt, panBy, fitBounds, zoom, hitSite, redraw() { dirty = true; schedule(); }, setTheme(n) { M.theme = n; dirty = true; schedule(); }, drawNow() { dirty = false; drawBase(); for (const h of M.frameHooks) h(M.view); drawTop(); } });
    M.addHook = (f) => M.hooks.push(f); M.addFrameHook = (f) => M.frameHooks.push(f);
    return M;
  }

  globalThis.HFSevereMap = { create, layoutLabels, THEMES, MIN_Z, MAX_Z, FONT };
})();
