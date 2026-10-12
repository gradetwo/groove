/**
 * Pressing a key on a sampler track in a v2 arrangement.
 *
 * This is the end-to-end form of the owner's request — "I cannot test audio samplers" — and the gap it names was real: the loader resolved a note to a sample **and a rate** with nine criteria behind it, and nothing in the application called it, so a
 * sampler track could be created, given an instrument, compiled and scheduled without ever sounding at the note that was played.
 */
import { describe, expect, it, vi } from "vitest";
import { createArrangementPlayer } from "../audio/playerFromEngine";
import { FakeAudioBuffer, FakeAudioContext } from "./helpers/fakeAudio";
import type { SampleAsset } from "../data/sampleCatalogue";

const SFZ = "<region> sample=low.wav lokey=0 hikey=59 pitch_keycenter=40\n<region> sample=high.wav lokey=60 hikey=127 pitch_keycenter=72\n";
const ASSETS: SampleAsset[] = [
  { assetId: "piano", name: "Piano", kind: "one-shot", seconds: 1, sfz: { url: "/samples/piano.sfz", path: "piano.sfz" } },
  { assetId: "low.wav", name: "low", kind: "one-shot", seconds: 1, url: "/samples/low.wav" },
  { assetId: "high.wav", name: "high", kind: "one-shot", seconds: 1, url: "/samples/high.wav" },
];

function playerWith(context: FakeAudioContext) {
  return createArrangementPlayer({
    engine: { audioContext: context as never, musicDestination: context.createGain() as never },
    loadCatalogue: async () => ({ assets: ASSETS }),
    // The two I/O seams only: replacing the loader would replace the thing being judged.
    decode: async () => new FakeAudioBuffer(1, 48000, 48000) as unknown as AudioBuffer,
    fetchSfzText: async () => SFZ,
  });
}

describe("auditioning a note on a sampler track", () => {
  it("resolves the note through the instrument and sounds it at that note's rate", async () => {
    const context = new FakeAudioContext();
    const player = playerWith(context);
    const result = await player.audition!({ assetId: "piano", midi: 72, trackId: "sampler-1" });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    // Note 72 is the high region's own key centre, so the recording plays as recorded: a rate of 1 and the file the region named.
    expect(result.ratio).toBe(1);
    expect(result.samplePath).toBe("high.wav");
    expect(context.createdBufferSources).toHaveLength(1);
    expect(context.createdBufferSources[0]!.playbackRate.value).toBe(1);
  });

  it("transposes when the note is not the region's own centre", async () => {
    const context = new FakeAudioContext();
    const player = playerWith(context);
    // Note 60 is answered by the high region (root 72): an octave below it, so half rate.
    const result = await player.audition!({ assetId: "piano", midi: 60, trackId: "sampler-1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.samplePath).toBe("high.wav");
    expect(result.ratio).toBeCloseTo(0.5, 6);
    expect(context.createdBufferSources[0]!.playbackRate.value).toBeCloseTo(0.5, 6);
  });

  it("stops the voices a key started when the key is released, and only that key's", async () => {
    const context = new FakeAudioContext();
    const player = playerWith(context);
    await player.audition!({ assetId: "piano", midi: 72, trackId: "sampler-1" });
    await player.audition!({ assetId: "piano", midi: 60, trackId: "sampler-1" });
    expect(player.releaseNote!({ midi: 72, trackId: "sampler-1" })).toBe(1);
    // The other note's voice is untouched: a release names one key, not the instrument.
    expect(context.createdBufferSources[0]!.stopCalls).toHaveLength(1);
    expect(context.createdBufferSources[1]!.stopCalls).toHaveLength(0);
    // Releasing a key that started nothing is not an error, and reports zero.
    expect(player.releaseNote!({ midi: 40, trackId: "sampler-1" })).toBe(0);
  });

  it("reports a missing engine and a refused note instead of throwing at a key handler", async () => {
    const cold = createArrangementPlayer({
      engine: { audioContext: null, musicDestination: null },
      loadCatalogue: async () => ({ assets: ASSETS }),
    });
    const noEngine = await cold.audition!({ assetId: "piano", midi: 60 });
    expect(noEngine.ok).toBe(false);
    expect(noEngine.ok === false && noEngine.reason).toMatch(/not ready/);

    const context = new FakeAudioContext();
    const player = playerWith(context);
    // An id the catalogue does not hold: the loader's own refusal, passed through rather than swallowed.
    const unknown = await player.audition!({ assetId: "nope", midi: 60 });
    expect(unknown.ok).toBe(false);
    expect(unknown.ok === false && unknown.reason).toMatch(/no sample/);
  });
});

/**
 * **A key press has to start the audio context, and a failure has to say so.**
 *
 * The owner's report: pressing keys on the arrangement made no sound, the audio-start prompt never appeared, and there was nothing in diagnostics to look at. Both halves were real, and they are the two criteria below.
 *
 * The gate that resumes the context shows **once** (it is remembered in `localStorage`), so on every later visit there is no gesture in the session and the browser keeps the context suspended. `play()` resumes it on its own path; **auditioning never did**, so a key press was silent — and the caller discarded the result, so it was silent *with no message*.
 */
describe("a suspended audio context", () => {
  it("is resumed by the key press, because that is where the gesture is", async () => {
    const context = new FakeAudioContext();
    context.state = "suspended";
    const player = playerWith(context);
    const result = await player.audition!({ assetId: "piano", midi: 40 });
    expect(context.state).toBe("running");
    expect(result.ok).toBe(true);
    // And a voice actually started, so "resumed" is not the whole claim.
    expect(context.createdBufferSources.length).toBe(1);
  });

  it("says why when the browser still refuses, instead of sounding nothing", async () => {
    // ⭐ The half that made this impossible to diagnose: a refusal must travel back as a reason.
    const context = new FakeAudioContext();
    context.state = "suspended";
    context.resume = async () => {
      // A browser that does not allow it leaves the context exactly where it was.
    };
    const player = playerWith(context);
    const result = await player.audition!({ assetId: "piano", midi: 40 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("audio");
    // Nothing was started, so a refused note is not a note playing silently.
    expect(context.createdBufferSources.length).toBe(0);
  });

  it("leaves a running context alone", async () => {
    const context = new FakeAudioContext();
    let resumptions = 0;
    const original = context.resume.bind(context);
    context.resume = async () => {
      resumptions += 1;
      original();
    };
    const player = playerWith(context);
    expect((await player.audition!({ assetId: "piano", midi: 40 })).ok).toBe(true);
    expect(resumptions, "a running context was resumed anyway").toBe(0);
  });
});
