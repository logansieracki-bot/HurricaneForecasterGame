// What the simulated storms do at and after the extratropical transition, in the form of data/generated/atlantic-tc-et.json (tools/make_tc_et.py), for the lab's report,
// the validation and the calibration's targets. A storm record is what tools/storm_mc.mjs keeps of one: `trk` = [lat, lon, wind, hour, class, land, sst, shear] for every
// six-hourly fix, class 0 tropical, 1 subtropical, 2 post-tropical (extratropical), 3 remnant low, 4 disturbance.
const START_MS = Date.UTC(2026, 5, 1);
const q = (a, p) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y), i = (s.length - 1) * p, k = Math.floor(i); return s[k] + (s[Math.min(k + 1, s.length - 1)] - s[k]) * (i - k); };
const qs = (a) => [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => q(a, p));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const isTC = (t) => t[4] === 0 || t[4] === 1;
const BANDS = [[15, 20], [20, 25], [25, 30], [30, 35], [35, 40], [40, 50]];

export function etStats(named, nSeasons) {
  const ets = [], tails = [], rows = { EX: [], LO: [] }, final = { EX: 0, LO: 0, TC: 0 }, hiW = [], hiD = { mid: [], strong: [] }, land = { all: 0, n30: 0 }, byLat = {};
  for (const x of named) {
    const tr = x.trk.filter((t) => t[3] % 6 === 0);
    if (!tr.length) continue;
    const last = tr[tr.length - 1];
    final[last[4] === 2 ? 'EX' : last[4] === 3 ? 'LO' : 'TC']++;
    const byH = new Map(tr.map((t) => [t[3], t]));
    for (const t of tr) {
      if (t[4] === 2) rows.EX.push(t); else if (t[4] === 3) rows.LO.push(t);
      if (isTC(t)) { for (const [a, b] of BANDS) if (t[0] >= a && t[0] < b) (byLat[a + '-' + b] = byLat[a + '-' + b] || []).push(t[2] || 0); }
      if (isTC(t) && t[5] === 1 && t[0] >= 15) { land.all++; if (t[0] >= 30) land.n30++; }
      if (isTC(t) && t[0] >= 33) {                                             // the wind of a tropical row north of 33N, and its change over the next day (the next row tropical or post-tropical)
        hiW.push(t[2]); const n = byH.get(t[3] + 24);
        if (n && n[4] <= 2) { if (t[2] >= 80) hiD.strong.push(n[2] - t[2]); else if (t[2] >= 50) hiD.mid.push(n[2] - t[2]); }
      }
    }
    const i0 = tr.findIndex((t) => t[4] === 2);
    let p = -1; for (let k = (i0 < 0 ? tr.length : i0) - 1; k >= 0; k--) if (isTC(tr[k])) { p = k; break; }
    if (i0 > 0 && p >= 0) {
      const a = tr[i0], at = (dh) => tr.find((t) => t[3] === a[3] + dh), prev = tr[i0 - 1];
      const sp = prev && a[3] - prev[3] === 6 ? Math.hypot((a[1] - prev[1]) * 111.2 * Math.cos((a[0] + prev[0]) / 2 * Math.PI / 180), (a[0] - prev[0]) * 111.2) / 6 / 1.852 : NaN;
      ets.push({ lat: a[0], lon: a[1], v: a[2], vPrev: tr[p][2], month: new Date(START_MS + a[3] * 3600000).getUTCMonth() + 1, speed: sp, sst: a[6], shear: a[7], tail: last[3] - a[3], vLast: last[2], latLast: last[0],
        dv24: at(24) ? at(24)[2] - a[2] : NaN, dv48: at(48) ? at(48)[2] - a[2] : NaN, east: (last[1] - a[1]) * 111.2 * Math.cos((last[0] + a[0]) / 2 * Math.PI / 180), north: (last[0] - a[0]) * 111.2 });
    } else if (i0 < 0 && last[4] === 3) {
      let k = tr.length - 1; while (k > 0 && tr[k][4] === 3) k--;
      if (isTC(tr[k]) && k < tr.length - 1) tails.push({ tail: last[3] - tr[k][3], w: mean(tr.slice(k + 1).map((t) => t[2])) });
    }
  }
  const e = (f) => ets.map(f).filter(Number.isFinite), n = named.length, band = (r, a, b) => r.filter((t) => t[0] >= a && t[0] < b).length / nSeasons;
  const dv = (k) => { const a = e((t) => t[k]); return { n: a.length, q: qs(a), ge10: a.length ? a.filter((v) => v >= 10).length / a.length : NaN, leM10: a.length ? a.filter((v) => v <= -10).length / a.length : NaN }; };
  const ex = rows.EX.map((t) => t[2]), lo = rows.LO.map((t) => t[2]);
  const hur = ets.filter((t) => t.vPrev >= 64), ts = ets.filter((t) => t.vPrev >= 34 && t.vPrev < 64);
  return {
    named: n, et: ets.length, share: n ? ets.length / n : NaN, final: { EX: final.EX / n, LO: final.LO / n, TC: final.TC / n },
    lat: qs(e((t) => t.lat)), lon: qs(e((t) => t.lon)), wind: qs(e((t) => t.v)), speed: qs(e((t) => t.speed)), sst: qs(e((t) => t.sst)), shear: qs(e((t) => t.shear)),
    windHurricane: q(hur.map((t) => t.v), 0.5), windStorm: q(ts.map((t) => t.v), 0.5), hurricaneShare: ets.length ? hur.length / ets.length : NaN,
    month: Object.fromEntries([6, 7, 8, 9, 10, 11].map((m) => [m, ets.length ? ets.filter((t) => t.month === m).length / ets.length : NaN])),
    tail: qs(e((t) => t.tail)), vLast: qs(e((t) => t.vLast)), latLast: qs(e((t) => t.latLast)), east: qs(e((t) => t.east)), north: qs(e((t) => t.north)),
    endsNorth: Object.fromEntries([50, 55, 60].map((L) => [L, ets.length ? ets.filter((t) => t.latLast >= L).length / ets.length : NaN])), dv24: dv('dv24'), dv48: dv('dv48'),
    exRows: { perSeason: rows.EX.length / nSeasons, ge34: ex.length ? ex.filter((v) => v >= 34).length / ex.length : NaN, wind: qs(ex), lat: qs(rows.EX.map((t) => t[0])), byLat: [[0, 30], [30, 40], [40, 50], [50, 60], [60, 90]].map(([a, b]) => band(rows.EX, a, b)) },
    loRows: { perSeason: rows.LO.length / nSeasons, wind: qs(lo), lat: qs(rows.LO.map((t) => t[0])), byLat: [[0, 30], [30, 40], [40, 50], [50, 60], [60, 90]].map(([a, b]) => band(rows.LO, a, b)) },
    loTail: { n: tails.length, hours: qs(tails.map((t) => t.tail)), wind: mean(tails.map((t) => t.w)) },
    tcHi: { perSeason: hiW.length / nSeasons, wind: qs(hiW), dvMid: q(hiD.mid, 0.5), dvStrong: q(hiD.strong, 0.5) }, landRows: { all: land.all / nSeasons, n30: land.n30 / nSeasons },
    tcLat: Object.fromEntries(BANDS.map(([a, b]) => { const w = byLat[a + '-' + b] || []; return [a + '-' + b, { rows: w.length / nSeasons, q50: q(w, 0.5), q90: q(w, 0.9), ge96: w.length ? w.filter((v) => v >= 96).length / w.length : NaN }]; })),
  };
}

/* the real numbers in the same shape (data/generated/atlantic-tc-et.json) */
export function etReal(R) {
  const f = R.first_ex_row, a = R.after, ex = R.rows_per_season.EX, lo = R.rows_per_season.LO;
  return {
    share: R.share_of_named, final: R.final_status_share, lat: f.lat_q, lon: f.lon_q, wind: f.wind_q, speed: f.speed_q, sst: f.sst_q, shear: f.shear_monthly_q,
    windHurricane: f.wind_by_last_tc_class.hurricane[2], windStorm: f.wind_by_last_tc_class.storm[2], hurricaneShare: f.share_by_last_tc_class.hurricane, month: f.month_share,
    tail: a.tail_hours_q, vLast: a.last_wind_q, latLast: a.last_lat_q, east: a.east_km_q, north: a.north_km_q, endsNorth: a.ends_north_of,
    dv24: { q: a.dv_kt.dv24.q, ge10: a.dv_kt.dv24.share_ge10, leM10: a.dv_kt.dv24.share_le_m10 }, dv48: { q: a.dv_kt.dv48.q, ge10: a.dv_kt.dv48.share_ge10, leM10: a.dv_kt.dv48.share_le_m10 },
    exRows: { perSeason: ex.rows, ge34: ex.share_ge34, wind: ex.wind_q, lat: ex.lat_q, byLat: Object.values(ex.by_lat) }, loRows: { perSeason: lo.rows, wind: lo.wind_q, lat: lo.lat_q, byLat: Object.values(lo.by_lat) },
    loTail: { hours: R.remnant_low.tail_hours_q, wind: R.remnant_low.tail_wind_mean },
    tcHi: { perSeason: R.tc_rows_north_of_33N.per_season, wind: R.tc_rows_north_of_33N.wind_q, dvMid: R.tc_wind_change_24h_north_of_33N['50-79 kt'].q[2], dvStrong: R.tc_wind_change_24h_north_of_33N['80+ kt'].q[2] },
    landRows: { all: R.tc_rows_over_land.per_season, n30: R.tc_rows_over_land.north_of_30N },
    tcLat: Object.fromEntries(Object.entries(R.tc_wind_by_lat).map(([k, v]) => [k, { rows: v.rows_per_season, q50: v.wind_q50, q90: v.wind_q90, ge96: v.share_ge96 }])),
  };
}

const f1 = (x, n = 0) => (Number.isFinite(x) ? x.toFixed(n) : '-');
const fq = (a, n = 0) => (a ? a.map((x) => f1(x, n)).join('/') : '-');
export function etLines(sims, real) {                       // sims: {name: etStats}; one line per statistic, the real value last
  const names = Object.keys(sims), L = [];
  const row = (label, f, r) => L.push('  ' + label.padEnd(44) + names.map((k) => f(sims[k]).padStart(16)).join('') + '   | ' + r);
  L.push('extratropical transition (named storms)'.padEnd(46) + names.map((n) => n.slice(0, 15).padStart(16)).join('') + '   | real 1991-2020');
  row('share with a post-tropical row', (s) => f1(s.share, 2), f1(real.share, 2));
  row('final status EX / LO / TC', (s) => [s.final.EX, s.final.LO, s.final.TC].map((x) => f1(x, 2)).join('/'), [real.final.EX, real.final.LO, real.final.TC].map((x) => f1(x, 2)).join('/'));
  row('latitude q10/25/50/75/90', (s) => fq(s.lat), fq(real.lat));
  row('longitude q10/25/50/75/90', (s) => fq(s.lon), fq(real.lon));
  row('wind at the first EX row q10/25/50/75/90', (s) => fq(s.wind), fq(real.wind));
  row('  median wind: hurricanes / storms; hurricane share', (s) => `${f1(s.windHurricane)}/${f1(s.windStorm)}; ${f1(s.hurricaneShare, 2)}`, `${f1(real.windHurricane)}/${f1(real.windStorm)}; ${f1(real.hurricaneShare, 2)}`);
  row('speed at the first EX row (kt)', (s) => fq(s.speed), fq(real.speed));
  row('sea temperature at the transition (C)', (s) => fq(s.sst), fq(real.sst));
  row('shear at the transition (kt)', (s) => fq(s.shear), fq(real.shear) + ' (monthly ERA5)');
  row('month share Jun..Nov', (s) => [6, 7, 8, 9, 10, 11].map((m) => f1(100 * s.month[m])).join(' '), [6, 7, 8, 9, 10, 11].map((m) => f1(100 * real.month[m])).join(' '));
  row('track length after it (h) q10..q90', (s) => fq(s.tail), fq(real.tail));
  row('wind at the last row q10..q90', (s) => fq(s.vLast), fq(real.vLast));
  row('latitude of the last row q10..q90', (s) => fq(s.latLast), fq(real.latLast));
  row('tracks ending north of 50 / 55 / 60N', (s) => [50, 55, 60].map((L) => f1(s.endsNorth[L], 2)).join('/'), [50, 55, 60].map((L) => f1(real.endsNorth[L], 2)).join('/'));
  row('displacement after it: east / north (km, q50)', (s) => `${f1(s.east[2])}/${f1(s.north[2])}`, `${f1(real.east[2])}/${f1(real.north[2])}`);
  row('wind change in 24 h q10..q90; share +10 / -10', (s) => `${fq(s.dv24.q)}; ${f1(s.dv24.ge10, 2)}/${f1(s.dv24.leM10, 2)}`, `${fq(real.dv24.q)}; ${f1(real.dv24.ge10, 2)}/${f1(real.dv24.leM10, 2)}`);
  row('wind change in 48 h q10..q90; share +10 / -10', (s) => `${fq(s.dv48.q)}; ${f1(s.dv48.ge10, 2)}/${f1(s.dv48.leM10, 2)}`, `${fq(real.dv48.q)}; ${f1(real.dv48.ge10, 2)}/${f1(real.dv48.leM10, 2)}`);
  row('EX rows a season; share >= 34 kt', (s) => `${f1(s.exRows.perSeason, 1)}; ${f1(s.exRows.ge34, 2)}`, `${f1(real.exRows.perSeason, 1)}; ${f1(real.exRows.ge34, 2)}`);
  row('EX rows by band <30 30-40 40-50 50-60 60+', (s) => s.exRows.byLat.map((x) => f1(x, 1)).join(' '), real.exRows.byLat.map((x) => f1(x, 1)).join(' '));
  row('EX row wind / latitude q10..q90', (s) => `${fq(s.exRows.wind)} / ${fq(s.exRows.lat)}`, `${fq(real.exRows.wind)} / ${fq(real.exRows.lat)}`);
  row('LO rows a season; wind q10..q90', (s) => `${f1(s.loRows.perSeason, 1)}; ${fq(s.loRows.wind)}`, `${f1(real.loRows.perSeason, 1)}; ${fq(real.loRows.wind)}`);
  row('LO rows by band', (s) => s.loRows.byLat.map((x) => f1(x, 1)).join(' '), real.loRows.byLat.map((x) => f1(x, 1)).join(' '));
  row('tropical rows north of 33N a season; wind q10..q90', (s) => `${f1(s.tcHi.perSeason, 1)}; ${fq(s.tcHi.wind)}`, `${f1(real.tcHi.perSeason, 1)}; ${fq(real.tcHi.wind)}`);
  row('  their 24-h change: 50-79 kt / 80+ kt, median', (s) => `${f1(s.tcHi.dvMid)}/${f1(s.tcHi.dvStrong)}`, `${f1(real.tcHi.dvMid)}/${f1(real.tcHi.dvStrong)}`);
  row('tropical rows over land a season: all / north of 30N', (s) => `${f1(s.landRows.all, 1)}/${f1(s.landRows.n30, 1)}`, `${f1(real.landRows.all, 1)}/${f1(real.landRows.n30, 1)}`);
  row('tropical rows 25-30 / 30-35 / 35-40 / 40-50N: share >= 96 kt', (s) => ['25-30', '30-35', '35-40', '40-50'].map((k) => f1(s.tcLat[k].ge96, 2)).join(' / '), ['25-30', '30-35', '35-40', '40-50'].map((k) => f1(real.tcLat[k].ge96, 2)).join(' / '));
  row('  and their median wind', (s) => ['25-30', '30-35', '35-40', '40-50'].map((k) => f1(s.tcLat[k].q50)).join(' / '), ['25-30', '30-35', '35-40', '40-50'].map((k) => f1(real.tcLat[k].q50)).join(' / '));
  row('remnant-low tail (h) q10..q90; mean wind', (s) => `${fq(s.loTail.hours)}; ${f1(s.loTail.wind)}`, `${fq(real.loTail.hours)}; ${f1(real.loTail.wind)}`);
  return L;
}
