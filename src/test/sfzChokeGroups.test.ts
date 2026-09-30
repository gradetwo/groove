/**
 * SFZ's choke groups: **`off_by` is what makes a drum kit playable.**
 *
 * A closed hi-hat has to silence an open one. The pinned `virtuosity_drums` does it explicitly — its mapping carries `group=42 off_by=41`, then `group=41 off_by=40`: a chain where each stage silences the one before it.
 *
 * ⭐ **The direction was measured, and this project had it backwards.** A frequency-selective measurement over two renders of the same pair of notes (440 Hz for the note that should be silenced, 1500 Hz for the note that triggers it):
 *
 *   · `off_by=2` on the 440 Hz region and `group=2` on the 1500 Hz one → **440 Hz falls from 0.0502 to 0.0002** while 1500 Hz keeps sounding.
 *   · `off_by=1` on the 1500 Hz region and `group=1` on the 440 Hz one → **440 Hz stays at 0.0502**: nothing is silenced at all.
 *
 * So `off_by=N` means "**stop me** when a voice in group N starts": **the victim names its killer**. The fixtures below are written that way, and the criteria are on the **voice that was stopped** rather than on a flag, because whether a note sounds is the only thing a player can be wrong about that matters.
 */
import { describe, expect, it } from "vitest";
import { resolveInstrumentNote } from "../audio/sfz/instrument";
import { createArrangementPlayer } from "../audio/playerFromEngine";
import { FakeAudioBuffer, FakeAudioContext } from "./helpers/fakeAudio";
import type { SampleAsset } from "../data/sampleCatalogue";

/**
 * Two hats, in the shape the measurement says: the **open** hat declares what silences it (`off_by=1`), and the **closed** hat is in group 1.
 */
const HATS_SFZ = `
<region> sample=open.wav lokey=46 hikey=46 pitch_keycenter=46 off_by=1
<region> sample=closed.wav lokey=42 hikey=42 pitch_keycenter=42 group=1
`;

/** The same, plus an open hat whose killer never sounds: `off_by=9` and nothing is in group 9. */
const HATS_WITH_UNUSED_GROUP = `
<region> sample=open.wav lokey=46 hikey=46 pitch_keycenter=46 off_by=9
<region> sample=closed.wav lokey=42 hikey=42 pitch_keycenter=42 group=1
`;

const asset: Pick<SampleAsset, "assetId" | "sfz"> = {
  assetId: "hats",
  sfz: { url: "https://example.test/hats.sfz", path: "hats.sfz" },
};

function playerFor(sfz: string) {
  const context = new FakeAudioContext();
  const player = createArrangementPlayer({
    engine: { audioContext: context as never, musicDestination: context.createGain() as never },
    loadCatalogue: async () => ({ assets: [asset as SampleAsset] }),
    // The two I/O seams only, as the neighbouring audition criteria do: replacing the loader would replace the thing being judged.
    decode: async () => new FakeAudioBuffer(1, 48000, 48000) as unknown as AudioBuffer,
    fetchSfzText: async () => sfz,
  });
  return { player, sources: context.createdBufferSources };
}

/** How many times a voice was asked to stop — the fake records the calls, so the count is `length` and not the array. */
const stops = (source: { stopCalls: unknown[] }) => source.stopCalls.length;

describe("SFZ choke groups", () => {
  it("reads the group and what silences the note off the region that answered", () => {
    // Resolution is where the file's routing becomes known: the caller only ever holds a buffer, and a buffer cannot say which hat it is.
    const open = resolveInstrumentNote(asset, HATS_SFZ, 46);
    expect(open.ok).toBe(true);
    expect(open.note?.offBy).toBe(1);
    expect(open.note?.group).toBeUndefined();

    const closed = resolveInstrumentNote(asset, HATS_SFZ, 42);
    expect(closed.note?.group).toBe(1);
    expect(closed.note?.offBy).toBeUndefined();
  });

  it("stops an open hi-hat when the group it named is played", async () => {
    /**
     * ⭐ **The behaviour a drummer expects and a sample player does not give for free**, in the direction sfizz measured.
     */
    const { player, sources } = playerFor(HATS_SFZ);
    const open = await player.audition!({ assetId: "hats", midi: 46 });
    expect(open.ok).toBe(true);
    expect(stops(sources[0]!)).toBe(0);

    await player.audition!({ assetId: "hats", midi: 42 });
    // The open hat's voice was stopped; the closed hat's was not.
    expect(stops(sources[0]!)).toBe(1);
    expect(stops(sources[1]!)).toBe(0);
  });

  it("leaves a voice alone when the group it named never sounds", async () => {
    // `off_by=9` names a group nothing is in, so the open hat must survive a closed hat in group 1.
    const { player, sources } = playerFor(HATS_WITH_UNUSED_GROUP);
    await player.audition!({ assetId: "hats", midi: 46 });
    await player.audition!({ assetId: "hats", midi: 42 });
    expect(stops(sources[0]!)).toBe(0);
  });

  it("does not stop a voice that declared nothing", async () => {
    // A closed hat in group 1 silences only notes that asked to be silenced by group 1.
    const sfz = `<region> sample=plain.wav lokey=48 hikey=48 pitch_keycenter=48\n<region> sample=closed.wav lokey=42 hikey=42 pitch_keycenter=42 group=1`;
    const { player, sources } = playerFor(sfz);
    await player.audition!({ assetId: "hats", midi: 48 });
    await player.audition!({ assetId: "hats", midi: 42 });
    expect(stops(sources[0]!)).toBe(0);
  });

  it("stops the group once, however many voices asked to be silenced by it", async () => {
    // Two open hats, then the closed one: both go, and the choke does not run twice over the same voice.
    const { player, sources } = playerFor(HATS_SFZ);
    await player.audition!({ assetId: "hats", midi: 46 });
    await player.audition!({ assetId: "hats", midi: 46 });
    await player.audition!({ assetId: "hats", midi: 42 });
    expect(stops(sources[0]!)).toBe(1);
    expect(stops(sources[1]!)).toBe(1);
    expect(stops(sources[2]!)).toBe(0);
  });

  it("treats a group written as something other than a number as no group", () => {
    /**
     * `group=hat` is not what the format allows, and the honest reading is a region with no group: making it `NaN` would put every such region in one group and cut sounds that have nothing to do with each other.
     */
    const nonsense = `<region> sample=a.wav lokey=60 hikey=60 pitch_keycenter=60 group=hat off_by=`;
    const resolved = resolveInstrumentNote(asset, nonsense, 60);
    expect(resolved.note?.group).toBeUndefined();
    expect(resolved.note?.offBy).toBeUndefined();
  });
});

describe("a choke and a key release are different rules", () => {
  it("still stops a one-shot voice, because `one_shot` answers the release and `off_by` answers the choke", async () => {
    // ⭐ Measured earlier and separately: `loop_mode=one_shot` makes a voice ignore note-off. It must NOT make it immune to a choke.
    const oneShotOpen = `<region> sample=open.wav lokey=46 hikey=46 pitch_keycenter=46 off_by=1 loop_mode=one_shot\n<region> sample=closed.wav lokey=42 hikey=42 pitch_keycenter=42 group=1`;
    const { player, sources } = playerFor(oneShotOpen);
    await player.audition!({ assetId: "hats", midi: 46 });
    // The release does nothing to it…
    expect(player.releaseNote!({ midi: 46 })).toBe(0);
    expect(stops(sources[0]!)).toBe(0);
    // …and the choke still stops it.
    await player.audition!({ assetId: "hats", midi: 42 });
    expect(stops(sources[0]!)).toBe(1);
  });

  it("lets the new note sound even if stopping the old one throws", async () => {
    // A voice that has already ended must not be able to silence the note that choked it.
    const { player, sources } = playerFor(HATS_SFZ);
    await player.audition!({ assetId: "hats", midi: 46 });
    sources[0]!.stop = () => {
      throw new Error("already ended");
    };
    const closed = await player.audition!({ assetId: "hats", midi: 42 });
    expect(closed.ok).toBe(true);
  });
});
