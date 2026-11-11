// A recorded storm frame (wk82_run.mjs: <run>.json, <run>.dbz3d.i8, and with winds <run>.wind3d.i16 and <run>.vz3d.u8) as the volume the radar operator takes: reflectivity, and
// u, v, w and the fall speed vz in m/s in the ground's frame (the model's winds plus the motion of the box over the ground), and the base-state winds for the air outside the box.
import { readFileSync } from 'node:fs';

export function loadFrame(run, runPath, minute) {
  const f = run.dbz3d, fi = f.times.findIndex((t) => Math.abs(t - minute) < 1e-6), dir = runPath.replace(/[^/]*$/, '');
  if (fi < 0) throw new Error('no frame at minute ' + minute + ' (have ' + f.times.join(',') + ')');
  const all = readFileSync(dir + f.file), per = run.nz * run.ny * run.nx;
  const vol = { nx: run.nx, ny: run.ny, nz: run.nz, dx: run.dx, dy: run.dx, dz: run.dz, floor: -30, dbz: new Int8Array(all.buffer, all.byteOffset + fi * per, per) };
  if (run.wind3d && run.vz3d) {                                                                            // the winds, in the ground's frame: the model's winds plus the motion of the box over the ground
    const wb = readFileSync(dir + run.wind3d.file), wi = new Int16Array(wb.buffer.slice(wb.byteOffset, wb.byteOffset + wb.byteLength)), vb = readFileSync(dir + run.vz3d.file), m = run.motion || { u: 0, v: 0 };
    const grab = (c, add) => { const a = new Float32Array(per), o = (fi * 3 + c) * per; for (let i = 0; i < per; i++) a[i] = wi[o + i] * run.wind3d.scale + add; return a; };
    vol.u = grab(0, m.u); vol.v = grab(1, m.v); vol.w = grab(2, 0);
    vol.vz = Float32Array.from(vb.subarray(fi * per, (fi + 1) * per), (x) => x * run.vz3d.scale);
    vol.base = run.base;
  }
  return vol;
}
