/* Severe: how the editor paints (docs/severe-plan.md 6.2): the objects of a drawing in the manner of a surface analysis chart, the winds as station-model barbs, the colours and the colour bar of the maps of the
 * indices, the skew-T and the hodograph. The colours of a map are pure (a value to a colour) and are tested on their own; the rest paints on a canvas context it is given and is looked at in the browser suite.
 *
 *   HFSevereEditorPaint.LAYERS                 // the maps: [{ id, field, name, unit(s), range, stops }]
 *   HFSevereEditorPaint.fieldColor(layer, v)   // [r, g, b, a] (a from 0 to 1) of a value on a map; a value that is not a number is transparent
 *   HFSevereEditorPaint.drawObject(c, o, ctx)  // an object of the drawing; ctx: { P: (x, y) => [px, py], th, selected, speedText, pressureText, kmToPx }
 *   HFSevereEditorPaint.drawArrow / drawBarb / drawHandle / drawLegend / drawSkewT / drawHodograph
 *
 * A classic script that sets `globalThis.HFSevereEditorPaint`; it needs HFSevereDraw first (the geometry).
 */
(function () {
  'use strict';
  const DR = globalThis.HFSevereDraw;
  const FONT = '"Avenir Next","Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",sans-serif';
  const TAU = Math.PI * 2;

  /* ---- the maps: stops of [value, r, g, b, alpha], the value in the field's own unit (C, m/s, J/kg, m2/s2); under the first stop and above the last the colour of that stop ---- */
  const LAYERS = [
    { id: 'T', field: 'T', name: 'Temperature', kind: 'temp', range: [-20, 40], stops: [[-30, 180, 120, 255, .55], [-10, 80, 120, 255, .55], [0, 60, 190, 255, .55], [10, 60, 210, 140, .55], [20, 240, 230, 70, .55], [30, 255, 150, 50, .58], [40, 255, 60, 60, .6]] },
    { id: 'Td', field: 'Td', name: 'Dew point', kind: 'temp', range: [-10, 26], stops: [[-10, 170, 120, 60, .55], [5, 205, 185, 95, .5], [12, 110, 200, 90, .5], [18, 50, 180, 170, .55], [22, 60, 140, 255, .58], [26, 150, 90, 255, .62]] },
    { id: 'mlcape', field: 'mlcape', name: 'CAPE', kind: 'cape', range: [0, 5000], stops: [[0, 120, 200, 255, 0], [100, 120, 200, 255, .22], [500, 80, 200, 140, .42], [1000, 120, 220, 80, .5], [2000, 255, 235, 60, .55], [3000, 255, 150, 40, .6], [4000, 255, 60, 50, .65], [5000, 255, 60, 200, .7]] },
    { id: 'shear06', field: 'shear06', name: 'Shear 0-6 km', kind: 'speed', range: [0, 50], stops: [[10, 110, 200, 255, 0], [15, 110, 200, 255, .32], [20, 80, 210, 140, .45], [25, 230, 230, 60, .5], [30, 255, 160, 50, .55], [40, 255, 60, 60, .6], [50, 255, 60, 200, .7]] },
    { id: 'srh01', field: 'srh01', name: 'Helicity 0-1 km', kind: 'srh', range: [0, 500], stops: [[0, 110, 200, 255, 0], [50, 110, 200, 255, .3], [100, 80, 210, 140, .45], [200, 240, 230, 60, .55], [300, 255, 150, 50, .6], [400, 255, 60, 60, .65], [600, 255, 60, 200, .7]] },
    { id: 'stp', field: 'stp', name: 'Tornado parameter', kind: 'stp', range: [0, 10], stops: [[0, 110, 200, 255, 0], [.5, 110, 200, 255, .3], [1, 240, 230, 60, .5], [3, 255, 150, 50, .6], [6, 255, 60, 60, .65], [10, 255, 60, 200, .75]] },
  ];
  const layerById = (id) => LAYERS.find((l) => l.id === id) || null;
  function fieldColor(layer, v) {
    const S = layer.stops; if (typeof v !== 'number' || !(v === v)) return [0, 0, 0, 0];
    if (v <= S[0][0]) return [S[0][1], S[0][2], S[0][3], S[0][4]];
    for (let i = 1; i < S.length; i++) {
      if (v <= S[i][0]) { const a = S[i - 1], b = S[i], f = (v - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f, a[4] + (b[4] - a[4]) * f]; }
    }
    const e = S[S.length - 1]; return [e[1], e[2], e[3], e[4]];
  }

  /* ---- the colours of the objects ---- */
  const OBJ = {
    dark: { cold: '#55a8ff', warm: '#ff6256', occluded: '#b98aff', dryline: '#f3a73f', trough: '#d9a56a', outflow: '#8fd0ff', moisture: '#52d894', jet: '#c99cff', llj: '#ffa24f', utrough: '#ff7fbd', low: '#ff6a5c', high: '#5aaeff',
      sel: '#ffffff', arrow: 'rgba(255,255,255,.88)', iso: 'rgba(238,243,250,.58)', isoText: '#f1f5fb', halo: 'rgba(6,9,15,.92)', barb: 'rgba(240,245,252,.88)', disc: 'rgba(10,15,24,.86)', text: '#f3f6fb' },
    light: { cold: '#1b6fd6', warm: '#d43a30', occluded: '#7d4fd0', dryline: '#c97a0c', trough: '#9b6a35', outflow: '#2a86c9', moisture: '#14a064', jet: '#8a52d6', llj: '#d2761c', utrough: '#d0408a', low: '#d43a30', high: '#1b6fd6',
      sel: '#10131a', arrow: 'rgba(20,28,44,.85)', iso: 'rgba(28,40,60,.55)', isoText: '#16202f', halo: 'rgba(255,255,255,.92)', barb: 'rgba(24,34,52,.88)', disc: 'rgba(255,255,255,.92)', text: '#161d2a' },
  };
  const colorOf = (o, T) => (o.type === 'front' ? T[o.kind === 'stationary' ? 'cold' : (o.kind || 'cold')] : T[o.type] || T.cold);

  const stroke = (c, pts, w, color, dash) => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.lineWidth = w; c.strokeStyle = color; c.setLineDash(dash || []); c.stroke(); c.setLineDash([]); };
  const halo = (c, text, x, y, T, font) => { c.font = font || ('700 12px ' + FONT); c.lineWidth = 3.4; c.strokeStyle = T.halo; c.strokeText(text, x, y); c.fillStyle = T.isoText; c.fillText(text, x, y); };

  /* ---- an arrow head at (x, y) pointing along ang ---- */
  function head(c, x, y, ang, size, color) {
    c.beginPath(); c.moveTo(x, y); c.lineTo(x - size * Math.cos(ang - 0.42), y - size * Math.sin(ang - 0.42)); c.lineTo(x - size * Math.cos(ang + 0.42), y - size * Math.sin(ang + 0.42)); c.closePath(); c.fillStyle = color; c.fill();
  }

  /* ---- the motion arrow of an object: dashed, from its anchor to where it will be in 3 hours, with its speed ---- */
  function drawArrow(c, x0, y0, x1, y1, T, label, strong) {
    if (Math.hypot(x1 - x0, y1 - y0) < 4) return;
    const ang = Math.atan2(y1 - y0, x1 - x0);
    c.save(); c.lineCap = 'round';
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineWidth = strong ? 3.6 : 3; c.strokeStyle = T.halo; c.stroke();
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineWidth = strong ? 2 : 1.5; c.strokeStyle = T.arrow; c.setLineDash([6, 4]); c.stroke(); c.setLineDash([]);
    head(c, x1, y1, ang, strong ? 11 : 9, T.halo); head(c, x1, y1, ang, strong ? 9 : 7, T.arrow);
    if (label) { c.textAlign = 'center'; c.textBaseline = 'middle'; halo(c, label, x1 + 16 * Math.cos(ang) + (Math.cos(ang) < 0 ? -14 : 14) * Math.abs(Math.cos(ang)), y1 + 14 * Math.sin(ang) + (Math.sin(ang) > 0 ? 6 : -6), T, '600 11px ' + FONT); }
    c.restore();
  }

  /* ---- a handle of a selected object ---- */
  function drawHandle(c, x, y, T, active) {
    c.beginPath(); c.arc(x, y, active ? 7.5 : 6, 0, TAU); c.fillStyle = active ? '#4a90f5' : '#fff'; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(8,12,20,.85)'; c.stroke();
  }

  /* ---- a wind as a station model: the staff points to where the wind comes from, the barbs to its right (the northern hemisphere's way) ---- */
  function drawBarb(c, x, y, kt, fromDeg, T) {
    const b = DR.windBarb(kt);
    if (b.calm) { c.beginPath(); c.arc(x, y, 3, 0, TAU); c.lineWidth = 1.4; c.strokeStyle = T.barb; c.stroke(); return; }
    const sx = Math.sin(fromDeg * Math.PI / 180), sy = -Math.cos(fromDeg * Math.PI / 180), rx = -sy, ry = sx, len = 26, ex = x + sx * len, ey = y + sy * len;
    c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey);
    let a = 0; const at = (k) => [ex - sx * a, ey - sy * a, k];
    for (let i = 0; i < b.pennants; i++) { const p = at(); c.moveTo(p[0], p[1]); c.lineTo(p[0] + rx * 9 + sx * 4, p[1] + ry * 9 + sy * 4); a += 5; const q = at(); c.lineTo(q[0], q[1]); a += 1.5; }
    for (let i = 0; i < b.longs; i++) { const p = at(); c.moveTo(p[0], p[1]); c.lineTo(p[0] + rx * 9 + sx * 4, p[1] + ry * 9 + sy * 4); a += 3.4; }
    if (b.shorts) { if (!b.pennants && !b.longs) a += 3.4; const p = at(); c.moveTo(p[0], p[1]); c.lineTo(p[0] + rx * 4.5 + sx * 2, p[1] + ry * 4.5 + sy * 2); }
    c.lineWidth = 1.5; c.lineJoin = 'round'; c.strokeStyle = T.barb; c.stroke();
    c.beginPath(); c.arc(x, y, 1.6, 0, TAU); c.fillStyle = T.barb; c.fill();
  }

  /* ---- the symbols of a line: teeth, half circles, scallops and ticks every so many pixels, on the side the way of drawing says (a front with two kinds alternates them; a stationary front's teeth are blue and its half circles red) ---- */
  function symbols(c, px, o, color, T) {
    const sides = DR.symbolSides(o); if (!sides.length) return;
    const n = sides.length, gap = n === 2 ? 64 : (o.type === 'outflow' ? 28 : 34), shade = (shape) => (o.kind === 'stationary' ? (shape === 'tooth' ? T.cold : T.warm) : color);
    sides.forEach((sd, k) => {
      const col = shade(sd.shape);
      DR.symbolsAlong(px, gap, n === 2 ? gap / 4 + k * gap / 2 : gap / 2).forEach((s) => {
        const nx = sd.side === 'left' ? Math.sin(s.ang) : -Math.sin(s.ang), ny = sd.side === 'left' ? -Math.cos(s.ang) : Math.cos(s.ang), tx = Math.cos(s.ang), ty = Math.sin(s.ang);
        c.beginPath();
        if (sd.shape === 'tooth') { c.moveTo(s.x - tx * 7, s.y - ty * 7); c.lineTo(s.x + nx * 11, s.y + ny * 11); c.lineTo(s.x + tx * 7, s.y + ty * 7); c.closePath(); c.fillStyle = col; c.fill(); }
        else if (sd.shape === 'semi' || sd.shape === 'scallop') { const r = sd.shape === 'semi' ? 7 : 6.5; if (sd.side === 'left') c.arc(s.x, s.y, r, s.ang - Math.PI, s.ang, false); else c.arc(s.x, s.y, r, s.ang, s.ang + Math.PI, false); c.closePath(); c.fillStyle = col; c.fill(); }
        else { c.moveTo(s.x, s.y); c.lineTo(s.x + nx * 8 + tx * 3, s.y + ny * 8 + ty * 3); c.lineWidth = 2; c.strokeStyle = col; c.stroke(); }
      });
    });
  }

  /* ---- an object of the drawing ---- */
  function drawObject(c, o, g) {
    const T = OBJ[g.th] || OBJ.dark, color = colorOf(o, T), P = g.P, sel = !!g.selected;
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    if (o.type === 'low' || o.type === 'high') {
      const p = P(o.x, o.y), col = o.type === 'low' ? T.low : T.high, r = 17;
      if (sel) { c.beginPath(); c.arc(p[0], p[1], r + 5, 0, TAU); c.fillStyle = 'rgba(255,255,255,.22)'; c.fill(); }
      c.beginPath(); c.arc(p[0], p[1], r, 0, TAU); c.fillStyle = T.disc; c.fill(); c.lineWidth = 2.6; c.strokeStyle = col; c.stroke();
      c.font = '800 20px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = col; c.fillText(o.type === 'low' ? 'L' : 'H', p[0], p[1] + 1);
      if (g.pressureText) { c.textBaseline = 'top'; halo(c, g.pressureText, p[0], p[1] + r + 4, T, '700 12px ' + FONT); }
      if (g.kmToPx && sel) { c.beginPath(); c.arc(p[0], p[1], (o.size || (o.type === 'low' ? 400 : 600)) * g.kmToPx, 0, TAU); c.lineWidth = 1.2; c.strokeStyle = col; c.globalAlpha = .6; c.setLineDash([3, 5]); c.stroke(); c.globalAlpha = 1; c.setLineDash([]); }
    } else if (o.type === 'utrough') {
      const p = P(o.x, o.y), R = (o.size || 500) * (g.kmToPx || 0.5);
      c.beginPath(); c.arc(p[0], p[1], R, 0, TAU); c.lineWidth = sel ? 2.6 : 1.8; c.strokeStyle = T.utrough; c.setLineDash([9, 7]); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.arc(p[0], p[1], 15, 0, TAU); c.fillStyle = T.disc; c.fill(); c.lineWidth = 2.2; c.strokeStyle = T.utrough; c.stroke();
      c.beginPath(); c.arc(p[0], p[1], 7, 0.4, 5.3, false); c.lineWidth = 2.2; c.stroke(); head(c, p[0] + 7 * Math.cos(5.3), p[1] + 7 * Math.sin(5.3), 5.3 + Math.PI / 2 - 0.15, 6, T.utrough);
      c.font = '700 11px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'top'; halo(c, 'Upper low' + (g.speedText ? ' · ' + g.speedText : ''), p[0], p[1] + 19, T, '700 11px ' + FONT);
    } else if (o.pts && o.pts.length >= 2) {
      const px = o.pts.map((p) => P(p[0], p[1]));
      if (sel) stroke(c, px, 9, 'rgba(255,255,255,.28)');
      if (o.type === 'front') {
        if (o.kind === 'stationary') { stroke(c, px, 3.4, T.warm, [32, 32]); c.save(); c.lineDashOffset = -32; stroke(c, px, 3.4, T.cold, [32, 32]); c.restore(); }
        else stroke(c, px, 3.4, color);
        symbols(c, px, o, color, T);
      } else if (o.type === 'dryline') { stroke(c, px, 3, color); symbols(c, px, o, color, T); }
      else if (o.type === 'trough') stroke(c, px, 2.6, color, [11, 7]);
      else if (o.type === 'outflow') { stroke(c, px, 2.2, color, [4, 5]); symbols(c, px, o, color, T); }
      else if (o.type === 'moisture') { c.globalAlpha = .26; stroke(c, px, 16, color); c.globalAlpha = 1; stroke(c, px, 2.2, color, [2, 9]); }
      else if (o.type === 'jet' || o.type === 'llj') {
        c.globalAlpha = .2; stroke(c, px, o.type === 'jet' ? 20 : 15, color); c.globalAlpha = 1; stroke(c, px, 2.6, color);
        DR.symbolsAlong(px, 170, 85).forEach((s) => head(c, s.x, s.y, s.ang, 12, color));
        const m = DR.along(px, 0.5); c.textAlign = 'center'; c.textBaseline = 'middle';
        halo(c, (o.type === 'jet' ? 'Jet' : 'Low-level jet') + (g.speedText ? ' ' + g.speedText : ''), m.x + 20 * Math.sin(m.ang), m.y - 20 * Math.cos(m.ang), T, '700 11px ' + FONT);
      }
      if (sel) px.forEach((p, i) => drawHandle(c, p[0], p[1], T, i === g.activePoint));
    }
    c.restore();
  }

  /* ---- the colour bar of a map ---- */
  function drawLegend(c, w, h, layer, tick, T) {
    const x0 = 10, x1 = w - 10, y0 = 18, bh = 11;
    const g = c.createLinearGradient(x0, 0, x1, 0), lo = layer.range[0], hi = layer.range[1];
    for (let i = 0; i <= 24; i++) { const v = lo + (hi - lo) * i / 24, col = fieldColor(layer, v); g.addColorStop(i / 24, 'rgba(' + Math.round(col[0]) + ',' + Math.round(col[1]) + ',' + Math.round(col[2]) + ',' + Math.min(1, 0.25 + col[3] * 1.3).toFixed(2) + ')'); }
    c.clearRect(0, 0, w, h); c.fillStyle = g; c.beginPath(); c.roundRect ? c.roundRect(x0, y0, x1 - x0, bh, 6) : c.rect(x0, y0, x1 - x0, bh); c.fill();
    c.font = '600 10.5px ' + FONT; c.textBaseline = 'alphabetic'; c.textAlign = 'center'; c.fillStyle = T.text;
    for (const tk of tick.values) { const x = x0 + (x1 - x0) * (tk.v - lo) / (hi - lo); if (x < x0 - 1 || x > x1 + 1) continue; c.fillRect(Math.round(x), y0 + bh, 1, 3); c.fillText(tk.text, x, y0 - 4); }
    c.textAlign = 'right'; c.fillStyle = T.text; c.globalAlpha = .75; c.fillText(tick.unit, x1, h - 2); c.globalAlpha = 1;
  }

  /* ---- the skew-T of a sounding: the profile (temperature red, dew point green), the mixed-layer parcel (white, dashed), the dry adiabats, the mixing ratio lines, and the isotherms, on x = T + 35 ln(1000 / p) ---- */
  function drawSkewT(c, W, H, env, ix, T, fmtT) {
    const S = DR.skewT, pTop = 100, pBot = 1050, xMin = -42, xMax = 46, padL = 30, padB = 20, padT = 8, padR = 8;
    const X = (t, p) => padL + (S.x(t, p) - xMin) / (xMax - xMin) * (W - padL - padR), Y = (p) => padT + (S.y(p) - S.y(pBot)) / (S.y(pTop) - S.y(pBot)) * (H - padT - padB);
    c.save(); c.clearRect(0, 0, W, H); c.beginPath(); c.rect(padL, padT, W - padL - padR, H - padT - padB); c.clip();
    const dark = T === OBJ.dark, grid = dark ? 'rgba(180,196,220,.16)' : 'rgba(30,45,70,.16)', pb = [];
    for (let p = pBot; p >= pTop; p -= 25) pb.push(p);
    c.lineWidth = 1;
    for (let t = -120; t <= 50; t += 10) { c.beginPath(); pb.forEach((p, i) => (i ? c.lineTo(X(t, p), Y(p)) : c.moveTo(X(t, p), Y(p)))); c.strokeStyle = t === 0 ? (dark ? 'rgba(110,190,255,.55)' : 'rgba(30,110,200,.6)') : grid; c.stroke(); }
    for (let th = 250; th <= 460; th += 10) { c.beginPath(); pb.forEach((p, i) => { const t = S.dryAdiabat(th, p); i ? c.lineTo(X(t, p), Y(p)) : c.moveTo(X(t, p), Y(p)); }); c.strokeStyle = dark ? 'rgba(255,190,120,.14)' : 'rgba(190,110,20,.18)'; c.stroke(); }
    c.setLineDash([3, 4]);
    for (const w of [1, 2, 4, 8, 12, 16, 20]) { c.beginPath(); for (let p = pBot, i = 0; p >= 600; p -= 25, i++) { const t = S.mixingRatioLine(w, p); i ? c.lineTo(X(t, p), Y(p)) : c.moveTo(X(t, p), Y(p)); } c.strokeStyle = dark ? 'rgba(110,220,150,.28)' : 'rgba(20,140,80,.3)'; c.stroke(); }
    c.setLineDash([]);
    for (const p of [1000, 850, 700, 500, 300, 200]) { c.beginPath(); c.moveTo(padL, Y(p)); c.lineTo(W - padR, Y(p)); c.strokeStyle = grid; c.stroke(); }
    const t = env.table, pOf = (k) => 1000 * Math.pow(t.pi[k], 1004 / 287.04), step = 10, pts = (f) => { const a = []; for (let k = 0; k < t.z.length; k += step) { const p = pOf(k); if (p < pTop) break; a.push(f(k, p)); } return a; };
    const tempC = (k) => t.theta[k] * t.pi[k] - 273.15, dewC = (k) => { const e = Math.max(1e-6, t.qv[k] * pOf(k) / (0.622 + t.qv[k])), l = Math.log(e / 6.112); return Math.min(tempC(k), 243.5 * l / (17.67 - l)); };
    if (ix && ix.mlpath) { c.setLineDash([6, 4]); c.beginPath(); pts((k, p) => [X(ix.mlpath[k] - 273.15, p), Y(p)]).forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.lineWidth = 1.8; c.strokeStyle = dark ? '#fff' : '#10131a'; c.stroke(); c.setLineDash([]); }
    c.beginPath(); pts((k, p) => [X(dewC(k), p), Y(p)]).forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.lineWidth = 2.6; c.strokeStyle = dark ? '#5fe08f' : '#12a14d'; c.stroke();
    c.beginPath(); pts((k, p) => [X(tempC(k), p), Y(p)]).forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.lineWidth = 2.8; c.strokeStyle = dark ? '#ff6b5e' : '#d6382b'; c.stroke();
    c.restore();
    c.font = '600 10px ' + FONT; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillStyle = T.text; c.globalAlpha = .8;
    for (const p of [1000, 850, 700, 500, 300, 200, 100]) c.fillText(String(p), padL - 4, Y(p));
    c.textAlign = 'center'; c.textBaseline = 'top'; for (let tt = -30; tt <= 40; tt += 10) { const x = X(tt, pBot); if (x > padL + 6 && x < W - padR - 6) c.fillText(fmtT ? fmtT(tt) : String(tt), x, H - padB + 4); }
    c.globalAlpha = 1;
  }

  /* ---- the hodograph: the wind at heights from the ground to 10 km, the rings every 10 m/s, in the units given by `k` (display per m/s), the storm's motion marked ---- */
  function drawHodograph(c, S, env, ix, T, k, unit) {
    const dark = T === OBJ.dark, R = S / 2 - 18, vmax = 50, cx = S / 2, cy = S / 2, sc = R / vmax;
    c.save(); c.clearRect(0, 0, S, S);
    c.lineWidth = 1; c.strokeStyle = dark ? 'rgba(180,196,220,.2)' : 'rgba(30,45,70,.2)'; c.fillStyle = T.text; c.font = '600 10px ' + FONT; c.textAlign = 'left'; c.textBaseline = 'middle';
    for (let v = 10; v <= vmax; v += 10) { c.beginPath(); c.arc(cx, cy, v * sc, 0, TAU); c.stroke(); c.globalAlpha = .6; c.fillText(String(Math.round(v * k)), cx + v * sc * 0.707 + 2, cy - v * sc * 0.707); c.globalAlpha = 1; }
    c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.stroke();
    const cols = [[0, 1000, '#ff6b5e'], [1000, 3000, '#5fe08f'], [3000, 6000, '#ffd75e'], [6000, 9000, '#6bb7ff']];
    for (const [z0, z1, col] of cols) { c.beginPath(); for (let z = z0; z <= z1; z += 250) { const x = cx + env.uG(z) * sc, y = cy - env.vG(z) * sc; z === z0 ? c.moveTo(x, y) : c.lineTo(x, y); } c.lineWidth = 3; c.strokeStyle = col; c.stroke(); }
    c.font = '700 10px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = T.text;
    for (const z of [0, 1000, 3000, 6000, 9000]) { const x = cx + env.uG(z) * sc, y = cy - env.vG(z) * sc; c.beginPath(); c.arc(x, y, 2.6, 0, TAU); c.fillStyle = dark ? '#fff' : '#10131a'; c.fill(); if (z) { c.fillStyle = T.text; c.fillText(z / 1000 + '', x + 8, y - 6); } }
    if (ix && ix.bunkers) { const m = ix.bunkers.right, x = cx + m.u * sc, y = cy - m.v * sc; c.beginPath(); c.moveTo(x - 4, y - 4); c.lineTo(x + 4, y + 4); c.moveTo(x + 4, y - 4); c.lineTo(x - 4, y + 4); c.lineWidth = 2.2; c.strokeStyle = dark ? '#fff' : '#10131a'; c.stroke(); }
    c.textAlign = 'right'; c.textBaseline = 'alphabetic'; c.fillStyle = T.text; c.globalAlpha = .7; c.fillText(unit, S - 4, S - 4); c.globalAlpha = 1;
    c.restore();
  }

  globalThis.HFSevereEditorPaint = { LAYERS, layerById, fieldColor, OBJ, FONT, drawObject, drawArrow, drawBarb, drawHandle, drawLegend, drawSkewT, drawHodograph };
})();
