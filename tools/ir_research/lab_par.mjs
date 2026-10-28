// lab_stats.mjs over several cores: the cases of a list run in parallel (one process each, at most as many at a time as the machine has cores), the lines printed in the order of the list
//   node tools/ir_research/lab_par.mjs '<json list>' [outprefix]
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
const cases = JSON.parse(process.argv[2]), outp = process.argv[3] || '/tmp/lab_par', out = new Array(cases.length).fill(''), W = Math.max(1, cpus().length);
let next = 0, running = 0;
function go() {
  while (running < W && next < cases.length) {
    const i = next++; running++;
    const p = spawn('node', [new URL('./lab_stats.mjs', import.meta.url).pathname, JSON.stringify(cases[i]), outp], { stdio: ['ignore', 'pipe', 'inherit'] });
    p.stdout.on('data', (d) => { out[i] += d; });
    p.on('close', () => { running--; if (next >= cases.length && !running) console.log(out.join('')); else go(); });
  }
}
go();
