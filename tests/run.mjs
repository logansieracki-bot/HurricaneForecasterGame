// End-to-end checks in headless Chromium. Needs a prior `npm run build`.
// Network is stubbed to file:// only, so these also verify the app never
// depends on reaching a live tile provider to be usable.
import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const lyrSet = (page, id, on) => page.evaluate(([i, o]) => { const el = document.getElementById(i); if (el.checked !== o) el.click(); }, [id, on]);          // (the layer checkboxes are hidden behind the layer buttons: set them the way a button does)
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ATLANTIC_DIST = join(ROOT, 'dist/atlantic-sst-simulator.html');
const EPAC_DIST = join(ROOT, 'dist/eastpacific-sst-simulator.html');
const WPAC_DIST = join(ROOT, 'dist/westpacific-sst-simulator.html');
const NIO_DIST = join(ROOT, 'dist/nio-sst-simulator.html');
const AUS_DIST = join(ROOT, 'dist/aus-sst-simulator.html');
const SWIO_DIST = join(ROOT, 'dist/swio-sst-simulator.html');
const SPAC_DIST = join(ROOT, 'dist/spac-sst-simulator.html');
const SATL_DIST = join(ROOT, 'dist/satl-sst-simulator.html');
const MED_DIST = join(ROOT, 'dist/med-sst-simulator.html');

let failed = 0;
function check(name, cond) {
  console.log((cond ? 'ok   ' : 'FAIL ') + name);
  if (!cond) failed++;
}

// City markers: pin(s) on the map for real coastal cities that show a hover tooltip with the
// sim's own live SST reading there. Verifies one known city renders, hovers, and can be hidden.
async function checkCityMarkers(page, label, lat, lon, expectedName) {
  await page.evaluate(([lat, lon]) => window.SSTSIM.map.setView([lat, lon], 6), [lat, lon]);
  await page.waitForTimeout(300);
  const pt = await page.evaluate(([lat, lon]) => { const p = window.SSTSIM.map.latLngToContainerPoint([lat, lon]); return { x: p.x, y: p.y }; }, [lat, lon]);
  await page.mouse.move(pt.x, pt.y);
  await page.waitForTimeout(200);
  const tipText = await page.evaluate(() => { const t = document.getElementById('city-tip'); return t.style.display === 'block' ? t.textContent : null; });
  check(`[${label}] hovering a city marker shows its tooltip`, tipText && tipText.includes(expectedName) && /°C/.test(tipText));

  await page.uncheck('#cities');
  await page.mouse.move(pt.x + 1, pt.y + 1);
  await page.mouse.move(pt.x, pt.y);
  await page.waitForTimeout(200);
  const tipHiddenText = await page.evaluate(() => { const t = document.getElementById('city-tip'); return t.style.display; });
  check(`[${label}] "City markers" toggle hides them`, tipHiddenText === 'none');
  await page.check('#cities');
}

// Humidity view: real climatology + day-to-day synoptic noise, same shared architecture across
// every basin that has it (see docs/roadmap.md's "rolled out to all 9 basins" entry) -- checks
// what's basin-generic (view toggle, legend, a real finite sample, real day-to-day variability)
// rather than hardcoding any one basin's own recalibrated threshold value, since each basin's
// own key is deliberately different (checked against real per-basin climatology, not copied).
async function checkHumidity(page, label, lat, lon) {
  await page.evaluate(() => window.SSTSIM.setView('humid'));
  await page.waitForTimeout(200);
  const state = await page.evaluate(() => ({
    pressed: document.querySelector('#seg-view button[data-v="humid"]').getAttribute('aria-pressed'),
    caption: document.getElementById('legend-cap').textContent,
    l265: document.getElementById('l265-label').textContent,
    l2: document.getElementById('l2-label').textContent,
  }));
  check(`[${label}] Humidity button becomes pressed when selected`, state.pressed === 'true');
  check(`[${label}] legend caption switches to the humidity scale`, state.caption === '700 hPa relative humidity, %');
  check(`[${label}] key-line checkbox label mentions this basin's own %RH threshold`, /^\s*\d+% line \(favorable for development\)\s*$/.test(state.l265));
  check(`[${label}] step-line checkbox label mentions its own %RH step`, /^\s*Contour lines every \d+%\s*$/.test(state.l2));

  const sample0 = await page.evaluate(([lat, lon]) => window.SSTSIM.sample(lat, lon), [lat, lon]);
  check(`[${label}] open-ocean humidity sample is real data in range`, Number.isFinite(sample0.humid) && sample0.humid >= 0 && sample0.humid <= 100);

  const series = [];
  for (let d = 0; d < 8; d++) { await page.evaluate(() => window.SSTSIM.advance(24)); series.push((await page.evaluate(([lat, lon]) => window.SSTSIM.sample(lat, lon), [lat, lon])).humid); }
  const mean = series.reduce((a, b) => a + b, 0) / series.length, sd = Math.sqrt(series.reduce((a, b) => a + (b - mean) ** 2, 0) / series.length);
  check(`[${label}] humidity genuinely varies day to day (real synoptic noise, not frozen)`, sd > 1);

  await page.evaluate(() => window.SSTSIM.setView('sst'));   // leave the page in its default state for any checks after this one
}

// Wind Shear + the jet stream, for every basin except the Atlantic (which has its own, longer block above, tuned to its own
// numbers). What is basin-generic is checked here; every number that isn't lives in the basin's spec, and each threshold was set
// from many random seeds (the per-basin figures are in docs/roadmap.md), not from the one run it happened to pass on. The sim is
// paused and given a fixed seed, so every check below is deterministic.
//   pt      an open-ocean point for the range check             city   [lat, lon, name] hover target for the tooltip line
//   enso    [lat, lon, sign]: sign of (forced El Nino - forced La Nina) there, taken from the fitted regression
//   wxPts   open-ocean points for the day-to-day checks         band   [lo, hi] the axis stays inside (signed latitude)
//   lon     [west, east] and lat [south, north] of the grid, in the page's own (virtual) longitudes   latRef  a row the axis often sits near
//   couple  smallest pooled within-seed correlation between the field at latRef and how close the axis is
//   rangeMin / eastMin / dailyMin  smallest mean 20-day axis range / east-minus-west lagged-correlation asymmetry / median day-to-day axis change
//   line    { view: fitBounds window, seed, days, minProbes, margin } for the pixel checks on the drawn line   noteSeed  [seed, 'north'|'south'] with the whole axis off the map
//   offscreen  { center, dir, seed? } a zoomed-in view where the axis (inside the box) is not on screen, and which way it is
async function checkShear(page, label, S) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await ev(() => { window.SSTSIM.setPlaying(false); window.SSTSIM.applySeed(4242); window.SSTSIM.setPlaying(false); });
  const stdOf = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };

  // ---- the view, its legend and labels, a real sample, the city tooltip
  await ev(() => window.SSTSIM.setView('shear'));
  await page.waitForTimeout(200);
  const view = await ev(() => ({
    pressed: document.querySelector('#seg-view button[data-v="shear"]').getAttribute('aria-pressed'),
    caption: document.getElementById('legend-cap').textContent,
    l265: document.getElementById('l265-label').textContent,
    l2: document.getElementById('l2-label').textContent,
  }));
  check(`[${label}] Wind Shear button becomes pressed when selected`, view.pressed === 'true');
  check(`[${label}] legend caption switches to the wind shear scale`, view.caption === '200–850 hPa wind shear, kt');
  check(`[${label}] Shear view's key-line checkbox label mentions the 20 kt key, not 26.5 or a %RH key`, /^\s*20 kt line \(disruptive shear threshold\)\s*$/.test(view.l265));
  check(`[${label}] Shear view's step-line checkbox label mentions its 10 kt step`, /^\s*Contour lines every 10 kt\s*$/.test(view.l2));
  const s0 = await ev(([la, lo]) => window.SSTSIM.sample(la, lo), S.pt);
  check(`[${label}] open-ocean wind shear sample is real data in a sane range`, Number.isFinite(s0.shear) && s0.shear >= 0 && s0.shear < 200);

  await ev(([la, lo]) => window.SSTSIM.map.setView([la, lo], 6), S.city);
  await page.waitForTimeout(300);
  const cityPt = await ev(([la, lo]) => { const p = window.SSTSIM.map.latLngToContainerPoint([la, lo]); return { x: p.x, y: p.y }; }, S.city);
  await page.mouse.move(cityPt.x, cityPt.y);
  await page.waitForTimeout(200);
  const tip = await ev(() => document.getElementById('city-tip').textContent);
  check(`[${label}] city tooltip gains a parallel shear line and threshold line`, /\d+ kt shear/.test(tip) && /(Above|Below) disruptive shear threshold/.test(tip));

  // ---- ENSO: forced El Nino vs. forced La Nina, same seed, ~190 days for the lag-6-month term to phase in (see the Atlantic block)
  const ensoRun = async (target) => {
    await ev((t) => { window.SSTSIM.restart(); window.SSTSIM.setPlaying(false); window.SSTSIM.forceEnso(t); }, target);
    await ev(() => window.SSTSIM.advance(24 * 190));
    return ev(([la, lo]) => window.SSTSIM.sample(la, lo).shear, S.enso);
  };
  const elNino = await ensoRun(2.0), laNina = await ensoRun(-2.0);
  check(`[${label}] forced El Nino ${S.enso[2] > 0 ? 'raises' : 'lowers'} wind shear at ${S.enso[0]}, ${S.enso[1]} vs. forced La Nina, the sign the fitted regression has there (${(elNino - laNina).toFixed(1)} kt)`, S.enso[2] * (elNino - laNina) > 0);
  await ev(() => { window.SSTSIM.applySeed(4242); window.SSTSIM.setPlaying(false); });

  // ---- day-to-day weather: its own slider, genuinely moves the field, and 0 flattens it
  check(`[${label}] "Day-to-day weather (wind shear)" slider defaults to 1x`, (await ev(() => window.SSTSIM.sliderVals())).shearSynoptic === 1);
  const shearDays = async (n) => {
    const series = S.wxPts.map(() => []);
    for (let d = 0; d < n; d++) {
      await ev(() => window.SSTSIM.advance(24));
      const r = await ev((ps) => ps.map(([la, lo]) => window.SSTSIM.sample(la, lo).shear), S.wxPts);
      r.forEach((v, i) => series[i].push(v));
    }
    return series;
  };
  const meanDayToDay = (series) => { let t = 0, c = 0; for (const s of series) for (let i = 1; i < s.length; i++) if (Number.isFinite(s[i]) && Number.isFinite(s[i - 1])) { t += Math.abs(s[i] - s[i - 1]); c++; } return t / c; };
  const withNoise = await shearDays(8);
  check(`[${label}] wind shear genuinely varies day to day at the default slider setting`, withNoise.some((s) => stdOf(s) > 1));
  await ev(() => window.SSTSIM.set('shearSynoptic', 0));
  const withoutNoise = await shearDays(8);
  check(`[${label}] setting the slider to 0 flattens day-to-day wind shear (${meanDayToDay(withoutNoise).toFixed(2)} vs. ${meanDayToDay(withNoise).toFixed(2)} kt/day)`, meanDayToDay(withoutNoise) < 0.85 * meanDayToDay(withNoise));
  await ev(() => { window.SSTSIM.set('shearSynoptic', 1); window.SSTSIM.applySeed(4242); window.SSTSIM.setPlaying(false); });

  // ---- the jet ribbon is in the field. The statistic: the shear on one fixed row (latRef, where the axis often is) against how
  // close the axis is to that row, as the ribbon's own shape, within each seed and then pooled over 8 seeds x 6 days x 10 columns.
  // (A plain "on the axis minus 12 deg off it" contrast, which the Atlantic block uses, does not separate cleanly here: where the
  // jet sits on the edge of the box the climatology's own north-south gradient is as large as the ribbon.)
  const lonsJet = Array.from({ length: 10 }, (_, i) => S.lon[0] + 6 + 2 * Math.round(i * (S.lon[1] - S.lon[0] - 12) / 9 / 2));
  const couple = await ev(async ({ lons, latRef, seeds, days }) => {
    const Sm = window.SSTSIM, kern = (d) => Math.max(0, 1 - d / 12) ** 2, mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    let sxy = 0, sxx = 0, syy = 0;
    for (const seed of seeds) {
      Sm.applySeed(seed); Sm.setPlaying(false);
      const X = [], Y = [];
      for (let d = 0; d < days; d++) {
        Sm.advance(24);
        for (const lon of lons) { const r = Sm.sample(latRef, lon).shear; if (Number.isFinite(r)) { X.push(r); Y.push(kern(Math.abs(latRef - Sm.jetLat(lon)))); } }
      }
      const mx = mean(X), my = mean(Y);
      for (let i = 0; i < X.length; i++) { sxy += (X[i] - mx) * (Y[i] - my); sxx += (X[i] - mx) ** 2; syy += (Y[i] - my) ** 2; }
    }
    return sxy / Math.sqrt(sxx * syy);
  }, { lons: lonsJet, latRef: S.latRef, seeds: [1000, 1007, 1014, 1021, 1028, 1035, 1042, 1049], days: 6 });
  check(`[${label}] the jet ribbon is in the field: shear at ${S.latRef} deg tracks how close the axis is (pooled correlation ${couple.toFixed(2)})`, couple > S.couple);
  await ev(() => { window.SSTSIM.applySeed(4242); window.SSTSIM.setPlaying(false); });

  // ---- how the axis moves (all inside the page with tick()/jetLatLive(), as in the Atlantic block)
  const lonsAll = []; for (let l = S.lon[0] + 2; l <= S.lon[1] - 2; l += 2) lonsAll.push(l);
  const motion = await ev(({ lons, lonsAll, lo, hi, lon0, lon1 }) => {
    const Sm = window.SSTSIM, mean = (a) => a.reduce((x, y) => x + y, 0) / a.length, out = {};
    const six = [0, 1, 2, 3, 4, 5].map((i) => lons[Math.round(i * (lons.length - 1) / 5)]);
    out.daily = []; out.sec = 0; out.finite = true;
    for (const seed of [11, 4242, 90210]) {
      Sm.applySeed(seed); Sm.setPlaying(false);
      const hourly = six.map(() => []);
      for (let h = 0; h <= 20 * 24; h++) { if (h) Sm.tick(1); six.forEach((l, i) => hourly[i].push(Sm.jetLatLive(l))); }
      for (const a of hourly) {
        if (!a.every(Number.isFinite)) out.finite = false;
        for (let d = 24; d < a.length; d += 24) out.daily.push(Math.abs(a[d] - a[d - 24]));
        for (let i = 2; i < a.length; i++) out.sec = Math.max(out.sec, Math.abs(a[i] - 2 * a[i - 1] + a[i - 2]));
      }
    }
    out.daily.sort((x, y) => x - y); out.medDaily = out.daily[Math.floor(out.daily.length / 2)];
    // mean 20-day range over the ten columns
    Sm.applySeed(4242); Sm.setPlaying(false);
    const ser = lons.map(() => []);
    for (let d = 0; d < 20; d++) { Sm.tick(24); lons.forEach((l, i) => ser[i].push(Sm.jetLatLive(l))); }
    out.range20 = mean(ser.map((a) => Math.max(...a) - Math.min(...a)));
    // chunking, speed slider (set AFTER applySeed: applySeed re-syncs every slider from the page), frozen at 0
    const at = () => lons.map((l) => Sm.jetLatLive(l));
    Sm.applySeed(77); Sm.setPlaying(false); Sm.tick(240); const oneTick = at();
    Sm.applySeed(77); Sm.setPlaying(false); for (let i = 0; i < 10; i++) Sm.tick(24); const tenTicks = at();
    out.chunking = Math.max(...oneTick.map((v, i) => Math.abs(v - tenTicks[i])));
    Sm.applySeed(77); Sm.setPlaying(false); Sm.set('jetSpeed', 2); Sm.tick(120); const fast = at();
    Sm.applySeed(77); Sm.setPlaying(false); Sm.set('jetSpeed', 1); Sm.tick(240); const slow = at();
    out.speedTwice = Math.max(...fast.map((v, i) => Math.abs(v - slow[i])));
    Sm.applySeed(77); Sm.setPlaying(false); Sm.set('jetSpeed', 0); const f0 = at(); Sm.tick(24 * 30); const f1 = at();
    out.frozen = Math.max(...f0.map((v, i) => Math.abs(v - f1[i])));
    Sm.set('jetSpeed', 1);
    // changes flow EAST: columns 10 deg apart correlate better when the eastern one is read 2 days later than 2 days earlier
    const asym = [];
    for (const seed of [3, 4, 5]) {
      Sm.applySeed(seed); Sm.setPlaying(false);
      const rows = []; for (let d = 0; d < 240; d++) { Sm.tick(24); rows.push(lonsAll.map((l) => Sm.jetLatLive(l))); }
      const cols = lonsAll.map((_, i) => rows.map((r) => r[i])), mu = cols.map(mean);
      const corr = (lag) => { let sxy = 0, sxx = 0, syy = 0; for (let c = 0; c + 5 < lonsAll.length; c++) for (let t = Math.max(0, -lag); t < rows.length - Math.max(0, lag); t++) { const x = cols[c][t] - mu[c], y = cols[c + 5][t + lag] - mu[c + 5]; sxy += x * y; sxx += x * x; syy += y * y; } return sxy / Math.sqrt(sxx * syy); };
      asym.push(corr(2) - corr(-2));
    }
    out.eastward = mean(asym);
    // the live axis and the one baked into the field by the last redraw are the same curve
    Sm.applySeed(3); Sm.setPlaying(false); Sm.advance(24 * 7);
    const probe = [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => lon0 + 0.25 * Math.round(f * (lon1 - lon0) / 0.25));
    out.liveVsBaked = Math.max(...probe.map((l) => Math.abs(Sm.jetLatLive(l) - Sm.jetLat(l))));
    // parked at slider 0, and inside its band at the slider's 3x maximum
    Sm.applySeed(5); Sm.setPlaying(false); Sm.set('shearSynoptic', 0);
    const parkedA = lons.map((l) => Sm.jetLatLive(l)); Sm.tick(24 * 8); const parkedB = lons.map((l) => Sm.jetLatLive(l));
    out.parked = Math.max(...parkedA.map((v, i) => Math.abs(v - parkedB[i])));
    Sm.set('shearSynoptic', 3);
    let mn = 999, mx = -999, bad = 0;
    for (let d = 0; d < 50; d++) { Sm.advance(48); for (let l = lon0; l <= lon1; l += 2) { const v = Sm.jetLat(l); if (!Number.isFinite(v)) bad++; else { mn = Math.min(mn, v); mx = Math.max(mx, v); } } }
    out.bandMin = mn; out.bandMax = mx; out.bandBad = bad;
    Sm.set('shearSynoptic', 1);
    return out;
  }, { lons: lonsJet, lonsAll, lo: S.band[0], hi: S.band[1], lon0: S.lon[0], lon1: S.lon[1] });
  check(`[${label}] the jet axis is a real number at every longitude and hour (a NaN here once took out a whole basin)`, motion.finite && motion.bandBad === 0);
  check(`[${label}] jet moves calmly: median change ${motion.medDaily.toFixed(2)} deg/day`, motion.medDaily < 3.2 && motion.medDaily > S.dailyMin);
  check(`[${label}] jet axis meanders (a ribbon, not frozen): mean range ${motion.range20.toFixed(1)} deg over 20 days`, motion.range20 > S.rangeMin);
  check(`[${label}] jet motion has no kinks: max hourly second difference ${motion.sec.toFixed(3)} deg/h^2`, motion.sec < 0.2);
  check(`[${label}] a seed gives the same jet however the run is chunked into advance() calls (max difference ${motion.chunking.toExponential(1)} deg)`, motion.chunking < 1e-6);
  check(`[${label}] "Jet stream speed" rescales time itself: 2x for 5 days is exactly 1x for 10 days (max difference ${motion.speedTwice.toExponential(1)} deg)`, motion.speedTwice < 1e-6);
  check(`[${label}] "Jet stream speed" at 0 freezes the jet where it is (moved ${motion.frozen.toExponential(1)} deg in 30 days)`, motion.frozen < 1e-6);
  check(`[${label}] changes flow downstream: east-leading correlation exceeds west-leading by ${motion.eastward.toFixed(2)}`, motion.eastward > S.eastMin);
  check(`[${label}] the live axis the line is drawn from and the one baked into the shear field are the same curve (max difference ${motion.liveVsBaked.toExponential(1)} deg)`, motion.liveVsBaked < 1e-3);
  check(`[${label}] weather slider at 0 parks the jet on its mean path (moved ${motion.parked.toExponential(1)} deg in 8 days)`, motion.parked < 0.001);
  check(`[${label}] jet axis never leaves the ${S.band[0]}..${S.band[1]} band the real axis was measured in, even at the slider's 3x maximum (saw ${motion.bandMin.toFixed(1)}..${motion.bandMax.toFixed(1)})`, motion.bandMin >= S.band[0] - 1e-6 && motion.bandMax <= S.band[1] + 1e-6);
  check(`[${label}] "Jet stream speed" slider exists and starts at 1x`, await ev(() => { const s = document.getElementById('p-jets'); return !!s && s.value === '1' && window.SSTSIM.sliderVals().jetSpeed === 1; }));

  // ---- the "Jet stream line" checkbox, on the real pixels of its own canvas (see the Atlantic block for the method)
  await ev(([view, seed, days]) => { window.SSTSIM.applySeed(seed); window.SSTSIM.setPlaying(false); window.SSTSIM.map.fitBounds(view, { animate: false }); window.SSTSIM.advance(24 * days); }, [S.line.view, S.line.seed, S.line.days]);
  await page.waitForTimeout(250);
  // Probes every 4 deg of longitude, 8 deg in from each end (the line fades over the last 6) and only where the axis is at least `margin` deg inside the box (it fades over the last 2).
  const probeLons = []; for (let l = S.lon[0] + 8; l <= S.lon[1] - 8; l += 4) probeLons.push(l);
  const axisPoints = () => ev(([ls, lat, margin]) => ls.map((lon) => { const la = window.SSTSIM.jetLatLive(lon), p = window.SSTSIM.map.latLngToContainerPoint([la, lon]); return [p.x, p.y, la >= lat[0] + margin && la <= lat[1] - margin]; }), [probeLons, S.lat, S.line.margin]);
  const magentaNear = (pts) => ev((ps) => {
    const c = document.getElementById('jet-canvas'), g = c.getContext('2d'), s = c.width / c.clientWidth, r = Math.round(4 * s);
    return ps.map(([px, py]) => {
      const x = Math.round(px * s), y = Math.round(py * s);
      if (x < r || y < r || x >= c.width - r || y >= c.height - r) return null;   // off-screen: can't be judged either way
      const d = g.getImageData(x - r, y - r, 2 * r + 1, 2 * r + 1).data;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= 200 && d[i] >= 200 && d[i + 2] >= 170 && d[i + 1] <= 130) return true;
      return false;
    });
  }, pts);
  const jetLineSeen = async () => { const pts = await axisPoints(), r = await magentaNear(pts.map((p) => [p[0], p[1]])); const ok = r.map((v, i) => (v === null || !pts[i][2] ? null : v)).filter((v) => v !== null); return { n: ok.length, hits: ok.filter(Boolean).length }; };
  check(`[${label}] "Jet stream line" checkbox exists and starts unchecked`, await ev(() => { const c = document.getElementById('jetline'); return !!c && !c.checked; }));
  const lineOff = await jetLineSeen();
  check(`[${label}] nothing is drawn along the axis while the checkbox is off (${lineOff.hits} of ${lineOff.n} on-screen probes)`, lineOff.n >= S.line.minProbes && lineOff.hits === 0);
  await lyrSet(page, 'jetline', true);
  for (const v of ['sst', 'anom', 'humid', 'shear']) {
    await ev((vv) => window.SSTSIM.setView(vv), v);
    await page.waitForTimeout(300);
    const seen = await jetLineSeen();
    check(`[${label}] jet line is drawn along the axis in the ${v} view (${seen.hits} of ${seen.n} on-screen probes)`, seen.n >= S.line.minProbes && seen.hits === seen.n);
  }
  await page.uncheck('#show-sst');
  await page.waitForTimeout(300);
  const noField = await jetLineSeen();
  check(`[${label}] jet line still draws with "Show sea temperature" off (${noField.hits} of ${noField.n} probes)`, noField.n >= S.line.minProbes && noField.hits === noField.n);
  await page.check('#show-sst');
  await lyrSet(page, 'jetline', false);
  await page.waitForTimeout(300);
  const lineGone = await jetLineSeen();
  check(`[${label}] unchecking the box removes the line again (${lineGone.hits} of ${lineGone.n} probes)`, lineGone.hits === 0);
  await ev(() => window.SSTSIM.setView('sst'));

  // ---- the "outside this area" note: a basin that sits beside the jet says so instead of showing an empty map
  const noteFor = async (seed) => {
    await ev((sd) => { window.SSTSIM.applySeed(sd); window.SSTSIM.setPlaying(false); window.SSTSIM.advance(24 * 12); }, seed);
    await lyrSet(page, 'jetline', true);
    await page.waitForTimeout(300);
    const r = await ev(() => document.getElementById('jet-note').textContent);
    await lyrSet(page, 'jetline', false);
    return r;
  };
  check(`[${label}] with the axis across the map, the jet line option carries no "outside this area" note`, (await noteFor(S.line.seed)) === '');
  if (S.noteSeed) check(`[${label}] with the whole axis ${S.noteSeed[1]} of the map, the option says so ("${S.noteSeed[1]} of this area today")`, (await noteFor(S.noteSeed[0])).includes(S.noteSeed[1] + ' of this area'));
  // ...and the same when the axis is inside the box but not on screen: zoomed in away from it, it is north (south) of what is shown
  await ev(([sd, c]) => { window.SSTSIM.applySeed(sd); window.SSTSIM.setPlaying(false); window.SSTSIM.advance(24 * 12); window.SSTSIM.map.setView(c, 6, { animate: false }); }, [S.offscreen.seed ?? S.line.seed, S.offscreen.center]);
  await lyrSet(page, 'jetline', true);
  await page.waitForTimeout(300);
  const offNote = await ev(() => document.getElementById('jet-note').textContent);
  await lyrSet(page, 'jetline', false);
  check(`[${label}] zoomed in away from the axis, the option says it is ${S.offscreen.dir} of what is on screen`, offNote.includes(S.offscreen.dir + ' of what is on screen'));

  // ---- the bottom-left readout's own Shear branch
  await ev(() => { window.SSTSIM.map.fitBounds(window.SSTSIM.map.options.maxBounds, { animate: false }); window.SSTSIM.setView('shear'); });
  await page.waitForTimeout(200);
  const shearPt = await ev(() => {
    const b = window.SSTSIM.map.getBounds();
    for (let i = 1; i < 8; i++) for (let j = 1; j < 8; j++) {
      const lat = b.getSouth() + (b.getNorth() - b.getSouth()) * i / 8, lon = b.getWest() + (b.getEast() - b.getWest()) * j / 8;
      if (window.SSTSIM.isLand(lat, lon) || !Number.isFinite(window.SSTSIM.sample(lat, lon).sst)) continue;
      const p = window.SSTSIM.map.latLngToContainerPoint([lat, lon]);
      return { x: p.x, y: p.y };
    }
    return null;
  });
  await page.mouse.move(shearPt.x, shearPt.y);
  await page.waitForTimeout(150);
  const readout = await ev(() => document.getElementById('readout').textContent);
  check(`[${label}] readout shows a real kt shear value with its own threshold context`, /kt/.test(readout) && /(Above|Below) disruptive shear threshold/.test(readout));

  await ev(() => { window.SSTSIM.setView('sst'); window.SSTSIM.setPlaying(true); window.SSTSIM.restart(); });   // leave the page in its default state for the checks after this one
}

// ENSO hold: a checkbox next to "Set ENSO now" pins Niño 3.4 at the chosen value instead of letting it evolve. Same checks in every basin.
// ---------------------------------------------------------------------------------------------------------------------------------------
// Experimentation panel. Two tabs: Basic (Set ENSO now, Keep ENSO at this value, Warming, and two "average" sliders -- Moisture and Wind
// shear -- that move a whole field up or down the way Warming moves the temperature) and Advanced (everything else, the storm-strength
// selector included); the seed row is shared by both. Customization is its own section and is left alone. Runs in every basin from the
// common part of checkBasin, where Experimentation has just been opened. The shift sizes below come from measuring all nine basins (mean
// change over every ocean and land point at 2 degrees, seed 4242, day 103): +/-10 moves humidity by 9.2-9.9 and shear by 8.0-10.0, +/-20 by
// 17.4-19.8 (humidity) and 14.8-20.0 (shear), less than the slider reads only where the field meets its floor (shear) or 100% (humidity).
async function checkExperiment(page, label) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const BASIC = ['p-ensonow', 'enso-hold', 'p-warm', 'p-moist', 'p-shear'];
  const ADV = ['p-var', 'p-wx', 'p-wxs', 'p-jets', 'p-sea', 'p-feat', 'p-enso', 'seed-vary', 'steer-depth-row'];
  const SEED = ['seed', 'b-newseed', 'b-reset'];
  const look = () => ev(([basic, adv, seed]) => {
    const $ = (id) => document.getElementById(id), shown = (id) => { const el = $(id); return !!el && el.offsetParent !== null; };
    const tabs = [...document.querySelectorAll('#seg-xp button')];
    return { tabs: tabs.map((b) => b.textContent.trim() + ':' + b.getAttribute('aria-selected') + ':' + b.tabIndex).join(' '), active: document.activeElement && document.activeElement.id,
      panels: [shown('xp-basic'), shown('xp-adv')], basic: basic.map(shown), adv: adv.map(shown), seed: seed.map(shown) };
  }, [BASIC, ADV, SEED]);
  const all = (a, v) => a.every((x) => x === v);
  const BASIC_STATE = 'Basic:true:0 Advanced:false:-1', ADV_STATE = 'Basic:false:-1 Advanced:true:0';

  // ---- 1. the layout, and what each tab shows
  const lay = await ev(([basic, adv, seed]) => {
    const $ = (id) => document.getElementById(id);
    const home = (id) => { const el = $(id); return !el ? 'missing' : el.closest('#xp-basic') ? 'basic' : el.closest('#xp-adv') ? 'adv' : el.closest('#sec-custom') ? 'custom' : el.closest('#sec-exp') ? 'shared' : 'other'; };
    return { role: $('seg-xp').getAttribute('role'), tabRoles: [...document.querySelectorAll('#seg-xp button')].map((b) => b.getAttribute('role') + '>' + b.getAttribute('aria-controls')).join(' '),
      panelRoles: ['xp-basic', 'xp-adv'].map((id) => $(id).getAttribute('role') + '<' + $(id).getAttribute('aria-labelledby')).join(' '),
      basicHome: basic.map(home), advHome: adv.map(home), seedHome: seed.map(home), basicOrder: [...$('xp-basic').querySelectorAll('input')].map((e) => e.id).join(','),
      customTabs: document.querySelectorAll('#sec-custom [role=tab], #sec-custom [role=tablist]').length, customSliders: document.querySelectorAll('#sec-custom input[id^="p-"]').length, customLayers: !!document.querySelector('#sec-custom #seg-view'),
      customDepth: !!document.querySelector('#sec-custom #seg-depth') };
  }, [BASIC, ADV, SEED]);
  const t0 = await look();
  check(`[${label}] Experimentation opens on its Basic tab: only the basic controls show, the Advanced ones are hidden, the seed row is there (${t0.tabs})`, t0.tabs === BASIC_STATE && t0.panels[0] === true && t0.panels[1] === false && all(t0.basic, true) && all(t0.adv, false) && all(t0.seed, true));
  check(`[${label}] Basic holds exactly Set ENSO now, Keep ENSO at this value, Warming, Moisture and Wind shear, in that order (${lay.basicOrder})`, all(lay.basicHome, 'basic') && lay.basicOrder === BASIC.join(','));
  check(`[${label}] Advanced holds the rest: year-to-year variability, both day-to-day weather sliders, weather speed, seasonal swing, currents, ENSO influence, the seed nudge and the storm-strength selector`, all(lay.advHome, 'adv'));
  check(`[${label}] the seed row (seed, New seed, Reset) belongs to neither tab and shows on both`, all(lay.seedHome, 'shared'));
  check(`[${label}] the tabs are a proper tab list: roles, aria-controls and aria-labelledby line up (${lay.tabRoles}; ${lay.panelRoles})`, lay.role === 'tablist' && lay.tabRoles === 'tab>xp-basic tab>xp-adv' && lay.panelRoles === 'tabpanel<xp-tab-basic tabpanel<xp-tab-adv');
  check(`[${label}] Customization is unchanged by all this: no tabs, no experiment sliders, still the layer buttons, and the storm-strength selector is not in it`, lay.customTabs === 0 && lay.customSliders === 0 && lay.customLayers && !lay.customDepth);
  await page.click('#xp-tab-adv');
  const t1 = await look();
  check(`[${label}] clicking Advanced swaps the tabs over: the advanced controls show, the basic ones hide, the seed row stays (${t1.tabs})`, t1.tabs === ADV_STATE && t1.panels[0] === false && t1.panels[1] === true && all(t1.basic, false) && all(t1.adv, true) && all(t1.seed, true));
  await page.click('#xp-tab-basic');
  const t2 = await look();
  check(`[${label}] clicking Basic brings the basic controls back (${t2.tabs})`, t2.tabs === BASIC_STATE && all(t2.basic, true) && all(t2.adv, false));
  await page.focus('#xp-tab-basic'); await page.keyboard.press('ArrowRight'); const k1 = await look();
  await page.keyboard.press('ArrowRight'); const k2 = await look();
  await page.keyboard.press('ArrowLeft'); const k3 = await look();
  await page.keyboard.press('Home'); const k4 = await look();
  await page.keyboard.press('End'); const k5 = await look();
  await page.keyboard.press('Home'); const k6 = await look();
  check(`[${label}] arrow keys, Home and End move between the tabs and focus follows (right ${k1.tabs.startsWith('Basic:false') && k1.active}, right again ${k2.tabs.startsWith('Basic:true') && k2.active}, left ${k3.active}, Home ${k4.active}, End ${k5.active})`,
    k1.tabs === ADV_STATE && k1.active === 'xp-tab-adv' && k2.tabs === BASIC_STATE && k2.active === 'xp-tab-basic' && k3.tabs === ADV_STATE && k3.active === 'xp-tab-adv' && k4.tabs === BASIC_STATE && k4.active === 'xp-tab-basic' && k5.tabs === ADV_STATE && k5.active === 'xp-tab-adv' && k6.tabs === BASIC_STATE);

  // ---- 2. the Moisture and Wind shear sliders
  const r = await ev(() => {
    const S = window.SSTSIM, $ = (id) => document.getElementById(id), out = {};
    S.setPlaying(false); S.applySeed(4242); S.setPlaying(false); S.advance(24 * 103);
    const slide = (id, v) => { const el = $(id); el.value = String(v); el.dispatchEvent(new Event('input')); };
    const pts = [];
    for (let lat = -68; lat <= 78; lat += 2) for (let lon = -200; lon <= 260; lon += 2) { const s = S.sample(lat, lon); if (Number.isFinite(s.humid) && Number.isFinite(s.shear) && Number.isFinite(s.sst)) pts.push([lat, lon]); }
    const grab = () => { const n = pts.length, h = new Float64Array(n), sh = new Float64Array(n), t = new Float64Array(n); for (let i = 0; i < n; i++) { const s = S.sample(pts[i][0], pts[i][1]); h[i] = s.humid; sh[i] = s.shear; t[i] = s.sst; } return { h, sh, t }; };
    const same = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
    const stat = (a, base) => { let mn = Infinity, mx = -Infinity, d = 0; for (let i = 0; i < a.length; i++) { if (a[i] < mn) mn = a[i]; if (a[i] > mx) mx = a[i]; if (base) d += a[i] - base[i]; } return { min: mn, max: mx, dmean: base ? d / a.length : 0 }; };
    out.n = pts.length;
    // the fields with every slider at rest stay physical at several dates: humidity inside [0,100], shear never negative
    out.rest = [];
    for (let q = 0; q < 3; q++) { if (q) S.advance(24 * 100); const g = grab(); out.rest.push({ h: stat(g.h), s: stat(g.sh) }); }
    const base = grab();
    out.moist = {}; out.shear = {}; out.indep = { moist: true, shear: true };
    for (const v of [10, 20, -10, -20]) {
      slide('p-moist', v); let g = grab(); out.moist[v] = stat(g.h, base.h); out.indep.moist = out.indep.moist && same(g.sh, base.sh) && same(g.t, base.t); slide('p-moist', 0);
      slide('p-shear', v); g = grab(); out.shear[v] = stat(g.sh, base.sh); out.indep.shear = out.indep.shear && same(g.h, base.h) && same(g.t, base.t); slide('p-shear', 0);
    }
    const back = grab(); out.exact = same(back.h, base.h) && same(back.sh, base.sh) && same(back.t, base.t);
    const seq = [-20, -10, -5, 0, 5, 10, 20]; out.mono = {};
    for (const [id, key] of [['p-moist', 'h'], ['p-shear', 'sh']]) {
      const gs = seq.map((v) => { slide(id, v); return grab()[key]; }); slide(id, 0);
      let ok = true; for (let i = 0; i < pts.length && ok; i++) for (let q = 1; q < gs.length; q++) if (gs[q][i] < gs[q - 1][i] - 1e-9) { ok = false; break; }
      out.mono[id] = ok;
    }
    // the sliders' own read-outs and the model's parameters
    slide('p-moist', 10); slide('p-shear', -5); out.read1 = [$('p-moist-o').textContent, $('p-shear-o').textContent, S.sliderVals().moisture, S.sliderVals().shearShift];
    slide('p-moist', -5); slide('p-shear', 10); out.read2 = [$('p-moist-o').textContent, $('p-shear-o').textContent, S.sliderVals().moisture, S.sliderVals().shearShift];
    slide('p-moist', 15); slide('p-shear', 15); slide('p-warm', 1.5); out.warmMoved = S.sliderVals().warming; $('b-reset').click();
    out.reset = [$('p-moist').value, $('p-shear').value, $('p-moist-o').textContent, $('p-shear-o').textContent, S.sliderVals().moisture, S.sliderVals().shearShift, S.sliderVals().warming];
    const afterReset = grab(); out.resetExact = same(afterReset.h, base.h) && same(afterReset.sh, base.sh);
    out.attrs = [$('p-moist').min, $('p-moist').max, $('p-moist').step, $('p-moist').value, $('p-shear').min, $('p-shear').max, $('p-shear').step, $('p-shear').value].join(' ');
    return out;
  });
  const within = (x, lo, hi) => x >= lo && x <= hi;
  const restOk = r.rest.every((x) => x.h.min >= 0 && x.h.max <= 100 && x.s.min >= 0);
  check(`[${label}] with every slider at rest, humidity stays inside 0-100% and shear is never negative, at three dates in ${r.n} points (humidity ${r.rest.map((x) => x.h.min.toFixed(2) + '..' + x.h.max.toFixed(1)).join(', ')}; shear min ${r.rest.map((x) => x.s.min.toFixed(3)).join(', ')} kt)`, restOk);
  check(`[${label}] sliders are there with the right ranges: Moisture and Wind shear both run -20..+20 in steps of 1 from 0 (${r.attrs})`, r.attrs === '-20 20 1 0 -20 20 1 0');
  check(`[${label}] Moisture +10 / +20 raises the average humidity by about that much (${r.moist[10].dmean.toFixed(2)} / ${r.moist[20].dmean.toFixed(2)} points)`, within(r.moist[10].dmean, 8.5, 10.001) && within(r.moist[20].dmean, 16, 20.001));
  check(`[${label}] Moisture -10 / -20 lowers it by about that much (${r.moist[-10].dmean.toFixed(2)} / ${r.moist[-20].dmean.toFixed(2)} points)`, within(r.moist[-10].dmean, -10.001, -8.5) && within(r.moist[-20].dmean, -20.001, -16));
  check(`[${label}] Wind shear +10 / +20 raises the average shear by about that much (${r.shear[10].dmean.toFixed(2)} / ${r.shear[20].dmean.toFixed(2)} kt)`, within(r.shear[10].dmean, 8.0, 10.001) && within(r.shear[20].dmean, 17, 20.001));
  check(`[${label}] Wind shear -10 / -20 lowers it, by a little less where it already sits near zero (${r.shear[-10].dmean.toFixed(2)} / ${r.shear[-20].dmean.toFixed(2)} kt)`, within(r.shear[-10].dmean, -10.001, -7) && within(r.shear[-20].dmean, -20.001, -13));
  const extremes = [r.moist[20], r.moist[-20]].every((x) => x.min >= 0 && x.max <= 100) && [r.shear[20], r.shear[-20]].every((x) => x.min >= 0);
  check(`[${label}] at the ends of the sliders humidity stays inside 0-100% and shear never goes negative (Moisture +20: ${r.moist[20].max.toFixed(2)} max; -20: ${r.moist[-20].min.toFixed(3)} min; Shear -20: ${r.shear[-20].min.toFixed(3)} min)`, extremes);
  check(`[${label}] each slider moves only its own field: Moisture leaves shear and sea temperature exactly as they were, Wind shear leaves humidity and temperature`, r.indep.moist && r.indep.shear);
  check(`[${label}] both sliders are monotone point by point (more slider, never less humidity / shear anywhere) and back at 0 every field is exactly what it was`, r.mono['p-moist'] && r.mono['p-shear'] && r.exact);
  check(`[${label}] the read-outs say what they do: ${r.read1[0]} / ${r.read1[1]} and ${r.read2[0]} / ${r.read2[1]}, and the model's parameters follow (${r.read1[2]}, ${r.read1[3]}, ${r.read2[2]}, ${r.read2[3]})`, r.read1[0] === '+10 %' && r.read1[1] === '−5 kt' && r.read1[2] === 10 && r.read1[3] === -5 && r.read2[0] === '−5 %' && r.read2[1] === '+10 kt' && r.read2[2] === -5 && r.read2[3] === 10);
  check(`[${label}] Reset puts Moisture and Wind shear back to zero (${r.reset[2]}, ${r.reset[3]}) along with Warming (${r.warmMoved} -> ${r.reset[6]}), and the fields come back exactly`, r.reset[0] === '0' && r.reset[1] === '0' && r.reset[2] === '+0 %' && r.reset[3] === '+0 kt' && r.reset[4] === 0 && r.reset[5] === 0 && r.warmMoved === 1.5 && r.reset[6] === 0 && r.resetExact);
  await ev(() => { window.SSTSIM.restart(); });
}

// The storm layer on the Atlantic page: the season bar, the hand-placed systems, the three marker shapes, hover and click, the
// slider coupling, and above all that a seed gives the same storms and the same weather however the clock is chunked or redrawn.
// the band the mean of eight seasons must fall in: wide, because the real spread between seasons is large (SD 5.5 named storms, ACE 66) and the engine's is the same (96 held-out seasons: named 5.1, ACE 75), so a mean of eight has an
// SD of 1.8 named storms and 27 ACE; the engine's averages are 16.6 / 13.2 / 7.1 / 3.5 / 133 (docs/roadmap.md). The seeds are 301-304 (a quiet sample: season activity 0.70-0.92, 9.8 named storms and ACE 62 on average) and 313, 322,
// 328, 336 (average activity, chosen by that number and not by their storms: 17.8 and 188); together 13.8 and 125. A band this wide cannot tell 13 named storms from 15, but it does tell the first version (ACE 68, 1.0 majors) from this one.
const SEASON_BANDS = { dep: [10, 23], named: [8, 20], hurr: [3, 11], major: [1, 6.5], ace: [50, 220] };
async function checkStorms(page, label) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const view0 = await ev(() => { const c = window.SSTSIM.map.getCenter(); return [c.lat, c.lng, window.SSTSIM.map.getZoom()]; });          // (the view the page starts on: the checks below move the map to look at things and put it back at the end, for the Place checks that follow)
  const a = await ev(() => {
    const S = window.SSTSIM; S.setPlaying(false); S.applySeed(4242); S.setPlaying(false); S.storms(true); S.stormAuto(false);
    const bar = document.getElementById('season');
    return { on: S.storms(), shown: getComputedStyle(bar).display !== 'none', text: bar.innerText.replace(/\s+/g, ' ').trim(), canvas: !!document.getElementById('storm-canvas'),
      controls: ['stwaves', 'stlows', 'stdist', 'stlabels', 'st-auto', 'p-stact', 'storm-tip', 'storm-card'].every((id) => !!document.getElementById(id)), cardHidden: document.getElementById('storm-card').hidden,
      state: S.stormState() };
  });
  const mk = await ev(() => window.SSTSIM.stormMapsKeys());
  check(`[${label}] the page carries the climatology maps the engine is anchored to (${(mk || []).join(', ')})`, !!mk && ['drift', 'steerClim', 'haz', 'spawn', 'env0'].every((k) => mk.includes(k)));
  check(`[${label}] the season bar shows "${a.text}" before anything has formed, the storm canvas and controls exist`, a.on === true && a.shown && /^Atlantic \d{4} 0 ?DEP 0 ?NAMED 0 ?HURR 0 ?MAJOR 0 ?CAT 5 0\.0 ?ACE ?Summary$/.test(a.text) && a.canvas && a.controls && a.cardHidden && a.state.systems.length === 0);

  // hand-placed systems: a strong tropical depression, a subtropical one, a non-tropical low, on a warm August day
  const b = await ev(() => {
    const S = window.SSTSIM; S.tick(24 * 75);
    const ids = [S.stormPlace({ kind: 'td', lat: 17, lon: -52, v: 60 }), S.stormPlace({ kind: 'sd', lat: 31, lon: -66, v: 40 }), S.stormPlace({ kind: 'low', lat: 41, lon: -50, v: 35 })];
    S.tick(12); S.advance(0);
    const st = S.stormState(), by = Object.fromEntries(st.systems.map((x) => [x.id, x]));
    return { ids, st, by, bar: ['se-dep', 'se-named', 'se-hurr', 'se-major', 'se-c5', 'se-ace'].map((id) => document.getElementById(id).textContent), year: document.getElementById('se-year').textContent };
  });
  const [i1, i2, i3] = b.ids, s1 = b.by[i1], s2 = b.by[i2], s3 = b.by[i3];
  check(`[${label}] a placed tropical depression gets a depression number and the first name at its first advisory fix (${s1.name || '-'}, dep ${s1.depNum}), a placed low stays a low (${s3.st})`, s1.depNum >= 1 && s1.name === 'Arthur' && s3.th === 'nl' && s3.depNum === 0);
  check(`[${label}] the season bar follows the counters: DEP ${b.bar[0]}, NAMED ${b.bar[1]}, ACE ${b.bar[5]} (stats ${JSON.stringify(b.st.stats)})`, +b.bar[0] === b.st.stats.dep && +b.bar[1] === b.st.stats.named && +b.bar[5] === b.st.stats.ace && b.st.stats.dep >= 2 && b.st.stats.named >= 1 && /Atlantic \d{4}/.test(b.year));

  // the three marker shapes: circle (tropical), square (subtropical), triangle (extratropical), read off the canvas pixels around each head
  const shapes = await ev((ids) => {
    const S = window.SSTSIM, cv = document.getElementById('storm-canvas'), g = cv.getContext('2d'), d = cv.width / cv.clientWidth, out = {};
    document.getElementById('stlabels').checked = false;
    const forced = { circle: { th: 'tc', v: 80, vr: 80 }, square: { th: 'sc', v: 45, vr: 45 }, triangle: { th: 'ex', v: 50, vr: 50 }, remnant: { th: 'nl', v: 20, vr: 20 } };
    const at = (id, dx, dy) => { const p = S.stormPx(id); return g.getImageData(Math.round((p.x + dx) * d), Math.round((p.y + dy) * d), 1, 1).data[3] > 100; };
    ['circle', 'square', 'triangle', 'remnant'].forEach((k, i) => {
      S.stormForce(ids[i % 3], forced[k]); S.stormDraw(); i = i % 3;
      out[k] = { center: at(ids[i], 0, 0), c: [[-8, -8], [8, -8], [-8, 8], [8, 8]].map(([x, y]) => at(ids[i], x, y)), top: [[-6, -6], [6, -6]].map(([x, y]) => at(ids[i], x, y)), bottom: [[-6, 6], [6, 6]].map(([x, y]) => at(ids[i], x, y)) };
    });
    document.getElementById('stlabels').checked = true;
    return out;
  }, b.ids);
  const nFilled = (arr) => arr.filter(Boolean).length;
  check(`[${label}] a tropical cyclone is drawn as a circle (no corners: ${nFilled(shapes.circle.c)}/4), a subtropical one as a square (corners ${nFilled(shapes.square.c)}/4), an extratropical one as a triangle (top ${nFilled(shapes.triangle.top)}/2, base ${nFilled(shapes.triangle.bottom)}/2) and so is a remnant low (top ${nFilled(shapes.remnant.top)}/2, base ${nFilled(shapes.remnant.bottom)}/2)`,
    shapes.circle.center && nFilled(shapes.circle.c) <= 1 && shapes.square.center && nFilled(shapes.square.c) >= 3 && shapes.triangle.center && nFilled(shapes.triangle.top) === 0 && nFilled(shapes.triangle.bottom) === 2
    && shapes.remnant.center && nFilled(shapes.remnant.top) === 0 && nFilled(shapes.remnant.bottom) === 2);

  // precursors are drawn by the stage they have reached: a wave as a dashed north-south axis, a low as a red disc with an L (a disturbance is the same wave or low: its X belongs to the outlook, below); each under its own box
  const pre = await ev(() => {
    const S = window.SSTSIM, cv = document.getElementById('storm-canvas'), g = cv.getContext('2d'), d = cv.width / cv.clientWidth;
    S.outlookForce({ issued: 0, hour: 0, areas: [] });                           // no outlook in this probe: only the wave and the low themselves
    const id = S.stormPlace({ kind: 'wave', lat: 24, lon: -58 }), p = S.stormPx(id);
    const rgba = (dx, dy) => Array.from(g.getImageData(Math.round((p.x + dx) * d), Math.round((p.y + dy) * d), 1, 1).data), px = (dx, dy) => rgba(dx, dy)[3] > 100;
    const count = (pts) => pts.filter(([dx, dy]) => px(dx, dy)).length, line = Array.from({ length: 29 }, (_, k) => [0, k - 14]), diag = [-6, -5, -4, -3, 3, 4, 5, 6].flatMap((k) => [[k, k], [k, -k]]);
    const red = (dx, dy) => { const c = rgba(dx, dy); return c[3] > 100 && c[0] > 180 && c[1] < 130 && c[2] < 100; };
    const look = () => ({ axis: count(line), diag: count(diag), disc: red(7, 0) && red(-7, 0), side: px(7, 0) || px(-7, 0) });
    const on = ['stwaves', 'stlows', 'stdist'].every((k) => document.getElementById(k).checked);
    S.stormForce(id, { kind: 'M', dist: false }); S.stormDraw(); const wave = look();
    S.stormForce(id, { kind: 'N', dist: false }); S.stormDraw(); const low = look();
    S.stormForce(id, { kind: 'N', dist: true }); S.stormDraw(); const distN = look();
    S.stormForce(id, { kind: 'M', dist: true }); S.stormDraw(); const distM = look();
    const box = (k, v) => { document.getElementById(k).checked = v; };
    S.stormForce(id, { kind: 'M', dist: false }); box('stwaves', false); S.stormDraw(); const waveOff = look(); box('stwaves', true);
    S.stormForce(id, { kind: 'N', dist: false }); box('stlows', false); S.stormDraw(); const lowOff = look(); box('stlows', true);
    S.stormForce(id, { alive: false }); S.outlookForce(null); S.stormDraw();
    return { wave, low, distN, distM, on, waveOff, lowOff };
  });
  check(`[${label}] a wave is a dashed north-south axis (${pre.wave.axis} of 29 pixels on the axis, ${pre.wave.diag} on the diagonals), a low a red disc (${pre.low.disc}), a flagged disturbance is drawn as the wave or the low it is (axis ${pre.distM.axis}, disc ${pre.distN.disc}: no ring, no X of its own), and all are drawn by default, each under its own box (with it off: ${pre.waveOff.axis} axis pixels, disc ${pre.lowOff.disc})`,
    pre.wave.axis >= 12 && pre.wave.diag <= 2 && !pre.wave.side && !pre.wave.disc && pre.low.disc && pre.distM.axis >= 12 && pre.distM.diag <= 2 && !pre.distM.disc && pre.distN.disc && pre.on && pre.waveOff.axis <= 2 && !pre.lowOff.disc);

  // the outlook (areas of interest), forced to three known areas so that the pixels are known: a hatched shape in the NHC's colour with a dark halo (diagonal lines closer and thicker for a higher chance, over a faint wash, not a fill), an X on a disturbance that
  // exists inside its area, an X with an arrow to its area when the conditions are not good yet, no X on a system that has formed, and a legend; each under the Areas of interest box
  const ol = await ev(() => {
    const S = window.SSTSIM, cv = document.getElementById('storm-canvas'), g = cv.getContext('2d'), d = cv.width / cv.clientWidth, c0 = S.map.getCenter(), z0 = S.map.getZoom();
    S.map.setView([24, -48], 4, { animate: false }); document.getElementById('stlabels').checked = false;
    const wA = S.stormPlace({ kind: 'wave', lat: 24, lon: -48 }), wB = S.stormPlace({ kind: 'wave', lat: 24, lon: -34 });
    const ring = (la, lo, r) => Array.from({ length: 40 }, (_, k) => { const a = 2 * Math.PI * k / 40; return [la + r * Math.sin(a), lo + r * Math.cos(a) / Math.cos(la * Math.PI / 180)]; });
    const area = (key, cls, la, lo, extra) => Object.assign({ key, id: null, kind: 'unborn', x: null, arrow: null, arrowR: 0, p2: 20, p7: { low: 30, medium: 50, high: 80 }[cls], cls, poly: ring(la, lo, 3), t0: 30, t1: 90, birth: 200, invest: '' }, extra);
    const A = area('a', 'low', 24, -62), B = area('b', 'medium', 24, -48, { id: wA, kind: 'wave', x: [24, -48], birth: null }), C = area('c', 'high', 24, -26, { id: wB, kind: 'wave', x: [24, -34], arrow: [24, -27], arrowR: 3, birth: null, invest: '92L' });
    const rgba = (x, y) => Array.from(g.getImageData(Math.round(x * d), Math.round(y * d), 1, 1).data), at = (la, lo) => S.placePx(la, lo);
    const probe = (la, lo) => { const p = at(la, lo), a = []; for (let dx = -30; dx <= 30; dx++) a.push(rgba(p.x + dx, p.y + 22)); const opaque = a.filter((c) => c[3] > 100), wash = a.filter((c) => c[3] >= 12 && c[3] <= 80);
      let runs = 0; a.forEach((c, i) => { if (c[3] > 100 && (i === 0 || a[i - 1][3] <= 100)) runs++; });
      const m = (k) => (opaque.length ? opaque.reduce((t, c) => t + c[k], 0) / opaque.length : 0); return { frac: opaque.length / a.length, wash: wash.length / a.length, runs, rgb: [m(0), m(1), m(2)] }; };
    const edge = (la, lo) => { const p = at(la, lo), w = p.x - at(la, lo - 3 / Math.cos(la * Math.PI / 180)).x; let col = false, dark = false; for (let dx = -w - 7; dx <= -w + 7; dx++) { const c = rgba(p.x + dx, p.y); if (c[3] > 200 && c[0] > 200) col = true; if (c[3] > 80 && c[0] < 45 && c[1] < 45 && c[2] < 55) dark = true; } return { col, dark }; };
    const dk = (p, dx, dy) => { const c = rgba(p.x + dx, p.y + dy); return c[3] > 200 && c[0] < 60 && c[1] < 60 && c[2] < 70; }, empty = (p, dx, dy) => rgba(p.x + dx, p.y + dy)[3] < 60;
    const CL = { low: [255, 226, 77], medium: [255, 157, 46], high: [255, 59, 48] }, colr = (p, dx, dy, k) => { const c = rgba(p.x + dx, p.y + dy); return c[3] > 200 && CL[k].every((v, i) => Math.abs(c[i] - v) < 30); };
    const marks = () => { const pA = at(24, -48), pB = at(24, -34), L = at(24, -27).x - pB.x, rpx = Math.abs(at(27, -27).y - at(24, -27).y), tip = L - Math.min(0.7 * rpx, 0.4 * L);       // (the arrow's length and where its head ends, from the page's own projection)
      const n4 = (p, k) => [[-3, -3], [3, 3], [-3, 3], [3, -3]].filter(([x, y]) => colr(p, x, y, k)).length, ring = (p) => [[-6, 0], [6, 0], [0, -6], [0, 6]].filter(([x, y]) => dk(p, x, y)).length;
      return { xa: n4(pA, 'medium'), ra: ring(pA), xb: n4(pB, 'high'), rb: ring(pB), shaftA: [16, 18, 20, 22, 24].filter((x) => colr(pA, x, 0, 'medium')).length, shaftB: Array.from({ length: 11 }, (_, k) => 16 + k).filter((x) => colr(pB, x, 0, 'high')).length, edgeB: [18, 20, 22].filter((x) => (dk(pB, x, -4) || dk(pB, x, -5)) && (dk(pB, x, 3) || dk(pB, x, 4))).length,
        head: (() => { let n = 0, d = 0; for (let x = Math.round(tip) - 11; x <= Math.round(tip) - 1; x++) for (let y = -6; y <= 6; y++) { if (colr(pB, x, y, 'high')) n++; if (dk(pB, x, y)) d++; } return [n, d]; })() }; };
    const axisPx = (la, lo) => { const p = at(la, lo); let n = 0; for (const k of [-15, -14, -13, -12, 12, 13, 14, 15]) { const c = rgba(p.x, p.y + k); if (c[3] > 240 && c[0] > 240 && Math.abs(c[1] - 162) < 8 && Math.abs(c[2] - 77) < 12) n++; } return n; };       // (a wave's dashed axis, in its own colour, beyond the reach of an X: the hatch is another orange)
    const labelPx = (la, lo, side, far = 96) => { const p = at(la, lo); let n = 0; for (let x = 14; x <= far; x++) for (let y = -8; y <= 8; y++) { const c = rgba(p.x + side * x, p.y + y); if (c[3] > 200 && c[0] > 235 && c[1] > 235 && c[2] > 235) n++; } return n; };       // (white text pixels beside an X)
    S.outlookForce({ issued: 144, hour: 150, areas: [A, B, C] }); S.stormDraw();
    const pa = probe(24, -62), pb = probe(24, -48), pc = probe(24, -26), out = { pa, pb, pc, ea: edge(24, -62), eb: edge(24, -48), outside: probe(10, -100).frac + probe(36, -100).wash, mk: marks() };
    const hits = S.outlookHits(); out.hits = { marks: hits.marks.map((m) => m.key).sort().join(), areas: hits.areas.map((a) => a.key).sort().join() };
    const lg = document.getElementById('ol-legend'); out.legend = { shown: getComputedStyle(lg).display !== 'none', text: lg.innerText.replace(/\s+/g, ' ') }; out.label = document.getElementById('stdist').parentElement.innerText.trim();
    out.axisX = axisPx(24, -48); out.xcol = ['low', 'medium', 'high'].map((k) => { S.outlookForce({ issued: 144, hour: 150, areas: [Object.assign({}, B, { cls: k })] }); S.stormDraw(); return colr(at(24, -48), 0, 0, k) && colr(at(24, -48), 3, 3, k); });
    S.outlookForce({ issued: 144, hour: 150, areas: [A, C] }); S.stormDraw(); out.axisNoX = axisPx(24, -48);       // (the wave is a dashed line again when its area is gone: "it can devolve back")
    S.outlookForce({ issued: 144, hour: 150, areas: [A, B, C] }); document.getElementById('stlabels').checked = true; S.stormDraw(); out.lab = { b: labelPx(24, -48, 1), c: labelPx(24, -34, -1), cWrong: labelPx(24, -34, 1, 48) };       // titles beside the X's, on the side away from the area ("Wave", "Invest 92L")
    document.getElementById('stlabels').checked = false; S.stormDraw(); out.labOff = { b: labelPx(24, -48, 1), c: labelPx(24, -34, -1) };
    const pill = (on) => { document.getElementById('stlabels').checked = on; S.stormDraw(); const c = at(24, -62); return dk(c, -12, 6) && dk(c, 12, -6) && dk(c, 0, 6) && !dk(c, 0, 14) && !dk(c, 0, -14); };      // the chances written on the shape: a dark pill at its middle (the Storm names box)
    out.pill = { on: pill(true), off: pill(false) };
    const hover = (la, lo) => { const p = at(la, lo), ok = S.stormHover(p.x, p.y), t = document.getElementById('storm-tip'); return { ok, shown: t.style.display === 'block', title: t.querySelector('b').textContent, text: t.querySelector('div').innerText.replace(/\n/g, ' | ') }; };
    out.hx = hover(24, -48); out.hc = hover(24, -34); out.ha = hover(24, -62); out.hn = hover(8, -95);
    S.stormForce(wA, { kind: 'N' }); S.stormDraw(); out.lowUnderX = rgba(at(24, -48).x + 7, at(24, -48).y)[0] > 180 && rgba(at(24, -48).x + 7, at(24, -48).y)[1] < 130 && rgba(at(24, -48).x + 7, at(24, -48).y)[3] > 100;      // (a low that has its X is not drawn as an L as well)
    S.outlookForce({ issued: 144, hour: 150, areas: [A, C] }); S.stormDraw(); out.lowNoX = (() => { const p = at(24, -48); const c = rgba(p.x + 7, p.y); return c[3] > 100 && c[0] > 180 && c[1] < 130 && c[2] < 100; })();      // (...and is drawn as one when its X is gone)
    S.stormForce(wA, { kind: 'M' }); S.outlookForce({ issued: 144, hour: 150, areas: [A, B, C] });
    document.getElementById('stdist').checked = false; S.stormDraw(); out.off = { frac: probe(24, -48).frac, x: marks().xa, legend: getComputedStyle(lg).display !== 'none', marks: S.outlookHits().marks.length }; document.getElementById('stdist').checked = true;
    S.stormForce(wA, { th: 'tc', v: 35, vr: 35 }); S.stormDraw(); out.formed = { frac: probe(24, -48).frac, marks: S.outlookHits().marks.map((m) => m.key).join(), areas: S.outlookHits().areas.map((a) => a.key).sort().join() };
    S.stormForce(wA, { alive: false }); S.stormForce(wB, { alive: false }); S.outlookForce(null); document.getElementById('stlabels').checked = true; S.map.setView(c0, z0, { animate: false }); S.stormDraw();
    return out;
  });
  const near = (c, k) => ({ low: [255, 226, 77], medium: [255, 157, 46], high: [255, 59, 48] })[k].every((v, i) => Math.abs(c.rgb[i] - v) < 45);
  check(`[${label}] a hatched area is diagonal lines over a faint wash, not a fill (opaque share of a probe line ${ol.pa.frac.toFixed(2)} / ${ol.pb.frac.toFixed(2)} / ${ol.pc.frac.toFixed(2)} for low / medium / high, ${ol.pa.runs} / ${ol.pb.runs} / ${ol.pc.runs} lines crossed, wash ${ol.pa.wash.toFixed(2)}), closer and thicker for a higher chance, in yellow, orange and red (${ol.pa.rgb.map(Math.round)} / ${ol.pb.rgb.map(Math.round)} / ${ol.pc.rgb.map(Math.round)}), with a coloured outline on a dark halo (${ol.ea.col && ol.ea.dark} / ${ol.eb.col && ol.eb.dark}) and nothing outside it (${ol.outside.toFixed(2)})`,
    ol.pa.frac > 0.1 && ol.pa.frac < 0.4 && ol.pb.frac > ol.pa.frac && ol.pc.frac > ol.pb.frac && ol.pc.frac < 0.7 && ol.pa.runs >= 5 && ol.pb.runs >= 5 && ol.pc.runs >= 5 && ol.pa.wash > 0.3 && near(ol.pa, 'low') && near(ol.pb, 'medium') && near(ol.pc, 'high') && ol.ea.col && ol.ea.dark && ol.eb.col && ol.eb.dark && ol.outside < 0.02);
  check(`[${label}] a disturbance that exists has an X in the colour of its chance on a dark outline (${ol.mk.xa}/4 diagonal pixels orange, ${ol.mk.xb}/4 red, the outline ${ol.mk.ra}/4 and ${ol.mk.rb}/4; yellow, orange and red X's: ${ol.xcol.join(' ')}), the one not yet in favourable conditions an arrow to its area in that colour as well (shaft ${ol.mk.shaftB}/11 red pixels, outline ${ol.mk.edgeB}/3, head ${ol.mk.head[0]} red and ${ol.mk.head[1]} dark pixels), the one inside its area none (${ol.mk.shaftA}); an area with no system has neither, and a low that has its X is not drawn as an L (${ol.lowUnderX}) until the X is gone (${ol.lowNoX})`,
    ol.mk.xa === 4 && ol.mk.xb === 4 && ol.mk.ra === 4 && ol.mk.rb === 4 && ol.xcol.every(Boolean) && ol.mk.shaftB >= 10 && ol.mk.edgeB >= 2 && ol.mk.head[0] >= 22 && ol.mk.head[1] >= 20 && ol.mk.shaftA === 0 && !ol.lowUnderX && ol.lowNoX && ol.hits.marks === 'b,c' && ol.hits.areas === 'a,b,c');
  check(`[${label}] a wave that has an X is the X, not a dashed line with an X on top (${ol.axisX} of 8 axis pixels beyond the X) and goes back to the wave when its area is gone (${ol.axisNoX} of 8); the titles stand beside the X's with the Storm names box -- "Wave" on the right of the X of the area on its west side (${ol.lab.b} white pixels), "Invest 92L" on the left of the one whose area is to the east (${ol.lab.c}, none on the other side ${ol.lab.cWrong}) -- and are gone without it (${ol.labOff.b}, ${ol.labOff.c})`,
    ol.axisX === 0 && ol.axisNoX >= 6 && ol.lab.b >= 20 && ol.lab.c >= 40 && ol.lab.cWrong === 0 && ol.labOff.b === 0 && ol.labOff.c === 0);
  check(`[${label}] hovering an X or an area says the chances and what it is: "${ol.hx.title}" / "${ol.hc.title}" / "${ol.ha.title}" (${ol.hx.text}) (${ol.hc.text}) (${ol.ha.text}), and nothing over open water (${ol.hn.ok})`,
    ol.hx.ok && ol.hx.title === 'Tropical wave' && /2-day 20 % · 7-day 50 % \(Medium\)/.test(ol.hx.text) && /near 24\.0°N 48\.0°W|24°N 48°W|24\.0° ?N 48\.0° ?W/.test(ol.hx.text) && /most of the chance comes within 4 days/.test(ol.hx.text)
    && ol.hc.ok && ol.hc.title === 'Invest 92L' && /7-day 80 % \(High\)/.test(ol.hc.text) && /Not yet in favourable conditions: nothing is expected in 2 days, the chance starts to build up in about 1 day/.test(ol.hc.text)
    && ol.ha.ok && ol.ha.title === 'Area of interest' && /2-day 20 % · 7-day 30 % \(Low\)/.test(ol.ha.text) && /No system yet: a disturbance is expected to form here in about 2 days/.test(ol.ha.text) && !ol.hn.ok && !ol.hn.shown);
  check(`[${label}] the legend names the three classes and the issue ("${ol.legend.text}") and the row says "${ol.label}"; the chances are written on the shapes with the names (${ol.pill.on}, and not without them: ${!ol.pill.off}); with the box off nothing of the outlook is drawn (opaque share ${ol.off.frac.toFixed(2)}, X pixels ${ol.off.x}, ${ol.off.marks} marks, legend ${ol.off.legend}); a disturbance that has formed loses its X and its area (${ol.formed.frac.toFixed(2)}, marks "${ol.formed.marks}", areas "${ol.formed.areas}")`,
    ol.legend.shown && /Low · 0–30 %/.test(ol.legend.text) && /Medium · 40–60 %/.test(ol.legend.text) && /High · 70–100 %/.test(ol.legend.text) && /Issued \d\dZ [A-Z][a-z]{2} \d+ · 3 areas/.test(ol.legend.text) && /Areas of interest/.test(ol.label) && ol.pill.on && !ol.pill.off
    && ol.off.frac === 0 && ol.off.x === 0 && ol.off.marks === 0 && !ol.off.legend && ol.formed.frac === 0 && ol.formed.marks === 'c' && ol.formed.areas === 'a,c');
  // and end to end, without forcing anything: waves put in the main development region get areas from the engine (chances in fives, the invest of the Atlantic once flagged), drawn on the map
  const e2e = await ev(() => {
    const S = window.SSTSIM, cv = document.getElementById('storm-canvas'), g = cv.getContext('2d'), d = cv.width / cv.clientWidth;
    S.map.setView([14, -45], 4, { animate: false }); document.getElementById('stlabels').checked = false;
    const ids = [[12, -30], [13, -38], [14, -46], [12, -54], [11, -34], [15, -26], [13, -42]].map(([la, lo]) => S.stormPlace({ kind: 'wave', lat: la, lon: lo })); S.stormDraw();
    const ol = S.outlook(), mine = ol.areas.filter((a) => a.kind === 'placed'), hits = S.outlookHits(); let drawn = 0;
    for (const h of hits.areas) { let n = 0; const [x0, y0, x1, y1] = h.bbox; for (let y = Math.max(0, Math.floor(y0)); y < Math.min(cv.clientHeight, y1); y += 2) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(cv.clientWidth, x1); x += 2) if (g.getImageData(Math.round(x * d), Math.round(y * d), 1, 1).data[3] > 150) n++; if (n > 25) drawn++; }
    const res = { n: mine.length, ok: mine.every((a) => a.p2 % 5 === 0 && a.p7 % 5 === 0 && a.p7 >= 10 && a.p2 <= a.p7 && a.x && a.poly.length >= 24), issued: ol.issued % 6 === 0, marks: hits.marks.length, drawn, areas: hits.areas.length, best: mine.reduce((t, a) => Math.max(t, a.p7), 0), ms: S.outlookFresh().ms };
    ids.forEach((id) => S.stormForce(id, { alive: false })); document.getElementById('stlabels').checked = true; S.stormDraw();
    return res;
  });
  check(`[${label}] without forcing anything, ${e2e.n} of seven waves put in the main development region have an area of interest from the engine (best chance ${e2e.best} %, ${e2e.marks} X's and ${e2e.drawn} of ${e2e.areas} areas drawn with ink), valid, issued at a synoptic time, and a fresh issue costs ${e2e.ms.toFixed(1)} ms`,
    e2e.n >= 1 && e2e.ok && e2e.issued && e2e.marks >= e2e.n && e2e.drawn >= 1 && e2e.ms < 60);

  // looking at one disturbance: a click on its X or on its area shows that disturbance and its area alone, with a card of its own; Escape, the cross, an empty click, Place or a depression
  // formed from it put everything back (a depression: the cyclone's card). Forced to three known areas whose keys are the systems' own.
  const selSetup = await ev(() => {
    const S = window.SSTSIM, c0 = S.map.getCenter(), z0 = S.map.getZoom(); S.map.setView([24, -48], 4, { animate: false }); document.getElementById('stlabels').checked = true;
    const wA = S.stormPlace({ kind: 'wave', lat: 24, lon: -48 }), wB = S.stormPlace({ kind: 'wave', lat: 24, lon: -34 });
    const ring = (la, lo, r) => Array.from({ length: 40 }, (_, k) => { const a = 2 * Math.PI * k / 40; return [la + r * Math.sin(a), lo + r * Math.cos(a) / Math.cos(la * Math.PI / 180)]; });
    const area = (key, cls, la, lo, extra) => Object.assign({ key, id: null, kind: 'unborn', x: null, arrow: null, arrowR: 0, p2: 20, p7: { low: 30, medium: 50, high: 80 }[cls], cls, poly: ring(la, lo, 3), t0: 30, t1: 90, birth: 200, invest: '' }, extra);
    window.__selAreas = [area('a', 'low', 24, -62), area(wA, 'medium', 24, -48, { id: wA, kind: 'wave', x: [24, -48], birth: null }), area(wB, 'high', 24, -26, { id: wB, kind: 'wave', x: [24, -34], arrow: [24, -27], arrowR: 3, birth: null, invest: '92L' })];
    S.outlookForce({ issued: 144, hour: 150, areas: window.__selAreas }); S.stormDraw();
    return { wA, wB, c0: [c0.lat, c0.lng], z0, before: S.stormDrawn().length };
  });
  const aoiPx = (la, lo) => ev(([la, lo]) => window.SSTSIM.placePx(la, lo), [la, lo]);
  const aoiNow = () => ev(() => { const S = window.SSTSIM, st = S.aoiState(), h = S.outlookHits(), cv = document.getElementById('storm-canvas'), g = cv.getContext('2d'), d = cv.width / cv.clientWidth, p = S.placePx(24, -62);
    let inkA = 0; for (let x = -30; x <= 30; x++) if (g.getImageData(Math.round((p.x + x) * d), Math.round((p.y + 22) * d), 1, 1).data[3] > 100) inkA++;
    return { st, areas: h.areas.map((a) => a.key).join(), marks: h.marks.map((a) => a.key).join(), drawn: S.stormDrawn(), inkA, cardHidden: document.getElementById('storm-card').hidden, sc: document.getElementById('sc-name').textContent, tip: document.getElementById('storm-tip').style.display }; });
  let qp = await aoiPx(24, -34); await page.mouse.move(qp.x - 25, qp.y - 25); await page.mouse.click(qp.x, qp.y); await page.waitForTimeout(150);
  const sl1 = await aoiNow(); await page.keyboard.press('Escape'); await page.waitForTimeout(100); const sl1e = await aoiNow();
  qp = await aoiPx(24, -62); await page.mouse.click(qp.x, qp.y + 20); await page.waitForTimeout(150); const sl2 = await aoiNow();
  qp = await aoiPx(18, -75); await page.mouse.click(qp.x, qp.y); await page.waitForTimeout(100); const sl2e = await aoiNow();
  qp = await aoiPx(24, -48); await page.mouse.click(qp.x, qp.y); await page.waitForTimeout(100); const sl3 = await aoiNow(); await page.click('#ac-close'); await page.waitForTimeout(100); const sl3e = await aoiNow();
  await page.mouse.click(qp.x, qp.y); await page.waitForTimeout(100);
  const sl4 = await ev(() => { const S = window.SSTSIM; S.place(true); const a = S.aoiState(); S.place(false); return { hidden: a.hidden, sel: a.sel }; });
  const sl5 = await ev(({ wA, wB, c0, z0 }) => { const S = window.SSTSIM; S.aoiSelect(wB); const before = S.aoiState(); S.stormForce(wB, { th: 'tc', v: 35, vr: 35, depNum: 1 }); S.stormDraw(); const after = S.aoiState();
    const r = { before: { sel: before.sel, hidden: before.hidden }, after: { sel: after.sel, hidden: after.hidden, tc: after.tc }, card: !document.getElementById('storm-card').hidden, name: document.getElementById('sc-name').textContent };
    S.aoiSelect(null); S.stormForce(wB, { alive: false }); S.stormForce(wA, { alive: false }); S.outlookForce(null); S.map.setView(c0, z0, { animate: false }); S.stormDraw(); return r; }, selSetup);          // (the view the page had: the Place checks that follow put the pointer where it is clear of the picker)
  check(`[${label}] clicking the X of a disturbance shows it alone with its card (${sl1.st.name}, ${sl1.st.p2} % / ${sl1.st.p7} % ${sl1.st.cls}, ${sl1.st.cond}, ${sl1.st.pos}, window ${sl1.st.win}): the other systems (${selSetup.before} before, ${sl1.drawn.length} now) and areas (${sl1.areas}) go, the area and X stay (${sl1.marks}); Escape puts everything back (${sl1e.st.hidden}, ${sl1e.areas})`,
    selSetup.before >= 1 && !sl1.st.hidden && sl1.st.sel === selSetup.wB && sl1.st.name === 'Invest 92L' && sl1.st.p2 === '20' && sl1.st.p7 === '80' && sl1.st.cls === 'High' && /rgb\(255, 59, 48\)/.test(sl1.st.clsBg) && sl1.st.cond === 'Not yet favourable' && /24\.0°N 34\.0°W/.test(sl1.st.pos)
    && /\d\dZ [A-Z][a-z]{2} \d+ – \d\dZ [A-Z][a-z]{2} \d+/.test(sl1.st.win) && sl1.areas === selSetup.wB && sl1.marks === selSetup.wB && sl1.drawn.length === 0 && sl1.inkA === 0 && sl1.cardHidden && sl1.tip === 'none'
    && sl1e.st.hidden && sl1e.st.sel === null && sl1e.areas === 'a,' + selSetup.wA + ',' + selSetup.wB && sl1e.drawn.length >= 1);
  check(`[${label}] clicking an area itself selects it (an area with no system yet: "${sl2.st.name}", ${sl2.st.type}, ${sl2.st.cond}), an empty click puts everything back (${sl2e.st.hidden}, ${sl2e.areas}), the X of a wave shows "${sl3.st.name}" and its cross closes the card (${sl3e.st.hidden}), and so does Place (${sl4.hidden}); the card keeps showing the same disturbance as the issues go by`,
    !sl2.st.hidden && sl2.st.sel === 'a' && sl2.st.name === 'Area of interest' && sl2.st.type === 'no system yet' && sl2.st.cond === 'No system yet' && sl2.st.cls === 'Low' && sl2.areas === 'a' && sl2.marks === '' && sl2e.st.hidden && sl2e.areas.split(',').length === 3
    && !sl3.st.hidden && sl3.st.sel === selSetup.wA && sl3.st.name === 'Tropical wave' && sl3.st.cond === 'Favourable' && sl3.st.cls === 'Medium' && sl3e.st.hidden && sl3e.st.sel === null && sl4.hidden && sl4.sel === null);
  check(`[${label}] a disturbance that becomes a depression while it is looked at hands the card to the cyclone (card of the disturbance ${sl5.after.hidden ? 'closed' : 'open'}, the storm card ${sl5.card ? 'open' : 'closed'} as "${sl5.name}", selected ${sl5.after.tc})`,
    !sl5.before.hidden && sl5.before.sel === selSetup.wB && sl5.after.hidden && sl5.after.sel === null && sl5.card && sl5.after.tc === selSetup.wB && sl5.name.length > 0);

  // lows are drawn only where a depression could still form: over water between 18 and 45N
  const lows = await ev(() => {
    const S = window.SSTSIM, c = S.map.getCenter(), z = S.map.getZoom(); S.map.setView([30, -55], 3, { animate: false });
    S.stormLowsSet([[30, -60, 1004], [10, -50, 1005], [50, -30, 990], [35, -90, 1006]]);                     // open water at 30N, then 10N, 50N and the Mississippi valley
    const drawn = S.stormLowsDrawn(), on = document.getElementById('stlows').checked;
    S.stormLowsSet(null); S.map.setView(c, z, { animate: false }); S.stormDraw();
    return { drawn, on };
  });
  check(`[${label}] a low is drawn only over water between 18 and 45N (of four lows, at 30N 60W, 10N 50W, 50N 30W and over land at 35N 90W, drawn: ${JSON.stringify(lows.drawn)})`, lows.on && lows.drawn.length === 1 && lows.drawn[0][0] === 30 && lows.drawn[0][1] === -60);

  // hover: tooltip with name, category, wind in mph and kt, gusts, pressure; leaving hides it; click opens the stat card, Escape closes it
  await ev((id) => { window.SSTSIM.stormForce(id, { th: 'tc', v: 105, vr: 105, p: 946 }); window.SSTSIM.stormDraw(); }, i1);
  const px = await ev((id) => window.SSTSIM.stormPx(id), i1);
  await page.mouse.move(px.x - 40, px.y - 40); await page.mouse.move(px.x, px.y, { steps: 4 });
  await page.waitForTimeout(150);
  const tip = await ev(() => { const t = document.getElementById('storm-tip'); return { shown: t.style.display === 'block', text: t.innerText.replace(/\n/g, ' | '), city: document.getElementById('city-tip').style.display }; });
  check(`[${label}] hovering a storm shows its card tooltip: ${tip.text}`, tip.shown && /Arthur/.test(tip.text) && /Major Hurricane \(Cat 3\)/.test(tip.text) && /120 mph \(105 kt\)/.test(tip.text) && /gusts 145 mph/.test(tip.text) && /946 hPa/.test(tip.text) && tip.city !== 'block');
  await page.mouse.click(px.x, px.y); await page.waitForTimeout(250);
  const card = await ev(() => { const c = document.getElementById('storm-card'), g = (id) => document.getElementById(id).textContent; return { hidden: c.hidden, name: g('sc-name'), cat: g('sc-cat'), mph: g('sc-mph'), p: g('sc-p'), gust: g('sc-gust'), mv: g('sc-mv'), formed: g('sc-formed'), ace: g('sc-ace'), peak: document.getElementById('sc-peak').style.display !== 'none', text: c.innerText.replace(/\s+/g, ' ') }; });
  check(`[${label}] clicking a live storm opens its stat card (${card.name}, ${card.cat}, ${card.mph} mph, ${card.p} hPa, ${card.gust}, ${card.mv}, formed ${card.formed})`, !card.hidden && card.name === 'Arthur' && /Major Hurricane/.test(card.cat) && card.mph === '120' && card.p === '946' && /145 mph \((water|land)\)/.test(card.gust) && /ACE/.test(card.text) && /Damage/.test(card.text) && /Formed/.test(card.text) && /Movement/.test(card.text) && card.formed !== '–');
  // a selected storm is shown alone: every other path, wave and low disappears until it is deselected (Escape, the cross, or a click on the empty map)
  const solo = await ev(() => ({ ids: window.SSTSIM.stormDrawn(), note: document.getElementById('sc-note').innerText }));
  check(`[${label}] while a storm is selected every other system disappears: only ${solo.ids.join(', ')} is drawn`, solo.ids.length === 1 && solo.ids[0] === i1 && /only this system/i.test(solo.note));
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.mouse.move(px.x + 400, px.y + 200); await page.waitForTimeout(100);
  const closed = await ev(() => ({ card: document.getElementById('storm-card').hidden, tip: document.getElementById('storm-tip').style.display, ids: window.SSTSIM.stormDrawn() }));
  check(`[${label}] Escape closes the card, brings every system back (${closed.ids.join(', ')}) and moving away hides the tooltip`, closed.card === true && closed.tip === 'none' && [i1, i2, i3].every((id) => closed.ids.includes(id)));
  await page.mouse.click(px.x, px.y); await page.waitForTimeout(200);
  const again = await ev(() => ({ card: document.getElementById('storm-card').hidden, ids: window.SSTSIM.stormDrawn() }));
  await page.mouse.click(px.x - 300, px.y - 100); await page.waitForTimeout(200);      // open sea, clear of the stat card (which sits on the right) and of the dock (the first version clicked 400 px to the right and 200 below)
  const empty = await ev(() => ({ card: document.getElementById('storm-card').hidden, ids: window.SSTSIM.stormDrawn() }));
  check(`[${label}] selecting again hides the others (${again.ids.length} drawn) and a click on the empty map deselects and shows them all (${empty.ids.length} drawn)`, again.card === false && again.ids.length === 1 && empty.card === true && [i1, i2, i3].every((id) => empty.ids.includes(id)));

  // ---- ensembles: a fan of members for the selected system, hover a member for its data, the track density, and a plain wave that can be picked
  const en0 = await ev(() => ({ has: !!document.getElementById('stens'), checked: document.getElementById('stens').checked, densChecked: document.getElementById('stdens').checked, densDisabled: document.getElementById('stdens').disabled, state: window.SSTSIM.ensState() }));
  check(`[${label}] the Ensembles and Track density layers exist, start off (the density one disabled until ensembles are on) and draw nothing (${JSON.stringify(en0.state)})`, en0.has && !en0.checked && !en0.densChecked && en0.densDisabled && en0.state === null);
  await ev(() => { document.getElementById('stens').click(); });
  const dis1 = await ev(() => document.getElementById('stdens').disabled);
  await page.mouse.click(px.x, px.y); await page.waitForFunction(() => window.SSTSIM.ensState() !== null, null, { timeout: 15000 }); await page.waitForTimeout(300);
  const en1 = await ev(() => { const S = window.SSTSIM, st = S.ensState(), probe = (k, i) => { const p = S.ensPoint(k, i), c = document.getElementById('storm-canvas'), d = c.width / c.clientWidth, a = c.getContext('2d').getImageData(Math.round(p.x * d), Math.round(p.y * d), 1, 1).data; return [a[0], a[1], a[2], a[3]]; };
    const cols = new Set(); let inked = 0, tot = 0; if (st) for (let k = 0; k < st.n; k++) for (const i of [6, 12, 20, 30]) { const p = S.ensPoint(k, i); if (!p) continue; tot++; const q = probe(k, i); if (q[3] > 40) { inked++; cols.add(Math.round(q[0] / 64) + '-' + Math.round(q[1] / 64) + '-' + Math.round(q[2] / 64)); } }
    return { st, inked, tot, cols: cols.size, p0: st ? S.ensPoint(0, 0) : null, live: S.stormPx(st ? st.tid : 'x') }; });
  check(`[${label}] with Ensembles on, a selected storm gets 24 members of three families (${en1.st && en1.st.names[0]}..${en1.st && en1.st.names[23]}), the density layer becomes available (${!dis1 ? 'enabled' : 'disabled'}), the lines are painted on the map (${en1.inked} of ${en1.tot} probes, ${en1.cols} colours) and the fan starts at the storm (${en1.p0 ? Math.round(Math.hypot(en1.p0.x - px.x, en1.p0.y - px.y)) : '-'} px)`,
    en1.st && en1.st.tid === i1 && en1.st.n === 24 && en1.st.names.some((n) => /^GEFS p\d\d$/.test(n)) && en1.st.names.some((n) => /^ECENS e\d\d$/.test(n)) && en1.st.names.some((n) => /^CMCE c\d\d$/.test(n)) && dis1 === false && en1.inked >= 0.6 * en1.tot && en1.cols >= 2 && en1.p0 && Math.hypot(en1.p0.x - px.x, en1.p0.y - px.y) < 25);
  const mp = await ev(() => window.SSTSIM.ensPoint(5, 14));
  await page.mouse.move(mp.x + 60, mp.y + 60); await page.mouse.move(mp.x, mp.y, { steps: 5 }); await page.waitForTimeout(200);
  const en2 = await ev(() => { const t = document.getElementById('storm-tip'); return { shown: t.style.display === 'block', title: t.querySelector('b').textContent, body: t.querySelector('div').innerText.replace(/\n/g, ' | '), hot: window.SSTSIM.ensState().hot }; });
  check(`[${label}] hovering a member highlights it and shows its data (${en2.title} | ${en2.body})`, en2.shown && en2.hot >= 0 && /^(GEFS|ECENS|CMCE) [pec]\d\d · \d+ h$/.test(en2.title) && /init \d\dz [A-Z][a-z]{2} \d+ \d{4}/.test(en2.body) && /peak \d+ mph \(1-min\)/.test(en2.body));
  await page.mouse.move(mp.x - 300, mp.y + 250); await page.waitForTimeout(200);
  const en3 = await ev(() => window.SSTSIM.ensState().hot);
  check(`[${label}] moving off the member un-highlights it (${en3})`, en3 === -1);
  const dn = await ev(() => { const S = window.SSTSIM, c = document.getElementById('storm-canvas'), d = c.width / c.clientWidth, p = S.ensPoint(0, 0), block = () => { const a = c.getContext('2d').getImageData(Math.round((p.x - 14) * d), Math.round((p.y + 8) * d), 20, 14).data; let t = 0; for (let i = 3; i < a.length; i += 4) t += a[i]; return t; };
    const off = block(); document.getElementById('stdens').click(); S.stormDraw(); const on = block(), st = S.ensState(); document.getElementById('stdens').click(); S.stormDraw(); return { off, on, dens: st.dens }; });
  check(`[${label}] Track density paints the map where the members agree (${dn.off} -> ${dn.on} of alpha in a block beside the storm) and nothing when it is off again`, dn.dens && dn.on > dn.off + 400);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  const en4 = await ev(() => window.SSTSIM.ensState());
  check(`[${label}] nothing is drawn once the storm is deselected (${JSON.stringify(en4)})`, en4 === null);
  // ---- the cone of uncertainty of the picked cyclone: the cone, the forecast points with their letters, hover for winds, gusts and pressure
  await ev(() => { if (document.getElementById('stens').checked) document.getElementById('stens').click(); document.querySelector('#lyr-dock [data-l="stcone"]').click(); });
  await page.mouse.click(px.x, px.y); await page.waitForFunction(() => window.SSTSIM.coneState() !== null, null, { timeout: 15000 }); await page.waitForTimeout(300);
  const cn1 = await ev(() => { const S = window.SSTSIM, cs = S.coneState(), c = document.getElementById('storm-canvas'), d = c.width / c.clientWidth, rd = (p) => { const a = c.getContext('2d').getImageData(Math.round(p.x * d), Math.round(p.y * d), 1, 1).data; return [a[0], a[1], a[2], a[3]]; };
    const pts = cs.pts.map((q) => ({ lead: q.lead, letter: q.letter, v: q.v, px: S.conePoint(q.lead) })); return { cs, ink: pts.filter((q) => q.px && rd(q.px)[3] > 200).length, n: pts.length, pressed: document.querySelector('#lyr-dock [data-l="stcone"]').getAttribute('aria-pressed'), tid: cs.tid, leads: cs.pts.map((q) => q.lead).join(), ok: cs.pts.every((q) => q.letter === (q.v < 34 ? 'D' : q.v < 64 ? 'S' : q.v < 96 ? 'H' : 'M')) }; });
  check(`[${label}] with Cones on, the picked cyclone gets its cone: ${cn1.n} forecast points at +${cn1.leads} h with letters by the wind (${cn1.cs.pts.map((q) => q.letter).join('')}), painted on the map (${cn1.ink} of ${cn1.n}), the outline drawn (${cn1.cs.poly}) and the button lit (${cn1.pressed})`,
    cn1.tid === i1 && cn1.n >= 4 && cn1.leads.startsWith('12,24,36,48') && cn1.ok && cn1.ink === cn1.n && cn1.cs.poly && cn1.pressed === 'true');
  const cw = await ev(() => { const S = window.SSTSIM, cs = S.coneState(), c = document.getElementById('storm-canvas'), d = c.width / c.clientWidth, g = c.getContext('2d'); return cs.pts.map((q) => { const p = S.conePoint(q.lead), r = Math.round(9 * d), a = g.getImageData(Math.round(p.x * d) - r, Math.round(p.y * d) - r, 2 * r + 1, 2 * r + 1).data; let white = 0, dark = 0; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= (7 * d) * (7 * d)) { const i = ((y + r) * (2 * r + 1) + x + r) * 4; if (a[i + 3] === 255 && Math.min(a[i], a[i + 1], a[i + 2]) >= 225) white++; else if (a[i + 3] === 255 && Math.max(a[i], a[i + 1], a[i + 2]) <= 70) dark++; } return [q.letter, white, dark]; }); });
  check(`[${label}] the letters of the forecast points are white with a thin dark edge, not black (white pixels in each circle: ${cw.map((q) => q[0] + ' ' + q[1]).join(', ')}; solid dark ones, which would be a black letter: ${cw.map((q) => q[2]).join(', ')})`, cw.length >= 4 && cw.every((q) => q[1] >= 7 && q[1] > 3 * q[2]));
  const cp = await ev(() => window.SSTSIM.conePoint(24));
  await page.mouse.move(cp.x + 50, cp.y + 50); await page.mouse.move(cp.x, cp.y, { steps: 5 }); await page.waitForTimeout(200);
  const cn2 = await ev(() => { const t = document.getElementById('storm-tip'); return { shown: t.style.display === 'block', title: t.querySelector('b').textContent, body: t.querySelector('div').innerText.replace(/\n/g, ' | '), hot: window.SSTSIM.coneState().hot }; });
  check(`[${label}] hovering a forecast point shows its winds, gusts and pressure (${cn2.title} | ${cn2.body}) and rings the point`, cn2.shown && cn2.hot === 24 && /^\+24 h( · Post-tropical)? · \d+ mph \(1-min\)$/.test(cn2.title) && /gusts \d+ mph · \d+ hPa/.test(cn2.body) && /\d\dz [A-Z][a-z]{2} \d+ \d{4}/.test(cn2.body));
  await page.mouse.move(cp.x - 250, cp.y + 250); await page.waitForTimeout(150);
  const cn3 = await ev(() => { const a = window.SSTSIM.coneState(); return a && a.hot; });
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  const cn4 = await ev(() => { const S = window.SSTSIM; const r = { cone: S.coneState(), ens: S.ensState() }; document.querySelector('#lyr-dock [data-l="stcone"]').click(); return r; });
  check(`[${label}] moving off the point un-rings it (${cn3}) and with nothing picked there is no cone and no fan (${JSON.stringify(cn4.cone)}, ${JSON.stringify(cn4.ens)})`, cn3 === -1 && cn4.cone === null && cn4.ens === null);

  // ---- the layer buttons: nine pills at the bottom right standing for the checkboxes (kept in the panel, hidden)
  const ld = await ev(() => { const S = document, btn = (l) => S.querySelector('#lyr-dock [data-l="' + l + '"]'), st = (l) => btn(l).getAttribute('aria-pressed'), el = (id) => S.getElementById(id);
    const labels = [...S.querySelectorAll('#lyr-dock .lyr')].map((b) => b.innerText.trim()), before = { hl: st('hl'), nhc: st('nhc'), steer: st('steer'), jet: st('jetline'), dens: btn('stdens').disabled };
    btn('hl').click(); const hl1 = { b: st('hl'), highs: el('highs').checked, lows: el('stlows').checked }; btn('hl').click(); const hl2 = { b: st('hl'), highs: el('highs').checked, lows: el('stlows').checked };
    btn('nhc').click(); const n1 = { b: st('nhc'), w: el('stwaves').checked, d: el('stdist').checked }; btn('nhc').click(); const n2 = { b: st('nhc'), w: el('stwaves').checked, d: el('stdist').checked };
    btn('steer').click(); const s1 = { b: st('steer'), c: el('steerarrows').checked }; btn('steer').click(); btn('jetline').click(); const j1 = { b: st('jetline'), c: el('jetline').checked }; btn('jetline').click();
    btn('stens').click(); const e1 = { b: st('stens'), c: el('stens').checked, densOff: btn('stdens').disabled }; btn('stens').click(); const e2 = { c: el('stens').checked, densOff: btn('stdens').disabled };
    const disp = (id) => getComputedStyle(el(id)).display, k0 = { ww: disp('ww-legend'), wf: disp('wf-legend') };
    btn('stww').click(); btn('stwf').click(); const k1 = { ww: disp('ww-legend'), wf: disp('wf-legend'), b: [st('stww'), st('stwf')], c: [el('stww').checked, el('stwf').checked] }; btn('stww').click(); btn('stwf').click(); const k2 = { ww: disp('ww-legend'), wf: disp('wf-legend'), b: [st('stww'), st('stwf')] };
    const hidden = ['jetline', 'steerarrows', 'highs', 'stlows', 'stwaves', 'stdist', 'stens', 'stdens', 'stcone', 'stwf', 'stww'].every((id) => el(id).closest('label').offsetParent === null), kept = ['cities', 'l265', 'l2', 'stlabels', 'show-sst', 'borders'].every((id) => el(id).closest('label').offsetParent !== null);
    return { labels, before, hl1, hl2, n1, n2, s1, j1, e1, e2, k0, k1, k2, hidden, kept }; });
  check(`[${label}] the nine layer buttons (${ld.labels.join(', ')}): Wind fields and Watches & warnings light and show their own small key only while they are on (${ld.k0.ww}/${ld.k0.wf} off, ${ld.k1.ww}/${ld.k1.wf} on, ${ld.k2.ww}/${ld.k2.wf} off again), Highs & lows drives both the highs and the lows, NHC disturbances both the waves and the areas, Streamlines the steering arrows, Jet stream the jet line, Ensembles lights and frees Track density (${ld.e1.densOff ? 'still disabled' : 'enabled'}, disabled again ${ld.e2.densOff}); the panel keeps the rest and hides these`,
    ld.labels.join() === 'Ensembles,Cones,Track density,Wind fields,Watches & warnings,Jet stream,Highs & lows,NHC disturbances,Streamlines' && ld.k0.ww === 'none' && ld.k0.wf === 'none' && ld.k1.ww === 'block' && ld.k1.wf === 'block' && ld.k1.b.join() === 'true,true' && ld.k1.c.join() === 'true,true' && ld.k2.ww === 'none' && ld.k2.wf === 'none' && ld.k2.b.join() === 'false,false' && ld.before.dens === true && ld.hl1.b === 'true' && ld.hl1.highs && ld.hl1.lows && ld.hl2.b === 'false' && !ld.hl2.highs && !ld.hl2.lows && ld.n1.b === 'false' && !ld.n1.w && !ld.n1.d && ld.n2.b === 'true' && ld.n2.w && ld.n2.d
    && ld.s1.b === 'true' && ld.s1.c && ld.j1.b === 'true' && ld.j1.c && ld.e1.b === 'true' && ld.e1.c && ld.e1.densOff === false && ld.e2.c === false && ld.e2.densOff === true && ld.hidden && ld.kept);
  const dl = []; await lyrSet(page, 'stww', true); await lyrSet(page, 'stwf', true);                      // (both keys on, with the outlook's: the three of them stand one over the other at the left)
  for (const [w, h, steer] of [[1280, 800, false], [1280, 800, true], [900, 700, false], [390, 844, false], [390, 844, true]]) {
    await page.setViewportSize({ width: w, height: h }); await lyrSet(page, 'steerarrows', steer); await page.waitForTimeout(200);
    dl.push(await ev(({ w, h, steer }) => { const rect = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; }, hit = (p, q) => p.l < q.r - 0.5 && q.l < p.r - 0.5 && p.t < q.b - 0.5 && q.t < p.b - 0.5;
      const btns = [...document.querySelectorAll('#lyr-dock .lyr')].filter((b) => b.offsetParent), others = ['clock', 'panel', 'dock', 'legend', 'season', 'readout'].concat(steer ? ['steer-legend'] : []).map((id) => [id, document.getElementById(id)]).filter(([, e]) => e && e.offsetParent !== null);
      const bad = []; for (const b of btns) { const r = rect(b); if (r.l < -0.5 || r.t < 0 || r.b > h + 0.5) { if (!(w <= 640 && r.l < w)) bad.push(b.innerText.trim() + ' off screen'); } for (const [id, e] of others) if (hit(r, rect(e))) bad.push(b.innerText.trim() + ' over ' + id); }
      const keys = w < 641 ? [] : ['ol-legend', 'ww-legend', 'wf-legend'].map((id) => [id, document.getElementById(id)]).filter(([, e]) => e && getComputedStyle(e).display !== 'none');       // (the phone layout has its own, older arrangement for the outlook's key)
      for (const [id, e] of keys) { const r = rect(e); if (r.t < 0 || r.l < 0 || r.b > h || r.r > w) bad.push(id + ' off screen'); for (const [oid, o] of others.concat(btns.map((b) => [b.innerText.trim(), b]))) if (hit(r, rect(o))) bad.push(id + ' over ' + oid); for (const [id2, e2] of keys) if (id2 < id && hit(r, rect(e2))) bad.push(id + ' over ' + id2); }
      const pr = rect(document.getElementById('panel')); return { w, h, steer, n: btns.length, keys: keys.length, bad, panelInside: pr.t >= 0 && pr.b <= h && pr.r <= w }; }, { w, h, steer }));
  }
  await lyrSet(page, 'steerarrows', false); await lyrSet(page, 'stww', false); await lyrSet(page, 'stwf', false); await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(150);
  check(`[${label}] the layer buttons and the three keys (wind field, watches and warnings, outlook) fit and overlap nothing (the clock, panel, playback dock, colour bars, season bar, each other) at 1280, 900 and 390 px wide, with the steering legend on and off (${dl.map((x) => x.w + (x.steer ? '+steer' : '') + ': ' + x.n + ' buttons, ' + x.keys + ' keys' + (x.bad.length ? ' ' + x.bad.join(', ') : ' ok')).join('; ')})`, dl.every((x) => x.n === 9 && x.keys === (x.w > 1040 ? 3 : x.w > 640 ? 1 : 0) && x.bad.length === 0 && x.panelInside));

  // a plain wave (no area of interest) can be picked, alone, and gets a fan too
  const pw = await ev(() => { const S = window.SSTSIM; if (!document.getElementById('stens').checked) document.getElementById('stens').click(); document.getElementById('stdist').click(); S.stormAuto(false); const id = S.stormPlace({ kind: 'wave', lat: 17, lon: -42 }); S.stormDraw(); return { id, px: S.stormPx(id), hits: S.stormDrawn() }; });
  await page.mouse.move(pw.px.x + 40, pw.px.y + 40); await page.mouse.move(pw.px.x, pw.px.y, { steps: 3 }); await page.mouse.click(pw.px.x, pw.px.y); await page.waitForFunction(() => window.SSTSIM.ensState() !== null, null, { timeout: 15000 }); await page.waitForTimeout(300);
  const pw1 = await ev(() => ({ sel: window.SSTSIM.plainSelState(), e: window.SSTSIM.ensState(), drawn: window.SSTSIM.stormDrawn() }));
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  const pw2 = await ev((id) => { const S = window.SSTSIM, r = { sel: S.plainSelState(), e: S.ensState() }; if (document.getElementById('stens').checked) document.getElementById('stens').click(); document.getElementById('stdist').click(); S.stormForce(id, { alive: false }); S.stormAuto(true); S.stormDraw(); return r; }, pw.id);
  check(`[${label}] a plain wave can be clicked: it is picked alone (${JSON.stringify(pw1.sel)}, ${pw1.drawn.length} cyclones drawn), gets its fan (${pw1.e ? pw1.e.n : 0} members, predictability ${pw1.e ? pw1.e.factor.toFixed(2) : '-'}), and Escape puts it all back (${JSON.stringify(pw2.sel)})`,
    pw1.sel && pw1.sel.id === pw.id && pw1.drawn.length === 0 && pw1.e && pw1.e.tid === pw.id && pw1.e.n === 24 && pw1.e.factor > 1.2 && pw2.sel === null && pw2.e === null);

  // layout: at desktop, tablet and phone widths the season bar stays on screen and clear of the clock, the open panel and the dock,
  // and an open stat card stays on screen and clear of the dock (the bar once ran over the panel title and off a phone's edge)
  const lay = [];
  for (const [w, h] of [[1280, 800], [900, 700], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(150);
    lay.push(await ev(({ w, h }) => {
      const S = window.SSTSIM, rect = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
      const hit = (p, q) => p.l < q.r - 0.5 && q.l < p.r - 0.5 && p.t < q.b - 0.5 && q.t < p.b - 0.5;
      const bar = rect('season'), card = document.getElementById('storm-card'), wasHidden = card.hidden;
      card.hidden = false; const cr = rect('storm-card'); card.hidden = wasHidden;       // the card still holds the text of the click above, so it has its real height
      const others = ['clock', 'panel', 'dock'].map((id) => [id, rect(id)]);
      return { w, h, bar, inside: bar.l >= 0 && bar.r <= w && bar.t >= 0 && bar.b <= h, over: others.filter(([, r]) => hit(bar, r)).map(([id]) => id), cardInside: cr.l >= 0 && cr.r <= w && cr.t >= 0 && cr.b <= h, cardOverDock: hit(cr, rect('dock')) };
    }, { w, h }));
  }
  await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(150);
  check(`[${label}] the season bar fits on screen and overlaps nothing at 1280, 900 and 390 px wide (${lay.map((x) => x.w + ': ' + Math.round(x.bar.l) + '-' + Math.round(x.bar.r) + ' x ' + Math.round(x.bar.t) + '-' + Math.round(x.bar.b) + (x.over.length ? ' over ' + x.over.join('+') : '')).join('; ')}), and the stat card fits and clears the dock`,
    lay.every((x) => x.inside && x.over.length === 0 && x.cardInside && !x.cardOverDock));

  // a slider reaches the storms: the same hour of the same seed with Wind shear at 0 and at +25 kt (identical time path, only the slider differs)
  const sl = await ev(() => {
    const S = window.SSTSIM, at = (shift) => { S.applySeed(500); S.setPlaying(false); S.stormAuto(false); S.tick(24 * 75); S.set('shearShift', shift); S.tick(6); const e = S.stormEnvSample(15, -55); S.set('shearShift', 0); return e; };
    const a = at(0), b = at(25);
    return { a: a.shear, b: b.shear, ha: a.hour, hb: b.hour };
  });
  check(`[${label}] the Wind shear slider reaches the storms at the next keyframe (within six hours): the same hour of the same seed sees ${sl.a.toFixed(1)} kt of shear at 0 and ${sl.b.toFixed(1)} kt at +25`, sl.ha === sl.hb && sl.b - sl.a > 12 && sl.b - sl.a < 27);

  // automatic seeding: off by default in this test, on with the box ticked
  const auto = await ev(() => {
    const S = window.SSTSIM; S.applySeed(99); S.setPlaying(false); S.stormAuto(false); S.tick(24 * 25); const off = S.stormState().seeds.W + S.stormState().seeds.N;
    S.applySeed(99); S.setPlaying(false); S.stormAuto(true); S.tick(24 * 25); const on = S.stormState().seeds.W + S.stormState().seeds.N;
    S.stormAuto(false); return { off, on };
  });
  check(`[${label}] with automatic systems off nothing is seeded (${auto.off}); with them on waves and regional seeds appear (${auto.on} in 25 days)`, auto.off === 0 && auto.on > 0);

  // THE determinism claim: same seed, same storms and the same weather whether the page redrew every 6 hours, never, or the clock moved in 1-hour steps
  const det = await ev(() => {
    const S = window.SSTSIM;
    const snap = () => ({ j: S.stormJSON(), a: S.sample(15, -50), b: S.sample(25, -80), c: S.sample(32, -40), n: S.enso().n34 });
    const run = (mode) => {
      S.applySeed(777); S.setPlaying(false); S.stormAuto(true);
      if (mode === 'redraw6') for (let i = 0; i < 4 * 24; i++) S.advance(6);
      else if (mode === 'hourly') for (let i = 0; i < 24 * 24; i++) S.tick(1);
      else S.tick(24 * 24);
      S.advance(0); return snap();
    };
    const A = run('redraw6'), B = run('hourly'), C = run('one');
    const same = (x, y) => x.j === y.j && x.n === y.n && ['a', 'b', 'c'].every((k) => ['sst', 'humid', 'shear'].every((f) => x[k][f] === y[k][f]));
    const D = (S.applySeed(778), S.setPlaying(false), S.stormAuto(true), S.tick(24 * 24), S.advance(0), snap());
    S.stormAuto(false);
    return { ab: same(A, B), ac: same(A, C), diff: !same(A, D), len: A.j.length, sst: [A.a.sst, B.a.sst, C.a.sst], shear: [A.a.shear, B.a.shear, C.a.shear], n: [A.n, B.n, C.n] };
  });
  check(`[${label}] one seed gives the same storms and the same SST / humidity / shear / ENSO whether the page redrew every 6 h, the clock ran in 1-h steps, or it moved in one call (${(det.len / 1024).toFixed(0)} KB of storm state; SST ${det.sst.map((x) => x.toFixed(4)).join(' / ')}, shear ${det.shear.map((x) => x.toFixed(3)).join(' / ')})`, det.ab && det.ac);
  check(`[${label}] a different seed gives different storms`, det.diff);
  // the issues of the outlook are made by the clock, not by looking: nothing here draws the map or asks for the outlook, and after the days ticked by the engine has made its issue of that hour -- again in a new season (the issue
  // clock starts again with it) and not at all with the Areas of interest box off
  const eager = await ev(() => { const S = window.SSTSIM, now = () => [S.outlookMemSlot(), Math.floor(S.state().simHour / 6)], out = {};
    S.applySeed(9001); S.setPlaying(false); S.storms(true); S.stormAuto(true); S.tick(24 * 40); out.a = now();
    S.applySeed(9002); S.setPlaying(false); S.stormAuto(true); S.tick(24 * 3); out.b = now();
    document.getElementById('stdist').checked = false; S.tick(24); out.off = now(); document.getElementById('stdist').checked = true; S.stormAuto(false); return out; });
  check(`[${label}] the outlook's issues are made as the clock goes by (issue ${eager.a[0]} of ${eager.a[1]} after 40 days nobody looked at it, ${eager.b[0]} of ${eager.b[1]} after three days of a new season), and not with the Areas of interest box off (${eager.off[0]} while the clock is at ${eager.off[1]})`,
    eager.a[0] === eager.a[1] && eager.b[0] === eager.b[1] && eager.b[1] === 12 && eager.off[0] === eager.b[0] && eager.off[1] === eager.b[1] + 4);
  // the transition on the live page: hurricanes put into the westerlies over cold water (20 seeds) become post-tropical (a grey triangle) within three days, most of them, and keep their wind through the change
  // (a storm that changes class before its first six-hourly fix leaves no record, as a wave that never developed does: it is not counted either way)
  const et = await ev(() => {
    const S = window.SSTSIM, out = [];
    for (let sd = 11; sd < 31; sd++) {
      S.applySeed(sd); S.setPlaying(false); S.stormAuto(false);
      const id = S.stormPlace({ kind: 'td', lat: 41, lon: -52, v: 70 }); S.tick(24 * 3); S.advance(0);
      const x = JSON.parse(S.stormJSON()).systems.find((q) => q.id === id); if (!x) { out.push(null); continue; }
      const i = x.fixes.findIndex((f) => f.th === 'ex');
      out.push({ first: i >= 0 ? x.fixes[i] : null, before: i > 0 ? x.fixes[i - 1] : null, hours: i >= 0 ? x.fixes[i].h - x.fixes[0].h : null });
    }
    return out;
  });
  const etRec = et.filter(Boolean), etEx = etRec.filter((o) => o.first), etKept = etEx.filter((o) => o.before);
  check(`[${label}] hurricanes of 70 kt placed at 41N in the westerlies: ${etEx.length} of ${etRec.length} that left a record became post-tropical within three days (median ${etEx.length ? etEx.map((o) => o.hours).sort((a, b) => a - b)[Math.floor(etEx.length / 2)] : '-'} h), with a median ${etEx.length ? etEx.map((o) => o.first.v).sort((a, b) => a - b)[Math.floor(etEx.length / 2)] : '-'} kt at the first post-tropical fix: the wind is kept through the change`,
    etRec.length >= 10 && etEx.length >= 0.7 * etRec.length && etEx.every((o) => o.first.th === 'ex' && o.first.st === 'EX' && o.first.v >= 35) && etKept.length >= 5 && etKept.every((o) => o.first.v >= o.before.v - 15));
  // whole seasons through the live page (the lab of tools/storm_mc.mjs runs the same engine on the same weather, 96 held-out seasons: the numbers in the roadmap): eight seasons of 214 days from Jun 1
  const seas = await ev(() => { const S = window.SSTSIM, out = []; for (const seed of [301, 302, 303, 304, 313, 322, 328, 336]) { S.applySeed(seed); S.setPlaying(false); S.stormAuto(true); S.tick(24 * 214); S.advance(0); out.push(S.stormState().stats); } S.stormAuto(false); return out; });
  const mn = (k) => seas.reduce((a, x) => a + x[k], 0) / seas.length;
  check(`[${label}] eight whole seasons through the page look like the real Atlantic: ${mn('dep').toFixed(1)} depressions, ${mn('named').toFixed(1)} named storms, ${mn('hurr').toFixed(1)} hurricanes, ${mn('major').toFixed(1)} majors, ACE ${mn('ace').toFixed(0)} on average (real 15.8 / 14.4 / 7.2 / 3.2 / 122; seasons: ${seas.map((x) => x.named + '/' + x.hurr + '/' + x.major + '/' + Math.round(x.ace)).join(', ')} named/hurricanes/majors/ACE)`,
    mn('dep') >= SEASON_BANDS.dep[0] && mn('dep') <= SEASON_BANDS.dep[1] && mn('named') >= SEASON_BANDS.named[0] && mn('named') <= SEASON_BANDS.named[1] && mn('hurr') >= SEASON_BANDS.hurr[0] && mn('hurr') <= SEASON_BANDS.hurr[1]
    && mn('major') >= SEASON_BANDS.major[0] && mn('major') <= SEASON_BANDS.major[1] && mn('ace') >= SEASON_BANDS.ace[0] && mn('ace') <= SEASON_BANDS.ace[1] && seas.every((x) => x.named >= 3));
  // the storm engine reads SST, humidity and shear from its own one-degree grid (a sixteenth of the work); at its nodes the values must be exactly the map's full-resolution fields, also with the sliders moved
  const grid = await ev(() => {
    const S = window.SSTSIM, out = [];
    S.applySeed(4242); S.setPlaying(false); S.stormAuto(false);
    const probe = (name) => { const r = S.stormFieldCheck(); out.push({ name, max: r.max, nan: r.nanMismatch, nodes: r.nodes, live: r.live, interp: r.interp, pts: r.pts }); };
    S.tick(24 * 20); probe('day 20, 00Z');
    S.tick(24 * 70 + 7); probe('day 90, 07Z');
    S.set('warming', 2); S.set('shearShift', 15); S.set('moisture', 8); S.tick(24 * 3 + 11); probe('sliders moved, 18Z');
    S.tick(6 + 24 * 4); probe('four days on, 00Z');
    S.set('warming', 0); S.set('shearShift', 0); S.set('moisture', 0);
    return out;
  });
  check(`[${label}] the storm engine's one-degree environment is exactly the map's fields at its nodes and interpolates between them as written (${grid.map((g) => g.name + ': ' + g.nodes + ' nodes, largest difference ' + g.max.join('/') + ' (SST/humidity/shear)' + (g.live ? ', the engine\'s own keyframe ' + g.live.max.join('/') : '') + ', ' + g.pts + ' lookups off by ' + g.interp.toExponential(1)).join('; ')})`,
    grid.every((g) => g.max.every((m) => m === 0) && g.nan === 0 && g.nodes > 15000 && g.pts > 600 && g.interp < 1e-6) && grid.filter((g) => g.live).length >= 2 && grid.every((g) => !g.live || (g.live.max.every((m) => m === 0) && g.live.nanMismatch === 0)));

  // lakes are water for the storms: a lake takes the temperature the page draws for it (not the land's), and a depression put on one on a calm day is not called land, killed or made post-tropical at once; the other inland seas count too
  const lk = await ev(() => {
    const S = window.SSTSIM, near = (la, lo) => S.stormEnvSample(la, lo);
    S.applySeed(11); S.setPlaying(false); S.stormAuto(false); S.set('warming', 4); S.set('moisture', 20); S.set('shearShift', -20);
    S.tick(24 * 60); S.advance(0);
    let calm = null;
    for (let d = 0; d < 40 && !calm; d++) { const e = near(43.5, -87); if (e.sst >= 24.5 && e.shear <= 6 && e.rh >= 55) calm = { day: 60 + d, sst: e.sst, rh: e.rh, shear: e.shear }; else S.tick(24); }
    if (!calm) return { calm };
    S.advance(0);                                                                // the map is redrawn from the same hour (its lake temperatures are the ones to compare)
    const mich = near(43.5, -87), kansas = near(40, -95), erie = near(42.2, -81.2), hudson = near(60, -85), med = near(38, 3);
    const lakeV = (S.lakes().find((l) => l.name === 'Lake Michigan') || {}).v;
    const id = S.stormPlace({ kind: 'td', lat: 43.5, lon: -87, v: 30 });
    S.tick(6); const x = JSON.parse(S.stormJSON()).systems.find((q) => q.id === id);
    S.set('warming', 0); S.set('moisture', 0); S.set('shearShift', 0);
    return { calm, mich: { land: mich.land, lake: mich.lake, sst: mich.sst }, lakeV, kansas: { land: kansas.land }, erie: { land: erie.land, sst: erie.sst }, hudson: { land: hudson.land, sst: hudson.sst }, med: { land: med.land, sst: med.sst }, th: x && x.th, alive: x && x.alive, v: x && x.v };
  });
  check(`[${label}] lakes are water for the storms: on day ${lk.calm && lk.calm.day} (Lake Michigan at ${lk.mich && lk.mich.sst.toFixed(1)} degC, the page draws ${lk.lakeV && lk.lakeV.toFixed(1)}, ${lk.calm && lk.calm.shear.toFixed(0)} kt of shear, ${lk.calm && lk.calm.rh.toFixed(0)} % humidity) it is not land (lake ${lk.mich && lk.mich.lake}), Kansas is, Lake Erie (${lk.erie && lk.erie.sst.toFixed(1)}), Hudson Bay (${lk.hudson && lk.hudson.sst.toFixed(1)}) and the Mediterranean (${lk.med && lk.med.sst.toFixed(1)}) are; a depression put on Lake Michigan is still a ${lk.th} of ${lk.v && lk.v.toFixed(0)} kt six hours later`,
    !!lk.calm && lk.mich.land === false && lk.mich.lake > 0 && Math.abs(lk.mich.sst - lk.lakeV) < 0.06 && lk.kansas.land === true && lk.erie.land === false && lk.hudson.land === false && lk.med.land === false && lk.alive === true && lk.th === 'tc');

  // the live loop at 16x: the clock runs in slices that leave the page time to draw (no frame is blocked for long and the page keeps moving), and whatever the machine manages, the storms are the ones a single call to the same hour gives
  const live = await ev(async () => {
    const S = window.SSTSIM, speedX = document.getElementById('speed-x'), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    S.applySeed(901); S.setPlaying(false); S.storms(true); S.stormAuto(true); S.tick(24 * 40); S.advance(0);
    while (speedX.textContent !== '16×') document.getElementById('b-faster').click();
    S.setPlaying(true); await sleep(700);                                       // the first frames after a long synchronous call wait for the browser's own painting: not what is measured
    const h0 = S.state().simHour;
    let frames = 0, worst = 0, last = performance.now(), run = true;
    const raf = (t) => { frames++; worst = Math.max(worst, t - last); last = t; if (run) requestAnimationFrame(raf); };
    requestAnimationFrame(raf); await sleep(3000); run = false; S.setPlaying(false);
    const h1 = S.state().simHour, json = S.stormJSON();
    while (speedX.textContent !== '1×') document.getElementById('b-slower').click();
    S.applySeed(901); S.setPlaying(false); S.stormAuto(true); S.tick(h1); S.advance(0);
    const again = S.stormJSON(); S.stormAuto(false);
    return { h0, h1, frames, worst: Math.round(worst), same: again === json, kb: Math.round(json.length / 1024), speed: speedX.textContent };
  });
  check(`[${label}] playing at 16x for 3 s with storms on: the clock moved ${live.h1 - live.h0} hours, the page drew ${live.frames} frames and none was blocked for more than ${live.worst} ms, and the storms (${live.kb} KB) are exactly those of one call to hour ${live.h1}`,
    live.same && live.h1 - live.h0 >= 60 && live.frames >= 12 && live.worst < 600 && live.speed === '1×');

  // a slow machine (the processor throttled to a third): the clock falls behind instead of freezing the page, and what it owes is capped, so there is no burst of catching up when the machine recovers
  // (the first version of the live loop advanced everything that was owed in one frame: 9 frames in 3 s at this slowness instead of 22-26)
  await ev(() => { const S = window.SSTSIM, speedX = document.getElementById('speed-x'); S.applySeed(901); S.setPlaying(false); S.storms(true); S.stormAuto(true); S.tick(24 * 40); S.advance(0); while (speedX.textContent !== '16×') document.getElementById('b-faster').click(); });
  // (both speeds: since the engine got lighter (a simulated day costs 17 ms, not 44) the frame's time budget no longer binds at 16x on a third of a processor, only at 64x -- with no budget the page then
  // draws 5 frames in 3 s, one blocked for 1.2 s, and with no cap on the debt the clock owes 3,400 hours; at 16x the broken versions pass)
  const cdp = await page.context().newCDPSession(page);
  const slow = {};
  try {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 3 });
    for (const sp of ['16×', '64×']) {
      await ev((sp) => { const S = window.SSTSIM, speedX = document.getElementById('speed-x'); S.applySeed(901); S.setPlaying(false); S.storms(true); S.stormAuto(true); S.tick(24 * 40); S.advance(0); while (speedX.textContent !== '1×') document.getElementById('b-slower').click(); while (speedX.textContent !== sp) document.getElementById('b-faster').click(); }, sp);
      slow[sp] = await ev(async () => {
        const S = window.SSTSIM, speedX = document.getElementById('speed-x'), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        S.setPlaying(true); await sleep(700);
        const h0 = S.state().simHour; let frames = 0, run = true; const raf = () => { frames++; if (run) requestAnimationFrame(raf); };
        requestAnimationFrame(raf); await sleep(3000); run = false;
        const owed = S.owedHours(), adv = S.state().simHour - h0; S.setPlaying(false); S.stormAuto(false);
        while (speedX.textContent !== '1×') document.getElementById('b-slower').click();
        return { frames, owed: Math.round(owed * 10) / 10, adv };
      });
    }
  } finally { await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await cdp.detach(); }
  check(`[${label}] on a slow machine (processor throttled to a third) the page at 16x still draws ${slow['16×'].frames} frames in 3 s while the clock runs behind (${slow['16×'].adv} hours in them), and it owes the clock only ${slow['16×'].owed} hours (capped at 24); at 64x ${slow['64×'].frames} frames, ${slow['64×'].adv} hours, owing ${slow['64×'].owed}`,
    slow['16×'].frames >= 12 && slow['16×'].adv >= 30 && slow['16×'].owed <= 25 && slow['64×'].frames >= 12 && slow['64×'].adv >= 100 && slow['64×'].owed <= 25);
  // the issues are made one after another as the clock goes by (not only when the map is drawn), so each moves on from the last: ten days in six-hour steps on the real engine (last, as it moves the clock)
  const walk = await ev(() => { const S = window.SSTSIM; let prev = {}, worst = 0, steps = 0, first = 0, keys = new Set(), issues = new Set();
    const ids = [[12, -30], [13, -38], [14, -46], [12, -54], [11, -34], [15, -26], [13, -42], [10, -36], [16, -34], [12, -44], [14, -52], [11, -26]].map(([la, lo]) => S.stormPlace({ kind: 'wave', lat: la, lon: lo }));       // (waves put in the main development region: the engine's own areas for them, an issue every six hours)
    for (let k = 0; k < 40; k++) { S.tick(6); S.advance(0); const o = S.outlook(); issues.add(o.issued); const cur = S.outlookMem();       // (what the issue said of every disturbance it knows, drawn or not: an area that a neighbour hides is still moving on)
      for (const [key, v] of Object.entries(cur)) { keys.add(key); if (key in prev) { worst = Math.max(worst, Math.abs(v[1] - prev[key][1]), Math.abs(v[0] - prev[key][0])); steps++; } else if (k && v[1] >= 10) first = Math.max(first, v[1]); } prev = cur; }
    ids.forEach((id) => { if (S.stormPx(id)) S.stormForce(id, { alive: false }); }); S.stormDraw();          // (the ones that have already ended are gone)
    return { worst, steps, first, keys: keys.size, issues: issues.size }; });
  check(`[${label}] over ten days of six-hour steps on the real engine (${walk.issues} issues, ${walk.keys} disturbances, ${walk.steps} steps) the chance of a disturbance (2-day or 7-day) never moves more than ${walk.worst} points between two issues and one that shows up is at ${walk.first} % at most`, walk.issues >= 39 && walk.steps >= 15 && walk.worst <= 20 && walk.first <= 40);

  await ev((v) => { window.SSTSIM.map.setView([v[0], v[1]], v[2], { animate: false }); window.SSTSIM.storms(false); window.SSTSIM.restart(); }, view0);   // leave the page as it was found (its view) and without storms for anything after this
}

// Place mode: the button and picker, the white dot and the forecast line that follow the pointer, Esc, a click that places, the preview being exactly what the
// placed system then does (the weather of the next days is run forward from a copy of the live state, which must leave the live sim untouched), and that the
// preview moves smoothly as the pointer does.
async function checkPlace(page, label) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await ev(() => { const S = window.SSTSIM; S.storms(true); S.setPlaying(false); S.applySeed(11); S.setPlaying(false); S.stormAuto(false); S.tick(24 * 70); S.advance(0); document.getElementById('detail').checked = false; S.map.setView([25.95, -55], 4.5, { animate: false }); });          // (on the page's own view, whatever the checks before this one left: the picker covers the middle of the bottom of the map, and the pointer must be clear of it)
  const ui = await ev(() => { const b = document.getElementById('b-place'); return { exists: !!b, inDock: !!b && document.getElementById('dock').contains(b), pressed: b && b.getAttribute('aria-pressed'), menuHidden: document.getElementById('place-menu').hidden, kinds: [...document.querySelectorAll('#place-menu button')].map((x) => x.dataset.kind).join() }; });
  check(`[${label}] the dock has a Place button (not pressed) and its picker (wave, td, sd, low) is closed until it is pressed`, ui.exists && ui.inDock && ui.pressed === 'false' && ui.menuHidden && ui.kinds === 'wave,td,sd,low');

  // pressing it while the clock runs: the clock holds, the picker opens, the cursor is a crosshair
  await ev(() => window.SSTSIM.setPlaying(true));
  await page.click('#b-place');
  const on = await ev(() => ({ pressed: document.getElementById('b-place').getAttribute('aria-pressed'), menu: !document.getElementById('place-menu').hidden, cls: document.body.classList.contains('placing'), hour: window.SSTSIM.state().simHour, playing: document.getElementById('ic-pause').style.display !== 'none' }));
  await page.waitForTimeout(300);
  const hour2 = await ev(() => window.SSTSIM.state().simHour);
  check(`[${label}] pressing Place opens the picker, switches to the crosshair and holds the clock (hour ${on.hour}, still ${hour2} 0.3 s later)`, on.pressed === 'true' && on.menu && on.cls && !on.playing && hour2 === on.hour);

  // the white dot and the forecast line follow the pointer (a tropical depression put over warm water in August)
  await page.click('#place-menu button[data-kind="td"]');
  const at = await ev(() => window.SSTSIM.placePx(15, -45));
  await page.mouse.move(at.x - 40, at.y - 25); await page.mouse.move(at.x, at.y, { steps: 6 }); await page.waitForTimeout(350);
  const probe = await ev(({ x, y }) => {
    const S = window.SSTSIM, cv = document.getElementById('storm-canvas'), g = cv.getContext('2d'), d = cv.width / cv.clientWidth, px = (x, y) => g.getImageData(Math.round(x * d), Math.round(y * d), 1, 1).data;
    const F = S.placePreview(), c = px(x, y), line = [];
    if (F) for (const f of F.fixes.slice(4, 14)) { const q = S.placePx(f.lat, f.lon); let n = 0; for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) if (px(q.x + dx, q.y + dy)[3] > 60) n++; line.push(n); }
    return { white: c[0] > 235 && c[1] > 235 && c[2] > 235 && c[3] > 200, line, fixes: F ? F.fixes.length : 0, label: S.placeLabel() };
  }, at);
  check(`[${label}] a white dot sits at the pointer and the forecast line is drawn along the predicted fixes (${probe.fixes} three-hourly fixes, "${probe.label}")`, probe.white && probe.fixes >= 40 && probe.line.length === 10 && probe.line.every((n) => n > 0) && probe.label.length > 5);
  const kinds = await ev(async () => {
    const out = {};
    for (const k of ['wave', 'td', 'sd', 'low']) { document.querySelector(`#place-menu button[data-kind="${k}"]`).click(); await new Promise((r) => setTimeout(r, 120)); out[k] = [document.querySelector(`#place-menu button[data-kind="${k}"]`).getAttribute('aria-checked'), window.SSTSIM.placeLabel(), document.querySelectorAll('#place-menu button[aria-checked="true"]').length]; }
    return out;
  });
  check(`[${label}] the picker switches what is previewed: ${Object.entries(kinds).map(([k, v]) => k + ' -> "' + v[1] + '"').join('; ')}`, Object.values(kinds).every((v) => v[0] === 'true' && v[2] === 1 && v[1].length > 3) && new Set(Object.values(kinds).map((v) => v[1])).size >= 3);
  await page.click('#place-menu button[data-kind="td"]');

  // Esc cancels: nothing placed, the dot is gone, the clock runs again
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  const esc = await ev(({ x, y }) => { const cv = document.getElementById('storm-canvas'), g = cv.getContext('2d'), d = cv.width / cv.clientWidth, a = g.getImageData(Math.round(x * d), Math.round(y * d), 1, 1).data; return { pressed: document.getElementById('b-place').getAttribute('aria-pressed'), menu: document.getElementById('place-menu').hidden, systems: window.SSTSIM.stormState().systems.length, alpha: a[3], playing: document.getElementById('ic-pause').style.display !== 'none' }; }, at);
  check(`[${label}] Esc cancels placing: nothing was placed, the dot and line are gone, the clock that was running runs again`, esc.pressed === 'false' && esc.menu && esc.systems === 0 && esc.alpha < 10 && esc.playing);
  await ev(() => window.SSTSIM.setPlaying(false));

  // a click places it (press P, pick, move, click); the system is the one previewed, and it then does exactly what the preview said
  await page.keyboard.press('p'); await page.click('#place-menu button[data-kind="td"]');
  await page.mouse.move(at.x - 20, at.y - 10); await page.mouse.move(at.x, at.y, { steps: 4 }); await page.waitForTimeout(300);
  const pre = await ev(() => JSON.parse(JSON.stringify(window.SSTSIM.placePreview())));
  await page.mouse.click(at.x, at.y); await page.waitForTimeout(150);
  const placed = await ev(() => ({ pressed: document.getElementById('b-place').getAttribute('aria-pressed'), systems: window.SSTSIM.stormState().systems.map((s) => [s.id, s.th, s.lat, s.lon]) }));
  check(`[${label}] a click puts the system exactly there and leaves Place mode (${placed.systems.map((s) => s[0] + ' ' + s[1] + ' ' + s[2].toFixed(2) + ', ' + s[3].toFixed(2)).join('; ')})`, placed.pressed === 'false' && placed.systems.length === 1 && placed.systems[0][0] === 'M1' && placed.systems[0][1] === 'tc' && Math.abs(placed.systems[0][2] - 15) < 0.4 && Math.abs(placed.systems[0][3] + 45) < 0.4);
  const follow = await ev((pre) => {
    const S = window.SSTSIM; S.tick(24 * 7);
    const live = JSON.parse(S.stormJSON()).systems.find((x) => x.id === 'M1'), byH = new Map(live.fixes.map((f) => [f.h, f]));
    let n = 0, worst = 0, vmax = 0;
    for (const a of pre.fixes) { const c = byH.get(a.h); if (!c) continue; n++; worst = Math.max(worst, Math.abs(a.lat - c.lat), Math.abs(a.lon - c.lon)); vmax = Math.max(vmax, Math.abs(a.v - c.v)); }
    return { n, worst, vmax, peak: pre.peak.v };
  }, pre);
  check(`[${label}] the system then does exactly what the preview said: ${follow.n} three-hourly fixes over 7 days, largest position difference ${follow.worst.toFixed(2)} degrees, wind ${follow.vmax} kt (peak ${follow.peak} kt)`, follow.n >= 40 && follow.worst === 0 && follow.vmax === 0);

  // the advisory dots come every three hours: the six-hourly (synoptic) ones are the big dots, the ones between them small, so a peak that comes and goes quickly still shows; a hover on a small one shows its own time
  const dots = await ev(() => {
    const S = window.SSTSIM, live = JSON.parse(S.stormJSON()).systems.find((x) => x.id === 'M1'); window.__hfView = { c: S.map.getCenter(), z: S.map.getZoom() };
    S.map.fitBounds(live.fixes.map((f) => [f.lat, f.lon]), { animate: false, padding: [110, 110] }); S.stormDraw();
    return { hours: live.fixes.map((f) => f.h), dots: S.stormDots('M1') };
  });
  const syn = (d) => /^(00|06|12|18)Z/.test(d.t), big = dots.dots.filter((d) => d.r === 8), small = dots.dots.filter((d) => d.r === 6);
  check(`[${label}] the placed system's fixes are three hours apart (${dots.hours.length}), the dots at 00, 06, 12 and 18Z are the big ones (${big.length}, hit radius 8) and the ones between them small (${small.length}, hit radius 6)`,
    dots.hours.length >= 40 && dots.hours.every((h, i) => i === 0 || h - dots.hours[i - 1] === 3) && big.length >= 10 && small.length >= 10 && dots.dots.slice(1).every((d) => (d.r === 8) === syn(d)));
  const alone = small.filter((d) => dots.dots.every((o) => o === d || Math.hypot(o.x - d.x, o.y - d.y) > 14)).sort((a, b) => a.y - b.y)[0];
  if (alone) { await page.mouse.move(alone.x - 30, alone.y - 30); await page.mouse.move(alone.x, alone.y, { steps: 3 }); await page.waitForTimeout(120); }
  const tipDot = await ev(() => { const t = document.getElementById('storm-tip'); return { shown: t.style.display === 'block', text: t.innerText.replace(/\n/g, ' | ') }; });
  check(`[${label}] hovering a small three-hourly dot (${alone ? alone.t : 'none found'}) shows the advisory of that hour: ${tipDot.text}`, !!alone && tipDot.shown && tipDot.text.includes(alone.t) && !syn(alone));
  await page.mouse.move(2, 2); await page.waitForTimeout(80);
  await ev(() => { const S = window.SSTSIM, v = window.__hfView; S.map.setView(v.c, v.z, { animate: false }); S.stormDraw(); });

  // looking ahead leaves the live simulation exactly as it was: the same 40 days with and without a preview every 5 days
  const inter = await ev(() => {
    const S = window.SSTSIM;
    const run = (look) => {
      S.setPlaying(false); S.applySeed(21); S.setPlaying(false); S.storms(true); S.stormAuto(true);
      for (let d = 0; d < 40; d += 5) { S.tick(24 * 5); if (look) { S.shadowBuild(); S.place(true, 'td'); S.placeAt(15 + (d % 7), -40 - (d % 13)); S.place(false); } }
      S.advance(0);
      const nodes = S.steerNodes('deep'), sum = (a) => a.reduce((x, y) => x + y, 0), pts = [[15, -50], [25, -80], [32, -40]].map(([la, lo]) => { const v = S.sample(la, lo); return [v.sst, v.humid, v.shear]; });
      return JSON.stringify({ pts, steer: [sum(nodes.u), sum(nodes.v), sum(nodes.p)], jet: [-80, -60, -40].map((lo) => S.jetLatLive(lo)), enso: S.enso().n34, storms: S.stormJSON() });
    };
    const A = run(true), B = run(false);
    return { same: A === B, len: A.length };
  });
  check(`[${label}] eight previews during 40 days of weather change nothing: SST, humidity, shear, steering, jet, ENSO and every storm come out identical (${(inter.len / 1024).toFixed(0)} KB compared)`, inter.same);

  // smoothness: placements within half a degree of each other have 72-hour points that are a bounded multiple apart
  const sm = await ev(() => {
    const S = window.SSTSIM; S.applySeed(11); S.setPlaying(false); S.stormAuto(false); S.tick(24 * 70); S.shadowBuild();
    let rs = 12345; const rnd = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };
    const km = (a, b) => Math.hypot((a[0] - b[0]) * 111.2, (a[1] - b[1]) * 111.2 * Math.cos((a[0] + b[0]) / 2 * Math.PI / 180)), ratios = [];
    for (const kind of ['td', 'wave', 'sd']) {
      S.place(true, kind);
      for (const [la, lo] of [[14, -40], [18, -60], [25, -75], [30, -55]]) {
        const pts = [];
        for (let k = 0; k < 7; k++) { const lat = la + rnd() - 0.5, lon = lo + rnd() - 0.5, F = S.placeAt(lat, lon), f = F.fixes.find((x) => x.h - F.fixes[0].h >= 72); if (f) pts.push([lat, lon, f.lat, f.lon]); }
        for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { const d = km(pts[i], pts[j]); if (d > 5) ratios.push(km(pts[i].slice(2), pts[j].slice(2)) / d); }
      }
      S.place(false);
    }
    ratios.sort((a, b) => a - b);
    return { n: ratios.length, median: ratios[Math.floor(ratios.length / 2)], p95: ratios[Math.floor(ratios.length * 0.95)], max: ratios[ratios.length - 1], share8: ratios.filter((r) => r <= 8).length / ratios.length };
  });
  check(`[${label}] the preview moves smoothly with the pointer: over ${sm.n} pairs of placements within half a degree, the 72-hour points are ${sm.median.toFixed(1)}x (median) and ${sm.p95.toFixed(1)}x (95th percentile) as far apart as the placements, ${(100 * sm.share8).toFixed(0)} % within 8x, none beyond ${sm.max.toFixed(1)}x`, sm.n > 150 && sm.share8 >= 0.95 && sm.max < 20);
  await ev(() => { window.SSTSIM.storms(false); window.SSTSIM.restart(); });
  await checkStormEnso(page, label);
}

// The season summary: the Summary button in the season bar opens a card with the totals against the real normals, the accumulated cyclone
// energy through the year (the real 1991-2020 seasons as bands behind it) and one row per storm; at the turn of the year the finished
// season's paths are gone, the bar starts the new year, and the card opens by itself on the season that has just ended.
async function checkSummary(page, label) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const a = await ev(() => {
    const S = window.SSTSIM; S.storms(true); S.setPlaying(false); S.applySeed(11); S.setPlaying(false); S.stormAuto(false); S.tick(24 * 70);
    S.stormPlace({ kind: 'td', lat: 16, lon: -48, v: 60 }); S.stormPlace({ kind: 'td', lat: 12, lon: -35, v: 40 });                // a major hurricane and a hurricane
    S.stormPlace({ kind: 'td', lat: 44, lon: -42, v: 25 }); S.stormPlace({ kind: 'td', lat: 30, lon: -50, v: 36 });                // a depression that never becomes a storm, a storm that never becomes a hurricane: every total of the card is a different number
    S.tick(24 * 9); S.advance(0);
    document.getElementById('detail').checked = false;
    const btn = document.getElementById('se-sum');
    return { exists: !!btn && document.getElementById('season').contains(btn), expanded: btn && btn.getAttribute('aria-expanded'), hidden: document.getElementById('sum-card').hidden };
  });
  check(`[${label}] the season bar has a Summary button (not pressed) and the summary card stays closed until it is pressed`, a.exists && a.expanded === 'false' && a.hidden);

  await page.click('#se-sum'); await page.waitForTimeout(250);
  const b = await ev(() => {
    const S = window.SSTSIM, num = (id) => document.getElementById(id).textContent, st = S.stormState();
    const cy = st.systems.filter((x) => x.depNum > 0).sort((p, q) => p.depNum - q.depNum);
    const rows = [...document.querySelectorAll('#sum-table tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent.trim()));
    const cv = document.getElementById('sum-graph'), g = cv.getContext('2d'), geo = S.summary().geo, d = cv.width / cv.clientWidth;
    const px = (x, y) => Array.from(g.getImageData(Math.round(x * d), Math.round(y * d), 1, 1).data);
    const X = (day) => geo.L + geo.pw * day / (geo.nd - 1), Y = (v) => geo.T + geo.ph * (1 - v / geo.top);
    return { hidden: document.getElementById('sum-card').hidden, expanded: document.getElementById('se-sum').getAttribute('aria-expanded'), title: num('sum-title'), sub: num('sum-sub'), cap: num('sum-cap'),
      cells: [...document.querySelectorAll('#sum-tot div')].map((x) => x.querySelector('b').textContent), avgs: [...document.querySelectorAll('#sum-tot small')].map((x) => x.textContent),
      bar: ['se-dep', 'se-named', 'se-hurr', 'se-major', 'se-c5', 'se-ace'].map(num), stats: st.stats, year: num('se-year'), rows, cy: cy.map((x) => ({ name: x.name, depNum: x.depNum, ace: x.ace })), geo,
      end: px(geo.endX, geo.endY), after: px(Math.min(geo.endX + 40, geo.w - 12), geo.endY - 6), inner: px(X(250), Y(35)), outer: px(X(250), Y(85)), above: px(X(250), Y(175)), jan: px(X(20), Y(120)) };
  });
  check(`[${label}] the Summary button opens the card: "${b.title}", ${b.sub}`, !b.hidden && b.expanded === 'true' && b.title === b.year && /^Season so far, to [A-Z][a-z]{2} \d+ · counted from Jun 1$/.test(b.sub));
  check(`[${label}] its totals are the season bar's (${b.cells.join(' / ')}), each with the real 1991-2020 average beneath (${b.avgs.join(' / ')})`,
    b.cells.join() === b.bar.join() && b.cells.join() === [b.stats.dep, b.stats.named, b.stats.hurr, b.stats.major, b.stats.cat5, b.stats.ace.toFixed(1)].join() && b.avgs.join() === 'avg 16.3,avg 14.4,avg 7.2,avg 3.2,avg 0.5,avg 122.5');
  const rowAce = b.rows.reduce((t, r) => t + parseFloat(r[4]), 0);
  check(`[${label}] the table has one row per cyclone of the season, in order of formation (${b.rows.map((r) => r[0]).join(', ')}), each with the ACE the storm itself holds (rows add up to ${rowAce.toFixed(1)} of ${b.stats.ace})`,
    b.rows.length === b.cy.length && b.rows.length >= 1 && b.rows.every((r, i) => (b.cy[i].name ? r[0] === b.cy[i].name : /^TD \d+$/.test(r[0])) && Math.abs(parseFloat(r[4]) - b.cy[i].ace) <= 0.0501) && Math.abs(rowAce - b.stats.ace) <= 0.06 * b.rows.length);
  check(`[${label}] the ACE graph: the season's line ends in a white dot at ${b.geo.value.toFixed(1)} (pixel ${b.end}), nothing is drawn after today (${b.after}), on Sep 7 the real middle-50 % band (24-67 ACE, probed at 35) is a darker shade than the 10th-90th percentile band around it (15-101, probed at 85), which is lighter than the empty plot above it (${b.inner} / ${b.outer} / ${b.above}), and nothing precedes the season in January (${b.jan})`,
    b.end[3] > 200 && b.end[0] > 200 && b.end[1] > 200 && b.end[2] > 200 && !(b.after[3] > 200 && b.after[0] > 200 && b.after[1] > 200) && b.inner[3] > b.outer[3] + 15 && b.outer[3] > 10 && b.above[3] === 0 && b.jan[3] === 0);
  check(`[${label}] the graph's caption says what the bands are and where the season stands against the median: ${b.cap}`, /1991–2020/.test(b.cap) && /median/.test(b.cap) && /By [A-Z][a-z]{2} \d+ the median season had \d+ ACE/.test(b.cap));

  // opening a storm from its row; Escape, the cross and the button close the card
  await page.click('#sum-table tbody tr:first-child'); await page.waitForTimeout(250);
  const c = await ev(() => ({ card: document.getElementById('storm-card').hidden, name: document.getElementById('sc-name').textContent, row: document.querySelector('#sum-table tbody tr td b').textContent, still: !document.getElementById('sum-card').hidden }));
  check(`[${label}] clicking a row opens that storm's stat card (${c.name}) and leaves the summary open`, !c.card && c.name === c.row && c.still);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  const d1 = await ev(() => ({ sum: !document.getElementById('sum-card').hidden, card: !document.getElementById('storm-card').hidden }));
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  const d2 = await ev(() => ({ sum: !document.getElementById('sum-card').hidden, expanded: document.getElementById('se-sum').getAttribute('aria-expanded') }));
  await page.click('#se-sum'); await page.waitForTimeout(100);
  const d3 = await ev(() => !document.getElementById('sum-card').hidden);
  await page.click('#sum-close'); await page.waitForTimeout(100);
  const d4 = await ev(() => document.getElementById('sum-card').hidden);
  check(`[${label}] Escape closes the stat card first and then the summary, the Summary button toggles it and the cross closes it`, d1.sum && !d1.card && !d2.sum && d2.expanded === 'false' && d3 && d4);

  // layout: the card stays on screen and clear of the dock at desktop, tablet and phone widths (and below the season bar at desktop, so its button stays reachable)
  await page.click('#se-sum'); await page.waitForTimeout(100);
  const lay = [];
  for (const [w, h] of [[1280, 800], [900, 700], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(250);
    lay.push(await ev(({ w, h }) => {
      const rect = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
      const hit = (p, q) => p.l < q.r - 0.5 && q.l < p.r - 0.5 && p.t < q.b - 0.5 && q.t < p.b - 0.5;
      const c = rect('sum-card'), dock = rect('dock'), bar = rect('season'), table = document.getElementById('sum-scroll');
      return { w, h, c, inside: c.l >= 0 && c.r <= w && c.t >= 0 && c.b <= h, dock: hit(c, dock), bar: hit(c, bar), scrolls: table.scrollWidth <= table.clientWidth + 1 };
    }, { w, h }));
  }
  await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(200);
  check(`[${label}] the summary card fits on screen and clears the dock at 1280, 900 and 390 px wide (${lay.map((x) => x.w + ': ' + Math.round(x.c.l) + '-' + Math.round(x.c.r) + ' x ' + Math.round(x.c.t) + '-' + Math.round(x.c.b) + (x.dock ? ' over dock' : '')).join('; ')}), clears the season bar at 1280 and its table needs no sideways scroll at 390 (${lay[2].scrolls})`,
    lay.every((x) => x.inside && !x.dock) && !lay[0].bar && lay[2].scrolls);
  await page.click('#sum-close');

  // the turn of the year: a late-season storm, Jan 1 passes; its paths disappear, the bar starts the next year, the card opens on the season just ended
  const r = await ev(() => {
    const S = window.SSTSIM; S.applySeed(12); S.setPlaying(false); S.stormAuto(false); S.tick(24 * 200);
    const layers = (on) => { for (const id of ['stwaves', 'stlows', 'stdist']) { const c = document.getElementById(id); c.checked = on; c.dispatchEvent(new Event('change')); } };
    layers(false);                                                              // waves, disturbances and lows are drawn by default and are not season paths: count the cyclones' own ink
    const year = S.stormState().stats.year;
    S.stormPlace({ kind: 'td', lat: 24, lon: -70, v: 65 }); S.tick(24 * 8); S.advance(0);       // a late-December hurricane in the western subtropics: it earns some ACE and is gone well before Jan 1
    { const live = S.stormState().systems.find((x) => x.alive); if (live) S.stormForce(live.id, { alive: false, endReason: 'dissipated', end: S.stormState().hour }); }       // (a post-tropical cyclone lives until it fills or is absorbed, which can take two weeks: this one is ended by hand, the test is about the turn of the year)
    const before = S.stormState(), cv = document.getElementById('storm-canvas'), g = cv.getContext('2d');
    const painted = () => { const a = g.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < a.length; i += 16) if (a[i] > 0) n++; return n; };
    const paintedBefore = painted(), barBefore = document.getElementById('season').innerText.replace(/\s+/g, ' ');
    S.tick(24 * 8); S.advance(0);                                               // Dec 28 -> Jan 5
    const after = S.stormState(), rec = S.stormRecord(year), now = S.stormRecord();
    return { year, before: before.stats, systemsBefore: before.systems.length, paintedBefore, barBefore, after: after.stats, systemsAfter: after.systems.length, alive: after.systems.filter((x) => x.alive).length, paintedAfter: painted(),
      bar: document.getElementById('season').innerText.replace(/\s+/g, ' '),
      open: !document.getElementById('sum-card').hidden, title: document.getElementById('sum-title').textContent, sub: document.getElementById('sum-sub').textContent,
      cells: [...document.querySelectorAll('#sum-tot div')].map((x) => x.querySelector('b').textContent), rows: document.querySelectorAll('#sum-table tbody tr').length,
      rec: { dep: rec.dep, named: rec.named, ace: rec.ace, open: rec.open, n: rec.storms.length, daily: rec.aceDaily.reduce((t, x) => t + x, 0), early: rec.aceDaily.slice(0, 340).every((x) => x === 0) }, now: { year: now.year, dep: now.dep, ace: now.ace }, geo: S.summary().geo };
  });
  check(`[${label}] at Jan 1 the finished season's paths are gone (${r.systemsBefore} systems and ${r.paintedBefore} painted samples before, ${r.systemsAfter} and ${r.paintedAfter} after) and the bar starts ${r.year + 1} from zero ("${r.bar}")`,
    r.before.year === r.year && r.after.year === r.year + 1 && r.systemsBefore >= 1 && r.paintedBefore > 0 && r.alive === 0 && r.systemsAfter === 0 && r.paintedAfter === 0 && new RegExp('^Atlantic ' + (r.year + 1) + ' 0 ?DEP 0 ?NAMED 0 ?HURR 0 ?MAJOR 0 ?CAT 5 0\\.0 ?ACE ?Summary$').test(r.bar) && r.now.dep === 0 && r.now.ace === 0);
  check(`[${label}] the summary opens by itself on the season that has just ended: "${r.title}", ${r.sub}, totals ${r.cells.join(' / ')}, ${r.rows} storm row(s)`,
    r.open && r.title === 'Atlantic ' + r.year && r.sub === 'Season complete · counted from Jun 1' && r.cells[0] === String(r.rec.dep) && r.cells[5] === r.rec.ace.toFixed(1) && r.rows === r.rec.n && r.rec.n >= 1 && r.rec.dep >= r.before.dep);
  check(`[${label}] the archived season keeps its counters and its ACE curve (dep ${r.rec.dep}, named ${r.rec.named}, ACE ${r.rec.ace}; the daily values add up to ${r.rec.daily.toFixed(1)} and stay zero before December), closed (${!r.rec.open})`,
    !r.rec.open && r.rec.dep >= 1 && r.rec.named >= 1 && r.rec.ace > 0.3 && Math.abs(r.rec.daily - r.rec.ace) < 0.2 && r.rec.early && Math.abs(r.geo.value - r.rec.ace) < 0.2 && r.geo.last === r.geo.nd - 1 && r.rec.ace >= r.before.ace);
  await page.click('#sum-next'); await page.waitForTimeout(150);
  const n1 = await ev(() => ({ title: document.getElementById('sum-title').textContent, sub: document.getElementById('sum-sub').textContent, cells: [...document.querySelectorAll('#sum-tot div')].map((x) => x.querySelector('b').textContent).join(), empty: !document.getElementById('sum-empty').hidden, next: document.getElementById('sum-next').disabled, prev: document.getElementById('sum-prev').disabled }));
  await page.click('#sum-prev'); await page.waitForTimeout(150);
  const n2 = await ev(() => ({ title: document.getElementById('sum-title').textContent, prev: document.getElementById('sum-prev').disabled, next: document.getElementById('sum-next').disabled }));
  check(`[${label}] the arrows step between seasons: ${n1.title} (${n1.sub}, nothing yet: ${n1.cells}) and back to ${n2.title}, each arrow disabled at its end`,
    n1.title === 'Atlantic ' + (r.year + 1) && /^Season so far, to Jan \d+$/.test(n1.sub) && n1.cells === '0,0,0,0,0,0.0' && n1.empty && n1.next && !n1.prev && n2.title === 'Atlantic ' + r.year && n2.prev && !n2.next);
  await page.click('#sum-close');
  await ev(() => { for (const id of ['stwaves', 'stlows', 'stdist']) { const c = document.getElementById(id); c.checked = true; c.dispatchEvent(new Event('change')); } window.SSTSIM.storms(false); window.SSTSIM.restart(); });
  const lgOff = await ev(() => getComputedStyle(document.getElementById('ol-legend')).display);
  check(`[${label}] with the storms switched off the outlook's legend goes too (${lgOff})`, lgOff === 'none');
}

// The storm layer on a basin page other than the Atlantic (whose long version is above): the same system with the basin's season, names, tag and word for hurricane strength. A basin's entry
// (STORM_SPECS) gives the spot of its three placed systems (a strong depression, a subtropical one, a low), the day of its season they go in on, the month and day its template starts on, and three seeds whose whole seasons are typical of the basin (from the lab's held-out run: tools/storm_basin.mjs, the mean of dep / named / hurricanes / ACE closest).
const STORM_SPECS = {
  eastpacific: { td: [13, -108], sd: [25, -125], low: [32, -135], day: 213, start: [4, 15], seeds: [1295, 1248, 1274] },
  westpacific: { td: [15, 135], sd: [28, 150], low: [38, 160], day: 212, start: [5, 1], seeds: [926, 902, 909] },
  nio: { td: [14, 70], sd: [22, 66], low: [18, 72], day: 200, start: [3, 1], seeds: [913, 954, 943] },
  aus: { td: [-14, 125], sd: [-26, 112], low: [-34, 108], day: 215, start: [10, 1], seeds: [932, 975, 915] },
  swio: { td: [-14, 70], sd: [-27, 62], low: [-34, 70], day: 215, start: [10, 1], seeds: [927, 976, 982] },
  spac: { td: [-14, 185], sd: [-27, 195], low: [-34, 200], day: 215, start: [10, 1], seeds: [927, 931, 993] },
  satl: { td: [-24, -40], sd: [-28, -45], low: [-34, -40], day: 215, start: [10, 1], seeds: [903, 918, 913] },
  med: { td: [37, 12], sd: [38, 10], low: [41, 6], day: 92, start: [8, 1], seeds: [903, 947, 901] },
};
// the basin's own palette and letters: the head of a 105-kt storm is the colour of its class in the region's scheme, the card has the class in its letters on that colour, and the cone's points are lettered the region's way
async function checkLook(page, label, prefix) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await import('../src/storms.js');
  const H = globalThis.HFStorms, SC = H.scaleOf(prefix), sp = prefix === 'atlantic' ? { td: [15, -45], day: 200 } : STORM_SPECS[prefix];
  const LOOK105 = { atlantic: ['#ff4d3d', 'C3'], eastpacific: ['#ff4d3d', 'C3'], westpacific: ['#ff5900', 'ST'], nio: ['#ff738a', 'ESCS'], aus: ['#ff738a', 'C4'], swio: ['#ff738a', 'ITC'], spac: ['#ff738a', 'C4'], satl: ['#ff4d3d', 'C3'], med: ['#ff4d3d', 'C3'] }[prefix];
  const r = await ev((q) => { const S = window.SSTSIM; S.setPlaying(false); S.applySeed(4242); S.setPlaying(false); S.storms(true); S.stormAuto(false); S.tick(24 * q.day);
    const id = S.stormPlace({ kind: 'td', lat: q.td[0], lon: q.td[1], v: 60 }); S.tick(12); S.advance(0); const st = S.stormState().systems.find((x) => x.id === id);
    S.map.setView([st.lat, st.lon], 4, { animate: false }); S.stormForce(id, { th: 'tc', v: 105, vr: 105, p: 946 }); S.stormDraw(); return { id, px: S.stormPx(id) }; }, sp);
  await page.mouse.click(r.px.x, r.px.y); await page.waitForTimeout(300);
  const lk = await ev(({ x, y }) => { const c = document.getElementById('storm-canvas'), d = c.width / c.clientWidth, a = c.getContext('2d').getImageData(Math.round(x * d), Math.round(y * d), 1, 1).data, hex = '#' + [a[0], a[1], a[2]].map((v) => v.toString(16).padStart(2, '0')).join(''), t = document.getElementById('sc-tag'), rgb = getComputedStyle(t).backgroundColor.match(/\d+/g).map(Number), thex = '#' + rgb.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
    return { head: hex, a: a[3], tag: t.textContent, tagBg: thex, shown: t.offsetParent !== null }; }, r.px);
  await lyrSet(page, 'stcone', true); await page.waitForFunction(() => window.SSTSIM.coneState() !== null, null, { timeout: 15000 }); await page.waitForTimeout(200);
  const lc = await ev(() => { const cs = window.SSTSIM.coneState(); return cs ? cs.pts.map((q) => [q.v, q.letter, q.post]) : null; });
  await lyrSet(page, 'stcone', false); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check(`[${label}] the 105-kt storm is drawn in this region's colour (${lk.head}, expected ${LOOK105[0]}), its card shows the class ${lk.tag} on ${lk.tagBg} (expected ${LOOK105[1]} on ${LOOK105[0]}) and the cone's letters are the region's (${lc ? lc.map((q) => q[1]).join(' ') : 'no cone'})`,
    lk.head === LOOK105[0] && lk.a === 255 && lk.shown && lk.tag === LOOK105[1] && lk.tagBg === LOOK105[0] && !!lc && lc.length >= 4 && lc.every((q) => q[1] === SC.tag[H.classOf(prefix, q[0], 'tc').idx]));
}
// the radar floater: a 2-km model of one system drawn as radar over the map, opened from the system's card; its own clock (real time to 20 minutes a second) running inside the hour and moving the engine on at the hour,
// the storm layers on top of it, a radar site with its beam, crisp colours in the National Weather Service's steps, and everything back as it was when it is closed
async function checkFloater(page, label, prefix) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const sp = prefix === 'atlantic' ? { td: [15, -45], day: 200 } : STORM_SPECS[prefix];
  const PAL = ['04e9e7', '019ff4', '0300f4', '02fd02', '01c501', '008e00', 'fdf802', 'e5bc00', 'fd9500', 'fd0000', 'd40000', 'bc0000', 'f800fd', '9854c6', 'ffffff'];
  const r = await ev((q) => { const S = window.SSTSIM; S.setPlaying(false); S.applySeed(4242); S.setPlaying(false); S.storms(true); S.stormAuto(false); S.summary(false); S.tick(24 * q.day);
    const id = S.stormPlace({ kind: 'td', lat: q.td[0], lon: q.td[1], v: 60 }); S.tick(12); S.advance(0);
    S.map.setView([q.td[0], q.td[1]], 6, { animate: false }); S.stormForce(id, { th: 'tc', v: 105, vr: 105, p: 946 }); S.tick(2); S.advance(0);
    const st = S.stormState().systems.find((x) => x.id === id); S.map.setView([st.lat, st.lon], 6, { animate: false }); S.stormDraw();
    return { id, px: S.stormPx(id), hour: S.state().simHour, playing: S.playingNow() }; }, sp);
  await page.mouse.click(r.px.x, r.px.y); await page.waitForTimeout(300);
  const card = await ev(() => ({ btn: getComputedStyle(document.getElementById('sc-radar')).display !== 'none', cardShown: !document.getElementById('storm-card').hidden }));
  check(`[${label}] the card of a hurricane has a Radar floater button (a disturbance or more can open one)`, card.cardShown && card.btn);
  await page.click('#sc-radar'); await page.waitForTimeout(300);
  const o = await ev(() => { const S = window.SSTSIM, f = S.floaterState(); return { on: f.on, spin: f.spin, bar: !document.getElementById('fl-bar').hidden, body: document.body.classList.contains('fl-on'), card: document.getElementById('storm-card').hidden, legend: getComputedStyle(document.getElementById('fl-legend')).display !== 'none', canvas: !!document.getElementById('radar-canvas') && document.getElementById('radar-canvas').style.display !== 'none', speed: document.getElementById('speed-x').textContent, sub: document.getElementById('speed-sub').textContent, name: document.getElementById('fl-name').textContent }; });
  check(`[${label}] the button opens the floater: its bar (${o.name}), the reflectivity key and the radar canvas appear, the storm card gives way to it, the playback label reads ${o.speed} (${o.sub})`, o.on && o.bar && o.body && o.card && o.legend && o.canvas && /10/.test(o.speed) && /real time/.test(o.sub));
  await page.waitForFunction(() => window.SSTSIM.floaterState().spin >= 1, null, { timeout: 30000 }); await page.waitForTimeout(400);
  const a = await ev(() => { const S = window.SSTSIM, f = S.floaterState(); return { f }; });
  check(`[${label}] two hours of the system's life are spun up while the bar shows it, and the nest is running (${a.f.steps} steps, mean wind ${Math.round(a.f.vNest * 1.944)} kt of ${Math.round(a.f.vTarget * 1.944)} kt, eyewall ${Math.round(a.f.dbzMax)} dBZ, ${a.f.cells} cells of 20 dBZ or more)`, a.f.spin >= 1 && a.f.steps >= 30 && a.f.dbzMax >= 45 && a.f.cells > 300 && a.f.vNest > 0.6 * a.f.vTarget);
  const px = await ev(() => { const c = document.getElementById('radar-canvas'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let op = 0, ex = 0; const pal = new Set(['04e9e7', '019ff4', '0300f4', '02fd02', '01c501', '008e00', 'fdf802', 'e5bc00', 'fd9500', 'fd0000', 'd40000', 'bc0000', 'f800fd', '9854c6', 'ffffff']);
    const rgb = [...pal].map((h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 200) { op++; if (rgb.some((c) => Math.abs(c[0] - d[i]) + Math.abs(c[1] - d[i + 1]) + Math.abs(c[2] - d[i + 2]) <= 12)) ex++; } } return { op, ex }; });       // (a colour read back from a translucent canvas is a few steps off)
  check(`[${label}] the radar is drawn in the National Weather Service's steps and is crisp: ${px.op} opaque pixels, ${(100 * px.ex / Math.max(1, px.op)).toFixed(0)} % of them exactly a colour of the scale (a gradient or a blur would leave under half)`, px.op > 5000 && px.ex > 0.6 * px.op);
  // the playback buttons are the floater's now: faster / slower / pause change its speed, not the main clock's
  const sp0 = await ev(() => window.SSTSIM.floaterState().speed);
  await page.click('#b-faster'); await page.click('#b-faster'); await page.waitForTimeout(100);
  const sp1 = await ev(() => ({ s: window.SSTSIM.floaterState().speed, x: document.getElementById('speed-x').textContent, sub: document.getElementById('speed-sub').textContent, main: window.SSTSIM.playingNow() }));
  await page.keyboard.press('['); await page.waitForTimeout(50);
  const sp2 = await ev(() => window.SSTSIM.floaterState().speed);
  await page.click('#b-play'); await page.waitForTimeout(100);
  const pz = await ev(() => ({ play: window.SSTSIM.floaterState().play, ic: document.getElementById('ic-play').style.display !== 'none' }));
  await page.keyboard.press(' '); await page.waitForTimeout(100);
  const pz2 = await ev(() => window.SSTSIM.floaterState().play);
  check(`[${label}] the playback buttons and keys steer the floater (speed ${sp0} to ${sp1.s} with two clicks on faster, ${sp2} after [, label ${sp1.x} ${sp1.sub}), pause and Space toggle it (${pz.play} then ${pz2}), and the main clock stays stopped`, sp1.s === sp0 + 2 && sp2 === sp1.s - 1 && pz.play === false && pz.ic && pz2 === true && sp1.main === false);
  // the clock runs by itself at 20 minutes a second: inside the hour, then the engine moves on
  await ev(() => { window.SSTSIM.floaterSet({ speed: 11, play: true }); }); const h0 = await ev(() => window.SSTSIM.floaterState());
  const tw0 = Date.now(); await page.waitForFunction((h) => window.SSTSIM.floaterState().hour > h, h0.hour, { timeout: 15000 }).catch(() => {});      // (a slow machine takes longer than four seconds for the hour)
  const h1 = await ev(() => { const f = window.SSTSIM.floaterState(); return { f, clock: document.getElementById('c-time').textContent }; });
  check(`[${label}] at 20 minutes a second the floater's clock runs (${h0.steps} to ${h1.f.steps} steps in ${((Date.now() - tw0) / 1000).toFixed(1)} seconds) and when it passes the hour the engine really moves on (hour ${h0.hour} to ${h1.f.hour}, the main clock reads ${h1.clock.replace(/\D*$/, '')})`, h1.f.steps >= h0.steps + 12 && h1.f.hour >= h0.hour + 1 && h1.f.on);
  // the storm layers sit on top of the radar: the system alone with its path and place, and the cone and wind field on request
  await ev(() => { const S = window.SSTSIM; S.floaterSet({ play: false }); S.floaterRun(1500); });
  await lyrSet(page, 'stwf', true); await lyrSet(page, 'stcone', true); await page.waitForTimeout(300);
  const lay = await ev((id) => { const S = window.SSTSIM, f = S.floaterState(), e = S.stormState().systems.find((x) => x.id === id), p = S.floaterPos(); return { drawn: S.stormDrawn().includes(id), cone: S.coneState() !== null, z: [document.getElementById('radar-canvas'), document.getElementById('storm-canvas')].map((c) => +c.style.zIndex), pos: p, min: f.minutes, d: p ? Math.hypot(p.lat - e.lat, p.lon - e.lon) : 0 }; }, r.id);
  await lyrSet(page, 'stwf', false); await lyrSet(page, 'stcone', false);
  check(`[${label}] the storm layers stay on top of the radar (storm canvas ${lay.z[1]} over radar ${lay.z[0]}): the system alone with its path and its place (${lay.min} minutes into the hour it is ${(lay.d * 111).toFixed(1)} km from where the engine has it at the hour: the floater says where it is between two hours), the cone on request`, lay.drawn && lay.z[1] > lay.z[0] && !!lay.pos && lay.min >= 20 && lay.d > 0.003);
  // the picture's place is the place between the hour's two states, by the minutes into the hour: a quarter of the way after a quarter of an hour (not the hour's place, not past halfway at the half)
  const mid = await ev((id) => { const S = window.SSTSIM, f = S.floaterState(), e = S.stormState().systems.find((x) => x.id === id), p = S.floaterPos(); return { min: f.minutes, hour: f.hour, e: { lat: e.lat, lon: e.lon }, p }; }, r.id);
  await ev((m) => { window.SSTSIM.floaterSet({ play: false }); window.SSTSIM.floaterRun((60 - m) * 60 + 240); }, mid.min);
  const nxt = await ev((id) => { const S = window.SSTSIM, f = S.floaterState(), e = S.stormState().systems.find((x) => x.id === id); return { hour: f.hour, e: { lat: e.lat, lon: e.lon } }; }, r.id);
  const span = Math.hypot(nxt.e.lat - mid.e.lat, nxt.e.lon - mid.e.lon), got = Math.hypot(mid.p.lat - mid.e.lat, mid.p.lon - mid.e.lon), frac = got / Math.max(span, 1e-9);
  check(`[${label}] ${mid.min} minutes into the hour the picture is ${(100 * frac).toFixed(0)} % of the way from where the engine has the system at the hour to where it has it at the next (${(span * 111).toFixed(1)} km apart), ${(100 * mid.min / 60).toFixed(0)} % by the clock`, nxt.hour === mid.hour + 1 && span > 0.02 && Math.abs(frac - mid.min / 60) < 0.12);
  await ev(() => { window.SSTSIM.floaterSet({ play: true }); });
  // a radar site: a city's radar with the beam's height and range
  const siteO = await ev(() => ({ sites: window.SSTSIM.floaterState().sites })); let st = null;
  if (siteO.sites.length) {
    await ev(() => { window.SSTSIM.floaterSet({ play: false }); window.SSTSIM.floaterRun(1); });
    const before = await ev(() => window.SSTSIM.floaterState().cells);
    st = await ev(() => { const S = window.SSTSIM; S.floaterSet({ site: 0, tilt: 6 }); S.floaterRun(1); return { f: S.floaterState(), tilt: getComputedStyle(document.getElementById('fl-tilt-l')).display !== 'none', op: (() => { const c = document.getElementById('radar-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++; return n; })() }; });
    await ev(() => { window.SSTSIM.floaterSet({ site: 0, tilt: 0.5 }); window.SSTSIM.floaterRun(1); });
    const lowO = await ev(() => { const c = document.getElementById('radar-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++; return n; });
    check(`[${label}] a radar site (${st.f.site}) has its tilt chooser, and the beam matters: at 6° the beam is higher (${st.op} opaque pixels) and at 0.5° it sees at least as many (${lowO}; the strict comparison is in the radar-site check)`, st.f.site === siteO.sites[0] && st.tilt && lowO >= st.op);
    await ev(() => { window.SSTSIM.floaterSet({ site: null }); });
  } else check(`[${label}] (no city within reach of this storm: composite only)`, true);
  // closing puts everything back
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const c1 = await ev(() => { const S = window.SSTSIM; return { on: S.floaterState().on, bar: document.getElementById('fl-bar').hidden, body: document.body.classList.contains('fl-on'), canvas: document.getElementById('radar-canvas').style.display, x: document.getElementById('speed-x').textContent, play: S.playingNow(), card: !document.getElementById('storm-card').hidden, ic: document.getElementById('ic-play').style.display !== 'none' }; });
  check(`[${label}] Escape closes the floater and puts everything back: bar and radar gone, the playback label back to ${c1.x}, the main clock as it was (stopped), the storm card again`, c1.on === false && c1.bar && !c1.body && c1.canvas === 'none' && /×/.test(c1.x) && c1.play === false && c1.card && c1.ic);
  const sy = await ev((id) => { const S = window.SSTSIM; S.floaterOpen(id); const h = document.getElementById('storm-card').hidden && document.getElementById('aoi-card').hidden; S.floaterClose(); return h; }, r.id);
  check(`[${label}] the storm card is out of the radar's way the moment the floater opens, not only at the next refresh`, sy);
  // a disturbance and a plain wave: the first can have a floater, the second cannot
  const d = await ev((q) => { const S = window.SSTSIM, w = S.stormPlace({ kind: 'wave', lat: q.td[0] + (q.td[0] > 0 ? 1 : -1) * 3, lon: q.td[1] + 6, v: 20 }), w2 = S.stormPlace({ kind: 'wave', lat: q.td[0] + (q.td[0] > 0 ? 1 : -1) * 6, lon: q.td[1] - 8, v: 20 }); S.tick(3); S.stormForce(w, { dist: true }); S.stormForce(w2, { dist: false, invest: '', kind: 'M' });
    const no = S.floaterOpen(w2), yes = S.floaterOpen(w); const f = S.floaterState(); S.floaterRun(600); const g = S.floaterState(); const sub = document.getElementById('fl-sub').textContent; S.floaterClose(); return { no, yes, on: f.on, sub, rc: g.rcMax, dbz: g.dbzMax }; }, sp);
  check(`[${label}] a plain tropical wave has no floater, a disturbance has (${d.sub}): a broad weak vortex of convective clusters whose strongest cell is under 60 dBZ (${Math.round(d.dbz)} dBZ)`, d.no === false && d.yes === true && d.on && /Disturbance/.test(d.sub) && d.dbz < 60);
  // subtropical systems have a radar too (a button on the card, a picture over cool water), and a very large storm gets a larger scale (a larger box, coarser cells)
  const sb = await ev((q) => { const S = window.SSTSIM, id = S.stormPlace({ kind: 'td', lat: q.td[0] + (q.td[0] > 0 ? 1 : -1) * 3, lon: q.td[1] + 8, v: 45 }); S.tick(2); S.stormForce(id, { th: 'sc', sub: true, v: 45, vr: 45 }); S.tick(1);
    const e = S.stormState().systems.find((x) => x.id === id); S.map.setView([e.lat, e.lon], 6, { animate: false }); S.stormDraw(); const px = S.stormPx(id); S.stormClick(px.x, px.y);
    const btn = getComputedStyle(document.getElementById('sc-radar')).display !== 'none', ok = S.floaterOpen(id); S.floaterRun(1200); const f = S.floaterState(); const out = { th: e.th, btn, ok, cells: f.cells, dbz: f.dbzMax, sub: f.sub }; S.floaterClose(); S.stormForce(id, { alive: false });
    const w = S.stormPlace({ kind: 'wave', lat: q.td[0] + (q.td[0] > 0 ? 1 : -1) * 3, lon: q.td[1] + 6, v: 20 }); S.tick(2); S.stormForce(w, { dist: false, invest: '', kind: 'M', sub: true }); out.subWave = S.floaterOpen(w); S.floaterClose(); S.stormForce(w, { alive: false }); return out; }, sp);
  check(`[${label}] a subtropical storm has the Radar button and a radar picture (${sb.sub}: ${sb.cells} cells of 20 dBZ or more, strongest ${Math.round(sb.dbz)} dBZ), and so has a subtropical disturbance (${sb.subWave})`, sb.th === 'sc' && sb.btn && sb.ok && sb.cells > 400 && sb.dbz >= 35 && sb.subWave === true);
  const bg = await ev((q) => { const S = window.SSTSIM, la = q.td[0] + (q.td[0] > 0 ? 1 : -1) * 2, sgn = la < 0 ? -1 : 1;
    const span = () => { const b = S.map.getBounds(); return (b.getEast() - b.getWest()) * 111.2 * Math.cos((b.getNorth() + b.getSouth()) / 2 * Math.PI / 180); };
    const id0 = S.stormPlace({ kind: 'td', lat: la, lon: q.td[1] + 4, v: 60 }); S.tick(2); for (let k = 0; k < 4; k++) { S.stormForce(id0, { th: 'tc', v: 70, vr: 70, p: 980 }); S.tick(1); }
    S.floaterOpen(id0); S.floaterRun(300); const span0 = span(), sc0 = S.floaterState().scale; S.floaterClose(); S.stormForce(id0, { alive: false });
    const id = S.stormPlace({ kind: 'td', lat: la, lon: q.td[1] + 4, v: 60 }); S.tick(2); for (let k = 0; k < 6; k++) { S.stormForce(id, { th: 'tc', v: 75, vr: 75, p: 975, lr: Math.log(300) }); S.tick(1); }
    const ok = S.floaterOpen(id); S.floaterRun(900); const f = S.floaterState(), sp1 = span();
    const cv = document.getElementById('radar-canvas'), g = cv.getContext('2d'), dp = cv.width / cv.clientWidth, d = g.getImageData(0, 0, cv.width, cv.height).data; let x0 = 1e9, x1 = -1;
    for (let y = 0; y < cv.height; y += 3) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 150) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    const p = S.floaterPos(), c = S.placePx(p.lat, p.lon), qq = S.placePx(p.lat, p.lon + 128 * f.cellKm / (111.195 * Math.cos(p.lat * Math.PI / 180))), half = Math.abs(qq.x - c.x);
    const out = { ok, scale: f.scale, sc0, cell: f.cellKm, sub: f.sub, span0, span: sp1, fill: (x1 - x0) / dp / (2 * half), cells: f.cells, vN: f.vNest / 0.514444, vT: f.vTarget / 0.514444 }; S.floaterClose(); S.stormForce(id, { alive: false }); return out; }, sp);
  check(`[${label}] a very large storm (R34 about 550 km) gets a larger scale: ${bg.cell} km cells (a normal storm's are ${2 * bg.sc0}), the map frames ${Math.round(bg.span)} km against ${Math.round(bg.span0)} km for a normal storm (the label says so: ${/km cells/.test(bg.sub)}), the picture fills ${(100 * bg.fill).toFixed(0)} % of the frame, and the nest holds its wind (${Math.round(bg.vN)} kt of ${Math.round(bg.vT)} kt)`, bg.ok && bg.scale > 1.4 && bg.cell === 2 * bg.scale && /km cells/.test(bg.sub) && bg.span > 1.5 * bg.span0 && bg.fill > 0.4 && bg.cells > 1500 && Math.abs(bg.vN - bg.vT) < 0.35 * bg.vT);
}
// a radar site: a hurricane near San Juan seen from the city's radar: its range rings, the beam's height (a higher tilt passes over the lower echoes) and the range limit
const SITE_SPECS = { atlantic: { lat: 18.6, lon: -66.2, city: 'San Juan', day: 100 }, aus: { lat: -12.3, lon: 130.2, city: 'Darwin', day: 215 } };
async function checkFloaterSite(page, label, prefix = 'atlantic') {
  const ev = (fn, arg) => page.evaluate(fn, arg), sp = SITE_SPECS[prefix], sgn = sp.lat < 0 ? -1 : 1;
  const r = await ev((q) => { const S = window.SSTSIM; S.setPlaying(false); S.applySeed(4242); S.setPlaying(false); S.storms(true); S.stormAuto(false); S.summary(false); S.tick(24 * q.day);
    const id = S.stormPlace({ kind: 'td', lat: q.lat, lon: q.lon, v: 60 }); S.tick(2); for (let k = 0; k < 30; k++) { S.stormForce(id, { th: 'tc', lat: q.lat + 0.02 * k * (q.lat < 0 ? -1 : 1), lon: q.lon + 0.02 * k, v: 110, vr: 110, p: 945, cx: 4, cy: 2 * (q.lat < 0 ? -1 : 1) }); S.tick(1); }
    S.floaterOpen(id); S.floaterRun(1800); const f = S.floaterState(); return { id, sites: f.sites }; }, sp);
  const count = () => ev(() => { const c = document.getElementById('radar-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0, ring = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 200) n++; else if (d[i + 3] > 20 && d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) ring++; } return { n, ring }; });
  const comp = await count();
  await ev((c) => { const S = window.SSTSIM, i = S.floaterState().sites.indexOf(c); S.floaterSet({ site: i < 0 ? 0 : i, tilt: 0.5 }); S.floaterRun(1); }, sp.city);
  const low = await count(); const a = await ev(() => ({ f: window.SSTSIM.floaterState(), tilt: getComputedStyle(document.getElementById('fl-tilt-l')).display !== 'none' }));
  await ev(() => { window.SSTSIM.floaterSet({ tilt: 6 }); window.SSTSIM.floaterRun(1); });
  const high = await count();
  check(`[${label}] the city is a radar site (${a.f.site}, of ${r.sites.join(', ')}): it brings the tilt chooser, range rings and the 460 km limit are drawn (${low.ring} ring pixels), and the beam matters: the 6° tilt passes over the lower echoes (${high.n} opaque pixels against ${low.n} at 0.5° and ${comp.n} for the composite)`, a.f.site === sp.city && a.tilt && low.ring > 200 && high.n < 0.85 * low.n && low.n <= comp.n * 1.02);
  // the velocity product: winds toward the radar green, away from it red; for a cyclonic storm the side to the left of the line from the radar to the centre has the winds coming toward it
  await ev(() => { const S = window.SSTSIM; S.floaterSet({ tilt: 0.5, product: 'v' }); S.floaterRun(1); });
  const vv = await ev(() => { const S = window.SSTSIM, f = S.floaterState(), p = S.floaterPos(), c = S.placePx(p.lat, p.lon), siteC = S.cityList().find((q) => q.name === f.site), sp = S.placePx(siteC.lat, siteC.lon);
    const vx = c.x - sp.x, vy = c.y - sp.y, L = Math.hypot(vx, vy), d = 38, lx = vy / L, ly = -vx / L, cv = document.getElementById('radar-canvas'), g = cv.getContext('2d'), dp = cv.width / cv.clientWidth;
    const at = (x, y) => { const a = g.getImageData(Math.round(x * dp), Math.round(y * dp), 1, 1).data; return [a[0], a[1], a[2], a[3]]; };
    return { f, left: at(c.x + lx * d, c.y + ly * d), right: at(c.x - lx * d, c.y - ly * d), keyV: getComputedStyle(document.getElementById('fl-legend-v')).display !== 'none', keyZ: getComputedStyle(document.getElementById('fl-legend')).display !== 'none' }; });
  check(`[${label}] the velocity product (${vv.f.product}) shows the circulation's couplet: ${sgn > 0 ? 'cyclonic (counter-clockwise), so the left side of the line from the radar to the centre is green and the right side red' : 'clockwise, so the left side of the line from the radar to the centre is red and the right side green'} (left ${vv.left.slice(0, 3)}, right ${vv.right.slice(0, 3)}), with its own key and not the reflectivity key`,
    vv.f.product === 'v' && vv.left[3] > 150 && vv.right[3] > 150 && (sgn > 0 ? vv.left[1] > vv.left[0] && vv.right[0] > vv.right[1] : vv.left[0] > vv.left[1] && vv.right[1] > vv.right[0]) && vv.keyV && !vv.keyZ);
  await ev(() => { window.SSTSIM.floaterSet({ site: null }); });
  const back = await ev(() => ({ p: window.SSTSIM.floaterState().product, keyZ: getComputedStyle(document.getElementById('fl-legend')).display !== 'none', prod: getComputedStyle(document.getElementById('fl-prod-l')).display !== 'none' }));
  check(`[${label}] back to the composite the product is reflectivity again (${back.p}) with its key, and the product chooser goes away`, back.p === 'z' && back.keyZ && !back.prod);
  await ev(() => { window.SSTSIM.floaterClose(); });
}
// the satellite view of the floater (infrared, in the brown / grey / white / green-to-red scheme of the example images), the white outline of the land over either picture, and the two fastest clocks
// (30 and 45 minutes a second, the model stepping four minutes at a time there so that they cost no more than 20 minutes a second)
const COAST_SPECS = { atlantic: { at: [18.2, -70.5], day: 200 }, eastpacific: { at: [14.5, -97], day: 213 }, westpacific: { at: [16, 122.5], day: 212 }, nio: { at: [19, 72], day: 200 }, aus: { at: [-12, 130], day: 215 },
  swio: { at: [-18, 49], day: 215 }, spac: { at: [-17.8, 177.8], day: 215 }, satl: { at: [-26.5, -47.5], day: 215 }, med: { at: [37, 15], day: 92 } };
async function checkSatellite(page, label, prefix) {
  const ev = (fn, arg) => page.evaluate(fn, arg), sp = COAST_SPECS[prefix], sgn = sp.at[0] < 0 ? -1 : 1;
  const sid = await ev((q) => { const S = window.SSTSIM; S.setPlaying(false); S.applySeed(4242); S.setPlaying(false); S.storms(true); S.stormAuto(false); S.summary(false); S.tick(24 * q.day);
    const id = S.stormPlace({ kind: 'td', lat: q.at[0], lon: q.at[1], v: 60 }); S.tick(2); for (let k = 0; k < 10; k++) { S.stormForce(id, { th: 'tc', lat: q.at[0] + 0.02 * k * sgnOf(q.at[0]), lon: q.at[1] + 0.02 * k, v: 90, vr: 90, p: 965, cx: 4, cy: 2 * sgnOf(q.at[0]) }); S.tick(1); }
    function sgnOf(x) { return x < 0 ? -1 : 1; }
    S.floaterOpen(id); S.floaterRun(1200); return id; }, sp);
  const open = await ev(() => ({ f: window.SSTSIM.floaterState(), opts: [...document.getElementById('fl-view').options].map((o) => o.value + ':' + o.textContent) }));
  check(`[${label}] the floater has a View chooser (${open.opts.join(', ')}) and opens on radar (${open.f.view}), the infrared key hidden`, open.f.view === 'radar' && open.opts.length === 2 && open.opts[0].startsWith('radar') && /ir:Satellite/.test(open.opts[1]) && await ev(() => getComputedStyle(document.getElementById('fl-legend-ir')).display === 'none'));
  // the coast: the page's land mask scanned along rows and columns of the frame for steps from sea to land; the outline is drawn from the page's own (finer) polygons, so the two agree to a few kilometres
  const cs = await ev(() => { const S = window.SSTSIM, p = S.floaterPos(), c0 = Math.max(0.5, Math.cos(p.lat * Math.PI / 180)), DL = 1.7, DO = 2.1 / c0, pts = [], at = (lat, lon) => S.stormEnvSample(lat, lon).land;
    for (let a = -DL; a <= DL; a += 0.05) { let prev = null; for (let b = -DO; b <= DO; b += 0.03 / c0) { const l = at(p.lat + a, p.lon + b); if (prev !== null && l !== prev) { const q = S.placePx(p.lat + a, p.lon + b - 0.015 / c0); pts.push([q.x, q.y]); } prev = l; } }
    for (let b = -DO; b <= DO; b += 0.05 / c0) { let prev = null; for (let a = -DL; a <= DL; a += 0.03) { const l = at(p.lat + a, p.lon + b); if (prev !== null && l !== prev) { const q = S.placePx(p.lat + a - 0.015, p.lon + b); pts.push([q.x, q.y]); } prev = l; } }
    const q0 = S.placePx(p.lat - DL, p.lon - DO), q1 = S.placePx(p.lat + DL, p.lon + DO), k0 = S.placePx(p.lat, p.lon), k1 = S.placePx(p.lat, p.lon + 0.1 / c0);
    return { pts, box: [Math.min(q0.x, q1.x), Math.min(q0.y, q1.y), Math.max(q0.x, q1.x), Math.max(q0.y, q1.y)], pxKm: Math.abs(k1.x - k0.x) / (0.1 * 111.195) }; });
  const R = Math.max(7, Math.round(12 * cs.pxKm));
  const read = (mode) => ev(([cs, R, mode]) => { const cv = document.getElementById('radar-canvas'), g = cv.getContext('2d'), dp = cv.width / cv.clientWidth, [bx0, by0, bx1, by1] = cs.box, d = g.getImageData(0, 0, cv.width, cv.height).data;
    const px = (x, y) => { const i = (Math.round(y * dp) * cv.width + Math.round(x * dp)) * 4; return d.subarray(i, i + 4); }, white = (a) => a[3] > 200 && a[0] > 235 && a[1] > 235 && a[2] > 235;
    const pts = cs.pts.filter(([x, y]) => x > Math.max(bx0, R) && x < Math.min(bx1, cv.clientWidth - R) && y > Math.max(by0, R) && y < Math.min(by1, cv.clientHeight - R));
    let hit = 0; for (const [x, y] of pts) { let w = 0; for (let yy = -R; yy <= R; yy += 1) for (let xx = -R; xx <= R; xx += 1) if (white(px(x + xx, y + yy))) w++; if (w >= 4) hit++; }
    let wn = 0, near = 0; if (mode === 'z') for (let y = Math.max(0, Math.ceil(by0)); y < Math.min(cv.clientHeight, by1); y += 2) for (let x = Math.max(0, Math.ceil(bx0)); x < Math.min(cv.clientWidth, bx1); x += 2) { if (!white(px(x, y))) continue; wn++; if (pts.some(([a, b]) => Math.abs(a - x) <= R && Math.abs(b - y) <= R)) near++; }
    return { used: pts.length, hit, wn, near }; }, [cs, R, mode]);
  const rz = await read('z');
  check(`[${label}] the land has a white bold outline over the radar, where the coast is: of ${rz.used} points on the page's coast in the frame ${rz.hit} have white outline pixels within ${R} pixels (12 km), and of the ${rz.wn} white pixels sampled ${rz.near} lie within that distance of the coast (over half: the outline also has the islands and lakes the land mask is too coarse for)`, rz.used >= 40 && rz.hit >= 0.85 * rz.used && rz.wn >= 300 && rz.near >= 0.55 * rz.wn);
  // the satellite picture
  await ev(() => { window.SSTSIM.floaterSet({ view: 'ir' }); window.SSTSIM.floaterRun(1); });
  const ui = await ev(() => { const S = window.SSTSIM, vis = (id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; }; return { f: S.floaterState(), ir: vis('fl-legend-ir'), z: vis('fl-legend'), v: vis('fl-legend-v'), prod: vis('fl-prod-l'), site: vis('fl-site-l'), tilt: vis('fl-tilt-l'), sub: document.getElementById('fl-sub').textContent, cap: document.getElementById('fl-legend-ir').textContent.replace(/\s+/g, ' ').trim() }; });
  check(`[${label}] choosing Satellite (infrared) shows its key (${ui.cap}) and takes the radar's own choosers (product, site, tilt) and keys away; the bar says "${ui.sub}"`, ui.f.view === 'ir' && ui.ir && !ui.z && !ui.v && !ui.prod && !ui.site && !ui.tilt && /infrared/.test(ui.sub) && /Infrared/.test(ui.cap) && /-80/.test(ui.cap));
  const px = await ev((bx) => { const cv = document.getElementById('radar-canvas'), g = cv.getContext('2d'), dp = cv.width / cv.clientWidth, d = g.getImageData(0, 0, cv.width, cv.height).data, x0 = Math.ceil(bx[0] * dp), x1 = Math.floor(bx[2] * dp), y0 = Math.ceil(bx[1] * dp), y1 = Math.floor(bx[3] * dp);
    let op = 0, brown = 0, white = 0, grey = 0, hot = 0, green = 0;      // (the box is well inside the nest's frame, 378 by 466 km of its 512)
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * cv.width + x) * 4; if (d[i + 3] < 200) continue; op++; const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (r > 235 && gg > 235 && b > 235) white++; else if (r > gg - 3 && gg > b - 3 && r - b > 18 && r < 125) brown++; else if (Math.abs(r - gg) < 12 && Math.abs(gg - b) < 12 && r > 60) grey++; else if (r > 190 && gg < 140 && b < 70) hot++; else if (gg > r + 30 && gg > b + 50) green++; }
    return { op, box: (x1 - x0) * (y1 - y0), brown, white, grey, hot, green }; }, cs.box);
  check(`[${label}] the infrared picture is opaque over the whole frame (${px.op} of ${px.box} pixels of a box inside it) with the sea brown (${(100 * px.brown / px.op).toFixed(0)} %), cloud grey and white (${(100 * (px.grey + px.white) / px.op).toFixed(0)} %) and the cold tops green to orange and red (${(100 * (px.hot + px.green) / px.op).toFixed(1)} %)`, px.op > 0.97 * px.box && px.op > 20000 && px.brown > 0.02 * px.op && px.grey + px.white > 0.03 * px.op && px.hot + px.green > 0.005 * px.op);
  check(`[${label}] a 90-kt storm's coldest cloud top is ${ui.f.tbMin.toFixed(0)} C (colder than -65 C)`, ui.f.tbMin < -65);
  const ci = await read('ir');
  check(`[${label}] the land's outline is drawn over the satellite picture too: ${ci.hit} of ${ci.used} points on the coast have white outline pixels within ${R} pixels`, ci.used >= 40 && ci.hit >= 0.85 * ci.used);
  const halo = await ev(() => window.SSTSIM.floaterCoast());
  check(`[${label}] the outline is white with a dark edge so that it stays visible on white cloud: drawn alone it is ${halo.core} white pixels and ${halo.edge} dark edge pixels (at least half as many)`, halo.core > 500 && halo.edge >= 0.5 * halo.core);
  await ev(() => { window.SSTSIM.floaterSet({ view: 'radar' }); window.SSTSIM.floaterRun(1); });
  const bk = await ev(() => { const vis = (id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; }; return { v: window.SSTSIM.floaterState().view, z: vis('fl-legend'), ir: vis('fl-legend-ir'), site: vis('fl-site-l'), sub: document.getElementById('fl-sub').textContent }; });
  check(`[${label}] back to radar: its key and site chooser return, the infrared key goes (${bk.sub})`, bk.v === 'radar' && bk.z && !bk.ir && bk.site && /reflectivity/.test(bk.sub));
  // the two fastest clocks (on a storm in open water: the coast scenario's storm may be gone by the landfall within the hours these run)
  const ow = prefix === 'atlantic' ? { td: [15, -45], day: 200 } : STORM_SPECS[prefix];
  const sid2 = await ev((q) => { const S = window.SSTSIM; S.floaterClose(); S.setPlaying(false); S.applySeed(4242); S.setPlaying(false); S.storms(true); S.stormAuto(false); S.summary(false); S.tick(24 * q.day);
    const id = S.stormPlace({ kind: 'td', lat: q.td[0], lon: q.td[1], v: 60 }); S.tick(12); S.advance(0); S.stormForce(id, { th: 'tc', v: 105, vr: 105, p: 946 }); S.tick(2); S.advance(0);
    S.floaterOpen(id); S.floaterRun(1200); return id; }, ow);
  const sp2 = await ev(() => { const S = window.SSTSIM, out = []; for (const k of [10, 11, 12, 13, 99]) { S.floaterSet({ speed: k }); out.push([S.floaterState().speed, document.getElementById('speed-x').textContent, document.getElementById('speed-sub').textContent, document.getElementById('b-faster').disabled]); } return out; });
  check(`[${label}] the clock has two more speeds, 30 and 45 minutes a second, and nothing above (${sp2.map((a) => a[1]).join(', ')}; asking for 99 gives speed ${sp2[4][0]}, the faster button is then off)`, sp2[2][0] === 12 && sp2[2][1] === '30 min/s' && sp2[2][2] === '30 min every second' && sp2[3][0] === 13 && sp2[3][1] === '45 min/s' && sp2[3][2] === '45 min every second' && sp2[4][0] === 13 && sp2[4][3] === true && sp2[1][1] === '20 min/s' && sp2[1][3] === false);
  const lag = await ev(async () => { const S = window.SSTSIM; S.floaterSet({ play: true, speed: 11 }); S.floaterRun(1); S.floaterLag(3000); await new Promise((r) => setTimeout(r, 250)); const f = S.floaterState(); return { acc: f.acc, gone: f.gone }; });
  check(`[${label}] the clock never goes back: when a frame looks three seconds older than the last (as after a long blocking call) the remainder it carries is still not negative (${lag.acc.toFixed(1)} s) at 20 minutes a second`, lag.acc >= 0 && !lag.gone);
  const hr = await ev(() => { const S = window.SSTSIM, out = {}; S.floaterSet({ play: false }); for (const k of [11, 12, 13]) { S.floaterSet({ speed: k }); const a = S.floaterState(); S.floaterRun(3600); const b = S.floaterState(); out[k] = { dSteps: b.steps - a.steps, dh: b.hour - a.hour, m0: a.minutes, m1: b.minutes }; } return out; });
  check(`[${label}] an hour of the system's life takes ${hr[11].dSteps} steps at 20 minutes a second and ${hr[12].dSteps} and ${hr[13].dSteps} at 30 and 45 (four-minute steps there: half as many), the engine moves on exactly one hour each time (${hr[11].dh}, ${hr[12].dh}, ${hr[13].dh}) and the clock keeps its minute (${hr[13].m0} to ${hr[13].m1})`,
    hr[11].dSteps >= 29 && hr[11].dSteps <= 34 && hr[12].dSteps >= 14 && hr[12].dSteps <= 18 && hr[13].dSteps >= 14 && hr[13].dSteps <= 18 && hr[11].dh === 1 && hr[12].dh === 1 && hr[13].dh === 1 && Math.abs(hr[13].m1 - hr[13].m0) <= 4);
  const roll = await ev(() => { const S = window.SSTSIM; S.floaterSet({ play: false, speed: 11 }); for (let i = 0; i < 8 && S.floaterState().minutes % 4 !== 2; i++) S.floaterRun(120); const m0 = S.floaterState().minutes, h0 = S.floaterState().hour, t0 = S.floaterState().t; S.floaterSet({ speed: 13 }); let k = 0;
    while (S.floaterState().hour === h0 && k < 40) { S.floaterRun(240); k++; } const f = S.floaterState(); return { m0, k, dh: f.hour - h0, m: f.minutes, dt: f.t - t0 }; });
  check(`[${label}] a step never goes past the hour, even a four-minute one: from minute ${roll.m0} (two minutes off the steps' four) at 45 minutes a second the engine moves on after ${roll.k} runs of four minutes and the clock then reads minute ${roll.m} of the new hour (0), the model having run ${roll.dt / 60} minutes (${60 - roll.m0} to the hour, not two more)`, roll.dh === 1 && roll.m === 0 && roll.m0 % 4 === 2 && Math.abs(roll.dt - (60 - roll.m0) * 60) < 1);
  const live = await ev(async () => { const S = window.SSTSIM; S.floaterSet({ speed: 13, play: true, view: 'ir' }); const a = S.floaterState(); let fr = 0, raf = 0; const tick = () => { fr++; raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); await new Promise((r) => setTimeout(r, 3000)); cancelAnimationFrame(raf); const b = S.floaterState(); S.floaterSet({ speed: 5 }); return { fr, dSteps: b.steps - a.steps, on: b.on }; });
  check(`[${label}] at 45 minutes a second in the satellite view the clock runs by itself (${live.dSteps} steps in three seconds) and the page keeps drawing (${live.fr} frames)`, live.on && live.dSteps >= 8 && live.fr >= 6);
  const re = await ev((id) => { const S = window.SSTSIM; S.floaterSet({ view: 'ir' }); S.floaterClose(); const ok = S.floaterOpen(id); const out = { ok, view: S.floaterState().view, sel: document.getElementById('fl-view').value, ir: getComputedStyle(document.getElementById('fl-legend-ir')).display, z: getComputedStyle(document.getElementById('fl-legend')).display, speed: S.floaterState().speed }; S.floaterClose(); S.stormForce(id, { alive: false }); return out; }, sid2);
  check(`[${label}] a floater opened after one closed in the satellite view opens on radar again (${re.view}, the chooser ${re.sel}, the radar key ${re.z}, the infrared key ${re.ir}) at its usual speed (${re.speed})`, re.ok && re.view === 'radar' && re.sel === 'radar' && re.ir === 'none' && re.z !== 'none' && re.speed === 5);
}
// what the storms do to a city: the tooltip's "Storm impact" block (dashes with nothing going on, then the winds, rain, tolls and damage after a hit), the ring on the marker, the storm's own tally on its card, the season's totals
// in the summary, the structure row of a hurricane, a save that keeps it, and the healing over the weeks
async function checkImpacts(page, label, prefix) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const spot = prefix === 'atlantic' ? { td: [26, -80], day: 200 } : STORM_SPECS[prefix];
  const r = await ev((q) => {
    const S = window.SSTSIM; S.setPlaying(false); S.applySeed(4242); S.setPlaying(false); S.storms(true); S.stormAuto(false); S.tick(24 * (q.day - 40)); S.summary(false);
    const list = S.cityList(); let best = -1, bd = 1e9; list.forEach((c, i) => { if (c.inland) return; const d = Math.hypot(c.lat - q.td[0], (c.lon - q.td[1]) * Math.cos(c.lat * Math.PI / 180)); if (d < bd) { bd = d; best = i; } });
    const c = list[best], hs = c.lat < 0 ? -1 : 1, cb = document.getElementById('cities'); if (!cb.checked) cb.click();
    S.map.setView([c.lat, c.lon], 7, { animate: false }); S.advance(0);
    return { i: best, c, hs, before: S.cityTipLines(best), rings0: S.impactRings().length, px: S.cityPoint(best) };
  }, spot);
  await page.mouse.move(r.px.x + 40, r.px.y + 40); await page.mouse.move(r.px.x + 1, r.px.y + 1, { steps: 3 }); await page.waitForTimeout(250);
  const tip0 = await ev(() => { const t = document.getElementById('city-tip'); return { shown: t.style.display === 'block', text: t.innerText.replace(/\n+/g, ' | ') }; });
  check(`[${label}] before any storm the city tooltip (${r.c.name}) has its storm impact block and every value is a dash (${r.before.join(' / ')}), with no ring on the map (${r.rings0})`,
    tip0.shown && /Storm impact/.test(tip0.text) && /Sustained winds — · gusts —/.test(tip0.text) && /Rainfall \(72h\) —/.test(tip0.text) && /Deaths — · Injuries —/.test(tip0.text) && /Damage —/.test(tip0.text) && !/Recovery/.test(tip0.text) && r.rings0 === 0);
  // a hurricane crosses the city: 44 hours from three degrees on the tropical side to three on the other
  const h = await ev((q) => {
    const S = window.SSTSIM, c = q.c, hs = q.hs, id = S.stormPlace({ kind: 'td', lat: c.lat - 3 * hs, lon: c.lon - 0.3, v: 60 }); S.tick(2);
    let peakW = 0;
    for (let k = 0; k < 44; k++) { S.stormForce(id, { th: 'tc', lat: c.lat - 3 * hs + 6 * hs * k / 43, lon: c.lon - 0.3, v: 110, vr: 110, p: 945, cx: 0, cy: 12 * hs }); S.tick(1); const o = S.impactOf(q.i); if (o) peakW = Math.max(peakW, o.windSustained); }
    S.stormForce(id, { th: 'tc', v: 110, vr: 110, p: 945 }); S.summary(false);                                 // (the storm is where it is, still a hurricane, for the card below)
    S.map.setView([c.lat, c.lon], 7, { animate: false }); S.advance(0); S.stormDraw();
    return { id, o: S.impactOf(q.i), lines: S.cityTipLines(q.i), rings: S.impactRings(), peakW, px: S.cityPoint(q.i) };
  }, { c: r.c, hs: r.hs, i: r.i });
  await page.mouse.move(h.px.x + 40, h.px.y + 40); await page.mouse.move(h.px.x + 1, h.px.y + 1, { steps: 3 }); await page.waitForTimeout(250);
  const tip1 = await ev(() => { const t = document.getElementById('city-tip'); return { shown: t.style.display === 'block', text: t.innerText.replace(/\n+/g, ' | ') }; });
  check(`[${label}] after a 110 kt hurricane crossed ${r.c.name} the tooltip has the numbers (${tip1.text.split('Storm impact')[1] || tip1.text}): rain in inches, deaths, injuries, damage in dollars with its share of the city, and how far it has recovered; the wind at the height of it was ${h.peakW} mph`,
    tip1.shown && /Rainfall \(72h\) \d+\.\d in/.test(tip1.text) && /Deaths [\d,]+ · Injuries [\d,]+/.test(tip1.text) && /Damage \$[\d.]+[KMBT] \([\d.]+%\)/.test(tip1.text) && /Recovery \d+%/.test(tip1.text) && h.o.damageCost > 0 && h.peakW > 35);
  // the ring: on the marker, in the colour of how much of the city is damaged
  const ring = await ev(({ px, rings, i }) => { const S = window.SSTSIM, mine = rings.find((q) => q[0] === i), c = document.getElementById('storm-canvas'), d = c.width / c.clientWidth, a = c.getContext('2d').getImageData(Math.round((px.x + 9) * d), Math.round(px.y * d), 1, 1).data, far = c.getContext('2d').getImageData(Math.round((px.x + 24) * d), Math.round(px.y * d), 1, 1).data; return { sev: mine && mine[1], rec: mine && mine[2], c: [a[0], a[1], a[2], a[3]], far: far[3] }; }, { px: h.px, rings: h.rings, i: r.i });
  const RC = [[0.2, [176, 0, 58]], [0.05, [255, 59, 48]], [0.01, [255, 159, 10]], [0.001, [255, 214, 10]]], want = ring.sev == null ? null : (RC.find((q) => ring.sev >= q[0]) || [])[1];
  check(`[${label}] the city has a ring on its marker (${(100 * (ring.sev || 0)).toFixed(2)} % of its value damaged: ${ring.c.join(',')}, expected ${want ? want.join(',') : 'none'})`,
    !!want && ring.c[3] > 200 && Math.abs(ring.c[0] - want[0]) < 6 && Math.abs(ring.c[1] - want[1]) < 6 && Math.abs(ring.c[2] - want[2]) < 6);
  const offRing = await ev(({ px }) => { const S = window.SSTSIM, cb = document.getElementById('cities'), c = document.getElementById('storm-canvas'), d = c.width / c.clientWidth, at = () => c.getContext('2d').getImageData(Math.round((px.x + 9) * d), Math.round(px.y * d), 1, 1).data[3]; cb.click(); S.stormDraw(); const a = at(); cb.click(); S.stormDraw(); return { off: a, on: at() }; }, { px: h.px });
  check(`[${label}] the ring goes with the city markers when they are switched off (${offRing.off}) and comes back with them (${offRing.on})`, offRing.off === 0 && offRing.on > 200);
  // the storm's own card: the tally of what it did, the structure of a hurricane
  const sp = await ev((id) => { const S = window.SSTSIM, s = S.stormState().systems.find((x) => x.id === id); S.map.setView([s.lat, s.lon], 6, { animate: false }); S.advance(0); S.stormDraw(); return S.stormPx(id); }, h.id); await page.mouse.click(sp.x, sp.y); await page.waitForTimeout(250);
  const card = await ev(() => { const g = (id) => document.getElementById(id); return { dmg: g('sc-dmg').textContent, dth: g('sc-dth').textContent, erc: g('sc-erc').textContent, ercShown: g('sc-ercrow').style.display !== 'none', wf: g('sc-wf').textContent }; });
  await page.waitForTimeout(450); await ev((id) => { window.SSTSIM.stormForce(id, { ercPh: 'weakening' }); window.SSTSIM.stormDraw(); }, h.id); await page.waitForTimeout(100);
  const card2 = await ev(() => document.getElementById('sc-erc').textContent);
  check(`[${label}] the storm's card tells what it did (damage ${card.dmg}, deaths ${card.dth}), a hurricane's structure (${card.erc}; in an eyewall replacement: ${card2}) and where the eyewall is (${card.wf})`,
    /^\$[\d.]+[KMBT]$/.test(card.dmg) && /^[\d,]+$/.test(card.dth) && card.ercShown && /^(Single eyewall|Outer eyewall forming|Eyewall replacement: .*)$/.test(card.erc) && /Eyewall replacement: inner eyewall weakening/.test(card2) && /eyewall at \d+ mi/.test(card.wf));
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  // the season's summary: the totals and the storm's damage
  const sum = await ev(() => { const S = window.SSTSIM; S.summary(true); const t = document.getElementById('sum-imp'), row = document.querySelector('#sum-table tbody tr:last-child'); const out = { shown: !t.hidden, text: t.innerText.replace(/\s+/g, ' '), rowText: row ? row.innerText.replace(/\s+/g, ' ') : '', head: document.querySelector('#sum-table thead').innerText.replace(/\s+/g, ' ') }; S.summary(false); return out; });
  check(`[${label}] the season summary has the totals (${sum.text}) and a damage column (${sum.head}: ${sum.rowText})`, sum.shown && /Damage \$[\d.]+[KMBT] · deaths [\d,]+ · injured [\d,]+ · worst hit: /.test(sum.text) && /Damage\s*$/.test(sum.head) && /\$[\d.]+[KMBT]/.test(sum.rowText));
  // a save keeps the ledger, and the city heals over the weeks (a storm-free month later the damage is smaller and the recovery further on)
  const keep = await ev(({ i }) => { const S = window.SSTSIM, a = S.impactOf(i); S.snapSave(); S.stormForce(S.stormState().systems[0].id, { alive: false }); S.snapLoad(); const b = S.impactOf(i); return { a: a.damageCost, b: b.damageCost, ra: a.deaths, rb: b.deaths, rings: S.impactRings().length }; }, { i: r.i });
  check(`[${label}] a save keeps the ledger (damage ${(keep.a / 1e9).toFixed(2)} B before, ${(keep.b / 1e9).toFixed(2)} B after a save and load; deaths ${keep.ra} and ${keep.rb}; the ring stays: ${keep.rings})`, Math.abs(keep.a - keep.b) < keep.a * 0.001 + 1 && keep.ra === keep.rb && keep.rings >= 1);
  const heal = await ev(({ i }) => { const S = window.SSTSIM, a = S.impactOf(i); S.stormAuto(false); for (let k = 0; k < 24 * 40; k += 24) S.tick(24); const b = S.impactOf(i); return { a, b }; }, { i: r.i });
  check(`[${label}] and the city heals: ${(heal.a.damageCost / 1e9).toFixed(2)} B of damage at the start, ${(heal.b.damageCost / 1e9).toFixed(2)} B forty days on (recovery ${(100 * heal.a.recovery).toFixed(0)} % then ${(100 * heal.b.recovery).toFixed(0)} %, rain ${heal.b.rain72h.toFixed(1)} in)`, heal.b.damageCost < heal.a.damageCost && (heal.b.recovery > heal.a.recovery || heal.b.damageCost === 0) && heal.b.rain72h === 0);
}
async function checkStormsBasin(page, label, prefix) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const sp = STORM_SPECS[prefix];
  await import('../src/storms.js');
  const H = globalThis.HFStorms, BI = H.basinInfo(prefix), SC = H.scaleOf(prefix), tag = SC.bar[0], word = BI.hurricane[0].toUpperCase() + BI.hurricane.slice(1), esc = (t) => t.replace(/[.+*?^${}()|[\]\\]/g, '\\$&');      // SC: the basin's own intensity scale (src/storms.js SCALES)
  const ref = JSON.parse(readFileSync(join(ROOT, 'data/generated', `${prefix}-tc-ref.json`), 'utf8')).normals;
  const a = await ev(() => {
    const S = window.SSTSIM; S.setPlaying(false); S.applySeed(4242); S.setPlaying(false); S.storms(true); S.stormAuto(false);
    const bar = document.getElementById('season');
    return { on: S.storms(), shown: getComputedStyle(bar).display !== 'none', text: bar.innerText.replace(/\s+/g, ' ').trim(), year: document.getElementById('se-year').textContent, state: S.stormState(), mk: S.stormMapsKeys(), canvas: !!document.getElementById('storm-canvas') };
  });
  check(`[${label}] the page carries the climatology maps the engine is anchored to (${(a.mk || []).join(', ')})`, !!a.mk && ['drift', 'steerClim', 'haz', 'spawn', 'env0'].every((k) => a.mk.includes(k)));
  const barRe = new RegExp(`^${BI.label} (\\d{4}${BI.seasonMonth ? '–\\d{2}' : ''}) 0 ?DEP 0 ?NAMED 0 ?${esc(SC.bar[0])} 0 ?${esc(SC.bar[1])} 0 ?${esc(SC.bar[2])} 0\\.0 ?ACE ?Summary$`), yr = (barRe.exec(a.text) || [])[1];
  check(`[${label}] the season bar shows "${a.text}" before anything has formed (the ${BI.seasonMonth ? 'southern season is named for the year it starts in, 2026–27' : 'season is the calendar year'}; the three strength counts are tagged ${SC.bar.join(' / ')})`, a.on === true && a.shown && !!yr && a.canvas && a.state.systems.length === 0);
  const seasonYear = yr ? +yr.slice(0, 4) : 0;

  // hand-placed systems: a strong depression, a subtropical one, a low, in the middle of the basin's season
  const b = await ev((q) => {
    const S = window.SSTSIM; S.tick(24 * q.day);
    const ids = [S.stormPlace({ kind: 'td', lat: q.td[0], lon: q.td[1], v: 60 }), S.stormPlace({ kind: 'sd', lat: q.sd[0], lon: q.sd[1], v: 40 }), S.stormPlace({ kind: 'low', lat: q.low[0], lon: q.low[1], v: 35 })];
    S.tick(12); S.advance(0);
    const st = S.stormState(), by = Object.fromEntries(st.systems.map((x) => [x.id, x]));
    return { ids, st, by, bar: ['se-dep', 'se-named', 'se-hurr', 'se-major', 'se-c5', 'se-ace'].map((id) => document.getElementById(id).textContent) };
  }, sp);
  const [i1, , i3] = b.ids, s1 = b.by[i1], s3 = b.by[i3], first = H.stormName(prefix, seasonYear, 0, {}, sp.td[1] > 180 ? sp.td[1] - 360 : sp.td[1]);
  check(`[${label}] a placed tropical depression gets a depression number and the first name of the season's list at its first advisory fix (${s1.name || '-'}, expected ${first}; dep ${s1.depNum}), a placed low stays a low (${s3.st})`, s1.depNum >= 1 && s1.name === first && s3.th === 'nl' && s3.depNum === 0);
  check(`[${label}] the season bar follows the counters: DEP ${b.bar[0]}, NAMED ${b.bar[1]}, ACE ${b.bar[5]} (stats ${JSON.stringify(b.st.stats)})`, +b.bar[0] === b.st.stats.dep && +b.bar[1] === b.st.stats.named && +b.bar[5] === b.st.stats.ace && b.st.stats.dep >= 1 && b.st.stats.named >= 1);

  // hover and click on a strong storm: the local word for hurricane strength in the tooltip and the stat card
  await ev(([id, lat, lon]) => { const S = window.SSTSIM; S.map.setView([lat, lon], 4, { animate: false }); S.stormForce(id, { th: 'tc', v: 105, vr: 105, p: 946 }); S.stormDraw(); }, [i1, s1.lat, s1.lon]);
  const px = await ev((id) => window.SSTSIM.stormPx(id), i1);
  await page.mouse.move(px.x - 40, px.y - 40); await page.mouse.move(px.x, px.y, { steps: 4 });
  await page.waitForTimeout(150);
  const tip = await ev(() => { const t = document.getElementById('storm-tip'); return { shown: t.style.display === 'block', text: t.innerText.replace(/\n/g, ' | ') }; });
  const k105 = H.classOf(prefix, 105, 'tc'), kind105 = SC.major != null ? new RegExp(`Major ${word} \\(Cat 3\\)`) : new RegExp(esc(k105.long));         // 105 kt in the basin's own scale: Typhoon, Extremely Severe Cyclonic Storm, Intense Tropical Cyclone, Category 4 Severe Tropical Cyclone ...
  check(`[${label}] hovering a storm shows its card tooltip with the basin's own class (${k105.long}): ${tip.text}`, tip.shown && tip.text.includes(first) && kind105.test(tip.text) && /120 mph \(105 kt\)/.test(tip.text) && /946 hPa/.test(tip.text) && (word === 'Hurricane' || !/hurricane/i.test(tip.text)));
  await page.mouse.click(px.x, px.y); await page.waitForTimeout(250);
  const card = await ev(() => { const c = document.getElementById('storm-card'), g = (id) => document.getElementById(id).textContent; return { hidden: c.hidden, name: g('sc-name'), cat: g('sc-cat'), mph: g('sc-mph'), p: g('sc-p') }; });
  check(`[${label}] clicking it opens the stat card (${card.name}, ${card.cat}, ${card.mph} mph, ${card.p} hPa)`, !card.hidden && card.name === first && (SC.major != null ? new RegExp(`Major ${word}`).test(card.cat) : card.cat === k105.long) && card.mph === '120' && card.p === '946');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);

  // Place mode in this basin: the button holds the clock and opens the picker, at the pointer the forecast is a line of three-hourly fixes (seven days), a click puts the system there and the clock goes on
  const pl = await ev((q) => {
    const S = window.SSTSIM; S.setPlaying(true); document.getElementById('b-place').click(); S.place(true, 'td');
    const p = S.placeAt(q.td[0], q.td[1]), m = S.placePx(q.td[0], q.td[1]);
    return { pressed: document.getElementById('b-place').getAttribute('aria-pressed'), menu: !document.getElementById('place-menu').hidden, playing: document.getElementById('ic-pause').style.display !== 'none', fixes: p.fixes.length, h0: p.fixes[0].h, h1: p.fixes[1].h, x: m.x, y: m.y, before: S.stormState().systems.length };
  }, sp);
  await page.mouse.move(pl.x - 20, pl.y - 20); await page.mouse.move(pl.x, pl.y, { steps: 3 }); await page.mouse.click(pl.x, pl.y); await page.waitForTimeout(250);
  const pl2 = await ev(() => { const S = window.SSTSIM, st = S.stormState(); S.place(false); return { n: st.systems.length, origin: st.systems.map((x) => x.origin).filter((o) => /^placed/.test(o)).length }; });
  check(`[${label}] Place: the clock is held, the picker is open (${pl.pressed}), the forecast at the pointer is ${pl.fixes} fixes ${pl.h1 - pl.h0} hours apart (it can fizzle early), and a click places a system (${pl.before} systems before, ${pl2.n} after)`,
    pl.pressed === 'true' && pl.menu && !pl.playing && pl.fixes >= 8 && pl.h1 - pl.h0 === 3 && pl2.n === pl.before + 1 && pl2.origin >= 1);

  await checkStormEnso(page, label);

  // the stages: this basin's precursors (a basin without a wave train has local lows only), and the Tropical waves row
  const stage = await ev(() => { const S = window.SSTSIM; S.stormAuto(true); S.tick(24 * 10); S.advance(0); const st = S.stormState(); S.stormAuto(false); return { waves: st.seeds.W || 0, local: st.seeds.N || 0 }; });
  check(`[${label}] ${BI.waves ? 'it has easterly waves' : 'it has no easterly waves'} (${stage.waves} in ten more days) and local seeds supply its disturbances (${stage.local})`, BI.waves ? stage.waves > 0 : stage.waves === 0);

  // the outlook in this basin (one engine for every basin): ninety days from the day the page's own season starts, an issue every six hours (looked at every other day), every area valid, the basin's own invest letters, the layer row, the legend and the cost
  const olb = await ev((q) => {
    const S = window.SSTSIM, out = { n: 0, bad: 0, issued: 0, looked: 0, maxMs: 0, inv: [], x: 0, arrow: 0, unborn: 0, in0: 0 }; S.stormLabCalendar(q.start[0], q.start[1]); S.applySeed(31); S.setPlaying(false); S.stormAuto(true);
    for (let day = 0; day < 90; day += 2) {
      S.tick(48); S.advance(0); const fr = S.outlookFresh(); out.maxMs = Math.max(out.maxMs, fr.ms); const r = S.outlook(); out.looked++; if (r.issued % 6 === 0 && r.issued <= r.hour && r.hour - r.issued < 6) out.issued++;
      for (const a of r.areas) { out.n++; if (a.x) out.x++; if (a.arrow) out.arrow++; if (a.x && !a.arrow && a.p2 === 0) out.in0++; if (a.kind === 'unborn') out.unborn++; if (!(a.p2 % 5 === 0 && a.p7 % 5 === 0 && a.p2 <= a.p7 && a.p7 >= 10 && a.p7 <= 100 && ['low', 'medium', 'high'].includes(a.cls) && a.poly.length >= 24 && a.poly.every((u) => Number.isFinite(u[0]) && Number.isFinite(u[1])))) out.bad++; if (a.invest) out.inv.push(a.invest); }
    }
    for (const sy of S.stormState().systems) if (sy.invest) out.inv.push(sy.invest);
    const lg = document.getElementById('ol-legend'); out.legend = getComputedStyle(lg).display !== 'none'; out.label = document.getElementById('stdist').parentElement.innerText.trim();
    S.stormAuto(false); S.stormLabCalendar(q.start[0], q.start[1]); S.applySeed(4242); S.setPlaying(false); return out;
  }, { start: sp.start });
  const letters = [H.BASINS[prefix].inv.w, H.BASINS[prefix].inv.e];
  check(`[${label}] the outlook: ${olb.n} areas of interest in ninety days (${olb.x} with an X, ${olb.arrow} with an arrow, ${olb.unborn} before anything formed, ${olb.in0} X's in their shape with a 2-day chance of 0), all valid (chances in fives from 10 to 100 %, the 2-day not above the 7-day, three classes, closed outlines), ${olb.issued} of ${olb.looked} issued at a synoptic time, invests only with this basin's letter${letters[0] === letters[1] ? '' : 's'} (${letters.join(' / ')}: ${[...new Set(olb.inv.map((i) => i.slice(2)))].join(' ') || 'none yet'}), the legend ${olb.legend ? 'shown' : 'hidden'}, a fresh issue at most ${olb.maxMs.toFixed(1)} ms, the row "${olb.label.slice(0, 30)}"`,
    olb.bad === 0 && olb.in0 <= Math.max(1, 0.05 * olb.x) && olb.issued === olb.looked && (ref.named < 2 || olb.n >= 1) && olb.inv.every((i) => /^9\d[A-Z]$/.test(i) && letters.includes(i[2])) && olb.legend && /Areas of interest/.test(olb.label) && olb.maxMs < 60);

  // whole seasons through the page, each from the first day of the basin's season (the lab calendar), against the real normals of the storms that form inside this page
  const seas = await ev((q) => {
    const S = window.SSTSIM, out = []; S.stormLabCalendar(q.sm, 1);
    for (const seed of q.seeds) { S.applySeed(seed); S.setPlaying(false); S.stormAuto(true); S.tick(24 * 364); S.advance(0); out.push(S.stormState().stats); }
    S.stormAuto(false); S.stormLabCalendar(q.start[0], q.start[1]); S.applySeed(4242); S.setPlaying(false);
    return out;
  }, { sm: BI.seasonMonth, start: sp.start, seeds: sp.seeds });
  const mn = (k) => seas.reduce((x, y) => x + y[k], 0) / seas.length;
  const rare = ref.named < 2;                          // (the South Atlantic and the Mediterranean have a named storm in most seasons, not in all, and one of hurricane strength in one of twenty: three seasons are three draws, so a season without one is allowed and the count of strong ones has only an upper bound)
  check(`[${label}] three whole seasons through the page look like the real ${BI.label}: ${mn('dep').toFixed(1)} depressions, ${mn('named').toFixed(1)} named storms, ${mn('hurr').toFixed(1)} ${BI.hurricane}s, ${mn('major').toFixed(1)} majors, ACE ${mn('ace').toFixed(0)} on average (real ${ref.tracks} / ${ref.named} / ${ref.hurricanes} / ${ref.majors} / ${Math.round(ref.ace_mean)}; seasons: ${seas.map((x) => x.named + '/' + x.hurr + '/' + x.major + '/' + Math.round(x.ace)).join(', ')} named/${BI.hurricane}s/majors/ACE)`,
    mn('named') >= 0.55 * ref.named && mn('named') <= 1.6 * ref.named && (rare ? mn('hurr') <= 0.5 : mn('hurr') >= 0.45 * ref.hurricanes && mn('hurr') <= 1.9 * ref.hurricanes) && mn('ace') >= 0.45 * ref.ace_mean && mn('ace') <= 1.9 * ref.ace_mean && (rare ? seas.some((x) => x.named >= 1) : seas.every((x) => x.named >= 1)));

  // save and resume in this basin: a season saved at a midnight continues bit for bit like the uninterrupted one
  const sv = await ev((q) => {
    const S = window.SSTSIM; S.stormLabCalendar(q.sm, 1); S.applySeed(31); S.setPlaying(false); S.stormAuto(true); S.tick(24 * q.day); S.advance(0);
    S.stormPlace({ kind: 'td', lat: q.td[0], lon: q.td[1], v: 45 }); S.tick(24 * 3); S.advance(0);
    S.snapSave(); S.tick(24 * 6); S.advance(0); const a = S.stormJSON(), ha = S.state().simHour;
    S.snapLoad(); const mid = S.state().simHour; S.tick(24 * 6); S.advance(0); const b = S.stormJSON();
    S.stormAuto(false); S.stormLabCalendar(q.start[0], q.start[1]); S.applySeed(4242); S.setPlaying(false);
    return { same: a === b, ha, mid, kb: Math.round(a.length / 1024) };
  }, { sm: BI.seasonMonth, start: sp.start, day: Math.min(sp.day, 120), td: sp.td });
  check(`[${label}] a season saved at a midnight (hour ${sv.mid}) and resumed continues bit for bit like the uninterrupted one (${sv.kb} KB of storms)`, sv.same && sv.mid < sv.ha);
  await checkLook(page, label, prefix);
  await checkImpacts(page, label, prefix);
  await checkFloater(page, label, prefix);
  await checkSatellite(page, label, prefix);
  if (SITE_SPECS[prefix]) await checkFloaterSite(page, label, prefix);
  // the main menu's Continue card for a season saved here names the basin, the season and the local word (this is the last check of a basin's callback: it leaves the page)
  const sc = await ev((q) => { const S = window.SSTSIM; S.stormLabCalendar(q.sm, 1); S.applySeed(31); S.setPlaying(false); S.stormAuto(true); S.tick(24 * 40); S.advance(0); S.saveTick(); return { stats: S.stormState().stats, year: document.getElementById('se-year').textContent, meta: JSON.parse(S.saveInfo().meta) }; }, { sm: BI.seasonMonth });
  await page.goto(pathToFileURL(join(ROOT, 'index.html')).href, { waitUntil: 'load' });
  const cardText = await page.evaluate(() => ({ hidden: document.getElementById('continue').hidden, text: document.getElementById('continue').innerText.replace(/\s+/g, ' ') }));
  const seasonText = sc.year.replace(BI.label + ' ', ''), hw = BI.hurricane + (sc.stats.hurr === 1 ? '' : 's');
  check(`[${label}] the main menu's Continue card for a season saved here reads "${cardText.text.slice(0, 120)}": the basin, the season (${seasonText}), the named storms and the ${hw}`,
    !cardText.hidden && sc.meta.basin === BI.menu && cardText.text.includes(BI.label + ' ' + seasonText) && cardText.text.includes(sc.stats.named + ' named') && cardText.text.includes(sc.stats.hurr + ' ' + hw));
}

// El Nino reaches the storm engine through the page: the live environment hands it the Nino 3.4 index (the lab's engines and the live one read it there) and so does the shadow environment of the Place preview.
async function checkStormEnso(page, label) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const en = await ev(() => { const S = window.SSTSIM, chk = document.getElementById('enso-hold'), was = S.storms(); S.storms(true); chk.checked = true; chk.dispatchEvent(new Event('change')); const out = [];
    for (const z of [1.7, -0.9]) { S.forceEnso(z); S.advance(1); out.push([S.enso().n34, S.stormEnvSample(0, 0).enso, S.shadowEnso()]); }
    chk.checked = false; chk.dispatchEvent(new Event('change')); S.storms(was); return out; });
  check(`[${label}] the storm environment and the Place preview's carry the Nino 3.4 index the page shows (${en.map((r) => r.map((x) => x.toFixed(2)).join(' / ')).join(', ')})`, en.every((r) => Math.abs(r[0] - r[1]) < 1e-9 && Math.abs(r[0] - r[2]) < 1e-9) && en[0][0] > 1.5 && en[1][0] < -0.5);
}

// The humidity and the wind shear answer El Nino, and carry their year-to-year (EOF) modes, with a gain that depends on the calendar month in the pages whose data have `seas` (tools/make_env_seasonality.py): the
// real response is not the same in every month -- over the western North Pacific's main development region the humidity falls by 5-8 points per degree in January to April and by 1 in August to October -- and the
// three lag terms of the El Nino response are fitted together. Same seed, same day, only one thing different -- a held El Nino against a held La Nina (the lagged terms already in it), or the year-to-year slider at 1
// against 0 -- the difference of a field at a point is that part alone and nothing else, so on the day of the strongest gain and on the day of the weakest it must be in the ratio of the two gains, in the
// field the map draws and in the grid the storms read. A page without `seas` (the Atlantic, the East Pacific) must have a ratio of 1.
async function checkEnvSeasons(page, label, dist) {
  const prefix = dist.replace(/^.*\//, '').replace('-sst-simulator.html', '');
  const data = JSON.parse(readFileSync(join(ROOT, 'data/generated', prefix === 'atlantic' ? 'data.json' : `${prefix}-data.json`), 'utf8'));
  const hum = data.humidity.seas || null, she = data.shear.seas || null, y = new Date().getUTCFullYear();
  const gain = (g, m, d) => {                                           // the page's own interpolation between the middles of the months
    if (!g) return 1;
    const doy = (Date.UTC(y, m, d) - Date.UTC(y, 0, 1)) / 86400000, ylen = ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365, p = doy / ylen * 12 - 0.5, i = Math.floor(p), t = p - i;
    return g[((i % 12) + 12) % 12] * (1 - t) + g[(((i + 1) % 12) + 12) % 12] * t;
  };
  const mHi = hum ? hum.enso.indexOf(Math.max(...hum.enso)) : 1, mLo = hum ? hum.enso.indexOf(Math.min(...hum.enso)) : 7;
  await import('../src/storms.js');
  const mdr = globalThis.HFStorms.basinInfo(prefix).mdr, pts = [], la0 = Math.min(...mdr.lat), la1 = Math.max(...mdr.lat), lo0 = Math.min(...mdr.lon), lo1 = Math.max(...mdr.lon);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) pts.push([la0 + (la1 - la0) * (i + 0.5) / 4, lo0 + (lo1 - lo0) * (j + 0.5) / 6]);
  const home = STORM_SPECS[prefix] ? STORM_SPECS[prefix].start : [5, 1];                      // the day the page's own template starts on (the Atlantic's is Jun 1)
  const runs = await page.evaluate(({ dates, pts, home }) => {
    const S = window.SSTSIM, chk = document.getElementById('enso-hold');
    S.stormsForce(true);
    const at = (month, enso, variability) => {
      S.stormLabCalendar(month, 15); S.setPlaying(false);
      if (!chk.checked) { chk.checked = true; chk.dispatchEvent(new Event('change')); }
      S.forceEnso(enso); S.applySeed(4242); S.setPlaying(false); S.set('variability', variability); S.advance(1);      // a held ENSO restarts already in its regime, lagged terms included (a restart reads the sliders again: the year-to-year one is set after it)
      return pts.map(([la, lo]) => { const a = S.sample(la, lo), b = S.stormEnvSample(la, lo); return [a.humid, a.shear, b.rh, b.shear]; });
    };
    const out = dates.map((m) => ({ m, nino: at(m, 2, 1), nina: at(m, -2, 1), on: at(m, 0, 1), off: at(m, 0, 0) }));
    chk.checked = false; chk.dispatchEvent(new Event('change')); S.set('variability', 1); S.storms(false); S.stormLabCalendar(home[0], home[1]); S.applySeed(4242); S.setPlaying(false);
    return { out };
  }, { dates: [mHi, mLo], pts, home });
  const diff = (a, b, k) => a.map((r, i) => r[k] - b[i][k]);
  // the field and the part: [index into a sample, gain table, what differs, label]
  const parts = [[0, hum && hum.enso, 'nino', 'nina', 'humidity El Nino'], [0, hum && hum.eof, 'on', 'off', 'humidity year-to-year'], [1, she && she.enso, 'nino', 'nina', 'shear El Nino'], [1, she && she.eof, 'on', 'off', 'shear year-to-year']];
  for (const grid of [0, 2]) for (const [k, g, A, B, name] of parts) {
    const hi = diff(runs.out[0][A], runs.out[0][B], k + grid), lo = diff(runs.out[1][A], runs.out[1][B], k + grid);
    const mid = (i) => [0, 1].every((d) => [A, B].every((st) => { const v = runs.out[d][st][i][k + grid]; return k === 0 ? v > 12 && v < 85 : v > 4 && v < 100; }));       // away from the soft limits of a field (humidity near 0 or 100, shear near 0), which would flatten a large difference
    let best = -1, bv = 0; hi.forEach((v, i) => { if (mid(i) && Number.isFinite(v) && Number.isFinite(lo[i]) && Math.abs(v) > bv) { bv = Math.abs(v); best = i; } });
    const want = gain(g, mLo, 15) / gain(g, mHi, 15), got = best >= 0 ? lo[best] / hi[best] : NaN, big = bv > (k === 0 ? 0.3 : 0.15);
    check(`[${label}] ${grid ? 'the storm grid\'s' : 'the drawn'} ${name} part on ${gain(g, mLo, 15).toFixed(2)}-gain day over ${gain(g, mHi, 15).toFixed(2)}-gain day is ${got.toFixed(2)} (the gains say ${want.toFixed(2)}; difference ${bv.toFixed(2)} at the best point)`, big && Math.abs(got - want) <= 0.04 + 0.05 * want);
  }
}

// A basin's storm system is switched on by its data (storms.maps in its data file, src/storm-hooks.js STORMS_READY): the page is then on by default and shows the storm controls; until then it runs
// the plain simulation and shows none of them (the Menu button is there either way). Called on a freshly loaded page by checkBasin for every basin.
async function checkStormGate(page, label, dist, forceOff) {
  const prefix = dist.replace(/^.*\//, '').replace('-sst-simulator.html', ''), ready = !forceOff && (() => { const d = JSON.parse(readFileSync(join(ROOT, 'data/generated', prefix === 'atlantic' ? 'data.json' : `${prefix}-data.json`), 'utf8')); return !!(d.storms && d.storms.maps); })();
  const stormsDefault = await page.evaluate(() => (window.SSTSIM.storms ? window.SSTSIM.storms() : null));
  check(`[${label}] the storm engine is ${ready ? 'on' : 'off'} by default (the page ${ready ? 'carries' : 'has no'} storm climatology)`, stormsDefault === ready);
  const hasWaves = (await import('../src/storms.js'), globalThis.HFStorms.basinInfo(prefix).waves);
  const stormUi = await page.evaluate(() => { const vis = (el) => !!el && getComputedStyle(el).display !== 'none'; const g = (id) => document.getElementById(id); return { body: document.body.classList.contains('no-storms'), season: vis(g('season')), place: vis(g('b-place')), menu: vis(g('b-menu')), rows: ['stlabels', 'st-auto'].map((i) => vis(g(i).parentElement)), btns: ['stens', 'stcone', 'stdens', 'nhc'].map((l) => vis(document.querySelector('#lyr-dock [data-l="' + l + '"]'))), always: ['jetline', 'hl', 'steer'].map((l) => vis(document.querySelector('#lyr-dock [data-l="' + l + '"]'))) }; });
  check(`[${label}] the storm controls (season bar, Place button, Names / automatic storms rows, the Ensembles / Cones / Track density / NHC disturbances buttons) are ${ready ? 'shown' : 'hidden'}, the Jet stream / Highs & lows / Streamlines buttons are there either way (this basin ${hasWaves ? 'has' : 'has no'} wave train), and so is the Menu button`,
    stormUi.body === !ready && stormUi.season === ready && stormUi.place === ready && stormUi.rows.every((v) => v === ready) && stormUi.btns.every((v) => v === ready) && stormUi.always.every((v) => v) && stormUi.menu === true);
}

// All nine pages carry a storm climatology now, so the page a basin without one would be is made here: the same page with the test of the data (STORMS_READY) forced off. It must come up with the engine off by default and
// every storm control hidden (the Menu button stays), and nothing may throw.
async function checkStormGateOff(browser, label, dist) {
  const html = readFileSync(dist, 'utf8'), A = 'const STORMS_READY = !!(DATA.storms && DATA.storms.maps);', one = html.split(A).length === 2;
  check(`[${label}] the page decides whether it has a storm climatology in one place (the copy without one is made from that line)`, one);
  if (!one) return;
  const off = dist.replace(/\.html$/, '.off.html'), page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  writeFileSync(off, html.replace(A, 'const STORMS_READY = false;'));
  try {
    await page.route('**://**/*', (route) => route.request().url().startsWith('file://') ? route.continue() : route.abort());
    await page.goto(pathToFileURL(off).href, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.__ready === true, { timeout: 15000 });
    await page.waitForTimeout(800);
    await checkStormGate(page, label + ', no storm climatology', dist, true);
    const sw = await page.evaluate(() => { const S = window.SSTSIM; const a = S.storms(true); return [a, S.storms()]; });
    check(`[${label}] a visitor cannot switch the storm engine on in a page that has no storm climatology (${sw})`, sw[0] === false && sw[1] === false);
    check(`[${label}] a page without a storm climatology runs and starts with no errors (${errors.length})`, errors.length === 0);
  } finally { await page.close(); rmSync(off, { force: true }); }
}

// The cone and the fan on the page's own weather (not a made-up flow): a season of cyclones, a cone made for each one every day, and the real track that followed. The consensus must be about as far off as the NHC's
// cones are (the real position inside the cone's circle two times in three), its turns must come at about the right time, and the fan must be as wide as a forecast's error. This is the check that catches a fan
// reading the wrong weather (its steering from the last hour of the look-ahead for every hour: the cone then held the real track 2-8 % of the time and the turns were late or early by more than a day).
async function checkForecastSkill(page, label) {
  const R = await page.evaluate(() => {
    const S = window.SSTSIM; S.setPlaying(false); S.applySeed(1); S.setPlaying(false); S.storms(true); S.stormAuto(true); S.tick(24 * 45); S.advance(0);
    const samples = [], last = {}, ids = new Set();
    for (let t = 0; t < 4 * 110; t++) {
      S.tick(6); S.advance(0); const st = S.stormState();
      for (const s of st.systems) if (s.alive && (s.th === 'tc' || s.th === 'sc') && s.depNum > 0 && s.vr >= 25 && (last[s.id] === undefined || st.hour - last[s.id] >= 24)) {
        last[s.id] = st.hour; const c = S.coneFor(s.id); if (!c) continue; ids.add(s.id);
        const spread = [24, 120].map((l) => { const P = c.mean.filter((m) => m.length > l / 3).map((m) => m[l / 3]); if (P.length < 8) return null; const la = P.reduce((a, q) => a + q[0], 0) / P.length, lo = P.reduce((a, q) => a + q[1], 0) / P.length; return Math.sqrt(P.reduce((a, q) => a + ((q[0] - la) * 111.2) ** 2 + ((q[1] - lo) * 111.2 * Math.cos(la * Math.PI / 180)) ** 2, 0) / P.length); });
        samples.push({ id: s.id, init: c.init, line: c.line.filter((_, l) => l % 6 === 0), has120: c.pts.some((q) => q.lead === 120), spread, len: c.line.length });
      }
    }
    const fx = {}; for (const id of ids) fx[id] = S.fixesOf(id);
    return { samples, fx };
  });
  const rad = Math.PI / 180, NHC = { 24: 41, 48: 70, 72: 102, 96: 151, 120: 220 };
  const posAt = (fix, T) => { if (!fix || T < fix[0][0] || T > fix[fix.length - 1][0]) return null; for (let i = 1; i < fix.length; i++) if (fix[i][0] >= T) { const a = fix[i - 1], b = fix[i], u = (T - a[0]) / Math.max(1e-9, b[0] - a[0]); return [a[1] + u * (b[1] - a[1]), a[2] + u * (b[2] - a[2])]; } return null; };
  const hd = (a, b) => Math.atan2((b[1] - a[1]) * Math.cos(a[0] * rad), b[0] - a[0]) / rad, dang = (a, b) => ((a - b + 540) % 360) - 180;
  const turnAt = (P) => { const Hd = []; for (let i = 0; i + 2 < P.length; i++) { if (!P[i] || !P[i + 2]) break; Hd.push(hd(P[i], P[i + 2])); } if (Hd.length < 6) return null; for (let i = 1; i < Hd.length; i++) if (Math.abs(dang(Hd[i], Hd[0])) >= 45) return (i + 1) * 6; return null; };
  const cov = {}; for (const l of [24, 48, 72, 96, 120]) cov[l] = [0, 0]; let inN = 0, allN = 0, flips = 0; const terr = [], bend = [], sp24 = [], sp120 = []; let n120 = 0;
  for (const s of R.samples) {
    const PA = [], PC = []; for (let l = 0; l <= 120; l += 6) { PA.push(posAt(R.fx[s.id], s.init + l)); PC.push(s.line[l / 6] || null); }
    for (const l of [24, 48, 72, 96, 120]) { const a = PA[l / 6], c = PC[l / 6]; if (!a || !c) continue; const d = Math.hypot((c[1] - a[1]) * 60 * Math.cos(a[0] * rad), (c[0] - a[0]) * 60); cov[l][1]++; allN++; if (d <= NHC[l]) { cov[l][0]++; inN++; } }
    if (PA.filter(Boolean).length >= 18 && PC.filter(Boolean).length >= 18) { const ta = turnAt(PA), tc = turnAt(PC); if (ta != null && tc != null) terr.push(tc - ta); }
    if (s.spread[0] != null) sp24.push(s.spread[0]); if (s.spread[1] != null) sp120.push(s.spread[1]); if (s.has120) n120++;
    let sg0 = 0; for (let i = 1; i + 1 < s.line.length; i++) {                            // (where the storm moves: a bend between two six-hour legs of at least 60 km; a nearly stalled consensus has no direction to bend)
      const a = s.line[i - 1], b = s.line[i], c = s.line[i + 1], cl = Math.cos(b[0] * rad) * 111.2, u = [(b[1] - a[1]) * cl, (b[0] - a[0]) * 111.2], w = [(c[1] - b[1]) * cl, (c[0] - b[0]) * 111.2];
      if (Math.hypot(...u) >= 60 && Math.hypot(...w) >= 60) { const ang = Math.atan2(u[0] * w[1] - u[1] * w[0], u[0] * w[0] + u[1] * w[1]) / rad; bend.push(Math.abs(ang)); if (Math.abs(ang) > 15) { const sg = Math.sign(ang); if (sg0 && sg !== sg0) flips++; sg0 = sg; } }
    }
  }
  terr.sort((a, b) => a - b); const med = terr[Math.floor(terr.length / 2)], mae = terr.reduce((a, v) => a + Math.abs(v), 0) / terr.length, mean = (x) => x.reduce((a, v) => a + v, 0) / x.length, lowest = Math.min(...Object.values(cov).map((c) => c[0] / Math.max(1, c[1])));
  check(`[${label}] on the page's own weather the real track is in the cone about two thirds of the time: ${(100 * inN / allN).toFixed(0)} % of ${allN} positions (${[24, 48, 72, 96, 120].map((l) => l + ' h ' + Math.round(100 * cov[l][0] / Math.max(1, cov[l][1])) + ' %').join(', ')}) for ${R.samples.length} cones`, R.samples.length >= 40 && allN >= 150 && inN / allN > 0.45 && inN / allN < 0.85 && lowest > 0.35);
  check(`[${label}] and the turns come on time: the consensus turns ${med > 0 ? '+' : ''}${med} h from the real storm's turn in the median, ${mae.toFixed(0)} h on average in ${terr.length} turning cases (late and early alike)`, terr.length >= 20 && Math.abs(med) <= 6 && mae < 22);
  check(`[${label}] the fan is as wide as a forecast's error: ${mean(sp24).toFixed(0)} km at 24 h (the NHC's mean error 75) and ${mean(sp120).toFixed(0)} km at 120 h (the NHC's 410)`, mean(sp24) > 45 && mean(sp24) < 130 && mean(sp120) > 300 && mean(sp120) < 900);
  check(`[${label}] the centre line is smooth on the page's weather: the sharpest bend between two six-hour legs is ${Math.max(...bend).toFixed(0)} degrees over ${bend.length} bends and the line swings back and forth (a bend over 15 degrees the other way) in ${flips} of ${R.samples.length} cones; ${n120} of ${R.samples.length} cones reach their 120-hour point (the others end where the system dissipates over land or leaves the map)`, Math.max(...bend) < 50 && flips <= 0.06 * R.samples.length && n120 >= 0.5 * R.samples.length);
}

// Watches and warnings (one map for every storm, the NHC's colours, solid and sharp, over the land and along the coast) and the wind fields (the radii of the 34, 50 and 64 kt winds, per storm). A hurricane is put in the Gulf and a second storm far out in the
// Atlantic, 105 kt and 70 kt, and run 18 hours so that the wind field has grown into them.
async function checkAlerts(page, label) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const setup = await ev(() => {
    const S = window.SSTSIM; S.setPlaying(false); S.applySeed(4242); S.setPlaying(false); S.storms(true); S.stormAuto(false); S.tick(24 * 100);
    const a = S.stormPlace({ kind: 'td', lat: 25, lon: -90, v: 60 }), b = S.stormPlace({ kind: 'td', lat: 15, lon: -45, v: 60 }); S.tick(6); S.advance(0);
    for (let k = 0; k < 18; k++) { S.stormForce(a, { th: 'tc', v: 105, vr: 105, p: 950 }); S.stormForce(b, { th: 'tc', v: 70, vr: 70, p: 985 }); S.tick(1); S.advance(0); }
    S.stormForce(a, { th: 'tc', v: 105, vr: 105, p: 950 }); S.stormForce(b, { th: 'tc', v: 70, vr: 70, p: 985 });
    const e = document.getElementById('borders'); if (e.checked) e.click();
    const st = S.stormState().systems; return { a, b, A: st.find((x) => x.id === a), B: st.find((x) => x.id === b) };
  });
  const view = (id) => ev((id) => { const S = window.SSTSIM, s = S.stormState().systems.find((x) => x.id === id); S.map.setView([s.lat + 2.5, s.lon], 6, { animate: false }); S.stormDraw(); }, id);
  await view(setup.a); await lyrSet(page, 'stww', true); await page.waitForTimeout(500);
  const cells = await ev(() => { const S = window.SSTSIM, st = S.wwState(), out = { 5: null, 3: null, 1: null, st }; if (!st) return out;
    const [x0, , nx, , cell] = st.box;
    for (let la = 36; la > 26; la -= 0.25) for (let lo = -93; lo < -83; lo += 0.25) {
      if (!S.isLand(la, lo)) continue; const c = S.wwAt(la, lo), around = [[.2, 0], [-.2, 0], [0, .2], [0, -.2]].every(([dy, dx]) => S.wwAt(la + dy, lo + dx) === c && S.isLand(la + dy, lo + dx));
      const key = c === 5 ? 5 : c === 3 ? 3 : c === 1 ? 1 : 0; if (key && !out[key] && around) out[key] = [la, lo];
    }
    return out; });
  const read = (pt) => ev((pt) => { const S = window.SSTSIM, p = S.placePx(pt[0], pt[1]), c = document.getElementById('storm-canvas'), d = c.width / c.clientWidth, a = c.getContext('2d').getImageData(Math.round(p.x * d), Math.round(p.y * d), 1, 1).data; return { p, c: [a[0], a[1], a[2], a[3]] }; }, pt);
  const px5 = cells[5] ? await read(cells[5]) : null, px3 = cells[3] ? await read(cells[3]) : null, px1 = cells[1] ? await read(cells[1]) : null, same = (c, r) => c && c.c[0] === r[0] && c.c[1] === r[1] && c.c[2] === r[2] && c.c[3] === 255;
  check(`[${label}] with Watches & warnings on, a hurricane about to make landfall has a hurricane warning inland (${cells[5]}: ${px5 && px5.c.join(',')}, solid red), tropical storm warning around it (${cells[3]}: ${px3 && px3.c.join(',')}, solid blue) and a tropical storm watch beyond (${cells[1]}: ${px1 && px1.c.join(',')}, solid yellow); cells ${JSON.stringify(cells.st && cells.st.counts)}`,
    !!cells[5] && !!cells[3] && !!cells[1] && same(px5, [255, 26, 26]) && same(px3, [42, 82, 255]) && same(px1, [255, 238, 0]));
  // sharp: along a line over the land across the colours every pixel is a colour of the key at full strength (no blur), none is see-through
  const sharp = cells[5] ? await ev(({ la, lo }) => { const S = window.SSTSIM, p0 = S.placePx(la, lo), c = document.getElementById('storm-canvas'), d = c.width / c.clientWidth, y = Math.round(p0.y * d), x0 = Math.max(0, Math.round((p0.x - 330) * d)), w = Math.min(c.width - x0, Math.round(660 * d)), a = c.getContext('2d').getImageData(x0, y, w, 1).data;
    const key = ['255,26,26', '42,82,255', '255,238,0', '255,143,200', '218,165,32'], seen = {}, odd = []; for (let i = 0; i < w; i++) { const k = a[i * 4] + ',' + a[i * 4 + 1] + ',' + a[i * 4 + 2], al = a[i * 4 + 3]; if (!al) continue; seen[k] = (seen[k] || 0) + 1; if (al !== 255 || !key.includes(k)) odd.push(k + '/' + al); }
    return { seen, odd: odd.length, ex: odd.slice(0, 4) }; }, { la: cells[5][0], lo: cells[5][1] }) : null;
  check(`[${label}] and the colours are solid and sharp: along a line over the land ${sharp ? Object.keys(sharp.seen).length : 0} colours of the key (${sharp ? Object.entries(sharp.seen).map(([k, v]) => k + 'x' + v).join(' ') : ''}), ${sharp ? sharp.odd : '-'} pixels blended or see-through (${sharp ? sharp.ex.join(' ') : ''})`, !!sharp && Object.keys(sharp.seen).length >= 3 && sharp.odd === 0);
  const hv = cells[5] ? await (async () => { const q = await ev((pt) => window.SSTSIM.placePx(pt[0], pt[1]), cells[5]); await page.mouse.move(q.x + 30, q.y + 30); await page.mouse.move(q.x, q.y, { steps: 4 }); await page.waitForTimeout(200); return ev(() => { const t = document.getElementById('storm-tip'); return { shown: t.style.display === 'block', title: t.querySelector('b').textContent, body: t.querySelector('div').innerText.replace(/\n/g, ' | ') }; }); })() : null;
  check(`[${label}] hovering the warned land names the alert and its time (${hv && hv.title} | ${hv && hv.body})`, !!hv && hv.shown && hv.title === 'Hurricane Warning' && /hurricane conditions are expected within 36 hours/.test(hv.body) && /issued \d\dz [A-Z][a-z]{2} \d+ \d{4}/.test(hv.body));
  const key1 = await ev(() => { const w = document.getElementById('ww-legend'); return { shown: getComputedStyle(w).display !== 'none', text: w.innerText.replace(/\s+/g, ' '), wf: getComputedStyle(document.getElementById('wf-legend')).display }; });
  check(`[${label}] the small key shows only while the layer is on and has the NHC's names and the high wind warning ("${key1.text}"; the wind field's key stays hidden: ${key1.wf})`, key1.shown && /Hurricane Watch/.test(key1.text) && /Tropical Storm Watch/.test(key1.text) && /Hurricane Warning/.test(key1.text) && /Tropical Storm Warning/.test(key1.text) && /High Wind Warning/.test(key1.text) && /Hurricane Watch \+ TS Warning/.test(key1.text) && /Issued \d\dZ/.test(key1.text) && key1.wf === 'none');
  // not per storm: picking the hurricane (or the other storm) leaves the alerts as they are, and both storms are in them
  const before = await ev(() => window.SSTSIM.wwState()), qa = await ev((id) => window.SSTSIM.stormPx(id), setup.a);
  await page.mouse.click(qa.x, qa.y); await page.waitForTimeout(300);
  const picked = await ev(() => ({ st: window.SSTSIM.wwState(), sel: !document.getElementById('storm-card').hidden })), px5b = cells[5] ? await read(cells[5]) : null;
  check(`[${label}] the alerts are not per storm: with the hurricane picked they are the same map (${JSON.stringify(picked.st && picked.st.counts)} against ${JSON.stringify(before && before.counts)}, ${picked.st && picked.st.n} storms in it, the card ${picked.sel ? 'open' : 'closed'}) and the warning is still painted (${px5b && px5b.c.join(',')})`,
    picked.sel && picked.st.n === 2 && before.n === 2 && JSON.stringify(picked.st.counts) === JSON.stringify(before.counts) && same(px5b, [255, 26, 26]));
  await page.keyboard.press('Escape'); await lyrSet(page, 'stww', false); await page.waitForTimeout(150);
  const off = await ev(() => ({ st: window.SSTSIM.wwState(), leg: getComputedStyle(document.getElementById('ww-legend')).display })), px5c = cells[5] ? await read(cells[5]) : null;
  check(`[${label}] with the layer off nothing is painted (${px5c && px5c.c.join(',')}) and there is no key (${off.leg})`, off.st === null && off.leg === 'none' && px5c && px5c.c[3] === 0);

  // the wind fields: the radii of the strong winds are a third and a half of the 34 kt radius, painted round the picked storm only (or each when none is)
  const rad = await ev((id) => window.SSTSIM.windRadiiOf(id), setup.a), radB = await ev((id) => window.SSTSIM.windRadiiOf(id), setup.b);
  await lyrSet(page, 'stwf', true);
  const wfProbe = (id, f) => ev(({ id, f }) => { const S = window.SSTSIM, s = S.stormState().systems.find((x) => x.id === id), R = S.windRadiiOf(id), r = R.r34[0] * f, p = S.placePx(s.lat + (r * Math.SQRT1_2) / 60, s.lon + (r * Math.SQRT1_2) / (60 * Math.cos(s.lat * Math.PI / 180))), c = document.getElementById('storm-canvas'), d = c.width / c.clientWidth, a = c.getContext('2d').getImageData(Math.round(p.x * d), Math.round(p.y * d), 1, 1).data; return { c: [a[0], a[1], a[2], a[3]], r }; }, { id, f });
  await view(setup.a); await page.waitForTimeout(100);
  const aIn = await wfProbe(setup.a, 0.8), aOut = await wfProbe(setup.a, 1.3);
  await view(setup.b); const bIn = await wfProbe(setup.b, 0.8);
  await view(setup.a); const qa2 = await ev((id) => window.SSTSIM.stormPx(id), setup.a); await page.mouse.click(qa2.x, qa2.y); await page.waitForTimeout(300);
  const aSel = await wfProbe(setup.a, 0.8); await view(setup.b); const bBlind = await wfProbe(setup.b, 0.8);
  check(`[${label}] a hurricane's wind field is the NHC's: R34 / R50 / R64 ${rad.r34[0]} / ${rad.r50[0]} / ${rad.r64[0]} nmi in the north-east quadrant (${(rad.r50[0] / rad.r34[0]).toFixed(2)} and ${(rad.r64[0] / rad.r34[0]).toFixed(2)} of R34: the profile, not a fixed share), larger ahead and to the right than behind (${rad.r34.join('/')} NE SE SW NW), and the 70 kt storm's strong end is no larger (${radB.r64[0]} nmi of R64 against ${rad.r64[0]})`,
    rad.r64[0] / rad.r34[0] > 0.15 && rad.r64[0] / rad.r34[0] < 0.5 && rad.r50[0] / rad.r34[0] > 0.3 && rad.r50[0] / rad.r34[0] < 0.7 && rad.r64[0] > 10 && rad.r34.every((x) => x > 30) && Math.max(...rad.r34) > 1.05 * Math.min(...rad.r34) && radB.r64[0] <= 1.5 * rad.r64[0] && radB.r34[0] > 20);
  check(`[${label}] and it is painted round the storm and nowhere else: inside the 34 kt radius ${aIn.c.join(',')} (coloured), outside ${aOut.c.join(',')} (clear); with no storm picked each has one (${aIn.c[3] > 100}, ${bIn.c[3] > 100}), with the hurricane picked it still has its own (${aSel.c[3] > 100}) and the other storm has none (${bBlind.c.join(',')})`,
    aIn.c[3] > 100 && aOut.c[3] === 0 && bIn.c[3] > 100 && aSel.c[3] > 100 && bBlind.c[3] === 0);
  const kf = await ev(() => ({ wf: getComputedStyle(document.getElementById('wf-legend')).display, text: document.getElementById('wf-legend').innerText.replace(/\s+/g, ' ') }));
  check(`[${label}] the wind field has its own small key while it is on ("${kf.text}")`, kf.wf === 'block' && /Hurricane force/.test(kf.text) && /Tropical storm force/.test(kf.text));
  await page.keyboard.press('Escape'); await lyrSet(page, 'stwf', false); const e = await ev(() => { const b = document.getElementById('borders'); if (!b.checked) b.click(); return 1; });
}

async function checkEnsoHold(page, label) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const r = await ev(() => {
    const S = window.SSTSIM, out = {}; S.setPlaying(false); S.applySeed(31337); S.setPlaying(false);
    const chk = document.getElementById('enso-hold'), sl = document.getElementById('p-ensonow');
    const setSlider = (v) => { sl.value = String(v); sl.dispatchEvent(new Event('input')); };
    const setHold = (on) => { chk.checked = on; chk.dispatchEvent(new Event('change')); };
    out.exists = !!chk; out.startsOff = !!chk && !chk.checked && S.enso().hold === false;
    setSlider(2.5); S.tick(24 * 300); out.freeDrift = Math.abs(S.enso().n34 - 2.5);       // without the box, a set value drifts away
    S.applySeed(31337); S.setPlaying(false); setSlider(2.5); setHold(true); out.heldNow = S.enso().held;
    S.tick(24 * 400); const e = S.enso(); out.held400 = e.n34; out.lag3 = e.lag3; out.lag6 = e.lag6; out.label = document.getElementById('enso-l').textContent;
    out.sliderLabel = document.getElementById('p-ensonow-o').textContent;
    setSlider(-1.5); S.tick(24 * 100); out.moved = S.enso().n34;
    setHold(false); const r0 = S.enso().n34; S.tick(24 * 400); out.releasedStart = r0; out.releasedDrift = Math.abs(S.enso().n34 - r0); out.releasedFlag = S.enso().hold;
    setSlider(2.0); setHold(true); S.applySeed(777); const e2 = S.enso(); out.restart = [e2.n34, e2.lag3, e2.lag6, e2.hold]; S.tick(24 * 200); out.restartAfter = S.enso().n34;
    // engaging the box with no slider move freezes the gauge where it reads
    setHold(false); S.applySeed(4); S.tick(24 * 60); const g0 = S.enso().n34; setHold(true); S.tick(24 * 90); out.freezeAt = [g0, S.enso().n34, parseFloat(sl.value)];
    setHold(false); S.restart();
    return out;
  });
  check(`[${label}] "Keep ENSO at this value" checkbox exists and starts unchecked`, r.exists && r.startsOff);
  check(`[${label}] without it, a set ENSO value drifts away (moved ${r.freeDrift.toFixed(2)} in 300 days)`, r.freeDrift > 0.05);
  check(`[${label}] with it, Niño 3.4 stays exactly at the value set (${r.held400} after 400 days)`, r.heldNow === 2.5 && r.held400 === 2.5);
  check(`[${label}] a held event reaches the lagged (3 and 6 month) terms too, so the fields get its full effect (${r.lag3}, ${r.lag6})`, r.lag3 === 2.5 && r.lag6 === 2.5);
  check(`[${label}] the gauge says the value is held ("${r.label}")`, /held/.test(r.label) && /El Niño/.test(r.label));
  check(`[${label}] moving the slider while held changes the held value (${r.moved})`, r.moved === -1.5);
  check(`[${label}] unticking hands ENSO back to the oscillator, which moves again (${r.releasedStart} -> moved ${r.releasedDrift.toFixed(2)})`, r.releasedFlag === false && r.releasedStart === -1.5 && r.releasedDrift > 0.02);
  check(`[${label}] a held ENSO survives restart and a new seed: starts in the regime, lagged terms included (${r.restart.join(', ')}; ${r.restartAfter} after 200 days)`, r.restart[0] === 2 && r.restart[1] === 2 && r.restart[2] === 2 && r.restart[3] === true && r.restartAfter === 2);
  check(`[${label}] ticking the box with no slider move freezes the index where the gauge reads (${r.freezeAt[0].toFixed(3)} -> ${r.freezeAt[1].toFixed(3)}, slider ${r.freezeAt[2]})`, r.freezeAt[0] === r.freezeAt[1] && Math.abs(r.freezeAt[2] - r.freezeAt[0]) <= 0.05 + 1e-9);
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Steering arrows and highs. Every basin gets the same checks from its own spec. The real-data figures behind the thresholds are in docs/roadmap.md ("Steering arrows and highs");
// each threshold was set from many seeds and dates (the sim is deterministic per seed, and these checks use fixed seeds), not from the one run it happened to pass on.
//   dataFile, calibFile   the merged data file (it carries DATA.steer) and the real variance targets
//   view                  fitBounds window for the pixel checks (viewport 1280x800), in the map's longitude frame (the South Pacific runs 160..240)
//   hover                 an open-ocean point for the readout, and the centre of the zoomed-in check
//   pts                   named points: trop (the trades / tropical easterlies), sub (the subtropics, where El Nino's jet response is measured), jet (under the mid-latitude westerlies),
//                         far (high latitude, for the pressure response); names are what the check messages call them; extra are more points for the smoothness check
//   hem, latBands, lonRange   the hemisphere, the |latitude| bands and the longitude sector the variance budget is checked in
//   ensoU                 the least deep-layer westerly response (El Nino minus La Nina, kt) at sub / trop / jet: above it if positive, below it if negative; pFarSign: sign of the pressure response at far
//   jet                   the jet-ribbon check: season, longitudes, |latitude| window of the axis, hemisphere sign, and the REAL composite on the real axis (along-axis kt, degrees off, share within 45 degrees,
//                         stripe = least drop 10 degrees off the axis: one number, or [poleward, equatorward] with 0 where the real wind does not fall off, stripeReal = the real drops; no stripe
//                         where the box is too small for samples 10 degrees off the axis; alongTol = [low, high] factors on the real along-axis wind, default [0.85, 1.15]; withinTol = how far below the real share within 45 degrees, default 0.02);
//                         null where the jet is too far outside the box to measure
//   highsReal             real highs a day [north, south] per calendar month on the page's node grid (the page's own rule on the real daily pressure of 2017-2021); highsP: pressure percentiles
//                         (tools/real_steer_highs.py and tools/real_steer_axis.py produce these real figures); highsMin: the fewest highs expected across the sampled states
//   options, only where a basin needs them (the defaults are the Atlantic's):
//     iconMin     highs wanted in view for the icon checks (default 3; 0 skips them: the North Indian Ocean and the Mediterranean have a high one day in ten)
//     ppBand      the |latitude| band the size of the travelling pressure is checked in (default 30-60; a tropical or enclosed basin has no such band)
//     seasBands   the bands the seasonal cycle of the year-to-year spread is checked in (default: the 2nd and 3rd of latBands)
//     varTol      tolerances of the variance budget: deep / shallow simulated-over-real standard deviation, the weather-off ratios, the seasonal-cycle difference
//     biasTol     tolerances of the mean-wind checks: mean (floor of the grid-mean bias; the check also allows 3.5 standard errors), z, max, sys (left over after the sampling noise), seeds
//     noTrades    the layers check skips its trade-wind half (the Mediterranean has none)
// The numbers in the specs are the simulated climate of that basin, not tuning knobs.
const STEER_SPECS = {
  atlantic: {
    dataFile: 'data.json', calibFile: 'atlantic-steer-calib.json',
    view: [[6, -102], [62, 4]], hover: [18, -50],
    pts: { trop: [15, -50], sub: [25, -90], jet: [45, -40], far: [60, -20] },
    names: { trop: 'the tropical Atlantic', sub: 'the Gulf of Mexico', jet: '45N 40W', far: '60N 20W' },
    extra: [[35, -60], [30, -40], [55, -30]],
    hem: 1, latBands: [[15, 25], [25, 35], [35, 45], [45, 60]], lonRange: [-100, 0],
    ensoU: { sub: 2.5, trop: -0.8, jet: 2.0 }, pFarSign: -1,
    jet: { months: [6, 7, 8, 9, 10, 11], lon: [-80, -20], lat: [25, 58], hem: 1, label: 'June-November', along: 34.4, ang: 16, within: 0.8, stripe: 10 },
    highsReal: { 1: [4.73, 1.85], 4: [4.78, 2.59], 7: [4.45, 3.12], 10: [4.85, 1.88] },
    highsP: { p10: [1017, 1020.5], p50: [1021.5, 1026], p90: [1028, 1039], real: '1018.6/1023.4/1032.2' }, highsMin: 50,
  },
  eastpacific: {
    dataFile: 'eastpacific-data.json', calibFile: 'eastpacific-steer-calib.json',
    view: [[0, -170], [45, -75]], hover: [14, -118],
    pts: { trop: [6, -156], sub: [30, -156], jet: [34, -148], far: [46, -172] },
    names: { trop: '6N 156W', sub: '30N 156W', jet: '34N 148W', far: '46N 172W' },
    extra: [[24, -120], [40, -128], [14, -100]],
    hem: 1, latBands: [[10, 20], [20, 30], [30, 40], [40, 50]], lonRange: [-170, -75],
    ensoU: { sub: 14, trop: -7, jet: 10 }, pFarSign: -1, varTol: { cells: { 'd8/30-40': 1.2 } },
    jet: { months: [5, 6, 7, 8, 9, 10, 11], lon: [-170, -80], lat: [25, 40], hem: 1, label: 'May-November', along: 24.9, ang: 22, within: 0.74, stripe: [3, 9], stripeReal: [7.3, 18.9] },
    highsReal: { 1: [2.60, 0.00], 4: [1.88, 0.01], 7: [2.49, 0.01], 10: [2.14, 0.00] },
    highsP: { p10: [1017, 1020.5], p50: [1022, 1027], p90: [1028.5, 1039], real: '1018.5/1024.8/1032.7' }, highsMin: 50,
  },
  westpacific: {
    dataFile: 'westpacific-data.json', calibFile: 'westpacific-steer-calib.json',
    view: [[0, 106], [48, 178]], hover: [14, 134],
    pts: { trop: [4, 140], sub: [36, 172], jet: [40, 154], far: [48, 176] },
    names: { trop: '4N 140E', sub: '36N 172E', jet: '40N 154E', far: '48N 176E' },
    extra: [[20, 120], [30, 150], [12, 160]],
    hem: 1, latBands: [[10, 20], [20, 30], [30, 40], [40, 50]], lonRange: [106, 174],
    ensoU: { sub: 8, trop: 3.5, jet: 3 }, pFarSign: -1, biasTol: { sys: { u_deep: 3.8, u_shallow: 2.4 } },
    jet: { months: [6, 7, 8, 9, 10, 11, 12], lon: [104, 176], lat: [25, 44], hem: 1, label: 'June-December', along: 42.7, ang: 8, within: 0.95, stripe: [10, 13], stripeReal: [20.9, 27.5] },
    highsReal: { 1: [1.38, 0], 4: [1.61, 0], 7: [0.50, 0], 10: [1.92, 0] },
    highsP: { p10: [1017, 1020.5], p50: [1022, 1027], p90: [1028.5, 1039], real: '1018.9/1024.6/1033.3' }, highsMin: 30, iconMin: 2,
  },
  nio: {
    dataFile: 'nio-data.json', calibFile: 'nio-steer-calib.json',
    view: [[-4, 36], [28, 96]], hover: [12, 66],
    pts: { trop: [0, 86], sub: [20, 62], jet: [24, 62], far: [28, 86] },
    names: { trop: '0N 86E', sub: '20N 62E', jet: '24N 62E', far: '28N 86E' },
    extra: [[10, 50], [20, 76], [6, 70]],
    hem: 1, latBands: [[8, 16], [16, 24], [24, 32]], lonRange: [38, 94],
    ensoU: { sub: 3.5, trop: -2.5, jet: 2.5 }, pFarSign: 1, ppBand: [16, 28], varTol: { cells: { 'd8/24-32': 1.35 } },
    jet: { months: [4, 5, 6, 10, 11, 12], lon: [34, 96], lat: [22, 30], hem: 1, label: 'April-June and October-December', along: 31.9, ang: 10, within: 0.95, stripe: null, stripeReal: [14.9, 23.2] },
    highsReal: { 1: [0.14, 0], 4: [0, 0], 7: [0, 0], 10: [0.02, 0] },
    highsP: null, highsMin: 0, iconMin: 0,
  },
  aus: {
    dataFile: 'aus-data.json', calibFile: 'aus-steer-calib.json',
    view: [[-40, 94], [0, 172]], hover: [-14, 110],
    pts: { trop: [0, 106], sub: [-20, 106], jet: [-40, 146], far: [-12, 98] },
    hoverJet: [-37, 146],                     // the pointer test's spot: the jet point itself sits on the bottom edge of the view, which the dock (Place and the clock's buttons) covers
    names: { trop: '0N 106E', sub: '20S 106E', jet: '40S 146E', far: '12S 98E' },
    extra: [[-24, 120], [-30, 150], [-16, 160]],
    hem: -1, latBands: [[10, 20], [20, 30], [30, 40]], lonRange: [98, 168],
    ensoU: { sub: 3, trop: -2, jet: 3 }, pFarSign: 1,
    jet: { months: [11, 12, 1, 2, 3, 4], lon: [94, 172], lat: [25, 38], hem: -1, label: 'November-April', along: 28.1, ang: 15, within: 0.88, stripe: [0, 10], stripeReal: [2.6, 21.9] },
    highsReal: { 1: [0, 0.56], 4: [0, 1.15], 7: [0, 1.43], 10: [0, 1.05] },
    highsP: { p10: [1017, 1021], p50: [1022, 1027], p90: [1027.5, 1038], real: '1019.0/1023.8/1030.5' }, highsMin: 30, iconMin: 1,
  },
  swio: {
    dataFile: 'swio-data.json', calibFile: 'swio-steer-calib.json',
    view: [[-40, 34], [-2, 104]], hover: [-16, 70],
    pts: { trop: [-4, 86], sub: [-18, 62], jet: [-38, 56], far: [-16, 94] },
    names: { trop: '4S 86E', sub: '18S 62E', jet: '38S 56E', far: '16S 94E' },
    extra: [[-28, 50], [-12, 40], [-32, 90]],
    hem: -1, latBands: [[10, 20], [20, 30], [30, 40]], lonRange: [38, 100],
    ensoU: { sub: 3.5, trop: -2.5, jet: 1.2 }, pFarSign: 1,
    jet: { months: [11, 12, 1, 2, 3, 4], lon: [34, 104], lat: [25, 38], hem: -1, label: 'November-April', along: 26.0, ang: 18, within: 0.83, stripe: [0, 10], stripeReal: [-1.0, 20.1] },
    highsReal: { 1: [0, 0.86], 4: [0, 0.90], 7: [0, 1.32], 10: [0, 1.19] },
    highsP: { p10: [1019, 1022.5], p50: [1024, 1029], p90: [1029, 1040], real: '1020.8/1026.5/1033.0' }, highsMin: 30, iconMin: 1,
  },
  spac: {
    dataFile: 'spac-data.json', calibFile: 'spac-steer-calib.json',
    view: [[-36, 164], [-2, 236]], hover: [-16, 190],
    pts: { trop: [0, 204], sub: [-24, 208], jet: [-28, 205], far: [-32, 224] },
    names: { trop: '0N 156W', sub: '24S 152W', jet: '28S 155W', far: '32S 136W' },
    extra: [[-20, 175], [-10, 215], [-30, 185]],
    hem: -1, latBands: [[10, 20], [20, 30], [30, 40]], lonRange: [168, 232],
    ensoU: { sub: 14, trop: -7, jet: 9 }, pFarSign: -1,
    jet: { months: [11, 12, 1, 2, 3, 4], lon: [164, 236], lat: [25, 36], hem: -1, label: 'November-April', along: 25.8, ang: 14, within: 0.85, withinTol: 0.07, stripe: [5, 7], stripeReal: [10.0, 15.5] },
    highsReal: { 1: [0, 0.20], 4: [0, 0.22], 7: [0, 0.55], 10: [0, 0.46] },
    highsP: null, highsMin: 10, iconMin: 1,
  },
  satl: {
    dataFile: 'satl-data.json', calibFile: 'satl-steer-calib.json',
    view: [[-38, -46], [-2, 16]], hover: [-20, -20],
    pts: { trop: [-4, -34], sub: [-20, -30], jet: [-36, -34], far: [-4, -30] },
    names: { trop: '4S 34W', sub: '20S 30W', jet: '36S 34W', far: '4S 30W' },
    extra: [[-28, -10], [-12, -40], [-32, 0]],
    hem: -1, latBands: [[8, 16], [16, 24], [24, 32]], lonRange: [-42, 12],
    ensoU: { sub: -3.5, trop: 3.5, jet: 7 }, pFarSign: 1,
    jet: { months: [11, 12, 1, 2, 3, 4], lon: [-46, 16], lat: [22, 36], hem: -1, label: 'November-April', along: 29.5, ang: 16, within: 0.86, stripe: [0, 10], stripeReal: [3.5, 21.7] },
    highsReal: { 1: [0, 0.46], 4: [0, 0.44], 7: [0, 1.03], 10: [0, 0.61] },
    highsP: { p10: [1017, 1021], p50: [1022, 1026.5], p90: [1027.5, 1038], real: '1019.2/1023.4/1030.7' }, highsMin: 20, iconMin: 1,
  },
  med: {
    dataFile: 'med-data.json', calibFile: 'med-steer-calib.json',
    view: [[31, -9], [47, 41]], hover: [36, 15],
    pts: { trop: [36, 30], sub: [44, -2], jet: [41, 6], far: [48, -10] },
    names: { trop: '36N 30E', sub: '44N 2W', jet: '41N 6E', far: '48N 10W' },
    extra: [[40, 0], [36, 20], [34, 36]],
    hem: 1, latBands: [[36, 44]], seasBands: [[36, 44]], lonRange: [-4, 36],
    ensoU: { sub: 5.5, trop: -3, jet: 2.5 }, pFarSign: -1, ppBand: [36, 44], noTrades: true, biasTol: { seeds: 90 },
    jet: { months: [9, 10, 11, 12, 1], lon: [-8, 40], lat: [32, 46], hem: 1, label: 'September-January', along: 27.1, ang: 21, within: 0.75, alongTol: [0.85, 1.3], stripe: null, stripeReal: [11.8, 17.0] },
    highsReal: { 1: [0.13, 0], 4: [0.11, 0], 7: [0, 0], 10: [0.11, 0] },
    highsP: null, highsMin: 0, iconMin: 0,
  },
};

const b64i16 = (s) => { const b = Buffer.from(s, 'base64'); return new Int16Array(b.buffer, b.byteOffset, b.length >> 1); };
const cubicW = (t) => { const t2 = t * t, t3 = t2 * t; return [-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1, -1.5 * t3 + 2 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2]; };
// the real monthly climatology of one steering field at a date, blended exactly as the page does (4 months, cubic)
function steerClimAt(steer, iso, field) {
  const SN = steer.domain.nx * steer.domain.ny, F = steer.fields.length, f = steer.fields.indexOf(field);
  const clim = steer._clim || (steer._clim = b64i16(steer.clim));
  const d = new Date(iso), y = d.getUTCFullYear(), doy = (d.getTime() - Date.UTC(y, 0, 1)) / 86400000, ylen = ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365;
  const p = doy / ylen * 12 - 0.5, m1 = Math.floor(p), w = cubicW(p - m1), M = (x) => ((x % 12) + 12) % 12, out = new Float64Array(SN);
  for (let k = 0; k < 4; k++) { const o = (M(m1 - 1 + k) * F + f) * SN; for (let q = 0; q < SN; q++) out[q] += w[k] * (clim[o + q] / 10 + (field === 'mslp' ? 1000 : 0)); }
  return out;
}

async function checkSteering(page, label, S) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const quant = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
  const dataJson = JSON.parse(readFileSync(join(ROOT, 'data/generated', S.dataFile), 'utf8')), steer = dataJson.steer;
  // the simulated box's own edges in the map's longitude frame (where the field raster, the jet line and the arrows fade out), and the node grid's (where the highs are looked for)
  const box = { lon0: dataJson.domain.lon0, lon1: dataJson.domain.lon0 + (dataJson.domain.nx - 1) * dataJson.domain.res, lat1: dataJson.domain.lat1, lat0: dataJson.domain.lat1 - (dataJson.domain.ny - 1) * dataJson.domain.res };
  const calib = JSON.parse(readFileSync(join(ROOT, 'data/generated', S.calibFile), 'utf8'));
  const NX = steer.domain.nx, NY = steer.domain.ny, SN = NX * NY;
  const interior = []; for (let j = 2; j < NY - 2; j++) for (let i = 2; i < NX - 2; i++) interior.push(j * NX + i);
  const nodeLat = (q) => steer.domain.lat1 - Math.floor(q / NX) * steer.domain.res, nodeLon = (q) => steer.domain.lon0 + (q % NX) * steer.domain.res;
  // (the node grid stops up to 3 degrees short of the box's far edges, and a box across the date line runs 160..240 in the map's frame)
  const dom = { lon0: steer.domain.lon0, lon1: steer.domain.lon0 + (NX - 1) * steer.domain.res, lat1: steer.domain.lat1, lat0: steer.domain.lat1 - (NY - 1) * steer.domain.res };
  await ev(() => { const X = window.SSTSIM; X.setPlaying(false); X.applySeed(4242); X.setPlaying(false); });

  // ---- 1. the controls
  const ui = () => ev(() => {
    const vis = (id) => getComputedStyle(document.getElementById(id)).display !== 'none';
    return { arrows: document.getElementById('steerarrows').checked, highs: document.getElementById('highs').checked, legend: vis('steer-legend'),
      pressed: [...document.querySelectorAll('#seg-depth button')].map((b) => b.dataset.d + ':' + b.getAttribute('aria-pressed')).join(','), cap: document.getElementById('steer-cap').textContent,
      ticks: [...document.querySelectorAll('#steer-ticks span')].map((s) => s.textContent).join(' ') };
  });
  check(`[${label}] every floating card is a direct child of the page, so the playback dock, the toast and the attribution show while the steering legend is hidden (its markup is closed)`, await ev(() => ['clock', 'panel', 'readout', 'legend', 'steer-legend', 'toast', 'city-tip', 'attr', 'dock'].every((id) => document.getElementById(id).parentElement === document.body) && (() => { const d = document.getElementById('dock'), r = d.getBoundingClientRect(); return getComputedStyle(d).display !== 'none' && r.width > 100 && r.height > 20; })()));
  const u0 = await ui();
  check(`[${label}] "Steering arrows" and "Highs" checkboxes exist and start unchecked; the speed legend starts hidden`, u0.arrows === false && u0.highs === false && !u0.legend);
  check(`[${label}] the storm-strength selector lives in Experimentation > Advanced (not in Customization), always shown there whether or not the arrows are on`, await ev(() => { const r = document.getElementById('steer-depth-row'); return !!r && !!r.closest('#xp-adv') && !r.closest('#sec-custom') && getComputedStyle(r).display !== 'none'; }));
  // the selector sits in the Advanced tab: show it (a real click on a hidden button would wait forever) before using it
  const pickDepth = async (d) => { await ev(() => { document.getElementById('sec-exp').classList.remove('collapsed'); window.SSTSIM.setXpTab('adv'); }); await page.click(`#seg-depth button[data-d="${d}"]`); };
  await lyrSet(page, 'highs', true);
  const uH = await ui();
  check(`[${label}] ticking only "Highs" does not bring up the steering legend`, uH.highs && !uH.legend);
  await lyrSet(page, 'highs', false);
  await lyrSet(page, 'steerarrows', true);
  const uA = await ui();
  check(`[${label}] ticking "Steering arrows" shows the speed legend, and Strong is the storm strength selected`, uA.legend && uA.pressed === 'shallow:false,medium:false,deep:true');
  check(`[${label}] the legend names the layer and unit, and runs 0 to 70+ kt ("${uA.cap}"; ticks ${uA.ticks})`, uA.cap === 'Steering speed, strong storms (850–200 hPa), kt' && uA.ticks === '0 10 20 30 40 50 60 70+');
  const caps = {};
  for (const [d, cap] of [['shallow', 'Steering speed, weak storms (850–700 hPa), kt'], ['medium', 'Steering speed, medium storms (850–500 hPa), kt'], ['deep', 'Steering speed, strong storms (850–200 hPa), kt']]) {
    await pickDepth(d);
    const u = await ui(); caps[d] = u.cap === cap && u.pressed.split(',').filter((x) => x.endsWith(':true')).join() === d + ':true';
  }
  check(`[${label}] each storm-strength button selects its layer and renames the legend (weak 850-700, medium 850-500, strong 850-200 hPa)`, caps.shallow && caps.medium && caps.deep);
  const ends = await ev(() => { const c = document.getElementById('steer-legend-canvas'), g = c.getContext('2d'); return [...g.getImageData(0, 5, 1, 1).data].slice(0, 3).concat([...g.getImageData(c.width - 1, 5, 1, 1).data].slice(0, 3)); });
  check(`[${label}] the legend colour runs from indigo at 0 kt (${ends.slice(0, 3)}) to white-hot at 70+ kt (${ends.slice(3)})`, ends[2] >= 200 && ends[0] <= 140 && ends[3] >= 240 && ends[4] >= 200 && ends[5] >= 220);
  check(`[${label}] the day-to-day slider's label says it drives shear, steering and highs, and the speed slider's says jet, steering and highs`, await ev(() => document.querySelector('label[for="p-wxs"]').textContent === 'Day-to-day weather (shear, steering, highs)' && document.querySelector('label[for="p-jets"]').textContent === 'Weather speed (jet, steering, highs)'));
  check(`[${label}] there is no separate high-strength control (the shared day-to-day slider is the only one)`, await ev(() => !document.querySelector('#panel input[id*="high"][type="range"]')));

  // ---- 2. the arrows on the real pixels of their canvas
  await ev((view) => { window.SSTSIM.map.fitBounds(view, { animate: false }); }, S.view);
  const inkOf = () => ev(() => { const c = document.getElementById('steer-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n; });
  await lyrSet(page, 'steerarrows', false); await page.waitForTimeout(150);
  const ink0 = await inkOf();
  check(`[${label}] nothing is drawn on the steering canvas while both boxes are off (${ink0} painted pixels)`, ink0 === 0);
  await lyrSet(page, 'steerarrows', true); await page.waitForTimeout(250);
  const arrows = await ev(() => window.SSTSIM.steerArrows());
  const ink1 = await inkOf();
  check(`[${label}] arrows fill the map once ticked (${arrows.length} arrows, ${ink1} painted pixels)`, arrows.length >= 60 && arrows.length <= 600 && ink1 > 20000);
  let nearest = 1e9; for (let i = 0; i < arrows.length; i++) for (let j = i + 1; j < arrows.length; j++) nearest = Math.min(nearest, Math.hypot(arrows[i].x - arrows[j].x, arrows[i].y - arrows[j].y));
  check(`[${label}] the arrows sit on a lattice that keeps them apart (closest pair ${nearest.toFixed(0)} px)`, nearest >= 38);
  const edgeDeg = (a) => Math.min(a.lon - box.lon0, box.lon1 - a.lon, a.lat - box.lat0, box.lat1 - a.lat);
  const pan = await ev(() => { const b = window.SSTSIM.map.options.maxBounds; return { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() }; });
  const panGap = Math.min(pan.w - box.lon0, box.lon1 - pan.e, pan.s - box.lat0, box.lat1 - pan.n);
  check(`[${label}] arrows fade out over the outer 6 degrees of the simulated box, like the field raster does: each arrow's opacity is its distance to the box's edge over 6 degrees, at most 1 (${arrows.filter((a) => a.alpha < 1).length} of ${arrows.length} faded; the map's pan limits are ${panGap.toFixed(0)} degrees from the edge)`, arrows.every((a) => Math.abs(a.alpha - Math.min(1, Math.max(0, edgeDeg(a)) / 6)) < 1e-9) && arrows.every((a) => edgeDeg(a) > 0));
  const sampled = await ev((as) => as.slice(0, 40).map((a) => { const s = window.SSTSIM.steerAt(a.lat, a.lon); return Math.hypot(s.u - a.u, s.v - a.v); }), arrows);
  check(`[${label}] each arrow carries exactly the wind steerAt() reports at its latitude and longitude (largest difference ${Math.max(...sampled).toExponential(1)} kt)`, Math.max(...sampled) < 1e-3);

  // colour = speed, direction = heading: read the pixels at each arrow's centre and at the two wings of its head / the two points behind it
  const W = 1280, H = 800;
  const real = arrows.filter((a) => a.alpha === 1 && !a.calm && a.speed >= 6 && a.x > 24 && a.y > 24 && a.x < W - 24 && a.y < H - 24);
  const step = Math.max(1, Math.floor(real.length / 60)), tested = real.filter((_, i) => i % step === 0);
  const want = await ev((sp) => sp.map((s) => window.SSTSIM.steerColorOf(s)), tested.map((a) => a.speed));
  // The head is the one part of an arrow wider than its shaft, so the fill-coloured pixels more than 2.4 px off the shaft's line, ahead of the centre, are the
  // head's wings: they must exist, lie in the direction of the wind, and nothing of the kind may sit behind the centre.
  const shape = await ev(([as, wants]) => {
    const c = document.getElementById('steer-canvas'), g = c.getContext('2d'), s = c.width / c.clientWidth, out = [];
    as.forEach((a, k) => {
      const R = 22, X0 = Math.round(a.x * s) - R, Y0 = Math.round(a.y * s) - R, img = g.getImageData(X0, Y0, 2 * R, 2 * R).data, w = wants[k].match(/\d+/g).map(Number);
      const t = Math.atan2(-a.v, a.u), cs = Math.cos(t), sn = Math.sin(t); let centre = 0, ahead = 0, behind = 0, sx = 0, sy = 0;
      for (let j = 0; j < 2 * R; j++) for (let i = 0; i < 2 * R; i++) {
        const q = (j * 2 * R + i) * 4; if (img[q + 3] < 230 || Math.max(Math.abs(img[q] - w[0]), Math.abs(img[q + 1] - w[1]), Math.abs(img[q + 2] - w[2])) > 40) continue;
        const rx = (X0 + i + 0.5) / s - a.x, ry = (Y0 + j + 0.5) / s - a.y, al = rx * cs + ry * sn, pe = -rx * sn + ry * cs;
        if (Math.abs(rx) < 1 && Math.abs(ry) < 1) centre++;
        if (Math.abs(pe) < 2.4) continue;
        if (al > 3) { ahead++; sx += rx; sy += ry; } else if (al < -3) behind++;
      }
      let d = ahead ? Math.atan2(sy, sx) - t : NaN; d = Math.atan2(Math.sin(d), Math.cos(d));
      out.push({ centre, ahead, behind, dev: Math.abs(d) * 180 / Math.PI });
    });
    return out;
  }, [tested, want]);
  const colourOk = shape.filter((r) => r.centre >= 1).length, headOk = shape.filter((r) => r.ahead >= 12 && r.behind <= 3 && r.dev <= 15).length;
  check(`[${label}] arrow colour is its speed: ${colourOk} of ${tested.length} arrows are painted, at their centre, in the colour the legend gives that speed`, tested.length >= 20 && colourOk >= 0.9 * tested.length);
  check(`[${label}] arrow direction is the wind's: ${headOk} of ${tested.length} arrows have the head's wings ahead of the centre, on the wind's heading (median ${quant(shape.map((r) => r.dev), 50).toFixed(1)} deg off), and none behind it`, headOk >= 0.9 * tested.length);
  const speeds = arrows.map((a) => a.speed);
  check(`[${label}] the speeds on screen span calm trades to a fast jet (${quant(speeds, 5).toFixed(1)} to ${quant(speeds, 95).toFixed(1)} kt, 5th to 95th percentile)`, quant(speeds, 5) < 8 && quant(speeds, 95) > 25);

  for (const v of ['anom', 'humid', 'shear']) {
    await ev((vv) => window.SSTSIM.setView(vv), v); await page.waitForTimeout(250);
    const n = await inkOf();
    check(`[${label}] the arrows are drawn in the ${v} view too (${n} vs ${ink1} painted pixels in the temperature view)`, n > 0.85 * ink1 && n < 1.15 * ink1);
  }
  await ev(() => window.SSTSIM.setView('sst'));
  await page.uncheck('#show-sst'); await page.waitForTimeout(250);
  const inkNoSst = await inkOf(), lowLegend = await ev(() => document.getElementById('steer-legend').classList.contains('low'));
  check(`[${label}] arrows and their legend stay with "Show sea temperature" off (${inkNoSst} painted pixels; the legend moves down into the freed corner)`, inkNoSst > 0.85 * ink1 && lowLegend);
  await page.check('#show-sst'); await page.waitForTimeout(150);
  await ev((c) => window.SSTSIM.map.setView(c, 7, { animate: false }), S.hover); await page.waitForTimeout(250);
  const zoomed = await ev(() => window.SSTSIM.steerArrows());
  check(`[${label}] zoomed in, the lattice keeps its spacing in pixels, so there are fewer, finer-spaced arrows (${zoomed.length} vs ${arrows.length})`, zoomed.length > 15 && zoomed.length < arrows.length);
  await ev((view) => window.SSTSIM.map.fitBounds(view, { animate: false }), S.view); await page.waitForTimeout(200);

  // the arrows follow the clock while the sim plays and hold still when it is paused
  await lyrSet(page, 'steerarrows', true);
  const hashOf = () => ev(() => { const c = document.getElementById('steer-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + 3 * d[i + 1] + 7 * d[i + 2] + 11 * d[i + 3]) | 0; return h; });
  await ev(() => window.SSTSIM.setPlaying(true));
  const h0 = await hashOf(), tA = await ev(() => window.SSTSIM.state().simHour);
  await page.waitForTimeout(3000);
  const h1 = await hashOf(), tB = await ev(() => window.SSTSIM.state().simHour);
  await ev(() => window.SSTSIM.setPlaying(false)); await page.waitForTimeout(400);
  const h2 = await hashOf(); await page.waitForTimeout(500); const h3 = await hashOf();
  check(`[${label}] the arrows redraw as the clock runs (${tB - tA} simulated hours; the picture changed: ${h0 !== h1}) and stand still when it is paused (${h2 === h3})`, tB - tA >= 8 && h0 !== h1 && h2 === h3);   // 1x is ~17 simulated hours a second, but a slow machine drops frames (the clock catches up at most 250 ms per frame)

  // ---- 3. the readout under the pointer
  await ev(([view]) => { const X = window.SSTSIM; X.applySeed(4242); X.setPlaying(false); X.advance(24 * 103); X.map.fitBounds(view, { animate: false }); }, [S.view]);   // a fixed state: mid-September, a fast jet at the hover point
  await page.waitForTimeout(200);
  const hoverAt = async (c) => {
    const p = await ev((ll) => { const q = window.SSTSIM.map.latLngToContainerPoint(ll); return { x: q.x, y: q.y }; }, c);
    await page.mouse.move(p.x - 3, p.y - 3); await page.mouse.move(p.x, p.y); await page.waitForTimeout(150);
    return { p, ll: await ev(([x, y]) => { const l = window.SSTSIM.map.containerPointToLatLng([x, y]); return [l.lat, l.lng]; }, [p.x, p.y]), text: await ev(() => document.getElementById('readout').textContent) };
  };
  const readSteer = (t) => { const m = t.match(/Steering toward (\d+)° \(([A-Z]+)\) at (\d+) kt/); return m ? { dir: +m[1], card: m[2], kt: +m[3] } : null; };
  let hv = await hoverAt(S.hoverJet || S.pts.jet);
  let want2 = await ev((ll) => ({ deep: window.SSTSIM.steerAt(ll[0], ll[1], 'deep'), shallow: window.SSTSIM.steerAt(ll[0], ll[1], 'shallow'), p: window.SSTSIM.pressureAt(ll[0], ll[1]) }), hv.ll);
  await pickDepth('deep'); await page.mouse.move(hv.p.x + 2, hv.p.y); await page.mouse.move(hv.p.x, hv.p.y); await page.waitForTimeout(100);
  hv = { ...hv, text: await ev(() => document.getElementById('readout').textContent) };
  let rs = readSteer(hv.text);
  check(`[${label}] the readout gives the steering heading (as a compass bearing) and speed at the pointer ("${hv.text.replace(/\s+/g, ' ').slice(-60)}")`, rs && Math.abs(rs.kt - want2.deep.speed) <= 1 && Math.min(Math.abs(rs.dir - want2.deep.toward), 360 - Math.abs(rs.dir - want2.deep.toward)) <= 2);
  await lyrSet(page, 'highs', false);
  check(`[${label}] with only the arrows on, the readout has no pressure line`, !/Sea-level pressure/.test(await ev(() => document.getElementById('readout').textContent)));
  await lyrSet(page, 'highs', true);
  await page.mouse.move(hv.p.x + 2, hv.p.y); await page.mouse.move(hv.p.x, hv.p.y); await page.waitForTimeout(100);
  const pm = (await ev(() => document.getElementById('readout').textContent)).match(/Sea-level pressure (\d+) hPa/);
  check(`[${label}] with Highs on, the readout also gives the sea-level pressure there (${pm && pm[1]} hPa; the model has ${want2.p.toFixed(1)})`, pm && Math.abs(+pm[1] - want2.p) <= 0.6);
  await pickDepth('shallow'); await page.mouse.move(hv.p.x + 2, hv.p.y); await page.mouse.move(hv.p.x, hv.p.y); await page.waitForTimeout(100);
  const rsw = readSteer(await ev(() => document.getElementById('readout').textContent));
  check(`[${label}] choosing weak storms makes the readout (and arrows) follow the shallow layer (${rsw && rsw.kt} kt vs ${want2.deep.speed.toFixed(0)} kt strong there)`, rsw && Math.abs(rsw.kt - want2.shallow.speed) <= 1 && Math.abs(want2.shallow.speed - want2.deep.speed) > 2);
  await pickDepth('deep');
  await lyrSet(page, 'steerarrows', false); await page.mouse.move(hv.p.x + 2, hv.p.y); await page.mouse.move(hv.p.x, hv.p.y); await page.waitForTimeout(100);
  const onlyHighs = await ev(() => document.getElementById('readout').textContent);
  check(`[${label}] with only Highs on, the readout has the pressure but no steering line`, /Sea-level pressure/.test(onlyHighs) && !/Steering/.test(onlyHighs));
  await lyrSet(page, 'highs', false); await page.mouse.move(hv.p.x + 2, hv.p.y); await page.mouse.move(hv.p.x, hv.p.y); await page.waitForTimeout(100);
  const none = await ev(() => document.getElementById('readout').textContent);
  check(`[${label}] with both off, the readout has neither`, !/Steering|Sea-level pressure/.test(none));

  // ---- 4. the model, with the page paused and fixed seeds. First, the real climate mean is kept (zero-mean anomalies, ribbon minus its own mean).
  // 30 seeds x 6 samples per season (S.biasTol.seeds for a basin with a small grid); the mean of a seed's samples is one independent draw, so the spread of those means gives the sampling noise the comparison with the real climate has to be judged against
  // (a basin with few nodes, like the Mediterranean's 10, has a much noisier grid mean than the Atlantic's 600).
  const winds = [['u_deep', 'deep', 'u'], ['v_deep', 'deep', 'v'], ['u_shallow', 'shallow', 'u'], ['mslp', 'deep', 'p']];
  const bias = {}; for (const [f] of winds) bias[f] = { mean: [], se: [], sys: [], noise: [], zmax: [], max: [] };
  const BT = Object.assign({ mean: 0.7, z: 5.5, max: 14, seeds: 30 }, S.biasTol || {}); BT.sys = Object.assign({ u_deep: 2.5, v_deep: 1.8, u_shallow: 1.8, mslp: 1.0 }, (S.biasTol || {}).sys);   // mean: floor of the grid-mean tolerance (it is the larger of this and 3.5 standard errors)
  for (const d0 of [10, 100, 214, 304]) {
    const r = await ev(([d0, seeds, nsamp, inter]) => {
      const X = window.SSTSIM; X.setPlaying(false); const per = [], dates = [];
      for (let s = 1; s <= seeds; s++) {
        X.applySeed(7000 + s); X.setPlaying(false); X.tick(24 * d0); const acc = {};
        for (let k = 0; k < nsamp; k++) {
          X.tick(24 * 3 + 5); const d = X.steerNodes('deep'), sh = X.steerNodes('shallow'), cur = { u_deep: d.u, v_deep: d.v, u_shallow: sh.u, mslp: d.p };
          for (const f of Object.keys(cur)) { if (!acc[f]) acc[f] = new Float64Array(inter.length); for (let i = 0; i < inter.length; i++) acc[f][i] += cur[f][inter[i]] / nsamp; }
          if (s === 1) dates.push(X.state().date);
        }
        per.push(Object.fromEntries(Object.entries(acc).map(([f, a]) => [f, Array.from(a)])));
      }
      return { per, dates };
    }, [d0, BT.seeds, 6, interior]);
    for (const [f] of winds) {
      const rc = new Float64Array(SN); for (const iso of r.dates) { const x = steerClimAt(steer, iso, f); for (let q = 0; q < SN; q++) rc[q] += x[q] / r.dates.length; }
      const n = r.per.length, nodeMean = interior.map((_, i) => mean(r.per.map((p) => p[f][i]))), dif = interior.map((q, i) => nodeMean[i] - rc[q]);
      const nodeVar = interior.map((_, i) => r.per.reduce((a, p) => a + (p[f][i] - nodeMean[i]) ** 2, 0) / (n - 1) / n);   // variance of the 30-seed mean at each node
      const g = r.per.map((p) => mean(interior.map((q, i) => p[f][i] - rc[q])));                                          // one grid-mean bias per seed
      const gm = mean(g), gse = Math.sqrt(g.reduce((a, x) => a + (x - gm) ** 2, 0) / (n - 1) / n), rms2 = mean(dif.map((x) => x * x)), noise2 = mean(nodeVar);
      bias[f].mean.push(gm); bias[f].se.push(gse); bias[f].sys.push(Math.sqrt(Math.max(0, rms2 - noise2))); bias[f].noise.push(Math.sqrt(noise2));
      bias[f].zmax.push(Math.max(...dif.map((x, i) => Math.abs(x) / Math.sqrt(nodeVar[i])))); bias[f].max.push(Math.max(...dif.map(Math.abs)));
    }
  }
  const worst = (a) => Math.max(...a.map(Math.abs));
  const meanOk = (f) => bias[f].mean.every((m, i) => Math.abs(m) < Math.max(BT.mean, 3.5 * bias[f].se[i]));
  const maxSe = (f) => Math.max(...bias[f].se);
  check(`[${label}] the simulated mean winds are the real climatology: mean bias over the grid at most ${worst(bias.u_deep.mean).toFixed(2)} (u) / ${worst(bias.v_deep.mean).toFixed(2)} (v) kt deep, ${worst(bias.u_shallow.mean).toFixed(2)} kt shallow (sampling error of those means up to ${Math.max(maxSe('u_deep'), maxSe('v_deep'), maxSe('u_shallow')).toFixed(2)} kt), over four seasons of ${BT.seeds} seeds`, meanOk('u_deep') && meanOk('v_deep') && meanOk('u_shallow'));
  check(`[${label}] ...node by node the mean winds are within sampling noise of it (what is left after the noise: ${Math.max(...bias.u_deep.sys).toFixed(1)} / ${Math.max(...bias.v_deep.sys).toFixed(1)} / ${Math.max(...bias.u_shallow.sys).toFixed(1)} kt rms for u deep / v deep / u shallow, noise itself up to ${Math.max(...bias.u_deep.noise).toFixed(1)} / ${Math.max(...bias.v_deep.noise).toFixed(1)} / ${Math.max(...bias.u_shallow.noise).toFixed(1)}; the worst node of each is ${['u_deep', 'v_deep', 'u_shallow'].map((f) => Math.max(...bias[f].max).toFixed(1) + ' kt = ' + Math.max(...bias[f].zmax).toFixed(1) + ' standard errors').join(' / ')} off)`, Math.max(...bias.u_deep.sys) < BT.sys.u_deep && Math.max(...bias.v_deep.sys) < BT.sys.v_deep && Math.max(...bias.u_shallow.sys) < BT.sys.u_shallow && ['u_deep', 'v_deep', 'u_shallow'].every((f) => Math.max(...bias[f].zmax) < BT.z && Math.max(...bias[f].max) < BT.max));
  check(`[${label}] the simulated mean sea-level pressure is the real climatology (mean bias at most ${worst(bias.mslp.mean).toFixed(2)} hPa against a sampling error of ${maxSe('mslp').toFixed(2)}; ${Math.max(...bias.mslp.sys).toFixed(2)} hPa rms left node by node after the noise of ${Math.max(...bias.mslp.noise).toFixed(2)})`, meanOk('mslp') && Math.max(...bias.mslp.sys) < BT.sys.mslp && Math.max(...bias.mslp.zmax) < BT.z);

  // ---- 5. the variance budget: year-to-year + day-to-day, per calendar month and latitude band, against the real figures (calib: real interannual variance of the monthly
  // means + real day-to-day variance, u^2 + v^2 summed). A run is sampled at the middle of each calendar month, 4 times 3 days apart, over 24 seeds.
  const MONTHS = [2, 5, 8, 11];
  const sampleMonths = (weather) => ev(([months, seeds, SNn, weather]) => {
    const X = window.SSTSIM; X.setPlaying(false); X.applySeed(1); X.setPlaying(false);
    const t0 = new Date(X.state().date), visits = [];
    for (const m of months) { let t = Date.UTC(t0.getUTCFullYear(), m - 1, 15); if (t < t0.getTime() + 6 * 864e5) t = Date.UTC(t0.getUTCFullYear() + 1, m - 1, 15); visits.push({ m, day: Math.round((t - t0.getTime()) / 864e5) }); }
    visits.sort((a, b) => a.day - b.day);
    const acc = {}; for (const v of visits) acc[v.m] = { sum: new Float64Array(4 * SNn), sq: new Float64Array(4 * SNn), pp2: new Float64Array(SNn), n: 0 };
    for (let s = 1; s <= seeds; s++) {
      X.applySeed(6100 + s); X.setPlaying(false); X.set('shearSynoptic', weather); let cur = 0;
      for (const v of visits) {
        X.tick(24 * (v.day - 5 - cur)); cur = v.day - 5;
        for (let k = 0; k < 4; k++) {
          X.tick(72); cur += 3; const d = X.steerNodes('deep'), sh = X.steerNodes('shallow'), a = acc[v.m], comp = [sh.u, sh.v, d.u, d.v];
          for (let c = 0; c < 4; c++) for (let q = 0; q < SNn; q++) { const x = comp[c][q]; a.sum[c * SNn + q] += x; a.sq[c * SNn + q] += x * x; }
          for (let q = 0; q < SNn; q++) a.pp2[q] += d.pp[q] * d.pp[q];
          a.n++;
        }
      }
    }
    X.set('shearSynoptic', 1);
    return Object.fromEntries(Object.entries(acc).map(([m, a]) => [m, { sum: Array.from(a.sum), sq: Array.from(a.sq), pp2: Array.from(a.pp2), n: a.n }]));
  }, [MONTHS, 24, SN, weather]);
  const bud = await sampleMonths(1), slow = await sampleMonths(0);
  const sigP = b64i16(steer.weather.sigP);
  const bandNodes = (b) => interior.filter((q) => Math.abs(nodeLat(q)) >= b[0] && Math.abs(nodeLat(q)) < b[1] && nodeLon(q) >= S.lonRange[0] && nodeLon(q) <= S.lonRange[1] && S.hem * nodeLat(q) > 0);
  const ratios = { shallow: [], deep: [] }, cellTxt = [], cellOf = { shallow: {}, deep: {} }, VT = Object.assign({ deep: [0.88, 1.15], shallow: [0.85, 1.18], slow: [0.7, 1.4], seas: 0.2, cells: {} }, S.varTol || {});   // VT.cells: single month x band cells allowed above the usual upper bound, e.g. { 'd8/24-32': 1.35 }
  for (const m of MONTHS) {
    const a = bud[m];
    for (const b of S.latBands) {
      const nodes = bandNodes(b);
      for (const [li, name] of [[0, 'shallow'], [1, 'deep']]) {
        let simV = 0, tgtV = 0;
        for (const q of nodes) {
          for (const c of (li ? [2, 3] : [0, 1])) simV += (a.sq[c * SN + q] - a.sum[c * SN + q] ** 2 / a.n) / (a.n - 1);
          tgtV += calib.varInt[m - 1][li][q] + calib.varDaily[m - 1][li][q];
        }
        const r = Math.sqrt(simV / tgtV); ratios[name].push(r); cellTxt.push(`${name[0]}${m}/${b[0]}-${b[1]} ${r.toFixed(2)}`); cellOf[name][`${name[0]}${m}/${b[0]}-${b[1]}`] = r;
      }
    }
  }
  const varOk = (name) => Object.entries(cellOf[name]).every(([c, r]) => r > VT[name][0] && r < (VT.cells[c] === undefined ? VT[name][1] : VT.cells[c]));
  const exempt = Object.keys(VT.cells).length ? ` (only ${Object.entries(VT.cells).map(([c, v]) => c + ' may run to ' + v).join(', ')}, a sharp seasonal minimum, see docs/roadmap.md)` : '';
  check(`[${label}] deep-layer winds are as variable as the real ones in every season and latitude band: simulated/real standard deviation ${Math.min(...ratios.deep).toFixed(2)} to ${Math.max(...ratios.deep).toFixed(2)} over ${ratios.deep.length} month x band cells (was up to 1.6 in August before the seasonal calibration)${exempt}${varOk('deep') ? '' : ' [cells: ' + cellTxt.filter((t) => t[0] === 'd').join(', ') + ']'}`, varOk('deep'));
  check(`[${label}] ...and so are the weak-storm (shallow) winds (${Math.min(...ratios.shallow).toFixed(2)} to ${Math.max(...ratios.shallow).toFixed(2)})${varOk('shallow') ? '' : ' [cells: ' + cellTxt.filter((t) => t[0] === 's').join(', ') + ']'}`, varOk('shallow'));
  const ppRatio = [];
  for (const m of [2, 8]) { const nodes = bandNodes(S.ppBand || [30, 60]); const sim = Math.sqrt(mean(nodes.map((q) => bud[m].pp2[q] / bud[m].n))), tgt = mean(nodes.map((q) => sigP[(m - 1) * SN + q] / 100)); ppRatio.push(sim / tgt); }
  check(`[${label}] the travelling pressure highs and lows have the real size by season (rms of P' over ${(S.ppBand || [30, 60]).join('-')} degrees: ${(ppRatio[0] * 100).toFixed(0)}% / ${(ppRatio[1] * 100).toFixed(0)}% of the real figure in February / August)`, ppRatio.every((r) => r > 0.88 && r < 1.12));
  // the slow part alone (weather off): each month's year-to-year spread is the real one, and its seasonal cycle -- small in August, large in winter -- is kept
  const slowStd = (m, b, li) => { const a = slow[m], nodes = bandNodes(b); let v = 0, t = 0; for (const q of nodes) { for (const c of (li ? [2, 3] : [0, 1])) v += (a.sq[c * SN + q] - a.sum[c * SN + q] ** 2 / a.n) / (a.n - 1); t += calib.varInt[m - 1][li][q]; } return [Math.sqrt(v / nodes.length), Math.sqrt(t / nodes.length)]; };
  const slowRatios = []; for (const m of MONTHS) for (const b of S.latBands) { const [x, y] = slowStd(m, b, 1); slowRatios.push(x / y); }
  const seasBands = S.seasBands || S.latBands.slice(1, 3);
  const seas = seasBands.map((b) => { const feb = slowStd(2, b, 1), aug = slowStd(8, b, 1); return [aug[0] / feb[0], aug[1] / feb[1]]; });
  check(`[${label}] with the weather off, each month's year-to-year spread of the deep winds is the real one (simulated/real ${Math.min(...slowRatios).toFixed(2)} to ${Math.max(...slowRatios).toFixed(2)} over ${slowRatios.length} month x band cells)`, Math.min(...slowRatios) > VT.slow[0] && Math.max(...slowRatios) < VT.slow[1]);
  check(`[${label}] ...and keeps its seasonal cycle: August's spread is ${seas.map((x) => (x[0] * 100).toFixed(0) + '%').join(' / ')} of February's at ${seasBands.map((b) => b[0] + '-' + b[1]).join(' / ')} degrees (real ${seas.map((x) => (x[1] * 100).toFixed(0) + '%').join(' / ')}; pooled EOFs would give 100%)`, seas.every((x) => Math.abs(x[0] - x[1]) < VT.seas * Math.max(1, x[1])));

  // ---- 6. ENSO moves the steering the way the real atmosphere's teleconnection does. ENSO is held at +2 and -2 (the new checkbox), the year-to-year EOFs and the day-to-day weather
  // are switched off so only the ENSO response is left, and the run goes 190 days so the 3- and 6-month lagged terms are fully in.
  const ensoRun = (v) => ev(([v, pts, far]) => {
    const X = window.SSTSIM; X.setPlaying(false); X.applySeed(777); X.setPlaying(false); X.set('variability', 0); X.set('shearSynoptic', 0);
    const chk = document.getElementById('enso-hold'), sl = document.getElementById('p-ensonow');
    sl.value = String(v); sl.dispatchEvent(new Event('input')); chk.checked = true; chk.dispatchEvent(new Event('change'));
    X.tick(24 * 190);
    const out = {}; for (const [k, ll] of Object.entries(pts)) out[k] = X.steerAt(ll[0], ll[1], 'deep').u;
    out.p = X.pressureAt(far[0], far[1]);
    chk.checked = false; chk.dispatchEvent(new Event('change')); X.set('variability', 1); X.set('shearSynoptic', 1);
    return out;
  }, [v, S.pts, S.pts.far]);
  const nino = await ensoRun(2), nina = await ensoRun(-2);
  const dEnso = (k) => nino[k] - nina[k], passEnso = (d, x) => (x >= 0 ? d > x : d < x);   // a spec value is the least change expected: above it if positive, below it if negative
  check(`[${label}] a held El Nino moves the deep-layer westerlies over ${S.names.sub} by ${dEnso('sub').toFixed(1)} kt (El Nino minus La Nina; ${S.ensoU.sub >= 0 ? 'stronger' : 'weaker'}, as the real response is)`, passEnso(dEnso('sub'), S.ensoU.sub));
  check(`[${label}] ...over ${S.names.trop} by ${dEnso('trop').toFixed(1)} kt (${S.ensoU.trop >= 0 ? 'stronger' : 'weaker'})`, passEnso(dEnso('trop'), S.ensoU.trop));
  check(`[${label}] ...at ${S.names.jet} by ${dEnso('jet').toFixed(1)} kt (${S.ensoU.jet >= 0 ? 'stronger' : 'weaker'})`, passEnso(dEnso('jet'), S.ensoU.jet));
  check(`[${label}] ...and sea-level pressure at ${S.names.far} by ${(nino.p - nina.p).toFixed(2)} hPa (${S.pFarSign < 0 ? 'lower' : 'higher'})`, S.pFarSign * (nino.p - nina.p) > 1.0);
  await ev(() => { window.SSTSIM.applySeed(4242); window.SSTSIM.setPlaying(false); });

  // ---- 7. the highs: what they are, where, how strong, and how they move. The counts are per calendar month and hemisphere against the real ones: the page's own rule applied to the real
  // daily-mean pressure of 2017-2021 on the same node grid (S.highsReal = [north, south] highs a day; docs/roadmap.md has the table), and the pressure percentiles likewise (S.highsP).
  const HM = Object.keys(S.highsReal).map(Number), MN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hi = await ev(([seeds, months, dom]) => {
    const X = window.SSTSIM; X.setPlaying(false); X.applySeed(8100); X.setPlaying(false); const res = {}, p0 = new Date(X.state().date);   // (a run starts on the basin's own start date: read it from a fresh run, not from wherever the last check left the clock)
    for (const m of months) {
      let t = Date.UTC(p0.getUTCFullYear(), m - 1, 15); if (t < p0.getTime() + 6 * 864e5) t = Date.UTC(p0.getUTCFullYear() + 1, m - 1, 15);
      const d0 = Math.round((t - p0.getTime()) / 864e5) - 5, nh = [], sh = [], ps = [], proms = []; let bad = 0, unsorted = 0;
      for (let s = 1; s <= seeds; s++) {
        X.applySeed(8100 + s); X.setPlaying(false); X.tick(24 * d0);
        for (let k = 0; k < 3; k++) {
          X.tick(24 * 4 + 5); const hs = X.highs();
          nh.push(hs.filter((h) => h.lat > 0).length); sh.push(hs.filter((h) => h.lat < 0).length);
          for (let i = 0; i < hs.length; i++) { const h = hs[i]; ps.push(h.p); proms.push(h.prom); if (h.p < 1017 || Math.abs(h.lat) < 15 || h.prom < 2.5 || h.lon < dom.lon0 || h.lon > dom.lon1 || h.lat > dom.lat1 || h.lat < dom.lat0) bad++; if (i && hs[i - 1].p < h.p) unsorted++; }
        }
      }
      res[m] = { nh, sh, ps, proms, bad, unsorted };
    }
    return res;
  }, [12, HM, dom]);
  const hiTxt = (hem) => HM.map((m) => `${MN[m]} ${mean(hi[m][hem]).toFixed(1)} (real ${S.highsReal[m][hem === 'nh' ? 0 : 1].toFixed(1)})`).join(', ');
  const countOk = (hem) => HM.every((m) => { const sim = mean(hi[m][hem]), real = S.highsReal[m][hem === 'nh' ? 0 : 1]; return real < 0.3 ? Math.abs(sim - real) < 0.5 : sim > 0.7 * real - 0.2 && sim < 1.5 * real + 0.2; });
  const allHi = HM.flatMap((m) => hi[m].ps);
  check(`[${label}] highs are found by one rule everywhere: at least 1017 hPa, standing 2.5 hPa above their surroundings, outside 15 degrees, inside the grid, strongest first (${HM.reduce((a, m) => a + hi[m].bad + hi[m].unsorted, 0)} violations in ${allHi.length} highs)`, HM.every((m) => hi[m].bad === 0 && hi[m].unsorted === 0) && allHi.length >= S.highsMin);
  check(`[${label}] the number of highs a day in the northern part of the grid is the real one, month by month: ${hiTxt('nh')}`, countOk('nh'));
  check(`[${label}] ...and in the southern part: ${hiTxt('sh')}`, countOk('sh'));
  if (S.highsP) check(`[${label}] central pressures are the real ones (10th/50th/90th percentile ${quant(allHi, 10).toFixed(1)}/${quant(allHi, 50).toFixed(1)}/${quant(allHi, 90).toFixed(1)} hPa; real ${S.highsP.real})`, quant(allHi, 10) > S.highsP.p10[0] && quant(allHi, 10) < S.highsP.p10[1] && quant(allHi, 50) > S.highsP.p50[0] && quant(allHi, 50) < S.highsP.p50[1] && quant(allHi, 90) > S.highsP.p90[0] && quant(allHi, 90) < S.highsP.p90[1]);
  // highs drift, they do not jump: the same high an hour later is within a degree or two, so each keeps one icon
  const drift = await ev(() => {
    const X = window.SSTSIM, d = []; X.setPlaying(false);
    for (const seed of [11, 4242, 90210]) {
      X.applySeed(seed); X.setPlaying(false); X.tick(24 * 30); let prev = X.highs();
      for (let h = 0; h < 24 * 6; h++) {
        X.tick(1); const cur = X.highs();
        for (const a of cur) { let best = 1e9; for (const b of prev) best = Math.min(best, Math.hypot(a.lat - b.lat, (a.lon - b.lon) * Math.cos(a.lat * Math.PI / 180))); if (prev.length) d.push(best); }
        prev = cur;
      }
    }
    return d;
  });
  if (drift.length >= 50) check(`[${label}] highs drift, they do not jump: an hour later the nearest high is ${quant(drift, 50).toFixed(2)} degrees away (median; 95th percentile ${quant(drift, 95).toFixed(1)}; the rest are highs being born), well inside the 14 degrees an icon follows its high`, quant(drift, 50) < 0.5 && quant(drift, 95) < 2);   // (a basin that has hardly any highs, like the Mediterranean, has nothing to follow)
  // the highs' circulation: air goes clockwise round northern highs and counter-clockwise round southern ones, in both layers (highs well inside the grid, so the ring of samples 8 degrees out stays inside it)
  const circ = await ev(([seeds, dom]) => {
    const X = window.SSTSIM, DEG = Math.PI / 180; X.setPlaying(false); const out = { nh: { shallow: [], deep: [] }, sh: { shallow: [], deep: [] } };
    for (let s = 1; s <= seeds; s++) {
      X.applySeed(3000 + s); X.setPlaying(false); X.tick(24 * (60 + 11 * s));
      for (let k = 0; k < 4; k++) {
        X.tick(24 * 3 + 4);
        for (const h of X.highs()) {
          if (Math.abs(h.lat) < 25 || Math.abs(h.lat) > 55 || h.prom < 4 || h.lon < dom.lon0 + 15 || h.lon > dom.lon1 - 13 || h.lat > dom.lat1 - 2 || h.lat < dom.lat0 + 2) continue;
          const sg = h.lat > 0 ? 1 : -1;
          for (const layer of ['shallow', 'deep']) {
            let sum = 0, n = 0;
            for (let a = 0; a < 16; a++) {
              const th = a * Math.PI / 8, dy = 8 * Math.cos(th), dx = 8 * Math.sin(th), la = h.lat + dy, lo = h.lon + dx / Math.cos(h.lat * DEG);
              if (la > dom.lat1 || la < dom.lat0 || lo < dom.lon0 || lo > dom.lon1) continue;
              const v = X.steerAt(la, lo, layer), rr = Math.hypot(dx, dy); sum += (v.u * dy - v.v * dx) / rr; n++;   // clockwise tangential component
            }
            if (n >= 12) out[sg > 0 ? 'nh' : 'sh'][layer].push(sg * sum / n);
          }
        }
      }
    }
    return out;
  }, [20, dom]);
  const cs = (h, l) => ({ n: circ[h][l].length, m: mean(circ[h][l]), pos: circ[h][l].filter((x) => x > 0).length / Math.max(1, circ[h][l].length) });
  const nhS = cs('nh', 'shallow'), nhD = cs('nh', 'deep'), shS = cs('sh', 'shallow'), shD = cs('sh', 'deep');
  const circOk = (a, b) => a.n < 25 || (a.m > 7 && b.m > 6 && a.pos > 0.8 && b.pos > 0.65);   // a hemisphere with fewer than 25 well-placed highs in 20 runs is not tested
  if (nhS.n + shS.n >= 25) check(`[${label}] the arrows circulate round the northern highs the way real ones do (8 degrees out: ${nhS.m.toFixed(1)} kt weak / ${nhD.m.toFixed(1)} kt strong storms, anticyclonic round ${(nhS.pos * 100).toFixed(0)}% / ${(nhD.pos * 100).toFixed(0)}% of ${nhS.n} highs; real Atlantic 11.7 kt, 98% / 88%)`, circOk(nhS, nhD));
  if (nhS.n + shS.n >= 25) check(`[${label}] ...and the other way round the southern ones (${shS.m.toFixed(1)} / ${shD.m.toFixed(1)} kt, ${(shS.pos * 100).toFixed(0)}% / ${(shD.pos * 100).toFixed(0)}% of ${shS.n} highs)`, circOk(shS, shD));

  // ---- 8. the jet ribbon: the arrows hug the jet. Along the simulated jet axis (the line the "Jet stream line" option draws), in the season and sector of S.jet, the deep-layer steering
  // points along the axis and is strongest on it; S.jet.along / ang / within are the real composite on the real axis (same months, sector and sampling), measured from the ERA5 daily fields.
  if (S.jet) {
    const J = S.jet;
    const rib = await ev(([seeds, J, dom]) => {
      const X = window.SSTSIM, DEG = Math.PI / 180; X.setPlaying(false); X.applySeed(2000); X.setPlaying(false); const along = [], ang = [], n10 = [], s10 = [], p0 = new Date(X.state().date), hem = J.hem;   // p0: the start date of a fresh run -- every sample below restarts from it, so the season is counted from there
      const ok = (d) => J.months.includes(new Date(p0.getTime() + d * 864e5).getUTCMonth() + 1);
      let d0 = 0; while (!ok(d0) && d0 < 365) d0++; let len = 0; while (ok(d0 + len) && len < 366) len++;     // the first stretch of the season: runs may start inside it
      const inside = (la, lo) => la <= dom.lat1 && la >= dom.lat0 && lo >= dom.lon0 && lo <= dom.lon1;
      for (let s = 1; s <= seeds; s++) {
        X.applySeed(2000 + s); X.setPlaying(false); X.tick(24 * (d0 + Math.floor((s - 1) * Math.max(0, len - 26) / Math.max(1, seeds - 1))));
        for (let k = 0; k < 3; k++) {
          X.tick(24 * 8 + 3);
          for (let lon = J.lon[0]; lon <= J.lon[1]; lon += 4) {
            const a = X.jetLatLive(lon), am = X.jetLatLive(lon - 4), ap = X.jetLatLive(lon + 4);
            if (a * hem < J.lat[0] || a * hem > J.lat[1]) continue;
            const slope = (ap - am) / 8, c = Math.cos(a * DEG), nn = Math.hypot(c, slope), tx = c / nn, ty = slope / nn, v = X.steerAt(a, lon, 'deep');
            along.push(v.u * tx + v.v * ty);
            let d = Math.abs(Math.atan2(v.v, v.u) - Math.atan2(ty, tx)) / DEG; if (d > 180) d = 360 - d; ang.push(d);
            if (inside(a + 10 * hem, lon) && inside(a - 10 * hem, lon)) { const vn = X.steerAt(a + 10 * hem, lon, 'deep'), vs = X.steerAt(a - 10 * hem, lon, 'deep'); n10.push(vn.u * tx + vn.v * ty); s10.push(vs.u * tx + vs.v * ty); }
          }
        }
      }
      return { along, ang, n10, s10 };
    }, [30, J, dom]);
    const ribMean = mean(rib.along), ribWithin = rib.ang.filter((x) => x < 45).length / rib.ang.length, aTol = J.alongTol || [0.85, 1.15];   // alongTol: where the simulated jet axis wanders more than the real one, the composite on it runs high (see the caveats in docs/roadmap.md)
    check(`[${label}] the deep-layer steering on the simulated jet axis (${J.label}, ${rib.along.length} samples) is ${ribMean.toFixed(1)} kt along it (real composite ${J.along}), median ${quant(rib.ang, 50).toFixed(0)} deg off its direction (real ${J.ang}), ${(ribWithin * 100).toFixed(0)}% within 45 deg (real ${(J.within * 100).toFixed(0)}%)`, rib.along.length > 100 && ribMean > aTol[0] * J.along && ribMean < aTol[1] * J.along && quant(rib.ang, 50) < J.ang + 10 && ribWithin > J.within - (J.withinTol === undefined ? 0.02 : J.withinTol));
    // a side is tested only where the real wind falls off there: [poleward, equatorward] minimum drop in kt, 0 = not tested (south of the traced axis the real westerlies keep growing poleward in the southern basins)
    const sp = Array.isArray(J.stripe) ? J.stripe : [J.stripe, J.stripe], real = J.stripeReal ? ` (real ${J.stripeReal[0]} / ${J.stripeReal[1]})` : '';
    if (J.stripe) check(`[${label}] ...and it is a stripe: ${(ribMean - mean(rib.n10)).toFixed(0)} kt weaker 10 degrees poleward of the axis and ${(ribMean - mean(rib.s10)).toFixed(0)} kt weaker 10 degrees equatorward${real}`, rib.n10.length > 50 && (!sp[0] || ribMean - mean(rib.n10) > sp[0]) && (!sp[1] || ribMean - mean(rib.s10) > sp[1]));
  }

  // ---- 9. the two weather sliders
  const sl = await ev(([jet, seeds]) => {
    const X = window.SSTSIM, out = { change: { on: [], off: [] }, ppMax: 0, frozen: { on: [], off: [] } };
    const at = () => X.steerAt(jet[0], jet[1], 'deep');
    for (let s = 1; s <= seeds; s++) {
      for (const mode of ['on', 'off']) {
        X.applySeed(500 + s); X.setPlaying(false); X.set('variability', 0); X.set('shearSynoptic', mode === 'on' ? 1 : 0); X.tick(24 * 40);
        const a = at(); X.tick(72); const b = at(); out.change[mode].push(Math.hypot(a.u - b.u, a.v - b.v));
        if (mode === 'off') out.ppMax = Math.max(out.ppMax, ...X.steerNodes('deep').pp.map(Math.abs));
      }
      for (const mode of ['on', 'off']) {                                       // the speed slider: weather on, jet clock running (on) or stopped (off)
        X.applySeed(500 + s); X.setPlaying(false); X.set('variability', 0); X.set('jetSpeed', mode === 'on' ? 1 : 0); X.tick(24 * 40);
        const a = at(), pa = X.pressureAt(jet[0], jet[1]); X.tick(24 * 5); const b = at(), pb = X.pressureAt(jet[0], jet[1]); out.frozen[mode].push(Math.hypot(a.u - b.u, a.v - b.v) + Math.abs(pa - pb));
      }
    }
    X.set('variability', 1); X.set('shearSynoptic', 1); X.set('jetSpeed', 1);
    return out;
  }, [S.pts.jet, 10]);
  check(`[${label}] the day-to-day slider at 0 removes the pressure weather entirely (largest P' anywhere: ${sl.ppMax.toExponential(1)} hPa) and flattens the steering (${mean(sl.change.off).toFixed(2)} vs ${mean(sl.change.on).toFixed(2)} kt change in 3 days at ${S.names.jet})`, sl.ppMax === 0 && mean(sl.change.off) < 0.25 * mean(sl.change.on) && mean(sl.change.on) > 2);
  check(`[${label}] the weather-speed slider at 0 freezes the weather in place (${mean(sl.frozen.off).toFixed(2)} vs ${mean(sl.frozen.on).toFixed(2)} kt+hPa of change in 5 days)`, mean(sl.frozen.off) < 0.25 * mean(sl.frozen.on) && mean(sl.frozen.on) > 2);
  await ev(() => { window.SSTSIM.applySeed(4242); window.SSTSIM.setPlaying(false); });

  // ---- 10. smooth and reproducible
  const sm = await ev((pts) => {
    const X = window.SSTSIM, d = [], big = []; X.setPlaying(false);
    for (const seed of [11, 4242]) {
      X.applySeed(seed); X.setPlaying(false); X.tick(24 * 20);
      let prev = pts.map(([la, lo]) => X.steerAt(la, lo, 'deep'));
      for (let h = 0; h < 24 * 8; h++) {
        X.tick(1); const cur = pts.map(([la, lo]) => X.steerAt(la, lo, 'deep'));
        cur.forEach((c, i) => { const p = prev[i]; if (c.speed > 8 && p.speed > 8) { let dd = Math.abs(c.toward - p.toward); if (dd > 180) dd = 360 - dd; d.push(dd); } big.push(Math.abs(c.speed - p.speed)); });
        prev = cur;
      }
    }
    return { d, big };
  }, [S.pts.jet, S.pts.sub, S.pts.trop, ...S.extra]);
  check(`[${label}] steering evolves smoothly: from one hour to the next the heading changes by at most ${Math.max(...sm.d).toFixed(1)} deg and the speed by at most ${Math.max(...sm.big).toFixed(2)} kt (${sm.d.length} hourly steps at 6 points)`, Math.max(...sm.d) < 12 && Math.max(...sm.big) < 2);
  const rep = await ev(() => {
    const X = window.SSTSIM, take = () => { const d = X.steerNodes('deep'), s = X.steerNodes('shallow'); return [d.u, d.v, d.p, s.u, s.v].flat(); }, diff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
    X.applySeed(77); X.setPlaying(false); X.tick(24 * 10); const once = take();
    X.applySeed(77); X.setPlaying(false); for (let i = 0; i < 10; i++) X.tick(24); const tens = take();
    X.applySeed(77); X.setPlaying(false); for (let i = 0; i < 240; i++) X.tick(1); const hourly = take();
    X.applySeed(77); X.setPlaying(false); for (let i = 0; i < 7; i++) X.tick(17); X.tick(121); const odd = take();
    X.applySeed(77); X.setPlaying(false); X.tick(24 * 10); const again = take();
    X.applySeed(78); X.setPlaying(false); X.tick(24 * 10); const other = take();
    return { tens: diff(once, tens), hourly: diff(once, hourly), odd: diff(once, odd), again: diff(once, again), other: diff(once, other) };
  });
  check(`[${label}] a seed gives the same steering however the run is chunked (240 h in one tick, ten, 240 hourly, or odd pieces: differences ${rep.tens.toExponential(1)}, ${rep.hourly.toExponential(1)}, ${rep.odd.toExponential(1)} kt/hPa), reproduces on restart (${rep.again.toExponential(1)}), and differs between seeds (${rep.other.toFixed(1)})`, rep.tens < 1e-3 && rep.hourly < 1e-3 && rep.odd < 1e-3 && rep.again === 0 && rep.other > 5);
  // adding steering must not change anything else a seed does: it has its own random stream, and drawing/updating it does not touch the fields
  const iso = await ev(([pt, sub, jet]) => {
    const X = window.SSTSIM, read = () => JSON.stringify([X.sample(pt[0], pt[1]), X.sample(sub[0], sub[1]), X.sample(jet[0], jet[1]), X.enso(), X.state().eddies, X.state().gsShift]);
    X.applySeed(555); X.setPlaying(false); for (let i = 0; i < 6; i++) X.advance(24); const plain = read();
    X.applySeed(555); X.setPlaying(false);
    document.getElementById('steerarrows').checked = true; document.getElementById('highs').checked = true; document.getElementById('steerarrows').dispatchEvent(new Event('change'));
    for (let i = 0; i < 6; i++) { X.advance(24); X.highs(); X.steerNodes('shallow'); X.steerArrows(); }
    const busy = read();
    document.getElementById('steerarrows').checked = false; document.getElementById('highs').checked = false; document.getElementById('steerarrows').dispatchEvent(new Event('change'));
    return { plain, busy };
  }, [S.pts.trop, S.pts.sub, S.pts.jet]);
  check(`[${label}] steering draws on its own random stream: SST, humidity, shear and ENSO after 6 days are bit-for-bit what they are with the arrows and highs off`, iso.plain === iso.busy);
  await ev(() => { window.SSTSIM.applySeed(4242); window.SSTSIM.setPlaying(false); });

  // ---- 11. the three storm-strength layers
  const lay = await ev(([wMed, mdr, jet]) => {
    const X = window.SSTSIM; X.setPlaying(false); let worst = 0; const sh = { mdr: [], jet: [] }, dp = { mdr: [], jet: [] };
    for (let s = 1; s <= 24; s++) {
      X.applySeed(1500 + s); X.setPlaying(false); X.tick(24 * (10 + 6 * s));
      const a = X.steerNodes('shallow'), m = X.steerNodes('medium'), d = X.steerNodes('deep');
      for (let q = 0; q < a.u.length; q++) if (Math.hypot(d.u[q], d.v[q]) < 95) worst = Math.max(worst, Math.abs(m.u[q] - (wMed * a.u[q] + (1 - wMed) * d.u[q])), Math.abs(m.v[q] - (wMed * a.v[q] + (1 - wMed) * d.v[q])));
      for (const [k, ll] of [['mdr', mdr], ['jet', jet]]) { sh[k].push(X.steerAt(ll[0], ll[1], 'shallow').speed); dp[k].push(X.steerAt(ll[0], ll[1], 'deep').speed); }
    }
    return { worst, sh, dp };
  }, [steer.mediumWeight, S.pts.trop, S.pts.jet]);
  check(`[${label}] the medium layer is ${steer.mediumWeight} x weak + ${(1 - steer.mediumWeight).toFixed(2)} x strong, node by node wherever the soft 100 kt limit is not in play (largest difference ${lay.worst.toExponential(1)} kt)`, lay.worst < 0.05);
  const ms = (a) => mean(a);
  check(`[${label}] the layers differ the way the real ones do: ${S.noTrades ? '' : `in the trades the low-level flow is the faster (${ms(lay.sh.mdr).toFixed(1)} kt weak vs ${ms(lay.dp.mdr).toFixed(1)} strong at ${S.names.trop}), `}under the jet the deep layer is (${ms(lay.dp.jet).toFixed(1)} vs ${ms(lay.sh.jet).toFixed(1)} kt at ${S.names.jet})`, (S.noTrades || ms(lay.sh.mdr) > ms(lay.dp.mdr)) && ms(lay.dp.jet) > ms(lay.sh.jet) + 4);   // (the Mediterranean has no trade winds to compare)

  // ---- 12. the H icons
  // a state with several highs on screen, searched for (so a recalibration that moves the highs about cannot break the check for a reason that is not the icons)
  let scene = null;
  const iconMin = S.iconMin === undefined ? 3 : S.iconMin;   // a basin with hardly any highs (North Indian Ocean, Mediterranean: iconMin 0) has no icons to check
  const candidates = [[4242, 80], [5, 80], [90210, 10], [77, 40], [5, 160], [4242, 10], [90210, 80], [11, 200]];
  for (const day of [300, 120, 240, 20, 180]) for (const seed of [4242, 5, 90210, 77, 11]) candidates.push([seed, day]);   // (more states for a basin with few highs)
  for (const [seed, day] of iconMin ? candidates : []) {
    const n = await ev(([view, seed, day]) => {
      const X = window.SSTSIM; X.applySeed(seed); X.setPlaying(false); X.advance(24 * day); X.map.fitBounds(view, { animate: false });
      return X.highs().filter((h) => { const p = X.map.latLngToContainerPoint([h.lat, h.lon]); return p.x > 24 && p.y > 24 && p.x < 1256 && p.y < 760; }).length;
    }, [S.view, seed, day]);
    if (n >= iconMin) { scene = [seed, day, n]; break; }
  }
  if (iconMin) check(`[${label}] there is a state with ${iconMin >= 3 ? 'several' : 'a couple of'} highs in view to check the icons on (seed ${scene && scene[0]}, day ${scene && scene[1]}: ${scene && scene[2]} on screen)`, !!scene);
  await lyrSet(page, 'highs', true); await page.waitForTimeout(250);
  const ic = await ev(() => {
    const X = window.SSTSIM, hs = X.highs(), icons = X.highIcons(), c = document.getElementById('steer-canvas'), g = c.getContext('2d'), s = c.width / c.clientWidth;
    const px = (lat, lon, dx, dy) => { const p = X.map.latLngToContainerPoint([lat, lon]); return { in: p.x > 24 && p.y > 24 && p.x < c.clientWidth - 24 && p.y < c.clientHeight - 40, c: [...g.getImageData(Math.round((p.x + dx) * s), Math.round((p.y + dy) * s), 1, 1).data] }; };
    return { highs: hs.length, icons: icons.length, match: hs.every((h) => icons.some((i) => Math.abs(i.lat - h.lat) < 0.05 && Math.abs(i.lon - h.lon) < 0.05 && Math.abs(i.p - h.p) < 0.05 && i.a === 1)), samples: icons.map((i) => ({ left: px(i.lat, i.lon, -11, 0), right: px(i.lat, i.lon, 11, 0), ring: px(i.lat, i.lon, 0, -15) })) };
  });
  const seen = ic.samples.filter((q) => q.left.in), blue = (c) => Math.abs(c[0] - 27) < 40 && Math.abs(c[1] - 79) < 40 && Math.abs(c[2] - 224) < 40 && c[3] > 230;
  if (iconMin) check(`[${label}] with Highs ticked there is one icon per high, at its position and pressure, fully drawn (${ic.icons} icons, ${ic.highs} highs)`, ic.highs >= Math.min(2, iconMin) && ic.icons === ic.highs && ic.match);
  if (iconMin) check(`[${label}] each icon on screen is a blue disc with a white rim on its canvas (${seen.filter((q) => blue(q.left.c) && blue(q.right.c) && q.ring.c[0] > 230 && q.ring.c[1] > 230).length} of ${seen.length} icons checked)`, seen.length >= iconMin && seen.every((q) => blue(q.left.c) && blue(q.right.c) && q.ring.c[0] > 230 && q.ring.c[1] > 230));
  await lyrSet(page, 'highs', false); await page.waitForTimeout(150);
  const gone = await ev(() => ({ icons: window.SSTSIM.highIcons().length, ink: (() => { const c = document.getElementById('steer-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n; })() }));
  check(`[${label}] unticking Highs removes every icon (${gone.icons} left, ${gone.ink} painted pixels)`, gone.icons === 0 && gone.ink === 0);
  await ev(() => { window.SSTSIM.setView('sst'); window.SSTSIM.setPlaying(true); window.SSTSIM.restart(); });   // leave the page in its default state for the checks after this one
}

const SHEAR_SPECS = {
  eastpacific: { pt: [15, -120], city: [16.86, -99.88, 'Acapulco'], enso: [4, -150, -1], wxPts: [[15, -120], [10, -100], [12, -140], [8, -160]], band: [20, 64], lon: [-180, -68], lat: [-32, 50], latRef: 40, couple: 0.5, rangeMin: 3, eastMin: 0.03, dailyMin: 0.4, line: { view: [[24, -176], [48, -72]], seed: 2, days: 12, minProbes: 8, margin: 3 }, offscreen: { center: [0, -130], dir: 'north' } },
  westpacific: { pt: [15, 140], city: [14.60, 120.98, 'Manila'], enso: [16, 116, 1], wxPts: [[15, 140], [10, 130], [18, 150], [12, 160]], band: [20, 64], lon: [100, 180], lat: [-6, 56], latRef: 40, couple: 0.5, rangeMin: 3, eastMin: 0.03, dailyMin: 0.4, line: { view: [[26, 104], [54, 178]], seed: 1, days: 12, minProbes: 8, margin: 3 }, offscreen: { center: [5, 140], dir: 'north' } },
  nio: { pt: [15, 65], city: [19.08, 72.88, 'Mumbai'], enso: [4, 86, -1], wxPts: [[15, 65], [10, 75], [18, 60], [12, 85]], band: [20, 64], lon: [30, 100], lat: [-8, 32], latRef: 30, couple: 0.5, rangeMin: 3, eastMin: 0.03, dailyMin: 0.4, line: { view: [[16, 34], [32, 98]], seed: 2, days: 12, minProbes: 8, margin: 3 }, noteSeed: [22, 'north'], offscreen: { center: [0, 65], dir: 'north' } },
  aus: { pt: [-15, 115], city: [-33.87, 151.21, 'Sydney'], enso: [-20, 166, 1], wxPts: [[-15, 115], [-12, 130], [-18, 105], [-10, 150]], band: [-64, -20], lon: [90, 176], lat: [-44, 4], latRef: -34, couple: 0.5, rangeMin: 3, eastMin: 0.03, dailyMin: 0.4, line: { view: [[-44, 92], [-24, 174]], seed: 1, days: 12, minProbes: 8, margin: 3 }, offscreen: { center: [-5, 130], dir: 'south' } },
  swio: { pt: [-15, 60], city: [-29.86, 31.02, 'Durban'], enso: [-22, 56, 1], wxPts: [[-15, 60], [-12, 75], [-18, 85], [-10, 90]], band: [-64, -20], lon: [30, 108], lat: [-44, 0], latRef: -37, couple: 0.5, rangeMin: 3, eastMin: 0.03, dailyMin: 0.4, line: { view: [[-44, 32], [-24, 106]], seed: 1, days: 12, minProbes: 8, margin: 3 }, offscreen: { center: [-6, 70], dir: 'south' } },
  spac: { pt: [-15, 170], city: [-18.14, 178.42, 'Suva'], enso: [-10, 200, -1], wxPts: [[-15, 170], [-12, 185], [-18, 200], [-10, 215]], band: [-64, -20], lon: [160, 240], lat: [-40, 0], latRef: -36, couple: 0.5, rangeMin: 3, eastMin: 0.03, dailyMin: 0.4, line: { view: [[-40, 162], [-22, 238]], seed: 1, days: 12, minProbes: 8, margin: 3 }, noteSeed: [52, 'south'], offscreen: { center: [-6, 200], dir: 'south' } },
  satl: { pt: [-12, -30], city: [-22.91, -43.17, 'Rio de Janeiro'], enso: [-4, -34, 1], wxPts: [[-12, -30], [-8, -10], [-20, -20], [-5, -35]], band: [-64, -20], lon: [-50, 20], lat: [-40, 0], latRef: -37, couple: 0.5, rangeMin: 3, eastMin: 0.03, dailyMin: 0.4, line: { view: [[-40, -48], [-22, 18]], seed: 8, days: 12, minProbes: 8, margin: 3 }, noteSeed: [9, 'south'], offscreen: { center: [-6, -20], dir: 'south' } },
  med: { pt: [36, 15], city: [45.44, 12.33, 'Venice'], enso: [42, 6, 1], wxPts: [[36, 15], [34, 25], [38, 5], [40, 18]], band: [20, 64], lon: [-10, 42], lat: [30, 48], latRef: 32, couple: 0.5, rangeMin: 3, eastMin: 0.03, dailyMin: 0.4, line: { view: [[30, -8], [44, 40]], seed: 10, days: 12, minProbes: 6, margin: 2.5 }, noteSeed: [16, 'south'], offscreen: { center: [45.5, 15], dir: 'south', seed: 1 } },
};

for (const [label, dist] of [['Atlantic', ATLANTIC_DIST], ['East Pacific', EPAC_DIST], ['West Pacific', WPAC_DIST], ['North Indian Ocean', NIO_DIST], ['Australian Region', AUS_DIST], ['South-West Indian Ocean', SWIO_DIST], ['South Pacific', SPAC_DIST], ['South Atlantic', SATL_DIST], ['Mediterranean', MED_DIST]]) {
  if (!existsSync(dist)) {
    console.error(`${dist} not found — run \`npm run build\` first.`);
    process.exit(1);
  }
}

// PLAYWRIGHT_CHROMIUM_PATH lets a pinned-but-mismatched local Playwright install point at
// whatever Chromium is actually on disk (e.g. /opt/pw-browsers/chromium in a sandboxed dev
// environment); CI installs a matching browser itself and leaves this unset.
const launchOpts = process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {};

// Checks shared by every basin build: loads clean, sim clock runs, theme switching and the
// offline Satellite fallback all work, and the embedded Blue Marble debug hook is sane. Basin-
// specific checks (pan limits, which regions should/shouldn't have SST) are passed in as `extra`.
async function checkBasin(label, dist, extra) {
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(label)) return;      // ONLY='Atlantic,Australian Region' runs just those pages (a working aid; CI runs them all)
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.route('**://**/*', (route) => route.request().url().startsWith('file://') ? route.continue() : route.abort());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(pathToFileURL(dist).href, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__ready === true, { timeout: 15000 });
  await page.waitForTimeout(1000);
  await checkStormGate(page, label, dist);
  if (label === 'Atlantic') await checkStormGateOff(browser, label, dist);
  await page.evaluate(() => { if (window.SSTSIM.storms) window.SSTSIM.storms(false); });   // every check below tests the environment, so it runs on the unchanged simulation (storms have their own checks)

  check(`[${label}] loads with no JS errors`, errors.length === 0);
  if (errors.length) console.log('  ' + errors.join('\n  '));

  // Blue Marble is kept only as an internal fallback now (no button of its own); the Satellite
  // button stays shown as pressed even if the fallback already silently kicked in (no live
  // network in this test, so on a slow CI box it sometimes has by the time this is checked).
  const initialTheme = await page.evaluate(() => document.querySelector('#themes button[aria-pressed="true"]')?.textContent);
  check(`[${label}] starts on Satellite theme`, initialTheme === 'Satellite');

  const state1 = await page.evaluate(() => window.SSTSIM.state());
  await page.waitForTimeout(1200);
  const state2 = await page.evaluate(() => window.SSTSIM.state());
  check(`[${label}] sim clock advances`, state2.simHour > state1.simHour);

  // Satellite theme has no network in this test: must fall back to Blue Marble, not hang or throw.
  await page.click('#themes button:has-text("Satellite")');
  await page.waitForTimeout(11000);
  const afterSat = await page.evaluate(() => window.SSTSIM.bm().theme);
  check(`[${label}] Satellite theme falls back to Blue Marble without a live tile source`, afterSat === 'bm');

  const bmDebugState = await page.evaluate(() => window.SSTSIM.bm());
  check(`[${label}] SSTSIM.bm() debug hook works on the Blue Marble fallback`, bmDebugState && bmDebugState.theme === 'bm' && errors.length === 0);

  const themeButtonCount = await page.locator('#themes button').count();
  check(`[${label}] exactly 4 selectable theme buttons (Blue Marble is fallback-only)`, themeButtonCount === 4);
  check(`[${label}] Blue Marble is no longer a selectable theme button`, (await page.locator('#themes button:has-text("Blue Marble")').count()) === 0);

  const themeButtons = ['NHC', 'Satellite', 'Plain', 'Chart'];
  for (const name of themeButtons) {
    await page.click(`#themes button:has-text("${name}")`);
    await page.waitForTimeout(200);
  }
  check(`[${label}] all theme buttons switch without errors`, errors.length === 0);

  // Panel: Customization / Experimentation split, Experimentation starts closed.
  const customCollapsed = await page.evaluate(() => document.getElementById('sec-custom').classList.contains('collapsed'));
  const expCollapsed = await page.evaluate(() => document.getElementById('sec-exp').classList.contains('collapsed'));
  check(`[${label}] Customization section starts open`, !customCollapsed);
  check(`[${label}] Experimentation section starts closed`, expCollapsed);
  await page.click('#sec-exp button.subhead');
  const expCollapsedAfter = await page.evaluate(() => document.getElementById('sec-exp').classList.contains('collapsed'));
  check(`[${label}] Experimentation section opens on click`, !expCollapsedAfter);
  await checkExperiment(page, label);

  // ENSO: "Set ENSO now" is a slider that forces the Nino 3.4 index directly (soft ceiling, not
  // a hard cap at 3 -- the gauge and this slider can both still show a reading past it).
  await page.evaluate(() => { const el = document.getElementById('p-ensonow'); el.value = '2.5'; el.dispatchEvent(new Event('input')); });
  const ensoState = await page.evaluate(() => window.SSTSIM.enso());
  check(`[${label}] Set ENSO now slider forces the Nino 3.4 index`, Math.abs(ensoState.n34 - 2.5) < 0.05);

  // Hurricane/typhoon/cyclone threshold + contour-line overlay used to be SST-only -- switching
  // to the Anomaly view must swap the checkbox labels away from the SST-specific "26.5 .. 2 °C"
  // wording, and toggling the key-line checkbox must still visibly change what's rendered (not
  // just the label), proving the overlay-drawing code itself generalized, not just its text.
  const sstLabels = await page.evaluate(() => ({ l265: document.getElementById('l265-label').textContent, l2: document.getElementById('l2-label').textContent }));
  check(`[${label}] SST view's key-line checkbox label mentions 26.5`, sstLabels.l265.includes('26.5'));
  check(`[${label}] SST view's step-line checkbox label mentions its 2 °C step`, sstLabels.l2.includes('2') && sstLabels.l2.includes('°C'));

  await page.evaluate(() => window.SSTSIM.setView('anom'));
  await page.waitForTimeout(200);
  const anomLabels = await page.evaluate(() => ({ l265: document.getElementById('l265-label').textContent, l2: document.getElementById('l2-label').textContent }));
  check(`[${label}] Anomaly view's key-line checkbox label drops the SST-specific "26.5"/threshold wording`, !anomLabels.l265.includes('26.5') && !/threshold/i.test(anomLabels.l265));
  check(`[${label}] Anomaly view's step-line checkbox label reflects its own 1 °C step`, anomLabels.l2.includes('1') && anomLabels.l2.includes('°C'));

  // The bottom-left hover readout used to be hardcoded to always show SST regardless of the
  // active view -- switching views should change what it reports, not just the legend (the
  // same class of bug drawLakes() and updateCityTip() already had to fix per view). Scans the
  // CURRENT viewport (map.getBounds(), no panning -- panning near a basin's own edge can run
  // into maxBounds clamping, landing the cursor off the visible map, confirmed hitting exactly
  // this with stats()'s own warmest-point in Atlantic, right at lon1) for a real, non-land
  // point -- the map's own default center isn't a safe assumption either, confirmed landing on
  // actual terrain for Australian Region (Kimberley coast) and Mediterranean (southern Italy,
  // which is geographically central to that basin). The view checks just above already left
  // `view` on 'anom' -- reset to 'sst' first so the upcoming SST-readout assertion isn't
  // silently checking the Anomaly view instead.
  await page.evaluate(() => window.SSTSIM.setView('sst'));
  await page.waitForTimeout(150);
  const readoutPt = await page.evaluate(() => {
    const b = window.SSTSIM.map.getBounds();
    for (let i = 1; i < 8; i++) {
      for (let j = 1; j < 8; j++) {
        const lat = b.getSouth() + (b.getNorth() - b.getSouth()) * i / 8;
        const lon = b.getWest() + (b.getEast() - b.getWest()) * j / 8;
        if (window.SSTSIM.isLand(lat, lon)) continue;
        if (!Number.isFinite(window.SSTSIM.sample(lat, lon).sst)) continue;
        const p = window.SSTSIM.map.latLngToContainerPoint([lat, lon]);
        return { x: p.x, y: p.y };
      }
    }
    return null;
  });
  check(`[${label}] found a real open-ocean point in the current view to hover`, readoutPt !== null);
  await page.mouse.move(readoutPt.x, readoutPt.y);
  await page.waitForTimeout(150);
  const readoutSst = await page.evaluate(() => document.getElementById('readout').textContent);
  check(`[${label}] readout shows a real °C SST value with vs.-normal context`, /°C/.test(readoutSst) && /vs\. normal/.test(readoutSst));

  await page.evaluate(() => window.SSTSIM.setView('anom'));
  await page.waitForTimeout(150);
  const readoutAnom = await page.evaluate(() => document.getElementById('readout').textContent);
  check(`[${label}] switching to the Anomaly view changes what the readout reports, not just the legend`, readoutAnom !== readoutSst && !/vs\. normal/.test(readoutAnom));

  await page.evaluate(() => window.SSTSIM.setView('sst'));   // leave the page in its default state for any checks after this one

  const overlayChecksum = () => page.evaluate(() => {
    const c = document.querySelectorAll('canvas.overlay')[1], g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0; for (let i = 0; i < d.length; i += 97) sum = (sum + d[i]) >>> 0;
    return sum;
  });
  await page.check('#l265');
  await page.waitForTimeout(300);
  const sumWithLine = await overlayChecksum();
  await page.uncheck('#l265');
  await page.waitForTimeout(300);
  const sumWithoutLine = await overlayChecksum();
  check(`[${label}] toggling the key-line checkbox in the Anomaly view visibly changes the rendered overlay`, sumWithLine !== sumWithoutLine);
  await page.check('#l265');
  await page.evaluate(() => window.SSTSIM.setView('sst'));   // restore default state before basin-specific `extra` checks run
  await page.waitForTimeout(200);

  await extra(page, label);

  await browser.close();
}

await checkBasin('Atlantic', ATLANTIC_DIST, async (page, label) => {
  // The border-line data only covers roughly the Atlantic domain + a margin (e.g. it's empty
  // over Alaska/Yukon); panning there used to show a map with no state/country outlines at all.
  // maxBounds should clamp the view back before it gets there.
  await page.evaluate(() => window.SSTSIM.map.fitBounds([[25, -172], [75, -90]]));
  await page.waitForTimeout(300);
  const clampedWestLon = await page.evaluate(() => window.SSTSIM.map.getBounds().getWest());
  check(`[${label}] map cannot pan into the uncovered Alaska/Yukon region`, clampedWestLon > -110);

  // The pan limit is the North Atlantic basin, full stop: trying to jump down to South America /
  // the South Atlantic should clamp back north of it, the same way the Alaska/Yukon edge does.
  await page.evaluate(() => window.SSTSIM.map.setView([-20, -30], 5));
  await page.waitForTimeout(300);
  const clampedSouthLat = await page.evaluate(() => window.SSTSIM.map.getBounds().getSouth());
  check(`[${label}] map cannot pan down into South America / the South Atlantic`, clampedSouthLat > -5);

  // The South Atlantic is a future basin and isn't reachable by panning, so it's still NaN. The
  // Mediterranean *is* reachable, so it now shows its own real climatology instead of a masked
  // hole (masking reachable water just put a hard seam in open water a user could pan into).
  // The Panama/Colombia corridor is the opposite case: this grid's box reaches far enough west
  // to cross the isthmus into the Pacific side, a different ocean, so that's masked instead.
  const basinSamples = await page.evaluate(() => ({
    med: window.SSTSIM.sample(36, 15),      // central Mediterranean
    gibraltar: window.SSTSIM.sample(35.9, -4.5),     // Alboran Sea, right at the strait
    bayOfBiscay: window.SSTSIM.sample(45, -3),       // open Atlantic off France -- a flat lon cutoff clipped this
    southAtlantic: window.SSTSIM.sample(-15, -20),   // open South Atlantic, well past the cutoff
    southernMDR: window.SSTSIM.sample(-5, -30),      // a few degrees south of the equator, inside the cutoff
    openAtlantic: window.SSTSIM.sample(20, -50),     // sanity check: still real data north of the equator
    gulfOfPanama: window.SSTSIM.sample(8, -82),      // Pacific side of Panama -- a different ocean, not this basin's
    cartagena: window.SSTSIM.sample(10.4, -75.5),    // Caribbean (Colombia) -- real water just past the isthmus
  }));
  check(`[${label}] Mediterranean now shows real SST, not a masked hole`, Number.isFinite(basinSamples.med.sst));
  check(`[${label}] Gibraltar/Alboran Sea now shows real SST`, Number.isFinite(basinSamples.gibraltar.sst));
  check(`[${label}] Bay of Biscay (open Atlantic) is not clipped by the Mediterranean cutoff`, Number.isFinite(basinSamples.bayOfBiscay.sst));
  check(`[${label}] South Atlantic SST is excluded`, Number.isNaN(basinSamples.southAtlantic.sst));
  check(`[${label}] southern MDR (a few degrees south of the equator) still has real SST`, Number.isFinite(basinSamples.southernMDR.sst));
  check(`[${label}] open North Atlantic SST is still real data`, Number.isFinite(basinSamples.openAtlantic.sst));
  check(`[${label}] Pacific side of Panama is excluded (wrong ocean)`, Number.isNaN(basinSamples.gulfOfPanama.sst));
  check(`[${label}] Caribbean side (Cartagena) still has real SST`, Number.isFinite(basinSamples.cartagena.sst));

  // 700 hPa relative humidity: same outOfBasin mask as SST (reusing the samples already taken
  // above), real values in-basin, sane 0-100% range, NaN everywhere SST is also NaN.
  check(`[${label}] open North Atlantic 700 hPa humidity is real data`, Number.isFinite(basinSamples.openAtlantic.humid) && basinSamples.openAtlantic.humid >= 0 && basinSamples.openAtlantic.humid <= 100);
  check(`[${label}] South Atlantic 700 hPa humidity is excluded, same mask as SST`, Number.isNaN(basinSamples.southAtlantic.humid));

  // Humidity view: a third option in the same segmented control as Temperature/SST Anomaly --
  // selecting it should swap the legend to the humidity scale and leave SST's own data intact
  // underneath (switching views never recomputes the field, just which array gets painted).
  await page.evaluate(() => window.SSTSIM.setView('humid'));
  await page.waitForTimeout(200);
  const humidViewState = await page.evaluate(() => ({
    pressed: document.querySelector('#seg-view button[data-v="humid"]').getAttribute('aria-pressed'),
    caption: document.getElementById('legend-cap').textContent,
    sample: window.SSTSIM.sample(20, -50),
  }));
  check(`[${label}] Humidity button becomes pressed when selected`, humidViewState.pressed === 'true');
  check(`[${label}] legend caption switches to the humidity scale`, humidViewState.caption === '700 hPa relative humidity, %');
  check(`[${label}] SST data is still real underneath the Humidity view`, Number.isFinite(humidViewState.sample.sst));

  // The generalized threshold concept covers humidity too, not just SST: its own key/step/
  // keyLabel in the checkbox label, and a parallel "Above/Below" tooltip line next to the
  // existing SST one (the tooltip always shows both fields together, regardless of view).
  const humidLabels = await page.evaluate(() => ({ l265: document.getElementById('l265-label').textContent, l2: document.getElementById('l2-label').textContent }));
  check(`[${label}] Humidity view's key-line checkbox label mentions its own 58% key, not 26.5`, humidLabels.l265.includes('58') && !humidLabels.l265.includes('26.5'));

  await page.evaluate(([lat, lon]) => window.SSTSIM.map.setView([lat, lon], 6), [25.76, -80.19]);
  await page.waitForTimeout(300);
  const miamiPt = await page.evaluate(([lat, lon]) => { const p = window.SSTSIM.map.latLngToContainerPoint([lat, lon]); return { x: p.x, y: p.y }; }, [25.76, -80.19]);
  await page.mouse.move(miamiPt.x, miamiPt.y);
  await page.waitForTimeout(200);
  const miamiTip = await page.evaluate(() => document.getElementById('city-tip').textContent);
  check(`[${label}] city tooltip still shows the SST hurricane-threshold line in the Humidity view`, /Above hurricane threshold|Below hurricane threshold/.test(miamiTip));
  check(`[${label}] city tooltip gains a parallel humidity-threshold line`, /Above favorable for development|Below favorable for development/.test(miamiTip));

  // Day-to-day ("synoptic") weather noise: a monthly climatology alone can't flicker day to
  // day, so this is a real second mechanism, not just the slow interannual/ENSO drift --
  // confirm the "Day-to-day weather" slider defaults to 1x and genuinely gates real variation.
  check(`[${label}] "Day-to-day weather" slider defaults to 1x`, (await page.evaluate(() => window.SSTSIM.sliderVals())).synoptic === 1);
  const withNoise = [];
  for (let d = 0; d < 8; d++) { await page.evaluate(() => window.SSTSIM.advance(24)); withNoise.push((await page.evaluate(() => window.SSTSIM.sample(25, -90))).humid); }
  const stdOf = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };
  check(`[${label}] humidity genuinely varies day to day at the default slider setting`, stdOf(withNoise) > 1);

  await page.evaluate(() => window.SSTSIM.set('synoptic', 0));
  const withoutNoise = [];
  for (let d = 0; d < 8; d++) { await page.evaluate(() => window.SSTSIM.advance(24)); withoutNoise.push((await page.evaluate(() => window.SSTSIM.sample(25, -90))).humid); }
  check(`[${label}] setting the slider to 0 flattens day-to-day humidity`, stdOf(withoutNoise) < stdOf(withNoise));
  await page.evaluate(() => window.SSTSIM.set('synoptic', 1));   // restore default before any checks after this one

  // Wind Shear view (Phase 1: climatology + EOF interannual variability + ENSO regression,
  // Atlantic only for now -- no day-to-day synoptic layer yet, see docs/roadmap.md). Checked
  // against real ERA5 200-850 hPa wind before building anything (see make_shear.py) -- low
  // shear is favorable here, the opposite polarity from Humidity's own "high is favorable."
  await page.evaluate(() => window.SSTSIM.setView('shear'));
  await page.waitForTimeout(200);
  const shearViewState = await page.evaluate(() => ({
    pressed: document.querySelector('#seg-view button[data-v="shear"]').getAttribute('aria-pressed'),
    caption: document.getElementById('legend-cap').textContent,
    l265: document.getElementById('l265-label').textContent,
    l2: document.getElementById('l2-label').textContent,
  }));
  check(`[${label}] Wind Shear button becomes pressed when selected`, shearViewState.pressed === 'true');
  check(`[${label}] legend caption switches to the wind shear scale`, shearViewState.caption === '200–850 hPa wind shear, kt');
  check(`[${label}] Shear view's key-line checkbox label mentions its own 20kt key, not 26.5 or 58`, shearViewState.l265.includes('20') && !shearViewState.l265.includes('26.5') && !shearViewState.l265.includes('58'));

  const shearSample = await page.evaluate(() => window.SSTSIM.sample(20, -50));
  check(`[${label}] open-ocean wind shear sample is real data in a sane range`, Number.isFinite(shearSample.shear) && shearSample.shear >= 0 && shearSample.shear < 200);

  await page.evaluate(([lat, lon]) => window.SSTSIM.map.setView([lat, lon], 6), [25.76, -80.19]);
  await page.waitForTimeout(300);
  const miamiPt2 = await page.evaluate(([lat, lon]) => { const p = window.SSTSIM.map.latLngToContainerPoint([lat, lon]); return { x: p.x, y: p.y }; }, [25.76, -80.19]);
  await page.mouse.move(miamiPt2.x, miamiPt2.y);
  await page.waitForTimeout(200);
  const miamiTip2 = await page.evaluate(() => document.getElementById('city-tip').textContent);
  check(`[${label}] city tooltip gains a parallel shear-threshold line`, /Above disruptive shear threshold|Below disruptive shear threshold/.test(miamiTip2));

  // Real ENSO-sign regression check, the shear-side analogue of the already-verified "El Nino
  // wets the Gulf, dries the MDR" humidity finding -- a genuinely new kind of automated check
  // (no existing test does this for humidity's own ENSO regression, that was only ever
  // confirmed visually during development, see docs/roadmap.md). forceEnso() only seeds the
  // MOST RECENT slot of the ENSO history ring buffer (see its own comment in template.html:
  // "the Atlantic then responds with its natural 3-6 month delay"), so this advances the sim
  // ~190 simulated days after each forced value -- enough for the lag-6-month term to fully
  // phase in -- before sampling, and restarts (same seed) between the two runs so only the ENSO
  // forcing differs, not the random EOF-mode draw.
  await page.evaluate(() => window.SSTSIM.forceEnso(2.0));
  await page.evaluate(() => window.SSTSIM.advance(24 * 190));
  const elNinoShear = (await page.evaluate(() => window.SSTSIM.sample(12, -45))).shear;
  await page.evaluate(() => window.SSTSIM.restart());
  await page.evaluate(() => window.SSTSIM.forceEnso(-2.0));
  await page.evaluate(() => window.SSTSIM.advance(24 * 190));
  const laNinaShear = (await page.evaluate(() => window.SSTSIM.sample(12, -45))).shear;
  check(`[${label}] forced El Nino raises MDR wind shear vs. forced La Nina (real teleconnection)`, elNinoShear > laNinaShear);
  await page.evaluate(() => window.SSTSIM.restart());   // clears the forced ENSO state and re-spins-up normally

  // Wind Shear's own day-to-day ("synoptic") noise, Phase 2 -- real upper-level trough
  // passages/jet streaks on top of Phase 1's climatology+ENSO base, same mirrored pattern as
  // humidity's own synoptic check above, but through its own dedicated P.shearSynoptic slider
  // (not P.synoptic -- see the shear combine-loop comment in template.html for why this field
  // gets its own, mechanistically distinct from humidity's day-to-day noise). Sampled at the
  // same MDR point (12,-45) the ENSO-sign check above already uses, well clear of any coastline.
  check(`[${label}] "Day-to-day weather (wind shear)" slider defaults to 1x`, (await page.evaluate(() => window.SSTSIM.sliderVals())).shearSynoptic === 1);
  const shearPts = [[12, -45], [15, -60], [10, -30], [17, -75]];   // open-ocean MDR / Caribbean points
  const shearDays = async (n) => {   // one daily series per point
    const series = shearPts.map(() => []);
    for (let d = 0; d < n; d++) {
      await page.evaluate(() => window.SSTSIM.advance(24));
      const r = await page.evaluate((ps) => ps.map(([la, lo]) => window.SSTSIM.sample(la, lo).shear), shearPts);
      r.forEach((v, i) => series[i].push(v));
    }
    return series;
  };
  // Mean |day-to-day change| pooled over the points. "Flattens" used to compare the std of one
  // point's 8-day series with vs. without the noise, which is not a clean separation: with the
  // slider at 0 the year-to-year modes still random-walk a little every day (sd 0.7-4.6 kt over 8
  // days, vs. 2.9-8.7 with the noise), so that comparison came out backwards on ~8% of random
  // seeds (2 of 20 and 3 of 40), and the page loads with a random seed -- a latent ~1-in-12 CI
  // failure. The day-to-day change is what the slider actually removes: without/with measured
  // 0.13-0.43 over 60 distinct seeds (median 0.25).
  const meanDayToDay = (series) => { let t = 0, c = 0; for (const s of series) for (let i = 1; i < s.length; i++) if (Number.isFinite(s[i]) && Number.isFinite(s[i - 1])) { t += Math.abs(s[i] - s[i - 1]); c++; } return t / c; };
  const withShearNoise = await shearDays(8);
  check(`[${label}] wind shear genuinely varies day to day at the default slider setting (real synoptic noise, not frozen)`, stdOf(withShearNoise[0]) > 1);

  await page.evaluate(() => window.SSTSIM.set('shearSynoptic', 0));
  const withoutShearNoise = await shearDays(8);
  check(`[${label}] setting the slider to 0 flattens day-to-day wind shear`, meanDayToDay(withoutShearNoise) < 0.7 * meanDayToDay(withShearNoise));
  await page.evaluate(() => window.SSTSIM.set('shearSynoptic', 1));   // restore default before any checks after this one
  await page.evaluate(() => window.SSTSIM.restart());   // clears the 16 simulated days of drift above, same reasoning as the ENSO check's own closing restart

  // The explicit jet stream (make_shear_jet.py): a continuous ribbon of strong shear along a
  // meandering axis, over a quieter background. Three things it has to do: actually be a band
  // (not just more speckle), keep moving, and still be there -- just parked on its mean path --
  // with the weather slider at 0. The page loads with a random seed, so these are checked against
  // dozens of random seeds, not one. The two contrast checks need care: the statistic is the shear
  // on the axis minus the shear 12 deg either side, and the background alone moves it around a lot
  // (at slider 0 the jet sits on its mean path, where the climatology minus its own smear is lower
  // than the surroundings; with the jet evolving over weeks, 8 days can sit far north, where the
  // surroundings are climatologically high). Averaged over 4 longitudes the with-ribbon and
  // ribbon-removed distributions overlapped (slider 0: 24-63 vs -15..+24 kt; slider 1: one seed in
  // 60 at 18 kt); averaged over 10 they separate cleanly (slider 0: 25-57 vs -14..+17; slider 1:
  // 26.6-49.5 vs -9.6..+10.6), with the threshold of 20 in the gap. At slider 0 the axis itself is
  // frozen on its mean path exactly (checked to 0.001 deg).
  const jetLons = [-55, -45, -35, -25], jetLonsWide = [-95, -85, -75, -65, -55, -45, -35, -25, -15, -5];
  const jetContrast = async (days, lonSet = jetLons) => {
    const on = [], off = [];
    for (let d = 0; d < days; d++) {
      await page.evaluate(() => window.SSTSIM.advance(24));
      const r = await page.evaluate((lons) => lons.map((lon) => { const la = window.SSTSIM.jetLat(lon); const at = (lat) => window.SSTSIM.sample(lat, lon).shear; return { on: at(la), off: [at(la + 12), at(la - 12)] }; }), lonSet);
      for (const c of r) { if (Number.isFinite(c.on)) on.push(c.on); for (const o of c.off) if (Number.isFinite(o)) off.push(o); }
    }
    const m = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    return { n: on.length, contrast: m(on) - m(off) };
  };
  const jetLatSeries = async (days) => { const s = []; for (let d = 0; d < days; d++) { await page.evaluate(() => window.SSTSIM.advance(24)); s.push(await page.evaluate(() => window.SSTSIM.jetLat(-40))); } return s; };

  // With the jet evolving over weeks, 8 days at 4 longitudes can sit in an unflattering spot (far north,
  // where the shear 12 deg either side is climatologically high: 18 kt on one seed in 60), so this uses the
  // 10-longitude set too: 26.6-49.5 kt on 60 seeds with the ribbon vs -9.6..+10.6 with it removed.
  const jetDefault = await jetContrast(8, jetLonsWide);
  check(`[${label}] jet stream is a real band: shear on its axis sits far above shear 12 deg to either side`, jetDefault.n >= 40 && jetDefault.contrast > 20);
  // (The jet now evolves over weeks, not days, so "moves" is judged over 20 days: the axis at -30 ranged
  // 9-29 deg over 20 days on 40 random seeds. The old 8-day std > 1 fell below 1 on a few percent of them.)
  const range20 = await page.evaluate(() => { const S = window.SSTSIM, a = []; for (let d = 0; d < 20; d++) { S.tick(24); a.push(S.jetLatLive(-30)); } return Math.max(...a) - Math.min(...a); });
  check(`[${label}] jet axis moves (a meandering ribbon, not frozen): it ranged ${range20.toFixed(1)} deg over 20 days`, range20 > 4);

  await page.evaluate(() => window.SSTSIM.set('shearSynoptic', 0));
  const parked = await jetLatSeries(8);
  check(`[${label}] weather slider at 0 parks the jet on its mean path instead of meandering`, Math.max(...parked) - Math.min(...parked) < 0.001);
  check(`[${label}] ...but the jet is still there at slider 0 (always flowing, just not moving)`, (await jetContrast(4, jetLonsWide)).contrast > 20);
  await page.evaluate(() => window.SSTSIM.set('shearSynoptic', 1));   // restore default before any checks after this one
  await page.evaluate(() => window.SSTSIM.restart());

  // The axis stays inside the band it was measured in. The real axis was traced within 20-64N and
  // piles up against both edges; the simulated one is a sum of Gaussian wave modes and, unlimited,
  // wandered out to 1N and 85N in testing (putting the ribbon over the equator). Stressed here at
  // the slider's 3x maximum, which triples every excursion, across the whole domain.
  await page.evaluate(() => window.SSTSIM.set('shearSynoptic', 3));
  let axisMin = 999, axisMax = -999;
  for (let d = 0; d < 50; d++) {
    await page.evaluate(() => window.SSTSIM.advance(48));
    const r = await page.evaluate(() => { const a = []; for (let lon = -110; lon <= 40; lon += 2) a.push(window.SSTSIM.jetLat(lon)); return a; });
    for (const v of r) { axisMin = Math.min(axisMin, v); axisMax = Math.max(axisMax, v); }
  }
  check(`[${label}] jet axis never leaves the 20-64N band the real axis was measured in, even at the slider's 3x maximum (saw ${axisMin.toFixed(1)}..${axisMax.toFixed(1)})`, axisMin >= 20 - 1e-6 && axisMax <= 64 + 1e-6);
  await page.evaluate(() => window.SSTSIM.set('shearSynoptic', 1));
  await page.evaluate(() => window.SSTSIM.restart());

  // How the jet MOVES. It used to reshuffle every day or two (modes 2-8 had daily autocorrelations of
  // 0.25-0.63, median 3.9 deg/day, 90th percentile 12), changed direction at every midnight (straight
  // segments between daily snapshots), and was only redrawn every ~360 ms; the complaint was "too fast,
  // not smooth, I want it to flow and interpolate smoothly". Now: slower modes, a cubic through the daily
  // samples, and eastward flow. All of it runs inside the page with tick()/jetLatLive(): tick() moves the
  // clocks without the 50-70 ms field redraw advance() does and jetLatLive() reads the very axis the line is
  // drawn from, so the jet can be sampled hour by hour. The jet has its own random stream and clock, so for
  // a given seed all of this is an exact function of (seed, time) -- fixed seeds here, nothing left to luck.
  // Thresholds are set from 40 random seeds (in brackets) -- and from the old build where it matters.
  const jetMotion = await page.evaluate(() => {
    const S = window.SSTSIM, lons = [-90, -70, -50, -30, -10, 10], mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const out = { daily: [], sec: 0 };
    for (const seed of [11, 4242, 90210]) {
      S.applySeed(seed);
      const hourly = lons.map(() => []);
      for (let h = 0; h <= 20 * 24; h++) { if (h) S.tick(1); lons.forEach((l, i) => hourly[i].push(S.jetLatLive(l))); }
      for (const a of hourly) {
        for (let d = 24; d < a.length; d += 24) out.daily.push(Math.abs(a[d] - a[d - 24]));
        for (let i = 2; i < a.length; i++) out.sec = Math.max(out.sec, Math.abs(a[i] - 2 * a[i - 1] + a[i - 2]));
      }
    }
    out.daily.sort((x, y) => x - y); out.medDaily = out.daily[Math.floor(out.daily.length / 2)];
    // the same seed gives the same jet however the run is cut into pieces
    S.applySeed(77); S.tick(240); const oneTick = lons.map((l) => S.jetLatLive(l));
    S.applySeed(77); for (let i = 0; i < 10; i++) S.tick(24); const tenTicks = lons.map((l) => S.jetLatLive(l));
    out.chunking = Math.max(...oneTick.map((v, i) => Math.abs(v - tenTicks[i])));
    // the speed slider rescales time itself: 2x for 5 days is exactly 1x for 10 days, and 0 freezes it.
    // (The speed is set AFTER applySeed: applySeed re-syncs every slider value from the page, which would undo it.)
    S.applySeed(77); S.set('jetSpeed', 2); S.tick(120); const fast = lons.map((l) => S.jetLatLive(l));
    S.applySeed(77); S.set('jetSpeed', 1); S.tick(240); const slow = lons.map((l) => S.jetLatLive(l));
    out.speedTwice = Math.max(...fast.map((v, i) => Math.abs(v - slow[i])));
    S.applySeed(77); S.set('jetSpeed', 0); const f0 = lons.map((l) => S.jetLatLive(l)); S.tick(24 * 30); const f1 = lons.map((l) => S.jetLatLive(l));
    out.frozen = Math.max(...f0.map((v, i) => Math.abs(v - f1[i])));
    S.set('jetSpeed', 1);
    // changes flow EAST: columns 10 deg apart correlate better when the eastern one is read 2 days later than 2 days earlier
    // (real axis anomalies do this at ~15 deg/day; the simulated flow is 6 deg/day, so 10 deg ~ 1.7 days)
    const lonsAll = []; for (let l = -90; l <= 20; l += 2) lonsAll.push(l);
    const asym = [];
    for (const seed of [3, 4, 5]) {
      S.applySeed(seed);
      const rows = []; for (let d = 0; d < 240; d++) { S.tick(24); rows.push(lonsAll.map((l) => S.jetLatLive(l))); }
      const cols = lonsAll.map((_, i) => rows.map((r) => r[i])), mu = cols.map(mean);
      const corr = (lag) => { let sxy = 0, sxx = 0, syy = 0; for (let c = 0; c + 5 < lonsAll.length; c++) for (let t = Math.max(0, -lag); t < rows.length - Math.max(0, lag); t++) { const x = cols[c][t] - mu[c], y = cols[c + 5][t + lag] - mu[c + 5]; sxy += x * y; sxx += x * x; syy += y * y; } return sxy / Math.sqrt(sxx * syy); };
      asym.push(corr(2) - corr(-2));
    }
    out.eastward = mean(asym);
    // the live axis (what the line is drawn from) and the one baked into the field by the last redraw are the same curve
    S.applySeed(3); S.advance(24 * 7);
    out.liveVsBaked = Math.max(...[-95, -80.5, -60, -33.25, 0, 17.5, 39.75].map((l) => Math.abs(S.jetLatLive(l) - S.jetLat(l))));
    return out;
  });
  check(`[${label}] jet moves calmly: median change ${jetMotion.medDaily.toFixed(2)} deg/day (was 3.9; 1.0-2.2 on 40 seeds)`, jetMotion.medDaily < 3.2 && jetMotion.medDaily > 0.5);
  check(`[${label}] jet motion has no kinks: max hourly second difference ${jetMotion.sec.toFixed(3)} deg/h^2 (the old straight-segments-per-day version peaked at 1.0-1.1; 0.02-0.05 on 40 seeds)`, jetMotion.sec < 0.2);
  check(`[${label}] a seed gives the same jet however the run is chunked into advance() calls (max difference ${jetMotion.chunking.toExponential(1)} deg)`, jetMotion.chunking < 1e-6);
  check(`[${label}] "Jet stream speed" rescales time itself: 2x for 5 days is exactly 1x for 10 days (max difference ${jetMotion.speedTwice.toExponential(1)} deg)`, jetMotion.speedTwice < 1e-6);
  check(`[${label}] "Jet stream speed" at 0 freezes the jet where it is (moved ${jetMotion.frozen.toExponential(1)} deg in 30 days)`, jetMotion.frozen < 1e-6);
  check(`[${label}] changes flow downstream: east-leading correlation exceeds west-leading by ${jetMotion.eastward.toFixed(2)} (0.10-0.21 on 24 seeds, 0 for a standing pattern)`, jetMotion.eastward > 0.05);
  check(`[${label}] the live axis the line is drawn from and the one baked into the shear field are the same curve (max difference ${jetMotion.liveVsBaked.toExponential(1)} deg)`, jetMotion.liveVsBaked < 1e-3);
  check(`[${label}] "Jet stream speed" slider exists and starts at 1x`, await page.evaluate(() => { const s = document.getElementById('p-jets'); return !!s && s.value === '1' && window.SSTSIM.sliderVals().jetSpeed === 1; }));
  await page.evaluate(() => window.SSTSIM.restart());

  // The "Jet stream line" checkbox: a line along that same axis, on its own overlay canvas, that
  // has to appear in EVERY view (not just Wind Shear) and not depend on the field being shown.
  // Checked on the real rendered pixels: the line's core is the only magenta on that canvas, so
  // look for it at the axis's own on-screen position at several longitudes (even ones, which sit
  // exactly on the 2-degree columns the curve is drawn through). The sim is paused for this: the
  // line is redrawn every animation frame from the live clock, so a running sim would move it a
  // few pixels between reading where it should be and reading the pixels.
  await page.evaluate(() => { window.SSTSIM.setPlaying(false); window.SSTSIM.applySeed(4242); window.SSTSIM.map.fitBounds([[22, -100], [55, 20]], { animate: false }); });
  await page.evaluate(() => window.SSTSIM.advance(24 * 12));
  await page.waitForTimeout(250);
  // Every 4 deg across the width the map can show (all on the 2-degree columns); whichever of them the axis has put on screen get judged.
  // (A fixed handful isn't enough: at this window size the view spans only about -87..7, and a jet far north leaves the top of it.)
  const probeLons = []; for (let l = -84; l <= 4; l += 4) probeLons.push(l);
  const axisPoints = () => page.evaluate((ls) => ls.map((lon) => { const p = window.SSTSIM.map.latLngToContainerPoint([window.SSTSIM.jetLatLive(lon), lon]); return [p.x, p.y]; }), probeLons);
  const magentaNear = (pts) => page.evaluate((ps) => {
    const c = document.getElementById('jet-canvas'), g = c.getContext('2d'), s = c.width / c.clientWidth, r = Math.round(4 * s);
    return ps.map(([px, py]) => {
      const x = Math.round(px * s), y = Math.round(py * s);
      if (x < r || y < r || x >= c.width - r || y >= c.height - r) return null;   // off-screen: can't be judged either way
      const d = g.getImageData(x - r, y - r, 2 * r + 1, 2 * r + 1).data;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= 200 && d[i] >= 200 && d[i + 2] >= 170 && d[i + 1] <= 130) return true;
      return false;
    });
  }, pts);
  const jetLineSeen = async () => { const r = (await magentaNear(await axisPoints())).filter((v) => v !== null); return { n: r.length, hits: r.filter(Boolean).length }; };

  check(`[${label}] "Jet stream line" checkbox exists and starts unchecked`, await page.evaluate(() => { const c = document.getElementById('jetline'); return !!c && !c.checked; }));
  const lineOff = await jetLineSeen();
  check(`[${label}] nothing is drawn along the axis while the checkbox is off (${lineOff.hits} of ${lineOff.n} on-screen probes)`, lineOff.n >= 8 && lineOff.hits === 0);
  await lyrSet(page, 'jetline', true);
  for (const v of ['sst', 'anom', 'humid', 'shear']) {
    await page.evaluate((vv) => window.SSTSIM.setView(vv), v);
    await page.waitForTimeout(300);
    const seen = await jetLineSeen();
    check(`[${label}] jet line is drawn along the axis in the ${v} view (${seen.hits} of ${seen.n} on-screen probes)`, seen.n >= 8 && seen.hits === seen.n);
  }
  check(`[${label}] the jet line option carries no "outside this area" note (the Atlantic's axis is always inside its box)`, (await page.evaluate(() => document.getElementById('jet-note').textContent)) === '');
  await page.uncheck('#show-sst');
  await page.waitForTimeout(300);
  const noField = await jetLineSeen();
  check(`[${label}] jet line still draws with "Show sea temperature" off (it isn't part of the field raster; ${noField.hits} of ${noField.n} probes)`, noField.n >= 8 && noField.hits === noField.n);
  await page.check('#show-sst');

  const ptsBefore = await axisPoints();
  await page.evaluate(() => window.SSTSIM.advance(24 * 5));
  await page.waitForTimeout(300);
  const ptsAfter = await axisPoints();
  const movedIdx = ptsBefore.map((p, i) => (Math.abs(p[1] - ptsAfter[i][1]) > 25 ? i : -1)).filter((i) => i >= 0);
  const newHits = await magentaNear(movedIdx.map((i) => ptsAfter[i])), oldHits = await magentaNear(movedIdx.map((i) => ptsBefore[i]));
  check(`[${label}] jet line follows the axis as it shifts from day to day (drawn at its new position, gone from the old one)`,
    movedIdx.length >= 2 && newHits.filter((h) => h === true).length >= 2 && newHits.every((h) => h !== false) && oldHits.every((h) => h !== true));

  // Same pixels as the "drawn at its new position" check above (the axis has moved on since the
  // earlier probes, so fewer of the original longitudes may still be on screen -- re-probing the
  // axis here could come up short for reasons that have nothing to do with the checkbox).
  const drawnAt = movedIdx.map((i) => ptsAfter[i]).filter((_, j) => newHits[j] === true);
  await lyrSet(page, 'jetline', false);
  await page.waitForTimeout(300);
  const goneAt = await magentaNear(drawnAt);
  check(`[${label}] unchecking the box removes the line again`, drawnAt.length >= 2 && goneAt.every((h) => h === false));
  // Not on screen is not the same as not there: zoomed in on the tropics, the jet is north of what is shown, and the option says so.
  await page.evaluate(() => window.SSTSIM.map.setView([-10, -45], 6, { animate: false }));
  await lyrSet(page, 'jetline', true);
  await page.waitForTimeout(300);
  check(`[${label}] zoomed in away from the axis, the jet line option says it is north of what is on screen`, (await page.evaluate(() => document.getElementById('jet-note').textContent)).includes('north of what is on screen'));
  await lyrSet(page, 'jetline', false);
  await page.evaluate(() => { window.SSTSIM.setPlaying(true); window.SSTSIM.setView('sst'); window.SSTSIM.restart(); });   // leave the page in its default state for the checks after this one

  // The bottom-left readout's own Shear branch (Atlantic-only, so checked here rather than in
  // the shared checkBasin() body above, which only exercises sst/anom -- every basin has those).
  // Re-hover explicitly rather than relying on `pointer` still holding its value from the
  // shared check much earlier -- plenty of interaction (ENSO forcing, restarts) has happened
  // since, and this shouldn't depend on exactly what did or didn't clear it.
  await page.evaluate(() => window.SSTSIM.setView('shear'));
  const shearPt = await page.evaluate(() => {
    const b = window.SSTSIM.map.getBounds();
    for (let i = 1; i < 8; i++) {
      for (let j = 1; j < 8; j++) {
        const lat = b.getSouth() + (b.getNorth() - b.getSouth()) * i / 8;
        const lon = b.getWest() + (b.getEast() - b.getWest()) * j / 8;
        if (window.SSTSIM.isLand(lat, lon)) continue;
        if (!Number.isFinite(window.SSTSIM.sample(lat, lon).sst)) continue;
        const p = window.SSTSIM.map.latLngToContainerPoint([lat, lon]);
        return { x: p.x, y: p.y };
      }
    }
    return null;
  });
  await page.mouse.move(shearPt.x, shearPt.y);
  await page.waitForTimeout(150);
  const shearReadout = await page.evaluate(() => document.getElementById('readout').textContent);
  check(`[${label}] readout shows a real kt shear value with its own threshold context`, /kt/.test(shearReadout) && /(Above|Below) disruptive shear threshold/.test(shearReadout));

  await page.evaluate(() => window.SSTSIM.setView('sst'));   // leave the page in its default state for any checks after this one

  await checkSteering(page, label, STEER_SPECS.atlantic);
  await checkEnsoHold(page, label);
  await checkEnvSeasons(page, label, ATLANTIC_DIST);
  await checkStorms(page, label);
  await checkForecastSkill(page, label);
  await checkLook(page, label, 'atlantic');
  await checkImpacts(page, label, 'atlantic');
  await checkFloater(page, label, 'atlantic');
  await checkSatellite(page, label, 'atlantic');
  await checkFloaterSite(page, label);
  await checkAlerts(page, label);
  await checkPlace(page, label);
  await checkSummary(page, label);
  await checkCityMarkers(page, label, 25.76, -80.19, 'Miami');
});

await checkBasin('East Pacific', EPAC_DIST, async (page, label) => {
  // The grid runs from 32S to 50N, coast to 180 (the international date line) -- covering
  // Hawaii, past the Oregon/Washington coast into BC, and past the Peru/Ecuador coast into
  // Chile, well past the NHC's narrower official Eastern Pacific boundary and past maxBounds
  // itself with room to spare. Real climatology/EOF/ENSO SST (plus the California Current
  // extended north and a new Humboldt/Peru Current feature added south) runs across the *whole*
  // grid -- no masking on this side, since an earlier attempt at masking part of a widened grid
  // produced a hard visible seam in open water. The east edge is the opposite case: the grid's
  // box reaches past Mexico/Central America's Pacific coast into the Gulf of Mexico, Caribbean
  // and open Atlantic -- a different ocean, so that side *is* masked (mirrors the Atlantic
  // build's own Panama-corridor exclusion). The pan limit (maxBounds) should still clamp before
  // showing uncovered map area beyond the grid entirely.
  await page.evaluate(() => window.SSTSIM.map.fitBounds([[30, -190], [70, -150]]));   // toward the far North Pacific/beyond the date line
  await page.waitForTimeout(300);
  const clampedWestLon = await page.evaluate(() => window.SSTSIM.map.getBounds().getWest());
  check(`[${label}] map cannot pan west past the international date line`, clampedWestLon > -185);

  await page.evaluate(() => window.SSTSIM.map.setView([-45, -90], 5));   // toward the South Pacific, well past the grid's southern edge
  await page.waitForTimeout(300);
  const clampedSouthLat = await page.evaluate(() => window.SSTSIM.map.getBounds().getSouth());
  check(`[${label}] map cannot pan south past the Peru/Chile coast edge of the grid`, clampedSouthLat > -35);

  const basinSamples = await page.evaluate(() => ({
    offshore: window.SSTSIM.sample(15, -120),          // open water, mid-domain
    nearCoast: window.SSTSIM.sample(15, -95),           // open water off southern Mexico
    hawaii: window.SSTSIM.sample(20.5, -157),           // Hawaii's waters
    dateLine: window.SSTSIM.sample(20, -179),           // near the grid's own western edge, by the date line
    northOregon: window.SSTSIM.sample(43, -125),        // California Current extended north
    peru: window.SSTSIM.sample(-12, -78),               // new Humboldt Current, south of the equator
    southOfDomain: window.SSTSIM.sample(-34, -90),      // south of the grid's own 32S edge
    northOfDomain: window.SSTSIM.sample(52, -125),      // north of the grid's own 50N edge
    gulfOfCalifornia: window.SSTSIM.sample(28, -111),   // real Pacific feature, must stay real
    gulfOfMexico: window.SSTSIM.sample(24, -80),        // Florida Straits -- a different ocean, must be excluded
  }));
  check(`[${label}] open ocean SST is real data`, Number.isFinite(basinSamples.offshore.sst));
  check(`[${label}] coastal SST off southern Mexico is real data`, Number.isFinite(basinSamples.nearCoast.sst));
  check(`[${label}] Hawaii has real SST`, Number.isFinite(basinSamples.hawaii.sst));
  check(`[${label}] SST reaches the grid's own western edge near the date line`, Number.isFinite(basinSamples.dateLine.sst));
  check(`[${label}] California Current SST off northern Oregon is real data`, Number.isFinite(basinSamples.northOregon.sst));
  check(`[${label}] Humboldt Current SST off Peru is real data`, Number.isFinite(basinSamples.peru.sst));
  check(`[${label}] Humboldt Current cools the Peru coast noticeably below the open-ocean baseline`, basinSamples.peru.sst < basinSamples.offshore.sst - 3);
  check(`[${label}] south of the grid's own southern edge is outside the simulated area`, Number.isNaN(basinSamples.southOfDomain.sst));
  check(`[${label}] Gulf of California still has real SST`, Number.isFinite(basinSamples.gulfOfCalifornia.sst));
  check(`[${label}] Gulf of Mexico/Florida Straits is excluded (wrong ocean)`, Number.isNaN(basinSamples.gulfOfMexico.sst));
  check(`[${label}] north of the grid's own northern edge is outside the simulated area`, Number.isNaN(basinSamples.northOfDomain.sst));

  await checkHumidity(page, label, 16.86, -99.88);
  await checkShear(page, label, SHEAR_SPECS.eastpacific);
  await page.evaluate(() => window.SSTSIM.setView('sst'));   // the steering checks start from the default view
  await checkSteering(page, label, STEER_SPECS.eastpacific);
  await checkEnsoHold(page, label);
  await checkEnvSeasons(page, label, EPAC_DIST);
  await checkCityMarkers(page, label, 16.86, -99.88, 'Acapulco');
  await checkStormsBasin(page, label, 'eastpacific');
});

await checkBasin('West Pacific', WPAC_DIST, async (page, label) => {
  // The grid runs 6S-56N, 100E-180 (the date line) -- JTWC's own real western boundary on the
  // west, the date line itself on the east (mirrors EPAC's own west-edge date-line clamp), and a
  // coastline-following curve on the south that hugs the equator near Sumatra/Java/New Guinea but
  // dips a few degrees further south in open water between them (Molucca Sea) -- never a flat
  // line at 0. Unlike the Atlantic/EPAC builds, this basin's own marginal seas (Yellow, Bohai,
  // Sea of Japan) are real *in-basin* water, not a different ocean to mask out.
  await page.evaluate(() => window.SSTSIM.map.fitBounds([[20, 170], [55, 210]]));   // toward the far North Pacific/beyond the date line
  await page.waitForTimeout(300);
  const clampedEastLon = await page.evaluate(() => window.SSTSIM.map.getBounds().getEast());
  check(`[${label}] map cannot pan east past the international date line`, clampedEastLon < 185);

  await page.evaluate(() => window.SSTSIM.map.setView([-20, 130], 5));   // toward the Coral Sea / Australian region, well past the grid's southern edge
  await page.waitForTimeout(300);
  const clampedSouthLat = await page.evaluate(() => window.SSTSIM.map.getBounds().getSouth());
  check(`[${label}] map cannot pan south past the basin's own southern edge`, clampedSouthLat > -10);

  const basinSamples = await page.evaluate(() => ({
    openWater: window.SSTSIM.sample(20, 140),          // open Philippine Sea, mid-domain
    dateLine: window.SSTSIM.sample(30, 179),            // near the grid's own eastern edge, by the date line
    yellowSea: window.SSTSIM.sample(37, 122),           // marginal sea, real in-basin water
    bohai: window.SSTSIM.sample(39, 120),               // shallow, semi-enclosed, real in-basin water
    seaOfJapan: window.SSTSIM.sample(40, 136),          // marginal sea, real in-basin water
    kuroshio: window.SSTSIM.sample(32, 133),            // Kuroshio Current band off Kyushu/Shikoku
    vietnamUpwelling: window.SSTSIM.sample(12, 109),    // Vietnam coastal upwelling band
    southOfDomain: window.SSTSIM.sample(-10, 130),      // south of the grid's own 6S edge entirely
    northOfDomain: window.SSTSIM.sample(58, 140),       // north of the grid's own 56N edge
    malaccaStrait: window.SSTSIM.sample(0.5, 102),      // Strait of Malacca -- a different ocean, must be excluded
    moluccaSea: window.SSTSIM.sample(-2, 125),          // south of the equator but inside the south curve's own "wiggle room"
    southChinaSea: window.SSTSIM.sample(10, 112),       // South China Sea proper, well clear of any cutoff
  }));
  check(`[${label}] open ocean SST is real data`, Number.isFinite(basinSamples.openWater.sst));
  check(`[${label}] SST reaches the grid's own eastern edge near the date line`, Number.isFinite(basinSamples.dateLine.sst));
  check(`[${label}] Yellow Sea is real in-basin water, not masked`, Number.isFinite(basinSamples.yellowSea.sst));
  check(`[${label}] Bohai is real in-basin water, not masked`, Number.isFinite(basinSamples.bohai.sst));
  check(`[${label}] Sea of Japan is real in-basin water, not masked`, Number.isFinite(basinSamples.seaOfJapan.sst));
  check(`[${label}] Kuroshio Current band has real SST`, Number.isFinite(basinSamples.kuroshio.sst));
  check(`[${label}] Vietnam upwelling band has real SST`, Number.isFinite(basinSamples.vietnamUpwelling.sst));
  check(`[${label}] south of the grid's own southern edge is outside the simulated area`, Number.isNaN(basinSamples.southOfDomain.sst));
  check(`[${label}] north of the grid's own northern edge is outside the simulated area`, Number.isNaN(basinSamples.northOfDomain.sst));
  check(`[${label}] Strait of Malacca is excluded (wrong ocean)`, Number.isNaN(basinSamples.malaccaStrait.sst));
  check(`[${label}] Molucca Sea (south curve's wiggle room) still has real SST`, Number.isFinite(basinSamples.moluccaSea.sst));
  check(`[${label}] South China Sea proper has real SST`, Number.isFinite(basinSamples.southChinaSea.sst));

  await checkHumidity(page, label, 14.60, 120.98);
  await checkShear(page, label, SHEAR_SPECS.westpacific);
  await page.evaluate(() => window.SSTSIM.setView('sst'));   // the steering checks start from the default view
  await checkSteering(page, label, STEER_SPECS.westpacific);
  await checkEnsoHold(page, label);
  await checkEnvSeasons(page, label, WPAC_DIST);
  await checkCityMarkers(page, label, 14.60, 120.98, 'Manila');
  await checkStormsBasin(page, label, 'westpacific');
});

await checkBasin('North Indian Ocean', NIO_DIST, async (page, label) => {
  // The grid runs 8S-32N, 30E-100E -- deliberately tight (no multi-degree soft-context padding
  // the way the bigger basins have room for; this one's real basin is compact enough that a big
  // fade zone would eat a large share of the map for no real benefit). East (100E) matches
  // WPAC's own west edge exactly, so the two basins hand off cleanly. Unlike the Atlantic's
  // Mediterranean or EPAC's Gulf of Mexico, the Red Sea and Persian Gulf are real *in-basin*
  // water here, not masked. The south edge is a coastline-following curve (Somalia, the
  // Maldives, Sri Lanka), not a flat line at the equator.
  await page.evaluate(() => window.SSTSIM.map.fitBounds([[35, 60], [55, 90]]));   // toward Central Asia, well past the grid's northern edge
  await page.waitForTimeout(300);
  const clampedNorthLat = await page.evaluate(() => window.SSTSIM.map.getBounds().getNorth());
  check(`[${label}] map cannot pan north past the grid's own northern edge`, clampedNorthLat < 34);

  await page.evaluate(() => window.SSTSIM.map.setView([-25, 55], 5));   // toward the South-West Indian Ocean, well past the grid's southern edge
  await page.waitForTimeout(300);
  const clampedSouthLat = await page.evaluate(() => window.SSTSIM.map.getBounds().getSouth());
  check(`[${label}] map cannot pan south past the basin's own southern edge`, clampedSouthLat > -10);

  const basinSamples = await page.evaluate(() => ({
    arabianSea: window.SSTSIM.sample(15, 65),           // open Arabian Sea, mid-domain
    bayOfBengal: window.SSTSIM.sample(15, 88),           // open Bay of Bengal
    redSea: window.SSTSIM.sample(20, 38),                // marginal sea, real in-basin water
    persianGulf: window.SSTSIM.sample(27, 50),           // Persian Gulf shelf feature
    somaliUpwelling: window.SSTSIM.sample(9, 51),        // Great Whirl open-ocean cold dome
    maldives: window.SSTSIM.sample(3, 73),               // south curve's wiggle room around the Maldives
    southOfDomain: window.SSTSIM.sample(-9, 60),         // south of the grid's own 8S edge entirely
    northOfDomain: window.SSTSIM.sample(34, 60),         // north of the grid's own 32N edge
    southOfSomalia: window.SSTSIM.sample(-3, 45),        // south of the curve near Somalia's own coast -- a different basin
    openWiggleWater: window.SSTSIM.sample(-4, 60),       // open water south of the equator but inside the curve's wiggle room
  }));
  check(`[${label}] open Arabian Sea SST is real data`, Number.isFinite(basinSamples.arabianSea.sst));
  check(`[${label}] open Bay of Bengal SST is real data`, Number.isFinite(basinSamples.bayOfBengal.sst));
  check(`[${label}] Red Sea is real in-basin water, not masked`, Number.isFinite(basinSamples.redSea.sst));
  check(`[${label}] Persian Gulf shelf feature has real SST`, Number.isFinite(basinSamples.persianGulf.sst));
  check(`[${label}] Somali upwelling (Great Whirl) dome has real SST`, Number.isFinite(basinSamples.somaliUpwelling.sst));
  check(`[${label}] Maldives (south curve's wiggle room) still has real SST`, Number.isFinite(basinSamples.maldives.sst));
  check(`[${label}] south of the grid's own southern edge is outside the simulated area`, Number.isNaN(basinSamples.southOfDomain.sst));
  check(`[${label}] north of the grid's own northern edge is outside the simulated area`, Number.isNaN(basinSamples.northOfDomain.sst));
  check(`[${label}] south of Somalia's own coast is excluded (a different basin)`, Number.isNaN(basinSamples.southOfSomalia.sst));
  check(`[${label}] open water in the south curve's wiggle room still has real SST`, Number.isFinite(basinSamples.openWiggleWater.sst));

  await checkHumidity(page, label, 19.08, 72.88);
  await checkShear(page, label, SHEAR_SPECS.nio);
  await page.evaluate(() => window.SSTSIM.setView('sst'));   // the steering checks start from the default view
  await checkSteering(page, label, STEER_SPECS.nio);
  await checkEnsoHold(page, label);
  await checkEnvSeasons(page, label, NIO_DIST);
  await checkCityMarkers(page, label, 19.08, 72.88, 'Mumbai');
  await checkStormsBasin(page, label, 'nio');
});

await checkBasin('Australian Region', AUS_DIST, async (page, label) => {
  // The grid runs 44S-4N, 90E-176E. West (90E) is BOM's own standard handoff to the South-West
  // Indian Ocean, a hard straight-line edge in open water. South (44S) runs well past where real
  // cyclones actually form into real, correctly-cooling subtropical water off WA/Victoria/Tasmania
  // (the same call as EPAC's Peru/Chile extension or WPAC's Sea of Okhotsk). East used to be BOM's
  // own 160E handoff to the South Pacific too, but was widened to 176E to fix a real aspect-ratio
  // letterbox on wide screens (see src/template-aus.html's own domain-mask comment) -- real
  // simulated water now reaches the Coral Sea, Tasman Sea, New Caledonia, Vanuatu's own west edge,
  // and nearly all of New Zealand, deliberately overlapping the South Pacific basin's own
  // territory (the same "two basins can cover the same real water" choice as Atlantic/Mediterranean).
  // The north edge is the real cutoff, a coastline-following curve mirroring WPAC's own south
  // curve that hugs Indonesia's islands but dips a few degrees further north in the open water
  // between them, now extended flat out to the new 176E edge.
  await page.evaluate(() => window.SSTSIM.map.fitBounds([[-30, 60], [10, 85]]));   // toward the South-West Indian Ocean, well past the grid's western edge
  await page.waitForTimeout(300);
  const clampedWestLon = await page.evaluate(() => window.SSTSIM.map.getBounds().getWest());
  check(`[${label}] map cannot pan west past the grid's own western edge`, clampedWestLon > 88);

  await page.evaluate(() => window.SSTSIM.map.fitBounds([[-30, 180], [10, 200]]));   // toward Fiji/the central South Pacific, well past the grid's own widened eastern edge
  await page.waitForTimeout(300);
  const clampedEastLon = await page.evaluate(() => window.SSTSIM.map.getBounds().getEast());
  check(`[${label}] map cannot pan east past the grid's own eastern edge`, clampedEastLon < 178);

  await page.evaluate(() => window.SSTSIM.map.setView([-60, 120], 5));   // toward the Southern Ocean, well past the grid's southern edge
  await page.waitForTimeout(300);
  const clampedSouthLat = await page.evaluate(() => window.SSTSIM.map.getBounds().getSouth());
  check(`[${label}] map cannot pan south past the basin's own southern edge`, clampedSouthLat > -46);

  const basinSamples = await page.evaluate(() => ({
    timorSea: window.SSTSIM.sample(-12, 128),             // open Timor Sea, mid-domain
    coralSea: window.SSTSIM.sample(-18, 152),              // open Coral Sea
    leeuwinCurrent: window.SSTSIM.sample(-30, 113),        // Leeuwin Current band off WA -- verified against raw climatology, no synthetic correction needed
    gulfOfCarpentaria: window.SSTSIM.sample(-15, 139),     // shallow, semi-enclosed sea, real in-basin water -- also verified, no correction needed
    tasmanSea: window.SSTSIM.sample(-35, 165),             // East Australian Current's own extension into the Tasman Sea -- also verified, no correction needed
    newCaledonia: window.SSTSIM.sample(-20, 165),          // the new eastern extension's own real SST
    newZealand: window.SSTSIM.sample(-36, 175.5),          // Auckland area, now reachable
    openWiggleWater: window.SSTSIM.sample(-2, 118),        // Makassar Strait/Banda Sea, south of the equator but inside the north curve's wiggle room
    northOfCurve: window.SSTSIM.sample(3, 106),            // north of the curve near Java -- a different basin
    westOfDomain: window.SSTSIM.sample(-20, 85),           // west of the grid's own 90E edge entirely -- South-West Indian Ocean's territory
    eastOfDomain: window.SSTSIM.sample(-20, 178),          // east of the grid's own widened 176E edge entirely
    southOfDomain: window.SSTSIM.sample(-46, 120),         // south of the grid's own 44S edge entirely
  }));
  check(`[${label}] open Timor Sea SST is real data`, Number.isFinite(basinSamples.timorSea.sst));
  check(`[${label}] open Coral Sea SST is real data`, Number.isFinite(basinSamples.coralSea.sst));
  check(`[${label}] Leeuwin Current band has real SST`, Number.isFinite(basinSamples.leeuwinCurrent.sst));
  check(`[${label}] Gulf of Carpentaria is real in-basin water, not masked`, Number.isFinite(basinSamples.gulfOfCarpentaria.sst));
  check(`[${label}] Tasman Sea (eastern extension) has real SST`, Number.isFinite(basinSamples.tasmanSea.sst));
  check(`[${label}] New Caledonia area (eastern extension) has real SST`, Number.isFinite(basinSamples.newCaledonia.sst));
  check(`[${label}] New Zealand/Auckland area (eastern extension) has real SST`, Number.isFinite(basinSamples.newZealand.sst));
  check(`[${label}] open water in the north curve's wiggle room still has real SST`, Number.isFinite(basinSamples.openWiggleWater.sst));
  check(`[${label}] north of the curve near Java is excluded (a different basin)`, Number.isNaN(basinSamples.northOfCurve.sst));
  check(`[${label}] west of the grid's own western edge is outside the simulated area`, Number.isNaN(basinSamples.westOfDomain.sst));
  check(`[${label}] east of the grid's own widened eastern edge is outside the simulated area`, Number.isNaN(basinSamples.eastOfDomain.sst));
  check(`[${label}] south of the grid's own southern edge is outside the simulated area`, Number.isNaN(basinSamples.southOfDomain.sst));

  await checkHumidity(page, label, -33.87, 151.21);
  await checkShear(page, label, SHEAR_SPECS.aus);
  await page.evaluate(() => window.SSTSIM.setView('sst'));   // the steering checks start from the default view
  await checkSteering(page, label, STEER_SPECS.aus);
  await checkEnsoHold(page, label);
  await checkEnvSeasons(page, label, AUS_DIST);
  await checkCityMarkers(page, label, -33.87, 151.21, 'Sydney');
  await checkStormsBasin(page, label, 'aus');
});

await checkBasin('South-West Indian Ocean', SWIO_DIST, async (page, label) => {
  // The grid runs 44S-0, 30E-108E -- still no masking curve anywhere in it. West (30E) is RSMC La
  // Reunion's own real area-of-responsibility line, running mostly through mainland Africa (which
  // the land mask alone already handles); north (the equator) is IMD's own handoff line, already
  // resolved by NIO's own south curve on its side; south (44S) runs well past where real cyclones
  // actually form into real, correctly-cooling Southern Ocean water, the same call as AUS's own
  // southern extension. East used to be RSMC La Reunion's own 90E line (matching AUS's own west
  // edge exactly) but was widened to 108E for the same reason AUS's own east edge was widened:
  // fixing a real aspect-ratio letterbox on wide screens (see src/template-swio.html's own
  // domain-mask comment) -- the extension reaches into AUS's own real territory and, since this
  // basin has no coastline-following curve at all, a little of southern Sumatra and Java's own
  // coast too, both legitimate per the same reasoning used for AUS's own extension.
  await page.evaluate(() => window.SSTSIM.map.fitBounds([[-30, 5], [-10, 28]]));   // toward the Cape/Atlantic side, well past the grid's western edge
  await page.waitForTimeout(300);
  const clampedWestLon = await page.evaluate(() => window.SSTSIM.map.getBounds().getWest());
  check(`[${label}] map cannot pan west past the grid's own western edge`, clampedWestLon > 28);

  await page.evaluate(() => window.SSTSIM.map.fitBounds([[-30, 110], [-10, 140]]));   // toward the Australian region's own interior, well past the grid's own widened eastern edge
  await page.waitForTimeout(300);
  const clampedEastLon = await page.evaluate(() => window.SSTSIM.map.getBounds().getEast());
  check(`[${label}] map cannot pan east past the grid's own eastern edge`, clampedEastLon < 110);

  await page.evaluate(() => window.SSTSIM.map.fitBounds([[2, 40], [20, 70]]));   // toward the North Indian Ocean, well past the grid's northern edge
  await page.waitForTimeout(300);
  const clampedNorthLat = await page.evaluate(() => window.SSTSIM.map.getBounds().getNorth());
  check(`[${label}] map cannot pan north past the grid's own northern edge`, clampedNorthLat < 2);

  await page.evaluate(() => window.SSTSIM.map.setView([-60, 55], 5));   // toward the Southern Ocean, well past the grid's southern edge
  await page.waitForTimeout(300);
  const clampedSouthLat = await page.evaluate(() => window.SSTSIM.map.getBounds().getSouth());
  check(`[${label}] map cannot pan south past the basin's own southern edge`, clampedSouthLat > -46);

  const basinSamples = await page.evaluate(() => ({
    openWater: window.SSTSIM.sample(-20, 65),              // open Indian Ocean, mid-domain
    agulhasCurrent: window.SSTSIM.sample(-29, 31),          // Agulhas Current band off Durban -- verified against raw climatology, given a synthetic warm band
    mozambiqueChannel: window.SSTSIM.sample(-18, 40),       // deep channel, real in-basin water -- also verified, no correction needed
    madagascarEast: window.SSTSIM.sample(-18, 52),          // open ocean east of Madagascar
    cocosIslands: window.SSTSIM.sample(-12, 97),            // the new eastern extension's own real SST
    christmasIsland: window.SSTSIM.sample(-10.5, 105.5),    // also in the new eastern extension
    westOfDomain: window.SSTSIM.sample(-20, 25),            // west of the grid's own 30E edge entirely -- the Cape/Atlantic side
    eastOfDomain: window.SSTSIM.sample(-20, 110),           // east of the grid's own widened 108E edge entirely
    northOfDomain: window.SSTSIM.sample(3, 50),             // north of the grid's own equator edge -- NIO's territory
    southOfDomain: window.SSTSIM.sample(-46, 50),           // south of the grid's own 44S edge entirely
  }));
  check(`[${label}] open Indian Ocean SST is real data`, Number.isFinite(basinSamples.openWater.sst));
  check(`[${label}] Agulhas Current band has real SST`, Number.isFinite(basinSamples.agulhasCurrent.sst));
  check(`[${label}] Mozambique Channel is real in-basin water, not masked`, Number.isFinite(basinSamples.mozambiqueChannel.sst));
  check(`[${label}] open water east of Madagascar has real SST`, Number.isFinite(basinSamples.madagascarEast.sst));
  check(`[${label}] Cocos Islands area (eastern extension) has real SST`, Number.isFinite(basinSamples.cocosIslands.sst));
  check(`[${label}] Christmas Island area (eastern extension) has real SST`, Number.isFinite(basinSamples.christmasIsland.sst));
  check(`[${label}] west of the grid's own western edge is outside the simulated area`, Number.isNaN(basinSamples.westOfDomain.sst));
  check(`[${label}] east of the grid's own widened eastern edge is outside the simulated area`, Number.isNaN(basinSamples.eastOfDomain.sst));
  check(`[${label}] north of the grid's own northern edge is outside the simulated area`, Number.isNaN(basinSamples.northOfDomain.sst));
  check(`[${label}] south of the grid's own southern edge is outside the simulated area`, Number.isNaN(basinSamples.southOfDomain.sst));

  await checkHumidity(page, label, -29.86, 31.02);
  await checkShear(page, label, SHEAR_SPECS.swio);
  await page.evaluate(() => window.SSTSIM.setView('sst'));   // the steering checks start from the default view
  await checkSteering(page, label, STEER_SPECS.swio);
  await checkEnsoHold(page, label);
  await checkEnvSeasons(page, label, SWIO_DIST);
  await checkCityMarkers(page, label, -29.86, 31.02, 'Durban');
  await checkStormsBasin(page, label, 'swio');
});

await checkBasin('South Pacific', SPAC_DIST, async (page, label) => {
  // The grid runs 40S-0, 160E-120W (160E to -120/120W) -- RSMC Nadi's own real area-of-
  // responsibility, the first basin in this app that genuinely crosses the antimeridian rather
  // than just touching it (WPAC's own east edge sits exactly at 180). Internally this basin uses
  // a "virtual longitude" convention (the eastern side expressed as real-lon+360, so 120W becomes
  // 240) for all of Leaflet's own pixel/pan math; map.setView/fitBounds calls below use that
  // virtual convention, but window.SSTSIM.sample() takes plain real longitude either side of the
  // date line -- the app's own normLon() helper normalizes it internally, so a test never has to.
  await page.evaluate(() => window.SSTSIM.map.fitBounds([[-30, 140], [-10, 158]]));   // toward the Australian region, well past the grid's western edge
  await page.waitForTimeout(300);
  const clampedWestLon = await page.evaluate(() => window.SSTSIM.map.getBounds().getWest());
  check(`[${label}] map cannot pan west past the grid's own western edge (160E)`, clampedWestLon > 158);

  await page.evaluate(() => window.SSTSIM.map.fitBounds([[-30, 245], [-10, 270]]));   // toward the open East Pacific, well past the grid's eastern edge (virtual lon)
  await page.waitForTimeout(300);
  const clampedEastLon = await page.evaluate(() => window.SSTSIM.map.getBounds().getEast());
  check(`[${label}] map cannot pan east past the grid's own eastern edge (120W)`, clampedEastLon < 242);

  await page.evaluate(() => window.SSTSIM.map.fitBounds([[5, 180], [25, 210]]));   // toward the West Pacific, well past the grid's northern edge (the equator)
  await page.waitForTimeout(300);
  const clampedNorthLat = await page.evaluate(() => window.SSTSIM.map.getBounds().getNorth());
  check(`[${label}] map cannot pan north past the grid's own northern edge (the equator)`, clampedNorthLat < 2);

  await page.evaluate(() => window.SSTSIM.map.setView([-60, 200], 5));   // toward the Southern Ocean, well past the grid's southern edge
  await page.waitForTimeout(300);
  const clampedSouthLat = await page.evaluate(() => window.SSTSIM.map.getBounds().getSouth());
  check(`[${label}] map cannot pan south past the basin's own southern edge`, clampedSouthLat > -42);

  const basinSamples = await page.evaluate(() => ({
    nearDateLineWest: window.SSTSIM.sample(-20, 179.5),     // just west of the date line
    nearDateLineEast: window.SSTSIM.sample(-20, -179.5),    // just east of the date line, real (negative) longitude
    fiji: window.SSTSIM.sample(-18, 178),                   // Fiji, west side
    tahiti: window.SSTSIM.sample(-17.5, -149.6),            // French Polynesia, east side, deep into "virtual" territory
    northOfDomain: window.SSTSIM.sample(3, 180),            // north of the grid's own equator edge
    southOfDomain: window.SSTSIM.sample(-43, 180),          // south of the grid's own 40S edge
    westOfDomain: window.SSTSIM.sample(-20, 155),           // west of the grid's own 160E edge -- the Australian region's territory
    eastOfDomain: window.SSTSIM.sample(-20, -110),          // east of the grid's own 120W edge entirely
  }));
  check(`[${label}] SST is continuous across the date line (west side)`, Number.isFinite(basinSamples.nearDateLineWest.sst));
  check(`[${label}] SST is continuous across the date line (east side)`, Number.isFinite(basinSamples.nearDateLineEast.sst));
  check(`[${label}] SST either side of the date line is within a plausible range of each other`, Math.abs(basinSamples.nearDateLineWest.sst - basinSamples.nearDateLineEast.sst) < 2);
  check(`[${label}] Fiji (west side) has real SST`, Number.isFinite(basinSamples.fiji.sst));
  check(`[${label}] Tahiti/French Polynesia (east side, virtual longitude territory) has real SST`, Number.isFinite(basinSamples.tahiti.sst));
  check(`[${label}] north of the grid's own northern edge is outside the simulated area`, Number.isNaN(basinSamples.northOfDomain.sst));
  check(`[${label}] south of the grid's own southern edge is outside the simulated area`, Number.isNaN(basinSamples.southOfDomain.sst));
  check(`[${label}] west of the grid's own western edge is outside the simulated area`, Number.isNaN(basinSamples.westOfDomain.sst));
  check(`[${label}] east of the grid's own eastern edge is outside the simulated area`, Number.isNaN(basinSamples.eastOfDomain.sst));

  await checkHumidity(page, label, -18.14, 178.42);
  await checkShear(page, label, SHEAR_SPECS.spac);
  await page.evaluate(() => window.SSTSIM.setView('sst'));   // the steering checks start from the default view
  await checkSteering(page, label, STEER_SPECS.spac);
  await checkEnsoHold(page, label);
  await checkEnvSeasons(page, label, SPAC_DIST);
  await checkCityMarkers(page, label, -18.14, 178.42, 'Suva');
  await checkStormsBasin(page, label, 'spac');
});

await checkBasin('South Atlantic', SATL_DIST, async (page, label) => {
  // The grid runs 40S-0, 50W-20E -- the real South Atlantic Ocean itself, bounded by Brazil and
  // southern Africa's own coastlines, with no WMO-recognized RSMC to cite (real activity here is
  // rare enough -- one confirmed case, Hurricane Catarina in 2004 -- that no warning center has an
  // official area of responsibility). No masking curve anywhere in this grid.
  await page.evaluate(() => window.SSTSIM.map.fitBounds([[-30, -75], [-10, -55]]));   // toward South America's interior, well past the grid's western edge
  await page.waitForTimeout(300);
  const clampedWestLon = await page.evaluate(() => window.SSTSIM.map.getBounds().getWest());
  check(`[${label}] map cannot pan west past the grid's own western edge`, clampedWestLon > -55);

  await page.evaluate(() => window.SSTSIM.map.fitBounds([[-30, 25], [-10, 45]]));   // toward southern Africa's interior/the Indian Ocean, well past the grid's eastern edge
  await page.waitForTimeout(300);
  const clampedEastLon = await page.evaluate(() => window.SSTSIM.map.getBounds().getEast());
  check(`[${label}] map cannot pan east past the grid's own eastern edge`, clampedEastLon < 25);

  // This basin's own minZoom was deliberately lowered (4.6, vs ~5.6-5.9 elsewhere) so the default
  // view can show the whole real basin at once (see src/template-satl.html's own map-init
  // comment). maxBounds is the exact real domain here (0/-40), not a padded context box -- padding
  // it used to let a user pan+zoom into a corner with zero real SST in view, a real bug this basin
  // (and Mediterranean) shipped with before it was caught.
  await page.evaluate(() => window.SSTSIM.map.fitBounds([[5, -40], [25, -10]]));   // toward the equatorial/North Atlantic, well past the grid's northern edge
  await page.waitForTimeout(300);
  const clampedNorthLat = await page.evaluate(() => window.SSTSIM.map.getBounds().getNorth());
  check(`[${label}] map cannot pan north past the grid's own northern edge (the equator)`, clampedNorthLat < 1.5);

  await page.evaluate(() => window.SSTSIM.map.setView([-60, -20], 5));   // toward the Southern Ocean, well past the grid's southern edge
  await page.waitForTimeout(300);
  const clampedSouthLat = await page.evaluate(() => window.SSTSIM.map.getBounds().getSouth());
  check(`[${label}] map cannot pan south past the basin's own southern edge`, clampedSouthLat > -41.5);

  // The actual bug this basin shipped with: maxZoom + a pan to a maxBounds corner used to be able
  // to show a view with literally zero real SST, just bare basemap -- sample a small grid across
  // the full viewport at a real corner to confirm that's no longer possible anywhere reachable.
  await page.evaluate(() => window.SSTSIM.map.setView([-0.3, -49.7], 10));
  await page.waitForTimeout(300);
  const cornerCoverage = await page.evaluate(() => {
    const b = window.SSTSIM.map.getBounds();
    const n = b.getNorth(), s = b.getSouth(), e = b.getEast(), w = b.getWest();
    let real = 0, total = 0;
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      total++;
      if (Number.isFinite(window.SSTSIM.sample(s + (n - s) * i / 4, w + (e - w) * j / 4).sst)) real++;
    }
    return real / total;
  });
  check(`[${label}] zoomed to maxZoom at a maxBounds corner, the view isn't entirely non-SST`, cornerCoverage > 0.5);

  const basinSamples = await page.evaluate(() => ({
    openWater: window.SSTSIM.sample(-20, -20),            // open South Atlantic, mid-domain
    benguela: window.SSTSIM.sample(-22.5, 10),            // Benguela Current band off Namibia -- verified against raw climatology, no synthetic correction needed
    brazilCoast: window.SSTSIM.sample(-15, -37),          // Brazil Current band off the Brazilian coast -- also verified, no correction needed
    northOfDomain: window.SSTSIM.sample(3, -20),          // north of the grid's own equator edge -- the Atlantic basin's own territory
    southOfDomain: window.SSTSIM.sample(-43, -20),        // south of the grid's own 40S edge
    westOfDomain: window.SSTSIM.sample(-20, -55),         // west of the grid's own 50W edge entirely -- inside South America
    eastOfDomain: window.SSTSIM.sample(-20, 25),          // east of the grid's own 20E edge entirely -- inside southern Africa
  }));
  check(`[${label}] open South Atlantic SST is real data`, Number.isFinite(basinSamples.openWater.sst));
  check(`[${label}] Benguela Current band has real SST`, Number.isFinite(basinSamples.benguela.sst));
  check(`[${label}] Brazil Current band has real SST`, Number.isFinite(basinSamples.brazilCoast.sst));
  check(`[${label}] north of the grid's own northern edge is outside the simulated area`, Number.isNaN(basinSamples.northOfDomain.sst));
  check(`[${label}] south of the grid's own southern edge is outside the simulated area`, Number.isNaN(basinSamples.southOfDomain.sst));
  check(`[${label}] west of the grid's own western edge is outside the simulated area`, Number.isNaN(basinSamples.westOfDomain.sst));
  check(`[${label}] east of the grid's own eastern edge is outside the simulated area`, Number.isNaN(basinSamples.eastOfDomain.sst));

  await checkHumidity(page, label, -22.91, -43.17);
  await checkShear(page, label, SHEAR_SPECS.satl);
  await page.evaluate(() => window.SSTSIM.setView('sst'));   // the steering checks start from the default view
  await checkSteering(page, label, STEER_SPECS.satl);
  await checkEnsoHold(page, label);
  await checkEnvSeasons(page, label, SATL_DIST);
  await checkCityMarkers(page, label, -22.91, -43.17, 'Rio de Janeiro');
  await checkStormsBasin(page, label, 'satl');
});

await checkBasin('Mediterranean', MED_DIST, async (page, label) => {
  // The grid runs 30N-48N, 10W-42E -- the real Mediterranean Sea itself (Strait of Gibraltar to
  // the Levantine coast, the Libyan coast to the northern Adriatic), widened to also cover the
  // Black Sea in full (a real marginal sea, treated as real in-basin water the same way NIO treats
  // the Red Sea/Persian Gulf) and western Spain/Portugal's own Algarve coast on the open-Atlantic
  // side of Gibraltar. No WMO-recognized RSMC here either -- medicanes get tracked informally, not
  // by a single designated warning center. maxBounds is the exact real domain here (not a padded
  // context box) -- a basin that pads maxBounds past the real domain lets a user pan+zoom into a
  // corner with zero real SST in view, a real bug this basin (and South Atlantic) shipped with
  // before it was caught, so this basin's own pan-limit checks are a little tighter than most.
  await page.evaluate(() => window.SSTSIM.map.fitBounds([[34, -24], [42, -14]]));   // toward the open Atlantic, well past the grid's western edge
  await page.waitForTimeout(300);
  const clampedWestLon = await page.evaluate(() => window.SSTSIM.map.getBounds().getWest());
  check(`[${label}] map cannot pan west past the grid's own western edge`, clampedWestLon > -11.5);

  await page.evaluate(() => window.SSTSIM.map.fitBounds([[34, 46], [42, 60]]));   // toward the Caucasus/Iran, well past the grid's eastern edge
  await page.waitForTimeout(300);
  const clampedEastLon = await page.evaluate(() => window.SSTSIM.map.getBounds().getEast());
  check(`[${label}] map cannot pan east past the grid's own eastern edge`, clampedEastLon < 43.5);

  await page.evaluate(() => window.SSTSIM.map.fitBounds([[50, 20], [60, 40]]));   // toward Russia's interior, well past the grid's northern edge
  await page.waitForTimeout(300);
  const clampedNorthLat = await page.evaluate(() => window.SSTSIM.map.getBounds().getNorth());
  check(`[${label}] map cannot pan north past the grid's own northern edge`, clampedNorthLat < 49.5);

  // This basin's own domain is much wider (52 deg) than tall (18 deg), and minZoom is tuned to
  // the width so the whole thing fits by default -- at that same zoom the viewport is taller in
  // degrees than the domain itself, so the view legitimately letterboxes a few degrees past the
  // north/south edges (there's no narrower zoom available to avoid it). The threshold here has
  // room for that; it's still tight enough to catch an actual failure to clamp.
  await page.evaluate(() => window.SSTSIM.map.setView([20, 15], 5));   // toward the Sahara, well past the grid's southern edge
  await page.waitForTimeout(300);
  const clampedSouthLat = await page.evaluate(() => window.SSTSIM.map.getBounds().getSouth());
  check(`[${label}] map cannot pan south past the basin's own southern edge`, clampedSouthLat > 20);

  // The actual bug this basin shipped with: maxZoom + a pan to a maxBounds corner used to be able
  // to show a view with literally zero real SST, just bare basemap -- sample a small grid across
  // the full viewport at a real corner to confirm that's no longer possible anywhere reachable.
  await page.evaluate(() => window.SSTSIM.map.setView([47.7, -9.7], 10));
  await page.waitForTimeout(300);
  const cornerCoverage = await page.evaluate(() => {
    const b = window.SSTSIM.map.getBounds();
    const n = b.getNorth(), s = b.getSouth(), e = b.getEast(), w = b.getWest();
    let real = 0, total = 0;
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      total++;
      if (Number.isFinite(window.SSTSIM.sample(s + (n - s) * i / 4, w + (e - w) * j / 4).sst)) real++;
    }
    return real / total;
  });
  check(`[${label}] zoomed to maxZoom at a maxBounds corner, the view isn't entirely non-SST`, cornerCoverage > 0.5);

  const basinSamples = await page.evaluate(() => ({
    openWater: window.SSTSIM.sample(36, 18),              // open central Mediterranean, mid-domain
    gibraltar: window.SSTSIM.sample(35.9, -4.5),          // Alboran Sea, right at the strait
    aegean: window.SSTSIM.sample(38, 25),                 // Aegean Sea, real in-basin water
    adriatic: window.SSTSIM.sample(43, 15),               // Adriatic Sea, real in-basin water
    blackSea: window.SSTSIM.sample(43, 34),               // Black Sea, real in-basin water now that the domain covers it
    azov: window.SSTSIM.sample(46, 37),                   // Sea of Azov, real in-basin water
    westernSpain: window.SSTSIM.sample(36.6, -6.5),       // Cadiz/Gulf of Cadiz, open-Atlantic side of Gibraltar
    algarve: window.SSTSIM.sample(37, -8),                // Portugal's own Algarve coast
    northOfDomain: window.SSTSIM.sample(49, 15),          // north of the grid's own 48N edge
    southOfDomain: window.SSTSIM.sample(29, 15),          // south of the grid's own 30N edge
    westOfDomain: window.SSTSIM.sample(38, -11),          // west of the grid's own 10W edge entirely
    eastOfDomain: window.SSTSIM.sample(38, 43),           // east of the grid's own 42E edge entirely
  }));
  check(`[${label}] open Mediterranean SST is real data`, Number.isFinite(basinSamples.openWater.sst));
  check(`[${label}] Alboran Sea (right at Gibraltar) has real SST`, Number.isFinite(basinSamples.gibraltar.sst));
  check(`[${label}] Aegean Sea is real in-basin water, not masked`, Number.isFinite(basinSamples.aegean.sst));
  check(`[${label}] Adriatic Sea is real in-basin water, not masked`, Number.isFinite(basinSamples.adriatic.sst));
  check(`[${label}] Black Sea is real in-basin water, not masked`, Number.isFinite(basinSamples.blackSea.sst));
  check(`[${label}] Sea of Azov is real in-basin water, not masked`, Number.isFinite(basinSamples.azov.sst));
  check(`[${label}] western Spain (Gulf of Cadiz) has real SST`, Number.isFinite(basinSamples.westernSpain.sst));
  check(`[${label}] Portugal's own Algarve coast has real SST`, Number.isFinite(basinSamples.algarve.sst));
  check(`[${label}] north of the grid's own northern edge is outside the simulated area`, Number.isNaN(basinSamples.northOfDomain.sst));
  check(`[${label}] south of the grid's own southern edge is outside the simulated area`, Number.isNaN(basinSamples.southOfDomain.sst));
  check(`[${label}] west of the grid's own western edge is outside the simulated area`, Number.isNaN(basinSamples.westOfDomain.sst));
  check(`[${label}] east of the grid's own eastern edge is outside the simulated area`, Number.isNaN(basinSamples.eastOfDomain.sst));

  await checkHumidity(page, label, 45.44, 12.33);
  await checkShear(page, label, SHEAR_SPECS.med);
  await page.evaluate(() => window.SSTSIM.setView('sst'));   // the steering checks start from the default view
  await checkSteering(page, label, STEER_SPECS.med);
  await checkEnsoHold(page, label);
  await checkEnvSeasons(page, label, MED_DIST);
  await checkCityMarkers(page, label, 45.44, 12.33, 'Venice');
  await checkStormsBasin(page, label, 'med');
});

// Main menu: basin/mode select, disabled cards stay disabled, Start navigates to the built basin.
async function checkMenu(basinCardText, expectedDistSuffix) {
  const menuErrors = [];
  const menuBrowser = await chromium.launch(launchOpts);
  const menuPage = await menuBrowser.newPage({ viewport: { width: 1000, height: 700 } });
  menuPage.on('pageerror', (e) => menuErrors.push(e.message));
  await menuPage.goto(pathToFileURL(join(ROOT, 'index.html')).href, { waitUntil: 'load' });

  check(`[menu -> ${basinCardText}] Start disabled with nothing picked`, await menuPage.isDisabled('#start'));
  // Every basin card is enabled now; "Forecaster" (the other mode) is the one remaining
  // disabled card in the whole menu, so it's what proves a disabled card can't be selected.
  await menuPage.click('button.card:has-text("Forecaster")').catch(() => {});
  check('disabled mode card ("coming soon") cannot be selected', (await menuPage.getAttribute('button.card:has-text("Forecaster")', 'aria-pressed')) === 'false');
  await menuPage.click(`button.card:has-text("${basinCardText}")`);
  await menuPage.click('button.card:has-text("Simulation")');
  check(`[menu -> ${basinCardText}] Start enabled once basin + mode picked`, !(await menuPage.isDisabled('#start')));
  await Promise.all([menuPage.waitForNavigation({ waitUntil: 'load' }), menuPage.click('#start')]);
  await menuPage.waitForFunction(() => window.__ready === true, { timeout: 15000 });
  check(`[menu -> ${basinCardText}] Start navigates to the simulator, which loads clean`, menuPage.url().endsWith(expectedDistSuffix) && menuErrors.length === 0);
  await menuBrowser.close();
}
// Save / resume: a season left in progress waits behind the menu's Continue card and comes back as it was; a new game deletes it.
// One browser context shares localStorage between the pages, as one browser does between the menu and the simulator.
async function checkSave() {
  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route('**://**/*', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  const errors = [], MENU = pathToFileURL(join(ROOT, 'index.html')).href, SIM = pathToFileURL(ATLANTIC_DIST).href;
  const open = async (url, ready) => { const pg = await ctx.newPage(); pg.on('pageerror', (e) => errors.push(e.message)); await pg.goto(url, { waitUntil: 'load', timeout: 30000 }); if (ready) await pg.waitForFunction(() => window.__ready === true, { timeout: 30000 }); return pg; };
  const meta = (pg) => pg.evaluate(() => { try { return JSON.parse(localStorage.getItem('hf-save-meta')); } catch (e) { return null; } });
  // one fixed history, run on any page: 38 days of a season with its own storms, a warming slider, a depression placed in July; `extra` more hours at the end
  const history = (pg, extra) => pg.evaluate((extra) => {
    const S = window.SSTSIM; S.storms(true); S.setPlaying(false); S.applySeed(31); S.setPlaying(false); S.stormAuto(true);
    S.tick(24 * 38 + 5); S.set('warming', 0.5); S.tick(7); S.stormPlace({ kind: 'td', lat: 17, lon: -52, v: 45 }); S.tick(extra); S.advance(0);
  }, extra);
  const snap = (pg) => pg.evaluate(() => {
    const S = window.SSTSIM, v = S.sliderVals();
    return { hour: S.state().simHour, stats: S.stormState().stats, json: S.stormJSON(), systems: S.stormState().systems.filter((x) => x.alive || x.depNum > 0).map((x) => ({ id: x.id, lat: x.lat, lon: x.lon, v: x.v })), a: S.sample(15, -50), b: S.sample(27, -78), n34: S.enso().n34, warming: v.warming, seed: v.seed,
      bar: document.getElementById('season').innerText.replace(/\s+/g, ' '), playing: document.getElementById('ic-pause').style.display !== 'none', loading: getComputedStyle(document.getElementById('loading')).display,
      resume: document.body.dataset.resume || '', slider: document.getElementById('p-warm').value };
  });
  const same = (x, y) => x.json === y.json && x.hour === y.hour && ['sst', 'humid', 'shear'].every((f) => x.a[f] === y.a[f] && x.b[f] === y.b[f]) && x.n34 === y.n34;
  const clean = () => ctx.pages().length;
  void clean;

  // the menu with nothing saved
  const m0 = await open(MENU);
  const none = await m0.evaluate(() => ({ hidden: document.getElementById('continue').hidden, cls: document.getElementById('shell').classList.contains('has-save') }));
  check('[save] the menu has no Continue card while nothing is saved', none.hidden && !none.cls);
  await m0.close();

  // a season that has not run for a day is not worth saving; one that has is saved a moment after it changes, while the clock is paused
  const p0 = await open(SIM, true);
  await p0.evaluate(() => { const S = window.SSTSIM; S.setPlaying(false); S.deleteSave(); S.applySeed(5); S.setPlaying(false); S.tick(5); S.set('moisture', 3); });
  await p0.waitForTimeout(2200);
  const young = await meta(p0);
  await p0.evaluate(() => { const S = window.SSTSIM; S.tick(24 * 3); S.set('moisture', 4); });
  await p0.waitForFunction(() => localStorage.getItem('hf-save-meta') !== null, { timeout: 8000 }).catch(() => {});
  const autosaved = await meta(p0), size = await p0.evaluate(() => window.SSTSIM.loadSave());
  check(`[save] nothing is saved before the season is a day old (${young ? 'saved' : 'none'}); after three days and a change it is saved by itself within seconds (hour ${autosaved && autosaved.hour}, ${autosaved && autosaved.date}; ${size && (size.bytes / 1024).toFixed(0)} KB, of which weather ${size && (size.weatherBytes / 1024).toFixed(0)} KB and storms ${size && (size.stormBytes / 1024).toFixed(0)} KB)`,
    young === null && !!autosaved && autosaved.hour >= 72 && autosaved.basin === 'atlantic' && autosaved.year >= 2026 && size.bytes < 1.5e6);
  await p0.close();

  // leave through the Menu link: the season waits behind the Continue card
  const p1 = await open(SIM, true);
  await history(p1, 12);                                                       // ends at midnight (hour 936)
  const before = await snap(p1);
  await Promise.all([p1.waitForNavigation({ waitUntil: 'load', timeout: 20000 }), p1.click('#b-menu')]);
  const left = { url: p1.url(), meta: await meta(p1), card: await p1.evaluate(() => ({ hidden: document.getElementById('continue').hidden, text: document.getElementById('continue').innerText.replace(/\s+/g, ' '), hint: document.getElementById('hint').textContent })) };
  check(`[save] the Menu link in the dock goes to the main menu (${left.url.split('/').pop()}), which offers "${left.card.text}"`,
    /index\.html$/.test(left.url) && !left.card.hidden && new RegExp('Atlantic ' + before.stats.year).test(left.card.text) && left.card.text.includes(before.stats.named + ' named') && left.card.text.includes('ACE ' + before.stats.ace.toFixed(1)) && left.meta && left.meta.hour === before.hour);
  const geom = [];
  for (const [w, h] of [[1280, 800], [390, 844]]) {
    await p1.setViewportSize({ width: w, height: h }); await p1.waitForTimeout(150);
    geom.push(await p1.evaluate(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(), c = r('continue'), b = r('basins'); return { w: innerWidth, side: c.left >= b.right - 1 && c.top < b.bottom, above: c.bottom <= b.top + 1, inside: c.left >= 0 && c.right <= innerWidth + 1 }; }));
  }
  await p1.setViewportSize({ width: 1280, height: 800 });
  check(`[save] the Continue card sits beside the picker on a wide screen (${geom[0].side}) and above the basin grid on a phone (${geom[1].above}), inside the screen in both`, geom[0].side && geom[0].inside && geom[1].above && geom[1].inside);
  check('[save] with a season saved, the hint under Start says that a new game replaces it', await (async () => {
    await p1.click('button.card:has-text("Atlantic")'); await p1.click('button.card:has-text("Simulation")');
    return /replaces your saved Atlantic \d{4} season/.test(await p1.textContent('#hint'));
  })());

  // Continue: the page comes back paused, on exactly the season that was left
  await p1.click('button.card:has-text("Atlantic")');                       // (a toggle: nothing is picked now)
  await Promise.all([p1.waitForNavigation({ waitUntil: 'load', timeout: 20000 }), p1.click('#rs-go')]);
  await p1.waitForFunction(() => window.__ready === true, { timeout: 30000 });
  const back = await snap(p1);
  check(`[save] Continue opens the simulator with ?resume=1 on the season that was left: hour ${back.hour}, "${back.bar}", the same ${(back.json.length / 1024).toFixed(0)} KB of storms, warming ${back.warming}, paused`,
    /resume=1/.test(p1.url()) && same(before, back) && back.bar === before.bar && back.warming === 0.5 && Number(back.slider) === 0.5 && !back.playing && back.loading === 'none' && back.resume === 'ok');

  // and it goes on exactly as the uninterrupted season does (saved at midnight, where the engine's keyframes are the ones a restore takes): a fresh page repeats the same history without any save, both run four more days
  const fresh = await open(SIM, true);
  await history(fresh, 12);
  const adv = (pg, h) => pg.evaluate((h) => { const S = window.SSTSIM; S.tick(h); S.advance(0); }, h);
  await adv(p1, 24 * 4 + 3); await adv(fresh, 24 * 4 + 3);
  const [x, y] = [await snap(p1), await snap(fresh)];
  check(`[save] a season saved at midnight continues exactly like the uninterrupted one: after four more days (hour ${x.hour}) the storms (${(x.json.length / 1024).toFixed(0)} KB), SST, humidity, shear and Nino 3.4 are identical`, same(x, y) && x.hour === before.hour + 99);
  await fresh.close();

  // saved at 21Z the storms are exactly where they were and the weather goes on from the same generators; only the age of the engine's keyframes differs, so the continuation is statistical: close, not equal
  const odd = await open(SIM, true);
  await history(odd, 9);                                                       // 21Z
  const oddBefore = await snap(odd);
  await odd.evaluate(() => window.SSTSIM.saveNow());
  const oddBack = await open(SIM + '?resume=1', true);
  const oddNow = await snap(oddBack);
  check(`[save] a season saved at 21Z (hour ${oddBefore.hour}) resumes with the identical storms, clock, fields and season counters (${oddNow.bar})`, same(oddBefore, oddNow) && oddNow.bar === oddBefore.bar && !oddNow.playing);
  await adv(odd, 12); await adv(oddBack, 12);
  const [ox, oy] = [await snap(odd), await snap(oddBack)];
  const gap = ox.systems.map((a) => { const b = oy.systems.find((q) => q.id === a.id); return b ? [Math.hypot(a.lat - b.lat, (a.lon - b.lon) * Math.cos(a.lat * Math.PI / 180)), Math.abs(a.v - b.v)] : [99, 99]; });
  check(`[save] twelve hours later the resumed storms are within ${Math.max(...gap.map((g) => g[0])).toFixed(2)} degrees and ${Math.max(...gap.map((g) => g[1])).toFixed(1)} kt of where the uninterrupted ones are (${gap.length} systems, same list: ${ox.systems.length === oy.systems.length})`,
    ox.hour === oy.hour && ox.systems.length === oy.systems.length && gap.every((g) => g[0] < 1.0 && g[1] < 15));
  await odd.close(); await oddBack.close();

  // a new game deletes the save
  await Promise.all([p1.waitForNavigation({ waitUntil: 'load', timeout: 20000 }), p1.click('#b-menu')]);
  const had = await meta(p1);
  await p1.click('button.card:has-text("Atlantic")'); await p1.click('button.card:has-text("Simulation")');
  await Promise.all([p1.waitForNavigation({ waitUntil: 'load', timeout: 20000 }), p1.click('#start')]);
  await p1.waitForFunction(() => window.__ready === true, { timeout: 30000 });
  const gone = await p1.evaluate(() => ({ meta: localStorage.getItem('hf-save-meta'), save: localStorage.getItem('hf-save'), playing: document.getElementById('ic-pause').style.display !== 'none', url: location.href }));
  check(`[save] Start on the menu begins a new game and deletes the saved season (before: hour ${had && had.hour}; after: meta ${gone.meta}, season ${gone.save}), the simulator runs at once (${gone.playing}) and the URL has no resume flag`,
    !!had && gone.meta === null && gone.save === null && gone.playing && !/resume/.test(gone.url));

  await p1.evaluate(() => { window.SSTSIM.setPlaying(false); window.SSTSIM.deleteSave(); });        // this page is done: paused, nothing of it left on disk (two tabs would take turns at one save)
  // leaving without the Menu link (a closed tab, a typed address): the page saves as it goes away
  const q = await open(SIM, true);
  const qHour = await q.evaluate(() => { const S = window.SSTSIM; S.setPlaying(false); S.deleteSave(); S.applySeed(8); S.setPlaying(false); S.stormAuto(true); S.tick(24 * 12 + 7); S.saveNow(); S.tick(5); S.set('moisture', 6); return S.state().simHour; });   // saved at 12 d 7 h; the five hours and the slider since are not (the saver waits 1.2 s between writes)
  await q.goto(MENU, { waitUntil: 'load' });
  const qMeta = await meta(q);
  check(`[save] a page that is left any other way saves as it goes (hour ${qHour}, saved ${qMeta && qMeta.hour})`, !!qMeta && qMeta.hour === qHour);
  await q.close();

  // a simulator page opened directly beside a saved season does not overwrite it; Restart takes over
  const savedHour = qMeta.hour;                                                    // the season the last page left behind
  const other = await open(SIM, true);                                           // a bookmark of the simulator, with that season saved
  const beside = await other.evaluate(() => ({ resume: document.body.dataset.resume, owner: window.SSTSIM.saveInfo().owner }));
  await other.evaluate(() => { const S = window.SSTSIM; S.setPlaying(false); S.stormAuto(true); S.tick(24 * 6); S.set('moisture', 4); });
  await other.waitForTimeout(1800);
  const kept = (await meta(other)).hour;
  await other.evaluate(() => { const S = window.SSTSIM; S.applySeed(12); S.setPlaying(false); S.tick(24 * 3); S.set('moisture', 2); });
  await other.waitForTimeout(1800);
  const taken = (await meta(other)).hour;
  check(`[save] a simulator page opened directly beside a saved season leaves it alone (hour ${savedHour} before, ${kept} after six more days on the new page; it said so: ${beside.resume}) and Restart takes over (the save is now hour ${taken})`,
    beside.resume === 'beside' && beside.owner === false && kept === savedHour && taken === 72 && (await other.evaluate(() => window.SSTSIM.saveInfo().owner)) === true);
  await other.close();

  // ?resume=1 with nothing saved starts a new season; a save from another version is refused, said so, and removed
  await p1.evaluate(() => { window.SSTSIM.setPlaying(false); window.SSTSIM.deleteSave(); });                  // paused, so that it does not write the season again as it goes
  await p1.goto(SIM + '?resume=1'); await p1.waitForFunction(() => window.__ready === true, { timeout: 30000 });
  const nothing = await p1.evaluate(() => ({ resume: document.body.dataset.resume, playing: document.getElementById('ic-pause').style.display !== 'none' }));
  check(`[save] ?resume=1 with nothing saved says so (${nothing.resume}) and starts a new season that runs (${nothing.playing})`, nothing.resume === 'none' && nothing.playing);
  const refusals = [];
  for (const kind of ['made-up', 'old format', 'other engine', 'other grid']) {                                  // a real save made on this page, changed in one way
    await p1.evaluate((kind) => {
      const S = window.SSTSIM; S.storms(true); S.setPlaying(false); S.applySeed(3); S.setPlaying(false); S.tick(24 * 3); S.saveNow();
      let s = JSON.parse(localStorage.getItem('hf-save'));
      if (kind === 'made-up') s = { v: 999 }; else if (kind === 'old format') s.v = 0; else if (kind === 'other engine') s.sv = String(s.sv) + '+1'; else s.n = s.n + 1;
      localStorage.setItem('hf-save', JSON.stringify(s));
    }, kind);
    await p1.goto(SIM + '?resume=1'); await p1.waitForFunction(() => window.__ready === true, { timeout: 30000 });
    refusals.push({ kind, ...(await p1.evaluate(() => ({ resume: document.body.dataset.resume, playing: document.getElementById('ic-pause').style.display !== 'none', meta: localStorage.getItem('hf-save-meta'), save: localStorage.getItem('hf-save') }))) });
  }
  check(`[save] a save that cannot be used is refused, said so, and removed, and a new season runs (${refusals.map((r) => r.kind + ': ' + r.resume).join(', ')})`,
    refusals.every((r) => r.resume === 'refused' && r.playing && r.meta === null && r.save === null));

  // Discard needs two clicks
  await p1.evaluate(() => localStorage.setItem('hf-save-meta', JSON.stringify({ v: 1, basin: 'atlantic', name: 'Atlantic', year: 2026, hour: 100, date: 'Jun 5', dep: 1, named: 0, hurr: 0, major: 0, ace: 0, savedAt: Date.now() })));
  await p1.goto(MENU);
  await p1.click('#rs-del'); const afterOne = { hidden: await p1.evaluate(() => document.getElementById('continue').hidden), label: await p1.textContent('#rs-del') };
  await p1.click('#rs-del');
  const afterTwo = { hidden: await p1.evaluate(() => document.getElementById('continue').hidden), meta: await meta(p1) };
  check(`[save] Discard asks for a second click ("${afterOne.label}") and then removes the saved season`, !afterOne.hidden && /again/.test(afterOne.label) && afterTwo.hidden && afterTwo.meta === null);

  // storage that refuses every access (blocked site data): the page still starts and runs, saves nothing and says nothing
  const blocked = await ctx.newPage(), blockedErrors = []; blocked.on('pageerror', (e) => blockedErrors.push(e.message));
  await blocked.addInitScript(() => { const boom = () => { throw new DOMException('blocked', 'SecurityError'); }; Storage.prototype.getItem = boom; Storage.prototype.setItem = boom; Storage.prototype.removeItem = boom; });
  await blocked.goto(SIM, { waitUntil: 'load' }); await blocked.waitForFunction(() => window.__ready === true, { timeout: 30000 });
  const run = await blocked.evaluate(() => { const S = window.SSTSIM, h0 = S.state().simHour; S.setPlaying(false); S.tick(24 * 3); S.set('moisture', 2); return { h0, h1: S.state().simHour, saved: S.saveNow() }; });
  check(`[save] with storage that refuses every access the simulator still starts and runs (hour ${run.h0} to ${run.h1}), saves nothing (${run.saved}) and raises no error (${blockedErrors.length})`, run.h1 > run.h0 && run.saved === false && blockedErrors.length === 0);
  await blocked.close();

  check(`[save] no page errors on the way (${errors.length})`, errors.length === 0);
  if (errors.length) console.log('  ' + errors.join('\n  '));
  await browser.close();
}
await checkSave();
await checkMenu('Atlantic', 'atlantic-sst-simulator.html');
await checkMenu('Eastern Pacific', 'eastpacific-sst-simulator.html');
await checkMenu('Western Pacific', 'westpacific-sst-simulator.html');
await checkMenu('Northern Indian Ocean', 'nio-sst-simulator.html');
await checkMenu('Australian Region', 'aus-sst-simulator.html');
await checkMenu('South-West Indian Ocean', 'swio-sst-simulator.html');
await checkMenu('South Pacific', 'spac-sst-simulator.html');
await checkMenu('South Atlantic', 'satl-sst-simulator.html');
await checkMenu('Mediterranean', 'med-sst-simulator.html');

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
