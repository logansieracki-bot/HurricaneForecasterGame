// The Weisman-Klemp (1982) supercell environment and its warm bubble, as in WRF's test/em_quarter_ss (tools/severe_research/wk82_sounding.txt):
// loadSounding() returns piecewise-linear theta(z) (K), qv(z) (kg/kg), u(z), v(z) (m/s, the winds already shifted so that the storm stays in the box);
// bubble(x, y, z, xc, yc) is the +3 K cosine-squared warm bubble (10 km wide, 1.5 km deep, centred at 1.5 km).
import { readFileSync } from 'node:fs';

export function loadSounding(path = new URL('./wk82_sounding.txt', import.meta.url)) {
  const rows = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  const first = rows[0].trim().split(/\s+/).map(Number);                       // surface pressure (hPa), theta (K), qv (g/kg)
  const z = [0], th = [first[1]], qv = [first[2] / 1000], u = [0], v = [0];
  for (const r of rows.slice(1)) { const a = r.trim().split(/\s+/).map(Number); z.push(a[0]); th.push(a[1]); qv.push(a[2] / 1000); u.push(a[3]); v.push(a[4]); }
  u[0] = u[1]; v[0] = v[1];
  const lin = (arr) => (zz) => {
    if (zz <= z[0]) return arr[0];
    if (zz >= z[z.length - 1]) return arr[arr.length - 1];
    let lo = 0, hi = z.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (z[m] <= zz) lo = m; else hi = m; }
    return arr[lo] + (arr[hi] - arr[lo]) * (zz - z[lo]) / (z[hi] - z[lo]);
  };
  return { theta: lin(th), qv: lin(qv), u: lin(u), v: lin(v), zmax: z[z.length - 1] };
}

export function bubble(x, y, z, xc, yc, delt = 3) {
  const r = Math.sqrt(((x - xc) / 10000) ** 2 + ((y - yc) / 10000) ** 2 + ((z - 1500) / 1500) ** 2);
  return r < 1 ? delt * Math.cos(0.5 * Math.PI * r) ** 2 : 0;
}
