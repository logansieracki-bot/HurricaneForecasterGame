// End-to-end checks in headless Chromium. Needs a prior `npm run build`.
// Network is stubbed to file:// only, so these also verify the app never
// depends on reaching a live tile provider to be usable.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.route('**://**/*', (route) => route.request().url().startsWith('file://') ? route.continue() : route.abort());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(pathToFileURL(dist).href, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__ready === true, { timeout: 15000 });
  await page.waitForTimeout(1000);

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

  await page.evaluate(() => window.SSTSIM.setView('sst'));   // leave the page in its default state for any checks after this one

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
  await checkCityMarkers(page, label, 16.86, -99.88, 'Acapulco');
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
  await checkCityMarkers(page, label, 14.60, 120.98, 'Manila');
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
  await checkCityMarkers(page, label, 19.08, 72.88, 'Mumbai');
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
  await checkCityMarkers(page, label, -33.87, 151.21, 'Sydney');
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
  await checkCityMarkers(page, label, -29.86, 31.02, 'Durban');
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
  await checkCityMarkers(page, label, -18.14, 178.42, 'Suva');
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
  await checkCityMarkers(page, label, -22.91, -43.17, 'Rio de Janeiro');
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
  await checkCityMarkers(page, label, 45.44, 12.33, 'Venice');
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
