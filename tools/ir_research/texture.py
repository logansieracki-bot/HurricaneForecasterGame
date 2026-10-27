import sys, glob, numpy as np, json
def box(a, k):
    p = k // 2; ap = np.pad(a, p, mode='edge'); n = a.shape[0]; s = np.zeros_like(a, dtype=np.float64)
    for i in range(k):
        for j in range(k): s += ap[i:i + a.shape[0], j:j + a.shape[1]]
    return s / (k * k)
def texture(tb, th=-50.0, k=5):
    t = np.where(np.isfinite(tb), tb, 30.0).astype(np.float64); m = box(t, k); hp = t - m; sel = (m < th)
    if sel.sum() < 400: return None
    return float(hp[sel].std()), int(sel.sum())
def grad(tb, th=-50.0):
    t = np.where(np.isfinite(tb), tb, 30.0).astype(np.float64); gy, gx = np.gradient(t); g = np.hypot(gx, gy); m = box(t, 5); sel = m < th
    return float(np.median(g[sel])) if sel.sum() > 400 else None
if __name__ == '__main__':
    for name, pat in [('nolo_td', 'crops/nolo_td/20260913T1[258]*.npz'), ('nolo_td', 'crops/nolo_td/20260914T1[25]*.npz'), ('nolo_rem TS 23-24 Sep', 'crops/nolo_rem/2026092[34]*.npz'), ('nolo_hur peak 28 Sep', 'crops/nolo/2026092[78]T*.npz'), ('nolo_hur', 'crops/nolo_hur/2026092[78]*.npz'), ('nolo_ty', 'crops/nolo_ty/2026100[56]*.npz'), ('ian', 'crops/ian/2022092[78]*.npz')]:
        v = []; g = []
        for f in sorted(glob.glob(pat)):
            z = np.load(f); tb = z['tb'].astype(np.float32); r = texture(tb); gg = grad(tb)
            if r: v.append(r[0]); g.append(gg)
        print(f'{name:24s} n={len(v):2d} highpass std (C) median {np.median(v):.2f} (range {min(v):.2f}-{max(v):.2f}), median gradient {np.median(g):.2f} C/px' if v else f'{name}: none')
