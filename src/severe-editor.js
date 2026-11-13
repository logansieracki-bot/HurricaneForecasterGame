/* Severe: the editor, the Draw mode of the page (docs/severe-plan.md 6.2 and 8): a map with the radar page's look on which a day is drawn in the manner of a surface analysis chart (lows and highs, the four kinds of
 * front, a dryline, troughs, outflow boundaries, a moist tongue, the jets and an upper low, each with an arrow for where it goes), with the isobars, the winds and the maps of the indices (src/severe-analysis.js) redrawn
 * as it is changed, a skew-T and a hodograph for any spot, the warnings of a drawing that contradicts itself (src/severe-guide.js), seven ready-made days (src/severe-days.js) and undo and redo.
 *
 * Positions of a drawing are km east and north of its centre (a point of the map: the azimuthal equidistant plane about it, G.local), so a front is as long as it is drawn. Objects can be changed at hour 0 only; at another hour
 * of the slider the day is shown moved along the arrows. The page's radar code is in src/severe-app.js; this file needs its `window.SEVERE` (the map data, the units, the theme).
 * A classic script; it does nothing if the page does not have the scripts it needs.
 */
(function () {
  'use strict';
  const G = globalThis.HFSevereGeo, MAP = globalThis.HFSevereMap, DR = globalThis.HFSevereDraw, AN = globalThis.HFSevereAnalysis, SND = globalThis.HFSevereSounding, DAYS = globalThis.HFSevereDays, GD = globalThis.HFSevereGuide, PT = globalThis.HFSevereEditorPaint;
  if (!(G && MAP && DR && AN && SND && DAYS && GD && PT && document.getElementById('editor'))) return;
  const $ = (id) => document.getElementById(id), DEG = Math.PI / 180, KMH = 3.6, LS = 'hf-severe-draft', STAMP = 'HYPOTHETICAL from Isobar Severe Simulator';
  const ESC = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  /* ---- the tools ---- */
  const ICON = {
    select: '<path d="M6.500 3.500l12 6.500-5.200 1.600L10 17.500z"/>',
    low: '<circle cx="12" cy="12" r="8.500"/><text x="12" y="16">L</text>', high: '<circle cx="12" cy="12" r="8.500"/><text x="12" y="16">H</text>',
    cold: '<path d="M3 17.500h18"/><path class="fl" d="M5.500 17.500l2.600-5.200 2.600 5.200zM13.300 17.500l2.600-5.200 2.600 5.200z"/>',
    warm: '<path d="M3 17.500h18"/><path class="fl" d="M5.400 17.500a2.700 2.700 0 0 1 5.400 0zM13.200 17.500a2.700 2.700 0 0 1 5.400 0z"/>',
    stationary: '<path d="M3 17.500h18"/><path class="fl" d="M5 17.500l2.500-5 2.500 5z"/><path class="fl" d="M13.600 17.500a2.600 2.600 0 0 0 5.200 0z"/>',
    occluded: '<path d="M3 17.500h18"/><path class="fl" d="M4.600 17.500l2.400-4.800 2.400 4.800zM13.400 17.500a2.400 2.400 0 0 1 4.800 0z"/>',
    dryline: '<path d="M3 17.500h18"/><path class="fl" d="M4.800 17.500a2.200 2.200 0 0 1 4.400 0zM9.700 17.500a2.200 2.200 0 0 1 4.400 0zM14.600 17.500a2.200 2.200 0 0 1 4.400 0z"/>',
    trough: '<path d="M3 15.500h18" stroke-dasharray="4 3"/>',
    outflow: '<path d="M3 16h18" stroke-dasharray="1.500 3"/><path d="M6.500 16v-3.600M11.500 16v-3.600M16.500 16v-3.600"/>',
    moisture: '<path d="M12 3.500c3.200 4 5.500 6.600 5.500 9.800a5.500 5.500 0 0 1-11 0c0-3.200 2.300-5.800 5.500-9.800z"/>',
    jet: '<path d="M3 12h15.500M13 6.500l5.500 5.500-5.500 5.500"/>',
    llj: '<path d="M3.500 17c5 0 7-5 12.500-5"/><path d="M12.500 8l4 4-4 4"/><path d="M3.500 20.500h17" stroke-dasharray="2 3"/>',
    utrough: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 2.600"/><path d="M12 8.200a3.800 3.800 0 1 0 3.800 3.800"/><path class="fl" d="M17.800 11.400l-2.300 2.800-2.300-2.800z"/>',
    probe: '<circle cx="12" cy="12" r="5.200"/><path d="M12 2.500v5M12 16.500v5M2.500 12h5M16.500 12h5"/>',
  };
  const TOOLS = [
    { id: 'select', key: 'v', name: 'Select and move', hint: 'Tap an object to select it, drag it or one of its points; drag the map to pan it' },
    'gap',
    { id: 'low', key: 'l', type: 'low', name: 'Low pressure', c: '#ff6a5c', hint: 'Tap the map to place a low', point: true },
    { id: 'high', key: 'h', type: 'high', name: 'High pressure', c: '#5aaeff', hint: 'Tap the map to place a high', point: true },
    'gap',
    { id: 'cold', key: 'c', type: 'front', kind: 'cold', name: 'Cold front', c: '#55a8ff', hint: 'Sketch the front with a finger or a drag, or tap its points and press Enter' },
    { id: 'warm', key: 'w', type: 'front', kind: 'warm', name: 'Warm front', c: '#ff6256', hint: 'Sketch the front with a finger or a drag, or tap its points and press Enter' },
    { id: 'stationary', key: 's', type: 'front', kind: 'stationary', name: 'Stationary front', c: '#8e8ef0', hint: 'Sketch the front with a finger or a drag, or tap its points and press Enter' },
    { id: 'occluded', key: 'o', type: 'front', kind: 'occluded', name: 'Occluded front', c: '#b98aff', hint: 'Sketch the front with a finger or a drag, or tap its points and press Enter' },
    { id: 'dryline', key: 'd', type: 'dryline', name: 'Dryline', c: '#f3a73f', hint: 'Sketch the dryline; the dry air is on the side the scallops are not' },
    { id: 'trough', key: 'r', type: 'trough', name: 'Surface trough', c: '#d9a56a', hint: 'Sketch the axis of the trough' },
    { id: 'outflow', key: 'f', type: 'outflow', name: 'Outflow boundary', c: '#8fd0ff', hint: 'Sketch the gust front of an old storm' },
    'gap',
    { id: 'moisture', key: 'm', type: 'moisture', name: 'Moist tongue', c: '#52d894', hint: 'Sketch the axis of the moist air' },
    { id: 'jet', key: 'j', type: 'jet', name: 'Jet stream', c: '#c99cff', hint: 'Sketch the jet in the way the wind blows' },
    { id: 'llj', key: 'k', type: 'llj', name: 'Low-level jet', c: '#ffa24f', hint: 'Sketch the low-level jet in the way the wind blows' },
    { id: 'utrough', key: 'u', type: 'utrough', name: 'Upper low', c: '#ff7fbd', hint: 'Tap the map to place a circulation aloft', point: true },
    'gap',
    { id: 'probe', key: 'p', name: 'Sounding at a spot', hint: 'Tap a spot for its skew-T, its hodograph and what storms to expect' },
  ];
  const toolById = (id) => TOOLS.find((t) => t.id === id);

  /* ---- what each kind of object lets you change: [key, label, unit kind, min, max, step, the default] ---- */
  const PROPS = {
    low: [['depth', 'Depth', 'hPa', 2, 40, 0.5, 15], ['size', 'Size', 'dist', 150, 800, 10, 400], ['deepen', 'Deepening', 'hPa/h', -3, 3, 0.1, 0]],
    high: [['rise', 'Strength', 'hPa', 2, 25, 0.5, 10], ['size', 'Size', 'dist', 200, 1000, 10, 600]],
    front: [['contrast', 'Temperature contrast', 'K', 2, 25, 0.5, null], ['width', 'Width', 'dist', 10, 150, 5, null]],
    dryline: [['contrast', 'Dew point contrast', 'K', 3, 25, 0.5, 12], ['width', 'Width', 'dist', 5, 60, 1, 20]],
    trough: [['depth', 'Depth', 'hPa', 1, 12, 0.5, 4], ['width', 'Width', 'dist', 40, 300, 10, 120]],
    outflow: [['contrast', 'Temperature contrast', 'K', 1, 10, 0.5, 4], ['width', 'Width', 'dist', 5, 40, 1, 10]],
    moisture: [['amount', 'Dew point rise', 'K', -6, 10, 0.5, 3], ['width', 'Width', 'dist', 80, 500, 10, 200]],
    jet: [['speed', 'Speed', 'speed', 5, 60, 1, 25], ['width', 'Width', 'dist', 100, 500, 10, 250]],
    llj: [['speed', 'Speed', 'speed', 5, 40, 1, 18], ['width', 'Width', 'dist', 60, 300, 10, 150]],
    utrough: [['speed', 'Strength', 'speed', 5, 50, 1, 25], ['size', 'Size', 'dist', 200, 900, 10, 500]],
  };
  const FRONT_DEF = { cold: { contrast: 12, width: 40 }, warm: { contrast: 10, width: 60 }, stationary: { contrast: 8, width: 50 }, occluded: { contrast: 8, width: 50 } };
  const NAME = { low: 'Low pressure', high: 'High pressure', trough: 'Surface trough', dryline: 'Dryline', outflow: 'Outflow boundary', moisture: 'Moist tongue', jet: 'Jet stream', llj: 'Low-level jet', utrough: 'Upper low',
    cold: 'Cold front', warm: 'Warm front', stationary: 'Stationary front', occluded: 'Occluded front' };
  const nameOf = (o) => (o.type === 'front' ? NAME[o.kind || 'cold'] : NAME[o.type]);
  const COLOR = (o) => { const t = toolById(o.type === 'front' ? (o.kind || 'cold') : o.type); return (t && t.c) || '#72d6ff'; };

  /* ---- state ---- */
  const E = { fold: { day: window.innerWidth < 820, props: false }, ready: false, day: null, drawing: null, hist: null, A: null, ver: 0, sel: -1, tool: 'select', t: 0, layer: 'off', show: { iso: true, barb: true, arrow: true }, build: null, sketch: null, spot: null, probe: null, hover: null,
    warns: [], playing: false, drag: null, activePoint: -1, fields: null, fieldBusy: false };
  let SEV = null, geo = null, map = null, fctx = null, panel = {}, dirtyField = 0, fieldTimer = 0, raf = 0, last = 0;

  const units = () => (SEV && SEV.UNITS[SEV.S.units]) || { speed: 'mph', k: 2.2369362920544, dist: 'mi', m: 1609.344 };
  const tempF = () => (SEV ? SEV.S.units === 'imperial' : true);
  const fmtTemp = (c) => (tempF() ? Math.round(c * 1.8 + 32) + '°F' : Math.round(c) + '°C');
  const fmtSpeed = (ms) => Math.round(ms * units().k) + ' ' + units().speed;
  const fmtDist = (km) => Math.round(km * 1000 / units().m) + ' ' + units().dist;
  const timeText = (t) => { const m = Math.round(720 + t * 60), h24 = Math.floor(m / 60) % 24, mm = m % 60; return ((h24 + 11) % 12 + 1) + ':' + String(mm).padStart(2, '0') + ' ' + (h24 < 12 ? 'AM' : 'PM'); };
  const toast = (m, ms) => { if (SEV && SEV.toast) SEV.toast(m, ms); };

  /* ---- the projection: km of the drawing's plane <-> the screen ---- */
  const lat0 = () => E.day.lat, lon0 = () => E.day.lon;
  function toScreen(view, x, y) { const ll = G.fromLocal(lat0(), lon0(), x * 1000, y * 1000); return G.toScreen(view, G.mercX(ll.lon), G.mercY(ll.lat)); }
  function toKm(view, px, py) { const m = G.fromScreen(view, px, py), ll = G.fromMerc(m[0], m[1]), p = G.local(lat0(), lon0(), ll.lat, ll.lon); return [p.x / 1000, p.y / 1000]; }
  const kmPerPx = (view, px, py) => { const a = toKm(view, px, py), b = toKm(view, px + 10, py); return Math.hypot(b[0] - a[0], b[1] - a[1]) / 10; };
  const hourMoved = (o) => DR.moved(o, E.t);

  /* ---- the drawing: building the analysis, the history, the draft ---- */
  const snap = () => JSON.stringify(E.drawing);
  function rebuild() {
    try { E.A = AN.create(E.drawing); } catch (e) { toast('This drawing cannot be built: ' + e.message, 6000); return false; }
    E.ver++; E.pgrid = null; E.barbs = null; E.fields = null; E.warns = GD.warnings(E.drawing); dirtyField = performance.now(); redraw(); syncWarn(); scheduleField(); return true;
  }
  function commit() { E.hist.push(snap()); syncUndo(); saveDraft(); }
  function restore(json) { E.drawing = JSON.parse(json); if (E.sel >= E.drawing.objects.length) E.sel = -1; E.build = null; rebuild(); syncAll(); saveDraft(); }
  function undo() { if (E.hist.canUndo()) restore(E.hist.undo()); }
  function redo() { if (E.hist.canRedo()) restore(E.hist.redo()); }
  function saveDraft() { try { localStorage.setItem(LS, JSON.stringify({ v: 1, day: { id: E.day.id, name: E.day.name, place: E.day.place, lat: E.day.lat, lon: E.day.lon, story: E.day.story, spot: E.day.spot }, drawing: E.drawing })); } catch (e) { /* none */ } }
  function loadDay(day, quiet) {
    E.day = JSON.parse(JSON.stringify(day)); E.drawing = E.day.drawing; E.drawing.lat = E.day.lat; delete E.day.drawing; E.sel = -1; E.build = null; E.t = 0; E.probe = null; E.spot = { x: E.day.spot.x, y: E.day.spot.y }; E.spotT = E.day.spot.t;
    E.hist = DR.History(snap()); closeSheet(); setTool('select', true);
    if (!rebuild()) return false;
    if (map) { const c = G.fromLocal(E.day.lat, E.day.lon, 0, 0), w = map.view.w || 1200, frac = w < 820 ? 0.96 : 0.62, mpp = 1500e3 / (frac * w) / Math.cos(E.day.lat * DEG); map.setView({ cx: G.mercX(c.lon), cy: G.mercY(c.lat), mpp }); }
    syncAll(); saveDraft(); if (!quiet) toast(E.day.name + ': ' + (E.day.place || ''), 2200); return true;
  }

  /* ---- new objects: where the cold air is, which way it goes, how strong ---- */
  function side(pts, pref) { const n = GD.sideNormal(pts, 'left'); return n && n[0] * pref[0] + n[1] * pref[1] < 0 ? 'right' : 'left'; }
  function arrowToward(pts, sd, speed) { const n = GD.sideNormal(pts, sd) || [0, 0]; return { u: Math.round(n[0] * speed * 10) / 10, v: Math.round(n[1] * speed * 10) / 10 }; }
  const opp = (s) => (s === 'left' ? 'right' : 'left');
  function newObject(tool, pts) {
    const o = { type: tool.type };
    if (tool.point) {
      o.x = Math.round(pts[0][0]); o.y = Math.round(pts[0][1]);
      if (o.type === 'low') { o.depth = 15; o.size = 400; o.motion = { u: 8, v: 3 }; } else if (o.type === 'high') { o.rise = 10; o.size = 600; o.motion = { u: 4, v: 0 }; } else { o.speed = 25; o.size = 500; o.motion = { u: 10, v: 3 }; }
      return o;
    }
    o.pts = pts.map((p) => [Math.round(p[0]), Math.round(p[1])]);
    if (o.type === 'front') {
      o.kind = tool.kind; const nw = tool.kind === 'cold' || tool.kind === 'occluded' ? [-1, 1] : [0, 1]; o.cold = side(o.pts, nw); o.contrast = FRONT_DEF[o.kind].contrast;
      o.motion = o.kind === 'cold' ? arrowToward(o.pts, opp(o.cold), 10) : o.kind === 'occluded' ? arrowToward(o.pts, opp(o.cold), 6) : o.kind === 'warm' ? arrowToward(o.pts, o.cold, 4) : { u: 0, v: 0 };
    } else if (o.type === 'dryline') { o.dry = side(o.pts, [-1, 0]); o.contrast = 12; o.motion = arrowToward(o.pts, opp(o.dry), 3); }
    else if (o.type === 'outflow') { o.cool = side(o.pts, [0, 1]); o.contrast = 4; o.motion = arrowToward(o.pts, opp(o.cool), 5); }
    else if (o.type === 'trough') { o.depth = 4; o.motion = { u: 8, v: 0 }; }
    else if (o.type === 'moisture') { o.amount = 3; o.motion = { u: 0, v: 0 }; }
    else if (o.type === 'jet') { o.speed = 25; o.motion = { u: 12, v: 0 }; } else if (o.type === 'llj') { o.speed = 18; o.motion = { u: 8, v: 0 }; }
    return o;
  }
  const canEdit = () => E.t === 0;
  function addObject(o) { E.drawing.objects.push(o); E.sel = E.drawing.objects.length - 1; commit(); rebuild(); syncAll(); }

  /* ---- the anchor of an object (where its arrow starts) and the tip of the arrow ---- */
  function anchorOf(o) { if (o.pts) { const a = DR.along(o.pts, 0.5); return [a.x, a.y]; } return [o.x, o.y]; }
  const ARROW_H = 3;
  function tipOf(o) { const a = anchorOf(o), m = o.motion || { u: 0, v: 0 }; return [a[0] + m.u * ARROW_H * KMH, a[1] + m.v * ARROW_H * KMH]; }

  /* ---- the pressure on a lattice of km (cached: the isobars are contoured from it) and the winds of the barbs ---- */
  const DOM = { x0: -1600, x1: 1600, y0: -1300, y1: 1300 };
  function pressureGrid(coarse) {
    const step = coarse ? 40 : 20, key = E.ver + '|' + E.t + '|' + step; if (E.pgrid && E.pgrid.key === key) return E.pgrid;
    const nx = Math.round((DOM.x1 - DOM.x0) / step) + 1, ny = Math.round((DOM.y1 - DOM.y0) / step) + 1, v = new Float32Array(nx * ny); let lo = 1e9, hi = -1e9;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const p = E.A.pressure(DOM.x0 + i * step, DOM.y0 + j * step, E.t); v[j * nx + i] = p; if (p < lo) lo = p; if (p > hi) hi = p; }
    const lines = [];
    for (let lev = Math.ceil(lo / 4) * 4; lev <= hi; lev += 4) {
      const ls = DR.contourLines(v, nx, ny, lev).map((l) => l.map((q) => [DOM.x0 + q[0] * step, DOM.y0 + q[1] * step]));
      if (ls.length) lines.push({ level: lev, lines: ls });
    }
    return (E.pgrid = { key, lines });
  }
  function barbLattice(spacing) {
    const key = E.ver + '|' + E.t + '|' + spacing; if (E.barbs && E.barbs.key === key) return E.barbs;
    const out = [], x0 = Math.ceil(DOM.x0 / spacing) * spacing, y0 = Math.ceil(DOM.y0 / spacing) * spacing;
    for (let y = y0; y <= DOM.y1; y += spacing) for (let x = x0; x <= DOM.x1; x += spacing) { const w = E.A.windAt(x, y, 10, E.t); out.push({ x, y, kt: Math.hypot(w[0], w[1]) * 1.9438, from: (Math.atan2(-w[0], -w[1]) / DEG + 360) % 360 }); }
    return (E.barbs = { key, pts: out });
  }

  /* ---- the maps of the indices: a lattice of the screen, painted into a small canvas and stretched; the picture is kept (moved and scaled) while the view changes, and made again when it rests ---- */
  const fieldCv = document.createElement('canvas');
  function computeField(coarse) {
    if (E.layer === 'off' || !E.A) return; const v = map.view, L = PT.layerById(E.layer), nx = coarse ? 22 : 40, ny = Math.max(8, Math.round(nx * v.h / v.w)), pts = [], quad = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const px = (i + 0.5) * v.w / nx, py = (j + 0.5) * v.h / ny; pts.push(toKm(v, px, py)); }
    const cols = E.A.columns(pts, E.t, { dz: 250 }), vals = cols[L.field]; void quad;
    fieldCv.width = nx; fieldCv.height = ny; const c = fieldCv.getContext('2d'), img = c.createImageData(nx, ny);
    for (let q = 0; q < nx * ny; q++) { const col = PT.fieldColor(L, vals[q]); img.data[4 * q] = col[0]; img.data[4 * q + 1] = col[1]; img.data[4 * q + 2] = col[2]; img.data[4 * q + 3] = Math.round(col[3] * 255); }
    c.putImageData(img, 0, 0); E.fields = { view: { cx: v.cx, cy: v.cy, mpp: v.mpp, w: v.w, h: v.h }, ver: E.ver, t: E.t, layer: E.layer, coarse: !!coarse }; redraw();
  }
  function scheduleField(delay) {
    if (E.layer === 'off') return; clearTimeout(fieldTimer);
    fieldTimer = setTimeout(() => { fieldTimer = 0; if (E.drag) { computeField(true); scheduleField(120); } else computeField(false); }, delay === undefined ? 140 : delay);
  }
  function drawFill(view) {
    const c = fctx; if (!c) return; c.setTransform(map.dpr, 0, 0, map.dpr, 0, 0); c.clearRect(0, 0, view.w, view.h);
    const F = E.fields; if (E.layer === 'off' || !F || F.layer !== E.layer) return;
    const o = F.view, s = o.mpp / view.mpp, ox = (o.cx - view.cx) / view.mpp + view.w / 2 - s * o.w / 2, oy = (view.cy - o.cy) / view.mpp + view.h / 2 - s * o.h / 2;
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(fieldCv, ox, oy, o.w * s, o.h * s);
  }
  const fieldStale = () => { const F = E.fields, v = map && map.view; return E.layer !== 'off' && (!F || F.layer !== E.layer || F.ver !== E.ver || F.t !== E.t || F.view.mpp !== v.mpp || F.view.cx !== v.cx || F.view.cy !== v.cy || F.view.w !== v.w || F.view.h !== v.h); };

  /* ---- painting over the map ---- */
  function paint(c, view, h) {
    if (!E.A) return; const th = SEV.S.theme === 'light' ? 'light' : 'dark', T = PT.OBJ[th], P = (x, y) => toScreen(view, x, y);
    c.save();
    if (E.show.iso) paintIsobars(c, view, T, P);
    if (E.show.barb) paintBarbs(c, view, T);
    E.drawing.objects.forEach((o0, i) => {
      const o = hourMoved(o0), sel = i === E.sel, m = o0.motion || { u: 0, v: 0 }, sp = Math.hypot(m.u, m.v), p = o.pts ? P(o.pts[0][0], o.pts[0][1]) : P(o.x, o.y);
      const kp = (a) => { const q = P(a[0] + 100, a[1]), q0 = P(a[0], a[1]); return Math.hypot(q[0] - q0[0], q[1] - q0[1]) / 100; };
      void p;
      let pressureText = ''; if (o.type === 'low' || o.type === 'high') pressureText = Math.round(E.A.pressure(o.x, o.y, E.t)) + ' hPa';
      PT.drawObject(c, o, { P, th, selected: sel, activePoint: sel ? E.activePoint : -1, speedText: o.speed !== undefined ? fmtSpeed(o.speed) : '', pressureText, kmToPx: kp(anchorOf(o)) });
      if (E.show.arrow && sp > 0.2) { const a = anchorOf(o), t = tipOf(o), A0 = P(a[0], a[1]), A1 = P(t[0], t[1]); PT.drawArrow(c, A0[0], A0[1], A1[0], A1[1], T, fmtSpeed(sp), sel); }
      if (sel && canEdit()) { const t = tipOf(o), q = P(t[0], t[1]); PT.drawHandle(c, q[0], q[1], T, E.activePoint === 'tip'); }
    });
    if (E.build) { const px = E.build.pts.map((p) => P(p[0], p[1])); if (E.hover && E.build.pts.length) px.push(E.hover); c.lineWidth = 2.6; c.strokeStyle = E.build.color; c.setLineDash([7, 5]); c.beginPath(); px.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); c.setLineDash([]); E.build.pts.forEach((p) => { const q = P(p[0], p[1]); PT.drawHandle(c, q[0], q[1], T, false); }); }
    if (E.sketch) { c.lineWidth = 3; c.strokeStyle = E.sketch.color; c.lineJoin = 'round'; c.beginPath(); E.sketch.px.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); }
    if (E.spot) paintSpot(c, view, T, P);
    if (E.probe) paintProbe(c, view, T, P);
    c.restore();
  }
  function paintIsobars(c, view, T, P) {
    const g = pressureGrid(!!E.drag), base = E.drawing.base || 1013;
    c.lineJoin = 'round'; c.textAlign = 'center'; c.textBaseline = 'middle'; const labels = [];
    for (const L of g.lines) {
      const major = L.level % 20 === 0; c.lineWidth = major ? 1.9 : 1.2; c.strokeStyle = T.iso; c.beginPath();
      for (const line of L.lines) {
        const px = line.map((q) => P(q[0], q[1])); let seen = false;
        for (let i = 0; i < px.length; i++) { const p = px[i]; if (p[0] > -40 && p[0] < view.w + 40 && p[1] > -40 && p[1] < view.h + 40) seen = true; }
        if (!seen) continue; px.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
        if (px.length > 6) DR.symbolsAlong(px, 560, 230).forEach((s) => { if (s.x > 30 && s.x < view.w - 30 && s.y > 80 && s.y < view.h - 150) labels.push({ s, text: String(L.level) }); });
      }
      c.stroke();
    }
    c.font = '700 11.5px ' + PT.FONT;
    for (const lb of labels) {
      let a = lb.s.ang; if (a > Math.PI / 2) a -= Math.PI; else if (a < -Math.PI / 2) a += Math.PI;
      c.save(); c.translate(lb.s.x, lb.s.y); c.rotate(a); c.lineWidth = 4; c.strokeStyle = T.halo; c.strokeText(lb.text, 0, 0); c.fillStyle = T.isoText; c.fillText(lb.text, 0, 0); c.restore();
    }
    void base;
  }
  function paintBarbs(c, view, T) {
    const kpp = kmPerPx(view, view.w / 2, view.h / 2), want = kpp * 96, steps = [25, 50, 100, 150, 200, 300, 400, 600], sp = steps.find((s) => s >= want) || 600, B = barbLattice(sp);
    for (const b of B.pts) { const p = toScreen(view, b.x, b.y); if (p[0] < -30 || p[0] > view.w + 30 || p[1] < -30 || p[1] > view.h + 30) continue; PT.drawBarb(c, p[0], p[1], b.kt, b.from, T); }
  }
  function paintSpot(c, view, T, P) {
    const p = P(E.spot.x, E.spot.y); c.save(); c.translate(p[0], p[1]);
    c.beginPath(); c.arc(0, 0, 11, 0, 6.2832); c.fillStyle = T.disc; c.fill(); c.lineWidth = 2.2; c.strokeStyle = '#ffd75e'; c.stroke();
    c.beginPath(); c.moveTo(-5, 3); c.lineTo(0, -5); c.lineTo(5, 3); c.closePath(); c.fillStyle = '#ffd75e'; c.fill();
    c.font = '700 11px ' + PT.FONT; c.textAlign = 'center'; c.textBaseline = 'top'; c.lineWidth = 3.4; c.strokeStyle = T.halo; c.strokeText('Storm here', 0, 15); c.fillStyle = T.isoText; c.fillText('Storm here', 0, 15); c.restore();
  }
  function paintProbe(c, view, T, P) {
    const p = P(E.probe.x, E.probe.y); c.save(); c.translate(p[0], p[1]); c.lineWidth = 3.4; c.strokeStyle = T.halo; c.beginPath(); c.moveTo(-10, 0); c.lineTo(10, 0); c.moveTo(0, -10); c.lineTo(0, 10); c.stroke();
    c.lineWidth = 1.8; c.strokeStyle = T.isoText; c.beginPath(); c.moveTo(-10, 0); c.lineTo(10, 0); c.moveTo(0, -10); c.lineTo(0, 10); c.stroke(); c.restore();
  }
  function redraw() { if (map) map.redraw(); }

  /* ---- gestures: the map hands us a press and takes the drag if we want it ---- */
  function tolKm(x, y) { return kmPerPx(map.view, x, y) * 16; }
  function hit(x, y) {
    const km = toKm(map.view, x, y), tol = tolKm(x, y);
    if (E.sel >= 0 && canEdit()) { const o = hourMoved(E.drawing.objects[E.sel]), t = tipOf(o); if (Math.hypot(t[0] - km[0], t[1] - km[1]) <= tol) return { index: E.sel, part: 'tip' }; }
    return DR.pick(E.drawing.objects, km[0], km[1], tol, E.t);
  }
  function dragHandler(x, y) {
    const tool = toolById(E.tool); if (!tool) return null;
    if (tool.id === 'probe') return null;
    if (tool.id === 'select') {
      const h = hit(x, y); if (!h) return null; E.sel = h.index; E.activePoint = h.part === 'tip' ? 'tip' : h.part.startsWith('pt:') ? +h.part.slice(3) : -1; syncProps(); redraw();
      if (!canEdit()) return { move() {}, end() {} };
      const o = E.drawing.objects[h.index], start = toKm(map.view, x, y), orig = JSON.parse(JSON.stringify(o)); let moved = false;
      return {
        move(px, py) {
          moved = true; const k = toKm(map.view, px, py), dx = k[0] - start[0], dy = k[1] - start[1]; E.drag = { index: h.index };
          if (h.part === 'tip') { const a = anchorOf(orig); o.motion = { u: Math.round((k[0] - a[0]) / (ARROW_H * KMH) * 10) / 10, v: Math.round((k[1] - a[1]) / (ARROW_H * KMH) * 10) / 10 }; }
          else if (o.pts && h.part.startsWith('pt:')) { const i = +h.part.slice(3); o.pts[i] = [orig.pts[i][0] + dx, orig.pts[i][1] + dy]; }
          else if (o.pts) o.pts = orig.pts.map((p) => [p[0] + dx, p[1] + dy]);
          else { o.x = orig.x + dx; o.y = orig.y + dy; }
          rebuildLight();
        },
        end() { E.drag = null; if (moved) { if (o.pts) o.pts = o.pts.map((p) => [Math.round(p[0]), Math.round(p[1])]); if (o.x !== undefined) { o.x = Math.round(o.x); o.y = Math.round(o.y); } commit(); rebuild(); syncProps(); } E.activePoint = -1; redraw(); },
      };
    }
    /* a drawing tool */
    if (!canEdit()) { toast('Go back to +0 h to draw: the slider shows the day moving', 3000); return null; }
    if (tool.point) return { move() {}, end(px, py) { const k = toKm(map.view, px, py); addObject(newObject(tool, [k])); setTool('select', true); } };
    E.sketch = { px: [[x, y]], color: tool.c, moved: false };
    return {
      move(px, py) { const s = E.sketch, l = s.px[s.px.length - 1]; if (Math.hypot(px - l[0], py - l[1]) >= 5) { s.px.push([px, py]); s.moved = true; redraw(); } },
      end(px, py) {
        const s = E.sketch; E.sketch = null;
        if (s.moved && s.px.length >= 3) {
          const simp = DR.simplify(s.px, 6); if (simp.length >= 2) { addObject(newObject(tool, simp.map((p) => toKm(map.view, p[0], p[1])))); setTool('select', true); return; }
        }
        buildTap(tool, px, py);
      },
    };
  }
  function buildTap(tool, x, y) {
    const k = toKm(map.view, x, y);
    if (!E.build) E.build = { tool, color: tool.c, pts: [] };
    const last = E.build.pts[E.build.pts.length - 1], tol = tolKm(x, y) * 0.9;
    if (last && Math.hypot(last[0] - k[0], last[1] - k[1]) <= tol) { finishBuild(); return; }
    E.build.pts.push(k); syncHint(); redraw();
  }
  function finishBuild() {
    const b = E.build; E.build = null; if (!b || b.pts.length < 2) { syncHint(); redraw(); return; }
    addObject(newObject(b.tool, b.pts)); setTool('select', true);
  }
  function cancelBuild() { E.build = null; E.sketch = null; syncHint(); redraw(); }
  let lightTimer = 0;
  function rebuildLight() { if (lightTimer) return; lightTimer = setTimeout(() => { lightTimer = 0; try { E.A = AN.create(E.drawing); E.ver++; E.pgrid = null; E.barbs = null; E.warns = GD.warnings(E.drawing); syncWarn(); syncProps(true); redraw(); scheduleField(60); } catch (e) { /* the drawing is incomplete: keep the last picture */ } }, 16); }

  function onTap(x, y) {
    const tool = toolById(E.tool);
    if (tool && tool.id === 'probe') { openSheet(toKm(map.view, x, y)); return; }
    if (tool && tool.id === 'select') {
      if (E.sel >= 0) { E.sel = -1; E.activePoint = -1; syncProps(); redraw(); return; }
      openSheet(toKm(map.view, x, y));
    }
  }

  /* ---- the sounding at a spot ---- */
  function nearestPlace(lat, lon) {                                                                          // the nearest big place within 200 km, else the nearest smaller one within 80 km
    const P = geo.points.place; let big = -1, bd = Infinity, small = -1, sd = Infinity;
    for (let i = 0; i < P.n; i++) {
      if (Math.abs(P.lat[i] - lat) > 2.6 || Math.abs(P.lon[i] - lon) > 3.4) continue; const k = P.c[i]; if (k > 5) continue;
      const d = G.distBearing(lat, lon, P.lat[i], P.lon[i]).d;
      if (k <= 3 && d <= 200000 && d < bd) { bd = d; big = i; } else if (d <= 80000 && d < sd) { sd = d; small = i; }
    }
    const i = big >= 0 ? big : small; return i < 0 ? null : { name: P.names[i], d: big >= 0 ? bd : sd };
  }
  function openSheet(km) {
    E.probe = { x: km[0], y: km[1] }; const A = E.A, t = E.t;
    let env, ix, s; try { env = A.sounding(km[0], km[1], t, { dz: 100, top: 16000 }); ix = SND.indices(env); s = A.surface(km[0], km[1], t); } catch (e) { toast('No sounding here: ' + e.message, 3000); return; }
    const ll = G.fromLocal(lat0(), lon0(), km[0] * 1000, km[1] * 1000), pl = nearestPlace(ll.lat, ll.lon), ex = GD.expect(ix), th = SEV.S.theme === 'light' ? 'light' : 'dark', T = PT.OBJ[th], U = units();
    E.probe.env = env; E.probe.ix = ix; E.spot = { x: Math.round(km[0]), y: Math.round(km[1]) }; E.spotT = t;
    const kv = (a, b, c, d) => '<span>' + a + '</span><span>' + b + '</span><span>' + c + '</span><span>' + d + '</span>';
    const sh = $('ed-sheet');
    sh.innerHTML = '<div class="hd"><div><b>' + (pl ? 'Near ' + ESC(pl.name) : 'Spot') + ' · ' + ll.lat.toFixed(1) + '°N ' + Math.abs(ll.lon).toFixed(1) + '°W</b><i>+' + t + ' h · ' + timeText(t) + ' · the drawing\'s sounding</i></div><button class="x" aria-label="Close" id="sh-x"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="charts"><canvas id="sh-skew" width="236" height="286" aria-label="Skew-T"></canvas><canvas id="sh-hodo" width="150" height="150" aria-label="Hodograph"></canvas></div>' +
      '<div class="kv">' + kv('Temperature', fmtTemp(s.T), 'Dew point', fmtTemp(s.Td)) + kv('Wind', fmtSpeed(s.speed) + ' from ' + Math.round(s.dir) + '°', 'Pressure', Math.round(s.p) + ' hPa') +
      kv('CAPE', Math.round(ix.mlcape) + ' J/kg', 'CIN', Math.round(ix.mlcin) + ' J/kg') + kv('Cloud base', Math.round(ix.mllcl) + ' m', 'Level of free conv.', isFinite(ix.mllfc) ? Math.round(ix.mllfc) + ' m' : '–') +
      kv('Shear 0-6 km', fmtSpeed(ix.shear06), 'Helicity 0-1 km', Math.round(ix.srh01) + ' m²/s²') + kv('Helicity 0-3 km', Math.round(ix.srh03) + ' m²/s²', 'Tornado param.', ix.stp.toFixed(1)) + '</div>' +
      '<div class="ex"><b>' + ESC(ex.mode) + '</b>' + ex.hazards.map((h) => '<span class="tag">' + ESC(h) + '</span>').join('') + (ex.notes.length ? '<div style="margin-top:6px;color:var(--dim)">' + ex.notes.map(ESC).join('; ') + '.</div>' : '') + '</div>' +
      '<p class="story" style="margin:8px 0 0">This spot is where "Run a storm" starts a storm.</p>';
    sh.hidden = false; PT.drawSkewT($('sh-skew').getContext('2d'), 236, 286, env, ix, T, (v) => (tempF() ? Math.round(v * 1.8 + 32) + '' : v + '')); PT.drawHodograph($('sh-hodo').getContext('2d'), 150, env, ix, T, U.k, U.speed);
    $('sh-x').addEventListener('click', closeSheet);
    syncStart(); redraw();
  }
  function closeSheet() { $('ed-sheet').hidden = true; if (E.probe) { E.probe = null; redraw(); } }

  /* ---- the panels ---- */
  function syncAll() { buildTools(); syncDay(); syncProps(); syncUndo(); syncStart(); syncHint(); syncWarn(); syncTime(); syncLegend(); redraw(); }
  function buildTools() {
    const el = $('ed-tools'); if (el.dataset.built) { el.querySelectorAll('.tl').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === E.tool))); return; }
    el.dataset.built = '1';
    el.innerHTML = TOOLS.map((t) => (t === 'gap' ? '<div class="gap"></div>' : '<button class="tl" data-id="' + t.id + '" style="' + (t.c ? '--c:' + t.c : '') + '" title="' + t.name + (t.key ? ' (' + t.key.toUpperCase() + ')' : '') + '" aria-label="' + t.name + '" aria-pressed="' + (t.id === E.tool) + '"><svg viewBox="0 0 24 24">' + ICON[t.id] + '</svg></button>')).join('');
    el.querySelectorAll('.tl').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.id)));
  }
  function setTool(id, quiet) {
    if (E.tool === id && !quiet && id !== 'select') id = 'select';
    if (E.build && E.tool !== id) cancelBuild(); E.tool = id; E.sketch = null;
    $('ed-tools').querySelectorAll('.tl').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id))); syncHint(); redraw();
  }
  function syncHint() {
    const h = $('ed-hint'), t = toolById(E.tool); let msg = '';
    if (!canEdit() && E.tool !== 'select' && E.tool !== 'probe') msg = 'Go back to +0 h to draw';
    else if (E.build) msg = 'Tap the next point; tap the last point again, or press Enter, to finish · Esc cancels';
    else if (E.tool !== 'select' && t) msg = t.hint;
    h.textContent = msg; h.hidden = !msg;
  }
  function syncWarn() {
    const w = $('ed-warn'); w.innerHTML = E.warns.slice(0, 2).map((x, i) => '<button class="wn ' + x.level + '" data-i="' + x.index + '"><i></i><span>' + ESC(x.text) + '</span></button>').join('');
    w.querySelectorAll('.wn').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.i; if (i >= 0) { E.sel = i; syncProps(); redraw(); } }));
  }
  function syncUndo() { $('ed-undo').disabled = !E.hist.canUndo(); $('ed-redo').disabled = !E.hist.canRedo(); }
  function syncStart() { const b = $('ed-start'); b.disabled = !E.spot; }
  function syncTime() {
    const sl = $('ed-slider'); sl.value = E.t; sl.style.setProperty('--p', (E.t / 12 * 100) + '%'); $('ed-clk').textContent = '+' + (E.t % 1 === 0 ? E.t : E.t.toFixed(2).replace(/0$/, '')) + ' h'; $('ed-clk-sub').textContent = timeText(E.t) + ' local';
    $('ed-ic-play').hidden = E.playing; $('ed-ic-pause').hidden = !E.playing; $('ed-play').setAttribute('aria-label', E.playing ? 'Pause' : 'Play');
  }
  function setTime(t) { E.t = clamp(Math.round(t * 100) / 100, 0, 12); E.pgrid = null; E.barbs = null; syncTime(); syncHint(); if (E.layer !== 'off') scheduleField(60); redraw(); }
  function buildTicks() { $('ed-ticks').innerHTML = Array.from({ length: 13 }, (_, h) => '<span class="' + (h % 3 === 0 ? 'h' : '') + '" style="left:' + (h / 12 * 100) + '%"></span>').join(''); }

  /* the legend of the map in view */
  function syncLegend() {
    const lg = $('ed-legend'); if (E.layer === 'off') { lg.hidden = true; return; } lg.hidden = false;
    const L = PT.layerById(E.layer), cv = lg.querySelector('canvas'), th = SEV.S.theme === 'light' ? 'light' : 'dark', T = PT.OBJ[th], U = units(); let vals = [], unit = '';
    const nice = (lo, hi, n) => { const raw = (hi - lo) / n, p = Math.pow(10, Math.floor(Math.log10(raw))), s = [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= raw) || p * 10, o = []; for (let v = Math.ceil(lo / s) * s; v <= hi + 1e-9; v += s) o.push(v); return o; };
    if (L.kind === 'temp') { unit = tempF() ? '°F' : '°C'; const lo = tempF() ? L.range[0] * 1.8 + 32 : L.range[0], hi = tempF() ? L.range[1] * 1.8 + 32 : L.range[1]; vals = nice(lo, hi, 6).map((d) => ({ v: tempF() ? (d - 32) / 1.8 : d, text: String(Math.round(d)) })); }
    else if (L.kind === 'speed') { unit = U.speed; vals = nice(L.range[0] * U.k, L.range[1] * U.k, 6).map((d) => ({ v: d / U.k, text: String(Math.round(d)) })); }
    else { unit = L.kind === 'cape' ? 'J/kg' : L.kind === 'srh' ? 'm²/s²' : ''; vals = nice(L.range[0], L.range[1], 6).map((d) => ({ v: d, text: String(Math.round(d * 10) / 10) })); }
    $('ed-legend').dataset.name = L.name; PT.drawLegend(cv.getContext('2d'), cv.width, cv.height, L, { values: vals, unit: L.name + (unit ? ' (' + unit + ')' : '') }, T);
  }

  /* the day card */
  function warmSpec() { return Object.assign({}, SND.presets.tornado, E.drawing.air && E.drawing.air.warm); }
  function syncDay() {
    const d = $('ed-day'), w = warmSpec(), pB = (E.drawing.base || 1013), pi = Math.pow(pB / 1000, 0.2857), t0 = w.theta0 * pi - 273.15, qs = (tc) => SND.qvsAt(tc + 273.15, pB * 100), td0 = tdOfQv(w.qv0, pB);
    const sp = E.drawing.aloft || { speed: 30, from: 255 }, U = units(), L = PT.LAYERS;
    d.classList.toggle('fold', !!E.fold.day);
    d.innerHTML = '<h3 class="fh" data-f="day"><span>The day · ' + ESC(E.day.name) + '</span><i></i></h3><div class="body"><select class="sel2" id="d-pick" aria-label="Pick a day">' + DAYS.list.map((x) => '<option value="' + x.id + '"' + (E.day.id === x.id ? ' selected' : '') + '>' + ESC(x.name) + '</option>').join('') + '<option value="blank"' + (E.day.id === 'blank' ? ' selected' : '') + '>A blank day</option>' + (E.day.id === 'file' ? '<option value="file" selected>' + ESC(E.day.name) + '</option>' : '') + '</select>' +
      '<p class="story">' + ESC(E.day.story || '') + '</p>' +
      '<h3>Maps</h3><div class="mini" id="d-layers"><button data-l="off" aria-pressed="' + (E.layer === 'off') + '">Off</button>' + L.map((l) => '<button data-l="' + l.id + '" aria-pressed="' + (E.layer === l.id) + '">' + ({ T: 'Temp', Td: 'Dew pt', mlcape: 'CAPE', shear06: 'Shear', srh01: 'Helicity', stp: 'Tornado' }[l.id]) + '</button>').join('') + '</div>' +
      '<div class="mini" id="d-show"><button data-s="iso" aria-pressed="' + E.show.iso + '">Isobars</button><button data-s="barb" aria-pressed="' + E.show.barb + '">Winds</button><button data-s="arrow" aria-pressed="' + E.show.arrow + '">Arrows</button></div>' +
      '<details class="dd"' + (E.dayOpen ? ' open' : '') + '><summary>The air of the day</summary>' +
      slider('d-aloft', 'Flow aloft', sp.speed * U.k, 5 * U.k, 60 * U.k, 1, Math.round(sp.speed * U.k) + ' ' + U.speed) + slider('d-from', 'Flow aloft from', sp.from, 180, 330, 1, Math.round(sp.from) + '°') +
      slider('d-t0', 'Warm air, temperature', tempF() ? t0 * 1.8 + 32 : t0, tempF() ? 70 : 20, tempF() ? 98 : 36, 0.5, fmtTemp(t0)) + slider('d-td0', 'Warm air, dew point', tempF() ? td0 * 1.8 + 32 : td0, tempF() ? 50 : 10, tempF() ? 80 : 27, 0.5, fmtTemp(td0)) + slider('d-cap', 'Cap', w.cap, 0, 8, 0.25, w.cap.toFixed(1) + ' K') + '</details>' +
      '<div class="row2"><button id="d-save">Save</button><button id="d-load">Load</button><button id="d-reset">Reset</button></div><input type="file" id="d-file" accept="application/json,.json" hidden></div>';
    d.querySelector('.fh').addEventListener('click', () => { E.fold.day = !E.fold.day; d.classList.toggle('fold', E.fold.day); });
    d.querySelector('details').addEventListener('toggle', (e) => { E.dayOpen = e.target.open; });
    $('d-pick').addEventListener('change', (e) => { const id = e.target.value; loadDay(id === 'blank' ? DAYS.blank(E.day.lat, E.day.lon) : DAYS.get(id)); });
    d.querySelectorAll('#d-layers button').forEach((b) => b.addEventListener('click', () => setLayer(b.dataset.l)));
    d.querySelectorAll('#d-show button').forEach((b) => b.addEventListener('click', () => { E.show[b.dataset.s] = !E.show[b.dataset.s]; b.setAttribute('aria-pressed', String(E.show[b.dataset.s])); redraw(); }));
    wireSlider('d-aloft', (v) => { E.drawing.aloft = Object.assign({ speed: 30, from: 255 }, E.drawing.aloft, { speed: v / U.k }); }, (v) => Math.round(v) + ' ' + U.speed);
    wireSlider('d-from', (v) => { E.drawing.aloft = Object.assign({ speed: 30, from: 255 }, E.drawing.aloft, { from: v }); }, (v) => Math.round(v) + '°');
    wireSlider('d-t0', (v) => { const c = tempF() ? (v - 32) / 1.8 : v, th0 = (c + 273.15) / pi; setWarm({ theta0: Math.round(th0 * 100) / 100 }); }, (v) => Math.round(v) + (tempF() ? '°F' : '°C'));
    wireSlider('d-td0', (v) => { const c = tempF() ? (v - 32) / 1.8 : v; setWarm({ qv0: Math.round(qvOfTd(c, pB) * 100) / 100 }); }, (v) => Math.round(v) + (tempF() ? '°F' : '°C'));
    wireSlider('d-cap', (v) => setWarm({ cap: v }), (v) => v.toFixed(1) + ' K');
    $('d-save').addEventListener('click', saveFile); $('d-load').addEventListener('click', () => $('d-file').click()); $('d-file').addEventListener('change', loadFile);
    $('d-reset').addEventListener('click', () => { const base = E.day.id !== 'file' && E.day.id !== 'blank' ? DAYS.get(E.day.id) : DAYS.blank(E.day.lat, E.day.lon); if (base) loadDay(base); });
    void qs;
  }
  function setWarm(o) { E.drawing.air = E.drawing.air || {}; E.drawing.air.warm = Object.assign({}, E.drawing.air.warm, o); }
  const tdOfQv = (qvGkg, pHpa) => AN.dewpointC(qvGkg / 1000, pHpa * 100), qvOfTd = (tc, pHpa) => SND.qvsAt(tc + 273.15, pHpa * 100) * 1000;
  function slider(id, label, v, lo, hi, step, text) { return '<div class="lbl"><span>' + label + '</span><b id="' + id + '-v">' + text + '</b></div><input class="rng" type="range" id="' + id + '" min="' + lo + '" max="' + hi + '" step="' + step + '" value="' + clamp(v, lo, hi) + '" style="--p:' + ((clamp(v, lo, hi) - lo) / (hi - lo) * 100) + '%">'; }
  function wireSlider(id, apply, text) {
    const el = $(id); if (!el) return; const lab = $(id + '-v');
    el.addEventListener('input', () => { if (!canEdit()) { el.value = el.defaultValue; return; } const v = +el.value; el.style.setProperty('--p', ((v - el.min) / (el.max - el.min) * 100) + '%'); lab.textContent = text(v); apply(v); rebuildLight(); E.dirty = true; });
    el.addEventListener('change', () => { if (!E.dirty) return; E.dirty = false; commit(); rebuild(); });
  }
  function setLayer(id) { E.layer = id; E.fields = null; document.querySelectorAll('#d-layers button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.l === id))); syncLegend(); if (id !== 'off') scheduleField(0); redraw(); }

  /* the card of the selected object */
  function syncProps(live) {
    const el = $('ed-props'), o = E.drawing.objects[E.sel]; if (!o) { el.hidden = true; el.innerHTML = ''; return; }
    if (live && !el.hidden && el.dataset.i === String(E.sel)) { refreshMotion(o); return; }
    el.hidden = false; el.dataset.i = String(E.sel); const spec = PROPS[o.type] || [], U = units(), m = o.motion || { u: 0, v: 0 }, sp = Math.hypot(m.u, m.v), hd = DR.heading(m.u, m.v), disabled = canEdit() ? '' : ' disabled';
    const fdef = o.type === 'front' ? FRONT_DEF[o.kind || 'cold'] : {};
    const rows = spec.map(([k, label, kind, lo, hi, step, def]) => {
      const raw = o[k] !== undefined ? o[k] : (def !== null ? def : fdef[k]); let v = raw, a = lo, b = hi, st = step, text;
      if (kind === 'speed') { v = raw * U.k; a = lo * U.k; b = hi * U.k; st = 1; text = Math.round(v) + ' ' + U.speed; } else if (kind === 'dist') { const f = 1000 / U.m; v = raw * f; a = lo * f; b = hi * f; st = Math.max(1, Math.round(step * f)); text = Math.round(v) + ' ' + U.dist; } else text = (Math.abs(raw) < 10 && step < 1 ? (+raw).toFixed(1) : Math.round(raw)) + ' ' + kind;
      return slider('p-' + k, label, v, a, b, st, text);
    }).join('');
    const kindSel = o.type === 'front' ? '<div class="mini sp" id="p-kind">' + ['cold', 'warm', 'stationary', 'occluded'].map((k) => '<button data-k="' + k + '" aria-pressed="' + ((o.kind || 'cold') === k) + '"' + disabled + '>' + k[0].toUpperCase() + k.slice(1) + '</button>').join('') + '</div>' : '';
    const flip = o.type === 'front' || o.type === 'dryline' || o.type === 'outflow' ? '<button id="p-flip"' + disabled + '>Flip sides</button>' : '';
    el.classList.toggle('fold', !!E.fold.props);
    el.innerHTML = '<div class="ptitle2 fh" data-f="props" style="--c:' + COLOR(o) + '"><span class="dot"></span><b>' + ESC(nameOf(o)) + '</b><i></i></div><div class="body">' + kindSel + rows +
      slider('p-speed', 'Moves at', sp * U.k, 0, 30 * U.k, 1, Math.round(sp * U.k) + ' ' + U.speed) + slider('p-head', 'Heading', hd, 0, 359, 1, Math.round(hd) + '° (' + compass(hd) + ')') +
      '<div class="row2">' + flip + '<button id="p-dup"' + disabled + '>Duplicate</button><button id="p-del" class="danger"' + disabled + '>Delete</button></div></div>';
    el.querySelector('.fh').addEventListener('click', () => { E.fold.props = !E.fold.props; el.classList.toggle('fold', E.fold.props); });
    if (!canEdit()) el.querySelectorAll('input').forEach((i) => { i.disabled = true; });
    el.querySelectorAll('#p-kind button').forEach((b) => b.addEventListener('click', () => { o.kind = b.dataset.k; const F = FRONT_DEF[o.kind]; if (o.contrast === undefined || [8, 10, 12].includes(o.contrast)) o.contrast = F.contrast; commit(); rebuild(); syncProps(); }));
    spec.forEach(([k, , kind, lo, hi, step, def]) => wireSlider('p-' + k, (v) => { o[k] = kind === 'speed' ? v / U.k : kind === 'dist' ? v * U.m / 1000 : v; }, (v) => (kind === 'speed' ? Math.round(v) + ' ' + U.speed : kind === 'dist' ? Math.round(v) + ' ' + U.dist : (Math.abs(v) < 10 && step < 1 ? v.toFixed(1) : Math.round(v)) + ' ' + kind)));
    const setMotion = () => { const s = +$('p-speed').value / U.k, h = +$('p-head').value, v = DR.velocity(s, h); o.motion = { u: Math.round(v.u * 10) / 10, v: Math.round(v.v * 10) / 10 }; };
    wireSlider('p-speed', () => setMotion(), (v) => Math.round(v) + ' ' + U.speed); wireSlider('p-head', () => setMotion(), (v) => Math.round(v) + '° (' + compass(v) + ')');
    const f = $('p-flip'); if (f) f.addEventListener('click', () => { const key = o.type === 'dryline' ? 'dry' : o.type === 'outflow' ? 'cool' : 'cold', cur = o[key] || 'left'; o[key] = opp(cur); if (o.motion && o.type !== 'dryline' && o.type !== 'outflow') { o.motion = { u: o.motion.u, v: o.motion.v }; } commit(); rebuild(); syncProps(); });
    const dup = $('p-dup'); if (dup) dup.addEventListener('click', () => { const c = JSON.parse(JSON.stringify(o)); if (c.pts) c.pts = c.pts.map((p) => [p[0] + 80, p[1] - 60]); else { c.x += 80; c.y -= 60; } E.drawing.objects.push(c); E.sel = E.drawing.objects.length - 1; commit(); rebuild(); syncProps(); });
    const del = $('p-del'); if (del) del.addEventListener('click', deleteSelected);
  }
  function refreshMotion() { /* the sliders are what the user is moving: nothing to redraw in the card */ }
  const compass = (d) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8];
  function deleteSelected() { if (E.sel < 0 || !canEdit()) return; E.drawing.objects.splice(E.sel, 1); E.sel = -1; commit(); rebuild(); syncProps(); redraw(); }

  /* save and load: a file that says what it is */
  function saveFile() {
    const doc = { stamp: STAMP, app: 'Isobar Severe', version: 1, day: { name: E.day.name, place: E.day.place, lat: E.day.lat, lon: E.day.lon, story: E.day.story, spot: E.day.spot }, drawing: E.drawing };
    const blob = new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'isobar-severe-day.json'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('Saved. The file says: ' + STAMP, 3200);
  }
  function loadFile(e) {
    const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader();
    r.onload = () => {
      try {
        const doc = JSON.parse(r.result); if (!doc || !doc.drawing || !Array.isArray(doc.drawing.objects)) throw new Error('this is not a drawn day');
        const d = doc.day || {}, day = { id: 'file', name: d.name || 'A day from a file', place: d.place || '', lat: Number.isFinite(d.lat) ? d.lat : 36, lon: Number.isFinite(d.lon) ? d.lon : -98, story: d.story || '', spot: d.spot && Number.isFinite(d.spot.x) ? d.spot : { x: 0, y: 0, t: 3 }, drawing: doc.drawing };
        AN.create(Object.assign({}, doc.drawing, { lat: day.lat })); loadDay(day);
      } catch (err) { toast('Could not load that file: ' + err.message, 5000); }
      e.target.value = '';
    };
    r.readAsText(f);
  }

  /* ---- the Lab: a storm in the drawing's environment at the spot, run in a Worker, played by the radar ---- */
  const LAB = { worker: null, busy: false, minutes: 90, blocks: [], t0: 0 };
  function labEnv() {
    const sp = E.spot, t = E.spotT === undefined ? E.day.spot.t : E.spotT, env = E.A.sounding(sp.x, sp.y, t, { dz: 100, top: 20000 }), tb = env.table;
    return { env, ix: SND.indices(env), t, arr: { z: Array.from(tb.z), theta: Array.from(tb.theta), qv: Array.from(tb.qv), u: Array.from(tb.z, (z) => env.uG(z)), v: Array.from(tb.z, (z) => env.vG(z)), p0: 1000, motion: { u: env.motion.u, v: env.motion.v } } };
  }
  function labWorker() {
    const src = ['src-core', 'src-sounding', 'src-refl', 'src-lab', 'src-labworker'].map((id) => document.getElementById(id).textContent).join('\n;\n');
    return new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  }
  const DBZ_STOPS = [[5, 70, 120, 200], [15, 60, 190, 190], [25, 70, 200, 90], [35, 240, 230, 60], [45, 250, 150, 40], [55, 235, 60, 50], [65, 235, 70, 220], [75, 255, 255, 255]];
  function dbzRgb(d) { if (d < 5) return null; for (let i = 1; i < DBZ_STOPS.length; i++) if (d <= DBZ_STOPS[i][0]) { const a = DBZ_STOPS[i - 1], b = DBZ_STOPS[i], f = (d - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f]; } return DBZ_STOPS[DBZ_STOPS.length - 1].slice(1); }
  function drawThumb(cv, block, nx, ny, nz) {
    const c = cv.getContext('2d'), img = c.createImageData(nx, ny), dbz = new Int8Array(block.buffer, block.byteOffset, nx * ny * nz);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let m = -30; for (let k = 0; k < nz; k++) { const d = dbz[(k * ny + j) * nx + i]; if (d > m) m = d; } const rgb = dbzRgb(m), q = ((ny - 1 - j) * nx + i) * 4; if (rgb) { img.data[q] = rgb[0]; img.data[q + 1] = rgb[1]; img.data[q + 2] = rgb[2]; img.data[q + 3] = 255; } else img.data[q + 3] = 0; }
    c.clearRect(0, 0, cv.width, cv.height); const tmp = document.createElement('canvas'); tmp.width = nx; tmp.height = ny; tmp.getContext('2d').putImageData(img, 0, 0); c.imageSmoothingEnabled = false; c.drawImage(tmp, 0, 0, cv.width, cv.height);
  }
  const envNumbers = (ix) => '<div class="env"><div><b>' + Math.round(ix.mlcape) + '</b><span>CAPE J/kg</span></div><div><b>' + fmtSpeed(ix.shear06) + '</b><span>shear 0-6 km</span></div><div><b>' + Math.round(ix.srh01) + '</b><span>helicity 0-1 km</span></div><div><b>' + Math.round(ix.mllcl) + ' m</b><span>cloud base</span></div></div>';
  function openRun() {
    if (!E.spot || LAB.busy) return; const L = labEnv(), ex = GD.expect(L.ix), ll = G.fromLocal(lat0(), lon0(), E.spot.x * 1000, E.spot.y * 1000), pl = nearestPlace(ll.lat, ll.lon), el = $('ed-run');
    closeSheet(); el.hidden = false;
    el.innerHTML = '<div class="hd"><div><b>Run a storm</b><i>' + (pl ? 'Near ' + ESC(pl.name) + ' · ' : '') + '+' + L.t + ' h · ' + timeText(L.t) + '</i></div><button class="x" id="run-x" aria-label="Close"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      envNumbers(L.ix) + '<div class="ex"><b>' + ESC(ex.mode) + '</b>' + ex.hazards.map((h) => '<span class="tag">' + ESC(h) + '</span>').join('') + '</div>' +
      '<h3>Run for</h3><div class="mini sp" id="run-len">' + [45, 60, 90, 120].map((m) => '<button data-m="' + m + '" aria-pressed="' + (m === LAB.minutes) + '">' + (m < 60 ? m + ' min' : m / 60 + ' h') + '</button>').join('') + '</div>' +
      '<p class="story">The real model, 2 km cells in a box 84 km wide that moves with the storm, started in the drawing\'s sounding at the spot you tapped by a warm bubble. It takes a few minutes on this device, and then the radar plays it.</p>' +
      '<div class="row2"><button id="run-go" class="primary">Start</button></div>';
    $('run-x').addEventListener('click', closeRun); $('run-go').addEventListener('click', () => { runStorm({ minutes: LAB.minutes }).catch(() => {}); });
    el.querySelectorAll('#run-len button').forEach((b) => b.addEventListener('click', () => { LAB.minutes = +b.dataset.m; el.querySelectorAll('#run-len button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
  }
  function closeRun() { if (LAB.busy) return cancelRun(); $('ed-run').hidden = true; }
  function cancelRun() { if (LAB.worker) LAB.worker.postMessage({ t: 'cancel' }); }
  function scenarioOf(L, header, name) {                                                                   // where the box is on the ground: the radar site that the storm's track passes best, the box so that the storm starts at the spot
    const sp = E.spot, m = header.motion, mid = G.fromLocal(lat0(), lon0(), sp.x * 1000 + m.u * 3000, sp.y * 1000 + m.v * 3000), S = geo.points.site; let best = -1, bd = Infinity;
    for (let i = 0; i < S.n; i++) { if (Math.abs(S.lat[i] - mid.lat) > 2 || Math.abs(S.lon[i] - mid.lon) > 2.6) continue; const d = G.distBearing(mid.lat, mid.lon, S.lat[i], S.lon[i]).d; if (d >= 25000 && d < bd) { bd = d; best = i; } }
    if (best < 0) for (let i = 0; i < S.n; i++) { const d = G.distBearing(mid.lat, mid.lon, S.lat[i], S.lon[i]).d; if (d < bd) { bd = d; best = i; } }
    const site = { id: S.names[best], lat: S.lat[best], lon: S.lon[best] }, here = G.fromLocal(lat0(), lon0(), sp.x * 1000, sp.y * 1000), l = G.local(site.lat, site.lon, here.lat, here.lon), half = header.nx * header.dx / 2;
    const mm = Math.round(720 + L.t * 60), tz = here.lon > -85 ? 'EDT' : here.lon > -101 ? 'CDT' : here.lon > -115 ? 'MDT' : 'PDT';
    return { lat0: site.lat, lon0: site.lon, origin: [Math.round(l.x - half), Math.round(l.y - half)], radar: site.id, clock: String(Math.floor(mm / 60) % 24).padStart(2, '0') + ':' + String(mm % 60).padStart(2, '0'), tz };
  }
  function runStorm(o) {
    o = Object.assign({ minutes: 90, dx: 2000, box: 84000, dt: 10 }, o);
    return new Promise((resolve, reject) => {
      if (LAB.busy) return reject(new Error('a storm is running')); if (!E.spot) return reject(new Error('no spot'));
      const L = labEnv(), el = $('ed-run'); LAB.busy = true; LAB.blocks = []; LAB.t0 = Date.now(); el.hidden = false; let nx = Math.round(o.box / o.dx), last = null;
      el.innerHTML = '<div class="hd"><div><b>Running the storm</b><i>' + o.minutes + ' model minutes, ' + (o.dx / 1000) + ' km cells</i></div></div><div class="live"><canvas id="run-th" width="150" height="150"></canvas><p id="run-note">Waking the model up.</p></div>' +
        '<div class="pbar"><i id="run-bar"></i></div><div class="pt"><span id="run-time">0 of ' + o.minutes + ' min</span><span id="run-eta"></span></div><div class="row2"><button id="run-cancel" class="btn">Cancel</button></div>';
      $('run-cancel').addEventListener('click', cancelRun);
      let w; try { w = labWorker(); } catch (e) { LAB.busy = false; el.hidden = true; toast('This browser cannot run the model: ' + e.message, 6000); return reject(e); }
      LAB.worker = w; const end = () => { LAB.busy = false; w.terminate(); LAB.worker = null; };
      w.onerror = (e) => { end(); el.hidden = true; toast('The model stopped: ' + (e.message || 'worker error'), 7000); reject(new Error(e.message || 'worker error')); };
      w.onmessage = async (ev) => {
        const m = ev.data;
        if (m.t === 'frame') { LAB.blocks[m.i] = new Uint8Array(m.block); last = m; const cv = $('run-th'); if (cv) drawThumb(cv, LAB.blocks[m.i], nx, nx, 40); const n = $('run-note'); if (n) n.innerHTML = 'The strongest updraft is <b>' + Math.round(m.wmax * 2.2369) + ' mph</b>, the strongest echo <b>' + m.zmax + ' dBZ</b>.'; }
        else if (m.t === 'progress') { const bar = $('run-bar'); if (bar) bar.style.width = Math.min(100, m.time / m.of * 100) + '%'; const t = $('run-time'); if (t) t.textContent = Math.floor(m.time) + ' of ' + m.of + ' min'; const eta = $('run-eta'); if (eta && m.time > 3) { const left = m.wall * (m.of - m.time) / m.time; eta.textContent = left > 90 ? 'about ' + Math.round(left / 60) + ' min left' : 'about ' + Math.round(left) + ' s left'; } }
        else if (m.t === 'done') {
          end();
          if (m.stopped && m.reason === 'cancelled') { el.hidden = true; toast('The run was cancelled', 2200); return reject(new Error('cancelled')); }
          if (LAB.blocks.length < 3) { el.hidden = true; toast('The model did not get far: ' + (m.reason || 'no frames'), 6000); return reject(new Error(m.reason || 'no frames')); }
          try {
            const name = (E.day.name || 'A drawn day') + ', storm run', sc = scenarioOf(L, m.header, name), header = Object.assign({}, m.header, { name, scenario: sc }), pack = HFSeverePack.assemble(header, LAB.blocks.filter(Boolean));
            E.lastRun = { pack, spot: Object.assign({}, E.spot), t: L.t, wall: m.wall, ix: L.ix, scenario: sc, stopped: !!m.stopped, reason: m.reason || '' };
            await SEV.setPack(pack, { t: Math.min(50, header.times[header.times.length - 1]) }); el.hidden = true; setMode('radar');
            toast((m.stopped ? m.reason + '; ' : '') + 'The storm is on the radar: ' + header.times.length + ' frames, ' + sc.radar + ' is the radar (' + Math.round(m.wall) + ' s of work)', 6000); resolve(E.lastRun);
          } catch (e) { el.hidden = true; toast('Could not show the storm: ' + e.message, 7000); reject(e); }
        } else if (m.t === 'error') { end(); el.hidden = true; toast('The model stopped: ' + m.message, 7000); reject(new Error(m.message)); }
      };
      w.postMessage({ t: 'run', spec: { env: L.arr, dx: o.dx, box: o.box, dt: o.dt, minutes: o.minutes, frameEvery: o.frameEvery || 5, nz: o.nz || 40, dz: o.dz || 500, bubble: o.bubble } });
    });
  }

  /* ---- the mode, the map, the keys ---- */
  function ensureEditor() {
    if (E.ready) return; geo = SEV.geo;
    const pane = $('ed-pane'), base = pane.querySelector('.cv-base'), fill = pane.querySelector('.cv-fill'), top = pane.querySelector('.cv-top');
    map = MAP.create({ geo, base, top }); fctx = fill.getContext('2d'); map.theme = SEV.S.theme; map.layers = Object.assign({}, SEV.S.layers, { site: false }); map.noDoubleZoom = true; map.on('view', () => { if (E.sketch) { E.sketch = null; redraw(); } });
    map.addFrameHook((view) => { drawFill(view); if (fieldStale() && !fieldTimer && !E.drag) scheduleField(180); });
    map.addHook((c, v, h) => paint(c, v, h)); map.dragHandler = dragHandler; map.on('tap', (x, y) => onTap(x, y)); map.on('hover', (x, y) => { if (E.build) { E.hover = [x, y]; redraw(); } });
    const resize = () => { const r = pane.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return; const dpr = Math.min(2, window.devicePixelRatio || 1); map.resize(Math.round(r.width), Math.round(r.height), dpr); fill.width = base.width; fill.height = base.height; fill.style.width = base.style.width; fill.style.height = base.style.height; map.redraw(); };
    new ResizeObserver(resize).observe(pane); new ResizeObserver(() => { document.documentElement.style.setProperty('--eddock', ($('ed-dock').offsetHeight + 14) + 'px'); }).observe($('ed-dock'));
    wireDock(); buildTicks(); E.ready = true;
    let draft = null; try { draft = JSON.parse(localStorage.getItem(LS)); } catch (e) { draft = null; }
    if (draft && draft.v === 1 && draft.drawing && draft.day) { try { AN.create(draft.drawing); loadDay(Object.assign({}, draft.day, { drawing: draft.drawing }), true); } catch (e) { loadDay(DAYS.get('dryline'), true); } } else loadDay(DAYS.get('dryline'), true);
    resize();
  }
  function wireDock() {
    $('ed-undo').addEventListener('click', undo); $('ed-redo').addEventListener('click', redo);
    $('ed-slider').addEventListener('input', (e) => { const v = +e.target.value; stopPlay(); setTime(v); });
    $('ed-play').addEventListener('click', () => (E.playing ? stopPlay() : startPlay()));
    $('ed-start').addEventListener('click', openRun);
  }
  function startPlay() { if (E.t >= 12) setTime(0); E.playing = true; last = 0; syncTime(); raf = requestAnimationFrame(tick); }
  function stopPlay() { E.playing = false; cancelAnimationFrame(raf); syncTime(); }
  function tick(ts) { if (!E.playing) return; if (!last) last = ts; const dt = Math.min(0.1, (ts - last) / 1000); last = ts; const nt = E.t + dt * 1.2; if (nt >= 12) { setTime(12); stopPlay(); return; } setTime(nt); raf = requestAnimationFrame(tick); }

  function setMode(m) {
    const app = $('app'); if (m === 'draw') ensureEditor(); app.dataset.mode = m; $('editor').hidden = m !== 'draw';
    $('m-draw').setAttribute('aria-selected', String(m === 'draw')); $('m-radar').setAttribute('aria-selected', String(m !== 'draw')); const bi = $('brand').querySelector('i'); if (bi) bi.textContent = m === 'draw' ? 'Draw' : 'Radar';
    if (m !== 'draw') stopPlay(); else { setTimeout(() => { if (map) map.redraw(); }, 30); }
    if (SEV.panes) SEV.panes.forEach((p) => p.map.redraw());
    try { const h = m === 'draw' ? '#draw' : ''; if (location.hash !== h) history.replaceState(null, '', location.pathname + location.search + h); } catch (e) { /* none */ }
  }
  function onKey(e) {
    if ($('app').dataset.mode !== 'draw' || !E.ready) return; if (e.target && /input|textarea|select/i.test(e.target.tagName) && e.target.type !== 'range') return;
    const k = e.key, ctl = e.metaKey || e.ctrlKey; let used = true;
    if (ctl && (k === 'z' || k === 'Z')) { if (e.shiftKey) redo(); else undo(); } else if (ctl && (k === 'y' || k === 'Y')) redo(); else if (ctl || e.altKey) used = false;
    else if (k === 'Escape') { if (E.build || E.sketch) cancelBuild(); else if (!$('ed-sheet').hidden) closeSheet(); else if (E.sel >= 0) { E.sel = -1; syncProps(); redraw(); } else if (E.tool !== 'select') setTool('select', true); else used = false; }
    else if (k === 'Enter') { if (E.build) finishBuild(); else used = false; } else if (k === 'Delete' || k === 'Backspace') { if (E.sel >= 0) deleteSelected(); else used = false; }
    else if (k === ' ') { if (E.playing) stopPlay(); else startPlay(); }
    else if (k === 't' || k === 'T') { $('b-theme').click(); }
    else { const t = TOOLS.find((x) => x !== 'gap' && x.key === k.toLowerCase()); if (t && canEdit() || (t && (t.id === 'select' || t.id === 'probe'))) setTool(t.id); else used = false; }
    if (used) { e.preventDefault(); e.stopPropagation(); }
  }

  function init() {
    SEV = window.SEVERE; if (!SEV || !SEV.geo) return;
    $('m-draw').addEventListener('click', () => setMode('draw')); $('m-radar').addEventListener('click', () => setMode('radar'));
    document.addEventListener('keydown', onKey, true);
    $('b-theme').addEventListener('click', () => { if (!map) return; map.setTheme(SEV.S.theme); E.fields = null; syncLegend(); if (E.sel >= 0 || E.probe) closeSheet(); scheduleField(0); redraw(); });
    SEV.editor = { E, LAB, runStorm, openRun, closeRun, labEnv, scenarioOf, setMode, loadDay, setTool, setLayer, setTime, undo, redo, rebuild, commit, addObject, newObject, nearestPlace, openSheet, closeSheet, get map() { return map; }, toKm, toScreen, deleteSelected, TOOLS, PROPS, anchorOf, tipOf };
    if (location.hash === '#draw') setMode('draw');
  }
  if (window.SEVERE && window.SEVERE.ready) init(); else window.addEventListener('severe-ready', init);
})();
