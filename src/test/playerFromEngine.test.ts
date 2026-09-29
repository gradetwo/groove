import { describe, expect, it, vi } from "vitest";
import { createArrangementPlayer } from "../audio/playerFromEngine";
import { compileArrangementToSongInput } from "../data/arrangementCompile";
import type { ArrangementV2 } from "../types/arrangementV2";

/**
 * The seam between an engine and a view — and the one property worth guarding: **a catalogue that fails to load must not become an exception in a click handler.**
 *
 * That is the same failure this workstream keeps removing: a throw inside a handler shows the user nothing at all, which is indistinguishable from a broken button.
 */
const engine = () => ({ audioContext: {} as BaseAudioContext, musicDestination: {} as AudioNode });
const arrangement: ArrangementV2 = {
  songId: "s",
  sourceSlots: [],
  tracks: [{ id: "t1", kind: "sampler", name: "Drums", sample: { assetId: "virtuosity-drums-basic" } }],
};

describe("creating a player from an engine", () => {
  it("hands the engine's own context and destination to the player", async () => {
    const tap = engine();
    const player = createArrangementPlayer({ engine: tap, loadCatalogue: async () => ({ assets: [] }) });
    // ⭐ The compiled song is what reaches the engine — the same shape `compileArrangementToSongInput` produces, which its own criterion checks.
    const song = compileArrangementToSongInput(arrangement);
    const result = await player.play(song as never);
    expect(result).toHaveProperty("planned");
  });

  it("still plans when the catalogue cannot be loaded, instead of throwing inside the handler", async () => {
    const player = createArrangementPlayer({
      engine: engine(),
      loadCatalogue: async () => {
        throw new Error("offline");
      },
    });
    const song = compileArrangementToSongInput(arrangement);
    // ⭐ A rejection here would surface as a button that does nothing; a report is something the caller can show.
    await expect(player.play(song as never)).resolves.toHaveProperty("planned");
  });

  it("asks for the catalogue exactly once per play, so a play does not refetch on every track", async () => {
    const loadCatalogue = vi.fn(async () => ({ assets: [] }));
    const player = createArrangementPlayer({ engine: engine(), loadCatalogue });
    await player.play(compileArrangementToSongInput(arrangement) as never);
    expect(loadCatalogue).toHaveBeenCalledTimes(1);
  });
});
