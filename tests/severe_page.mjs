// End-to-end checks of the Severe radar page (dist/severe.html, built by `npm run build`) in headless Chromium, from file:// like the other pages, with the network refused: the page has to
// draw a real sweep of the recorded storm on the GPU, play and scrub it, switch products, tilts, units, themes and panes, probe and measure, move the radar, and lay itself out on a phone.
// WebGL2 comes from SwiftShader (the sandbox's and CI's software renderer); what the GPU draws is compared pixel by pixel with the CPU reference of src/severe-gl.js.
import { chromium } from 'playwright';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, statSync } from 'node:fs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url))), FILE = process.env.SEVERE_HTML || join(ROOT, 'dist/severe.html');
if (!existsSync(FILE)) { console.error('dist/severe.html is missing: run `npm run build` first'); process.exit(2); }
let failed = 0, passed = 0; const failedNames = [], t0 = Date.now();
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; failedNames.push(name); console.log('FAIL ' + name); } }

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });      // (the last flag lets a page opened from disk read the recorded storm beside it)
async function open(w, h, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: opts.scheme || 'dark' }), page = await ctx.newPage(), log = { errors: [], requests: [] };
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.errors.push(m.type() + ': ' + m.text()); }); page.on('pageerror', (e) => log.errors.push('pageerror: ' + e));
  await ctx.route('**/*', (route) => { const u = route.request().url(); if (/^(file|blob|data):/.test(u)) route.continue(); else { log.requests.push(u); route.abort(); } });
  // (a context of its own starts with empty storage; a reload keeps what the page saved. An init script that cleared the storage "once per tab", told by the session storage, cleared it again whenever the
  //  session storage was dropped by a reload under load, and CI run 166 lost the light theme that way)
  if (opts.init) await page.addInitScript(opts.init);
  const t = Date.now(); await page.goto(pathToFileURL(FILE).href);
  await page.waitForFunction('window.SEVERE && (window.SEVERE.ready === true || window.SEVERE.error)', null, { timeout: 120000 });
  const idle = await page.evaluate('window.SEVERE.whenIdle()');
  return { page, ctx, log, ms: Date.now() - t, idle };
}
const ev = (p, f, a) => p.evaluate(f, a);
const idle = (p) => p.evaluate('window.SEVERE.whenIdle()');
/* the stamp of the dock's edge: on show, with nothing over it, on the screen, and touching no colour bar, title chip, button or zoom control */
const stampProbe = () => { const st = document.getElementById('stamp'), r = st.getBoundingClientRect(), cs = getComputedStyle(st);
  const hit = [...document.querySelectorAll('.bar, .ptitle, #zoom, .top-tools, #back, #brand')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && !(b.right <= r.left || b.left >= r.right || b.bottom <= r.top || b.top >= r.bottom); }).map((e) => e.className || e.id);
  const pe = st.style.pointerEvents; st.style.pointerEvents = 'auto'; const onTop = [0.2, 0.5, 0.8].every((f) => document.elementFromPoint(r.left + r.width * f, r.top + r.height / 2) === st); st.style.pointerEvents = pe;      // (nothing lies over it)
  return { text: st.textContent, shown: cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.5 && r.width > 100 && r.height > 8 && onTop, w: Math.round(r.width), inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, hit }; };
const stormXY = (p, pane = 0) => p.evaluate((i) => { const S = SEVERE, pn = S.panes[i], tr = S.pack.track[S.S.frame], ll = S.pack.boxLatLon(S.pack.times[S.S.frame], tr[0], tr[1]), G = HFSevereGeo, [x, y] = G.toScreen(pn.map.view, G.mercX(ll.lon), G.mercY(ll.lat)), r = pn.top.getBoundingClientRect(); return { x: r.left + x, y: r.top + y, lat: ll.lat, lon: ll.lon }; }, pane);

/* 1. The page starts, from file://, with no request and no complaint, scans in workers and shows the storm */
const A = await open(1440, 900), pg = A.page;
check('the page starts from file:// in ' + (A.ms / 1000).toFixed(1) + ' s with no console error or warning and not one request outside file:, blob: and data:', !(await ev(pg, 'window.SEVERE.error')) && A.log.errors.length === 0 && A.log.requests.length === 0 && A.idle);
check('the radar operator runs in Workers (' + await ev(pg, 'SEVERE.scanner.mode()') + ') and the first sweep is the 0.5 degree reflectivity of the 4:00 PM frame (frame ' + await ev(pg, 'SEVERE.S.frame') + ')',
  /^workers:[1-3]$/.test(await ev(pg, 'SEVERE.scanner.mode()')) && await ev(pg, 'SEVERE.S.frame') === 12 && await ev(pg, 'SEVERE.panes[0].sweep.meta.elev') === 0.5 && await ev(pg, 'SEVERE.panes[0].product') === 'dbz' && await ev(pg, "document.getElementById('clk').textContent") === '4:00 PM');
check('the page is dark by default, wears its stamp, and links back to the menu\'s discipline screen', await ev(pg, 'document.documentElement.dataset.theme') === 'dark' && /HYPOTHETICAL/.test(await ev(pg, "document.getElementById('stamp').textContent")) && /Isobar Severe Simulator/.test(await ev(pg, "document.getElementById('stamp').textContent")) && await ev(pg, "document.getElementById('back').getAttribute('href')") === '../index.html#disc');

/* 2. The GPU draws what the CPU reference says */
const gpu = await ev(pg, () => {
  const p = SEVERE.panes[0], g = p.gl, sw = p.sweep, G = HFSevereGeo, lut = p.gl.lut, v = Object.assign({}, p.map.view), r = SEVERE.S.radar, w = p.glc.width, h = p.glc.height, dpr = w / v.w;
  g.ss = false; const view = { cx: v.cx, cy: v.cy, mpp: v.mpp, w: v.w, h: v.h }; g.draw(view, sw.radar); const px = g.read(), full = Object.assign({}, view, { w, h, mpp: v.mpp / dpr });
  const ref = HFSevereGL.reference(sw.meta, sw.dbz, lut, full, sw.radar, 1); let same = 0, drawn = 0, core = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const o = 4 * (y * w + x), og = 4 * ((h - 1 - y) * w + x), a = px[og + 3], ra = ref[o + 3]; if (a === 0 && ra === 0) continue; drawn++;
    const un = (c) => (a > 0 ? Math.min(255, Math.round(c * 255 / a)) : 0);
    if (Math.abs(a - ra) <= 3 && Math.abs(un(px[og]) - ref[o]) <= 3 && Math.abs(un(px[og + 1]) - ref[o + 1]) <= 3 && Math.abs(un(px[og + 2]) - ref[o + 2]) <= 3) same++;
  }
  g.ss = 'auto'; g.draw(view, sw.radar); return { drawn, same, w, h };
});
check('what the GPU draws is what the CPU reference draws: ' + gpu.same + ' of ' + gpu.drawn + ' sampled pixels of the ' + gpu.w + 'x' + gpu.h + ' sweep are the same colour (block edges aside)', gpu.drawn > 50000 && gpu.same / gpu.drawn > 0.975);
const core = await ev(pg, async () => { const p = SEVERE.panes[0], S = SEVERE; p.gl.draw(p.map.view, p.sweep.radar); const tr = S.pack.track[S.S.frame], ll = S.pack.boxLatLon(S.pack.times[S.S.frame], tr[0], tr[1]), G = HFSevereGeo, v = p.map.view, [x, y] = G.toScreen(v, G.mercX(ll.lon), G.mercY(ll.lat)), px = p.gl.read(), w = p.glc.width, h = p.glc.height, dpr = w / v.w;
  let best = 0; for (let dy = -40; dy <= 40; dy += 4) for (let dx = -40; dx <= 40; dx += 4) { const X = Math.round(x * dpr + dx), Y = h - 1 - Math.round(y * dpr + dy), o = 4 * (Y * w + X); best = Math.max(best, px[o] > 150 && px[o + 1] < 120 ? 1 : 0); } return best; });
check('the storm\'s core shows as the red and magenta of 50 dBZ and more on the map', core === 1);

/* 3. Products, tilts, units, colour bar */
await ev(pg, "SEVERE.setProduct(SEVERE.panes[0], 'vel')"); await idle(pg);
const bv = await ev(pg, () => { const p = SEVERE.panes[0]; return { name: document.getElementById('prod-nm').textContent, unit: p.barEl.querySelector('.bu').textContent, labels: [...p.barEl.querySelectorAll('.bt span')].map((s) => s.textContent).join(','), title: p.titleEl.textContent }; });
check('Base Velocity: the dock and the pane\'s chip say so, the colour bar reads in mph, -100 to 100 labelled, as the table (' + bv.labels + ')', bv.name === 'Base Velocity' && bv.unit === 'mph' && bv.labels === '-100,-80,-60,-40,-20,0,20,40,60,80,100' && /Base Velocity · 0\.5° · 4:00 PM/.test(bv.title));
await ev(pg, "SEVERE.setProduct(SEVERE.panes[0], 'sw')"); const sw1 = await ev(pg, () => document.querySelector('#panes .bar .bu').textContent); await ev(pg, "SEVERE.setProduct(SEVERE.panes[0], 'dbz')");
check('Spectrum Width reads in mph too (' + sw1 + '), and Base Reflectivity in dBZ again', sw1 === 'mph' && await ev(pg, "document.querySelector('#panes .bar .bu').textContent") === 'dBZ');
await ev(pg, "SEVERE.S.units = 'metric'; SEVERE.panes.forEach((p) => SEVERE.setProduct(p, 'vel'))"); const mu = await ev(pg, "document.querySelector('#panes .bar .bu').textContent + ' ' + [...document.querySelectorAll('#panes .bar .bt span')].map((s) => s.textContent).join(',')");
check('in metric units the velocity bar reads in m/s (' + mu + ')', /^m\/s /.test(mu) && /-50/.test(mu)); await ev(pg, "SEVERE.S.units = 'imperial'; SEVERE.panes.forEach((p) => SEVERE.setProduct(p, 'dbz'))");
await pg.click('#tilt-up'); await idle(pg);
check('the tilt stepper: + goes to 0.9 degrees, the next sweep is scanned at that elevation, - is disabled at 0.5', await ev(pg, "document.getElementById('tilt-v').textContent") === '0.9°' && await ev(pg, 'SEVERE.panes[0].sweep.meta.elev') === 0.9 && await ev(pg, "document.getElementById('tilt-dn').disabled") === false);
await pg.click('#tilt-dn'); await idle(pg);
check('and back: 0.5 degrees, the lower arrow disabled', await ev(pg, "document.getElementById('tilt-v').textContent") === '0.5°' && await ev(pg, "document.getElementById('tilt-dn').disabled") === true);

/* 4. Time: stepping, the interval chips, the slider, playing */
const f0 = await ev(pg, 'SEVERE.S.frame'); await pg.click('#t-next'); await idle(pg);
check('next frame: 4:05 PM, the slider moves on, the sweep is that frame\'s', await ev(pg, 'SEVERE.S.frame') === f0 + 1 && await ev(pg, "document.getElementById('clk').textContent") === '4:05 PM' && await ev(pg, 'SEVERE.panes[0].sweep.frame') === f0 + 1 && +(await ev(pg, "document.getElementById('slider').value")) > 650);
await pg.click('#t-prev'); await pg.click('#t-first'); await idle(pg);
check('first frame: 3:00 PM, no echo of the storm yet, last frame: 4:30 PM', await ev(pg, "document.getElementById('clk').textContent") === '3:00 PM' && await ev(pg, "document.getElementById('slider').value") === '0' && (await pg.click('#t-last'), await idle(pg), await ev(pg, "document.getElementById('clk').textContent")) === '4:30 PM');
const chips = await ev(pg, () => [...document.querySelectorAll('#int button')].map((b) => b.textContent + ':' + b.disabled + ':' + b.getAttribute('aria-pressed')).join(' '));
check('the frame interval chips: 1 and 3 minutes are off (this recording has a frame every 5), 5 is on (' + chips + ')', chips === '1:true:false 3:true:false 5:false:true 10:false:false');
await pg.click('#int button[data-i="10"]'); await pg.click('#t-first'); await pg.click('#t-next'); await idle(pg);
check('at 10 minutes between frames the next frame after 3:00 PM is 3:10 PM, and the slider has ten ticks', await ev(pg, "document.getElementById('clk').textContent") === '3:10 PM' && await ev(pg, "document.querySelectorAll('#ticks span').length") === 10);
await pg.click('#int button[data-i="5"]'); await ev(pg, 'SEVERE.setT(60)'); await idle(pg);
await ev(pg, 'SEVERE.S.speed = 4'); const fs = await ev(pg, 'SEVERE.S.frame'); await pg.click('#t-play'); await pg.waitForTimeout(5000); const fp = await ev(pg, 'SEVERE.S.frame');
check('playing at 20 game minutes a second moves the frames on and the button shows pause (frame ' + fs + ' to ' + fp + ')', fp !== fs && await ev(pg, "document.getElementById('ic-pause').hidden") === false);
await pg.click('#t-play'); const fq = await ev(pg, 'SEVERE.S.frame'); await pg.waitForTimeout(800);
check('pausing stops it', await ev(pg, 'SEVERE.S.frame') === fq && await ev(pg, "document.getElementById('ic-play').hidden") === false);
await ev(pg, 'SEVERE.setT(60)'); await idle(pg);
await pg.fill('#slider', '500'); await idle(pg);
check('dragging the slider to the middle shows the 3:45 PM frame (45 minutes of 90)', await ev(pg, "document.getElementById('clk').textContent") === '3:45 PM');
await ev(pg, 'SEVERE.setT(60)'); await idle(pg);

/* 5. The keyboard */
await pg.keyboard.press('ArrowRight'); await idle(pg); const kf = await ev(pg, 'SEVERE.S.frame'); await pg.keyboard.press('ArrowLeft'); await idle(pg); await pg.keyboard.press('ArrowUp'); await idle(pg);
check('the arrow keys step the frame (right: ' + kf + ', left: ' + await ev(pg, 'SEVERE.S.frame') + ') and the tilt (up: ' + await ev(pg, "document.getElementById('tilt-v').textContent") + ')', kf === 13 && await ev(pg, 'SEVERE.S.frame') === 12 && await ev(pg, "document.getElementById('tilt-v').textContent") === '0.9°');
await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('2'); await pg.keyboard.press(' '); await pg.waitForTimeout(150); const pl = await ev(pg, 'SEVERE.S.playing'); await pg.keyboard.press(' ');
check('2 is velocity and space plays and pauses', await ev(pg, 'SEVERE.panes[0].product') === 'vel' && pl === true && await ev(pg, 'SEVERE.S.playing') === false); await pg.keyboard.press('1'); await idle(pg);

/* 6. Probe and measure */
await pg.click('#b-probe'); const sp = await stormXY(pg); await pg.mouse.click(sp.x - 10, sp.y + 8); await pg.waitForTimeout(300);
const pr = await ev(pg, () => ({ text: document.getElementById('pop').innerText.replace(/\n+/g, ' | '), p: SEVERE.S.probe }));
const exp = await ev(pg, () => { const p = SEVERE.panes[0], sw = p.sweep, G = HFSevereGeo, ll = SEVERE.S.probe, R0 = SEVERE.S.radar, loc = G.local(R0.lat, R0.lon, ll.lat, ll.lon), m = sw.meta, slant = Math.hypot(loc.x, loc.y) / Math.cos(m.elev * Math.PI / 180), gi = Math.floor((slant - (m.r0 - m.gate / 2)) / m.gate), az = (Math.atan2(loc.x, loc.y) * 180 / Math.PI + 360) % 360, ai = Math.min(m.nRad - 1, Math.floor(az / m.dAz)); return { v: sw.dbz[ai * m.nGates + gi] / 2, km: Math.hypot(loc.x, loc.y) / 1609.344 }; });
check('the probe reads the gate under the finger: ' + exp.v.toFixed(1) + ' dBZ at ' + exp.km.toFixed(1) + ' mi (the popover: "' + pr.text.slice(0, 120) + '")', pr.text.includes(exp.v.toFixed(1)) && pr.text.includes(exp.km.toFixed(1) + ' mi') && /Bearing/.test(pr.text) && /Beam height/.test(pr.text) && /THE MODEL, AT THE BEAM/i.test(pr.text) && /Vertical wind/.test(pr.text) && /Near/.test(pr.text));
await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape'); check('Escape closes the readout and, pressed again, puts the probe away', await ev(pg, "document.getElementById('b-probe').getAttribute('aria-pressed')") === 'false' && await ev(pg, "document.getElementById('pop').hidden") === true && await ev(pg, 'SEVERE.S.probe') === null);
await pg.click('#b-measure'); await pg.mouse.click(600, 400); await pg.mouse.click(760, 330); const m2 = await ev(pg, 'SEVERE.S.measure.length'); await pg.mouse.click(500, 300); const m3 = await ev(pg, 'SEVERE.S.measure.length');
const md = await ev(pg, () => { const a = SEVERE.S.measure; return a.length ? a[0].lat : null; });
check('the measuring tool takes two points and starts again on the third (' + m2 + ' then ' + m3 + ')', m2 === 2 && m3 === 1 && md !== null); await pg.keyboard.press('Escape');

/* 7. Moving the radar and choosing another */
const before = await ev(pg, () => ({ lat: SEVERE.S.radar.lat, lon: SEVERE.S.radar.lon })), pill = await ev(pg, () => { const p = SEVERE.panes[0], G = HFSevereGeo, r = SEVERE.S.radar, [x, y] = G.toScreen(p.map.view, G.mercX(r.lon), G.mercY(r.lat)), b = p.top.getBoundingClientRect(); return { x: b.left + x, y: b.top + y }; });
await pg.mouse.move(pill.x, pill.y); await pg.mouse.down(); for (let i = 1; i <= 8; i++) { await pg.mouse.move(pill.x + 20 * i, pill.y + 6 * i); await pg.waitForTimeout(50); } const mid = await ev(pg, 'SEVERE.S.dragging'); await pg.mouse.up(); await idle(pg);
const aft = await ev(pg, () => { const p = SEVERE.panes[0], G = HFSevereGeo, r = SEVERE.S.radar, [x, y] = G.toScreen(p.map.view, G.mercX(r.lon), G.mercY(r.lat)), b = p.top.getBoundingClientRect(); return { custom: r.custom, id: r.id, x: b.left + x, y: b.top + y, key: p.key, sr: p.sweep.radar, nRad: p.sweep.meta.nRad, lat: r.lat, lon: r.lon, quick: p.sweep.quick }; });
check('dragging the radar\'s pill moves the radar to where it is dropped (within 2 px of ' + (pill.x + 160) + ', ' + (pill.y + 48) + ': ' + aft.x.toFixed(1) + ', ' + aft.y.toFixed(1) + '), it was a quick scan while dragging and a full one after, and the sweep is centred on the new place',
  mid === true && aft.custom === true && aft.id === null && Math.abs(aft.x - (pill.x + 160)) < 2 && Math.abs(aft.y - (pill.y + 48)) < 2 && aft.nRad === 720 && aft.quick === false && Math.abs(aft.sr.lat - aft.lat) < 1e-9 && Math.abs(aft.sr.lon - aft.lon) < 1e-9 && (aft.lat !== before.lat));
await pg.click('#site'); await pg.waitForTimeout(150); const rows = await ev(pg, "[...document.querySelectorAll('#pop .row')].map((r) => r.textContent).slice(0, 4).join(' | ')");
await pg.click('#pop .row[data-id="s:KTLX"]'); await idle(pg);
const kt = await ev(pg, () => ({ id: SEVERE.S.radar.id, name: document.getElementById('site-nm').textContent, sid: document.getElementById('site-id').textContent, sr: SEVERE.panes[0].sweep.radar, s: SEVERE.siteInfo(SEVERE.geo.points.site.names.indexOf('KTLX')), custom: SEVERE.S.radar.custom }));
check('the site list names the radars near the map (' + rows.slice(0, 90) + '), and picking KTLX puts the radar there: the dock says KTLX, Oklahoma City, OK and the sweep is scanned from its position', kt.id === 'KTLX' && kt.sid === 'KTLX' && kt.name === 'Oklahoma City, OK' && kt.custom === false && Math.abs(kt.sr.lat - kt.s.lat) < 1e-9 && /KVNX|KICT|KDDC|KTLX/.test(rows));
await ev(pg, "SEVERE.setRadar({ id: 'KVNX', custom: false, name: 'Enid, OK', lat: SEVERE.siteInfo(SEVERE.geo.points.site.names.indexOf('KVNX')).lat, lon: SEVERE.siteInfo(SEVERE.geo.points.site.names.indexOf('KVNX')).lon })"); await idle(pg);

/* 8. Two panes, linked */
await pg.click('#b-panes'); await pg.waitForTimeout(400); await idle(pg);
const two = await ev(pg, () => { const a = SEVERE.panes[0], b = SEVERE.panes[1]; a.map.setView({ cx: a.map.view.cx + 20000, cy: a.map.view.cy - 15000, mpp: a.map.view.mpp * 0.8 }); return { n: document.querySelectorAll('.pane').length, cls: document.getElementById('panes').className, same: Math.abs(a.map.view.cx - b.map.view.cx) < 1e-6 && Math.abs(a.map.view.mpp - b.map.view.mpp) < 1e-9, t: [...document.querySelectorAll('.ptitle')].map((t) => t.textContent).join(' || '), w: [...document.querySelectorAll('.pane')].map((p) => Math.round(p.getBoundingClientRect().width)) }; });
check('two panes side by side, reflectivity and velocity, with the view linked (' + two.t.slice(0, 110) + ')', two.n === 2 && two.cls === 'two' && two.same && /Base Reflectivity/.test(two.t) && /Base Velocity/.test(two.t) && Math.abs(two.w[0] - two.w[1]) <= 2);
await idle(pg); const px2 = await ev(pg, () => SEVERE.panes.map((p) => { p.gl.draw(p.map.view, p.sweep.radar); const g = p.gl.read(); let n = 0; for (let i = 3; i < g.length; i += 64) if (g[i] > 0) n++; return n; }));
check('both panes have a picture of their own on the GPU (' + px2.join(' and ') + ' sampled pixels drawn)', px2[0] > 2000 && px2[1] > 2000);
const sp2 = await ev(pg, stampProbe);
check('with two panes the stamp ("' + sp2.text + '") is on show, on the screen, and touches no colour bar, title chip or button' + (sp2.hit.length ? ' (it touches ' + sp2.hit.join(', ') + ')' : ''), sp2.shown && sp2.inside && sp2.hit.length === 0 && /HYPOTHETICAL/.test(sp2.text) && /Isobar Severe Simulator/.test(sp2.text));
await pg.click('#b-panes'); await pg.waitForTimeout(300);
check('and back to one pane', await ev(pg, "document.querySelectorAll('.pane').length") === 1);

/* 9. Themes, layers, settings, memory */
await pg.click('#b-theme'); await idle(pg); await pg.waitForTimeout(200);
const lt = await ev(pg, () => { const c = SEVERE.panes[0].base.getContext('2d'), d = c.getImageData(4, 4, 1, 1).data; return { theme: document.documentElement.dataset.theme, lum: 0.3 * d[0] + 0.6 * d[1] + 0.1 * d[2], bg: getComputedStyle(document.body).backgroundColor, saved: localStorage.getItem('hf-severe-v1') }; });
check('the light theme: the map turns light (luminance ' + lt.lum.toFixed(0) + '), the page ' + lt.bg + ', and the choice is kept in localStorage', lt.theme === 'light' && lt.lum > 150 && /^rgb\((2\d\d|1[89]\d)/.test(lt.bg) && /"theme":"light"/.test(lt.saved));
await pg.reload(); await pg.waitForFunction('window.SEVERE && window.SEVERE.ready === true', null, { timeout: 120000 });
check('after a reload it is still light', await ev(pg, 'document.documentElement.dataset.theme') === 'light');
await pg.keyboard.press('t'); await idle(pg);
await pg.click('#b-layers'); await pg.click('#pop .row[data-id="road"]'); const roadOff = await ev(pg, 'SEVERE.S.layers.road'); await pg.keyboard.press('Escape'); await pg.click('#b-settings'); await pg.click('#pop [data-seg="units"] button[data-v="metric"]'); await pg.keyboard.press('Escape');
check('the layers list turns the roads off, the settings list turns the units to km and m/s, and t brings the dark theme back', roadOff === false && await ev(pg, 'SEVERE.S.units') === 'metric' && await ev(pg, 'document.documentElement.dataset.theme') === 'dark' && /"units":"metric"/.test(await ev(pg, "localStorage.getItem('hf-severe-v1')")));
await ev(pg, "SEVERE.S.units = 'imperial'");
await A.ctx.close();

/* 10. A damaged memory does not stop it; a phone; a big screen */
const B = await open(1280, 800, { init: () => { try { localStorage.setItem('hf-severe-v1', '{not json'); } catch (e) { /* none */ } } });
check('a damaged localStorage entry is ignored: the page still starts, dark, with no error', !(await ev(B.page, 'window.SEVERE.error')) && B.log.errors.length === 0 && await ev(B.page, 'document.documentElement.dataset.theme') === 'dark'); await B.ctx.close();
const C = await open(390, 844); await ev(C.page, 'SEVERE.setPaneCount(2)'); await C.page.waitForTimeout(500); await idle(C.page);
const sph = await ev(C.page, stampProbe);
const ph = await ev(C.page, () => { const d = document.getElementById('dock').getBoundingClientRect(), ps = [...document.querySelectorAll('.pane')].map((p) => p.getBoundingClientRect()); return { sw: document.documentElement.scrollWidth, iw: innerWidth, dl: d.left, dr: d.right, dt: d.top, db: d.bottom, ih: innerHeight, pb: Math.max(...ps.map((p) => p.bottom)), ph: ps.map((p) => Math.round(p.height)), n: ps.length }; });
check('on a phone (390 x 844) nothing scrolls sideways, the dock lies inside the screen (' + Math.round(ph.dl) + ' to ' + Math.round(ph.dr) + ' of ' + ph.iw + '), the two panes are stacked above it (heights ' + ph.ph.join(' and ') + ') and do not run under it, and the stamp is still there (' + sph.w + ' px wide, ' + (sph.hit.length ? 'touching ' + sph.hit.join(', ') : 'clear of everything') + ')',
  ph.sw <= ph.iw && ph.dl >= -1 && ph.dr <= ph.iw + 1 && ph.db <= ph.ih + 1 && ph.n === 2 && ph.pb <= ph.dt + 20 && ph.ph[0] > 150 && ph.ph[1] > 150 && C.log.errors.length === 0 && sph.shown && sph.inside && sph.hit.length === 0);
await C.page.screenshot({ path: process.env.SEVERE_SHOT ? process.env.SEVERE_SHOT + '-phone.png' : '/dev/null' }).catch(() => {}); await C.ctx.close();
const D = await open(1920, 1080); const big = await ev(D.page, () => ({ dw: document.getElementById('dock').getBoundingClientRect().width, p: SEVERE.panes[0].sweep !== null })); check('a 1920 x 1080 screen: the dock stays at most 1260 px wide and the sweep is up (' + Math.round(big.dw) + ' px)', big.dw <= 1262 && big.p && D.log.errors.length === 0);
await D.page.screenshot({ path: process.env.SEVERE_SHOT ? process.env.SEVERE_SHOT + '-desktop.png' : '/dev/null' }).catch(() => {}); await D.ctx.close();

/* 11. The storms: a menu, a recorded storm with a nest of 100 m (a file beside the page, fetched when it is asked for), a file that is not there, and the way back */
const H = await open(1440, 900), hp = H.page, near = (a, b, tol) => Math.abs(a - b) <= tol;
await ev(hp, "window.__xhr = []; const o = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (m, u) { window.__xhr.push(String(u)); return o.apply(this, arguments); };");      // (what the page asks for)
const menuRows = async () => { await hp.click('#b-storms'); const r = await ev(hp, "[...document.querySelectorAll('#pop .row')].map((r) => ({ id: r.dataset.id, on: r.getAttribute('aria-checked') === 'true', text: r.textContent }))"); return r; };
const packFile = join(dirname(FILE), 'severe-packs/wk82-100m-nest.hfp'), fileMB = existsSync(packFile) ? statSync(packFile).size / 1e6 : 0;
let stRows = await menuRows();
check('the Storms button lists the recorded storms, the 1 km one in use, and says what the other one weighs (' + stRows.map((r) => r.id + (r.on ? '*' : '')).join(', ') + '; ' + (/(\d+) MB/.exec(stRows[1] ? stRows[1].text : '') || [])[1] + ' MB for a file of ' + fileMB.toFixed(1) + ')',
  stRows.length === 2 && stRows[0].id === 'wk82-1km' && stRows[0].on && stRows[1].id === 'wk82-100m' && !stRows[1].on && /100 m nest/.test(stRows[1].text) && /(\d+) MB/.test(stRows[1].text) && near(+/(\d+) MB/.exec(stRows[1].text)[1], fileMB, 1.5) && fileMB > 1);
await hp.keyboard.press('Escape');
/* a file that is not there: the page says so and stays with its storm */
await ev(hp, "SEVERE.STORMS[1].file = 'severe-packs/not-there.hfp'"); await hp.click('#b-storms'); await hp.click('#pop [data-id="wk82-100m"]');
await hp.waitForFunction("/could not be shown/.test(document.getElementById('toast').textContent) && !document.getElementById('toast').hidden", null, { timeout: 20000 });
check('a storm file that is not there is refused with a word and the page stays with its storm (' + (await ev(hp, "document.getElementById('toast').textContent")).slice(0, 90) + '; ' + await ev(hp, 'SEVERE.S.storm') + ', ' + await ev(hp, 'SEVERE.pack.n') + ' frames)', await ev(hp, 'SEVERE.S.storm') === 'wk82-1km' && await ev(hp, 'SEVERE.pack.n') === 19 && !(await ev(hp, 'SEVERE.error')));
await ev(hp, "SEVERE.STORMS[1].file = 'severe-packs/wk82-100m-nest.hfp'");
await hp.click('#b-storms'); await hp.click('#pop [data-id="wk82-100m"]');
await hp.waitForFunction("SEVERE.S.storm === 'wk82-100m' && SEVERE.panes.length === 2 && SEVERE.panes.every((p) => p.sweep && p.sweep.frame === SEVERE.S.frame)", null, { timeout: 120000 }); await idle(hp);
const sn = await ev(hp, () => { const P = SEVERE.pack, v = P.volume(SEVERE.S.frame), G = HFSevereGeo, pn = SEVERE.panes[0], f = P.h.fn[SEVERE.S.frame][0], nh = P.h.nests[0], c = P.boxLatLon(P.times[SEVERE.S.frame], f[1] + nh.nx * nh.dx / 2, f[2] + nh.ny * nh.dx / 2), s = G.toScreen(pn.map.view, G.mercX(c.lon), G.mercY(c.lat));
  return { n: P.n, t0: P.times[0], t1: P.times[P.n - 1], nests: v.nests.length, dx: v.nests[0].vol.dx, nx: P.nx, ny: P.ny, products: SEVERE.panes.map((q) => q.product + '/' + q.tilt), interval: SEVERE.S.interval, clock: document.getElementById('clk').textContent, mpp: pn.map.view.mpp, sx: s[0], sy: s[1], w: pn.map.view.w, h: pn.map.view.h, name: P.name, ticks: document.querySelectorAll('#ticks span').length }; });
check('the 100 m storm is shown: ' + sn.n + ' frames from minute ' + sn.t0 + ' to ' + sn.t1 + ' with a nest of ' + sn.dx + ' m in each, in a box of ' + sn.nx + ' x ' + sn.ny + ' cells, open at ' + sn.clock + ' in two panes (' + sn.products.join(', ') + '), a frame every ' + sn.interval + ' minute and ' + sn.ticks + ' ticks',
  sn.n === 15 && sn.t0 === 71 && sn.t1 === 85 && sn.nests === 1 && sn.dx === 100 && sn.clock === '4:19 PM' && sn.products.join() === 'dbz/0,vel/0' && sn.interval === 1 && sn.ticks === 15 && /100 m nest/.test(sn.name));
check('and close up on the nest: ' + Math.round(sn.mpp) + ' m a pixel, the middle of the nest at ' + Math.round(sn.sx) + ', ' + Math.round(sn.sy) + ' of a pane of ' + Math.round(sn.w) + ' x ' + Math.round(sn.h), sn.mpp < 120 && sn.sx > 0.25 * sn.w && sn.sx < 0.75 * sn.w && sn.sy > 0.25 * sn.h && sn.sy < 0.75 * sn.h);
const stGpu = await ev(hp, () => SEVERE.panes.map((p) => { p.gl.draw(p.map.view, p.sweep.radar); const g = p.gl.read(); let n = 0; for (let i = 3; i < g.length; i += 64) if (g[i] > 0) n++; return n; }));
check('both panes draw the storm on the GPU (' + stGpu.join(' and ') + ' sampled pixels)', stGpu[0] > 2000 && stGpu[1] > 2000);
const shear = async (frame) => { await ev(hp, (f) => { SEVERE.setPlaying(false); SEVERE.setT(SEVERE.pack.times[f]); }, frame); await hp.waitForFunction((f) => SEVERE.panes.every((p) => p.sweep && p.sweep.frame === f), frame, { timeout: 60000 }); await idle(hp);
  return ev(hp, () => { const sw = SEVERE.panes[1].sweep, m = sw.meta, v = sw.vel; let mx = 0; for (let a = 0; a < m.nRad; a++) for (let g = 0; g < m.nGates; g++) { const x = v[a * m.nGates + g], y = v[((a + 1) % m.nRad) * m.nGates + g]; if (x === -32768 || y === -32768) continue; mx = Math.max(mx, Math.abs(x - y) / 2); } return mx; }); };
const sh0 = await shear(0), sh8 = await shear(8);
const sh8box = await ev(hp, () => { const P = SEVERE.pack, f = SEVERE.S.frame, vol = P.volume(f); delete vol.nests; const r = SEVERE.S.radar, rb = P.radarBox(P.times[f], r.lat, r.lon);
  const sw = HFSevereRadar.scan(vol, { x: rb.x, y: rb.y, elev: 0.5, dAz: 0.5, gate: 250, nGates: 920, r0: 2125, seed: 1 + f * 131, clutter: { ground: 1, clearAir: 1 }, velocity: { nyquist: 28, dealias: false, noise: 1 } });
  let mx = 0; for (let a = 0; a < sw.nRad; a++) for (let g = 0; g < sw.nGates; g++) { const x = sw.vel[a * sw.nGates + g], y = sw.vel[((a + 1) % sw.nRad) * sw.nGates + g]; if (!(x > -1e5) || !(y > -1e5)) continue; mx = Math.max(mx, Math.abs(x - y)); } return mx; });      // (the operator's own sweep: m/s, NaN for none)
check('the radar sees the nest: at the start of the recording the largest velocity step between neighbouring radials is ' + sh0.toFixed(1) + ' m/s, at 4:19 PM it is ' + sh8.toFixed(1) + ' (a couplet, folded at the Nyquist velocity of 28 m/s) and the same frame scanned without its nest, the 500 m box alone, gives ' + sh8box.toFixed(1), sh0 < 35 && sh8 >= 40 && sh8box < 30);
stRows = await menuRows(); await hp.click('#pop [data-id="wk82-1km"]');
await hp.waitForFunction("SEVERE.S.storm === 'wk82-1km' && SEVERE.panes.every((p) => p.sweep && p.sweep.frame === SEVERE.S.frame)", null, { timeout: 60000 }); await idle(hp);
const back = await ev(hp, () => ({ n: SEVERE.pack.n, interval: SEVERE.S.interval, clock: document.getElementById('clk').textContent, nests: SEVERE.pack.volume(SEVERE.S.frame).nests || null, mpp: SEVERE.panes[0].map.view.mpp }));
check('the way back: the menu had the 100 m storm in use (' + stRows.map((r) => r.id + (r.on ? '*' : '')).join(', ') + '), choosing the 1 km storm brings back its 19 frames at ' + back.clock + ', 5 minutes apart (' + back.interval + '), without nests, at the old distance (' + Math.round(back.mpp) + ' m a pixel)', stRows[1].on && back.n === 19 && back.interval === 5 && back.clock === '4:00 PM' && !back.nests && back.mpp > 150);
stRows = await menuRows(); const nRows = stRows.length; await hp.click('#pop [data-id="wk82-100m"]');
await hp.waitForFunction("SEVERE.S.storm === 'wk82-100m' && SEVERE.panes.every((p) => p.sweep && p.sweep.frame === SEVERE.S.frame)", null, { timeout: 60000 }); await idle(hp);
const asked = await ev(hp, 'window.__xhr');
check('the 100 m storm is fetched when it is first asked for and not again: the page asked for ' + asked.map((u) => u.replace(/^.*\//, '')).join(', ') + ' (a missing file once, the recording once) and the second time it showed the one it had; with no run made there is no "Your last run" row (' + nRows + ' rows)',
  asked.length === 2 && /not-there/.test(asked[0]) && /wk82-100m-nest/.test(asked[1]) && nRows === 2);
await H.ctx.close();
await browser.close();

console.log(`\n${passed} passed, ${failed} failed (${((Date.now() - t0) / 1000).toFixed(0)} s)` + (failed ? '\nfailed: ' + failedNames.join(' | ') : ''));
process.exit(failed ? 1 : 0);
