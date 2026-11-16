// pack_trim.mjs <in.hfp> <out.hfp> <from minute> [to minute] [name] [place=t:bearing:km]: the frames of a storm pack from a minute on (a recorded storm that opens when the storm is mature, a file of a third of the size). The header's per-frame lists (times,
// track, drift, the nests of each frame) are cut with the frames and the pack is assembled and written as `lab_detail_run.mjs` writes one (HFP1 or HFP2, gzip of the header and the frames' blocks).
// `place=75:315:45` puts the pack on the ground so that at minute 75 the middle of its window is 45 km from the scenario's radar (the site that the pack's lat0 and lon0 are) towards 315 degrees (north-west), where a recorded storm is
// looked at from the side as it goes by: the scenario's `origin` is moved so, nothing else of the pack is.
//   node tools/severe_research/pack_trim.mjs /tmp/run.hfp data/severe/packs/storm.hfp 56
import '../../src/severe-geo.js';
import '../../src/severe-pack.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

const argv = process.argv.slice(2), placeArg = argv.find((a) => a.startsWith('place=')), [src, out, from, to, name] = argv.filter((a) => !a.startsWith('place='));
if (!src || !out || from === undefined) { console.error('usage: pack_trim.mjs <in.hfp> <out.hfp> <from minute> [to minute] [name]'); process.exit(1); }
const raw = readFileSync(src), body = gunzipSync(raw.subarray(4)), P = globalThis.HFSeverePack.fromBody(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
const h0 = P.h, keep = [];
for (let i = 0; i < P.n; i++) if (P.times[i] >= +from && (to === undefined || to === '' || P.times[i] <= +to)) keep.push(i);
if (!keep.length) { console.error('no frame from minute ' + from); process.exit(1); }
const pick = (a) => (Array.isArray(a) ? keep.map((i) => a[i]) : a), header = Object.assign({}, h0, { times: pick(h0.times), track: pick(h0.track), drift: pick(h0.drift) });
if (h0.fn) header.fn = pick(h0.fn);
delete header.offsets; if (name) header.name = name;
if (placeArg) {
  const [pt, pb, pk] = placeArg.slice(6).split(':').map(Number), sc = h0.scenario, c = P.corner(pt), mid = (P.nx * P.dx) / 2, br = pb * Math.PI / 180;
  const want = [pk * 1000 * Math.sin(br) - mid, pk * 1000 * Math.cos(br) - mid];                                              // (the window's corner when its middle is there)
  header.scenario = Object.assign({}, sc, { origin: [Math.round(sc.origin[0] + want[0] - c[0]), Math.round(sc.origin[1] + want[1] - c[1])] });
}
const blocks = keep.map((i) => P.frameBytes(i)), pk = globalThis.HFSeverePack.assemble(header, blocks), h = pk.h, head = new TextEncoder().encode(JSON.stringify(h));
const total = blocks.reduce((a, b) => a + b.length, 0), buf = new Uint8Array(4 + head.length + total);
new DataView(buf.buffer).setUint32(0, head.length, true); buf.set(head, 4); let at = 4 + head.length; for (const b of blocks) { buf.set(b, at); at += b.length; }
writeFileSync(out, Buffer.concat([Buffer.from(h.v === 2 ? 'HFP2' : 'HFP1'), gzipSync(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength), { level: 6 })]));
console.log(src.replace(/.*\//, '') + ' ' + P.n + ' frames, minutes ' + P.times[0] + ' to ' + P.times[P.n - 1] + ' -> ' + out.replace(/.*\//, '') + ' ' + pk.n + ' frames, minutes ' + pk.times[0] + ' to ' + pk.times[pk.n - 1] + ', ' + (buf.length / 1e6).toFixed(1) + ' MB raw');
