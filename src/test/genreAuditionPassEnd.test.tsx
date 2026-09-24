import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGenreAudition } from "../hooks/useGenreAudition";
import { GENRES_MAP } from "../data/genres";

/**
 * The phone's report, reproduced: **随机播放会连续切歌，而不是等待播放完毕**.
 *
 * "Shuffle keeps switching tracks instead of waiting for the current one to finish." The mode itself was wired
 * (the shell installs an advance handler), so the defect had to be in *when* the hook says a pass has ended.
 *
 * A genre's pattern is a progression — 64 or 128 steps for most of the library — and the engine reports the step
 * index modulo that length. Its reset to 0 is the pass boundary, and it is also what happens the instant a
 * *different* pattern is loaded: `setPattern` starts the new pattern at step 0 while the hook's "last observed
 * step" still holds the old pattern's. So the swap looked like a wrap, the shell asked for the next genre, that
 * swap looked like a wrap, and the queue ran away — one genre per step, which is what "连续切歌" is.
 *
 * The fix is that a wrap must be a *real* one: the previous step has to be the last step the pattern can report.
 * These cases drive the hook's own callback with the step sequences the engine produces, which is the only place
 * the distinction can be seen.
 */
const { engineMock, AudioEngineCtor, stepHandler } = vi.hoisted(() => {
  const stepHandler: { current: ((info: { step: number; time: number }) => void) | null } = { current: null };
  const engineMock = {
    setOnStep: vi.fn((cb: (info: { step: number; time: number }) => void) => {
      stepHandler.current = cb;
    }),
    setMetronome: vi.fn(),
    getMetronome: vi.fn(() => false),
    setPattern: vi.fn(),
    setBpm: vi.fn(),
    stop: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    scrubTo: vi.fn(),
    getIsPlaying: vi.fn(() => true),
    setMasterVolume: vi.fn(),
  };
  return { engineMock, AudioEngineCtor: vi.fn(() => engineMock), stepHandler };
});

vi.mock("../audio/AudioEngine", () => ({ AudioEngine: AudioEngineCtor }));
vi.mock("../audio/VinylScrub", () => ({
  createVinylScrub: () => ({ applyBpm: vi.fn(), dispose: vi.fn(), scrubTo: vi.fn() }),
}));

const genre = (id: string) => GENRES_MAP[id] ?? Object.values(GENRES_MAP)[0];

/** How many steps the genre's own pattern reports — the wrap point the hook has to know. */
async function patternSteps(id: string): Promise<number> {
  const { patternFromGenre } = await import("../data/genreMix");
  const pattern = patternFromGenre(genre(id));
  return pattern.totalSteps || Math.max(...pattern.tracks.map((track) => track.steps.length));
}

describe("genre audition · a pass ends once, at the end of the pattern", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stepHandler.current = null;
  });

  it("does not call a pattern swap a pass end", async () => {
    const onPatternEnd = vi.fn();
    const { result } = renderHook(() => useGenreAudition({ onPatternEnd }));

    await act(async () => {
      await result.current.toggleAudition(genre("chicago-house"));
    });
    expect(stepHandler.current, "the engine's step callback is wired").toBeTypeOf("function");

    // The old pattern was mid-pass when the swap happened…
    await act(async () => stepHandler.current?.({ step: 12, time: 0 }));
    expect(onPatternEnd).not.toHaveBeenCalled();

    // …and the new pattern starts at step 0. That is a swap, not a wrap.
    await act(async () => stepHandler.current?.({ step: 0, time: 0 }));
    expect(onPatternEnd).not.toHaveBeenCalled();

    // Same for a reload of the *same* genre (the skip button, the list): the transport restarts at 0.
    await act(async () => {
      await result.current.toggleAudition(genre("chicago-house"));
      await result.current.toggleAudition(genre("chicago-house"));
    });
    await act(async () => stepHandler.current?.({ step: 0, time: 0 }));
    expect(onPatternEnd).not.toHaveBeenCalled();
  });

  it("fires once when the pattern really wraps", async () => {
    const onPatternEnd = vi.fn();
    const { result } = renderHook(() => useGenreAudition({ onPatternEnd }));
    await act(async () => {
      await result.current.toggleAudition(genre("chicago-house"));
    });
    const total = await patternSteps("chicago-house");

    // Walk the pattern into its last step, then wrap: that is one completed pass.
    await act(async () => stepHandler.current?.({ step: total - 2, time: 0 }));
    await act(async () => stepHandler.current?.({ step: total - 1, time: 0 }));
    expect(onPatternEnd).not.toHaveBeenCalled();
    await act(async () => stepHandler.current?.({ step: 0, time: 0 }));
    expect(onPatternEnd).toHaveBeenCalledTimes(1);
    expect(onPatternEnd).toHaveBeenCalledWith("chicago-house");

    // Steps in the middle of the next pass are not pass ends…
    await act(async () => stepHandler.current?.({ step: 5, time: 0 }));
    expect(onPatternEnd).toHaveBeenCalledTimes(1);

    // …and the next genuine wrap is the second pass.
    act(() => stepHandler.current?.({ step: total - 1, time: 0 }));
    await act(async () => stepHandler.current?.({ step: 0, time: 0 }));
    expect(onPatternEnd).toHaveBeenCalledTimes(2);
  });

  it("does not advance while a mode-agnostic surface plays a second genre", async () => {
    // Two genres in a row, each finishing a pass: the second one's swap must not add a third advance.
    const onPatternEnd = vi.fn();
    const { result } = renderHook(() => useGenreAudition({ onPatternEnd }));
    await act(async () => {
      await result.current.toggleAudition(genre("chicago-house"));
    });
    const first = await patternSteps("chicago-house");
    act(() => stepHandler.current?.({ step: first - 1, time: 0 }));
    await act(async () => stepHandler.current?.({ step: 0, time: 0 }));
    expect(onPatternEnd).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.toggleAudition(genre("deep-house"));
    });
    await act(async () => stepHandler.current?.({ step: 0, time: 0 }));
    expect(onPatternEnd, "the swap after an advance is not a second advance").toHaveBeenCalledTimes(1);
  });
});

/**
 * …and a "track" has to be long enough to be one.
 *
 * Measured before this: a genre's own pattern is 32–128 steps — a **4–16 second** pass at 120 BPM — so even with the
 * wrap detection fixed, shuffle switched every few seconds, which is the other half of 连续切歌. `arrangement` makes
 * the audition a **song**: the same 40-bar form the exporters write and the studio plays, so the phone hears what the
 * file contains and the pass end becomes the end of the track.
 */
describe("genre audition · a track is a song, not one pass of the loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stepHandler.current = null;
  });

  it("hands the engine the arrangement, many times the loop's length", async () => {
    const { result } = renderHook(() => useGenreAudition({ arrangement: "club" }));
    await act(async () => {
      await result.current.toggleAudition(genre("chicago-house"));
    });
    const played = engineMock.setPattern.mock.calls.at(-1)![0] as {
      totalSteps?: number;
      tracks: { steps: unknown[] }[];
    };
    const loopSteps = await patternSteps("chicago-house");
    const songSteps = played.totalSteps || Math.max(0, ...played.tracks.map((t) => t.steps.length));
    // The club form is 40 bars; an eight-bar genre therefore plays five times its loop before the track ends.
    expect(songSteps).toBeGreaterThan(loopSteps * 4);
  });

  it("ends the track at the end of the song, not at the end of every pass", async () => {
    const onPatternEnd = vi.fn();
    const { result } = renderHook(() => useGenreAudition({ arrangement: "club", onPatternEnd }));
    await act(async () => {
      await result.current.toggleAudition(genre("chicago-house"));
    });
    const played = engineMock.setPattern.mock.calls.at(-1)![0] as { totalSteps?: number };
    const songSteps = played.totalSteps!;

    // The loop's own wrap point (one pass in) is *not* the end of the track…
    await act(async () => stepHandler.current?.({ step: (await patternSteps("chicago-house")) - 1, time: 0 }));
    await act(async () => stepHandler.current?.({ step: 0, time: 0 }));
    expect(onPatternEnd, "a loop pass is not a track").not.toHaveBeenCalled();

    // …the song's end is.
    await act(async () => stepHandler.current?.({ step: songSteps - 1, time: 0 }));
    await act(async () => stepHandler.current?.({ step: 0, time: 0 }));
    expect(onPatternEnd).toHaveBeenCalledTimes(1);
  });
});
