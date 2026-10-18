// Validates simulated Atlantic seasons against the real best track on what the engine is NOT fitted to: where the tracks go.
//
//   node tools/storm_validate.mjs raw.json [--set base] [--json out.json]        (raw.json: the output of tools/storm_mc.mjs --out, any seeds)
//
// Real side: data/generated/atlantic-tc-maps.json (track density, landfalls by region, genesis map) and atlantic-tc-validate.json (residual motion statistics, displacements, reach),
// both made by tools/make_tc_maps.py / make_tc_validate.py from the IBTrACS tables over 1991-2020. The simulated seasons are the 214 days from Jun 1 (the whole real season but for
// the few storms of Jan-May), so the real numbers that include Jan-May are compared with a few per cent of slack, never tuned to.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
await import(pathToFileURL(join(ROOT, 'src/storms.js')).href);
const H = globalThis.HFStorms;
const MAPS = JSON.parse(readFileSync(join(ROOT, 'data/generated/atlantic-tc-maps.json'), 'utf8'));
const VAL = JSON.parse(readFileSync(join(ROOT, 'data/generated/atlantic-tc-validate.json'), 'utf8'));
const G = MAPS.grid;
const REGIONS = MAPS.landfall.regions;

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const sd = (a) => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
const f = (x, n = 2) => (Number.isFinite(x) ? x.toFixed(n) : '-');
const doyOf = (h, startMs) => { const d = new Date(startMs + h * 3600000), y = d.getUTCFullYear(); return Math.floor((d.getTime() - Date.UTC(y, 0, 1)) / 86400000); };
const START_MS = Date.UTC(2026, 5, 1);                                      // the page's own start: June 1 of the year it was opened (the year does not matter, the day of the year does)

export function validate(raw, setName = 'base') {
  const seasons = raw.seasons.map((s) => s.sets[setName]), nS = seasons.length, out = {};
  const storms = seasons.flatMap((s) => s.storms), named = storms.filter((x) => x.named);
  // ---- track density: six-hourly fixes of named storms at named-storm strength (tropical / subtropical), per 5-degree cell per season
  const dens = Array.from({ length: G.ny }, () => new Array(G.nx).fill(0));
  const cellOf = (lat, lon) => [Math.round((lat - G.lat0) / G.res), Math.round((lon - G.lon0) / G.res)];
  for (const x of named) for (const t of x.trk) {
    if (t[3] % 6 !== 0 || t[4] > 1 || t[2] < 34) continue;
    const [j, i] = cellOf(t[0], t[1]); if (j >= 0 && j < G.ny && i >= 0 && i < G.nx) dens[j][i] += 1 / nS;
  }
  const real = MAPS.density_named_rows_per_season;
  const flatR = real.flat(), flatS = dens.flat(), sumR = flatR.reduce((a, b) => a + b, 0), sumS = flatS.reduce((a, b) => a + b, 0);
  const corr = (() => { const mr = mean(flatR), ms = mean(flatS); let a = 0, b = 0, c = 0; for (let k = 0; k < flatR.length; k++) { a += (flatR[k] - mr) * (flatS[k] - ms); b += (flatR[k] - mr) ** 2; c += (flatS[k] - ms) ** 2; } return a / Math.sqrt(b * c); })();
  // log-ratio of coarse (10 x 20 degree) boxes: where the sim has too many or too few rows
  const boxes = [];
  for (let la = 5; la < 65; la += 10) for (let lo = -105; lo < -5; lo += 20) {
    let r = 0, s = 0; for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) { const lat = G.lat0 + j * G.res, lon = G.lon0 + i * G.res; if (lat >= la && lat < la + 10 && lon >= lo && lon < lo + 20) { r += real[j][i]; s += dens[j][i]; } }
    if (r > 0.5 || s > 0.5) boxes.push({ la, lo, real: r, sim: s });
  }
  out.density = { corr, sumReal: sumR, sumSim: sumS, boxes, dens };
  // ---- landfalls per season by region: a named storm's step from water to land (previous fix a tropical / subtropical one), assigned to the box it lands in
  const lf = Object.fromEntries(Object.keys(REGIONS).map((k) => [k, { n: 0, h: 0 }]));
  for (const x of named) for (let i = 1; i < x.trk.length; i++) {
    const a = x.trk[i - 1], b = x.trk[i];
    if (a[3] % 6 !== 0 || b[3] % 6 !== 0 || a[5] === 1 || b[5] !== 1 || a[4] > 1) continue;
    for (const [k, [la0, la1, lo0, lo1]] of Object.entries(REGIONS)) if (b[0] >= la0 && b[0] <= la1 && b[1] >= lo0 && b[1] <= lo1) { lf[k].n++; if (a[2] >= 64) lf[k].h++; break; }
  }
  out.landfall = Object.fromEntries(Object.entries(lf).map(([k, v]) => [k, { sim: v.n / nS, simHurr: v.h / nS, real: MAPS.landfall.per_year[k], realHurr: MAPS.landfall.hurricane_per_year[k] }]));
  // ---- genesis: first tropical fix of every depression, per year, in the regions of the real map (tropical class only, T)
  const GT = MAPS.genesis.T, gen = Array.from({ length: 12 }, () => Array.from({ length: G.ny }, () => new Array(G.nx).fill(0)));
  for (const x of storms) if (x.gen && !x.sub0 && x.td >= 0) {
    const m = new Date(START_MS + x.td * 3600000).getUTCMonth(), [j, i] = cellOf(x.gen[0], x.gen[1]);
    if (j >= 0 && j < G.ny && i >= 0 && i < G.nx) gen[m][j][i] += 1 / nS;
  }
  const regGen = (la0, la1, lo0, lo1, src) => { let s = 0; for (let m = 5; m < 12; m++) for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) { const lat = G.lat0 + j * G.res, lon = G.lon0 + i * G.res; if (lat >= la0 && lat < la1 && lon >= lo0 && lon < lo1) s += src[m][j][i]; } return s; };
  const GR = [['Atlantic east of 40W, south of 20N', 5, 20, -45, 0], ['MDR west part 20-60W', 5, 20, -62.5, -42.5], ['Caribbean', 5, 20, -87.5, -62.5], ['Gulf of Mexico', 20, 32, -100, -80], ['SE US coast and Bahamas', 20, 38, -80, -62.5], ['subtropical Atlantic north of 25N, east of 62W', 25, 66, -62.5, 0], ['whole basin', 0, 70, -110, 0]];
  out.genesis = GR.map(([name, la0, la1, lo0, lo1]) => ({ name, sim: regGen(la0, la1, lo0, lo1, gen), real: regGen(la0, la1, lo0, lo1, GT) }));
  // ---- motion: the residual of the six-hourly translation from the real mean drift (the maps' own), by class, and its autocorrelation along the track
  const PM = H.prepareMaps({ grid: G, drift: MAPS.drift });
  const DV = new Float64Array(2), res = { weak: [], strong: [], sub: [], ex: [] }, series = { weak: [], strong: [] };
  for (const x of storms) {
    const tr = x.trk.filter((t) => t[3] % 6 === 0 && t[4] <= 2 && t[5] === 0), seq = { weak: [], strong: [] };
    for (let i = 0; i + 1 < tr.length; i++) {
      const a = tr[i], b = tr[i + 1]; if (b[3] - a[3] !== 6) { seq.weak.push(null); seq.strong.push(null); continue; }
      const latm = (a[0] + b[0]) / 2, lonm = (a[1] + b[1]) / 2, u = (b[1] - a[1]) * 111.2 * Math.cos(latm * Math.PI / 180) / 6 / 1.852, v = (b[0] - a[0]) * 111.2 / 6 / 1.852;
      const cls = a[4] === 2 ? 'ex' : a[4] === 1 ? 'sub' : a[2] >= 64 ? 'strong' : 'weak';
      H.driftAt(PM, cls, H.timeWeights(doyOf(a[3], START_MS)), latm, lonm, DV);
      res[cls].push([u - DV[0], v - DV[1]]);
      if (cls === 'weak' || cls === 'strong') { for (const k of ['weak', 'strong']) seq[k].push(k === cls ? [u - DV[0], v - DV[1]] : null); } else { seq.weak.push(null); seq.strong.push(null); }
    }
    for (const k of ['weak', 'strong']) series[k].push(seq[k]);
  }
  out.residual = {};
  for (const c of ['weak', 'strong', 'sub', 'ex']) {
    const r = res[c]; if (r.length < 30) { out.residual[c] = { n: r.length }; continue; }
    const ac = {};
    if (series[c]) for (const lag of [1, 2, 4, 8, 16]) { let n = 0, d1 = 0, d2 = 0; for (const s of series[c]) for (let i = 0; i + lag < s.length; i++) { const p = s[i], q = s[i + lag]; if (!p || !q) continue; n += p[0] * q[0] + p[1] * q[1]; d1 += p[0] * p[0] + p[1] * p[1]; d2 += q[0] * q[0] + q[1] * q[1]; } ac[lag * 6] = n / Math.sqrt(d1 * d2); }
    out.residual[c] = { n: r.length, meanU: mean(r.map((x) => x[0])), meanV: mean(r.map((x) => x[1])), sdU: sd(r.map((x) => x[0])), sdV: sd(r.map((x) => x[1])), ac, real: VAL.residual[c] };
  }
  // ---- displacements 48 / 96 h after a tropical-cyclone fix inside a box, tracks that still exist (any status) then
  const BOX = { 'MDR (10-20N, 60-30W)': [10, 20, -60, -30], 'Caribbean (12-20N, 85-60W)': [12, 20, -85, -60], 'W Atlantic subtropics (25-35N, 80-55W)': [25, 35, -80, -55] };
  out.disp = {};
  for (const [name, [la0, la1, lo0, lo1]] of Object.entries(BOX)) {
    out.disp[name] = {};
    for (const HH of [48, 96]) {
      const e = [], n = [];
      for (const x of storms) {
        const by = new Map(x.trk.map((t) => [t[3], t]));
        for (const t of x.trk) {
          if (t[3] % 6 !== 0 || t[4] > 1 || t[5] === 1 || t[0] < la0 || t[0] > la1 || t[1] < lo0 || t[1] > lo1) continue;
          const q = by.get(t[3] + HH); if (!q) continue;
          e.push((q[1] - t[1]) * 111.2 * Math.cos((q[0] + t[0]) / 2 * Math.PI / 180)); n.push((q[0] - t[0]) * 111.2);
        }
      }
      out.disp[name][HH] = { n: e.length, meanE: mean(e), meanN: mean(n), sdE: sd(e), sdN: sd(n), real: VAL.displacement[name][String(HH)] };
    }
  }
  // ---- reach: the share of named storms whose track reaches a latitude
  out.reach = {}; for (const L of [25, 30, 35, 40]) out.reach[L] = { sim: named.filter((x) => x.trk.some((t) => t[0] >= L)).length / Math.max(1, named.length), real: VAL.reach[String(L)] };
  // ---- loops: a named storm that turns through 300 degrees or more within five days (headings of 12-hour displacements of at least 40 km, as in make_tc_validate.py)
  const loopFlag = (tr) => {
    const la = tr.map((t) => t[0]), lo = tr.map((t) => t[1]), step = 2, win = 10; if (la.length < step + 3) return false;
    const th = []; for (let i = 0; i + step < la.length; i++) { const dx = (lo[i + step] - lo[i]) * 111.2 * Math.cos((la[i + step] + la[i]) / 2 * Math.PI / 180), dy = (la[i + step] - la[i]) * 111.2; if (Math.hypot(dx, dy) >= 40) th.push(Math.atan2(dx, dy) * 180 / Math.PI); }
    if (th.length < 3) return false;
    const d = []; for (let i = 1; i < th.length; i++) d.push((((th[i] - th[i - 1] + 180) % 360) + 360) % 360 - 180);
    for (let i = 0; i < Math.max(1, d.length - win + 2); i++) { let s = 0; for (let k = i; k < Math.min(d.length, i + win - 1); k++) s += d[k]; if (Math.abs(s) >= 300) return true; }
    return false;
  };
  out.loops = { sim: named.filter((x) => loopFlag(x.trk.filter((t) => t[3] % 6 === 0 && t[4] <= 1))).length / Math.max(1, named.length), real: VAL.loops.share };
  out.counts = { seasons: nS, storms: storms.length, named: named.length };
  return out;
}

export function report(v) {
  const L = [];
  L.push(`track density of named storms (six-hourly rows at >= 34 kt per season): correlation of the 5-degree maps ${f(v.density.corr, 3)}, total ${f(v.density.sumSim, 1)} (real ${f(v.density.sumReal, 1)}, which includes Jan-May)`);
  L.push('  10 x 20 degree boxes, rows per season (sim / real):  ' + v.density.boxes.filter((b) => b.real > 2 || b.sim > 2).map((b) => `${b.la}N ${b.lo}: ${f(b.sim, 1)}/${f(b.real, 1)}`).join('   '));
  L.push('first landfalls of named storms per season (sim vs real 1991-2020), hurricanes at landfall in brackets');
  for (const [k, x] of Object.entries(v.landfall)) L.push(`  ${k.padEnd(30)} ${f(x.sim)} (${f(x.simHurr)})   real ${f(x.real)} (${f(x.realHurr)})`);
  L.push('tropical genesis per season Jun-Dec (sim / real)');
  for (const g of v.genesis) L.push(`  ${g.name.padEnd(48)} ${f(g.sim)} / ${f(g.real)}`);
  L.push('translation residual from the real mean drift (kt): sd u/v, autocorrelation at 6, 12, 24, 48, 96 h   [real]');
  for (const [c, r] of Object.entries(v.residual)) if (r.sdU) L.push(`  ${c.padEnd(7)} n ${String(r.n).padStart(6)}  mean ${f(r.meanU)}/${f(r.meanV)}  sd ${f(r.sdU)}/${f(r.sdV)}  ac ${[6, 12, 24, 48, 96].map((h) => (r.ac && r.ac[h] != null ? f(r.ac[h]) : '-')).join(' ')}   [real n ${r.real.n}, sd ${r.real.sd_u}/${r.real.sd_v}, ac ${[6, 12, 24, 48, 96].map((h) => r.real.autocorr_h[h]).join(' ')}]`);
  L.push('displacement 48 / 96 h after a tropical-cyclone fix in a box (km, mean east/north, sd east/north)  [real]');
  for (const [name, d] of Object.entries(v.disp)) for (const HH of [48, 96]) { const x = d[HH], r = x.real; L.push(`  ${name.padEnd(40)} ${HH} h n ${String(x.n).padStart(4)} (${r.n})  mean ${f(x.meanE, 0)}/${f(x.meanN, 0)}  sd ${f(x.sdE, 0)}/${f(x.sdN, 0)}   [${r.mean_e}/${r.mean_n}  sd ${r.sd_e}/${r.sd_n}]`); }
  L.push('share of named storms reaching 25 / 30 / 35 / 40 N: ' + [25, 30, 35, 40].map((l) => `${f(v.reach[l].sim)} (${f(v.reach[l].real)})`).join('  '));
  L.push(`share of named storms that loop (300 degrees of turning within five days): ${f(v.loops.sim, 3)} (real ${f(v.loops.real, 3)})`);
  return L.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2), get = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
  const raw = JSON.parse(readFileSync(a[0], 'utf8')), v = validate(raw, get('set', raw.names[0]));
  console.log(report(v));
  if (get('json')) writeFileSync(get('json'), JSON.stringify(v));
}
