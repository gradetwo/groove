/**
 * **The recorded-lane controller: it sounds the bytes, keeps them sounding across a wrap, and silences them on stop.**
 *
 * `src/audio/samplerLanePlayback.ts` is the one entry point the genre audition and the custom-genre preview share. It
 * exists because a recorded lane needs **two** things and they live on different paths: `prepareSampledLanes` stands the
 * synthesiser down (and plays nothing), while the bytes come from `scheduleSamplerSteps`. A caller that did only the
 * first turned a lane that played the wrong instrument into a lane that played **nothing** — so this file tests the
 * controller on its own terms, with an injected loader, where "was a voice placed, kept and stopped" is directly
 * observable.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSamplerLanePlayback, samplerLanesOf, audibleSamplerLanesOf } from "../audio/samplerLanePlayback";
import { GENRES_MAP } from "../data/genres";
import type { SampleAsset } from "../data/sampleCatalogue";
import type { SequencerPattern } from "../types/genre";

/** A jazz pattern whose lanes the palette maps — the case the owner reported. */
const JAZZ = GENRES_MAP["bebop"] ?? GENRES_MAP["traditional-jazz"] ?? Object.values(GENRES_MAP)[0];
const PATTERN = JAZZ.sequencer_pattern as unknown as SequencerPattern;

/** The catalogue the lanes resolve against; the controller never reads further than this in these cases. */
const CATALOGUE: readonly SampleAsset[] = [{ assetId: "x", name: "x", kind: "one-shot", seconds: 1, sfz: { url: "/x.sfz" } }] as unknown as readonly SampleAsset[];

/**
 * ⚠️ **`mockImplementation`, not `mockResolvedValue`.** `vi.clearAllMocks()` clears a mock's *return value* as well as
 * its history, so a `mockResolvedValue` is silently replaced by `undefined` before a later test body runs — and an
 * implementation survives that reset.
 */
const { scheduleSamplerStepsMock, shared } = vi.hoisted(() => {
  const g = globalThis as unknown as { __samplerStops?: number };
  g.__samplerStops = 0;
  const shared = g as { __samplerStops: number };
  const scheduleSamplerStepsMock = vi.fn();
  scheduleSamplerStepsMock.mockImplementation(async () => ({
    started: 1,
    voices: [
      {
        stop: () => {
          (globalThis as unknown as { __samplerStops: number }).__samplerStops += 1;
        },
      },
    ],
    problems: [] as string[],
    legato: { carried: 0, refused: [], started: 0 },
  }));
  return { scheduleSamplerStepsMock, shared };
});

vi.mock("../audio/samplerSteps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../audio/samplerSteps")>();
  return { ...actual, scheduleSamplerSteps: scheduleSamplerStepsMock };
});

/** An engine-shaped object: a live clock, a destination, and a wrap handler the controller owns. */
function makeEngine(over: { noWrap?: boolean } = {}) {
  return {
    onLoopWrap: undefined as ((t: number) => void) | undefined,
    audioContext: { currentTime: 100 } as unknown as BaseAudioContext,
    musicDestination: {} as unknown as AudioNode,
    getTrackState: vi.fn(() => undefined),
    getTrackStates: vi.fn(() => []),
    ...(over.noWrap ? {} : {}),
  };
}

/** A loader the controller will use instead of building one from a real audio graph. */
const stubLoader = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  shared.__samplerStops = 0;
});

describe("the recorded-lane controller", () => {
  it("finds the pattern's mapped lanes through the one resolver", () => {
    const lanes = samplerLanesOf(PATTERN);
    expect(lanes.length).toBeGreaterThan(0);
    // Every lane it returns is one the palette maps, and the source id is the lane's own track id.
    expect(lanes.every((entry) => entry.sourceTrackId.length > 0)).toBe(true);
  });

  it("asks the engine for its lane states *on* the engine, because the real getter reads `this`", async () => {
    /**
     * ⚠️ **A regression test for a bug this suite's own double hid.** `AudioEngine.getTrackState` reads
     * `this.trackStates`, so a controller that detaches the method (passing `engine.getTrackState` as a bare function)
     * throws when it is called. The first double returned `undefined` from a closure and therefore never noticed; the
     * browser did — the recorded lane silently never sounded, which is the defect this module exists to remove.
     *
     * This double answers **through `this`** and records the receiver, so a detached call fails here.
     */
    const receivers: unknown[] = [];
    const engine = {
      onLoopWrap: undefined as ((t: number) => void) | undefined,
      audioContext: { currentTime: 0 } as unknown as BaseAudioContext,
      musicDestination: {} as unknown as AudioNode,
      trackStates: [] as unknown[],
      getTrackState(this: { trackStates: unknown[] }, index: number) {
        receivers.push(this);
        return this.trackStates[index] as { mute?: boolean } | undefined;
      },
      getTrackStates(this: { trackStates: unknown[] }) {
        receivers.push(this);
        return this.trackStates;
      },
    };

    const playback = createSamplerLanePlayback({
      engine: engine as never,
      pattern: PATTERN,
      catalogue: CATALOGUE,
      bpm: 120,
      loader: stubLoader,
    });
    await playback.play(120);

    expect(receivers.length, "the lane states were asked for").toBeGreaterThan(0);
    expect(
      receivers.every((receiver) => receiver === engine),
      "the getter was called on the engine, not detached from it"
    ).toBe(true);
    playback.stop();
  });

  it("leaves a muted lane out, so Drums Only does not sound the bass", () => {
    const audible = audibleSamplerLanesOf(
      PATTERN,
      (index) => (index < 4 ? { mute: false } : { mute: true }),
      () => PATTERN.tracks.map((_, index) => (index < 4 ? { mute: false } : { mute: true }))
    );
    const all = samplerLanesOf(PATTERN);
    expect(all.length, "the pattern has recorded lanes beyond the first four").toBeGreaterThan(audible.length);
  });

  it("⭐⭐ places a pass and silences every voice on stop", async () => {
    const engine = makeEngine();
    const playback = createSamplerLanePlayback({ engine, pattern: PATTERN, catalogue: CATALOGUE, bpm: 120, loader: stubLoader });

    await playback.play(120);
    expect(scheduleSamplerStepsMock, "the lane must be scheduled from its samples").toHaveBeenCalled();
    expect(playback.sounding, "the pass placed voices").toBeGreaterThan(0);

    const stopped = playback.stop();
    expect(stopped, "stop reports what it silenced").toBeGreaterThan(0);
    expect(shared.__samplerStops, "the voices were actually stopped, not just forgotten").toBeGreaterThan(0);
    expect(playback.sounding, "nothing is still owned").toBe(0);
    expect(engine.onLoopWrap, "a stopped lane must not plan a pass nobody will hear").toBeUndefined();
  });

  it("⭐ re-plans on the transport's wrap, so a looping lane is not silent on the second pass", async () => {
    const engine = makeEngine();
    const playback = createSamplerLanePlayback({ engine, pattern: PATTERN, catalogue: CATALOGUE, bpm: 120, loader: stubLoader });
    await playback.play(120);

    const afterFirst = scheduleSamplerStepsMock.mock.calls.length;
    expect(engine.onLoopWrap, "the controller takes the wrap handler while it runs").toBeTypeOf("function");

    engine.onLoopWrap?.(42);
    await Promise.resolve();
    await Promise.resolve();
    expect(scheduleSamplerStepsMock.mock.calls.length, "a wrap plans the next pass").toBeGreaterThan(afterFirst);
    // The wrap time comes from the transport, and it is what places the pass on the grid.
    expect(scheduleSamplerStepsMock.mock.calls.at(-1)?.[1]).toMatchObject({ startSeconds: 42 });

    playback.stop();
  });

  it("⭐ puts the wrap handler back on stop, rather than clobbering its owner", async () => {
    const engine = makeEngine();
    const owner = vi.fn();
    engine.onLoopWrap = owner;
    const playback = createSamplerLanePlayback({ engine, pattern: PATTERN, catalogue: CATALOGUE, bpm: 120, loader: stubLoader });
    await playback.play(120);
    expect(engine.onLoopWrap).not.toBe(owner);

    playback.stop();
    expect(engine.onLoopWrap, "a stop restores whatever owned the handler before").toBe(owner);
  });

  it("says so instead of scheduling into an engine with no context", async () => {
    const warn = vi.fn();
    const engine = { ...makeEngine(), audioContext: null };
    const playback = createSamplerLanePlayback({ engine, pattern: PATTERN, catalogue: CATALOGUE, bpm: 120, loader: stubLoader, warn });

    await playback.play(120);
    expect(scheduleSamplerStepsMock).not.toHaveBeenCalled();
    expect(warn.mock.calls.join(" "), "an engine that is not ready is a reported reason, not silence").toMatch(/not ready/);
  });

  it("does nothing at all for a pattern with no recorded lane", async () => {
    const engine = makeEngine();
    const synthOnly = { ...PATTERN, tracks: PATTERN.tracks.filter((track) => !samplerLanesOf({ tracks: [track] }).length) };
    const playback = createSamplerLanePlayback({ engine, pattern: synthOnly as SequencerPattern, catalogue: CATALOGUE, bpm: 120, loader: stubLoader });

    await playback.play(120);
    expect(scheduleSamplerStepsMock).not.toHaveBeenCalled();
    expect(playback.sounding).toBe(0);
  });
});
