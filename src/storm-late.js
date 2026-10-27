/* ==== STORM LATE: everything the storms add to the page after its own controls are wired (src/storm-late.js, the same file in every basin's page) ==== */
/* the storm controls */
$('b-place').onclick = () => placeSet(!placeMode);
document.querySelectorAll('#place-menu button').forEach((b) => { b.onclick = () => { placeKind = b.dataset.kind; document.querySelectorAll('#place-menu button').forEach((x) => x.setAttribute('aria-checked', x === b ? 'true' : 'false')); placeRefresh(); }; });
$('stwaves').onchange = $('stlows').onchange = $('stdist').onchange = $('stlabels').onchange = $('stdens').onchange = $('stcone').onchange = $('stwf').onchange = () => { stormsDirty = true; drawStorms(); };
$('stww').onchange = () => { wwPack = null; stormsDirty = true; drawStorms(); };
$('stens').onchange = () => { $('stdens').disabled = !$('stens').checked; ensPack = null; ensHot = -1; stormsDirty = true; drawStorms(); };
$('st-auto').onchange = () => { stormAuto = $('st-auto').checked; if (stormMgr) stormMgr.auto = stormAuto; markDirty(); };
$('p-stact').oninput = () => { stormActivity = parseFloat($('p-stact').value); $('p-stact-o').textContent = stormActivity.toFixed(1) + '×'; if (stormMgr) stormMgr.autoRate = stormActivity; markDirty(); };
$('sc-close').onclick = closeStormCard; $('ac-close').onclick = closeStormCard;
flBind();                                                         // the radar floater: its buttons, the playback buttons while it is open
/* the layer buttons: each is the face of one or two of the checkboxes in the panel (kept there, hidden), so everything that reads or sets those checkboxes still works */
const LYR = { stens: ['stens'], stcone: ['stcone'], stdens: ['stdens'], stwf: ['stwf'], stww: ['stww'], jetline: ['jetline'], hl: ['highs', 'stlows'], nhc: ['stwaves', 'stdist'], steer: ['steerarrows'] };
function lyrSync() {
  document.querySelectorAll('#lyr-dock .lyr').forEach((b) => { const ids = LYR[b.dataset.l]; b.setAttribute('aria-pressed', ids.every((id) => $(id).checked) ? 'true' : 'false'); b.disabled = ids.some((id) => $(id).disabled); });
  const jn = $('jet-note'); if (jn) $('lyr-dock').querySelector('[data-l="jetline"]').title = 'The jet stream: the axis of strongest shear' + (jn.textContent ? ' ' + jn.textContent.trim() : '');
}
document.querySelectorAll('#lyr-dock .lyr').forEach((b) => {
  const ids = LYR[b.dataset.l];
  ids.forEach((id) => { const el = $(id); if (!el) return; el.closest('label').classList.add('lyr-src'); el.addEventListener('change', () => setTimeout(lyrSync, 0)); });
  b.onclick = () => { const on = !ids.every((id) => $(id).checked); ids.forEach((id) => { const el = $(id); if (el.checked !== on) el.click(); }); lyrSync(); };
});
lyrSync();
window.addEventListener('keydown', (e) => {                                      // the storm keys (the page's own handler has the clock's)
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
  if (e.key === 'Escape') { if (placeMode) placeSet(false); else if (!$('storm-card').hidden || !$('aoi-card').hidden || plainSel) closeStormCard(); else if (sumOpen) closeSummary(); }
  else if (e.key === 'p' || e.key === 'P') placeSet(!placeMode);
});

/* ---- save / resume -------------------------------------------------------------------------------------------------------------------------
   A season in progress is kept in localStorage as one JSON text (a few hundred KB): the weather (simCaptureLight(): the generators' states and the
   clocks), the storms as plain JSON (positions, intensities, every fix, ACE, the season counters and the finished seasons) and what the controls say.
   It is written synchronously, so it also lands while the page is being closed (an IndexedDB write started then is cut off: measured, 0-2 of 8
   arrived), every few seconds while the clock runs, a moment after a change while it is paused, when the page is hidden and before the Menu link
   navigates. A few bytes of metadata next to it let the main menu offer "Continue" without parsing the season. `?resume=1` restores it, paused. The
   engine takes fresh keyframes of the fields and the steering at the restored hour, so the storms are exactly where they were and the weather around
   them goes on from the same generators; the one thing a resume does not reproduce is the age of the keyframes the next hours would have used
   (up to a day for the daily fields), which is why a season saved at midnight continues bit for bit and one saved at 17Z only statistically.
   A page opened directly (a bookmark of the simulator, the built file) beside a saved season it did not resume leaves that season alone: it does not
   save its own new one until Restart (an explicit new start) or Start in the menu has replaced the old save. Same browser only (nothing leaves the machine). */
const SAVE_V = 1, SAVE_KEY = 'hf-save', SAVE_META = 'hf-save-meta', SAVE_EVERY_MS = [8000, 1200];   // while the clock runs, and while it is paused (after a change)
const RESUME = /[?&]resume=1(?:&|$)/.test(location.search);
function captureSave() {
  return {
    v: SAVE_V, sv: HFStorms.VERSION, basin: BI.menu, savedAt: Date.now(), startMs: START_MS, n: N, sn: SN,
    weather: simCaptureLight(), storms: JSON.stringify(stormMgr.serialize()),
    kf0: simHour === kfHour && kfHour0 > -1e8 ? { h: kfHour0, u: kfU0.map((a) => f32b64(a)), v: kfV0.map((a) => f32b64(a)) } : null,        // saved on a keyframe hour: the keyframe before it too, so the steering the engine carries forward is the same one after the resume
    ui: { seed: P.seed, P: Object.assign({}, P), sliders: Object.fromEntries(sliders.map(([id]) => [id, $(id).value])), seedVary: $('seed-vary').checked,
      ensoHold, ensoHeld, ensoNow: $('p-ensonow').value, activity: stormActivity, auto: stormAuto, speedIdx },
  };
}
function saveMeta(s) {
  const st = stormMgr.stats(), d = simDate(simHour);
  return { v: SAVE_V, basin: BI.menu, name: BI.label, year: st.year, season: seasonLabel(st.year), hour: simHour, date: MON[d.getUTCMonth()] + ' ' + d.getUTCDate(), dep: st.dep, named: st.named, hurr: st.hurr, word: BI.hurricane, major: st.major, ace: st.ace, savedAt: s.savedAt };
}
function saveNow() {
  if (!saveOwner || !stormsOn || !stormMgr || simHour < 24) return false;        // a season nobody has played for a day is not worth a Continue card
  const stamp = saveStamp;
  try {
    const s = captureSave();
    localStorage.setItem(SAVE_KEY, JSON.stringify(s)); localStorage.setItem(SAVE_META, JSON.stringify(saveMeta(s)));
    savedStamp = stamp; saveLast = performance.now(); return true;
  } catch (e) { return false; }                                                    // storage full or blocked: the previous save stays
}
function saveTick() { if (saveStamp !== savedStamp && performance.now() - saveLast >= SAVE_EVERY_MS[playing ? 0 : 1]) saveNow(); }
function deleteSave() { try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(SAVE_META); } catch (e) { /* storage blocked */ } savedStamp = saveStamp; }
function loadSave() { try { const t = localStorage.getItem(SAVE_KEY); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
function hasSaveMeta() { try { return !!localStorage.getItem(SAVE_META); } catch (e) { return false; } }          // storage that refuses access (blocked site data) is a page with nothing saved, not a page that cannot start
function applySave(s) {
  if (!s || s.v !== SAVE_V || s.sv !== HFStorms.VERSION || s.n !== N || s.sn !== SN || s.basin !== BI.menu) throw new Error('this save belongs to another version');
  START_MS = s.startMs; START_YEAR = new Date(START_MS).getUTCFullYear(); saveOwner = true;
  const u = s.ui;
  Object.assign(P, u.P); sliders.forEach(([id, key, fmt]) => { $(id).value = P[key]; $(id + '-o').textContent = fmt(P[key]); });   // the model's values are the truth, the controls follow
  $('seed').value = u.seed; $('seed-vary').checked = u.seedVary;
  ensoHold = u.ensoHold; ensoHeld = u.ensoHeld; $('enso-hold').checked = ensoHold; $('p-ensonow').value = u.ensoNow;
  stormActivity = u.activity; stormAuto = u.auto; $('st-auto').checked = stormAuto; $('p-stact').value = stormActivity; $('p-stact-o').textContent = stormActivity.toFixed(1) + '×';
  speedIdx = u.speedIdx; updateSpeedUI();
  initSim(P.seed);                                                                // the static structure of this seed (waves, jet modes ...) and a throw-away new season
  simRestoreLight(s.weather);
  stormMgr = HFStorms.restore(JSON.parse(s.storms), { maps: stormMapsNow() }); stormCitiesBind();
  stormLab = null; shadow = null; stormSel = null; olSel = null; plainSel = null; ensPack = null; coneMem = null; wwPack = null; wwCones = {}; ensHot = -1; $('aoi-card').hidden = true; stormHot = null; stormHits = []; olHeld = null; olEagerSlot = -1e9; olHits = []; stormsDirty = true; sumArch = stormMgr.archive.length; if (sumOpen) closeSummary();
  lowsStamp = -1; kfBreak = true; stormKeyframe(true); stormFieldsDirty = false;      // fresh keyframes of the steering and the fields at the restored hour
  if (s.kf0 && simHour === kfHour) { for (let i = 0; i < 3; i++) { b64f32(s.kf0.u[i], kfU0[i]); b64f32(s.kf0.v[i], kfV0[i]); } kfHour0 = s.kf0.h; wkHour = -1e9; stormEnv.beginHour(simHour); }
  seasonText = ''; acc = 0; lastClock = ''; updateClock(); updateSeasonBar(); refresh();
  savedStamp = saveStamp;                                                          // what was just loaded is what is on disk
}
function resumeFromSave() {
  try {
    const s = loadSave();
    if (!s) { document.body.dataset.resume = 'none'; toast('There is no saved season to continue, so a new one has started.'); return false; }
    applySave(s);
    const d = simDate(simHour); document.body.dataset.resume = 'ok';
    toast('Welcome back: ' + BI.label + ' ' + seasonLabel(stormMgr.season.year) + ', ' + MON[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + String(d.getUTCHours()).padStart(2, '0') + 'Z. The clock is paused; press play to go on.');
    return true;
  } catch (e) {
    document.body.dataset.resume = 'refused';
    toast('The saved season could not be resumed (it may come from another version), so a new one has started.');
    applySeed(1 + Math.floor(Math.random() * 999999));                             // a clean start (this also removes the unusable save)
    return false;
  }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveStamp !== savedStamp) saveNow(); });
window.addEventListener('pagehide', () => { if (saveStamp !== savedStamp) saveNow(); });
$('b-menu').addEventListener('click', () => { if (saveStamp !== savedStamp) saveNow(); });   // the link itself does the navigating

/* the storm half of window.SSTSIM (the tests, the calibration lab and the fitting tools drive the page through it) */
const STORM_API = {
  storms(on) { return on === undefined ? stormsOn : stormsSwitch(on); }, stormsForce(on) { return stormsSwitch(on, true); },      // (the lab and the region dump of a page whose climatology is not made yet)
  stormState() { return stormMgr ? { on: stormsOn, hour: stormMgr.hour, stats: stormMgr.stats(), lows: stormMgr.lows.tracks.filter((t) => t.alive).length, seeds: Object.assign({}, stormMgr.n), systems: stormMgr.systems.map((S) => ({ id: S.id, name: S.name, th: S.th, st: HFStorms.statusOf(S), lat: S.lat, lon: S.lon, v: S.v, vr: S.vr, p: S.p, alive: S.alive, depNum: S.depNum, peakV: S.peakV, ace: S.ace, fixes: S.fixes.length, end: S.endReason, origin: S.origin, invest: S.invest })) } : null; },
  stormJSON() { const o = stormMgr.serialize(); delete o.olMem; return JSON.stringify(o); },           // the storms (without what the outlook remembers of its last issue: that depends on which issues were made, the page's speed among it)
  stormLabStart(sets, opts) { stormLab = sets.map((p) => { const m = HFStorms.create({ seed: stormSeed(), startMs: START_MS, hour0: simHour, auto: true, autoRate: stormActivity, params: p, maps: stormMapsNow(), basin: STORM_BASIN }); if (opts && opts.diag) m.enableDiag(); return m; }); return stormLab.length; },
  stormLabCalendar(month, day) { START_MS = Date.UTC(START_YEAR, month, day || 1, 0, 0, 0); return START_MS; },   // the calibration lab starts a basin's whole season on its first day (call it before applySeed, which starts the clock): the page itself starts where its template says
  stormMaps(raw) { stormMapsOverride = raw || null; return !!stormMapsNow(); }, stormMapsKeys() { const m = stormMapsNow(); return m ? Object.keys(m) : null; },
  stormClimStart(grid, R) {
    const n = grid.nx * grid.ny, lat = new Float64Array(n), lon = new Float64Array(n);
    for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) { lat[j * grid.nx + i] = grid.lat0 + j * grid.res; lon[j * grid.nx + i] = grid.lon0 + i * grid.res; }
    stormClim = { n, lat, lon, R, steer: new Float64Array(12 * n * 6), ns: new Float64Array(12 * n), sst: new Float64Array(12 * n), rh: new Float64Array(12 * n), shear: new Float64Array(12 * n), rel: new Float64Array(12 * n), ne: new Float64Array(12 * n) };
    return n;
  },
  stormClimGet() { const C = stormClim; stormClim = null; return C ? { n: C.n, steer: Array.from(C.steer), ns: Array.from(C.ns), sst: Array.from(C.sst), rh: Array.from(C.rh), shear: Array.from(C.shear), rel: Array.from(C.rel), ne: Array.from(C.ne) } : null; },
  saveNow, deleteSave, loadSave() { const t = localStorage.getItem(SAVE_KEY), s = t && JSON.parse(t); return s ? { v: s.v, startMs: s.startMs, bytes: t.length, weatherBytes: JSON.stringify(s.weather).length, stormBytes: s.storms.length } : null; },
  saveInfo() { return { stamp: saveStamp, saved: savedStamp, owner: saveOwner, meta: localStorage.getItem(SAVE_META) }; },
  snapSave() { window.__save = JSON.stringify(captureSave()); return window.__save.length; }, snapLoad() { applySave(JSON.parse(window.__save)); return true; }, saveTick() { saveLast = -1e9; saveTick(); },
  stormRecord(year) { return stormMgr ? stormMgr.seasonRecord(year == null ? stormMgr.season.year : year) : null; },
  summary(on, year) { if (on === undefined) return { open: sumOpen, year: sumYear, geo: sumGeo }; if (on) openSummary(year); else closeSummary(); return sumOpen; },
  place(on, kind) { if (kind) { placeKind = kind; document.querySelectorAll('#place-menu button').forEach((x) => x.setAttribute('aria-checked', x.dataset.kind === kind ? 'true' : 'false')); } return on === undefined ? placeMode : placeSet(on); },
  placeAt(lat, lon) { placeAtLL = { lat, lng: lon }; if (!shadow) shadowBuild(); placePrev = stormMgr.forecast({ kind: placeKind, lat, lon }, { at: shadowEnv }, 7 * 24); stormsDirty = true; drawStorms(); return placePrev; },
  placePx(lat, lon) { const p = map.latLngToContainerPoint([lat, lon]); return { x: p.x, y: p.y }; },
  shadowBuild() { const t = performance.now(); shadowBuild(); return { ms: performance.now() - t, t0: shadow.t0, nk: shadow.nk, nf: shadow.nf }; },
  placePreview() { return placePrev; }, placeLabel() { return placeSummary(placePrev); },
  shadowInfo() { return shadow ? { t0: shadow.t0, nk: shadow.nk, nf: shadow.nf } : null; },
  simCapture() { window.__snap = { weather: simCapture(), storms: stormMgr ? JSON.stringify(stormMgr.serialize()) : null }; return true; },
  simRestore() { const s = window.__snap; simRestore(s.weather); if (s.storms) { stormMgr = HFStorms.restore(JSON.parse(s.storms), { maps: stormMapsNow() }); stormCitiesBind(); stormFieldsDirty = true; kfFieldHour = -1; } return true; },
  stormLabRecord() { return stormLab ? stormLab.map(labRecord) : []; },
  stormLabStop() { stormLab = null; },
  playingNow() { return playing; },                                       // whether the main clock is running (the radar floater stops it while it is open)
  floaterOpen(id) { return flOpen(id); }, floaterClose() { flClose(); return !flOn; },
  floaterState() {                                                      // what the radar floater is doing (tests and tools)
    if (!flOn || !flNest) return { on: false };
    const n = flNest, f = n.cur || n.f0; let rmax = 0, dmax = -99, cells = 0; for (let k = 0; k < n.rc.length; k++) { if (n.rc[k] > rmax) rmax = n.rc[k]; const d = HFNest.dbzOf(n.rc[k], n.rs[k]); if (d > dmax) dmax = d; if (d > 20) cells++; }
    return { on: true, id: flId, spin: flSpinN / FL_SPIN, speed: flSpeed, rate: FL_SPEEDS[flSpeed], play: flPlay, minutes: flMinutes(), t: n.t, steps: n.steps, site: flSite ? flSite.name : null, tilt: flTilt, product: flProd, gone: flGone, g: n.g, vNest: n.vNest * n.m, vTarget: f.vmax * n.m, scale: n.m, cellKm: 2 * n.m, view: flView, tbMin: flTbMin, acc: flAcc, gone: flGone, rcMax: rmax, dbzMax: dmax, cells, clat: f.clat, clon: f.clon, hour: simHour, utc: n.f0 && n.f0.utc != null ? n.f0.utc : null, strip: n.strip, bursts: n.bs.filter((b) => b.t >= 0).length, eyeFill: n.ef, sites: flSites.map((c) => c.name), text: $('fl-time').textContent, sub: $('fl-sub').textContent };
  },
  floaterSet(o) { if (o.speed != null) { flSpeed = Math.max(0, Math.min(FL_SPEEDS.length - 1, o.speed)); flSpeedUI(); } if (o.play != null) { flPlay = !!o.play; flSetPlayUI(); } if (o.site !== undefined) { $('fl-site').value = o.site == null ? '' : String(o.site); $('fl-site').onchange(); } if (o.tilt != null) { $('fl-tilt').value = String(o.tilt); $('fl-tilt').onchange(); } if (o.product) { $('fl-prod').value = o.product; $('fl-prod').onchange(); } if (o.view) { $('fl-view').value = o.view; $('fl-view').onchange(); } flDirty = true; return true; },
  floaterCoast() {                                                                                      // tests: the outline of the land as it is drawn on a blank canvas (white core pixels, dark edge pixels)
    if (!flOn) return null; const c = document.createElement('canvas'); c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); const g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); flCoast(g);
    const d = g.getImageData(0, 0, c.width, c.height).data; let core = 0, edge = 0; for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; if (a > 200 && d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) core++; else if (a > 40 && a < 200 && d[i] < 40 && d[i + 1] < 40 && d[i + 2] < 40) edge++; } return { core, edge };
  },
  floaterEnv(o) { flEnvTest = o && typeof o === 'object' ? o : null; return flEnvTest; },                                    // tests: the next floater opens in a chosen environment ({ shear (kt), rh (%), sst (C) }, any of them), until it closes
  floaterLag(ms) { if (flOn) flLast = performance.now() + ms; return flOn; },                                         // tests: the next frame looks `ms` older than the last one (as after a long blocking call)
  floaterRun(sec) { if (!flOn) return 0; while (flSpinN < FL_SPIN) flSpin(1e9); const n = flWork(sec, 1e9); flRender(); stormsDirty = true; return n; },                      // synchronous: run the floater's clock `sec` seconds (the frame loop does the same a little at a time)
  floaterProfile() { if (!flOn || !flNest) return null; while (flSpinN < FL_SPIN) flSpin(1e9); const m = (fn, k) => { const t0 = performance.now(); for (let i = 0; i < k; i++) fn(); return (performance.now() - t0) / k; }; return { step: m(() => flNest.step(FL_DT), 6), land: m(flLandUpdate, 3), env: m(flEnvUpdate, 3), render: (m(flRender, 2), m(flRender, 10)), prof: flProf.map((x) => Math.round(x * 10) / 10), display: m(() => flNest.display(0.5), 4) }; },
  floaterGrid() { return flNest ? { dbz: Array.from(flDbz || []), n: HFNest.N } : null; },
  floaterPos() { const S = flSystem(); const p = S ? flPos(S) : null; return p; },
  stormPlace(spec) { const S = stormMgr.place(spec); stormsDirty = true; drawStorms(); markDirty(); return S.id; },
  stormForce(id, patch) { const S = stormMgr.get(id); if (!S) return false; Object.assign(S, patch); stormsDirty = true; drawStorms(); return true; },
  stormAuto(on) { stormAuto = !!on; if (stormMgr) stormMgr.auto = stormAuto; },
  stormPx(id) { const S = stormMgr.get(id); if (!S) return null; const p = map.latLngToContainerPoint([S.lat, S.lon]); return { x: p.x, y: p.y }; },
  stormFixPx(id, i) { const S = stormMgr.get(id); const f = S && S.fixes[i < 0 ? S.fixes.length + i : i]; if (!f) return null; const p = map.latLngToContainerPoint([f.lat, f.lon]); return { x: p.x, y: p.y, h: f.h, th: f.th }; },
  stormDraw() { drawStorms(); }, stormDrawn() { return Array.from(new Set(stormHits.filter((h) => h.S).map((h) => h.S.id))); }, stormHover, stormClick,
  stormDots(id) { return stormHits.filter((h) => h.S && h.S.id === id && !h.live).map((h) => ({ x: h.x, y: h.y, r: h.r, h: h.f.h, v: h.f.v, t: stormDate(h.f.h) })); },     // the advisory dots of one system as drawn: position, hit radius (8 six-hourly, 6 in between), hour, wind, time text
  stormLowsSet(list) {                                                // the tracked lows are replaced by synthetic ones, each [lat, lon, hPa]; null puts the real ones back
    if (!stormMgr) return 0;
    if (list === null) { if (lowsKept) stormMgr.lows.tracks = lowsKept; lowsKept = null; }
    else { if (!lowsKept) lowsKept = stormMgr.lows.tracks; stormMgr.lows.tracks = list.map(([lat, lon, p], i) => ({ id: 'T' + i, born: simHour, lat, lon, p, dx: 0, dy: 0, miss: 0, alive: true, maxDepth: 1010 - p, n: 3, pmin: p, fixes: [[simHour - 12, lat, lon, p], [simHour - 6, lat, lon, p], [simHour, lat, lon, p]] })); }
    stormsDirty = true; drawStorms(); return stormMgr.lows.tracks.length;
  },
  stormLowsDrawn() { return stormHits.filter((h) => h.low).map((h) => [h.low.lat, h.low.lon]); },
  stormEnvAt(name, lat, lon) { return stormEnv[name](lat, lon); },                                       // the page's own sea temperature / humidity / shear at a place and the hour of the last keyframe (tools and tests)
  ensState() { return ensPack ? { tid: ensPack.tid, n: ensPack.members.length, init: ensPack.E.init, factor: ensPack.E.factor, names: ensPack.members.map((m) => m.name), hot: ensHot, dens: !!ensPack.dens } : null; },
  coneState() { const C = ensPack && ensPack.cone; return C ? { tid: ensPack.tid, init: C.init, n: C.rows.length, pts: C.pts.map((q) => ({ lead: q.lead, v: q.v, letter: q.letter, post: q.post, th: q.th, lat: q.lat, lon: q.lon })), line: C.line.map((q) => [q.lat, q.lon]), hot: coneHot, poly: !!C.poly } : null; },
  wwState() { const A = wwPack && wwPack.A; return A ? { hour: wwPack.hour, n: A.n, cells: A.code.length, counts: Array.from(A.code).reduce((c, v) => { c[v] = (c[v] || 0) + 1; return c; }, {}), box: [A.x0, A.y0, A.nx, A.ny, A.cell] } : null; },
  wwAt(lat, lon) { return wwPack && wwPack.A ? wwPack.A.at(lat, lon) : 0; },
  windRadiiOf(id) { const S = stormMgr && stormMgr.get(id); return S ? HFStorms.windRadii(S, stormMgr.par) : null; },
  conePoint(lead) { const q = ensPack && ensPack.cone && ensPack.cone.pts.find((p) => p.lead === lead); if (!q) return null; const p = map.latLngToContainerPoint([q.lat, q.lon]); return { x: p.x, y: p.y }; },
  coneFor(id, ens) { if (!stormMgr) return null; if (!shadow || simHour - shadow.t0 >= 12) shadowBuild(); const E = stormMgr.ensemble(id, { at: shadowEnv }, { horizon: Math.max(24, Math.min(stormMgr.par.ens.horizon, shadow.t0 + SHADOW_H - stormMgr.hour)), ens }); if (!E) return null; const C = HFStorms.coneOf(E, stormMgr.par, null, SCALE); return C ? { init: E.init, line: C.line.map((q) => [q.lat, q.lon, q.v]), pts: C.pts, mean: E.members.map((m) => m.pts) } : null; },       // the cone and the fan of a system as the page would make them now (tools and tests)
  impactOf(i) { return stormMgr ? stormMgr.impactOf(typeof i === 'string' ? stormMgr.cities.findIndex((c) => c.name === i) : i) : null; }, impactRings() { return stormMgr ? stormMgr.impactRings() : []; },           // what the storms did to a city (by index or name) and the cities with damage that has not healed
  cityList() { return CITIES.map((c) => ({ name: c.name, lat: c.lat, lon: c.lon, inland: c.sLat !== undefined })); },
  cityIndex(name) { return CITIES.findIndex((c) => c.name === name); }, cityTipLines(i) { return stormImpactLines(stormImpactNow(i)); }, cityPoint(i) { const c = CITIES[i], p = map.latLngToContainerPoint([c.lat, c.lon]); return { x: p.x, y: p.y }; },
  impactSeed(name, ev) { const m = stormMgr, c = m.cities.find((q) => q.name === name), L = m._ledgerOf(c); L.ev.push(Object.assign({ t0: m.hour - 60, te: m.hour - 12, last: m.hour - 12, pk: new Array(9).fill(40), rp: 5, sg: 0, vmax: 80, gmax: 100, D: 1e9, k: 5, i: 20, d: 0.01, sid: null, sn: 'Seed' }, ev)); if (!ev.T) { const e = L.ev[L.ev.length - 1]; e.T = HFStorms.recoverH(m.par, e.d); } stormsDirty = true; drawStorms(); return true; },       // a finished event put into a city's ledger (tests)
  fixesOf(id) { const S = stormMgr && stormMgr.get(id); return S ? S.fixes.map((f) => [f.h, f.lat, f.lon, f.v, f.th, f.w]) : null; },
  ensPoint(k, i) { const px = ensPx[k]; return px && px[i] ? { x: px[i].x, y: px[i].y } : null; }, plainSelState() { return plainSel; },
  outlook() { return outlookNow(); }, outlookFresh() { if (stormMgr) stormMgr._ol = null; olHeld = null; olEagerSlot = -1e9; const t = performance.now(), r = outlookNow(); return { ms: performance.now() - t, areas: r ? r.areas.length : -1 }; }, outlookForce(res) { olForced = res || null; stormsDirty = true; drawStorms(); return !!olForced; },        // the areas of interest the page shows (tests: force a list of areas to draw, null puts the engine's back)
  outlookMemSlot() { return stormMgr && stormMgr.olMem ? stormMgr.olMem.slot : null; },                                   // the six-hour slot of the last issue the engine made (tests: the issues are made by the clock)
  outlookMem() { const c = stormMgr && stormMgr.olMem ? stormMgr.olMem.cur : {}; return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, [v.p2, v.p7]])); },        // what the last issue said of every disturbance it knows, drawn or not: [2-day, 7-day] (tests: how a chance moves from issue to issue)
  aoiSelect(key) { if (key == null) { closeStormCard(); return null; } const OL = outlookNow(), a = OL && OL.areas.find((q) => q.key === key); if (!a) return null; openAoiCard(a); return olSel ? olSel.key : null; },
  aoiState() { const c = $('aoi-card'), g = (id) => $(id).textContent; return { sel: olSel ? olSel.key : null, hidden: c.hidden, name: g('ac-name'), type: g('ac-type'), p2: g('ac-p2'), p7: g('ac-p7'), cls: g('ac-cls'), clsBg: $('ac-cls').style.background, cond: g('ac-cond'), mv: g('ac-mv'), pos: g('ac-pos'), sh: g('ac-sh'), sst: g('ac-sst'), iss: g('ac-iss'), win: g('ac-win'), tc: stormSel ? stormSel.id : null }; },
  outlookHits() { return { marks: stormHits.filter((h) => h.aoi).map((h) => ({ x: h.x, y: h.y, r: h.r, key: h.aoi.key })), areas: olHits.map((h) => ({ key: h.a.key, bbox: [h.x0, h.y0, h.x1, h.y1] })) }; },
  stormFieldCheck() {                                                  // the storm grid's fields against the map's fine fields at the nodes it keeps: the largest difference of each (they must be 0) and the nodes where only one is missing
    const a = new Float32Array(NSF), b = new Float32Array(NSF), c = new Float32Array(NSF);
    anomDirty = true; computeField();                                  // the map's fine fields as the state is now
    const diff = (A, B, C) => {
      const max = [0, 0, 0]; let nanMismatch = 0, nodes = 0;
      for (let js = 0; js < NYS; js++) for (let is = 0; is < NXS; is++) {
        const k = js * SS * NX + is * SS, ks = js * NXS + is; nodes++;
        [[0, A, sst], [1, B, humid], [2, C, shear]].forEach(([q, X, F]) => { const x = X[ks], y = F[k]; if (x !== x || y !== y) { if ((x !== x) !== (y !== y)) nanMismatch++; return; } max[q] = Math.max(max[q], Math.abs(x - y)); });
      }
      return { max, nanMismatch, nodes };
    };
    const live = kfFieldHour === simHour ? diff(kfSst, kfHumid, kfShear) : null;      // what the engine reads right now, when its keyframe was taken at this very hour (a midnight): the way it got there is under test too
    sAnomDirty = true; computeStormFields(a, b, c);
    const fresh = diff(a, b, c);
    let interp = 0, pts = 0;                                          // and the bilinear lookup between the nodes against the same weights written out by hand, at 400 scattered points
    for (let n = 0; n < 400; n++) {
      const lat = LAT1 - (NY - 1) * RES * (0.02 + 0.96 * ((n * 0.6180339887) % 1)), lon = LON0 + (NX - 1) * RES * (0.02 + 0.96 * ((n * 0.7548776662) % 1));
      const fx = (lon - LON0) / (RES * SS), fy = (LAT1 - lat) / (RES * SS), i = Math.floor(fx), j = Math.floor(fy), ax = fx - i, ay = fy - j;
      [[a, sst], [b, humid], [c, shear]].forEach(([A, F]) => {
        const v = (jj, ii) => F[jj * SS * NX + ii * SS], ref = v(j, i) * (1 - ax) * (1 - ay) + v(j, i + 1) * ax * (1 - ay) + v(j + 1, i) * (1 - ax) * ay + v(j + 1, i + 1) * ax * ay, got = sampleFieldS(A, lat, lon);
        if (ref === ref && got === got) { interp = Math.max(interp, Math.abs(ref - got)); pts++; }
      });
    }
    return { max: fresh.max, nanMismatch: fresh.nanMismatch, nodes: fresh.nodes, live, interp, pts };
  },
  shadowEnso() { if (!shadow) shadowBuild(); return shadowEnv(simHour + 24).enso(); },                 // the Nino 3.4 index the Place preview's environment hands the engine (tests)
  stormEnvSample(lat, lon) { return { hour: kfFieldHour, enso: stormEnv.enso(), land: stormLand(lat, lon), sst: stormEnv.sst(lat, lon), rh: sampleFieldS(kfHumid, lat, lon), shear: sampleFieldS(kfShear, lat, lon), lake: lakeIdAt(lat, lon) }; }
};
/* ==== STORM LATE END ==== */
