/* ==== STORM SUMMARY BEGIN ==== */
/* ---- the season summary (the Summary button of the season bar) -------------------------------------------------------------------------------------------------------------------------------
   One card for one season, the current one or a finished one (the arrows): the totals against the real normals, the landfalls, the damage and the deaths; the storms that stand out (the strongest, the one that made the most
   ACE, the longest lived, the deadliest, the costliest); a map of the season's tracks on Blue Marble the way the track maps of Wikipedia draw them (src/storm-hooks.js: WIKI_COLS, wikiShape); an overview of every storm
   in time like Wikipedia's timeline pictures, with this basin's own classes, their colours and their winds in mph; the accumulated cyclone energy against the real seasons; a small graph of the wind of each storm on shared
   axes; a table of every storm; and the same season as wikitext (the effects table and the timeline code) to copy. Everything is read from the engine's season record (Manager.seasonRecord): a storm's six-hourly track
   (`trk`), its landfalls (`lfs`), the cities it hurt most (`areas`), its damage and deaths. Winds are in mph: the engine's knots are shown as mph until the page has unit conversions. */
const SUM = DATA.storms || null;                                     // the real 1991-2020 normals and daily ACE percentiles (tools/merge_data.mjs --storms)
const sumF1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const sumDay = (y, d) => { const t = new Date(Date.UTC(y, SM, 1 + d)); return MON[t.getUTCMonth()] + ' ' + t.getUTCDate(); };            // day d of the season that starts in month SM of year y
const sumYearDays = (y) => Math.round((Date.UTC(y + 1, SM, 1) - Date.UTC(y, SM, 1)) / 86400000);
function sumNiceTop(v) { for (const t of [30, 60, 100, 150, 200, 250, 300, 350, 400, 500, 650, 800, 1000]) if (v <= t) return t; return Math.ceil(v / 250) * 250; }
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const KT_MPH = 1.150779;
const mphOf = (kt) => kt * KT_MPH;
let sumRec = null, sumD = null, sumCls = null, sumSort = { k: 'n', dir: 1 }, sumHits = { map: [], tl: [] }, sumWikiMade = '', sumTlGeo = null;

/* ---- this basin's classes: name, letters, colour, the winds they cover in mph ---------------------------------------------------------------------------------------------------------------------------- */
const SUM_SSHWS_MPH = [0, 39, 74, 96, 111, 130, 157];                // the Saffir-Simpson scale's own limits in mph (34 kt is 39 mph, 137 kt is 157 mph, as the National Hurricane Center gives them)
const sumClassName = (long) => { const t = hurrWord(long.replace(/ Hurricane$/, '')), m = /^(Category \d)/.exec(t); return m ? m[1] : t.replace(/^Tropical (Depression|Storm)$/, '$1'); };         // the short name the overview's legend uses: Depression, Storm, Category 1 ... (a name of the basin's own stays whole: Tropical Low, Severe Tropical Storm)
function sumClasses() {
  if (sumCls) return sumCls;
  const C = SCALE.classes, ss = SCALE.major != null, lim = (i) => (ss ? SUM_SSHWS_MPH[i] : Math.round(C[i][0] * KT_MPH));
  sumCls = C.map((c, i) => ({ i, short: c[1], long: hurrWord(c[2]), name: sumClassName(c[2]), color: ss ? WIKI_COLS[i] : SCALE.cols[i], lo: lim(i), hi: i + 1 < C.length ? lim(i + 1) - 1 : null }));
  return sumCls;
}
const sumClassOf = (kt) => sumClasses()[HFStorms.classOf(STORM_BASIN, kt, 'tc').idx];
const sumRange = (c) => (c.hi == null ? '≥' + c.lo : c.lo + '–' + c.hi) + ' mph';
const SUM_SCALE_NAME = { nhc: 'Saffir-Simpson', satl: 'Saffir-Simpson', med: 'Saffir-Simpson', jtwc: 'JTWC / JMA', imd: 'IMD', mfr: 'Météo-France La Réunion', bom: 'Bureau of Meteorology', fiji: 'Fiji Meteorological Service' };
const sumScaleName = () => SUM_SCALE_NAME[BI.scale] || SCALE.agency;
const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const inkOn = (h) => { const [r, g, b] = hexRgb(h); return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#10151f' : '#ffffff'; };

/* ---- one season's storms, with what the pictures need ---------------------------------------------------------------------------------------------------------------------------------------------------- */
let sumMeasure = null;
const sumTextW = (t, px, weight, fam) => { const g = sumMeasure || (sumMeasure = document.createElement('canvas').getContext('2d')); g.font = (weight || '400') + ' ' + px + 'px ' + (fam || 'system-ui, sans-serif'); return g.measureText(t).width; };
function sumNearestCity(lat, lon, maxKm) {                          // the coastal city nearest to a landfall (an "area affected" when no city was damaged)
  let best = null, bd = maxKm;
  for (const c of CITIES) { if (c.sLat !== undefined) continue; const dy = (c.lat - lat) * 111.2, dx = (c.lon - lon) * 111.2 * Math.cos(lat * DEG), d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = c.name; } }
  return best;
}
function sumPiecesOf(trop, end) {                                   // a storm's bar as the overview draws it: one solid piece for each stretch in which the system stayed a tropical cyclone (fixes six hours apart: a fix between that was not tropical, or none, ends the piece), in the colour of the peak of that stretch; where it stopped being one and re-formed there is a gap
  const out = [];
  for (const r of trop) {
    const c = HFStorms.classOf(STORM_BASIN, r[3], 'tc').idx, q = out[out.length - 1];
    if (q && r[0] - q.last <= 6) { q.last = r[0]; if (c > q.c) q.c = c; } else out.push({ a: r[0], last: r[0], c });
  }
  out.forEach((q, i) => { const cap = out[i + 1] ? out[i + 1].a : (end != null && end > q.last ? end : Infinity); q.b = Math.max(q.a + 3, Math.min(q.last + 6, cap)); delete q.last; });
  return out;                                                        // in hours from the start of the simulation
}
function sumBuild(rec) {
  const now = stormMgr.hour, CL = sumClasses(), list = [];
  for (const s of rec.storms) {
    const trk = s.trk || [], trop = trk.filter((r) => r[5] === 0 || r[5] === 1), peak = sumClassOf(s.peakV);
    const t0 = s.tdHour >= 0 ? s.tdHour : (trop.length ? trop[0][0] : now), t1 = s.end != null ? s.end : now, segs = sumPiecesOf(trop, s.end);
    if (!segs.length && s.peakV > 0) segs.push({ a: t0, b: Math.max(t1, t0 + 6), c: peak.i });            // a season saved before the tracks were kept: one bar in the colour of the peak
    const lfs = s.lfs || [], areas = (s.areas || []).map((x) => x[0]);
    for (const l of lfs) { const c = sumNearestCity(l.lat, l.lon, 250); if (c && !areas.includes(c)) areas.push(c); }
    list.push({ s, label: s.name || numWord(s.depNum), peak, t0, t1, segs, a: segs.length ? segs[0].a : t0, b: segs.length ? segs[segs.length - 1].b : t1, lfs, areas, mph: HFStorms.ktToMph(s.peakV), days: Math.max(0, (t1 - t0) / 24), trk, trop, live: s.end == null });
  }
  const D = { rec, list, CL };
  D.tl = sumPack(D);
  return D;
}
function sumPeriod(D) {                                             // the months the timeline shows: whole months round every storm, at least six of them
  const L = D.list.filter((x) => x.segs.length);
  let h0 = Infinity, h1 = -Infinity; for (const x of L) { h0 = Math.min(h0, x.a); h1 = Math.max(h1, x.b); }
  if (!L.length) return null;
  const d0 = simDate(h0), d1 = simDate(h1); let y = d0.getUTCFullYear(), m = d0.getUTCMonth(); const y1 = d1.getUTCFullYear(), m1 = d1.getUTCMonth();
  const months = []; for (let yy = y, mm = m; yy < y1 || (yy === y1 && mm <= m1); mm++) { if (mm > 11) { mm = 0; yy++; } months.push([yy, mm]); if (yy === y1 && mm === m1) break; }
  while (months.length < 6) { const f = months[0], l = months[months.length - 1]; if (months.length % 2) months.push(l[1] === 11 ? [l[0] + 1, 0] : [l[0], l[1] + 1]); else months.unshift(f[1] === 0 ? [f[0] - 1, 11] : [f[0], f[1] - 1]); }
  const hr = (yy, mm) => (Date.UTC(yy, mm, 1) - START_MS) / 3600000, last = months[months.length - 1];
  return { months: months.map(([yy, mm]) => ({ y: yy, m: mm, h0: hr(yy, mm), h1: mm === 11 ? hr(yy + 1, 0) : hr(yy, mm + 1) })), h0: hr(months[0][0], months[0][1]), h1: last[1] === 11 ? hr(last[0] + 1, 0) : hr(last[0], last[1] + 1) };
}
const TL = { W: 800, L: 20, R: 20, T: 10, ROW: 14, BAR: 11, FS: 10, FONT: 'Arial, "Liberation Sans", Helvetica, sans-serif' };            // the geometry of Wikipedia's timeline pictures at their 800 px: 14 px a row, 11 px bars, 10 px type
function sumPack(D) {                                               // the rows of the timeline: storm after storm down the rows and back to the top (the waterfall of Wikipedia's timelines), with the fewest rows in which no two storms of a row touch, a name included
  const P = sumPeriod(D); if (!P) return null;
  const items = D.list.filter((x) => x.segs.length).sort((p, q) => p.a - q.a || p.s.depNum - q.s.depNum), span = TL.W - TL.L - TL.R, X = (h) => TL.L + (h - P.h0) / (P.h1 - P.h0) * span;
  for (const x of items) { x.x0 = X(x.a); x.x1 = X(x.b); x.tag = x.peak.short; x.text = x.label + ' (' + x.tag + ')'; x.xe = x.x1 + 5 + sumTextW(x.text, TL.FS, '400', TL.FONT) + 4; }
  let N = 1;
  for (; N < items.length; N++) { const last = new Array(N).fill(-1e9); let ok = true; items.forEach((x, i) => { const r = i % N; if (x.x0 < last[r]) ok = false; last[r] = x.xe; }); if (ok) break; }
  items.forEach((x, i) => { x.row = i % N; });
  return { P, items, rows: N, X };
}

/* ---- the totals, the storms that stand out ---------------------------------------------------------------------------------------------------------------------------------------------------------------- */
function sumHighlights(D) {
  const L = D.list.filter((x) => x.s.peakV > 0), out = []; if (!L.length) return out;
  const top = (cmp) => L.slice().sort(cmp)[0], fmtD = (x) => x.s.end == null ? 'still active' : sumF1(x.days) + ' days';
  const st = top((a, b) => b.s.peakV - a.s.peakV || a.s.peakP - b.s.peakP);
  out.push({ k: 'Strongest', x: st, v: st.peak.long + ' · ' + st.mph + ' mph · ' + st.s.peakP + ' hPa' });
  const ac = top((a, b) => b.s.ace - a.s.ace); if (ac.s.ace > 0) out.push({ k: 'Most ACE', x: ac, v: sumF1(ac.s.ace) + ' ACE' + (D.rec.ace > 0 ? ' · ' + Math.round(100 * ac.s.ace / D.rec.ace) + ' % of the season' : '') });
  const lg = top((a, b) => b.days - a.days); out.push({ k: 'Longest lived', x: lg, v: fmtD(lg) });
  const dd = top((a, b) => ((b.s.imp && b.s.imp.k) || 0) - ((a.s.imp && a.s.imp.k) || 0)); if (dd.s.imp && dd.s.imp.k > 0) out.push({ k: 'Deadliest', x: dd, v: dd.s.imp.k.toLocaleString('en-US') + ' deaths' });
  const cc = top((a, b) => ((b.s.imp && b.s.imp.d) || 0) - ((a.s.imp && a.s.imp.d) || 0)); if (cc.s.imp && cc.s.imp.d > 0) out.push({ k: 'Costliest', x: cc, v: stormUsd(cc.s.imp.d) + ' damage' });
  const lf = top((a, b) => b.lfs.length - a.lfs.length); if (lf.lfs.length >= 2) out.push({ k: 'Most landfalls', x: lf, v: lf.lfs.length + ' landfalls' });
  return out;
}
function sumTotals(D) {
  const rec = D.rec, n = SUM ? SUM.normals : null, lf = D.list.reduce((t, x) => t + x.lfs.length, 0), im = rec.imp;
  const cells = [['DEP', rec.dep, n && n.dep], ['NAMED', rec.named, n && n.named], [BAR[0], rec.hurr, n && n.hurr], [BAR[1], rec.major, n && n.major], [BAR[2], rec.cat5, n && n.cat5], ['ACE', sumF1(rec.ace), n && n.ace]];
  $('sum-tot').innerHTML = cells.map(([k, v, a]) => '<div><b>' + v + '</b><span>' + k + '</span><small>' + (a == null ? '' : 'avg ' + sumF1(a)) + '</small></div>').join('');
  const c2 = [['LANDFALLS', lf, ''], ['DAMAGE', im && im.d > 0 ? stormUsd(im.d) : '—', ''], ['DEATHS', im && im.k > 0 ? im.k.toLocaleString('en-US') : '—', ''], ['INJURED', im && im.i > 0 ? im.i.toLocaleString('en-US') : '—', '']];
  $('sum-tot2').innerHTML = c2.map(([k, v]) => '<div><b>' + v + '</b><span>' + k + '</span></div>').join('');
  const el = $('sum-imp'); el.hidden = !(im && im.worst);
  if (!el.hidden) el.innerHTML = 'Worst hit: <b>' + im.worst.city + '</b> (' + stormUsd(im.worst.d) + ', ' + im.worst.storm + ')';
  const hl = sumHighlights(D);
  $('sum-hl').innerHTML = hl.map((h, i) => '<button type="button" data-id="' + h.x.s.id + '" style="--c:' + h.x.peak.color + '"><small>' + h.k + '</small><b>' + h.x.label + '</b><span>' + h.v + '</span></button>').join('');
  $('sum-hl').querySelectorAll('button').forEach((b) => { b.onclick = () => sumPick(b.dataset.id); });
}

/* ---- the map: Blue Marble, and the tracks as Wikipedia's maps draw them ----------------------------------------------------------------------------------------------------------------------------------------- */
const SUM_REGION = { atlantic: [-102, 6, -7, 59], eastpacific: [-165, -85, 0, 38], westpacific: [105, 180, 0, 52], nio: [42, 100, 0, 30], aus: [95, 172, -36, -4], swio: [32, 100, -38, -2], spac: [160, 236, -36, -2], satl: [-60, 14, -40, -8], med: [-8, 40, 30, 46] };       // (the region a basin's season is usually seen in; it grows to hold every track)
function sumRegion(D) {
  const d = SUM_REGION[STORM_BASIN] || [ST_LON0, ST_LON1, ST_LAT0, ST_LAT1], [BL, BR, BB, BT] = DATA.bmBox;
  let L = d[0], R = d[1], B = d[2], T = d[3];
  for (const x of D.list) for (const r of x.trk) { L = Math.min(L, r[2] - 4); R = Math.max(R, r[2] + 4); B = Math.min(B, r[1] - 4); T = Math.max(T, r[1] + 4); }
  L = Math.max(L, BL); R = Math.min(R, BR); B = Math.max(B, BB); T = Math.min(T, BT);
  let w = R - L, h = T - B;
  if (w / h < 1.3) { const nw = 1.3 * h, e = (nw - w) / 2; L -= e; R += e; } else if (w / h > 2.1) { const nh = w / 2.1, e = (nh - h) / 2; B -= e; T += e; }
  if (L < BL) { R += BL - L; L = BL; } if (R > BR) { L -= R - BR; R = BR; } if (B < BB) { T += BB - B; B = BB; } if (T > BT) { B -= T - BT; T = BT; }
  return { L: Math.max(L, BL), R: Math.min(R, BR), B: Math.max(B, BB), T: Math.min(T, BT) };
}
function sumDrawMap(D) {
  const cv = $('sum-map'), W = Math.max(280, Math.round(cv.clientWidth) || 900), reg = sumRegion(D), aspect = (reg.R - reg.L) / (reg.T - reg.B), H = Math.round(W / aspect);
  if (cv.width !== Math.round(W * DPR) || cv.height !== Math.round(H * DPR)) { cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); }
  cv.style.height = H + 'px';
  const g = cv.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H); g.fillStyle = '#0b1b2f'; g.fillRect(0, 0, W, H);
  const [BL, BR, BB, BT] = DATA.bmBox, iw = bmImg.naturalWidth || DATA.bmSize[0], ih = bmImg.naturalHeight || DATA.bmSize[1];
  if (bmReady || bmImg.complete) { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(bmImg, (reg.L - BL) / (BR - BL) * iw, (BT - reg.T) / (BT - BB) * ih, (reg.R - reg.L) / (BR - BL) * iw, (reg.T - reg.B) / (BT - BB) * ih, 0, 0, W, H); }
  const X = (lon) => (lon - reg.L) / (reg.R - reg.L) * W, Y = (lat) => (reg.T - lat) / (reg.T - reg.B) * H, r = Math.max(2.2, W / 380), lw = Math.max(0.9, W / 1000);
  sumHits.map = [];
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const x of D.list) {
    const rows = x.trk; if (!rows.length) continue;
    g.strokeStyle = '#ffffff'; g.lineWidth = lw; g.beginPath(); rows.forEach((q, i) => { const px = X(q[2]), py = Y(q[1]); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.stroke();
  }
  for (const x of D.list) for (const q of x.trk) {
    const px = X(q[2]), py = Y(q[1]), k = q[5], sh = k === 0 ? 'circle' : k === 1 ? 'square' : 'triangle', rr = sh === 'circle' ? r : sh === 'square' ? r * 0.88 : r * 0.8;
    stormShape(g, sh, px, py, rr, wikiColor({ v: q[3] }), null, 0); sumHits.map.push({ x: px, y: py, x0: x, q });
  }
  $('sum-key').innerHTML = WIKI_COLS.map((c, i) => '<span><i style="background:' + c + '"></i>' + ['Tropical depression', 'Tropical storm', 'Category 1', 'Category 2', 'Category 3', 'Category 4', 'Category 5'][i] + ' <small>' + (i === 0 ? '≤38' : SUM_SSHWS_MPH[i] + (i === 6 ? '+' : '–' + (SUM_SSHWS_MPH[i + 1] - 1))) + ' mph</small></span>').join('')
    + '<span><i class="sq" style="background:#cfd6e2"></i>subtropical</span><span><i class="tri" style="background:#cfd6e2"></i>extratropical, remnant low, disturbance</span>';
}

/* ---- the overview: every storm in time, in the look of Wikipedia's timeline pictures ------------------------------------------------------------------------------------------------------------------------ */
function sumDrawTimeline(D) {
  const cv = $('sum-tl'), T = D.tl, CL = D.CL;
  if (!T) { cv.style.display = 'none'; return; } cv.style.display = '';
  const W = TL.W, cssW = Math.max(300, Math.round(cv.clientWidth) || 900), k = cssW / W, nrow = Math.ceil(CL.length / 3);
  const axisY = TL.T + T.rows * TL.ROW + 15, legY = axisY + 24, H = legY + nrow * 17 + 30;
  sumTlGeo = { W, L: TL.L, R: TL.R, T: TL.T, ROW: TL.ROW, BAR: TL.BAR, axisY, legY, nrow, H, caption: sumScaleName() + ' classification \u00b7 ' + SCALE.avg };
  if (cv.width !== Math.round(cssW * DPR) || cv.height !== Math.round(H * k * DPR)) { cv.width = Math.round(cssW * DPR); cv.height = Math.round(H * k * DPR); }
  cv.style.height = Math.round(H * k) + 'px';
  const g = cv.getContext('2d'); g.setTransform(DPR * k, 0, 0, DPR * k, 0, 0); g.fillStyle = '#e0e0e0'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#000000'; g.lineWidth = 1.2;
  for (const m of T.P.months.concat([{ h0: T.P.h1 }])) { const x = Math.round(T.X(m.h0)) + 0.5; g.beginPath(); g.moveTo(x, TL.T); g.lineTo(x, axisY + 4); g.stroke(); }          // the month lines run from the top to a tick under the axis
  g.lineWidth = 1.6; g.beginPath(); g.moveTo(TL.L, axisY); g.lineTo(W - TL.R, axisY); g.stroke();
  g.font = '400 ' + TL.FS + 'px ' + TL.FONT; g.fillStyle = '#000000'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  for (const m of T.P.months) g.fillText(MONTH_FULL[m.m], (T.X(m.h0) + T.X(m.h1)) / 2, axisY + 15);                  // the month's name under the axis, in the middle of its month
  sumHits.tl = []; g.textAlign = 'left';
  for (const x of T.items) {
    const y = TL.T + 4 + x.row * TL.ROW;
    for (const s of x.segs) { g.fillStyle = CL[s.c].color; g.fillRect(T.X(s.a), y, Math.max(1, T.X(s.b) - T.X(s.a)), TL.BAR); }
    g.fillStyle = '#000000'; g.fillText(x.text, x.x1 + 5, y + TL.BAR - 2);
    sumHits.tl.push({ x0: x.x0 * k, x1: x.xe * k, y0: (y - 1) * k, y1: (y + TL.BAR + 1) * k, x });
  }
  CL.forEach((c, i) => {                                             // the legend fills down its columns, three of them (EasyTimeline's own order)
    const cx = 30 + Math.floor(i / nrow) * 270, cy = legY + (i % nrow) * 17;
    g.fillStyle = c.color; g.fillRect(cx, cy, 13, 13); g.fillStyle = '#000000'; g.fillText(c.name + ' ' + sumRange(c), cx + 21, cy + 10.5);
  });
  g.textAlign = 'center'; g.fillText(sumTlGeo.caption, W / 2, H - 10);
}

/* ---- the wind of each storm on shared axes ------------------------------------------------------------------------------------------------------------------------------------------------------------------ */
function sumDrawSparks(D) {
  const box = $('sum-sparks'), L = D.list.filter((x) => x.trop.length), CL = D.CL;
  box.innerHTML = L.map((x) => '<button type="button" data-id="' + x.s.id + '"><span>' + x.label + ' · ' + x.mph + ' mph</span><canvas></canvas></button>').join('');
  let maxMph = 0, maxD = 0; for (const x of L) { maxMph = Math.max(maxMph, mphOf(x.s.peakV)); maxD = Math.max(maxD, (x.trop[x.trop.length - 1][0] - x.trop[0][0]) / 24); }
  const top = Math.max(60, Math.ceil(maxMph * 1.04 / 20) * 20), days = Math.max(2, Math.ceil(maxD));
  const btns = box.querySelectorAll('button');
  L.forEach((x, i) => {
    btns[i].onclick = () => sumPick(x.s.id);
    const cv = btns[i].querySelector('canvas'), w = Math.max(80, Math.round(cv.clientWidth) || 150), h = 58;
    cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR);
    const g = cv.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0);
    const px = (d) => 1 + (w - 2) * d / days, py = (v) => h - 2 - (h - 6) * v / top;
    g.strokeStyle = 'rgba(255,255,255,.13)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, w - 1, h - 1);
    g.setLineDash([2, 3]); for (const v of [39, 74]) { if (v < top) { g.beginPath(); g.moveTo(1, Math.round(py(v)) + 0.5); g.lineTo(w - 1, Math.round(py(v)) + 0.5); g.stroke(); } } g.setLineDash([]);
    const t0 = x.trop[0][0]; g.lineWidth = 2; g.lineJoin = 'round'; g.lineCap = 'round';
    for (let q = 1; q < x.trop.length; q++) { const a = x.trop[q - 1], b = x.trop[q]; g.strokeStyle = CL[HFStorms.classOf(STORM_BASIN, b[3], 'tc').idx].color; g.beginPath(); g.moveTo(px((a[0] - t0) / 24), py(mphOf(a[3]))); g.lineTo(px((b[0] - t0) / 24), py(mphOf(b[3]))); g.stroke(); }
    if (x.trop.length === 1) { g.fillStyle = CL[x.peak.i].color; g.beginPath(); g.arc(px(0), py(mphOf(x.trop[0][3])), 2, 0, 7); g.fill(); }
  });
  $('sum-sparkcap').textContent = L.length ? 'Shared axes: 0–' + top + ' mph, 0–' + days + ' days; the dashes are the tropical storm and hurricane limits (39 and 74 mph).' : '';
}

/* ---- the table -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- */
const sumDates = (x) => { if (x.s.tdHour < 0) return '–'; const d0 = simDate(x.s.tdHour), d1 = x.s.end != null ? simDate(x.s.end) : null; return MON[d0.getUTCMonth()] + ' ' + d0.getUTCDate() + ' – ' + (d1 ? (d1.getUTCMonth() === d0.getUTCMonth() ? '' : MON[d1.getUTCMonth()] + ' ') + d1.getUTCDate() : 'now'); };
const SUM_KEY = { n: (x) => x.s.depNum, t: (x) => x.s.tdHour, v: (x) => x.s.peakV, p: (x) => (x.s.peakV > 0 ? x.s.peakP : 9999), a: (x) => x.s.ace, l: (x) => x.lfs.length, d: (x) => (x.s.imp ? x.s.imp.d : 0), k: (x) => (x.s.imp ? x.s.imp.k : 0) };
function sumTable(D) {
  const tb = $('sum-table').querySelector('tbody'); tb.innerHTML = '';
  $('sum-empty').hidden = D.list.length > 0; $('sum-table').style.display = D.list.length ? '' : 'none';
  const f = SUM_KEY[sumSort.k], rows = D.list.slice().sort((a, b) => (f(a) - f(b)) * sumSort.dir || a.s.depNum - b.s.depNum);
  const ths = [...$('sum-table').querySelectorAll('th')], th0 = ths.find((th) => th.dataset.k === sumSort.k);
  ths.forEach((th) => { if (th === th0) th.setAttribute('aria-sort', sumSort.dir > 0 ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort'); });
  for (const x of rows) {
    const s = x.s, tr = document.createElement('tr'); if (x.live) tr.className = 'live'; tr.dataset.id = s.id;
    const ar = x.areas.map((a) => a.replace(/#.*$/, '')), arShort = ar.slice(0, 3).join(', ') + (ar.length > 3 ? ' +' + (ar.length - 3) : '');
    tr.innerHTML = '<td><i style="background:' + x.peak.color + '"></i><b>' + x.label + '</b></td><td>' + sumDates(x) + '</td><td class="cls" style="background:' + x.peak.color + ';color:' + inkOn(x.peak.color) + '">' + x.peak.long + '</td><td>' + x.mph + '</td><td>' + (s.peakV > 0 ? s.peakP : '–') + '</td><td>' + sumF1(s.ace) + '</td><td>' + (x.lfs.length || '–') + '</td><td class="areas" title="' + ar.join(', ') + '">' + (ar.length ? arShort : '–') + '</td><td>' + (s.imp && s.imp.d > 0 ? stormUsd(s.imp.d) : '–') + '</td><td>' + (s.imp && s.imp.k > 0 ? s.imp.k.toLocaleString('en-US') : '–') + '</td>';
    tr.onclick = () => sumPick(s.id);
    tb.appendChild(tr);
  }
}

/* ---- the wikitext: the timeline's code and the season effects table, as the season articles lay them out ---------------------------------------------------------------------------------------------------- */
const wiki2 = (n) => String(n).padStart(2, '0');
const wikiRgb = (hex) => 'rgb(' + hexRgb(hex).map((v) => +(v / 255).toFixed(2)).join(',') + ')';
const wikiDateRange = (a, b) => { const d0 = simDate(a), d1 = b == null ? null : simDate(b); if (!d1 || (d0.getUTCMonth() === d1.getUTCMonth() && d0.getUTCDate() === d1.getUTCDate())) return MONTH_FULL[d0.getUTCMonth()] + ' ' + d0.getUTCDate(); return MONTH_FULL[d0.getUTCMonth()] + ' ' + d0.getUTCDate() + ' – ' + (d1.getUTCMonth() === d0.getUTCMonth() ? '' : MONTH_FULL[d1.getUTCMonth()] + ' ') + d1.getUTCDate(); };
function wikiUsd(v) {
  if (!(v > 0)) return 'None';
  const t = (n, d) => String(+n.toFixed(d));
  if (v >= 1e12) return '$' + t(v / 1e12, 2) + ' trillion';
  if (v >= 1e9) return '$' + t(v / 1e9, v >= 1e10 ? 1 : 2) + ' billion';
  if (v >= 1e6) return '$' + t(v / 1e6, v >= 1e8 ? 0 : 1) + ' million';
  return '$' + (Math.round(v / 1000) * 1000).toLocaleString('en-US');
}
function sumWikiTitle(y) {
  const s = seasonLabel(y);
  return { atlantic: s + ' Atlantic hurricane season', eastpacific: s + ' Pacific hurricane season', westpacific: s + ' Pacific typhoon season', nio: s + ' North Indian Ocean cyclone season', aus: s + ' Australian region cyclone season', swio: s + ' South-West Indian Ocean cyclone season', spac: s + ' South Pacific cyclone season', satl: s + ' South Atlantic tropical cyclone season', med: s + ' Mediterranean tropical-like cyclone season' }[STORM_BASIN] || s + ' ' + BI.label + ' season';
}
const sumWikiName = (c) => (/^Category/.test(c.name) ? c.name : c.long);              // Tropical Depression, Tropical Storm, Category 1 ...
function sumWikiLegend(c, i, CL) {                                  // the legend line's text: EasyTimeline wants underscores for spaces and the limits written as Wikipedia writes them
  const lim = i === 0 ? '&lt;' + CL[1].lo : i === CL.length - 1 ? '&gt;=' + c.lo : c.lo + '-' + c.hi;
  return (sumWikiName(c) + ' = ' + lim + ' mph').replace(/ /g, '_');
}
function sumWikiTimeline(D) {
  const T = D.tl; if (!T) return '';
  const CL = D.CL, ids = CL.map((c) => c.short.replace(/[^A-Za-z0-9]/g, '')), P = T.P, ss = SCALE.major != null;
  const dstr = (h) => { const q = simDate(h); return wiki2(q.getUTCDate()) + '/' + wiki2(q.getUTCMonth() + 1) + '/' + q.getUTCFullYear(); }, H = 110 + T.rows * 14;
  const out = ['<timeline>', 'ImageSize = width:800 height:' + H, 'PlotArea  = top:10 bottom:80 right:20 left:20', 'Legend    = columns:3 left:30 top:58 columnwidth:270', 'AlignBars = early', '',
    'DateFormat = dd/mm/yyyy', 'Period     = from:' + dstr(P.h0) + ' till:' + dstr(P.h1), 'TimeAxis   = orientation:horizontal', 'ScaleMinor = grid:black unit:month increment:1 start:' + dstr(P.h0), '', 'Colors     =', '  id:canvas value:gray(0.88)', '  id:GP     value:red'];
  CL.forEach((c, i) => out.push('  id:' + ids[i] + ' value:' + wikiRgb(c.color) + ' legend:' + sumWikiLegend(c, i, CL)));
  out.push('', 'Backgroundcolors = canvas:canvas', '', 'BarData =', '  barset:Hurricane', '  bar:Month', '', 'PlotData=', '  barset:Hurricane width:11 align:left fontsize:S shift:(4,-4) anchor:till');
  const rows = []; for (let r = 0; r < T.rows; r++) rows.push(T.items.filter((x) => x.row === r));
  for (const row of rows) {
    for (const x of row) x.segs.forEach((s, i) => { const d0 = Math.floor(s.a / 24); out.push('  from:' + dstr(d0 * 24) + ' till:' + dstr(Math.max(d0 + 1, Math.ceil(s.b / 24)) * 24) + ' color:' + ids[s.c] + (i === x.segs.length - 1 ? ' text:"' + x.text + '"' : '')); });       // one line for every piece (whole days), the name on the last
    out.push('  barset:break');
  }
  out.push('  bar:Month width:15 align:center fontsize:S shift:(0,-20) anchor:middle color:canvas');
  for (const m of P.months) out.push('  from:' + dstr(m.h0) + ' till:' + dstr(m.h1) + ' text:' + MONTH_FULL[m.m]);
  out.push('', 'TextData =', '  pos:(570,30)', '  text:"(From the"', '  pos:(617,30)', ss ? '  text:"[[Saffir–Simpson scale]])"' : '  text:"' + sumScaleName() + ' scale)"', '</timeline>');
  return out.join('\n');
}
const wikiLink = (n) => { const t = n.replace(/#.*$/, ''), m = /^(.+?) \((.+)\)$/.exec(t); return m ? '[[' + m[1] + ', ' + m[2] + '|' + m[1] + ']]' : '[[' + t + ']]'; };          // [[Miami]], and [[Hamilton, Bermuda|Hamilton]] for a name with its country in brackets
function sumWikiTable(D) {
  const press = STORM_BASIN === 'atlantic' || STORM_BASIN === 'eastpacific' ? '[[Bar (unit)|mbar]]' : '[[Hectopascal|hPa]]', total = D.list.length;
  const out = ['{| class="wikitable plainrowheaders sortable" style="width:100%; text-align:center;"', '|-', '! scope="col" | Storm<br />name', '! scope="col" | Dates active', '! scope="col" | Storm category<br />at peak intensity', '! scope="col" | Max 1-min<br />wind<br />mph', '! scope="col" | Min.<br />{{abbr|press.|pressure}}<br />(' + press + ')', '! scope="col" | Areas affected', '! scope="col" | [[Tropical cyclone#Damage|Damage]]<br />([[United States dollar|USD]])', '! scope="col" | Deaths'];
  const cat = (c) => { const t = c.long; return t.charAt(0) + t.slice(1).toLowerCase(); };
  for (const x of D.list) {
    const s = x.s, d0 = s.tdHour >= 0 ? simDate(s.tdHour) : null, sortv = d0 ? d0.getUTCFullYear() + '-' + wiki2(d0.getUTCMonth() + 1) + '-' + wiki2(d0.getUTCDate()) : '';
    out.push('|-', '! scope="row" | ' + x.label, '| data-sort-value="' + sortv + '" | ' + (s.tdHour >= 0 ? wikiDateRange(s.tdHour, s.end) : '—'), '| style="background:' + x.peak.color + ';" | ' + cat(x.peak), '| ' + x.mph, '| ' + (s.peakV > 0 ? s.peakP : '—'), '| ' + (x.areas.length ? x.areas.map(wikiLink).join(', ') : 'None'), '| ' + wikiUsd(s.imp ? s.imp.d : 0), '| ' + (s.imp && s.imp.k > 0 ? s.imp.k.toLocaleString('en-US') : 'None'));
  }
  const L = D.list.filter((x) => x.s.peakV > 0), st = L.slice().sort((a, b) => b.s.peakV - a.s.peakV || a.s.peakP - b.s.peakP)[0], im = D.rec.imp, first = D.list.filter((x) => x.s.tdHour >= 0).sort((a, b) => a.s.tdHour - b.s.tdHour), lastEnd = D.list.reduce((m, x) => Math.max(m, x.s.end == null ? -1 : x.s.end), -1);
  if (total) out.push('|- class="sortbottom"', '! scope="row" | ' + total + ' system' + (total === 1 ? '' : 's'), '| ' + (first.length ? wikiDateRange(first[0].s.tdHour, lastEnd > 0 ? lastEnd : null) : ''), '| style="background:' + (st ? st.peak.color : '#ffffff') + ';" | ' + (st ? cat(st.peak) : ''), '| ' + (st ? st.mph : ''), '| ' + (st ? st.s.peakP : ''), '| ', '| ' + wikiUsd(im ? im.d : 0), '| ' + (im && im.k > 0 ? im.k.toLocaleString('en-US') : 'None'));
  out.push('|}');
  return out.join('\n');
}
function sumWikiAll(D) {
  const title = sumWikiTitle(D.rec.year);
  return '<!-- ' + title + ': made by the Hurricane Forecaster simulator; the winds are 1-minute sustained winds in mph. -->\n==Season summary==\n' + (sumWikiTimeline(D) || '<!-- no storm has formed yet -->') + '\n\n==Season effects==\n' + sumWikiTable(D) + '\n';
}

/* ---- the card ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ */
function openSummary(year) {
  if (!stormMgr) return;
  sumYear = year == null ? stormMgr.season.year : year; sumOpen = true;
  closeStormCard(); $('storm-tip').style.display = 'none';
  $('sum-card').hidden = false; $('se-sum').setAttribute('aria-expanded', 'true'); fillSummary();
}
function closeSummary() { sumOpen = false; sumGeo = null; sumRec = null; $('sum-card').hidden = true; $('sum-tip').style.display = 'none'; $('se-sum').setAttribute('aria-expanded', 'false'); }
function sumStep(dir) {
  const ys = stormMgr.seasonYears(), i = ys.indexOf(sumYear), j = i + dir;
  if (i >= 0 && j >= 0 && j < ys.length) { sumYear = ys[j]; $('sum-body').scrollTop = 0; fillSummary(); }
}
function seasonEnded() {
  const n = stormMgr.archive.length, e = stormMgr.archive[n - 1]; sumArch = n;
  stormSel = null; olSel = null; plainSel = null; ensPack = null; $('storm-card').hidden = true; $('aoi-card').hidden = true; stormHot = null; $('storm-tip').style.display = 'none'; stormsDirty = true;
  openSummary(e.year);
}
function fillSummary() {
  const rec = stormMgr && stormMgr.seasonRecord(sumYear); if (!rec) { closeSummary(); return; }
  sumAt = performance.now(); sumRec = rec;
  const ys = stormMgr.seasonYears(), i = ys.indexOf(rec.year);
  $('sum-prev').disabled = i <= 0; $('sum-next').disabled = i < 0 || i >= ys.length - 1;
  $('sum-title').textContent = sumWikiTitle(rec.year);
  $('sum-sub').textContent = (rec.current ? 'Season so far, to ' + sumDay(rec.year, rec.day) : rec.open ? 'Season over, a storm is still active' : 'Season complete') + (rec.from > 0 ? ' · counted from ' + sumDay(rec.year, rec.from) : '');
  const D = sumD = sumBuild(rec);
  sumTotals(D); sumDrawMap(D); sumDrawTimeline(D); drawSumGraph(rec); sumDrawSparks(D); sumTable(D);
  const w = sumWikiAll(D); if (w !== sumWikiMade) { sumWikiMade = w; $('sum-wiki').value = w; }
  $('sum-wikinote').textContent = '(' + sumWikiTitle(rec.year) + ')';
}
function sumPick(id) {                                              // a storm of the summary: the summary closes, the map flies to the storm and its card opens (only while its track still exists)
  const S = stormMgr.get(id); if (!S) return;
  closeSummary();
  const f = S.alive ? null : (S.fixes.find((q) => q.h === S.peakHour) || S.fixes[S.fixes.length - 1]), pos = f || { lat: S.lat, lon: S.lon };
  map.panTo([pos.lat, pos.lon]); openStormCard(S, f || HFStorms.makeFix(S, stormMgr.hour, S.ace), !f);
}
function drawSumGraph(rec) {
  const cv = $('sum-graph'), w = Math.max(240, Math.round(cv.clientWidth) || 460), h = 172;
  if (cv.width !== Math.round(w * DPR) || cv.height !== Math.round(h * DPR)) { cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR); }
  const g = cv.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, w, h);
  const L = 34, R = 10, T = 10, B = 20, pw = w - L - R, ph = h - T - B, nd = sumYearDays(rec.year);
  const cum = (a) => { let t = 0; return a.map((x) => (t += x)); };
  const mine = cum(rec.aceDaily), last = rec.current ? Math.min(nd - 1, rec.day) : nd - 1;
  const others = stormMgr.seasonYears().filter((y) => y !== rec.year).map((y) => ({ y, c: cum(stormMgr.seasonRecord(y).aceDaily), nd: sumYearDays(y) }));
  const A = SUM ? SUM.ace : null;
  let top = Math.max(mine[last] * 1.08, A ? A.p90[365] * 1.04 : 0, 40);
  for (const o of others) top = Math.max(top, o.c[o.nd - 1] * 1.08);
  top = sumNiceTop(top);
  const X = (d) => L + pw * d / (nd - 1), Y = (v) => T + ph * (1 - v / top);
  g.font = '11px system-ui, sans-serif'; g.textBaseline = 'middle';
  const step = [10, 20, 25, 50, 100, 200].find((q) => top / q <= 5.01) || 250;
  g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,.08)'; g.fillStyle = 'rgba(255,255,255,.5)'; g.textAlign = 'right';
  for (let v = 0; v <= top + 1e-9; v += step) { const y = Math.round(Y(v)) + 0.5; g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke(); g.fillText(String(v), L - 5, y); }
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const s0 = Date.UTC(rec.year, SM, 1), monthStart = (m) => Math.round((Date.UTC(rec.year + (SM + m >= 12 ? 1 : 0), (SM + m) % 12, 1) - s0) / 86400000);      // the season's 12 months, in order from its first
  for (let m = 0; m < 12; m++) {
    const d0 = monthStart(m), d1 = m < 11 ? monthStart(m + 1) : nd;
    if (m) { g.strokeStyle = 'rgba(255,255,255,.06)'; g.beginPath(); g.moveTo(Math.round(X(d0)) + 0.5, T); g.lineTo(Math.round(X(d0)) + 0.5, T + ph); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.5)'; g.fillText('JFMAMJJASOND'[(SM + m) % 12], X((d0 + d1) / 2), h - 6);
  }
  const band = (lo, hi, fill) => {                                   // a band between two real percentile curves
    g.beginPath(); for (let d = 0; d < nd; d++) { const x = X(d), y = Y(A[hi][Math.min(d, 365)]); if (d) g.lineTo(x, y); else g.moveTo(x, y); }
    for (let d = nd - 1; d >= 0; d--) g.lineTo(X(d), Y(A[lo][Math.min(d, 365)]));
    g.closePath(); g.fillStyle = fill; g.fill();
  };
  if (A) {
    band('p10', 'p90', 'rgba(127,166,255,.13)'); band('p25', 'p75', 'rgba(127,166,255,.22)');
    g.save(); g.setLineDash([4, 3]); g.lineWidth = 1.2; g.strokeStyle = 'rgba(190,210,255,.6)'; g.beginPath();
    for (let d = 0; d < nd; d++) { const x = X(d), y = Y(A.p50[Math.min(d, 365)]); if (d) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); g.restore();
  }
  g.lineJoin = 'round';
  for (const o of others) { g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,255,255,.3)'; g.beginPath(); for (let d = 0; d < o.nd; d++) { const x = X(Math.min(d, nd - 1) * (nd - 1) / (o.nd - 1)), y = Y(o.c[d]); if (d) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
  const from = Math.max(0, rec.from - 1);
  g.lineWidth = 2.4; g.strokeStyle = '#f2f2f2'; g.beginPath(); for (let d = from; d <= last; d++) { const x = X(d), y = Y(mine[d]); if (d > from) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
  const ex = X(last), ey = Y(mine[last]);
  g.beginPath(); g.arc(ex, ey, 3.6, 0, 7); g.fillStyle = '#f2f2f2'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = 'rgba(18,18,18,.9)'; g.stroke();
  if (rec.current) { g.save(); g.setLineDash([2, 3]); g.strokeStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(Math.round(ex) + 0.5, T); g.lineTo(Math.round(ex) + 0.5, T + ph); g.stroke(); g.restore(); }
  const lab = sumF1(mine[last]); g.font = '600 11.5px system-ui, sans-serif'; g.textAlign = ex > w - 46 ? 'right' : 'left'; g.textBaseline = 'middle';
  g.lineWidth = 3; g.strokeStyle = 'rgba(26,26,28,.9)'; g.strokeText(lab, ex + (ex > w - 46 ? -7 : 7), ey - 8); g.fillStyle = '#f2f2f2'; g.fillText(lab, ex + (ex > w - 46 ? -7 : 7), ey - 8);
  sumGeo = { w, h, L, T, pw, ph, top, nd, last, endX: ex, endY: ey, value: mine[last] };
  const med = A ? A.p50[Math.min(last, 365)] : null;
  $('sum-cap').textContent = A ? 'Real seasons ' + SUM.years[0] + '–' + SUM.years[1] + ': the middle 50 % and 80 % are shaded, the median dashed.' + (rec.current ? ' By ' + sumDay(rec.year, last) + ' the median season had ' + Math.round(med) + ' ACE (10th–90th percentile ' + Math.round(A.p10[Math.min(last, 365)]) + '–' + Math.round(A.p90[Math.min(last, 365)]) + ').' : ' The median season ends on ' + Math.round(A.p50[365]) + '.') : '';
}
const sumPiecesTest = (trk, end) => sumPiecesOf(trk.filter((r) => r[5] === 0 || r[5] === 1), end);                 // (the tests make a track with a gap in it)
function sumInfo() {                                                // what the card shows, as data (the browser tests read it through window.SSTSIM.summaryInfo)
  const D = sumD; if (!sumOpen || !D) return null;
  const T = D.tl, tx = (id) => $(id).textContent.replace(/\s+/g, ' ').trim();
  return {
    year: D.rec.year, current: !!D.rec.current, title: $('sum-title').textContent, classes: D.CL.map((c) => ({ short: c.short, name: c.name, long: c.long, color: c.color, lo: c.lo, hi: c.hi, range: sumRange(c) })),
    storms: D.list.map((x) => ({ id: x.s.id, label: x.label, tag: x.peak.short, peak: x.peak.i, color: x.peak.color, mph: x.mph, peakV: x.s.peakV, peakP: x.s.peakP, ace: x.s.ace, a: x.a, b: x.b, live: x.live, days: x.days, segs: x.segs.map((q) => ({ a: q.a, b: q.b, c: q.c })), lfs: x.lfs.length, areas: x.areas.slice(), npts: x.trk.length, row: x.row == null ? -1 : x.row, x0: x.x0, x1: x.x1, xe: x.xe, dmg: x.s.imp ? x.s.imp.d : 0, dead: x.s.imp ? x.s.imp.k : 0 })),
    hl: sumHighlights(D).map((h) => ({ k: h.k, label: h.x.label, v: h.v })),
    tot: [...$('sum-tot').children].map((e) => e.textContent), tot2: [...$('sum-tot2').children].map((e) => e.textContent), imp: $('sum-imp').hidden ? '' : tx('sum-imp'),
    tl: T ? Object.assign({ rows: T.rows, months: T.P.months.map((m) => MONTH_FULL[m.m]), monthStarts: T.P.months.map((m) => m.h0), h0: T.P.h0, h1: T.P.h1, hits: sumHits.tl.length }, sumTlGeo) : null,
    map: { pts: sumHits.map.length, region: sumRegion(D), w: $('sum-map').clientWidth, h: $('sum-map').clientHeight },
    sparks: $('sum-sparks').children.length, key: tx('sum-key'), sparkcap: tx('sum-sparkcap'), cap: tx('sum-cap'),
    rows: [...$('sum-table').querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent)), heads: [...$('sum-table').querySelectorAll('th')].map((th) => th.textContent),
    wiki: $('sum-wiki').value, wikiTable: sumWikiTable(D), wikiTimeline: sumWikiTimeline(D),
  };
}
/* hovers on the map and the overview, the saved pictures, the copied wikitext, the sorting of the table */
function sumTip(ev, html, wrap) {
  const tip = $('sum-tip'), card = $('sum-card').getBoundingClientRect();
  if (!html) { tip.style.display = 'none'; return; }
  tip.innerHTML = html; tip.style.display = 'block';
  let x = ev.clientX - card.left + 14, y = ev.clientY - card.top + 14; if (x + tip.offsetWidth > card.width - 6) x = ev.clientX - card.left - tip.offsetWidth - 10; if (y + tip.offsetHeight > card.height - 6) y = ev.clientY - card.top - tip.offsetHeight - 10;
  tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px'; void wrap;
}
const sumStormTip = (x, extra) => '<b>' + x.label + '</b> · ' + x.peak.long + '<br>' + x.mph + ' mph · ' + (x.s.peakV > 0 ? x.s.peakP + ' hPa' : '') + '<br>' + sumDates(x) + (extra ? '<br>' + extra : '');
$('sum-map').addEventListener('pointermove', (ev) => {
  const r = $('sum-map').getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top; let best = null, bd = 10;
  for (const h of sumHits.map) { const d = Math.hypot(h.x - px, h.y - py); if (d < bd) { bd = d; best = h; } }
  if (!best) { sumTip(ev, ''); $('sum-map').style.cursor = ''; return; }
  const q = best.q, c = sumClassOf(q[3]);
  sumTip(ev, sumStormTip(best.x0, MON[simDate(q[0]).getUTCMonth()] + ' ' + simDate(q[0]).getUTCDate() + ', ' + wiki2(simDate(q[0]).getUTCHours()) + 'Z: ' + Math.round(mphOf(q[3])) + ' mph (' + c.name + ')')); $('sum-map').style.cursor = 'pointer';
});
$('sum-map').addEventListener('pointerleave', () => sumTip(null, ''));
$('sum-map').addEventListener('click', (ev) => { const r = $('sum-map').getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top; let best = null, bd = 10; for (const h of sumHits.map) { const d = Math.hypot(h.x - px, h.y - py); if (d < bd) { bd = d; best = h; } } if (best) sumPick(best.x0.s.id); });
$('sum-tl').addEventListener('pointermove', (ev) => {
  const r = $('sum-tl').getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top, h = sumHits.tl.find((q) => px >= q.x0 && px <= q.x1 && py >= q.y0 && py <= q.y1);
  sumTip(ev, h ? sumStormTip(h.x, h.x.lfs.length ? h.x.lfs.length + ' landfall' + (h.x.lfs.length > 1 ? 's' : '') : '') : ''); $('sum-tl').style.cursor = h ? 'pointer' : '';
});
$('sum-tl').addEventListener('pointerleave', () => sumTip(null, ''));
$('sum-tl').addEventListener('click', (ev) => { const r = $('sum-tl').getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top, h = sumHits.tl.find((q) => px >= q.x0 && px <= q.x1 && py >= q.y0 && py <= q.y1); if (h) sumPick(h.x.s.id); });
document.querySelectorAll('.sum-save').forEach((b) => {
  b.onclick = () => { const cv = $(b.dataset.for); cv.toBlob((blob) => { if (!blob) return; const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (BI.label + ' ' + seasonLabel(sumYear) + (b.dataset.for === 'sum-map' ? ' season map' : ' season overview')).replace(/\s+/g, '-') + '.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }); };
});
function sumCopy(text) {
  const done = () => { const e = $('sum-copied'); e.textContent = 'Copied'; clearTimeout(sumCopy.t); sumCopy.t = setTimeout(() => { e.textContent = ''; }, 2200); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => { sumCopyOld(text); done(); }); else { sumCopyOld(text); done(); }
}
function sumCopyOld(text) { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { /* no clipboard */ } ta.remove(); }
$('sum-copy').onclick = () => sumCopy($('sum-wiki').value);
$('sum-copy-t').onclick = () => { if (sumD) sumCopy(sumWikiTable(sumD)); };
$('sum-copy-l').onclick = () => { if (sumD) sumCopy(sumWikiTimeline(sumD)); };
$('sum-table').querySelectorAll('th[data-k]').forEach((th) => { th.onclick = () => { const k = th.dataset.k; if (sumSort.k === k) sumSort.dir = -sumSort.dir; else sumSort = { k, dir: k === 'n' || k === 't' || k === 'p' ? 1 : -1 }; if (sumD) sumTable(sumD); }; });
window.addEventListener('resize', () => { if (sumOpen && sumD) { sumDrawMap(sumD); sumDrawTimeline(sumD); drawSumGraph(sumRec); sumDrawSparks(sumD); } });
$('se-sum').onclick = () => { if (sumOpen) closeSummary(); else openSummary(); };
$('sum-close').onclick = closeSummary;
$('sum-prev').onclick = () => sumStep(-1); $('sum-next').onclick = () => sumStep(1);
/* ==== STORM SUMMARY END ==== */
