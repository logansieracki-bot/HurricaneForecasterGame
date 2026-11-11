// Does this machine's headless Chromium have WebGPU, and does a compute shader run? Usage: node tools/severe_research/webgpu_probe.mjs
// WebGPU needs a secure context, so the page is served from localhost; without --enable-unsafe-webgpu there is navigator.gpu but no adapter.
// In the sandbox (no GPU) the adapter is SwiftShader (software Vulkan): correct but slow, good for testing WGSL against a JS reference, not for speed.
import http from 'http';
import { chromium } from 'playwright';
const server = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end('<!doctype html><title>probe</title>ok'); });
await new Promise((res) => server.listen(0, '127.0.0.1', res));
const url = 'http://127.0.0.1:' + server.address().port + '/';
const combos = [['default', []], ['--enable-unsafe-webgpu', ['--enable-unsafe-webgpu']], ['+ swiftshader adapter', ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-webgpu-adapter=swiftshader', '--ignore-gpu-blocklist']]];
for (const [name, args] of combos) {
  const browser = await chromium.launch({ args });
  try {
    const page = await browser.newPage();
    await page.goto(url);
    const r = await page.evaluate(async () => {
      const out = { hasGpu: !!navigator.gpu, secure: isSecureContext };
      if (!navigator.gpu) return out;
      try {
        const ad = await navigator.gpu.requestAdapter();
        if (!ad) { out.adapter = null; return out; }
        out.adapter = { arch: ad.info && ad.info.architecture, fallback: ad.isFallbackAdapter, maxStorageBufferBindingSize: ad.limits.maxStorageBufferBindingSize, maxComputeInvocationsPerWorkgroup: ad.limits.maxComputeInvocationsPerWorkgroup, maxStorageBuffersPerShaderStage: ad.limits.maxStorageBuffersPerShaderStage, f16: ad.features.has('shader-f16') };
        const dev = await ad.requestDevice(), N = 1 << 20;     // one million cells, 64 multiply-adds each, timed
        const buf = dev.createBuffer({ size: N * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }), rd = dev.createBuffer({ size: N * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
        dev.queue.writeBuffer(buf, 0, new Float32Array(N).fill(1));
        const mod = dev.createShaderModule({ code: `@group(0) @binding(0) var<storage,read_write> a: array<f32>; @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g: vec3<u32>) { let i = g.x; if (i < ${N}u) { var x = a[i]; for (var k = 0; k < 64; k++) { x = x * 1.0001 + 0.5; } a[i] = x; } }` });
        const pipe = dev.createComputePipeline({ layout: 'auto', compute: { module: mod, entryPoint: 'main' } });
        const bg = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buf } }] });
        const run = async () => { const e = dev.createCommandEncoder(), p = e.beginComputePass(); p.setPipeline(pipe); p.setBindGroup(0, bg); p.dispatchWorkgroups(N / 64); p.end(); dev.queue.submit([e.finish()]); await dev.queue.onSubmittedWorkDone(); };
        await run(); const t0 = performance.now(); for (let i = 0; i < 5; i++) await run(); out.msPerPass = +((performance.now() - t0) / 5).toFixed(1);
        const e = dev.createCommandEncoder(); e.copyBufferToBuffer(buf, 0, rd, 0, N * 4); dev.queue.submit([e.finish()]); await rd.mapAsync(GPUMapMode.READ);
        let x = 1; for (let i = 0; i < 6 * 64; i++) x = x * 1.0001 + 0.5; out.resultOk = Math.abs(new Float32Array(rd.getMappedRange())[0] / x - 1) < 1e-4;   // 6 passes of 64 steps were run on the same buffer
      } catch (e) { out.err = String(e).slice(0, 200); }
      return out;
    });
    console.log(name.padEnd(26), JSON.stringify(r));
  } finally { await browser.close(); }
}
server.close();
