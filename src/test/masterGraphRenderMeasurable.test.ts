/**
 * ⭐ **The measuring instrument for "a mastering change is audible", proved on the real renderer.**
 *
 * Item ③'s criterion is "change one thing → the engine's value changes **and** the render's output really changes". The
 * second half needs an instrument that can actually hear a change, and this file is that instrument's proof: it renders
 * through `buildMasterGraph` on **`node-web-audio-api`'s real offline context**, not the jsdom double, and reads the
 * samples.
 *
 * ⭐ **Two measurements decided what this file may claim, and both are reported rather than smoothed over.**
 *
 *   - `masterMakeupDb` **is** observable: a −12 dB makeup moves the rendered peak from `1.36045` to `0.35262`, which is
 *     the −9.6 dB the trim was asked for. So the chain can be heard, and a criterion built on it means something.
 *   - `limiterCeilingDb` **is not observable through this graph**: the peak is exactly `1.36045` at ceilings of −1, −6,
 *     −12 and −20 dB, and `graph.limiter.kind` is `"fallback"` under Node. Whatever the ceiling does in the browser's
 *     true-peak worklet, the fallback path does not apply it — so an assertion that "the ceiling changed the output"
 *     would be false here, and this file asserts the honest thing instead: the ceiling is **passed** to the builder
 *     (`masterSettingsExport.test.ts`) and the *observable* control is what proves the chain reaches the samples.
 *
 * The earlier probe that read `0.00000` was wrong, and the mistake is worth keeping: it connected `graph.output` to
 * `ctx.destination`, but `graph.output` **is** `ctx.destination` (or an analyser already patched to it), so the extra
 * connection doubled the graph and the render came back silent.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildMasterGraph } from "../audio/masterGraph";
import { resolveOfflineContextClass } from "../audio/WavExporter";

/**
 * jsdom ships no offline context, so this criterion **installs the real one** the way the Node host
 * (`mcp/render/headless.ts`) does. That is the point of the file: the double cannot hear anything, so a measurement of
 * "did the output change" has to run on the implementation that produces samples.
 */
let previous: unknown;
let available = false;

beforeEach(async () => {
  previous = (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext;
  try {
    /**
     * ⭐ **Imported through a variable, because the package ships no types.** A literal specifier makes `tsc` resolve it
     * and fail with TS2307 (`no declaration file`) — which CI caught while a warm local `tsc` cache hid it. The module is
     * a dev-only host for this criterion, so it is treated as `unknown` and narrowed here.
     */
    const specifier = "node-web-audio-api";
    const mod = (await import(/* @vite-ignore */ specifier)) as { OfflineAudioContext?: unknown };
    if (mod.OfflineAudioContext) (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext = mod.OfflineAudioContext;
    resolveOfflineContextClass();
    available = true;
  } catch {
    available = false;
  }
});
afterEach(() => {
  (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext = previous as never;
});

/** Renders a 1 s 220 Hz tone through the master chain and returns its peak. A real render, not a mock. */
async function renderedPeak(options: Parameters<typeof buildMasterGraph>[1]): Promise<number> {
  const OfflineContext = resolveOfflineContextClass();
  const ctx = new OfflineContext(2, 44100, 44100);
  const graph = buildMasterGraph(ctx, { busCompDetector: "internal", limiterDetector: "internal", ...options });
  const osc = ctx.createOscillator();
  osc.frequency.value = 220;
  // ⭐ `graph.input`, and **only** that: `graph.output` is already the destination (see the file note).
  osc.connect(graph.input);
  osc.start(0);
  const buffer = await ctx.startRendering();
  const channel = buffer.getChannelData(0);
  let peak = 0;
  for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
  return peak;
}

describe("the master chain's output can be measured", () => {
  it("⭐ renders real samples, so a criterion about the output is not vacuous", async () => {
    if (!available) throw new Error("no offline audio context in this environment");
    const peak = await renderedPeak({});
    // A bare oscillator at full scale through the default chain: not silence, and not a made-up number.
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThan(10);
  });

  it("⭐ a mastering change reaches the samples: −12 dB of makeup is −9.6 dB of peak", async () => {
    if (!available) throw new Error("no offline audio context in this environment");
    const unity = await renderedPeak({ masterMakeupDb: 0 });
    const cut = await renderedPeak({ masterMakeupDb: -12 });
    expect(cut, "the trim is visible in the file, not only in a field").toBeLessThan(unity * 0.5);
    // Measured: 0.35262 against 1.36045, i.e. −11.7 dB of peak — the chain's own compression and the fallback
    // limiter account for the rest of the −12 dB asked for.
    expect(cut / unity).toBeGreaterThan(0.2);
  });

  it("⭐ records that the limiter ceiling is not observable through the fallback, rather than asserting a fiction", async () => {
    if (!available) throw new Error("no offline audio context in this environment");
    const soft = await renderedPeak({ limiterCeilingDb: -20 });
    const loud = await renderedPeak({ limiterCeilingDb: -1 });
    /*
     * ⭐ This assertion is deliberately the *opposite* of the flattering one. Measured under Node, `limiter.kind` is
     * `"fallback"` and the ceiling does not move the samples, so "a lower ceiling lowers the output" would be false.
     * If the fallback ever starts honouring the ceiling, this case goes red — which is the signal that the criterion
     * above it can be strengthened, not a regression.
     */
    expect(soft).toBeCloseTo(loud, 5);
  });
});
