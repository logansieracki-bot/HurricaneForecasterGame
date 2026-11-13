/* Severe: ready-made drawn days (docs/severe-plan.md section 8, "presets as drawings"): each is a drawing for the analysis builder (src/severe-analysis.js) with a name, the place, the story in a
 * sentence, and the spot a Lab run starts from. Positions are km east (x) and north (y) of the drawing's centre (lat, lon), speeds m/s, pressures hPa, as the builder takes them; the objects move
 * along their `motion` arrows, so the picture at +3 h is the picture moved. Nothing here is a real day: they are the shapes forecasters know (a drawing is the large-scale truth of a hypothetical
 * day), and `tests/severe_days.mjs` checks that each one has the environment its story says (a warm sector's CAPE, its shear and helicity).
 *
 *   HFSevereDays.list            // [{ id, name, place, story, lat, lon, spot: { x, y, t }, drawing }]
 *   HFSevereDays.get(id)         // one of them (a copy that can be changed)
 *   HFSevereDays.blank(lat, lon) // a drawing with nothing on it (only the flow aloft)
 *
 * A classic script that sets `globalThis.HFSevereDays`.
 */
(function () {
  'use strict';
  const L = [
    {
      id: 'dryline', name: 'Dryline day', place: 'Southern Plains', lat: 36, lon: -98, spot: { x: 200, y: 150, t: 4 },
      story: 'A lee low in the panhandles, a dryline sharpening east of it and a cold front behind; the moist return flow feeds the warm sector, and storms fire where the dryline meets the warm front.',
      drawing: {
        base: 1013, aloft: { speed: 30, from: 250 },
        objects: [
          { type: 'low', x: -150, y: 90, depth: 15, size: 380, motion: { u: 6, v: 3.5 } },
          { type: 'front', kind: 'cold', pts: [[-150, 90], [-230, -100], [-330, -300], [-430, -500]], cold: 'right', contrast: 12, motion: { u: 7, v: -1 } },
          { type: 'dryline', pts: [[-20, -500], [-40, -300], [-70, -120], [-110, 40]], dry: 'left', contrast: 15, motion: { u: 3, v: 0 } },
          { type: 'front', kind: 'warm', pts: [[-150, 90], [30, 100], [210, 170], [420, 300]], cold: 'left', contrast: 9, motion: { u: 1.5, v: 3 } },
          { type: 'moisture', pts: [[10, -520], [40, -280], [90, -20], [190, 190]], amount: 3.5, width: 220 },
          { type: 'llj', pts: [[-10, -520], [30, -260], [80, 0], [130, 150]], speed: 20 },
          { type: 'jet', pts: [[-750, -150], [-350, 40], [50, 230], [500, 350]], speed: 30 },
          { type: 'utrough', x: -420, y: 60, speed: 20, size: 450, motion: { u: 8, v: 3 } },
        ],
      },
    },
    {
      id: 'outbreak', name: 'Tornado outbreak day', place: 'Southern Plains', lat: 35.5, lon: -96, spot: { x: 250, y: 200, t: 4 },
      story: 'A deep, fast-moving low under a negatively tilted trough, a big warm sector with a 28 m/s low-level jet and a dryline ahead of the cold front: the shear and the helicity are at their largest where the jet meets the warm front.',
      drawing: {
        base: 1012, aloft: { speed: 40, from: 240 },
        objects: [
          { type: 'low', x: -100, y: 150, depth: 24, size: 450, motion: { u: 10, v: 7 } },
          { type: 'front', kind: 'cold', pts: [[-100, 150], [-170, -50], [-250, -250], [-330, -450]], cold: 'right', contrast: 14, motion: { u: 11, v: -2 } },
          { type: 'dryline', pts: [[10, -500], [-10, -300], [-40, -120], [-80, 60]], dry: 'left', contrast: 14, motion: { u: 6, v: 0 } },
          { type: 'front', kind: 'warm', pts: [[-100, 150], [100, 170], [300, 250], [500, 380]], cold: 'left', contrast: 10, motion: { u: 2, v: 4 } },
          { type: 'moisture', pts: [[60, -520], [110, -250], [170, 0], [260, 200]], amount: 4, width: 220 },
          { type: 'llj', pts: [[40, -520], [90, -260], [150, 0], [200, 180]], speed: 28 },
          { type: 'jet', pts: [[-700, -250], [-300, -30], [100, 230], [550, 420]], speed: 40 },
          { type: 'utrough', x: -350, y: 50, speed: 30, size: 500, motion: { u: 12, v: 6 } },
        ],
      },
    },
    {
      id: 'line', name: 'Cold-front line', place: 'Mid-Mississippi Valley', lat: 38, lon: -95, spot: { x: 150, y: 150, t: 3 },
      story: 'A strong cold front racing east with a low-level jet ahead of it and a long, nearly straight hodograph: the storms line up along the front, a linear mode with damaging wind more than tornadoes.',
      drawing: {
        base: 1010, aloft: { speed: 35, from: 255 },
        air: { warm: { theta0: 299, qv0: 13.5, ml: 1000, cap: 3, capDepth: 400, rhMax: 0.95, rhDry: 0.65, ztr: 12500, thetaTr: 345 } },
        objects: [
          { type: 'low', x: -100, y: 380, depth: 20, size: 500, motion: { u: 10, v: 6 } },
          { type: 'front', kind: 'cold', pts: [[-100, 380], [-120, 150], [-150, -100], [-190, -350], [-230, -550]], cold: 'right', contrast: 14, motion: { u: 13, v: -1 } },
          { type: 'moisture', pts: [[100, -500], [110, -200], [150, 100], [250, 300]], amount: 3, width: 250 },
          { type: 'llj', pts: [[30, -500], [70, -200], [120, 100], [200, 350]], speed: 15 },
          { type: 'jet', pts: [[-700, -100], [-300, 100], [150, 300], [600, 400]], speed: 35 },
        ],
      },
    },
    {
      id: 'hail', name: 'High-plains hail day', place: 'Colorado and Nebraska', lat: 39.5, lon: -104, spot: { x: -50, y: 100, t: 4 },
      story: 'A lee trough and a short dryline under northwest flow, a surface high to the north pushing moist air up the slope: a high cloud base, steep lapse rates and a long straight hodograph make large hail.',
      drawing: {
        base: 1014, aloft: { speed: 25, from: 270 },
        air: { warm: { theta0: 304, qv0: 15.5, ml: 1500, cap: 4.5, capDepth: 500, rhMax: 0.95, rhDry: 0.8, ztr: 13000, thetaTr: 348 } },
        objects: [
          { type: 'high', x: 150, y: 450, rise: 10, size: 500, motion: { u: 3, v: -1 } },
          { type: 'trough', pts: [[-250, -350], [-230, 0], [-250, 350]], depth: 5, width: 150 },
          { type: 'dryline', pts: [[-120, -300], [-140, -50], [-170, 200]], dry: 'left', contrast: 10, motion: { u: 2.5, v: 0 } },
          { type: 'front', kind: 'stationary', pts: [[-300, 260], [0, 230], [300, 260]], cold: 'left', contrast: 7 },
          { type: 'jet', pts: [[-600, -200], [-200, 0], [200, 200], [600, 300]], speed: 20 },
        ],
      },
    },
    {
      id: 'dixie', name: 'Dixie Alley, cool season', place: 'Lower Mississippi Valley', lat: 33, lon: -90, spot: { x: -60, y: -300, t: 3 },
      story: 'A strong low-level jet and a warm front in the cool season: modest instability, very strong shear and helicity, the storms fast-moving and often hidden in rain.',
      drawing: {
        base: 1011, aloft: { speed: 38, from: 240 },
        air: { warm: { theta0: 296, qv0: 12.5, ml: 700, cap: 2.5, capDepth: 400, rhMax: 0.97, rhDry: 0.7, ztr: 11500, thetaTr: 340 } },
        objects: [
          { type: 'low', x: 50, y: 300, depth: 22, size: 450, motion: { u: 12, v: 6 } },
          { type: 'front', kind: 'cold', pts: [[50, 300], [-60, 100], [-160, -120], [-260, -350]], cold: 'right', contrast: 11, motion: { u: 10, v: -2 } },
          { type: 'front', kind: 'warm', pts: [[50, 300], [250, 300], [450, 380]], cold: 'left', contrast: 8, motion: { u: 1, v: 3 } },
          { type: 'moisture', pts: [[-50, -480], [10, -250], [90, 0], [170, 200]], amount: 2, width: 220 },
          { type: 'llj', pts: [[-60, -450], [20, -200], [100, 50], [180, 250]], speed: 30 },
          { type: 'jet', pts: [[-650, -250], [-250, 0], [150, 250], [600, 330]], speed: 40 },
          { type: 'utrough', x: -300, y: 100, speed: 30, size: 500, motion: { u: 11, v: 5 } },
        ],
      },
    },
    {
      id: 'pulse', name: 'Humid pulse-storm day', place: 'Southeast', lat: 34, lon: -86, spot: { x: -300, y: -200, t: 5 },
      story: 'A stalled front, a humid air mass and almost no wind aloft: plenty of instability and no shear, so the storms pop up, drop a burst of rain or hail or a downburst, and collapse.',
      drawing: {
        base: 1016, aloft: { speed: 8, from: 250 },
        air: { warm: { theta0: 300, qv0: 14, ml: 900, cap: 3, capDepth: 400, rhMax: 0.97, rhDry: 0.75, ztr: 13000, thetaTr: 346 } },
        objects: [
          { type: 'high', x: 300, y: -300, rise: 4, size: 700 },
          { type: 'front', kind: 'stationary', pts: [[-400, 120], [-100, 80], [200, 120], [450, 160]], cold: 'left', contrast: 5 },
          { type: 'moisture', pts: [[-300, -200], [0, -100], [300, 0]], amount: 1.5, width: 400 },
        ],
      },
    },
    {
      id: 'derecho', name: 'Derecho set-up', place: 'Upper Midwest', lat: 41, lon: -94, spot: { x: 0, y: -60, t: 5 },
      story: 'A hot, humid pool of air south of a stalled front, a 24 m/s low-level jet feeding it and strong westerlies aloft: the storms cluster and sweep along the front as a bow, with winds that reach hurricane force.',
      drawing: {
        base: 1012, aloft: { speed: 28, from: 265 },
        air: { warm: { theta0: 303, qv0: 14.5, ml: 1200, cap: 3, capDepth: 400, rhMax: 0.95, rhDry: 0.55, ztr: 13000, thetaTr: 347 } },
        objects: [
          { type: 'low', x: -300, y: 120, depth: 8, size: 300, motion: { u: 9, v: 2 } },
          { type: 'front', kind: 'stationary', pts: [[-500, 50], [-150, 60], [200, 90], [500, 130]], cold: 'left', contrast: 7, motion: { u: 0, v: 1 } },
          { type: 'moisture', pts: [[-200, -450], [-60, -200], [0, 0], [100, 100]], amount: 3, width: 250 },
          { type: 'llj', pts: [[-100, -450], [-30, -200], [30, 0], [60, 120]], speed: 24 },
          { type: 'jet', pts: [[-700, 60], [-300, 150], [150, 220], [600, 260]], speed: 30 },
        ],
      },
    },
  ];
  const copy = (o) => JSON.parse(JSON.stringify(o));
  for (const d of L) d.drawing.lat = d.lat;
  const blank = (lat, lon) => ({ id: 'blank', name: 'A blank day', place: '', lat: lat === undefined ? 36 : lat, lon: lon === undefined ? -98 : lon, spot: { x: 0, y: 0, t: 3 }, story: '', drawing: { lat: lat === undefined ? 36 : lat, base: 1013, aloft: { speed: 30, from: 255 }, objects: [] } });
  globalThis.HFSevereDays = { list: L, get: (id) => { const d = L.find((x) => x.id === id); return d ? copy(d) : null; }, blank };
})();
