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

/** A plain sustaining region, for the rule that must NOT fade: a key release. */
const SUSTAINING_ONLY = `<region> sample=pad.wav lokey=48 hikey=48 pitch_keycenter=48`;

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
  return { player, sources: context.createdBufferSources, gains: context.createdGains };
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


/**
 * The **shape** of a choke, measured rather than assumed.
 *
 * sfizz's own rendering of a choked hi-hat falls **0.0500 → 0.0088 → 0.0038 → 0.0022 → 0.0007** over the fifty milliseconds that follow: about a twentieth of a second to reach one percent. A voice stopped dead is a step in the waveform, a step is a click, and a click on a choked open hat is the first thing a drummer notices.
 *
 * `off_mode` was measured at the same time and made **no difference** — `fast`, `normal` and absent gave identical readings in all eight windows — so the shape below is the whole of what sfizz does here, and there is nothing else to implement for that opcode.
 */
describe("a choke is a fade and not a cut", () => {
  /** Every gain the context handed out, so the criterion finds the ramp instead of assuming which node carries it. */
  const rampsIn = (gains: { gain: { events: { type: string; value?: number; time?: number }[] } }[]) =>
    gains.flatMap((node) => node.gain.events.filter((event) => event.type === "linearRampToValueAtTime"));

  it("ramps a gain to zero when a voice is choked", async () => {
    const { player, gains } = playerFor(HATS_SFZ);
    await player.audition!({ assetId: "hats", midi: 46 });
    expect(rampsIn(gains), "the open hat was ramped before anything choked it").toHaveLength(0);
    await player.audition!({ assetId: "hats", midi: 42 });
    const ramps = rampsIn(gains);
    // A ramp **to zero** is the fade; a stop alone would leave a step in the waveform at whatever level the voice had reached.
    expect(ramps.map((event) => event.value), "the choked voice was stopped without a ramp, which is the click").toContain(0);
  });

  it("schedules the stop after the ramp, not through it", async () => {
    // Scheduling the stop before the ramp ends would cut off the fade that was just asked for — an easy way to write this and still get a click.
    const { player, gains, sources } = playerFor(HATS_SFZ);
    await player.audition!({ assetId: "hats", midi: 46 });
    await player.audition!({ assetId: "hats", midi: 42 });
    const ramp = rampsIn(gains).filter((event) => event.value === 0).pop()!;
    // `stopCalls` holds the scheduled times themselves, not objects around them — the fake records the argument it was given.
    const stops = sources[0]!.stopCalls;
    expect(stops.length).toBeGreaterThan(0);
    const scheduled = stops[stops.length - 1];
    expect(typeof scheduled, "the choke did not schedule a stop time").toBe("number");
    expect(scheduled!).toBeGreaterThan(ramp.time!);
  });

  it("does not fade a voice the file asked to release, because those are two rules", async () => {
    // ⭐ A key release is not a choke: a sustaining sample must stop when the key comes up, and fading it would make every note of a piano hang for fifty milliseconds.
    const { player, gains } = playerFor(SUSTAINING_ONLY);
    await player.audition!({ assetId: "hats", midi: 48 });
    player.releaseNote!({ midi: 48 });
    expect(rampsIn(gains), "a released voice was faded, so a key release is being treated as a choke").toHaveLength(0);
  });
});
