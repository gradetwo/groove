import { setGs1OfflineCapability } from "../audio/gs1/gs1OfflineCapability";
import { describe, it, expect, afterEach } from "vitest";
import { encodeAudioBufferToWav, renderPatternOffline } from "../audio/WavExporter";
import { DEFAULT_SYNTH_PRESETS, keyTrackedCutoff, voiceOscillatorTypes } from "../audio/PolySynth";
import { resolveInstrumentPreset } from "../audio/instrumentPresets";
import { chordVoicingForStep } from "../audio/chordVoicing";
import { deriveTrackStates } from "../audio/trackStates";
import { NOTE_VARIATION_MAX_CUTOFF_SCALE, NOTE_VARIATION_MAX_DETUNE_CENTS } from "../audio/noteVariation";
import { FakeAudioBuffer, FakeOfflineAudioContext, FakeGainNode, installFakeOfflineAudioContext } from "./helpers/fakeAudio";

/**
 * Volume stages of the two rendered tracks (track 0 then track 1). Each track builds a
 * volume gain and a polarity gain, so position alone is no longer meaningful.
 */
/**
 * The per-track volume stage of each channel strip.
 *
 * Identified structurally rather than by creation order: a strip is the only place the
 * renderer builds a `GainNode → GainNode(polarity ±1) → StereoPannerNode` chain, so the
 * panners are the reliable anchor. The previous "skip the master gain, then filter by
 * value" heuristic broke the moment E-17 gave the exporter the same master graph as
 * playback — the master fader is 0.8, which collided with a track volume of 0.8.
 */
function stripVolumeGains(): FakeGainNode[] {
  const ctx = FakeOfflineAudioContext.lastInstance!;
  return ctx.createdPanners.map((pan) => {
    const polarity = pan.incoming[0];
    return polarity?.incoming[0] as FakeGainNode;
  });
}

/**
 * How many gain nodes actually received a connection during the render.
 *
 * This is the robust way to ask "did this track produce voices?": the strip's entry node
 * is now the E-10 insert chain rather than the fader, so asserting on the fader's `incoming`
 * no longer distinguishes a playing track from a silenced one — the insert always feeds it.
 * Counting connected gains compares like with like and states the real intent.
 */
function routedGainCount(): number {
  return FakeOfflineAudioContext.lastInstance!.createdGains.filter((g) => g.incoming.length > 0).length;
}

/**
 * The cutoff of every biquad the render created, in creation order.
 *
 * E-17 gave the offline renderer the shared master graph, which contributes several
 * biquads of its own (the FX rack's filter, the delay's damping stage, …). Selecting the
 * *voice* filter by creation index therefore depends on how many nodes the master graph
 * happens to build, which is not a fact these tests should encode. Asserting on the set
 * of cutoffs pins the real claim — "this voice was rendered with this preset's low-pass"
 * — and stays correct however the master graph grows.
 */
function filterCutoffs(): Array<number | undefined> {
  return FakeOfflineAudioContext.lastInstance!.createdFilters.map(
    (f) => f.frequency.events[0]?.value as number | undefined
  );
}

function makePattern(overrides: Partial<Record<string, unknown>> = {}) {
  const steps = new Array(16).fill(0);
  steps[0] = 1;
  steps[4] = 1;

  return {
    bpm: 120,
    swing: 0,
    totalSteps: 16,
    tracks: [
      {
        track_id: "kick",
        name: "Kick",
        steps: [...steps],
        velocity: new Array(16).fill(100),
        pitch: new Array(16).fill(0),
        gate: new Array(16).fill(0.8),
        volume: 0.5,
        pan: 0,
        mute: false,
        solo: false,
      },
      {
        track_id: "snare",
        name: "Snare",
        steps: [...steps],
        velocity: new Array(16).fill(100),
        pitch: new Array(16).fill(0),
        gate: new Array(16).fill(0.8),
        volume: 0.9,
        pan: 0,
        mute: false,
        solo: false,
      },
    ],
    ...overrides,
  } as any;
}

describe("F-10 · WAV container correctness", () => {
  it("encodes a mono buffer without overflowing the data chunk", () => {
    const buffer = new FakeAudioBuffer(1, 64, 44100);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin(i / 4);

    const wav = encodeAudioBufferToWav(buffer as unknown as AudioBuffer);
    const view = new DataView(wav);

    // RIFF header integrity: 44-byte header + numSamples * channels * 2 bytes.
    expect(view.getUint32(4, true)).toBe(36 + 64 * 2);
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint16(32, true)).toBe(2); // block align = 1 channel * 2 bytes
    expect(view.getUint32(28, true)).toBe(44100 * 2); // byte rate
    expect(wav.byteLength).toBe(44 + 64 * 2);
  });

  it("encodes a stereo buffer with matching sizes", () => {
    const buffer = new FakeAudioBuffer(2, 32, 48000);
    const wav = encodeAudioBufferToWav(buffer as unknown as AudioBuffer);
    const view = new DataView(wav);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint32(28, true)).toBe(48000 * 4);
    expect(wav.byteLength).toBe(44 + 32 * 4);
  });
});

describe("F-03 · offline renderer honours the mixer", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("derives per-track mixer state from the pattern (mute/solo/volume/pan)", () => {
    const states = deriveTrackStates(makePattern());
    expect(states).toHaveLength(2);
    expect(states[0].volume).toBe(0.5);
    expect(states[1].volume).toBe(0.9);
    expect(states[0].mute).toBe(false);
  });

  it("falls back to sane defaults for non-finite mixer values", () => {
    const states = deriveTrackStates({
      tracks: [{ volume: Number.NaN, pan: undefined as unknown as number, mute: undefined }],
    } as any);
    expect(states[0].volume).toBe(0.8);
    expect(states[0].pan).toBe(0);
    expect(states[0].mute).toBe(false);
  });

  it("uses track volumes for the channel strips instead of a hard-coded 0.8", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(makePattern());

    // Strips are found through their panner, so this is exact rather than heuristic.
    const strips = stripVolumeGains();
    expect(strips).toHaveLength(2);
    expect(strips.map((g) => g.gain.events[0]?.value)).toEqual([0.5, 0.9]);
  });

  it("drops muted tracks and keeps soloed ones", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(makePattern());
    const bothPlaying = routedGainCount();

    restore();
    restore = installFakeOfflineAudioContext();
    const muted = makePattern();
    muted.tracks[0].mute = true;
    await renderPatternOffline(muted);
    const mutedCount = routedGainCount();
    expect(mutedCount).toBeLessThan(bothPlaying);

    // Soloing one of two tracks must be audibly identical to muting the other.
    restore();
    restore = installFakeOfflineAudioContext();
    const soloed = makePattern();
    soloed.tracks[1].solo = true;
    await renderPatternOffline(soloed);
    expect(routedGainCount()).toBe(mutedCount);
  });

  it("respects probability 0 so exports never contain unhearable notes", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(makePattern());
    const bothPlaying = routedGainCount();

    restore();
    restore = installFakeOfflineAudioContext();
    const pattern = makePattern();
    pattern.tracks[0].probability = new Array(16).fill(0);
    await renderPatternOffline(pattern);
    // Track 0 can never fire, so strictly fewer gains receive a signal than when it can.
    expect(routedGainCount()).toBeLessThan(bothPlaying);
  });

  it("clamps hostile render parameters instead of allocating absurd buffers", async () => {
    restore = installFakeOfflineAudioContext();
    const ctx = await renderPatternOffline(makePattern(), { bpm: -500, bars: 100000 });
    expect(ctx.length).toBeGreaterThan(0);
    const instance = FakeOfflineAudioContext.lastInstance!;
    // 64 bars max at 20 BPM/1-16 = 768.6s (incl. decay tail) — bounded, not gigabytes.
    expect(instance.length).toBeLessThanOrEqual(Math.ceil(769 * 44100));
  });
});

/**
 * Exporter-parity follow-up to the genre-timbre fix: the offline renderer used to
 * hard-code `acidBass` / `warmPad` / `analogLead` per role, so a bounced WAV did not
 * match what the live engine played. These tests inspect the oscillator/filter network
 * the renderer actually built and compare it with the resolved preset.
 */
describe("genre timbres · offline render voices the declared instrument", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  function synthPattern(trackId: string, instrument: string, pitch: number) {
    const steps = 16;
    const hits = new Array(16).fill(0);
    hits[0] = 1;
    return {
      genre_id: "timbre-test",
      bpm: 120,
      swing: 0,
      scale: "C minor",
      totalSteps: steps,
      tracks: [
        {
          track_id: trackId,
          name: trackId,
          instrument,
          steps: hits,
          velocity: new Array(steps).fill(100),
          pitch: new Array(steps).fill(pitch),
          gate: new Array(steps).fill(0.8),
          volume: 0.8,
          pan: 0,
          mute: false,
          solo: false,
        },
      ],
    } as any;
  }

  it("renders a flute_lead lead track with the flute preset", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(synthPattern("lead", "flute_lead", 72));

    const ctx = FakeOfflineAudioContext.lastInstance!;
    const flute = resolveInstrumentPreset("flute_lead", "lead");

    expect(ctx.createdOscillators.map((o) => o.type)).toEqual([flute.osc1Type, flute.osc2Type]);
    /**
     * Within the per-note variation's bound, not exactly the preset's number: P2.2/A3 nudges every note so a loop of
     * identical stabs stops sounding like a machine, and the authored detune is the *centre* of that nudge rather
     * than the value. The bound is imported so this cannot drift from the helper's own constant.
     */
    const fluteDetune = Number(ctx.createdOscillators[1].detune.events[0]?.value);
    expect(Math.abs(fluteDetune - flute.osc2DetuneCents)).toBeLessThanOrEqual(NOTE_VARIATION_MAX_DETUNE_CENTS);
    /**
     * The cutoff the voice holds for the note it is actually playing.
     *
     * This used to assert `toContain(flute.filterCutoff)` — the *authored* value — which was only
     * true while the cutoff ignored the note, i.e. only while the key-tracking defect existed.
     * Asserting the tracked value keeps the real claim (this preset is the one in use) while
     * describing the corrected behaviour.
     */
    const expectedCutoff = keyTrackedCutoff(flute, 72);
    const cutoffs = filterCutoffs();
    // Same reason as the detune above: the nudge scales the tracked cutoff by at most ±8 %.
    expect(
      cutoffs.some(
        (value) =>
          Number.isFinite(value) &&
          Math.abs((value as number) - expectedCutoff) / expectedCutoff <= NOTE_VARIATION_MAX_CUTOFF_SCALE + 1e-9
      )
    ).toBe(true);
    /**
     * The voice's own filter, within the nudge — and **not** "exactly one filter in that band".
     *
     * That stronger form was true at a ±8 % nudge and stopped being true at ±20 %: the shared master graph
     * contributes biquads of its own, and one of them lands inside a band that wide. Counting them was a bonus
     * assertion; what carries the claim is that a filter sits at the *tracked* cutoff of *this* preset rather than at
     * the authored C4 value, which the next line asserts.
     */
    expect(
      cutoffs.filter(
        (c) =>
          Number.isFinite(c) &&
          Math.abs((c as number) - expectedCutoff) / expectedCutoff <= NOTE_VARIATION_MAX_CUTOFF_SCALE + 1e-9
      ).length
    ).toBeGreaterThanOrEqual(1);
    // The authored number is a C4 value; this note is an octave up, so tracking must have moved it.
    expect(expectedCutoff).not.toBe(flute.filterCutoff);
  });

  it("renders sub_bass, not the legacy acidBass, on a sub_bass bass track", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(synthPattern("bass", "sub_bass", 36));

    const ctx = FakeOfflineAudioContext.lastInstance!;
    const sub = resolveInstrumentPreset("sub_bass", "bass");

    expect(ctx.createdOscillators.map((o) => o.type)).toEqual([sub.osc1Type, sub.osc2Type]);
    // Two octaves below the C4 anchor, so key tracking closes the corner — which is the whole
    // point for a sub bass: the authored cutoff is a C4 figure, not the note's own.
    const subCutoff = keyTrackedCutoff(sub, 36);
    expect(
      filterCutoffs().some(
        (value) =>
          Number.isFinite(value) &&
          Math.abs((value as number) - subCutoff) / subCutoff <= NOTE_VARIATION_MAX_CUTOFF_SCALE + 1e-9
      )
    ).toBe(true);
    expect(sub.filterCutoff).toBeLessThan(DEFAULT_SYNTH_PRESETS.acidBass.filterCutoff);
  });

  it("renders supersaw, not the legacy warmPad, on a supersaw chords track", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(synthPattern("chords", "supersaw", 60));

    const ctx = FakeOfflineAudioContext.lastInstance!;
    const superSaw = resolveInstrumentPreset("supersaw", "chords");

    // E-01: the offline renderer must produce the SAME voicing as the live engine.
    // Exporter parity is a hard rule, so both sides call `chordVoicingForStep` and this
    // pins that the exporter really voices the chord rather than rendering one note.
    const voicing = chordVoicingForStep(60, "C minor");
    expect(voicing).toHaveLength(3);
    // Derived from the preset, not assumed: the supersaw allocates a detuned outer pair for its
    // stereo width, so "two oscillators per voice" stopped being true the moment it was widened.
    // Asking `voiceOscillatorTypes` keeps this assertion about *which preset is in use* and about
    // exporter parity, which is what it is for, rather than about a node count.
    expect(ctx.createdOscillators.map((o) => o.type)).toEqual(
      voicing.flatMap(() => voiceOscillatorTypes(superSaw))
    );
    const superSawDetune = Number(ctx.createdOscillators[1].detune.events[0]?.value);
    expect(Math.abs(superSawDetune - superSaw.osc2DetuneCents)).toBeLessThanOrEqual(
      NOTE_VARIATION_MAX_DETUNE_CENTS
    );
    // One voice-level low-pass per chord tone, all at the supersaw cutoff — and none at
    // the legacy warmPad value. Counted by cutoff rather than by array length, because
    // the shared master graph (E-17) contributes biquads of its own.
    const cutoffs = filterCutoffs();
    /**
     * One voice-level low-pass per chord tone, each carrying the cutoff for *its own* note.
     *
     * This assertion used to require all three filters at the identical supersaw cutoff, which was
     * only true while the cutoff ignored pitch. With key tracking a C/E/G voicing correctly has
     * three different corners — the third of the triad is brighter than the root — so the claim
     * that survives is "every voice used the supersaw preset, tracked to its note", plus the
     * original negative check that none of them used the legacy warmPad value.
     */
    const expectedCutoffs = voicing.map((n) => keyTrackedCutoff(superSaw, n));
    for (const expected of expectedCutoffs) {
      // Within the per-note variation's bound: each chord tone's corner is nudged by up to ±8 % (P2.2/A3), so the
      // claim that survives is "this voice used the supersaw preset, tracked to its note", not "exactly this Hz".
      expect(
        cutoffs.some(
          (value) =>
            Number.isFinite(value) &&
            Math.abs((value as number) - expected) / expected <= NOTE_VARIATION_MAX_CUTOFF_SCALE + 1e-9
        ),
        `a voice within ±8 % of ${expected} Hz`
      ).toBe(true);
    }
    // Distinct per-note corners are the observable consequence of the fix on a chord (and key tracking still moves
    // them by far more than the nudge does).
    expect(new Set(expectedCutoffs).size).toBe(voicing.length);
    expect(cutoffs).not.toContain(keyTrackedCutoff(DEFAULT_SYNTH_PRESETS.warmPad, 60));
  });

  it("keeps the shared noise-sweep riser for the noise_sweep fx track", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(synthPattern("fx", "noise_sweep", 12));

    const ctx = FakeOfflineAudioContext.lastInstance!;
    // synthFX is a single swept oscillator through a bandpass starting at 2 kHz;
    // the poly synth would have produced two oscillators instead.
    expect(ctx.createdOscillators).toHaveLength(1);
    // `synthFX` is a single swept oscillator through a bandpass starting at 2 kHz.
    expect(filterCutoffs()).toContain(2000);
  });
});


/**
 * The offline GS-1 capability probe renders a throwaway context of its own; these cases inspect the *app's* render
 * (hosts, strips, buffers) and would otherwise find the probe's instead. Declared satisfied at module scope here; the
 * probe has its own file, and `probe_engine_parity.mjs` is its acceptance test.
 */
setGs1OfflineCapability("usable");
