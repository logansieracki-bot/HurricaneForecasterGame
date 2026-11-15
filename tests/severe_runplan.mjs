// Node-only tests of the plan of a run (src/severe-runplan.js): the settings of the editor's "Run a storm" card (the rows, what each offers, the model's own), the spec of the Lab that the card gives (the ground and the rain with
// every run, the bubble with all but a zone's, the nest with a fine one, nothing of the module's own changed by it), how many settings are not the model's own, and what a run costs (the nest's work against the 500 m nest over
// 30 km that was measured, the minutes of a run, the way a time is said). The right answers are written out here from the definitions and from the numbers measured in Node (docs/severe-research.md part 7).
import '../src/severe-runplan.js';

const P = globalThis.HFSevereRunPlan;
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const t0 = Date.now(), D = P.SET_DEF, st = (o) => Object.assign({}, D, o);

/* 1. The model's own settings and the rows of the card. */
{
  check('the model\'s own settings are the ground of short grass (0.1 m), the rain\'s evaporation at full (1), a bubble of 3 K, a nest of half the box\'s cells (500 m in a box of 1 km), 30 km wide, from the 20th minute (' + JSON.stringify(D) + ')',
    JSON.stringify(D) === JSON.stringify({ ground: 0.1, evap: 1, bubble: 3, nest: 2, nestBox: 30, nestFrom: 20 }));
  const ids = P.SETS.map((r) => r.id), labels = P.SETS.map((r) => r.opts.map((o) => o[1]).join(' / '));
  check('the card has six rows in this order (' + ids.join(', ') + '), each with a title, a line that says what it is and its choices (' + labels.join('; ') + ')',
    ids.join(',') === 'ground,evap,bubble,nest,nestBox,nestFrom' && P.SETS.every((r) => r.title && r.title.length > 3 && r.hint && r.hint.length > 40 && r.opts.length >= 3)
    && labels[0] === 'None / Smooth / Grass / Crops / Trees' && labels[1] === 'Full / Half / Light' && labels[2] === '2 K / 3 K / 4 K / 5 K' && labels[3] === '500 m / 333 m / 250 m' && labels[4] === '20 km / 30 km / 40 km' && labels[5] === 'minute 10 / minute 20 / minute 30');
  check('the values of the choices are the numbers the model takes: the ground\'s roughness in metres (0, 0.03, 0.1, 0.3, 1), the evaporation (1, 0.5, 0.3), the bubble in kelvins (2 to 5), the box\'s cells over the nest\'s (2, 3, 4), kilometres (20, 30, 40) and minutes (10, 20, 30)',
    JSON.stringify(P.SETS.map((r) => r.opts.map((o) => o[0]))) === '[[0,0.03,0.1,0.3,1],[1,0.5,0.3],[2,3,4,5],[2,3,4],[20,30,40],[10,20,30]]');
  check('the model\'s own is one of the choices of every row, and only the nest\'s three rows are for the fine model alone (' + P.SETS.filter((r) => r.fine).map((r) => r.id).join(', ') + ')',
    P.SETS.every((r) => r.opts.some((o) => o[0] === D[r.id])) && P.SETS.filter((r) => r.fine).map((r) => r.id).join(',') === 'nest,nestBox,nestFrom' && P.SETS.slice(0, 3).every((r) => !r.fine));
  check('the nest, the fine model and the quick one as the Lab takes them: a nest of 500 m, 30 km, from minute 20, the lowest 8 km, a frame a minute; a box of 108 km at 1 km (a step of 5 s) with the middle 96 km recorded; a box of 128 km for the quick model',
    JSON.stringify(P.DETAIL) === JSON.stringify({ dx: 500, box: 30000, from: 20, ztop: 8000, every: 1, cost: 3.1, boxRate: 15 }) && P.FINE.dx === 1000 && P.FINE.dt === 5 && P.FINE.box === 108000 && P.FINE.window === 96000 && P.FINE.detail === P.DETAIL && P.FAST.box === 128000 && Object.keys(P.FAST).length === 1);
}

/* 2. How many settings are not the model's own. */
{
  const c = (o, fine) => P.changed(st(o), fine);
  check('none are changed with the model\'s own (' + c({}, true) + ' fine, ' + c({}, false) + ' quick), one is when one is (the ground ' + c({ ground: 0 }, false) + ', the rain ' + c({ evap: 0.5 }, false) + ', the bubble ' + c({ bubble: 4 }, false) + ') and the count adds up (' + c({ ground: 0, evap: 0.5, bubble: 5 }, false) + ')',
    c({}, true) === 0 && c({}, false) === 0 && c({ ground: 0 }, false) === 1 && c({ evap: 0.5 }, false) === 1 && c({ bubble: 4 }, false) === 1 && c({ ground: 0, evap: 0.5, bubble: 5 }, false) === 3 && c({ ground: 0.03, evap: 0.3 }, true) === 2);
  check('the nest\'s three count for a fine run (' + c({ nest: 3 }, true) + ', ' + c({ nestBox: 20 }, true) + ', ' + c({ nestFrom: 10 }, true) + ', all six ' + c({ ground: 1, evap: 0.3, bubble: 2, nest: 4, nestBox: 40, nestFrom: 30 }, true) + ') and not for a quick one, which has no nest (' + c({ nest: 3, nestBox: 20, nestFrom: 10 }, false) + '; all six ' + c({ ground: 1, evap: 0.3, bubble: 2, nest: 4, nestBox: 40, nestFrom: 30 }, false) + ')',
    c({ nest: 3 }, true) === 1 && c({ nestBox: 20 }, true) === 1 && c({ nestFrom: 10 }, true) === 1 && c({ ground: 1, evap: 0.3, bubble: 2, nest: 4, nestBox: 40, nestFrom: 30 }, true) === 6 && c({ nest: 3, nestBox: 20, nestFrom: 10 }, false) === 0 && c({ ground: 1, evap: 0.3, bubble: 2, nest: 4, nestBox: 40, nestFrom: 30 }, false) === 3);
}

/* 3. What the nest costs: 1 for the 500 m nest over 30 km, a part that does not go with its size (0.36) and the rest with its columns and its steps. */
{
  const f = (o) => P.nestFactor(st(o)), area = (w) => (w / 30) ** 2, steps = (n) => (n / 2) ** 3;
  check('the nest of the model\'s own is 1 (' + f({}) + '); a width of 20 km is ' + f({ nestBox: 20 }).toFixed(4) + ' and of 40 km ' + f({ nestBox: 40 }).toFixed(4) + ' (0.36 + 0.64 of the area: ' + (0.36 + 0.64 * area(20)).toFixed(4) + ', ' + (0.36 + 0.64 * area(40)).toFixed(4) + '), cells of 333 m ' + f({ nest: 3 }).toFixed(3) + ' (0.36 + 0.64 x 3.375) and of 250 m ' + f({ nest: 4 }).toFixed(3) + ' (0.36 + 0.64 x 8)',
    f({}) === 1 && near(f({ nestBox: 20 }), 0.36 + 0.64 * area(20), 1e-12) && near(f({ nestBox: 40 }), 0.36 + 0.64 * area(40), 1e-12) && near(f({ nest: 3 }), 0.36 + 0.64 * steps(3), 1e-12) && near(f({ nest: 4 }), 0.36 + 0.64 * 8, 1e-12) && near(f({ nest: 4, nestBox: 40 }), 0.36 + 0.64 * 8 * area(40), 1e-12));
  check('against the measured nest (the nest\'s seconds a model minute: 16.4, 25.3 and 38.0 for 20, 30 and 40 km of 500 m cells): the factor says ' + [20, 30, 40].map((w) => (25.3 * f({ nestBox: w })).toFixed(1)).join(', '),
    [[20, 16.4], [30, 25.3], [40, 38.0]].every(([w, s]) => near(25.3 * f({ nestBox: w }), s, 0.8)));
  check('the start of the nest does not change what it costs a minute (' + f({ nestFrom: 10 }) + ' and ' + f({ nestFrom: 30 }) + ')', f({ nestFrom: 10 }) === 1 && f({ nestFrom: 30 }) === 1 && f({ ground: 0, evap: 0.3, bubble: 5 }) === 1);
}

/* 4. The minutes of work of a fine run, and the way a time is said. */
{
  const w = (m, o) => P.work(m, st(o));
  check('a fine run of 90 minutes with the model\'s own is 20 x 0.3 + 70 x 0.82 = ' + (20 * 0.3 + 70 * 0.82).toFixed(1) + ' minutes of work (' + w(90).toFixed(2) + '), 120 minutes ' + w(120).toFixed(2) + ' and 45 ' + w(45).toFixed(2),
    near(w(90), 20 * 0.3 + 70 * 0.82, 1e-9) && near(w(120), 20 * 0.3 + 100 * 0.82, 1e-9) && near(w(45), 20 * 0.3 + 25 * 0.82, 1e-9));
  check('before the nest starts it is only the box\'s 0.3 a minute (15 minutes: ' + w(15).toFixed(2) + ', 20: ' + w(20).toFixed(2) + ', 0: ' + w(0) + '), and the nest\'s start moves the change (from 10: ' + w(90, { nestFrom: 10 }).toFixed(2) + ' = 10 x 0.3 + 80 x 0.82, from 30: ' + w(90, { nestFrom: 30 }).toFixed(2) + ' = 30 x 0.3 + 60 x 0.82; a run of 25 minutes with the nest from 30 is ' + w(25, { nestFrom: 30 }).toFixed(2) + ')',
    near(w(15), 4.5, 1e-9) && near(w(20), 6, 1e-9) && w(0) === 0 && near(w(90, { nestFrom: 10 }), 3 + 80 * 0.82, 1e-9) && near(w(90, { nestFrom: 30 }), 9 + 60 * 0.82, 1e-9) && near(w(25, { nestFrom: 30 }), 7.5, 1e-9));
  check('the nest\'s cells and width go with its work: 333 m for 90 minutes is ' + w(90, { nest: 3 }).toFixed(1) + ' (6 + 70 x (0.3 + 0.52 x 2.52)), 250 m over 20 km ' + w(90, { nest: 4, nestBox: 20 }).toFixed(1) + ', 40 km of 500 m ' + w(90, { nestBox: 40 }).toFixed(1) + ' and 20 km ' + w(90, { nestBox: 20 }).toFixed(1),
    near(w(90, { nest: 3 }), 6 + 70 * (0.3 + 0.52 * (0.36 + 0.64 * 3.375)), 1e-9) && near(w(90, { nest: 4, nestBox: 20 }), 6 + 70 * (0.3 + 0.52 * (0.36 + 0.64 * 8 * (4 / 9))), 1e-9) && near(w(90, { nestBox: 40 }), 6 + 70 * (0.3 + 0.52 * (0.36 + 0.64 * 16 / 9)), 1e-9) && near(w(90, { nestBox: 20 }), 6 + 70 * (0.3 + 0.52 * (0.36 + 0.64 * 4 / 9)), 1e-9));
  const t = P.timeText;
  check('a time is said in minutes up to two hours and in halves of an hour from there: ' + [5, 65, 115, 119, 120, 134, 135, 150, 165, 330].map((m) => m + ' is ' + t(m)).join('; '),
    t(5) === 'about 5 minutes' && t(65) === 'about 65 minutes' && t(115) === 'about 115 minutes' && t(119) === 'about 119 minutes' && t(120) === 'about 2 hours' && t(134) === 'about 2 hours' && t(135) === 'about 2.5 hours' && t(150) === 'about 2.5 hours' && t(165) === 'about 3 hours' && t(330) === 'about 5.5 hours');
}

/* 5. The spec of a run. */
{
  const s1 = P.spec({ minutes: 90, fine: true, zone: null }, D);
  check('a fine run with the model\'s own settings: ' + JSON.stringify(s1), JSON.stringify(s1) === JSON.stringify({ minutes: 90, drag: 0.1, evap: 1, bubble: 3, dx: 1000, dt: 5, box: 108000, window: 96000, detail: { dx: 500, box: 30000, from: 20, ztop: 8000, every: 1, cost: 3.1, boxRate: 15 } }));
  const s2 = P.spec({ minutes: 120, fine: true, zone: null }, st({ ground: 0, evap: 0.5, bubble: 5, nest: 3, nestBox: 20, nestFrom: 10 }));
  check('with every setting changed they are all in it: the ground ' + s2.drag + ', the rain ' + s2.evap + ', the bubble ' + s2.bubble + ' K, a nest of ' + s2.detail.dx.toFixed(2) + ' m cells over ' + s2.detail.box / 1000 + ' km from minute ' + s2.detail.from + ' that costs ' + s2.detail.cost.toFixed(4) + ' times the box (1 + 2.1 x ' + (0.36 + 0.64 * 3.375 * 4 / 9).toFixed(4) + '), the minutes ' + s2.minutes,
    s2.minutes === 120 && s2.drag === 0 && s2.evap === 0.5 && s2.bubble === 5 && near(s2.detail.dx, 1000 / 3, 1e-12) && Math.abs(3 * s2.detail.dx - 1000) < 1e-9 && s2.detail.box === 20000 && s2.detail.from === 10 && near(s2.detail.cost, 1 + 2.1 * (0.36 + 0.64 * 3.375 * 4 / 9), 1e-12) && s2.detail.ztop === 8000 && s2.detail.every === 1 && s2.detail.boxRate === 15 && s2.dx === 1000 && s2.dt === 5 && s2.box === 108000 && s2.window === 96000);
  check('a nest of 250 m is a quarter of the box\'s cells, exactly (' + P.spec({ minutes: 90, fine: true }, st({ nest: 4 })).detail.dx + ') and its cost is 1 + 2.1 x (0.36 + 0.64 x 8) = ' + (1 + 2.1 * 5.48).toFixed(3) + ' (' + P.spec({ minutes: 90, fine: true }, st({ nest: 4 })).detail.cost.toFixed(3) + ')',
    P.spec({ minutes: 90, fine: true }, st({ nest: 4 })).detail.dx === 250 && near(P.spec({ minutes: 90, fine: true }, st({ nest: 4 })).detail.cost, 1 + 2.1 * 5.48, 1e-12));
  const q = P.spec({ minutes: 60, fine: false, zone: null }, st({ evap: 0.3, bubble: 4 }));
  check('a quick run has the box of 128 km, the settings that apply to it and no nest: ' + JSON.stringify(q), JSON.stringify(q) === JSON.stringify({ minutes: 60, drag: 0.1, evap: 0.3, bubble: 4, box: 128000 }) && !('detail' in q));
  const zone = { dx: 2000, box: 84000, seeds: [{ x: 1, y: 2, t: 0, amp: 3 }], follow: false }, z1 = P.spec({ minutes: 90, fine: true, zone }, st({ ground: 0.3, evap: 0.5, bubble: 5, nest: 4 }));
  check('a run with an initiation zone has its own box and bubbles, the ground and the rain, and neither the bubble (it makes its own) nor the nest (it follows no storm), whatever the settings and the quality: ' + JSON.stringify(z1),
    z1.minutes === 90 && z1.drag === 0.3 && z1.evap === 0.5 && z1.dx === 2000 && z1.box === 84000 && z1.seeds === zone.seeds && z1.follow === false && !('bubble' in z1) && !('detail' in z1) && !('window' in z1) && !('dt' in z1) && z1 !== zone && !('drag' in zone) && !('minutes' in zone));
  const before = JSON.stringify([P.DETAIL, P.FINE, P.FAST, P.SET_DEF]);
  P.spec({ minutes: 90, fine: true }, st({ nest: 4, nestBox: 40, nestFrom: 30 })); P.spec({ minutes: 90, fine: false }, st({ ground: 0 })); const f2 = P.spec({ minutes: 90, fine: true }, D); f2.detail.dx = 1; f2.box = 1;
  check('what the module holds is not changed by making specs of it or by changing one (' + (JSON.stringify([P.DETAIL, P.FINE, P.FAST, P.SET_DEF]) === before) + '), and each spec has a nest of its own (' + (P.spec({ minutes: 90, fine: true }, D).detail !== P.DETAIL) + ')',
    JSON.stringify([P.DETAIL, P.FINE, P.FAST, P.SET_DEF]) === before && P.spec({ minutes: 90, fine: true }, D).detail !== P.DETAIL && P.spec({ minutes: 90, fine: true }, D).detail.dx === 500 && P.spec({ minutes: 90, fine: false }, D) !== P.FAST);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
process.exit(failed ? 1 : 0);
