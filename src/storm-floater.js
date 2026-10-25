/* ==== STORM FLOATER BEGIN ==== */
/* ---- the radar floater: a 2-km storm-scale nest (src/storm-nest.js) of one system, drawn as radar over the map -------------------------------------------------------------------
   Opened from the card of a system that is a disturbance or more. The main clock stops; the floater has its own, running inside the hour between two real states of the system (the engine's
   state now and a look-ahead copy stepped one hour on, Manager.peek), at speeds from real time to 20 minutes per second, and when it reaches the next hour the engine really advances
   one hour and the floater goes on from there. The picture is a map-registered canvas under the storm canvas, so the storm layers (past path and position, cone, ensembles, wind fields) stay on top of it.
   The radar is either a composite (every echo of the nest) or a site: a city's radar with the beam's height and width, range rings, the echoes that pass under or over the beam.                              */
const FL_SPEEDS = [0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 1200], FL_NAMES = ['quarter speed', 'half speed', 'real time', '2× real time', '5× real time', '10× real time', '30× real time', '1 min every second', '2 min every second', '5 min every second', '10 min every second', '20 min every second'];
const FL_DT = 120, FL_SPIN = 30, FL_MAXKM = 460;
let flProd = 'z', flVr = null, flVTex = null, flOn = false, flRenderAt = 0, flSstOpacity = '', flId = null, flNest = null, flSpeed = 5, flPlay = true, flPrevPlay = true, flSpinN = 0, flAcc = 0, flLast = 0, flSite = null, flTilt = 0.5, flLandStep = -99, flCanvas = null, flOff = null, flRaf = 0, flGone = false, flTextAt = 0, flDirty = true, flF1 = null, flSites = [], flDbz = null, flTop = null, flImg = null, flColAt = null;
const flKmDeg = 111.195;

const FL_BANDS = ['04e9e7', '019ff4', '0300f4', '02fd02', '01c501', '008e00', 'fdf802', 'e5bc00', 'fd9500', 'fd0000', 'd40000', 'bc0000', 'f800fd', '9854c6', 'ffffff'];       // the National Weather Service's base reflectivity colours, one band per 5 dBZ from 5 up (a radar's picture is in steps, with crisp edges between them, not a gradient)
const FL_LUT = (() => {                                                           // one entry per half dBZ (0 .. 80): [r, g, b, alpha]
  const lut = new Uint8ClampedArray(161 * 4);
  for (let i = 0; i <= 160; i++) {
    const d = i / 2; if (d < 5) continue;
    const c = FL_BANDS[Math.min(FL_BANDS.length - 1, Math.floor((d - 5) / 5))];
    lut[i * 4] = parseInt(c.slice(0, 2), 16); lut[i * 4 + 1] = parseInt(c.slice(2, 4), 16); lut[i * 4 + 2] = parseInt(c.slice(4, 6), 16); lut[i * 4 + 3] = 226;
  }
  return lut;
})();

const FL_VEL = [[-64, '00cc66'], [-50, '00e676'], [-36, '4cff8a'], [-26, '8cf0a8'], [-16, 'b8e8c4'], [-8, 'd4e4d8'], [-2, 'cccccc'], [2, 'e8d4d4'], [8, 'f2b8b8'], [16, 'f28c8c'], [26, 'f55a5a'], [36, 'f02020'], [50, 'c00000'], [64, '800000']];      // the Doppler velocity colours (kt): green for winds toward the radar, red away from it, grey for none
const FL_VLUT = (() => {                                                          // one entry per kt from -80 to 80 (index v + 80): ABGR
  const a = new Uint32Array(161), c = new Uint8ClampedArray(3);
  for (let i = 0; i <= 160; i++) { const v = i - 80; let k = 0; while (k < FL_VEL.length - 1 && v >= FL_VEL[k + 1][0]) k++; const h = FL_VEL[k][1]; a[i] = (226 << 24) | (parseInt(h.slice(4, 6), 16) << 16) | (parseInt(h.slice(2, 4), 16) << 8) | parseInt(h.slice(0, 2), 16); }
  return a;
})();
function flEligible(S) { return !!S && S.alive && (S.th !== 'wv' || S.dist || S.kind === 'N' || !!S.invest); }          // a disturbance or more: anything but a plain tropical wave
function flSystem() { return flId && stormMgr ? stormMgr.get(flId) : null; }
function flSeed(S) { return (HFStorms.hash5(stormMgr.seed, S.num, 17, 3, 1) >>> 0) || 1; }
function flForcing(S, h) { return HFNest.forcingOf(S, stormMgr.par, stormEnv, h); }
function flLook() {                                                              // the look-ahead state one hour on (the same state when there is none: the system ends or cannot be asked)
  const C = stormMgr.peek(flId, stormEnv), S = flSystem();
  if (!C || !S) return null;
  const f = flForcing(C, simHour + 1); let d = f.clon - flNest.f0.clon; if (d > 180) f.clon -= 360; else if (d < -180) f.clon += 360;
  return f;
}
function flStepHour() {                                                          // the nest has run its hour: the engine really advances, the floater takes the new state and looks one hour on
  advanceHours(1); updateClock();
  const S = flSystem();
  if (!S || !S.alive) { flGone = true; flPlay = false; flSetPlayUI(); flText(true); return; }
  const f0 = flForcing(S, simHour), prev = flNest.cur; let d = f0.clon - prev.clon; if (d > 180) f0.clon -= 360; else if (d < -180) f0.clon += 360;
  flNest.setForcing(f0, null); flF1 = flLook(); flNest.setForcing(f0, flF1 || f0);
  stormsDirty = true;
}
function flLegend() { const v = flProd === 'v' && flSite; $('fl-legend').style.display = flOn && !v ? 'block' : 'none'; $('fl-legend-v').style.display = flOn && v ? 'block' : 'none'; }
function flEnvUpdate() {                                                         // the weather round the storm (sea temperature, humidity, shear on a 16-km grid of the nest's square) from the page's own fields: a dry, cold or sheared side makes the storm lopsided
  const f = flNest.cur || flNest.f0; flEnvBuf = HFNest.envGridOf(stormEnv, f.clat, f.clon, f.sg, f, flEnvBuf); flNest.setEnv(flEnvBuf, f);
}
let flEnvBuf = null;
function flLandUpdate() {                                                        // the land under the nest (it moves with the storm), from the page's own land test
  const f = flNest.cur || flNest.f0, lf = flLf || (flLf = new Float32Array(HFNest.N * HFNest.N));
  HFNest.landGrid(f.clat, f.clon, typeof stormLand === 'function' ? stormLand : isLand, lf);
  flNest.setLand(lf, f.sg < 0);
}
let flLf = null;

/* ---- opening and closing --------------------------------------------------------------------------------------------------------------------------------------------------------- */
function flOpen(id) {
  if (!stormsOn || !stormMgr) return false;
  const S = stormMgr.get(id); if (!flEligible(S)) return false;
  if (flOn) flClose();
  flOn = true; flId = id; flGone = false; flSpinN = 0; flAcc = 0; flSite = null; flLandStep = -99; flPrevPlay = playing; setPlaying(false);
  if (!olSel) { plainSel = null; stormSel = { id, h: -1 }; }                                        // (the system alone, with its path and its place)
  $('storm-card').hidden = true; $('aoi-card').hidden = true;
  const f0 = flForcing(S, simHour);
  flNest = HFNest.create({ seed: flSeed(S) }); flNest.init(f0); flEnvUpdate(); flF1 = null;
  flCanvas = flCanvas || (() => { const c = makeCanvas(458); c.id = 'radar-canvas'; return c; })();
  flCanvas.style.display = ''; document.body.classList.add('fl-on'); flSstOpacity = sstCanvas.style.opacity; sstCanvas.style.opacity = '0.28';       // (the sea-temperature picture fades back so the echoes read)
   $('fl-bar').hidden = false; flLegend();
  flSites = flSiteList(f0); const sel = $('fl-site'); sel.innerHTML = '<option value="">Composite (every echo)</option>' + flSites.map((c, i) => '<option value="' + i + '">' + c.name + ' · ' + Math.round(c.d) + ' km</option>').join(''); sel.value = '';
  $('fl-tilt-l').style.display = 'none'; $('fl-prod-l').style.display = 'none'; flProd = 'z'; $('fl-prod').value = 'z'; $('fl-prog').style.display = ''; $('fl-name').textContent = (S.name || stormTitle(S, HFStorms.makeFix(S, stormMgr.hour, S.ace))) + ' · radar'; flSetPlayUI(); flSpeedUI();
  flFrameMap(f0); flText(true); flDirty = true;
  flLast = performance.now(); cancelAnimationFrame(flRaf); flRaf = requestAnimationFrame(flLoop);
  return true;
}
function flClose() {
  if (!flOn) return;
  flOn = false; cancelAnimationFrame(flRaf); flId = null; flNest = null;
  if (flCanvas) { flCanvas.style.display = 'none'; const g = flCanvas.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, flCanvas.width, flCanvas.height); }
  document.body.classList.remove('fl-on'); sstCanvas.style.opacity = flSstOpacity; $('fl-bar').hidden = true; $('fl-legend').style.display = 'none'; $('fl-legend-v').style.display = 'none';
  setPlaying(flPrevPlay); updateSpeedUI(); if (stormSel) { lastStormCardAt = 0; fillStormCard(); } if (olSel) { lastAoiCardAt = 0; fillAoiCard(); } stormsDirty = true; drawStorms();
}
function flFrameMap(f) {                                                         // the map to the nest's 512 km square, with a little room
  const lat = f.clat, lon = f.clon, dl = 1.12 * 256 / flKmDeg, dn = dl / Math.max(0.2, Math.cos(lat * Math.PI / 180));
  map.fitBounds([[lat - dl, lon - dn], [lat + dl, lon + dn]], { animate: false, padding: [8, 8] });
}
function flSiteList(f) {                                                         // cities within reach of the nest, nearest first
  if (typeof CITIES === 'undefined') return [];
  const out = [];
  for (const c of CITIES) { const dy = (c.lat - f.clat) * flKmDeg, dx = (c.lon - f.clon) * flKmDeg * Math.cos(c.lat * Math.PI / 180), d = Math.hypot(dx, dy); if (d < 420) out.push({ name: c.name, lat: c.lat, lon: c.lon, d }); }
  return out.sort((a, b) => a.d - b.d).slice(0, 9);
}

/* ---- the clock ------------------------------------------------------------------------------------------------------------------------------------------------------------------- */
function flSpeedUI() {
  const v = FL_SPEEDS[flSpeed];
  $('speed-x').textContent = v >= 60 ? v / 60 + ' min/s' : v === 0.25 ? '¼×' : v === 0.5 ? '½×' : v + '×';
  $('speed-sub').textContent = FL_NAMES[flSpeed];
  $('b-slower').disabled = flSpeed === 0; $('b-faster').disabled = flSpeed === FL_SPEEDS.length - 1;
}
function flSetPlayUI() { $('ic-pause').style.display = flPlay ? '' : 'none'; $('ic-play').style.display = flPlay ? 'none' : ''; $('b-play').setAttribute('aria-label', flPlay ? 'Pause' : 'Play'); }
function flMinutes() { return flNest && flNest.cur && flSpinN >= FL_SPIN ? Math.floor((flNest.t - flNest.tF0) / 60) : 0; }
function flText(force) {
  const now = performance.now(); if (!force && now - flTextAt < 200) return; flTextAt = now;
  const S = flSystem(), f = flNest && flNest.cur; if (!f) { $('fl-time').textContent = ''; return; }
  const d = simDate(simHour), min = flMinutes(), t = new Date(d.getTime() + min * 60000);
  $('fl-time').textContent = String(t.getUTCHours()).padStart(2, '0') + ':' + String(t.getUTCMinutes()).padStart(2, '0') + ' UTC · ' + MON[t.getUTCMonth()] + ' ' + t.getUTCDate();
  const kt = Math.round(f.vmax / 0.514444), spin = flSpinN < FL_SPIN;
  $('fl-sub').textContent = flGone ? 'The system has dissipated' : spin ? 'Spinning up the convection…' : (S && S.th === 'wv' ? 'Disturbance' : S ? stormKindName(S, HFStorms.makeFix(S, stormMgr.hour, S.ace)) : '') + (S && S.th !== 'wv' ? ' · mean wind ' + HFStorms.ktToMph(kt) + ' mph' : '') + ' · ' + (flSite ? (flProd === 'v' ? 'velocity' : 'reflectivity') + ', tilt ' + flTilt + '°' : 'composite reflectivity');
  $('fl-prog').style.display = spin ? '' : 'none'; $('fl-prog').firstElementChild.style.width = Math.round(100 * flSpinN / FL_SPIN) + '%';
}
function flSpin(budget) {                                                       // spin-up: the convection settles in over two hours of the system's life, a few steps at a time
  const nest = flNest, t0 = performance.now();
  while (flSpinN < FL_SPIN && performance.now() - t0 < budget) { nest.step(2 * FL_DT); flSpinN++; if (flSpinN % 3 === 0) flLandUpdate(); if (flSpinN % 5 === 0) flEnvUpdate(); }
  if (flSpinN >= FL_SPIN) { nest.setForcing(nest.f0, null); flF1 = flLook(); nest.setForcing(nest.f0, flF1 || nest.f0); flAcc = 0; flText(true); }
  flDirty = true;
}
function flWork(sec, budget) {                                                  // the floater's clock runs `sec` seconds of the system's life (as many whole steps as the time allows; the rest waits)
  const nest = flNest; if (!nest || flSpinN < FL_SPIN || flGone) return 0;
  flAcc += sec; const t0 = performance.now(); let n = 0;
  while (flAcc >= FL_DT && performance.now() - t0 < budget) {
    nest.step(FL_DT); flAcc -= FL_DT; n++;
    if ((nest.steps % 3) === 0) flLandUpdate();
    if ((nest.steps % 5) === 0) flEnvUpdate();
    if (nest.t - nest.tF0 >= 3600 - 1e-6) { flStepHour(); if (flGone) break; }
  }
  if (flAcc > 4 * FL_DT) flAcc = 4 * FL_DT;                                     // (the machine cannot keep the speed: the clock runs as fast as it can)
  flDirty = true; return n;
}
function flLoop(now) {
  if (!flOn) return;
  const dt = Math.min(250, now - flLast) / 1000; flLast = now;
  if (flNest) {
    if (flSpinN < FL_SPIN) flSpin(40); else if (flPlay) flWork(dt * FL_SPEEDS[flSpeed], 36);
    if (flDirty && now - flRenderAt >= (flSpinN < FL_SPIN ? 120 : 45)) { flDirty = false; flRenderAt = now; flRender(); stormsDirty = true; }       // (about twenty pictures a second: a step of the model costs more than a picture, and the storm canvas is redrawn with it)
    flText(false);
  }
  flRaf = requestAnimationFrame(flLoop);
}
function flPos(S) {                                                              // where the floater says the system is now (between the hour's two states), for the storm canvas and the picture
  if (!flOn || !flNest || !flNest.cur || S.id !== flId || flSpinN < FL_SPIN) return null;
  const n = flNest, f = n.f0, g = n.f1 || f, k = Math.max(0, Math.min(1, (n.t - n.tF0 + (flPlay ? flAcc : 0)) / 3600));
  return { lat: f.clat + (g.clat - f.clat) * k, lon: f.clon + (g.clon - f.clon) * k };
}

/* ---- the picture ----------------------------------------------------------------------------------------------------------------------------------------------------------------- */
function flBeam(range, tiltDeg) { const th = tiltDeg * Math.PI / 180; return range * Math.sin(th) + range * range / (2 * 8495); }      // the height (km) of the middle of the beam at a distance (4/3 earth radius)
const FL_CR = (t) => [-0.5 * t * t * t + t * t - 0.5 * t, 1.5 * t * t * t - 2.5 * t * t + 1, -1.5 * t * t * t + 2 * t * t + 0.5 * t, 0.5 * t * t * t - 0.5 * t * t];      // Catmull-Rom weights (a sharper reconstruction than a linear one)
const FL_LUT32 = (() => { const a = new Uint32Array(161), b = new Uint8Array(FL_LUT.buffer.slice(0)); for (let i = 0; i <= 160; i++) a[i] = (b[i * 4 + 3] << 24) | (b[i * 4 + 2] << 16) | (b[i * 4 + 1] << 8) | b[i * 4]; return a; })();      // (little-endian ABGR, one store a pixel)
/* the dBZ field of the cells i0..i1, j0..j1 made U times finer with a bicubic reconstruction kept between the two samples it lies between (sharp, no ripple), north at the top: the picture is made at the screen's own
   sharpness, not stretched. Returns the texture's size */
function flTexture(dbz, U, sg, i0, i1, j0, j1, out) {
  const N = HFNest.N, W0 = i1 - i0 + 1, H0 = j1 - j0 + 1, MW = W0 * U, MH = H0 * U, jlo = Math.max(0, j0 - 1), jhi = Math.min(N - 1, j1 + 2), rows = jhi - jlo + 1;
  const tmp = flTmp && flTmp.length >= rows * MW ? flTmp : (flTmp = new Float32Array(rows * MW));
  const wts = []; for (let u = 0; u < U; u++) wts.push(FL_CR((u + 0.5) / U));
  for (let j = jlo; j <= jhi; j++) {                                              // along x
    const o = j * N, r = (j - jlo) * MW;
    for (let ii = 0; ii < W0; ii++) { const i = i0 + ii, a = dbz[o + Math.max(0, i - 1)], b = dbz[o + i], c = dbz[o + Math.min(N - 1, i + 1)], d = dbz[o + Math.min(N - 1, i + 2)], lo = b < c ? b : c, hi = b < c ? c : b;
      for (let u = 0; u < U; u++) { const w = wts[u], v = a * w[0] + b * w[1] + c * w[2] + d * w[3]; tmp[r + ii * U + u] = v < lo ? lo : v > hi ? hi : v; } }
  }
  for (let ty = 0; ty < MH; ty++) {                                               // along y: texture row ty is north-up (the nest's rows run north, or south in the southern hemisphere's mirror)
    const cj = sg > 0 ? j1 + 1 - (ty + 0.5) / U : j0 + (ty + 0.5) / U, gj = cj - 0.5, jf = Math.floor(gj), w = FL_CR(gj - jf), cl = (q) => (Math.max(jlo, Math.min(jhi, q)) - jlo) * MW, r0 = cl(jf - 1), r1 = cl(jf), r2 = cl(jf + 1), r3 = cl(jf + 2), o = ty * MW;
    for (let x = 0; x < MW; x++) { const b = tmp[r1 + x], c = tmp[r2 + x], v = tmp[r0 + x] * w[0] + b * w[1] + c * w[2] + tmp[r3 + x] * w[3], lo = b < c ? b : c, hi = b < c ? c : b; out[o + x] = v < lo ? lo : v > hi ? hi : v; }
  }
  return { w: MW, h: MH };
}
let flProf = [0, 0, 0, 0], flTmp = null, flTex = null, flTexC = null, flTexImg = null, flRng = null, flRngAt = null;
function flRender() {
  if (!flOn || !flNest || !flNest.cur || !flCanvas) return;
  const c = flCanvas; if (c.width !== Math.round(W * DPR) || c.height !== Math.round(H * DPR)) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
  const g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
  const nest = flNest, f = nest.cur, N = HFNest.N, NN = N * N, sg = f.sg || 1, site = flSite;
  const tp0 = performance.now(); nest.display(flPlay ? flAcc / FL_DT : 0);
  const rc = nest.drc, rs = nest.drs, dbz = flDbz || (flDbz = new Float32Array(NN));
  const pos = flPos(flSystem() || { id: '' }) || { lat: f.clat, lon: f.clon }, lat0 = pos.lat, lon0 = pos.lon, cos0 = Math.cos(lat0 * Math.PI / 180);
  let i0 = N, i1 = -1, j0 = N, j1 = -1;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i, a = rc[k], b = rs[k]; if (a < 0.01 && b < 0.01) { dbz[k] = -20; continue; } const d = HFNest.dbzOf(a, b); dbz[k] = d; if (d >= 5) { if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; } }
  if (site) {                                                                    // what a site's beam sees: its range, the height of the beam over every cell against the top of the echo, a weaker echo high and near the top, the beam fills less of a small echo far away
    const rng = flRng || (flRng = new Float32Array(NN)), key = site.name + '|' + lat0.toFixed(2) + '|' + lon0.toFixed(2);
    if (key !== flRngAt) { flRngAt = key; for (let j = 0; j < N; j++) { const dy = (sg > 0 ? j - (N - 1) / 2 : (N - 1) / 2 - j) * 2, la = lat0 + dy / flKmDeg, sy = (la - site.lat) * flKmDeg, ck = Math.cos(la * Math.PI / 180); for (let i = 0; i < N; i++) { let dl = lon0 + (i - (N - 1) / 2) * 2 / (flKmDeg * ck) - site.lon; if (dl > 180) dl -= 360; else if (dl < -180) dl += 360; rng[j * N + i] = Math.hypot(dl * flKmDeg * ck, sy); } } }
    const tilt = flTilt;
    for (let k = 0; k < NN; k++) {
      let d = dbz[k]; if (d < 5) continue; const r = rng[k];
      if (r > FL_MAXKM) { dbz[k] = -20; continue; }
      const a = rc[k], b = rs[k], top = Math.min(16, 3.2 + 2.3 * Math.log(1 + a / 3) + 1.4 * Math.log(1 + b / 1.5)), bh = flBeam(r, tilt);
      if (bh >= top + 0.5) { dbz[k] = -20; continue; }                                   // the beam passes over the echo
      d -= 5.5 * Math.max(0, bh - 3.5) + (bh > top - 1.5 ? 3 * (bh - (top - 1.5)) : 0) + 1.2 * Math.max(0, r - 100) / 100;
      dbz[k] = d;
    }
  }
  const vel = site && flProd === 'v';
  if (vel) {                                                                     // the wind along the beam (toward the radar negative): the nest's low-level wind plus the storm's own motion, ground relative
    const vr = flVr || (flVr = new Float32Array(NN)), U = nest.U, V = nest.V, rng = flRng, sp = f.spd || 0, cx = sp * Math.cos(f.head), cy = sp * Math.sin(f.head), MS = 1.943844;
    for (let j = 0; j < N; j++) { const dy = (sg > 0 ? j - (N - 1) / 2 : (N - 1) / 2 - j) * 2, la = lat0 + dy / flKmDeg, sy = (la - site.lat) * flKmDeg, ck = Math.cos(la * Math.PI / 180);
      for (let i = 0; i < N; i++) { const k = j * N + i; let dl = lon0 + (i - (N - 1) / 2) * 2 / (flKmDeg * ck) - site.lon; if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
        const sx = dl * flKmDeg * ck, r = rng[k] || 1, ue = U[k] + cx, ve = sg * (V[k] + cy); vr[k] = (ue * sx + ve * sy) / r * MS; } }
  }
  const tp1 = performance.now();
  const pxKm0 = (() => { const a = map.latLngToContainerPoint([lat0, lon0]), b = map.latLngToContainerPoint([lat0 + 10 / flKmDeg, lon0]); return Math.abs(a.y - b.y) / 10; })();
  if (i1 >= 0) {
    i0 = Math.max(0, i0 - 1); j0 = Math.max(0, j0 - 1); i1 = Math.min(N - 1, i1 + 1); j1 = Math.min(N - 1, j1 + 1);
    const U = Math.max(2, Math.min(4, Math.ceil(pxKm0 * 2 * DPR / 2.2))), W0 = i1 - i0 + 1, H0 = j1 - j0 + 1, MW = W0 * U, MH = H0 * U;
    if (!flTex || flTex.length < MW * MH) flTex = new Float32Array(MW * MH);
    flTexture(dbz, U, sg, i0, i1, j0, j1, flTex); const tp2 = performance.now();
    if (vel) { if (!flVTex || flVTex.length < MW * MH) flVTex = new Float32Array(MW * MH); flTexture(flVr, U, sg, i0, i1, j0, j1, flVTex); }
    if (!flTexC) flTexC = document.createElement('canvas');
    if (flTexC.width !== MW || flTexC.height !== MH) { flTexC.width = MW; flTexC.height = MH; flTexImg = flTexC.getContext('2d').createImageData(MW, MH); }
    { const px = new Uint32Array(flTexImg.data.buffer), n = MW * MH;
      if (vel) for (let k = 0; k < n; k++) { const d = flTex[k]; if (d < 5) { px[k] = 0; continue; } const v = flVTex[k]; px[k] = FL_VLUT[v <= -80 ? 0 : v >= 80 ? 160 : (v + 80.5) | 0]; }
      else for (let k = 0; k < n; k++) { const d = flTex[k]; px[k] = d < 5 ? 0 : FL_LUT32[d >= 80 ? 160 : (d * 2 + 0.5) | 0]; }
      flTexC.getContext('2d').putImageData(flTexImg, 0, 0); }
    const tp3 = performance.now();
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    // laid on the map in strips of rows (the map's projection stretches east-west by the cosine of the latitude, row by row)
    const sh = 8, yTop = map.latLngToContainerPoint([lat0 + (sg > 0 ? (j1 + 1 - 128) : (128 - j0)) * 2 / flKmDeg, lon0]).y, yBot = map.latLngToContainerPoint([lat0 + (sg > 0 ? (j0 - 128) : (128 - j1 - 1)) * 2 / flKmDeg, lon0]).y;
    const yA = Math.max(0, Math.floor(Math.min(yTop, yBot))), yB = Math.min(H, Math.ceil(Math.max(yTop, yBot)));
    for (let y0 = yA; y0 < yB; y0 += sh) {
      const y1 = Math.min(yB, y0 + sh), la0 = map.containerPointToLatLng([0, y0]).lat, la1 = map.containerPointToLatLng([0, y1]).lat, lac = (la0 + la1) / 2, ck = Math.cos(lac * Math.PI / 180);
      const cj = (la) => { const yk = (la - lat0) * flKmDeg; return sg > 0 ? yk / 2 + 128 : 128 - yk / 2; };       // the nest's continuous row of a latitude
      const t0 = sg > 0 ? (j1 + 1 - cj(la0)) * U : (cj(la0) - j0) * U, t1 = sg > 0 ? (j1 + 1 - cj(la1)) * U : (cj(la1) - j0) * U;       // the texture rows of the strip (north at the top: they grow down the screen)
      const sy0 = Math.max(0, t0), sy1 = Math.min(MH, t1); if (sy1 - sy0 < 0.01) continue;
      const dy0 = y0 + (sy0 - t0) / (t1 - t0) * (y1 - y0), dy1 = y0 + (sy1 - t0) / (t1 - t0) * (y1 - y0);
      const xl = map.latLngToContainerPoint([lac, lon0 + (i0 - 128) * 2 / (flKmDeg * ck)]).x, xr = map.latLngToContainerPoint([lac, lon0 + (i1 + 1 - 128) * 2 / (flKmDeg * ck)]).x;
      g.drawImage(flTexC, 0, sy0, MW, sy1 - sy0, xl, dy0, xr - xl, dy1 - dy0);
    }
    flProf = [tp1 - tp0, tp2 - tp1, tp3 - tp2, performance.now() - tp3];
  }
  // the frame of the nest, and the site's rings
  const toPx = (la, lo) => map.latLngToContainerPoint([la, lo]);
  { const a = toPx(lat0 - 256 / flKmDeg, lon0 - 256 / (flKmDeg * cos0)), b = toPx(lat0 + 256 / flKmDeg, lon0 + 256 / (flKmDeg * cos0));
    g.save(); g.setLineDash([6, 6]); g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,255,255,.35)'; g.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); g.restore(); }
  if (site) {
    const p = toPx(site.lat, site.lon), q = toPx(site.lat + 100 / flKmDeg, site.lon), pxKm = Math.abs(q.y - p.y) / 100;
    g.save(); g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,.4)'; g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '600 11px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
    for (const r of [50, 100, 150, 200, 230, 300, 460]) { g.setLineDash(r === 230 || r === 460 ? [] : [3, 5]); g.beginPath(); g.arc(p.x, p.y, r * pxKm, 0, 7); g.stroke(); if (r === 100 || r === 230 || r === 460) g.fillText(r + ' km', p.x, p.y - r * pxKm - 2); }
    g.setLineDash([]); g.beginPath(); g.arc(p.x, p.y, 4, 0, 7); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 1.6; g.strokeStyle = '#111'; g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = '600 12px system-ui, sans-serif'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(site.name + ' radar', p.x + 8, p.y); g.fillText(site.name + ' radar', p.x + 8, p.y);
    g.restore();
  }
}

/* ---- wiring ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- */
function flBind() {
  const dock = $('dock');
  dock.addEventListener('click', (e) => {                                      // while the floater is open the playback buttons are its own
    if (!flOn) return; const b = e.target.closest && e.target.closest('button'); if (!b) return;
    if (b.id === 'b-play') { flPlay = !flPlay; flAcc = 0; flSetPlayUI(); flDirty = true; }
    else if (b.id === 'b-slower') { if (flSpeed > 0) { flSpeed--; flSpeedUI(); } }
    else if (b.id === 'b-faster') { if (flSpeed < FL_SPEEDS.length - 1) { flSpeed++; flSpeedUI(); } }
    else if (b.id !== 'b-restart') return;
    e.stopPropagation(); e.preventDefault();
  }, true);
  window.addEventListener('keydown', (e) => {
    if (!flOn) return; const k = e.key;
    if (k === 'Escape') { flClose(); e.stopPropagation(); e.preventDefault(); }
    else if (k === ' ') { flPlay = !flPlay; flAcc = 0; flSetPlayUI(); flDirty = true; e.stopPropagation(); e.preventDefault(); }
    else if (k === '[') { if (flSpeed > 0) { flSpeed--; flSpeedUI(); } e.stopPropagation(); e.preventDefault(); }
    else if (k === ']') { if (flSpeed < FL_SPEEDS.length - 1) { flSpeed++; flSpeedUI(); } e.stopPropagation(); e.preventDefault(); }
  }, true);
  $('fl-close').onclick = flClose;
  $('fl-site').onchange = () => { const v = $('fl-site').value; flSite = v === '' ? null : flSites[+v]; $('fl-tilt-l').style.display = flSite ? '' : 'none'; $('fl-prod-l').style.display = flSite ? '' : 'none'; if (!flSite) { flProd = 'z'; $('fl-prod').value = 'z'; } flLegend(); flDirty = true; flText(true); };
  $('fl-tilt').onchange = () => { flTilt = parseFloat($('fl-tilt').value); flDirty = true; flText(true); };
  $('fl-prod').onchange = () => { flProd = $('fl-prod').value; flLegend(); flDirty = true; flText(true); };
  const radar = (S) => { if (S && flEligible(S)) flOpen(S.id); };
  $('sc-radar').onclick = () => { if (stormSel) radar(stormMgr.get(stormSel.id)); };
  $('ac-radar').onclick = () => { const OL = outlookNow(), a = OL && olSel && OL.areas.find((q) => q.key === olSel.key); radar(a ? olSystem(a) : null); };
  map.on('move zoom resize', () => { if (flOn) flDirty = true; });
  window.addEventListener('resize', () => { if (flOn) flDirty = true; });
}
function flCardButtons(S) { const ok = flEligible(S); $('sc-radar').style.display = ok && !flOn ? '' : 'none'; }
/* ==== STORM FLOATER END ==== */
