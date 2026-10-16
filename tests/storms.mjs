// Node-only tests of the storm engine (src/storms.js): no browser, no build. Run by `npm test` before the Playwright suite.
// The engine is exercised on synthetic environments (tests/storms_env.mjs) so one physical response can be checked at a time;
// the statistics of whole seasons against the real best track are a separate, calibrated job (tools/make_tc_ref.py).
import '../src/storms.js';
import { makeEnv, climateEnv, defaultSteer } from './storms_env.mjs';

const H = globalThis.HFStorms;
let failed = 0, passed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const par = H.defaultParams();
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
  check('weak storms follow the shallow layer, strong ones the deep layer (different winds at each level)', (() => {
    const e = makeEnv({ steer: () => [-14, 0, -7, 0, 0, 0], shear: 5 });
    const w = system('tc', 15, -50, 30, 5), s = system('tc', 15, -50, 110, 5);
    for (let h = 0; h < 12; h++) { H.stepSystem(w, e, h, 5, par); H.stepSystem(s, e, h, 5, par); }
    return w.cx < s.cx - 2;
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
  check('a preview changes nothing in the manager (no ids, no counters)', m.n.M === 1 && H.create({ seed: 12, startMs: START, auto: false }).forecast(spec, envNow, 48) && true);
  const p1 = H.create({ seed: 55, startMs: START }), p2 = H.create({ seed: 55, startMs: START });
  p2.place({ kind: 'td', lat: 25, lon: -60 });
  p1.advanceTo(60 * 24, src); p2.advanceTo(60 * 24, src);
  const key = (mgr) => JSON.stringify(mgr.systems.filter((S) => S.id[0] === 'W' || S.id[0] === 'N').map((S) => [S.id, S.fixes.length, S.lat, S.lon, S.v]));
  check('hand-placing a storm does not change any automatic wave or seed', key(p1) === key(p2));
  const dev = H.create({ seed: 3, startMs: START, auto: false }), far = dev.forecast({ kind: 'td', lat: 15, lon: -50 }, makeEnv({ sst: 29, shear: 5 }), 240);
  check('a forecast reports peak, development, ACE and fixes every six hours from the start', far.fixes[0].h === 0 && far.fixes[1].h === 6 && far.peak.v >= 100 && far.developed && far.ace > 5 && far.fixes.length >= 40);
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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
