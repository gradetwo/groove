/**
 * ⭐ **A preview must not be a change to the project.**
 *
 * The factory library became choosable in v2.47.0, and choosing among 120 sounds by name alone is how somebody ends up
 * auditioning by *applying* each one and undoing. So a preview. The design question is not "how do I make a note" but
 * **whose voice it uses**, and that is what this file pins:
 *
 *   - ⚠️ **It must not borrow a track's host.** The pool's hosts are per track and `tryPlay` deliberately does not compare
 *     destinations — its own comment says a caller asking for a different one *"audition → master"* must not cost the live
 *     host its life — so reusing a lane's slot would push the previewed patch into the voice the lane is playing through.
 *     The preview would then be audible **as a change to the project**, which is the opposite of a preview. The criterion
 *     therefore asserts the preview's pool contains **only its own slot**;
 *   - **it has to report when nothing sounded.** `tryPlay` returns `false` when routing is off or no patch matches the role,
 *     and a preview button that silently does nothing is the "looks like it works" control this project refuses;
 *   - **it must not stack.** Auditioning 120 presets means pressing quickly; held notes would build a chord nobody asked for.
 *
 * The host factory is injectable (`Gs1VoicePoolOptions.createHost`), so this judges the preview's own logic rather than the
 * browser's Web Audio — the same reason the rest of the audio suite injects its seams.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Gs1PresetPreview } from "../audio/gs1/Gs1PresetPreview";
import { setGs1RoutingEnabled, DEFAULT_GS1_ROUTING_ENABLED } from "../audio/gs1/gs1Tracks";
import { synthPresetById } from "../data/synthPresets.generated";

/**
 * A host stub with only what the pool touches: `ready`, `output.connect`, `dispose`, `onAnalysis`, and the latency it reads
 * to schedule notes. Recording the parameter writes is what lets a case assert *which patch* a voice was given.
 */
const makeHost = () => {
  const host = {
    ready: Promise.resolve(true),
    output: { connect: vi.fn(), disconnect: vi.fn() },
    dispose: vi.fn(),
    onAnalysis: vi.fn(),
    scheduledNoteLatencyFrames: 0,
    /**
     * ⭐ **The methods the pool actually calls**, enumerated from `Gs1VoicePool` rather than guessed: `noteOnAt`,
     * `noteOffAt`, `importSample` and `onAnalysis` are its surface, plus `setPatch`/`setModRoute` for the patch and
     * `allNotesOff` for a release. A stub missing one makes `tryPlay` throw, the pool swallow it, and `false` come back —
     * which reads exactly like "the preview cannot sound", so the enumeration is the honest way to build it.
     */
    noteOnAt: vi.fn(),
    noteOffAt: vi.fn(),
    allNotesOff: vi.fn(),
    importSample: vi.fn(),
    setPatch: vi.fn(),
    setParam: vi.fn(),
    /** The routing writer. `applyGs1VoiceRoutes` writes all eight slots on any patch swap, which is why it is here. */
    setModRoute: vi.fn(),
    setSample: vi.fn(),
  };
  return host;
};

/** A context with only what the pool reads before a host exists. */
const fakeContext = () => ({ sampleRate: 48000, currentTime: 0 }) as unknown as BaseAudioContext;
const fakeDest = () => ({ connect: vi.fn(), disconnect: vi.fn() }) as unknown as AudioNode;

const CODE = synthPresetById("catlead")!.shareCode;

beforeEach(() => {
  setGs1RoutingEnabled(DEFAULT_GS1_ROUTING_ENABLED);
});

describe("Gs1PresetPreview", () => {
  it("⭐ sounds the patch on a pool of its own, holding exactly one slot", async () => {
    const hosts: ReturnType<typeof makeHost>[] = [];
    const preview = new Gs1PresetPreview({
      context: fakeContext(),
      dest: fakeDest(),
      createHost: (() => {
        const host = makeHost();
        hosts.push(host);
        return host;
      }) as never,
    });

    const outcome = await preview.play(CODE);
    expect(outcome.sounded, outcome.problem ?? "it should have sounded").toBe(true);
    expect(hosts, "one preview host").toHaveLength(1);
    // ⭐ The pool is private to the preview, and the slot is not a track index — so no lane's voice can be the one playing.
    const status = (preview as unknown as { pool: { status: () => Array<{ trackIdx: number }> } }).pool.status();
    expect(status.map((row) => row.trackIdx), "only the preview slot, never a lane's").toEqual([-1]);
    preview.dispose();
  });

  it("⚠️ refuses a string that is not a share code, and says so rather than going silent", async () => {
    const preview = new Gs1PresetPreview({ context: fakeContext(), dest: fakeDest(), createHost: (() => makeHost()) as never });
    const outcome = await preview.play("hello");
    expect(outcome.sounded).toBe(false);
    // The format is named, because "it did not sound" sends a person looking at their speakers.
    expect(outcome.problem).toMatch(/gs1\.1\./);
    preview.dispose();
  });

  it("⭐ reports that nothing sounded when GS-1 routing is off, instead of faking a success", async () => {
    setGs1RoutingEnabled(false);
    const preview = new Gs1PresetPreview({ context: fakeContext(), dest: fakeDest(), createHost: (() => makeHost()) as never });
    const outcome = await preview.play(CODE);
    expect(outcome.sounded).toBe(false);
    expect(outcome.problem, "the reason is a sentence a UI can show").toBeTruthy();
    preview.dispose();
    setGs1RoutingEnabled(DEFAULT_GS1_ROUTING_ENABLED);
  });

  it("⭐ releases the previous note before the next, so auditioning fast cannot stack a chord", async () => {
    const hosts: ReturnType<typeof makeHost>[] = [];
    const preview = new Gs1PresetPreview({
      context: fakeContext(),
      dest: fakeDest(),
      createHost: (() => {
        const host = makeHost();
        hosts.push(host);
        return host;
      }) as never,
    });
    await preview.play(CODE);
    const releasesAfterFirst = hosts[0]!.allNotesOff.mock.calls.length;
    await preview.play(synthPresetById("dxepiano")!.shareCode);
    // `releaseAll` reaches the host, so the second press silences the first — a held note would build a chord.
    expect(hosts[0]!.allNotesOff.mock.calls.length).toBeGreaterThan(releasesAfterFirst);

    // And an explicit stop does the same without tearing the yard down, so the next press does not repay the load.
    preview.stop();
    const hostsBefore = hosts.length;
    await preview.play(CODE);
    expect(hosts.length, "the yard is reused, not rebuilt per press").toBe(hostsBefore);
    preview.dispose();
  });

  it("⭐ is disposed once, and refuses to play afterwards rather than resurrecting a host", async () => {
    const host = makeHost();
    const preview = new Gs1PresetPreview({ context: fakeContext(), dest: fakeDest(), createHost: (() => host) as never });
    await preview.play(CODE);
    preview.dispose();
    expect(host.dispose, "the voice is torn down").toHaveBeenCalled();
    // Idempotent: closing twice is not an error.
    expect(() => preview.dispose()).not.toThrow();
    const after = await preview.play(CODE);
    expect(after.sounded, "a closed preview does not play").toBe(false);
  });
});
