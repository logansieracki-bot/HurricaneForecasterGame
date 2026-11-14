/* Severe: the Lab's worker (docs/severe-plan.md section 8). The page makes a Worker from this text put behind the sources of HFSevereCore, HFSevereSounding, HFSevereRefl and HFSevereLab (a worker made from a Blob cannot
 * import them), so that a run of minutes never stops the page.
 *   -> { t: 'run', spec }            spec as HFSevereLab.run takes it (the environment as arrays)
 *   <- { t: 'start', header }       once, before the first frame: the run's header as it is then (the grid, the motion, the nests' grids, no frames: HFSeverePack.live takes it)
 *   <- { t: 'frame', i, time, block (ArrayBuffer, transferred), track, drift, fn, nest, wmax, zmax, thvmin }
 *   <- { t: 'progress', time, of, wall }
 *   <- { t: 'done', header, wall, stopped, reason }
 *   <- { t: 'error', message }
 *   -> { t: 'cancel', keep }         stops the run at its next breath (the run yields every 80 ms of work, a step of the finer model is seconds): the frames so far are lost, or with `keep` they are the run's (reason 'stopped early')
 */
(function () {
  if (!(typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope)) return;
  let cancelled = false;
  const breath = () => new Promise((r) => setTimeout(r, 0));
  self.onmessage = async (e) => {
    const m = e.data;
    if (m.t === 'cancel') { cancelled = m.keep ? 'stopped early' : true; return; }
    if (m.t !== 'run') return;
    cancelled = false;
    try {
      const r = await globalThis.HFSevereLab.run(m.spec, {
        start: (h) => self.postMessage({ t: 'start', header: h }),
        frame: (f) => self.postMessage({ t: 'frame', i: f.i, time: f.t, block: f.block.buffer, track: f.track, drift: f.drift, fn: f.fn, nest: f.nest, wmax: f.wmax, zmax: f.zmax, thvmin: f.thvmin }, [f.block.buffer]),
        progress: (p) => self.postMessage({ t: 'progress', time: p.t, of: p.of, wall: p.wall }),
        yield: breath, cancelled: () => cancelled,
      });
      self.postMessage({ t: 'done', header: r.header, wall: r.wall, stopped: r.stopped, reason: r.reason });
    } catch (err) { self.postMessage({ t: 'error', message: String(err && err.message || err) }); }
  };
})();
