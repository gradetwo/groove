/**
 * SFZ's choke groups: **`off_by` is what makes a drum kit playable.**
 *
 * A closed hi-hat has to silence an open one. Every drum library does it this way, the pinned `virtuosity_drums` does it explicitly (`group=41` with `off_by=41`), and without it an open hat rings through every closed hit — audibly wrong however good the samples are.
 *
 * The criteria are on the **voice that was stopped**, not on a flag: whether a note sounds is the only thing a player can be wrong about that matters.
 */
import { describe, expect, it, vi } from "vitest";
import { resolveInstrumentNote } from "../audio/sfz/instrument";
import { createArrangementPlayer } from "../audio/playerFromEngine";
import { FakeAudioBuffer, FakeAudioContext } from "./helpers/fakeAudio";
import type { SampleAsset } from "../data/sampleCatalogue";

/** Two hats: the open one is in group 1, the closed one silences group 1. The shape every drum library uses. */
const HATS_SFZ = `
<region> sample=open.wav lokey=46 hikey=46 pitch_keycenter=46 group=1
<region> sample=closed.wav lokey=42 hikey=42 pitch_keycenter=42 off_by=1
`;

/** The same, plus a kick in group 2 that nothing should ever cut. */
const HATS_AND_KICK_SFZ = `
<region> sample=open.wav lokey=46 hikey=46 pitch_keycenter=46 group=1
<region> sample=closed.wav lokey=42 hikey=42 pitch_keycenter=42 off_by=1
<region> sample=kick.wav lokey=36 hikey=36 pitch_keycenter=36 group=2
`;

const asset: Pick<SampleAsset, "assetId" | "sfz"> = {
  assetId: "hats",
  sfz: { url: "https://example.test/hats.sfz", path: "hats.sfz" },
};

/**
 * A player whose loader resolves through the real SFZ path and whose audio is the project's own fake — so the assertion is about **which voices were stopped**, which is the only part of choking a criterion can hear.
 */
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
  it("reads the group and what it silences off the region that answered the note", () => {
    // Resolution is where the file's routing becomes known: the caller only ever holds a buffer, and a buffer cannot say which hat it is.
    const open = resolveInstrumentNote(asset, HATS_SFZ, 46);
    expect(open.ok).toBe(true);
    expect(open.note?.group).toBe(1);
    expect(open.note?.offBy).toBeUndefined();

    const closed = resolveInstrumentNote(asset, HATS_SFZ, 42);
    expect(closed.note?.offBy).toBe(1);
    expect(closed.note?.group).toBeUndefined();
  });

  it("stops an open hi-hat when the closed one is played", async () => {
    /**
     * ⭐ **The behaviour a drummer expects and a sample player does not give for free.** Without it the open hat rings on through every closed hit.
     */
    const { player, sources } = playerFor(HATS_SFZ);
    const open = await player.audition!({ assetId: "hats", midi: 46 });
    expect(open.ok).toBe(true);
    expect(stops(sources[0]!)).toBe(0);

    await player.audition!({ assetId: "hats", midi: 42 });
    // The open hat's voice was stopped, and the closed hat's was not.
    expect(stops(sources[0]!)).toBe(1);
    expect(stops(sources[1]!)).toBe(0);
  });

  it("leaves a voice in a group nothing silences alone", async () => {
    // The choke is by group and not "stop everything": a kick must survive a hi-hat.
    const { player, sources } = playerFor(HATS_AND_KICK_SFZ);
    await player.audition!({ assetId: "hats", midi: 36 });
    await player.audition!({ assetId: "hats", midi: 42 });
    expect(stops(sources[0]!)).toBe(0);
  });

  it("stops the group once, however many voices are in it", async () => {
    // Two open hats, then a closed one: both go, and the choke does not run twice over the same voice.
    const { player, sources } = playerFor(HATS_SFZ);
    await player.audition!({ assetId: "hats", midi: 46 });
    await player.audition!({ assetId: "hats", midi: 46 });
    await player.audition!({ assetId: "hats", midi: 42 });
    expect(stops(sources[0]!)).toBe(1);
    expect(stops(sources[1]!)).toBe(1);
    expect(stops(sources[2]!)).toBe(0);
  });

  it("leaves a region with no group out of every choke", () => {
    // A file that writes no `group` means "nothing silences this", and a region with no group must not be swept up by a region that does.
    const noGroups = `<region> sample=a.wav lokey=60 hikey=60 pitch_keycenter=60`;
    const resolved = resolveInstrumentNote(asset, noGroups, 60);
    expect(resolved.note?.group).toBeUndefined();
    expect(resolved.note?.offBy).toBeUndefined();
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

describe("the player's choke, when the audio refuses to stop", () => {
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

describe("choke groups are read from the file, not assumed", () => {
  it("does not choke when the file says nothing about groups", async () => {
    const { player, sources } = playerFor(`<region> sample=a.wav lokey=42 hikey=46 pitch_keycenter=44`);
    await player.audition!({ assetId: "hats", midi: 42 });
    await player.audition!({ assetId: "hats", midi: 44 });
    expect(stops(sources[0]!)).toBe(0);
  });
});
