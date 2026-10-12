/**
 * Benchmark: median absolute first-difference over audio channels.
 *
 * OLD  = the implementation currently in src/audio/analysisMetrics.ts `medianStepDb`:
 *        materialise every step into a plain JS array, sort it (O(n log n) comparisons,
 *        boxed doubles), take the middle element.
 * NEW  = same answer, but steps go into a Float64Array and the selection is done with
 *        a quickselect + insertion fallback: O(n) expected.
 *
 * Deterministic signal (LCG) so both runs see identical data. Prints max |old-new| to
 * prove bit-identical results.
 */

function oldMedian(channels) {
  const steps = [];
  for (const channel of channels) {
    for (let i = 1; i < channel.length; i += 1) steps.push(Math.abs(channel[i] - channel[i - 1]));
  }
  if (!steps.length) return -Infinity;
  steps.sort((a, b) => a - b);
  const middle = steps[Math.floor(steps.length / 2)];
  return middle === 0 ? -Infinity : 20 * Math.log10(middle);
}

function newSelectSteps(channels) {
  // build steps directly into a typed array (no boxing, no push growth)
  let total = 0;
  for (const c of channels) total += Math.max(0, c.length - 1);
  if (!total) return -Infinity;
  const s = new Float64Array(total);
  let k = 0;
  for (const channel of channels) {
    for (let i = 1; i < channel.length; i += 1) s[k++] = Math.abs(channel[i] - channel[i - 1]);
  }
  const rank = total >> 1; // floor(n/2) — same index the old code read
  let lo = 0;
  let hi = total - 1;
  while (lo < hi) {
    if (hi - lo < 32) {
      for (let i = lo + 1; i <= hi; i++) {
        const v = s[i];
        let j = i - 1;
        while (j >= lo && s[j] > v) { s[j + 1] = s[j]; j--; }
        s[j + 1] = v;
      }
      break;
    }
    const m = (lo + hi) >> 1;
    if (s[m] > s[lo]) { const t = s[m]; s[m] = s[lo]; s[lo] = t; }
    if (s[hi] > s[m]) { const t = s[hi]; s[hi] = s[m]; s[m] = t; if (s[m] > s[lo]) { const t2 = s[m]; s[m] = s[lo]; s[lo] = t2; } }
    const pivot = s[m];
    { const t = s[m]; s[m] = s[hi]; s[hi] = t; }
    let store = lo;
    for (let i = lo; i < hi; i++) { if (s[i] < pivot) { const t = s[store]; s[store] = s[i]; s[i] = t; store++; } }
    { const t = s[store]; s[store] = s[hi]; s[hi] = t; }
    if (store === rank) break;
    if (rank < store) hi = store - 1; else lo = store + 1;
  }
  const middle = s[rank];
  return middle === 0 ? -Infinity : 20 * Math.log10(middle);
}

function makeChannels(totalSamples, seed) {
  let st = seed >>> 0;
  const rnd = () => ((st = (Math.imul(st, 1664525) + 1013904223) >>> 0) / 4294967296);
  const ch = [];
  const per = Math.floor(totalSamples / 2);
  for (let c = 0; c < 2; c++) {
    const f = new Float32Array(per);
    for (let i = 0; i < per; i++) f[i] = Math.sin(i * 0.01) * 0.5 + (rnd() - 0.5) * 0.02;
    ch.push(f);
  }
  return ch;
}

function bench(name, fn, iterations) {
  fn(); // warmup
  const before = process.memoryUsage().heapUsed;
  const t0 = process.hrtime.bigint();
  let sink;
  for (let i = 0; i < iterations; i++) sink = fn();
  const t1 = process.hrtime.bigint();
  const after = process.memoryUsage().heapUsed;
  const ms = Number(t1 - t0) / 1e6 / iterations;
  console.log(`${name}: ${ms.toFixed(2)} ms/run result=${Number(sink).toFixed(8)} heapDelta≈${((after-before)/1e6).toFixed(1)}MB`);
  return ms;
}

for (const size of [2 ** 18, 2 ** 21, 2 ** 23]) {
  const channels = makeChannels(size, 12345);
  console.log(`\n== total samples: ${size.toLocaleString()} ==`);
  const oldMs = bench("OLD  sort-based ", () => oldMedian(channels), 10);
  const newMs = bench("NEW select-based", () => newSelectSteps(channels), 10);
  console.log(`speedup: ${(oldMs / newMs).toFixed(2)}x`);
}

console.log("\n== correctness ==");
let worstDiff = 0;
for (const size of [1000, 1001, 4096, 4097, 65536, 65535]) {
  const ch = makeChannels(size, 999);
  const a = oldMedian(ch);
  const b = newSelectSteps(ch);
  worstDiff = Math.max(worstDiff, Math.abs(a - b));
}
console.log(`max |old-new| dB across cases: ${worstDiff}`);
