#!/usr/bin/env node
// Mutation check of the storm work (milestones 3-6): deliberately breaks the engine, the page or the menu one edit at a time and runs the part
// of the suite that should notice. A mutant that no check fails on is a gap in the tests (or an equivalent mutant: the edit changes nothing the
// program does, which docs/roadmap.md names). Needs a clean tree and Chromium for the browser drivers:
//   PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium node tools/storm_mutants.mjs [--dry] [--base] [--only X1,S4] [--drivers node,save] [--jobs 3]
// --dry   only checks that every edit anchor occurs exactly once and that the mutated file still parses; --base runs every driver on the unmodified tree (all must pass first);
// --only  a comma list of mutant ids; --drivers  restricts the drivers to run (node, storms, summary, place, save, gate, env); --jobs  how many mutants run at once (default 3; each builds into its own directory under $MUT_DIR or the
//         temp directory). It changes src/storms.js, src/template.html or index.html for the few seconds a build takes and puts them back itself;
//         if it is killed in between, `git checkout -- src index.html` restores them. The drivers are the check functions cut out of tests/run.mjs
//         by their opening comments (`// The storm layer on the Atlantic page`, `// Save / resume`, `async function checkEnsoHold`): keep them.
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { Script } from 'node:vm';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(process.env.MUT_DIR || join(tmpdir(), 'hf-mutants'), 'run');
const args = process.argv.slice(2), dry = args.includes('--dry'), base = args.includes('--base');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const jobs = args.includes('--jobs') ? +args[args.indexOf('--jobs') + 1] : 3;
const drivers = args.includes('--drivers') ? args[args.indexOf('--drivers') + 1].split(',') : null;

const GATE_BASIN = ['westpacific', 'nio', 'aus', 'swio', 'spac', 'satl', 'med', 'eastpacific'].find((b) => { const d = JSON.parse(readFileSync(join(REPO, 'data/generated', `${b}-data.json`), 'utf8')); return !(d.storms && d.storms.maps); }) || 'eastpacific';      // the page the 'gate' driver loads: one without storm climatology yet
const M = (id, file, edits, drivers, what) => ({ id, file, edits, drivers, what });
const E = (find, repl) => ({ find, repl }), R = (re, repl) => ({ re, repl });
const T = 'src/template.html', S = 'src/storms.js', I = 'index.html', W = 'src/template-wpac.html', H = 'src/storm-hooks.js';
const mutants = [
  // ---- M5: the season record and the summary card
  M('E1', S, [E('clamp(this.seasonDay(h), 0, 365)', '0')], ['node'], 'ACE of every fix credited to day 0'),
  M('E2', S, [E("this.systems = this.systems.filter((S) => S.alive);                          // the finished season's dead paths disappear", 'this.systems = this.systems;')], ['node', 'summary'], 'a finished season keeps its dead paths'),
  M('E3', S, [E('from: q.from || 0', 'from: 0')], ['node', 'summary'], 'a season forgets the day its count started'),
  M('E4', S, [E("S.th !== 'wv')) this._finalizePrev();", "S.th !== 'wv')) void 0;")], ['node'], 'the old season is never closed'),
  M('E5', S, [E('const byDep = (a, b) => a.depNum - b.depNum', 'const byDep = (a, b) => b.depNum - a.depNum')], ['node', 'summary'], 'cyclones listed newest first'),
  M('E6', S, [E('ace: S.ace, end: S.end', 'ace: Math.round(S.ace * 100) / 100, end: S.end')], ['node', 'summary'], 'a storm summary rounds its ACE twice'),
  M('U1', T, [E("['DEP', rec.dep, n && n.dep], ['NAMED', rec.named, n && n.named]", "['DEP', rec.named, n && n.dep], ['NAMED', rec.dep, n && n.named]")], ['summary'], 'DEP and NAMED totals swapped on the card'),
  M('U1b', T, [E("[BAR[0], rec.hurr, n && n.hurr], [BAR[1], rec.major, n && n.major]", "[BAR[0], rec.major, n && n.hurr], [BAR[1], rec.hurr, n && n.major]")], ['summary'], 'HURR and MAJOR totals swapped on the card'),
  M('U1c', T, [E("[BAR[1], rec.major, n && n.major], [BAR[2], rec.cat5, n && n.cat5]", "[BAR[1], rec.cat5, n && n.major], [BAR[2], rec.major, n && n.cat5]")], ['summary'], 'MAJOR and CAT 5 totals swapped on the card'),
  M('U2', T, [E("band('p10', 'p90', 'rgba(127,166,255,.13)'); band('p25', 'p75', 'rgba(127,166,255,.22)');", '')], ['summary'], 'the real bands are not drawn'),
  M('U3', T, [E('  openSummary(e.year);\n}', '}')], ['summary'], 'the card does not open at the turn of the year'),
  M('U4', T, [E('j = i + dir;', 'j = i - dir;')], ['summary'], 'the season arrows go the wrong way'),
  M('U5', T, [E("else if (!$('storm-card').hidden || !$('aoi-card').hidden || plainSel) closeStormCard(); else if (sumOpen) closeSummary(); }", "else if (sumOpen) closeSummary(); else if (!$('storm-card').hidden || !$('aoi-card').hidden || plainSel) closeStormCard(); }")], ['summary'], 'Escape closes the summary before the stat card'),
  M('U6', T, [E('#sum-card{left:50%;bottom:92px;', '#sum-card{left:50%;bottom:20px;')], ['summary'], 'the card sits over the dock'),
  M('U7', T, [E("g.beginPath(); g.arc(ex, ey, 3.6, 0, 7); g.fillStyle = '#f2f2f2'; g.fill();", "g.beginPath(); g.arc(ex, ey, 3.6, 0, 7); g.fillStyle = 'rgba(0,0,0,0)'; g.fill();")], ['summary'], 'no white dot at the end of the season line'),
  // ---- M4: Place mode and the shadow environment
  M('P1', S, [E('const k = this.n.M + 1, v0 =', 'const k = this.n.M + 2, v0 =')], ['node', 'place'], 'the preview draws the noise of the wrong system'),
  M('P2', T, [E('} finally { simRestore(snap); steerUpdate(); dirty = wasDirty; }', '} finally { steerUpdate(); dirty = wasDirty; }')], ['place'], 'the look-ahead does not put the live weather back'),
  M('P3', T, [E('else { if (placeWasPlaying) setPlaying(true); placeAtLL = null; placePrev = null; }', 'else { placeAtLL = null; placePrev = null; }')], ['place'], 'leaving Place mode does not restart the clock'),
  M('P5', T, [E('  placeSet(false);\n  updateSeasonBar(); stormsDirty = true; drawStorms(); markDirty();', '  updateSeasonBar(); stormsDirty = true; drawStorms(); markDirty();')], ['place'], 'a click does not leave Place mode'),
  M('P6', T, [E('placePrev = stormMgr.forecast({ kind: placeKind, lat: placeAtLL.lat, lon: placeAtLL.lng }', 'placePrev = stormMgr.forecast({ kind: placeKind, lat: placeAtLL.lat, lon: placeAtLL.lng + 0.5 }')], ['place'], 'the preview is half a degree east of the pointer'),
  M('P8', T, [E('      if (simHour % 24 === 0) stepDay();\n      jetClockH += k * P.jetSpeed; left -= k;', '      jetClockH += k * P.jetSpeed; left -= k;')], ['place'], 'the look-ahead skips the daily weather step'),
  M('P4', S, [E("(isTC || S.origin === 'placed:td' || S.origin === 'placed:sd') && S.depNum === 0", 'isTC && S.depNum === 0')], ['node'], 'a placed cyclone that is post-tropical at its first fix is not numbered'),
  // ---- M3: the calibrated engine and the selection / layer behaviour of the page
  M('X1', T, [E('const only = stormSel ? stormSel.id : null, aoiKey = olSel ? olSel.key : null,', 'const only = null, aoiKey = olSel ? olSel.key : null,')], ['storms'], 'selecting a storm does not hide the other paths'),
  M('X2', T, [E('<input type="checkbox" id="stlows" checked>', '<input type="checkbox" id="stlows">')], ['storms'], 'lows are off by default'),
  M('X3', T, [E("if (!t.alive || t.fixes.length < 3 || HFStorms.lowWeight(stormMgr.par, t.lat) < 0.05 || isLand(t.lat, t.lon) || xIds.has(t.id)) continue;", "if (!t.alive || t.fixes.length < 3 || xIds.has(t.id)) continue;")], ['storms'], 'lows are drawn over land and everywhere'),
  M('X4', T, [E("showWaves = $('stwaves').checked && !solo,", "showWaves = false,")], ['storms'], 'waves are never drawn'),
  M('X5', S, [E('etHaz: {b0: -6.1},', 'etHaz: {b0: -30},')], ['node', 'storms'], 'no extratropical transition'),
  M('X6', S, [E('ri: {haz: 0.038,', 'ri: {haz: 0,')], ['node', 'storms'], 'no rapid intensification'),
  M('X7', S, [E('  vpLat: 0.5,', '  vpLat: 0,')], ['node', 'storms'], 'no cap on the wind a storm can reach poleward'),
  M('X8', S, [E('  tdMargin: 0.12,', '  tdMargin: 0,')], ['node', 'storms'], 'depressions are declared that could not live'),
  M('X9', S, [E('driftGain: { wv: 0.75, tc: 0.75, sc: 0.75, ex: 0.75, nl: 0.6 }', 'driftGain: { wv: 0, tc: 0, sc: 0, ex: 0, nl: 0 }')], ['node', 'storms'], 'storms ignore the anomaly of the page steering'),
  M('X10', S, [E('du: [3.3, 3.8, 3.2, 2.3, 2.0, 0.7, -0.9, -2.5, -8.1], dv: [7.2, 5.0, 3.6, 2.7, 0.9, -1.6, -4.1, -5.7, -5.2]', 'du: [0, 0, 0, 0, 0, 0, 0, 0, 0], dv: [0, 0, 0, 0, 0, 0, 0, 0, 0]')], ['node', 'storms'], 'post-tropical systems have no age profile of speed'),
  // ---- M6: save / resume
  M('S1', T, [E('|| simHour < 24) return false;', ') return false;')], ['save'], 'a season is saved before it is a day old'),
  M('S2', T, [E("['humidSynCd', humidSynCd], ", '')], ['save'], 'the humidity generator of the previous day is not saved'),
  M('S2b', T, [E("['shearSynCd', shearSynCd], ", '')], ['save'], 'the shear generator of the previous day is not saved'),
  M('S2c', T, [E("['ensoHist', ensoHist], ", '')], ['save'], 'the ENSO history is not saved'),
  M('S3', T, [E('HFStorms.restore(JSON.parse(s.storms), { maps: stormMapsNow() });\n  stormLab = null;', 'HFStorms.restore(JSON.parse(s.storms));\n  stormLab = null;')], ['save'], 'a resumed season loses the climatology maps'),
  M('S4', T, [E('function restart() { deleteSave(); saveOwner = true;', 'function restart() { saveOwner = true;')], ['save'], 'Restart keeps the old save'),
  M('S5', I, [R('if \\(save\\) deleteSave\\(\\);\\s+// a new game replaces the saved season', '/* kept */')], ['save'], 'Start on the menu keeps the saved season'),
  M('S6', T, [E('s.sv !== HFStorms.VERSION || ', '')], ['save'], 'a save of another engine version is accepted'),
  M('S6b', T, [E('s.n !== N || s.sn !== SN || ', '')], ['save'], 'a save made on another grid is accepted'),
  M('S6c', T, [E('s.v !== SAVE_V || ', '')], ['save'], 'a save of an old format is accepted'),
  M('S7', T, [R('applySeed\\(1 \\+ Math\\.floor\\(Math\\.random\\(\\) \\* 999999\\)\\);\\s+// a clean start[^\\n]*', '/* kept */')], ['save'], 'an unusable save is left in place'),
  M('S8', T, [E("saveOwner = false; document.body.dataset.resume = 'beside';", "saveOwner = true; document.body.dataset.resume = 'beside';")], ['save'], 'a page beside a saved season overwrites it'),
  M('S9', T, [E("document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveStamp !== savedStamp) saveNow(); });", ''), E("window.addEventListener('pagehide', () => { if (saveStamp !== savedStamp) saveNow(); });", '')], ['save'], 'nothing is saved as the page goes away'),
  M('S11', T, [E('SAVE_EVERY_MS = [8000, 1200];', 'SAVE_EVERY_MS = [8000000, 8000000];')], ['save'], 'the autosave never fires'),
  M('S17', T, [E('try { return !!localStorage.getItem(SAVE_META); } catch (e) { return false; }', 'return !!localStorage.getItem(SAVE_META);')], ['save'], 'a page whose storage refuses access cannot start'),
  M('S13', I, [E('if (!discardTimer) {', 'if (false) {')], ['save'], 'Discard needs one click'),
  M('S14', I, [E("location.href = b.href + '?resume=1'; };", 'location.href = b.href; };')], ['save'], 'Continue opens a new game'),
  M('S15', T, [E('Object.assign(P, u.P); sliders.forEach', 'sliders.forEach')], ['save'], 'the sliders are not restored'),
  M('S16', T, [E('else if (RESUME) setPlaying(false);', 'else if (RESUME) setPlaying(true);')], ['save'], 'a resumed season starts running'),
  // ---- M8: the precursors as one lifecycle, three-hourly fixes, the storm engine's own environment grid, the frame loop, rapid intensification that follows the conditions
  M('Y1', T, [E("const stage = S.kind === 'N' ? 'low' : 'wave';", "const stage = S.dist ? 'wave' : S.kind === 'N' ? 'low' : 'wave';")], ['storms'], 'a flagged low is drawn as a wave'),
  M('Y2', T, [E("const stage = S.kind === 'N' ? 'low' : 'wave';", "const stage = 'wave';")], ['storms'], 'a low is drawn as a wave'),
  M('Y3', T, [E('<input type="checkbox" id="stdist" checked>', '<input type="checkbox" id="stdist">')], ['storms'], 'disturbances are off by default'),
  M('Y4', T, [E("showDist = $('stdist').checked && !only", 'showDist = !only')], ['storms', 'summary'], 'the Disturbances box does nothing'),
  M('Y5', S, [E('if (S.dev >= 0 || S.v >= par.distOn) S.dist = true;', 'if (false) S.dist = true;')], ['node'], 'no system ever becomes a disturbance'),
  M('Y6', S, [E('else if (S.v < par.distOff) S.dist = false;', 'else S.dist = false;')], ['node'], 'a disturbance falls back to a wave the moment its wind dips (no hysteresis)'),
  M('Y7', S, [E("case 'wv': return S.dist ? 'DB' : S.kind === 'N' ? 'LO' : 'WV';", "case 'wv': return S.kind === 'N' ? 'LO' : 'WV';")], ['node'], 'the status of a disturbance is never DB'),
  M('Y8', S, [E('if (isTC && rv >= 34 && h % 6 === 0) { add = aceOf(rv);', 'if (isTC && rv >= 34) { add = aceOf(rv);')], ['node'], 'ACE counted at every three-hourly fix (twice what it should be)'),
  M('Y9', S, [E('if (this.hour % 3 === 0) this._record(this.hour, env);', 'if (this.hour % 6 === 0) this._record(this.hour, env);')], ['node', 'place'], 'fixes only every six hours again'),
  M('Y10', T, [E('r: syn ? 8 : 6, S, f', 'r: 8, S, f')], ['place'], 'the small dots can not be hovered'),
  M('Y11', T, [E('const syn = white || f.h % 6 === 0;', 'const syn = true;')], ['place'], 'every dot is a big one'),
  M('Y12', T, [E("p = j * NXS + i, q = p + NXS;\n  return (arr[p] * (1 - ax) + arr[p + 1] * ax) * (1 - ay) + (arr[q] * (1 - ax) + arr[q + 1] * ax) * ay;", "p = j * NXS + i, q = p + NXS;\n  return (arr[p] * (1 - ax) + arr[p + 1] * ax) * ay + (arr[q] * (1 - ax) + arr[q + 1] * ax) * (1 - ay);")], ['storms'], 'the storm grid is interpolated with the wrong weights'),
  M('Y13', T, [E('+ hes * sHEnsoF[ks] + hws * syn + hmo;', '+ hes * sHEnsoF[ks] + hmo;')], ['storms'], 'the storm grid leaves out the humidity texture'),
  M('Y14', T, [E("sSEnsoF[ks] + sws * SHEAR_TEXTURE_GAIN * syn + ssh;", "sSEnsoF[ks] + sws * SHEAR_TEXTURE_GAIN * syn;")], ['storms'], 'the storm grid forgets the shear slider'),
  M('Y15', T, [E("  anomDirty = true; sAnomDirty = true;\n}\nfunction simDate(h)", "  anomDirty = true;\n}\nfunction simDate(h)")], ['storms'], "the storm grid keeps the previous day's large-scale anomalies"),
  M('Y16', T, [E('if (performance.now() - t0 >= SIM_BUDGET_MS) break;', '')], ['storms'], 'the clock takes as long as it needs in a frame (no time budget)'),
  M('Y17', T, [E('acc = Math.min(acc - done * STEP_MS, MAX_BACKLOG_H * STEP_MS);', 'acc -= done * STEP_MS;')], ['storms'], 'what a slow machine owes the clock is not capped'),
  M('Y18', S, [E('xLo: 0.8, xHi: 3.8,', 'xLo: 0, xHi: 0,')], ['node'], 'a perfect environment is no faster than a great one'),
  M('Y19', S, [E('/ (1 + Math.pow(shT / R.shear, 3))', '')], ['node'], 'rapid intensification ignores the shear'),
  M('Y20', S, [E('const cond = smooth01(sstE, R.sst[0], R.sst[1])', 'const cond = 1')], ['node'], 'rapid intensification ignores the sea temperature'),
  M('Y21', S, [E('* landF * smooth01(1 - V / Math.max(vcap, 1), 0.02, 0.10);', '* landF;')], ['node'], 'an episode goes on at full push past the potential wind'),
  M('Y22', S, [E('smooth01(1 - V / Math.max(vcap, 1), R.room[0], R.room[1]) * gL * landF;', 'gL * landF;')], ['node'], 'an episode starts as easily next to the potential wind'),
  // ---- no walls: lakes are water, a perfect environment lifts the latitude fall, every limit a ramp, a hazard or a soft cap
  M('Z1', S, [E('(1 - par.vpLat * (1 - par.vpRelief * perf) * smooth01(', '(1 - par.vpLat * smooth01(')], ['node'], 'the fall of the potential wind with latitude stays in a perfect environment'),
  M('Z2', S, [E('E.lat * alat * (1 - (E.relief || 0) * (perf || 0))', 'E.lat * alat')], ['node'], 'a perfect environment does not hold off the post-tropical transition'),
  M('Z3', S, [E('ramp = smooth01(alat, E.latMin - 8, E.latMin);', 'ramp = alat < E.latMin ? 0 : 1;')], ['node'], 'the post-tropical hazard is a wall at 20N'),
  M('Z4', S, [E('return Math.max(rel, smooth01(sstA, G.sstGate[0] - sShift + par.sstAbsUp, G.sstGate[1] - sShift + par.sstAbsUp));', 'return rel;')], ['node'], 'a warmed world shuts the water that is warm in absolute terms'),
  M('Z5', S, [E('function decayLimit(par, x, V) { return satur(x, par.decayCap[0] + par.decayCap[1] * (V / 60) * (V / 60)); }', 'function decayLimit(par, x, V) { return Math.min(x, par.decayCap[0] + par.decayCap[1] * (V / 60) * (V / 60)); }')], ['node'], 'the fastest loss of wind is a clamp'),
  M('Z6', S, [E('rnd(seed, id, h, ST.ENDH) < wend / par.endH', 'wend >= 0.5')], ['node'], 'a disturbance over cold water dies at a line'),
  M('Z7', S, [E('return smooth01(lat, L[0], L[1]) * (1 - smooth01(lat, L[2], L[3]));', 'return lat >= L[1] && lat <= L[2] ? 1 : 0;')], ['node'], 'a tracked low counts only inside a window of latitude'),
  M('Z8', S, [E('return Math.max(sh ? mapAt(M, arr, tw, lat - sh[0], lon - sh[1]) : mapAt(M, arr, tw, lat, lon), par.hazFloor || 0);', 'return sh ? mapAt(M, arr, tw, lat - sh[0], lon - sh[1]) : mapAt(M, arr, tw, lat, lon);')], ['node'], 'a map that is zero is a wall to development'),
  M('Z9', S, [E('if (!(par.seedFloor > 0 && env && env.box &&', 'if (!(false && env && env.box &&')], ['node'], 'no disturbance is ever born outside the maps'),
  M('Z10', S, [E('if (env.isLand && env.isLand(lat, lon)) return null;\n  return { lat, lon, v0:', 'if (false) return null;\n  return { lat, lon, v0:')], ['node'], 'floor seeds are born on land'),
  // ---- M10: the storm layer on all nine pages
  M('Z17', T, [E('const STORMS_READY = !!(DATA.storms && DATA.storms.maps);', 'const STORMS_READY = true;')], ['gate'], 'a page with no storm climatology runs the storm engine and shows its controls'),
  M('Z18', S, [E("atlantic:    { label: 'Atlantic', menu: 'atlantic', scale: 'nhc', inv: { w: 'L', e: 'L', at: 0 }, seasonMonth: 0, waves: true,", "atlantic:    { label: 'Atlantic', menu: 'atlantic', scale: 'nhc', inv: { w: 'L', e: 'L', at: 0 }, seasonMonth: 0, waves: false,")], ['node'], 'the Atlantic has no easterly waves'),
  M('Z19', S, [E('if (basinOf(this.basin).waves && this.sched.waveT == null)', 'if (this.sched.waveT == null)'), E('while (basinOf(this.basin).waves && h >= this.sched.waveT)', 'while (h >= this.sched.waveT)')], ['node'], 'every basin has the Atlantic\'s easterly waves'),
  M('Z20', S, [E('ctx.act = activityFactor(par, this.seed, seasonYearOf(this.startMs + h * HOUR_MS, this.seasonMonth), h); ensoOf(par, env, ctx); }', 'ctx.act = activityFactor(par, this.seed, this.dateAt(h).getUTCFullYear(), h); ensoOf(par, env, ctx); }'), E('this.ctx.act = activityFactor(this.par, this.seed, seasonYearOf(this.startMs + h * HOUR_MS, this.seasonMonth), h); ensoOf(this.par, env, this.ctx); }', 'this.ctx.act = activityFactor(this.par, this.seed, this.dateAt(h).getUTCFullYear(), h); ensoOf(this.par, env, this.ctx); }')], ['node'], 'the activity of a southern season changes on Jan 1'),
  M('Z21', S, [E('ty = par.steerScale * ((1 - a) * vm + a * vd) + hs * (par.driftV[0]', 'ty = par.steerScale * ((1 - a) * vm + a * vd) + (par.driftV[0]')], ['node'], 'a southern cyclone drifts toward the equator'),
  M('Z22', S, [E("aus:         { label: 'Australian Region', menu: 'aus', scale: 'bom', inv: { w: 'S', e: 'P', at: 135 }, seasonMonth: 6,", "aus:         { label: 'Australian Region', menu: 'aus', scale: 'bom', inv: { w: 'S', e: 'P', at: 135 }, seasonMonth: 0,")], ['node'], 'a southern season turns over on Jan 1'),
  M('Z23', S, [E("const k = cursors.seq = (cursors.seq == null ? N.start : cursors.seq + 1); return N.list[k % N.list.length];", "const k = cursors.seq = N.start; return N.list[k % N.list.length];")], ['node'], 'a sequential name list starts again with every storm'),
  M('Z25', S, [E('return useCalibrated && B && B.params ? mergeParams(base, B.params) : base;', 'return base;')], ['node'], 'a basin\'s fitted physics is not applied'),
  M('Z24', S, [E("if (N.west && lon != null && lon > -180 && lon < N.west.lon)", "if (false)")], ['node'], 'the East Pacific never takes a Central Pacific name'),
  // ---- the seasonal gains of the humidity and the shear (data `seas`), in the drawn field (the West Pacific's template) and in the storms' grid (the shared hooks); par.enso in the engine
  M('Z26', W, [E('hes = P.enso * seasGain(humidSeas && humidSeas.enso, p)', 'hes = P.enso')], ['env'], 'the drawn humidity ignores the month\'s gain on its El Nino response'),
  M('Z27', W, [E('hvs = P.variability * seasGain(humidSeas && humidSeas.eof, p)', 'hvs = P.variability')], ['env'], 'the drawn humidity ignores the month\'s gain on its year-to-year modes'),
  M('Z28', W, [E('ses = P.enso * seasGain(shearSeas && shearSeas.enso, p)', 'ses = P.enso')], ['env'], 'the drawn shear ignores the month\'s gain on its El Nino response'),
  M('Z29', W, [E('svs = P.variability * seasGain(shearSeas && shearSeas.eof, p)', 'svs = P.variability')], ['env'], 'the drawn shear ignores the month\'s gain on its year-to-year modes'),
  M('Z30', H, [E('hes = P.enso * seasGain(humidSeas && humidSeas.enso, p)', 'hes = P.enso')], ['env'], 'the storms\' humidity ignores the month\'s gain on its El Nino response'),
  M('Z31', H, [E('hvs = P.variability * seasGain(humidSeas && humidSeas.eof, p)', 'hvs = P.variability')], ['env'], 'the storms\' humidity ignores the month\'s gain on its year-to-year modes'),
  M('Z32', H, [E('ses = P.enso * seasGain(shearSeas && shearSeas.enso, p)', 'ses = P.enso')], ['env'], 'the storms\' shear ignores the month\'s gain on its El Nino response'),
  M('Z33', H, [E('svs = P.variability * seasGain(shearSeas && shearSeas.eof, p)', 'svs = P.variability')], ['env'], 'the storms\' shear ignores the month\'s gain on its year-to-year modes'),
  M('Z34', W, [E('return g[((m % 12) + 12) % 12] * (1 - t) + g[(((m + 1) % 12) + 12) % 12] * t; }', 'return g[((m % 12) + 12) % 12]; }')], ['env'], 'the month\'s gain is not interpolated to the day'),
  M('Z35', S, [E('if (E.act) ctx.act = (ctx.act || 1) * Math.exp(E.act * z);', 'if (E.act) ctx.act = ctx.act || 1;')], ['node'], 'El Nino does not change the development rates'),
  M('Z36', S, [E('mapAt(M, arr, tw, lat - sh[0], lon - sh[1])', 'mapAt(M, arr, tw, lat + sh[0], lon + sh[1])')], ['node'], 'El Nino moves the development region the wrong way'),
  M('Z37', S, [E('if (shift) { lat += shift[0]; lon += shift[1];', 'if (false) { lat += shift[0]; lon += shift[1];')], ['node'], 'the seeds stay where the maps put them when El Nino moves the region'),
  M('Z38', S, [E('hazAt(par, M, M.haz.T, tw, t.lat, t.lon, ctx.shift) * eT * this.autoRate', 'hazAt(par, M, M.haz.T, tw, t.lat, t.lon) * eT * this.autoRate')], ['node'], 'a tracked low develops at the unshifted place'),
  M('Z39', H, [E('isLand: stormLand, sstRef: () => kfSstRef, enso: () => n34,', 'isLand: stormLand, sstRef: () => kfSstRef, enso: () => 0,')], ['place'], 'the live storm environment gives the engine no El Nino index'),
  M('Z40', H, [E('isLand: stormLand, sstRef: () => REF, enso: () => n34,', 'isLand: stormLand, sstRef: () => REF, enso: () => 0,')], ['place'], 'the Place preview\'s environment gives the engine no El Nino index'),
  M('Z41', S, [E('const sstOK = S.sub && M ? par.subSstOK : 24,', 'const sstOK = S.sub && M ? 19 : 24,')], ['node'], 'a subtropical depression needs the Atlantic\'s 19 degC whatever the basin says'),
  M('Z42', S, [E('cold = S.sub && M ? par.subCold : par.seedCold,', 'cold = S.sub && M ? 17 : par.seedCold,')], ['node'], 'a developing subtropical system is carried off below the Atlantic\'s 17 degC whatever the basin says'),
  M('Z43', S, [E('cold = S.sub && M ? par.subCold : par.seedCold,', 'cold = S.sub && M ? par.subCold : 22,')], ['node'], 'an undeveloped disturbance is carried off below the Atlantic\'s 22 degC whatever the basin says'),
  M('Z44', T, [E('const STORMS_READY = !!(DATA.storms && DATA.storms.maps);', 'const STORMS_READY = false;')], ['gate'], 'a page that has its storm climatology comes up without the storm engine'),
  M('Z45', T, [E("if (!STORMS_READY) document.body.classList.add('no-storms');", "if (false) document.body.classList.add('no-storms');")], ['gate'], 'a page with no storm climatology shows the storm controls'),
  M('Z46', H, [E('if (!STORMS_READY && !force) return false;', 'if (false) return false;')], ['gate'], 'a visitor can switch the storm engine on in a page with no storm climatology'),
  // ---- M11: the equator, the remnant low's triangle, each basin's own intensity scale
  M('Z47', S, [E('S.lat = keepSide(lat, (my * KT_KMH) / KM_DEG, par.eqSoft);', 'S.lat = lat + (my * KT_KMH) / KM_DEG;')], ['node'], 'a system can cross the equator'),
  M('Z48', H, [E("th === 'ex' || th === 'nl' ? 'triangle' : 'circle'", "th === 'ex' ? 'triangle' : 'circle'")], ['storms'], 'a remnant low is a dot, not a triangle'),
  M('Z49', S, [E("[130, 'STY', 'Super Typhoon']", "[137, 'STY', 'Super Typhoon']")], ['node'], 'a super typhoon needs the Saffir-Simpson category 5 wind'),
  M('Z50', S, [E("menu: 'wpac', scale: 'jtwc', ", "menu: 'wpac', scale: 'nhc', ")], ['node'], 'the West Pacific is classified in Saffir-Simpson categories'),
  M('Z51', S, [E("bar: ['VSCS', 'ESCS', 'SUPER']", "bar: ['HURR', 'ESCS', 'SUPER']")], ['node'], 'the North Indian season bar counts hurricanes'),
  M('Z52', S, [E("[75, 'TC', 'Tropical Cyclone']", "[65, 'TC', 'Tropical Cyclone']")], ['node'], 'a Meteo-France tropical cyclone starts at the unconverted 10-minute cut-off\'s round number'),
  // ---- milestone 11, step 2: the outlook (the engine: shared by every basin) and invests
  M('Z53', S, [E('let p7 = round5(100 * r.P7 * cr), p2 = Math.min(round5(100 * r.P2 * cr), p7);', 'let p7 = Math.round(100 * r.P7 * cr), p2 = Math.min(Math.round(100 * r.P2 * cr), p7);')], ['node'], 'the chances are not rounded to fives'),
  M('Z54', S, [E('const outlookClass = (O, p7) => (p7 <= O.cls[0] ?', 'const outlookClass = (O, p7) => (p7 < O.cls[0] ?')], ['node'], '35 % is orange, not yellow'),
  M('Z55', S, [E("if (!c.unborn && P2 < (pr && pr.mode === 'in' ? O.favP2[0] : O.favP2[1])) {", "if (!c.unborn && P2 > (pr && pr.mode === 'in' ? O.favP2[0] : O.favP2[1])) {")], ['node'], 'the arrow goes on the disturbance that has a 2-day chance, and the X is inside the shape of the one that has none'),
  M('Z56', S, [E('if (hb - H0 <= ld) out.push(', 'if (true) out.push(')], ['node'], 'a disturbance is seen however far ahead of its birth'),
  M('Z57', S, [E('if (rnd(this.seed, key, hb, ST.LEAD) < L[2]) return -1;', 'if (false) return -1;')], ['node'], 'every disturbance comes with a warning (no surprises)'),
  M('Z58', S, [E('return lon < I.at ? I.w : I.e; };', 'return lon < I.at ? I.e : I.w; };')], ['node'], 'the two invest letters of a split basin swapped'),
  M('Z59', S, [E('if (this._ol && this._ol.key === key) return this._ol.res;', 'if (false && this._ol && this._ol.key === key) return this._ol.res;')], ['node'], 'the outlook is made again on every call (an issue is not held)'),
  M('Z60', S, [E('this._ol = null;', ';')], ['node'], 'a hand-placed disturbance waits for the next issue'),
  M('Z61', S, [E('p2 = Math.min(round5(100 * r.P2 * cr), p7);', 'p2 = Math.min(round5(100 * r.P7 * cr), p7);')], ['node'], 'the 2-day chance is the 7-day one'),
  M('Z62', S, [E('surv *= Math.exp(-tot * step);', 'surv *= 1;')], ['node'], 'nothing ends a disturbance in the outlook, however long it takes'),
  M('Z63', S, [E('this.yearEndH = this._hourOfYearStart(y + 2);\n  this.invN = {};', 'this.yearEndH = this._hourOfYearStart(y + 2);\n  ;')], ['node'], 'invests go on counting into the next season'),
  M('Z64', S, [E('const s = this._waveNext(t, k); t = s.t; spawn = s.spawn;', 'const s = this._waveNext(t, k - 1); t = s.t; spawn = s.spawn;')], ['node'], 'the waves the outlook sees coming are not the waves that are born'),
  M('Z65', S, [E('tq1 = timeAt(O.win[1] * P7);', 'tq1 = timeAt(O.win[0] * P7);')], ['node'], 'the window of formation has no length (the area is always short)'),
  M('Z66', S, [E('fold = (q) => [r2(eq > 0 ? hs * softFloor(hs * q[1], eq) : q[1]), r2(q[0] / kx)];', 'fold = (q) => [r2(q[1]), r2(q[0] / kx)];')], ['node'], 'an outline of an area crosses the equator'),
  M('Z67', S, [E('if (basinOf(this.basin).waves) {\n    let t = this.sched.waveT', 'if (false) {\n    let t = this.sched.waveT')], ['node'], 'the outlook does not see the waves that are about to be born'),
  M('Z68', S, [E('S.dev = h; S.invest = t.invest;', 'S.dev = h;')], ['node'], 'a low that becomes a depression loses its invest number'),
  M('Z69', S, [E('if (!t.invest) this._invest(t);', ';')], ['node'], 'a low that becomes a depression was never an invest'),
  M('Z70', S, [E('if (dl < O.arrowMin) { const dy = r.chain[0][0]', 'if (false) { const dy = r.chain[0][0]')], ['node'], 'an arrow of any length, however short (the head of a shape still on its way from the X is not put the least length away)'),
  M('Z71', S, [E('tf = Math.max(0, c.dev + (par.devV - Math.min(par.devV, S.v)) / par.devRate + O.tdHold - H0)', 'tf = Math.max(0, 40 * (c.dev + (par.devV - Math.min(par.devV, S.v)) / par.devRate + O.tdHold - H0))')], ['node'], 'a developing disturbance forms its depression in days, not hours'),
  // ---- the outlook on the page
  M('Z72', H, [E('    olGlyphX(g, p, col);\n', '')], ['storms'], 'the X of a disturbance is not drawn'),
  M('Z73', H, [E('g.fillStyle = olPattern(g, a.cls); g.fill();', 'g.fillStyle = OL_COL[a.cls]; g.fill();')], ['storms'], 'an area is a solid fill, not a hatch'),
  M('Z74', H, [E('if (m.a.arrow) { const to', 'if (false) { const to')], ['storms'], 'the arrow is not drawn'),
  M('Z75', H, [E('const OLall = showDist ? outlookNow() : null,', 'const OLall = outlookNow(),')], ['storms'], 'the Areas of interest box does nothing'),
  M('Z76', H, [E('if (olFormed(a)) continue;', ';')], ['storms'], 'a disturbance that has formed keeps its area'),
  M('Z77', H, [E("el.style.display = on ? 'block' : 'none';", "el.style.display = 'block';")], ['storms'], 'the legend is always shown'),
  M('Z78', H, [E("medium: '#ff9d2e', high: '#ff3b30' }, OL_NAME", "medium: '#ff3b30', high: '#ff3b30' }, OL_NAME")], ['storms'], 'orange is drawn red'),
  M('Z79', H, [E('- (h.aoi ? 1.5 : 0); if (d + (h.live ? 0.75 : 0) + (h.aoi ? 1.5 : 0) <= h.r', '; if (d + (h.live ? 0.75 : 0) <= h.r')], ['storms'], 'the wave under an X is picked instead of the X'),
  M('Z80', H, [E('if (xIds.has(S.id)) continue;', ';')], ['storms'], 'a wave or a low that has its X is drawn as the wave or the L as well (the X is on top of it)'),
  M('Z81', H, [E('g.globalAlpha = 0.13; g.fillStyle = col; g.fill(); g.globalAlpha = 1;', 'g.globalAlpha = 0; g.fillStyle = col; g.fill(); g.globalAlpha = 1;')], ['storms'], 'the faint wash under the hatch is missing'),
  M('Z82', H, [E('  if (names) {                                                                         // the chances on the shapes', '  if (false) {                                                                         // the chances on the shapes')], ['storms'], 'the chances are never written on the shapes'),
  // ---- round 2: the outlook calms down, outlines are one loop, no overlaps, titles, looking at one disturbance
  M('Z83', S, [E('p7 = lim(p7, pr.p7); p2 = lim(p2, pr.p2);', ';')], ['node'], 'a chance can go from 15 to 100 in one issue'),
  M('Z84', S, [E("else if (c.kind !== 'M' || H0 - c.born >= 6) { p7 = Math.min(p7, O.firstP7);", "else if (false) { p7 = Math.min(p7, O.firstP7);")], ['node'], 'a disturbance shows up at its full chance the first time it is seen'),
  M('Z85', S, [E("else if (c.kind !== 'M' || H0 - c.born >= 6) { p7 = Math.min(p7, O.firstP7);", "else { p7 = Math.min(p7, O.firstP7);")], ['node'], 'a hand-placed disturbance is held to the cap of a newcomer'),
  M('Z86', S, [E('let dla = morph * (q[0] - la), dlo = morph * (q[1] - lo);', 'let dla = q[0] - la, dlo = q[1] - lo;')], ['node'], 'a shape is replaced by the new forecast at every issue'),
  M('Z87', S, [E('if (dm > mx) { dla *= mx / dm; dlo *= mx / dm; }', ';')], ['node'], 'a shape can move any distance in one issue'),
  M('Z88', S, [E("const sh = pr.mode === 'in' && pr.x && r.x ? [r.x[0] - pr.x[0], r.x[1] - pr.x[1]] : [0, 0];", 'const sh = [0, 0];')], ['node'], 'a shape does not follow its disturbance'),
  M('Z89', S, [E("(pr && pr.mode === 'in' ? O.favP2[0] : O.favP2[1])", 'O.favP2[1]')], ['node'], 'the X goes in and out of its shape with every flicker of the 2-day chance around its limit'),
  M('Z90', S, [E('if (d > cap) return { ck: c.ck, P2, P7, light: true };', '')], ['node'], 'an arrow can point as far as the chance builds up'),
  M('Z91', S, [E('fresh = gap * 6 <= O.memH,', 'fresh = true,')], ['node'], 'an issue after days without one still moves on from the old one'),
  M('Z92', S, [E('    chain = capChain(chain, O.maxLen * 1.25);', ';')], ['node'], 'a shape drawn far from its disturbance is stretched from one to the other'),
  M('Z93', S, [E('    if (!placed.length) return chain;', '    return chain;')], ['node'], 'areas overlap'),
  M('Z94', S, [E('if (len > O.maxLen) { te = Math.max(ts + 6, t); break; }', ';')], ['node'], 'a swath is as long as the window of formation, however many degrees that is'),
  M('Z95', S, [E('if (Math.abs(Ar) / 2 > bestA) { bestA = Math.abs(Ar) / 2; best = loop; bestId = s0; }', 'if (true) { bestA = Math.abs(Ar) / 2; best = loop; bestId = s0; }')], ['node'], 'an outline is the last loop of the zero line, not the biggest'),
  M('Z96', S, [E('const n = chain.length, kx = Math.max(0.2, Math.cos(chain.reduce((a, q) => a + q[0], 0) / n * DEG));\n  let P = chain.map', 'const n = chain.length, kx = 1;\n  let P = chain.map')], ['node'], 'an outline is round on the grid of degrees, not on the map (a disc is as wide in degrees of longitude as of latitude)'),
  M('Z97', S, [E('invN: this.invN, olMem: this.olMem,', 'invN: this.invN,')], ['node'], 'a saved season forgets what the last issue of the outlook said'),
  M('Z98', S, [E("'wave', false).ck = 'uW' + k + ':' + h;", "'wave', false);")], ['node'], 'a wave that was seen before it was born is a new disturbance when it is'),
  M('Z99', S, [E('S.dev = h; S.invest = t.invest; S.ck = t.id;', 'S.dev = h; S.invest = t.invest;')], ['node'], 'a low that becomes a depression is a new disturbance for the outlook'),
  M('Z110', S, [E('if (L > mx) ch = cutAt(ch, Math.max(mx, 0.01));', ';')], ['node'], 'a shape that a neighbour held short is as long as it can be the moment the neighbour goes'),
  M('Z111', S, [E('mem.cur[c.ck] = { p2, p7, mode: r.mode, ar, x: r.x, chain: chain.map(', 'mem.cur[c.ck] = { p2, p7, mode: r.mode, x: r.x, chain: chain.map(')], ['node'], 'the number of issues in a row with an arrow is forgotten at every issue (a persistent arrow never loses the belief in its chance)'),
  M('Z112', S, [E("const sh = pr.mode === 'in' && pr.x && r.x ?", "const sh = r.mode === 'in' && pr.mode === 'in' && pr.x && r.x ?")], ['node'], 'a shape round its X is left behind when it turns into an arrow'),
  M('Z113', S, [E('poly: S.poly, pole: S.pole,', 'poly: S.poly, pole: null,')], ['node'], 'a label has no place inside its shape'),
  // ---- round 3: a disturbance with a 2-day chance of 0 is not in its shape; an arrow that stays loses the belief in its chance
  M('Z114', S, [E("&& r.P2 >= O.favP2[0] && r.P2 < O.favP2[1] && p2 < 5) p2 = Math.min(5, p7);", "&& false) p2 = Math.min(5, p7);")], ['node'], 'the X that the band of the 2-day limit keeps in its shape has a 2-day chance of 0'),
  M('Z115', S, [E('cr = 1 - (1 - O.cred[1]) * clamp((ar - O.cred[0]) / O.cred[2], 0, 1);', 'cr = 1;')], ['node'], 'an arrow that stays for days keeps the belief in its chance'),
  M('Z116', S, [E('while (d < O.arrowMin && t < H0 + R) { t += 3; d = away(pos(t)); }', ';')], ['node'], 'a slow disturbance has the shape start nearer than an arrow is long'),
  M('Z117', S, [E('let t = Math.max(timeAt(Math.min(O.onsetP, 0.5 * P7)), H0 + 3)', 'let t = Math.max(timeAt(0.5 * P7), H0 + 3)')], ['node'], 'the shape starts where half the chance has built up, not where it starts to'),
  M('Z118', S, [E("(pr && pr.mode === 'arrow' ? pr.ar || 0 : 0) + (fresh ? gap : 1)", '1')], ['node'], 'the number of issues in a row with an arrow does not count up'),
  M('Z119', S, [E("&& r.P2 >= O.favP2[0] && r.P2 < O.favP2[1] && p2 < 5)", "&& r.P2 >= O.favP2[0] && p2 < 5)")], ['node'], 'the 5 % of a disturbance kept in its shape is also given to one that is not'),
  M('Z120', H, [E("nothing is expected in 2 days, the chance starts to build up '", "it is expected to reach them '")], ['storms'], 'the tip of an arrow does not say that nothing is expected in 2 days'),
  // ---- milestone 12: ensembles and the track density
  M('Z121', S, [E('W.dla = sd * (C.dla + 0.5 * C.dla2 * sw + g * (Cc.dla + 0.5 * Cc.dla2 * sw)); W.dlo = sd * (C.dlo + 0.5 * C.dlo2 * sw + g * (Cc.dlo + 0.5 * Cc.dlo2 * sw));', 'W.dla = 0; W.dlo = 0;')], ['node'], 'the features that steer a member are where they are for every member (a steering edge does not open the fan)'),
  M('Z122', S, [E('const f = ensFactor(E, S0.vr), horizon', 'const f = 1, horizon')], ['node'], 'a hurricane is as hard to forecast as a wave (the fan is as wide)'),
  M('Z123', S, [E('C = ensCoef(this.seed, tid, k)', 'C = ensCoef(this.seed, tid + H0, k)')], ['node'], 'a new fan every six hours: the members are drawn again at every issue'),
  M('Z124', S, [E('f[c] = cnt[c] / N;', 'f[c] = 0.5 * cnt[c] / N;')], ['node'], 'the track density is never red: it is half the share of the members even where all agree'),
  M('Z125', S, [E('S.lat += E.pos * f * (C.pla + E.common * Cc.pla);', 'S.lat += 30 * C.pla;')], ['node'], 'the members start far from the system'),
  M('Z126', H, [E('const mk = !h && ensPack && stormsOn ? ensNear(cx, cy) : -1;', 'const mk = -1;')], ['storms'], 'hovering a member of the fan does nothing'),
  M('Z127', H, [E('else if (h && (h.wave || h.low)) selectPlain(h);', '')], ['storms'], 'a plain wave or L cannot be picked'),
  // ---- milestone 13: the cone of uncertainty and the layer buttons
  M('Z128', S, [E('chain: rows.map((q) => [q.lat, q.lon, coneRadius(K, q.lead)]) };', 'chain: rows.map((q) => [q.lat, q.lon, 0.3]) };')], ['node'], 'the cone is the same width at every lead (not the NHC error circles)'),
  M('Z129', S, [E('const gapOk = prev && prev.init < E.init && E.init - prev.init <= 24;', 'const gapOk = false;')], ['node'], 'a new cone does not move from the last one: it is the new forecast whole'),
  M('Z130', S, [E("m.pts[i][3] === 'ex' || m.pts[i][3] === 'nl').length > A.length / 2;", "m.pts[i][3] === 'ex' || m.pts[i][3] === 'nl').length < A.length / 2;")], ['node'], 'a point is grey when most members are not post-tropical'),
  M('Z131', S, [E("const coneLetter = (v) => (v < 34 ? 'D' : v < 64 ? 'S' : v < 96 ? 'H' : 'M');", "const coneLetter = (v) => (v < 34 ? 'D' : v < 74 ? 'S' : v < 96 ? 'H' : 'M');")], ['node'], 'the letter of a forecast point switches from S to H at 74 kt, not 64'),
  M('Z132', S, [E('vs = f * (E.vec[0] + E.vec[1] * u), g = E.common;', 'vs = f * (E.vec[0] + E.vec[1] * u), g = 0;')], ['node'], 'the members share no forecast error (the real track is almost always inside the cone and the fan)'),
  M('Z133', H, [E('const ch = h && h.cone ? h.cone.lead : -1;', 'const ch = -1;')], ['storms'], 'hovering a forecast point of the cone does not ring it'),
  M('Z134', T, [E("hl: ['highs', 'stlows'],", "hl: ['highs'],")], ['storms'], 'the Highs & lows button leaves the lows alone'),
  M('Z100', H, [E('[[9.6, \'rgba(8,10,16,.94)\'], [5.4, col]]', '[[9.6, \'rgba(8,10,16,.94)\'], [5.4, \'#ffffff\']]')], ['storms'], 'the X is white, not the colour of its chance'),
  M('Z101', H, [E('[[8.2, \'rgba(8,10,16,.94)\'], [4.4, col]]', '[[8.2, \'rgba(8,10,16,.94)\'], [4.4, \'#ffffff\']]')], ['storms'], 'the arrow is white, not the colour of its chance'),
  M('Z102', H, [E("const txt = olLabel(m.a), right = shapeLon <= m.lon;", "const txt = olLabel(m.a), right = true;")], ['storms'], 'the title of an X is always on its right, over its arrow'),
  M('Z103', H, [E('    if (names) {                                                                      // its title beside it', '    if (true) {                                                                      // its title beside it')], ['storms'], 'the titles of the X\'s ignore the Storm names box'),
  M('Z104', H, [E('(aoiKey || plainId ? false : only ? S.id === only :', '(only ? S.id === only :')], ['storms'], 'looking at one disturbance leaves the cyclones on the map'),
  M('Z105', H, [E('else if (stormsOn && !h && !stormSel && olAreaAt(cx, cy)) openAoiCard(olAreaAt(cx, cy));', '')], ['storms'], 'an area can only be picked by its X'),
  M('Z106', H, [E('  if (S) openStormCard(S, HFStorms.makeFix(S, stormMgr.hour, S.ace), true);', ';')], ['storms'], 'a disturbance that becomes a depression just closes the card'),
  M('Z107', H, [E('      olEager();\n', '')], ['storms'], 'the issues are made only when the map is drawn'),
  M('Z108', H, [E('stormSel = null; olSel = null; plainSel = null; ensPack = null; coneMem = null; ensHot = -1; stormHot = null; stormHits = []; olHeld = null; olEagerSlot = -1e9;', 'stormSel = null; olSel = null; plainSel = null; ensPack = null; coneMem = null; ensHot = -1; stormHot = null; stormHits = []; olHeld = null;')], ['storms'], 'the issue clock of a new season is the one of the old'),
  M('Z109', H, [E('if (!stormsOn || !stormMgr || typeof stormMgr.outlook !== \'function\' || !$(\'stdist\').checked) return;\n  const slot', 'if (!stormsOn || !stormMgr || typeof stormMgr.outlook !== \'function\') return;\n  const slot')], ['storms'], 'the issues are made with the Areas of interest box off'),
  M('Z11', T, [E('const k = j * NX + i; return land[k] === 1 && lakeGrid[k] === 0;', 'const k = j * NX + i; return land[k] === 1;')], ['storms'], 'a lake is land for a storm'),
  M('Z12', T, [E('sst: (la, lo) => { const id = lakeIdAt(la, lo); return id ? kfLake[id - 1] : sampleFieldS(kfSst, la, lo); },', 'sst: (la, lo) => sampleFieldS(kfSst, la, lo),')], ['storms'], 'a lake has the land\'s temperature for the storms'),
  M('Z13', S, [E('wGen = (1 - smooth01(lf, 0.4, 0.8)) * smooth01(Math.abs(lat2), 3, 6) * smooth01(sstE, sstOK - 1, sstOK);', 'wGen = 1;')], ['node'], 'a depression can form over land, on the equator and over cold water'),
  M('Z14', S, [E('if (w > 0 && rnd(seed, id, h, ST.ENDH + 200) < 0.5 * w)', 'if (false)')], ['node'], 'a circulation that has all but gone lives on'),
  M('Z15', S, [E('if (cut < had) { S.v *= cut / had; S.landCut = cut; }', 'if (cut < had) { S.landCut = cut; }')], ['node'], 'a cyclone feels no friction at its first contact with land'),
  M('Z16', S, [E('* (1 - smooth01(lf || 0, 0.2, 0.5));', ';')], ['node'], 'a cyclone over land dissipates as it would at sea'),
];

/* the page's storm code lives in several files now (the template and the shared src/storm-*.js / storm-ui.* that the build inlines into every basin's page): a mutant written against the
   template finds the file its anchor is in */
const PAGE_FILES = [T, 'src/storm-hooks.js', 'src/storm-late.js', 'src/storm-ui.html', 'src/storm-ui.css'];
for (const m of mutants) {
  if (m.file !== T || !m.edits.length) continue;
  const e0 = m.edits[0], count = (txt) => (e0.find !== undefined ? txt.split(e0.find).length - 1 : (txt.match(new RegExp(e0.re, 'g')) || []).length);
  const hit = PAGE_FILES.filter((f) => count(readFileSync(join(REPO, f), 'utf8')) === 1);
  if (hit.length === 1) m.file = hit[0];
}

function applyEdits(text, edits, id) {
  for (const e of edits) {
    if (e.find !== undefined) {
      const n = text.split(e.find).length - 1;
      if (n !== 1) throw new Error(`${id}: anchor occurs ${n} times: ${e.find.slice(0, 70)}`);
      text = text.replace(e.find, () => e.repl);
    } else {
      const re = new RegExp(e.re, 'g'), n = (text.match(re) || []).length;
      if (n !== 1) throw new Error(`${id}: regex matches ${n} times: ${e.re.slice(0, 70)}`);
      text = text.replace(re, () => e.repl);
    }
  }
  return text;
}

// a mutant whose source does not parse is "killed" by the crash alone, which says nothing about the checks: --dry parses every mutated file (a .js file as it is, a page's inline scripts one by one)
function parses(file, text) {
  if (file.endsWith('.js')) { new Script(text, { filename: file }); return; }
  for (const m of text.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) if (!/\bsrc=|type=["'](?!text\/javascript|module)/.test(m[1] || '') && m[2].trim()) new Script(m[2], { filename: file });
}

// the driver: the real check functions of tests/run.mjs, cut out of it by their markers
function makeDriver(which) {
  const L = readFileSync(join(REPO, 'tests/run.mjs'), 'utf8').split('\n');
  const idx = (pred) => L.findIndex(pred);
  const head = L.slice(0, idx((l) => l.startsWith('// City markers:'))).join('\n');
  const launch = L[idx((l) => l.startsWith('const launchOpts'))];
  const storm = L.slice(idx((l) => l.startsWith('// The storm layer on the Atlantic page')), idx((l) => l.startsWith('async function checkEnsoHold'))).join('\n');
  const save = L.slice(idx((l) => l.startsWith('// Save / resume')), idx((l) => l.startsWith('await checkSave();'))).join('\n');
  const body = which === 'save'
    ? 'await checkSave();\n'
    : which === 'gate'
    ? `const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.route('**://**/*', (route) => route.request().url().startsWith('file://') ? route.continue() : route.abort());
const GATE_DIST = join(ROOT, 'dist/${GATE_BASIN}-sst-simulator.html');
await page.goto(pathToFileURL(GATE_DIST).href, { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
await page.waitForTimeout(800);
await checkStormGate(page, '${GATE_BASIN}', GATE_DIST);
await checkStormGateOff(browser, '${GATE_BASIN}', GATE_DIST);
await browser.close();
`
    : which === 'env'
    ? `const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.route('**://**/*', (route) => route.request().url().startsWith('file://') ? route.continue() : route.abort());
await page.goto(pathToFileURL(WPAC_DIST).href, { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
await page.waitForTimeout(800);
await checkEnvSeasons(page, 'West Pacific', WPAC_DIST);
await browser.close();
`
    : `const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.route('**://**/*', (route) => route.request().url().startsWith('file://') ? route.continue() : route.abort());
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(pathToFileURL(ATLANTIC_DIST).href, { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
await page.waitForTimeout(800);
await page.evaluate(() => { window.SSTSIM.storms(false); });
${which === 'summary' ? "await checkSummary(page, 'Atlantic');" : which === 'place' ? "await checkPlace(page, 'Atlantic');" : "await checkStorms(page, 'Atlantic');"}
check('no page errors (' + errors.length + ')', errors.length === 0);
await browser.close();
`;
  return `${head}\n${launch}\n${storm}\n${which === 'save' ? save : ''}\n${body}console.log(failed ? failed + ' check(s) failed' : 'all checks ok');\nprocess.exit(failed ? 1 : 0);\n`;
}

function snapshot(id, mutatedIndexHtml) {
  const dir = join(OUT, id); rmSync(dir, { recursive: true, force: true });
  for (const d of ['dist', 'tests', 'src']) mkdirSync(join(dir, d), { recursive: true });
  for (const f of new Set(['atlantic', GATE_BASIN, 'westpacific'])) copyFileSync(join(REPO, `dist/${f}-sst-simulator.html`), join(dir, `dist/${f}-sst-simulator.html`));
  if (!existsSync(join(dir, 'data'))) symlinkSync(join(REPO, 'data'), join(dir, 'data'));
  writeFileSync(join(dir, 'index.html'), mutatedIndexHtml);
  copyFileSync(join(REPO, 'package.json'), join(dir, 'package.json'));
  for (const f of ['tests/storms.mjs', 'tests/storms_env.mjs']) copyFileSync(join(REPO, f), join(dir, f));
  if (!existsSync(join(dir, 'node_modules'))) symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'));
  return dir;
}

function runDriver(dir, name) {            // resolves {name, code, fails[], tail}
  return new Promise((resolve) => {
    let file, argv;
    if (name === 'node') { file = join(dir, 'tests/storms.mjs'); argv = [file]; copyFileSync(join(dir, 'storms.js.mut'), join(dir, 'src/storms.js')); }
    else { file = join(dir, `tests/_drv_${name}.mjs`); writeFileSync(file, makeDriver(name)); argv = [file]; if (name === 'gate' || name === 'env') copyFileSync(join(dir, 'storms.js.mut'), join(dir, 'src/storms.js')); }
    const p = spawn('node', argv, { cwd: dir, env: process.env });
    let out = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => { out += '\nTIMEOUT'; p.kill('SIGKILL'); }, 900000);
    p.on('close', (code) => {
      clearTimeout(timer); writeFileSync(join(dir, `out_${name}.log`), out);
      resolve({ name, code, fails: out.split('\n').filter((l) => l.startsWith('FAIL') || /^  not ok|^FAIL/.test(l)).map((l) => l.slice(0, 230)), tail: out.trim().split('\n').slice(-2).join(' | ').slice(0, 200) });
    });
  });
}

async function runMutant(m, results) {
  const dir = join(OUT, m.id), res = { id: m.id, what: m.what, runs: [], killed: false };
  for (const d of m.drivers) {
    const r = await runDriver(dir, d); res.runs.push(r);
    if (r.code !== 0 || r.fails.length) { res.killed = true; break; }
  }
  results.push(res);
  console.log(`${res.killed ? 'KILLED  ' : 'SURVIVED'} ${m.id.padEnd(4)} ${m.what}${res.killed ? '  <- ' + res.runs[res.runs.length - 1].name + ': ' + (res.runs[res.runs.length - 1].fails[0] || res.runs[res.runs.length - 1].tail).slice(0, 160) : ''}`);
}

// ---------------------------------------------------------------------------------------------------------------------------------
let list = base ? [M('base', S, [], ['node', 'storms', 'summary', 'place', 'save', 'gate', 'env'], 'unmutated')] : (only ? mutants.filter((m) => only.includes(m.id)) : mutants);
if (drivers) list = list.map((m) => ({ ...m, drivers: m.drivers.filter((d) => drivers.includes(d)) })).filter((m) => m.drivers.length);
if (dry) { let bad = 0; for (const m of mutants) { try { parses(m.file, applyEdits(readFileSync(join(REPO, m.file), 'utf8'), m.edits, m.id)); } catch (e) { bad++; console.log(m.id + ': ' + e.message); } } console.log(bad ? bad + ' of ' + mutants.length + ' mutants broken (an anchor that is not found exactly once, or a mutated file that does not parse)' : 'all ' + mutants.length + ' anchors found exactly once and every mutated file parses'); process.exit(bad ? 1 : 0); }
mkdirSync(OUT, { recursive: true });
const results = [], running = new Set();
for (const m of list) {
  const orig = readFileSync(join(REPO, m.file), 'utf8');
  try {
    writeFileSync(join(REPO, m.file), applyEdits(orig, m.edits, m.id));
    execFileSync('npm', ['run', 'build'], { cwd: REPO, stdio: 'ignore' });
    const idx = readFileSync(join(REPO, 'index.html'), 'utf8');
    const dir = snapshot(m.id, idx);
    copyFileSync(join(REPO, 'src/storms.js'), join(dir, 'storms.js.mut'));
  } finally { writeFileSync(join(REPO, m.file), orig); }
  const pr = runMutant(m, results).then(() => running.delete(pr)); running.add(pr);
  if (running.size >= jobs) await Promise.race(running);
}
await Promise.all(running);
execFileSync('npm', ['run', 'build'], { cwd: REPO, stdio: 'ignore' });            // leave dist as the clean tree builds it
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 1));
const surv = results.filter((r) => !r.killed);
console.log(`\n${results.length - surv.length} killed, ${surv.length} survived of ${results.length}` + (surv.length ? ': ' + surv.map((r) => r.id).join(', ') : ''));
