#!/usr/bin/env node
// Makes the Blue Marble of the season summary's map for every basin: data/generated/<basin>-summap.json { smap (a JPEG, base64), smapBox, smapSize }.
// Source: data/raw/earth_day_4096.jpg (python3 tools/fetch.py), NASA's Blue Marble as a cloud-free 4096x2048 day map. Its ocean is one flat blue; Wikipedia's track
// maps have the deep navy ocean instead, so every pixel the colour of that flat blue becomes the navy (a smooth step: the coast, the lakes' shores and the turquoise
// shallows of the Bahamas keep what they have). tools/build.mjs puts the result into the page's data. Pillow is not needed: headless Chromium does the pixels.
//   node tools/make_summary_map.mjs [basin ...]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'data/raw/earth_day_4096.jpg');
const BOXES = { atlantic: [-120, 50, -50, 80], eastpacific: [-180, -64, -36, 54], westpacific: [97, 180, -9, 59], nio: [28, 102, -10, 34], aus: [87, 179, -47, 7], swio: [28, 110, -46, 2], spac: [157, 243, -43, 3], satl: [-53, 23, -43, 3], med: [-12, 44, 28, 50] };       // [lonW, lonE, latS, latN]: the region of each page's own imagery (the summary's map never goes beyond it)
const OCEAN = [30, 59, 115], NAVY = [11, 11, 51], QUALITY = 0.82;                                            // the flat blue of the source's ocean, and the navy of Wikipedia's maps (read off its Atlantic season map)
if (!existsSync(SRC)) { console.error('data/raw/earth_day_4096.jpg is missing: run python3 tools/fetch.py'); process.exit(1); }
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BOXES);
const browser = await chromium.launch(), page = await browser.newPage();
await page.setContent('<body></body>');
const uri = 'data:image/jpeg;base64,' + readFileSync(SRC).toString('base64');
for (const basin of want) {
  const box = BOXES[basin]; if (!box) { console.error('unknown basin ' + basin); continue; }
  const r = await page.evaluate(async ({ uri, box, OCEAN, NAVY, QUALITY }) => {
    const im = new Image(); im.src = uri; await im.decode();
    const sw = im.naturalWidth, sh = im.naturalHeight, [lonW, lonE, latS, latN] = box, x0 = Math.round((lonW + 180) / 360 * sw), x1 = Math.round((lonE + 180) / 360 * sw), y0 = Math.round((90 - latN) / 180 * sh), y1 = Math.round((90 - latS) / 180 * sh);
    const c = document.createElement('canvas'); c.width = x1 - x0; c.height = y1 - y0; const g = c.getContext('2d');
    if (x1 <= sw) g.drawImage(im, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
    else { g.drawImage(im, x0, y0, sw - x0, y1 - y0, 0, 0, sw - x0, c.height); g.drawImage(im, 0, y0, x1 - sw, y1 - y0, sw - x0, 0, x1 - sw, c.height); }          // a box that crosses the date line continues on the other side of the picture
    const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      const dist = Math.hypot(a[i] - OCEAN[0], a[i + 1] - OCEAN[1], a[i + 2] - OCEAN[2]);
      let w = dist <= 14 ? 1 : dist >= 46 ? 0 : 1 - (dist - 14) / 32; w = w * w * (3 - 2 * w);
      if (w > 0) { a[i] += (NAVY[0] - a[i]) * w; a[i + 1] += (NAVY[1] - a[i + 1]) * w; a[i + 2] += (NAVY[2] - a[i + 2]) * w; }
    }
    g.putImageData(d, 0, 0);
    return { b64: c.toDataURL('image/jpeg', QUALITY).split(',')[1], w: c.width, h: c.height };
  }, { uri, box, OCEAN, NAVY, QUALITY });
  writeFileSync(join(ROOT, 'data/generated', basin + '-summap.json'), JSON.stringify({ smap: r.b64, smapBox: box, smapSize: [r.w, r.h] }));
  console.log(`${basin}: ${r.w}x${r.h}, ${(r.b64.length / 1024).toFixed(0)} KB`);
}
await browser.close();
