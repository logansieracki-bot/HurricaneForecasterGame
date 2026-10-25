/* ==== STORM FLOATER BEGIN ==== */
/* ---- the radar floater: a 2-km storm-scale nest (src/storm-nest.js) of one system, drawn as radar over the map -------------------------------------------------------------------
   Opened from the card of a system that is a disturbance or more. The main clock stops; the floater has its own, running inside the hour between two real states of the system (the engine's
   state now and a look-ahead copy stepped one hour on, Manager.peek), at speeds from real time to 20 minutes per second, and when it reaches the next hour the engine really advances
   one hour and the floater goes on from there. The picture is a map-registered canvas under the storm canvas, so the storm layers (past path and position, cone, ensembles, wind fields) stay on top of it.
   The radar is either a composite (every echo of the nest) or a site: a city's radar with the beam's height and width, range rings, the echoes that pass under or over the beam.                              */
const FL_SPEEDS = [1, 2, 5, 10, 30, 60, 120, 300, 600, 1200], FL_NAMES = ['real time', '2×', '5×', '10×', '30×', '1 min every second', '2 min every second', '5 min every second', '10 min every second', '20 min every second'];
const FL_DT = 120, FL_SPIN = 30, FL_MAXKM = 460;
let flOn = false, flRenderAt = 0, flSstOpacity = '', flId = null, flNest = null, flSpeed = 3, flPlay = true, flPrevPlay = true, flSpinN = 0, flAcc = 0, flLast = 0, flSite = null, flTilt = 0.5, flLandStep = -99, flCanvas = null, flOff = null, flRaf = 0, flGone = false, flTextAt = 0, flDirty = true, flF1 = null, flSites = [], flDbz = null, flTop = null, flImg = null, flColAt = null;
const flKmDeg = 111.195;

const FL_STOPS = [[5, 100, 100, 100], [10, 4, 233, 231], [15, 1, 159, 244], [20, 3, 0, 244], [25, 2, 253, 2], [30, 1, 197, 1], [35, 0, 142, 0], [40, 253, 248, 2], [45, 229, 188, 0], [50, 253, 149, 0], [55, 253, 0, 0], [60, 212, 0, 0], [65, 188, 0, 0], [70, 248, 0, 253], [75, 152, 84, 198], [80, 255, 255, 255]];
const FL_LUT = (() => {                                                           // the NWS reflectivity colours, one entry per half dBZ (0 .. 80): [r, g, b, alpha]
  const lut = new Uint8ClampedArray(161 * 4);
  for (let i = 0; i <= 160; i++) {
    const d = i / 2; let r = 0, g = 0, b = 0;
    if (d >= FL_STOPS[0][0]) { let k = 1; while (k < FL_STOPS.length - 1 && d > FL_STOPS[k][0]) k++; const a = FL_STOPS[k - 1], c = FL_STOPS[k], t = Math.min(1, Math.max(0, (d - a[0]) / (c[0] - a[0]))); r = a[1] + (c[1] - a[1]) * t; g = a[2] + (c[2] - a[2]) * t; b = a[3] + (c[3] - a[3]) * t; }
    lut[i * 4] = r; lut[i * 4 + 1] = g; lut[i * 4 + 2] = b; lut[i * 4 + 3] = d < 6 ? 0 : Math.min(235, 235 * Math.min(1, (d - 6) / 10));
  }
  return lut;
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
  if (!olSel && !(stormSel && stormSel.id === id)) { plainSel = null; stormSel = { id, h: -1 }; }       // (the system alone, with its path and its place)
  $('storm-card').hidden = true; $('aoi-card').hidden = true;
  const f0 = flForcing(S, simHour);
  flNest = HFNest.create({ seed: flSeed(S) }); flNest.init(f0); flF1 = null;
  flCanvas = flCanvas || (() => { const c = makeCanvas(458); c.id = 'radar-canvas'; return c; })();
  flCanvas.style.display = ''; document.body.classList.add('fl-on'); flSstOpacity = sstCanvas.style.opacity; sstCanvas.style.opacity = '0.28';       // (the sea-temperature picture fades back so the echoes read)
   $('fl-bar').hidden = false; $('fl-legend').style.display = 'block';
  flSites = flSiteList(f0); const sel = $('fl-site'); sel.innerHTML = '<option value="">Composite (every echo)</option>' + flSites.map((c, i) => '<option value="' + i + '">' + c.name + ' · ' + Math.round(c.d) + ' km</option>').join(''); sel.value = '';
  $('fl-tilt-l').style.display = 'none'; $('fl-prog').style.display = ''; $('fl-name').textContent = (S.name || stormTitle(S, HFStorms.makeFix(S, stormMgr.hour, S.ace))) + ' · radar'; flSetPlayUI(); flSpeedUI();
  flFrameMap(f0); flText(true); flDirty = true;
  flLast = performance.now(); cancelAnimationFrame(flRaf); flRaf = requestAnimationFrame(flLoop);
  return true;
}
function flClose() {
  if (!flOn) return;
  flOn = false; cancelAnimationFrame(flRaf); flId = null; flNest = null;
  if (flCanvas) { flCanvas.style.display = 'none'; const g = flCanvas.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, flCanvas.width, flCanvas.height); }
  document.body.classList.remove('fl-on'); sstCanvas.style.opacity = flSstOpacity; $('fl-bar').hidden = true; $('fl-legend').style.display = 'none';
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
  $('speed-x').textContent = FL_SPEEDS[flSpeed] >= 60 ? FL_SPEEDS[flSpeed] / 60 + ' min/s' : FL_SPEEDS[flSpeed] === 1 ? '1×' : FL_SPEEDS[flSpeed] + '×';
  $('speed-sub').textContent = FL_SPEEDS[flSpeed] === 1 ? 'real time' : FL_NAMES[flSpeed].replace('×', '× real time');
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
  $('fl-sub').textContent = flGone ? 'The system has dissipated' : spin ? 'Spinning up the convection…' : (S && S.th === 'wv' ? 'Disturbance' : S ? stormKindName(S, HFStorms.makeFix(S, stormMgr.hour, S.ace)) : '') + (S && S.th !== 'wv' ? ' · mean wind ' + HFStorms.ktToMph(kt) + ' mph' : '') + ' · radar tilt ' + (flSite ? flTilt + '°' : 'composite');
  $('fl-prog').style.display = spin ? '' : 'none'; $('fl-prog').firstElementChild.style.width = Math.round(100 * flSpinN / FL_SPIN) + '%';
}
function flSpin(budget) {                                                       // spin-up: the convection settles in over two hours of the system's life, a few steps at a time
  const nest = flNest, t0 = performance.now();
  while (flSpinN < FL_SPIN && performance.now() - t0 < budget) { nest.step(2 * FL_DT); flSpinN++; if (flSpinN % 3 === 0) flLandUpdate(); }
  if (flSpinN >= FL_SPIN) { nest.setForcing(nest.f0, null); flF1 = flLook(); nest.setForcing(nest.f0, flF1 || nest.f0); flAcc = 0; flText(true); }
  flDirty = true;
}
function flWork(sec, budget) {                                                  // the floater's clock runs `sec` seconds of the system's life (as many whole steps as the time allows; the rest waits)
  const nest = flNest; if (!nest || flSpinN < FL_SPIN || flGone) return 0;
  flAcc += sec; const t0 = performance.now(); let n = 0;
  while (flAcc >= FL_DT && performance.now() - t0 < budget) {
    nest.step(FL_DT); flAcc -= FL_DT; n++;
    if ((nest.steps % 3) === 0) flLandUpdate();
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
  const n = flNest, f = n.cur, g = n.f1 || f, k = Math.max(0, Math.min(1, (n.t - n.tF0 + (flPlay ? flAcc : 0)) / 3600));
  return { lat: f.clat + (g.clat - f.clat) * k, lon: f.clon + (g.clon - f.clon) * k };
}

/* ---- the picture ----------------------------------------------------------------------------------------------------------------------------------------------------------------- */
function flBeam(range, tiltDeg) { const th = tiltDeg * Math.PI / 180; return range * Math.sin(th) + range * range / (2 * 8495); }      // the height (km) of the middle of the beam at a distance (4/3 earth radius)
function flRender() {
  if (!flOn || !flNest || !flNest.cur || !flCanvas) return;
  const c = flCanvas; if (c.width !== Math.round(W * DPR) || c.height !== Math.round(H * DPR)) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
  const g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
  const nest = flNest, f = nest.cur, N = HFNest.N, NN = N * N, sg = f.sg || 1;
  nest.display(flPlay ? flAcc / FL_DT : 0);
  const rc = nest.drc, rs = nest.drs, dbz = flDbz || (flDbz = new Float32Array(NN)), top = flTop || (flTop = new Float32Array(NN));
  const pos = flPos(flSystem() || { id: '' }) || { lat: f.clat, lon: f.clon }, lat0 = pos.lat, lon0 = pos.lon, site = flSite;
  for (let k = 0; k < NN; k++) { const a = rc[k], b = rs[k]; dbz[k] = HFNest.dbzOf(a, b); if (site) top[k] = a > 0.2 || b > 0.2 ? Math.min(16, 3.2 + 2.3 * Math.log(1 + a / 3) + 1.4 * Math.log(1 + b / 1.5)) : 0; }
  const st = W * H > 520000 ? 3 : 2, w = Math.ceil(W / st), h = Math.ceil(H / st);
  if (!flOff) flOff = document.createElement('canvas'); if (flOff.width !== w || flOff.height !== h) { flOff.width = w; flOff.height = h; flImg = null; }
  const og = flOff.getContext('2d'), img = flImg || (flImg = og.createImageData(w, h)), px = img.data; px.fill(0);
  const lat = new Float64Array(h), lon = new Float64Array(w);
  for (let y = 0; y < h; y++) lat[y] = map.containerPointToLatLng([w > 0 ? 0 : 0, y * st + st / 2]).lat;
  for (let x = 0; x < w; x++) lon[x] = map.containerPointToLatLng([x * st + st / 2, 0]).lng;
  const sLat = site ? site.lat : 0, sLon = site ? site.lon : 0, tilt = flTilt;
  for (let y = 0; y < h; y++) {
    const la = lat[y], dy = (la - lat0) * flKmDeg, cl = Math.cos(la * Math.PI / 180), gj = sg > 0 ? dy / 2 + (N - 1) / 2 : (N - 1) / 2 - dy / 2;
    if (gj < 0 || gj > N - 1.001) continue;
    const j0 = Math.floor(gj), fy = gj - j0, sdy = site ? (la - sLat) * flKmDeg : 0;
    for (let x = 0; x < w; x++) {
      let dl = lon[x] - lon0; if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
      const gi = dl * flKmDeg * cl / 2 + (N - 1) / 2; if (gi < 0 || gi > N - 1.001) continue;
      const i0 = Math.floor(gi), fx = gi - i0, k0 = j0 * N + i0, w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      let d = dbz[k0] * w00 + dbz[k0 + 1] * w10 + dbz[k0 + N] * w01 + dbz[k0 + N + 1] * w11;
      if (site) {
        let dls = lon[x] - sLon; if (dls > 180) dls -= 360; else if (dls < -180) dls += 360;
        const r = Math.hypot(dls * flKmDeg * cl, sdy);
        if (r > FL_MAXKM) continue;
        const bh = flBeam(r, tilt), tp = top[k0] * w00 + top[k0 + 1] * w10 + top[k0 + N] * w01 + top[k0 + N + 1] * w11;
        if (bh >= tp + 0.5) continue;                                                    // the beam passes over the echo
        d -= 5.5 * Math.max(0, bh - 3.5) + (bh > tp - 1.5 ? 6 * (bh - (tp - 1.5)) / 2 : 0);          // above the melting layer and near the top the echo is weaker
        d -= 1.2 * Math.max(0, r - 100) / 100;                                          // (the beam fills less of a small echo with range)
      }
      if (d < 6) continue;
      const li = Math.min(160, Math.round(d * 2)) * 4, o = (y * w + x) * 4;
      px[o] = FL_LUT[li]; px[o + 1] = FL_LUT[li + 1]; px[o + 2] = FL_LUT[li + 2]; px[o + 3] = FL_LUT[li + 3];
    }
  }
  og.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(flOff, 0, 0, w * st, h * st);
  // the frame of the nest, and the site's rings
  const toPx = (la, lo) => map.latLngToContainerPoint([la, lo]);
  { const a = toPx(lat0 - 256 / flKmDeg, lon0 - 256 / (flKmDeg * Math.cos(lat0 * Math.PI / 180))), b = toPx(lat0 + 256 / flKmDeg, lon0 + 256 / (flKmDeg * Math.cos(lat0 * Math.PI / 180)));
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
  $('fl-site').onchange = () => { const v = $('fl-site').value; flSite = v === '' ? null : flSites[+v]; $('fl-tilt-l').style.display = flSite ? '' : 'none'; flDirty = true; flText(true); };
  $('fl-tilt').onchange = () => { flTilt = parseFloat($('fl-tilt').value); flDirty = true; flText(true); };
  const radar = (S) => { if (S && flEligible(S)) flOpen(S.id); };
  $('sc-radar').onclick = () => { if (stormSel) radar(stormMgr.get(stormSel.id)); };
  $('ac-radar').onclick = () => { const OL = outlookNow(), a = OL && olSel && OL.areas.find((q) => q.key === olSel.key); radar(a ? olSystem(a) : null); };
  map.on('move zoom resize', () => { if (flOn) flDirty = true; });
  window.addEventListener('resize', () => { if (flOn) flDirty = true; });
}
function flCardButtons(S) { const ok = flEligible(S); $('sc-radar').style.display = ok && !flOn ? '' : 'none'; }
/* ==== STORM FLOATER END ==== */
