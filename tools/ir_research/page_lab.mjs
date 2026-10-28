// The infrared picture as the PLAYER gets it: the built page in headless Chromium, a storm placed and held at a stage, the floater opened in the satellite view, and at chosen hours
// the nest's Tb field (floaterTb: the same call the canvas is made from), what the nest was told of the air, and optionally a screenshot of the map frame.
//   node tools/ir_research/page_lab.mjs '<json: one case or a list>' <outprefix> [--shots]
// a case: { label, basin (atlantic|eastpacific|westpacific|nio|aus|swio|spac|satl|med), day (days into the page's year before the system is placed), at: [lat, lon], seed, kind (td|wave|sd|low),
//           force: { th, v, vr, p, cx, cy } (held every hour when hold is true), hold, env: { shear (kt), rh (%), sst (C) } (the test hook: the floater's own air) or none (the page's own),
//           hours, every (hours between dumps), warm (hours of the floater clock run before the first dump), shots: [hours to screenshot], par: { nest PAR keys to set for this case } }
// writes <outprefix>_<label>_<hour>.f32 (256 x 256 float32), <outprefix>_<label>.json (the metas and the picture statistics of irstats.mjs, res = the cell's km)
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stats } from './irstats.mjs';
const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const DIST = { atlantic: 'atlantic', eastpacific: 'eastpacific', westpacific: 'westpacific', nio: 'nio', aus: 'aus', swio: 'swio', spac: 'spac', satl: 'satl', med: 'med' };
const spec = JSON.parse(process.argv[2]), cases = Array.isArray(spec) ? spec : [spec], outp = process.argv[3], shots = process.argv.includes('--shots');
const launchOpts = process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts), result = {};
const pages = {};
async function pageFor(basin) {
  if (pages[basin]) return pages[basin];
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route('**://**/*', (route) => route.request().url().startsWith('file://') ? route.continue() : route.abort());
  page.on('pageerror', (e) => console.error('page error: ' + e.message));
  await page.goto(pathToFileURL(join(ROOT, `dist/${DIST[basin]}-sst-simulator.html`)).href, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__ready === true, { timeout: 30000 }); await page.waitForTimeout(800);
  return (pages[basin] = page);
}
for (const c of cases) {
  const page = await pageFor(c.basin || 'atlantic'), ev = (fn, arg) => page.evaluate(fn, arg), at = c.at || [14, -45], hours = c.hours || 24, every = c.every || 6, force = c.force || {}, log = [];
  await ev((p) => { const N = window.HFNest, D = window.__parDefault || (window.__parDefault = JSON.parse(JSON.stringify(N.PAR))); Object.assign(N.PAR, JSON.parse(JSON.stringify(D)), p || {}); }, c.par || null);    // par: nest numbers to set for this case (a before-and-after in the page's own air); every case starts from the built defaults
  // placed: a system put at a place and held at a stage; follow: the page's own season (auto genesis) run until a tropical cyclone of the wanted wind appears, and then followed as the engine has it
  const id = await ev((q) => { const S = window.SSTSIM; S.setPlaying(false); S.applySeed(q.seed || 4242); S.setPlaying(false); S.storms(true); S.stormAuto(!!q.follow); S.summary(false); S.tick(24 * q.day);
    if (q.follow) { const F = q.follow; let id = null; for (let h = 0; h < 24 * (F.days || 200) && !id; h += 3) { S.tick(3); const s = S.stormState().systems.find((x) => x.alive && x.th === (F.th || 'tc') && x.v >= (F.minV || 0) && x.v <= (F.maxV || 999) && (!F.skip || (F.skip = F.skip - 1) < 0)); if (s) id = s.id; } if (!id) return null; if (q.env && S.floaterEnv) S.floaterEnv(q.env); S.floaterOpen(id); S.floaterSet({ view: 'ir', play: false }); return id; }
    const id = S.stormPlace({ kind: q.kind || 'td', lat: q.at[0], lon: q.at[1], v: q.v || 30 }); S.tick(2); const sg = q.at[0] < 0 ? -1 : 1;
    for (let k = 0; k < 4; k++) { const fo = Object.assign({ th: 'tc', lat: q.at[0] + 0.02 * k * sg, lon: q.at[1] + 0.02 * k, cx: 4, cy: 2 * sg }, q.force || {}); if (fo.etAt === 'now') fo.etAt = S.stormState().hour - 12; S.stormForce(id, fo); S.tick(1); }
    if (q.env && S.floaterEnv) S.floaterEnv(q.env); S.floaterOpen(id); S.floaterSet({ view: 'ir', play: false }); return id; }, { seed: c.seed, day: c.day || 220, at, kind: c.kind, v: (force.v || 30), force, env: c.env, follow: c.follow });
  if (!id) { console.error(c.label + ': no such storm'); continue; }
  const metas = []; let h = -(c.warm || 0);
  const hourly = async (n) => { for (let i = 0; i < n; i++) { if (c.hold) await ev(([id, f]) => { if (f.etAt === 'now') delete f.etAt; return window.SSTSIM.stormForce(id, f); }, [id, Object.assign({ th: 'tc' }, force)]); await ev(() => window.SSTSIM.floaterRun(3600)); h++; } };
  if (c.warm) await hourly(c.warm);
  for (; h <= hours;) {
    const t = await ev(() => window.SSTSIM.floaterTb());
    if (!t) { console.error(c.label + ': the floater is gone at hour ' + h); break; }
    const tb = new Float32Array(Buffer.from(t.b64, 'base64').buffer.slice(0)), hh = Math.max(h, 0); writeFileSync(`${outp}_${c.label}_${String(hh).padStart(3, '0')}.f32`, Buffer.from(tb.buffer));
    const st = stats(tb, t.n, 2 * t.m); metas.push({ h: hh, m: t.m, f: t.f, st });
    if (shots && (c.shots || []).includes(hh)) { await ev(() => window.SSTSIM.floaterRun(1)); await page.screenshot({ path: `${outp}_${c.label}_${String(hh).padStart(3, '0')}.png` }); }
    if (h >= hours) break; await hourly(Math.min(every, hours - h));
  }
  await ev(() => window.SSTSIM.floaterClose());
  writeFileSync(`${outp}_${c.label}.json`, JSON.stringify(metas)); result[c.label] = metas.map((q) => ({ h: q.h, v: +q.f.v.toFixed(0), shear: +q.f.shearPage.toFixed(0), rh: +q.f.rh.toFixed(2), sst: +q.f.sst.toFixed(1), m: q.m, strip: q.f.strip != null ? +q.f.strip.toFixed(2) : 0, bursts: q.f.bursts || 0, A60: +q.st.A60.toFixed(1), A70: +q.st.A70.toFixed(1), A80: +q.st.A80.toFixed(2), tmin: +q.st.tmin.toFixed(0), speckle: q.st.speckle != null ? +q.st.speckle.toFixed(3) : null, smallN: q.st.smallN, largest: q.st.largest != null ? +q.st.largest.toFixed(2) : null }));
}
await browser.close();
console.log(JSON.stringify(result));
