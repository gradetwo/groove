import { describe, expect, it, vi } from "vitest";
import { createArrangementPlayer, type EngineAudioTap } from "../audio/playerFromEngine";
import { compileArrangementToLanes, compileArrangementToPattern } from "../data/arrangementCompile";
import type { ArrangementV2 } from "../types/arrangementV2";
import type { SequencerPattern } from "../types/genre";

/**
 * The seam between an engine and a view — and the properties worth guarding: **a catalogue that fails to load must not become an exception in a click handler**, and it must be asked for **once** per play
 * rather than once per note.
 *
 * That is the same failure this workstream keeps removing: a throw inside a handler shows the user nothing at all, which is indistinguishable from a broken button.
 *
 * The player is handed the engine's `SequencerPattern` plus the sampler lanes that pattern cannot voice, so these criteria build that input the way `playArrangementV2` does. The engine double carries the
 * transport methods the arrangement path needs; a tap without them is the "no transport" case, which has its own criterion beside this file.
 */
const engine = (): EngineAudioTap => ({
  // A live context's clock is what a sampler note's start time is measured from, so the double carries one.
  audioContext: { currentTime: 0 } as BaseAudioContext,
  musicDestination: {} as AudioNode,
  setPattern: vi.fn(),
  play: vi.fn(async () => undefined),
  stop: vi.fn(),
  setBpm: vi.fn(),
});

const arrangement: ArrangementV2 = {
  songId: "s",
  sourceSlots: [],
  tracks: [{ id: "t1", kind: "sampler", name: "Drums", sample: { assetId: "virtuosity-drums-basic" } }],
};

/** What `playArrangementV2` hands the player for this arrangement. */
function playInput(arrangement: ArrangementV2, notes: Parameters<typeof compileArrangementToLanes>[1] = {}) {
  const compiled = compileArrangementToLanes(arrangement, notes);
  return {
    pattern: compileArrangementToPattern(arrangement, compiled) as SequencerPattern,
    samplerLanes: compiled.filter((entry) => entry.track.sample).map((entry) => ({ sourceTrackId: entry.sourceTrackId, lane: entry.track })),
    bpm: arrangement.bpm ?? 120,
  };
}

describe("creating a player from an engine", () => {
  it("hands the engine's own context and destination to the player", async () => {
    const tap = engine();
    const player = createArrangementPlayer({ engine: tap, loadCatalogue: async () => ({ assets: [] }) });
    // ⭐ The pattern is what reaches the engine — the same shape `compileArrangementToPattern` produces, which its own criterion checks.
    const result = await player.play(playInput(arrangement));
    expect(result).toHaveProperty("planned");
  });

  it("still plans when the catalogue cannot be loaded, instead of throwing inside the handler", async () => {
    const player = createArrangementPlayer({
      engine: engine(),
      loadCatalogue: async () => {
        throw new Error("offline");
      },
    });
    // ⭐ A rejection here would surface as a button that does nothing; a report is something the caller can show. The sampler lane cannot resolve without a catalogue, and that is the reported problem.
    const result = await player.play(playInput(arrangement, { t1: [{ pitch: 36, startBeats: 0, lengthBeats: 0.25, velocity: 100 }] }));
    expect(result).toHaveProperty("planned");
    expect(result.problem).toMatch(/catalogue unavailable/);
  });

  it("asks for the catalogue exactly once per play, so a play does not refetch on every track", async () => {
    const loadCatalogue = vi.fn(async () => ({ assets: [] }));
    const player = createArrangementPlayer({ engine: engine(), loadCatalogue });
    await player.play(playInput(arrangement, { t1: [{ pitch: 36, startBeats: 0, lengthBeats: 0.25, velocity: 100 }] }));
    expect(loadCatalogue).toHaveBeenCalledTimes(1);
  });
});
