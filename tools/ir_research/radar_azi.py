"""The game's radar dumps (radar_lab.mjs: <prefix>_<label>_<hhh>.f32, 256 x 256 float32 dBZ, -20 where there is no echo, cells of 2*m km) read the way the reference loop was read (docs/radar-research.md part 2):
by radius in the eye's own radii, and by azimuth from the strongest eyewall sector (or from the lean of the eyewall that radar_lab.mjs prints: the environment variable LEAN, in degrees counter-clockwise from east).
   python3 radar_azi.py PREFIX LABEL HOURS [m]
prints, per hour: the eye radius (km), the strongest ring sector, the class shares by radius (echo >= 20 dBZ, >= 35, >= 45, the video's: 0.92 0.96 0.89 0.80 0.59 0.38 for >= 20 at 1-1.6, 1.6-2.5, 2.5-4, 4-6, 6-9, 9-14 eye radii)
and, at 2.5-4, 4-6 and 6-9 eye radii, the echo / >= 35 dBZ shares in 45-degree bins of the azimuth from the strongest sector (counter-clockwise positive; the video: ~1.0 / 0.5-0.8 over -90 to 0, about 0 / 0 on the far side)."""
import sys, numpy as np
from scipy import ndimage as ndi
prefix, label, hours = sys.argv[1], sys.argv[2], [int(h) for h in sys.argv[3].split(',')]
m = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
for h in hours:
    a = np.fromfile(f'{prefix}_{label}_{h:03d}.f32', dtype=np.float32).reshape(256, 256)[::-1]      # (rows up = north: the dump's j runs south to north)
    n = 256; c = (n - 1) / 2; yy, xx = np.mgrid[0:n, 0:n]; r = np.hypot(yy - c, xx - c) * 2 * m; th = np.arctan2(-(yy - c), xx - c)
    echo = a >= 20
    # the eye: the echo-free (< 15 dBZ) hole that holds the centre
    hole = a < 15; lab, k = ndi.label(hole); l0 = lab[int(round(c)), int(round(c))]
    if l0 == 0:
        print(f'{label} h{h}: no eye (the centre has echo)'); eyeR = None
    else:
        area = (lab == l0).sum() * (2 * m) ** 2; eyeR = np.sqrt(area / np.pi)
        if eyeR > 80: eyeR = None
    if eyeR is None:
        eyeR = 18.0   # (a stand-in so that the shares can still be read: 18 km)
        tag = ' (no eye: 18 km stand-in)'
    else: tag = ''
    rr = r / eyeR
    sec = np.zeros(16)
    for q in range(16):
        a0 = -np.pi + q * np.pi / 8; mm = (rr >= 0.9) & (rr < 2.4) & (th >= a0) & (th < a0 + np.pi / 8); sec[q] = np.clip(a[mm], 0, 60).mean() if mm.any() else 0
    qs = int(np.argmax(sec)); a_s = -np.pi + (qs + 0.5) * np.pi / 8
    import os
    if os.environ.get('LEAN'): a_s = np.radians(float(os.environ['LEAN']))
    print(f'{label} h{h}: eye radius {eyeR:.1f} km{tag}, strongest ring sector at {np.degrees(a_s):.0f} deg, ring sectors (dBZ) ' + ' '.join('%.0f' % s for s in sec))
    bands = [(1, 1.6), (1.6, 2.5), (2.5, 4), (4, 6), (6, 9), (9, 14)]
    print('   radius (eye radii)      ' + '  '.join(f'{lo}-{hi}'.rjust(7) for lo, hi in bands))
    for nm, thr in (('echo >= 20 dBZ', 20), ('>= 35 dBZ', 35), ('>= 45 dBZ', 45)):
        print(f'   {nm:20s}' + '  '.join(f'{((a[(rr >= lo) & (rr < hi)] >= thr).mean()):7.2f}' for lo, hi in bands))
    for (lo, hi) in [(2.5, 4), (4, 6), (6, 9)]:
        row = []
        for d0 in range(-180, 180, 45):
            dth = ((th - a_s - np.radians(d0) + np.pi) % (2 * np.pi)) - np.pi
            mm = (rr >= lo) & (rr < hi) & (np.abs(dth) < np.radians(22.5))
            row.append(f'{d0:+4d}:{(a[mm] >= 20).mean():.2f}/{(a[mm] >= 35).mean():.2f}')
        print(f'   r {lo}-{hi} (echo/>=35) ' + ' '.join(row))
