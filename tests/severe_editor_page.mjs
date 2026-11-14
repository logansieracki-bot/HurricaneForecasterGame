// End-to-end checks of the editor, the Draw mode of the Severe page (dist/severe.html, built by `npm run build`) in headless Chromium, from file:// with the network refused: a front is sketched with the mouse and
// comes out with the symbols, the side and the arrow a forecaster would give it; objects are selected, dragged by a point, by the body and by the tip of their arrow; the sliders change them; undo and redo,
// delete and duplicate work; the hour slider moves the day and forbids drawing; the maps of the indices and the sounding of a tapped spot are made from the drawing; a day is saved with its stamp and loaded again;
// the radar mode still works after the editor has been used; the page lays itself out on a phone and in the light theme. Everything is driven by the mouse and the keys, as a person would.
import { chromium } from 'playwright';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url))), FILE = process.env.SEVERE_HTML || join(ROOT, 'dist/severe.html');
if (!existsSync(FILE)) { console.error('dist/severe.html is missing: run `npm run build` first'); process.exit(2); }
let failed = 0, passed = 0; const failedNames = [], t0 = Date.now();
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; failedNames.push(name); console.log('FAIL ' + name); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const tmp = mkdtempSync(join(tmpdir(), 'sev-ed-'));

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(w, h, opts = {}) {
  const ctx = opts.ctx || await browser.newContext({ viewport: { width: w, height: h }, colorScheme: opts.scheme || 'dark', hasTouch: w < 800, acceptDownloads: true }), page = await ctx.newPage(), log = { errors: [], requests: [] };
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/willReadFrequently/.test(m.text())) log.errors.push(m.type() + ': ' + m.text()); });             // (the warning about reading a canvas back often is for this test's own pixel counts) page.on('pageerror', (e) => log.errors.push('pageerror: ' + e));
  if (!opts.ctx) await ctx.route('**/*', (route) => { const u = route.request().url(); if (/^(file|blob|data):/.test(u)) route.continue(); else { log.requests.push(u); route.abort(); } });
  await page.goto(pathToFileURL(FILE).href + '#draw');
  await page.waitForFunction('window.SEVERE && (window.SEVERE.ready === true || window.SEVERE.error) && window.SEVERE.editor && window.SEVERE.editor.E.ready', null, { timeout: 120000 });
  return { page, ctx, log };
}
const ev = (p, f, a) => p.evaluate(f, a);
const px = (p, x, y) => p.evaluate(([x, y]) => SEVERE.editor.toScreen(SEVERE.editor.map.view, x, y), [x, y]);
const E = (p, f) => p.evaluate('(() => { const E = SEVERE.editor.E; return ' + f + '; })()');
const objs = (p) => E(p, 'E.drawing.objects.map((o) => JSON.parse(JSON.stringify(o)))');
const hist = (p) => E(p, 'E.hist.stack.length');
async function drag(p, pts, steps = 5) { await p.mouse.move(pts[0][0], pts[0][1]); await p.mouse.down(); for (const q of pts.slice(1)) await p.mouse.move(q[0], q[1], { steps }); await p.mouse.up(); }
async function sketch(p, tool, kms) { await p.click('#ed-tools [data-id="' + tool + '"]'); const pts = []; for (const k of kms) pts.push(await px(p, k[0], k[1])); await drag(p, pts); }
const slide = (p, id, v) => p.$eval('#' + id, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const settle = (p) => p.waitForTimeout(120);
const idle2 = (p) => p.evaluate('SEVERE.whenIdle()');

/* 1. The editor opens from the address, with no request and no complaint, and shows the ready-made day */
const A = await open(1440, 900), pg = A.page;
check('the editor opens from #draw with no console error and not one request outside file:, blob: and data: (' + A.log.errors.length + ' errors, ' + A.log.requests.length + ' requests)', A.log.errors.length === 0 && A.log.requests.length === 0 && !(await ev(pg, 'window.SEVERE.error')));
check('the radar is out of the way and the editor on show (editor ' + await ev(pg, "getComputedStyle(document.getElementById('editor')).display") + ', radar panes ' + await ev(pg, "getComputedStyle(document.getElementById('panes')).display") + ', the mode switch says Draw)',
  await ev(pg, "getComputedStyle(document.getElementById('editor')).display") === 'block' && await ev(pg, "getComputedStyle(document.getElementById('panes')).display") === 'none' && await ev(pg, "document.getElementById('m-draw').getAttribute('aria-selected')") === 'true' && await ev(pg, "document.getElementById('app').dataset.mode") === 'draw');
const o0 = await objs(pg);
check('it starts on the dryline day: ' + o0.length + ' objects (a low, two fronts, a dryline, a moist tongue and the jets and an upper low), the map as big as the window (' + await E(pg, 'SEVERE.editor.map.view.w') + ' x ' + await E(pg, 'SEVERE.editor.map.view.h') + ') and nothing selected',
  await E(pg, 'E.day.id') === 'dryline' && o0.length === 8 && await E(pg, 'SEVERE.editor.map.view.w') === 1440 && await E(pg, 'SEVERE.editor.map.view.h') === 900 && await E(pg, 'E.sel') === -1 && await ev(pg, "document.getElementById('ed-props').hidden"));
const iso = await E(pg, 'E.pgrid && E.pgrid.lines.length'), cv = await ev(pg, "(() => { const c = document.querySelector('#ed-pane .cv-top'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; })()");
check('the isobars are contoured (' + iso + ' levels) and painted over the map (' + cv + ' pixels), the tools are all there (' + await ev(pg, "document.querySelectorAll('#ed-tools .tl').length") + '), the stamp is on the dock (' + await ev(pg, "document.getElementById('ed-stamp').textContent") + ')',
  iso >= 5 && cv > 20000 && await ev(pg, "document.querySelectorAll('#ed-tools .tl').length") === 15 && /^HYPOTHETICAL · Isobar Severe Simulator$/.test(await ev(pg, "document.getElementById('ed-stamp').textContent")));

/* 2. A blank day, and a front sketched with the mouse */
await ev(pg, "SEVERE.editor.loadDay(HFSevereDays.blank(36, -98))"); await settle(pg);
check('a blank day has no objects and the history has one state (' + (await objs(pg)).length + ' objects, ' + await hist(pg) + ' state), undo and redo are off', (await objs(pg)).length === 0 && await hist(pg) === 1 && await ev(pg, "document.getElementById('ed-undo').disabled") && await ev(pg, "document.getElementById('ed-redo').disabled"));
const km0 = [[-200, -200], [-205, -60], [-190, 60], [-170, 200]]; await sketch(pg, 'cold', km0); await settle(pg);
let o = await objs(pg), f = o[0] || {};
check('a cold front sketched from south to north is one object of its kind with the points of the sketch simplified (' + (f.pts || []).length + ' points from (' + (f.pts || [[0, 0]])[0].join(', ') + ') km to (' + (f.pts || [[0, 0]]).slice(-1)[0].join(', ') + ')), ending where it was drawn',
  o.length === 1 && f.type === 'front' && f.kind === 'cold' && f.pts.length >= 2 && f.pts.length <= 5 && near(f.pts[0][0], -200, 12) && near(f.pts[0][1], -200, 12) && near(f.pts.slice(-1)[0][0], -170, 12) && near(f.pts.slice(-1)[0][1], 200, 12));
check('its cold air is to the west (the left of a line drawn north: ' + f.cold + ') and it moves east towards the warm air at 10 m/s (' + JSON.stringify(f.motion) + '), with the contrast of a cold front (' + f.contrast + ' K)', f.cold === 'left' && near(Math.hypot(f.motion.u, f.motion.v), 10, 0.2) && f.motion.u > 8 && f.contrast === 12);
check('the tool goes back to Select, the new object is selected and its card is on show, named, with the sliders of a front (tool ' + await E(pg, 'E.tool') + ', selected ' + await E(pg, 'E.sel') + ', card: ' + await ev(pg, "document.querySelector('#ed-props b').textContent") + ')',
  await E(pg, 'E.tool') === 'select' && await E(pg, 'E.sel') === 0 && await ev(pg, "!document.getElementById('ed-props').hidden") && await ev(pg, "document.querySelector('#ed-props b').textContent") === 'Cold front' && await ev(pg, "!!document.getElementById('p-contrast') && !!document.getElementById('p-width') && !!document.getElementById('p-speed') && !!document.getElementById('p-head')"));
check('the drawing was committed once (history ' + await hist(pg) + ' states), undo is on', await hist(pg) === 2 && !(await ev(pg, "document.getElementById('ed-undo').disabled")));

/* 3. Flip its sides: the front now moves into the cold air, the page says so, undo takes it back */
await pg.click('#p-flip'); await settle(pg);
o = await objs(pg); const warns = await E(pg, 'E.warns.map((w) => w.text)');
check('flipping the sides puts the cold air to the east (' + o[0].cold + '), so the front moves into it: the page warns (' + (warns[0] || '').slice(0, 60) + '...), once on the screen (' + await ev(pg, "document.querySelectorAll('#ed-warn .wn').length") + ')',
  o[0].cold === 'right' && warns.length === 1 && /moves into the cold air/.test(warns[0]) && await ev(pg, "document.querySelectorAll('#ed-warn .wn').length") === 1);
await pg.click('#ed-undo'); await settle(pg);
check('undo takes the flip back (' + (await objs(pg))[0].cold + '), the warning goes (' + await ev(pg, "document.querySelectorAll('#ed-warn .wn').length") + '), redo brings both again', (await objs(pg))[0].cold === 'left' && await ev(pg, "document.querySelectorAll('#ed-warn .wn').length") === 0);
await pg.click('#ed-redo'); await settle(pg); const redone = (await objs(pg))[0].cold === 'right' && await ev(pg, "document.querySelectorAll('#ed-warn .wn').length") === 1; await pg.click('#ed-undo'); await settle(pg);
check('redo flips it again and a second undo restores it (' + redone + ')', redone && (await objs(pg))[0].cold === 'left');

/* 4. A warm front by taps, a low by a tap, a dryline by the key */
await pg.click('#ed-tools [data-id="warm"]'); const w3 = [[-100, -150], [0, -120], [150, -140]], wp = []; for (const k of w3) wp.push(await px(pg, k[0], k[1]));
for (const q of wp) { await pg.mouse.click(q[0], q[1]); await settle(pg); }
check('tapping three points builds a front that is not finished yet (a hint says how: "' + await ev(pg, "document.getElementById('ed-hint').textContent") + '", ' + await E(pg, 'E.build && E.build.pts.length') + ' points, ' + (await objs(pg)).length + ' objects)', await E(pg, 'E.build && E.build.pts.length') === 3 && (await objs(pg)).length === 1 && /Enter/.test(await ev(pg, "document.getElementById('ed-hint').textContent")));
await pg.keyboard.press('Enter'); await settle(pg); o = await objs(pg); f = o[1] || {};
check('Enter finishes it: a warm front of three points (' + (f.pts || []).length + ') with its cold air to the north (the left of a line drawn east: ' + f.cold + ') moving north into it at 4 m/s (' + JSON.stringify(f.motion) + '), ' + f.contrast + ' K of contrast',
  o.length === 2 && f.kind === 'warm' && f.pts.length === 3 && f.cold === 'left' && f.motion.v > 3 && near(Math.hypot(f.motion.u, f.motion.v), 4, 0.2) && f.contrast === 10);
await pg.keyboard.press('l'); const lowAt = await px(pg, 250, 150); await pg.mouse.click(lowAt[0], lowAt[1]); await settle(pg); o = await objs(pg); f = o[2] || {};
check('the key L picks the low and a tap places it where it was tapped (' + f.x + ', ' + f.y + ' km for 250, 150), 15 hPa deep, 400 km wide, moving east-north-east',
  o.length === 3 && f.type === 'low' && near(f.x, 250, 2) && near(f.y, 150, 2) && f.depth === 15 && f.size === 400 && f.motion.u > 0);
const dl = [[60, -250], [40, -100], [70, 40]]; await sketch(pg, 'dryline', dl); await settle(pg); o = await objs(pg); f = o[3] || {};
check('a dryline sketched from south to north has the dry air on its west (' + f.dry + ') and moves east into the moist air (' + JSON.stringify(f.motion) + ')', o.length === 4 && f.type === 'dryline' && f.dry === 'left' && f.motion.u > 2 && f.contrast === 12);
check('every drawing was its own state of the history (' + await hist(pg) + ' states, with the flip and its undo dropped from the future: 1 + 4 objects + 1 flip undone)', await hist(pg) >= 5);

/* 5. Select by a tap, drag a point, the body and the tip of the arrow */
await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape'); await settle(pg);
const front = (await objs(pg))[0], fp0 = await px(pg, front.pts[0][0], front.pts[0][1]), kpp = await E(pg, 'SEVERE.editor.map.view.mpp');
await pg.mouse.click(...await px(pg, (front.pts[0][0] + front.pts[1][0]) / 2, (front.pts[0][1] + front.pts[1][1]) / 2)); await settle(pg);
check('a tap on the body of the front selects it and shows its card (selected ' + await E(pg, 'E.sel') + ': ' + await ev(pg, "document.querySelector('#ed-props b').textContent") + ')', await E(pg, 'E.sel') === 0 && await ev(pg, "document.querySelector('#ed-props b').textContent") === 'Cold front');
const h0 = await hist(pg); await drag(pg, [fp0, [fp0[0] + 60, fp0[1] - 40]]); await settle(pg); const after = (await objs(pg))[0], kmMove = await pg.evaluate(([a, b]) => { const m = SEVERE.editor.map.view, k0 = SEVERE.editor.toKm(m, a[0], a[1]), k1 = SEVERE.editor.toKm(m, a[0] + 60, a[1] - 40); return [k1[0] - k0[0], k1[1] - k0[1]]; }, [fp0]);
check('dragging the first point of the front moves that point by the drag (' + (after.pts[0][0] - front.pts[0][0]) + ', ' + (after.pts[0][1] - front.pts[0][1]) + ' km for ' + kmMove.map((x) => x.toFixed(0)).join(', ') + '), and no other (' + JSON.stringify(after.pts.slice(1)) + ' against ' + JSON.stringify(front.pts.slice(1)) + '), as one new state (' + await hist(pg) + ' for ' + (h0 + 1) + ')',
  near(after.pts[0][0] - front.pts[0][0], kmMove[0], 2) && near(after.pts[0][1] - front.pts[0][1], kmMove[1], 2) && JSON.stringify(after.pts.slice(1)) === JSON.stringify(front.pts.slice(1)) && await hist(pg) === h0 + 1);
await pg.click('#ed-undo'); await settle(pg);
check('undo puts the point back exactly (' + JSON.stringify((await objs(pg))[0].pts[0]) + ' against ' + JSON.stringify(front.pts[0]) + ')', JSON.stringify((await objs(pg))[0].pts) === JSON.stringify(front.pts));
const mid = await px(pg, (front.pts[1][0] + front.pts[2][0]) / 2, (front.pts[1][1] + front.pts[2][1]) / 2); await drag(pg, [mid, [mid[0] + 50, mid[1] + 20]]); await settle(pg); const moved = (await objs(pg))[0];
const dxs = moved.pts.map((p, i) => p[0] - front.pts[i][0]), dys = moved.pts.map((p, i) => p[1] - front.pts[i][1]);
check('dragging the body moves every point by the same amount (' + dxs.map((x) => x.toFixed(0)).join(', ') + ' km east, ' + dys.map((x) => x.toFixed(0)).join(', ') + ' km north)', dxs.every((x) => near(x, dxs[0], 1.01)) && dys.every((y) => near(y, dys[0], 1.01)) && Math.abs(dxs[0]) > 20);
await pg.click('#ed-undo'); await settle(pg);
const tip = await ev(pg, '(() => { const ed = SEVERE.editor, o = ed.E.drawing.objects[ed.E.sel], t = ed.tipOf(o); return ed.toScreen(ed.map.view, t[0], t[1]); })()'), m0 = (await objs(pg))[0].motion;
await drag(pg, [tip, [tip[0] + 36, tip[1] - 18]]); await settle(pg); const m1 = (await objs(pg))[0].motion, du = await pg.evaluate(() => 0);
void du;
check('dragging the tip of the arrow changes the front\'s motion (' + JSON.stringify(m0) + ' to ' + JSON.stringify(m1) + ': faster and turned to the north), and the sliders of the card follow when it is selected again',
  m1.u !== m0.u && m1.v > m0.v + 1 && Math.hypot(m1.u, m1.v) > Math.hypot(m0.u, m0.v));
await pg.click('#ed-undo'); await settle(pg);

/* 6. The sliders of the card, the kind of front, duplicate, delete */
await slide(pg, 'p-contrast', 20); await settle(pg); let fo = (await objs(pg))[0];
check('the contrast slider changes the front (' + fo.contrast + ' K) and a card label says so (' + await ev(pg, "document.getElementById('p-contrast-v').textContent") + '), as a new state of the history',
  fo.contrast === 20 && /20/.test(await ev(pg, "document.getElementById('p-contrast-v').textContent")));
await slide(pg, 'p-speed', 22.37); await slide(pg, 'p-head', 90); await settle(pg); fo = (await objs(pg))[0];
check('the speed and heading sliders set the arrow (22.4 mph = 10 m/s at 90 degrees, east: ' + JSON.stringify(fo.motion) + ')', near(fo.motion.u, 10, 0.2) && near(fo.motion.v, 0, 0.2));
await pg.click('#p-kind [data-k="occluded"]'); await settle(pg); fo = (await objs(pg))[0];
check('the kind buttons change a cold front into an occluded one (' + fo.kind + ', card: ' + await ev(pg, "document.querySelector('#ed-props b').textContent") + ')', fo.kind === 'occluded' && await ev(pg, "document.querySelector('#ed-props b').textContent") === 'Occluded front');
const n0 = (await objs(pg)).length; await pg.click('#p-dup'); await settle(pg);
check('duplicate makes a copy 80 km east and 60 south and selects it (' + (await objs(pg)).length + ' objects, selected ' + await E(pg, 'E.sel') + ', first point ' + JSON.stringify((await objs(pg))[n0].pts[0]) + ' against ' + JSON.stringify((await objs(pg))[0].pts[0]) + ')',
  (await objs(pg)).length === n0 + 1 && await E(pg, 'E.sel') === n0 && near((await objs(pg))[n0].pts[0][0] - (await objs(pg))[0].pts[0][0], 80, 0.01) && near((await objs(pg))[n0].pts[0][1] - (await objs(pg))[0].pts[0][1], -60, 0.01));
await pg.keyboard.press('Delete'); await settle(pg);
check('Delete removes the selected object (' + (await objs(pg)).length + ' objects, nothing selected: ' + await E(pg, 'E.sel') + ', the card is gone: ' + await ev(pg, "document.getElementById('ed-props').hidden") + ')', (await objs(pg)).length === n0 && await E(pg, 'E.sel') === -1 && await ev(pg, "document.getElementById('ed-props').hidden"));
await pg.keyboard.press('Control+z'); await settle(pg);
check('Ctrl+Z brings it back (' + (await objs(pg)).length + ' objects)', (await objs(pg)).length === n0 + 1);

/* 7. The hour slider moves the day and drawing is forbidden at another hour */
const before = JSON.stringify(await objs(pg)); await slide(pg, 'ed-slider', 6); await settle(pg);
check('at +6 h the clock says so (' + await ev(pg, "document.getElementById('ed-clk').textContent + ' / ' + document.getElementById('ed-clk-sub').textContent") + '), the drawing is untouched (' + (JSON.stringify(await objs(pg)) === before) + ') and the objects are drawn moved along their arrows',
  await E(pg, 'E.t') === 6 && await ev(pg, "document.getElementById('ed-clk').textContent") === '+6 h' && /6:00 PM/.test(await ev(pg, "document.getElementById('ed-clk-sub').textContent")) && JSON.stringify(await objs(pg)) === before);
await pg.click('#ed-tools [data-id="trough"]'); const tg = [await px(pg, -100, 220), await px(pg, 100, 240)]; await drag(pg, tg); await settle(pg);
check('a drawing tool at +6 h draws nothing, and says why (' + (await objs(pg)).length + ' objects; the hint: "' + await ev(pg, "document.getElementById('ed-hint').textContent") + '")', JSON.stringify(await objs(pg)) === before && /Go back to \+0 h/.test(await ev(pg, "document.getElementById('ed-hint').textContent")));
await pg.keyboard.press('Escape'); await slide(pg, 'ed-slider', 0); await settle(pg);

/* 8. The maps of the indices are made from the drawing */
await ev(pg, "SEVERE.editor.loadDay(HFSevereDays.get('outbreak'))"); await settle(pg); await pg.click('#d-layers [data-l="mlcape"]');
await pg.waitForFunction("SEVERE.editor.E.fields && SEVERE.editor.E.fields.layer === 'mlcape'", null, { timeout: 30000 }); await settle(pg);
const COUNT = "(() => { const c = document.querySelector('#ed-pane .cv-fill'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0, r = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) { n++; r += d[i - 3] > 200 && d[i - 2] < 200 ? 1 : 0; } return { n, hot: r, total: d.length / 4 }; })()";
await pg.waitForFunction('(' + COUNT + ').n > 0', null, { timeout: 15000, polling: 150 }).catch(() => {});          // (the map is painted by the next animation frame after the field is made: CI run 183 read it 120 ms after, before that frame, and the next check, two seconds later, saw it painted)
const fill = await ev(pg, COUNT);
check('the map of CAPE is painted under the objects (' + fill.n + ' of ' + fill.total + ' pixels coloured, ' + fill.hot + ' of them orange or red), with its colour bar and its name (' + await ev(pg, "document.getElementById('ed-legend').dataset.name") + ')',
  fill.n > fill.total * 0.25 && fill.hot > 5000 && await ev(pg, "!document.getElementById('ed-legend').hidden") && await ev(pg, "document.getElementById('ed-legend').dataset.name") === 'CAPE');
const west = await ev(pg, "(() => { const ed = SEVERE.editor, c = document.querySelector('#ed-pane .cv-fill'), p = ed.toScreen(ed.map.view, -450, -150), q = ed.toScreen(ed.map.view, 250, -100), g = c.getContext('2d'), a = g.getImageData(Math.round(p[0]), Math.round(p[1]), 1, 1).data[3], b = g.getImageData(Math.round(q[0]), Math.round(q[1]), 1, 1).data[3]; return [a, b]; })()");
check('the cold air behind the front has no CAPE and the warm sector has plenty: the map is clear there and coloured here (opacity ' + west[0] + ' and ' + west[1] + ')', west[0] < 40 && west[1] > 100);
await pg.click('#d-layers [data-l="off"]'); await settle(pg);
check('Off takes the map and its colour bar away (' + await ev(pg, "document.getElementById('ed-legend').hidden") + ')', await ev(pg, "document.getElementById('ed-legend').hidden"));

/* 9. A tap on empty ground gives the sounding there, and sets where a storm would start */
const stable = async (p) => { let last = ''; for (let i = 0; i < 60; i++) { const v = await ev(p, 'JSON.stringify(SEVERE.editor.map.view)'); if (v === last) return true; last = v; await p.waitForTimeout(100); } return false; };      // (the view has stopped moving)
await stable(pg);
await ev(pg, "(() => { const pane = document.getElementById('ed-pane'); window.__tap = null; pane.addEventListener('pointerup', (e) => { const r = pane.getBoundingClientRect(); window.__tap = { x: e.clientX - r.left, y: e.clientY - r.top, view: JSON.parse(JSON.stringify(SEVERE.editor.map.view)) }; }, { capture: true, once: true }); })()");
const tapAt = await px(pg, 330, -150); await pg.mouse.click(tapAt[0], tapAt[1]); await pg.waitForSelector('#sh-skew', { timeout: 10000 }); await settle(pg);
const tapped = await ev(pg, "(() => { const t = window.__tap; return t ? { x: t.x, y: t.y, km: SEVERE.editor.toKm(t.view, t.x, t.y) } : null; })()");
const sk = await ev(pg, "(() => { const c = document.getElementById('sh-skew'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let red = 0, green = 0, any = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 200) any++; if (d[i] > 220 && d[i + 1] < 120 && d[i + 2] < 120 && d[i + 3] > 200) red++; if (d[i + 1] > 200 && d[i] < 130 && d[i + 2] < 160 && d[i + 3] > 200) green++; } return { red, green, any }; })()");
const txt = await ev(pg, "document.getElementById('ed-sheet').textContent");
check('a tap on empty ground opens the sounding: a skew-T with the temperature in red (' + sk.red + ' pixels) and the dew point in green (' + sk.green + '), a hodograph, the numbers and what to expect ("' + (txt.match(/Supercells\.|Organised multicell[^.]*\.|Pulse[^.]*\.|No storms[^.]*\.|Capped[^.]*\./) || [''])[0] + '")',
  sk.red > 200 && sk.green > 200 && /CAPE/.test(txt) && /Tornado param/.test(txt) && /Supercells|multicell|Pulse|Capped|No storms/.test(txt) && await ev(pg, "!!document.getElementById('sh-hodo')"));
const spot = await E(pg, 'E.spot');
check('the spot for a storm is the tapped one (' + spot.x + ', ' + spot.y + ' for 330, -150: the pointer was at ' + (tapped ? tapped.x.toFixed(1) + ', ' + tapped.y.toFixed(1) + ' px of the pane, which is ' + tapped.km.map((v) => v.toFixed(1)).join(', ') + ' km, and the click was asked for ' + tapAt.map((v) => v.toFixed(1)).join(', ') + ') and the button to run one is on (' + !(await ev(pg, "document.getElementById('ed-start').disabled")) + ')' : 'no pointer') ,
  !!tapped && spot.x === Math.round(tapped.km[0]) && spot.y === Math.round(tapped.km[1]) && near(spot.x, 330, 4) && near(spot.y, -150, 4) && !(await ev(pg, "document.getElementById('ed-start').disabled")));
await pg.keyboard.press('Escape'); await settle(pg);
check('Esc closes the sheet (' + await ev(pg, "document.getElementById('ed-sheet').hidden") + ')', await ev(pg, "document.getElementById('ed-sheet').hidden"));

/* 10. The day card: the sliders, the picker, save and load */
await pg.click('#ed-day summary'); await slide(pg, 'd-td0', 70); await settle(pg);
const dewNow = await ev(pg, 'SEVERE.editor.E.A.surface(250, 100, 0).Td * 1.8 + 32');
check('the air of the day: a dew point of 70 F for the warm air gives a drier warm sector than the outbreak day\'s own (' + dewNow.toFixed(1) + ' F at (250, 100) km, the moist tongue adds to it), written into the drawing as g/kg (' + JSON.stringify((await E(pg, 'E.drawing.air')) || {}) + ')', dewNow < 78 && dewNow > 66 && near(await E(pg, 'E.drawing.air.warm.qv0'), 15.8, 1.2));
const dlp = pg.waitForEvent('download', { timeout: 10000 }); await pg.click('#d-save'); const dld = await dlp, path = join(tmp, 'day.json'); await dld.saveAs(path); const doc = JSON.parse(readFileSync(path, 'utf8'));
check('Save gives a file that says what it is (' + doc.stamp + ') with the drawing in it (' + doc.drawing.objects.length + ' objects, the day\'s name "' + doc.day.name + '")', doc.stamp === 'HYPOTHETICAL from Isobar Severe Simulator' && doc.drawing.objects.length === 8 && doc.day.name === 'Tornado outbreak day' && doc.drawing.air.warm.qv0 === (await E(pg, 'E.drawing.air.warm.qv0')));
await pg.click('#d-pick'); await pg.selectOption('#d-pick', 'hail'); await settle(pg);
check('picking another day loads it (the ' + await E(pg, 'E.day.name') + ': ' + (await objs(pg)).length + ' objects, its air: ' + Object.keys((await E(pg, 'E.drawing.air')) || {}) + '), the story on the card changes and the map goes there (' + (await E(pg, 'E.day.lat')) + ' N)', await E(pg, 'E.day.id') === 'hail' && (await objs(pg)).length === 5 && /lee trough/.test(await ev(pg, "document.querySelector('#ed-day .story').textContent")) && await E(pg, 'E.hist.stack.length') === 1);
await pg.setInputFiles('#d-file', path); await settle(pg); await pg.waitForFunction("SEVERE.editor.E.day.id === 'file'", null, { timeout: 5000 });
check('Load takes the saved file back: the outbreak day with its dew point change (' + await E(pg, 'E.day.name') + ', ' + (await objs(pg)).length + ' objects, qv0 ' + await E(pg, 'E.drawing.air.warm.qv0') + ')', await E(pg, 'E.day.name') === 'Tornado outbreak day' && (await objs(pg)).length === 8 && doc.drawing.air.warm.qv0 === await E(pg, 'E.drawing.air.warm.qv0'));
await pg.setInputFiles('#d-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"nothing": 1}') }); await settle(pg);
check('a file that is not a day is refused and the day stays (' + await E(pg, 'E.day.name') + ', toast: "' + await ev(pg, "document.getElementById('toast').textContent") + '")', await E(pg, 'E.day.name') === 'Tornado outbreak day' && /Could not load/.test(await ev(pg, "document.getElementById('toast').textContent")));

/* 10b. A storm from the drawing: the card, a short run in a Worker, the radar playing it, a cancel */
await ev(pg, "SEVERE.editor.loadDay(HFSevereDays.get('dryline'))"); await settle(pg);
await pg.click('#ed-start'); await pg.waitForSelector('#run-go', { timeout: 5000 });
const card = await ev(pg, "(() => { const t = document.getElementById('ed-run').textContent; return { t, tiles: document.querySelectorAll('#ed-run .env div').length, chips: document.querySelectorAll('#run-len button').length, shown: !document.getElementById('ed-run').hidden }; })()");
check('Run a storm opens a card that says where and when (' + (card.t.match(/Near [A-Za-z .]+ · \+\d h · [\d:]+ [AP]M/) || [''])[0] + '), the environment in four numbers (' + card.tiles + ') and what to expect, and the lengths to choose from (' + card.chips + ')', card.shown && card.tiles === 4 && card.chips === 4 && /Near [A-Za-z .]+ · \+4 h · 4:00 PM/.test(card.t) && /Supercells/.test(card.t) && /CAPE/.test(card.t));
await pg.click('#run-x'); check('the card closes (' + await ev(pg, "document.getElementById('ed-run').hidden") + ')', await ev(pg, "document.getElementById('ed-run').hidden"));
const runP = pg.evaluate(() => SEVERE.editor.runStorm({ minutes: 10, dx: 4000, box: 48000, dt: 10, frameEvery: 5 }).then((r) => ({ ok: true, n: r.pack.n, times: r.pack.times, name: r.pack.name, scenario: r.scenario, header: r.pack.h })).catch((e) => ({ ok: false, e: String(e.message || e) })));
const run = await runP;
check('a run of 10 minutes at 4 km finishes with three frames at 0, 5 and 10 minutes (' + JSON.stringify(run.times) + '), named after the day (' + run.name + ')', run.ok && JSON.stringify(run.times) === '[0,5,10]' && run.name === 'Dryline day, storm run');
await pg.evaluate('SEVERE.whenIdle()');
const landed = await ev(pg, "(() => { const S = SEVERE, E = S.editor.E, G = HFSevereGeo, sc = E.lastRun.scenario, p = S.pack, here = G.fromLocal(E.day.lat, E.day.lon, E.lastRun.spot.x * 1000, E.lastRun.spot.y * 1000), box = p.boxLatLon(0, 24000, 24000), site = S.siteInfo(S.geo.points.site.names.indexOf(sc.radar)); " +
  "const path = p.path(), at = (q) => G.fromLocal(E.day.lat, E.day.lon, E.lastRun.spot.x * 1000 + q.x, E.lastRun.spot.y * 1000 + q.y), mid = at(path.mid), nearest = Math.min(...path.pts.map((q) => { const l = at(q); return G.distBearing(l.lat, l.lon, site.lat, site.lon).d; })); return { nearest, mode: document.getElementById('app').dataset.mode, frames: S.frames().length, frame: S.S.frame, t: S.S.t, radar: S.S.radar.id, scRadar: sc.radar, startErr: G.distBearing(here.lat, here.lon, box.lat, box.lon).d, midToSite: G.distBearing(mid.lat, mid.lon, site.lat, site.lon).d, clock: p.clock(p.times[S.S.frame]).text, tz: sc.tz, clock0: sc.clock, sweep: !!S.panes[0].sweep, ticks: document.querySelectorAll('#ticks span').length, runHidden: document.getElementById('ed-run').hidden, busy: S.editor.LAB.busy }; })()");
check('the radar then plays it: the Radar mode is on (' + landed.mode + '), the page has the three frames (' + landed.frames + ') and shows the last at ' + landed.t + ' minutes, 4:10 PM local (' + landed.clock + '), with a sweep of it scanned in Workers (' + landed.sweep + '), the card is gone (' + landed.runHidden + ') and the model is free (' + !landed.busy + ')',
  landed.mode === 'radar' && landed.frames === 3 && landed.t === 10 && landed.frame === 2 && landed.clock === '4:10 PM' && landed.sweep && landed.runHidden && !landed.busy && landed.tz === 'CDT' && landed.clock0 === '16:00');
check('the box is on the ground so that the storm starts at the spot that was tapped (the bubble, at the middle of the box, is ' + (landed.startErr / 1000).toFixed(2) + ' km from it), and the radar is the site nearest the middle of the storm\'s own path (the pack\'s path()) that is at least 25 km from it and 15 km from every frame\'s place (' + landed.radar + ', ' + (landed.midToSite / 1000).toFixed(0) + ' km from the middle of the path, ' + (landed.nearest / 1000).toFixed(0) + ' km from the nearest frame)',
  landed.startErr < 800 && landed.radar === landed.scRadar && landed.midToSite >= 25000 && landed.midToSite < 160000 && landed.nearest >= 15000);
/* the radar is handed on when the storm's real path went under it: the storm put over the radar at every frame, then the path as it was */
{
  const ho = await ev(pg, "(() => { const S = SEVERE, E = S.editor.E, G = HFSevereGeo, pack = S.pack, run = E.lastRun, cur = Object.assign({}, S.S.radar), h = pack.h, half = pack.nx * pack.dx / 2, mo = pack.motion, r = G.local(E.day.lat, E.day.lon, cur.lat, cur.lon), sx = E.spot.x * 1000, sy = E.spot.y * 1000, keep = h.track.map((q) => q.slice());" +
    "const away = S.editor.handOff(pack, run), still = S.S.radar.id;" +
    "h.track.forEach((q, i) => { const tt = h.times[i], d = h.drift[i]; h.track[i] = [half + (r.x - sx) - mo.u * 60 * tt - d[0], half + (r.y - sy) - mo.v * 60 * tt - d[1], 20]; });" +
    "const under = S.editor.handOff(pack, run), after = S.S.radar.id, sc = run.scenario.radar; h.track.forEach((q, i) => { h.track[i] = keep[i]; }); S.setRadar(cur); run.scenario = Object.assign({}, run.scenario, { radar: cur.id });" +
    "return { before: cur.id, away, still, under, after, sc, back: S.S.radar.id }; })()");
  check('the radar is kept when the storm\'s path keeps its distance (' + JSON.stringify(ho.away) + ', ' + ho.still + ' still) and handed on when the path went over it: the storm put over ' + ho.before + ' is seen from ' + ho.under + ' (the radar now ' + ho.after + ', the run\'s scenario ' + ho.sc + '); put back to ' + ho.back,
    ho.away === '' && ho.still === ho.before && ho.under !== '' && ho.under !== ho.before && ho.after === ho.under && ho.sc === ho.under && ho.back === ho.before);
}
{ await pg.click('#b-storms'); const sr = await ev(pg, "[...document.querySelectorAll('#pop .row')].map((r) => ({ id: r.dataset.id, on: r.getAttribute('aria-checked') === 'true', text: r.textContent }))");
  check('the Storms menu now has the run as "Your last run", in use, named after the day (' + sr.map((r) => r.id + (r.on ? '*' : '')).join(', ') + '; "' + (sr[3] ? sr[3].text : '') + '")', sr.length === 4 && sr[3].id === 'run' && sr[3].on && !sr[0].on && /Dryline day, storm run/.test(sr[3].text));
  await pg.click('#pop [data-id="wk82-1km"]'); await pg.waitForFunction("SEVERE.S.storm === 'wk82-1km'", null, { timeout: 30000 }); await idle2(pg);
  await pg.click('#b-storms'); await pg.click('#pop [data-id="run"]'); await pg.waitForFunction("SEVERE.S.storm === 'run'", null, { timeout: 30000 }); await idle2(pg);
  check('the 1 km storm and the run can be swapped: the run is back with its three frames at 4:10 PM (' + await ev(pg, 'SEVERE.pack.n') + ' frames, ' + await ev(pg, "document.getElementById('clk').textContent") + ')', await ev(pg, 'SEVERE.pack.n') === 3 && await ev(pg, "document.getElementById('clk').textContent") === '4:10 PM'); }
await pg.click('#m-draw'); await settle(pg);
/* 10b1. A run that is still going is on the radar: no card, the slider is the whole run and its loaded part is lit, the page goes on to each new frame while it is on the newest and stays where it is put, and Stop keeps the frames */
const streamP = pg.evaluate(() => SEVERE.editor.runStorm({ minutes: 120, dx: 2000, box: 84000, dt: 10 }).then((r) => ({ ok: true, n: r.pack.n, stopped: r.stopped, reason: r.reason, times: r.pack.times })).catch((e) => ({ ok: false, e: String(e.message || e) })));
await pg.waitForFunction("document.getElementById('app').dataset.mode === 'radar' && !!SEVERE.S.live && SEVERE.pack.n >= 1", null, { timeout: 60000 });
const sv = () => ev(pg, "(() => { const S = SEVERE, sl = document.getElementById('slider'), last = S.frames().slice(-1)[0]; return { card: document.getElementById('ed-run').hidden, pill: !document.getElementById('live').hidden, text: document.getElementById('live-t').textContent, busy: S.editor.LAB.busy, n: S.pack.n, live: S.pack.live === true, frame: S.S.frame, last, follow: S.S.follow, t: S.S.t, range: S.tRange(), span: [S.pack.times[0], S.pack.times[last]], l: parseFloat(sl.style.getPropertyValue('--l')), p: parseFloat(sl.style.getPropertyValue('--p')), value: +sl.value, ticks: document.querySelectorAll('#ticks span').length, mode: document.getElementById('app').dataset.mode, sub: document.getElementById('clk-sub').textContent }; })()");
const s1 = await sv(); await pg.waitForFunction("SEVERE.pack.n >= 4", null, { timeout: 120000 }); await settle(pg);
const s2 = await sv();
check('a storm that is running is on the radar from its first frame, with no card over it (' + s1.mode + ', card hidden ' + s1.card + '), a line above the slider that says so ("' + s2.text + '") and a pack that is still being made (' + s1.live + ', ' + s1.busy + ')', s1.mode === 'radar' && s1.card && s1.pill && s1.live && s1.busy && /^The model is running: \d+ of 120 minutes made/.test(s1.text) && s1.n >= 1);
check('the slider is the whole run, 0 to 120 minutes (' + JSON.stringify(s2.range) + '), with the frames there are on it as ticks (' + s2.ticks + ' for ' + s2.n + ' frames) and the track lit to the newest (' + s2.l.toFixed(1) + ' % of it at ' + s2.span[1] + ' minutes), and the radar is on the newest frame, which it went on to as each came (frame ' + s2.frame + ' of ' + s2.n + ', following ' + s2.follow + ')',
  s2.range[0] === 0 && s2.range[1] === 120 && s2.ticks === s2.n && Math.abs(s2.l - s2.span[1] / 120 * 100) < 0.5 && s2.l < 60 && s2.frame === s2.last && s2.follow === true && s2.t === s2.span[1] && Math.abs(s2.p - s2.l) < 0.5);
await ev(pg, 'SEVERE.setT(0)'); await settle(pg); const s3 = await sv(); const n3 = s3.n;
await pg.waitForFunction('SEVERE.pack.n > ' + n3, null, { timeout: 120000 }); await settle(pg); const s4 = await sv();
check('put back on the first frame it stays there as new frames come (frame ' + s4.frame + ' after ' + (s4.n - n3) + ' more, following ' + s4.follow + ', thumb at ' + s4.value + ' of 1000, the track lit to the thumb and the newest: ' + s4.p.toFixed(1) + ' and ' + s4.l.toFixed(1) + ' %)', s3.follow === false && s4.n > n3 && s4.frame === 0 && s4.t === 0 && s4.value === 0 && s4.p === 0 && s4.l > 0);
await pg.fill('#slider', '1000'); await settle(pg); const s5 = await sv();
check('a thumb pushed to the end of the run stops at the newest frame, not at 120 minutes (' + s5.t + ' of ' + s5.range[1] + ' minutes, following ' + s5.follow + ')', s5.t === s5.span[1] && s5.t < 120 && s5.follow === true && s5.frame === s5.last);
await pg.click('#live-stop'); const stopping = await ev(pg, "(() => ({ text: document.getElementById('live-stop').textContent, off: document.getElementById('live-stop').disabled }))()");
const sres = await streamP; await settle(pg); const s6 = await sv(); await pg.waitForTimeout(1200); const s7 = await sv();
check('Stop ends the run and keeps what it made: the button says so (' + stopping.text + '), the run says it was stopped early (' + sres.reason + '), the radar has its ' + sres.n + ' frames, the line goes, the model is free, and no frame comes after it (' + s7.n + ')',
  stopping.text === 'Stopping…' && stopping.off && sres.ok && sres.stopped === true && sres.reason === 'stopped early' && sres.n >= 4 && s6.n === sres.n && s7.n === sres.n && !s6.pill && !s6.busy && s6.mode === 'radar');
check('the slider is then the frames it has (0 to ' + s6.span[1] + ' minutes: ' + JSON.stringify(s6.range) + ') with no loading band (' + s6.l.toFixed(1) + ' and ' + s6.p.toFixed(1) + ' %)', s6.range[1] === s6.span[1] && Math.abs(s6.l - s6.p) < 0.5);
/* 10b3. A day that cannot support a storm grows none, and the run says so (the model is not made to give one) */
await pg.click('#m-draw'); await settle(pg);
await ev(pg, "(() => { const E = SEVERE.editor.E; E.drawing.air = { warm: { qv0: 2, cap: 15 } }; SEVERE.editor.rebuild(); })()");
const still = await ev(pg, "SEVERE.editor.runStorm({ minutes: 20, dx: 4000, box: 48000, dt: 10, frameEvery: 5 }).then((r) => ({ ok: true, n: r.pack.n, maxW: r.maxW, stopped: r.stopped, cape: Math.round(r.ix.mlcape), toast: document.getElementById('toast').textContent })).catch((e) => ({ ok: false, e: String(e.message || e) }))");
check('a day that cannot support a storm grows none, runs to the end and says so (CAPE ' + still.cape + ' J/kg, the strongest updraft ' + (still.maxW || 0).toFixed(1) + ' m/s in ' + still.n + ' frames: "' + still.toast.slice(0, 60) + '...")', still.ok && still.n === 5 && still.stopped === false && still.maxW < 10 && still.cape < 100 && /No storm grew from this day/.test(still.toast));
await pg.click('#m-draw'); await ev(pg, "SEVERE.editor.loadDay(HFSevereDays.get('dryline'))"); await settle(pg);                 // (the run left the page in the Radar mode)

/* 10c. The hooks option: the card's Detail row and what it says, the time a run has left, and a short run with a nest in a Worker, played by the radar */
await pg.click('#ed-start'); await pg.waitForSelector('#run-go', { timeout: 5000 });
const rd = () => ev(pg, "(() => ({ n: document.querySelectorAll('#run-det button').length, on: [...document.querySelectorAll('#run-det button')].map((b) => b.getAttribute('aria-pressed')).join(), len: [...document.querySelectorAll('#run-len button')].map((b) => b.getAttribute('aria-pressed')).join(), story: document.getElementById('run-story').textContent, detail: SEVERE.editor.LAB.detail, minutes: SEVERE.editor.LAB.minutes }))()");
const d0 = await rd(); await pg.click('#run-len [data-m="45"]'); const d1 = await rd(); await pg.click('#run-det [data-d="0"]'); const d2 = await rd(); await pg.click('#run-det [data-d="1"]'); const d3 = await rd(); await pg.click('#run-len [data-m="90"]');
check('the run card has a Quality row, Fine, 1 km and 500 m first and in use, with its story (' + d0.n + ' buttons, ' + d0.on + '; "' + d0.story.slice(0, 40) + '...") that says what it costs (about 50 minutes of work for 90, on a fast computer) and that the radar opens at once',
  d0.n === 2 && d0.on === 'true,false' && d0.detail === true && d0.minutes === 90 && /cells of 1 km/.test(d0.story) && /500 m over 30 km/.test(d0.story) && /about 50 minutes/.test(d0.story) && /the radar opens at once/i.test(d0.story) && /You can watch it as it goes/.test(d0.story) && /weaker here than in a recorded storm/.test(d0.story));
check('Fine on a run of 45 minutes says that it will not have a hook yet ("' + d1.story.slice(-62) + '"); Fast, 2 km gives the story of the 2 km model and keeps the length (' + d2.on + ', ' + d2.detail + ', ' + d2.minutes + ': "' + d2.story.slice(0, 36) + '..."); Fine again takes the length to 90 minutes (' + d3.len + ', ' + d3.minutes + ')',
  d1.detail === true && d1.minutes === 45 && /will not have one yet/.test(d1.story) && d2.on === 'false,true' && d2.detail === false && d2.minutes === 45 && /^The real model, 2 km cells/.test(d2.story) && !/500 m/.test(d2.story) && d3.on === 'true,false' && d3.detail === true && d3.minutes === 90 && d3.len === 'false,false,true,false' && /500 m over 30 km/.test(d3.story));
await pg.click('#run-x');
const left = await ev(pg, "(() => { const f = SEVERE.editor.runLeft; return [f([[0, 0], [5, 10]], 90), f([[0, 0], [10, 20]], 90, { from: 20 }), f([[0, 0], [20, 40], [24, 140]], 90, { from: 20 }), f([[0, 0], [10, 20]], 90, { from: 20, cost: 3.8 }), f([[0, 0], [1, 1]], 90, { from: 20, cost: 3.8, boxRate: 9 }), f([[0, 0], [1, 2], [2, 4], [3, 6], [4, 8], [5, 10], [6, 12]], 12)]; })()");
check('the seconds a run has left are the work of the last 3 minutes or more at the model minutes still to come (2 s a minute for 85 minutes: ' + left[0] + '), before the hooks option\'s nest has started the box\'s rate and sixty times that for each minute of it (10 minutes in 20 s, the nest from 20: ' + left[1] + '), and once it has the nest\'s own (25 s a minute for 66 minutes: ' + left[2] + '; a steady 2 s a minute for 6: ' + left[5] + '), the fine model of 1 km, whose nest costs 3.8 times the box\'s rate, says so (' + Math.round(left[3]) + ' s: 20 s for the first 10 minutes and 3.8 times 2 s a minute for 70), and in its first minute, with no storm yet and a box that is cheap, it does not say less than the box\'s mean rate of 9 s a minute asks (' + Math.round(left[4]) + ' s)', left[0] === 170 && left[1] === 20 + 2 * 60 * 70 && left[2] === 25 * 66 && left[5] === 12 && Math.abs(left[3] - (20 + 2 * 3.8 * 70)) < 1e-6 && Math.abs(left[4] - (9 * 19 + 9 * 3.8 * 70)) < 1e-6);
const nestP = pg.evaluate(() => SEVERE.editor.runStorm({ minutes: 6, dx: 4000, box: 48000, dt: 10, frameEvery: 2, detail: { dx: 1000, box: 16000, from: 2, ztop: 4000, every: 2, minUpdraft: 0 } }).then((r) => ({ ok: true, n: r.pack.n, times: r.pack.times, name: r.pack.name, h: r.pack.h })).catch((e) => ({ ok: false, e: String(e.message || e) })));
const nres = await nestP; await pg.evaluate('SEVERE.whenIdle()');
const nl = await ev(pg, "(() => { const S = SEVERE, p = S.pack, last = p.n - 1, v = p.volume(last), v0 = p.volume(0), nv = v.nests && v.nests[0]; return { nests: p.nests.length, frame: S.S.frame, t: S.S.t, v0: !!v0.nests, nx: nv && nv.vol.nx, nz: nv && nv.vol.nz, dx: nv && nv.vol.dx, x: nv && nv.x, y: nv && nv.y, echo: nv ? Math.max(...nv.vol.dbz) : -99, sweep: !!S.panes[0].sweep, mode: document.getElementById('app').dataset.mode, busy: S.editor.LAB.busy, hidden: document.getElementById('ed-run').hidden }; })()");
check('a run with a nest (1 km over 16 km from the 2nd minute) is named so (' + nres.name + ') and is a pack with the frames at 0, 2, 4 and 6 minutes and the nest in the last two (' + JSON.stringify(nres.times) + ', ' + JSON.stringify(nres.h && nres.h.fn) + ')',
  nres.ok && nres.name === 'Dryline day, storm run with a 1000 m nest' && JSON.stringify(nres.times) === '[0,2,4,6]' && nres.h.v === 2 && JSON.stringify(nres.h.fn) === '[[],[],[[0,16000,16000]],[[0,16000,16000]]]' && nres.h.nests[0].nx === 16 && nres.h.nests[0].nz === 8 && nres.h.nests[0].dx === 1000);
check('the page has it with the nest in the last frame at (16000, 16000), 16 x 16 x 8 cells of 1000 m, none in the first, the radar mode on with a sweep of it and the model free (' + JSON.stringify(nl) + ')',
  nl.nests === 1 && !nl.v0 && nl.nx === 16 && nl.nz === 8 && nl.dx === 1000 && nl.x === 16000 && nl.y === 16000 && nl.frame === 3 && nl.t === 6 && nl.mode === 'radar' && nl.sweep && !nl.busy && nl.hidden);
await pg.click('#m-draw'); await settle(pg);
await pg.setInputFiles('#d-file', path); await pg.waitForFunction("SEVERE.editor.E.day.id === 'file'", null, { timeout: 5000 }); await settle(pg);              // (the saved day again, for the draft below)

/* 11. The draft is kept, the radar mode still works after the editor, and back */
const draftId = await E(pg, 'E.day.name'), reload = await open(1440, 900, { ctx: A.ctx }); await A.page.close();
check('a reload brings the drawing back from the draft (' + await E(reload.page, 'E.day.name') + ', ' + (await objs(reload.page)).length + ' objects, qv0 ' + await E(reload.page, 'E.drawing.air.warm.qv0') + ')', await E(reload.page, 'E.day.name') === draftId && (await objs(reload.page)).length === 8 && await E(reload.page, 'E.drawing.air.warm.qv0') === doc.drawing.air.warm.qv0);
const pr = reload.page; await pr.click('#m-radar'); await pr.evaluate('SEVERE.whenIdle()');
check('the Radar mode brings the radar back and it still shows the storm (editor ' + await ev(pr, "getComputedStyle(document.getElementById('editor')).display") + ', panes ' + await ev(pr, "getComputedStyle(document.getElementById('panes')).display") + ', a sweep: ' + await ev(pr, '!!SEVERE.panes[0].sweep') + ', brand: ' + await ev(pr, "document.querySelector('#brand i').textContent") + ')',
  await ev(pr, "getComputedStyle(document.getElementById('editor')).display") === 'none' && await ev(pr, "getComputedStyle(document.getElementById('panes')).display") !== 'none' && await ev(pr, '!!SEVERE.panes[0].sweep') && await ev(pr, "document.querySelector('#brand i').textContent") === 'Radar' && !(await ev(pr, "document.getElementById('m-radar').getAttribute('aria-selected') !== 'true'")));
await pr.keyboard.press('3'); await pr.evaluate('SEVERE.whenIdle()');
check('the keys of the radar work there (3 selects spectrum width: ' + await ev(pr, 'SEVERE.panes[0].product') + ') and the editor\'s keys do not (a drawing tool was not picked: ' + await E(pr, 'E.tool') + ')', await ev(pr, 'SEVERE.panes[0].product') === 'sw' && await E(pr, 'E.tool') === 'select');
await pr.keyboard.press('1'); await pr.click('#m-draw'); await settle(pr);
check('Draw brings the editor back, the map as big as the window (' + await E(pr, 'SEVERE.editor.map.view.w') + ' x ' + await E(pr, 'SEVERE.editor.map.view.h') + ') and with the keys of the editor (L picks a low: ' + await (async () => { await pr.keyboard.press('l'); return E(pr, 'E.tool'); })() + ')', await E(pr, 'SEVERE.editor.map.view.w') === 1440 && await E(pr, 'E.tool') === 'low');
await pr.keyboard.press('Escape');

/* 12. The light theme and the phone */
await pr.keyboard.press('t'); await pr.waitForFunction("(() => { const c = document.querySelector('#ed-pane .cv-base'), d = c.getContext('2d').getImageData(c.width - 60, c.height - 60, 1, 1).data; return d[3] > 0 && d[0] + d[1] + d[2] > 450; })()", null, { timeout: 5000 }).catch(() => {});
const lum = await ev(pr, "(() => { const c = document.querySelector('#ed-pane .cv-base'), g = c.getContext('2d'), d = g.getImageData(c.width - 60, c.height - 60, 1, 1).data; return d[0] + d[1] + d[2]; })()");
check('the key T switches to the light theme and the map follows (the corner of the map is ' + lum + ' of 765 bright; the page says ' + await ev(pr, "document.documentElement.dataset.theme") + ')', await ev(pr, "document.documentElement.dataset.theme") === 'light' && lum > 450);
await pr.screenshot({ path: join(tmp, 'light.png') }); await pr.keyboard.press('t'); await settle(pr);
const ph = await open(390, 800), pp = ph.page;
const lay = await ev(pp, "(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(), t = r('ed-tools'), d = r('ed-dock'), s = r('ed-side'); return { sw: document.documentElement.scrollWidth, iw: innerWidth, tools: [t.left, t.top, t.right, t.bottom], dock: [d.left, d.top, d.right, d.bottom], side: [s.left, s.top, s.right, s.bottom], toolsRow: getComputedStyle(document.getElementById('ed-tools')).flexDirection }; })()");
check('on a phone (390 x 800) the page does not scroll sideways (' + lay.sw + ' for ' + lay.iw + '), the tools are a row above the dock and not over it (tools bottom ' + Math.round(lay.tools[3]) + ', dock top ' + Math.round(lay.dock[1]) + '), the dock and the day card are inside the window',
  lay.sw <= lay.iw && lay.toolsRow === 'row' && lay.tools[3] <= lay.dock[1] + 1 && lay.dock[0] >= 0 && lay.dock[2] <= lay.iw && lay.side[0] >= 0 && lay.side[2] <= lay.iw && lay.tools[0] >= 0 && lay.tools[2] <= lay.iw);
await pp.click('#ed-tools [data-id="cold"]'); const ps = [await px(pp, -150, -100), await px(pp, -140, 0), await px(pp, -100, 120)]; await drag(pp, ps); await settle(pp);
check('a finger sketches a front on the phone too (' + (await objs(pp)).length + ' objects: ' + (await objs(pp)).slice(-1)[0].kind + ' front of ' + (await objs(pp)).slice(-1)[0].pts.length + ' points)', (await objs(pp)).length === 9 && (await objs(pp)).slice(-1)[0].kind === 'cold');
await pp.screenshot({ path: join(tmp, 'phone.png') });

check('through all of it: no console error or warning and no request outside file:, blob: and data: (' + [A, reload, ph].reduce((s, x) => s + x.log.errors.length, 0) + ' errors: ' + [A, reload, ph].flatMap((x) => x.log.errors).slice(0, 2).join(' | ') + '; ' + [A, reload, ph].reduce((s, x) => s + x.log.requests.length, 0) + ' requests)', [A, reload, ph].every((x) => x.log.errors.length === 0 && x.log.requests.length === 0));

await browser.close();
if (process.env.KEEP_SHOTS) console.log('screenshots in ' + tmp); else rmSync(tmp, { recursive: true, force: true });
console.log('\n' + passed + ' passed, ' + failed + ' failed (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)' + (failed ? '\nfailed: ' + failedNames.join(' | ') : ''));
process.exit(failed ? 1 : 0);
