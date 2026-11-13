// Node-only tests of the pure part of the editor's painting (src/severe-editor-paint.js): the colours of the maps (a value to a colour by the stops of its layer: exact at a stop, linear between two, the end colour beyond,
// transparent for a value that is not a number), and the table of maps itself (each is a field the analysis builder makes, its stops rise and its colours are colours). What is painted on a canvas is looked at in the browser suite.
import '../src/severe-core.js';
import '../src/severe-sounding.js';
import '../src/severe-analysis.js';
import '../src/severe-draw.js';
import '../src/severe-editor-paint.js';

const P = globalThis.HFSevereEditorPaint, A = globalThis.HFSevereAnalysis;
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const t0 = Date.now();

/* 1. The table of maps. */
{
  const fields = A.create({ objects: [] }).fields(0, { nx: 2, ny: 2 }).names, ids = P.LAYERS.map((l) => l.id);
  check('six maps with different ids (' + ids.join(', ') + '), each a field the analysis builder makes (' + P.LAYERS.map((l) => fields.includes(l.field)).join(', ') + ') with a name', ids.length === 6 && new Set(ids).size === 6 && P.LAYERS.every((l) => fields.includes(l.field) && l.id === l.field && l.name.length > 3) && P.layerById('stp').field === 'stp' && P.layerById('nope') === null);
  check('the stops of every map rise and have colours between 0 and 255 and an opacity between 0 and 1, and the range of its colour bar is in order and reaches the last stop at most',
    P.LAYERS.every((l) => l.stops.every((s, i) => s.length === 5 && s.slice(1, 4).every((x) => x >= 0 && x <= 255) && s[4] >= 0 && s[4] <= 1 && (i === 0 || s[0] > l.stops[i - 1][0])) && l.range[0] < l.range[1] && l.range[1] <= l.stops[l.stops.length - 1][0] + 1e-9));
  check('the maps of CAPE, shear, helicity and the tornado parameter are clear where there is nothing (opacity 0 at 0 J/kg, 10 m/s of shear, 0 m2/s2 and 0), and the temperature maps are not',
    ['mlcape', 'shear06', 'srh01', 'stp'].every((id) => { const l = P.layerById(id); return P.fieldColor(l, l.stops[0][0])[3] === 0; }) && P.fieldColor(P.layerById('T'), 0)[3] > 0.3 && P.fieldColor(P.layerById('Td'), 10)[3] > 0.3);
}

/* 2. The colour of a value. */
{
  const L = { stops: [[0, 10, 20, 30, 0], [10, 110, 120, 130, 0.5], [30, 200, 100, 0, 1]] }, f = (v) => P.fieldColor(L, v);
  check('at a stop it is that stop\'s colour (' + JSON.stringify(f(0)) + ', ' + JSON.stringify(f(10)) + ', ' + JSON.stringify(f(30)) + ')', JSON.stringify(f(0)) === '[10,20,30,0]' && JSON.stringify(f(10)) === '[110,120,130,0.5]' && JSON.stringify(f(30)) === '[200,100,0,1]');
  check('between two stops each part is linear: halfway from 0 to 10 is (60, 70, 80, 0.25), a quarter of the way from 10 to 30 is (132.5, 115, 97.5, 0.625) (' + JSON.stringify(f(5)) + ', ' + JSON.stringify(f(15)) + ')',
    f(5).every((x, i) => near(x, [60, 70, 80, 0.25][i], 1e-12)) && f(15).every((x, i) => near(x, [132.5, 115, 97.5, 0.625][i], 1e-12)));
  check('beyond the ends it is the colour of the end stop (' + JSON.stringify(f(-50)) + ', ' + JSON.stringify(f(1000)) + '), and a value that is not a number, or missing, is transparent (' + JSON.stringify(f(NaN)) + ', ' + JSON.stringify(f(undefined)) + ')',
    JSON.stringify(f(-50)) === '[10,20,30,0]' && JSON.stringify(f(1000)) === '[200,100,0,1]' && JSON.stringify(f(NaN)) === '[0,0,0,0]' && JSON.stringify(f(undefined)) === '[0,0,0,0]');
  const cape = P.layerById('mlcape'), c1 = P.fieldColor(cape, 2000), c2 = P.fieldColor(cape, 3000), c25 = P.fieldColor(cape, 2500);
  check('on the map of CAPE 2000 J/kg is yellow (' + c1.map((x) => Math.round(x)) + '), 3000 orange (' + c2.map((x) => Math.round(x)) + ') and 2500 is halfway (' + c25.map((x) => Math.round(x * 100) / 100) + ')', c1[0] === 255 && c1[1] === 235 && c1[2] === 60 && c2[0] === 255 && c2[1] === 150 && near(c25[1], 192.5, 1e-9) && near(c25[3], 0.575, 1e-9));
  check('past the last stop of a real map it is that stop\'s colour and opacity (CAPE of 9999 J/kg: ' + P.fieldColor(cape, 9999).join('/') + '; at 0: ' + P.fieldColor(cape, 0).join('/') + '; 100 J/kg: ' + P.fieldColor(cape, 100).join('/') + ')', P.fieldColor(cape, 9999).join('/') === '255/60/200/0.7' && P.fieldColor(cape, 0).join('/') === '120/200/255/0' && P.fieldColor(cape, 100).join('/') === '120/200/255/0.22' && P.fieldColor(cape, -5).join('/') === '120/200/255/0');
  const Td = P.layerById('Td');
  check('the dew point map is brown when dry, green at 12 C and violet when very humid (' + [-10, 5, 12, 26].map((v) => P.fieldColor(Td, v).join('/')).join(' | ') + ')', P.fieldColor(Td, -10).join('/') === '170/120/60/0.55' && P.fieldColor(Td, 5).join('/') === '205/185/95/0.5' && P.fieldColor(Td, 12).join('/') === '110/200/90/0.5' && P.fieldColor(Td, 26).join('/') === '150/90/255/0.62');
  const T = P.layerById('T'), cold = P.fieldColor(T, -10), zero = P.fieldColor(T, 0), hot = P.fieldColor(T, 40);
  check('the temperature map is blue under 0 C, cyan at 0 and red at 40 (' + [cold, zero, hot].map((c) => c.map((x) => Math.round(x)).slice(0, 3).join('/')).join(' | ') + ')', cold[2] > cold[0] && zero[2] > zero[0] && zero[1] > 150 && hot[0] === 255 && hot[1] === 60);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
process.exit(failed ? 1 : 0);
