// What a storm-scale cloud model costs in plain JS on this machine: the numbers behind the CPU budgets in docs/severe-plan.md.
// Usage: node tools/severe_research/cpu_bench.mjs [nx ny nz]      (default 160 160 55: a 500 m grid over 80 km, 1.41 M cells)
// Measures (one thread, Float32Array): one 5th-order flux-form advection stage of one scalar in all three directions, and a dense
// Kessler-like warm-rain kernel (saturation, autoconversion, accretion, evaporation: pow/exp dominate). A model step is then
// estimated as 3 Runge-Kutta stages x (advected fields) + (microphysics passes); acoustic substeps and turbulence are NOT in it.
const nx = +process.argv[2] || 160, ny = +process.argv[3] || 160, nz = +process.argv[4] || 55, N = nx * ny * nz;
const sy = nx, sz = nx * ny;
const q = new Float32Array(N), q2 = new Float32Array(N), u = new Float32Array(N), v = new Float32Array(N), w = new Float32Array(N);
for (let k = 0; k < N; k++) { q[k] = Math.sin(k * 0.001) + 1; u[k] = 10 + 5 * Math.sin(k * 0.0007); v[k] = 3 * Math.cos(k * 0.0011); w[k] = 2 * Math.sin(k * 0.0003); }
const dt = 3, dx = 500, dz = 300, cx = dt / dx, cy = dt / dx, cz = dt / dz;
function f5(a, b, c, d, e, f, vel) {                          // 5th-order upwind-biased value of the face between c and d (q[i-3..i+2]) times the face velocity
  const p = (37 * (c + d) - 8 * (b + e) + (a + f)) / 60, dis = ((f - a) - 5 * (e - b) + 10 * (d - c)) / 60;
  return vel * (p - (vel > 0 ? 1 : -1) * dis);
}
function advect(src, dst) {
  for (let k = 3; k < nz - 3; k++) for (let j = 3; j < ny - 3; j++) { let o = k * sz + j * sy + 3;
    for (let i = 3; i < nx - 3; i++, o++) {
      const fxm = f5(src[o - 3], src[o - 2], src[o - 1], src[o], src[o + 1], src[o + 2], u[o]), fxp = f5(src[o - 2], src[o - 1], src[o], src[o + 1], src[o + 2], src[o + 3], u[o + 1]);
      const fym = f5(src[o - 3 * sy], src[o - 2 * sy], src[o - sy], src[o], src[o + sy], src[o + 2 * sy], v[o]), fyp = f5(src[o - 2 * sy], src[o - sy], src[o], src[o + sy], src[o + 2 * sy], src[o + 3 * sy], v[o + sy]);
      const fzm = f5(src[o - 3 * sz], src[o - 2 * sz], src[o - sz], src[o], src[o + sz], src[o + 2 * sz], w[o]), fzp = f5(src[o - 2 * sz], src[o - sz], src[o], src[o + sz], src[o + 2 * sz], src[o + 3 * sz], w[o + sz]);
      dst[o] = src[o] - cx * (fxp - fxm) - cy * (fyp - fym) - cz * (fzp - fzm);
    } }
}
const qv = new Float32Array(N).fill(0.012), qc = new Float32Array(N).fill(0.0005), qr = new Float32Array(N).fill(0.0002), th = new Float32Array(N).fill(300), pr = new Float32Array(N).fill(90000);
function kessler() {
  for (let k = 0; k < N; k++) {
    const T = th[k] * Math.pow(pr[k] / 100000, 0.2857), es = 611.2 * Math.exp(17.67 * (T - 273.15) / (T - 29.65)), qs = 0.622 * es / (pr[k] - es);
    const auto = Math.max(0, 0.001 * (qc[k] - 0.001)), accr = 2.2 * qc[k] * Math.pow(qr[k], 0.875), evap = qv[k] < qs ? 0.0001 * (qs - qv[k]) * Math.pow(qr[k] + 1e-9, 0.525) : 0;
    const cond = (qv[k] - qs) * 0.5; qc[k] = Math.max(0, qc[k] + cond - auto - accr); qr[k] = Math.max(0, qr[k] + auto + accr - evap); qv[k] = Math.max(0, qv[k] - cond + evap);
    th[k] += 2.5e6 / 1004 * cond * (100000 / pr[k]) ** 0.2857 * 1e-3;
  }
}
const time = (f, n) => { f(); const t0 = performance.now(); for (let i = 0; i < n; i++) f(); return (performance.now() - t0) / n; };
const adv = time(() => { advect(q, q2); advect(q2, q); }, 3) / 2, kes = time(kessler, 3);
console.log(`grid ${nx}x${ny}x${nz} = ${(N / 1e6).toFixed(2)} M cells`);
console.log(`one scalar, 5th-order 3-D advection, one stage: ${adv.toFixed(1)} ms  (${(N / adv / 1000).toFixed(1)} M cell-updates/s)`);
console.log(`Kessler-like warm-rain kernel, one dense pass: ${kes.toFixed(1)} ms  (${(N / kes / 1000).toFixed(1)} M cells/s)`);
for (const [name, nf, mp] of [['warm rain (3 water species)', 12, 1], ['single-moment ice (6 species)', 15, 4], ['two-moment ice (12 fields)', 21, 12]]) console.log(`  est. step, ${name}: ${(3 * nf * adv + mp * kes).toFixed(0)} ms (without acoustic substeps and turbulence)`);
