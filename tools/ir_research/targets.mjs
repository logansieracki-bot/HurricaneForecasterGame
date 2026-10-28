// The real storms' picture numbers per stage (the targets the model is judged against): the exported GOES crops (export_crops.py) measured with irstats.mjs.
//   node tools/ir_research/targets.mjs <f32 dir> [out.json]     writes tools/ir_research/targets.json by default
// Stages (docs/ir-research.md): burst = a depression's bursts (Nolo 13-15 Sep, Isaias 6-8 Oct), remnant = a remnant low (Nolo 16-20 Sep), mass = the regeneration's giant burst and the sprawling tropical storm (Nolo 21-24 Sep),
// ri = rapid intensification (Nolo 25-27 Sep), hur = hurricanes at their peak (Nolo 27-29 Sep, Ian, Fiona, Dorian), sheared = Nolo in shear (29 Sep - 1 Oct), ty = the typhoon (Nolo 3-7 Oct), et = transitions (Fiona, Dorian: 5 km pixels).
import { readFileSync, writeFileSync } from 'node:fs';
import { stats, summarize, METRICS } from './irstats.mjs';
const dir = process.argv[2], outp = process.argv[3] || new URL('./targets.json', import.meta.url).pathname;
const idx = JSON.parse(readFileSync(`${dir}/index.json`));
const between = (n, a, b) => n >= a && n <= b;
function stageOf(e) {
  const n = e.name;
  if (e.set === 'nolo_td' || e.set === 'isaias_td') return 'burst';
  if (e.set === 'nolo_rem') return between(n, '20260916T0000', '20260920T1800') ? 'remnant' : between(n, '20260921T0600', '20260924T1200') ? 'mass' : null;
  if (e.set === 'nolo_hur') return between(n, '20260925T0000', '20260927T0600') ? 'ri' : between(n, '20260927T1200', '20260929T0000') ? 'hur' : null;
  if (e.set === 'nolo_weak') return between(n, '20260929T1200', '20261001T1200') ? 'sheared' : null;
  if (e.set === 'nolo_ty') return between(n, '20261003T1200', '20261007T1800') ? 'ty' : null;
  if (e.set === 'ian') return between(n, '20220927T0000', '20220928T1200') ? 'hur' : null;
  if (e.set === 'fiona') return between(n, '20220920T0000', '20220922T0000') ? 'hur' : null;
  if (e.set === 'dorian') return between(n, '20190901T0000', '20190903T0000') ? 'hur' : null;
  if (e.set === 'fiona_et') return between(n, '20220922T0600', '20220924T1200') ? 'et' : null;
  if (e.set === 'dorian_et') return between(n, '20190906T1200', '20190909T0000') ? 'et' : null;
  return null;
}
const PIXEL = ['otN', 'otMed', 'otMax', 'speckle', 'smallN', 'smallShare', 'objN', 'edgeGrad', 'tex50', 'tex60', 'tex70', 'cirrusRough'];       // (only meaningful at 2-3 km pixels)
const by = {};
for (const e of idx) {
  const s = stageOf(e); if (!s) continue;
  const raw = readFileSync(`${dir}/${e.set}/${e.name}.f32`), tb = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const st = stats(tb, e.n, e.res); if (e.res > 3.5) for (const k of PIXEL) st[k] = null;
  (by[s] || (by[s] = [])).push(st);
}
const out = { note: 'the real storms (GOES-16/18/19), the central 500 km, median / 10th / 90th percentile over the frames of each stage; areas in thousand km2, speckle and shares are fractions, edgeGrad is C/km, tex* and cirrusRough are C', stages: {} };
for (const s of Object.keys(by)) out.stages[s] = { frames: by[s].length, ...summarize(by[s]) };
writeFileSync(outp, JSON.stringify(out, null, 1));
for (const s of Object.keys(out.stages)) { const o = out.stages[s]; console.log(s.padEnd(8), String(o.frames).padStart(3), METRICS.map((k) => `${k}=${o[k] ? o[k].med : '-'}`).join(' ')); }
