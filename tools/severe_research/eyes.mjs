// The weak-echo eye of one level of a reflectivity grid (tools/severe_research/hook_eye.mjs reads packs with it; tests/severe_hookeye.mjs holds it to grids drawn by hand).

/* the enclosed weak-echo regions of one level: cells under T (4-connected) that cannot be reached from the edge of the box through cells under T */
export function eyes(dbz, nx, ny, k, T, MIN) {
  const low = new Uint8Array(nx * ny), seen = new Uint8Array(nx * ny); let echo = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const d = dbz[(k * ny + j) * nx + i]; low[j * nx + i] = d < T ? 1 : 0; if (d >= T) echo++; }
  const stack = [];
  const push = (i, j) => { const q = j * nx + i; if (low[q] && !seen[q]) { seen[q] = 1; stack.push(q); } };
  for (let i = 0; i < nx; i++) { push(i, 0); push(i, ny - 1); } for (let j = 0; j < ny; j++) { push(0, j); push(nx - 1, j); }
  const flood = () => { while (stack.length) { const q = stack.pop(), i = q % nx, j = (q - i) / nx; if (i > 0) push(i - 1, j); if (i < nx - 1) push(i + 1, j); if (j > 0) push(i, j - 1); if (j < ny - 1) push(i, j + 1); } };
  flood();                                                                                    // everything that touches the edge is the outside
  const out = [];
  for (let q0 = 0; q0 < nx * ny; q0++) {
    if (!low[q0] || seen[q0]) continue;
    let n = 0, sx = 0, sy = 0; seen[q0] = 1; stack.push(q0);
    while (stack.length) { const q = stack.pop(), i = q % nx, j = (q - i) / nx; n++; sx += i + 0.5; sy += j + 0.5; if (i > 0) push(i - 1, j); if (i < nx - 1) push(i + 1, j); if (j > 0) push(i, j - 1); if (j < ny - 1) push(i, j + 1); }
    if (n >= MIN) out.push({ cells: n, x: sx / n, y: sy / n });
  }
  out.sort((a, b) => b.cells - a.cells);
  return { eyes: out, echo };
}
