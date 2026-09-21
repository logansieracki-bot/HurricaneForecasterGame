// End-to-end checks in headless Chromium. Needs a prior `npm run build`.
// Network is stubbed to file:// only, so these also verify the app never
// depends on reaching a live tile provider to be usable.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist/atlantic-sst-simulator.html');

let failed = 0;
function check(name, cond) {
  console.log((cond ? 'ok   ' : 'FAIL ') + name);
  if (!cond) failed++;
}

if (!existsSync(DIST)) {
  console.error('dist/atlantic-sst-simulator.html not found — run `npm run build` first.');
  process.exit(1);
}

// PLAYWRIGHT_CHROMIUM_PATH lets a pinned-but-mismatched local Playwright install point at
// whatever Chromium is actually on disk (e.g. /opt/pw-browsers/chromium in a sandboxed dev
// environment); CI installs a matching browser itself and leaves this unset.
const launchOpts = process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.route('**://**/*', (route) => route.request().url().startsWith('file://') ? route.continue() : route.abort());
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(pathToFileURL(DIST).href, { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(() => window.__ready === true, { timeout: 15000 });
await page.waitForTimeout(1000);

check('loads with no JS errors', errors.length === 0);
if (errors.length) console.log('  ' + errors.join('\n  '));

const initialTheme = await page.evaluate(() => document.querySelector('#themes button[aria-pressed="true"]')?.textContent);
check('starts on Blue Marble theme', initialTheme === 'Blue Marble');

const state1 = await page.evaluate(() => window.SSTSIM.state());
await page.waitForTimeout(1200);
const state2 = await page.evaluate(() => window.SSTSIM.state());
check('sim clock advances', state2.simHour > state1.simHour);

// Satellite theme has no network in this test: must fall back to Blue Marble, not hang or throw.
await page.click('#themes button:has-text("Satellite")');
await page.waitForTimeout(11000);
const afterSat = await page.evaluate(() => document.querySelector('#themes button[aria-pressed="true"]')?.textContent);
check('Satellite theme falls back to Blue Marble without a live tile source', afterSat === 'Blue Marble');

const vectorThemes = ['NHC', 'Plain', 'Chart', 'Blue Marble'];
for (const name of vectorThemes) {
  await page.click(`#themes button:has-text("${name}")`);
  await page.waitForTimeout(200);
}
check('vector themes switch without errors', errors.length === 0);

const bmDebugState = await page.evaluate(() => window.SSTSIM.bm());
check('SSTSIM.bm() debug hook works on Blue Marble theme', bmDebugState && bmDebugState.theme === 'bm' && errors.length === 0);

// The border-line data only covers roughly the Atlantic domain + a margin (e.g. it's empty
// over Alaska/Yukon); panning there used to show a map with no state/country outlines at all.
// maxBounds should clamp the view back before it gets there.
await page.evaluate(() => window.SSTSIM.map.fitBounds([[25, -172], [75, -90]]));
await page.waitForTimeout(300);
const clampedWestLon = await page.evaluate(() => window.SSTSIM.map.getBounds().getWest());
check('map cannot pan into the uncovered Alaska/Yukon region', clampedWestLon > -110);

// The pan limit is the North Atlantic basin, full stop: trying to jump down to South America /
// the South Atlantic should clamp back north of it, the same way the Alaska/Yukon edge does.
await page.evaluate(() => window.SSTSIM.map.setView([-20, -30], 5));
await page.waitForTimeout(300);
const clampedSouthLat = await page.evaluate(() => window.SSTSIM.map.getBounds().getSouth());
check('map cannot pan down into South America / the South Atlantic', clampedSouthLat > -5);

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
check('Mediterranean SST is excluded', Number.isNaN(basinSamples.med.sst));
check('Gibraltar/Alboran Sea is excluded', Number.isNaN(basinSamples.gibraltar.sst));
check('Bay of Biscay (open Atlantic) is not clipped by the Mediterranean cutoff', Number.isFinite(basinSamples.bayOfBiscay.sst));
check('South Atlantic SST is excluded', Number.isNaN(basinSamples.southAtlantic.sst));
check('southern MDR (a few degrees south of the equator) still has real SST', Number.isFinite(basinSamples.southernMDR.sst));
check('open North Atlantic SST is still real data', Number.isFinite(basinSamples.openAtlantic.sst));

await browser.close();

// Main menu: basin/mode select, disabled cards stay disabled, Start navigates to the built basin.
const menuErrors = [];
const menuBrowser = await chromium.launch(launchOpts);
const menuPage = await menuBrowser.newPage({ viewport: { width: 1000, height: 700 } });
menuPage.on('pageerror', (e) => menuErrors.push(e.message));
await menuPage.goto(pathToFileURL(join(ROOT, 'index.html')).href, { waitUntil: 'load' });

check('Start disabled with nothing picked', await menuPage.isDisabled('#start'));
await menuPage.click('button.card:has-text("Eastern Pacific")').catch(() => {});
check('disabled basin card ("coming soon") cannot be selected', (await menuPage.getAttribute('button.card:has-text("Eastern Pacific")', 'aria-pressed')) === 'false');
await menuPage.click('button.card:has-text("Atlantic")');
await menuPage.click('button.card:has-text("Simulation")');
check('Start enabled once basin + mode picked', !(await menuPage.isDisabled('#start')));
await Promise.all([menuPage.waitForNavigation({ waitUntil: 'load' }), menuPage.click('#start')]);
await menuPage.waitForFunction(() => window.__ready === true, { timeout: 15000 });
check('Start navigates to the Atlantic simulator, which loads clean', menuPage.url().endsWith('atlantic-sst-simulator.html') && menuErrors.length === 0);
await menuBrowser.close();

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
