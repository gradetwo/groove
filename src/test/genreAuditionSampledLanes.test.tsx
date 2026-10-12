/**
 * **A genre audition must reach a recorded lane's bytes — the criterion for the break the owner reported, and for the
 * trap in the obvious repair.**
 *
 * The owner selected a jazz style, pressed the page's own play button, and saw **not one** `sfz`, `wav` or `r2mirror`
 * request while the old synthesiser played. The instrument names are not the problem: `sax_lead` and
 * `walking_upright` both have a row in `src/data/sampledInstruments.ts`, and every one of the 92 mapped lanes across
 * the fourteen jazz genres resolves to a concrete catalogue asset with an SFZ URL and a mirror fallback. The catalogue
 * was never asked.
 *
 * ## Why the first obvious repair is wrong, and why that shapes every case here
 *
 * `AudioEngine.prepareSampledLanes` is the one call that tells an engine which lanes are recordings — and **all it does
 * is silence the synthesiser for them** (`AudioEngine.ts`, the `sampledLaneIndexes` guard in the step loop). The bytes
 * are played by a *different* call, on a path of its own:
 *
 *   · the studio's transport plays them with `playAudioLanes` (`useTransportControls` → `audioLanePlayback`);
 *   · the arrangement player plays them with `planSamplerSteps` + `scheduleSamplerSteps` (`playerFromEngine`).
 *
 * ⚠️ **The genre audition called neither.** So calling `prepareSampledLanes` there — the repair the shape of the defect
 * invites — does not produce a single request; it turns a lane that played the wrong instrument into a lane that plays
 * **nothing**. That is strictly worse than the bug, which is why the case below asserts the stand-down **and** the
 * schedule together, and why the loop and stop cases exist: a lane that sounds once and dies on the second pass is the
 * same defect wearing a different face.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { GENRES_MAP } from "../data/genres";

/**
 * The engine is doubled: the question is whether a catalogue and a sampler were handed to it, not what it sounds like.
 * `onLoopWrap` is a property the controller assigns, exactly as it does on a real engine.
 */
const { engineMock, AudioEngineCtor } = vi.hoisted(() => {
  const engineMock = {
    onLoopWrap: undefined as ((t: number) => void) | undefined,
    setOnStep: vi.fn(),
    setMetronome: vi.fn(),
    getMetronome: vi.fn(() => false),
    setPattern: vi.fn(),
    setBpm: vi.fn(),
    getBpm: vi.fn(() => 120),
    stop: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    scrubTo: vi.fn(),
    getIsPlaying: vi.fn(() => true),
    getCurrentStep: vi.fn(() => 0),
    getStepDuration: vi.fn(() => 0.125),
    setMasterVolume: vi.fn(),
    destroy: vi.fn(),
    /** The stand-down call — it silences a mapped lane's synthesiser. On its own it plays nothing. */
    prepareSampledLanes: vi.fn(() => ({ stoodDown: [], problems: [] })),
    getTrackState: vi.fn(() => undefined),
    getTrackStates: vi.fn(() => []),
    /** A live context is what the sampler places its voices on; the shape is all this criterion needs. */
    audioContext: { currentTime: 0 } as unknown as BaseAudioContext,
    musicDestination: { connect: vi.fn() } as unknown as AudioNode,
  };
  return { engineMock, AudioEngineCtor: vi.fn(() => engineMock) };
});

vi.mock("../audio/AudioEngine", () => ({ AudioEngine: AudioEngineCtor }));
vi.mock("../audio/VinylScrub", () => ({
  createVinylScrub: () => ({ applyBpm: vi.fn(), dispose: vi.fn(), scrubTo: vi.fn() }),
}));

/**
 * ⭐ **The scheduler is watched, because it is the half that makes a sound.**
 *
 * The double records each pass rather than playing anything. Its voices, the wrap re-plan and the stop are tested where
 * they belong — against the controller itself, in `src/test/samplerLanePlayback.test.ts` — because a hook-level double
 * cannot observe them without the observation becoming the thing under test.
 *
 * ⚠️ **`mockImplementation`, not `mockResolvedValue`.** `vi.clearAllMocks()` — called in `beforeEach` here — also clears
 * a mock's **return value**, so a `mockResolvedValue` is silently replaced by `undefined`-returning history before a
 * later test body runs. An implementation survives that reset.
 */
const { scheduleSamplerStepsMock } = vi.hoisted(() => {
  const scheduleSamplerStepsMock = vi.fn();
  scheduleSamplerStepsMock.mockImplementation(async () => ({
    started: 1,
    voices: [{ stop: () => undefined }],
    problems: [] as string[],
    legato: { carried: 0, refused: [], started: 0 },
  }));
  return { scheduleSamplerStepsMock };
});

vi.mock("../audio/samplerSteps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../audio/samplerSteps")>();
  return { ...actual, scheduleSamplerSteps: scheduleSamplerStepsMock };
});

/** A jazz style whose lanes the palette maps — `sax_lead` on the lead, `walking_upright` on the bass. */
const JAZZ = GENRES_MAP["bebop"] ?? GENRES_MAP["traditional-jazz"] ?? Object.values(GENRES_MAP)[0];

beforeEach(() => {
  vi.clearAllMocks();
  engineMock.onLoopWrap = undefined;
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("a genre audition asks the catalogue for its recorded lanes", () => {
  it("resolves a palette-carrying lane to a concrete asset, so an address exists to request", async () => {
    const { sampledAssetForLane } = await import("../data/sampledInstruments");
    const { catalogueFromManifestText, findSampleAsset } = await import("../data/sampleCatalogue");
    const { readFileSync } = await import("node:fs");

    /**
     * This half needs no engine: it is the statement that the lane the owner named is *mapped* and the recording is
     * *reachable*, which is what makes the missing wiring the whole of the defect rather than one of several.
     */
    const { assets } = catalogueFromManifestText(
      readFileSync("public/samples/manifest.json", "utf8"),
      "https://r2mirror.groove.wangda.today"
    );

    const lead = JAZZ.sequencer_pattern.tracks.find((track) => track.track_id === "lead");
    const bass = JAZZ.sequencer_pattern.tracks.find((track) => track.track_id === "bass");
    expect(lead?.instrument, `a mapped instrument on ${JAZZ.id}'s lead lane`).toMatch(
      /sax|trumpet|guitar|harmonica|vibraphone|piano|brass/
    );
    expect(bass?.instrument, `a mapped instrument on ${JAZZ.id}'s bass lane`).toMatch(/bass|upright/);

    for (const lane of [lead, bass]) {
      const assetId = sampledAssetForLane(lane);
      expect(assetId, `${lane?.instrument} must have a palette row`).toBeTruthy();
      const asset = findSampleAsset(assetId!, assets);
      expect(asset, `${assetId} must be in the shipped manifest`).not.toBeNull();
      // A URL the loader will fetch — source first, mirror as the fallback, both non-empty.
      expect(asset!.sfz?.url).toMatch(/\.sfz($|\?)/);
      expect(asset!.sfz?.fallbackUrl).toContain("r2mirror.groove.wangda.today");
    }
  });

  it("keeps the names recorded as synthesisers on a synth, because their row's absence is the decision", async () => {
    const { sampledInstrumentFor, SAMPLED_INSTRUMENT_SYNTHS } = await import("../data/sampledInstruments");
    const { ALL_GENRES } = await import("../data/genres");

    /**
     * The reverse assertion: this wiring must not turn a lane into a recording that the palette never mapped.
     *
     * It asks the **melodic name table** (`sampledInstrumentFor`), which is the table the synth list is about — not
     * `sampledAssetForLane`, which also consults the v2 **role** map. A drum name is deliberately the second case:
     * `punchy_kick` sits on a `kick` lane, and a kick lane is served by the drum kit through its role rather than by a
     * row for the word. Asking `sampledAssetForLane` here would have been asking the wrong table.
     */
    const synthNames = new Set(SAMPLED_INSTRUMENT_SYNTHS);
    let checked = 0;
    for (const genre of ALL_GENRES) {
      for (const track of genre.sequencer_pattern.tracks) {
        if (!synthNames.has(track.instrument)) continue;
        checked += 1;
        expect(
          sampledInstrumentFor(track.instrument),
          `${track.instrument} is a synthesiser by definition and must have no palette row`
        ).toBeUndefined();
      }
    }
    expect(checked, "the genre data really does carry synthesiser-by-definition names").toBeGreaterThan(0);

    // …and the palette's own rows are the only melodic names that resolve, so the two lists cannot both claim a name.
    for (const name of synthNames) {
      expect(sampledInstrumentFor(name), `${name} appears in both lists`).toBeUndefined();
    }
  });

  it("reports, rather than silently emptying, when the catalogue serves none of its lanes", async () => {
    const { sampledInstrumentProblems, reportSampledLaneProblems } = await import("../audio/sampledLanes");

    // The unconfigured-mirror case: these are the sentences a user would otherwise never see.
    const problems = sampledInstrumentProblems(JAZZ.sequencer_pattern, []);
    expect(problems.length).toBeGreaterThan(0);
    const reported = reportSampledLaneProblems(problems, () => undefined);
    expect(reported[0]).toContain("[sampled-instrument]");
    expect(reported.join(" ")).toMatch(/VITE_SAMPLE_ROOT|mirror/);
  });

  it("⭐ stands the synthesiser down AND schedules the lane from its samples", async () => {
    const { useGenreAudition } = await import("../hooks/useGenreAudition");
    const { result } = renderHook(() => useGenreAudition());

    await act(async () => {
      await result.current.toggleAudition(JAZZ);
    });

    // ① The engine was told which lanes are recordings…
    expect(
      engineMock.prepareSampledLanes,
      "the audition's engine was never told which lanes are recordings"
    ).toHaveBeenCalled();
    // ② …and the lane is actually sounded from its bytes rather than left silent by ①.
    expect(
      scheduleSamplerStepsMock,
      "the lane was stood down from the synthesiser and nothing scheduled it from its samples, so it plays nothing at all"
    ).toHaveBeenCalled();
  });

  it("⭐ re-plans on every loop wrap, or the lane dies on the second pass", async () => {
    const { useGenreAudition } = await import("../hooks/useGenreAudition");
    const { result } = renderHook(() => useGenreAudition());

    await act(async () => {
      await result.current.toggleAudition(JAZZ);
    });
    expect(engineMock.onLoopWrap, "the controller installs a wrap handler on the engine").toBeTypeOf("function");
    const passesAfterFirst = scheduleSamplerStepsMock.mock.calls.length;

    await act(async () => {
      engineMock.onLoopWrap?.(12.5);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      scheduleSamplerStepsMock.mock.calls.length,
      "a loop wrap must re-plan the pass, or the sampler sounds once while the engine's own lanes keep looping"
    ).toBeGreaterThan(passesAfterFirst);
  });

});
