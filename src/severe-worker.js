/* Severe: the scanning worker (docs/severe-plan.md 7.1). The page makes a Worker from this text put behind the sources of HFSevereGeo, HFSevereRadar and HFSeverePack (a worker made
 * from a Blob cannot import them), so that a scan (about half a second of arithmetic for one tilt at 1 km) never stops the page.
 *   -> { t: 'init', header }        the pack's header (grid, winds' scale, the box's motion, the base state): a worker never holds the recording, only the frames it is asked about
 *   <- { t: 'ready' }
 *   -> { t: 'scan', id, frame, bytes, opts }  the frame's block of bytes (an ArrayBuffer, pack.frameBytes: the five arrays of the box and those of its nests) and opts as HFSevereRadar.scan takes them (elev, x, y, seed, velocity, dealias, ...)
 *   <- { t: 'sweep', id, meta, dbz, vel, sw }   Int16Arrays of the values in half units (NaN: -32768), nRad rows of nGates; meta: nRad, nGates, dAz, gate, r0, elev, antenna, nyquist
 * `HFSevereScanner` is the same thing without a worker (the page's fallback, and what the tests use): scan(frame, opts) -> the message above.
 */
(function () {
  const NONE = -32768;
  function quant(a) {
    const out = new Int16Array(a.length);
    for (let i = 0; i < a.length; i++) { const v = a[i]; out[i] = v === v ? Math.max(-32767, Math.min(32767, Math.round(v * 2))) : NONE; }
    return out;
  }
  function make(pack) {
    const vols = new Map();
    return {
      scan(frame, opts) {
        let vol = vols.get(frame); if (!vol) { vol = pack.volume(frame); vols.set(frame, vol); if (vols.size > 3) vols.delete(vols.keys().next().value); }
        const s = globalThis.HFSevereRadar.scan(vol, Object.assign({ velocity: true }, opts));
        return { meta: { nRad: s.nRad, nGates: s.nGates, dAz: s.dAz, gate: s.gate, r0: s.r0, elev: s.elev, antenna: s.antenna, nyquist: s.nyquist }, dbz: quant(s.dbz), vel: quant(s.vel), sw: quant(s.sw) };
      },
    };
  }
  globalThis.HFSevereScanner = { make, quant, NONE };

  if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {       // inside a worker
    let sc = null, header = null; const frames = new Map();
    self.onmessage = (e) => {
      const m = e.data;
      if (m.t === 'init') { header = m.header; sc = make({ volume: (frame) => globalThis.HFSeverePack.volumeFromFrame(header, frames.get(frame), frame) }); self.postMessage({ t: 'ready' }); }
      else if (m.t === 'scan') {
        try {
          frames.set(m.frame, new Uint8Array(m.bytes)); if (frames.size > 4) frames.delete(frames.keys().next().value);
          const r = sc.scan(m.frame, m.opts); self.postMessage({ t: 'sweep', id: m.id, meta: r.meta, dbz: r.dbz, vel: r.vel, sw: r.sw }, [r.dbz.buffer, r.vel.buffer, r.sw.buffer]);
        } catch (err) { self.postMessage({ t: 'error', id: m.id, message: String(err && err.message || err) }); }
      }
    };
  }
})();
