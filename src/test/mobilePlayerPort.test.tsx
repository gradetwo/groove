/**
 * The ported full-screen player.
 *
 * Two halves, and the split is the point of the port.
 *
 * The first half tests the record's *look* as arithmetic — the energy envelopes that make it pulse, the
 * glow mix, the tempo damper, the label's band geometry, the arm's jitter. In `player2.html` all of
 * that lived inside a `requestAnimationFrame` callback and could only be checked by eye; here it is
 * pure, so "the disc does not pulse twice as fast on a 120 Hz phone" is an assertion rather than a
 * hope.
 *
 * The second half tests the screen's contract with the shell: the record carries two gestures (a drag
 * jogs the tempo, a tap opens the genre's page) and they must not fire each other; the tempo buttons
 * repeat while held; the progress rail and the beat slaves are driven from the transport; the
 * pull-down list switches genres without leaving the player.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { ALL_GENRES } from "../data/genres";
import { MobilePlayerScreen } from "../mobile/screens/MobilePlayerScreen";
import type { Genre } from "../types/genre";
import {
  beatSeconds,
  createEnergy,
  dampBpm,
  decayEnergy,
  discRotation,
  fireStep,
  glowTarget,
  labelArtIndex,
  LABEL_BANDS,
  LABEL_BASS_RADIUS,
  LAYER_COLORS,
  NEEDLE_ANGLE,
  mixGlow,
  tonearmHeadHop,
  tonearmTheta,
} from "../mobile/vinyl/vinylMath";
import { LABEL_ART, labelCacheKey } from "../mobile/vinyl/vinylTexture";

const GENRE = ALL_GENRES.find((genre) => genre.id === "deep-house") ?? ALL_GENRES[0];

/** Four lanes: kick on 1 and 3, snare on 2 and 4, hats on every offbeat, bass on the first step. */
const LANES: boolean[][] = [
  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0].map(Boolean),
  [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0].map(Boolean),
  [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0].map(Boolean),
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0].map(Boolean),
];

const emptyLanes = () => [0, 1, 2, 3].map(() => new Array(16).fill(false) as boolean[]);

describe("the record's look, as maths", () => {
  it("fires only the lanes that are on for the step, and the kick is what punches", () => {
    const quiet = fireStep(createEnergy(), LANES, 0);
    expect(quiet.layers.kick).toBe(1);
    expect(quiet.layers.snare).toBe(0);
    expect(quiet.layers.hat).toBe(0);
    expect(quiet.layers.bass).toBe(1);
    expect(quiet.kick).toBe(1);
    expect(quiet.headKick).toBe(1);

    // Step 2 is a hat-only step: the kick's punch envelope must stay untouched.
    const hatOnly = fireStep(quiet, LANES, 2);
    expect(hatOnly.layers.hat).toBe(1);
    expect(hatOnly.kick).toBe(quiet.kick);
    expect(hatOnly.headKick).toBe(quiet.headKick);

    // …and a step with nothing on it fires nothing.
    const off = fireStep(quiet, emptyLanes(), 5);
    expect(off.layers).toEqual(quiet.layers);
  });

  it("decays the same amount over the same wall-clock time at 60 Hz and at 120 Hz", () => {
    /**
     * The reference multiplies by a fixed factor *per frame* (`steps *= .9`), so on a 120 Hz screen its
     * tails are half as long. This is the assertion that the port is not carrying that bug: two 16.7 ms
     * frames and one 33.4 ms frame have to agree.
     */
    const start = fireStep(createEnergy(), LANES, 0);
    const at60 = decayEnergy(decayEnergy(start, 16.7), 16.7);
    const at120 = decayEnergy(start, 33.4);
    expect(at120.steps.kick[0]).toBeCloseTo(at60.steps.kick[0], 6);
    expect(at120.kick).toBeCloseTo(at60.kick, 6);
    expect(at120.layers.kick).toBeCloseTo(at60.layers.kick, 6);
    expect(at120.needleFlash).toBeCloseTo(at60.needleFlash, 6);
  });

  it("never decays past zero, and burns out a pulse in about a second", () => {
    /**
     * Two envelopes with two jobs, so two speeds. The per-step impulse is the flash on the dot and dies
     * in a couple of hundred milliseconds (`* .9` per frame); the per-lane envelope is the glow, which
     * the reference damps much more slowly (`exp(-dt * 2.1)`, a ~480 ms constant) so the record keeps a
     * tint of what just played instead of strobing.
     */
    let energy = fireStep(createEnergy(), LANES, 0);
    for (let i = 0; i < 120; i += 1) energy = decayEnergy(energy, 16.7);
    expect(energy.steps.kick[0]).toBeGreaterThanOrEqual(0);
    expect(energy.steps.kick[0]).toBeLessThan(0.001);
    expect(energy.kick).toBeLessThan(0.001);
    expect(energy.layers.kick).toBeLessThan(0.02);
    expect(energy.layers.kick).toBeGreaterThan(0);

    // Half a second in, the flash is gone but the glow has not faded yet.
    let midway = fireStep(createEnergy(), LANES, 0);
    for (let i = 0; i < 30; i += 1) midway = decayEnergy(midway, 16.7);
    expect(midway.steps.kick[0]).toBeLessThan(0.05);
    expect(midway.layers.kick).toBeGreaterThan(0.3);
  });

  it("mixes the glow from whatever is ringing, falling back to the accent when nothing is", () => {
    const bias = { r: 10, g: 20, b: 30 };
    expect(glowTarget(createEnergy(), bias)).toEqual(bias);

    const hatOnly = fireStep(createEnergy(), LANES, 2);
    const target = glowTarget(hatOnly, bias);
    expect(Math.round(target.g)).toBe(LAYER_COLORS.hat.g);
    expect(Math.round(target.r)).toBe(LAYER_COLORS.hat.r);

    // A kick plus a hat lands between the two instrument colours, weighted by their envelopes.
    const both = fireStep(hatOnly, LANES, 0);
    const mixed = glowTarget(both, bias);
    expect(mixed.r).toBeGreaterThan(LAYER_COLORS.hat.r);
    expect(mixed.b).toBeLessThan(LAYER_COLORS.hat.b);
  });

  it("eases the glow toward its target instead of snapping", () => {
    const target = { r: 255, g: 0, b: 0 };
    const once = mixGlow({ r: 0, g: 0, b: 0 }, target, 16.7);
    expect(once.r).toBeGreaterThan(0);
    expect(once.r).toBeLessThan(target.r);

    // It is a slow chase on purpose (~310 ms constant), so it converges over a second, not instantly.
    let colour = { r: 0, g: 0, b: 0 };
    let previous = 0;
    for (let i = 0; i < 120; i += 1) {
      colour = mixGlow(colour, target, 16.7);
      expect(colour.r).toBeGreaterThanOrEqual(previous);
      previous = colour.r;
    }
    expect(colour.r).toBeGreaterThan(250);
    expect(colour.r).toBeLessThanOrEqual(255);
  });

  it("damps the displayed tempo toward the engine's, then lands exactly on it", () => {
    const eased = dampBpm(122, 132, 16.7);
    expect(eased).toBeGreaterThan(122);
    expect(eased).toBeLessThan(132);
    // The reference's damper is `1 - exp(-dt/130)`; one frame moves it about an eighth of the way.
    expect(eased).toBeCloseTo(122 + 10 * (1 - Math.exp(-16.7 / 130)), 6);
    // Within the epsilon it is not a limit: it is the target.
    expect(dampBpm(131.99, 132, 16.7)).toBe(132);
    expect(beatSeconds(120)).toBeCloseTo(0.5, 6);
  });

  it("gives a genre a stable label artwork, and different genres different ones", () => {
    expect(labelArtIndex("deep-house", LABEL_ART.length)).toBe(labelArtIndex("deep-house", LABEL_ART.length));
    const used = new Set(ALL_GENRES.map((genre) => labelArtIndex(genre.id, LABEL_ART.length)));
    expect(used.size).toBe(LABEL_ART.length);
    for (const index of used) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(LABEL_ART.length);
    }
    // A zero-size (or empty) artwork set must not divide by zero.
    expect(labelArtIndex("deep-house", 0)).toBe(0);
  });

  it("prints the label's step bands inside the label, outer ring first", () => {
    expect(LABEL_BANDS.map((band) => band.key)).toEqual(["hat", "kick", "snare"]);
    for (const band of LABEL_BANDS) {
      expect(band.from).toBeGreaterThan(band.to);
      expect(band.to).toBeGreaterThan(LABEL_BASS_RADIUS);
      expect(band.from).toBeLessThan(1);
    }
    // The kick's band is the thick one, and the label's cache key must notice a pattern change.
    expect(LABEL_BANDS[1].width).toBeGreaterThan(LABEL_BANDS[0].width);
    const spec = { title: "A", subtitle: "B", footer: "C", lanes: LANES, art: LABEL_ART[0], accent: "#fff" };
    expect(labelCacheKey(spec)).toBe(labelCacheKey({ ...spec }));
    const changed = [...LANES];
    changed[0] = [...LANES[0]];
    changed[0][1] = true;
    expect(labelCacheKey({ ...spec, lanes: changed })).not.toBe(labelCacheKey(spec));
  });

  it("keeps the arm still when the record is stopped, and lets the kick bounce the head", () => {
    const still = tonearmTheta(1, {
      playing: false,
      headKick: 1,
      kick: 1,
      hat: 1,
      scrubVelocity: 0,
      dragVelocity: 0,
      timeMs: 500,
    });
    expect(still).toBeCloseTo(0.21, 6);

    const chattering = tonearmTheta(1, {
      playing: true,
      headKick: 0.8,
      kick: 0.5,
      hat: 0.7,
      scrubVelocity: 0,
      dragVelocity: 0,
      timeMs: 500,
    });
    expect(Math.abs(chattering - 0.21)).toBeGreaterThan(0);

    // At rest (travel 0) the offsets are gated out entirely, so the cradle is quiet.
    const atRest = tonearmTheta(0, {
      playing: true,
      headKick: 1,
      kick: 1,
      hat: 1,
      scrubVelocity: 0,
      dragVelocity: 0,
      timeMs: 500,
    });
    expect(atRest).toBeCloseTo(0, 6);

    expect(tonearmHeadHop(1, 1)).toBeCloseTo(1.6, 6);
    expect(tonearmHeadHop(1, 0)).toBe(0);
  });

  it("puts the disc angle where the reference does, needle side up", () => {
    expect(discRotation(0, 0)).toBeCloseTo(NEEDLE_ANGLE + Math.PI / 2, 6);
    expect(discRotation(16, 0) - discRotation(0, 0)).toBeCloseTo(Math.PI * 2, 6);
  });
});

/* ------------------------------------------------------------------ the screen */

const renderPlayer = (
  overrides: {
    genreId?: string;
    isPlaying?: boolean;
    readClock?: () => { step: number; fraction: number } | null;
  } = {}
) => {
  const spies = {
    onOpenDetail: vi.fn<(genreId: string) => void>(),
    onTogglePlay: vi.fn<(genre: Genre) => void>(),
    onPlayGenre: vi.fn<(genre: Genre) => void>(),
    onSkip: vi.fn<(direction: 1 | -1) => void>(),
    onCycleMode: vi.fn<() => void>(),
    onCollapse: vi.fn<() => void>(),
    onTempo: vi.fn<(bpm: number) => void>(),
  };
  const props = {
    genreId: GENRE.id,
    isPlaying: false,
    playMode: "one" as const,
    readClock: () => ({ step: 4, fraction: 0 }),
    ...spies,
    ...overrides,
  };
  const utils = render(
    <LanguageProvider>
      {/* The shell's ground: the canvas writes its beat slaves onto the nearest `.mobile-root`. */}
      <div className="mobile-root" data-module="home">
        <MobilePlayerScreen {...props} />
      </div>
    </LanguageProvider>
  );
  return { ...utils, props, spies };
};

/** One animation frame, so the canvas loop's non-drawing work (slaves, progress) has run. */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

describe("the ported full-screen player", () => {
  beforeEach(() => {
    localStorage.setItem("groove_language", "zh");
  });

  it("tells a tap from a jog: the tap opens the genre page, the drag does not", async () => {
    const { spies } = renderPlayer();
    await screen.findByTestId("mobile-player");
    const vinyl = screen.getByTestId("mobile-vinyl");
    const record = screen.getByTestId("mobile-player-record");

    // A press that moves is the jog: the tempo follows, and the release reports the flick.
    fireEvent.pointerDown(vinyl, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(vinyl, { clientX: 160, pointerId: 1 });
    expect(spies.onTempo).toHaveBeenCalledWith(GENRE.default_bpm + 12);
    fireEvent.pointerUp(vinyl, { clientX: 160, pointerId: 1 });

    // The browser still fires a click on the button after the release; it must not navigate.
    fireEvent.click(record);
    expect(spies.onOpenDetail).not.toHaveBeenCalled();

    // A press that does not move is the tap.
    fireEvent.pointerDown(vinyl, { clientX: 200, pointerId: 2 });
    fireEvent.pointerUp(vinyl, { clientX: 200, pointerId: 2 });
    fireEvent.click(record);
    expect(spies.onOpenDetail).toHaveBeenCalledWith(GENRE.id);
  });

  it("repeats the tempo button while it is held, and steps it once on a click", async () => {
    const { spies } = renderPlayer();
    await screen.findByTestId("mobile-player");
    const up = screen.getByTestId("mobile-player-bpm-up");
    const readout = screen.getByTestId("mobile-player-bpm");

    // A plain click (keyboard, or a programmatic one) must still move it exactly one step.
    fireEvent.click(up);
    expect(readout.textContent).toContain(`${GENRE.default_bpm + 1} BPM`);
    const afterClick = spies.onTempo.mock.calls.length;

    // Held: one step immediately, then a repeat every 70 ms after the reference's 420 ms delay.
    fireEvent.pointerDown(up, { pointerId: 3 });
    expect(readout.textContent).toContain(`${GENRE.default_bpm + 2} BPM`);
    await waitFor(() => expect(spies.onTempo.mock.calls.length).toBeGreaterThan(afterClick + 1), { timeout: 1500 });

    fireEvent.pointerUp(up, { pointerId: 3 });
    const released = spies.onTempo.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(spies.onTempo.mock.calls.length).toBe(released);
  });

  it("drives the progress rail and the beat slaves from the transport", async () => {
    renderPlayer({ isPlaying: true, readClock: () => ({ step: 4, fraction: 0.5 }) });
    await screen.findByTestId("mobile-player");
    const host = document.querySelector(".mobile-root") as HTMLElement;

    await nextFrame();
    await nextFrame();
    // loopProgress(4, .5, 16) = 4.5/16 = 28.125%.
    expect(screen.getByTestId("mobile-player-progress").style.width).toBe("28.13%");
    // 122 BPM -> a 0.492 s beat; the CSS animations (play button, equaliser) ride this.
    expect(host.style.getPropertyValue("--bpmBeat")).toMatch(/^0\.49/);
    expect(Number(host.style.getPropertyValue("--breath"))).toBeGreaterThanOrEqual(0);
    expect(host.style.getPropertyValue("--kick")).not.toBe("");
  });

  it("says what the record is doing: idle, then dropping the needle, then playing", async () => {
    const { rerender } = render(
      <LanguageProvider>
        <div className="mobile-root" data-module="home">
          <MobilePlayerScreen
            genreId={GENRE.id}
            isPlaying={false}
            playMode="one"
            readClock={() => ({ step: 0, fraction: 0 })}
            onTogglePlay={vi.fn()}
            onCycleMode={vi.fn()}
            onSkip={vi.fn()}
            onCollapse={vi.fn()}
            onOpenDetail={vi.fn()}
          />
        </div>
      </LanguageProvider>
    );
    expect(screen.getByTestId("mobile-player-status").textContent).toBe("待机");

    rerender(
      <LanguageProvider>
        <div className="mobile-root" data-module="home">
          <MobilePlayerScreen
            genreId={GENRE.id}
            isPlaying
            playMode="one"
            readClock={() => ({ step: 0, fraction: 0 })}
            onTogglePlay={vi.fn()}
            onCycleMode={vi.fn()}
            onSkip={vi.fn()}
            onCollapse={vi.fn()}
            onOpenDetail={vi.fn()}
          />
        </div>
      </LanguageProvider>
    );
    // The reference holds "落针…" for the 0.55 s the needle takes to travel.
    await waitFor(() => expect(screen.getByTestId("mobile-player-status").textContent).toBe("落针…"));
    await waitFor(() => expect(screen.getByTestId("mobile-player-status").textContent).toBe("播放中"), {
      timeout: 2000,
    });
  });

  it("swaps the transport's icons from the playing state, without unmounting either", async () => {
    const { container, rerender } = render(
      <LanguageProvider>
        <div className="mobile-root" data-module="home">
          <MobilePlayerScreen
            genreId={GENRE.id}
            isPlaying={false}
            playMode="one"
            readClock={() => null}
            onTogglePlay={vi.fn()}
            onCycleMode={vi.fn()}
            onSkip={vi.fn()}
            onCollapse={vi.fn()}
            onOpenDetail={vi.fn()}
          />
        </div>
      </LanguageProvider>
    );
    const player = screen.getByTestId("mobile-player");
    expect(player.getAttribute("data-playing")).toBe("false");
    expect(container.querySelectorAll(".m-ic-play")).toHaveLength(1);
    expect(container.querySelectorAll(".m-ic-pause")).toHaveLength(1);

    rerender(
      <LanguageProvider>
        <div className="mobile-root" data-module="home">
          <MobilePlayerScreen
            genreId={GENRE.id}
            isPlaying
            playMode="one"
            readClock={() => null}
            onTogglePlay={vi.fn()}
            onCycleMode={vi.fn()}
            onSkip={vi.fn()}
            onCollapse={vi.fn()}
            onOpenDetail={vi.fn()}
          />
        </div>
      </LanguageProvider>
    );
    expect(screen.getByTestId("mobile-player").getAttribute("data-playing")).toBe("true");
  });

  it("switches genre from the pull-down list without leaving the player", async () => {
    const { spies } = renderPlayer();
    await screen.findByTestId("mobile-player");
    const panel = screen.getByTestId("mobile-player-drawer-panel");
    expect(panel.className).not.toContain("is-open");

    fireEvent.click(screen.getByTestId("mobile-player-drawer-toggle"));
    expect(screen.getByTestId("mobile-player-drawer-panel").className).toContain("is-open");

    // The list leads with the genre's own category, and marks the row that is playing.
    const rows = [...document.querySelectorAll('[data-testid^="mobile-player-cue-"]')] as HTMLElement[];
    expect(rows.length).toBeGreaterThan(1);
    const current = screen.getByTestId(`mobile-player-cue-${GENRE.id}`);
    expect(current.getAttribute("aria-current")).toBe("true");
    expect(current.textContent ?? "").toContain(`${GENRE.default_bpm} BPM`);
    expect(current.querySelectorAll(".m-eq i")).toHaveLength(3);

    // Picking another row plays it, keeps the record on screen, and shuts the list.
    const other = rows.find((row) => row !== current) as HTMLElement;
    fireEvent.click(other);
    expect(spies.onPlayGenre).toHaveBeenCalledTimes(1);
    expect(spies.onOpenDetail).not.toHaveBeenCalled();
    expect(screen.getByTestId("mobile-player")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-player-drawer-panel").className).not.toContain("is-open");

    // Tapping the row that is already playing is a no-op rather than a restart.
    fireEvent.click(screen.getByTestId("mobile-player-drawer-toggle"));
    fireEvent.click(screen.getByTestId(`mobile-player-cue-${GENRE.id}`));
    expect(spies.onPlayGenre).toHaveBeenCalledTimes(1);
  });

  it("offers the reference's controls, and the chevron collapses the screen", async () => {
    const { spies } = renderPlayer();
    await screen.findByTestId("mobile-player");

    for (const testid of [
      "mobile-player-collapse",
      "mobile-player-mode",
      "mobile-player-skip-back",
      "mobile-player-play",
      "mobile-player-skip-forward",
      "mobile-player-drawer-toggle",
      "mobile-player-bpm-down",
      "mobile-player-bpm-up",
      "mobile-player-scrub-hint",
    ]) {
      expect(screen.getByTestId(testid)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByTestId("mobile-player-collapse"));
    expect(spies.onCollapse).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("mobile-player-skip-forward"));
    expect(spies.onSkip).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByTestId("mobile-player-mode"));
    expect(spies.onCycleMode).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("mobile-player-play"));
    expect(spies.onTogglePlay).toHaveBeenCalledWith(expect.objectContaining({ id: GENRE.id }));
  });

  it("says so, with a way out, when the route names a genre that is not in the library", async () => {
    const { spies } = renderPlayer({ genreId: "not-a-genre" });
    fireEvent.click(await screen.findByTestId("mobile-player-collapse"));
    expect(spies.onCollapse).toHaveBeenCalledTimes(1);
  });
});
