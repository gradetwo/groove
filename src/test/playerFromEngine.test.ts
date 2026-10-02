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

/**
 * ⭐ **A looping arrangement must not lose its sampler lanes on the second pass.**
 *
 * `scheduleSamplerSteps` places one pass on the audio clock and returns; the engine's own lanes wrap inside the
 * transport and keep sounding. So a sampler lane used to play once and then be silent while the synth lanes went
 * on — which an external audit of `1b535ec` reported as the one defect that makes no sound, and which
 * `docs/AUDIT_2026-10-02_TRIAGE.md` located at the single call site in `play`.
 *
 * The transport now reports the wrap and the player plans the next pass at the reported time, through the
 * `startSeconds` parameter `scheduleSamplerSteps` already had. The criterion checks the hand-off rather than the
 * audio: that a handler is registered when there is something to re-plan, that it asks the loader again, and that
 * a play with no sampler lanes registers nothing at all.
 */
describe("a loop wrap plans the sampler lanes again", () => {
  const withAssets = async () => ({
    assets: [{ assetId: "virtuosity-drums-basic", name: "Drums", kind: "one-shot", sfz: { url: "sfz/drums.sfz" } } as never],
  });
  const oneNote = { t1: [{ pitch: 48, startBeats: 0, lengthBeats: 1, velocity: 100 }] };

  it("⭐ registers a transport handler and asks the loader again when it wraps", async () => {
    const tap = engine();
    // The SFZ fetch is the probe: `loadNote` always asks for the text before it can resolve a region, so a second
    // pass that never re-plans shows up as a call count that did not move.
    const fetchSfzText = vi.fn(async () => "<region> sample=x.wav lokey=0 hikey=127");
    const player = createArrangementPlayer({ engine: tap, loadCatalogue: withAssets, fetchSfzText });

    await player.play(playInput(arrangement, oneNote));

    expect(tap.onLoopWrap, "the transport was not asked to report its wraps").toBeTypeOf("function");
    const attemptsAfterFirstPass = fetchSfzText.mock.calls.length;

    // The transport reports the wrap with the time the next pass begins; the player plans from that time.
    tap.onLoopWrap!(4);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      fetchSfzText.mock.calls.length,
      "the second pass asked the loader nothing, so its notes would be silent"
    ).toBeGreaterThan(attemptsAfterFirstPass);
  });

  it("registers nothing when there are no sampler lanes, because nothing needs re-planning", async () => {
    // A synth-only arrangement wraps on its own; a handler here would be work with no object.
    const tap = engine();
    const synthOnly: ArrangementV2 = {
      songId: "s",
      sourceSlots: [],
      tracks: [{ id: "t2", kind: "synth", name: "Keys" }],
    };
    const player = createArrangementPlayer({ engine: tap, loadCatalogue: async () => ({ assets: [] }) });
    await player.play(playInput(synthOnly, { t2: [{ pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 }] }));
    expect(tap.onLoopWrap).toBeUndefined();
  });

  it("drops the handler on stop, so a stopped transport plans no pass nobody will hear", async () => {
    const tap = engine();
    // The SFZ fetch is the probe: `loadNote` always asks for the text before it can resolve a region, so a second
    // pass that never re-plans shows up as a call count that did not move.
    const fetchSfzText = vi.fn(async () => "<region> sample=x.wav lokey=0 hikey=127");
    const player = createArrangementPlayer({ engine: tap, loadCatalogue: withAssets, fetchSfzText });
    await player.play(playInput(arrangement, oneNote));
    expect(tap.onLoopWrap).toBeTypeOf("function");

    player.stop?.();
    expect(tap.onLoopWrap).toBeUndefined();
  });
});
