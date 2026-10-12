/**
 * `amplitude_onccN`: a controller drives a note's **level**.
 *
 * Measured with sfizz, and the four points fit one formula exactly:
 *
 * ```
 * amplitude_oncc1=100   CC 32  →  −11.9 dB     20·log10(32/127) = −12.0
 * amplitude_oncc1=100   CC 64  →   −5.9 dB     20·log10(64/127) =  −6.0
 * amplitude_oncc1=100   CC 127 →    0.0 dB
 * amplitude_oncc1=50    CC 127 →   −6.0 dB     (N is a percentage)
 * amplitude_oncc1=200   CC 127 →   +6.0 dB
 * ```
 *
 * So the controller scales **linearly** — it is a percentage of level, not a number of decibels — and `N` is a further percentage of that, which is why `N=100` means "unchanged". The pinned library uses this for its microphone mix (`amplitude_oncc101`, `_oncc103`, `_oncc105`), so a reader that ignores it plays every microphone at full level regardless of what the file asked for.
 *
 * **The controller values are the file's own**, from its `<control>` block, exactly as the `locc`/`hicc` gates read them: a file that never sends CC 101 has it at zero, and the measurement above says zero is silence.
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

const region = (opcode?: string, ccSet?: number) =>
  `${ccSet === undefined ? "" : `<control>\nset_cc1=${ccSet}\n`}<region> sample=kick.wav lokey=36 hikey=36 pitch_keycenter=36 loop_mode=one_shot${opcode ? ` ${opcode}` : ""}`;

function playerFor(sfz: string) {
  const context = new FakeAudioContext();
  const player = createArrangementPlayer({
    engine: { audioContext: context as never, musicDestination: context.createGain() as never },
    loadCatalogue: async () => ({ assets: [asset as SampleAsset] }),
    decode: async () => new FakeAudioBuffer(1, 48000, 48000) as unknown as AudioBuffer,
    fetchSfzText: async () => sfz,
  });
  return { player, gains: context.createdGains };
}

describe("amplitude_onccN", () => {
  it("scales linearly with the controller, as the measurement says", () => {
    // ⭐ The whole formula in one place: (CC ÷ 127) × (N ÷ 100).
    // At a full controller with `N=100` the scale is exactly one, and the field is **left out** rather than set to one: absent means "unchanged", which is the same thing and leaves every other note's shape untouched.
    const identity = resolveInstrumentNote(asset, region("amplitude_oncc1=100", 127), 36).note?.gainScale;
    expect(identity === undefined || Math.abs(identity - 1) < 1e-9).toBe(true);
    expect(resolveInstrumentNote(asset, region("amplitude_oncc1=100", 64), 36).note?.gainScale).toBeCloseTo(64 / 127, 6);
    expect(resolveInstrumentNote(asset, region("amplitude_oncc1=100", 32), 36).note?.gainScale).toBeCloseTo(32 / 127, 6);
  });

  it("treats the opcode's number as a percentage of the controller's own scale", () => {
    expect(resolveInstrumentNote(asset, region("amplitude_oncc1=50", 127), 36).note?.gainScale).toBeCloseTo(0.5, 6);
    expect(resolveInstrumentNote(asset, region("amplitude_oncc1=200", 127), 36).note?.gainScale).toBeCloseTo(2, 6);
  });

  it("is silence when the controller was never set, which is what zero means", () => {
    // A file that never sends CC 1 has it at 0 — the same rule the gates use — and zero amplitude is a note that does not sound, not a note at full level.
    expect(resolveInstrumentNote(asset, region("amplitude_oncc1=100"), 36).note?.gainScale).toBe(0);
  });

  it("multiplies several controllers rather than taking the last one", () => {
    // The pinned library mixes its microphones with three of these at once.
    const many = `<control>\nset_cc101=127\nset_cc103=64\n<region> sample=kick.wav lokey=36 hikey=36 pitch_keycenter=36 amplitude_oncc101=50 amplitude_oncc103=100`;
    expect(resolveInstrumentNote(asset, many, 36).note?.gainScale).toBeCloseTo(0.5 * (64 / 127), 6);
  });

  it("leaves a note with no such opcode exactly as it was", () => {
    // Every other criterion in this repository depends on this: a file that says nothing about controllers must sound unchanged.
    expect(resolveInstrumentNote(asset, region(undefined, 64), 36).note?.gainScale).toBeUndefined();
  });

  it("turns the scale into the decibels the voice actually gets", async () => {
    /**
     * The scale is a multiplier and the voice takes decibels, so the conversion is where a mistake would hide: the criterion reads the gain the voice was created with, not the number that was computed on the way.
     */
    const { player, gains } = playerFor(region("amplitude_oncc1=100", 64));
    await player.audition!({ assetId: "kit", midi: 36, gainDb: -3 });
    const voiceGain = gains[gains.length - 1]!;
    // −3 dB from the track, plus 20·log10(64/127) ≈ −5.95 dB from the controller.
    expect(voiceGain.gain.value).toBeCloseTo(Math.pow(10, (-3 - 5.95) / 20), 3);
  });

  it("starts an unaffected note at exactly the track's own gain", async () => {
    const { player, gains } = playerFor(region(undefined, 127));
    await player.audition!({ assetId: "kit", midi: 36, gainDb: -3 });
    expect(gains[gains.length - 1]!.gain.value).toBeCloseTo(Math.pow(10, -3 / 20), 6);
  });
});
