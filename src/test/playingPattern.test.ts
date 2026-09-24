import { describe, it, expect } from "vitest";
import { playingPattern } from "../features/sequencer/hooks/useAudioEngineLifecycle";
import { clipSteps } from "../data/songFlatten";
import * as songFlatten from "../data/songFlatten";
import type { SequencerAction, SequencerState } from "../features/sequencer/useSequencerStore";
import type { SequencerPattern } from "../types/genre";

/** The fixture shape `songRender.test.ts` uses: two lanes, a known length. */
const track = (id: string, steps: number) => ({
  track_id: id,
  name: id,
  steps: Array.from({ length: steps }, (_, i) => (i % 4 === 0 ? 100 : 0)),
  velocity: Array.from({ length: steps }, () => 100),
  probability: Array.from({ length: steps }, () => 1),
});
const pattern = {
  genre_id: "chicago-house",
  bpm: 124,
  swing: 0,
  scale: "C minor",
  totalSteps: 16,
  tracks: [track("kick", 16), track("hihat", 16)],
} as unknown as SequencerPattern;

/**
 * B7's one decision, tested where it lives.
 *
 * It was written inside the console panel, and the live-arrangement probe found what that cost: the console is only
 * mounted when the user opens it, so the studio's transport played the loop while the arrangement was on screen. The
 * decision moved to `playingPattern`, which every surface with an engine already uses — and this is its contract,
 * because a helper that only ever runs inside a probe is a helper nobody tests.
 */
const state = (overrides: Partial<SequencerState>): SequencerState =>
  ({
    songMode: false,
    activeSlot: "A" as const,
    patterns: { A: pattern, B: pattern },
    sections: [],
    currentGenre: { id: "chicago-house" } as never,
    bpm: 124,
    swing: 0,
    resolution: "1/16" as const,
    loopRange: null,
    ...overrides,
  }) as SequencerState;

describe("B7 · what the transport plays", () => {
  it("hands back the loop when there is no arrangement", () => {
    expect(playingPattern(state({ songMode: true, sections: [] }), pattern)).toBe(pattern);
    expect(playingPattern(state({ songMode: false }), pattern)).toBe(pattern);
  });

  it("hands back the flattened song when there is one", () => {
    const played = playingPattern(
      state({
        songMode: true,
        sections: [
          { id: "s1", slot: "A", bars: 2 },
          { id: "s2", slot: "A", bars: 1 },
        ] as never,
      }),
      pattern
    );
    expect(clipSteps(played)).toBe(clipSteps(pattern) * 3);
  });

  it("gives the exporters and the transport the same answer", () => {
    const sections = [
      { id: "s1", slot: "A", bars: 2 },
      { id: "s2", slot: "A", bars: 1 },
    ] as never;
    const forPlayback = playingPattern(state({ songMode: true, sections }), pattern);
    // The same inputs through the function the exporters call.
    const { patternForExport } = songFlatten;
    const forExport = patternForExport({
      songMode: true,
      activeSlot: "A",
      patterns: { A: pattern, B: pattern },
      current: pattern,
      sections,
      genreId: "chicago-house",
      bpm: 124,
      swing: 0,
      resolution: "1/16",
      loopRange: null,
    });
    expect(clipSteps(forPlayback)).toBe(clipSteps(forExport.pattern));
  });
});
