// Node-only tests of the storm engine (src/storms.js): no browser, no build. Run by `npm test` before the Playwright suite.
// The engine is exercised on synthetic environments (tests/storms_env.mjs) so one physical response can be checked at a time;
// the statistics of whole seasons against the real best track are a separate, calibrated job (tools/make_tc_ref.py).
import { readFileSync } from 'node:fs';
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
  const aceFix = storms.reduce((a, S) => a + S.fixes.filter((f) => f.h % 6 === 0 && (f.th === 'tc' || f.th === 'sc') && f.v >= 34).reduce((b, f) => b + H.aceOf(f.v), 0), 0);
  check('season ACE equals the sum of (v/100)^2 over the synoptic (00 / 06 / 12 / 18Z) tropical / subtropical fixes of 34 kt or more (' + st.ace + ')', near(aceFix, st.ace, 0.2) && near(m.season.aceDaily.reduce((a, b) => a + b, 0), st.ace, 0.2));
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
  const ex = S.fixes.filter((f) => f.th === 'ex' && f.v >= 35), tc = S.fixes.filter((f) => f.th === 'tc' && f.h % 6 === 0);
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
    const byH2 = {}; for (const f of pl.fixes) if (f.h <= 6 * 24) byH2[f.h] = f;
    check(`the preview of a placed ${spec2.kind === 'td' ? 'tropical depression' : spec2.kind === 'sd' ? 'subtropical depression' : 'low'} is the placed system's track too (${pre2.fixes.length} fixes, ends ${pre2.alive ? 'alive' : pre2.endReason})`,
      pre2.fixes.length > 2 && pre2.fixes.slice(1).filter((f) => f.h % 3 === 0).every((f) => byH2[f.h] && Math.abs(f.lat - byH2[f.h].lat) < 1e-9 && Math.abs(f.lon - byH2[f.h].lon) < 1e-9 && f.v === byH2[f.h].v) && (spec2.kind !== 'low' || pre2.fixes.length > 16));
  }
  check('a preview changes nothing in the manager (no ids, no counters)', m.n.M === 1 && H.create({ seed: 12, startMs: START, auto: false }).forecast(spec, envNow, 48) && true);
  const p1 = H.create({ seed: 55, startMs: START }), p2 = H.create({ seed: 55, startMs: START });
  p2.place({ kind: 'td', lat: 25, lon: -60 });
  p1.advanceTo(60 * 24, src); p2.advanceTo(60 * 24, src);
  const key = (mgr) => JSON.stringify(mgr.systems.filter((S) => S.id[0] === 'W' || S.id[0] === 'N').map((S) => [S.id, S.fixes.length, S.lat, S.lon, S.v]));
  check('hand-placing a storm does not change any automatic wave or seed', key(p1) === key(p2));
  const dev = H.create({ seed: 3, startMs: START, auto: false }), far = dev.forecast({ kind: 'td', lat: 15, lon: -50 }, makeEnv({ sst: 29, shear: 5 }), 240);
  check('a forecast reports peak, development, ACE and fixes every three hours from the start', far.fixes[0].h === 0 && far.fixes[1].h === 3 && far.fixes[2].h === 6 && far.peak.v >= 100 && far.developed && far.ace > 5 && far.fixes.length >= 80);
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
  const live2 = [C, m2.place({ kind: 'td', lat: 14, lon: -30 }), m2.place({ kind: 'td', lat: 20, lon: -50 }), m2.place({ kind: 'td', lat: 16, lon: -35 }), m2.place({ kind: 'td', lat: 12, lon: -45 })];
  m2.advanceTo(40 * 24, env);
  check('the finished season is closed once its last storm dies, and the new year starts again from the 2027 list', m2.archive.length === 1 && !m2.archive[0].open && m2.archive[0].storms.length >= 1 && H.nameFor(2027, 0) === 'Ana');
  check('the archived storms keep their ACE unrounded (the page rounds once, to a tenth: rounding here too turned 10.5475 into 10.55 and then 10.6): ' + m2.archive[0].storms.map((x) => x.ace).join(', '),
    m2.archive[0].storms.length >= 4 && m2.archive[0].storms.every((x) => x.ace === live2.find((q) => q.id === x.id).ace) && m2.archive[0].storms.some((x) => x.ace > 0 && Math.abs(x.ace * 100 - Math.round(x.ace * 100)) > 1e-6));
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
  check('the transition hazard rises with latitude and shear, falls with warm water and with the storm\'s own wind, and fades out in the tropics (a ramp from 12N, negligible at 15N, zero at 12N and south of it)',
    hz(40, 20, 40, 60) > hz(35, 20, 40, 60) && hz(40, 20, 50, 60) > hz(40, 20, 30, 60) && hz(40, 26, 40, 60) < hz(40, 20, 40, 60) && hz(40, 20, 40, 100) < hz(40, 20, 40, 40) && hz(15, 20, 40, 60) < 0.003 && hz(12, 20, 40, 60) === 0 && hz(10, 20, 40, 60) === 0);
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
  // ---- the El Nino part (par.enso): the development rates' activity and the places of the maps, both nothing at zero
  { const base = { waveRate0: 0, act: { seasSd: 0, intraSd: 0, K: 6, T: [14, 60] } };
    const run = (sd, mp, enso, z, hours = 24 * 25) => { const e = makeEnv({ sst: 28.5, shear: 8, rh: 60, steer: () => [-8, 1, -8, 1, -8, 1], enso: z == null ? undefined : () => z });
      const m = H.create({ seed: sd, startMs: Date.UTC(2026, 7, 1), params: Object.assign({}, base, enso ? { enso } : {}), maps: mp }); m.advanceTo(hours, e); return m; };
    const sig = (m) => JSON.stringify(m.systems.map((S) => [S.id, S.lat, S.lon, S.v, S.th, S.dev]));
    const mpA = testMaps({ haz: 0.004, spawn: (m) => (m === 7 ? 3 : 0) });
    let same = true; for (let sd = 1; sd <= 4; sd++) same = same && sig(run(sd, mpA, null, null)) === sig(run(sd, mpA, null, 2)) && sig(run(sd, mpA, { act: 0, lon: 0, lat: 0 }, 2)) === sig(run(sd, mpA, null, null));
    check('with the El Nino parameters at zero the engine is what it was, bit for bit, whether the host supplies an index or not', same);
    const dep = (m) => m.systems.filter((S) => S.depNum > 0).length;
    let d0 = 0, d1 = 0, d2 = 0; for (let sd = 1; sd <= 30; sd++) { d0 += dep(run(sd, mpA, { act: Math.log(2) }, 0)); d1 += dep(run(sd, mpA, { act: Math.log(2) }, 1)); d2 += dep(run(sd, mpA, { act: Math.log(2) }, -1)); }
    check(`an El Nino activity of ln 2 a degree doubles the development rates at +1 and halves them at -1 (depressions in 30 seasons: ${d2} at -1, ${d0} at 0, ${d1} at +1)`, d1 > 1.5 * d0 && d2 < 0.7 * d0 && d0 > 20);
    // the places: a bump of development rate and of seed supply at 85W, 25N; +10 degrees east and -3 north a degree
    const bump = (peak) => (m, la, lo) => (Math.abs(la - 25) < 6 && Math.abs(lo + 85) < 6 ? peak : 0);
    const mpB = testMaps({ haz: 0, spawn: (m, la, lo) => (m === 7 && la === 25 && lo === -85 ? 9 : 0) }); mpB.haz = { T: field((m, la, lo) => bump(0.02)(m, la, lo)), S: flat(0) };
    const at = (z) => { const la = [], lo = []; for (let sd = 1; sd <= 24; sd++) { const m = run(sd, mpB, { lon: 10, lat: -3 }, z, 24 * 30); for (const S of m.systems) if (S.depNum > 0) { const f = S.fixes.find((x) => x.th === 'tc' || x.th === 'sc'); if (f) { la.push(f.lat); lo.push(f.lon); } } } return [mean(la), mean(lo), la.length]; };
    const z0 = at(0), z1 = at(1), zm = at(-1);
    check(`the genesis region moves with the index: +10 degrees east and 3 south per degree of it (mean place of the depressions ${z0[1].toFixed(1)}E ${z0[0].toFixed(1)}N at 0, ${z1[1].toFixed(1)}E ${z1[0].toFixed(1)}N at +1, ${zm[1].toFixed(1)}E ${zm[0].toFixed(1)}N at -1; ${z0[2]}, ${z1[2]}, ${zm[2]} of them)`,
      z0[2] > 10 && z1[2] > 10 && zm[2] > 10 && near(z1[1] - z0[1], 10, 3.5) && near(z0[1] - zm[1], 10, 3.5) && near(z1[0] - z0[0], -3, 2.2));
    // a tracked low develops where the shifted map says a disturbance can: a low 10 degrees east of the bump only develops when the index moves the bump east
    { const lowAt = (z) => { let n = 0; for (let sd = 1; sd <= 20; sd++) { const e = makeEnv({ sst: 27, shear: 8, rh: 60, steer: () => [0, 0, 0, 0, 0, 0], lows: () => [{ lat: 25, lon: -75, p: 1000, prom: 6 }], enso: () => z });
        const m = H.create({ seed: sd, startMs: Date.UTC(2026, 8, 1), auto: true, params: { waveRate0: 0, act: { seasSd: 0, intraSd: 0, K: 6, T: [14, 60] }, enso: { lon: 10 } }, maps: mpB }); m.advanceTo(24 * 12, e); n += m.systems.filter((S) => S.origin === 'low').length; } return n; };
      const l0 = lowAt(0), l1 = lowAt(1);
      check(`a tracked low develops where the shifted map says it can (a low 10 degrees east of the bump: ${l0} developments in 20 seasons at index 0, ${l1} at +1 with the bump 10 degrees east)`, l0 <= 1 && l1 >= 6); }
    // a seed born at the shifted node stays inside the page
    const m = run(5, mpB, { lon: 80, lat: 0 }, 1, 24 * 20), inside = m.systems.every((S) => S.fixes.length === 0 || (S.lon <= 40 && S.lon >= -110));
    check('a shift that would take a seed past the edge of the box puts it just inside', inside && m.n.N > 0); }
  // ---- the sea a subtropical disturbance needs (subSstOK, subCold, seedCold): the Atlantic's 19, 17 and 22 degC by default, the Mediterranean's hybrid cyclones form over 15-22 degC
  { const seas = (extra) => { let dep = 0; for (let sd = 1; sd <= 24; sd++) {
        const m = H.create({ seed: sd, startMs: Date.UTC(2026, 10, 1), auto: true, params: Object.assign({ waveRate0: 0, act: { seasSd: 0, intraSd: 0, K: 6, T: [14, 60] }, genGate: { sstSub: [12, 14] }, sub: { sstGate: [12, 14] } }, extra), maps: testMaps({ haz: 0, hazS: 0.01, spawn: (mo) => (mo === 10 ? 2 : 0) }) });
        m.advanceTo(24 * 12, makeEnv({ sst: 16, shear: 8, rh: 62, steer: () => [0, 0, 0, 0, 0, 0] })); dep += m.systems.filter((S) => S.depNum > 0).length; } return dep; };
    const none = seas({}), all = seas({ subSstOK: 13, subCold: 12, seedCold: 12 }), noOK = seas({ subCold: 12, seedCold: 12 }), noSub = seas({ subSstOK: 13, seedCold: 12 }), noSeed = seas({ subSstOK: 13, subCold: 12 });
    check(`over 16 degC water a subtropical disturbance is declared a depression only when all three sea thresholds are lowered (24 seasons: ${all} with them lowered; ${none} with the Atlantic's, ${noOK} without the declaration's, ${noSub} without the developing system's cold-water loss, ${noSeed} without the undeveloped disturbance's, which most die before they can)`,
      all >= 200 && none <= 1 && noOK <= 1 && noSub <= 1 && noSeed * 4 < all); }
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

/* ---- precursors are one lifecycle: wave / low -> disturbance -> depression ------------------------------------------------------------------------- */
{
  const GRl = { lon0: -105, lat0: 5, res: 5, nx: 21, ny: 13 }, flatl = (v) => Array.from({ length: 12 }, () => Array.from({ length: GRl.ny }, () => new Array(GRl.nx).fill(v)));
  const mapsL = (haz) => ({ grid: GRl, drift: { weak: { u: flatl(-8), v: flatl(3) }, strong: { u: flatl(-6), v: flatl(5) }, sub: { u: flatl(4), v: flatl(1) }, ex: { u: flatl(15), v: flatl(5) } }, steerClim: [0, 0, 0, 0, 0, 0].map((x) => flatl(x)), haz: { T: flatl(haz), S: flatl(0) }, env0: { rh: flatl(54), shear: flatl(10), sst: flatl(27.5), sstRel: flatl(0) } });
  const zero = () => [0, 0, 0, 0, 0, 0], T0 = Date.UTC(2026, 7, 20);
  const good = makeEnv({ sst: 29, shear: 5, rh: 62, steer: zero }), poor = makeEnv({ sst: 24, shear: 35, rh: 40, steer: zero }), mixed = makeEnv({ sst: 27.5, shear: 12, rh: 55, steer: zero });
  const stages = (S) => S.fixes.filter((f) => f.th === 'wv').map((f) => f.st), firstTc = (S) => S.fixes.findIndex((f) => f.th !== 'wv');
  let dev = 0, viaDb = 0, seedLo = 0, seedDb = 0;
  for (let sd = 1; sd <= 12; sd++) {
    const m = H.create({ seed: sd, startMs: T0, auto: false, maps: mapsL(0.01) }), W = m.place({ kind: 'wave', lat: 14, lon: -45 }), N = m._seedSystem('N', 'wv', 26, -80, 16, 0, 'seed', false);
    if (H.statusOf(N) === 'LO' && !N.dist) seedLo++;
    m.advanceTo(24 * 8, good);
    const i = firstTc(W); if (i > 0) { dev++; if (stages(W).includes('DB')) viaDb++; }
    const sN = stages(N); if (sN.includes('DB') || firstTc(N) > 0) seedDb++;
  }
  check(`a wave in a good environment is a disturbance before it is a depression, the same system on its way: of ${dev} that developed (of 12), ${viaDb} had disturbance fixes before the depression's first`, dev >= 8 && viaDb === dev);
  check(`a local seed is born a low (status LO, drawn as an L) and becomes a disturbance when it has the potential: ${seedLo} of 12 were born LO and ${seedDb} reached DB or a depression in a good environment`, seedLo === 12 && seedDb >= 8);
  let dbPoor = 0, devPoor = 0, flips = 0, maxFlips = 0;
  for (let sd = 1; sd <= 12; sd++) {
    const m = H.create({ seed: sd, startMs: T0, auto: false, maps: mapsL(0.01) }), W = m.place({ kind: 'wave', lat: 14, lon: -45 });
    m.advanceTo(24 * 8, poor); if (stages(W).includes('DB')) dbPoor++; if (firstTc(W) > 0) devPoor++;
    const m2 = H.create({ seed: sd, startMs: T0, auto: false, maps: mapsL(0.0004) }), W2 = m2.place({ kind: 'wave', lat: 14, lon: -45 });
    m2.advanceTo(24 * 10, mixed); const st = stages(W2); let f = 0; for (let k = 1; k < st.length; k++) if (st[k] !== st[k - 1]) f++; flips += f; maxFlips = Math.max(maxFlips, f);
  }
  check(`in a hostile environment (cold water, 35 kt of shear, dry air) a wave never becomes a disturbance (${dbPoor} of 12) nor a depression (${devPoor}); in a marginal one the stage does not flicker: at most ${maxFlips} changes of stage in ten days, ${(flips / 12).toFixed(1)} on average`, dbPoor === 0 && devPoor === 0 && maxFlips <= 4);
  // a tracked pressure low: a disturbance (X) when its place and time give it the potential, a low (L) when they do not
  const lowAt = (env, haz) => { const m = H.create({ seed: 5, startMs: T0, auto: true, params: { waveRate0: 0 }, maps: mapsL(haz) }), E = Object.assign({}, env, { lows: () => [{ lat: 28, lon: -75, p: 1004, prom: 6 }] }); m.advanceTo(24 * 3, E); return m.lows.tracks.find((q) => q.alive); };
  const tg = lowAt(good, 1e-7), tp = lowAt(poor, 1e-7);
  check(`a tracked low over warm water with little shear is a disturbance (dist ${tg && tg.dist}), one over cold water with strong shear stays a low (dist ${tp && tp.dist})`, !!tg && tg.dist === true && !!tp && !tp.dist);
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
  // rapid intensification follows the conditions: none in a hostile environment, some in a marginal one, much in a good one and a great one, and in a perfect one (30.4 degC, next to no shear, very moist air)
  // an episode that can take a storm up by 80 to 100 kt in about a day (the real Atlantic record has three storms with a gain of 75 kt or more in 24 h in 42 seasons: Wilma's 95, Felix's 85 and Matthew's 75)
  const rungs = [['hostile', hostile], ['marginal', makeEnv({ sst: 27.4, shear: 10, rh: 52, steer: zero })], ['good', makeEnv({ sst: 28.4, shear: 8, rh: 58, steer: zero })], ['great', ideal], ['perfect', makeEnv({ sst: 30.4, shear: 1, rh: 68, steer: zero })]];
  const ladder = rungs.map(([name, env]) => {
    const g = [], pn = [];
    for (let sd = 1; sd <= 40; sd++) { const S = system('tc', 18, -55, 50, sd), vs = [S.vr]; for (let h = 0; h < 168 && S.alive; h++) { H.stepSystem(S, env, h, sd, D); vs.push(S.vr); if (S.ri) pn.push(S.ri.pn); } g.push(gain24(vs)); }
    return { name, mean: mean(g), n30: g.filter((x) => x >= 30).length, n50: g.filter((x) => x >= 50).length, n65: g.filter((x) => x >= 65).length, n80: g.filter((x) => x >= 80).length, max: Math.max(...g), pn: pn.length ? mean(pn) : 0 };
  });
  const [lH, lM, lG, lGr, lP] = ladder;
  check(`the strongest 24-hour gain of a week grows with the conditions: ${ladder.map((x) => x.name + ' ' + x.mean.toFixed(0)).join(' < ')} kt (means of 40 seeds from a 50-kt storm at 18N)`, ladder.every((x, i) => i === 0 || x.mean > ladder[i - 1].mean + 4));
  check(`rapid intensification is rare in a marginal environment (50 kt or more in ${lM.n50} of 40 seeds), common in a good one (30 kt or more in ${lG.n30}, 50 kt or more in ${lG.n50}) and absent in a hostile one (${lH.n30})`, lH.n30 === 0 && lM.n50 <= 7 && lM.n30 >= 20 && lG.n30 >= 32 && lG.n50 >= 6 && lG.n65 <= 6);
  check(`in a perfect environment it is extreme: the strongest 24-hour gain is 65 kt or more in ${lP.n65} of 40 seeds, 80 kt or more in ${lP.n80} and ${lP.max.toFixed(0)} kt at most, against ${lGr.n65} / ${lGr.n80} / ${lGr.max.toFixed(0)} in a great one (the extra speed comes from the pinnacle index of the episodes: ${lP.pn.toFixed(2)} against ${lGr.pn.toFixed(2)} and ${lG.pn.toFixed(2)})`,
    lP.n65 >= 12 && lP.n80 >= 3 && lP.max >= 85 && lP.max <= 125 && lGr.n80 <= 3 && lP.n65 > lGr.n65 + 5 && lP.pn > lGr.pn + 0.25 && lG.pn < 0.2);
  // the start of an episode is gated by each of the conditions: switching one factor off (the same environment, that factor made blind) brings the episodes back
  const started = (p, env, lat, v0) => {
    let eps = 0, hours = 0;
    for (let sd = 1; sd <= 40; sd++) { const S = system('tc', lat, -55, v0, sd); let on = false; for (let h = 0; h < 168 && S.alive; h++) { H.stepSystem(S, env, h, sd, p); hours++; if (S.ri && !on) eps++; on = !!S.ri; } }
    return { eps, rate: 1000 * eps / hours };
  };
  const blind = (patch) => H.mergeParams(D, { ri: patch });
  const gates = [
    ['shear (90 kt on the page\'s scale)', makeEnv({ sst: 29, shear: 90, rh: 62, steer: zero }), 18, 50, { shear: 1e9 }, (a, b) => a.rate < 0.55 * b.rate && b.eps >= 60],
    ['cool water (25 degC)', makeEnv({ sst: 25, shear: 3, rh: 66, steer: zero }), 18, 50, { sst: [-50, -40] }, (a, b) => a.eps === 0 && b.eps >= 20],
    ['dry air (40 %)', makeEnv({ sst: 29, shear: 5, rh: 40, steer: zero }), 18, 50, { rh: [-50, -40] }, (a, b) => a.eps === 0 && b.eps >= 8],
    ['no room left (a 110-kt hurricane over 27.8 degC)', makeEnv({ sst: 27.8, shear: 5, rh: 62, steer: zero }), 18, 110, { room: [-5, -4] }, (a, b) => a.eps === 0 && b.eps >= 40],
  ].map(([name, env, lat, v0, patch, ok]) => { const a = started(D, env, lat, v0), b = started(blind(patch), env, lat, v0); return { name, a, b, ok: ok(a, b) }; });
  check(`an episode needs the conditions: episodes started in 40 week-long runs, as shipped / with that factor blind: ${gates.map((g) => g.name + ' ' + g.a.eps + ' / ' + g.b.eps).join('; ')}`, gates.every((g) => g.ok));
  const ordinary = makeEnv({ sst: 29, shear: 20, rh: 56, steer: zero });
  const fin = (lat, env = ordinary) => mean(Array.from({ length: 20 }, (_, i) => { const vs = trace(lat, 100, env, 72, i + 1); return vs[vs.length - 1]; })), f15 = fin(15), f32 = fin(32), p32 = fin(32, ideal);
  check(`the calibrated potential wind falls poleward in an ordinary environment: a 100-kt hurricane over 29 degC water (20 kt of shear, 56 % humidity) is at ${f15.toFixed(0)} kt after three days at 15N and ${f32.toFixed(0)} kt at 32N; in a perfect one (5 kt of shear, 62 %) it falls less than half as far (${p32.toFixed(0)} kt at 32N)`, f15 > 100 && f15 - f32 > 25 && f15 - p32 < 0.5 * (f15 - f32));
  const GRc = { lon0: -105, lat0: 5, res: 5, nx: 21, ny: 13 }, flatc = (v) => Array.from({ length: 12 }, () => Array.from({ length: GRc.ny }, () => new Array(GRc.nx).fill(v)));
  const mapsC = { grid: GRc, drift: { weak: { u: flatc(-8), v: flatc(3) }, strong: { u: flatc(-6), v: flatc(5) }, sub: { u: flatc(4), v: flatc(1) }, ex: { u: flatc(15), v: flatc(5) } }, steerClim: [0, 0, 0, 0, 0, 0].map((x) => flatc(x)), haz: { T: flatc(0), S: flatc(0) }, env0: { rh: flatc(54), shear: flatc(10), sst: flatc(27.5), sstRel: flatc(0) } };
  const declared = (sst, shear, rh) => { let n = 0; for (let s = 1; s <= 12; s++) { const S = system('wv', 15, -50, 18, s, { dev: 0, q: 0 }), e = makeEnv({ sst, shear, rh, steer: zero }), c = { maps: H.prepareMaps(mapsC), tw: H.timeWeights(240), diag: null, act: 1 }; for (let h = 0; h < 72 && S.alive; h++) { H.stepSystem(S, e, h, s, D, 240, c); if (S.th !== 'wv') { n++; break; } } } return n; };
  const dGood = declared(28.5, 8, 58), dMarg = declared(26.5, 14, 50);
  check(`a disturbance that has begun to develop is declared a depression only while the growth law could keep one alive: in ${dGood} of 12 seeds in a good environment and in ${dMarg} of 12 in a marginal one (without the margin, 11 of 12 and a fifth of the numbered depressions were gone in a day)`, dGood >= 9 && dMarg <= 4);
  H.calibrated(false);
}

/* ---- no walls: every limit is a ramp, a hazard or a soft cap ------------------------------------------------------------------------------------------------------ */
{
  H.calibrated(true);
  const D = H.defaultParams(), zero = () => [0, 0, 0, 0, 0, 0], BOXW = { lat0: -80, lat1: 85, lon0: -170, lon1: 120 };
  const xs = [0.01, 0.1, 0.5, 1, 2, 3, 5, 10, 100], ys = xs.map((x) => H.satur(x, 3));
  check(`a soft cap bends over toward its cap without reaching it: satur(x, 3) = ${ys.map((y) => y.toFixed(3)).join(', ')} for x = ${xs.join(', ')}; the soft minimum of two numbers rounds the corner (62 and 62 give ${H.softMin(62, 62).toFixed(1)})`,
    ys.every((y, i) => y < 3 && y <= xs[i] + 1e-12 && (i === 0 || y > ys[i - 1])) && near(ys[0], 0.01, 1e-6) && ys[8] > 2.99 && H.satur(-1, 3) === 0 && H.softMin(62, 62) < 62 && H.softMin(62, 1000) > 61.9 && H.softMin(62, 1000) < 62 && near(H.softMin(10, 1e6), 10, 1e-6));
  // the post-tropical hazard has no wall at its latitude limit and a perfect tropical environment takes the latitude term away
  const p = (lat, perf) => H.etHazard6(D, lat, 26, 20, 60, perf);
  let maxStep = 0, mono = true; for (let la = 8; la < 50; la += 0.25) { maxStep = Math.max(maxStep, Math.abs(p(la + 0.25) - p(la))); if (p(la + 0.25) < p(la) - 1e-12) mono = false; }
  check(`the post-tropical hazard has no wall at its latitude limit: ${p(14).toExponential(1)} at 14N, ${p(19.9).toExponential(2)} just under 20N and ${p(20.1).toExponential(2)} just over it, rising with latitude everywhere and never by more than ${(100 * maxStep).toFixed(1)} points in a quarter of a degree`,
    p(14) > 0 && p(14) < p(20) && near(p(19.9), p(20.1), 3e-4) && mono && maxStep < 0.02);
  check(`a perfect tropical environment takes most of the latitude term away: at 43.5N over 29 degC water the hazard is ${H.etHazard6(D, 43.5, 29, 3, 60, 0).toFixed(3)} and ${H.etHazard6(D, 43.5, 29, 3, 60, 1).toFixed(4)} with perf = 1`, H.etHazard6(D, 43.5, 29, 3, 60, 1) < 0.15 * H.etHazard6(D, 43.5, 29, 3, 60, 0));
  // the sea-temperature gate: the more permissive of the relative and the absolute one
  const rel = H.smooth01(22.8, D.sstGate[0], D.sstGate[1]), both = H.sstGateAt(D, D, 22.8, 27.5, 0), same = H.sstGateAt(D, D, 26.0, 26.0, 0), noAbs = H.sstGateAt(H.mergeParams(D, { sstAbsUp: 0 }), D, 22.8, 27.5, 0);
  check(`in a warmed world the sea-temperature gate does not shut water that is warm in absolute terms: the relative gate alone is ${rel.toFixed(2)} for 22.8 degC against the warm tropics, with the sea at 27.5 degC it is ${both.toFixed(2)}; without the absolute gate ${noAbs.toFixed(2)}; where the two agree nothing changes (${same.toFixed(3)} against ${H.smooth01(26.0, D.sstGate[0], D.sstGate[1]).toFixed(3)})`,
    rel < 0.01 && both > 0.9 && noAbs < 0.01 && near(same, H.smooth01(26.0, D.sstGate[0], D.sstGate[1]), 1e-12));

  // a depression at the latitude of the Great Lakes: possible in a perfect environment, still hostile without one
  const lakeLat = 43.5;
  const trial = (pp, opts, lat = lakeLat, v0 = 35, seeds = 40, hours = 168) => {
    const out = [];
    for (let sd = 1; sd <= seeds; sd++) {
      const S = system('tc', lat, -87, v0, sd), e = makeEnv(Object.assign({ steer: zero, box: BOXW }, opts));
      let peak = S.vr, et24 = false; for (let h = 0; h < hours && S.alive; h++) { H.stepSystem(S, e, h, sd, pp); peak = Math.max(peak, S.vr); if (h === 23 && S.th === 'ex') et24 = true; }
      out.push({ peak, et24, alive: S.alive && S.th === 'tc' });
    }
    return { mean: mean(out.map((o) => o.peak)), hur: out.filter((o) => o.peak >= 64).length, et24: out.filter((o) => o.et24).length, tc7: out.filter((o) => o.alive).length };
  };
  const perfect = trial(D, { sst: 27.5, shear: 1, rh: 72 }), thr = trial(D, { sst: 26.5, shear: 1, rh: 72 }), cold = trial(D, { sst: 22, shear: 25, rh: 55 }), warmShear = trial(D, { sst: 27.5, shear: 30, rh: 55 });
  check(`a depression at 43.5N (the Great Lakes) over 27.5 degC water with next to no shear and moist air becomes a hurricane in ${perfect.hur} of 40 seeds (mean peak ${perfect.mean.toFixed(0)} kt), is post-tropical within a day in ${perfect.et24} and is still a tropical cyclone after a week in ${perfect.tc7}; over water at the hurricane threshold (26.5 degC) ${thr.hur} of 40 do (mean ${thr.mean.toFixed(0)} kt)`,
    perfect.hur >= 32 && perfect.et24 <= 4 && perfect.tc7 >= 28 && thr.hur >= 8);
  check(`... and without the tropical environment it is still hostile: over 22 degC water with 25 kt of shear no depression gets near hurricane strength (${cold.hur} of 40, mean peak ${cold.mean.toFixed(0)} kt), and warm water alone is not enough in 30 kt of shear (${warmShear.hur} of 40, mean ${warmShear.mean.toFixed(0)} kt)`, cold.hur === 0 && cold.mean < 50 && warmShear.hur <= 8);
  const typ = (relief) => trial(H.mergeParams(D, { vpRelief: relief }), { sst: 28.5, shear: 14, rh: 54 }, 28, 60, 30, 120).mean;
  check(`the relief is for perfect conditions only: in an ordinary environment (28.5 degC, 14 kt of shear, 54 % humidity) the mean peak at 28N is ${typ(0.9).toFixed(0)} kt with it and ${typ(0).toFixed(0)} kt without it`, Math.abs(typ(0.9) - typ(0)) < 4);
  const sstRung = []; for (let s = 22; s <= 30; s += 0.5) sstRung.push(trial(D, { sst: s, shear: 1, rh: 72 }, lakeLat, 35, 24).mean);
  const steps = sstRung.slice(1).map((x, i) => x - sstRung[i]);
  check(`the mean peak of a week at 43.5N rises gradually with the sea temperature, with no step anywhere (every half degree from 22 to 30 degC: largest rise ${Math.max(...steps).toFixed(0)} kt, largest fall ${Math.min(...steps).toFixed(0)} kt; ${sstRung[0].toFixed(0)} kt at 22, ${sstRung[sstRung.length - 1].toFixed(0)} kt at 30)`, Math.max(...steps) < 22 && Math.min(...steps) > -8 && sstRung[sstRung.length - 1] > sstRung[0] + 60);
  // a lake is water: the same depression on a patch of water 3 degrees across, amid land, strengthens; on land it does not
  const lakeEnv = (wet) => makeEnv({ sst: 27.5, shear: 1, rh: 72, steer: zero, box: BOXW, land: (la, lo) => !(wet && Math.abs(la - 43.5) < 1.6 && Math.abs(lo + 87) < 2.2) });
  const lakeRun = (wet) => { const peaks = []; for (let sd = 1; sd <= 20; sd++) { const S = system('tc', 43.5, -87, 35, sd), e = lakeEnv(wet); let pk = S.vr; for (let h = 0; h < 72 && S.alive; h++) { H.stepSystem(S, e, h, sd, D); pk = Math.max(pk, S.vr); } peaks.push(pk); } return mean(peaks); };
  check(`a depression on a lake-sized patch of water (3 degrees across, land all round) strengthens, to a mean of ${lakeRun(true).toFixed(0)} kt in three days, where on land it would be ${lakeRun(false).toFixed(0)} kt`, lakeRun(true) > 60 && lakeRun(false) < 40);

  // rapid intensification does not stop at a wall: an episode in progress tapers off as the wind comes up to the potential wind
  { const e = makeEnv({ sst: 29.5, shear: 3, rh: 62, steer: () => [-10, 0, -10, 0, -10, 0] });
    const run12 = (v0) => { const kept = [], after = [], without = []; for (let sd = 1; sd <= 12; sd++) {
      const A = system('tc', 15, -55, v0, sd), B = system('tc', 15, -55, v0, sd); A.ri = { t0: 0, dur: 24, rate: 3, pn: 0 }; let alive = true;
      for (let h = 0; h < 12; h++) { H.stepSystem(A, e, h, sd, D); H.stepSystem(B, e, h, sd, D); if (!A.ri) alive = false; }
      kept.push(alive); after.push(A.v); without.push(B.v); } return { kept: kept.filter(Boolean).length, gain: mean(after) - mean(without) }; };
    const r90 = run12(90), r110 = run12(110), r130 = run12(130);
    check(`a rapid-intensification episode is not cut off at 93 % of the potential wind: it runs its course in ${r130.kept} of 12 hurricanes starting at 130 kt, and what it adds in half a day tapers as the room runs out (${r90.gain.toFixed(1)} kt from 90 kt, ${r110.gain.toFixed(1)} from 110, ${r130.gain.toFixed(1)} from 130)`,
      r90.kept === 12 && r110.kept === 12 && r130.kept === 12 && r90.gain > r110.gain + 2 && r110.gain > r130.gain + 2 && r130.gain > 0.5); }

  // disturbances end by a hazard, not by a wall: over water near the 22 degC limit about half of the waves are gone in half a day, over 20 degC all, over 24 degC none
  { const gone = (sst) => { let n = 0; for (let sd = 1; sd <= 60; sd++) { const S = system('wv', 15, -50, 16, sd), e = makeEnv({ sst, shear: 12, rh: 62, steer: zero }); for (let h = 0; h < 12 && S.alive; h++) H.stepSystem(S, e, h, sd, D); if (!S.alive) n++; } return n / 60; };
    const g = [24, 23, 22.5, 22, 21.5, 21, 20].map(gone);
    check(`a wave over cold water does not die at a line: the share gone within twelve hours is ${g.map((x, i) => [24, 23, 22.5, 22, 21.5, 21, 20][i] + ' degC ' + x.toFixed(2)).join(', ')}`, g[0] === 0 && g[1] < 0.1 && g.every((x, i) => i === 0 || x >= g[i - 1] - 0.08) && g[3] > 0.3 && g[3] < 0.95 && g[6] >= 0.9); }

  // the fastest loss of wind is a knee, not a clamp: it rises with the severity beyond the soft limit and never reaches it
  { const cap = (V) => D.decayCap[0] + D.decayCap[1] * (V / 60) * (V / 60), lim = (x, V) => H.decayLimit(D, x, V), c100 = cap(100);
    const xs2 = [0.1, 0.5, 1, 1.5, 2.5, 4, 8].map((k) => k * c100), ls = xs2.map((x) => lim(x, 100));
    check(`the fastest loss of wind over water is a soft limit: for a 100-kt hurricane (limit ${c100.toFixed(2)} kt/h) a severity of ${[0.1, 0.5, 1, 1.5, 2.5, 4, 8].join(', ')} times the limit costs ${ls.map((l) => (l / c100).toFixed(3)).join(', ')} of it, rising all the way and never reaching it`,
      ls.every((l, i) => l < c100 && (i === 0 || l > ls[i - 1])) && near(ls[0], xs2[0], 0.002 * c100) && ls[2] < 0.95 * c100 && ls[2] > 0.8 * c100 && ls[6] > 0.99 * c100 && lim(c100, 40) < cap(40)); }
  // a land fraction takes the water hazard of dissipation away smoothly
  { const dz = (lf) => H.disHazard6(D, 38, 22, 30, 30, null, lf);
    check(`over land the water hazard of dissipation fades out with the share of land: ${[0, 0.2, 0.35, 0.5, 1].map((lf) => 'land ' + lf + ' ' + dz(lf).toFixed(4)).join(', ')}`, dz(0) > 0.01 && near(dz(0.2), dz(0), 1e-12) && dz(0.35) < 0.8 * dz(0) && dz(0.35) > 0.2 * dz(0) && dz(0.5) === 0 && dz(1) === 0); }
  // a disturbance that is strong enough does not become a depression over land, on the equator or over cold water -- the doors close gradually, but they close
  { const became = (lat, lon, env, hours = 18) => { let n = 0; for (let sd = 1; sd <= 20; sd++) { const S = system('wv', lat, lon, 40, sd), e = makeEnv(Object.assign({ steer: zero, box: BOXW }, env)); for (let h = 0; h < hours && S.alive; h++) H.stepSystem(S, e, h, sd, par); if (S.th === 'tc') n++; } return n; };
    const open = became(12, -50, { sst: 29, shear: 3, rh: 70 }), onLand = became(12, -50, { sst: 29, shear: 3, rh: 70, land: () => true }), equator = became(1.5, -50, { sst: 29, shear: 3, rh: 70 }), cold = became(12, -50, { sst: 20, shear: 3, rh: 70 });
    check(`a disturbance with 40 kt of wind becomes a depression within 18 hours in ${open} of 20 seeds over warm water at 12N, in ${onLand} over land, ${equator} at 1.5N and ${cold} over 20 degC water`, open >= 18 && onLand === 0 && equator === 0 && cold === 0); }
  // a circulation that has all but gone is finished within hours
  { let gone = 0; for (let sd = 1; sd <= 20; sd++) { const S = system('tc', 25, -60, 3, sd), e = makeEnv({ sst: 24, shear: 40, rh: 40, steer: zero, box: BOXW }); for (let h = 0; h < 6 && S.alive; h++) H.stepSystem(S, e, h, sd, par); if (!S.alive) gone++; }
    check(`a cyclone whose wind has fallen to 3 kt is finished within six hours (${gone} of 20), not kept for the half day a remnant low would be`, gone >= 19); }

  // the tracked lows' latitude weight is a ramp up and a ramp down
  { const w = (la) => H.lowWeight(D, la);
    check(`a tracked low counts as a precursor by a weight that ramps in from 14 to 18N and out from 45 to 50N: ${[10, 14, 16, 18, 30, 45, 47.5, 50, 60].map((la) => la + 'N ' + w(la).toFixed(2)).join(', ')}`, w(10) === 0 && w(14) === 0 && w(16) > 0.2 && w(16) < 0.8 && w(18) === 1 && w(30) === 1 && w(45) === 1 && w(47.5) > 0.2 && w(47.5) < 0.8 && w(50) === 0 && w(60) === 0); }

  // no map is zero anywhere: the development rate has a floor, and there is a supply of disturbances over the whole box
  { const GRf = { lon0: -105, lat0: 5, res: 5, nx: 21, ny: 13 }, flatf = (v) => Array.from({ length: 12 }, () => Array.from({ length: GRf.ny }, () => new Array(GRf.nx).fill(v)));
    const mapsF = (o = {}) => ({ grid: GRf, drift: { weak: { u: flatf(-8), v: flatf(3) }, strong: { u: flatf(-6), v: flatf(5) }, sub: { u: flatf(4), v: flatf(1) }, ex: { u: flatf(15), v: flatf(5) } }, steerClim: [0, 0, 0, 0, 0, 0].map((x) => flatf(x)),
      haz: { T: flatf(0), S: flatf(0) }, env0: { rh: flatf(54), shear: flatf(10), sst: flatf(28), sstRel: flatf(0) }, spawn: o.spawn ? Array.from({ length: 12 }, () => Array.from({ length: GRf.ny }, () => new Array(GRf.nx).fill(o.spawn))) : undefined });
    const perfectEnv = () => makeEnv({ sst: 29.5, shear: 2, rh: 75, steer: zero, box: { lat0: 5, lat1: 65, lon0: -105, lon1: -5 } });
    const developed = (floor) => { let n = 0; for (let sd = 1; sd <= 30; sd++) { const m = H.create({ seed: sd, startMs: Date.UTC(2026, 7, 1), auto: false, params: { hazFloor: floor, act: { seasSd: 0, intraSd: 0, K: 6, T: [14, 60] } }, maps: mapsF() }), W = m.place({ kind: 'wave', lat: 25, lon: -60 }); m.advanceTo(24 * 10, perfectEnv()); if (W.tdHour >= 0) n++; } return n; };
    const dFloor = developed(0.02), dNone = developed(0);
    check(`a map that is zero everywhere is not a wall: with a development-rate floor a wave in a perfect environment develops in ${dFloor} of 30 seeds, without one in ${dNone}; the shipped floor is ${D.hazFloor} an hour and the shipped supply of disturbances ${D.seedFloor} a year over the whole box`, dFloor >= 5 && dNone === 0 && D.hazFloor > 0 && D.hazFloor < 1e-4 && D.seedFloor > 0 && D.seedFloor < 20);
    const land = (la, lo) => lo < -60, boxF = { lat0: 5, lat1: 65, lon0: -105, lon1: -5 };
    const born = (fl, spawn) => { const m = H.create({ seed: 4, startMs: Date.UTC(2026, 7, 1), auto: true, params: { waveRate0: 0, seedFloor: fl }, maps: mapsF({ spawn }) }), ids = [], seen = new Set(), env = makeEnv({ sst: 24.4, shear: 30, rh: 40, steer: zero, box: boxF, land });
      for (let h = 0; h < 24 * 60; h += 6) { m.advanceTo(h + 6, env); for (const S of m.systems) if (!seen.has(S.id)) { seen.add(S.id); ids.push([S.id, S.fixes.length ? S.fixes[0].lat : S.lat, S.fixes.length ? S.fixes[0].lon : S.lon, S.kind]); } }
      return { ids, n: m.n }; };
    const withF = born(600, 4), withoutF = born(0, 4), fl = withF.ids.filter((x) => x[0][0] === 'F'), locals = (r) => r.ids.filter((x) => x[0][0] === 'N');
    check(`a supply of disturbances over the whole box (600 a year here): ${withF.n.F} born in 60 days (about 54 expected: 600 a year is 99 in 60 days and 45 % of the box is land here), all over water (the first fix east of 61W), all of the kind of a local seed, and no automatic system's id or place moves because they exist (${locals(withF).length} local seeds with them, ${locals(withoutF).length} without)`,
      withF.n.F >= 35 && withF.n.F <= 80 && fl.length > 20 && fl.every((x) => x[2] > -61.5 && x[3] === 'N') && withoutF.n.F === 0 && JSON.stringify(locals(withF)) === JSON.stringify(locals(withoutF)) && locals(withoutF).length > 20); }
  H.calibrated(false);
}

/* ---- the nine basins: the season, the names, the words, the waves, the southern hemisphere ----------------------------------------------------------------------- */
{
  const ids = ['atlantic', 'eastpacific', 'westpacific', 'nio', 'aus', 'swio', 'spac', 'satl', 'med'], B = Object.fromEntries(ids.map((k) => [k, H.basinInfo(k)]));
  check('all nine basins are in the table with a label, a menu id, a season start (January or July), a word for hurricane strength, a main development region and a naming scheme',
    ids.every((k) => { const b = B[k]; return b.label && b.menu && (b.seasonMonth === 0 || b.seasonMonth === 6) && b.hurricane && b.mdr && b.mdr.lat.length === 2 && b.mdr.lon.length === 2 && b.names && (b.names.type === 'yearly' || b.names.type === 'seq') && typeof b.waves === 'boolean'; }));
  { const menu = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    check('the menu ids of the table are the main menu\'s own (' + ids.map((k) => B[k].menu).join(', ') + ')', ids.every((k) => menu.includes(`id: '${B[k].menu}'`)) && new Set(ids.map((k) => B[k].menu)).size === 9); }
  check('seasons: January in the Atlantic, East and West Pacific and North Indian; July (named for the year it starts in) in the Australian, south-west Indian, South Pacific, South Atlantic and the Mediterranean',
    ['atlantic', 'eastpacific', 'westpacific', 'nio'].every((k) => B[k].seasonMonth === 0) && ['aus', 'swio', 'spac', 'satl', 'med'].every((k) => B[k].seasonMonth === 6));
  check('the word for hurricane strength: hurricane, hurricane, typhoon, cyclone x5, medicane', ids.map((k) => B[k].hurricane).join() === 'hurricane,hurricane,typhoon,cyclone,cyclone,cyclone,cyclone,cyclone,medicane');
  check('only the Atlantic has a wave train of its own (the other basins\' disturbances are local seeds and tracked lows)', ids.every((k) => B[k].waves === (k === 'atlantic')));
  check('the year of a season: a calendar year where it starts in January, July to June (named for the year it starts in) where it starts in July',
    H.seasonYearOf(Date.UTC(2027, 0, 15), 0) === 2027 && H.seasonYearOf(Date.UTC(2027, 11, 31, 23), 0) === 2027 && H.seasonYearOf(Date.UTC(2027, 0, 15), 6) === 2026 && H.seasonYearOf(Date.UTC(2027, 5, 30, 23), 6) === 2026 && H.seasonYearOf(Date.UTC(2027, 6, 1), 6) === 2027 && H.seasonYearOf(Date.UTC(2026, 10, 1), 6) === 2026);

  // names
  const all = (k) => { const N = B[k].names; return N.type === 'yearly' ? N.lists.flat() : N.list; };
  check('every name list has only distinct names inside a list (no storm of a season shares a name), every yearly basin six lists of at least 21 names, every sequential list at least 18',
    ids.every((k) => { const N = B[k].names; return N.type === 'yearly' ? N.lists.length === 6 && N.lists.every((l) => l.length >= 21 && new Set(l).size === l.length) : N.list.length >= 18 && new Set(N.list).size === N.list.length; }));
  check('the yearly lists are alphabetical (each name begins with the next letter of the alphabet, skipping Q U X Y Z only where a list does)', ids.filter((k) => B[k].names.type === 'yearly').every((k) => B[k].names.lists.every((l) => l.every((n, i) => i === 0 || n[0] > l[i - 1][0]))));
  { const nm = (k, y, n, cur) => Array.from({ length: n }, (_, i) => H.stormName(k, y, i, cur, -100));
    check('a yearly basin names the i-th storm of a season from that season\'s list and goes on to the supplemental list after the last (Atlantic 2026: Arthur, Bertha, Cristobal; the 22nd is Adria; 2027 uses the 2021 list)',
      nm('atlantic', 2026, 3, {}).join() === 'Arthur,Bertha,Cristobal' && H.stormName('atlantic', 2026, 21, {}, -50) === 'Adria' && H.stormName('atlantic', 2027, 0, {}, -50) === 'Ana' && H.stormName('atlantic', 2032, 0, {}, -50) === 'Arthur');
    const cur = {}, first = Array.from({ length: 4 }, () => H.stormName('aus', 2026, 0, cur, 120)), L = B.aus.names.list;
    check(`a sequential basin goes on down its list from one storm and one season to the next, without reading the year (Australian region: ${first.join(', ')}), and wraps to the first name after the last`,
      first.join() === L.slice(B.aus.names.start, B.aus.names.start + 4).join() && H.stormName('aus', 2031, 0, cur, 120) === L[(B.aus.names.start + 4) % L.length] && (() => { const c = { seq: L.length - 1 }; return H.stormName('aus', 2026, 0, c, 120) === L[0]; })());
    const cE = {}, west = H.stormName('eastpacific', 2026, 0, cE, -150), east = H.stormName('eastpacific', 2026, 0, cE, -110), west2 = H.stormName('eastpacific', 2026, 5, cE, -170);
    check(`the East Pacific names a storm west of 140W from the Central Pacific list, with a cursor of its own (${west}, then ${west2}), and one east of it from the season's list (${east})`,
      B.eastpacific.names.west.seq.includes(west) && west2 === B.eastpacific.names.west.seq[B.eastpacific.names.west.start + 1] && B.eastpacific.names.lists.some((l) => l[0] === east)); }

  // the southern season: July to June
  { const env = makeEnv({ sst: 28, shear: 8, rh: 60 }), st = Date.UTC(2026, 10, 1), m = H.create({ seed: 5, startMs: st, basin: 'aus', auto: false }), n = H.create({ seed: 5, startMs: Date.UTC(2026, 11, 20), basin: 'eastpacific', auto: false });
    const hAt = (y, mo, d) => (Date.UTC(y, mo, d) - st) / 3600000;
    check('a southern season is named for the year it starts in: begun on Nov 1 2026 it is the 2026 season, its day count is 123 (since Jul 1) and it is still the 2026 season on Jan 15 2027 and Jun 30 2027',
      m.season.year === 2026 && m.seasonDay(0) === 123 && (m.advanceTo(hAt(2027, 0, 15), env), m.season.year === 2026 && m.archive.length === 0 && m.seasonDay(m.hour) === 198) && (m.advanceTo(hAt(2027, 5, 30), env), m.season.year === 2026 && m.archive.length === 0));
    m.advanceTo(hAt(2027, 6, 2), env);
    check(`the southern season turns over on Jul 1, not on Jan 1: on Jul 2 2027 it is the 2027 season (${m.season.year}), the 2026 season is in the archive (${m.archive.map((a) => a.year).join()}) and the day count started again (${m.seasonDay(m.hour)})`,
      m.season.year === 2027 && m.archive.length === 1 && m.archive[0].year === 2026 && m.seasonDay(m.hour) === 1);
    n.advanceTo((Date.UTC(2027, 0, 3) - Date.UTC(2026, 11, 20)) / 3600000, env);
    check('and a northern season does turn over on Jan 1 (East Pacific: the 2026 season is in the archive on Jan 3 2027)', n.season.year === 2027 && n.archive.length === 1 && n.archive[0].year === 2026);
    m.nameCur = { seq: 7, west: 2 }; const r = H.restore(JSON.parse(JSON.stringify(m.serialize())));
    check('a checkpoint keeps the basin, the day its season started and where its name list stands', r.basin === 'aus' && r.seasonMonth === 6 && r.season.year === 2027 && r.nameCur.seq === 7 && r.nameCur.west === 2 && r.seasonDay(r.hour) === m.seasonDay(m.hour)); }

  // a basin's fitted physics (BASIN_PARAMS): the Atlantic's calibrated law is the base, a basin's entry replaces what its record asked to be different, merges into nested settings, and a basin without an entry has the base
  { const was = H.calibrated(true), at = H.defaultParams('atlantic'), ep = H.defaultParams('eastpacific'), nw = H.defaultParams('nowhere'), none = H.defaultParams(); H.calibrated(was);
    check(`a basin's fitted physics is applied on top of the Atlantic's calibrated law: East Pacific growth rate ${ep.kUp} against ${at.kUp}, its genesis gate starts at ${ep.genGate.lat[0]} degrees against ${at.genGate.lat[0]} and keeps the rest of the gate (sea ${ep.genGate.sst}, shear ${ep.genGate.shear}); a basin with no entry (one the table does not know) and no basin at all have the Atlantic's law`,
      ep.kUp !== at.kUp && ep.vpScale !== at.vpScale && ep.genGate.lat[0] < at.genGate.lat[0] && ep.genGate.sst[0] === at.genGate.sst[0] && ep.genGate.shear === at.genGate.shear && ep.ri.rate[0] === at.ri.rate[0] && nw.kUp === at.kUp && nw.vpScale === 1 && none.kUp === at.kUp && at.kUp === H.CALIBRATED.kUp && at.vpScale === 1); }

  // no waves outside the Atlantic
  { const waves = (k) => { const m = H.create({ seed: 3, startMs: Date.UTC(2026, 7, 1), basin: k, auto: true }); m.advanceTo(24 * 40, makeEnv({ sst: 28.5, shear: 8, rh: 62 })); return m.n.W; };
    const a = waves('atlantic'), e = waves('eastpacific'), s = waves('aus');
    check(`the easterly-wave generator runs in the Atlantic only (40 days from Aug 1: ${a} waves; East Pacific ${e}, Australian region ${s})`, a >= 5 && e === 0 && s === 0); }

  // the activity of a season is one draw per SEASON (the year a southern season starts in), so it does not jump on Jan 1 mid-season
  { const GR = { lon0: 90, lat0: -50, res: 5, nx: 19, ny: 11 }, z = () => Array.from({ length: 12 }, () => Array.from({ length: GR.ny }, () => Array(GR.nx).fill(0))), cls = () => ({ u: z(), v: z() });
    const maps = { grid: GR, drift: { weak: cls(), strong: cls(), sub: cls(), ex: cls() }, steerClim: Array.from({ length: 6 }, z), haz: { T: z(), S: z() } }, env = makeEnv({ sst: 28, shear: 8, rh: 60 });
    const actAt = (k, start, h) => { const m = H.create({ seed: 11, startMs: start, basin: k, auto: false, maps }); m.advanceTo(h, env); return [m.ctx.act, m, m.hour - 1]; };
    const expect = (k, start, h) => { const m = actAt(k, start, h)[1]; return H.activityFactor(m.par, m.seed, H.seasonYearOf(start + (h - 1) * 3600000, H.basinInfo(k).seasonMonth), h - 1); };
    const t0 = Date.UTC(2026, 11, 28), hJan = (Date.UTC(2027, 0, 1) - t0) / 3600000;
    const aus = [actAt('aus', t0, hJan - 1)[0], actAt('aus', t0, hJan + 1)[0]], epac = [actAt('eastpacific', t0, hJan - 1)[0], actAt('eastpacific', t0, hJan + 1)[0]];
    check(`the activity factor follows the season's year: across Jan 1 it moves only with the intraseasonal part in the Australian region (${aus[0].toFixed(3)} to ${aus[1].toFixed(3)}), and by the new year's draw in the East Pacific (${epac[0].toFixed(3)} to ${epac[1].toFixed(3)}); it is the factor of that year's draw`,
      Math.abs(aus[1] - aus[0]) < 0.02 && Math.abs(epac[1] - epac[0]) > 0.05 && near(aus[1], expect('aus', t0, hJan + 1), 1e-12) && near(epac[1], expect('eastpacific', t0, hJan + 1), 1e-12)); }

  // the southern hemisphere is the northern one in the mirror: a tropical cyclone in no steering drifts westward and poleward (south in the south), a subtropical one likewise
  { const drift = (lat, th) => { const S = system(th, lat, -50, th === 'tc' ? 45 : 35, 3), e = makeEnv({ sst: 29, shear: 4, rh: 70, steer: () => [0, 0, 0, 0, 0, 0], box: { lat0: -65, lat1: 65, lon0: -105, lon1: -5 } }); const lat0 = S.lat, lon0 = S.lon; run(S, e, 36, 3); return [S.lat - lat0, S.lon - lon0]; };
    const [n, s, nsc, ssc] = [drift(16, 'tc'), drift(-16, 'tc'), drift(28, 'sc'), drift(-28, 'sc')];
    check(`in no steering a tropical cyclone drifts west by the same in both hemispheres and poleward (the northern one ends further north than the southern one) (36 h: ${n.map((x) => x.toFixed(2)).join('/')} north, ${s.map((x) => x.toFixed(2)).join('/')} south), a subtropical one too (${nsc.map((x) => x.toFixed(2)).join('/')} and ${ssc.map((x) => x.toFixed(2)).join('/')})`,
      n[0] > s[0] + 0.5 && n[1] < -1 && s[1] < -1 && near(n[1], s[1], 0.2) && nsc[0] > ssc[0] + 0.5 && nsc[1] < -1 && ssc[1] < -1 && near(nsc[1], ssc[1], 0.2)); }       // (the wobble is the same draw in both, so the north-south sum is the noise and the difference is twice the poleward drift)
}

/* ---- the humidity and shear data of the pages: the joint-lag El Nino coefficients and the gains of the month (tools/make_env_seasonality.py) ----------------------------------------------------- */
{
  const dataOf = (f) => JSON.parse(readFileSync(new URL(`../data/generated/${f}`, import.meta.url), 'utf8'));
  const files = { atlantic: 'data.json', eastpacific: 'eastpacific-data.json', westpacific: 'westpacific-data.json', nio: 'nio-data.json', aus: 'aus-data.json', swio: 'swio-data.json', spac: 'spac-data.json', satl: 'satl-data.json', med: 'med-data.json' };
  const inRange = (a, lo, hi) => Array.isArray(a) && a.length === 12 && a.every((v) => typeof v === 'number' && v >= lo && v <= hi);
  const i16 = (b64) => { const u = Buffer.from(b64, 'base64'); return new Int16Array(u.buffer, u.byteOffset, u.length >> 1); };
  const sumRms = (d, k) => { const a = i16(d[k].enso), n = a.length / 3; let t = 0; for (let q = 0; q < n; q++) { const s = (a[q] + a[n + q] + a[2 * n + q]) / 1000; t += s * s; } return Math.sqrt(t / n); };
  const d = Object.fromEntries(Object.entries(files).map(([b, f]) => [b, dataOf(f)]));
  const seven = ['westpacific', 'nio', 'aus', 'swio', 'spac', 'satl', 'med'];
  check('the seven pages whose storm physics is fitted on the joint-lag fields carry a gain of each calendar month on the El Nino response (0.2 to 1) and on the year-to-year modes (0.3 to 1.5) of the humidity and of the shear',
    seven.every((b) => inRange(d[b].humidity.seas.enso, 0.2, 1) && inRange(d[b].humidity.seas.eof, 0.3, 1.5) && inRange(d[b].shear.seas.enso, 0.2, 1) && inRange(d[b].shear.seas.eof, 0.3, 1.5)));
  check('the Atlantic and the East Pacific, whose storm physics was calibrated on the original fields, carry none (a page without them is what it was)', !d.atlantic.humidity.seas && !d.atlantic.shear.seas && !d.eastpacific.humidity.seas && !d.eastpacific.shear.seas);
  // the response to a sustained 1 degC event is the three lag terms added: fitted jointly it is about half what one-lag-at-a-time fits gave (the Atlantic: 2.1 % of humidity per degree, the East Pacific 5.4, West Pacific before 6.4)
  const wp = sumRms(d.westpacific, 'humidity'), ep = sumRms(d.eastpacific, 'humidity');
  check(`the West Pacific's sustained-event humidity response is the joint fit's (${wp.toFixed(2)} % per degree; the one-lag-at-a-time fit gave 6.36, the East Pacific's unchanged one is ${ep.toFixed(2)}), the shear's too (${sumRms(d.westpacific, 'shear').toFixed(2)} kt; 5.30)`,
    wp < 3.6 && wp > 2.4 && sumRms(d.westpacific, 'shear') < 3.2 && ep > 5);

  // all nine pages are switched on: each carries the climatology its engine is anchored to (the maps: 12 months of rates and seeds on the page's grid, the mean drift and the page's own mean steering and environment) and the real normals and
  // daily ACE its season summary is drawn against, and each basin but the Atlantic has fitted physics of its own (BASIN_PARAMS)
  const ids = Object.keys(files), grid3 = (a, ny, nx) => Array.isArray(a) && a.length === 12 && a.every((m) => Array.isArray(m) && m.length === ny && m.every((r) => Array.isArray(r) && r.length === nx));
  const maps = (b) => d[b].storms && d[b].storms.maps;
  check(`all nine pages carry the storm climatology (${ids.filter((b) => maps(b)).length} of ${ids.length}): the maps of the development rates and the supply of seeds on their own grid, the drift, the steering and environment they were fitted against`,
    ids.every((b) => { const m = maps(b); return !!m && ['grid', 'drift', 'steerClim', 'haz', 'spawn', 'env0'].every((k) => m[k] != null) && grid3(m.haz.T, m.grid.ny, m.grid.nx) && grid3(m.haz.S, m.grid.ny, m.grid.nx) && grid3(m.spawn, m.grid.ny, m.grid.nx); }));
  check('and the real normals and the daily ACE percentiles of their season summary (366 days; named storms, ACE and its spread a season)',
    ids.every((b) => { const s = d[b].storms; return s && s.ace && s.ace.mean.length === 366 && s.ace.p10.length === 366 && s.ace.p90.length === 366 && s.normals.named > 0 && s.normals.ace > 0 && s.normals.aceSd > 0 && s.normals.dep >= s.normals.named; }));
  { const was = H.calibrated(true), at = H.defaultParams('atlantic'), fit = ids.filter((b) => b !== 'atlantic').map((b) => [b, H.defaultParams(b)]); H.calibrated(was);
    check(`every other basin has the fitted law of its own: ${fit.map(([b, p]) => `${b} ${p.vpScale.toFixed(2)}/${p.kUp.toFixed(3)}`).join(', ')} (potential-wind scale / growth rate; the Atlantic's ${at.vpScale}/${at.kUp.toFixed(3)}) and a genesis latitude gate that starts where its depressions really form`,
      fit.every(([, p]) => p.vpScale !== at.vpScale && p.kUp !== at.kUp && p.genGate.lat[0] !== at.genGate.lat[0])); }
}

/* ---- milestone 11: no crossing of the equator, and each basin's own intensity scale ---------------------------------------------------------- */
{
  // the soft floor: identity (bit for bit) poleward of 2.5 degrees, positive for any step, monotone, the same in the mirror image
  const ks = (l, d) => H.keepSide(l, d, 2.5);
  check('the equator floor leaves a step that ends poleward of 2.5 degrees exactly as it was (both hemispheres)', ks(10, -0.3) === 10 + -0.3 && ks(-10, 0.3) === -10 + 0.3 && ks(3, -0.4) === 3 + -0.4 && ks(-3, 0.4) === -3 + 0.4 && ks(25, 0.7) === 25 + 0.7);
  check('a step toward the equator that would take a system across it ends on its own side (never zero, never the other hemisphere): 1 deg by -50, -1 deg by +50, 0 by -3',
    ks(1, -50) > 0 && ks(-1, 50) < 0 && ks(0, -3) > 0 && ks(1, -50) < 2.5 && ks(-1, 50) > -2.5 && near(ks(2.6, -0.4), 2.5 * Math.exp(-0.3 / 2.5), 1e-12));
  check('the floor is monotone (a longer step toward the equator never ends further from it) and mirror-symmetric', (() => { let ok = true; for (let l = 0.2; l < 8; l += 0.4) for (let d = -6; d < 1; d += 0.3) { if (ks(l, d - 0.1) > ks(l, d) + 1e-12 || !near(ks(-l, -d), -ks(l, d), 1e-12)) ok = false; } return ok; })());
  // the whole engine: strong steering toward the equator for 15 days, a tropical cyclone, a wave and a low, in both hemispheres, hour by hour
  const southward = makeEnv({ sst: 29, shear: 5, rh: 70, steer: () => [0, -25, 0, -25, 0, -25] }), northward = makeEnv({ sst: 29, shear: 5, rh: 70, steer: () => [0, 25, 0, 25, 0, 25] });
  const cross = (th, lat, env, side) => { let worst = 99, seen = 0; for (let sd = 1; sd <= 6; sd++) { const S = system(th, lat, -60, 35, sd, th === 'nl' ? { nlTill: 1e9 } : null); for (let h = 0; h < 360 && S.alive; h++) { H.stepSystem(S, env, h, sd, par); seen++; worst = Math.min(worst, side * S.lat); } } return { worst, seen }; };
  const res = [['tc', 4, southward, 1], ['wv', 5, southward, 1], ['nl', 4, southward, 1], ['tc', -4, northward, -1], ['wv', -5, northward, -1], ['nl', -4, northward, -1]].map(([th, la, env, side]) => cross(th, la, env, side));
  check(`pushed toward the equator by 25 kt of steering for 15 days, a cyclone, a wave and a low never cross it in either hemisphere (lowest |latitude| ${res.map((r) => r.worst.toFixed(2)).join(' / ')} over ${res.reduce((a, r) => a + r.seen, 0)} hours)`, res.every((r) => r.worst > 0.05 && r.seen > 200));
}
{
  const ids = Object.keys(H.BASINS), SC = (b) => H.scaleOf(b);
  check('every basin has an intensity scale of its own: classes ascending from 0, a first storm class at 34 kt (the naming wind of every basin), three season-bar tags', ids.every((b) => { const C = SC(b).classes; return C[0][0] === 0 && C.every((c, i) => i === 0 || c[0] > C[i - 1][0]) && C.some((c) => c[0] === 34) && SC(b).bar.length === 3; }));
  check('the Atlantic, East Pacific, South Atlantic and Mediterranean use Saffir-Simpson exactly (the same class as H.category at every wind)', ['atlantic', 'eastpacific', 'satl', 'med'].every((b) => { for (let v = 0; v <= 170; v += 5) { const k = H.classOf(b, v, 'tc'); if (k.short !== H.category(v).short) return false; } return true; }));
  check('every cut-off is a boundary: the class changes at the first best-track (5-kt) wind of it and not 5 kt below (all nine scales; 96 and 137 kt are first reached at 100 and 140)', ids.every((b) => SC(b).classes.every((c, i) => { const m5 = Math.ceil(c[0] / 5) * 5; return i === 0 || (H.classOf(b, m5, 'tc').idx === i && H.classOf(b, m5 - 5, 'tc').idx === i - 1); })));
  // the official cut-offs of the 10-minute agencies converted to the 1-minute wind (/0.88) and of the 3-minute one (x 1.05), rounded to 5 kt; the first storm class stays at 34
  const conv = (kt, f) => 5 * Math.round((kt * f) / 5);
  const mins = (b) => SC(b).classes.map((c) => c[0]).filter((v) => v > 34);
  check('the converted cut-offs are what the agencies say: Meteo-France 48 / 64 / 90 / 116 kt of 10-min wind, BoM and Fiji 48 / 64 / 86 / 108, IMD 28 / 48 / 64 / 90 / 120 kt of 3-min wind (JTWC: 64 and 130 of 1-min, JMA 48 of 10-min)',
    mins('swio').join() === [48, 64, 90, 116].map((k) => conv(k, 1 / 0.88)).join() && mins('aus').join() === [48, 64, 86, 108].map((k) => conv(k, 1 / 0.88)).join() && mins('spac').join() === mins('aus').join()
    && SC('nio').classes.map((c) => c[0]).filter((v) => v > 0 && v !== 34).join() === [28, 48, 64, 90, 120].map((k) => conv(k, 1.05)).join() && mins('westpacific').join() === [conv(48, 1 / 0.88), 64, 130].join());
  const name = (b, v) => H.classOf(b, v, 'tc').long;
  check(`each page calls a wind what its own region calls it: 130 kt is ${name('westpacific', 130)} in the West Pacific, ${name('nio', 100)} in the North Indian (100 kt), ${name('swio', 105)} in the South-West Indian (105), ${name('aus', 80)} and ${name('spac', 105)} in the Australian region (80) and the South Pacific (105), ${name('atlantic', 105)} in the Atlantic`,
    name('westpacific', 130) === 'Super Typhoon' && name('westpacific', 64) === 'Typhoon' && name('westpacific', 55) === 'Severe Tropical Storm' && name('nio', 100) === 'Extremely Severe Cyclonic Storm' && name('nio', 130) === 'Super Cyclonic Storm'
    && name('swio', 105) === 'Intense Tropical Cyclone' && name('aus', 80) === 'Category 3 Severe Tropical Cyclone' && name('spac', 105) === 'Category 4 Severe Tropical Cyclone' && name('aus', 20) === 'Tropical Low' && name('spac', 20) === 'Tropical Depression' && name('atlantic', 105) === 'Category 3 Hurricane');
  check('a subtropical cyclone keeps the subtropical names whatever the region', ids.every((b) => H.classOf(b, 40, 'sc').long === 'Subtropical Storm' && H.classOf(b, 30, 'sc').long === 'Subtropical Depression'));
  check('the season-bar counters keep their engine thresholds and the real normals they are compared with: the tags are the only thing that is native (HURR / TYPH / VSCS ... , MAJOR / ESCS ..., CAT 5 / SUPER ...)',
    ids.every((b) => SC(b).bar.every((t) => typeof t === 'string' && t.length > 0)) && SC('westpacific').bar.join() === 'TYPH,MAJOR,SUPER' && SC('nio').bar[0] === 'VSCS' && SC('aus').bar.join() === 'SEVERE,CAT 4+,CAT 5');
}

/* ---- milestone 11: the outlook (areas of interest with their chance of formation in 2 and 7 days, X's and arrows) and invests -------------------------------------------------------- */
{
  const GRO = { lon0: -105, lat0: -40, res: 5, nx: 21, ny: 17 };                                   // both hemispheres: 40S to 40N
  const fieldO = (f) => Array.from({ length: 12 }, (_, m) => Array.from({ length: GRO.ny }, (_, j) => Array.from({ length: GRO.nx }, (_, i) => f(m, GRO.lat0 + j * GRO.res, GRO.lon0 + i * GRO.res))));
  const flatO = (v) => fieldO(() => v);
  const olMaps = (o = {}) => ({ grid: GRO, drift: { weak: { u: flatO(o.du ?? -8), v: flatO(o.dv ?? 2) }, strong: { u: flatO(-6), v: flatO(5) }, sub: { u: flatO(4), v: flatO(1) }, ex: { u: flatO(15), v: flatO(5) } },
    steerClim: [0, 0, 0, 0, 0, 0].map((x) => flatO(x)), haz: { T: o.hazT ? fieldO(o.hazT) : flatO(o.haz ?? 0.004), S: flatO(o.hazS ?? 0) }, spawn: o.spawn ? fieldO(o.spawn) : undefined, env0: { rh: flatO(58), shear: flatO(8), sst: flatO(28), sstRel: flatO(0) } });
  const PERSIST = { sst: 1e9, rh: 1e9, shear: 1e9, steer: 1e9 }, NOACT = { seasSd: 0, intraSd: 0, K: 6, T: [14, 60] };           // (a persistence forecast is exact in a constant environment: the glue between the outlook and the engine is what is checked)
  const mk = (seed, maps, o = {}) => H.create({ seed, startMs: o.start ?? Date.UTC(2026, 7, 15), basin: o.basin || 'atlantic', auto: !!o.auto, params: H.mergeParams({ shearK: 1, waveRate0: 0, act: NOACT, qSd: 0.4, outlook: { minP7: 0, anomTau: PERSIST } }, o.params || {}), maps });
  const STEER = () => [-8, 2, -8, 2, -8, 2];
  const good = makeEnv({ sst: 28.5, shear: 8, rh: 60, steer: STEER }), marg = makeEnv({ sst: 27, shear: 14, rh: 55, steer: STEER }), subE = makeEnv({ sst: 25, shear: 10, rh: 50, steer: STEER });
  const placeWave = (m) => m.place({ kind: 'wave', lat: 14, lon: -45 }), placeSeed = (m) => { const S = m._seedSystem('N', 'wv', 28, -70, 16, 0, 'seed', false); S.life = 140; return S; };
  const outlookChance = (env, N, place, maps, params) => { let a = 0, b = 0, c = 0, d = 0; for (let sd = 1; sd <= N; sd++) { const m = mk(sd, maps, { params }); place(m); const A = m.outlook(env).areas[0]; if (A) { a += A.raw[0]; b += A.raw[1]; c += A.p2 / 100; d += A.p7 / 100; } } return [a / N, b / N, c / N, d / N]; };      // (the exact chances, and the percentages the page shows, averaged over the seeds)
  const engineChance = (env, N, place, maps, params) => { let a = 0, b = 0; for (let sd = 1; sd <= N; sd++) { const m = mk(sd, maps, { params }), S = place(m); for (let h = 1; h <= 168; h++) { m.advanceTo(h, env); if (S.tdHour >= 0 || !S.alive) break; } if (S.tdHour >= 0) { if (S.tdHour <= 48) a++; if (S.tdHour <= 168) b++; } } return [a / N, b / N]; };
  // ---- the chances are the engine's own: N identical disturbances, the fraction that becomes a depression within 2 and 7 days against the outlook's chance (the same quality draws, averaged)
  const N = 200, MP = olMaps();
  for (const [name, env, place, maps, params] of [['a favourable environment', good, placeWave, MP, null], ['a marginal one (shear 14, 27 degC)', marg, placeWave, MP, null], ['a subtropical seed at 28N over 25 degC water', subE, placeSeed, olMaps({ haz: 0.003, hazS: 0.003 }), null]]) {
    const o = outlookChance(env, N, place, maps, params), e = engineChance(env, N, place, maps, params);
    check(`the outlook's chance of formation in 2 and 7 days is the engine's own in ${name}: ${o[0].toFixed(2)} and ${o[1].toFixed(2)} against ${e[0].toFixed(2)} and ${e[1].toFixed(2)} of ${N} identical disturbances (within 8 points)`, near(o[0], e[0], 0.08) && near(o[1], e[1], 0.08) && near(o[2], e[0], 0.08) && near(o[3], e[1], 0.08));      // (and the shown 2-day and 7-day percentages are those chances, not each other)
  }
  { const sd = { qSd: 0.7, tdMargin: 0.3 }, o = outlookChance(good, N, placeWave, MP, sd), e = engineChance(good, N, placeWave, MP, sd);
    check(`and with a stricter depression (tdMargin 0.3) and a noisier seed (qSd 0.7): ${o[0].toFixed(2)} and ${o[1].toFixed(2)} against ${e[0].toFixed(2)} and ${e[1].toFixed(2)}`, near(o[0], e[0], 0.08) && near(o[1], e[1], 0.08) && near(o[2], e[0], 0.08) && near(o[3], e[1], 0.08)); }
  // ---- a better environment, a better chance; no development rate, no area; a pure persistence forecast against one that relaxes to the climate
  { const at = (shear) => { const m = mk(1, MP); placeWave(m); const A = m.outlook(makeEnv({ sst: 28.5, shear, rh: 60, steer: STEER })).areas[0]; return A ? A.raw[1] : 0; };
    const c = [6, 9, 12, 15, 18].map(at);
    check(`more shear, a smaller chance (7-day chance at shear 6 / 9 / 12 / 15 / 18: ${c.map((x) => x.toFixed(2)).join(' / ')}), and none drawn where next to nothing is able to develop (a zero map rate leaves the floor of 2e-6 an hour: ${(() => { const m = mk(1, olMaps({ haz: 0 }), { params: { outlook: { minP7: 10 } } }); placeWave(m); return m.outlook(good).areas.length; })()} areas of at least 10 %)`, c.every((x, i) => i === 0 || x <= c[i - 1] + 1e-12) && c[0] > c[4] + 0.1 && (() => { const m = mk(1, olMaps({ haz: 0 }), { params: { outlook: { minP7: 10 } } }); placeWave(m); return m.outlook(good).areas.length === 0; })()); }
  { const dry = makeEnv({ sst: 28.5, shear: 16, rh: 50, steer: STEER }), wet = makeEnv({ sst: 28.5, shear: 3, rh: 70, steer: STEER });
    const cl = (env, tau) => { const m = mk(2, MP, { params: { outlook: { anomTau: { sst: tau, rh: tau, shear: tau, steer: tau } } } }); placeWave(m); const A = m.outlook(env).areas[0]; return A ? A.raw[1] : 0; };
    check(`a forecast that lets the anomaly decay to the climate regresses to the mean: over a poor environment its 7-day chance is higher than persistence's (${cl(dry, 48).toFixed(2)} against ${cl(dry, 1e9).toFixed(2)}), over a good one lower (${cl(wet, 48).toFixed(2)} against ${cl(wet, 1e9).toFixed(2)})`, cl(dry, 48) > cl(dry, 1e9) + 0.02 && cl(wet, 48) < cl(wet, 1e9) - 0.02); }
  // ---- what is drawn: percent in fives, 2-day not above 7-day, three classes by the NHC's cut-offs (yellow up to 35, orange 40 to 60, red 65 and over), a closed outline, at most ten areas, highest chance first
  const gradient = makeEnv({ sst: 28.5, rh: 60, shear: (la, lo) => 5 + 0.7 * Math.max(0, la - 12) + (lo > -38 && lo < -24 ? 20 : 0) + (lo < -75 ? 6 : 0), steer: STEER });
  const SP = olMaps({ haz: 0.006, spawn: (mo, la, lo) => (mo === 7 && la >= 10 && la <= 35 && lo >= -90 && lo <= -30 ? 0.15 : 0) });
  const seasonOf = (seed, params) => { const m = mk(seed, SP, { auto: true, params: Object.assign({ waveRate0: 0.46, outlook: { minP7: 10 } }, params || {}) }), seen = []; for (let h = 6; h <= 24 * 14; h += 6) { m.advanceTo(h, gradient); const r = m.outlook(gradient); seen.push([h, r, m, JSON.parse(JSON.stringify(m.olMem.cur))]); } return { m, seen }; };       // (each issue with the memory it left: what it said of every disturbance, drawn or not)
  const S1 = seasonOf(5), areas = S1.seen.flatMap(([, r]) => r.areas), inPoly = (pt, P) => { let c = false; for (let k = 0, j = P.length - 1; k < P.length; j = k++) if ((P[k][0] > pt[0]) !== (P[j][0] > pt[0]) && pt[1] < (P[j][1] - P[k][1]) * (pt[0] - P[k][0]) / (P[j][0] - P[k][0]) + P[k][1]) c = !c; return c; };
  const cls = (p) => (p <= 35 ? 'low' : p <= 60 ? 'medium' : 'high');
  check(`${areas.length} areas over two synthetic weeks (every six hours): chances in steps of 5, from 10 to 100, the 2-day never above the 7-day, class low / medium / high by the 7-day chance (${['low', 'medium', 'high'].map((c) => c + ' ' + areas.filter((a) => a.cls === c).length).join(', ')}), at least 10 % drawn`,
    areas.length > 100 && areas.every((a) => a.p2 % 5 === 0 && a.p7 % 5 === 0 && a.p2 >= 0 && a.p7 >= 10 && a.p7 <= 100 && a.p2 <= a.p7 && a.cls === cls(a.p7) && Number.isInteger(a.p2) && Number.isInteger(a.p7)) && ['low', 'medium', 'high'].every((c) => areas.some((a) => a.cls === c)));
  check('the class cut-offs are the NHC\'s: 35 is yellow, 40 and 60 orange, 65 red', H.outlookClass(H.defaultParams().outlook, 35) === 'low' && H.outlookClass(H.defaultParams().outlook, 40) === 'medium' && H.outlookClass(H.defaultParams().outlook, 60) === 'medium' && H.outlookClass(H.defaultParams().outlook, 65) === 'high');
  check('every area is a closed outline of finite points with a window of formation that starts now or later and lasts, at most ten per issue, highest chance first, and an issue is at 00, 06, 12 or 18Z',
    S1.seen.every(([h, r]) => r.issued === h && r.issued % 6 === 0 && r.areas.length <= 10 && r.areas.every((a, i) => i === 0 || r.areas[i - 1].p7 >= a.p7)) && areas.every((a) => a.poly.length >= 24 && a.poly.every((q) => Number.isFinite(q[0]) && Number.isFinite(q[1])) && a.t0 >= 0 && a.t1 > a.t0 && a.t1 <= 168 + 1e-9));
  check('areas without a disturbance (not formed yet) have neither an X nor an arrow; one that exists has its X, and an arrow only when it is not in favourable conditions yet (X outside its area, the arrow ending in the area, at least 2.5 degrees long, the tip given to 0.1)',
    areas.filter((a) => a.kind === 'unborn').length > 20 && areas.filter((a) => a.kind === 'unborn').every((a) => a.x === null && a.arrow === null && a.id === null && a.birth >= 0)
    && areas.filter((a) => a.kind !== 'unborn').every((a) => a.x && a.id) && areas.filter((a) => a.arrow).every((a) => !inPoly(a.x, a.poly) && inPoly(a.arrow, a.poly) && Math.hypot(a.arrow[0] - a.x[0], (a.arrow[1] - a.x[1]) * Math.cos(a.x[0] * Math.PI / 180)) >= 2.5 - 0.1)
    && areas.filter((a) => a.kind !== 'unborn' && !a.arrow).length > 20 && areas.filter((a) => a.kind !== 'unborn' && !a.arrow).every((a) => inPoly(a.x, a.poly)));
  { const X = areas.filter((a) => a.x), inside0 = X.filter((a) => !a.arrow && a.p2 === 0), arrows = X.filter((a) => a.arrow), off = seasonOf(5, { outlook: { minP7: 10, favP2: [-1, -1] } }).seen.flatMap(([, r]) => r.areas).filter((a) => a.x && !a.arrow && a.p2 === 0);
    check(`a disturbance with a 2-day chance of 0 is not in its shape: of ${X.length} areas of disturbances over two synthetic weeks ${inside0.length} have the X inside with a 2-day chance of 0 (a disturbance that hardly moves is the only one that can), ${arrows.length} have an arrow, all with a chance of ${[...new Set(arrows.map((a) => a.p2))].sort((a, b) => a - b).join(' / ')} % in 2 days; with the rule off ${off.length} X's would be inside their shapes with 0 %`,
      X.length > 100 && inside0.length <= 0.01 * X.length && arrows.length >= 10 && off.length >= 5 && arrows.filter((a) => a.p2 === 0).length >= 0.8 * arrows.length); }
  // ---- the X sits in its area when the conditions are good now, and an arrow points to where they get good when they are not (a front of high shear that the wave leaves behind it, and the reverse)
  { const front = (west) => makeEnv({ sst: 28.5, rh: 60, shear: (la, lo) => ((lo > -50) === west ? 24 : 5), steer: STEER });            // west: high shear east of 50W, low to the west
    const A = (env) => { const m = mk(3, MP); m.place({ kind: 'wave', lat: 14, lon: -42 }); return m.outlook(env).areas[0]; };
    const a1 = A(front(true)), a2 = A(front(false)), a3 = A(good), long = (() => { const m = mk(3, MP, { params: { outlook: { arrowMin: 20 } } }); m.place({ kind: 'wave', lat: 14, lon: -42 }); return m.outlook(front(true)).areas[0]; })();
    check(`a wave in a front of shear it will leave behind gets an arrow to the west (${a1 && a1.arrow ? 'to ' + a1.arrow[1].toFixed(1) + 'W from ' + a1.x[1].toFixed(1) : 'none'}, formation window from ${a1 ? Math.round(a1.t0) : '-'} h), one in good conditions that turn bad and one in good conditions throughout have the X inside (${a2 && !a2.arrow ? 'inside' : 'arrow'}, ${a3 && !a3.arrow ? 'inside' : 'arrow'})`,
      a1 && a1.arrow && a1.arrow[1] < a1.x[1] - 2 && a1.t0 > 12 && a2 && !a2.arrow && a2.t0 === 0 && a3 && !a3.arrow && a3.t0 === 0 && inPoly(a3.x, a3.poly) && inPoly(a2.x, a2.poly) && !inPoly(a1.x, a1.poly));
    const len = Math.hypot(a1.arrow[0] - a1.x[0], (a1.arrow[1] - a1.x[1]) * Math.cos(a1.x[0] * Math.PI / 180)), lenL = long.arrow ? Math.hypot(long.arrow[0] - long.x[0], (long.arrow[1] - long.x[1]) * Math.cos(long.x[0] * Math.PI / 180)) : 0;
    check(`an arrow is at least arrowMin long and the shape starts at its tip: the ${len.toFixed(1)}-degree arrow of that wave is ${lenL.toFixed(1)} degrees when the least length is raised to 20 (X outside the shape ${long.arrow && !inPoly(long.x, long.poly) ? 'yes' : 'no'}, window from ${Math.round(long.t0)} h)`, len > 2.5 && len < 20 && long.arrow && lenL >= 19.9 && lenL <= 21 && !inPoly(long.x, long.poly) && inPoly(long.arrow, long.poly) && long.t0 > a1.t0); }
  // ---- an issue moves on from the last one: a chance changes by at most 20 points, a disturbance seen for the first time starts low, a shape keeps most of itself, an outline is one simple loop
  const iouOf = (A, B) => { const all = A.concat(B), la0 = Math.min(...all.map((q) => q[0])), la1 = Math.max(...all.map((q) => q[0])), lo0 = Math.min(...all.map((q) => q[1])), lo1 = Math.max(...all.map((q) => q[1])); let i = 0, u = 0;
    for (let la = la0; la <= la1; la += 0.3) for (let lo = lo0; lo <= lo1; lo += 0.3) { const a = inPoly([la, lo], A), b = inPoly([la, lo], B); if (a && b) i++; if (a || b) u++; } return u ? i / u : 1; };
  const streamOf = (R, stride = 1) => { const out = { dp7: [], dp2: [], iou: [], first: [], firstP2: [] }; let prevMem = null, prevAreas = {};
    R.seen.forEach(([h, r, , mem], k) => { if (stride > 1 && k % stride) return;
      for (const [key, v] of Object.entries(mem)) { const p = prevMem && prevMem[key]; if (p) { out.dp7.push(Math.abs(v.p7 - p.p7)); out.dp2.push(Math.abs(v.p2 - p.p2)); } else if (prevMem && v.p7 >= 10) { out.first.push(v.p7); out.firstP2.push(v.p2); } }      // (the chance of every disturbance the issue before knew, and what a new one starts at)
      const cur = {};
      for (const a of r.areas) { cur[a.key] = a; const p = prevAreas[a.key]; if (p) { const sh = a.x && p.x && !a.arrow && !p.arrow ? [a.x[0] - p.x[0], a.x[1] - p.x[1]] : [0, 0]; out.iou.push(iouOf(a.poly, p.poly.map((q) => [q[0] + sh[0], q[1] + sh[1]]))); } }       // (a shape against the one before it, carried along with its X)
      prevMem = mem; prevAreas = cur; });
    out.iou.sort((a, b) => a - b); return out; };
  const S2 = seasonOf(6), S3 = seasonOf(7), NOMEM = { outlook: { minP7: 10, rise: 1e3, fall: 1e3, firstP7: 1e3, firstP2: 1e3, morph: 1, maxMove: 1e9, maxGrow: 1e9 } };
  { const T = [S1, S2, S3].map((R) => streamOf(R)), all = { dp7: T.flatMap((t) => t.dp7), dp2: T.flatMap((t) => t.dp2), iou: T.flatMap((t) => t.iou).sort((a, b) => a - b), first: T.flatMap((t) => t.first), firstP2: T.flatMap((t) => t.firstP2) };
    const q = (a, f) => a[Math.floor((a.length - 1) * f)], ctl = streamOf(seasonOf(5, NOMEM));
    check(`no chance jumps: over ${all.dp7.length} issue-to-issue steps of three synthetic weeks the 7-day chance never moves more than ${Math.max(...all.dp7)} points and the 2-day chance ${Math.max(...all.dp2)} (at most 20), and a disturbance's first chance is at most ${Math.max(...all.first)} (7-day, cap 40) and ${Math.max(...all.firstP2)} (2-day, cap 30); with the memory off the same season jumps by ${Math.max(...ctl.dp7)}`,
      all.dp7.length > 300 && Math.max(...all.dp7) <= 20 && Math.max(...all.dp2) <= 20 && all.first.length > 10 && Math.max(...all.first) <= 40 && Math.max(...all.firstP2) <= 30 && Math.max(...ctl.dp7) >= 40);
    const share = (a, x) => a.filter((v) => v < x).length / a.length;
    check(`no shape changes in one issue: a shape and the one before it (carried along with its X) overlap by ${q(all.iou, 0.5).toFixed(2)} in the median and ${q(all.iou, 0.1).toFixed(2)} at the 10th percentile, ${(100 * share(all.iou, 0.5)).toFixed(1)} % of them by less than half and none by less than ${all.iou[0].toFixed(2)}; with the memory off ${(100 * share(ctl.iou, 0.5)).toFixed(1)} % by less than half and some by ${ctl.iou[0].toFixed(2)}`,
      q(all.iou, 0.5) >= 0.85 && q(all.iou, 0.1) >= 0.65 && share(all.iou, 0.5) <= 0.03 && all.iou[0] >= 0.25 && share(ctl.iou, 0.5) >= 0.04 && ctl.iou[0] < 0.1);
    const st2 = [S1, S2].map((R) => streamOf(R, 2)); const d2 = st2.flatMap((t) => t.dp7), f2 = st2.flatMap((t) => t.first);
    check(`and when an issue is skipped (every second one is made, as the page does at high speed) the limit is for the 12 hours: at most ${Math.max(...d2)} points (40)`, d2.length > 100 && Math.max(...d2) <= 40 && Math.max(...f2) <= 40); }
  { let seedr = 20260214; const rand = () => (seedr = (Math.imul(seedr, 1664525) + 1013904223) >>> 0) / 4294967296;
    const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const simple = (P) => { const n = P.length; for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; const a = P[i], b = P[(i + 1) % n], c = P[j], d = P[(j + 1) % n]; if (cr(a, b, c) * cr(a, b, d) < 0 && cr(c, d, a) * cr(c, d, b) < 0) return false; } return true; };
    let n = 0, notSimple = 0, lost = 0, tiny = 0, pts = 0, mx = 0, crossed = 0;
    const fixed = [[[20, -40, 2], [20, -50, 2], [20, -40.5, 2], [20, -50.5, 2.5], [20, -41, 3], [20, -51, 3], [20, -41.5, 3], [20, -51.5, 4], [20, -42, 4]],            // out and back along the same line
      [[20, -40, 1], [24, -40, 1.5], [24, -46, 2], [20, -46, 2.5], [20, -41, 3], [23, -41, 3.5], [23, -44, 4], [21, -44, 4.5], [21, -43, 5]],                                  // a spiral that closes on itself
      [[15, -30, 5], [15.2, -31, 0.8], [15, -32, 5], [15.2, -33, 0.8], [15, -34, 5], [15.1, -35, 0.8], [15, -36, 5], [15.1, -37, 0.8], [15, -38, 5]],                          // radii that swing from wide to narrow
      ...[0.2, 0.35, 0.5].map((gap) => [[20, -40, 1], [20, -43, 1], [20, -46, 1], [20 + 2 + gap, -46, 1], [20 + 2 + gap, -43, 1], [20 + 2 + gap, -40, 1], [20 + 2 + gap, -37, 1], [20 + 2 + gap, -34, 1], [20 + 2 + gap, -31, 1]])];   // a hairpin whose two lanes leave a slot of a few tenths of a degree between them (the grid's saddles)
    const chains = fixed.map((c) => [c, 2.5]);
    for (let k = 0; k < 360; k++) { const south = k % 4 === 3, near = k % 4 === 2; let la = near ? 3 + 2 * rand() : 8 + 20 * rand(), lo = -80 + 40 * rand(), dir = 6.28 * rand(); const ch = [];
      for (let i = 0; i < 9; i++) { ch.push([south ? -la : la, lo, 1 + 5 * rand()]); dir += (rand() < 0.3 ? Math.PI : 1.4) * (rand() - 0.5) * 2; const st = 4 * rand(); la = Math.max(2.6, la + st * Math.sin(dir)); lo += st * Math.cos(dir); }
      chains.push([ch, 2.5]); }
    for (const [ch, eq] of chains) { const P = H.swath(ch, eq); n++; pts += P.length; mx = Math.max(mx, P.length); if (!simple(P)) notSimple++; if (!ch.every((q) => inPoly([q[0], q[1]], P))) lost++; if (P.length < 20) tiny++;
      if (ch[0][0] > 0 ? P.some((q) => q[0] <= 0) : P.some((q) => q[0] >= 0)) crossed++; }
    check(`an outline is one simple loop whatever the chain does: ${n} chains (out and back, a spiral, swinging radii, hairpins with a slot of 0.2 to 0.5 degrees between their lanes, 360 random walks with turns of any size, some at the equator and some in the south), none with a stray inner outline (${notSimple} that cross themselves), none that leaves a disc outside (${lost}), none too coarse (${tiny}), none across the equator (${crossed}), at most ${mx} points`,
      n === 366 && notSimple === 0 && lost === 0 && tiny === 0 && crossed === 0 && mx <= 220 && pts / n >= 40);
    const bad = S1.seen.concat(S2.seen).flatMap(([, r]) => r.areas).filter((a) => !simple(a.poly));
    check(`and so is every outline the outlook drew over the ${S1.seen.length + S2.seen.length} issues of two synthetic weeks (${bad.length} that cross themselves)`, bad.length === 0 && S1.seen.concat(S2.seen).some(([, r]) => r.areas.length > 3)); }
  // ---- no two areas overlap (a shape stops short of the shape of the disturbance before it), no area is longer than the least a forecaster would draw, a label has a place inside its shape
  { const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const cross = (A, B) => { for (let i = 0; i < A.length; i++) { const a = A[i], b = A[(i + 1) % A.length]; for (let j = 0; j < B.length; j++) { const c = B[j], d = B[(j + 1) % B.length]; if (cr(a, b, c) * cr(a, b, d) < 0 && cr(c, d, a) * cr(c, d, b) < 0) return true; } } return false; };
    const overlap = (A, B) => A.some((q) => inPoly(q, B)) || B.some((q) => inPoly(q, A)) || cross(A, B);
    const tally = (Rs) => { let pairs = 0, ov = 0, withX = 0, poles = 0, polesIn = 0, longest = 0; for (const R of Rs) for (const [, r, , mem] of R.seen) {
        for (let i = 0; i < r.areas.length; i++) { const a = r.areas[i]; poles++; if (a.pole && inPoly(a.pole, a.poly)) polesIn++;
          for (let j = i + 1; j < r.areas.length; j++) { pairs++; if (overlap(a.poly, r.areas[j].poly)) { ov++; if ((a.x && inPoly(a.x, r.areas[j].poly)) || (r.areas[j].x && inPoly(r.areas[j].x, a.poly))) withX++; } } }
        for (const v of Object.values(mem)) if (v.chain) { let L = 0; for (let q = 1; q < v.chain.length; q++) L += Math.hypot(v.chain[q][0] - v.chain[q - 1][0], (v.chain[q][1] - v.chain[q - 1][1]) * Math.cos(v.chain[q][0] * Math.PI / 180)); longest = Math.max(longest, L); } }
      return { pairs, ov, withX, poles, polesIn, longest }; };
    const t = tally([S1, S2, S3]), ctl = tally([seasonOf(5, { outlook: { minP7: 10, gap: -100 } })]);
    check(`no two areas overlap: of ${t.pairs} pairs of areas in three synthetic weeks ${t.ov} overlap (${t.withX} of them because the X of one is inside the other), against ${ctl.ov} of ${ctl.pairs} when the shapes are not kept apart`, t.pairs > 300 && t.ov <= 0.03 * t.pairs && ctl.ov >= 0.2 * ctl.pairs);
    check(`every area has the pole of its shape for a label, inside the shape (${t.polesIn} of ${t.poles}), and no swath is longer than ${H.defaultParams().outlook.maxLen} degrees (the longest ${t.longest.toFixed(1)}, before it is made to keep clear of its neighbours)`, t.poles > 100 && t.polesIn === t.poles && t.longest <= H.defaultParams().outlook.maxLen * 1.35);
    const hull = (P) => { const p = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), c = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = []; for (const q of p) { while (lo.length >= 2 && c(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); } for (const q of p.slice().reverse()) { while (up.length >= 2 && c(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); } return lo.slice(0, -1).concat(up.slice(0, -1)); };
    const ar = (P) => { let A = 0; for (let k = 0, m = P.length - 1; k < P.length; m = k++) A += P[m][0] * P[k][1] - P[k][0] * P[m][1]; return Math.abs(A) / 2; };
    const sol = [S1, S2, S3].flatMap((R) => R.seen.flatMap(([, r]) => r.areas.map((a) => { const P = a.poly.map((q) => [q[1] * Math.cos(q[0] * Math.PI / 180), q[0]]); return ar(P) / ar(hull(P)); })));
    check(`every shape is a compact oval, not a crescent or a dumbbell: the least share of its convex hull that it fills is ${Math.min(...sol).toFixed(2)} (over ${sol.length} shapes, at least 0.85)`, sol.length > 300 && Math.min(...sol) >= 0.85); }
  // ---- an arrow does not run away from its disturbance: in a band of shear that the wave is leaving behind, the arrow shrinks as the wave comes toward the place where the conditions are good, its far end stays where it was, and the X is in the shape once the wave is there
  { const band = makeEnv({ sst: 28.5, rh: 60, shear: (la, lo) => 5 + (lo > -38 && lo < -22 ? 20 : 0), steer: STEER }), dflt = H.defaultParams().outlook.anomTau;
    const m = mk(3, MP, { params: { outlook: { anomTau: dflt } } }); m.place({ kind: 'wave', lat: 14, lon: -26 });
    const rows = []; for (let h = 0; h <= 96; h += 6) { m.advanceTo(h, band); const a = m.outlook(band).areas[0]; rows.push(a ? { h, a, len: a.arrow ? Math.hypot(a.arrow[0] - a.x[0], (a.arrow[1] - a.x[1]) * Math.cos(a.x[0] * Math.PI / 180)) : 0, east: Math.max(...a.poly.map((q) => q[1])) } : { h }); }
    const arr = rows.filter((r) => r.a && r.a.arrow), tail = rows.filter((r) => r.a && !r.a.arrow && r.h >= 54);
    const lens = arr.map((r) => r.len), lons = arr.map((r) => r.a.arrow[1]), dl = lens.map((l, i) => (i ? l - lens[i - 1] : 0));
    check(`an arrow shrinks as the disturbance comes toward it and does not run away: ${arr.length} issues with an arrow, lengths ${lens.map((l) => l.toFixed(1)).join(' ')} degrees (never over 18, no step up of more than 0.3), its tip between ${Math.min(...lons).toFixed(1)} and ${Math.max(...lons).toFixed(1)}W`,
      arr.length >= 6 && Math.max(...lens) <= 18 && Math.min(...lens) >= 2.5 && dl.every((d) => d <= 0.3) && lens[0] - lens[lens.length - 1] > 5 && Math.max(...lons) - Math.min(...lons) < 3.5);
    check(`and once the wave is in the good conditions the X is inside the shape with no arrow (${tail.length} issues, ${tail.filter((r) => inPoly(r.a.x, r.a.poly)).length} with the X inside), and the shape does not jump when the arrow goes (east edge ${arr.length ? arr[arr.length - 1].east.toFixed(1) : '-'} to ${tail.length ? tail[0].east.toFixed(1) : '-'}W)`,
      tail.length >= 6 && tail.every((r) => inPoly(r.a.x, r.a.poly)) && Math.abs(arr[arr.length - 1].east - tail[0].east) < 3.5);
    const m2 = mk(3, MP, { params: { outlook: { anomTau: dflt } } }); m2.place({ kind: 'wave', lat: 14, lon: -60 }); const ctr = [];
    for (let h = 0; h <= 96; h += 6) { m2.advanceTo(h, good); const a = m2.outlook(good).areas[0]; if (a) { const c = a.poly.reduce((t, q) => [t[0] + q[0] / a.poly.length, t[1] + q[1] / a.poly.length], [0, 0]); ctr.push({ a, d: Math.hypot(c[0] - a.x[0], (c[1] - a.x[1]) * Math.cos(a.x[0] * Math.PI / 180)) }); } }
    check(`a disturbance in good conditions stays in its shape and the shape follows it: ${ctr.length} issues over four days, the X inside the shape every time (${ctr.filter((r) => inPoly(r.a.x, r.a.poly) && !r.a.arrow).length}), the shape's centre ${Math.min(...ctr.map((r) => r.d)).toFixed(1)} to ${Math.max(...ctr.map((r) => r.d)).toFixed(1)} degrees from the X (it does not drift away)`,
      ctr.length === 17 && ctr.every((r) => inPoly(r.a.x, r.a.poly) && !r.a.arrow) && Math.max(...ctr.map((r) => r.d)) - Math.min(...ctr.map((r) => r.d)) < 3); }
  // ---- the X is in its shape only while the 2-day chance is not 0 (nothing expected within two days is a disturbance that is not in favourable conditions yet, so it is not in its shape yet): it does not go in and out at the edge,
  // an arrow does not point farther than a forecaster would, and an arrow that stays for days loses the belief in its chance
  { const length = (a) => (a && a.arrow ? Math.hypot(a.arrow[0] - a.x[0], (a.arrow[1] - a.x[1]) * Math.cos(a.x[0] * Math.PI / 180)) : 0);
    const ZONE = (edge) => olMaps({ hazT: (mo, la, lo) => (lo <= edge ? 0.02 : 0) });                 // (a wave can develop only west of a line: the farther the line, the later the chance builds up)
    const wz = (edge, o) => { const m = mk(3, ZONE(edge), { params: Object.assign({ hazFloor: 0 }, o) }); m.place({ kind: 'wave', lat: 14, lon: -20 }); return m.outlook(good).areas[0]; };
    const inn = wz(-30), arr = wz(-34), cap = wz(-42), hid = wz(-46), free = wz(-46, { outlook: { arrowMax: [60, 60] } }), nor = wz(-34, { outlook: { favP2: [-1, -1] } });
    check(`the X is outside its shape while the 2-day chance is 0, and the shape is where the chance builds up: a wave that can develop 10 degrees ahead has a 2-day chance of ${inn.p2} % and its X inside; 14 degrees ahead it is ${arr.p2} % (7-day ${arr.p7} %), the X outside and a ${length(arr).toFixed(1)}-degree arrow to the shape, which starts ${Math.round(arr.t0)} h from now; with the rule off the X is inside with ${nor.p2} % (${nor.arrow ? 'arrow' : 'no arrow'})`,
      inn.p2 > 0 && !inn.arrow && inPoly(inn.x, inn.poly) && arr.p2 === 0 && arr.p7 >= 10 && arr.arrow && !inPoly(arr.x, arr.poly) && inPoly(arr.arrow, arr.poly) && length(arr) > 10 && arr.t0 >= 48 && !nor.arrow && inPoly(nor.x, nor.poly) && nor.p2 === 0);
    check(`an arrow does not point farther than ${H.defaultParams().outlook.arrowMax[0]} degrees: where the chance builds up ${length(cap).toFixed(0)} degrees ahead the arrow points there, 5 degrees farther the area is not drawn yet (${hid ? 'drawn' : 'none'}), and it would be with the cap raised (${length(free).toFixed(1)} degrees)`,
      cap.arrow && length(cap) > 20 && length(cap) <= 30 && !hid && free.arrow && length(free) > 30);
    const mkz = (haz, o) => { const m = mk(3, olMaps({ haz }), { params: Object.assign({ hazFloor: 0 }, o) }); m.place({ kind: 'wave', lat: 14, lon: -40 }); return m; };
    let hz = 5e-5, band = 0; for (let k = 0; k < 80 && !band; k++, hz *= 1.1) { const A = mkz(hz).outlook(marg).areas[0]; if (A && A.raw[0] >= 0.018 && A.raw[0] <= 0.026) band = hz; }
    const fresh = mkz(band); fresh.advanceTo(6, marg); const F = fresh.outlook(marg).areas[0];
    const stay = mkz(band); const G0 = stay.outlook(good).areas[0]; stay.advanceTo(6, marg); const G1 = stay.outlook(marg).areas[0];
    const ctl = mkz(band, { outlook: { favP2: [0.03, 0.03] } }); ctl.outlook(good); ctl.advanceTo(6, marg); const C1 = ctl.outlook(marg).areas[0];
    check(`the X does not go in and out at the edge: with a 2-day chance of ${(100 * F.raw[0]).toFixed(1)} % (between 1.5 and 3 %) a wave that is new has its X outside (a ${length(F).toFixed(1)}-degree arrow, 2-day ${F.p2} %), one that was in its shape the issue before (${(100 * G0.raw[0]).toFixed(0)} % in good conditions) stays in it (2-day ${G1.p2} %, no arrow), and with no band between the two limits it would have left (${C1.arrow ? 'arrow' : 'inside'})`,
      band > 0 && F.arrow && !inPoly(F.x, F.poly) && F.p2 === 0 && G0.p2 > 0 && !G0.arrow && !G1.arrow && inPoly(G1.x, G1.poly) && G1.p2 === 5 && C1.arrow && !inPoly(C1.x, C1.poly));
    const carrot = (o) => { const m = mk(3, olMaps({ haz: 0.01 }), { params: Object.assign({ hazFloor: 0 }, o) }), S = m.place({ kind: 'wave', lat: 14, lon: -20 }), out = []; for (let k = 0; k <= 24; k++) { const edge = S.lon - 14, env = makeEnv({ sst: 28.5, rh: 60, shear: (la, lo) => (lo > edge ? 25 : 8), steer: STEER }); m.advanceTo(k * 6, env); out.push(m.outlook(env).areas[0]); } return out; };
    const c1 = carrot(), c0 = carrot({ outlook: { cred: [1e9, 1, 1] } });
    check(`an arrow that stays for days loses the belief in its chance: a wave with good conditions always 14 degrees ahead of it (they run away as fast as it comes) has an arrow at every one of ${c1.length} issues (${c1.filter((a) => a && a.arrow).length}), a 7-day chance of ${c1[3].p7} % at the fourth and ${c1[24].p7} % at the last (${c0[3].p7} % and ${c0[24].p7} % when nothing is discounted)`,
      c1.every((a) => a && a.arrow) && c1[24].p7 <= 0.6 * c1[3].p7 && c0[24].p7 >= 0.9 * c0[3].p7 && c1.every((a, k) => k < 7 || a.p7 <= c1[3].p7)); }
  // ---- a disturbance seen for the first time starts low whatever its chance is, an old memory is not used, and a shape moves at most 3.5 degrees in an issue
  { const HOT = olMaps({ haz: 0.03, spawn: (mo, la, lo) => (mo === 7 && la >= 10 && la <= 35 && lo >= -90 && lo <= -30 ? 0.15 : 0) }), mkh = (params) => mk(11, HOT, { auto: true, params: Object.assign({ waveRate0: 0.46 }, params || {}) });
    const run = (params) => { const m = mkh(params), first = []; for (let h = 0; h < 24 * 20; h += 6) { m.advanceTo(h + 6, good); const r = m.outlook(good); if (h) for (const a of r.areas) if (!(a.key in m.olMem.prev)) first.push([a.p7, a.p2]); } return first; };
    const a = run(), c = run({ outlook: { firstP7: 1000, firstP2: 1000 } }), mx = (l, k) => Math.max(0, ...l.map((v) => v[k]));
    check(`a disturbance seen for the first time starts low however good its chances are: in a very favourable environment the first chance of ${a.length} of them is at most ${mx(a, 0)} % (7-day) and ${mx(a, 1)} % (2-day), against ${mx(c, 0)} % and ${mx(c, 1)} % when the cap is off`, a.length >= 3 && mx(a, 0) <= 40 && mx(a, 1) <= 30 && mx(c, 0) >= 60 && mx(c, 1) >= 45);
    const stale = (params) => { const m = mkh(params); for (let h = 6; h <= 24 * 6; h += 6) { m.advanceTo(h, good); m.outlook(good); } m.advanceTo(24 * 10, good); return m; };
    const S4 = stale(), kept = JSON.stringify(S4.outlook(good).areas), none = H.restore(JSON.parse(JSON.stringify(stale().serialize())), { maps: HOT }), cleared = (none.olMem = null, JSON.stringify(none.outlook(good).areas)), used = JSON.stringify(stale({ outlook: { memH: 1e6 } }).outlook(good).areas);
    check(`after more than 30 hours without an issue the old memory is not used: the issue four days after the last is exactly the one an engine with no memory makes (${kept.length === cleared.length && kept === cleared ? 'same' : 'different'}, ${S4.outlook(good).areas.length} areas), and it would not be if the memory were kept (${used === kept ? 'same' : 'different'})`, kept === cleared && used !== kept && S4.outlook(good).areas.length >= 2);
    const dflt = H.defaultParams().outlook.anomTau, band = makeEnv({ sst: 28.5, rh: 60, shear: (la, lo) => (lo > -44 ? 25 : 8), steer: STEER });
    const mkw = (o) => { const m = mk(3, MP, { params: { outlook: Object.assign({ anomTau: dflt }, o || {}) } }); m.place({ kind: 'wave', lat: 14, lon: -30 }); return m; };
    const len = (a) => (a && a.arrow ? Math.hypot(a.arrow[0] - a.x[0], (a.arrow[1] - a.x[1]) * Math.cos(a.x[0] * Math.PI / 180)) : 0);
    const m = mkw(); m.outlook(good); const heads = [], areas = []; for (let k = 1; k <= 6; k++) { m.advanceTo(6 * k, band); areas.push(m.outlook(band).areas[0]); heads.push(m.olMem.cur.M1.chain[0]); }
    const raw = (() => { const m2 = mkw(); m2.advanceTo(6, band); return m2.outlook(band).areas[0]; })();
    const dist = (h, g) => Math.hypot(h[0] - g[0], (h[1] - g[1]) * Math.cos(g[0] * Math.PI / 180)), moves = heads.slice(1).map((h, i) => dist(h, heads[i])), lens = areas.map(len);
    const mm = H.defaultParams().outlook.maxMove;
    check(`a shape moves no further than ${mm} degrees in one issue: when the 2-day chance falls to 0 and the chance builds up ${len(raw).toFixed(1)} degrees away, the X is outside its shape at once with the least arrow (${lens[0].toFixed(1)} degrees, the tip in the shape), and the head of the shape then moves ${moves.map((v) => v.toFixed(1)).join(', ')} degrees in the next issues (the arrow ${lens.map((v) => v.toFixed(1)).join(', ')})`,
      len(raw) > 10 && areas.every((a) => a.arrow && !inPoly(a.x, a.poly) && inPoly(a.arrow, a.poly)) && lens[0] >= 2.4 && lens[0] <= 2.7 && moves.every((v) => v <= mm + 0.2) && lens[5] > lens[0] + 1); }
  // ---- a shape that a neighbour held short grows back by no more than a degree or two an issue (the older wave's area goes: the younger's grows from 8 degrees to its full 14 in steps, not at once)
  { const m = mk(3, MP, { params: { outlook: { anomTau: H.defaultParams().outlook.anomTau } } }), A = m.place({ kind: 'wave', lat: 14, lon: -45 }), B = m.place({ kind: 'wave', lat: 14, lon: -33 }), lens = [];
    m.outlook(good); lens.push(m.olMem.cur[B.id].len); m.advanceTo(6, good); m.outlook(good); lens.push(m.olMem.cur[B.id].len);
    m.advanceTo(12, good); A.alive = false; A.end = 12; for (let h = 12; h <= 36; h += 6) { m.advanceTo(h, good); m.outlook(good); lens.push(m.olMem.cur[B.id].len); }
    const steps = lens.slice(2).map((l, i) => l - lens[i + 1]), mm = H.defaultParams().outlook.maxMove;
    check(`a shape that a neighbour held short grows back by at most ${mm} degrees an issue: the younger wave's swath is ${lens.map((l) => l.toFixed(1)).join(', ')} degrees long over six issues, the older wave's area gone at the third (steps ${steps.map((v) => v.toFixed(1)).join(', ')})`,
      lens[1] < 10 && steps.every((v) => v <= mm + 0.1) && steps[0] > 1 && lens[lens.length - 1] > 13); }
  // ---- a disturbance keeps its identity from the time it is only an area to the time it is a wave or a seed with an X (the same key), and its chance goes on from where it was
  { let linked = 0, linkedW = 0, linkedN = 0, worst = 0, ids = 0, born = 0;
    for (const R of [S1, S2, S3]) {
      R.seen.forEach(([h, , m, mem], k) => { if (!k) return; const before = R.seen[k - 1][3];
        for (const S of m.systems) if (S.ck && S.ck[0] === 'u' && S.born > h - 6 && S.born <= h) { born++; if (before[S.ck] && mem[S.ck]) { linked++; if (S.ck[1] === 'W') linkedW++; else linkedN++; worst = Math.max(worst, Math.abs(mem[S.ck].p7 - before[S.ck].p7)); } } });
      for (const S of R.m.systems) if (S.ck && S.ck[0] === 'u') ids++; }
    check(`the area of a system that is not born yet and the one it becomes after the birth are one thing: of ${born} systems born in three synthetic weeks ${linked} were known before the birth (${linkedW} waves, ${linkedN} seeds) and came out of it with the same key and a chance that went on from where it was (at most ${worst} points off; ${ids} systems carry the key of their birth)`, linkedW >= 3 && linkedN >= 3 && worst <= 20 && ids >= 4 && born >= linked); }
  { const m = mk(2, MP, { auto: true }), seen = []; m.advanceTo(24, good); m.outlook(good); m.advanceTo(30, good); const first = m.outlook(good); placeWave(m); const r1 = m.outlook(good), A = r1.areas.find((a) => a.id === 'M1');
    const hostile = makeEnv({ sst: 28.5, shear: 40, rh: 40, steer: STEER }), m3 = mk(2, MP, { auto: true, params: { outlook: { minP7: 10 } } }); m3.advanceTo(30, hostile); placeWave(m3); const none = m3.outlook(hostile).areas.length; m3.advanceTo(36, good); const late = m3.outlook(good).areas.find((a) => a.id === 'M1');
    check(`a hand-placed wave in good conditions shows the chance it has, not the cap of a newcomer: ${A.p7} % (the cap of a disturbance that shows up is ${m.par.outlook.firstP7}); one that was no area at its first issue (${none} areas in 40 kt of shear) is held to the cap when it shows up six hours later (${late ? late.p7 : '-'} % of the ${A.p7} it would have)`, A.p7 > m.par.outlook.firstP7 && first.areas.every((a) => a.id !== 'M1') && none === 0 && late && late.p7 <= m.par.outlook.firstP7); }
  // ---- a high chance soon is a short area, a thin chance spread over days a long one
  { const w = (haz) => { const m = mk(1, olMaps({ haz }), { params: { outlook: { maxSpan: 1e4, maxLen: 1e4 } } }); placeWave(m); const A = m.outlook(good).areas[0]; return A ? { len: A.t1 - A.t0, p7: A.p7, ext: Math.max(...A.poly.map((q) => q[1])) - Math.min(...A.poly.map((q) => q[1])) } : null; };
    const hi = w(0.03), lo = w(0.0035);
    check(`the window of formation (and the area with it) is short when the chance is high and long when it is thin: ${hi.len.toFixed(0)} h and ${hi.ext.toFixed(1)} degrees of longitude at ${hi.p7} % against ${lo.len.toFixed(0)} h and ${lo.ext.toFixed(1)} degrees at ${lo.p7} %`, hi.p7 > lo.p7 && hi.len < lo.len - 20 && hi.ext < lo.ext); }
  // ---- the track a swath is made along is cut at maxLen degrees however long the window of formation is (the cap on a blended chain is 25 % above that, so the cut is checked on a disturbance that has no last issue to blend with)
  { const arc = (ch) => { let L = 0; for (let q = 1; q < ch.length; q++) L += Math.hypot(ch[q][0] - ch[q - 1][0], (ch[q][1] - ch[q - 1][1]) * Math.cos(ch[q][0] * Math.PI / 180)); return L; };
    const w = (o) => { const m = mk(1, olMaps({ du: -16, haz: 0.0035 }), { params: { outlook: Object.assign({ maxSpan: 1e4 }, o) } }); placeWave(m); const A = m.outlook(good).areas[0]; return { len: arc(m.olMem.cur.M1.chain), win: A.t1 - A.t0 }; };
    const cut = w(), free = w({ maxLen: 1e4 }), mxl = H.defaultParams().outlook.maxLen;
    check(`the track of a swath is cut at ${mxl} degrees: a wave moving at 16 kt with a window of formation of ${cut.win.toFixed(0)} h gets ${cut.len.toFixed(1)} degrees of track at its first issue (${free.len.toFixed(1)} when the cut is off, over the same ${free.win.toFixed(0)} h)`, cut.len <= mxl + 0.1 && free.len > 1.2 * mxl + 0.1); }
  { const m = mk(1, MP); m.advanceTo(12, good); const S = placeWave(m); S.dev = m.hour - 2; S.sust = true; const A = m.outlook(good).areas[0];
    check(`a disturbance that has begun to develop has the X in a small area and a high chance (${A.p2} % and ${A.p7} %, window ${A.t0}-${Math.round(A.t1)} h)`, A.p7 >= 80 && A.p2 === A.p7 && A.arrow === null && A.x && A.t1 <= 24 && A.cls === 'high'); }
  { const m = mk(1, MP); const S = placeWave(m); const A = m.outlook(good).areas[0], R = A.poly.map((q) => Math.hypot(q[0] - 14, (q[1] + 45) * Math.cos(14 * Math.PI / 180)));
    check(`the shape widens with lead: the radius of the area (${Math.min(...R).toFixed(1)}-${Math.max(...R).toFixed(1)} degrees round the wave) is at least 1.2 degrees round the X and several degrees at the far end`, Math.max(...R) > 3.5 && A.poly.length >= 60); }
  // ---- unborn systems: the very births the engine then makes, seen only inside their lead (a wave for days, a local seed a day or two, three in ten not at all)
  { const GATE = { outlook: { lead: { W: [1e5, 1e5, 0], N: [1e5, 1e5, 0], F: [1e5, 1e5, 0] } } }, SPB = olMaps({ haz: 0.004, spawn: (mo, la) => (mo >= 5 && mo <= 9 && la >= 15 && la <= 35 ? 1.5 : 0) });
    const mkb = (seed, start) => H.create({ seed, startMs: start, basin: 'atlantic', auto: true, params: H.mergeParams({ seedFloor: 30 }, GATE), maps: SPB });
    let ok = 0, bad = 0, total = 0;
    for (const [seed, month] of [[7, 6], [11, 7]]) { const m = mkb(seed, Date.UTC(2026, month, 1)), log = [], orig = m._seedSystem.bind(m); m._seedSystem = function (...a) { const S = orig(...a); log.push([S.id[0], S.born, S.lat.toFixed(6), S.lon.toFixed(6)].join()); return S; };
      for (let day = 5; day < 50; day += 9) { m.advanceTo(day * 24 + 5, gradient); const pk = m._peekBirths(gradient, { H0: m.hour, shift: null }), n0 = log.length; m.advanceTo(m.hour + 168, gradient);
        const real = new Set(log.slice(n0)), got = new Set(pk.map((p) => [p.id[1], p.born, p.lat.toFixed(6), p.lon.toFixed(6)].join())); total += real.size; for (const k of got) if (real.has(k)) ok++; else bad++; } }
    check(`the births the outlook looks ahead to are the births the engine makes: ${ok} of ${total} (waves, local seeds and floor seeds, over a week each from eight starting times), and none it made up (${bad})`, total > 100 && ok === total && bad === 0);
    const peek = (lead, H0) => { const m = mkb(7, Date.UTC(2026, 7, 1)); m.par.outlook.lead = lead; return m._peekBirths(gradient, { H0, shift: null }); };
    const DEF = { W: [48, 168, 0], N: [12, 120, 0.3], F: [12, 120, 0.3] }, DENSE = Math;
    let nearAll = 0, nearSeen = 0, farSeen = 0, wNear = 0, wNearSeen = 0, wSeenFar = 0;
    for (let H0 = 0; H0 < 24 * 25; H0 += 6) {
      const all = peek(GATE.outlook.lead, H0), seen = peek(DEF, H0), off = (p) => p.born - H0;
      nearAll += all.filter((p) => p.kind !== 'W' && off(p) <= 12).length; nearSeen += seen.filter((p) => p.kind !== 'W' && off(p) <= 12).length; farSeen += seen.filter((p) => p.kind !== 'W' && off(p) > 120).length;
      wNear += all.filter((p) => p.kind === 'W' && off(p) <= 48).length; wNearSeen += seen.filter((p) => p.kind === 'W' && off(p) <= 48).length; wSeenFar += seen.filter((p) => p.kind === 'W' && off(p) > 168).length;
    }
    check(`a forecaster sees a local seed that is about to be born (within 12 hours) seven times in ten (${nearSeen} of ${nearAll}: three in ten come with no warning), never one more than 120 hours ahead (${farSeen}), and every wave that is born within 48 hours of its coast (${wNearSeen} of ${wNear}), none beyond a week (${wSeenFar})`,
      nearAll > 60 && nearSeen / nearAll > 0.55 && nearSeen / nearAll < 0.85 && farSeen === 0 && wNear > 5 && wNearSeen === wNear && wSeenFar === 0);
  }
  // ---- an issue is held for its six hours, a placed system shows at once, the answer is the same for any chunking of the clock and survives a save
  { const m = mk(4, MP, { auto: true }); m.advanceTo(30, good); const r0 = m.outlook(good); m.advanceTo(32, good); const r1 = m.outlook(good); m.advanceTo(36, good); const r2 = m.outlook(good);
    check(`an issue is held for its six hours (the same object at hour 30 and 32, a new one at 36: issued ${r0.issued}, ${r1.issued}, ${r2.issued})`, r0 === r1 && r2 !== r0 && r0.issued === 30 && r2.issued === 36);
    const n = r2.areas.length; placeWave(m); const r3 = m.outlook(good);
    check(`a hand-placed disturbance is in the outlook at once, without waiting for the next issue (${n} areas, then ${r3.areas.length}: ${r3.areas.map((a) => a.id).join(' ')})`, r3 !== r2 && r3.areas.some((a) => a.id === 'M1' && a.kind === 'placed' && a.x)); }
  { const run = (steps) => { const m = mk(9, SP, { auto: true }); let h = 0; for (const k of steps) { h += k; m.advanceTo(h, gradient); } return JSON.stringify(m.outlook(gradient)); };
    const a = run(new Array(120).fill(1)), b = run([7, 50, 3, 60]), c = run([120]);
    check('the outlook of one hour is the same however the clock was chunked (1 h, mixed, all at once): ' + (a.length / 1024).toFixed(1) + ' KB of areas', a === b && b === c && a.length > 500);
    const stream = (step) => { const m = mk(9, SP, { auto: true }); let out = ''; for (let h = step; h <= 24 * 6; h += step) { m.advanceTo(h, gradient); if (h % 6 === 0) out += JSON.stringify(m.outlook(gradient)); } return out; };
    const s1 = stream(1), s2 = stream(2), s3 = stream(3), s6 = stream(6);
    check('and so are the issues one after another, which move on from each other (the clock run by 1, 2, 3 and 6 hours, an issue every six: ' + (s1.length / 1024).toFixed(0) + ' KB of areas)', s1 === s2 && s2 === s3 && s3 === s6 && s1.length > 5000); }
  { const m = mk(6, SP, { auto: true }); for (let h = 6; h <= 24 * 9; h += 6) { m.advanceTo(h, gradient); m.outlook(gradient); }
    const save = JSON.parse(JSON.stringify(m.serialize())), r = H.restore(save, { maps: SP }), old = JSON.parse(JSON.stringify(save)); delete old.olMem; const r0 = H.restore(old, { maps: SP });
    const same = [JSON.stringify(m.outlook(gradient)) === JSON.stringify(r.outlook(gradient))]; let n = m.outlook(gradient).areas.length;
    for (let h = 24 * 9 + 6; h <= 24 * 12; h += 6) { m.advanceTo(h, gradient); r.advanceTo(h, gradient); const A = m.outlook(gradient); same.push(JSON.stringify(A) === JSON.stringify(r.outlook(gradient))); n += A.areas.length; }
    r0.advanceTo(24 * 9 + 6, gradient);
    check(`a restored engine goes on with the outlook exactly as the one it was saved from, because the memory of the last issue is saved with it (${same.filter(Boolean).length} of ${same.length} issues alike, over three days after the save; ${n} areas); a save with no memory of the outlook (older) restores and goes on (${r0.outlook(gradient).areas.length} areas)`,
      same.every(Boolean) && n > 20 && !!save.olMem && Object.keys(save.olMem.cur).length > 0 && r0.outlook(gradient).areas.length > 0); }
  // ---- tracked lows are candidates too (an X on the low, the L is not drawn under it), only over water where a depression could still form
  { const lowsAt = (lat, lon) => makeEnv({ sst: 28.5, shear: 8, rh: 60, steer: STEER, lows: () => [{ lat, lon, p: 1003, prom: 4 }] });
    const run = (lat, lon) => { const m = mk(2, olMaps({ haz: 0.006, hazS: 0.004 }), { auto: true }), e = lowsAt(lat, lon); m.advanceTo(30, e); return m.outlook(e).areas.filter((a) => a.kind === 'low'); };
    const at26 = run(26, -60), at10 = run(10, -60), inland = (() => { const m = mk(2, olMaps({ haz: 0.006 }), { auto: true }), e = makeEnv({ sst: 28.5, shear: 8, rh: 60, steer: STEER, land: () => true, lows: () => [{ lat: 26, lon: -60, p: 1003, prom: 4 }] }); m.advanceTo(30, e); return m.outlook(e).areas.filter((a) => a.kind === 'low'); })();
    check(`a pressure low over water at 26N is an area of interest with its X (${at26.length}: ${at26.map((a) => a.id + ' ' + a.p2 + '/' + a.p7 + ' %').join(', ')}); at 10N (the waves' business) and over land there is none (${at10.length}, ${inland.length})`, at26.length === 1 && at26[0].x && at26[0].id[0] === 'L' && at10.length === 0 && inland.length === 0); }
  // ---- the equator: an outline never crosses it, in either hemisphere
  { const c = H.capsule([[3, -40], [3.4, -46], [3.8, -52]], [2.6, 3.4, 4.2], 2.5), cs = H.capsule([[-3, -40], [-3.4, -46], [-3.8, -52]], [2.6, 3.4, 4.2], 2.5), raw = H.capsule([[3, -40], [3.4, -46], [3.8, -52]], [2.6, 3.4, 4.2], 0);
    const far = H.capsule([[20, -40]], [3], 2.5), near0 = H.capsule([[20, -40]], [3], 0);
    check(`an outline stays on its side of the equator (northern: lowest latitude ${Math.min(...c.map((q) => q[0])).toFixed(2)}, southern: highest ${Math.max(...cs.map((q) => q[0])).toFixed(2)}; without the floor ${Math.min(...raw.map((q) => q[0])).toFixed(2)}), and is the plain chain of discs where it does not come near it (${far.length} points, the same as without the floor: ${JSON.stringify(far) === JSON.stringify(near0)})`,
      c.every((q) => q[0] > 0) && cs.every((q) => q[0] < 0) && Math.min(...raw.map((q) => q[0])) < 0 && JSON.stringify(far) === JSON.stringify(near0) && far.length === 96); }
  // ---- invests: the letter of the region, 90 to 99 from the first of a season, the same however the clock was run, kept in a save, handed on by a low that becomes a depression
  // ---- an outline is round on the map: a disc (swath of one point) is 1 / cos(latitude) times as wide in longitude as it is high, in the north and in the south, and a swath along a parallel is that much longer in degrees of longitude
  { const ext = (P, k) => Math.max(...P.map((q) => q[k])) - Math.min(...P.map((q) => q[k])), ratio = (lat, chain) => { const P = H.swath(chain, 2.5); return ext(P, 1) / ext(P, 0); };
    const w60 = ratio(60, [[60, -40, 3]]), w20 = ratio(20, [[20, -40, 3]]), wS = ratio(-60, [[-60, -40, 3]]), c60 = 1 / Math.cos(Math.PI / 3), c20 = 1 / Math.cos(Math.PI / 9);
    check(`an outline is round on the map, not on the grid of degrees: a disc is ${w60.toFixed(2)} times as wide in longitude as it is high at 60N (1 / cos latitude: ${c60.toFixed(2)}), ${w20.toFixed(2)} at 20N (${c20.toFixed(2)}) and ${wS.toFixed(2)} at 60S`,
      Math.abs(w60 / c60 - 1) < 0.05 && Math.abs(w20 / c20 - 1) < 0.05 && Math.abs(wS / c60 - 1) < 0.05); }
  { const L = H.investLetter;
    check('the invest letter is the basin\'s: L Atlantic, E East Pacific (C west of 140W), W West Pacific, A Arabian Sea and B Bay of Bengal (78E), S Indian and Australian west of 135E, P east of it, S South-West Indian, P South Pacific, Q South Atlantic, M Mediterranean',
      L('atlantic', -50) === 'L' && L('eastpacific', -110) === 'E' && L('eastpacific', -150) === 'C' && L('westpacific', 140) === 'W' && L('nio', 70) === 'A' && L('nio', 88) === 'B' && L('aus', 120) === 'S' && L('aus', 150) === 'P' && L('swio', 60) === 'S' && L('spac', 170) === 'P' && L('satl', -40) === 'Q' && L('med', 15) === 'M');
    const inv = S1.m.systems.filter((S) => S.invest).concat([]), ids = inv.map((S) => S.invest), nums = ids.map((i) => +i.slice(0, 2)).sort((a, b) => a - b);
    const R = seasonOf(5), same = JSON.stringify(R.m.systems.map((S) => [S.id, S.invest])) === JSON.stringify(S1.m.systems.map((S) => [S.id, S.invest]));
    check(`${ids.length} invests in two weeks (${ids.join(' ')}): each 9x and the letter, all different, numbered from 90 in the order they were given, the same on a second run (${same}) and the counter saved (${JSON.stringify(S1.m.serialize().invN)})`,
      ids.length >= 3 && ids.every((i) => /^9\d[LCEWABSPQM]$/.test(i)) && new Set(ids).size === ids.length && S1.m.invN.L >= ids.length && nums.every((n) => n >= 90 && n < 90 + S1.m.invN.L) && same && S1.m.serialize().invN.L === S1.m.invN.L); }
  { const m = mk(1, MP, { auto: false }), mkSys = () => m._seedSystem('N', 'wv', 14, -45, 20, m.hour, 'seed', false);
    for (let k = 0; k < 13; k++) { const S = mkSys(); S.dist = true; S.life = 1e6; }
    m.advanceTo(6, good);
    const got = m.systems.filter((S) => S.invest).map((S) => S.invest);
    check(`the numbers go 90 to 99 and then round again (13 invests: ${got.join(' ')})`, got.length === 13 && got.slice(0, 10).join() === ['90L', '91L', '92L', '93L', '94L', '95L', '96L', '97L', '98L', '99L'].join() && got.slice(10).join() === '90L,91L,92L');
    const old = JSON.parse(JSON.stringify(m.serialize())); delete old.invN; const r = H.restore(old, { maps: MP });
    check('a save made before invests existed restores with an empty counter and goes on', JSON.stringify(r.invN) === '{}' && (() => { r.advanceTo(r.hour + 6, good); return true; })());
    const y = mk(1, MP, { auto: false, start: Date.UTC(2026, 11, 31, 12) }); const T = y._seedSystem('N', 'wv', 14, -45, 20, 0, 'seed', false); T.dist = true; T.life = 1e6; y.advanceTo(6, good);
    const before = T.invest; y.advanceTo(18, good); const U = y._seedSystem('N', 'wv', 14, -46, 20, y.hour, 'seed', false); U.dist = true; U.life = 1e6; y.advanceTo(24, good);
    check(`a new season numbers its invests from 90 again (${before} on Dec 31, ${U.invest} on Jan 1)`, before === '90L' && U.invest === '90L' && y.season.year === 2027); }
  { const lowEnv = makeEnv({ sst: 28.5, shear: 6, rh: 66, steer: STEER, lows: () => [{ lat: 27, lon: -65, p: 1002, prom: 5 }] });
    let withInv = 0, handed = 0, made = 0, keyed = 0;
    for (let sd = 1; sd <= 30; sd++) { const m = mk(sd, olMaps({ haz: 0.03, hazS: 0.02 }), { auto: true, params: { distOnE: 0.1, distOffE: 0.05 } }), seen = new Set();
      for (let h = 6; h <= 24 * 8; h += 6) { m.advanceTo(h, lowEnv);
        for (const S of m.systems) if (S.origin === 'low' && !seen.has(S.id)) { seen.add(S.id); made++; const t = m.lows.tracks.find((q) => q.became && q.end === S.born && q.lat === S.lat && q.lon === S.lon); if (t && t.invest) { withInv++; if (S.invest === t.invest) handed++; } if (t && S.ck === t.id) keyed++; } } }
    check(`a low with an invest that becomes a depression keeps its number (${handed} of ${withInv} of the ${made} that developed from a tracked low) and the key its area had (${keyed} of ${made})`, made >= 3 && withInv === made && handed === made && keyed === made); }
  // ---- milestone 12: ensembles (a fan of members that start from the system and see a slightly different weather) and the track density
  { const km = (a, b) => Math.hypot((a[0] - b[0]) * 111.2, (a[1] - b[1]) * 111.2 * Math.cos((a[0] + b[0]) / 2 * Math.PI / 180));
    const at = (E, l) => E.members.filter((q) => q.pts.length > l / 3).map((q) => q.pts[l / 3]), mean = (P) => [P.reduce((t, q) => t + q[0], 0) / P.length, P.reduce((t, q) => t + q[1], 0) / P.length];
    const sprd = (E, l) => { const P = at(E, l), c = mean(P); return Math.sqrt(P.reduce((t, q) => t + km(q, c) ** 2, 0) / P.length); };
    const mkS = (sd, v, kind, lat = 14, lon = -40) => { const m = mk(sd, olMaps(), {}), S = m.place({ kind: kind || 'td', lat, lon }); S.th = v > 25 ? 'tc' : 'wv'; S.v = S.vr = v; return [m, S]; };
    const [mA, SA] = mkS(3, 20, 'wave'), before = JSON.stringify(SA), E1 = mA.ensemble(SA.id, good), E2 = mA.ensemble(SA.id, good);
    check(`an ensemble is 24 members of three families (${['GEFS', 'ECENS', 'CMCE'].map((f) => f + ' ' + E1.members.filter((q) => q.fam === f).length).join(', ')}) with their own names (${E1.members[0].name}, ${E1.members[23].name}), the same twice, and it leaves the live system as it was`,
      E1.members.length === 24 && new Set(E1.members.map((q) => q.name)).size === 24 && E1.members.filter((q) => q.fam === 'GEFS').length === 10 && E1.members.filter((q) => q.fam === 'ECENS').length === 8 && E1.members.filter((q) => q.fam === 'CMCE').length === 6
      && JSON.stringify(E1) === JSON.stringify(E2) && JSON.stringify(SA) === before);
    const st = E1.members.map((q) => q.pts[0]), s0 = Math.max(...st.map((q) => km(q, [SA.lat, SA.lon])));
    check(`the members start where the system is (the farthest ${s0.toFixed(0)} km off, the analysis error) and the fan widens with lead: spread ${[0, 12, 24, 48, 96, 168].map((l) => (l ? sprd(E1, l) : mean(st) && Math.sqrt(st.reduce((t, q) => t + km(q, mean(st)) ** 2, 0) / st.length)).toFixed(0)).join(' / ')} km at 0 / 12 / 24 / 48 / 96 / 168 h`,
      s0 < 120 && [12, 24, 48, 96, 168].every((l, i, a) => i === 0 || sprd(E1, l) > sprd(E1, a[i - 1])) && sprd(E1, 24) < 130);
    const [mH, SH] = mkS(3, 90), [mT, ST2] = mkS(3, 45), EH = mH.ensemble(SH.id, good), ET = mT.ensemble(ST2.id, good), tg = { 24: 78, 48: 143, 96: 312, 168: 624 };
    check(`the spread is the size of a real forecast's track error and a mature storm's fan is tighter than a wave's: wave ${[24, 48, 96, 168].map((l) => sprd(E1, l).toFixed(0)).join(' / ')} km (NHC-like ${Object.values(tg).join(' / ')}), 45 kt storm ${[24, 48, 96, 168].map((l) => sprd(ET, l).toFixed(0)).join(' / ')}, 90 kt hurricane ${[24, 48, 96, 168].map((l) => sprd(EH, l).toFixed(0)).join(' / ')} (predictability ${E1.factor.toFixed(2)} / ${ET.factor.toFixed(2)} / ${EH.factor.toFixed(2)})`,
      [24, 48, 96, 168].every((l) => sprd(E1, l) > 0.55 * tg[l] && sprd(E1, l) < 1.6 * tg[l]) && [96, 168].every((l) => sprd(EH, l) < 0.8 * sprd(E1, l)) && sprd(EH, 168) < sprd(ET, 168) && sprd(ET, 168) < sprd(E1, 168) && E1.factor > EH.factor);
    // the real storm, continued in the same weather with its own chances, lies in the fan
    let inside = 0, tot = 0; const rk = [];
    for (let sd = 1; sd <= 30; sd++) { const [m, S] = mkS(sd, sd % 3 ? 20 : 60, sd % 3 ? 'wave' : 'td', 11 + (sd % 7), -30 - (sd * 7) % 40), E = m.ensemble(S.id, good);
      for (const l of [48, 96, 168]) { m.advanceTo(l, good); if (!S.alive) break; const P = at(E, l), c = mean(P), d = P.map((q) => km(q, c)).sort((a, b) => a - b); tot++; if (km([S.lat, S.lon], c) <= d[Math.floor(0.9 * (d.length - 1))]) inside++; rk.push(l); } }
    check(`the real track lies inside the fan: ${inside} of ${tot} real positions at 2, 4 and 7 days are inside the 90 % of the members nearest their mean (at least 85 %)`, tot >= 60 && inside / tot >= 0.85);
    // a fan made six hours later is the same fan moved on, not a new one
    const [m6, S6] = mkS(3, 45), Ea = m6.ensemble(S6.id, good); m6.advanceTo(6, good); const Eb = m6.ensemble(S6.id, good);
    const mv = Ea.members.map((q, i) => km(q.pts[96 / 3], Eb.members[i].pts[90 / 3])).sort((a, b) => a - b), sh0 = sprd(Ea, 96);
    check(`a fan made six hours later is the same fan, not a new one: the same member's position at the same hour four days out moves by ${mv[12].toFixed(0)} km in the median and ${mv[22].toFixed(0)} km at the 90th percentile against a fan ${sh0.toFixed(0)} km wide`, mv[12] < 0.35 * sh0 && mv[22] < 0.8 * sh0);
    // the features the steering is read from are shifted from member to member: where the flow turns sharply (a ridge's edge) the fan opens up, where it is the same everywhere it cannot
    const edge = makeEnv({ sst: 28.5, shear: 8, rh: 60, steer: (la, lo) => (lo > -52 ? [-8, 2, -8, 2, -8, 2] : [10, 16, 10, 16, 10, 16]) }), runE = (env, ens) => { const [m, S] = mkS(3, 60, 'td'); return m.ensemble(S.id, env, { ens }); };
    const eU = runE(good), eE = runE(edge), eN = runE(edge, { disp: [0, 0, 1] });
    check(`a steering edge opens the fan up and a member's shift of the features is what does it: at 4 days the spread is ${sprd(eU, 96).toFixed(0)} km where the flow is the same everywhere, ${sprd(eE, 96).toFixed(0)} km across an edge at 52W where the flow turns to the northeast, and ${sprd(eN, 96).toFixed(0)} km across it with no shift of the features`, sprd(eE, 96) > 1.15 * sprd(eN, 96) && sprd(eN, 96) < 1.2 * sprd(eU, 96));
    const tr = mk(2, olMaps(), {}); tr.lows.tracks.push({ id: 'L1', born: 0, lat: 25, lon: -60, p: 1005, dx: -0.6, dy: 0.2, miss: 0, alive: true, maxDepth: 5, n: 3, pmin: 1005, fixes: [] });
    const EL = tr.ensemble('L1', good), EN = tr.ensemble('L9', good), EW = tr.ensemble(SA.id.replace('M', 'X'), good);
    check(`a tracked low has a fan too (${EL ? EL.members.length : 0} members, the first leaving ${EL ? (EL.members[0].pts[4][1] - EL.members[0].pts[0][1]).toFixed(1) : '-'} degrees of longitude in 12 h, west as the low was moving), and something that is not there has none (${EN === null && EW === null ? 'null' : 'a fan'})`,
      EL && EL.members.length === 24 && EL.members[0].pts[4][1] < EL.members[0].pts[0][1] - 0.5 && EN === null && EW === null);
    const D = H.ensDensity(E1.members), cellOf = (la, lo) => { const i = Math.round((lo - D.lon0) / D.dlon), j = Math.round((H.mercY(la) - D.my0) / D.dmy); return D.frac[j * D.nx + i]; };
    const tm = (l) => { const c = mean(at(E1, l)); return cellOf(c[0], c[1]); }, same = H.ensDensity(Array.from({ length: 6 }, () => E1.members[0])), fmax = (d) => Math.max(...d.frac);
    check(`the track density is the share of members near each place: ${tm(0).toFixed(2)} at the start, ${tm(24).toFixed(2)} at 1 day, ${tm(72).toFixed(2)} at 3 days, ${tm(168).toFixed(2)} at 7 days (red where all agree, then fewer as the spread grows), 1.00 when the members are one (${fmax(same).toFixed(2)}), none far away (${cellOf(60, 30) === undefined ? 'off the grid' : cellOf(40, -20)})`,
      tm(0) >= 0.95 && tm(24) >= 0.85 && tm(72) < tm(24) && tm(168) < 0.6 && fmax(same) > 0.99 && D.nx > 20 && D.ny > 20 && D.dlon === D.dmy && (cellOf(40, -20) || 0) < 0.05); }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
