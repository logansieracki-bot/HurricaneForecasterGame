/* ==== STORM HOOKS BEGIN ==== */
/* The storm engine (src/storms.js, inlined above as HFStorms) is pure: it knows nothing about this page. This block is everything
   that connects the two -- the environment the storms live in, the clock, the drawing, the hover / click cards and the season bar.
   Time: advanceHours() walks in sub-chunks that end on every absolute 3-hour boundary; the engine runs hour by hour on the LAST
   keyframe (a copy of the steering nodes every 3 h, of SST / humidity / shear once a day at 00Z and whenever a slider moved), so a
   storm sees the same weather however the clock is chunked or however often the page happened to redraw. The lazy weather draws that
   computeField() would otherwise make at render time (ensureSynDay / ensureShearSynDay) are pinned to the midnight keyframe, which
   makes SST, humidity, shear and ENSO a pure function of the seed while storms are on. */
/* ---- the storm grid: the engine's own copy of the environment (the same code in every basin's page; it reads this page's climatology, jet and feature arrays) ---- */
/* The storm engine's own copy of the environment: SST, humidity and shear on every SS-th node (0.5 degrees), exactly the values computeField gives at those nodes (SSTSIM.stormFieldCheck
   compares them), for a quarter of the cost: the engine samples a few dozen points an hour, it does not need every cell of the map. Every storm keyframe, the Place look-ahead and the
   calibration lab use it; the map's own fine fields are computed only when the map is drawn. sAnomDirty plays anomDirty's part for the storm grid's copies of the interannual terms. */
const sAnomF = new Float32Array(NSF), sEnsoF = new Float32Array(NSF), sHAnomF = new Float32Array(NSF), sHEnsoF = new Float32Array(NSF), sSAnomF = new Float32Array(NSF), sSEnsoF = new Float32Array(NSF);
const sHumPrev = new Float32Array(NSF), sHumCur = new Float32Array(NSF), sShPrev = new Float32Array(NSF), sShCur = new Float32Array(NSF);      // the day's synoptic humidity and shear pairs at the storm nodes, up-sampled from the generators' coarse pair (what the fine pair holds there, bit for bit)
function sampleFieldS(arr, lat, lon) {                                    // sampleField on the storm grid (bilinear between nodes one degree apart)
  const fx = (lon - LON0) / (RES * SS), fy = (LAT1 - lat) / (RES * SS);
  if (fx < 0 || fy < 0 || fx > NXS - 1 + 1e-6 || fy > NYS - 1 + 1e-6) return NaN;
  const i = Math.min(Math.floor(fx), NXS - 2), j = Math.min(Math.floor(fy), NYS - 2), ax = fx - i, ay = fy - j, p = j * NXS + i, q = p + NXS;
  return (arr[p] * (1 - ax) + arr[p + 1] * ax) * (1 - ay) + (arr[q] * (1 - ax) + arr[q + 1] * ax) * ay;
}
function computeStormFields(oS, oH, oSh) {
  const d = simDate(simHour), y = d.getUTCFullYear(), doy = (d.getTime() - Date.UTC(y, 0, 1)) / 86400000;
  const ylen = ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365, f = doy / ylen;
  const p = f * 12 - 0.5, m1 = Math.floor(p), w = cr(p - m1), M = (x) => ((x % 12) + 12) % 12;
  const A0 = climF[M(m1 - 1)], A1 = climF[M(m1)], A2 = climF[M(m1 + 1)], A3 = climF[M(m1 + 2)];
  const w0 = w[0], w1 = w[1], w2 = w[2], w3 = w[3];
  const wf = 0.5 + 0.5 * Math.cos(2 * Math.PI * (f - 45 / 365.25));
  const synD = Math.floor(simHour / 24), synT = simHour / 24 - synD;
  advanceSynDraws(synD); advanceShearSynDraws(synD);                       // the draws the map's own blend would make (pinned here), without the fine up-sampling it does not need
  upsample.S(humidSynCd, sHumPrev); upsample.S(humidSynC, sHumCur); upsample.S(shearSynCd, sShPrev); upsample.S(shearSynC, sShCur);
  const sp0 = 1 - synT, sp1 = synT;
  if (sAnomDirty) {
    anomC.fill(0);
    for (let k = 0; k < K; k++) { const c = pc[k]; if (!c) continue; const o = k * CN; for (let q = 0; q < CN; q++) anomC[q] += c * eofC[o + q]; }
    upsample.S(anomC, sAnomF);
    const c0 = ensoLag(0), c3 = ensoLag(91), c6 = ensoLag(183);
    for (let q = 0; q < CN; q++) ensoCo[q] = c0 * ensoC[q] + c3 * ensoC[CN + q] + c6 * ensoC[2 * CN + q];
    upsample.S(ensoCo, sEnsoF);
    humidAnomC.fill(0);
    for (let k = 0; k < KH; k++) { const c = pcH[k]; if (!c) continue; const o = k * CN; for (let q = 0; q < CN; q++) humidAnomC[q] += c * humidEofC[o + q]; }
    upsample.S(humidAnomC, sHAnomF);
    for (let q = 0; q < CN; q++) humidEnsoCo[q] = c0 * humidEnsoC[q] + c3 * humidEnsoC[CN + q] + c6 * humidEnsoC[2 * CN + q];
    upsample.S(humidEnsoCo, sHEnsoF);
    shearAnomC.fill(0);
    for (let k = 0; k < KS; k++) { const c = pcS[k]; if (!c) continue; const o = k * CN; for (let q = 0; q < CN; q++) shearAnomC[q] += c * shearEofC[o + q]; }
    upsample.S(shearAnomC, sSAnomF);
    for (let q = 0; q < CN; q++) shearEnsoCo[q] = c0 * shearEnsoC[q] + c3 * shearEnsoC[CN + q] + c6 * shearEnsoC[2 * CN + q];
    upsample.S(shearEnsoCo, sSEnsoF);
    sAnomDirty = false;
  }
  computeFeatures(doy, wf, w0, w1, w2, w3, A0, A1, A2, A3);
  { // sea-surface temperature (computeField's combine loop, on the storm grid)
    const fs = P.features, vs = P.variability, sa = P.seasonal, wm = P.warming, es = P.enso, wmUp = Math.max(0, wm), saUp = 1 + (sa - 1) * 0.6;
    for (let js = 0; js < NYS; js++) {
      const j = js * SS, ceil = seaCeil(LAT1 - j * RES) + wmUp, c0 = ceil - 1.2;
      for (let is = 0; is < NXS; is++) {
        const k = j * NX + is * SS, ks = js * NXS + is;
        if (outOfBasin[k]) { oS[ks] = NaN; continue; }
        const mth = w0 * A0[k] + w1 * A1[k] + w2 * A2[k] + w3 * A3[k], fn = featN[k], dev = mth - annual[k];
        const peakBoost = dev > 0 ? WARM_PEAK_BIAS * Math.tanh(dev / 1.5) : 0;
        let an = vs * sAnomF[ks] + es * sEnsoF[ks]; if (an > 2) an = 2 + 1.5 * Math.tanh((an - 2) / 1.5); else if (an < -2) an = -2 - 1.5 * Math.tanh((-an - 2) / 1.5);
        let v = annual[k] + (dev > 0 ? saUp : sa) * dev + peakBoost + fs * (fn + vs * featD[k]) + an + wm;
        if (v > c0) v = c0 + 1.2 * Math.tanh((v - c0) / 1.2);
        if (v > 38) v = 38 + 1.5 * Math.tanh((v - 38) / 1.5); else if (v < -1.8) v = -1.8 - 1.5 * Math.tanh((-v - 1.8) / 1.5);
        oS[ks] = v;
      }
    }
  }
  { // humidity
    const hvs = P.variability * seasGain(humidSeas && humidSeas.eof, p), hes = P.enso * seasGain(humidSeas && humidSeas.enso, p), hws = P.synoptic, hmo = P.moisture;
    const HA0 = humidClimF[M(m1 - 1)], HA1 = humidClimF[M(m1)], HA2 = humidClimF[M(m1 + 1)], HA3 = humidClimF[M(m1 + 2)];
    for (let js = 0; js < NYS; js++) {
      const j = js * SS;
      for (let is = 0; is < NXS; is++) {
        const k = j * NX + is * SS, ks = js * NXS + is;
        if (outOfBasin[k]) { oH[ks] = NaN; continue; }
        const mth = w0 * HA0[k] + w1 * HA1[k] + w2 * HA2[k] + w3 * HA3[k], syn = sp0 * sHumPrev[ks] + sp1 * sHumCur[ks];
        let v = mth + hvs * sHAnomF[ks] + hes * sHEnsoF[ks] + hws * syn + hmo;
        if (v > 95) v = 95 + 5 * Math.tanh((v - 95) / 5); else if (v < 3) v = 3 * Math.exp((v - 3) / 3);
        oH[ks] = v;
      }
    }
  }
  { // wind shear
    const svs = P.variability * seasGain(shearSeas && shearSeas.eof, p), ses = P.enso * seasGain(shearSeas && shearSeas.enso, p), sws = P.shearSynoptic, ssh = P.shearShift;
    const SA0 = shearClimF[M(m1 - 1)], SA1 = shearClimF[M(m1)], SA2 = shearClimF[M(m1 + 1)], SA3 = shearClimF[M(m1 + 2)];
    jetAxisFinal(jetAxisSt);
    for (let i = 0; i < NX; i++) { const fc = i / RATIO, c0 = Math.min(CNX - 2, Math.floor(fc)), t = fc - c0; jetAxisFS[i] = jetAxisSt[c0] * (1 - t) + jetAxisSt[c0 + 1] * t; }
    for (let js = 0; js < NYS; js++) {
      const j = js * SS, lat = LAT1 - j * RES;
      for (let is = 0; is < NXS; is++) {
        const i = is * SS, k = j * NX + i, ks = js * NXS + is;
        if (outOfBasin[k]) { oSh[ks] = NaN; continue; }
        const mth = w0 * SA0[k] + w1 * SA1[k] + w2 * SA2[k] + w3 * SA3[k] - jetSmearF[k], syn = sp0 * sShPrev[ks] + sp1 * sShCur[ks];
        let v = mth + svs * sSAnomF[ks] + ses * sSEnsoF[ks] + sws * SHEAR_TEXTURE_GAIN * syn + ssh;
        const off = Math.abs(lat - jetAxisFS[i]);
        if (off < JET_LUT_MAX) { const n = off / JET_LUT_STEP, n0 = n | 0; v += jetBumpLut[n0] + (n - n0) * (jetBumpLut[n0 + 1] - jetBumpLut[n0]); }
        if (v > 115) v = 115 + 10 * Math.tanh((v - 115) / 10); else if (v < 2) v = 2 * Math.exp((v - 2) / 2);
        oSh[ks] = v;
      }
    }
  }
}

const BI = HFStorms.basinInfo(STORM_BASIN), SM = BI.seasonMonth;      // STORM_BASIN is this page's basin (the template says which); BI: its label, season, words, region (src/storms.js, BASINS); SM: the month its season starts (0 January, 6 July)
const SCALE = HFStorms.scaleOf(STORM_BASIN), BAR = SCALE.bar;      // this basin's own intensity scale (src/storms.js, SCALES) and the tags of the season bar's three strength counters (>= 64, 96 and 137 kt)
const HURR_TAG = BAR[0];
{ [['se-hurr', 0], ['se-major', 1], ['se-c5', 2]].forEach(([id, k]) => { const e = $(id); if (e && e.nextSibling) e.nextSibling.textContent = BAR[k]; }); }
const hurrWord = (t) => (BI.hurricane === 'hurricane' ? t : t.replace(/Hurricane/g, BI.hurricane[0].toUpperCase() + BI.hurricane.slice(1)).replace(/hurricane/g, BI.hurricane));      // the local word for a hurricane-strength cyclone
const seasonLabel = (y) => (SM ? y + '\u2013' + String((y + 1) % 100).padStart(2, '0') : String(y));      // 2026, or 2026-27 for a southern season
const stormCanvas = makeCanvas(461); stormCanvas.id = 'storm-canvas';
let sumOpen = false, sumYear = 0, sumArch = 0, sumAt = 0, sumGeo = null;
let saveStamp = 0, savedStamp = 0, saveLast = 0, saveOwner = true;     // saveOwner: this page may write the save (false when it opened beside a season it did not resume: see the save / resume block)
function markDirty() { saveStamp++; }                                // anything that changes the running season: the saver writes it out within seconds
if (!BI.waves) document.body.classList.add('no-waves');
const STORMS_READY = !!(DATA.storms && DATA.storms.maps);               // a basin's storm system is switched on by its data: until a page carries the climatology the engine is anchored to (storms.maps) it has no storms and none of their controls
if (!STORMS_READY) document.body.classList.add('no-storms');
let stormMgr = null, stormsOn = STORMS_READY, stormFieldsDirty = true, stormsDirty = true, stormActivity = 1, stormAuto = true, stormSel = null, stormHot = null, stormHits = [], lastStormCardAt = 0;
const STORM_KEY_H = 6;                                                // the steering and the pressure are taken every 6 h (the wave sums are the cost of a simulated day), the fields of SST / humidity / shear once a day
const mkU = () => [new Float32Array(SN), new Float32Array(SN), new Float32Array(SN)];
const kfU = mkU(), kfV = mkU(), kfP = new Float32Array(SN);           // the latest steering keyframe (shallow / medium / deep winds, sea-level pressure) ...
const kfU0 = mkU(), kfV0 = mkU(), kfP0 = new Float32Array(SN);        // ... and the one before it
const wkU = mkU(), wkV = mkU();                                       // what the engine reads: the latest keyframe carried forward by the change since the one before it (linear, hour by hour: more exact than holding it for six hours)
let kfHour = -1e9, kfHour0 = -1e9, kfBreak = true, wkHour = -1e9;     // when they were taken; kfBreak: the next keyframe has nothing to be carried from (the start, a slider moved)
/* Lakes are water for a storm. The map draws every lake with a temperature of its own and the land mask under it says "land", so a storm put on the Great Lakes met cold made-up
   sea and a coast on every side and died at once. Here the page's own lake polygons are rastered onto the fine grid (the first time a storm asks), a node inside a lake is not land for
   the storms, and over it the sea temperature is the lake's (stormLakes: the same formula as updateLakes, taken at the keyframe from the storm grid's anomalies, so that storms
   stay a function of the seed and not of when the map was last redrawn). What a lake does to a storm after that is the engine's own physics, nothing is forbidden: warm enough
   water, little shear and moist air let it grow, the shore ring of the land test takes its share, a lake the size of a storm cannot feed one for long. */
let lakeGrid = null;                                                  // per fine node: 0 = no lake, otherwise the lake's index + 1
function buildLakeGrid() {
  lakeGrid = new Uint16Array(N);
  const inside = (rings, x, y) => { let c = false; for (let r = 0; r < rings.length; r++) { const xs = rings[r].xs, ys = rings[r].ys; for (let a = 0, b = xs.length - 1; a < xs.length; b = a++) if ((ys[a] > y) !== (ys[b] > y) && x < (xs[b] - xs[a]) * (y - ys[a]) / (ys[b] - ys[a]) + xs[a]) c = !c; } return c; };
  for (let li = 0; li < LAKES.length; li++) {
    const Lk = LAKES[li], g0 = stNormLon(Lk.x0 * 360 - 180), g1 = stNormLon(Lk.x1 * 360 - 180), latN = invMerc(Lk.y0), latS = invMerc(Lk.y1);
    const i0 = Math.max(0, Math.ceil((g0 - LON0) / RES)), i1 = Math.min(NX - 1, Math.floor((g1 - LON0) / RES)), j0 = Math.max(0, Math.ceil((LAT1 - latN) / RES)), j1 = Math.min(NY - 1, Math.floor((LAT1 - latS) / RES));
    for (let j = j0; j <= j1; j++) {
      const y = mercN(LAT1 - j * RES);
      for (let i = i0; i <= i1; i++) { let lon = LON0 + i * RES; if (lon > 180) lon -= 360; if (inside(Lk.rings, (lon + 180) / 360, y)) lakeGrid[j * NX + i] = li + 1; }
    }
  }
}
function lakeIdAt(lat, lon) {
  const i = Math.round((lon - LON0) / RES), j = Math.round((LAT1 - lat) / RES);
  if (i < 0 || j < 0 || i >= NX || j >= NY) return 0;
  if (!lakeGrid) buildLakeGrid();
  return lakeGrid[j * NX + i];
}
function stormLand(lat, lon) {                                       // land for a storm: the land mask, except where a lake lies
  const i = Math.round((lon - LON0) / RES), j = Math.round((LAT1 - lat) / RES);
  if (i < 0 || j < 0 || i >= NX || j >= NY) return false;
  if (!lakeGrid) buildLakeGrid();
  const k = j * NX + i; return land[k] === 1 && lakeGrid[k] === 0;
}
const kfLake = new Float32Array(LAKES.length);                        // the lakes' temperatures at the latest field keyframe
function stormLakes(out) {                                           // updateLakes' formula, on the storm grid's anomalies and the keyframe's clock
  const d = simDate(simHour), y = d.getUTCFullYear(), doy = (d.getTime() - Date.UTC(y, 0, 1)) / 86400000, ylen = ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365, f = doy / ylen;
  const sa = P.seasonal, saUp = 1 + (sa - 1) * 0.6, vs = P.variability, wm = P.warming;
  for (let i = 0; i < LAKES.length; i++) {
    const L = LAKE_META[i], c = lakeClim(L, f, doy), T = c[0], tm = c[1];
    let an = vs * 1.2 * sampleFieldS(sAnomF, L.lat, L.lon); if (an !== an) an = 0; if (an > 3) an = 3 + 1.2 * Math.tanh((an - 3) / 1.2); else if (an < -3) an = -3 - 1.2 * Math.tanh((-an - 3) / 1.2);
    let v = tm + (T >= tm ? saUp : sa) * (T - tm) + an + wm * 0.9;
    const lc0 = seaCeil(L.lat) - 1 + Math.max(0, wm); if (v > lc0) v = lc0 + 1.2 * Math.tanh((v - lc0) / 1.2); if (T >= 0 && v < 0) v = 0;
    out[i] = v;
  }
}
function carrySteer(h, U, V, U0, V0, T, T0, oU, oV) {
  const a = T0 > -1e8 && T > T0 ? (h - T) / (T - T0) : 0;
  for (let i = 0; i < 3; i++) {
    const u = U[i], v = V[i], u0 = U0[i], v0 = V0[i], ou = oU[i], ov = oV[i];
    if (a > 0) for (let n = 0; n < SN; n++) { ou[n] = u[n] + a * (u[n] - u0[n]); ov[n] = v[n] + a * (v[n] - v0[n]); } else { ou.set(u); ov.set(v); }
  }
}
const kfSst = new Float32Array(NSF), kfHumid = new Float32Array(NSF), kfShear = new Float32Array(NSF);          // the storm grid (computeStormFields)
let kfFieldHour = -1, kfStamp = 0, lowsStamp = -1, lowsCache = [], kfSstRef = 28.2;
function stormKeyframe(fields) {
  steerUpdate(); kfStamp++;
  for (let i = 0; i < 3; i++) { kfU0[i].set(kfU[i]); kfV0[i].set(kfV[i]); } kfP0.set(kfP); kfHour0 = kfHour;
  kfU[0].set(stU.shallow); kfV[0].set(stV.shallow); kfU[1].set(stU.medium); kfV[1].set(stV.medium); kfU[2].set(stU.deep); kfV[2].set(stV.deep); kfP.set(stPt); kfHour = simHour;
  if (kfBreak) { for (let i = 0; i < 3; i++) { kfU0[i].set(kfU[i]); kfV0[i].set(kfV[i]); } kfP0.set(kfP); kfHour0 = -1e9; kfBreak = false; }
  wkHour = -1e9; stormEnv.beginHour(simHour);
  if (fields) { computeStormFields(kfSst, kfHumid, kfShear); stormLakes(kfLake); kfFieldHour = simHour; stormFieldsDirty = false; kfSstRef = mdrMeanSst(); }
  if (stormClim) climAccumulate(fields);
}
/* the mean sea-surface temperature of the basin's main development region (BI.mdr, water only) in the last field keyframe: the reference of "relative SST" */
function mdrMeanSst(arr = kfSst) {
  let t = 0, n = 0;
  const la0 = Math.min(BI.mdr.lat[0], BI.mdr.lat[1]), la1 = Math.max(BI.mdr.lat[0], BI.mdr.lat[1]);
  for (let la = la0; la <= la1 + 1e-9; la += 2.5) for (let lo = BI.mdr.lon[0]; lo <= BI.mdr.lon[1] + 1e-9; lo += 2.5) { if (isLand(la, lo)) continue; const v = sampleFieldS(arr, la, lo); if (v === v) { t += v; n++; } }
  return n ? t / n : 28.2;
}
const envFrom = (U, V, Pk, SST, RH, SH, REF, LK) => ({                                // the engine's environment over one set of keyframe arrays
  box: { lat0: ST_LAT0, lat1: ST_LAT1, lon0: ST_LON0, lon1: ST_LON1 },
  sst: (la, lo) => { const id = lakeIdAt(la, lo); return id ? LK[id - 1] : sampleFieldS(SST, la, lo); }, rh: (la, lo) => sampleFieldS(RH, la, lo), shear: (la, lo) => sampleFieldS(SH, la, lo),
  steer(la, lo, o) { o[0] = stSample(U[0], la, lo); o[1] = stSample(V[0], la, lo); o[2] = stSample(U[1], la, lo); o[3] = stSample(V[1], la, lo); o[4] = stSample(U[2], la, lo); o[5] = stSample(V[2], la, lo); },
  slp: (la, lo) => (Pk ? stSample(Pk, la, lo) : NaN), isLand: stormLand, sstRef: () => REF, enso: () => n34,                // REF: the main development region's mean SST of that keyframe (what relative SST is measured against)
});
/* the sea-level-pressure minima (lows) of a node-grid pressure field: the mirror image of steerDetectHighs(), refined with a parabola */
const ST_LOW_MAX = 1008, ST_LOW_PROM = 2.0, ST_LOW_LAT0 = BI.lowLat0, ST_LOW_LAT1 = 68;
function detectLowsOn(Pn) {
  const out = [];
  for (let j = 2; j < SNY - 2; j++) for (let i = 2; i < SNX - 2; i++) {
    const n = j * SNX + i, p = Pn[n], al = Math.abs(stNodeLat[n]);
    if (!(p <= ST_LOW_MAX) || al < ST_LOW_LAT0 || al > ST_LOW_LAT1) continue;
    let low = true;
    for (let dj = -1; dj <= 1 && low; dj++) for (let di = -1; di <= 1; di++) { if ((di || dj) && Pn[n + dj * SNX + di] <= p) { low = false; break; } }
    if (!low) continue;
    const ring = (Pn[n - 2] + Pn[n + 2] + Pn[n - 2 * SNX] + Pn[n + 2 * SNX] + Pn[n - 2 - 2 * SNX] + Pn[n + 2 - 2 * SNX] + Pn[n - 2 + 2 * SNX] + Pn[n + 2 + 2 * SNX]) / 8;
    if (ring - p < ST_LOW_PROM) continue;
    const l = Pn[n - 1], r = Pn[n + 1], u = Pn[n - SNX], dn = Pn[n + SNX];
    const cx = l + r - 2 * p, cy = u + dn - 2 * p;
    const ox = cx > 1e-6 ? Math.max(-1, Math.min(1, (l - r) / (2 * cx))) : 0, oy = cy > 1e-6 ? Math.max(-1, Math.min(1, (dn - u) / (2 * cy))) : 0;
    const pk = p - (cx > 1e-6 ? (r - l) * (r - l) / (8 * cx) : 0) - (cy > 1e-6 ? (u - dn) * (u - dn) / (8 * cy) : 0);
    out.push({ lat: stNodeLat[n] + oy * STRES, lon: stNodeLon[n] + ox * STRES, p: pk, prom: ring - p });
  }
  return out;
}
const stormEnv = {
  box: { lat0: ST_LAT0, lat1: ST_LAT1, lon0: ST_LON0, lon1: ST_LON1 },
  beginHour(h) { if (h !== wkHour) { wkHour = h; carrySteer(h, kfU, kfV, kfU0, kfV0, kfHour, kfHour0, wkU, wkV); } },          // the engine says which hour it is about to step: the steering of that hour
  sst: (la, lo) => { const id = lakeIdAt(la, lo); return id ? kfLake[id - 1] : sampleFieldS(kfSst, la, lo); }, rh: (la, lo) => sampleFieldS(kfHumid, la, lo), shear: (la, lo) => sampleFieldS(kfShear, la, lo),
  steer(la, lo, o) { o[0] = stSample(wkU[0], la, lo); o[1] = stSample(wkV[0], la, lo); o[2] = stSample(wkU[1], la, lo); o[3] = stSample(wkV[1], la, lo); o[4] = stSample(wkU[2], la, lo); o[5] = stSample(wkV[2], la, lo); },
  slp: (la, lo) => stSample(kfP, la, lo), isLand: stormLand, sstRef: () => kfSstRef, enso: () => n34,
  lows: () => { if (lowsStamp !== kfStamp) { lowsCache = detectLowsOn(kfP); lowsStamp = kfStamp; } return lowsCache; },   // read-only for every engine that asks
};
/* Calibration lab (dev only, tools/storm_mc.mjs): extra engines with other parameters run on the SAME keyframes and the same seed, so
   a comparison of parameter sets sees identical weather and identical waves (common random numbers). They never touch the live engine. */
let stormLab = null, stormMapsOverride = null, stormClim = null, lowsKept = null;
const stormMapsNow = () => stormMapsOverride || (DATA.storms && DATA.storms.maps) || null;   // the climatology the engine is anchored to (data.json's `storms.maps`; the fitting tools hand in candidates)
const stormSeed = () => ((P.seed * 2654435761) ^ 0x517171) >>> 0;
/* the page's own mean steering and environment on the maps' grid, by month: what the engine's "anomaly" and "E" are measured against (tools/storm_fit.mjs) */
function climAccumulate(fields) {
  const C = stormClim; if (!C) return;
  const m = simDate(simHour).getUTCMonth(), t = new Float64Array(6);
  for (let k = 0; k < C.n; k++) { HFStorms.steerRing(stormEnv, C.lat[k], C.lon[k], C.R, t); const o = (m * C.n + k) * 6; for (let q = 0; q < 6; q++) C.steer[o + q] += t[q]; C.ns[m * C.n + k]++; }
  if (fields && simHour % 24 === 0) {
    for (let k = 0; k < C.n; k++) {
      const la = C.lat[k], lo = C.lon[k], s = sampleFieldS(kfSst, la, lo), r = sampleFieldS(kfHumid, la, lo), sh = sampleFieldS(kfShear, la, lo);
      if (s === s && r === r && sh === sh && !isLand(la, lo)) { const o = m * C.n + k; C.sst[o] += s; C.rh[o] += r; C.shear[o] += sh; C.rel[o] += s - kfSstRef; C.ne[o]++; }
    }
  }
}
function labRecord(m) {
  const mon = (h) => m.dateAt(h).getUTCMonth(), TCs = m.systems.filter((S) => S.depNum > 0), out = { stats: m.stats(), n: m.n, hour: m.hour };
  out.depByMonth = new Array(12).fill(0); out.namedByMonth = new Array(12).fill(0); out.aceByMonth = new Array(12).fill(0);
  const ad = m.season.aceDaily, y = m.season.year;
  for (let d = 0; d < ad.length; d++) out.aceByMonth[new Date(Date.UTC(y, SM, 1 + d)).getUTCMonth()] += ad[d];
  out.storms = TCs.map((S) => {
    const fx = S.fixes.filter((f) => f.h % 6 === 0), byH = {}; for (const f of fx) byH[f.h] = f;      // the six-hourly (synoptic) fixes: what the real best track holds
    let ri = 0, win = 0, riAny = false;
    for (const f of fx) { if ((f.th === 'tc' || f.th === 'sc') && f.v >= 25) { const g = byH[f.h + 24]; if (g && (g.th === 'tc' || g.th === 'sc' || g.th === 'ex' || g.th === 'nl')) { win++; if (g.v - f.v >= 30) { ri++; riAny = true; } } } }
    const tcFx = fx.filter((f) => f.th === 'tc' || f.th === 'sc'), first = tcFx[0], nf = fx.find((f) => f.v >= 34 && (f.th === 'tc' || f.th === 'sc')), lastN = fx.slice().reverse().find((f) => f.v >= 34 && (f.th === 'tc' || f.th === 'sc'));
    const rows = tcFx.map((f) => [f.lat, f.lon, f.v, f.spd, f.dir, f.sst, f.sh, f.rh, f.h, f.land ? 1 : 0]);
    const THC = { tc: 0, sc: 1, ex: 2, nl: 3, wv: 4 }, trk = fx.map((f) => [f.lat, f.lon, f.v, f.h, THC[f.th], f.land ? 1 : 0, f.sst, f.sh]);   // the whole path, wave stage and post-tropical stage included, with the sea temperature and shear it saw
    return { id: S.id, origin: S.origin, th: S.th, named: S.namedHour >= 0, peak: Math.max(0, ...tcFx.map((f) => f.v)), ace: S.ace, td: S.tdHour, nh: S.namedHour, ri, win, riAny, end: S.endReason || (S.alive ? 'alive' : ''), maxLat: fx.reduce((a, f) => Math.max(a, f.lat), -90), lastLat: fx.length ? fx[fx.length - 1].lat : null,
      etLat: (fx.find((f) => f.th === 'ex') || {}).lat, etV: (fx.find((f) => f.th === 'ex') || {}).v,
      sub: tcFx.some((f) => f.th === 'sc'), subNamed: fx.some((f) => f.st === 'SS'), et: S.namedHour >= 0 && fx.some((f) => f.th === 'ex'), hours: nf && lastN ? lastN.h - nf.h : 0,
      tdMonth: S.tdHour >= 0 ? mon(S.tdHour) : -1, namedMonth: S.namedHour >= 0 ? mon(S.namedHour) : -1,
      gen: first ? [first.lat, first.lon, first.v, first.sst, first.sh, first.rh, first.h] : null, genN: nf ? [nf.lat, nf.lon, nf.v, nf.sst, nf.sh, nf.rh] : null, rows, trk, kind: S.kind, sub0: S.sub };
  });
  for (const st of out.storms) { if (st.tdMonth >= 0) out.depByMonth[st.tdMonth]++; if (st.namedMonth >= 0) out.namedByMonth[st.namedMonth]++; }
  out.diag = m.diagPacked ? m.diagPacked() : null; out.waves = m.n.W; out.seeds = m.n.N;
  out.lows = m.lows.done.concat(m.lows.tracks.filter((t) => t.alive).map((t) => [t.born, m.hour, t.n, t.pmin])).map((r) => [mon(r[0]), r[2], Math.round(r[3]), r[1] - r[0]]);   // [month, fixes, deepest hPa, hours]
  return out;
}
function stormsReset() {
  stormMgr = HFStorms.create({ seed: stormSeed(), startMs: START_MS, hour0: simHour, auto: stormAuto, autoRate: stormActivity, maps: stormMapsNow(), basin: STORM_BASIN });
  stormLab = null; shadow = null; stormFieldsDirty = true; kfBreak = true; kfFieldHour = -1; stormSel = null; stormHot = null; stormHits = []; stormsDirty = true;
  sumArch = 0; if (sumOpen) closeSummary();
  const card = $('storm-card'), tip = $('storm-tip'); if (card) card.hidden = true; if (tip) tip.style.display = 'none';
  updateSeasonBar();
}
function stormEnvChanged() { stormFieldsDirty = true; kfBreak = true; shadowStale(); markDirty(); }             // a slider / ENSO / seed change: the storms see the new weather at the next keyframe (the steering is not carried across the change)
function stormsAdvance(n) {
  if (!stormMgr) stormsReset();
  if (kfFieldHour < 0) stormKeyframe(true);                        // first use after a (re)start: keyframe at the current hour
  let left = n;
  while (left > 0) {
    const k = Math.min(left, STORM_KEY_H - (((simHour % STORM_KEY_H) + STORM_KEY_H) % STORM_KEY_H));
    simHour += k;
    if (simHour % 24 === 0) stepDay();                               // a sub-chunk never crosses midnight: it ends exactly on it
    jetClockH += k * P.jetSpeed;
    left -= k;
    stormMgr.advanceTo(simHour, stormEnv);                           // every hour runs on the keyframe taken at or before its start
    if (stormMgr.archive.length !== sumArch) seasonEnded();            // Jan 1: the finished season's paths are gone; show how it went
    if (stormLab) for (const m of stormLab) m.advanceTo(simHour, stormEnv);
    if (simHour % STORM_KEY_H === 0) {
      const midnight = simHour % 24 === 0;
      if (midnight) { const d = Math.floor(simHour / 24); advanceSynDraws(d); advanceShearSynDraws(d); }
      stormKeyframe(midnight || stormFieldsDirty);
    }
  }
  dirty = true; stormsDirty = true; updateSeasonBar(); markDirty();
}
function stormsSwitch(on, force) {
  if (!STORMS_READY && !force) return false;                        // a page without its climatology yet can not be switched on by a visitor (the fitting tools force it: they are what makes the climatology)
  if (on === stormsOn) return stormsOn;
  stormsOn = !!on;
  if (!stormsOn && typeof placeSet === 'function') placeSet(false);
  if (stormsOn) stormsReset();                                     // storms resume from the current hour with a fresh season
  stormsDirty = true; drawStorms(); updateSeasonBar();
  return stormsOn;
}

/* ---- the whole weather as data: capture / restore ---------------------------------------------------------------------------------------
   Everything that makes the next hour of weather what it is: the three random streams, every generator state (the daily weather modes,
   the synoptic humidity and shear fields with their fine day-before / day-after caches, the jet's history, the steering modes, ENSO
   and its history, the eddies) and the clocks. Taking it, running the weather forward, and putting it back leaves the live sim exactly
   where it was -- that is how the Place preview looks ahead (shadow environment) -- and writing it to disk is what a saved game is.
   `computeField()` etc. recompute every derived array on the next call (anomDirty / stStamp).                                          */
function simCapture() {
  const c32 = (a) => new Float32Array(a);
  return {
    rs, jrs, strs, simHour, dayCount, jetClockH, jetNewest, ensoZr, ensoZi, n34, ensoHi, ensoHold, ensoHeld, lastSynDay, lastShearSynDay, synDay, shearSynDay, synFineDay, shearSynFineDay,
    feat: featState.get(),
    pc: c32(pc), pcH: c32(pcH), pcS: c32(pcS), ensoHist: c32(ensoHist), humidSynC: c32(humidSynC), shearSynC: c32(shearSynC), humidSynCd: c32(humidSynCd), shearSynCd: c32(shearSynCd), pcStPrev: c32(pcStPrev), pcStCur: c32(pcStCur),
    humidSynPrev: c32(humidSynPrev), humidSynCur: c32(humidSynCur), shearSynPrev: c32(shearSynPrev), shearSynCur: c32(shearSynCur),
    jetHist: new Map(Array.from(jetHist, ([k, v]) => [k, c32(v)])),
  };
}
/* The light version, what a saved game keeps: everything simCapture() holds except the four fine daily snapshots (several MB). Each of those is the
   upsampled coarse generator state of one day, and the generators keep that state (humidSynCd / humidSynC, shearSynCd / shearSynC), so only
   the coarse states are written (as base64 of their float32 bytes: exact) and the snapshots are rebuilt on restore. */
function f32b64(a) { const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); let t = ''; for (let i = 0; i < u.length; i += 8192) t += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(t); }
function b64f32(str, into) { const bin = atob(str), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const f = new Float32Array(u.buffer); if (into) { into.set(f); return into; } return f; }
function lightArrays() { return [['pc', pc], ['pcH', pcH], ['pcS', pcS], ['ensoHist', ensoHist], ['humidSynC', humidSynC], ['humidSynCd', humidSynCd], ['shearSynC', shearSynC], ['shearSynCd', shearSynCd], ['pcStPrev', pcStPrev], ['pcStCur', pcStCur]]; }
function simCaptureLight() {
  return {
    rs, jrs, strs, simHour, dayCount, jetClockH, jetNewest, ensoZr, ensoZi, n34, ensoHi, ensoHold, ensoHeld, lastSynDay, lastShearSynDay, synDay, shearSynDay,
    f32: Object.fromEntries(lightArrays().map(([k, a]) => [k, f32b64(a)])),
    feat: featState.get(), jetHist: Array.from(jetHist, ([k, v]) => [k, f32b64(v)]),
  };
}
function simRestoreLight(s) {
  rs = s.rs; jrs = s.jrs; strs = s.strs; simHour = s.simHour; dayCount = s.dayCount; jetClockH = s.jetClockH; jetNewest = s.jetNewest;
  ensoZr = s.ensoZr; ensoZi = s.ensoZi; n34 = s.n34; ensoHi = s.ensoHi; ensoHold = s.ensoHold; ensoHeld = s.ensoHeld; lastSynDay = s.lastSynDay; lastShearSynDay = s.lastShearSynDay; synDay = s.synDay; shearSynDay = s.shearSynDay;
  for (const [k, a] of lightArrays()) b64f32(s.f32[k], a);
  featState.set(s.feat || s); jetHist.clear(); for (const [k, v] of s.jetHist) jetHist.set(k, b64f32(v));
  synFineDay = -999; shearSynFineDay = -999;
  if (synDay > -900) { upsample(humidSynCd, humidSynPrev); upsample(humidSynC, humidSynCur); synFineDay = synDay; }          // Prev is the generator on day synDay, Cur the day after
  if (shearSynDay > -900) { upsample(shearSynCd, shearSynPrev); upsample(shearSynC, shearSynCur); shearSynFineDay = shearSynDay; }
  anomDirty = true; sAnomDirty = true; stStamp = ''; dirty = true;
}
function simRestore(s) {
  rs = s.rs; jrs = s.jrs; strs = s.strs; simHour = s.simHour; dayCount = s.dayCount; jetClockH = s.jetClockH; jetNewest = s.jetNewest;
  ensoZr = s.ensoZr; ensoZi = s.ensoZi; n34 = s.n34; ensoHi = s.ensoHi; ensoHold = s.ensoHold; ensoHeld = s.ensoHeld; lastSynDay = s.lastSynDay; lastShearSynDay = s.lastShearSynDay; synDay = s.synDay; shearSynDay = s.shearSynDay; synFineDay = s.synFineDay; shearSynFineDay = s.shearSynFineDay;
  pc.set(s.pc); pcH.set(s.pcH); pcS.set(s.pcS); ensoHist.set(s.ensoHist); humidSynC.set(s.humidSynC); shearSynC.set(s.shearSynC); humidSynCd.set(s.humidSynCd); shearSynCd.set(s.shearSynCd); pcStPrev.set(s.pcStPrev); pcStCur.set(s.pcStCur);
  humidSynPrev.set(s.humidSynPrev); humidSynCur.set(s.humidSynCur); shearSynPrev.set(s.shearSynPrev); shearSynCur.set(s.shearSynCur);
  featState.set(s.feat || s); jetHist.clear(); for (const [k, v] of s.jetHist) jetHist.set(k, new Float32Array(v));
  anomDirty = true; sAnomDirty = true; stStamp = ''; dirty = true;
}

/* ---- shadow environment: the weather of the next days, for the Place preview ----------------------------------------------------------------
   The weather is a pure function of the seed, the settings and the clock, so "what will the steering / SST / humidity / shear be in 5 days" is
   answered by running the weather itself forward from a captured copy of its state and putting the state back (simCapture / simRestore): the
   keyframes it takes on the way (steering every 3 h, the fields every 00Z) are exactly the ones the live engine will take when the clock gets there,
   so a system placed now follows its preview. Nothing here touches the live engine or its keyframes. ~0.4 s for 7 days; the arrays are pooled.     */
const SHADOW_H = 7 * 24 + 6;
let shadow = null, shadowPool = null;
function shadowBuild() {
  if (kfFieldHour < 0) stormKeyframe(true);                               // the engine's own keyframes must exist before they are copied
  if (!shadowPool) shadowPool = { kf: Array.from({ length: 40 }, () => ({ h: 0, u: mkU(), v: mkU(), p: new Float32Array(SN) })),
    fd: Array.from({ length: 10 }, () => ({ h: 0, ref: 28.2, sst: new Float32Array(NSF), humid: new Float32Array(NSF), shear: new Float32Array(NSF), lake: new Float32Array(LAKES.length) })), sU: mkU(), sV: mkU() };
  const Pl = shadowPool, t0 = simHour, snap = simCapture(), wasDirty = dirty;
  let nk = 0, nf = 0;
  const putKf = (h, U, V, Pk) => { const k = Pl.kf[nk++]; k.h = h; for (let i = 0; i < 3; i++) { k.u[i].set(U[i]); k.v[i].set(V[i]); } k.p.set(Pk); };
  putKf(kfHour0, kfU0, kfV0, kfP0); putKf(kfHour, kfU, kfV, kfP);                          // what the live engine is on right now (and the keyframe before it, which its steering is carried forward from)
  { const f = Pl.fd[nf++]; f.h = kfFieldHour; f.ref = kfSstRef; f.sst.set(kfSst); f.humid.set(kfHumid); f.shear.set(kfShear); f.lake.set(kfLake); }
  try {
    let left = SHADOW_H;
    while (left > 0) {
      const k = Math.min(left, STORM_KEY_H - (((simHour % STORM_KEY_H) + STORM_KEY_H) % STORM_KEY_H));
      simHour += k;
      if (simHour % 24 === 0) stepDay();
      jetClockH += k * P.jetSpeed; left -= k;
      if (simHour % STORM_KEY_H === 0) {
        const midnight = simHour % 24 === 0;
        if (midnight) { const d = Math.floor(simHour / 24); advanceSynDraws(d); advanceShearSynDraws(d); }
        steerUpdate();
        putKf(simHour, [stU.shallow, stU.medium, stU.deep], [stV.shallow, stV.medium, stV.deep], stPt);
        if (midnight) { const f = Pl.fd[nf++]; f.h = simHour; computeStormFields(f.sst, f.humid, f.shear); stormLakes(f.lake); f.ref = mdrMeanSst(f.sst); }
      }
    }
  } finally { simRestore(snap); steerUpdate(); dirty = wasDirty; }        // the live state goes back to NOW; the map's own fields were never touched (the look-ahead works on the storm grid), so they are not recomputed
  shadow = { t0, nk, nf, pool: Pl, cache: new Map() };
}
function shadowEnv(h) {                                                   // the environment for hour h: the latest keyframes at or before it, the steering carried forward to the hour exactly as the live engine does
  const sh = shadow, Pl = sh.pool; let i = sh.nk - 1, j = sh.nf - 1;
  while (i > 1 && Pl.kf[i].h > h) i--;
  while (j > 0 && Pl.fd[j].h > h) j--;
  const k = Pl.kf[i], k0 = Pl.kf[i - 1];
  carrySteer(h, k.u, k.v, k0.u, k0.v, k.h, k0.h, Pl.sU, Pl.sV);
  let e = sh.cache.get(j);
  if (!e) { const f = Pl.fd[j]; e = envFrom(Pl.sU, Pl.sV, null, f.sst, f.humid, f.shear, f.ref, f.lake); sh.cache.set(j, e); }
  return e;
}
function shadowStale() { shadow = null; if (placeMode) placeRefresh(); }   // sliders, ENSO, a new seed: the look-ahead is of a different weather now

/* ---- Place mode: a white dot at the pointer, the forecast of what would happen to a system put there ---------------------------------------- */
const PLACE_NAMES = { wave: 'tropical wave', td: 'tropical depression', sd: 'subtropical depression', low: 'low-pressure area' };
let placeMode = false, placeKind = 'wave', placeAtLL = null, placePrev = null, placeWasPlaying = false, placeQueued = false;
function placeSet(on) {
  if (!stormsOn || !stormMgr) on = false;
  if (on === placeMode) return placeMode;
  placeMode = on;
  document.body.classList.toggle('placing', on);
  $('b-place').setAttribute('aria-pressed', on ? 'true' : 'false');
  $('place-menu').hidden = !on;
  map.doubleClickZoom[on ? 'disable' : 'enable']();
  if (on) { placeWasPlaying = playing; if (playing) setPlaying(false); closeStormCard(); $('storm-tip').style.display = 'none'; setTimeout(() => { if (placeMode && (!shadow || simHour - shadow.t0 >= 24)) { shadowBuild(); placeRefresh(); } }, 30); }      // a look-ahead from an earlier session is rebuilt now, not at the first move of the pointer
  else { if (placeWasPlaying) setPlaying(true); placeAtLL = null; placePrev = null; }
  stormsDirty = true; drawStorms();
  return placeMode;
}
function placeRefresh() {                                                 // recompute the forecast for the pointer and redraw (one per frame at most)
  if (placeQueued) return; placeQueued = true;
  requestAnimationFrame(() => {
    placeQueued = false;
    if (!placeMode) return;
    if (placeAtLL && stormMgr) {
      if (!shadow || simHour - shadow.t0 >= 24) shadowBuild();
      placePrev = stormMgr.forecast({ kind: placeKind, lat: placeAtLL.lat, lon: placeAtLL.lng }, { at: shadowEnv }, 7 * 24);
    } else placePrev = null;
    stormsDirty = true; drawStorms();
  });
}
function placeCommit(ll) {
  if (!placeMode || !stormMgr) return;
  const S = stormMgr.place({ kind: placeKind, lat: ll.lat, lon: ll.lng });
  placeSet(false);
  updateSeasonBar(); stormsDirty = true; drawStorms(); markDirty();
  return S;
}
function placeSummary(F) {                                                // one line for the label next to the dot
  if (!F || !F.fixes.length) return '';
  const fx = F.fixes, t0 = fx[0].h, day = (h) => (h - t0) / 24, when = (d) => (d < 1 ? 'within a day' : 'by day ' + (d < 10 ? d.toFixed(1) : Math.round(d)));
  if (placeKind === 'low') {
    const vmax = fx.reduce((a, f) => Math.max(a, f.v), 0), last = fx[fx.length - 1];
    return 'Low-pressure area' + (vmax >= 25 ? ' · up to ' + HFStorms.ktToMph(vmax) + ' mph' : '') + (F.alive ? ' · still there on day 7' : ' · gone ' + when(day(last.h)));
  }
  if (!F.developed) return placeKind === 'wave' ? 'Does not develop' : 'Fizzles';
  const pk = F.peak, pf = fx.find((f) => f.h === pk.h) || fx[0], k = HFStorms.classOf(STORM_BASIN, pk.v, 'tc'), mph = HFStorms.ktToMph(pk.v);
  const kind = pf.th === 'sc' ? (pk.v >= 34 ? 'Subtropical storm' : 'Subtropical depression') : SCALE.major == null ? k.long : k.idx >= 2 ? 'Cat ' + (k.idx - 1) + ' ' + BI.hurricane : k.idx === 1 ? 'Tropical storm' : 'Tropical depression';
  return kind + ' · peak ' + mph + ' mph · ' + when(day(pk.h));
}
function drawPlacePreview(g, toPx) {
  if (!placeAtLL) return;
  const p0 = toPx(placeAtLL.lat, placeAtLL.lng), F = placePrev;
  if (F && F.fixes.length > 1) {
    const pts = F.fixes.map((f) => { const p = toPx(f.lat, f.lon); return { x: p.x, y: p.y, f }; }), n = pts.length;
    g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
    for (let i = 1; i < n; i++) {                                         // fades with lead time: solid for three days, then thinning out
      const lead = (pts[i].f.h - pts[0].f.h) / 24, a = lead < 3 ? 0.95 : Math.max(0.28, 0.95 - (lead - 3) * 0.17);
      g.globalAlpha = a; g.setLineDash(lead > 5 ? [4, 5] : []);
      g.lineWidth = 5; g.strokeStyle = 'rgba(8,10,16,.55)'; g.beginPath(); g.moveTo(pts[i - 1].x, pts[i - 1].y); g.lineTo(pts[i].x, pts[i].y); g.stroke();
      g.lineWidth = 2.6; g.strokeStyle = pts[i].f.th === 'wv' ? 'rgba(255,255,255,.6)' : stormColor(pts[i].f); g.beginPath(); g.moveTo(pts[i - 1].x, pts[i - 1].y); g.lineTo(pts[i].x, pts[i].y); g.stroke();
    }
    g.setLineDash([]);
    for (let i = 1; i < n; i++) {
      const f = pts[i].f, lead = (f.h - pts[0].f.h) / 24; if (f.th === 'wv' || f.h % 6 !== 0) continue;
      g.globalAlpha = lead < 3 ? 0.95 : Math.max(0.28, 0.95 - (lead - 3) * 0.17);
      stormShape(g, shapeOf(f.th), pts[i].x, pts[i].y, 3.6, stormColor(f), 'rgba(8,10,16,.85)', 1.1);
    }
    g.restore();
    const txt = placeSummary(F);
    if (txt) {
      g.save(); g.font = '600 12px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
      const pr = $('panel'), limitX = pr.classList.contains('collapsed') ? W : Math.min(W, pr.getBoundingClientRect().left);        // keep the label on the free part of the map
      const w = g.measureText(txt).width + 14, x = Math.max(8, Math.min(p0.x + 14, limitX - w - 8)), y = Math.min(Math.max(18, p0.y - 22), H - 96);
      g.fillStyle = 'rgba(10,14,24,.88)'; g.beginPath(); g.roundRect(x, y - 11, w, 22, 8); g.fill(); g.fillStyle = '#fff'; g.fillText(txt, x + 7, y + 0.5);
      g.restore();
    }
  }
  g.beginPath(); g.arc(p0.x, p0.y, 6.5, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(8,10,16,.9)'; g.stroke();
}

/* ---- labels, colours, shapes ---------------------------------------------------------------------------------------- */
const STORM_COL = { TD: '#3d8bff', TS: '#2fd27a', C1: '#ffe14a', C2: '#ffa534', C3: '#ff4d3d', C4: '#e53fb5', C5: '#a45dff', EX: '#a9a9a9' };
const NUM_WORD = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty', 'Twenty-One', 'Twenty-Two', 'Twenty-Three', 'Twenty-Four', 'Twenty-Five', 'Twenty-Six', 'Twenty-Seven', 'Twenty-Eight', 'Twenty-Nine', 'Thirty'];
const numWord = (k) => NUM_WORD[k] || String(k);
function stormColor(fix) { if (fix.th === 'ex' || fix.th === 'nl') return STORM_COL.EX; return STORM_COL[HFStorms.category(fix.v).short] || STORM_COL.TD; }
function stormDate(h) { const d = simDate(h); return String(d.getUTCHours()).padStart(2, '0') + 'Z ' + MON[d.getUTCMonth()] + ' ' + d.getUTCDate(); }
function stormDateFull(h) { const d = simDate(h); return String(d.getUTCHours()).padStart(2, '0') + 'z ' + MON[d.getUTCMonth()] + ' ' + d.getUTCDate() + ' ' + d.getUTCFullYear(); }
function stormKindName(S, fix) {                                    // the long status text of a fix
  if (fix.th === 'ex') return 'Extratropical (post-tropical)';
  if (fix.th === 'nl') return S.depNum > 0 ? 'Remnant low' : 'Non-tropical low';
  if (fix.th === 'wv') return fix.st === 'DB' ? 'Disturbance' : fix.st === 'LO' ? 'Low-pressure area' : 'Tropical wave';
  if (fix.th === 'sc') return fix.v >= 34 ? 'Subtropical Storm' : 'Subtropical Depression';
  const k = HFStorms.classOf(STORM_BASIN, fix.v, 'tc');                  // the basin's own scale: Typhoon, Intense Tropical Cyclone, Category 3 Severe Tropical Cyclone ...
  return hurrWord(SCALE.major != null && k.idx >= SCALE.major ? 'Major Hurricane (Cat ' + (k.idx - 1) + ')' : k.long);
}
function stormTitle(S, fix) {                                       // "Bertha", or "Tropical Depression Three" before it has a name
  if (S.name) return S.name;
  if (fix.th === 'nl' && S.depNum === 0) return 'Low ' + S.id;
  if (S.depNum > 0) return (fix.th === 'sc' ? 'Subtropical Depression ' : 'Tropical Depression ') + numWord(S.depNum);
  return S.id;
}
function stormShortLabel(S, fix) {
  if (fix.th === 'nl' && S.depNum === 0) return 'Low';
  if (S.name) return (fix.th === 'ex' ? 'EX ' : fix.th === 'nl' ? 'L ' : '') + S.name;
  return (fix.th === 'sc' ? 'SD ' : fix.th === 'ex' ? 'EX ' : 'TD ') + (S.depNum || '');
}
function stormShape(g, shape, x, y, r, fill, stroke, lw) {          // circle (tropical), square (subtropical), triangle (extratropical, remnant and other non-tropical lows)
  g.beginPath();
  if (shape === 'square') g.rect(x - r, y - r, 2 * r, 2 * r);
  else if (shape === 'triangle') { g.moveTo(x, y - r * 1.15); g.lineTo(x + r, y + r * 0.85); g.lineTo(x - r, y + r * 0.85); g.closePath(); }
  else g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill; g.fill(); if (stroke) { g.lineWidth = lw || 1.4; g.strokeStyle = stroke; g.stroke(); }
}
const shapeOf = (th) => (th === 'sc' ? 'square' : th === 'ex' || th === 'nl' ? 'triangle' : 'circle');          // a remnant or other non-tropical low is a triangle like a post-tropical cyclone

/* ---- drawing -------------------------------------------------------------------------------------------------------- */
function drawStorms() {
  stormsDirty = false;
  const g = stormCanvas.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
  stormHits = [];
  if (!stormsOn || !stormMgr) return;
  const toPx = (lat, lon) => map.latLngToContainerPoint([lat, lon]);
  const only = stormSel ? stormSel.id : null;                       // a selected system is shown alone: every other path, wave and low disappears until it is deselected
  const showWaves = $('stwaves').checked && !only, showLows = $('stlows').checked && !only, showDist = $('stdist').checked && !only, showNames = $('stlabels').checked;
  // precursors are one lifecycle: a wave (dashed line) or a low (L) that has the potential to become a cyclone turns into a disturbance (X in a dashed ring), then a depression
  const drawLow = (p, hPa) => {
    g.beginPath(); g.arc(p.x, p.y, 10, 0, 7); g.fillStyle = '#d6532f'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
    g.fillStyle = '#fff'; g.font = '700 12px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('L', p.x, p.y + 0.5);
    const tx = String(Math.round(hPa)); g.font = '600 11px system-ui, sans-serif'; const tw = g.measureText(tx).width + 10;
    g.fillStyle = 'rgba(10,14,24,.82)'; g.beginPath(); g.roundRect(p.x - tw / 2, p.y + 12, tw, 16, 8); g.fill(); g.fillStyle = '#fff'; g.fillText(tx, p.x, p.y + 20.5);
  };
  const drawDist = (p, col) => {
    g.save(); g.lineCap = 'round'; g.setLineDash([3, 3]); g.lineWidth = 3.5; g.strokeStyle = 'rgba(20,12,4,.55)'; g.beginPath(); g.arc(p.x, p.y, 11, 0, 7); g.stroke();
    g.lineWidth = 1.8; g.strokeStyle = col; g.beginPath(); g.arc(p.x, p.y, 11, 0, 7); g.stroke();
    g.setLineDash([]); g.lineWidth = 3.8; g.strokeStyle = 'rgba(20,12,4,.55)'; g.beginPath(); g.moveTo(p.x - 5, p.y - 5); g.lineTo(p.x + 5, p.y + 5); g.moveTo(p.x + 5, p.y - 5); g.lineTo(p.x - 5, p.y + 5); g.stroke();
    g.lineWidth = 2; g.strokeStyle = col; g.beginPath(); g.moveTo(p.x - 5, p.y - 5); g.lineTo(p.x + 5, p.y + 5); g.moveTo(p.x + 5, p.y - 5); g.lineTo(p.x - 5, p.y + 5); g.stroke(); g.restore();
  };
  if (showLows || showDist) for (const t of stormMgr.lows.tracks) {
    if (!t.alive || t.fixes.length < 3 || HFStorms.lowWeight(stormMgr.par, t.lat) < 0.05 || isLand(t.lat, t.lon)) continue;      // only the lows over water where a depression could still form (the engine weighs a low by its latitude: a ramp, not a window)
    if (t.dist ? !showDist : !showLows) continue;
    const p = toPx(t.lat, t.lon); if (p.x < -20 || p.y < -20 || p.x > W + 20 || p.y > H + 20) continue;
    if (t.dist) {
      drawDist(p, '#ffd27a');
      const tx = String(Math.round(t.p)); g.font = '600 11px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; const tw = g.measureText(tx).width + 10;
      g.fillStyle = 'rgba(10,14,24,.82)'; g.beginPath(); g.roundRect(p.x - tw / 2, p.y + 14, tw, 16, 8); g.fill(); g.fillStyle = '#fff'; g.fillText(tx, p.x, p.y + 22.5);
    } else drawLow(p, t.p);
    stormHits.push({ x: p.x, y: p.y, r: 12, low: t });
  }
  if (showWaves || showLows || showDist) for (const S of stormMgr.systems) {
    if (!S.alive || S.th !== 'wv') continue;
    const stage = S.dist ? 'dist' : S.kind === 'N' ? 'low' : 'wave';                // the same system, drawn for the stage it has reached
    if (stage === 'dist' ? !showDist : stage === 'low' ? !showLows : !showWaves) continue;
    const p = toPx(S.lat, S.lon); if (p.x < -20 || p.y < -30 || p.x > W + 20 || p.y > H + 30) continue;
    const col = stage === 'dist' ? '#ffd27a' : '#ffa24d';
    if (S.fixes.length > 1) {                                                // where it came from: the faint dotted trail that becomes the depression's own if it develops
      g.save(); g.setLineDash([2, 4]); g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,.3)'; g.beginPath();
      S.fixes.forEach((f, i) => { const q = toPx(f.lat, f.lon); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); }); g.lineTo(p.x, p.y); g.stroke(); g.restore();
    }
    if (stage === 'dist') drawDist(p, col);
    else if (stage === 'low') drawLow(p, S.p);
    else {
      g.save(); g.lineCap = 'round'; g.setLineDash([5, 4]);
      g.lineWidth = 4; g.strokeStyle = 'rgba(20,12,4,.55)'; g.beginPath(); g.moveTo(p.x, p.y - 15); g.lineTo(p.x, p.y + 15); g.stroke();
      g.lineWidth = 2; g.strokeStyle = col; g.beginPath(); g.moveTo(p.x, p.y - 15); g.lineTo(p.x, p.y + 15); g.stroke(); g.restore();
    }
    stormHits.push({ x: p.x, y: p.y, r: 13, wave: S });
  }
  const list = stormMgr.systems.filter((S) => (only ? S.id === only : S.depNum > 0 || (S.alive && S.th !== 'wv'))).sort((a, b) => (a.alive - b.alive) || (a.tdHour - b.tdHour) || (a.born - b.born));
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const S of list) {
    const fx = S.fixes, pts = fx.map((f) => { const p = toPx(f.lat, f.lon); return { x: p.x, y: p.y, f }; });
    if (S.alive) { const p = toPx(S.lat, S.lon), f = HFStorms.makeFix(S, stormMgr.hour, S.ace); f.lat = S.lat; f.lon = S.lon; pts.push({ x: p.x, y: p.y, f, live: true }); }
    if (pts.length === 0) continue;
    if (pts.every((q) => q.x < -60 || q.y < -60 || q.x > W + 60 || q.y > H + 60)) continue;
    // pre-genesis trail: faint and dotted
    let first = pts.findIndex((q) => q.f.th !== 'wv'); if (first < 0) first = pts.length;
    if (first > 1) { g.save(); g.setLineDash([2, 4]); g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (let i = 1; i <= Math.min(first, pts.length - 1); i++) g.lineTo(pts[i].x, pts[i].y); g.stroke(); g.restore(); }
    const from = Math.max(0, first - 1);
    // the track: dark halo, then the colour of each leg by the intensity at its end
    g.lineWidth = 5.5; g.strokeStyle = 'rgba(8,10,16,.6)'; g.beginPath(); g.moveTo(pts[from].x, pts[from].y); for (let i = from + 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y); g.stroke();
    for (let i = from + 1; i < pts.length; i++) { g.lineWidth = 3; g.strokeStyle = stormColor(pts[i].f); g.beginPath(); g.moveTo(pts[i - 1].x, pts[i - 1].y); g.lineTo(pts[i].x, pts[i].y); g.stroke(); }
    // advisory dots every three hours: the six-hourly (synoptic) ones are the big dots, the ones between them small, so a peak that comes and goes quickly still shows; the first tropical fix is the white start dot
    let startDone = false;
    for (let i = from; i < pts.length; i++) {
      const q = pts[i], f = q.f; if (q.live || f.th === 'wv') continue;
      const white = !startDone && (f.th === 'tc' || f.th === 'sc'); if (white) startDone = true;
      const syn = white || f.h % 6 === 0;
      stormShape(g, shapeOf(f.th), q.x, q.y, syn ? 4.2 : 2.7, white ? '#ffffff' : stormColor(f), 'rgba(8,10,16,.85)', syn ? 1.3 : 0.9);
      stormHits.push({ x: q.x, y: q.y, r: syn ? 8 : 6, S, f });
    }
    // the live head
    const last = pts[pts.length - 1];
    if (S.alive) {
      const f = last.f; stormShape(g, shapeOf(S.th), last.x, last.y, 8.5, stormColor(f), '#ffffff', 2.2);
      stormHits.push({ x: last.x, y: last.y, r: 13, S, f, live: true });
    }
    if (showNames) {
      let lab = null;
      if (S.alive) lab = { x: last.x, y: last.y, text: stormShortLabel(S, last.f), dx: 13 };
      else { const pk = pts.find((q) => q.f.h === S.peakHour && !q.live) || pts[pts.length - 1]; lab = { x: pk.x, y: pk.y, text: stormShortLabel(S, pk.f), dx: 9 }; }
      g.font = '600 12.5px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.lineWidth = 3.5; g.strokeStyle = 'rgba(8,10,16,.85)'; g.strokeText(lab.text, lab.x + lab.dx, lab.y); g.fillStyle = '#fff'; g.fillText(lab.text, lab.x + lab.dx, lab.y);
    }
  }
  if (placeMode) drawPlacePreview(g, toPx);
  // the selected fix / storm gets a ring
  if (stormSel) {
    const S = stormMgr.get(stormSel.id); const hit = stormHits.find((hh) => hh.S === S && (stormSel.h < 0 ? hh.live : hh.f && hh.f.h === stormSel.h));
    if (hit) { g.lineWidth = 2.4; g.strokeStyle = '#ffffff'; g.beginPath(); g.arc(hit.x, hit.y, hit.r + 3, 0, 7); g.stroke(); }
  }
  if (stormSel && stormSel.h < 0 && performance.now() - lastStormCardAt > 400) { lastStormCardAt = performance.now(); fillStormCard(); }
}
function fillStormCard() {
  const card = $('storm-card'); if (!card || !stormSel) return;
  const S = stormMgr.get(stormSel.id); if (!S) { card.hidden = true; stormSel = null; return; }
  const fx = S.fixes, f = stormSel.h < 0 ? HFStorms.makeFix(S, stormMgr.hour, S.ace) : fx.find((q) => q.h === stormSel.h);
  if (!f) { card.hidden = true; stormSel = null; return; }
  const d = HFStorms.describe(S, f), over = !!f.land;
  $('sc-name').textContent = S.name || stormTitle(S, f);
  $('sc-cat').textContent = stormKindName(S, f);
  $('sc-mph').textContent = d.windMph; $('sc-p').textContent = d.pressure;
  $('sc-peak').style.display = (f.h === S.peakHour && f.v === S.peakV && f.th !== 'wv') ? '' : 'none';
  $('sc-ace').textContent = f.ace.toFixed(1);
  $('sc-sh').textContent = f.sh + ' kt';
  $('sc-gust').textContent = d.gustMph + ' mph (' + (over ? 'land' : 'water') + ')';
  $('sc-mv').textContent = d.move.replace('nearly stationary', 'Stationary');
  $('sc-sst').textContent = (f.sst * 9 / 5 + 32).toFixed(1) + ' °F';
  $('sc-formed').textContent = S.tdHour >= 0 ? stormDateFull(S.tdHour) : '—';
  $('sc-time').textContent = stormDate(f.h);
  card.hidden = false;
}
function openStormCard(S, f, live) { stormSel = { id: S.id, h: live ? -1 : f.h }; lastStormCardAt = 0; fillStormCard(); stormsDirty = true; drawStorms(); }
function closeStormCard() { stormSel = null; $('storm-card').hidden = true; stormsDirty = true; drawStorms(); }
function stormPick(cx, cy) {
  let best = null, bd = 1e9;
  for (const h of stormHits) { const d = Math.hypot(cx - h.x, cy - h.y); if (d <= h.r && d - (h.live ? 0.75 : 0) < bd) { bd = d - (h.live ? 0.75 : 0); best = h; } }       // (the live head wins over the advisory dot under it: the last fix is where the storm is, to a fraction of a pixel)
  return best;
}
function stormHover(cx, cy) {
  const tip = $('storm-tip'), h = stormsOn ? stormPick(cx, cy) : null;
  const key = h ? (h.S ? h.S.id + ':' + (h.live ? 'live' : h.f.h) : h.low ? h.low.id : h.wave.id) : null;
  if (key !== stormHot) { stormHot = key; stormCanvas.style.cursor = ''; }
  if (!h) { tip.style.display = 'none'; map.getContainer().style.cursor = ''; return false; }
  map.getContainer().style.cursor = 'pointer';
  let title, lines;
  if (h.low) { title = (h.low.dist ? 'Disturbance (low) ' : 'Low ') + h.low.id.slice(1); lines = [Math.round(h.low.p) + ' hPa · ' + h.low.fixes.length * 6 + ' h old']; }
  else if (h.wave) { const S = h.wave; title = S.dist ? 'Disturbance' : S.kind === 'N' ? 'Low-pressure area' : 'Tropical wave'; lines = [fmtLL(S.lat, S.lon), HFStorms.compass((Math.atan2(S.cx, S.cy) / DEG + 360) % 360) + ' at ' + Math.round(Math.hypot(S.cx, S.cy)) + ' kt']; }
  else {
    const S = h.S, f = h.f, d = HFStorms.describe(S, f);
    title = stormTitle(S, f);
    lines = [stormKindName(S, f), d.windMph + ' mph (' + d.windKt + ' kt) · gusts ' + d.gustMph + ' mph', d.pressure + ' hPa · ' + (h.live ? 'now' : stormDate(f.h))];
  }
  tip.querySelector('b').textContent = title; tip.querySelector('div').innerHTML = lines.join('<br>');
  const left = Math.max(8, Math.min(W - 236, cx + 16)), top = Math.max(8, Math.min(H - 110, cy + 16));
  tip.style.left = left + 'px'; tip.style.top = top + 'px'; tip.style.display = 'block';
  return true;
}
function stormClick(cx, cy) {
  const h = stormsOn ? stormPick(cx, cy) : null;
  if (h && h.S) openStormCard(h.S, h.f, !!h.live);
  else if (stormSel) closeStormCard();
}
let seasonText = '';
function updateSeasonBar() {
  const el = $('season'); if (!el) return;
  el.style.display = stormsOn && stormMgr ? '' : 'none';
  if (!stormsOn || !stormMgr) return;
  const s = stormMgr.stats(), t = String(s.year) + '|' + s.dep + '|' + s.named + '|' + s.hurr + '|' + s.major + '|' + s.cat5 + '|' + s.ace;
  if (sumOpen && performance.now() - sumAt > 900) fillSummary();
  if (t === seasonText) return; seasonText = t;
  $('se-year').textContent = BI.label + ' ' + seasonLabel(s.year); $('se-dep').textContent = s.dep; $('se-named').textContent = s.named; $('se-hurr').textContent = s.hurr;
  $('se-major').textContent = s.major; $('se-c5').textContent = s.cat5; $('se-ace').textContent = s.ace.toFixed(1);
}

/* ---- the season summary: the totals against the real normals, the accumulated cyclone energy through the year, one row per storm ------------------ */
const SUM = DATA.storms || null;                                     // the real 1991-2020 normals and daily ACE percentiles (tools/merge_data.mjs --storms)
const sumF1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const sumDay = (y, d) => { const t = new Date(Date.UTC(y, SM, 1 + d)); return MON[t.getUTCMonth()] + ' ' + t.getUTCDate(); };            // day d of the season that starts in month SM of year y
const sumYearDays = (y) => Math.round((Date.UTC(y + 1, SM, 1) - Date.UTC(y, SM, 1)) / 86400000);
function sumNiceTop(v) { for (const t of [30, 60, 100, 150, 200, 250, 300, 350, 400, 500, 650, 800, 1000]) if (v <= t) return t; return Math.ceil(v / 250) * 250; }
function openSummary(year) {
  if (!stormMgr) return;
  sumYear = year == null ? stormMgr.season.year : year; sumOpen = true;
  closeStormCard(); $('storm-tip').style.display = 'none';
  $('sum-card').hidden = false; $('se-sum').setAttribute('aria-expanded', 'true'); fillSummary();
}
function closeSummary() { sumOpen = false; sumGeo = null; $('sum-card').hidden = true; $('se-sum').setAttribute('aria-expanded', 'false'); }
function sumStep(dir) {
  const ys = stormMgr.seasonYears(), i = ys.indexOf(sumYear), j = i + dir;
  if (i >= 0 && j >= 0 && j < ys.length) { sumYear = ys[j]; fillSummary(); }
}
function seasonEnded() {
  const n = stormMgr.archive.length, e = stormMgr.archive[n - 1]; sumArch = n;
  stormSel = null; $('storm-card').hidden = true; stormHot = null; $('storm-tip').style.display = 'none'; stormsDirty = true;
  openSummary(e.year);
}
function fillSummary() {
  const rec = stormMgr && stormMgr.seasonRecord(sumYear); if (!rec) { closeSummary(); return; }
  sumAt = performance.now();
  const ys = stormMgr.seasonYears(), i = ys.indexOf(rec.year);
  $('sum-prev').disabled = i <= 0; $('sum-next').disabled = i < 0 || i >= ys.length - 1;
  $('sum-title').textContent = BI.label + ' ' + seasonLabel(rec.year);
  const n = SUM ? SUM.normals : null;
  $('sum-sub').textContent = (rec.current ? 'Season so far, to ' + sumDay(rec.year, rec.day) : rec.open ? 'Season over, a storm is still active' : 'Season complete') + (rec.from > 0 ? ' · counted from ' + sumDay(rec.year, rec.from) : '');
  const cells = [['DEP', rec.dep, n && n.dep], ['NAMED', rec.named, n && n.named], [BAR[0], rec.hurr, n && n.hurr], [BAR[1], rec.major, n && n.major], [BAR[2], rec.cat5, n && n.cat5], ['ACE', sumF1(rec.ace), n && n.ace]];
  $('sum-tot').innerHTML = cells.map(([k, v, a]) => '<div><b>' + v + '</b><span>' + k + '</span><small>' + (a == null ? '' : 'avg ' + sumF1(a)) + '</small></div>').join('');
  drawSumGraph(rec);
  const tb = $('sum-table').querySelector('tbody'); tb.innerHTML = '';
  $('sum-empty').hidden = rec.storms.length > 0; $('sum-table').style.display = rec.storms.length ? '' : 'none';
  for (const s of rec.storms) {
    const c = HFStorms.category(s.peakV), col = STORM_COL[c.short] || STORM_COL.TD, live = s.end == null;
    const tr = document.createElement('tr'); if (live) tr.className = 'live'; tr.dataset.id = s.id;
    const d0 = s.tdHour >= 0 ? simDate(s.tdHour) : null, d1 = s.end != null ? simDate(s.end) : null;
    const dates = d0 ? MON[d0.getUTCMonth()] + ' ' + d0.getUTCDate() + ' – ' + (d1 ? (d1.getUTCMonth() === d0.getUTCMonth() ? '' : MON[d1.getUTCMonth()] + ' ') + d1.getUTCDate() : 'now') : '–';
    tr.innerHTML = '<td><i style="background:' + col + '"></i><b>' + (s.name || 'TD ' + s.depNum) + '</b></td><td>' + HFStorms.classOf(STORM_BASIN, s.peakV, 'tc').short + ' · ' + HFStorms.ktToMph(s.peakV) + '<span class="u"> mph</span></td><td>' + (s.peakV > 0 ? s.peakP : '–') + '</td><td>' + dates + '</td><td>' + sumF1(s.ace) + '</td>';
    tr.onclick = () => sumPick(s.id);
    tb.appendChild(tr);
  }
}
function sumPick(id) {                                              // a row of the table: fly to that storm and open its stat card (only while its track still exists)
  const S = stormMgr.get(id); if (!S) return;
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
$('se-sum').onclick = () => { if (sumOpen) closeSummary(); else openSummary(); };
$('sum-close').onclick = closeSummary;
$('sum-prev').onclick = () => sumStep(-1); $('sum-next').onclick = () => sumStep(1);
/* ==== STORM HOOKS END ==== */
