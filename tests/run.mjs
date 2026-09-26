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

for (const [label, dist] of [['Atlantic', ATLANTIC_DIST], ['East Pacific', EPAC_DIST], ['West Pacific', WPAC_DIST], ['North Indian Ocean', NIO_DIST], ['Australian Region', AUS_DIST], ['South-West Indian Ocean', SWIO_DIST]]) {
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

  await checkCityMarkers(page, label, 19.08, 72.88, 'Mumbai');
});

await checkBasin('Australian Region', AUS_DIST, async (page, label) => {
  // The grid runs 44S-4N, 90E-160E. West (90E) and east (160E) are BOM's own standard handoffs
  // to the neighboring South-West Indian Ocean and South Pacific basins -- both hard straight-line
  // edges in open water, not coastline-following curves. South (44S) runs well past where real
  // cyclones actually form into real, correctly-cooling subtropical water off WA/Victoria/Tasmania
  // (the same call as EPAC's Peru/Chile extension or WPAC's Sea of Okhotsk) -- deliberately
  // stopping well short of New Zealand rather than reaching for it. The north edge is the real
  // case needing a cutoff, a coastline-following curve mirroring WPAC's own south curve that hugs
  // Indonesia's islands but dips a few degrees further north in the open water between them.
  await page.evaluate(() => window.SSTSIM.map.fitBounds([[-30, 60], [10, 85]]));   // toward the South-West Indian Ocean, well past the grid's western edge
  await page.waitForTimeout(300);
  const clampedWestLon = await page.evaluate(() => window.SSTSIM.map.getBounds().getWest());
  check(`[${label}] map cannot pan west past the grid's own western edge`, clampedWestLon > 88);

  await page.evaluate(() => window.SSTSIM.map.fitBounds([[-30, 165], [10, 190]]));   // toward the South Pacific/New Zealand, well past the grid's eastern edge
  await page.waitForTimeout(300);
  const clampedEastLon = await page.evaluate(() => window.SSTSIM.map.getBounds().getEast());
  check(`[${label}] map cannot pan east past the grid's own eastern edge`, clampedEastLon < 162);

  await page.evaluate(() => window.SSTSIM.map.setView([-60, 120], 5));   // toward the Southern Ocean, well past the grid's southern edge
  await page.waitForTimeout(300);
  const clampedSouthLat = await page.evaluate(() => window.SSTSIM.map.getBounds().getSouth());
  check(`[${label}] map cannot pan south past the basin's own southern edge`, clampedSouthLat > -46);

  const basinSamples = await page.evaluate(() => ({
    timorSea: window.SSTSIM.sample(-12, 128),             // open Timor Sea, mid-domain
    coralSea: window.SSTSIM.sample(-18, 152),              // open Coral Sea
    leeuwinCurrent: window.SSTSIM.sample(-30, 113),        // Leeuwin Current band off WA -- verified against raw climatology, no synthetic correction needed
    gulfOfCarpentaria: window.SSTSIM.sample(-15, 139),     // shallow, semi-enclosed sea, real in-basin water -- also verified, no correction needed
    openWiggleWater: window.SSTSIM.sample(-2, 118),        // Makassar Strait/Banda Sea, south of the equator but inside the north curve's wiggle room
    northOfCurve: window.SSTSIM.sample(3, 106),            // north of the curve near Java -- a different basin
    westOfDomain: window.SSTSIM.sample(-20, 85),           // west of the grid's own 90E edge entirely -- South-West Indian Ocean's territory
    eastOfDomain: window.SSTSIM.sample(-20, 165),          // east of the grid's own 160E edge entirely -- South Pacific's territory (where New Zealand sits, deliberately excluded)
    southOfDomain: window.SSTSIM.sample(-46, 120),         // south of the grid's own 44S edge entirely
  }));
  check(`[${label}] open Timor Sea SST is real data`, Number.isFinite(basinSamples.timorSea.sst));
  check(`[${label}] open Coral Sea SST is real data`, Number.isFinite(basinSamples.coralSea.sst));
  check(`[${label}] Leeuwin Current band has real SST`, Number.isFinite(basinSamples.leeuwinCurrent.sst));
  check(`[${label}] Gulf of Carpentaria is real in-basin water, not masked`, Number.isFinite(basinSamples.gulfOfCarpentaria.sst));
  check(`[${label}] open water in the north curve's wiggle room still has real SST`, Number.isFinite(basinSamples.openWiggleWater.sst));
  check(`[${label}] north of the curve near Java is excluded (a different basin)`, Number.isNaN(basinSamples.northOfCurve.sst));
  check(`[${label}] west of the grid's own western edge is outside the simulated area`, Number.isNaN(basinSamples.westOfDomain.sst));
  check(`[${label}] east of the grid's own eastern edge is outside the simulated area`, Number.isNaN(basinSamples.eastOfDomain.sst));
  check(`[${label}] south of the grid's own southern edge is outside the simulated area`, Number.isNaN(basinSamples.southOfDomain.sst));

  await checkCityMarkers(page, label, -33.87, 151.21, 'Sydney');
});

await checkBasin('South-West Indian Ocean', SWIO_DIST, async (page, label) => {
  // The grid runs 44S-0, 30E-90E -- a first among the live basins in having no masking curve
  // anywhere at all. East (90E) matches AUS's own west edge exactly; west (30E) is RSMC La
  // Reunion's own real area-of-responsibility line, running mostly through mainland Africa
  // (which the land mask alone already handles); north (the equator) is IMD's own handoff line,
  // already resolved by NIO's own south curve on its side; south (44S) runs well past where real
  // cyclones actually form into real, correctly-cooling Southern Ocean water, the same call as
  // AUS's own southern extension. All four are genuinely clean straight lines, not an oversight.
  await page.evaluate(() => window.SSTSIM.map.fitBounds([[-30, 5], [-10, 28]]));   // toward the Cape/Atlantic side, well past the grid's western edge
  await page.waitForTimeout(300);
  const clampedWestLon = await page.evaluate(() => window.SSTSIM.map.getBounds().getWest());
  check(`[${label}] map cannot pan west past the grid's own western edge`, clampedWestLon > 28);

  await page.evaluate(() => window.SSTSIM.map.fitBounds([[-30, 92], [-10, 120]]));   // toward the Australian region, well past the grid's eastern edge
  await page.waitForTimeout(300);
  const clampedEastLon = await page.evaluate(() => window.SSTSIM.map.getBounds().getEast());
  check(`[${label}] map cannot pan east past the grid's own eastern edge`, clampedEastLon < 92);

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
    westOfDomain: window.SSTSIM.sample(-20, 25),            // west of the grid's own 30E edge entirely -- the Cape/Atlantic side
    eastOfDomain: window.SSTSIM.sample(-20, 95),            // east of the grid's own 90E edge entirely -- the Australian region's territory
    northOfDomain: window.SSTSIM.sample(3, 50),             // north of the grid's own equator edge -- NIO's territory
    southOfDomain: window.SSTSIM.sample(-46, 50),           // south of the grid's own 44S edge entirely
  }));
  check(`[${label}] open Indian Ocean SST is real data`, Number.isFinite(basinSamples.openWater.sst));
  check(`[${label}] Agulhas Current band has real SST`, Number.isFinite(basinSamples.agulhasCurrent.sst));
  check(`[${label}] Mozambique Channel is real in-basin water, not masked`, Number.isFinite(basinSamples.mozambiqueChannel.sst));
  check(`[${label}] open water east of Madagascar has real SST`, Number.isFinite(basinSamples.madagascarEast.sst));
  check(`[${label}] west of the grid's own western edge is outside the simulated area`, Number.isNaN(basinSamples.westOfDomain.sst));
  check(`[${label}] east of the grid's own eastern edge is outside the simulated area`, Number.isNaN(basinSamples.eastOfDomain.sst));
  check(`[${label}] north of the grid's own northern edge is outside the simulated area`, Number.isNaN(basinSamples.northOfDomain.sst));
  check(`[${label}] south of the grid's own southern edge is outside the simulated area`, Number.isNaN(basinSamples.southOfDomain.sst));

  await checkCityMarkers(page, label, -29.86, 31.02, 'Durban');
});

// Main menu: basin/mode select, disabled cards stay disabled, Start navigates to the built basin.
async function checkMenu(basinCardText, expectedDistSuffix) {
  const menuErrors = [];
  const menuBrowser = await chromium.launch(launchOpts);
  const menuPage = await menuBrowser.newPage({ viewport: { width: 1000, height: 700 } });
  menuPage.on('pageerror', (e) => menuErrors.push(e.message));
  await menuPage.goto(pathToFileURL(join(ROOT, 'index.html')).href, { waitUntil: 'load' });

  check(`[menu -> ${basinCardText}] Start disabled with nothing picked`, await menuPage.isDisabled('#start'));
  await menuPage.click('button.card:has-text("South Pacific")').catch(() => {});
  check('disabled basin card ("coming soon") cannot be selected', (await menuPage.getAttribute('button.card:has-text("South Pacific")', 'aria-pressed')) === 'false');
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

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
