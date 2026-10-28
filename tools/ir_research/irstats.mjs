// The numbers of an infrared picture, measured the same way on a real GOES frame, a lab render, the page's floater and in the tests (docs/ir-research.md, part 4).
//   stats(tb, n, res): tb a square field of n x n brightness temperatures (C), res the km of a pixel; the central 500 km is measured
// What each number is for: the cold areas and the overshooting tops (the cores), the speckle index and the small objects (the dots), the edge sharpness (the rims),
// the texture by temperature class (the glassy tops), the thin cirrus' roughness (the fibres), the largest cold mass (one continuous mass or scattered cells).
export const WIN = 500;

export function centre(tb, n, res, win = WIN) {                                  // the central win km, as a square field of m x m (NaN becomes warm)
  const m = Math.min(n, Math.round(win / res)), o = Math.floor((n - m) / 2), t = new Float32Array(m * m);
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) { const v = tb[(j + o) * n + i + o]; t[j * m + i] = v === v ? v : 30; }
  return { t, m };
}
function components(mask, m) {                                                   // 4-connected components of a boolean field: their labels and sizes (pixels)
  const lab = new Int32Array(m * m), sizes = [0], st = new Int32Array(m * m); let cur = 0;
  for (let s = 0; s < m * m; s++) {
    if (!mask[s] || lab[s]) continue;
    cur++; let sp = 0, c = 0; st[sp++] = s; lab[s] = cur;
    while (sp) {
      const k = st[--sp]; c++; const x = k % m, y = (k - x) / m;
      if (x > 0 && mask[k - 1] && !lab[k - 1]) { lab[k - 1] = cur; st[sp++] = k - 1; }
      if (x < m - 1 && mask[k + 1] && !lab[k + 1]) { lab[k + 1] = cur; st[sp++] = k + 1; }
      if (y > 0 && mask[k - m] && !lab[k - m]) { lab[k - m] = cur; st[sp++] = k - m; }
      if (y < m - 1 && mask[k + m] && !lab[k + m]) { lab[k + m] = cur; st[sp++] = k + m; }
    }
    sizes.push(c);
  }
  return { lab, sizes };
}
const median = (a) => { if (!a.length) return null; const b = Array.from(a).sort((x, y) => x - y); return b[b.length >> 1]; };
const robust = (a) => { if (a.length < 300) return null; const md = median(a), dv = a.map((x) => Math.abs(x - md)); return 1.4826 * median(dv); };

export function stats(tb, n, res) {
  const { t, m } = centre(tb, n, res), cell = res * res, K = 1e-3 * cell;      // K: pixels to thousand km2
  const out = { m, res };
  let tmin = 1e9; const cnt = { 60: 0, 65: 0, 70: 0, 75: 0, 80: 0, 85: 0, 20: 0, 40: 0 };
  for (let k = 0; k < m * m; k++) { const v = t[k]; if (v < tmin) tmin = v; if (v < -20) cnt[20]++; if (v < -40) cnt[40]++; if (v < -60) cnt[60]++; if (v < -65) cnt[65]++; if (v < -70) cnt[70]++; if (v < -75) cnt[75]++; if (v < -80) cnt[80]++; if (v < -85) cnt[85]++; }
  out.tmin = tmin; for (const q of [20, 40, 60, 65, 70, 75, 80, 85]) out['A' + q] = cnt[q] * K;
  // the overshooting tops: the cells colder than -80 C (pink): how many, how big
  { const mk = new Uint8Array(m * m); for (let k = 0; k < m * m; k++) mk[k] = t[k] < -80 ? 1 : 0; const { sizes } = components(mk, m); const a = sizes.slice(1).map((s) => s * cell); out.otN = a.length; out.otMed = median(a); out.otMax = a.length ? Math.max(...a) : 0; }
  // the dots: the cloud-edge pixels that differ from their neighbours' mean by more than 5 C; the objects colder than -20 C that are smaller than 100 km2
  { let e = 0, s = 0; for (let j = 1; j < m - 1; j++) for (let i = 1; i < m - 1; i++) { const k = j * m + i, v = t[k]; if (v > -10 || v < -45) continue; e++; const nb = (t[k - 1] + t[k + 1] + t[k - m] + t[k + m] + t[k - m - 1] + t[k - m + 1] + t[k + m - 1] + t[k + m + 1]) / 8; if (Math.abs(v - nb) > 5) s++; }
    out.speckle = e > 100 ? s / e : null;
    const mk = new Uint8Array(m * m); for (let k = 0; k < m * m; k++) mk[k] = t[k] < -20 ? 1 : 0; const { sizes } = components(mk, m); let sm = 0, all = 0, ns = 0; for (let q = 1; q < sizes.length; q++) { const a = sizes[q] * cell; all += a; if (a < 100) { sm += a; ns++; } }
    out.smallN = ns; out.smallShare = all > 0 ? sm / all : null; out.objN = sizes.length - 1; }
  // the rims: the temperature gradient (C per km) across the -20 C edge, the median of the pixels within 1.5 C of it
  { const g = []; for (let j = 1; j < m - 1; j++) for (let i = 1; i < m - 1; i++) { const k = j * m + i; if (Math.abs(t[k] + 20) < 1.5) g.push(Math.hypot(t[k + 1] - t[k - 1], t[k + m] - t[k - m]) / (2 * res)); } out.edgeGrad = g.length > 100 ? median(g) : null; }
  // the texture of the cold tops by class: the robust spread of a pixel's departure from the 5 x 5 mean, where that mean is -50 to -60, -60 to -70, or colder than -70 C
  { const cls = [[], [], []];
    for (let j = 2; j < m - 2; j++) for (let i = 2; i < m - 2; i++) { let s = 0; for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) s += t[(j + b) * m + i + a]; s /= 25; if (s > -50) continue; cls[s > -60 ? 0 : s > -70 ? 1 : 2].push(t[j * m + i] - s); }
    out.tex50 = robust(cls[0]); out.tex60 = robust(cls[1]); out.tex70 = robust(cls[2]); out.n70 = cls[2].length; }
  // the thin cirrus: how rough it is where it is thin (-30 to -5 C, the whole 3 x 3 neighbourhood too): the spread of a pixel from its neighbours' mean
  { const d = []; for (let j = 1; j < m - 1; j++) for (let i = 1; i < m - 1; i++) { const k = j * m + i; let ok = true, s = 0; for (let b = -1; b <= 1 && ok; b++) for (let a = -1; a <= 1; a++) { const v = t[k + b * m + a]; if (v > -5 || v < -30) { ok = false; break; } if (a || b) s += v; } if (ok) d.push(t[k] - s / 8); }
    out.cirrusRough = d.length > 300 ? robust(d) : null; out.cirrusN = d.length; }
  // one continuous mass or scattered cells: the share of the area colder than -40 C that the largest connected mass holds
  { const mk = new Uint8Array(m * m); for (let k = 0; k < m * m; k++) mk[k] = t[k] < -40 ? 1 : 0; const { sizes } = components(mk, m); let all = 0, big = 0; for (let q = 1; q < sizes.length; q++) { all += sizes[q]; if (sizes[q] > big) big = sizes[q]; } out.largest = all > 0 ? big / all : null; }
  return out;
}

export const METRICS = ['A20', 'A40', 'A60', 'A65', 'A70', 'A75', 'A80', 'A85', 'tmin', 'otN', 'otMed', 'otMax', 'speckle', 'smallN', 'smallShare', 'objN', 'edgeGrad', 'tex50', 'tex60', 'tex70', 'cirrusRough', 'largest'];
export function summarize(list) {                                                // per metric: how many frames, the median, the 10th and 90th percentile
  const o = {};
  for (const k of METRICS) {
    const v = list.map((s) => s[k]).filter((x) => x != null && x === x).sort((a, b) => a - b); if (!v.length) { o[k] = null; continue; }
    const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
    o[k] = { n: v.length, med: +q(0.5).toFixed(3), p10: +q(0.1).toFixed(3), p90: +q(0.9).toFixed(3) };
  }
  return o;
}
