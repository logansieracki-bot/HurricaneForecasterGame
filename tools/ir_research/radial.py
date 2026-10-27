import sys, glob, os, json, numpy as np
def profile(path, rmax=300, dr=10):
    z = np.load(path); tb = z['tb'].astype(np.float32); res = float(z['res']); n = tb.shape[0]; c = (n - 1) / 2
    yy, xx = np.mgrid[0:n, 0:n]; r = np.hypot(yy - c, xx - c) * res; out = []
    for r0 in range(0, rmax, dr):
        m = (r >= r0) & (r < r0 + dr) & np.isfinite(tb); v = tb[m]
        out.append((r0 + dr / 2, float(v.mean()), float(np.percentile(v, 10)), float(np.percentile(v, 90))))
    return out
if __name__ == '__main__':
    name = sys.argv[1]; times = sys.argv[2:]
    print('r_km  ' + '  '.join(t[5:] for t in times))
    profs = {t: profile(f'crops/{name}/{t.replace("-","").replace(":","")}.npz') for t in times}
    for i in range(30):
        print(f'{profs[times[0]][i][0]:4.0f}  ' + '  '.join(f'{profs[t][i][1]:6.0f}' for t in times))
