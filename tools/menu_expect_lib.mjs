// What the main menu's Expected section and its calibration (tools/make_menu_expect.mjs) share: the forms a model can take, the inputs they are made of, the quasi-Poisson regression that fits them, and the
// prediction the menu makes from a basin's entry of data/generated/menu-expect.json (the menu has its own copy of that prediction, src/menu.html: tests/expect.mjs holds the two to each other).
// The inputs: w warmth/2, s shear/10, m moisture/10, a the log of the activity, d 1 when an El Nino or La Nina was chosen, e the chosen state times its influence over 2 (0 when it is left random), dre the same
// when it is left to drift. The menu reads the list of names of a basin's model from the file and builds the same numbers (src/menu.html, expFeatures).
export const SPECS = {
  flat: ['1', 'a'],          // (a basin the settings hardly move, as the Mediterranean: only the activity counts)
  lin: ['1', 'w', 's', 'm', 'a', 'd', 'e', 'dre'],
  quad: ['1', 'w', 's', 'm', 'a', 'w2', 's2', 'm2', 'd', 'e', 'e2', 'dre'],
  cubic: ['1', 'w', 's', 'm', 'a', 'w2', 's2', 'm2', 'w3', 's3', 'm3', 'd', 'e', 'e2', 'dre'],
  cross: ['1', 'w', 's', 'm', 'a', 'w2', 's2', 'm2', 'w3', 's3', 'm3', 'ws', 'wm', 'sm', 'd', 'e', 'e2', 'dre'],
  rare: ['1', 'w', 's', 'm', 'a', 'w2', 's2', 'm2', 'w3', 'm3'],          // (a basin that makes a named storm a year or less: too few seasons with anything in them to say what an El Nino does to it, and a steep rise with warmth and moisture; its intercept is fixed at what the normal seasons made)
};
export function inputs(r) {
  const w = r.W / 2, s = r.S / 10, m = r.M / 10, a = Math.log(Math.max(r.A, 0.3)), d = r.mode === 'random' ? 0 : 1, e = d * (r.E * (r.I == null ? 1 : r.I)) / 2, dr = r.mode === 'drift' ? 1 : 0;
  return { '1': 1, w, s, m, a, w2: w * w, s2: s * s, m2: m * m, w3: w * w * w, s3: s * s * s, m3: m * m * m, ws: w * s, wm: w * m, sm: s * m, d, e, e2: e * e, dre: dr * e };
}
export const featuresOf = (r, spec) => { const v = inputs(r); return spec.map((k) => v[k]); };
function solve(A, b) {                                                       // Gaussian elimination with partial pivoting
  const n = b.length, M = A.map((row, i) => row.concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; const piv = M[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / piv; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / (M[r][r] || 1e-12); }
  return x;
}
export function glm(X, y, ridge, offset) {                                                  // quasi-Poisson, log link, by iteratively reweighted least squares with step halving (the intercept is not shrunk); offset: what is added to the linear predictor before it is exponentiated, one number for each season
  const n = X.length, p = X[0].length, off = offset || new Array(n).fill(0), mean = y.reduce((t, v) => t + v, 0) / n; let beta = new Array(p).fill(0); if (!offset) beta[0] = Math.log(Math.max(mean, 1e-3));
  const etaOf = (b) => X.map((x, i) => Math.max(-12, Math.min(12, x.reduce((t, v, j) => t + v * b[j], 0) + off[i]))), devOf = (b) => { const e = etaOf(b); return 2 * y.reduce((t, v, i) => { const m = Math.exp(e[i]); return t + (v > 0 ? v * Math.log(v / m) : 0) - (v - m); }, 0); };
  let d0 = devOf(beta);
  for (let it = 0; it < 100; it++) {
    const eta = etaOf(beta), mu = eta.map(Math.exp);
    const A = Array.from({ length: p }, () => new Array(p).fill(0)), b = new Array(p).fill(0);
    for (let i = 0; i < n; i++) { const w = mu[i], z = eta[i] - off[i] + (y[i] - mu[i]) / Math.max(mu[i], 1e-9); for (let j = 0; j < p; j++) { b[j] += w * X[i][j] * z; for (let k = 0; k < p; k++) A[j][k] += w * X[i][j] * X[i][k]; } }
    for (let j = offset ? 0 : 1; j < p; j++) A[j][j] += ridge;
    const full = solve(A, b); let t = 1, nb = full, d1 = devOf(nb);
    while (!(d1 <= d0 + 1e-9) && t > 1e-4) { t /= 2; nb = beta.map((v, j) => v + t * (full[j] - v)); d1 = devOf(nb); }          // (a step that makes the fit worse is halved until it does not)
    const diff = Math.max(...nb.map((v, j) => Math.abs(v - beta[j]))); beta = nb; d0 = d1; if (diff < 1e-7) break;
  }
  const mu = etaOf(beta).map(Math.exp);
  const pearson = y.reduce((t, v, i) => t + (v - mu[i]) ** 2 / Math.max(mu[i], 1e-6), 0), phi = Math.max(1, pearson / Math.max(1, n - p));
  return { beta, phi, mu };
}
export const dev = (y, mu) => 2 * y.reduce((t, v, i) => t + (v > 0 ? v * Math.log(v / mu[i]) : 0) - (v - mu[i]), 0);


/* the menu's prediction: the mean of each count for a basin's entry and a set of settings { W, S, M, A, E, I, mode } (A under 0.3 scales the count down in proportion: the seasons played start there) */
export function predict(entry, q) {
  const v = inputs(Object.assign({ I: 1 }, q)), f = q.A < 0.3 ? q.A / 0.3 : 1, out = {};
  const e = Math.max(-3, Math.min(3.2, v.e)); v.e = e; v.e2 = e * e; v.dre = q.mode === 'drift' ? e : 0;                    // (El Nino times its influence up to about 6: the seasons played do not go further)
  for (const m of ['named', 'hurr', 'major', 'ace']) out[m] = f * Math.exp(entry.spec.reduce((t, k, j) => t + entry.coef[m][j] * v[k], 0));
  out.hurr = Math.min(out.hurr, out.named); out.major = Math.min(out.major, out.hurr);
  return out;
}

/* the variance round a mean: v = [a, b] says a * mean + b * mean squared (a count is a Poisson count, whose variance is its mean, with a share of overdispersion that grows with the square of the mean; the energy has a variance that is
   mostly that square). The 10th and 90th percentile of a count with it (a negative binomial) and of the accumulated cyclone energy (a log-normal) are what the menu prints under each number. */
export const varianceOf = (mu, v) => Math.max(1.01 * mu, v[0] * mu + v[1] * mu * mu);
const erf = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));                                                 // the normal distribution function
/* kz widens (above 1) or narrows the range: 1 is the 10th to the 90th percentile of the distribution the variance describes, and the fit measures what share of the seasons played the range holds and scales it to 8 in 10 */
export function countRange(mu, v, kz = 1) {
  if (mu < 0.02) return [0, 0];
  const r = mu * mu / (varianceOf(mu, v) - mu), pl = Phi(-1.2816 * kz), ph = Phi(1.2816 * kz); let p = Math.pow(r / (r + mu), r), c = p, lo = c >= pl ? 0 : -1, hi = -1;
  for (let k = 0; k < 400; k++) { if (lo < 0 && c >= pl) lo = k; if (c >= ph) { hi = k; break; } p *= (k + r) / (k + 1) * mu / (r + mu); c += p; }
  return [Math.max(lo, 0), hi < 0 ? Math.ceil(mu * 2 + 5) : hi];
}
export function aceRange(mu, v, kz = 1) {
  if (mu < 0.5) return [0, Math.round(mu * 3)];
  const s2 = Math.log(1 + Math.max(mu * mu * 0.01, v[0] * mu + v[1] * mu * mu) / (mu * mu)), s = Math.sqrt(s2), z = 1.2816 * kz;
  return [Math.round(mu * Math.exp(-z * s - s2 / 2)), Math.round(mu * Math.exp(z * s - s2 / 2))];
}
/* the variance function of a fit: least squares of the squared residuals on the mean and its square, each over the size of the variance they would have (so the many small seasons and the few big ones count alike) */
export function fitVariance(y, mu) {
  let sxx = 0, sxy = 0, syy = 0, sx1 = 0, sx2 = 0, n = y.length; const rows = [];
  for (let i = 0; i < n; i++) { const m = Math.max(mu[i], 1e-3), d = m + m * m, x1 = m / d, x2 = m * m / d, r2 = (y[i] - mu[i]) ** 2 / d; rows.push([x1, x2, r2]); sxx += x1 * x1; sxy += x1 * x2; syy += x2 * x2; sx1 += x1 * r2; sx2 += x2 * r2; }
  const det = sxx * syy - sxy * sxy; let a = det > 1e-12 ? (sx1 * syy - sx2 * sxy) / det : 1, b = det > 1e-12 ? (sx2 * sxx - sx1 * sxy) / det : 0;
  if (a < 0) { a = 0; b = Math.max(0, sx2 / Math.max(syy, 1e-12)); } if (b < 0) { b = 0; a = Math.max(0, sx1 / Math.max(sxx, 1e-12)); }
  return [+a.toFixed(3), +b.toFixed(4)];
}
