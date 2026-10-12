/**
 * A Web Audio node may not sum three or more oscillators tuned to *different* frequencies.
 *
 * This is not a style rule; it is a measured property of Chrome's `OfflineAudioContext`, and this
 * project's central export claim depends on it. The measurement is in
 * `scripts/diagnose_repeat_determinism.mjs --primitives`, which renders a minimal graph repeatedly
 * and hashes the raw samples:
 *
 * | graph                                          | distinct hashes / 10 renders |
 * |------------------------------------------------|------------------------------|
 * | 1 oscillator                                   | 1 (reproducible)             |
 * | 2 oscillators                                  | 1                            |
 * | 3 oscillators, all the same frequency          | 1                            |
 * | 3 oscillators, different frequencies           | 3                            |
 * | 4 oscillators, different frequencies           | 7                            |
 * | 5 or 6 oscillators, different frequencies      | 9-10                         |
 * | 3 *buffer sources* summed                      | 1                            |
 * | 4 oscillators fanned in two per node           | 1                            |
 *
 * Same-frequency oscillators are fine, buffer sources are fine, and a fan-in of two is fine. Only
 * the combination of *several distinct oscillator frequencies into one node* breaks it — which is
 * consistent with Chrome building band-limited `PeriodicWave` tables lazily: oscillators at the same
 * frequency share one table, a buffer source has no table, and a render that starts while a table is
 * still being filled gets different samples than one that starts later. That also explains the
 * footprint of the defect: differences appear from the first note, are tiny and randomly signed, and
 * land in whatever frequency band the offending partials occupy.
 *
 * The fix for a voice that needs a dense inharmonic stack is therefore to synthesise the partials
 * into an `AudioBuffer` and play that with one source, or to fan them in two at a time. This test
 * holds the line: it is what stops the next "add another partial for richness" change from quietly
 * making every export unreproducible again.
 */
import { describe, it, expect } from "vitest";
import {
  FakeNode,
  FakeOfflineAudioContext,
  FakeOscillatorNode,
  installFakeOfflineAudioContext,
} from "./helpers/fakeAudio";
import {
  PERCUSSION_MODEL_IDS,
  synthesizeHiHat,
  synthesizeKick,
  synthesizePercussion,
  synthesizeSnare,
} from "../audio/DrumKitModels";
import { KICK_PRESETS, synthesizeAnatomyKickVoice } from "../audio/AnatomyKickEngine";
import { DEFAULT_SYNTH_PRESETS, playPolySynthNote } from "../audio/PolySynth";

/** The first frequency each oscillator was given — its identity for the purposes of this rule. */
function firstFrequency(osc: FakeOscillatorNode): number {
  const event = osc.frequency.events.find((e) => typeof e.value === "number");
  return event ? (event.value as number) : osc.frequency.value;
}

/**
 * Every node in the rendered graph where three or more oscillators mix *for the first time*.
 *
 * "For the first time" is the part that matters, and it is what the measurements distinguish:
 * four oscillators fanned in two-per-node are reproducible, while the same four fanned into one node
 * are not. So the walk stops as soon as it reaches a node that already has two or more inputs — those
 * oscillators have mixed somewhere else, and what arrives here is a single signal.
 *
 * A node whose fresh oscillators all share one frequency is not a violation either: that case
 * measures reproducible, because oscillators at the same frequency share one band-limited table.
 */
function crowdedNodes(ctx: FakeOfflineAudioContext): Array<{ incoming: number; distinct: number; freqs: number[] }> {
  const nodes = [
    ...ctx.createdGains,
    ...ctx.createdFilters,
    ...ctx.createdOscillators,
    ...ctx.createdBufferSources,
  ] as FakeNode[];

  /** Oscillators reaching `node` without having passed through another mixing point. */
  const freshOscillators = (node: FakeNode, seen = new Set<FakeNode>()): FakeOscillatorNode[] => {
    if (seen.has(node)) return [];
    seen.add(node);
    if (node instanceof FakeOscillatorNode) return [node];
    if (node.incoming.length !== 1) return [];
    return freshOscillators(node.incoming[0], seen);
  };

  const seen = new Set<FakeNode>();
  const violations: Array<{ incoming: number; distinct: number; freqs: number[] }> = [];
  for (const node of nodes) {
    if (seen.has(node)) continue;
    seen.add(node);
    if (node.incoming.length < 2) continue;
    const oscs = node.incoming.flatMap((src) => freshOscillators(src));
    if (oscs.length < 3) continue;
    const freqs = oscs.map(firstFrequency);
    const distinct = new Set(freqs.map((f) => f.toFixed(4))).size;
    if (distinct >= 2) violations.push({ incoming: oscs.length, distinct, freqs });
  }
  return violations;
}

describe("no voice sums three or more differently-tuned oscillators into one node", () => {
  const restore = installFakeOfflineAudioContext();

  /** Render one voice on a fresh fake graph and report its crowded nodes. */
  const voilationsFor = (build: (ctx: BaseAudioContext, dest: AudioNode, buf: AudioBuffer) => unknown, label: string) => {
    const ctx = new FakeOfflineAudioContext(2, 4096, 44100);
    const dest = ctx.createGain() as unknown as AudioNode;
    const buffer = ctx.createBuffer(1, 88200, 44100) as unknown as AudioBuffer;
    build(ctx as unknown as BaseAudioContext, dest, buffer);
    const violations = crowdedNodes(ctx);
    return violations.map((v) => `${label}: ${v.incoming} oscillators, ${v.distinct} distinct freqs`);
  };

  const KITS = ["808", "909", "acoustic", "cyber"] as const;

  const cases: Array<[string, (ctx: BaseAudioContext, dest: AudioNode, buf: AudioBuffer) => unknown]> = [
    ...KITS.map(
      (kit): [string, (c: BaseAudioContext, d: AudioNode, b: AudioBuffer) => unknown] => [
        `kick ${kit}`,
        (c, d, b) => synthesizeKick(c, d, 0, 1, 0, kit, b, 7),
      ]
    ),
    ...KITS.map(
      (kit): [string, (c: BaseAudioContext, d: AudioNode, b: AudioBuffer) => unknown] => [
        `snare ${kit}`,
        (c, d, b) => synthesizeSnare(c, d, 0, 1, 0, kit, b, 7),
      ]
    ),
    ...KITS.flatMap(
      (kit): Array<[string, (c: BaseAudioContext, d: AudioNode, b: AudioBuffer) => unknown]> => [
        // stepVal 1 = closed, 2 = open: the open hat is the longest and uses the same cluster.
        [`hihat ${kit} closed`, (c, d, b) => synthesizeHiHat(c, d, 0, 1, 0, kit, 1, 0.125, 0.8, b, 7)],
        [`hihat ${kit} open`, (c, d, b) => synthesizeHiHat(c, d, 0, 1, 0, kit, 2, 0.125, 0.8, b, 7)],
      ]
    ),
    ...PERCUSSION_MODEL_IDS.map(
      (id): [string, (c: BaseAudioContext, d: AudioNode, b: AudioBuffer) => unknown] => [
        `percussion ${id}`,
        (c, d, b) => synthesizePercussion(c, d, 0, 1, 0, "909", b, 7, id),
      ]
    ),
    ...KICK_PRESETS.map(
      (preset): [string, (c: BaseAudioContext, d: AudioNode, b: AudioBuffer) => unknown] => [
        `anatomy kick ${preset.id}`,
        (c, d) => synthesizeAnatomyKickVoice(c, d, 0, 1, preset.id, null, 7),
      ]
    ),
    /**
     * Every *melodic* preset too.
     *
     * The rule was measured on drum voices and only ever applied to them, but the failure it guards
     * is not a drum problem: a preset that sums three or more differently-tuned oscillators into one
     * node makes every export unreproducible, whether those oscillators are a hi-hat's metal cluster
     * or a bell's partial bank. Adding the whole `DEFAULT_SYNTH_PRESETS` table is what makes "the
     * next 'add another partial for richness' change" — the phrase in this file's own doc — actually
     * fail here rather than in an export diff.
     */
    ...Object.entries(DEFAULT_SYNTH_PRESETS).map(
      ([key, preset]): [string, (c: BaseAudioContext, d: AudioNode, b: AudioBuffer) => unknown] => [
        `preset ${key}`,
        (c, d) => playPolySynthNote(c, d, 57, 0, 0.4, 1, preset),
      ]
    ),
  ];

  for (const [label, build] of cases) {
    it(`${label} keeps every fan-in at two or fewer`, () => {
      const problems = voilationsFor(build, label);
      expect(problems, problems.join("\n")).toEqual([]);
    });
  }

  it("checks a voice for every published percussion model, kick preset and synth preset", () => {
    // Guards the loops above: a spec added without being exercised would make this whole file pass
    // by covering less than it claims. The preset count is in here because the melodic table is the
    // one that grows.
    expect(PERCUSSION_MODEL_IDS.length).toBeGreaterThan(10);
    expect(KICK_PRESETS.length).toBeGreaterThan(1);
    expect(cases.length).toBeGreaterThan(30 + Object.keys(DEFAULT_SYNTH_PRESETS).length - 1);
  });

  it("would catch a three-oscillator fan-in if one appeared", () => {
    /**
     * The rule is only evidence if it can fail. Build the shape it forbids by hand — three
     * oscillators at different frequencies into one gain — and require the walker to report it.
     * (This is also exactly the mistake the bell's partial bank invites: fanning six partials into
     * one node instead of into a tree.)
     */
    const ctx = new FakeOfflineAudioContext(1, 4096, 44100);
    const sum = ctx.createGain();
    for (const hz of [220, 262, 330]) {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(hz, 0);
      osc.connect(sum);
    }
    const violations = crowdedNodes(ctx);
    expect(violations).toHaveLength(1);
    expect(violations[0].distinct).toBe(3);
  });

  restore();
});
