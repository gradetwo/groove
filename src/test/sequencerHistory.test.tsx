import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSequencerStore, clonePattern } from "../features/sequencer/useSequencerStore";
import { GENRES_MAP } from "../data/genres";
import { DEFAULT_FX_STATE } from "../audio/EffectsRack";

/**
 * F-04: hook-level coverage for the undo/redo contract.
 *
 * The pure reducer was already covered, but every bug reported in review lived in
 * the hook layer: stale-closure snapshots, duplicate history entries from several
 * commits in one tick, and a `canUndo`/`canRedo` flag that never re-rendered.
 */
const genre = GENRES_MAP["chicago-house"] ?? Object.values(GENRES_MAP)[0];

describe("useSequencerStore history (F-04)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts with an empty history and disabled undo/redo", () => {
    const { result } = renderHook(() => useSequencerStore(genre));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("records exactly one history entry when several commits happen in one tick", () => {
    const { result } = renderHook(() => useSequencerStore(genre));
    const initialBpm = result.current.state.bpm;

    act(() => {
      result.current.commit({ type: "SET_BPM", bpm: 111 });
      result.current.commit({ type: "SET_SWING", swing: 22 });
      result.current.commit({ type: "SET_BPM", bpm: 133 });
    });
    expect(result.current.state.bpm).toBe(133);

    // One gesture -> one undo step: the first undo must restore the pre-tick tempo,
    // not an intermediate value from inside the same tick.
    act(() => {
      result.current.undo();
    });
    expect(result.current.state.bpm).toBe(initialBpm);
    expect(result.current.canUndo).toBe(false);
  });

  it("updates canUndo/canRedo reactively", () => {
    const { result } = renderHook(() => useSequencerStore(genre));
    expect(result.current.canUndo).toBe(false);

    act(() => {
      result.current.commit({ type: "SET_BPM", bpm: 140 });
    });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    act(() => {
      result.current.undo();
    });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.redo();
    });
    expect(result.current.state.bpm).toBe(140);
    expect(result.current.canRedo).toBe(false);
  });

  it("undoes transport settings instead of silently consuming a history entry", () => {
    const { result } = renderHook(() => useSequencerStore(genre));

    act(() => {
      result.current.commit({ type: "SET_LOOP_RANGE", range: [4, 12] });
    });
    expect(result.current.state.loopRange).toEqual([4, 12]);

    act(() => {
      result.current.commit({ type: "SET_METRONOME", enabled: true });
    });
    expect(result.current.state.isMetronome).toBe(true);

    act(() => {
      result.current.undo();
    });
    expect(result.current.state.isMetronome).toBe(false);
    expect(result.current.state.loopRange).toEqual([4, 12]);

    act(() => {
      result.current.undo();
    });
    expect(result.current.state.loopRange).toBeNull();
  });

  it("does not leave a no-op undo entry when only one commit happens per tick", () => {
    const { result } = renderHook(() => useSequencerStore(genre));
    const initialBpm = result.current.state.bpm;
    const initialSwing = result.current.state.swing;

    act(() => {
      result.current.commit({ type: "SET_BPM", bpm: 90 });
    });
    act(() => {
      result.current.commit({ type: "SET_SWING", swing: 10 });
    });

    act(() => {
      result.current.undo(); // undoes swing only
    });
    expect(result.current.state.swing).toBe(initialSwing);
    expect(result.current.state.bpm).toBe(90);

    act(() => {
      result.current.undo(); // undoes bpm only
    });
    expect(result.current.state.bpm).toBe(initialBpm);
    expect(result.current.state.swing).toBe(initialSwing);
  });

  it("invalidateRedo drops the redo stack after out-of-band changes", () => {
    const { result } = renderHook(() => useSequencerStore(genre));

    act(() => {
      result.current.commit({ type: "SET_BPM", bpm: 100 });
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.invalidateRedo();
    });
    expect(result.current.canRedo).toBe(false);
    expect(result.current.redo()).toBeNull();
  });

  it("clears history when a project is loaded", () => {
    const { result } = renderHook(() => useSequencerStore(genre));

    act(() => {
      result.current.commit({ type: "SET_BPM", bpm: 150 });
    });
    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.commit({
        type: "LOAD_PROJECT",
        genre,
        patterns: { A: genre.sequencer_pattern, B: genre.sequencer_pattern },
        activeSlot: "A",
        bpm: 128,
        swing: 0,
        timeSignature: "4/4",
        resolution: "1/16",
        stepCount: 16,
        songMode: false,
        songChain: ["A", "B"],
        loopRange: null,
        isMetronome: false,
        isCountIn: false,
      });
    });

    expect(result.current.canUndo).toBe(false);
    expect(result.current.state.bpm).toBe(128);
  });

  it("caps history growth so long sessions cannot leak memory", () => {
    const { result } = renderHook(() => useSequencerStore(genre));

    for (let i = 0; i < 70; i++) {
      act(() => {
        result.current.commit({ type: "SET_BPM", bpm: 60 + (i % 60) });
      });
    }

    let undoCount = 0;
    act(() => {
      while (result.current.undo() !== null && undoCount < 200) {
        undoCount += 1;
      }
    });
    expect(undoCount).toBeLessThanOrEqual(50);
  });
});

describe("useSequencerStore coalesced commits (F-05)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("collapses a continuous slider gesture into a single undo entry", () => {
    const { result } = renderHook(() => useSequencerStore(genre));
    const initialSwing = result.current.state.swing;

    act(() => {
      // One drag = many events on the same key.
      for (let s = 5; s <= 50; s += 5) {
        result.current.commitCoalesced({ type: "SET_SWING", swing: s }, "swing");
      }
    });
    expect(result.current.state.swing).toBe(50);

    act(() => {
      result.current.undo();
    });
    expect(result.current.state.swing).toBe(initialSwing);
    // A single entry means there is nothing left to undo.
    expect(result.current.canUndo).toBe(false);
  });

  it("keeps separate gestures on different keys as separate undo entries", () => {
    const { result } = renderHook(() => useSequencerStore(genre));
    const initialBpm = result.current.state.bpm;
    const initialSwing = result.current.state.swing;

    // Separate ticks, like two independent user gestures.
    act(() => {
      result.current.commitCoalesced({ type: "SET_BPM", bpm: 99 }, "bpm");
    });
    act(() => {
      result.current.commitCoalesced({ type: "SET_SWING", swing: 30 }, "swing");
    });

    act(() => {
      result.current.undo();
    });
    expect(result.current.state.swing).toBe(initialSwing);
    expect(result.current.state.bpm).toBe(99);

    act(() => {
      result.current.undo();
    });
    expect(result.current.state.bpm).toBe(initialBpm);
  });

  it("still records a fresh entry once the coalescing window has elapsed (window=0 semantics)", () => {
    const { result } = renderHook(() => useSequencerStore(genre));

    act(() => {
      result.current.commitCoalesced({ type: "SET_BPM", bpm: 101 }, "bpm", -1);
    });
    act(() => {
      result.current.commitCoalesced({ type: "SET_BPM", bpm: 140 }, "bpm", -1);
    });

    act(() => {
      result.current.undo();
    });
    expect(result.current.state.bpm).toBe(101);
  });
});

describe("useSequencerStore history memory budget (A-04)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reports retained history size and caps it by bytes, not just entry count", () => {
    const { result } = renderHook(() => useSequencerStore(genre));

    // Each commit clones three patterns, so pushing many entries must not grow
    // unbounded even though the entry cap alone would allow 50 of them.
    for (let i = 0; i < 40; i++) {
      act(() => {
        result.current.commit({ type: "SET_BPM", bpm: 60 + (i % 60) });
      });
    }

    const stats = result.current.getHistoryStats();
    expect(stats.entries).toBeGreaterThan(0);
    expect(stats.entries).toBeLessThanOrEqual(50);
    // 4 MB budget — well under the ~3.7 MB a naive 50-entry stack could reach.
    expect(stats.bytes).toBeLessThanOrEqual(4 * 1024 * 1024);
  });

  it("keeps undo correct after eviction has started", () => {
    const { result } = renderHook(() => useSequencerStore(genre));

    for (let i = 0; i < 60; i++) {
      act(() => {
        result.current.commit({ type: "SET_BPM", bpm: 70 + (i % 50) });
      });
    }
    const last = result.current.state.bpm;
    expect(last).toBe(70 + (59 % 50));

    act(() => {
      result.current.undo();
    });
    // The previous distinct value, proving eviction did not corrupt ordering.
    expect(result.current.state.bpm).toBe(70 + (58 % 50));
  });
});

/**
 * D-03: the master FX rack is part of the undo stack.
 *
 * These pin the plan's acceptance clause: "改 FX → Ctrl+Z → FX 回退；且与 pattern 快照同
 * 一次 commit 只占 1 条历史" — an FX edit must roll back, and an FX edit plus a pattern
 * edit made in the same tick must still be exactly ONE history entry so a single Ctrl+Z
 * restores both.
 */
describe("useSequencerStore FX history (D-03)", () => {
  const fxGenre = GENRES_MAP["chicago-house"] ?? Object.values(GENRES_MAP)[0];

  beforeEach(() => {
    localStorage.clear();
  });

  it("seeds the store with the documented rack defaults", () => {
    const { result } = renderHook(() => useSequencerStore(fxGenre));
    expect(result.current.state.effectsRack).toEqual(DEFAULT_FX_STATE);
    // The defaults are the measured loudness baseline — this change must not move them.
    expect(DEFAULT_FX_STATE.filterCutoff).toBe(16000);
    expect(DEFAULT_FX_STATE.saturationDrive).toBe(1.5);
    expect(DEFAULT_FX_STATE.chorusMix).toBe(0.35);
    expect(DEFAULT_FX_STATE.bitDepth).toBe(12);
  });

  it("undoes an FX change instead of leaving a half-undo", () => {
    const { result } = renderHook(() => useSequencerStore(fxGenre));

    act(() => {
      result.current.commit({ type: "SET_EFFECTS_RACK", effectsRack: { filterCutoff: 420 } });
    });
    expect(result.current.state.effectsRack.filterCutoff).toBe(420);
    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.undo();
    });
    expect(result.current.state.effectsRack.filterCutoff).toBe(DEFAULT_FX_STATE.filterCutoff);
    // The undo also restored *only* the FX field, not the whole rack identity semantics.
    expect(result.current.state.effectsRack).toEqual(DEFAULT_FX_STATE);
  });

  it("merges a partial FX write without touching the other fields", () => {
    const { result } = renderHook(() => useSequencerStore(fxGenre));

    act(() => {
      result.current.commit({ type: "SET_EFFECTS_RACK", effectsRack: { bitDepth: 6 } });
    });
    expect(result.current.state.effectsRack.bitDepth).toBe(6);
    expect(result.current.state.effectsRack.filterCutoff).toBe(DEFAULT_FX_STATE.filterCutoff);
    expect(result.current.state.effectsRack.chorusMix).toBe(DEFAULT_FX_STATE.chorusMix);
  });

  it("records exactly ONE history entry for an FX change and a pattern change in one tick", () => {
    const { result } = renderHook(() => useSequencerStore(fxGenre));

    const patternBefore = clonePattern(result.current.state.pattern);
    const flipped = clonePattern(patternBefore);
    flipped.tracks[0].steps[0] = flipped.tracks[0].steps[0] ? 0 : 1;

    act(() => {
      // Same "user commit": a rack edit and a grid edit applied together.
      result.current.commit({ type: "SET_EFFECTS_RACK", effectsRack: { saturationDrive: 4.2 } });
      result.current.commit({ type: "COMMIT_PATTERN", pattern: flipped });
    });

    expect(result.current.state.effectsRack.saturationDrive).toBe(4.2);
    expect(result.current.state.pattern.tracks[0].steps[0]).toBe(flipped.tracks[0].steps[0]);
    // One tick = one undo step (not one entry per dispatch).
    expect(result.current.getHistoryStats().entries).toBe(1);

    act(() => {
      result.current.undo();
    });
    // A single undo rolls back BOTH halves.
    expect(result.current.state.effectsRack.saturationDrive).toBe(DEFAULT_FX_STATE.saturationDrive);
    expect(result.current.state.pattern.tracks[0].steps[0]).toBe(patternBefore.tracks[0].steps[0]);
    expect(result.current.canUndo).toBe(false);
  });

  it("keeps separate ticks as separate FX undo entries", () => {
    const { result } = renderHook(() => useSequencerStore(fxGenre));

    act(() => {
      result.current.commit({ type: "SET_EFFECTS_RACK", effectsRack: { filterCutoff: 1000 } });
    });
    act(() => {
      result.current.commit({ type: "SET_EFFECTS_RACK", effectsRack: { filterCutoff: 250 } });
    });
    expect(result.current.getHistoryStats().entries).toBe(2);

    act(() => {
      result.current.undo();
    });
    expect(result.current.state.effectsRack.filterCutoff).toBe(1000);
    act(() => {
      result.current.undo();
    });
    expect(result.current.state.effectsRack.filterCutoff).toBe(DEFAULT_FX_STATE.filterCutoff);
  });

  it("coalesces an FX slider drag into a single undo entry", () => {
    const { result } = renderHook(() => useSequencerStore(fxGenre));

    act(() => {
      // One drag of the cutoff slider = many events on the same coalescing key.
      for (let hz = 16000; hz >= 4000; hz -= 1000) {
        result.current.commitCoalesced(
          { type: "SET_EFFECTS_RACK", effectsRack: { filterCutoff: hz } },
          "fx:filterCutoff"
        );
      }
    });
    expect(result.current.state.effectsRack.filterCutoff).toBe(4000);

    act(() => {
      result.current.undo();
    });
    expect(result.current.state.effectsRack.filterCutoff).toBe(DEFAULT_FX_STATE.filterCutoff);
    expect(result.current.canUndo).toBe(false);
  });

  it("redo re-applies an undone FX change", () => {
    const { result } = renderHook(() => useSequencerStore(fxGenre));

    act(() => {
      result.current.commit({ type: "SET_EFFECTS_RACK", effectsRack: { chorusMix: 0.8 } });
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.state.effectsRack.chorusMix).toBe(DEFAULT_FX_STATE.chorusMix);
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.redo();
    });
    expect(result.current.state.effectsRack.chorusMix).toBe(0.8);
  });

  it("leaves the current rack untouched when restoring a legacy snapshot without FX", () => {
    const { result } = renderHook(() => useSequencerStore(fxGenre));

    act(() => {
      result.current.commit({ type: "SET_EFFECTS_RACK", effectsRack: { bitDepth: 5 } });
    });

    // A snapshot captured by pre-D-03 code has no `effectsRack` field.
    const legacy = { ...result.current.createSnapshot(), effectsRack: undefined };

    act(() => {
      result.current.commit({ type: "RESTORE_SNAPSHOT", snapshot: legacy });
    });
    // Not reset to defaults: a missing field means "this snapshot knows nothing about FX".
    expect(result.current.state.effectsRack.bitDepth).toBe(5);
  });
});
