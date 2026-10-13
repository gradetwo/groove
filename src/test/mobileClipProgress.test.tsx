import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { MobileClipPlayer } from "../mobile/MobileClipPlayer";

/**
 * ⭐ **The phone clip player's position rail is the element's own clock, and every reading here is a mapping.**
 *
 * A progress bar is easy to fake: a timer, a CSS animation, or a constant would all *look* right in a screenshot. What is
 * asserted instead is the ratio `currentTime / duration` read from a real jsdom `<audio>` whose two media properties are
 * doubled — the position event is fired by hand, and the wall clock never enters the assertion. Three mappings are pinned:
 *
 *   - `timeupdate` / `loadedmetadata` → `aria-valuenow` and the fill's `scaleX`, with `NaN`/`0` duration meaning 0;
 *   - a press at a horizontal fraction → `audio.currentTime`, clamped to `[0, duration]` at both ends;
 *   - a new clip (or an autoplay restart) → 0 again.
 *
 * `duration` and `currentTime` are own properties on the instance rather than prototype methods: jsdom's media element has
 * no duration and its `currentTime` is not the thing under test, so the clock is the *input* this file controls.
 */
const hoisted = vi.hoisted(() => ({
  clip: {
    genreId: "chicago-house",
    url: "https://r2mirror.groove.wangda.today/clips/chicago-house.mp3",
    seconds: 16.6,
    bytes: 400030,
    engineVersion: "2.36.3",
    recordedLanes: 6,
    warnings: [],
  },
  other: {
    genreId: "bebop",
    url: "https://r2mirror.groove.wangda.today/clips/bebop.mp3",
    seconds: 12,
    bytes: 300000,
    engineVersion: "2.36.3",
    recordedLanes: 6,
    warnings: [],
  },
}));

vi.mock("../data/genreClips", () => ({
  readClipManifest: () => ({ bars: 8, clips: [] }),
  clipForGenre: (_manifest: unknown, genreId: string) => (genreId === "bebop" ? hoisted.other : hoisted.clip),
  staleClips: () => [],
}));

const playMock = vi.fn(async () => undefined);

beforeEach(() => {
  cleanup();
  playMock.mockClear();
  // The player fetches its manifest itself; the *reader* is mocked, but the request still has to settle or the loading
  // branch never yields a rail (the same reason the sibling clip tests stub it).
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ bars: 8, clips: [] }) })));
  HTMLMediaElement.prototype.play = playMock as unknown as HTMLMediaElement["play"];
  HTMLMediaElement.prototype.pause = vi.fn() as unknown as HTMLMediaElement["pause"];
});

afterEach(() => vi.unstubAllGlobals());

type Clock = { currentTime: number; duration: number };

/** Give the rendered `<audio>` the two properties the rail reads, as the element's real clock would. */
function armClock(audio: HTMLAudioElement): Clock {
  const clock: Clock = { currentTime: 0, duration: Number.NaN };
  Object.defineProperty(audio, "duration", { configurable: true, get: () => clock.duration });
  Object.defineProperty(audio, "currentTime", {
    configurable: true,
    get: () => clock.currentTime,
    set: (value: number) => {
      clock.currentTime = value;
    },
  });
  return clock;
}

/** The rail's geometry, which jsdom reports as all-zeroes: a rail 200 px wide starting at x = 100. */
function placeRail(rail: HTMLElement, left: number, width: number): void {
  rail.getBoundingClientRect = () =>
    ({ left, top: 0, right: left + width, bottom: 44, width, height: 44, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
}

async function mountPlayer(genreId = "chicago-house", autoPlay = false) {
  const view = render(
    <LanguageProvider>
      <MobileClipPlayer genreId={genreId} autoPlay={autoPlay} />
    </LanguageProvider>
  );
  const rail = await waitFor(
    () => {
      const found = view.container.querySelector<HTMLElement>("[data-testid='mobile-clip-progress']");
      if (!found) throw new Error("the rail has not rendered yet");
      return found;
    },
    { timeout: 6000 }
  );
  const audio = view.container.querySelector<HTMLAudioElement>("[data-testid='mobile-clip-player'] audio");
  if (!audio) throw new Error("the player's audio element is missing");
  const fill = rail.querySelector<HTMLElement>("[data-testid='mobile-clip-progress-fill']");
  if (!fill) throw new Error("the rail's fill is missing");
  return { view, rail, fill, audio, clock: armClock(audio) };
}

describe("the phone clip player's position rail", () => {
  it("⭐ reports the element's own position as the ratio, in both the accessible value and the fill", async () => {
    const { rail, fill, audio, clock } = await mountPlayer();
    clock.duration = 200;
    clock.currentTime = 50;
    fireEvent.timeUpdate(audio);
    expect(rail.getAttribute("aria-valuenow"), "50 s of a 200 s clip is 25 %").toBe("25");
    expect(fill.style.transform, "and the fill is the same ratio, as a compositor transform").toBe("scaleX(0.25)");
  });

  it("⭐ takes the ratio from metadata too, and shows 0 rather than NaN before a duration exists", async () => {
    const { rail, audio, clock } = await mountPlayer();
    fireEvent.timeUpdate(audio);
    expect(rail.getAttribute("aria-valuenow"), "no duration yet: nothing to divide").toBe("0");
    clock.duration = 0;
    fireEvent.timeUpdate(audio);
    expect(rail.getAttribute("aria-valuenow"), "a zero duration must not divide either").toBe("0");
    clock.duration = 200;
    clock.currentTime = 100;
    fireEvent.loadedMetadata(audio);
    expect(rail.getAttribute("aria-valuenow"), "loadedmetadata is the same mapping").toBe("50");
  });

  it("⭐ clamps the ratio to 0–100 % when the element reports past either end", async () => {
    const { rail, audio, clock } = await mountPlayer();
    clock.duration = 200;
    clock.currentTime = 300;
    fireEvent.timeUpdate(audio);
    expect(rail.getAttribute("aria-valuenow"), "past the end is 100 %, not 150").toBe("100");
    clock.currentTime = -10;
    fireEvent.timeUpdate(audio);
    expect(rail.getAttribute("aria-valuenow"), "before the start is 0 %").toBe("0");
  });

  it("⭐ seeks to the fraction of the track that was pressed", async () => {
    const { rail, clock } = await mountPlayer();
    clock.duration = 200;
    placeRail(rail, 100, 200);
    fireEvent.click(rail, { clientX: 200 });
    expect(clock.currentTime, "the midpoint of the rail is half the clip").toBe(100);
    expect(rail.getAttribute("aria-valuenow"), "and the rail reads back the same half").toBe("50");
    fireEvent.click(rail, { clientX: 120 });
    expect(clock.currentTime, "a press a tenth of the way in is a tenth of the clip").toBe(20);
  });

  it("⭐ clamps a press beyond either end to 0 and to the duration", async () => {
    const { rail, clock } = await mountPlayer();
    clock.duration = 200;
    placeRail(rail, 100, 200);
    fireEvent.click(rail, { clientX: 400 });
    expect(clock.currentTime, "past the right edge is the end, never past it").toBe(200);
    fireEvent.click(rail, { clientX: 0 });
    expect(clock.currentTime, "before the left edge is the start, never negative").toBe(0);
    expect(rail.getAttribute("aria-valuenow"), "and the rail says so").toBe("0");
  });

  it("⭐ is operable from the keyboard, like the file's other controls", async () => {
    const { rail, clock } = await mountPlayer();
    clock.duration = 200;
    clock.currentTime = 0;
    fireEvent.keyDown(rail, { key: "ArrowRight" });
    expect(clock.currentTime, "one arrow step is 5 % of the clip").toBe(10);
    expect(rail.getAttribute("aria-valuenow")).toBe("5");
    fireEvent.keyDown(rail, { key: "End" });
    expect(clock.currentTime, "End is the end").toBe(200);
    fireEvent.keyDown(rail, { key: "Home" });
    expect(clock.currentTime, "Home is the start").toBe(0);
  });

  it("⭐ shows 0 again when the clip switches", async () => {
    const { view, rail, audio, clock } = await mountPlayer("chicago-house");
    clock.duration = 200;
    clock.currentTime = 100;
    fireEvent.timeUpdate(audio);
    expect(rail.getAttribute("aria-valuenow"), "the first clip is halfway through").toBe("50");
    view.rerender(
      <LanguageProvider>
        <MobileClipPlayer genreId="bebop" />
      </LanguageProvider>
    );
    await waitFor(() => expect(view.container.querySelector("audio")?.getAttribute("src")).toContain("bebop"), { timeout: 6000 });
    expect(rail.getAttribute("aria-valuenow"), "the new clip starts at zero").toBe("0");
  });

  it("⭐ shows 0 again when playback restarts from the top", async () => {
    const { view, rail, audio, clock } = await mountPlayer();
    clock.duration = 200;
    clock.currentTime = 150;
    fireEvent.timeUpdate(audio);
    expect(rail.getAttribute("aria-valuenow"), "three quarters of the way in").toBe("75");
    view.rerender(
      <LanguageProvider>
        <MobileClipPlayer genreId="chicago-house" autoPlay />
      </LanguageProvider>
    );
    await waitFor(() => expect(playMock).toHaveBeenCalled(), { timeout: 6000 });
    expect(rail.getAttribute("aria-valuenow"), "autoplay restarts the clip from zero").toBe("0");
  });
});

/**
 * ⭐ **A refused `play()` has to reach the host, because the host is the only thing that draws "playing".**
 *
 * Every clip surface in the shell reads its transport from `clipGenreId` (the record, the bottom bar, the elapsed
 * timer) and `clipGenreId` is set by the press, before the element has done anything. The `play()` itself happens in
 * an effect — after the manifest resolves, outside the gesture — so iOS can refuse it and a clip URL that 404s fails
 * the same way. Until `onPlayFailed` existed, the only reaction was this component's private `playing` state, so the
 * shell reported playback that was not happening, forever, with nothing on screen to say so (owner, 2026-10-13).
 *
 * The refusal is what is asserted, not the message: the host clears its own state on it.
 */
describe("a play() the browser refuses", () => {
  it("⭐ tells the host, so it can stop claiming the clip is playing", async () => {
    playMock.mockRejectedValueOnce(new DOMException("no gesture", "NotAllowedError"));
    const onPlayFailed = vi.fn();
    render(
      <LanguageProvider>
        <MobileClipPlayer genreId="chicago-house" autoPlay onPlayFailed={onPlayFailed} />
      </LanguageProvider>
    );
    await waitFor(() => expect(onPlayFailed).toHaveBeenCalledTimes(1), { timeout: 6000 });
    expect(String(onPlayFailed.mock.calls[0]?.[0]), "the reason is carried, so a surface can say why").toContain("refused");
  });

  it("⭐ stays quiet when the clip does play, so the callback is not just a second 'loading' signal", async () => {
    const onPlayFailed = vi.fn();
    render(
      <LanguageProvider>
        <MobileClipPlayer genreId="chicago-house" autoPlay onPlayFailed={onPlayFailed} />
      </LanguageProvider>
    );
    await waitFor(() => expect(playMock).toHaveBeenCalled(), { timeout: 6000 });
    expect(onPlayFailed, "a clip that started is not a failure").not.toHaveBeenCalled();
  });
});
