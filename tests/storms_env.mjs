// Synthetic environments for the node-only storm-engine tests (tests/storms.mjs). They implement the engine's environment
// interface (see the header of src/storms.js) with simple analytic fields, so a test can pin SST, shear, humidity, steering or land
// and check one physical response at a time. Nothing here is used by the shipped pages.
export const BOX = { lat0: -40, lat1: 72, lon0: -110, lon1: 40 };

const fn = (v) => (typeof v === 'function' ? v : () => v);

// deep / shallow layer winds (kt) of a crude Atlantic: trades south of ~20N, westerlies poleward of ~30N
export function defaultSteer(lat) {
  const ud = lat <= 18 ? -14 : lat <= 38 ? -14 + 1.2 * (lat - 18) : 10 + 1.2 * (lat - 38);
  const us = lat <= 18 ? -12 : lat <= 34 ? -12 + 1.0 * (lat - 18) : 4 + 1.0 * (lat - 34);
  const vd = lat < 30 ? 1.5 : 3.5, vs = lat < 30 ? 1.0 : 2.5;
  const um = 0.68 * us + 0.32 * ud, vm = 0.68 * vs + 0.32 * vd;
  return [us, vs, um, vm, ud, vd];
}

// opts: sst, shear, rh, slp (number or (lat, lon) => number), steer ((lat, lon) => [us, vs, um, vm, ud, vd]), land ((lat, lon) => boolean), lows (() => detections)
export function makeEnv(opts = {}) {
  const sst = fn(opts.sst ?? 28.5), shear = fn(opts.shear ?? 8), rh = fn(opts.rh ?? 62), slp = fn(opts.slp ?? 1012);
  const steer = opts.steer || ((lat) => defaultSteer(lat)), land = opts.land || (() => false);
  const env = {
    box: opts.box || BOX,
    sst: (la, lo) => sst(la, lo), shear: (la, lo) => shear(la, lo), rh: (la, lo) => rh(la, lo), slp: (la, lo) => slp(la, lo),
    isLand: (la, lo) => !!land(la, lo),
    steer(la, lo, out) { const s = steer(la, lo); for (let i = 0; i < 6; i++) out[i] = s[i]; },
  };
  if (opts.lows) env.lows = opts.lows;
  return env;
}

// a rough seasonal Atlantic: SST warms toward the tropics and with the season; shear grows poleward and in winter; dry air north of the trades
export function climateEnv(doyOf, opts = {}) {
  let doy = 0;
  const e = makeEnv({
    sst: (la) => { const s = Math.cos(2 * Math.PI * (doy - 240) / 365); return 27.2 + 1.6 * s * (la > 0 ? 1 : -1) - 0.5 * Math.max(0, Math.abs(la) - 13) + 0.9 * Math.min(0, 1 - Math.abs(la) / 22); },
    shear: (la) => 6 + 0.9 * Math.max(0, Math.abs(la) - 14) + 5 * (1 + Math.cos(2 * Math.PI * (doy - 20) / 365)),
    rh: (la) => (Math.abs(la) < 22 ? 60 : 55 - 0.9 * (Math.abs(la) - 22)),
    land: opts.land,
    ...opts,
  });
  e.setDoy = (d) => { doy = d; };
  return e;
}
