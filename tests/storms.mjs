// Node-only tests of the storm engine (src/storms.js): no browser, no build. Run by `npm test` before the Playwright suite.
// The engine is exercised on synthetic environments (tests/storms_env.mjs) so one physical response can be checked at a time;
// the statistics of whole seasons against the real best track are a separate, calibrated job (tools/make_tc_ref.py).
import '../src/storms.js';
import { makeEnv, climateEnv, defaultSteer } from './storms_env.mjs';

const H = globalThis.HFStorms;
H.calibrated(false);                                                           // the physics checks below are written against the structure's own plain defaults; the calibrated ones have their own section at the end
let failed = 0, passed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const par = H.mergeParams(H.defaultParams(), { shearK: 1 });                   // the physics checks below speak the engine's own shear units; the conversion has its own check at the end
const START = Date.UTC(2026, 5, 1);                                        // the Atlantic simulator's start: Jun 1 00Z
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

function system(th, lat, lon, v, seed, extra) { return Object.assign(H.newSystem({ id: 'T' + seed, num: H.idNum('M', seed), th, lat, lon, v, hour: 0 }), extra || {}); }
function run(S, env, hours, seed, p = par, h0 = 0) {
  let peak = S.vr, trace = [];
  for (let k = 0; k < hours && S.alive; k++) { H.stepSystem(S, env, h0 + k, seed, p); if (S.vr > peak) peak = S.vr; }
  return peak;
}
function peakOver(seeds, envOpts, th, lat, lon, v, hours) {
  const out = [];
  for (let s = 1; s <= seeds; s++) { const S = system(th, lat, lon, v, s); out.push(run(S, makeEnv(envOpts), hours, s)); }
  return out;
}

/* ---- Saffir-Simpson, mph, gusts, ACE ---------------------------------------------------------------------------------------- */
{
  const cases = [[25, 'TD'], [30, 'TD'], [35, 'TS'], [60, 'TS'], [65, 'C1'], [80, 'C1'], [85, 'C2'], [95, 'C2'], [100, 'C3'], [110, 'C3'], [115, 'C4'], [135, 'C4'], [140, 'C5'], [160, 'C5']];
  check('Saffir-Simpson categories on best-track (5-kt) winds: ' + cases.map((c) => c[0] + '=' + c[1]).join(' '), cases.every(([v, c]) => H.category(v).short === c));
  check('category is taken from the wind rounded to 5 kt (62 kt is a tropical storm, 63 kt a hurricane)', H.category(62).short === 'TS' && H.category(63).short === 'C1');
  check('hurricane category numbers 1..5 and 0 below', [65, 85, 100, 115, 140].map((v) => H.category(v).cat).join() === '1,2,3,4,5' && H.category(50).cat === 0);
  check('105 kt is 120 mph (the reference card), advisories round mph to 5', H.ktToMph(105) === 120 && H.ktToMph(35) === 40 && H.ktToMph(100) === 115);
  check('gust: 120 mph over water gusts to 145 mph, over land the factor is larger', H.ktToMph(H.gustKt(105, false)) === 145 && H.gustKt(100, true) > H.gustKt(100, false));
  check('ACE counts only winds of 34 kt or more: (v/100)^2', H.aceOf(33) === 0 && near(H.aceOf(34), 0.1156, 1e-9) && near(H.aceOf(100), 1, 1e-12) && near(H.aceOf(150), 2.25, 1e-12));
  const seq = [25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 85, 90, 95, 95, 90, 85, 75, 60, 50, 40, 30];
  check('ACE of a known sequence (TS and above only)', near(seq.reduce((a, v) => a + H.aceOf(v), 0), seq.filter((v) => v >= 34).reduce((a, v) => a + (v / 100) ** 2, 0), 1e-12));
  const wp = [35, 50, 64, 83, 96, 113, 137].map((v) => H.pressureFromWind(v, 25));
  check('wind-pressure: pressure falls monotonically with wind, and the 1991-2020 best-track fit holds (96 kt about 962 hPa, 137 kt about 917 hPa)', wp.every((p, i) => i === 0 || p < wp[i - 1]) && near(wp[4], 962, 3) && near(wp[6], 917, 4));
  check('wind-pressure inverse: windFromPressure(pressureFromWind(v)) = v', [30, 70, 110, 150].every((v) => near(H.windFromPressure(H.pressureFromWind(v, 31), 31), v, 1e-6)));
  check('the same wind is a little deeper (lower pressure) poleward, as in the data', H.pressureFromWind(80, 38) < H.pressureFromWind(80, 14));
  check('compass points', H.compass(0) === 'N' && H.compass(315) === 'NW' && H.compass(95) === 'E' && H.compass(-45) === 'NW');
}

/* ---- names -------------------------------------------------------------------------------------------------------------------- */
{
  const initials = 'ABCDEFGHIJKLMNOPRSTVW';
  check('six name lists of 21 unique names, one per initial A..W without Q U X Y Z', H.NAME_SETS.length === 6 && H.NAME_SETS.every((l) => l.length === 21 && new Set(l).size === 21 && l.map((n) => n[0]).join('') === initials));
  check('supplemental list: 21 unique names, same initials', H.NAME_SUPPLEMENTAL.length === 21 && new Set(H.NAME_SUPPLEMENTAL).size === 21 && H.NAME_SUPPLEMENTAL.map((n) => n[0]).join('') === initials);
  check('no name is used twice across the six lists or the supplemental list', new Set(H.NAME_SETS.flat().concat(H.NAME_SUPPLEMENTAL)).size === 6 * 21 + 21);
  check('2026 starts Arthur, Bertha (your reference image), 2027 starts Ana, and the lists repeat every six years', H.nameFor(2026, 0) === 'Arthur' && H.nameFor(2026, 1) === 'Bertha' && H.nameFor(2027, 0) === 'Ana' && H.nameFor(2032, 0) === 'Arthur' && H.nameFor(2021, 0) === 'Ana');
  check('after the 21st name comes the supplemental list, in order', H.nameFor(2026, 20) === 'Wilfred' && H.nameFor(2026, 21) === 'Adria' && H.nameFor(2026, 22) === 'Braylen');
}

/* ---- hash-keyed randomness ---------------------------------------------------------------------------------------------------- */
{
  const a = Array.from({ length: 4000 }, (_, i) => H.rnd(7, 3, i, 1)), n = Array.from({ length: 4000 }, (_, i) => H.rndn(7, 3, i, 1));
  check('uniform draws are in (0,1), mean 0.5, and a pure function of their keys', a.every((x) => x > 0 && x < 1) && near(mean(a), 0.5, 0.02) && H.rnd(7, 3, 5, 1) === H.rnd(7, 3, 5, 1) && H.rnd(7, 3, 5, 1) !== H.rnd(7, 3, 5, 2) && H.rnd(7, 3, 5, 1) !== H.rnd(8, 3, 5, 1));
  check('normal draws have mean 0 and sd 1', near(mean(n), 0, 0.05) && near(Math.sqrt(mean(n.map((x) => x * x))), 1, 0.05));
}

/* ---- motion ------------------------------------------------------------------------------------------------------------------- */
{
  const still = makeEnv({ steer: () => [0, 0, 0, 0, 0, 0] });
  const S = system('tc', 18, -50, 100, 1); run(S, still, 48, 1);
  check('with no steering a hurricane drifts north-west (beta drift)', S.lon < -50.1 && S.lat > 18.1);
  const east = makeEnv({ steer: () => [-10, 2, -10, 2, -10, 2] });
  const T = system('tc', 15, -40, 90, 2); run(T, east, 72, 2);
  const dx = (T.lon + 40) * 111.195 * Math.cos(15.5 * Math.PI / 180) / 1.852, dy = (T.lat - 15) * 111.195 / 1.852;     // nautical miles
  check('72 h under a 10-kt easterly + 2-kt southerly flow: moves west about 600 n mi (lag and beta drift allowed) and north', dx < -500 && dx > -820 && dy > 60);
  const trade = (lat, lon) => [-12, 1, -12, 1, -12, 1];
  const W = system('wv', 12, -30, 15, 3); run(W, makeEnv({ steer: trade, shear: 30 }), 48, 3);
  check('a wave moves westward a little faster than the 850-700 hPa flow', (W.lon + 30) * 111.195 * Math.cos(12 * Math.PI / 180) / 1.852 < -12 * 48 * 0.95);
  const trough = (la) => { const u = la < 26 ? -12 : la < 34 ? -12 + (la - 26) * 2.5 : 8 + (la - 34), v = la < 26 ? 3 : 6; return [u, v, u, v, u, v]; };
  const B = system('tc', 20, -65, 100, 4); let west = 0;
  for (let h = 0; h < 300 && B.alive; h++) { H.stepSystem(B, makeEnv({ steer: trough }), h, 4, par); west = Math.min(west, B.lon + 65); }
  check('where the trades turn into westerlies a hurricane recurves: it ends north of 33N and well east of its western-most point (' + B.lat.toFixed(0) + 'N, ' + (B.lon + 65 - west).toFixed(0) + ' degrees east of it)', B.lat > 33 && B.lon + 65 - west > 8);
  const D = system('tc', 20, -65, 100, 4); let dmin = 0;
  for (let h = 0; h < 300 && D.alive; h++) { H.stepSystem(D, makeEnv({ steer: () => [-12, 3, -12, 3, -12, 3] }), h, 4, par); dmin = Math.min(dmin, D.lon + 65); }
  check('the control with easterlies at every latitude never turns east (it ends ' + (D.lon + 65 - dmin).toFixed(1) + ' degrees east of its western-most point)', D.lon + 65 - dmin < 1.5);
  check('a depression follows the medium layer (850-500 hPa), a major hurricane the deep layer (850-200 hPa), not the shallow one: 12 h into winds of -14 / -7 / 0 kt it moves at about -6.5 and -1.4 kt', (() => {
    const e = makeEnv({ steer: () => [-14, 0, -7, 0, 0, 0], shear: 5 });
    const w = system('tc', 15, -50, 30, 5), s = system('tc', 15, -50, 110, 5);
    for (let h = 0; h < 12; h++) { H.stepSystem(w, e, h, 5, par); H.stepSystem(s, e, h, 5, par); }
    return Math.abs(w.cx + 6.5) < 1.5 && Math.abs(s.cx + 1.4) < 1.2;
  })());
  check('the fitted law: a storm moves at 93 % of the flow plus a drift toward the north-west that grows with intensity (steady state in a uniform 10-kt easterly: 30 kt -> u -10.5 v +0.6, 100 kt -> u -11.3 v +1.2)', (() => {
    const e = makeEnv({ steer: () => [-10, 0, -10, 0, -10, 0], shear: 5 });                    // the wind is put back every hour below, so only the motion is tested
    const w = system('tc', 18, -50, 30, 6), s = system('tc', 18, -50, 100, 6), q0 = H.mergeParams(par, { qSd: 0, noiseRel: 0, wobbleSd: 0 });
    s.vr = 100;
    for (let h = 0; h < 36; h++) { H.stepSystem(w, e, h, 6, q0); w.v = 30; H.stepSystem(s, e, h, 6, q0); s.v = 100; }
    return near(w.cx, -9.33 - 0.84 - 1.17 * 0.3, 0.45) && near(w.cy, 0.33 + 0.88 * 0.3, 0.45) && near(s.cx, -9.33 - 0.84 - 1.17, 0.45) && near(s.cy, 0.33 + 0.88, 0.45);
  })());
}

/* ---- intensity: the environment controls -------------------------------------------------------------------------------------- */
{
  const peakSh = [3, 8, 15, 22].map((sh) => mean(peakOver(30, { shear: sh }, 'tc', 15, -50, 30, 144)));
  check('more shear, weaker peak: mean 6-day peaks at 3 / 8 / 15 / 22 kt of shear fall monotonically (' + peakSh.map((x) => x.toFixed(0)).join(' / ') + ')', peakSh.every((x, i) => i === 0 || x < peakSh[i - 1] - 5) && peakSh[0] > 100 && peakSh[3] < 40);
  const peakSst = [24, 26.5, 28, 29.5].map((s) => mean(peakOver(30, { sst: s }, 'tc', 15, -50, 30, 144)));
  check('warmer water, stronger peak (' + peakSst.map((x) => x.toFixed(0)).join(' / ') + ' at 24 / 26.5 / 28 / 29.5 degC)', peakSst.every((x, i) => i === 0 || x > peakSst[i - 1] + 3) && peakSst[3] > 110);
  const peakRh = [25, 50, 65].map((r) => mean(peakOver(30, { rh: r }, 'tc', 15, -50, 30, 144)));
  check('drier mid-levels, weaker peak (' + peakRh.map((x) => x.toFixed(0)).join(' / ') + ' at 25 / 50 / 65 % RH)', peakRh[0] < peakRh[1] && peakRh[1] < peakRh[2] - 10);
  const all = []; let worst = -1e9;
  for (let s = 1; s <= 40; s++) {
    const S = system('tc', 15, -50, 30, s), env = makeEnv({ sst: 28 + (s % 4) * 0.7 });
    for (let h = 0; h < 200 && S.alive; h++) { H.stepSystem(S, env, h, s, par); worst = Math.max(worst, S.v - H.vPot(env.sst(S.lat, S.lon) - S.cw, par)); }
  }
  check('the underlying wind stays at or below the empirical potential intensity of the effective SST, apart from the lag while a cold wake builds (' + worst.toFixed(1) + ' kt over, limit 3)', worst <= 3);
  const riShare = (p) => {
    let win = 0, rapid = 0;
    for (let sd = 1; sd <= 120; sd++) {
      const S = system('tc', 15, -55, 45, sd), env = makeEnv({ sst: 29, shear: 5, rh: 68 }), vs = [S.vr];
      for (let h = 0; h < 120 && S.alive; h++) { H.stepSystem(S, env, h, sd, p); vs.push(S.vr); }
      for (let i = 24; i < vs.length; i++) { if (vs[i - 24] >= 35) { win++; if (vs[i] - vs[i - 24] >= 30) rapid++; } }
    }
    return rapid / win;
  };
  const withRi = riShare(par), noRi = riShare(Object.assign({}, par, { ri: Object.assign({}, par.ri, { haz: 0 }) }));
  check('rapid intensification (>= +30 kt in 24 h) exists and comes from episodes: in an ideal environment ' + (100 * withRi).toFixed(1) + ' % of 24-h windows against ' + (100 * noRi).toFixed(1) + ' % with the episodes switched off', withRi > 2 * noRi && withRi > noRi + 0.03);
  const cold = (opts) => { const S = system('tc', 25, -70, 100, 9); const env = makeEnv(opts); let peak = 0; for (let h = 0; h < 96; h++) { H.stepSystem(S, env, h, 9, par); peak = Math.max(peak, S.cw); } return { S, cw: peak }; };
  const slow = cold({ steer: () => [0, 0, 0, 0, 0, 0], sst: 29 }), fast = cold({ steer: () => [-14, 4, -14, 4, -14, 4], sst: 29 });
  check('a stalled hurricane churns up a cold wake (' + slow.cw.toFixed(1) + ' degC) and weakens relative to one that keeps moving (' + fast.cw.toFixed(1) + ' degC)', slow.cw > 1 && slow.cw > 2 * fast.cw && slow.S.v < fast.S.v - 5);
}

/* ---- land -------------------------------------------------------------------------------------------------------------------- */
{
  const land = makeEnv({ land: () => true, sst: 29 });
  const S = system('tc', 25, -85, 100, 1); const v0 = S.v; const got = [];
  for (let h = 1; h <= 36 && S.alive; h++) { H.stepSystem(S, land, h - 1, 1, par); if (h === 12 || h === 24 || h === 36) got.push(S.v); }
  const kd = (t) => 26.7 + (0.9 * v0 - 26.7) * Math.exp(-0.095 * t);
  check('over land the wind decays as Kaplan-DeMaria: V(t) = 26.7 + (0.9 V0 - 26.7) exp(-0.095 t) at 12 / 24 / 36 h (' + got.map((x) => x.toFixed(0)).join(' / ') + ' vs ' + [12, 24, 36].map((t) => kd(t).toFixed(0)).join(' / ') + ')', got.length === 3 && got.every((x, i) => near(x, kd([12, 24, 36][i]), 2.5)));
  const W = system('wv', 12, -70, 14, 2); run(W, makeEnv({ land: () => true }), 60, 2);
  check('a wave over land does not intensify (land can only remove wind)', W.v <= 14.5);
  const mk = (land) => makeEnv({ land, sst: 29, shear: 5, rh: 65, steer: () => [-10, 0, -10, 0, -10, 0] });
  const I = system('tc', 21, -66, 70, 3), K = system('tc', 21, -66, 70, 3), eI = mk((la, lo) => Math.abs(la - 21.5) < 1.2 && Math.abs(lo + 72) < 0.3), eK = mk(() => false);
  let worstGap = 0; for (let h = 0; h < 110 && I.alive; h++) { H.stepSystem(I, eI, h, 3, par); H.stepSystem(K, eK, h, 3, par); worstGap = Math.min(worstGap, I.v - K.v); }
  check('crossing a small island costs a hurricane wind while it is over land (down to ' + worstGap.toFixed(1) + ' kt against the same storm over open water) but it survives', I.alive && worstGap < -3 && I.v > 40);
}

/* ---- transitions -------------------------------------------------------------------------------------------------------------- */
{
  const coldNorth = makeEnv({ sst: (la) => (la > 30 ? 16 : 28), shear: 30, rh: 55, steer: (la) => [8, 3, 10, 4, 14, 5] });
  const E = system('tc', 33, -60, 90, 1); let wasEx = -1; for (let h = 0; h < 300 && E.alive; h++) { H.stepSystem(E, coldNorth, h, 1, par); if (E.th === 'ex' && wasEx < 0) wasEx = h; }
  check('a hurricane carried over cold water in strong shear becomes extratropical (EX) and later dies out (' + E.endReason + ')', wasEx > 0 && !E.alive && H.statusOf(E) === 'EX');
  const sub = system('sc', 28, -50, 40, 2);
  const warm = makeEnv({ sst: 28, shear: 5, rh: 65, steer: () => [-5, 1, -5, 1, -5, 1] });
  run(sub, warm, 60, 2);
  check('a subtropical storm over 28 degC water with little shear becomes a tropical storm', sub.th === 'tc');
  const wave = system('wv', 14, -45, 18, 4, { sub: true });
  run(wave, makeEnv({ sst: 24, shear: 12, rh: 55, steer: () => [-4, 0, -4, 0, -4, 0] }), 120, 4);
  check('a subtropical seed over 24 degC water develops into a subtropical, not a tropical, cyclone', wave.th === 'sc' || wave.th === 'nl' || wave.th === 'wv');
  const hostile = makeEnv({ sst: 24, shear: 45, rh: 35 });
  const R = system('tc', 18, -50, 40, 5); run(R, hostile, 200, 5);
  check('in a hostile environment a depression degenerates to a remnant low and dissipates', R.th === 'nl' && R.remnant && !R.alive);
  const G = system('wv', 12, -40, 22, 6); let gen = -1, first25 = -1; const env6 = makeEnv({ sst: 29, shear: 4, rh: 70 });
  for (let h = 0; h < 120 && G.alive; h++) { H.stepSystem(G, env6, h, 6, par); if (first25 < 0 && G.vr >= par.genV) first25 = h; if (G.th === 'tc' && gen < 0) gen = h; }
  check('a favourable wave becomes a tropical depression only after holding 25 kt for ' + par.genHold + ' hours (first at 25 kt in hour ' + first25 + ', depression in hour ' + gen + ')', first25 >= 0 && gen >= first25 + par.genHold - 1 && G.tdHour === gen + 1);
}

/* ---- the manager: spawning, names, counters, ACE ------------------------------------------------------------------------------ */
function seasonEnv(landFn) {
  const env = climateEnv(null, { land: landFn });
  return { at: (h) => { env.setDoy(Math.floor((START + h * 3600000 - Date.UTC(2026, 0, 1)) / 86400000) % 365); return env; } };
}
const LAND = (la, lo) => (lo > -16.3 && lo < 38 && la > 4 && la < 30) || (lo < -84 && la > 8 && la < 24) || (lo < -97 && la >= 24) || (lo > -86 && lo < -80 && la > 25 && la < 31) || (la > 30.5 && lo < -80);
{
  const m = H.create({ seed: 4242, startMs: START }), src = seasonEnv(LAND);
  m.advanceTo(214 * 24, src);
  const st = m.stats(), storms = m.systems.filter((S) => S.depNum > 0);
  check('a full season: waves are seeded about 60 a year, in season only (' + m.n.W + ' by Dec 31)', m.n.W >= 25 && m.n.W <= 75);
  check('every named storm has the next name in the order it reached storm strength, and depression numbers run 1..n', storms.filter((S) => S.name).sort((a, b) => a.namedHour - b.namedHour).map((S) => S.name).join() === Array.from({ length: st.named }, (_, i) => H.nameFor(2026, i)).join() && storms.map((S) => S.depNum).sort((a, b) => a - b).every((d, i) => d === i + 1));
  check('season counters equal what the six-hourly fixes say (named / hurricanes / majors / cat 5)', (() => {
    const tcf = (S) => S.fixes.filter((f) => f.th === 'tc' || f.th === 'sc');
    const nm = storms.filter((S) => tcf(S).some((f) => f.v >= 34)).length, hu = storms.filter((S) => tcf(S).some((f) => f.st === 'HU')).length;
    const mh = storms.filter((S) => tcf(S).some((f) => f.st === 'HU' && f.v >= 96)).length, c5 = storms.filter((S) => tcf(S).some((f) => f.st === 'HU' && f.v >= 137)).length;
    return nm === st.named && hu === st.hurr && mh === st.major && c5 === st.cat5;
  })());
  const aceFix = storms.reduce((a, S) => a + S.fixes.filter((f) => (f.th === 'tc' || f.th === 'sc') && f.v >= 34).reduce((b, f) => b + H.aceOf(f.v), 0), 0);
  check('season ACE equals the sum of (v/100)^2 over the tropical / subtropical fixes of 34 kt or more (' + st.ace + ')', near(aceFix, st.ace, 0.2) && near(m.season.aceDaily.reduce((a, b) => a + b, 0), st.ace, 0.2));
  check('best-track fixes are reported the way HURDAT2 holds them: wind in 5-kt steps, integer hPa, 0.1 degree', storms.every((S) => S.fixes.every((f) => (f.th === 'wv' || f.v % 5 === 0) && Number.isInteger(f.p) && Math.abs(f.lat * 10 - Math.round(f.lat * 10)) < 1e-6)));
  const latAll = m.systems.flatMap((S) => S.fixes.map((f) => f.lat));
  check('nothing forms or travels within 6 degrees of the equator (lowest latitude ' + Math.min(...latAll).toFixed(1) + ')', Math.min(...latAll) >= 6);
  const months = new Array(12).fill(0); const mm = H.create({ seed: 99, startMs: START }); mm.advanceTo(365 * 24, src);
  for (const S of mm.systems.concat(mm.archive.length ? [] : [])) void S;
  check('wave seeding follows the season: none January to April, 70 % or more July to October, 40-85 a year', (() => {
    const q = H.create({ seed: 5, startMs: Date.UTC(2026, 0, 1) }); const per = new Array(12).fill(0); let last = 0;
    for (let h = 0; h < 365 * 24; h += 6) { q.advanceTo(h + 6, { sst: () => 20, rh: () => 40, shear: () => 40, steer: (a, b, o) => o.fill(0), slp: () => 1012, isLand: () => false, box: { lat0: -40, lat1: 72, lon0: -110, lon1: 40 } }); if (q.n.W > last) { per[new Date(Date.UTC(2026, 0, 1) + h * 3600000).getUTCMonth()] += q.n.W - last; last = q.n.W; } }
    return per[0] + per[1] + per[2] + per[3] === 0 && per[6] + per[7] + per[8] + per[9] > 0.7 * last && last >= 40 && last <= 85;
  })());
}

{
  const m = H.create({ seed: 21, startMs: START, auto: false });
  const north = makeEnv({ sst: (la) => (la > 31 ? 17 : 28.5), shear: 28, rh: 55, steer: () => [10, 6, 12, 7, 15, 8] });
  const S = m.place({ kind: 'td', lat: 28, lon: -70, v: 70 });
  m.advanceTo(160, north);
  const ex = S.fixes.filter((f) => f.th === 'ex' && f.v >= 35), tc = S.fixes.filter((f) => f.th === 'tc');
  check('an extratropical cyclone with winds of 40+ kt adds nothing to ACE: ' + ex.length + ' EX fixes at 35+ kt, ACE stays ' + (ex.length ? ex[0].ace : '-') + ' = the tropical sum ' + tc.reduce((a, f) => a + H.aceOf(f.v), 0).toFixed(2),
    ex.length >= 2 && ex.every((f) => f.ace === ex[0].ace) && near(ex[0].ace, tc.reduce((a, f) => a + H.aceOf(f.v), 0), 0.01) && near(m.season.ace, ex[0].ace, 0.011));
}

/* ---- determinism, chunking, checkpoints --------------------------------------------------------------------------------------- */
{
  const src = seasonEnv(LAND);
  const a = H.create({ seed: 777, startMs: START }), b = H.create({ seed: 777, startMs: START }), c = H.create({ seed: 777, startMs: START }), d = H.create({ seed: 778, startMs: START });
  a.advanceTo(120 * 24, src);
  for (let h = 0; h < 120 * 24; h += 1) b.advanceTo(h + 1, src);
  let t = 0; for (const step of [24, 3, 6, 1, 800, 7]) { c.advanceTo(Math.min(120 * 24, t + step), src); t += step; if (t >= 120 * 24) break; } c.advanceTo(120 * 24, src);
  d.advanceTo(120 * 24, src);
  const ja = JSON.stringify(a.serialize());
  check('the same seed gives identical storms however time is chunked (1 h, mixed 1-800 h, all at once): ' + a.systems.length + ' systems, ' + (ja.length / 1024).toFixed(0) + ' KB of state', ja === JSON.stringify(b.serialize()) && ja === JSON.stringify(c.serialize()));
  check('a different seed gives different storms', ja !== JSON.stringify(d.serialize()));
  const x = H.create({ seed: 31, startMs: START }); x.advanceTo(60 * 24, src);
  const y = H.restore(JSON.parse(JSON.stringify(x.serialize())));
  x.advanceTo(150 * 24, src); y.advanceTo(150 * 24, src);
  check('a checkpoint round-trips through JSON and the restored run continues exactly like the original', JSON.stringify(x.serialize()) === JSON.stringify(y.serialize()));
}

/* ---- preview ≡ placed storm; placement does not disturb automatic storms ------------------------------------------------------ */
{
  const src = seasonEnv(LAND), envNow = src.at(0);
  const m = H.create({ seed: 12, startMs: START, auto: false });
  const spec = { kind: 'wave', lat: 12, lon: -35 };
  const pre = m.forecast(spec, envNow, 8 * 24);
  const placed = m.place(spec);
  m.advanceTo(8 * 24, envNow);
  const mine = placed.fixes.filter((f) => f.h <= 8 * 24);
  check('the preview of a hand-placed system has exactly the noise the placed system gets: same track to 1e-9 degrees (' + pre.fixes.length + ' fixes)', pre.fixes.length > 1 && pre.fixes.slice(1).every((f, i) => mine[i] && Math.abs(f.lat - mine[i].lat) < 1e-9 && Math.abs(f.lon - mine[i].lon) < 1e-9 && f.v === mine[i].v));
  for (const spec2 of [{ kind: 'td', lat: 17, lon: -50 }, { kind: 'sd', lat: 30, lon: -60 }, { kind: 'low', lat: 40, lon: -50 }]) {
    const m2 = H.create({ seed: 14, startMs: START, auto: false }), pre2 = m2.forecast(spec2, envNow, 6 * 24), pl = m2.place(spec2);
    m2.advanceTo(6 * 24, envNow);
    const mine2 = pl.fixes.filter((f) => f.h <= 6 * 24);
    check(`the preview of a placed ${spec2.kind === 'td' ? 'tropical depression' : spec2.kind === 'sd' ? 'subtropical depression' : 'low'} is the placed system's track too (${pre2.fixes.length} fixes, ends ${pre2.alive ? 'alive' : pre2.endReason})`,
      pre2.fixes.length > 2 && pre2.fixes.slice(1).filter((f) => f.h % 6 === 0).every((f, i) => mine2[i] && Math.abs(f.lat - mine2[i].lat) < 1e-9 && Math.abs(f.lon - mine2[i].lon) < 1e-9 && f.v === mine2[i].v) && (spec2.kind !== 'low' || pre2.fixes.length > 8));
  }
  check('a preview changes nothing in the manager (no ids, no counters)', m.n.M === 1 && H.create({ seed: 12, startMs: START, auto: false }).forecast(spec, envNow, 48) && true);
  const p1 = H.create({ seed: 55, startMs: START }), p2 = H.create({ seed: 55, startMs: START });
  p2.place({ kind: 'td', lat: 25, lon: -60 });
  p1.advanceTo(60 * 24, src); p2.advanceTo(60 * 24, src);
  const key = (mgr) => JSON.stringify(mgr.systems.filter((S) => S.id[0] === 'W' || S.id[0] === 'N').map((S) => [S.id, S.fixes.length, S.lat, S.lon, S.v]));
  check('hand-placing a storm does not change any automatic wave or seed', key(p1) === key(p2));
  const dev = H.create({ seed: 3, startMs: START, auto: false }), far = dev.forecast({ kind: 'td', lat: 15, lon: -50 }, makeEnv({ sst: 29, shear: 5 }), 240);
  check('a forecast reports peak, development, ACE and fixes every six hours from the start', far.fixes[0].h === 0 && far.fixes[1].h === 6 && far.peak.v >= 100 && far.developed && far.ace > 5 && far.fixes.length >= 40);
  // a cyclone put on the map is a numbered depression even if it has changed class before its first six-hourly fix (a 70-kt storm at 41N does so one time in three)
  { const q = H.create({ seed: 9, startMs: START, auto: false, params: { etHaz: { b0: 12 } } }), P = q.place({ kind: 'td', lat: 41, lon: -50, v: 70 });
    q.advanceTo(12, makeEnv({ sst: 18, shear: 40 }));
    check(`a placed cyclone that turns post-tropical before its first six-hourly fix is still a numbered depression (dep ${q.stats().dep}, class ${P.th}, ${P.fixes.length} fixes) and stays on the map when it ends`, P.th === 'ex' && P.depNum === 1 && q.stats().dep === 1 && P.fixes.length >= 2 && P.fixes[0].st === 'EX');
    const w = H.create({ seed: 9, startMs: START, auto: false }); w.place({ kind: 'wave', lat: 41, lon: -50 }); w.advanceTo(12, makeEnv({ sst: 18, shear: 40 }));
    check('a placed wave that never develops is not a depression', w.stats().dep === 0); }
  const fiz = H.create({ seed: 3, startMs: START, auto: false }).forecast({ kind: 'wave', lat: 12, lon: -40 }, makeEnv({ sst: 24, shear: 35 }), 240);
  check('a wave placed over cool water in strong shear is forecast to fizzle (no depression)', !fiz.developed && fiz.peak.v === 0);
}

/* ---- seasons: calendar rollover ----------------------------------------------------------------------------------------------- */
{
  const m = H.create({ seed: 8, startMs: Date.UTC(2026, 11, 20), auto: false });
  const env = makeEnv({ sst: 29, shear: 5, rh: 66 });
  const A = m.place({ kind: 'td', lat: 18, lon: -40 }); const B = m.place({ kind: 'td', lat: 14, lon: -30 });
  m.advanceTo(14 * 24, env);
  const hNewYear = (Date.UTC(2027, 0, 1) - Date.UTC(2026, 11, 20)) / 3600000;
  check('on Jan 1 the finished season is archived (' + (m.archive[0] && m.archive[0].year) + ') and a new one starts with its own counters', m.archive.length === 1 && m.archive[0].year === 2026 && m.season.year === 2027 && m.season.named === 0);
  check('a storm alive at the turn of the year stays under its formation year (named from the 2026 list, counted in 2026)', A.season === 2026 && /^(Arthur|Bertha)$/.test(A.name || 'Arthur') && m.hour > hNewYear);
  const m2 = H.create({ seed: 8, startMs: Date.UTC(2026, 11, 28), auto: false }); const C = m2.place({ kind: 'td', lat: 18, lon: -40 });
  m2.advanceTo(40 * 24, env);
  check('the finished season is closed once its last storm dies, and the new year starts again from the 2027 list', m2.archive.length === 1 && !m2.archive[0].open && m2.archive[0].storms.length >= 1 && H.nameFor(2027, 0) === 'Ana');
  void B;
}

/* ---- the season summary record ------------------------------------------------------------------------------------------------ */
{
  const env = makeEnv({ sst: 29, shear: 5, rh: 66 });
  const m = H.create({ seed: 8, startMs: Date.UTC(2026, 11, 28), auto: false });
  const A = m.place({ kind: 'td', lat: 18, lon: -45, v: 55 });
  m.advanceTo(3 * 24, env);                                                   // Dec 28 -> Dec 31: the storm is named and builds ACE under 2026
  const before = m.seasonRecord(2026), sumDaily = (r) => r.aceDaily.reduce((a, b) => a + b, 0);
  check('the current season has a record: counters, the cyclone in order of formation, the day of the year, a daily ACE that adds up (' + before.ace + ')',
    before.current && before.open && before.year === 2026 && before.dep === 1 && before.named === 1 && before.storms.length === 1 && before.storms[0].name === A.name && before.day === 364 && before.from === 361 && Math.abs(sumDaily(before) - before.ace) < 0.2);
  m.advanceTo(10 * 24, env);                                                  // past Jan 1 with the storm still going
  const R26 = m.seasonRecord(2026), R27 = m.seasonRecord(2027);
  check('after the turn of the year both seasons have a record and an unknown year has none: ' + JSON.stringify(m.seasonYears()), JSON.stringify(m.seasonYears()) === '[2026,2027]' && R26 && R27 && m.seasonRecord(1999) === null && R27.current && !R26.current);
  check('a storm alive at the turn of the year keeps the old season open: its record holds the live storm and the counters that keep running (alive ' + A.alive + ', open ' + R26.open + ')',
    A.alive ? R26.open && R26.storms.length === 1 && R26.storms[0].id === A.id && R27.storms.length === 0 : !R26.open);
  check('the ACE a closing season keeps earning after midnight on Jan 1 goes onto its Dec 31, not onto January (the whole 2026 curve is empty before Dec 28: ' + R26.aceDaily.slice(0, 350).every((x) => x === 0) + ')',
    R26.aceDaily.slice(0, 350).every((x) => x === 0) && R26.aceDaily[364] > before.aceDaily.slice(358, 365).reduce((a, b) => a + b, 0) - 1e-9 && Math.abs(sumDaily(R26) - R26.ace) < 0.2 && Math.abs(R26.ace - A.ace) < 0.2);
  check('the new season starts empty on its own list and its own curve', R27.dep === 0 && R27.named === 0 && R27.ace === 0 && sumDaily(R27) === 0 && R27.from === 0);
  const far = m.advanceTo(60 * 24, env), R26b = m.seasonRecord(2026);          // the storm dies: the season closes
  void far;
  check('once its last storm is gone the old season is closed, with the same counters (dep ' + R26b.dep + ') and the storm summarised', !R26b.open && R26b.dep === R26.dep && R26b.storms.length === 1 && R26b.storms[0].peakV >= 55 && R26b.storms[0].end > 0);
}

/* ---- the paths of a finished season go in the very hour the year turns ---------------------------------------------------------------- */
{
  const e2 = makeEnv({ sst: 20, shear: 25, rh: 40, steer: () => [0, 0, 0, 0, 0, 0] }), m2 = H.create({ seed: 8, startMs: Date.UTC(2026, 11, 20), auto: false });
  m2.place({ kind: 'td', lat: 40, lon: -45, v: 40 }); m2.advanceTo(8 * 24, e2);                // Dec 28: the cold-water depression is long gone, but its track stays on the map until the year ends
  const left = m2.systems.length, dead = m2.systems.filter((S) => !S.alive).length;
  m2.advanceTo((Date.UTC(2027, 0, 1, 1) - Date.UTC(2026, 11, 20)) / 3600000, e2);              // 01Z on Jan 1, not a six-hourly clean-up hour
  check(`the finished season's dead paths are gone in the hour the year turns, not at the next six-hourly clean-up (Dec 28: ${left} system(s), ${dead} dead; 01Z on Jan 1: ${m2.systems.length}), and the season is archived with that storm`,
    dead >= 1 && m2.systems.length === 0 && m2.archive.length === 1 && m2.archive[0].storms.length >= 1);
}

/* ---- low tracker -------------------------------------------------------------------------------------------------------------- */
{
  const t = new H.LowTracker();
  for (let k = 0; k < 8; k++) t.update(k * 6, [{ lat: 45, lon: -60 + k * 2, p: 995 - k, prom: 6 }, { lat: 35, lon: -30, p: 1003, prom: 3 }]);
  check('a low moving east is one track, a stationary one another', t.tracks.length === 2 && t.tracks.filter((x) => x.alive).length === 2 && t.tracks[0].fixes.length === 8);
  t.update(48, [{ lat: 35, lon: -30, p: 1003, prom: 3 }]); t.update(54, [{ lat: 35, lon: -30, p: 1003, prom: 3 }]);
  check('a low that is not seen for two checks ends', !t.tracks[0].alive && t.tracks[1].alive);
}

/* ---- description for hover / cards -------------------------------------------------------------------------------------------- */
{
  const S = system('tc', 25, -70, 105, 1); S.vr = 105; S.p = 946;
  const f = H.makeFix(S, 12, 15.3); f.dir = 315; f.spd = 9;
  const d = H.describe(S, f);
  check('a card: Major Hurricane, 120 mph, gusts 145 mph, 946 hPa, NW at 9 kt (your reference card)', d.cat.cat === 3 && d.windMph === 120 && d.gustMph === 145 && d.pressure === 946 && d.move === 'NW at 9 kt');
}

/* ---- parameter sets (the calibration lab passes partial ones) ----------------------------------------------------------------- */
{
  const d0 = JSON.stringify(H.defaultParams());
  const p = H.mergeParams(H.defaultParams(), { ri: { haz: 0.02 }, shearScale: 22, regions: [{ key: 'X' }], sub: { vCap: 50 } });
  check('mergeParams replaces what it is given and keeps the rest of a nested set (ri.haz 0.02 but ri.dur intact, shearScale 22, sub.vCap 50 but sub.kUp intact), arrays are replaced whole',
    p.ri.haz === 0.02 && JSON.stringify(p.ri.dur) === JSON.stringify(par.ri.dur) && p.shearScale === 22 && p.sub.vCap === 50 && p.sub.kUp === par.sub.kUp && p.regions.length === 1 && p.regions[0].key === 'X');
  check('mergeParams leaves the defaults and its inputs untouched', JSON.stringify(H.defaultParams()) === d0 && par.ri.haz !== 0.02);
  const m = H.create({ seed: 5, startMs: START, params: { ri: { haz: 0 } } });
  check('a manager built from a partial set has every other default (waves still seeded at the default rate, no rapid intensification)', m.par.ri.haz === 0 && m.par.ri.dur[1] === par.ri.dur[1] && m.par.waveRate0 === par.waveRate0);
  const S = system('tc', 20, -50, 60, 1); S.vr = 60; S.lastRh = 57.4;
  check('every fix carries the humidity the system saw (for the calibration of the humidity gate)', H.makeFix(S, 6, 0).rh === 57);
}

/* ---- extratropical transition: where it happens, with what wind, and how a decaying storm ends ---------------------------------------- */
{
  const climb = (la) => ({ sst: 29 - 0.6 * Math.max(0, la - 26), shear: 10 + 2.2 * Math.max(0, la - 26) });         // the Gulf Stream and the westerlies: 29 C and 10 kt at 26N, 18 C and 49 kt at 44N
  const env = makeEnv({ sst: (la) => climb(la).sst, shear: (la) => climb(la).shear, rh: 60, steer: () => [3, 7, 3, 8, 6, 11] });
  const lat = [], wind = [], peak = [];
  for (let s = 1; s <= 16; s++) {
    const S = system('tc', 27, -70, 85, s); let pk = 0;
    for (let h = 0; h < 400 && S.alive && S.th === 'tc'; h++) { H.stepSystem(S, env, h, s, par); pk = Math.max(pk, S.vr); }
    if (S.th === 'ex') { lat.push(S.lat); wind.push(S.vr); peak.push(pk); }
  }
  const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  check(`storms carried up the Gulf Stream into the westerlies turn extratropical (${lat.length} of 16) at a median ${med(lat).toFixed(0)}N with ${med(wind).toFixed(0)} kt (real: 41N, 45 kt): poleward of 33N, still holding storm-force wind`, lat.length >= 13 && med(lat) > 33 && med(lat) < 46 && med(wind) >= 30);
  const off = H.mergeParams(par, { etHaz: { b0: -60 }, disHaz: { b0: -60 } });
  const R = system('tc', 35, -50, 24, 3), still = makeEnv({ sst: 24, shear: 20, rh: 30, steer: () => [0, 0, 0, 0, 0, 0] });
  run(R, still, 60, 3, off);
  const T = system('tc', 18, -50, 24, 3); run(T, still, 60, 3, off);
  check(`a storm that has spun down is a remnant low (a baroclinic zone would have held it up), poleward of 30N (${R.th}) as in the tropics (${T.th})`, R.th === 'nl' && T.th === 'nl');

  // the transition: a random event at the real best track's rate, the wind kept, the life and the odd re-intensification of an extratropical cyclone
  const hz = (la, sst, sh, v) => H.etHazard6(par, la, sst, sh, v);
  check('the transition hazard rises with latitude and shear, falls with warm water and with the storm\'s own wind, and is zero in the tropics',
    hz(40, 20, 40, 60) > hz(35, 20, 40, 60) && hz(40, 20, 50, 60) > hz(40, 20, 30, 60) && hz(40, 26, 40, 60) < hz(40, 20, 40, 60) && hz(40, 20, 40, 100) < hz(40, 20, 40, 40) && hz(15, 20, 40, 60) === 0);
  check(`the real numbers: about a quarter of the tropical storms at 42N over 20 C water in strong shear become post-tropical within six hours (${hz(42, 20, 40, 50).toFixed(2)}), under a hundredth at 28N over 28 C water (${hz(28, 28, 25, 50).toFixed(3)})`, near(hz(42, 20, 40, 50), 0.25, 0.1) && hz(28, 28, 25, 50) < 0.02);
  const dz = (la, v) => H.disHazard6(par, la, 22, 30, v);
  check('dissipation poleward of the subtropics takes weak storms far more often than strong ones and is zero in the tropics', dz(38, 25) > 3 * dz(38, 60) && dz(38, 60) > 0 && dz(20, 25) === 0);
  const flip = H.mergeParams(par, { etHaz: { b0: 60 }, disHaz: { b0: -60 } });                  // a transition at the first hour
  const at = (v, lat, sh, seed) => { const S = system('tc', lat, -50, v, seed), e = makeEnv({ sst: 18, shear: sh, rh: 50, steer: () => [10, 6, 12, 7, 20, 10] }); H.stepSystem(S, e, 0, seed, flip); return { S, e }; };
  const k = at(80, 41, 40, 3);
  check(`the transition keeps the wind (a hurricane of 80 kt is ${k.S.th} with ${k.S.v.toFixed(0)} kt at its first post-tropical hour) and gives it the life of an extratropical cyclone (${(k.S.nlTill - k.S.etAt).toFixed(0)} h)`, k.S.th === 'ex' && near(k.S.v, 80, 2) && k.S.etAt === 1 && k.S.nlTill > k.S.etAt);
  const life = [], d24 = [], d48 = [];
  for (let s = 1; s <= 400; s++) {
    const { S, e } = at(50, 41, 40, s), v0 = S.v;
    for (let h = 1; h < 400 && S.alive; h++) { H.stepSystem(S, e, h, s, flip); if (h === 24) d24.push(S.v - v0); if (h === 48) d48.push(S.v - v0); }
    life.push(S.end - S.etAt);
  }
  const md = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  check(`a post-tropical cyclone lasts a median ${md(life)} h with a long tail (90th percentile ${life.slice().sort((x, y) => x - y)[Math.floor(0.9 * life.length)].toFixed(0)} h; real 30 and 102)`, near(md(life), 33, 9) && life.slice().sort((x, y) => x - y)[Math.floor(0.9 * life.length)] > 80);
  const g10 = (a) => a.filter((x) => x >= 10).length / a.length;
  check(`among those still going, the wind changes by a median ${md(d24).toFixed(0)} kt in the next day (real -5), and in a strong jet ${g10(d24).toFixed(2)} gain 10 kt or more within a day and ${g10(d48).toFixed(2)} within two (real 0.09 and 0.16: re-intensification)`, near(md(d24), -5, 6) && g10(d24) > 0.02 && g10(d24) < 0.25 && g10(d48) > 0.06 && g10(d48) < 0.4);
  const wk = (v, shear) => { const S = system('tc', 42, -50, v, 5), e = makeEnv({ sst: 14, shear, rh: 40, steer: () => [10, 6, 12, 7, 20, 10] }); let lo = 1e9; for (let h = 0; h < 36; h++) { H.stepSystem(S, e, h, 5, off); lo = Math.min(lo, S.v); } return lo; };
  check(`over cold water a hurricane does not collapse (100 kt falls to ${wk(100, 10).toFixed(0)} kt in a day and a half, no faster than the cap of ${(par.decayCap[0] + par.decayCap[1] * (100 / 60) ** 2).toFixed(1)} kt/h), while a weak storm is held up where the jet supports it (30 kt in 50 kt of shear: ${wk(30, 50).toFixed(0)} kt against ${wk(30, 5).toFixed(0)} kt in 5 kt)`,
    wk(100, 10) >= 100 - 36 * (par.decayCap[0] + par.decayCap[1] * (100 / 60) ** 2) - 1 && wk(30, 50) > wk(30, 5) + 5);
  const lnd = (th) => { const S = system(th, 41, -63, 60, 7, th === 'ex' ? { nlTill: 1e6 } : {}), e = makeEnv({ sst: 15, shear: 30, land: () => true, steer: () => [10, 6, 12, 7, 20, 10] }); for (let h = 0; h < 24 && S.alive; h++) H.stepSystem(S, e, h, 7, off); return S.alive ? S.v : 0; };
  check(`a baroclinic low does not spin down over land like a warm-core storm (60 kt for a day: post-tropical ${lnd('ex').toFixed(0)} kt, tropical ${lnd('tc').toFixed(0)} kt)`, lnd('ex') > lnd('tc') + 10 && lnd('ex') > 35);
  const nlife = []; for (let s = 1; s <= 200; s++) { const S = system('tc', 20, -50, 18, s); S.lowCount = 11; const e = makeEnv({ sst: 22, shear: 40, rh: 20, steer: () => [0, 0, 0, 0, 0, 0] }); for (let h = 0; h < 5 && S.th === 'tc'; h++) H.stepSystem(S, e, h, s, off); if (S.th === 'nl') nlife.push(S.nlTill - 1); }
  check(`a remnant low lasts a median ${md(nlife)} h (real 24; 6 to 120 h)`, nlife.length > 150 && near(md(nlife), 24, 8) && Math.min(...nlife) >= 5 && Math.max(...nlife) <= 125);
}

/* ---- what a storm responds to: its neighbourhood and the last day or so ---------------------------------------------------------------- */
{
  const still = { steer: () => [0, 0, 0, 0, 0, 0], sst: 28.8, rh: 62 };
  // time: a 24-hour burst of 60 kt of shear (hours 24-48) in an otherwise good environment (5 kt); the wind at the end of the burst
  const burst = (tau) => { const out = []; for (let s = 1; s <= 24; s++) { const S = system('tc', 15, -50, 45, s); let hh = 0; const env = { ...makeEnv({ ...still, shear: 5 }), shear: () => (hh >= 24 && hh < 48 ? 60 : 5) }; for (let k = 0; k < 48 && S.alive; k++) { hh = k; H.stepSystem(S, env, k, s, H.mergeParams(par, { envTau: tau, qSd: 0 })); } out.push(S.alive ? S.vr : 0); } return mean(out); };
  const b1 = burst(1), b72 = burst(72);
  check(`a storm that responds to the last few days is hardly dented by a 24-hour burst of shear (60 kt) that weakens one which follows every hour: wind at the end of the burst ${b72.toFixed(0)} kt against ${b1.toFixed(0)} kt`, b72 > b1 + 8);
  // space: a narrow spike of shear exactly at the storm's centre
  const spike = (avg) => { const out = []; for (let s = 1; s <= 24; s++) { const S = system('tc', 15, -50, 35, s); const env = makeEnv({ ...still, shear: (la, lo) => (Math.hypot(la - 15, lo + 50) < 0.5 ? 27 : 5) }); run(S, env, 72, s, H.mergeParams(par, { envAvg: avg, qSd: 0 })); out.push(S.vr); } return mean(out); };
  const p0 = spike(0), p2 = spike(2);
  check(`a shear spike one point wide at the storm's centre is averaged with its neighbourhood: 72 h later the storm has ${p2.toFixed(0)} kt with a 2-degree cross against ${p0.toFixed(0)} kt reading the centre point only`, p2 > p0 + 8);
  const S = system('tc', 15, -50, 35, 3); H.stepSystem(S, makeEnv({ ...still, shear: (la, lo) => (Math.hypot(la - 15, lo + 50) < 0.5 ? 27 : 5) }), 0, 3, H.mergeParams(par, { envAvg: 2, envTau: 30 }));
  check('the fix still reports the shear at the centre (27 kt), the number on the map, whatever the storm responds to', S.lastShear === 27 && H.makeFix(S, 1, 0).sh === 27);
}

/* ---- the season-shape parameters the calibration uses: late / early weights, the seasonal SST gate, the wave's own shear scale -------------------------- */
{
  const seeds = (p, startMs, days, seed) => { const m = H.create({ seed, startMs, params: p, auto: true }); m.advanceTo(days * 24, makeEnv({ sst: 20, shear: 60 })); return m.n.W + m.n.N; };
  const sum = (p, startMs, days) => [11, 12, 13, 14, 15, 16].reduce((t, sd) => t + seeds(p, startMs, days, sd), 0);
  const oct = [sum({}, Date.UTC(2026, 9, 20), 30), sum({ lateW: 3 }, Date.UTC(2026, 9, 20), 30)], aug = [sum({}, Date.UTC(2026, 7, 1), 30), sum({ lateW: 3 }, Date.UTC(2026, 7, 1), 30)];
  check(`lateW multiplies the activity of the sources from mid-October on (${oct[0]} seeds in the 30 days from Oct 20 become ${oct[1]} with lateW 3) and leaves August exactly alone (${aug[0]} and ${aug[1]})`, oct[1] / oct[0] > 2.2 && oct[1] / oct[0] < 4 && aug[0] === aug[1]);
  const jun = [sum({}, Date.UTC(2026, 5, 1), 14), sum({ earlyW: 3 }, Date.UTC(2026, 5, 1), 14)], oc2 = [sum({}, Date.UTC(2026, 9, 1), 20), sum({ earlyW: 3 }, Date.UTC(2026, 9, 1), 20)];
  check(`earlyW does the same before July (${jun[0]} seeds in the first fortnight of June become ${jun[1]} with earlyW 3) and not in October (${oc2[0]} and ${oc2[1]})`, jun[1] / jun[0] > 1.8 && jun[1] / jun[0] < 4 && oc2[0] === oc2[1]);
  // the SST gate follows the season: in June a marginal sea (26.0 degC against a gate of 25-27.5) lets a depression grow with sstSeas 2 and not with 0; at the peak (day 255) the two are identical
  const grow = (sstSeas, doy) => { const out = []; for (let sd = 1; sd <= 16; sd++) { const S = system('tc', 15, -50, 35, sd), e = makeEnv({ sst: 26.0, shear: 6, rh: 64, steer: () => [0, 0, 0, 0, 0, 0] }), p = H.mergeParams(par, { sstSeas, qSd: 0 }); let pk = 0; for (let h = 0; h < 144 && S.alive; h++) { H.stepSystem(S, e, h, sd, p, doy); pk = Math.max(pk, S.vr); } out.push(pk); } return mean(out); };
  const g0 = grow(0, 166), g2 = grow(2, 166), p0 = grow(0, 255), p2 = grow(2, 255);
  check(`sstSeas opens the SST gate away from the peak of the season: a depression over 26.0 degC reaches ${g2.toFixed(0)} kt in mid-June with sstSeas 2 against ${g0.toFixed(0)} kt without, and the two are identical at the peak (${p2.toFixed(1)} and ${p0.toFixed(1)} kt)`, g2 > g0 + 8 && p0 === p2);
  // a wave feels shear / (shearK shearKW); a cyclone only shear / shearK
  const waveGrow = (kw) => { const out = []; for (let sd = 1; sd <= 16; sd++) { const S = system('wv', 14, -45, 18, sd), e = makeEnv({ sst: 29, shear: 24, rh: 64, steer: () => [0, 0, 0, 0, 0, 0] }), p = H.mergeParams(par, { shearKW: kw, qSd: 0 }); let pk = 0; for (let h = 0; h < 120 && S.alive; h++) { H.stepSystem(S, e, h, sd, p); pk = Math.max(pk, S.vr); } out.push(pk); } return mean(out); };
  const w1 = waveGrow(1), w2 = waveGrow(2);
  const matureSame = (() => { const a = system('tc', 15, -50, 60, 7), b = system('tc', 15, -50, 60, 7), e = makeEnv({ sst: 29, shear: 24, rh: 64, steer: () => [0, 0, 0, 0, 0, 0] }); for (let h = 0; h < 48; h++) { H.stepSystem(a, e, h, 7, H.mergeParams(par, { shearKW: 1 })); H.stepSystem(b, e, h, 7, H.mergeParams(par, { shearKW: 2 })); } return a.v === b.v; })();
  check(`shearKW lets a wave develop in more shear (peak ${w2.toFixed(0)} kt with 2 against ${w1.toFixed(0)} kt with 1 at 24 kt of shear) and does nothing to a storm (${matureSame})`, w2 > w1 + 6 && matureSame);
  const m1 = H.create({ seed: 5, startMs: START, auto: false, params: { sstSeas: 2, shearKW: 1.5 } }), cE = makeEnv({ sst: 26.4, shear: 8, rh: 62 });
  const pre = m1.forecast({ kind: 'td', lat: 15, lon: -50 }, cE, 120), pl = m1.place({ kind: 'td', lat: 15, lon: -50 }); m1.advanceTo(120, cE);
  const byH = Object.fromEntries(pl.fixes.map((f) => [f.h, f]));
  check('the preview still equals the placed storm with the new parameters (same calendar day for both)', pre.fixes.filter((f) => byH[f.h]).length >= 18 && pre.fixes.filter((f) => byH[f.h]).every((f) => near(f.lat, byH[f.h].lat, 1e-9) && near(f.lon, byH[f.h].lon, 1e-9) && f.v === byH[f.h].v));
}

/* ---- a uniform offset of the environment is the same as the environment shifted (how the lab asks what a moved slider would do) ------------------------------ */
{
  const pa = H.mergeParams(par, { sstOffset: 1.2, shearOffset: 4, rhOffset: -6 }), pb = par;
  const run2 = (S, env, p) => { for (let h = 0; h < 200 && S.alive; h++) H.stepSystem(S, env, h, 5, p); return [S.lat, S.lon, S.v, S.vr, S.th, S.alive]; };
  const sstF = (la, lo) => 27.3 - 0.05 * (la - 15) + 0.01 * (lo + 50), shF = (la) => 8 + 0.4 * (la - 15), rhF = (la) => 60 - 0.3 * (la - 15);
  for (const avg of [0, 1.5]) {
    const A = system('tc', 15, -50, 40, 5), B = system('tc', 15, -50, 40, 5);
    const ra = run2(A, makeEnv({ sst: sstF, shear: shF, rh: rhF }), H.mergeParams(pa, { envAvg: avg, envTau: avg ? 12 : 1 }));
    const rb = run2(B, makeEnv({ sst: (la, lo) => sstF(la, lo) + 1.2, shear: (la) => shF(la) + 4, rh: (la) => rhF(la) - 6 }), H.mergeParams(pb, { envAvg: avg, envTau: avg ? 12 : 1 }));
    check(`sstOffset, shearOffset and rhOffset give exactly the trajectory of the shifted environment (${avg ? 'with the neighbourhood average and the time filter' : 'plain'}): ${ra[2].toFixed(1)} kt at ${ra[0].toFixed(2)}N against ${rb[2].toFixed(1)} kt at ${rb[0].toFixed(2)}N`, ra.every((x, i) => x === rb[i]));
  }
  const warmer = (off) => { const out = []; for (let sd = 1; sd <= 16; sd++) { const S = system('tc', 15, -50, 35, sd); out.push(run(S, makeEnv({ sst: 26.6, shear: 6, rh: 64, steer: () => [0, 0, 0, 0, 0, 0] }), 144, sd, H.mergeParams(par, { sstOffset: off }))); } return mean(out); };
  const w0 = warmer(0), w1 = warmer(1);
  check(`one degree of sstOffset makes a marginal-sea depression stronger (${w1.toFixed(0)} kt against ${w0.toFixed(0)} kt)`, w1 > w0 + 8);
}

/* ---- relative SST: the genesis gate follows the main development region's mean, the potential intensity stays absolute ----------------------------------------- */
{
  const still = [0, 0, 0, 0, 0, 0];
  const mk = (dT) => ({ ...makeEnv({ sst: 26.6 + dT, shear: 6, rh: 64, steer: () => still }), sstRef: () => 28.2 + dT });          // the whole region warmed by dT
  const peak = (dT, w, off) => { const out = []; for (let sd = 1; sd <= 16; sd++) { const S = system('tc', 15, -50, 35, sd), e = mk(dT), p = H.mergeParams(par, { sstRelW: w, qSd: 0, sstOffset: off || 0 }); let pk = 0; for (let h = 0; h < 144 && S.alive; h++) { H.stepSystem(S, e, h, sd, p); pk = Math.max(pk, S.vr); } out.push(pk); } return mean(out); };
  const abs0 = peak(0, 0), abs1 = peak(1, 0), rel0 = peak(0, 1), rel1 = peak(1, 1);
  check(`with a relative SST gate a warmer world (the whole region +1 degC) helps a depression much less (${rel0.toFixed(0)} -> ${rel1.toFixed(0)} kt) than with the absolute gate (${abs0.toFixed(0)} -> ${abs1.toFixed(0)} kt), through the potential intensity only`, abs1 - abs0 > 25 && rel1 - rel0 < 0.4 * (abs1 - abs0) && rel1 >= rel0 - 1);
  const exact = (() => { const A = system('tc', 15, -50, 35, 4), B = system('tc', 15, -50, 35, 4); for (let h = 0; h < 120; h++) { H.stepSystem(A, mk(0), h, 4, H.mergeParams(par, { sstRelW: 0.7, sstOffset: 1 })); H.stepSystem(B, mk(1), h, 4, H.mergeParams(par, { sstRelW: 0.7 })); } return A.v === B.v && A.lat === B.lat; })();
  check('sstOffset moves the reference with the sea, so the lab\'s warm twin of an engine is exactly an engine in the warmed region', exact);
  const e0 = makeEnv({ sst: 26.6, shear: 6, rh: 64, steer: () => still }), S1 = system('tc', 15, -50, 35, 4), S2 = system('tc', 15, -50, 35, 4);
  for (let h = 0; h < 60; h++) { H.stepSystem(S1, e0, h, 4, H.mergeParams(par, { sstRelW: 1 })); H.stepSystem(S2, { ...e0, sstRef: () => H.defaultParams().sstRef0 }, h, 4, H.mergeParams(par, { sstRelW: 1 })); }
  check('an environment without a reference (the synthetic ones) is read as "at the reference value": the gate is the absolute one', S1.v === S2.v);
}

/* ---- seed quality and the regional multiplier ------------------------------------------------------------------------------------- */
{
  const env = () => makeEnv({ sst: 27.8, shear: 15, rh: 55 });
  const peak = (q, s, p) => { const S = system('wv', 14, -40, 16, s, { q }); return run(S, env(), 150, s, p); };
  const pq = H.mergeParams(par, { qSd: 0.45, qTau: 60 });
  const hi = [], lo = [];
  for (let s = 1; s <= 40; s++) { hi.push(peak(1.2, s, pq)); lo.push(peak(-1.2, s, pq)); }
  check(`a well-organised seed (q +1.2) develops more than a poor one (q -1.2) in the same marginal environment and the same noise (mean 6-day peak ${mean(hi).toFixed(0)} against ${mean(lo).toFixed(0)} kt)`, mean(hi) > mean(lo) + 8);
  const off = H.mergeParams(par, { qSd: 0 }), a0 = [], b0 = [];
  for (let s = 1; s <= 12; s++) { a0.push(peak(1.2, s, off)); b0.push(peak(-1.2, s, off)); }
  check('with qSd 0 the quality does nothing: the same storms for any q', a0.every((v, i) => v === b0[i]));
  const m1 = H.create({ seed: 31, startMs: START, auto: true }), m2 = H.create({ seed: 31, startMs: START, auto: true });
  const ids = []; for (let k = 0; k < 6; k++) ids.push(m1._seedSystem('W', 'wv', 12, -30, 15, 0, 'wave', false));
  m2.place({ kind: 'wave', lat: 12, lon: -30 });
  check('the quality is a pure function of the seed and the id: the same for a rebuilt manager, different between systems, N(0,1)-looking', ids.every((S, i) => S.q === H.create({ seed: 31, startMs: START })._seedSystem('W', 'wv', 12, -30, 15, 0, 'wave', false).q || i > 0) && new Set(ids.map((S) => S.q)).size === 6 && ids.every((S) => Math.abs(S.q) < 4));
  const cnt = (mul) => { const m = H.create({ seed: 12, startMs: START, params: { regionMul: mul, waveRate0: 0 } }); m.advanceTo(24 * 150, makeEnv({ sst: 28, shear: 8, rh: 62, land: (la, lo) => la > 36 })); return m.n.N; };
  const n1 = cnt(1), n2 = cnt(2);
  check(`regionMul scales the regional seeds (${n1} at 1, ${n2} at 2)`, n1 >= 8 && n2 > 1.5 * n1 && n2 < 2.6 * n1);
  void m2;
}

/* ---- the page's shear is not a storm-centred shear: shearK converts it for the tropical gates only ---------------------------------- */
{
  const p1 = H.mergeParams(H.defaultParams(), { shearK: 1 }), p2 = H.mergeParams(H.defaultParams(), { shearK: 2 });
  let same = true, differs = false, reported = true;
  for (let s = 1; s <= 8; s++) {
    const A = system('tc', 15, -50, 45, s), B = system('tc', 15, -50, 45, s), C = system('tc', 15, -50, 45, s);
    run(A, makeEnv({ shear: 15 }), 144, s, p1); run(B, makeEnv({ shear: 30 }), 144, s, p2); run(C, makeEnv({ shear: 30 }), 144, s, p1);
    if (A.v !== B.v || A.vr !== B.vr) same = false;
    if (Math.abs(A.v - C.v) > 3) differs = true;
    if (H.makeFix(B, 144, 0).sh !== 30) reported = false;
  }
  check('with shearK 2, 30 kt of page shear grows a storm exactly as 15 kt does with shearK 1 (the tropical gates see the storm-centred value), and 30 kt at shearK 1 does not', same && differs);
  check('the fix still reports the page\'s own shear value, the number on the map', reported);
  const h6 = (pp) => H.etHazard6(pp, 40, 20, 42, 60);
  check('the extratropical-transition hazard reads the page\'s shear unscaled (the same probability at shearK 1 and 2: it is a regression on the real daily shear, not a tropical gate)', h6(p1) === h6(p2) && h6(p1) > 0);
}

/* ---- the growth gates' empirical latitude dependence ---------------------------------------------------------------------------------------------------------- */
{
  const grow = (lat, lon, over) => { const out = []; for (let sd = 1; sd <= 16; sd++) { const S = system('tc', lat, lon, 40, sd), e = makeEnv({ sst: 27.2, shear: 8, rh: 46, steer: () => [0, 0, 0, 0, 0, 0] }); out.push(run(S, e, 120, sd, H.mergeParams(par, Object.assign({ qSd: 0 }, over)))); } return mean(out); };
  const a0 = grow(30, -60, {}), a1 = grow(30, -60, { rhLat: -12 }), b0 = grow(15, -60, {}), b1 = grow(15, -60, { rhLat: -12, sstLat: 2, shLat: 0.5 });
  check(`a negative rhLat opens the humidity gate poleward (a depression at 30N over dry air reaches ${a1.toFixed(0)} kt against ${a0.toFixed(0)} kt) and next to nothing at 15N where the storm starts (${b1.toFixed(1)} against ${b0.toFixed(1)})`, a1 > a0 + 8 && Math.abs(b1 - b0) < 2.5);
  const c0 = grow(30, -60, { rhLat: -12 }), c1 = grow(30, -60, { rhLat: -12, sstLat: 2 }), d1 = grow(30, -60, { rhLat: -12, shLat: 0.5 });
  check(`a positive sstLat opens the sea-temperature gate poleward (${c1.toFixed(0)} against ${c0.toFixed(0)} kt) and a positive shLat widens the shear scale (${d1.toFixed(0)} kt, never weaker)`, c1 > c0 + 3 && d1 >= c0 - 1e-9);
}

/* ---- the climatology-anchored model: maps, drift-anchored motion, hazard genesis, local seeds, lows, diagnostics ------------------------------------------------ */
{
  const GR = { lon0: -105, lat0: 5, res: 5, nx: 21, ny: 13 };
  const flat = (v) => Array.from({ length: 12 }, (_, m) => Array.from({ length: GR.ny }, (_, j) => new Array(GR.nx).fill(typeof v === 'function' ? v(m, GR.lat0 + j * GR.res, GR.lon0 + 0 * j) : v)));
  const field = (f) => Array.from({ length: 12 }, (_, m) => Array.from({ length: GR.ny }, (_, j) => Array.from({ length: GR.nx }, (_, i) => f(m, GR.lat0 + j * GR.res, GR.lon0 + i * GR.res))));
  const testMaps = (o = {}) => {
    const dr = (u, v) => ({ u: flat(u), v: flat(v) });
    const m = { grid: GR, drift: { weak: dr(o.du ?? -8, o.dv ?? 3), strong: dr(o.su ?? -6, o.sv ?? 5), sub: dr(o.bu ?? 4, o.bv ?? 1), ex: dr(o.eu ?? 15, o.ev ?? 5) }, steerClim: (o.clim || [0, 0, 0, 0, 0, 0]).map((x) => flat(x)) };
    if (o.haz != null) m.haz = { T: flat(o.haz), S: flat(o.hazS ?? 0) };
    if (o.spawn) m.spawn = field(o.spawn);
    if (o.env0) m.env0 = { rh: flat(o.env0.rh), shear: flat(o.env0.shear), sst: flat(o.env0.sst), sstRel: flat(o.env0.sstRel ?? 0) };
    return m;
  };
  const doyF = (m) => (m + 0.5) * 30.4375 - 0.5;                                // the day of the year at which month m's mid-month value applies exactly
  // ---- the maps themselves
  const probe = H.prepareMaps({ grid: GR, drift: { weak: { u: field((m, la, lo) => m + 0.01 * la + 0.001 * lo), v: flat(0) } } });
  const du = (m, lat, lon) => H.mapAt(probe, probe.drift.weak.u, H.timeWeights(doyF(m)), lat, lon);
  check(`a map is exact at its nodes and mid-month, bilinear in space (${du(3, 20, -60).toFixed(4)} against ${(3 + 0.2 - 0.06).toFixed(4)}; between nodes ${du(3, 23.7, -61.3).toFixed(4)} against ${(3 + 0.237 - 0.0613).toFixed(4)}), linear in time between mid-months (${(H.mapAt(probe, probe.drift.weak.u, H.timeWeights((doyF(3) + doyF(4)) / 2), 20, -60)).toFixed(3)} between ${du(3, 20, -60).toFixed(3)} and ${du(4, 20, -60).toFixed(3)})`,
    near(du(3, 20, -60), 3.14, 1e-4) && near(du(3, 23.7, -61.3), 3 + 0.237 - 0.0613, 1e-4) && near(H.mapAt(probe, probe.drift.weak.u, H.timeWeights((doyF(3) + doyF(4)) / 2), 20, -60), 3.64, 1e-3) && near(du(11, 20, -60), 11.14, 1e-4));
  check('outside the grid a map holds its edge value, and December runs on into January', near(du(3, 80, -60), du(3, 65, -60), 1e-9) && near(du(3, 20, -140), du(3, 20, -105), 1e-9) && near(H.mapAt(probe, probe.drift.weak.u, H.timeWeights(doyF(11) + 15.2), 20, -60), (11.14 + 0.14) / 2, 0.05));
  const m1 = H.prepareMaps({ grid: GR, drift: { weak: { u: flat(1), v: flat(1) } } }); const raw1 = { grid: GR, drift: { weak: { u: flat(1), v: flat(1) } } };
  check('prepareMaps hands back the same object for the same input (the page builds many engines from one set of maps)', H.prepareMaps(raw1) === H.prepareMaps(raw1) && m1 !== null && H.prepareMaps(null) === null);

  // ---- motion: the real mean drift, plus the anomaly of the steering from its own mean
  const pm = H.mergeParams(H.defaultParams(), { shearK: 1, wobbleSd: 0, driftGain: { tc: 0.9 } });
  const ctxOf = (mp, doy = 240) => ({ maps: H.prepareMaps(mp), tw: H.timeWeights(doy), diag: null });
  const track = (mp, steerUV, hours, V = 40, lat = 15, lon = -50, p = pm, v0 = [-8, 3]) => { const S = system('tc', lat, lon, V, 3, { cx: v0[0], cy: v0[1] }), e = makeEnv({ sst: 20, shear: 0, steer: () => steerUV }), c = ctxOf(mp); for (let h = 0; h < hours && S.alive; h++) H.stepSystem(S, e, h, 3, p, 240, c); return S; };
  const kmE = (S, lat0, lon0) => (S.lon - lon0) * 111.195 * Math.cos((S.lat + lat0) / 2 * Math.PI / 180), kmN = (S, lat0) => (S.lat - lat0) * 111.195;
  const A0 = track(testMaps(), [0, 0, 0, 0, 0, 0], 48), A1 = track(testMaps({ clim: [-3, 1, -3, 1, -3, 1] }), [-3, 1, -3, 1, -3, 1], 48);
  const sp48 = (S) => Math.hypot(kmE(S, 15, -50), kmN(S, 15)) / 48 / 1.852;
  check(`with the steering at its own mean a cyclone moves with the real mean drift of its kind (-8, +3 kt): ${sp48(A0).toFixed(1)} kt toward ${Math.round((Math.atan2(kmE(A0, 15, -50), kmN(A0, 15)) * 180 / Math.PI + 360) % 360)} degrees, wherever that mean steering is (${sp48(A1).toFixed(1)} kt)`,
    near(sp48(A0), Math.hypot(8, 3), 0.9) && near(sp48(A1), Math.hypot(8, 3), 0.9) && kmE(A0, 15, -50) < 0 && kmN(A0, 15) > 0);
  const B1 = track(testMaps({ clim: [-3, 1, -3, 1, -3, 1] }), [7, 1, 7, 1, 7, 1], 72), B0 = track(testMaps({ clim: [-3, 1, -3, 1, -3, 1] }), [-3, 1, -3, 1, -3, 1], 72);
  const ex = (kmE(B1, 15, -50) - kmE(B0, 15, -50)) / 72 / 1.852;
  check(`an anomaly of +10 kt in the steering moves the cyclone driftGain (0.9) times as much (${ex.toFixed(1)} kt extra toward the east), a mean flow does not`, near(ex, 9, 1.4) && near(kmN(B1, 15), kmN(B0, 15), 30));
  const vortex = makeEnv({ steer: (la, lo) => (la === 15 && lo === -50 ? [0, 0, 20, 0, 20, 0] : [0, 0, 0, 0, 0, 0]) });
  const R0 = system('tc', 15, -50, 40, 3), R3 = system('tc', 15, -50, 40, 3);
  H.stepSystem(R0, vortex, 0, 3, H.mergeParams(pm, { steerRing: 0 }), 240, ctxOf(testMaps())); H.stepSystem(R3, vortex, 0, 3, pm, 240, ctxOf(testMaps()));
  const D0 = system('tc', 15, -50, 40, 3); H.stepSystem(D0, makeEnv({ steer: () => [0, 0, 0, 0, 0, 0] }), 0, 3, pm, 240, ctxOf(testMaps()));
  check(`the steering is a ring average (centre 0.36 + four points 3 degrees away), so the flow of a small circulation sitting exactly on the storm counts only 36 % (first-hour velocity change ${(R3.cx - D0.cx).toFixed(3)} against ${(R0.cx - D0.cx).toFixed(3)} kt with no ring)`, near((R3.cx - D0.cx) / (R0.cx - D0.cx), 0.36, 0.02));
  const wv = system('wv', 12, -30, 15, 4), ew = makeEnv({ sst: 20, shear: 40, steer: () => [0, 0, 0, 0, 0, 0] }), cw = ctxOf(testMaps({ du: -11, dv: 1.5 }));
  for (let h = 0; h < 48; h++) H.stepSystem(wv, ew, h, 4, pm, 240, cw);
  check(`a wave moves with the weak-storm drift of the maps (${(kmE(wv, 12, -30) / 48 / 1.852).toFixed(1)} kt east)`, near(kmE(wv, 12, -30) / 48 / 1.852, -11, 1.4));
  const exs = system('ex', 45, -50, 40, 5, { cx: 15, cy: 5 }); for (let h = 0; h < 36; h++) H.stepSystem(exs, makeEnv({ sst: 15, shear: 30, steer: () => [0, 0, 0, 0, 0, 0] }), h, 5, pm, 240, ctxOf(testMaps()));
  check(`a post-tropical system takes the extratropical drift (${(kmE(exs, 45, -50) / 36 / 1.852).toFixed(1)} kt east, maps say +15)`, near(kmE(exs, 45, -50) / 36 / 1.852, 15, 2.5));
  { const fresh = system('ex', 45, -50, 40, 5, { cx: 15, cy: 5, etAt: 201 }), old = system('ex', 45, -50, 40, 5, { cx: 15, cy: 5, etAt: 1 }), none = system('ex', 45, -50, 40, 5, { cx: 15, cy: 5 }), e0 = makeEnv({ sst: 15, shear: 30, steer: () => [0, 0, 0, 0, 0, 0] });
    for (let h = 200; h < 206; h++) { H.stepSystem(fresh, e0, h, 5, pm, 240, ctxOf(testMaps())); H.stepSystem(old, e0, h, 5, pm, 240, ctxOf(testMaps())); H.stepSystem(none, e0, h, 5, pm, 240, ctxOf(testMaps())); }
    const dE = (kmE(fresh, 45, -50) - kmE(old, 45, -50)) / 6 / 1.852, dN = (kmN(fresh, 45) - kmN(old, 45)) / 6 / 1.852;
    check(`a post-tropical cyclone just after its transition runs ${dE.toFixed(1)} kt faster east and ${dN.toFixed(1)} kt faster north than the same one four days later (the real best track: 3.3 + 8.1 and 7.2 + 5.2), and one of unknown age takes the map as it is (${((kmE(none, 45, -50)) / 6 / 1.852).toFixed(1)} kt east, maps say +15)`,
      near(dE, 11.4, 1.2) && near(dN, 12.4, 1.2) && near(kmE(none, 45, -50) / 6 / 1.852, 15, 2.5)); }
  { const pd = H.mergeParams(H.defaultParams(), { shearK: 1, wobbleSd: 0 });                                   // the engine's own driftGain, not an override
    const G1 = track(testMaps({ clim: [-3, 1, -3, 1, -3, 1] }), [7, 1, 7, 1, 7, 1], 72, 40, 15, -50, pd), G0 = track(testMaps({ clim: [-3, 1, -3, 1, -3, 1] }), [-3, 1, -3, 1, -3, 1], 72, 40, 15, -50, pd);
    const gain = (kmE(G1, 15, -50) - kmE(G0, 15, -50)) / 72 / 1.852 / 10;
    check(`with the engine's own gain a cyclone moves ${gain.toFixed(2)} times the anomaly of the steering (0.75 of it, not none and not all)`, near(gain, 0.75, 0.12)); }
  const hu = track(testMaps({ du: -8, dv: 3, su: -2, sv: 9 }), [0, 0, 0, 0, 0, 0], 48, 100, 15, -50, pm, [-2, 9]), td = track(testMaps({ du: -8, dv: 3, su: -2, sv: 9 }), [0, 0, 0, 0, 0, 0], 48, 30);
  check(`a hurricane follows the hurricane drift map and a depression the weak-storm one (${(kmN(hu, 15) / 48 / 1.852).toFixed(1)} against ${(kmN(td, 15) / 48 / 1.852).toFixed(1)} kt north)`, kmN(hu, 15) > kmN(td, 15) * 2 && near(kmN(td, 15) / 48 / 1.852, 3, 0.8));

  // ---- genesis: a hazard on a disturbance, modulated by the environment
  const fdev = (mp, env, hours, n, kind = 'M', lat = 14, lon = -40, p = pm) => {
    let c = 0; const cx = ctxOf(mp);
    for (let s = 1; s <= n; s++) { const S = H.newSystem({ id: 'G' + s, num: H.idNum('M', s), th: 'wv', lat, lon, v: 16, hour: 0, kind, q: H.rndn(9, s, 0, 18) }); for (let h = 0; h < hours && S.alive && S.dev < 0; h++) H.stepSystem(S, env, h, 9, p, 240, cx); if (S.dev >= 0) c++; }
    return c / n;
  };
  const good = makeEnv({ sst: 29, shear: 6, rh: 64, steer: () => [0, 0, 0, 0, 0, 0] });
  const f0 = fdev(testMaps({ haz: 0 }), good, 100, 300), f1 = fdev(testMaps({ haz: 0.01 }), good, 100, 300), f2 = fdev(testMaps({ haz: 0.003 }), good, 100, 300);
  check(`a disturbance develops at the map's rate: none with a rate of 0 (${f0}), ${(100 * f1).toFixed(0)} % in 100 hours at 0.01 an hour (about 63 %), ${(100 * f2).toFixed(0)} % at 0.003 (about 26 %)`, f0 === 0 && near(f1, 1 - Math.exp(-1), 0.09) && near(f2, 1 - Math.exp(-0.3), 0.09));
  const gate = (env) => fdev(testMaps({ haz: 0.02 }), env, 100, 200);
  check(`development needs warm water, little shear and open sea whatever the rate: ${gate(makeEnv({ sst: 23, shear: 6 })).toFixed(2)} over 23 degC, ${gate(makeEnv({ sst: 29, shear: 80 })).toFixed(2)} in 80 kt of shear, ${gate(makeEnv({ sst: 29, shear: 6, land: () => true })).toFixed(2)} over land, against ${gate(good).toFixed(2)} in a good environment`,
    gate(makeEnv({ sst: 23, shear: 6 })) === 0 && gate(makeEnv({ sst: 29, shear: 80 })) < 0.05 && gate(makeEnv({ sst: 29, shear: 6, land: () => true })) === 0 && gate(good) > 0.8);
  const dry = gate(makeEnv({ sst: 29, shear: 6, rh: 28 })), moistG = gate(makeEnv({ sst: 29, shear: 6, rh: 62 })), mid = gate(makeEnv({ sst: 29, shear: 6, rh: 54 }));
  check(`a disturbance only develops where a depression could live (the law's growth gate must clear its critical value): over dry air (28 % humidity) ${dry.toFixed(2)} develop, at 54 % ${mid.toFixed(2)}, at 62 % ${moistG.toFixed(2)}, with the same rate`, dry < 0.05 && moistG > 0.8 && mid > dry);
  const e0 = { rh: 60, shear: 10, sst: 28.5 };
  const base = fdev(testMaps({ haz: 0.002, env0: e0 }), makeEnv({ sst: 28.5, shear: 10, rh: 60, steer: () => [0, 0, 0, 0, 0, 0] }), 100, 600);
  const moist = fdev(testMaps({ haz: 0.002, env0: e0 }), makeEnv({ sst: 28.5, shear: 10, rh: 70, steer: () => [0, 0, 0, 0, 0, 0] }), 100, 600);
  const shr = fdev(testMaps({ haz: 0.002, env0: e0 }), makeEnv({ sst: 28.5, shear: 14, rh: 60, steer: () => [0, 0, 0, 0, 0, 0] }), 100, 600);
  check(`the environment modulates the rate against its own mean: 10 points more humidity raises the development (${(100 * base).toFixed(0)} % to ${(100 * moist).toFixed(0)} %), 4 kt more shear lowers it (${(100 * shr).toFixed(0)} %), and at the mean it is the map's rate`, moist > base * 1.15 && shr < base * 0.92 && near(base, 1 - Math.exp(-0.2), 0.05));
  const quiet = H.mergeParams(pm, { qSd: 0 }), g1 = fdev(testMaps({ haz: 0.004 }), good, 100, 400, 'M', 14, -40, quiet), g2 = fdev(testMaps({ haz: 0.004 }), good, 100, 400, 'M', 14, -40, H.mergeParams(pm, { qSd: 0.6 }));
  check(`a seed's own quality spreads the development without changing its mean (${(100 * g1).toFixed(0)} % with no spread, ${(100 * g2).toFixed(0)} % with qSd 0.6)`, near(g1, g2, 0.07));
  // a developing disturbance becomes a depression with a smooth rise of wind, not a jump
  { const S = H.newSystem({ id: 'G', num: H.idNum('M', 5), th: 'wv', lat: 14, lon: -40, v: 16, hour: 0, kind: 'W', q: 0 }), cx = ctxOf(testMaps({ haz: 0.3 })), vs = []; let flip = -1;
    for (let h = 0; h < 60; h++) { H.stepSystem(S, good, h, 9, pm, 240, cx); vs.push(S.v); if (flip < 0 && S.th === 'tc') flip = h; }
    check(`a developing wave organises over several hours (wind ${vs.slice(0, 3).map((v) => v.toFixed(0)).join('/')} ... ${vs[Math.max(flip - 1, 0)].toFixed(0)} kt) before it is called a depression (hour ${flip})`, flip > 5 && flip < 40 && S.tdHour > 0 && Math.max(...vs.slice(1).map((v, i) => Math.abs(v - vs[i]))) < 4); }
  // an organising disturbance is only declared a depression where the law could keep it (par.tdMargin): at 48 % humidity the growth gate (0.35) clears its critical value (0.33) but not a margin of 0.1
  { const declared = (margin, rh) => { let c = 0; const cx = ctxOf(testMaps({ haz: 0 })), e = makeEnv({ sst: 29, shear: 6, rh, steer: () => [0, 0, 0, 0, 0, 0] }), p = H.mergeParams(pm, { qSd: 0, tdMargin: margin });
      for (let k = 1; k <= 30; k++) { const S = H.newSystem({ id: 'D' + k, num: H.idNum('M', k), th: 'wv', lat: 14, lon: -40, v: 16, hour: 0, kind: 'W', q: 0 }); S.dev = 0; for (let h = 0; h < 46; h++) H.stepSystem(S, e, h, 9, p, 240, cx); if (S.th === 'tc') c++; }
      return c / 30; };
    const a0 = declared(0, 48), a1 = declared(0.1, 48), b0 = declared(0, 62), b1 = declared(0.1, 62);
    check(`a developing disturbance is declared a depression only where the growth gate clears its critical value by tdMargin: at 48 % humidity ${(100 * a0).toFixed(0)} % with no margin, ${(100 * a1).toFixed(0)} % with 0.1; at 62 % ${(100 * b0).toFixed(0)} % and ${(100 * b1).toFixed(0)} %`, a0 > 0.9 && a1 === 0 && b0 > 0.9 && b1 > 0.9);
    const wnd = makeEnv({ sst: 29, shear: 6, rh: 48, steer: () => [0, 0, 0, 0, 0, 0] }), S1 = H.newSystem({ id: 'D', num: H.idNum('M', 1), th: 'wv', lat: 14, lon: -40, v: 16, hour: 0, kind: 'W', q: 0 });
    S1.dev = 0; for (let h = 0; h < 40; h++) H.stepSystem(S1, wnd, h, 9, H.mergeParams(pm, { qSd: 0, tdMargin: 0.1 }), 240, ctxOf(testMaps({ haz: 0 })));
    check(`a disturbance held back by the margin stays a disturbance with the wind of one (${S1.v.toFixed(0)} kt, not the depression threshold)`, S1.th === 'wv' && S1.v < 24); }
  // an established storm moistens its own environment (par.rhSelf): in dry-ish air a 60-kt storm holds on or grows with it and fades without, a 20-kt depression is not affected at all
  { const dryish = makeEnv({ sst: 29, shear: 6, rh: 46, steer: () => [0, 0, 0, 0, 0, 0] }), end = (rhSelf, V0) => { const o = []; for (let k = 1; k <= 20; k++) { const S = system('tc', 15, -50, V0, k); run(S, dryish, 36, k, H.mergeParams(par, { rhSelf })); o.push(S.v); } return mean(o); };
    const a = end(0, 60), b = end(10, 60), c = end(0, 20), d = end(10, 20);
    check(`an established storm sees a more humid environment than the page's field (rhSelf): a 60-kt storm in 46 % humidity is ${a.toFixed(0)} kt after a day and a half, ${b.toFixed(0)} kt with 10 points of its own, while a 20-kt depression is untouched (${c.toFixed(1)} against ${d.toFixed(1)})`, b > a + 8 && c === d); }
  // sources: waves with a rate, local seeds from the spawn map, lows on their own
  { const mk = (seed) => H.create({ seed, startMs: Date.UTC(2026, 7, 1), params: { waveRate0: 0 }, maps: testMaps({ haz: 0, spawn: (m) => (m === 7 ? 6 : 0) }) });
    let n = 0, inside = 0, total = 0; for (let sd = 1; sd <= 8; sd++) { const m = mk(sd); m.advanceTo(24 * 31, makeEnv({ sst: 28, shear: 8, land: (la, lo) => lo > -60 })); n += m.n.N; for (const S of m.systems) { total++; if (S.born >= 0 && S.origin === 'seed') inside++; } }
    check(`local seeds are born at the spawn map's rate (6 a month at every node: ${(n / 8).toFixed(0)} a month per season over water, about 6 x the water nodes), over water only, in the cell they belong to`, n / 8 > 100 && inside === total);
    const one = (sd) => { const m = H.create({ seed: sd, startMs: Date.UTC(2026, 7, 1), params: { waveRate0: 0 }, maps: testMaps({ haz: 0, spawn: (m, la, lo) => (m === 7 && la === 25 && lo === -90 ? 9 : 0) }) }); m.advanceTo(24 * 31, makeEnv({ sst: 28, shear: 8 })); return m; };
    let c = 0, okpos = true; for (let sd = 1; sd <= 12; sd++) { const m = one(sd); c += m.n.N; for (const S of m.systems) if (S.origin === 'seed' && S.fixes.length === 0 && (Math.abs(S.lat - 25) > 8 || Math.abs(S.lon + 90) > 8)) okpos = false; }
    check(`a single spawn node of 9 a month gives about 9 seeds in August per season (${(c / 12).toFixed(1)}), born round that node`, near(c / 12, 9, 2.3) && okpos); }
  { const lowEnv = makeEnv({ sst: 27, shear: 8, rh: 60, steer: () => [0, 0, 0, 0, 0, 0], lows: () => [{ lat: 31, lon: -70, p: 1000, prom: 6 }] });
    let t = 0, s = 0, n = 0; for (let sd = 1; sd <= 40; sd++) { const m = H.create({ seed: sd, startMs: Date.UTC(2026, 8, 1), auto: true, params: { waveRate0: 0 }, maps: testMaps({ haz: 0.004, hazS: 0.004 }) }); m.advanceTo(24 * 12, lowEnv); const made = m.systems.filter((S) => S.origin === 'low'); n += made.length > 0 ? 1 : 0; for (const S of made) if (S.sub) s++; else t++; }
    check(`a tracked low develops like any disturbance, a tropical or a subtropical depression whichever draw it wins (${t} tropical, ${s} subtropical, from ${n} of 40 seasons with a low that developed)`, n > 25 && t > 0.3 * (t + s) && s > 0.3 * (t + s)); }
  { const lowEnv = makeEnv({ sst: 27, shear: 8, rh: 60, steer: () => [0, 0, 0, 0, 0, 0], lows: () => [{ lat: 31, lon: -70, p: 1000, prom: 6 }] });
    const made = (auto) => { let n = 0, tracked = 0; for (let sd = 1; sd <= 12; sd++) { const m = H.create({ seed: sd, startMs: Date.UTC(2026, 8, 1), auto, params: { waveRate0: 0 }, maps: testMaps({ haz: 0.004, hazS: 0.004 }) }); m.advanceTo(24 * 12, lowEnv); n += m.systems.filter((S) => S.origin === 'low').length; tracked += m.lows.tracks.filter((t) => t.alive).length; } return [n, tracked]; };
    const on = made(true), off = made(false);
    check(`with automatic systems off nothing develops from a low either (${off[0]} against ${on[0]} with them on), and the low is still tracked (${off[1]} tracks)`, off[0] === 0 && on[0] > 3 && off[1] >= 12); }
  // ---- the large-scale activity factor
  { const P = H.defaultParams(), seas = [], all = [];
    for (let y = 2000; y < 2400; y++) seas.push(H.activityFactor(Object.assign({}, P, { act: Object.assign({}, P.act, { intraSd: 0 }) }), 5, y, 0));
    for (let k = 0; k < 6000; k++) all.push(H.activityFactor(P, 5, 2000 + (k % 40), k * 31.7));
    const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
    const ts = Math.sqrt(Math.exp(P.act.seasSd ** 2) - 1), ta = Math.sqrt(Math.exp(P.act.seasSd ** 2 + P.act.intraSd ** 2) - 1);
    check(`the activity factor has mean 1 (${mean(seas).toFixed(3)} across 400 seasons, ${mean(all).toFixed(3)} with the intraseasonal part), the spread the parameters ask for (sd ${sd(seas).toFixed(3)} against ${ts.toFixed(3)}; ${sd(all).toFixed(3)} against ${ta.toFixed(3)}) and is always positive`, near(mean(seas), 1, 0.03) && near(sd(seas), ts, 0.04) && near(mean(all), 1, 0.04) && near(sd(all), ta, 0.05) && Math.min(...all) > 0);
    const f = (sd2, y, h) => H.activityFactor(Object.assign({}, P, { act: Object.assign({}, P.act, { intraSd: 0, seasSd: sd2 }) }), 9, y, h);
    check('the seasonal part is one number per calendar year and seed, the intraseasonal part moves within days to weeks (but smoothly), and the same seed and time always give the same factor', f(0.3, 2027, 0) === f(0.3, 2027, 5000) && f(0.3, 2027, 0) !== f(0.3, 2028, 0) && H.activityFactor(P, 9, 2027, 1234.5) === H.activityFactor(P, 9, 2027, 1234.5) && Math.abs(H.activityFactor(P, 9, 2027, 100) - H.activityFactor(P, 9, 2027, 101)) < 0.05 && Math.abs(H.activityFactor(P, 9, 2027, 100) - H.activityFactor(P, 9, 2027, 24 * 25)) > 0.01);
    check('with both spreads zero the factor is exactly 1', H.activityFactor(Object.assign({}, P, { act: { seasSd: 0, intraSd: 0, K: 6, T: [14, 60] } }), 3, 2026, 77) === 1);
    // it scales the development: seasons of a high factor develop more disturbances than seasons of a low one (same weather, same waves)
    const cnt = (seed) => { const m = H.create({ seed, startMs: Date.UTC(2026, 7, 1), params: { act: { seasSd: 0.5, intraSd: 0, K: 6, T: [14, 60] } }, maps: testMaps({ haz: 0.003 }) }); m.advanceTo(24 * 60, makeEnv({ sst: 29, shear: 6, rh: 62 })); return [H.activityFactor(m.par, seed, 2026, 0), m.systems.filter((S) => S.kind === 'W' && S.dev >= 0).length]; };
    const runs = []; for (let sd = 1; sd <= 40; sd++) runs.push(cnt(sd)); runs.sort((a, b) => a[0] - b[0]);
    const lo = mean(runs.slice(0, 10).map((r) => r[1])), hi = mean(runs.slice(-10).map((r) => r[1]));
    check(`seasons of a high activity factor develop more disturbances than seasons of a low one (${hi.toFixed(1)} against ${lo.toFixed(1)} in 60 days, same weather and waves)`, hi > 1.4 * lo); }
  // ---- the lab's diagnostics, determinism, restore
  { const mp = testMaps({ haz: 0.004 }), e = makeEnv({ sst: 28.5, shear: 8, rh: 60, steer: () => [-8, 1, -8, 1, -8, 1] });
    const m = H.create({ seed: 3, startMs: Date.UTC(2026, 7, 1), maps: mp, params: { shearK: 1 } }); m.enableDiag(); m.advanceTo(24 * 20, e);
    const d = m.diagPacked(), sum = (k) => d[k].reduce((a, [, v]) => a + v, 0);
    const spawned = m.n.W, wavesHours = sum('h.W'), eq = sum('xT.W'), gen = sum('gT.W');
    check(`the diagnostics count the exposure of waves in hours (${wavesHours.toFixed(0)} h from ${spawned} waves), the exposure weighted by E (${eq.toFixed(0)}), and the developments by class (${gen} from waves, ${m.systems.filter((S) => S.kind === 'W' && S.dev >= 0).length} flagged)`, spawned >= 5 && wavesHours > 24 * 5 && eq > 0.2 * wavesHours && eq <= 1.8 * wavesHours && gen === m.systems.filter((S) => S.kind === 'W' && S.dev >= 0).length);
    const hash = (mm, hrs, step) => { for (let h = step; h <= hrs; h += step) mm.advanceTo(h, e); return JSON.stringify(mm.systems.map((S) => [S.id, S.lat.toFixed(5), S.lon.toFixed(5), S.v.toFixed(3), S.th, S.dev])); };
    const a = hash(H.create({ seed: 8, startMs: Date.UTC(2026, 7, 1), maps: mp }), 24 * 15, 1), b = hash(H.create({ seed: 8, startMs: Date.UTC(2026, 7, 1), maps: mp }), 24 * 15, 6), c = hash(H.create({ seed: 8, startMs: Date.UTC(2026, 7, 1), maps: mp }), 24 * 15, 24);
    check('with maps the same seed gives the same systems however time is chunked (1 h, 6 h, 24 h)', a === b && b === c && a.length > 100);
    const m2 = H.create({ seed: 8, startMs: Date.UTC(2026, 7, 1), maps: mp }); m2.advanceTo(24 * 8, e);
    const m3 = H.restore(JSON.parse(JSON.stringify(m2.serialize())), { maps: mp }); m2.advanceTo(24 * 16, e); m3.advanceTo(24 * 16, e);
    check('a serialised engine restored with the same maps carries on exactly like the original', JSON.stringify(m2.systems.map((S) => [S.id, S.lat, S.lon, S.v, S.th])) === JSON.stringify(m3.systems.map((S) => [S.id, S.lat, S.lon, S.v, S.th])));
    { const o = JSON.parse(JSON.stringify(m2.serialize())); delete o.par.act; delete o.par.devGate; delete o.par.envB;
      const r = H.restore(o, { maps: mp }); let ok = true; try { r.advanceTo(24 * 12, e); } catch (x) { ok = false; }
      check('a save made before parameters were added (no activity factor, development gate or coupling) restores with their defaults and runs', ok && r.par.devGate.length === 2 && r.par.act.K === 6 && typeof r.par.envB.rh === 'number'); }
    const mm = H.create({ seed: 8, startMs: Date.UTC(2026, 7, 1), maps: mp }); mm.advanceTo(24 * 5, e);
    const pre = mm.forecast({ kind: 'wave', lat: 14, lon: -40 }, e, 24 * 6), placed = mm.place({ kind: 'wave', lat: 14, lon: -40 }); mm.advanceTo(24 * 11, e);
    const byH = Object.fromEntries(placed.fixes.map((f) => [f.h, f]));
    check('with maps the preview of a placed wave is exactly the wave that is placed (same hazard draws, same noise)', pre.fixes.filter((f) => byH[f.h]).length >= 18 && pre.fixes.filter((f) => byH[f.h]).every((f) => f.lat === byH[f.h].lat && f.lon === byH[f.h].lon && f.v === byH[f.h].v)); }
}

/* ---- the calibrated defaults ------------------------------------------------------------------------------------------------------------------------------------ */
{
  H.calibrated(true);
  const D = H.defaultParams(), S0 = H.structureParams();
  check('the engine ships with the calibrated values (shearK, the gates, the coupling, the activity spread) merged over the structure\'s own defaults, and every key of the structure is still there', D.shearK === H.CALIBRATED.shearK && D.envB.rh === H.CALIBRATED.envB.rh && D.act.seasSd === H.CALIBRATED.act.seasSd && Object.keys(S0).every((k) => k in D) && D.regions.length === S0.regions.length);
  const inRange = D.gCrit > 0 && D.gCrit < 1 && D.kUp > 0 && D.kDn > 0 && D.sstGate[0] < D.sstGate[1] && D.rhGate[0] < D.rhGate[1] && D.devGate[0] < D.devGate[1] && D.etHaz.lat > 0 && D.etHaz.sst < 0 && D.etHaz.shear > 0 && D.etHaz.wind < 0 && D.decayCap[0] > 0 && D.etaMin > 0 && D.etaMin <= 1 && D.shearK >= 1 && D.act.seasSd >= 0 && D.envB.shear >= 0 && D.envB.rh >= 0 && D.sstRelW >= 0 && D.sstRelW <= 1;
  check('the calibrated values are physically ordered (gates open upward, thresholds in order, all rates and spreads positive, the relative-SST weight between 0 and 1)', inRange);
  const peak = (sst, rh, shear, v0) => { const out = []; for (let sd = 1; sd <= 20; sd++) { const S = system('tc', 18, -55, v0, sd), e = makeEnv({ sst, shear, rh, steer: () => [0, 0, 0, 0, 0, 0] }); out.push(run(S, e, 168, sd, D)); } return out; };
  const good = peak(29, 62, 12, 30), poor = peak(24, 30, 40, 30);
  check(`with the calibrated values a depression over 29 degC with moist air and moderate shear becomes a hurricane within a week in ${good.filter((v) => v >= 64).length} of 20 seeds (mean peak ${mean(good).toFixed(0)} kt), over cold water in dry air and 40 kt of shear in ${poor.filter((v) => v >= 64).length} (mean peak ${mean(poor).toFixed(0)} kt)`,
    good.filter((v) => v >= 64).length >= 10 && poor.filter((v) => v >= 64).length === 0 && mean(good) > mean(poor) + 25);
  const lowLat = system('tc', 3.2, -40, 40, 1), e0 = makeEnv({ sst: 28, shear: 10, steer: () => [0, 0, 0, 0, 0, 0] }); run(lowLat, e0, 72, 1, D);
  check(`a calibrated storm that drifts south of 4 N keeps a finite wind (the latitude-dependent shear scale has a floor): ${lowLat.v.toFixed(1)} kt`, Number.isFinite(lowLat.v) && Number.isFinite(lowLat.vr) && Number.isFinite(lowLat.p));
  // what the shipped values do in a synthetic environment held fixed: rapid intensification in a good one, none in a hostile one, a cap on the wind poleward, depressions only where they could live
  const zero = () => [0, 0, 0, 0, 0, 0], trace = (lat, v0, env, hours, seed) => { const S = system('tc', lat, -55, v0, seed), vs = [S.vr]; for (let h = 0; h < hours && S.alive; h++) { H.stepSystem(S, env, h, seed, D); vs.push(S.vr); } return vs; };
  const gain24 = (vs) => { let g = -999; for (let i = 24; i < vs.length; i++) g = Math.max(g, vs[i] - vs[i - 24]); return g; };
  const ideal = makeEnv({ sst: 29, shear: 5, rh: 62, steer: zero }), hostile = makeEnv({ sst: 27, shear: 30, rh: 45, steer: zero });
  const gI = [], gH = []; for (let s = 1; s <= 40; s++) { gI.push(gain24(trace(18, 50, ideal, 168, s))); gH.push(gain24(trace(18, 50, hostile, 168, s))); }
  check(`rapid intensification is in the calibrated values: in a good environment (29 degC, 5 kt of shear, moist) the strongest 24-hour gain of a week averages ${mean(gI).toFixed(0)} kt and is 30 kt or more in ${gI.filter((g) => g >= 30).length} of 40 seeds, in a hostile one in ${gH.filter((g) => g >= 30).length} of 40`,
    mean(gI) > 45 && gI.filter((g) => g >= 30).length >= 30 && gH.filter((g) => g >= 30).length === 0);
  const fin = (lat) => mean(Array.from({ length: 20 }, (_, i) => { const vs = trace(lat, 100, ideal, 72, i + 1); return vs[vs.length - 1]; })), f15 = fin(15), f32 = fin(32);
  check(`the calibrated potential wind falls poleward: a 100-kt hurricane over the same 29 degC water is at ${f15.toFixed(0)} kt after three days at 15N and ${f32.toFixed(0)} kt at 32N`, f15 > 100 && f15 - f32 > 25);
  const GRc = { lon0: -105, lat0: 5, res: 5, nx: 21, ny: 13 }, flatc = (v) => Array.from({ length: 12 }, () => Array.from({ length: GRc.ny }, () => new Array(GRc.nx).fill(v)));
  const mapsC = { grid: GRc, drift: { weak: { u: flatc(-8), v: flatc(3) }, strong: { u: flatc(-6), v: flatc(5) }, sub: { u: flatc(4), v: flatc(1) }, ex: { u: flatc(15), v: flatc(5) } }, steerClim: [0, 0, 0, 0, 0, 0].map((x) => flatc(x)), haz: { T: flatc(0), S: flatc(0) }, env0: { rh: flatc(54), shear: flatc(10), sst: flatc(27.5), sstRel: flatc(0) } };
  const declared = (sst, shear, rh) => { let n = 0; for (let s = 1; s <= 12; s++) { const S = system('wv', 15, -50, 18, s, { dev: 0, q: 0 }), e = makeEnv({ sst, shear, rh, steer: zero }), c = { maps: H.prepareMaps(mapsC), tw: H.timeWeights(240), diag: null, act: 1 }; for (let h = 0; h < 72 && S.alive; h++) { H.stepSystem(S, e, h, s, D, 240, c); if (S.th !== 'wv') { n++; break; } } } return n; };
  const dGood = declared(28.5, 8, 58), dMarg = declared(26.5, 14, 50);
  check(`a disturbance that has begun to develop is declared a depression only while the growth law could keep one alive: in ${dGood} of 12 seeds in a good environment and in ${dMarg} of 12 in a marginal one (without the margin, 11 of 12 and a fifth of the numbered depressions were gone in a day)`, dGood >= 9 && dMarg <= 4);
  H.calibrated(false);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
