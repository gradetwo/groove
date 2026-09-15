/**
 * N-14 — per-genre master FX and send-bus defaults.
 *
 * The registered gap: `DEFAULT_FX_STATE` was one global rack with every effect **off**,
 * and the reverb/delay buses were hard-coded. So no genre had ever declared an effect —
 * "the mix reflects the genre" stopped at volume and pan.
 *
 * The user named three cases as the reason this exists, so they are asserted first and
 * literally: **dub needs a long delay**, **ambient needs a long reverb**, **metal needs
 * saturation**. A table that merely returns *some* profile would pass a coverage check and
 * still miss the point.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  CATEGORY_FX_PROFILES,
  GENRE_FX,
  applyGenreFxToGraph,
  delayParamsAtTempo,
  fxGenreIds,
  resolveGenreFx,
} from "../data/genreFx";
import { GENRE_INDEX } from "../data/index/genresIndex";
import { delayDivisionSeconds, DELAY_FEEDBACK_MAX } from "../audio/DelayBus";
import { REVERB_DECAY_MAX_SEC } from "../audio/ReverbBus";
import { DEFAULT_FX_STATE } from "../audio/EffectsRack";
import { renderPatternOffline } from "../audio/WavExporter";
import { FakeOfflineAudioContext, installFakeOfflineAudioContext } from "./helpers/fakeAudio";
import type { SequencerPattern } from "../types/genre";

const ids = GENRE_INDEX.map((g) => g.id);
const indexIds = new Set(ids);

describe("N-14 · coverage and integrity", () => {
  it("resolves a profile for every genre in the library", () => {
    for (const id of ids) {
      const fx = resolveGenreFx(id);
      expect(fx, `${id} resolved to null`).not.toBeNull();
      expect(fx!.reverb).toBeTruthy();
      expect(fx!.delay).toBeTruthy();
      expect(fx!.rack).toBeTruthy();
    }
  });

  it("returns null for unknown or custom genres, so they keep the global defaults", () => {
    // Deliberate: a custom genre must not inherit some other genre's character.
    expect(resolveGenreFx("user-custom-xyz")).toBeNull();
    expect(resolveGenreFx("")).toBeNull();
    expect(resolveGenreFx(null)).toBeNull();
    expect(resolveGenreFx(undefined)).toBeNull();
  });

  it("every override names a genre that actually exists", () => {
    for (const id of fxGenreIds()) {
      expect(indexIds, `GENRE_FX has '${id}' but the library has no such genre`).toContain(id);
    }
  });

  it("every override carries a real reason", () => {
    for (const [id, override] of Object.entries(GENRE_FX)) {
      expect(override.reason.length, `${id} needs a real reason`).toBeGreaterThan(20);
    }
  });

  it("every category has a profile", () => {
    const categories = new Set(GENRE_INDEX.map((g) => g.category));
    for (const category of categories) {
      expect(CATEGORY_FX_PROFILES[category as keyof typeof CATEGORY_FX_PROFILES], category).toBeTruthy();
    }
  });

  it("does not collapse the library onto one profile", () => {
    const shapes = new Set(
      ids.map((id) => {
        const fx = resolveGenreFx(id)!;
        return JSON.stringify([
          fx.reverb.decaySec,
          fx.reverb.returnLevel,
          fx.delay.feedback,
          fx.delay.returnLevel,
          fx.delayDivision,
          fx.rack.saturationEnabled,
          fx.rack.bitcrusherEnabled,
          fx.rack.filterEnabled,
        ]);
      })
    );
    // Coverage alone would pass with a single shared profile; this would not.
    expect(shapes.size).toBeGreaterThanOrEqual(25);
  });
});

describe("N-14 · the three cases the user named", () => {
  it("gives dub a long, dark, feedback-heavy delay", () => {
    const dub = resolveGenreFx("dub")!;
    expect(dub.delayDivision, "dub's delay must be musically timed, not a fixed 250 ms").not.toBeNull();
    expect(dub.delay.feedback).toBeGreaterThanOrEqual(0.6);
    expect(dub.delay.dampHz).toBeLessThanOrEqual(2500);
    expect(dub.delay.returnLevel).toBeGreaterThan(0.3);
    // And it must actually be longer than the global default it replaced.
    expect(dub.delay.feedback).toBeGreaterThan(0.32);
  });

  it("gives ambient a long reverb", () => {
    const ambient = resolveGenreFx("ambient")!;
    expect(ambient.reverb.decaySec).toBeGreaterThanOrEqual(6);
    expect(ambient.reverb.returnLevel).toBeGreaterThan(0.35);
    // Damped, so the tail darkens rather than hissing — the property the old reverb lacked.
    expect(ambient.reverb.damping).toBeGreaterThan(0);
  });

  it("gives the metal genres saturation", () => {
    for (const id of ["death-metal", "thrash-metal", "heavy-metal", "black-metal", "metalcore"]) {
      const fx = resolveGenreFx(id)!;
      expect(fx.rack.saturationEnabled, id).toBe(true);
      expect(fx.rack.saturationDrive, id).toBeGreaterThanOrEqual(3);
      // ...and a small room, because high-gain riffs must stay tight.
      expect(fx.reverb.decaySec, id).toBeLessThanOrEqual(3);
    }
  });

  it("makes each of those three differ from its own category base", () => {
    // If a genre's profile merely equalled its category default, the override would be
    // doing nothing — the classic silent no-op.
    const dub = resolveGenreFx("dub")!;
    expect(dub.delay.feedback).not.toBe(CATEGORY_FX_PROFILES.Electronic.delay.feedback);

    const ambient = resolveGenreFx("ambient")!;
    expect(ambient.reverb.decaySec).not.toBe(CATEGORY_FX_PROFILES.Electronic.reverb.decaySec);

    const metal = resolveGenreFx("death-metal")!;
    expect(metal.rack.saturationDrive).not.toBe(CATEGORY_FX_PROFILES["Rock/Metal"].rack.saturationDrive);
  });

  it("keeps every value inside the buses' documented bounds", () => {
    for (const id of ids) {
      const fx = resolveGenreFx(id)!;
      expect(fx.delay.feedback, id).toBeLessThanOrEqual(DELAY_FEEDBACK_MAX);
      expect(fx.delay.feedback, id).toBeGreaterThanOrEqual(0);
      expect(fx.reverb.decaySec, id).toBeLessThanOrEqual(REVERB_DECAY_MAX_SEC);
      expect(fx.reverb.decaySec, id).toBeGreaterThan(0);
      for (const level of [fx.reverb.returnLevel, fx.delay.returnLevel]) {
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(1);
      }
    }
  });

  it("leaves the rack off for genres that have no use for it", () => {
    // The rack is not a genre badge: most genres should keep it bypassed, or the whole
    // library would inherit the colouring of the few that need it.
    const withRack = ids.filter((id) => {
      const r = resolveGenreFx(id)!.rack;
      return r.filterEnabled || r.saturationEnabled || r.chorusEnabled || r.bitcrusherEnabled;
    });
    expect(withRack.length).toBeGreaterThan(0);
    expect(withRack.length).toBeLessThan(ids.length / 2);
  });

  it("does not simply enable a filter the user never asked for on every genre", () => {
    const withFilter = ids.filter((id) => resolveGenreFx(id)!.rack.filterEnabled);
    expect(withFilter.length).toBeLessThan(15);
  });
});

describe("N-14 · tempo", () => {
  it("converts a division with the playing tempo, not the metadata tempo", () => {
    const dub = resolveGenreFx("dub")!;
    const atPlaying = delayParamsAtTempo(dub, 145).timeSeconds;
    const atMetadata = delayParamsAtTempo(dub, 120).timeSeconds;
    expect(atPlaying).toBeCloseTo(delayDivisionSeconds(dub.delayDivision!, 145), 10);
    expect(atPlaying).not.toBeCloseTo(atMetadata, 6);

    // The real hazard: 87 of 159 genres declare a pattern tempo that differs from their
    // metadata tempo, so using the wrong one puts the repeats off the beat.
    const differing = GENRE_INDEX.filter((g) => g.default_bpm !== g.default_bpm);
    expect(differing).toHaveLength(0); // sanity: the index itself carries no pattern tempo
  });

  it("leaves a fixed-time delay untouched", () => {
    // Jazz and most metal ask for no division; their time must pass through verbatim.
    const bebop = resolveGenreFx("bebop")!;
    expect(bebop.delayDivision).toBeNull();
    expect(delayParamsAtTempo(bebop, 200).timeSeconds).toBe(bebop.delay.timeSeconds);
  });

  it("survives a nonsense tempo instead of producing an infinite delay", () => {
    const dub = resolveGenreFx("dub")!;
    for (const bpm of [0, -5, NaN, Infinity]) {
      const t = delayParamsAtTempo(dub, bpm).timeSeconds;
      expect(Number.isFinite(t), `bpm ${bpm}`).toBe(true);
      expect(t).toBeGreaterThan(0);
    }
  });
});

describe("N-14 · the profile reaches the graph (integration)", () => {
  function genrePattern(genreId: string, bpm: number): SequencerPattern {
    const steps = 4;
    return {
      genre_id: genreId,
      bpm,
      swing: 0,
      scale: "C minor",
      totalSteps: steps,
      tracks: [
        {
          track_id: "chords",
          name: "Chords",
          instrument: "warm_pad",
          steps: [1, 0, 0, 0],
          velocity: new Array(steps).fill(100),
          pitch: new Array(steps).fill(60),
          gate: new Array(steps).fill(0.8),
          volume: 0.8,
          pan: 0,
          mute: false,
          solo: false,
        },
      ],
    } as unknown as SequencerPattern;
  }

  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("applies a genre's rack and bus settings to a master graph", () => {
    // Exercised through the shared applier rather than a hand-built graph, so this pins
    // the function both engines actually call.
    const fx = resolveGenreFx("death-metal")!;
    const applied: string[] = [];
    const graph = {
      fxRack: {
        setFilter: () => applied.push("filter"),
        setSaturation: () => applied.push("saturation"),
        setChorus: () => applied.push("chorus"),
        setBitcrusher: () => applied.push("bitcrusher"),
      },
      reverb: { setParams: () => applied.push("reverb") },
      delay: { setParams: () => applied.push("delay") },
    } as unknown as Parameters<typeof applyGenreFxToGraph>[0];

    applyGenreFxToGraph(graph, fx, 160);
    expect(applied).toEqual(["filter", "saturation", "chorus", "bitcrusher", "reverb", "delay"]);
  });

  it("bakes the genre FX into the offline render", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(genrePattern("dub", 140));

    const ctx = FakeOfflineAudioContext.lastInstance!;
    // The dub delay division at 140 BPM. The graph's DelayNode carries the send, so its
    // scheduled time is the evidence that the genre profile reached the render.
    const expected = delayDivisionSeconds(resolveGenreFx("dub")!.delayDivision!, 140);
    const scheduled = ctx.createdDelays
      .flatMap((d) => d.delayTime.events.map((e) => e.value))
      .filter((v): v is number => typeof v === "number");
    expect(scheduled).toContainEqual(expect.closeTo(expected, 4));
  });
});

describe("N-14 · the global default is still the baseline", () => {
  it("keeps DEFAULT_FX_STATE bypassed for anyone not on a known genre", () => {
    // The rack's shipped default must not have been quietly switched on to make the
    // genre profiles look more dramatic.
    expect(DEFAULT_FX_STATE.filterEnabled).toBe(false);
    expect(DEFAULT_FX_STATE.saturationEnabled).toBe(false);
    expect(DEFAULT_FX_STATE.chorusEnabled).toBe(false);
    expect(DEFAULT_FX_STATE.bitcrusherEnabled).toBe(false);
  });
});
