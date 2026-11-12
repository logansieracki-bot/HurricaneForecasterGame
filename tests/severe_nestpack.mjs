// Node-only test of the tool that makes the nested storm packs (tools/severe_research/make_nest_pack.mjs) against the reader the page uses (src/severe-pack.js): a synthetic nested run (a box of
// 6 x 5 x 3 cells with a nest of 4 x 4 x 3 inside it, three frames, files in the formats wk82_nest.mjs writes) in which every value is known, packed with the tool and read back, frame by frame:
// the arrays of the box and of the nest, the winds' steps and their clamp, the place of the nest in each frame, the times, the choice of frames by a window, the box's place on the ground, and
// the refusals. The right answers are the source arrays themselves (a round trip) and the arithmetic of the quantisation written out here.
import '../src/severe-geo.js';
import '../src/severe-pack.js';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const G = globalThis.HFSevereGeo, PK = globalThis.HFSeverePack;
let failed = 0, passed = 0;
function check(name, cond) { if (cond) { passed++; console.log('ok   ' + name); } else { failed++; console.log('FAIL ' + name); } }
const t0 = Date.now(), MAKER = new URL('../tools/severe_research/make_nest_pack.mjs', import.meta.url).pathname, SITES = JSON.parse(readFileSync(new URL('../data/generated/severe-sites.json', import.meta.url), 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'sev-nestpack-'));

/* the synthetic run: the box and the nest of the files wk82_nest.mjs writes (<base>.json, .pdbz.i8 .pvz.u8 .puvw.i16 for the box, .cdbz.i8 .cvz.u8 .cuvw.i16 for the nest) */
const BX = { nx: 6, ny: 5, nz: 3, dx: 500, dz: 500 }, CH = { nx: 4, ny: 4, nz: 3, dx: 100, dz: 250 }, NF = 3, TIMES = [0, 60, 120], START = 50, MOTION = { u: 8.1, v: 4.9 }, FRAME = { u: 5, v: -2 };
const cells = (g) => g.nx * g.ny * g.nz;
const CORNERS = [[1000, 500], [1300.5, 440.25], [1600, 380]], TRACK = [[1250, 750, 31.5], [1500, 1000, 40.2], [1750, 1250, 44]];
const dbzAt = (s, f, i) => ((f * 31 + i * 7 + s * 11) % 131) - 30, vzAt = (s, f, i) => (f * 17 + i * 5 + s * 3) % 200, uvwAt = (s, f, c, i) => ((i * 13 + f * 7 + c * 101 + s * 29) % 4001) - 2000;     // the integers of the files (dBZ, 0.25 m/s, 0.01 m/s)
function writeRun(name, o = {}) {
  const base = join(dir, name), put = (ext, a) => writeFileSync(base + ext, Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  const arr = (g, s, kind) => {
    const n = cells(g), a = kind === 'dbz' ? new Int8Array(NF * n) : kind === 'vz' ? new Uint8Array(NF * n) : new Int16Array(NF * 3 * n);
    for (let f = 0; f < NF; f++) for (let i = 0; i < n; i++) {
      if (kind === 'dbz') a[f * n + i] = dbzAt(s, f, i); else if (kind === 'vz') a[f * n + i] = vzAt(s, f, i);
      else for (let c = 0; c < 3; c++) a[(f * 3 + c) * n + i] = uvwAt(s, f, c, i);
    }
    return a;
  };
  const cu = arr(CH, 2, 'uvw'); if (o.strong) cu[(1 * 3 + 2) * cells(CH) + 5] = 7000;                      // a nest wind of 70 m/s in frame 1 (w, cell 5: the last component, so that a look at fewer of them misses it)
  const pu = arr(BX, 1, 'uvw'); if (o.boxStrong) { pu[(2 * 3 + 1) * cells(BX) + 7] = 8000; pu[(0 * 3 + 0) * cells(BX) + 4] = -8000; }   // box winds of 80 m/s (frame 2, v, cell 7) and -80 m/s (frame 0, u, cell 4)
  put('.pdbz.i8', arr(BX, 1, 'dbz')); put('.pvz.u8', arr(BX, 1, 'vz')); put('.puvw.i16', pu); put('.cdbz.i8', arr(CH, 2, 'dbz')); put('.cvz.u8', arr(CH, 2, 'vz')); put('.cuvw.i16', cu);
  const base0 = { z: [250, 750, 1250], u: [1, 2, 3], v: [4, 5, 6] };
  writeFileSync(base + '.json', JSON.stringify({ v: 1, vz: { scale: 0.5 }, nx: CH.nx, ny: CH.ny, nz: CH.nz, dx: CH.dx, dz: CH.dz, times: TIMES, startMinute: START, frame: FRAME, motion: MOTION, x0: 1000, y0: 500, corners: CORNERS,
    parent: o.noParent ? null : { nx: BX.nx, ny: BX.ny, nz: BX.nz, dx: BX.dx, dz: BX.dz, track: TRACK, base: base0 } }));
  return base + '.json';
}
function pack(jsonPath, out, spec, env = {}) {
  const r = spawnSync('node', [MAKER, jsonPath, out].concat(spec === undefined ? [] : [spec]).concat(env.NAME ? [env.NAME] : []), { env: Object.assign({}, process.env, { SITE: '', AT: '', CLOCK: '', TZ: '' }, env), encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}
const read = (file) => { const raw = readFileSync(file), body = gunzipSync(raw.subarray(4)); return { magic: raw.subarray(0, 4).toString(), P: PK.fromBody(new Uint8Array(body.buffer, body.byteOffset, body.byteLength)) }; };
const refused = (r, re) => r.code === 1 && re.test(r.out) && !/Error|node:internal|file:\/\//.test(r.out);                  // a refusal is a word and the exit 1, not a crash that happens to print the line it stopped at
const q = (iu, step) => Math.round((iu * 0.01) / step) * step;                                                       // what a wind of iu hundredths of a metre per second is after the pack's steps
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const vmax = (m) => 127 * m;                                                                                         // the clamp

const jp = writeRun('a'), outA = join(dir, 'a.hfp'), rA = pack(jp, outA, 'all');
check('the tool packs the nested run (exit ' + rA.code + ')', rA.code === 0);
const { magic, P } = read(outA), h = P.h;
check('the file is a pack of version 2 ("' + magic + '", v ' + h.v + ') of three frames at the minutes of the run (the child began at minute 50: ' + P.times.join(', ') + ')', magic === 'HFP2' && h.v === 2 && P.n === 3 && P.times.join() === '50,51,52');
check('the box is the parent\'s grid (' + P.nx + 'x' + P.ny + 'x' + P.nz + ' of ' + P.dx + ' x ' + P.dz + ' m), the motion, the base state and the updraft track are the run\'s, the fall speed step is 0.25',
  P.nx === 6 && P.ny === 5 && P.nz === 3 && P.dx === 500 && P.dz === 500 && P.floor === -30 && h.motion.u === 8.1 && h.motion.v === 4.9 && JSON.stringify(h.base) === JSON.stringify({ z: [250, 750, 1250], u: [1, 2, 3], v: [4, 5, 6] }) && JSON.stringify(h.track) === JSON.stringify(TRACK) && h.scale.vz === 0.25 && h.scale.wind === 0.5);
const bl = 5 * cells(BX) + 5 * cells(CH);
check('one nest, its grid and its own step of the fall speed (the run\'s 0.5) and its motion over the box, and every frame\'s block holds the box and then the nest (' + bl + ' bytes): the offsets are ' + h.offsets.join(', '),
  h.nests.length === 1 && h.nests[0].nx === 4 && h.nests[0].ny === 4 && h.nests[0].nz === 3 && h.nests[0].dx === 100 && h.nests[0].dz === 250 && h.nests[0].scale.vz === 0.5 && h.nests[0].frame.u === 5 && h.nests[0].frame.v === -2
  && h.offsets.length === 4 && h.offsets.every((o, i) => o === i * bl));
check('every frame has its one nest at the corner of that frame (' + JSON.stringify(h.fn) + ')', JSON.stringify(h.fn) === JSON.stringify(CORNERS.map((c) => [[0, c[0], c[1]]])));

/* every cell of the box and of the nest, three frames: the reflectivity and the fall speed as they were, the winds in the steps of the pack plus the motion (and the nest's own frame) */
function allCells(P, nf, step, nestStep, ov) {                                                                       // ov: [frame, component, cell, hundredths] of a nest value that the run was given by hand
  let bad = 0, nb = 0, worstU = 0;
  for (let f = 0; f < nf; f++) {
    const vol = P.volume(f), n = cells(BX), m = cells(CH);
    for (let i = 0; i < n; i++) {
      nb++;
      if (vol.dbz[i] !== dbzAt(1, f, i) || vol.vz[i] !== vzAt(1, f, i) * 0.25) bad++;
      for (const [c, arr, add] of [[0, vol.u, MOTION.u], [1, vol.v, MOTION.v], [2, vol.w, 0]]) { const e = Math.max(-vmax(step), Math.min(vmax(step), q(uvwAt(1, f, c, i), step))) + add; worstU = Math.max(worstU, Math.abs(arr[i] - e)); }
    }
    const nv = vol.nests[0].vol;
    for (let i = 0; i < m; i++) {
      nb++;
      if (nv.dbz[i] !== dbzAt(2, f, i) || nv.vz[i] !== vzAt(2, f, i) * 0.5) bad++;
      for (const [c, arr, add] of [[0, nv.u, MOTION.u + FRAME.u], [1, nv.v, MOTION.v + FRAME.v], [2, nv.w, 0]]) {
        const iu = ov && ov[0] === f && ov[1] === c && ov[2] === i ? ov[3] : uvwAt(2, f, c, i), e = Math.max(-vmax(nestStep), Math.min(vmax(nestStep), q(iu, nestStep))) + add; worstU = Math.max(worstU, Math.abs(arr[i] - e));
      }
    }
  }
  return { bad, nb, worstU };
}
{ const r = allCells(P, 3, 0.5, 0.5);
  check('all ' + r.nb + ' cells of the box and the nest in the three frames read back: reflectivity and fall speed exactly, the winds as the 0.5 m/s steps plus the motion (worst ' + r.worstU.toExponential(1) + ')', r.bad === 0 && r.worstU < 1e-4); }
{ const v = P.volume(1);
  check('the nest of frame 1 lies at the corner of frame 1 (' + v.nests[0].x + ', ' + v.nests[0].y + '), not of the first', v.nests.length === 1 && v.nests[0].x === 1300.5 && v.nests[0].y === 440.25 && v.nests[0].vol.dx === 100 && v.nests[0].vol.dz === 250); }

/* a window of frames: the minutes between 51 and 52, and a step of two */
{ const o = join(dir, 'b.hfp'), r = pack(jp, o, '51-52:1'), { P: B } = read(o);
  check('a window "51-52:1" keeps frames 1 and 2 (minutes ' + B.times.join(', ') + '), their nests at their own corners and their own values (the first kept frame is the run\'s frame 1)',
    r.code === 0 && B.n === 2 && B.times.join() === '51,52' && B.h.fn[0][0][1] === 1300.5 && B.h.fn[1][0][1] === 1600 && B.volume(0).dbz[3] === dbzAt(1, 1, 3) && B.volume(0).nests[0].vol.dbz[5] === dbzAt(2, 1, 5) && B.volume(1).dbz[3] === dbzAt(1, 2, 3)
    && JSON.stringify(B.h.track) === JSON.stringify([TRACK[1], TRACK[2]])); }
{ const o = join(dir, 'c.hfp'), r = pack(jp, o, '50-52:2'), { P: C } = read(o);
  check('a window "50-52:2" keeps every second minute: 50 and 52 (' + C.times.join(', ') + '), and the end of a window counts', r.code === 0 && C.n === 2 && C.times.join() === '50,52' && C.volume(1).dbz[3] === dbzAt(1, 2, 3)); }
{ const o = join(dir, 'd.hfp'), r = pack(jp, o, '60-70:1'), r2 = pack(jp, o, 'soon');
  check('a window with no frame, and one that is not a window, are refused with a word (exit ' + r.code + ', ' + r2.code + ')', refused(r, /^no frame in "60-70:1"/) && refused(r2, /^bad window "soon"/)); }

/* the winds' steps: a nest wind past 63.5 m/s makes the nest's step 1 m/s (and says so), a box wind past it is clamped */
{ const js = writeRun('s', { strong: true }), o = join(dir, 's.hfp'), r = pack(js, o, 'all'), { P: S } = read(o), nv = S.volume(1).nests[0].vol;
  check('a nest vertical wind of 70 m/s makes the nest\'s step 1 m/s (' + S.h.nests[0].scale.wind + ') and it reads back as 70 (' + nv.w[5].toFixed(2) + '), the box keeps 0.5',
    r.code === 0 && S.h.nests[0].scale.wind === 1 && near(nv.w[5], 70, 1e-4) && S.h.scale.wind === 0.5 && /strongest 70 m\/s/.test(r.out));
  const r2 = allCells(S, 3, 0.5, 1, [1, 2, 5, 7000]);
  check('and every cell of the box and the nest is right, the nest in steps of 1 m/s (worst ' + r2.worstU.toExponential(1) + ')', r2.bad === 0 && r2.worstU < 1e-4);
  check('a nest wind below 63.5 m/s keeps the step 0.5 m/s (the run\'s strongest is ' + (/strongest (\d+) m\/s/.exec(rA.out) || [])[1] + ' m/s)', read(outA).P.h.nests[0].scale.wind === 0.5); }
{ const jb = writeRun('t', { boxStrong: true }), o = join(dir, 't.hfp'), r = pack(jb, o, 'all'), { P: T } = read(o), v = T.volume(2).v[7], u = T.volume(0).u[4];
  check('box winds of 80 and -80 m/s are clamped to 63.5 and -63.5 m/s (127 steps of 0.5) plus the motion (' + v.toFixed(2) + ', ' + u.toFixed(2) + ') and the tool says how many values it clamped (' + (/(\d+) values clamped/.exec(r.out) || [])[1] + ')',
    near(v, 63.5 + MOTION.v, 1e-4) && near(u, -63.5 + MOTION.u, 1e-4) && /2 values clamped/.test(r.out)); }

/* the box on the ground: the strongest updraft of the box at the minute of AT is at AT's east and north from the site, whatever the frame the minute falls on */
{ const SITE = 'KTLX', o = join(dir, 'g.hfp'), r = pack(jp, o, 'all', { SITE, AT: '51:-30:25' }), { P: Gp } = read(o), c = Gp.corner(51), s = SITES[SITE];
  const ex = c[0] + TRACK[1][0], ny = c[1] + TRACK[1][1];
  check('with AT=51:-30:25 the updraft of minute 51 is 30 km west and 25 km north of ' + SITE + ' (' + (ex / 1000).toFixed(3) + ', ' + (ny / 1000).toFixed(3) + ' km), and the pack\'s point is the site (' + Gp.scenario.lat0 + ', ' + Gp.scenario.lon0 + ', ' + Gp.scenario.radar + ')',
    r.code === 0 && near(ex, -30000, 1) && near(ny, 25000, 1) && Gp.scenario.lat0 === s[0] && Gp.scenario.lon0 === s[1] && Gp.scenario.radar === SITE);
  const e2 = Gp.corner(52)[0] + TRACK[2][0], n2 = Gp.corner(52)[1] + TRACK[2][1], d = Math.hypot(e2 - ex, n2 - ny);
  check('the box moves with the run\'s motion over the ground: the updraft of the next minute is ' + (d / 1000).toFixed(2) + ' km from the last (the track\'s step and 60 s of the motion)', near(e2 - ex, (TRACK[2][0] - TRACK[1][0]) + MOTION.u * 60, 1) && near(n2 - ny, (TRACK[2][1] - TRACK[1][1]) + MOTION.v * 60, 1));
  const rb = Gp.radarBox(51, s[0], s[1]); check('the radar of the site is in the box where the updraft is not: the site\'s place in the box at minute 51 is the updraft\'s minus (-30, 25) km (' + (rb.x / 1000).toFixed(3) + ', ' + (rb.y / 1000).toFixed(3) + ')', near(rb.x, TRACK[1][0] + 30000, 1) && near(rb.y, TRACK[1][1] - 25000, 1)); }
{ const o = join(dir, 'g2.hfp'), r = pack(jp, o, 'all'), { P: D } = read(o), c = D.corner(51), kv = SITES.KVNX;
  check('by default the site is KVNX, the minute the middle frame\'s (51) and the updraft 30 km west and 25 km north of it (' + ((c[0] + TRACK[1][0]) / 1000).toFixed(3) + ', ' + ((c[1] + TRACK[1][1]) / 1000).toFixed(3) + ')',
    r.code === 0 && D.scenario.radar === 'KVNX' && D.scenario.lat0 === kv[0] && near(c[0] + TRACK[1][0], -30000, 1) && near(c[1] + TRACK[1][1], 25000, 1));
  check('the clock is 3 PM at minute 0 (so 3:50 PM at the first frame) and the zone CDT', D.scenario.clock === '15:00' && D.scenario.tz === 'CDT' && D.clock(50).text === '3:50 PM'); }
{ const o = join(dir, 'g3.hfp'), r = pack(jp, o, '51-52:1', { AT: '52:10:-5', CLOCK: '12:30', TZ: 'MST', SITE: 'KSGF' }), { P: E } = read(o), c = E.corner(52);
  check('AT names another minute, CLOCK and TZ the clock, SITE another radar (' + E.scenario.radar + ', ' + E.clock(52).text + ' ' + E.scenario.tz + ')', r.code === 0 && near(c[0] + TRACK[2][0], 10000, 1) && near(c[1] + TRACK[2][1], -5000, 1) && E.scenario.clock === '12:30' && E.scenario.tz === 'MST' && E.scenario.radar === 'KSGF' && E.clock(52).text === '1:22 PM'); }
{ const o = join(dir, 'g4.hfp'), r = pack(jp, o, 'all', { AT: '51.4:0:0' }), { P: F } = read(o), c = F.corner(51);
  check('an AT minute between two frames takes the nearest frame\'s updraft (51.4: the frame at 51: ' + ((c[0] + TRACK[1][0]) / 1000).toFixed(3) + ' km)', r.code === 0 && near(c[0] + TRACK[1][0], 0, 1) && near(c[1] + TRACK[1][1], 0, 1)); }

/* the name, and the refusals */
{ const o = join(dir, 'n.hfp'), r = pack(jp, o, 'all', { NAME: 'A test storm' }), r0 = read(outA).P.name;
  check('the name is the one given, or says the grids (' + read(o).P.name + '; ' + r0 + ')', r.code === 0 && read(o).P.name === 'A test storm' && /500 m/.test(r0) && /100 m nest/.test(r0)); }
{ const jn = writeRun('np', { noParent: true }), r = pack(jn, join(dir, 'np.hfp'), 'all'), r2 = pack(jp, join(dir, 'x.hfp'), 'all', { SITE: 'KZZZ' });
  check('a run without the parent\'s box and a site that is not in the table are refused with a word (exit ' + r.code + ', ' + r2.code + ')', refused(r, /^the run has no parent frames/) && refused(r2, /^no site KZZZ/)); }
{ const r = spawnSync('node', [MAKER], { encoding: 'utf8' }); check('with no arguments it says how it is used (exit ' + r.status + ')', refused({ code: r.status, out: r.stderr }, /^usage: make_nest_pack/)); }

rmSync(dir, { recursive: true, force: true });
console.log('\n' + passed + ' passed, ' + failed + ' failed (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
process.exit(failed ? 1 : 0);
