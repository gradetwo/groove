import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSfz, regionsForNote } from "../audio/sfz/parse";
import { KeyswitchState } from "../audio/sfz/keyswitch";
import { resolveInstrumentNote } from "../audio/sfz/instrument";
import { createArrangementPlayer } from "../audio/playerFromEngine";
import { FakeAudioBuffer, FakeAudioContext } from "./helpers/fakeAudio";
import type { SampleAsset } from "../data/sampleCatalogue";

/**
 * ⭐ **The live keyswitch state machine** — `sw_last` sticky, `sw_down`／`sw_up` non-sticky, `sw_previous`, `sw_lolast`／`sw_hilast`, `sw_vel=previous`, and the
 * `sw_lokey`／`sw_hikey` range — driven through `KeyswitchState` and through the one path in this repository that has both a press and a release.
 *
 * ## Where the state lives, and the measurement that decided it
 *
 * `playerFromEngine.ts` — not `sampleLoader`. The reason is a line rather than an opinion: `audition` calls `createSampleLoader` **inside itself**, so the live
 * keyboard path builds a fresh loader on every key press and loader-held state would be forgotten between two notes of one performance. The player is the layer
 * that owns a *sequence* of presses for one instrument, and the arrangement keyboard (`ArrangementViewV2.tsx`) calls exactly its `audition`／`releaseNote` pair.
 * The state is keyed **by track**, because the reference engine keeps one `currentSwitch_` per loaded instrument (`sfizz`'s `SynthPrivate.h:292`), which here is one
 * track — and the multi-track criterion below holds the owner's requirement that two tracks cannot cross switches.
 *
 * ## The one question the specification pages do not answer, and what was measured instead
 *
 * **Does a keyswitch note also sound?** The `sfzformat` pages say what a keyswitch *selects* and never what the note itself does. The reference engine answers it in
 * code and the answer is **"it is not suppressed"**: `Synth::Impl::noteOnDispatch` has no early return for a switch note — it updates the switch and then runs the
 * ordinary `noteActivationLists_` loop, so a voice starts **iff some region's key range covers that note**
 * (<https://github.com/sfztools/sfizz/blob/f5c6e29f23b8057867c08e88f5f6ac6738baa30b/src/sfizz/Synth.cpp#L1355-L1379>). The one thing sfizz *does* withhold is the
 * MIDI-state update: `hdNoteOn` skips `midiState.noteOnEvent(...)` for a note in `lastKeyswitchLists_`, so a switch note never becomes "the last note played"
 * (`Synth.cpp:1265`). The criteria below pin both halves: a switch note whose key one region covers **sounds and switches at once**, and the conventional layout — where
 * the switch sits below every region's `lokey` — answers nothing for the switch note while still moving the state.
 *
 * ## `sw_vel`, `sw_lolast` and `sw_hilast` were said not to exist upstream, and they do
 *
 * All three have real pages (<https://sfzformat.com/opcodes/sw_vel/>, <https://sfzformat.com/opcodes/sw_lolast/>) and sfizz implements all three
 * (`Region.cpp`'s `sw_lolast`／`sw_hilast` arms build `lastKeyswitchRange`; `Voice.cpp:425` is the `sw_vel` override), so they are implemented here rather than
 * declared unimplemented. Nothing in the pinned VSCO `-KS` files uses them, which is why the real-file criteria above are about `sw_last` alone.
 */

const FIXTURES = join(__dirname, "fixtures", "sfz", "vsco2ce");
const CELLO_KS = readFileSync(join(FIXTURES, "CelloEns-KS.sfz"), "utf8");
const cello = { assetId: "vsco2ce:CelloEns-KS", sfz: { url: "https://example.test/CelloEns-KS.sfz" } };

/** A note of the real program, answered by the file's own `sw_default=c6` (the sustain group) until a switch is pressed. */
const NOTE = 60;

/**
 * Play one note against a live state — the whole of "what does this key sound now", in the order the live path does it.
 *
 * The `noteOn` **before** the resolution is not a convenience: it is the reference engine's order (`noteOnDispatch` sets the switch, matches the region, and only then
 * moves `sw_previous` on), and it is what makes `sw_previous` mean "the note before this one" rather than "this note".
 */
function play(text: string, note: number, state: KeyswitchState, options: { velocity?: number } = {}) {
  state.noteOn(note, options.velocity ?? 100);
  return resolveInstrumentNote(cello, text, note, { keyswitch: state, ...options });
}

describe("sw_default is the state a patch loads in", () => {
  it("⭐ answers the file's default articulation before any key is pressed", () => {
    // `sw_default`'s own page: *"Define keyswitch 'power on default' so that you hear something when a patch loads."*
    const state = new KeyswitchState();
    const first = play(CELLO_KS, NOTE, state);
    expect(first.ok).toBe(true);
    expect(first.note!.switchLabel).toBe("C6 Sustain Vibrato");
    // And the state agrees about what is in force, so a report can say it without resolving a note.
    expect(state.gate().switch).toBe(84);
    expect(state.gate().previousNote).toBeUndefined();
  });

  it("uses the chosen articulation as the starting state instead, through the same mechanism", () => {
    // Commit 1's "the track chose spiccato" *is* the state machine's initial state — one mechanism, not two.
    const state = new KeyswitchState();
    const first = resolveInstrumentNote(cello, CELLO_KS, NOTE, { keyswitch: state, technique: "spiccato" });
    expect(first.note!.switchLabel).toBe("D6 Spiccato");
    expect(state.gate().switch).toBe(86);
  });
});

describe("sw_last is sticky — the keyswitch keeps applying after it is released", () => {
  it("⭐ selecting the C#6 tremolo makes the following notes tremolo, and releasing C#6 does not undo it", () => {
    /**
     * <https://sfzformat.com/opcodes/sw_last/>: *"sw_last is a \"sticky\" keyswitch - after releasing the keyswitch note, it continues to affect notes until another
     * keyswitch is pressed."* The real program's second group is `C#6 Tremolo`, so pressing note 85 and then playing note 60 must answer `trem_`.
     */
    const state = new KeyswitchState();
    expect(play(CELLO_KS, NOTE, state).note!.samplePath).toContain("susvib_");

    state.noteOn(85, 100);
    const after = play(CELLO_KS, NOTE, state);
    expect(after.ok).toBe(true);
    expect(after.note!.samplePath).toContain("trem_");
    expect(after.note!.switchLabel).toBe("C#6 Tremolo");

    // ⭐ The sticky half: release the switch and the next note is **still** tremolo.
    state.noteOff(85);
    const released = play(CELLO_KS, NOTE, state);
    expect(released.note!.samplePath).toContain("trem_");
    expect(released.note!.switchLabel).toBe("C#6 Tremolo");

    // …and another switch takes over, which is the "until another keyswitch is pressed" half.
    state.noteOn(86, 100);
    expect(play(CELLO_KS, NOTE, state).note!.samplePath).toContain("spic_");
  });

  it("keeps one track's switch out of another's", () => {
    /**
     * ⭐ The owner's "多轨不能串". Two states are two instrument instances — the reference engine's scope — so a switch pressed on one must leave the other exactly
     * where it was.
     */
    const violinTrack = new KeyswitchState();
    const celloTrack = new KeyswitchState();
    violinTrack.noteOn(85, 100);
    expect(play(CELLO_KS, NOTE, violinTrack).note!.switchLabel).toBe("C#6 Tremolo");
    // The other track is untouched: still the file's own power-on default.
    const other = play(CELLO_KS, NOTE, celloTrack);
    expect(other.note!.switchLabel).toBe("C6 Sustain Vibrato");
    expect(celloTrack.gate().switch).toBe(84);
  });
});

/** A file in the shape ARIA's own `sw_down` example uses: a held ornament, and a default that applies while it is not held. */
const HELD = [
  "<global> sw_lokey=36 sw_hikey=38",
  "<group> sw_down=36 sw_label=Held Ornament",
  "<region> sample=ornament.wav lokey=60 hikey=60 pitch_keycenter=60",
  "<group> sw_up=36 sw_label=Default While Not Held",
  "<region> sample=plain.wav lokey=60 hikey=60 pitch_keycenter=60",
].join("\n");

describe("sw_down and sw_up are non-sticky — they apply only while the key is held", () => {
  it("⭐ sw_down applies while held and stops the moment it is released", () => {
    /**
     * <https://sfzformat.com/opcodes/sw_down/>: *"Enables the region to play if the key equal to `sw_down` value is depressed."* … *"`sw_down`, on the other hand, is
     * \"non-sticky\" and only affects notes played while the switch is held down."*
     */
    const state = new KeyswitchState();
    // Nothing held: the `sw_down` region is out and the `sw_up` one answers, which is that page's own "default articulation" case.
    expect(play(HELD, NOTE, state).note!.samplePath).toBe("plain.wav");

    state.noteOn(36, 100);
    const held = play(HELD, NOTE, state);
    expect(held.ok).toBe(true);
    expect(held.note!.samplePath).toBe("ornament.wav");

    // ⭐ The non-sticky half: the release takes it straight back.
    state.noteOff(36);
    expect(play(HELD, NOTE, state).note!.samplePath).toBe("plain.wav");
    expect([...state.gate().down]).toEqual([]);
  });

  it("reports which switches are held, so a surface can show the state rather than guess it", () => {
    const state = new KeyswitchState();
    // One note first, so the state has learned this file's `sw_down` target.
    play(HELD, NOTE, state);
    state.noteOn(36, 100);
    expect([...state.gate().down]).toEqual([36]);
    expect(state.describe().down).toEqual([36]);
    state.noteOff(36);
    expect(state.describe().down).toEqual([]);
  });
});

/** Two legato takes, selected by which note came *before* — the shape `sw_previous` exists for. */
const LEGATO = [
  "<group> sw_previous=60 sw_label=From C4",
  "<region> sample=from_c4.wav lokey=64 hikey=64 pitch_keycenter=64",
  "<group> sw_previous=62 sw_label=From D4",
  "<region> sample=from_d4.wav lokey=64 hikey=64 pitch_keycenter=64",
].join("\n");

describe("sw_previous uses the pitch of the last note-on", () => {
  it("⭐ answers a different region depending on which note was played before", () => {
    /**
     * <https://sfzformat.com/opcodes/sw_previous/>: *"Previous note value. The region will play if last note-on message was equal to `sw_previous` value."* … *"unlike
     * `sw_last`, the note specified by `sw_previous` doesn't need to fall in the `sw_lokey`/`sw_hikey` range"* — 60 and 62 are outside the regions' own key range, and
     * they still select.
     */
    const afterC4 = new KeyswitchState();
    afterC4.noteOn(60, 100);
    expect(play(LEGATO, 64, afterC4).note!.samplePath).toBe("from_c4.wav");

    const afterD4 = new KeyswitchState();
    afterD4.noteOn(62, 100);
    expect(play(LEGATO, 64, afterD4).note!.samplePath).toBe("from_d4.wav");

    // And with no note before it at all, nothing answers: a "previous" note that was never played is not a condition met.
    expect(play(LEGATO, 64, new KeyswitchState()).ok).toBe(false);
  });

  it("uses the note-on before this one, not the note that happens to be most recent", () => {
    // A release between the two presses must not erase the previous note-on: `sw_previous` is defined against the last **note-on** message.
    const state = new KeyswitchState();
    state.noteOn(60, 100);
    state.noteOff(60);
    expect(play(LEGATO, 64, state).note!.samplePath).toBe("from_c4.wav");
  });
});

describe("sw_lokey / sw_hikey decide which notes are switches", () => {
  it("⭐ does not let a note outside the range move the switch, even when a region's sw_last names it", () => {
    /**
     * <https://sfzformat.com/opcodes/sw_lokey/>: *"Defines the range of the keyboard to be used as trigger selectors for the `sw_last` opcode."* So a switch **value**
     * outside its own file's declared range is not a trigger selector however the file names it — pressing key 30 here must leave the state where it was rather than
     * setting it to 30.
     *
     * ⚠️ **This is the one place this project deliberately differs from sfizz**, which reads `sw_lokey`／`sw_hikey` into nothing at all
     * (`Region.cpp`: `case hash("sw_lokey"): // fallthrough` / `case hash("sw_hikey"): break;`). The two agree on every well-formed file; they differ only for a file whose
     * `sw_last` contradicts its own range, which is the file below. The specification's sentence is the one followed here, and `docs/KEYSWITCH.md` records the divergence.
     */
    const contradictory = "<global> sw_lokey=24 sw_hikey=26\n<group> sw_last=30 sw_label=Out Of Range\n<region> sample=out.wav lokey=60 hikey=60 pitch_keycenter=60";
    const state = new KeyswitchState();
    play(contradictory, NOTE, state);
    expect(state.gate().switch).toBeUndefined();
    state.noteOn(30, 100);
    // ⛔ 30 is the region's own `sw_last`, and it is still not a switch: the file says the trigger range is 24–26.
    expect(state.gate().switch).toBeUndefined();
    expect(play(contradictory, NOTE, state).ok).toBe(false);
  });

  it("does not let a note outside the real program's range move its switch", () => {
    // The pinned program declares `sw_lokey=c6 sw_hikey=d#6` (84–87); note 80 is a played note, not a switch.
    const state = new KeyswitchState();
    play(CELLO_KS, NOTE, state);
    state.noteOn(80, 100);
    expect(state.gate().switch).toBe(84);
    expect(play(CELLO_KS, NOTE, state).note!.switchLabel).toBe("C6 Sustain Vibrato");
  });

  it("does move the switch for a note inside the range, even one no region selects", () => {
    // 87 is the program's D#6 Pizzicato switch: it must select, and (below) it is a switch the file itself does not sound a note for.
    const state = new KeyswitchState();
    play(CELLO_KS, NOTE, state);
    state.noteOn(87, 100);
    expect(state.gate().switch).toBe(87);
    expect(play(CELLO_KS, NOTE, state).note!.samplePath).toContain("pizzT_");
  });
});

/** `sw_lolast`／`sw_hilast`: one region reachable from several switches — ARIA's own "fretting noises shared across articulations" case. */
const RANGE = [
  "<group> sw_lolast=36 sw_hilast=38 sw_label=Shared Take",
  "<region> sample=shared.wav lokey=60 hikey=60 pitch_keycenter=60",
  "<group> sw_last=40 sw_label=Other",
  "<region> sample=other.wav lokey=60 hikey=60 pitch_keycenter=60",
].join("\n");

describe("sw_lolast / sw_hilast — sw_last over a range of keyswitches", () => {
  it("⭐ is reachable from every switch inside its range", () => {
    // <https://sfzformat.com/opcodes/sw_lolast/>: *"Like sw_last, but allowing a region to be triggered across a range of keyswitches."*
    for (const key of [36, 37, 38]) {
      const state = new KeyswitchState();
      state.noteOn(key, 100);
      expect(play(RANGE, NOTE, state).note!.samplePath, `switch ${key}`).toBe("shared.wav");
    }
  });

  it("is not reachable from outside the range", () => {
    const state = new KeyswitchState();
    state.noteOn(39, 100);
    // 39 is not a switch at all, so no value is in force and the gated regions answer nothing.
    expect(play(RANGE, NOTE, state).ok).toBe(false);
  });

  it("does not answer for a switch value outside its range", () => {
    // ⭐ The discriminating half: note 60 is covered by both regions, so with `sw_last=40` in force the *other* one must answer rather than the shared take.
    const state = new KeyswitchState();
    state.noteOn(40, 100);
    expect(play(RANGE, NOTE, state).note!.samplePath).toBe("other.wav");
  });

  it("treats a one-ended range as the one-value range it is", () => {
    // sfizz's `sw_hilast` arm does `emplace(value, value)` and then moves one end, so `sw_hilast=38` alone is the range 38–38 and `sw_lolast=36` alone is 36–36.
    const highOnly = "<group> sw_hilast=38 sw_label=Up To 38\n<region> sample=up.wav lokey=60 hikey=60 pitch_keycenter=60";
    const at38 = new KeyswitchState();
    play(highOnly, NOTE, at38);
    at38.noteOn(38, 100);
    expect(play(highOnly, NOTE, at38).note!.samplePath).toBe("up.wav");
    const at37 = new KeyswitchState();
    play(highOnly, NOTE, at37);
    at37.noteOn(37, 100);
    expect(play(highOnly, NOTE, at37).ok).toBe(false);
  });
});

describe("sw_vel=previous — the region takes the previous note's velocity", () => {
  const VEL = [
    "<group> sw_vel=previous lovel=100 hivel=127",
    "<region> sample=loud.wav lokey=60 hikey=60 pitch_keycenter=60",
    "<group> sw_vel=previous lovel=0 hivel=99",
    "<region> sample=soft.wav lokey=60 hikey=60 pitch_keycenter=60",
  ].join("\n");

  it("⭐ selects the layer the previous note's velocity names, not this note's own", () => {
    /**
     * <https://sfzformat.com/opcodes/sw_vel/>: *"Allows overriding the velocity for the region with the velocity of the previous note. … if the previous velocity is
     * 100 and the velocity of the new note-on message is 60, the new region will play as if its velocity was 100."* So a quiet note after a loud one still answers the
     * loud layer here.
     */
    const state = new KeyswitchState();
    state.noteOn(55, 120);
    expect(play(VEL, 60, state, { velocity: 40 }).note!.samplePath).toBe("loud.wav");
    // The control: without the override, velocity 40 is the soft layer.
    expect(resolveInstrumentNote(cello, VEL, 60, { velocity: 40 }).note!.samplePath).toBe("soft.wav");
  });
});

describe("the keyswitch note itself", () => {
  /** One region that both switches and sounds, which is the case the specification pages leave unstated. */
  const SOUNDING_SWITCH = [
    "<group> sw_last=36 sw_label=The Switch",
    "<region> sample=switch.wav lokey=36 hikey=36 pitch_keycenter=36",
    "<region> sample=plain.wav lokey=60 hikey=60 pitch_keycenter=60",
  ].join("\n");

  it("⭐ sounds when a region's key range covers it — sfizz does not suppress it", () => {
    /**
     * Measured from the reference engine rather than read off a page: `Synth::Impl::noteOnDispatch` sets the switch and then runs the ordinary activation loop, so
     * pressing 36 sounds `switch.wav` *and* leaves 36 in force for the next note.
     */
    const state = new KeyswitchState();
    const switchNote = play(SOUNDING_SWITCH, 36, state);
    expect(switchNote.ok).toBe(true);
    expect(switchNote.note!.samplePath).toBe("switch.wav");
    // …and it did move the state, since `sw_last=36` is the value it selected.
    expect(state.gate().switch).toBe(36);
    expect(play(SOUNDING_SWITCH, 60, state).note!.samplePath).toBe("plain.wav");
  });

  it("still moves the switch when no region covers it, which is the conventional layout", () => {
    // The pinned `-KS` programs put their switches below every region's `lokey`, so the press is silent and the state moves anyway — sfizz's `hdNoteOn` skips only the MIDI-state update, never the state.
    const state = new KeyswitchState();
    const sounding = play(CELLO_KS, 85, state);
    expect(sounding.ok).toBe(false);
    expect(state.gate().switch).toBe(85);
    expect(play(CELLO_KS, NOTE, state).note!.switchLabel).toBe("C#6 Tremolo");
  });
});

describe("a file with no sw_default and no key pressed still answers nothing", () => {
  /** The documented "silent until a keyswitch is pressed" shape, and the reverse criterion that says this change did **not** relax it. */
  const NO_DEFAULT = [
    "<group> sw_lokey=36 sw_hikey=38 sw_last=36 sw_label=Sustain",
    "<region> sample=sus.wav lokey=60 hikey=60 pitch_keycenter=60",
    "<group> sw_last=37 sw_label=Tremolo",
    "<region> sample=trem.wav lokey=60 hikey=60 pitch_keycenter=60",
  ].join("\n");

  it("⛔ is refused with a reason before any switch is pressed, and plays after one is", () => {
    // <https://sfzformat.com/opcodes/sw_last/>: *"it will play no sound until one of the keyswitches is pressed"*.
    const state = new KeyswitchState();
    const before = play(NO_DEFAULT, NOTE, state);
    expect(before.ok).toBe(false);
    expect(before.reason).toContain("no playback");
    expect(state.gate().switch).toBeUndefined();

    state.noteOn(37, 100);
    const after = play(NO_DEFAULT, NOTE, state);
    expect(after.ok).toBe(true);
    expect(after.note!.samplePath).toBe("trem.wav");
    expect(after.note!.switchLabel).toBe("Tremolo");
  });

  it("is still refused by the pure region search, which is the same rule without a state object", () => {
    // The offline rule and the live one are one rule: no value in force closes the gate in both.
    expect(regionsForNote(parseSfz(NO_DEFAULT), NOTE)).toHaveLength(0);
    expect(regionsForNote(parseSfz(NO_DEFAULT), NOTE, 100, 1, { switch: 37 })).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------------------------------------ */
/*                        the same machine, through the realtime playback path                        */
/* ------------------------------------------------------------------------------------------------ */

const KS_SFZ = [
  "<group> sw_default=36 sw_lokey=36 sw_hikey=38 sw_last=36 sw_label=C2 Sustain",
  "<region> sample=sus.wav lokey=60 hikey=72 pitch_keycenter=60",
  "<group> sw_last=37 sw_label=C#2 Tremolo",
  "<region> sample=trem.wav lokey=60 hikey=72 pitch_keycenter=60",
].join("\n");

const KS_ASSETS: SampleAsset[] = [
  { assetId: "ks", name: "Keyswitch instrument", kind: "one-shot", seconds: 1, sfz: { url: "/samples/ks.sfz", path: "ks.sfz" } },
  { assetId: "sus.wav", name: "sus", kind: "one-shot", seconds: 1, url: "/samples/sus.wav" },
  { assetId: "trem.wav", name: "trem", kind: "one-shot", seconds: 1, url: "/samples/trem.wav" },
];

function playerWith(context: FakeAudioContext) {
  return createArrangementPlayer({
    engine: { audioContext: context as never, musicDestination: context.createGain() as never },
    loadCatalogue: async () => ({ assets: KS_ASSETS }),
    decode: async () => new FakeAudioBuffer(1, 48000, 48000) as unknown as AudioBuffer,
    fetchSfzText: async () => KS_SFZ,
  });
}

describe("the live keyboard path holds the state", () => {
  it("⭐ a keyswitch key press changes what the *next* key press plays, and the release does not undo it", async () => {
    const player = playerWith(new FakeAudioContext());
    // Before: the file's own default.
    const before = await player.audition!({ assetId: "ks", midi: 65, trackId: "track-a" });
    expect(before.ok && before.samplePath).toBe("sus.wav");
    expect(before.ok && before.switchLabel).toBe("C2 Sustain");

    // Press the C#2 switch. It sounds nothing — the file has no region that low — and it leaves the state moved.
    const press = await player.audition!({ assetId: "ks", midi: 37, trackId: "track-a" });
    expect(press.ok).toBe(false);
    const after = await player.audition!({ assetId: "ks", midi: 65, trackId: "track-a" });
    expect(after.ok && after.samplePath).toBe("trem.wav");
    expect(after.ok && after.switchLabel).toBe("C#2 Tremolo");

    // Release the switch: sticky, so the next note is still tremolo.
    player.releaseNote!({ midi: 37, trackId: "track-a" });
    const released = await player.audition!({ assetId: "ks", midi: 65, trackId: "track-a" });
    expect(released.ok && released.samplePath).toBe("trem.wav");
  });

  it("⭐ keeps two tracks' switches apart, which is the owner's 多轨不能串", async () => {
    const player = playerWith(new FakeAudioContext());
    const pressSwitch = await player.audition!({ assetId: "ks", midi: 37, trackId: "track-a" });
    expect(pressSwitch.ok).toBe(false);
    const a = await player.audition!({ assetId: "ks", midi: 65, trackId: "track-a" });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.samplePath).toBe("trem.wav");

    // ⭐ A track that never pressed anything is exactly where the file's own `sw_default` left it — not where track-a left it.
    const b = await player.audition!({ assetId: "ks", midi: 65, trackId: "track-b" });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.samplePath).toBe("sus.wav");
    expect(b.switchLabel).toBe("C2 Sustain");
  });

  it("⭐ lets a release take a sw_down ornament straight back out, through the same path", async () => {
    /**
     * The non-sticky half of <https://sfzformat.com/opcodes/sw_down/> on the **live** path: `releaseNote` has to reach the state, or a held ornament would stay
     * selected for the rest of the session. It reaches it before the voice bookkeeping, so a switch that started no voice still releases.
     */
    const held = [
      "<global> sw_lokey=36 sw_hikey=38",
      "<group> sw_down=36 sw_label=Held Ornament",
      "<region> sample=ornament.wav lokey=60 hikey=72 pitch_keycenter=60",
      "<group> sw_up=36 sw_label=Default While Not Held",
      "<region> sample=plain.wav lokey=60 hikey=72 pitch_keycenter=60",
    ].join("\n");
    const player = createArrangementPlayer({
      engine: { audioContext: new FakeAudioContext() as never, musicDestination: new FakeAudioContext().createGain() as never },
      loadCatalogue: async () => ({ assets: [...KS_ASSETS, { assetId: "ornament.wav", name: "o", kind: "one-shot", seconds: 1, url: "/samples/ornament.wav" },
        { assetId: "plain.wav", name: "p", kind: "one-shot", seconds: 1, url: "/samples/plain.wav" }] }),
      decode: async () => new FakeAudioBuffer(1, 48000, 48000) as unknown as AudioBuffer,
      fetchSfzText: async () => held,
    });

    const before = await player.audition!({ assetId: "ks", midi: 65, trackId: "t" });
    expect(before.ok && before.samplePath).toBe("plain.wav");

    expect((await player.audition!({ assetId: "ks", midi: 36, trackId: "t" })).ok).toBe(false);
    const ornament = await player.audition!({ assetId: "ks", midi: 65, trackId: "t" });
    expect(ornament.ok).toBe(true);
    if (!ornament.ok) return;
    expect(ornament.samplePath).toBe("ornament.wav");

    player.releaseNote!({ midi: 36, trackId: "t" });
    const released = await player.audition!({ assetId: "ks", midi: 65, trackId: "t" });
    expect(released.ok).toBe(true);
    if (!released.ok) return;
    expect(released.samplePath).toBe("plain.wav");
  });
});
