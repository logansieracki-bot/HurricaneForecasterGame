#!/usr/bin/env python3
"""The log of a nest's child (wk82_nest.mjs child) as curves in time: the strongest rotation at the lowest level and at the second, the lowest pressure, the strongest wind over the ground at the
lowest level, and the strongest updraft, one set of curves per log. For the look at whether a vortex forms, how strong, how long, and how much the resolution and the setting of the storm matter.
    python3 -I tools/severe_research/vortex_series.py <out.png> <label>=<log> [<label>=<log> ...]
The lines read are those the tool prints every DIAG_EVERY seconds:
    t=  100 s  zeta0 6 (5,15) zeta1 8 1e-3/s  pmin -2.0 hPa (47,20)  vmax0 15.1 m/s (47,43)  wmax 64.6 at (27,0,46)  [288 s]
and it prints, for every log, the largest value of each and when it came."""
import re
import sys

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

LINE = re.compile(r't=\s*(\d+) s\s+zeta0 (-?\d+) \((\d+),(\d+)\) zeta1 (-?\d+) 1e-3/s\s+pmin (-?[\d.]+) hPa \((\d+),(\d+)\)\s+vmax0 ([\d.]+) m/s \((\d+),(\d+)\)\s+wmax (-?[\d.]+) at')


def read(path):
    rows = []
    for line in open(path):
        m = LINE.search(line)
        if m:
            g = m.groups()
            rows.append(dict(t=int(g[0]), z0=float(g[1]), z1=float(g[4]), p=float(g[5]), v=float(g[8]), w=float(g[11])))
    return rows


def main():
    out, pairs = sys.argv[1], sys.argv[2:]
    if not pairs:
        print(__doc__)
        sys.exit(1)
    fig, ax = plt.subplots(5, 1, figsize=(9, 11), sharex=True)
    titles = ['strongest vertical vorticity at the lowest level (1e-3 /s)', 'strongest vertical vorticity at the second level (1e-3 /s)', 'lowest pressure change at the ground (hPa)',
              'strongest wind over the ground at the lowest level (m/s)', 'strongest updraft (m/s)']
    keys = ['z0', 'z1', 'p', 'v', 'w']
    for pr in pairs:
        label, path = pr.split('=', 1)
        rows = read(path)
        if not rows:
            print(label + ': no diagnostic lines in ' + path)
            continue
        t = [r['t'] / 60 for r in rows]
        for a, k in zip(ax, keys):
            a.plot(t, [r[k] for r in rows], label=label, linewidth=1.4)
        best = {k: (max(rows, key=lambda r: r[k]) if k != 'p' else min(rows, key=lambda r: r[k])) for k in keys}
        print(label + ': ' + ', '.join('%s %.1f at %.1f min' % (k, best[k][k], best[k]['t'] / 60) for k in keys))
    for a, t in zip(ax, titles):
        a.set_title(t, fontsize=9, loc='left')
        a.grid(alpha=0.3)
    ax[0].legend(fontsize=8)
    ax[-1].set_xlabel('minutes since the child began')
    fig.tight_layout()
    fig.savefig(out, dpi=110)
    print('->', out)


main()
