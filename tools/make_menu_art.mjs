#!/usr/bin/env node
// Makes the world picture of the main menu's basin picker: data/generated/menu-art.json { world (a JPEG, base64), box [lonW, lonE, latS, latN], size [w, h] }.
// Source: data/raw/earth_day_4096.jpg (python3 tools/fetch.py), NASA's Blue Marble. Its flat blue ocean becomes the deep navy of the season maps (the same smooth step
// as tools/make_summary_map.mjs), so the picture sits on the menu's dark page. tools/build.mjs puts the result into index.html. Pillow is not needed: headless Chromium does the pixels.
//   node tools/make_menu_art.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'data/raw/earth_day_4096.jpg');
const BOX = [-180, 180, -62, 72], OUT_W = 1400, QUALITY = 0.7;                                              // the world between 62 S and 72 N: every basin of the game is in it
const OCEAN = [30, 59, 115], NAVY = [8, 14, 34];
if (!existsSync(SRC)) { console.error('data/raw/earth_day_4096.jpg is missing: run python3 tools/fetch.py'); process.exit(1); }
const browser = await chromium.launch(), page = await browser.newPage();
await page.setContent('<body></body>');
const uri = 'data:image/jpeg;base64,' + readFileSync(SRC).toString('base64');
const r = await page.evaluate(async ({ uri, BOX, OUT_W, OCEAN, NAVY, QUALITY }) => {
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
writeFileSync(join(ROOT, 'data/generated/menu-art.json'), JSON.stringify({ world: r.b64, box: BOX, size: [r.w, r.h] }));
console.log(`menu world: ${r.w}x${r.h}, ${(r.b64.length / 1024).toFixed(0)} KB`);
await browser.close();
