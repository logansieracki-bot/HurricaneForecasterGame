// Node-only tests of the ready-made days (src/severe-days.js): each is a drawing the analysis builder takes, with a story, and the environment at its spot is what the story says (a dryline day's
// warm sector is humid, unstable and sheared and the air west of the dryline is dry; a cold front is its drawn contrast colder; a hail day has a high cloud base; a pulse day has no shear;
// a derecho day has the largest CAPE; a Dixie Alley day modest CAPE and the strongest shear and helicity), and the days are copies that can be changed without changing the list.
import '../src/severe-core.js';
import '../src/severe-sounding.js';
import '../src/severe-analysis.js';
import '../src/severe-days.js';

const D = globalThis.HFSevereDays, A = globalThis.HFSevereAnalysis, S = globalThis.HFSevereSounding;
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const t0 = Date.now();

/* 1. The list: what every day has. */
{
  const ids = D.list.map((d) => d.id), KNOWN = ['low', 'high', 'trough', 'front', 'dryline', 'outflow', 'moisture', 'jet', 'llj', 'utrough'], LINES = ['trough', 'front', 'dryline', 'outflow', 'moisture', 'jet', 'llj'];
  check('seven days with different ids (' + ids.join(', ') + ')', D.list.length === 7 && new Set(ids).size === 7 && ['dryline', 'outbreak', 'line', 'hail', 'dixie', 'pulse', 'derecho'].every((i) => ids.includes(i)));
  check('each has a name, a place, a story of a sentence or more, a place on the map in the United States, and a spot in km for the Lab with an hour (' + D.list.map((d) => d.story.length).join(', ') + ' letters of story)',
    D.list.every((d) => d.name.length > 3 && d.place.length > 3 && d.story.length > 100 && d.lat > 28 && d.lat < 47 && d.lon > -112 && d.lon < -80 && Number.isFinite(d.spot.x) && Number.isFinite(d.spot.y) && d.spot.t >= 0 && d.spot.t <= 12 && Math.abs(d.spot.x) <= 600 && Math.abs(d.spot.y) <= 500));
  check('every drawing has its latitude (the day\'s), a base pressure, the flow aloft, and objects of the known kinds: lines of two points or more, fronts with a kind and a side, drylines with a side (' + D.list.map((d) => d.drawing.objects.length).join(', ') + ' objects)',
    D.list.every((d) => d.drawing.lat === d.lat && d.drawing.base > 1000 && d.drawing.base < 1025 && d.drawing.aloft.speed > 0 && d.drawing.aloft.from >= 0 && d.drawing.aloft.from < 360 && d.drawing.objects.length >= 2 && d.drawing.objects.every((o) => KNOWN.includes(o.type)
      && (!LINES.includes(o.type) || (o.pts.length >= 2 && o.pts.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])))) && (o.type !== 'front' || (['cold', 'warm', 'stationary', 'occluded'].includes(o.kind) && ['left', 'right'].includes(o.cold)))
      && (o.type !== 'dryline' || ['left', 'right'].includes(o.dry)))));
  const g = D.get('hail'), h = D.get('hail'); g.drawing.objects.push({ type: 'low', x: 0, y: 0 }); g.drawing.base = 900; g.name = 'x';
  check('a day from get is a copy that can be changed (the list keeps its own: ' + D.list.find((d) => d.id === 'hail').drawing.objects.length + ' objects, base ' + D.list.find((d) => d.id === 'hail').drawing.base + '), an unknown id is null (' + D.get('nope') + ')',
    D.list.find((d) => d.id === 'hail').drawing.objects.length === h.drawing.objects.length && D.list.find((d) => d.id === 'hail').drawing.base === h.drawing.base && h.name !== 'x' && D.get('nope') === null);
  const b = D.blank(41.5, -93), b0 = D.blank();
  check('a blank day has no objects, the place asked for (41.5, -93: ' + b.lat + ', ' + b.lon + ') or Oklahoma (' + b0.lat + ', ' + b0.lon + '), and the analysis takes it (the flow aloft only: a uniform ' + A.create(b.drawing).pressure(0, 0, 0) + ' hPa)',
    b.drawing.objects.length === 0 && b.lat === 41.5 && b.lon === -93 && b.drawing.lat === 41.5 && b0.lat === 36 && b0.lon === -98 && A.create(b.drawing).pressure(0, 0, 0) === b.drawing.base && b.spot.t === 3);
}

/* 2. The environments the stories ask for. */
const at = {};
for (const d of D.list) { const a = A.create(d.drawing); at[d.id] = { a, s: a.surface(d.spot.x, d.spot.y, d.spot.t), ix: S.indices(a.sounding(d.spot.x, d.spot.y, d.spot.t)), d }; }
const line = (x) => (x.ix.mlcape.toFixed(0) + ' J/kg, 0-6 km shear ' + x.ix.shear06.toFixed(0) + ' m/s, SRH 0-1 km ' + x.ix.srh01.toFixed(0) + ', LCL ' + x.ix.mllcl.toFixed(0) + ' m, STP ' + x.ix.stp.toFixed(1));
{
  const X = at;
  check('the dryline day\'s spot is a big, humid, sheared warm sector (' + line(X.dryline) + ', dew point ' + X.dryline.s.Td.toFixed(1) + ' C): CAPE 2500 to 4500, shear 25 or more, STP over 3',
    X.dryline.ix.mlcape > 2500 && X.dryline.ix.mlcape < 4500 && X.dryline.ix.shear06 > 25 && X.dryline.ix.stp > 3 && X.dryline.s.Td > 20 && X.dryline.ix.mlcin > -30);
  const a = X.dryline.a, dry = a.surface(-200, -300, 0), moist = a.surface(60, -300, 0);
  check('the dryline separates dry air from moist: the dew point 200 km west of it is ' + dry.Td.toFixed(1) + ' C, 100 km east of it ' + moist.Td.toFixed(1) + ' C (at least 10 K apart), and the dry air is the hotter (' + dry.T.toFixed(1) + ' against ' + moist.T.toFixed(1) + ' C)',
    moist.Td - dry.Td > 10 && dry.T > moist.T);
  check('the outbreak day is the most tornadic, with 0-6 km shear of 38 m/s or more (' + X.outbreak.ix.shear06.toFixed(0) + '): STP ' + X.outbreak.ix.stp.toFixed(1) + ' and SRH 0-1 km ' + X.outbreak.ix.srh01.toFixed(0) + ' against the dryline day\'s ' + X.dryline.ix.stp.toFixed(1) + ' and ' + X.dryline.ix.srh01.toFixed(0) + ' and over every other day\'s (' + D.list.filter((d) => d.id !== 'outbreak').map((d) => X[d.id].ix.stp.toFixed(1)).join(', ') + ')',
    X.outbreak.ix.srh01 > 250 && X.outbreak.ix.stp > 5 && X.outbreak.ix.shear06 > 38 && D.list.every((d) => d.id === 'outbreak' || X.outbreak.ix.stp > X[d.id].ix.stp));
  const cf = X.line.a, behind = cf.surface(-400, -100, 0), ahead = cf.surface(100, -100, 0);
  check('the cold-front day: a warm sector with CAPE 1500 to 3500 and shear of 20 m/s or more at its spot (' + line(X.line) + '), and the front is its drawn 14 K colder behind (' + (behind.T - ahead.T).toFixed(2) + ' K at 400 km west against 100 km east)',
    X.line.ix.mlcape > 1500 && X.line.ix.mlcape < 3500 && X.line.ix.shear06 >= 20 && near(behind.T - ahead.T, -14, 1.5));
  check('the hail day has a high cloud base and a long hodograph: LCL ' + X.hail.ix.mllcl.toFixed(0) + ' m (over 1200, and higher than on any other day: ' + D.list.filter((d) => d.id !== 'hail').map((d) => X[d.id].ix.mllcl.toFixed(0)).join(', ') + '), CAPE ' + X.hail.ix.mlcape.toFixed(0) + ' (1500 or more), shear ' + X.hail.ix.shear06.toFixed(0) + ' m/s',
    X.hail.ix.mllcl > 1200 && X.hail.ix.mlcape > 1500 && X.hail.ix.shear06 > 25 && D.list.every((d) => d.id === 'hail' || X.hail.ix.mllcl > X[d.id].ix.mllcl));
  check('the Dixie Alley day has modest CAPE and the strongest shear: ' + line(X.dixie) + ' (CAPE 800 to 2500, shear 35 or more, SRH 0-1 km over 200)', X.dixie.ix.mlcape > 800 && X.dixie.ix.mlcape < 2500 && X.dixie.ix.shear06 > 35 && X.dixie.ix.srh01 > 200);
  check('the pulse day has CAPE and no shear: ' + line(X.pulse) + ' (shear under 10, CAPE over 1500, SRH under 50), the weakest shear of the seven (' + D.list.filter((d) => d.id !== 'pulse').map((d) => X[d.id].ix.shear06.toFixed(0)).join(', ') + ')',
    X.pulse.ix.shear06 < 10 && X.pulse.ix.mlcape > 1500 && X.pulse.ix.srh01 < 50 && D.list.every((d) => d.id === 'pulse' || X.pulse.ix.shear06 < X[d.id].ix.shear06));
  check('the derecho day has the largest CAPE of the seven (' + line(X.derecho) + ' against ' + D.list.filter((d) => d.id !== 'derecho').map((d) => X[d.id].ix.mlcape.toFixed(0)).join(', ') + ') with a moderate deep shear of 15 to 25 m/s and an STP under 5',
    X.derecho.ix.mlcape > 3500 && X.derecho.ix.shear06 > 15 && X.derecho.ix.shear06 < 25 && X.derecho.ix.stp < 5 && D.list.every((d) => d.id === 'derecho' || X.derecho.ix.mlcape > X[d.id].ix.mlcape * 0.99));
}

/* 3. The days move: the picture after some hours is the picture moved along the arrows. */
{
  const d = D.get('dryline'), low = d.drawing.objects.find((o) => o.type === 'low'), dx = low.motion.u * 3 * 3.6, dy = low.motion.v * 3 * 3.6, only = A.create({ lat: d.lat, base: d.drawing.base, aloft: d.drawing.aloft, objects: [low] });
  const p3 = only.pressure(low.x + dx, low.y + dy, 3), p3old = only.pressure(low.x, low.y, 3), want = d.drawing.base - low.depth * Math.exp(-Math.pow(Math.hypot(dx, dy) / low.size, 2));
  check('the low moves along its arrow: after 3 hours it is ' + dx.toFixed(1) + ' km east and ' + dy.toFixed(1) + ' north (the pressure there ' + p3.toFixed(3) + ' hPa, the full depth under ' + d.drawing.base + ', where it was ' + p3old.toFixed(3) + ' hPa, the Gaussian says ' + want.toFixed(3) + ')',
    near(p3, d.drawing.base - low.depth, 1e-9) && near(p3old, want, 1e-9) && dx === 64.8 && near(dy, 37.8, 1e-9));
  const wf = d.drawing.objects.find((o) => o.type === 'front' && o.kind === 'warm'), a = A.create({ lat: d.lat, base: d.drawing.base, aloft: d.drawing.aloft, objects: [wf] }), sx = a.surface(60, 150, 0).T, s8 = a.surface(60, 150, 8).T;
  check('the warm front moves north along its arrow, so a point 38 km north of it at the start (in the cool air; the front alone on the map, as the other lines move too) is in the warm air 8 hours later (' + sx.toFixed(1) + ' C at the start, ' + s8.toFixed(1) + ' C later)', wf.motion.v > 0 && s8 > sx + 4);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
process.exit(failed ? 1 : 0);
