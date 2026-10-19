// The region a basin page lets a storm live in, as the page itself sees it: for every half degree of the page's domain, is it inside the basin (the page has weather there) and is it land for a storm.
//
//   node tools/storm_region.mjs <basin>        (needs `npm run build` and, in a sandbox, PLAYWRIGHT_CHROMIUM_PATH)
//
// Written: data/generated/<prefix>-tc-region.json  { lon0, lat1, res, nx, ny, inb, land }, the two masks as base64 bit arrays (row 0 = lat1, the northern edge, west to east, the most significant
// bit first: the layout of the page's own `mask`). tools/make_tc_basin.py selects the best-track storms of a page by it (the genesis inside the basin and over water, a track ends where it leaves the basin: what the engine does).
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const BASINS = JSON.parse(readFileSync(join(ROOT, 'tools/tc_basins.json'), 'utf8'));
delete BASINS._;
export const dataFile = (basin) => join(ROOT, 'data/generated', basin === 'atlantic' ? 'data.json' : `${basin}-data.json`);

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const basin = process.argv[2], B = BASINS[basin];
  if (!B) { console.error('usage: node tools/storm_region.mjs <' + Object.keys(BASINS).join('|') + '>'); process.exit(1); }
  const dm = JSON.parse(readFileSync(dataFile(basin), 'utf8')).domain, RES = 0.5;
  const nx = Math.round((dm.nx - 1) * dm.res / RES) + 1, ny = Math.round((dm.ny - 1) * dm.res / RES) + 1;
  const { chromium } = await import('playwright');
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  await page.route('**://**/*', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  await page.goto(pathToFileURL(join(process.env.HF_DIST || join(ROOT, 'dist'), B.page)).href, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, { timeout: 60000 });
  const res = await page.evaluate(({ dm, nx, ny, RES }) => {
    const S = window.SSTSIM; S.stormsForce(true); S.setPlaying(false); S.applySeed(1); S.setPlaying(false); S.tick(24); S.advance(0);
    const inb = new Uint8Array(nx * ny), land = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const lat = dm.lat1 - j * RES, lon = dm.lon0 + i * RES, e = S.stormEnvSample(lat, lon);
      inb[j * nx + i] = Number.isFinite(e.sst) ? 1 : 0; land[j * nx + i] = e.land ? 1 : 0;
    }
    return { inb: Array.from(inb), land: Array.from(land) };
  }, { dm, nx, ny, RES });
  await browser.close();
  const pack = (a) => { const b = Buffer.alloc((a.length + 7) >> 3); for (let k = 0; k < a.length; k++) if (a[k]) b[k >> 3] |= 0x80 >> (k & 7); return b.toString('base64'); };
  const out = { basin, lon0: dm.lon0, lat1: dm.lat1, res: RES, nx, ny, inb: pack(res.inb), land: pack(res.land) };
  const path = join(ROOT, 'data/generated', `${basin}-tc-region.json`);
  writeFileSync(path, JSON.stringify(out));
  const nIn = res.inb.reduce((a, b) => a + b, 0), nWater = res.inb.reduce((a, b, k) => a + (b && !res.land[k] ? 1 : 0), 0);
  console.log(`wrote ${path}: ${nx} x ${ny} half-degree cells, ${nIn} inside the basin (${(100 * nIn / (nx * ny)).toFixed(0)} %), ${nWater} of them water`);
}
