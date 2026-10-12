/**
 * SFZ's `loop_mode=one_shot`: **a drum hit rings out however briefly the key is held.**
 *
 * Measured with sfizz rather than read off the opcode's name, because the name is not the behaviour: the same 0.1-second note on a one-second sample renders **2.091 s** with `loop_mode=one_shot` and **0.341 s** without, and the energy 0.2–0.6 s after the note-off is nonzero only in the first case. The pinned `virtuosity_drums` sets it, so without this every drum hit on a real kit was truncated by the key release.
 *
 * The subtle half is the second question: a **choke still stops** a one-shot voice. `one_shot` is about the key release, `off_by` is about a choke, and they are not the same rule.
 */
import { describe, expect, it } from "vitest";
import { resolveInstrumentNote } from "../audio/sfz/instrument";
import { createArrangementPlayer } from "../audio/playerFromEngine";
import { FakeAudioBuffer, FakeAudioContext } from "./helpers/fakeAudio";
import type { SampleAsset } from "../data/sampleCatalogue";

const asset: Pick<SampleAsset, "assetId" | "sfz"> = { assetId: "kit", sfz: { url: "https://example.test/kit.sfz", path: "kit.sfz" } };

const ONE_SHOT = `<region> sample=kick.wav lokey=36 hikey=36 pitch_keycenter=36 loop_mode=one_shot`;
const SUSTAINING = `<region> sample=pad.wav lokey=48 hikey=48 pitch_keycenter=48`;
/**
 * The victim names its killer, which is the direction sfizz measured: the open hat carries `off_by=1` and the closed hat is in group 1.
 */
const ONE_SHOT_CHOKED = `<region> sample=open.wav lokey=46 hikey=46 pitch_keycenter=46 off_by=1 loop_mode=one_shot
<region> sample=closed.wav lokey=42 hikey=42 pitch_keycenter=42 group=1`;

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

const stops = (source: { stopCalls: unknown[] }) => source.stopCalls.length;

describe("a one-shot region", () => {
  it("is read from the file rather than assumed", () => {
    expect(resolveInstrumentNote(asset, ONE_SHOT, 36).note?.oneShot).toBe(true);
    // The default is the behaviour this project always had: a release stops the note.
    expect(resolveInstrumentNote(asset, SUSTAINING, 48).note?.oneShot).toBeUndefined();
    // `loop_mode` has other values, and only `one_shot` ignores the release.
    expect(resolveInstrumentNote(asset, `<region> sample=x.wav lokey=36 hikey=36 pitch_keycenter=36 loop_mode=continuous`, 36).note?.oneShot).toBeUndefined();
  });

  it("is not stopped by a key release", async () => {
    // ⭐ The defect this exists for: a tap on a drum key truncated the hit.
    const { player, sources } = playerFor(ONE_SHOT);
    await player.audition!({ assetId: "kit", midi: 36 });
    const stopped = player.releaseNote!({ midi: 36 });
    // Zero voices stopped, and the voice was never asked to stop.
    expect(stopped).toBe(0);
    expect(stops(sources[0]!)).toBe(0);
  });

  it("is stopped by a key release when the file does not ask for one-shot", async () => {
    // The other half: the change must not make every sampler ignore its key.
    const { player, sources } = playerFor(SUSTAINING);
    await player.audition!({ assetId: "kit", midi: 48 });
    expect(player.releaseNote!({ midi: 48 })).toBe(1);
    expect(stops(sources[0]!)).toBe(1);
  });

  it("is still stopped by a choke, because one_shot answers a different question", async () => {
    /**
     * ⭐ `loop_mode=one_shot` is about the key release; `off_by` is about a choke. A closed hi-hat has to silence an open one **even when the open one is a one-shot**, or the two rules would be confused for each other.
     */
    const { player, sources } = playerFor(ONE_SHOT_CHOKED);
    await player.audition!({ assetId: "kit", midi: 46 });
    await player.audition!({ assetId: "kit", midi: 42 });
    expect(stops(sources[0]!)).toBe(1);
  });

  it("stops reporting zero once the same key is played by a region that does sustain", async () => {
    // A file whose regions disagree: the release behaviour belongs to the region that answered, not to the key.
    const mixed = `<region> sample=kick.wav lokey=36 hikey=36 pitch_keycenter=36 loop_mode=one_shot
<region> sample=pad.wav lokey=60 hikey=60 pitch_keycenter=60`;
    const { player, sources } = playerFor(mixed);
    await player.audition!({ assetId: "kit", midi: 36 });
    expect(player.releaseNote!({ midi: 36 })).toBe(0);
    await player.audition!({ assetId: "kit", midi: 60 });
    expect(player.releaseNote!({ midi: 60 })).toBe(1);
    expect(stops(sources[1]!)).toBe(1);
  });
});
