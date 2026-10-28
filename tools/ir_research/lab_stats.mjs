// A lab case (or several, each with its own PAR overrides) run through the nest, and the picture statistics of irstats.mjs for its frames next to the real storms' of a stage (targets.json).
//   node tools/ir_research/lab_stats.mjs '<json: a case or a list; each case may have "stage": the real stage to compare with, "from": the first hour counted>' [outprefix]
// a case is what model_lab.mjs takes (label, seed, m, par, hours, every, spin, utc0, base, prog); the dumps (<outprefix>_<label>_<hour>.f32) stay for modelsheet.py
import { runCase } from './model_lab.mjs';
import { stats, summarize, METRICS } from './irstats.mjs';
import { readFileSync, readdirSync } from 'node:fs';
const spec = JSON.parse(process.argv[2]), cases = Array.isArray(spec) ? spec : [spec], outp = process.argv[3] || '/tmp/lab_stats';
const T = JSON.parse(readFileSync(new URL('./targets.json', import.meta.url))).stages;
const KEYS = ['A20', 'A40', 'A60', 'A70', 'A75', 'A80', 'tmin', 'otN', 'speckle', 'smallN', 'edgeGrad', 'tex50', 'tex70', 'cirrusRough', 'largest'];
const fmt = (o) => KEYS.map((k) => `${k}=${o[k] ? o[k].med : '-'}`).join(' ');
const dir = outp.slice(0, outp.lastIndexOf('/')), base = outp.slice(outp.lastIndexOf('/') + 1);
for (const c of cases) {
  runCase(c, outp);
  const fs = readdirSync(dir).filter((f) => f.startsWith(`${base}_${c.label}_`) && f.endsWith('.f32')).sort().filter((f) => +f.match(/_(\d+)\.f32$/)[1] >= (c.from || 0));
  const L = fs.map((f) => { const raw = readFileSync(`${dir}/${f}`); return stats(new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4), 256, 2 * (c.m || 1)); });
  console.log(`${c.label.padEnd(10)} n=${String(L.length).padStart(2)} ${fmt(summarize(L))}`);
  if (c.stage && T[c.stage]) console.log(`  real ${c.stage.padEnd(5)} n=${String(T[c.stage].frames).padStart(2)} ${fmt(T[c.stage])}`);
}
