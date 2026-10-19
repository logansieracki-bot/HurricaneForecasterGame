#!/usr/bin/env node
// Mutation check of the storm work (milestones 3-6): deliberately breaks the engine, the page or the menu one edit at a time and runs the part
// of the suite that should notice. A mutant that no check fails on is a gap in the tests (or an equivalent mutant: the edit changes nothing the
// program does, which docs/roadmap.md names). Needs a clean tree and Chromium for the browser drivers:
//   PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium node tools/storm_mutants.mjs [--dry] [--base] [--only X1,S4] [--drivers node,save] [--jobs 3]
// --dry   only checks that every edit anchor occurs exactly once; --base runs every driver on the unmodified tree (all must pass first);
// --only  a comma list of mutant ids; --drivers  restricts the drivers to run (node, storms, summary, place, save, gate); --jobs  how many mutants run at once (default 3; each builds into its own directory under $MUT_DIR or the
//         temp directory). It changes src/storms.js, src/template.html or index.html for the few seconds a build takes and puts them back itself;
//         if it is killed in between, `git checkout -- src index.html` restores them. The drivers are the check functions cut out of tests/run.mjs
//         by their opening comments (`// The storm layer on the Atlantic page`, `// Save / resume`, `async function checkEnsoHold`): keep them.
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(process.env.MUT_DIR || join(tmpdir(), 'hf-mutants'), 'run');
const args = process.argv.slice(2), dry = args.includes('--dry'), base = args.includes('--base');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const jobs = args.includes('--jobs') ? +args[args.indexOf('--jobs') + 1] : 3;
const drivers = args.includes('--drivers') ? args[args.indexOf('--drivers') + 1].split(',') : null;

const GATE_BASIN = ['westpacific', 'nio', 'aus', 'swio', 'spac', 'satl', 'med', 'eastpacific'].find((b) => { const d = JSON.parse(readFileSync(join(REPO, 'data/generated', `${b}-data.json`), 'utf8')); return !(d.storms && d.storms.maps); }) || 'eastpacific';      // the page the 'gate' driver loads: one without storm climatology yet
const M = (id, file, edits, drivers, what) => ({ id, file, edits, drivers, what });
const E = (find, repl) => ({ find, repl }), R = (re, repl) => ({ re, repl });
const T = 'src/template.html', S = 'src/storms.js', I = 'index.html';
const mutants = [
  // ---- M5: the season record and the summary card
  M('E1', S, [E('clamp(this.seasonDay(h), 0, 365)', '0')], ['node'], 'ACE of every fix credited to day 0'),
  M('E2', S, [E("this.systems = this.systems.filter((S) => S.alive);                          // the finished season's dead paths disappear", 'this.systems = this.systems;')], ['node', 'summary'], 'a finished season keeps its dead paths'),
  M('E3', S, [E('from: q.from || 0', 'from: 0')], ['node', 'summary'], 'a season forgets the day its count started'),
  M('E4', S, [E("S.th !== 'wv')) this._finalizePrev();", "S.th !== 'wv')) void 0;")], ['node'], 'the old season is never closed'),
  M('E5', S, [E('const byDep = (a, b) => a.depNum - b.depNum', 'const byDep = (a, b) => b.depNum - a.depNum')], ['node', 'summary'], 'cyclones listed newest first'),
  M('E6', S, [E('ace: S.ace, end: S.end', 'ace: Math.round(S.ace * 100) / 100, end: S.end')], ['node', 'summary'], 'a storm summary rounds its ACE twice'),
  M('U1', T, [E("['DEP', rec.dep, n && n.dep], ['NAMED', rec.named, n && n.named]", "['DEP', rec.named, n && n.dep], ['NAMED', rec.dep, n && n.named]")], ['summary'], 'DEP and NAMED totals swapped on the card'),
  M('U1b', T, [E("[HURR_TAG, rec.hurr, n && n.hurr], ['MAJOR', rec.major, n && n.major]", "[HURR_TAG, rec.major, n && n.hurr], ['MAJOR', rec.hurr, n && n.major]")], ['summary'], 'HURR and MAJOR totals swapped on the card'),
  M('U1c', T, [E("['MAJOR', rec.major, n && n.major], ['CAT 5', rec.cat5, n && n.cat5]", "['MAJOR', rec.cat5, n && n.major], ['CAT 5', rec.major, n && n.cat5]")], ['summary'], 'MAJOR and CAT 5 totals swapped on the card'),
  M('U2', T, [E("band('p10', 'p90', 'rgba(127,166,255,.13)'); band('p25', 'p75', 'rgba(127,166,255,.22)');", '')], ['summary'], 'the real bands are not drawn'),
  M('U3', T, [E('  openSummary(e.year);\n}', '}')], ['summary'], 'the card does not open at the turn of the year'),
  M('U4', T, [E('j = i + dir;', 'j = i - dir;')], ['summary'], 'the season arrows go the wrong way'),
  M('U5', T, [E("else if (!$('storm-card').hidden) closeStormCard(); else if (sumOpen) closeSummary(); }", "else if (sumOpen) closeSummary(); else if (!$('storm-card').hidden) closeStormCard(); }")], ['summary'], 'Escape closes the summary before the stat card'),
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
  M('X1', T, [E('const only = stormSel ? stormSel.id : null;', 'const only = null;')], ['storms'], 'selecting a storm does not hide the other paths'),
  M('X2', T, [E('<input type="checkbox" id="stlows" checked>', '<input type="checkbox" id="stlows">')], ['storms'], 'lows are off by default'),
  M('X3', T, [E("if (!t.alive || t.fixes.length < 3 || HFStorms.lowWeight(stormMgr.par, t.lat) < 0.05 || isLand(t.lat, t.lon)) continue;", "if (!t.alive || t.fixes.length < 3) continue;")], ['storms'], 'lows are drawn over land and everywhere'),
  M('X4', T, [E("showWaves = $('stwaves').checked && !only,", "showWaves = false,")], ['storms'], 'waves are never drawn'),
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
  M('S7', T, [R('applySeed\\(1 \\+ Math\\.floor\\(Math\\.random\\(\\) \\* 999999\\)\\);\\s+// a clean start', '/* kept */')], ['save'], 'an unusable save is left in place'),
  M('S8', T, [E("saveOwner = false; document.body.dataset.resume = 'beside';", "saveOwner = true; document.body.dataset.resume = 'beside';")], ['save'], 'a page beside a saved season overwrites it'),
  M('S9', T, [E("document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveStamp !== savedStamp) saveNow(); });", ''), E("window.addEventListener('pagehide', () => { if (saveStamp !== savedStamp) saveNow(); });", '')], ['save'], 'nothing is saved as the page goes away'),
  M('S11', T, [E('SAVE_EVERY_MS = [8000, 1200];', 'SAVE_EVERY_MS = [8000000, 8000000];')], ['save'], 'the autosave never fires'),
  M('S17', T, [E('try { return !!localStorage.getItem(SAVE_META); } catch (e) { return false; }', 'return !!localStorage.getItem(SAVE_META);')], ['save'], 'a page whose storage refuses access cannot start'),
  M('S13', I, [E('if (!discardTimer) {', 'if (false) {')], ['save'], 'Discard needs one click'),
  M('S14', I, [E("location.href = b.href + '?resume=1'; };", 'location.href = b.href; };')], ['save'], 'Continue opens a new game'),
  M('S15', T, [E('Object.assign(P, u.P); sliders.forEach', 'sliders.forEach')], ['save'], 'the sliders are not restored'),
  M('S16', T, [E('else if (RESUME) setPlaying(false);', 'else if (RESUME) setPlaying(true);')], ['save'], 'a resumed season starts running'),
  // ---- M8: the precursors as one lifecycle, three-hourly fixes, the storm engine's own environment grid, the frame loop, rapid intensification that follows the conditions
  M('Y1', T, [E("const stage = S.dist ? 'dist' : S.kind === 'N' ? 'low' : 'wave';", "const stage = S.kind === 'N' ? 'low' : 'wave';")], ['storms'], 'a disturbance is drawn as a wave or a low'),
  M('Y2', T, [E("const stage = S.dist ? 'dist' : S.kind === 'N' ? 'low' : 'wave';", "const stage = S.dist ? 'dist' : 'wave';")], ['storms'], 'a low is drawn as a wave'),
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
  M('Z8', S, [E('return Math.max(mapAt(M, arr, tw, lat, lon), par.hazFloor || 0);', 'return mapAt(M, arr, tw, lat, lon);')], ['node'], 'a map that is zero is a wall to development'),
  M('Z9', S, [E('if (par.seedFloor > 0 && env && env.box &&', 'if (false && env && env.box &&')], ['node'], 'no disturbance is ever born outside the maps'),
  M('Z10', S, [E('if (!(env.isLand && env.isLand(lat, lon))) {\n        const S = this._seedSystem(\'F\'', 'if (true) {\n        const S = this._seedSystem(\'F\'')], ['node'], 'floor seeds are born on land'),
  // ---- M10: the storm layer on all nine pages
  M('Z17', T, [E('const STORMS_READY = !!(DATA.storms && DATA.storms.maps);', 'const STORMS_READY = true;')], ['gate'], 'a page with no storm climatology runs the storm engine and shows its controls'),
  M('Z18', S, [E("atlantic:    { label: 'Atlantic', menu: 'atlantic', seasonMonth: 0, waves: true,", "atlantic:    { label: 'Atlantic', menu: 'atlantic', seasonMonth: 0, waves: false,")], ['node'], 'the Atlantic has no easterly waves'),
  M('Z19', S, [E('if (basinOf(this.basin).waves && this.sched.waveT == null)', 'if (this.sched.waveT == null)'), E('while (basinOf(this.basin).waves && h >= this.sched.waveT)', 'while (h >= this.sched.waveT)')], ['node'], 'every basin has the Atlantic\'s easterly waves'),
  M('Z20', S, [E('ctx.act = activityFactor(par, this.seed, seasonYearOf(this.startMs + h * HOUR_MS, this.seasonMonth), h); }', 'ctx.act = activityFactor(par, this.seed, this.dateAt(h).getUTCFullYear(), h); }'), E('this.ctx.act = activityFactor(this.par, this.seed, seasonYearOf(this.startMs + h * HOUR_MS, this.seasonMonth), h); }', 'this.ctx.act = activityFactor(this.par, this.seed, this.dateAt(h).getUTCFullYear(), h); }')], ['node'], 'the activity of a southern season changes on Jan 1'),
  M('Z21', S, [E('ty = par.steerScale * ((1 - a) * vm + a * vd) + hs * (par.driftV[0]', 'ty = par.steerScale * ((1 - a) * vm + a * vd) + (par.driftV[0]')], ['node'], 'a southern cyclone drifts toward the equator'),
  M('Z22', S, [E("aus:         { label: 'Australian Region', menu: 'aus', seasonMonth: 6,", "aus:         { label: 'Australian Region', menu: 'aus', seasonMonth: 0,")], ['node'], 'a southern season turns over on Jan 1'),
  M('Z23', S, [E("const k = cursors.seq = (cursors.seq == null ? N.start : cursors.seq + 1); return N.list[k % N.list.length];", "const k = cursors.seq = N.start; return N.list[k % N.list.length];")], ['node'], 'a sequential name list starts again with every storm'),
  M('Z25', S, [E('return useCalibrated && B && B.params ? mergeParams(base, B.params) : base;', 'return base;')], ['node'], 'a basin\'s fitted physics is not applied'),
  M('Z24', S, [E("if (N.west && lon != null && lon > -180 && lon < N.west.lon)", "if (false)")], ['node'], 'the East Pacific never takes a Central Pacific name'),
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
  for (const f of new Set(['atlantic', GATE_BASIN])) copyFileSync(join(REPO, `dist/${f}-sst-simulator.html`), join(dir, `dist/${f}-sst-simulator.html`));
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
    else { file = join(dir, `tests/_drv_${name}.mjs`); writeFileSync(file, makeDriver(name)); argv = [file]; if (name === 'gate') copyFileSync(join(dir, 'storms.js.mut'), join(dir, 'src/storms.js')); }
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
let list = base ? [M('base', S, [], ['node', 'storms', 'summary', 'place', 'save'], 'unmutated')] : (only ? mutants.filter((m) => only.includes(m.id)) : mutants);
if (drivers) list = list.map((m) => ({ ...m, drivers: m.drivers.filter((d) => drivers.includes(d)) })).filter((m) => m.drivers.length);
if (dry) { let bad = 0; for (const m of mutants) { try { applyEdits(readFileSync(join(REPO, m.file), 'utf8'), m.edits, m.id); } catch (e) { bad++; console.log(e.message); } } console.log(bad ? bad + ' of ' + mutants.length + ' anchors broken' : 'all ' + mutants.length + ' anchors found exactly once'); process.exit(bad ? 1 : 0); }
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
