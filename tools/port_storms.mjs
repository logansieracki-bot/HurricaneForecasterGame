#!/usr/bin/env node
// Brings the storm system into a basin's page template.
//
//   node tools/port_storms.mjs <basin|all> [--check] [--base <commit>] [--out <dir>]
//
// The Atlantic page (src/template.html) is where the storm system was built; everything that can be shared is in src/storm-hooks.js, src/storm-late.js, src/storm-ui.html and
// src/storm-ui.css (the build inlines them at placeholders into every basin's page). What is left in the template itself is a few dozen small edits to the page's own code
// (the synoptic generators' draws and fine copies, the storm-grid up-sampling, the clock and frame loop, the sliders' calls, the placeholders). This tool reads those edits
// off the Atlantic template -- the difference between the commit before any storm code (8c88b84) and now, cut into change groups -- and makes the same edits to another basin's template,
// each anchored on the lines around it and refused unless the anchor is found exactly once. A handful of groups are not plain edits (the START constants, the end of initSim / stepDay,
// the split of computeField, the basin's own state); they have handlers below. Run on the Atlantic base with `atlantic` it must reproduce src/template.html exactly (--check does
// that for every basin it is asked about and reports what differs), which is how the handlers are kept honest.
//
// A template that already has the `/*__STORM_HOOKS__*/` placeholder is left alone. Writes src/template-<basin>.html (or <dir>/template-<basin>.html with --out).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2), which = args[0] && !args[0].startsWith('--') ? args[0] : 'all';
const flag = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const BASE = flag('base', '8c88b84'), CHECK = !!flag('check', false), OUT = flag('out', null);
// the file a basin's template lives in, the engine's id for it (src/storms.js BASINS) and the state its page's ocean features carry from day to day (src/template.html has the Gulf Stream and the Loop Current's eddies, the others one gap-wind index)
const BASINS = {
  atlantic: { file: 'template.html', feat: 'atlantic' },
  eastpacific: { file: 'template-eastpacific.html' }, westpacific: { file: 'template-wpac.html' }, nio: { file: 'template-nio.html' }, aus: { file: 'template-aus.html' },
  swio: { file: 'template-swio.html' }, spac: { file: 'template-spac.html' }, satl: { file: 'template-satl.html' }, med: { file: 'template-med.html' },
};
const git = (...a) => execFileSync('git', a, { cwd: ROOT, maxBuffer: 1 << 28 }).toString();

/* ---- the Atlantic's storm edits as change groups ------------------------------------------------------------------------------------------------------- */
function changeGroups() {
  const diff = git('diff', '-U6', BASE, '--', 'src/template.html'), hunks = diff.split(/^(?=@@ )/m).slice(1), groups = [];
  for (const h of hunks) {
    const seq = h.split('\n').slice(1); if (seq.length && seq[seq.length - 1] === '') seq.pop();
    const rows = seq.map((l) => [l[0], l.slice(1)]);
    for (let k = 0; k < rows.length;) {
      if (rows[k][0] === ' ') { k++; continue; }
      const s = k; while (k < rows.length && rows[k][0] !== ' ') k++;
      const rem = rows.slice(s, k).filter((r) => r[0] === '-').map((r) => r[1]), add = rows.slice(s, k).filter((r) => r[0] === '+').map((r) => r[1]);
      const before = rows.slice(Math.max(0, s - 6), s).filter((r) => r[0] === ' ').map((r) => r[1]);
      groups.push({ rem, add, before });
    }
  }
  return groups;
}

/* ---- the parts that are not plain edits ---------------------------------------------------------------------------------------------------------------------- */
const featText = (basin) => basin === 'atlantic' ? null : `const featState = {                                                   // the state the ocean features carry from day to day (here the gap-wind index), captured and put back with the rest of the weather
  get() { return { gapIdx }; },
  set(f) { gapIdx = f.gapIdx; },
};`;
function lineSpan(text, needle, from = 0) {                         // [start, end) of the one line containing `needle` (must be unique in `text`)
  const i = text.indexOf(needle, from); if (i < 0) throw new Error('not found: ' + needle.slice(0, 80));
  if (text.indexOf(needle, i + 1) >= 0) throw new Error('not unique: ' + needle.slice(0, 80));
  const a = text.lastIndexOf('\n', i) + 1, b = text.indexOf('\n', i) + 1; return [a, b];
}
function manual(g, text, basin, ctx) {                              // -> [start, end, replacement] or null when the group is a plain edit
  const first = (g.add[0] || g.rem[0] || '');
  if (first.startsWith('let START_YEAR')) {                          // a resumed season brings its own start
    const [a, b] = lineSpan(text, 'const START_YEAR = new Date().getUTCFullYear();'), [c, d] = lineSpan(text, 'const START_MS = Date.UTC(START_YEAR,');
    if (d !== text.indexOf('\n', c) + 1 || c !== b) throw new Error('START lines are not adjacent');
    const l1 = text.slice(a, b).replace('const START_YEAR', 'let START_YEAR').replace(/\n$/, '') + '             // a resumed season brings its own (see applySave)\n', l2 = text.slice(c, d).replace('const START_MS', 'let START_MS');
    return [a, d, l1 + l2];
  }
  if (first === '  anomDirty = true; sAnomDirty = true;' && g.add.length === 2) {          // the end of initSim: a new season of storms for the new year of weather
    const f = text.indexOf('function initSim(seed) {'); if (f < 0) throw new Error('no initSim');
    const e = text.indexOf('\n  anomDirty = true;\n}', f); if (e < 0) throw new Error('initSim does not end with anomDirty = true');
    return [e, e + '\n  anomDirty = true;\n}'.length, '\n  anomDirty = true; sAnomDirty = true;\n  stormsReset();                                             // a new season of storms for the new year of weather\n}'];
  }
  if (first === '  anomDirty = true; sAnomDirty = true;' && g.add.length === 1 && g.rem.length === 1 && !ctx.didStepDay) {      // the end of stepDay
    ctx.didStepDay = true;
    const f = text.indexOf('function stepDay() {'); if (f < 0) throw new Error('no stepDay');
    const e = text.indexOf('\n  anomDirty = true;\n}', f); if (e < 0) throw new Error('stepDay does not end with anomDirty = true');
    return [e, e + '\n  anomDirty = true;\n}'.length, '\n  anomDirty = true; sAnomDirty = true;\n}'];
  }
  if (first === 'let anomDirty = true, sAnomDirty = true;') { const [a, b] = lineSpan(text, 'let anomDirty = true;'); return [a, b, text.slice(a, b).replace('let anomDirty = true;', 'let anomDirty = true, sAnomDirty = true;')]; }
  if (first.startsWith('function advanceSynDraws(d)')) { const [a, b] = lineSpan(text, 'function ensureSynDay(d) {'); return [a, b, g.add[0] + '\n']; }
  if (first.startsWith('function computeFeatures(')) return ctx.split(text);            // handled together with the group that follows it
  if (first === '}' && g.add.length > 20) return ctx.splitSecond;                       // ... which is the second half of the same edit
  if (first.startsWith('const STORM_BASIN')) {                                           // the basin's identity and the state its ocean features carry, ahead of the hooks placeholder this group also adds
    let add = g.add.join('\n').replace("const STORM_BASIN = 'atlantic';", `const STORM_BASIN = '${basin}';`);
    if (basin !== 'atlantic') { const i = add.indexOf('const featState'), j = add.indexOf('\n};', i) + 3; add = add.slice(0, i) + featText(basin) + add.slice(j); }
    return { add: add.split('\n') };
  }
  if (first.startsWith('  owedHours()')) { const [a, b] = lineSpan(text, '  set(k, v) { P[k] = v; refresh(); }'); return [a, b, '  owedHours() { return acc / STEP_MS; },                               // how many simulated hours the clock owes the playback (the frame loop caps it, see MAX_BACKLOG_H)\n' + text.slice(a, b).replace('{ P[k] = v; refresh(); }', '{ P[k] = v; stormEnvChanged(); refresh(); }')]; }
  return null;
}
// computeField becomes computeFeatures (the ocean-current / upwelling / shelf features, which the storm grid needs for its own day) and the rest
function splitComputeField(text) {
  const a = text.indexOf('function computeField() {'), b = text.indexOf('  /* --- features:', a), c = text.indexOf('  /* --- combine --- */', b);
  if (a < 0 || b < 0 || c < 0) throw new Error('computeField has no features / combine markers');
  let head = text.slice(a, b).replace('function computeField() {\n', ''), feats = text.slice(b, c);
  if (!/const wf = /.test(head)) head = head.replace(/(  const w0 = w\[0\], w1 = w\[1\], w2 = w\[2\], w3 = w\[3\];\n)/, '$1  const wf = 0.5 + 0.5 * Math.cos(2 * Math.PI * (f - 45 / 365.25));        // 1 in mid-February, 0 in mid-August\n');
  const repl = 'function computeFeatures(doy, wf, w0, w1, w2, w3, A0, A1, A2, A3) {          // the map\'s ocean-current / upwelling / shelf features, for the monthly blend and the day that are passed in\n' + feats.replace(/\n+$/, '\n') + '}\nfunction computeField() {\n' + head.replace(/\n*$/, '\n\n') + '  computeFeatures(doy, wf, w0, w1, w2, w3, A0, A1, A2, A3);\n\n';
  return [a, c, repl];
}

/* ---- apply ------------------------------------------------------------------------------------------------------------------------------------------------------------ */
function port(basin, groups, baseText) {
  const text = baseText;
  if (text.includes('/*__STORM_HOOKS__*/')) return { skipped: true, text };
  const spans = [], ctx = { didStepDay: false, split: null, splitSecond: null };
  ctx.split = (t) => { const r = splitComputeField(t); ctx.splitSecond = [r[1], r[1], '']; return r; };      // the second group of the pair adds nothing further: the split is one span
  for (let g of groups) {
    let m = manual(g, text, basin, ctx);
    if (m && !Array.isArray(m)) { g = { ...g, ...m }; m = null; }                  // a group whose text changes with the basin is still a plain edit
    if (m) { if (m[0] !== m[1] || m[2]) spans.push(m); continue; }
    let find = null, repl = null;
    for (let nb = 1; nb <= Math.max(1, g.before.length); nb++) {
      const before = g.before.slice(-nb);
      const f = g.rem.length ? before.concat(g.rem).join('\n') + '\n' : before.join('\n') + '\n';
      if (text.split(f).length - 1 === 1 && f.trim()) { find = f; repl = (g.add.length || before.length ? before.concat(g.add).join('\n') + '\n' : ''); break; }
    }
    if (find === null) throw new Error(`${basin}: no unique anchor for the edit "${(g.add[0] || g.rem[0] || '').slice(0, 70)}"`);
    if (g.rem.length && !g.add.length && !g.before.length) repl = '';
    const i = text.indexOf(find); spans.push([i, i + find.length, repl]);
  }
  spans.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  for (let k = 1; k < spans.length; k++) if (spans[k][0] < spans[k - 1][1]) throw new Error(`${basin}: two edits overlap near "${text.slice(spans[k][0], spans[k][0] + 60)}"`);
  let out = text, shift = 0;
  for (const [a, b, r] of spans) { out = out.slice(0, a + shift) + r + out.slice(b + shift); shift += r.length - (b - a); }
  return { skipped: false, text: out };
}

const groups = changeGroups();
const list = which === 'all' ? Object.keys(BASINS).filter((b) => b !== 'atlantic') : [which];
if (CHECK && !list.includes('atlantic')) list.unshift('atlantic');
let bad = 0;
for (const b of list) {
  const info = BASINS[b]; if (!info) { console.error('unknown basin ' + b); process.exit(1); }
  const baseText = b === 'atlantic' ? git('show', `${BASE}:src/template.html`) : (CHECK ? git('show', `${BASE}:src/${info.file}`) : readFileSync(join(ROOT, 'src', info.file), 'utf8'));
  let r;
  try { r = port(b, groups, baseText); } catch (e) { console.error(`${b}: ${e.message}`); bad++; continue; }
  if (r.skipped) { console.log(`${b}: already ported`); continue; }
  if (b === 'atlantic') {
    const cur = readFileSync(join(ROOT, 'src/template.html'), 'utf8');
    if (r.text === cur) console.log('atlantic: the edits reproduce src/template.html exactly');
    else { bad++; const A = r.text.split('\n'), B = cur.split('\n'); let i = 0; while (i < A.length && A[i] === B[i]) i++; console.error(`atlantic: the edits differ from src/template.html at line ${i + 1}:\n  ported: ${(A[i] || '').slice(0, 140)}\n  actual: ${(B[i] || '').slice(0, 140)}`); }
    continue;
  }
  if (CHECK) { console.log(`${b}: ports cleanly (${r.text.split('\n').length} lines)`); continue; }
  const dest = OUT ? join(OUT, info.file) : join(ROOT, 'src', info.file);
  if (OUT) mkdirSync(OUT, { recursive: true });
  writeFileSync(dest, r.text); console.log(`${b}: wrote ${dest}`);
}
process.exit(bad ? 1 : 0);
