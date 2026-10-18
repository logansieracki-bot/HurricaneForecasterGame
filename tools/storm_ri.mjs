// Rapid intensification of the simulated storms against the real Atlantic (data/generated/atlantic-tc-ri.json, tools/make_tc_ri.py).
//   node tools/storm_ri.mjs raw.json [setName ...]        raw.json is a tools/storm_mc.mjs --out run; every set (or the ones named) is compared with the real table
// A window is a six-hourly tropical row over water (latitude < 40) whose own row 24 hours later is also a tropical row; its gain is the change of the wind in between.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const REAL = JSON.parse(readFileSync(join(ROOT, 'data/generated/atlantic-tc-ri.json'), 'utf8'));
const SB = REAL.meta.sst_bins, VB = REAL.meta.wind_bins, THS = REAL.meta.thresholds;
const bin = (x, b) => { for (let i = 0; i < b.length - 1; i++) if (x >= b[i] && x < b[i + 1]) return i; return -1; };

export function riStats(storms) {
  const nb = SB.length - 1, nv = VB.length - 1;
  const cnt = { n: 0, hit: THS.map(() => 0), bs: THS.map(() => new Array(nb).fill(0)), ns: new Array(nb).fill(0), bsv: THS.map(() => Array.from({ length: nb }, () => new Array(nv).fill(0))), nsv: Array.from({ length: nb }, () => new Array(nv).fill(0)), maxGain: [] };
  for (const s of storms) {
    const byH = new Map(s.rows.map((r) => [r[8], r])); let best = -999;
    for (const r of s.rows) {
      const g = byH.get(r[8] + 24); if (!g) continue;
      if (r[9] === 1 || !(r[5] === r[5]) || r[0] >= 40) continue;                 // over water, south of 40N
      const gain = g[2] - r[2], a = bin(r[5], SB), v = bin(r[2], VB); if (a < 0) continue;
      cnt.n++; cnt.ns[a]++; if (v >= 0) cnt.nsv[a][v]++; if (gain > best) best = gain;
      THS.forEach((th, i) => { if (gain >= th) { cnt.hit[i]++; cnt.bs[i][a]++; if (v >= 0) cnt.bsv[i][a][v]++; } });
    }
    if (best > -999) cnt.maxGain.push(best);
  }
  return cnt;
}
const pc = (x) => (x === null || x === undefined || !isFinite(x) ? '  -  ' : (100 * x).toFixed(x < 0.01 ? 2 : 1).padStart(5));
export function riLines(c, name, nSeasons) {
  const L = [], idx = (th) => THS.indexOf(th);
  L.push(`${name}: ${c.n} windows (${(c.n / nSeasons).toFixed(0)} a season; real ${REAL.meta.rows} over ${REAL.meta.seasons[1] - REAL.meta.seasons[0] + 1} seasons = ${(REAL.meta.rows / (REAL.meta.seasons[1] - REAL.meta.seasons[0] + 1)).toFixed(0)})`);
  L.push('  share of windows that gain at least   ' + THS.map((th) => String(th).padStart(6) + ' kt').join('') + '     sim / real');
  L.push('    simulated                           ' + THS.map((th, i) => pc(c.hit[i] / c.n).padStart(9)).join('') + '     ' + THS.map((th, i) => (REAL.overall[th] > 0 ? (c.hit[i] / c.n / REAL.overall[th]).toFixed(2) : '-')).join(' / '));
  L.push('    real                                ' + THS.map((th) => pc(REAL.overall[th]).padStart(9)).join(''));
  for (const th of [30, 50, 65]) {
    const i = idx(th);
    L.push(`  by sea temperature, gain >= ${th} kt (<27 / 27-28 / 28-29 / 29+):  sim ${c.bs[i].map((x, a) => pc(c.ns[a] ? x / c.ns[a] : null)).join(' ')}   real ${REAL.by_sst[th].map(pc).join(' ')}   windows ${c.ns.join('/')}`);
  }
  const i30 = idx(30);
  L.push('  hurricanes (65-95 kt at the start), gain >= 30 kt by sea temperature: sim ' + c.bsv[i30].map((row, a) => pc(c.nsv[a][2] ? row[2] / c.nsv[a][2] : null)).join(' ') + '   real ' + REAL.by_sst_wind['30'].p.map((row) => pc(row[2])).join(' '));
  const nvTot = (v) => c.nsv.reduce((s, row) => s + row[v], 0), hitV = (i, v) => c.bsv[i].reduce((s, row) => s + row[v], 0);
  const realV = (th, v) => { const n = REAL.n_sst_wind.reduce((s, row) => s + row[v], 0); return REAL.by_sst_wind[th].p.reduce((s, row, a) => s + (row[v] || 0) * REAL.n_sst_wind[a][v], 0) / n; };
  for (const th of [30, 50]) L.push(`  by wind at the start (<45 / 45-65 / 65-95 / 95+ kt), gain >= ${th} kt:  sim ${[0, 1, 2, 3].map((v) => pc(nvTot(v) ? hitV(idx(th), v) / nvTot(v) : null)).join(' ')}   real ${[0, 1, 2, 3].map((v) => pc(realV(th, v))).join(' ')}   windows ${[0, 1, 2, 3].map(nvTot).join('/')}`);
  const mg = c.maxGain.slice().sort((a, b) => b - a); L.push(`  strongest 24-h gain of each storm: top ${mg.slice(0, 6).join(' ')} kt; the real record's 6 strongest: ${REAL.strongest.slice(0, 6).map((x) => x.dv24).join(' ')} kt`);
  return L;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, ...names] = process.argv.slice(2);
  if (!file) { console.error('usage: node tools/storm_ri.mjs raw.json [setName ...]'); process.exit(1); }
  const raw = JSON.parse(readFileSync(file, 'utf8')), use = names.length ? names : raw.names;
  for (const name of use) console.log(riLines(riStats(raw.seasons.flatMap((r) => r.sets[name].storms)), name, raw.seasons.length).join('\n'));
}
