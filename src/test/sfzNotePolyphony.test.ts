/**
 * `note_polyphony=N`: **how many voices of one note may sound at once.**
 *
 * Measured with sfizz rather than read off the opcode's name. Four hits of the same note, each letting the sample ring, and a frequency-selective amplitude reading once all four had been sent:
 *
 * ```
 * note_polyphony   voices' worth of level
 * absent           4.04
 * 1                1.01
 * 2                2.02
 * 3                3.03
 * 8                4.04   (only four hits were sent, so the cap was never reached)
 * ```
 *
 * **And which voice survives was measured separately**, because "cap at N" has two readings. A loud first hit followed by three quiet ones at `note_polyphony=1` leaves the level at **0.0831**, against a measured single-hit reference of **0.0811 at velocity 127** and **0.0020 at velocity 20** — the loud one is still sounding, so the notes that arrived at the cap were **refused**, not swapped in for the oldest.
 *
 * The pinned drum library sets `note_polyphony=3`, and this project had a fixed cap of eight that trimmed its list **without stopping the voices it dropped** — so past eight hits a note kept sounding with nothing left able to release it.
 */
import { describe, expect, it } from "vitest";
import { resolveInstrumentNote } from "../audio/sfz/instrument";
import { createArrangementPlayer } from "../audio/playerFromEngine";
import { FakeAudioBuffer, FakeAudioContext } from "./helpers/fakeAudio";
import type { SampleAsset } from "../data/sampleCatalogue";

const asset: Pick<SampleAsset, "assetId" | "sfz"> = {
  assetId: "kit",
  sfz: { url: "https://example.test/kit.sfz", path: "kit.sfz" },
};

const regionWith = (opcode?: number) =>
  `<region> sample=kick.wav lokey=36 hikey=36 pitch_keycenter=36 loop_mode=one_shot${opcode === undefined ? "" : ` note_polyphony=${opcode}`}`;

function playerFor(sfz: string) {
  const context = new FakeAudioContext();
  const player = createArrangementPlayer({
    engine: { audioContext: context as never, musicDestination: context.createGain() as never },
    loadCatalogue: async () => ({ assets: [asset as SampleAsset] }),
    decode: async () => new FakeAudioBuffer(1, 48000, 48000) as unknown as AudioBuffer,
    fetchSfzText: async () => sfz,
  });
  return { player, sources: context.createdBufferSources };
}

describe("note_polyphony", () => {
  it("is read from the file, and a nonsense value is no cap rather than a cap of zero", () => {
    expect(resolveInstrumentNote(asset, regionWith(3), 36).note?.notePolyphony).toBe(3);
    expect(resolveInstrumentNote(asset, regionWith(), 36).note?.notePolyphony).toBeUndefined();
    // A cap of zero would silence a note the file plainly means to sound; `group=hat` taught the same lesson for the choke.
    expect(resolveInstrumentNote(asset, regionWith(0), 36).note?.notePolyphony).toBeUndefined();
  });

  it("refuses the note that arrives while the cap is reached, and starts nothing", async () => {
    // ⭐ The measured reading: the level stays at the first hit's, so the later ones never sounded.
    const { player, sources } = playerFor(regionWith(1));
    const first = await player.audition!({ assetId: "kit", midi: 36 });
    expect(first.ok).toBe(true);
    const second = await player.audition!({ assetId: "kit", midi: 36 });
    expect(second.ok).toBe(false);
    expect(second.ok === false && second.reason).toContain("note_polyphony");
    // One voice started, so nothing was quietly played and then abandoned.
    expect(sources).toHaveLength(1);
  });

  it("allows exactly the number the file asks for", async () => {
    const { player, sources } = playerFor(regionWith(3));
    for (let i = 0; i < 3; i += 1) expect((await player.audition!({ assetId: "kit", midi: 36 })).ok).toBe(true);
    expect((await player.audition!({ assetId: "kit", midi: 36 })).ok).toBe(false);
    expect(sources).toHaveLength(3);
  });

  it("lets a new note through once a voice has finished, because a hit that ended is not polyphony", async () => {
    /**
     * ⭐ A one-shot drum hit ends by itself; nobody releases a key to stop a cymbal. Counting finished voices would start refusing notes a minute after the kit was last touched, which is the opposite of a drum kit.
     */
    const { player, sources } = playerFor(regionWith(1));
    expect((await player.audition!({ assetId: "kit", midi: 36 })).ok).toBe(true);
    expect((await player.audition!({ assetId: "kit", midi: 36 })).ok).toBe(false);
    sources[0]!.finish();
    expect((await player.audition!({ assetId: "kit", midi: 36 })).ok).toBe(true);
    expect(sources).toHaveLength(2);
  });

  it("still caps at eight when the file says nothing", async () => {
    // The behaviour that existed before, kept as a backstop rather than as the rule: a file with no `note_polyphony` must not be able to pile voices up without limit.
    const { player, sources } = playerFor(regionWith());
    for (let i = 0; i < 8; i += 1) expect((await player.audition!({ assetId: "kit", midi: 36 })).ok).toBe(true);
    expect((await player.audition!({ assetId: "kit", midi: 36 })).ok).toBe(false);
    expect(sources).toHaveLength(8);
  });

  it("counts each note separately, so a cap on one note cannot silence another", async () => {
    const twoNotes = `<region> sample=kick.wav lokey=36 hikey=36 pitch_keycenter=36 loop_mode=one_shot note_polyphony=1\n<region> sample=snare.wav lokey=38 hikey=38 pitch_keycenter=38 loop_mode=one_shot note_polyphony=1`;
    const { player } = playerFor(twoNotes);
    expect((await player.audition!({ assetId: "kit", midi: 36 })).ok).toBe(true);
    expect((await player.audition!({ assetId: "kit", midi: 38 })).ok).toBe(true);
  });
});
