/* Severe: the plan of a run (docs/severe-plan.md section 8): the settings of the editor's "Run a storm" card, the spec of the Lab that they make, and what a run costs. Pure, so that it is tested on its own.
 *
 *   HFSevereRunPlan.SET_DEF                 what the model does with nothing set: { ground 0.1 (m of roughness: short grass), evap 0.3 (the rain's evaporation: of the rate of a rain of small drops, what a rain of drops as large as a supercell's has; 1 until version 1.60A), rain 1 (drops sorted by size, the Lab's two-moment rain; 0: one size of drops), bubble 3 (K), nest 2 (the box's cells over the nest's: 500 m cells in a box of 1 km),
 *                                           nestBox 30 (km), nestFrom 20 (the minute the nest starts) }
 *   HFSevereRunPlan.SETS                    the rows of the card, [{ id, title, fine (only for the fine model), opts: [[value, label], ...], hint }], in the order they are shown
 *   HFSevereRunPlan.DETAIL, FINE, FAST      the nest, the fine model (a box of 108 km at 1 km, the middle 96 km recorded, and the nest) and the quick one (a box of 128 km at 2 km) as the Lab takes them (src/severe-lab.js);
 *                                           DETAIL.cost (3.1) is a model minute with the nest over a model minute of the box alone and DETAIL.boxRate (15) the box's seconds of work for one. Both boxes are steered (`steer`: the box keeps
 *                                           its storm's rotating updraft, the right mover of a storm that splits, a fifth of its width upshear of its middle, and the nest lies on that place) and have a sponge at their sides (`sponge`: 6 km of
 *                                           the fine box, which is what its pack leaves out, 8 km of the quick one), through which the left mover and the anvil leave
 *   HFSevereRunPlan.GRAUPEL                 the graupel of every run (the core's iceParams, src/severe-core.js): fewer and larger particles the more of it there is (n0gq 600 over the content, between n0gMin 1.5e6 and the core's 4e6 m-4) and a fall speed of 220 D^0.7 (small
 *                                           graupel falls slowly and is carried far, the large falls by the updraft): a core of strong echo and a long fade of weak echo downshear, as a real supercell's (docs/severe-research.md part 3)
 *   HFSevereRunPlan.changed(st, fine)       how many of the settings are not the model's own (the nest's three count for a fine run only)
 *   HFSevereRunPlan.nestFactor(st)          what the nest costs next to the 500 m nest over 30 km (1 for that one): a part that does not depend on its size (0.36: the recording of a frame every minute, the box's too) and one that does,
 *                                           its columns, (nestBox / 30)^2, times the steps it takes for each of the box's, nest / 2 of them over the 2 of the first, so (nest / 2)^3 in all. Measured in Node (the outbreak day, the box of 108 km, the nest from minute 3):
 *                                           the nest's seconds a model minute over the box's 16 were 16.4, 25.3 and 38.0 for 20, 30 and 40 km of 500 m cells (a + b w^2 with a = 9.2 s), and for cells of 333 and 250 m see docs/severe-research.md part 7
 *   HFSevereRunPlan.work(min, st)           the minutes of work of a fine run of `min` model minutes on a fast computer: 0.3 a minute for the box alone, and with the nest 0.3 + 0.52 times its factor (0.82 for the 500 m nest over 30 km, which
 *                                           is 3.1 times the box's: 15.6 and 37 s a minute in the first minutes and 48 in a mature storm, docs/severe-research.md part 7)
 *   HFSevereRunPlan.timeText(mins)          'about 65 minutes', or in hours, in halves, from 2 hours
 *   HFSevereRunPlan.spec(o, st)             the spec of a run for runStorm: o = { minutes, fine, zone }, `zone` the quick model's box and seeds of an initiation zone ({ dx, box, seeds, follow: false }) or null; the ground (`drag`), the rain (`evap`, `twoMoment`)
 *                                           and the graupel (`iceParams`, a copy of GRAUPEL) go with every run, the bubble with all but a zone's (it has its own seeds), the nest with a fine one
 *
 * A classic script that sets `globalThis.HFSevereRunPlan`.
 */
(function () {
  'use strict';

  const SET_DEF = { ground: 0.1, evap: 0.3, rain: 1, bubble: 3, nest: 2, nestBox: 30, nestFrom: 20 };
  const SETS = [
    { id: 'ground', title: 'Ground', opts: [[0, 'None'], [0.03, 'Smooth'], [0.1, 'Grass'], [0.3, 'Crops'], [1, 'Trees']], hint: 'A drag on the lowest wind, by the roughness of the ground (grass is 0.1 m). With some, a storm\'s hook is sharper and curls more; with none the floor is free-slip.' },
    { id: 'evap', title: 'Rain evaporation', opts: [[1, 'Full'], [0.5, 'Half'], [0.3, 'Light']], hint: 'How fast falling rain dries in the air below the storm, which sets how cold its pool of outflow is. Light (the model\'s own) is for the large drops of a supercell\'s rain, which dry slowly: the outflow is a few degrees colder than the air it meets. Full is the rate of a rain of small drops: an outflow nine or ten degrees colder, with new storms going up all along its edge.' },
    { id: 'rain', title: 'Rain drops', opts: [[0, 'One size'], [1, 'Sorted by size']], hint: 'How the rain\'s drops are sized. Sorted by size (the model\'s own) follows the number of drops as well as their mass, so the big ones fall first and the small ones are left behind the shower: more weak echo round a strong core, a longer fade at its edges and more hooks and fingers, at about the same cost. One size gives every drop of a given mass the same size and a harder edge.' },
    { id: 'bubble', title: 'Warm bubble', opts: [[2, '2 K'], [3, '3 K'], [4, '4 K'], [5, '5 K']], hint: 'The warm bubble that starts the storm at the spot (3 K is the usual one). A day on the edge of a storm may need more; more starts a stronger first storm.' },
    { id: 'nest', title: 'Nest cells', fine: true, opts: [[2, '500 m'], [3, '333 m'], [4, '250 m']], hint: 'Cells of the second model inside the first. Finer cells show a hook\'s detail and cost much more: 333 m about two and a half times the nest\'s work, 250 m about five and a half.' },
    { id: 'nestBox', title: 'Nest width', fine: true, opts: [[20, '20 km'], [30, '30 km'], [40, '40 km']], hint: 'How wide the nest is, round the storm. A wider one holds more of the storm\'s edges and costs by its area.' },
    { id: 'nestFrom', title: 'Nest starts', fine: true, opts: [[10, 'minute 10'], [20, 'minute 20'], [30, 'minute 30']], hint: 'The minute the nest starts, once the storm has an updraft. An earlier nest follows the storm from nearer its start and costs more of the run.' },
  ];
  const DETAIL = { dx: 500, box: 30000, from: 20, ztop: 8000, every: 1, cost: 3.1, boxRate: 15 }, FINE = { dx: 1000, dt: 5, box: 108000, window: 96000, steer: true, sponge: 6000, detail: DETAIL }, FAST = { box: 128000, steer: true, sponge: 8000 };
  const GRAUPEL = { n0gq: 600, n0gMin: 1.5e6, vga: 220, vgb: 0.7 };

  const changed = (st, fine) => Object.keys(SET_DEF).filter((k) => st[k] !== SET_DEF[k] && !(!fine && /^nest/.test(k))).length;
  const FIXED = 0.36, nestFactor = (st) => FIXED + (1 - FIXED) * Math.pow(st.nestBox / 30, 2) * Math.pow(st.nest / 2, 3);
  const work = (min, st) => Math.min(min, st.nestFrom) * 0.3 + Math.max(0, min - st.nestFrom) * (0.3 + 0.52 * nestFactor(st));
  const timeText = (mins) => (mins >= 120 ? 'about ' + (Math.round(mins / 30) / 2) + ' hours' : 'about ' + mins + ' minutes');
  function spec(o, st) {
    const out = { minutes: o.minutes, drag: st.ground, evap: st.evap, twoMoment: st.rain === 1, iceParams: Object.assign({}, GRAUPEL) };
    if (o.zone) return Object.assign(out, o.zone);
    out.bubble = st.bubble;
    if (!o.fine) return Object.assign(out, FAST);
    return Object.assign(out, FINE, { detail: Object.assign({}, DETAIL, { dx: FINE.dx / st.nest, box: st.nestBox * 1000, from: st.nestFrom, cost: 1 + (DETAIL.cost - 1) * nestFactor(st) }) });
  }

  globalThis.HFSevereRunPlan = { SET_DEF, SETS, DETAIL, FINE, FAST, GRAUPEL, changed, nestFactor, work, timeText, spec };
})();
