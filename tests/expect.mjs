// The menu's Expected section: the calibration file data/generated/menu-expect.json that tools/make_menu_expect.mjs makes from whole seasons played through the simulator pages, and the prediction the menu makes
// from it. Pure node: it reads the file, the seasons it was made from (data/generated/menu-expect-runs.jsonl) and the real averages in src/menu.html; the browser side (the block on the basin screen, the menu's own
// prediction against this one) is in tests/run.mjs (checkMenu).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SPECS, predict, inputs } from '../tools/menu_expect_lib.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); } }

const FILE = join(ROOT, 'data/generated/menu-expect.json'), RUNS = join(ROOT, 'data/generated/menu-expect-runs.jsonl');
const IDS = ['atlantic', 'epac', 'wpac', 'nio', 'swio', 'aus', 'spac', 'satl', 'med'], KEYS = ['named', 'hurr', 'major', 'ace'];
const menu = readFileSync(join(ROOT, 'src/menu.html'), 'utf8');
const REAL = Object.fromEntries(IDS.map((id) => { const m = new RegExp("id: '" + id + "'[^\\n]*norm: \\[([^\\]]*)\\]").exec(menu); return [id, m ? m[1].split(',').map(Number) : null]; }));
check(`the real averages of all nine basins are read from the menu (${IDS.map((id) => id + ' ' + (REAL[id] || []).join('/')).join('; ')})`, IDS.every((id) => REAL[id] && REAL[id].length === 4 && REAL[id].every(Number.isFinite)));

check('the calibration file and the seasons it was made from are there', existsSync(FILE) && existsSync(RUNS));
const J = JSON.parse(readFileSync(FILE, 'utf8')), runs = readFileSync(RUNS, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
check(`a model for each of the nine basins (${Object.keys(J.basins).join(', ')})`, IDS.every((id) => J.basins[id]));

// the seasons
const per = IDS.map((id) => ({ id, n: runs.filter((r) => r.b === id).length, base: runs.filter((r) => r.b === id && r.kind === 'base').length, modes: ['random', 'locked', 'drift'].map((m) => runs.filter((r) => r.b === id && r.mode === m).length) }));
check(`every basin has at least 150 whole seasons played through its page, 40 of them at the normal settings, and all three ways of keeping ENSO among the rest (${per.map((p) => p.id + ' ' + p.n + '/' + p.base + ' ' + p.modes.join('.')).join(', ')})`, per.every((p) => p.n >= 190 && p.base >= 40 && p.modes.every((n) => n >= 20)));
check('no season ended before its year did, and no count is out of order (a hurricane is a named storm, a major one a hurricane)', runs.every((r) => r.days >= 100 && r.hurr <= r.named && r.major <= r.hurr && r.ace >= 0 && r.dep >= r.named));
// (the page keeps a seed between 1 and 999999 and a larger one is the same season whatever it is: the first run of the tool played the normal season of four basins forty times that way, and the models of those basins were fitted to it)
const outcomes = (id) => new Set(runs.filter((r) => r.b === id && r.kind === 'base').map((r) => [r.named, r.hurr, r.major, r.ace, r.dep].join('/'))).size;
check(`every season was played with a seed the page keeps (1 to 999999), and the 40 seasons at the normal settings of a basin are different seasons (${IDS.map((id) => id + ' ' + outcomes(id)).join(', ')} different outcomes)`, runs.every((r) => r.seed >= 1 && r.seed <= 999999) && IDS.every((id) => outcomes(id) >= 8));

// the models
const known = new Set(Object.keys(inputs({ W: 0, S: 0, M: 0, A: 1, E: 0, I: 1, mode: 'random' })));
let finite = true, shaped = true, phiOk = true, first = true;
for (const id of IDS) { const E = J.basins[id]; if (!E) continue; shaped = shaped && Array.isArray(E.spec) && E.spec.every((k) => known.has(k)) && E.spec[0] === '1' && Object.values(SPECS).some((sp) => sp.join() === E.spec.join()); for (const k of KEYS) { finite = finite && E.coef[k].length === E.spec.length && E.coef[k].every(Number.isFinite); phiOk = phiOk && ['r', 'c'].every((q) => Array.isArray(E.phi[k][q]) && E.phi[k][q].length === 2 && E.phi[k][q].every((x) => Number.isFinite(x) && x >= 0) && E.phi[k][q][0] + E.phi[k][q][1] > 0); } first = first && E.coef.named[0] > -6; }
check('every model has a known list of inputs that begins with the constant, as many coefficients as inputs for each of the four counts, all of them numbers, and, for a season whose ENSO is left to chance and for one whose ENSO was chosen, a variance round the mean that is a times the mean plus b times its square', finite && shaped && phiOk && first);

// at the normal settings the game makes about what the real record holds
const NORMAL = { W: 0, S: 0, M: 0, A: 1, E: 0, I: 1, mode: 'random' }, rows = IDS.map((id) => { const E = J.basins[id], p = predict(E, NORMAL), r = REAL[id]; return { id, p, r, ratio: [p.named / r[0], p.hurr / Math.max(r[1], 0.01), p.ace / Math.max(r[3], 0.01)] }; });
check(`at the normal settings a season has about the real number of named storms (a ratio to the real average of ${rows.map((x) => x.id + ' ' + x.ratio[0].toFixed(2)).join(', ')}) and the real energy (${rows.map((x) => x.id + ' ' + x.ratio[2].toFixed(2)).join(', ')})`,
  rows.every((x) => x.ratio[0] >= 0.55 && x.ratio[0] <= 1.8 && x.ratio[2] >= 0.4 && x.ratio[2] <= 2.2));

// the settings do what a player expects of them in every basin that has storms to change
const busy = rows.filter((x) => x.p.ace >= 10).map((x) => x.id), at = (id, q) => predict(J.basins[id], Object.assign({}, NORMAL, q)), R = (id, q, k) => at(id, q)[k] / at(id, {})[k];
const dir = (name, q, k, lo, hi) => { const rs = busy.map((id) => [id, R(id, q, k)]); check(`${name}: the ${k === 'ace' ? 'energy' : k === 'named' ? 'named storms' : k} of a season is ${lo}-${hi} times the normal in every basin with storms (${rs.map(([id, v]) => id + ' ' + v.toFixed(2)).join(', ')})`, rs.every(([, v]) => v >= lo && v <= hi)); };
check(`the basins with storms to change are the ones the real record has them in (${busy.join(', ')})`, ['atlantic', 'epac', 'wpac', 'nio', 'swio', 'aus', 'spac'].every((id) => busy.includes(id)));
dir('ocean 2 degrees warmer', { W: 2 }, 'ace', 1.05, 8);
dir('ocean 2 degrees cooler', { W: -2 }, 'ace', 0.1, 0.97);
dir('wind shear 10 kt higher', { S: 10 }, 'ace', 0.05, 0.9);
dir('wind shear 10 kt lower', { S: -10 }, 'ace', 0.98, 8);                                     // (in a basin whose shear is low already the page's floor of 0 kt leaves little to take away)
dir('mid-level moisture 10 % higher', { M: 10 }, 'ace', 1.1, 12);
dir('mid-level moisture 10 % lower', { M: -10 }, 'ace', 0.02, 0.92);
dir('storm activity twice the normal', { A: 2 }, 'named', 1.6, 2.4);
dir('storm activity half the normal', { A: 0.5 }, 'named', 0.4, 0.65);
const ex = busy.map((id) => at(id, { A: 0.1 }).named / at(id, {}).named);
check(`storm activity of 0.1 is about a tenth of a normal season (${ex.map((v) => v.toFixed(2)).join(', ')}), and no activity is none: the menu says so itself`, ex.every((v) => v > 0.04 && v < 0.2));

// El Nino: the Atlantic has fewer and weaker storms in an El Nino year and more in a La Nina year, the East Pacific the other way; and a chosen state that is left to drift counts less than one that is locked
const A = (id, E, mode, I) => at(id, { E, mode, I: I == null ? 1 : I });
const dEl = A('atlantic', 2, 'locked').ace / A('atlantic', -2, 'locked').ace, eEl = A('epac', 2, 'locked').ace / A('epac', -2, 'locked').ace;
check(`El Nino against La Nina (+2 against -2, locked): the Atlantic's energy is ${dEl.toFixed(2)} times (fewer in an El Nino year), the East Pacific's ${eEl.toFixed(2)} (more)`, dEl < 0.8 && eEl > 1.1);
const dr = Math.log(A('atlantic', 2, 'drift').ace / A('atlantic', 0, 'drift').ace), lk = Math.log(A('atlantic', 2, 'locked').ace / A('atlantic', 0, 'locked').ace), st = Math.log(A('atlantic', 2, 'locked', 2).ace / A('atlantic', 0, 'locked', 2).ace);
check(`a chosen El Nino that is left to drift weighs on the Atlantic about as much as a locked one (${dr.toFixed(2)} against ${lk.toFixed(2)} in the logarithm of the energy: the state persists through the season), and its influence counts: twice the influence is stronger (${st.toFixed(2)})`,
  dr < 0 && lk < 0 && dr / lk > 0.5 && dr / lk < 1.5 && st < lk);

// the fit against what it was made from
const fit = IDS.map((id) => { const E = J.basins[id], R_ = runs.filter((r) => r.b === id); let obs = 0, pred = 0; for (const r of R_) { const q = { W: r.W, S: r.S, M: r.M, A: r.A, E: r.E, I: r.I == null ? 1 : r.I, mode: r.mode }; pred += predict(E, q).ace; obs += r.ace; } return { id, ratio: pred / Math.max(1e-9, obs) }; });
check(`the predictions add up to the seasons played: the energy predicted for all of a basin's seasons is within 12 % of the energy they made, in all nine basins (${fit.map((f) => f.id + ' ' + f.ratio.toFixed(2)).join(', ')})`,
  fit.every((f) => Math.abs(f.ratio - 1) < 0.12));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
