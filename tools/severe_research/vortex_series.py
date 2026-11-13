#!/usr/bin/env python3
"""The log of a nest's child (wk82_nest.mjs child) as curves in time: the strongest rotation at the lowest level and at the second, the lowest pressure, the strongest wind over the ground at the
lowest level, and the strongest updraft, one set of curves per log. For the look at whether a vortex forms, how strong, how long, and how much the resolution and the setting of the storm matter.
    python3 -I tools/severe_research/vortex_series.py <out.png> <label>=<log> [<label>=<log> ...]
The lines read are those the tool prints every DIAG_EVERY seconds:
    t=  100 s  zeta0 6 (5,15) zeta1 8 1e-3/s  pmin -2.0 hPa (47,20)  vmax0 15.1 m/s (47,43)  wmax 64.6 at (27,0,46)  [288 s]
and it prints, for every log, the largest value of each and when it came. A log made after the criteria were put in the tool (docs/severe-plan.md 6.8) has three more fields at the end of a line,
    z1km 12 adj 0 pmed -1.4
(the rotation about 1 km above the ground at the lowest level's strongest, the cells joined to it with 0.1 per second or more, the median pressure change of the lowest level), and for such a log the tool says
how many lines each criterion holds at and whether all of them held together for two minutes: a tornado-like vortex, in the plan's words (a wind over the ground of 40 m/s or more, a pressure 10 hPa or more under
the median, a rotation of 0.1 per second or more in three or more joined cells, and 0.03 per second or more near 1 km). Whether it was natural (nothing put in) and whether it came in more than one copy
of the storm are for whoever ran it to say."""
import re
import sys

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

TAIL = re.compile(r'z1km (-?\d+) adj (\d+) pmed (-?[\d.]+)')
LINE = re.compile(r't=\s*(\d+) s\s+zeta0 (-?\d+) \((\d+),(\d+)\) zeta1 (-?\d+) 1e-3/s\s+pmin (-?[\d.]+) hPa \((\d+),(\d+)\)\s+vmax0 ([\d.]+) m/s \((\d+),(\d+)\)\s+wmax (-?[\d.]+) at')


def read(path):
    rows = []
    for line in open(path):
        m = LINE.search(line)
        if m:
            g = m.groups()
            r = dict(t=int(g[0]), z0=float(g[1]), z1=float(g[4]), p=float(g[5]), v=float(g[8]), w=float(g[11]))
            m2 = TAIL.search(line)
            if m2:
                r.update(z1km=float(m2.group(1)), adj=int(m2.group(2)), pmed=float(m2.group(3)))
            rows.append(r)
    return rows


# the plan's criteria (docs/severe-plan.md 6.8), per line of the log
CRIT = [('wind >= 40 m/s', lambda r: r['v'] >= 40), ('pressure >= 10 hPa under the median', lambda r: r['p'] - r['pmed'] <= -10),
        ('rotation >= 0.1 /s', lambda r: r['z0'] >= 100), ('3 or more joined cells >= 0.1 /s', lambda r: r['adj'] >= 3), ('rotation >= 0.03 /s near 1 km', lambda r: r['z1km'] >= 30)]


def verdict(label, rows):
    if not rows or 'adj' not in rows[0]:
        return
    step = min((b['t'] - a['t']) for a, b in zip(rows, rows[1:])) if len(rows) > 1 else 0
    held = [all(f(r) for _, f in CRIT) for r in rows]
    best = (0, None, None); start = None
    for i, h in enumerate(held + [False]):
        if h and start is None:
            start = i
        if not h and start is not None:
            span = rows[i - 1]['t'] - rows[start]['t'] + step
            if span > best[0]:
                best = (span, rows[start]['t'], rows[i - 1]['t'])
            start = None
    each = ', '.join('%s at %d' % (n, sum(1 for r in rows if f(r))) for n, f in CRIT)
    print('  criteria, lines of %d each holds at: %s' % (len(rows), each))
    if best[0] >= 120:
        print('  -> TORNADO-LIKE VORTEX: all five together for %d s (%d s to %d s)' % (best[0], best[1], best[2]))
    else:
        print('  -> no tornado-like vortex (all five together for at most %d s of the 120 s the plan asks)' % best[0])


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
        verdict(label, rows)
    for a, t in zip(ax, titles):
        a.set_title(t, fontsize=9, loc='left')
        a.grid(alpha=0.3)
    ax[0].legend(fontsize=8)
    ax[-1].set_xlabel('minutes since the child began')
    fig.tight_layout()
    fig.savefig(out, dpi=110)
    print('->', out)


main()
