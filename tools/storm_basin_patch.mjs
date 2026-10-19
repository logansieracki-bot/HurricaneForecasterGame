// Writes a basin's fitted physics into the BASIN_PARAMS block of src/storms.js.
//
//   node tools/storm_basin_patch.mjs <basin> [--opt opt.json] [--gate] [--set 'name=json' ...] [--show]
//   --opt   the best candidate of a tools/storm_basin_opt.mjs run (its `best.patch`) is merged into the basin's entry
//   --gate  the genesis latitude gate is made from the latitudes where the basin's depressions really form (data/generated/<basin>-tc-ref.json): genGate.lat from the 2nd percentile less 1.5 degrees to
//           the 10th plus 0.5 (the Atlantic's [8.5, 11.5] sits at its 5th percentile of 10N); the growth gate latGate is the optimiser's (where hurricane-strength rows really are is a target of its loss)
//   --set   any other parameter, as name=json (sstRef0=28.9, 'genGate={"sst":[24,26]}')
//   --show  print the basin's entry and write nothing
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url))), FILE = join(ROOT, 'src/storms.js');
const a = process.argv.slice(2), basin = a[0], get = (k) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : null; };
if (!basin) { console.error('usage: node tools/storm_basin_patch.mjs <basin> [--opt opt.json] [--gate] [--set name=json] [--show]'); process.exit(1); }
const text = readFileSync(FILE, 'utf8'), B0 = '/* ==== BASIN PARAMS BEGIN ==== */', B1 = '/* ==== BASIN PARAMS END ==== */';
const i0 = text.indexOf(B0), i1 = text.indexOf(B1);
if (i0 < 0 || i1 < 0) throw new Error('no BASIN PARAMS block in src/storms.js');
const body = text.slice(i0 + B0.length, i1), obj = new Function('return ' + body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1))();
const round = (x) => +x.toPrecision(4);
const merge = (t, s) => { for (const [k, v] of Object.entries(s)) t[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(t[k] && typeof t[k] === 'object' ? t[k] : {}, v) : v; return t; };
const clean = (v) => (typeof v === 'number' ? round(v) : Array.isArray(v) ? v.map(clean) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) : v);
const entry = obj[basin] || (obj[basin] = {});
if (get('opt')) merge(entry, clean(JSON.parse(readFileSync(get('opt'), 'utf8')).best.patch));
if (a.includes('--gate')) {
  const q = JSON.parse(readFileSync(join(ROOT, `data/generated/${basin}-tc-ref.json`), 'utf8')).genesis.depression_abslat_quantiles, g0 = Math.max(2, +(q[0] - 1.5).toFixed(1)), g1 = +(q[2] + 0.5).toFixed(1);
  merge(entry, { genGate: { lat: [g0, g1] } });
}
a.forEach((x, i) => { if (x === '--set') { const j = a[i + 1].indexOf('='); merge(entry, { [a[i + 1].slice(0, j)]: JSON.parse(a[i + 1].slice(j + 1)) }); } });
const fmt = (v) => (Array.isArray(v) ? '[' + v.map(fmt).join(', ') + ']' : v && typeof v === 'object' ? '{ ' + Object.entries(v).map(([k, x]) => `${k}: ${fmt(x)}`).join(', ') + ' }' : String(v));
const lines = (o) => { const props = Object.entries(o).map(([k, v]) => `${k}: ${fmt(v)}`), out = []; let cur = '   '; for (const p of props) { if (cur.length + p.length > 170) { out.push(cur); cur = '   '; } cur += ' ' + p + ','; } out.push(cur); return out.join('\n'); };
const block = `\nconst BASIN_PARAMS = {\n` + Object.entries(obj).map(([k, v]) => `  ${k}: {\n${lines(v)}\n  },`).join('\n') + `\n};\n`;
if (a.includes('--show')) { console.log(`  ${basin}: {\n${lines(entry)}\n  },`); process.exit(0); }
writeFileSync(FILE, text.slice(0, i0 + B0.length) + block + text.slice(i1));
console.log(`BASIN_PARAMS.${basin}:\n${lines(entry)}`);
