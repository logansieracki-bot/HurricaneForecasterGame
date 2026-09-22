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

for (const [label, dist] of [['Atlantic', ATLANTIC_DIST], ['East Pacific', EPAC_DIST]]) {
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

  const initialTheme = await page.evaluate(() => document.querySelector('#themes button[aria-pressed="true"]')?.textContent);
  check(`[${label}] starts on Blue Marble theme`, initialTheme === 'Blue Marble');

  const state1 = await page.evaluate(() => window.SSTSIM.state());
  await page.waitForTimeout(1200);
  const state2 = await page.evaluate(() => window.SSTSIM.state());
  check(`[${label}] sim clock advances`, state2.simHour > state1.simHour);

  // Satellite theme has no network in this test: must fall back to Blue Marble, not hang or throw.
  await page.click('#themes button:has-text("Satellite")');
  await page.waitForTimeout(11000);
  const afterSat = await page.evaluate(() => document.querySelector('#themes button[aria-pressed="true"]')?.textContent);
  check(`[${label}] Satellite theme falls back to Blue Marble without a live tile source`, afterSat === 'Blue Marble');

  const vectorThemes = ['NHC', 'Plain', 'Chart', 'Blue Marble'];
  for (const name of vectorThemes) {
    await page.click(`#themes button:has-text("${name}")`);
    await page.waitForTimeout(200);
  }
  check(`[${label}] vector themes switch without errors`, errors.length === 0);

  const bmDebugState = await page.evaluate(() => window.SSTSIM.bm());
  check(`[${label}] SSTSIM.bm() debug hook works on Blue Marble theme`, bmDebugState && bmDebugState.theme === 'bm' && errors.length === 0);

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

  // This build is the North Atlantic basin only: the Mediterranean and the South Atlantic are
  // their own future basins, so SST there should read as "outside the simulated area" (NaN),
  // not silently show Atlantic data under a basin it doesn't belong to. The southern cutoff sits
  // a few degrees below the equator so the southern Main Development Region isn't clipped.
  const basinSamples = await page.evaluate(() => ({
    med: window.SSTSIM.sample(36, 15),      // central Mediterranean
    gibraltar: window.SSTSIM.sample(35.9, -4.5),     // Alboran Sea, right at the strait
    bayOfBiscay: window.SSTSIM.sample(45, -3),       // open Atlantic off France -- a flat lon cutoff clipped this
    southAtlantic: window.SSTSIM.sample(-15, -20),   // open South Atlantic, well past the cutoff
    southernMDR: window.SSTSIM.sample(-5, -30),      // a few degrees south of the equator, inside the cutoff
    openAtlantic: window.SSTSIM.sample(20, -50),     // sanity check: still real data north of the equator
  }));
  check(`[${label}] Mediterranean SST is excluded`, Number.isNaN(basinSamples.med.sst));
  check(`[${label}] Gibraltar/Alboran Sea is excluded`, Number.isNaN(basinSamples.gibraltar.sst));
  check(`[${label}] Bay of Biscay (open Atlantic) is not clipped by the Mediterranean cutoff`, Number.isFinite(basinSamples.bayOfBiscay.sst));
  check(`[${label}] South Atlantic SST is excluded`, Number.isNaN(basinSamples.southAtlantic.sst));
  check(`[${label}] southern MDR (a few degrees south of the equator) still has real SST`, Number.isFinite(basinSamples.southernMDR.sst));
  check(`[${label}] open North Atlantic SST is still real data`, Number.isFinite(basinSamples.openAtlantic.sst));

  await checkCityMarkers(page, label, 25.76, -80.19, 'Miami');
});

await checkBasin('East Pacific', EPAC_DIST, async (page, label) => {
  // The grid runs from 26S to 44N, coast to 180 (the international date line) -- covering
  // Hawaii, the Oregon/Washington coast, and the Peru/Ecuador coast, well past the NHC's narrower
  // official Eastern Pacific boundary. Real climatology/EOF/ENSO SST (plus the California Current
  // extended north and a new Humboldt/Peru Current feature added south) runs across the *whole*
  // grid -- no sub-region masking, since an earlier attempt at masking part of a widened grid
  // produced a hard visible seam in open water. The pan limit (maxBounds) should still clamp
  // before showing uncovered map area beyond the grid entirely.
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
    southOfDomain: window.SSTSIM.sample(-30, -75),      // south of the grid's own 26S edge
    northOfDomain: window.SSTSIM.sample(48, -125),      // north of the grid's own 44N edge
  }));
  check(`[${label}] open ocean SST is real data`, Number.isFinite(basinSamples.offshore.sst));
  check(`[${label}] coastal SST off southern Mexico is real data`, Number.isFinite(basinSamples.nearCoast.sst));
  check(`[${label}] Hawaii has real SST`, Number.isFinite(basinSamples.hawaii.sst));
  check(`[${label}] SST reaches the grid's own western edge near the date line`, Number.isFinite(basinSamples.dateLine.sst));
  check(`[${label}] California Current SST off northern Oregon is real data`, Number.isFinite(basinSamples.northOregon.sst));
  check(`[${label}] Humboldt Current SST off Peru is real data`, Number.isFinite(basinSamples.peru.sst));
  check(`[${label}] Humboldt Current cools the Peru coast noticeably below the open-ocean baseline`, basinSamples.peru.sst < basinSamples.offshore.sst - 3);
  check(`[${label}] south of the grid's own southern edge is outside the simulated area`, Number.isNaN(basinSamples.southOfDomain.sst));
  check(`[${label}] north of the grid's own northern edge is outside the simulated area`, Number.isNaN(basinSamples.northOfDomain.sst));

  await checkCityMarkers(page, label, 16.86, -99.88, 'Acapulco');
});

// Main menu: basin/mode select, disabled cards stay disabled, Start navigates to the built basin.
async function checkMenu(basinCardText, expectedDistSuffix) {
  const menuErrors = [];
  const menuBrowser = await chromium.launch(launchOpts);
  const menuPage = await menuBrowser.newPage({ viewport: { width: 1000, height: 700 } });
  menuPage.on('pageerror', (e) => menuErrors.push(e.message));
  await menuPage.goto(pathToFileURL(join(ROOT, 'index.html')).href, { waitUntil: 'load' });

  check(`[menu -> ${basinCardText}] Start disabled with nothing picked`, await menuPage.isDisabled('#start'));
  await menuPage.click('button.card:has-text("Western Pacific")').catch(() => {});
  check('disabled basin card ("coming soon") cannot be selected', (await menuPage.getAttribute('button.card:has-text("Western Pacific")', 'aria-pressed')) === 'false');
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

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
