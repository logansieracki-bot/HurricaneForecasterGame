#!/usr/bin/env node
// Makes the picture of the Tropical card of the main menu: a highly active Atlantic season of the game itself, to be drawn track by track over Blue Marble
// the way the summary's season map is drawn: data/generated/menu-season.json { map (a JPEG, base64), box [lonW, lonE, latS, latN], size [w, h], seed, stats, storms: [{ n, f: [[hour, lat*10, lon*10, kt], ...] }] }.
// The season is found by running whole seasons through the built Atlantic page (dist/, node tools/build.mjs first) for a list of seeds and keeping the one with the most
// accumulated cyclone energy. The Blue Marble is data/raw/earth_day_4096.jpg (python3 tools/fetch.py) with its flat ocean turned to the navy of the summary maps.
//   node tools/make_menu_season.mjs [firstSeed lastSeed]      (the shipped season is seed 27 of 1 to 40: node tools/make_menu_season.mjs 27 27 makes it again alone)
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'data/raw/earth_day_4096.jpg'), PAGE = join(ROOT, 'dist/atlantic-sst-simulator.html');
const BOX = [-100, -8, 6, 52], OUT_W = 736, QUALITY = 0.72, OCEAN = [30, 59, 115], NAVY = [8, 14, 34];
const [s0, s1] = [Number(process.argv[2]) || 1, Number(process.argv[3]) || 36];
if (!existsSync(SRC)) { console.error('data/raw/earth_day_4096.jpg is missing: run python3 tools/fetch.py'); process.exit(1); }
if (!existsSync(PAGE)) { console.error('dist/atlantic-sst-simulator.html is missing: run node tools/build.mjs'); process.exit(1); }
const browser = await chromium.launch();

// 1. the seasons: one whole season a seed, through the page
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.route('**://**/*', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
await page.goto('file://' + PAGE, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
const seasons = [];
for (let seed = s0; seed <= s1; seed++) {
  const r = await page.evaluate((seed) => {
    const S = window.SSTSIM; S.setPlaying(false); S.storms(true); S.stormAuto(true); S.applySeed(seed); S.setPlaying(false); S.tick(24 * 215);
    const rec = S.stormRecord(2026); return { seed, named: rec.named, hurr: rec.hurr, major: rec.major, ace: rec.ace, n: rec.storms.length };
  }, seed);
  seasons.push(r); console.log(`seed ${seed}: ${r.named} named, ${r.hurr} hurricanes, ${r.major} major, ACE ${r.ace.toFixed(0)}`);
}
seasons.sort((a, b) => b.ace - a.ace);
const best = seasons[0]; console.log('best:', JSON.stringify(best));
const season = await page.evaluate((seed) => {
  const S = window.SSTSIM; S.setPlaying(false); S.storms(true); S.stormAuto(true); S.applySeed(seed); S.setPlaying(false); S.tick(24 * 215);
  const rec = S.stormRecord(2026);
  return { stats: { named: rec.named, hurr: rec.hurr, major: rec.major, ace: Math.round(rec.ace) }, storms: rec.storms.map((x) => ({ n: x.name || '', f: (x.trk || []).filter((q) => q[5] <= 2).map((q) => [q[0], Math.round(q[1] * 10), Math.round(q[2] * 10), Math.round(q[3])]) })).filter((x) => x.f.length > 1) };      // (the tropical, subtropical and extratropical fixes: the lows and disturbances a system was before and after leave gaps)
}, best.seed);
await page.close();

// 2. the Blue Marble of the card
const pg = await browser.newPage(); await pg.setContent('<body></body>');
const uri = 'data:image/jpeg;base64,' + readFileSync(SRC).toString('base64');
const pic = await pg.evaluate(async ({ uri, BOX, OUT_W, OCEAN, NAVY, QUALITY }) => {
  const im = new Image(); im.src = uri; await im.decode();
  const sw = im.naturalWidth, sh = im.naturalHeight, [lonW, lonE, latS, latN] = BOX;
  const x0 = Math.round((lonW + 180) / 360 * sw), x1 = Math.round((lonE + 180) / 360 * sw), y0 = Math.round((90 - latN) / 180 * sh), y1 = Math.round((90 - latS) / 180 * sh);
  const w = OUT_W, h = Math.round(OUT_W * (y1 - y0) / (x1 - x0));
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high'; g.drawImage(im, x0, y0, x1 - x0, y1 - y0, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h), a = d.data;
  for (let i = 0; i < a.length; i += 4) {
    const dist = Math.hypot(a[i] - OCEAN[0], a[i + 1] - OCEAN[1], a[i + 2] - OCEAN[2]);
    let k = dist <= 14 ? 1 : dist >= 46 ? 0 : 1 - (dist - 14) / 32; k = k * k * (3 - 2 * k);
    if (k > 0) { a[i] += (NAVY[0] - a[i]) * k; a[i + 1] += (NAVY[1] - a[i + 1]) * k; a[i + 2] += (NAVY[2] - a[i + 2]) * k; }
  }
  g.putImageData(d, 0, 0);
  return { b64: c.toDataURL('image/jpeg', QUALITY).split(',')[1], w, h };
}, { uri, BOX, OUT_W, OCEAN, NAVY, QUALITY });
await browser.close();
const out = { map: pic.b64, box: BOX, size: [pic.w, pic.h], seed: best.seed, stats: season.stats, storms: season.storms };
writeFileSync(join(ROOT, 'data/generated/menu-season.json'), JSON.stringify(out));
const fixes = season.storms.reduce((t, x) => t + x.f.length, 0);
console.log(`menu season: seed ${best.seed}, ${season.stats.named} named, ${season.stats.hurr} hurricanes, ACE ${season.stats.ace}; ${season.storms.length} tracks, ${fixes} fixes; map ${pic.w}x${pic.h}, ${(pic.b64.length / 1024).toFixed(0)} KB`);
